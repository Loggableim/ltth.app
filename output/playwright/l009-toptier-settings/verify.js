const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const { chromium } = require(path.join(__dirname, '../../../app/node_modules/playwright'));
const capturePolicy = require('../../../app/modules/docs-capture-policy');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app');
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-l009-toptier-'));
const fixtureRoot = path.join(profileRoot, 'docs-capture-app');
const pluginRoot = path.join(fixtureRoot, 'plugins');
const sourcePlugin = path.join(appRoot, 'plugins', 'toptier');
const evidenceDir = __dirname;
const apiGetPaths = new Set(['/api/health', '/config', '/session/current']);
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
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function waitExit(processHandle, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (processHandle.exitCode !== null) return resolve({ code: processHandle.exitCode, signal: processHandle.signalCode });
    const timer = setTimeout(() => reject(new Error('Timed out waiting for orderly app shutdown')), timeoutMs);
    processHandle.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function startApp(env, baseUrl, run, record) {
  const stdout = fs.createWriteStream(path.join(evidenceDir, `server-${run}.stdout.log`));
  const stderr = fs.createWriteStream(path.join(evidenceDir, `server-${run}.stderr.log`));
  streams.push(stdout, stderr);
  child = spawn(process.execPath, [path.join(appRoot, 'server.js')], {
    cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const config = await fetch(`${baseUrl}/config`, { signal: AbortSignal.timeout(1200) });
        if (config.ok) {
          const data = await config.json();
          if (data.success && data.config) return;
        }
      }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(child.exitCode !== null ? `App exited during startup (${child.exitCode})` : 'Timed out waiting for TopTier config route');
}

async function addBrowserGuard(context, baseUrl, record) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const staticAsset = url.pathname === '/toptier/ui'
      || url.pathname === '/css/themes.css'
      || url.pathname === '/socket.io/socket.io.js'
      || url.pathname.startsWith('/socket.io/')
      || url.pathname.startsWith('/js/')
      || url.pathname.startsWith('/plugins/toptier/assets/')
      || /^\/api\/i18n\/translations\/(de|en|es|fr)$/.test(url.pathname);
    const methodAllowed = request.method() === 'GET' || request.method() === 'POST';
    const apiAllowed = request.method() === 'GET' && apiGetPaths.has(url.pathname);
    const permitted = url.origin === baseUrl && methodAllowed && (staticAsset || apiAllowed || url.pathname === '/config');
    record.browserRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}` });
    if (!permitted) {
      record.blockedRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}` });
      return route.abort('blockedbyclient');
    }
    if (request.method() === 'POST') {
      if (url.pathname.startsWith('/socket.io/')) {
        record.socketPollingRequests = (record.socketPollingRequests || 0) + 1;
        return route.continue();
      }
      if (url.pathname !== '/config') {
        record.blockedRequests.push({ method: request.method(), path: `${url.origin}${url.pathname}` });
        return route.abort('blockedbyclient');
      }
      const payload = request.postDataJSON();
      record.postPayload = payload;
      const expected = structuredClone(record.baselineConfig);
      expected.overlay.theme = 'night';
      expected.overlay.position = 'top-right';
      record.allowedConfigProjection = expected;
      record.postMatchesExpectedUiProjection = canonical(payload) === canonical(expected);
      if (!record.postMatchesExpectedUiProjection) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Payload differs from reviewed UI projection' }) });
      }
    }
    await route.continue();
  });
}

