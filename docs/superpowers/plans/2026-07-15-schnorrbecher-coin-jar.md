# Schnorrbecher Coin Jar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build the independent Schnorrbecher LTTH plugin: TikTok gifts fill a transparent, Matter.js-powered coin jar OBS overlay and can be controlled from a local admin page.

**Architecture:** A CommonJS backend engine owns all persistent state, gift validation, combo accounting, event deduplication, stream-session resets and Socket.IO broadcasts. The browser overlay receives authoritative state and spawn commands, runs Matter.js locally, and bounds its visual object count through compaction. A separate admin UI uses the same REST API and Socket.IO state events.

**Tech Stack:** Node.js/CommonJS, LTTH PluginAPI, Express plugin routes, Socket.IO, JSON files in api.getPluginDataDir(), Matter.js 0.20, HTML/CSS/DOM, Jest + jsdom + supertest.

## Global Constraints

- Use a separate app/plugins/schnorrbecher/ plugin; do not alter CoinBattle or EmojiRain.
- Keep backend code CommonJS, 2-space indentation, and use this.api.log() for plugin logging.
- Persist only in api.getPluginDataDir(); never write user state into the source tree.
- Serve the browser source at exactly GET /overlay/coincup. Do not place credentials in its URL.
- Use the existing local /js/matter.min.js and /socket.io/socket.io.js assets; do not add a CDN dependency.
- streamSessionStarted is the primary stream reset signal. Deduplicate the connected fallback with streamIdentity.
- Do not create more than maxPhysicalIcons dynamic Matter bodies; the default is 300.
- Write the test first, confirm the expected failure, implement the smallest behavior, then rerun it before each commit.

---

### Task 1: Plugin scaffold, validated configuration, and durable state storage

**Files:**

- Create: app/plugins/schnorrbecher/plugin.json
- Create: app/plugins/schnorrbecher/lib/config.js
- Create: app/plugins/schnorrbecher/lib/state-store.js
- Test: app/plugins/schnorrbecher/test/config-and-store.test.js

**Interfaces:**

- Produces DEFAULT_CONFIG, DEFAULT_STATE, normalizeConfig(input), and normalizeState(input).
- Produces class CoinJarStore with loadConfig(), saveConfig(config), loadState(), saveState(state), and clearState().
- The store uses configPath and statePath within its injected data directory and writes every JSON update through target.tmp followed by renameSync.

- [ ] **Step 1: Write the failing configuration and storage test**

~~~js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DEFAULT_STATE, normalizeConfig } = require('../lib/config');
const CoinJarStore = require('../lib/state-store');

describe('Schnorrbecher configuration and store', () => {
  let dataDir;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schnorrbecher-'));
  });

  afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

  test('clamps unsafe display and physics values', () => {
    expect(normalizeConfig({
      jarWidth: -3,
      jarHeight: 99999,
      maxPhysicalIcons: 99999,
      spawnDelayMs: 0,
      persistenceMode: 'invalid',
      soundVolume: 5
    })).toMatchObject({
      jarWidth: 160,
      jarHeight: 1400,
      maxPhysicalIcons: 600,
      spawnDelayMs: 20,
      persistenceMode: 'session',
      soundVolume: 1
    });
  });

  test('persists state atomically and clears it to defaults', () => {
    const store = new CoinJarStore(dataDir);
    store.saveState({
      totalCoinValue: 125,
      visualCoinCount: 9,
      lastProcessedEventIds: ['gift-1']
    });

    expect(store.loadState()).toMatchObject({
      totalCoinValue: 125,
      visualCoinCount: 9,
      lastProcessedEventIds: ['gift-1']
    });
    expect(fs.existsSync(path.join(dataDir, 'coin-jar-state.json.tmp'))).toBe(false);

    store.clearState();
    expect(store.loadState()).toEqual(DEFAULT_STATE);
  });
});
~~~

- [ ] **Step 2: Run the test and verify it fails for the absent modules**

Run: npx jest --runInBand plugins/schnorrbecher/test/config-and-store.test.js

Expected: FAIL with Cannot find module ../lib/config.

- [ ] **Step 3: Implement the minimum configuration and store**

~~~js
// lib/config.js
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  jarWidth: 460,
  jarHeight: 580,
  jarX: 50,
  jarY: 82,
  iconScale: 1,
  maxPhysicalIcons: 300,
  spawnMultiplier: 1,
  spawnDelayMs: 80,
  showCounter: true,
  showGiftPopup: true,
  showSenderName: true,
  showGiftImage: true,
  counterLabel: 'Gifts',
  jarLabel: 'Schnorr Becher',
  persistenceMode: 'session',
  resetOnNewStream: true,
  physicsEnabled: true,
  soundEnabled: false,
  soundVolume: 0.35,
  jarBorderColor: '#f6d365',
  jarOpacity: 0.22,
  counterFontFamily: 'Arial, sans-serif',
  counterFontSize: 42,
  counterColor: '#ffffff',
  requireResetConfirmation: true
});

