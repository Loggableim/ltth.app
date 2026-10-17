jest.mock('zip-lib', () => ({
  extract: jest.fn(async () => undefined),
  archiveFolder: jest.fn(async () => undefined)
}));

const express = require('express');
const fs = require('fs');
const path = require('path');
const { extract } = require('zip-lib');
const { setupPluginRoutes } = require('../routes/plugin-routes');

describe('plugin upload replacement unload guard', () => {
  test('does not remove or replace target files when the active plugin owner remains pending', async () => {
    const app = express();
    const uploadRoot = __dirname;
    const pluginsDir = path.join(__dirname, 'fixture-installed-plugins');
    const targetDir = path.join(pluginsDir, 'fixture-plugin');
    const uploadPath = path.join(uploadRoot, 'fixture-upload.zip');
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const pluginLoader = {
      pluginsDir,
      plugins: new Map([['fixture-plugin', { api: {} }]]),
      state: {},
      logger,
      releasePolicy: { assertAllowed: jest.fn() },
      unloadPlugin: jest.fn().mockResolvedValue(false)
    };

    setupPluginRoutes(
      app,
      pluginLoader,
      (_req, _res, next) => next(),
      (_req, _res, next) => next(),
      logger,
      null,
      null,
      { pluginUploadDir: uploadRoot, pluginStore: {} }
    );

    const uploadLayer = app._router.stack.find((layer) => layer.route?.path === '/api/plugins/upload');
    expect(uploadLayer).toBeDefined();
    const handler = uploadLayer.route.stack[uploadLayer.route.stack.length - 1].handle;
    let tempDir = null;
    const existsSync = fs.existsSync.bind(fs);
    const readFileSync = fs.readFileSync.bind(fs);
    const existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((target) => {
      const resolved = path.resolve(String(target));
      if (resolved === path.resolve(uploadRoot) || resolved === path.resolve(uploadPath)) return true;
      if (tempDir && [
        path.join(tempDir, 'plugin.json'),
        path.join(tempDir, 'index.js'),
        targetDir
      ].some((fixturePath) => resolved === path.resolve(fixturePath))) return true;
      return existsSync(target);
    });
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((target, ...args) => {
      const resolved = path.resolve(String(target));
      if (resolved === path.resolve(uploadPath)) return Buffer.from('synthetic zip bytes');
      if (tempDir && resolved === path.resolve(path.join(tempDir, 'plugin.json'))) {
        return JSON.stringify({ id: 'fixture-plugin', name: 'Fixture', entry: 'index.js', version: '1.0.0' });
      }
      return readFileSync(target, ...args);
    });
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation((target) => {
      if (String(target).startsWith(uploadRoot)) tempDir = String(target);
      return undefined;
    });
    const removeSpy = jest.spyOn(fs, 'rmSync').mockImplementation(() => undefined);
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => undefined);
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
    extract.mockClear();

    try {
      const response = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
      };
      await handler({
        file: { path: uploadPath, originalname: 'fixture-plugin.zip' }
      }, response);

      expect(response.statusCode).toBe(500);
      expect(pluginLoader.unloadPlugin).toHaveBeenCalledWith('fixture-plugin');
      expect(extract).toHaveBeenCalledTimes(1);
      expect(removeSpy).not.toHaveBeenCalledWith(targetDir, expect.anything());
      expect(renameSpy).not.toHaveBeenCalled();
      expect(unlinkSpy).toHaveBeenCalledWith(uploadPath);
    } finally {
      existsSpy.mockRestore();
      readSpy.mockRestore();
      mkdirSpy.mockRestore();
      removeSpy.mockRestore();
      renameSpy.mockRestore();
      unlinkSpy.mockRestore();
    }
  });
});
