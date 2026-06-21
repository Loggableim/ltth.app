# Snapshot Status

Last reviewed: 2026-04-26

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
- The active Jest suite still has failing behavioral/regression tests. The snapshot is cleaner, but not test-green yet.

## Plugin Inventory

The snapshot currently contains 35 plugin manifests:

- advanced-timer
- animazingpal
- api-bridge
- chatango
- clarityhud
- coinbattle
- config-import
- data-source
- fireworks
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

18 are enabled by default in their manifests and 17 are disabled by default.

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
npx jest --runInBand --silent --forceExit
```

Result: 117 passed suites, 37 failed suites, 154 total suites; 1660 passed tests, 126 failed tests, 1786 total tests.

Running normal `npm test -- --runInBand --silent` currently reaches the summary but does not exit cleanly because at least one suite leaves open async handles. Fix the remaining suite failures before treating `npm test` as reliable CI.

## Next Practical Step

Work down the remaining failing Jest suites by cluster:

- Game Engine queue/challenge behavior.
- Viewer XP isolation and IFTTT integration.
- Fireworks/WebGPU code-string regression tests.
- Profile/localStorage tests needing browser storage setup.
- TTS, TikTok reconnect, music bot, weather, and LastEvent behavioral assertions.
- `plugins/openshock/ui.js`, `plugins/talking-heads/assets/ui-old.js`, and `test/animazingpal-enhanced-features.test.js` are ignored by ESLint because they currently contain parser-level issues or stale UI code. Revisit them when touching those areas.

Then rerun:

```bash
cd app
npm test -- --runInBand --silent
npm run build:css
npm run lint
npm start
```
