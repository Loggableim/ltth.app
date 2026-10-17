const express = require('express');
const request = require('supertest');
const PluginLoader = require('../modules/plugin-loader');
const { createAdminAuth, isLoopbackAddress } = require('../modules/admin-auth');

function createFixture() {
  const app = express();
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const pluginLoader = Object.create(PluginLoader.prototype);
  pluginLoader.plugins = new Map();
  pluginLoader.pluginRouters = new Map();

  const pluginApi = new PluginLoader.PluginAPI(
    'music-bot',
    'fixture-plugin-directory',
    app,
    {},
    {},
    logger,
    pluginLoader,
    {}
  );
  pluginLoader.plugins.set('music-bot', { api: pluginApi, instance: {} });

  const handler = jest.fn((req, res) => {
    res.status(200).json({ success: true, remoteAddress: req.socket.remoteAddress });
  });
  const route = '/api/plugins/music-bot/contract-mutation';

  app.use('/api', createAdminAuth({ token: 'fixture-admin-token' }));
  expect(pluginApi.registerRoute('post', route, handler)).toBe(true);
  app.use(pluginLoader.getPluginRouter('music-bot'));

  return { app, handler, pluginApi, pluginLoader, route };
}

describe('PluginAPI HTTP route with admin auth middleware', () => {
  test.each([
    ['direct loopback without a token', {}, 200, true],
    ['forwarded loopback without a token', { 'x-forwarded-for': '127.0.0.1' }, 401, false],
    ['forwarded request with valid token', {
      'x-forwarded-for': '127.0.0.1',
      'x-ltth-admin-token': 'fixture-admin-token'
    }, 200, true],
    ['forwarded request with wrong token', {
      'x-forwarded-for': '127.0.0.1',
      'x-ltth-admin-token': 'wrong-fixture-token'
    }, 403, false]
  ])('%s reaches the real PluginAPI route only when allowed', async (_label, headers, status, allowed) => {
    const { app, handler, route } = createFixture();
    const response = await request(app).post(route).set(headers).expect(status);

    expect(handler).toHaveBeenCalledTimes(allowed ? 1 : 0);
    if (allowed) expect(response.body).toEqual(expect.objectContaining({ success: true }));
  });

  test('direct Supertest transport is loopback and the real route wrapper enforces plugin ownership', async () => {
    const { app, handler, pluginApi, pluginLoader, route } = createFixture();
    const directResponse = await request(app).post(route).expect(200);

    expect(isLoopbackAddress(directResponse.body.remoteAddress)).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    pluginLoader.plugins.set('music-bot', { api: {}, instance: {} });
    await request(app).post(route).expect(404);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(pluginApi.registeredRoutes).toHaveLength(1);
  });
});
