# Soundbot Admin Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a live-safe, fully redesigned Soundbot admin UI while fixing paused-request replacement, diagnostic label leakage, mixed localization, navigation semantics, and accessibility gaps.

**Architecture:** Preserve the plugin's API and functional DOM IDs while separating playback correctness, diagnostic sanitization, semantic navigation/layout, and localization into independently testable changes. The admin remains a CommonJS-backed plugin with a static HTML/CSS/JavaScript client; the running app is updated only after branch verification through a plugin-only reload.

**Tech Stack:** CommonJS Node.js, Jest, JSDOM, vanilla JavaScript, HTML, CSS, MPV IPC diagnostics, LTTH plugin i18n.

## Global Constraints

- Never restart the LTTH app; rollout is `music-bot` plugin-only.
- Preserve all existing Music Bot API routes, Socket.IO event names, persistent data, settings, queue, history, bans, catalog, and playlists.
- Preserve functional element IDs used by production JavaScript and existing tests unless a task explicitly updates every reference and regression test.
- Viewer requests have priority but never interrupt a currently playing or paused AutoDJ track.
- AutoDJ crossfade remains exactly 3 seconds unless the user changes the existing control.
- Diagnostics must not expose signed media URLs, query tokens, signatures, IP parameters, or expiry parameters.
- The redesigned UI must fit the integrated browser, avoid horizontal page overflow at 390 CSS pixels, and retain full keyboard operation.
- All new visible admin copy must exist in DE, EN, ES, and FR.
- Follow red-green-refactor for every production behavior change.
- Do not modify or restart the currently running Soundbot until the full branch verification gate passes.

---

### Task 1: Playback occupancy and safe diagnostics

**Files:**
- Modify: `app/plugins/music-bot/main.js`
- Modify: `app/plugins/music-bot/lib/playback-engine.js`
- Test: `app/test/music-bot-core-features.test.js`
- Test: `app/test/music-bot-playback-controller.test.js`

**Interfaces:**
- Consumes: `MusicBotPlugin._isPlaybackOccupied()`, `PlaybackController.isPlaying()`, `PlaybackEngine.getDiagnostics()`.
- Produces: request autoplay guards that distinguish idle from paused/occupied playback, and diagnostic `media.title` values that are safe for UI/export.

- [ ] **Step 1: Add failing paused-request regressions**

Add separate tests for `_handleDashboardRequest()` and `_handleRequest()` with a paused engine (`getState() => 'paused'`, `getNowPlaying() => currentTrack`, `isPlaying() => false`). Assert that the new request remains at queue position 1 and `_playNextFromQueue` is not called. Add a control test with `idle`, no current track, and AutoPlay enabled that expects `_playNextFromQueue` exactly once.

- [ ] **Step 2: Run the focused request tests and verify RED**

Run:

```powershell
cd app
npm test -- --runInBand test/music-bot-core-features.test.js
```

Expected: paused request tests fail because both request paths currently call `_playNextFromQueue()` when `isPlaying()` is false.

- [ ] **Step 3: Use playback occupancy for both request paths**

Replace both request guards with:

```js
if (!this._isPlaybackOccupied() && this.config.playback.autoPlay) {
  await this._playNextFromQueue();
}
```

Do not change the queue insertion, viewer priority, resolver, or idle autoplay behavior.

- [ ] **Step 4: Run the focused request tests and verify GREEN**

Run the command from Step 2. Expected: all tests in the file pass.

- [ ] **Step 5: Add a failing signed-title diagnostic regression**

In `music-bot-playback-controller.test.js`, cover MPV labels such as `webm&rqh=1&expire=999&sig=SECRET` and `videoplayback?expire=999&ip=127.0.0.1&signature=SECRET`. Assert that no secret/query fragment is exposed and that the canonical `nowPlaying.title` is returned instead.

- [ ] **Step 6: Run the diagnostic test and verify RED**

