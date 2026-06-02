/**
 * Tomsgarden shared types.
 *
 * These types describe the game domain (Azul: Queen's Garden clone) and the
 * wire protocol used between the React client and the PartyKit room server.
 *
 * The rules engine itself lives in `shared/engine/` (stubbed) and the canonical
 * rules text lives in `shared/rules/` (authored by another agent).
 */

// ---------------------------------------------------------------------------
// Game domain
// ---------------------------------------------------------------------------

/** The six tile colors used in Queen's Garden. */
export type TileColor =
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'blue'
  | 'yellow';

/**
 * A single tile. In Queen's Garden tiles are either colored garden tiles or
 * one of the special "joker"-like tiles depending on variant; we model an
 * optional `wildcard` flag so the engine can decide semantics later.
 */
export interface Tile {
  readonly id: string;
  readonly color: TileColor;
  readonly wildcard?: boolean;
}

/** A coordinate on a player's board / garden grid. */
export interface Coord {
  readonly row: number;
  readonly col: number;
}

/** A placed tile on a player's board. */
export interface PlacedTile {
  readonly tile: Tile;
  readonly at: Coord;
}

/** Per-player state. */
export interface PlayerState {
  readonly id: string;
  readonly name: string;
  /** Connection presence; players may temporarily disconnect mid-game. */
  readonly connected: boolean;
  readonly score: number;
  /** Tiles the player has drafted but not yet placed this turn. */
  readonly hand: Tile[];
  /** Tiles placed on the player's personal board. */
  readonly board: PlacedTile[];
  /** Tiles destined to be discarded / negative-scoring (floor line). */
  readonly floor: Tile[];
}

/** Phases of a single game. */
export type GamePhase =
  | 'lobby'
  | 'drafting'
  | 'placing'
  | 'scoring'
  | 'finished';

/** A shared "factory display" or central pool that players draft from. */
export interface Factory {
  readonly id: string;
  readonly tiles: Tile[];
}

/** The full, authoritative game state held by the server room. */
export interface GameState {
  readonly roomId: string;
  readonly phase: GamePhase;
  readonly round: number;
  readonly players: PlayerState[];
  /** Index into `players` of whose turn it is, or null between turns. */
  readonly activePlayerIndex: number | null;
  readonly factories: Factory[];
  /** Central shared pool (the "center of the table"). */
  readonly center: Tile[];
  /** Tile bag remaining count (contents hidden from clients). */
  readonly bagCount: number;
  /** Player id of the winner once `phase === 'finished'`. */
  readonly winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Actions (player intents). Discriminated union on `type`.
// ---------------------------------------------------------------------------

/** Draft tiles of one color from a factory or the center into the hand. */
export interface DraftTilesAction {
  readonly type: 'DraftTiles';
  readonly playerId: string;
  /** Source factory id, or 'center' for the central pool. */
  readonly source: string | 'center';
  readonly color: TileColor;
}

/** Place a single drafted tile onto a board coordinate. */
export interface PlaceTileAction {
  readonly type: 'PlaceTile';
  readonly playerId: string;
  readonly tileId: string;
  readonly at: Coord;
}

/** Send a drafted tile to the floor line (penalty row). */
export interface DiscardToFloorAction {
  readonly type: 'DiscardToFloor';
  readonly playerId: string;
  readonly tileId: string;
}

/** Explicitly end the current player's turn. */
export interface EndTurnAction {
  readonly type: 'EndTurn';
  readonly playerId: string;
}

/** Discriminated union of all legal player actions. */
export type Action =
  | DraftTilesAction
  | PlaceTileAction
  | DiscardToFloorAction
  | EndTurnAction;

// ---------------------------------------------------------------------------
// Wire protocol: client <-> server messages. Discriminated union on `type`.
// ---------------------------------------------------------------------------

/** Client -> server: request to join a room. */
export interface JoinMessage {
  readonly type: 'Join';
  readonly playerName: string;
  /** Optional room password; required only if the room was created with one. */
  readonly password?: string;
}

/** Server -> client: acknowledges a successful join. */
export interface JoinAckMessage {
  readonly type: 'JoinAck';
  readonly playerId: string;
  readonly roomId: string;
  readonly state: GameState;
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
    | 'UNKNOWN';
  readonly message: string;
}

/** Anything a client may send to the server. */
export type ClientMessage = JoinMessage | ActionMessage;

/** Anything the server may send to a client. */
export type ServerMessage =
  | JoinAckMessage
  | StateUpdateMessage
  | ErrorMessage;

/** Union of all protocol messages. */
export type Message = ClientMessage | ServerMessage;
