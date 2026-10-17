'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { buildObsCaptureInventory } = require('../../lib/obs-docs-capture-inventory');
const { PROFILES, ROUTE_SOURCES, buildMatrix, buildPlan } = require('../build-obs-104-matrix');
const EmojiRainPlugin = require('../../../app/plugins/emoji-rain/main.js');
const { isHttpAllowed } = require('../../../app/modules/public-overlay-registry');

const ROOT = path.resolve(__dirname, '../../..');
const LOCALES = ['de', 'en', 'es', 'fr'];
const MATRIX = buildMatrix(ROOT);

test('acceptance matrix exactly covers the current canonical inventory once per plugin and locale', () => {
  const matrix = MATRIX;
  const currentPublicGuides = buildObsCaptureInventory(ROOT, { baseUrl: 'http://127.0.0.1:3000' });
  const savedCanonical = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-source-inventory.json'), 'utf8'));
  const checklist = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-104-readiness-checklist-20261007.json'), 'utf8'));
  assert.equal(matrix.status, 'source-reviewed-plan-only-no-obs-execution');
  assert.equal(matrix.caseCount, 104);
  assert.equal(matrix.profileCount, 26);
  assert.equal(matrix.activeCaseCount, 100);
  assert.equal(matrix.retirementControlCount, 4);
  assert.equal(matrix.items.length, 104);
  assert.deepEqual(matrix.locales, LOCALES);
  assert.equal(savedCanonical.items.length, 104);
  assert.equal(currentPublicGuides.length, 68);
  assert.deepEqual(currentPublicGuides.map(item => `${item.plugin}:${item.locale}`).sort(), checklist.cases
    .filter(item => item.acceptanceScope === 'CURRENT_PUBLIC_OVERLAY_GUIDE')
    .map(item => item.caseId).sort());

  const ids = matrix.items.map((item) => item.caseId);
  assert.equal(new Set(ids).size, 104);
  assert.deepEqual(ids, savedCanonical.items.map((item) => `${item.plugin}:${item.locale}`));
  for (let index = 0; index < savedCanonical.items.length; index += 1) {
    const actual = matrix.items[index];
    const expected = savedCanonical.items[index];
    assert.deepEqual({
      plugin: actual.plugin,
      locale: actual.locale,
      sceneName: actual.sceneName,
      sourceName: actual.sourceName,
      overlayPath: actual.overlayPath,
      overlayUrl: (() => { const url = new URL(actual.overlayUrl); url.searchParams.delete('timer'); url.searchParams.delete('id'); return url.toString(); })(),
      width: actual.width,
      height: actual.height
    }, expected);
  }
});

test('all 26 contracts cite real local entrypoints and state blockers instead of inventing event payloads', () => {
  assert.equal(Object.keys(PROFILES).length, 26);
  assert.deepEqual(Object.keys(PROFILES).sort(), Object.keys(ROUTE_SOURCES).sort());
  const matrix = MATRIX;
  const uniqueProfiles = new Set();
  const uniqueEvents = new Set();

  for (const [plugin, profile] of Object.entries(PROFILES)) {
    for (const field of ['entry', 'initial', 'update', 'negative', 'cleanup', 'gpu', 'audio', 'external', 'risk', 'evidence']) {
      assert.equal(typeof profile[field], 'string', `${plugin}.${field}`);
      assert.ok(profile[field].trim(), `${plugin}.${field}`);
    }
    assert.ok(Array.isArray(ROUTE_SOURCES[plugin]) && ROUTE_SOURCES[plugin].length > 0);
    for (const source of ROUTE_SOURCES[plugin]) assert.ok(fs.existsSync(path.join(ROOT, source)), `${plugin}: ${source}`);
    assert.ok(profile.trigger && Object.hasOwn(profile.trigger, 'event') && Object.hasOwn(profile.trigger, 'payload'));
    if (!profile.trigger.event || !profile.trigger.payload) assert.ok(profile.blocker, `${plugin} missing trigger details must be a blocker`);
    if (profile.fixtureStatus) {
      assert.equal(matrix.items.find((item) => item.plugin === plugin).status, profile.fixtureStatus);
    } else if (profile.blocker) {
      assert.equal(matrix.items.find((item) => item.plugin === plugin).status, 'blocked-before-practical-capture');
    }
    uniqueProfiles.add(JSON.stringify({ initial: profile.initial, update: profile.update, negative: profile.negative }));
    if (profile.trigger.event) uniqueEvents.add(profile.trigger.event);
  }
  assert.equal(uniqueProfiles.size, 26, 'plugin contracts must not collapse into generic placeholders');
  assert.ok(uniqueEvents.size >= 20, 'event-driven overlays retain their distinct source event contracts');
});

