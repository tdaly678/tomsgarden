/**
 * Placeholder SVG plant tile. The Design agent can replace `<PatternGlyph>`
 * art and the colors come from CSS vars via `colorVar()`.
 */
import type React from 'react';
import type { Tile as TileT } from './boardModel';
import { colorVar, PATTERN_BY_ID } from './theme';
import { patternOf } from './gamelogic';

interface TileProps {
  tile: TileT;
  /** circumradius of the surrounding hex space, in px */
  size?: number;
  selected?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  title?: string;
}

/** Standalone SVG tile (used in factories, hand, storage, floor). */
export function Tile({
  tile,
  size = 26,
  selected,
  dimmed,
  onClick,
  draggable,
  onDragStart,
  title,
}: TileProps): React.ReactElement {
  const pat = patternOf(tile);
  const meta = PATTERN_BY_ID[pat];
  const wild = tile.wildcard;
  const fill = wild
    ? 'var(--tg-wildseed, #b9b2a6)'
    : colorVar(tile.color);
  const w = size * Math.sqrt(3);
  const h = size * 2;

  const svg = (
    <svg
      className={[
        'tg-tile',
        selected ? 'is-selected' : '',
        dimmed ? 'is-dimmed' : '',
        onClick ? 'is-clickable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role={onClick ? 'button' : 'img'}
      aria-label={title ?? `${meta.label} ${wild ? 'wildseed' : tile.color}`}
      onClick={onClick}
    >
      <title>{title ?? `${meta.label} (${meta.value})`}</title>
      <polygon
        points={hexPoints(size, w / 2, h / 2)}
        fill={fill}
        stroke="var(--tg-tile-stroke, rgba(0,0,0,0.35))"
        strokeWidth={2}
      />
      {wild ? (
        <text
          x={w / 2}
          y={h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.8}
          fill="var(--tg-wildseed-mark, #4a4338)"
        >
          ✶
        </text>
      ) : (
        <PatternGlyph cx={w / 2} cy={h / 2} size={size} glyph={meta.glyph} />
      )}
    </svg>
  );

  if (draggable) {
    return (
      <span
        className="tg-tile-drag"
        draggable
        onDragStart={onDragStart}
        style={{ display: 'inline-flex', lineHeight: 0 }}
      >
        {svg}
      </span>
    );
  }
  return svg;
}

function PatternGlyph({
  cx,
  cy,
  size,
  glyph,
}: {
  cx: number;
  cy: number;
  size: number;
  glyph: string;
}): React.ReactElement {
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size * 0.85}
      style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.3))' }}
    >
      {glyph}
    </text>
  );
}

function hexPoints(size: number, cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${cx + size * Math.cos(a)},${cy + size * Math.sin(a)}`);
  }
  return pts.join(' ');
}
