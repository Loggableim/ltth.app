'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
// Each additional family needs an explicit reviewed receipt contract here.
const RECEIPTS = Object.freeze({ 'advanced-timer': 'docs/coordination/evidence/actual-timer-backend-probe.json', toptier: 'docs/coordination/evidence/actual-toptier-a1c5a303-2fdc-4535-9ee5-623478ddfe94.json', spotlight: 'docs/coordination/evidence/actual-spotlight-a8f5e1e3-6dcc-40cb-9747-9b9655527715.json', goals: 'docs/coordination/evidence/actual-goals-477f6f8b-73d6-470b-b513-286b019591d6.json' });
const REQUIRED_SOURCES = ['app/server.js', 'app/plugins/advanced-timer/main.js', 'app/plugins/advanced-timer/backend/api.js', 'app/plugins/advanced-timer/backend/websocket.js', 'app/plugins/advanced-timer/engine/timer-engine.js', 'app/plugins/advanced-timer/backend/database.js', 'app/plugins/advanced-timer/backend/rotator.js', 'app/plugins/advanced-timer/backend/event-bridge.js', 'app/plugins/advanced-timer/plugin.json', 'app/modules/plugin-loader.js', 'app/modules/i18n.js', 'app/routes/locale.js', 'app/modules/plugin-identities.js', 'scripts/obs-pilot/actual-timer-backend-probe.js', 'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js', 'app/modules/docs-capture-policy.js', 'app/node_modules/socket.io/client-dist/socket.io.js', 'app/package-lock.json'];
// The maintained server always initializes its core DatabaseManager too.
// Plugin-local backend/database.js is a different dependency and cannot cover it.
REQUIRED_SOURCES.push('app/modules/database.js');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const TOPTIER_SOURCES = ['app/server.js', 'app/modules/plugin-loader.js', 'app/modules/plugin-identities.js', 'app/modules/database.js', 'app/modules/i18n.js', 'app/routes/locale.js', 'app/modules/docs-capture-policy.js', 'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js', 'scripts/obs-pilot/actual-toptier-backend-probe.js', 'app/package-lock.json', 'app/node_modules/socket.io/client-dist/socket.io.js', 'app/public/js/i18n-client.js', ...['main.js', 'plugin.json', 'overlay.html', 'assets/overlay.js', 'assets/overlay.css', 'assets/animations.css', 'backend/db.js', 'backend/session-manager.js', 'backend/score-engine.js', 'backend/decay-scheduler.js', ...['de', 'en', 'es', 'fr'].map(locale => `locales/${locale}.json`)].map(file => `app/plugins/toptier/${file}`)];
const GOALS_SOURCES = [
  'app/server.js', 'app/modules/plugin-loader.js', 'app/modules/plugin-identities.js',
  'app/modules/database.js', 'app/modules/i18n.js', 'app/modules/docs-capture-policy.js',
  'app/modules/public-overlay-payload-projection.js', 'app/modules/public-overlay-access.js',
  'app/modules/public-overlay-socket-adapter.js', 'app/routes/locale.js',
  'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js',
  'scripts/obs-pilot/actual-goals-backend-probe.js', 'app/package-lock.json',
  'app/node_modules/socket.io/client-dist/socket.io.js', 'app/public/js/i18n-client.js',
  ...['main.js', 'plugin.json', 'backend/api.js', 'backend/database.js', 'backend/websocket.js',
    'backend/event-handlers.js', 'engine/state-machine.js', 'engine/templates/compact-bar.js',
    'overlay/index.html', 'overlay/overlay.js', ...['de', 'en', 'es', 'fr'].map(locale => `locales/${locale}.json`)]
    .map(file => `app/plugins/goals/${file}`)
];

