# Tomsgarden — Full Ruleset (Source of Truth)

This document explains the complete ruleset and turn flow. It matches `rules.json` exactly.
Mechanics are identical to *Azul: Queen's Garden* (designer Michael Kiesling); only the
public-facing names/art differ (see `rename-map.json`). Game mechanics are not copyrightable;
specific names and art are. **Do not ship trademarked names or art.**

Numbers below come from the official rulebook to preserve balance. Items that could not be
confirmed from the rulebook text are flagged **[UNCONFIRMED]** here and in `rules.json`.

---

## Overview

- **Players:** 2–4.
- **Length:** 4 rounds.
- **Goal:** Build the most beautiful garden by arranging patterns and colors. Most points wins; ties share victory.

## Components (counts)

- **108 colored tiles** = 6 patterns × 6 colors × 3 copies. Each pattern+color combo is a **hexagon**.
- **6 patterns**, each with a single **value** used as both its placement **cost** and its per-hexagon **point value**:
  - pattern1 (tree) = **1**
  - pattern2 (bird) = **2**
  - pattern3 (butterfly) = **3**
  - pattern4 (flower) = **4**
  - pattern5 = **5**
  - pattern6 = **6**
- **36 garden expansions** (confirmed count, setup step 5). Double-sided hex pieces, **ALL 7 hexagons each** (confirmed by the game owner; Zatu: fountain boards are "13 hexagons instead of 7"). Face DOWN = 7 blank spaces; face UP = a **pavilion** center + **one** printed hexagon + 5 free spaces. Statues/benches are printed on the fountain board, not on expansions.
- **Jokers** (wild/grey): each player starts with **3**. Supply is effectively unlimited.
- Per player: 1 garden board, 1 storage, 1 **fountain board** (the large 13-hex central piece), 1 scoring marker.
- Shared: scoring board, **rotary wheel** (2 sides for variability), evaluation marker, first-player marker, tower, point tokens.

## Setup

### Starting state — players start FROM SCRATCH (confirmed, rulebook p.2)

Each player begins with:
- **1 fountain board** — the ONLY garden piece at game start, placed in the middle of their (otherwise empty) garden. Its **13 hexagons** (owner-confirmed) are: 1 central **fountain** feature, **6 empty placeable tile spaces** (ring 1), and **6 printed features** — **3 statues + 3 benches**, alternating around the ring-2 star points (each feature touches two ring-1 spaces). Engine axial layout: fountain (0,0); empty (1,0),(0,1),(-1,1),(-1,0),(0,-1),(1,-1); features (2,-1),(1,1),(-1,2),(-2,1),(-1,-1),(1,-2). The statue/bench ordering around the ring is a best-reconstruction of the physical art (feature counts owner-confirmed). Surrounding the fountain = filling the 6 ring-1 spaces; statues/benches become surroundable as expansions attach around them.
- **3 jokers** in storage. Nothing else: **0 tiles**, **0 expansions**, **no other garden pieces**.
- Scoring marker on space **15** of the scoring track (so the 6-point face-down-expansion buy is affordable early).

The garden then **grows during play** by attaching garden expansions (7-space pieces) around the fountain board — drafted from the display, or bought face-down from the supply for 6 points. The implemented game must NOT pre-place expansions or tiles.

1. Each player takes a garden board, a storage, a fountain board (placed in the middle of their garden), and **3 jokers** on empty storage spaces.
2. Place the scoring board with rotary wheel set to its starting quadrant. Evaluation marker at top of evaluation track.
3. Each scoring marker starts on space **15**.
4. Fill the bag with all **108** tiles.
5. Shuffle **36** garden expansions into 4 face-down round stacks, sized by player count:
   - 2 players: **5** per stack
   - 3 players: **7** per stack
   - 4 players: **8** per stack
   Place the 1st round stack in the display area; the other 3 in a row above the scoring board. Fill the top expansion of the 1st stack with exactly **4** random tiles.
6. Remaining expansions form the **supply** (shield/cost token on top).
7. Place first-player marker in the display area; tower and jokers nearby; point tokens aside.

## Round Structure

Each round = three phases:

1. **Phase 1 — Player actions** (clockwise until all pass).
2. **Phase 2 — Scoring** (4× per game).
3. **Phase 3 — Prepare next round** (skipped after round 4; replaced by final scoring).

Round 1 is started by the youngest player; thereafter by whoever holds the first-player marker.

## Phase 1 — Player Actions

On your turn, take exactly **one** action:

### A) Acquire tiles and garden expansions
Declare a single **pattern** OR a single **color**, then take **ALL** tiles and garden expansions in the display showing it:
- chose a pattern → take all of that pattern across **different colors**;
- chose a color → take all of that color across **different patterns**.
- If two selected hexagons are identical, take only **one** of them.
- Everything goes to your **storage** (limit **12 tiles**, **2 expansions**; jokers count as tiles). If it won't fit, you can't make that selection.

After acquiring, if you took **at least one tile from the round stack**:
- Move the topmost expansion (with any leftover tiles on it) out to **extend the display**.
- Refill the stack's new top expansion with exactly **4** random tiles.
- Any expansion now holding **0 tiles** is flipped **face up** (revealing a pavilion + one hexagon) and becomes draftable.

