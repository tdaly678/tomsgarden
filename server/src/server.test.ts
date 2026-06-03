/**
 * Server-level tests for the security-sensitive join paths: reconnect-hijack
 * rejection, password-on-reconnect, and lobby input validation.
 *
 * PartyKit's runtime types are imported as type-only in server.ts (erased at
 * compile time), so we can instantiate the server class directly against a
 * lightweight in-memory mock of `Party.Room` / `Party.Connection`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
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
  broadcast(_raw: string): void {
    /* no-op */
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
