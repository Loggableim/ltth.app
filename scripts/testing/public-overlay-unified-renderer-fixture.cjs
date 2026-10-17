'use strict';

// Source-contract fixture for /overlay/game-engine/unified. No network,
// browser process, listener, app server, or child process is started.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const appRoot = path.resolve(__dirname, '../../app');
const { JSDOM } = require(path.join(appRoot, 'node_modules/jsdom'));
const accessPath = path.join(appRoot, 'modules/public-overlay-access.js');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === accessPath && request === './public-overlay-release-event-policy') {
    return { createPublicReleaseEventGuard: () => () => true };
  }
  return originalLoad.call(this, request, parent, isMain);
};

let protectPublicSocket;
let isHttpAllowed;
let isOutgoingSocketEventAllowed;
let projectPublicOverlayPayload;
try {
  ({ protectPublicSocket } = require(accessPath));
  ({ isHttpAllowed, isOutgoingSocketEventAllowed } = require(path.join(appRoot, 'modules/public-overlay-registry.js')));
  ({ projectPublicOverlayPayload } = require(path.join(appRoot, 'modules/public-overlay-payload-projection.js')));
} finally {
  Module._load = originalLoad;
}

assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

const entrypoint = '/overlay/game-engine/unified';
assert.equal(isHttpAllowed({ method: 'GET', pathname: entrypoint }), true);

const clientListeners = new Map();
const clientRequests = [];
const clientSocket = {
  connected: true,
  on(eventName, handler) { clientListeners.set(eventName, handler); return this; },
  emit(eventName, ...args) { clientRequests.push([eventName, ...args]); return true; }
};
let incomingGuard;
const delivered = [];
const publicSocket = {
  handshake: { headers: { host: 'unified-fixture.trycloudflare.com' } },
  data: {},
  join() {},
  use(handler) { incomingGuard = handler; },
  emit(eventName, payload) {
    delivered.push([eventName, payload]);
    clientListeners.get(eventName)?.(payload);
    return true;
  }
};
protectPublicSocket({ socket: publicSocket, logger: { warn() {} } });

const rendererPath = path.join(appRoot, 'plugins/game-engine/overlay/unified.html');
const source = fs.readFileSync(rendererPath, 'utf8').replace(/<script[^>]+src=[^>]*><\/script>/gi, '');
const dom = new JSDOM(source, {
  url: 'http://127.0.0.1/overlay/game-engine/unified',
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const windowErrors = [];
dom.window.addEventListener('error', event => windowErrors.push(event.message));
dom.window.io = () => clientSocket;
dom.window.i18n = { initialized: false, t: key => key };
dom.window.console = { log() {}, warn() {}, error() {} };
dom.window.setTimeout = () => 1;
dom.window.clearTimeout = () => {};
dom.window.setInterval = () => 1;
dom.window.clearInterval = () => {};
dom.window.requestAnimationFrame = () => 1;
dom.window.cancelAnimationFrame = () => {};
for (const inlineScript of dom.window.document.querySelectorAll('script:not([src])')) {
  dom.window.eval(inlineScript.textContent);
}

try {
  assert.deepEqual(clientRequests[0], ['game-engine:request-state']);
  assert(clientListeners.has('game-engine:current-state'), 'renderer must register current-state handler');
  assert.equal(isOutgoingSocketEventAllowed('game-engine:current-state'), true);
  assert.equal(isOutgoingSocketEventAllowed('game-engine:interactive-state'), true);

  // The renderer asks for a snapshot on load, but this request is not an
  // approved anonymous input packet; it must not reach any server handler.
  let requestError;
  incomingGuard(clientRequests[0], error => { requestError = error; });
  assert(requestError instanceof Error);
  assert.equal(requestError.data.code, 'PUBLIC_SOCKET_EVENT_NOT_ALLOWED');

  const currentState = {
    hasActiveGame: true,
    gameType: 'connect4',
    useUnified: true,
    sessionId: 'private-session-canary',
    owner: 'private-owner-canary'
  };
  assert.equal(publicSocket.emit('game-engine:current-state', currentState), true);
  assert.deepEqual(windowErrors, []);
  assert.deepEqual(delivered, [[
    'game-engine:current-state',
    { hasActiveGame: true, gameType: 'connect4', useUnified: true }
  ]]);
  // This projected snapshot alone cannot activate a game: the current-state
  // handler requires latestInteractiveState to already be idle.
  assert.equal(dom.window.document.getElementById('frame-connect4').classList.contains('active'), false);
  assert.equal(dom.window.document.getElementById('frame-connect4').hasAttribute('src'), false);
  assert.equal(dom.window.document.getElementById('idle-state').classList.contains('visible'), true);
  assert.equal(JSON.stringify(delivered).includes('private-session-canary'), false);

  // interactive-state is consumed by the renderer source, but has no public
  // projection. protectPublicSocket therefore withholds it without delivery.
  const priorDeliveries = delivered.length;
  assert.equal(projectPublicOverlayPayload('game-engine:interactive-state', {
    display: { phase: 'playing', gameType: 'connect4', displayRevision: 1 },
    owner: 'private-owner-canary'
  }), undefined);
  assert.equal(publicSocket.emit('game-engine:interactive-state', {
    display: { phase: 'playing', gameType: 'connect4', displayRevision: 1 },
    owner: 'private-owner-canary'
  }), false);
  assert.equal(delivered.length, priorDeliveries);
  assert.equal(dom.window.document.getElementById('frame-connect4').classList.contains('active'), false);
  assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined);
  console.log('PASS: unified fail-closed source contract confirmed; request-state denied, projected current-state cannot activate without interactive state, unprojected interactive-state withheld; no app/server/listener/browser/network/process');
} finally {
  dom.window.close();
}
