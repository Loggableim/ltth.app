# LLM Start Here

This is the current technical entry point for agents working on the LTTH workspace.

## Current Context

LTTH is a local TikTok LIVE helper with a Node.js backend, Socket.IO realtime layer, SQLite persistence, static frontend assets, OBS overlays, event automation, a plugin ecosystem, and a plugin store.

Canonical identity:

- Project/site: `ltth.app`
- GitHub repository: `Loggableim/ltth.app`
- Repository URL: `https://github.com/Loggableim/ltth.app`
- Website: `https://ltth.app`

If older repo names appear in archive files, generated reports, comments, or paths, do not use them for current GitHub work. `REPOSITORY_IDENTITY.md` is the canonical identity marker.

This workspace is a full Git checkout:

- `.git/` is present. Use `git log`, `git branch`, `git diff`, etc. normally.
- Active local branch: `codex/main-deploy`. Remote default: `origin/main`.
- Dependencies are installed in `app/`; root `node_modules/` remains intentionally absent.
- `app/` is the maintained runtime.
- The old Electron main-process folder is not present.
- Root `package.json` is a convenience wrapper, not the backend dependency manifest.
- Current version: `1.3.24` (see `version.json` and `app/package.json`).

Before making changes, read:

1. `AGENTS.md`
2. `REPOSITORY_IDENTITY.md`
3. `docs/SNAPSHOT_STATUS.md`
4. this file
5. the module or plugin you will edit

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
  plugin store routes
  wiki routes
  locale routes
  Swagger (lazy-loaded, skippable via DISABLE_SWAGGER)

app/modules/
  database.js
  tiktok.js
  adapters/ (EulerstreamAdapter, TikFinityAdapter, BaseAdapter)
  plugin-loader.js
  plugin-store.js          ← plugin store registry, install, community sources
  ifttt/                   ← visual automation engine
  goals.js
  alerts.js
  leaderboard.js
  obs-websocket.js
  config-path-manager.js
  config-repair.js
  legacy-config-discovery.js ← discovers scattered legacy config files
  port-manager.js          ← port fallback helper (3000–3050 range)
  launcher.js              ← platform-agnostic launcher checks
  update-manager.js        ← Git-backed update manager with rollback support
  i18n.js                  ← backend i18n with plugin translation merging
  user-database.js
  user-profiles.js
  backup/                  ← backup/import/export subsystem
  changelog-agent/         ← automated changelog generation
  webgpu-engine/            ← experimental WebGPU engine (TypeScript)

app/plugins/
  36 plugin manifests
  plugin-specific backend, UI, overlay, tests, assets

app/routes/
  plugin-routes.js         ← plugin + plugin-store API endpoints
  wiki-routes.js           ← wiki API
  locale.js                ← i18n translation API
  debug-routes.js

app/public/
  dashboard and overlay HTML
  browser JavaScript (dashboard.js, navigation.js, plugin-manager.js, etc.)
  CSS (navigation.css, themes.css, tailwind.output.css, etc.)
  static assets

app/locales/
  de.json, en.json, es.json, fr.json  ← backend-served translations
  *.enhanced.json, validation-report.json, compare.py

app/test/
  222 Jest test files (*.test.js)
  62 manual test files (*.manual.js)
  jest.setup.js            ← Blob/File polyfills for Node 20/22