const DEFAULT_STATE = Object.freeze({
  sessionId: null,
  totalCoinValue: 0,
  visualCoinCount: 0,
  lastProcessedEventIds: [],
  updatedAt: 0
});

function clamp(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}

function normalizeConfig(input = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...input,
    jarWidth: clamp(input.jarWidth, DEFAULT_CONFIG.jarWidth, 160, 1600),
    jarHeight: clamp(input.jarHeight, DEFAULT_CONFIG.jarHeight, 140, 1400),
    jarX: clamp(input.jarX, DEFAULT_CONFIG.jarX, 0, 100),
    jarY: clamp(input.jarY, DEFAULT_CONFIG.jarY, 0, 100),
    iconScale: clamp(input.iconScale, DEFAULT_CONFIG.iconScale, 0.25, 3),
    maxPhysicalIcons: Math.round(clamp(input.maxPhysicalIcons, DEFAULT_CONFIG.maxPhysicalIcons, 20, 600)),
    spawnMultiplier: clamp(input.spawnMultiplier, DEFAULT_CONFIG.spawnMultiplier, 0.1, 5),
    spawnDelayMs: Math.round(clamp(input.spawnDelayMs, DEFAULT_CONFIG.spawnDelayMs, 20, 1000)),
    soundVolume: clamp(input.soundVolume, DEFAULT_CONFIG.soundVolume, 0, 1),
    jarOpacity: clamp(input.jarOpacity, DEFAULT_CONFIG.jarOpacity, 0, 1),
    counterFontSize: Math.round(clamp(input.counterFontSize, DEFAULT_CONFIG.counterFontSize, 12, 160)),
    persistenceMode: input.persistenceMode === 'persistent' ? 'persistent' : 'session'
  };
}

function normalizeState(input = {}) {
  return {
    ...DEFAULT_STATE,
    ...input,
    totalCoinValue: Math.max(0, Number(input.totalCoinValue) || 0),
    visualCoinCount: Math.max(0, Math.floor(Number(input.visualCoinCount) || 0)),
    lastProcessedEventIds: Array.isArray(input.lastProcessedEventIds)
      ? input.lastProcessedEventIds.filter(value => typeof value === 'string').slice(-5000)
      : []
  };
}

module.exports = { DEFAULT_CONFIG, DEFAULT_STATE, normalizeConfig, normalizeState };
~~~

~~~js
// lib/state-store.js
const fs = require('fs');
const path = require('path');
const { DEFAULT_CONFIG, DEFAULT_STATE, normalizeConfig, normalizeState } = require('./config');

class CoinJarStore {
  constructor(dataDir) {
    this.configPath = path.join(dataDir, 'coin-jar-config.json');
    this.statePath = path.join(dataDir, 'coin-jar-state.json');
    fs.mkdirSync(dataDir, { recursive: true });
  }

  _read(filePath, fallback, normalize) {
    try {
      return normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    } catch (_) {
      return fallback;
    }
  }

  _write(filePath, value) {
    const temporaryPath = filePath + '.tmp';
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.renameSync(temporaryPath, filePath);
  }

  loadConfig() { return this._read(this.configPath, DEFAULT_CONFIG, normalizeConfig); }
  saveConfig(config) { const next = normalizeConfig(config); this._write(this.configPath, next); return next; }
  loadState() { return this._read(this.statePath, DEFAULT_STATE, normalizeState); }
  saveState(state) { const next = normalizeState(state); this._write(this.statePath, next); return next; }
  clearState() { this._write(this.statePath, DEFAULT_STATE); }
}

module.exports = CoinJarStore;
~~~

Create plugin.json with id schnorrbecher, entry main.js, type overlay, disabled false, working-beta status, and socket.io/routes/tiktok-events/database permissions.

- [ ] **Step 4: Verify green**

Run: npx jest --runInBand plugins/schnorrbecher/test/config-and-store.test.js

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

~~~bash
git add app/plugins/schnorrbecher/plugin.json app/plugins/schnorrbecher/lib/config.js app/plugins/schnorrbecher/lib/state-store.js app/plugins/schnorrbecher/test/config-and-store.test.js
git diff --cached --check
git commit -m "feat(schnorrbecher): add persistent coin jar foundation"
~~~

