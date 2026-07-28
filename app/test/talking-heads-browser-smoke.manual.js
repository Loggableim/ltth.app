'use strict';

/*
 * Safe real-browser smoke coverage for the Talking Heads Stream Director.
 *
 * This intentionally starts neither app/server.js nor any tunnel/OBS/TikTok
 * integration. It serves the real plugin assets from a loopback-only,
 * ephemeral HTTP + Socket.IO fixture and uses a fresh Chrome profile.
 */

const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { Server: SocketIOServer } = require('socket.io');

const APP_ROOT = path.resolve(__dirname, '..');
const PLUGIN_ROOT = path.join(APP_ROOT, 'plugins', 'talking-heads');
const PUBLIC_ROOT = path.join(APP_ROOT, 'public');
const OUTPUT_DIR = path.join(APP_ROOT, 'output', 'playwright', 'talking-heads');
const DEFAULT_CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BobaAssetPrefix = '/plugins/talking-heads/assets/asset-packs/boba/animals';

function requireInstalledChrome() {
  const executablePath = process.env.LTTH_CHROME_PATH || DEFAULT_CHROME_PATH;
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Chrome executable is unavailable: ${executablePath}`);
  }
  return fs.realpathSync.native(executablePath);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitFor(condition, description, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return;
    await delay(25);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  }[extension] || 'application/octet-stream';
}

function resolveWithin(root, relativePath) {
  const parts = relativePath.split('/').filter(Boolean);
  if (!parts.length || parts.some(part => part === '.' || part === '..' || part.includes('\\'))) {
    return null;
  }
  const resolved = path.resolve(root, ...parts);
  const relation = path.relative(root, resolved);
  if (relation.startsWith('..') || path.isAbsolute(relation)) return null;
  return resolved;
}

function staticFileFor(pathname) {
  if (pathname === '/plugins/talking-heads/ui.html') return path.join(PLUGIN_ROOT, 'ui.html');
  if (pathname === '/overlay/talking-heads') return path.join(PLUGIN_ROOT, 'overlay.html');
  if (pathname.startsWith('/overlay/talking-heads/assets/')) {
    return resolveWithin(PLUGIN_ROOT, pathname.slice('/overlay/talking-heads/'.length));
  }
  if (pathname.startsWith('/plugins/talking-heads/')) {
    return resolveWithin(PLUGIN_ROOT, pathname.slice('/plugins/talking-heads/'.length));
  }
  if (pathname.startsWith('/css/')) return resolveWithin(path.join(PUBLIC_ROOT, 'css'), pathname.slice('/css/'.length));
  if (pathname.startsWith('/js/')) return resolveWithin(path.join(PUBLIC_ROOT, 'js'), pathname.slice('/js/'.length));
  return null;
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify(body));
}

function smokeConfig() {
  return {
    enabled: true,
    firstAssignmentEnabled: true,
    rerollGiftEnabled: true,
    assetPack: 'boba',
    assetCharacter: 'Fox',
    assetOptions: { expression: 'neutral' },
    spinDurationMs: 2600,
    animationDuration: 5000,
    rolePermission: 'all',
    cacheEnabled: true,
    cacheDuration: 2592000000,
    spriteMode: 'asset-library',
    manualFallback: true
  };
}

function bobaSprite(character, expression = '') {
  const suffix = expression ? `${character}${expression}` : character;
  return `${BobaAssetPrefix}/${encodeURIComponent(character)}/Ready-To-Use/${encodeURIComponent(suffix)}.png`;
}

function assetCatalog() {
  return {
    packs: [
      {
        id: 'boba',
        name: 'Boba Animals',
        characters: ['Fox', 'Dog', 'Bunny'],
        options: { expression: ['neutral', 'Happy', 'Angry'] }
      },
      {
        id: 'kenney',
        name: 'Kenney Monster Builder',
        characters: ['body_blue'],
        options: { eye: ['eye_human'] }
      },
      {
        id: 'rgs',
        name: 'RGS Character Pack',
        characters: ['head1'],
        options: { hair: ['hair1'], eyes: ['eyes1'], mouth: ['mouth1'] }
      }
    ]
  };
}

function createFixtureHandler(record) {
  return (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const { pathname } = url;
    const method = request.method || 'GET';

    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    // Socket.IO owns this route after it has attached to the same HTTP server.
    if (pathname.startsWith('/socket.io/')) return;

    if (
      ['/api/i18n/translations/de', '/api/talkingheads/overlay/translations/de'].includes(pathname)
      && method === 'GET'
    ) {
      sendJson(response, 200, {
        plugins: {
          'talking-heads': {
            talking_heads_ui: {
              stream_director: {
                overlay: {
                  assigning: 'Neuer Avatar wird zugewiesen',
                  new_voice: 'Neue Stimme',
                  reels_spinning: 'Rollen drehen sich',
                  avatar: 'Avatar'
                }
              }
            }
          }
        }
      });
      return;
    }
    if (pathname === '/api/talkingheads/config' && method === 'GET') {
      sendJson(response, 200, { success: true, config: smokeConfig(), assetCatalog: assetCatalog() });
      return;
    }
    if (pathname === '/api/talkingheads/status' && method === 'GET') {
      sendJson(response, 200, {
        success: true,
        status: {
          enabled: true,
          rendererBridge: { available: true, state: 'playing' },
          activeSpeaker: null,
          activeSpin: null
        }
      });
      return;
    }
    if (pathname === '/api/talkingheads/test-generate' && method === 'POST') {
      record.apiCalls.push(pathname);
      request.resume();
      sendJson(response, 200, {
        success: true,
        spriteUrls: { idle_neutral: bobaSprite('Fox') }
      });
      return;
    }
    if (pathname === '/api/talkingheads/test-spin' && method === 'POST') {
      record.apiCalls.push(pathname);
      request.resume();
      sendJson(response, 200, { success: true });
      return;
    }
    if (pathname === '/api/talkingheads/manual-templates' && method === 'GET') {
      sendJson(response, 200, { success: true, sets: [] });
      return;
    }
    if (pathname === '/api/talkingheads/cache/stats' && method === 'GET') {
      sendJson(response, 200, { success: true, stats: { count: 0, totalSize: 0 } });
      return;
    }
    if (pathname === '/api/talkingheads/cache/list' && method === 'GET') {
      sendJson(response, 200, { success: true, entries: [] });
      return;
    }
    if (pathname === '/api/talkingheads/viewer-bar/config' && method === 'GET') {
      const origin = `http://${request.headers.host}`;
      sendJson(response, 200, {
        success: true,
        config: { enabled: true, maxVisibleViewers: 20, avatarSize: 64 },
        overlayUrl: `${origin}/talking-heads/viewer-bar`
      });
      return;
    }
    if (pathname === '/api/talkingheads/logs' && method === 'GET') {
      sendJson(response, 200, { success: true, logs: [] });
      return;
    }

    const filePath = staticFileFor(pathname);
    if (method === 'GET' && filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      response.writeHead(200, {
        'cache-control': 'no-store',
        'content-type': contentType(filePath)
      });
      fs.createReadStream(filePath).pipe(response);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  };
}

