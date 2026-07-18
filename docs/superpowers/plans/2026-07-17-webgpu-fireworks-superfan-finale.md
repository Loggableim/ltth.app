# WebGPU Fireworks Superfan Finale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Celebrate each entering Superfan with the requested notification and a configurable choreographed finale no more than once per selected cooldown per person.

**Architecture:** Keep detection and orchestration inside `webgpu-fireworks`: normalize paid-subscriber `join` events and authoritative `subscribe`/`superfan` events into one handler, use a small persistent history component for per-person cooldowns, and submit accepted celebrations to the existing follower-animation channel and finale FIFO. Add only three normalized settings (enabled, cooldown hours, intensity); show style and length continue to inherit the global finale settings.

**Tech Stack:** CommonJS Node.js, plugin data directory JSON persistence, Jest, static HTML/JavaScript settings UI, Socket.IO emissions through `PluginAPI`.

## Global Constraints

- `join` qualifies only with explicit paid-subscriber status; `teamMemberLevel` alone never qualifies. `subscribe` and dedicated `superfan` events are authoritative.
- Cooldown identity order is stable `userId`, then normalized `uniqueId`, `username`, or nickname.
- Cooldown choices are exactly 6, 12, 24, 72, and 168 hours; default is 24.
- Finale intensity is clamped to 1 through 10; default is 3.
- The visible copy is exactly `Superfan joined, this firework is for you!`.
- Superfan show style and length inherit `goalFinaleStyle` and `goalFinaleLength`.
- The test endpoint bypasses and does not update real cooldown history.
- Persistent data belongs under `api.getPluginDataDir()`, never in the plugin source tree.
- Do not modify or stage the existing Music-Bot changes or `runtime/launcher_settings.json`.
- Do not restart the server during the active stream; the final live step may reload only `webgpu-fireworks`.

---

## File Structure

- Create `app/plugins/webgpu-fireworks/lib/superfan-finale-history.js`: identity normalization, eligibility calculation, pruning, safe load, and replace-safe persistence.
- Modify `app/plugins/webgpu-fireworks/lib/config-schema.js`: defaults and normalization for the three new settings.
- Modify `app/plugins/webgpu-fireworks/main.js`: history lifecycle, event handlers, notification/finale submission, and test route.
- Modify `app/plugins/webgpu-fireworks/ui/settings.html`: Superfan Finale controls.
- Modify `app/plugins/webgpu-fireworks/ui/settings.js`: load/save wiring and test request.
- Modify `app/plugins/webgpu-fireworks/locales/{de,en,es,fr}.json`: settings labels and test feedback.
- Modify `app/plugins/webgpu-fireworks/README.md`: document event semantics, defaults, and persistence.
- Create `app/test/webgpu-fireworks-superfan-finale.test.js`: config, history, event routing, cooldown, persistence, payload, and test endpoint coverage.
- Create `app/test/webgpu-fireworks-superfan-finale-settings.test.js`: settings markup/script/localization contract.

---

### Task 1: Config Contract and Persistent Per-Person History

**Files:**
- Create: `app/plugins/webgpu-fireworks/lib/superfan-finale-history.js`
- Modify: `app/plugins/webgpu-fireworks/lib/config-schema.js`
- Modify: `app/plugins/webgpu-fireworks/main.js:493-510`
- Create: `app/test/webgpu-fireworks-superfan-finale.test.js`

**Interfaces:**
- Produces: `SUPERFAN_FINALE_COOLDOWN_HOURS: number[]` from `config-schema.js`.
- Produces: `normalizeSuperfanIdentity(data): string|null`.
- Produces: `new SuperfanFinaleHistory({ filePath, log?, now? })` with `load()`, `isEligible(identity, cooldownHours, at?)`, `markAccepted(identity, at?)`, `getLastAcceptedAt(identity)`, and `snapshot()`.
- Consumes: Node `fs` and `path`; no plugin API dependency inside the history component.

- [ ] **Step 1: Write failing config and history tests**

Create the test with real temporary directories and cleanup:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DEFAULT_FIREWORKS_CONFIG,
  SUPERFAN_FINALE_COOLDOWN_HOURS,
  normalizeConfig
} = require('../plugins/webgpu-fireworks/lib/config-schema');
const {
  SuperfanFinaleHistory,
  normalizeSuperfanIdentity
} = require('../plugins/webgpu-fireworks/lib/superfan-finale-history');

