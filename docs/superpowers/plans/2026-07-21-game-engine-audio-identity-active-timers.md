# Game Engine Audio, Identity and Active Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-event sound enable switches, readable leaderboard player names, and server-authoritative timers that run only for the currently visible interactive game.

**Architecture:** Add a small additive audio-state table alongside the existing custom-audio tables, resolve leaderboard presentation names without changing stable player keys, and make `InteractiveDisplayRouter` own viewer-timer pause/resume. Existing routes and global sound master switches remain compatible.

**Tech Stack:** CommonJS, Express-style plugin routes, Socket.IO, better-sqlite3, Jest/jsdom, browser HTML/JavaScript, LTTH JSON i18n.

## Global Constraints

- Preserve every existing game, statistic, custom audio file, runtime database and unrelated worktree change.
- Missing per-event audio state means enabled; disabled events must never fall back to default audio.
- Stable TikTok IDs remain internal identity keys; leaderboard `username` must contain a readable name whenever historical session data provides one.
- Only the server-selected `displaySessionId` in phase `playing` may have a running viewer deadline.
- Host FIFO head has display priority; without a host head, select the waiting viewer-turn session with the oldest `lastActivityAt`, then lowest `sessionId`.
- Paused viewer timers persist remaining milliseconds and resume from that exact value after board changes and plugin recovery.
- Keep all dashboard and overlay additions localized independently in DE/EN/ES/FR.
- Push only after the full Game Engine suite, app suite, lint, CSS build, translation validation and live-safe read-only checks pass.
- Reload only the Game Engine plugin; never restart the entire LTTH app.

---

### Task 1: Persist and expose per-event audio enable state

**Files:**
- Modify: `app/plugins/game-engine/backend/database.js`
- Modify: `app/plugins/game-engine/main.js`
- Test: `app/plugins/game-engine/test/interactive-database.test.js`
- Test: `app/plugins/game-engine/test/interactive-plugin-integration.test.js`

**Interfaces:**
- Produces: `database.isGameAudioEnabled(gameType, scopeId, audioEvent): boolean`
- Produces: `database.getGameAudioStates(gameType, scopeId): Record<string, boolean>`
- Produces: `database.setGameAudioEnabled(gameType, scopeId, audioEvent, enabled): boolean`
- Produces: `PUT /api/game-engine/audio-state/:gameType/:audioEvent` with `{ scopeId, enabled }`
- Produces: existing Connect4, wheel and slot settings responses with an `enabled` boolean per known event.

- [ ] **Step 1: Write failing persistence tests**

Add tests that prove absent rows are enabled, scopes do not leak, and toggling does not mutate custom media:

```js
test('stores per-event audio enable state with an enabled default', () => {
  expect(database.isGameAudioEnabled('connect4', 'default', 'piece_drop')).toBe(true);
  database.setGameAudioEnabled('connect4', 'default', 'piece_drop', false);
  expect(database.getGameAudioStates('connect4', 'default')).toMatchObject({ piece_drop: false });
  expect(database.isGameAudioEnabled('connect4', 'default', 'piece_drop')).toBe(false);
  expect(database.isGameAudioEnabled('wheel', '1', 'piece_drop')).toBe(true);
});
```

- [ ] **Step 2: Run the persistence test and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js`

Expected: FAIL because the three audio-state methods do not exist.

- [ ] **Step 3: Add the additive table and database methods**

Create the table during `initialize()` and implement strict string normalization:

```sql
CREATE TABLE IF NOT EXISTS game_audio_states (
  game_type TEXT NOT NULL,
  scope_id TEXT NOT NULL DEFAULT 'default',
  audio_event TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (game_type, scope_id, audio_event)
)
```

Use `INSERT ... ON CONFLICT DO UPDATE`; `isGameAudioEnabled()` must return `true` when no row exists.

- [ ] **Step 4: Run the persistence test and verify GREEN**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js`

Expected: PASS.

- [ ] **Step 5: Write failing route/settings tests**

Cover valid Connect4/wheel/slot requests and these stable HTTP 400 errors:

```js
expect(await invoke('PUT', '/api/game-engine/audio-state/connect4/unknown', {
  scopeId: 'default', enabled: false
})).toMatchObject({ status: 400, body: { error: 'invalid_audio_event' } });
```

Also assert that every known settings entry returns `enabled: true` without a saved row and the saved false value after toggling.

