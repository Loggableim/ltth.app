# EmojiRain Command UI and Despawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the dynamic command editor layout and add one shared 1–120 second despawn duration that applies only to dynamic EmojiRain command spawns.

**Architecture:** Extend the existing shared command-settings normalizer and DOM editor with `animal_command_despawn_ms`, then attach that value as `lifetimeMs` only in `handleConfiguredAnimalCommand` for both renderer plugins. WebGPU already consumes a per-spawn lifetime; the Classic standard and OBS-HUD renderers will carry the same field through their immediate and queued spawn paths. Both plugin UIs move the editor into a full-width card and enforce responsive/hidden contracts.

**Tech Stack:** CommonJS Node.js, Jest, JSDOM, static HTML/CSS, Matter.js Classic renderer, native WebGPU renderer, JSON i18n.

## Global Constraints

- Persist `animal_command_despawn_ms` in milliseconds with a default of `8000`.
- Display whole seconds in the GUI; accept only 1–120 seconds.
- Apply the override only to dynamic configured commands handled by `handleConfiguredAnimalCommand`.
- Keep Classic and WebGPU behavior and UI in parity.
- Do not alter normal rain, likes, gifts, gift balls, heart balloons, `/rain`, `/emoji`, or `/storm` lifetimes.
- Preserve atomic config/GCCE rollback and existing cooldown timing.
- Use safe DOM APIs for all dynamic editor content.
- Keep user-visible strings localized in DE, EN, ES, and FR.
- Do not restart the active LTTH server or emit synthetic chat commands during rollout.

---

### Task 1: Normalize and persist the shared command despawn setting

**Files:**
- Modify: `app/modules/emoji-rain-animal-commands.js`
- Modify: `app/modules/database.js`
- Modify: `app/plugins/webgpu-emoji-rain/lib/webgpu-config.js`
- Test: `app/test/emoji-rain-animal-commands.test.js`
- Test: `app/test/emoji-rain-config-persistence.test.js`

**Interfaces:**
- Produces: `normalizeAnimalCommandSettings(input, options).animal_command_despawn_ms: number`
- Produces: `DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_despawn_ms === 8000`
- Produces: `ANIMAL_COMMAND_SETTING_KEYS` containing `animal_command_despawn_ms`
- Consumes: existing strict `AnimalCommandValidationError` issue collection.

- [ ] **Step 1: Write failing normalization tests**

Add assertions to the default migration test and a strict validation table:

```js
expect(normalized).toMatchObject({
  animal_command_global_cooldown_ms: 15000,
  animal_command_despawn_ms: 8000
});

test.each([999, 120001, 1500.5, 'eight seconds'])(
  'strict validation rejects invalid command despawn %p',
  value => {
    expect(() => normalizeAnimalCommandSettings({
      animal_commands: [],
      animal_command_despawn_ms: value
    }, { strict: true })).toThrow(expect.objectContaining({
      issues: expect.arrayContaining([
        expect.objectContaining({ field: 'animal_command_despawn_ms', code: 'invalid_despawn' })
      ])
    }));
  }
);

test.each([1000, 8000, 120000])('accepts command despawn %i', value => {
  expect(normalizeAnimalCommandSettings({
    animal_commands: [],
    animal_command_despawn_ms: value
  }, { strict: true }).animal_command_despawn_ms).toBe(value);
});
```

- [ ] **Step 2: Add failing Classic persistence coverage**

Extend the migration assertion in `emoji-rain-config-persistence.test.js`:

```js
expect(stored).toMatchObject({
  animal_commands: [],
  animal_command_despawn_ms: 8000
});
```

Add this round-trip test:

```js
test('should persist command emoji despawn duration after database reload', () => {
    const updated = {
        ...db.getEmojiRainConfig(),
        animal_command_despawn_ms: 12000
    };
    db.updateEmojiRainConfig(updated, true);
    db.close();
    db = new Database(testDbPath, 'test_user');

    expect(db.getEmojiRainConfig().animal_command_despawn_ms).toBe(12000);
});
```

