'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const PluginLoader = require('../modules/plugin-loader');
const { PluginAPI } = PluginLoader;

function createLoader(pluginsDir, runtimeOptions = {}) {
  return new PluginLoader(
    pluginsDir,
    express(),
    { emit: jest.fn(), sockets: { sockets: new Map() } },
    {},
    { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    { getPluginDataDir: pluginId => path.join(pluginsDir, 'data', pluginId) },
    null,
    runtimeOptions
  );
}

function writeCapabilityProbePlugin(pluginsDir) {
  const pluginDir = path.join(pluginsDir, 'capability-probe');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id: 'capability-probe',
    name: 'Capability Probe',
    version: '1.0.0',
    entry: 'index.js',
    enabled: true
  }));
  fs.writeFileSync(path.join(pluginDir, 'index.js'), `module.exports = class CapabilityProbe {
    constructor(api) { this.api = api; }
    async init() {
      global.__docsCaptureCapabilityProbe = {
        value: this.api.isDocsCapture,
        writable: Object.getOwnPropertyDescriptor(this.api, 'isDocsCapture').writable,
        configurable: Object.getOwnPropertyDescriptor(this.api, 'isDocsCapture').configurable,
        profileRoot: this.api.docsCaptureProfileRoot,
        profileRootWritable: Object.getOwnPropertyDescriptor(this.api, 'docsCaptureProfileRoot').writable
      };
    }
  };`);
}

describe('PluginAPI docs-capture capability', () => {
  let pluginsDir;

  beforeEach(() => {
    pluginsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-api-capability-'));
    writeCapabilityProbePlugin(pluginsDir);
  });

  afterEach(() => {
    delete global.__docsCaptureCapabilityProbe;
    fs.rmSync(pluginsDir, { recursive: true, force: true });
  });

  test('passes a read-only capture capability only when the trusted loader option is true', async () => {
    const loader = createLoader(pluginsDir, { docsCapture: true, docsCaptureProfileRoot: pluginsDir });
    expect(Object.getOwnPropertyDescriptor(loader, 'isDocsCapture')).toMatchObject({
      value: true,
      writable: false,
      configurable: false
    });
    await loader.loadAllPlugins({ allowedPluginIds: new Set(['capability-probe']) });
    expect(global.__docsCaptureCapabilityProbe).toEqual({
      value: true,
      writable: false,
      configurable: false,
      profileRoot: pluginsDir,
      profileRootWritable: false
    });
    await loader.unloadPlugin('capability-probe');

    const normalLoader = createLoader(pluginsDir);
    expect(Object.getOwnPropertyDescriptor(normalLoader, 'isDocsCapture')).toMatchObject({
      value: false,
      writable: false,
      configurable: false
    });
    await normalLoader.loadAllPlugins();
    expect(global.__docsCaptureCapabilityProbe).toEqual({
      value: false,
      writable: false,
      configurable: false,
      profileRoot: null,
      profileRootWritable: false
    });
    await normalLoader.unloadPlugin('capability-probe');
  });

  test('exposes an immutable database-path assertion scoped to the docs-capture profile', () => {
    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-db-path-'));
    const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-db-outside-'));
    const configDir = path.join(profileRoot, 'ltth.app');
    const userConfigsDir = path.join(configDir, 'user_configs');
    fs.mkdirSync(userConfigsDir, { recursive: true });
    const databasePath = path.join(userConfigsDir, 'default.db');
    fs.writeFileSync(databasePath, 'isolated-test-db');
    const configPathManager = {
      APP_NAME: 'ltth.app',
      docsCaptureMode: true,
      env: { LOCALAPPDATA: profileRoot },
      getConfigDir: () => configDir,
      getUserConfigsDir: () => userConfigsDir
    };
    const api = new PluginAPI(
      'stream-monsters', pluginsDir, express(), {}, {},
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      null, configPathManager, null, null, null, true, profileRoot
    );

    try {
      expect(api.assertDocsCaptureDatabasePath(databasePath)).toBe(true);
      expect(Object.getOwnPropertyDescriptor(api, 'assertDocsCaptureDatabasePath')).toMatchObject({
        writable: false,
        configurable: false
      });
      fs.unlinkSync(databasePath);
      expect(api.assertDocsCaptureDatabasePath(databasePath)).toBe(true);
      fs.writeFileSync(databasePath, 'isolated-test-db');
      expect(() => api.assertDocsCaptureDatabasePath(path.join(profileRoot, 'outside.db')))
        .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));
      expect(() => api.assertDocsCaptureDatabasePath(profileRoot))
        .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));
      expect(() => api.assertDocsCaptureDatabasePath(path.relative(process.cwd(), databasePath)))
        .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));
      expect(() => api.assertDocsCaptureDatabasePath(path.join(userConfigsDir, 'other.db')))
        .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));
      expect(() => api.assertDocsCaptureDatabasePath(':memory:'))
        .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));

      const outsideConfigDir = path.join(outsideRoot, 'ltth.app');
      const outsideUserConfigsDir = path.join(outsideConfigDir, 'user_configs');
      fs.mkdirSync(outsideUserConfigsDir, { recursive: true });
      fs.writeFileSync(path.join(outsideUserConfigsDir, 'default.db'), 'outside-test-db');
      fs.rmSync(configDir, { recursive: true, force: true });
      try {
        fs.symlinkSync(outsideConfigDir, configDir, process.platform === 'win32' ? 'junction' : 'dir');
      } catch (error) {
        if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) throw error;
        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(path.join(configDir, 'user_configs'), { recursive: true });
        fs.writeFileSync(path.join(configDir, 'user_configs', 'default.db'), 'isolated-test-db');
        const realpathSync = fs.realpathSync.bind(fs);
        const realpathSpy = jest.spyOn(fs, 'realpathSync').mockImplementation(targetPath => {
          return path.resolve(String(targetPath)) === configDir
            ? outsideConfigDir
            : realpathSync(targetPath);
        });
        try {
          expect(() => api.assertDocsCaptureDatabasePath(databasePath))
            .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));
        } finally {
          realpathSpy.mockRestore();
        }
      }
      if (fs.lstatSync(configDir).isSymbolicLink()) {
        expect(() => api.assertDocsCaptureDatabasePath(databasePath))
          .toThrow(expect.objectContaining({ code: 'DOCS_CAPTURE_DATABASE_PATH_DENIED' }));
        fs.unlinkSync(configDir);
      }

      const normalApi = new PluginAPI(
        'stream-monsters', pluginsDir, express(), {}, {},
        { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        null, { docsCaptureMode: false }, null, null, null, false, null
      );
      expect(normalApi.assertDocsCaptureDatabasePath('unchanged-normal-runtime-path')).toBe(true);
    } finally {
      if (fs.existsSync(configDir) && fs.lstatSync(configDir).isSymbolicLink()) {
        fs.unlinkSync(configDir);
      }
      fs.rmSync(profileRoot, { recursive: true, force: true });
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});
