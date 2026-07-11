# Plugin Store Appstore UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the dashboard Plugin Store UI into a real appstore surface with Store, Installed, Updates, and Sources modes while preserving current plugin management operations.

**Architecture:** Keep the existing backend API and plugin manager module. Refactor `app/public/dashboard.html` to expose appstore navigation, category chips, source panel, and drawer hooks, then refactor `app/public/js/plugin-manager.js` so store rendering is split by mode and uses a marketplace grid plus detail drawer. Tests assert the static UI contracts and runtime behavior is verified with Playwright.

**Tech Stack:** Existing static dashboard HTML, vanilla JavaScript, Lucide icons, Jest, Supertest, Playwright through local Node.

---

### Task 1: Static UI Shell

**Files:**
- Modify: `app/public/dashboard.html`
- Test: `app/test/plugin-manager-listing.test.js`

- [ ] **Step 1: Update static test expectations**

Add assertions to `app/test/plugin-manager-listing.test.js` inside `includes store tab and opt-in community controls`:

```js
assert(dashboardHtml.includes('data-plugin-mode="store"'));
assert(dashboardHtml.includes('data-plugin-mode="installed"'));
assert(dashboardHtml.includes('data-plugin-mode="updates"'));
assert(dashboardHtml.includes('data-plugin-mode="sources"'));
assert(dashboardHtml.includes('id="plugin-store-category-chips"'));
assert(dashboardHtml.includes('id="plugin-store-detail-drawer"'));
assert(dashboardHtml.includes('id="plugin-store-sources-panel"'));
assert(managerScript.includes('currentStoreMode'));
assert(managerScript.includes('selectedStorePlugin'));
assert(managerScript.includes('renderStoreShell'));
assert(managerScript.includes('openStorePluginDetail'));
```

- [ ] **Step 2: Run the static test and confirm it fails**

Run:

```powershell
cd app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --silent plugin-manager-listing.test.js
```

Expected: failure mentioning missing `data-plugin-mode`, `plugin-store-category-chips`, or drawer hooks.

- [ ] **Step 3: Replace Plugin Store header controls**

In `app/public/dashboard.html`, replace the current two-button `plugin-tab-btn` block and the always-nearby `plugin-store-community-panel` with:

```html
<div id="plugin-store-mode-nav" style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
  <button class="plugin-mode-btn active" data-plugin-mode="store">...</button>
  <button class="plugin-mode-btn" data-plugin-mode="installed">...</button>
  <button class="plugin-mode-btn" data-plugin-mode="updates">...</button>
  <button class="plugin-mode-btn" data-plugin-mode="sources">...</button>
</div>
<div id="plugin-store-category-chips" style="display: none; ..."></div>
<div id="plugin-store-sources-panel" style="display: none;">...</div>
<div id="plugin-store-detail-drawer" aria-hidden="true" style="display: none;"></div>
```

Keep the existing upload, reload, search, filter, sort, and compact controls in place. They will be shown/hidden by JavaScript per mode.

- [ ] **Step 4: Run the static test and confirm HTML hooks pass**

Run the same Jest command. Expected remaining failures only for JavaScript hooks not implemented yet.

### Task 2: Store Mode State And Navigation

**Files:**
- Modify: `app/public/js/plugin-manager.js`
- Test: `app/test/plugin-manager-listing.test.js`

- [ ] **Step 1: Add state**

In the constructor, add:

```js
this.currentStoreMode = 'store';
this.selectedStorePlugin = null;
this.currentStoreCategory = 'all';
this.storeCategories = [
  { id: 'all', label: 'All', icon: 'layout-grid' },
  { id: 'featured', label: 'Featured', icon: 'sparkles' },
  { id: 'overlays', label: 'Overlays', icon: 'monitor-up' },
  { id: 'audio', label: 'Audio & TTS', icon: 'volume-2' },
  { id: 'games', label: 'Games', icon: 'gamepad-2' },
  { id: 'automation', label: 'Automation', icon: 'workflow' },
  { id: 'integrations', label: 'Integrations', icon: 'plug' },
  { id: 'utilities', label: 'Utilities', icon: 'wrench' },
  { id: 'open-beta', label: 'Open Beta', icon: 'flask-conical' }
];
```

- [ ] **Step 2: Bind mode and drawer events**

In `init()`, bind `.plugin-mode-btn` clicks to `setStoreMode(mode)`. Keep `.plugin-tab-btn` fallback support for older markup if any remains.

Add `keydown` listener:

```js
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') this.closeStorePluginDetail();
});
```

- [ ] **Step 3: Replace tab logic with mode logic**

Keep `setTab(tab)` as a compatibility wrapper:

```js
setTab(tab) {
  this.setStoreMode(tab === 'store' ? 'store' : 'installed');
}
```

Add `setStoreMode(mode)` that sets `currentStoreMode`, updates `.plugin-mode-btn.active`, shows category chips only for Store, shows sources panel only for Sources, closes drawer when leaving Store/Updates, and calls `applyFiltersAndSort()`.

- [ ] **Step 4: Run static test**

Run:

```powershell
cd app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --silent plugin-manager-listing.test.js
```

