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
  BuyExpansionAction,
  EngineAction,
  PassAction,
  Payment,
  PlaceExpansionAction,
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
  type HeldExpansion,
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
  STACK_SIZE_BY_PLAYERS,
  STORAGE_EXPANSION_SPACES,
  STORAGE_TILE_SPACES,
  SUPPLY_EXPANSION_COST,
  SUPPLY_EXPANSION_SPACES,
  TOTAL_EXPANSIONS,
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
 * The fountain board: a central `fountain` feature ringed by 12 tile spaces =
 * 13 hex spaces total (rules.startingSetup.fountainBoardGeometry.hexSpaces).
 * This is the ONLY garden piece a player starts with; everything else grows
 * by attaching garden expansions.
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

/**
 * Build the 36 garden expansions, each pre-assigned (deterministically) the
 * face it will reveal when flipped: a pavilion + one printed hexagon. The
 * 5/7-space split is _unconfirmed in rules.json; we use 12 five-space and
 * 24 seven-space pieces (flagged for art verification).
 */
function buildExpansionDeck(rng: ReturnType<typeof makeRng>): DisplayExpansion[] {
  const out: DisplayExpansion[] = [];
  for (let i = 0; i < TOTAL_EXPANSIONS; i++) {
    const hex: Hexagon = {
      pattern: PATTERNS[rng.int(PATTERNS.length)],
      color: COLORS[rng.int(COLORS.length)],
    };
    out.push({
      id: `exp-${i}`,
      hex,
      spaces: i % 3 === 0 ? 5 : 7,
      feature: 'pavilion',
      tiles: [],
      faceUp: false,
    });
  }
  return shuffle(out, rng);
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
    // From scratch: ONLY the empty 13-hex fountain board. No pre-placed
    // tiles, no pre-attached expansions.
    spaces: fountainBoardSpaces(),
    placed: [],
    storage: Array.from(
      { length: JOKERS_AT_SETUP },
      () => ({ kind: 'joker' }) as StorageItem,
    ),
    expansionStore: [],
    passed: false,
  }));

  // Shuffle the 36 garden expansions into 4 round stacks; remainder = supply.
  const deck = buildExpansionDeck(rng);
  const stackSize = STACK_SIZE_BY_PLAYERS[players.length];
  const expansionStacks: DisplayExpansion[][] = [];
  for (let r = 0; r < ROUNDS; r++) {
    expansionStacks.push(deck.slice(r * stackSize, (r + 1) * stackSize));
  }
  const expansionSupply = TOTAL_EXPANSIONS - ROUNDS * stackSize;

  // Initial display: the round-1 stack's top expansion enters the display
  // face down, covered by exactly 4 random tiles (modelled as loose display
  // tiles). When those tiles are drafted, the expansion is uncovered (flips
  // face up, revealing pavilion + printed hexagon) and the next stack top
  // comes out with 4 fresh tiles.
  const firstFill = bag.slice(bag.length - FOUNTAIN_REFILL_TILES);
  const remaining = bag.slice(0, bag.length - FOUNTAIN_REFILL_TILES);
  const top = expansionStacks[0].shift();
  const displayExpansions: DisplayExpansion[] = top
    ? [{ ...top, faceUp: false }]
    : [];

  return {
    roomId,
    phase: 'drafting',
    round: 1,
    players: playerStates,
    activePlayerIndex: opts.startingPlayerIndex ?? 0,
    firstPlayerIndex: opts.startingPlayerIndex ?? 0,
    displayTiles: firstFill,
    displayExpansions,
    expansionStacks,
    expansionSupply,
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
    if (p.expansionStore.length + expansions.length > STORAGE_EXPANSION_SPACES)
      return;
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

  // C) Place a held garden expansion (canonical footprint per attach anchor).
  for (const held of p.expansionStore) {
    const placements = expansionPlacements(p, held.spaces);
    for (const cells of placements) {
      if (held.faceDown || !held.hex) {
        moves.push({ type: 'PlaceExpansion', playerId, expansionId: held.id, cells });
        continue;
      }
      const payment = pickExpansionPayment(p, held.hex);
      if (!payment) continue;
      // pavilion at the first cell; printed hex at the first other cell whose
      // garden adjacency is legal for the printed hexagon.
      const featureAt = cells[0];
      const printedAt = cells.find((c, i) => {
        if (i === 0) return false;
        const adj = neighbors(c)
          .map((n) => placedAt(p, n))
          .filter((x): x is PlacedHex => !!x);
        if (adj.some((a) => sameHex(a.hex, held.hex!))) return false;
        return (
          adj.length === 0 ||
          adj.some(
            (a) =>
              a.hex.pattern === held.hex!.pattern ||
              a.hex.color === held.hex!.color,
          )
        );
      });
      if (!printedAt) continue;
      moves.push({
        type: 'PlaceExpansion',
        playerId,
        expansionId: held.id,
        cells,
        featureAt,
        printedAt,
        payment,
      });
    }
  }

  // C-alt) Buy a face-down supply expansion for 6 points.
  if (state.expansionSupply > 0 && p.score >= SUPPLY_EXPANSION_COST) {
    const placements = expansionPlacements(p, SUPPLY_EXPANSION_SPACES as 5 | 7);
    if (placements.length > 0) {
      moves.push({ type: 'BuyExpansion', playerId, cells: placements[0] });
    }
  }

  // D) Pass is always legal.
  moves.push({ type: 'Pass', playerId });

  return moves;
}

