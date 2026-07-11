# Arena Field Frame And AI Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Arena size/frame controls and stop near-equal unarmed pressure loops.

**Architecture:** Keep simulation bounds in `arenaWidth` and `arenaHeight`, expose preset metadata as config, and render the field frame as a DOM overlay independent of Canvas/Pixi. Gate unarmed pressure target selection by meaningful mass advantage so equal-size rivals do not create symmetric chase loops.

**Tech Stack:** CommonJS backend game engine, static HTML admin UI, static OBS overlay HTML/CSS/JS, Jest contract tests.

---

### Task 1: Failing Contracts

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`

- [x] Add config/state tests for `arenaSizePreset`, `arenaWidth`, `arenaHeight`, `fieldFrameEnabled`, `fieldFrameDesign`, `fieldFrameThickness`, and `fieldFrameGlow`.
- [x] Add default config test for standard 1920 x 1080 with enabled `neon-grid` frame.
- [x] Change the near-equal pressure regression so unarmed balls at almost the same mass do not select `pressure-player`.
- [x] Keep a positive pressure test for a meaningful but not yet absorbable mass advantage.
- [x] Add static admin UI and overlay contract tests for size presets and frame designs.

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
```

Expected before implementation: FAIL on the new config, UI, overlay, and AI behavior contracts.

### Task 2: Engine Config And AI Gate

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js`

- [x] Add default size and frame settings to `DEFAULT_CONFIG`.
- [x] Include size and frame fields in `getState().config`.
- [x] In `_canPressurePlayerTarget`, require a meaningful mass advantage for unarmed pressure targets while leaving armed pressure more permissive.
- [x] Run the focused Jest suite and verify the AI tests are green.

### Task 3: Admin UI Controls

**Files:**
- Modify: `app/plugins/game-engine/ui.html`

- [x] Add Arena size preset, width, and height controls.
- [x] Add field frame enable, design, thickness, and glow controls.
- [x] Add `ARENA_SIZE_PRESETS` and `applyArenaSizePresetToFields`.
- [x] Load and save all new config fields.
- [x] Run the focused Jest suite and verify admin contract tests are green.

### Task 4: Overlay Frame

**Files:**
- Modify: `app/plugins/game-engine/overlay/arena.html`

- [x] Add `#arena-field-frame` DOM layer.
- [x] Add CSS variants for all six frame designs.
- [x] Add `FIELD_FRAME_DESIGNS`, normalization, and `applyFieldFrameDesign`.
- [x] Call frame application during HUD/state updates.
- [x] Run the focused Jest suite and verify overlay contract tests are green.

### Task 5: Final Verification

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
npm run lint -- --quiet plugins/game-engine/games/arena.js plugins/game-engine/test/arena-engine.test.js
```

If a local server is running, also verify the served HTML contains the new controls and frame layer:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/game-engine/ui | Select-Object -ExpandProperty Content
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/overlay/game-engine/arena | Select-Object -ExpandProperty Content
```
