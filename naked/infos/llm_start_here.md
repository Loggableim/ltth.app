# LLM Start Here

This is the current technical entry point for agents working on the LTTH snapshot.

## Current Context

LTTH is a local TikTok LIVE helper with a Node.js backend, Socket.IO realtime layer, SQLite persistence, static frontend assets, OBS overlays, event automation, and a plugin ecosystem.

This workspace is a local snapshot:

- No `.git` directory is present.
- Dependencies are not installed yet.
- `app/` is the maintained runtime.
- The old Electron main-process folder is not present.
- Root `package.json` is a convenience wrapper, not the backend dependency manifest.

Before making changes, read:

1. `AGENTS.md`
2. `docs/SNAPSHOT_STATUS.md`
3. this file
4. the module or plugin you will edit

## Runtime Shape

```text
app/server.js
  Express app
  Socket.IO server
  profile/config initialization
  SQLite database initialization
  TikTok connector initialization
  IFTTT automation engine
  core REST routes
  plugin loader

app/modules/
  database.js
  tiktok.js
  adapters/
  plugin-loader.js
  ifttt/
  goals.js
  alerts.js
  leaderboard.js
  obs-websocket.js
  config-path-manager.js
  user-profiles.js

app/plugins/
  36 plugin manifests
  plugin-specific backend, UI, overlay, tests, assets

app/public/
  dashboard and overlay HTML
  browser JavaScript
  CSS and static assets
```

## Main Data Flow

1. A live event arrives from Eulerstream or TikFinity through `app/modules/tiktok.js`.
2. The selected adapter normalizes and deduplicates the event.
3. `server.js` listens for normalized events such as `gift`, `chat`, `follow`, `like`, `share`, and `subscribe`.
4. Core handlers update alerts, goals, leaderboard stats, event logs, and IFTTT flows.
5. `PluginLoader` registers plugin TikTok listeners and Socket.IO handlers.
6. Dashboard and OBS overlays receive updates through Socket.IO and HTTP routes.

## Important Files

- `app/server.js`: central runtime composition and route wiring
- `app/modules/adapters/EulerstreamAdapter.js`: Eulerstream WebSocket behavior, dedupe, stats, gift catalog
- `app/modules/adapters/TikFinityAdapter.js`: TikFinity WebSocket adapter
- `app/modules/database.js`: schema, settings, event logs, plugin-support tables
- `app/modules/plugin-loader.js`: PluginAPI and lifecycle
- `app/modules/ifttt/`: visual automation engine
- `app/public/js/dashboard.js`: dashboard behavior
- `app/public/dashboard.html`: main dashboard shell
- `app/package.json`: backend dependency manifest
- `build-src/`: Go launcher source

## Plugin Rules

Each plugin should use:

- `plugin.json` for metadata
- `main.js` or the manifest entry file for backend logic
- `api.registerRoute()` for HTTP endpoints
- `api.registerSocket()` for Socket.IO events
- `api.registerTikTokEvent()` for live event callbacks
- `api.getConfig()` and `api.setConfig()` for settings
- `api.getPluginDataDir()` for persistent files
- `api.log()` for logging

Do not write persistent runtime data into `app/plugins/<plugin>`.

## Setup Commands

Dependencies are installed in `app/`:

```bash
cd app
npm install
```

Start backend:

```bash
npm start
```

Development mode:

```bash
npm run dev
```

Tests after dependencies exist:

```bash
npm test
npm run test:coverage
npm run build:css
npm run lint
```

Root convenience commands forward into `app/`:

```bash
npm start
npm run dev
npm test
npm run build:css
```

## Working Standards

- Code and comments in English.
- User-facing docs and UI may be German.
- Prefer existing module and plugin patterns.
- Use `logger` or `this.api.log()`, not `console.log`, in production paths.
- Wrap async external calls in try/catch.
- Validate request bodies, file paths, URLs, usernames, and plugin input.
- Use existing database helpers and prepared statements.
- Keep plugin event cleanup intact when changing lifecycle code.
- Update active docs when changing setup, architecture, API contracts, or plugin contracts.

## Known Snapshot Issues

- No Git metadata.
- No installed dependencies.
- No active Electron main-process source.
- `docs_archive/` contains many historical reports that can be stale.
- Some user wiki pages may still contain older feature counts or release wording.

Treat code as the final source of truth.
