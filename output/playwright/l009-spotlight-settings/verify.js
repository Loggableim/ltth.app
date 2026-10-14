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
  const out = fs.createWriteStream(path.join(evidenceDir, 'server.stdout.log'));
  const err = fs.createWriteStream(path.join(evidenceDir, 'server.stderr.log'));
  const child = spawn(process.execPath, [path.join(appRoot, 'server.js')], {
    cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  child.stdout.pipe(out);
  child.stderr.pipe(err);
  let browser;
  const record = { captureMode: true, allowedPlugins: ['spotlight'], baseUrl, dbPath: '<redacted Temp profile>', browserRequests: [], blockedRequests: [], routeHits: [], payload: null };
  try {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1200) });
        if (response.ok) break;
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    if (child.exitCode !== null) throw new Error(`Capture app exited during startup (${child.exitCode})`);
    if (Date.now() >= deadline) throw new Error('Capture app did not become ready');

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
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
    const afterResponse = await fetch(`${baseUrl}/api/lastevent/settings/follower`);
    const afterData = await afterResponse.json();
    record.afterSave = afterData.settings;
    record.savedMessage = await page.locator('#toast').textContent();
    record.baselineMatchesPayload = record.payloadFieldsMatchBaseline === true;
    record.afterSaveMatchesBaseline = JSON.stringify(record.afterSave) === JSON.stringify(record.baselineFollower);
    record.browserExternalBlocked = record.blockedRequests.filter(x => !x.url.startsWith(baseUrl)).length;
    await page.screenshot({ path: path.join(evidenceDir, 'spotlight-settings-save.png'), fullPage: true });
    if (!record.baselineMatchesPayload || !record.afterSaveMatchesBaseline) throw new Error('Settings save differed from the baseline');
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    await browser.close();
    browser = null;
    child.kill('SIGTERM');
    const exit = await waitExit(child);
    record.processExit = exit;
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    if (exit.code !== 0 && exit.signal !== 'SIGTERM') throw new Error(`Capture app exited with ${exit.code}/${exit.signal}`);
    console.log(JSON.stringify({ ok: true, resultPath: path.join(evidenceDir, 'results.json'), processExit: exit }));
  } catch (error) {
    record.error = error.message;
    record.profileRemoved = false;
    fs.writeFileSync(path.join(evidenceDir, 'results.json'), JSON.stringify(record, null, 2));
    throw error;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await waitExit(child).catch(() => child.kill());
    }
    out.end(); err.end();
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