- [ ] **Step 3: Run both tests and verify RED**

Run from `app/`:

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-animal-commands.test.js
npx --yes node@22 "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-config-persistence.test.js
```

Expected: both FAIL because the default field, `invalid_despawn` validation, and persistence key do not exist.

- [ ] **Step 4: Implement bounded millisecond normalization and persistence**

Add the field to the shared defaults and migration keys, then normalize it without reusing cooldown semantics:

```js
const MIN_ANIMAL_COMMAND_DESPAWN_MS = 1000;
const MAX_ANIMAL_COMMAND_DESPAWN_MS = 120000;

function normalizeCommandDespawn(value, strict, issues) {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_despawn_ms;
  }
  const numeric = Number(value);
  if (!Number.isInteger(numeric)
      || numeric < MIN_ANIMAL_COMMAND_DESPAWN_MS
      || numeric > MAX_ANIMAL_COMMAND_DESPAWN_MS) {
    if (strict) issues.push({ field: 'animal_command_despawn_ms', code: 'invalid_despawn' });
    return DEFAULT_ANIMAL_COMMAND_SETTINGS.animal_command_despawn_ms;
  }
  return numeric;
}
```

Include this property in the normalized result:

```js
animal_command_despawn_ms: normalizeCommandDespawn(
  source.animal_command_despawn_ms,
  strict,
  issues
)
```

Add `animal_command_despawn_ms: 8000` to Classic database defaults and WebGPU defaults. Existing migration detection will persist it because `ANIMAL_COMMAND_SETTING_KEYS` includes it.

- [ ] **Step 5: Run normalization and persistence tests GREEN**

Use Node 22 because the installed `better-sqlite3` ABI targets module version 127:

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-animal-commands.test.js
npx --yes node@22 "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-config-persistence.test.js
```

Expected after implementation: both normalization and persistence suites PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add app/modules/emoji-rain-animal-commands.js app/modules/database.js app/plugins/webgpu-emoji-rain/lib/webgpu-config.js app/test/emoji-rain-animal-commands.test.js app/test/emoji-rain-config-persistence.test.js
git commit -m "feat(emojirain): configure command despawn duration"
```

### Task 2: Round-trip seconds through the shared editor

**Files:**
- Modify: `app/public/js/emoji-rain-command-editor.js`
- Modify: `app/test/emoji-rain-command-editor.test.js`
- Modify: `app/plugins/emoji-rain/locales/de.json`
- Modify: `app/plugins/emoji-rain/locales/en.json`
- Modify: `app/plugins/emoji-rain/locales/es.json`
- Modify: `app/plugins/emoji-rain/locales/fr.json`
- Modify: `app/plugins/webgpu-emoji-rain/locales/de.json`
- Modify: `app/plugins/webgpu-emoji-rain/locales/en.json`
- Modify: `app/plugins/webgpu-emoji-rain/locales/es.json`
- Modify: `app/plugins/webgpu-emoji-rain/locales/fr.json`
- Test: `app/test/emoji-rain-runtime-i18n.test.js`
- Test: `app/test/webgpu-emoji-rain-ui-i18n.test.js`

**Interfaces:**
- Consumes: normalized `animal_command_despawn_ms`.
- Produces: `[data-setting="command-despawn"]` with `min=1`, `max=120`, `step=1`.
- Produces: `EmojiRainCommandEditor.serialize().animal_command_despawn_ms`.

- [ ] **Step 1: Write the failing editor test**

Extend the fixture config with `animal_command_despawn_ms: 8000` and add:

```js
test('round-trips one shared command despawn duration in seconds', () => {
  const { editor } = createEditor();
  editor.load(config([]));
  const input = editor.root.querySelector('[data-setting="command-despawn"]');

  expect(input).not.toBeNull();
  expect(input.value).toBe('8');
  expect(input.min).toBe('1');
  expect(input.max).toBe('120');

  input.value = '12';
  expect(editor.serialize().animal_command_despawn_ms).toBe(12000);
});
```

- [ ] **Step 2: Run editor test and verify RED**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-command-editor.test.js
```

