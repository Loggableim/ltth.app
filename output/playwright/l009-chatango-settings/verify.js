const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require(path.join(__dirname, '../../../app/node_modules/playwright'));
const capturePolicy = require('../../../app/modules/docs-capture-policy');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app');
const evidenceDir = __dirname;
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-l009-chatango-'));
const fixtureRoot = path.join(profileRoot, 'docs-capture-app');
const pluginRoot = path.join(fixtureRoot, 'plugins');
const sourcePlugin = path.join(appRoot, 'plugins', 'chatango');
const baseAllowed = new Set([
  '/chatango/ui', '/api/chatango/config', '/api/chatango/embed', '/api/chatango/themes', '/api/chatango/status',
  '/js/i18n-client.js', '/js/theme-manager.js', '/js/lucide.min.js', '/css/themes.css', '/favicon.ico',
  '/socket.io/socket.io.js', '/socket.io/'
]);
let child = null;
let browser = null;
const streams = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function waitExit(processHandle, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (processHandle.exitCode !== null) return resolve({ code: processHandle.exitCode, signal: processHandle.signalCode });
    const timer = setTimeout(() => reject(new Error('Timed out waiting for orderly app shutdown')), timeoutMs);
    processHandle.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

async function startApp(env, baseUrl, run, record) {
  const stdout = fs.createWriteStream(path.join(evidenceDir, `server-${run}.stdout.log`));
  const stderr = fs.createWriteStream(path.join(evidenceDir, `server-${run}.stderr.log`));
  streams.push(stdout, stderr);
  child = spawn(process.execPath, [path.join(appRoot, 'server.js')], {
    cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  child.stdout.pipe(stdout); child.stderr.pipe(stderr);
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const configResponse = await fetch(`${baseUrl}/api/chatango/config`, { signal: AbortSignal.timeout(1200) });
        const data = await configResponse.json();
        if (data.success && data.config) return;
      }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(child.exitCode !== null ? `App exited during startup (${child.exitCode})` : 'Timed out waiting for Chatango config route');
}

async function installGuard(context, baseUrl, record) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const allowed = url.origin === baseUrl && (baseAllowed.has(url.pathname) || /^\/api\/i18n\/translations\/(de|en|es|fr)$/.test(url.pathname));
    record.browserRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}` });
    if (!allowed || !['GET', 'POST'].includes(request.method())) {
      record.blockedRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}` });
      return route.abort('blockedbyclient');
    }
    if (request.method() === 'POST') {
      if (url.pathname.startsWith('/socket.io/')) {
        record.socketPollingRequests = (record.socketPollingRequests || 0) + 1;
        return route.continue();
      }
      if (url.pathname !== '/api/chatango/config') {
        record.blockedRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}` });
        return route.abort('blockedbyclient');
      }
      record.payload = request.postDataJSON();
      record.payloadMatchesProjection = canonical(record.payload) === canonical(record.allowedProjection);
      if (!record.payloadMatchesProjection) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Payload differs from reviewed UI projection' }) });
      }
    }
    await route.continue();
  });
}

async function readForm(page) {
  return page.evaluate(() => ({
    enabled: document.getElementById('enabled').checked,
    roomHandle: document.getElementById('roomHandle').value,
    theme: document.getElementById('theme').value,
    fontSize: document.getElementById('fontSize').value,
    allowPM: document.getElementById('allowPM').checked,
    showTicker: document.getElementById('showTicker').checked,
    dashboardEnabled: document.getElementById('dashboardEnabled').checked,
    widgetEnabled: document.getElementById('widgetEnabled').checked,
    widgetPosition: document.getElementById('widgetPosition').value,
    widgetWidth: Number.parseInt(document.getElementById('widgetWidth').value, 10),
    widgetHeight: Number.parseInt(document.getElementById('widgetHeight').value, 10),
    collapsedWidth: Number.parseInt(document.getElementById('collapsedWidth').value, 10),
    collapsedHeight: Number.parseInt(document.getElementById('collapsedHeight').value, 10)
  }));
}

async function waitForProjection(page, expected, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let actual;
  while (Date.now() < deadline) {
    actual = await readForm(page);
    if (canonical(actual) === canonical(expected)) return actual;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Chatango form did not hydrate to expected projection: ${JSON.stringify(actual)}`);
}

