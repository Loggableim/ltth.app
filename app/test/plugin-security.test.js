const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const PluginLoader = require('../modules/plugin-loader');
const {
  assertPluginId,
  resolvePluginChildPath,
  setupPluginRoutes
} = require('../routes/plugin-routes');

describe('plugin path security', () => {
  test('rejects plugin ids that can escape the plugin directory', () => {
    expect(() => assertPluginId('../evil')).toThrow(/Invalid plugin id/);
    expect(() => assertPluginId('..')).toThrow(/Invalid plugin id/);
    expect(() => assertPluginId('evil/plugin')).toThrow(/Invalid plugin id/);
    expect(() => assertPluginId('valid-plugin_1')).not.toThrow();
  });

  test('rejects child paths that resolve outside the plugin root', () => {
    const root = path.join(os.tmpdir(), 'ltth-plugin-security');

    expect(resolvePluginChildPath(root, 'safe-plugin')).toBe(path.join(root, 'safe-plugin'));
    expect(() => resolvePluginChildPath(root, '..')).toThrow(/Invalid plugin id/);
    expect(() => resolvePluginChildPath(root, 'safe-plugin', '..', 'escape.js')).toThrow(/outside/);
  });

  test('deletePlugin refuses traversal ids and does not remove files outside plugin root', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-loader-'));
    const pluginsDir = path.join(base, 'plugins');
    const outsideDir = path.join(base, 'outside');
    fs.mkdirSync(pluginsDir);
    fs.mkdirSync(outsideDir);
    fs.writeFileSync(path.join(outsideDir, 'keep.txt'), 'keep');

    const loader = new PluginLoader(
      pluginsDir,
      { use: jest.fn() },
      { on: jest.fn(), sockets: { sockets: new Map() } },
      {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      { getPluginDataDir: () => path.join(base, 'data') },
      'default'
    );

    const result = await loader.deletePlugin('..');

    expect(result).toBe(false);
    expect(fs.existsSync(path.join(outsideDir, 'keep.txt'))).toBe(true);
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('reloadPlugin reloads a valid plugin id without referencing an undefined safe id', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-reload-'));
    const pluginsDir = path.join(base, 'plugins');
    const pluginDir = path.join(pluginsDir, 'sample-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });

    const loader = new PluginLoader(
      pluginsDir,
      { use: jest.fn() },
      { on: jest.fn(), sockets: { sockets: new Map() } },
      {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      { getPluginDataDir: () => path.join(base, 'data') },
      'default'
    );

    loader.unloadPlugin = jest.fn().mockResolvedValue(true);
    loader.loadPlugin = jest.fn().mockResolvedValue({ manifest: { id: 'sample-plugin' } });
    loader.saveState = jest.fn();

    const result = await loader.reloadPlugin('sample-plugin');

    expect(result).toBe(true);
    expect(loader.unloadPlugin).toHaveBeenCalledWith('sample-plugin');
    expect(loader.loadPlugin).toHaveBeenCalledWith(pluginDir);
    fs.rmSync(base, { recursive: true, force: true });
  });

  test('plugin log route rejects traversal ids before reading log files', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-log-route-'));
    const pluginsDir = path.join(base, 'plugins');
    const logsDir = path.join(base, 'logs');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(base, 'secret.log'), 'outside log');

    const previousLogDir = process.env.LTTH_LOG_DIR;
    process.env.LTTH_LOG_DIR = logsDir;

    try {
      const app = express();
      const passThrough = (req, res, next) => next();
      const pluginLoader = {
        pluginsDir,
        plugins: new Map(),
        state: {},
        getLocalizedDescription: manifest => manifest.description,
        getPlugin: jest.fn()
      };
      const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };

      setupPluginRoutes(app, pluginLoader, passThrough, passThrough, logger);

      await request(app)
        .get('/api/plugins/..%2Fsecret/log')
        .expect(400);
    } finally {
      if (previousLogDir === undefined) {
        delete process.env.LTTH_LOG_DIR;
      } else {
        process.env.LTTH_LOG_DIR = previousLogDir;
      }
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