describe('WebGPU Superfan finale foundation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-superfan-finale-'));
  });

  afterEach(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  test('normalizes supported cooldowns and intensity', () => {
    expect(SUPERFAN_FINALE_COOLDOWN_HOURS).toEqual([6, 12, 24, 72, 168]);
    expect(normalizeConfig({ superfanFinaleCooldownHours: 12, superfanFinaleIntensity: 99 }))
      .toMatchObject({ superfanFinaleEnabled: true, superfanFinaleCooldownHours: 12, superfanFinaleIntensity: 10 });
    expect(normalizeConfig({ superfanFinaleCooldownHours: 13, superfanFinaleIntensity: 0 }))
      .toMatchObject({
        superfanFinaleCooldownHours: DEFAULT_FIREWORKS_CONFIG.superfanFinaleCooldownHours,
        superfanFinaleIntensity: 1
      });
  });

  test('prefers stable user id and normalizes handle fallbacks', () => {
    expect(normalizeSuperfanIdentity({ userId: 42, uniqueId: 'Ignored' })).toBe('id:42');
    expect(normalizeSuperfanIdentity({ uniqueId: '  Fan.Name  ' })).toBe('user:fan.name');
    expect(normalizeSuperfanIdentity({})).toBeNull();
  });

  test('persists independent timestamps and safely ignores corrupt JSON', () => {
    const filePath = path.join(tempDir, 'superfan-finales.json');
    let now = 1_000_000;
    const first = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(first.load()).toBe(0);
    first.markAccepted('id:a');
    expect(first.isEligible('id:a', 6, now + 6 * 60 * 60 * 1000 - 1)).toBe(false);
    expect(first.isEligible('id:a', 24, now + 12 * 60 * 60 * 1000)).toBe(false);
    expect(first.isEligible('id:a', 12, now + 12 * 60 * 60 * 1000)).toBe(true);
    expect(first.isEligible('id:b', 6, now)).toBe(true);

    const second = new SuperfanFinaleHistory({ filePath, now: () => now });
    expect(second.load()).toBe(1);
    expect(second.getLastAcceptedAt('id:a')).toBe(now);

    fs.writeFileSync(filePath, '{broken', 'utf8');
    const warnings = [];
    const corrupt = new SuperfanFinaleHistory({ filePath, log: message => warnings.push(message) });
    expect(corrupt.load()).toBe(0);
    expect(corrupt.snapshot()).toEqual({});
    expect(warnings).toHaveLength(1);
  });

  test('keeps the in-memory cooldown when persistence fails', () => {
    const warnings = [];
    const history = new SuperfanFinaleHistory({
      filePath: path.join(tempDir, 'unwritable.json'),
      log: message => warnings.push(message),
      now: () => 1234
    });
    jest.spyOn(history, 'save').mockImplementation(() => { throw new Error('disk full'); });
    history.markAccepted('id:a');
    expect(history.getLastAcceptedAt('id:a')).toBe(1234);
    expect(warnings).toEqual([expect.stringContaining('disk full')]);
  });
});
```

- [ ] **Step 2: Run the test and confirm RED**

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
```

Expected: FAIL because `lib/superfan-finale-history.js` and the Superfan config exports do not exist.

- [ ] **Step 3: Add config defaults and normalization**

In `lib/config-schema.js`, export the allowed list, add defaults beside the goal-finale defaults, and normalize them:

```js
const SUPERFAN_FINALE_COOLDOWN_HOURS = Object.freeze([6, 12, 24, 72, 168]);

// DEFAULT_FIREWORKS_CONFIG
superfanFinaleEnabled: true,
superfanFinaleCooldownHours: 24,
superfanFinaleIntensity: 3,

// normalizeConfig result
superfanFinaleEnabled: normalizeBoolean(source.superfanFinaleEnabled, defaults.superfanFinaleEnabled),
superfanFinaleCooldownHours: SUPERFAN_FINALE_COOLDOWN_HOURS.includes(Number(source.superfanFinaleCooldownHours))
  ? Number(source.superfanFinaleCooldownHours)
  : defaults.superfanFinaleCooldownHours,
superfanFinaleIntensity: clampNumber(source.superfanFinaleIntensity, 1, 10, defaults.superfanFinaleIntensity),
```

Mirror the same three defaults in `main.js`'s existing `defaultConfig` object so old saved configurations merge consistently before `normalizeConfig()`.

- [ ] **Step 4: Implement the focused history component**

Use this public shape in `lib/superfan-finale-history.js`:

