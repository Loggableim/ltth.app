'use strict';

// Isolated maintained-server probe for ClarityHUD's actual full-overlay route.
// Run with runtime/node/node.exe. It creates one temporary profile, enables only
// clarityhud through docs-capture, changes locale in the same original page,
// injects synthetic events through the plugin's local test route, and shuts
// down only its own app process through the loopback lifecycle API.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createDocsCaptureChildEnvironment } = require('../lib/docs-capture-child-env');
const { prepareDocsPluginFixture } = require('../lib/docs-capture-plugin-fixture');
const docsCapturePolicy = require('../../app/modules/docs-capture-policy');

const ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = path.join(ROOT, 'app');
const ALLOWED_PLUGIN_IDS = ['clarityhud'];
const PROFILE_PREFIX = 'ltth-clarityhud-locale-event-probe-';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const SOURCE_PATHS = [
  'app/server.js',
  'app/modules/docs-capture-policy.js',
  'app/modules/plugin-loader.js',
  'app/modules/config-path-manager.js',
  'app/modules/user-profiles.js',
  'app/modules/database.js',
  'app/modules/i18n.js',
  'app/modules/network-manager.js',
  'app/modules/public-overlay-access.js',
  'app/modules/public-overlay-registry.js',
  'app/routes/locale.js',
  'app/locales/de.json',
  'app/locales/en.json',
  'app/locales/es.json',
  'app/locales/fr.json',
  'app/public/js/i18n-client.js',
  'app/node_modules/socket.io/client-dist/socket.io.js',
  'app/plugins/clarityhud/plugin.json',
  'app/plugins/clarityhud/main.js',
  'app/plugins/clarityhud/backend/api.js',
  'app/plugins/clarityhud/lib/settings-schema.js',
  'app/plugins/clarityhud/lib/i18n-runtime.js',
  'app/plugins/clarityhud/lib/virtual-scroller.js',
  'app/plugins/clarityhud/overlays/full.html',
  'app/plugins/clarityhud/overlays/full.js',
  'app/plugins/clarityhud/test/full-overlay-renderer-lifecycle.test.js',
  'app/plugins/clarityhud/locales/de.json',
  'app/plugins/clarityhud/locales/en.json',
  'app/plugins/clarityhud/locales/es.json',
  'app/plugins/clarityhud/locales/fr.json',
  'scripts/lib/docs-capture-child-env.js',
  'scripts/lib/docs-capture-plugin-fixture.js',
  'scripts/obs-pilot/actual-clarityhud-backend-probe.js',
  'scripts/obs-pilot/actual-clarityhud-locale-event-probe.js'
];

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function inventoryDirectory(directory) {
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in source closure: ${absolute}`);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolute);
        files.push({ path: path.relative(directory, absolute).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
      } else {
        throw new Error(`Unexpected non-file source entry: ${absolute}`);
      }
    }
  };
  visit(directory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const canonical = files.map(file => `${file.path}\0${file.bytes}\0${file.sha256}`).join('\n');
  return {
    files,
    count: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    sha256: sha256(Buffer.from(canonical))
  };
}

function sourceRecord(relativePath) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

async function reserveLoopbackPort() {
  const reservation = net.createServer();
  await new Promise((resolve, reject) => {
    reservation.once('error', reject);
    reservation.listen(0, '127.0.0.1', resolve);
  });
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  return port;
}

async function isPortClosed(port) {
  return new Promise(resolve => {
    const probe = net.connect({ host: '127.0.0.1', port });
    probe.once('connect', () => { probe.destroy(); resolve(false); });
    probe.once('error', error => { probe.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    probe.setTimeout(1500, () => { probe.destroy(); resolve(false); });
  });
}

function assertNoCheckoutDatabase() {
  for (const relativePath of [
    'app/database.db', 'app/database.db-wal', 'app/database.db-shm',
    'app/database.db.backup', 'app/database.db.backup-wal', 'app/database.db.backup-shm'
  ]) {
    if (fs.existsSync(path.join(ROOT, relativePath))) {
      throw new Error(`Refusing to start: a checkout legacy database could be migrated: ${relativePath}`);
    }
  }
}

function auditSyntheticFullTestEventPath() {
  const apiSource = fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'backend', 'api.js'), 'utf8');
  const pluginLoaderSource = fs.readFileSync(path.join(APP_ROOT, 'modules', 'plugin-loader.js'), 'utf8');
  const routeStart = apiSource.indexOf("    // Test event endpoint for full HUD");
  const routeEnd = apiSource.indexOf("    // Test event endpoint for stream overlay", routeStart);
  if (routeStart < 0 || routeEnd <= routeStart) throw new Error('Could not locate ClarityHUD full synthetic test route');
  const routeSource = apiSource.slice(routeStart, routeEnd);
  const handlerBlock = (start, end) => {
    const startIndex = apiSource.indexOf(start);
    const endIndex = apiSource.indexOf(end, startIndex);
    if (startIndex < 0 || endIndex <= startIndex) throw new Error(`Could not locate ClarityHUD handler block: ${start}`);
    return apiSource.slice(startIndex, endIndex);
  };
  const chatHandler = handlerBlock('  async handleChatEvent(data) {', '  async handleFollowEvent(data) {');
  const followHandler = handlerBlock('  async handleFollowEvent(data) {', '  async handleShareEvent(data) {');
  const giftHandler = handlerBlock('  async handleGiftEvent(data) {', '  async handleSubscribeEvent(data) {');
  const relevantSource = `${routeSource}\n${chatHandler}\n${followHandler}\n${giftHandler}`;
  const audit = {
    route: 'POST /api/clarityhud/test/full',
    routeFile: 'app/plugins/clarityhud/backend/api.js',
    routeSha256: sourceRecord('app/plugins/clarityhud/backend/api.js').sha256,
    fixedSyntheticPayloads: ['TestUser', 'NewFollower', 'GenerousGifter', 'TreasureHunter'],
    requestBodyOrParametersUsed: /req\.(?:body|params|query)/.test(routeSource),
    invokesActualHandlers: ['handleChatEvent', 'handleFollowEvent', 'handleGiftEvent'].every(method => routeSource.includes(`this.${method}(`)),
    handlerQueuesAndBroadcasts: [chatHandler, followHandler, giftHandler].every(handler => handler.includes('this.addToQueue(') && handler.includes('this.api.emit(')),
    noProviderOrConnectorCalls: !/this\.tiktok|TikTokConnector|connectMultiStream|reconnectMultiStreams|fetch\s*\(/.test(relevantSource),
    giftsUseProvidedNamesAndSkipCatalogLookup: routeSource.includes("giftName: 'Rose'") && routeSource.includes("giftName: 'Treasure Chest'") && !/giftId\s*:/.test(routeSource),
    pluginApiEmitCallsSocketIo: /emit\(event, data\) \{[\s\S]{0,400}this\.io\.emit\(event, data\)/.test(pluginLoaderSource),
    queuePersistence: 'in-memory ClarityHUD eventQueues plus app Socket.IO emit; the test route does not call database persistence'
  };
  assert.equal(audit.requestBodyOrParametersUsed, false, 'Synthetic test route must not accept user-provided event payloads');
  assert.equal(audit.invokesActualHandlers, true);
  assert.equal(audit.handlerQueuesAndBroadcasts, true);
  assert.equal(audit.noProviderOrConnectorCalls, true);
  assert.equal(audit.giftsUseProvidedNamesAndSkipCatalogLookup, true);
  assert.equal(audit.pluginApiEmitCallsSocketIo, true);
  return audit;
}

async function main() {
  assert.equal(process.versions.node.split('.')[0], '22', 'Run this probe with the bundled Node 22 runtime');
  assertNoCheckoutDatabase();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
  let port;
  let pluginDir;
  let childEnv;
  let pluginSourceBefore;
  let pluginFixtureBefore;
  let sourceFilesBefore;
  let sourceManifestBefore;
  let eventPathAudit;
  let localeSyncSourceAudit;
  try {
    port = await reserveLoopbackPort();
    pluginDir = prepareDocsPluginFixture(ROOT, profileDir, ALLOWED_PLUGIN_IDS);
    childEnv = createDocsCaptureChildEnvironment({
      profileDir,
      port,
      pluginDir,
      allowedPluginIds: ALLOWED_PLUGIN_IDS
    });
    const validatedIds = docsCapturePolicy.validateDocumentationCaptureEnvironment(childEnv);
    assert.deepEqual([...validatedIds], ALLOWED_PLUGIN_IDS);
    eventPathAudit = auditSyntheticFullTestEventPath();

    pluginSourceBefore = inventoryDirectory(path.join(APP_ROOT, 'plugins', 'clarityhud'));
    pluginFixtureBefore = inventoryDirectory(path.join(pluginDir, 'clarityhud'));
    assert.deepEqual(pluginFixtureBefore, pluginSourceBefore, 'The isolated ClarityHUD copy differs from source');
    sourceFilesBefore = SOURCE_PATHS.map(sourceRecord);
    const sharedI18nSource = fs.readFileSync(path.join(APP_ROOT, 'public', 'js', 'i18n-client.js'), 'utf8');
    const fullRendererSource = fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'overlays', 'full.js'), 'utf8');
    const serverSource = fs.readFileSync(path.join(APP_ROOT, 'server.js'), 'utf8');
    const localeRouteSource = serverSource;
    localeSyncSourceAudit = {
      sharedI18nListensThroughWindowSocket: sharedI18nSource.includes('const candidate = window.socket'),
      fullRendererCreatesPrivateSocket: /STATE\.socket\s*=\s*io\(\)/.test(fullRendererSource),
      fullRendererPublishesSocketOnWindow: /window\.socket\s*=/.test(fullRendererSource),
      fullRendererHtmlLoadsSharedI18n: fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'overlays', 'full.html'), 'utf8').includes('/js/i18n-client.js'),
      sharedI18nAutoCreatesWindowInstance: /const i18n = new I18nClient\(\);[\s\S]{0,1400}window\.i18n\s*=\s*i18n/.test(sharedI18nSource),
      sharedI18nAutoInitializes: /i18n\.init\(\)/.test(sharedI18nSource),
      fullRendererUsesPluginI18nRuntime: fullRendererSource.includes('ClarityHUDI18n.text(`overlay.event.${type}`'),
      serverLocaleRouteBroadcastsLocaleChanged: /io\.emit\('locale-changed',\s*\{\s*locale\s*\}\)/.test(serverSource),
      localePostRoutePersistsAndChangesBackendLocale: /i18n\.setLocale\(locale\)/.test(localeRouteSource) && /db\.setSetting\('language',\s*locale\)/.test(localeRouteSource)
    };
    sourceManifestBefore = {
      original: JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'plugin.json'), 'utf8')),
      staged: JSON.parse(fs.readFileSync(path.join(pluginDir, 'clarityhud', 'plugin.json'), 'utf8'))
    };
  } catch (error) {
    const tempRoot = fs.realpathSync(os.tmpdir());
    const resolvedProfile = fs.realpathSync(profileDir);
    if (path.dirname(resolvedProfile) === tempRoot && path.basename(resolvedProfile).startsWith(PROFILE_PREFIX)) {
      fs.rmSync(resolvedProfile, { recursive: true, force: true });
    }
    throw error;
  }

  const sourcePluginRoot = path.join(APP_ROOT, 'plugins', 'clarityhud');
  const fixturePluginRoot = path.join(pluginDir, 'clarityhud');

  const evidence = {
    schemaVersion: 1,
    scope: 'actual maintained app/server.js + only ClarityHUD, one temporary profile and loopback listener; real shared-i18n calls and one existing ClarityHUD synthetic test route; one POST to the owned app loopback /api/shutdown is lifecycle-only; no providers, product profiles, real user data, audio or OBS',
    startedAtUtc: new Date().toISOString(),
    allowedPluginIds: ALLOWED_PLUGIN_IDS,
    childEnvironmentKeys: Object.keys(childEnv).sort(),
    childEnvironmentCredentialValueCount: Object.entries(childEnv).filter(([key, value]) => /key|token|secret|password|credential/i.test(key) && String(value || '').length > 0).length,
    port,
    sourceFiles: sourceFilesBefore,
    pluginManifest: {
      originalId: sourceManifestBefore.original.id,
      originalEnabled: sourceManifestBefore.original.enabled,
      stagedId: sourceManifestBefore.staged.id,
      stagedEnabled: sourceManifestBefore.staged.enabled,
      enabledWasChanged: sourceManifestBefore.original.enabled !== sourceManifestBefore.staged.enabled,
      onlyEnabledFieldDiffers: (() => {
        const normalized = { ...sourceManifestBefore.staged, enabled: sourceManifestBefore.original.enabled };
        return JSON.stringify(normalized) === JSON.stringify(sourceManifestBefore.original);
      })()
    },
    syntheticEventPathAudit: eventPathAudit,
    localeSyncSourceAudit,
    pluginSourceInventory: pluginSourceBefore,
    pluginFixtureInventory: pluginFixtureBefore,
    sourcePrePost: {},
    api: [],
    browser: null,
    cleanup: null,
    result: 'RUNNING'
  };

  let child;
  let childClosePromise = Promise.resolve(null);
  let browser;
  let browserContext;
  let page;
  let output = '';
  let logCapturePath = null;
  let spawnError = null;
  let pageErrors = [];
  let consoleErrors = [];
  let requestFailures = [];
  let externalRequestsBlocked = [];
  let websocketOrigins = [];
  let localeResponses = [];
  let rendererStateResponses = [];
  let rendererSettingsResponses = [];
  const rendererResponseTasks = [];
  let screenshotPath = null;
  let evidenceDir = path.join(ROOT, 'docs', 'coordination', 'evidence', `actual-clarityhud-locale-event-20261007-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(evidenceDir, { recursive: true });

  try {
    assertNoCheckoutDatabase();
    const portOrigin = `http://127.0.0.1:${port}`;
    child = spawn(path.join(ROOT, 'runtime', 'node', 'node.exe'), [path.join(APP_ROOT, 'server.js')], {
      cwd: APP_ROOT,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    childClosePromise = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    evidence.pid = child.pid;
    child.stdout.on('data', data => { output = `${output}${data}`.slice(-250000); });
    child.stderr.on('data', data => { output = `${output}${data}`.slice(-250000); });
    child.once('error', error => { spawnError = error; });

    const fetchJson = async (route, expectedMethod = 'GET', options = {}) => {
      const response = await fetch(`${portOrigin}${route}`, {
        method: expectedMethod,
        headers: { Origin: portOrigin, ...(options.headers || {}) },
        body: options.body,
        signal: AbortSignal.timeout(5000)
      });
      const bodyBytes = Buffer.from(await response.arrayBuffer());
      let body;
      try { body = JSON.parse(bodyBytes.toString('utf8')); } catch { throw new Error(`${route} did not return JSON`); }
      const record = {
        route,
        method: expectedMethod,
        status: response.status,
        responseBytes: bodyBytes.length,
        responseSha256: sha256(bodyBytes),
        success: body.success === true,
        dock: body.dock || null
      };
      if (route === '/api/clarityhud/settings/full') {
        record.settingKeys = Object.keys(body.settings || {}).sort();
      }
      if (route === '/api/clarityhud/state/full') {
        const events = body.events || {};
        record.eventKeys = Object.keys(events).sort();
        record.eventCounts = Object.fromEntries(Object.entries(events).map(([key, value]) => [key, Array.isArray(value) ? value.length : null]));
        if (options.expectEmpty) assert(Object.values(events).every(value => Array.isArray(value) && value.length === 0), 'Fresh isolated state unexpectedly contains events');
      }
      evidence.api.push(record);
      assert.equal(response.status, 200, `${route} must return HTTP 200`);
      assert.equal(body.success, true, `${route} response must report success`);
      return { response, body, bytes: bodyBytes };
    };

    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`Isolated app exited before readiness (exit=${child.exitCode}, signal=${child.signalCode})`);
      }
      try {
        const response = await fetch(`${portOrigin}/overlay/clarity/full?lang=de`, { signal: AbortSignal.timeout(500) });
        ready = response.status === 200;
      } catch (_error) {
        // The isolated child may still be starting; no other URL is probed.
      }
      if (ready) break;
      await delay(250);
    }
    assert(ready, 'Actual /overlay/clarity/full route did not become ready on loopback');

    const originResponse = await fetch(`${portOrigin}/overlay/clarity/full?lang=de`, { signal: AbortSignal.timeout(5000) });
    const servedHtml = Buffer.from(await originResponse.arrayBuffer());
    const originalHtmlPath = path.join(sourcePluginRoot, 'overlays', 'full.html');
    const originalHtml = fs.readFileSync(originalHtmlPath);
    assert.equal(originResponse.status, 200);
    assert(servedHtml.equals(originalHtml), 'Actual route HTML response differs from the original ClarityHUD page');
    evidence.servedHtml = {
      route: '/overlay/clarity/full?lang=de',
      status: originResponse.status,
      bytes: servedHtml.length,
      sha256: sha256(servedHtml),
      sourcePath: 'app/plugins/clarityhud/overlays/full.html',
      sourceSha256: sha256(originalHtml),
      byteExactMatch: true
    };

    const settings = await fetchJson('/api/clarityhud/settings/full');
    assert(settings.body.settings && typeof settings.body.settings === 'object');
    evidence.rendererSettingsScope = {
      scope: 'temporary docs-capture profile only; VirtualScroller remains enabled at the configured default and only animation/reduced-motion settings are adjusted for deterministic capture',
      original: {
        useVirtualScrolling: settings.body.settings.useVirtualScrolling,
        maxLines: settings.body.settings.maxLines,
        reduceMotion: settings.body.settings.reduceMotion,
        animationIn: settings.body.settings.animationIn
      }
    };
    const state = await fetchJson('/api/clarityhud/state/full', 'GET', { expectEmpty: true });
    assert(state.body.events && typeof state.body.events === 'object');
    assert.equal(settings.body.settings.useVirtualScrolling, true, 'The standard-mode probe requires VirtualScroller to be enabled in the starting full-overlay settings');
    const deterministicRendererSettings = await fetchJson('/api/clarityhud/settings/full', 'POST', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reduceMotion: true,
        animationIn: 'none',
        animationOut: 'none'
      })
    });
    assert.equal(deterministicRendererSettings.body.settings.useVirtualScrolling, true);
    assert.equal(deterministicRendererSettings.body.settings.maxLines, settings.body.settings.maxLines);
    evidence.rendererSettingsScope.captureOverrides = {
      useVirtualScrolling: deterministicRendererSettings.body.settings.useVirtualScrolling,
      maxLines: deterministicRendererSettings.body.settings.maxLines,
      reduceMotion: deterministicRendererSettings.body.settings.reduceMotion,
      animationIn: deterministicRendererSettings.body.settings.animationIn,
      animationOut: deterministicRendererSettings.body.settings.animationOut
    };

    const { chromium } = require('../../app/node_modules/playwright');
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync']
    });
    evidence.browser = {
      version: browser.version(),
      playwrightVersion: require('../../app/node_modules/playwright/package.json').version,
      viewport: { width: 1280, height: 720 },
      url: `${portOrigin}/overlay/clarity/full?lang=fr`,
      pageErrors,
      consoleErrors,
      requestFailures,
      externalRequestsBlocked,
      websocketOrigins
    };
    browserContext = await browser.newContext({ viewport: evidence.browser.viewport });
    page = await browserContext.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => requestFailures.push({
      origin: (() => { try { return new URL(request.url()).origin; } catch { return 'invalid'; } })(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText || null
    }));
    page.on('websocket', websocket => {
      let websocketOrigin = 'invalid';
      try { const url = new URL(websocket.url()); websocketOrigin = `${url.protocol}//${url.host}`; } catch (_error) {}
      websocketOrigins.push(websocketOrigin);
    });
    page.on('response', response => {
      try {
        const url = new URL(response.url());
        const localeMatch = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
        if (localeMatch) localeResponses.push({ locale: localeMatch[1], method: response.request().method(), status: response.status() });
        if (url.pathname === '/api/clarityhud/state/full') {
          const responseRecord = { at: new Date().toISOString(), method: response.request().method(), status: response.status() };
          rendererResponseTasks.push(response.json().then(body => {
            const events = body.events || {};
            rendererStateResponses.push({
              ...responseRecord,
              success: body.success === true,
              eventCounts: Object.fromEntries(Object.entries(events).map(([key, value]) => [key, Array.isArray(value) ? value.length : null])),
              followNicknames: Array.isArray(events.follow) ? events.follow.map(event => event.user?.nickname || null) : []
            });
          }).catch(error => rendererStateResponses.push({ ...responseRecord, error: error.message })));
        }
        if (url.pathname === '/api/clarityhud/settings/full') {
          const responseRecord = { at: new Date().toISOString(), method: response.request().method(), status: response.status() };
          rendererResponseTasks.push(response.json().then(body => rendererSettingsResponses.push({
            ...responseRecord,
            success: body.success === true,
            useVirtualScrolling: body.settings?.useVirtualScrolling ?? null,
            maxLines: body.settings?.maxLines ?? null
          })).catch(error => rendererSettingsResponses.push({ ...responseRecord, error: error.message })));
        }
      } catch (_error) {}
    });
    await page.route('**/*', route => {
      let requestOrigin = '';
      try { requestOrigin = new URL(route.request().url()).origin; } catch (_error) {}
      if (requestOrigin === portOrigin) return route.continue();
      let host = 'invalid';
      try { host = new URL(route.request().url()).host; } catch (_error) {}
      externalRequestsBlocked.push({ host, resourceType: route.request().resourceType() });
      return route.abort('blockedbyclient');
    });

    const pageResponse = await page.goto(evidence.browser.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    assert.equal(pageResponse.status(), 200, 'Chromium must receive the original full overlay');
    await page.locator('#overlay-container.layout-singleStream .feed-container').waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('#overlay-container .loading') === null, null, { timeout: 15000 });
    await page.waitForTimeout(600);

    const renderedHtml = Buffer.from(await pageResponse.body());
    assert(renderedHtml.equals(originalHtml), 'Chromium response differs from the original ClarityHUD page');
    const initialEventItemCount = await page.locator('#overlay-container .event-item').count();
    assert.equal(initialEventItemCount, 0, 'Fresh isolated backend state must render empty before the synthetic event route runs');
    assert.deepEqual(pageErrors, [], 'Original renderer produced page errors');
    assert.deepEqual(consoleErrors, [], 'Original renderer produced console errors');
    assert.deepEqual(requestFailures.filter(failure => failure.origin === portOrigin), [], 'Same-origin renderer request failed');
    assert(websocketOrigins.every(origin => origin === portOrigin.replace('http:', 'ws:')), 'Renderer attempted a non-loopback WebSocket');
    await page.evaluate(() => {
      window.__clarityHudSyntheticFollowCaptures = [];
      window.socket?.on('clarityhud.update.follow', payload => {
        const viewport = document.querySelector('.virtual-scroller-viewport');
        const content = document.querySelector('.virtual-scroller-content');
        window.__clarityHudSyntheticFollowCaptures.push({
          at: new Date().toISOString(),
          nickname: payload?.user?.nickname || payload?.nickname || null,
          eventCards: [...document.querySelectorAll('#overlay-container .event-item')].map(card => ({
            username: card.querySelector('.event-username')?.textContent.trim() || null,
            label: card.querySelector('.event-type')?.textContent.trim() || null
          })),
          virtualScroller: viewport ? {
            scrollTop: viewport.scrollTop,
            viewportHeight: viewport.clientHeight,
            contentHeight: content?.scrollHeight || null,
            renderedChildren: content?.children.length || 0
          } : null
        });
      });
    });
    await page.waitForTimeout(2100);

    const syncTrials = [];
    const localeCaptures = [];
    const localeExpectedLabels = { de: 'Gefolgt', en: 'Followed', es: 'Siguió', fr: 'A suivi' };
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const beforeLocale = await page.evaluate(() => ({ locale: window.i18n.getLocale(), windowSocketPresent: Boolean(window.socket) }));
      const serverLocale = await page.evaluate(async localeValue => {
        const response = await fetch('/api/i18n/current', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: localeValue })
        });
        return { status: response.status, body: await response.json() };
      }, locale);
      assert.equal(serverLocale.status, 200, `Server locale route must accept ${locale}`);
      assert.equal(serverLocale.body.success, true, `Server locale route must acknowledge ${locale}`);
      await page.waitForTimeout(350);
      const localeAfterServerEmit = await page.evaluate(() => ({
        locale: window.i18n.getLocale(),
        htmlLang: document.documentElement.lang,
        windowSocketPresent: Boolean(window.socket),
        followLabel: window.i18n.t('plugins.clarityhud.runtime.overlay.event.follow'),
        visibleFollowLabels: [...document.querySelectorAll('#overlay-container .event-item .event-type')].map(element => element.textContent.trim())
      }));
      syncTrials.push({ requestedLocale: locale, beforeLocale, serverResponse: serverLocale, afterLocaleChangedBroadcast: localeAfterServerEmit });
      evidence.localeSyncTrials = syncTrials;
      assert.equal(localeAfterServerEmit.locale, locale, `Original renderer must adopt server locale ${locale}`);
      assert.equal(localeAfterServerEmit.htmlLang, locale, `Original renderer html lang must become ${locale}`);
      assert.equal(localeAfterServerEmit.followLabel, localeExpectedLabels[locale], `Shared i18n follow label must resolve to ${locale}`);
      const observedTranslationResponses = localeResponses.filter(response => response.locale === locale);
      assert(observedTranslationResponses.some(response => response.status === 200 && response.method === 'GET'), `Actual locale catalog route must return ${locale}`);
      localeCaptures.push({ locale, serverLocaleSyncTrial: syncTrials[syncTrials.length - 1], translationResponses: observedTranslationResponses });
      evidence.browser = {
        ...evidence.browser,
        initialLocaleAttribute: 'fr',
        finalLocaleAttribute: localeAfterServerEmit.htmlLang,
        initialEmptyEventItems: initialEventItemCount,
        localeCaptures,
        translationResponses: localeResponses
      };
    }

    const finalLocale = await page.evaluate(() => ({ locale: window.i18n.getLocale(), htmlLang: document.documentElement.lang }));
    assert.deepEqual(finalLocale, { locale: 'fr', htmlLang: 'fr' }, 'The single synthetic event must run after the final server-origin French locale broadcast');
    const eventResponse = await fetchJson('/api/clarityhud/test/full', 'POST');
    assert.equal(eventResponse.body.success, true);
    const backendStateAfterEvent = await fetchJson('/api/clarityhud/state/full');
    const queuedFollows = backendStateAfterEvent.body.events.follow.filter(event => event.user?.nickname === 'NewFollower');
    assert.equal(queuedFollows.length, 1, 'Backend must queue exactly one synthetic follow');
    await page.waitForFunction(() => [...document.querySelectorAll('#overlay-container .event-item .event-username')]
      .some(element => element.textContent.trim() === 'NewFollower'), null, { timeout: 10000 });

    const existingEventLocaleTrials = [];
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const cardCountBefore = await page.locator('#overlay-container .event-item').count();
      const serverLocale = await page.evaluate(async localeValue => {
        const response = await fetch('/api/i18n/current', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: localeValue })
        });
        return { status: response.status, body: await response.json() };
      }, locale);
      assert.equal(serverLocale.status, 200, `Server locale route must accept retained-event locale ${locale}`);
      assert.equal(serverLocale.body.success, true);
      await page.waitForFunction(({ expectedLocale, expectedLabel }) =>
        window.i18n.getLocale() === expectedLocale &&
        document.documentElement.lang === expectedLocale &&
        [...document.querySelectorAll('#overlay-container .event-item')].some(card =>
          card.querySelector('.event-username')?.textContent.trim() === 'NewFollower' &&
          card.querySelector('.event-type')?.textContent.trim() === `(${expectedLabel})`),
      { expectedLocale: locale, expectedLabel: localeExpectedLabels[locale] }, { timeout: 10000 });
      const retainedSnapshot = await page.evaluate(() => ({
        locale: window.i18n.getLocale(),
        htmlLang: document.documentElement.lang,
        eventCardCount: document.querySelectorAll('#overlay-container .event-item').length,
        followLabels: [...document.querySelectorAll('#overlay-container .event-item')]
          .filter(card => card.querySelector('.event-username')?.textContent.trim() === 'NewFollower')
          .map(card => card.querySelector('.event-type')?.textContent.trim() || null),
        viewport: (() => {
          const scroller = document.querySelector('.virtual-scroller-viewport');
          const content = document.querySelector('.virtual-scroller-content');
          const rect = scroller?.getBoundingClientRect();
          return scroller ? {
            x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            scrollTop: scroller.scrollTop,
            clientHeight: scroller.clientHeight,
            contentHeight: content?.scrollHeight || 0,
            renderedChildren: content?.children.length || 0
          } : null;
        })(),
        followBounds: (() => {
          const card = [...document.querySelectorAll('#overlay-container .event-item')]
            .find(item => item.querySelector('.event-username')?.textContent.trim() === 'NewFollower');
          const rect = card?.getBoundingClientRect();
          return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
        })()
      }));
      assert.equal(retainedSnapshot.eventCardCount, cardCountBefore, `Locale change to ${locale} must preserve all rendered event cards`);
      assert.deepEqual(retainedSnapshot.followLabels, [`(${localeExpectedLabels[locale]})`]);
      assert(retainedSnapshot.viewport, `VirtualScroller must remain active for retained ${locale} cards`);
      assert(retainedSnapshot.viewport.renderedChildren > 0, `VirtualScroller must render rows for retained ${locale} cards`);
      existingEventLocaleTrials.push({ locale, serverResponse: serverLocale, retainedSnapshot });
    }

    const stateReadsBeforeReconnect = rendererStateResponses.length;
    const settingsReadsBeforeReconnect = rendererSettingsResponses.length;
    const socketBeforeReconnect = await page.evaluate(() => {
      window.__clarityHudSyntheticFollowSocket = window.socket;
      return { id: window.socket.id, connected: window.socket.connected };
    });
    assert.equal(socketBeforeReconnect.connected, true, 'Renderer socket must be connected before the disconnect probe');
    await page.evaluate(() => window.socket.disconnect());
    await page.waitForFunction(() => window.socket.connected === false, null, { timeout: 5000 });
    const reconnectMaxLines = Math.max(1, Number(settings.body.settings.maxLines || 10) - 1);
    const changedSettings = await fetchJson('/api/clarityhud/settings/full', 'POST', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxLines: reconnectMaxLines })
    });
    assert.equal(changedSettings.body.settings.maxLines, reconnectMaxLines, 'Isolated backend setting must change while the renderer is disconnected');
    await page.evaluate(() => window.socket.connect());
    await page.waitForFunction(() => window.socket.connected === true, null, { timeout: 10000 });
    await page.waitForFunction(() => {
      const followCard = [...document.querySelectorAll('#overlay-container .event-item')]
        .find(card => card.querySelector('.event-username')?.textContent.trim() === 'NewFollower');
      return followCard?.querySelector('.event-type')?.textContent.trim() === '(A suivi)';
    }, null, { timeout: 10000 });
    for (let attempt = 0; attempt < 50 && (rendererStateResponses.length <= stateReadsBeforeReconnect || rendererSettingsResponses.length <= settingsReadsBeforeReconnect); attempt += 1) await delay(100);
    assert(rendererStateResponses.length > stateReadsBeforeReconnect, 'Reconnect must complete another renderer state request');
    assert(rendererSettingsResponses.length > settingsReadsBeforeReconnect, 'Reconnect must complete another renderer settings request');
    await delay(150);
    const reconnectSnapshot = await page.evaluate(() => ({
      socketConnected: window.socket.connected,
      socketId: window.socket.id,
      locale: window.i18n.getLocale(),
      htmlLang: document.documentElement.lang,
      eventCardCount: document.querySelectorAll('#overlay-container .event-item').length,
      followLabel: [...document.querySelectorAll('#overlay-container .event-item')]
        .find(card => card.querySelector('.event-username')?.textContent.trim() === 'NewFollower')
        ?.querySelector('.event-type')?.textContent.trim() || null
    }));
    assert.equal(reconnectSnapshot.socketConnected, true, 'Renderer socket must reconnect');
    assert.equal(reconnectSnapshot.locale, 'fr');
    assert.equal(reconnectSnapshot.followLabel, '(A suivi)', 'Retained French follow must survive state refresh');
    assert.equal(reconnectSnapshot.eventCardCount, 4, 'Reconnect must restore all four synthetic event cards');
    assert(rendererStateResponses.length > stateReadsBeforeReconnect, 'Reconnect must fetch backend state again');
    assert(rendererStateResponses.at(-1).success, 'Reconnect state refresh must succeed');
    assert.equal(rendererStateResponses.at(-1).eventCounts.follow, 1, 'Reconnect state must contain the original single follow');
    assert(rendererSettingsResponses.at(-1).success, 'Reconnect settings refresh must succeed');
    assert.equal(rendererSettingsResponses.at(-1).maxLines, reconnectMaxLines, 'Reconnect must load the changed maxLines setting');
    assert.equal(rendererSettingsResponses.at(-1).useVirtualScrolling, true, 'Reconnect must keep VirtualScroller enabled');

    const visibleFollowHandle = await page.waitForFunction(({ expectedLabel }) => {
      const candidate = [...document.querySelectorAll('#overlay-container .event-item')]
        .find(card => card.querySelector('.event-username')?.textContent.trim() === 'NewFollower');
      if (!candidate || candidate.querySelector('.event-type')?.textContent.trim() !== `(${expectedLabel})`) return false;
      const rect = candidate.getBoundingClientRect();
      const style = window.getComputedStyle(candidate);
      const viewport = document.querySelector('.virtual-scroller-viewport');
      const content = document.querySelector('.virtual-scroller-content');
      const scrollerRect = viewport?.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const insideBrowserViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewportHeight && rect.right <= viewportWidth;
      const insideScrollerViewport = !scrollerRect || (
        rect.top >= scrollerRect.top && rect.left >= scrollerRect.left &&
        rect.bottom <= scrollerRect.bottom && rect.right <= scrollerRect.right
      );
      return {
        username: candidate.querySelector('.event-username')?.textContent.trim() || null,
        label: candidate.querySelector('.event-type')?.textContent.trim() || null,
        text: candidate.innerText,
        bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewportBounds: { width: viewportWidth, height: viewportHeight },
        visible: insideBrowserViewport && insideScrollerViewport && rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) === 1,
        scrollerViewportBounds: scrollerRect ? { x: scrollerRect.x, y: scrollerRect.y, width: scrollerRect.width, height: scrollerRect.height } : null,
        virtualScroller: viewport ? {
          scrollTop: viewport.scrollTop,
          viewportHeight: viewport.clientHeight,
          contentHeight: content?.scrollHeight || null,
          renderedChildren: content?.children.length || 0
        } : null
      };
    }, { expectedLabel: localeExpectedLabels.fr }, { timeout: 10000 });
    const visibleFollowEvent = await visibleFollowHandle.jsonValue();
    const socketFollowEventCaptures = await page.evaluate(() => window.__clarityHudSyntheticFollowCaptures);
    evidence.eventAssertionBefore = { locale: 'fr', expectedFollowLabel: `(${localeExpectedLabels.fr})`, visibleFollowEvent, socketFollowEventCaptures, rendererStateResponses };
    evidence.existingEventLocaleTrials = existingEventLocaleTrials;
    evidence.disconnectReconnect = {
      before: socketBeforeReconnect,
      disconnected: true,
      backendChange: { route: '/api/clarityhud/settings/full', method: 'POST', status: changedSettings.response.status, previousMaxLines: settings.body.settings.maxLines, maxLines: changedSettings.body.settings.maxLines },
      after: { ...reconnectSnapshot, rendererStateReads: rendererStateResponses, rendererSettingsReads: rendererSettingsResponses },
      rendererSocketReferencePreserved: await page.evaluate(() => window.socket === window.__clarityHudSyntheticFollowSocket)
    };
    assert.equal(visibleFollowEvent.visible, true, 'Synthetic follow card must intersect the browser viewport in French');
    assert.equal(visibleFollowEvent.label, `(${localeExpectedLabels.fr})`, 'The visible synthetic follow event must use French');
    assert.equal(socketFollowEventCaptures.length, 1, 'Renderer Socket.IO must receive exactly one synthetic follow');
    screenshotPath = path.join(evidenceDir, 'full-fr-synthetic-event-after-reconnect.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const finalState = await fetchJson('/api/clarityhud/state/full');
    for (const eventType of ['chat', 'follow', 'gift', 'treasure']) {
      assert.equal(finalState.body.events[eventType].length, 1, `Isolated backend must queue exactly one synthetic ${eventType} event`);
    }
    assert.equal(finalState.body.events.follow[0].user?.nickname, 'NewFollower');
    evidence.eventStateAfterSyntheticPosts = {
      eventCounts: finalState.body.events ? Object.fromEntries(Object.entries(finalState.body.events).map(([key, value]) => [key, value.length])) : {},
      followNicknames: finalState.body.events.follow.map(event => event.user?.nickname),
      syntheticOnly: finalState.body.events.follow[0].user?.nickname === 'NewFollower'
    };
    evidence.positiveEventCapture = {
      locale: 'fr',
      route: '/api/clarityhud/test/full',
      method: 'POST',
      responseStatus: eventResponse.response.status,
      visibleFollowEvent,
      socketFollowEventCaptures,
      screenshot: {
        path: path.relative(ROOT, screenshotPath).split(path.sep).join('/'),
        bytes: fs.statSync(screenshotPath).size,
        sha256: sha256(fs.readFileSync(screenshotPath))
      }
    };
    evidence.browser = {
      ...evidence.browser,
      finalLocaleAttribute: await page.locator('html').getAttribute('lang'),
      finalRenderedEventItems: await page.locator('#overlay-container .event-item').count(),
      finalEventCapture: evidence.positiveEventCapture
    };
    evidence.localeSyncTrials = syncTrials;
    const serverLocaleSyncPassed = syncTrials.every(trial =>
      trial.serverResponse.status === 200 && trial.serverResponse.body?.success === true &&
      trial.serverResponse.body?.locale === trial.requestedLocale &&
      trial.afterLocaleChangedBroadcast.locale === trial.requestedLocale &&
      trial.afterLocaleChangedBroadcast.htmlLang === trial.requestedLocale
    );
    const retainedEventRelocalizationPassed = existingEventLocaleTrials.length === 4 && existingEventLocaleTrials.every(trial =>
      trial.retainedSnapshot.locale === trial.locale && trial.retainedSnapshot.htmlLang === trial.locale &&
      trial.retainedSnapshot.followLabels[0] === `(${localeExpectedLabels[trial.locale]})`);
    const reconnectPassed = reconnectSnapshot.socketConnected && reconnectSnapshot.locale === 'fr' &&
      reconnectSnapshot.followLabel === '(A suivi)' && reconnectSnapshot.eventCardCount === 4 &&
      rendererStateResponses.length > stateReadsBeforeReconnect &&
      rendererSettingsResponses.length > settingsReadsBeforeReconnect &&
      rendererSettingsResponses.at(-1)?.maxLines === reconnectMaxLines &&
      rendererSettingsResponses.at(-1)?.useVirtualScrolling === true;
    const fullRendererLocaleAndReconnectPassed = serverLocaleSyncPassed && retainedEventRelocalizationPassed && reconnectPassed && visibleFollowEvent.visible;
    evidence.localeSyncSummary = {
      status: serverLocaleSyncPassed ? 'PASS' : 'NOT_PROPAGATED_TO_RENDERER',
      checkedLocales: syncTrials.map(trial => trial.requestedLocale),
      serverAcceptedAllLocales: syncTrials.every(trial => trial.serverResponse.status === 200 && trial.serverResponse.body?.success === true),
      rendererObservedAllServerLocaleBroadcasts: serverLocaleSyncPassed,
      windowSocketPresent: syncTrials.map(trial => ({ locale: trial.requestedLocale, present: trial.afterLocaleChangedBroadcast.windowSocketPresent })),
      serverOriginLocaleBroadcastsPassed: serverLocaleSyncPassed,
      retainedEventRelocalizationPassed: existingEventLocaleTrials.length === 4 && existingEventLocaleTrials.every(trial =>
        trial.retainedSnapshot.locale === trial.locale && trial.retainedSnapshot.htmlLang === trial.locale &&
        trial.retainedSnapshot.followLabels[0] === `(${localeExpectedLabels[trial.locale]})`),
      retainedEventLocaleTrials: existingEventLocaleTrials.map(trial => ({ locale: trial.locale, eventCardCount: trial.retainedSnapshot.eventCardCount, followLabels: trial.retainedSnapshot.followLabels })),
      finding: serverLocaleSyncPassed ? null : 'The real server accepted and broadcast locale changes, but this renderer did not adopt them automatically.'
    };
    evidence.browser = {
      ...evidence.browser,
      title: await page.title(),
      initialLocaleAttribute: 'fr',
      finalLocaleAttribute: await page.locator('html').getAttribute('lang'),
      layoutClass: await page.locator('#overlay-container').getAttribute('class'),
      feedContainerCount: await page.locator('#overlay-container .feed-container').count(),
      initialEmptyEventItems: initialEventItemCount,
      finalRenderedEventItems: await page.locator('#overlay-container .event-item').count(),
      localeCaptures,
      translationResponses: localeResponses,
      sameOriginHttpResponseSha256: sha256(renderedHtml),
      outcome: 'same original renderer adopted real server-origin locale broadcasts, relocalized retained events without losing cards, and refreshed state after a real socket reconnect'
    };
    evidence.browser.externalRequestsBlocked = externalRequestsBlocked;
    evidence.browser.pageErrors = pageErrors;
    evidence.browser.consoleErrors = consoleErrors;
    evidence.browser.requestFailures = requestFailures;
    evidence.browser.websocketOrigins = websocketOrigins;
    evidence.result = fullRendererLocaleAndReconnectPassed ? 'PASS' : 'PARTIAL';
    if (!fullRendererLocaleAndReconnectPassed) evidence.openFinding = 'At least one server-origin locale broadcast, retained-event relocalization, viewport, or disconnect/reconnect acceptance condition did not pass.';
  } catch (error) {
    evidence.result = 'FAIL';
    evidence.error = error.message;
    if (page && !page.isClosed()) {
      try {
        evidence.failureBrowserSnapshot = await page.evaluate(() => ({
          locale: window.i18n?.getLocale?.() || null,
          htmlLang: document.documentElement.lang,
          eventCards: [...document.querySelectorAll('#overlay-container .event-item')].map(card => ({
            username: card.querySelector('.event-username')?.textContent.trim() || null,
            type: card.querySelector('.event-type')?.textContent.trim() || null
          })),
          visibleBodyText: document.body.innerText.slice(0, 4000)
        }));
        const failureScreenshot = path.join(evidenceDir, 'failure-current-renderer.png');
        await page.screenshot({ path: failureScreenshot, fullPage: true });
        evidence.failureBrowserScreenshot = {
          path: path.relative(ROOT, failureScreenshot).split(path.sep).join('/'),
          sha256: sha256(fs.readFileSync(failureScreenshot))
        };
      } catch (diagnosticError) {
        evidence.failureBrowserSnapshotError = diagnosticError.message;
      }
    }
  } finally {
    await Promise.allSettled(rendererResponseTasks);
    evidence.rendererStateResponses = rendererStateResponses;
    evidence.rendererSettingsResponses = rendererSettingsResponses;
    try { if (browserContext) await browserContext.close(); } catch (_error) {}
    try { if (browser) await browser.close(); } catch (_error) {}
    evidence.browserClosed = !browser || !browser.isConnected();

    let shutdownResponse = null;
    let shutdownRequestError = null;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
          method: 'POST',
          headers: { Origin: `http://127.0.0.1:${port}` },
          signal: AbortSignal.timeout(3000)
        });
        shutdownResponse = { status: response.status, body: await response.json(), targetPid: child.pid, targetPort: port };
        for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
      } catch (error) {
        shutdownRequestError = error.message;
      }
    }
    evidence.shutdownResponse = shutdownResponse;
    if (shutdownRequestError) evidence.shutdownRequestError = shutdownRequestError;

    let forced = false;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
      if (child.exitCode === null && child.signalCode === null) {
        forced = true;
        child.kill('SIGKILL');
      }
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
    }

    const childCloseResult = await Promise.race([
      childClosePromise,
      delay(2000).then(() => null)
    ]);
    evidence.childCloseEvent = childCloseResult;

    const portClosed = await isPortClosed(port);
    const databasePath = path.join(profileDir, 'ltth.app', 'user_configs', 'default.db');
    let databaseReopenCheck = { path: path.relative(ROOT, databasePath).split(path.sep).join('/'), passed: false };
    try {
      const BetterSqlite3 = require('../../app/node_modules/better-sqlite3');
      const database = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
      const quickCheck = database.pragma('quick_check');
      database.close();
      databaseReopenCheck = {
        path: path.relative(ROOT, databasePath).split(path.sep).join('/'),
        passed: Array.isArray(quickCheck) && quickCheck.length === 1 && quickCheck[0].quick_check === 'ok',
        quickCheck
      };
    } catch (error) {
      databaseReopenCheck.error = error.message;
    }
    logCapturePath = path.join(evidenceDir, 'backend-output.txt');
    fs.writeFileSync(logCapturePath, output, 'utf8');
    evidence.backendOutput = {
      path: path.relative(ROOT, logCapturePath).split(path.sep).join('/'),
      bytes: Buffer.byteLength(output),
      sha256: sha256(Buffer.from(output)),
      includesDatabaseClosed: /(?:database closed|Database.*closed)/i.test(output),
      includesClarityhudLoaded: /ClarityHUD plugin loaded successfully/i.test(output),
      includesClarityhudUnloaded: /Unloaded plugin: clarityhud/i.test(output),
      includesServerClosed: /Server closed/i.test(output),
      includesShutdownTimeout: /Graceful shutdown timed out/i.test(output),
      stdioClosedBeforeLogSnapshot: childCloseResult !== null,
      tail: output.slice(-12000)
    };
    evidence.databaseCloseVerification = {
      sourceCall: 'app/server.js calls db.close() before server.close()',
      sourceCallsDatabaseManagerClose: (() => {
        const serverModuleSource = fs.readFileSync(path.join(APP_ROOT, 'server.js'), 'utf8');
        const databaseModuleSource = fs.readFileSync(path.join(APP_ROOT, 'modules', 'database.js'), 'utf8');
        const closeCall = serverModuleSource.indexOf('db.close();', serverModuleSource.indexOf('async function gracefulShutdown'));
        const serverCloseCall = serverModuleSource.indexOf('server.close(() =>', closeCall);
        return closeCall >= 0 && serverCloseCall > closeCall && /this\.db\.close\(\)/.test(databaseModuleSource);
      })(),
      directDatabaseCloseSuccessLogExists: /database closed|Database.*closed/i.test(output),
      sourceFileSha256: sourceRecord('app/server.js').sha256,
      processExitCode: child?.exitCode ?? null,
      reopenAndQuickCheckAfterExit: databaseReopenCheck
    };
    const pluginSourceAfter = inventoryDirectory(sourcePluginRoot);
    const pluginFixtureAfter = inventoryDirectory(fixturePluginRoot);
    const sourceFilesAfter = SOURCE_PATHS.map(sourceRecord);
    const sourceChanges = sourceFilesBefore.map((before, index) => ({
      path: before.path,
      beforeSha256: before.sha256,
      afterSha256: sourceFilesAfter[index].sha256,
      stable: before.sha256 === sourceFilesAfter[index].sha256
    }));
    evidence.sourcePrePost = {
      allPinnedSourcesStable: sourceChanges.every(record => record.stable),
      sourceChanges,
      clarityhudSourceStable: pluginSourceBefore.sha256 === pluginSourceAfter.sha256,
      clarityhudFixtureStable: pluginFixtureBefore.sha256 === pluginFixtureAfter.sha256,
      fixtureStillMatchesSource: JSON.stringify(pluginSourceAfter) === JSON.stringify(pluginFixtureAfter),
      originalManifestUnchanged: JSON.stringify(sourceManifestBefore.original) === JSON.stringify(JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'plugin.json'), 'utf8'))),
      stagedManifestUnchanged: JSON.stringify(sourceManifestBefore.staged) === JSON.stringify(JSON.parse(fs.readFileSync(path.join(fixturePluginRoot, 'plugin.json'), 'utf8')))
    };

    // Preserve diagnostics before deleting the temporary profile that held
    // the isolated database. The evidence directory is unique per run.
    const diagnosticPath = path.join(evidenceDir, 'pre-cleanup-diagnostics.json');
    fs.writeFileSync(diagnosticPath, `${JSON.stringify({
      result: evidence.result,
      error: evidence.error || null,
      api: evidence.api,
      browser: evidence.browser,
      localeSyncTrials: evidence.localeSyncTrials,
      localeSyncSummary: evidence.localeSyncSummary,
      eventAssertionBefore: evidence.eventAssertionBefore,
      rendererSettingsScope: evidence.rendererSettingsScope,
      rendererStateResponses: evidence.rendererStateResponses,
      eventStateAfterSyntheticPosts: evidence.eventStateAfterSyntheticPosts,
      syntheticEventPathAudit: evidence.syntheticEventPathAudit,
      shutdownResponse: evidence.shutdownResponse || null,
      shutdownRequestError: evidence.shutdownRequestError || null,
      backendOutput: evidence.backendOutput,
      sourcePrePost: evidence.sourcePrePost,
      pluginManifest: evidence.pluginManifest,
      databaseCloseVerification: evidence.databaseCloseVerification,
      profilePath: profileDir
    }, null, 2)}\n`, 'utf8');
    evidence.preCleanupDiagnosticsPath = path.relative(ROOT, diagnosticPath).split(path.sep).join('/');

    let profileRemoved = false;
    try {
      const tempRoot = fs.realpathSync(os.tmpdir());
      const resolvedProfile = fs.realpathSync(profileDir);
      assert.equal(path.dirname(resolvedProfile), tempRoot, 'Refusing to remove a path outside the system temp root');
      assert(path.basename(resolvedProfile).startsWith(PROFILE_PREFIX), 'Refusing to remove a path without the probe-owned prefix');
      fs.rmSync(resolvedProfile, { recursive: true, force: true });
      profileRemoved = !fs.existsSync(resolvedProfile);
    } catch (error) {
      evidence.cleanupError = error.message;
    }

    const gracefulAppShutdownProven = shutdownResponse?.status === 200 && shutdownResponse.body?.success === true && shutdownResponse.targetPid === child?.pid && shutdownResponse.targetPort === port && child?.exitCode === 0 && child?.signalCode === null && childCloseResult !== null && evidence.databaseCloseVerification.sourceCallsDatabaseManagerClose && evidence.databaseCloseVerification.reopenAndQuickCheckAfterExit.passed && evidence.backendOutput.includesClarityhudLoaded && evidence.backendOutput.includesClarityhudUnloaded && evidence.backendOutput.includesServerClosed && !evidence.backendOutput.includesShutdownTimeout && !forced;
    evidence.cleanup = {
      pid: child?.pid || null,
      childExitCode: child?.exitCode ?? null,
      childSignalCode: child?.signalCode || null,
      terminalConfirmed: !child?.pid || child.exitCode !== null || child.signalCode !== null,
      forced,
      portClosed,
      browserClosed: evidence.browserClosed,
      tempProfileRemoved: profileRemoved,
      gracefulAppShutdownProven
    };
    if (!portClosed || !evidence.cleanup.terminalConfirmed || forced || !profileRemoved || !evidence.sourcePrePost.allPinnedSourcesStable || !evidence.sourcePrePost.clarityhudSourceStable || !evidence.sourcePrePost.clarityhudFixtureStable || !evidence.sourcePrePost.fixtureStillMatchesSource || !evidence.sourcePrePost.originalManifestUnchanged || !evidence.sourcePrePost.stagedManifestUnchanged || !gracefulAppShutdownProven) {
      evidence.result = 'FAIL';
      evidence.error = evidence.error || 'Cleanup or source stability was not confirmed';
    }

    if (evidence.error) evidence.result = 'FAIL';

    evidence.finishedAtUtc = new Date().toISOString();
    if (fs.existsSync(evidenceDir)) {
      const receiptPath = path.join(evidenceDir, 'receipt.json');
      evidence.receiptPath = path.relative(ROOT, receiptPath).split(path.sep).join('/');
      fs.writeFileSync(receiptPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
      process.stdout.write(`${JSON.stringify({ result: evidence.result, error: evidence.error, pid: child?.pid || null, port, receipt: evidence.receiptPath, screenshots: [evidence.positiveEventCapture?.screenshot?.path].filter(Boolean), cleanup: evidence.cleanup })}\n`);
    } else {
      process.stderr.write(`${JSON.stringify({ result: evidence.result, error: evidence.error, pid: child?.pid || null, port, cleanup: evidence.cleanup })}\n`);
    }
  }

  if (evidence.result === 'FAIL') process.exitCode = 1;
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