Expected: FAIL because `[data-setting="command-despawn"]` is absent.

- [ ] **Step 3: Add the bounded seconds control**

Generalize `createNumberSetting` to accept bounds:

```js
createNumberSetting(key, label, defaultSeconds, bounds = {}) {
  const input = this.createElement('input', { type: 'number' });
  input.dataset.setting = key;
  input.min = String(bounds.min ?? 0);
  input.max = String(bounds.max ?? 86400);
  input.step = String(bounds.step ?? 1);
  input.value = String(defaultSeconds);
  return this.createLabel(label, input);
}
```

Append the fourth setting to the existing settings grid:

```js
this.createNumberSetting(
  'command-despawn',
  this.text('command_despawn_seconds', 'Command emoji despawn duration (seconds)'),
  8,
  { min: 1, max: 120, step: 1 }
)
```

Load and serialize it with the existing conversion helpers:

```js
this.setSeconds('command-despawn', config.animal_command_despawn_ms, 8000);
// ...
animal_command_despawn_ms: this.secondsToMilliseconds('command-despawn', 8000)
```

- [ ] **Step 4: Add localized copy and i18n assertions**

Add `commands_editor.command_despawn_seconds` to all eight locale files:

```json
{
  "de": "Despawn-Dauer der Kommando-Emojis (Sekunden)",
  "en": "Command emoji despawn duration (seconds)",
  "es": "Duración de desaparición de emojis de comando (segundos)",
  "fr": "Durée avant disparition des émojis de commande (secondes)"
}
```

Store only the language-appropriate string in each locale. Extend both test files' existing `commandEditorKeys` array:

```js
const commandEditorKeys = [
  // existing keys
  'command_despawn_seconds'
];
```

The existing DE/EN/ES/FR loops then verify the new key in every catalog.

- [ ] **Step 5: Run editor and i18n tests GREEN**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-command-editor.test.js test/emoji-rain-runtime-i18n.test.js test/webgpu-emoji-rain-ui-i18n.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add app/public/js/emoji-rain-command-editor.js app/test/emoji-rain-command-editor.test.js app/plugins/emoji-rain/locales app/plugins/webgpu-emoji-rain/locales app/test/emoji-rain-runtime-i18n.test.js app/test/webgpu-emoji-rain-ui-i18n.test.js
git commit -m "feat(emojirain): expose command despawn setting"
```

### Task 3: Apply the lifetime only to configured command spawns

**Files:**
- Modify: `app/plugins/emoji-rain/main.js`
- Modify: `app/plugins/webgpu-emoji-rain/main.js`
- Modify: `app/test/helpers/emoji-rain-command-plugin-contract.js`
- Test: `app/plugins/emoji-rain/test/chat-commands.test.js`
- Test: `app/plugins/webgpu-emoji-rain/test/chat-commands.test.js`

**Interfaces:**
- Consumes: `config.animal_command_despawn_ms`.
- Produces: successful configured-command overlay payloads with `lifetimeMs: number`.
- Preserves: all non-configured-command payloads without `lifetimeMs` unless they already supplied one.

- [ ] **Step 1: Write the failing shared plugin-contract test**

In the existing successful configured-command assertion, set `animal_command_despawn_ms: 12000` and require:

```js
expect(api.emissions[0].data).toMatchObject({
  emoji: imageRendererMode === 'profile-picture' ? '{{profilePicture}}' : imagePath,
  count: 4,
  burst: false,
  lifetimeMs: 12000
});
```

Also trigger `/rain` and assert its emitted payload does not have an own `lifetimeMs` property.

- [ ] **Step 2: Run both command suites and verify RED**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath plugins/emoji-rain/test/chat-commands.test.js plugins/webgpu-emoji-rain/test/chat-commands.test.js
```

Expected: FAIL because configured command spawns omit `lifetimeMs`.

