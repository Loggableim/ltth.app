# Soundbot History Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Soundbot history tab into a responsive, searchable archive with server-side filters, useful playback/playlist actions, and regression-tested desktop/mobile behavior.

**Architecture:** Extend the existing `MusicCatalog.getHistory` query with validated filter/sort options and keep ban matching consistent with runtime ban rules. Add one replay route that reuses the existing resolver, ban, queue, and safety paths. Replace the history tab's accidental queue-grid markup with a dedicated responsive history card layout; keep feedback, bans, playlists, and clipboard actions on their existing route contracts.

**Tech Stack:** CommonJS Node.js, SQLite via `better-sqlite3`, Express-style plugin routes, static HTML/CSS/vanilla JavaScript, Jest, JSDOM, and the existing in-app browser workflow.

## Global Constraints

- Do not modify or reload the running Player while implementing or testing the history UI.
- Do not change MPV process management, Safety-Lock semantics, Auto-DJ selection, or the existing queue persistence contract.
- Use prepared SQLite statements and existing plugin APIs; do not add a database migration or persistent files under the plugin directory.
- Escape every dynamic value rendered into history HTML and use `target="_blank" rel="noreferrer"` for external source links.
- Keep all four plugin locale files (`de`, `en`, `es`, `fr`) complete for every new visible or ARIA label.
- Follow TDD for every new backend behavior: write a focused failing test, run it red, implement the smallest change, then run it green.
- Stage and commit only files belonging to the current history feature; preserve the four existing Safety-Lock worktree modifications and unrelated untracked artifacts.

---

## File Map

- Modify `app/plugins/music-bot/lib/music-catalog.js`: validated history query options, dynamic prepared filters, ban-aware count/page query, and event lookup data needed for replay.
- Modify `app/plugins/music-bot/main.js`: normalize history query parameters, return normalized filters, and register the history replay route.
- Modify `app/plugins/music-bot/ui.html`: history toolbar and accessible pagination/action containers.
- Modify `app/plugins/music-bot/assets/ui.js`: filter state, stale-response protection, history card rendering, pagination, replay, clipboard, playlist selection, feedback, ban refresh, and locale mappings.
- Modify `app/plugins/music-bot/assets/ui-style.css`: history-only card, toolbar, metadata, badges, action group, and responsive rules.
- Modify `app/plugins/music-bot/locales/de.json`, `en.json`, `es.json`, `fr.json`: history toolbar, outcome, action, status, and error copy.
- Modify `app/test/music-bot-catalog.test.js`: query/filter/sort/ban regression coverage.
- Modify `app/test/music-bot-playlist-routes.test.js`: history replay route behavior and safety handling using the established route harness.
- Modify `app/test/music-bot-admin-redesign-ui.test.js`: static history markup and CSS contracts.
- Modify `app/test/music-bot-runtime-ui-regression.test.js`: JSDOM interaction coverage for filter requests, stale responses, replay/playlist actions, and feedback rendering.
- Modify `app/test/music-bot-ui-i18n.test.js` and/or `app/test/music-bot-admin-catalog-i18n.test.js`: assert that all new runtime and markup keys resolve in every locale.

## Task 1: Add a filterable, sorted history query

**Files:**
- Modify: `app/plugins/music-bot/lib/music-catalog.js` near `getHistory()`.
- Test: `app/test/music-bot-catalog.test.js`.

**Interfaces:**
- Consumes: existing catalog tables `plugin_music_bot_play_events`, `plugin_music_bot_songs`, `plugin_music_bot_sources`, `plugin_music_bot_feedback`, artist links, and `plugin_music_bot_bans`.
- Produces: `getHistory({ limit, offset, q, outcome, feedback, banned, from, to, sort }) -> { items, total, limit, offset, filters }` with the existing item fields plus `feedback` and a boolean `banned`.

- [ ] **Step 1: Write failing catalog tests for the desired query contract.**

Add focused tests that create completed, skipped, early-skipped, failed, liked, and banned catalog events, then assert:

