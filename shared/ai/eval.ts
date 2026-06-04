/**
 * Shared evaluation utilities for the AI strategies.
 *
 * All functions are pure. They REUSE the engine's own scoring functions
 * (`scoreRoundForPlayer`, `scoreFinalForPlayer`) instead of reimplementing
 * the scoring rules, layering on forward-looking heuristics:
 *
 *  - realized score on the track
 *  - this round's pending wheel score (board hexes vs the current quadrant)
 *  - future rounds' wheel potential (board hexes vs upcoming quadrants)
 *  - final group-scoring potential of the current garden (incl. 6-set bonus)
 *  - storage quality: tiles matching upcoming wheel categories, joker count,
 *    leftover-penalty exposure, affordability of held tiles
 *  - expansion opportunity (free spaces / held expansions / pavilions)
 */

import {
  applyAction,
  scoreFinalForPlayer,
  scoreRoundForPlayer,
  countJokers,
  rulesData,
} from '../engine/index.js';
import type {
  EngineAction,
  EngineGameState,
  PlayerEngineState,
} from '../engine/index.js';

const { PATTERN_VALUE, WHEEL_BY_ROUND, ROUNDS } = rulesData;

/** Tunable weights for the positional evaluation. */
export interface EvalWeights {
  /** Weight on the pending wheel score for the CURRENT round. */
  readonly roundPending: number;
  /** Weight on wheel potential for FUTURE rounds (per matching hex value). */
  readonly futureWheel: number;
  /** Weight on the engine-computed final group-scoring potential. */
  readonly finalPotential: number;
  /** Per-point value of storage tiles that match an upcoming wheel category. */
  readonly storageMatch: number;
  /** Value per joker in storage. */
  readonly joker: number;
  /** Penalty weight on leftover-tile exposure (sum of pattern values). */
  readonly leftoverRisk: number;
  /** Value per free placeable garden space (expansion room). */
  readonly freeSpace: number;
  /** Value per held (unplaced) garden expansion. */
  readonly heldExpansion: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  roundPending: 1.0,
  futureWheel: 0.45,
  finalPotential: 0.85,
  storageMatch: 0.25,
  joker: 0.8,
  leftoverRisk: 0.3,
  freeSpace: 0.15,
  heldExpansion: 0.5,
};

/** Categories the wheel will score in rounds `from..4` (inclusive). */
export function upcomingCategories(fromRound: number): Set<string> {
  const out = new Set<string>();
  for (let r = fromRound; r <= ROUNDS; r++) {
    for (const c of WHEEL_BY_ROUND[r] ?? []) out.add(c);
  }
  return out;
}

/** Wheel score this player's garden would earn for rounds `from..4`. */
export function futureWheelScore(p: PlayerEngineState, fromRound: number): number {
  let total = 0;
  for (let r = fromRound; r <= ROUNDS; r++) {
    total += scoreRoundForPlayer(p, r);
  }
  return total;
}

/** Sum of pattern values of real tiles left in storage (pass/final penalty exposure). */
export function leftoverExposure(p: PlayerEngineState): number {
  let total = 0;
  for (const s of p.storage) {
    if (s.kind === 'tile') total += PATTERN_VALUE[s.hex.pattern];
  }
  for (const e of p.expansionStore) {
    if (e.hex) total += PATTERN_VALUE[e.hex.pattern];
  }
  return total;
}

/** Value of storage tiles measured against categories still to be scored. */
export function storageMatchValue(
  p: PlayerEngineState,
  fromRound: number,
): number {
  const upcoming = upcomingCategories(fromRound);
  let total = 0;
  for (const s of p.storage) {
    if (s.kind !== 'tile') continue;
    const v = PATTERN_VALUE[s.hex.pattern];
    if (upcoming.has(s.hex.pattern)) total += v;
    if (upcoming.has(s.hex.color)) total += v;
  }
  return total;
}

/** Count free, placeable (non-feature, unoccupied) garden spaces. */
export function freePlaceableSpaces(p: PlayerEngineState): number {
  const occupied = new Set(p.placed.map((x) => `${x.at.q},${x.at.r}`));
  let n = 0;
  for (const s of p.spaces) {
    if (s.feature) continue;
    if (!occupied.has(`${s.at.q},${s.at.r}`)) n++;
  }
  return n;
}

/**
 * Static positional evaluation of one player. Higher = better. Approximates
 * "expected final score": realized score + pending wheel scores for the rest
 * of the game + final group potential + storage heuristics.
 */
