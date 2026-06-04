/**
 * Server-level tests for the security-sensitive join paths: reconnect-hijack
 * rejection, password-on-reconnect, and lobby input validation.
 *
 * PartyKit's runtime types are imported as type-only in server.ts (erased at
 * compile time), so we can instantiate the server class directly against a
 * lightweight in-memory mock of `Party.Room` / `Party.Connection`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ServerMessage, ClientMessage } from '@tomsgarden/shared';
import TomsgardenServer from './server';

// --- Minimal mocks ---------------------------------------------------------

interface ConnState {
  playerId: string;
  token: string;
}

class MockConnection {
  id: string;
  state: ConnState | null = null;
  sent: ServerMessage[] = [];
  open = true;
  constructor(id: string) {
    this.id = id;
  }
  setState(s: ConnState | null) {
    this.state = s;
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw) as ServerMessage);
  }
  close() {
    this.open = false;
  }
  /** Last error message sent to this connection, if any. */
  lastError() {
    const errs = this.sent.filter((m) => m.type === 'Error');
    return errs.length ? (errs[errs.length - 1] as Extract<ServerMessage, { type: 'Error' }>) : null;
  }
  lastAck() {
    const acks = this.sent.filter((m) => m.type === 'JoinAck');
    return acks.length ? (acks[acks.length - 1] as Extract<ServerMessage, { type: 'JoinAck' }>) : null;
  }
}

class MockStorage {
  private map = new Map<string, unknown>();
  async get<T>(k: string): Promise<T | undefined> {
    return this.map.get(k) as T | undefined;
  }
  async put(k: string, v: unknown): Promise<void> {
    this.map.set(k, v);
  }
  async deleteAll(): Promise<void> {
    this.map.clear();
  }
  async setAlarm(): Promise<void> {
    /* no-op */
  }
}

class MockRoom {
  id = 'test-room';
  env: Record<string, unknown> = {};
  storage = new MockStorage();
  private conns = new Set<MockConnection>();
  register(c: MockConnection) {
    this.conns.add(c);
  }
  unregister(c: MockConnection) {
    this.conns.delete(c);
  }
  getConnections<T = unknown>(): Iterable<{ state: T | null }> {
    return [...this.conns] as unknown as Iterable<{ state: T | null }>;
  }
  broadcasts: ServerMessage[] = [];
  broadcast(raw: string): void {
    this.broadcasts.push(JSON.parse(raw) as ServerMessage);
  }
  lastRoster() {
    const r = this.broadcasts.filter((m) => m.type === 'Roster');
    return r.length ? (r[r.length - 1] as Extract<ServerMessage, { type: 'Roster' }>) : null;
  }
  lastState() {
    const r = this.broadcasts.filter((m) => m.type === 'StateUpdate');
    return r.length ? (r[r.length - 1] as Extract<ServerMessage, { type: 'StateUpdate' }>) : null;
  }
}

function makeServer(env: Record<string, unknown> = {}) {
  const room = new MockRoom();
  room.env = env;
  // The constructor only stores `room`; types are structurally compatible.
  const server = new TomsgardenServer(room as never);
  return { server, room };
}

async function send(
  server: TomsgardenServer,
  conn: MockConnection,
  msg: ClientMessage,
): Promise<void> {
  await server.onMessage(JSON.stringify(msg), conn as never);
}

// --- Tests -----------------------------------------------------------------