- [ ] **Step 6: Run the route tests and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-plugin-integration.test.js`

Expected: FAIL because the route and enriched settings payloads do not exist.

- [ ] **Step 7: Implement route validation and enriched payloads**

Define immutable event sets for Connect4, wheel and slot. Normalize scopes to `default`, numeric wheel ID or numeric machine ID. The route must emit the existing type-specific update event and this common event:

```js
this.io.emit('game-engine:audio-state-updated', {
  gameType,
  scopeId,
  audioEvent,
  enabled
});
```

Do not change upload/reset semantics; reset changes the source only and retains the audio-state row.

- [ ] **Step 8: Run focused tests and commit**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js plugins/game-engine/test/interactive-plugin-integration.test.js`

Expected: 2 suites PASS.

Commit: `feat(game-engine): add per-event audio state`

---

### Task 2: Honor audio switches in dashboard and overlays

**Files:**
- Modify: `app/plugins/game-engine/ui.html`
- Modify: `app/plugins/game-engine/overlay/connect4.html`
- Modify: `app/plugins/game-engine/overlay/wheel.html`
- Modify: `app/plugins/game-engine/overlay/slot.html`
- Test: `app/plugins/game-engine/test/interactive-ui-contract.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-contract.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-dom.test.js`

**Interfaces:**
- Consumes: enriched settings payloads and `PUT /api/game-engine/audio-state/:gameType/:audioEvent` from Task 1.
- Produces: one localized toggle beside every existing Connect4, wheel and slot sound row.
- Produces: overlay maps whose entries are `{ enabled: boolean, url?: string }`.

- [ ] **Step 1: Write failing UI and overlay tests**

Assert the dashboard contains `audio-toggle-btn`, sends `enabled`, and renders state from settings. In DOM tests, drive each overlay with `enabled: false` and assert no `Audio.play()` call occurs, including custom-source failure:

```js
applyAudioSettings({ piece_drop: { enabled: false, url: '/custom/drop.mp3' } });
expect(playEventSound('piece_drop')).toBe(false);
expect(window.Audio).not.toHaveBeenCalled();
```

Wheel tests must cover `spinning`, `prize1`, `prize2`, `prize3`, `lost`; slot tests must cover `spin`, `small_win`, `medium_win`, `big_win`, `jackpot`, `near_miss`, `reel_stop`.

