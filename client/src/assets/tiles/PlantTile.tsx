/**
 * Tomsgarden — PlantTile
 *
 * A single hexagonal plant tile: colored hex body (one of the 6 bed colors,
 * or wildseed grey) + a pattern motif rendered in the color's ink tone.
 *
 * Pure, dependency-free SVG. Colors come from design-tokens.css via CSS vars,
 * so theming/contrast stays centralized. The Board UI agent can drop these
 * into any hex-grid layout; flat-top hex geometry matches --tg-tile-size
 * (flat-to-flat width).
 */
import type React from 'react';
import { PATTERN_ICONS, type PatternName } from './PatternIcons';
import type { TileColor } from '../../design/tokens';

export type PlantTileProps = {
  color: TileColor | 'wildseed';
  pattern?: PatternName; // omitted for a blank wildseed token
  size?: number;
  /** Visual state for board feedback. */
  state?: 'default' | 'selectable' | 'valid' | 'invalid' | 'placed';
  label?: string; // accessible label, e.g. "rose sunflower"
} & Omit<React.SVGProps<SVGSVGElement>, 'color'>;

/* Flat-top hex points for a 100x100 viewBox (we scale via width/height). */
const HEX_POINTS = '50,4 92,27 92,73 50,96 8,73 8,27';

/* Outline color per state (default/placed resolve to the color's own deep
   shade at render time, so they are not listed here). */
const STATE_OUTLINE: Partial<
  Record<NonNullable<PlantTileProps['state']>, string>
> = {
  selectable: 'var(--tg-status-active)',
  valid: 'var(--tg-status-valid)',
  invalid: 'var(--tg-status-invalid)',
  placed: 'transparent',
};

export function PlantTile({
  color,
  pattern,
  size = 64,
  state = 'default',
  label,
  ...rest
}: PlantTileProps): React.ReactElement {
  const Motif = pattern ? PATTERN_ICONS[pattern] : null;
  const base = `var(--tg-color-${color})`;
  const deep = `var(--tg-color-${color}-deep)`;
  const ink = `var(--tg-color-${color}-ink)`;
  const outline = STATE_OUTLINE[state] ?? deep;
  const a11yLabel = label ?? `${color}${pattern ? ' ' + pattern : ' wildseed'}`;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={a11yLabel}
      style={{ display: 'block', overflow: 'visible' }}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {/* drop shadow for the chunky game-piece look */}
      <polygon
        points={HEX_POINTS}
        fill="rgba(0,0,0,0.25)"
        transform="translate(0,3)"
      />
      {/* hex body */}
      <polygon
        points={HEX_POINTS}
        fill={base}
        stroke={outline}
        strokeWidth={state === 'default' || state === 'placed' ? 3 : 5}
      />
      {/* subtle top sheen */}
      <polygon
        points="50,4 92,27 50,50 8,27"
        fill="rgba(255,255,255,0.12)"
      />
      {/* motif, centered, in ink color */}
      {Motif ? (
        <g style={{ color: ink }}>
          <Motif size={52} x={24} y={24} />
        </g>
      ) : (
        // wildseed: a small seed glyph
        <g fill={ink} opacity={0.85}>
          <ellipse cx="50" cy="52" rx="11" ry="16" />
          <path d="M50 36c-7 4-7 14 0 18 7-4 7-14 0-18z" fill="rgba(0,0,0,0.2)" />
        </g>
      )}
    </svg>
  );
}
