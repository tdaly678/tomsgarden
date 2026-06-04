/**
 * UI-side game helpers: deriving the pattern of a tile, legal-move affordances,
 * and placement-cost preview.
 *
 * NOTE: the shared `Tile` type only carries `color` + optional `wildcard`. The
 * pattern (sapling..beehive) is not in the wire type yet, so for the mock the
 * pattern is encoded in the tile `id` as a suffix `#<patternId>`. When the
 * engine adds a real pattern field, swap `patternOf()` to read it — nothing
 * else in the UI needs to change.
 */

import type { Coord, Tile } from './boardModel';
import type { PatternId } from './theme';
import { PATTERN_BY_ID } from './theme';
import type { HexSpace } from './hexgrid';
import { coordKey, neighbors } from './hexgrid';

/** Derive a tile's pattern. Mock encoding: id = `<...>#<patternId>`. */
export function patternOf(tile: Tile): PatternId {
  const hashIdx = tile.id.lastIndexOf('#');
  if (hashIdx >= 0) {
    const suffix = tile.id.slice(hashIdx + 1) as PatternId;
    if (suffix in PATTERN_BY_ID) return suffix;
  }
  return 'sapling';
}

/** Placement cost (== pattern value) for a tile. */
export function placementCost(tile: Tile): number {
  return PATTERN_BY_ID[patternOf(tile)].value;
}

export interface PlacedView {
  readonly at: Coord;
  readonly tile: Tile;
}

/**
 * Is placing `tile` on space `target` legal, given current placements?
 * Rules (rules.json gardenBoard.placementRules):
 *  - space must be free and a tile space (not a feature space)
 *  - must have NO adjacent hexagons OR share same pattern OR same color with
 *    at least one neighbor
 *  - may never make two identical hexagons (same pattern AND color) adjacent
 */
export function isLegalPlacement(
  tile: Tile,
  target: HexSpace,
  spaces: HexSpace[],
  placed: PlacedView[],
): boolean {
  if (target.feature) return false;

  const occupied = new Map<string, Tile>();
  for (const p of placed) occupied.set(coordKey(p.at), p.tile);
  if (occupied.has(coordKey(target.at))) return false;

  const validSpace = spaces.some(
    (s) => coordKey(s.at) === coordKey(target.at),
  );
  if (!validSpace) return false;

  const tilePat = patternOf(tile);
  const neigh = neighbors(target.at)
    .map((c) => occupied.get(coordKey(c)))
    .filter((t): t is Tile => !!t);

  if (neigh.length === 0) return true; // isolated placement allowed

  // No identical-adjacent.
  for (const n of neigh) {
    if (n.color === tile.color && patternOf(n) === tilePat) return false;
  }

  // Must share pattern OR color with at least one neighbor.
  return neigh.some((n) => n.color === tile.color || patternOf(n) === tilePat);
}

/** All legal target space keys for a tile. */
export function legalTargets(
  tile: Tile,
  spaces: HexSpace[],
  placed: PlacedView[],
): Set<string> {
  const out = new Set<string>();
  for (const s of spaces) {
    if (isLegalPlacement(tile, s, spaces, placed)) out.add(coordKey(s.at));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Payment helpers (client-side mirror of the engine's payment rules)
// ---------------------------------------------------------------------------

/** Key for the "no two identical hexagons" rule. Jokers get unique keys. */
function setKey(t: Tile): string {
  return t.wildcard ? `joker:${t.id}` : `${t.color}/${patternOf(t)}`;
}

/**
 * Is `selection` (other storage tiles, NOT the anchor) a valid payment for an
 * anchor hexagon of `anchorColor`/`anchorPattern`, given the engine set rule:
 * real tiles + anchor must be all-same-pattern (different colors) OR
 * all-same-color (different patterns); no two identical; jokers wild.
 * Does NOT check count — see `isPaymentComplete`.
 */
export function isValidPaymentSet(
  anchor: Tile,
  selection: Tile[],
): boolean {
  const anchorPat = patternOf(anchor);
  const real = selection.filter((t) => !t.wildcard);
  const keys = [
    `${anchor.color}/${anchorPat}`,
    ...real.map((t) => setKey(t)),
  ];
  if (new Set(keys).size !== keys.length) return false;
  if (real.length === 0) return true;
  const allSamePattern = real.every((t) => patternOf(t) === anchorPat);
  const allSameColor = real.every((t) => t.color === anchor.color);
  return allSamePattern || allSameColor;
}

/** Full client-side validity: set rule AND exact required count. */
export function isValidPayment(
  anchor: Tile,
  selection: Tile[],
  needed: number,
): boolean {
  return selection.length === needed && isValidPaymentSet(anchor, selection);
}

/**
 * Suggest a valid payment of `needed` items from `pool` (storage tiles,
 * excluding the anchor copy itself when placing a tile). Mirrors the engine's
 * canonical pickers: jokers first, then same-pattern, then same-color tiles.
 * Returns null when unaffordable.
 */
export function suggestPayment(
  anchor: Tile,
  pool: Tile[],
  needed: number,
): Tile[] | null {
  if (needed === 0) return [];
  const jokers = pool.filter((t) => t.wildcard);
  const chosen: Tile[] = jokers.slice(0, needed);
  let remaining = needed - chosen.length;
  if (remaining === 0) return chosen;
  const real = pool.filter((t) => !t.wildcard);
  const anchorPat = patternOf(anchor);
  for (const mode of ['pattern', 'color'] as const) {
    const used = new Set<string>([`${anchor.color}/${anchorPat}`]);
    const picked: Tile[] = [];
    for (const t of real) {
      if (picked.length >= remaining) break;
      const k = setKey(t);
      if (used.has(k)) continue;
      const match =
        mode === 'pattern'
          ? patternOf(t) === anchorPat
          : t.color === anchor.color;
      if (!match) continue;
      used.add(k);
      picked.push(t);
    }
    if (picked.length === remaining) return [...chosen, ...picked];
  }
  return null;
}

/**
 * Can the player afford to PLACE `tile` (the placed copy is consumed and
 * counts toward its own cost)? Pool = hand minus one copy of the tile itself.
 */
export function canAffordTile(tile: Tile, hand: Tile[]): boolean {
  const pool = hand.filter((t) => t.id !== tile.id);
  return suggestPayment(tile, pool, placementCost(tile) - 1) !== null;
}

/**
 * Can the player afford to place a face-up bed whose printed tile is
 * `printed`? The printed hex is NOT in storage; payment = cost-1 from hand.
 */
export function canAffordBed(printed: Tile, hand: Tile[]): boolean {
  return suggestPayment(printed, hand, placementCost(printed) - 1) !== null;
}

/**
 * For a factory/center, group tiles by color (acquire takes ALL of one color,
 * skipping identical-hexagon duplicates).
 */
export function groupByColor(tiles: Tile[]): Map<string, Tile[]> {
  const m = new Map<string, Tile[]>();
  for (const t of tiles) {
    const arr = m.get(t.color) ?? [];
    arr.push(t);
    m.set(t.color, arr);
  }
  return m;
}
