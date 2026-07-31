# Stream Monsters Bounded Arena Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a selectable Split Arena portrait presentation, retain and repair Classic, and keep every Stream Monsters surface inside the approved violet arena except the egg shelf and one short egg lifecycle notice.

**Architecture:** Keep viewport layout (`portrait`/`landscape`) separate from arena presentation (`split-arena`/`classic`). Persist the new presentation setting through the existing Stream Monsters configuration and snapshot pipeline, render all portrait-owned content inside one clipped arena wrapper, and place the two permitted egg surfaces in a separate lower exception grid. Reuse the existing battle engine, ArenaView phases, effects renderer, and event queue; only presentation data, measured effect coordinates, DOM structure, and portrait styles change.

**Tech Stack:** CommonJS and browser-compatible vanilla JavaScript, static HTML/CSS, JSON locales, Jest/JSDOM, Playwright Chromium, existing LTTH plugin APIs and the bundled Node 22.14.0 runtime.

## Global Constraints

- Violet arena: x `2%–98%`, y `11.8%–57.8%`.
- Likebar exclusion: x `2%–98%`, y `57.8%–74%`; no Stream Monsters pixel or visible rectangle may enter it.
- Lower exception lane: x `3%–97%`, y `74%–98%`; only the egg shelf and one short egg lifecycle notification may enter it.
- Geometry tolerance is at most one CSS pixel at `324×581`, `477×829`, and `1080×1920`.
- `split-arena` and `classic` are arena variants, never viewport layouts or battle rules.
- Fresh setups with no stored `streamMonsters` object use `split-arena`.
- Existing stored `streamMonsters` objects with a missing, non-string, or unknown variant migrate once to `classic`; explicit valid values persist unchanged.
- Choice secrecy is unchanged: the first fighter's choice remains sealed and both choices reveal together.
- Portrait attack text is exactly one line in the form `KEY · SKILL NAME · DECISIVE METRIC`; no actor, description, feed copy, narrative sentence, or second metric is visible.
- Portrait results show only winner or draw, owner, ending round, and one decisive value.
- Arena entry is `320–420 ms`; choice pulse is `900 ms`; sealed lock flash is `180 ms`; attack anticipation is `100–140 ms`, dash `140–190 ms`, hit-stop `60–80 ms`, and recoil/burst `240–320 ms`; result pop is `380–460 ms` with a clipped `600–800 ms` particle burst.
- `prefers-reduced-motion` removes dash, shake, hit-stop, repeated pulses, and long particles while preserving phase changes.
- Landscape DOM behavior and layout remain unchanged.
- Do not change matching, damage, choices, timers, commands, database tables, public gameplay APIs, monster assets, or event-queue ordering.
- Use 2-space indentation, existing CommonJS/Jest conventions, backend logging through the existing logger, and plugin data outside the plugin directory.
- Preserve unrelated dirty and untracked files. Never stage `.superpowers/brainstorm/` or `docs/superpowers/plans/2026-07-30-streammonsters-portrait-overlay.md`.
- No GitHub push, deployment, whole-app restart, Node restart, launcher restart, OBS restart, or unrelated plugin reload.
- After the reviewed branch is integrated into local `main`, reload only `streamalchemy`; the user performs the stream-visible acceptance test.

---

## File Structure

- `app/plugins/streamalchemy/product-contract.json`: authoritative fresh-install variant default.
- `app/plugins/streamalchemy/index.js`: raw-config presence detection, migration, normalization, persistence, and presentation-service wiring.
- `app/plugins/streamalchemy/backend/streammonsters/routes.js`: admin validation, partial-update sanitization, and public snapshot projection.
- `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`: presentation-only variant in battle/reconnect snapshots.
- `app/plugins/streamalchemy/streammonsters-creator-runtime.js`: accepted UI values, payload preservation, and preview geometry.
- `app/plugins/streamalchemy/streammonsters-ui.html`: Overlay Studio selector, live preview, save/hydration wiring.
- `app/plugins/streamalchemy/locales/{de,en,es,fr}.json`: localized selector and preview copy.
- `app/plugins/streamalchemy/streammonsters-portrait-arena.js`: browser/CommonJS geometry, variant, and measured-rectangle helpers.
- `app/plugins/streamalchemy/streammonsters-overlay.html`: clipped arena wrapper, lower exception grid, variant CSS, phase bands, lifecycle notice, and snapshot dataset.
- `app/plugins/streamalchemy/streammonsters-arena-view.js`: measured fighter VFX origins and compact presentation attributes without battle-rule changes.
- `app/test/browser-fixtures/streammonsters-portrait-arena-acceptance.html`: actual-overlay visual state harness.
- `app/test/streammonsters-portrait-arena-visual.browser.js`: Playwright geometry, overlap, clipping, text, renderer, and reduced-motion matrix.
- Existing focused Jest files listed per task: regression coverage at each boundary.

### Task 1: Persist and project the arena variant without changing battle behavior

**Files:**
- Modify: `app/plugins/streamalchemy/product-contract.json`
- Modify: `app/plugins/streamalchemy/index.js:51-56, 223-239, 374-455, 553-578, 738-869`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js:180-253, 1374-1458, 1724-1775, 1949-2017`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js:120-220, 3304-3347`
- Modify: `scripts/plugin-guides/streamalchemy.js` through the product sync script
- Test: `app/test/streammonsters-config-v111.test.js`
- Test: `app/test/streammonsters-product-contract.test.js`
- Test: `app/test/streammonsters-creator-retention-v6.test.js`

**Interfaces:**
- Produces: `streamMonsters.portraitArenaVariant: 'split-arena' | 'classic'`.
- Produces: `normalizePortraitArenaVariant(value, fallback)` in the plugin and routes.
- Produces: `portraitArenaVariant` in `publicConfig()` and `BattleMatchService.getPublicSnapshot()`.
- Preserves: `portraitBattleMode: 'takeover-74'`, every battle transition, and partial-update merge semantics.

- [ ] **Step 1: Add failing migration and API tests**

Add focused assertions equivalent to:

```js
expect(plugin.loadConfig({}).streamMonsters.portraitArenaVariant)
  .toBe('split-arena');
expect(plugin.loadConfig({ streamMonsters: {} }).streamMonsters.portraitArenaVariant)
  .toBe('classic');
expect(plugin.loadConfig({
  streamMonsters: { portraitArenaVariant: 'unknown' }
}).streamMonsters.portraitArenaVariant).toBe('classic');
expect(plugin.loadConfig({
  streamMonsters: { portraitArenaVariant: 'split-arena' }
}).streamMonsters.portraitArenaVariant).toBe('split-arena');
expect(plugin.loadConfig({
  streamMonsters: { portraitArenaVariant: 'classic' }
}).streamMonsters.portraitArenaVariant).toBe('classic');
```

Extend `createConfigRouteSubject()` coverage so:

```js
const postConfig = async body => {
  const result = response();
  await subject.find('POST', '/api/streammonsters/config')(
    localRequest(body),
    result
  );
  return result;
};

let result = await postConfig({ portraitArenaVariant: 'split-arena' });
expect(result.statusCode).toBe(200);
expect(subject.persisted().streamMonsters.portraitArenaVariant)
  .toBe('split-arena');

result = await postConfig({ notificationDurationMs: 10_000 });
expect(result.statusCode).toBe(200);
expect(subject.persisted().streamMonsters.portraitArenaVariant)
  .toBe('split-arena');

result = await postConfig({ portraitArenaVariant: 'classic' });
expect(result.statusCode).toBe(200);
expect(result.payload.config.portraitArenaVariant).toBe('classic');
expect(subject.routes.publicConfig(subject.plugin.config.streamMonsters)
  .portraitArenaVariant).toBe('classic');
```

Reject `wide`, `null`, `true`, and `false` as explicit API values with:

```js
{ success: false, error: 'STREAM_MONSTERS_PORTRAIT_ARENA_VARIANT_INVALID' }
```

Verify `persistSanitizedConfigIfNeeded()` writes a missing/invalid existing-object value as `classic` once and returns `false` against the already-migrated persisted object.

- [ ] **Step 2: Run the configuration tests to prove RED**

Run from the feature worktree's `app/`:

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-config-v111.test.js `
  test\streammonsters-product-contract.test.js `
  test\streammonsters-creator-retention-v6.test.js
```

Expected: the new assertions fail because no arena variant exists in stored config, API responses, or battle snapshots.

- [ ] **Step 3: Add the fresh default and raw-presence migration**

Add to `product-contract.json`:

```json
"portraitArenaVariant": "split-arena"
```

In `index.js`, define:

```js
const PORTRAIT_ARENA_VARIANTS = Object.freeze(['split-arena', 'classic']);
const DEFAULT_PORTRAIT_ARENA_VARIANT =
  PRODUCT_CONTRACT.defaults.portraitArenaVariant;
const LEGACY_PORTRAIT_ARENA_VARIANT = 'classic';
```

At the start of `loadConfig(storedConfig)`, preserve raw object presence before sanitization:

```js
const rawStoredStreamMonsters = (
  storedConfig &&
  typeof storedConfig === 'object' &&
  !Array.isArray(storedConfig) &&
  storedConfig.streamMonsters &&
  typeof storedConfig.streamMonsters === 'object' &&
  !Array.isArray(storedConfig.streamMonsters)
) ? storedConfig.streamMonsters : null;
const storedArenaVariant = rawStoredStreamMonsters
  ? this.normalizePortraitArenaVariant(
      rawStoredStreamMonsters.portraitArenaVariant,
      LEGACY_PORTRAIT_ARENA_VARIANT
    )
  : DEFAULT_PORTRAIT_ARENA_VARIANT;
```

Add:

```js
normalizePortraitArenaVariant(value, fallback = LEGACY_PORTRAIT_ARENA_VARIANT) {
  return PORTRAIT_ARENA_VARIANTS.includes(value) ? value : fallback;
}
```

Place `portraitArenaVariant: storedArenaVariant` after `...storedStreamMonsters` in the returned canonical object. In `updateConfig()`, normalize the merged value with the current valid value as fallback so an omitted field never resets it.

- [ ] **Step 4: Carry the value through battle and route snapshots**

In `BattleMatchService`, accept, normalize, update, and return the field beside `portraitBattleMode`:

```js
this.portraitArenaVariant = ['split-arena', 'classic'].includes(
  portraitArenaVariant
) ? portraitArenaVariant : 'classic';
```

Extend both service construction and `setPresentationConfig()` calls in `index.js`.

In `routes.js`, add:

```js
normalizePortraitArenaVariant(value) {
  return ['split-arena', 'classic'].includes(value) ? value : 'classic';
}
```

Validate only when the key is supplied:

```js
if (
  Object.prototype.hasOwnProperty.call(input, 'portraitArenaVariant') &&
  !['split-arena', 'classic'].includes(input.portraitArenaVariant)
) {
  throw new Error('STREAM_MONSTERS_PORTRAIT_ARENA_VARIANT_INVALID');
}
```

Copy only valid explicit updates in `sanitizeConfigUpdate()`, and include the normalized current value in `publicConfig()` and every fallback battle snapshot.

- [ ] **Step 5: Synchronize the product projection and inspect scope**

Run:

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location $feature
& $node scripts\sync-streammonsters-product.js
git diff -- app/plugins/streamalchemy/product-contract.json `
  scripts/plugin-guides/streamalchemy.js `
  app/plugins/streamalchemy/plugin.json `
  plugin-store.json `
  streammonsters/index.html `
  js/streammonsters-guide.js `
  app/CHANGELOG.md
```

Expected: synchronized projections contain the added default without changing versions, access, pricing, rules, public copy, or website layout. Revert no user files; if the script reports an unrelated projection change, leave it unstaged and record it in the task report.

- [ ] **Step 6: Run Task 1 tests to prove GREEN**

Run:

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-config-v111.test.js `
  test\streammonsters-product-contract.test.js `
  test\streammonsters-creator-retention-v6.test.js