```js
expect(catalog.getHistory({ q: 'artist', limit: 10 }).items)
  .toEqual([expect.objectContaining({ title: 'Artist Song', artist: 'Artist' })]);
expect(catalog.getHistory({ outcome: 'failed' }).total).toBe(1);
expect(catalog.getHistory({ feedback: 'down' }).items[0].feedback).toBe('down');
expect(catalog.getHistory({ banned: 'only' }).items.every((item) => item.banned)).toBe(true);
expect(catalog.getHistory({ sort: 'finished_asc' }).items[0].finishedAt)
  .toBeLessThan(catalog.getHistory({ sort: 'finished_asc' }).items.at(-1).finishedAt);
```

Also assert that `from`/`to` are inclusive date boundaries, offsets apply after filtering, and an empty result returns `{ items: [], total: 0 }` without throwing.

- [ ] **Step 2: Run the catalog tests to verify the new assertions fail for the missing behavior.**

Run from `app`:

```powershell
npm test -- --runInBand test/music-bot-catalog.test.js
```

Expected: the new history filter assertions fail because `getHistory` currently ignores all options except `limit` and `offset`.

- [ ] **Step 3: Implement normalized query options and prepared SQL filters.**

Keep the existing projection and add a local option normalizer with these exact allow-lists:

```js
const allowedOutcomes = new Set(['completed', 'skipped', 'early_skip', 'failed']);
const allowedFeedback = new Set(['up', 'down', 'neutral']);
const allowedBanned = new Set(['only', 'exclude']);
const allowedSorts = new Set(['finished_desc', 'finished_asc']);
```

Build `WHERE` fragments and parameter arrays for title/artist/channel/requester search, outcome, canonical feedback state, inclusive timestamps, and a ban expression that matches URL, track, artist, keyword, and channel bans. Use the same ban types and value semantics as `BanList`; never concatenate user-provided values into SQL. Use the selected sort only to choose one of two constant `ORDER BY` clauses. Run a count query with the same filters before applying `LIMIT` and `OFFSET`.

- [ ] **Step 4: Run the catalog tests to verify the query is green.**

```powershell
npm test -- --runInBand test/music-bot-catalog.test.js
```

Expected: all catalog tests pass, including the new filter, sort, ban, date, pagination, and empty-result cases.

- [ ] **Step 5: Commit only the catalog implementation and tests.**

```powershell
git add app/plugins/music-bot/lib/music-catalog.js app/test/music-bot-catalog.test.js
git commit -m "feat: add soundbot history filters"
```

## Task 2: Expose normalized history filters and safe replay

**Files:**
- Modify: `app/plugins/music-bot/main.js` around the history route and request helpers.
- Test: `app/test/music-bot-playlist-routes.test.js` using its existing route registration harness.

**Interfaces:**
- Consumes: Task 1's `musicCatalog.getHistory(options)` and `getHistoryEvent(eventId)`, the existing `_handleDashboardRequest`, `_skipCurrent`, `_playNextFromQueue`, `_isSafetyLocked`, and `queueManager` APIs.
- Produces: `GET /api/plugins/music-bot/history` with normalized `filters`; `POST /api/plugins/music-bot/history/:eventId/replay` accepting `{ mode: 'queue' | 'play' }`.

- [ ] **Step 1: Write failing route tests for normalized filters and replay.**

Register the plugin routes with the existing fake API and assert:

```js
await history({ query: { q: '  Artist ', outcome: 'invalid', sort: 'finished_asc' } }, historyResponse);
expect(plugin.musicCatalog.getHistory).toHaveBeenCalledWith(expect.objectContaining({
  q: 'Artist', sort: 'finished_asc', outcome: ''
}));
expect(historyResponse.json).toHaveBeenCalledWith(expect.objectContaining({ filters: expect.any(Object) }));

plugin._handleDashboardRequest = jest.fn(async () => ({ success: true, song: { id: 'queued-1' } }));
await replay({ params: { eventId: 'event-1' }, body: { mode: 'queue' } }, replayResponse);
expect(plugin._handleDashboardRequest).toHaveBeenCalledWith('https://youtu.be/replay', 'dashboard');
```

Add cases for a missing history event, missing URL, invalid mode, safety-locked `play`, queue promotion for `play`, and a resolver/queue rejection that does not mutate the queue.

- [ ] **Step 2: Run the route test to verify it fails before the route exists.**

```powershell
npm test -- --runInBand test/music-bot-playlist-routes.test.js
```

Expected: the new history route lookup or replay assertions fail because the history handler has no query forwarding and no replay route.