```

## Website & Static Assets (Repository Root)

The repository root hosts the public `ltth.app` website and supporting infrastructure:

```text
_partials/         ← shared HTML fragments (header.html, footer.html)
js/                ← shared website JS (layout.js, i18n.js, main.js, docs.js)
css/               ← shared website CSS (layout.css, main.css, docs.css)
locales/           ← client-side website translations (de/en/es/fr + home-*.json)
features/          ← static HTML feature pages (alerts, emoji-rain, tts, etc.)
screenshots/       ← website screenshots (de/, features/, live-check/)
install/           ← one-line installer scripts (install.js, install.sh, install.ps1)
plugin-store.json  ← official plugin store registry (36 entries)
plugin-store/      ← pre-packaged plugin ZIPs (packages/*.zip)
build-src/         ← Go launcher sources (launcher-gui.go, bootstrapper.go, etc.)
runtime/           ← runtime state (launcher_settings.json, node/)
scripts/           ← release and test scripts
new_patch/         ← release staging area
released_patches/  ← released patch archive
downloads/         ← download page + legacy launcher
naked/             ← reduced repo clone from 2026-04-30 (ignored by .gitignore)
```

## Main Data Flow

1. A live event arrives from Eulerstream or TikFinity through `app/modules/tiktok.js`.
2. The selected adapter normalizes and deduplicates the event.
3. `server.js` listens for normalized events such as `gift`, `chat`, `follow`, `like`, `share`, and `subscribe`.
4. Core handlers update alerts, goals, leaderboard stats, event logs, and IFTTT flows.
5. `PluginLoader` registers plugin TikTok listeners and Socket.IO handlers.
6. Dashboard and OBS overlays receive updates through Socket.IO and HTTP routes.

## Plugin Store Architecture

The plugin store, introduced in v1.3.9, adds:

- `GET /api/plugin-store` — list official + opt-in community store plugins.
- `GET /api/plugin-store/sources` — list configured store sources.
- `POST /api/plugin-store/community/enable` — opt in to community sources.
- `POST /api/plugin-store/sources` — add a community registry source.
- `DELETE /api/plugin-store/sources/:id` — remove a community source.
- `POST /api/plugin-store/:sourceId/:pluginId/install` — install a plugin from a registry.

Security: HTTPS-only package URLs, SHA-256 checksum verification, safe ZIP extraction with path-traversal protection, plugin ID validation.

## Important Files

- `app/server.js`: central runtime composition and route wiring
- `app/modules/adapters/EulerstreamAdapter.js`: Eulerstream WebSocket behavior, dedupe, stats, gift catalog
- `app/modules/adapters/TikFinityAdapter.js`: TikFinity WebSocket adapter
- `app/modules/database.js`: schema, settings, event logs, plugin-support tables
- `app/modules/plugin-loader.js`: PluginAPI and lifecycle
- `app/modules/plugin-store.js`: plugin store registry, install, community sources
- `app/modules/legacy-config-discovery.js`: discovers scattered legacy config files
- `app/modules/port-manager.js`: port fallback helper
- `app/modules/ifttt/`: visual automation engine
- `app/public/js/dashboard.js`: dashboard behavior
- `app/public/js/plugin-manager.js`: plugin manager + store UI
- `app/public/js/navigation.js`: navigation and plugin visibility
- `app/public/dashboard.html`: main dashboard shell
- `app/package.json`: backend dependency manifest
- `plugin-store.json`: plugin store registry
- `build-src/`: Go launcher source
- `version.json`: current version and one-line installer commands; the Windows PowerShell path elevates on first run, downloads `launcher.exe`, and hands off to `launcher.exe` for app/bootstrap work, `install/install.sh` bootstraps Git and current Node LTS on macOS/Linux, and `install/install.js` auto-installs Git where possible
- `_partials/` + `js/layout.js`: shared website layout system

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
npm run build:launcher:win    # builds launcher.exe
npm run build:launcher:console # builds launcher-console.exe
npm run build:launcher:dev    # builds dev_launcher.exe
npm run build:bootstrapper:win # builds ltth-bootstrapper.exe
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

- No active Electron main-process source.
- `update-manager.js` is Git-backed again and no longer a no-op stub.
- `docs_archive/` contains many historical reports that can be stale.
- Some user wiki pages may still contain older feature counts or release wording.
- Root `node_modules/` is intentionally absent because root package scripts forward into `app/`.
- `launcher.exe~` in root is a stale backup binary (not covered by `.gitignore`).
- Go version inconsistency: `go.mod` requires 1.24.10, `build-launcher.yml` CI uses `~1.21`.
- `naked/` is a reduced repo clone from 2026-04-30, ignored by `.gitignore`.

Treat code as the final source of truth.
