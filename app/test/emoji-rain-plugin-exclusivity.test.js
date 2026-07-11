const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');

const PluginLoader = require('../modules/plugin-loader');

function writePlugin(pluginsDir, id) {
  const pluginDir = path.join(pluginsDir, id);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'main.js'), 'module.exports = class Plugin { async init() {} async destroy() {} };');
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id, name: id, version: '1.0.0', entry: 'main.js', enabled: false }));
}

function createLoader(baseDir, pluginsDir) {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return new PluginLoader(
    pluginsDir,
    express(),
    { emit: jest.fn(), sockets: { sockets: new Map() } },
    {},
    logger,
    {
      getUserConfigsDir: () => path.join(baseDir, 'user-configs'),
      getPluginDataDir: pluginId => path.join(baseDir, 'plugin-data', pluginId)
    },
    'default'
  );
}

describe('EmojiRain renderer exclusivity', () => {
  let baseDir;
  let pluginsDir;

  beforeEach(() => {
    baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-emoji-exclusive-'));
    pluginsDir = path.join(baseDir, 'plugins');
    writePlugin(pluginsDir, 'emoji-rain');
    writePlugin(pluginsDir, 'webgpu-emoji-rain');
  });

  afterEach(() => fs.rmSync(baseDir, { recursive: true, force: true }));

  test('switches atomically in both directions', async () => {
    const loader = createLoader(baseDir, pluginsDir);
    const events = [];
    loader.on('plugin:enabled', pluginId => events.push(`enabled:${pluginId}`));
    loader.on('plugin:disabled', pluginId => events.push(`disabled:${pluginId}`));
    await loader.enablePlugin('emoji-rain');
    await loader.enablePlugin('webgpu-emoji-rain');
    expect(loader.state['emoji-rain'].enabled).toBe(false);
    expect(loader.state['webgpu-emoji-rain'].enabled).toBe(true);
    expect([...loader.plugins.keys()]).toEqual(['webgpu-emoji-rain']);
    expect(events).toEqual(expect.arrayContaining([
      'disabled:emoji-rain',
      'enabled:webgpu-emoji-rain'
    ]));

    await loader.enablePlugin('emoji-rain');
    expect(loader.state['emoji-rain'].enabled).toBe(true);
    expect(loader.state['webgpu-emoji-rain'].enabled).toBe(false);
    expect([...loader.plugins.keys()]).toEqual(['emoji-rain']);
  });

  test('restores the active edition when loading the replacement fails', async () => {
    const loader = createLoader(baseDir, pluginsDir);
    await loader.enablePlugin('emoji-rain');
    fs.writeFileSync(
      path.join(pluginsDir, 'webgpu-emoji-rain', 'main.js'),
      "module.exports = class Plugin { async init() { throw new Error('renderer init failed'); } };"
    );

    await expect(loader.enablePlugin('webgpu-emoji-rain')).rejects.toThrow('failed to load');

    expect(loader.state['emoji-rain'].enabled).toBe(true);
    expect(loader.isPluginEnabledFromDisk('webgpu-emoji-rain')).toBe(false);
    expect([...loader.plugins.keys()]).toEqual(['emoji-rain']);
  });

  test('repairs an invalid persisted state using the latest activation', () => {
    const loader = createLoader(baseDir, pluginsDir);
    loader.state['emoji-rain'] = { enabled: true, enabledAt: 100 };
    loader.state['webgpu-emoji-rain'] = { enabled: true, enabledAt: 200 };
    expect(loader.enforceMutuallyExclusivePluginState()).toBe(true);
    expect(loader.state['emoji-rain']).toEqual(expect.objectContaining({ enabled: false, disabledByMutualExclusion: 'webgpu-emoji-rain' }));
    expect(loader.state['webgpu-emoji-rain'].enabled).toBe(true);
  });

  test('startup repair persists the loser and publishes its disabled status', () => {
    const loader = createLoader(baseDir, pluginsDir);
    loader.state['emoji-rain'] = { enabled: true, enabledAt: 100 };
    loader.state['webgpu-emoji-rain'] = { enabled: true, enabledAt: 200 };
    expect(loader.saveState()).toBe(true);

    const disabledEvents = [];
    loader.on('plugin:disabled', pluginId => disabledEvents.push(pluginId));

    expect(loader.enforceMutuallyExclusivePluginState()).toBe(true);
    expect(disabledEvents).toEqual(['emoji-rain']);

    const persisted = JSON.parse(fs.readFileSync(loader.stateFile, 'utf8'));
    expect(persisted['emoji-rain']).toEqual(expect.objectContaining({
      enabled: false,
      disabledByMutualExclusion: 'webgpu-emoji-rain'
    }));
    expect(persisted['webgpu-emoji-rain']).toEqual(expect.objectContaining({ enabled: true, enabledAt: 200 }));

    const reloaded = createLoader(baseDir, pluginsDir);
    expect(reloaded.state['emoji-rain'].enabled).toBe(false);
    expect(reloaded.state['webgpu-emoji-rain'].enabled).toBe(true);
  });
});
