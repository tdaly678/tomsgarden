import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceRound,
  applyAction,
  canPlaceHexAt,
  checkWin,
  countJokers,
  fountainBoardSpaces,
  generateLegalMoves,
  IllegalMoveError,
  scoreFinal,
  scoreFinalForPlayer,
  scoreRound,
  scoreRoundForPlayer,
  pickCanonicalPayment,
  pickExpansionPayment,
  setupGame,
  validateExpansionPayment,
  validatePayment,
} from './index.js';
import type { EngineGameState, Hexagon, PlayerEngineState } from './model.js';
import { DEFAULT_CONFIG } from './model.js';
import {
  ADDITIONAL_TO_DISCARD,
  PATTERN_VALUE,
  STARTING_SCORE,
  WHEEL_BY_ROUND,
} from './rules-data.js';

// ---------------------------------------------------------------------------
// helpers for building deterministic states
// ---------------------------------------------------------------------------

const hx = (pattern: Hexagon['pattern'], color: Hexagon['color']): Hexagon => ({
  pattern,
  color,
});

function makePlayer(
  id: string,
  overrides: Partial<PlayerEngineState> = {},
): PlayerEngineState {
  return {
    id,
    name: id,
    score: STARTING_SCORE,
    spaces: [
      { at: { q: 0, r: 0 } },
      { at: { q: 1, r: 0 } },
      { at: { q: 2, r: 0 } },
      { at: { q: 0, r: 1 } },
      { at: { q: 1, r: 1 } },
      { at: { q: -1, r: 0 } },
    ],
    placed: [],
    storage: [],
    expansionStore: [],
    passed: false,
    ...overrides,
  };
}

function makeState(
  players: PlayerEngineState[],
  overrides: Partial<EngineGameState> = {},
): EngineGameState {
  return {
    roomId: 'test',
    phase: 'drafting',
    round: 1,
    players,
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    displayTiles: [],
    tower: [],
    displayExpansions: [],
    expansionStacks: [[], [], [], []],
    expansionSupply: 0,
    bag: [],
    firstPassTaken: false,
    winnerIds: [],
    rngState: 12345,
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('setupGame', () => {
  it('deals a deterministic state: 108-tile bag minus 4 display fill, 3 jokers each', () => {
    const s = setupGame({
      roomId: 'r',
      players: [
        { id: 'p1', name: 'Ann' },
        { id: 'p2', name: 'Bob' },
      ],
      seed: 42,
    });
    expect(s.round).toBe(1);
    expect(s.phase).toBe('drafting');
    // 108 total, 4 moved to display
    expect(s.bag.length).toBe(108 - 4);
    // the 4 fill tiles sit ON the round-1 stack-top expansion
    expect(s.displayExpansions[0].tiles.length).toBe(4);
    expect(s.displayExpansions[0].onStack).toBe(true);
    for (const p of s.players) {
      expect(p.score).toBe(15);
      expect(countJokers(p)).toBe(3);
      expect(p.storage.length).toBe(3);
    }
  });

  it('is reproducible for a given seed and varies by seed', () => {
    const players = [
      { id: 'p1', name: 'A' },
      { id: 'p2', name: 'B' },
    ];
    const a = setupGame({ roomId: 'r', players, seed: 7 });
    const b = setupGame({ roomId: 'r', players, seed: 7 });
    const c = setupGame({ roomId: 'r', players, seed: 8 });
    expect(a.displayExpansions[0].tiles).toEqual(b.displayExpansions[0].tiles);
    expect(a.bag).toEqual(b.bag);
    expect(a.displayExpansions[0].tiles).not.toEqual(
      c.displayExpansions[0].tiles,
    );
  });

  it('starts from scratch: empty 13-hex fountain garden, no tiles, no expansions', () => {
    const s = setupGame({
      roomId: 'r',
      players: [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
      ],
      seed: 1,
    });
    for (const p of s.players) {
      expect(p.spaces.length).toBe(13);
      expect(p.spaces.filter((sp) => sp.feature === 'fountain').length).toBe(1);
      expect(p.spaces.filter((sp) => sp.feature === 'statue').length).toBe(3);
      expect(p.spaces.filter((sp) => sp.feature === 'bench').length).toBe(3);
      // only 6 EMPTY placeable spaces (ring 1)
      expect(p.spaces.filter((sp) => !sp.feature).length).toBe(6);
      expect(p.placed.length).toBe(0); // garden empty
      expect(p.expansionStore.length).toBe(0);
      expect(p.storage.every((it) => it.kind === 'joker')).toBe(true);
    }
  });

  it('every garden expansion is a 7-hex piece', () => {
    const s = setupGame({
      roomId: 'r',
      players: [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
      ],
      seed: 7,
    });
    for (const stack of s.expansionStacks) {
      for (const e of stack) expect(e.spaces).toBe(7);
    }
    for (const e of s.displayExpansions) expect(e.spaces).toBe(7);
  });

  it.each([
    [2, 5, 16],
    [3, 7, 8],
    [4, 8, 4],
  ])(
    '%dp: builds 4 round stacks of %d expansions and a supply of %d',
    (count, stackSize, supply) => {
      const players = Array.from({ length: count as number }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      }));
      const s = setupGame({ roomId: 'r', players, seed: 5 });
      expect(s.expansionStacks.length).toBe(4);
      // round-1 stack already gave its top to the display
      expect(s.expansionStacks[0].length).toBe((stackSize as number) - 1);
      for (let r = 1; r < 4; r++) {
        expect(s.expansionStacks[r].length).toBe(stackSize);
      }
      expect(s.expansionSupply).toBe(supply);
      expect(s.displayExpansions.length).toBe(1);
      expect(s.displayExpansions[0].faceUp).toBe(false);
    },
  );

  it('rejects unsupported player counts', () => {
    expect(() =>
      setupGame({ roomId: 'r', players: [{ id: 'p1', name: 'A' }], seed: 1 }),
    ).toThrow(IllegalMoveError);
  });
});

// ---------------------------------------------------------------------------
// rules.json sanity (numbers are the source of truth)
// ---------------------------------------------------------------------------

