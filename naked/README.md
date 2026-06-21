# PupCid's Little TikTool Helper (LTTH)

LTTH is a local TikTok LIVE helper for stream overlays, alerts, TTS, soundboard actions, goals, automation flows, OBS integration, and plugin-driven extensions.

This workspace is a local snapshot, not a Git checkout. We are treating `app/` as the maintained runtime and `build-src/` as the Windows launcher source. The older Electron main-process folder is not present in this snapshot, so Electron build scripts were removed from the active root package metadata.

## Current Runtime

- Backend: Node.js, Express, Socket.IO
- Persistence: SQLite via `better-sqlite3`
- Frontend: static HTML/CSS/JavaScript under `app/public`
- Integrations: Eulerstream, TikFinity, OBS WebSocket, MyInstants, OSC, OpenAI and other plugin-specific APIs
- Plugin system: 36 plugin manifests under `app/plugins`
- Launcher: Go sources and compiled Windows launchers under `build-src/` and the repository root

## Setup

Install dependencies only after reviewing the snapshot state:

```bash
cd app
npm install
```

Start the backend:

```bash
npm start
```

Development mode with auto-reload:

```bash
npm run dev
```

The dashboard is served at:

```text
http://localhost:3000/dashboard.html
```

OBS overlay entry points:

```text
http://localhost:3000/overlay.html
http://localhost:3000/goals-overlay.html
http://localhost:3000/animation-overlay.html
```

## Required Configuration

TikTok LIVE connections through Eulerstream require an API key. Configure it in one of these places:

- Dashboard settings after startup
- `app/.env` copied from `app/.env.example`
- Environment variable `EULER_API_KEY`

Runtime user data is stored outside the app directory through `ConfigPathManager`, usually in the platform-local application data directory. Plugin data should use `api.getPluginDataDir()` and not write persistent state into `app/plugins`.

## Important Paths

- `app/server.js`: main backend, API routes, Socket.IO, TikTok event wiring
- `app/modules/tiktok.js`: facade for Eulerstream and TikFinity adapters
- `app/modules/adapters/`: live data source adapters
- `app/modules/database.js`: SQLite schema and persistence helpers
- `app/modules/plugin-loader.js`: plugin lifecycle and PluginAPI
- `app/modules/ifttt/`: automation engine
- `app/public/`: dashboard and overlay assets
- `app/plugins/`: built-in plugins
- `app/test/`: Jest tests and regression tests
- `build-src/`: Go launcher source and installer material
- `infos/`: current developer and agent documentation
- `docs_archive/`: historical reference only

## Commands

From the repository root:

```bash
npm start
npm run dev
npm test
npm run build:css
```

From `app/` directly:

```bash
npm start
npm run dev
npm test
npm run test:coverage
npm run build:css
npm run lint
```

Build launcher binaries from root:

```bash
npm run build:launcher:win
npm run build:launcher:console
npm run build:launcher:dev
```

## Development Rules

- Code and comments should be English.
- User-facing UI and wiki documentation may be German.
- Use the existing logger or `this.api.log()` in plugins.
- Validate external input and use prepared SQLite statements.
- Keep plugin data in persistent config/plugin data paths.
- Update `infos/` docs when changing architecture, setup, plugin contracts, or APIs.

Start future work with [AGENTS.md](AGENTS.md), [infos/llm_start_here.md](infos/llm_start_here.md), and [docs/SNAPSHOT_STATUS.md](docs/SNAPSHOT_STATUS.md).
