# WebGPU Fireworks Choreography and UI Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`, plus `superpowers:test-driven-development` for each behavior change. Observe every named RED failure before editing production code.

**Goal:** Close C1-C7 at the settings, designer, built-in-show, formation, timing, and composition boundaries while consuming—not duplicating—the backend configuration and GPU geometry/envelope contracts.

**Architecture:** The backend's exported `CONFIG_LIMITS` is the only numeric settings source and is delivered with config responses to a small browser contract adapter. Shape controls and designer handles use one activation path per control. Built-in plans gain deterministic named formation layouts and derived visual/audio activity intervals. Furry Celebration consumes the GPU plan's semantic Boykisser palette and geometry without maintaining a second glyph. The final CPU matrix replays real planner/runtime commands through the GPU plan's fake renderer and visible-envelope fitter.

**Tech Stack:** CommonJS and UMD JavaScript, Jest 29, JSDOM, the existing PyroDSL compiler, FinaleShowPlanner, ShowPlan V2 runtime, and the GPU plan's fake-WebGPU harness.

**Design:** [`../specs/2026-07-19-webgpu-fireworks-release-hardening-design.md`](../specs/2026-07-19-webgpu-fireworks-release-hardening-design.md)

**Companion plans:**

- [`2026-07-19-webgpu-fireworks-backend-hardening.md`](2026-07-19-webgpu-fireworks-backend-hardening.md)
- [`2026-07-19-webgpu-fireworks-gpu-hardening.md`](2026-07-19-webgpu-fireworks-gpu-hardening.md)
- [`2026-07-19-webgpu-fireworks-release-acceptance.md`](2026-07-19-webgpu-fireworks-release-acceptance.md)

## Execution order and ownership

- Complete backend Task 4 before Task 1 here; C1 extends the same `CONFIG_LIMITS` object introduced for B11 and never reimplements relational FPS normalization.
- Complete GPU Tasks 0, 4, and 6 before Tasks 4 and 7 here. `gpu/boykisser-geometry.js` and `gpu/visible-envelope.js` remain GPU-owned.
- Execute Tasks 1-6 in order, then Task 7. Run the separate release/runtime-acceptance plan only after all focused suites are green.
- Keep CommonJS and 2-space indentation. Do not alter root locales, generated plugin documentation, the sitemap, release metadata, OBS state, or live user data.
- Each RED command must fail for the stated reason. Each GREEN command must exit naturally without `--forceExit` or an open-handle warning.

---

### Task 1: Round-trip every backend-valid performance value in settings (C1)

**Depends on:** Backend Task 4/B11.

**Files:**

- Create: `app/plugins/webgpu-fireworks/ui/settings-contract.js`
- Create: `app/test/webgpu-fireworks-settings-contract.test.js`
- Modify: `app/plugins/webgpu-fireworks/lib/config-schema.js`
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.html`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.js`
- Modify: `app/plugins/webgpu-fireworks/ui/show-style-options.js`
- Modify: `app/test/webgpu-fireworks-trigger-truth.test.js`
- Modify: `app/test/webgpu-fireworks-finale-settings.test.js`
- Modify: `app/test/webgpu-fireworks-settings-http-truth.test.js`
- Modify: `app/test/webgpu-fireworks-release-alignment.test.js`

**Step 1: Write the failing schema-to-DOM contract**

Create `app/test/webgpu-fireworks-settings-contract.test.js`:

```js
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { CONFIG_ENUMS, CONFIG_LIMITS, normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');
const SettingsContract = require('../plugins/webgpu-fireworks/ui/settings-contract');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
const html = fs.readFileSync(path.join(pluginRoot, 'ui', 'settings.html'), 'utf8');

test('exports one complete numeric control contract', () => {
  expect(CONFIG_LIMITS).toEqual(expect.objectContaining({
    maxParticles: { min: 200, max: 3000, step: 1, uiScale: 1 },
    maxTotalParticles: { min: 512, max: 16384, step: 1, uiScale: 1 },
    targetFps: { min: 24, max: 120, step: 1, uiScale: 1 },
    minFps: { min: 15, max: 60, step: 1, uiScale: 1 },
    minTargetFps: { min: 20, max: 50, step: 1, uiScale: 1 }
  }));
});

test('covers every range and select in the shipped settings document', () => {
  const document = new JSDOM(html).window.document;
  const rangeIds = [...document.querySelectorAll('input[type="range"]')].map(node => node.id).sort();
  const selectIds = [...document.querySelectorAll('select[id]')].map(node => node.id).sort();
  expect(rangeIds).toHaveLength(23);
  expect(selectIds).toHaveLength(20);
  expect(Object.keys(SettingsContract.RANGE_CONTROLS).sort()).toEqual(rangeIds);
  expect(Object.keys(SettingsContract.ENUM_CONTROLS).sort()).toEqual(selectIds);
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  for (const [id, field] of Object.entries(SettingsContract.RANGE_CONTROLS)) {
    const input = document.getElementById(id);
    const { min, max, step, uiScale } = CONFIG_LIMITS[field];
    expect(Number(input.min)).toBe(min * uiScale);
    expect(Number(input.max)).toBe(max * uiScale);
    expect(Number(input.step)).toBe(step * uiScale);
    expect(input.disabled).toBe(false);
  }
  for (const [id, descriptor] of Object.entries(SettingsContract.ENUM_CONTROLS)) {
    const contract = CONFIG_ENUMS[descriptor.contract];
    const dynamicPattern = contract.dynamicPattern
      ? new RegExp(contract.dynamicPattern, contract.dynamicFlags || '')
      : null;
    const values = [...document.getElementById(id).options].map(option => option.value);
    expect(values.filter(value => !dynamicPattern?.test(value))).toEqual(contract.values);
    expect(values.every(value => contract.values.includes(value) || dynamicPattern?.test(value))).toBe(true);
    expect(document.getElementById(id).disabled).toBe(false);
  }
});

test.each([
  ['maxParticles', 200],
  ['maxParticles', 3000],
  ['maxTotalParticles', 512],
  ['maxTotalParticles', 8192],
  ['maxTotalParticles', 10000],
  ['maxTotalParticles', 16384],
  ['targetFps', 24],
  ['targetFps', 120],
  ['minFps', 15],
  ['minFps', 60],
  ['minTargetFps', 20],
  ['minTargetFps', 50]
])('round-trips %s=%i through schema and its real range input', (field, value) => {
    const document = new JSDOM(html).window.document;
    SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
    SettingsContract.writeNumericConfig(document, { targetFps: 120, [field]: value });
    expect(SettingsContract.readNumericConfig(document)[field]).toBe(value);
    expect(normalizeConfig({ targetFps: 120, [field]: value })[field]).toBe(value);
});

test('round-trips both backend boundaries for every shipped range control', () => {
  const document = new JSDOM(html).window.document;
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  for (const field of Object.values(SettingsContract.RANGE_CONTROLS)) {
    const limits = CONFIG_LIMITS[field];
    for (const value of [limits.min, limits.max]) {
      SettingsContract.writeNumericConfig(document, { targetFps: 120, [field]: value });
      expect(SettingsContract.readNumericConfig(document)[field]).toBe(value);
      expect(normalizeConfig({ targetFps: 120, [field]: value })[field]).toBe(value);
    }
  }
});

test('keeps relational FPS controls coherent without inventing browser bounds', () => {
  const document = new JSDOM(html).window.document;
  SettingsContract.applyConfigContracts(document, { limits: CONFIG_LIMITS, enums: CONFIG_ENUMS });
  SettingsContract.writeNumericConfig(document, { targetFps: 24, minFps: 60, minTargetFps: 50 });
  SettingsContract.reconcileFpsControls(document);
  expect(SettingsContract.readNumericConfig(document)).toMatchObject({
    targetFps: 24,
    minFps: 24,
    minTargetFps: 24
  });
});
```

