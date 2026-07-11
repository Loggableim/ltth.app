# Arena Large Ball Transparency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional large-ball opacity curve to reduce stream visual dominance from huge Arena balls.

**Architecture:** Store the option in Arena config/state, expose it in the admin UI, and render through one overlay helper shared by Canvas and Pixi. The alpha curve starts at a configured mass and reaches a configured minimum at `maxMass`.

**Tech Stack:** CommonJS Arena engine, static Game Engine admin UI, static Arena overlay, Jest contract tests.

---

### Task 1: Failing Tests

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`

- [x] Add config/state tests for `largeBallTransparencyEnabled`, `largeBallTransparencyStartMass`, and `largeBallMinOpacity`.
- [x] Add default config test for enabled transparency with start mass `55` and min opacity `0.42`.
- [x] Add overlay contract checks for `playerVisualAlpha` and Canvas/Pixi usage.
- [x] Add admin UI contract checks for the new controls and save/load fields.

### Task 2: Engine Config

**Files:**
- Modify: `app/plugins/game-engine/games/arena.js`

- [x] Add default transparency settings to `DEFAULT_CONFIG`.
- [x] Include transparency settings in `getState().config`.

### Task 3: Admin UI

**Files:**
- Modify: `app/plugins/game-engine/ui.html`

- [x] Add checkbox and numeric controls under the visual/frame Arena settings.
- [x] Load the new fields from `/api/game-engine/config/arena`.
- [x] Save the new fields to `/api/game-engine/config/arena`.

### Task 4: Overlay Render

**Files:**
- Modify: `app/plugins/game-engine/overlay/arena.html`

- [x] Add default config values to overlay state.
- [x] Implement `playerVisualAlpha(player)`.
- [x] Use the helper in Canvas player rendering.
- [x] Use the helper in Pixi player node rendering.

### Task 5: Verification

Run:

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
npm run lint -- --quiet plugins/game-engine/games/arena.js plugins/game-engine/test/arena-engine.test.js
npm run build:css
```
