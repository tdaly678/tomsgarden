/**
 * Tomsgarden rules engine — pure, deterministic core.
 *
 * No UI, no network. Every function is pure: it never mutates its inputs and,
 * given the same inputs (including RNG seed/state), produces the same outputs.
 *
 * All numbers come from `shared/rules/rules.json` via `./rules-data.ts`.
 */

import type {
  AcquireAction,
  EngineAction,
  PassAction,
  Payment,
  PlaceTileAction,
} from './actions.js';
import {
  axialKey,
  neighbors,
  type Axial,
  type ColorId,
  type DisplayExpansion,
  type EngineConfig,
  type EngineGameState,
  type FeatureType,
  type GardenSpace,
  type Hexagon,
  type PatternId,
  type PlacedHex,
  type PlayerEngineState,
  type StorageItem,
  DEFAULT_CONFIG,
} from './model.js';
import { makeRng, shuffle } from './rng.js';
import {
  ADDITIONAL_TO_DISCARD,
  COLORS,
  COMPLETE_SET_BONUS,
  COPIES_PER_HEXAGON,
  FEATURE_JOKERS,
  FINAL_MIN_GROUP_SIZE,
  FIRST_PASS_PENALTY,
  FOUNTAIN_REFILL_TILES,
  JOKERS_AT_SETUP,
  PATTERN_VALUE,
  PATTERNS,
  PAVILION_BONUS_PER_ROUND,
  ROUNDS,
  STARTING_SCORE,
  STORAGE_EXPANSION_SPACES,
  STORAGE_TILE_SPACES,
  WHEEL_BY_ROUND,
} from './rules-data.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class IllegalMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalMoveError';
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const hexKey = (h: Hexagon): string => `${h.pattern}:${h.color}`;
const hexEq = (a: Hexagon, b: Hexagon): boolean =>
  a.pattern === b.pattern && a.color === b.color;
const sameHex = hexEq;

function clampScore(n: number): number {
  return n < 0 ? 0 : n;
}

/** Recursively strips `readonly` so cloned working copies can be mutated. */
type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

/** Deep clone returning a deeply-mutable view (the input is never mutated). */
function clone<T>(x: T): Mutable<T> {
  return structuredClone(x) as Mutable<T>;
}

/** Build the full bag of 108 tiles: 6 patterns x 6 colors x 3 copies. */
function buildBag(): Hexagon[] {
  const out: Hexagon[] = [];
  for (const pattern of PATTERNS) {
    for (const color of COLORS) {
      for (let c = 0; c < COPIES_PER_HEXAGON; c++) {
        out.push({ pattern, color });
      }
    }
  }
  return out;
}

/**
 * The fountain board: a central hex (the birdbath/fountain feature) ringed by
 * 12 tile spaces = 13 hex spaces total (rules.gardenBoard.fountainBoard.hexCount).
 * The center is the `fountain` feature; the 6 immediate neighbours + 6 of the
 * next ring give 12 placeable spaces. We place one `pavilion` feature among the
 * outer ring so the +1/pavilion round bonus and surround-award logic are testable.
 */
function fountainBoardSpaces(): GardenSpace[] {
  const center: Axial = { q: 0, r: 0 };
  const spaces: GardenSpace[] = [{ at: center, feature: 'fountain' }];
  // ring 1 (6 spaces) — all placeable
  for (const n of neighbors(center)) {
    spaces.push({ at: n });
  }
  // ring 2 (12 spaces) but we only need 6 more to reach 13 total hexes.
  const ring2 = ring2Coords();
  for (let i = 0; i < 6; i++) {
    spaces.push({ at: ring2[i] });
  }
  return spaces;
}

