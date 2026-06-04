/**
 * Tomsgarden AI — public entry point.
 *
 * `createBot(difficulty)` maps each difficulty to its own module so the
 * strategy agent can replace easy/medium/hard internals independently.
 * `botScheduling.ts` holds the pure server-side scheduling helpers.
 */

export type { Bot, BotDifficulty } from './types.js';
export { RandomBot } from './random.js';
export { EasyBot } from './easy.js';
export { MediumBot } from './medium.js';
export { HardBot } from './hard.js';
export * from './botScheduling.js';
export * from './eval.js';

import { EasyBot } from './easy.js';
import { MediumBot } from './medium.js';
import { HardBot } from './hard.js';
import type { Bot, BotDifficulty } from './types.js';

export function createBot(difficulty: BotDifficulty): Bot {
  switch (difficulty) {
    case 'easy':
      return EasyBot;
    case 'medium':
      return MediumBot;
    case 'hard':
      return HardBot;
  }
}

export function isBotDifficulty(v: unknown): v is BotDifficulty {
  return v === 'easy' || v === 'medium' || v === 'hard';
}