```js
const fs = require('fs');
const path = require('path');

const MAX_HISTORY_AGE_MS = 168 * 60 * 60 * 1000;

function normalizeSuperfanIdentity(data = {}) {
  const userId = String(data.userId ?? data.user?.id ?? '').trim();
  if (userId) return `id:${userId}`;
  const handle = String(data.uniqueId || data.username || data.nickname || '').trim().toLowerCase();
  return handle ? `user:${handle}` : null;
}

class SuperfanFinaleHistory {
  constructor({ filePath, log = () => {}, now = () => Date.now() }) {
    this.filePath = filePath;
    this.log = log;
    this.now = now;
    this.entries = new Map();
  }

  load() {
    this.entries.clear();
    if (!fs.existsSync(this.filePath)) return 0;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const cutoff = this.now() - MAX_HISTORY_AGE_MS;
      for (const [identity, timestamp] of Object.entries(parsed.entries || {})) {
        if (typeof identity === 'string' && Number.isFinite(timestamp) && timestamp >= cutoff) {
          this.entries.set(identity, timestamp);
        }
      }
      return this.entries.size;
    } catch (error) {
      this.log(`Failed to load Superfan finale history: ${error.message}`);
      return 0;
    }
  }

  isEligible(identity, cooldownHours, at = this.now()) {
    const last = this.entries.get(identity);
    return !Number.isFinite(last) || at - last >= cooldownHours * 60 * 60 * 1000;
  }

  markAccepted(identity, at = this.now()) {
    this.entries.set(identity, at);
    try {
      this.save();
    } catch (error) {
      this.log(`Failed to persist Superfan finale history: ${error.message}`);
    }
    return at;
  }

  getLastAcceptedAt(identity) { return this.entries.get(identity) ?? null; }
  snapshot() { return Object.fromEntries(this.entries); }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify({ version: 1, entries: this.snapshot() }, null, 2), 'utf8');
    try {
      fs.renameSync(tempPath, this.filePath);
    } catch (error) {
      if (process.platform !== 'win32' || !fs.existsSync(this.filePath)) throw error;
      fs.rmSync(this.filePath, { force: true });
      fs.renameSync(tempPath, this.filePath);
    }
  }
}

module.exports = { MAX_HISTORY_AGE_MS, SuperfanFinaleHistory, normalizeSuperfanIdentity };
```

Add `SUPERFAN_FINALE_COOLDOWN_HOURS` to `module.exports` in `config-schema.js` next to the existing finale constants.

- [ ] **Step 5: Run GREEN and commit only foundation files**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
git diff --check -- plugins/webgpu-fireworks/lib/config-schema.js plugins/webgpu-fireworks/lib/superfan-finale-history.js plugins/webgpu-fireworks/main.js test/webgpu-fireworks-superfan-finale.test.js
git add plugins/webgpu-fireworks/lib/config-schema.js plugins/webgpu-fireworks/lib/superfan-finale-history.js plugins/webgpu-fireworks/main.js test/webgpu-fireworks-superfan-finale.test.js
git commit -m "feat(webgpu-fireworks): persist superfan finale cooldowns"
```

Expected: the focused suite passes; the commit contains no Music-Bot or runtime file.

---

### Task 2: Event Routing, Exact Notification, and Finale Submission

**Files:**
- Modify: `app/plugins/webgpu-fireworks/main.js:36-140, 738-754, 963-1005, 1281-1340, 1489-1575, 1790-1830`
- Modify: `app/test/webgpu-fireworks-superfan-finale.test.js`

**Interfaces:**
- Consumes: `SuperfanFinaleHistory` and `normalizeSuperfanIdentity` from Task 1.
- Produces: `handleSuperfanEntry(data, options?): { accepted: boolean, reason?: string, identity?: string, finale?: object }`.
- Produces: `scheduleFollowerAnimation(payload, delayMs)` and `notificationTimers: Set<Timeout>` so unload cancels delayed follower notifications.
- Produces: `POST /api/webgpu-fireworks/test-superfan` returning `{ success, accepted, reason?, finale? }` without history mutation.

- [ ] **Step 1: Extend the test with event and payload expectations**

Add this reusable plugin factory below the Task 1 tests, using the existing per-test `tempDir`:

```js
const FireworksPlugin = require('../plugins/webgpu-fireworks/main');

function createApi() {
  const routes = new Map();
  const events = new Map();
  return {
    routes,
    events,
    getPluginDataDir: () => tempDir,
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerTikTokEvent: jest.fn((event, handler) => events.set(event, handler))
  };
}

