/**
 * Viewer Profiles Plugin - Test Suite
 * 
 * Tests all major functionality including:
 * - Plugin initialization
 * - Data collection from TikTok events
 * - VIP system (manual and automatic)
 * - Session tracking
 * - Birthday system
 * - Export functionality
 */

const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');
const os = require('os');

// Create temporary database for testing
const testDbPath = path.join(os.tmpdir(), `test-viewer-profiles-${Date.now()}.db`);

class MockAPI {
  constructor() {
    this.db = new Database(testDbPath);
    this.logs = [];
    this.config = {};
    this.routes = [];
    this.socketEvents = [];
    this.tiktokEvents = [];
    this.emittedEvents = [];
  }

  log(message, level = 'info') {
    if (level === 'error') {
      console.error(`[${level.toUpperCase()}] ${message}`);
    }
    this.logs.push({ message, level });
  }

  getDatabase() { return this.db; }
  getSocketIO() { return { on: () => {}, emit: (event, data) => this.emittedEvents.push({ event, data }) }; }
  registerRoute(method, path, handler) { this.routes.push({ method, path, handler }); }
  registerSocket(event, callback) { this.socketEvents.push({ event, callback }); }
  registerTikTokEvent(event, callback) { this.tiktokEvents.push({ event, callback }); }
  getConfig(key) { return this.config[key]; }
  setConfig(key, value) { this.config[key] = value; }
  emit(event, data) { this.emittedEvents.push({ event, data }); }

