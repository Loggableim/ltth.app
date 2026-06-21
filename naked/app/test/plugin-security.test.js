const fs = require('fs');
const os = require('os');
const path = require('path');

const PluginLoader = require('../modules/plugin-loader');
const {
  assertPluginId,
  resolvePluginChildPath
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
});
