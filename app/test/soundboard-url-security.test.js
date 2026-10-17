const MyInstantsAPI = require('../plugins/soundboard/myinstants-api');
const SoundboardPlugin = require('../plugins/soundboard/main');

const silentLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

function response(status, data, headers = {}) {
  return { status, data, headers };
}

function makePlugin(client) {
  const routes = new Map();
  const api = {
    log: jest.fn(),
    registerRoute(...args) {
      const path = args[1];
      routes.set(path, args[args.length - 1]);
    }
  };
  const plugin = new SoundboardPlugin(api);
  plugin.myinstantsAPI = new MyInstantsAPI(silentLogger, client);
  plugin.audioCacheManager = {
    getCacheEntry: jest.fn(() => null),
    cacheAudio: jest.fn()
  };
  plugin.registerRoutes();
  return { plugin, routes };
}

function makeResponse() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    }
  };
}

describe('Soundboard MyInstants URL security', () => {
  test.each([
    'http://www.myinstants.com/media/sounds/test.mp3',
    'https://example.invalid/media/sounds/test.mp3',
    'https://www.myinstants.com.evil.invalid/media/sounds/test.mp3',
    'https://user@www.myinstants.com/media/sounds/test.mp3',
    'https://www.myinstants.com:444/media/sounds/test.mp3',
    'https://127.0.0.1/media/sounds/test.mp3',
    'https://10.0.0.1/media/sounds/test.mp3',
    'https://[::1]/media/sounds/test.mp3',
    'https://localhost/media/sounds/test.mp3'
  ])('rejects unsafe URL before HTTP client access: %s', async url => {
    const client = { get: jest.fn() };
    const soundApi = new MyInstantsAPI(silentLogger, client);

    await expect(soundApi.requestMyInstantsUrl(url)).rejects.toThrow();
    expect(client.get).not.toHaveBeenCalled();
  });

  test.each(['https://www.myinstants.com/page/1', 'https://myinstants.com/media/sounds/test.mp3']) (
    'allows exact HTTPS MyInstants host with standard port: %s', async url => {
      const client = { get: jest.fn().mockResolvedValue(response(200, 'ok')) };
      const soundApi = new MyInstantsAPI(silentLogger, client);

      const result = await soundApi.requestMyInstantsUrl(url);

      expect(result.status).toBe(200);
      expect(client.get).toHaveBeenCalledTimes(1);
      expect(client.get.mock.calls[0][1]).toEqual(expect.objectContaining({ maxRedirects: 0 }));
    }
  );

  test('follows a redirect only after validating the exact allowed target', async () => {
    const client = {
      get: jest.fn()
        .mockResolvedValueOnce(response(302, '', { location: 'https://myinstants.com/media/sounds/test.mp3' }))
        .mockResolvedValueOnce(response(200, 'audio'))
    };
    const soundApi = new MyInstantsAPI(silentLogger, client);

    const result = await soundApi.requestMyInstantsUrl('https://www.myinstants.com/instant/test');

    expect(result.finalUrl).toBe('https://myinstants.com/media/sounds/test.mp3');
    expect(client.get).toHaveBeenCalledTimes(2);
    expect(client.get.mock.calls.every(([, config]) => config.maxRedirects === 0)).toBe(true);
  });

  test.each([
    'http://www.myinstants.com/media/sounds/test.mp3',
    'https://example.invalid/media/sounds/test.mp3',
    'https://127.0.0.1/private',
    'https://user@www.myinstants.com/private',
    'https://www.myinstants.com:444/private'
  ])('blocks unsafe redirect before requesting its target: %s', async location => {
    const client = {
      get: jest.fn().mockResolvedValue(response(302, '', { location }))
    };
    const soundApi = new MyInstantsAPI(silentLogger, client);

    await expect(soundApi.requestMyInstantsUrl('https://www.myinstants.com/instant/test')).rejects.toThrow();
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  test('resolves only an approved HTTPS MP3 link from a page', async () => {
    const client = {
      get: jest.fn().mockResolvedValue(response(200, '<button onclick="play(\'/media/sounds/test.mp3\')">play</button>'))
    };
    const soundApi = new MyInstantsAPI(silentLogger, client);

    await expect(soundApi.resolvePageUrl('https://www.myinstants.com/instant/test'))
      .resolves.toBe('https://www.myinstants.com/media/sounds/test.mp3');
  });

  test('rejects a page that advertises an unapproved MP3 host', async () => {
    const client = {
      get: jest.fn().mockResolvedValue(response(200, '<a href="https://example.invalid/test.mp3">audio</a>'))
    };
    const soundApi = new MyInstantsAPI(silentLogger, client);

    await expect(soundApi.resolvePageUrl('https://www.myinstants.com/instant/test')).rejects.toThrow();
    expect(client.get).toHaveBeenCalledTimes(1);
  });

  test.each([
    'http://www.myinstants.com/media/sounds/test.mp3',
    'https://example.invalid/test.mp3',
    'https://127.0.0.1/test.mp3',
    'https://user@www.myinstants.com/test.mp3',
    'https://www.myinstants.com:444/test.mp3'
  ])('resolve endpoint rejects unsafe MP3 fast path before request: %s', async url => {
    const client = { get: jest.fn() };
    const { routes } = makePlugin(client);
    const res = makeResponse();

    await routes.get('/api/myinstants/resolve')({ query: { url } }, res);

    expect(res.statusCode).toBe(400);
    expect(res.payload.success).toBe(false);
    expect(client.get).not.toHaveBeenCalled();
  });

  test('resolve endpoint returns a validated MyInstants MP3 fast path without fetching it', async () => {
    const client = { get: jest.fn() };
    const { routes } = makePlugin(client);
    const res = makeResponse();
    const url = 'https://myinstants.com/media/sounds/test.mp3';

    await routes.get('/api/myinstants/resolve')({ query: { url } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ success: true, mp3: url });
    expect(client.get).not.toHaveBeenCalled();
  });

  test.each([
    'http://www.myinstants.com/media/sounds/test.mp3',
    'https://example.invalid/test.mp3',
    'https://192.168.1.1/private',
    'https://user@www.myinstants.com/private',
    'https://www.myinstants.com:444/private'
  ])('proxy endpoint rejects unsafe target before cache or HTTP access: %s', async url => {
    const client = { get: jest.fn() };
    const { plugin, routes } = makePlugin(client);
    const res = makeResponse();

    await routes.get('/api/myinstants/proxy-audio')({ query: { url } }, res);

    expect(res.statusCode).toBe(400);
    expect(plugin.audioCacheManager.getCacheEntry).not.toHaveBeenCalled();
    expect(client.get).not.toHaveBeenCalled();
  });

  test('proxy cache fallback uses manual redirects and never requests a forbidden target', async () => {
    const client = {
      get: jest.fn().mockResolvedValue(response(302, '', { location: 'https://example.invalid/private' }))
    };
    const { plugin, routes } = makePlugin(client);
    plugin.audioCacheManager.cacheAudio.mockRejectedValue(new Error('synthetic cache failure'));
    const res = makeResponse();

    await routes.get('/api/myinstants/proxy-audio')({
      query: { url: 'https://www.myinstants.com/media/sounds/test.mp3' }
    }, res);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][0]).toBe('https://www.myinstants.com/media/sounds/test.mp3');
    expect(client.get.mock.calls[0][1].maxRedirects).toBe(0);
    expect(client.get.mock.calls.some(([requestedUrl]) => requestedUrl.includes('example.invalid'))).toBe(false);
    expect(res.statusCode).toBe(500);
  });

  test('proxy does not retry a cache download after a rejected redirect', async () => {
    const client = {
      get: jest.fn().mockResolvedValue(response(302, '', { location: 'https://example.invalid/private' }))
    };
    const { plugin, routes } = makePlugin(client);
    plugin.audioCacheManager.cacheAudio.mockImplementation(url =>
      plugin.myinstantsAPI.requestMyInstantsUrl(url, { responseType: 'arraybuffer' })
    );
    const res = makeResponse();

    await routes.get('/api/myinstants/proxy-audio')({
      query: { url: 'https://www.myinstants.com/media/sounds/test.mp3' }
    }, res);

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get.mock.calls[0][1].maxRedirects).toBe(0);
    expect(client.get.mock.calls.some(([requestedUrl]) => requestedUrl.includes('example.invalid'))).toBe(false);
    expect(res.statusCode).toBe(500);
  });
});
