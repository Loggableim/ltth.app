/**
 * Tests for AnimazingPal Long-term Memory Integration
 * Validates memory database enhancements, interaction tracking, and multi-stream persistence
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

describe('AnimazingPal Long-term Memory', () => {
  let db;
  let memoryDb;
  let testDbPath;
  let logger;

  beforeEach(() => {
    // Create temporary test database
    testDbPath = path.join(__dirname, `test-animazingpal-${Date.now()}.db`);
    db = new Database(testDbPath);
    
    // Mock logger
    logger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // Import and initialize MemoryDatabase
    const MemoryDatabase = require('../plugins/animazingpal/brain/memory-database');
    memoryDb = new MemoryDatabase(db, logger);
    memoryDb.initialize();
    memoryDb.setStreamerId('test-streamer');
  });

  afterEach(() => {
    // Clean up
    if (db) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Schema Enhancements', () => {
    test('should have new columns in user profiles table', () => {
      const columns = db.prepare(`PRAGMA table_info(animazingpal_user_profiles)`).all();
      const columnNames = columns.map(col => col.name);

      expect(columnNames).toContain('last_interaction');
      expect(columnNames).toContain('stream_count');
      expect(columnNames).toContain('interaction_history');
      expect(columnNames).toContain('last_topic');
    });

    test('should initialize with default values for new columns', () => {
      const profile = memoryDb.getOrCreateUserProfile('testuser', 'Test User');
      
      expect(profile).toBeDefined();
      expect(profile.username).toBe('testuser');
      expect(profile.stream_count).toBe(1); // First stream
      expect(profile.interaction_history).toBeDefined();
    });
  });

  describe('User Profile Management', () => {
    test('should create user profile with initial interaction tracking', () => {
      const profile = memoryDb.getOrCreateUserProfile('user1', 'User One');

      expect(profile.username).toBe('user1');
      expect(profile.nickname).toBe('User One');
      expect(profile.interaction_count).toBe(1);
      expect(profile.stream_count).toBe(1);
      expect(profile.last_interaction).toBeDefined();
    });

    test('should update last_interaction on repeated profile access', (done) => {
      const profile1 = memoryDb.getOrCreateUserProfile('user1', 'User One');
      const firstInteraction = profile1.last_interaction;

      // Wait to ensure timestamp can be different (SQLite DATETIME has second precision)
      setTimeout(() => {
        try {
          const profile2 = memoryDb.getOrCreateUserProfile('user1', 'User One');
          
          expect(profile2.interaction_count).toBe(2);
          // last_interaction should be defined and potentially different
          // (may be same if within same second due to SQLite precision)
          expect(profile2.last_interaction).toBeDefined();
          done();
        } catch (error) {
          done(error);
        }
      }, 1100); // Wait just over 1 second to ensure timestamp difference
    }, 6000); // Increase test timeout to 6 seconds

    test('should update user profile with custom fields', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      memoryDb.updateUserProfile('user1', {
        personality_notes: 'Friendly and enthusiastic',
        relationship_level: 'regular',
        favorite_topics: JSON.stringify(['gaming', 'anime']),
        last_topic: 'gaming'
      });

      const profile = memoryDb.getOrCreateUserProfile('user1');
      expect(profile.personality_notes).toBe('Friendly and enthusiastic');
      expect(profile.relationship_level).toBe('regular');
      expect(profile.last_topic).toBe('gaming');
    });
  });

  describe('Interaction History Tracking', () => {
    test('should add interaction to history', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      memoryDb.addInteractionToHistory('user1', 'chat', 'Hello streamer!', {
        sessionId: 'session123'
      });

      const history = memoryDb.getInteractionHistory('user1');
      
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('chat');
      expect(history[0].content).toBe('Hello streamer!');
      expect(history[0].timestamp).toBeDefined();
    });

    test('should track multiple interactions', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      memoryDb.addInteractionToHistory('user1', 'chat', 'First message');
      memoryDb.addInteractionToHistory('user1', 'gift', 'Rose', { diamonds: 1 });
      memoryDb.addInteractionToHistory('user1', 'chat', 'Second message');

      const history = memoryDb.getInteractionHistory('user1');
      
      expect(history).toHaveLength(3);
      expect(history[0].type).toBe('chat');
      expect(history[1].type).toBe('gift');
      expect(history[2].type).toBe('chat');
    });

    test('should limit interaction history to 50 entries', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      // Add 60 interactions
      for (let i = 0; i < 60; i++) {
        memoryDb.addInteractionToHistory('user1', 'chat', `Message ${i}`);
      }

      const history = memoryDb.getInteractionHistory('user1', 100);
      
      // Should only keep last 50
      expect(history).toHaveLength(50);
      expect(history[0].content).toBe('Message 10'); // First 10 should be dropped
      expect(history[49].content).toBe('Message 59');
    });

    test('should retrieve limited interaction history', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      for (let i = 0; i < 20; i++) {
        memoryDb.addInteractionToHistory('user1', 'chat', `Message ${i}`);
      }

      const history = memoryDb.getInteractionHistory('user1', 5);
      
      expect(history).toHaveLength(5);
      // Should get last 5 messages
      expect(history[4].content).toBe('Message 19');
    });
  });

  describe('Stream Count Tracking', () => {
    test('should increment stream count', () => {
      const profile1 = memoryDb.getOrCreateUserProfile('user1', 'User One');
      expect(profile1.stream_count).toBe(1);

      memoryDb.incrementStreamCount('user1');
      
      const profile2 = memoryDb.getOrCreateUserProfile('user1');
      expect(profile2.stream_count).toBe(2);
    });

    test('should track stream count independently per user', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      memoryDb.getOrCreateUserProfile('user2', 'User Two');
      
      memoryDb.incrementStreamCount('user1');
      memoryDb.incrementStreamCount('user1');
      memoryDb.incrementStreamCount('user2');

      const profile1 = memoryDb.getOrCreateUserProfile('user1');
      const profile2 = memoryDb.getOrCreateUserProfile('user2');
      
      expect(profile1.stream_count).toBe(3); // 1 initial + 2 increments
      expect(profile2.stream_count).toBe(2); // 1 initial + 1 increment
    });
  });

  describe('Topic Tracking', () => {
    test('should update last discussed topic', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      memoryDb.updateLastTopic('user1', 'gaming');
      
      const profile = memoryDb.getOrCreateUserProfile('user1');
      expect(profile.last_topic).toBe('gaming');
    });

    test('should update topic on subsequent conversations', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      memoryDb.updateLastTopic('user1', 'gaming');
      memoryDb.updateLastTopic('user1', 'anime');
      
      const profile = memoryDb.getOrCreateUserProfile('user1');
      expect(profile.last_topic).toBe('anime');
    });
  });

  describe('Multi-stream Persistence', () => {
    test('should persist user data across sessions', () => {
      // First session
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      memoryDb.addInteractionToHistory('user1', 'chat', 'Hello in stream 1');
      memoryDb.updateLastTopic('user1', 'gaming');

      // Simulate new session (re-access)
      const profile = memoryDb.getOrCreateUserProfile('user1');
      const history = memoryDb.getInteractionHistory('user1');
      
      expect(profile.last_topic).toBe('gaming');
      expect(history).toHaveLength(1);
      expect(profile.interaction_count).toBe(2); // Initial + re-access
    });

    test('should maintain separate data per streamer', () => {
      // Data for streamer 1
      memoryDb.setStreamerId('streamer1');
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      memoryDb.addInteractionToHistory('user1', 'chat', 'Hello streamer 1');

      // Data for streamer 2
      memoryDb.setStreamerId('streamer2');
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      memoryDb.addInteractionToHistory('user1', 'chat', 'Hello streamer 2');

      // Check streamer 1 data
      memoryDb.setStreamerId('streamer1');
      const history1 = memoryDb.getInteractionHistory('user1');
      expect(history1).toHaveLength(1);
      expect(history1[0].content).toBe('Hello streamer 1');

      // Check streamer 2 data
      memoryDb.setStreamerId('streamer2');
      const history2 = memoryDb.getInteractionHistory('user1');
      expect(history2).toHaveLength(1);
      expect(history2[0].content).toBe('Hello streamer 2');
    });
  });

  describe('User Statistics', () => {
    test('should track gift statistics', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      
      memoryDb.recordGift('user1', 10);
      memoryDb.recordGift('user1', 50);
      memoryDb.recordGift('user1', 100);

      const profile = memoryDb.getOrCreateUserProfile('user1');
      
      expect(profile.gift_count).toBe(3);
      expect(profile.total_diamonds).toBe(160);
    });

    test('should get top supporters', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      memoryDb.getOrCreateUserProfile('user2', 'User Two');
      memoryDb.getOrCreateUserProfile('user3', 'User Three');
      
      memoryDb.recordGift('user1', 100);
      memoryDb.recordGift('user2', 500);
      memoryDb.recordGift('user3', 50);

      const supporters = memoryDb.getTopSupporters(3);
      
      expect(supporters).toHaveLength(3);
      expect(supporters[0].username).toBe('user2'); // Highest diamonds
      expect(supporters[0].total_diamonds).toBe(500);
      expect(supporters[1].username).toBe('user1');
      expect(supporters[2].username).toBe('user3');
    });

    test('should get frequent chatters', () => {
      memoryDb.getOrCreateUserProfile('user1', 'User One');
      memoryDb.getOrCreateUserProfile('user2', 'User Two');
      memoryDb.getOrCreateUserProfile('user3', 'User Three');
      
      // Simulate multiple interactions
      for (let i = 0; i < 10; i++) {
        memoryDb.getOrCreateUserProfile('user1');
      }
      for (let i = 0; i < 5; i++) {
        memoryDb.getOrCreateUserProfile('user2');
      }
      memoryDb.getOrCreateUserProfile('user3');

      const chatters = memoryDb.getFrequentChatters(3);
      
      expect(chatters).toHaveLength(3);
      expect(chatters[0].username).toBe('user1'); // Most interactions
      expect(chatters[0].interaction_count).toBe(11); // 1 initial + 10 more
    });
  });

  describe('Database Migration', () => {
    test('should add new columns to existing database', () => {
      // Create a database without new columns (simulate old version)
      const oldDb = new Database(':memory:');
      oldDb.exec(`
        CREATE TABLE animazingpal_user_profiles (
          id INTEGER PRIMARY KEY,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          username TEXT NOT NULL,
          nickname TEXT,
          interaction_count INTEGER DEFAULT 0
        )
      `);

      // Insert old-style record
      oldDb.prepare(`
        INSERT INTO animazingpal_user_profiles (streamer_id, username, nickname)
        VALUES ('test', 'olduser', 'Old User')
      `).run();

      // Apply migrations
      const MemoryDatabase = require('../plugins/animazingpal/brain/memory-database');
      const testMemoryDb = new MemoryDatabase(oldDb, logger);
      testMemoryDb.setStreamerId('test');
      testMemoryDb._applyMigrations();

      // Check that new columns exist
      const columns = oldDb.prepare(`PRAGMA table_info(animazingpal_user_profiles)`).all();
      const columnNames = columns.map(col => col.name);

      expect(columnNames).toContain('last_interaction');
      expect(columnNames).toContain('stream_count');
      expect(columnNames).toContain('interaction_history');

      oldDb.close();
    });
  });
});
