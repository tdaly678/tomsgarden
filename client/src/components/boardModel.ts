/**
 * Board view-model.
 *
 * The canonical game model lives in `@tomsgarden/shared` (the rich engine model:
 * hex/axial gardens, storage, jokers, scoring wheel, expansions). The board UI
 * in this folder, however, was authored against a simpler *presentational* shape
 * (colored tiles, row/col coords, per-player hand/board/floor, factories + a
 * center pool). Rather than rewrite every component, we keep that shape here as
 * a dedicated VIEW model and translate engine state into it in `engineAdapter.ts`.
 *
 * This is a deliberate seam: the canonical/network model stays rich and faithful,
 * while the components keep a stable, easy-to-render contract.
 */

/** The six tile colors shown on the board (maps from engine ColorId). */
export type TileColor =
  | 'purple'
  | 'green'
  | 'orange'
  | 'red'
  | 'blue'
  | 'yellow';

/** A single tile in the view. `id` is unique within a render. */
export interface Tile {
  readonly id: string;
  readonly color: TileColor;
  /** A wildseed / joker. */
  readonly wildcard?: boolean;
}

/** A coordinate on the garden grid (treated as axial: q=col, r=row). */
export interface Coord {
  readonly row: number;
  readonly col: number;
}

/** A placed tile on a player's garden. */
export interface PlacedTile {
  readonly tile: Tile;
  readonly at: Coord;
}

/** Per-player view state. */
export interface PlayerState {
  readonly id: string;
  readonly name: string;
  readonly connected: boolean;
  readonly score: number;
  /** Tiles available to place (storage, in engine terms). */
  readonly hand: Tile[];
  /** Tiles placed on the player's garden. */
  readonly board: PlacedTile[];
  /** Discard / penalty area (compost). */
  readonly floor: Tile[];
}

/** Phases as the board cares about them. */
export type GamePhase =
  | 'lobby'
  | 'drafting'
  | 'placing'
  | 'scoring'
  | 'finished';

/** A draftable source (a flower-bed display group). */
export interface Factory {
  readonly id: string;
  readonly tiles: Tile[];
}

/** The board's full view state. */
export interface GameState {
  readonly roomId: string;
  readonly phase: GamePhase;
  readonly round: number;
  readonly players: PlayerState[];
  readonly activePlayerIndex: number | null;
  readonly factories: Factory[];
  readonly center: Tile[];
  readonly bagCount: number;
  readonly winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Board-level player intents. These are translated to engine actions in
// engineAdapter.ts before being sent over the wire.
// ---------------------------------------------------------------------------

export interface DraftTilesAction {
  readonly type: 'DraftTiles';
  readonly playerId: string;
  readonly source: string | 'center';
  readonly color: TileColor;
}

export interface PlaceTileAction {
  readonly type: 'PlaceTile';
  readonly playerId: string;
  readonly tileId: string;
  readonly at: Coord;
}

export interface DiscardToFloorAction {
  readonly type: 'DiscardToFloor';
  readonly playerId: string;
  readonly tileId: string;
}

export interface EndTurnAction {
  readonly type: 'EndTurn';
  readonly playerId: string;
}

/** Discriminated union of board-level intents (the board's onAction shape). */
export type Action =
  | DraftTilesAction
  | PlaceTileAction
  | DiscardToFloorAction
  | EndTurnAction;