```powershell
cd app
npm test -- --runInBand test/music-bot-playback-controller.test.js
```

Expected: the new token-bearing fragment assertion fails because `_safeMediaTitle()` accepts fragments that do not begin with a URL scheme.

- [ ] **Step 7: Reject sensitive media labels and fall back canonically**

Add a private predicate in `playback-engine.js` that treats a title as unsafe when it contains URL-style secret parameters (`sig`, `signature`, `lsig`, `token`, `expire`, `ip`, or `key`) or a media-fragment prefix followed by parameter assignments. `_safeMediaTitle()` returns `null` for unsafe values; `getDiagnostics()` already falls back to `nowPlaying.title`.

- [ ] **Step 8: Run both focused suites and commit**

```powershell
cd app
npm test -- --runInBand test/music-bot-core-features.test.js test/music-bot-playback-controller.test.js
git add plugins/music-bot/main.js plugins/music-bot/lib/playback-engine.js test/music-bot-core-features.test.js test/music-bot-playback-controller.test.js
git commit -m "fix(music-bot): preserve paused playback and safe diagnostics"
```

Expected: both suites pass and the commit contains only Task 1 files.

---

### Task 2: Semantic navigation and broadcast-console redesign

**Files:**
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/music-bot/assets/ui-style.css`
- Create: `app/test/music-bot-admin-redesign-ui.test.js`

**Interfaces:**
- Consumes: all current functional element IDs and `setActiveTab(target)`.
- Produces: stable tab IDs `musicbot-tab-<name>`, panel IDs `musicbot-panel-<name>`, a standalone Queue panel, and responsive CSS layout tokens.

- [ ] **Step 1: Write failing semantic and responsive markup tests**

Create JSDOM/static-CSS tests that assert:

```js
expect(new Set(tabControls).size).toBe(tabs.length);
expect(tabControls.every((id) => document.getElementById(id))).toBe(true);
expect(panels.every((panel) => panel.getAttribute('aria-labelledby'))).toBe(true);
expect(document.querySelector('#musicbot-panel-queue #queue-panel')).not.toBeNull();
expect(document.querySelector('label[for="search-input"]')).not.toBeNull();
expect(document.querySelector('label[for="request-input"]')).not.toBeNull();
```

Also assert CSS contains a mobile breakpoint, `min-height: 44px` for primary controls, at least 20px checkbox sizing, `overflow-x` containment, and `prefers-reduced-motion` handling.

- [ ] **Step 2: Run the redesign test and verify RED**

```powershell
cd app
npm test -- --runInBand test/music-bot-admin-redesign-ui.test.js
```

Expected: the Queue panel relationship, labels, named IDs, and responsive design tokens are missing.

- [ ] **Step 3: Rebuild the page shell without changing functional IDs**

Restructure `ui.html` into:

```html
<div class="musicbot-shell">
  <header class="console-header">...</header>
  <section id="musicbot-safety-panel" class="safety-strip">...</section>
  <div class="console-workspace">
    <nav id="tab-bar" class="console-nav" aria-label="Soundbot sections">...</nav>
    <main class="console-main">...</main>
  </div>
</div>
```

Give every tab `id="musicbot-tab-<name>"`, `aria-controls="musicbot-panel-<name>"`, and every panel matching `id`, `role="tabpanel"`, `aria-labelledby`, and native `hidden` state. Move `#queue-panel` and all existing queue IDs into the standalone Queue panel. Add explicit visually-hidden labels for `#search-input` and `#request-input`. Keep safety, search, playback, settings, AutoDJ, aliases, moderation, overlay, history, catalog, and playlist IDs unchanged.

- [ ] **Step 4: Simplify tab behavior around the semantic contract**

Update `setActiveTab()` to target the exact panel name, remove the Queue-to-Player mapping and queue-only scroll special case, synchronize `active`, `aria-selected`, `tabindex`, `aria-hidden`, and `hidden`, then focus/scroll the newly selected panel without stealing focus from pointer users. Preserve ArrowLeft, ArrowRight, Home, and End behavior.