- [ ] **Step 3: Pass the command lifetime into both trigger calls**

Add only this property inside both `handleConfiguredAnimalCommand` payloads:

```js
lifetimeMs: config.animal_command_despawn_ms,
```

Preserve it in each `triggerEmojiRain` spawn payload only when finite:

```js
...(Number.isFinite(Number(params.lifetimeMs))
  ? { lifetimeMs: Number(params.lifetimeMs) }
  : {}),
```

Do not add it to any other command or event handler.

- [ ] **Step 4: Run both command suites GREEN**

Run the Step 2 command again. Expected: both suites PASS, including rejection/cooldown tests with no new emissions.

- [ ] **Step 5: Commit Task 3**

```powershell
git add app/plugins/emoji-rain/main.js app/plugins/webgpu-emoji-rain/main.js app/test/helpers/emoji-rain-command-plugin-contract.js app/plugins/emoji-rain/test/chat-commands.test.js app/plugins/webgpu-emoji-rain/test/chat-commands.test.js
git commit -m "feat(emojirain): apply command-only lifetime"
```

### Task 4: Carry command lifetime through both Classic renderer queues

**Files:**
- Modify: `app/public/js/emoji-rain-engine.js`
- Modify: `app/public/js/emoji-rain-obs-hud.js`
- Test: `app/test/emoji-rain-engine-coordinate-regression.test.js`

**Interfaces:**
- Consumes: overlay event property `data.lifetimeMs`.
- Produces: normal emoji objects with `lifetimeMs: number | null`.
- Lifetime priority: `gift despawnMs` then per-spawn `lifetimeMs` then global `emoji_lifetime_ms`.

- [ ] **Step 1: Write failing renderer tests**

Add a parameterized direct-spawn test:

```js
test.each(scripts)('$name stores a command-specific lifetime on normal emojis', ({ path: scriptPath }) => {
  const { context } = loadOverlayScript(scriptPath);
  context.initPhysics();

  const emoji = context.spawnEmoji('paw', 0.5, 0.5, 60, null, null, null, 'command', false, 12000);

  expect(emoji.lifetimeMs).toBe(12000);
});
```

Add source-contract assertions that `lifetimeMs` survives both queue layers:

```js
test.each(scripts)('$name carries command lifetime through spawn and rate-limit queues', ({ path: scriptPath }) => {
  const { source } = loadOverlayScript(scriptPath);

  expect(source).toMatch(/spawnQueue\.push\(\{[^}]*lifetimeMs/s);
  expect(source).toMatch(/rateLimitQueue\.push\(\{[^}]*lifetimeMs/s);
  expect(source).toMatch(/processSpawn\([^)]*lifetimeMs[^)]*\)/s);
  expect(source).toMatch(/spawnEmoji\([^)]*emojiData\.lifetimeMs[^)]*\)/s);
});
```

- [ ] **Step 2: Run renderer regression test and verify RED**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-engine-coordinate-regression.test.js
```

Expected: FAIL because `spawnEmoji` ignores the tenth argument and queue entries drop it.

- [ ] **Step 3: Thread the lifetime through standard overlay paths**

In both renderer files:

```js
function spawnEmoji(
  emoji, x, y, size, username = null, profilePictureUrl = null,
  color = null, spawnKind = 'default', isBurst = false, lifetimeMs = null
) {
  const normalizedLifetimeMs = Number(lifetimeMs);
  // ...
  const emojiObj = {
    // existing fields
    lifetimeMs: Number.isFinite(normalizedLifetimeMs) && normalizedLifetimeMs > 0
      ? normalizedLifetimeMs
      : null
  };
}
```

Read `data.lifetimeMs` in `handleSpawnEvent`, pass it through `spawnQueue`, `processSpawn`, `rateLimitQueue`, immediate `spawnEmoji` calls, and drained queue calls. Change the lifetime check to:

```js
const lifetimeMs = emoji.despawnMs || emoji.lifetimeMs || config.emoji_lifetime_ms;
```

- [ ] **Step 4: Run renderer and WebGPU native tests GREEN**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-engine-coordinate-regression.test.js test/webgpu-emoji-rain-native.test.js test/webgpu-emoji-rain-renderer-parity.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add app/public/js/emoji-rain-engine.js app/public/js/emoji-rain-obs-hud.js app/test/emoji-rain-engine-coordinate-regression.test.js
git commit -m "fix(emojirain): preserve per-command lifetime"
```