/**
 * Candidate cell sets for attaching an expansion of `size` spaces: for each
 * free hex bordering the garden, grow a connected blob of `size` new cells
 * (BFS outward, avoiding existing spaces). Returns a handful of valid
 * placements (capped) — the UI offers finer-grained control.
 */
function expansionPlacements(
  p: PlayerEngineState,
  size: number,
): Axial[][] {
  const existing = new Set(p.spaces.map((s) => axialKey(s.at)));
  const anchors: Axial[] = [];
  const seen = new Set<string>();
  for (const s of p.spaces) {
    for (const n of neighbors(s.at)) {
      const k = axialKey(n);
      if (existing.has(k) || seen.has(k)) continue;
      seen.add(k);
      anchors.push(n);
    }
  }
  const out: Axial[][] = [];
  for (const anchor of anchors) {
    // BFS blob of `size` cells starting at the anchor, never re-entering
    // existing garden spaces.
    const cells: Axial[] = [anchor];
    const cellKeys = new Set<string>([axialKey(anchor)]);
    const queue: Axial[] = [anchor];
    while (cells.length < size && queue.length > 0) {
      const cur = queue.shift()!;
      for (const n of neighbors(cur)) {
        if (cells.length >= size) break;
        const k = axialKey(n);
        if (existing.has(k) || cellKeys.has(k)) continue;
        cellKeys.add(k);
        cells.push(n);
        queue.push(n);
      }
    }
    if (cells.length === size) out.push(cells);
    if (out.length >= 8) break; // cap for tractability
  }
  return out;
}

