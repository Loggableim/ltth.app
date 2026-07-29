# Connect 4 Timeout-Lockouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Connect-4 timeout lockouts configurable in minutes, visible in the streamer dashboard, and manually removable.

**Architecture:** Store `timeoutLockoutMinutes` in the existing normalized Connect-4 config. Keep the existing `game_player_lockouts` table and extend its database wrapper with active-list and delete operations. The dashboard uses two plugin routes and DOM-safe rendering to administer persistent lockouts.

**Tech Stack:** Node.js/CommonJS, better-sqlite3, Express-compatible plugin routes, vanilla browser JavaScript, Jest.

## Global Constraints

- Preserve the default 1,440-minute lockout for existing configurations.
- Accept whole minutes only: `0` disables future timeout lockouts; `1..10080` are valid enabled durations.
- The timeout path must use server-side normalized configuration only.
- Do not lock the host/streamer identity.
- Do not add Chat or overlay unlock commands.
- Render viewer-controlled names with `textContent`, never interpolated HTML.
- Add all new user-visible strings to `de`, `en`, `es`, and `fr` Game Engine locale files.

---

### Task 1: Add persistent active-lockout administration

**Files:**

- Modify: `app/plugins/game-engine/backend/database.js:1908-1956`
- Test: `app/plugins/game-engine/test/interactive-database.test.js:66-82`

**Interfaces:**

- Produces: `listActiveGamePlayerLockouts(now = Date.now()) -> Array<{ username, reason, expiresAt, remainingMs }>`
- Produces: `clearGamePlayerLockout(username) -> boolean`

- [ ] **Step 1: Write the failing database tests**

```js
test('lists only active game lockouts and removes expired rows', () => {
  database.setGamePlayerLockout('active-viewer', 'viewer_timeout', 60_000, 1_000);
  database.setGamePlayerLockout('expired-viewer', 'viewer_timeout', 1_000, 1_000);

  expect(database.listActiveGamePlayerLockouts(3_000)).toEqual([
    expect.objectContaining({ username: 'active-viewer', remainingMs: 58_000 })
  ]);
  expect(database.getActiveGamePlayerLockout('expired-viewer', 3_000)).toBeNull();
});

test('clears one persisted game lockout by username', () => {
  database.setGamePlayerLockout('unlock-me', 'viewer_timeout', 60_000, 1_000);
  database.setGamePlayerLockout('keep-me', 'viewer_timeout', 60_000, 1_000);

  expect(database.clearGamePlayerLockout('unlock-me')).toBe(true);
  expect(database.getActiveGamePlayerLockout('unlock-me', 1_001)).toBeNull();
  expect(database.getActiveGamePlayerLockout('keep-me', 1_001)).toEqual(expect.any(Object));
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-database.test.js`

Expected: FAIL because the two administration methods do not exist.

- [ ] **Step 3: Implement the database methods**

```js
listActiveGamePlayerLockouts(now = Date.now()) {
  const currentTime = Number.isFinite(Number(now)) ? Math.floor(Number(now)) : Date.now();
  this.db.prepare('DELETE FROM game_player_lockouts WHERE expires_at <= ?').run(currentTime);
  return this.db.prepare('SELECT username, reason, expires_at FROM game_player_lockouts ORDER BY expires_at ASC')
    .all()
    .map((row) => ({ username: row.username, reason: row.reason, expiresAt: Number(row.expires_at), remainingMs: Number(row.expires_at) - currentTime }));
}

clearGamePlayerLockout(username) {
  const normalizedUsername = this._normalizeGameAudioIdentifier(username);
  if (!normalizedUsername) return false;
  return this.db.prepare('DELETE FROM game_player_lockouts WHERE username = ?').run(normalizedUsername).changes > 0;
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-database.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/plugins/game-engine/backend/database.js app/plugins/game-engine/test/interactive-database.test.js
git commit -m "feat(game-engine): administer timeout lockouts"
```

### Task 2: Use normalized lockout minutes and expose dashboard routes

**Files:**

