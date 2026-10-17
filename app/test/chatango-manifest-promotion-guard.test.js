'use strict';

const archiver = require('archiver');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

const { PluginStore } = require('../modules/plugin-store');
const { setupPluginRoutes } = require('../routes/plugin-routes');

async function writePluginZip(zipPath, manifest) {
  const archive = archiver('zip');
  const output = fs.createWriteStream(zipPath);
  archive.pipe(output);
  archive.append(JSON.stringify(manifest), { name: 'plugin.json' });
  archive.append('global.__retiredChatangoPluginExecuted = true;', { name: 'main.js' });

  const closed = new Promise((resolve, reject) => {
    output.once('close', resolve);
    output.once('error', reject);
    archive.once('error', reject);
  });
  archive.finalize();
  await closed;
  return fs.readFileSync(zipPath);
}

function retiredClaim(field, value) {
  return { [field]: value };
}

describe('retired Chatango manifest promotion guard', () => {
  test.each([
    ['aliases', ['chatango']],
    ['replaces', '%2563hatango']
  ])('store metadata %s is rejected before fetch or promotion', async (field, value) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-chatango-store-metadata-'));
    const pluginsDir = path.join(root, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });

    const fetchImpl = jest.fn();
    const mkdir = jest.fn();
    const loader = {
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      plugins: new Map(),
      pluginsDir,
      releasePolicy: { assertAllowed: jest.fn(id => id) },
      state: {},
      loadPlugin: jest.fn()
    };
    const store = new PluginStore(loader, {
      fetchImpl,
      fileOps: { mkdir },
      stateFile: path.join(root, 'store-state.json')
    });

    try {
      await expect(store.installPlugin('official', 'safe-wrapper', {
        plugin: {
          id: 'safe-wrapper',
          name: 'Synthetic wrapper',
          version: '1.0.0',
          ...retiredClaim(field, value)
        }
      })).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });

      expect(fetchImpl).not.toHaveBeenCalled();
      expect(mkdir).not.toHaveBeenCalled();
      expect(loader.loadPlugin).not.toHaveBeenCalled();
      expect(fs.readdirSync(pluginsDir)).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['aliases', ['%2563hatango']],
    ['replaces', 'Ｃｈａｔａｎｇｏ']
  ])('downloaded package %s is rejected before plugin promotion and runtime load', async (field, value) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-chatango-store-zip-'));
    const pluginsDir = path.join(root, 'plugins');
    const zipPath = path.join(root, 'synthetic-plugin.zip');
    fs.mkdirSync(pluginsDir, { recursive: true });
    const zipBytes = await writePluginZip(zipPath, {
      id: 'safe-wrapper',
      name: 'Synthetic wrapper',
      entry: 'main.js',
      version: '1.0.0',
      ...retiredClaim(field, value)
    });
    const zipSha256 = crypto.createHash('sha256').update(zipBytes).digest('hex');
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from(zipBytes).buffer
    });
    const mkdir = jest.fn();
    const copyDirectory = jest.fn();
    const rename = jest.fn();
    const loader = {
      logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
      plugins: new Map(),
      pluginsDir,
      releasePolicy: { assertAllowed: jest.fn(id => id) },
      state: {},
      loadPlugin: jest.fn(),
      saveState: jest.fn()
    };
    const store = new PluginStore(loader, {
      fetchImpl,
      fileOps: { copyDirectory, mkdir, rename },
      stateFile: path.join(root, 'store-state.json')
    });
    const originalMkdtemp = fs.mkdtempSync;
    const storeTempDirs = [];
    const mkdtempSpy = jest.spyOn(fs, 'mkdtempSync').mockImplementation((prefix, ...args) => {
      const created = originalMkdtemp.call(fs, prefix, ...args);
      if (String(prefix).includes('ltth-plugin-store-')) storeTempDirs.push(created);
      return created;
    });

    try {
      await expect(store.installPlugin('official', 'safe-wrapper', {
        plugin: {
          id: 'safe-wrapper',
          name: 'Synthetic wrapper',
          version: '1.0.0',
          packageUrl: 'https://example.invalid/safe-wrapper.zip',
          sha256: zipSha256
        }
      })).rejects.toMatchObject({ code: 'PLUGIN_RETIRED' });

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(mkdir).not.toHaveBeenCalled();
      expect(copyDirectory).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();
      expect(loader.loadPlugin).not.toHaveBeenCalled();
      expect(fs.readdirSync(pluginsDir)).toEqual([]);
      expect(storeTempDirs).toHaveLength(1);
      expect(fs.existsSync(storeTempDirs[0])).toBe(false);
    } finally {
      mkdtempSpy.mockRestore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['aliases', ['chatango']],
    ['replaces', ['CHATANGO']]
  ])('manual upload %s is rejected before promotion and cleans temporary files', async (field, value) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-chatango-upload-'));
    const pluginsDir = path.join(root, 'plugins');
    const uploadDir = path.join(root, 'uploads');
    const zipPath = path.join(root, 'synthetic-upload.zip');
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    await writePluginZip(zipPath, {
      id: 'safe-wrapper',
      name: 'Synthetic wrapper',
      entry: 'main.js',
      version: '1.0.0',
      ...retiredClaim(field, value)
    });

    const passThrough = (_req, _res, next) => next();
    const logger = { debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() };
    const loader = {
      logger,
      plugins: new Map(),
      pluginsDir,
      releasePolicy: { assertAllowed: jest.fn(id => id) },
      loadPlugin: jest.fn(),
      unloadPlugin: jest.fn()
    };
    const pluginStore = {
      findPlugin: jest.fn(),
      getInstalledPlugins: () => new Map(),
      installPlugin: jest.fn(),
      rollbackPlugin: jest.fn()
    };
    const app = express();
    setupPluginRoutes(app, loader, passThrough, passThrough, logger, null, null, {
      env: {},
      pluginStore,
      pluginUploadDir: uploadDir,
      storeAuth: passThrough,
      freshStoreAuth: passThrough
    });

    try {
      const uploaded = await request(app)
        .post('/api/plugins/upload')
        .attach('plugin', zipPath)
        .expect(410);

      expect(uploaded.body.code).toBe('PLUGIN_RETIRED');
      expect(fs.existsSync(path.join(pluginsDir, 'safe-wrapper'))).toBe(false);
      expect(fs.readdirSync(pluginsDir)).toEqual([]);
      expect(fs.readdirSync(uploadDir)).toEqual([]);
      expect(loader.loadPlugin).not.toHaveBeenCalled();
      expect(pluginStore.findPlugin).not.toHaveBeenCalled();
      expect(pluginStore.installPlugin).not.toHaveBeenCalled();
      expect(global.__retiredChatangoPluginExecuted).toBeUndefined();
    } finally {
      delete global.__retiredChatangoPluginExecuted;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
