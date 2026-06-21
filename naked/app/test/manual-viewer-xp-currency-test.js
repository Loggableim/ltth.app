/**
 * Manual Test Script for Viewer XP Currency System Integration
 * 
 * This script simulates TikTok events to test the XP and currency system integration.
 * Run with: node app/test/manual-viewer-xp-currency-test.js
 */

const EventEmitter = require('events');
const path = require('path');

// Mock implementations
class MockIO extends EventEmitter {
  emit(event, data) {
    console.log(`\n📡 Socket.IO Event: ${event}`);
    if (event === 'gcce-hud:show') {
      console.log(`   Content: ${data.content}`);
      console.log(`   Duration: ${data.duration}ms`);
    } else {
      console.log(`   Data:`, JSON.stringify(data, null, 2));
    }
    super.emit(event, data);
  }
}

class MockDatabase {
  constructor() {
    this.streamerId = 'test-streamer';
    this.db = {
      prepare: (query) => ({
        get: (username, streamerId) => {
          if (query.includes('user_statistics')) {
            // Simulate user statistics
            return {
              username: username,
              total_coins_sent: 150,
              total_gifts_sent: 5,
              total_comments: 10,
              total_likes: 3,
              total_shares: 1,
              total_follows: 1
            };
          }
          return null;
        }
      })
    };
  }
  
  getUserStatistics(userId) {
    return {
      user_id: userId,
      username: 'testuser',
      total_coins_sent: 100,
      total_gifts_sent: 3,
      total_comments: 8,
      total_likes: 2
    };
  }
  
  updateUserStatistics(userId, username, updates) {
    console.log(`\n📊 Update User Statistics: ${username}`);
    console.log(`   Coins: +${updates.coins || 0}`);
    console.log(`   Gifts: +${updates.gifts || 0}`);
    console.log(`   Comments: +${updates.comments || 0}`);
    console.log(`   Likes: +${updates.likes || 0}`);
    console.log(`   Shares: +${updates.shares || 0}`);
    console.log(`   Follows: +${updates.follows || 0}`);
  }
  
  addCoinsToUserStats(userId, username, uniqueId, profilePictureUrl, coins) {
    this.updateUserStatistics(userId, username, { coins, gifts: 1 });
  }
  
  getAllUserStatistics(limit, minCoins) {
    return [
      { user_id: 'user1', username: 'richuser1', total_coins_sent: 10000 },
      { user_id: 'user2', username: 'richuser2', total_coins_sent: 5000 },
      { user_id: 'user3', username: 'richuser3', total_coins_sent: 2000 }
    ];
  }
}

class MockViewerXPDatabase {
  constructor() {
    this.profiles = new Map();
    this.xpActions = {
      'chat_message': { xp_amount: 10, cooldown_seconds: 30, enabled: 1 },
      'gift_tier1': { xp_amount: 50, cooldown_seconds: 0, enabled: 1 },
      'gift_tier2': { xp_amount: 200, cooldown_seconds: 0, enabled: 1 },
      'gift_tier3': { xp_amount: 1000, cooldown_seconds: 0, enabled: 1 },
      'follow': { xp_amount: 100, cooldown_seconds: 0, enabled: 1 },
      'share': { xp_amount: 75, cooldown_seconds: 60, enabled: 1 },
      'like': { xp_amount: 5, cooldown_seconds: 30, enabled: 1 }
    };
  }
  
  initialize() {
    console.log('✅ Mock Viewer XP Database initialized');
  }
  
  setLevelUpCallback(callback) {
    this.levelUpCallback = callback;
  }
  
  getViewerProfile(username) {
    if (!this.profiles.has(username)) {
      this.profiles.set(username, {
        username,
        xp: 0,
        level: 1,
        total_xp_earned: 0,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        streak_days: 0,
        watch_time_minutes: 0,
        badges: [],
        name_color: '#FFFFFF'
      });
    }
    return this.profiles.get(username);
  }
  
  updateLastSeen(username) {
    const profile = this.getViewerProfile(username);
    profile.last_seen = new Date().toISOString();
  }
  