function validateTopTier(receipt, readSource, readArtifact = file => fs.readFileSync(file), root = ROOT) {
  const errors = [];
  if (receipt?.scope !== 'actual maintained backend; isolated TopTier only; not OBS' || receipt.result !== 'PASS_LIMITED') errors.push('unsupported-or-failed-run');
  if (!Number.isInteger(receipt?.pid) || receipt.pid <= 0 || !Number.isInteger(receipt?.port) || receipt.port < 1 || receipt.port > 65535) errors.push('owned-process-missing');
  if (receipt?.cleanup?.exitCode !== 0 || receipt.cleanup.signal !== null || !receipt.cleanup.portClosed || !receipt.cleanup.graceful || receipt.forced || !receipt.browserClosed || receipt.shutdown?.status !== 200 || receipt.shutdown.body?.success !== true) errors.push('owned-graceful-cleanup-missing');
  if (!receipt?.sourceStable || receipt?.runtime?.node !== '22.14.0' || !receipt.runtime.socketIo || !receipt.stagedManifestHash) errors.push('runtime-or-stability-missing');
  for (const file of TOPTIER_SOURCES) {
    try {
      const pin = receipt.sourceHashes?.[file];
      if (!pin || sha256(readSource(file)) !== pin || receipt.postSourceHashes?.[file] !== pin) errors.push(`stale-or-missing-source:${file}`);
      if (file.startsWith('app/plugins/toptier/') && !file.endsWith('plugin.json') && receipt.fixtureHashes?.[file] !== pin) errors.push(`copied-source-mismatch:${file}`);
    } catch (_) { errors.push(`source-unavailable:${file}`); }
  }
  if (Object.keys(receipt?.sourceHashes || {}).some(file => !TOPTIER_SOURCES.includes(file))) errors.push('unsupported-source-path');
  const testEvent = receipt?.steps?.find(step => step.route === '/test-event' && step.method === 'POST' && step.status === 200 && step.result?.success === true);
  const entry = receipt?.actualUpdate?.entries?.find(item => item.username === 'Owned_TopTier_Probe' && item.score === 25);
  if (!testEvent || receipt.actualUpdate?.board !== 'likes' || !entry) errors.push('actual-test-event-update-not-correlated');
  for (const [method, route] of [['GET', '/config'], ['POST', '/config'], ['GET', '/board/likes'], ['GET', '/session/current']]) {
    if (!receipt?.steps?.some(step => step.method === method && step.route === route && step.status === 200 && step.result?.success === true)) errors.push(`api-stage-missing:${method}${route}`);
  }
  if (receipt?.servedHtmlHash !== receipt?.sourceHashes?.['app/plugins/toptier/overlay.html'] || receipt?.browserErrors?.length !== 0 || JSON.stringify(receipt.locales?.map(item => item.locale)) !== JSON.stringify(['de', 'en', 'es', 'fr']) || receipt.locales.some(item => item.name !== 'Owned_TopTier_Probe' || item.score !== '25')) errors.push('original-renderer-evidence-missing');
  const localeCopy = {
    de: { title: 'TopTier-Overlay', labels: ['❤️ Gefällt mir', '🎁 Geschenke'], empty: 'Keine Einträge' },
    en: { title: 'TopTier Overlay', labels: ['❤️ Likes', '🎁 Gifts'], empty: 'No entries' },
    es: { title: 'Superposición de nivel superior', labels: ['❤️ Me gusta', '🎁 Regalos'], empty: 'No hay entradas' },
    fr: { title: 'Superposition de niveau supérieur', labels: ['❤️ J’aime', '🎁 Cadeaux'], empty: 'Aucune entrée' }
  };
  for (const item of receipt?.locales || []) {
    const expected = localeCopy[item.locale];
    if (!expected || item.title !== expected.title || JSON.stringify(item.boardLabels) !== JSON.stringify(expected.labels) || item.emptyLabel !== expected.empty || !receipt.actualUpdate?.sessionId || item.sessionId !== receipt.actualUpdate.sessionId) errors.push(`locale-chrome-or-session-mismatch:${item.locale}`);
    if (!receipt.steps?.some(step => step.route === '/api/i18n/current' && step.method === 'POST' && step.status === 200 && step.result?.locale === item.locale)) errors.push(`actual-locale-command-missing:${item.locale}`);
  }
  const artifactPath = path.resolve(receipt?.screenshot?.path || '');
  const relative = path.relative(path.join(root, 'output/playwright/actual-toptier'), artifactPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) errors.push('screenshot-outside-owned-output');
  else {
    try { const bytes = readArtifact(artifactPath); if (bytes.length !== receipt.screenshot.bytes || sha256(bytes) !== receipt.screenshot.sha256) errors.push('screenshot-pin-mismatch'); }
    catch (_) { errors.push('screenshot-unavailable'); }
  }
  return { status: errors.length ? 'NOT_ACCEPTED' : 'PARTIAL', backendValidated: errors.length === 0, browserStatus: errors.length ? 'NOT_ACCEPTED' : 'PARTIAL', actualFinding: 'Local actual test-event -> backend socket -> original renderer row; no active LIVE REST board', localeChrome: errors.some(error => error.startsWith('locale-') || error.startsWith('actual-locale-')) ? 'NOT_ACCEPTED' : 'Four locale titles, both board labels and empty Gifts text verified in DOM at capture; PNG alone does not prove visible row/empty text', gracefulShutdown: receipt?.cleanup?.graceful === true, errors, obs: 'NOT_OBSERVED' };
}

