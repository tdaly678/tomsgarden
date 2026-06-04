# Azul: Queen's Garden — Rulebook Compliance Checklist

Source: official EN rulebook (Plan B Games / Next Move, cdn.svc.asmodee.net, fetched 2026-06-03).
Each numbered item is a gameplay-constraining rulebook statement. Verdicts in COMPLIANCE-REPORT.md.

## A. Setup (rulebook p.2)
1. Each player receives 1 garden board, 1 storage, 1 fountain board (middle of garden).
2. Each player receives 3 jokers placed on empty storage spaces.
3. Scoring board placed; rotary wheel assembled at starting position; evaluation marker at top of evaluation track.
4. Each scoring marker starts on the 15th space of the scoring track.
5. Bag filled with all 108 colored tiles (6 patterns x 6 colors x 3 copies).
6. 36 garden expansions shuffled into 4 face-down round stacks: 5/stack (2p), 7/stack (3p), 8/stack (4p).
7. 1st round stack placed in display area; other 3 stacks in a row.
8. Top expansion of 1st round stack filled with exactly 4 random tiles (its spaces unused at this point).
9. Remaining expansions form a face-down supply (shield token on top).
10. First-player marker in display area; tower, supply jokers, point tokens nearby.
11. Supported player counts: 2–4.

## B. Round structure
12. The game lasts 4 rounds; each round = Phase 1 (actions), Phase 2 (scoring), Phase 3 (prepare next round; skipped in round 4).
13. Each round starts with the starting player; round 1 with the youngest player.
14. Phase 1 proceeds clockwise until all players have passed.
15. On a turn the player takes exactly one of: Acquire, Place tile, Place expansion, Pass.

## C. Action A — Acquire
16. Select ONE pattern (take all matching tiles+expansions, different colors) OR ONE color (all matching, different patterns).
17. If two or more selected hexagons are identical, take only ONE of them (player's choice); the other copies remain in the display.
18. Everything acquired goes to storage: 12 tile spaces (jokers occupy these), 2 expansion spaces.
19. If the selection does not fit in storage, the selection cannot be made.
20. Face-up display expansions whose printed hexagon matches the selection are acquired with it.
21. If at least one tile was taken FROM THE CURRENT ROUND STACK (top expansion): remove that topmost expansion with any remaining tiles, place it next to the stack extending the display.
22. Then fill the new topmost stack expansion with exactly 4 tiles drawn randomly from the bag.
23. Any display expansion that now has 0 tiles on it flips face up (reveals pavilion + 1 hexagon) and becomes draftable.

## D. Action B — Place a tile
24. Cost = the pattern's value (tree=1 … 6). The placed hexagon counts toward its own cost; discard (cost) hexagons total from storage including the placed one.
25. Payment set rule: all discarded hexagons same pattern/different colors OR same color/different patterns; never two identical hexagons.
26. Payment may include garden expansions from storage (their printed hexagon participates in the set rule).
27. Discarded tiles go to the tower; discarded expansions go face-down to the bottom of the supply.
28. Jokers may replace any needed hexagon EXCEPT the one being placed (a joker cannot be placed). Spent jokers return to the supply.
29. The tile must go on a free space (not occupied, not a garden element/feature).
30. The tile must have no adjacent hexagons OR share pattern or color with at least one adjacent hexagon.
31. A placement may never create or extend a group (pattern-group or color-group) that would then contain two identical hexagons — including by connecting separate groups, not just direct adjacency.
32. Surrounding a fountain/statue/bench/pavilion completely awards jokers per the element, immediately placed into storage; excess beyond free storage spaces is lost; jokers are unlimited.

## E. Action C — Place a garden expansion
33. Option 1: place an expansion from storage, paying the printed hexagon's cost (set rule as for tiles; printed hexagon counts toward its own cost but is not consumed from storage).
34. Option 2: take a face-down supply expansion (7 free spaces) by spending exactly 6 points; score cannot go negative (must have ≥6).
35. Expansion is placed on a free area adjacent to the garden, any orientation; printed hexagon obeys tile placement rules (29–31).
36. Face-up expansions provide a central pavilion + a printed hexagon; face-down ones are blank spaces.

## F. Action D — Pass
37. A player may pass voluntarily and must pass if no other action is possible.
38. On passing, the player MAY discard any number of hexagons (tiles and stored expansions) from storage, scoring their values as MINUS points.
39. The first player to pass takes the first-player marker and moves back 1 space on the scoring track.
40. A passed player takes no further turns this Phase 1; when all have passed, Phase 1 ends.

## G. Phase 2 — Scoring
41. Starting with the first player, each player scores (order immaterial in a digital simultaneous computation).
42. The rotary wheel indicates 3 scored patterns/colors for the round.
43. Each garden hexagon matching an indicated pattern or color scores its pattern value; one hexagon may score twice (pattern + color).
44. +1 point per visible pavilion in the garden.
45. Wheel structure: 4 quadrants x 3 categories = all 12 categories exactly once per game (art-defined assignment; values ramp up by round). [art-defined]

## H. Phase 3 — Prepare next round
46. Turn the rotary wheel clockwise to the next quadrant.
47. Discard all remaining tiles from display expansions into the tower.
48. Return all remaining display expansions face down to the supply.
49. Place the next round stack in the display; fill its top expansion with exactly 4 random tiles.
50. The first-player-marker holder starts the new round.

## I. Tile shortage
51. If the bag cannot fill an expansion, return all tower tiles to the bag.
52. If still not enough, the game continues with fewer or no tiles; if no tiles, all empty expansions of the current round stack are placed face up in the display.

## J. End of game & final scoring
53. The game ends after all players pass in round 4; normal round-4 scoring, then final scoring.
54. Empty storage: each remaining joker = +1; each remaining tile or expansion = minus its pattern value.
55. Group evaluation: 6 colors evaluated first (track order), then 6 patterns.
56. A group = 2+ adjacent hexagons sharing pattern OR color (not both); a hexagon may be in a pattern-group and a color-group simultaneously; no group contains two identical hexagons.
57. Each group of ≥3 matching the current evaluation scores the SUM of its members' pattern values; unlimited groups per evaluation.
58. +6 bonus points per group of 6 hexagons.
59. Most points wins; ties share victory.

## K. Variant
60. Alternate scoring-board side / wheel side (different Phase 2 pattern scoring, larger final bonuses). [out of scope v1]

## L. UI compliance
61. The client must expose every legal action (acquire by color AND by pattern, place tile with payment choice, place/buy expansion, pass with optional discard).
62. The client must prevent illegal actions (server/engine authoritative; UI affordances mirror engine legality).
63. The board view must faithfully show: display (stack-top + extended expansions with their tiles), storage (12+2), score track, round wheel categories, supply count, bag count.
