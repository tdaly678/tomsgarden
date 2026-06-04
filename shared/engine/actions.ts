/**
 * Engine action types (richer than the thin wire `Action` in ../types.ts).
 * Discriminated on `type`.
 */

import type { Axial, ColorId, Hexagon, PatternId } from './model.js';

/** A) Acquire all display tiles/expansions showing a declared pattern OR color. */
export interface AcquireAction {
  readonly type: 'Acquire';
  readonly playerId: string;
  readonly select:
    | { readonly by: 'pattern'; readonly pattern: PatternId }
    | { readonly by: 'color'; readonly color: ColorId };
}

/** B) Place a tile from storage at a coordinate, paying its cost. */
export interface PlaceTileAction {
  readonly type: 'PlaceTile';
  readonly playerId: string;
  /** The hexagon being placed (must be present in storage). */
  readonly hex: Hexagon;
  readonly at: Axial;
  /**
   * The storage items spent to pay the *additional* cost (cost - 1 items),
   * each either a real tile hexagon or a joker. Does NOT include the placed hex.
   */
  readonly payment: Payment[];
}

export type Payment =
  | { readonly kind: 'tile'; readonly hex: Hexagon }
  | { readonly kind: 'joker' }
  /**
   * Discard a held garden expansion as payment (rulebook: costs are paid "by
   * discarding that number of tiles and/or garden expansions"). Its printed
   * hexagon participates in the set rule; the piece returns face down to the
   * bottom of the supply.
   */
  | { readonly kind: 'expansion'; readonly expansionId: string };

/**
 * C) Place a garden expansion from expansion storage into the garden.
 *
 * `cells` are the axial coordinates the piece will occupy (must equal the
 * piece's size, be connected, not overlap existing garden spaces, and touch
 * the existing garden). For face-up pieces, `featureAt` marks the pavilion
 * cell and `printedAt` marks the cell holding the printed hexagon; `payment`
 * covers the printed hexagon's additional cost (cost - 1 items, set rule with
 * the printed hex, jokers wild). Face-down (blank) pieces need none of these.
 */
export interface PlaceExpansionAction {
  readonly type: 'PlaceExpansion';
  readonly playerId: string;
  readonly expansionId: string;
  readonly cells: Axial[];
  readonly featureAt?: Axial;
  readonly printedAt?: Axial;
  readonly payment?: Payment[];
}

/** C-alt) Buy a face-down supply expansion for exactly 6 points and place it. */
export interface BuyExpansionAction {
  readonly type: 'BuyExpansion';
  readonly playerId: string;
  /** The 7 blank cells the piece will occupy. */
  readonly cells: Axial[];
}

/** D) Pass. Optionally discard storage hexagons for MINUS points (cleanup). */
export interface PassAction {
  readonly type: 'Pass';
  readonly playerId: string;
  /** Tile hexagons to discard from storage, scored as negative points. */
  readonly discard?: Hexagon[];
  /**
   * Held garden expansions to discard (scored as minus their printed
   * hexagon's pattern value; returned face down to the supply).
   */
  readonly discardExpansionIds?: string[];
}

export type EngineAction =
  | AcquireAction
  | PlaceTileAction
  | PlaceExpansionAction
  | BuyExpansionAction
  | PassAction;
