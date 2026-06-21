/**
 * Test suite for XP rank display fix
 * 
 * Verifies that users at high levels (e.g., 300) receive the correct rank title
 * instead of defaulting to "Newcomer".
 * 
 * Bug: Users at level 300 were shown as "Newcomer" instead of "Mythic" (the highest available rank)
 * Fix: getLevelRewards() now returns the highest level reward <= user's level
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const ViewerXPDatabase = require('../plugins/viewer-leaderboard/backend/database');

describe('XP Rank Display Fix', () => {
  let db;
  let mockApi;
  let viewerXPDb;
  let dbPath;

  beforeEach(() => {
    // Create a temporary database for testing
    dbPath = path.join('/tmp', `test-xp-ranks-${Date.now()}.db`);
    db = new Database(dbPath);

    // Mock API object
    mockApi = {
      log: jest.fn(),
      getDatabase: jest.fn(() => ({
        db: db,
        streamerId: 'test-streamer'
      }))
    };

    // Create ViewerXPDatabase instance
    viewerXPDb = new ViewerXPDatabase(mockApi);
    viewerXPDb.initialize();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('getLevelRewards', () => {
    test('should return exact level reward when it exists', () => {
      const reward = viewerXPDb.getLevelRewards(25);
      expect(reward).toBeDefined();
      expect(reward.level).toBe(25);
      expect(reward.title).toBe('Legend');
    });

    test('should return highest level reward when exact level does not exist', () => {
      // User at level 26 should get level 25 reward (Legend)
      const reward = viewerXPDb.getLevelRewards(26);
      expect(reward).toBeDefined();
      expect(reward.level).toBe(25);
      expect(reward.title).toBe('Legend');
    });

    test('should return Legend for level 300 user', () => {
      // This is the actual bug: level 300 should get Legend (level 25), not Newcomer
      const reward = viewerXPDb.getLevelRewards(300);
      expect(reward).toBeDefined();
      expect(reward.title).not.toBe('Newcomer');
      expect(reward.title).toBe('Mythic'); // Highest defined rank at level 30
    });

    test('should return correct rewards for various high levels', () => {
      // Test multiple high levels
      const testCases = [
        { level: 31, expectedTitle: 'Mythic', expectedLevel: 30 },
        { level: 50, expectedTitle: 'Mythic', expectedLevel: 30 },
        { level: 100, expectedTitle: 'Mythic', expectedLevel: 30 },
        { level: 300, expectedTitle: 'Mythic', expectedLevel: 30 },
        { level: 1000, expectedTitle: 'Mythic', expectedLevel: 30 }
      ];

      for (const testCase of testCases) {
        const reward = viewerXPDb.getLevelRewards(testCase.level);
        expect(reward).toBeDefined();
        expect(reward.title).toBe(testCase.expectedTitle);
        expect(reward.level).toBe(testCase.expectedLevel);
      }
    });

    test('should return Newcomer for level 1', () => {
      const reward = viewerXPDb.getLevelRewards(1);
      expect(reward).toBeDefined();
      expect(reward.level).toBe(1);
      expect(reward.title).toBe('Newcomer');
    });

    test('should return correct intermediate rewards', () => {
      const testCases = [
        { level: 2, expectedTitle: 'Newcomer', expectedLevel: 1 },
        { level: 5, expectedTitle: 'Regular Viewer', expectedLevel: 5 },
        { level: 7, expectedTitle: 'Regular Viewer', expectedLevel: 5 },
        { level: 10, expectedTitle: 'Dedicated Fan', expectedLevel: 10 },
        { level: 14, expectedTitle: 'Dedicated Fan', expectedLevel: 10 },
        { level: 15, expectedTitle: 'Super Fan', expectedLevel: 15 },
        { level: 20, expectedTitle: 'Elite Supporter', expectedLevel: 20 },
        { level: 24, expectedTitle: 'Elite Supporter', expectedLevel: 20 },
        { level: 25, expectedTitle: 'Legend', expectedLevel: 25 },
        { level: 29, expectedTitle: 'Legend', expectedLevel: 25 },
        { level: 30, expectedTitle: 'Mythic', expectedLevel: 30 }
      ];

      for (const testCase of testCases) {
        const reward = viewerXPDb.getLevelRewards(testCase.level);
        expect(reward).toBeDefined();
        expect(reward.title).toBe(testCase.expectedTitle);
        expect(reward.level).toBe(testCase.expectedLevel);
      }
    });
  });

  describe('Level up with rank assignment', () => {
    test('should assign correct rank when leveling up to 300', () => {
      // Create a test viewer
      const username = 'testuser300';
      
      // Insert viewer at level 1
      db.prepare(`
        INSERT INTO viewer_profiles (username, xp, level, title)
        VALUES (?, ?, ?, ?)
      `).run(username, 0, 1, 'Newcomer');

      // Simulate leveling up to level 300
      const xpFor300 = viewerXPDb.getXPForLevel(300);
      db.prepare('UPDATE viewer_profiles SET xp = ?, level = ? WHERE username = ?')
        .run(xpFor300, 300, username);

      // Get level rewards and apply them
      const rewards = viewerXPDb.getLevelRewards(300);
      expect(rewards).toBeDefined();
      expect(rewards.title).toBe('Mythic');

      if (rewards.title) {
        db.prepare('UPDATE viewer_profiles SET title = ? WHERE username = ?')
          .run(rewards.title, username);
      }

      // Verify the viewer has the correct title
      const viewer = db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
      expect(viewer.title).toBe('Mythic');
      expect(viewer.title).not.toBe('Newcomer');
    });

    test('should maintain correct rank through level ups', () => {
      const username = 'testprogression';
      
      // Insert viewer at level 1
      db.prepare(`
        INSERT INTO viewer_profiles (username, xp, level, title)
        VALUES (?, ?, ?, ?)
      `).run(username, 0, 1, 'Newcomer');

      // Simulate progression through levels
      const levelTests = [
        { level: 3, expectedTitle: 'Newcomer' },
        { level: 6, expectedTitle: 'Regular Viewer' },
        { level: 12, expectedTitle: 'Dedicated Fan' },
        { level: 18, expectedTitle: 'Super Fan' },
        { level: 23, expectedTitle: 'Elite Supporter' },
        { level: 27, expectedTitle: 'Legend' },
        { level: 35, expectedTitle: 'Mythic' },
        { level: 100, expectedTitle: 'Mythic' },
        { level: 300, expectedTitle: 'Mythic' }
      ];

      for (const test of levelTests) {
        const xp = viewerXPDb.getXPForLevel(test.level);
        db.prepare('UPDATE viewer_profiles SET xp = ?, level = ? WHERE username = ?')
          .run(xp, test.level, username);

        const rewards = viewerXPDb.getLevelRewards(test.level);
        if (rewards && rewards.title) {
          db.prepare('UPDATE viewer_profiles SET title = ? WHERE username = ?')
            .run(rewards.title, username);
        }

        const viewer = db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
        expect(viewer.title).toBe(test.expectedTitle);
      }
    });
  });
});
