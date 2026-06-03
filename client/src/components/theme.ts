/**
 * Tomsgarden public-facing vocabulary + visual tokens.
 *
 * The internal domain (shared/types.ts) uses neutral source terms
 * (color1..color6, pattern1..pattern6, "joker", etc.). This module maps those
 * to the ship-able Tomsgarden names from `shared/rules/rename-map.json` and
 * supplies default colors / pattern glyphs.
 *
 * IMPORTANT for the Design agent: every visual value here has a matching CSS
 * custom property (see board.css `:root`). Components read colors from CSS vars
 * (`var(--tg-color-lavender)` etc.), so you can re-theme purely in CSS without
 * touching TSX. The JS constants below are only the source-of-truth fallbacks
 * and the human-readable labels.
 */

import type { TileColor } from './boardModel';

// ---------------------------------------------------------------------------
// Colors (color1..color6 -> garden-bed plant names)
// ---------------------------------------------------------------------------

/** Public Tomsgarden name for each engine color. */
export const COLOR_NAME: Record<TileColor, string> = {
  // The engine's TileColor union uses descriptive english already; we map each
  // to the themed garden-bed name from the rename map.
  purple: 'Lavender',
  yellow: 'Marigold',
  green: 'Fern',
  red: 'Rose',
  blue: 'Bluebell',
  orange: 'Ivy',
};

/** CSS-variable token name (without the `--tg-color-` prefix) per color. */
export const COLOR_TOKEN: Record<TileColor, string> = {
  purple: 'lavender',
  yellow: 'marigold',
  green: 'fern',
  red: 'rose',
  blue: 'bluebell',
  orange: 'ivy',
};

/** Fallback hex per color, mirrored in board.css `:root`. */
export const COLOR_HEX: Record<TileColor, string> = {
  purple: '#9b7ed0',
  yellow: '#e8b53d',
  green: '#5fa86a',
  red: '#cf5b6b',
  blue: '#5b8fd0',
  orange: '#d98a4a',
};

export const ALL_COLORS: TileColor[] = [
  'purple',
  'yellow',
  'green',
  'red',
  'blue',
  'orange',
];

/** Resolve the CSS var() expression a component should use for a color. */
export function colorVar(color: TileColor): string {
  return `var(--tg-color-${COLOR_TOKEN[color]}, ${COLOR_HEX[color]})`;
}

// ---------------------------------------------------------------------------
// Patterns (pattern1..pattern6 -> plant/critter motifs, value == cost == points)
// ---------------------------------------------------------------------------

export type PatternId =
  | 'sapling'
  | 'robin'
  | 'ladybug'
  | 'sunflower'
  | 'snail'
  | 'beehive';

export interface PatternMeta {
  readonly id: PatternId;
  /** Placement cost AND per-hexagon scoring value (1..6). */
  readonly value: number;
  readonly label: string;
  /** Placeholder glyph used by the SVG tile until the Design agent ships art. */
  readonly glyph: string;
}

export const PATTERNS: PatternMeta[] = [
  { id: 'sapling', value: 1, label: 'Sapling', glyph: '🌱' },
  { id: 'robin', value: 2, label: 'Robin', glyph: '🐦' },
  { id: 'ladybug', value: 3, label: 'Ladybug', glyph: '🐞' },
  { id: 'sunflower', value: 4, label: 'Sunflower', glyph: '🌻' },
  { id: 'snail', value: 5, label: 'Snail', glyph: '🐌' },
  { id: 'beehive', value: 6, label: 'Beehive', glyph: '🍯' },
];

export const PATTERN_BY_ID: Record<PatternId, PatternMeta> = Object.fromEntries(
  PATTERNS.map((p) => [p.id, p]),
) as Record<PatternId, PatternMeta>;

// ---------------------------------------------------------------------------
// Features (themed garden ornaments)
// ---------------------------------------------------------------------------

export type FeatureId = 'birdbath' | 'gardenGnome' | 'pottingTable' | 'gazebo';

export interface FeatureMeta {
  readonly id: FeatureId;
  readonly label: string;
  readonly glyph: string;
  /** Wildseeds awarded when fully surrounded. */
  readonly wildseedsWhenSurrounded: number;
}

export const FEATURES: Record<FeatureId, FeatureMeta> = {
  birdbath: {
    id: 'birdbath',
    label: 'Birdbath',
    glyph: '⛲',
    wildseedsWhenSurrounded: 3,
  },
  gardenGnome: {
    id: 'gardenGnome',
    label: 'Garden Gnome',
    glyph: '🧙',
    wildseedsWhenSurrounded: 2,
  },
  pottingTable: {
    id: 'pottingTable',
    label: 'Potting Table',
    glyph: '🪴',
    wildseedsWhenSurrounded: 1,
  },
  gazebo: {
    id: 'gazebo',
    label: 'Gazebo',
    glyph: '⛩️',
    wildseedsWhenSurrounded: 1,
  },
};

// ---------------------------------------------------------------------------
// Public component labels (rename-map "components")
// ---------------------------------------------------------------------------

export const LABELS = {
  gardenPlot: 'Garden Plot',
  patio: 'Patio',
  flowerBed: 'Flower Bed',
  plantTile: 'Plant Tile',
  plant: 'Plant',
  wildseed: 'Wildseed',
  shed: 'Shed',
  seasonDial: 'Season Dial',
  almanac: 'Almanac',
  harvestTrack: 'Harvest Track',
  nursery: 'Nursery',
  headGardener: 'Head Gardener',
  compostBin: 'Compost Bin',
} as const;
