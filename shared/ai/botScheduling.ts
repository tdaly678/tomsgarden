/**
 * Pure helpers for server-side bot turn scheduling. Kept network-free here so
 * they can be unit-tested without the PartyKit runtime.
 */

import type { EngineGameState } from '../engine/model.js';
import { makeRng } from '../engine/rng.js';
import type { Rng } from '../engine/rng.js';

/** Bot "thinking" delay bounds (human-feeling). */
export const BOT_DELAY_MIN_MS = 800;
export const BOT_DELAY_MAX_MS = 1500;

/** Id of the currently active player, or null (between phases / no game). */
export function activePlayerId(state: EngineGameState | null): string | null {
  if (!state) return null;
  const idx = state.activePlayerIndex;
  if (idx === null) return null;
  return state.players[idx]?.id ?? null;
}

/**
 * Should a bot move be scheduled? True only when the game is in the drafting
 * phase and the active player is one of `botPlayerIds`.
 */
export function shouldScheduleBotMove(
  state: EngineGameState | null,
  botPlayerIds: ReadonlySet<string>,
): string | null {
  if (!state || state.phase !== 'drafting') return null;
  const id = activePlayerId(state);
  return id !== null && botPlayerIds.has(id) ? id : null;
}

/** Deterministic-given-rng delay in [BOT_DELAY_MIN_MS, BOT_DELAY_MAX_MS]. */
export function botDelayMs(rng: Rng): number {
  return BOT_DELAY_MIN_MS + rng.int(BOT_DELAY_MAX_MS - BOT_DELAY_MIN_MS + 1);
}

/**
 * A monotonically-derived "turn key" identifying the exact decision point a
 * scheduled bot move was computed for. When the timer fires, the server
 * recomputes the key; if it differs (state advanced, round changed, someone
 * reconnected and acted, the DO restarted and rescheduled), the stale timer
 * MUST no-op. This is the double-fire / out-of-turn protection.
 */
export function turnKey(state: EngineGameState | null): string {
  if (!state) return 'none';
  return `${state.phase}:${state.round}:${state.activePlayerIndex}:${state.rngState}:${state.players.map((p) => `${p.passed ? 1 : 0}.${p.score}.${p.storage.length}.${p.placed.length}`).join(',')}`;
}

/** Per-decision RNG for a bot move, derived from game rng state + key hash. */
export function botMoveRng(state: EngineGameState): Rng {
  let h = state.rngState >>> 0;
  const key = turnKey(state);
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) >>> 0;
  return makeRng(h);
}
