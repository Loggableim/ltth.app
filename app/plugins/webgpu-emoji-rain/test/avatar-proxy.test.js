const { fetchAllowedAvatar } = require('../lib/avatar-proxy');

const response = (status, location = null) => ({
  status,
  headers: {
    get: jest.fn(name => name === 'location' ? location : null)
  }
});

class MockAPI {
  constructor() {
    this.routes = [];
    this.db = { getEmojiRainConfig: () => ({ enabled: true }) };
  }

  log() {}
  emit() {}
  getSocketIO() { return { emit: jest.fn() }; }
  getDatabase() { return this.db; }
  getPluginDataDir() { return '/tmp/webgpu-emoji-rain-avatar-proxy'; }
  getConfigPathManager() { return { getUserConfigsDir: () => '/tmp/webgpu-emoji-rain-avatar-proxy' }; }
  getApp() { return { use: jest.fn() }; }
  registerRoute(method, routePath, handler) { this.routes.push({ method, routePath, handler }); }
  registerTikTokEvent() {}
  registerFlowAction() {}
}

describe('WebGPU EmojiRain avatar proxy', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('retrieves an avatar after a redirect within TikTok CDN domains', async () => {
    const finalResponse = response(200);
    global.fetch = jest.fn()
      .mockResolvedValueOnce(response(302, 'https://p16-sign-va.tiktokcdn.com/avatar.webp'))
      .mockResolvedValueOnce(finalResponse);

    await expect(fetchAllowedAvatar('https://p16.tiktokcdn.com/avatar.webp')).resolves.toBe(finalResponse);
    expect(global.fetch).toHaveBeenNthCalledWith(1, 'https://p16.tiktokcdn.com/avatar.webp', expect.objectContaining({ redirect: 'manual' }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://p16-sign-va.tiktokcdn.com/avatar.webp', expect.objectContaining({ redirect: 'manual' }));
  });

  test('rejects non-TikTok avatar hosts before requesting them', async () => {
    global.fetch = jest.fn();

    await expect(fetchAllowedAvatar('https://example.test/avatar.webp')).rejects.toMatchObject({ statusCode: 403 });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('rejects a redirect that leaves the TikTok CDN allowlist', async () => {
    global.fetch = jest.fn().mockResolvedValue(response(302, 'http://127.0.0.1/private-avatar'));

    await expect(fetchAllowedAvatar('https://p16.tiktokcdn.com/avatar.webp')).rejects.toMatchObject({ statusCode: 403 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('serves a validated avatar through the same-origin plugin route', async () => {
    const WebGPUEmojiRainPlugin = require('../main.js');
    const api = new MockAPI();
    const plugin = new WebGPUEmojiRainPlugin(api);
    plugin.registerRoutes();
    const route = api.routes.find(entry => entry.method === 'get' && entry.routePath === '/api/webgpu-emoji-rain/avatar');
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: jest.fn(name => name === 'content-type' ? 'image/webp' : null) },
      arrayBuffer: jest.fn().mockResolvedValue(bytes)
    });
    const res = { setHeader: jest.fn(), send: jest.fn(), status: jest.fn(), json: jest.fn() };

    await route.handler({ query: { url: 'https://p16.tiktokcdn.com/avatar.webp' } }, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/webp');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=1800');
    expect(res.send).toHaveBeenCalledWith(Buffer.from(bytes));
  });
});
