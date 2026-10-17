'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validateReceipt, validateTopTier, validateGoals, REQUIRED_SOURCES, TOPTIER_SOURCES, GOALS_SOURCES } = require('../actual-backend-summary');
const { validateSpotlight, SPOTLIGHT_SOURCES } = require('../actual-backend-summary');
const bytes = Buffer.from('owned-current-source');
const hash = crypto.createHash('sha256').update(bytes).digest('hex');
const ROOT = require('path').resolve(__dirname, '../../..');
function baseReceipt() {
  const files = REQUIRED_SOURCES;
  const pins = Object.fromEntries(files.map(file => [file, hash]));
  return { result: 'PASS', scope: 'actual maintained backend; isolated Timer only; not OBS', pid: 123, port: 4567, sourceHashes: pins, postSourceHashes: pins, fixtureHashes: pins, sourceStable: true, steps: [{ method: 'POST', route: '/api/advanced-timer/timers', status: 200 }], cleanup: { terminalConfirmed: true, portClosed: true, socketDisconnected: true, forced: false, childExitCode: 0, childSignalCode: null, gracefulAppShutdownProven: true }, shutdownResponse: { status: 200, body: { success: true }, targetPid: 123, targetPort: 4567 } };
}
function accepted() {
  const receipt = baseReceipt();
  receipt.runtime = { node: '22.14.0', socketIoVersion: 'test-version' };
  receipt.stagedManifest = { sourceMatchesExceptEnabled: true };
  receipt.tick = { id: 'owned-test-timer', currentValue: 89.9, state: 'running' };
  receipt.steps[0].result = { success: true, timer: { id: 'owned-test-timer' } };
  for (const [method, suffix] of [['GET', ''], ['PUT', ''], ['POST', '/start'], ['POST', '/pause'], ['POST', '/reset'], ['DELETE', '']]) receipt.steps.push({ method, route: `/api/advanced-timer/timers/owned-test-timer${suffix}`, status: 200, result: { success: true } });
  return receipt;
}
test('missing behavior pins fail closed', () => {
  const receipt = accepted(); delete receipt.sourceHashes['app/plugins/advanced-timer/engine/timer-engine.js'];
  assert.equal(validateReceipt(receipt, () => bytes).status, 'NOT_ACCEPTED');
});
test('missing or tampered screenshot cannot pass browser evidence', () => {
  const path = require('path');
  const receipt = accepted();
  receipt.renderer = { screenshot: path.resolve('output/playwright/actual-timer/test.png'), screenshotPin: { bytes: bytes.length, sha256: hash }, locales: ['de', 'en', 'es', 'fr'].map(locale => ({ locale })), reconnect: {}, negativeCases: [{}, {}] };
  receipt.sourceHashes['app/plugins/advanced-timer/overlay.html'] = hash;
  receipt.postSourceHashes['app/plugins/advanced-timer/overlay.html'] = hash;
  receipt.fixtureHashes['app/plugins/advanced-timer/overlay.html'] = hash;
  receipt.browserClosed = true; receipt.browserErrors = []; receipt.servedHtmlHash = hash;
  assert.equal(validateReceipt(receipt, () => bytes, () => bytes).browserStatus, 'PASS');
  assert.equal(validateReceipt(receipt, () => bytes, () => Buffer.from('tampered')).browserStatus, 'NOT_ACCEPTED');
  assert.equal(validateReceipt(receipt, () => bytes, () => { throw Error('missing'); }).browserStatus, 'NOT_ACCEPTED');
});
test('accepts current owned backend proof without inventing browser or OBS pass', () => {
  const result = validateReceipt({ ...accepted(), runtime: { node: '22.14.0', socketIoVersion: 'test-version' }, stagedManifest: { sourceMatchesExceptEnabled: true } }, () => bytes);
  assert.equal(result.status, 'PASS'); assert.equal(result.browserStatus, 'NOT_OBSERVED'); assert.equal(result.obs, 'NOT_OBSERVED');
});
test('stale current source fails closed', () => assert.equal(validateReceipt(accepted(), () => Buffer.from('changed')).status, 'NOT_ACCEPTED'));
test('Timer core DatabaseManager pin is required independently of plugin database', () => {
  const receipt = accepted();
  const result = validateReceipt(receipt, file => file === 'app/modules/database.js' ? Buffer.from('changed-core-database') : bytes);
  assert.equal(result.status, 'NOT_ACCEPTED');
  assert(result.errors.includes('stale-source:app/modules/database.js'));
  assert(!result.errors.includes('stale-source:app/plugins/advanced-timer/backend/database.js'));
  const missing = accepted();
  delete missing.sourceHashes['app/modules/database.js'];
  assert(validateReceipt(missing, () => bytes).errors.includes('required-source-pins-missing'));
});
test('failed run cannot become pass', () => assert.equal(validateReceipt({ ...accepted(), result: 'FAIL' }, () => bytes).status, 'NOT_ACCEPTED'));
test('missing cleanup and false graceful claim fail closed', () => {
  assert.equal(validateReceipt({ ...accepted(), cleanup: {} }, () => bytes).status, 'NOT_ACCEPTED');
  assert.equal(validateReceipt({ ...accepted(), cleanup: { ...accepted().cleanup, childSignalCode: 'SIGTERM', childExitCode: null } }, () => bytes).status, 'NOT_ACCEPTED');
});
function topTierBaseReceipt() {
  const pins = Object.fromEntries(TOPTIER_SOURCES.map(file => [file, hash]));
  return { result: 'PASS_LIMITED', scope: 'actual maintained backend; isolated TopTier only; not OBS', pid: 123, port: 4567, cleanup: { exitCode: 0, signal: null, portClosed: true, graceful: true }, browserClosed: true, shutdown: { status: 200, body: { success: true } }, sourceStable: true, runtime: { node: '22.14.0', socketIo: 'test-version' }, stagedManifestHash: hash, sourceHashes: pins, postSourceHashes: pins, fixtureHashes: pins, servedHtmlHash: hash, browserErrors: [], actualUpdate: { board: 'likes', entries: [{ username: 'Owned_TopTier_Probe', score: 25 }] }, locales: ['de', 'en', 'es', 'fr'].map(locale => ({ locale, name: 'Owned_TopTier_Probe', score: '25' })), screenshot: { path: require('path').resolve('output/playwright/actual-toptier/test.png'), bytes: bytes.length, sha256: hash }, steps: [['POST', '/test-event'], ['GET', '/config'], ['POST', '/config'], ['GET', '/board/likes'], ['GET', '/session/current']].map(([method, route]) => ({ method, route, status: 200, result: { success: true } })) };
}
function topTierReceipt() {
  const receipt = topTierBaseReceipt();
  receipt.actualUpdate.sessionId = 'owned-session';
  const copy = [
    ['TopTier-Overlay', ['❤️ Gefällt mir', '🎁 Geschenke'], 'Keine Einträge'],
    ['TopTier Overlay', ['❤️ Likes', '🎁 Gifts'], 'No entries'],
    ['Superposición de nivel superior', ['❤️ Me gusta', '🎁 Regalos'], 'No hay entradas'],
    ['Superposition de niveau supérieur', ['❤️ J’aime', '🎁 Cadeaux'], 'Aucune entrée']
  ];
  receipt.locales.forEach((item, index) => {
    [item.title, item.boardLabels, item.emptyLabel] = copy[index]; item.sessionId = 'owned-session';
    receipt.steps.push({ route: '/api/i18n/current', method: 'POST', status: 200, result: { success: true, locale: item.locale } });
  });
  return receipt;
}
test('TopTier missing Gifts empty label, locale drift and stale core DB reject current acceptance', () => {
  const missing = topTierReceipt(); delete missing.locales[3].emptyLabel;
  assert.equal(validateTopTier(missing, () => bytes, () => bytes).backendValidated, false);
  const drift = topTierReceipt(); drift.locales[3].boardLabels[1] = '🎁 Gifts';
  assert.equal(validateTopTier(drift, () => bytes, () => bytes).backendValidated, false);
  const changed = validateTopTier(topTierReceipt(), file => file === 'app/modules/database.js' ? Buffer.from('changed-core') : bytes, () => bytes);
  assert(changed.errors.includes('stale-or-missing-source:app/modules/database.js'));
});
test('TopTier actual local update validates limited scope without full browser or OBS acceptance', () => {
  const result = validateTopTier(topTierReceipt(), () => bytes, () => bytes);
  assert.equal(result.status, 'PARTIAL'); assert.equal(result.backendValidated, true); assert.equal(result.browserStatus, 'PARTIAL'); assert.equal(result.obs, 'NOT_OBSERVED');
});
test('TopTier changed source or artifact rejects acceptance', () => {
  assert.equal(validateTopTier(topTierReceipt(), () => Buffer.from('changed'), () => bytes).backendValidated, false);
  assert.equal(validateTopTier(topTierReceipt(), () => bytes, () => Buffer.from('changed')).backendValidated, false);
  assert.equal(validateTopTier(topTierReceipt(), () => bytes, () => { throw Error('missing'); }).backendValidated, false);
});
test('TopTier lone PASS_LIMITED, wrong actual row and missing cleanup cannot pass', () => {
  const receipt = topTierReceipt(); receipt.actualUpdate.entries[0].score = 99;
  assert.equal(validateTopTier(receipt, () => bytes, () => bytes).backendValidated, false);
  assert.equal(validateTopTier({ result: 'PASS_LIMITED' }, () => bytes, () => bytes).backendValidated, false);
  assert.equal(validateTopTier({ ...topTierReceipt(), cleanup: {} }, () => bytes, () => bytes).backendValidated, false);
});