- [ ] **Step 3: Normalize route input and add the replay handler.**

Normalize whitespace and allow-lists in `main.js`, pass the normalized object to `getHistory`, and return it as `filters`. For replay:

```js
const mode = req.body?.mode === 'play' ? 'play' : req.body?.mode === 'queue' ? 'queue' : null;
if (!mode) return res.status(400).json({ success: false, error: 'Invalid replay mode' });
if (mode === 'play' && this._isSafetyLocked()) return res.status(423).json(this._lockedResult());
```

Resolve the stored event, call `_handleDashboardRequest(event.url, 'dashboard')`, locate the returned queue song, and for `play` move it to index 0 before using the existing controlled advance path. Return `{ success, mode, song, position }` and preserve the existing status/error conventions. Do not add a second ban implementation.

- [ ] **Step 4: Run the route tests and the closest catalog suites.**

```powershell
npm test -- --runInBand test/music-bot-playlist-routes.test.js test/music-bot-catalog.test.js
```

Expected: the new route tests and all previously existing tests pass with zero failures.

- [ ] **Step 5: Commit only route changes and their tests.**

```powershell
git add app/plugins/music-bot/main.js app/test/music-bot-playlist-routes.test.js
git commit -m "feat: add soundbot history replay route"
```

## Task 3: Replace the history markup and CSS with a responsive layout

**Files:**
- Modify: `app/plugins/music-bot/ui.html` history panel.
- Modify: `app/plugins/music-bot/assets/ui-style.css` history-specific sections and responsive media queries.
- Test: `app/test/music-bot-admin-redesign-ui.test.js`.

**Interfaces:**
- Consumes: Task 1 response fields and the existing `track-ban-menu`, playlist panel, and tab accessibility contracts.
- Produces: unique IDs for `history-search`, `history-period`, `history-outcome`, `history-feedback-filter`, `history-banned`, `history-sort`, `history-reset`, `history-previous`, `history-next`, and `history-playlist-menu`; classes `.history-toolbar`, `.history-item`, `.history-item-main`, `.history-item-meta`, `.history-item-actions`.

- [ ] **Step 1: Write failing static UI/CSS regression assertions.**

Add tests that assert the history panel contains all controls, that the panel retains `role="tabpanel"`/`aria-labelledby`, that rendered history is not coupled to `.queue-item`, and that CSS includes narrow-width rules which stack `.history-item-actions` without horizontal overflow:

```js
expect(document.querySelector('#history-search')).not.toBeNull();
expect(document.querySelector('#history-next')).not.toBeNull();
expect(document.querySelector('#musicbot-panel-history .queue-item')).toBeNull();
expect(css).toMatch(/\.history-item\s*\{/);
expect(css).toMatch(/\.history-item-actions[\s\S]*?flex-wrap:\s*wrap/);
expect(css).toMatch(/@media\s*\(max-width:\s*440px\)[\s\S]*?\.history-item/);
```

- [ ] **Step 2: Run the UI test to verify it fails against the current bare panel.**

```powershell
npm test -- --runInBand test/music-bot-admin-redesign-ui.test.js
```

Expected: the new control and dedicated-class assertions fail because the panel only has `history-list` and `history-load-more`, while its rows use `queue-item`.

- [ ] **Step 3: Add accessible history controls and pagination markup.**

Place the controls below the card header, use native `input`, `select`, and `button` elements, keep labels visible or associated with `for`, and replace the single `Mehr laden` control with previous/next buttons plus a live page status. Keep the existing empty-state container and ban dialog unchanged.

- [ ] **Step 4: Add dedicated desktop/mobile CSS.**

Define a two-column history card with `min-width: 0`, `overflow-wrap: anywhere` for long titles/URLs, a bounded action group, and mobile rules that make the card single-column. Do not add `.history-item` to the queue selector block; the history layout must no longer inherit queue drag/cursor/grid rules.

- [ ] **Step 5: Run the UI test and CSS build.**

```powershell
npm test -- --runInBand test/music-bot-admin-redesign-ui.test.js
npm run build:css
```

Expected: the static UI contract passes and the CSS build exits 0.

- [ ] **Step 6: Commit only markup/style changes and their test.**