### Task 5: Repair the command editor layout in both UIs

**Files:**
- Modify: `app/plugins/emoji-rain/ui.html`
- Modify: `app/plugins/webgpu-emoji-rain/ui.html`
- Create: `app/test/emoji-rain-command-ui-layout.test.js`

**Interfaces:**
- Produces: `.emoji-command-editor-card` as a direct full-width child of `.settings-grid`.
- Produces: author-level `[hidden]` enforcement inside the command editor.
- Preserves: existing `#animal-command-editor` ID used by both UI controllers.

- [ ] **Step 1: Write the failing static UI contract**

```js
const fs = require('fs');
const path = require('path');

const APP_DIR = path.join(__dirname, '..');
const variants = [
  'plugins/emoji-rain/ui.html',
  'plugins/webgpu-emoji-rain/ui.html'
];

describe.each(variants)('%s command editor layout', file => {
  const html = fs.readFileSync(path.join(APP_DIR, file), 'utf8');

  test('uses a full-width editor card outside the SuperFan card', () => {
    expect(html).toContain('class="config-section emoji-command-editor-card"');
    expect(html).toMatch(/\.emoji-command-editor-card\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/s);
  });

  test('prevents hidden image controls and row overflow', () => {
    expect(html).toMatch(/\.emoji-command-editor\s+\[hidden\]\s*\{[^}]*display:\s*none\s*!important/s);
    expect(html).toMatch(/\.emoji-command-editor__row\s*>\s*\*\s*\{[^}]*min-width:\s*0/s);
    expect(html).toMatch(/\.emoji-command-editor__row[\s\S]*grid-template-columns:[^;]*minmax\(0,/);
  });
});
```

- [ ] **Step 2: Run the layout contract and verify RED**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-command-ui-layout.test.js
```

Expected: FAIL because the editor is nested inside SuperFan and hidden/grid rules are missing.

- [ ] **Step 3: Move the editor into a full-width card**

Remove `<div id="animal-command-editor"></div>` from each SuperFan card and insert this sibling immediately after that card:

```html
<div class="config-section emoji-command-editor-card">
  <div id="animal-command-editor"></div>
</div>
```

Add equivalent CSS to both UIs:

```css
.emoji-command-editor-card {
  grid-column: 1 / -1;
  min-width: 0;
}

.emoji-command-editor [hidden] {
  display: none !important;
}

.emoji-command-editor__row {
  grid-template-columns:
    minmax(72px, 0.45fr)
    minmax(0, 1fr)
    minmax(120px, 0.8fr)
    minmax(0, 1.4fr);
}

.emoji-command-editor__row > *,
.emoji-command-editor__label,
.emoji-command-editor__command-name,
.emoji-command-editor__upload,
.emoji-command-editor input,
.emoji-command-editor select {
  min-width: 0;
}
```

Keep the existing two-column breakpoint at 1100 px and one-column breakpoint at 680 px.

- [ ] **Step 4: Run layout/editor tests GREEN**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-command-ui-layout.test.js test/emoji-rain-command-editor.test.js test/emoji-rain-runtime-i18n.test.js test/webgpu-emoji-rain-ui-i18n.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```powershell
git add app/plugins/emoji-rain/ui.html app/plugins/webgpu-emoji-rain/ui.html app/test/emoji-rain-command-ui-layout.test.js
git commit -m "fix(emojirain): repair command editor layout"
```

### Task 6: Integrated verification and live-safe rollout

**Files:**
- Verify all files changed in Tasks 1–5.
- Runtime target after repository verification: `C:\Users\logga\Downloads\app`.

**Interfaces:**
- Consumes: verified repository files.
- Produces: active WebGPU EmojiRain UI with no horizontal overflow and a persisted command-only despawn value.

- [ ] **Step 1: Run the focused regression set**

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$env:NODE_PATH=$deps
node "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-animal-commands.test.js test/emoji-rain-command-editor.test.js test/emoji-rain-runtime-i18n.test.js test/webgpu-emoji-rain-ui-i18n.test.js test/emoji-rain-command-ui-layout.test.js test/emoji-rain-engine-coordinate-regression.test.js test/webgpu-emoji-rain-native.test.js test/webgpu-emoji-rain-renderer-parity.test.js plugins/emoji-rain/test/chat-commands.test.js plugins/webgpu-emoji-rain/test/chat-commands.test.js
npx --yes node@22 "$deps\jest\bin\jest.js" --runInBand --runTestsByPath test/emoji-rain-config-persistence.test.js
```

