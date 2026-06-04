/**
 * HARD difficulty bot — bounded 2-own-ply maximin search + opponent modeling,
 * optimizing relative standing (win probability proxy) rather than raw points.
 *
 * For each top root candidate (ranked by the Medium-grade evaluation):
 *   - look one own ply ahead (spending moves) with a node budget;
 *   - estimate DENIAL: how much the move reduces the best visible immediate
 *     option of each live opponent (their legal moves' eval delta);
 *   - score = own eval + discounted follow-up + denial bonus, all framed
 *     RELATIVE to the best opponent's evaluation.
 * Risk posture adapts: when behind late, prefer high-upside (group/6-set)
 * potential; when leading late, prefer realized points (handled by shifting
 * weight from speculative terms to realized score).
 *
 * Strict node budget keeps worst-case chooseAction well under ~1.5s.
 */

import { applyAction, generateLegalMoves, rulesData } from '../engine/index.js';
import type { EngineAction, EngineGameState } from '../engine/index.js';
import {
  evaluatePlayer,
  bestGreedyDelta,
  DEFAULT_WEIGHTS,
  type EvalWeights,
} from './eval.js';
import type { Bot } from './types.js';

const { ROUNDS } = rulesData;

const ROOT_CAP = 22; // root candidates expanded fully
const CHILD_CAP = 12; // own follow-up moves per candidate
const OPP_MOVES_CAP = 12; // opponent moves sampled for denial modeling
const FOLLOWUP_DISCOUNT = 0.65;
const DENIAL_WEIGHT = 0.3;

/** Risk-adjusted weights: leading => realize points; behind => speculate. */
function postureWeights(
  state: EngineGameState,
  playerId: string,
): EvalWeights {
  const me = state.players.find((p) => p.id === playerId);
  const bestOpp = Math.max(
    ...state.players.filter((p) => p.id !== playerId).map((p) => p.score),
  );
  const lead = (me?.score ?? 0) - bestOpp;
  const progress = (state.round - 1) / (ROUNDS - 1); // 0..1
  // shift in [-1, 1]: positive = behind late (gamble), negative = ahead late (safe)
  const shift = Math.max(-1, Math.min(1, -lead / 12)) * progress;
  return {
    ...DEFAULT_WEIGHTS,
    finalPotential: DEFAULT_WEIGHTS.finalPotential * (1 + 0.5 * shift),
    futureWheel: DEFAULT_WEIGHTS.futureWheel * (1 + 0.4 * shift),
    roundPending: DEFAULT_WEIGHTS.roundPending * (1 - 0.2 * shift),
    leftoverRisk: DEFAULT_WEIGHTS.leftoverRisk * (1 - 0.3 * shift),
  };
}

function bestFollowup(
  state: EngineGameState,
  playerId: string,
  w: EvalWeights,
): number {
  const idx = state.players.findIndex((p) => p.id === playerId);
  const standPat = evaluatePlayer(state, playerId, w);
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
    if (m.type !== 'PlaceTile' && m.type !== 'PlaceExpansion') continue;
    if (++n > CHILD_CAP) break;
    try {
      const v = evaluatePlayer(applyAction(forced, m), playerId, w);
      if (v > best) best = v;
    } catch {
      /* skip */
    }
  }
  return best;
}

/** Sum over live opponents of their best visible immediate eval delta. */
function opponentsBestVisible(
  state: EngineGameState,
  playerId: string,
  w: EvalWeights,
): number {
  let total = 0;
  for (const opp of state.players) {
    if (opp.id === playerId || opp.passed) continue;
    total += bestGreedyDelta(state, opp.id, w, OPP_MOVES_CAP);
  }
  return total;
}

export const HardBot: Bot = {
  name: 'HardBot',
  chooseAction(state, playerId, rng) {
    const moves = generateLegalMoves(state, playerId);
    if (moves.length === 0) {
      throw new Error(`HardBot: no legal moves for ${playerId}`);
    }
    const w = postureWeights(state, playerId);
    const liveOpponents = state.players.some(
      (p) => p.id !== playerId && !p.passed,
    );
    const oppBefore = liveOpponents
      ? opponentsBestVisible(state, playerId, w)
      : 0;

    // Stage 1: static ranking of all root moves.
    const staged: {
      move: EngineAction;
      next: EngineGameState;
      value: number;
    }[] = [];
    for (const move of moves) {
      try {
        const next = applyAction(state, move);
        let value = evaluatePlayer(next, playerId, w);
        if (move.type === 'Pass') value -= 1.0; // hold turns while options exist
        staged.push({ move, next, value });
      } catch {
        /* skip */
      }
    }
    if (staged.length === 0) return moves[moves.length - 1];
    staged.sort((a, b) => b.value - a.value);

    // Stage 2: deep scoring of the top candidates.
    let bestMove = staged[0].move;
    let bestScore = -Infinity;
    const cap = Math.min(ROOT_CAP, staged.length);
    for (let i = 0; i < cap; i++) {
      const c = staged[i];
      const follow = bestFollowup(c.next, playerId, w);
      let score = c.value + FOLLOWUP_DISCOUNT * Math.max(0, follow - c.value);

      // Denial: only Acquire/BuyExpansion meaningfully alter what opponents
      // can take (they consume the shared display/supply). Reward moves that
      // shrink opponents' best visible option.
      if (
        liveOpponents &&
        (c.move.type === 'Acquire' || c.move.type === 'BuyExpansion')
      ) {
        const oppAfter = opponentsBestVisible(c.next, playerId, w);
        score += DENIAL_WEIGHT * Math.max(0, oppBefore - oppAfter);
      }

      const jitter = rng.next() * 1e-6; // deterministic tiebreak variety
      if (score + jitter > bestScore) {
        bestScore = score + jitter;
        bestMove = c.move;
      }
    }
    return bestMove;
  },
};