describe('rules constants', () => {
  it('pattern values are 1..6', () => {
    expect(PATTERN_VALUE.pattern1).toBe(1);
    expect(PATTERN_VALUE.pattern6).toBe(6);
  });
  it('additional discards = value - 1', () => {
    expect(ADDITIONAL_TO_DISCARD.pattern1).toBe(0);
    expect(ADDITIONAL_TO_DISCARD.pattern4).toBe(3);
    expect(ADDITIONAL_TO_DISCARD.pattern6).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Placement adjacency
// ---------------------------------------------------------------------------

describe('placement adjacency', () => {
  it('allows isolated placement', () => {
    const p = makePlayer('p1');
    expect(canPlaceHexAt(p, hx('pattern1', 'color1'), { q: 0, r: 0 })).toBe(
      true,
    );
  });

  it('requires shared pattern or color with a neighbour', () => {
    const p = makePlayer('p1', {
      placed: [{ at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') }],
    });
    // neighbour shares color -> ok
    expect(canPlaceHexAt(p, hx('pattern2', 'color1'), { q: 1, r: 0 })).toBe(
      true,
    );
    // neighbour shares pattern -> ok
    expect(canPlaceHexAt(p, hx('pattern1', 'color2'), { q: 1, r: 0 })).toBe(
      true,
    );
    // neighbour shares neither -> illegal
    expect(canPlaceHexAt(p, hx('pattern3', 'color3'), { q: 1, r: 0 })).toBe(
      false,
    );
  });

  it('forbids two identical hexagons adjacent', () => {
    const p = makePlayer('p1', {
      placed: [{ at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') }],
    });
    expect(canPlaceHexAt(p, hx('pattern1', 'color1'), { q: 1, r: 0 })).toBe(
      false,
    );
  });

  it('forbids placing on an occupied or feature space', () => {
    const p = makePlayer('p1', {
      spaces: [
        { at: { q: 0, r: 0 }, feature: 'fountain' },
        { at: { q: 1, r: 0 } },
      ],
      placed: [{ at: { q: 1, r: 0 }, hex: hx('pattern1', 'color1') }],
    });
    expect(canPlaceHexAt(p, hx('pattern2', 'color2'), { q: 0, r: 0 })).toBe(
      false,
    ); // feature
    expect(canPlaceHexAt(p, hx('pattern1', 'color2'), { q: 1, r: 0 })).toBe(
      false,
    ); // occupied
  });
});

describe('rulebook compliance regressions', () => {
  it('placement may not CONNECT two groups that would then contain identical hexagons (#31)', () => {
    // Line: [p1/c1] [empty] [p1/c1] — placing p1/c2 in the middle would merge
    // a pattern1 group containing two identical p1/c1 hexes. Both adjacency
    // checks pass (shares pattern, no identical neighbor) but the group rule
    // must forbid it.
    const p = makePlayer('p1', {
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') },
        { at: { q: 2, r: 0 }, hex: hx('pattern1', 'color1') },
      ],
    });
    expect(canPlaceHexAt(p, hx('pattern1', 'color2'), { q: 1, r: 0 })).toBe(
      false,
    );
    // but a different pattern, same color as neither -> mixed: c1 bridge of
    // same color is also illegal (color group would hold two p1/c1? no —
    // color group: c1,c1,c1 with patterns p1,p?,p1 -> two identical p1/c1).
    expect(canPlaceHexAt(p, hx('pattern2', 'color1'), { q: 1, r: 0 })).toBe(
      false,
    );
  });

  it('Phase 3 returns display expansions to supply and discards their tiles to the tower (#47, #48)', () => {
    const exp = {
      id: 'e1',
      hex: hx('pattern1', 'color1'),
      spaces: 7 as const,
      feature: 'pavilion' as const,
      tiles: [hx('pattern2', 'color2')],
      faceUp: false,
    };
    const state = makeState(
      [makePlayer('p1', { passed: true }), makePlayer('p2', { passed: true })],
      {
        phase: 'scoring',
        round: 1,
        displayExpansions: [exp],
        expansionSupply: 3,
        bag: [],
        tower: [],
        expansionStacks: [[], [], [], []],
      },
    );
    const next = advanceRound(state);
    expect(next.displayExpansions.length).toBe(0); // round-2 stack empty here
    expect(next.expansionSupply).toBe(4);
    expect(next.tower).toContainEqual(hx('pattern2', 'color2'));
  });

  it('tower is recycled into the bag on shortage (#51)', () => {
    const stackTop = {
      id: 'cov',
      hex: hx('pattern5', 'color5'),
      spaces: 7 as const,
      feature: 'pavilion' as const,
      tiles: [hx('pattern1', 'color1')],
      faceUp: false,
      onStack: true,
    };
    const nextTop = { ...stackTop, id: 'top2', tiles: [], onStack: false };
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayExpansions: [stackTop],
      expansionStacks: [[nextTop], [], [], []],
      bag: [],
      tower: [
        hx('pattern6', 'color1'),
        hx('pattern6', 'color2'),
        hx('pattern6', 'color3'),
        hx('pattern6', 'color4'),
      ],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    const top2 = next.displayExpansions.find((e) => e.id === 'top2')!;
    expect(top2.tiles.length).toBe(4);
    expect(next.tower.length).toBe(0);
  });

  it('held expansions can be used as payment; they return to the supply (#26, #27)', () => {
    const p = makePlayer('p1', {
      storage: [{ kind: 'tile', hex: hx('pattern2', 'color1') }],
      expansionStore: [
        // printed hexagon same pattern (different color) as the placed tile
        { id: 'e1', spaces: 7, hex: hx('pattern2', 'color2'), faceDown: false },
      ],
    });
    const state = makeState([p, makePlayer('p2')], { expansionSupply: 0 });
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern2', 'color1'),
      at: { q: 0, r: 0 },
      payment: [{ kind: 'expansion', expansionId: 'e1' }],
    });
    expect(next.players[0].placed.length).toBe(1);
    expect(next.players[0].expansionStore.length).toBe(0);
    expect(next.expansionSupply).toBe(1);
  });

  it('expansion payment obeys the set rule (printed hex counts)', () => {
    const p = makePlayer('p1', {
      storage: [{ kind: 'tile', hex: hx('pattern2', 'color1') }],
      expansionStore: [
        // mismatched: neither same pattern nor same color
        { id: 'e1', spaces: 7, hex: hx('pattern3', 'color4'), faceDown: false },
      ],
    });
    expect(() =>
      validatePayment(p, hx('pattern2', 'color1'), [
        { kind: 'expansion', expansionId: 'e1' },
      ]),
    ).toThrow(/all-same-pattern or all-same-color/);
  });

  it('pass may discard held expansions for minus printed value (#38)', () => {
    const p = makePlayer('p1', {
      expansionStore: [
        { id: 'e1', spaces: 7, hex: hx('pattern4', 'color1'), faceDown: false },
      ],
    });
    const state = makeState([p, makePlayer('p2')], { expansionSupply: 0 });
    const next = applyAction(state, {
      type: 'Pass',
      playerId: 'p1',
      discardExpansionIds: ['e1'],
    });
    // -4 expansion, -1 first pass
    expect(next.players[0].score).toBe(STARTING_SCORE - 5);
    expect(next.players[0].expansionStore.length).toBe(0);
    expect(next.expansionSupply).toBe(1);
  });

  it('final scoring penalizes leftover held expansions by printed value (#54)', () => {
    const p = makePlayer('p1', {
      expansionStore: [
        { id: 'e1', spaces: 7, hex: hx('pattern5', 'color1'), faceDown: false },
      ],
    });
    expect(scoreFinalForPlayer(p, DEFAULT_CONFIG)).toBe(-5);
  });

  it('payment tiles land in the tower (#27)', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern2', 'color1') },
        { kind: 'tile', hex: hx('pattern2', 'color2') },
      ],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern2', 'color1'),
      at: { q: 0, r: 0 },
      payment: [{ kind: 'tile', hex: hx('pattern2', 'color2') }],
    });
    expect(next.tower).toEqual([hx('pattern2', 'color2')]);
  });
});

// ---------------------------------------------------------------------------
// Payment validation & joker substitution
// ---------------------------------------------------------------------------

describe('cost payment & jokers', () => {
  it('pattern1 (value 1) needs 0 additional payment', () => {
    const p = makePlayer('p1', {
      storage: [{ kind: 'tile', hex: hx('pattern1', 'color1') }],
    });
    expect(() =>
      validatePayment(p, hx('pattern1', 'color1'), []),
    ).not.toThrow();
  });

  it('pattern3 (value 3) needs 2 additional same-pattern or same-color hexes', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') }, // placed
        { kind: 'tile', hex: hx('pattern3', 'color2') }, // same pattern
        { kind: 'tile', hex: hx('pattern3', 'color3') }, // same pattern
      ],
    });
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), [
        { kind: 'tile', hex: hx('pattern3', 'color2') },
        { kind: 'tile', hex: hx('pattern3', 'color3') },
      ]),
    ).not.toThrow();
  });

  it('rejects mixed pattern AND color payment (must be one axis)', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') },
        { kind: 'tile', hex: hx('pattern3', 'color2') }, // same pattern
        { kind: 'tile', hex: hx('pattern4', 'color1') }, // same color (diff pattern)
      ],
    });
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), [
        { kind: 'tile', hex: hx('pattern3', 'color2') },
        { kind: 'tile', hex: hx('pattern4', 'color1') },
      ]),
    ).toThrow(/all-same-pattern or all-same-color/);
  });

  it('rejects two identical hexagons in payment', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') },
        { kind: 'tile', hex: hx('pattern3', 'color2') },
        { kind: 'tile', hex: hx('pattern3', 'color2') },
      ],
    });
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), [
        { kind: 'tile', hex: hx('pattern3', 'color2') },
        { kind: 'tile', hex: hx('pattern3', 'color2') },
      ]),
    ).toThrow(/identical/);
  });

  it('jokers substitute for additional needed hexes', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') }, // the placed hex
        { kind: 'joker' },
        { kind: 'joker' },
      ],
    });
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), [
        { kind: 'joker' },
        { kind: 'joker' },
      ]),
    ).not.toThrow();
  });

  it('rejects payment of wrong length', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') },
        { kind: 'joker' },
      ],
    });
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), [{ kind: 'joker' }]),
    ).toThrow(/exactly 2/);
  });

  it('cannot pay if you do not own the placed tile', () => {
    const p = makePlayer('p1', { storage: [{ kind: 'joker' }] });
    expect(() =>
      validatePayment(p, hx('pattern2', 'color1'), [{ kind: 'joker' }]),
    ).toThrow(/missing placed tile/);
  });
});