test('EmojiRain matrix entry, emitted spawn payload and public read-state contract follow the actual source', () => {
  const profile = PROFILES['emoji-rain'];
  const expectedSources = [
    'app/plugins/emoji-rain/obs-hud.html',
    'app/public/js/i18n-client.js',
    'app/public/js/matter.min.js',
    'app/public/js/emoji-rain-obs-hud.js',
    'app/plugins/emoji-rain/main.js',
    'app/modules/public-overlay-registry.js'
  ];
  assert.equal(profile.entry, 'GET /emoji-rain/obs-hud → app/plugins/emoji-rain/obs-hud.html → app/public/js/emoji-rain-obs-hud.js');
  assert.deepEqual(ROUTE_SOURCES['emoji-rain'], expectedSources);
  assert.equal(profile.trigger.payloadStatus, 'source-confirmed-minimal-fixture');
  assert.equal(profile.readGetContracts.find(contract => contract.path === '/api/emoji-rain/overlay/state').rendererCalls, true);
  assert.equal(profile.opacityCheck.rendererConsumes, true);
  const renderer = fs.readFileSync(path.join(ROOT, 'app/public/js/emoji-rain-obs-hud.js'), 'utf8');
  const html = fs.readFileSync(path.join(ROOT, 'app/plugins/emoji-rain/obs-hud.html'), 'utf8');
  assert.match(html, /id="canvas-container"/);
  assert.match(html, /src="\/js\/emoji-rain-obs-hud\.js\?/);
  assert.match(renderer, /fetch\('\/api\/emoji-rain\/overlay\/state'\)/);
  assert.match(renderer, /registerSocketHandler\('emoji-rain:opacity', handleOverlayOpacityEvent\)/);
  assert.match(renderer, /container\.style\.opacity = String\(value\)/);
  assert.match(renderer, /requestRevision !== opacityRequestRevision \|\| opacityEventReceived/);
  for (const contract of profile.readGetContracts) {
    assert.equal(isHttpAllowed({ method: contract.method, pathname: contract.path }), true, `${contract.path} must remain GET-allowlisted`);
  }
  assert.equal(MATRIX.caseCount, 104);
  assert.equal(MATRIX.activeCaseCount, 100);
  for (const locale of LOCALES) {
    const item = MATRIX.items.find(candidate => candidate.caseId === `emoji-rain:${locale}`);
    assert.equal(item.entry, profile.entry);
    assert.deepEqual(item.trigger.payload, profile.trigger.payload);
    assert.equal(item.status, 'ready-for-isolated-fixture-review');
    assert.equal(item.obsStatus, 'NOT_TESTED');
    assert.equal(item.visualReview, 'pending');
  }

  const emitted = [];
  const routes = new Map();
  const plugin = Object.create(EmojiRainPlugin.prototype);
  plugin.api = {
    getDatabase: () => ({ getEmojiRainConfig: () => ({ enabled: true, max_count_per_event: 10, max_intensity: 2, emoji_set: ['✨'] }) }),
    emit: (event, payload) => emitted.push({ event, payload }),
    registerRoute: (method, routePath, handler) => routes.set(`${method.toUpperCase()} ${routePath}`, handler),
    registerMiddleware() {},
    log() {}
  };
  plugin.uploadDir = path.join(ROOT, 'app/plugins/emoji-rain/uploads');
  plugin.overlayState = { paused: false, opacity: 0.35, theme: 'default', speed: 1 };
  plugin.spawnQueue = [];
  plugin.metrics = { totalTriggers: 0, totalEmojisSpawned: 0, avgCount: 0, avgIntensity: 0 };
  plugin.debugMode = false;

  const returnedPayload = plugin.triggerEmojiRain({ count: 1, emoji: '💙', x: 0.5, y: 0.15, username: 'Pilot Viewer' });
  assert.deepEqual(returnedPayload, profile.trigger.payload);
  assert.deepEqual(emitted, [{ event: profile.trigger.event, payload: profile.trigger.payload }]);

  plugin.registerRoutes();
  let publicState;
  routes.get('GET /api/emoji-rain/overlay/state')({}, { json: value => { publicState = value; } });
  assert.deepEqual(publicState, { success: true, state: { opacity: 0.35 } });
  let opacityResponse;
  routes.get('POST /api/emoji-rain/overlay/opacity')({ body: { opacity: 0.35 } }, {
    json: value => { opacityResponse = value; },
    status(status) { this.statusCode = status; return this; }
  });
  assert.deepEqual(opacityResponse, { success: true, opacity: 0.35 });
  assert.deepEqual(emitted.at(-1), { event: 'emoji-rain:opacity', payload: { opacity: 0.35 } });
  assert.equal(isHttpAllowed({ method: 'GET', pathname: '/api/emoji-rain/overlay/state' }), true);
  assert.equal(isHttpAllowed({ method: 'POST', pathname: '/api/emoji-rain/overlay/state' }), false);
});

test('TopTier offline fixture evidence stays separate from OBS-104 acceptance', () => {
  const profile = PROFILES.toptier;
  assert.equal(profile.fixtureStatus, 'in-process-renderer-fixture-passed-not-obs');
  assert.equal(profile.fixtureTest, 'app/plugins/toptier/test/obs-toptier-fixtures.test.js');
  assert.equal(profile.trigger.payloadStatus, 'source-confirmed-minimal-fixture');
  assert.deepEqual(profile.trigger.payload.entries[0], {
    username: 'fixture-liker',
    nickname: 'Fixture Liker',
    profile_picture_url: '',
    score: 42,
    rank: 1
  });
  assert.equal(MATRIX.caseCount, 104);
  assert.equal(MATRIX.activeCaseCount, 100);
  for (const locale of LOCALES) {
    const item = MATRIX.items.find(candidate => candidate.caseId === `toptier:${locale}`);
    assert.equal(item.status, 'in-process-renderer-fixture-passed-not-obs');
    assert.equal(item.fixtureTest, profile.fixtureTest);
    assert.equal(item.obsStatus, 'NOT_TESTED');
    assert.equal(item.visualReview, 'pending');
  }
  assert.equal(MATRIX.items.some(item => item.status === 'obs-passed' || item.status === 'browser-source-passed'), false);
});

test('OpenShock primary overlay fixture covers only an inert synthetic display contract', () => {
  const profile = PROFILES.openshock;
  assert.equal(profile.fixtureStatus, 'in-process-renderer-fixture-passed-not-obs');
  assert.equal(profile.fixtureTest, 'app/plugins/openshock/test/obs-primary-overlay-fixture.test.js');
  assert.equal(profile.trigger.event, 'openshock:command-sent');
  assert.equal(profile.trigger.payload.command.type, 'vibrate');
  assert.equal(profile.obsStatus, 'NOT_TESTED');
  assert.match(profile.risk, /hardware command/);
  for (const locale of LOCALES) {
    const item = MATRIX.items.find(candidate => candidate.caseId === `openshock:${locale}`);
    assert.equal(item.status, 'in-process-renderer-fixture-passed-not-obs');
    assert.equal(item.fixtureTest, profile.fixtureTest);
    assert.equal(item.obsStatus, 'NOT_TESTED');
  }
});

test('Flame Overlay and Fireworks trigger profiles use source-backed fixtures in all public locales', () => {
  const fixtureTest = 'app/test/obs-priority-trigger-renderer-fixtures.test.js';
  for (const plugin of ['flame-overlay', 'fireworks']) {
    const profile = PROFILES[plugin];
    assert.equal(profile.fixtureStatus, 'in-process-renderer-fixture-passed-not-obs');
    assert.equal(profile.fixtureTest, fixtureTest);
    assert.equal(profile.trigger.payloadStatus, 'source-confirmed-minimal-fixture');
    for (const locale of LOCALES) {
      const item = MATRIX.items.find(candidate => candidate.caseId === `${plugin}:${locale}`);
      assert.equal(item.fixtureTest, fixtureTest);
      assert.equal(item.trigger.payload.id, `fixture-${plugin}-${locale}`);
      assert.equal(item.status, 'in-process-renderer-fixture-passed-not-obs');
      assert.equal(item.obsStatus, 'NOT_TESTED');
    }
  }
  assert.equal(PROFILES['flame-overlay'].trigger.payload.type, 'intensity-boost');
  assert.equal(PROFILES['flame-overlay'].trigger.payload.amount, 0.5);
  assert.equal(PROFILES.fireworks.trigger.payload.playSound, false);
});

test('every URL is loopback-only, credentials-free and has locale plus exact capture dimensions', () => {
  const matrix = MATRIX;
  for (const item of matrix.items) {
    const url = new URL(item.overlayUrl);
    assert.equal(url.protocol, 'http:');
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.username, '');
    assert.equal(url.password, '');
    assert.equal(url.searchParams.get('lang'), item.locale);
    assert.ok(Number.isInteger(item.width) && item.width > 0);
    assert.ok(Number.isInteger(item.height) && item.height > 0);
    assert.equal(item.sceneName, 'tutorial');
    assert.equal(item.sourceName, 'LTTH Docs Capture');
  }
});

