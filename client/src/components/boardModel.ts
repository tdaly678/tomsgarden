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

/** A garden-expansion (flower bed) held in a player's storage. */
export interface HeldBed {
  readonly id: string;
  readonly spaces: 5 | 7;
  /** True for blank pieces bought face-down from the supply. */
  readonly faceDown: boolean;
  /** Printed hexagon (face-up pieces only). */
  readonly printedTile?: Tile;
}

/** A hex space of a player's garden (grows as flower beds attach). */
export interface PlotSpace {
  readonly at: Coord;
  /** Feature ornament id (themed: birdbath/gardenGnome/pottingTable/gazebo). */
  readonly feature?: string;
  readonly piece: string;
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
  /** The garden's hex spaces (fountain board + attached flower beds). */
  readonly spaces: PlotSpace[];
  /** Flower beds held in expansion storage (max 2). */
  readonly beds: HeldBed[];
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

/** A flower-bed expansion visible in the central display. */
export interface DisplayBed {
  readonly id: string;
  readonly spaces: 5 | 7;
  /** Face up = revealed (gazebo + 1 printed tile), draftable. */
  readonly faceUp: boolean;
  readonly printedTile?: Tile;
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
  /** Flower-bed expansions in the central display. */
  readonly displayBeds: DisplayBed[];
  /** Face-down supply beds purchasable for 6 points. */
  readonly supplyCount: number;
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
  /** Storage tile ids discarded as payment (jokers use `joker:` ids). */
  readonly payment?: string[];
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

/** Acquire a face-up flower bed from the display into expansion storage. */
export interface AcquireBedAction {
  readonly type: 'AcquireBed';
  readonly playerId: string;
  readonly bedId: string;
  /** Tile id of the bed's printed hexagon (drives the engine Acquire select). */
  readonly printedTileId: string;
}

/** Place a held flower bed into the garden at the given cells. */
export interface PlaceBedAction {
  readonly type: 'PlaceBed';
  readonly playerId: string;
  readonly bedId: string;
  readonly cells: Coord[];
  readonly featureAt?: Coord;
  readonly printedAt?: Coord;
  /** Storage tile ids discarded as payment (jokers use `joker:` ids). */
  readonly payment?: string[];
}

/** Buy a face-down supply bed (7 blank spaces) for 6 points. */
export interface BuyBedAction {
  readonly type: 'BuyBed';
  readonly playerId: string;
  readonly cells: Coord[];
}

/** Discriminated union of board-level intents (the board's onAction shape). */
export type Action =
  | DraftTilesAction
  | PlaceTileAction
  | AcquireBedAction
  | PlaceBedAction
  | BuyBedAction
  | DiscardToFloorAction
  | EndTurnAction;