function spotlightReceipt() {
  const receipt = JSON.parse(require('fs').readFileSync(require('path').join(ROOT, 'docs/coordination/evidence/actual-spotlight-a8f5e1e3-6dcc-40cb-9747-9b9655527715.json'), 'utf8'));
  receipt.sourceHashes = Object.fromEntries(SPOTLIGHT_SOURCES.map(file => [file, hash]));
  receipt.postSourceHashes = { ...receipt.sourceHashes };
  receipt.fixtureHashes = { ...receipt.sourceHashes };
  receipt.servedHtmlHash = hash;
  receipt.screenshot.bytes = bytes.length; receipt.screenshot.sha256 = hash;
  return receipt;
}
test('Spotlight validates actual chatter and four locales separately from OBS', () => {
  const result = validateSpotlight(spotlightReceipt(), () => bytes, () => bytes);
  assert.equal(SPOTLIGHT_SOURCES.length, 25);
  assert.equal(result.status, 'PASS'); assert.equal(result.browserStatus, 'PASS'); assert.equal(result.obs, 'NOT_OBSERVED');
});
test('Spotlight rejects missing real locale command, wrong displayed label or event correlation', () => {
  for (const mutate of [r => { r.steps = r.steps.filter(s => s.result?.locale !== 'fr'); }, r => { r.locales[3].text = 'New chat'; }, r => { r.actualTestUser.nickname = 'unrelated'; }, r => { delete r.reconnect; }]) {
    const receipt = spotlightReceipt(); mutate(receipt);
    assert.equal(validateSpotlight(receipt, () => bytes, () => bytes).status, 'NOT_ACCEPTED');
  }
});
test('Spotlight rejects stale core, failed run, missing cleanup and altered or escaped screenshot', () => {
  assert.equal(validateSpotlight(spotlightReceipt(), file => file === 'app/modules/database.js' ? Buffer.from('changed') : bytes, () => bytes).status, 'NOT_ACCEPTED');
  assert.equal(validateSpotlight(spotlightReceipt(), () => bytes, () => Buffer.from('changed')).status, 'NOT_ACCEPTED');
  assert.equal(validateSpotlight(spotlightReceipt(), () => bytes, () => { throw Error('missing'); }).status, 'NOT_ACCEPTED');
  for (const mutate of [r => { r.result = 'FAIL'; }, r => { r.cleanup = {}; }, r => { r.screenshot.path = require('path').resolve('output/foreign.png'); }, r => { delete r.sourceHashes['app/modules/database.js']; }]) {
    const receipt = spotlightReceipt(); mutate(receipt);
    assert.equal(validateSpotlight(receipt, () => bytes, () => bytes).status, 'NOT_ACCEPTED');
  }
});