### Task 2: Deterministic gift, combo, deduplication, and reset engine

**Files:**

- Create: app/plugins/schnorrbecher/lib/coin-jar-engine.js
- Test: app/plugins/schnorrbecher/test/coin-jar-engine.test.js

**Interfaces:**

- Consumes CoinJarStore and the normalizers from Task 1.
- Produces calculateVisualCoins(value), normalizeGiftEvent(event), and class CoinJarEngine.
- The constructor receives store, getConfig, emit, log, now, setTimeoutFn, and clearTimeoutFn.
- Public methods: handleGift(event), addValue(value, details), reset(reason), clearEventCache(), syncPayload(), handleStreamSession(data, options), and destroy().

- [ ] **Step 1: Write the failing engine tests**

~~~js
const CoinJarEngine = require('../lib/coin-jar-engine');

function createEngine(overrides = {}) {
  const state = {
    totalCoinValue: 0,
    visualCoinCount: 0,
    lastProcessedEventIds: [],
    updatedAt: 0
  };
  const timers = [];
  const emitted = [];
  const store = {
    loadState: () => ({ ...state }),
    saveState: next => Object.assign(state, next),
    clearState: () => Object.assign(state, {
      totalCoinValue: 0,
      visualCoinCount: 0,
      lastProcessedEventIds: []
    })
  };
  const engine = new CoinJarEngine({
    store,
    getConfig: () => ({
      enabled: true,
      persistenceMode: 'persistent',
      resetOnNewStream: true
    }),
    emit: (event, payload) => emitted.push({ event, payload }),
    log: jest.fn(),
    now: () => 1000,
    setTimeoutFn: callback => { timers.push(callback); return timers.length - 1; },
    clearTimeoutFn: jest.fn(),
    ...overrides
  });
  return { engine, state, emitted, timers };
}

describe('CoinJarEngine', () => {
  test.each([[1, 1], [100, 10], [1000, 32]])(
    'maps value %i to %i visual coins',
    (value, expected) => expect(CoinJarEngine.calculateVisualCoins(value)).toBe(expected)
  );

  test('adds a completed gift exactly once and emits one spawn', () => {
    const { engine, state, emitted } = createEngine();
    const gift = {
      eventId: 'gift-1',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 10,
      repeatCount: 2,
      repeatEnd: true
    };

    expect(engine.handleGift(gift)).toMatchObject({
      accepted: true,
      totalValue: 20,
      visualCoins: 5
    });
    expect(engine.handleGift(gift)).toMatchObject({
      accepted: false,
      reason: 'duplicate'
    });
    expect(state.totalCoinValue).toBe(20);
    expect(emitted.filter(item => item.event === 'coinJar.add')).toHaveLength(1);
  });

  test('defers a combo until its terminal event and uses its largest repeat count', () => {
    const { engine, state } = createEngine();
    expect(engine.handleGift({
      eventId: 'combo-1',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 3,
      repeatCount: 2,
      repeatEnd: false
    })).toMatchObject({ accepted: true, pending: true });
    expect(engine.handleGift({
      eventId: 'combo-1',
      senderId: '42',
      giftId: 'rose',
      diamondValue: 3,
      repeatCount: 5,
      repeatEnd: true
    })).toMatchObject({ accepted: true, totalValue: 15 });
    expect(state.totalCoinValue).toBe(15);
  });

  test('ignores invalid values and reset changes the spawn generation', () => {
    const { engine, state, emitted } = createEngine();
    expect(engine.addValue(-1)).toMatchObject({
      accepted: false,
      reason: 'invalid-value'
    });
    engine.addValue(200, { eventId: 'manual-1' });
    expect(engine.reset('admin')).toMatchObject({
      generation: 1,
      totalCoinValue: 0
    });
    expect(state.totalCoinValue).toBe(0);
    expect(emitted.at(-1)).toMatchObject({
      event: 'coinJar.reset',
      payload: { reason: 'admin', generation: 1 }
    });
  });

  test('resets a session only once for a confirmed stream identity', () => {
    const { engine } = createEngine({
      getConfig: () => ({ persistenceMode: 'session', resetOnNewStream: true })
    });
    expect(engine.handleStreamSession({ streamIdentity: 'room:1', isNewStream: true })).toBe(true);
    expect(engine.handleStreamSession({ streamIdentity: 'room:1', isNewStream: true })).toBe(false);
  });
});
~~~

- [ ] **Step 2: Confirm red**

Run: npx jest --runInBand plugins/schnorrbecher/test/coin-jar-engine.test.js

Expected: FAIL with Cannot find module ../lib/coin-jar-engine.

- [ ] **Step 3: Implement the pure engine**

