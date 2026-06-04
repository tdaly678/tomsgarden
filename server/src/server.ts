/**
 * Tomsgarden PartyKit room server.
 *
 * One PartyKit room == one game. The room is the single, authoritative source
 * of truth for game state. Clients connect over WebSocket, send `Join` (with an
 * optional room password + reconnection token) plus lobby/host control messages
 * and `ActionMsg` messages, and receive `JoinAck`, `StateUpdate`, `Error` and
 * `Kicked` messages back.
 *
 * Responsibilities (orchestration only — NEVER game rules):
 *   - Room lifecycle: first joiner becomes host; others join via the link.
 *   - Password validation on join.
 *   - Lobby: seats, ready status, host controls, 2-4 player count, start.
 *   - Turn management: enforce whose turn it is; reject out-of-turn actions.
 *   - Authoritative state held in Durable Object memory + persisted to storage.
 *   - On each ActionMsg: call engine.applyAction, then broadcast StateUpdate.
 *   - Reconnection: drop -> rejoin same seat via a stable player token.
 *   - Idle expiry: rooms self-destruct after inactivity using a storage alarm.
 *
 * ALL rules logic is delegated to `@tomsgarden/shared/engine`. The server never
 * computes scores or legality itself.
 */

import type * as Party from 'partykit/server';
import type {
  ClientMessage,
  GameState,
  PlayerState,
  ServerMessage,
  Action,
  RosterSeat,
} from '@tomsgarden/shared';
import {
  advanceRound,
  applyAction,
  checkWin,
  scoreFinal,
  scoreRound,
  setupGame,
  DEFAULT_CONFIG,
} from '@tomsgarden/shared/engine';
import {
  createBot,
  isBotDifficulty,
  shouldScheduleBotMove,
  botDelayMs,
  botMoveRng,
  turnKey,
  type BotDifficulty,
} from '@tomsgarden/shared/ai';

/** Hard cap on seats regardless of host config. */
const MAX_SEATS = 4;
const MIN_SEATS = 2;
const DEFAULT_SEATS = 4;

/** Input validation caps (enforced server-side; never trust the client). */
const MAX_NAME_LEN = 40;
const MAX_PASSWORD_LEN = 64;

/**
 * Length-independent string equality. Avoids leaking the password via response
 * timing. Returns true only when both strings are equal. Not a cryptographic
 * MAC, but removes the trivial early-exit timing signal of `===`.
 */
function constantTimeEquals(a: string, b: string): boolean {
  // Compare the same number of chars regardless of length to avoid a length
  // oracle; fold the length mismatch into the result rather than early-return.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * Normalize + validate a display name. Trims, rejects empty/whitespace-only,
 * caps length. Returns null when invalid.
 */
function validateName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_NAME_LEN) return null;
  return trimmed;
}

/** Idle expiry window. Rooms with no activity for this long self-destruct. */
const IDLE_EXPIRY_MS = 3 * 60 * 60 * 1000; // 3 hours

/** Storage keys for persistence across hibernation / restart. */
const K_STATE = 'state';
const K_SEATS = 'seats';
const K_CONFIG = 'config';

/**
 * Per-connection state that PartyKit serializes and restores automatically
 * across hibernation. We stash the player's identity here so a reconnecting
 * socket can be re-associated with its seat without a round-trip.
 */
interface ConnState {
  readonly playerId: string;
  readonly token: string;
}

/** A persisted seat record. Keyed by token; survives disconnects. */
interface Seat {
  readonly playerId: string;
  readonly token: string;
  seat: number;
  name: string;
  isHost: boolean;
  ready: boolean;
  /** Whether a live connection currently occupies this seat. */
  connected: boolean;
  /** Additive: this seat is a server-driven AI player (no socket). */
  isBot?: boolean;
  /** Additive: AI difficulty when isBot. */
  difficulty?: BotDifficulty;
}

interface RoomConfig {
  /** null = open room (no password). */
  password: string | null;
  maxPlayers: number;
}

/** Optional fallback password from env (host-set passwords take precedence). */
interface Env {
  ROOM_PASSWORD?: string;
}

