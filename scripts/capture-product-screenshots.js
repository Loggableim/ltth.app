'use strict';

const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { buildSpec, LOCALES: PRODUCT_LOCALES } = require('./product-screenshot-spec');
const { buildDocsSpec, LOCALES: DOCS_LOCALES } = require('./docs-screenshot-spec');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const COLLECTION = process.env.SCREENSHOT_COLLECTION === 'docs' ? 'docs' : 'product';
const MANIFEST_PATH = path.join(SCREENSHOT_ROOT, COLLECTION === 'docs' ? 'docs-capture-manifest.json' : 'product-capture-manifest.json');
const EXTERNAL_BASE_URL = (process.env.SCREENSHOT_BASE_URL || '').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SCREENSHOT_TIMEOUT_MS || 60000);
const WAIT_AFTER_LOAD_MS = Number(process.env.SCREENSHOT_WAIT_AFTER_LOAD_MS || 450);
const ASSET_TIMEOUT_MS = Number(process.env.SCREENSHOT_ASSET_TIMEOUT_MS || 20000);
const START_APP = process.env.SCREENSHOT_START_APP !== 'false';

function loadPuppeteer() {
  const candidates = [
    path.join(REPO_ROOT, 'app', 'node_modules', 'puppeteer'),
    path.join(REPO_ROOT, 'app', 'node_modules', 'puppeteer-core'),
    'puppeteer',
    'puppeteer-core'
  ];
  let lastError;
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) { lastError = error; }
  }
  throw lastError;
}

function browserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = process.platform === 'win32'
    ? ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    : [];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function outputPath(asset, locale) {
  const relative = asset.canonical.replace(/^\/screenshots\//, '');
  return path.join(locale === 'en' ? SCREENSHOT_ROOT : path.join(SCREENSHOT_ROOT, locale), relative);
}

function urlFor(baseUrl, route, locale) {
  const separator = route.includes('?') ? '&' : '?';
  return `${baseUrl}${route}${separator}lang=${encodeURIComponent(locale)}`;
}

function specHash(spec) {
  return crypto.createHash('sha256').update(JSON.stringify({ version: spec.version, assets: spec.assets })).digest('hex');
}

function withTimeout(promise, label) {
  let timeout;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out after ${ASSET_TIMEOUT_MS}ms while capturing ${label}`)), ASSET_TIMEOUT_MS);
    })
  ]).finally(() => clearTimeout(timeout));
}

function rewritePluginAssetRequest(request) {
  const url = new URL(request.url());
  const aliases = {
    '/advanced-timer/ui.js': '/plugins/advanced-timer/ui/ui.js',
    '/advanced-timer/overlay.js': '/plugins/advanced-timer/overlay/overlay.js',
    '/openshock/openshock_overlay.js': '/plugins/openshock/overlay/openshock_overlay.js',
    '/openshock/openshock_overlay.css': '/plugins/openshock/overlay/openshock_overlay.css'
  };
  if (aliases[url.pathname]) {
    url.pathname = aliases[url.pathname];
    request.continue({ url: url.toString() });
    return true;
  }
  const match = url.pathname.match(/^\/([a-z0-9-]+)\/(.+)$/i);
  if (!match || url.pathname.startsWith('/plugins/') || ['api', 'js', 'css', 'images', 'assets', 'locales'].includes(match[1])) return false;
  const resource = match[2];
  if (!/^(?:assets\/|.*\.(?:js|css|png|jpe?g|gif|svg|webp|woff2?|mp3|wav|json))/i.test(resource)) return false;
  url.pathname = `/plugins/${match[1]}/${resource}`;
  request.continue({ url: url.toString() });
  return true;
}

async function attachPluginAssetRewrite(page) {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (!rewritePluginAssetRequest(request)) request.continue();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(child, baseUrl) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`App exited before capture started (code ${child.exitCode})`));
        return;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1000);
        const response = await fetch(`${baseUrl}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          clearInterval(timer);
          resolve();
          return;
        }
      } catch (_) {
        // The isolated app is still starting.
      }
      if (Date.now() - started > 90000) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for the isolated LTTH app'));
      }
    }, 500);
  });
}

