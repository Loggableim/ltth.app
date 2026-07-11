'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { buildSpec, LOCALES } = require('./product-screenshot-spec');
const { buildDocsSpec } = require('./docs-screenshot-spec');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const COLLECTION = process.env.SCREENSHOT_COLLECTION === 'docs' ? 'docs' : 'product';
const MANIFEST_PATH = path.join(SCREENSHOT_ROOT, COLLECTION === 'docs' ? 'docs-capture-manifest.json' : 'product-capture-manifest.json');
const BASE_URL = (process.env.SCREENSHOT_BASE_URL || 'http://127.0.0.1:3128').replace(/\/$/, '');
const PORT = Number(process.env.SCREENSHOT_APP_PORT || 3128);
const TIMEOUT_MS = Number(process.env.SCREENSHOT_TIMEOUT_MS || 60000);
const WAIT_AFTER_LOAD_MS = Number(process.env.SCREENSHOT_WAIT_AFTER_LOAD_MS || 500);
const START_APP = process.env.SCREENSHOT_START_APP !== 'false';

function loadPuppeteer() {
  try {
    return require(path.join(REPO_ROOT, 'app', 'node_modules', 'puppeteer'));
  } catch (error) {
    return require('puppeteer');
  }
}

function browserExecutablePath() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ]
    : [];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function outputPath(asset, locale) {
  const relative = asset.replace(/^\/screenshots\//, '');
  const root = locale === 'en' ? SCREENSHOT_ROOT : path.join(SCREENSHOT_ROOT, locale);
  return path.join(root, relative);
}

function urlFor(route, locale) {
  const separator = route.includes('?') ? '&' : '?';
  return `${BASE_URL}${route}${separator}lang=${locale}`;
}

function staticPluginFallback(route) {
  const explicit = {
    '/fireworks/ui': '/plugins/fireworks/ui/settings.html',
    '/flame-overlay/ui': '/plugins/flame-overlay/ui/settings.html',
    '/interactive-story/ui': '/plugins/interactive-story/ui.html',
    '/plugins/music-bot/ui': '/plugins/music-bot/ui.html',
    '/minecraft-connect/ui': '/plugins/minecraft-connect/minecraft-connect.html',
    '/quiz-show/ui': '/plugins/quiz-show/quiz_show.html',
    '/stt-ticker/capture': '/plugins/stt-ticker/capture.html',
  };
  if (explicit[route]) return explicit[route];
  const mounted = route.match(/^\/plugins\/([^/?]+)\/ui(?:\?.*)?$/);
  if (mounted) return `/plugins/${mounted[1]}/ui.html`;
  const match = route.match(/^\/([^/?]+)\/ui(?:\?.*)?$/);
  return match ? `/plugins/${match[1]}/ui.html` : null;
}

function rewritePluginAssetRequest(request) {
  const url = new URL(request.url());
  const match = url.pathname.match(/^\/([a-z0-9-]+)(\/assets\/.*)$/i);
  if (!match || url.pathname.startsWith('/plugins/')) return false;
  url.pathname = `/plugins/${match[1]}${match[2]}`;
  request.continue({ url: url.toString() });
  return true;
}

async function navigateToTarget(page, route, locale, timeoutMs) {
  const fallback = staticPluginFallback(route);
  try {
    let response = await page.goto(urlFor(route, locale), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (response && response.status() === 404 && fallback) {
      response = await page.goto(urlFor(fallback, locale), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    }
    return response;
  } catch (error) {
    if (!fallback) throw error;
    return page.goto(urlFor(fallback, locale), { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  }
}

function waitForServer(child) {
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
        const response = await fetch(`${BASE_URL}/api/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          clearInterval(timer);
          resolve();
          return;
        }
      } catch (_) {
        // The server is still starting.
      }
      if (Date.now() - started > 90000) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for the isolated LTTH app'));
      }
    }, 500);
  });
}

function startApp() {
  if (!START_APP) return null;
  const isolatedLocalAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-product-capture-'));
  const node = process.execPath;
  const child = spawn(node, [path.join(REPO_ROOT, 'app', 'server.js')], {
    cwd: path.join(REPO_ROOT, 'app'),
    env: {
      ...process.env,
      LOCALAPPDATA: isolatedLocalAppData,
      LTTH_PORT: String(PORT),
      LTTH_DISABLE_TIKTOK_AUTO_RECONNECT: 'true',
      LTTH_NO_BROWSER: 'true',
      DISABLE_SWAGGER: 'true',
      LTTH_BIND_ADDRESS: '127.0.0.1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stderr.write(`[ltth] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[ltth:err] ${chunk}`));
  return { child, isolatedLocalAppData };
}

async function capture() {
  const fullSpec = COLLECTION === 'docs' ? buildDocsSpec(REPO_ROOT) : buildSpec(REPO_ROOT);
  const spec = { ...fullSpec, assets: [...fullSpec.assets] };
  const limit = Number(process.env.SCREENSHOT_LIMIT || 0);
  if (limit > 0) spec.assets = spec.assets.slice(0, limit);
  const requestedIds = (process.env.SCREENSHOT_IDS || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (requestedIds.length) spec.assets = spec.assets.filter((asset) => requestedIds.includes(asset.id));
  const requestedLocales = (process.env.SCREENSHOT_LANGS || LOCALES.join(','))
    .split(',').map((value) => value.trim().toLowerCase()).filter((value) => LOCALES.includes(value));
  if (!requestedLocales.length) throw new Error('SCREENSHOT_LANGS must contain de, en, es and/or fr');

  const app = startApp();
  let browser;
  const outputs = [];
  const failures = [];
  try {
    if (app) await waitForServer(app.child);

    const puppeteer = loadPuppeteer();
    const executablePath = browserExecutablePath();
    browser = await puppeteer.launch({
      headless: 'new',
      ...(executablePath ? { executablePath } : {}),
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    let lastRoute = null;
    let lastLocale = null;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (!rewritePluginAssetRequest(request)) request.continue();
    });

    for (const locale of requestedLocales) {
    await page.evaluateOnNewDocument((lang) => {
      localStorage.setItem('dashboard-theme', 'cid');
      localStorage.setItem('app_locale', lang);
      document.documentElement.setAttribute('data-theme', 'cid');
    }, locale);

    for (const asset of spec.assets) {
      const target = outputPath(asset.canonical, locale);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      try {
        await page.setViewport({ width: asset.viewport.width, height: asset.viewport.height, deviceScaleFactor: asset.viewport.deviceScaleFactor });
        const reuseCurrentPage = COLLECTION === 'docs' && lastRoute === asset.route && lastLocale === locale;
        const response = reuseCurrentPage ? { status: () => 200 } : await navigateToTarget(page, asset.route, locale, TIMEOUT_MS);
        if (!response || response.status() >= 400) throw new Error(`HTTP ${response ? response.status() : 'no response'}`);
        await new Promise((resolve) => setTimeout(resolve, WAIT_AFTER_LOAD_MS));
        await page.evaluate(async (lang) => {
          if (window.i18n && typeof window.i18n.setLocale === 'function') {
            await window.i18n.setLocale(lang);
          }
          document.documentElement.lang = lang;
          localStorage.setItem('app_locale', lang);
        }, locale);
        await new Promise((resolve) => setTimeout(resolve, 150));
        const state = await page.evaluate((lang) => {
          document.documentElement.setAttribute('data-theme', 'cid');
          return {
            lang: document.documentElement.lang || document.documentElement.getAttribute('data-lang'),
            i18n: window.i18n && typeof window.i18n.getLocale === 'function' ? window.i18n.getLocale() : null,
            theme: document.documentElement.getAttribute('data-theme'),
          };
        }, locale);
        if (state.theme !== 'cid') throw new Error(`Theme is ${state.theme || 'unset'}, expected cid`);
        await page.screenshot({ path: target, type: 'png' });
        lastRoute = asset.route;
        lastLocale = locale;
        outputs.push({ locale, id: asset.id, path: path.relative(REPO_ROOT, target).replace(/\\/g, '/'), route: asset.route, state });
      } catch (error) {
        failures.push({ locale, id: asset.id, route: asset.route, error: error.message });
        console.error(`FAIL ${locale}/${asset.id}: ${error.message}`);
      }
    }
    }
  } finally {
    if (browser) await browser.close();
    if (app && app.child.exitCode === null) app.child.kill();
  }

  let previous = null;
  if (fs.existsSync(MANIFEST_PATH)) {
    try { previous = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); } catch (_) { previous = null; }
  }
  const isCurrentTarget = (entry) => requestedIds.length === 0
    || (requestedLocales.includes(entry.locale) && requestedIds.includes(entry.id));
  const manifest = {
    ...fullSpec,
    collection: COLLECTION,
    sourceUrl: BASE_URL,
    capturedAt: new Date().toISOString(),
    requestedLocales,
    outputs: [...(previous?.outputs || []).filter((entry) => !isCurrentTarget(entry)), ...outputs],
    failures: [...(previous?.failures || []).filter((entry) => !isCurrentTarget(entry)), ...failures],
  };
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Captured ${outputs.length} screenshots; ${failures.length} failed.`);
  console.log(`Manifest: ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
  if (failures.length) process.exitCode = 1;
}

capture().catch((error) => {
  console.error(`Fatal screenshot capture error: ${error.stack || error.message}`);
  process.exitCode = 1;
});
