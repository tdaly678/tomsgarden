/** Unit tests for the shared AI evaluation utilities. */
import { describe, it, expect } from 'vitest';
import {
  setupGame,
  applyAction,
  generateLegalMoves,
  makeRng,
  DEFAULT_CONFIG,
} from '../engine/index.js';
import {
  evaluatePlayer,
  evaluateMove,
  upcomingCategories,
  futureWheelScore,
  leftoverExposure,
  storageMatchValue,
  freePlaceableSpaces,
  bestGreedyDelta,
  bestOpponentEval,
  denialValue,
  DEFAULT_WEIGHTS,
} from './eval.js';

function setup(seed = 42) {
  return setupGame({
    roomId: 'eval-test',
    players: [
      { id: 'A', name: 'A' },
      { id: 'B', name: 'B' },
    ],
    seed,
    startingPlayerIndex: 0,
    config: DEFAULT_CONFIG,
  });
}

describe('eval utilities', () => {
  it('upcomingCategories covers all 12 categories from round 1', () => {
    expect(upcomingCategories(1).size).toBe(12);
    expect(upcomingCategories(5).size).toBe(0);
  });

  it('initial position evaluates symmetrically for both players', () => {
    const s = setup();
    expect(evaluatePlayer(s, 'A')).toBeCloseTo(evaluatePlayer(s, 'B'), 6);
  });

  it('initial player has 12 free fountain-board spaces and 3 jokers, no leftovers', () => {
    const s = setup();
    const p = s.players[0];
    expect(freePlaceableSpaces(p)).toBe(12);
    expect(leftoverExposure(p)).toBe(0);
    expect(storageMatchValue(p, 1)).toBe(0);
    expect(futureWheelScore(p, 1)).toBe(0);
  });

  it('evaluateMove is pure and returns the applied next state', () => {
    const s = setup();
    const moves = generateLegalMoves(s, 'A');
    const acquire = moves.find((m) => m.type === 'Acquire')!;
    const before = JSON.stringify(s);
    const { next, delta } = evaluateMove(s, 'A', acquire);
    expect(JSON.stringify(s)).toBe(before); // no mutation
    expect(next).not.toBe(s);
    expect(Number.isFinite(delta)).toBe(true);
  });

  it('acquiring tiles matching upcoming wheel categories raises the eval', () => {
    const s = setup();
    const moves = generateLegalMoves(s, 'A').filter((m) => m.type === 'Acquire');
    // At least one acquire should strictly improve the position vs passing.
    const deltas = moves.map((m) => evaluateMove(s, 'A', m).delta);
    expect(Math.max(...deltas)).toBeGreaterThan(0);
  });

  it('bestGreedyDelta is non-negative and bestOpponentEval is finite', () => {
    const s = setup();
    expect(bestGreedyDelta(s, 'B')).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(bestOpponentEval(s, 'A'))).toBe(true);
  });

  it('denialValue is non-negative and zero for a no-op transition', () => {
    const s = setup();
    expect(denialValue(s, s, 'A')).toBe(0);
    const acquire = generateLegalMoves(s, 'A').find((m) => m.type === 'Acquire')!;
    const next = applyAction(s, acquire);
    expect(denialValue(s, next, 'A', DEFAULT_WEIGHTS)).toBeGreaterThanOrEqual(0);
  });

  it('evaluation is deterministic (no hidden randomness)', () => {
    const s = setup(7);
    void makeRng(1);
    expect(evaluatePlayer(s, 'A')).toBe(evaluatePlayer(s, 'A'));
  });
});