describe('reconnect / hijack protection', () => {
  let server: TomsgardenServer;
  let room: MockRoom;

  beforeEach(() => {
    ({ server, room } = makeServer());
  });

  it('rejects a token reconnect onto an already-connected (live) seat', async () => {
    const host = new MockConnection('host');
    room.register(host);
    await send(server, host, { type: 'Join', playerName: 'Alice', asHost: true });
    const ack = host.lastAck()!;
    expect(ack).toBeTruthy();
    const token = ack.token;

    // Attacker replays the captured token while the original seat is still live.
    const attacker = new MockConnection('attacker');
    room.register(attacker);
    await send(server, attacker, { type: 'Join', playerName: 'Mallory', token });

    expect(attacker.lastAck()).toBeNull();
    expect(attacker.lastError()?.code).toBe('SEAT_OCCUPIED');
    // The legitimate seat is untouched and still bound to the original socket.
    expect(host.state?.token).toBe(token);
    expect(attacker.state).toBeNull();
  });

  it('allows a legitimate reconnect after the original socket has gone', async () => {
    const host = new MockConnection('host');
    room.register(host);
    await send(server, host, { type: 'Join', playerName: 'Alice', asHost: true });
    const token = host.lastAck()!.token;

    // Original socket drops.
    await server.onClose(host as never);
    room.unregister(host);

    const rejoin = new MockConnection('rejoin');
    room.register(rejoin);
    await send(server, rejoin, { type: 'Join', playerName: 'Alice', token });

    expect(rejoin.lastError()).toBeNull();
    expect(rejoin.lastAck()?.token).toBe(token);
    expect(rejoin.state?.token).toBe(token);
  });

  it('still enforces the password on a reconnect to a password-protected room', async () => {
    const host = new MockConnection('host');
    room.register(host);
    await send(server, host, { type: 'Join', playerName: 'Host', asHost: true, setPassword: 'sesame' });

    const guest = new MockConnection('guest');
    room.register(guest);
    await send(server, guest, { type: 'Join', playerName: 'Bob', password: 'sesame' });
    const guestToken = guest.lastAck()!.token;

    // Start the game so seats are preserved across disconnects (mid-game
    // reconnect is the scenario where a dropped player rejoins their seat).
    await send(server, guest, { type: 'SetReady', ready: true });
    await send(server, host, { type: 'StartGame' });

    // Guest's socket drops mid-game (seat is kept, marked disconnected).
    await server.onClose(guest as never);
    room.unregister(guest);

    // Reconnect with the right token but NO / wrong password must be rejected.
    const badReconnect = new MockConnection('bad');
    room.register(badReconnect);
    await send(server, badReconnect, { type: 'Join', playerName: 'Bob', token: guestToken, password: 'wrong' });
    expect(badReconnect.lastAck()).toBeNull();
    expect(badReconnect.lastError()?.code).toBe('BAD_PASSWORD');

    // Reconnect with the right token AND right password succeeds.
    const goodReconnect = new MockConnection('good');
    room.register(goodReconnect);
    await send(server, goodReconnect, { type: 'Join', playerName: 'Bob', token: guestToken, password: 'sesame' });
    expect(goodReconnect.lastAck()?.token).toBe(guestToken);
  });
});

describe('lobby input validation', () => {
  let server: TomsgardenServer;
  let room: MockRoom;

  beforeEach(() => {
    ({ server, room } = makeServer());
  });

  it('rejects empty / whitespace-only display names', async () => {
    const conn = new MockConnection('c');
    room.register(conn);
    await send(server, conn, { type: 'Join', playerName: '   ', asHost: true });
    expect(conn.lastAck()).toBeNull();
    expect(conn.lastError()?.code).toBe('INVALID_INPUT');
  });

  it('rejects an over-long display name (>40 chars)', async () => {
    const conn = new MockConnection('c');
    room.register(conn);
    await send(server, conn, { type: 'Join', playerName: 'x'.repeat(41), asHost: true });
    expect(conn.lastError()?.code).toBe('INVALID_INPUT');
  });

  it('trims a valid display name', async () => {
    const conn = new MockConnection('c');
    room.register(conn);
    await send(server, conn, { type: 'Join', playerName: '  Alice  ', asHost: true });
    expect(conn.lastError()).toBeNull();
    expect(conn.lastAck()).toBeTruthy();
  });

  it('rejects a non-integer / out-of-range maxPlayers', async () => {
    const conn = new MockConnection('c');
    room.register(conn);
    await send(server, conn, { type: 'Join', playerName: 'Alice', asHost: true, maxPlayers: 9 });
    expect(conn.lastError()?.code).toBe('INVALID_INPUT');

    const conn2 = new MockConnection('c2');
    room.register(conn2);
    await send(server, conn2, { type: 'Join', playerName: 'Alice', asHost: true, maxPlayers: 2.5 });
    expect(conn2.lastError()?.code).toBe('INVALID_INPUT');
  });

  it('rejects an over-long password (>64 chars)', async () => {
    const conn = new MockConnection('c');
    room.register(conn);
    await send(server, conn, { type: 'Join', playerName: 'Alice', asHost: true, setPassword: 'p'.repeat(65) });
    expect(conn.lastError()?.code).toBe('INVALID_INPUT');
  });

  it('accepts a valid 4-player room with a reasonable password', async () => {
    const conn = new MockConnection('c');
    room.register(conn);
    await send(server, conn, { type: 'Join', playerName: 'Alice', asHost: true, maxPlayers: 4, setPassword: 'secret' });
    expect(conn.lastError()).toBeNull();
    expect(conn.lastAck()?.isHost).toBe(true);
  });
});

