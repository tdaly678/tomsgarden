# VERIFICATION-PHASE2 — AI Wave + Rulebook Compliance Gate

Independent verification, 2026-06-04. Verifier ran all builds/tests itself and
performed an adversarial benchmark with fresh seeds. No code was modified.

## Verdict: GO (conditional) — deployable tonight, with one HIGH issue to fix in a fast follow-up.

---

## A. Build & test suite — PASS

- `npx tsc -b --force`: clean, exit 0 (verified directly).
- `npm test`: **118/118 passing** across 5 files (engine 74, ai/index 13,
  server 17, eval 8, benchmark 6). Matches claim.
- Changed engine tests (git diff `shared/engine/index.test.ts`): the 4
  corrected tests were judged against `shared/rules/RULES.md` and the
  justifications HOLD:
  - Duplicate identical hexagon stays in display — RULES.md:75 ("take only one of them"). Old test asserted dedupe-and-discard; new behavior is correct.
  - Refill of 4 only when a tile was taken from the round-stack top — RULES.md:78-80. Old test asserted unconditional refill; rulebook is conditional.
  - Stack-top extension + face-up flip on emptying — RULES.md:53, 78-80.
  - Setup: 4 fill tiles sit ON the round-1 stack-top expansion — RULES.md:53.
  - No test was weakened; 273 lines net-added, including a new
    "rulebook compliance regressions" describe block (group-connection rule #31,
    tower recycle #51, expansion payment #26/#27, pass-discard expansions #38,
    final-scoring expansion penalty #54, tower discard #27).

## B. Critical-path trace (server) — PASS

1. **Round advance**: `server/src/server.ts:706-731` (`applyAndAdvance`) — on
   `phase === 'scoring'` runs `advanceRound(scoreRound(next))`; `checkWin` +
   `scoreFinal` defensive backstop. End-to-end proof:
   `server/src/server.test.ts:341` ("chained bot turns drive a full bots-only
   round trip to game completion") asserts `phase === 'finished'` and
   non-empty `winnerIds` — verified passing (2.5 s real game loop).
2. **Bot moves use the same validation path**: `fireBotMove`
   (server.ts:771-794) routes through `applyAndAdvance` → engine
   `applyAction`, identical to the human path (server.ts:689). Bots never
   bypass legality.
3. **turnKey guard is sound** (`shared/ai/botScheduling.ts:47-50`): key =
   phase:round:activeIndex:rngState + per-player passed/score/storage/placed
   fingerprint. Analysis: every legal action mutates at least one component
   (Pass→passed flag, Acquire→storage.length, PlaceTile→placed.length,
   PlaceExpansion→spaces/placed, Buy→score), so two distinct decision points
   never share a key. Timer body re-validates key, pendingBotKey, AND active
   player id (server.ts:773-779). DO-restart re-arm (`onStart` →
   `maybeScheduleBotMove`, server.ts:177) is safe: the old timer dies with
   the instance; a re-armed duplicate no-ops on key mismatch. Human reconnect
   does not change game state, so an armed bot timer for the bot's own turn
   remains valid — correct.
4. **AddBot/RemoveBot abuse**: both are host-only (NOT_HOST, server.ts:556,
   599) and lobby-only (NOT_IN_LOBBY, server.ts:560, 603); difficulty
   validated (server.ts:564); room-full enforced (server.ts:568); RemoveBot
   refuses non-bot targets (server.ts:608). Covered by tests at
   server.test.ts:264-313 ("non-host cannot add or remove a bot", etc.).
5. **Stall safety**: all-pass → 'scoring' → server immediately scores and
   advances in the same action call. Bot exception → Pass fallback
   (server.ts:786-793). Bots are `connected: true` always, restored as
   present after hibernation (server.ts:171). 1 human + 1 bot startable
   (bots ready:true; start gate `ready || isHost`) — tested at
   server.test.ts:332.

   **Residual risk (LOW)**: `applyAndAdvance`'s try/catch (server.ts:723)
   silently swallows a scoring/advanceRound exception, which would leave the
   game stuck in 'scoring' with no recovery path. Defensive-only; no known
   trigger; flagged for observability.

## C. Strategy sanity — PASS, with one HIGH bug found

- **Determinism**: grep of `shared/ai` + `shared/engine` for
  `Math.random|Date.now` — zero hits outside comments. All bots take an
  injected `Rng`; per-decision rng derived from game `rngState` + turnKey
  hash. (Server uses Math.random only for the game seed at start —
  server.ts:649 — which is fine.)
- **Moves from generateLegalMoves**: confirmed in easy.ts:27, eval.ts:233-234
  (medium), hard.ts:72,105.
- **Benchmarks (measured by verifier, fresh harness)**:
  - Easy > Random: **0.70–0.725** (n=20–30)
  - Medium > Easy: **1.00** (n=16)
  - Hard > Easy: **1.00** (n=10)
  - Hard > Medium: **0.60** (n=10)
  Consistent with the claimed ordering (Hard>Easy 100%, Medium>Easy 100%,
  Hard>Medium ~0.55). Committed benchmark suite (118-test run) also passed
  with thresholds 0.6/0.55/0.7/0.5.

- **ISSUE (HIGH) — generateLegalMoves can emit an illegal PlaceExpansion**:
  Reproduced at seed **183137** (Easy vs Random self-play): the engine
  rejected a generated move with
  `IllegalMoveError: printed hexagon would create a group containing two
  identical hexagons` (thrown at `shared/engine/core.ts:1147`). Root cause:
  the printedAt selection in move generation (`shared/engine/core.ts:~568-583`)
  checks direct-adjacency rules but does NOT mirror
  `wouldGroupContainDuplicates`, which `applyPlaceExpansion` enforces.
  Impact: rare (~1 occurrence in 30 full self-play games); on the live server
  the bot's catch-and-Pass fallback (server.ts:786) absorbs it, so no crash
  or stall — but the bot wastes its turn passing, and any future consumer of
  generateLegalMoves (client move hints, deeper search) inherits the bug.
  Fix: add `!wouldGroupContainDuplicates(p.placed, held.hex, c)` to the
  printedAt candidate filter. Not a deploy blocker.

## D. Client lobby — PASS

- `client/src/lobby/LobbyScreen.tsx`: Add-AI buttons render only when
  `isHost && onAddBot` (empty-seat rows); Remove only `isHost && seat.isBot`;
  bot badge with difficulty renders; bots always shown Ready. Server
  independently enforces host-only (defense in depth).
- `client/src/net/realtimeClient.ts:152-160`: addBot/removeBot send typed
  `AddBot`/`RemoveBot` messages; `client/src/App.tsx:221-222` wires them.
- Types: `RosterSeat.isBot`/`difficulty` are optional/additive
  (shared/types.ts) — no type errors (tsc clean).

## E. Regression scan (live human-vs-human flow) — PASS with notes

- Protocol: all new client messages (AddBot/RemoveBot) and roster fields are
  additive; an old client ignores them. `GameState` gained `tower` and
  `DisplayExpansion.onStack` (additive); `displayTiles` retained explicitly
  "for wire compatibility" (model.ts comment) — an already-deployed client
  reading `displayTiles` will now see it mostly empty (tiles live in
  `displayExpansions[].tiles`), so client+server MUST deploy together
  (they do, via the same CI pipeline). MEDIUM-LOW: a player mid-game during
  the deploy window could see an empty display until refresh.
- Reconnect mid-deploy: persisted pre-deploy `GameState` lacks `tower`;
  engine code indexes `state.tower` on shortage/scoring paths —
  `next.tower` spread from an undefined field would throw inside the
  defensive catch. Practical impact limited (rooms are 3-hour ephemeral),
  but any in-flight game at deploy time may misbehave on round advance.
  Severity LOW given room lifetime; acceptable for tonight.
- Human-vs-human action path unchanged structurally (same handleAction →
  applyAndAdvance); turn enforcement, password, hijack protections intact
  and still tested (server.test.ts:110-249).

## Issue summary

| # | Severity | Issue | Location |
|---|----------|-------|----------|
| 1 | HIGH | generateLegalMoves emits PlaceExpansion violating group-duplicate rule (repro seed 183137); bot falls back to Pass | shared/engine/core.ts:~568 vs :1147 |
| 2 | LOW | applyAndAdvance silently swallows scoring/advanceRound exceptions → possible silent stuck-in-'scoring' | server/src/server.ts:714-725 |
| 3 | LOW | Pre-deploy persisted games lack `tower` field; in-flight games at deploy may error on round advance (rooms expire in 3 h) | shared/engine/model.ts / migration |
| 4 | LOW | Stale-timer test assertions are weak (`expect(afterBot).toBeTruthy()`); guard logic itself verified sound by inspection | server/src/server.test.ts:372-397 |
| 5 | LOW | Repo hygiene: ~35 stray `vitest.config.ts.timestamp-*.mjs` files in project root should be deleted/gitignored | project root |

## GO/NO-GO

**GO** for deploying tonight (client + server together). Issue #1 should be
fixed in the next session (one-line filter addition + regression test at seed
183137); it degrades bot quality rarely but cannot crash or stall the room.