async function main() {
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.cpSync(sourcePlugin, path.join(pluginRoot, 'toptier'), { recursive: true });
  fs.symlinkSync(path.join(appRoot, 'modules'), path.join(fixtureRoot, 'modules'), 'junction');
  fs.symlinkSync(path.join(appRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(profileRoot, 'logs'), { recursive: true });
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    TEMP: os.tmpdir(), TMP: os.tmpdir(), LOCALAPPDATA: profileRoot,
    LTTH_LOG_DIR: path.join(profileRoot, 'logs'), LTTH_PORT: String(port),
    LTTH_DOCS_CAPTURE: 'true', LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: 'toptier',
    LTTH_DOCS_CAPTURE_PLUGIN_DIR: pluginRoot, LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
    LTTH_NO_BROWSER: 'true', DISABLE_SWAGGER: 'true', LTTH_BIND_ADDRESS: '127.0.0.1',
    SystemRoot: process.env.SystemRoot || process.env.WINDIR || '',
    WINDIR: process.env.WINDIR || process.env.SystemRoot || '',
    HOMEDRIVE: '', HOMEPATH: '', LOGONSERVER: '', PATH: '', SYSTEMDRIVE: '', USERDOMAIN: '', USERNAME: '', USERPROFILE: ''
  };
  capturePolicy.validateDocumentationCaptureEnvironment(env, { platform: 'win32' });
  const record = {
    captureMode: true,
    allowedPlugins: ['toptier'],
    baseUrl,
    sourceSha: require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    profilePath: '<redacted system Temp profile>',
    browserRequests: [],
    blockedRequests: [],
    routePosts: [],
    externalConnectorStartup: 'disabled by LTTH_DOCS_CAPTURE=true',
    tiktokAutoReconnect: 'disabled by LTTH_DISABLE_TIKTOK_AUTO_RECONNECT=true and Capture mode',
    osEgressIsolation: 'not provided; browser requests guarded, app process not OS-firewalled'
  };
  const dbPath = path.join(profileRoot, 'ltth.app', 'user_configs', 'default.db');
  try {
    await startApp(env, baseUrl, 1, record);
    record.firstProcessPid = child.pid;
    record.databaseExistedAfterStartup = fs.existsSync(dbPath);
    const baselineResponse = await fetch(`${baseUrl}/config`);
    const baselineData = await baselineResponse.json();
    if (!baselineData.success || !baselineData.config) throw new Error('Could not read TopTier baseline configuration');
    record.baselineConfig = baselineData.config;
    record.baselineSession = await (await fetch(`${baseUrl}/session/current`)).json();
    record.baselineDecay = record.baselineConfig.decay;

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await addBrowserGuard(context, baseUrl, record);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/toptier/ui`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('save-config') && document.getElementById('chat-keyword')?.value === '!rank');
    await page.waitForFunction(() => document.getElementById('likes-count')?.value === '5' && document.getElementById('ov-theme')?.value === 'night');
    record.loadedUiBeforeSave = await page.evaluate(() => ({
      likesEnabled: document.getElementById('likes-enabled').checked,
      likesCount: Number(document.getElementById('likes-count').value),
      likesMultiplier: Number(document.getElementById('likes-multiplier').value),
      giftsEnabled: document.getElementById('gifts-enabled').checked,
      giftsCount: Number(document.getElementById('gifts-count').value),
      decayEnabled: document.getElementById('decay-enabled-main').checked,
      decayConnectedOnly: document.getElementById('decay-connected-only').checked,
      theme: document.getElementById('ov-theme').value,
      variant: document.querySelector('.tt-variant-option.selected')?.getAttribute('data-variant'),
      positionAddedBySerializer: 'top-right'
    }));
    const savedResponse = page.waitForResponse(response => response.url() === `${baseUrl}/config` && response.request().method() === 'POST');
    await page.locator('#save-config').click();
    const saveResponse = await savedResponse;
    record.postStatus = saveResponse.status();
    await page.locator('#toast').waitFor({ state: 'visible', timeout: 5000 });
    record.saveToast = await page.locator('#toast').textContent();
    record.afterSave = (await (await fetch(`${baseUrl}/config`)).json()).config;
    record.afterSaveMatchesUiProjection = canonical(record.afterSave) === canonical(record.allowedConfigProjection);
    record.saveDeltaFields = {
      baselineTheme: record.baselineConfig.overlay.theme,
      savedTheme: record.afterSave.overlay.theme,
      baselinePositionPresent: Object.prototype.hasOwnProperty.call(record.baselineConfig.overlay, 'position'),
      savedPosition: record.afterSave.overlay.position
    };

    const reloadConfig = page.waitForResponse(response => response.url() === `${baseUrl}/config` && response.request().method() === 'GET');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reloadConfig;
    await page.waitForFunction(() => document.getElementById('likes-count')?.value === '5' && document.getElementById('ov-theme')?.value === 'night');
    record.afterReload = (await (await fetch(`${baseUrl}/config`)).json()).config;
    record.afterReloadMatchesUiProjection = canonical(record.afterReload) === canonical(record.allowedConfigProjection);
    record.afterReloadUi = await page.evaluate(() => ({
      likesCount: Number(document.getElementById('likes-count').value),
      decayEnabled: document.getElementById('decay-enabled-main').checked,
      theme: document.getElementById('ov-theme').value,
      variant: document.querySelector('.tt-variant-option.selected')?.getAttribute('data-variant'),
      chatKeyword: document.getElementById('chat-keyword').value
    }));
    await page.screenshot({ path: path.join(evidenceDir, 'toptier-settings-after-reload.png'), fullPage: true });
    await browser.close();
    browser = null;

    const shutdownOne = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    record.shutdownResponseOne = await shutdownOne.json();
    record.processExitOne = await waitExit(child);
    if (record.processExitOne.code !== 0) throw new Error(`First orderly shutdown returned ${JSON.stringify(record.processExitOne)}`);
    streams[0].end(); streams[1].end();

    await startApp(env, baseUrl, 2, record);
    record.secondProcessPid = child.pid;
    record.afterRestart = (await (await fetch(`${baseUrl}/config`)).json()).config;
    record.afterRestartMatchesUiProjection = canonical(record.afterRestart) === canonical(record.allowedConfigProjection);
    record.sessionAfterRestart = await (await fetch(`${baseUrl}/session/current`)).json();
    browser = await chromium.launch({ headless: true });
    const restartContext = await browser.newContext();
    await addBrowserGuard(restartContext, baseUrl, record);
    const restartPage = await restartContext.newPage();
    const settingsRead = restartPage.waitForResponse(response => response.url() === `${baseUrl}/config` && response.request().method() === 'GET');
    await restartPage.goto(`${baseUrl}/toptier/ui`, { waitUntil: 'domcontentloaded' });
    await settingsRead;
    await restartPage.waitForFunction(() => document.getElementById('likes-count')?.value === '5' && document.getElementById('ov-theme')?.value === 'night');
    record.afterRestartUi = await restartPage.evaluate(() => ({
      likesCount: Number(document.getElementById('likes-count').value),
      decayEnabled: document.getElementById('decay-enabled-main').checked,
      theme: document.getElementById('ov-theme').value,
      variant: document.querySelector('.tt-variant-option.selected')?.getAttribute('data-variant'),
      chatKeyword: document.getElementById('chat-keyword').value
    }));
    record.externalBrowserRequests = record.blockedRequests.filter(request => !request.path.startsWith(baseUrl));
    record.localBrowserBlockedRequests = record.blockedRequests.filter(request => request.path.startsWith(baseUrl));
    await restartPage.screenshot({ path: path.join(evidenceDir, 'toptier-settings-after-process-restart.png'), fullPage: true });
    await browser.close();
    browser = null;

    const shutdownTwo = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    record.shutdownResponseTwo = await shutdownTwo.json();
    record.processExitTwo = await waitExit(child);
    if (record.processExitTwo.code !== 0) throw new Error(`Second orderly shutdown returned ${JSON.stringify(record.processExitTwo)}`);
    streams[2].end(); streams[3].end();
    record.profileRemoved = false;
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    const checks = [record.postMatchesExpectedUiProjection, record.afterSaveMatchesUiProjection, record.afterReloadMatchesUiProjection,
      record.afterRestartMatchesUiProjection, record.processExitOne.code === 0, record.processExitTwo.code === 0];
    if (checks.some(value => value !== true)) throw new Error('One or more TopTier save/reload/restart checks did not pass');
    console.log(JSON.stringify({ ok: true, result: path.join(evidenceDir, 'results.json') }));
  } catch (error) {
    record.error = error.message;
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await waitExit(child).catch(() => child.kill());
    }
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

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