```

Expected: all three suites pass and the one-time migration is idempotent.

- [ ] **Step 7: Commit the data-contract slice**

Stage only the files changed by this task and commit:

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
Set-Location $feature
git add -- `
  app/plugins/streamalchemy/product-contract.json `
  app/plugins/streamalchemy/index.js `
  app/plugins/streamalchemy/backend/streammonsters/routes.js `
  app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js `
  scripts/plugin-guides/streamalchemy.js `
  app/test/streammonsters-config-v111.test.js `
  app/test/streammonsters-product-contract.test.js `
  app/test/streammonsters-creator-retention-v6.test.js
git diff --cached --check
git commit -m "feat(streammonsters): persist portrait arena variant"
```

Do not stage other product projections unless the sync command changed them solely because it inserted `portraitArenaVariant` into an existing structured defaults projection.

### Task 2: Add the localized Overlay Studio selector and truthful preview

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-creator-runtime.js:17-31, 103-112, 185-250, 514-560, 759-794`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html:160-176, 532-610, 1494-1545, 1594-1626`
- Modify: `app/plugins/streamalchemy/locales/de.json`
- Modify: `app/plugins/streamalchemy/locales/en.json`
- Modify: `app/plugins/streamalchemy/locales/es.json`
- Modify: `app/plugins/streamalchemy/locales/fr.json`
- Test: `app/test/streammonsters-creator-runtime.test.js`
- Test: `app/test/streammonsters-creator-ui.test.js`
- Test: `app/test/streammonsters-creator-ui-v15.test.js`

**Interfaces:**
- Consumes: canonical `state.config.portraitArenaVariant` from Task 1.
- Produces: `PORTRAIT_ARENA_VARIANTS`, a selector with id `portraitArenaVariant`, and `#portraitBattlePreview[data-arena-variant]`.
- Preserves: the separate `portraitBattleMode` selector and the fixed 74/26 OBS profile.

- [ ] **Step 1: Add failing runtime and markup tests**

Assert:

```js
expect(PORTRAIT_ARENA_VARIANTS).toEqual(['split-arena', 'classic']);
expect(buildConfigPayload({
  currentConfig: { portraitArenaVariant: 'classic' },
  values: { portraitArenaVariant: 'split-arena' }
}).portraitArenaVariant).toBe('split-arena');
expect(buildConfigPayload({
  currentConfig: { portraitArenaVariant: 'classic' },
  values: {}
}).portraitArenaVariant).toBe('classic');
```

Parse the real UI and verify the selector is inside `#overlay-studio`, has exactly the two accepted option values, references a help element, and the preview owns `data-arena-variant`. For every locale, assert nonempty strings for:

```text
portraitArenaVariant
portraitArenaVariantSplitArena
portraitArenaVariantClassic
portraitArenaVariantHelp
portraitArenaVariantPreviewSplit
portraitArenaVariantPreviewClassic
```

- [ ] **Step 2: Run the Creator tests to prove RED**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-creator-runtime.test.js `
  test\streammonsters-creator-ui.test.js `
  test\streammonsters-creator-ui-v15.test.js
```

Expected: failures identify the missing enum, selector, preview state, payload field, and locale keys.

- [ ] **Step 3: Add payload preservation and approved preview geometry**

Add:

```js
const PORTRAIT_ARENA_VARIANTS = Object.freeze(['split-arena', 'classic']);
```

In `buildConfigPayload()` resolve:

```js
const requestedArenaVariant = PORTRAIT_ARENA_VARIANTS.includes(
  values.portraitArenaVariant
) ? values.portraitArenaVariant : currentConfig.portraitArenaVariant;
```

Include `portraitArenaVariant` only when the resolved value is accepted. Export the enum.

Replace portrait preview zones with the approved composition while leaving the 74/26 profile metadata intact:

```js
arena: Object.freeze({ x: 2, y: 11.8, width: 96, height: 46 }),
likebar: Object.freeze({ x: 2, y: 57.8, width: 96, height: 16.2 }),
shelf: Object.freeze({ x: 3, y: 74, width: 94, height: 24 }),
safe: Object.freeze({ x: 0, y: 98, width: 100, height: 2 })
```

The preview labels the Likebar as external/reserved; it does not imply Stream Monsters controls it.

- [ ] **Step 4: Add selector, live preview state, and translations**

Place this control inside Overlay Studio:

```html
<label>
  <span data-i18n="plugins.streamalchemy.ui.monsters.portraitArenaVariant">
    Portrait arena variant
  </span>
  <select id="portraitArenaVariant" aria-describedby="portraitArenaVariantHelp">
    <option value="split-arena"
      data-i18n="plugins.streamalchemy.ui.monsters.portraitArenaVariantSplitArena">
      Split Arena
    </option>
    <option value="classic"
      data-i18n="plugins.streamalchemy.ui.monsters.portraitArenaVariantClassic">
      Classic
    </option>
  </select>
</label>
<output id="portraitArenaVariantHelp" class="control-help"
  data-i18n="plugins.streamalchemy.ui.monsters.portraitArenaVariantHelp"></output>
```

Set `portraitBattlePreview.dataset.arenaVariant` on initial state and `change`. Update its compact mock fighter/choice arrangement through CSS selectors for the two values; never change `safeZoneLayout`.

Pass the selected value to `buildConfigPayload()` in `saveSetup()`. Hydrate it from `state.config.portraitArenaVariant`, falling back to `classic` only for malformed transport state.

Add accurate German, English, Spanish, and French translations; each option remains recognizable as `Split Arena` or `Classic`.

- [ ] **Step 5: Run the Creator tests to prove GREEN**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-creator-runtime.test.js `
  test\streammonsters-creator-ui.test.js `
  test\streammonsters-creator-ui-v15.test.js
```

Expected: all tests pass, UI saves and reloads each selection, and preview geometry matches the approved frame.

