/**
 * Tomsgarden engine domain model.
 *
 * These types model the *real* Queen's Garden mechanics (hex garden, storage,
 * jokers, scoring wheel, garden expansions, features) faithfully, which is more
 * than the thin wire `GameState` in `../types.ts` carries. The engine operates
 * on this richer model; the server/client adapt to/from it.
 *
 * All numbers come from `shared/rules/rules.json` (the single source of truth),
 * re-exported here as typed constants in `./rules-data.ts`.
 */

// ---------------------------------------------------------------------------
// Patterns, colors, hexagons
// ---------------------------------------------------------------------------

export type PatternId =
  | 'pattern1'
  | 'pattern2'
  | 'pattern3'
  | 'pattern4'
  | 'pattern5'
  | 'pattern6';

export type ColorId =
  | 'color1'
  | 'color2'
  | 'color3'
  | 'color4'
  | 'color5'
  | 'color6';

/** A hexagon = a unique pattern+color combination. Jokers are modelled separately. */
export interface Hexagon {
  readonly pattern: PatternId;
  readonly color: ColorId;
}

/** A storage item is either a real hexagon tile or a wild joker. */
export type StorageItem =
  | { readonly kind: 'tile'; readonly hex: Hexagon }
  | { readonly kind: 'joker' };

export type FeatureType = 'fountain' | 'statue' | 'bench' | 'pavilion';

// ---------------------------------------------------------------------------
// Hex grid (axial coordinates). Two hexes are adjacent iff their axial delta
// is one of the 6 unit directions.
// ---------------------------------------------------------------------------

export interface Axial {
  readonly q: number;
  readonly r: number;
}

export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const axialKey = (a: Axial): string => `${a.q},${a.r}`;

export function neighbors(a: Axial): Axial[] {
  return HEX_DIRECTIONS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

// ---------------------------------------------------------------------------
// Player garden
// ---------------------------------------------------------------------------

/** A hex space on a player's garden: either a placeable tile space or a feature. */
export interface GardenSpace {
  readonly at: Axial;
  /** If present, this space holds a non-placeable feature (cannot take a tile). */
  readonly feature?: FeatureType;
}

export interface PlacedHex {
  readonly at: Axial;
  readonly hex: Hexagon;
}

export interface PlayerEngineState {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  /** Available hex spaces (from fountain board + placed expansions). */
  readonly spaces: GardenSpace[];
  /** Tiles placed onto the garden. */
  readonly placed: PlacedHex[];
  /** Storage: hexagon tiles + jokers (max 12 combined). */
  readonly storage: StorageItem[];
  /** Garden-expansion pieces held in storage, not yet placed (max 2). */
  readonly expansionStore: HeldExpansion[];
  /** Whether this player has passed in the current round's Phase 1. */
  readonly passed: boolean;
}

// ---------------------------------------------------------------------------
// Shared display (the "draft area")
// ---------------------------------------------------------------------------

/** A garden expansion sitting in the display, possibly with leftover tiles on it. */
export interface DisplayExpansion {
  readonly id: string;
  readonly hex: Hexagon;
  /** All garden expansions are 7-hex pieces (owner/Zatu-confirmed). */
  readonly spaces: 7;
  readonly feature: 'pavilion';
  /** Loose tiles currently sitting on this expansion in the display. */
  readonly tiles: Hexagon[];
  /** Face up (0 tiles -> draftable) vs face down. */
  readonly faceUp: boolean;
  /**
   * True only for the current round-stack's topmost expansion (still ON the
   * stack). Taking a tile from it triggers the display-extension + refill
   * (rulebook: "if you took at least one tile from the current round stack").
   */
  readonly onStack?: boolean;
}

/**
 * A garden expansion held in a player's expansion storage (max 2) or bought
 * face-down from the supply. Face-up pieces carry a pavilion + 1 printed
 * hexagon; face-down (supply) pieces are 7 blank spaces.
 */
export interface HeldExpansion {
  readonly id: string;
  readonly spaces: 7;
  /** Printed hexagon (face-up pieces only). */
  readonly hex?: Hexagon;
  /** True for blank pieces bought from the face-down supply. */
  readonly faceDown: boolean;
}

export interface EngineGameState {
  readonly roomId: string;
  readonly phase: 'lobby' | 'drafting' | 'scoring' | 'finished';
  readonly round: number; // 1..4
  readonly players: PlayerEngineState[];
  /** Whose turn (index into players), or null between phases. */
  readonly activePlayerIndex: number | null;
  /** Index of the player holding the first-player marker. */
  readonly firstPlayerIndex: number;
  /**
   * Loose tiles in the display NOT sitting on any expansion. In rulebook play
   * every display tile sits on an expansion (`displayExpansions[].tiles`);
   * this stays for wire compatibility and shortage edge cases. Usually empty.
   */
  readonly displayTiles: Hexagon[];
  /** Discarded tiles (the "tower"); recycled into the bag on shortage. */
  readonly tower: Hexagon[];
  /** Garden expansions in the display. */
  readonly displayExpansions: DisplayExpansion[];
  /**
   * The 4 face-down round stacks of garden expansions (index 0 = round 1).
   * During a round, expansions are moved from the current round's stack into
   * the display as tile-acquires trigger refills.
   */
  readonly expansionStacks: DisplayExpansion[][];
  /** Face-down supply expansions (7 blank spaces each, buyable for 6 points). */
  readonly expansionSupply: number;
  /** Tile bag (ordered; draw from the end). */
  readonly bag: Hexagon[];
  /** Whether the first-pass penalty has already been taken this round. */
  readonly firstPassTaken: boolean;
  readonly winnerIds: string[];
  /** RNG state for reproducible draws. */
  readonly rngState: number;
  /** Config: switch final group scoring between rulebook-sum and flat-3. */
  readonly config: EngineConfig;
}

export interface EngineConfig {
  /** 'sum' = rulebook (sum of pattern values); 'flat3' = each group scores 3. */
  readonly finalGroupScoring: 'sum' | 'flat3';
}

export const DEFAULT_CONFIG: EngineConfig = { finalGroupScoring: 'sum' };
