# Tomsgarden — Visual Style Guide

Tomsgarden is a cozy backyard-garden board game. The look is warm, natural, and
tactile: tilled-soil browns, planted greens, weathered stone, and bright "plant
bed" colors on chunky wooden game pieces. Friendly, not fussy.

> **Originality / trademark safety.** All assets in this design system are
> 100% original work created for Tomsgarden. No names, logos, hues, or artwork
> are copied from any existing commercial game. Game *mechanics* are not
> copyrightable; *names and art* are, so every public-facing label uses the
> Tomsgarden vocabulary from `shared/rules/rename-map.json` and every icon is an
> original silhouette. Safe to ship.

---

## 1. Palette

### The 6 plant-bed (tile) colors
Renamed per the rename map. Each has `base`, `-soft`, `-deep`, `-ink` variants.

| Token (color1–6) | Name | Base hex | Ink-on-base | Contrast |
|---|---|---|---|---|
| color1 | **lavender** | `#7e60bd` | white | 4.89:1 (AA) |
| color2 | **marigold** | `#e8962f` | `#2a1700` | 7.24:1 (AAA) |
| color3 | **fern** | `#467d25` | white | 4.98:1 (AA) |
| color4 | **rose** | `#d8456b` | white | 4.21:1 (AA large / graphics) |
| color5 | **bluebell** | `#3a82c4` | white | 4.06:1 (AA large / graphics) |
| color6 | **ivy** | `#1f8a78` | white | 4.23:1 (AA large / graphics) |
| — | **wildseed** (joker) | `#9aa0a6` | `#1b1d1f` | 6.40:1 (AAA) |

Pattern motifs are large graphics (≥18pt-equivalent), so they fall under WCAG's
3:1 non-text contrast rule, which all six clear comfortably. For small text on a
tile color, prefer the `-deep` variant on a `-soft` background.

### Neutrals & environment
Parchment (`--tg-neutral-50`) for almanac/score panels; soil, wood, stone, patio,
and plot-socket tones for the board. Deep planted green (`--tg-garden-bg`) is the
app backdrop.

### Status colors
`--tg-status-valid` (green), `--tg-status-invalid` (red), `--tg-status-active`
(gold glow / current player), `--tg-status-focus` (blue focus ring).

---

## 2. Typography

- **Display / wordmark:** `--tg-font-display` (Iowan/Palatino serif stack) — warm,
  storybook feel. Use for the logo, headings, score totals. Wordmark uses
  `--tg-tracking-wide`.
- **Body / UI:** `--tg-font-body` (system sans) — labels, buttons, tooltips.
- **Mono:** `--tg-font-mono` — room codes, debug.

Scale is a 1.25 modular scale (`--tg-text-2xs` … `--tg-text-4xl`) on a 16px base.
Line-heights: `tight` (display), `normal` (body), `loose` (long help text).

---

## 3. Iconography

### Pattern motifs (the 6 "plants/critters")
Renamed per rename map; each value drives both placement cost and points.

| Pattern | Name | Value | Silhouette cue |
|---|---|---|---|
| pattern1 | **sapling** | 1 | two-leaf sprout on a stem |
| pattern2 | **robin** | 2 | perched round bird + beak |
| pattern3 | **ladybug** | 3 | round shell, head, 3 spots |
| pattern4 | **sunflower** | 4 | petal ring + dark center disc |
| pattern5 | **snail** | 5 | spiral shell + antennae |
| pattern6 | **beehive** | 6 | stacked skep + entrance |

Motifs draw in `currentColor` (the tile's `-ink` tone). Keep them centered and
chunky — readable down to ~28px. Files: `assets/tiles/*.svg`; React:
`assets/tiles/PatternIcons.tsx`.

### Garden features
| Feature (renamed) | Source term | File |
|---|---|---|
| **gazebo** | pavilion | `assets/features/gazebo.svg` |
| **birdbath** | fountain | `assets/features/birdbath.svg` |
| **garden gnome** | statue | `assets/features/garden-gnome.svg` |
| **potting table** | bench | `assets/features/potting-table.svg` |
| **wildseed token** | joker | `assets/features/wildseed.svg` |

Features use environment tokens (wood/stone/water) and read at ~48–64px.

---

## 4. Colorblind / accessibility notes

- **Shape first, color second.** The six patterns are distinguished by distinct
  *silhouettes*, so the board is fully playable in protan/deutan/tritan vision
  and in grayscale. Never communicate game state by hue alone.
- Tile colors were spaced for perceptual separation across the three common CVD
  types; the most easily confused pairs (fern/marigold, rose/marigold) differ
  strongly in lightness as well as hue.
- Every tile carries a `-deep` colored **outline**, separating it from neighbors
  and from the background regardless of color perception.
- Optional: expose a "high-contrast patterns" toggle that thickens outlines and
  increases motif size — tokens already support it via `--tg-tile-border`.
- Focus is always shown with `--tg-ring-focus` (non-color-dependent ring).
- Motion respects `prefers-reduced-motion` (timings collapse to 0).

---

## 5. Spacing, radii, elevation, motion

- 4px spacing grid (`--tg-space-1`…`8`); hex sizing via `--tg-tile-size`.
- Radii from `xs` (2px) to `pill`; tiles use the hex clip-path, panels use `md`/`lg`.
- `--tg-shadow-tile` gives pieces a chunky lift; `--tg-shadow-inset` makes empty
  plot sockets look recessed.
- Motion: `--tg-dur-*` + `--tg-ease-*`. Use `emphasized` (slight overshoot) for a
  tile settling into place; `deliberate` for score ticks and round transitions.

---

## 6. Sound

Synthesized via Web Audio (`design/sound-cues.ts`), no files needed. Cues: `draft`
(soft pluck), `place` (woody tok), `score` (rising tings), `roundEnd` (chime
resolve), `win` (major arpeggio). Honor a mute toggle with `setSoundEnabled`.

---

## 7. Usage rules

- **Do** consume colors/spacing/type via the CSS variables — never hard-code hex.
- **Do** keep the public vocabulary (sapling, robin, gazebo, wildseed, …).
- **Don't** reintroduce source-game names or art anywhere user-visible.
- **Don't** rely on color alone for any game-state signal.
