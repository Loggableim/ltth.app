# Arena Top Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable Arena top overlay designs and language-controlled beta/feature rotator messages.

**Architecture:** Store display choices in Arena config, expose them in `getState()`, let the existing overlay apply CSS variants and build localized rotator messages, and let the existing admin UI load/save the new fields.

**Tech Stack:** CommonJS backend, static HTML/CSS/JS overlays, Jest contract tests.

---

### Task 1: Config And State Contract

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/games/arena.js`

- [ ] Add a failing Jest assertion that `getConfig()` defaults to `topOverlayDesign: 'widescreen'` and `infoRotatorLanguageMode: 'de-en'`.
- [ ] Add a failing Jest assertion that `getState().config` exposes both values.
- [ ] Add both fields to `DEFAULT_CONFIG`.
- [ ] Add both fields to the serialized `getState().config`.

### Task 2: Overlay Contract And Rendering

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/overlay/arena.html`

- [ ] Add failing static tests for `applyTopOverlayDesign`, `data-arena-overlay-design`, all design values, `Beta test - expect bugs`, and `infoRotatorLanguageMode`.
- [ ] Add CSS variants for `classic`, `widescreen`, `landscape`, `slim`, and `high-contrast`.
- [ ] Add `applyTopOverlayDesign()` and call it from HUD/state updates.
- [ ] Replace the hard-coded German-only feature messages with a localized message builder that supports `de-en`, `en-de`, `de`, and `en`.
- [ ] Keep custom messages and gift catalog images in the rotator.

### Task 3: Admin UI

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/ui.html`

- [ ] Add failing static tests for `arena-top-overlay-design`, `arena-info-rotator-language`, option values, and save/load wiring.
- [ ] Add the two selects in the Arena settings UI.
- [ ] Load values in `loadArenaSettings()`.
- [ ] Persist values in `saveArenaSettings()`.

### Task 4: Verification

**Commands:**

```bash
cd app
npx jest plugins/game-engine/test/arena-engine.test.js --runInBand --silent
npm run lint -- --quiet plugins/game-engine/games/arena.js plugins/game-engine/test/arena-engine.test.js
```

Expected result: focused Arena tests and lint pass. Full `npm test` remains out of scope because this snapshot documents unrelated failing suites.