// ---------------------------------------------------------------------------
// applyAction — place, joker consumption, immutability
// ---------------------------------------------------------------------------

describe('applyAction: PlaceTile', () => {
  it('places a tile, consumes storage including jokers, and does not mutate input', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern2', 'color1') },
        { kind: 'joker' },
      ],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern2', 'color1'),
      at: { q: 0, r: 0 },
      payment: [{ kind: 'joker' }],
    });
    // input untouched
    expect(state.players[0].placed.length).toBe(0);
    expect(state.players[0].storage.length).toBe(2);
    // result
    expect(next.players[0].placed.length).toBe(1);
    expect(next.players[0].storage.length).toBe(0);
    // turn advanced to p2
    expect(next.activePlayerIndex).toBe(1);
  });

  it('rejects placing out of turn', () => {
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      activePlayerIndex: 1,
    });
    expect(() =>
      applyAction(state, {
        type: 'PlaceTile',
        playerId: 'p1',
        hex: hx('pattern1', 'color1'),
        at: { q: 0, r: 0 },
        payment: [],
      }),
    ).toThrow(/turn/);
  });

  it('awards 3 jokers when a pavilion is fully surrounded (all 6 neighbours)', () => {
    // pavilion at center with all 6 neighbour spaces; 5 filled, place the 6th.
    const ring = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    const fillHexes = [
      hx('pattern1', 'color1'),
      hx('pattern1', 'color2'),
      hx('pattern1', 'color3'),
      hx('pattern1', 'color4'),
      hx('pattern1', 'color5'),
    ];
    const p = makePlayer('p1', {
      spaces: [
        { at: { q: 0, r: 0 }, feature: 'pavilion' },
        ...ring.map((at) => ({ at })),
      ],
      placed: ring.slice(0, 5).map((at, i) => ({ at, hex: fillHexes[i] })),
      storage: [{ kind: 'tile', hex: hx('pattern1', 'color6') }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern1', 'color6'), // shares pattern with neighbours
      at: { q: 0, r: 1 },
      payment: [],
    });
    // pavilion surround awards 3 jokers (rules.json confirmed value)
    expect(countJokers(next.players[0])).toBe(3);
  });

  it('fountain board: filling the 6 ring-1 spaces surrounds the fountain (1 joker)', () => {
    const spaces = fountainBoardSpaces();
    const ring1 = spaces.filter((s) => !s.feature).map((s) => s.at);
    expect(ring1.length).toBe(6);
    const fillHexes = [
      hx('pattern1', 'color1'),
      hx('pattern1', 'color2'),
      hx('pattern1', 'color3'),
      hx('pattern1', 'color4'),
      hx('pattern1', 'color5'),
    ];
    const p = makePlayer('p1', {
      spaces,
      placed: ring1.slice(0, 5).map((at, i) => ({ at, hex: fillHexes[i] })),
      storage: [{ kind: 'joker' }, { kind: 'tile', hex: hx('pattern1', 'color6') }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern1', 'color6'),
      at: ring1[5],
      payment: [],
    });
    // fountain surrounded -> +1 joker (had 1 joker before -> 2 now).
    // No statue/bench is surrounded: their off-board neighbours are empty.
    expect(countJokers(next.players[0])).toBe(2);
  });

  it('statues/benches surround for 2 jokers once expansions attach around them', () => {
    // Statue at (2,-1): neighbours are ring-1 (1,0),(1,-1) plus 4 off-board
    // cells. Attach spaces there, fill everything -> 2 jokers.
    const statueAt = { q: 2, r: -1 };
    const ringSpaces = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 3, r: -1 },
      { q: 3, r: -2 },
      { q: 2, r: 0 },
      { q: 2, r: -2 },
    ];
    const fillHexes = [
      hx('pattern1', 'color1'),
      hx('pattern1', 'color2'),
      hx('pattern1', 'color3'),
      hx('pattern1', 'color4'),
      hx('pattern1', 'color5'),
    ];
    const p = makePlayer('p1', {
      spaces: [
        { at: statueAt, feature: 'statue' },
        ...ringSpaces.map((at) => ({ at })),
      ],
      placed: ringSpaces.slice(0, 5).map((at, i) => ({ at, hex: fillHexes[i] })),
      storage: [{ kind: 'tile', hex: hx('pattern1', 'color6') }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern1', 'color6'),
      at: ringSpaces[5],
      payment: [],
    });
    expect(countJokers(next.players[0])).toBe(2);
  });

  it('legal moves never target feature hexes', () => {
    const p = makePlayer('p1', {
      spaces: fountainBoardSpaces(),
      storage: [{ kind: 'tile', hex: hx('pattern1', 'color1') }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const featureKeys = new Set(
      fountainBoardSpaces()
        .filter((s) => s.feature)
        .map((s) => `${s.at.q},${s.at.r}`),
    );
    const moves = generateLegalMoves(state, 'p1');
    const placeMoves = moves.filter((m) => m.type === 'PlaceTile');
    expect(placeMoves.length).toBe(6); // exactly the 6 ring-1 spaces
    for (const m of placeMoves) {
      if (m.type !== 'PlaceTile') continue;
      expect(featureKeys.has(`${m.at.q},${m.at.r}`)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Acquire — storage limits & display refill
// ---------------------------------------------------------------------------

describe('applyAction: Acquire', () => {
  it('takes all matching colors for a pattern; duplicate identical hexagons stay in display', () => {
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayTiles: [
        hx('pattern1', 'color1'),
        hx('pattern1', 'color2'),
        hx('pattern1', 'color2'), // duplicate -> take only one, other STAYS
        hx('pattern2', 'color3'), // not matching
      ],
      bag: [hx('pattern6', 'color6')],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    // 2 distinct pattern1 tiles into storage
    expect(next.players[0].storage.length).toBe(2);
    // the duplicate identical copy remains in the display (rulebook #17)
    expect(next.displayTiles).toEqual([
      hx('pattern1', 'color2'),
      hx('pattern2', 'color3'),
    ]);
    // no refill: no tile came from the round-stack top (rulebook #21)
    expect(next.bag.length).toBe(1);
  });

  it('refills 4 onto the next stack top ONLY when a tile was taken from the stack top', () => {
    const stackTop = {
      id: 'cov',
      hex: hx('pattern5', 'color5'),
      spaces: 7 as const,
      feature: 'pavilion' as const,
      tiles: [hx('pattern1', 'color1'), hx('pattern3', 'color3')],
      faceUp: false,
      onStack: true,
    };
    const nextTop = { ...stackTop, id: 'top2', tiles: [], onStack: false };
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayExpansions: [stackTop],
      expansionStacks: [[nextTop], [], [], []],
      bag: [
        hx('pattern6', 'color1'),
        hx('pattern6', 'color2'),
        hx('pattern6', 'color3'),
        hx('pattern6', 'color4'),
        hx('pattern6', 'color5'),
      ],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    // old top extended off the stack, leftover tile rides along
    const cov = next.displayExpansions.find((e) => e.id === 'cov')!;
    expect(cov.onStack).toBeFalsy();
    expect(cov.faceUp).toBe(false); // still holds a tile -> stays face down
    expect(cov.tiles).toEqual([hx('pattern3', 'color3')]);
    // new stack top filled with exactly 4 tiles
    const top2 = next.displayExpansions.find((e) => e.id === 'top2')!;
    expect(top2.onStack).toBe(true);
    expect(top2.tiles.length).toBe(4);
    expect(next.bag.length).toBe(1);
  });

  it('flips a display expansion face up when its last tile is taken', () => {
    const ext = {
      id: 'ext',
      hex: hx('pattern5', 'color5'),
      spaces: 7 as const,
      feature: 'pavilion' as const,
      tiles: [hx('pattern1', 'color1')],
      faceUp: false,
      onStack: false,
    };
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayExpansions: [ext],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    expect(next.displayExpansions[0].faceUp).toBe(true);
  });

  it('rejects acquire that would exceed 12-tile storage (full-storage forced choice)', () => {
    const fullStorage: PlayerEngineState['storage'] = Array.from(
      { length: 11 },
      (_, i) => ({
        kind: 'tile',
        hex: hx('pattern1', (['color1', 'color2', 'color3'] as const)[i % 3]),
      }),
    );
    const p = makePlayer('p1', { storage: fullStorage });
    const state = makeState([p, makePlayer('p2')], {
      displayTiles: [hx('pattern2', 'color1'), hx('pattern2', 'color2')],
    });
    // pattern2 acquire adds 2 -> 13 > 12 -> illegal, not offered as a legal move.
    // (a single-color acquire adding only 1 tile would fit and is allowed.)
    const moves = generateLegalMoves(state, 'p1');
    expect(
      moves.some(
        (m) =>
          m.type === 'Acquire' &&
          m.select.by === 'pattern' &&
          m.select.pattern === 'pattern2',
      ),
    ).toBe(false);
    expect(() =>
      applyAction(state, {
        type: 'Acquire',
        playerId: 'p1',
        select: { by: 'pattern', pattern: 'pattern2' },
      }),
    ).toThrow(/12 tile storage/);
  });
});

// ---------------------------------------------------------------------------
// Acquire — player-chosen duplicate copy (which bed gets emptied)
// ---------------------------------------------------------------------------

describe('applyAction: Acquire with player-chosen duplicate copies', () => {
  // Two beds each hold one copy of pattern1/color1. Bed `one` has a single
  // tile (taking it flips it face up); bed `two` has two tiles (taking from it
  // does NOT flip). The canonical pick takes from the smaller bed (`one`).
  const buildTwoBeds = () =>
    makeState([makePlayer('p1'), makePlayer('p2')], {
      displayExpansions: [
        {
          id: 'one',
          hex: hx('pattern5', 'color5'),
          spaces: 7 as const,
          feature: 'pavilion' as const,
          faceUp: false,
          onStack: false,
          tiles: [hx('pattern1', 'color1')],
        },
        {
          id: 'two',
          hex: hx('pattern6', 'color6'),
          spaces: 7 as const,
          feature: 'pavilion' as const,
          faceUp: false,
          onStack: false,
          tiles: [hx('pattern1', 'color1'), hx('pattern2', 'color2')],
        },
      ],
    });

  it('default (no choices) is canonical: empties the smaller bed, flips it face up', () => {
    const next = applyAction(buildTwoBeds(), {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'color', color: 'color1' },
    });
    const one = next.displayExpansions.find((e) => e.id === 'one')!;
    const two = next.displayExpansions.find((e) => e.id === 'two')!;
    // Canonical took from `one`: now empty + flipped face up.
    expect(one.tiles).toEqual([]);
    expect(one.faceUp).toBe(true);
    // `two` keeps its copy + other tile, stays face down.
    expect(two.tiles).toEqual([hx('pattern1', 'color1'), hx('pattern2', 'color2')]);
    expect(two.faceUp).toBe(false);
    expect(next.players[0].storage.length).toBe(1);
  });

  it('choosing the copy on the LARGER bed leaves the smaller bed untouched (no flip)', () => {
    const next = applyAction(buildTwoBeds(), {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'color', color: 'color1' },
      choices: [
        { hex: hx('pattern1', 'color1'), from: { kind: 'expansion', expansionId: 'two' } },
      ],
    });
    const one = next.displayExpansions.find((e) => e.id === 'one')!;
    const two = next.displayExpansions.find((e) => e.id === 'two')!;
    // `one` was NOT touched: still holds its tile, still face down.
    expect(one.tiles).toEqual([hx('pattern1', 'color1')]);
    expect(one.faceUp).toBe(false);
    // `two` lost its color1 copy (kept the non-matching tile), stays face down.
    expect(two.tiles).toEqual([hx('pattern2', 'color2')]);
    expect(two.faceUp).toBe(false);
    expect(next.players[0].storage.length).toBe(1);
  });

  it('the two choices yield DIFFERENT after-states (one flips a bed, the other does not)', () => {
    const a = applyAction(buildTwoBeds(), {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'color', color: 'color1' },
      choices: [
        { hex: hx('pattern1', 'color1'), from: { kind: 'expansion', expansionId: 'one' } },
      ],
    });
    const b = applyAction(buildTwoBeds(), {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'color', color: 'color1' },
      choices: [
        { hex: hx('pattern1', 'color1'), from: { kind: 'expansion', expansionId: 'two' } },
      ],
    });
    const aOne = a.displayExpansions.find((e) => e.id === 'one')!;
    const bOne = b.displayExpansions.find((e) => e.id === 'one')!;
    expect(aOne.faceUp).toBe(true); // choosing `one` flips it
    expect(bOne.faceUp).toBe(false); // choosing `two` does not
    expect(a.displayExpansions).not.toEqual(b.displayExpansions);
  });

  it('prefers a loose-pool copy when chosen, leaving both beds intact', () => {
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayTiles: [hx('pattern1', 'color1')],
      displayExpansions: [
        {
          id: 'one',
          hex: hx('pattern5', 'color5'),
          spaces: 7 as const,
          feature: 'pavilion' as const,
          faceUp: false,
          onStack: false,
          tiles: [hx('pattern1', 'color1')],
        },
      ],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'color', color: 'color1' },
      choices: [{ hex: hx('pattern1', 'color1'), from: { kind: 'loose' } }],
    });
    expect(next.displayTiles).toEqual([]);
    const one = next.displayExpansions.find((e) => e.id === 'one')!;
    expect(one.tiles).toEqual([hx('pattern1', 'color1')]); // untouched
    expect(one.faceUp).toBe(false);
  });

  it('rejects a choice naming a source that holds no copy of that hexagon', () => {
    expect(() =>
      applyAction(buildTwoBeds(), {
        type: 'Acquire',
        playerId: 'p1',
        select: { by: 'color', color: 'color1' },
        choices: [
          { hex: hx('pattern1', 'color1'), from: { kind: 'loose' } }, // no loose copy exists
        ],
      }),
    ).toThrow(/source that holds no copy/);
  });

  it('rejects a choice naming a hexagon outside the current selection', () => {
    expect(() =>
      applyAction(buildTwoBeds(), {
        type: 'Acquire',
        playerId: 'p1',
        select: { by: 'color', color: 'color1' },
        choices: [
          // color2 is not part of a color1 selection.
          { hex: hx('pattern2', 'color2'), from: { kind: 'expansion', expansionId: 'two' } },
        ],
      }),
    ).toThrow(/not in this selection/);
  });
});

// ---------------------------------------------------------------------------
// Garden expansion lifecycle: acquire -> place / buy from supply
// ---------------------------------------------------------------------------

describe('garden expansions', () => {
  const faceUpExp = (id: string, hex: Hexagon) => ({
    id,
    hex,
    spaces: 7 as const,
    feature: 'pavilion' as const,
    tiles: [] as Hexagon[],
    faceUp: true,
  });

  it('acquire takes matching face-up expansions into expansion storage (limit 2)', () => {
    const p = makePlayer('p1');
    const state = makeState([p, makePlayer('p2')], {
      displayExpansions: [
        faceUpExp('e1', hx('pattern1', 'color1')),
        faceUpExp('e2', hx('pattern1', 'color2')),
      ],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    expect(next.players[0].expansionStore.length).toBe(2);
    expect(next.displayExpansions.length).toBe(0);
    // limit 2: a third matching expansion makes the acquire illegal
    const over = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayExpansions: [
        faceUpExp('e1', hx('pattern1', 'color1')),
        faceUpExp('e2', hx('pattern1', 'color2')),
        faceUpExp('e3', hx('pattern1', 'color3')),
      ],
    });
    expect(() =>
      applyAction(over, {
        type: 'Acquire',
        playerId: 'p1',
        select: { by: 'pattern', pattern: 'pattern1' },
      }),
    ).toThrow(/2 expansion/);
  });

  it('taking the stack-top last tile extends it, flips it face up, and feeds the next from the stack', () => {
    const covered = {
      ...faceUpExp('cov', hx('pattern5', 'color5')),
      faceUp: false,
      onStack: true,
      tiles: [hx('pattern1', 'color1')],
    };
    const nextTop = { ...faceUpExp('top2', hx('pattern6', 'color6')), faceUp: false };
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayExpansions: [covered],
      expansionStacks: [[nextTop], [], [], []],
      bag: [hx('pattern2', 'color2'), hx('pattern2', 'color3')],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    const cov = next.displayExpansions.find((e) => e.id === 'cov')!;
    expect(cov.faceUp).toBe(true); // empty after the take -> flips
    const top2 = next.displayExpansions.find((e) => e.id === 'top2')!;
    expect(top2.faceUp).toBe(false);
    expect(top2.onStack).toBe(true);
    expect(top2.tiles.length).toBe(2); // bag only had 2
    expect(next.expansionStacks[0].length).toBe(0);
  });

  it('places a face-up expansion: pays cost, grows the garden, sets pavilion + printed hex', () => {
    const p = makePlayer('p1', {
      spaces: [{ at: { q: 0, r: 0 } }],
      expansionStore: [
        { id: 'e1', spaces: 7, hex: hx('pattern2', 'color1'), faceDown: false },
      ],
      storage: [{ kind: 'joker' }],
    });
    const cells = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 1, r: 1 },
      { q: 2, r: -1 },
      { q: 3, r: 0 },
      { q: 2, r: 1 },
      { q: 3, r: -1 },
    ];
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceExpansion',
      playerId: 'p1',
      expansionId: 'e1',
      cells,
      featureAt: { q: 1, r: 0 },
      printedAt: { q: 2, r: 0 },
      payment: [{ kind: 'joker' }], // pattern2 cost 2 -> 1 additional item
    });
    const np = next.players[0];
    expect(np.spaces.length).toBe(8); // 1 + 7
    expect(np.spaces.some((s) => s.feature === 'pavilion')).toBe(true);
    expect(np.placed.length).toBe(1); // the printed hexagon
    expect(np.storage.length).toBe(0); // joker spent
    expect(np.expansionStore.length).toBe(0);
  });

  it('rejects expansion placement that does not touch the garden or overlaps it', () => {
    const p = makePlayer('p1', {
      spaces: [{ at: { q: 0, r: 0 } }],
      expansionStore: [{ id: 'e1', spaces: 7, faceDown: true }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const detached = [
      { q: 5, r: 5 },
      { q: 6, r: 5 },
      { q: 7, r: 5 },
      { q: 5, r: 6 },
      { q: 6, r: 6 },
      { q: 7, r: 6 },
      { q: 6, r: 7 },
    ];
    expect(() =>
      applyAction(state, {
        type: 'PlaceExpansion',
        playerId: 'p1',
        expansionId: 'e1',
        cells: detached,
      }),
    ).toThrow(/adjacent to the garden/);
    const overlapping = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 3, r: 0 },
    ];
    expect(() =>
      applyAction(state, {
        type: 'PlaceExpansion',
        playerId: 'p1',
        expansionId: 'e1',
        cells: overlapping,
      }),
    ).toThrow(/overlaps/);
  });

  it('buys a 7-space supply expansion for exactly 6 points', () => {
    const p = makePlayer('p1', {
      score: 15,
      spaces: [{ at: { q: 0, r: 0 } }],
    });
    const state = makeState([p, makePlayer('p2')], { expansionSupply: 4 });
    const cells = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 2, r: -1 },
      { q: 3, r: -1 },
    ];
    const next = applyAction(state, {
      type: 'BuyExpansion',
      playerId: 'p1',
      cells,
    });
    expect(next.players[0].score).toBe(15 - 6);
    expect(next.players[0].spaces.length).toBe(8); // 1 + 7 blank spaces
    expect(next.expansionSupply).toBe(3);
  });

  it('rejects supply purchase without 6 points or empty supply', () => {
    const cells = [
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
      { q: 2, r: -1 },
      { q: 3, r: -1 },
    ];
    const poor = makeState(
      [makePlayer('p1', { score: 5, spaces: [{ at: { q: 0, r: 0 } }] }), makePlayer('p2')],
      { expansionSupply: 4 },
    );
    expect(() =>
      applyAction(poor, { type: 'BuyExpansion', playerId: 'p1', cells }),
    ).toThrow(/6 points/);
    const dry = makeState(
      [makePlayer('p1', { score: 15, spaces: [{ at: { q: 0, r: 0 } }] }), makePlayer('p2')],
      { expansionSupply: 0 },
    );
    expect(() =>
      applyAction(dry, { type: 'BuyExpansion', playerId: 'p1', cells }),
    ).toThrow(/supply/);
  });

  it('generateLegalMoves offers PlaceExpansion and BuyExpansion when applicable', () => {
    const p = makePlayer('p1', {
      score: 15,
      spaces: [{ at: { q: 0, r: 0 } }],
      expansionStore: [{ id: 'e1', spaces: 7, faceDown: true }],
    });
    const state = makeState([p, makePlayer('p2')], { expansionSupply: 2 });
    const moves = generateLegalMoves(state, 'p1');
    const place = moves.find((m) => m.type === 'PlaceExpansion');
    const buy = moves.find((m) => m.type === 'BuyExpansion');
    expect(place).toBeDefined();
    expect(buy).toBeDefined();
    // generated moves must be accepted by applyAction
    expect(() => applyAction(state, place!)).not.toThrow();
    expect(() => applyAction(state, buy!)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pass + first-pass penalty
// ---------------------------------------------------------------------------

describe('applyAction: Pass', () => {
  it('first player to pass gets -1 and the first-player marker', () => {
    const state = makeState([makePlayer('p1'), makePlayer('p2')]);
    const next = applyAction(state, { type: 'Pass', playerId: 'p1' });
    expect(next.players[0].passed).toBe(true);
    expect(next.players[0].score).toBe(STARTING_SCORE - 1);
    expect(next.firstPassTaken).toBe(true);
    expect(next.firstPlayerIndex).toBe(0);
    // turn moves to p2
    expect(next.activePlayerIndex).toBe(1);
  });

  it('second player to pass takes no penalty; all-passed -> scoring phase', () => {
    let state = makeState([makePlayer('p1'), makePlayer('p2')]);
    state = applyAction(state, { type: 'Pass', playerId: 'p1' });
    state = applyAction(state, { type: 'Pass', playerId: 'p2' });
    expect(state.players[1].score).toBe(STARTING_SCORE); // no penalty
    expect(state.phase).toBe('scoring');
    expect(state.activePlayerIndex).toBeNull();
  });

  it('voluntary cleanup discard on pass scores MINUS pattern values', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern4', 'color1') },
        { kind: 'tile', hex: hx('pattern2', 'color2') },
      ],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'Pass',
      playerId: 'p1',
      discard: [hx('pattern4', 'color1'), hx('pattern2', 'color2')],
    });
    // -4 -2 from cleanup, -1 first-pass = -7
    expect(next.players[0].score).toBe(STARTING_SCORE - 7);
    expect(next.players[0].storage.length).toBe(0);
  });

  it('score never goes negative', () => {
    const p = makePlayer('p1', {
      score: 2,
      storage: [{ kind: 'tile', hex: hx('pattern6', 'color1') }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'Pass',
      playerId: 'p1',
      discard: [hx('pattern6', 'color1')],
    });
    expect(next.players[0].score).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Round scoring (Phase 2) — worked example
// ---------------------------------------------------------------------------

describe('scoreRound (Phase 2)', () => {
  it('round 1 wheel = [pattern1, color1, color2]; hex matching both pattern+color scores twice', () => {
    // sanity: confirm wheel from rules.json
    expect(WHEEL_BY_ROUND[1]).toEqual(['pattern1', 'color1', 'color2']);

    // placed:
    //  (a) pattern1/color1 -> matches pattern1 (+1) AND color1 (+1) = +2
    //  (b) pattern2/color2 -> matches color2 only (+2)
    //  (c) pattern3/color3 -> matches nothing (+0)
    const p = makePlayer('p1', {
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') },
        { at: { q: 1, r: 0 }, hex: hx('pattern2', 'color2') },
        { at: { q: 2, r: 0 }, hex: hx('pattern3', 'color3') },
      ],
    });
    expect(scoreRoundForPlayer(p, 1)).toBe(2 + 2 + 0); // = 4

    const state = makeState([p, makePlayer('p2')], { phase: 'scoring' });
    const next = scoreRound(state);
    expect(next.players[0].score).toBe(STARTING_SCORE + 4);
    expect(next.players[1].score).toBe(STARTING_SCORE + 0);
  });

  it('adds +1 per visible pavilion', () => {
    const p = makePlayer('p1', {
      spaces: [
        { at: { q: 0, r: 0 }, feature: 'pavilion' },
        { at: { q: 5, r: 5 }, feature: 'pavilion' },
        { at: { q: 1, r: 0 } },
      ],
      placed: [{ at: { q: 1, r: 0 }, hex: hx('pattern1', 'color1') }],
    });
    // round1: pattern1(+1) + color1(+1) = 2; plus 2 pavilions = 4
    expect(scoreRoundForPlayer(p, 1)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Final scoring — worked examples
// ---------------------------------------------------------------------------

describe('scoreFinal', () => {
  it('rulebook SUM rule: a color-group of 3 scores the sum of member pattern values', () => {
    // 3 adjacent same-color (color1) hexes of patterns 1,2,3 in a connected line.
    const p = makePlayer('p1', {
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') },
        { at: { q: 1, r: 0 }, hex: hx('pattern2', 'color1') },
        { at: { q: 2, r: 0 }, hex: hx('pattern3', 'color1') },
      ],
    });
    // color1 group sum = 1+2+3 = 6. No pattern group (all different patterns,
    // each pattern appears once -> size 1 < 3). Storage empty -> 0.
    expect(scoreFinalForPlayer(p, DEFAULT_CONFIG)).toBe(6);
  });

  it('groups under 3 do not score', () => {
    const p = makePlayer('p1', {
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') },
        { at: { q: 1, r: 0 }, hex: hx('pattern2', 'color1') },
      ],
    });
    expect(scoreFinalForPlayer(p, DEFAULT_CONFIG)).toBe(0);
  });

  it('a hex counts in both a color-group and a pattern-group', () => {
    // Cross shape: center pattern1/color1.
    //  - color1 group (vertical-ish): 3 same color
    //  - pattern1 group (horizontal-ish): 3 same pattern
    const p = makePlayer('p1', {
      spaces: [
        { at: { q: 0, r: 0 } },
        { at: { q: 1, r: 0 } },
        { at: { q: -1, r: 0 } },
        { at: { q: 0, r: 1 } },
        { at: { q: 0, r: -1 } },
      ],
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') }, // center
        // pattern1 group along q axis (same pattern, diff colors)
        { at: { q: 1, r: 0 }, hex: hx('pattern1', 'color2') },
        { at: { q: -1, r: 0 }, hex: hx('pattern1', 'color3') },
        // color1 group along r axis (same color, diff patterns)
        { at: { q: 0, r: 1 }, hex: hx('pattern2', 'color1') },
        { at: { q: 0, r: -1 }, hex: hx('pattern3', 'color1') },
      ],
    });
    // color1 group {center(1), (0,1)=2, (0,-1)=3} sum = 6
    // pattern1 group {center(1), (1,0)=1, (-1,0)=1} sum = 3
    // total = 9
    expect(scoreFinalForPlayer(p, DEFAULT_CONFIG)).toBe(9);
  });

  it('+6 complete-set bonus for a group of six', () => {
    // 6 adjacent same-color hexes, patterns 1..6 in a connected blob.
    const coords = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: 1, r: 1 },
      { q: -1, r: 1 },
      { q: 2, r: 0 },
    ];
    const patterns = [
      'pattern1',
      'pattern2',
      'pattern3',
      'pattern4',
      'pattern5',
      'pattern6',
    ] as const;
    const p = makePlayer('p1', {
      spaces: coords.map((at) => ({ at })),
      placed: coords.map((at, i) => ({ at, hex: hx(patterns[i], 'color1') })),
    });
    // color1 group of 6, sum of values 1+2+3+4+5+6 = 21, +6 set bonus = 27.
    // No pattern group of >=3 (each pattern unique).
    expect(scoreFinalForPlayer(p, DEFAULT_CONFIG)).toBe(21 + 6);
  });

  it('flat3 config: each qualifying group scores a flat 3', () => {
    const p = makePlayer('p1', {
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') },
        { at: { q: 1, r: 0 }, hex: hx('pattern2', 'color1') },
        { at: { q: 2, r: 0 }, hex: hx('pattern3', 'color1') },
      ],
    });
    expect(scoreFinalForPlayer(p, { finalGroupScoring: 'flat3' })).toBe(3);
  });

  it('empty-storage scoring: +1 per joker, minus pattern value per leftover tile', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'joker' },
        { kind: 'joker' },
        { kind: 'tile', hex: hx('pattern4', 'color1') }, // -4
        { kind: 'tile', hex: hx('pattern1', 'color2') }, // -1
      ],
    });
    // +2 jokers -4 -1 = -3, no groups.
    expect(scoreFinalForPlayer(p, DEFAULT_CONFIG)).toBe(-3);
  });

  it('scoreFinal sets winner(s) and shares ties', () => {
    const a = makePlayer('p1', { score: 20 });
    const b = makePlayer('p2', { score: 20 });
    const state = makeState([a, b], { phase: 'scoring', round: 4 });
    const next = scoreFinal(state);
    expect(next.phase).toBe('finished');
    expect(new Set(next.winnerIds)).toEqual(new Set(['p1', 'p2']));
  });
});

