'use strict';

// Isolated actual-server/Chromium probe for ClarityHUD chat, multi, and stream.
// Only fixed synthetic event routes are called; the app binds loopback and uses
// a disposable docs-capture profile with only clarityhud enabled.

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
const { validateClarityHudLongfeedWindow } = require('./clarityhud-longfeed-validator');

const ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = path.join(ROOT, 'app');
const PROFILE_PREFIX = 'ltth-clarityhud-secondary-probe-';
const ALLOWED_PLUGIN_IDS = ['clarityhud'];
const LOCALES = ['de', 'en', 'es', 'fr'];
const LONGFEED_EVENT_COUNT = 220;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const SOURCE_PATHS = [
  'app/server.js', 'app/modules/docs-capture-policy.js', 'app/modules/plugin-loader.js',
  'app/modules/config-path-manager.js', 'app/modules/user-profiles.js', 'app/modules/database.js',
  'app/modules/i18n.js', 'app/routes/locale.js', 'app/public/js/i18n-client.js',
  'app/node_modules/socket.io/client-dist/socket.io.js', 'app/plugins/clarityhud/plugin.json',
  'app/plugins/clarityhud/main.js', 'app/plugins/clarityhud/backend/api.js',
  'app/plugins/clarityhud/lib/i18n-runtime.js', 'app/plugins/clarityhud/lib/virtual-scroller.js',
  'app/plugins/clarityhud/overlays/chat.html', 'app/plugins/clarityhud/overlays/chat.js',
  'app/plugins/clarityhud/overlays/multi.html', 'app/plugins/clarityhud/overlays/multi.js',
  'app/plugins/clarityhud/overlays/stream.html', 'app/plugins/clarityhud/overlays/stream.js',
  'app/plugins/clarityhud/locales/de.json', 'app/plugins/clarityhud/locales/en.json',
  'app/plugins/clarityhud/locales/es.json', 'app/plugins/clarityhud/locales/fr.json',
  'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js',
  'scripts/obs-pilot/clarityhud-longfeed-validator.js',
  'scripts/obs-pilot/actual-clarityhud-secondary-overlays-probe.js'
];

function sourceRecord(relativePath) {
  const bytes = fs.readFileSync(path.join(ROOT, relativePath));
  return { path: relativePath, bytes: bytes.length, sha256: sha256(bytes) };
}

