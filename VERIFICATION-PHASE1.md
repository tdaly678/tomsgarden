# Tomsgarden — Phase 1 Verification Report

**Verifier:** Independent Phase 1 quality + IP + security gate
**Date:** 2026-06-02
**Scope:** Build/test integrity, rules fidelity, IP/trademark, join/password security.
**Method:** Re-ran build + tests; traced scoring code against `RULES.md`/`rules.json`;
grepped the codebase for trademarked terms; read server + client net/lobby for the auth flow.

---

## Summary verdict

| Area | Result |
|---|---|
| 1. Build / test integrity | **PASS** |
| 2. Rules fidelity | **PASS (with documented `_unconfirmed` gaps)** |
| 3. IP / trademark | **PASS** (no trademarked terms in user-facing surfaces; one cleanup nit) |
| 4. Security (join/password) | **CONDITIONAL** — one **HIGH** issue + several mediums |

### Recommendation: **GO for Phase 1**, conditional on fixing the one HIGH security item below.
Phase 1 is a friends-and-family / link-shared multiplayer build with no hidden information,
no money, and no PII beyond a freely-chosen display name. The engine is correct and well
tested, IP is clean, and the server is genuinely authoritative for rules and turn order. The
one HIGH item (reconnect-token join bypasses the password gate) is low blast-radius for this
audience but should be closed before launch because it is cheap to fix and is a real auth gap.

---

## 1. Build / Test Integrity — PASS

- `npx tsc -b --force` → exit **0**, clean.
- `npm test` (vitest) → **43 passed (43)**, 1 file, ~31ms. Green.

### Are the scoring tests meaningful? — YES

The engine suite (`shared/engine/index.test.ts`) is **not** shallow/tautological. It contains
real worked examples with hand-computed expected numbers, and it asserts the actual rules.json
constants rather than re-deriving them from the engine:

- `index.test.ts:503` asserts the round-1 wheel literally equals `['pattern1','color1','color2']`
  (pinning the rules.json value), then computes a worked example:
  `index.test.ts:509-521` — placed `pattern1/color1` scores **+2** (pattern AND color),
  `pattern2/color2` scores **+2** (color only), `pattern3/color3` scores **0** → total **4**,
  and confirms it lands on `STARTING_SCORE + 4`.
- Final-scoring SUM rule worked example: `index.test.ts:543-554` — a color-group of 3 (patterns
  1,2,3) scores `1+2+3 = 6` (the rulebook sum rule, not a flat 3).
- Dual-membership: `index.test.ts:567-592` — a cross where one hex is in both a color-group
  (sum 6) and a pattern-group (sum 3) → **9**. Correct per `RULES.md:128-129`.
- Complete-set bonus: `index.test.ts:595-620` — group of 6 same color, values `1..6` →
  `21 + 6 = 27`. Matches `RULES.md:130` and `rules.json` `completeSetBonus.groupOfSixDifferent=6`.
- Empty-storage final scoring: `index.test.ts:633-643` — `+1` per joker, `−value` per leftover
  tile → `+2 −4 −1 = −3`. Matches `rules.json finalScoring.emptyStorage`.
- A full 2-player end-to-end integration playthrough (`index.test.ts:761-873`) drives setup →
  4 rounds → final scoring → winner using only the public API, and a determinism test for a
  fixed seed. This is a strong harness, not a tautology.

### Independent trace of 3 scoring rules against the code

**(a) First-pass penalty (`RULES.md:103`, `rules.json passPenalty.firstPlayerToPass = -1`).**
`applyPass` (`core.ts:663-668`): first passer sets `firstPassTaken`, takes the first-player
marker (`firstPlayerIndex = idx`), and `score += FIRST_PASS_PENALTY` (−1), clamped at 0.
`FIRST_PASS_PENALTY` is sourced from rules.json at `rules-data.ts:60-61`. **Correct.**

