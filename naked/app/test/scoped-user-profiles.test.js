/**
 * Tests for Scoped User Profiles
 * Verifies that viewer data is properly isolated per streamer
 */

const Database = require('../modules/database');
const Leaderboard = require('../modules/leaderboard');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = '/tmp/test_scoped_profiles.db';

describe('Scoped User Profiles', () => {
  let db;

  beforeEach(() => {
    // Clean up test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    const walPath = `${TEST_DB_PATH}-wal`;
    const shmPath = `${TEST_DB_PATH}-shm`;
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

    // Create fresh database for each test
    db = new Database(TEST_DB_PATH, 'streamer1');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('Database - User Statistics Scoping', () => {
    test('should isolate user stats by streamer_id', () => {
      // Add stats for user with streamer1
      db.setStreamerId('streamer1');
      db.updateUserStatistics('user123', 'TestUser', { coins: 100, gifts: 1 });
      
      // Add stats for same user with streamer2
      db.setStreamerId('streamer2');
      db.updateUserStatistics('user123', 'TestUser', { coins: 200, gifts: 2 });
      
      // Verify data is separate
      db.setStreamerId('streamer1');
      const stats1 = db.getUserStatistics('user123');
      expect(stats1.total_coins_sent).toBe(100);
      expect(stats1.total_gifts_sent).toBe(1);
      
      db.setStreamerId('streamer2');
      const stats2 = db.getUserStatistics('user123');
      expect(stats2.total_coins_sent).toBe(200);
      expect(stats2.total_gifts_sent).toBe(2);
    });

    test('should list only users for current streamer', () => {
      // Add users for streamer1
      db.setStreamerId('streamer1');
      db.updateUserStatistics('user1', 'User1', { coins: 100 });
      db.updateUserStatistics('user2', 'User2', { coins: 200 });
      
      // Add users for streamer2
      db.setStreamerId('streamer2');
      db.updateUserStatistics('user3', 'User3', { coins: 300 });
      
      // Verify streamer1 sees only their users
      db.setStreamerId('streamer1');
      const users1 = db.getAllUserStatistics();
      expect(users1.length).toBe(2);
      expect(users1.map(u => u.user_id).sort()).toEqual(['user1', 'user2']);
      
      // Verify streamer2 sees only their users
      db.setStreamerId('streamer2');
      const users2 = db.getAllUserStatistics();
      expect(users2.length).toBe(1);
      expect(users2[0].user_id).toBe('user3');
    });

    test('should reset only current streamer stats', () => {
      // Add stats for both streamers
      db.setStreamerId('streamer1');
      db.updateUserStatistics('user1', 'User1', { coins: 100 });
      
      db.setStreamerId('streamer2');
      db.updateUserStatistics('user1', 'User1', { coins: 200 });
      
      // Reset streamer1 stats
      db.setStreamerId('streamer1');
      db.resetAllUserStatistics();
      
      // Verify streamer1 stats are gone
      const stats1 = db.getAllUserStatistics();
      expect(stats1.length).toBe(0);
      
      // Verify streamer2 stats remain
      db.setStreamerId('streamer2');
      const stats2 = db.getAllUserStatistics();
      expect(stats2.length).toBe(1);
      expect(stats2[0].total_coins_sent).toBe(200);
    });
  });

  describe('Database - Milestone User Stats Scoping', () => {
    test('should isolate milestone progress by streamer', () => {
      // User achieves milestone with streamer1
      db.setStreamerId('streamer1');
      let result = db.addCoinsToUserMilestone('user123', 'TestUser', 500);
      expect(result.coins).toBe(500);
      
      // Same user with streamer2 starts from 0
      db.setStreamerId('streamer2');
      result = db.addCoinsToUserMilestone('user123', 'TestUser', 300);
      expect(result.coins).toBe(300);
      
      // Verify separate progress
      db.setStreamerId('streamer1');
      const stats1 = db.getUserMilestoneStats('user123');
      expect(stats1.cumulative_coins).toBe(500);
      
      db.setStreamerId('streamer2');
      const stats2 = db.getUserMilestoneStats('user123');
      expect(stats2.cumulative_coins).toBe(300);
    });
  });

  describe('Leaderboard Manager Scoping', () => {
    test('should maintain separate leaderboards per streamer', () => {
      // Create leaderboard for streamer1
      const lb1 = new Leaderboard(db, null, 'streamer1');
      lb1.updateStats('user1', 'gift', { coins: 100 });
      lb1.updateStats('user2', 'gift', { coins: 200 });
      
      // Create leaderboard for streamer2
      const lb2 = new Leaderboard(db, null, 'streamer2');
      lb2.updateStats('user3', 'gift', { coins: 300 });
      
      // Verify streamer1 leaderboard
      const top1 = lb1.getTopGifters(10);
      expect(top1.length).toBe(2);
      expect(top1[0].username).toBe('user2');
      expect(top1[0].coins).toBe(200);
      
      // Verify streamer2 leaderboard
      const top2 = lb2.getTopGifters(10);
      expect(top2.length).toBe(1);
      expect(top2[0].username).toBe('user3');
      expect(top2[0].coins).toBe(300);
    });

    test('should calculate ranks within streamer scope', () => {
      const lb = new Leaderboard(db, null, 'streamer1');
      lb.updateStats('user1', 'gift', { coins: 100 });
      lb.updateStats('user2', 'gift', { coins: 200 });
      lb.updateStats('user3', 'gift', { coins: 150 });
      
      expect(lb.getUserRank('user2')).toBe(1);
      expect(lb.getUserRank('user3')).toBe(2);
      expect(lb.getUserRank('user1')).toBe(3);
    });

    test('should reset only current streamer leaderboard', () => {
      // Add data for both streamers
      const lb1 = new Leaderboard(db, null, 'streamer1');
      lb1.updateStats('user1', 'gift', { coins: 100 });
      
      const lb2 = new Leaderboard(db, null, 'streamer2');
      lb2.updateStats('user2', 'gift', { coins: 200 });
      
      // Reset streamer1
      lb1.resetAllStats();
      
      // Verify streamer1 is empty
      expect(lb1.getTopGifters(10).length).toBe(0);
      
      // Verify streamer2 is intact
      expect(lb2.getTopGifters(10).length).toBe(1);
    });
  });

  describe('Data Migration', () => {
    test('should migrate existing data to default streamer', () => {
      // This test simulates upgrading from old schema to new schema
      // Close the database first
      db.close();
      
      // Remove test database
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      
      // Create old schema database (without streamer_id)
      const oldDb = new (require('better-sqlite3'))(TEST_DB_PATH);
      
      // Create old user_statistics table
      oldDb.exec(`
        CREATE TABLE user_statistics (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          unique_id TEXT,
          profile_picture_url TEXT,
          total_coins_sent INTEGER DEFAULT 0,
          total_gifts_sent INTEGER DEFAULT 0,
          total_comments INTEGER DEFAULT 0,
          total_likes INTEGER DEFAULT 0,
          total_shares INTEGER DEFAULT 0,
          total_follows INTEGER DEFAULT 0,
          first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_gift_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Insert old data
      oldDb.prepare(`
        INSERT INTO user_statistics (user_id, username, total_coins_sent, total_gifts_sent)
        VALUES (?, ?, ?, ?)
      `).run('user123', 'OldUser', 500, 5);
      
      oldDb.close();
      
      // Now open with new Database class (should trigger migration)
      db = new Database(TEST_DB_PATH, 'default');
      
      // Verify data was migrated
      const stats = db.getUserStatistics('user123', 'default');
      expect(stats).toBeDefined();
      expect(stats.username).toBe('OldUser');
      expect(stats.total_coins_sent).toBe(500);
      expect(stats.total_gifts_sent).toBe(5);
      expect(stats.streamer_id).toBe('default');
    });

    test('should migrate minimal legacy user and milestone schemas', () => {
      db.close();
      
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      
      const oldDb = new (require('better-sqlite3'))(TEST_DB_PATH);
      oldDb.exec(`
        CREATE TABLE user_statistics (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          total_coins_sent INTEGER DEFAULT 0
        );

        CREATE TABLE milestone_user_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          cumulative_coins INTEGER DEFAULT 0
        );

        INSERT INTO user_statistics (user_id, username, total_coins_sent)
        VALUES ('user123', 'LegacyUser', 750);

        INSERT INTO milestone_user_stats (user_id, username, cumulative_coins)
        VALUES ('user123', 'LegacyUser', 300);
      `);
      oldDb.close();
      
      db = new Database(TEST_DB_PATH, 'legacy_streamer');
      
      const stats = db.getUserStatistics('user123', 'legacy_streamer');
      expect(stats).toBeDefined();
      expect(stats.username).toBe('LegacyUser');
      expect(stats.total_coins_sent).toBe(750);
      expect(stats.total_gifts_sent).toBe(0);
      expect(stats.streamer_id).toBe('legacy_streamer');

      const milestoneStats = db.getUserMilestoneStats('user123', 'legacy_streamer');
      expect(milestoneStats).toBeDefined();
      expect(milestoneStats.cumulative_coins).toBe(300);
      expect(milestoneStats.streamer_id).toBe('legacy_streamer');
      expect(milestoneStats.last_tier_reached).toBe(0);
    });

    test('should add missing startup columns for legacy event and HUD tables', () => {
      db.close();
      
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      
      const oldDb = new (require('better-sqlite3'))(TEST_DB_PATH);
      oldDb.exec(`
        CREATE TABLE event_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          event_type TEXT NOT NULL
        );

        CREATE TABLE hud_elements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          element_id TEXT UNIQUE NOT NULL
        );
      `);
      oldDb.close();
      
      db = new Database(TEST_DB_PATH, 'legacy_streamer');
      
      const eventColumns = db.db.prepare('PRAGMA table_info(event_logs)').all().map(col => col.name);
      expect(eventColumns).toEqual(expect.arrayContaining(['event_type', 'username', 'data', 'timestamp']));

      const hudColumns = db.db.prepare('PRAGMA table_info(hud_elements)').all().map(col => col.name);
      expect(hudColumns).toEqual(expect.arrayContaining([
        'element_id',
        'enabled',
        'position_x',
        'position_y',
        'position_unit',
        'width',
        'height',
        'anchor'
      ]));

      const alertElement = db.db.prepare('SELECT * FROM hud_elements WHERE element_id = ?').get('alert');
      expect(alertElement).toBeDefined();
      expect(alertElement.width).toBe(400);
    });
  });
});

// Run tests if executed directly
if (require.main === module) {
  const { run } = require('jest');
  run(['--testPathPattern=scoped-user-profiles']);
}

module.exports = {};
