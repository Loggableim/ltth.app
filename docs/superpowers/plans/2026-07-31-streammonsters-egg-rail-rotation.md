# Stream Monsters Egg Rail Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the egg rail a persistent, configurable circular carousel that defaults to four visible cards and never renders a partial final page.

**Architecture:** The plugin configuration owns `eggShelfVisibleCount`, normalized to an integer from 1 through 6. The creator UI saves and rehydrates it through the existing config route. The overlay passes the snapshot config into the stage view; the stage view selects a wrapping window of cards and disables the desktop landing transform in portrait.

**Tech Stack:** CommonJS, Express plugin routes, static HTML/JavaScript, Jest with JSDOM.

## Global Constraints

- `eggShelfVisibleCount` has inclusive bounds 1-6 and defaults to 4.
- All active, non-expired eggs participate in rotation.
- The visible rail remains full whenever enough eggs exist.
- Only StreamAlchemy may be reloaded in the running client; do not restart the app.

---

### Task 1: Persist and expose the visible-card configuration

**Files:**
- Modify: `app/plugins/streamalchemy/index.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Test: `app/test/streammonsters-plugin-integration.test.js`

**Interfaces:**
- Produces: `streamMonsters.eggShelfVisibleCount`, an integer normalized to 1-6.
- Consumes: `POST /api/streammonsters/config` payload field `eggShelfVisibleCount`.

- [ ] **Step 1: Write failing configuration tests**

```js
expect(plugin.config.streamMonsters.eggShelfVisibleCount).toBe(4);
expect(plugin.updateConfig({ streamMonsters: { eggShelfVisibleCount: 99 } })
  .streamMonsters.eggShelfVisibleCount).toBe(4);
```

- [ ] **Step 2: Run the focused integration test and confirm failure**

Run: `runtime/node/node.exe app/node_modules/jest/bin/jest.js app/test/streammonsters-plugin-integration.test.js --runInBand --forceExit`

- [ ] **Step 3: Add a `normalizeEggShelfVisibleCount` helper and use it in config load/update/public config**

```js
normalizeEggShelfVisibleCount(value) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= 6 ? count : 4;
}
```

- [ ] **Step 4: Rerun the focused configuration test**

Run: `runtime/node/node.exe app/node_modules/jest/bin/jest.js app/test/streammonsters-plugin-integration.test.js --runInBand --forceExit`

### Task 2: Save and rehydrate the GUI control

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-creator-runtime.js`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`
- Test: `app/test/streammonsters-creator-runtime.test.js`

**Interfaces:**
- Consumes: `values.eggShelfVisibleCount` from `#eggShelfVisibleCount`.
- Produces: config payload field `eggShelfVisibleCount`, clamped to 1-6 with fallback 4.

- [ ] **Step 1: Write a failing payload test**

```js
expect(buildConfigPayload({ values: { eggShelfVisibleCount: '5' } }))
  .toEqual(expect.objectContaining({ eggShelfVisibleCount: 5 }));
```

- [ ] **Step 2: Run the creator runtime test and confirm failure**

Run: `runtime/node/node.exe app/node_modules/jest/bin/jest.js app/test/streammonsters-creator-runtime.test.js --runInBand --forceExit`

- [ ] **Step 3: Add a labelled 1-6 select to the existing Stream Monsters setup controls and wire it into save/hydration**

```html
<label><span>Visible eggs in rotation</span><select id="eggShelfVisibleCount">
  <option value="1">1</option><option value="2">2</option><option value="3">3</option>
  <option value="4" selected>4</option><option value="5">5</option><option value="6">6</option>
</select></label>
```

- [ ] **Step 4: Rerun the creator test and inspect the rendered control in the UI harness**

Run: `runtime/node/node.exe app/node_modules/jest/bin/jest.js app/test/streammonsters-creator-runtime.test.js --runInBand --forceExit`

### Task 3: Render a full circular egg rail and make portrait CSS fail-safe

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-egg-stage-view.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Test: `app/test/streammonsters-egg-stage-animation-v111.test.js`
- Test: `app/test/streammonsters-jackpot-overlay-v110.test.js`
- Test: `app/test/streammonsters-egg-overlay-state-reliability.test.js`

**Interfaces:**
- Consumes: `getVisibleCount()` callback from the overlay snapshot config.
- Produces: a wrapping `visible` array with `min(total, visibleCount)` cards.

- [ ] **Step 1: Write failing rotation tests for seven-plus eggs**

```js
expect(buildShelfModel(eggs, { maxVisible: 4, rotationIndex: 1 }).visible)
  .toHaveLength(4);
```

- [ ] **Step 2: Run the shelf suites and confirm the old partial page fails**

Run: `runtime/node/node.exe app/node_modules/jest/bin/jest.js app/test/streammonsters-egg-stage-animation-v111.test.js app/test/streammonsters-jackpot-overlay-v110.test.js --runInBand --forceExit`

- [ ] **Step 3: Replace page slicing with a wrapping window and pass normalized config to the stage view**

```js
const start = normalized.length > visibleLimit ? rotationIndex % normalized.length : 0;
const visible = Array.from({ length: Math.min(visibleLimit, normalized.length) },
  (_, offset) => normalized[(start + offset) % normalized.length]);
```

- [ ] **Step 4: Add a portrait CSS override that neutralizes an accidentally retained `landing` class**

```css
#egg-shelf .egg-shelf-item.landing { animation:none !important; transform:none !important; }
```

- [ ] **Step 5: Rerun shelf and overlay integration tests**

Run: `runtime/node/node.exe app/node_modules/jest/bin/jest.js app/test/streammonsters-egg-stage-animation-v111.test.js app/test/streammonsters-jackpot-overlay-v110.test.js app/test/streammonsters-egg-overlay-state-reliability.test.js --runInBand --forceExit`

### Task 4: Verify the live plugin delivery

**Files:**
- No source files beyond Tasks 1-3.

- [ ] **Step 1: Run lint and the focused GUI/overlay suite**

Run: `runtime/node/node.exe app/node_modules/eslint/bin/eslint.js app/plugins/streamalchemy/index.js app/plugins/streamalchemy/streammonsters-creator-runtime.js app/plugins/streamalchemy/streammonsters-egg-stage-view.js`

- [ ] **Step 2: Reload only StreamAlchemy**

Run: `Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/plugins/streamalchemy/reload'`

- [ ] **Step 3: Confirm live state and overlay serve `eggShelfVisibleCount` and portrait landing protection**

Run: `Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/streammonsters/overlay'`