- [ ] **Step 2: Run the UI/overlay tests and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-ui-contract.test.js plugins/game-engine/test/interactive-overlay-contract.test.js plugins/game-engine/test/interactive-overlay-dom.test.js`

Expected: FAIL because toggles and disabled playback guards are absent.

- [ ] **Step 3: Implement the dashboard toggles**

Use one event-delegated handler and a shared renderer rather than one listener per row:

```js
async function setAudioEventEnabled(button) {
  const enabled = button.dataset.enabled !== 'true';
  const response = await fetch(`/api/game-engine/audio-state/${button.dataset.gameType}/${button.dataset.audioEvent}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scopeId: button.dataset.scopeId, enabled })
  });
  if (!response.ok) throw new Error((await response.json()).error);
  button.dataset.enabled = String(enabled);
  renderAudioToggle(button, enabled);
}
```

Keep preview available while muted. Upload and reset must re-render without silently enabling the event.

- [ ] **Step 4: Implement disabled playback guards**

Connect4 `playEventSound`, wheel spin/result selection and slot `playAudio` must return before constructing or playing audio when the event is disabled. Socket update listeners reload settings without replaying a sound.

- [ ] **Step 5: Run focused tests and commit**

Run the three suites from Step 2.

Expected: 3 suites PASS.

Commit: `feat(game-engine): add individual sound toggles`

---

### Task 3: Resolve readable names in every Game Engine leaderboard

**Files:**
- Modify: `app/plugins/game-engine/backend/database.js`
- Test: `app/plugins/game-engine/test/interactive-database.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-dom.test.js`

**Interfaces:**
- Produces: `database.resolveLeaderboardIdentity(playerId): { playerId: string, username: string }`
- Produces: daily, season, lifetime, ELO and streak rows with readable `username` and stable `playerId`.

- [ ] **Step 1: Write failing historical-name tests**

Insert a completed game/stat row keyed by `7446102145268843553` and an interactive row with `viewer_display_name = 'Sam'`. Assert aggregation remains keyed once while presentation is readable:

```js
expect(database.getLifetimeLeaderboard('connect4', 10)[0]).toMatchObject({
  playerId: '7446102145268843553',
  username: 'Sam'
});
```

Add a nonnumeric username case and an unresolved numeric fallback case.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js`

Expected: FAIL with numeric `username` and no `playerId`.

- [ ] **Step 3: Implement presentation-only identity resolution**

Resolve the newest nonempty `viewer_display_name` from `game_interactive_sessions` by stable `viewer_id`; never group by the resolved name and never update `game_sessions` or `game_player_stats`:

```js
resolveLeaderboardIdentity(playerId) {
  const stableId = String(playerId);
  const identity = this.db.prepare(`
    SELECT viewer_display_name FROM game_interactive_sessions
    WHERE viewer_id = ? AND TRIM(viewer_display_name) <> ''
    ORDER BY updated_at DESC LIMIT 1
  `).get(stableId);
  return { playerId: stableId, username: identity?.viewer_display_name || stableId };
}

_presentLeaderboardRows(rows) {
  return rows.map(row => {
    const identity = this.resolveLeaderboardIdentity(row.username);
    return { ...row, ...identity };
  });
}
```

Apply it to streak, daily, season, lifetime and ELO getters after their existing ordering/limit logic.

- [ ] **Step 4: Add overlay assertion and run focused tests**

Assert Connect4 leaderboard rendering uses the readable `username` and never replaces it with `playerId`.

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js plugins/game-engine/test/interactive-overlay-dom.test.js`

Expected: 2 suites PASS.

- [ ] **Step 5: Commit**

Commit: `fix(game-engine): show names in leaderboards`

---

### Task 4: Make viewer timers follow the authoritative display

**Files:**
- Modify: `app/plugins/game-engine/backend/database.js`
- Modify: `app/plugins/game-engine/backend/interactive-session-registry.js`
- Modify: `app/plugins/game-engine/backend/interactive-turn-timers.js`
- Modify: `app/plugins/game-engine/backend/interactive-display-router.js`
- Modify: `app/plugins/game-engine/backend/interactive-controller.js`
- Modify: `app/plugins/game-engine/overlay/connect4.html`
- Modify: `app/plugins/game-engine/overlay/unified.html`
- Test: `app/plugins/game-engine/test/interactive-database.test.js`
- Test: `app/plugins/game-engine/test/interactive-timers-router.test.js`
- Test: `app/plugins/game-engine/test/interactive-controller.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-contract.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-dom.test.js`

**Interfaces:**
- Produces: persisted `viewerTimeRemainingMs` mapped to `viewer_time_remaining_ms`.
- Produces: `timers.prepareViewer(session, seconds)`, `timers.resumeViewer(session)`, `timers.pauseViewer(session)`, and existing `clearViewer` clearing both timer fields.
- Produces: `InteractiveTurnTimers` constructor dependency `getDisplaySessionId(): number|null` for stale-timeout rejection.
- Produces: router selection `queue.head()` first, otherwise oldest active viewer-turn session.

- [ ] **Step 1: Write failing database and timer unit tests**

Cover persistence and exact pause/resume arithmetic:

```js
const active = session({ viewerTimeRemainingMs: 5000 });
sessions.set(1, active);
timers.resumeViewer(active);
jest.advanceTimersByTime(2000);
expect(timers.pauseViewer(active)).toBe(3000);
expect(active.viewerDeadlineMs).toBeNull();
jest.advanceTimersByTime(10000);
expect(onViewerTimeout).not.toHaveBeenCalled();
timers.resumeViewer(active);
jest.advanceTimersByTime(3000);
expect(onViewerTimeout).toHaveBeenCalledTimes(1);
```

Also assert a timeout is ignored when `getDisplaySessionId()` no longer matches.

- [ ] **Step 2: Run unit tests and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js plugins/game-engine/test/interactive-timers-router.test.js`

Expected: FAIL because remaining-time persistence and methods are absent.

- [ ] **Step 3: Implement persistence and timer primitives**

Add `viewer_time_remaining_ms INTEGER` with a guarded `ALTER TABLE` for existing databases. A running timer has deadline plus an in-memory start record; a paused timer has `viewerDeadlineMs = null` and a nonnegative remaining value. Persist both fields atomically in each transition.

- [ ] **Step 4: Write failing router selection tests**

Cover:

- host FIFO head always beats viewer sessions,
- with no host head, lowest `lastActivityAt` is displayed,
- changing display pauses the old viewer and resumes the new viewer,
- animation/result/leaderboard/suspend pause viewer time,
- resume restarts only the same displayed session.

- [ ] **Step 5: Run router tests and verify RED**

Run the `interactive-timers-router.test.js` suite.

Expected: FAIL because the router only selects host queue entries and only controls chess host clocks.

- [ ] **Step 6: Implement router ownership**

Replace host-only helpers with `_pauseDisplayedTimers()` and `_resumeDisplayedTimers()`. Determine the fallback with:

```js
_nextViewerSession() {
  return this.registry.list()
    .filter(row => row.status === 'active' && row.turnRole === 'viewer')
    .sort((a, b) => (a.lastActivityAt - b.lastActivityAt) || (a.sessionId - b.sessionId))[0] || null;
}
```

Only `_resumeDisplayedTimers()` when phase is `playing` and not suspended.

- [ ] **Step 7: Write failing controller/recovery tests**

Assert new viewer turns are prepared but not scheduled before router selection; host-move animation consumes no viewer time; multiple sessions leave exactly one deadline; recovery pauses old absolute deadlines before routing; timer-disabled sessions have both fields null.

- [ ] **Step 8: Run controller tests and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-controller.test.js`

Expected: FAIL against eager `viewerDeadlineMs` creation.

- [ ] **Step 9: Integrate controller and recovery**

Replace eager deadlines with `prepareViewer()`, let router transitions call `resumeViewer()`, and reconstruct legacy recovered rows from saved remaining time or `max(0, oldDeadline - now)`. Timeout handling must confirm the current router snapshot still displays the session.

- [ ] **Step 10: Remove overlay display invention**

Delete the direct and Unified overlay fallback that fabricates a playing display from `activeSessions.length === 1`. Keep rendering only `state.display` from the server.

- [ ] **Step 11: Run all focused timer/overlay suites and commit**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-database.test.js plugins/game-engine/test/interactive-timers-router.test.js plugins/game-engine/test/interactive-controller.test.js plugins/game-engine/test/interactive-overlay-contract.test.js plugins/game-engine/test/interactive-overlay-dom.test.js`

Expected: 5 suites PASS.

Commit: `fix(game-engine): pause timers for hidden games`

---

### Task 5: Localize, verify, publish and reload safely

**Files:**
- Modify: `app/locales/de.json`
- Modify: `app/locales/en.json`
- Modify: `app/locales/es.json`
- Modify: `app/locales/fr.json`
- Test: `app/plugins/game-engine/test/ui-i18n.test.js`
- Test: `app/plugins/game-engine/test/interactive-ui-contract.test.js`

**Interfaces:**
- Consumes: dashboard toggle states and stable API errors from Tasks 1-2.
- Produces: independent `audio.enabled`, `audio.disabled`, `audio.enable`, `audio.disable`, `audio.state_updated`, and `audio.state_update_failed` leaves in all four locales.

- [ ] **Step 1: Write failing locale-parity tests**

Assert all six keys exist and each locale has its own expected translated value rather than copying German or English.

- [ ] **Step 2: Run locale tests and verify RED**

Run: `cd app && npm test -- --runInBand plugins/game-engine/test/ui-i18n.test.js plugins/game-engine/test/interactive-ui-contract.test.js`

Expected: FAIL with missing keys.

- [ ] **Step 3: Add DE/EN/ES/FR text and replace remaining new literals**

Use these meanings consistently:

```text
DE: Aktiviert / Deaktiviert / Aktivieren / Deaktivieren
EN: Enabled / Disabled / Enable / Disable
ES: Activado / Desactivado / Activar / Desactivar
FR: Active / Desactive / Activer / Desactiver
```

- [ ] **Step 4: Run focused and complete verification**

Run in `app/`:

```powershell
npm test -- --runInBand plugins/game-engine/test
npm run i18n:check
npm run lint
npm run build:css
npm test -- --runInBand
```

Expected: all commands exit 0. Verify `git diff --check` and confirm `app/locales/validation-report.json` is unchanged.

- [ ] **Step 5: Browser-check direct and Unified overlays**

Open the Game Engine dashboard, direct Connect4 overlay and Unified overlay against the running app. Confirm one toggle per sound, readable leaderboard names, one active countdown, paused hidden boards and no sound when a selected event is disabled.

- [ ] **Step 6: Commit final localization/test adjustments**

Commit: `test(game-engine): cover audio identity and active timers`

- [ ] **Step 7: Push directly to main and reload only Game Engine**

Fetch `origin/main`, verify fast-forward ancestry, then push `HEAD:main`. Use the running LTTH plugin reload endpoint/action for `game-engine` only. Do not stop PID 75364 or restart `server.js`.

- [ ] **Step 8: Read-only live verification**

Verify remote `main` contains the final commit, the Game Engine plugin reports loaded, daily/season leaderboard endpoints return readable names, the interactive state has at most one viewer deadline, and OBS/direct overlay routes return successfully.
