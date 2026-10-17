'use strict';

// Synthetic deny-by-default proof for /overlay/game-engine/hud. It exercises
// the original renderer with the actual public access helpers, but starts no
// server/listener/browser process and makes no network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '../../app');
const { JSDOM } = require(path.join(appRoot, 'node_modules/jsdom'));
const {
  createPublicOverlayMiddleware,
  protectPublicSocket
} = require(path.join(appRoot, 'modules/public-overlay-access.js'));
const {
  isHttpAllowed,
  isOutgoingSocketEventAllowed
} = require(path.join(appRoot, 'modules/public-overlay-registry.js'));
const { createPublicReleaseEventGuard } = require(path.join(appRoot, 'modules/public-overlay-release-event-policy.js'));

assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

const host = 'game-engine-hud-fixture.trycloudflare.com';
const entrypoint = '/overlay/game-engine/hud';
const activeSessionPath = '/api/game-engine/active-session';
const rendererPath = path.join(appRoot, 'plugins/game-engine/overlay/game-hud.html');
const rendererSource = fs.readFileSync(rendererPath, 'utf8').replace(/<script[^>]+src=[^>]*><\/script>/gi, '');
const logger = { warn() {} };
const middleware = createPublicOverlayMiddleware({ logger });
const reachedHandlers = [];

function publicRequest(method, originalUrl) {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  middleware({ method, originalUrl, headers: { host } }, response, () => reachedHandlers.push(originalUrl));
  return response;
}

assert.equal(isHttpAllowed({ method: 'GET', pathname: entrypoint }), true, 'local registry entry exists');
assert.equal(isHttpAllowed({ method: 'GET', pathname: activeSessionPath }), true, 'local read contract exists');
for (const pathName of [entrypoint, activeSessionPath]) {
  const response = publicRequest('GET', pathName);
  assert.equal(response.statusCode, 404, `${pathName} must be denied by the Quick-Tunnel host gate`);
  assert.deepEqual(response.body, { error: 'Not found' });
}
assert.deepEqual(reachedHandlers, [], 'public page and active-session route handlers must not be reached');

const publicPolicy = {
  getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
  isClosedBetaId: () => false
};
const releaseEventGuard = createPublicReleaseEventGuard(publicPolicy);
const clientListeners = new Map();
const clientSocket = {
  connected: false,
  on(eventName, handler) { clientListeners.set(eventName, handler); return this; },
  emit() { return true; }
};
const delivered = [];
const publicSocket = {
  handshake: { headers: { host } },
  data: {},
  join() {},
  use(handler) { this.incomingGuard = handler; },
  emit(eventName, payload) {
    delivered.push([eventName, payload]);
    clientListeners.get(eventName)?.(payload);
    return true;
  }
};
protectPublicSocket({ socket: publicSocket, logger, pluginReleasePolicy: publicPolicy });

const dom = new JSDOM(rendererSource, {
  url: `http://127.0.0.1${entrypoint}?hideWhenInactive=true`,
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const errors = [];
const fetches = [];
dom.window.addEventListener('error', event => errors.push(event.message));
dom.window.io = () => clientSocket;
dom.window.console = { log() {}, info() {}, warn() {}, error() {} };
dom.window.fetch = async url => {
  const pathName = new URL(String(url), 'http://127.0.0.1').pathname;
  fetches.push(pathName);
  const response = publicRequest('GET', pathName);
  return { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, json: async () => response.body };
};
const timerHandles = new Set();
dom.window.setTimeout = callback => { const handle = { callback }; timerHandles.add(handle); return handle; };
dom.window.clearTimeout = handle => timerHandles.delete(handle);
dom.window.setInterval = callback => { const handle = { callback }; timerHandles.add(handle); return handle; };
dom.window.clearInterval = handle => timerHandles.delete(handle);

async function runFixture() {
  try {
    for (const script of dom.window.document.querySelectorAll('script:not([src])')) dom.window.eval(script.textContent);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(fetches, [activeSessionPath], 'original HUD performs only its active-session read');
    assert.equal(dom.window.document.getElementById('hud').classList.contains('active'), false,
      'denied initial read cannot activate the HUD');

    const canary = 'GAME_ENGINE_PRIVATE_SESSION_CANARY';
    const blockedEvents = [
      ['game-engine:game-started', { sessionId: canary, gameType: 'connect4', state: { player1: { nickname: canary }, moveCount: 99 } }],
      ['game-engine:move-made', { sessionId: canary, state: { player1: { nickname: canary }, moveCount: 100 } }],
      ['plinko:spawn-ball', { ballId: canary, nickname: canary, bet: 999 }]
    ];
    for (const [eventName, payload] of blockedEvents) {
      assert.equal(isOutgoingSocketEventAllowed(eventName), true, `${eventName} is named in the broad event registry`);
      assert.equal(releaseEventGuard('outgoing', eventName), false, `${eventName} has no approved public owner`);
      assert.equal(publicSocket.emit(eventName, payload), false, `${eventName} must be withheld before renderer delivery`);
    }
    assert.deepEqual(delivered, []);
    assert.equal(dom.window.document.getElementById('hud').classList.contains('active'), false);
    assert.equal(dom.window.document.body.textContent.includes(canary), false);
    assert.deepEqual(errors, []);
    assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined);
    console.log('PASS: Game Engine HUD public path remains fail-closed; Quick-Tunnel page/read return neutral 404, unowned HUD updates are withheld, original renderer shows no session/private canary; synthetic fixture only');
  } finally {
    dom.window.close();
    timerHandles.clear();
  }
}

runFixture().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
