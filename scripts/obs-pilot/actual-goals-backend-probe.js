'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { chromium } = require('../../app/node_modules/playwright');
const { prepareDocsPluginFixture } = require('../lib/docs-capture-plugin-fixture');
const { createDocsCaptureChildEnvironment, isPathInside } = require('../lib/docs-capture-child-env');

const ROOT = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const sha256 = input => crypto.createHash('sha256').update(input).digest('hex');
const hashFile = file => sha256(fs.readFileSync(file));
const expectedCore = {
  'app/server.js': '447da4e10d9d38337169fb61f640d8a1a62a0b5246c81909a70860d28da35aac',
  'app/modules/database.js': '483f24d4f0066a2fddcfe68eca517b98c57aaf8d490efc31806317970d76982c'
};

async function main() {
  assert.equal(process.versions.node, '22.14.0');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-actual-goals-'));
  const reservation = net.createServer();
  await new Promise((resolve, reject) => reservation.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const pluginDir = prepareDocsPluginFixture(ROOT, profile, ['goals']);
  const goalFiles = [
    'main.js', 'plugin.json', 'backend/api.js', 'backend/database.js', 'backend/websocket.js',
    'backend/event-handlers.js', 'engine/state-machine.js', 'engine/templates/compact-bar.js',
    'overlay/index.html', 'overlay/overlay.js',
    ...['de', 'en', 'es', 'fr'].map(locale => `locales/${locale}.json`)
  ].map(file => `app/plugins/goals/${file}`);
  const files = [
    ...Object.keys(expectedCore), 'app/modules/plugin-loader.js', 'app/modules/plugin-identities.js',
    'app/modules/i18n.js', 'app/modules/docs-capture-policy.js',
    'app/modules/public-overlay-payload-projection.js', 'app/modules/public-overlay-access.js',
    'app/modules/public-overlay-socket-adapter.js', 'app/routes/locale.js',
    'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js',
    'scripts/obs-pilot/actual-goals-backend-probe.js', 'app/package-lock.json',
    'app/node_modules/socket.io/client-dist/socket.io.js', 'app/public/js/i18n-client.js',
    ...goalFiles
  ];
  const evidence = {
    schemaVersion: 1,
    scope: 'isolated local Goals backend and original overlay renderer; not public or OBS acceptance',
    startedAt: new Date().toISOString(),
    profile: path.basename(profile),
    port,
    sourceHashes: {},
    fixtureHashes: {},
    steps: [],
    runtime: { node: process.versions.node, socketIo: require('../../app/node_modules/socket.io/package.json').version },
    networkPolicy: '127.0.0.1 only; browser requests outside loopback origin aborted'
  };
  for (const file of files) {
    const digest = hashFile(path.join(ROOT, file));
    evidence.sourceHashes[file] = digest;
    if (expectedCore[file]) assert.equal(digest, expectedCore[file], `${file} source pin drift`);
    if (file.startsWith('app/plugins/goals/')) {
      const fixtureFile = path.join(pluginDir, 'goals', file.slice('app/plugins/goals/'.length));
      evidence.fixtureHashes[file] = hashFile(fixtureFile);
      if (file.endsWith('/plugin.json')) {
        const originalManifest = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
        const stagedManifest = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
        assert.deepEqual(stagedManifest, { ...originalManifest, enabled: true });
      } else {
        assert.equal(evidence.fixtureHashes[file], digest, `staged fixture drift: ${file}`);
      }
    }
  }

  let child;
  let browser;
  let output = '';
  let shutdownRequested = false;
  try {
    child = spawn(process.execPath, [path.join(ROOT, 'app/server.js')], {
      cwd: path.join(ROOT, 'app'),
      env: createDocsCaptureChildEnvironment({ profileDir: profile, port, pluginDir, allowedPluginIds: ['goals'] }),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    evidence.pid = child.pid;
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.on('data', data => { output += data.toString(); });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw Error(`Backend exited before readiness (${child.exitCode})`);
      try { ready = (await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) })).status === 200; } catch (_) {}
      if (ready) break;
      await pause(250);
    }
    assert(ready, 'isolated backend did not become ready');
    evidence.steps.push({ route: '/api/health', method: 'GET', status: 200, purpose: 'local readiness' });

    const api = async (route, method = 'GET', body) => {
      const response = await fetch(`${origin}${route}`, {
        method,
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(8000)
      });
      const type = response.headers.get('content-type') || '';
      const result = type.includes('application/json') ? await response.json() : await response.text();
      const step = { route, method, status: response.status };
      if (result && typeof result === 'object') {
        if (result.goal) step.result = { success: result.success === true, goal: { id: result.goal.id, name: result.goal.name, goal_type: result.goal.goal_type, current_value: result.goal.current_value, target_value: result.goal.target_value } };
        else if (typeof result.locale === 'string') step.result = { success: result.success === true, locale: result.locale };
        else if (result.success === true) step.result = { success: true };
      }
      evidence.steps.push(step);
      assert.equal(response.status, 200, `${method} ${route}: ${JSON.stringify(result).slice(0, 300)}`);
      return result;
    };

    const created = await api('/api/goals', 'POST', {
      name: 'Owned Local Fixture Goal', goal_type: 'coin', current_value: 25, target_value: 100,
      start_value: 0, template_id: 'compact-bar', enabled: true,
      theme: { primaryColor: '#22c55e', secondaryColor: '#3b82f6', textColor: '#ffffff', bgColor: 'rgba(15, 23, 42, 0.95)' }
    });
    assert.equal(created.success, true);
    const goalId = created.goal.id;
    evidence.goalFixture = { created: true, name: created.goal.name, type: created.goal.goal_type, initialValue: created.goal.current_value, target: created.goal.target_value };
    let fetched = await api(`/api/goals/${encodeURIComponent(goalId)}`);
    assert.equal(fetched.goal.current_value, 25);
    evidence.goalFixture.readBack = { name: fetched.goal.name, currentValue: fetched.goal.current_value };

    const overlayUrl = `${origin}/goals/overlay?id=${encodeURIComponent(goalId)}&lang=de`;
    const served = await fetch(overlayUrl, { signal: AbortSignal.timeout(5000) });
    const servedBytes = Buffer.from(await served.arrayBuffer());
    assert.equal(served.status, 200);
    evidence.servedOverlay = { status: served.status, urlPath: '/goals/overlay', sha256: sha256(servedBytes) };
    assert.equal(evidence.servedOverlay.sha256, evidence.sourceHashes['app/plugins/goals/overlay/index.html']);

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    evidence.browserErrors = [];
    page.on('close', () => { evidence.pageClosedEarly = evidence.probePhase !== 'cleanup'; });
    page.on('crash', () => { evidence.pageCrashed = true; });
    page.on('pageerror', error => evidence.browserErrors.push(error.message));
    await page.route('**/*', route => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin === origin) return route.continue();
      evidence.browserErrors.push(`blocked non-loopback request: ${requestUrl.origin}`);
      return route.abort();
    });
    await page.goto(overlayUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('.compact-bar-name').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('.compact-bar-values')?.textContent.includes('25 / 100'));
    assert.equal(await page.locator('.compact-bar-name').textContent(), 'Owned Local Fixture Goal');
    evidence.rendererInitial = { title: await page.title(), name: await page.locator('.compact-bar-name').textContent(), value: await page.locator('.compact-bar-values').textContent() };
    await page.evaluate(() => {
      window.__goalsValueEvents = [];
      window.__goalsSubscriptions = [];
      window.socket.on('goals:value-changed', data => window.__goalsValueEvents.push({ goalId: data.goalId, currentValue: data.goal?.current_value, targetValue: data.goal?.target_value }));
      window.socket.on('goals:subscribed', data => window.__goalsSubscriptions.push({ goalId: data.goalId, currentValue: data.goal?.current_value, targetValue: data.goal?.target_value }));
    });

    const incremented = await api(`/api/goals/${encodeURIComponent(goalId)}/increment`, 'POST', { amount: 5 });
    assert.equal(incremented.success, true);
    fetched = await api(`/api/goals/${encodeURIComponent(goalId)}`);
    assert.equal(fetched.goal.current_value, 30);
    await page.waitForFunction(() => document.querySelector('.compact-bar-values')?.textContent.includes('30 / 100'));
    evidence.rendererAfterUpdate = { name: await page.locator('.compact-bar-name').textContent(), value: await page.locator('.compact-bar-values').textContent() };
    evidence.onlineUpdateCorrelation = await page.evaluate(() => ({ socketEventCount: window.__goalsValueEvents.length, packet: window.__goalsValueEvents.at(-1) || null }));
    assert.equal(evidence.onlineUpdateCorrelation.packet?.goalId, goalId);
    assert.equal(evidence.onlineUpdateCorrelation.packet?.currentValue, 30);

    evidence.localeChanges = [];
    for (const locale of ['de', 'en', 'es', 'fr']) {
      evidence.probePhase = `locale-${locale}`;
      const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/goals/locales/${locale}.json`), 'utf8'));
      const remainingText = (catalogue.plugins.goals.goals.overlay.remaining || '').replace('{value}', '70');
      const localeResponse = await api('/api/i18n/current', 'POST', { locale });
      assert.equal(localeResponse.locale, locale);
      await page.waitForFunction(expected => window.i18n?.getLocale?.() === expected.locale
        && document.documentElement.lang === expected.locale
        && document.querySelector('.compact-bar-remaining')?.textContent.trim() === expected.remainingText,
      { locale, remainingText }, { timeout: 12000 });
      assert.equal(await page.locator('.compact-bar-name').textContent(), 'Owned Local Fixture Goal');
      assert.equal(await page.locator('.compact-bar-values').textContent(), '30 / 100');
      assert.equal((await page.locator('.compact-bar-remaining').textContent()).trim(), remainingText);
      evidence.localeChanges.push({ serverLocale: localeResponse.locale, clientLocale: await page.evaluate(() => window.i18n.getLocale()), htmlLang: await page.locator('html').getAttribute('lang'), title: await page.title(), name: await page.locator('.compact-bar-name').textContent(), value: await page.locator('.compact-bar-values').textContent(), remainingText: (await page.locator('.compact-bar-remaining').textContent()).trim() });
    }

    evidence.probePhase = 'disconnect';
    await page.evaluate(() => {
      window.__goalsReconnects = 0;
      window.__goalsDisconnects = 0;
      window.socket.on('connect', () => { window.__goalsReconnects += 1; });
      window.socket.on('disconnect', () => { window.__goalsDisconnects += 1; });
      window.socket.disconnect();
    });
    await page.waitForFunction(() => window.socket?.connected === false && window.__goalsDisconnects === 1, null, { timeout: 10000 });
    await page.locator('.goal-overlay-error').waitFor({ state: 'visible', timeout: 5000 });
    evidence.probePhase = 'offline-update';
    const offlineIncrement = await api(`/api/goals/${encodeURIComponent(goalId)}/increment`, 'POST', { amount: 5 });
    assert.equal(offlineIncrement.goal.current_value, 35);
    const offlineRead = await api(`/api/goals/${encodeURIComponent(goalId)}`);
    assert.equal(offlineRead.goal.current_value, 35);
    await pause(300);
    evidence.offlineUpdate = { persistedValue: offlineRead.goal.current_value, socketEventCountWhileDisconnected: await page.evaluate(() => window.__goalsValueEvents.length), unavailableNoticeVisible: await page.locator('.goal-overlay-error').isVisible() };
    assert.equal(evidence.offlineUpdate.socketEventCountWhileDisconnected, 1);
    assert.equal(evidence.offlineUpdate.unavailableNoticeVisible, true);
    evidence.probePhase = 'reconnect';
    await page.evaluate(() => window.socket.connect());
    await page.waitForFunction(() => window.socket?.connected === true && window.__goalsReconnects === 1, null, { timeout: 12000 });
    await page.waitForFunction(() => window.__goalsSubscriptions.at(-1)?.currentValue === 35, null, { timeout: 12000 });
    await page.waitForFunction(() => document.querySelector('.compact-bar-values')?.textContent.includes('35 / 100'), null, { timeout: 12000 });
    evidence.reconnect = { connected: await page.evaluate(() => window.socket.connected), connectCount: await page.evaluate(() => window.__goalsReconnects), disconnectCount: await page.evaluate(() => window.__goalsDisconnects), subscriptionPacket: await page.evaluate(() => window.__goalsSubscriptions.at(-1)), name: await page.locator('.compact-bar-name').textContent(), value: await page.locator('.compact-bar-values').textContent(), remainingText: (await page.locator('.compact-bar-remaining').textContent()).trim(), clientLocale: await page.evaluate(() => window.i18n.getLocale()) };
    assert.equal(evidence.reconnect.name, 'Owned Local Fixture Goal');
    assert.equal(evidence.reconnect.value, '35 / 100');
    assert.equal(evidence.reconnect.subscriptionPacket?.goalId, goalId);
    assert.equal(evidence.reconnect.subscriptionPacket?.currentValue, 35);
    const frCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/goals/locales/fr.json'), 'utf8'));
    assert.equal(evidence.reconnect.remainingText, frCatalog.plugins.goals.goals.overlay.remaining.replace('{value}', '65'));

    await page.addStyleTag({ content: 'html, body { background-color: #0b1020 !important; }' });
    const screenshot = path.join(ROOT, 'output/playwright/actual-goals', `de-${crypto.randomUUID()}.png`);
    fs.mkdirSync(path.dirname(screenshot), { recursive: true });
    await page.screenshot({ path: screenshot });
    evidence.screenshot = { path: path.relative(ROOT, screenshot).replace(/\\/g, '/'), bytes: fs.statSync(screenshot).size, sha256: hashFile(screenshot), contrastOnly: true };
    assert.deepEqual(evidence.browserErrors, []);
  } catch (error) {
    evidence.result = 'FAIL';
    evidence.error = error.stack || error.message;
    process.exitCode = 1;
  } finally {
    if (browser) {
      evidence.probePhase = 'cleanup';
      try { await browser.close(); } catch (error) { evidence.browserCloseError = error.message; }
      evidence.browserClosed = !browser.isConnected();
    }
    if (child && child.exitCode === null && !child.killed) {
      try {
        const response = await fetch(`${origin}/api/shutdown`, {
          method: 'POST', headers: { Origin: origin }, signal: AbortSignal.timeout(2500)
        });
        shutdownRequested = response.status === 200;
        evidence.shutdownRequest = { status: response.status, graceful: shutdownRequested };
      } catch (error) {
        evidence.shutdownRequest = { error: error.message, graceful: false };
      }
      if (shutdownRequested) {
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(12000)]);
      }
      if (child.exitCode === null) {
        evidence.forcedStop = 'SIGTERM after graceful shutdown did not exit within 12 seconds';
        child.kill('SIGTERM');
        await Promise.race([new Promise(resolve => child.once('exit', resolve)), pause(4000)]);
      }
      evidence.exitCode = child.exitCode;
      evidence.signal = child.signalCode;
    }
    if (evidence.exitCode === 0 && child) {
      const databasePath = path.join(profile, 'ltth.app', 'user_configs', 'default.db');
      try {
        const Database = require('../../app/node_modules/better-sqlite3');
        const database = new Database(databasePath, { readonly: true, fileMustExist: true });
        const quickCheck = database.pragma('quick_check');
        const persistedFixture = database.prepare('SELECT current_value, target_value FROM goals WHERE name = ?').get('Owned Local Fixture Goal');
        database.close();
        evidence.tempDatabase = { quickCheck: quickCheck[0]?.quick_check, fixtureCurrentValue: persistedFixture?.current_value, fixtureTargetValue: persistedFixture?.target_value };
      } catch (error) {
        evidence.tempDatabase = { error: error.message };
      }
    }
    evidence.serverLogSignals = {
      gracefulClose: /Server closed|server closed|Shutting down/i.test(output),
      forcedShutdown: /force(?:d)? shutdown|force exit|Forced exit/i.test(output),
      tail: output.slice(-5000)
    };
    const probe = net.connect({ host: '127.0.0.1', port });
    evidence.portClosed = await new Promise(resolve => {
      probe.once('connect', () => { probe.destroy(); resolve(false); });
      probe.once('error', () => resolve(true));
      setTimeout(() => { probe.destroy(); resolve(false); }, 1500).unref();
    });
    for (const file of files) evidence.postSourceHashes = evidence.postSourceHashes || {}, evidence.postSourceHashes[file] = hashFile(path.join(ROOT, file));
    evidence.sourceStable = files.every(file => evidence.sourceHashes[file] === evidence.postSourceHashes[file]);
    try {
      const tempRoot = path.resolve(os.tmpdir());
      const profilePath = path.resolve(profile);
      assert(isPathInside(tempRoot, profilePath));
      assert(path.basename(profilePath).startsWith('ltth-actual-goals-'));
      fs.rmSync(profilePath, { recursive: true, force: false });
      evidence.profileRemoved = !fs.existsSync(profilePath);
    } catch (error) {
      evidence.profileRemoved = false;
      evidence.profileCleanupError = error.message;
    }
    if (evidence.result !== 'FAIL' && evidence.sourceStable && evidence.exitCode === 0 && evidence.portClosed && evidence.profileRemoved && evidence.tempDatabase?.quickCheck === 'ok' && evidence.tempDatabase?.fixtureCurrentValue === 35 && !evidence.serverLogSignals.forcedShutdown) evidence.result = 'PASS_LOCAL_ONLY';
    else if (evidence.result !== 'FAIL') {
      evidence.result = 'PARTIAL';
      if (!evidence.sourceStable) evidence.error = 'source hash changed during isolated run';
    }
    const receiptPath = path.join(ROOT, 'docs/coordination/evidence', `actual-goals-${crypto.randomUUID()}.json`);
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    const summaryLine = `${JSON.stringify({ result: evidence.result, receipt: path.relative(ROOT, receiptPath), profile: evidence.profile, port, exitCode: evidence.exitCode, sourceStable: evidence.sourceStable, portClosed: evidence.portClosed, forcedShutdown: evidence.serverLogSignals?.forcedShutdown })}\n`;
    process.stdout.write(summaryLine, () => process.exit(process.exitCode || 0));
    if (evidence.result !== 'PASS_LOCAL_ONLY') process.exitCode = 1;
  }
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
