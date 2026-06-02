/**
 * Tomsgarden PartyKit room server.
 *
 * One PartyKit room == one game. The room is the single source of truth for
 * game state. Clients connect over WebSocket, send `Join` (with an optional
 * room password) and `ActionMsg` messages, and receive `JoinAck`, `StateUpdate`
 * and `Error` messages back.
 *
 * The rules engine is intentionally not wired in yet (see `shared/engine`).
 * This skeleton only handles connection lifecycle, password validation,
 * presence tracking, and broadcasting a simple state.
 */

import type * as Party from 'partykit/server';
import type {
  ClientMessage,
  GameState,
  PlayerState,
  ServerMessage,
} from '@tomsgarden/shared';

const MAX_PLAYERS = 4;

/**
 * Optional per-room password. In production you'd source this from a creation
 * request or the room's storage; here it can be provided via the
 * `ROOM_PASSWORD` environment binding (leave unset for open rooms).
 */
interface Env {
  ROOM_PASSWORD?: string;
}

export default class TomsgardenServer implements Party.Server {
  /** Map of connection id -> player state. */
  private players = new Map<string, PlayerState>();

  constructor(readonly room: Party.Room) {}

  /** Build the public game state snapshot from current room contents. */
  private buildState(): GameState {
    const players = [...this.players.values()];
    return {
      roomId: this.room.id,
      phase: 'lobby',
      round: 0,
      players,
      activePlayerIndex: null,
      factories: [],
      center: [],
      bagCount: 0,
      winnerId: null,
    };
  }

  private send(conn: Party.Connection, msg: ServerMessage): void {
    conn.send(JSON.stringify(msg));
  }

  private broadcastState(): void {
    const msg: ServerMessage = { type: 'StateUpdate', state: this.buildState() };
    this.room.broadcast(JSON.stringify(msg));
  }

  /**
   * A connection has opened. We wait for an explicit `Join` message before
   * registering the player, so the password can be validated first.
   */
  onConnect(_conn: Party.Connection, _ctx: Party.ConnectionContext): void {
    // Intentionally no-op until the client sends `Join`.
  }

  onMessage(message: string, sender: Party.Connection): void {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      this.send(sender, {
        type: 'Error',
        code: 'UNKNOWN',
        message: 'Malformed message; expected JSON.',
      });
      return;
    }

    switch (parsed.type) {
      case 'Join':
        this.handleJoin(parsed.playerName, parsed.password, sender);
        return;
      case 'ActionMsg':
        // Rules engine not wired yet — acknowledge by rebroadcasting state.
        // A future revision will call applyAction() and validate the move.
        this.broadcastState();
        return;
      default:
        this.send(sender, {
          type: 'Error',
          code: 'UNKNOWN',
          message: 'Unknown message type.',
        });
    }
  }

  private handleJoin(
    playerName: string,
    password: string | undefined,
    sender: Party.Connection,
  ): void {
    const env = this.room.env as Env;
    const required = env.ROOM_PASSWORD;
    if (required && password !== required) {
      this.send(sender, {
        type: 'Error',
        code: 'BAD_PASSWORD',
        message: 'Incorrect room password.',
      });
      return;
    }

    if (this.players.size >= MAX_PLAYERS && !this.players.has(sender.id)) {
      this.send(sender, {
        type: 'Error',
        code: 'ROOM_FULL',
        message: `Room is full (max ${MAX_PLAYERS} players).`,
      });
      return;
    }

    const player: PlayerState = {
      id: sender.id,
      name: playerName || `Player ${this.players.size + 1}`,
      connected: true,
      score: 0,
      hand: [],
      board: [],
      floor: [],
    };
    this.players.set(sender.id, player);

    this.send(sender, {
      type: 'JoinAck',
      playerId: sender.id,
      roomId: this.room.id,
      state: this.buildState(),
    });
    this.broadcastState();
  }

  onClose(conn: Party.Connection): void {
    const player = this.players.get(conn.id);
    if (player) {
      // Mark as disconnected rather than removing, so a player can rejoin
      // mid-game. Lobby players are removed outright.
      this.players.set(conn.id, { ...player, connected: false });
      this.broadcastState();
    }
  }

  onError(conn: Party.Connection, _err: Error): void {
    this.onClose(conn);
  }
}