Expected: pass after Task 3 is complete.

### Task 3: Marketplace Store Rendering

**Files:**
- Modify: `app/public/js/plugin-manager.js`
- Test: `app/test/plugin-manager-listing.test.js`

- [ ] **Step 1: Add category and derived list helpers**

Add helpers:

```js
getStorePluginIcon(plugin) { ... }
isStorePluginFeatured(plugin) { ... }
getStorePluginCategory(plugin) { ... }
getStorePluginsForCurrentMode() { ... }
```

Category mapping:

- open beta if `channel === 'open-beta'`
- featured if preinstalled badge or ids `chatango`, `goals`, `lastevent-spotlight`, `soundboard`, `toptier`, `tts`, `webgpu-emoji-rain`
- audio for `tts`, `soundboard`, `music-bot`
- games for `game-engine`, `coinbattle`, `quiz-show`, `interactive-story`
- overlays for category/type `overlay`, ids containing `overlay`, `hud`, `spotlight`, `emoji-rain`
- integrations for `chatango`, `minecraft-connect`, `openshock`, `osc-bridge`, `vdoninja`, `api-bridge`
- automation for `advanced-timer`, `streamalchemy`, `gift-milestone`, `milestone-leaderboard`
- utilities fallback

- [ ] **Step 2: Render category chips**

Add `renderStoreCategoryChips()` that writes buttons into `#plugin-store-category-chips` and updates `currentStoreCategory`.

- [ ] **Step 3: Replace `renderStorePlugins()`**

Render:

- store header strip with source, plugin count, update count, community status
- featured row when in Store mode and not searching
- appstore grid using `renderStorePluginCard(plugin, { featured: false })`
- updates empty state for Updates mode
- source mode delegates to `renderSourcesPanel()`

- [ ] **Step 4: Add appstore cards**

Add `renderStorePluginCard(plugin, options)` with:

- generated icon/avatar
- badges
- title and one-line description
- category/version/source metadata
- primary action button
- `data-store-card`
- `data-store-detail`
- `data-store-action`

Cards must not include enable/disable/reload/delete manager controls.

- [ ] **Step 5: Bind card and action events**

Add `bindStoreCardEvents()`:

- card click opens detail drawer unless the click originated from a button
- detail button opens drawer
- action button calls `handleStorePluginAction(plugin)`

### Task 4: Detail Drawer

**Files:**
- Modify: `app/public/js/plugin-manager.js`

- [ ] **Step 1: Add drawer rendering methods**

Implement:

```js
openStorePluginDetail(sourceId, pluginId)
closeStorePluginDetail()
renderStorePluginDetail()
```

The drawer reads `selectedStorePlugin` and renders icon, title, badges, description, version, installed version, source, author, category, screenshots empty state, Open Beta note, and install/update/manage action.

- [ ] **Step 2: Add manage behavior**

`handleStorePluginAction(plugin)`:

- if package missing: open drawer
- if installed and no update: `setStoreMode('installed')`, set `searchQuery = plugin.id`, update `#plugin-search`, then filter
- otherwise call `installStorePlugin(sourceId, pluginId)`

- [ ] **Step 3: Bind drawer action**

Drawer action button uses `data-store-drawer-action` and calls `handleStorePluginAction(selectedStorePlugin)`.

### Task 5: Sources And Updates Modes

**Files:**
- Modify: `app/public/js/plugin-manager.js`
- Modify: `app/public/dashboard.html`

- [ ] **Step 1: Move community controls to Sources panel**

Keep existing `#plugin-community-disabled`, `#plugin-community-enabled`, `#enable-community-store-btn`, `#add-community-source-btn`, `#community-source-id`, `#community-source-name`, and `#community-source-url`, but place them under `#plugin-store-sources-panel`.

- [ ] **Step 2: Render source status**

Add `renderSourcesPanel()`:

- official source card
- current source list
- community disabled/enabled panels
- non-blocking source error list

- [ ] **Step 3: Updates mode**

`getStorePluginsForCurrentMode()` returns only `plugin.installed && plugin.updateAvailable` for updates.

`renderStoreShell()` shows `All plugins are up to date` if no updates.

### Task 6: Verification

**Files:**
- Test: `app/test/plugin-manager-listing.test.js`
- Runtime: local dashboard

- [ ] **Step 1: Run focused tests**

```powershell
cd app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --silent plugin-manager-listing.test.js plugin-store.test.js plugin-store-routes.test.js plugin-store-registry.test.js
```

Expected: all pass.

- [ ] **Step 2: Run lint and CSS build**

```powershell
cd app
npm run lint -- --quiet
npm run build:css
```

Expected: lint exit 0; CSS build exit 0.

- [ ] **Step 3: Run Playwright dashboard checks**

Start server with runtime Node and `PORT=3899`, then check:

- Store mode visible by default
- category chips visible
- `37` appstore cards visible
- Sources mode shows community opt-in
- card click opens drawer
- no false source warning

- [ ] **Step 4: Run full Jest suite if focused checks and browser checks pass**

```powershell
cd app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --silent --forceExit
```

Expected: `290 passed`, `2895 tests passed` or updated totals with no failures.