- Modify: `app/plugins/game-engine/main.js:99,158-182,1145-1214,812-839,2314-2348`
- Test: `app/plugins/game-engine/test/interactive-plugin-integration.test.js:340-405`

**Interfaces:**

- Consumes: `listActiveGamePlayerLockouts()` and `clearGamePlayerLockout(username)`.
- Produces: `GET /api/game-engine/connect4/lockouts`.
- Produces: `DELETE /api/game-engine/connect4/lockouts/:username`.
- Produces: normalized `config.timeoutLockoutMinutes`.

- [ ] **Step 1: Write failing plugin and route tests**

```js
test('uses configured timeout lockout minutes and skips zero minutes', () => {
  const { plugin } = createPlugin();
  plugin.db = {
    getGameConfig: jest.fn(() => ({ timeoutLockoutMinutes: 15 })),
    setGamePlayerLockout: jest.fn()
  };

  plugin._applyViewerTimeoutLockout({ reason: 'viewer_timeout', timedOutPlayerId: 'viewer' });
  expect(plugin.db.setGamePlayerLockout).toHaveBeenCalledWith('viewer', 'viewer_timeout', 15 * 60 * 1000);

  plugin.db.getGameConfig.mockReturnValue({ timeoutLockoutMinutes: 0 });
  plugin._applyViewerTimeoutLockout({ reason: 'viewer_timeout', timedOutPlayerId: 'no-lockout' });
  expect(plugin.db.setGamePlayerLockout).toHaveBeenCalledTimes(1);
});
```

Add a route test that registers the plugin, calls both routes, and asserts that the list/delete database methods receive the request username and return the refreshed list.

- [ ] **Step 2: Run test to verify RED**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-plugin-integration.test.js`

Expected: FAIL because the duration is fixed at `86400000` and the routes are absent.

- [ ] **Step 3: Implement minimal server behavior**

```js
// defaultConfigs.connect4
timeoutLockoutMinutes: 1440,

// normalizer and validator use validInteger(value, 0, 10080)
normalized.timeoutLockoutMinutes = validInteger(normalized.timeoutLockoutMinutes, 0, 10080)
  ? normalized.timeoutLockoutMinutes
  : defaults.timeoutLockoutMinutes;

// timeout handler
const config = this._getConfigWithDefaults('connect4', this.db.getGameConfig('connect4'));
if (config.timeoutLockoutMinutes === 0) return null;
const lockout = this.db.setGamePlayerLockout(viewerId, 'viewer_timeout', config.timeoutLockoutMinutes * 60 * 1000);

this.api.registerRoute('GET', '/api/game-engine/connect4/lockouts', (req, res) => {
  res.json({ lockouts: this.db.listActiveGamePlayerLockouts() });
});
this.api.registerRoute('DELETE', '/api/game-engine/connect4/lockouts/:username', (req, res) => {
  const removed = this.db.clearGamePlayerLockout(req.params.username);
  res.json({ success: true, removed, lockouts: this.db.listActiveGamePlayerLockouts() });
});
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-plugin-integration.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/plugins/game-engine/main.js app/plugins/game-engine/test/interactive-plugin-integration.test.js
git commit -m "feat(connect4): configure timeout lockout duration"
```

### Task 3: Add localized streamer-dashboard controls

**Files:**

- Modify: `app/plugins/game-engine/ui.html: Connect4 settings markup and save/load scripts`
- Modify: `app/plugins/game-engine/locales/de.json`
- Modify: `app/plugins/game-engine/locales/en.json`
- Modify: `app/plugins/game-engine/locales/es.json`
- Modify: `app/plugins/game-engine/locales/fr.json`
- Test: `app/plugins/game-engine/test/interactive-ui-contract.test.js`
- Test: `app/plugins/game-engine/test/ui-i18n.test.js`

**Interfaces:**

- Consumes: Task 2's GET and DELETE routes.
- Produces: `#connect4-timeout-lockout-minutes`, `#connect4-timeout-lockouts`, `loadConnect4TimeoutLockouts()`, and `unlockConnect4Player(username)`.