**(b) Round (Phase 2) scoring (`RULES.md:108-111`).** `scoreRoundForPlayer`
(`core.ts:719-733`): for each placed hex, if its pattern is in the round's wheel categories
add `PATTERN_VALUE`, and *independently* if its color is in the categories add `PATTERN_VALUE`
again — so a hex can score twice. Then `+1 × visible pavilions`. Matches the spec's
"single hexagon can score twice" and "+1 point per visible pavilion." **Correct.**

**(c) Final group SUM + 6-set bonus (`RULES.md:128-130`).** `groupsBy` (`core.ts:781-816`)
does a proper flood-fill over hex `neighbors`, partitioning the matching hexes into connected
components (real adjacency, not just "count of color"). `scoreFinalForPlayer`
(`core.ts:831-844`) skips groups `< FINAL_MIN_GROUP_SIZE` (3), sums member `PATTERN_VALUE`
for default config, and adds `COMPLETE_SET_BONUS` (6) when `group.length === 6`. Evaluates all
6 colors then all 6 patterns (`core.ts:845-846`), so a hex can count in one color-group and one
pattern-group. **Correct, and faithful to the richer rulebook rule rather than the simplified
flat-3 brief.** The `flat3` alternative is wired behind `config.finalGroupScoring` and tested
(`index.test.ts:622-631`), matching the `RULES.md:133` note.

**No discrepancies found between implemented scoring and the rules spec.**

---

## 2. Rules Fidelity — PASS (with documented unconfirmed gaps)

Cross-checked engine constants (`rules-data.ts`) against `rules.json`; all are sourced from the
JSON (single source of truth), not hard-coded:

- Pattern values 1..6 and additional-discard `value−1` (`rules-data.ts:33-50`) ↔
  `placementCosts` (rules.json:55-73). Matches `RULES.md:84`. **OK.**
- Storage limits 12 tiles / 2 expansions (`rules-data.ts:53-54`) ↔ `rules.json storage`.
  Enforced on acquire in both `generateLegalMoves` (`core.ts:399-400`) and `applyAcquire`
  (`core.ts:552-559`). **OK.**
- Joker substitution: a joker can pay any *additional* needed hex but can never be the placed
  hex. `validatePayment` (`core.ts:318-376`) requires the real placed tile in storage and
  enforces the same-pattern/same-color + no-identical set rule over the **real** hexes only,
  excluding jokers. Matches `RULES.md:82`. **OK.**
- Final group SUM + 6-set bonus, empty-storage scoring, first-pass penalty — all traced above.
  **OK.**

### `_unconfirmed` values that materially affect play

These are honestly flagged in `rules.json`/`RULES.md` but **do affect scoring/balance** and
should be confirmed against the physical components before any competitive use:

- **MEDIUM — Rotary wheel category mapping** (`rules.json:124-130`, each quadrant
  `"_unconfirmed": true`). `WHEEL_BY_ROUND` (`rules-data.ts:78-85`) drives *all* of Phase 2
  scoring off a "reasonable balanced" guess for which 3 patterns/colors each round scores.
  This directly changes every round score. Functionally consistent and tested, but **not
  rulebook-accurate** until verified against the wheel art. Acceptable for Phase 1 (the game is
  internally consistent and fair to all players in a room), but flag for fidelity.
- **LOW/MEDIUM — Feature joker awards on surround** (`rules.json:100-103`, all `_unconfirmed`):
  fountain 3 / statue 2 / bench 1 / pavilion 1 are placeholders. Used at `core.ts:627`. Affects
  joker economy. Pavilion's `+1/round` scoring IS confirmed.