export default class TomsgardenServer implements Party.Server {
  /** Hibernate idle connections to save resources; restored on next message. */
  readonly options = { hibernate: true };

  /** token -> Seat. The roster, independent of live socket presence. */
  private seats = new Map<string, Seat>();

  /** Authoritative game state once a game starts; null while in lobby. */
  private game: GameState | null = null;

  private config: RoomConfig = { password: null, maxPlayers: DEFAULT_SEATS };

  private loaded = false;

  constructor(readonly room: Party.Room) {}

  // -------------------------------------------------------------------------
  // Lifecycle / persistence
  // -------------------------------------------------------------------------

  /**
   * Restore persisted state from storage. Called on (re)start, before the first
   * message is handled. Guarded so it runs at most once per instance.
   */
  async onStart(): Promise<void> {
    if (this.loaded) return;
    const [state, seats, config] = await Promise.all([
      this.room.storage.get<GameState>(K_STATE),
      this.room.storage.get<Seat[]>(K_SEATS),
      this.room.storage.get<RoomConfig>(K_CONFIG),
    ]);
    if (state) this.game = state;
    if (config) this.config = config;
    if (seats) {
      // Restored seats start as disconnected; live sockets re-mark themselves.
      // Restored seats start as disconnected — except bots, which are always
      // "present" (they live in the server, not on a socket).
      for (const s of seats) this.seats.set(s.token, { ...s, connected: s.isBot === true });
    }
    this.loaded = true;
    // If the DO restarted mid-bot-turn, re-arm the bot driver. Any pending
    // pre-restart timer is gone with the old instance; the turn-key guard
    // makes re-arming safe even if it were not.
    this.maybeScheduleBotMove();
  }

  private async persist(): Promise<void> {
    await Promise.all([
      this.room.storage.put(K_STATE, this.game),
      this.room.storage.put(K_SEATS, [...this.seats.values()]),
      this.room.storage.put(K_CONFIG, this.config),
    ]);
    // Any persisted change is "activity": reset the idle expiry timer.
    await this.room.storage.setAlarm(Date.now() + IDLE_EXPIRY_MS);
  }

  /**
   * Idle expiry. Fired by the storage alarm. If nothing has touched the room
   * within the window, wipe all state so the Durable Object can be reclaimed.
   * Any persist() call pushes the alarm forward, so this only fires when truly
   * idle.
   */
  async onAlarm(): Promise<void> {
    // Notify anyone still hanging on, then tear everything down.
    for (const conn of this.room.getConnections()) {
      this.send(conn, { type: 'Kicked', reason: 'Room expired due to inactivity.' });
      try {
        conn.close(1000, 'room-expired');
      } catch {
        // ignore
      }
    }
    await this.room.storage.deleteAll();
    this.seats.clear();
    this.game = null;
    this.config = { password: null, maxPlayers: DEFAULT_SEATS };
  }

  // -------------------------------------------------------------------------
  // Connection handling
  // -------------------------------------------------------------------------

  /**
   * A socket opened. We wait for an explicit `Join` before registering the
   * player, so the password and token can be validated first. With hibernation
   * enabled, a reconnecting socket may already carry ConnState; if so, re-bind
   * it to its seat immediately and push current state.
   */
  async onConnect(conn: Party.Connection<ConnState>): Promise<void> {
    await this.onStart();
    const st = conn.state;
    if (st && this.seats.has(st.token)) {
      const seat = this.seats.get(st.token)!;
      seat.connected = true;
      this.syncGamePresence();
      this.send(conn, this.joinAck(seat));
      await this.persist();
      this.broadcastState();
    }
    // Otherwise wait for a Join message.
  }

  async onMessage(message: string, sender: Party.Connection<ConnState>): Promise<void> {
    await this.onStart();
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      this.send(sender, { type: 'Error', code: 'UNKNOWN', message: 'Malformed message; expected JSON.' });
      return;
    }