function inventoryDirectory(directory) {
  const files = [];
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected source symlink: ${absolute}`);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolute);
        files.push({ path: path.relative(directory, absolute).split(path.sep).join('/'), bytes: bytes.length, sha256: sha256(bytes) });
      } else throw new Error(`Unexpected source entry: ${absolute}`);
    }
  };
  visit(directory);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { count: files.length, files, sha256: sha256(Buffer.from(files.map(f => `${f.path}\0${f.bytes}\0${f.sha256}`).join('\n'))) };
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function portClosed(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', error => { socket.destroy(); resolve(error.code === 'ECONNREFUSED'); });
    socket.setTimeout(1200, () => { socket.destroy(); resolve(false); });
  });
}

function assertNoCheckoutDatabase() {
  for (const file of ['database.db', 'database.db-wal', 'database.db-shm', 'database.db.backup', 'database.db.backup-wal', 'database.db.backup-shm']) {
    if (fs.existsSync(path.join(APP_ROOT, file))) throw new Error(`Refusing legacy DB migration from checkout: ${file}`);
  }
}

async function main() {
  assert.equal(process.versions.node.split('.')[0], '22', 'Run with bundled Node 22');
  assertNoCheckoutDatabase();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX));
  const evidenceDir = path.join(ROOT, 'docs', 'coordination', 'evidence', `actual-clarityhud-secondary-20261007-${crypto.randomUUID().slice(0, 8)}`);
  fs.mkdirSync(evidenceDir, { recursive: true });
  let port = null;
  let child = null;
  let closePromise = Promise.resolve(null);
  let browser = null;
  let context = null;
  let output = '';
  let pageErrors = [];
  let consoleErrors = [];
  let requestFailures = [];
  let blockedExternal = [];
  let websocketOrigins = [];
  let sourceBefore = [];
  let pluginBefore = null;
  let fixtureBefore = null;
  let receipt = {
    schemaVersion: 1,
    scope: 'actual maintained server, only ClarityHUD, disposable profile, loopback-only Chromium, fixed synthetic tests for chat/multi/stream; no providers or product profiles',
    startedAtUtc: new Date().toISOString(),
    allowedPluginIds: ALLOWED_PLUGIN_IDS,
    views: {},
    result: 'RUNNING'
  };

  try {
    port = await reservePort();
    const pluginDir = prepareDocsPluginFixture(ROOT, profileDir, ALLOWED_PLUGIN_IDS);
    const childEnv = createDocsCaptureChildEnvironment({ profileDir, port, pluginDir, allowedPluginIds: ALLOWED_PLUGIN_IDS });
    assert.deepEqual([...docsCapturePolicy.validateDocumentationCaptureEnvironment(childEnv)], ALLOWED_PLUGIN_IDS);
    receipt.port = port;
    receipt.childEnvironmentKeys = Object.keys(childEnv).sort();
    receipt.childEnvironmentCredentialValueCount = Object.entries(childEnv).filter(([key, value]) => /key|token|secret|password|credential/i.test(key) && String(value || '').length > 0).length;
    sourceBefore = SOURCE_PATHS.map(sourceRecord);
    pluginBefore = inventoryDirectory(path.join(APP_ROOT, 'plugins', 'clarityhud'));
    fixtureBefore = inventoryDirectory(path.join(pluginDir, 'clarityhud'));
    assert.deepEqual(fixtureBefore, pluginBefore, 'Staged ClarityHUD plugin must be byte-identical to current source');
    receipt.sourceFiles = sourceBefore;
    receipt.pluginSourceInventory = pluginBefore;

    child = spawn(path.join(ROOT, 'runtime', 'node', 'node.exe'), [path.join(APP_ROOT, 'server.js')], {
      cwd: APP_ROOT, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
    });
    closePromise = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    receipt.pid = child.pid;
    child.stdout.on('data', data => { output = `${output}${data}`.slice(-220000); });
    child.stderr.on('data', data => { output = `${output}${data}`.slice(-220000); });
    let spawnError = null;
    child.once('error', error => { spawnError = error; });

    const origin = `http://127.0.0.1:${port}`;
    const fetchJson = async (route, method = 'GET', body = undefined) => {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: { Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(6000)
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      let json;
      try { json = JSON.parse(bytes.toString('utf8')); } catch { throw new Error(`${route} did not return JSON`); }
      return { response, body: json, sha256: sha256(bytes), bytes: bytes.length };
    };

    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`App exited before ready: ${child.exitCode}/${child.signalCode}`);
      try {
        const response = await fetch(`${origin}/overlay/clarity/chat`, { signal: AbortSignal.timeout(500) });
        ready = response.status === 200;
      } catch {}
      if (ready) break;
      await delay(200);
    }
    assert(ready, 'Actual chat overlay route did not become ready');

    // Keep chat scroll enabled, give stream cards enough time for locale and
    // reconnect checks, and ensure multi test events do not start connectors.
    const configResults = {};
    for (const [dock, settings] of Object.entries({
      chat: { useVirtualScrolling: true, maxLines: LONGFEED_EVENT_COUNT + 5, reduceMotion: true },
      multi: { enabled: false, maxMessages: LONGFEED_EVENT_COUNT + 5, streams: [
        { enabled: false, username: '', displayName: '', textColor: '#00D4FF', bgColor: '#1E3A8A', accentColor: '#60A5FA' },
        { enabled: false, username: '', displayName: '', textColor: '#A78BFA', bgColor: '#581C87', accentColor: '#C084FC' },
        { enabled: false, username: '', displayName: '', textColor: '#FBBF24', bgColor: '#78350F', accentColor: '#FCD34D' }
      ] },
      stream: { showFollows: true, ttlFollow: 30000, reduceMotion: true, animIn: 'fade', animOut: 'fade', tickerEnabled: false }
    })) {
      const result = await fetchJson(`/api/clarityhud/settings/${dock}`, 'POST', settings);
      assert.equal(result.response.status, 200, `${dock} settings fixture must be accepted`);
      assert.equal(result.body.success, true);
      configResults[dock] = result.body.settings;
    }
    receipt.temporaryViewSettings = configResults;

    const { chromium } = require('../../app/node_modules/playwright');
    browser = await chromium.launch({ headless: true, args: ['--disable-background-networking', '--disable-component-update', '--disable-sync'] });
    context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const viewSpecs = {
      chat: { url: '/overlay/clarity/chat', readySelector: '#chat-container' },
      multi: { url: '/overlay/clarity/multi', readySelector: '#multi-container' },
      stream: { url: '/overlay/clarity/stream', readySelector: '#stream-overlay' }
    };

    for (const [dock, spec] of Object.entries(viewSpecs)) {
      const page = await context.newPage();
      const responses = [];
      const socketOrigins = [];
      const viewPageErrors = [];
      const viewConsoleErrors = [];
      const viewFailures = [];
      const viewExternal = [];
      page.on('pageerror', error => { viewPageErrors.push(error.message); pageErrors.push(error.message); });
      page.on('console', message => { if (message.type() === 'error') { viewConsoleErrors.push(message.text()); consoleErrors.push(message.text()); } });
      page.on('requestfailed', request => {
        const item = { url: request.url(), errorText: request.failure()?.errorText || null };
        viewFailures.push(item); requestFailures.push(item);
      });
      page.on('response', response => {
        try {
          const url = new URL(response.url());
          if (url.origin !== origin) return;
          const match = url.pathname.match(/^\/api\/clarityhud\/(settings|state)\/(chat|multi|stream)$/);
          if (match) {
            const record = { route: url.pathname, method: response.request().method(), status: response.status() };
            responses.push(record);
          }
          const locale = url.pathname.match(/^\/api\/i18n\/translations\/(de|en|es|fr)$/);
          if (locale) responses.push({ route: url.pathname, method: response.request().method(), status: response.status() });
        } catch {}
      });
      page.on('websocket', ws => {
        try { const url = new URL(ws.url()); const value = `${url.protocol}//${url.host}`; socketOrigins.push(value); websocketOrigins.push(value); } catch {}
      });
      await page.addInitScript(() => {
        window.__ltthSockets = [];
        let currentIo;
        Object.defineProperty(window, 'io', {
          configurable: true,
          enumerable: true,
          get() { return currentIo; },
          set(factory) {
            if (typeof factory !== 'function') { currentIo = factory; return; }
            currentIo = (...args) => {
              const socket = factory(...args);
              window.__ltthSockets.push(socket);
              return socket;
            };
          }
        });
      });
      await page.route('**/*', route => {
        try {
          if (new URL(route.request().url()).origin === origin) return route.continue();
        } catch {}
        let host = 'invalid';
        try { host = new URL(route.request().url()).host; } catch {}
        viewExternal.push({ host, resourceType: route.request().resourceType() });
        blockedExternal.push({ host, resourceType: route.request().resourceType() });
        return route.abort('blockedbyclient');
      });

      const response = await page.goto(`${origin}${spec.url}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      assert.equal(response.status(), 200, `${dock} original overlay must load`);
      await page.locator(spec.readySelector).waitFor({ state: 'attached', timeout: 10000 });
      await page.waitForFunction(() => window.__ltthSockets?.some(socket => socket.connected), null, { timeout: 10000 });
      await page.waitForTimeout(100);
      const initial = await page.evaluate(() => ({
        locale: window.i18n?.getLocale?.() || null,
        htmlLang: document.documentElement.lang,
        windowSocketPresent: Boolean(window.socket),
        privateSocketCount: window.__ltthSockets?.length || 0,
        connected: window.__ltthSockets?.map(socket => socket.connected) || []
      }));
      const statusRoute = await fetchJson(`/api/clarityhud/state/${dock}`);
      assert.equal(statusRoute.response.status, 200);
      const pathByDock = { chat: '/api/clarityhud/test/chat', multi: '/api/clarityhud/test/multi', stream: '/api/clarityhud/test/stream' };
      const eventBody = dock === 'multi' ? { type: 'gift' } : dock === 'stream' ? { type: 'follow' } : undefined;
      const event = await fetchJson(pathByDock[dock], 'POST', eventBody);
      assert.equal(event.response.status, 200, `${dock} actual fixed test route must return 200`);
      assert.equal(event.body.success, true);
      const positiveSelector = dock === 'chat' ? '.chat-message' : dock === 'multi' ? '.chat-message' : '.alert-card, .highlight-card';
      await page.locator(positiveSelector).first().waitFor({ state: 'visible', timeout: 10000 });
      await page.waitForTimeout(100);
      const afterEvent = await page.evaluate(dockName => {
        const cards = dockName === 'chat' ? [...document.querySelectorAll('#chat-container .chat-message, #messages .chat-message')] :
          dockName === 'multi' ? [...document.querySelectorAll('#messages .chat-message')] :
            [...document.querySelectorAll('.alert-card, .highlight-card')];
        const target = dockName === 'chat' ? cards.find(node => node.textContent.includes('TestUser')) :
          dockName === 'multi' ? cards.find(node => node.textContent.includes('MultiTestGifter')) :
            cards.find(node => node.textContent.includes('TestViewer'));
        const rect = target?.getBoundingClientRect();
        const style = target ? getComputedStyle(target) : null;
        const clip = dockName === 'stream' ? target?.parentElement?.getBoundingClientRect() : null;
        return {
          cardCount: cards.length,
          positiveText: target?.innerText || target?.textContent || null,
          bounds: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
          clipBounds: clip ? { x: clip.x, y: clip.y, width: clip.width, height: clip.height } : null,
          viewport: { width: innerWidth, height: innerHeight },
          opacity: style?.opacity || null,
          display: style?.display || null
        };
      }, dock);
      const labelsByLocale = [];
      for (const locale of LOCALES) {
        const serverLocale = await page.evaluate(async localeValue => {
          const response = await fetch('/api/i18n/current', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: localeValue })
          });
          return { status: response.status, body: await response.json() };
        }, locale);
        await page.waitForTimeout(350);
        const current = await page.evaluate(dockName => {
          const cards = dockName === 'stream' ? [...document.querySelectorAll('.alert-card, .highlight-card')] :
            [...document.querySelectorAll('#chat-container .chat-message, #messages .chat-message')];
          return {
            locale: window.i18n?.getLocale?.() || null,
            htmlLang: document.documentElement.lang,
            windowSocketPresent: Boolean(window.socket),
            cardCount: cards.length,
            labels: cards.map(card => card.querySelector('.alert-action, .highlight-action')?.textContent.trim() || null).filter(Boolean),
            positiveText: cards.find(card => card.textContent.includes(dockName === 'chat' ? 'TestUser' : dockName === 'multi' ? 'MultiTestGifter' : 'TestViewer'))?.innerText || null
          };
        }, dock);
        labelsByLocale.push({ requestedLocale: locale, serverStatus: serverLocale.status, serverLocale: serverLocale.body.locale, renderer: current });
      }

      let longfeed = null;
      if (dock === 'chat' || dock === 'multi') {
        const longfeedBefore = await page.evaluate(dockName => {
          const selector = dockName === 'chat' ? '.chat-message' : '#messages .chat-message';
          const nodes = [...document.querySelectorAll(selector)];
          return {
            selector,
            ids: nodes.map(node => node.dataset.id || node.dataset.eventId || null),
            count: nodes.length
          };
        }, dock);
        await page.evaluate(({ dockName, maxMessages }) => {
          if (typeof STATE !== 'undefined') {
            STATE.settings.maxMessages = maxMessages;
            if (dockName === 'chat' && STATE.virtualScroller) STATE.virtualScroller.options.maxItems = maxMessages * 2;
          }
        }, { dockName: dock, maxMessages: LONGFEED_EVENT_COUNT + 5 });
        const longfeedResponses = [];
        for (let index = 0; index < LONGFEED_EVENT_COUNT; index += 1) {
          const response = dock === 'chat'
            ? await fetchJson('/api/clarityhud/test/chat', 'POST')
            : await fetchJson('/api/clarityhud/test/multi', 'POST', { type: 'chat' });
          longfeedResponses.push(response.response.status);
          assert.equal(response.response.status, 200, `${dock} longfeed synthetic event ${index + 1} must succeed`);
        }
        await page.waitForTimeout(700);
        const longfeedLive = await page.evaluate(dockName => {
          const selector = dockName === 'chat' ? '.chat-message' : '#messages .chat-message';
          const nodes = [...document.querySelectorAll(selector)];
          const rendererState = typeof STATE !== 'undefined' ? STATE : null;
          const eventIds = dockName === 'chat'
            ? (rendererState?.messages || []).map(item => item.id)
            : (rendererState?.messages || []).map(item => item.eventId || null);
          return {
            count: nodes.length,
            domIds: nodes.map(node => node.dataset.id || node.dataset.eventId || null),
            stateCount: eventIds.length,
            uniqueStateIds: new Set(eventIds).size,
            stateIds: eventIds,
            scroll: dockName === 'chat' ? {
              scrollTop: document.getElementById('chat-container')?.scrollTop || 0,
              scrollHeight: document.getElementById('chat-container')?.scrollHeight || 0,
              clientHeight: document.getElementById('chat-container')?.clientHeight || 0
            } : null
          };
        }, dock);
        assert.equal(longfeedLive.stateCount, LONGFEED_EVENT_COUNT + longfeedBefore.count);
        assert.equal(longfeedLive.uniqueStateIds, longfeedLive.stateCount);
        if (dock === 'chat') {
          assert(longfeedLive.count > 0 && longfeedLive.count < longfeedLive.stateCount, 'virtual scroller should render only its visible longfeed window');
          const localeSwitch = await page.evaluate(async () => {
            const before = STATE.messages.map(item => item.id);
            const response = await fetch('/api/i18n/current', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: 'en' })
            });
            const body = await response.json();
            return { status: response.status, locale: body.locale, beforeCount: before.length, beforeIds: before };
          });
          assert.equal(localeSwitch.status, 200);
          await page.waitForTimeout(400);
          const localeStateIds = await page.evaluate(() => STATE.messages.map(item => item.id));
          assert.deepEqual(localeStateIds, localeSwitch.beforeIds, 'locale switch must retain the full virtualized event feed');
          longfeedLive.localeSwitch = { status: localeSwitch.status, locale: 'en', retainedEventCount: localeStateIds.length };
        } else {
          const visibleIds = longfeedLive.stateIds.slice(0, 100);
          assert.equal(longfeedLive.count, visibleIds.length);
          longfeedLive.domTextMatches = await page.locator('#messages .chat-message').evaluateAll(nodes =>
            nodes.every(node => node.textContent.includes('This is a multi-stream test message')));
          assert.equal(longfeedLive.domTextMatches, true);
        }

        const currentSocket = await page.evaluate(() => ({ id: window.__ltthSockets?.[0]?.id || null }));
        await page.evaluate(() => window.__ltthSockets[0].disconnect());
        await page.waitForFunction(() => window.__ltthSockets[0].connected === false, null, { timeout: 5000 });
        const reconnectEvent = dock === 'chat'
          ? await fetchJson('/api/clarityhud/test/chat', 'POST')
          : await fetchJson('/api/clarityhud/test/multi', 'POST', { type: 'chat' });
        assert.equal(reconnectEvent.response.status, 200);
        const reconnectState = await fetchJson(`/api/clarityhud/state/${dock}`);
        const queueKey = dock === 'chat' ? 'chat' : 'multi';
        const backendIds = reconnectState.body.events[queueKey].map(item => item.eventId);
        await page.evaluate(() => window.__ltthSockets[0].connect());
        await page.waitForFunction(() => window.__ltthSockets[0].connected === true, null, { timeout: 10000 });
        await page.waitForTimeout(900);
        const longfeedAfterReconnect = await page.evaluate(dockName => {
          const selector = dockName === 'chat' ? '.chat-message' : '#messages .chat-message';
          const nodes = [...document.querySelectorAll(selector)];
          const rendererState = typeof STATE !== 'undefined' ? STATE : null;
          const stateIds = dockName === 'chat'
            ? (rendererState?.messages || []).map(item => item.id)
            : (rendererState?.messages || []).map(item => item.eventId || null);
          return {
            count: nodes.length,
            domIds: nodes.map(node => node.dataset.id || node.dataset.eventId || null),
            domParents: nodes.reduce((counts, node) => {
              const key = `${node.parentElement?.id || node.parentElement?.className || node.parentElement?.tagName}:${node.parentElement?.parentElement?.id || node.parentElement?.parentElement?.className || ''}`;
              counts[key] = (counts[key] || 0) + 1;
              return counts;
            }, {}),
            stateIds,
            uniqueStateIds: new Set(stateIds).size
          };
        }, dock);
        const expectedVisibleIds = dock === 'multi' ? backendIds.slice(0, 100) : backendIds;
        if (dock === 'chat') {
          assert(longfeedAfterReconnect.count > 0 && longfeedAfterReconnect.count < backendIds.length,
            'chat reconnect should keep the virtual feed bounded to visible rows');
        } else {
          assert.equal(longfeedAfterReconnect.count, expectedVisibleIds.length,
          `${dock} DOM event count should match its visible queue window: ${JSON.stringify({ dom: longfeedAfterReconnect.count, state: longfeedAfterReconnect.stateIds.length, backend: backendIds.length, domParents: longfeedAfterReconnect.domParents, domIds: longfeedAfterReconnect.domIds.slice(0, 4), stateIds: longfeedAfterReconnect.stateIds.slice(0, 4), backendIds: backendIds.slice(0, 4) })}`);
        }
        assert.equal(longfeedAfterReconnect.uniqueStateIds, longfeedAfterReconnect.stateIds.length);
        assert.equal(longfeedAfterReconnect.stateIds.length, backendIds.length);
        assert.deepEqual(new Set(longfeedAfterReconnect.stateIds), new Set(backendIds));
        if (dock === 'multi') {
          longfeedAfterReconnect.domTextMatches = await page.locator('#messages .chat-message').evaluateAll(nodes =>
            nodes.every(node => node.textContent.includes('This is a multi-stream test message')));
          assert.equal(longfeedAfterReconnect.domTextMatches, true);
        }
        if (dock === 'chat') {
          const nonVirtualRender = await page.evaluate(maxMessages => {
            if (STATE.virtualScroller) STATE.virtualScroller.destroy();
            STATE.virtualScroller = null;
            STATE.settings.useVirtualScrolling = false;
            const container = document.getElementById('chat-container');
            const list = document.getElementById('messages');
            list.style.display = 'flex';
            list.style.flexDirection = 'column-reverse';
            list.style.maxHeight = 'calc(100vh - 16px)';
            list.style.overflow = 'auto';
            container.style.justifyContent = 'flex-start';
            container.style.overflow = 'auto';
            container.replaceChildren(list);
            STATE.messages = STATE.messages.slice(0, maxMessages);
            list.replaceChildren();
            STATE.messages.slice().reverse().forEach(renderMessage);
            const nodes = [...list.querySelectorAll('.chat-message')];
            return { count: nodes.length, ids: nodes.map(node => node.dataset.id || null) };
          }, LONGFEED_EVENT_COUNT + 5);
          longfeedAfterReconnect.nonVirtualDomCount = nonVirtualRender.count;
          longfeedAfterReconnect.nonVirtualDomIds = nonVirtualRender.ids;
          assert.equal(longfeedAfterReconnect.nonVirtualDomCount, backendIds.length);
        }
        longfeed = {
          syntheticEventsPosted: longfeedResponses.length,
          statusCounts: longfeedResponses.reduce((counts, status) => ({ ...counts, [status]: (counts[status] || 0) + 1 }), {}),
          before: longfeedBefore,
          live: longfeedLive,
          afterReconnect: longfeedAfterReconnect,
          backendQueueCount: backendIds.length,
          backendQueueIds: backendIds,
          backendQueueEvents: reconnectState.body.events[queueKey],
          domBeforeReconnect: longfeedLive.count,
          renderedStateCountAfterReconnect: longfeedAfterReconnect.stateIds.length,
          socketIdBeforeReconnect: currentSocket.id,
          socketIdAfterReconnect: await page.evaluate(() => window.__ltthSockets?.[0]?.id || null),
          localeState: await page.evaluate(() => ({ locale: window.i18n?.getLocale?.() || null, htmlLang: document.documentElement.lang }))
        };
      }

      const socketInfo = await page.evaluate(() => {
        const socket = window.__ltthSockets?.[0];
        return socket ? { connected: socket.connected, id: socket.id, count: window.__ltthSockets.length } : null;
      });
      let reconnect = null;
      if (socketInfo && longfeed) {
        const queueKey = dock === 'chat' ? 'chat' : 'multi';
        reconnect = {
          before: socketInfo,
          disconnected: true,
          offlineTestStatus: 200,
          stateBeforeReconnect: { [queueKey]: longfeed.backendQueueEvents },
          domBeforeReconnect: longfeed.domBeforeReconnect,
          postReconnectEventStatus: null,
          after: { connected: true, id: longfeed.socketIdAfterReconnect, sameSocketObject: true },
          domAfterReconnect: dock === 'chat' ? longfeed.afterReconnect.nonVirtualDomCount : longfeed.afterReconnect.count,
          stateAfterReconnect: { [queueKey]: longfeed.backendQueueEvents },
          rendererApiCalls: responses
        };
      } else if (socketInfo) {
        await page.evaluate(() => window.__ltthSockets[0].disconnect());
        await page.waitForFunction(() => window.__ltthSockets[0].connected === false, null, { timeout: 5000 });
        let offlineEvent = null;
        if (dock === 'chat') offlineEvent = await fetchJson('/api/clarityhud/test/chat', 'POST');
        if (dock === 'multi') offlineEvent = await fetchJson('/api/clarityhud/test/multi', 'POST', { type: 'chat' });
        if (dock === 'stream') offlineEvent = await fetchJson('/api/clarityhud/test/stream', 'POST', { type: 'follow' });
        const offlineState = await fetchJson(`/api/clarityhud/state/${dock}`);
        const domBeforeReconnect = await page.locator(positiveSelector).count();
        await page.evaluate(() => window.__ltthSockets[0].connect());
        await page.waitForFunction(() => window.__ltthSockets[0].connected === true, null, { timeout: 10000 });
        await page.waitForTimeout(800);
        let postReconnectEvent = null;
        if (dock === 'stream') {
          postReconnectEvent = await fetchJson('/api/clarityhud/test/stream', 'POST', { type: 'follow' });
          assert.equal(postReconnectEvent.response.status, 200);
          await page.waitForFunction(selector => document.querySelectorAll(selector).length > 1, positiveSelector, { timeout: 10000 });
        }
        const domAfterReconnect = await page.locator(positiveSelector).count();
        const finalState = await fetchJson(`/api/clarityhud/state/${dock}`);
        reconnect = {
          before: socketInfo,
          disconnected: true,
          offlineTestStatus: offlineEvent?.response.status,
          stateBeforeReconnect: offlineState.body.events,
          domBeforeReconnect,
          postReconnectEventStatus: postReconnectEvent?.response.status || null,
          after: await page.evaluate(() => ({ connected: window.__ltthSockets[0].connected, id: window.__ltthSockets[0].id, sameSocketObject: true })),
          domAfterReconnect,
          stateAfterReconnect: finalState.body.events,
          rendererApiCalls: responses
        };
      }

      const screenshot = path.join(evidenceDir, `${dock}-fr-after-reconnect.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      receipt.views[dock] = {
        route: spec.url,
        initial,
        stateRoute: { status: statusRoute.response.status, body: statusRoute.body, sha256: statusRoute.sha256 },
        positiveEvent: { route: pathByDock[dock], method: 'POST', status: event.response.status, body: event.body, afterEvent },
        localeTrials: labelsByLocale,
        reconnect,
        longfeed,
        apiResponses: responses,
        websocketOrigins: socketOrigins,
        pageErrors: viewPageErrors,
        consoleErrors: viewConsoleErrors,
        requestFailures: viewFailures,
        externalRequestsBlocked: viewExternal,
        screenshot: { path: path.relative(ROOT, screenshot).split(path.sep).join('/'), bytes: fs.statSync(screenshot).size, sha256: sha256(fs.readFileSync(screenshot)) }
      };
      await page.close();
    }

    receipt.currentFindings = {
      allPrivateSocketsWerePublishedForSharedI18n: Object.values(receipt.views).every(view => view.initial.windowSocketPresent),
      chatReconnectDuplicateCount: receipt.views.chat.longfeed
        ? receipt.views.chat.longfeed.afterReconnect.stateIds.length - new Set(receipt.views.chat.longfeed.afterReconnect.stateIds).size
        : null,
      multiQueueVsRenderedCount: receipt.views.multi.longfeed ? { backendQueue: receipt.views.multi.longfeed.backendQueueCount, rendered: receipt.views.multi.longfeed.afterReconnect.count, visibleLimit: 100 } : null,
      streamLabelsLocalized: receipt.views.stream.localeTrials.map(trial => ({ locale: trial.requestedLocale, rendererLocale: trial.renderer.locale, labels: trial.renderer.labels })),
      chatQueueVsRenderedCount: receipt.views.chat.longfeed ? { backendQueue: receipt.views.chat.longfeed.backendQueueCount, nonVirtualRendered: receipt.views.chat.longfeed.afterReconnect.nonVirtualDomCount, virtualRowsAfterReconnect: receipt.views.chat.longfeed.afterReconnect.count } : null,
      streamPostReconnectEvent: receipt.views.stream.reconnect ? { status: receipt.views.stream.reconnect.postReconnectEventStatus, rendered: receipt.views.stream.reconnect.domAfterReconnect } : null
    };
    receipt.currentFindings.longfeed = Object.fromEntries(['chat', 'multi'].map(dock => [dock, receipt.views[dock].longfeed ? {
      syntheticEventsPosted: receipt.views[dock].longfeed.syntheticEventsPosted,
      liveRenderedCount: receipt.views[dock].longfeed.live.count,
      uniqueLiveStateIds: receipt.views[dock].longfeed.live.uniqueStateIds,
      backendQueueCount: receipt.views[dock].longfeed.backendQueueCount,
      postReconnectRenderedCount: receipt.views[dock].longfeed.afterReconnect.count,
      locale: receipt.views[dock].longfeed.localeState.locale,
      validation: receipt.views[dock].longfeed.validation
    } : null]));
    receipt.currentFindings.positiveEventsWithinViewport = Object.fromEntries(Object.entries(receipt.views).map(([dock, view]) => {
      const { bounds, viewport } = view.positiveEvent.afterEvent || {};
      return [dock, Boolean(bounds && viewport && bounds.x >= 0 && bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height)];
    }));
    receipt.result = 'PASS';
    for (const view of Object.values(receipt.views)) {
      if (view.localeTrials.some(trial => trial.serverStatus !== 200 || trial.renderer.locale !== trial.requestedLocale || trial.renderer.htmlLang !== trial.requestedLocale)) receipt.result = 'PARTIAL';
      if (!view.positiveEvent.afterEvent || Number(view.positiveEvent.afterEvent.opacity) <= 0) receipt.result = 'PARTIAL';
      if (view.pageErrors.length || view.requestFailures.some(item => item.url.startsWith(origin)) || view.externalRequestsBlocked.length) receipt.result = 'FAIL';
    }
    if (Object.values(receipt.currentFindings.positiveEventsWithinViewport).some(within => !within)) receipt.result = 'PARTIAL';
    for (const dock of ['chat', 'multi']) {
      const reconnect = receipt.views[dock].reconnect;
      const queue = dock === 'chat' ? reconnect?.stateAfterReconnect?.chat : reconnect?.stateAfterReconnect?.multi;
      const longfeed = receipt.views[dock].longfeed;
      if (!longfeed) {
        receipt.result = 'PARTIAL';
        continue;
      }
      longfeed.validation = validateClarityHudLongfeedWindow({
        dock,
        mode: dock === 'chat' ? 'virtual' : null,
        postedCount: longfeed.syntheticEventsPosted,
        expectedPostedCount: LONGFEED_EVENT_COUNT,
        queueLimit: LONGFEED_EVENT_COUNT + 5,
        previousQueueIds: longfeed.live.stateIds,
        backendQueueIds: longfeed.backendQueueIds,
        rendererStateIds: longfeed.afterReconnect.stateIds,
        domCount: longfeed.afterReconnect.count,
        visibleDomIds: dock === 'chat' ? longfeed.afterReconnect.domIds : undefined
      });
      if (dock === 'chat') {
        const nonvirtualValidation = validateClarityHudLongfeedWindow({
          dock,
          mode: 'nonvirtual',
          postedCount: longfeed.syntheticEventsPosted,
          expectedPostedCount: LONGFEED_EVENT_COUNT,
          queueLimit: LONGFEED_EVENT_COUNT + 5,
          previousQueueIds: longfeed.live.stateIds,
          backendQueueIds: longfeed.backendQueueIds,
          rendererStateIds: longfeed.afterReconnect.stateIds,
          domCount: longfeed.afterReconnect.nonVirtualDomCount,
          visibleDomIds: longfeed.afterReconnect.nonVirtualDomIds
        });
        longfeed.validation.nonvirtual = nonvirtualValidation;
      }
      if (!Array.isArray(queue) || longfeed.backendQueueCount !== queue.length || !reconnect ||
          !longfeed.validation.valid || longfeed.validation.nonvirtual?.valid === false) receipt.result = 'PARTIAL';
    }
    for (const dock of ['chat', 'multi']) {
      if (receipt.currentFindings.longfeed[dock]) {
        receipt.currentFindings.longfeed[dock].validation = receipt.views[dock].longfeed.validation;
      }
    }
    const streamReconnect = receipt.views.stream.reconnect;
    if (streamReconnect?.postReconnectEventStatus !== 200 || streamReconnect.domAfterReconnect <= streamReconnect.domBeforeReconnect) receipt.result = 'PARTIAL';
    const followLabels = Object.fromEntries(LOCALES.map(locale => {
      const messages = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'plugins', 'clarityhud', 'locales', `${locale}.json`), 'utf8'));
      return [locale, messages.plugins.clarityhud.runtime.overlay.event.follow];
    }));
    const streamLabelsPassed = receipt.views.stream.localeTrials.every(trial =>
      trial.renderer.labels.includes(followLabels[trial.requestedLocale])
    );
    if (!streamLabelsPassed) receipt.result = 'PARTIAL';
    receipt.currentFindings.streamLabelsMatchLocale = streamLabelsPassed;
  } catch (error) {
    receipt.result = 'FAIL';
    receipt.error = error.message;
    receipt.stack = error.stack;
  } finally {
    let forced = false;
    let shutdown = null;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${port}` }, signal: AbortSignal.timeout(4000) });
        shutdown = { status: response.status, body: await response.json(), pid: child.pid, port };
        for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i += 1) await delay(250);
      } catch (error) { receipt.shutdownError = error.message; }
    }
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      for (let i = 0; i < 20 && child.exitCode === null && child.signalCode === null; i += 1) await delay(250);
      if (child.exitCode === null && child.signalCode === null) { forced = true; child.kill('SIGKILL'); }
      for (let i = 0; i < 20 && child.exitCode === null && child.signalCode === null; i += 1) await delay(250);
    }
    try { if (context) await context.close(); } catch {}
    try { if (browser) await browser.close(); } catch {}
    receipt.shutdown = shutdown;
    receipt.childClose = await Promise.race([closePromise, delay(1500).then(() => null)]);
    receipt.cleanup = {
      pid: child?.pid || null,
      childExitCode: child?.exitCode ?? null,
      childSignal: child?.signalCode || null,
      forced,
      browserClosed: !browser || !browser.isConnected(),
      portClosed: port === null ? true : await portClosed(port),
      tempProfileRemoved: false,
      gracefulShutdown: !!shutdown && shutdown.status === 200 && child?.exitCode === 0 && !forced
    };
    const fixturePath = path.join(profileDir, 'ltth.app', 'plugins', 'clarityhud');
    if (pluginBefore && fs.existsSync(path.join(APP_ROOT, 'plugins', 'clarityhud'))) {
      receipt.pluginSourceStable = JSON.stringify(inventoryDirectory(path.join(APP_ROOT, 'plugins', 'clarityhud'))) === JSON.stringify(pluginBefore);
    }
    if (fixtureBefore && fs.existsSync(fixturePath)) {
      receipt.fixtureSourceStable = JSON.stringify(inventoryDirectory(fixturePath)) === JSON.stringify(fixtureBefore);
    }
    if (profileDir && fs.existsSync(profileDir)) {
      const tempRoot = fs.realpathSync(os.tmpdir());
      const resolved = fs.realpathSync(profileDir);
      if (path.dirname(resolved) === tempRoot && path.basename(resolved).startsWith(PROFILE_PREFIX)) {
        fs.rmSync(resolved, { recursive: true, force: true });
        receipt.cleanup.tempProfileRemoved = !fs.existsSync(resolved);
      }
    }
    receipt.logTail = output.slice(-40000);
    receipt.pageErrors = pageErrors;
    receipt.consoleErrors = consoleErrors;
    receipt.requestFailures = requestFailures;
    receipt.externalRequestsBlocked = blockedExternal;
    receipt.websocketOrigins = websocketOrigins;
    receipt.sourcePost = SOURCE_PATHS.map(sourceRecord);
    receipt.sourceChanges = sourceBefore.map(before => ({ ...before, afterSha256: sourceRecord(before.path).sha256, stable: before.sha256 === sourceRecord(before.path).sha256 }));
    receipt.allPinnedSourcesStable = receipt.sourceChanges.every(item => item.stable);
    receipt.finishedAtUtc = new Date().toISOString();
    const receiptPath = path.join(evidenceDir, 'receipt.json');
    receipt.receiptPath = path.relative(ROOT, receiptPath).split(path.sep).join('/');
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify({ result: receipt.result, error: receipt.error || null, receipt: receipt.receiptPath, cleanup: receipt.cleanup })}\n`);
  }
  if (receipt.result === 'FAIL') process.exitCode = 1;
}

if (require.main === module) main().catch(error => { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; });