function createPlugin(config = {}, now = 1_000_000) {
  const api = createApi();
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig(config);
  plugin.upload = { single: jest.fn(() => (req, res, next) => next()) };
  const history = new SuperfanFinaleHistory({
    filePath: path.join(tempDir, `history-${Math.random()}.json`),
    now: () => now
  });
  plugin.superfanFinaleHistory = history;
  plugin.getRendererStatus = jest.fn(() => ({ state: 'ready' }));
  return { api, plugin, history };
}
```

Then cover the behavior:

```js
test('routes paid subscriber joins and authoritative subscription events through one per-user cooldown', () => {
  const { api, plugin, history } = createPlugin({
    superfanFinaleEnabled: true,
    superfanFinaleCooldownHours: 24,
    superfanFinaleIntensity: 4,
    goalFinaleStyle: 'sky-ballet',
    goalFinaleLength: 'short'
  });
  plugin.triggerFinale = jest.fn(request => ({ accepted: true, ...request }));
  plugin.registerTikTokEventHandlers();

  api.events.get('join')({ userId: 'a', uniqueId: 'Alpha', teamMemberLevel: 50, isSubscriber: false });
  expect(plugin.triggerFinale).not.toHaveBeenCalled();

  api.events.get('join')({ userId: 'a', uniqueId: 'Alpha', teamMemberLevel: 0, isSubscriber: true, profilePictureUrl: '/a.png' });
  expect(plugin.triggerFinale).toHaveBeenCalledWith(expect.objectContaining({
    style: 'sky-ballet', length: 'short', intensity: 4
  }));
  expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.objectContaining({
    username: 'Alpha',
    profilePictureUrl: '/a.png',
    thankYouText: 'Superfan joined, this firework is for you!'
  }));
  expect(history.getLastAcceptedAt('id:a')).not.toBeNull();

  api.events.get('superfan')({ userId: 'a', uniqueId: 'Alpha' });
  expect(plugin.triggerFinale).toHaveBeenCalledTimes(1);
  api.events.get('superfan')({ userId: 'b', uniqueId: 'Beta' });
  expect(plugin.triggerFinale).toHaveBeenCalledTimes(2);
});

test('does not consume cooldown when the finale is rejected', () => {
  const { plugin, history } = createPlugin();
  plugin.triggerFinale = jest.fn(() => ({ accepted: false, reason: 'disabled' }));
  expect(plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true }))
    .toMatchObject({ accepted: false, reason: 'disabled' });
  expect(history.getLastAcceptedAt('id:a')).toBeNull();
});

test('does not consume cooldown while the renderer is offline', () => {
  const { plugin, history } = createPlugin();
  plugin.getRendererStatus.mockReturnValue({ state: 'offline' });
  plugin.triggerFinale = jest.fn();
  expect(plugin.handleSuperfanEntry({ userId: 'a', uniqueId: 'Alpha' }, { authoritative: true }))
    .toMatchObject({ accepted: false, reason: 'renderer-not-ready' });
  expect(plugin.triggerFinale).not.toHaveBeenCalled();
  expect(history.getLastAcceptedAt('id:a')).toBeNull();
});

test('test route bypasses cooldown without mutating history', () => {
  const { api, plugin, history } = createPlugin();
  plugin.registerRoutes();
  plugin.triggerFinale = jest.fn(request => ({ accepted: true, id: request.eventId }));
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  api.routes.get('post:/api/webgpu-fireworks/test-superfan')({ body: { username: 'TestSuperfan' } }, res);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, accepted: true }));
  expect(history.snapshot()).toEqual({});
});