// ---------------------------------------------------------------------------
// checkWin + full round flow
// ---------------------------------------------------------------------------

describe('checkWin & game end', () => {
  it('returns null while game is ongoing', () => {
    const state = makeState([makePlayer('p1'), makePlayer('p2')]);
    expect(checkWin(state)).toBeNull();
  });

  it('advanceRound after round 4 triggers final scoring and finished phase', () => {
    const a = makePlayer('p1', {
      score: 10,
      placed: [
        { at: { q: 0, r: 0 }, hex: hx('pattern1', 'color1') },
        { at: { q: 1, r: 0 }, hex: hx('pattern2', 'color1') },
        { at: { q: 2, r: 0 }, hex: hx('pattern3', 'color1') },
      ],
    });
    const b = makePlayer('p2', { score: 5 });
    const state = makeState([a, b], { phase: 'scoring', round: 4 });
    const finished = advanceRound(state);
    expect(finished.phase).toBe('finished');
    // a: 10 + color-group sum 6 = 16; b: 5
    expect(finished.players[0].score).toBe(16);
    expect(finished.winnerIds).toEqual(['p1']);
    const winners = checkWin(finished);
    expect(winners?.map((w) => w.id)).toEqual(['p1']);
  });

  it('advanceRound mid-game increments round and resets pass flags', () => {
    const state = makeState(
      [makePlayer('p1', { passed: true }), makePlayer('p2', { passed: true })],
      {
        phase: 'scoring',
        round: 2,
        firstPlayerIndex: 1,
        bag: [hx('pattern1', 'color1')],
      },
    );
    const next = advanceRound(state);
    expect(next.round).toBe(3);
    expect(next.phase).toBe('drafting');
    expect(next.players.every((p) => !p.passed)).toBe(true);
    expect(next.activePlayerIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// generateLegalMoves
// ---------------------------------------------------------------------------

describe('generateLegalMoves', () => {
  let state: EngineGameState;
  beforeEach(() => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern1', 'color1') },
        { kind: 'tile', hex: hx('pattern2', 'color2') },
      ],
    });
    state = makeState([p, makePlayer('p2')], {
      displayTiles: [hx('pattern1', 'color3'), hx('pattern1', 'color4')],
    });
  });

  it('always includes Pass', () => {
    const moves = generateLegalMoves(state, 'p1');
    expect(moves.some((m) => m.type === 'Pass')).toBe(true);
  });

  it('includes an Acquire for the available display pattern', () => {
    const moves = generateLegalMoves(state, 'p1');
    expect(
      moves.some(
        (m) =>
          m.type === 'Acquire' &&
          m.select.by === 'pattern' &&
          m.select.pattern === 'pattern1',
      ),
    ).toBe(true);
  });

  it('includes legal PlaceTile moves with valid payment that applyAction accepts', () => {
    const moves = generateLegalMoves(state, 'p1');
    const place = moves.find((m) => m.type === 'PlaceTile');
    expect(place).toBeDefined();
    // applying a generated move must not throw
    expect(() => applyAction(state, place!)).not.toThrow();
  });

  it('returns empty for a non-active player', () => {
    expect(generateLegalMoves(state, 'p2')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Full-game integration playtest (Integration & QA agent)
//
// Plays a complete 2-player game end to end through the public engine API:
//   setup -> (legal moves -> applyAction)* per round -> scoreRound ->
//   advanceRound -> ... -> final scoring -> winner.
// This proves the whole loop holds together using only exported functions.
// ---------------------------------------------------------------------------

describe('full 2-player game playthrough (integration)', () => {
  /** Drive Phase 1 of a round to completion by always playing each active
   *  player's first legal move (the engine guarantees Pass is always legal). */
  function playDraftingPhase(start: EngineGameState): EngineGameState {
    let state = start;
    let guard = 0;
    while (state.phase === 'drafting' && state.activePlayerIndex !== null) {
      if (guard++ > 5000) throw new Error('drafting did not terminate');
      const active = state.players[state.activePlayerIndex];
      const moves = generateLegalMoves(state, active.id);
      expect(moves.length).toBeGreaterThan(0); // Pass is always available
      // Prefer a non-Pass move when one exists so gardens actually grow,
      // otherwise Pass to progress toward end-of-round.
      const move = moves.find((m) => m.type !== 'Pass') ?? moves[0];
      state = applyAction(state, move);
    }
    return state;
  }

  it('runs setup -> 4 rounds -> final scoring -> winner without throwing', () => {
    let state = setupGame({
      roomId: 'integration-room',
      players: [
        { id: 'alice', name: 'Alice' },
        { id: 'bob', name: 'Bob' },
      ],
      seed: 12345,
      config: DEFAULT_CONFIG,
    });

    expect(state.phase).toBe('drafting');
    expect(state.round).toBe(1);
    expect(state.players).toHaveLength(2);

    let safety = 0;
    while (state.phase !== 'finished') {
      if (safety++ > 20) throw new Error('game did not finish in time');

      // Phase 1: drafting/placing until everyone passes -> phase 'scoring'.
      state = playDraftingPhase(state);
      expect(state.phase).toBe('scoring');

      const roundBefore = state.round;

      // Phase 2: score the round.
      state = scoreRound(state);

      // Phase 3: advance to next round (or to final scoring after round 4).
      state = advanceRound(state);

      if (roundBefore < 4) {
        expect(state.phase).toBe('drafting');
        expect(state.round).toBe(roundBefore + 1);
        // every player reset for the new round
        expect(state.players.every((p) => !p.passed)).toBe(true);
        expect(state.firstPassTaken).toBe(false);
        expect(state.activePlayerIndex).not.toBeNull();
      } else {
        expect(state.phase).toBe('finished');
      }
    }

    // Game over: a winner (or tie set) must be decided.
    expect(state.phase).toBe('finished');
    expect(state.round).toBe(4);
    expect(state.winnerIds.length).toBeGreaterThanOrEqual(1);

    const winners = checkWin(state);
    expect(winners).not.toBeNull();
    expect(winners!.length).toBe(state.winnerIds.length);

    // The declared winner(s) really do hold the max score.
    const max = Math.max(...state.players.map((p) => p.score));
    for (const w of winners!) {
      expect(w.score).toBe(max);
    }
    // Scores are non-negative (clamped) integers.
    for (const p of state.players) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(p.score)).toBe(true);
    }
  });

  it('is deterministic for a fixed seed (same winner + scores)', () => {
    function runToEnd(seed: number): EngineGameState {
      let state = setupGame({
        roomId: 'det',
        players: [
          { id: 'alice', name: 'Alice' },
          { id: 'bob', name: 'Bob' },
        ],
        seed,
        config: DEFAULT_CONFIG,
      });
      let safety = 0;
      while (state.phase !== 'finished') {
        if (safety++ > 20) throw new Error('did not finish');
        while (state.phase === 'drafting' && state.activePlayerIndex !== null) {
          const active = state.players[state.activePlayerIndex];
          const moves = generateLegalMoves(state, active.id);
          const move = moves.find((m) => m.type !== 'Pass') ?? moves[0];
          state = applyAction(state, move);
        }
        state = scoreRound(state);
        state = advanceRound(state);
      }
      return state;
    }
    const a = runToEnd(999);
    const b = runToEnd(999);
    expect(a.winnerIds).toEqual(b.winnerIds);
    expect(a.players.map((p) => p.score)).toEqual(b.players.map((p) => p.score));
  });
});

// ---------------------------------------------------------------------------
// generateLegalMoves soundness: every generated move must be applicable.
// Regression for verifier finding #1 (seed 183137): a PlaceExpansion whose
// printedAt violated the group-duplicate rule was emitted because the move
// generator did not mirror wouldGroupContainDuplicates.
// ---------------------------------------------------------------------------

describe('generateLegalMoves soundness (every move applies)', () => {
  /**
   * Play a full game for `seed`. At every decision point, verify that EVERY
   * legal move applies without throwing, then advance with a pseudo-random
   * legal move (deterministic per seed) to explore varied lines.
   */
  function assertAllMovesApply(seed: number, maxPlies = Infinity): void {
    let state = setupGame({
      roomId: 'soundness',
      players: [
        { id: 'p1', name: 'P1' },
        { id: 'p2', name: 'P2' },
      ],
      seed,
      config: DEFAULT_CONFIG,
    });
    let rngState = seed >>> 0 || 1;
    const nextRand = (): number => {
      // xorshift32
      rngState ^= rngState << 13;
      rngState ^= rngState >>> 17;
      rngState ^= rngState << 5;
      rngState >>>= 0;
      return rngState;
    };
    let plies = 0;
    let safety = 0;
    while (state.phase !== 'finished' && plies < maxPlies) {
      if (safety++ > 20000) throw new Error('game did not terminate');
      if (state.phase === 'scoring') {
        state = advanceRound(scoreRound(state));
        continue;
      }
      if (state.activePlayerIndex === null) break;
      const active = state.players[state.activePlayerIndex];
      const moves = generateLegalMoves(state, active.id);
      expect(moves.length).toBeGreaterThan(0);
      for (const m of moves) {
        try {
          applyAction(state, m);
        } catch (err) {
          throw new Error(
            `seed ${seed} ply ${plies}: generated move not applicable: ` +
              `${JSON.stringify(m)} -> ${(err as Error).message}`,
          );
        }
      }
      // Bias toward non-Pass moves so boards grow and expansions get placed.
      const nonPass = moves.filter((m) => m.type !== 'Pass');
      const pool = nonPass.length > 0 && nextRand() % 10 !== 0 ? nonPass : moves;
      state = applyAction(state, pool[nextRand() % pool.length]);
      plies++;
    }
  }

  it('regression: seed 183137 — every generated move applies for a full game', () => {
    assertAllMovesApply(183137);
  });

  it('property: 50 random seeds, every generated move applies across plies', () => {
    for (let i = 0; i < 50; i++) {
      const seed = 100003 * (i + 1) + 7;
      assertAllMovesApply(seed, 60);
    }
  });
});

// ---------------------------------------------------------------------------
// Payment suggestion helpers (exported for the client payment picker)
// ---------------------------------------------------------------------------

describe('pickCanonicalPayment (tile placement suggestions)', () => {
  const PATTERNS = [
    'pattern1',
    'pattern2',
    'pattern3',
    'pattern4',
    'pattern5',
    'pattern6',
  ] as const;
  const COLORS = [
    'color1',
    'color2',
    'color3',
    'color4',
    'color5',
    'color6',
  ] as const;

  it('returns a validatePayment-passing suggestion for every pattern value 1-6 (same-pattern sets)', () => {
    for (const pattern of PATTERNS) {
      const need = ADDITIONAL_TO_DISCARD[pattern];
      // storage: the placed tile + enough same-pattern, different-color tiles
      const storage: PlayerEngineState['storage'] = [
        { kind: 'tile', hex: hx(pattern, 'color1') },
        ...COLORS.slice(1, 1 + need).map((c) => ({
          kind: 'tile' as const,
          hex: hx(pattern, c),
        })),
      ];
      const p = makePlayer('p1', { storage });
      const payment = pickCanonicalPayment(p, hx(pattern, 'color1'), need);
      expect(payment, `pattern ${pattern}`).not.toBeNull();
      expect(payment!).toHaveLength(need);
      expect(() =>
        validatePayment(p, hx(pattern, 'color1'), payment!),
      ).not.toThrow();
    }
  });

  it('prefers jokers and substitutes them for missing tiles', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') },
        { kind: 'joker' },
        { kind: 'joker' },
      ],
    });
    const payment = pickCanonicalPayment(p, hx('pattern3', 'color1'), 2);
    expect(payment).toEqual([{ kind: 'joker' }, { kind: 'joker' }]);
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), payment!),
    ).not.toThrow();
  });

  it('mixes jokers with real tiles when jokers alone are not enough', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color1') },
        { kind: 'joker' },
        { kind: 'tile', hex: hx('pattern3', 'color2') },
      ],
    });
    const payment = pickCanonicalPayment(p, hx('pattern3', 'color1'), 2);
    expect(payment).not.toBeNull();
    expect(payment!.filter((x) => x.kind === 'joker')).toHaveLength(1);
    expect(() =>
      validatePayment(p, hx('pattern3', 'color1'), payment!),
    ).not.toThrow();
  });

  it('falls back to a same-color set when same-pattern is impossible', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern2', 'color1') },
        { kind: 'tile', hex: hx('pattern4', 'color1') },
      ],
    });
    const payment = pickCanonicalPayment(p, hx('pattern2', 'color1'), 1);
    expect(payment).toEqual([{ kind: 'tile', hex: hx('pattern4', 'color1') }]);
    expect(() =>
      validatePayment(p, hx('pattern2', 'color1'), payment!),
    ).not.toThrow();
  });

  it('returns null when the player cannot afford the placement', () => {
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern6', 'color1') },
        // mismatched tile: neither same pattern nor same color
        { kind: 'tile', hex: hx('pattern2', 'color3') },
      ],
    });
    expect(pickCanonicalPayment(p, hx('pattern6', 'color1'), 5)).toBeNull();
  });

  it('returns null when the placed tile itself is not in storage', () => {
    const p = makePlayer('p1', { storage: [{ kind: 'joker' }] });
    expect(pickCanonicalPayment(p, hx('pattern1', 'color1'), 0)).toBeNull();
  });
});

