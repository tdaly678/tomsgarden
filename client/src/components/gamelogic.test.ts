/**
 * Pins the client-side acquire preview (`acquirePreview` in gamelogic.ts) to
 * the engine's actual Acquire behavior (`acquirableHexagons` + applyAcquire in
 * shared/engine/core.ts). For a given selector, the set of hexagons the UI
 * highlights as "taken" must EXACTLY equal the set the engine moves into
 * storage — including the canonical duplicate choice (loose pool first, then
 * the flower bed holding the fewest tiles) and matching face-up beds.
 */
import { describe, expect, it } from 'vitest';
import { applyAction } from '@tomsgarden/shared/engine';
import type {
  EngineGameState,
  Hexagon,
  PlayerEngineState,
} from '@tomsgarden/shared/engine';
import { DEFAULT_CONFIG } from '@tomsgarden/shared/engine';
import { acquirePreview, patternOf } from './gamelogic';
import { decodeHexFromTileId, toBoardState } from './engineAdapter';
import type { DraftSelector } from './boardModel';

const hx = (
  pattern: Hexagon['pattern'],
  color: Hexagon['color'],
): Hexagon => ({ pattern, color });

function makePlayer(id: string): PlayerEngineState {
  return {
    id,
    name: id,
    score: 15,
    spaces: [{ at: { q: 0, r: 0 } }],
    placed: [],
    storage: [],
    expansionStore: [],
    passed: false,
  };
}

