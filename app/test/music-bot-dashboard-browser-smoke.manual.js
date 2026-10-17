'use strict';

// Isolated real-browser smoke for the original Music Bot dashboard UI.
// Uses only deterministic loopback fixtures; it never starts LTTH, a provider,
// audio playback, or a product profile.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');
const { Server } = require('socket.io');

const APP = path.resolve(__dirname, '..');
const ROOT = path.resolve(APP, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png'
};
const FIXTURE_SONG = {
  title: 'Browser Fixture Song',
  artist: 'Local fixture',
  duration: 120,
  source: 'youtube',
  youtubeId: 'SMOKE123'
};

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function safeFile(relative) {
  const full = path.resolve(ROOT, relative);
  invariant(full.startsWith(`${ROOT}${path.sep}`), 'static path escaped workspace');
  return full;
}

async function installRequestGuard(context, origin, blockedExternal, youtubeFrameFixtures) {
  await context.route('**/*', async (route) => {
    const target = route.request().url();
    if (target.startsWith(`${origin}/`)) return route.continue();
    if (/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\//.test(target)) {
      youtubeFrameFixtures.push(target);
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>fixture</title>' });
    }
    blockedExternal.push(target);
    await route.abort('blockedbyclient');
  });
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const trace = (stage) => process.stderr.write(`[music-bot-smoke] ${stage}\n`);
  invariant(fs.existsSync(CHROME), `Chrome executable missing: ${CHROME}`);
  const counters = { requests: 0, emptyRequestPosts: 0, deniedRoutes: [], apiPaths: [] };
  let fixtureMode = 'success';
  const contexts = [];
  const cleanupReceipt = { contextsClosed: 0, browserClosed: false, ioCloseCallback: false, httpServerClosed: false };
  let allowlist;
  const server = http.createServer((req, res) => {
    const host = req.headers.host;
    if (host !== `127.0.0.1:${server.address()?.port}`) {
      res.writeHead(404).end();
      return;
    }
    const url = new URL(req.url, `http://${host}`);
    const headers = {
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self' data: blob:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:*; frame-src https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff'
    };
    const json = (status, value) => {
      res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };

    if (req.method === 'GET' && url.pathname === '/api/gift-catalog') {
      counters.apiPaths.push(`${req.method} ${url.pathname}`);
      return json(200, { catalog: [] });
    }
    if (url.pathname.startsWith('/api/plugins/music-bot/')) {
      counters.apiPaths.push(`${req.method} ${url.pathname}`);
      const route = url.pathname.slice('/api/plugins/music-bot'.length);
      if (req.method === 'GET' && route === '/resolve') {
        if (fixtureMode === 'errors') return json(503, { success: false, error: 'Fixture resolve unavailable' });
        return json(200, { success: true, song: FIXTURE_SONG });
      }
      if (req.method === 'POST' && route === '/request') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > 8192) req.destroy();
        });
        req.on('end', () => {
          let payload;
          try { payload = JSON.parse(body || '{}'); } catch { return json(400, { success: false }); }
          if (typeof payload.query !== 'string' || !payload.query.trim()) {
            counters.emptyRequestPosts += 1;
            return json(400, { success: false, error: 'invalid request' });
          }
          if (fixtureMode === 'errors') return json(429, { success: false, error: 'Fixture request rejected' });
          counters.requests += 1;
          return json(200, { success: true, song: FIXTURE_SONG, position: 1 });
        });
        return;
      }
      if (req.method === 'GET' && route === '/status') return json(200, { success: true, nowPlaying: null, queueLength: 0, playbackState: 'idle', onboarding: { completed: true } });
      if (req.method === 'GET' && route === '/queue') return json(200, { success: true, queue: [] });
      if (req.method === 'GET' && route === '/history') return json(200, { success: true, history: [], total: 0 });
      if (req.method === 'GET' && route === '/config') return json(200, { success: true, config: { autoDJ: { enabled: false }, permissions: { requireSuperfanForRequest: false } } });
      if (req.method === 'GET' && route === '/setup-status') return json(200, { success: true, issues: [] });
      if (req.method === 'GET' && route === '/auto-dj/status') return json(200, { success: true, status: { enabled: false } });
      if (req.method === 'GET' && route === '/radio/plan') return json(200, { success: true, plan: [] });
      if (req.method === 'GET' && route === '/radio/playlist-sources') return json(200, { success: true, sources: [] });
      if (req.method === 'GET' && route === '/bans') return json(200, { success: true, bans: [] });
      if (req.method === 'GET' && route === '/playlists') return json(200, { success: true, playlists: [] });
      if (req.method === 'GET' && route === '/streamer-playlist') return json(200, { success: true, playlist: null, suggestions: [] });
      if (req.method === 'GET' && route === '/catalog/search') return json(200, { success: true, songs: [] });
      return json(404, { success: false });
    }

    const localAssets = {
      '/plugins/music-bot/ui': 'app/plugins/music-bot/ui.html',
      '/plugins/music-bot/assets/ui.js': 'app/plugins/music-bot/assets/ui.js',
      '/plugins/music-bot/assets/ui-style.css': 'app/plugins/music-bot/assets/ui-style.css',
      '/plugins/music-bot/assets/musicbotlogo.png': 'app/plugins/music-bot/assets/musicbotlogo.png',
      '/plugins/music-bot/assets/soundbot.png': 'app/plugins/music-bot/assets/soundbot.png',
      '/plugins/music-bot/locales/en.json': 'app/plugins/music-bot/locales/en.json',
      '/plugins/music-bot/locales/de.json': 'app/plugins/music-bot/locales/de.json',
      '/css/themes.css': 'app/public/css/themes.css',
      '/js/i18n-client.js': 'app/public/js/i18n-client.js',
      '/js/tiktok-studio-url.js': 'app/public/js/tiktok-studio-url.js',
      '/api/i18n/translations/en': 'app/locales/en.json',
      '/api/i18n/translations/de': 'app/locales/de.json'
    };
    if (req.method === 'GET' && allowlist.has(url.pathname)) return sendFile(safeFile(localAssets[url.pathname]), res, headers);
    counters.deniedRoutes.push(`${req.method} ${url.pathname}`);
    res.writeHead(404, headers).end();
  });
  function sendFile(file, res, headers) {
    try {
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { ...headers, 'Content-Type': type });
      fs.createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404, headers).end();
    }
  }
  allowlist = new Set([
    '/plugins/music-bot/ui', '/plugins/music-bot/assets/ui.js',
    '/plugins/music-bot/assets/ui-style.css', '/plugins/music-bot/assets/musicbotlogo.png',
    '/plugins/music-bot/assets/soundbot.png', '/plugins/music-bot/locales/en.json',
    '/plugins/music-bot/locales/de.json',
    '/css/themes.css', '/js/i18n-client.js', '/js/tiktok-studio-url.js',
    '/api/i18n/translations/en', '/api/i18n/translations/de'
  ]);

  const io = new Server(server, { path: '/socket.io', serveClient: true, cors: false });
  io.on('connection', (socket) => {
    socket.on('musicbot:request-status', () => {
      socket.emit('musicbot:now-playing', null);
      socket.emit('musicbot:queue-updated', []);
    });
  });
  let browser;
  let runError = null;
  let result;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({
      headless: true,
      executablePath: CHROME,
      args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run']
    });
    const chromeVersion = browser.version();
    const context = await browser.newContext();
    contexts.push(context);
    trace('browser launched, isolated context created');
    const page = await context.newPage();
    const blockedExternal = [];
    const youtubeFrameFixtures = [];
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') pageErrors.push(`console: ${message.text()}`); });
    page.on('requestfailed', (request) => pageErrors.push(`request failed: ${request.url()} ${request.failure()?.errorText || ''}`));
    await installRequestGuard(context, origin, blockedExternal, youtubeFrameFixtures);
    await page.goto(`${origin}/plugins/music-bot/ui?lang=en`, { waitUntil: 'domcontentloaded' });
    trace('dashboard document loaded');
    await page.waitForFunction(() => window.i18n?.ready && document.getElementById('request-btn'));
    await page.waitForTimeout(250);
    trace('dashboard boot ready');

    const popupCanaryUrl = 'https://example.invalid/ltth-smoke-egress-canary';
    const popupPagePromise = context.waitForEvent('page');
    await page.evaluate(() => { window.open('about:blank', '_blank'); });
    const popupPage = await popupPagePromise;
    await popupPage.goto(popupCanaryUrl, { waitUntil: 'commit', timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(50);
    await popupPage.close().catch(() => {});
    invariant(blockedExternal.includes(popupCanaryUrl), `context route did not intercept popup canary; popup=${popupPage.url()} blocked=${JSON.stringify(blockedExternal)}`);
    trace('external popup canary intercepted by context route');

    const focusPath = [];
    for (let i = 0; i < 30; i += 1) {
      const id = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
      if (id === 'search-input') break;
      await page.keyboard.press('Tab');
    }
    invariant(await page.evaluate(() => document.activeElement?.id) === 'search-input', 'keyboard could not reach search input');
    focusPath.push('search-input');
    await page.keyboard.press('Tab');
    focusPath.push(await page.evaluate(() => document.activeElement?.id));
    await page.keyboard.press('Tab');
    focusPath.push(await page.evaluate(() => document.activeElement?.id));
    invariant(focusPath.join(',') === 'search-input,search-btn,request-btn', `unexpected search keyboard order: ${focusPath.join(',')}`);
    trace('keyboard order confirmed');

    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('request-feedback')?.textContent.trim().length > 0, null, { timeout: 3000 }).catch(async () => {
      const state = await page.evaluate(() => ({ feedback: document.getElementById('request-feedback')?.textContent, active: document.activeElement?.id, button: document.getElementById('request-btn')?.outerHTML, ui: typeof window.MusicBotUI, io: typeof window.io, i18n: Boolean(window.i18n), scripts: [...document.scripts].map((script) => ({ src: script.src, ready: script.readyState })) }));
      throw new Error(`empty request yielded no feedback: ${JSON.stringify({ state, pageErrors })}`);
    });
    invariant(!(await page.locator('#request-feedback').textContent()).includes('Browser Fixture Song'), 'empty request unexpectedly reported a song');
    invariant(counters.requests === 0 && counters.emptyRequestPosts === 0, 'empty keyboard request reached POST endpoint');
    invariant(await page.locator('#request-feedback').getAttribute('aria-live') === 'polite', 'request feedback is not a polite live region');
    trace('empty request is rejected locally');

    await page.locator('#search-input').focus();
    await page.locator('#search-input').fill('browser smoke query');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('search-feedback')?.textContent.includes('Browser Fixture Song'), null, { timeout: 5000 });
    invariant(await page.locator('#search-feedback').getAttribute('role') === 'status', 'search feedback lacks status role');
    invariant(await page.locator('#search-feedback').getAttribute('aria-live') === 'polite', 'search feedback lacks polite announcement');
    invariant((await page.locator('#preview-frame').getAttribute('src'))?.includes('SMOKE123'), 'preview did not use the deterministic fixture song');
    await page.waitForTimeout(100);
    invariant(youtubeFrameFixtures.length === 1, `expected one blank YouTube frame fixture, got ${youtubeFrameFixtures.length}`);
    trace('deterministic preview loaded');

    await page.locator('#search-input').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    invariant(await page.evaluate(() => document.activeElement?.id) === 'request-btn', 'request button lost expected keyboard focus');
    await page.keyboard.press('Enter');
    trace('request submitted via Enter');
    await page.waitForFunction(() => document.getElementById('request-feedback')?.textContent.includes('Browser Fixture Song'), null, { timeout: 5000 });
    trace('request success feedback appeared');
    invariant(counters.requests === 1, `expected one POST /request, got ${counters.requests}`);
    invariant(await page.locator('#request-btn').isEnabled(), 'request button remained disabled after response');
    invariant((await page.locator('#request-btn').getAttribute('aria-busy')) !== 'true', 'request button remained busy after response');
    const unexpectedBlockedExternal = blockedExternal.filter((url) => url !== popupCanaryUrl);
    invariant(unexpectedBlockedExternal.length === 0, `unexpected external requests: ${unexpectedBlockedExternal.join(', ')}`);
    invariant(counters.deniedRoutes.length === 0, `unexpected locally denied requests: ${counters.deniedRoutes.join(', ')}`);
    await context.close();
    contexts.splice(contexts.indexOf(context), 1);
    cleanupReceipt.contextsClosed += 1;
    trace('browser context closed');

    const historyVariantResponse = await fetch(`${origin}/api/plugins/music-bot/history-canary`);
    invariant(historyVariantResponse.status === 404, `history prefix variant should be denied, got ${historyVariantResponse.status}`);
    const methodVariantResponse = await fetch(`${origin}/api/plugins/music-bot/status`, { method: 'POST' });
    invariant(methodVariantResponse.status === 404, `unsupported fixture method should be denied, got ${methodVariantResponse.status}`);
    const boundaryProbes = [
      { request: 'GET /api/plugins/music-bot/history-canary', status: historyVariantResponse.status },
      { request: 'POST /api/plugins/music-bot/status', status: methodVariantResponse.status }
    ];

    fixtureMode = 'errors';
    const errorContext = await browser.newContext();
    contexts.push(errorContext);
    const errorPage = await errorContext.newPage();
    const errorBlockedExternal = [];
    const errorYoutubeFixtures = [];
    const errorPageErrors = [];
    errorPage.on('pageerror', (error) => errorPageErrors.push(error.message));
    await installRequestGuard(errorContext, origin, errorBlockedExternal, errorYoutubeFixtures);
    await errorPage.goto(`${origin}/plugins/music-bot/ui?lang=en&scenario=errors`, { waitUntil: 'domcontentloaded' });
    await errorPage.waitForFunction(() => window.i18n?.ready && document.getElementById('request-btn'));
    await errorPage.waitForTimeout(250);

    await errorPage.locator('#search-input').fill('resolve failure query');
    await errorPage.keyboard.press('Enter');
    await errorPage.waitForFunction(() => document.getElementById('search-feedback')?.textContent.includes('Fixture resolve unavailable'), null, { timeout: 5000 });
    invariant(await errorPage.locator('#search-feedback').getAttribute('role') === 'status', 'resolve failure lost status role');
    invariant(await errorPage.locator('#search-feedback').getAttribute('aria-live') === 'polite', 'resolve failure lost polite live region');
    invariant((await errorPage.locator('#musicbot-toast-container .musicbot-toast').count()) === 0, 'resolve failure created a duplicate toast announcement');

    await errorPage.locator('#search-input').focus();
    await errorPage.keyboard.press('Tab');
    await errorPage.keyboard.press('Tab');
    invariant(await errorPage.evaluate(() => document.activeElement?.id) === 'request-btn', 'error scenario request button was not keyboard focused');
    await errorPage.keyboard.press('Enter');
    await errorPage.waitForFunction(() => document.getElementById('request-feedback')?.textContent.includes('Fixture request rejected'), null, { timeout: 5000 });
    invariant(await errorPage.locator('#request-feedback').getAttribute('role') === 'status', 'request failure lost status role');
    invariant(await errorPage.locator('#request-feedback').getAttribute('aria-live') === 'polite', 'request failure lost polite live region');
    const errorToasts = errorPage.locator('#musicbot-toast-container .musicbot-toast');
    invariant(await errorToasts.count() === 1, `expected one visual error toast, got ${await errorToasts.count()}`);
    invariant(await errorToasts.first().getAttribute('aria-hidden') === 'true', 'error toast duplicates the inline live announcement');
    invariant(errorBlockedExternal.length === 0, `error scenario made external requests: ${errorBlockedExternal.join(', ')}`);
    invariant(errorPageErrors.length === 0, `error scenario browser errors: ${errorPageErrors.join(', ')}`);
    if (process.env.LTTH_SMOKE_FORCE_ASSERTION_FAILURE === '1') {
      throw new Error('intentional assertion-cleanup probe');
    }
    await errorContext.close();
    contexts.splice(contexts.indexOf(errorContext), 1);
    cleanupReceipt.contextsClosed += 1;
    trace('fresh error-fixture context closed');

    await browser.close();
    cleanupReceipt.browserClosed = true;
    trace('browser process closed');
    browser = null;

    result = {
      runner: path.basename(__filename), node: process.version,
      chrome: chromeVersion,
      playwright: require('playwright/package.json').version,
      origin, keyboardOrder: focusPath, emptyRequestPostCount: counters.emptyRequestPosts,
      requestPostCount: counters.requests, apiPaths: counters.apiPaths,
      deniedLocalRoutes: counters.deniedRoutes, boundaryProbes, blockedExternalUrls: blockedExternal,
      localYoutubeFrameFixtures: youtubeFrameFixtures,
      errorFixtureRun: {
        resolve: '503 structured error shown in role=status/aria-live=polite; no toast created',
        request: '429 structured error shown inline; one toast aria-hidden=true',
        blockedExternalUrls: errorBlockedExternal,
        browserErrors: errorPageErrors
      },
      preview: FIXTURE_SONG.youtubeId, browserContext: 'fresh-incognito'
    };
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];
    for (const context of [...contexts].reverse()) {
      try {
        await withTimeout(context.close(), 4000, 'browser context close');
        cleanupReceipt.contextsClosed += 1;
      } catch (error) {
        cleanupErrors.push(error.message);
      }
    }
    contexts.length = 0;
    if (browser) {
      try {
        await withTimeout(browser.close(), 5000, 'browser close');
        cleanupReceipt.browserClosed = true;
      } catch (error) {
        cleanupErrors.push(error.message);
      }
      browser = null;
    }
    try {
      let callbackCalled = false;
      await withTimeout(new Promise((resolve, reject) => {
        io.close((error) => {
          callbackCalled = true;
          if (error) reject(error);
          else resolve();
        });
      }), 5000, 'Socket.IO/HTTP close');
      cleanupReceipt.ioCloseCallback = callbackCalled;
      cleanupReceipt.httpServerClosed = !server.listening;
      if (server.listening) throw new Error('HTTP server still listening after Socket.IO close callback');
    } catch (error) {
      cleanupErrors.push(error.message);
      server.closeAllConnections();
      if (server.listening) {
        try {
          await withTimeout(new Promise((resolve, reject) => {
            server.close((closeError) => closeError ? reject(closeError) : resolve());
          }), 3000, 'fixture HTTP fallback close');
        } catch (closeError) {
          cleanupErrors.push(closeError.message);
        }
      }
      cleanupReceipt.httpServerClosed = !server.listening;
    }
    trace(`cleanup receipt ${JSON.stringify(cleanupReceipt)}`);
    if (cleanupErrors.length) {
      const cleanupMessage = `cleanup failed: ${cleanupErrors.join('; ')}`;
      if (runError) runError.message += `; ${cleanupMessage}`;
      else runError = new Error(cleanupMessage);
    }
  }
  if (runError) throw runError;
  process.stdout.write(`${JSON.stringify({ ...result, cleanup: cleanupReceipt }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
