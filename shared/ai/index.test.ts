/**
 * AI harness tests: full bot-vs-bot games to completion, seed determinism,
 * createBot wiring, and the pure bot-scheduling helpers used by the server.
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
import {
  createBot,
  RandomBot,
  EasyBot,
  MediumBot,
  HardBot,
  isBotDifficulty,
  shouldScheduleBotMove,
  botDelayMs,
  botMoveRng,
  turnKey,
  BOT_DELAY_MIN_MS,
  BOT_DELAY_MAX_MS,
} from './index.js';
import type { Bot } from './index.js';

function setup(numPlayers: number, seed: number): EngineGameState {
  return setupGame({
    roomId: 'ai-test',
    players: Array.from({ length: numPlayers }, (_, i) => ({
      id: `bot-${i}`,
      name: `Bot ${i}`,
    })),
    seed,
    startingPlayerIndex: 0,
    config: DEFAULT_CONFIG,
  });
}

/**
 * Drive a full game with the given bot playing every seat, mirroring the
 * server loop: bot move -> applyAction -> scoreRound/advanceRound on 'scoring'.
 * Returns the finished state.
 */
function playFullGame(bot: Bot, numPlayers: number, seed: number): EngineGameState {
  let state = setup(numPlayers, seed);
  const rng = makeRng(seed ^ 0xbeef);
  let guard = 0;
  while (state.phase !== 'finished') {
    if (++guard > 5000) throw new Error('game did not terminate');
    if (state.phase === 'scoring') {
      state = advanceRound(scoreRound(state));
      continue;
    }
    const idx = state.activePlayerIndex;
    expect(idx).not.toBeNull();
    const playerId = state.players[idx!].id;
    const action = bot.chooseAction(state, playerId, rng);
    state = applyAction(state, action); // throws if the bot picked an illegal move
  }
  return state;
}

describe('RandomBot full-game simulation', () => {
  for (const n of [2, 3, 4]) {
    it(`plays a ${n}-player game to completion with only legal moves`, () => {
      const final = playFullGame(RandomBot, n, 1234 + n);
      expect(final.phase).toBe('finished');
      expect(final.round).toBeGreaterThanOrEqual(4);
      expect(final.winnerIds.length).toBeGreaterThan(0);
      for (const p of final.players) expect(Number.isFinite(p.score)).toBe(true);
    });
  }

  it('is deterministic: same seed => identical final state', () => {
    const a = playFullGame(RandomBot, 3, 777);
    const b = playFullGame(RandomBot, 3, 777);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it('different seeds (usually) diverge', () => {
    const a = playFullGame(RandomBot, 2, 1);
    const b = playFullGame(RandomBot, 2, 2);
    // Not guaranteed in theory, but with these seeds the games differ.
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });
});

describe('Bot determinism contract', () => {
  it('chooseAction returns the same action for the same state + rng seed', () => {
    const state = setup(2, 42);
    const id = state.players[state.activePlayerIndex!].id;
    const a1 = RandomBot.chooseAction(state, id, makeRng(99));
    const a2 = RandomBot.chooseAction(state, id, makeRng(99));
    expect(a1).toEqual(a2);
  });
});

describe('createBot', () => {
  it('maps each difficulty to its module bot', () => {
    expect(createBot('easy')).toBe(EasyBot);
    expect(createBot('medium')).toBe(MediumBot);
    expect(createBot('hard')).toBe(HardBot);
  });

  it('every difficulty currently plays legal full games (placeholder = random)', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const final = playFullGame(createBot(d), 2, 555);
      expect(final.phase).toBe('finished');
    }
  });

  it('isBotDifficulty validates strictly', () => {
    expect(isBotDifficulty('easy')).toBe(true);
    expect(isBotDifficulty('hard')).toBe(true);
    expect(isBotDifficulty('extreme')).toBe(false);
    expect(isBotDifficulty(1)).toBe(false);
    expect(isBotDifficulty(undefined)).toBe(false);
  });
});

describe('bot scheduling helpers (pure)', () => {
  it('shouldScheduleBotMove returns the bot id only when a bot is active in drafting', () => {
    const state = setup(2, 7);
    const activeId = state.players[state.activePlayerIndex!].id;
    expect(shouldScheduleBotMove(state, new Set([activeId]))).toBe(activeId);
    expect(shouldScheduleBotMove(state, new Set(['someone-else']))).toBeNull();
    expect(shouldScheduleBotMove(null, new Set([activeId]))).toBeNull();
    expect(
      shouldScheduleBotMove({ ...state, phase: 'finished' }, new Set([activeId])),
    ).toBeNull();
  });

  it('botDelayMs stays within the human-feeling window and is rng-deterministic', () => {
    for (let s = 0; s < 50; s++) {
      const d = botDelayMs(makeRng(s));
      expect(d).toBeGreaterThanOrEqual(BOT_DELAY_MIN_MS);
      expect(d).toBeLessThanOrEqual(BOT_DELAY_MAX_MS);
      expect(botDelayMs(makeRng(s))).toBe(d);
    }
  });

  it('turnKey changes when the state advances (stale-timer guard works)', () => {
    const state = setup(2, 11);
    const key = turnKey(state);
    const id = state.players[state.activePlayerIndex!].id;
    const next = applyAction(state, RandomBot.chooseAction(state, id, makeRng(5)));
    expect(turnKey(next)).not.toEqual(key);
    expect(turnKey(state)).toEqual(key); // stable for unchanged state
    expect(turnKey(null)).toBe('none');
  });

  it('botMoveRng is deterministic per decision point', () => {
    const state = setup(2, 13);
    const id = state.players[state.activePlayerIndex!].id;
    const a = RandomBot.chooseAction(state, id, botMoveRng(state));
    const b = RandomBot.chooseAction(state, id, botMoveRng(state));
    expect(a).toEqual(b);
  });
});