Add route tests to `webgpu-fireworks-trigger-truth.test.js` proving config GET, config POST, initial socket sync, config reset, gift-mapping mutations, and benchmark preset/restore config-update payloads all return the same `limits: CONFIG_LIMITS` and `enums: CONFIG_ENUMS` objects. Add source/behavior tests to `webgpu-fireworks-finale-settings.test.js` which reject any local `CUSTOM_STYLE_PATTERN` declaration or UUID-pattern literal in `show-style-options.js`, prove custom IDs fail closed before contract injection, accept a valid custom UUID only after injecting the backend descriptor, reject `custom:not-a-uuid`, and prove `settings-contract.js` loads before `settings.js`. Update the exact settings asset list in `webgpu-fireworks-release-alignment.test.js` to include `/plugins/webgpu-fireworks/ui/settings-contract.js` before the active settings script.

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-settings-contract.test.js test/webgpu-fireworks-trigger-truth.test.js test/webgpu-fireworks-finale-settings.test.js test/webgpu-fireworks-settings-http-truth.test.js test/webgpu-fireworks-release-alignment.test.js
```

Expected RED: the UMD settings contract is missing; `CONFIG_LIMITS` lacks most range contracts and `CONFIG_ENUMS` is absent; only five of 23 ranges are described; none of 20 selects is schema-checked; `max-particles-limit` still exposes 200-2,000; config responses omit contracts; 8,192/10,000/16,384 cannot round-trip through the real control.

**Step 2: Extend the backend-owned bounds and expose them read-only**

Extend—not replace—the backend plan's `CONFIG_LIMITS`:

```js
const CONFIG_LIMITS = Object.freeze({
  maxParticles: Object.freeze({ min: 200, max: 3000, step: 1, uiScale: 1 }),
  maxTotalParticles: Object.freeze({ min: 512, max: 16384, step: 1, uiScale: 1 }),
  targetFps: Object.freeze({ min: 24, max: 120, step: 1, uiScale: 1 }),
  minFps: Object.freeze({ min: 15, max: 60, step: 1, uiScale: 1 }),
  minTargetFps: Object.freeze({ min: 20, max: 50, step: 1, uiScale: 1 })
});
```

Use these entries in `normalizeConfig()` for all five fields. Keep the B11 normalization order: normalize `targetFps` first, then cap both minimum-FPS values to it.

Expand the same immutable object to cover all 23 shipped range inputs. Each entry owns backend-unit `min/max`, browser `step`, and a reversible `uiScale` where the UI displays seconds or percent:

| Range ID | Config field | Backend domain | Backend step | UI scale |
| --- | --- | --- | --- | --- |
| `combo-timeout` | `comboTimeout` | 1,000-60,000 ms | 1,000 | `0.001` seconds/ms |
| `combo-max` | `comboMaxMultiplier` | 1-20 | 0.5 | 1 |
| `audio-volume` | `audioVolume` | 0-1 | 0.01 | 100 percent/unit |
| `crackle-frequency` | `crackleFrequency` | 0-1 | 0.01 | 100 percent/unit |
| `crackle-volume` | `crackleVolume` | 0-1 | 0.01 | 100 percent/unit |
| `max-particles` | `maxParticles` | 200-3,000 | 1 | 1 |
| `target-fps` | `targetFps` | 24-120 | 1 | 1 |
| `min-fps` | `minFps` | 15-60 | 1 | 1 |
| `despawn-fade` | `despawnFadeDuration` | 0.25-10 seconds | 0.25 | 1 |
| `max-rockets-per-second` | `maxRocketsPerSecond` | 1-20 | 1 | 1 |
| `max-fireworks` | `maxConcurrentFireworks` | 1-20 | 1 | 1 |
| `max-particles-limit` | `maxTotalParticles` | 512-16,384 | 1 | 1 |
| `emergency-threshold` | `emergencyCleanupThreshold` | 1,024-16,384 | 1 | 1 |
| `min-target-fps` | `minTargetFps` | 20-50 | 1 | 1 |
| `avatar-chance` | `avatarParticleChance` | 0-1 | 0.01 | 100 percent/unit |
| `finale-intensity` | `goalFinaleIntensity` | 0.1-10 | 0.1 | 1 |
| `superfan-finale-intensity` | `superfanFinaleIntensity` | 1-10 | 0.5 | 1 |
| `superfan-end-card-duration` | `superfanEndCardDuration` | 1,000-10,000 ms | 500 | `0.001` seconds/ms |
| `superfan-end-card-scale` | `superfanEndCardScale` | 0.5-2 | 0.1 | 1 |
| `follower-rocket-count` | `followerRocketCount` | 1-10 | 1 | 1 |
| `follower-animation-duration` | `followerAnimationDuration` | 1,000-10,000 ms | 500 | `0.001` seconds/ms |
| `follower-animation-delay` | `followerAnimationDelay` | 0-10,000 ms | 500 | `0.001` seconds/ms |
| `follower-animation-scale` | `followerAnimationScale` | 0.5-2 | 0.1 | 1 |

Replace every corresponding literal bound in `normalizeConfig()` with this object. Boundary tests must round-trip both ends of every entry through DOM to config to `normalizeConfig()` and back; the four additional particle values 512/8,192/10,000/16,384 remain explicit named cases.

Export immutable, JSON-safe `CONFIG_ENUMS` descriptors from the existing canonical allowlists and use them in the relevant normalizers. Every descriptor has an immutable `values` array; only the two finale-style contracts also carry `dynamicPattern` and `dynamicFlags`, derived from the single existing custom-finale UUID pattern source. Do not serialize a `RegExp` object or duplicate its source in browser code. The descriptors cover all 20 settings selects:

| Select IDs | Canonical contract |
| --- | --- |
| `default-shape`, `gift-style-shape` | allowed shapes |
| `gift-style-override` | empty/inherit plus allowed visual styles |
| `color-mode` | gift/random/theme/rainbow |
| `resolution-preset`, `internal-max-resolution`, `internal-min-resolution` | their supported resolution presets |
| `orientation-select` | valid orientations |
| `gift-popup-position` | valid gift-popup positions |
| `finale-style`, `finale-length` | auto plus built-in styles and syntactically valid `custom:<uuid>` IDs; finale lengths |
| `superfan-finale-cooldown`, `superfan-finale-style`, `superfan-finale-length` | cooldown allowlist; inherit plus styles and syntactically valid `custom:<uuid>` IDs; inherited finale lengths |
| `superfan-end-card-position`, `superfan-end-card-size` | valid positions and sizes |
| `follower-animation-position`, `follower-animation-style`, `follower-animation-size`, `follower-animation-entrance` | existing follower allowlists |

In `main.js`, import the same object and define one payload helper used by every config response/emission:

```js
createConfigPayload(config = this.config) {
  return { config, limits: CONFIG_LIMITS, enums: CONFIG_ENUMS };
}
```

Use it for config GET/POST, initial socket registration, ordinary config updates, config reset, gift-mapping updates, and benchmark preset/restore delivery. No `webgpu-fireworks:config-update` event may omit either contract.

**Step 3: Implement the browser consumer without duplicated constants**

Create a UMD module which exports exactly:

```js
{
  RANGE_CONTROLS,
  ENUM_CONTROLS,
  applyConfigContracts,
  writeNumericConfig,
  readNumericConfig,
  reconcileFpsControls
}
```

`RANGE_CONTROLS` maps all 23 IDs directly to config keys; it contains no numeric min/max/step/scale values. `ENUM_CONTROLS` maps all 20 select IDs to descriptors shaped as `{ contract }`, pointing at the applicable `CONFIG_ENUMS` key. The first five critical range mappings are:

```js
const RANGE_CONTROLS = Object.freeze({
  'max-particles': 'maxParticles',
  'max-particles-limit': 'maxTotalParticles',
  'target-fps': 'targetFps',
  'min-fps': 'minFps',
  'min-target-fps': 'minTargetFps'
});
```

The remaining mappings are exactly the other rows in the 23-row table. Remove hard-coded `min`, `max`, and `step` attributes from every range input, mark all range/select controls disabled initially, and let `applyConfigContracts()` derive their UI attributes from the selected field's backend `min/max/step/uiScale`, verify every option against its `CONFIG_ENUMS` descriptor, and enable controls only after both authenticated contracts pass. A missing static value or an extra value outside the descriptor's optional dynamic pattern is a fail-closed contract error, not silently ignored. The two style selects may retain catalog-added `custom:<uuid>` options that match the backend-supplied pattern; add a regression which refreshes one valid custom show, reapplies a POST/socket contract successfully, then injects `custom:not-a-uuid` and proves fail-closed behavior. `writeNumericConfig()` multiplies by the backend contract's `uiScale`; `readNumericConfig()` divides by it, with no `||` fallbacks. `reconcileFpsControls()` sets each minimum-FPS control's effective maximum to `min(schemaMax, targetFps)` and updates the in-memory value if needed.

Remove `CUSTOM_STYLE_PATTERN` from `show-style-options.js`. Extend that UMD module with `setCustomStyleContract(descriptor)`: it accepts only the backend-delivered finale-style descriptor, compiles `dynamicPattern` plus `dynamicFlags`, and stores no literal UUID pattern of its own. The existing exported `isCustomStyleId()` must return false until a valid descriptor has been injected. In `settings.js`, only after `applyConfigContracts()` succeeds, pass the applicable `CONFIG_ENUMS` finale-style descriptor to `WebGpuFireworksShowOptions.setCustomStyleContract()` before `refreshFinaleShowSelectors()`. Repeat this ordering on GET, POST, and socket config paths; a missing or invalid descriptor keeps the controls disabled and never temporarily accepts a catalog option.

Load the module before `settings.js`. In `loadConfig()`, config POST handling, and socket updates, apply `data.limits` and `data.enums` before rendering `data.config`; block config application and keep the controls disabled if either is absent or mismatched. Replace all 23 direct range conversions and all select-domain assumptions with this module, then show the backend-returned normalized values after save. Update `webgpu-fireworks-settings-http-truth.test.js` to evaluate `settings-contract.js` before `settings.js`, provide both contracts in every GET/POST/socket mock, and add the initial-socket-before-GET race regression.

**Step 4: Run GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-settings-contract.test.js test/webgpu-fireworks-trigger-truth.test.js test/webgpu-fireworks-finale-settings.test.js test/webgpu-fireworks-settings-http-truth.test.js test/webgpu-fireworks-release-alignment.test.js
```

