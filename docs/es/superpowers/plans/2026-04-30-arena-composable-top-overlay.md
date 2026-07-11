# Arena Composable Top Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Arena top overlay from a small fixed preset list into a composable HUD system with 10 additional designs and independent layout/style/content controls.

**Architecture:** Add new Arena config defaults and state fields in the game engine, then consume those fields in the OBS overlay via body `data-*` attributes. Extend the admin UI so streamers can combine preset, position, density, accent, backdrop, rotator style, visibility, leaderboard rows, interval, and custom messages.

**Tech Stack:** CommonJS backend game config, inline OBS overlay HTML/CSS/JS, admin HTML/JS, Jest contract tests.

---

### Task 1: Contract Tests

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`

- [ ] Add tests asserting new top overlay config fields are exposed in `getConfig()` and `getState()`.
- [ ] Add tests asserting overlay contains 15 top HUD presets, data attributes, and normalization helpers.
- [ ] Add tests asserting admin UI contains all new controls and save/load bindings.
- [ ] Run: `cd app && npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --runTestsByPath --testNamePattern "top overlay"`
- [ ] Expected before implementation: failing tests that identify missing config/options.

### Task 2: Engine Config

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js`

- [ ] Add default config fields:
  `topOverlayPosition`, `topOverlayDensity`, `topOverlayAccent`, `topOverlayBackdrop`, `topOverlayRotatorStyle`, `topOverlayShowTitle`, `topOverlayShowCount`, `topOverlayShowLeaderboard`, `topOverlayLeaderboardRows`.
- [ ] Include all new fields in `getState().config`.
- [ ] Keep existing defaults compatible: `topOverlayDesign: 'widescreen'`, bilingual rotator remains default.

### Task 3: Overlay Rendering

**Files:**
- Modify: `app/plugins/game-engine/overlay/arena.html`

- [ ] Expand `TOP_OVERLAY_DESIGNS` with 10 new designs.
- [ ] Add normalization helpers for position, density, accent, backdrop, and rotator style.
- [ ] Extend `applyTopOverlayDesign()` to set body data attributes and visibility classes.
- [ ] Add CSS rules for new presets and combinable style dimensions.
- [ ] Use `topOverlayLeaderboardRows` when rendering leaderboard entries.
- [ ] Parse `infoRotatorMessages` from array or newline text.

### Task 4: Admin UI

**Files:**
- Modify: `app/plugins/game-engine/ui.html`

- [ ] Add select controls for design, position, density, accent, backdrop, and rotator style.
- [ ] Add checkboxes for title/count/leaderboard visibility.
- [ ] Add numeric controls for leaderboard rows and rotator interval.
- [ ] Add textarea for custom rotating overlay messages.
- [ ] Wire every new field into `loadArenaSettings()` and `saveArenaSettings()`.

### Task 5: Verification

**Files:**
- Test: `app/plugins/game-engine/test/arena-engine.test.js`

- [ ] Run focused red/green tests.
- [ ] Run full Arena suite: `cd app && npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent`.
- [ ] Run lint: `cd app && npm run lint -- --quiet plugins/game-engine/games/arena.js plugins/game-engine/overlay/arena.html plugins/game-engine/ui.html plugins/game-engine/test/arena-engine.test.js`.