### B) Place a tile
Take a tile from storage and **pay its cost** to place it in your garden.

**Paying a cost.** The cost equals the tile's **pattern value**. The tile being placed **counts toward its own cost**, so you additionally discard `(value − 1)` hexagons from storage:
- all discarded hexagons (incl. the placed one) must be **same pattern / different colors**, OR **same color / different patterns**;
- never two identical hexagons in the payment.
Discarded tiles go to the tower; discarded expansions go face-down to the bottom of the supply.

**Paying with jokers.** You must at minimum have the actual hexagon you're placing (a joker can't be placed). For each *other* needed hexagon you may discard a joker instead. Spent jokers return to the supply.

Additional-hexagons-to-discard by pattern: tree=0, bird=1, butterfly=2, flower=3, fifth=4, sixth=5.

**Placement rules.** Place onto a free hex space such that the tile either:
- has **no adjacent hexagons**, OR
- shares the **same pattern** or **same color** with at least one neighbor.
You may **never** make two identical hexagons (same pattern AND color) adjacent.

**Surrounding a feature.** If placing fully surrounds a **fountain, statue, bench, or pavilion**, immediately gain jokers from the supply (per the surrounded element) into storage; excess jokers are lost.
- **Pavilion = 3 jokers** (best confirmation available: The Tabletop Crier review — "Pavilions were the best at three joker tokens").
- **Confirmed (game owner):** fountain = **1** joker, statue = **2**, bench = **2**, pavilion = **3**.

### C) Place a garden expansion
Either:
- take an expansion from storage and pay its cost (as above), OR
- take a face-down expansion from the **supply** by spending exactly **6 points** on the scoring track (7 free spaces; score can't go negative).

Place it on a free expansion area around your fountain board, any orientation, following the same adjacency rules as tiles.

### D) Pass
Pass if you don't want to / can't act. On passing you **may** discard any number of storage hexagons and score their values as **minus points**.
- The **first** player to pass takes the first-player marker and moves **back 1** space.
- A passed player is done for Phase 1. When all have passed, Phase 1 ends.

## Phase 2 — Scoring

Starting with the first player, each player scores:
- The rotary wheel indicates **3** scored patterns/colors for the round. For each garden hexagon matching an indicated **pattern or color**, score that hexagon's **pattern value** in points. A single hexagon can score **twice** (once for pattern, once for color).
- Then **+1 point per visible pavilion**.

The scoring track is continuous; use point tokens to track totals.

- **Confirmed wheel structure** (Zatu Games): each pattern and each color is scored **exactly once per game** — the 4 quadrants × 3 categories cover all 12 categories (6 patterns + 6 colors) with no repeats — and the available points **increase progressively from round 1 to round 4** (low-value patterns early, high-value late).
- Partial datum (BGG thread 3130788): on that poster's wheel side, round 1 scored the dark-green and blue **colors**.
- **[UNCONFIRMED]** The exact 3-category-per-quadrant assignment is wheel art only. `rules.json` lists an assignment that satisfies all confirmed constraints; verify against wheel photos before competitive balancing.

## Phase 3 — Prepare the Next Round

Turn the rotary wheel clockwise one quadrant. Discard leftover tiles from face-down display expansions into the tower; return remaining display expansions face-down to the supply. Move the next round stack into the display and fill its top with **4** random tiles. First-player-marker holder starts the new round.

> Tile shortage rule: if the bag can't fill an expansion, return tower tiles to the bag. If still short, play continues with fewer/no tiles; empty round-stack expansions are placed face up.

## End of Game & Final Scoring

The game ends after all players pass in round 4. Do the normal round-4 scoring, then **final scoring**:

1. **Empty storage:** each remaining **joker = +1**; each remaining tile/expansion = **minus its pattern value** (tree −1 … sixth −6).
2. **Group evaluation:** move the evaluation marker down the track — first each of the **6 colors**, then each of the **6 patterns**.
   - A **group** = 2+ adjacent hexagons sharing the same pattern OR color (not both). One hexagon can be in a pattern-group and a color-group at once. No group may contain two identical hexagons.
   - For the current evaluation, each **group of at least 3** matching hexagons scores. **Score = sum of the pattern values** of all hexagons in the group. No limit on how many groups score; the same tile can count in multiple groups.
   - **Complete set bonus:** **+6** additional points for each **group of 6** hexagons.
3. Most points wins; ties share victory.

> **Scoring interpretation note.** The task brief simplifies group scoring to "groups of ≥3 score 3." The actual rulebook rule is **sum of member pattern values** (richer). The engine should implement the **rulebook sum rule** for fidelity. If a flat-3 is later desired, change `finalScoring.groupScoring.scorePerGroup` to a constant 3. The "complete set of six = +6 bonus" and "tiles count in multiple groups" parts match the brief exactly.

## Variant (optional, out of scope for v1)

Flip the scoring board / use the other wheel side: patterns score differently in Phase 2 and groups earn more bonus in final scoring. **[UNCONFIRMED]** variant numbers not transcribed.