- [ ] **Step 6: Commit the Creator slice**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
Set-Location $feature
git add -- `
  app/plugins/streamalchemy/streammonsters-creator-runtime.js `
  app/plugins/streamalchemy/streammonsters-ui.html `
  app/plugins/streamalchemy/locales/de.json `
  app/plugins/streamalchemy/locales/en.json `
  app/plugins/streamalchemy/locales/es.json `
  app/plugins/streamalchemy/locales/fr.json `
  app/test/streammonsters-creator-runtime.test.js `
  app/test/streammonsters-creator-ui.test.js `
  app/test/streammonsters-creator-ui-v15.test.js
git diff --cached --check
git commit -m "feat(streammonsters): add portrait arena selector"
```

### Task 3: Build the clipped arena and lower exception grid

**Files:**
- Create: `app/plugins/streamalchemy/streammonsters-portrait-arena.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html:8-17, 294-340, 1082-1332, 1362-1640, 1642-1651, 2502-2559, 2582-2643`
- Test: `app/test/streammonsters-portrait-arena.test.js`
- Test: `app/test/streammonsters-egg-shelf-portrait-reliability.test.js`
- Test: `app/test/streammonsters-egg-overlay-state-reliability.test.js`
- Test: `app/test/streammonsters-overlay-layout-queue.test.js`
- Test: `app/test/streammonsters-overlay-reconnect-v15.test.js`

**Interfaces:**
- Produces: `window.StreamMonstersPortraitArena` and CommonJS exports `ARENA_VARIANTS`, `PORTRAIT_GEOMETRY`, `normalizeVariant`, `viewportZones`, and `normalizedRectCenter`.
- Produces: `#portrait-arena[data-arena-variant]` as the sole clipped portrait stage.
- Produces: `#portrait-exception-lane`, `#egg-shelf`, and `#egg-lifecycle-notice` as the only lower surfaces.
- Consumes: `config.portraitArenaVariant`, then `battle.portraitArenaVariant` as reconnect fallback.

- [ ] **Step 1: Add failing pure geometry, DOM, snapshot, and lifecycle tests**

For all three viewports, assert:

```js
const referenceArena = viewportZones(324, 581).arena;
expect(referenceArena.left).toBeCloseTo(6.48, 2);
expect(referenceArena.top).toBeCloseTo(68.558, 2);
expect(referenceArena.right).toBeCloseTo(317.52, 2);
expect(referenceArena.bottom).toBeCloseTo(335.818, 2);
```

Repeat for `477×829` and `1080×1920`, including Likebar and exception boundaries. Assert `normalizeVariant('split-arena')`, `normalizeVariant('classic')`, and corrupt transport fallback `classic`.

Parse the real overlay and assert all stage-owned nodes are descendants of `#portrait-arena`, while `#egg-shelf` and `#egg-lifecycle-notice` are descendants of `#portrait-exception-lane` and not descendants of the arena.

In reconnect/state harnesses, apply:

```js
{ config: { portraitArenaVariant: 'split-arena' }, battle: { matches: [] } }
```

and assert `#portrait-arena.dataset.arenaVariant === 'split-arena'`. Repeat with only `battle.portraitArenaVariant: 'classic'`, then malformed values resolving to `classic`.

Exercise a portrait lifecycle event and assert the lower notice has at most two visible child lines, never invokes the full card, and hides after the supplied existing duration. Exercise landscape and assert it still uses the existing full lifecycle card.

- [ ] **Step 2: Run the five focused suites to prove RED**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-portrait-arena.test.js `
  test\streammonsters-egg-shelf-portrait-reliability.test.js `
  test\streammonsters-egg-overlay-state-reliability.test.js `
  test\streammonsters-overlay-layout-queue.test.js `
  test\streammonsters-overlay-reconnect-v15.test.js
```

Expected: the new module, wrappers, dataset, geometry contract, and compact lifecycle notice are absent.

- [ ] **Step 3: Implement the pure arena helper**

Create a UMD module whose geometry source is:

```js
const ARENA_VARIANTS = Object.freeze(['split-arena', 'classic']);
const PORTRAIT_GEOMETRY = Object.freeze({
  arena: Object.freeze({ left:0.02, top:0.118, right:0.98, bottom:0.578 }),
  likebar: Object.freeze({ left:0.02, top:0.578, right:0.98, bottom:0.74 }),
  exception: Object.freeze({ left:0.03, top:0.74, right:0.97, bottom:0.98 })
});
```

`viewportZones(width, height)` multiplies these normalized values without rounding. `normalizeVariant(value, fallback = 'classic')` accepts only the two values. `normalizedRectCenter(rect, containerRect)` returns `null` for zero/invalid geometry; otherwise it returns a center point relative to the container, clamped to `[0,1]`.

- [ ] **Step 4: Restructure the actual overlay DOM**

Inside `<main id="streammonsters-overlay">`, create:

```html
<section id="portrait-arena" data-arena-variant="classic">
  <!-- effects canvas, choreography, brand, hype, toast, reveal stage,
       battle, stat card, chat detail and chat card -->
</section>
<section id="portrait-exception-lane">
  <div id="egg-lifecycle-notice" role="status" aria-live="polite" hidden>
    <strong data-egg-notice-title></strong>
    <span data-egg-notice-action></span>
  </div>
  <!-- existing egg shelf -->
</section>
```

Keep IDs and internal battle/card markup unchanged. Load `streammonsters-portrait-arena.js` before the effects renderer and ArenaView scripts.

Landscape keeps `#portrait-arena` full viewport with visible overflow and preserves existing fixed descendants. Portrait uses:

```css
:root {
  --portrait-arena-left:2%;
  --portrait-arena-top:11.8%;
  --portrait-arena-right:2%;
  --portrait-arena-bottom:42.2%;
  --portrait-exception-top:74%;
  --portrait-exception-right:3%;
  --portrait-exception-bottom:2%;
  --portrait-exception-left:3%;
}
#portrait-arena {
  position:fixed;
  inset:var(--portrait-arena-top) var(--portrait-arena-right)
    var(--portrait-arena-bottom) var(--portrait-arena-left);
  overflow:clip;
  contain:paint;
  isolation:isolate;
}
#portrait-exception-lane {
  position:fixed;
  inset:var(--portrait-exception-top) var(--portrait-exception-right)
    var(--portrait-exception-bottom) var(--portrait-exception-left);
  display:grid;
  grid-template-rows:auto minmax(0,1fr);
  gap:clamp(3px,.7vh,8px);
  overflow:clip;
}
```