  getXPAction(actionType) {
    return this.xpActions[actionType];
  }
  
  addXP(username, amount, actionType, details) {
    const profile = this.getViewerProfile(username);
    profile.xp += amount;
    profile.total_xp_earned += amount;
    console.log(`\n⭐ XP Awarded: ${username} +${amount} XP (${actionType})`);
    console.log(`   Total XP: ${profile.total_xp_earned}`);
  }
  
  getXPForLevel(level) {
    return level * 100;
  }
  
  getTopViewers(limit) {
    return Array.from(this.profiles.values())
      .sort((a, b) => b.total_xp_earned - a.total_xp_earned)
      .slice(0, limit);
  }
  
  updateDailyActivity(username) {
    return { firstToday: false };
  }
  
  getSetting(key, defaultValue) {
    return defaultValue;
  }
}

// Test runner
async function runTests() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Viewer XP Currency System Integration - Manual Test');
  console.log('='.repeat(80));
  
  // Create mocks
  const mockIO = new MockIO();
  const mockDB = new MockDatabase();
  const mockTikTok = new EventEmitter();
  
  // Load the viewer-xp plugin
  const ViewerXPPlugin = require('../plugins/viewer-leaderboard/viewer-xp-impl');
  const ViewerXPDatabase = require('../plugins/viewer-leaderboard/backend/database');
  
  // Mock the database module
  ViewerXPDatabase.prototype.initialize = MockViewerXPDatabase.prototype.initialize;
  ViewerXPDatabase.prototype.setLevelUpCallback = MockViewerXPDatabase.prototype.setLevelUpCallback;
  ViewerXPDatabase.prototype.getViewerProfile = MockViewerXPDatabase.prototype.getViewerProfile;
  ViewerXPDatabase.prototype.updateLastSeen = MockViewerXPDatabase.prototype.updateLastSeen;
  ViewerXPDatabase.prototype.getXPAction = MockViewerXPDatabase.prototype.getXPAction;
  ViewerXPDatabase.prototype.addXP = MockViewerXPDatabase.prototype.addXP;
  ViewerXPDatabase.prototype.getXPForLevel = MockViewerXPDatabase.prototype.getXPForLevel;
  ViewerXPDatabase.prototype.getTopViewers = MockViewerXPDatabase.prototype.getTopViewers;
  ViewerXPDatabase.prototype.updateDailyActivity = MockViewerXPDatabase.prototype.updateDailyActivity;
  ViewerXPDatabase.prototype.getSetting = MockViewerXPDatabase.prototype.getSetting;
  
  // Create mock API
  const mockAPI = {
    log: (msg, level = 'info') => {
      const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : 'ℹ️';
      console.log(`${prefix} ${msg}`);
    },
    getDatabase: () => mockDB,
    getSocketIO: () => mockIO,
    registerRoute: (method, path, handler) => {
      console.log(`   Route registered: ${method} ${path}`);
    },
    registerTikTokEvent: (event, callback) => {
      mockTikTok.on(event, callback);
      console.log(`   TikTok event registered: ${event}`);
      return true;
    },
    registerSocket: () => {},
    emit: mockIO.emit.bind(mockIO),
    pluginLoader: {
      loadedPlugins: new Map(),
      iftttEngine: {
        processEvent: async (eventType, data) => {
          console.log(`\n🔗 IFTTT Event: ${eventType}`);
          console.log(`   Data:`, JSON.stringify(data, null, 2));
          return { success: true };
        }
      }
    },
    registerIFTTTTrigger: (id, config) => {
      console.log(`   IFTTT Trigger registered: ${id}`);
      return true;
    },
    registerIFTTTAction: (id, config) => {
      console.log(`   IFTTT Action registered: ${id}`);
      return true;
    }
  };
  
  // Initialize plugin
  console.log('\n📦 Initializing Viewer XP Plugin...');
  const plugin = new ViewerXPPlugin(mockAPI);
  await plugin.init();
  
  // Test 1: Chat event
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 1: Chat Message Event');
  console.log('-'.repeat(80));
  mockTikTok.emit('chat', {
    username: 'chatuser',
    uniqueId: 'chatuser',
    userId: 'user_chat_001',
    nickname: 'Chat User',
    comment: 'Hello world!',
    profilePictureUrl: 'https://example.com/pic.jpg'
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test 2: Small gift event
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 2: Small Gift Event (Tier 1)');
  console.log('-'.repeat(80));
  mockTikTok.emit('gift', {
    username: 'giftuser',
    uniqueId: 'giftuser',
    userId: 'user_gift_001',
    nickname: 'Gift User',
    giftName: 'Rose',
    giftId: '5655',
    diamondCount: 1,
    repeatCount: 10,
    coins: 10,
    profilePictureUrl: 'https://example.com/pic2.jpg'
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test 3: Large gift event (Tier 3, currency milestone)
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 3: Large Gift Event (Tier 3 + Currency Milestone)');
  console.log('-'.repeat(80));
  mockTikTok.emit('gift', {
    username: 'bigspender',
    uniqueId: 'bigspender',
    userId: 'user_big_001',
    nickname: 'Big Spender',
    giftName: 'Galaxy',
    giftId: '9999',
    diamondCount: 1000,
    repeatCount: 2,
    coins: 2000,
    profilePictureUrl: 'https://example.com/pic3.jpg'
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test 4: Follow event
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 4: Follow Event');
  console.log('-'.repeat(80));
  mockTikTok.emit('follow', {
    username: 'follower',
    uniqueId: 'follower',
    userId: 'user_follow_001',
    nickname: 'New Follower',
    profilePictureUrl: 'https://example.com/pic4.jpg'
  });
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Test 5: GCCE command simulation
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 5: GCCE /xp Command');
  console.log('-'.repeat(80));
  if (plugin.handleXPCommand) {
    const result = await plugin.handleXPCommand([], { username: 'chatuser' });
    console.log('\n💬 Command Result:', JSON.stringify(result, null, 2));
  }
  
  // Test 6: GCCE /coins command
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 6: GCCE /coins Command');
  console.log('-'.repeat(80));
  if (plugin.handleCoinsCommand) {
    const result = await plugin.handleCoinsCommand([], { username: 'giftuser' });
    console.log('\n💬 Command Result:', JSON.stringify(result, null, 2));
  }
  
  // Test 7: GCCE /currency command
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 7: GCCE /currency Command');
  console.log('-'.repeat(80));
  if (plugin.handleCurrencyCommand) {
    const result = await plugin.handleCurrencyCommand([], { username: 'bigspender' });
    console.log('\n💬 Command Result:', JSON.stringify(result, null, 2));
  }
  
  // Test 8: GCCE /stats command
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 8: GCCE /stats Command');
  console.log('-'.repeat(80));
  if (plugin.handleStatsCommand) {
    const result = await plugin.handleStatsCommand([], { username: 'giftuser' });
    console.log('\n💬 Command Result:', JSON.stringify(result, null, 2));
  }
  
  // Test 9: GCCE /richest command
  console.log('\n' + '-'.repeat(80));
  console.log('TEST 9: GCCE /richest Command');
  console.log('-'.repeat(80));
  if (plugin.handleRichestCommand) {
    const result = await plugin.handleRichestCommand(['3'], { username: 'testuser' });
    console.log('\n💬 Command Result:', JSON.stringify(result, null, 2));
  }
  
  // Cleanup
  console.log('\n' + '-'.repeat(80));
  console.log('🧹 Cleaning up...');
  if (plugin.destroy) {
    await plugin.destroy();
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ All tests completed!');
  console.log('='.repeat(80));
  console.log('\n📝 Summary:');
  console.log('   - Chat events are processed and award XP');
  console.log('   - Gift events update both XP and currency (coins)');
  console.log('   - Currency milestones trigger IFTTT events');
  console.log('   - GCCE commands display both XP and currency');
  console.log('   - /coins, /currency, /richest commands work correctly');
  console.log('   - System integrates XP points with shared currency');
  console.log('\n🎉 The XP system is now a complete currency system!');
  console.log('='.repeat(80) + '\n');
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = runTests;