async function startIsolatedApp(profileName) {
  if (!START_APP) {
    if (!EXTERNAL_BASE_URL) throw new Error('SCREENSHOT_BASE_URL is required when SCREENSHOT_START_APP=false');
    return { baseUrl: EXTERNAL_BASE_URL, child: null, profileDir: null };
  }
  const port = await freePort();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `ltth-docs-capture-${profileName}-`));
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'app', 'server.js')], {
    cwd: path.join(REPO_ROOT, 'app'),
    env: {
      ...process.env,
      LOCALAPPDATA: profileDir,
      LTTH_PORT: String(port),
      LTTH_DOCS_CAPTURE: 'true',
      LTTH_DOCS_SAFE_MODE: 'true',
      LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
      LTTH_NO_BROWSER: 'true',
      DISABLE_SWAGGER: 'true',
      LTTH_BIND_ADDRESS: '127.0.0.1'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let startupLog = '';
  const appendStartupLog = (chunk) => {
    startupLog = `${startupLog}${chunk.toString()}`.slice(-16000);
  };
  child.stdout.on('data', appendStartupLog);
  child.stderr.on('data', appendStartupLog);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(child, baseUrl);
    return { baseUrl, child, profileDir };
  } catch (error) {
    if (child.exitCode === null) child.kill();
    if (profileDir.startsWith(path.join(os.tmpdir(), 'ltth-docs-capture-'))) fs.rmSync(profileDir, { recursive: true, force: true });
    throw new Error(`${error.message}\n${startupLog || 'No startup output was emitted.'}`);
  }
}

async function stopIsolatedApp(app) {
  if (app.child && app.child.exitCode === null) {
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(finish, 5000);
      app.child.once('exit', finish);
      app.child.kill();
    });
  }
  if (app.profileDir && app.profileDir.startsWith(path.join(os.tmpdir(), 'ltth-docs-capture-'))) {
    fs.rmSync(app.profileDir, { recursive: true, force: true });
  }
}

async function configurePage(page, locale) {
  await page.evaluateOnNewDocument((lang) => {
    localStorage.setItem('dashboard-theme', 'cid');
    localStorage.setItem('app_locale', lang);
    document.documentElement.setAttribute('data-theme', 'cid');
    document.documentElement.lang = lang;
  }, locale);
}

async function activateContainingTab(page, selector) {
  const activated = await page.evaluate((anchorSelector) => {
    const target = document.querySelector(anchorSelector);
    if (!target) throw new Error(`Capture selector not found: ${anchorSelector}`);
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width >= 2 && rect.height >= 2;
    };
    if (visible(target)) return null;
    // A number of plugin panels hide the tab pane itself rather than a child
    // of it. Include the target in the lookup so `#tab-profiles` activates
    // its real `[data-tab="profiles"]` control as well.
    for (let parent = target; parent; parent = parent.parentElement) {
      const match = parent.id && parent.id.match(/^(?:tab|content)-(.+)$/);
      if (!match) continue;
      const tabName = match[1];
      const trigger = document.querySelector(`[data-tab="${CSS.escape(tabName)}"], #sidebar-tab-${CSS.escape(tabName)}`);
      if (trigger && !trigger.disabled) {
        trigger.click();
        return { type: 'activate-tab', selector: trigger.matches('[data-tab]') ? `[data-tab="${tabName}"]` : `#sidebar-tab-${tabName}` };
      }
    }
    return null;
  }, selector);
  if (activated) await new Promise((resolve) => setTimeout(resolve, 120));
  return activated;
}

