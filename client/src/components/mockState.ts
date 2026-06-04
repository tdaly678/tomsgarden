/**
 * Realistic mocked GameState fixture so the board renders standalone (no server).
 * Tile ids encode their pattern as `#<patternId>` (see gamelogic.patternOf).
 */

import type {
  DisplayBed,
  Factory,
  GameState,
  PlacedTile,
  PlayerState,
  PlotSpace,
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

/**
 * The 13-hex fountain board every player starts with: central birdbath
 * (fountain) feature, 6 empty tile spaces (ring 1), and 6 printed features
 * (3 garden gnomes + 3 potting tables alternating on the ring-2 star points).
 * Mirrors the engine's `fountainBoardSpaces`.
 */
function fountainBoard(): PlotSpace[] {
  const out: PlotSpace[] = [
    { at: { row: 0, col: 0 }, feature: 'birdbath', piece: 'fountain' },
  ];
  // ring 1: the 6 empty placeable spaces (axial q=col, r=row)
  const ring1 = [
    { row: 0, col: 1 },
    { row: 1, col: 0 },
    { row: 1, col: -1 },
    { row: 0, col: -1 },
    { row: -1, col: 0 },
    { row: -1, col: 1 },
  ];
  for (const at of ring1) out.push({ at, piece: 'fountain' });
  // alternating ring-2 star points: gnome (statue) / potting table (bench)
  const featureRing = [
    { row: -1, col: 2 },
    { row: 1, col: 1 },
    { row: 2, col: -1 },
    { row: 1, col: -2 },
    { row: -1, col: -1 },
    { row: -2, col: 1 },
  ];
  featureRing.forEach((at, i) =>
    out.push({
      at,
      piece: 'fountain',
      feature: i % 2 === 0 ? 'gardenGnome' : 'pottingTable',
    }),
  );
  return out;
}

/** Mid-game: player 0 has attached a 7-space bed (gazebo + spaces). */
function bedSpaces(): PlotSpace[] {
  return [
    { at: { row: 0, col: 2 }, feature: 'gazebo', piece: 'bedA' },
    { at: { row: 0, col: 3 }, piece: 'bedA' },
    { at: { row: 1, col: 2 }, piece: 'bedA' },
    { at: { row: 1, col: 3 }, piece: 'bedA' },
    { at: { row: -1, col: 3 }, piece: 'bedA' },
    { at: { row: -1, col: 4 }, piece: 'bedA' },
    { at: { row: 0, col: 4 }, piece: 'bedA' },
  ];
}

// A small starter cluster on player 0's garden (legal adjacency).
const player0Board: PlacedTile[] = [
  { tile: mkTile('green', 'sapling'), at: { row: 0, col: 1 } },
  { tile: mkTile('green', 'robin'), at: { row: 0, col: -1 } },
  { tile: mkTile('purple', 'robin'), at: { row: -1, col: 0 } },
  { tile: mkTile('purple', 'ladybug'), at: { row: 1, col: -1 } },
  { tile: mkTile('blue', 'sapling'), at: { row: 1, col: 0 } },
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
    spaces: [...fountainBoard(), ...bedSpaces()],
    beds: [
      {
        id: 'held-1',
        spaces: 7,
        faceDown: false,
        printedTile: mkTile('red', 'robin'),
      },
    ],
  },
  {
    id: 'p1',
    name: 'Rosalind',
    connected: true,
    score: 19,
    hand: [mkWildseed(), mkWildseed()],
    board: player1Board,
    floor: [],
    spaces: fountainBoard(),
    beds: [],
  },
  {
    id: 'p2',
    name: 'Basil',
    connected: false,
    score: 31,
    hand: [],
    board: [{ tile: mkTile('orange', 'beehive'), at: { row: 0, col: 1 } }],
    floor: [],
    spaces: fountainBoard(),
    beds: [{ id: 'held-2', spaces: 7, faceDown: true }],
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

const MOCK_DISPLAY_BEDS: DisplayBed[] = [
  {
    id: 'db1',
    spaces: 7,
    faceUp: true,
    printedTile: mkTile('blue', 'sunflower'),
  },
  { id: 'db2', spaces: 7, faceUp: false },
];

export const MOCK_STATE: GameState = {
  roomId: 'demo',
  phase: 'placing',
  round: 2,
  players,
  activePlayerIndex: 0,
  factories,
  center,
  displayBeds: MOCK_DISPLAY_BEDS,
  supplyCount: 14,
  bagCount: 73,
  winnerId: null,
};

/** All distinct hexagon defs, handy for legends/tests. */
export const ALL_HEXAGONS = ALL_COLORS.flatMap((c) =>
  PATS.map((p) => ({ color: c, pattern: p })),
);
