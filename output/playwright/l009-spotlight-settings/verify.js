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
const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-l009-spotlight-'));
const fixtureRoot = path.join(profileRoot, 'docs-capture-app');
const pluginRoot = path.join(fixtureRoot, 'plugins');
const sourcePlugin = path.join(appRoot, 'plugins', 'spotlight');
const allowedRoutes = new Set([
  '/api/health',
  '/spotlight/ui',
  '/plugins/spotlight/ui/main.js',
  '/api/lastevent/settings',
  '/api/lastevent/settings/follower',
  '/js/i18n-client.js',
  '/js/tiktok-studio-url.js',
  '/css/themes.css',
  '/plugins/spotlight/assets/spotlight-logo-v1.1.4.png',
  '/socket.io/socket.io.js',
  '/favicon.ico'
]);

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

function waitExit(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null) return resolve({ code: child.exitCode, signal: child.signalCode });
    const timer = setTimeout(() => reject(new Error('Timed out waiting for app process exit')), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function startCaptureServer(env, baseUrl, run, evidenceDir) {
  const out = fs.createWriteStream(path.join(evidenceDir, `server-${run}.stdout.log`));
  const err = fs.createWriteStream(path.join(evidenceDir, `server-${run}.stderr.log`));
  const child = spawn(process.execPath, [path.join(appRoot, 'server.js')], {
    cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1200) });
      if (response.ok) {
        const settings = await fetch(`${baseUrl}/api/lastevent/settings/follower`, { signal: AbortSignal.timeout(1200) });
        if (settings.ok) {
          const data = await settings.json();
          if (data.success && data.settings) return { child, out, err };
        }
      }
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(child.exitCode !== null ? `Capture app exited during startup (${child.exitCode})` : 'Capture app did not become ready');
}

async function installRouteGuard(context, baseUrl, record) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    const permitted = url.origin === baseUrl && (allowedRoutes.has(url.pathname) || /^\/api\/i18n\/translations\/(de|en|es|fr)$/.test(url.pathname));
    record.browserRequests.push({ method: route.request().method(), url: `${url.origin}${url.pathname}` });
    if (!permitted) {
      record.blockedRequests.push({ method: route.request().method(), url: `${url.origin}${url.pathname}` });
      return route.abort('blockedbyclient');
    }
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      record.payload = body;
      record.routeHits.push({ method: 'POST', path: url.pathname });
      const fieldsMatchBaseline = body && Object.keys(body).every(key =>
        Object.prototype.hasOwnProperty.call(record.baselineFollower, key) &&
        JSON.stringify(body[key]) === JSON.stringify(record.baselineFollower[key])
      );
      record.payloadFieldsMatchBaseline = fieldsMatchBaseline;
      if (!fieldsMatchBaseline) {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Unexpected payload mismatch' }) });
      }
    }
    if (route.request().method() !== 'GET' && route.request().method() !== 'POST') {
      return route.abort('blockedbyclient');
    }
    if (route.request().method() === 'GET' && url.pathname.startsWith('/api/lastevent/')) {
      record.routeHits.push({ method: 'GET', path: url.pathname });
    }
    await route.continue();
  });
}

async function readFollowerUiSettings(page) {
  return page.evaluate(() => ({
    designVariant: document.getElementById('designVariant').value,
    fontFamily: document.getElementById('fontFamily').value,
    fontSize: document.getElementById('fontSize').value,
    fontLineSpacing: document.getElementById('fontLineSpacing').value,
    fontLetterSpacing: document.getElementById('fontLetterSpacing').value,
    fontColor: document.getElementById('fontColor').value,
    usernameEffect: document.getElementById('usernameEffect').value,
    usernameGlow: document.getElementById('usernameGlow').checked,
    usernameGlowColor: document.getElementById('usernameGlowColor').value,
    enableBorder: document.getElementById('enableBorder').checked,
    borderColor: document.getElementById('borderColor').value,
    enableBackground: document.getElementById('enableBackground').checked,
    backgroundColor: document.getElementById('backgroundColor').value,
    showProfilePicture: document.getElementById('showProfilePicture').checked,
    profilePictureSize: document.getElementById('profilePictureSize').value,
    showUsername: document.getElementById('showUsername').checked,
    hudAlignment: document.getElementById('hudAlignment').value,
    inAnimationType: document.getElementById('inAnimationType').value,
    outAnimationType: document.getElementById('outAnimationType').value,
    animationSpeed: document.getElementById('animationSpeed').value,
    fadeDuration: document.getElementById('fadeDuration').value,
    refreshIntervalSeconds: Number.parseInt(document.getElementById('refreshIntervalSeconds').value, 10) || 0,
    hideOnNullUser: document.getElementById('hideOnNullUser').checked,
    preloadImages: document.getElementById('preloadImages').checked
  }));
}