test('settings API round-trips normalized Superfan values', () => {
  const { api, plugin } = createPlugin();
  plugin.registerRoutes();
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  api.routes.get('post:/api/webgpu-fireworks/config')({
    body: { superfanFinaleEnabled: false, superfanFinaleCooldownHours: 168, superfanFinaleIntensity: 7.5 }
  }, res);
  expect(plugin.config).toMatchObject({
    superfanFinaleEnabled: false,
    superfanFinaleCooldownHours: 168,
    superfanFinaleIntensity: 7.5
  });
  expect(api.setConfig).toHaveBeenCalledWith('settings', expect.objectContaining({
    superfanFinaleCooldownHours: 168
  }));
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

test('destroy cancels delayed follower notifications', async () => {
  jest.useFakeTimers();
  try {
    const { api, plugin } = createPlugin();
    plugin.scheduleFollowerAnimation({ username: 'Later' }, 1000);
    expect(plugin.notificationTimers.size).toBe(1);
    await plugin.destroy();
    jest.runAllTimers();
    expect(plugin.notificationTimers.size).toBe(0);
    expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:follower-animation', expect.anything());
  } finally {
    jest.useRealTimers();
  }
});
```

- [ ] **Step 2: Run the expanded suite and confirm RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js
```

Expected: FAIL because no Superfan handler, events, history lifecycle, or route exists.

- [ ] **Step 3: Wire history lifecycle into the plugin**

In the constructor, retain the plugin data directory and construct the history:

```js
this.pluginDataDir = api.getPluginDataDir();
this.uploadDir = path.join(this.pluginDataDir, 'uploads');
this.superfanFinaleHistory = new SuperfanFinaleHistory({
  filePath: path.join(this.pluginDataDir, 'superfan-finales.json'),
  log: message => this.api.log(message, 'warn')
});
```

Call `this.superfanFinaleHistory.load()` after `ensurePluginDataDir()` and before TikTok handlers are registered. Do not delete the file in `destroy()`.

Initialize `this.notificationTimers = new Set()` in the constructor. Add this helper and replace the raw `setTimeout()` inside `handleFollowerEvent()` with it:

```js
scheduleFollowerAnimation(payload, delayMs = 0) {
  if (delayMs <= 0) {
    this.api.emit('webgpu-fireworks:follower-animation', payload);
    return null;
  }
  const timer = setTimeout(() => {
    this.notificationTimers.delete(timer);
    this.api.emit('webgpu-fireworks:follower-animation', payload);
  }, delayMs);
  this.notificationTimers.add(timer);
  return timer;
}
```

In `destroy()`, clear every timer in `notificationTimers` and then clear the set. This changes no follower delay or payload; it only prevents a delayed notification after plugin unload.

- [ ] **Step 4: Implement one normalized handler and both event bindings**

Add event bindings:

```js
this.api.registerTikTokEvent('join', data => {
  this.handleSuperfanEntry(data, { authoritative: false });
});
this.api.registerTikTokEvent('subscribe', data => {
  this.handleSuperfanEntry(data, { authoritative: true });
});

this.api.registerTikTokEvent('superfan', data => {
  this.handleSuperfanEntry(data, { authoritative: true });
});
```

Implement the handler with this decision order:

```js
handleSuperfanEntry(data = {}, options = {}) {
  const authoritative = options.authoritative === true;
  const bypassCooldown = options.bypassCooldown === true;
  if (!this.config.enabled && options.bypassEnabled !== true) return { accepted: false, reason: 'disabled' };
  if (!this.config.superfanFinaleEnabled && options.bypassEnabled !== true) return { accepted: false, reason: 'feature-disabled' };
  if (!authoritative && !hasPaidSuperfanStatus(data)) return { accepted: false, reason: 'not-superfan' };

  const identity = normalizeSuperfanIdentity(data);
  if (!identity) {
    this.api.log('[FIREWORKS] Superfan finale skipped: missing user identity', 'debug');
    return { accepted: false, reason: 'missing-identity' };
  }
  const now = Date.now();
  if (!bypassCooldown && !this.superfanFinaleHistory.isEligible(
    identity,
    this.config.superfanFinaleCooldownHours,
    now
  )) return { accepted: false, reason: 'cooldown', identity };

  const rendererStatus = this.getRendererStatus();
  if (rendererStatus.state !== 'ready') {
    return { accepted: false, reason: 'renderer-not-ready', identity };
  }

  const username = data.uniqueId || data.username || data.nickname || 'Superfan';
  const eventId = `superfan:${identity}:${now}`;
  const finale = this.triggerFinale({
    style: this.config.goalFinaleStyle,
    length: this.config.goalFinaleLength,
    intensity: this.config.superfanFinaleIntensity,
    eventId,
    bypassEnabled: options.bypassEnabled === true
  });
  if (!finale.accepted) return { accepted: false, reason: finale.reason || 'finale-rejected', identity, finale };

  this.scheduleFollowerAnimation({
    username,
    profilePictureUrl: data.profilePictureUrl || data.userProfilePictureUrl || null,
    duration: this.config.followerAnimationDuration || 3000,
    position: this.config.followerAnimationPosition || 'center',
    size: this.config.followerAnimationSize || 'medium',
    scale: this.config.followerAnimationScale || 1,
    style: this.config.followerAnimationStyle || 'gradient-purple',
    entrance: this.config.followerAnimationEntrance || 'scale',
    thankYouText: 'Superfan joined, this firework is for you!'
  }, 0);
  if (!bypassCooldown) this.superfanFinaleHistory.markAccepted(identity, now);
  return { accepted: true, identity, finale };
}
```

Keep notification emission immediate. Existing follower fireworks retain their configured delayed animation behavior.

- [ ] **Step 5: Add a cooldown-free test route**

Register `POST /api/webgpu-fireworks/test-superfan` next to `test-follower`:

```js
const result = this.handleSuperfanEntry({
  userId: 'test-superfan',
  uniqueId: req.body?.username || 'TestSuperfan',
  profilePictureUrl: req.body?.profilePictureUrl || null,
  isSubscriber: true
}, { authoritative: true, bypassCooldown: true, bypassEnabled: true });
res.json({ success: result.accepted, ...result });
```

Return HTTP 500 only for thrown errors, matching the other test routes. Log the route in `logRoutes()`.

- [ ] **Step 6: Run focused backend regressions and commit**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-finale-backend.test.js test/webgpu-fireworks-finale-runtime.test.js
git diff --check -- plugins/webgpu-fireworks/main.js test/webgpu-fireworks-superfan-finale.test.js
git add plugins/webgpu-fireworks/main.js test/webgpu-fireworks-superfan-finale.test.js
git commit -m "feat(webgpu-fireworks): trigger per-superfan finales"
```

Expected: all named suites pass and the existing goal finale contract remains green.

---

### Task 3: Settings UI, Localization, and User Documentation

**Files:**
- Modify: `app/plugins/webgpu-fireworks/ui/settings.html:1458-1505`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.js:260-310, 370-405, 735-850`
- Modify: `app/plugins/webgpu-fireworks/locales/de.json`
- Modify: `app/plugins/webgpu-fireworks/locales/en.json`
- Modify: `app/plugins/webgpu-fireworks/locales/es.json`
- Modify: `app/plugins/webgpu-fireworks/locales/fr.json`
- Modify: `app/plugins/webgpu-fireworks/README.md`
- Create: `app/test/webgpu-fireworks-superfan-finale-settings.test.js`

**Interfaces:**
- Consumes: `superfanFinaleEnabled`, `superfanFinaleCooldownHours`, `superfanFinaleIntensity`, and `/api/webgpu-fireworks/test-superfan` from Tasks 1-2.
- Produces: element IDs `superfan-finale-toggle`, `superfan-finale-cooldown`, `superfan-finale-intensity`, `superfan-finale-intensity-value`, and `test-superfan-finale-btn`.

- [ ] **Step 1: Write the failing UI contract test**

```js
const fs = require('fs');
const path = require('path');

describe('WebGPU Superfan finale settings', () => {
  const pluginDir = path.join(__dirname, '..', 'plugins', 'webgpu-fireworks');
  const html = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.html'), 'utf8');
  const script = fs.readFileSync(path.join(pluginDir, 'ui', 'settings.js'), 'utf8');

  test('exposes enabled, cooldown, intensity, and test controls', () => {
    for (const id of [
      'superfan-finale-toggle', 'superfan-finale-cooldown',
      'superfan-finale-intensity', 'superfan-finale-intensity-value',
      'test-superfan-finale-btn'
    ]) expect(html).toContain(`id="${id}"`);
    for (const value of ['6', '12', '24', '72', '168']) {
      expect(html).toContain(`<option value="${value}"`);
    }
  });

  test('loads, mutates, and tests the normalized config keys', () => {
    expect(script).toContain('config.superfanFinaleEnabled');
    expect(script).toContain('config.superfanFinaleCooldownHours');
    expect(script).toContain('config.superfanFinaleIntensity');
    expect(script).toContain("fetch('/api/webgpu-fireworks/test-superfan'");
  });

  test.each(['de', 'en', 'es', 'fr'])('ships all Superfan finale labels in %s', locale => {
    const messages = JSON.parse(fs.readFileSync(path.join(pluginDir, 'locales', `${locale}.json`), 'utf8'));
    for (const key of [
      'superfan_finale', 'enable_superfan_finale', 'superfan_finale_cooldown',
      'superfan_finale_intensity', 'test_superfan_finale'
    ]) expect(messages.webgpu_fireworks[key]).toEqual(expect.any(String));
  });
});
```

- [ ] **Step 2: Run the UI test and confirm RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale-settings.test.js
```

Expected: FAIL because the Superfan card, script wiring, and locale keys do not exist.

- [ ] **Step 3: Add the settings card**

Place a separate card between Goal Finale and Follower Fireworks. The select values must be stored as hours:

```html
<div class="card rounded-xl p-6">
  <h2 class="section-title text-xl font-bold mb-4" data-i18n="webgpu_fireworks.superfan_finale">⭐ Superfan Finale</h2>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <label data-i18n="webgpu_fireworks.enable_superfan_finale">Enable Superfan Finales</label>
      <div id="superfan-finale-toggle" class="toggle-switch active" data-config="superfanFinaleEnabled"></div>
    </div>
    <div>
      <label for="superfan-finale-cooldown" data-i18n="webgpu_fireworks.superfan_finale_cooldown">Repeat per Superfan</label>
      <select id="superfan-finale-cooldown" class="w-full bg-black/30 rounded-lg px-4 py-2">
        <option value="6">Every 6 hours</option>
        <option value="12">Every 12 hours</option>
        <option value="24" selected>Every 24 hours</option>
        <option value="72">Every 3 days</option>
        <option value="168">Every 7 days</option>
      </select>
    </div>
    <div>
      <label for="superfan-finale-intensity" data-i18n="webgpu_fireworks.superfan_finale_intensity">Finale intensity</label>
      <input type="range" id="superfan-finale-intensity" min="1" max="10" step="0.5" value="3" class="w-full">
      <span id="superfan-finale-intensity-value">3x</span>
    </div>
    <button id="test-superfan-finale-btn" class="w-full btn-primary py-3 rounded-lg font-bold" data-i18n="webgpu_fireworks.test_superfan_finale">⭐ Test Superfan Finale</button>
  </div>
</div>
```

Apply `data-i18n` keys to the five option labels as well, using `superfan_finale_every_6h`, `_12h`, `_24h`, `_3d`, and `_7d`.

- [ ] **Step 4: Wire load, mutation, and the test endpoint**

In `updateUI()`, immediately after the existing goal-finale controls, use nullish defaults so a valid false or low value is preserved:

```js
updateToggle('superfan-finale-toggle', config.superfanFinaleEnabled !== false);
document.getElementById('superfan-finale-cooldown').value = String(config.superfanFinaleCooldownHours ?? 24);
document.getElementById('superfan-finale-intensity').value = config.superfanFinaleIntensity ?? 3;
document.getElementById('superfan-finale-intensity-value').textContent = `${config.superfanFinaleIntensity ?? 3}x`;
```

Add listeners:

```js
document.getElementById('superfan-finale-cooldown')?.addEventListener('change', function() {
  config.superfanFinaleCooldownHours = Number(this.value);
});
setupRangeSlider('superfan-finale-intensity', 'superfan-finale-intensity-value', 'x', value => {
  config.superfanFinaleIntensity = Number(value);
});
```

Add `testSuperfanFinale()` beside `testFollowerFireworks()` and register it with optional chaining on `test-superfan-finale-btn`:

```js
async function testSuperfanFinale() {
  try {
    const response = await fetch('/api/webgpu-fireworks/test-superfan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'TestSuperfan',
        profilePictureUrl: 'https://www.gravatar.com/avatar/?d=mp&s=200'
      })
    });
    const payload = await response.json();
    if (!response.ok || !payload.accepted) throw new Error(payload.reason || payload.error || 'Finale rejected');
    showToast(window.i18n?.t('webgpu_fireworks.superfan_finale_test_success') || 'Superfan finale triggered!', 'success');
  } catch (error) {
    console.error('[Fireworks Settings] Failed to trigger Superfan finale:', error);
    showToast(window.i18n?.t('webgpu_fireworks.superfan_finale_test_failed') || 'Failed to trigger Superfan finale', 'error');
  }
}