~~~js
const MAX_EVENT_IDS = 5000;
const COMBO_TIMEOUT_MS = 2500;

function calculateVisualCoins(value) {
  return Math.max(1, Math.min(100, Math.ceil(Math.sqrt(value))));
}

function normalizeGiftEvent(event = {}) {
  const diamondValue = Number(event.diamondValue ?? event.diamondCount ?? event.coins ?? event.giftValue);
  const repeatCount = Math.max(1, Math.floor(Number(event.repeatCount ?? event.repeat_count ?? 1)));
  return {
    eventId: String(event.eventId ?? event.id ?? ''),
    comboId: String(event.comboId ?? event.eventId ?? event.id ?? ''),
    senderId: String(event.senderId ?? event.userId ?? event.uniqueId ?? ''),
    senderName: event.senderName ?? event.nickname ?? event.username ?? '',
    giftId: String(event.giftId ?? event.gift_id ?? ''),
    giftName: event.giftName ?? event.gift?.name ?? 'Gift',
    giftImage: event.giftImage ?? event.giftImageUrl ?? event.giftPictureUrl ?? null,
    diamondValue,
    repeatCount,
    repeatEnd: event.repeatEnd !== false,
    timestamp: Number(event.timestamp) || Date.now()
  };
}
~~~

Complete CoinJarEngine as follows:

1. Load normalized state once and hydrate a completedEventIds Set.
2. Reject missing event IDs and non-finite or non-positive effective values with accepted false and reason invalid-value.
3. For a completed event, increment totalCoinValue by diamondValue times repeatCount, cap visual coins through calculateVisualCoins, persist the bounded event cache, and emit coinJar.add.
4. For a non-terminal combo, keep only the highest repeat count per comboId and arm a 2500 ms timer. Terminal events cancel the timer, merge the largest count, and complete once. The timer completes a malformed combo exactly once.
5. reset clears every combo timer and cached event identity, increments generation, replaces state with zero state, persists it, and emits coinJar.reset.
6. syncPayload returns only totalCoinValue, visualCoinCount, sessionId, updatedAt, and generation.
7. handleStreamSession resets only when resetOnNewStream is true, persistenceMode is session, and streamIdentity has changed. A connected call requires isNewStream true.
8. destroy clears all timers.

Export the class as module.exports and attach calculateVisualCoins and normalizeGiftEvent as properties for direct tests.

- [ ] **Step 4: Verify green**

Run: npx jest --runInBand plugins/schnorrbecher/test/coin-jar-engine.test.js

Expected: PASS with value, combo, dedupe, reset and lifecycle assertions.

- [ ] **Step 5: Commit**

~~~bash
git add app/plugins/schnorrbecher/lib/coin-jar-engine.js app/plugins/schnorrbecher/test/coin-jar-engine.test.js
git diff --cached --check
git commit -m "feat(schnorrbecher): process gifts and combos once"
~~~

### Task 3: LTTH adapter, catalog image resolution, REST API, and Socket.IO control plane

**Files:**

- Create: app/plugins/schnorrbecher/main.js
- Test: app/plugins/schnorrbecher/test/plugin-integration.test.js

**Interfaces:**

- Consumes the store and engine.
- Produces class SchnorrbecherPlugin exported from main.js.
- Public methods are init(), destroy(), getStatus(), resolveGiftImage(event), registerRoutes(), and registerEvents().
- REST: GET /overlay/coincup, GET /schnorrbecher/ui, GET /api/coin-jar/state, POST /api/coin-jar/config, POST /api/coin-jar/add, POST /api/coin-jar/test-gift, POST /api/coin-jar/reset, POST /api/coin-jar/event-cache/clear.
- Socket: coinJar.sync.request, coinJar.add, coinJar.reset.

- [ ] **Step 1: Write the failing plugin integration test**

~~~js
const request = require('supertest');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SchnorrbecherPlugin = require('../main');

function createApi(dataDir) {
  const app = express();
  app.use(express.json());
  const routes = express.Router();
  app.use(routes);
  const emissions = [];
  return {
    app,
    emissions,
    getSocketIO: () => ({ emit: (event, payload) => emissions.push({ event, payload }) }),
    emit: (event, payload) => emissions.push({ event, payload }),
    getPluginDataDir: () => dataDir,
    ensurePluginDataDir: () => {},
    getDatabase: () => ({
      getGift: id => id === 'rose' ? { image_url: 'https://catalog/rose.png' } : null
    }),
    log: jest.fn(),
    registerRoute: (method, route, handler) => routes[method.toLowerCase()](route, handler),
    registerTikTokEvent: jest.fn(),
    registerSocket: jest.fn(),
    registerSocketConnection: callback => callback({ emit: jest.fn() })
  };
}

