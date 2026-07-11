class MockAPI {
  constructor() {
    this.routes = [];
    this.logs = [];
    this.app = { use: jest.fn() };
    this.db = {
      getEmojiRainConfig: () => ({ enabled: true })
    };
  }

  log(message, level) {
    this.logs.push({ message, level });
  }

  emit() {}

  getSocketIO() {
    return { emit: jest.fn() };
  }

  getDatabase() {
    return this.db;
  }

  getPluginDataDir() {
    return '/tmp/test-plugin-data';
  }

  getConfigPathManager() {
    return {
      getUserConfigsDir: () => '/tmp/test-user-configs'
    };
  }

  getApp() {
    return this.app;
  }

  registerRoute(method, routePath, handler) {
    this.routes.push({ method, routePath, handler });
  }

  registerTikTokEvent() {}
  registerFlowAction() {}
}

describe('EmojiRain OBS layer routes', () => {
  test('registers dedicated OBS URLs for emoji, hearts, gifts, and emoji plus gifts', () => {
    jest.resetModules();
    const EmojiRainPlugin = require('../main.js');
    const api = new MockAPI();
    const plugin = new EmojiRainPlugin(api);

    plugin.registerRoutes();

    const routePaths = api.routes
      .filter(route => route.method === 'get')
      .map(route => route.routePath);

    expect(routePaths).toEqual(expect.arrayContaining([
      '/emoji-rain/obs-hud',
      '/emoji-rain/obs-hud/emojiregen',
      '/emoji-rain/obs-hud/herzballons',
      '/emoji-rain/obs-hud/geschenkeregen',
      '/emoji-rain/obs-hud/emojiregen-geschenkeregen',
      '/emoji-rain/obs-hud/emojis',
      '/emoji-rain/obs-hud/hearts',
      '/emoji-rain/obs-hud/gifts',
      '/emoji-rain/obs-hud/emoji-gifts'
    ]));
  });
});
