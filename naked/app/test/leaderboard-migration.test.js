/**
 * Test for leaderboard streamer_id column migration
 * 
 * Verifies that legacy databases without the streamer_id column
 * are properly migrated when the LeaderboardManager is initialized.
 */

const Database = require('better-sqlite3');
const LeaderboardManager = require('../modules/leaderboard');
const fs = require('fs');
const path = require('path');
const os = require('os');

describe('Leaderboard Migration: streamer_id column', () => {
  let tempDbPath;
  let db;
  let leaderboard;

  beforeEach(() => {
    // Create a temporary database file
    const tempDir = os.tmpdir();
    tempDbPath = path.join(tempDir, `test-leaderboard-${Date.now()}.db`);
  });

  afterEach(() => {
    // Clean up
    if (leaderboard && leaderboard.db) {
      try {
        leaderboard.db.close();
      } catch (e) {
        // Ignore
      }
    }
    if (db) {
      try {
        db.close();
      } catch (e) {
        // Ignore
      }
    }
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  test('should create new table with streamer_id column', () => {
    // Create a fresh database
    db = new Database(tempDbPath);
    
    // Initialize LeaderboardManager (should create table with streamer_id)
    leaderboard = new LeaderboardManager(db, null, 'test_streamer');

    // Verify the table has streamer_id column
    const tableInfo = db.prepare('PRAGMA table_info(leaderboard_stats)').all();
    const hasStreamerId = tableInfo.some(col => col.name === 'streamer_id');

    expect(hasStreamerId).toBe(true);
  });

  test('should migrate legacy table without streamer_id column (with data)', () => {
    // Create a legacy database with old schema (no streamer_id)
    db = new Database(tempDbPath);
    
    // Create old schema table (without streamer_id)
    db.prepare(`
      CREATE TABLE leaderboard_stats (
        username TEXT PRIMARY KEY,
        total_coins INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        gift_count INTEGER DEFAULT 0,
        follow_count INTEGER DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        session_coins INTEGER DEFAULT 0,
        session_messages INTEGER DEFAULT 0
      )
    `).run();

    // Insert some test data
    const now = Date.now();
    db.prepare(`
      INSERT INTO leaderboard_stats 
      (username, total_coins, message_count, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?)
    `).run('testuser1', 100, 50, now, now);

    db.prepare(`
      INSERT INTO leaderboard_stats 
      (username, total_coins, message_count, first_seen, last_seen)
      VALUES (?, ?, ?, ?, ?)
    `).run('testuser2', 200, 75, now, now);

    // Verify old schema doesn't have streamer_id
    let tableInfo = db.prepare('PRAGMA table_info(leaderboard_stats)').all();
    let hasStreamerId = tableInfo.some(col => col.name === 'streamer_id');
    expect(hasStreamerId).toBe(false);

    // Initialize LeaderboardManager (should trigger migration)
    leaderboard = new LeaderboardManager(db, null, 'test_streamer');

    // Verify new schema has streamer_id column
    tableInfo = db.prepare('PRAGMA table_info(leaderboard_stats)').all();
    hasStreamerId = tableInfo.some(col => col.name === 'streamer_id');
    expect(hasStreamerId).toBe(true);

    // Verify data was migrated correctly with default streamer_id
    const users = db.prepare('SELECT * FROM leaderboard_stats ORDER BY username').all();
    expect(users).toHaveLength(2);
    expect(users[0].username).toBe('testuser1');
    expect(users[0].streamer_id).toBe('default');
    expect(users[0].total_coins).toBe(100);
    expect(users[0].message_count).toBe(50);
    expect(users[1].username).toBe('testuser2');
    expect(users[1].streamer_id).toBe('default');
    expect(users[1].total_coins).toBe(200);
    expect(users[1].message_count).toBe(75);
  });

  test('should migrate legacy table without streamer_id column (empty table)', () => {
    // Create a legacy database with old schema (no streamer_id) but no data
    db = new Database(tempDbPath);
    
    // Create old schema table (without streamer_id)
    db.prepare(`
      CREATE TABLE leaderboard_stats (
        username TEXT PRIMARY KEY,
        total_coins INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        gift_count INTEGER DEFAULT 0,
        follow_count INTEGER DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        session_coins INTEGER DEFAULT 0,
        session_messages INTEGER DEFAULT 0
      )
    `).run();

    // Verify old schema doesn't have streamer_id
    let tableInfo = db.prepare('PRAGMA table_info(leaderboard_stats)').all();
    let hasStreamerId = tableInfo.some(col => col.name === 'streamer_id');
    expect(hasStreamerId).toBe(false);

    // Initialize LeaderboardManager (should trigger migration)
    leaderboard = new LeaderboardManager(db, null, 'test_streamer');

    // Verify new schema has streamer_id column
    tableInfo = db.prepare('PRAGMA table_info(leaderboard_stats)').all();
    hasStreamerId = tableInfo.some(col => col.name === 'streamer_id');
    expect(hasStreamerId).toBe(true);

    // Verify table is empty
    const count = db.prepare('SELECT COUNT(*) as count FROM leaderboard_stats').get().count;
    expect(count).toBe(0);
  });

  test('should handle already migrated database correctly', () => {
    // Create a database that already has the correct schema
    db = new Database(tempDbPath);
    
    // Initialize LeaderboardManager first time
    const leaderboard1 = new LeaderboardManager(db, null, 'test_streamer');

    // Add some data
    const now = Date.now();
    db.prepare(`
      INSERT INTO leaderboard_stats 
      (username, streamer_id, total_coins, message_count, first_seen, last_seen, session_coins, session_messages)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('testuser1', 'streamer1', 100, 50, now, now, 10, 5);

    // Initialize LeaderboardManager second time (should not cause issues)
    const leaderboard2 = new LeaderboardManager(db, null, 'test_streamer');

    // Verify data is still intact
    const users = db.prepare('SELECT * FROM leaderboard_stats').all();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('testuser1');
    expect(users[0].streamer_id).toBe('streamer1');
    expect(users[0].total_coins).toBe(100);

    // leaderboard1 and leaderboard2 share the same db connection
    // which gets cleaned up in afterEach
  });

  test('should work with updateStats after migration', () => {
    // Create a legacy database with old schema
    db = new Database(tempDbPath);
    
    db.prepare(`
      CREATE TABLE leaderboard_stats (
        username TEXT PRIMARY KEY,
        total_coins INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        like_count INTEGER DEFAULT 0,
        share_count INTEGER DEFAULT 0,
        gift_count INTEGER DEFAULT 0,
        follow_count INTEGER DEFAULT 0,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        session_coins INTEGER DEFAULT 0,
        session_messages INTEGER DEFAULT 0
      )
    `).run();

    // Initialize LeaderboardManager (triggers migration)
    leaderboard = new LeaderboardManager(db, null, 'test_streamer');

    // Test updateStats - this should work without errors
    expect(() => {
      leaderboard.updateStats('testuser1', 'chat', {});
    }).not.toThrow();

    expect(() => {
      leaderboard.updateStats('testuser2', 'gift', { coins: 100 });
    }).not.toThrow();

    // Verify the data was inserted correctly
    const users = db.prepare('SELECT * FROM leaderboard_stats ORDER BY username').all();
    expect(users).toHaveLength(2);
    expect(users[0].username).toBe('testuser1');
    expect(users[0].message_count).toBe(1);
    expect(users[1].username).toBe('testuser2');
    expect(users[1].total_coins).toBe(100);
  });

  test('should skip updateStats when username is missing or invalid', () => {
    db = new Database(tempDbPath);
    leaderboard = new LeaderboardManager(db, null, 'test_streamer');

    expect(() => {
      leaderboard.updateStats(undefined, 'like', { count: 5 });
      leaderboard.updateStats('', 'chat', {});
      leaderboard.updateStats('   ', 'gift', { coins: 10 });
      leaderboard.updateStats(null, 'follow');
    }).not.toThrow();

    const count = db.prepare('SELECT COUNT(*) as count FROM leaderboard_stats').get().count;
    expect(count).toBe(0);
  });
});