Override stage children to absolute positioning inside the arena in portrait. `#battle` becomes `inset:0`, keeps `overflow:hidden`, and remains the battle VFX clip. The brand becomes a small in-arena badge. No visible element is positioned in `57.8%–74%`.

Keep the egg shelf visible during battle, but keep the existing event-queue ordering and critical-event deduplication unchanged.

- [ ] **Step 5: Implement the compact portrait lifecycle notice**

Add `isPortraitViewport()` based on `matchMedia('(orientation: portrait)')`. In portrait, `showEggLifecycleNotice()` fills exactly the title and one command/action line in `#egg-lifecycle-notice`, removes `hidden`, waits the existing `notice.durationMs`, then hides and clears it. In landscape, call the existing `showCriticalCard()` path unchanged.

CSS limits both children to one line with ellipsis; the container has a two-line maximum and occupies only its grid row. The shelf occupies the second row and uses compact typography at `max-height:900px`.

- [ ] **Step 6: Hydrate the variant before ArenaView**

At the start of `applySnapshot(data)`:

```js
const transportedArenaVariant =
  data?.config?.portraitArenaVariant ??
  data?.battle?.portraitArenaVariant;
node('portrait-arena').dataset.arenaVariant =
  window.StreamMonstersPortraitArena.normalizeVariant(
    transportedArenaVariant,
    'classic'
  );
```

This assignment occurs before `arenaView.applySnapshot(...)`.

- [ ] **Step 7: Run Task 3 tests to prove GREEN**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-portrait-arena.test.js `
  test\streammonsters-egg-shelf-portrait-reliability.test.js `
  test\streammonsters-egg-overlay-state-reliability.test.js `
  test\streammonsters-overlay-layout-queue.test.js `
  test\streammonsters-overlay-reconnect-v15.test.js
```

Expected: all stage nodes clip through one container, the Likebar band is empty, both lower surfaces share a non-overlapping grid, snapshot selection is stable, landscape is unchanged, and queue/reconnect tests remain green.

- [ ] **Step 8: Commit the geometry slice**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
Set-Location $feature
git add -- `
  app/plugins/streamalchemy/streammonsters-portrait-arena.js `
  app/plugins/streamalchemy/streammonsters-overlay.html `
  app/test/streammonsters-portrait-arena.test.js `
  app/test/streammonsters-egg-shelf-portrait-reliability.test.js `
  app/test/streammonsters-egg-overlay-state-reliability.test.js `
  app/test/streammonsters-overlay-layout-queue.test.js `
  app/test/streammonsters-overlay-reconnect-v15.test.js
git diff --cached --check
git commit -m "feat(streammonsters): bound portrait arena surfaces"
```

### Task 4: Implement Split Arena phase bands, compact combat, and measured VFX

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html:341-680, 1082-1332`
- Modify: `app/plugins/streamalchemy/streammonsters-arena-view.js:1-12, 652-702, 1197-1229, 1373-1457, 1469-1630, 2030-2179`
- Modify: `app/plugins/streamalchemy/locales/de.json`
- Modify: `app/plugins/streamalchemy/locales/en.json`
- Modify: `app/plugins/streamalchemy/locales/es.json`
- Modify: `app/plugins/streamalchemy/locales/fr.json`
- Test: `app/test/streammonsters-arena-view-v15.test.js`
- Test: `app/test/streammonsters-effects-renderer.test.js`
- Test: `app/test/streammonsters-effects-signatures-v111.test.js`
- Test: `app/test/streammonsters-arcade-overlay-v6.test.js`

**Interfaces:**
- Consumes: Task 3 `StreamMonstersPortraitArena.normalizedRectCenter()`.
- Produces: `effectOriginsForSlots(actorSlot, targetSlot)` payload fields `origin` and `targetOrigin`.
- Produces: `decisiveActionMetric(action)` and `#arena-action-compact-metric`.
- Produces: portrait CSS branches for `#portrait-arena[data-arena-variant="split-arena"]` and `"classic"`.
- Preserves: ArenaView events, timelines, sealed-choice data, localized full landscape copy, combat reports, and renderer fallback behavior.

- [ ] **Step 1: Add failing phase, text, result, motion, and origin tests**

For Split Arena and Classic, assert portrait rules reserve:

```text
status: 4%–13%
HUD: 15%–28%
fighter field: 27%–78%
decision/action rail: 79%–97%
```

Apply a choice phase and verify the two decks each show one horizontal `A/B/C` row with short names, no description, and no early sealed choice. Lock only fighter 1 and assert neither its key nor skill name appears in `data-choice`, text, or accessible label. Reveal both and assert both keys appear together.

Apply an action with multiple outcomes and assert visible portrait content is:

```text
C · MOONFALL · −7 HP
```

with exactly one `[data-action-metric]`, no actor, no description, no feed, `white-space: nowrap`, and no second metric. Landscape still contains all localized metric spans and description copy.

Complete a battle and assert portrait exposes winner/draw, owner, ending round, and remaining HP only; ratings, report, next hint, and feed are hidden.

Stub nonzero arena and fighter image rectangles, trigger an effect beat, and assert the effects call contains normalized `origin` and `targetOrigin` equal to the measured image centers. Stub zero rectangles and assert the payload omits both so the renderer's slot fallback remains active.

- [ ] **Step 2: Run the four suites to prove RED**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-arena-view-v15.test.js `
  test\streammonsters-effects-renderer.test.js `
  test\streammonsters-effects-signatures-v111.test.js `
  test\streammonsters-arcade-overlay-v6.test.js
```

Expected: variant-specific bands and measured origins do not exist, and the current compact portrait row does not satisfy the exact approved format at the smallest geometry.

- [ ] **Step 3: Implement Split Arena and repaired Classic CSS**

Within portrait media only:

- Split Arena places topline in `4%–13%`, two compact fighter HUDs in `15%–28%`, sprites in `27%–78%`, and choice/action content in `79%–97%`.
- Split choice decks use three equal columns per fighter, one row, ellipsized short names, hidden owner duplicates, hidden copy, and no charge prose.
- Split action hides `#arena-action-player`, `#arena-action-copy`, and `#arena-feed`; it lays out key, skill, and first metric in one nowrap row.
- Split completed hides fighters, topline, choice, action, feed, reports, ratings, and next hint; it centers the compact result card.
- Classic retains the recognizable larger fighter styling, but uses the same non-overlapping bands, one-line action, and compact result limits.
- Both variants keep `#battle-effects-canvas` below HUD/action/result text.

Use explicit grid/area ownership rather than independent offsets as the only collision control.

- [ ] **Step 4: Implement the exact compact action contract**

Keep `actionMetrics()` as the localized landscape source. Add a dedicated `decisiveActionMetric(action)` that selects, in this order:

```text
damage: −{amount} HP
shield gain: +{amount} SHIELD
healing/lifesteal: +{amount} HP
shield absorbed: {amount} BLOCK
evade: existing localized evade label
status effect: localized STATUS / ESTADO / STATUT label
no state change: 0 HP
```

Add `<span id="arena-action-compact-metric"></span>` beside the existing metrics element. Populate it from `decisiveActionMetric(action)`, hide it in landscape, and show only it in portrait. Keep all full metrics in `#arena-action-metrics` for landscape.

Give `#arena-action-card` a portrait-only accessible label assembled from:

```js
[
  String(action.choice || '').toUpperCase(),
  skillName,
  decisiveActionMetric(action)
].filter(Boolean).join(' · ')
```

Add localized `arenaStatusMetric` values to all four plugin locale files. The visible portrait DOM is the existing key, skill, and new compact metric; actor, copy, and full metrics remain populated for landscape but hidden in portrait. Do not insert the string into `#arena-feed`.

- [ ] **Step 5: Measure VFX origins at the effect boundary**

Extend the ArenaView UMD dependency list with `streammonsters-portrait-arena`. Immediately before `fire(effectOutput, ...)`, measure `#arena-image-{slot}` against `#battle`:

```js
function effectOriginsForSlots(actorSlot, targetSlot) {
  const arenaRect = arena?.getBoundingClientRect?.();
  const origin = PortraitArena.normalizedRectCenter(
    node(`arena-image-${actorSlot}`)?.getBoundingClientRect?.(),
    arenaRect
  );
  const targetOrigin = PortraitArena.normalizedRectCenter(
    node(`arena-image-${targetSlot}`)?.getBoundingClientRect?.(),
    arenaRect
  );
  return {
    ...(origin ? { origin } : {}),
    ...(targetOrigin ? { targetOrigin } : {})
  };
}
```

Spread the result after actor/target slots so measured positions win when valid. Do not modify renderer recipes, WebGPU shaders, Canvas particle math, or CSS fallback variables.

- [ ] **Step 6: Apply bounded esports motion and reduced motion**

Set portrait variant animation values inside the approved ranges:

```css
--arena-entry-ms:380ms;
--arena-lock-ms:180ms;
--arena-anticipation-ms:120ms;
--arena-dash-ms:170ms;
--arena-hit-stop-ms:70ms;
--arena-recoil-ms:280ms;
--arena-result-ms:420ms;
--arena-result-particles-ms:720ms;
```

Animate the arena contents, never its clipping boundary. Reuse `telegraphing`, `advancing`, `hit`, `camera-impulse`, `hit-stop`, `winner`, and existing effects scenes. Add reduced-motion rules that remove translations, shake, pause, repeated pulse, and long particles while leaving immediate opacity/data-phase changes.

- [ ] **Step 7: Run Task 4 tests to prove GREEN**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-arena-view-v15.test.js `
  test\streammonsters-effects-renderer.test.js `
  test\streammonsters-effects-signatures-v111.test.js `
  test\streammonsters-arcade-overlay-v6.test.js
```

Expected: all four suites pass, sealed choices remain private, both variants meet the information contract, and renderer fallbacks still receive valid normalized positions.

- [ ] **Step 8: Commit the battle-presentation slice**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
Set-Location $feature
git add -- `
  app/plugins/streamalchemy/streammonsters-overlay.html `
  app/plugins/streamalchemy/streammonsters-arena-view.js `
  app/plugins/streamalchemy/locales/de.json `
  app/plugins/streamalchemy/locales/en.json `
  app/plugins/streamalchemy/locales/es.json `
  app/plugins/streamalchemy/locales/fr.json `
  app/test/streammonsters-arena-view-v15.test.js `
  app/test/streammonsters-effects-renderer.test.js `
  app/test/streammonsters-effects-signatures-v111.test.js `
  app/test/streammonsters-arcade-overlay-v6.test.js
git diff --cached --check
git commit -m "feat(streammonsters): animate bounded arena variants"
```

### Task 5: Prove real-browser geometry and renderer clipping

**Files:**
- Create: `app/test/browser-fixtures/streammonsters-portrait-arena-acceptance.html`
- Create: `app/test/streammonsters-portrait-arena-visual.browser.js`
- Modify: `app/test/streammonsters-portrait-arena.test.js`

**Interfaces:**
- Consumes: actual overlay HTML/styles, portrait arena helper, effects renderer, and the real fighter/result/choice DOM.
- Produces: PNGs and `evidence.json` under `output/playwright/streammonsters-bounded-arena/`.
- Does not call backend mutation routes or alter runtime game state.

- [ ] **Step 1: Write the failing browser-harness contract test**

In `streammonsters-portrait-arena.test.js`, require both new files to exist and assert the runner source contains the exact viewport, variant, phase, renderer, and reduced-motion matrices plus the evidence output directory. Assert the fixture exposes `window.showArenaCase`.

- [ ] **Step 2: Run the contract test to prove RED**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-portrait-arena.test.js
```

Expected: FAIL because the fixture and runner files do not exist.

- [ ] **Step 3: Implement the Playwright acceptance runner**