async function main() {
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.cpSync(sourcePlugin, path.join(pluginRoot, 'spotlight'), { recursive: true });
  fs.symlinkSync(path.join(appRoot, 'modules'), path.join(fixtureRoot, 'modules'), 'junction');
  fs.symlinkSync(path.join(appRoot, 'node_modules'), path.join(fixtureRoot, 'node_modules'), 'junction');
  fs.mkdirSync(path.join(profileRoot, 'logs'), { recursive: true });

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dbPath = path.join(profileRoot, 'ltth.app', 'user_configs', 'default.db');
  const env = {
    TEMP: os.tmpdir(), TMP: os.tmpdir(), LOCALAPPDATA: profileRoot,
    LTTH_LOG_DIR: path.join(profileRoot, 'logs'), LTTH_PORT: String(port),
    LTTH_DOCS_CAPTURE: 'true', LTTH_DOCS_CAPTURE_ALLOWED_PLUGINS: 'spotlight',
    LTTH_DOCS_CAPTURE_PLUGIN_DIR: pluginRoot, LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
    LTTH_NO_BROWSER: 'true', DISABLE_SWAGGER: 'true', LTTH_BIND_ADDRESS: '127.0.0.1',
    SystemRoot: process.env.SystemRoot || process.env.WINDIR || '',
    WINDIR: process.env.WINDIR || process.env.SystemRoot || '',
    HOMEDRIVE: '', HOMEPATH: '', LOGONSERVER: '', PATH: '', SYSTEMDRIVE: '', USERDOMAIN: '', USERNAME: '', USERPROFILE: ''
  };
  capturePolicy.validateDocumentationCaptureEnvironment(env, { platform: 'win32' });
  let serverRun = await startCaptureServer(env, baseUrl, 1, evidenceDir);
  let child = serverRun.child;
  const streams = [serverRun.out, serverRun.err];
  let browser;
  const record = { captureMode: true, allowedPlugins: ['spotlight'], baseUrl, dbPath: '<redacted Temp profile>', browserRequests: [], blockedRequests: [], routeHits: [], payload: null };
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await installRouteGuard(context, baseUrl, record);
    const page = await context.newPage();
    await page.goto(`${baseUrl}/spotlight/ui`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.i18n?.initialized && document.querySelectorAll('.overlay-card').length === 9);
    record.baselineAll = await page.waitForFunction(() => Object.keys(window.__l009Settings || {}).length > 0, null, { timeout: 1000 }).then(() => null).catch(() => null);
    const baselineResponse = await fetch(`${baseUrl}/api/lastevent/settings`);
    const baselineData = await baselineResponse.json();
    if (!baselineData.success || !baselineData.settings?.follower) throw new Error('Could not retrieve follower settings baseline');
    record.baselineFollower = baselineData.settings.follower;
    const saved = await page.evaluate(async () => {
      const result = await fetch('/api/lastevent/settings');
      const data = await result.json();
      return data.settings.follower;
    });
    if (JSON.stringify(saved) !== JSON.stringify(record.baselineFollower)) throw new Error('Browser-loaded baseline did not match API baseline');
    await page.locator('.overlay-card[data-type="follower"] [data-action="settings"]').click().catch(async () => {
      await page.locator('[data-action="settings"][data-type="follower"]').click();
    });
    await page.locator('#save-settings-btn').click();
    await page.getByText(/Settings saved successfully|Configuración guardada|Paramètres enregistrés|Einstellungen gespeichert/i).waitFor({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(250);
    record.savedMessage = await page.locator('#toast').textContent();
    record.baselineMatchesPayload = record.payloadFieldsMatchBaseline === true;
    const afterResponse = await fetch(`${baseUrl}/api/lastevent/settings/follower`);
    record.afterSave = (await afterResponse.json()).settings;
    record.afterSaveMatchesBaseline = JSON.stringify(record.afterSave) === JSON.stringify(record.baselineFollower);

    const reloadSettings = page.waitForResponse(response => response.url().endsWith('/api/lastevent/settings') && response.request().method() === 'GET');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await reloadSettings;
    await page.waitForFunction(() => window.i18n?.initialized && document.querySelectorAll('.overlay-card').length === 9);
    const reloadApiResponse = await fetch(`${baseUrl}/api/lastevent/settings/follower`);
    record.afterReloadApi = (await reloadApiResponse.json()).settings;
    record.afterReloadApiMatchesBaseline = JSON.stringify(record.afterReloadApi) === JSON.stringify(record.baselineFollower);
    await page.locator('[data-action="settings"][data-type="follower"]').click();
    record.uiAfterReload = await readFollowerUiSettings(page);
    record.uiAfterReloadMatchesPayload = JSON.stringify(record.uiAfterReload) === JSON.stringify(record.payload);
    await page.screenshot({ path: path.join(evidenceDir, 'spotlight-settings-after-reload.png'), fullPage: true });
    await browser.close();
    browser = null;

    const shutdownOne = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    record.shutdownResponseOne = await shutdownOne.json();
    record.processExitOne = await waitExit(child);
    if (record.processExitOne.code !== 0) throw new Error(`First graceful shutdown returned ${JSON.stringify(record.processExitOne)}`);
    streams[0].end(); streams[1].end();

    serverRun = await startCaptureServer(env, baseUrl, 2, evidenceDir);
    child = serverRun.child;
    streams.push(serverRun.out, serverRun.err);
    const restartResponse = await fetch(`${baseUrl}/api/lastevent/settings/follower`);
    record.afterRestartApi = (await restartResponse.json()).settings;
    record.afterRestartApiMatchesBaseline = JSON.stringify(record.afterRestartApi) === JSON.stringify(record.baselineFollower);

    browser = await chromium.launch({ headless: true });
    const restartContext = await browser.newContext();
    await installRouteGuard(restartContext, baseUrl, record);
    const restartPage = await restartContext.newPage();
    const restartSettings = restartPage.waitForResponse(response => response.url().endsWith('/api/lastevent/settings') && response.request().method() === 'GET');
    await restartPage.goto(`${baseUrl}/spotlight/ui`, { waitUntil: 'domcontentloaded' });
    await restartSettings;
    await restartPage.waitForFunction(() => window.i18n?.initialized && document.querySelectorAll('.overlay-card').length === 9);
    await restartPage.locator('[data-action="settings"][data-type="follower"]').click();
    record.uiAfterRestart = await readFollowerUiSettings(restartPage);
    record.uiAfterRestartMatchesPayload = JSON.stringify(record.uiAfterRestart) === JSON.stringify(record.payload);
    record.browserExternalBlocked = record.blockedRequests.filter(x => !x.url.startsWith(baseUrl)).length;
    await restartPage.screenshot({ path: path.join(evidenceDir, 'spotlight-settings-after-process-restart.png'), fullPage: true });
    await browser.close();
    browser = null;

    const shutdownTwo = await fetch(`${baseUrl}/api/shutdown`, { method: 'POST' });
    record.shutdownResponseTwo = await shutdownTwo.json();
    record.processExitTwo = await waitExit(child);
    if (record.processExitTwo.code !== 0) throw new Error(`Second graceful shutdown returned ${JSON.stringify(record.processExitTwo)}`);
    streams[2].end(); streams[3].end();

    if (!record.baselineMatchesPayload || !record.afterSaveMatchesBaseline || !record.afterReloadApiMatchesBaseline ||
        !record.uiAfterReloadMatchesPayload || !record.afterRestartApiMatchesBaseline || !record.uiAfterRestartMatchesPayload) {
      throw new Error('Spotlight settings save, reload, and restart did not all match the baseline');
    }
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    console.log(JSON.stringify({ ok: true, resultPath: path.join(evidenceDir, 'results.json'), processExitOne: record.processExitOne, processExitTwo: record.processExitTwo }));
  } catch (error) {
    record.error = error.message;
    record.profileRemoved = false;
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
      const prior = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'results.json'), 'utf8'));
      fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify({ ...prior, profileRemoved: record.profileRemoved }, null, 2));
    }
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