Expected GREEN: all 23 range min/max/step values and all 20 select domains are checked against exported schema contracts; the browser contains no second custom-style UUID pattern; custom options remain fail-closed until the backend descriptor is installed; 512, 8,192, 10,000, and 16,384 survive load/edit/save/reload; relational FPS controls display exactly what the backend accepts.

**Step 5: Commit**

```powershell
git add app/plugins/webgpu-fireworks/lib/config-schema.js app/plugins/webgpu-fireworks/main.js app/plugins/webgpu-fireworks/ui/settings-contract.js app/plugins/webgpu-fireworks/ui/settings.html app/plugins/webgpu-fireworks/ui/settings.js app/plugins/webgpu-fireworks/ui/show-style-options.js app/test/webgpu-fireworks-settings-contract.test.js app/test/webgpu-fireworks-trigger-truth.test.js app/test/webgpu-fireworks-finale-settings.test.js app/test/webgpu-fireworks-settings-http-truth.test.js app/test/webgpu-fireworks-release-alignment.test.js
git commit -m "fix(webgpu-fireworks): align settings with schema limits"
```

---

### Task 2: Make active-shape controls keyboard complete (C4)

**Depends on:** Task 1.

**Files:**

- Create: `app/plugins/webgpu-fireworks/ui/shape-controls.js`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.html`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.js`
- Modify: `app/plugins/webgpu-fireworks/locales/de.json`
- Modify: `app/plugins/webgpu-fireworks/locales/en.json`
- Modify: `app/plugins/webgpu-fireworks/locales/es.json`
- Modify: `app/plugins/webgpu-fireworks/locales/fr.json`
- Modify: `app/test/webgpu-fireworks-settings-accessibility.test.js`
- Modify: `app/test/webgpu-fireworks-i18n.test.js`
- Modify: `app/test/webgpu-fireworks-release-alignment.test.js`