/** Canonical payment for an expansion's printed hexagon (jokers preferred). */
export function pickExpansionPayment(
  p: PlayerEngineState,
  hex: Hexagon,
): Payment[] | null {
  const need = ADDITIONAL_TO_DISCARD[hex.pattern];
  if (need === 0) return [];
  const payment: Payment[] = [];
  const jokers = countJokers(p);
  for (let i = 0; i < Math.min(jokers, need); i++) payment.push({ kind: 'joker' });
  let remaining = need - payment.length;
  if (remaining === 0) return payment;
  const pool = p.storage
    .filter((s): s is Extract<StorageItem, { kind: 'tile' }> => s.kind === 'tile')
    .map((s) => s.hex);
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
export function pickCanonicalPayment(
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
    case 'PlaceExpansion':
      return advanceTurn(applyPlaceExpansion(state, idx, action));
    case 'BuyExpansion':
      return advanceTurn(applyBuyExpansion(state, idx, action));
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
  if (p.expansionStore.length + expansions.length > STORAGE_EXPANSION_SPACES) {
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
  np.expansionStore.push(
    ...expansions.map(
      (e): HeldExpansion => ({
        id: e.id,
        spaces: e.spaces,
        hex: e.hex,
        faceDown: false,
      }),
    ),
  );
  next.displayExpansions = next.displayExpansions.filter(
    (e) => !acquiredIds.has(e.id),
  );

  // Display refill: if at least one loose tile was taken, the covered stack-top
  // expansion is uncovered (flips face up, revealing pavilion + hexagon), then
  // the next expansion of the current round's stack comes out under 4 fresh
  // tiles drawn from the bag.
  if (tiles.length > 0) {
    const covered = next.displayExpansions.find((e) => !e.faceUp);
    if (covered) covered.faceUp = true;
    const stack = next.expansionStacks[next.round - 1];
    if (stack && stack.length > 0 && next.bag.length > 0) {
      const top = stack.shift()!;
      next.displayExpansions.push({ ...top, faceUp: false });
    }
    if (next.bag.length > 0) {
      const rng = makeRng(next.rngState);
      const drawn: Hexagon[] = [];
      for (let i = 0; i < FOUNTAIN_REFILL_TILES && next.bag.length > 0; i++) {
        drawn.push(next.bag.pop()!);
      }
      next.displayTiles.push(...drawn);
      next.rngState = rng.state();
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Garden expansion placement (Action C) & supply purchase
// ---------------------------------------------------------------------------

const axEq = (a: Axial, b: Axial): boolean => a.q === b.q && a.r === b.r;

/**
 * Validate a set of new cells for attaching an expansion piece:
 *  - exactly `size` cells, no duplicates
 *  - none may overlap an existing garden space
 *  - the cells must be connected among themselves
 *  - at least one cell must be adjacent to an existing garden space
 */
export function validateExpansionCells(
  p: PlayerEngineState,
  cells: readonly Axial[],
  size: number,
): void {
  if (cells.length !== size) {
    throw new IllegalMoveError(`expansion needs exactly ${size} cells`);
  }
  const keys = new Set(cells.map(axialKey));
  if (keys.size !== cells.length) {
    throw new IllegalMoveError('expansion cells contain duplicates');
  }
  const existing = new Set(p.spaces.map((s) => axialKey(s.at)));
  for (const c of cells) {
    if (existing.has(axialKey(c))) {
      throw new IllegalMoveError('expansion overlaps the existing garden');
    }
  }
  // connectivity (flood fill over the cell set)
  const visited = new Set<string>([axialKey(cells[0])]);
  const stack: Axial[] = [cells[0]];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const n of neighbors(cur)) {
      const k = axialKey(n);
      if (keys.has(k) && !visited.has(k)) {
        visited.add(k);
        stack.push(n);
      }
    }
  }
  if (visited.size !== cells.length) {
    throw new IllegalMoveError('expansion cells must be connected');
  }
  // adjacency to the existing garden
  const touches = cells.some((c) =>
    neighbors(c).some((n) => existing.has(axialKey(n))),
  );
  if (!touches) {
    throw new IllegalMoveError('expansion must attach adjacent to the garden');
  }
}

/**
 * Validate payment for placing a face-up expansion: the printed hexagon
 * counts toward its own cost (so `payment` = cost - 1 items), payment items
 * must come from storage and form a legal set with the printed hex (jokers
 * wild). Unlike PlaceTile, the printed hex is NOT consumed from storage.
 */
export function validateExpansionPayment(
  p: PlayerEngineState,
  hex: Hexagon,
  payment: readonly Payment[],
): void {
  const needed = ADDITIONAL_TO_DISCARD[hex.pattern];
  if (payment.length !== needed) {
    throw new IllegalMoveError(
      `placing expansion with ${hexKey(hex)} needs exactly ${needed} payment item(s), got ${payment.length}`,
    );
  }
  const avail = p.storage.map((s) => clone(s));
  for (const pay of payment) {
    const i = avail.findIndex((s) =>
      pay.kind === 'joker'
        ? s.kind === 'joker'
        : s.kind === 'tile' && sameHex(s.hex, pay.hex),
    );
    if (i === -1) {
      throw new IllegalMoveError(
        `storage missing ${pay.kind === 'joker' ? 'joker' : hexKey(pay.hex)}`,
      );
    }
    avail.splice(i, 1);
  }
  const realHexes: Hexagon[] = [
    hex,
    ...payment
      .filter((x): x is Extract<Payment, { kind: 'tile' }> => x.kind === 'tile')
      .map((x) => x.hex),
  ];
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

function applyPlaceExpansion(
  state: EngineGameState,
  idx: number,
  action: PlaceExpansionAction,
): EngineGameState {
  const p = state.players[idx];
  const held = p.expansionStore.find((e) => e.id === action.expansionId);
  if (!held) {
    throw new IllegalMoveError('expansion not in storage');
  }
  validateExpansionCells(p, action.cells, held.spaces);

  let featureAt: Axial | undefined;
  let printedAt: Axial | undefined;
  if (!held.faceDown && held.hex) {
    featureAt = action.featureAt;
    printedAt = action.printedAt;
    if (!featureAt || !printedAt) {
      throw new IllegalMoveError(
        'face-up expansion requires featureAt (pavilion) and printedAt (hexagon) cells',
      );
    }
    if (
      !action.cells.some((c) => axEq(c, featureAt!)) ||
      !action.cells.some((c) => axEq(c, printedAt!)) ||
      axEq(featureAt, printedAt)
    ) {
      throw new IllegalMoveError(
        'featureAt/printedAt must be distinct cells of the expansion',
      );
    }
    validateExpansionPayment(p, held.hex, action.payment ?? []);

    // The printed hexagon must obey tile adjacency vs the garden once the new
    // spaces exist. Check against existing placed tiles (new cells are empty).
    const adj = neighbors(printedAt)
      .map((n) => placedAt(p, n))
      .filter((x): x is PlacedHex => !!x);
    if (adj.some((a) => sameHex(a.hex, held.hex!))) {
      throw new IllegalMoveError(
        'printed hexagon would be adjacent to an identical hexagon',
      );
    }
    if (
      adj.length > 0 &&
      !adj.some(
        (a) => a.hex.pattern === held.hex!.pattern || a.hex.color === held.hex!.color,
      )
    ) {
      throw new IllegalMoveError(
        'printed hexagon must share pattern or color with an adjacent hexagon',
      );
    }
  }

  const next = clone(state);
  const np = next.players[idx];

  // Pay (face-up only).
  if (!held.faceDown && held.hex) {
    for (const pay of action.payment ?? []) {
      const i = np.storage.findIndex((s) =>
        pay.kind === 'joker'
          ? s.kind === 'joker'
          : s.kind === 'tile' && sameHex(s.hex, pay.hex),
      );
      np.storage.splice(i, 1);
    }
  }

  // Attach the new spaces (feature cell marked) and the printed hexagon.
  for (const c of action.cells) {
    const isFeature = featureAt ? axEq(c, featureAt) : false;
    np.spaces.push(isFeature ? { at: c, feature: 'pavilion' } : { at: c });
  }
  if (printedAt && held.hex) {
    np.placed.push({ at: printedAt, hex: held.hex });
  }

  // Remove from expansion storage.
  np.expansionStore = np.expansionStore.filter((e) => e.id !== held.id);

  // The new printed hexagon may complete a feature surround.
  const surrounded = newlySurroundedFeatures(
    { ...p, spaces: np.spaces },
    np.placed,
  );
  for (const f of surrounded) {
    const award = FEATURE_JOKERS[f] ?? 0;
    const free = STORAGE_TILE_SPACES - np.storage.length;
    const give = Math.max(0, Math.min(award, free));
    for (let i = 0; i < give; i++) np.storage.push({ kind: 'joker' });
  }

  return next;
}

function applyBuyExpansion(
  state: EngineGameState,
  idx: number,
  action: BuyExpansionAction,
): EngineGameState {
  const p = state.players[idx];
  if (state.expansionSupply <= 0) {
    throw new IllegalMoveError('no expansions left in the supply');
  }
  if (p.score < SUPPLY_EXPANSION_COST) {
    throw new IllegalMoveError(
      `buying a supply expansion costs ${SUPPLY_EXPANSION_COST} points`,
    );
  }
  validateExpansionCells(p, action.cells, SUPPLY_EXPANSION_SPACES);

  const next = clone(state);
  const np = next.players[idx];
  np.score -= SUPPLY_EXPANSION_COST;
  next.expansionSupply -= 1;
  for (const c of action.cells) np.spaces.push({ at: c });
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

  // New round: the next round's stack top comes out face down, covered by
  // 4 fresh tiles drawn from the bag.
  const stack = next.expansionStacks[next.round - 1];
  if (stack && stack.length > 0) {
    const top = stack.shift()!;
    next.displayExpansions.push({ ...top, faceUp: false });
  }
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
