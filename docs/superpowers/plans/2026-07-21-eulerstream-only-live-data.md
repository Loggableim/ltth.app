# EulerStream-only LIVE Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Data Source Manager and TikFinity so LTTH always receives TikTok LIVE information through EulerStream.

**Architecture:** `TikTokConnector` remains the compatibility facade used by the server and plugins, but it constructs only `EulerstreamAdapter` and makes the former source-selection settings inert by deleting them at initialization. The obsolete plugin, UI, store package, website/catalog pages, active documentation, translations, guides, and tests are removed together so no installed or published surface suggests an alternate LIVE source.

**Tech Stack:** Node.js CommonJS, Jest, Express/Socket.IO plugin runtime, static HTML/JavaScript/JSON/Markdown website assets.

## Global Constraints

- Keep `app/` in CommonJS style with 2-space JavaScript indentation.
- Preserve the existing EulerStream lifecycle, stream-session behavior, fallback-key consent, errors, and TikTok TTS integration.
- Delete only the obsolete `tiktok_data_source` and `tikfinity_ws_port` settings; do not alter API keys, profiles, logs, stream stats, or other configuration.
- Do not retain `/api/data-source/*`, `datasource:*`, TikFinity adapter, or source-switch compatibility shims.
- Remove active surfaces only; leave `docs_archive/`, release snapshots, and this approved design/plan history intact.

---

## File Structure

- `app/modules/tiktok.js` — EulerStream-only connector facade and legacy-setting cleanup.
- `app/test/eulerstream-only-live-data.test.js` — focused regression coverage for forced EulerStream, setting cleanup, and removed public surfaces.
- `app/modules/adapters/TikFinityAdapter.js` — deleted obsolete local-WebSocket implementation.
- `app/plugins/data-source/` — deleted obsolete plugin, UI, routes, sockets, and locales.
- `app/public/dashboard.html` and `app/public/js/dashboard.js` — remove the dashboard source selector and data-source API/socket client.
- `plugin-store.json`, `plugin-store/packages/data-source-1.0.0.zip`, and `screenshots/features/data-source.png` — remove the official store listing and assets.
- `app/locales/*.json`, `locales/**`, `public/locales/*.json`, `build-src/locales/*.json` — remove keys used only by the removed published source selection.
- `app/wiki/**`, `docs/**`, `infos/**`, `features/**`, `plugins.html`, `sitemap.xml`, `scripts/plugin-guides/**`, and capture/catalog manifests — remove or rewrite active documentation and site/catalog artifacts.
- Existing focused Jest tests and test fixtures — remove Data Source Manager-only expectations and fixture state.

### Task 1: Force EulerStream in the runtime facade

**Files:**
- Create: `app/test/eulerstream-only-live-data.test.js`
- Modify: `app/modules/tiktok.js:1-240`
- Delete: `app/modules/adapters/TikFinityAdapter.js`

**Interfaces:**
- Consumes: `EulerstreamAdapter(io, db, logger)`, `db.deleteSetting(key)`, and the current `TikTokConnector` public facade.
- Produces: `TikTokConnector` that always reports `dataSource: 'eulerstream'`, constructs only `EulerstreamAdapter`, and removes legacy source settings at construction.

- [ ] **Step 1: Write the failing connector regression tests**

