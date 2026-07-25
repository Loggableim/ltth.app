const Database = require('better-sqlite3');
const StreamMonstersDatabase = require('../plugins/streamalchemy/backend/streammonsters/database');
const BattleService = require('../plugins/streamalchemy/backend/streammonsters/battle-service');
const { TEMPLATE_CATALOG } = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const { simulateSymmetricBalance } = require('../plugins/streamalchemy/backend/streammonsters/battle-balance-simulator');

describe('Stream Monsters cinematic battle balance simulator', () => {
  test('checks every furry template across the level, seed and allowed-skill matrix', () => {
    const store = new StreamMonstersDatabase(new Database(':memory:'));
    store.initialize();
    const battleService = new BattleService({ store });

    const report = simulateSymmetricBalance({
      battleService,
      templates: TEMPLATE_CATALOG,
      levels: [1, 5, 10, 15, 20],
      seedsPerTemplate: 80
    });

    expect(report.samples).toBe(24 * 5 * 80 * 3 * 2);
    expect(report.tacticalSamples).toBe(24 * 5 * 80);
    expect(report.entries).toHaveLength(24 * 5);
    expect(report.entries.every(entry => entry.deviation <= 0.05)).toBe(true);
    expect(report.entries.every(entry => entry.sequences.includes('A/A -> B/B -> C/C'))).toBe(true);
  });
});