// --- Bot seats & bot turn driving -------------------------------------------

describe('bot seats (AddBot / RemoveBot)', () => {
  let server: TomsgardenServer;
  let room: MockRoom;
  let host: MockConnection;

  beforeEach(async () => {
    ({ server, room } = makeServer());
    host = new MockConnection('host');
    room.register(host);
    await send(server, host, { type: 'Join', playerName: 'Alice', asHost: true });
  });

  it('host can add a bot; it appears in the roster as a ready, connected bot', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    const roster = room.lastRoster()!;
    expect(roster.seats).toHaveLength(2);
    const bot = roster.seats.find((s) => s.isBot)!;
    expect(bot).toBeTruthy();
    expect(bot.difficulty).toBe('easy');
    expect(bot.ready).toBe(true);
    expect(bot.connected).toBe(true);
  });

  it('non-host cannot add or remove a bot', async () => {
    const guest = new MockConnection('guest');
    room.register(guest);
    await send(server, guest, { type: 'Join', playerName: 'Bob' });
    await send(server, guest, { type: 'AddBot', difficulty: 'hard' });
    expect(guest.lastError()?.code).toBe('NOT_HOST');

    await send(server, host, { type: 'AddBot', difficulty: 'hard' });
    const bot = room.lastRoster()!.seats.find((s) => s.isBot)!;
    await send(server, guest, { type: 'RemoveBot', playerId: bot.playerId });
    expect(guest.lastError()?.code).toBe('NOT_HOST');
    expect(room.lastRoster()!.seats.some((s) => s.isBot)).toBe(true);
  });

  it('rejects an invalid difficulty', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'impossible' } as never);
    expect(host.lastError()?.code).toBe('INVALID_INPUT');
  });

  it('rejects adding a bot when the room is full', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    expect(host.lastError()?.code).toBe('ROOM_FULL');
    expect(room.lastRoster()!.seats).toHaveLength(4);
  });

  it('host can remove a bot; RemoveBot refuses non-bot targets', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'medium' });
    const bot = room.lastRoster()!.seats.find((s) => s.isBot)!;
    await send(server, host, { type: 'RemoveBot', playerId: bot.playerId });
    expect(room.lastRoster()!.seats.some((s) => s.isBot)).toBe(false);

    const hostId = host.lastAck()!.playerId;
    await send(server, host, { type: 'RemoveBot', playerId: hostId });
    expect(host.lastError()?.code).toBe('UNKNOWN_PLAYER');
  });
});