The fixture imports the real overlay DOM and styles and exposes:

```js
window.showArenaCase({
  variant,
  phase,
  renderer,
  sealed,
  reducedMotion,
  eggNotice
});
```

It may set DOM state and call the real effects renderer, but it never calls the LTTH backend.

The runner iterates:

```text
viewports: 324×581, 477×829, 1080×1920
variants: split-arena, classic
phases: choice, sealed, revealed, action, completed, egg-exception
renderers: Canvas2D, CSS fallback, WebGPU when an adapter is available
motion: normal, reduced
```

For each relevant case, assert:

- arena rectangle is within one pixel of the exact target;
- every visible stage rectangle and nontransparent effect pixel is inside the arena;
- Likebar exclusion has no Stream Monsters rectangle or nontransparent pixel;
- only shelf/notice rectangles occur in the exception lane;
- shelf and notice never intersect;
- no two stage information rectangles intersect;
- action has one line, one metric, no wrap, and no overflow;
- every text node has `scrollWidth <= clientWidth + 1` and `scrollHeight <= clientHeight + 1`;
- Canvas/CSS/WebGPU effect bounds remain inside the arena;
- VFX CSS variables match measured fighter centers within `0.03` normalized units;
- reduced motion reports no running repeated animation and no transform displacement.

WebGPU absence is recorded as:

```json
{ "available": false, "status": "skipped-no-adapter" }
```

and is never reported as a pass.

- [ ] **Step 4: Complete the fixture and evidence output**

Serve only the repository root over a random loopback port with `Cache-Control: no-store`. Use Playwright Chromium from `app/node_modules`, close every page/browser/server in `finally`, and write deterministic file names such as:

```text
split-arena-choice-324x581.png
classic-action-477x829.png
split-arena-completed-1080x1920.png
split-arena-css-effect-324x581.png
```

The JSON records viewport, variant, phase, arena/Likebar/exception rectangles, visible rectangles, overlaps, text overflow, effect alpha bounds, renderer backend, measured origins, and reduced-motion state.

- [ ] **Step 5: Run browser and focused Jest proof**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
Set-Location "$feature\app"
& $node test\streammonsters-portrait-arena-visual.browser.js
& $node .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath `
  test\streammonsters-portrait-arena.test.js `
  test\streammonsters-arena-view-v15.test.js `
  test\streammonsters-effects-renderer.test.js `
  test\streammonsters-egg-overlay-state-reliability.test.js
```

Expected: browser runner exits `0`, evidence contains every matrix row, required PNGs exist, WebGPU is either proven or explicitly skipped, and all four Jest suites pass.

- [ ] **Step 6: Visually inspect the six smallest reference captures**

Open the 324×581 choice, action, and completed images for both variants. Confirm the short names, HP bars, fighters, result, egg exception, and violet framing are visually legible, not merely geometrically inside bounds. Record the six inspected paths and verdicts in the task report.

- [ ] **Step 7: Commit the browser acceptance harness**

```powershell
$feature = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay'
Set-Location $feature
git add -- `
  app/test/browser-fixtures/streammonsters-portrait-arena-acceptance.html `
  app/test/streammonsters-portrait-arena-visual.browser.js `
  app/test/streammonsters-portrait-arena.test.js
git diff --cached --check
git commit -m "test(streammonsters): verify bounded arena visuals"
```

Do not commit generated PNG or JSON evidence unless an existing repository policy already tracks that exact output directory.

### Task 6: Run final gates, integrate local main, and reload only StreamAlchemy

**Files:**
- Modify: none during verification.
- Integrate: reviewed commits from `codex/streammonsters-portrait-overlay` into local `main`.
- Preserve: current `main` `_partials/header.html` Stream Monsters link and its existing `🥚` emoji when resolving the known merge conflict.

**Interfaces:**
- Consumes: all reviewed task commits and browser evidence.
- Produces: a tested local `main`, unchanged running Node PID, one successful `streamalchemy` reload, and post-reload logs/state.
- Does not produce: a remote push, deployment, process restart, OBS refresh, or other plugin reload.

- [ ] **Step 1: Run the complete focused feature gate in the isolated worktree**

```powershell
Set-Location C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\.worktrees\streammonsters-portrait-overlay\app
$node = Resolve-Path '..\..\..\runtime\node\node.exe'
& $node .\node_modules\jest\bin\jest.js --runInBand --silent --runTestsByPath `
  test\streammonsters-config-v111.test.js `
  test\streammonsters-product-contract.test.js `
  test\streammonsters-creator-retention-v6.test.js `
  test\streammonsters-creator-runtime.test.js `
  test\streammonsters-creator-ui.test.js `
  test\streammonsters-creator-ui-v15.test.js `
  test\streammonsters-portrait-arena.test.js `
  test\streammonsters-egg-shelf-portrait-reliability.test.js `
  test\streammonsters-egg-overlay-state-reliability.test.js `
  test\streammonsters-overlay-layout-queue.test.js `
  test\streammonsters-overlay-reconnect-v15.test.js `
  test\streammonsters-arena-view-v15.test.js `
  test\streammonsters-effects-renderer.test.js `
  test\streammonsters-effects-signatures-v111.test.js `
  test\streammonsters-arcade-overlay-v6.test.js `
  test\streammonsters-overlay-language-v111.test.js
& $node test\streammonsters-portrait-arena-visual.browser.js
Set-Location ..
git diff --check
git status --short
```

Expected: all suites and browser cases pass; status contains only intentional tracked commits plus unrelated untracked scratch/old plan files.

- [ ] **Step 2: Run syntax, localization, and focused lint checks**

```powershell
$runtimeNode = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node'
$node = Resolve-Path "$runtimeNode\node.exe"
$npm = Resolve-Path "$runtimeNode\npm.cmd"
& $node --check app\plugins\streamalchemy\index.js
& $node --check app\plugins\streamalchemy\backend\streammonsters\routes.js
& $node --check app\plugins\streamalchemy\backend\streammonsters\battle-match-service.js
& $node --check app\plugins\streamalchemy\streammonsters-portrait-arena.js
& $node --check app\plugins\streamalchemy\streammonsters-arena-view.js
& $npm --prefix app run i18n:check
& $npm --prefix app run lint -- --quiet
```

