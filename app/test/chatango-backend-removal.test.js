'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');

const PluginLoader = require('../modules/plugin-loader');
const { setupPluginRoutes } = require('../routes/plugin-routes');

describe('removed Chatango plugin backend', () => {
  test('plugin discovery ignores the remaining locale-only directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-removed-chatango-'));
    const pluginsDir = path.join(root, 'plugins');
    const chatangoDir = path.join(pluginsDir, 'chatango');
    fs.mkdirSync(path.join(chatangoDir, 'locales'), { recursive: true });

    try {
      const loader = Object.create(PluginLoader.prototype);
      loader.pluginsDir = pluginsDir;
      loader.logger = { warn: jest.fn() };
      const pluginDirs = fs.readdirSync(pluginsDir, { withFileTypes: true }).filter(entry => (
        entry.isDirectory() &&
        !entry.name.startsWith('_') &&
        fs.existsSync(path.join(pluginsDir, entry.name, 'plugin.json'))
      ));

      expect(loader.buildPluginInventory(pluginDirs)).toEqual([]);
      expect(fs.existsSync(path.join(chatangoDir, 'plugin.json'))).toBe(false);
      expect(fs.existsSync(path.join(chatangoDir, 'main.js'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('startup stale-state pruning preserves saved Chatango preferences without writing them', () => {
    const loader = Object.create(PluginLoader.prototype);
    const savedState = { enabled: true, config: { room: 'preserve-me' } };
    loader.releasePolicy = { isClosedBetaId: () => false, assertAllowed: id => id };
    loader.state = { chatango: savedState };
    loader.logger = { info: jest.fn(), warn: jest.fn() };
    loader.saveState = jest.fn(() => true);

    loader.pruneStalePluginState([]);

    expect(loader.state.chatango).toBe(savedState);
    expect(loader.saveState).not.toHaveBeenCalled();
  });

  test('plugin routes hide stale Chatango state and cannot re-enable it or rewrite the saved preference', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-chatango-registry-'));
    const pluginsDir = path.join(root, 'plugins');
    const chatangoDir = path.join(pluginsDir, 'chatango');
    const uploadDir = path.join(__dirname, '..', 'plugins', '_uploads');
    fs.mkdirSync(path.join(chatangoDir, 'locales'), { recursive: true });

    const logger = {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn()
    };
    const savedState = { enabled: true, config: { room: 'historical-room' }, custom: 'keep' };
    const loader = Object.create(PluginLoader.prototype);
    Object.assign(loader, {
      logger,
      releasePolicy: { isClosedBetaId: () => false, assertAllowed: id => id },
      pluginsDir,
      plugins: new Map(),
      state: { chatango: structuredClone(savedState) },
      saveState: jest.fn(() => true)
    });
    const passThrough = (_req, _res, next) => next();
    const app = express();
    const originalExistsSync = fs.existsSync;
    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((targetPath) => (
      path.resolve(String(targetPath)) === path.resolve(uploadDir)
        ? true
        : originalExistsSync.call(fs, targetPath)
    ));

    try {
      setupPluginRoutes(app, loader, passThrough, passThrough, logger, null, null, {
        env: {},
        pluginStore: { getInstalledPlugins: () => new Map() },
        storeAuth: passThrough,
        freshStoreAuth: passThrough
      });

      const registry = await request(app).get('/api/plugins').expect(200);
      expect(registry.body.plugins.map(plugin => plugin.id)).not.toContain('chatango');

      // Stale identifiers are rejected at the route validation boundary before
      // plugin lookup; this must not mutate the preserved state either.
      await request(app).get('/api/plugins/chatango').expect(404);
      const enableResponse = await request(app).post('/api/plugins/chatango/enable').expect(500);
      expect(enableResponse.body).toMatchObject({
        success: false,
        code: 'PLUGIN_ENABLE_FAILED'
      });
      expect(loader.plugins.has('chatango')).toBe(false);
      expect(loader.state.chatango).toEqual(savedState);
      expect(loader.saveState).not.toHaveBeenCalled();
    } finally {
      existsSpy.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Chatango is absent from the backend preinstalled-plugin set and bundled code entrypoints', () => {
    const appRoot = path.join(__dirname, '..');
    const pluginStoreSource = fs.readFileSync(path.join(appRoot, 'modules', 'plugin-store.js'), 'utf8');
    const preinstalledSet = pluginStoreSource.match(/const PREINSTALLED_PLUGIN_IDS = new Set\(\[([\s\S]*?)\]\);/);

    expect(preinstalledSet).not.toBeNull();
    expect(preinstalledSet[1]).not.toMatch(/chatango/i);
    expect(fs.existsSync(path.join(appRoot, 'plugins', 'chatango', 'plugin.json'))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, 'plugins', 'chatango', 'main.js'))).toBe(false);
    expect(fs.existsSync(path.join(appRoot, 'plugins', 'chatango', 'ui.html'))).toBe(false);
  });

});