  cleanup() {
    this.db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

async function runTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  Viewer Profiles Plugin - Test Suite  ║');
  console.log('╚════════════════════════════════════════╝\n');

  const mockAPI = new MockAPI();
  let plugin = null;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // Test 1: Plugin Initialization
    console.log('🧪 Test 1: Plugin Initialization');
    const ViewerProfilesPlugin = require('./main.js');
    plugin = new ViewerProfilesPlugin(mockAPI);
    await plugin.init();
    console.log('   ✅ Plugin initialized successfully');
    console.log(`   📊 ${mockAPI.routes.length} routes registered`);
    console.log(`   📊 ${mockAPI.tiktokEvents.length} TikTok events registered\n`);
    testsPassed++;

    // Test 2: Chat Event Processing
    console.log('🧪 Test 2: Chat Event Processing');
    const chatHandler = mockAPI.tiktokEvents.find(e => e.event === 'chat');
    await chatHandler.callback({
      uniqueId: 'testuser1',
      nickname: 'Test User 1',
      userId: '12345',
      profilePictureUrl: 'https://example.com/avatar.jpg',
      comment: 'Hello!'
    });
    const viewer1 = plugin.db.getViewerByUsername('testuser1');
    if (viewer1 && viewer1.total_comments === 1) {
      console.log('   ✅ Chat event processed, viewer created');
      console.log(`   📊 Viewer: ${viewer1.display_name} (@${viewer1.tiktok_username})`);
      testsPassed++;
    } else {
      throw new Error('Chat event processing failed');
    }
    console.log('');

    // Test 3: Gift Event Processing
    console.log('🧪 Test 3: Gift Event Processing');
    const giftHandler = mockAPI.tiktokEvents.find(e => e.event === 'gift');
    await giftHandler.callback({
      uniqueId: 'testuser1',
      nickname: 'Test User 1',
      userId: '12345',
      giftId: 'rose',
      giftName: 'Rose',
      diamondCount: 1,
      repeatCount: 5
    });
    const viewer1Updated = plugin.db.getViewerByUsername('testuser1');
    if (viewer1Updated.total_coins_spent === 10 && viewer1Updated.total_gifts_sent === 1) {
      console.log('   ✅ Gift event processed');
      console.log(`   📊 Coins spent: ${viewer1Updated.total_coins_spent}`);
      console.log(`   📊 Gifts sent: ${viewer1Updated.total_gifts_sent}`);
      testsPassed++;
    } else {
      throw new Error('Gift event processing failed');
    }
    console.log('');

    // Test 4: Manual VIP Assignment
    console.log('🧪 Test 4: Manual VIP Assignment');
    plugin.vipManager.setVIP('testuser1', 'Gold');
    const vipViewer = plugin.db.getViewerByUsername('testuser1');
    if (vipViewer.is_vip === 1 && vipViewer.vip_tier === 'Gold') {
      console.log('   ✅ Manual VIP assignment successful');
      console.log(`   📊 VIP Tier: ${vipViewer.vip_tier}`);
      testsPassed++;
    } else {
      throw new Error('VIP assignment failed');
    }
    console.log('');

    // Test 5: Session Tracking
    console.log('🧪 Test 5: Session Tracking');
    const hasSession = plugin.sessionManager.hasActiveSession('testuser1');
    const activeSessions = plugin.sessionManager.getActiveSessions();
    if (hasSession && activeSessions.length === 1) {
      console.log('   ✅ Session tracking working');
      console.log(`   📊 Active sessions: ${activeSessions.length}`);
      testsPassed++;
    } else {
      throw new Error('Session tracking failed');
    }
    console.log('');

    // Test 6: Birthday System
    console.log('🧪 Test 6: Birthday System');
    const today = new Date();
    const birthday = `${today.getFullYear() - 25}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    plugin.birthdayManager.setBirthday('testuser1', birthday);
    const birthdayViewer = plugin.db.getViewerByUsername('testuser1');
    if (birthdayViewer.birthday === birthday) {
      console.log('   ✅ Birthday set successfully');
      console.log(`   📊 Birthday: ${birthdayViewer.birthday}`);
      const age = plugin.birthdayManager.calculateAge(birthday);
      console.log(`   📊 Calculated age: ${age}`);
      testsPassed++;
    } else {
      throw new Error('Birthday system failed');
    }
    console.log('');

    // Test 7: Statistics
    console.log('🧪 Test 7: Statistics Summary');
    const stats = plugin.db.getStatsSummary();
    if (stats.totalViewers === 1 && stats.vipCount === 1) {
      console.log('   ✅ Statistics calculated correctly');
      console.log(`   📊 Total viewers: ${stats.totalViewers}`);
      console.log(`   📊 Total revenue: ${stats.totalRevenue}`);
      console.log(`   📊 VIP count: ${stats.vipCount}`);
      testsPassed++;
    } else {
      throw new Error('Statistics calculation failed');
    }
    console.log('');

    // Test 8: Leaderboard
    console.log('🧪 Test 8: Leaderboard');
    const leaderboard = plugin.db.getLeaderboard('coins', 10);
    if (leaderboard.length === 1 && leaderboard[0].tiktok_username === 'testuser1') {
      console.log('   ✅ Leaderboard generated');
      console.log(`   📊 Top spender: ${leaderboard[0].tiktok_username} (${leaderboard[0].total_coins_spent} coins)`);
      testsPassed++;
    } else {
      throw new Error('Leaderboard generation failed');
    }
    console.log('');

    // Test 9: Export Functionality
    console.log('🧪 Test 9: Export Functionality');
    const exportData = plugin.db.exportViewers('all');
    if (exportData.length === 1) {
      console.log('   ✅ Export successful');
      console.log(`   📊 Exported ${exportData.length} viewer(s)`);
      testsPassed++;
    } else {
      throw new Error('Export failed');
    }
    console.log('');

    // Test 10: Heatmap Generation
    console.log('🧪 Test 10: Heatmap Generation');
    const heatmap = plugin.db.getViewerHeatmap(viewer1.id);
    if (heatmap.length === 7 && heatmap[0].length === 24) {
      console.log('   ✅ Heatmap generated');
      console.log(`   📊 Heatmap size: ${heatmap.length}x${heatmap[0].length}`);
      testsPassed++;
    } else {
      throw new Error('Heatmap generation failed');
    }
    console.log('');

    // Cleanup
    await plugin.destroy();
    mockAPI.cleanup();

    // Summary
    console.log('╔════════════════════════════════════════╗');
    console.log('║          Test Results Summary          ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}`);
    console.log('\n🎉 All tests passed successfully!\n');

    return true;

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    testsFailed++;
    
    if (plugin) await plugin.destroy();
    mockAPI.cleanup();
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║          Test Results Summary          ║');
    console.log('╚════════════════════════════════════════╝');
    console.log(`✅ Tests Passed: ${testsPassed}`);
    console.log(`❌ Tests Failed: ${testsFailed}\n`);
    
    return false;
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = runTests;
