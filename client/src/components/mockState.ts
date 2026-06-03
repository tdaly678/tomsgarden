/**
 * Realistic mocked GameState fixture so the board renders standalone (no server).
 * Tile ids encode their pattern as `#<patternId>` (see gamelogic.patternOf).
 */

import type {
  Factory,
  GameState,
  PlacedTile,
  PlayerState,
  Tile,
  TileColor,
} from './boardModel';
import type { PatternId } from './theme';
import { ALL_COLORS } from './theme';

let seq = 0;
function mkTile(color: TileColor, pattern: PatternId, wildcard = false): Tile {
  seq += 1;
  return { id: `t${seq}#${pattern}`, color, wildcard };
}

function mkWildseed(): Tile {
  seq += 1;
  return { id: `w${seq}#sapling`, color: 'purple', wildcard: true };
}

const PATS: PatternId[] = [
  'sapling',
  'robin',
  'ladybug',
  'sunflower',
  'snail',
  'beehive',
];

function factory(id: string, defs: [TileColor, PatternId][]): Factory {
  return { id, tiles: defs.map(([c, p]) => mkTile(c, p)) };
}

// A small starter cluster on player 0's garden (legal adjacency).
const player0Board: PlacedTile[] = [
  { tile: mkTile('green', 'sapling'), at: { row: 0, col: 1 } },
  { tile: mkTile('green', 'robin'), at: { row: 0, col: -1 } },
  { tile: mkTile('purple', 'robin'), at: { row: -1, col: -1 } },
  { tile: mkTile('purple', 'ladybug'), at: { row: 1, col: -1 } },
  { tile: mkTile('blue', 'sapling'), at: { row: 1, col: 1 } },
];

const player1Board: PlacedTile[] = [
  { tile: mkTile('red', 'sunflower'), at: { row: 0, col: 1 } },
  { tile: mkTile('red', 'ladybug'), at: { row: -1, col: 1 } },
  { tile: mkTile('yellow', 'sunflower'), at: { row: 0, col: -1 } },
];

const players: PlayerState[] = [
  {
    id: 'p0',
    name: 'Tom',
    connected: true,
    score: 24,
    hand: [mkTile('green', 'ladybug'), mkTile('blue', 'robin'), mkWildseed()],
    board: player0Board,
    floor: [mkTile('orange', 'snail')],
  },
  {
    id: 'p1',
    name: 'Rosalind',
    connected: true,
    score: 19,
    hand: [mkWildseed(), mkWildseed()],
    board: player1Board,
    floor: [],
  },
  {
    id: 'p2',
    name: 'Basil',
    connected: false,
    score: 31,
    hand: [],
    board: [{ tile: mkTile('orange', 'beehive'), at: { row: 0, col: 1 } }],
    floor: [],
  },
];

const factories: Factory[] = [
  factory('f1', [
    ['purple', 'sapling'],
    ['purple', 'robin'],
    ['green', 'sunflower'],
    ['yellow', 'ladybug'],
  ]),
  factory('f2', [
    ['red', 'robin'],
    ['red', 'snail'],
    ['blue', 'beehive'],
    ['orange', 'sapling'],
  ]),
  factory('f3', [
    ['yellow', 'beehive'],
    ['green', 'ladybug'],
    ['green', 'robin'],
    ['blue', 'sunflower'],
  ]),
  factory('f4', [
    ['blue', 'sapling'],
    ['blue', 'robin'],
    ['orange', 'ladybug'],
    ['purple', 'snail'],
  ]),
  factory('f5', [
    ['red', 'sunflower'],
    ['yellow', 'sapling'],
    ['orange', 'robin'],
    ['purple', 'beehive'],
  ]),
];

const center: Tile[] = [
  mkTile('green', 'sapling'),
  mkTile('green', 'snail'),
  mkTile('yellow', 'robin'),
  mkTile('blue', 'ladybug'),
  mkWildseed(),
];

export const MOCK_STATE: GameState = {
  roomId: 'demo',
  phase: 'placing',
  round: 2,
  players,
  activePlayerIndex: 0,
  factories,
  center,
  bagCount: 73,
  winnerId: null,
};

/** All distinct hexagon defs, handy for legends/tests. */
export const ALL_HEXAGONS = ALL_COLORS.flatMap((c) =>
  PATS.map((p) => ({ color: c, pattern: p })),
);
