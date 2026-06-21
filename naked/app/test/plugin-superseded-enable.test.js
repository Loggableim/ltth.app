const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const PluginLoader = require('../modules/plugin-loader');

function createLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
}

function writePlugin(pluginsDir, id, manifestOverrides = {}) {
  const pluginDir = path.join(pluginsDir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'main.js'), `
    module.exports = class TestPlugin {
      constructor(api) {
        this.api = api;
      }

      async init() {}
    };
  `);
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id,
    name: id,
    version: '1.0.0',
    entry: 'main.js',
    enabled: false,
    ...manifestOverrides
  }, null, 2));
  return pluginDir;
}

describe('superseded plugin enabling', () => {
  let baseDir;
  let pluginsDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-superseded-plugin-'));
    pluginsDir = path.join(baseDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  test('reports that gift-milestone is provided by milestone-leaderboard instead of a generic load failure', async () => {
    writePlugin(pluginsDir, 'gift-milestone');
    writePlugin(pluginsDir, 'milestone-leaderboard', { enabled: true });

    const logger = createLogger();
    const loader = new PluginLoader(
      pluginsDir,
      express(),
      { emit: jest.fn(), sockets: { sockets: new Map() } },
      {},
      logger,
      {
        getUserConfigsDir: () => path.join(baseDir, 'config'),
        getPluginDataDir: (pluginId) => path.join(baseDir, 'data', pluginId)
      },
      'default'
    );

    await expect(loader.enablePlugin('gift-milestone')).rejects.toThrow(
      'Plugin gift-milestone is already provided by milestone-leaderboard. Disable milestone-leaderboard before enabling gift-milestone.'
    );

    expect(loader.state['gift-milestone']).toEqual({
      enabled: false,
      supersededBy: 'milestone-leaderboard'
    });
    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Check server logs for detailed error information')
    );
  });
});
