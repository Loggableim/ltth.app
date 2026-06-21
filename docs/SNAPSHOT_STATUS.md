# Snapshot Status

Last reviewed: 2026-06-20

## Scope

This workspace is a local LTTH snapshot prepared for future development before publishing to GitHub. It contains the backend app, frontend assets, plugins, user documentation, launcher sources, compiled launcher binaries, and historical documentation.

It does not contain Git metadata and currently does not contain the old Electron main-process source folder.

## Current Source Of Truth

- Runtime app: `app/`
- Backend entry: `app/server.js`
- Root entry: `main.js`, which now delegates to `app/server.js`
- Backend package: `app/package.json`
- Root helper package: `package.json`
- Plugin manifests: `app/plugins/*/plugin.json`
- Developer onboarding: `AGENTS.md` and `infos/llm_start_here.md`

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

## Known Gaps

- Electron-specific source files are missing. Any future desktop shell work needs a deliberate Electron restoration task.
- The old root `package-lock.json` described a stale Electron package and was removed.
- Historical docs in `docs_archive/` may mention removed paths, old plugin names, previous architecture, and obsolete release processes.
- Some app/wiki pages may still be user-facing historical copy and should be updated feature-by-feature when touched.
- The active Jest suite is currently test-green. Treat future failures as new regressions or environmental drift and investigate them from current output.

## Plugin Inventory

The snapshot currently contains 36 plugin manifests:

- advanced-timer
- animazingpal
- api-bridge
- chatango
- clarityhud
- coinbattle
- config-import
- data-source
- fireworks
- fireworks-dev
- flame-overlay
- game-engine
- gcce
- gift-milestone
- goals
- interactive-story
- lastevent-spotlight
- milestone-leaderboard
- minecraft-connect
- multicam
- music-bot
- openshock
- osc-bridge
- quiz-show
- sidekick
- soundboard
- streamalchemy
- talking-heads
- thermal-printer
- toptier
- tts
- vdoninja
- viewer-leaderboard
- viewer-profiles
- weather-control
- webgpu-emoji-rain

19 are enabled by default in their manifests and 17 are disabled by default.

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