**Step 1: Write RED native-control and interaction tests**

Extend `webgpu-fireworks-settings-accessibility.test.js` with a JSDOM fixture that loads the new module:

```js
const ShapeControls = require('../plugins/webgpu-fireworks/ui/shape-controls');

test('uses named native buttons with synchronized pressed state', () => {
  const document = new JSDOM(read('ui/settings.html')).window.document;
  const controls = [...document.querySelectorAll('.shape-preview')];
  expect(controls).toHaveLength(6);
  for (const control of controls) {
    expect(control.tagName).toBe('BUTTON');
    expect(control.type).toBe('button');
    expect(control.hasAttribute('aria-label')).toBe(true);
    expect(control.hasAttribute('aria-pressed')).toBe(true);
  }
});

test.each(['Enter', ' '])('toggles through the same path with %p and prevents an empty selection', key => {
  const document = new JSDOM(read('ui/settings.html')).window.document;
  const changes = [];
  const controller = ShapeControls.createShapeController({
    root: document,
    onChange: value => changes.push(value)
  });
  controller.setActive(['burst']);
  const star = document.querySelector('[data-shape="star"]');
  star.dispatchEvent(new document.defaultView.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  expect(controller.getActive()).toEqual(['burst', 'star']);
  document.querySelector('[data-shape="burst"]').click();
  star.click();
  expect(controller.getActive()).toEqual(['star']);
  expect(changes.at(-1)).toEqual(['star']);
  controller.destroy();
});
```

Add locale-parity assertions for six `plugins.webgpu-fireworks.ui.shape_controls.*` accessible names.

Extend the exact settings asset list in `webgpu-fireworks-release-alignment.test.js` with `/plugins/webgpu-fireworks/ui/shape-controls.js` before `settings.js`.

Run:

```powershell
npm test -- --runInBand test/webgpu-fireworks-settings-accessibility.test.js test/webgpu-fireworks-i18n.test.js
```

Expected RED: `.shape-preview` elements are pointer-only `DIV`s, the module is missing, `aria-pressed` is absent, and localized accessible names do not exist.

**Step 2: Implement one shape activation controller**

Replace the six shape `div`s with native buttons. Each has `type="button"`, `data-shape`, `aria-pressed`, `aria-label`, and `data-i18n-aria-label` for its localized name.

Create a UMD module exporting exactly:

```js
{
  createShapeController
}
```

The controller owns one delegated `click` and one delegated `keydown` listener. Enter and Space call `preventDefault()` and the same internal `toggle(shapeId)` used by click. It synchronizes `.active-shape` and `aria-pressed` atomically, preserves document order in `getActive()`, and refuses to deactivate the last active shape. `destroy()` removes both listeners.

In `settings.js`, replace direct `.shape-preview` click binding and class scans with one controller. `applyRemoteConfig()` calls `setActive(config.activeShapes)`, and the controller callback updates `config.activeShapes`, the visible list, and the existing save/preview path.

**Step 3: Run GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-settings-accessibility.test.js test/webgpu-fireworks-i18n.test.js test/webgpu-fireworks-finale-settings.test.js test/webgpu-fireworks-release-alignment.test.js
```

Expected GREEN: pointer, Enter, and Space share one state transition; focus/name/pressed state are correct; at least one shape always remains selected; all four plugin locales have parity.

**Step 4: Commit**

```powershell
git add app/plugins/webgpu-fireworks/ui/shape-controls.js app/plugins/webgpu-fireworks/ui/settings.html app/plugins/webgpu-fireworks/ui/settings.js app/plugins/webgpu-fireworks/locales/de.json app/plugins/webgpu-fireworks/locales/en.json app/plugins/webgpu-fireworks/locales/es.json app/plugins/webgpu-fireworks/locales/fr.json app/test/webgpu-fireworks-settings-accessibility.test.js app/test/webgpu-fireworks-i18n.test.js app/test/webgpu-fireworks-release-alignment.test.js
git commit -m "fix(webgpu-fireworks): make shape controls accessible"
```

---

### Task 3: Activate designer shell handles with Enter and Space (C5)

**Depends on:** None; execute after Task 2 to keep UI commits ordered.

**Files:**

- Modify: `app/plugins/webgpu-fireworks/ui/show-designer.js`
- Modify: `app/test/webgpu-fireworks-show-designer-ui.test.js`

**Step 1: Write the failing keyboard-equivalence regression**

Extend the existing JSDOM designer suite:

```js
test.each(['Enter', ' '])('selects a shell handle with %p exactly like click', async key => {
  const document = dom.window.document;
  document.querySelector('[data-show-id^="custom:"]').click();
  await tick();
  document.querySelector('.cue-marker[data-cue-index="0"]').click();
  const handle = document.querySelector('.shell-handle[data-shell-index="0"]');
  handle.focus();
  const event = new dom.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true
  });
  handle.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(app.store.getState().selection.shells).toEqual([
    { cueIndex: Number(handle.dataset.cueIndex), shellIndex: 0 }
  ]);
});
```

Use the suite's existing `beforeEach`, `app`, `dom`, and `tick()` setup; do not introduce a second fake app or store.

Run:

```powershell
npm test -- --runInBand test/webgpu-fireworks-show-designer-ui.test.js
```

Expected RED: handles already expose `role="button"` and `tabindex="0"`, but `onKeyDown()` handles only undo/redo; Enter and Space do not select anything and Space is not prevented.

**Step 2: Share the click selection path**

Add `selectShellHandle(handle, event)` to the existing `ShowDesignerApp` class. Move the existing `store.selectShell()` call from `onClick()` into it. Preserve Ctrl/Meta/Shift additive/toggle semantics.

At the start of `onKeyDown()`:

```js
const handle = event.target instanceof this.window.Element
  ? event.target.closest('.shell-handle')
  : null;
