'use strict';

// Synthetic release-boundary verification. Uses temporary policy copies and
// fake requests/sockets only: no app server, database, user data, or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const appRoot = path.resolve(__dirname, '../../app');
const policyTemplate = JSON.parse(fs.readFileSync(path.join(appRoot, 'config/plugin-release-policy.json'), 'utf8'));
const { createPluginReleasePolicy } = require(path.join(appRoot, 'modules/plugin-release-policy.js'));
const { createPublicReleaseEventGuard } = require(path.join(appRoot, 'modules/public-overlay-release-event-policy.js'));
const { isHttpAllowed, isRegisteredEntrypoint } = require(path.join(appRoot, 'modules/public-overlay-registry.js'));
const owners = JSON.parse(fs.readFileSync(path.join(appRoot, 'modules/public-overlay-release-event-owners.json'), 'utf8'));

const accessPath = path.join(appRoot, 'modules/public-overlay-access.js');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === accessPath && request === './public-overlay-release-event-policy') {
    return { createPublicReleaseEventGuard };
  }
  return originalLoad.call(this, request, parent, isMain);
};
let createPublicOverlayMiddleware;
let protectPublicSocket;
let isApprovedQuickTunnelRequest;
try {
  ({ createPublicOverlayMiddleware, protectPublicSocket, isApprovedQuickTunnelRequest } = require(accessPath));
} finally {
  Module._load = originalLoad;
}
assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined, 'logger.js must stay unloaded');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-closed-beta-overlay-'));
function makePolicy(channel) {
  const root = path.join(tempRoot, channel);
  const configDir = path.join(root, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, 'plugin-release-policy.json'), JSON.stringify(policyTemplate));
  fs.writeFileSync(path.join(configDir, 'distribution-mode.json'), JSON.stringify({ channel }));
  return createPluginReleasePolicy({ appRoot: root });
}

function fakeRequest(middleware, method, pathname, host) {
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let continued = false;
  middleware({ method, path: pathname, originalUrl: pathname, url: pathname, headers: { host } }, response, () => { continued = true; });
  return { response, continued };
}

const closedBetaOverlayRoutes = {
  animazingpal: ['/overlay/animazingpal/stream-assistant'],
  'interactive-story': ['/interactive-story/overlay'],
  'music-bot': ['/plugins/music-bot/overlay.html'],
  schnorrbecher: ['/overlay/coincup'],
  sidekick: ['/overlay/sidekick/hud'],
  'stream-monsters': ['/stream-monsters/overlay', '/streammonsters/overlay', '/streamalchemy/overlay'],
  'talking-heads': ['/overlay/talking-heads'],
  'visual-fx-frame-webgpu': ['/visual-fx-frame-webgpu/overlay'],
  'webgpu-emoji-rain': ['/webgpu-emoji-rain/obs-hud', '/webgpu-emoji-rain/overlay'],
  'webgpu-weather-control': ['/webgpu-weather-control/overlay']
};