function validateReceipt(receipt, readSource, readArtifact = file => fs.readFileSync(file), root = ROOT) {
  const errors = [];
  if (!receipt || receipt.result !== 'PASS') errors.push('run-not-passed');
  if (receipt?.scope !== 'actual maintained backend; isolated Timer only; not OBS') errors.push('unsupported-scope');
  if (!Number.isInteger(receipt?.pid) || receipt.pid <= 0 || !Number.isInteger(receipt?.port) || receipt.port < 1 || receipt.port > 65535) errors.push('missing-owned-process');
  const cleanup = receipt?.cleanup;
  if (!cleanup?.terminalConfirmed || !cleanup.portClosed || !cleanup.socketDisconnected || cleanup.forced) errors.push('cleanup-not-confirmed');
  if (cleanup?.childExitCode !== 0 || cleanup.childSignalCode !== null || cleanup.gracefulAppShutdownProven !== true) errors.push('graceful-exit-not-confirmed');
  if (receipt?.shutdownResponse?.status !== 200 || receipt.shutdownResponse.body?.success !== true || receipt.shutdownResponse.targetPid !== receipt.pid || receipt.shutdownResponse.targetPort !== receipt.port) errors.push('shutdown-target-not-confirmed');
  const hashes = receipt?.sourceHashes || {};
  const required = REQUIRED_SOURCES;
  if (required.some(file => !hashes[file])) errors.push('required-source-pins-missing');
  for (const [file, hash] of Object.entries(hashes)) {
    const browserSources = ['app/public/js/i18n-client.js', 'app/plugins/advanced-timer/overlay.html', 'app/plugins/advanced-timer/overlay/overlay.js', ...['de', 'en', 'es', 'fr'].map(locale => `app/plugins/advanced-timer/locales/${locale}.json`)];
    if (!REQUIRED_SOURCES.includes(file) && !browserSources.includes(file)) {
      errors.push('unsupported-source-path'); continue;
    }
    try {
      if (sha256(readSource(file)) !== hash || receipt.postSourceHashes?.[file] !== hash) errors.push(`stale-source:${file}`);
      if (file.startsWith('app/plugins/') && file !== 'app/plugins/advanced-timer/plugin.json' && receipt.fixtureHashes?.[file] !== hash) errors.push(`copied-source-mismatch:${file}`);
    } catch (_) { errors.push(`source-unavailable:${file}`); }
  }
  if (receipt?.sourceStable !== true) errors.push('source-stability-not-confirmed');
  if (receipt?.runtime?.node !== '22.14.0' || !receipt?.runtime?.socketIoVersion || receipt?.stagedManifest?.sourceMatchesExceptEnabled !== true) errors.push('runtime-or-staged-manifest-not-pinned');
  if (!Array.isArray(receipt?.steps) || !receipt.steps.some(step => step.method === 'POST' && step.route === '/api/advanced-timer/timers' && step.status === 200)) errors.push('actual-api-evidence-missing');
  const created = receipt?.steps?.find(step => step.method === 'POST' && step.route === '/api/advanced-timer/timers')?.result?.timer?.id;
  if (!created || receipt?.tick?.id !== created || !(receipt.tick.currentValue > 0 && receipt.tick.currentValue < 90) || receipt.tick.state !== 'running') errors.push('actual-tick-not-correlated');
  for (const [method, suffix] of [['GET', ''], ['PUT', ''], ['POST', '/start'], ['POST', '/pause'], ['POST', '/reset'], ['DELETE', '']]) {
    if (!receipt?.steps?.some(step => step.method === method && step.route === `/api/advanced-timer/timers/${created}${suffix}` && step.status === 200 && step.result?.success === true)) errors.push(`api-stage-missing:${method}${suffix}`);
  }
  const browser = receipt?.renderer;
  let browserStatus = 'NOT_OBSERVED';
  if (browser) {
    const screenshotPath = path.resolve(browser.screenshot || '');
    const allowedRoot = path.join(root, 'output/playwright/actual-timer');
    const relative = path.relative(allowedRoot, screenshotPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) errors.push('screenshot-path-outside-owned-output');
    else {
      try {
        const bytes = readArtifact(screenshotPath);
        if (bytes.length !== browser.screenshotPin?.bytes || sha256(bytes) !== browser.screenshotPin?.sha256) errors.push('screenshot-pin-mismatch');
      } catch (_) { errors.push('screenshot-unavailable'); }
    }
    if (!receipt.browserClosed || receipt.servedHtmlHash !== hashes['app/plugins/advanced-timer/overlay.html'] || !Array.isArray(receipt.browserErrors) || receipt.browserErrors.length) errors.push('browser-boundary-not-confirmed');
    const locales = browser.locales?.map(item => item.locale);
    if (JSON.stringify(locales) !== JSON.stringify(['de', 'en', 'es', 'fr']) || !browser.reconnect || browser.negativeCases?.length !== 2 || !browser.screenshotPin?.sha256 || !browser.screenshotPin.bytes) errors.push('browser-evidence-incomplete');
    browserStatus = errors.length ? 'NOT_ACCEPTED' : 'PASS';
  }
  return { status: errors.length ? 'NOT_ACCEPTED' : 'PASS', browserStatus, gracefulShutdown: cleanup?.gracefulAppShutdownProven === true, errors, obs: 'NOT_OBSERVED' };
}

