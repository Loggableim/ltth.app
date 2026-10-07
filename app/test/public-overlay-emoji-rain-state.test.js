'use strict';

const EmojiRainPlugin = require('../plugins/emoji-rain/main');

function createStateHandler() {
  const routes = new Map();
  const api = {
    getSocketIO: () => ({ emit() {} }),
    getPluginDataDir: () => '/tmp/emoji-rain-public-state-test',
    getConfigPathManager: () => ({ getUserConfigsDir: () => '/tmp/emoji-rain-user-configs' }),
    getDatabase: () => ({ getEmojiRainConfig: () => ({ enabled: true }) }),
    getApp: () => ({ use() {} }),
    log() {},
    emit() {},
    registerRoute: (method, route, handler) => routes.set(`${method}:${route}`, handler),
    registerTikTokEvent() {},
    registerFlowAction() {}
  };
  const plugin = new EmojiRainPlugin(api);
  plugin.registerRoutes();
  return { plugin, handler: routes.get('get:/api/emoji-rain/overlay/state') };
}

describe('public EmojiRain overlay state response', () => {
  test('projects only opacity and leaves queue and control state private', () => {
    const { plugin, handler } = createStateHandler();
    plugin.overlayState = { paused: true, theme: 'private-control', opacity: 0.42, speed: 3 };
    plugin.spawnQueue.push({ username: 'private-user', message: 'not public' });
    const response = { body: null, json(body) { this.body = body; return this; } };

    handler({}, response);

    expect(response.body).toEqual({ success: true, state: { opacity: 0.42 } });
  });
});