if (handle && (event.key === 'Enter' || event.key === ' ')) {
  event.preventDefault();
  this.selectShellHandle(handle, event);
  return;
}
```

`onClick()` calls the same method. Do not synthesize a click, begin a drag transaction, or move geometry from keyboard activation.

**Step 3: Run GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-show-designer-ui.test.js test/webgpu-fireworks-show-designer-model.test.js
```

Expected GREEN: click/Enter/Space produce identical selection state; Space cannot scroll; drag, undo/redo, save, preview, and existing ARIA-label tests remain green.

**Step 4: Commit**

```powershell
git add app/plugins/webgpu-fireworks/ui/show-designer.js app/test/webgpu-fireworks-show-designer-ui.test.js
git commit -m "fix(webgpu-fireworks): activate designer handles by keyboard"
```

---

### Task 4: Consume the semantic Boykisser palette in Furry Celebration (C6)

**Depends on:** GPU Task 6, which creates `gpu/boykisser-geometry.js` and owns all CPU/WGSL landmark geometry.

**Files:**

- Modify: `app/plugins/webgpu-fireworks/lib/built-in-shows.js`
- Modify: `app/test/webgpu-fireworks-built-in-shows.test.js`
- Modify: `app/test/webgpu-fireworks-finale-show-planner.test.js`
- Verify only: `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`

**Step 1: Write the failing composition/palette contract**

Add to `webgpu-fireworks-built-in-shows.test.js`:

```js
const { BOYKISSER_COLORS } = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

const roleHex = rgb => `#${rgb.map(component => (
  Math.round(component * 255).toString(16).padStart(2, '0')
)).join('')}`.toUpperCase();

test.each(['short', 'medium', 'long'])('uses semantic Boykisser colors and one centered hero in %s', length => {
  const plan = new FinaleShowPlanner().plan({
    style: 'furry-celebration', length, orientation: 'portrait', intensity: 5, seed: 88
  });
  const hero = plan.cues.at(-1);
  const boyLayers = hero.shells.flatMap(shell => shell.layers)
    .filter(layer => layer.glyph === 'boykisser');
  expect(boyLayers).toHaveLength(1);
  expect(boyLayers[0].colors).toEqual([
    roleHex(BOYKISSER_COLORS.HEAD),
    roleHex(BOYKISSER_COLORS.FACE),
    roleHex(BOYKISSER_COLORS.PINK)
  ]);
  expect(hero.shells[0]).toMatchObject({
    launchMode: 'airburst',
    target: { x: 0.5, y: 0.5 },
    renderHints: { depthEnabled: true }
  });
  expect(hero.shells[0].layers.some(layer => ['fox-head', 'wolf-head'].includes(layer.glyph))).toBe(false);
});
```

Add a source guard which rejects a second hand-written `BOYKISSER_COLORS` constant in `built-in-shows.js`, and retain existing assertions for Pride support accents, density, depth arc, and exact hero placement.

Run:

```powershell
npm test -- --runInBand test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-boykisser-geometry.test.js
```

Expected RED: built-in choreography still owns `['#D7DEE8', '#F8FBFF', '#FFF4D6', '#FF5C8A']` instead of the semantic HEAD/FACE/PINK source.

**Step 2: Replace the duplicate palette, not the geometry**

Import only `BOYKISSER_COLORS` from `../gpu/boykisser-geometry`. Add one local `roleColorToHex()` converter and build the immutable show palette in semantic order HEAD, FACE, PINK. `boykisserLayer()` uses that palette for every cameo and hero; Pride/trans/rainbow support layers retain their curated palettes.

Do not edit the landmark list, sampler, WGSL generator, shape ID 25, or renderer tint rule in this task. Do not replace fox/wolf support characters in earlier Furry cues; the prohibition applies to the final core Boykisser hero, not the surrounding cast.

**Step 3: Run GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-finale-v2-runtime.test.js
```

Expected GREEN: every Boykisser layer consumes the semantic palette; the final hero is one complete centered Boykisser; supporting Pride choreography and controlled depth remain intact.

**Step 4: Commit**

```powershell
git add app/plugins/webgpu-fireworks/lib/built-in-shows.js app/test/webgpu-fireworks-built-in-shows.test.js app/test/webgpu-fireworks-finale-show-planner.test.js
git commit -m "fix(webgpu-fireworks): use semantic boykisser composition"
```

---

### Task 5: Give chrysanthemum, willow, and cathedral distinct aspect-safe layouts (C2)

**Depends on:** GPU Task 4/C7, because the final matrix verifies the resulting correlated commands against current-viewport envelopes.

**Files:**

- Create: `app/test/webgpu-fireworks-finale-formation-layout.test.js`
- Modify: `app/plugins/webgpu-fireworks/lib/finale-formation-layout.js`
- Modify: `app/test/webgpu-fireworks-finale-show-planner.test.js`
- Modify: `app/test/webgpu-fireworks-built-in-shows.test.js`
- Modify: `app/test/webgpu-fireworks-finale-v2-runtime.test.js`
- Verify only: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`

**Step 1: Write RED deterministic formation tests**

Create the focused suite around the intended interface:

```js
const {
  FORMATION_MIN_SEPARATION,
  createFormationLayout
} = require('../plugins/webgpu-fireworks/lib/finale-formation-layout');
const { SpawnPlanner } = require('../plugins/webgpu-fireworks/lib/spawn-planner');

const pairDistances = layout => layout.flatMap((left, index) => (
  layout.slice(index + 1).map(right => Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y
  ))
));

test.each(['portrait', 'landscape'])('%s named formations are distinct, safe, and deterministic', orientation => {
  const bounds = new SpawnPlanner().getBounds(orientation);
  for (const formation of ['chrysanthemum', 'willow', 'cathedral']) {
    const first = createFormationLayout(formation, 5, bounds, 2026, { orientation });
    const second = createFormationLayout(formation, 5, bounds, 2026, { orientation });
    expect(first).toEqual(second);
    expect(new Set(first.map(slot => `${slot.position.x}:${slot.position.y}`))).toHaveSize(5);
    expect(Math.min(...pairDistances(first))).toBeGreaterThanOrEqual(FORMATION_MIN_SEPARATION);
    expect(first.every(slot => slot.position.x >= bounds.minX && slot.position.x <= bounds.maxX)).toBe(true);
    expect(first.every(slot => slot.position.y >= bounds.minY && slot.position.y <= bounds.maxY)).toBe(true);
    expect(first.every(slot => slot.burstDepth >= -1 && slot.burstDepth <= 1)).toBe(true);
  }
});
```