const goalProbeSource = Buffer.from("assert.equal(fetched.goal.current_value, 30); includes('30 / 100'); for (const locale of ['de', 'en', 'es', 'fr']) api('/api/i18n/current', 'POST', { locale }); window.socket.disconnect(); window.socket.connect();");
const goalOverlaySource = Buffer.from("on('goals:value-changed' data); this.socket.emit('goals:subscribe'");
const goalScreenshot = Buffer.from('owned-goals-screenshot');
const goalLocales = {
  de: '{value} bis zum Ziel', en: '{value} remaining', es: 'Faltan {value}', fr: 'Il reste {value}'
};
function goalsSource(file) {
  if (file === 'scripts/obs-pilot/actual-goals-backend-probe.js') return goalProbeSource;
  if (file === 'app/plugins/goals/overlay/overlay.js') return goalOverlaySource;
  const locale = file.match(/^app\/plugins\/goals\/locales\/(de|en|es|fr)\.json$/)?.[1];
  if (locale) return Buffer.from(JSON.stringify({ plugins: { goals: { goals: { overlay: { remaining: goalLocales[locale] } } } } }));
  return Buffer.from(`owned-goals-source:${file}`);
}
function goalsReceipt() {
  const sourceHashes = Object.fromEntries(GOALS_SOURCES.map(file => [file, crypto.createHash('sha256').update(goalsSource(file)).digest('hex')]));
  const fixtureSources = GOALS_SOURCES.filter(file => file.startsWith('app/plugins/goals/'));
  const fixtureHashes = Object.fromEntries(fixtureSources.map(file => [file, sourceHashes[file]]));
  const goalId = 'goal_owned_fixture';
  const steps = [
    { route: '/api/health', method: 'GET', status: 200 },
    { route: '/api/goals', method: 'POST', status: 200, result: { success: true, goal: { id: goalId, name: 'Owned Local Fixture Goal', goal_type: 'coin', current_value: 25, target_value: 100 } } },
    { route: `/api/goals/${goalId}`, method: 'GET', status: 200, result: { success: true, goal: { id: goalId, name: 'Owned Local Fixture Goal', current_value: 25, target_value: 100 } } },
    { route: `/api/goals/${goalId}/increment`, method: 'POST', status: 200, result: { success: true, goal: { id: goalId, current_value: 30, target_value: 100 } } },
    { route: `/api/goals/${goalId}`, method: 'GET', status: 200, result: { success: true, goal: { id: goalId, current_value: 30, target_value: 100 } } }
  ];
  for (const locale of ['de', 'en', 'es', 'fr']) steps.push({ route: '/api/i18n/current', method: 'POST', status: 200, result: { success: true, locale } });
  steps.push(
    { route: `/api/goals/${goalId}/increment`, method: 'POST', status: 200, result: { success: true, goal: { id: goalId, current_value: 35, target_value: 100 } } },
    { route: `/api/goals/${goalId}`, method: 'GET', status: 200, result: { success: true, goal: { id: goalId, current_value: 35, target_value: 100 } } }
  );
  const bytes = crypto.createHash('sha256').update(goalsSource('app/plugins/goals/overlay/index.html')).digest('hex');
  return {
    schemaVersion: 1,
    scope: 'isolated local Goals backend and original overlay renderer; not public or OBS acceptance',
    result: 'PASS_LOCAL_ONLY', pid: 321, port: 4567, profile: 'ltth-actual-goals-test',
    runtime: { node: '22.14.0', socketIo: '4.8.3' }, sourceStable: true,
    sourceHashes, postSourceHashes: { ...sourceHashes }, fixtureHashes,
    steps,
    goalFixture: { created: true, name: 'Owned Local Fixture Goal', type: 'coin', initialValue: 25, target: 100, readBack: { name: 'Owned Local Fixture Goal', currentValue: 25 } },
    servedOverlay: { status: 200, urlPath: '/goals/overlay', sha256: bytes },
    rendererInitial: { name: 'Owned Local Fixture Goal', value: '25 / 100' },
    rendererAfterUpdate: { name: 'Owned Local Fixture Goal', value: '30 / 100' },
    onlineUpdateCorrelation: { socketEventCount: 1, packet: { goalId, currentValue: 30, targetValue: 100 } },
    localeChanges: ['de', 'en', 'es', 'fr'].map(locale => ({ serverLocale: locale, clientLocale: locale, htmlLang: locale, name: 'Owned Local Fixture Goal', value: '30 / 100', remainingText: goalLocales[locale].replace('{value}', '70') })),
    offlineUpdate: { persistedValue: 35, socketEventCountWhileDisconnected: 1, unavailableNoticeVisible: true },
    reconnect: { connected: true, connectCount: 1, disconnectCount: 1, subscriptionPacket: { goalId, currentValue: 35, targetValue: 100 }, name: 'Owned Local Fixture Goal', value: '35 / 100', remainingText: 'Il reste 65', clientLocale: 'fr' },
    browserErrors: [], browserClosed: true,
    shutdownRequest: { status: 200, graceful: true }, exitCode: 0, signal: null, portClosed: true,
    serverLogSignals: { gracefulClose: true, forcedShutdown: false, tail: 'Client connected: a\nClient disconnected: a\nClient connected: b\nClient disconnected: b' },
    tempDatabase: { quickCheck: 'ok', fixtureCurrentValue: 35, fixtureTargetValue: 100 }, profileRemoved: true,
    screenshot: { path: require('path').resolve('output/playwright/actual-goals/test.png'), bytes: goalScreenshot.length, sha256: crypto.createHash('sha256').update(goalScreenshot).digest('hex') }
  };
}

