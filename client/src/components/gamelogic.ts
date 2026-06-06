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

  if (neigh.length > 0) {
    // No identical-adjacent.
    for (const n of neigh) {
      if (n.color === tile.color && patternOf(n) === tilePat) return false;
    }
    // Must share pattern OR color with at least one neighbor.
    const shares = neigh.some(
      (n) => n.color === tile.color || patternOf(n) === tilePat,
    );
    if (!shares) return false;
  }

  // Rulebook group rule: the placement may not create or extend a pattern- or
  // color-group that would then contain two identical hexagons — including by
  // CONNECTING previously separate groups (mirrors engine canPlaceHexAt).
  return !wouldGroupContainDuplicates(tile, target.at, placed);
}

function wouldGroupContainDuplicates(
  tile: Tile,
  at: Coord,
  placed: PlacedView[],
): boolean {
  const tilePat = patternOf(tile);
  const all: { at: Coord; color: string; pat: PatternId }[] = [
    ...placed.map((p) => ({
      at: p.at,
      color: p.tile.color,
      pat: patternOf(p.tile),
    })),
    { at, color: tile.color, pat: tilePat },
  ];
  for (const by of ['pattern', 'color'] as const) {
    const match = (m: { color: string; pat: PatternId }): boolean =>
      by === 'pattern' ? m.pat === tilePat : m.color === tile.color;
    const byKey = new Map<string, { at: Coord; color: string; pat: PatternId }>();
    for (const m of all) if (match(m)) byKey.set(coordKey(m.at), m);
    const visited = new Set<string>([coordKey(at)]);
    const stack: Coord[] = [at];
    const seenHex = new Set<string>([`${tile.color}/${tilePat}`]);
    while (stack.length) {
      const cur = stack.pop()!;
      for (const n of neighbors(cur)) {
        const k = coordKey(n);
        if (visited.has(k)) continue;
        const member = byKey.get(k);
        if (!member) continue;
        visited.add(k);
        const hk = `${member.color}/${member.pat}`;
        if (seenHex.has(hk)) return true;
        seenHex.add(hk);
        stack.push(member.at);
      }
    }
  }
  return false;
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

/**
 * Group tiles by pattern (acquire may instead take ALL of one pattern,
 * skipping identical-hexagon duplicates).
 */
export function groupByPattern(tiles: Tile[]): Map<string, Tile[]> {
  const m = new Map<string, Tile[]>();
  for (const t of tiles) {
    const p = patternOf(t);
    const arr = m.get(p) ?? [];
    arr.push(t);
    m.set(p, arr);
  }
  return m;
}

/**
 * The tiles actually acquired for a selector over a source's tiles: all
 * matching tiles minus identical-hexagon duplicates (one copy each kept).
 */
export function acquiredTiles(
  tiles: Tile[],
  select: { by: 'color'; color: string } | { by: 'pattern'; pattern: string },
): Tile[] {
  const match =
    select.by === 'color'
      ? tiles.filter((t) => t.color === select.color)
      : tiles.filter((t) => patternOf(t) === select.pattern);
  const seen = new Set<string>();
  const out: Tile[] = [];
  for (const t of match) {
    const key = `${t.color}:${patternOf(t)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Whole-display acquire preview (client mirror of engine acquirableHexagons)
// ---------------------------------------------------------------------------

/** Selector shape the preview accepts (color names / pattern ids are board-side). */
export type AcquireSelect =
  | { readonly by: 'color'; readonly color: string }
  | { readonly by: 'pattern'; readonly pattern: string };

/** A draftable source group: the Nursery center pool or one flower bed. */
export interface AcquireSource {
  /** 'center' for the loose Nursery pool; otherwise the flower-bed id. */
  readonly id: string;
  readonly tiles: readonly Tile[];
}

/** A face-up flower bed in the display (acquirable when its printed tile matches). */
export interface FaceUpBedView {
  readonly id: string;
  readonly printedTile?: Tile;
  readonly faceUp: boolean;
}

export interface AcquirePreview {
  /** Tile ids that would actually be taken (one copy per identical hexagon). */
  readonly takenIds: Set<string>;
  /** Tile ids matching the selector but skipped as identical duplicates. */
  readonly dupIds: Set<string>;
  /** Face-up flower-bed ids whose printed hexagon matches (also acquired). */
  readonly bedIds: Set<string>;
  /** The taken tiles, in engine pick order. */
  readonly taken: Tile[];
}

/**
 * Compute exactly which display pieces an Acquire would take, ACROSS the
 * entire display (Nursery pool + every flower bed), mirroring the engine's
 * `acquirableHexagons` in shared/engine/core.ts:
 *
 *  - Every matching tile from the loose pool (weight 0) and every flower bed
 *    (weight = that bed's tile count) is a candidate.
 *  - Candidates are stable-sorted by weight ascending (loose pool first, then
 *    emptier beds first — the engine's canonical duplicate choice).
 *  - Of identical hexagons (same color AND pattern), only the FIRST candidate
 *    is taken; the other copies stay in the display.
 *  - Matching FACE-UP flower beds (printed hexagon matches the selector) are
 *    also acquired, into expansion storage.
 *
 * Keep this in lockstep with the engine — there is a unit test pinning the
 * two against each other (gamelogic.test.ts).
 */
export function acquirePreview(
  center: readonly Tile[],
  factories: readonly AcquireSource[],
  beds: readonly FaceUpBedView[],
  select: AcquireSelect,
): AcquirePreview {
  const matches = (t: Tile): boolean =>
    select.by === 'color'
      ? t.color === select.color
      : patternOf(t) === select.pattern;

  const candidates: { tile: Tile; weight: number }[] = [];
  for (const t of center) if (matches(t)) candidates.push({ tile: t, weight: 0 });
  for (const f of factories) {
    for (const t of f.tiles) {
      if (matches(t)) candidates.push({ tile: t, weight: f.tiles.length });
    }
  }
  // Array.prototype.sort is stable: equal weights keep display order, exactly
  // like the engine's stable sort over its source list.
  candidates.sort((a, b) => a.weight - b.weight);

  const seen = new Set<string>();
  const takenIds = new Set<string>();
  const dupIds = new Set<string>();
  const taken: Tile[] = [];
  for (const c of candidates) {
    const key = `${c.tile.color}:${patternOf(c.tile)}`;
    if (seen.has(key)) {
      dupIds.add(c.tile.id);
      continue;
    }
    seen.add(key);
    takenIds.add(c.tile.id);
    taken.push(c.tile);
  }

  const bedIds = new Set<string>();
  for (const b of beds) {
    if (b.faceUp && b.printedTile && matches(b.printedTile)) bedIds.add(b.id);
  }

  return { takenIds, dupIds, bedIds, taken };
}
