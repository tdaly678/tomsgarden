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
 * expansions add clusters of 5 or 7 spaces attached around it.
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

/** All axial coords within `radius` of the origin (a hexagon of hexes). */
function hexDisk(radius: number): Coord[] {
  const out: Coord[] = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = -radius; q <= radius; q++) {
      if (Math.abs(q + r) <= radius) out.push({ row: r, col: q });
    }
  }
  return out;
}

/**
 * Build the default garden plot for a player at setup:
 *  - Central Patio: radius-2 disk (19 hexes) — we mark 13 as tile spaces and a
 *    handful as features (birdbath at center, gnome / potting table on the ring),
 *    trimming corners to land at the rulebook's 13-hex patio shape.
 *  - Two Flower-bed expansions already attached (5 + 7 spaces) to show growth.
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

  // Patio: take the radius-2 disk but drop the 6 far corners -> 13 spaces.
  const disk = hexDisk(2);
  const corners = new Set(
    [
      { row: -2, col: 2 },
      { row: 2, col: -2 },
      { row: -2, col: 0 },
      { row: 2, col: 0 },
      { row: 0, col: -2 },
      { row: 0, col: 2 },
    ].map(coordKey),
  );
  for (const c of disk) {
    if (corners.has(coordKey(c))) continue;
    add(c, 'patio');
  }

  // Features on the patio.
  setFeature(spaces, { row: 0, col: 0 }, 'birdbath');
  setFeature(spaces, { row: -1, col: 0 }, 'gardenGnome');
  setFeature(spaces, { row: 1, col: 0 }, 'pottingTable');

  // Flower-bed A (5 spaces) attached up-right of the patio.
  const bedA: Coord[] = [
    { row: -2, col: 3 },
    { row: -3, col: 3 },
    { row: -3, col: 4 },
    { row: -2, col: 4 },
    { row: -1, col: 3 },
  ];
  bedA.forEach((c, i) => add(c, 'bedA', i === 1 ? 'gazebo' : undefined));

  // Flower-bed B (7 spaces) attached down-left of the patio.
  const bedB: Coord[] = [
    { row: 2, col: -1 },
    { row: 3, col: -1 },
    { row: 3, col: -2 },
    { row: 2, col: -2 },
    { row: 3, col: -3 },
    { row: 4, col: -2 },
    { row: 4, col: -3 },
  ];
  bedB.forEach((c, i) => add(c, 'bedB', i === 2 ? 'gazebo' : undefined));

  return spaces;
}

function setFeature(spaces: HexSpace[], at: Coord, feature: FeatureId): void {
  const idx = spaces.findIndex((s) => coordKey(s.at) === coordKey(at));
  if (idx >= 0) {
    spaces[idx] = { ...spaces[idx], feature };
  }
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
