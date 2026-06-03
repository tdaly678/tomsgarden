/**
 * A player's Garden Plot: the honeycomb of hex spaces (central Patio +
 * Flower-bed expansions) with placed plant tiles and garden features.
 *
 * Renders one SVG. Empty spaces show legal-move affordances when a tile is
 * selected for placement. Click or drop a tile to place it.
 */
import type React from 'react';
import type { Coord, PlacedTile, Tile as TileT } from './boardModel';
import { colorVar, FEATURES, PATTERN_BY_ID } from './theme';
import {
  axialToPixel,
  coordKey,
  HEX_SIZE,
  hexCorners,
  plotBounds,
  type HexSpace,
} from './hexgrid';
import { patternOf } from './gamelogic';

interface GardenPlotProps {
  spaces: HexSpace[];
  placed: PlacedTile[];
  /** Space keys that are legal targets for the pending placement. */
  legalKeys?: Set<string>;
  /** When set, an out-of-bounds/illegal click target flashes this key. */
  invalidKey?: string | null;
  pendingTile?: TileT | null;
  onPlace?: (at: Coord) => void;
  compact?: boolean;
}

export function GardenPlot({
  spaces,
  placed,
  legalKeys,
  invalidKey,
  pendingTile,
  onPlace,
  compact,
}: GardenPlotProps): React.ReactElement {
  const size = compact ? HEX_SIZE * 0.55 : HEX_SIZE;
  const b = plotBounds(spaces, size);
  const placedMap = new Map(placed.map((p) => [coordKey(p.at), p]));

  return (
    <svg
      className="tg-plot"
      viewBox={`${b.minX} ${b.minY} ${b.width} ${b.height}`}
      role="grid"
      aria-label="Garden plot"
    >
      {spaces.map((s) => {
        const key = coordKey(s.at);
        const center = axialToPixel(s.at, size);
        const occupant = placedMap.get(key);
        const isLegal = legalKeys?.has(key) ?? false;
        const isInvalid = invalidKey === key;
        const clickable = !!pendingTile && isLegal && !s.feature;

        return (
          <g
            key={key}
            className={[
              'tg-space',
              s.feature ? 'is-feature' : '',
              occupant ? 'is-occupied' : 'is-empty',
              isLegal ? 'is-legal' : '',
              isInvalid ? 'is-invalid' : '',
              clickable ? 'is-clickable' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={clickable ? () => onPlace?.(s.at) : undefined}
            onDragOver={
              clickable ? (e: React.DragEvent) => e.preventDefault() : undefined
            }
            onDrop={
              clickable
                ? (e: React.DragEvent) => {
                    e.preventDefault();
                    onPlace?.(s.at);
                  }
                : undefined
            }
          >
            <polygon
              points={hexCorners(center, size * 0.94)}
              className="tg-space-base"
              fill={
                s.feature
                  ? 'var(--tg-feature-bg, #3a4d3f)'
                  : 'var(--tg-space-bg, #243a2c)'
              }
              stroke="var(--tg-space-stroke, rgba(255,255,255,0.12))"
              strokeWidth={1.5}
            />

            {/* Feature ornament */}
            {s.feature && !occupant && (
              <text
                x={center.x}
                y={center.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size * 0.9}
              >
                {FEATURES[s.feature].glyph}
              </text>
            )}

            {/* Placed tile */}
            {occupant && (
              <PlacedHex center={center} size={size} placed={occupant} />
            )}

            {/* Legal-move affordance */}
            {isLegal && !occupant && (
              <circle
                cx={center.x}
                cy={center.y}
                r={size * 0.32}
                className="tg-legal-dot"
                fill="var(--tg-legal, #9be6a8)"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

function PlacedHex({
  center,
  size,
  placed,
}: {
  center: { x: number; y: number };
  size: number;
  placed: PlacedTile;
}): React.ReactElement {
  const t = placed.tile;
  const meta = PATTERN_BY_ID[patternOf(t)];
  return (
    <g>
      <polygon
        points={hexCorners(center, size * 0.88)}
        fill={
          t.wildcard ? 'var(--tg-wildseed, #b9b2a6)' : colorVar(t.color)
        }
        stroke="var(--tg-tile-stroke, rgba(0,0,0,0.4))"
        strokeWidth={2}
      />
      <text
        x={center.x}
        y={center.y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.8}
      >
        {t.wildcard ? '✶' : meta.glyph}
      </text>
    </g>
  );
}
