const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');
const path = require('path');
const StreamAlchemyPlugin = require('../plugins/streamalchemy');

describe('Stream Monsters retired runtime data safety', () => {
  test('does not inspect, rewrite or remove historical runtime data during init/destroy', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'streammonsters-retired-runtime-'));
    const runtimeDir = path.join(dataDir, 'streammonsters-runtime', 'historical');
    const markerPath = path.join(runtimeDir, 'installation.json');
    const marker = Buffer.from('historical-runtime-bytes\u0000unchanged', 'utf8');
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(markerPath, marker);
    const plugin = new StreamAlchemyPlugin({
      pluginDir: path.join(process.cwd(), 'plugins', 'streamalchemy'),
      getDatabase: () => new Database(':memory:'),
      getConfig: () => ({}),
      setConfig: jest.fn(),
      ensurePluginDataDir: () => dataDir,
      registerRoute: jest.fn(),
      registerTikTokEvent: jest.fn(),
      emit: jest.fn(),
      log: jest.fn(),
      on: jest.fn(() => true),
      removeListener: jest.fn(),
      pluginLoader: { loadedPlugins: new Map() }
    });

    await plugin.init();
    await plugin.destroy();

    expect(fs.readFileSync(markerPath)).toEqual(marker);
    expect(fs.readdirSync(runtimeDir)).toEqual(['installation.json']);
  });
});