- [ ] **Step 5: Implement the responsive broadcast-console visual system**

In `ui-style.css`, implement:

- compact sticky header and safety strip;
- two-column workspace at wide sizes and a horizontal scrollable nav below 900px;
- a dominant Now Playing surface with grouped transport and seek controls;
- consistent cards, form fields, queue/history/playlist rows, focus rings, status chips, and destructive-action colors;
- 44px interactive hit areas, 20px checkboxes, no page-level horizontal overflow at 390px;
- responsive stacking below 720px and reduced-motion overrides.

Do not add remote assets, frameworks, a visualizer, or provider functionality.

- [ ] **Step 6: Run redesign and existing UI suites, then commit**

```powershell
cd app
npm test -- --runInBand test/music-bot-admin-redesign-ui.test.js test/music-bot-runtime-ui-regression.test.js test/music-bot-admin-safety-ui.test.js test/music-bot-admin-catalog-playlists-ui.test.js
git add plugins/music-bot/ui.html plugins/music-bot/assets/ui.js plugins/music-bot/assets/ui-style.css test/music-bot-admin-redesign-ui.test.js
git commit -m "feat(music-bot): redesign the live admin console"
```

Expected: semantic, keyboard, safety, playlist, and runtime UI tests pass.

---

### Task 3: Complete admin localization and cold-boot readiness

**Files:**
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/music-bot/locales/de.json`
- Modify: `app/plugins/music-bot/locales/en.json`
- Modify: `app/plugins/music-bot/locales/es.json`
- Modify: `app/plugins/music-bot/locales/fr.json`
- Modify: `app/test/music-bot-admin-catalog-i18n.test.js`
- Modify: `app/test/music-bot-ui-i18n.test.js`
- Modify: `app/test/music-bot-runtime-ui-regression.test.js`

**Interfaces:**
- Consumes: `window.i18n.ready`, `window.i18n.updateDOM()`, `tr()`, and `catalogTr()`.
- Produces: named `music_bot.ui.*` keys for every visible admin label and deferred Soundbot initialization.

- [ ] **Step 1: Add failing locale completeness tests**

Assert that the redesigned admin HTML contains no `data-i18n="generated.*"`, every `data-i18n`, placeholder, and aria-label key resolves to a non-empty value in DE/EN/ES/FR, and English output does not retain the audited German labels (`Musik Bot`, `Song anfordern`, `Queue leeren`, `Einstellungen`). Add a cold-boot JSDOM test with a deferred `window.i18n.ready` promise and assert that no API fetch/init occurs before it resolves and no `Not initialized yet` warning is emitted.

- [ ] **Step 2: Run i18n suites and verify RED**

```powershell
cd app
npm test -- --runInBand test/music-bot-admin-catalog-i18n.test.js test/music-bot-ui-i18n.test.js test/music-bot-runtime-ui-regression.test.js
```

Expected: generated keys, missing translations, mixed English/German output, and immediate `init()` violate the new assertions.

- [ ] **Step 3: Replace generated admin keys with named keys**

Organize new keys below `music_bot.ui` using `shell`, `tabs`, `player`, `queue`, `settings`, `autoDj`, `aliases`, `moderation`, `overlay`, `history`, `catalog`, `playlists`, `safety`, and `health`. Replace every visible admin `generated.*` reference in `ui.html`; keep dynamic text routed through `tr()` or `catalogTr()` with matching locale entries.

- [ ] **Step 4: Populate all four locale catalogs**

Add accurate DE, EN, ES, and FR strings for every new named key. Preserve variables such as `{title}`, `{count}`, `{current}`, and `{duration}` verbatim across languages. Do not copy German fallback text into EN/ES/FR.

- [ ] **Step 5: Defer UI initialization until i18n is ready**

Replace the direct `init()` call with:

```js
async function boot() {
  if (window.i18n?.ready) await window.i18n.ready;
  window.i18n?.updateDOM?.();
  await init();
}