const SPOTLIGHT_SOURCES = [...TOPTIER_SOURCES.filter(file => !file.startsWith('app/plugins/toptier/') && file !== 'scripts/obs-pilot/actual-toptier-backend-probe.js'), 'scripts/obs-pilot/actual-spotlight-backend-probe.js', 'app/public/fonts/exo-2.css', ...['main.js', 'plugin.json', 'overlays/chatter.html', 'overlays/single-overlay.js', 'lib/animations.js', 'lib/text-effects.js', 'lib/template-renderer.js', ...['de', 'en', 'es', 'fr'].map(locale => `locales/${locale}.json`)].map(file => `app/plugins/spotlight/${file}`)];

function validateSpotlight(receipt, readSource, readArtifact = file => fs.readFileSync(file), root = ROOT) {
  const errors = [];
  if (receipt?.scope !== 'actual maintained backend; isolated Spotlight only; not OBS' || receipt.result !== 'PASS') errors.push('unsupported-or-failed-run');
  if (!Number.isInteger(receipt?.pid) || receipt.pid <= 0 || !Number.isInteger(receipt?.port) || receipt.port < 1 || receipt.port > 65535) errors.push('owned-process-missing');
  if (receipt?.cleanup?.exitCode !== 0 || receipt.cleanup.signal !== null || receipt.cleanup.portClosed !== true || receipt.cleanup.graceful !== true || receipt.forced || receipt.browserClosed !== true || receipt.shutdown?.status !== 200 || receipt.shutdown.body?.success !== true) errors.push('owned-graceful-cleanup-missing');
  if (receipt?.sourceStable !== true || receipt.runtime?.node !== '22.14.0' || !receipt.runtime.socketIo || !/^[a-f0-9]{64}$/.test(receipt.stagedManifestHash || '')) errors.push('runtime-or-stability-missing');
  for (const file of SPOTLIGHT_SOURCES) {
    try {
      const pin = receipt?.sourceHashes?.[file];
      if (!pin || sha256(readSource(file)) !== pin || receipt.postSourceHashes?.[file] !== pin) errors.push(`stale-or-missing-source:${file}`);
      if (file.startsWith('app/plugins/spotlight/') && !file.endsWith('/plugin.json') && receipt.fixtureHashes?.[file] !== pin) errors.push(`copied-source-mismatch:${file}`);
    } catch (_) { errors.push(`source-unavailable:${file}`); }
  }
  if (Object.keys(receipt?.sourceHashes || {}).some(file => !SPOTLIGHT_SOURCES.includes(file))) errors.push('unsupported-source-path');
  const events = receipt?.steps?.filter(step => step.route === '/api/lastevent/test/chatter' && step.method === 'POST' && step.status === 200 && step.result?.success === true).map(step => step.result.user) || [];
  const first = events[0]; const missed = events[1];
  if (!first?.nickname || first.eventType !== 'chatter' || receipt.actualTestUser?.nickname !== first.nickname || receipt.actualTestUser?.uniqueId !== first.uniqueId) errors.push('actual-event-not-correlated');
  if (!missed?.nickname || missed.eventType !== 'chatter' || first?.nickname === missed.nickname || receipt.reconnect?.previousNickname !== first?.nickname || receipt.reconnect?.restoredNickname !== missed.nickname || receipt.reconnect?.actualMissedTestRoute !== true) errors.push('missed-event-reconnect-not-correlated');
  for (const [method, route] of [['GET', '/api/lastevent/settings/chatter'], ['POST', '/api/lastevent/settings/chatter'], ['GET', '/api/lastevent/last/chatter']]) {
    if (!receipt?.steps?.some(step => step.method === method && step.route === route && step.status === 200 && step.result?.success === true)) errors.push(`api-stage-missing:${method}${route}`);
  }
  if (receipt?.servedHtmlHash !== receipt?.sourceHashes?.['app/plugins/spotlight/overlays/chatter.html'] || !Array.isArray(receipt?.browserErrors) || receipt.browserErrors.length || JSON.stringify(receipt.locales?.map(item => item.locale)) !== JSON.stringify(['de', 'en', 'es', 'fr'])) errors.push('original-renderer-evidence-missing');
  const copy = { de: ['Spotlight – Chatteilnehmer', 'Neuer Chat'], en: ['Spotlight – Chatter', 'New chat'], es: ['Foco – chat', 'Nuevo chat'], fr: ['Spotlight – chat', 'Nouveau message de chat'] };
  for (const item of receipt?.locales || []) {
    const expected = copy[item.locale];
    if (!expected || item.title !== expected[0] || item.expectedLabel !== expected[1] || !item.text?.includes(expected[1]) || !first?.nickname || !item.text?.includes(first.nickname)) errors.push(`locale-display-mismatch:${item.locale}`);
    if (!receipt.steps?.some(step => step.route === '/api/i18n/current' && step.method === 'POST' && step.status === 200 && step.result?.success === true && step.result.locale === item.locale)) errors.push(`actual-locale-command-missing:${item.locale}`);
  }
  const artifactPath = path.resolve(receipt?.screenshot?.path || '');
  const relative = path.relative(path.join(root, 'output/playwright/actual-spotlight'), artifactPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) errors.push('screenshot-outside-owned-output');
  else {
    try { const bytes = readArtifact(artifactPath); if (bytes.length !== receipt.screenshot.bytes || sha256(bytes) !== receipt.screenshot.sha256) errors.push('screenshot-pin-mismatch'); }
    catch (_) { errors.push('screenshot-unavailable'); }
  }
  return { status: errors.length ? 'NOT_ACCEPTED' : 'PASS', browserStatus: errors.length ? 'NOT_ACCEPTED' : 'PASS', actualFinding: 'Actual local chatter test route, original renderer, four server locale changes and missed-event reconnect; no TikTok, tunnel or OBS', gracefulShutdown: receipt?.cleanup?.graceful === true, errors, obs: 'NOT_OBSERVED' };
}