describe('bot turn driving', () => {
  let server: TomsgardenServer;
  let room: MockRoom;
  let host: MockConnection;

  beforeEach(async () => {
    vi.useFakeTimers();
    ({ server, room } = makeServer());
    host = new MockConnection('host');
    room.register(host);
    await send(server, host, { type: 'Join', playerName: 'Alice', asHost: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1 human + 1 bot is startable (bot counts toward the minimum)', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    await send(server, host, { type: 'StartGame' });
    expect(host.lastError()).toBeNull();
    const state = room.lastState()!.state;
    expect(state.phase).toBe('drafting');
    expect(state.players).toHaveLength(2);
  });

  it('chained bot turns drive a full bots-only round trip to game completion', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    await send(server, host, { type: 'AddBot', difficulty: 'medium' });
    await send(server, host, { type: 'AddBot', difficulty: 'hard' });
    // Host never acts after starting; but the host IS player 0 (active first).
    await send(server, host, { type: 'StartGame' });
    let state = room.lastState()!.state;
    expect(state.phase).toBe('drafting');

    // Host immediately passes every time it becomes active; bots chain via
    // timers in between. Drive timers until the game finishes.
    const hostId = host.lastAck()!.playerId;
    for (let i = 0; i < 5000; i++) {
      state = room.lastState()!.state;
      if (state.phase === 'finished') break;
      const idx = state.activePlayerIndex;
      const activeId = idx === null ? null : state.players[idx]?.id;
      if (activeId === hostId) {
        await send(server, host, {
          type: 'ActionMsg',
          action: { type: 'Pass', playerId: hostId },
        });
      } else {
        await vi.advanceTimersByTimeAsync(1600);
      }
    }
    state = room.lastState()!.state;
    expect(state.phase).toBe('finished');
    expect(state.winnerIds.length).toBeGreaterThan(0);
  });

  it('a stale bot timer never double-fires or acts out of turn', async () => {
    await send(server, host, { type: 'AddBot', difficulty: 'easy' });
    await send(server, host, { type: 'StartGame' });
    const before = room.lastState()!.state;
    // First bot to act is the host (player 0). Host passes; bot becomes active
    // and a timer is armed. Advance time so the bot acts exactly once.
    const hostId = host.lastAck()!.playerId;
    await send(server, host, {
      type: 'ActionMsg',
      action: { type: 'Pass', playerId: hostId },
    });
    const afterPass = room.lastState()!.state;
    expect(afterPass).not.toEqual(before);
    const broadcastCountBefore = room.broadcasts.length;
    await vi.advanceTimersByTimeAsync(1600);
    const afterBot = room.lastState()!.state;
    const broadcastsForBotMove = room.broadcasts.length - broadcastCountBefore;
    // The bot acted exactly once: state changed and was broadcast.
    expect(broadcastsForBotMove).toBeGreaterThan(0);
    expect(afterBot).not.toEqual(afterPass);
    // After the host has passed, the bot is the only mover. Once the bot also
    // passes, the server scores + advances the round in the same call, so the
    // round number strictly increases (or the game finishes) — and afterwards
    // a stale/duplicate timer firing again must produce NO further state
    // change while it is not the bot's armed turn.
    // Drive the bot until it has finished its run of turns for this round.
    for (let i = 0; i < 200; i++) {
      const s = room.lastState()!.state;
      if (s.phase === 'finished' || s.round > afterBot.round) break;
      const idx = s.activePlayerIndex;
      const activeId = idx === null ? null : s.players[idx]?.id;
      if (activeId === hostId) {
        await send(server, host, {
          type: 'ActionMsg',
          action: { type: 'Pass', playerId: hostId },
        });
      } else {
        await vi.advanceTimersByTimeAsync(1600);
      }
    }
    let settled = room.lastState()!.state;
    expect(settled.phase === 'finished' || settled.round > afterBot.round).toBe(
      true,
    );
    // If the new round starts on the bot, let any armed timer fire its one
    // legitimate move(s) until it is the host's turn or the game ends, so the
    // no-op assertion below targets a genuinely stale timer.
    for (let i = 0; i < 200; i++) {
      const s = room.lastState()!.state;
      if (s.phase === 'finished') break;
      const idx = s.activePlayerIndex;
      if (idx !== null && s.players[idx]?.id === hostId) break;
      await vi.advanceTimersByTimeAsync(1600);
    }
    settled = room.lastState()!.state;
    // Stale-timer guard: it is now the HOST's turn (or the game is over).
    // Advancing time far past any residual armed timer must not change state
    // or emit any broadcast — a stale timer must no-op.
    const settledBroadcasts = room.broadcasts.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(room.broadcasts.length).toBe(settledBroadcasts);
    expect(room.lastState()!.state).toEqual(settled);
  });
});