test('Goals receipt is accepted as local-only while public display stays blocked', () => {
  const result = validateGoals(goalsReceipt(), goalsSource, () => goalScreenshot, require('path').resolve('.'));
  assert.equal(GOALS_SOURCES.length, 30);
  assert.equal(result.status, 'LOCAL_ONLY');
  assert.equal(result.localIntegration, 'PASS');
  assert.equal(result.publicStatus, 'BLOCKED');
  assert.equal(result.browserStatus, 'LOCAL_ONLY');
  assert.equal(result.obs, 'NOT_OBSERVED');
});

test('current actual Goals receipt passes only the independent local-only contract', () => {
  const receipt = JSON.parse(require('fs').readFileSync(require('path').join(ROOT, 'docs/coordination/evidence/actual-goals-477f6f8b-73d6-470b-b513-286b019591d6.json'), 'utf8'));
  const result = validateGoals(receipt, file => require('fs').readFileSync(require('path').join(ROOT, file)), file => require('fs').readFileSync(file), ROOT);
  assert.equal(result.status, 'LOCAL_ONLY');
  assert.equal(result.publicStatus, 'BLOCKED');
  assert.equal(result.obs, 'NOT_OBSERVED');
});

test('Goals rejects a stale source pin and the historical receipt without complete current proof', () => {
  const stale = validateGoals(goalsReceipt(), file => file === 'app/server.js' ? Buffer.from('stale') : goalsSource(file), () => goalScreenshot, require('path').resolve('.'));
  assert.equal(stale.status, 'NOT_ACCEPTED');
  assert(stale.errors.includes('stale-or-missing-source:app/server.js'));
  const historical = JSON.parse(require('fs').readFileSync(require('path').join(ROOT, 'docs/coordination/evidence/actual-goals-f7dffd08-307c-459a-bcdb-00394c87851b.json'), 'utf8'));
  assert.equal(validateGoals(historical, goalsSource, () => goalScreenshot, require('path').resolve('.')).status, 'NOT_ACCEPTED');
});