function validateGoals(receipt, readSource, readArtifact = file => fs.readFileSync(file), root = ROOT) {
  const errors = [];
  if (receipt?.scope !== 'isolated local Goals backend and original overlay renderer; not public or OBS acceptance' || receipt.result !== 'PASS_LOCAL_ONLY') errors.push('unsupported-or-failed-local-run');
  if (!Number.isInteger(receipt?.pid) || receipt.pid <= 0 || !Number.isInteger(receipt?.port) || receipt.port < 1 || receipt.port > 65535 || !/^ltth-actual-goals-[A-Za-z0-9_-]+$/.test(receipt?.profile || '')) errors.push('owned-process-or-profile-missing');
  if (receipt?.runtime?.node !== '22.14.0' || !receipt.runtime.socketIo || receipt?.sourceStable !== true) errors.push('runtime-or-source-stability-missing');

  const sourceHashes = receipt?.sourceHashes || {};
  if (JSON.stringify(Object.keys(sourceHashes).sort()) !== JSON.stringify([...GOALS_SOURCES].sort())) errors.push('required-source-set-mismatch');
  for (const file of GOALS_SOURCES) {
    try {
      const pin = sourceHashes[file];
      if (!/^[a-f0-9]{64}$/.test(pin || '') || sha256(readSource(file)) !== pin || receipt?.postSourceHashes?.[file] !== pin) errors.push(`stale-or-missing-source:${file}`);
      if (file.startsWith('app/plugins/goals/') && !file.endsWith('/plugin.json') && receipt?.fixtureHashes?.[file] !== pin) errors.push(`copied-source-mismatch:${file}`);
      if (file.endsWith('/plugin.json') && !/^[a-f0-9]{64}$/.test(receipt?.fixtureHashes?.[file] || '')) errors.push('staged-plugin-manifest-missing');
    } catch (_) { errors.push(`source-unavailable:${file}`); }
  }
  const goalFixtureSources = GOALS_SOURCES.filter(file => file.startsWith('app/plugins/goals/'));
  if (JSON.stringify(Object.keys(receipt?.postSourceHashes || {}).sort()) !== JSON.stringify([...GOALS_SOURCES].sort()) || JSON.stringify(Object.keys(receipt?.fixtureHashes || {}).sort()) !== JSON.stringify(goalFixtureSources.sort())) errors.push('source-or-fixture-pin-set-incomplete');

  const steps = Array.isArray(receipt?.steps) ? receipt.steps : [];
  const createIndex = steps.findIndex(step => step.method === 'POST' && step.route === '/api/goals' && step.status === 200);
  const initialReadIndex = steps.findIndex(step => step.method === 'GET' && /^\/api\/goals\/[^/]+$/.test(step.route) && step.status === 200);
  const incrementIndex = steps.findIndex(step => step.method === 'POST' && /^\/api\/goals\/[^/]+\/increment$/.test(step.route) && step.status === 200);
  const persistedReadIndex = incrementIndex < 0 ? -1 : steps.findIndex((step, index) => index > incrementIndex && step.method === 'GET' && step.status === 200 && step.route === steps[incrementIndex].route.replace(/\/increment$/, ''));
  const goalFixture = receipt?.goalFixture;
  const goalId = incrementIndex < 0 ? null : steps[incrementIndex].route.match(/^\/api\/goals\/([^/]+)\/increment$/)?.[1];
  if (!(createIndex >= 0 && initialReadIndex > createIndex && incrementIndex > initialReadIndex && persistedReadIndex > incrementIndex && goalId && steps[initialReadIndex].route === `/api/goals/${goalId}`)) errors.push('goal-create-read-increment-persistence-sequence-missing');
  if (steps[createIndex]?.result?.goal?.id !== goalId || steps[createIndex]?.result?.goal?.name !== goalFixture?.name || steps[initialReadIndex]?.result?.goal?.id !== goalId || steps[initialReadIndex]?.result?.goal?.current_value !== 25) errors.push('goal-create-and-initial-read-not-correlated');
  if (steps[incrementIndex]?.result?.goal?.id !== goalId || steps[incrementIndex]?.result?.goal?.current_value !== 30 || steps[persistedReadIndex]?.result?.goal?.id !== goalId || steps[persistedReadIndex]?.result?.goal?.current_value !== 30) errors.push('increment-db-read-value-not-correlated');
  if (goalFixture?.created !== true || goalFixture.name !== 'Owned Local Fixture Goal' || goalFixture.type !== 'coin' || goalFixture.initialValue !== 25 || goalFixture.target !== 100 || goalFixture.readBack?.currentValue !== 25 || goalFixture.readBack?.name !== goalFixture.name) errors.push('goal-initial-persistence-not-correlated');
  if (!steps.some(step => step.method === 'GET' && step.route === '/api/health' && step.status === 200)) errors.push('isolated-backend-readiness-missing');

  const overlayHash = sourceHashes['app/plugins/goals/overlay/index.html'];
  if (receipt?.servedOverlay?.urlPath !== '/goals/overlay' || receipt.servedOverlay.status !== 200 || receipt.servedOverlay.sha256 !== overlayHash) errors.push('original-overlay-entry-not-source-bound');
  if (receipt?.rendererInitial?.name !== goalFixture?.name || receipt.rendererInitial?.value !== '25 / 100' || receipt.rendererAfterUpdate?.name !== goalFixture?.name || receipt.rendererAfterUpdate?.value !== '30 / 100' || receipt?.onlineUpdateCorrelation?.packet?.goalId !== goalId || receipt.onlineUpdateCorrelation.packet.currentValue !== 30 || receipt.onlineUpdateCorrelation.packet.targetValue !== 100) errors.push('increment-socket-dom-correlation-missing');
  const probeSource = readSource('scripts/obs-pilot/actual-goals-backend-probe.js').toString('utf8');
  const overlaySource = readSource('app/plugins/goals/overlay/overlay.js').toString('utf8');
  if (!probeSource.includes('assert.equal(fetched.goal.current_value, 30)') || !probeSource.includes("includes('30 / 100')") || !overlaySource.includes("on('goals:value-changed'") || !overlaySource.includes("this.socket.emit('goals:subscribe'")) errors.push('increment-database-socket-dom-contract-not-bound');

  const locales = receipt?.localeChanges;
  const expectedLocales = ['de', 'en', 'es', 'fr'];
  if (JSON.stringify(locales?.map(item => item.serverLocale)) !== JSON.stringify(expectedLocales) || locales.some(item => item.clientLocale !== item.serverLocale || item.htmlLang !== item.serverLocale || item.name !== goalFixture?.name || item.value !== '30 / 100')) errors.push('four-server-locales-not-correlated');
  for (const item of locales || []) {
    try {
      const catalogue = JSON.parse(readSource(`app/plugins/goals/locales/${item.serverLocale}.json`).toString('utf8'));
      const expectedRemaining = catalogue.plugins.goals.goals.overlay.remaining.replace('{value}', '70');
      if (item.remainingText !== expectedRemaining) errors.push(`localized-remaining-label-mismatch:${item.serverLocale}`);
    } catch (_) { errors.push(`locale-catalog-unavailable:${item.serverLocale}`); }
  }
  const localeSteps = steps.filter(step => step.route === '/api/i18n/current' && step.method === 'POST' && step.status === 200);
  if (localeSteps.length !== 4 || JSON.stringify(localeSteps.map(step => step.result?.locale)) !== JSON.stringify(expectedLocales) || !probeSource.includes("for (const locale of ['de', 'en', 'es', 'fr'])") || !probeSource.includes("api('/api/i18n/current', 'POST', { locale })")) errors.push('four-server-locale-commands-unproven');

  const reconnect = receipt?.reconnect;
  const serverLog = receipt?.serverLogSignals?.tail || '';
  const connectedCount = [...serverLog.matchAll(/Client connected:/g)].length;
  const disconnectedCount = [...serverLog.matchAll(/Client disconnected:/g)].length;
  if (reconnect?.connected !== true || reconnect.connectCount !== 1 || reconnect.disconnectCount !== 1 || reconnect.name !== goalFixture?.name || reconnect.value !== '35 / 100' || reconnect.clientLocale !== 'fr' || reconnect.subscriptionPacket?.goalId !== goalId || reconnect.subscriptionPacket?.currentValue !== 35 || receipt?.offlineUpdate?.persistedValue !== 35 || receipt.offlineUpdate.socketEventCountWhileDisconnected !== 1 || receipt.offlineUpdate.unavailableNoticeVisible !== true || connectedCount < 2 || disconnectedCount < 2 || !probeSource.includes('window.socket.disconnect();') || !probeSource.includes('window.socket.connect()')) errors.push('actual-reconnect-not-proven');
  if (!Array.isArray(receipt?.browserErrors) || receipt.browserErrors.length !== 0 || receipt?.browserClosed !== true) errors.push('browser-cleanup-or-errors-unconfirmed');

  const shutdown = receipt?.shutdownRequest;
  if (shutdown?.status !== 200 || shutdown.graceful !== true || receipt?.exitCode !== 0 || receipt.signal !== null || receipt?.portClosed !== true || receipt?.serverLogSignals?.gracefulClose !== true || receipt?.serverLogSignals?.forcedShutdown !== false || receipt?.forcedStop || receipt?.profileRemoved !== true || receipt?.tempDatabase?.quickCheck !== 'ok' || receipt.tempDatabase.fixtureCurrentValue !== 35 || receipt.tempDatabase.fixtureTargetValue !== 100) errors.push('owned-graceful-cleanup-correlation-missing');

  const screenshot = receipt?.screenshot;
  const screenshotPath = path.resolve(root, screenshot?.path || '');
  const screenshotRoot = path.join(root, 'output/playwright/actual-goals');
  const relative = path.relative(screenshotRoot, screenshotPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) errors.push('screenshot-outside-owned-output');
  else {
    try {
      const bytes = readArtifact(screenshotPath);
      if (bytes.length !== screenshot.bytes || sha256(bytes) !== screenshot.sha256) errors.push('screenshot-pin-mismatch');
    } catch (_) { errors.push('screenshot-unavailable'); }
  }

  const accepted = errors.length === 0;
  return {
    status: accepted ? 'LOCAL_ONLY' : 'NOT_ACCEPTED',
    localIntegration: accepted ? 'PASS' : 'NOT_ACCEPTED',
    backendValidated: accepted,
    browserStatus: accepted ? 'LOCAL_ONLY' : 'NOT_ACCEPTED',
    publicStatus: 'BLOCKED',
    actualFinding: 'Local Goals create/read/increment persistence, actual Socket.IO renderer update, four server locale changes and reconnect; no public display access',
    gracefulShutdown: shutdown?.graceful === true && receipt?.exitCode === 0 && receipt?.portClosed === true,
    errors,
    obs: 'NOT_OBSERVED'
  };
}

