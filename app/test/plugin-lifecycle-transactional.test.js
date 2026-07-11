const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const PluginLoader = require('../modules/plugin-loader');

function logger() {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function socket(id) {
  const instance = new EventEmitter();
  instance.id = id;
  instance.emit = jest.fn(instance.emit.bind(instance));
  return instance;
}

function writePlugin(pluginsDir, id, source) {
  const dir = path.join(pluginsDir, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    id, name: id, version: '1.0.0', entry: 'main.js', enabled: true
  }));
  fs.writeFileSync(path.join(dir, 'main.js'), source);
  return dir;
}

describe('transactional plugin lifecycle', () => {
  let base;
  let pluginsDir;
  let app;
  let io;
  let loader;

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-transaction-'));
    pluginsDir = path.join(base, 'plugins');
    app = express();
    io = { emit: jest.fn(), sockets: { sockets: new Map() } };
    loader = new PluginLoader(pluginsDir, app, io, {}, logger(), {
      getPluginDataDir: id => path.join(base, 'data', id)
    }, 'test');
  });

  afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

  test('rolls back partial init and keeps routes, socket bindings and connection hooks disposable', async () => {
    const client = socket('existing');
    io.sockets.sockets.set(client.id, client);
    const dir = writePlugin(pluginsDir, 'broken', `
      module.exports = class Broken {
        constructor(api) { this.api = api; }
        async init() {
          this.api.registerRoute('get', '/api/broken', (req, res) => res.json({ success: true }));
          this.api.registerSocket('broken:event', () => {});
          this.api.registerSocketConnection(() => {});
          throw new Error('after registrations');
        }
        async destroy() { throw new Error('destroy also fails'); }
      };
    `);

    expect(await loader.loadPlugin(dir)).toBeNull();
    expect(loader.plugins.has('broken')).toBe(false);
    expect(loader.pluginRouters.has('broken')).toBe(false);
    expect(loader.pluginConnectionHandlers?.has('broken')).toBe(false);
    expect(client.listenerCount('broken:event')).toBe(0);
    await request(app).get('/api/broken').expect(404);
  });

  test('keeps one route, listener and timer generation across twelve reloads and removes routes on disable', async () => {
    const existing = socket('existing');
    io.sockets.sockets.set(existing.id, existing);
    const dir = writePlugin(pluginsDir, 'lifecycle', `
      module.exports = class Lifecycle {
        constructor(api) { this.api = api; this.timer = null; }
        async init() {
          this.api.registerRoute('get', '/api/lifecycle', (req, res) => res.json({ success: true }));
          this.api.registerSocket('lifecycle:event', () => {});
          this.api.registerSocketConnection(socket => socket.on('lifecycle:connection', () => {}));
          this.timer = setInterval(() => {}, 1000);
          global.__ltthLifecycleTimers = (global.__ltthLifecycleTimers || 0) + 1;
        }
        async destroy() { clearInterval(this.timer); global.__ltthLifecycleTimers--; }
      };
    `);

    expect(await loader.loadPlugin(dir)).toBeTruthy();
    loader.registerPluginSocketEvents(existing);
    const before = {
      routers: loader.pluginRouters.size,
      listeners: existing.listenerCount('lifecycle:event'),
      timers: global.__ltthLifecycleTimers
    };

    for (let index = 0; index < 12; index++) expect(await loader.reloadPlugin('lifecycle')).toBe(true);

    expect(loader.state.lifecycle.reloadCount).toBe(12);
    expect({
      routers: loader.pluginRouters.size,
      listeners: existing.listenerCount('lifecycle:event'),
      timers: global.__ltthLifecycleTimers
    }).toEqual(before);
    await request(app).get('/api/lifecycle').expect(200, { success: true });
    expect(await loader.disablePlugin('lifecycle')).toBe(true);
    expect(global.__ltthLifecycleTimers).toBe(0);
    expect(existing.listenerCount('lifecycle:event')).toBe(0);
    await request(app).get('/api/lifecycle').expect(404);
  });

  test('does not report a lifecycle success after false save, null load or false unload', async () => {
    writePlugin(pluginsDir, 'failing', 'module.exports = class Failing { async init() {} };');
    loader.saveState = jest.fn(() => false);
    await expect(loader.enablePlugin('failing')).rejects.toThrow(/save/i);

    loader.saveState = jest.fn(() => true);
    loader.loadPlugin = jest.fn().mockResolvedValue(null);
    await expect(loader.enablePlugin('failing')).rejects.toThrow(/failed to load/i);

    loader.unloadPlugin = jest.fn().mockResolvedValue(false);
    loader.plugins.set('failing', {});
    expect(await loader.disablePlugin('failing')).toBe(false);
    expect(await loader.reloadPlugin('failing')).toBe(false);
  });
});
