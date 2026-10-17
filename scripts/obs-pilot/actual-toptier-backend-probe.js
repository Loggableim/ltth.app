'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { chromium } = require('../../app/node_modules/playwright');
const { io } = require('../../app/node_modules/socket.io-client');
const { prepareDocsPluginFixture } = require('../lib/docs-capture-plugin-fixture');
const { createDocsCaptureChildEnvironment } = require('../lib/docs-capture-child-env');
const ROOT = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
  assert.equal(process.versions.node, '22.14.0');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-actual-toptier-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const pluginDir = prepareDocsPluginFixture(ROOT, profile, ['toptier']);
  const files = ['app/server.js', 'app/modules/plugin-loader.js', 'app/modules/plugin-identities.js', 'app/modules/database.js', 'app/modules/i18n.js', 'app/routes/locale.js', 'app/modules/docs-capture-policy.js', 'scripts/lib/docs-capture-child-env.js', 'scripts/lib/docs-capture-plugin-fixture.js', 'scripts/obs-pilot/actual-toptier-backend-probe.js', 'app/package-lock.json', 'app/node_modules/socket.io/client-dist/socket.io.js', 'app/public/js/i18n-client.js', ...['main.js', 'plugin.json', 'overlay.html', 'assets/overlay.js', 'assets/overlay.css', 'assets/animations.css', 'backend/db.js', 'backend/session-manager.js', 'backend/score-engine.js', 'backend/decay-scheduler.js', ...['de', 'en', 'es', 'fr'].map(locale => `locales/${locale}.json`)].map(file => `app/plugins/toptier/${file}`)];
  const evidence = { schemaVersion: 1, scope: 'actual maintained backend; isolated TopTier only; not OBS', startedAt: new Date().toISOString(), profile, port, sourceHashes: {}, fixtureHashes: {}, steps: [], runtime: { node: process.versions.node, socketIo: require('../../app/node_modules/socket.io/package.json').version } };
  for (const file of files) {
    evidence.sourceHashes[file] = hash(path.join(ROOT, file));
    if (file.startsWith('app/plugins/toptier/') && !file.endsWith('plugin.json')) {
      evidence.fixtureHashes[file] = hash(path.join(pluginDir, 'toptier', file.slice('app/plugins/toptier/'.length)));
      assert.equal(evidence.fixtureHashes[file], evidence.sourceHashes[file]);
    }
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/toptier/plugin.json')));
  const staged = JSON.parse(fs.readFileSync(path.join(pluginDir, 'toptier/plugin.json')));
  evidence.stagedManifestHash = hash(path.join(pluginDir, 'toptier/plugin.json'));
  staged.enabled = manifest.enabled;
  assert.deepEqual(staged, manifest);
  let child; let browser; let socket; let output = '';
  try {
    child = spawn(process.execPath, [path.join(ROOT, 'app/server.js')], { cwd: path.join(ROOT, 'app'), env: createDocsCaptureChildEnvironment({ profileDir: profile, port, pluginDir, allowedPluginIds: ['toptier'] }), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    evidence.pid = child.pid;
    let spawnError;
    child.on('error', error => { spawnError = error; });
    child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw Error('Backend exited before readiness');
      try { ready = (await fetch(origin + '/config', { signal: AbortSignal.timeout(500) })).status === 200; } catch (_) {}
      if (ready) break;
      await pause(250);
    }
    assert(ready);
    const api = async (route, method = 'GET', body) => {
      const response = await fetch(origin + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      const result = await response.json(); evidence.steps.push({ route, method, status: response.status, result });
      assert.equal(response.status, 200); assert.equal(result.success, true); return result;
    };
    const config = (await api('/config')).config;
    await api('/config', 'POST', { ...config, decay: { ...config.decay, enabled: false } });
    evidence.inactiveBoard = await api('/board/likes');
    assert.equal(evidence.inactiveBoard.active, false); assert.deepEqual(evidence.inactiveBoard.board, []);
    await api('/session/current');
    const response = await fetch(origin + '/plugins/toptier/overlay.html?board=likes&lang=de');
    const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(response.status, 200);
    evidence.servedHtmlHash = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(evidence.servedHtmlHash, evidence.sourceHashes['app/plugins/toptier/overlay.html']);
    socket = io(origin, { transports: ['websocket'], reconnection: false });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    evidence.browserErrors = []; page.on('pageerror', error => evidence.browserErrors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/plugins/toptier/overlay.html?board=both&variant=combined&lang=de');
    await page.locator('.tt-no-entries').first().waitFor();
    evidence.initialEmpty = await page.locator('.tt-no-entries').first().textContent();
    evidence.initialEmptyLabels = await page.locator('.tt-no-entries').allTextContents();
    evidence.initialBoardLabels = await page.locator('.tt-board-title').allTextContents();
    const initialCatalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'app/plugins/toptier/locales/de.json'), 'utf8')).plugins.toptier.toptier.ui;
    assert.equal(evidence.initialEmpty, initialCatalog.messages.no_entries);
    assert.deepEqual(evidence.initialEmptyLabels, [initialCatalog.messages.no_entries, initialCatalog.messages.no_entries]);
    assert.deepEqual(evidence.initialBoardLabels, [`❤️ ${initialCatalog.navigation.likes}`, `🎁 ${initialCatalog.navigation.gifts}`]);
    const event = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('No actual TopTier update')), 5000);
      socket.on('toptier:update', data => { if (data.entries?.some(entry => entry.username === 'Owned_TopTier_Probe')) { clearTimeout(timeout); resolve(data); } });
    });
    await api('/test-event', 'POST', { board: 'likes', username: 'Owned_TopTier_Probe', score: 25 });
    evidence.actualUpdate = await event;
    await page.locator('[data-username="Owned_TopTier_Probe"]').waitFor();
    assert.equal(await page.locator('.tt-score').first().textContent(), '25');
    assert.equal(await page.locator('.tt-no-entries').count(), 1);
    evidence.locales = [];
    for (const locale of ['de', 'en', 'es', 'fr']) {
      await api('/api/i18n/current', 'POST', { locale });
      const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, `app/plugins/toptier/locales/${locale}.json`)));
      const ui = catalogue.plugins.toptier.toptier.ui;
      const title = catalogue.plugins.toptier.labels.toptier_overlay;
      await page.waitForFunction(title => document.title === title, title);
      assert.equal(await page.locator('.tt-score').first().textContent(), '25');
      const boardLabels = await page.locator('.tt-board-title').allTextContents();
      const emptyLabels = await page.locator('.tt-no-entries').allTextContents();
      assert.deepEqual(boardLabels, [`❤️ ${ui.navigation.likes}`, `🎁 ${ui.navigation.gifts}`]);
      assert.deepEqual(emptyLabels, [ui.messages.no_entries]);
      assert.equal(await page.locator('.tt-name').first().textContent(), 'Owned_TopTier_Probe');
      evidence.locales.push({ locale, title: await page.title(), boardLabels, emptyLabels, score: '25', name: await page.locator('.tt-name').first().textContent(), sessionId: evidence.actualUpdate.sessionId });
    }
    const screenshot = path.join(ROOT, 'output/playwright/actual-toptier', `fr-${crypto.randomUUID()}.png`);
    fs.mkdirSync(path.dirname(screenshot), { recursive: true }); await page.screenshot({ path: screenshot });
    evidence.screenshot = { path: screenshot, bytes: fs.statSync(screenshot).size, sha256: hash(screenshot) };
    assert.deepEqual(evidence.browserErrors, []);
    evidence.restAfterTestEvent = await api('/board/likes');
    assert.deepEqual(evidence.restAfterTestEvent.board, []);
    evidence.limitations = ['No real LIVE adapter/session; REST board intentionally inactive despite local test-event socket update', 'Not OBS acceptance'];
    evidence.result = 'PASS_LIMITED';
  } catch (error) { evidence.result = 'FAIL'; evidence.error = error.message; process.exitCode = 1; }
  finally {
    if (browser) { await browser.close(); evidence.browserClosed = !browser.isConnected(); }
    socket?.disconnect();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try { const response = await fetch(origin + '/api/shutdown', { method: 'POST', headers: { Origin: origin }, signal: AbortSignal.timeout(3000) }); evidence.shutdown = { status: response.status, body: await response.json() }; } catch (error) { evidence.shutdownError = error.message; }
      for (let i = 0; i < 32 && child.exitCode === null && child.signalCode === null; i++) await pause(250);
      if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); evidence.forced = true; await pause(500); }
    }
    const portClosed = await new Promise(resolve => { const connection = net.connect({ host: '127.0.0.1', port }); connection.once('connect', () => { connection.destroy(); resolve(false); }); connection.once('error', error => resolve(error.code === 'ECONNREFUSED')); connection.setTimeout(1000, () => { connection.destroy(); resolve(false); }); });
    evidence.postSourceHashes = Object.fromEntries(files.map(file => [file, hash(path.join(ROOT, file))]));
    evidence.sourceStable = files.every(file => evidence.postSourceHashes[file] === evidence.sourceHashes[file]);
    evidence.cleanup = { exitCode: child?.exitCode, signal: child?.signalCode, portClosed, graceful: child?.exitCode === 0 && output.includes('[TopTier] Plugin destroyed') && output.includes('Server closed') && !output.includes('Graceful shutdown timed out') };
    if (!evidence.sourceStable || !portClosed || !evidence.cleanup.graceful) { evidence.result = 'FAIL'; evidence.error ||= 'Source stability or cleanup not confirmed'; process.exitCode = 1; }
    fs.writeFileSync(path.join(profile, 'backend-output.txt'), output);
    evidence.finishedAt = new Date().toISOString();
    const receipt = path.join(ROOT, 'docs/coordination/evidence', `actual-toptier-${crypto.randomUUID()}.json`);
    fs.writeFileSync(receipt, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ receipt, result: evidence.result, error: evidence.error, cleanup: evidence.cleanup }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
