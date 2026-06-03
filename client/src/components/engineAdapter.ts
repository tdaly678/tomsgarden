/**
 * Adapter between the canonical engine model (`@tomsgarden/shared`) and the
 * board's presentational view model (`./boardModel`).
 *
 *  - `toBoardState(engine)`  : EngineGameState -> board GameState
 *  - `toEngineAction(action, engine)` : board Action -> engine Action (wire shape)
 *
 * The engine speaks in hexagons (pattern+color) placed at axial coords, with a
 * per-player storage (real tiles + jokers). The board speaks in colored tiles
 * with a `#<patternId>` suffix on their id (the legacy "pattern in id" encoding,
 * which `gamelogic.patternOf` reads). We bridge the two here so neither side has
 * to change. Engine `ColorId`/`PatternId` (color1.., pattern1..) map to the
 * themed board names by index.
 */

import type {
  EngineGameState,
  PlayerEngineState,
  ColorId,
  PatternId as EnginePatternId,
  Hexagon,
  StorageItem,
} from '@tomsgarden/shared';
import type { Action as EngineAction } from '@tomsgarden/shared';
import type {
  Action as BoardAction,
  Coord,
  GameState as BoardGameState,
  PlayerState as BoardPlayer,
  TileColor,
  Tile as BoardTile,
} from './boardModel';
import type { PatternId as BoardPatternId } from './theme';

// ---------------------------------------------------------------------------
// Static maps between engine ids and themed board ids (index-aligned).
// ---------------------------------------------------------------------------

const COLOR_ORDER: TileColor[] = [
  'purple',
  'green',
  'orange',
  'red',
  'blue',
  'yellow',
];
const ENGINE_COLORS: ColorId[] = [
  'color1',
  'color2',
  'color3',
  'color4',
  'color5',
  'color6',
];
const BOARD_PATTERNS: BoardPatternId[] = [
  'sapling',
  'robin',
  'ladybug',
  'sunflower',
  'snail',
  'beehive',
];
const ENGINE_PATTERNS: EnginePatternId[] = [
  'pattern1',
  'pattern2',
  'pattern3',
  'pattern4',
  'pattern5',
  'pattern6',
];

const colorToBoard = new Map(ENGINE_COLORS.map((c, i) => [c, COLOR_ORDER[i]]));
const colorToEngine = new Map(COLOR_ORDER.map((c, i) => [c, ENGINE_COLORS[i]]));
const patternToBoard = new Map(
  ENGINE_PATTERNS.map((p, i) => [p, BOARD_PATTERNS[i]]),
);
const patternToEngine = new Map(
  BOARD_PATTERNS.map((p, i) => [p, ENGINE_PATTERNS[i]]),
);

// ---------------------------------------------------------------------------
// Tile id encoding: "<engineColor>:<enginePattern>#<boardPattern>"
//  - the `#<boardPattern>` suffix is what gamelogic.patternOf reads
//  - the prefix lets us recover the exact engine Hexagon for an action
// ---------------------------------------------------------------------------

function encodeTileId(hex: Hexagon, seq: number): string {
  const boardPat = patternToBoard.get(hex.pattern) ?? 'sapling';
  return `${hex.color}:${hex.pattern}@${seq}#${boardPat}`;
}

/** Recover the engine Hexagon from a board tile id, or null for jokers/unknown. */
export function decodeHexFromTileId(id: string): Hexagon | null {
  const at = id.indexOf('@');
  const head = at >= 0 ? id.slice(0, at) : id.split('#')[0];
  const [color, pattern] = head.split(':');
  if (!color || !pattern) return null;
  if (!ENGINE_COLORS.includes(color as ColorId)) return null;
  if (!ENGINE_PATTERNS.includes(pattern as EnginePatternId)) return null;
  return { color: color as ColorId, pattern: pattern as EnginePatternId };
}

function hexToBoardTile(hex: Hexagon, seq: number): BoardTile {
  return {
    id: encodeTileId(hex, seq),
    color: colorToBoard.get(hex.color) ?? 'purple',
  };
}

function jokerToBoardTile(playerId: string, seq: number): BoardTile {
  return { id: `joker:${playerId}@${seq}#sapling`, color: 'purple', wildcard: true };
}

// ---------------------------------------------------------------------------
// Engine state -> board view
// ---------------------------------------------------------------------------

function axialToCoord(a: { q: number; r: number }): Coord {
  return { row: a.r, col: a.q };
}

function toBoardPlayer(p: PlayerEngineState): BoardPlayer {
  let seq = 0;
  const hand: BoardTile[] = p.storage.map((item: StorageItem) =>
    item.kind === 'joker'
      ? jokerToBoardTile(p.id, seq++)
      : hexToBoardTile(item.hex, seq++),
  );
  const board = p.placed.map((ph) => ({
    tile: hexToBoardTile(ph.hex, seq++),
    at: axialToCoord(ph.at),
  }));
  return {
    id: p.id,
    name: p.name,
    connected: true,
    score: p.score,
    hand,
    board,
    floor: [],
  };
}

const PHASE_MAP: Record<EngineGameState['phase'], BoardGameState['phase']> = {
  lobby: 'lobby',
  drafting: 'drafting',
  scoring: 'scoring',
  finished: 'finished',
};

/** Convert authoritative engine state into the board's view model. */
export function toBoardState(engine: EngineGameState): BoardGameState {
  let seq = 0;
  // The shared display becomes the single "Nursery" center pool. The board can
  // still render per-flower-bed factories from display expansions when present.
  const center: BoardTile[] = engine.displayTiles.map((hex) =>
    hexToBoardTile(hex, seq++),
  );
  const factories = engine.displayExpansions.map((exp) => ({
    id: exp.id,
    tiles: exp.tiles.map((hex) => hexToBoardTile(hex, seq++)),
  }));

  return {
    roomId: engine.roomId,
    phase: PHASE_MAP[engine.phase],
    round: engine.round,
    players: engine.players.map(toBoardPlayer),
    activePlayerIndex: engine.activePlayerIndex,
    factories,
    center,
    bagCount: engine.bag.length,
    winnerId: engine.winnerIds[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Board action -> engine action (wire shape)
// ---------------------------------------------------------------------------

/**
 * Translate a board-level intent into a canonical engine Action.
 *
 *  - DraftTiles(color)  -> Acquire by color
 *  - PlaceTile(tileId, at) -> PlaceTile(hex, at, payment:[]) (payment UI TBD)
 *  - DiscardToFloor / EndTurn -> Pass (optionally discarding the hex)
 *
 * Returns null when the intent cannot be expressed (caller should ignore).
 */
export function toEngineAction(action: BoardAction): EngineAction | null {
  switch (action.type) {
    case 'DraftTiles': {
      const color = colorToEngine.get(action.color);
      if (!color) return null;
      return {
        type: 'Acquire',
        playerId: action.playerId,
        select: { by: 'color', color },
      };
    }
    case 'PlaceTile': {
      const hex = decodeHexFromTileId(action.tileId);
      if (!hex) return null;
      return {
        type: 'PlaceTile',
        playerId: action.playerId,
        hex,
        at: { q: action.at.col, r: action.at.row },
        payment: [],
      };
    }
    case 'DiscardToFloor': {
      const hex = decodeHexFromTileId(action.tileId);
      return {
        type: 'Pass',
        playerId: action.playerId,
        discard: hex ? [hex] : undefined,
      };
    }
    case 'EndTurn':
      return { type: 'Pass', playerId: action.playerId };
    default:
      return null;
  }
}

/** Pattern lookup that reads the engine-encoded board tile id. */
export { patternToEngine };
