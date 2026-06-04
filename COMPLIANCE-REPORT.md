# Tomsgarden — Rulebook Compliance Report

Audit date: 2026-06-03. Source of truth: official EN Azul: Queen's Garden rulebook
(fetched from cdn.svc.asmodee.net). Checklist item numbers refer to COMPLIANCE-CHECKLIST.md.
Final gate: `npx tsc -b` clean; `npm test` 83/83 passing (up from 73 — 10 new regression tests).

## Verdict summary

| Items | Verdict |
|---|---|
| 1, 2, 4–12, 14–16, 18–20, 24, 25, 28–30, 32–37, 39–44, 49, 50, 53, 55–59 | COMPLIANT (pre-existing or unchanged) |
| 17, 21–23, 26, 27, 31, 38, 45 (UI), 47, 48, 51, 52, 54, plus a stuck-game server bug | VIOLATION → **FIXED this audit** |
| 3 (physical wheel/marker assembly), 10 (physical table layout), 45 (exact wheel art), 60 (variant) | N/A digital / art-defined / deferred — see Known gaps |
| 13 (youngest player starts) | DEVIATION (host seat 0 starts) — accepted digital convention, documented |

## Violations found and fixed

1. **#17 Acquire duplicates removed entire matching set from display** (HIGH).
   Engine deleted ALL matching copies; rulebook keeps untaken identical duplicates in the
   display. Fixed in `shared/engine/core.ts` (`applyAcquire`): exactly one copy of each
   distinct hexagon is removed; duplicates remain. Regression test added.

2. **#21–#23 Display/refill flow was structurally wrong** (HIGH).
   Tiles were modelled as one loose pool; refill fired on ANY tile take, the covered
   stack-top flipped unconditionally, and leftover tiles never rode along with extended
   expansions. Rebuilt: tiles now sit ON `DisplayExpansion.tiles`; new `onStack` flag marks
   the round-stack top; refill (+ extension keeping leftovers) triggers only when a tile is
   taken from the stack top; any display expansion reaching 0 tiles flips face up.
   Files: `shared/engine/model.ts`, `core.ts` (`setupGame`, `acquirableHexagons`,
   `applyAcquire`). Three regression tests.

3. **#31 Group rule on placement** (HIGH).
   Only direct identical-adjacency was checked; the rulebook also forbids creating or
   extending (incl. CONNECTING) a pattern/color group that would contain two identical
   hexagons. Added `wouldGroupContainDuplicates` flood-fill check to `canPlaceHexAt` and
   the expansion printed-hex path (`core.ts`), mirrored in the client affordance logic
   (`client/src/components/gamelogic.ts`). Regression test added.

4. **#47–#48 Phase 3 cleanup missing** (HIGH).
   Leftover display tiles and expansions persisted into the next round. `advanceRound`
   now discards remaining display tiles to the tower and returns all display expansions
   (and unrevealed leftovers of the finished round's stack) face down to the supply.
   Regression test added.

5. **#51–#52 No tower / shortage rule** (MEDIUM).
   Added `tower: Hexagon[]` to `EngineGameState` (additive, wire-compatible; server lobby
   snapshot updated). Payment/pass/phase-3 tile discards now feed the tower; `drawTiles`
   recycles the tower into the bag when short; total shortage flips the remaining round
   stack face up into the display. Regression test added.

6. **#26–#27 Expansions as payment** (MEDIUM).
   `Payment` gained an additive `{kind:'expansion', expansionId}` variant; the printed
   hexagon participates in the set rule; discarded expansions return face down to the
   supply; payment tiles now go to the tower (previously vanished). Files: `actions.ts`,
   `core.ts` (`validatePayment`, `validateExpansionPayment`, new `spendPayment`).
   Two regression tests.

7. **#38 Pass could not discard held expansions** (MEDIUM).
   `PassAction` gained optional `discardExpansionIds` (backward compatible); scores minus
   the printed value, piece returns to supply. Regression test added.

8. **#54 Final scoring ignored leftover held expansions** (MEDIUM).
   `scoreFinalForPlayer` now subtracts the printed pattern value of each unplaced held
   expansion. Also hardened the group-of-6 bonus to `>= 6`. Regression test added.

9. **Server never ran Phase 2/3 — game stalled after round 1** (CRITICAL, found in review).
   `server/src/server.ts` `handleAction` left the state in phase `'scoring'` forever once
   everyone passed. It now applies `scoreRound` + `advanceRound` immediately, which also
   triggers final scoring after round 4.

10. **UI Season Dial misreported scored categories** (HIGH, UI).
    `client/src/components/seasonDialData.ts` showed color assignments inconsistent with
    the engine's wheel (rules.json). Realigned to the engine quadrants via the adapter's
    index maps, with a comment binding the two.

## Known gaps / honest caveats

- **Art-defined values (UNVERIFIABLE online)**: exact wheel quadrant assignments (#45),
  the 5/7-space split among the 36 expansions, fountain-board hex layout, and
  fountain/statue/bench joker awards remain best-guess per rules.json `_unconfirmed`
  flags. The engine values satisfy every textual constraint of the rulebook.
- **#17 "the one of your choice"**: which duplicate copy is taken is engine-canonical
  (the copy on the expansion holding the fewest tiles — matches the rulebook example's
  play) rather than player-chosen. Strategically minor; would need an action-schema and
  UI extension to expose.
- **#13**: round 1 starts with seat 0, not the youngest player (standard digital
  convention; `setupGame` accepts `startingPlayerIndex` if a picker is added).
- **UI gaps (engine compliant, client doesn't expose yet)**: paying costs with held
  expansions; discarding multiple hexagons / held expansions on pass (UI currently
  discards at most one tile via DiscardToFloor); free placement-cell choice for
  expansion footprints is offered but the duplicate-take choice is not.
- **Expansion footprint shapes**: engine accepts any connected 5/7-cell blob; the physical
  pieces have fixed shapes (art-defined). Documented abstraction.
- **#60 Variant side**: out of scope for v1 (config hook `finalGroupScoring` exists).
- Engine clamps scores at 0 (rulebook states non-negativity explicitly only for the
  6-point purchase; clamping everywhere is the conservative Azul convention).

## Files changed

- shared/engine/model.ts — `tower`, `DisplayExpansion.onStack`, doc updates
- shared/engine/actions.ts — expansion Payment variant; `PassAction.discardExpansionIds`
- shared/engine/core.ts — acquire/refill rebuild, group rule, tower + shortage,
  payment routing, pass expansion discard, phase-3 cleanup, final-scoring fixes
- shared/engine/index.test.ts — updated 4 tests to rulebook behavior, added 10 regressions
- server/src/server.ts — Phase 2/3 driver, lobby snapshot `tower: []`
- client/src/components/gamelogic.ts — group-rule mirror for placement highlights
- client/src/components/seasonDialData.ts — dial realigned to engine wheel
- COMPLIANCE-CHECKLIST.md (new), COMPLIANCE-REPORT.md (this file)

Final status: `npx tsc -b` ✅ clean · `npm test` ✅ 83/83.
