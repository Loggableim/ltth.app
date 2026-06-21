const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const ViewerXPDatabase = require('../plugins/viewer-leaderboard/backend/database');

describe('Viewer XP detail log retention', () => {
  let tmpDir;
  let sqlite;
  let viewerDb;

  function makeApi(db) {
    return {
      getDatabase: () => ({ db }),
      log: jest.fn()
    };
  }

  function count(table) {
    return sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-viewer-xp-retention-'));
    sqlite = new Database(path.join(tmpDir, 'test.db'));
    viewerDb = new ViewerXPDatabase(makeApi(sqlite));
    viewerDb.initialize();
  });

  afterEach(() => {
    if (viewerDb) {
      viewerDb.destroy();
    }
    if (sqlite && sqlite.open) {
      sqlite.close();
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('keeps aggregate viewer profile values while pruning expired detail logs', () => {
    const now = Date.UTC(2026, 3, 28, 12, 0, 0);
    const oldMs = now - 120 * 24 * 60 * 60 * 1000;
    const recentMs = now - 10 * 24 * 60 * 60 * 1000;
    const oldSqlTime = new Date(oldMs).toISOString().slice(0, 19).replace('T', ' ');
    const recentSqlTime = new Date(recentMs).toISOString().slice(0, 19).replace('T', ' ');

    sqlite.prepare(`
      INSERT INTO viewer_profiles (username, xp, level, total_xp_earned, coins, total_coins_earned)
      VALUES ('viewer1', 12345, 12, 20000, 777, 1000)
    `).run();

    sqlite.prepare(`
      INSERT INTO xp_transactions (username, amount, action_type, timestamp)
      VALUES
        ('viewer1', 2, 'watch_time_minute', ?),
        ('viewer1', 5, 'chat_message', ?)
    `).run(oldSqlTime, recentSqlTime);

    sqlite.prepare(`
      INSERT INTO viewer_xp_events (user_id, username, event_type, amount, xp_awarded, created_at)
      VALUES
        ('u1', 'viewer1', 'watch_time_minute', 2, 2, ?),
        ('u1', 'viewer1', 'chat_message', 5, 5, ?)
    `).run(oldMs, recentMs);

    sqlite.prepare(`
      INSERT INTO coin_transactions (username, amount, balance_after, source, created_at)
      VALUES
        ('viewer1', 2, 779, 'xp_gain', ?),
        ('viewer1', 5, 784, 'xp_gain', ?)
    `).run(oldMs, recentMs);

    const result = viewerDb.cleanupDetailLogs({ now, retentionDays: 90, batchSize: 100 });

    expect(result.deleted).toEqual({
      xp_transactions: 1,
      viewer_xp_events: 1,
      coin_transactions: 1
    });
    expect(count('xp_transactions')).toBe(1);
    expect(count('viewer_xp_events')).toBe(1);
    expect(count('coin_transactions')).toBe(1);

    const profile = sqlite.prepare('SELECT xp, level, total_xp_earned, coins, total_coins_earned FROM viewer_profiles WHERE username = ?').get('viewer1');
    expect(profile).toEqual({
      xp: 12345,
      level: 12,
      total_xp_earned: 20000,
      coins: 777,
      total_coins_earned: 1000
    });
  });

  test('does not prune detail logs when retention is disabled in config', () => {
    const now = Date.UTC(2026, 3, 28, 12, 0, 0);
    const oldMs = now - 120 * 24 * 60 * 60 * 1000;
    const oldSqlTime = new Date(oldMs).toISOString().slice(0, 19).replace('T', ' ');

    viewerDb.setExtendedConfig('detail_log_retention', {
      enabled: false,
      detail_log_days: 90,
      cleanup_interval_hours: 24,
      cleanup_batch_size: 10000,
      cleanup_max_duration_ms: 5000,
      vacuum_after_cleanup: false
    });

    sqlite.prepare(`
      INSERT INTO viewer_profiles (username, xp, level, total_xp_earned, coins, total_coins_earned)
      VALUES ('viewer1', 100, 2, 100, 10, 10)
    `).run();
    sqlite.prepare(`
      INSERT INTO xp_transactions (username, amount, action_type, timestamp)
      VALUES ('viewer1', 2, 'watch_time_minute', ?)
    `).run(oldSqlTime);
    sqlite.prepare(`
      INSERT INTO viewer_xp_events (user_id, username, event_type, amount, xp_awarded, created_at)
      VALUES ('u1', 'viewer1', 'watch_time_minute', 2, 2, ?)
    `).run(oldMs);
    sqlite.prepare(`
      INSERT INTO coin_transactions (username, amount, balance_after, source, created_at)
      VALUES ('viewer1', 2, 12, 'xp_gain', ?)
    `).run(oldMs);

    const result = viewerDb.cleanupDetailLogs({ now });

    expect(result.skipped).toBe(true);
    expect(count('xp_transactions')).toBe(1);
    expect(count('viewer_xp_events')).toBe(1);
    expect(count('coin_transactions')).toBe(1);
  });

  test('initializes retention defaults for detail logs', () => {
    expect(viewerDb.getExtendedConfig('detail_log_retention')).toEqual({
      enabled: true,
      detail_log_days: 90,
      cleanup_interval_hours: 24,
      cleanup_batch_size: 10000,
      cleanup_max_duration_ms: 5000,
      vacuum_after_cleanup: false
    });
  });
});