function buildSummary(root = ROOT) {
  const families = Object.entries(RECEIPTS).map(([family, receiptPath]) => {
    try {
      const receipt = JSON.parse(fs.readFileSync(path.join(root, receiptPath), 'utf8'));
      const validate = family === 'toptier' ? validateTopTier : family === 'spotlight' ? validateSpotlight : family === 'goals' ? validateGoals : validateReceipt;
      return { family, receiptPath, ...validate(receipt, file => fs.readFileSync(path.join(root, file)), undefined, root) };
    } catch (_) { return { family, receiptPath, status: 'NOT_ACCEPTED', browserStatus: 'NOT_OBSERVED', errors: ['receipt-missing-or-unreadable'], obs: 'NOT_OBSERVED' }; }
  });
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), scope: 'Actual backend/browser integration only; independent of CPU fixture readiness and OBS acceptance', counts: { supportedFamilies: families.length, backendPassed: families.filter(item => item.status === 'PASS').length, backendLimitedValidated: families.filter(item => item.backendValidated && item.status === 'PARTIAL').length, localOnlyValidated: families.filter(item => item.status === 'LOCAL_ONLY').length, publicBlocked: families.filter(item => item.publicStatus === 'BLOCKED').length, browserPassed: families.filter(item => item.browserStatus === 'PASS').length, browserPartial: families.filter(item => item.browserStatus === 'PARTIAL').length, obsPassed: 0 }, families };
}

if (require.main === module) {
  const summary = buildSummary();
  const output = path.join(ROOT, 'docs/coordination/evidence/actual-backend-integration-summary.json');
  fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ output, counts: summary.counts }));
}
module.exports = { validateReceipt, validateTopTier, validateSpotlight, validateGoals, buildSummary, REQUIRED_SOURCES, TOPTIER_SOURCES, SPOTLIGHT_SOURCES, GOALS_SOURCES };
