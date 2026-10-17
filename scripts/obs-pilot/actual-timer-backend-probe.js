'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const assert = require('assert/strict');
const { spawn } = require('child_process');
const { io } = require('../../app/node_modules/socket.io-client');
const { prepareDocsPluginFixture } = require('../lib/docs-capture-plugin-fixture');
const { createDocsCaptureChildEnvironment } = require('../lib/docs-capture-child-env');
const root = path.resolve(__dirname, '../..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  assert.equal(process.versions.node.split('.')[0], '22', 'Use bundled Node 22');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-actual-timer-probe-'));
  const reservation = net.createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const pluginDir = prepareDocsPluginFixture(root, profileDir, ['advanced-timer']);
  const env = createDocsCaptureChildEnvironment({ profileDir, port, pluginDir, allowedPluginIds: ['advanced-timer'] });
  const evidence = { schemaVersion: 1, startedAt: new Date().toISOString(), scope: 'actual maintained backend; isolated Timer only; not OBS', profileDir, port, steps: [], sourceHashes: {} };
  const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  evidence.fixtureHashes = {};
  evidence.runtime = { node: process.versions.node, socketIoVersion: require('../../app/node_modules/socket.io/package.json').version };
  const requiredSources = require('./actual-backend-summary').REQUIRED_SOURCES;
  for (const file of requiredSources) evidence.sourceHashes[file] = digest(path.join(root, file));
  const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, 'app/plugins/advanced-timer/plugin.json'), 'utf8'));
  const stagedManifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'advanced-timer/plugin.json'), 'utf8'));
  stagedManifest.enabled = sourceManifest.enabled;
  evidence.stagedManifest = { sha256: digest(path.join(pluginDir, 'advanced-timer/plugin.json')), sourceMatchesExceptEnabled: JSON.stringify(sourceManifest) === JSON.stringify(stagedManifest) };
  for (const file of requiredSources.filter(file => file.startsWith('app/plugins/') && !file.endsWith('plugin.json'))) {
    evidence.fixtureHashes[file] = digest(path.join(pluginDir, 'advanced-timer', file.slice('app/plugins/advanced-timer/'.length)));
    assert.equal(evidence.fixtureHashes[file], evidence.sourceHashes[file]);
  }
  for (const file of ['app/server.js', 'app/plugins/advanced-timer/main.js', 'app/plugins/advanced-timer/backend/api.js', 'app/plugins/advanced-timer/backend/websocket.js']) {
    evidence.sourceHashes[file] = digest(path.join(root, file));
    if (file.startsWith('app/plugins/advanced-timer/')) {
      evidence.fixtureHashes[file] = digest(path.join(pluginDir, 'advanced-timer', file.slice('app/plugins/advanced-timer/'.length)));
      assert.equal(evidence.fixtureHashes[file], evidence.sourceHashes[file], 'Copied plugin differs from source');
    }
  }
  let child;
  let socket;
  let browser;
  let page;
  let output = '';
  let phase = 'starting-backend';
  try {
    child = spawn(path.join(root, 'runtime/node/node.exe'), [path.join(root, 'app/server.js')], { cwd: path.join(root, 'app'), env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    evidence.pid = child.pid;
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    let spawnError;
    child.on('error', error => { spawnError = error; });
    const origin = `http://127.0.0.1:${port}`;
    const api = async (route, method = 'GET', body) => {
      phase = `${method} ${route}`;
      const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', Origin: origin }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
      const result = await response.json();
      evidence.steps.push({ route, method, status: response.status, result });
      assert.equal(response.status, 200);
      assert.equal(result.success, true);
      return result;
    };
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error(`Backend exited early ${child.exitCode}`);
      try { const response = await fetch(origin + '/api/advanced-timer/timers', { signal: AbortSignal.timeout(500) }); ready = response.status === 200; } catch (_) {}
      if (ready) break;
      await delay(250);
    }
    assert(ready, 'Timer API failed to become ready');
    socket = io(origin, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const id = 'owned-actual-timer-probe';
    await api('/api/advanced-timer/timers', 'POST', { id, name: 'Owned synthetic backend timer', mode: 'countdown', initial_duration: 90, config: {} });
    assert.equal((await api(`/api/advanced-timer/timers/${id}`)).timer.current_value, 90);
    await api(`/api/advanced-timer/timers/${id}`, 'PUT', { name: 'Owned updated timer' });
    assert.equal((await api(`/api/advanced-timer/timers/${id}`)).timer.name, 'Owned updated timer');
    if (process.argv.includes('--renderer')) {
      const { chromium } = require('../../app/node_modules/playwright');
      const sourceFiles = ['app/plugins/advanced-timer/overlay.html', 'app/plugins/advanced-timer/overlay/overlay.js', 'app/public/js/i18n-client.js'];
      for (const file of sourceFiles) {
        evidence.sourceHashes[file] = digest(path.join(root, file));
        if (file.startsWith('app/plugins/advanced-timer/')) {
          evidence.fixtureHashes[file] = digest(path.join(pluginDir, 'advanced-timer', file.slice('app/plugins/advanced-timer/'.length)));
          assert.equal(evidence.fixtureHashes[file], evidence.sourceHashes[file]);
        }
      }
      phase = `GET /advanced-timer/overlay?timer=${id}&lang=de`;
      // This byte witness owns a fresh connection after synchronous browser imports.
      // Do not retry or reuse an idle Undici connection across that blocking gap.
      const witness = await new Promise((resolve, reject) => {
        const request = http.get(origin + `/advanced-timer/overlay?timer=${id}&lang=de`, { agent: false }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => { clearTimeout(deadline); resolve({ status: response.statusCode, body: Buffer.concat(chunks) }); });
        });
        const deadline = setTimeout(() => request.destroy(new Error('HTML witness deadline exceeded after 5000ms')), 5000);
        request.on('error', error => { clearTimeout(deadline); reject(error); });
      });
      const html = witness.body;
      evidence.htmlWitnessTransport = { protocol: 'HTTP', freshConnection: true, agent: false, deadlineMs: 5000, retries: 0, status: witness.status, bytes: html.length };
      assert.equal(witness.status, 200);
      evidence.servedHtmlHash = crypto.createHash('sha256').update(html).digest('hex');
      assert.equal(evidence.servedHtmlHash, evidence.sourceHashes[sourceFiles[0]]);
      browser = await chromium.launch({ headless: true });
      page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      evidence.browserErrors = [];
      page.on('pageerror', error => evidence.browserErrors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.goto(origin + `/advanced-timer/overlay?timer=${id}&lang=de`);
      await page.locator('.timer-display').waitFor();
      assert.equal(await page.locator('.timer-display').textContent(), '01:30');
      evidence.renderer = { initial: '01:30', canonicalRoute: '/advanced-timer/overlay' };
    }
    const tick = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error('No matching actual backend tick')), 5000);
      socket.on('advanced-timer:tick', data => { if (data.id === id) { clearTimeout(deadline); resolve(data); } });
    });
    await api(`/api/advanced-timer/timers/${id}/start`, 'POST');
    evidence.tick = await tick;
    assert(evidence.tick.currentValue < 90 && evidence.tick.currentValue > 80);
    if (page) {
      await page.waitForFunction(() => document.querySelector('.timer-display')?.textContent === '01:29');
      evidence.renderer.running = await page.locator('.timer-display').textContent();
    }
    await api(`/api/advanced-timer/timers/${id}/pause`, 'POST');
    assert.equal((await api(`/api/advanced-timer/timers/${id}`)).timer.state, 'paused');
    if (page) {
      await page.locator('.timer-display.state-paused').waitFor();
      evidence.renderer.paused = await page.locator('.timer-display').textContent();
      evidence.renderer.locales = [];
      for (const locale of ['de', 'en', 'es', 'fr']) {
        const catalogueFile = `app/plugins/advanced-timer/locales/${locale}.json`;
        evidence.sourceHashes[catalogueFile] = digest(path.join(root, catalogueFile));
        evidence.fixtureHashes[catalogueFile] = digest(path.join(pluginDir, 'advanced-timer', 'locales', `${locale}.json`));
        assert.equal(evidence.fixtureHashes[catalogueFile], evidence.sourceHashes[catalogueFile]);
        const catalogue = JSON.parse(fs.readFileSync(path.join(root, catalogueFile), 'utf8'));
        await api('/api/i18n/current', 'POST', { locale });
        await page.waitForFunction(locale => window.i18n?.currentLocale === locale, locale);
        const expectedTitle = catalogue.plugins['advanced-timer'].labels.timer_overlay;
        await page.waitForFunction(title => document.title === title, expectedTitle);
        assert.equal(await page.locator('.timer-display').textContent(), evidence.renderer.paused);
        await page.locator('.timer-display.state-paused').waitFor();
        evidence.renderer.locales.push({ locale, title: await page.title(), value: evidence.renderer.paused, state: 'paused' });
      }
      await page.evaluate(() => window.socket.disconnect());
      await page.waitForFunction(() => !window.socket.connected);
      await api(`/api/advanced-timer/timers/${id}/add-time`, 'POST', { seconds: 10 });
      const missed = (await api(`/api/advanced-timer/timers/${id}`)).timer;
      assert.equal(await page.locator('.timer-display').textContent(), evidence.renderer.paused);
      await page.evaluate(() => window.socket.connect());
      await page.waitForFunction(() => window.socket.connected);
      await page.waitForFunction(() => document.querySelector('.timer-display')?.textContent === '01:39');
      evidence.renderer.reconnect = { staleValue: evidence.renderer.paused, backendValue: missed.current_value, restoredValue: await page.locator('.timer-display').textContent(), fault: 'owned real client disconnect, missed actual API add-time update, real reconnect' };
    }
    await api(`/api/advanced-timer/timers/${id}/reset`, 'POST');
    assert.equal((await api(`/api/advanced-timer/timers/${id}`)).timer.current_value, 90);
    if (page) {
      await page.waitForFunction(() => document.querySelector('.timer-display')?.textContent === '01:30');
      evidence.renderer.reset = await page.locator('.timer-display').textContent();
      const screenshot = path.join(root, 'output/playwright/actual-timer', `reset-fr-${crypto.randomUUID()}.png`);
      fs.mkdirSync(path.dirname(screenshot), { recursive: true });
      await page.screenshot({ path: screenshot });
      evidence.renderer.screenshot = screenshot;
      evidence.renderer.screenshotPin = { bytes: fs.statSync(screenshot).size, sha256: digest(screenshot) };
      evidence.renderer.negativeCases = [];
      for (const query of ['?lang=fr', '?timer=owned-nonexistent-timer&lang=fr']) {
        const negative = await browser.newPage();
        await negative.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await negative.goto(origin + '/advanced-timer/overlay' + query);
        const notFound = query.includes('timer=');
        const selector = notFound ? '.timer-overlay-error' : '#timer-container h1';
        await negative.locator(selector).waitFor();
        const text = await negative.locator(selector).textContent();
        assert.equal(text, notFound ? 'Minuteur introuvable' : 'ID du minuteur manquant');
        assert.equal(await negative.locator('.timer-display').count(), 0);
        evidence.renderer.negativeCases.push({ query, text, timerDisplayAbsent: true });
        await negative.close();
      }
      assert.deepEqual(evidence.browserErrors, []);
    }
    await api(`/api/advanced-timer/timers/${id}`, 'DELETE');
    evidence.result = 'PASS';
  } catch (error) {
    evidence.result = 'FAIL'; evidence.error = error.message;
    evidence.failureDiagnostic = {
      recordedAt: new Date().toISOString(), phase,
      errorName: error.name, stack: error.stack,
      cause: error.cause ? { name: error.cause.name, message: error.cause.message, code: error.cause.code } : null,
      childExitCodeAtFailure: child?.exitCode ?? null,
      childSignalCodeAtFailure: child?.signalCode ?? null,
      backendOutputTailAtFailure: output.slice(-4000)
    };
    process.exitCode = 1;
  } finally {
    if (browser) { await browser.close(); evidence.browserClosed = !browser.isConnected(); }
    socket?.disconnect();
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { Origin: `http://127.0.0.1:${port}` }, signal: AbortSignal.timeout(3000) });
        evidence.shutdownResponse = { status: response.status, body: await response.json(), targetPid: child.pid, targetPort: port };
        for (let attempt = 0; attempt < 32 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
      } catch (error) { evidence.shutdownRequestError = error.message; }
    }
    let forced = false;
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
      if (child.exitCode === null && child.signalCode === null) { forced = true; child.kill('SIGKILL'); }
      for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) await delay(250);
    }
    const portClosed = await new Promise(resolve => {
      const check = net.connect({ host: '127.0.0.1', port });
      check.once('connect', () => { check.destroy(); resolve(false); });
      check.once('error', error => { check.destroy(); resolve(error.code === 'ECONNREFUSED'); });
      check.setTimeout(1500, () => { check.destroy(); resolve(false); });
    });
    evidence.postSourceHashes = Object.fromEntries(Object.keys(evidence.sourceHashes).map(file => [file, digest(path.join(root, file))]));
    evidence.sourceStable = Object.keys(evidence.sourceHashes).every(file => evidence.sourceHashes[file] === evidence.postSourceHashes[file]);
    const gracefulAppShutdownProven = child?.exitCode === 0 && child?.signalCode === null && output.includes('Advanced Timer database closed') && output.includes('Server closed') && !output.includes('Graceful shutdown timed out');
    evidence.cleanup = { socketDisconnected: !socket?.connected, childExitCode: child?.exitCode, childSignalCode: child?.signalCode, terminalConfirmed: !child?.pid || child.exitCode !== null || child.signalCode !== null, forced, portClosed, gracefulAppShutdownProven, profileRetainedForAudit: true };
    if (!portClosed || !evidence.cleanup.terminalConfirmed || !evidence.sourceStable) { evidence.result = 'FAIL'; evidence.error = 'Cleanup or source stability not confirmed'; process.exitCode = 1; }
    evidence.finishedAt = new Date().toISOString();
    fs.writeFileSync(path.join(profileDir, 'backend-output.txt'), output);
    const evidencePath = path.join(root, 'docs/coordination/evidence/actual-timer-backend-probe.json');
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    if (fs.existsSync(evidencePath)) fs.copyFileSync(evidencePath, evidencePath.replace('.json', `-${crypto.randomUUID()}.json`));
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    console.log(JSON.stringify({ result: evidence.result, error: evidence.error, pid: evidence.pid, port, profileDir, evidencePath, cleanup: evidence.cleanup }));
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
