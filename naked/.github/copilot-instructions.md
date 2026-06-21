# Copilot Instructions

This repository snapshot is LTTH, a local TikTok LIVE helper with a Node.js backend, static dashboard/overlay frontend, SQLite persistence, Go launcher sources, and a plugin ecosystem.

## Current Snapshot Rules

- Treat `app/` as the maintained runtime.
- Root `package.json` only forwards commands into `app/` and builds Go launchers.
- Do not assume Electron support. The Electron main-process source folder is absent in this snapshot.
- Do not rely on Git history unless the owner has uploaded this snapshot to a real repository.
- Read `AGENTS.md`, `docs/SNAPSHOT_STATUS.md`, and `infos/llm_start_here.md` before larger work.

## Key Paths

- `app/server.js`: Express, Socket.IO, API routes, TikTok event handlers, service composition
- `app/modules/database.js`: SQLite schema and persistence helpers
- `app/modules/tiktok.js`: adapter facade
- `app/modules/adapters/`: Eulerstream and TikFinity adapters
- `app/modules/plugin-loader.js`: PluginAPI and lifecycle
- `app/modules/ifttt/`: automation engine
- `app/plugins/`: plugin ecosystem
- `app/public/`: dashboard and overlays
- `app/test/`: Jest tests
- `build-src/`: Go launcher source
- `infos/`: active developer docs
- `docs_archive/`: historical reference only

## Code Style

- CommonJS JavaScript.
- 2-space indentation.
- English code and comments.
- German is acceptable for user-facing UI/wiki docs.
- Use logger APIs, not `console.log`, in production paths.
- Keep async external calls wrapped with useful error handling.
- Validate request bodies, file paths, URLs, usernames, and plugin input.

## Plugin Rules

Plugins should use `api.registerRoute()`, `api.registerSocket()`, `api.registerTikTokEvent()`, `api.getConfig()`, `api.setConfig()`, `api.getPluginDataDir()`, and `api.log()`.

Persistent plugin data must not be written into `app/plugins/<plugin>` unless it is source-controlled static plugin content.

## Verification

After dependencies are installed:

```bash
cd app
npm test
npm run build:css
npm run lint
```

Use targeted tests in `app/test/` for subsystem changes.