Add semantic assertions: chrysanthemum is mirror-symmetric with a crown arc and alternating depth; willow uses distinct columns with monotonic depth progression and a descending canopy; cathedral contains paired side towers plus a higher center arch/apex. Add planner regressions proving Nishiki's chrysanthemum/willow and Aurora's cathedral/willow cues no longer share one target.

Extend `webgpu-fireworks-finale-v2-runtime.test.js` with one multi-shell named-formation cue. Require all its rocket and layer events to share one runtime correlation ID whose value contains the authored `cue.id`, require their shared manifest's `correlationId` to equal that runtime ID, and keep distinct `shellId`, `envelopeCommandId`, and layer `effectId`; this consumes the duplicate-safe cue-level correlation contract implemented by GPU Task 4.

Run:

```powershell
npm test -- --runInBand test/webgpu-fireworks-finale-formation-layout.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-v2-runtime.test.js
```

Expected RED: `createFormationLayout` and the 0.06 contract are missing; the generic layout regex does not recognize chrysanthemum, willow, or cathedral, so multi-shell targets collapse at the same center.

**Step 2: Implement explicit layout slots**

Export:

```js
const FORMATION_MIN_SEPARATION = 0.06;

function createFormationLayout(formation, count, bounds, seed, options = {}) {
  // returns [{ position: { x, y }, burstDepth }]
}
```

Use deterministic normalized layouts:

- `chrysanthemum`: evenly mirrored crown slots, with center highest and alternating far/near `burstDepth`.
- `willow`: broad distinct columns, a shallow descending canopy, and far-to-near depth progression.
- `cathedral`: mirrored low side-tower slots, inner arch slots, and a higher centered apex for odd counts; even counts retain mirrored inner arches.

Scale the curved axis by the shorter standard stream dimension (`16:9` landscape, `9:16` portrait), then enforce bounds and pairwise normalized separation. If the requested count cannot satisfy 0.06 inside the safe bounds, throw `FORMATION_LAYOUT_CANNOT_FIT`; never merge or clamp two slots to one point.

Keep `createFormationPositions()` as a backward-compatible wrapper returning `.position`. In `materializeBuiltInVariantGeometry()`, call the layout once per cue, apply each position, and merge `depthEnabled: true`, `launchDepth: 0`, and its `burstDepth` into the shell's render hints for these three named formations. Preserve authored Furry render hints for all other formations.

**Step 3: Run GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-finale-formation-layout.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-v2-runtime.test.js
```

Expected GREEN: every named multi-shell cue is deterministic, distinct, symmetric/aspect-safe, at least 0.06 apart, and carries controlled depth in both orientations.

**Step 4: Commit**

```powershell
git add app/plugins/webgpu-fireworks/lib/finale-formation-layout.js app/test/webgpu-fireworks-finale-formation-layout.test.js app/test/webgpu-fireworks-finale-show-planner.test.js app/test/webgpu-fireworks-built-in-shows.test.js app/test/webgpu-fireworks-finale-v2-runtime.test.js
git commit -m "fix(webgpu-fireworks): materialize distinct finale formations"
```

---

### Task 6: Derive real visual/audio activity and retime every declared rest (C3)

**Depends on:** Task 5 and GPU Task 4/G7, so owner completion and deferred-life semantics are already stable.

**Files:**

- Create: `app/plugins/webgpu-fireworks/lib/show-activity-timeline.js`
- Create: `app/test/webgpu-fireworks-show-activity-timeline.test.js`
- Modify: `app/plugins/webgpu-fireworks/lib/built-in-shows.js`
- Modify: `app/plugins/webgpu-fireworks/lib/finale-show-planner.js`
- Modify: `app/test/webgpu-fireworks-built-in-shows.test.js`
- Modify: `app/test/webgpu-fireworks-finale-show-planner.test.js`

**Step 1: Write RED interval and quiet-window tests**

Create the intended contract test:

```js
const {
  SPLIT_LIFETIME_FACTOR,
  deriveActivityIntervals,
  findQuietWindowOverlaps,
  retimePlanForQuietWindows
} = require('../plugins/webgpu-fireworks/lib/show-activity-timeline');
const { FinaleShowPlanner } = require('../plugins/webgpu-fireworks/lib/finale-show-planner');

function makeIntervalFixture() {
  return {
    id: 'activity-fixture',
    style: 'nishiki-kamuro',
    seed: 7,
    durationMs: 5000,
    cues: [{
      id: 'activity-fixture:cue',
      beatAtMs: 2000,
      phase: 'highlight',
      shells: [{
        id: 'activity-fixture:shell',
        launchMode: 'rocket',
        target: { x: 0.5, y: 0.3 },
        renderHints: { depthEnabled: false, launchDepth: 0, burstDepth: 0, glyphScale: 1, glyphExtent: 0.11 },
        crackleEnabled: true,
        layers: [{
          id: 'activity-fixture:layer',
          primitive: 'crossette',
          delayMs: 0,
          lifetimeMs: 1000,
          split: true,
          core: true
        }]
      }]
    }]
  };
}

test('includes rocket, layer, split child, bang, crackle, and audio tails', () => {
  const plan = makeIntervalFixture();
  const intervals = deriveActivityIntervals(plan, {
    audioDurationsMs: { launch: 700, bang: 900, crackle: 1200 }
  });
  expect(new Set(intervals.map(interval => interval.kind))).toEqual(new Set([
    'rocket', 'layer', 'split-child', 'launch-audio', 'bang-audio', 'crackle-audio'
  ]));
  expect(SPLIT_LIFETIME_FACTOR).toBe(1.14);
  expect(intervals.find(interval => interval.kind === 'split-child').endMs).toBe(
    plan.cues[0].beatAtMs + Math.round(plan.cues[0].shells[0].layers[0].lifetimeMs * 1.14)
  );
});