try {
  const publicPolicy = makePolicy('public');
  const localPolicy = makePolicy('local');
  const publicSnapshot = publicPolicy.getPublicSurfaceSnapshot();
  const publicEventGuard = createPublicReleaseEventGuard(publicPolicy);
  assert.equal(publicSnapshot.publicMode, true);
  assert.equal(publicSnapshot.publicSurface, true);
  assert.equal(publicPolicy.isClosedBetaId('schnorrbecher', publicSnapshot), true);

  const pluginsDir = path.join(tempRoot, 'plugins');
  fs.mkdirSync(pluginsDir);
  for (const pluginId of policyTemplate.closedBeta) {
    const pluginDir = path.join(pluginsDir, pluginId);
    fs.mkdirSync(pluginDir);
    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id: pluginId, name: pluginId, entry: 'main.js' }));
  }
  const publicRequestGuard = publicPolicy.createRequestGuard({ pluginsDir });
  const localRequestGuard = localPolicy.createRequestGuard({ pluginsDir });

  const publicTunnelMiddleware = createPublicOverlayMiddleware({ logger: { warn() {} } });
  const publicCoinCup = fakeRequest(publicTunnelMiddleware, 'GET', '/overlay/coincup', 'fixture.trycloudflare.com');
  assert.equal(isRegisteredEntrypoint('/overlay/coincup'), true);
  assert.equal(isHttpAllowed({ method: 'GET', pathname: '/overlay/coincup' }), true);
  assert.equal(publicCoinCup.continued, false);
  assert.equal(publicCoinCup.response.statusCode, 404);
  assert.deepEqual(publicCoinCup.response.body, { error: 'Not found' });
  assert.equal(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/overlay/coincup' }), false);
  assert.equal(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/sidekick/public-events' }), true);
  assert.equal(isHttpAllowed({ method: 'GET', pathname: '/api/sidekick/public-events' }), true);
  const approvedSidekickEvents = fakeRequest(publicTunnelMiddleware, 'GET', '/api/sidekick/public-events', 'fixture.trycloudflare.com');
  assert.equal(approvedSidekickEvents.continued, true);

  // The app's public release request guard owns plugin source/API paths.
  const coinCupAsset = '/plugins/schnorrbecher/overlay/coincup.js';
  const publicAsset = fakeRequest(publicRequestGuard, 'GET', coinCupAsset, 'fixture.local');
  assert.equal(publicAsset.continued, false);
  assert.equal(publicAsset.response.statusCode, 404);
  assert.deepEqual(publicAsset.response.body, { success: false, error: 'Plugin not found' });
  const localAsset = fakeRequest(localRequestGuard, 'GET', coinCupAsset, '127.0.0.1:3000');
  assert.equal(localAsset.continued, true);

  // Closed-beta plugin startup is denied publicly, but policy allows local
  // startup and the existing local CoinCup route remains registered.
  assert.throws(() => publicPolicy.assertAllowed('schnorrbecher'), { code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
  assert.equal(localPolicy.assertAllowed('schnorrbecher'), 'schnorrbecher');
  const SchnorrbecherPlugin = require(path.join(appRoot, 'plugins/schnorrbecher/main.js'));
  const localRoutes = new Map();
  const plugin = Object.assign(Object.create(SchnorrbecherPlugin.prototype), {
    api: { registerRoute(method, route, handler) { localRoutes.set(`${method.toUpperCase()} ${route}`, handler); } }
  });
  plugin.registerRoutes();
  let servedLocalPath = '';
  localRoutes.get('GET /overlay/coincup')({}, { sendFile(filePath) { servedLocalPath = filePath; } });
  assert.equal(servedLocalPath, path.join(appRoot, 'plugins/schnorrbecher/overlay/coincup.html'));

  const socketWarnings = [];
  let publicIncomingGuard;
  const publicSocket = {
    handshake: { headers: { host: 'fixture.trycloudflare.com' } }, data: {}, join() {},
    use(handler) { publicIncomingGuard = handler; }, emit() { throw new Error('closed-beta socket event escaped'); }
  };
  protectPublicSocket({
    socket: publicSocket,
    logger: { warn: message => socketWarnings.push(message) },
    pluginReleasePolicy: publicPolicy
  });
  for (const eventName of ['coinJar.sync', 'coinJar.config', 'coinJar.add', 'coinJar.reset']) {
    assert.equal(publicSocket.emit(eventName, { state: 'synthetic' }), false, `${eventName} must be denied publicly`);
    assert.equal(publicEventGuard('outgoing', eventName), false);
  }
  let incomingError;
  publicIncomingGuard(['coinJar.sync.request'], error => { incomingError = error; });
  assert.equal(incomingError?.data?.code, 'PUBLIC_SOCKET_EVENT_NOT_ALLOWED');
  assert(socketWarnings.every(message => !message.includes('synthetic')));

  const localEmits = [];
  const localSocket = {
    handshake: { headers: { host: '127.0.0.1:3000' } }, data: {}, join() {}, use() {},
    emit(...args) { localEmits.push(args); return true; }
  };
  protectPublicSocket({ socket: localSocket, logger: { warn() {} }, pluginReleasePolicy: localPolicy });
  const localState = { generation: 7, state: { totalValue: 42 }, config: { jarStyle: 'classic' } };
  assert.equal(localSocket.emit('coinJar.sync', localState), true);
  assert.equal(localEmits[0][1], localState);

  // Counterprobe every currently closed-beta overlay entry with the same
  // release decision, tunnel host/method gate, and owner event guard.
  let routeCount = 0;
  let deniedRouteCount = 0;
  for (const [pluginId, routes] of Object.entries(closedBetaOverlayRoutes)) {
    assert(policyTemplate.closedBeta.includes(pluginId), `${pluginId} must remain closed beta`);
    assert.throws(() => publicPolicy.assertAllowed(pluginId), { code: 'PLUGIN_CLOSED_BETA_PUBLIC' });
    assert.equal(localPolicy.assertAllowed(pluginId), pluginId);
    for (const route of routes) {
      assert.equal(isRegisteredEntrypoint(route), true, `${route} is an intentional registry placeholder`);
      const denied = fakeRequest(publicTunnelMiddleware, 'GET', route, 'fixture.trycloudflare.com');
      const approvedSidekickHud = pluginId === 'sidekick' && route === '/overlay/sidekick/hud';
      assert.equal(denied.continued, approvedSidekickHud,
        `${route} should follow the explicit Quick-Tunnel allowlist boundary`);
      if (approvedSidekickHud) {
        assert.equal(denied.response.statusCode, 200);
      } else {
        assert.equal(denied.response.statusCode, 404);
        assert.deepEqual(denied.response.body, { error: 'Not found' });
        deniedRouteCount += 1;
      }
      routeCount += 1;
    }
    const ownedEvents = ['incoming', 'outgoing'].flatMap(direction =>
      Object.entries(owners.events[direction])
        .filter(([, entry]) => entry.owner === pluginId)
        .map(([eventName]) => [direction, eventName])
    );
    for (const [direction, eventName] of ownedEvents) {
      assert.equal(publicEventGuard(direction, eventName), false, `${direction} ${eventName} must be denied`);
    }
  }
  assert.equal(routeCount, 13);
  assert.equal(deniedRouteCount, 12);
  assert.equal(require.cache[path.join(appRoot, 'modules/logger.js')], undefined);
  console.log(`PASS: CoinCup public deny/local route+socket parity; ${deniedRouteCount}/${routeCount} beta overlay paths denied; explicit Sidekick HUD tunnel exception recorded; no server/network/user data`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
