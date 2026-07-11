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

function writePlugin(pluginsDir, id, enabled = false) {
  const pluginDir = path.join(pluginsDir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'main.js'), `
    module.exports = class TestPlugin {
      async init() {}
      async destroy() {}
    };
  `);
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id,
    name: id,
    version: '1.0.0',
    entry: 'main.js',
    enabled
  }, null, 2));
}

function createLoader(baseDir, pluginsDir) {
  return new PluginLoader(
    pluginsDir,
    express(),
    { emit: jest.fn(), sockets: { sockets: new Map() } },
    {},
    createLogger(),
    {
      getUserConfigsDir: () => path.join(baseDir, 'config'),
      getPluginDataDir: pluginId => path.join(baseDir, 'data', pluginId)
    },
    'default'
  );
}

describe('Fireworks plugin exclusivity', () => {
  let baseDir;
  let pluginsDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-fireworks-exclusive-'));
    pluginsDir = path.join(baseDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    writePlugin(pluginsDir, 'fireworks');
    writePlugin(pluginsDir, 'webgpu-fireworks');
  });

  afterEach(() => {
    fs.rmSync(baseDir, { recursive: true, force: true });
  });

  test('switches from Fireworks to WebGPU Fireworks atomically', async () => {
    const loader = createLoader(baseDir, pluginsDir);
    await loader.enablePlugin('fireworks');
    await loader.enablePlugin('webgpu-fireworks');

    expect(loader.state.fireworks.enabled).toBe(false);
    expect(loader.state['webgpu-fireworks'].enabled).toBe(true);
    expect([...loader.plugins.keys()]).toEqual(['webgpu-fireworks']);
  });

  test('switches back from WebGPU Fireworks to Fireworks atomically', async () => {
    const loader = createLoader(baseDir, pluginsDir);
    await loader.enablePlugin('webgpu-fireworks');
    await loader.enablePlugin('fireworks');

    expect(loader.state['webgpu-fireworks'].enabled).toBe(false);
    expect(loader.state.fireworks.enabled).toBe(true);
    expect([...loader.plugins.keys()]).toEqual(['fireworks']);
  });

  test('repairs an invalid persisted state before startup loading', () => {
    const loader = createLoader(baseDir, pluginsDir);
    loader.state.fireworks = { enabled: true, enabledAt: 100 };
    loader.state['webgpu-fireworks'] = { enabled: true, enabledAt: 200 };

    expect(loader.enforceMutuallyExclusivePluginState()).toBe(true);
    expect(loader.state.fireworks.enabled).toBe(false);
    expect(loader.state.fireworks.disabledByMutualExclusion).toBe('webgpu-fireworks');
    expect(loader.state['webgpu-fireworks'].enabled).toBe(true);
  });

  test('exposes separate sidebar entries and views for both renderers', () => {
    const dashboard = fs.readFileSync(path.join(__dirname, '..', 'public', 'dashboard.html'), 'utf8');
    const navigation = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'navigation.js'), 'utf8');

    expect(dashboard).toContain('data-view="fireworks" data-plugin="fireworks"');
    expect(dashboard).toContain('data-view="webgpu-fireworks" data-plugin="webgpu-fireworks"');
    expect(dashboard).toContain('id="view-webgpu-fireworks"');
    expect(dashboard).toContain('data-src="/webgpu-fireworks/ui"');
    expect(navigation).toContain("'webgpu-fireworks': '#22d3ee'");
  });
});
