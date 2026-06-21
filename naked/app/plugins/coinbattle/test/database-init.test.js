const Database = require('better-sqlite3');
const CoinBattleDatabase = require('../backend/database');

describe('CoinBattleDatabase initialization', () => {
  let rawDb;
  let db;

  const logger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  };

  beforeEach(() => {
    rawDb = new Database(':memory:');
    db = new CoinBattleDatabase(rawDb, logger);
  });

  afterEach(() => {
    if (rawDb) {
      rawDb.close();
    }
    jest.clearAllMocks();
  });

  test('creates coinbattle_archived_matches table during initialization', () => {
    db.initializeTables();

    const archivedTable = rawDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'coinbattle_archived_matches'
    `).get();

    expect(archivedTable).toBeDefined();

    const archivedColumns = rawDb.prepare(`
      PRAGMA table_info(coinbattle_archived_matches)
    `).all();
    const columnNames = archivedColumns.map(column => column.name);
    expect(columnNames).toEqual(expect.arrayContaining([
      'match_id',
      'match_uuid',
      'end_time'
    ]));

    const archivedIndex = rawDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'idx_archived_matches_match_id'
    `).get();
    expect(archivedIndex).toBeDefined();
  });
});
