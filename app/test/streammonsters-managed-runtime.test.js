const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const StreamAlchemyPlugin = require('../plugins/stream-monsters');

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

describe('Stream Monsters managed-runtime retirement', () => {
  test('ships no installer and retains exact 410 compatibility handlers', async () => {
    expect(fs.existsSync(path.join(
      process.cwd(),
      'plugins',
      'streamalchemy',
      'backend',
      'streammonsters',
      'managed-runtime-installer.js'
    ))).toBe(false);
    const routes = [];
    const plugin = new StreamAlchemyPlugin({
      pluginDir: path.join(process.cwd(), 'plugins', 'stream-monsters'),
      getDatabase: () => new Database(':memory:'),
      getConfig: () => ({}),
      setConfig: jest.fn(),
      ensurePluginDataDir: () => process.cwd(),
      registerRoute: (method, routePath, handler) => routes.push({ method, routePath, handler }),
      registerTikTokEvent: jest.fn(),
      emit: jest.fn(),
      log: jest.fn(),
      on: jest.fn(() => true),
      removeListener: jest.fn(),
      pluginLoader: { loadedPlugins: new Map() }
    });
    await plugin.init();

    for (const [method, routePath] of [
      ['GET', '/api/streammonsters/local-runtime/status'],
      ['POST', '/api/streammonsters/local-runtime/install'],
      ['POST', '/api/streammonsters/local-runtime/start'],
      ['POST', '/api/streammonsters/local-runtime/stop'],
      ['POST', '/api/streammonsters/local-runtime/verify']
    ]) {
      const res = response();
      routes.find(route => route.method === method && route.routePath === routePath).handler({}, res);
      expect(res.statusCode).toBe(410);
      expect(res.payload).toEqual({ error: 'art_lab_removed' });
    }
    expect(plugin.streamMonstersManagedRuntime).toBeUndefined();
    await plugin.destroy();
  });
});