test('adds, syncs, resets, and registers the exact OBS route', async () => {
  const api = createApi(fs.mkdtempSync(path.join(os.tmpdir(), 'schnorrbecher-')));
  const plugin = new SchnorrbecherPlugin(api);
  await plugin.init();

  await request(api.app).post('/api/coin-jar/add').send({ value: 100, giftId: 'rose' }).expect(200);
  await request(api.app).get('/api/coin-jar/state').expect(200).expect(response => {
    expect(response.body.state.totalCoinValue).toBe(100);
  });
  await request(api.app).post('/api/coin-jar/reset').send({}).expect(200);

  expect(api.registerRoute).toHaveBeenCalledWith('get', '/overlay/coincup', expect.any(Function));
  expect(api.registerTikTokEvent).toHaveBeenCalledWith('gift', expect.any(Function));
  expect(api.registerSocket).toHaveBeenCalledWith('coinJar.sync.request', expect.any(Function));
});
~~~

- [ ] **Step 2: Confirm red**

Run: npx jest --runInBand plugins/schnorrbecher/test/plugin-integration.test.js

Expected: FAIL with Cannot find module ../main.

- [ ] **Step 3: Implement the PluginAPI adapter**

~~~js
const path = require('path');
const CoinJarStore = require('./lib/state-store');
const CoinJarEngine = require('./lib/coin-jar-engine');

class SchnorrbecherPlugin {
  constructor(api) {
    this.api = api;
    this.store = new CoinJarStore(api.getPluginDataDir());
    this.config = this.store.loadConfig();
    this.engine = new CoinJarEngine({
      store: this.store,
      getConfig: () => this.config,
      emit: (event, payload) => this.api.emit(event, payload),
      log: (message, level) => this.api.log(message, level),
      now: () => Date.now(),
      setTimeoutFn: setTimeout,
      clearTimeoutFn: clearTimeout
    });
  }

  async init() {
    this.api.ensurePluginDataDir();
    this.registerRoutes();
    this.registerEvents();
    this.api.log('Schnorrbecher initialized – OBS: /overlay/coincup', 'info');
  }

  resolveGiftImage(event = {}) {
    const catalogGift = this.api.getDatabase()?.getGift?.(event.giftId);
    return catalogGift?.image_url || catalogGift?.imageUrl ||
      event.giftImage || event.giftImageUrl || event.giftPictureUrl || null;
  }
}

module.exports = SchnorrbecherPlugin;
~~~

Register the exact overlay route with res.sendFile(path.join(__dirname, 'overlay', 'coincup.html')) and the admin route with ui.html. The state and config routes return only normalized state/config. The add/test routes must use engine.addValue(), set giftImage through resolveGiftImage(), and emit the same coinJar.add event as a TikTok gift. Reset and cache-clear routes call the engine methods once.

Register TikTok gift, streamSessionStarted, and connected handlers. The gift handler enriches the image before calling engine.handleGift(). Register coinJar.sync.request to socket.emit coinJar.sync with engine.syncPayload(); register coinJar.add and coinJar.reset only as local commands routed through the engine, never as direct state mutation.

- [ ] **Step 4: Verify green**

Run: npx jest --runInBand plugins/schnorrbecher/test/plugin-integration.test.js

Expected: PASS with state, reset, catalog image and event-registration assertions.

- [ ] **Step 5: Commit**

~~~bash
git add app/plugins/schnorrbecher/main.js app/plugins/schnorrbecher/test/plugin-integration.test.js
git diff --cached --check
git commit -m "feat(schnorrbecher): add live plugin API and OBS route"
~~~

### Task 4: Matter.js overlay, bounded physics, compaction, and reconnect synchronization

**Files:**

- Create: app/plugins/schnorrbecher/overlay/coincup.html
- Create: app/plugins/schnorrbecher/overlay/coincup.css
- Create: app/plugins/schnorrbecher/overlay/coincup.js
- Test: app/plugins/schnorrbecher/test/overlay-controller.test.js

**Interfaces:**

- Produces calculateJarBounds(viewport, config), calculateCoinSize(value, scale), planVisualCoins(payload, config, currentCount), and class CoinJarOverlay.
- CoinJarOverlay receives Matter, document, window, socket, AudioCtor, random, setTimeoutFn, and clearTimeoutFn.
- Lifecycle entry points are applySync(payload), enqueueSpawn(payload), clear(payload), resize(), bindSocket(), and destroy().

- [ ] **Step 1: Write failing deterministic physics-planning tests**

