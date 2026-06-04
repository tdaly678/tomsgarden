/**
 * MEDIUM difficulty bot — statistical evaluation + shallow own-ply look-ahead.
 *
 * Uses the full positional evaluation in ./eval.ts (current score, this
 * round's pending wheel score, future wheel potential, final group-sum
 * potential, storage quality vs upcoming wheel rounds, jokers, expansion
 * opportunity). For each top candidate move it looks one ADDITIONAL own ply
 * ahead (opponents approximated as static) within a strict node budget, then
 * picks the best deterministically with an rng micro-tiebreak.
 */

import { applyAction, generateLegalMoves } from '../engine/index.js';
import type { EngineAction, EngineGameState } from '../engine/index.js';
import { evaluatePlayer, DEFAULT_WEIGHTS, type EvalWeights } from './eval.js';
import type { Bot } from './types.js';

const WEIGHTS: EvalWeights = DEFAULT_WEIGHTS;

/** Hard node budget so worst-case move time stays well under 200ms. */
const ROOT_CAP = 18; // root candidates expanded for look-ahead
const CHILD_CAP = 10; // own follow-up moves considered per root candidate
const FOLLOWUP_DISCOUNT = 0.6;

/** Best own follow-up evaluation from `state` (player forced active). */
function bestFollowup(state: EngineGameState, playerId: string): number {
  const idx = state.players.findIndex((p) => p.id === playerId);
  const standPat = evaluatePlayer(state, playerId, WEIGHTS);
  if (idx === -1 || state.phase !== 'drafting' || state.players[idx].passed) {
    return standPat;
  }
  const forced =
    state.activePlayerIndex === idx
      ? state
      : { ...state, activePlayerIndex: idx };
  const moves = generateLegalMoves(forced, playerId);
  let best = standPat;
  let n = 0;
  for (const m of moves) {
    // Follow-up ply: only consider SPENDING moves (place tile/expansion);
    // the display is contested so drafting again next turn is uncertain.
    if (m.type !== 'PlaceTile' && m.type !== 'PlaceExpansion') continue;
    if (++n > CHILD_CAP) break;
    try {
      const next = applyAction(forced, m);
      const v = evaluatePlayer(next, playerId, WEIGHTS);
      if (v > best) best = v;
    } catch {
      /* canonical moves should not throw; skip defensively */
    }
  }
  return best;
}

export const MediumBot: Bot = {
  name: 'MediumBot',
  chooseAction(state, playerId, rng) {
    const moves = generateLegalMoves(state, playerId);
    if (moves.length === 0) {
      throw new Error(`MediumBot: no legal moves for ${playerId}`);
    }

    // Stage 1: static evaluation of every root move.
    const staged: {
      move: EngineAction;
      next: EngineGameState;
      value: number;
    }[] = [];
    for (const move of moves) {
      try {
        const next = applyAction(state, move);
        let value = evaluatePlayer(next, playerId, WEIGHTS);
        if (move.type === 'Pass') value -= 0.75; // mild reluctance to pass
        staged.push({ move, next, value });
      } catch {
        /* skip */
      }
    }
    if (staged.length === 0) return moves[moves.length - 1]; // Pass
    staged.sort((a, b) => b.value - a.value);

    // Stage 2: one own-ply look-ahead on the top candidates.
    let bestMove = staged[0].move;
    let bestScore = -Infinity;
    const cap = Math.min(ROOT_CAP, staged.length);
    for (let i = 0; i < cap; i++) {
      const c = staged[i];
      const follow = bestFollowup(c.next, playerId);
      const score = c.value + FOLLOWUP_DISCOUNT * Math.max(0, follow - c.value);
      const jitter = rng.next() * 1e-6; // deterministic tiebreak variety
      if (score + jitter > bestScore) {
        bestScore = score + jitter;
        bestMove = c.move;
      }
    }
    return bestMove;
  },
};
