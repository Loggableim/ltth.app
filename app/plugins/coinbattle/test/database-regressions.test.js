const BetterSqlite3 = require('better-sqlite3');
const CoinBattleDatabase = require('../backend/database');

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

describe('CoinBattleDatabase gift transactions', () => {
  let rawDb;
  let db;

  beforeEach(() => {
    rawDb = new BetterSqlite3(':memory:');
    db = new CoinBattleDatabase(rawDb, logger);
    db.initializeTables();
  });

  afterEach(() => {
    db.destroy();
    rawDb.close();
  });

  test('rolls back a gift event when its participant score cannot be updated', () => {
    const matchId = db.createMatch({ match_uuid: 'gift-transaction-match', mode: 'solo' });
    const player = db.getOrCreatePlayer({
      userId: 'valid-user',
      uniqueId: 'valid-user',
      nickname: 'Valid User',
      profilePictureUrl: null
    });

    expect(() => db.recordGiftEvent(
      matchId,
      player.id,
      'valid-user',
      { giftId: 1, giftName: 'Rose', coins: 10 },
      null,
      1,
      'event-transaction-1',
      'idempotency-transaction-1'
    )).toThrow();

    const eventCount = rawDb.prepare(
      'SELECT COUNT(*) AS count FROM coinbattle_gift_events WHERE event_id = ?'
    ).get('event-transaction-1').count;
    expect(eventCount).toBe(0);
  });

  test('returns lifetime leaderboard rows with deterministic ordering', () => {
    const first = db.getOrCreatePlayer({
      userId: 'first-user',
      uniqueId: 'first-user',
      nickname: 'First User',
      profilePictureUrl: null
    });
    const second = db.getOrCreatePlayer({
      userId: 'second-user',
      uniqueId: 'second-user',
      nickname: 'Second User',
      profilePictureUrl: null
    });

    db.updatePlayerLifetimeStats(first.id, 10, 1, false, false);
    db.updatePlayerLifetimeStats(second.id, 10, 1, false, false);

    expect(db.getLifetimeLeaderboard(10).map(player => player.user_id)).toEqual([
      'first-user',
      'second-user'
    ]);
  });
});
