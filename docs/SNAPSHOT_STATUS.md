# Snapshot Status

Last reviewed: 2026-07-08

## Scope

This workspace is a full Git checkout of the canonical `Loggableim/ltth.app` repository. It contains the backend app, frontend assets, plugins, user documentation, launcher sources, compiled launcher binaries, a plugin store, a one-line installer system, shared website layout, and historical documentation.

It does not contain the old Electron main-process source folder.

Canonical project identity:

- Product/site: `ltth.app`
- GitHub repository: `Loggableim/ltth.app`
- Repository URL: `https://github.com/Loggableim/ltth.app`
- Website: `https://ltth.app`
- Release/install branch on GitHub: `main`

Do not confuse this snapshot with older LTTH repositories or stale archive references. `REPOSITORY_IDENTITY.md` is the canonical identity marker.

## Git State

- This workspace **is** a Git checkout (`.git/` present).
- Active local branch: `codex/main-deploy`.
- Remote `origin/main` is the default branch on GitHub.
- 90+ `origin/copilot/*` remote branches exist from Copilot-generated feature work.
- 3 local `codex/*` feature branches exist.
- `git status` may include unrelated temporary artifacts from local browser/image work; ignore them when reviewing release changes.
- Use `git log`, `git branch`, `git diff`, etc. normally.

## Current Source Of Truth

- Runtime app: `app/`
- Backend entry: `app/server.js`
- Root entry: `main.js`, which delegates to `app/server.js`
- Backend package: `app/package.json`
- Root helper package: `package.json` (convenience wrapper + Go launcher build scripts)
- Plugin manifests: `app/plugins/*/plugin.json`
- Plugin store registry: `plugin-store.json` (root)
- Plugin store packages: `plugin-store/packages/*.zip`
- Plugin store backend: `app/modules/plugin-store.js`
- Plugin store routes: `app/routes/plugin-routes.js`
- One-line installer scripts: `install/` (real scripts) + root `install.js`/`install.sh`/`install.ps1` (legacy shims)
- Shared website layout: `_partials/header.html` + `_partials/footer.html` + `js/layout.js`
- Website i18n: `locales/` (root, client-side) + `app/locales/` (app-internal, backend-served)
- Website feature pages: `features/`
- Website screenshots: `screenshots/`
- Release staging: `new_patch/` + `released_patches/` + `scripts/release_from_new_patch.py`
- Go launcher sources: `build-src/`
- Compiled launcher binaries: `launcher.exe`, `launcher-console.exe`, `dev_launcher.exe`, `ltth-bootstrapper.exe` (root)
- Runtime state: `runtime/`
- Repository identity: `REPOSITORY_IDENTITY.md`
- Developer onboarding: `AGENTS.md` and `infos/llm_start_here.md`
- Version: `1.3.24` (see `version.json` and `app/package.json`)

## Dependency State

Dependencies were installed after the initial cleanup:

- Root `node_modules/` remains intentionally absent.
- `app/node_modules/` is present.
- `app/package-lock.json` is current for the installed app dependencies.
- `jsdom` and `supertest` are now explicit dev dependencies because active Jest suites require them.
- The installed dependency tree is currently clean under `npm audit`; overrides keep legacy transitive packages on patched replacements where needed.
- Do not add a global `glob` override: Jest coverage uses `test-exclude@6`, which expects its own `glob@7` function API.
- Safe-mode launcher runs (`LTTH_SAFE_MODE=true` or `DISABLE_PLUGINS=true`) intentionally suppress TikTok startup auto-reconnect and gift-catalog network calls.

Reinstall backend dependencies with:

```bash
cd app
npm install
```

The root package has no dependency tree on purpose. It only forwards commands into `app/` and builds Go launchers.

## Plugin Store

The plugin store was introduced in v1.3.9 and remains part of the current snapshot:

- **Registry:** `plugin-store.json` (root) — 36 plugin entries with multilingual descriptions (en/de/es/fr), SHA-256 checksums, package URLs, pricing, and badges.
- **Packages:** `plugin-store/packages/` — 36 pre-packaged `.zip` files, one per plugin.
- **Backend:** `app/modules/plugin-store.js` (563 lines) — `PluginStore` class with HTTPS URL validation, SHA-256 checksum verification, safe ZIP extraction, community-source opt-in.
- **Routes:** `app/routes/plugin-routes.js` — 6 store-specific API endpoints under `/api/plugin-store`.
- **Frontend:** `app/public/js/plugin-manager.js` (1590 lines) — `PluginManager` class with `store` and `installed` tabs, category filters, dev-status filters, badges, and one-click install flow.
- **Tests:** `plugin-store.test.js`, `plugin-store-registry.test.js`, `plugin-store-routes.test.js`.
- **Design docs:** `docs/superpowers/plans/2026-07-04-plugin-store*.md` + `docs/superpowers/specs/2026-07-04-plugin-store-appstore-ui-design.md`.
- **Preinstalled plugins** (enabled by default in store): `chatango`, `goals`, `lastevent-spotlight`, `soundboard`, `toptier`, `tts`, `webgpu-emoji-rain`.

