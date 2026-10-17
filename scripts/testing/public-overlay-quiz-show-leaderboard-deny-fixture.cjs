'use strict';

// Isolated deny-by-default proof for the standalone Quiz Show leaderboard.
// It executes the original renderer in JSDOM and calls the actual public
// middleware/socket guard with synthetic request and payload objects only.
// No server, listener, browser process, user data, profile, or network is used.
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
  isRegisteredEntrypoint,
  isOutgoingSocketEventAllowed
} = require(path.join(appRoot, 'modules/public-overlay-registry.js'));
const { projectPublicOverlayPayload } = require(path.join(appRoot, 'modules/public-overlay-payload-projection.js'));

assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

const host = 'quiz-leaderboard-fixture.trycloudflare.com';
const rendererPath = path.join(appRoot, 'plugins/quiz-show/quiz_show_leaderboard_overlay.html');
const rendererSource = fs.readFileSync(rendererPath, 'utf8').replace(/<script[^>]+src=[^>]*><\/script>/gi, '');
const logger = { warn() {} };
const middleware = createPublicOverlayMiddleware({ logger });
const nextCalls = [];

function requestThroughPublicMiddleware(method, originalUrl) {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  middleware({ method, originalUrl, headers: { host } }, response, () => nextCalls.push(originalUrl));
  return response;
}

const pagePath = '/quiz-show/leaderboard-overlay';
const apiPath = '/api/quiz-show/leaderboard?type=round';
assert.equal(isRegisteredEntrypoint(pagePath), true, 'registry contains the standalone renderer entry');
assert.equal(isHttpAllowed({ method: 'GET', pathname: apiPath }), true, 'registry contains the exact read contract');
const pageResponse = requestThroughPublicMiddleware('GET', pagePath);
const apiResponse = requestThroughPublicMiddleware('GET', apiPath);
assert.equal(pageResponse.statusCode, 404);
assert.deepEqual(pageResponse.body, { error: 'Not found' });
assert.equal(apiResponse.statusCode, 404);
assert.deepEqual(apiResponse.body, { error: 'Not found' });
assert.deepEqual(nextCalls, [], 'neither page nor private route handler is reached on the tunnel host');

const clientListeners = new Map();
const clientRequests = [];
const clientSocket = {
  on(eventName, handler) { clientListeners.set(eventName, handler); return this; },
  emit(eventName, ...args) { clientRequests.push([eventName, ...args]); return true; }
};
const delivered = [];
const publicSocket = {
  handshake: { headers: { host } },
  data: {},
  join() {},
  use() {},
  emit(eventName, payload) {
    delivered.push([eventName, payload]);
    clientListeners.get(eventName)?.(payload);
    return true;
  }
};
const publicPolicy = {
  getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
  isClosedBetaId: () => false
};
protectPublicSocket({ socket: publicSocket, logger, pluginReleasePolicy: publicPolicy });

const dom = new JSDOM(rendererSource, {
  url: `http://127.0.0.1${pagePath}`,
  runScripts: 'outside-only',
  pretendToBeVisual: true
});
const windowErrors = [];
const rendererFetches = [];
dom.window.addEventListener('error', event => windowErrors.push(event.message));
dom.window.io = () => clientSocket;
dom.window.i18n = { t: key => key };
dom.window.console = { log() {}, warn() {}, error() {} };
dom.window.setTimeout = () => 1;
dom.window.clearTimeout = () => {};
dom.window.fetch = async url => {
  const requestUrl = String(url);
  rendererFetches.push(requestUrl);
  const response = requestThroughPublicMiddleware('GET', requestUrl);
  return { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, json: async () => response.body };
};

async function runFixture() {
try {
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) dom.window.eval(script.textContent);
  assert(clientListeners.has('quiz-show:leaderboard-show'));
  assert(clientListeners.has('quiz-show:leaderboard-update'));
  assert(clientListeners.has('quiz-show:leaderboard-hide'));

  const privateCanary = 'QUIZ_PRIVATE_FIELD_CANARY';
  const update = {
    leaderboard: [{ username: 'Synthetic Viewer', points: 42, userId: privateCanary, apiKey: privateCanary }],
    displayType: 'round',
    owner: privateCanary
  };
  assert.equal(isOutgoingSocketEventAllowed('quiz-show:leaderboard-show'), true, 'registry alone names this event');
  assert.equal(publicSocket.emit('quiz-show:leaderboard-show', update), false,
    'missing owner contract must block even a projection-compatible event');
  assert.equal(publicSocket.emit('quiz-show:leaderboard-update', update), false,
    'missing owner contract must block update events');
  assert.deepEqual(delivered, [], 'no leaderboard event reaches the renderer');

  // The DTO projector strips private fields, but it cannot grant access: the
  // owner guard above rejects this event before the projector runs.
  const projected = projectPublicOverlayPayload('quiz-show:leaderboard-show', update);
  assert.deepEqual(projected, {
    leaderboard: [{ username: 'Synthetic Viewer', points: 42 }],
    displayType: 'round',
    animationStyle: 'fade'
  });
  assert.equal(JSON.stringify(projected).includes(privateCanary), false);

  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rendererFetches.sort(), ['/api/quiz-show/leaderboard?type=round', '/api/quiz-show/state']);
  assert.deepEqual(clientRequests, [], 'renderer must not request server-side socket state');
  assert.equal(dom.window.document.querySelectorAll('#leaderboardList .leaderboard-item').length, 0);
  assert.equal(dom.window.document.querySelector('#leaderboardList img'), null);
  assert.equal(dom.window.document.body.textContent.includes(privateCanary), false);
  assert.deepEqual(windowErrors, []);
  assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined);
  console.log('PASS: Quiz Show leaderboard remains fail-closed; public page/read return neutral 404, unowned update events are withheld, sanitized DTO excludes private canaries, original renderer shows no leaked data; synthetic local fixture only');
} catch (error) {
  throw error;
} finally {
  dom.window.close();
}
}

runFixture().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