- **Not implemented in Phase 1 engine (acceptable, but note for completeness):**
  - Garden **expansions are never created/seeded** into the display (`displayExpansions` starts
    `[]` at `core.ts:188` and nothing ever pushes face-up expansions), so Action C (place
    expansion) and "buy expansion from supply for 6 pts" are effectively dormant. The garden
    cannot actually grow beyond the fixed 13-hex fountain board (`fountainBoardSpaces`,
    `core.ts:111-124`). This is a **functional simplification**, not a scoring bug — flag as a
    Phase 1 scope limitation (MEDIUM for "full game fidelity," not a blocker for a playable
    release).
  - Display refill does not model "flip 0-tile expansions face up" (`RULES.md:72`) since there
    are no expansions in play.

None of the above are scoring **errors**; they are scope/placeholder gaps that the rules docs
already disclose.

---

## 3. IP / Trademark — PASS

Grepped the full tree (excluding `node_modules`, `.git`, `dist`, lockfile) for
`azul | queen's garden | next move | plan b | asmodee | kiesling | michael`.

**All hits are in internal/developer-facing files only — none reach the shipped UI:**

| File:line | Context | Ships to user? |
|---|---|---|
| `shared/rules/rename-map.json:9-10` | The rename map keys themselves (by design) | No (build data) |
| `shared/rules/rules.json:4-5` | `_notes` / `sourceOfNumbers` PDF URL (Asmodee CDN) | No (dev notes) |
| `shared/rules/RULES.md:4` | Attribution note | No (docs) |
| `shared/types.ts:5`, `shared/engine/model.ts:4`, `engine/index.ts:4` | Code comments | No (stripped) |
| `server/src/server.ts:524` | Code comment | No (stripped) |
| `README.md:3` | "renamed clone of Azul: Queen's Garden" | No (repo readme) |
| `package.json:5` | `description` field | Published only if npm-published |

**User-facing surfaces are clean and on-theme:**
- Lobby/title UI (`HomeScreen.tsx:94-95`) shows **"Tomsgarden"** / "Plant, place, and out-bloom
  your rivals." No source-game names.
- All component/feature/pattern/color names use the `rename-map.json` Tomsgarden vocabulary
  (sapling/robin/ladybug/sunflower/snail/beehive; birdbath/garden-gnome/gazebo/potting-table;
  wildseed; shed; harvest track; season dial). Asset filenames match the renamed theme.
- Package names: `tomsgarden`, `@tomsgarden/{server,shared,client}` — clean.
- `client/src/assets/preview.html` — no trademarked terms.

**SVG art is original and trivially simple** (inspected all of
`client/src/assets/tiles/*.svg` and `features/*.svg`): each is a handful of `<path>`/`<rect>`/
`<ellipse>`/`<polygon>` primitives using `currentColor` / CSS-var fills (e.g.
`sapling.svg`, `robin.svg`, `sunflower.svg`, `beehive.svg`; `birdbath.svg`, `gazebo.svg`,
`garden-gnome.svg`, `potting-table.svg`, `wildseed.svg`). No copied or trademarked artwork, no
embedded raster/base64 images, no source-game trade dress.

### IP nits (LOW, cleanup only — not blockers)
- **LOW:** `package.json:5` `description` contains "Azul: Queen's Garden clone." If this package
  is ever `npm publish`-ed (it is `"private"`? — verify), that string becomes public. Reword to
  avoid the trademark in any published metadata.
- **LOW:** `rules.json:5 sourceOfNumbers` embeds an Asmodee rulebook PDF URL. Harmless as a dev
  citation, but it is shipped inside `shared/dist/rules/rules.json` and imported by the engine,
  so it technically rides along in the bundle. Consider stripping/relocating to a non-bundled
  doc. (No trademark *name* is exposed to users by this; it is a URL in a data blob.)

---

## 4. Security Review — join / password flow (CONDITIONAL)

Read `server/src/server.ts`, `client/src/net/realtimeClient.ts`, `client/src/lobby/*`.

### What is correctly enforced (good)
- **Password is enforced server-side.** `handleJoin` (`server.ts:282-287`) rejects with
  `BAD_PASSWORD` when `this.config.password !== null` and `msg.password` mismatches. The client
  never gates this itself. **Good.**