describe('pickExpansionPayment (printed-hex suggestions)', () => {
  it('does NOT consume the printed hex from storage (cost-1 items only)', () => {
    // Storage holds only 2 matching tiles; printed hex is pattern3 (cost 3,
    // payment = 2 items). Unlike PlaceTile, no copy of the printed hex needed.
    const p = makePlayer('p1', {
      storage: [
        { kind: 'tile', hex: hx('pattern3', 'color2') },
        { kind: 'tile', hex: hx('pattern3', 'color3') },
      ],
    });
    const payment = pickExpansionPayment(p, hx('pattern3', 'color1'));
    expect(payment).not.toBeNull();
    expect(payment!).toHaveLength(2);
    expect(() =>
      validateExpansionPayment(p, hx('pattern3', 'color1'), payment!),
    ).not.toThrow();
    // The equivalent tile placement would FAIL (placed copy not in storage).
    expect(pickCanonicalPayment(p, hx('pattern3', 'color1'), 2)).toBeNull();
  });

  it('pattern1 printed hex costs nothing extra (empty payment)', () => {
    const p = makePlayer('p1', { storage: [] });
    expect(pickExpansionPayment(p, hx('pattern1', 'color1'))).toEqual([]);
  });

  it('uses jokers as wild payment for an expansion', () => {
    const p = makePlayer('p1', {
      storage: [{ kind: 'joker' }, { kind: 'joker' }, { kind: 'joker' }],
    });
    const payment = pickExpansionPayment(p, hx('pattern4', 'color1'));
    expect(payment).toEqual([
      { kind: 'joker' },
      { kind: 'joker' },
      { kind: 'joker' },
    ]);
    expect(() =>
      validateExpansionPayment(p, hx('pattern4', 'color1'), payment!),
    ).not.toThrow();
  });

  it('returns null when unaffordable', () => {
    const p = makePlayer('p1', {
      storage: [{ kind: 'tile', hex: hx('pattern1', 'color5') }],
    });
    expect(pickExpansionPayment(p, hx('pattern6', 'color1'))).toBeNull();
  });
});