    switch (parsed.type) {
      case 'Join':
        await this.handleJoin(parsed, sender);
        return;
      case 'ConfigureRoom':
        await this.handleConfigure(parsed, sender);
        return;
      case 'SetReady':
        await this.handleSetReady(parsed.ready, sender);
        return;
      case 'StartGame':
        await this.handleStartGame(sender);
        return;
      case 'KickPlayer':
        await this.handleKick(parsed.playerId, sender);
        return;
      case 'AddBot':
        await this.handleAddBot(parsed.difficulty, sender);
        return;
      case 'RemoveBot':
        await this.handleRemoveBot(parsed.playerId, sender);
        return;
      case 'ActionMsg':
        await this.handleAction(parsed.action, sender);
        return;
      default:
        this.send(sender, { type: 'Error', code: 'UNKNOWN', message: 'Unknown message type.' });
    }
  }

  async onClose(conn: Party.Connection<ConnState>): Promise<void> {
    await this.markGone(conn);
  }

  async onError(conn: Party.Connection<ConnState>): Promise<void> {
    await this.markGone(conn);
  }

  /** Mark the seat behind a closing socket as disconnected (keep the seat). */
  private async markGone(conn: Party.Connection<ConnState>): Promise<void> {
    const st = conn.state;
    if (!st) return;
    const seat = this.seats.get(st.token);
    if (!seat) return;

    if (this.game) {
      // Mid-game: keep the seat so the player can reconnect to it.
      seat.connected = false;
    } else if (!seat.isHost) {
      // Lobby: a non-host that leaves frees its seat outright.
      this.seats.delete(st.token);
      this.reindexSeats();
    } else {
      // Host left the lobby: keep the seat reserved so they can reclaim host.
      seat.connected = false;
    }
    this.syncGamePresence();
    await this.persist();
    this.broadcastState();
  }

  // -------------------------------------------------------------------------
  // Join / reconnection
  // -------------------------------------------------------------------------

  private async handleJoin(
    msg: Extract<ClientMessage, { type: 'Join' }>,
    sender: Party.Connection<ConnState>,
  ): Promise<void> {
    // Reconnection: a known token reclaims its existing seat. This is ONLY a
    // legitimate path for a player whose socket dropped — so it is rejected if
    // the seat is still actively connected (prevents token-replay hijacking of
    // a live seat) and, on a password-protected room, still requires the
    // correct password (prevents a leaked token from being a password bypass).
    if (msg.token && this.seats.has(msg.token)) {
      const seat = this.seats.get(msg.token)!;

      // (a) Reject reconnect onto a seat that is already live. A genuine
      // reconnect only happens after the previous socket has gone (markGone
      // sets connected=false). A second holder of the token cannot take over a
      // seat that someone is actively occupying.
      if (seat.connected && this.isSeatLive(seat)) {
        this.send(sender, {
          type: 'Error',
          code: 'SEAT_OCCUPIED',
          message: 'That seat is already connected; cannot take it over.',
        });
        return;
      }

      // (b) Do not let token possession bypass the password gate. The room
      // creator (the only seat that may set the password) is exempt.
      if (!seat.isHost && this.config.password !== null) {
        if (typeof msg.password !== 'string' || !constantTimeEquals(msg.password, this.config.password)) {
          this.send(sender, { type: 'Error', code: 'BAD_PASSWORD', message: 'Incorrect room password.' });
          return;
        }
      }

      seat.connected = true;
      sender.setState({ playerId: seat.playerId, token: seat.token });
      this.syncGamePresence();
      this.send(sender, this.joinAck(seat));
      await this.persist();
      this.broadcastState();
      return;
    }

    // Server-side input validation (never trust client-side caps).
    const name = validateName(msg.playerName);
    if (name === null) {
      this.send(sender, {
        type: 'Error',
        code: 'INVALID_INPUT',
        message: `Display name must be 1-${MAX_NAME_LEN} non-blank characters.`,
      });
      return;
    }
    if (msg.maxPlayers !== undefined && !this.isValidSeatCount(msg.maxPlayers)) {
      this.send(sender, {
        type: 'Error',
        code: 'INVALID_INPUT',
        message: `maxPlayers must be an integer ${MIN_SEATS}-${MAX_SEATS}.`,
      });
      return;
    }
    if (msg.setPassword !== undefined && !this.isValidPassword(msg.setPassword)) {
      this.send(sender, {
        type: 'Error',
        code: 'INVALID_INPUT',
        message: `Password must be a string of at most ${MAX_PASSWORD_LEN} characters.`,
      });
      return;
    }
    if (msg.password !== undefined && !this.isValidPassword(msg.password)) {
      this.send(sender, {
        type: 'Error',
        code: 'INVALID_INPUT',
        message: `Password must be a string of at most ${MAX_PASSWORD_LEN} characters.`,
      });
      return;
    }

    // First host claims room config (password + seat count).
    const isFirst = this.seats.size === 0;
    if (isFirst) {
      const envPw = (this.room.env as Env).ROOM_PASSWORD;
      this.config.password =
        msg.setPassword && msg.setPassword.length > 0 ? msg.setPassword : (envPw ?? null);
      if (typeof msg.maxPlayers === 'number') {
        this.config.maxPlayers = this.clampSeats(msg.maxPlayers);
      }
    }

    // Password gate (skipped for the room creator who is setting it).
    if (!isFirst && this.config.password !== null) {
      if (typeof msg.password !== 'string' || !constantTimeEquals(msg.password, this.config.password)) {
        this.send(sender, { type: 'Error', code: 'BAD_PASSWORD', message: 'Incorrect room password.' });
        return;
      }
    }

    // No new joins once the game is in progress (only reconnects, handled above).
    if (this.game) {
      this.send(sender, {
        type: 'Error',
        code: 'GAME_IN_PROGRESS',
        message: 'Game already started; only existing players may rejoin.',
      });
      return;
    }

    if (this.seats.size >= this.config.maxPlayers) {
      this.send(sender, {
        type: 'Error',
        code: 'ROOM_FULL',
        message: `Room is full (${this.config.maxPlayers} seats).`,
      });
      return;
    }

    const token = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    const seatIndex = this.nextFreeSeatIndex();
    const seat: Seat = {
      playerId,
      token,
      seat: seatIndex,
      name: name || `Player ${seatIndex + 1}`,
      isHost: isFirst,
      ready: false,
      connected: true,
    };
    this.seats.set(token, seat);
    sender.setState({ playerId, token });

    this.send(sender, this.joinAck(seat));
    await this.persist();
    this.broadcastState();
  }

  // -------------------------------------------------------------------------
  // Lobby / host controls
  // -------------------------------------------------------------------------

  private async handleConfigure(
    msg: Extract<ClientMessage, { type: 'ConfigureRoom' }>,
    sender: Party.Connection<ConnState>,
  ): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (!seat.isHost) {
      this.send(sender, { type: 'Error', code: 'NOT_HOST', message: 'Only the host can configure the room.' });
      return;
    }
    if (this.game) {
      this.send(sender, { type: 'Error', code: 'NOT_IN_LOBBY', message: 'Cannot configure after the game has started.' });
      return;
    }
    if (msg.maxPlayers !== undefined) {
      if (!this.isValidSeatCount(msg.maxPlayers)) {
        this.send(sender, {
          type: 'Error',
          code: 'INVALID_INPUT',
          message: `maxPlayers must be an integer ${MIN_SEATS}-${MAX_SEATS}.`,
        });
        return;
      }
      const wanted = this.clampSeats(msg.maxPlayers);
      if (wanted < this.seats.size) {
        this.send(sender, {
          type: 'Error',
          code: 'BAD_CONFIG',
          message: `Cannot set ${wanted} seats; ${this.seats.size} players are already seated.`,
        });
        return;
      }
      this.config.maxPlayers = wanted;
    }
    if (msg.password !== undefined) {
      if (!this.isValidPassword(msg.password)) {
        this.send(sender, {
          type: 'Error',
          code: 'INVALID_INPUT',
          message: `Password must be a string of at most ${MAX_PASSWORD_LEN} characters.`,
        });
        return;
      }
      this.config.password = msg.password.length > 0 ? msg.password : null;
    }
    await this.persist();
    this.broadcastState();
  }

  private async handleSetReady(ready: boolean, sender: Party.Connection<ConnState>): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (this.game) {
      this.send(sender, { type: 'Error', code: 'NOT_IN_LOBBY', message: 'Ready status only applies in the lobby.' });
      return;
    }
    seat.ready = ready;
    await this.persist();
    this.broadcastState();
  }

  private async handleKick(targetPlayerId: string, sender: Party.Connection<ConnState>): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (!seat.isHost) {
      this.send(sender, { type: 'Error', code: 'NOT_HOST', message: 'Only the host can kick players.' });
      return;
    }
    if (this.game) {
      this.send(sender, { type: 'Error', code: 'NOT_IN_LOBBY', message: 'Cannot kick once the game has started.' });
      return;
    }
    const target = [...this.seats.values()].find((s) => s.playerId === targetPlayerId);
    if (!target) {
      this.send(sender, { type: 'Error', code: 'UNKNOWN_PLAYER', message: 'No such player.' });
      return;
    }
    if (target.isHost) {
      this.send(sender, { type: 'Error', code: 'BAD_CONFIG', message: 'The host cannot be kicked.' });
      return;
    }
    // Close the target's live socket(s).
    for (const conn of this.room.getConnections<ConnState>()) {
      if (conn.state?.token === target.token) {
        this.send(conn, { type: 'Kicked', reason: 'Removed from the room by the host.' });
        try {
          conn.close(1000, 'kicked');
        } catch {
          // ignore
        }
      }
    }
    this.seats.delete(target.token);
    this.reindexSeats();
    await this.persist();
    this.broadcastState();
  }

  /** Host-only, lobby-only: seat an AI player with the given difficulty. */
  private async handleAddBot(
    difficulty: unknown,
    sender: Party.Connection<ConnState>,
  ): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (!seat.isHost) {
      this.send(sender, { type: 'Error', code: 'NOT_HOST', message: 'Only the host can add an AI player.' });
      return;
    }
    if (this.game) {
      this.send(sender, { type: 'Error', code: 'NOT_IN_LOBBY', message: 'Cannot add an AI player once the game has started.' });
      return;
    }
    if (!isBotDifficulty(difficulty)) {
      this.send(sender, { type: 'Error', code: 'INVALID_INPUT', message: "AI difficulty must be 'easy', 'medium' or 'hard'." });
      return;
    }
    if (this.seats.size >= this.config.maxPlayers) {
      this.send(sender, { type: 'Error', code: 'ROOM_FULL', message: `Room is full (${this.config.maxPlayers} seats).` });
      return;
    }
    const token = `bot:${crypto.randomUUID()}`;
    const playerId = crypto.randomUUID();
    const seatIndex = this.nextFreeSeatIndex();
    const label = difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
    const botSeat: Seat = {
      playerId,
      token,
      seat: seatIndex,
      name: `Bot (${label})`,
      isHost: false,
      ready: true, // bots are always ready
      connected: true, // bots are always "present"
      isBot: true,
      difficulty,
    };
    this.seats.set(token, botSeat);
    await this.persist();
    this.broadcastState();
  }

  /** Host-only, lobby-only: remove a previously added AI player. */
  private async handleRemoveBot(
    targetPlayerId: string,
    sender: Party.Connection<ConnState>,
  ): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (!seat.isHost) {
      this.send(sender, { type: 'Error', code: 'NOT_HOST', message: 'Only the host can remove an AI player.' });
      return;
    }
    if (this.game) {
      this.send(sender, { type: 'Error', code: 'NOT_IN_LOBBY', message: 'Cannot remove an AI player once the game has started.' });
      return;
    }
    const target = [...this.seats.values()].find((s) => s.playerId === targetPlayerId);
    if (!target || !target.isBot) {
      this.send(sender, { type: 'Error', code: 'UNKNOWN_PLAYER', message: 'No such AI player.' });
      return;
    }
    this.seats.delete(target.token);
    this.reindexSeats();
    await this.persist();
    this.broadcastState();
  }

  private async handleStartGame(sender: Party.Connection<ConnState>): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (!seat.isHost) {
      this.send(sender, { type: 'Error', code: 'NOT_HOST', message: 'Only the host can start the game.' });
      return;
    }
    if (this.game) {
      this.send(sender, { type: 'Error', code: 'GAME_IN_PROGRESS', message: 'The game has already started.' });
      return;
    }
    const roster = this.orderedSeats();
    if (roster.length < MIN_SEATS) {
      this.send(sender, {
        type: 'Error',
        code: 'NOT_ENOUGH_PLAYERS',
        message: `Need at least ${MIN_SEATS} players to start.`,
      });
      return;
    }
    if (!roster.every((s) => s.ready || s.isHost)) {
      this.send(sender, { type: 'Error', code: 'NOT_READY', message: 'All players must be ready before starting.' });
      return;
    }

    // Hand off to the engine: it owns dealing/setup. The server just supplies
    // the roster (seat order) and a seed, and stores the resulting authoritative
    // EngineGameState.
    this.game = setupGame({
      roomId: this.room.id,
      players: roster.map((s) => ({ id: s.playerId, name: s.name })),
      seed: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
      startingPlayerIndex: 0,
      config: DEFAULT_CONFIG,
    });
    // Clear ready flags (no longer meaningful).
    for (const s of this.seats.values()) if (!s.isBot) s.ready = false;
    await this.persist();
    this.broadcastState();
    this.maybeScheduleBotMove();
  }

  // -------------------------------------------------------------------------
  // Gameplay
  // -------------------------------------------------------------------------

  private async handleAction(action: Action, sender: Party.Connection<ConnState>): Promise<void> {
    const seat = this.requireSeat(sender);
    if (!seat) return;
    if (!this.game) {
      this.send(sender, { type: 'Error', code: 'NOT_IN_LOBBY', message: 'No game in progress.' });
      return;
    }

    // The action must be attributed to the sender's own player id.
    if (action.playerId !== seat.playerId) {
      this.send(sender, { type: 'Error', code: 'ILLEGAL_MOVE', message: 'Action player id does not match your seat.' });
      return;
    }

    // Turn enforcement: must be this player's turn.
    const activeIdx = this.game.activePlayerIndex;
    const activeId = activeIdx === null ? null : this.game.players[activeIdx]?.id ?? null;
    if (activeId !== seat.playerId) {
      this.send(sender, { type: 'Error', code: 'NOT_YOUR_TURN', message: 'It is not your turn.' });
      return;
    }

    // Authoritative rules application. The engine validates legality + scoring;
    // the server NEVER trusts the client for outcomes.
    try {
      await this.applyAndAdvance(action);
    } catch (err) {
      this.send(sender, {
        type: 'Error',
        code: 'ILLEGAL_MOVE',
        message: err instanceof Error ? err.message : 'Illegal move.',
      });
      return;
    }
  }

  /**
   * The single authoritative action path (humans AND bots): applyAction, then
   * round scoring / advance / final scoring, persist, broadcast, and schedule
   * the next bot move if the new active player is a bot. Throws on an illegal
   * move (callers surface the error).
   */
  private async applyAndAdvance(action: Action): Promise<void> {
    if (!this.game) throw new Error('No game in progress.');
    let next: GameState = applyAction(this.game, action);

    // Phase 2 + 3: when everyone has passed the engine enters 'scoring'.
    // The server (authoritative) immediately applies round scoring and then
    // either prepares the next round or (after round 4) runs final scoring —
    // advanceRound handles both, setting phase 'drafting' or 'finished'.
    try {
      if (next.phase === 'scoring') {
        next = advanceRound(scoreRound(next));
      }
      // Defensive: ensure a win signal always resolves to final scoring.
      const winners = checkWin(next);
      if (winners && next.phase !== 'finished') {
        next = scoreFinal(next);
      }
    } catch (err) {
      // Defensive: never let scoring crash the room — but never silently
      // strand it in 'scoring' either. Log, tell clients, and force the
      // round to resolve via final scoring so play can conclude.
      console.error('round scoring/advance failed:', err);
      const errMsg: ServerMessage = {
        type: 'Error',
        code: 'SCORING_ERROR',
        message:
          'Round scoring failed unexpectedly; the game has been resolved with final scoring.',
      };
      this.room.broadcast(JSON.stringify(errMsg));
      if (next.phase === 'scoring') {
        try {
          next = scoreFinal(next);
        } catch (err2) {
          console.error('final-scoring fallback also failed:', err2);
          next = { ...next, phase: 'finished' };
        }
      }
    }

    this.game = next;
    await this.persist();
    this.broadcastState();
    this.maybeScheduleBotMove();
  }

  // -------------------------------------------------------------------------
  // Bot turn driving
  // -------------------------------------------------------------------------

  /** Player ids of all bot seats. */
  private botPlayerIds(): Set<string> {
    return new Set(
      [...this.seats.values()].filter((s) => s.isBot).map((s) => s.playerId),
    );
  }

  /**
   * The turn key the currently pending bot timer was armed for, or null when
   * no timer is pending. Double-fire / out-of-turn protection: when the timer
   * fires it recomputes `turnKey(this.game)` and no-ops unless it still
   * matches — so a stale timer (state advanced, DO restarted and re-armed,
   * duplicate scheduling) can never act.
   */
  private pendingBotKey: string | null = null;

  /** If the active player is a bot, arm a delayed move for this exact turn. */
  private maybeScheduleBotMove(): void {
    if (!this.game) return;
    const botId = shouldScheduleBotMove(this.game, this.botPlayerIds());
    if (!botId) return;

    const key = turnKey(this.game);
    if (this.pendingBotKey === key) return; // already armed for this turn
    this.pendingBotKey = key;

    const rng = botMoveRng(this.game);
    const delay = botDelayMs(rng);
    setTimeout(() => {
      void this.fireBotMove(key, botId);
    }, delay);
  }

  /** Timer body: re-validate, choose via the bot, route through applyAndAdvance. */
  private async fireBotMove(key: string, botId: string): Promise<void> {
    // Stale-timer guard (double-fire / out-of-turn protection).
    if (!this.game) return;
    if (this.pendingBotKey !== key || turnKey(this.game) !== key) return;
    const idx = this.game.activePlayerIndex;
    const activeId = idx === null ? null : this.game.players[idx]?.id ?? null;
    if (activeId !== botId) return;
    const seat = [...this.seats.values()].find((s) => s.playerId === botId);
    if (!seat?.isBot || !seat.difficulty) return;

    this.pendingBotKey = null;
    try {
      const bot = createBot(seat.difficulty);
      const action = bot.chooseAction(this.game, botId, botMoveRng(this.game));
      await this.applyAndAdvance(action);
    } catch {
      // A bot must never crash the room. As a last resort, pass.
      try {
        await this.applyAndAdvance({ type: 'Pass', playerId: botId });
      } catch {
        // ignore — humans can still play; next state change re-arms bots.
      }
    }
  }

  // -------------------------------------------------------------------------
  // State construction & broadcasting
  // -------------------------------------------------------------------------

  /** Seats in stable seat-index order. */
  private orderedSeats(): Seat[] {
    return [...this.seats.values()].sort((a, b) => a.seat - b.seat);
  }

  /**
   * Public snapshot. In lobby we synthesize a minimal-but-valid EngineGameState
   * from the seat roster (phase 'lobby', empty bag/display); mid-game we return
   * the engine-owned EngineGameState verbatim. There is no hidden information in
   * Queen's Garden, so we broadcast the full state to everyone.
   *
   * Lobby/presence metadata (connected, ready, isHost, seat) is intentionally
   * NOT part of the canonical engine model; the server tracks it in `seats` and
   * the Lobby agent surfaces it via a dedicated roster channel.
   */
  private buildState(): GameState {
    if (this.game) return this.game;
    const players: PlayerState[] = this.orderedSeats().map((s) => ({
      id: s.playerId,
      name: s.name,
      score: 0,
      spaces: [],
      placed: [],
      storage: [],
      expansionStore: [],
      passed: false,
    }));
    return {
      roomId: this.room.id,
      phase: 'lobby',
      round: 0,
      players,
      activePlayerIndex: null,
      firstPlayerIndex: 0,
      displayTiles: [],
      tower: [],
      displayExpansions: [],
      expansionStacks: [[], [], [], []],
      expansionSupply: 0,
      bag: [],
      firstPassTaken: false,
      winnerIds: [],
      rngState: 0,
      config: DEFAULT_CONFIG,
    };
  }

  /**
   * Presence is tracked in the seat roster, not in the canonical engine state,
   * so there is nothing to sync into `this.game`. Kept as a named hook so call
   * sites read clearly and the Lobby agent can extend it later.
   */
  private syncGamePresence(): void {
    /* no-op: engine state carries no presence fields */
  }

  private joinAck(seat: Seat): ServerMessage {
    return {
      type: 'JoinAck',
      playerId: seat.playerId,
      roomId: this.room.id,
      token: seat.token,
      isHost: seat.isHost,
      seat: seat.seat,
      state: this.buildState(),
    };
  }

  /**
   * Build the lobby roster snapshot. This is the dedicated presence/lobby
   * channel: seat order, ready/host/connected flags + room config that
   * intentionally do NOT live in the canonical engine GameState.
   */
  private buildRoster(): Extract<ServerMessage, { type: 'Roster' }> {
    const seats: RosterSeat[] = this.orderedSeats().map((s) => ({
      playerId: s.playerId,
      name: s.name,
      seat: s.seat,
      isHost: s.isHost,
      ready: s.ready,
      connected: s.connected,
      ...(s.isBot ? { isBot: true, difficulty: s.difficulty } : {}),
    }));
    return {
      type: 'Roster',
      roomId: this.room.id,
      seats,
      maxPlayers: this.config.maxPlayers,
      hasPassword: this.config.password !== null,
      started: this.game !== null,
    };
  }

  private send(conn: Party.Connection, msg: ServerMessage): void {
    conn.send(JSON.stringify(msg));
  }

  /** Broadcast the authoritative state AND the lobby roster to everyone. */
  private broadcastState(): void {
    const state: ServerMessage = { type: 'StateUpdate', state: this.buildState() };
    this.room.broadcast(JSON.stringify(state));
    this.room.broadcast(JSON.stringify(this.buildRoster()));
  }

  // -------------------------------------------------------------------------
  // Seat helpers
  // -------------------------------------------------------------------------

  private requireSeat(conn: Party.Connection<ConnState>): Seat | null {
    const st = conn.state;
    const seat = st ? this.seats.get(st.token) : undefined;
    if (!seat) {
      this.send(conn, { type: 'Error', code: 'UNKNOWN', message: 'You must join the room first.' });
      return null;
    }
    return seat;
  }

  /**
   * Whether a seat genuinely has a live socket attached right now. We confirm
   * against the actual open connections (not just the `connected` flag) so a
   * stale flag can never wrongly block a legitimate reconnect, and a real live
   * socket can never be silently hijacked.
   */
  private isSeatLive(seat: Seat): boolean {
    for (const conn of this.room.getConnections<ConnState>()) {
      if (conn.state?.token === seat.token) return true;
    }
    return false;
  }

  private clampSeats(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_SEATS;
    return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.floor(n)));
  }

  /** maxPlayers must be an integer within [MIN_SEATS, MAX_SEATS]. */
  private isValidSeatCount(n: unknown): n is number {
    return typeof n === 'number' && Number.isInteger(n) && n >= MIN_SEATS && n <= MAX_SEATS;
  }

  /** A password field, when present, must be a string within the length cap. */
  private isValidPassword(p: unknown): p is string {
    return typeof p === 'string' && p.length <= MAX_PASSWORD_LEN;
  }

  /** Lowest unused seat index (0-based). */
  private nextFreeSeatIndex(): number {
    const taken = new Set([...this.seats.values()].map((s) => s.seat));
    for (let i = 0; i < MAX_SEATS; i++) if (!taken.has(i)) return i;
    return this.seats.size;
  }

  /** Compact seat indices after a lobby departure so they stay 0..n-1. */
  private reindexSeats(): void {
    const ordered = this.orderedSeats();
    ordered.forEach((s, i) => {
      s.seat = i;
    });
  }
}
