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
          this.destroyContext = null;
        }

        async init() {
          this.api.registerRoute('GET', '/api/route-test/ping', (req, res) => {
            res.json({ success: true });
          });
        }

        async destroy(context) {
          this.destroyContext = context;
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

    await loader.unloadPlugin('route-test', { reason: 'application-shutdown' });
    expect(plugin.instance.destroyContext).toEqual({ reason: 'application-shutdown' });

    await request(app).get('/api/route-test/ping').expect(404);
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('reports failed destroy as an unsuccessful unload while unregistering owned routes', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-destroy-failure-'));
    try {
      const pluginsDir = path.join(base, 'plugins');
      const pluginDir = path.join(pluginsDir, 'destroy-failure');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        id: 'destroy-failure',
        name: 'Destroy Failure',
        version: '1.0.0',
        entry: 'main.js',
        enabled: true
      }));
      fs.writeFileSync(path.join(pluginDir, 'main.js'), `
        module.exports = class DestroyFailurePlugin {
          constructor(api) { this.api = api; this.cleanupPending = false; this.attempts = 0; }
          async init() {
            this.api.registerRoute('GET', '/api/destroy-failure', (req, res) => res.end('alive'));
          }
          async destroy(context) {
            this.attempts += 1;
            if (context.reason === 'application-shutdown' && this.attempts === 1) {
              await new Promise(resolve => setTimeout(resolve, 20));
              this.cleanupPending = true;
              throw new Error('owned process did not close');
            }
            this.cleanupPending = false;
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
      expect(await loader.loadPlugin(pluginDir)).toBeTruthy();

      const firstUnload = loader.unloadPlugin('destroy-failure', { reason: 'application-shutdown' });
      const retainedPlugin = loader.plugins.get('destroy-failure');
      const explicitRetry = loader.unloadPlugin('destroy-failure', { reason: 'application-shutdown' });
      await expect(firstUnload).resolves.toBe(false);
      await expect(explicitRetry).resolves.toBe(true);
      expect(retainedPlugin.instance.attempts).toBe(2);
      expect(retainedPlugin.instance.cleanupPending).toBe(false);
      expect(loader.plugins.has('destroy-failure')).toBe(false);
      await request(app).get('/api/destroy-failure').expect(404);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('retains a generic plugin owner after application-shutdown destroy failure for explicit retry', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-generic-destroy-retry-'));
    try {
      const pluginsDir = path.join(base, 'plugins');
      const pluginDir = path.join(pluginsDir, 'generic-destroy-retry');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        id: 'generic-destroy-retry',
        name: 'Generic Destroy Retry',
        version: '1.0.0',
        entry: 'main.js',
        enabled: true
      }));
      fs.writeFileSync(path.join(pluginDir, 'main.js'), `
        module.exports = class GenericDestroyRetryPlugin {
          constructor(api) { this.api = api; this.attempts = 0; }
          async init() {
            this.api.registerRoute('GET', '/api/generic-destroy-retry', (req, res) => res.end('alive'));
          }
          async destroy() {
            this.attempts += 1;
            if (this.attempts === 1) throw new Error('cleanup did not finish');
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
      expect(await loader.loadPlugin(pluginDir)).toBeTruthy();

      const firstOwner = loader.plugins.get('generic-destroy-retry');
      await expect(loader.unloadPlugin('generic-destroy-retry', { reason: 'application-shutdown' }))
        .resolves.toBe(false);
      expect(loader.plugins.get('generic-destroy-retry')).toBe(firstOwner);
      expect(firstOwner.instance.cleanupPending).toBeUndefined();

      await expect(loader.unloadPlugin('generic-destroy-retry', { reason: 'application-shutdown' }))
        .resolves.toBe(true);
      expect(firstOwner.instance.attempts).toBe(2);
      expect(loader.plugins.has('generic-destroy-retry')).toBe(false);
      await request(app).get('/api/generic-destroy-retry').expect(404);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('returns a stable correlation envelope without exposing route failures', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-route-error-'));
    try {
      const pluginsDir = path.join(base, 'plugins');
      const pluginDir = path.join(pluginsDir, 'route-error-test');
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        id: 'route-error-test',
        name: 'Route Error Test',
        version: '1.0.0',
        entry: 'main.js',
        enabled: true
      }));
      fs.writeFileSync(path.join(pluginDir, 'main.js'), `
        module.exports = class RouteErrorTestPlugin {
          constructor(api) { this.api = api; }
          async init() {
            this.api.registerRoute('GET', '/api/route-error-test', () => {
              throw new Error('PRIVATE_DB_PASSWORD=do-not-expose');
            });
          }
        };
      `);
      const app = express();
      const log = createLogger();
      const loader = new PluginLoader(
        pluginsDir,
        app,
        { on: jest.fn(), sockets: { sockets: new Map() } },
        {},
        log,
        { getPluginDataDir: () => path.join(base, 'data') },
        'default'
      );
      expect(await loader.loadPlugin(pluginDir)).toBeTruthy();

      const response = await request(app).get('/api/route-error-test').expect(500);

      expect(response.body).toEqual({
        success: false,
        code: 'PLUGIN_ROUTE_ERROR',
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/i)
      });
      expect(JSON.stringify(response.body)).not.toContain('PRIVATE_DB_PASSWORD');
      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('PRIVATE_DB_PASSWORD'));
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });

  test('reloads modules required from the plugin directory', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-reload-'));
    const scriptPath = path.join(base, 'verify-reload.js');
    const loaderPath = path.resolve(__dirname, '../modules/plugin-loader');

    fs.writeFileSync(scriptPath, `
      const fs = require('fs');
      const path = require('path');
      const PluginLoader = require(process.argv[2]);
      const base = process.argv[3];
      const pluginsDir = path.join(base, 'plugins');
      const pluginDir = path.join(pluginsDir, 'child-reload-test');
      const logger = { info() {}, warn() {}, error() {}, debug() {} };

      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
        id: 'child-reload-test',
        name: 'Child Reload Test',
        version: '1.0.0',
        entry: 'main.js',
        enabled: true
      }));
      fs.writeFileSync(path.join(pluginDir, 'main.js'), "const state = require('./state'); module.exports = class { constructor() { this.value = state.value; } async init() {} };\\n");
      fs.writeFileSync(path.join(pluginDir, 'state.js'), "module.exports = { value: 'first' };\\n");

      const loader = new PluginLoader(
        pluginsDir,
        { use() {} },
        { on() {}, sockets: { sockets: new Map() } },
        {},
        logger,
        { getPluginDataDir: () => path.join(base, 'data') },
        'default'
      );

      (async () => {
        await loader.loadPlugin(pluginDir);
        fs.writeFileSync(path.join(pluginDir, 'state.js'), "module.exports = { value: 'second' };\\n");
        await loader.reloadPlugin('child-reload-test');
        process.stdout.write(loader.plugins.get('child-reload-test').instance.value);
      })().catch(error => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
      });
    `);

    try {
      const output = require('child_process').execFileSync(process.execPath, [scriptPath, loaderPath, base], {
        encoding: 'utf8'
      });
      expect(output).toBe('second');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
