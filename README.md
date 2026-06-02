# Tomsgarden

An online, real-time multiplayer board game — a renamed clone of _Azul: Queen's
Garden_. Hands-off hosting that lives entirely on GitHub: the client deploys to
**GitHub Pages**, and the realtime server runs on **PartyKit** (Cloudflare's
edge), with **one room per game**.

## Architecture

```
tomsgarden/
├─ client/   React + Vite + TypeScript app (deploys to GitHub Pages)
├─ server/   PartyKit room server (one PartyKit room == one game)
├─ shared/   Shared TypeScript: protocol types + rules engine
│  ├─ types.ts        domain + client<->server message types
│  ├─ engine/         rules engine (typed stubs; built by another agent)
│  └─ rules/          canonical rules text/data (owned by another agent)
├─ .github/workflows/ CI + two deploy pipelines
└─ root configs       npm workspaces, tsconfig, ESLint, Prettier, Vitest
```

- **Client** is a static SPA. Vite's `base` is set to `/tomsgarden/` so it works
  as a GitHub Pages _project page_ (`https://<user>.github.io/tomsgarden/`).
  Override with the `VITE_BASE` env var if you rename the repo.
- **Server** is a single `PartyServer` class. Each PartyKit room is one game:
  it accepts WebSocket connections, validates an optional room password on
  `Join`, tracks connected players, and broadcasts authoritative `StateUpdate`s.
- **Shared** is the contract between them. `types.ts` defines the domain
  (`Tile`, `PlayerState`, `GameState`), the `Action` discriminated union, and
  the `Message` protocol (`Join`, `JoinAck`, `StateUpdate`, `ActionMsg`,
  `Error`). The rules engine in `shared/engine/` exposes typed signatures
  (`generateLegalMoves`, `applyAction`, `scoreRound`, `scoreFinal`, `checkWin`)
  that currently throw `not implemented`.

The server is the single source of truth: clients send intents (`ActionMsg`),
the server validates them via the engine and broadcasts the resulting state.

## Local development

Requires Node 22+.

```bash
npm install          # install all workspaces

npm run dev:client   # Vite dev server (http://localhost:5173)
npm run dev:server   # PartyKit dev server (http://localhost:1999)
```

Useful root scripts:

```bash
npm run typecheck    # tsc --build across all workspaces
npm run lint         # ESLint (flat config)
npm test             # Vitest
npm run build        # production build of the client
```

The dev client reads the room id from `?room=<id>` (or the last URL path
segment) and renders a placeholder board.

## Deployment (hands-off, on GitHub)

Three workflows in `.github/workflows/`:

| Workflow             | Trigger            | Does                                              |
| -------------------- | ------------------ | ------------------------------------------------ |
| `ci.yml`             | PRs to `main`      | lint + typecheck + tests                         |
| `deploy-client.yml`  | push to `main`     | build client, publish to GitHub Pages            |
| `deploy-server.yml`  | push to `main`     | deploy PartyKit room server to the edge          |

### One-time setup

1. **Enable GitHub Pages**: repo **Settings → Pages → Build and deployment →
   Source: GitHub Actions**.
2. **Add the PartyKit token**: run `npx partykit token generate` locally (after
   `npx partykit login`), then add it as repo secret **`PARTYKIT_TOKEN`** under
   **Settings → Secrets and variables → Actions**.
3. If you rename the repo from `tomsgarden`, update `VITE_BASE` in
   `deploy-client.yml` to `/<new-repo-name>/`.

## Supabase fallback note

PartyKit (Cloudflare Durable Objects) is the primary realtime backend because it
gives us cheap, edge-local, **one-room-per-game** state with WebSockets and no
servers to babysit. If PartyKit ever becomes unsuitable (pricing, region needs,
or a desire to persist game history and accounts), the fallback is **Supabase**:
use Supabase Realtime channels for the live transport and Postgres for durable
game/room records. The `shared/` contract (`types.ts` + `engine/`) is transport-
agnostic, so swapping the realtime layer should not require touching game logic —
only the thin server adapter in `server/` would be rewritten against Supabase
Realtime instead of `PartyServer`.
