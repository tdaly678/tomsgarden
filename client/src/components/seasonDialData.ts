/**
 * Season Dial (rename of the rotary scoring wheel).
 *
 * The dial has 4 quadrants — one per round — each pointing at 3 of the 12
 * categories (6 patterns + 6 colors) scored that round. Per rules.json
 * `roundScoring.rotaryWheel.standardSideQuadrants`. Engine color names are used
 * (purple..orange) instead of color1..color6.
 */

import type { TileColor } from './boardModel';
import type { PatternId } from './theme';

export type DialCategory =
  | { kind: 'pattern'; id: PatternId }
  | { kind: 'color'; id: TileColor };

export interface DialQuadrant {
  readonly round: number;
  readonly categories: DialCategory[];
}

/**
 * Standard side of the dial — 4 rounds, 3 categories each.
 *
 * MUST mirror rules.json roundScoring.rotaryWheel.standardSideQuadrants via
 * the engineAdapter color/pattern index maps (color1->purple, color2->green,
 * color3->orange, color4->red, color5->blue, color6->yellow; patternN->Nth
 * board pattern), otherwise the dial misreports what actually scores.
 */
export const DIAL_QUADRANTS: DialQuadrant[] = [
  {
    round: 1,
    // engine: pattern1, color1, color2
    categories: [
      { kind: 'pattern', id: 'sapling' },
      { kind: 'color', id: 'purple' },
      { kind: 'color', id: 'green' },
    ],
  },
  {
    round: 2,
    // engine: pattern2, pattern3, color3
    categories: [
      { kind: 'pattern', id: 'robin' },
      { kind: 'pattern', id: 'ladybug' },
      { kind: 'color', id: 'orange' },
    ],
  },
  {
    round: 3,
    // engine: pattern4, color4, color5
    categories: [
      { kind: 'pattern', id: 'sunflower' },
      { kind: 'color', id: 'red' },
      { kind: 'color', id: 'blue' },
    ],
  },
  {
    round: 4,
    // engine: pattern5, pattern6, color6
    categories: [
      { kind: 'pattern', id: 'snail' },
      { kind: 'pattern', id: 'beehive' },
      { kind: 'color', id: 'yellow' },
    ],
  },
];

/** Rotation (deg) so the active round's quadrant sits under the pointer (top). */
export function dialRotationForRound(round: number): number {
  // 4 quadrants of 90deg; round 1 starts at top. Rotate so round N is at top.
  const idx = Math.max(0, Math.min(3, round - 1));
  return -idx * 90;
}