test('Goals rejects missing disconnect/reconnect recovery evidence', () => {
  const receipt = goalsReceipt();
  receipt.reconnect.disconnectCount = 0;
  receipt.reconnect.subscriptionPacket.currentValue = 30;
  receipt.reconnect.value = '30 / 100';
  receipt.offlineUpdate.persistedValue = 30;
  const result = validateGoals(receipt, goalsSource, () => goalScreenshot, require('path').resolve('.'));
  assert.equal(result.status, 'NOT_ACCEPTED');
  assert(result.errors.includes('actual-reconnect-not-proven'));
});

test('Goals rejects missing cleanup correlation and a database read that does not follow increment', () => {
  const noCleanup = goalsReceipt(); noCleanup.profileRemoved = false; noCleanup.portClosed = false;
  assert(validateGoals(noCleanup, goalsSource, () => goalScreenshot, require('path').resolve('.')).errors.includes('owned-graceful-cleanup-correlation-missing'));
  const noRead = goalsReceipt(); noRead.steps[4].result.goal.current_value = 25;
  const result = validateGoals(noRead, goalsSource, () => goalScreenshot, ROOT);
  assert.equal(result.status, 'NOT_ACCEPTED');
  assert(result.errors.includes('increment-db-read-value-not-correlated'));
});

test('Goals rejects a locale command without matching localized DOM text and client locale', () => {
  const receipt = goalsReceipt();
  receipt.localeChanges[2].remainingText = '70 remaining';
  receipt.localeChanges[1].clientLocale = 'de';
  const result = validateGoals(receipt, goalsSource, () => goalScreenshot, require('path').resolve('.'));
  assert.equal(result.status, 'NOT_ACCEPTED');
  assert(result.errors.includes('localized-remaining-label-mismatch:es'));
  assert(result.errors.includes('four-server-locales-not-correlated'));
});
