/**
 * Tomsgarden rules engine — public entry point.
 *
 * The faithful, pure, deterministic Queen's Garden engine lives in `./core.ts`
 * and operates on the richer `EngineGameState` / `EngineAction` model in
 * `./model.ts` + `./actions.ts` (the thin wire types in `../types.ts` do not
 * carry hex gardens, storage, jokers, the scoring wheel, or expansions).
 *
 * Everything here is UI- and network-free. Randomness (tile-bag shuffling) is
 * driven by a seedable PRNG so games are reproducible and testable.
 */

export * from './model.js';
export * from './actions.js';
export * from './rng.js';
export {
  IllegalMoveError,
  setupGame,
  generateLegalMoves,
  applyAction,
  scoreRound,
  scoreRoundForPlayer,
  advanceRound,
  scoreFinal,
  scoreFinalForPlayer,
  checkWin,
  canPlaceHexAt,
  validatePayment,
  countTilesInStorage,
  countJokers,
  countRealTiles,
} from './core.js';
export type { SetupOptions } from './core.js';
export * as rulesData from './rules-data.js';