```powershell
git add app/plugins/music-bot/ui.html app/plugins/music-bot/assets/ui-style.css app/test/music-bot-admin-redesign-ui.test.js
git commit -m "fix: make soundbot history responsive"
```

## Task 4: Implement history state, cards, and actions

**Files:**
- Modify: `app/plugins/music-bot/assets/ui.js` history constants, refresh/render functions, event delegation, socket refresh, and locale maps.
- Test: `app/test/music-bot-runtime-ui-regression.test.js`.

**Interfaces:**
- Consumes: Task 2 API contracts and Task 3 element IDs/classes.
- Produces: `historyFilters` state, debounced server refresh, cards with metadata and actions, and no stale-response overwrite.

- [ ] **Step 1: Write failing JSDOM tests for the visible history workflow.**

Use the existing `bootMusicBotUi()` helper and assert that a history payload renders:

```js
expect(dom.window.document.querySelector('.history-item .history-item-meta').textContent)
  .toContain('Artist');
expect(dom.window.document.querySelector('[data-history-replay="queue"]')).not.toBeNull();
expect(dom.window.document.querySelector('[data-history-replay="play"]')).not.toBeNull();
```

Add tests that changing `history-outcome` requests `offset=0&outcome=failed`, previous/next update the offset, an older delayed response cannot replace a newer query result, replay posts the event ID and mode, playlist selection posts the catalog song ID and revision, and feedback still posts the canonical song ID.

- [ ] **Step 2: Run the focused runtime UI suite to observe the expected failures.**

```powershell
npm test -- --runInBand test/music-bot-runtime-ui-regression.test.js
```

Expected: the new selectors and request assertions fail because the current renderer has no filters, metadata, pagination, replay, playlist selector, or stale-response guard.

- [ ] **Step 3: Add the history state and request builder.**

Use one state object with these exact defaults:

```js
const historyFilters = {
  q: '', outcome: '', feedback: '', banned: '', from: '', to: '', sort: 'finished_desc'
};
let historyOffset = 0;
let historyTotal = 0;
let historyRequestGeneration = 0;
```

Build the URL with `URLSearchParams`, reset offset on every filter change, increment `historyRequestGeneration`, and render a response only if its generation matches the latest request. Keep socket history updates on the current visible filters.

- [ ] **Step 4: Render dedicated cards and metadata.**

Render escaped title, artist, requester, relative/local timestamp, duration, played seconds, outcome badge, provider/channel, banned badge, safe source link, copy button, replay buttons, playlist trigger, feedback buttons, and the existing ban trigger. Use a `formatHistoryOutcome` helper backed by `catalogTr` and keep `aria-pressed` on feedback buttons.

- [ ] **Step 5: Wire actions through existing contracts.**

Delegate clicks from `history-list`:

```js
await post(`/history/${eventId}/replay`, { mode: button.dataset.historyReplay });
await post(`/playlists/${playlistId}/items`, { songId, revision });
await post(`/catalog/songs/${songId}/feedback`, { state });
```

Refresh the queue/history after successful replay or ban updates, use the existing toast helper for failures, load playlist options once when the menu opens, and use `navigator.clipboard.writeText(item.url)` with a visible fallback toast on failure.

- [ ] **Step 6: Run the runtime UI tests and i18n static checks.**

```powershell
npm test -- --runInBand test/music-bot-runtime-ui-regression.test.js test/music-bot-ui-i18n.test.js test/music-bot-admin-catalog-i18n.test.js
```

Expected: history interactions, stale-response handling, and all locale-key checks pass.

- [ ] **Step 7: Commit only the UI behavior and tests.**

```powershell
git add app/plugins/music-bot/assets/ui.js app/test/music-bot-runtime-ui-regression.test.js app/test/music-bot-ui-i18n.test.js app/test/music-bot-admin-catalog-i18n.test.js
git commit -m "feat: expand soundbot history controls"
```

## Task 5: Complete translations and focused integration verification

**Files:**
- Modify: `app/plugins/music-bot/locales/de.json`.
- Modify: `app/plugins/music-bot/locales/en.json`.
- Modify: `app/plugins/music-bot/locales/es.json`.
- Modify: `app/plugins/music-bot/locales/fr.json`.
- Test: `app/test/music-bot-ui-i18n.test.js`, `app/test/music-bot-admin-catalog-i18n.test.js`.