~~~js
const {
  calculateJarBounds,
  calculateCoinSize,
  planVisualCoins,
  CoinJarOverlay
} = require('../overlay/coincup');

describe('CoinJarOverlay planning', () => {
  test('keeps the open top and walls inside the configured jar', () => {
    expect(calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    )).toMatchObject({ left: 720, right: 1200, top: 286, bottom: 886 });
  });

  test('bounds icon sizes and compacts an oversized spawn request', () => {
    expect(calculateCoinSize(1, 1)).toBeGreaterThanOrEqual(34);
    expect(calculateCoinSize(1000000, 3)).toBeLessThanOrEqual(180);
    expect(planVisualCoins(
      { totalValue: 10000, visualCoins: 100 },
      { maxPhysicalIcons: 300 },
      295
    )).toMatchObject({ spawnCount: 5, compact: true, overflow: true });
  });

  test('invalidates queued spawns after a reset generation', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.generation = 0;
    overlay.queue = [{ generation: 0 }];
    overlay.bodies = [];
    overlay.clear({ generation: 1, reason: 'admin' });
    expect(overlay.queue).toEqual([]);
    expect(overlay.generation).toBe(1);
  });
});
~~~

- [ ] **Step 2: Confirm red**

Run: npx jest --runInBand plugins/schnorrbecher/test/overlay-controller.test.js

Expected: FAIL with Cannot find module ../overlay/coincup.

- [ ] **Step 3: Implement the planner and controller**

~~~js
function calculateJarBounds(viewport, config) {
  const width = Number(config.jarWidth);
  const height = Number(config.jarHeight);
  const centerX = viewport.width * (Number(config.jarX) / 100);
  const centerY = viewport.height * (Number(config.jarY) / 100);
  return {
    left: Math.round(centerX - width / 2),
    right: Math.round(centerX + width / 2),
    top: Math.round(centerY - height),
    bottom: Math.round(centerY),
    width,
    height
  };
}

function calculateCoinSize(value, scale = 1) {
  const base = 34 + Math.log10(Math.max(1, Number(value) || 1)) * 18;
  return Math.round(Math.max(34, Math.min(180, base * Math.max(0.25, Math.min(3, scale)))));
}

function planVisualCoins(payload, config, currentCount) {
  const available = Math.max(0, config.maxPhysicalIcons - currentCount);
  const requested = Math.max(1, Math.floor(payload.visualCoins || 1));
  return {
    spawnCount: Math.min(requested, available),
    compact: requested > available,
    overflow: currentCount + requested >= config.maxPhysicalIcons
  };
}
~~~

CoinJarOverlay must create Matter static rectangles only for left, right, and bottom. Its DOM sprites track body position/angle on afterUpdate. Spawn each icon with x inside the open jar, y 30–150 pixels above it, a random angle, x velocity between -1.5 and 1.5, and angular velocity between -0.08 and 0.08. Use gravity 1.0, restitution 0.15, friction 0.35, frictionAir 0.01, density 0.002, capped velocity, and a queue delay between 40–120 ms multiplied by config.spawnMultiplier.

Attach body.plugin with element, tier, and overflow. Before spawning at the cap, replace ten lowest-tier bodies with one next-tier body. When visual fullness is detected, create new bodies outside the wall bounds so they naturally fill the rest of the viewport. Bodies outside a viewport margin are removed from Matter and DOM only; they do not change server state.

clear(payload) increments the accepted generation, clears all timer IDs, queue entries, Matter dynamic bodies, DOM sprites and counter target. bindSocket() configures 1 second minimum and 30 second maximum reconnect delay, emits coinJar.sync.request on every connect, and subscribes to coinJar.sync, coinJar.add, coinJar.reset and coinJar.config. applySync reconstructs at most config.maxPhysicalIcons settled bodies after a reload.

- [ ] **Step 4: Add transparent markup and responsive CSS**

~~~html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <link rel="stylesheet" href="/plugins/schnorrbecher/overlay/coincup.css">
  </head>
  <body>
    <main id="coin-jar-scene" aria-label="Schnorrbecher Coin Jar">
      <div id="coin-jar-counter" aria-live="polite"></div>
      <div id="coin-jar"><div class="jar-rim"></div><div class="jar-label"></div></div>
      <div id="coin-jar-sprites"></div>
      <div id="gift-popup" hidden></div>
    </main>
    <script src="/js/matter.min.js"></script>
    <script src="/socket.io/socket.io.js"></script>
    <script src="/plugins/schnorrbecher/overlay/coincup.js"></script>
  </body>
</html>
~~~