Expected: every command exits `0`.

- [ ] **Step 3: Reconfirm local-main, feature, and live-process truth**

```powershell
$main = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main'
$feature = "$main\.worktrees\streammonsters-portrait-overlay"
git -C $main status --short --branch
git -C $feature status --short --branch
git -C $main rev-parse HEAD
git -C $feature rev-parse HEAD
Get-CimInstance Win32_Process -Filter "ProcessId = 35168" |
  Select-Object ProcessId, ExecutablePath, CommandLine
Get-NetTCPConnection -LocalPort 3000 -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess
```

Resolve the current PID dynamically if PID `35168` has changed. The gate is one existing process serving `main` on `127.0.0.1:3000`; do not start a replacement.

- [ ] **Step 4: Merge into local main with the known conflict rule**

```powershell
Set-Location $main
git merge --no-ff codex/streammonsters-portrait-overlay
```

If `_partials/header.html` conflicts, retain the current `main` Stream Monsters menu link and its `🥚` emoji while retaining all nonconflicting branch changes. Stage only that resolved file, inspect the complete merge, and finish:

```powershell
git add -- _partials/header.html
git diff --cached --check
git status --short
git commit
```

If any additional file conflicts, stop before committing and report the exact paths; do not restart or reload anything.

- [ ] **Step 5: Re-run the focused gate on integrated main**

Run the complete integrated gate:

```powershell
Set-Location "$main\app"
$node = Resolve-Path '..\runtime\node\node.exe'
& $node .\node_modules\jest\bin\jest.js --runInBand --silent --runTestsByPath `
  test\streammonsters-config-v111.test.js `
  test\streammonsters-product-contract.test.js `
  test\streammonsters-creator-retention-v6.test.js `
  test\streammonsters-creator-runtime.test.js `
  test\streammonsters-creator-ui.test.js `
  test\streammonsters-creator-ui-v15.test.js `
  test\streammonsters-portrait-arena.test.js `
  test\streammonsters-egg-shelf-portrait-reliability.test.js `
  test\streammonsters-egg-overlay-state-reliability.test.js `
  test\streammonsters-overlay-layout-queue.test.js `
  test\streammonsters-overlay-reconnect-v15.test.js `
  test\streammonsters-arena-view-v15.test.js `
  test\streammonsters-effects-renderer.test.js `
  test\streammonsters-effects-signatures-v111.test.js `
  test\streammonsters-arcade-overlay-v6.test.js `
  test\streammonsters-overlay-language-v111.test.js
& $node test\streammonsters-portrait-arena-visual.browser.js
```

Then run:

```powershell
Set-Location $main
git diff --check
git status --short --branch
git log -3 --oneline --decorate
```

Expected: integrated main is test-green and preserves unrelated untracked files.

- [ ] **Step 6: Confirm StreamAlchemy is already active before mutation**

```powershell
$base = 'http://127.0.0.1:3000'
$before = (Invoke-RestMethod "$base/api/plugins?locale=en").plugins |
  Where-Object id -eq 'streamalchemy'
$before | Select-Object id, enabled, loaded, version, reloadCount, lastReload
Invoke-RestMethod "$base/api/plugins/streamalchemy/log"
```

Required: `enabled` and `loaded` are both true. If either is false, stop without calling reload because reload would enable a deliberately inactive plugin.

- [ ] **Step 7: Reload exactly one plugin and capture evidence**

Issue exactly one mutation request:

```powershell
$reload = Invoke-RestMethod `
  'http://127.0.0.1:3000/api/plugins/streamalchemy/reload' `
  -Method Post
$reload | ConvertTo-Json -Depth 6
```

Required response:

```json
{"success":true,"message":"Plugin streamalchemy neu geladen"}
```

Then read:

```powershell
$after = (Invoke-RestMethod "$base/api/plugins?locale=en").plugins |
  Where-Object id -eq 'streamalchemy'
$after | Select-Object id, enabled, loaded, version, reloadCount, lastReload
Invoke-RestMethod "$base/api/plugins/streamalchemy/log"
Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" |
  Select-Object ProcessId, CreationDate, CommandLine
```

Required evidence: the same Node PID and creation time, incremented reload metadata, loaded/enabled true, and plugin log sequence containing stop, initialize, and initialized messages. Do not retry by restarting LTTH, OBS, the launcher, Node, all plugins, or another plugin.

- [ ] **Step 8: Hand off to the user's stream-visible test**

Report the integrated `main` commit, exact focused test totals, browser evidence path, WebGPU pass/skip truth, plugin reload response, before/after plugin metadata, and unchanged Node PID. Do not claim OBS-visible success; the user performs that acceptance.

## Plan Self-Review

- Spec coverage: Task 1 implements new/existing compatibility and public snapshot flow; Task 2 adds the localized selector and truthful preview; Task 3 implements the exact clipped arena, Likebar exclusion, and two lower exceptions; Task 4 implements both variants, phase ownership, concise action/result, motion, secrecy regression, and measured VFX; Task 5 proves geometry and renderer clipping in a real browser at all three sizes; Task 6 performs isolated gates, local-main integration, one-plugin reload, and the user handoff.
- Scope: viewport layout and arena variant stay independent; gameplay, database, commands, timers, assets, landscape, and queue ordering remain unchanged.
- Interface consistency: `portraitArenaVariant` uses the same two strings from config through Creator, public snapshots, wrapper dataset, CSS, browser evidence, and tests. `StreamMonstersPortraitArena.normalizedRectCenter()` is created in Task 3 and consumed by Task 4.
- Safety: the known `_partials/header.html` conflict has a deterministic preservation rule; unexpected conflicts and inactive-plugin state stop before live mutation. No task authorizes a process or OBS restart.
- Placeholder scan: every task has concrete paths, commands, expected results, interfaces, and commit scope; WebGPU unavailability is an explicit skip result rather than an unverified pass.
