const MusicBotPlugin = require('../plugins/music-bot/main');
const express = require('express');
const request = require('supertest');

function createResponse() {
  const response = {
    status: jest.fn(),
    json: jest.fn()
  };
  response.status.mockReturnValue(response);
  return response;
}

function expectNoConfigCanaries(response) {
  const serialized = JSON.stringify(response.json.mock.calls);
  [
    'C:\\Private\\player.exe',
    'https://private.invalid/list?token=fixture',
    'C:\\Private\\yt-dlp.exe',
    'https://private.invalid/auto?key=fixture',
    'fixture-moderation-secret',
    'fixture-gift-secret',
    'payToPlayMinCoins',
    '99',
    'unknownInternalField',
    'fixture-unknown-secret'
  ].forEach(canary => expect(serialized).not.toContain(canary));
}

function createPlugin() {
  const handlers = new Map();
  const app = express();
  const api = {
    getSocketIO: jest.fn(() => ({ emit: jest.fn(), on: jest.fn(), off: jest.fn() })),
    getDatabase: jest.fn(() => ({})),
    registerRoute: jest.fn((method, routePath, handler) => {
      handlers.set(`${method.toUpperCase()}:${routePath}`, handler);
      app[method.toLowerCase()](routePath, handler);
    }),
    registerSocket: jest.fn(),
    registerTikTokEvent: jest.fn(),
    log: jest.fn(),
    emit: jest.fn()
  };
  const plugin = new MusicBotPlugin(api);
  plugin.config = {
    playback: { mpvPath: 'C:\\Private\\player.exe', playlistUrl: 'https://private.invalid/list?token=fixture' },
    resolver: { ytdlpPath: 'C:\\Private\\yt-dlp.exe' },
    autoDJ: { playlistUrls: ['https://private.invalid/auto?key=fixture'] },
    moderation: { blockedKeywords: ['fixture-moderation-secret'] },
    monetization: { payToPlayGiftCatalog: ['fixture-gift-secret'], payToPlayMinCoins: 99 },
    unknownInternalField: 'fixture-unknown-secret'
  };
  plugin._registerRoutes();
  return {
    handler: handlers.get('GET:/api/plugins/music-bot/config'),
    plugin,
    app
  };
}

describe('Music Bot config GET local-only access', () => {
  const originalLtthToken = process.env.LTTH_ADMIN_TOKEN;
  const originalAdminToken = process.env.ADMIN_TOKEN;

  afterEach(() => {
    if (originalLtthToken === undefined) delete process.env.LTTH_ADMIN_TOKEN;
    else process.env.LTTH_ADMIN_TOKEN = originalLtthToken;
    if (originalAdminToken === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = originalAdminToken;
  });

  test('rejects unauthenticated remote reads without returning sensitive config canaries', async () => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { handler } = createPlugin();
    const response = createResponse();

    await handler({ socket: { remoteAddress: '192.0.2.55' }, headers: {} }, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false
    }));
    expectNoConfigCanaries(response);
  });

  test('allows direct loopback reads so the local dashboard keeps its full config UI', async () => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { handler, plugin } = createPlugin();
    const response = createResponse();

    await handler({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }, response);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ success: true, config: plugin.config });
    expect(JSON.stringify(response.json.mock.calls)).toContain('fixture-moderation-secret');
    expect(JSON.stringify(response.json.mock.calls)).toContain('fixture-gift-secret');
  });

  test('allows IPv6 loopback reads without an admin token', async () => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { handler, plugin } = createPlugin();
    const response = createResponse();

    await handler({ socket: { remoteAddress: '::1' }, headers: {} }, response);

    expect(response.status).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ success: true, config: plugin.config });
  });

  test.each([
    ['no token', {}, undefined, undefined],
    ['central token', { 'x-ltth-admin-token': 'fixture-central-admin-token' }, 'fixture-central-admin-token', undefined],
    ['Bearer token', { authorization: 'Bearer fixture-central-admin-token' }, 'fixture-central-admin-token', undefined],
    ['ADMIN_TOKEN fallback', { 'x-ltth-admin-token': 'fixture-admin-fallback' }, undefined, 'fixture-admin-fallback']
  ])('rejects LAN config reads with %s without returning config canaries', async (_label, headers, ltthToken, adminToken) => {
    if (ltthToken !== undefined) process.env.LTTH_ADMIN_TOKEN = ltthToken;
    else delete process.env.LTTH_ADMIN_TOKEN;
    if (adminToken !== undefined) process.env.ADMIN_TOKEN = adminToken;
    else delete process.env.ADMIN_TOKEN;
    const { handler } = createPlugin();
    const response = createResponse();

    await handler({
      socket: { remoteAddress: '192.0.2.55' },
      headers
    }, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      code: 'MUSIC_BOT_CONFIG_LOCAL_ONLY'
    }));
    expectNoConfigCanaries(response);
  });

  test('exercises registerRoute Express binding for the loopback dashboard GET', async () => {
    delete process.env.LTTH_ADMIN_TOKEN;
    delete process.env.ADMIN_TOKEN;
    const { app, plugin } = createPlugin();

    const response = await request(app).get('/api/plugins/music-bot/config');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, config: plugin.config });
  });

  test.each([
    ['missing socket address', undefined],
    ['empty socket address', ''],
    ['invalid socket address', 'not-an-ip-address']
  ])('fails closed for %s', async (_label, remoteAddress) => {
    process.env.LTTH_ADMIN_TOKEN = 'fixture-central-admin-token';
    delete process.env.ADMIN_TOKEN;
    const { handler } = createPlugin();
    const response = createResponse();

    await handler({
      socket: remoteAddress === undefined ? {} : { remoteAddress },
      headers: { 'x-ltth-admin-token': 'fixture-central-admin-token' }
    }, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expectNoConfigCanaries(response);
  });

  test('rejects forwarded loopback even when the central token is valid', async () => {
    process.env.LTTH_ADMIN_TOKEN = 'fixture-central-admin-token';
    delete process.env.ADMIN_TOKEN;
    const { handler } = createPlugin();
    const response = createResponse();

    await handler({
      socket: { remoteAddress: '127.0.0.1' },
      headers: {
        'x-forwarded-for': '127.0.0.1',
        'x-ltth-admin-token': 'fixture-central-admin-token'
      }
    }, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expectNoConfigCanaries(response);
  });
});
