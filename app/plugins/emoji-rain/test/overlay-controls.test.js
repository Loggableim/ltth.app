const fs = require('fs');
const path = require('path');
const EmojiRainPlugin = require('../main');

function createHarness() {
  const routes = new Map();
  const api = {
    getSocketIO: () => ({ emit: jest.fn() }),
    getPluginDataDir: () => '/tmp/emoji-rain-test',
    getConfigPathManager: () => ({ getUserConfigsDir: () => '/tmp/emoji-rain-user-configs' }),
    getDatabase: () => ({ getEmojiRainConfig: () => ({ enabled: true }) }),
    getApp: () => ({ use: jest.fn() }),
    log: jest.fn(),
    emit: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerTikTokEvent: jest.fn(),
    registerFlowAction: jest.fn()
  };
  const plugin = new EmojiRainPlugin(api);
  plugin.registerRoutes();
  return { api, plugin, routes };
}

function requestRoute(handler, valueKey, value) {
  const req = { body: { [valueKey]: value } };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  handler(req, res);
  return res;
}

describe('EmojiRain overlay control API', () => {
  test.each([
    ['opacity', 'opacity', ['invalid', '0.5', null, {}, NaN, Infinity]],
    ['speed', 'speed', ['invalid', '2', null, {}, NaN, Infinity, 0.05]]
  ])('rejects nonnumeric or nonfinite %s without changing state', (name, key, invalidValues) => {
    const { api, plugin, routes } = createHarness();
    const initialState = { ...plugin.overlayState };
    const handler = routes.get(`post:/api/emoji-rain/overlay/${name}`);

    for (const value of invalidValues) {
      const response = requestRoute(handler, key, value);
      expect(response.statusCode).toBe(400);
      expect(response.body.success).toBe(false);
      expect(plugin.overlayState).toEqual(initialState);
    }
    expect(api.emit).not.toHaveBeenCalled();
  });

  test('accepts numeric control values and emits the same finite values', () => {
    const { api, plugin, routes } = createHarness();
    const opacity = requestRoute(routes.get('post:/api/emoji-rain/overlay/opacity'), 'opacity', 0.35);
    const speed = requestRoute(routes.get('post:/api/emoji-rain/overlay/speed'), 'speed', 0.1);

    expect(opacity.statusCode).toBe(200);
    expect(speed.statusCode).toBe(200);
    expect(plugin.overlayState).toMatchObject({ opacity: 0.35, speed: 0.1 });
    expect(api.emit).toHaveBeenCalledWith('emoji-rain:opacity', { opacity: 0.35 });
    expect(api.emit).toHaveBeenCalledWith('emoji-rain:speed', { speed: 0.1 });
  });

  test('classic browser renderer applies current and subsequent opacity to its full particle container', () => {
    const renderer = fs.readFileSync(path.join(__dirname, '../../../public/js/emoji-rain-engine.js'), 'utf8');
    const overlay = fs.readFileSync(path.join(__dirname, '../overlay.html'), 'utf8');

    expect(overlay).toContain('<div id="canvas-container"></div>');
    expect(renderer).toContain("fetch('/api/emoji-rain/overlay/state')");
    expect(renderer).toContain("container.style.opacity = String(opacity)");
    expect(renderer).toContain("socket.on('emoji-rain:opacity'");
    expect(renderer).toContain('await loadOverlayOpacity();');
  });
});
