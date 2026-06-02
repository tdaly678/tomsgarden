import { describe, expect, it } from 'vitest';
import { applyAction } from './index.js';
import type { GameState } from '../types.js';

const emptyState: GameState = {
  roomId: 'test',
  phase: 'lobby',
  round: 0,
  players: [],
  activePlayerIndex: null,
  factories: [],
  center: [],
  bagCount: 0,
  winnerId: null,
};

describe('engine stub', () => {
  it('applyAction throws "not implemented" until the engine is built', () => {
    expect(() =>
      applyAction(emptyState, { type: 'EndTurn', playerId: 'p1' }),
    ).toThrow('not implemented');
  });
});
