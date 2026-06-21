# LTTH App Runtime

This directory contains the maintained Node.js runtime for the current LTTH snapshot.

## Install

```bash
npm install
```

## Run

```bash
npm start
```

Development mode:

```bash
npm run dev
```

Dashboard:

```text
http://localhost:3000/dashboard.html
```

OBS overlays:

```text
http://localhost:3000/overlay.html
http://localhost:3000/goals-overlay.html
http://localhost:3000/animation-overlay.html
```

## Configure TikTok LIVE

Eulerstream requires an API key. Use one of:

- Dashboard settings
- `app/.env` copied from `.env.example`
- `EULER_API_KEY`

TikFinity can be selected through the data source setting/plugin when used.

## Commands

```bash
npm start
npm run dev
npm test
npm run test:coverage
npm run build:css
npm run watch:css
npm run lint
```

## Important Files

- `server.js`: main Express/Socket.IO runtime
- `modules/database.js`: SQLite schema and persistence
- `modules/tiktok.js`: live data source facade
- `modules/adapters/`: Eulerstream and TikFinity adapters
- `modules/plugin-loader.js`: PluginAPI and lifecycle
- `modules/ifttt/`: automation engine
- `routes/plugin-routes.js`: plugin management API
- `public/`: dashboard and overlay frontend
- `plugins/`: built-in plugin ecosystem
- `test/`: Jest regression tests
- `wiki/`: German user-facing documentation

## Persistence

Runtime profiles, databases, uploads, and plugin data are stored through `ConfigPathManager` in a persistent platform-local directory. Plugin code should use `api.getPluginDataDir()` for files that must survive updates.

## Notes

The repository root is a snapshot wrapper. Install dependencies here in `app/`, not at the root, unless a future task intentionally adds root-level tooling.
