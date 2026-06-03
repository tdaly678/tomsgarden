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
  | { readonly kind: 'joker' };

/** D) Pass. Optionally discard storage hexagons for MINUS points (cleanup). */
export interface PassAction {
  readonly type: 'Pass';
  readonly playerId: string;
  /** Hexagons to discard from storage, scored as negative points. */
  readonly discard?: Hexagon[];
}

export type EngineAction = AcquireAction | PlaceTileAction | PassAction;