Make html, body and scene backgrounds transparent, use overflow hidden, and draw only the left/right/bottom jar borders. Use CSS custom properties written by the controller for width, height, center position, border color and opacity. Counter, label, gift popup and individual coin sprites must be optional with config values.

- [ ] **Step 5: Verify green**

Run: npx jest --runInBand plugins/schnorrbecher/test/overlay-controller.test.js && node --check plugins/schnorrbecher/overlay/coincup.js

Expected: PASS with three tests and no node --check output.

- [ ] **Step 6: Commit**

~~~bash
git add app/plugins/schnorrbecher/overlay/coincup.html app/plugins/schnorrbecher/overlay/coincup.css app/plugins/schnorrbecher/overlay/coincup.js app/plugins/schnorrbecher/test/overlay-controller.test.js
git diff --cached --check
git commit -m "feat(schnorrbecher): render a bounded Matter.js coin jar"
~~~

### Task 5: Administration page, preview, and all interactive controls

**Files:**

- Create: app/plugins/schnorrbecher/ui.html
- Create: app/plugins/schnorrbecher/ui.js
- Test: app/plugins/schnorrbecher/test/admin-ui.test.js

**Interfaces:**

- Produces class SchnorrbecherAdmin with load(), renderStatus(status), saveConfig(), copyOverlayUrl(), triggerTestGift(), addCoins(), reset(), and clearEventCache().
- Consumes the Task 3 REST API plus coinJar.sync and coinJar.config events.

- [ ] **Step 1: Write the failing jsdom controller test**

~~~js
/** @jest-environment jsdom */
const { SchnorrbecherAdmin } = require('../ui');

test('renders state and sends test, add, reset, and cache-clear actions', async () => {
  document.body.innerHTML = [
    '<span id="total-value"></span><span id="physical-count"></span>',
    '<span id="pending-count"></span><input id="overlay-url">',
    '<button id="test-gift"></button><button id="add-coins"></button>',
    '<button id="reset-coin-jar"></button><button id="clear-event-cache"></button>'
  ].join('');

  const calls = [];
  const admin = new SchnorrbecherAdmin({
    document,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ state: {} }) };
    },
    location: { origin: 'http://localhost:3000' },
    confirm: () => true
  });

  admin.renderStatus({
    state: { totalCoinValue: 1245 },
    physicalCoinCount: 83,
    pendingSpawns: 2
  });

  expect(document.querySelector('#total-value').textContent).toBe('1,245');
  expect(document.querySelector('#physical-count').textContent).toBe('83');
  await admin.triggerTestGift();
  await admin.addCoins();
  await admin.reset();
  await admin.clearEventCache();
  expect(calls.map(call => call.url)).toEqual(expect.arrayContaining([
    '/api/coin-jar/test-gift',
    '/api/coin-jar/add',
    '/api/coin-jar/reset',
    '/api/coin-jar/event-cache/clear'
  ]));
});
~~~

- [ ] **Step 2: Confirm red**

Run: npx jest --runInBand plugins/schnorrbecher/test/admin-ui.test.js

Expected: FAIL with Cannot find module ../ui.

- [ ] **Step 3: Implement the admin controller and semantic page**

~~~js
class SchnorrbecherAdmin {
  constructor(dependencies = {}) {
    this.document = dependencies.document || document;
    this.fetch = dependencies.fetch || window.fetch.bind(window);
    this.location = dependencies.location || window.location;
    this.confirm = dependencies.confirm || window.confirm.bind(window);
  }

  renderStatus(status = {}) {
    const formatter = new Intl.NumberFormat();
    this.document.querySelector('#total-value').textContent = formatter.format(status.state?.totalCoinValue || 0);
    this.document.querySelector('#physical-count').textContent = String(status.physicalCoinCount || 0);
    this.document.querySelector('#pending-count').textContent = String(status.pendingSpawns || 0);
  }

  async post(url, body = {}) {
    const response = await this.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error('Request failed: ' + url);
    return response.json();
  }

  triggerTestGift() { return this.post('/api/coin-jar/test-gift', { value: 100, giftName: 'Test Gift' }); }
  addCoins() { return this.post('/api/coin-jar/add', { value: 100 }); }
  reset() { return this.confirm('Coin Jar wirklich zurücksetzen?') ? this.post('/api/coin-jar/reset') : Promise.resolve(null); }
  clearEventCache() { return this.post('/api/coin-jar/event-cache/clear'); }
}

if (typeof module !== 'undefined') module.exports = { SchnorrbecherAdmin };
if (typeof window !== 'undefined') window.SchnorrbecherAdmin = SchnorrbecherAdmin;
~~~

