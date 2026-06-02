/**
 * Tomsgarden rules engine — STUB.
 *
 * Another agent owns the real implementation (see `shared/rules/`). This module
 * defines the canonical, typed function signatures the rest of the codebase
 * (server room, client previews, tests) should depend on. Every function
 * currently throws "not implemented".
 */

import type { Action, GameState, PlayerState } from '../types.js';

/**
 * Enumerate all legal actions for the given player in the current state.
 * Used by the server to validate moves and by the client to render hints.
 */
export function generateLegalMoves(
  _state: GameState,
  _playerId: string,
): Action[] {
  throw new Error('not implemented: generateLegalMoves');
}

/**
 * Apply an action to a state, returning the next authoritative state.
 * Must be pure (no mutation of the input) and deterministic given its inputs.
 * Throws on illegal actions.
 */
export function applyAction(_state: GameState, _action: Action): GameState {
  throw new Error('not implemented: applyAction');
}

/**
 * Score the current round, returning the state with per-player scores updated
 * and the phase advanced. Does not award end-of-game bonuses.
 */
export function scoreRound(_state: GameState): GameState {
  throw new Error('not implemented: scoreRound');
}

/**
 * Apply end-of-game bonus scoring (completed rows/columns/colors, etc.) and
 * return the final state.
 */
export function scoreFinal(_state: GameState): GameState {
  throw new Error('not implemented: scoreFinal');
}

/**
 * Determine whether the game has reached a winning condition. Returns the
 * winning `PlayerState` if the game is over, otherwise `null`.
 */
export function checkWin(_state: GameState): PlayerState | null {
  throw new Error('not implemented: checkWin');
}