function makeState(overrides: Partial<EngineGameState>): EngineGameState {
  return {
    roomId: 'test',
    phase: 'drafting',
    round: 1,
    players: [makePlayer('p1'), makePlayer('p2')],
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

const hexKey = (h: Hexagon): string => `${h.pattern}:${h.color}`;

/** Multiset of hexagons currently anywhere in the display. */
function displayMultiset(s: EngineGameState): Map<string, number> {
  const m = new Map<string, number>();
  const add = (h: Hexagon): void => {
    m.set(hexKey(h), (m.get(hexKey(h)) ?? 0) + 1);
  };
  for (const t of s.displayTiles) add(t);
  for (const e of s.displayExpansions) for (const t of e.tiles) add(t);
  return m;
}

/**
 * Run both sides for one selector and assert lockstep:
 *  - UI taken hex set == hexes added to engine storage
 *  - UI dup count == matching copies the engine left behind
 *  - UI bedIds == face-up expansions the engine acquired
 */
function assertLockstep(
  engineState: EngineGameState,
  engineSelect:
    | { by: 'pattern'; pattern: Hexagon['pattern'] }
    | { by: 'color'; color: Hexagon['color'] },
  boardSelect: DraftSelector,
): void {
  const board = toBoardState(engineState);
  const preview = acquirePreview(
    board.center,
    board.factories,
    board.displayBeds,
    boardSelect,
  );

  const after = applyAction(engineState, {
    type: 'Acquire',
    playerId: 'p1',
    select: engineSelect,
  });

  // Engine: which hexagons landed in storage?
  const stored = after.players[0].storage
    .filter((s) => s.kind === 'tile')
    .map((s) => (s as { kind: 'tile'; hex: Hexagon }).hex);

  // UI: decode the taken board tiles back to engine hexagons.
  const uiTaken = preview.taken.map((t) => {
    const h = decodeHexFromTileId(t.id);
    if (!h) throw new Error(`undecodable tile id ${t.id}`);
    return h;
  });

  expect(uiTaken.map(hexKey).sort()).toEqual(stored.map(hexKey).sort());
  // Distinct hexes only — no duplicates taken.
  expect(new Set(uiTaken.map(hexKey)).size).toBe(uiTaken.length);

  // Duplicates the UI marks as skipped must still be in the display after.
  const remaining = displayMultiset(after);
  for (const id of preview.dupIds) {
    const h = decodeHexFromTileId(id);
    expect(h).not.toBeNull();
    expect(remaining.get(hexKey(h!)) ?? 0).toBeGreaterThan(0);
  }

  // taken + dup count == total matching copies before the acquire.
  const matchCount = (s: EngineGameState): number => {
    const match = (h: Hexagon): boolean =>
      engineSelect.by === 'pattern'
        ? h.pattern === engineSelect.pattern
        : h.color === engineSelect.color;
    let n = 0;
    for (const t of s.displayTiles) if (match(t)) n++;
    for (const e of s.displayExpansions)
      for (const t of e.tiles) if (match(t)) n++;
    return n;
  };
  expect(preview.takenIds.size + preview.dupIds.size).toBe(
    matchCount(engineState),
  );

  // Face-up beds: UI bedIds == expansions removed from display into storage.
  const beforeIds = new Set(engineState.displayExpansions.map((e) => e.id));
  const afterIds = new Set(after.displayExpansions.map((e) => e.id));
  const acquiredBeds = [...beforeIds].filter((id) => !afterIds.has(id));
  expect([...preview.bedIds].sort()).toEqual(acquiredBeds.sort());
  expect(after.players[0].expansionStore.map((e) => e.id).sort()).toEqual(
    acquiredBeds.sort(),
  );
}

describe('acquirePreview mirrors the engine across the whole display', () => {
  it('dedups identical hexagons globally: loose pool preferred over beds', () => {
    // Identical pattern1/color1 in the loose pool AND on two beds; plus other
    // matching tiles scattered across beds. Engine takes the loose copy.
    const state = makeState({
      displayTiles: [hx('pattern1', 'color1'), hx('pattern1', 'color2')],
      displayExpansions: [
        {
          id: 'expA',
          hex: hx('pattern3', 'color3'),
          spaces: 7,
          feature: 'pavilion',
          faceUp: false,
          tiles: [
            hx('pattern1', 'color1'), // duplicate — skipped
            hx('pattern1', 'color4'),
            hx('pattern2', 'color1'),
          ],
        },
        {
          id: 'expB',
          hex: hx('pattern4', 'color4'),
          spaces: 7,
          feature: 'pavilion',
          faceUp: false,
          tiles: [hx('pattern1', 'color1'), hx('pattern1', 'color5')], // dup + new
        },
      ],
    });
    assertLockstep(
      state,
      { by: 'pattern', pattern: 'pattern1' },
      { by: 'pattern', pattern: 'sapling' }, // pattern1 -> sapling (board id)
    );
  });

  it('among beds, the duplicate copy is taken from the bed with fewest tiles', () => {
    // pattern2/color2 appears on a 3-tile bed and a 1-tile bed; the engine's
    // canonical choice takes the copy from the 1-tile bed.
    const state = makeState({
      displayTiles: [],
      displayExpansions: [
        {
          id: 'big',
          hex: hx('pattern3', 'color3'),
          spaces: 7,
          feature: 'pavilion',
          faceUp: false,
          tiles: [
            hx('pattern2', 'color2'),
            hx('pattern5', 'color5'),
            hx('pattern6', 'color6'),
          ],
        },
        {
          id: 'small',
          hex: hx('pattern4', 'color4'),
          spaces: 7,
          feature: 'pavilion',
          faceUp: false,
          tiles: [hx('pattern2', 'color2')],
        },
      ],
    });
    const board = toBoardState(state);
    const preview = acquirePreview(board.center, board.factories, board.displayBeds, {
      by: 'pattern',
      pattern: 'robin', // pattern2
    });
    // Exactly one taken, one dup; the taken one lives on the SMALL bed.
    expect(preview.taken).toHaveLength(1);
    expect(preview.dupIds.size).toBe(1);
    const smallFactory = board.factories.find((f) => f.id === 'small')!;
    expect(smallFactory.tiles.some((t) => preview.takenIds.has(t.id))).toBe(
      true,
    );
    assertLockstep(
      state,
      { by: 'pattern', pattern: 'pattern2' },
      { by: 'pattern', pattern: 'robin' },
    );
  });

  it('acquire by COLOR spans loose pool + all beds and dedups by full hexagon', () => {
    const state = makeState({
      displayTiles: [hx('pattern1', 'color1'), hx('pattern2', 'color1')],
      displayExpansions: [
        {
          id: 'expA',
          hex: hx('pattern3', 'color3'),
          spaces: 7,
          feature: 'pavilion',
          faceUp: false,
          tiles: [
            hx('pattern2', 'color1'), // dup of loose pattern2/color1
            hx('pattern3', 'color1'),
            hx('pattern4', 'color2'),
          ],
        },
      ],
    });
    assertLockstep(
      state,
      { by: 'color', color: 'color1' },
      { by: 'color', color: 'purple' }, // color1 -> purple (board color)
    );
  });

  it('includes matching FACE-UP flower beds in the selection (engine acquires them)', () => {
    const state = makeState({
      displayTiles: [hx('pattern5', 'color2')],
      displayExpansions: [
        {
          id: 'faceup',
          hex: hx('pattern5', 'color5'), // printed hexagon matches pattern5
          spaces: 7,
          feature: 'pavilion',
          faceUp: true,
          tiles: [],
        },
        {
          id: 'facedown',
          hex: hx('pattern5', 'color6'), // matches too but face DOWN — excluded
          spaces: 7,
          feature: 'pavilion',
          faceUp: false,
          tiles: [hx('pattern5', 'color3')],
        },
      ],
    });
    const board = toBoardState(state);
    const preview = acquirePreview(board.center, board.factories, board.displayBeds, {
      by: 'pattern',
      pattern: 'snail', // pattern5
    });
    expect(preview.bedIds).toEqual(new Set(['faceup']));
    expect(preview.taken).toHaveLength(2); // loose + on facedown bed
    assertLockstep(
      state,
      { by: 'pattern', pattern: 'pattern5' },
      { by: 'pattern', pattern: 'snail' },
    );
  });

  it('board-id round trip: patternOf/decodeHex agree on adapter tile ids', () => {
    const state = makeState({
      displayTiles: [hx('pattern3', 'color4')],
    });
    const board = toBoardState(state);
    const tile = board.center[0];
    expect(patternOf(tile)).toBe('ladybug'); // pattern3 -> ladybug
    expect(decodeHexFromTileId(tile.id)).toEqual(hx('pattern3', 'color4'));
  });
});
