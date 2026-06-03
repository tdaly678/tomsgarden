/**
 * Tomsgarden — design tokens (TypeScript companion to design-tokens.css)
 *
 * Use this when you need the palette / counts in JS land (e.g. to iterate the
 * 6 colors, look up a hex value, or build a <select>). The CSS file remains the
 * styling source of truth; values here mirror it. Names align with
 * shared/rules/rename-map.json.
 */

/* The 6 game colors, in canonical order (color1..color6). */
export const TILE_COLORS = [
  'lavender',
  'marigold',
  'fern',
  'rose',
  'bluebell',
  'ivy',
] as const;
export type TileColor = (typeof TILE_COLORS)[number];

/* The 6 pattern motifs (renamed plants/critters), in canonical order. */
export const TILE_PATTERNS = [
  'sapling', // pattern1, value 1
  'robin', // pattern2, value 2
  'ladybug', // pattern3, value 3
  'sunflower', // pattern4, value 4
  'snail', // pattern5, value 5
  'beehive', // pattern6, value 6
] as const;
export type TilePattern = (typeof TILE_PATTERNS)[number];

/* Pattern -> placement cost / point value (rules.json). */
export const PATTERN_VALUE: Record<TilePattern, number> = {
  sapling: 1,
  robin: 2,
  ladybug: 3,
  sunflower: 4,
  snail: 5,
  beehive: 6,
};

/* Base hex for each color (mirrors --tg-color-<name>). */
export const COLOR_HEX: Record<TileColor, string> = {
  lavender: '#7e60bd',
  marigold: '#e8962f',
  fern: '#467d25',
  rose: '#d8456b',
  bluebell: '#3a82c4',
  ivy: '#1f8a78',
};

/** Ink (text/icon-on-base) color that meets >=4.5:1 contrast on the base. */
export const COLOR_INK: Record<TileColor, string> = {
  lavender: '#ffffff',
  marigold: '#2a1700',
  fern: '#ffffff',
  rose: '#ffffff',
  bluebell: '#ffffff',
  ivy: '#ffffff',
};

/** Build the `var(--tg-color-…)` reference for a given color + variant. */
export function colorVar(
  color: TileColor,
  variant?: 'soft' | 'deep' | 'ink',
): string {
  return variant
    ? `var(--tg-color-${color}-${variant})`
    : `var(--tg-color-${color})`;
}

/** Garden features (renamed per rename-map.json). */
export const FEATURES = [
  'gazebo', // pavilion
  'birdbath', // fountain
  'gardenGnome', // statue
  'pottingTable', // bench
  'wildseed', // joker token
] as const;
export type Feature = (typeof FEATURES)[number];

export const WILDSEED_HEX = '#9aa0a6';
