/**
 * EASY difficulty bot — greedy immediate value with light randomness.
 *
 * Evaluates every legal move by applying it (applyAction is pure) and scoring
 * the immediate evaluation delta, then picks uniformly among the top-3 moves
 * via the supplied Rng so play is varied and beatable. Pure & deterministic
 * given (state, playerId, rng).
 */

import { generateLegalMoves } from '../engine/index.js';
import type { EngineAction } from '../engine/index.js';
import { evaluateMove, DEFAULT_WEIGHTS, type EvalWeights } from './eval.js';
import type { Bot } from './types.js';

/** Easy plays a flatter, more myopic evaluation (mostly immediate points). */
const EASY_WEIGHTS: EvalWeights = {
  ...DEFAULT_WEIGHTS,
  futureWheel: 0.1,
  finalPotential: 0.3,
  storageMatch: 0.15,
  leftoverRisk: 0.15,
};

export const EasyBot: Bot = {
  name: 'EasyBot',
  chooseAction(state, playerId, rng) {
    const moves = generateLegalMoves(state, playerId);
    if (moves.length === 0) {
      throw new Error(`EasyBot: no legal moves for ${playerId}`);
    }
    const scored: { move: EngineAction; delta: number }[] = [];
    for (const move of moves) {
      try {
        const { delta } = evaluateMove(state, playerId, move, EASY_WEIGHTS);
        // Slightly discourage passing while other options exist.
        scored.push({ move, delta: move.type === 'Pass' ? delta - 0.5 : delta });
      } catch {
        /* skip any move the engine rejects (should not happen) */
      }
    }
    if (scored.length === 0) return moves[moves.length - 1]; // Pass
    scored.sort((a, b) => b.delta - a.delta);
    const k = Math.min(3, scored.length);
    return scored[rng.int(k)].move;
  },
};
