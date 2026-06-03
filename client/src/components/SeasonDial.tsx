/**
 * Season Dial — the rotating scoring wheel. 4 quadrants (one per round), each
 * pointing at 3 scored categories. The active round's quadrant rotates under
 * the top pointer with a smooth CSS transition.
 */
import type React from 'react';
import {
  DIAL_QUADRANTS,
  dialRotationForRound,
  type DialCategory,
} from './seasonDialData';
import { colorVar, COLOR_NAME, PATTERN_BY_ID } from './theme';

interface SeasonDialProps {
  round: number;
  size?: number;
}

export function SeasonDial({
  round,
  size = 220,
}: SeasonDialProps): React.ReactElement {
  const rot = dialRotationForRound(round);
  const r = size / 2;
  const cx = r;
  const cy = r;

  return (
    <section
      className="tg-dial"
      aria-label="Season dial (scoring wheel)"
      data-round={round}
    >
      <div className="tg-dial-head" aria-live="polite">
        Season Dial · Round {round}/4
      </div>
      <div className="tg-dial-stage" style={{ width: size, height: size }}>
        {/* fixed pointer */}
        <svg className="tg-dial-pointer" width={size} height={size}>
          <polygon
            points={`${cx - 10},6 ${cx + 10},6 ${cx},26`}
            fill="var(--tg-dial-pointer, #f4e7c4)"
          />
        </svg>

        {/* rotating wheel */}
        <svg
          className="tg-dial-wheel"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: `rotate(${rot}deg)` }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r - 4}
            fill="var(--tg-dial-bg, #2e231a)"
            stroke="var(--tg-dial-ring, #7a6648)"
            strokeWidth={4}
          />
          {DIAL_QUADRANTS.map((q, qi) => {
            const start = qi * 90 - 45; // quadrant centered on top for round 1
            return (
              <g key={q.round}>
                <path
                  d={sectorPath(cx, cy, r - 6, start, start + 90)}
                  className={`tg-dial-sector${
                    q.round === round ? ' is-active' : ''
                  }`}
                  fill={
                    q.round === round
                      ? 'var(--tg-dial-active, #4d3d28)'
                      : 'var(--tg-dial-sector, #382a1d)'
                  }
                  stroke="var(--tg-dial-ring, #7a6648)"
                  strokeWidth={1.5}
                />
                {q.categories.map((cat, ci) => {
                  const ang = start + 22.5 + ci * 22.5;
                  const pos = polar(cx, cy, r * 0.66, ang);
                  return (
                    <CategoryBadge
                      key={ci}
                      x={pos.x}
                      y={pos.y}
                      counterRotate={-rot}
                      cat={cat}
                    />
                  );
                })}
                <text
                  {...polar(cx, cy, r * 0.34, start + 45)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="tg-dial-round-num"
                  fill="var(--tg-dial-text, #d8c8a8)"
                  style={{
                    transform: `rotate(${-rot}deg)`,
                    transformOrigin: `${polar(cx, cy, r * 0.34, start + 45).x}px ${polar(cx, cy, r * 0.34, start + 45).y}px`,
                  }}
                >
                  R{q.round}
                </text>
              </g>
            );
          })}
          <circle cx={cx} cy={cy} r={r * 0.14} fill="var(--tg-dial-hub, #1d1610)" />
        </svg>
      </div>

      <ul className="tg-dial-legend">
        {(DIAL_QUADRANTS.find((q) => q.round === round)?.categories ?? []).map(
          (cat, i) => (
            <li key={i}>{categoryLabel(cat)}</li>
          ),
        )}
      </ul>
    </section>
  );
}

function CategoryBadge({
  x,
  y,
  counterRotate,
  cat,
}: {
  x: number;
  y: number;
  counterRotate: number;
  cat: DialCategory;
}): React.ReactElement {
  const fill =
    cat.kind === 'color' ? colorVar(cat.id) : 'var(--tg-dial-chip, #5a4a32)';
  const glyph =
    cat.kind === 'pattern' ? PATTERN_BY_ID[cat.id].glyph : '●';
  return (
    <g
      style={{
        transform: `rotate(${counterRotate}deg)`,
        transformOrigin: `${x}px ${y}px`,
      }}
    >
      <circle cx={x} cy={y} r={13} fill={fill} stroke="rgba(0,0,0,0.4)" />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={14}
      >
        {glyph}
      </text>
    </g>
  );
}

function categoryLabel(cat: DialCategory): string {
  if (cat.kind === 'pattern') {
    const m = PATTERN_BY_ID[cat.id];
    return `${m.label} (${m.value} pts)`;
  }
  return `${COLOR_NAME[cat.id]} (color)`;
}

function polar(
  cx: number,
  cy: number,
  radius: number,
  angleDeg: number,
): { x: number; y: number } {
  const a = (Math.PI / 180) * (angleDeg - 90);
  return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
}

function sectorPath(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  const s = polar(cx, cy, radius, startDeg);
  const e = polar(cx, cy, radius, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y} Z`;
}