document.getElementById('test-superfan-finale-btn')?.addEventListener('click', testSuperfanFinale);
```

- [ ] **Step 5: Add four-language labels and README documentation**

Add these meanings under `webgpu_fireworks` in all four locale files; retain the same keys in every file:

```text
en: Superfan Finale | Enable Superfan Finales | Repeat per Superfan | Every 6 hours | Every 12 hours | Every 24 hours | Every 3 days | Every 7 days | Finale intensity | Test Superfan Finale | Superfan finale triggered! | Failed to trigger Superfan finale
de: Superfan-Finale | Superfan-Finales aktivieren | Wiederholung pro Superfan | Alle 6 Stunden | Alle 12 Stunden | Alle 24 Stunden | Alle 3 Tage | Alle 7 Tage | Finale-Intensität | Superfan-Finale testen | Superfan-Finale ausgelöst! | Superfan-Finale konnte nicht ausgelöst werden
es: Final de Superfan | Activar finales de Superfan | Repetición por Superfan | Cada 6 horas | Cada 12 horas | Cada 24 horas | Cada 3 días | Cada 7 días | Intensidad del final | Probar final de Superfan | ¡Final de Superfan activado! | No se pudo activar el final de Superfan
fr: Finale Superfan | Activer les finales Superfan | Répétition par Superfan | Toutes les 6 heures | Toutes les 12 heures | Toutes les 24 heures | Tous les 3 jours | Tous les 7 jours | Intensité de la finale | Tester la finale Superfan | Finale Superfan déclenchée ! | Échec du déclenchement de la finale Superfan
```

Do not translate the overlay sentence because the product requirement fixes its exact English text. Add this exact section to `README.md`:

```markdown
## Superfan finales