async function applyCaptureFocus(page, selector, label) {
  return page.evaluate((anchorSelector, focusLabel) => {
    const anchor = document.querySelector(anchorSelector);
    if (!anchor) throw new Error(`Capture selector not found: ${anchorSelector}`);
    const style = getComputedStyle(anchor);
    const rect = anchor.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || rect.width < 2 || rect.height < 2) {
      throw new Error(`Capture selector is not visibly rendered: ${anchorSelector}`);
    }
    document.querySelectorAll('[data-ltth-docs-focus]').forEach((element) => element.removeAttribute('data-ltth-docs-focus'));
    document.querySelectorAll('[data-ltth-docs-focus-label]').forEach((element) => element.remove());
    let styleElement = document.getElementById('ltth-docs-capture-focus-style');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'ltth-docs-capture-focus-style';
      styleElement.textContent = '[data-ltth-docs-focus]{outline:3px solid #26d9ff!important;outline-offset:4px!important;box-shadow:0 0 0 7px rgba(38,217,255,.22)!important;}[data-ltth-docs-focus-label]{position:fixed!important;z-index:2147483647!important;max-width:calc(100vw - 32px)!important;padding:6px 10px!important;border:2px solid #26d9ff!important;border-radius:7px!important;background:#031117!important;color:#f4ffff!important;font:700 13px/1.25 Inter,Segoe UI,sans-serif!important;box-shadow:0 4px 16px rgba(0,0,0,.45)!important;pointer-events:none!important;}';
      document.head.appendChild(styleElement);
    }
    anchor.setAttribute('data-ltth-docs-focus', 'true');
    anchor.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const labelNode = document.createElement('div');
    labelNode.setAttribute('data-ltth-docs-focus-label', 'true');
    labelNode.textContent = focusLabel;
    document.body.appendChild(labelNode);
    const labelAnchorRect = anchor.getBoundingClientRect();
    const labelRect = labelNode.getBoundingClientRect();
    labelNode.style.left = `${Math.max(16, Math.min(window.innerWidth - labelRect.width - 16, labelAnchorRect.left))}px`;
    labelNode.style.top = `${Math.max(16, Math.min(window.innerHeight - labelRect.height - 16, labelAnchorRect.top - labelRect.height - 10))}px`;
    return { selector: anchorSelector, text: (anchor.innerText || anchor.value || anchor.getAttribute('aria-label') || '').trim().slice(0, 160), label: focusLabel };
  }, selector, label);
}

async function revealSafeDemoState(page, selector) {
  // Some controls are intentionally hidden until an account, a device, or a
  // live event is present. In the temporary documentation profile we reveal
  // only the existing markup and never invoke the associated action. This is
  // deliberately recorded in the capture manifest as a capture-only demo
  // preparation, separate from product behaviour.
  return page.evaluate((anchorSelector) => {
    const anchor = document.querySelector(anchorSelector);
    if (!anchor) throw new Error(`Capture selector not found: ${anchorSelector}`);
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || '1') > 0.01 && rect.width >= 2 && rect.height >= 2;
    };
    if (visible(anchor)) return null;
    const changed = [];
    for (let node = anchor; node && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || '1') <= 0.01 || node.getBoundingClientRect().height < 2) {
        node.setAttribute('data-ltth-docs-demo-reveal', 'true');
        changed.push(node.id ? `#${node.id}` : node.tagName.toLowerCase());
      }
    }
    if (!changed.length) return null;
    let styleElement = document.getElementById('ltth-docs-capture-demo-style');
    if (!styleElement) {
      styleElement = document.createElement('style');
      styleElement.id = 'ltth-docs-capture-demo-style';
      styleElement.textContent = '[data-ltth-docs-demo-reveal]{display:block!important;visibility:visible!important;opacity:1!important;max-height:none!important;height:auto!important;overflow:visible!important;}';
      document.head.appendChild(styleElement);
    }
    return { type: 'capture-only-safe-demo-reveal', selectors: changed };
  }, selector);
}

async function applySafeStepState(page, asset, locale) {
  // Screenshots never invoke a real device, external credential flow, print,
  // or production stream action. Only local fields are focused/changed in the
  // temporary profile; buttons are deliberately not clicked.
  await page.evaluate((lang) => {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('data-theme', 'cid');
    localStorage.setItem('dashboard-theme', 'cid');
    localStorage.setItem('app_locale', lang);
  }, locale);
  if (asset.action && asset.action.type === 'set-demo-value') {
    await page.evaluate((selector) => {
      const field = document.querySelector(selector);
      if (!field || !['INPUT', 'TEXTAREA', 'SELECT'].includes(field.tagName)) return;
      if (field.tagName === 'SELECT') {
        const option = [...field.options].find((candidate) => !candidate.disabled && candidate.value) || field.options[0];
        if (option) field.value = option.value;
      } else if (field.type === 'checkbox') {
        field.checked = true;
      } else if (!['button', 'submit', 'password', 'file'].includes(field.type)) {
        field.value = 'LTTH docs demo';
      }
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }, asset.selector);
  }
}

async function frameRelevantPluginUi(page, asset) {
  // Interactive Story reserves a wide shell for a runtime status column. In
  // the offline documentation state that column is empty, so frame the real
  // configuration card rather than publishing a mostly blank 1280x800 image.
  if (asset.guideId !== 'interactive-story' || !asset.route.includes('/ui.html')) return;
  await page.evaluate(() => {
    const card = document.getElementById('configurationCard');
    if (!card) return;
    card.setAttribute('data-ltth-docs-framed-ui', 'true');
    let style = document.getElementById('ltth-docs-capture-frame-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'ltth-docs-capture-frame-style';
      style.textContent = '[data-ltth-docs-framed-ui]{position:fixed!important;inset:28px 40px!important;width:auto!important;max-height:calc(100vh - 56px)!important;overflow:auto!important;z-index:100!important;background:#071008!important;}';
      document.head.appendChild(style);
    }
  });
}

