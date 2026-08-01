'use strict';

const StreamMonstersPlugin = require('../plugins/stream-monsters');
const StreamMonstersRoutes = require('../plugins/stream-monsters/backend/streammonsters/routes');

function createPlugin(stored = {}) {
  let persisted = JSON.parse(JSON.stringify(stored));
  const api = {
    getConfig: jest.fn(() => persisted),
    setConfig: jest.fn((_key, value) => {
      persisted = JSON.parse(JSON.stringify(value));
    }),
    log: jest.fn()
  };
  const plugin = new StreamMonstersPlugin(api);
  plugin.config = plugin.loadConfig(stored);
  plugin.configRevision = Number(stored.revision || 0);
  return { api, plugin, persisted: () => persisted };
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

describe('Stream Monsters transactional configuration revisions', () => {
  test('commits an immutable candidate and advances the persisted revision', () => {
    const subject = createPlugin({
      revision: 4,
      streamMonsters: { eggShelfVisibleCount: 2, future112Field: 'keep-me' }
    });
    const before = subject.plugin.config;

    const next = subject.plugin.updateConfig(
      { streamMonsters: { eggShelfVisibleCount: 3 } },
      { expectedRevision: 4 }
    );

    expect(before).not.toBe(next);
    expect(before.streamMonsters.eggShelfVisibleCount).toBe(2);
    expect(next.streamMonsters).toEqual(expect.objectContaining({
      eggShelfVisibleCount: 3,
      future112Field: 'keep-me'
    }));
    expect(next.revision).toBe(5);
    expect(subject.plugin.configRevision).toBe(5);
    expect(subject.persisted()).toEqual(expect.objectContaining({ revision: 5 }));
  });

  test('rejects stale revisions without mutating config or persistence', () => {
    const subject = createPlugin({ revision: 7, streamMonsters: { eggShelfVisibleCount: 2 } });
    const before = JSON.parse(JSON.stringify(subject.plugin.config));

    expect(() => subject.plugin.updateConfig(
      { streamMonsters: { eggShelfVisibleCount: 4 } },
      { expectedRevision: 6 }
    )).toThrow(expect.objectContaining({
      code: 'STREAM_MONSTERS_CONFIG_REVISION_CONFLICT'
    }));
    expect(subject.plugin.config).toEqual(before);
    expect(subject.plugin.configRevision).toBe(7);
    expect(subject.api.setConfig).not.toHaveBeenCalled();
  });

  test('rolls persistence, services, config, and revision back when apply fails', () => {
    const subject = createPlugin({ revision: 2, streamMonsters: { freeEggCooldownSeconds: 100 } });
    const service = {
      value: 100,
      setConfig: jest.fn(function setConfig(config) {
        this.value = config.freeEggCooldownSeconds;
        if (this.value === 200) throw new Error('injected service failure');
      })
    };
    subject.plugin.streamMonstersFreeEggDrops = service;

    expect(() => subject.plugin.updateConfig(
      { streamMonsters: { freeEggCooldownSeconds: 200 } },
      { expectedRevision: 2 }
    )).toThrow('injected service failure');

    expect(subject.plugin.config.streamMonsters.freeEggCooldownSeconds).toBe(100);
    expect(subject.plugin.configRevision).toBe(2);
    expect(subject.persisted()).toEqual(expect.objectContaining({ revision: 2 }));
    expect(service.value).toBe(100);
    expect(subject.api.setConfig).toHaveBeenCalledTimes(2);
  });

  test('route returns typed 409 and emits only after a complete success', () => {
    const registered = [];
    const emit = jest.fn();
    const state = { revision: 3, streamMonsters: {} };
    const updateConfig = jest.fn((_updates, { expectedRevision }) => {
      if (expectedRevision !== 3) {
        const error = new Error('stale configuration revision');
        error.code = 'STREAM_MONSTERS_CONFIG_REVISION_CONFLICT';
        error.currentRevision = 3;
        throw error;
      }
      return { revision: 4, streamMonsters: { eggShelfVisibleCount: 3 } };
    });
    const routes = new StreamMonstersRoutes({
      api: {
        registerRoute: (method, routePath, handler) => registered.push({ method, routePath, handler }),
        emit,
        log: jest.fn()
      },
      pluginDir: __dirname,
      store: {},
      engine: {},
      configProvider: { getConfig: () => state, updateConfig }
    });
    routes.register();
    const handler = registered.find(entry => (
      entry.method === 'POST' && entry.routePath === '/api/streammonsters/config'
    )).handler;

    const stale = response();
    handler({
      ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {},
      body: { expectedRevision: 2, eggShelfVisibleCount: 3 }
    }, stale);
    expect(stale.statusCode).toBe(409);
    expect(stale.body).toEqual(expect.objectContaining({
      code: 'STREAM_MONSTERS_CONFIG_REVISION_CONFLICT',
      currentRevision: 3
    }));
    expect(emit).not.toHaveBeenCalled();

    const accepted = response();
    handler({
      ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, headers: {},
      body: { expectedRevision: 3, eggShelfVisibleCount: 3 }
    }, accepted);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.body).toEqual(expect.objectContaining({ revision: 4 }));
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