function ring2Coords(): Axial[] {
  // Hexes at distance 2 from origin, ordered deterministically.
  const out: Axial[] = [];
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      const s = -q - r;
      const dist = (Math.abs(q) + Math.abs(r) + Math.abs(s)) / 2;
      if (dist === 2) out.push({ q, r });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface SetupOptions {
  readonly roomId: string;
  readonly players: { readonly id: string; readonly name: string }[];
  readonly seed: number;
  /** Index of the youngest player who starts round 1. Defaults to 0. */
  readonly startingPlayerIndex?: number;
  readonly config?: EngineConfig;
}

export function setupGame(opts: SetupOptions): EngineGameState {
  const { roomId, players, seed } = opts;
  if (players.length < 2 || players.length > 4) {
    throw new IllegalMoveError(
      `player count ${players.length} out of supported range 2..4`,
    );
  }
  const rng = makeRng(seed);
  const bag = shuffle(buildBag(), rng);

  const playerStates: PlayerEngineState[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    score: STARTING_SCORE,
    spaces: fountainBoardSpaces(),
    placed: [],
    storage: Array.from(
      { length: JOKERS_AT_SETUP },
      () => ({ kind: 'joker' }) as StorageItem,
    ),
    expansionStore: 0,
    passed: false,
  }));

  // Initial display: fill the top expansion of round-1 stack with 4 tiles.
  const firstFill = bag.slice(bag.length - FOUNTAIN_REFILL_TILES);
  const remaining = bag.slice(0, bag.length - FOUNTAIN_REFILL_TILES);

  return {
    roomId,
    phase: 'drafting',
    round: 1,
    players: playerStates,
    activePlayerIndex: opts.startingPlayerIndex ?? 0,
    firstPlayerIndex: opts.startingPlayerIndex ?? 0,
    displayTiles: firstFill,
    displayExpansions: [],
    bag: remaining,
    firstPassTaken: false,
    winnerIds: [],
    rngState: rng.state(),
    config: opts.config ?? DEFAULT_CONFIG,
  };
}

// ---------------------------------------------------------------------------
// Storage / display queries
// ---------------------------------------------------------------------------

export function countTilesInStorage(p: PlayerEngineState): number {
  return p.storage.length;
}
export function countJokers(p: PlayerEngineState): number {
  return p.storage.filter((s) => s.kind === 'joker').length;
}
export function countRealTiles(p: PlayerEngineState): number {
  return p.storage.filter((s) => s.kind === 'tile').length;
}

/** Distinct hexagons available in display for a pattern/color selection. */
function acquirableHexagons(
  state: EngineGameState,
  select: AcquireAction['select'],
): { tiles: Hexagon[]; expansions: DisplayExpansion[] } {
  const matchTile = (h: Hexagon): boolean =>
    select.by === 'pattern'
      ? h.pattern === select.pattern
      : h.color === select.color;

  // Loose display tiles matching, de-duplicated (take only one of identical).
  const seen = new Set<string>();
  const tiles: Hexagon[] = [];
  for (const t of state.displayTiles) {
    if (!matchTile(t)) continue;
    const k = hexKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    tiles.push(t);
  }

  // Matching face-up display expansions (their face hexagon matches).
  const expansions = state.displayExpansions.filter(
    (e) => e.faceUp && matchTile(e.hex),
  );

  return { tiles, expansions };
}

// ---------------------------------------------------------------------------
// Adjacency / placement legality
// ---------------------------------------------------------------------------

function spaceAt(p: PlayerEngineState, at: Axial): GardenSpace | undefined {
  return p.spaces.find((s) => s.at.q === at.q && s.at.r === at.r);
}
function placedAt(p: PlayerEngineState, at: Axial): PlacedHex | undefined {
  return p.placed.find((x) => x.at.q === at.q && x.at.r === at.r);
}

/** Is `at` a free, placeable (non-feature) space? */
function isFreeSpace(p: PlayerEngineState, at: Axial): boolean {
  const s = spaceAt(p, at);
  if (!s || s.feature) return false;
  return !placedAt(p, at);
}

/**
 * Check the two adjacency rules for placing `hex` at `at`:
 *  - either no adjacent placed hexagons, OR shares pattern/color with a neighbour;
 *  - never adjacent to an identical hexagon.
 */