Expected: all suites and tests PASS.

- [ ] **Step 2: Run static verification**

```powershell
git diff --check origin/main...HEAD
$changedJs = @(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- 'app/*.js' 'app/**/*.js')
foreach ($file in $changedJs) { node --check $file }
$changedJson = @(git diff --name-only --diff-filter=ACMR origin/main...HEAD -- 'app/*.json' 'app/**/*.json')
foreach ($file in $changedJson) { Get-Content -Raw $file | ConvertFrom-Json | Out-Null }
```

Run scoped ESLint from `app/` with the installed dependency tree and require exit code 0:

```powershell
$deps='C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\app\node_modules'
$repo='C:\Users\logga\AppData\Local\Temp\ltth-emojirain-command-ui-20260720'
$files=@(git -C $repo diff --name-only --diff-filter=ACMR origin/main...HEAD -- 'app/*.js' 'app/**/*.js' | ForEach-Object { $_ -replace '^app/', '' })
$env:NODE_PATH=$deps
node "$deps\eslint\bin\eslint.js" @files
if ($LASTEXITCODE -ne 0) { throw "ESLint failed with exit code $LASTEXITCODE" }
```

- [ ] **Step 3: Verify the standalone UI in a browser**

Serve the verified worktree on a non-live port or temporarily map only its static UI dependencies. At 1280×720 and a narrower viewport, assert with browser DOM geometry:

```js
document.documentElement.scrollWidth === document.documentElement.clientWidth
document.querySelector('.emoji-command-editor__row').scrollWidth
  <= document.querySelector('.emoji-command-editor__row').clientWidth
Array.from(document.querySelectorAll('.emoji-command-editor__upload'))
  .every(element => element.hidden && getComputedStyle(element).display === 'none')
```

Switch one row to image mode and confirm only that row's image controls become visible.

- [ ] **Step 4: Copy only validated files into the active runtime**

Before copying, re-confirm process `71292` (or its replacement) still runs `C:\Users\logga\Downloads\app\server.js`, port 3000 still responds, and `webgpu-emoji-rain` remains enabled. Copy the exact changed runtime files from this worktree to their matching paths under `C:\Users\logga\Downloads\app`; do not touch runtime config databases or unrelated plugins.

- [ ] **Step 5: Reload only WebGPU EmojiRain and verify**

Call:

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/plugins/webgpu-emoji-rain/reload'
```

Then reload `http://127.0.0.1:3000/webgpu-emoji-rain/ui` in the browser and repeat the geometry/hidden-control checks. GET the WebGPU config, save a non-destructive command despawn value through the existing config endpoint, GET it again, and restore the previous value if the verification changed it. Do not emit a chat command.

- [ ] **Step 6: Final repository commit if verification required adjustments**

If browser verification required a source adjustment, repeat its RED/GREEN test, stage only EmojiRain files, and commit:

```powershell
git commit -m "fix(emojirain): finalize command UI despawn"
```

End with a clean worktree and record exact focused test counts, active plugin reload response, browser overflow measurements, and the final commit hash.