async function shutdown() {
  if (browser) { await browser.close().catch(() => {}); browser = null; }
  if (child && child.exitCode === null) {
    try {
      const response = await fetch(`${child.baseUrl}/api/shutdown`, { method: 'POST', signal: AbortSignal.timeout(3000) });
      await response.json().catch(() => {});
      await waitExit(child);
    } catch (_) { child.kill('SIGTERM'); await waitExit(child).catch(() => child.kill()); }
  }
}

async function main() {
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.cpSync(sourcePlugin, path.join(pluginRoot, 'chatango'), { recursive: true });
  fs.symlinkSync(path.join(appRoot, 'modules'), path.join(fixtureRoot, 'modules'), 'junction');
  fs.symlinkSync(path.join(appRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(profileRoot, 'logs'), { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    TEMP: os.tmpdir(), TMP: os.tmpdir(), LOCALAPPDATA: profileRoot, LTTH_LOG_DIR: path.join(profileRoot, 'logs'),
    LTTH_PORT: String(port), LTTH_DOCS_CAPTURE: 'true', LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: 'chatango',
    LTTH_DOCS_CAPTURE_PLUGIN_DIR: pluginRoot, LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true', LTTH_NO_BROWSER: 'true',
    DISABLE_SWAGGER: 'true', LTTH_BIND_ADDRESS: '127.0.0.1',
    SystemRoot: process.env.SystemRoot || process.env.WINDIR || '', WINDIR: process.env.WINDIR || process.env.SystemRoot || '',
    HOMEDRIVE: '', HOMEPATH: '', LOGONSERVER: '', PATH: '', SYSTEMDRIVE: '', USERDOMAIN: '', USERNAME: '', USERPROFILE: ''
  };
  capturePolicy.validateDocumentationCaptureEnvironment(env, { platform: 'win32' });
  const dbPath = path.join(profileRoot, 'ltth.app', 'user_configs', 'default.db');
  const record = {
    captureMode: true, allowedPlugins: ['chatango'], baseUrl, profilePath: '<redacted disposable Temp profile>',
    databasePath: '<same disposable Temp profile>', browserRequests: [], blockedRequests: [], httpRoutes: [],
    externalConnectorStartup: 'disabled by LTTH_DOCS_CAPTURE=true',
    tiktokAutoReconnect: 'disabled by LTTH_DISABLE_TIKTOK_AUTO_RECONNECT=true and Capture mode',
    osEgressIsolation: 'not provided; browser requests guarded, app process not OS-firewalled'
  };
  try {
    await startApp(env, baseUrl, 1, record);
    child.baseUrl = baseUrl;
    record.databaseCreatedInDisposableProfile = fs.existsSync(dbPath);
    record.firstProcessPid = child.pid;
    record.baselineConfig = (await (await fetch(`${baseUrl}/api/chatango/config`)).json()).config;
    if (!record.baselineConfig) throw new Error('Could not read Chatango config baseline');
    record.allowedProjection = { ...record.baselineConfig, theme: 'day' };

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await installGuard(context, baseUrl, record);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/chatango/ui`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('config-form') && window.i18n?.initialized);
    record.loadedUiBeforeSave = await waitForProjection(page, record.baselineConfig);
    record.loadedUiMatchesApiBaseline = canonical(record.loadedUiBeforeSave) === canonical(record.baselineConfig);
    await page.locator('#theme').selectOption('day');
    const saveResponsePromise = page.waitForResponse(response => response.url().includes('/api/chatango/config') && response.request().method() === 'POST');
    await page.locator('#config-form button[type="submit"]').click();
    const saveResponse = await saveResponsePromise;
    record.postStatus = saveResponse.status();
    record.savedMessage = await page.locator('.notification').first().textContent().catch(() => '');
    record.afterSave = (await (await fetch(`${baseUrl}/api/chatango/config`)).json()).config;
    record.afterSaveMatchesProjection = canonical(record.afterSave) === canonical(record.allowedProjection);
    record.httpRoutes.push('POST /api/chatango/config');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.i18n?.initialized);
    record.afterReloadUi = await waitForProjection(page, record.allowedProjection);
    record.afterReloadMatchesProjection = canonical(record.afterReloadUi) === canonical(record.allowedProjection);
    await page.screenshot({ path: path.join(evidenceDir, 'chatango-settings-after-reload.png'), fullPage: true });
    await browser.close(); browser = null;
    const shutdownOne = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    record.shutdownOne = await shutdownOne.json();
    record.processExitOne = await waitExit(child);
    if (record.processExitOne.code !== 0) throw new Error(`First orderly shutdown failed: ${JSON.stringify(record.processExitOne)}`);
    streams[0].end(); streams[1].end();

    await startApp(env, baseUrl, 2, record);
    child.baseUrl = baseUrl;
    record.secondProcessPid = child.pid;
    record.afterRestart = (await (await fetch(`${baseUrl}/api/chatango/config`)).json()).config;
    record.afterRestartMatchesProjection = canonical(record.afterRestart) === canonical(record.allowedProjection);
    browser = await chromium.launch({ headless: true });
    const restartContext = await browser.newContext();
    await installGuard(restartContext, baseUrl, record);
    const restartPage = await restartContext.newPage();
    await restartPage.goto(`${baseUrl}/chatango/ui`, { waitUntil: 'domcontentloaded' });
    await restartPage.waitForFunction(() => window.i18n?.initialized);
    record.afterRestartUi = await waitForProjection(restartPage, record.allowedProjection);
    record.afterRestartUiMatchesProjection = canonical(record.afterRestartUi) === canonical(record.allowedProjection);
    await restartPage.screenshot({ path: path.join(evidenceDir, 'chatango-settings-after-process-restart.png'), fullPage: true });
    record.externalBrowserRequests = record.blockedRequests.filter(request => !request.path.startsWith(baseUrl));
    record.localBrowserBlockedRequests = record.blockedRequests.filter(request => request.path.startsWith(baseUrl));
    await browser.close(); browser = null;
    const shutdownTwo = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    record.shutdownTwo = await shutdownTwo.json();
    record.processExitTwo = await waitExit(child);
    if (record.processExitTwo.code !== 0) throw new Error(`Second orderly shutdown failed: ${JSON.stringify(record.processExitTwo)}`);
    streams[2].end(); streams[3].end();
    record.profileRemoved = false;
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    const checks = [record.loadedUiMatchesApiBaseline, record.payloadMatchesProjection, record.postStatus === 200,
      record.afterSaveMatchesProjection, record.afterReloadMatchesProjection, record.afterRestartMatchesProjection,
      record.afterRestartUiMatchesProjection, record.processExitOne.code === 0, record.processExitTwo.code === 0];
    if (checks.some(value => value !== true)) throw new Error('One or more Chatango persistence checks did not pass');
    console.log(JSON.stringify({ ok: true, evidence: path.join(evidenceDir, 'results.json') }));
  } catch (error) {
    record.error = error.message;
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    throw error;
  } finally {
    await shutdown();
    streams.forEach(stream => stream.end());
    for (const name of ['modules', 'node_modules']) {
      const link = path.join(fixtureRoot, name);
      if (fs.existsSync(link)) fs.unlinkSync(link);
    }
    fs.rmSync(profileRoot, { recursive: true, force: true });
    record.profileRemoved = !fs.existsSync(profileRoot);
    if (fs.existsSync(path.join(evidenceDir, 'results.json'))) {
      const previous = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'results.json'), 'utf8'));
      fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify({ ...previous, profileRemoved: record.profileRemoved }, null, 2));
    }
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