export function canPlaceHexAt(
  p: PlayerEngineState,
  hex: Hexagon,
  at: Axial,
): boolean {
  if (!isFreeSpace(p, at)) return false;
  const adj: PlacedHex[] = [];
  for (const n of neighbors(at)) {
    const ph = placedAt(p, n);
    if (ph) adj.push(ph);
  }
  // never identical adjacent
  if (adj.some((a) => sameHex(a.hex, hex))) return false;
  if (adj.length === 0) return true; // isolated placement allowed
  // must share pattern OR color with at least one neighbour
  return adj.some(
    (a) => a.hex.pattern === hex.pattern || a.hex.color === hex.color,
  );
}

/** All feature spaces fully surrounded *after* a hypothetical placement set. */
function newlySurroundedFeatures(
  before: PlayerEngineState,
  afterPlaced: PlacedHex[],
): FeatureType[] {
  const placedKeys = new Set(afterPlaced.map((x) => axialKey(x.at)));
  const beforeKeys = new Set(before.placed.map((x) => axialKey(x.at)));
  const out: FeatureType[] = [];
  for (const s of before.spaces) {
    if (!s.feature) continue;
    const ring = neighbors(s.at).filter((n) => spaceAt(before, n));
    if (ring.length === 0) continue;
    const allFilledNow = ring.every((n) => placedKeys.has(axialKey(n)));
    const allFilledBefore = ring.every((n) => beforeKeys.has(axialKey(n)));
    if (allFilledNow && !allFilledBefore) out.push(s.feature);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Cost payment validation
// ---------------------------------------------------------------------------

/**
 * Validate that `payment` is a legal way to pay the *additional* cost for
 * placing `hex`. Returns nothing; throws IllegalMoveError on failure.
 *
 * Rules:
 *  - The placed hex must be present in storage (consumed separately).
 *  - Payment length must equal ADDITIONAL_TO_DISCARD[hex.pattern].
 *  - Real-tile payment items + the placed hex together must be all-same-pattern
 *    (different colors) OR all-same-color (different patterns), with NO two
 *    identical hexagons. Jokers are wild and excluded from that constraint.
 *  - All payment items must actually be available in storage.
 */
export function validatePayment(
  p: PlayerEngineState,
  hex: Hexagon,
  payment: readonly Payment[],
): void {
  const needed = ADDITIONAL_TO_DISCARD[hex.pattern];
  if (payment.length !== needed) {
    throw new IllegalMoveError(
      `placing ${hexKey(hex)} needs exactly ${needed} additional item(s), got ${payment.length}`,
    );
  }

  // Verify availability against a working copy of storage.
  const avail = p.storage.map((s) => clone(s));
  const take = (pred: (s: StorageItem) => boolean, what: string): void => {
    const i = avail.findIndex(pred);
    if (i === -1) throw new IllegalMoveError(`storage missing ${what}`);
    avail.splice(i, 1);
  };
  // the placed hex itself
  take(
    (s) => s.kind === 'tile' && sameHex(s.hex, hex),
    `placed tile ${hexKey(hex)}`,
  );
  for (const pay of payment) {
    if (pay.kind === 'joker') {
      take((s) => s.kind === 'joker', 'joker');
    } else {
      take(
        (s) => s.kind === 'tile' && sameHex(s.hex, pay.hex),
        `payment tile ${hexKey(pay.hex)}`,
      );
    }
  }

  // The set rule: all real hexagons involved (placed + real-tile payments).
  const realHexes: Hexagon[] = [
    hex,
    ...payment
      .filter((x): x is Extract<Payment, { kind: 'tile' }> => x.kind === 'tile')
      .map((x) => x.hex),
  ];
  // no two identical
  const keys = realHexes.map(hexKey);
  if (new Set(keys).size !== keys.length) {
    throw new IllegalMoveError('payment contains two identical hexagons');
  }
  if (realHexes.length >= 2) {
    const allSamePattern = realHexes.every(
      (h) => h.pattern === realHexes[0].pattern,
    );
    const allSameColor = realHexes.every((h) => h.color === realHexes[0].color);
    if (!allSamePattern && !allSameColor) {
      throw new IllegalMoveError(
        'payment hexagons must be all-same-pattern or all-same-color',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// generateLegalMoves
// ---------------------------------------------------------------------------

export function generateLegalMoves(
  state: EngineGameState,
  playerId: string,
): EngineAction[] {
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) return [];
  if (state.phase !== 'drafting') return [];
  if (state.activePlayerIndex !== idx) return [];
  const p = state.players[idx];
  if (p.passed) return [];

  const moves: EngineAction[] = [];

  // A) Acquire — every pattern/color that yields >=1 item AND fits in storage.
  const tryAcquire = (select: AcquireAction['select']): void => {
    const { tiles, expansions } = acquirableHexagons(state, select);
    if (tiles.length === 0 && expansions.length === 0) return;
    if (countTilesInStorage(p) + tiles.length > STORAGE_TILE_SPACES) return;
    if (p.expansionStore + expansions.length > STORAGE_EXPANSION_SPACES) return;
    moves.push({ type: 'Acquire', playerId, select });
  };
  for (const pattern of PATTERNS) tryAcquire({ by: 'pattern', pattern });
  for (const color of COLORS) tryAcquire({ by: 'color', color });

  // B) Place a tile — for each distinct storage hexagon, each legal space,
  //    with a canonical cheapest payment (prefer jokers, else other real tiles).
  const distinct = distinctStorageHexes(p);
  for (const hex of distinct) {
    const need = ADDITIONAL_TO_DISCARD[hex.pattern];
    const payment = pickCanonicalPayment(p, hex, need);
    if (!payment) continue; // can't afford
    for (const space of p.spaces) {
      if (canPlaceHexAt(p, hex, space.at)) {
        moves.push({ type: 'PlaceTile', playerId, hex, at: space.at, payment });
      }
    }
  }

  // D) Pass is always legal.
  moves.push({ type: 'Pass', playerId });

  return moves;
}

function distinctStorageHexes(p: PlayerEngineState): Hexagon[] {
  const seen = new Set<string>();
  const out: Hexagon[] = [];
  for (const s of p.storage) {
    if (s.kind !== 'tile') continue;
    const k = hexKey(s.hex);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s.hex);
  }
  return out;
}

/**
 * Choose a legal canonical payment of `need` additional items for placing `hex`:
 * prefer jokers first (they're wild), then real tiles that satisfy the
 * same-pattern/same-color + no-identical constraint. Returns null if impossible.
 */
function pickCanonicalPayment(
  p: PlayerEngineState,
  hex: Hexagon,
  need: number,
): Payment[] | null {
  if (need === 0) {
    // still must own the placed hex
    return p.storage.some((s) => s.kind === 'tile' && sameHex(s.hex, hex))
      ? []
      : null;
  }
  // pool of real tiles excluding the placed hex (one copy reserved for placement)
  const pool: Hexagon[] = [];
  let reserved = false;
  for (const s of p.storage) {
    if (s.kind !== 'tile') continue;
    if (!reserved && sameHex(s.hex, hex)) {
      reserved = true;
      continue;
    }
    pool.push(s.hex);
  }
  if (!reserved) return null; // don't even own the tile

  const jokers = countJokers(p);
  const payment: Payment[] = [];

  // Use jokers first.
  for (let i = 0; i < Math.min(jokers, need); i++) {
    payment.push({ kind: 'joker' });
  }
  let remaining = need - payment.length;
  if (remaining === 0) return payment;

  // Need real tiles; must satisfy the set rule with `hex`.
  // Try same-pattern set (different colors) then same-color set (diff patterns).
  for (const mode of ['pattern', 'color'] as const) {
    const chosen: Hexagon[] = [];
    const usedKeys = new Set<string>([hexKey(hex)]);
    const poolCopy = pool.slice();
    for (let r = 0; r < remaining; r++) {
      const i = poolCopy.findIndex((h) => {
        if (usedKeys.has(hexKey(h))) return false;
        return mode === 'pattern'
          ? h.pattern === hex.pattern
          : h.color === hex.color;
      });
      if (i === -1) break;
      const picked = poolCopy.splice(i, 1)[0];
      chosen.push(picked);
      usedKeys.add(hexKey(picked));
    }
    if (chosen.length === remaining) {
      return [
        ...payment,
        ...chosen.map((h) => ({ kind: 'tile' as const, hex: h })),
      ];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// applyAction
// ---------------------------------------------------------------------------

export function applyAction(
  state: EngineGameState,
  action: EngineAction,
): EngineGameState {
  if (state.phase !== 'drafting') {
    throw new IllegalMoveError(`cannot act in phase ${state.phase}`);
  }
  const idx = state.players.findIndex((p) => p.id === action.playerId);
  if (idx === -1) throw new IllegalMoveError('unknown player');
  if (state.activePlayerIndex !== idx) {
    throw new IllegalMoveError("not this player's turn");
  }
  if (state.players[idx].passed) {
    throw new IllegalMoveError('player has already passed this round');
  }

  switch (action.type) {
    case 'Acquire':
      return advanceTurn(applyAcquire(state, idx, action));
    case 'PlaceTile':
      return advanceTurn(applyPlace(state, idx, action));
    case 'Pass':
      return applyPass(state, idx, action); // pass handles its own turn flow
    default: {
      const _exhaustive: never = action;
      throw new IllegalMoveError(
        `unknown action ${(_exhaustive as { type: string }).type}`,
      );
    }
  }
}

function applyAcquire(
  state: EngineGameState,
  idx: number,
  action: AcquireAction,
): EngineGameState {
  const p = state.players[idx];
  const { tiles, expansions } = acquirableHexagons(state, action.select);
  if (tiles.length === 0 && expansions.length === 0) {
    throw new IllegalMoveError('acquire selection matches nothing in display');
  }
  if (countTilesInStorage(p) + tiles.length > STORAGE_TILE_SPACES) {
    throw new IllegalMoveError('acquire would exceed 12 tile storage spaces');
  }
  if (p.expansionStore + expansions.length > STORAGE_EXPANSION_SPACES) {
    throw new IllegalMoveError(
      'acquire would exceed 2 expansion storage spaces',
    );
  }

  const next = clone(state);
  const np = next.players[idx];

  // Move matched (deduped) tiles into storage; remove ALL matching copies from
  // display, but if duplicates existed only ONE went to storage (rest discarded
  // to the tower / out of play, matching "take only one of identical").
  const matchTile = (h: Hexagon): boolean =>
    action.select.by === 'pattern'
      ? h.pattern === action.select.pattern
      : h.color === action.select.color;

  np.storage.push(...tiles.map((h) => ({ kind: 'tile' as const, hex: h })));
  next.displayTiles = next.displayTiles.filter((t) => !matchTile(t));

  // Acquired expansions leave the display and go to expansion storage.
  const acquiredIds = new Set(expansions.map((e) => e.id));
  np.expansionStore += expansions.length;
  next.displayExpansions = next.displayExpansions.filter(
    (e) => !acquiredIds.has(e.id),
  );

  // Display refill: if at least one loose tile was taken, draw 4 new tiles.
  if (tiles.length > 0 && next.bag.length > 0) {
    const rng = makeRng(next.rngState);
    const drawn: Hexagon[] = [];
    for (let i = 0; i < FOUNTAIN_REFILL_TILES && next.bag.length > 0; i++) {
      drawn.push(next.bag.pop()!);
    }
    next.displayTiles.push(...drawn);
    next.rngState = rng.state();
  }

  return next;
}

function applyPlace(
  state: EngineGameState,
  idx: number,
  action: PlaceTileAction,
): EngineGameState {
  const p = state.players[idx];
  if (!canPlaceHexAt(p, action.hex, action.at)) {
    throw new IllegalMoveError('illegal placement (space/adjacency)');
  }
  validatePayment(p, action.hex, action.payment);

  const next = clone(state);
  const np = next.players[idx];

  // Consume the placed tile + payment items from storage.
  const removeOne = (pred: (s: StorageItem) => boolean): void => {
    const i = np.storage.findIndex(pred);
    np.storage.splice(i, 1);
  };
  removeOne((s) => s.kind === 'tile' && sameHex(s.hex, action.hex));
  for (const pay of action.payment) {
    if (pay.kind === 'joker') removeOne((s) => s.kind === 'joker');
    else removeOne((s) => s.kind === 'tile' && sameHex(s.hex, pay.hex));
  }

  // Place it.
  np.placed.push({ at: action.at, hex: action.hex });

  // Feature surround -> award jokers (capped by free storage space).
  const surrounded = newlySurroundedFeatures(p, np.placed);
  for (const f of surrounded) {
    const award = FEATURE_JOKERS[f] ?? 0;
    const free = STORAGE_TILE_SPACES - np.storage.length;
    const give = Math.max(0, Math.min(award, free));
    for (let i = 0; i < give; i++) np.storage.push({ kind: 'joker' });
    // excess jokers are lost
  }

  return next;
}

function applyPass(
  state: EngineGameState,
  idx: number,
  action: PassAction,
): EngineGameState {
  const next = clone(state);
  const np = next.players[idx];

  // Optional cleanup: discard storage hexagons for MINUS points.
  if (action.discard && action.discard.length > 0) {
    for (const h of action.discard) {
      const i = np.storage.findIndex(
        (s) => s.kind === 'tile' && sameHex(s.hex, h),
      );
      if (i === -1) {
        throw new IllegalMoveError(
          `cannot discard ${hexKey(h)}: not in storage`,
        );
      }
      np.storage.splice(i, 1);
      np.score = clampScore(np.score - PATTERN_VALUE[h.pattern]);
    }
  }

  np.passed = true;

  // First player to pass: take first-player marker + move back 1 (penalty).
  if (!next.firstPassTaken) {
    next.firstPassTaken = true;
    next.firstPlayerIndex = idx;
    np.score = clampScore(np.score + FIRST_PASS_PENALTY);
  }

  return advanceAfterPass(next);
}

// ---------------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------------

function nextActiveIndex(state: EngineGameState, from: number): number | null {
  const n = state.players.length;
  for (let step = 1; step <= n; step++) {
    const cand = (from + step) % n;
    if (!state.players[cand].passed) return cand;
  }
  return null; // everyone passed
}

/** After a non-pass action, pass the turn to the next non-passed player. */
function advanceTurn(state: EngineGameState): EngineGameState {
  const cur = state.activePlayerIndex!;
  const nxt = nextActiveIndex(state, cur);
  if (nxt === null) {
    // No one left to act -> end Phase 1.
    return { ...state, activePlayerIndex: null };
  }
  return { ...state, activePlayerIndex: nxt };
}

/** After a pass, either continue Phase 1 or transition to scoring. */
function advanceAfterPass(state: EngineGameState): EngineGameState {
  const allPassed = state.players.every((p) => p.passed);
  if (allPassed) {
    return { ...state, activePlayerIndex: null, phase: 'scoring' };
  }
  const cur = state.activePlayerIndex!;
  const nxt = nextActiveIndex(state, cur);
  return { ...state, activePlayerIndex: nxt };
}

// ---------------------------------------------------------------------------
// Round scoring (Phase 2)
// ---------------------------------------------------------------------------

/** Count visible (face-up / surrounded-or-not, here: all features of type) pavilions. */
function visiblePavilions(p: PlayerEngineState): number {
  // In this model, pavilion features on the board are always "visible" once the
  // garden exists; count pavilion feature spaces present in the garden.
  return p.spaces.filter((s) => s.feature === 'pavilion').length;
}

export function scoreRoundForPlayer(
  p: PlayerEngineState,
  round: number,
): number {
  const categories = WHEEL_BY_ROUND[round] ?? [];
  let gained = 0;
  for (const ph of p.placed) {
    const value = PATTERN_VALUE[ph.hex.pattern];
    // a hex can score twice: once for matching pattern, once for matching color
    if (categories.includes(ph.hex.pattern as PatternId)) gained += value;
    if (categories.includes(ph.hex.color as ColorId)) gained += value;
  }
  gained += visiblePavilions(p) * PAVILION_BONUS_PER_ROUND;
  return gained;
}

/** Phase 2: apply round scoring to every player. */
export function scoreRound(state: EngineGameState): EngineGameState {
  if (state.phase !== 'scoring') {
    throw new IllegalMoveError(
      `scoreRound expects phase 'scoring', got '${state.phase}'`,
    );
  }
  const next = clone(state);
  for (const p of next.players) {
    p.score = clampScore(p.score + scoreRoundForPlayer(p, next.round));
  }
  return next;
}

/**
 * Advance from a just-scored round to the next round (Phase 3), or to final
 * scoring after round 4.
 */
export function advanceRound(state: EngineGameState): EngineGameState {
  const next = clone(state);
  if (next.round >= ROUNDS) {
    next.phase = 'finished';
    return scoreFinal(next);
  }
  next.round += 1;
  next.phase = 'drafting';
  next.firstPassTaken = false;
  next.activePlayerIndex = next.firstPlayerIndex;
  for (const p of next.players) p.passed = false;

  // Refill display top expansion with 4 tiles for the new round.
  const rng = makeRng(next.rngState);
  const drawn: Hexagon[] = [];
  for (let i = 0; i < FOUNTAIN_REFILL_TILES && next.bag.length > 0; i++) {
    drawn.push(next.bag.pop()!);
  }
  next.displayTiles.push(...drawn);
  next.rngState = rng.state();
  return next;
}

// ---------------------------------------------------------------------------
// Final scoring
// ---------------------------------------------------------------------------

/** Connected groups (adjacent) of placed hexes sharing the given key fn value. */
function groupsBy(
  placed: readonly PlacedHex[],
  category: PatternId | ColorId,
  by: 'pattern' | 'color',
): PlacedHex[][] {
  const members = placed.filter((x) =>
    by === 'pattern' ? x.hex.pattern === category : x.hex.color === category,
  );
  const byKey = new Map<string, PlacedHex>();
  for (const m of members) byKey.set(axialKey(m.at), m);

  const visited = new Set<string>();
  const groups: PlacedHex[][] = [];
  for (const m of members) {
    const start = axialKey(m.at);
    if (visited.has(start)) continue;
    const group: PlacedHex[] = [];
    const stack = [m];
    visited.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      group.push(cur);
      for (const n of neighbors(cur.at)) {
        const k = axialKey(n);
        if (visited.has(k)) continue;
        const nb = byKey.get(k);
        if (nb) {
          visited.add(k);
          stack.push(nb);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

export function scoreFinalForPlayer(
  p: PlayerEngineState,
  config: EngineConfig,
): number {
  let total = 0;

  // 1) Empty-storage scoring.
  for (const s of p.storage) {
    if (s.kind === 'joker') total += 1;
    else total -= PATTERN_VALUE[s.hex.pattern];
  }

  // 2) Group evaluation: 6 colors then 6 patterns.
  const evaluate = (category: PatternId | ColorId, by: 'pattern' | 'color') => {
    for (const group of groupsBy(p.placed, category, by)) {
      if (group.length < FINAL_MIN_GROUP_SIZE) continue;
      if (config.finalGroupScoring === 'flat3') {
        total += 3;
      } else {
        total += group.reduce(
          (sum, g) => sum + PATTERN_VALUE[g.hex.pattern],
          0,
        );
      }
      if (group.length === 6) total += COMPLETE_SET_BONUS;
    }
  };
  for (const color of COLORS) evaluate(color, 'color');
  for (const pattern of PATTERNS) evaluate(pattern, 'pattern');

  return total;
}

export function scoreFinal(state: EngineGameState): EngineGameState {
  const next = clone(state);
  for (const p of next.players) {
    p.score = clampScore(p.score + scoreFinalForPlayer(p, next.config));
  }
  next.phase = 'finished';
  // determine winner(s)
  const max = Math.max(...next.players.map((p) => p.score));
  next.winnerIds = next.players.filter((p) => p.score === max).map((p) => p.id);
  return next;
}

// ---------------------------------------------------------------------------
// Win check
// ---------------------------------------------------------------------------

export function checkWin(state: EngineGameState): PlayerEngineState[] | null {
  if (state.phase !== 'finished') {
    // Game ends only after 4 rounds are complete.
    if (state.round < ROUNDS) return null;
    return null;
  }
  if (state.winnerIds.length === 0) return null;
  return state.players.filter((p) => state.winnerIds.includes(p.id));
}