- **Host cannot be forged.** The client sends `asHost`, but the server **ignores it** — host is
  purely `isFirst = this.seats.size === 0` (`server.ts:271`, seat created with
  `isHost: isFirst` at `server.ts:317`). All host-only ops (`ConfigureRoom`, `KickPlayer`,
  `StartGame`) re-check `seat.isHost` server-side (`server.ts:338, 380, 417`). **Good — no host
  forgery.**
- **Cannot impersonate another seat / act out of turn.** `handleAction` (`server.ts:459-479`)
  resolves the seat from the connection's server-held token, rejects if
  `action.playerId !== seat.playerId` (`ILLEGAL_MOVE`), and rejects if it is not this player's
  turn (`NOT_YOUR_TURN`). Turn order and all legality are then re-validated by the authoritative
  engine (`applyAction`, `server.ts:485`). A client cannot set someone else's `playerId` because
  `playerId` is server-assigned and bound to the socket via `setState`. **Good.**
- **Reconnect token is strong/unguessable.** Both `token` and `playerId` are
  `crypto.randomUUID()` (`server.ts:308-309`) — 122 bits of entropy, not enumerable. **Good.**
- **Room IDs** are 6 chars from a 32-symbol alphabet (`links.ts:11-27`) using
  `crypto.getRandomValues` → ~30 bits. Fine as a share code; not a secret (the password is the
  gate). **Acceptable.**
- **Room expiry works.** `persist()` re-arms a storage alarm `IDLE_EXPIRY_MS` (3h) ahead
  (`server.ts:127-135`); `onAlarm` (`server.ts:143-157`) kicks all sockets and
  `storage.deleteAll()` + clears in-memory state. Any activity pushes the alarm forward, so it
  only fires when genuinely idle. **Good.**
- **Malformed input is handled.** Non-JSON messages → `Error` not crash (`server.ts:186-191`);
  unknown message types → `Error` (`server.ts:212-214`).

### Vulnerabilities / concerns

- **HIGH — Reconnect-token join bypasses the password gate.**
  `handleJoin` (`server.ts:257-268`) short-circuits on *any* `msg.token` that exists in
  `this.seats`, returning a fresh `JoinAck` **before** the password check (`server.ts:282`). The
  token check is a strong auth secret on its own (122-bit UUID), so this is not trivially
  exploitable — but it means **a holder of a valid (old) token can rejoin a now-password-protected
  room without the password**, and more importantly the design conflates "knows the reconnect
  token" with "is authorized," skipping the configured gate. If a token ever leaks (shared URL
  with token in query, logs, localStorage on a shared machine) the password provides no defense.
  *Fix:* on the token-reconnect path, still verify the seat's token matches a seat that was
  legitimately admitted, and either (a) accept tokens only while the seat is still reserved, and
  (b) when a password is set, do not treat token-possession as a password substitute for a *new*
  socket if the seat is already actively connected (prevent token replay hijacking a live seat —
  see next item).

- **MEDIUM — Token replay can hijack a live seat.** The reconnect path
  (`server.ts:258-267`) unconditionally sets `seat.connected = true` and re-binds the seat to the
  new socket without checking whether the seat is *already* connected. A second party replaying a
  captured token would be treated as the same player; both sockets now believe they own the seat,
  and either can submit actions on that player's turn. *Fix:* reject/ôr fence a token reconnect
  when `seat.connected === true` (or explicitly evict the old socket and treat it as a takeover,
  documented).

