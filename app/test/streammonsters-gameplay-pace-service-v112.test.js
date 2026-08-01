'use strict';

const Database = require('better-sqlite3');
const StreamMonstersDatabase = require(
  '../plugins/streamalchemy/backend/streammonsters/database'
);
const BattleMatchService = require(
  '../plugins/streamalchemy/backend/streammonsters/battle-match-service'
);
const StreamAlchemyPlugin = require('../plugins/streamalchemy');
const StreamMonstersRoutes = require(
  '../plugins/streamalchemy/backend/streammonsters/routes'
);
const {
  GAMEPLAY_PACES,
  buildConfigPayload
} = require('../plugins/streamalchemy/streammonsters-creator-runtime');

function createService(options = {}) {
  const sqlite = new Database(':memory:');
  const store = new StreamMonstersDatabase(sqlite);
  store.initialize();
  const service = new BattleMatchService({
    store,
    rulesVersion: 8,
    autoStart: false,
    ...options
  });
  return { sqlite, store, service };
}

describe('Stream Monsters 1.12 pace integration', () => {
  test('uses the configured pace for live roster, skill, and stat deadlines', () => {
    const { sqlite, service } = createService({
      gameplayPace: 'arcade',
      localeCount: 1
    });
    const match = { rulesVersion: 8 };

    expect(service.rosterWindowMs(match)).toBe(6_000);
    expect(service.actionWindowMs(match)).toBe(6_000);
    expect(service.statWindowMs(match)).toBe(10_000);

    service.setLanguageTiming({ localeCount: 2, secondsPerLocale: 6 });
    expect(service.rosterWindowMs(match)).toBe(8_000);
    expect(service.actionWindowMs(match)).toBe(8_000);
    expect(service.statWindowMs(match)).toBe(12_000);

    service.setPresentationConfig({ gameplayPace: 'standard' });
    expect(service.actionWindowMs(match)).toBe(10_000);
    expect(service.statWindowMs(match)).toBe(15_000);

    service.setLanguageTiming({ localeCount: 1, secondsPerLocale: 6 });
    service.setPresentationConfig({ gameplayPace: 'accessible' });
    expect(service.actionWindowMs(match)).toBe(10_000);
    expect(service.statWindowMs(match)).toBe(15_000);

    service.destroy();
    sqlite.close();
  });

  test('normalizes legacy configuration at plugin, route, and creator boundaries', () => {
    const plugin = new StreamAlchemyPlugin({});
    expect(plugin.normalizeGameplayPace('arcade-rally')).toBe('arcade');
    expect(plugin.normalizeGameplayPace('bad')).toBe('arcade');

    const routes = new StreamMonstersRoutes({
      api: {},
      pluginDir: __dirname,
      store: {},
      engine: {},
      configProvider: {}
    });
    expect(routes.normalizeGameplayPace('arcade-rally')).toBe('arcade');
    expect(routes.sanitizeConfigUpdate({ gameplayPace: 'standard' }))
      .toEqual({ gameplayPace: 'standard' });

    expect(GAMEPLAY_PACES).toEqual(['arcade', 'standard', 'accessible']);
    expect(buildConfigPayload({
      values: { gameplayPace: 'arcade-rally' }
    }).gameplayPace).toBe('arcade');
  });
});
