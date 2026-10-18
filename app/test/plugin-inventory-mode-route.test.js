'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { setupPluginRoutes } = require('../routes/plugin-routes');

describe('plugin inventory distribution mode DTO', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-inventory-mode-'));
    fs.mkdirSync(path.join(root, 'plugins', 'public-tool'), { recursive: true });
    fs.writeFileSync(path.join(root, 'plugins', 'public-tool', 'plugin.json'), JSON.stringify({
      id: 'public-tool', name: 'Public Tool', description: 'A public plugin', version: '1.0.0', enabled: true
    }));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test.each([
    ['public', true],
    ['local', false]
  ])('returns only the safe %s/local mode marker alongside the existing inventory', async (mode, publicMode) => {
    const pluginsDir = path.join(root, 'plugins');
    const pluginLoader = {
      pluginsDir,
      plugins: new Map(),
      state: {},
      releasePolicy: { getSnapshot: () => ({ publicMode }) },
      buildPluginInventory: (dirs) => dirs.map((dir) => {
        const pluginPath = path.join(pluginsDir, dir.name);
        const manifest = JSON.parse(fs.readFileSync(path.join(pluginPath, 'plugin.json'), 'utf8'));
        return {
          canonicalId: manifest.id,
          directoryName: dir.name,
          path: pluginPath,
          runtimeManifestId: manifest.id,
          aliases: [],
          manifest
        };
      }),
      getLocalizedDescription: (manifest) => manifest.description
    };
    const app = express();
    const logger = { info() {}, warn() {}, error() {} };
    const pass = (req, res, next) => next();

    setupPluginRoutes(app, pluginLoader, pass, pass, logger, null, null, {
      env: {},
      pluginStore: {},
      pluginUploadDir: path.join(root, 'uploads'),
      storeAuth: pass,
      freshStoreAuth: pass
    });

    const response = await request(app).get('/api/plugins').expect(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      distributionMode: mode,
      plugins: [expect.objectContaining({ id: 'public-tool' })]
    }));
    expect(Object.keys(response.body).sort()).toEqual(['distributionMode', 'plugins', 'success']);
    expect(response.body).not.toHaveProperty('closedBeta');
    expect(response.body).not.toHaveProperty('blockedIds');
  });

  test('returns a valid empty inventory when no plugin manifests are installed', async () => {
    const pluginsDir = path.join(root, 'plugins');
    fs.rmSync(path.join(pluginsDir, 'public-tool'), { recursive: true, force: true });
    const pluginLoader = {
      pluginsDir,
      plugins: new Map(),
      state: {},
      releasePolicy: { getSnapshot: () => ({ publicMode: true }) },
      buildPluginInventory: () => [],
      getLocalizedDescription: (manifest) => manifest.description
    };
    const app = express();
    const pass = (req, res, next) => next();
    setupPluginRoutes(app, pluginLoader, pass, pass, { info() {}, warn() {}, error() {} }, null, null, {
      env: {},
      pluginStore: {},
      pluginUploadDir: path.join(root, 'uploads'),
      storeAuth: pass,
      freshStoreAuth: pass
    });

    const response = await request(app).get('/api/plugins').expect(200);
    expect(response.body).toEqual({ success: true, distributionMode: 'public', plugins: [] });
  });
});