- **MEDIUM — No input shape validation on messages.** `onMessage` does `JSON.parse` and then a
  `switch` on `parsed.type` (`server.ts:187-214`), trusting the rest of the payload's shape. The
  engine validates *game* actions defensively, but lobby messages (`ConfigureRoom`, `SetReady`,
  `KickPlayer`) read fields like `msg.maxPlayers`, `msg.password`, `msg.playerId` without schema
  validation. `clampSeats` (`server.ts:629-632`) guards `maxPlayers`, and `password` is coerced
  via `typeof === 'string'` (`server.ts:358`), which is reasonable, but there is no central
  validator. *Risk is low* (no SQL/no eval; values are stored as data and echoed back), but a
  hostile client can set arbitrary-length passwords / names. *Fix:* add length caps + a thin
  runtime validator (e.g. zod) at the message boundary. Name length is capped client-side only
  (`HomeScreen.tsx:107 maxLength=24`) — **not** enforced server-side, so a malicious client can
  set an arbitrarily long display name that is broadcast to everyone (mild DoS / UI-break vector).

- **MEDIUM — Password compare is non-constant-time + stored/echoed in cleartext.**
  `msg.password !== this.config.password` (`server.ts:283`) is a timing-observable string
  compare, and the password is stored in plaintext in Durable Object storage
  (`persist()` K_CONFIG) and passed as a normal form `type="text"` input
  (`HomeScreen.tsx:162`, `tg-pw-j` also `type="text"`). For a casual party game this is broadly
  acceptable, but: use a length-independent compare, mask the field (`type="password"`), and
  document that the room password is not a high-security secret.

- **LOW — `markGone` host handling can orphan host.** When the host drops mid-lobby the seat is
  kept `connected:false` (`server.ts:239-242`) but host is never transferred; if the host never
  returns, the room cannot be started/configured/kicked by anyone (no host-reassignment). Idle
  expiry eventually reclaims it, but UX is a dead lobby. Not a security issue; flag as robustness.

- **LOW — No rate limiting.** A client can spam messages; only idle-expiry and engine rejection
  bound this. Acceptable for Phase 1 scale; note for later.

### Injection / XSS
- No `eval`, no dynamic `Function`, no SQL. Messages are parsed as JSON and stored as data.
- Display names are user-controlled and broadcast; rendering safety depends on the React board
  (React escapes by default — confirmed the lobby uses `{name}` text nodes, not
  `dangerouslySetInnerHTML`). **No XSS found**, but combine with the server-side name length cap
  above.

---

## Top fixes needed before launch (priority order)

1. **(HIGH)** Close the reconnect-token password bypass + live-seat takeover in `handleJoin`
   (`server.ts:257-268`): validate the password (or only honor tokens for *reserved/disconnected*
   seats) and reject a token reconnect onto an already-connected seat.
2. **(MEDIUM)** Add server-side input validation + length caps for `playerName`, `password`,
   `maxPlayers` at the `onMessage` boundary (`server.ts:183-215`).
3. **(MEDIUM)** Confirm the rotary-wheel category mapping (`rules.json:124-130`) and feature
   joker awards (`rules.json:100-103`) against the physical components for true rules fidelity.
4. **(MEDIUM, scope)** Decide whether Phase 1 ships without garden expansions in play
   (Action C / supply-buy are currently dormant — `displayExpansions` is never populated). If a
   "full" game is expected, this is a gap; if a fixed-board MVP is intended, document it.
5. **(LOW)** Constant-time password compare + mask the password input fields.
6. **(LOW)** Scrub the Asmodee PDF URL from the bundled `rules.json` and the "Azul" mention from
   `package.json` `description` if the package metadata could ever be published.

---

## Files reviewed (key)
- Engine: `shared/engine/core.ts`, `shared/engine/rules-data.ts`, `shared/engine/index.test.ts`
- Rules spec: `shared/rules/rules.json`, `shared/rules/RULES.md`, `shared/rules/rename-map.json`
- Server: `server/src/server.ts`
- Client net/lobby: `client/src/net/realtimeClient.ts`, `client/src/lobby/HomeScreen.tsx`,
  `client/src/lobby/links.ts`
- Assets: `client/src/assets/tiles/*.svg`, `client/src/assets/features/*.svg`,
  `client/src/assets/preview.html`

**Overall: GO for Phase 1 once item #1 (HIGH) is fixed.**
