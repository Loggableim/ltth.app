const fs = require('fs');
const path = require('path');
const BetterSqlite3 = require('better-sqlite3');
const DatabaseManager = require('../modules/database');

describe('stream identity persistence', () => {
  const paths = [];

  afterEach(() => {
    for (const dbPath of paths.splice(0)) {
      for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
      }
    }
  });

  function tempPath(label) {
    const dbPath = path.join(__dirname, `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    paths.push(dbPath);
    return dbPath;
  }

  test('new profiles default startup auto-connect to false and persist stream metadata', () => {
    const db = new DatabaseManager(tempPath('new-stream-identity'));
    expect(db.getSetting('tiktok_auto_reconnect')).toBe('false');

    db.resetStreamStats({ username: 'Streamer', roomId: '12345', streamStartTime: 1700000000000 });
    db.saveStreamStats({
      viewers: 10,
      likes: 20,
      totalCoins: 30,
      followers: 4,
      shares: 5,
      gifts: 6
    });

    expect(db.loadStreamStats()).toEqual(expect.objectContaining({
      username: 'Streamer',
      roomId: '12345',
      streamStartTime: 1700000000000,
      likes: 20
    }));
    db.close();
  });

  test('legacy profiles without an explicit auto-connect setting remain unchanged', () => {
    const dbPath = tempPath('legacy-stream-identity');
    const raw = new BetterSqlite3(dbPath);
    raw.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE stream_stats (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        viewers INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        total_coins INTEGER DEFAULT 0,
        followers INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        gifts INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    raw.close();

    const db = new DatabaseManager(dbPath);
    expect(db.getSetting('tiktok_auto_reconnect')).toBeNull();
    const columns = db.db.prepare('PRAGMA table_info(stream_stats)').all().map(column => column.name);
    expect(columns).toEqual(expect.arrayContaining(['username', 'room_id', 'stream_start_time']));
    db.close();
  });
});