async function captureAsset(page, baseUrl, asset, locale) {
  await page.setViewport(asset.viewport);
  // Overlay renderers can start live sockets, WebGL loops, or audio engines on
  // load. For documentation we preserve their shipped markup and styles while
  // preventing that unsafe runtime work in the isolated capture browser.
  const needsOpenShockDemo = asset.guideId === 'openshock' && asset.action && asset.action.type === 'open-overlay-preview';
  const needsSpotlightDemo = asset.guideId === 'spotlight' && asset.action && asset.action.type === 'open-overlay-preview';
  // Interactive Story has a large, self-starting admin runtime that begins
  // status polling before a test story has been configured. The shipped HTML
  // already contains the complete configuration UI, so documenting its safe
  // empty state must not start that runtime or make a network request.
  const staticOnly = needsOpenShockDemo || asset.guideId === 'interactive-story';
  await page.setJavaScriptEnabled(!staticOnly);
  const response = await page.goto(urlFor(baseUrl, asset.route, locale), { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
  if (!response || response.status() >= 400) throw new Error(`HTTP ${response ? response.status() : 'no response'} for ${asset.route}`);
  await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));
  if (needsOpenShockDemo) {
    await page.setJavaScriptEnabled(true);
    await page.addScriptTag({ url: `${baseUrl}/plugins/openshock/overlay/openshock_overlay.js` });
    await page.waitForFunction(() => typeof window.handleCommandSent === 'function', { timeout: 3000 });
    await page.evaluate(() => window.handleCommandSent({
      type: 'vibrate',
      intensity: 20,
      duration: 800,
      deviceName: 'Offline demo device',
      username: 'Demo user',
      source: 'docs-demo'
    }));
  }
  if (needsSpotlightDemo) {
    await page.evaluate((lang) => {
      const labels = {
        de: 'Sichere Docs-Demo · Spotlight-Chatter-Vorschau',
        en: 'Safe docs demo · Spotlight chatter preview',
        es: 'Demo segura de docs · vista previa de chatter Spotlight',
        fr: 'Démo docs sûre · aperçu chatter Spotlight'
      };
      const container = document.getElementById('overlay-container');
      if (!container) return;
      const sample = document.createElement('div');
      sample.className = 'no-data';
      sample.setAttribute('data-ltth-docs-safe-demo', 'true');
      sample.textContent = labels[lang] || labels.en;
      container.appendChild(sample);
    }, locale);
  }
  const tabPreparation = await activateContainingTab(page, asset.selector);
  await applySafeStepState(page, asset, locale);
  await frameRelevantPluginUi(page, asset);
  const revealPreparation = await revealSafeDemoState(page, asset.selector);
  const preparation = [tabPreparation, revealPreparation].filter(Boolean);
  const focus = await applyCaptureFocus(page, asset.selector, asset.focusText[locale]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const state = await page.evaluate((lang) => ({
    lang: document.documentElement.lang || document.documentElement.getAttribute('data-lang') || null,
    i18n: window.i18n && typeof window.i18n.getLocale === 'function' ? window.i18n.getLocale() : (window.I18n && window.I18n.currentLang) || document.documentElement.lang || null,
    theme: document.documentElement.getAttribute('data-theme') || null,
    route: `${location.pathname}${location.search}`
  }), locale);
  if (state.lang !== locale) throw new Error(`Document language is ${state.lang || 'unset'}, expected ${locale}`);
  if (state.theme !== 'cid') throw new Error(`Theme is ${state.theme || 'unset'}, expected cid`);
  const target = outputPath(asset, locale);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, type: 'png' });
  const bytes = fs.readFileSync(target);
  return {
    locale,
    id: asset.id,
    guideId: asset.guideId,
    stepId: asset.stepId,
    path: path.relative(REPO_ROOT, target).replace(/\\/g, '/'),
    route: asset.route,
    selector: asset.selector,
    action: asset.action,
    fixture: asset.fixture,
    focus,
    preparation,
    state,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length
  };
}

