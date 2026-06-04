/**
 * AI difficulty benchmarks: self-play across seeded 2-player games asserting
 * the difficulty ordering (Hard > Medium > Easy > Random) plus per-move
 * timing sanity. The always-on suite is sized for CI; set TOMS_AI_BENCH=full
 * for a larger run.
 */
import { describe, it, expect } from 'vitest';
import {
  setupGame,
  applyAction,
  scoreRound,
  advanceRound,
  makeRng,
  DEFAULT_CONFIG,
} from '../engine/index.js';
import type { EngineGameState } from '../engine/index.js';
import { EasyBot, MediumBot, HardBot, RandomBot } from './index.js';
import type { Bot } from './index.js';

const FULL =
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.TOMS_AI_BENCH === 'full';

function playMatch(
  botA: Bot,
  botB: Bot,
  seed: number,
): { a: number; b: number } {
  let state: EngineGameState = setupGame({
    roomId: 'bench',
    players: [
      { id: 'A', name: 'A' },
      { id: 'B', name: 'B' },
    ],
    seed,
    startingPlayerIndex: seed % 2, // alternate first player across seeds
    config: DEFAULT_CONFIG,
  });
  const rng = makeRng(seed ^ 0xc0ffee);
  const bots: Record<string, Bot> = { A: botA, B: botB };
  let guard = 0;
  while (state.phase !== 'finished') {
    if (++guard > 20000) throw new Error('benchmark game did not terminate');
    if (state.phase === 'scoring') {
      state = advanceRound(scoreRound(state));
      continue;
    }
    const idx = state.activePlayerIndex!;
    const id = state.players[idx].id;
    state = applyAction(state, bots[id].chooseAction(state, id, rng));
  }
  const a = state.players.find((p) => p.id === 'A')!.score;
  const b = state.players.find((p) => p.id === 'B')!.score;
  return { a, b };
}

/** Win rate of botA vs botB over n seeded games (ties = half a win each). */
function winRate(botA: Bot, botB: Bot, n: number, baseSeed: number): number {
  let wins = 0;
  for (let i = 0; i < n; i++) {
    const { a, b } = playMatch(botA, botB, baseSeed + i * 7919);
    if (a > b) wins += 1;
    else if (a === b) wins += 0.5;
  }
  return wins / n;
}

describe('AI difficulty ordering benchmarks', () => {
  const N = FULL ? 40 : 12;

  it(
    'Easy beats Random',
    () => {
      const r = winRate(EasyBot, RandomBot, N, 1000);
      expect(r).toBeGreaterThan(0.6);
    },
    180_000,
  );

  it(
    'Medium beats Easy',
    () => {
      const r = winRate(MediumBot, EasyBot, N, 2000);
      expect(r).toBeGreaterThan(0.55);
    },
    180_000,
  );

  it(
    'Hard beats Easy decisively',
    () => {
      const r = winRate(HardBot, EasyBot, N, 3000);
      expect(r).toBeGreaterThan(0.7);
    },
    180_000,
  );

  it(
    'Hard at least matches Medium',
    () => {
      const r = winRate(HardBot, MediumBot, N, 4000);
      expect(r).toBeGreaterThanOrEqual(0.5);
    },
    180_000,
  );
});

describe('AI per-move timing', () => {
  it(
    'worst-case move times stay within budget',
    () => {
      let state: EngineGameState = setupGame({
        roomId: 'timing',
        players: [
          { id: 'A', name: 'A' },
          { id: 'B', name: 'B' },
        ],
        seed: 99,
        startingPlayerIndex: 0,
        config: DEFAULT_CONFIG,
      });
      const rng = makeRng(424242);
      let worstEasy = 0;
      let worstMedium = 0;
      let worstHard = 0;
      let guard = 0;
      while (state.phase !== 'finished') {
        if (++guard > 20000) throw new Error('timing game did not terminate');
        if (state.phase === 'scoring') {
          state = advanceRound(scoreRound(state));
          continue;
        }
        const id = state.players[state.activePlayerIndex!].id;
        // Measure each bot on this real game state.
        let t = performance.now();
        EasyBot.chooseAction(state, id, makeRng(1));
        worstEasy = Math.max(worstEasy, performance.now() - t);
        t = performance.now();
        MediumBot.chooseAction(state, id, makeRng(1));
        worstMedium = Math.max(worstMedium, performance.now() - t);
        t = performance.now();
        const hardMove = HardBot.chooseAction(state, id, rng);
        worstHard = Math.max(worstHard, performance.now() - t);
        state = applyAction(state, hardMove);
      }
      // Loose budgets (CI machines vary): Easy/Medium < 500ms, Hard < 2000ms.
      expect(worstEasy).toBeLessThan(500);
      expect(worstMedium).toBeLessThan(500);
      expect(worstHard).toBeLessThan(2000);
    },
    180_000,
  );
});

describe('strategy bots determinism', () => {
  it('each bot returns the same action for the same state + rng seed', () => {
    const state = setupGame({
      roomId: 'det',
      players: [
        { id: 'A', name: 'A' },
        { id: 'B', name: 'B' },
      ],
      seed: 7,
      startingPlayerIndex: 0,
      config: DEFAULT_CONFIG,
    });
    for (const bot of [EasyBot, MediumBot, HardBot]) {
      const a = bot.chooseAction(state, 'A', makeRng(5));
      const b = bot.chooseAction(state, 'A', makeRng(5));
      expect(a).toEqual(b);
    }
  });
});