When a paid subscriber enters (`isSubscriber` or an explicit Superfan flag), or an authoritative `subscribe`/`superfan` event arrives, WebGPU Fireworks can show `Superfan joined, this firework is for you!` and enqueue a choreographed finale. Fan-team `teamMemberLevel` never qualifies on its own. Cooldowns are stored per TikTok user ID, with normalized username fallback, in the plugin data directory and survive reloads.

The default is enabled, once per Superfan every 24 hours, at 3x intensity. Available cooldowns are 6, 12, 24, 72, and 168 hours; intensity ranges from 1x to 10x. Show style and length inherit the global finale settings. The settings test button never reads or updates real Superfan cooldown history.
```

- [ ] **Step 6: Run UI/backend tests and commit the presentation layer**

```powershell
npm test -- --runInBand test/webgpu-fireworks-superfan-finale-settings.test.js test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-finale-settings.test.js
node -e "for (const l of ['de','en','es','fr']) JSON.parse(require('fs').readFileSync('plugins/webgpu-fireworks/locales/'+l+'.json','utf8')); console.log('LOCALES_OK')"
git diff --check -- plugins/webgpu-fireworks/ui/settings.html plugins/webgpu-fireworks/ui/settings.js plugins/webgpu-fireworks/locales plugins/webgpu-fireworks/README.md test/webgpu-fireworks-superfan-finale-settings.test.js
git add plugins/webgpu-fireworks/ui/settings.html plugins/webgpu-fireworks/ui/settings.js plugins/webgpu-fireworks/locales/de.json plugins/webgpu-fireworks/locales/en.json plugins/webgpu-fireworks/locales/es.json plugins/webgpu-fireworks/locales/fr.json plugins/webgpu-fireworks/README.md test/webgpu-fireworks-superfan-finale-settings.test.js
git commit -m "feat(webgpu-fireworks): add superfan finale controls"
```

Expected: all named suites pass and locale parsing prints `LOCALES_OK`.

---

### Task 4: Regression Gate and Live-Safe Plugin Refresh

**Files:**
- Verify only; modify a prior task's files only if a failing check exposes a regression.

**Interfaces:**
- Consumes: all behavior from Tasks 1-3.
- Produces: verified repository and live plugin state without a server restart or visible test finale.

- [ ] **Step 1: Run focused WebGPU Fireworks regression suites**

From `app/`:

```powershell
npm test -- --runInBand --testPathPattern="webgpu-fireworks|fireworks-follower-animation" --silent
```

Expected: all matching suites pass with zero failed tests.

- [ ] **Step 2: Run repository quality checks**

```powershell
npm run lint -- --quiet
npm run build:css
git diff --check
```

Expected: all commands exit 0. If unrelated pre-existing Music-Bot lint errors appear, rerun ESLint only on the changed WebGPU Fireworks JavaScript files and report the unrelated failure separately; do not edit Music-Bot.

- [ ] **Step 3: Audit commit scope and working tree**

From the repository root:

```powershell
git status --short --branch
git log -4 --oneline --decorate
git diff origin/main...HEAD -- app/plugins/webgpu-fireworks app/test docs/superpowers
```

Expected: feature commits contain only the design/plan, WebGPU Fireworks files, and focused tests. Existing Music-Bot and launcher settings remain unstaged and uncommitted.

- [ ] **Step 4: Verify the live server before touching the plugin**

```powershell
$before = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 5
$plugins = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/plugins?locale=en' -TimeoutSec 5
[pscustomobject]@{
  Connected = $before.isConnected
  Username = $before.username
  FireworksLoaded = [bool](($plugins.plugins | Where-Object id -eq 'webgpu-fireworks').loadedAt)
}
```

Expected: TikTok is connected and the expected runtime plugin is visible. If not, stop and report rather than restarting the app.

- [ ] **Step 5: Reload only WebGPU Fireworks and verify recovery**

```powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/plugins/webgpu-fireworks/reload' -ContentType 'application/json' -Body '{}' -TimeoutSec 30
$after = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/status' -TimeoutSec 5
$config = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/webgpu-fireworks/config' -TimeoutSec 5
[pscustomobject]@{
  Connected = $after.isConnected
  Username = $after.username
  SuperfanEnabled = $config.config.superfanFinaleEnabled
  CooldownHours = $config.config.superfanFinaleCooldownHours
  Intensity = $config.config.superfanFinaleIntensity
}
```

Expected: TikTok remains connected to the same username; config reports `true`, `24`, and `3` for a previously unconfigured profile. Do not call `/api/webgpu-fireworks/test-superfan` during the live stream without explicit approval because it intentionally creates a visible show.

- [ ] **Step 6: Inspect fresh log lines and report actual state**

Read only log entries created by the plugin reload. Confirm `webgpu-fireworks` initialized and no new plugin error appeared. Report any renderer-offline state separately: an absent OBS overlay is not a backend plugin-load failure.