export function evaluatePlayer(
  state: EngineGameState,
  playerId: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): number {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return 0;
  const round = state.round;

  // Pending wheel score: this round (certain, if not yet scored) + future.
  const thisRound = scoreRoundForPlayer(p, round);
  const future = futureWheelScore(p, round + 1);

  // Final group potential via the engine's own final scorer — but exclude its
  // storage-penalty component (we weight leftover risk separately, since the
  // player still has turns to spend storage).
  const finalRaw = scoreFinalForPlayer(p, state.config);
  const storageComponent = countJokers(p) - leftoverExposure(p);
  const groupPotential = finalRaw - storageComponent;

  // Late game, leftover exposure matters more (less time to spend tiles).
  const progress = (round - 1) / (ROUNDS - 1); // 0..1
  const leftoverWeight = weights.leftoverRisk * (0.5 + 1.5 * progress);

  return (
    p.score +
    weights.roundPending * thisRound +
    weights.futureWheel * future +
    weights.finalPotential * groupPotential +
    weights.storageMatch * storageMatchValue(p, round) +
    weights.joker * countJokers(p) -
    leftoverWeight * leftoverExposure(p) +
    weights.freeSpace * Math.min(freePlaceableSpaces(p), 14) +
    weights.heldExpansion * p.expansionStore.length
  );
}

/**
 * Evaluate a legal move for `playerId` by applying it and measuring the
 * evaluation delta. Pure (applyAction is pure).
 */
export function evaluateMove(
  state: EngineGameState,
  playerId: string,
  action: EngineAction,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): { next: EngineGameState; delta: number } {
  const before = evaluatePlayer(state, playerId, weights);
  const next = applyAction(state, action);
  const after = evaluatePlayer(next, playerId, weights);
  return { next, delta: after - before };
}

/**
 * Denial value of a move: how much it reduces the best visible immediate
 * option available to opponents. Approximated by the drop in each opponent's
 * best single-move evaluation delta between `before` and `after`.
 * Cheap variant: only considers Acquire-style availability (what the move
 * removed from the shared display), measured via opponents' best greedy delta.
 */
export function denialValue(
  before: EngineGameState,
  after: EngineGameState,
  playerId: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  movesCap = 24,
): number {
  let total = 0;
  for (const opp of before.players) {
    if (opp.id === playerId || opp.passed) continue;
    const b = bestGreedyDelta(before, opp.id, weights, movesCap);
    const a = bestGreedyDelta(after, opp.id, weights, movesCap);
    total += Math.max(0, b - a);
  }
  return total;
}

/**
 * Best immediate evaluation delta the given player could get if it were their
 * turn right now (their seat forced active). Used for opponent modeling.
 */
export function bestGreedyDelta(
  state: EngineGameState,
  playerId: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
  movesCap = 24,
): number {
  const forced = forceActive(state, playerId);
  if (!forced) return 0;
  // Lazy import to avoid a cycle: generateLegalMoves lives in the engine.
  const moves = legalMovesOf(forced, playerId);
  let best = 0;
  let n = 0;
  for (const m of moves) {
    if (m.type === 'Pass') continue;
    if (++n > movesCap) break;
    try {
      const { delta } = evaluateMove(forced, playerId, m, weights);
      if (delta > best) best = delta;
    } catch {
      /* ignore — canonical moves should not throw */
    }
  }
  return best;
}

import { generateLegalMoves } from '../engine/index.js';

function legalMovesOf(state: EngineGameState, playerId: string): EngineAction[] {
  return generateLegalMoves(state, playerId);
}

/** Return a state where `playerId` is the active player (or null if passed/absent). */
function forceActive(
  state: EngineGameState,
  playerId: string,
): EngineGameState | null {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return null;
  if (state.players[idx].passed) return null;
  if (state.phase !== 'drafting') return null;
  if (state.activePlayerIndex === idx) return state;
  return { ...state, activePlayerIndex: idx };
}

/** Score of the best opponent (for relative/win-probability framing). */
export function bestOpponentEval(
  state: EngineGameState,
  playerId: string,
  weights: EvalWeights = DEFAULT_WEIGHTS,
): number {
  let best = -Infinity;
  for (const p of state.players) {
    if (p.id === playerId) continue;
    const v = evaluatePlayer(state, p.id, weights);
    if (v > best) best = v;
  }
  return best === -Infinity ? 0 : best;
}
