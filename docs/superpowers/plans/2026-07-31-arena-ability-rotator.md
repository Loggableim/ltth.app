# Arena Ability Rotator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three direct Arena ability instructions into individual lower information-rotator cards and make the existing upper legend opt-in.

**Architecture:** `ArenaGame` owns the default and serialized configuration value. The dashboard reads and saves the new setting through the existing Arena config payload. The self-contained Arena overlay builds the three cards from that state and gates the Canvas and Pixi upper legends on the setting, while leaving per-player ability rings unchanged.

**Tech Stack:** Node.js CommonJS, browser JavaScript inside the Arena HTML overlay, Jest, bundled Windows Node runtime.

## Global Constraints

- Work in the requested local `main` checkout and leave existing Stream Monsters and documentation changes untouched.
- Default `topOverlayShowAbilityLegend` to `false`, including for legacy saved configurations without that property.
- Add three independent lower cards only while `directAbilitiesEnabled` is true.
- Do not change cooldowns, command names, combat effects, player rings, or rotation cadence.
- During the live stream, reload only `game-engine` through its plugin reload endpoint; never restart the app.

---

### Task 1: Cover and expose the default-off setting

**Files:**
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Modify: `app/plugins/game-engine/games/arena.js:161-469, 2350-2450, 7651-7720`

**Interfaces:**
- Consumes: `ArenaGame.DEFAULT_CONFIG`, `ArenaGame#getState()`, and `ArenaGame#updateConfig()`.
- Produces: `state.config.topOverlayShowAbilityLegend: boolean`, defaulting to `false` and retained after configuration updates.

- [ ] **Step 1: Write the failing test**

```js
it('defaults the optional upper ability legend off while exposing an explicit enablement', () => {
  const { arena } = createArena();

  expect(arena.getState().config.topOverlayShowAbilityLegend).toBe(false);

  arena.updateConfig({ topOverlayShowAbilityLegend: true });

  expect(arena.getState().config.topOverlayShowAbilityLegend).toBe(true);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `runtime/node/node.exe node_modules/jest/bin/jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "defaults the optional upper ability legend off"`

Expected: FAIL because the public Arena state does not expose `topOverlayShowAbilityLegend`.

- [ ] **Step 3: Implement the minimal configuration path**

```js
// DEFAULT_CONFIG
topOverlayShowAbilityLegend: false,

// getState().config
topOverlayShowAbilityLegend: config.topOverlayShowAbilityLegend === true,

// _normalizeConfig(config)
config.topOverlayShowAbilityLegend = config.topOverlayShowAbilityLegend === true;
```

This retains a deliberately enabled value but treats omitted legacy values as off.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `runtime/node/node.exe node_modules/jest/bin/jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "defaults the optional upper ability legend off"`

Expected: PASS.

### Task 2: Add the dashboard control and lower ability cards

**Files:**
- Modify: `app/plugins/game-engine/ui.html:3239-3251, 6532-6593, 6646-6675`
- Modify: `app/plugins/game-engine/overlay/arena.html:995-1040, 1778-1850`
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**
- Consumes: `config.directAbilitiesEnabled`, `config.infoRotatorLanguageMode`, and `config.topOverlayShowAbilityLegend`.
- Produces: dashboard payload key `topOverlayShowAbilityLegend` and three `{ kind: 'ability', label, text, iconText }` rotator cards.

- [ ] **Step 1: Write the failing overlay and dashboard contract test**

```js
it('lists each direct ability in the lower rotator and saves the optional upper legend toggle', () => {
  const overlay = readOverlay();
  const ui = readUi();

  expect(overlay).toContain("kind: 'ability'");
  expect(overlay).toContain('!boost');
  expect(overlay).toContain('!shield');
  expect(overlay).toContain('!bomb');
  expect(overlay).toContain('topOverlayShowAbilityLegend');
  expect(ui).toContain('id="arena-top-overlay-show-ability-legend"');
  expect(ui).toContain('topOverlayShowAbilityLegend:');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `runtime/node/node.exe node_modules/jest/bin/jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "lists each direct ability in the lower rotator"`

Expected: FAIL because no ability rotator cards or dashboard toggle exist.

- [ ] **Step 3: Implement the minimal overlay and UI changes**

```js
function getArenaAbilityHints(config) {
  if (config?.directAbilitiesEnabled === false) return [];
  return [
    { kind: 'ability', iconText: 'RUN', label: 'Ability', text: '!boost – Tempo' },
    { kind: 'ability', iconText: 'SHD', label: 'Ability', text: '!shield – Schutz' },
    { kind: 'ability', iconText: 'BMB', label: 'Ability', text: '!bomb – Wurf' }
  ];
}
```

Append these cards beside `getArenaCommandHints(config)`. Add the unchecked `arena-top-overlay-show-ability-legend` checkbox, load it with `setArenaCheckbox(..., false)`, and save it from `checked === true` so a missing field never becomes enabled.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `runtime/node/node.exe node_modules/jest/bin/jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "lists each direct ability in the lower rotator"`

Expected: PASS.

### Task 3: Gate both upper renderers and complete live-safe verification

**Files:**
- Modify: `app/plugins/game-engine/overlay/arena.html:2150-2165, 2337-2372, 3295-3304`
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`

**Interfaces:**
- Consumes: `state.config.topOverlayShowAbilityLegend` supplied by the Arena state endpoint and Socket.IO updates.
- Produces: no Canvas or Pixi upper legend by default; both draw it only when the setting is true.

- [ ] **Step 1: Write the failing renderer-gating contract test**

```js
it('gates the Canvas and Pixi upper ability legends behind the opt-in setting', () => {
  const overlay = readOverlay();

  expect(overlay).toContain('if (state.config?.topOverlayShowAbilityLegend === true)');
  expect(overlay).toContain('drawAbilityLegend();');
  expect(overlay).toContain('drawPixiAbilityLegend();');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `runtime/node/node.exe node_modules/jest/bin/jest.js --runInBand plugins/game-engine/test/arena-engine.test.js -t "gates the Canvas and Pixi upper ability legends"`

Expected: FAIL because both renderer paths draw the legend unconditionally.

- [ ] **Step 3: Implement the minimal renderer guards**

```js
if (state.config?.topOverlayShowAbilityLegend === true) {
  drawAbilityLegend();
}

if (state.config?.topOverlayShowAbilityLegend === true) {
  drawPixiAbilityLegend();
}
```

- [ ] **Step 4: Verify focused automated and real overlay behaviour**

Run: `runtime/node/node.exe node_modules/jest/bin/jest.js --runInBand plugins/game-engine/test/arena-engine.test.js`

Expected: PASS with the full Arena suite.

Open `/overlay/game-engine/arena`, verify that the three direct ability cards rotate in the lower rotator, then enable the dashboard toggle and verify that the upper legend appears in the active renderer. Reload only `game-engine` with `POST /api/plugins/game-engine/reload` after the local checks, then repeat the default-off overlay inspection.
