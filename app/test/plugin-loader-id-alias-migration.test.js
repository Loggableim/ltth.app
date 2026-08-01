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

function writePlugin(root, directoryName, manifestId, source, enabled = true) {
  const pluginDir = path.join(root, directoryName);
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({
    id: manifestId,
    name: 'Stream Monsters',
    version: '1.12.0',
    entry: 'index.js',
    enabled
  }));
  fs.writeFileSync(path.join(pluginDir, 'index.js'), source);
  return pluginDir;
}

function createLoader(root) {
  const io = { emit: jest.fn(), sockets: { sockets: new Map() } };
  const configPathManager = {
    getPluginDataDir: id => path.join(root, 'persistent', id, 'data')
  };
  return new PluginLoader(
    root,
    express(),
    io,
    {},
    createLogger(),
    configPathManager
  );
}

describe('plugin loader canonical identity inventory', () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-loader-alias-'));
    global.__streamMonstersIdentityProbe = [];
    global.__streamMonstersIdentityTimers = 0;
  });

  afterEach(() => {
    delete global.__streamMonstersIdentityProbe;
    delete global.__streamMonstersIdentityTimers;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const source = label => `
    module.exports = class IdentityProbe {
      constructor(api) {
        this.api = api;
        global.__streamMonstersIdentityProbe.push('construct:${label}');
      }
      async init() {
        global.__streamMonstersIdentityProbe.push('init:${label}');
        this.api.registerRoute('GET', '/api/streammonsters/probe', (_req, res) => res.json({ label: '${label}' }));
        this.api.registerSocket('streammonsters:probe', () => {});
        this.timer = setInterval(() => {}, 1000);
        this.timer.unref();
        global.__streamMonstersIdentityTimers += 1;
      }
      async destroy() {
        clearInterval(this.timer);
        global.__streamMonstersIdentityTimers -= 1;
      }
    };
  `;

  test.each([
    ['old-only', 'streamalchemy', 'streamalchemy'],
    ['new-only', 'stream-monsters', 'stream-monsters']
  ])('loads %s once and exposes only the canonical runtime id', async (
    _label,
    directoryName,
    manifestId
  ) => {
    writePlugin(root, directoryName, manifestId, source(directoryName));
    const loader = createLoader(root);

    const loaded = await loader.loadAllPlugins();

    expect(loaded).toHaveLength(1);
    expect([...loader.plugins.keys()]).toEqual(['stream-monsters']);
    expect(loader.getPlugin('streamalchemy')).toBe(loader.getPlugin('stream-monsters'));
    expect(loader.getPlugin('stream-monsters')).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      directoryName,
      runtimeManifestId: manifestId,
      aliases: ['streamalchemy'],
      path: path.join(root, directoryName)
    }));
    expect(global.__streamMonstersIdentityProbe).toEqual([
      `construct:${directoryName}`,
      `init:${directoryName}`
    ]);
    expect(global.__streamMonstersIdentityTimers).toBe(1);
    await loader.unloadPlugin('streamalchemy');
    expect(global.__streamMonstersIdentityTimers).toBe(0);
  });

  test('reads the complete inventory before construction and lets the canonical directory win', async () => {
    writePlugin(root, 'streamalchemy', 'streamalchemy', source('legacy'));
    writePlugin(root, 'stream-monsters', 'stream-monsters', source('canonical'));
    const order = [];
    const originalRead = fs.readFileSync;
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((filename, ...args) => {
      if (path.basename(String(filename)) === 'plugin.json') {
        order.push(`manifest:${path.basename(path.dirname(String(filename)))}`);
      }
      return originalRead(filename, ...args);
    });
    const probe = global.__streamMonstersIdentityProbe;
    const originalPush = probe.push.bind(probe);
    Object.defineProperty(probe, 'push', {
      configurable: true,
      value: value => {
        order.push(value);
        return originalPush(value);
      }
    });

    try {
      const loader = createLoader(root);
      await loader.loadAllPlugins();

      expect(order.indexOf('construct:canonical')).toBeGreaterThan(
        Math.max(order.indexOf('manifest:streamalchemy'), order.indexOf('manifest:stream-monsters'))
      );
      expect(global.__streamMonstersIdentityProbe).toEqual([
        'construct:canonical',
        'init:canonical'
      ]);
      expect(loader.plugins.size).toBe(1);
      expect(loader.getPlugin('streamalchemy').directoryName).toBe('stream-monsters');
      expect(loader.pluginRouters.size).toBe(1);
      expect(loader.getPlugin('stream-monsters').api.registeredSocketEvents).toHaveLength(1);
      expect(global.__streamMonstersIdentityTimers).toBe(1);
      await loader.unloadPlugin('stream-monsters');
    } finally {
      readSpy.mockRestore();
    }
  });

  test('canonicalizes alias lifecycle operations and emits each canonical event once', async () => {
    writePlugin(root, 'streamalchemy', 'streamalchemy', source('legacy'), false);
    const loader = createLoader(root);
    const enabled = jest.fn();
    const reloaded = jest.fn();
    const disabled = jest.fn();
    loader.on('plugin:enabled', enabled);
    loader.on('plugin:reloaded', reloaded);
    loader.on('plugin:disabled', disabled);

    expect(await loader.enablePlugin('streamalchemy')).toBe(true);
    expect(loader.plugins.has('stream-monsters')).toBe(true);
    expect(enabled).toHaveBeenCalledTimes(1);
    expect(enabled).toHaveBeenCalledWith('stream-monsters');

    expect(await loader.reloadPlugin('streamalchemy')).toBe(true);
    expect(reloaded).toHaveBeenCalledTimes(1);
    expect(reloaded).toHaveBeenCalledWith('stream-monsters');

    expect(await loader.disablePlugin('streamalchemy')).toBe(true);
    expect(disabled).toHaveBeenCalledTimes(1);
    expect(disabled).toHaveBeenCalledWith('stream-monsters');
    expect(loader.plugins.size).toBe(0);
  });

  test('aborts initialization when route registration fails even if the plugin ignores the return value', async () => {
    const pluginDir = writePlugin(root, 'broken-routes', 'broken-routes', `
      module.exports = class BrokenRoutes {
        constructor(api) { this.api = api; }
        async init() {
          this.api.registerRoute('NOT_A_METHOD', '/api/broken-routes', () => {});
        }
      };
    `);
    const loader = createLoader(root);

    expect(await loader.loadPlugin(pluginDir)).toBeNull();
    expect(loader.plugins.has('broken-routes')).toBe(false);
    expect(loader.pluginRouters.has('broken-routes')).toBe(false);
  });
});