- [ ] **Step 1: Write failing UI and i18n tests**

```js
test('renders Connect4 timeout lockout controls and server-backed unlock actions', () => {
  const ui = readFileSync(uiPath, 'utf8');
  expect(ui).toContain('id="connect4-timeout-lockout-minutes"');
  expect(ui).toContain('id="connect4-timeout-lockouts"');
  expect(ui).toContain("fetch('/api/game-engine/connect4/lockouts')");
  expect(ui).toContain('textContent = lockout.username');
});
```

Extend the locale test so every `plugins.game-engine.ui.connect4.timeout_lockout_*` key is required and non-empty in all four locale files.

- [ ] **Step 2: Run tests to verify RED**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-ui-contract.test.js plugins/game-engine/test/ui-i18n.test.js`

Expected: FAIL because the controls, routes, and locale keys are absent.

- [ ] **Step 3: Implement accessible DOM-safe UI**

```html
<section class="card" id="connect4-timeout-lockout-card">
  <h3 data-i18n="plugins.game-engine.ui.connect4.timeout_lockout_title">Timeout-Sperren</h3>
  <label for="connect4-timeout-lockout-minutes" data-i18n="plugins.game-engine.ui.connect4.timeout_lockout_minutes">Sperrdauer nach Timeout (Minuten)</label>
  <input id="connect4-timeout-lockout-minutes" type="number" min="0" max="10080" step="1" value="1440">
  <p data-i18n="plugins.game-engine.ui.connect4.timeout_lockout_hint">0 deaktiviert die Sperre.</p>
  <div id="connect4-timeout-lockouts" aria-live="polite"></div>
</section>
```

```js
async function unlockConnect4Player(username) {
  const response = await fetch('/api/game-engine/connect4/lockouts/' + encodeURIComponent(username), { method: 'DELETE' });
  const data = await response.json();
  renderConnect4TimeoutLockouts(data.lockouts || []);
}

function renderConnect4TimeoutLockouts(lockouts) {
  const container = document.getElementById('connect4-timeout-lockouts');
  container.replaceChildren();
  for (const lockout of lockouts) {
    const username = document.createElement('span');
    username.textContent = lockout.username;
    const unlock = document.createElement('button');
    unlock.type = 'button';
    unlock.addEventListener('click', () => unlockConnect4Player(lockout.username));
  }
}
```

Include `timeoutLockoutMinutes` in Connect-4 config save/load and add all text keys in each locale.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-ui-contract.test.js plugins/game-engine/test/ui-i18n.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/plugins/game-engine/ui.html app/plugins/game-engine/locales app/plugins/game-engine/test/interactive-ui-contract.test.js app/plugins/game-engine/test/ui-i18n.test.js
git commit -m "feat(connect4): manage timeout lockouts in dashboard"
```

### Task 4: Verify the complete changed surface

**Files:**

- Verify: `app/plugins/game-engine/main.js`
- Verify: `app/plugins/game-engine/backend/database.js`
- Verify: `app/plugins/game-engine/ui.html`
- Verify: `app/plugins/game-engine/locales/{de,en,es,fr}.json`

- [ ] **Step 1: Run focused Game Engine regression suites**

Run: `node .\\node_modules\\jest\\bin\\jest.js --runInBand plugins/game-engine/test/interactive-database.test.js plugins/game-engine/test/interactive-plugin-integration.test.js plugins/game-engine/test/interactive-ui-contract.test.js plugins/game-engine/test/ui-i18n.test.js plugins/game-engine/test/interactive-controller.test.js`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run static validation**

Run: `npm run lint -- --quiet`

Run: `node -e "for (const f of ['de','en','es','fr']) JSON.parse(require('fs').readFileSync('plugins/game-engine/locales/' + f + '.json', 'utf8')); console.log('locale JSON valid')"`

Run: `git diff --check main...HEAD`

Expected: each command exits 0.

- [ ] **Step 3: Commit verification-only adjustments**

```powershell
git status --short
git add <the files changed by verification>
git commit -m "test(connect4): cover timeout lockout administration"
```
