/**
 * Tomsgarden shared types.
 *
 * The canonical game domain model lives in `shared/engine/model.ts` +
 * `shared/engine/actions.ts` — a faithful, rich Queen's Garden model (hex
 * garden, storage, jokers, scoring wheel, expansions). Previously this file
 * carried a separate, thinner "wire" model that competed with the engine's; the
 * two have now been unified so the engine, server, and client all speak ONE
 * language.
 *
 * This module re-exports the engine model under the canonical domain names
 * (`GameState`, `PlayerState`, `Action`, ...) and defines only the network
 * message protocol (Join / JoinAck / StateUpdate / ActionMsg / Error / ...).
 */

import type {
  EngineGameState,
  PlayerEngineState,
} from './engine/model.js';
import type { EngineAction } from './engine/actions.js';

// ---------------------------------------------------------------------------
// Canonical game domain — re-exported from the engine (single source of truth).
// ---------------------------------------------------------------------------

export * from './engine/model.js';
export * from './engine/actions.js';

/** The authoritative game state held by the server room. */
export type GameState = EngineGameState;

/** Per-player state. */
export type PlayerState = PlayerEngineState;

/** Discriminated union of all legal player actions (engine action shape). */
export type Action = EngineAction;

/** Phases of a single game (mirrors `EngineGameState['phase']`). */
export type GamePhase = EngineGameState['phase'];

// ---------------------------------------------------------------------------
// Wire protocol: client <-> server messages. Discriminated union on `type`.
// ---------------------------------------------------------------------------

/** Client -> server: request to join a room. */
export interface JoinMessage {
  readonly type: 'Join';
  readonly playerName: string;
  /** Optional room password; required only if the room was created with one. */
  readonly password?: string;
  /**
   * Optional reconnection token. If a previously-issued token is supplied and
   * still maps to a seat in this room, the player reclaims that seat instead of
   * taking a new one. The server issues a fresh token on first join.
   */
  readonly token?: string;
  /**
   * If true, this Join also creates/claims the room as host. The first player
   * to join becomes host automatically; this flag lets a reconnecting host
   * assert host intent. Optional config the host may set on creation:
   */
  readonly asHost?: boolean;
  /** Host-only: password to set on the room at creation (first host join). */
  readonly setPassword?: string;
  /** Host-only: desired seat count (2-4) at creation. */
  readonly maxPlayers?: number;
}

/** Server -> client: acknowledges a successful join. */
export interface JoinAckMessage {
  readonly type: 'JoinAck';
  readonly playerId: string;
  readonly roomId: string;
  /** Reconnection token; persist on the client and resend on rejoin. */
  readonly token: string;
  /** True if this player is the room host. */
  readonly isHost: boolean;
  /** Seat index assigned to this player. */
  readonly seat: number;
  readonly state: GameState;
}

/** Client -> server: host sets/updates lobby configuration. */
export interface ConfigureRoomMessage {
  readonly type: 'ConfigureRoom';
  /** Desired seat count (2-4). */
  readonly maxPlayers?: number;
  /** New room password ('' clears it). */
  readonly password?: string;
}

/** Client -> server: toggle this player's ready status in the lobby. */
export interface SetReadyMessage {
  readonly type: 'SetReady';
  readonly ready: boolean;
}

/** Client -> server: host requests the game to start. */
export interface StartGameMessage {
  readonly type: 'StartGame';
}

/** Client -> server: host kicks a player from a seat (lobby only). */
export interface KickPlayerMessage {
  readonly type: 'KickPlayer';
  readonly playerId: string;
}

/** Server -> client: full authoritative state snapshot. */
export interface StateUpdateMessage {
  readonly type: 'StateUpdate';
  readonly state: GameState;
}

/** Client -> server: submit an action. */
export interface ActionMessage {
  readonly type: 'ActionMsg';
  readonly action: Action;
}

/** Server -> client: an error (bad password, illegal move, etc.). */
export interface ErrorMessage {
  readonly type: 'Error';
  readonly code:
    | 'BAD_PASSWORD'
    | 'ROOM_FULL'
    | 'ILLEGAL_MOVE'
    | 'NOT_YOUR_TURN'
    | 'NOT_HOST'
    | 'GAME_IN_PROGRESS'
    | 'NOT_IN_LOBBY'
    | 'NOT_ENOUGH_PLAYERS'
    | 'NOT_READY'
    | 'BAD_CONFIG'
    | 'UNKNOWN_PLAYER'
    | 'SEAT_OCCUPIED'
    | 'INVALID_INPUT'
    | 'UNKNOWN';
  readonly message: string;
}

/** Server -> client: a player was kicked or removed; the room closed them. */
export interface KickedMessage {
  readonly type: 'Kicked';
  readonly reason: string;
}

/**
 * A single seat in the lobby roster. Carries the presence / lobby metadata that
 * intentionally lives OUTSIDE the canonical engine `GameState` (seat order,
 * ready/host/connected flags). The server is the source of truth for this.
 */
export interface RosterSeat {
  readonly playerId: string;
  readonly name: string;
  /** 0-based seat index. */
  readonly seat: number;
  readonly isHost: boolean;
  readonly ready: boolean;
  /** Whether a live socket currently occupies the seat. */
  readonly connected: boolean;
}

/**
 * Server -> client: dedicated lobby/roster broadcast. Sent on every roster
 * change (join / leave / ready toggle / kick / config change) so clients can
 * render the pre-game lobby without reading presence off `GameState`.
 *
 * This message is additive: older clients that only switch on the previously
 * defined `ServerMessage` variants simply ignore it.
 */
export interface RosterMessage {
  readonly type: 'Roster';
  readonly roomId: string;
  /** Seats in stable seat-index order. */
  readonly seats: readonly RosterSeat[];
  /** Configured seat count (2-4). */
  readonly maxPlayers: number;
  /** Whether the room requires a password to join. */
  readonly hasPassword: boolean;
  /** Lobby phase flag: true once a game has started in this room. */
  readonly started: boolean;
}

/** Anything a client may send to the server. */
export type ClientMessage =
  | JoinMessage
  | ActionMessage
  | ConfigureRoomMessage
  | SetReadyMessage
  | StartGameMessage
  | KickPlayerMessage;

/** Anything the server may send to a client. */
export type ServerMessage =
  | JoinAckMessage
  | StateUpdateMessage
  | ErrorMessage
  | KickedMessage
  | RosterMessage;

/** Union of all protocol messages. */
export type Message = ClientMessage | ServerMessage;
