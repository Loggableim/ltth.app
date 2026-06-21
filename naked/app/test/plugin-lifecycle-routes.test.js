const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const PluginLoader = require('../modules/plugin-loader');

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

describe('plugin route lifecycle', () => {
  test('does not execute plugin routes after the owning plugin is unloaded', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-route-'));
    const pluginsDir = path.join(base, 'plugins');
    const pluginDir = path.join(pluginsDir, 'route-test');
    fs.mkdirSync(pluginDir, { recursive: true });

    fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
      id: 'route-test',
      name: 'Route Test',
      version: '1.0.0',
      entry: 'main.js',
      enabled: true
    }));

    fs.writeFileSync(path.join(pluginDir, 'main.js'), `
      module.exports = class RouteTestPlugin {
        constructor(api) {
          this.api = api;
        }

        async init() {
          this.api.registerRoute('GET', '/api/route-test/ping', (req, res) => {
            res.json({ success: true });
          });
        }
      };
    `);

    const app = express();
    const loader = new PluginLoader(
      pluginsDir,
      app,
      { on: jest.fn(), sockets: { sockets: new Map() } },
      {},
      createLogger(),
      { getPluginDataDir: () => path.join(base, 'data') },
      'default'
    );

    const plugin = await loader.loadPlugin(pluginDir);
    expect(plugin).toBeTruthy();

    await request(app).get('/api/route-test/ping').expect(200, { success: true });

    await loader.unloadPlugin('route-test');

    await request(app).get('/api/route-test/ping').expect(404);
    fs.rmSync(base, { recursive: true, force: true });
  });
});