test.each([
  ['short', 600],
  ['medium', 1000],
  ['long', 1500]
])('gives Furry %s a completely idle %i ms hero reveal', (length, gapMs) => {
  const plan = new FinaleShowPlanner().plan({
    style: 'furry-celebration', length, orientation: 'landscape', intensity: 5, seed: 88
  });
  const heroBeat = plan.cues.at(-1).beatAtMs;
  const window = plan.quietWindows.find(candidate => candidate.role === 'boykisser-reveal');
  expect(window).toEqual({ role: 'boykisser-reveal', startMs: heroBeat - gapMs, endMs: heroBeat });
  expect(findQuietWindowOverlaps(plan.activityIntervals, [window])).toEqual([]);
});
```

Add a table test for all nine built-in styles and three lengths requiring at least one opening/build/highlight/finale cue, every declared breath interval free of visual/audio overlap, ordered cues, and no cue outside total duration.

Run:

```powershell
npm test -- --runInBand test/webgpu-fireworks-show-activity-timeline.test.js test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-show-planner.test.js
```

Expected RED: no activity-timeline module exists; current tests inspect only `cue.beatAtMs`; rockets launch into rests and preceding layer/split/audio tails cross them; Furry's nominal hero gaps are shorter than their declared values once tails are counted.

**Step 2: Implement conservative activity derivation**

Export exactly:

```js
{
  DEFAULT_AUDIO_DURATIONS_MS,
  SPLIT_LIFETIME_FACTOR,
  deriveActivityIntervals,
  findQuietWindowOverlaps,
  retimePlanForQuietWindows
}
```

Set `SPLIT_LIFETIME_FACTOR = 1.14`, matching the shader's latest split point `0.68 * maxLife` plus child life `0.46 * maxLife`. Add a source-parity assertion to the test so a shader constant change requires updating this contract.

For each shell, derive:

- rocket visual and launch-audio intervals from `beatAtMs - calculateRocketFlightMs(target, renderHints)` only when `launchMode === 'rocket'`; airburst and ground shells create neither interval;
- every layer from `beatAtMs + delayMs` through its lifetime;
- a separate split-child interval through `lifetimeMs * 1.14` when `split` is true;
- bang audio from the earliest core-layer due time (or earliest layer due when no core exists), matching `buildShowPlanV2Runtime()`;
- crackle audio from exactly `bangDue + 180 ms` when enabled, capped by its runtime `maxDurationMs`;
- audio ends from injected decoded durations in runtime acceptance and conservative `DEFAULT_AUDIO_DURATIONS_MS` in deterministic planner tests.

Return sorted immutable intervals with `{ id, cueId, kind, startMs, endMs }`. Adjacent endpoints do not overlap; any positive intersection does.

**Step 3: Retain choreography while moving complete activity around rests**

`retimePlanForQuietWindows(plan, quietWindows, options)` clones the plan and operates on cue beats, not individual child events:

1. derive each cue's maximum lead and tail;
2. for a cue/activity before a window, shift the complete cue earlier until its tail is at or before `startMs`;
3. for a cue/activity after a window, shift the complete cue later until its lead starts at or after `endMs`;
4. preserve cue order, phase membership, a 50 ms ordering gap, total duration, shell offsets, formation, and seed;
5. throw `QUIET_WINDOW_CANNOT_FIT` instead of silently shrinking a rest or deleting a cue.

For all non-Furry built-ins, use the existing length preset breath. For Furry, declare the final hero reveal window relative to the authored last hero beat: 600/1,000/1,500 ms for short/medium/long. Retime the preceding false-finale activity earlier; the centered hero begins exactly at the window end.

In `FinaleShowPlanner.plan()`, retime after compilation/IDs but before return, derive the final intervals again, assert no overlap, and expose immutable `activityIntervals` and `quietWindows` on the returned plan.

**Step 4: Run GREEN**

```powershell
npm test -- --runInBand test/webgpu-fireworks-show-activity-timeline.test.js test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-finale-v2-runtime.test.js
```

Expected GREEN: every declared rest is visually and audibly empty; every Furry hero reveal is exact; phase identity, cue count, formation, seed, and show duration remain deterministic.

**Step 5: Commit**

```powershell
git add app/plugins/webgpu-fireworks/lib/show-activity-timeline.js app/plugins/webgpu-fireworks/lib/built-in-shows.js app/plugins/webgpu-fireworks/lib/finale-show-planner.js app/test/webgpu-fireworks-show-activity-timeline.test.js app/test/webgpu-fireworks-built-in-shows.test.js app/test/webgpu-fireworks-finale-show-planner.test.js
git commit -m "fix(webgpu-fireworks): derive truly quiet show rests"
```

---

### Task 7: Prove all choreography combinations against the GPU envelope (C2, C3, C6, C7)

**Depends on:** Tasks 1-6 and all GPU tasks.

**Files:**

- Create: `app/test/webgpu-fireworks-choreography-matrix.test.js`
- Create: `app/test/helpers/webgpu-fireworks-envelope-fixtures.js`
- Modify: `app/test/webgpu-fireworks-visible-envelope.test.js`
- Reuse: `app/test/helpers/webgpu-fireworks-gpu-harness.js`
- Verify only: `app/plugins/webgpu-fireworks/gpu/visible-envelope.js`
- Verify only: `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`
- Verify only: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`

**Step 1: Write the complete matrix test**

Use these exact axes:

```js
const STYLES = [
  'classic-crescendo',
  'symmetric-salute',
  'sky-ballet',
  'thunder-finale',
  'nishiki-kamuro',
  'aurora-cathedral',
  'royal-brocade',
  'phoenix-ascension',
  'furry-celebration'
];
const LENGTHS = ['short', 'medium', 'long'];
const VIEWPORTS = [
  { orientation: 'landscape', width: 1920, height: 1080 },
  { orientation: 'portrait', width: 1080, height: 1920 }
];
const INTENSITIES = [1, 5, 10];
const SEEDS = Array.from({ length: 64 }, (_, seed) => seed);
```

Assert the Cartesian product is exactly `9 * 3 * 2 * 3 * 64 = 10,368` cases.

For every case:

1. create the real `FinaleShowPlanner` plan and validate ShowPlan V2;
2. require all declared quiet windows to have zero `activityIntervals` overlap;
3. require named multi-shell target uniqueness and pairwise separation of at least 0.06;
4. build the real ShowPlan V2 runtime for the selected viewport;
5. replay its rocket/layer events through one resettable renderer from `makeRenderer(createFakeGpu())`, so production `spawnRocket()`/`spawnLayer()` produce the actual queue commands;
6. group queue entries by correlation ID and call GPU-owned `fitCorrelatedCommands(group, viewport, { paddingPx: 2 })`;
7. call `projectVisualEnvelope()` for each fitted command and require all four edges within the guard band, one shared transform per group, and `vertexClampApplied === false`;
8. recompute normalized target-center distances after fitting each multi-shell cue and require the minimum to remain at least 0.06; this proves envelope translation/scaling did not collapse the authored formation;
9. for Furry plans, first require the final plan/runtime core layer to be `{ primitive: 'glyph', glyph: 'boykisser' }`; then require the command produced by `spawnLayer()` to have queue `shape === 25`, carry the semantic HEAD/FACE/PINK palette, remain centered as a correlated composition, and include every GPU-owned required landmark at its selected density.