```js
const fs = require('fs');

describe('EulerStream-only TikTok connector', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('../modules/adapters/EulerstreamAdapter');
  });

  test('always creates EulerStream and removes only legacy source settings', () => {
    let adapterDb;
    jest.doMock('../modules/adapters/EulerstreamAdapter', () => class MockEulerstreamAdapter {
      constructor(io, db) {
        adapterDb = db;
        this.isConnected = false;
        this.currentUsername = null;
      }
      on() {}
      removeListener() {}
      isActive() { return false; }
    });

    const db = {
      getSetting: jest.fn((key) => key === 'tiktok_data_source' ? 'tikfinity' : null),
      deleteSetting: jest.fn()
    };
    const TikTokConnector = require('../modules/tiktok');
    const connector = new TikTokConnector({ emit: jest.fn() }, db, { info: jest.fn() });

    expect(adapterDb).toBe(db);
    expect(db.deleteSetting).toHaveBeenCalledTimes(2);
    expect(db.deleteSetting).toHaveBeenNthCalledWith(1, 'tiktok_data_source');
    expect(db.deleteSetting).toHaveBeenNthCalledWith(2, 'tikfinity_ws_port');
    expect(connector.getActiveAdapterInfo()).toEqual(expect.objectContaining({ dataSource: 'eulerstream' }));
    expect(connector.switchSourceNow).toBeUndefined();
  });

  test('does not ship the TikFinity adapter', () => {
    expect(fs.existsSync(require('path').join(__dirname, '..', 'modules', 'adapters', 'TikFinityAdapter.js'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify the current routing fails it**

Run: `npx jest --runInBand --silent test/eulerstream-only-live-data.test.js`

Expected: FAIL because `TikTokConnector` reads `tiktok_data_source`, retains `switchSourceNow()`, and `TikFinityAdapter.js` still exists.

- [ ] **Step 3: Replace adapter selection with direct EulerStream construction**

At the module top, add the static dependency and delete `_createAdapterForSource(source)`:

```js
const EventEmitter = require('events');
const EulerstreamAdapter = require('./adapters/EulerstreamAdapter');
```

In the constructor, replace the setting lookup and source argument with:

```js
this._adapter = null;
this._currentSource = 'eulerstream';
this._eventForwarders = {};
this._removeLegacyDataSourceSettings();
this._switchAdapter();
```

Add an idempotent cleanup method that is safe for partial test doubles:

```js
_removeLegacyDataSourceSettings() {
  if (typeof this.db.deleteSetting !== 'function') return;

  for (const key of ['tiktok_data_source', 'tikfinity_ws_port']) {
    try {
      this.db.deleteSetting(key);
    } catch (error) {
      this.logger.warn?.(`[TikTokConnector] Could not remove obsolete ${key}: ${error.message}`);
    }
  }
}
```

Change `_switchAdapter()` to take no argument, instantiate `new EulerstreamAdapter(this.io, this.db, this.logger)`, assign `_currentSource = 'eulerstream'`, and retain the existing event-binding/session-lifecycle code. Replace `connect()` with `return this._adapter.connect(username, options);`, remove `switchSourceNow()`, and remove the redundant `_currentSource === 'eulerstream'` guard in `getCurrentStreamKey()` while retaining its session-ID behavior.

- [ ] **Step 4: Remove the obsolete adapter file**

Delete `app/modules/adapters/TikFinityAdapter.js`. Do not remove shared `ws` dependencies because EulerStream still uses them.

- [ ] **Step 5: Run the focused runtime tests**

Run: `npx jest --runInBand --silent test/eulerstream-only-live-data.test.js test/tiktok-connector-db-prototype.test.js test/eulerstream-connection-state.test.js`

Expected: PASS. The connector test proves a persisted `tikfinity` setting cannot alter the adapter, and EulerStream lifecycle regressions remain green.

- [ ] **Step 6: Commit the runtime-only change**

```powershell
git add app/modules/tiktok.js app/modules/adapters/TikFinityAdapter.js app/test/eulerstream-only-live-data.test.js
git commit -m "refactor: enforce EulerStream as live source"
```

### Task 2: Remove the manager and dashboard controls

**Files:**
- Delete: `app/plugins/data-source/`
- Delete: `app/test/data-source-ui-switch.test.js`
- Modify: `app/public/dashboard.html:3956-4012`
- Modify: `app/public/js/dashboard.js:348-360,629-632,1855-1856,1937-2059,4272-4273`
- Modify: `app/test/generated-plugin-locale.test.js`
- Modify: `app/test/plugin-i18n-small-plugin-regression.test.js`
- Modify: `app/test/docs-capture-real-workflows.test.js`
- Modify: `app/test/interaction-capture-guide-evidence.test.js`
- Modify: `app/test_user_configs/testprofile_plugins_state.json`

**Interfaces:**
- Consumes: the runtime guarantee from Task 1.
- Produces: a dashboard without a source chooser and a test suite/fixture set that no longer loads or documents the deleted plugin.

- [ ] **Step 1: Extend the static regression test before deleting the UI**

Append this test to `app/test/eulerstream-only-live-data.test.js`:

```js
test('does not expose manager controls or legacy data-source routes', () => {
  const root = path.join(__dirname, '..', '..');
  const dashboard = fs.readFileSync(path.join(root, 'app', 'public', 'dashboard.html'), 'utf8');
  const dashboardJs = fs.readFileSync(path.join(root, 'app', 'public', 'js', 'dashboard.js'), 'utf8');

  expect(fs.existsSync(path.join(root, 'app', 'plugins', 'data-source'))).toBe(false);
  expect(dashboard).not.toMatch(/datasource-|TikFinity|tiktok-data-source/i);
  expect(dashboardJs).not.toMatch(/\/api\/data-source|datasource:|TikFinity|loadDataSourceStatus/);
});
```

Add `const path = require('path');` once at the top of the test file. Before the implementation this test must fail on the existing plugin, markup, and JavaScript.

- [ ] **Step 2: Remove the complete dashboard selector**

Delete the `<!-- TikTok Data Source Selection -->` settings card from `app/public/dashboard.html`, including both radios and the TikFinity port/save section. In `app/public/js/dashboard.js`, remove only the matching listener setup, the `datasource:changed` Socket.IO handler, both `await loadDataSourceStatus()` calls, and the complete `DATA SOURCE SWITCHING` block (`loadDataSourceStatus`, `updateDataSourceUI`, `handleDataSourceChange`, and `saveTikFinitySettings`). Preserve the EulerStream API-key settings card and all unrelated dashboard setup.

- [ ] **Step 3: Delete the plugin and remove manager-only test contracts**

Delete `app/plugins/data-source/` recursively and delete `app/test/data-source-ui-switch.test.js`. Remove the `data-source` entry from the small-plugin locale parameter arrays and remove the three manager-specific test blocks from `docs-capture-real-workflows.test.js` plus the two manager rows from `interaction-capture-guide-evidence.test.js`. Remove the `data-source` object from `testprofile_plugins_state.json`, leaving valid comma-separated JSON.

- [ ] **Step 4: Run the focused UI and i18n tests**

Run: `npx jest --runInBand --silent test/eulerstream-only-live-data.test.js test/generated-plugin-locale.test.js test/plugin-i18n-small-plugin-regression.test.js test/docs-capture-real-workflows.test.js test/interaction-capture-guide-evidence.test.js`

Expected: PASS, with no route, socket, selector, fixture, or plugin-localization reference to the manager.

- [ ] **Step 5: Commit the UI and plugin removal**

```powershell
git add app/public/dashboard.html app/public/js/dashboard.js app/plugins/data-source app/test app/test_user_configs/testprofile_plugins_state.json
git commit -m "refactor: remove obsolete data source manager"
```

### Task 3: Remove published artifacts and revise active documentation

**Files:**
- Modify: `plugin-store.json`
- Delete: `plugin-store/packages/data-source-1.0.0.zip`
- Delete: `screenshots/features/data-source.png`
- Delete: `docs/plugins/data-source.html`, `features/plugin-data-source.html`, `features/tikfinity-api.html`, `scripts/plugin-guides/data-source.js`, and `screenshots/mocks/tikfinity-api.html`
- Modify: `docs/plugins/index.json`, `scripts/plugin-guides/index.js`, `scripts/plugin-tutorial-catalog.js`, `scripts/plugin-guides/safe-workflow-contracts.js`, `screenshots/docs-capture-manifest.json`, `screenshots/product-capture-manifest.json`, `scripts/product-screenshot-spec.js`, `features/catalog-data.js`, `features/index.html`, `features-en.html`, `features-es.html`, `features-fr.html`, `plugins.html`, and `sitemap.xml`
- Modify: active README/wiki/developer docs and their translated snapshots identified by `rg -l -i 'TikFinity|Data Source Manager|Datenquellen-Manager'` outside `docs_archive/`, release snapshots, and `docs/superpowers/`.
- Modify: active locale/inventory JSON identified by the same search, removing only keys or records whose visible copy belongs to the deleted manager/TikFinity option.
- Test: `app/test/eulerstream-only-live-data.test.js`, `app/test/plugin-store-registry.test.js`, `app/test/plugin-tutorial-source-workflow.test.js`

**Interfaces:**
- Consumes: Task 2's absence of the plugin and its dashboard surface.
- Produces: no installable, linked, indexed, localized, or captureable active Data Source Manager/TikFinity feature.

- [ ] **Step 1: Add the failing published-surface regression**

Add this test to `app/test/eulerstream-only-live-data.test.js`:

```js
test('does not publish Data Source Manager or TikFinity as a live-data option', () => {
  const root = path.join(__dirname, '..', '..');
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
  const activeFiles = [
    'app/README.md', 'app/wiki/Home.md', 'app/wiki/Wiki-Index.md',
    'docs/SNAPSHOT_STATUS.md', 'infos/llm_start_here.md',
    'features/catalog-data.js', 'plugins.html', 'sitemap.xml'
  ];

  expect(registry.plugins.some((plugin) => plugin.id === 'data-source')).toBe(false);
  expect(fs.existsSync(path.join(root, 'plugin-store', 'packages', 'data-source-1.0.0.zip'))).toBe(false);
  expect(fs.existsSync(path.join(root, 'screenshots', 'features', 'data-source.png'))).toBe(false);
  for (const relativePath of activeFiles) {
    expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).not.toMatch(/TikFinity|Data Source Manager|Datenquellen-Manager/i);
  }
});
```

The current repository must fail because the store entry, package, screenshot, docs, catalog, and sitemap are still published.

- [ ] **Step 2: Remove the official store entry and its unreferenced assets**

Delete the `data-source` object from the `plugins` array in `plugin-store.json`, deleting the adjacent comma correctly. Delete `plugin-store/packages/data-source-1.0.0.zip` and `screenshots/features/data-source.png`. Extend no checksum metadata: the existing registry test automatically verifies every remaining package.

- [ ] **Step 3: Remove pages, guide/capture catalog entries, and outbound links**

Delete the dedicated page, feature page, TikFinity API mock, and guide source listed above. Remove their IDs/URLs from plugin/docs indices, tutorial catalog/builders, safe-workflow contracts, product and documentation screenshot manifests/specifications, feature catalog/list pages, plugin list, and sitemap. Keep all unrelated plugin-guide entries and capture contracts unchanged.

- [ ] **Step 4: Revise active user/developer docs and localizations**

Replace statements that describe EulerStream and TikFinity as selectable adapters with an EulerStream-only statement. Remove the manager-specific locale keys and inventory records from all locale families where they are no longer reachable. Update the root and translated `SNAPSHOT_STATUS`/`llm_start_here`/architecture/testing documents so their adapter and plugin inventories match the removed code. Do not edit `docs_archive/`, `new_patch/`, or `docs/superpowers/` historical records.

- [ ] **Step 5: Run targeted publication and documentation tests**

Run: `npx jest --runInBand --silent test/eulerstream-only-live-data.test.js test/plugin-store-registry.test.js test/plugin-tutorial-source-workflow.test.js test/docs-capture-real-workflows.test.js test/interaction-capture-guide-evidence.test.js`

Expected: PASS. The store can validate every remaining ZIP, and the documentation/capture system has no guide or capture referencing the deleted feature.

- [ ] **Step 6: Commit the published-surface cleanup**

```powershell
git add plugin-store.json plugin-store screenshots features docs infos locales public scripts app/README.md app/wiki build-src/locales plugins.html sitemap.xml
git commit -m "docs: remove TikFinity live source references"
```

### Task 4: Validate the complete EulerStream-only change

**Files:**
- Verify: all changed files from Tasks 1-3

**Interfaces:**
- Consumes: the finished removal and static regression coverage.
- Produces: verified, reviewable EulerStream-only branch state.

- [ ] **Step 1: Validate JavaScript, JSON, and source absence**

Run:

```powershell
node --check app/modules/tiktok.js
Get-ChildItem app/locales,locales,public/locales,build-src/locales -Filter *.json -Recurse | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName | ConvertFrom-Json | Out-Null }
$matches = rg -n -i -S 'TikFinity|Data Source Manager|Datenquellen-Manager|/api/data-source|datasource:' app/modules app/plugins app/public app/wiki app/README.md plugin-store.json features docs infos locales public scripts build-src plugins.html sitemap.xml --glob '!docs/superpowers/**'
if ($LASTEXITCODE -eq 0) { $matches; throw 'Obsolete active-surface reference remains.' }
if ($LASTEXITCODE -gt 1) { throw 'Search failed.' }
```

Expected: syntax and JSON checks succeed; the final search returns no active-surface references.

- [ ] **Step 2: Run the focused regression suite**

Run:

```powershell
npx jest --runInBand --silent test/eulerstream-only-live-data.test.js test/tiktok-connector-db-prototype.test.js test/eulerstream-connection-state.test.js test/plugin-store-registry.test.js test/plugin-tutorial-source-workflow.test.js test/generated-plugin-locale.test.js test/plugin-i18n-small-plugin-regression.test.js test/docs-capture-real-workflows.test.js test/interaction-capture-guide-evidence.test.js
npm run build:css
npm run lint -- --quiet
git diff --check
```

Expected: every targeted suite passes, CSS and lint commands exit 0, and `git diff --check` reports no whitespace errors. Attempt the full Jest suite only after this gate; record a timeout without a failing test as inconclusive, not as a pass.

- [ ] **Step 3: Review the final change scope and commit verification artifacts only when needed**

Run:

```powershell
git status --short
git log --oneline -4
git diff HEAD~3..HEAD --stat
```

Expected: only the three focused implementation commits plus the already-committed design/plan documents are present in this worktree. Do not stage generated artifacts unless they changed because a verified repository command generated them.