Community plugin repositories are supported behind explicit user opt-in (`POST /api/plugin-store/community/enable`).

## One-Line Installer

Cross-platform one-line installer system:

- **Real scripts:** `install/install.js` (Node 18+), `install/install.sh` (Bash ≥4.0), `install/install.ps1` (PowerShell ≥5.0).
- **Legacy shims:** Root `install.js`, `install.sh`, `install.ps1` — thin wrappers that curl-pipe to `install/` versions.
- **Documentation:** `install/README.md` — full reference with environment variables (`LTTH_VERSION`, `LTTH_DIR`, `LTTH_PORT`, `LTTH_NO_BROWSER`, `LTTH_QUIET`, `LTTH_REPO_OWNER`, `LTTH_REPO_NAME`).
- **Integration:** `version.json` contains `oneLineInstaller` commands for Windows/macOS/Linux/Universal.
- **Default release branch:** `main` (override with `LTTH_REPO_BRANCH` only for legacy/custom installs).
- **Windows bootstrap:** the PowerShell installer requests admin elevation on first run, downloads `launcher.exe`, and then hands off to `launcher.exe` for the first app/bootstrap run. The launcher provisions portable Node 22.14.0, installs the app on first start, and rebuilds native modules when needed.
- **Unix/bootstrap:** `install/install.sh` auto-installs Git and current Node LTS on macOS/Linux, and `install/install.js` auto-installs Git where possible while still requiring a compatible Node runtime to launch.

## Shared Website Layout

Client-side layout injection for the static website:

- `_partials/header.html` (16 KB) and `_partials/footer.html` (4 KB) — shared HTML fragments.
- `js/layout.js` (20 KB) — loads partials via `fetch()`, injects into DOM, fires `layoutReady` event.
- `js/i18n.js` — listens for `layoutReady`, re-applies translations to injected elements.
- `css/layout.css` — shared layout styles.
- Language detection: `localStorage` → URL `?lang=` → `navigator.language` → default `de`.
- Supported languages: `de`, `en`, `es`, `fr`.

This is a purely client-side solution — no server-side rendering required. Works on GitHub Pages static hosting.

## Go Launcher Build System

`build-src/` contains Go sources for four launcher binaries:

| Binary | Source | Purpose |
|---|---|---|
| `launcher.exe` | `launcher-gui.go` (170 KB) | GUI launcher (Windows, `-H windowsgui`) |
| `launcher-console.exe` | `launcher.go` (38 KB) | Console launcher |
| `dev_launcher.exe` | `dev-launcher.go` (38 KB) | Dev launcher with terminal output |
| `ltth-bootstrapper.exe` | `bootstrapper.go` (31 KB) | Thin installer/bootstrapper |

Go module: `github.com/Loggableim/ltth.app`, Go 1.24.10.

Key launcher features:
- Port fallback: tries range `3000–3050`, writes actual port to `.ltth_port`.
- `netstat -ano` diagnostics on Windows for port conflicts.
- Detailed startup diagnostics in `app/logs/launcher_*.log`.
- `ltthgit.go` — Git operations module for cloud launcher.
- `launcher_gui_test.go` (24 KB) — GUI launcher tests.

CI workflows:
- `backend-ci.yml` — Node 20.x + 22.x matrix, Ubuntu.
- `build-launcher.yml` — Tag-driven (`launcher-v*` / `launcher-beta-v*`), cross-compiles Windows binaries on Ubuntu.
- `release.yml` — Tag-driven (`v*`), builds on Windows with Go 1.24.10 + Node 22.
- `website-screenshots.yml` — Daily 4 AM cron, Puppeteer screenshots.
- `copilot-setup-steps.yml` — Copilot environment setup.

## Backend Modules

Key modules in `app/modules/`:

- `database.js` — SQLite schema, settings, event logs, plugin-support tables.
- `tiktok.js` — TikTok connector and event normalization.
- `adapters/` — `EulerstreamAdapter.js`, `TikFinityAdapter.js`, `BaseAdapter.js`.
- `plugin-loader.js` (1502 lines) — PluginAPI and lifecycle.
- `plugin-store.js` (563 lines) — Plugin store registry, install, community sources.
- `ifttt/` — Visual automation engine (action/condition/trigger registries, engine, migration, variable store).
- `goals.js`, `alerts.js`, `leaderboard.js` — Core feature modules.
- `obs-websocket.js` — OBS integration.
- `config-path-manager.js` — Persistent config storage outside app directory.
- `config-repair.js` — Config validation and repair.
- `legacy-config-discovery.js` (464 lines) — Discovers scattered legacy config files in the filesystem.
- `port-manager.js` — Port fallback helper (tries preferred port, falls back to next free port in range).
- `launcher.js` — Platform-agnostic launcher module (Node/npm checks, dependency verification).
- `update-manager.js` — Git-backed update manager with rollback support for clean working trees.
- `i18n.js` — Backend i18n with plugin translation merging.
- `user-database.js`, `user-profiles.js` — User management.
- `backup/` — Backup/import/export subsystem.
- `changelog-agent/` — Automated changelog generation from git history.
- `webgpu-engine/` — WebGPU engine (TypeScript, experimental).