Create `makeExplosionCommand(commandOverrides)` by extracting the complete inline shape-command fixture from `webgpu-fireworks-visible-envelope.test.js`; alongside it, move the three existing complete builders `makeRocketVariantCommand`, `makeNamedCorrelatedEffect`, and `makeStandardRocket` into `app/test/helpers/webgpu-fireworks-envelope-fixtures.js`. Export all four builders and keep the GPU test behavior unchanged while importing them from the helper.

Do not copy `SHAPE_IDS`, `ROCKET_VARIANTS`, envelope profiles, Boykisser landmarks, or shader math into this test. Import them from the two GPU-owned production modules. After the 10,368 choreography cases, run a registry-coverage phase which calls the shared complete builders and actually materializes, fits, and projects every ID 0-26 and every rocket variant at depth -1/0/+1 in both viewports. Accumulate `fittedShapeIds` and `fittedRocketVariants` only after `projectVisualEnvelope()` passes, then require those sets to equal the production registry arrays. Merely checking that the registry arrays contain names is not sufficient.

Install the fake WebGPU globals once and create one `makeRenderer()` per viewport. Explicitly `await renderer.init()` before replay, call `setLogicalSize(width, height)`, and destroy both renderers plus restore the owned globals in `afterAll()`. Replay one complete runtime correlation group at a time: clear `renderer.spawnQueue`, resolve the runtime correlation ID from each rocket's `event.correlationId` or layer's `event.context.correlationId`, collect every event with that same ID, invoke the appropriate public spawn method for all of them, copy the complete group's queued commands once, then clear before the next group. Never group solely by the authored cue ID, which may be duplicated, and never copy/clear after an individual shell or layer. This avoids capacity/pressure carry-over without bypassing the renderer's required initialized state.

A test-local `queueRuntimeEvent(renderer, event)` must call the same public methods as `engine.js`. Rocket events call `spawnRocket()` with distinct `effectId = event.shellId`, shared `correlationId = event.correlationId`, `event.envelopeCommandId`, the shared immutable `event.correlationManifest`, pixel `origin`/`target`, preserved `normalizedOrigin`/`normalizedTarget`, render hints, `duration: event.flightDurationMs / 1000`, color, seed, style, and curve. Layer events call `spawnLayer(event.layer, event.context)`, where GPU Task 4 has preserved normalized origin/target intent, envelope membership, the shared manifest, and the same cue-level correlation ID in the context. Never fabricate packed GPU words or call `_queueSpawn()` directly.

Run:

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-choreography-matrix.test.js
```

Expected RED: before Tasks 4-6 and GPU Task 4, at least the duplicated Boykisser palette, collapsed Nishiki/Aurora targets, occupied rest intervals, and center-only top-edge admissions violate the matrix.

**Step 2: Route any integration correction back to its owning task**

Do not edit production code under Task 7. If the RED matrix reveals a production defect, return to Task 4, 5, or 6 (or the owning GPU task), add the focused RED there, implement GREEN, and include the correction in that task's narrow commit before resuming Task 7. Do not weaken padding, remove a style/seed/intensity, special-case a failing seed, replace a rocket with an airburst, clamp vertices, or recreate GPU envelope/geometry logic. The Task 7 commit must contain only the new matrix, the shared test-fixture extraction, and the behavior-preserving import change in the existing GPU envelope test.

**Step 3: Run the focused and full deterministic gates**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-settings-contract.test.js test/webgpu-fireworks-settings-accessibility.test.js test/webgpu-fireworks-settings-http-truth.test.js test/webgpu-fireworks-trigger-truth.test.js test/webgpu-fireworks-finale-settings.test.js test/webgpu-fireworks-i18n.test.js test/webgpu-fireworks-release-alignment.test.js test/webgpu-fireworks-show-designer-ui.test.js test/webgpu-fireworks-show-designer-model.test.js test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-finale-formation-layout.test.js test/webgpu-fireworks-show-activity-timeline.test.js test/webgpu-fireworks-built-in-shows.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-finale-v2-runtime.test.js test/webgpu-fireworks-visible-envelope.test.js test/webgpu-fireworks-choreography-matrix.test.js
```

Expected GREEN: all focused suites pass naturally; matrix count is 10,368; no rest overlap, collapsed target, sub-0.06 formation, missing Boykisser role/landmark, clipped full envelope, divergent correlated transform, or vertex clamp remains.

**Step 4: Commit only the test matrix and shared fixture extraction**

```powershell
git add app/test/helpers/webgpu-fireworks-envelope-fixtures.js app/test/webgpu-fireworks-visible-envelope.test.js app/test/webgpu-fireworks-choreography-matrix.test.js
git commit -m "test(webgpu-fireworks): cover choreography envelope matrix"
```

---

## C1-C7 traceability

| Contract | RED-to-GREEN owner in this plan |
| --- | --- |
| C1 UI/backend range parity and exact 8,192/10,000/extreme round-trip | Task 1 |
| C2 distinct aspect-safe chrysanthemum, willow, and cathedral formations | Task 5; exhaustive Task 7 |
| C3 rocket/layer/split/bang/crackle/audio-free rests and exact Furry gaps | Task 6; exhaustive Task 7 |
| C4 active-shape focus/name/state/Enter/Space behavior | Task 2 |
| C5 designer handle click/Enter/Space equivalence | Task 3 |
| C6 semantic Boykisser palette and centered Furry composition | Task 4; GPU geometry Task 6; exhaustive Task 7 |
| C7 complete shape/rocket/sprite/trail/glow/bloom envelopes | GPU admission Task 4; consumed without duplication by Task 7 |

## Handoff gate

From `app/`, run Task 7's full focused command, then:

```powershell
npm run build:css
npm run lint
cd ..
git diff --check
git status --short
```

Record broad lint against the starting repository baseline and allow no new touched-file finding. Confirm that `boykisser-geometry.js` and `visible-envelope.js` have one owner/source each, every companion link resolves, all seven task commits are narrow and ordered, and no pre-existing generated docs/root locale/sitemap change is staged. Then hand off to the separate release/runtime-acceptance plan; do not publish, merge, push, package, or claim live OBS completion from this plan.