ui.html contains status cards for connection, livestream, total value, physical icons and queue; every config field; buttons for Test Gift, Add 100 Coins, Reset Coin Jar, and Clear event cache; an iframe preview; and a readonly overlay-url of origin + /overlay/coincup?transparent=1. Bind config form submits to POST /api/coin-jar/config, hide unused visual controls based on config, and copy the URL through navigator.clipboard with a selected-text fallback.

- [ ] **Step 4: Verify green**

Run: npx jest --runInBand plugins/schnorrbecher/test/admin-ui.test.js && node --check plugins/schnorrbecher/ui.js

Expected: PASS and no syntax output.

- [ ] **Step 5: Commit**

~~~bash
git add app/plugins/schnorrbecher/ui.html app/plugins/schnorrbecher/ui.js app/plugins/schnorrbecher/test/admin-ui.test.js
git diff --cached --check
git commit -m "feat(schnorrbecher): add coin jar administration controls"
~~~

### Task 6: Acceptance tests, operational documentation, and visible runtime verification

**Files:**

- Create: app/plugins/schnorrbecher/README.md
- Modify: app/plugins/schnorrbecher/test/coin-jar-engine.test.js
- Modify: app/plugins/schnorrbecher/test/plugin-integration.test.js
- Modify: app/plugins/schnorrbecher/test/overlay-controller.test.js

**Interfaces:**

- Consumes all preceding contracts.
- Produces user-facing OBS setup, configuration, persistence and reset documentation.

- [ ] **Step 1: Add missing acceptance tests before changing behavior**

~~~js
test('caps a huge gift at 100 visual coins while retaining its full real value', () => {
  const { engine, state } = createEngine();
  const result = engine.addValue(1000000000, { eventId: 'large-1' });
  expect(result.visualCoins).toBe(100);
  expect(state.totalCoinValue).toBe(1000000000);
});

test('sync lets two overlays reconstruct the same persisted counter values', () => {
  const { engine } = createEngine();
  engine.addValue(500, { eventId: 'shared-1' });
  expect(engine.syncPayload()).toMatchObject({
    totalCoinValue: 500,
    visualCoinCount: 23
  });
});

test('connect sends a full state synchronization request', () => {
  const socket = { on: jest.fn(), emit: jest.fn() };
  const overlay = Object.create(CoinJarOverlay.prototype);
  overlay.socket = socket;
  overlay.bindSocket();
  const connect = socket.on.mock.calls.find(([event]) => event === 'connect')[1];
  connect();
  expect(socket.emit).toHaveBeenCalledWith('coinJar.sync.request');
});
~~~

- [ ] **Step 2: Confirm red**

Run: npx jest --runInBand plugins/schnorrbecher/test/coin-jar-engine.test.js plugins/schnorrbecher/test/plugin-integration.test.js plugins/schnorrbecher/test/overlay-controller.test.js plugins/schnorrbecher/test/admin-ui.test.js

Expected: FAIL only for an explicitly uncovered acceptance behavior.

- [ ] **Step 3: Implement the missing acceptance behavior and README**

~~~md
# Schnorrbecher

## OBS Browser Source

Use http://localhost:3000/overlay/coincup?transparent=1 as the Browser Source URL. Keep the source background transparent and set the source dimensions to the stream canvas.

## Controls

Open http://localhost:3000/schnorrbecher/ui for Test Gift, Add 100 Coins, Reset Coin Jar, cache clearing, configuration and preview.

## Persistence

session resets on a confirmed new stream. persistent restores the numeric total and rebuilds a compact random visual fill after an overlay reload.
~~~

Ensure clear() cancels every delayed spawn, applySync() reconstructs no more than maxPhysicalIcons bodies, reset clears the event cache, and malformed combo timeouts cannot increment twice.

- [ ] **Step 4: Run focused verification**

Run: npx jest --runInBand plugins/schnorrbecher/test && npm run build:css && npm run lint -- --quiet

Expected: all Schnorrbecher tests PASS, Tailwind completes, and ESLint exits 0.

- [ ] **Step 5: Perform visible runtime verification**

Run: ..\..\runtime\node\node.exe server.js

Expected: GET /api/status reports healthy state. Open http://localhost:3000/overlay/coincup?transparent=1&debug=1 in the local browser, then trigger Test Gift from /schnorrbecher/ui. Verify transparent canvas, falling icons, bottom/wall collisions, animated counter, full reset, reload synchronization, and a bounded 300-plus-icon condition.

- [ ] **Step 6: Commit final tests and documentation**

~~~bash
git add app/plugins/schnorrbecher/README.md app/plugins/schnorrbecher/test
git diff --cached --check
git commit -m "test(schnorrbecher): cover coin jar acceptance behavior"
~~~
