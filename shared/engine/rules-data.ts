/**
 * Typed accessors for the numbers in `shared/rules/rules.json` (source of truth).
 *
 * We import the JSON directly (resolveJsonModule is enabled) so there is exactly
 * one place where these numbers live. This module narrows them to the engine's
 * typed shapes and exposes convenience lookups.
 */

import rules from '../rules/rules.json' with { type: 'json' };
import type { ColorId, FeatureType, PatternId } from './model.js';

export const RULES = rules;

export const PATTERNS: readonly PatternId[] = [
  'pattern1',
  'pattern2',
  'pattern3',
  'pattern4',
  'pattern5',
  'pattern6',
];

export const COLORS: readonly ColorId[] = [
  'color1',
  'color2',
  'color3',
  'color4',
  'color5',
  'color6',
];

/** Pattern value = placement cost = per-hexagon point value. tree=1 .. sixth=6. */
export const PATTERN_VALUE: Record<PatternId, number> = {
  pattern1: rules.placementCosts.byPattern.pattern1,
  pattern2: rules.placementCosts.byPattern.pattern2,
  pattern3: rules.placementCosts.byPattern.pattern3,
  pattern4: rules.placementCosts.byPattern.pattern4,
  pattern5: rules.placementCosts.byPattern.pattern5,
  pattern6: rules.placementCosts.byPattern.pattern6,
};

/** Additional hexagons (beyond the placed one) to discard when placing. */
export const ADDITIONAL_TO_DISCARD: Record<PatternId, number> = {
  pattern1: rules.placementCosts.additionalHexagonsToDiscard.pattern1,
  pattern2: rules.placementCosts.additionalHexagonsToDiscard.pattern2,
  pattern3: rules.placementCosts.additionalHexagonsToDiscard.pattern3,
  pattern4: rules.placementCosts.additionalHexagonsToDiscard.pattern4,
  pattern5: rules.placementCosts.additionalHexagonsToDiscard.pattern5,
  pattern6: rules.placementCosts.additionalHexagonsToDiscard.pattern6,
};

export const COPIES_PER_HEXAGON = rules.tileSet.copiesPerHexagon;
export const STORAGE_TILE_SPACES = rules.storage.tileSpaces;
export const STORAGE_EXPANSION_SPACES = rules.storage.gardenExpansionSpaces;
export const JOKERS_AT_SETUP = rules.tileSet.jokers.perPlayerAtSetup;
export const ROUNDS = rules.rounds.count;
export const STARTING_SCORE = 15;
export const PAVILION_BONUS_PER_ROUND =
  rules.roundScoring.pavilionBonusPerRound;
export const FIRST_PASS_PENALTY =
  rules.roundScoring.passPenalty.firstPlayerToPass;
export const FINAL_MIN_GROUP_SIZE =
  rules.finalScoring.groupScoring.minGroupSize;
export const COMPLETE_SET_BONUS =
  rules.finalScoring.completeSetBonus.groupOfSixDifferent;
export const FOUNTAIN_REFILL_TILES = 4;

/** Jokers awarded when a feature is fully surrounded. */
export const FEATURE_JOKERS: Record<FeatureType, number> = (() => {
  const out: Partial<Record<FeatureType, number>> = {};
  for (const f of rules.features.types) {
    out[f.id as FeatureType] = f.jokersAwardedWhenSurrounded;
  }
  return out as Record<FeatureType, number>;
})();

/** Round (1..4) -> the 3 scored categories (pattern or color) from the wheel. */
export const WHEEL_BY_ROUND: Record<number, readonly (PatternId | ColorId)[]> =
  (() => {
    const out: Record<number, readonly (PatternId | ColorId)[]> = {};
    for (const q of rules.roundScoring.rotaryWheel.standardSideQuadrants) {
      out[q.round] = q.categories as (PatternId | ColorId)[];
    }
    return out;
  })();

export const isPattern = (c: string): c is PatternId =>
  (PATTERNS as readonly string[]).includes(c);
export const isColor = (c: string): c is ColorId =>
  (COLORS as readonly string[]).includes(c);