**Interfaces:**
- Consumes: every literal key declared in `RUNTIME_I18N_SECTIONS` or `CATALOG_I18N_SECTIONS` by `ui.js`, plus every `data-i18n`/`data-i18n-aria-label` key added to `ui.html`.
- Produces: complete, placeholder-compatible history translations for all four locales.

- [ ] **Step 1: Add the new history locale keys in German first and write the locale assertions.**

Cover the toolbar labels, period/outcome/feedback/ban/sort options, empty/filter-empty copy, metadata labels, replay/queue/playlist/source/copy actions, pagination, status badges, and failure toasts. Assert each locale contains non-empty values and matching `{placeholder}` sets.

- [ ] **Step 2: Run the i18n suites to verify missing keys fail before the other locale entries exist.**

```powershell
npm test -- --runInBand test/music-bot-ui-i18n.test.js test/music-bot-admin-catalog-i18n.test.js
```

Expected: the test identifies missing or placeholder-incompatible history keys in at least the non-German locale files.

- [ ] **Step 3: Add reviewed English, Spanish, and French translations.**

Use the same JSON shape and preserve placeholders exactly. Do not add German fallback literals to the non-German files unless the i18n test's documented neutral-technical-term exception applies.

- [ ] **Step 4: Run the i18n suites and commit the locale changes.**

```powershell
npm test -- --runInBand test/music-bot-ui-i18n.test.js test/music-bot-admin-catalog-i18n.test.js
git add app/plugins/music-bot/locales/de.json app/plugins/music-bot/locales/en.json app/plugins/music-bot/locales/es.json app/plugins/music-bot/locales/fr.json app/test/music-bot-ui-i18n.test.js app/test/music-bot-admin-catalog-i18n.test.js
git commit -m "i18n: localize soundbot history controls"
```

## Task 6: Full focused verification and real browser workflow

**Files:**
- Inspect: all files changed by Tasks 1–5.
- No new production files.

**Interfaces:**
- Consumes: the complete history feature and its focused regression tests.
- Produces: evidence that desktop/mobile layout, filters, pagination, and a non-live-critical queue action work against the running app without disturbing the current Player.

- [ ] **Step 1: Run the complete focused Music Bot test set.**

```powershell
npm test -- --runInBand test/music-bot-catalog.test.js test/music-bot-playlist-routes.test.js test/music-bot-admin-redesign-ui.test.js test/music-bot-runtime-ui-regression.test.js test/music-bot-ui-i18n.test.js test/music-bot-admin-catalog-i18n.test.js test/music-bot-safety-runtime.test.js test/music-bot-process-registry.test.js
```

Expected: zero failures; the pre-existing Safety-Lock regression tests remain green.

- [ ] **Step 2: Run static project checks.**

```powershell
npm run build:css
npm run lint
git diff --check
```

Expected: all commands exit 0. Any CRLF warning from Git is noted separately from actual `diff --check` findings.

- [ ] **Step 3: Reload only the plugin UI in the in-app browser after code changes.**

Open `http://127.0.0.1:3000/plugins/music-bot/ui`, select `Verlauf`, and capture the current desktop layout. Verify the toolbar, metadata, badges, and actions are visible without queue-grid wrapping.

- [ ] **Step 4: Verify the mobile layout at 390×844.**

Set the browser viewport to `390×844`, reload the local page, select `Verlauf`, and verify the first cards have no horizontal overflow, buttons remain inside their card, and pagination is reachable. Reset the viewport afterward.

- [ ] **Step 5: Verify one read/filter workflow and one safe queue workflow.**

Use a filter that returns a known history result, verify the request URL contains the selected filter and the page status changes, then use `In Queue` on a historical item only if the UI indicates the action is available. Confirm the toast and queue state; do not use `Jetzt abspielen`, skip, pause, Safety-Lock, or any action that replaces the active live track during this validation.

- [ ] **Step 6: Inspect final diff and worktree boundaries.**

```powershell
git status --short
git diff --stat HEAD~5..HEAD
git diff -- app/plugins/music-bot/lib/playback-controller.js app/plugins/music-bot/lib/soundbot-process-registry.js app/test/music-bot-process-registry.test.js
```

Expected: feature commits contain only the planned files, the existing Safety-Lock files retain their original uncommitted changes, and unrelated untracked artifacts remain untouched.