async function startFixture() {
  const record = {
    apiCalls: [],
    completionAcks: [],
    connections: new Set()
  };
  const server = http.createServer(createFixtureHandler(record));
  const io = new SocketIOServer(server, { serveClient: true });
  io.on('connection', socket => {
    record.connections.add(socket.id);
    socket.on('disconnect', () => record.connections.delete(socket.id));
    socket.on('talkingheads:avatar:spin:complete', payload => {
      record.completionAcks.push(payload);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    io,
    origin: `http://127.0.0.1:${port}`,
    record,
    server
  };
}

function closeServer(server) {
  if (!server || !server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function closeSocketServer(io) {
  if (!io) return Promise.resolve();
  return new Promise((resolve, reject) => {
    try {
      io.close(error => error ? reject(error) : resolve());
    } catch (error) {
      reject(error);
    }
  });
}

async function collectCleanupFailure(failures, label, cleanup) {
  try {
    await cleanup();
  } catch (error) {
    failures.push(new Error(`${label} failed: ${error.message}`, { cause: error }));
  }
}

function observeBrowserErrors(page, label, browserErrors) {
  page.on('pageerror', error => browserErrors.push(`${label} pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(`${label} console: ${message.text()}`);
  });
}

async function assertDirectorWorkflow(page, origin, record) {
  await page.goto(`${origin}/plugins/talking-heads/ui.html?lang=de`, { waitUntil: 'load' });
  await page.locator('.th-director[data-surface="broadcast-arcade"]').waitFor();
  await page.locator('#liveBridgeHealth').waitFor();
  await page.locator('#bobaCharacterLab').waitFor();
  await page.locator('#overlaySetup').waitFor();
  await page.waitForFunction(() => document.getElementById('directorState')?.dataset.state === 'ready');
  await page.waitForFunction(() => {
    const image = document.getElementById('assetPreview');
    return Boolean(image?.getAttribute('src')) && image.complete && image.naturalWidth > 0;
  });

  assert.equal(await page.locator('#enabledHealth').textContent(), 'Enabled');
  assert.equal(await page.locator('#rendererHealth').textContent(), 'Audio live');
  assert.equal(await page.locator('#localOverlayUrl').inputValue(), `${origin}/overlay/talking-heads`);
  assert.equal(await page.locator('#assetPack').inputValue(), 'boba');
  assert.equal(await page.locator('#bobaThumbnailGrid .boba-thumbnail').count(), 3);

  await page.locator('#assetPack').selectOption('kenney');
  await page.waitForFunction(() => {
    const grid = document.getElementById('bobaThumbnailGrid');
    return grid?.hidden === true && grid.querySelectorAll('.boba-thumbnail').length === 0;
  });
  assert.equal(await page.locator('#assetPack').inputValue(), 'kenney');
  assert.equal(await page.locator('#bobaThumbnailGrid').evaluate(grid => grid.hidden), true);
  assert.equal(await page.locator('#bobaThumbnailGrid').isHidden(), true);
  assert.equal(await page.locator('#bobaThumbnailGrid').boundingBox(), null);
  assert.equal(await page.locator('#bobaThumbnailGrid .boba-thumbnail').count(), 0);

  await page.locator('#testSpinBtn').click();
  await page.waitForFunction(() => document.getElementById('assetStatus')?.textContent.includes('Safe avatar test spin'));
  assert.equal(record.apiCalls.filter(pathname => pathname === '/api/talkingheads/test-spin').length, 1);

  await page.locator('#advancedSettings > summary').click();
  await page.locator('#viewerBarPanel').waitFor({ state: 'visible' });
  await page.waitForFunction(expected => document.getElementById('viewerBarUrl')?.value === expected, `${origin}/talking-heads/viewer-bar`);
  assert.equal(await page.locator('#advancedSettings').evaluate(details => details.open), true);
  assert.equal(await page.locator('#viewerBarUrl').inputValue(), `${origin}/talking-heads/viewer-bar`);
}

async function assertOverlayWorkflow(page, fixture, screenshotPaths) {
  const { io, origin, record } = fixture;
  await page.goto(`${origin}/overlay/talking-heads?lang=de`, { waitUntil: 'domcontentloaded' });
  await page.locator('#speakerStage').waitFor();
  await page.waitForFunction(() => window.i18n?.initialized === true);
  await waitFor(() => record.connections.size === 1, 'the local overlay Socket.IO connection');

  const spin = {
    playbackId: 'smoke-playback-1',
    spinId: 'smoke-spin-1',
    userId: 'smoke-user-1',
    username: '',
    duration: 350,
    winner: {
      selection: {
        packId: 'rgs',
        characterId: 'head1',
        options: { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' }
      },
      sprites: { idle_neutral: bobaSprite('Fox') }
    },
    candidates: [
      {
        selection: { packId: 'boba', characterId: 'Dog', options: { expression: 'Happy' } },
        spriteUrl: bobaSprite('Dog', 'Happy')
      },
      {
        selection: { packId: 'kenney', characterId: 'body_blue', options: { eye: 'eye_human' } },
        spriteUrl: bobaSprite('Bunny')
      },
      {
        selection: {
          packId: 'rgs',
          characterId: 'head1',
          options: { hair: 'hair1', eyes: 'eyes1', mouth: 'mouth1' }
        },
        spriteUrl: bobaSprite('Fox')
      }
    ]
  };
  io.emit('talkingheads:avatar:spin:start', spin);

  await page.locator('#avatarSpinOverlay').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#slotTitle').textContent(), 'Neuer Avatar wird zugewiesen');
  assert.equal(await page.locator('#slotUsername').textContent(), 'Neue Stimme');
  assert.equal(await page.locator('#slotWinnerName').textContent(), 'Rollen drehen sich');
  assert.equal(await page.locator('[data-slot-reel]').count(), 3);
  assert.equal(await page.locator('[data-slot-reel] .reel-track.is-spinning').count(), 3);
  await waitFor(() => record.completionAcks.length === 1, 'exactly one spin completion acknowledgement');
  await delay(200);
  assert.equal(record.completionAcks.length, 1, 'the simulated local spin must acknowledge once');
  assert.deepEqual(record.completionAcks[0], {
    playbackId: 'smoke-playback-1',
    spinId: 'smoke-spin-1',
    userId: 'smoke-user-1'
  });
  await page.waitForFunction(() => document.getElementById('slotWinnerAvatar')?.getAttribute('src')?.includes('/Fox.png'));
  assert.equal(
    await page.locator('#slotWinnerName').textContent(),
    'RGS · head1 · hair1 · eyes1 · mouth1'
  );
  const revealScreenshot = path.join(OUTPUT_DIR, 'avatar-slot-reveal.png');
  await page.screenshot({ path: revealScreenshot });
  screenshotPaths.push(revealScreenshot);

  await page.locator('#avatarSpinOverlay').waitFor({ state: 'hidden', timeout: 8000 });
  io.emit('talkingheads:animation:start', {
    playbackId: 'smoke-playback-1',
    userId: 'smoke-user-1',
    username: 'Smoke Fox',
    sprites: {
      idle_neutral: bobaSprite('Fox'),
      speak_open: bobaSprite('Fox', 'Happy')
    }
  });
  await page.locator('.avatar.is-visible').waitFor();
  const idleSprite = await page.locator('.avatar img').getAttribute('src');
  io.emit('talkingheads:animation:frame', {
    playbackId: 'smoke-playback-1',
    userId: 'smoke-user-1',
    frame: 'speak_open'
  });
  await page.waitForFunction(previous => document.querySelector('.avatar img')?.getAttribute('src') !== previous, idleSprite);
  assert.match(await page.locator('.avatar img').getAttribute('src'), /FoxHappy\.png$/);
  assert.equal(await page.locator('#speakerStage').evaluate(stage => stage.classList.contains('is-speaking')), true);
  const mouthScreenshot = path.join(OUTPUT_DIR, 'speaker-stage-mouth.png');
  await page.screenshot({ path: mouthScreenshot });
  screenshotPaths.push(mouthScreenshot);

  io.emit('talkingheads:animation:end', {
    playbackId: 'smoke-playback-1',
    userId: 'smoke-user-1',
    fadeOutDuration: 30
  });
  await page.waitForFunction(() => !document.querySelector('.avatar'));
  assert.equal(await page.locator('#speakerStage').evaluate(stage => stage.classList.contains('is-speaking')), false);
  assert.equal(await page.locator('#stageIdle').evaluate(element => element.hidden), false);
}

async function main() {
  const { chromium } = require('playwright');
  const browserErrors = [];
  const cleanupFailures = [];
  const screenshotPaths = [];
  let fixture;
  let context;
  let runFailure;
  let profilePath;

  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    profilePath = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-talking-heads-smoke-'));
    fixture = await startFixture();
    context = await chromium.launchPersistentContext(profilePath, {
      executablePath: requireInstalledChrome(),
      headless: true,
      viewport: { width: 1440, height: 960 }
    });
    const directorPage = context.pages()[0] || await context.newPage();
    observeBrowserErrors(directorPage, 'director', browserErrors);
    await assertDirectorWorkflow(directorPage, fixture.origin, fixture.record);
    const directorScreenshot = path.join(OUTPUT_DIR, 'stream-director.png');
    await directorPage.screenshot({ path: directorScreenshot, fullPage: true });
    screenshotPaths.push(directorScreenshot);

    const overlayPage = await context.newPage({ viewport: { width: 1280, height: 720 } });
    observeBrowserErrors(overlayPage, 'overlay', browserErrors);
    await assertOverlayWorkflow(overlayPage, fixture, screenshotPaths);
  } catch (error) {
    runFailure = error;
  } finally {
    await collectCleanupFailure(cleanupFailures, 'browser context close', () => context?.close());
    await collectCleanupFailure(cleanupFailures, 'Socket.IO fixture close', () => closeSocketServer(fixture?.io));
    await collectCleanupFailure(cleanupFailures, 'loopback fixture close', () => closeServer(fixture?.server));
    if (profilePath) {
      await collectCleanupFailure(cleanupFailures, 'temporary browser profile removal', () => {
        fs.rmSync(profilePath, { recursive: true, force: true });
      });
    }
    if (browserErrors.length) cleanupFailures.push(new Error(browserErrors.join('\n')));
  }

  const failures = [runFailure, ...cleanupFailures].filter(Boolean);
  if (failures.length) {
    throw new AggregateError(failures, 'Talking Heads browser smoke failed');
  }

  console.log(`PASS talking-heads-browser-smoke ${JSON.stringify({
    fixture: '127.0.0.1:ephemeral',
    acknowledgements: fixture.record.completionAcks.length,
    screenshots: screenshotPaths
  })}`);
}

main().catch(error => {
  console.error(error && error.stack ? error.stack : error);
  if (error instanceof AggregateError) {
    for (const inner of error.errors) console.error(inner && inner.stack ? inner.stack : inner);
  }
  process.exitCode = 1;
});