async function captureDocs(spec, assets, locales) {
  const puppeteer = loadPuppeteer();
  const executablePath = browserExecutablePath();
  const browser = await puppeteer.launch({ headless: 'new', ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const outputs = [];
  const failures = [];
  try {
    const createCapturePage = async (locale) => {
      const page = await browser.newPage();
      await attachPluginAssetRewrite(page);
      await configurePage(page, locale);
      return page;
    };
    const byGuide = new Map();
    for (const asset of assets) {
      const group = byGuide.get(asset.guideId) || [];
      group.push(asset);
      byGuide.set(asset.guideId, group);
    }
    for (const locale of locales) {
      for (const [guideId, guideAssets] of byGuide) {
        let app;
        let page;
        try {
          console.log(`Capturing ${locale}/${guideId} (${guideAssets.length} steps)`);
          app = await startIsolatedApp(`${guideId}-${locale}`);
          page = await createCapturePage(locale);
          for (const asset of guideAssets) {
            try {
              outputs.push(await withTimeout(captureAsset(page, app.baseUrl, asset, locale), `${locale}/${asset.id}`));
            } catch (error) {
              failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: error.message });
              if (error.message.includes('Timed out after')) {
                await page.close().catch(() => {});
                page = await createCapturePage(locale);
              }
            }
          }
        } catch (error) {
          for (const asset of guideAssets) failures.push({ locale, id: asset.id, guideId, stepId: asset.stepId, route: asset.route, selector: asset.selector, error: `Isolated guide process failed: ${error.message}` });
        } finally {
          if (page) await page.close();
          if (app) await stopIsolatedApp(app);
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { outputs, failures };
}

async function captureProduct(spec, assets, locales) {
  // The product collection retains the historical shared-process behavior;
  // docs always use captureDocs above because each guide must be isolated.
  const puppeteer = loadPuppeteer();
  const executablePath = browserExecutablePath();
  const app = await startIsolatedApp('product');
  const browser = await puppeteer.launch({ headless: 'new', ...(executablePath ? { executablePath } : {}), args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const outputs = [];
  const failures = [];
  try {
    for (const locale of locales) {
      const page = await browser.newPage();
      await attachPluginAssetRewrite(page);
      await configurePage(page, locale);
      for (const asset of assets) {
        try { outputs.push(await captureAsset(page, app.baseUrl, asset, locale)); } catch (error) { failures.push({ locale, id: asset.id, route: asset.route, error: error.message }); }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    await stopIsolatedApp(app);
  }
  return { outputs, failures };
}

async function capture() {
  const fullSpec = COLLECTION === 'docs' ? buildDocsSpec(REPO_ROOT) : buildSpec(REPO_ROOT);
  const locales = (process.env.SCREENSHOT_LANGS || (COLLECTION === 'docs' ? DOCS_LOCALES : PRODUCT_LOCALES).join(','))
    .split(',').map((value) => value.trim().toLowerCase()).filter((value) => (COLLECTION === 'docs' ? DOCS_LOCALES : PRODUCT_LOCALES).includes(value));
  if (!locales.length) throw new Error('SCREENSHOT_LANGS must contain supported locales');
  let assets = [...fullSpec.assets];
  const requestedIds = (process.env.SCREENSHOT_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (requestedIds.length) assets = assets.filter((asset) => requestedIds.includes(asset.id));
  const limit = Number(process.env.SCREENSHOT_LIMIT || 0);
  if (limit > 0) assets = assets.slice(0, limit);
  if (!assets.length) throw new Error('No capture assets selected');

  const result = COLLECTION === 'docs' ? await captureDocs(fullSpec, assets, locales) : await captureProduct(fullSpec, assets, locales);
  const fullHash = specHash(fullSpec);
  const manifest = {
    ...fullSpec,
    collection: COLLECTION,
    sourceUrl: START_APP ? 'isolated-local-process' : EXTERNAL_BASE_URL,
    capturedAt: new Date().toISOString(),
    specHash: fullHash,
    requestedLocales: locales,
    requestedIds: assets.map((asset) => asset.id),
    outputs: result.outputs,
    failures: result.failures
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Captured ${result.outputs.length} screenshots; ${result.failures.length} failed.`);
  console.log(`Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
  if (result.failures.length) process.exitCode = 1;
}

capture().catch((error) => {
  console.error(`Fatal screenshot capture error: ${error.stack || error.message}`);
  process.exitCode = 1;
});
