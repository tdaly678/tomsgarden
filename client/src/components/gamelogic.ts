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
