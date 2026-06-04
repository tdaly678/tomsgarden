/**
 * Baseline bot: uniform-random choice over the engine's canonical legal moves.
 * Used as the placeholder behind all three difficulties until the strategy
 * agent replaces easy/medium/hard internals.
 */

import { generateLegalMoves } from '../engine/index.js';
import type { Bot } from './types.js';

export const RandomBot: Bot = {
  name: 'RandomBot',
  chooseAction(state, playerId, rng) {
    const moves = generateLegalMoves(state, playerId);
    if (moves.length === 0) {
      throw new Error(`RandomBot: no legal moves for ${playerId}`);
    }
    return moves[rng.int(moves.length)];
  },
};
