import { beforeEach, describe, expect, it } from 'vitest';
import {
  advanceRound,
  applyAction,
  canPlaceHexAt,
  checkWin,
  countJokers,
  generateLegalMoves,
  IllegalMoveError,
  scoreFinal,
  scoreFinalForPlayer,
  scoreRound,
  scoreRoundForPlayer,
  setupGame,
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
    expansionStore: 0,
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
    displayExpansions: [],
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
    expect(s.displayTiles.length).toBe(4);
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
    expect(a.displayTiles).toEqual(b.displayTiles);
    expect(a.bag).toEqual(b.bag);
    expect(a.displayTiles).not.toEqual(c.displayTiles);
  });

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

  it('awards jokers when a feature is fully surrounded', () => {
    // pavilion at center, ring of 3 reachable neighbour spaces; fill last to surround.
    const p = makePlayer('p1', {
      spaces: [
        { at: { q: 0, r: 0 }, feature: 'pavilion' },
        { at: { q: 1, r: 0 } },
        { at: { q: 0, r: 1 } },
      ],
      placed: [{ at: { q: 1, r: 0 }, hex: hx('pattern1', 'color1') }],
      storage: [{ kind: 'tile', hex: hx('pattern1', 'color2') }],
    });
    const state = makeState([p, makePlayer('p2')]);
    const next = applyAction(state, {
      type: 'PlaceTile',
      playerId: 'p1',
      hex: hx('pattern1', 'color2'), // shares pattern with neighbour
      at: { q: 0, r: 1 },
      payment: [],
    });
    // pavilion surround awards 1 joker (rules.json placeholder)
    expect(countJokers(next.players[0])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Acquire — storage limits & display refill
// ---------------------------------------------------------------------------

describe('applyAction: Acquire', () => {
  it('takes all matching colors for a pattern, dedupes identical, refills 4', () => {
    const state = makeState([makePlayer('p1'), makePlayer('p2')], {
      displayTiles: [
        hx('pattern1', 'color1'),
        hx('pattern1', 'color2'),
        hx('pattern1', 'color2'), // duplicate -> take only one
        hx('pattern2', 'color3'), // not matching
      ],
      bag: [
        hx('pattern6', 'color6'),
        hx('pattern6', 'color5'),
        hx('pattern6', 'color4'),
        hx('pattern6', 'color3'),
        hx('pattern6', 'color2'),
      ],
    });
    const next = applyAction(state, {
      type: 'Acquire',
      playerId: 'p1',
      select: { by: 'pattern', pattern: 'pattern1' },
    });
    // 2 distinct pattern1 tiles into storage
    expect(next.players[0].storage.length).toBe(2);
    // all pattern1 removed from display; pattern2 stays; plus 4 drawn
    const remainingNonDraw = next.displayTiles.filter(
      (t) => t.pattern !== 'pattern6',
    );
    expect(remainingNonDraw).toEqual([hx('pattern2', 'color3')]);
    expect(
      next.displayTiles.filter((t) => t.pattern === 'pattern6').length,
    ).toBe(4);
    expect(next.bag.length).toBe(1);
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
