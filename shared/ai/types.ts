/**
 * Bot harness — interfaces only. Strategy implementations live in
 * `easy.ts` / `medium.ts` / `hard.ts` (one module per difficulty, each
 * exporting a `Bot`); the strategy agent fills those in. The baseline
 * `RandomBot` lives in `random.ts`.
 *
 * Contract:
 *  - `chooseAction` must be PURE and DETERMINISTIC given (state, playerId,
 *    rng): same inputs + same rng state => same action. Never call
 *    Math.random; use the supplied `Rng`.
 *  - The returned action MUST come from (or be equivalent to a member of)
 *    `generateLegalMoves(state, playerId)` — those moves are canonical and
 *    guaranteed applicable via `applyAction`.
 *  - Bots never mutate `state`.
 */

import type { EngineGameState } from '../engine/model.js';
import type { EngineAction } from '../engine/actions.js';
import type { Rng } from '../engine/rng.js';

export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface Bot {
  /** Human-readable strategy name (for logs / debugging). */
  readonly name: string;
  /**
   * Pick the action this bot plays for `playerId`, who must be the active
   * player in `state`. Throws if there are no legal moves (the engine always
   * offers Pass during drafting, so this only happens on misuse).
   */
  chooseAction(state: EngineGameState, playerId: string, rng: Rng): EngineAction;
}
