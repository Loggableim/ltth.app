'use strict';

const assert = require('assert');
const path = require('path');
const APIBridgePlugin = require('../plugins/api-bridge/main.js');

test('API Bridge registers the local technical reference route', async () => {
  const routes = [];
  const plugin = new APIBridgePlugin({
    log() {},
    emit() {},
    getSocketIO: () => ({ emit() {} }),
    registerRoute(method, route, handler) { routes.push({ method, route, handler }); },
    registerSocket() {},
    registerTikTokEvent() {}
  });

  await plugin.init();
  const referenceRoute = routes.find(({ method, route }) => method === 'get' && route === '/api-bridge/ui');
  assert.ok(referenceRoute, 'API Bridge must register its local read-only reference route');

  let sentFile;
  referenceRoute.handler({}, { sendFile(file) { sentFile = file; } });
  assert.strictEqual(sentFile, path.join(__dirname, '..', 'plugins', 'api-bridge', 'ui.html'));
});