test('timer and goals use guide-backed synthetic query ids without changing the 104-case inventory', () => {
  for (const locale of LOCALES) {
    const timer = MATRIX.items.find((item) => item.caseId === `advanced-timer:${locale}`);
    const goal = MATRIX.items.find((item) => item.caseId === `goals:${locale}`);
    assert.equal(new URL(timer.overlayUrl).searchParams.get('timer'), `fixture-timer-${locale}`);
    assert.equal(timer.trigger.payload.id, `fixture-timer-${locale}`);
    assert.equal(new URL(goal.overlayUrl).searchParams.get('id'), `fixture-goal-${locale}`);
    assert.equal(goal.trigger.payload.goalId, `fixture-goal-${locale}`);
    assert.equal(goal.trigger.payload.goal.id, `fixture-goal-${locale}`);
    assert.equal(timer.status, 'in-process-renderer-fixture-passed-not-obs');
    assert.equal(goal.status, 'in-process-renderer-fixture-passed-not-obs');
    assert.equal(timer.fixtureTest, 'app/test/obs-timer-goals-renderer-fixtures.test.js');
    assert.equal(goal.fixtureTest, 'app/test/obs-timer-goals-renderer-fixtures.test.js');
  }
  assert.equal(MATRIX.caseCount, 104);
  assert.equal(MATRIX.activeCaseCount, 100);
  assert.equal(MATRIX.items.filter((item) => item.status === 'in-process-renderer-fixture-passed-not-obs').length, 28);
  assert.equal(MATRIX.items.filter((item) => item.status === 'ready-for-isolated-fixture-review').length, 8);
  assert.equal(MATRIX.items.filter((item) => item.status === 'blocked-before-practical-capture').length, 64);
  const viewerXp = PROFILES['milestone-leaderboard'];
  assert.equal(viewerXp.fixtureStatus, 'in-process-renderer-fixture-passed-not-obs');
  assert.equal(viewerXp.fixtureTest, 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js');
  assert.equal(viewerXp.obsStatus, 'not-run');
  assert.equal(viewerXp.visualReview, 'pending');
  assert.match(viewerXp.cleanup, /non-persisted pagehide/);
  assert.match(viewerXp.blocker, /BFCache restore is covered only by the in-process fixture/);
  assert.deepEqual(MATRIX.items.filter((item) => item.plugin === 'milestone-leaderboard').map((item) => item.status), Array(4).fill('in-process-renderer-fixture-passed-not-obs'));
  assert.equal(MATRIX.caseCount, 104);
  assert.equal(MATRIX.activeCaseCount, 100);
  assert.equal(MATRIX.items.filter((item) => item.status === 'in-process-renderer-fixture-passed-not-obs').length, 28);
  assert.equal(MATRIX.items.filter((item) => item.status === 'blocked-before-practical-capture').length, 64);
  assert.equal(MATRIX.items.filter((item) => item.status === 'retired-control-not-obs').length, 4);
});

test('pilot batching keeps the 104-case denominator and prioritizes a synthetic-only simple renderer', () => {
  const matrix = MATRIX;
  assert.deepEqual(matrix.pilotBatchOrder.map((batch) => batch.plugin), ['stt-ticker', 'spotlight', 'goals', 'music-bot']);
  assert.ok(matrix.pilotBatchOrder.every((batch) => batch.cases === 4 && batch.locales.length === 4));
  assert.equal(matrix.caseCount, 104);
  assert.equal(matrix.activeCaseCount, 100);
  assert.equal(matrix.retirementControlCount, 4);
  assert.equal(PROFILES['stt-ticker'].trigger.event, 'stt-ticker:transcript');
  assert.equal(PROFILES['stt-ticker'].trigger.payload.text, 'Synthetic caption fixture.');
  assert.match(PROFILES['stt-ticker'].risk, /synthetic text only/);
  assert.match(buildPlan(matrix), /alle 104 Fälle bleiben im Gate/);
});

test('Chatango retirement controls preserve four historical IDs without a renderer or OBS pass', () => {
  const cases = MATRIX.items.filter(item => item.plugin === 'chatango');
  assert.equal(cases.length, 4);
  assert.ok(cases.every(item => item.status === 'retired-control-not-obs'));
  assert.ok(cases.every(item => item.obsStatus === 'NOT_TESTED' && item.obsVisualPass === false && item.notAnObsPass));
  assert.ok(cases.every(item => item.blocker && item.retirementEvidence === 'app/test/chatango-backend-removal.test.js'));
});

test('matrix and plan outputs remain source-only acceptance planning, not practical OBS passes', () => {
  const matrix = MATRIX;
  assert.equal(matrix.fixtureVsProductAcceptance.browserRenderer.includes('later isolated Browser Source evidence'), true);
  assert.equal(matrix.fixtureVsProductAcceptance.visualReview.includes('pending independent image review'), true);
  assert.match(buildPlan(matrix), /keine OBS-Ausführung/);
  assert.match(buildPlan(matrix), /kein Fixturepass zählt als OBS-Pass/i);
});

test('alternate matrix roots cannot borrow the default frozen inventory', t => {
  const root = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'obs-matrix-root-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inventoryPath = path.join(root, 'docs/coordination/obs-104-source-inventory.json');
  assert.throws(() => buildMatrix(root), error => {
    assert.equal(error.code, 'ENOENT');
    assert.equal(path.resolve(error.path), path.resolve(inventoryPath));
    return true;
  });
  fs.mkdirSync(path.dirname(inventoryPath), { recursive: true });
  fs.writeFileSync(inventoryPath, JSON.stringify({ items: [] }));
  assert.throws(() => buildMatrix(root), /Expected the frozen OBS-104 source inventory, found 0 cases/);
});