boot().catch((error) => {
  console.error('[music-bot] UI initialization failed', error);
});
```

Ensure test harnesses without i18n still boot through optional chaining.

- [ ] **Step 6: Run i18n/runtime UI suites and commit**

```powershell
cd app
npm test -- --runInBand test/music-bot-admin-catalog-i18n.test.js test/music-bot-ui-i18n.test.js test/music-bot-runtime-ui-regression.test.js test/music-bot-admin-redesign-ui.test.js
git add plugins/music-bot/ui.html plugins/music-bot/assets/ui.js plugins/music-bot/locales/de.json plugins/music-bot/locales/en.json plugins/music-bot/locales/es.json plugins/music-bot/locales/fr.json test/music-bot-admin-catalog-i18n.test.js test/music-bot-ui-i18n.test.js test/music-bot-runtime-ui-regression.test.js
git commit -m "feat(music-bot): localize the redesigned admin UI"
```

Expected: all four locales resolve, cold boot is warning-free, and the UI suites pass.

---

### Task 4: Integrated-browser hardening and release verification

**Files:**
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/public/dashboard.html`
- Create or modify: `app/test/music-bot-admin-redesign-ui.test.js`
- Modify only when required by a reproduced defect: files already listed in Tasks 1-3.

**Interfaces:**
- Consumes: redesigned Soundbot iframe, dashboard theme observer, live Music Bot status/health APIs.
- Produces: guarded theme observers, browser-verified responsive UI, and release evidence.

- [ ] **Step 1: Add failing observer-guard tests**

Assert both the Soundbot and dashboard bootstraps capture an observer root and verify it is an element before calling `observe()`:

```js
if (root?.nodeType === 1) {
  observer.observe(root, options);
}
```

The test must exercise missing/invalid roots without throwing.

- [ ] **Step 2: Run the observer test and verify RED**

```powershell
cd app
npm test -- --runInBand test/music-bot-admin-redesign-ui.test.js
```

Expected: existing direct observer calls fail the guard contract.

- [ ] **Step 3: Guard both observer roots**

Use the exact element check for local and parent roots in `dashboard.html` and `plugins/music-bot/ui.html`. Keep cross-origin access inside `try/catch`; do not suppress unrelated errors globally.

- [ ] **Step 4: Run the full Music Bot verification gate**

```powershell
cd app
npm test -- --runInBand --testPathPattern music-bot
npm run build:css
npm run lint
git diff --check
```

Expected: 27 existing Music Bot suites plus the new redesign suite pass, CSS build and lint exit zero, and diff check reports nothing.

- [ ] **Step 5: Run global tests and classify only established baseline failures**

```powershell
cd app
npm test -- --runInBand
```

Expected: no Music Bot failure. Any unrelated pre-existing failures must be recorded by exact suite/test name and compared with the known baseline rather than changed in this branch.

- [ ] **Step 6: Commit hardening**

```powershell
git add public/dashboard.html plugins/music-bot/ui.html test/music-bot-admin-redesign-ui.test.js
git commit -m "fix(ui): harden embedded theme observers"
```

- [ ] **Step 7: Final review, active-main integration, and plugin-only live check**

After an independent whole-branch review has no open Critical or Important findings:

1. Verify the active runtime worktree and `main` are clean and still based on the expected commit.
2. Merge the reviewed branch into the active `main` worktree without restarting LTTH.
3. Reload only `music-bot`.
4. Open `/dashboard.html`, navigate to Music Bot through the integrated Browser, and verify Player, Queue, seek, pause/resume, History vote-neutral cycle, Catalog search, temporary Playlist CRUD cleanup, localization, diagnostic title safety, and browser console.
5. Leave the bot in the user's prior playback state; never auto-unlock or auto-start after a Safety Lock.

