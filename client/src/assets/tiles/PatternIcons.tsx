/**
 * Tomsgarden — pattern motif icons (the 6 "plants/critters").
 *
 * ORIGINAL ART. Each motif is a distinct SILHOUETTE so the 6 patterns are
 * distinguishable WITHOUT color (colorblind-safe — see STYLE-GUIDE.md).
 *
 * All shapes draw in `currentColor`, so they inherit the tile's color. Set the
 * color on a wrapper, e.g.:
 *
 *   <span style={{ color: 'var(--tg-color-rose-ink)' }}>
 *     <SaplingIcon />
 *   </span>
 *
 * or pass `color` directly. They are sized to a 0 0 48 48 viewBox and scale to
 * the font-size / explicit width.
 */
import type React from 'react';

export type PatternIconProps = React.SVGProps<SVGSVGElement> & {
  /** Pixel size (sets both width & height). Defaults to 1em. */
  size?: number | string;
  /** Title for accessibility; omit to render decorative (aria-hidden). */
  title?: string;
};

function base(
  { size = '1em', title, children, ...rest }: PatternIconProps & { children: React.ReactNode },
): React.ReactElement {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="currentColor"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* pattern1 — sapling (value 1): a young two-leaf sprout on a stem. */
export function SaplingIcon(props: PatternIconProps): React.ReactElement {
  return base({
    ...props,
    children: (
      <>
        <rect x="22.5" y="20" width="3" height="20" rx="1.5" />
        <path d="M24 24C24 17 18 13 9 13c0 7 6 11 15 11z" />
        <path d="M24 22C24 15 30 11 39 11c0 7-6 11-15 11z" />
      </>
    ),
  });
}

/* pattern2 — robin (value 2): a plump perched bird, distinct round body + beak. */
export function RobinIcon(props: PatternIconProps): React.ReactElement {
  return base({
    ...props,
    children: (
      <>
        <path d="M30 16a11 11 0 1 0 4 19l5 4-1-7a11 11 0 0 0-8-16z" />
        <path d="M40 19l6-3-5 6z" />
        <circle cx="27" cy="22" r="1.8" fill="#000" opacity="0.55" />
      </>
    ),
  });
}

/* pattern3 — ladybug (value 3): round shell, head, 3 spots, center line. */
export function LadybugIcon(props: PatternIconProps): React.ReactElement {
  return base({
    ...props,
    children: (
      <>
        <ellipse cx="24" cy="27" rx="13" ry="14" />
        <path d="M14 17a6 6 0 0 1 20 0z" />
        <rect x="23" y="15" width="2" height="26" fill="#000" opacity="0.3" />
        <circle cx="18" cy="26" r="2.4" fill="#000" opacity="0.4" />
        <circle cx="30" cy="26" r="2.4" fill="#000" opacity="0.4" />
        <circle cx="24" cy="35" r="2.4" fill="#000" opacity="0.4" />
      </>
    ),
  });
}

/* pattern4 — sunflower (value 4): center disc + ring of petals. */
export function SunflowerIcon(props: PatternIconProps): React.ReactElement {
  const petals = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const cx = 24 + Math.cos(a) * 13;
    const cy = 24 + Math.sin(a) * 13;
    return (
      <ellipse
        key={i}
        cx={cx}
        cy={cy}
        rx="5"
        ry="2.6"
        transform={`rotate(${(a * 180) / Math.PI} ${cx} ${cy})`}
      />
    );
  });
  return base({
    ...props,
    children: (
      <>
        {petals}
        <circle cx="24" cy="24" r="8" />
        <circle cx="24" cy="24" r="6" fill="#000" opacity="0.28" />
      </>
    ),
  });
}

/* pattern5 — snail (value 5): spiral shell + body + antennae. */
export function SnailIcon(props: PatternIconProps): React.ReactElement {
  return base({
    ...props,
    children: (
      <>
        <path d="M6 34c0-3 2-5 6-5h18c0 4-3 7-9 7H8a2 2 0 0 1-2-2z" />
        <path d="M30 34l4-4c3-3 3-6 3-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="35" cy="11" r="1.6" />
        <circle cx="40" cy="13" r="1.6" />
        <path
          d="M19 32a10 10 0 1 1 10-10 7 7 0 1 1-7 7 4 4 0 1 0 4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </>
    ),
  });
}

/* pattern6 — beehive (value 6): classic stacked skep with entrance. */
export function BeehiveIcon(props: PatternIconProps): React.ReactElement {
  return base({
    ...props,
    children: (
      <>
        <path d="M24 8c6 0 10 3 10 6H14c0-3 4-6 10-6z" />
        <rect x="12" y="14" width="24" height="5" rx="2.5" />
        <rect x="10" y="20" width="28" height="5" rx="2.5" />
        <rect x="9" y="26" width="30" height="5" rx="2.5" />
        <rect x="10" y="32" width="28" height="6" rx="3" />
        <ellipse cx="24" cy="34" rx="3.2" ry="4" fill="#000" opacity="0.4" />
      </>
    ),
  });
}

/* Registry: map a pattern name to its component (matches tokens.ts order). */
export const PATTERN_ICONS = {
  sapling: SaplingIcon,
  robin: RobinIcon,
  ladybug: LadybugIcon,
  sunflower: SunflowerIcon,
  snail: SnailIcon,
  beehive: BeehiveIcon,
} as const;

export type PatternName = keyof typeof PATTERN_ICONS;