## Known Gaps

- Electron-specific source files are missing. Any future desktop shell work needs a deliberate Electron restoration task.
- The old root `package-lock.json` described a stale Electron package and was removed.
- Historical docs in `docs_archive/` may mention removed paths, old plugin names, previous architecture, and obsolete release processes.
- Historical docs may mention old repository identities such as `Loggableim/pupcidslittletiktoolhelper_desktop` or `mycommunity/ltth.app`; those are not current.
- Some app/wiki pages may still be user-facing historical copy and should be updated feature-by-feature when touched.
- The active Jest suite is currently test-green. Treat future failures as new regressions or environmental drift and investigate them from current output.
- `update-manager.js` is now Git-backed again. It refuses dirty working trees, performs fast-forward updates, and rolls back on failure.
- `fireworks-dev-2.0.0.zip` remains in `plugin-store/packages/` although the `app/plugins/fireworks-dev/` source directory was deleted. This may be intentional (transitional) or an oversight.
- `launcher.exe~` (9.8 MB) in root is a stale backup binary. `.gitignore` covers `*.backup` but not `*.exe~`.
- Go version inconsistency: `go.mod` requires Go 1.24.10, but `build-launcher.yml` CI uses `~1.21`. Launcher CI builds may fail if Go 1.21 cannot parse 1.24 syntax.
- `naked/` is a reduced repo clone from 2026-04-30 (29 MB), ignored by `.gitignore`. It predates the plugin store, shared layout, and installer systems.

## Plugin Inventory

The workspace currently contains 36 plugin manifests in `app/plugins/`:

- advanced-timer
- animazingpal
- api-bridge
- chatango
- clarityhud
- coinbattle
- config-import
- data-source
- fireworks (stable, v2.0.0 — `fireworks-dev/` was removed and consolidated into `fireworks/`)
- flame-overlay (v3.0.0)
- game-engine
- gcce
- gift-milestone
- goals
- interactive-story (v1.0.0, enabled by default)
- lastevent-spotlight
- milestone-leaderboard
- minecraft-connect
- multicam
- music-bot
- openshock
- osc-bridge
- quiz-show
- sidekick (v1.0.0, development-beta)
- soundboard
- streamalchemy
- stt-ticker
- talking-heads
- thermal-printer
- toptier
- tts
- vdoninja
- viewer-leaderboard
- viewer-profiles
- weather-control
- webgpu-emoji-rain

`fireworks-dev/` was deleted and consolidated into `fireworks/` (v2.0.0, `devStatus: stable`). The dev plugin had its own 7 test files, all removed and replaced by 3 new stable test files.

## Validation Performed

Before dependency install, static cleanup performed:

- Removed stale root Electron lockfile.
- Replaced root package metadata with backend/launcher snapshot commands.
- Replaced root `main.js` with backend delegation.
- Removed stale Electron and old soundboard CI workflows.
- Added agent onboarding and current snapshot status docs.

- Renamed standalone verification scripts from `*.test.js` to `*.manual.js`; `npm test` now discovers only Jest-style test files.
- Added `app/test/README.md` with the active test naming convention.
- Updated Jest transform handling for ESM dependencies used by active tests.
- Added `app/test/jest.setup.js` with `Blob`/`File` polyfills for Node 20/22 compatibility.
- Fixed compatibility issues in OSC Bridge and Game Engine startup paths exposed by legacy mocks.
- Added ESLint 9 flat config while preserving the existing focused lint intent.
- Syntax checks passed for the touched JS modules.
- `npm run build:css` passes.
- `npm run lint -- --quiet` passes.

Latest measured Jest state with dependencies installed:

```bash
cd app
npm test -- --runInBand --silent
```

Result: 262 passed suites, 262 total suites; 2560 passed tests, 2560 total tests.

Normal `npm test -- --runInBand --silent` exits cleanly in the current dependency state.

Coverage also runs cleanly:

```bash
cd app
npm run test:coverage -- --runInBand --silent
```

Result: 262 passed suites, 262 total suites; 2560 passed tests, 2560 total tests.

## Next Practical Step

Keep the snapshot healthy by rerunning the current verification set after code or dependency changes:

```bash
cd app
npm test -- --runInBand --silent
npm audit
npm run build:css
npm run lint
npm start
```
