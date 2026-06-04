/**
 * Hex grid geometry for the garden plot.
 *
 * The engine addresses board spaces with `Coord {row, col}` (shared/types.ts).
 * We treat (row, col) as AXIAL hex coordinates (q = col, r = row) and convert
 * to pixel positions for a pointy-top hex layout. This keeps the wire/domain
 * model simple while letting the UI render a proper honeycomb.
 *
 *   pointy-top axial -> pixel:
 *     x = size * sqrt(3) * (q + r/2)
 *     y = size * 3/2 * r
 *
 * A "garden plot" is a set of hex SPACES. The central Patio supplies 13 spaces
 * arranged as a radius-2 hexagon (with feature spaces interspersed). Flower-bed
 * expansions add clusters of 7 spaces attached around it.
 */

import type { Coord } from './boardModel';
import type { FeatureId } from './theme';

export interface HexSpace {
  readonly at: Coord;
  /** If set, this space holds a garden feature (ornament) instead of a tile. */
  readonly feature?: FeatureId;
  /** Which board piece this space belongs to (patio or a flower-bed id). */
  readonly piece: string;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export const HEX_SIZE = 34; // circumradius in px (overridable via CSS scale)

const SQRT3 = Math.sqrt(3);

/** Axial (col=q, row=r) -> pixel center for a pointy-top hex of `size`. */
export function axialToPixel(at: Coord, size = HEX_SIZE): PixelPoint {
  const q = at.col;
  const r = at.row;
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * (3 / 2) * r,
  };
}

/** The six pointy-top corner offsets for an SVG polygon. */
export function hexCorners(center: PixelPoint, size = HEX_SIZE): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(
      `${center.x + size * Math.cos(angle)},${center.y + size * Math.sin(angle)}`,
    );
  }
  return pts.join(' ');
}

const DIRECTIONS: ReadonlyArray<Coord> = [
  { row: 0, col: 1 },
  { row: 0, col: -1 },
  { row: 1, col: 0 },
  { row: -1, col: 0 },
  { row: 1, col: -1 },
  { row: -1, col: 1 },
];

export function neighbors(at: Coord): Coord[] {
  return DIRECTIONS.map((d) => ({ row: at.row + d.row, col: at.col + d.col }));
}

export function coordKey(at: Coord): string {
  return `${at.row},${at.col}`;
}

/**
 * Build the default garden plot for a player at setup — the 13-hex Patio
 * (fountain board), a symmetric flower/star mirroring the engine's
 * `fountainBoardSpaces`:
 *  - birdbath (fountain) at the center
 *  - 6 empty placeable spaces on ring 1
 *  - 6 printed features (3 garden gnomes + 3 potting tables, alternating) on
 *    the alternating ring-2 star points.
 */
export function buildDefaultPlot(): HexSpace[] {
  const spaces: HexSpace[] = [];
  const used = new Set<string>();

  const add = (at: Coord, piece: string, feature?: FeatureId) => {
    const k = coordKey(at);
    if (used.has(k)) return;
    used.add(k);
    spaces.push({ at, piece, feature });
  };

  // Center: birdbath (fountain).
  add({ row: 0, col: 0 }, 'patio', 'birdbath');
  // Ring 1: the 6 empty placeable spaces.
  for (const n of neighbors({ row: 0, col: 0 })) add(n, 'patio');
  // Alternating ring-2 star points: gnome (statue) / potting table (bench).
  const featureRing: Coord[] = [
    { row: -1, col: 2 },
    { row: 1, col: 1 },
    { row: 2, col: -1 },
    { row: 1, col: -2 },
    { row: -1, col: -1 },
    { row: -2, col: 1 },
  ];
  featureRing.forEach((c, i) =>
    add(c, 'patio', i % 2 === 0 ? 'gardenGnome' : 'pottingTable'),
  );

  return spaces;
}

/**
 * Candidate attachments for a flower-bed expansion of `size` spaces: for each
 * free hex bordering the garden, grow a connected blob of `size` new cells
 * (BFS outward, never overlapping existing spaces). Mirrors the engine's
 * `expansionPlacements`. Returns up to `cap` candidates keyed by anchor.
 */
export function bedAttachCandidates(
  spaces: readonly { at: Coord }[],
  size: number,
  cap = 12,
): Coord[][] {
  const existing = new Set(spaces.map((s) => coordKey(s.at)));
  const anchors: Coord[] = [];
  const seen = new Set<string>();
  for (const s of spaces) {
    for (const n of neighbors(s.at)) {
      const k = coordKey(n);
      if (existing.has(k) || seen.has(k)) continue;
      seen.add(k);
      anchors.push(n);
    }
  }
  const out: Coord[][] = [];
  for (const anchor of anchors) {
    const cells: Coord[] = [anchor];
    const cellKeys = new Set<string>([coordKey(anchor)]);
    const queue: Coord[] = [anchor];
    while (cells.length < size && queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of neighbors(cur)) {
        if (cells.length >= size) break;
        const k = coordKey(n);
        if (existing.has(k) || cellKeys.has(k)) continue;
        cellKeys.add(k);
        cells.push(n);
        queue.push(n);
      }
    }
    if (cells.length === size) out.push(cells);
    if (out.length >= cap) break;
  }
  return out;
}

/** Bounding box (in px) of a set of spaces, for SVG viewBox sizing. */
export function plotBounds(
  spaces: HexSpace[],
  size = HEX_SIZE,
): { minX: number; minY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of spaces) {
    const p = axialToPixel(s.at, size);
    minX = Math.min(minX, p.x - size);
    minY = Math.min(minY, p.y - size);
    maxX = Math.max(maxX, p.x + size);
    maxY = Math.max(maxY, p.y + size);
  }
  const pad = size * 0.4;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2,
  };
}
