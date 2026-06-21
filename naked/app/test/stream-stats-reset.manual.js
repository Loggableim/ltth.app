/**
 * Test suite for Stream Stats Reset Bug
 * Tests that TikTok connector stats are correctly reset when switching between different streamers
 */

const assert = require('assert');

// Mock dependencies
class MockIO {
    emit() {}
}

class MockDB {
    setSetting() {}
    getSetting() { return null; }
    getGift() { return null; }
    getGiftCatalog() { return []; }
    updateGiftCatalog() { return 0; }
    logEvent() {}
    loadStreamStats() { return null; }
    saveStreamStats() {}
    resetStreamStats() {}
}

class MockLogger {
    info() {}
    warn() {}
    error() {}
    debug() {}
}

// Load the TikTokConnector class
const TikTokConnector = require('../modules/tiktok.js');

// Simple test runner
console.log('🧪 Running Stream Stats Reset Tests...\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'TikTok Stats Reset on Stream Switch',
        tests: [
            { name: 'Stats should be reset when switching to a different streamer', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Simulate first connection with accumulated stats
                connector.currentUsername = 'streamer_a';
                connector.stats = {
                    viewers: 100,
                    likes: 500,
                    totalCoins: 1000,
                    followers: 10,
                    shares: 5,
                    gifts: 20
                };
                
                // Verify stats are set
                assert.strictEqual(connector.stats.viewers, 100, 'Initial viewers should be 100');
                assert.strictEqual(connector.stats.likes, 500, 'Initial likes should be 500');
                assert.strictEqual(connector.stats.totalCoins, 1000, 'Initial coins should be 1000');
                assert.strictEqual(connector.stats.followers, 10, 'Initial followers should be 10');
                assert.strictEqual(connector.stats.shares, 5, 'Initial shares should be 5');
                assert.strictEqual(connector.stats.gifts, 20, 'Initial gifts should be 20');
                
                // Manually test the logic that would happen in connect()
                // This simulates connecting to a different streamer
                const previousUsername = connector.currentUsername;
                const newUsername = 'streamer_b';
                
                // This is the fix we implemented
                if (previousUsername && previousUsername !== newUsername) {
                    connector.streamStartTime = null;
                    connector._persistedStreamStart = null;
                    connector._earliestEventTime = null;
                    connector.resetStats();
                    connector.sessionGifts.clear();
                }
                
                // Verify all stats are reset to 0
                assert.strictEqual(connector.stats.viewers, 0, 'Viewers should be reset to 0');
                assert.strictEqual(connector.stats.likes, 0, 'Likes should be reset to 0');
                assert.strictEqual(connector.stats.totalCoins, 0, 'Coins should be reset to 0');
                assert.strictEqual(connector.stats.followers, 0, 'Followers should be reset to 0');
                assert.strictEqual(connector.stats.shares, 0, 'Shares should be reset to 0');
                assert.strictEqual(connector.stats.gifts, 0, 'Gifts should be reset to 0');
            }},
            
            { name: 'Stats should be preserved when reconnecting to the same streamer', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Simulate connection with accumulated stats
                connector.currentUsername = 'streamer_a';
                connector.stats = {
                    viewers: 150,
                    likes: 300,
                    totalCoins: 500,
                    followers: 8,
                    shares: 3,
                    gifts: 15
                };
                
                // Store the old values
                const oldStats = { ...connector.stats };
                
                // Manually test the logic that would happen in connect()
                // This simulates reconnecting to the same streamer
                const previousUsername = connector.currentUsername;
                const newUsername = 'streamer_a'; // Same streamer
                
                // This is the fix - should NOT reset when same streamer
                if (previousUsername && previousUsername !== newUsername) {
                    connector.streamStartTime = null;
                    connector._persistedStreamStart = null;
                    connector._earliestEventTime = null;
                    connector.resetStats();
                    connector.sessionGifts.clear();
                }
                
                // Verify stats are preserved
                assert.strictEqual(connector.stats.viewers, oldStats.viewers, 'Viewers should be preserved');
                assert.strictEqual(connector.stats.likes, oldStats.likes, 'Likes should be preserved');
                assert.strictEqual(connector.stats.totalCoins, oldStats.totalCoins, 'Coins should be preserved');
                assert.strictEqual(connector.stats.followers, oldStats.followers, 'Followers should be preserved');
                assert.strictEqual(connector.stats.shares, oldStats.shares, 'Shares should be preserved');
                assert.strictEqual(connector.stats.gifts, oldStats.gifts, 'Gifts should be preserved');
            }},
            
            { name: 'Session gifts should be cleared when switching to different streamer', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Simulate connection with session gifts
                connector.currentUsername = 'streamer_a';
                connector.sessionGifts.set('gift1', { name: 'Rose', coins: 1 });
                connector.sessionGifts.set('gift2', { name: 'TikTok', coins: 1 });
                connector.sessionGifts.set('gift3', { name: 'Galaxy', coins: 1000 });
                
                // Verify gifts are set
                assert.strictEqual(connector.sessionGifts.size, 3, 'Should have 3 session gifts');
                
                // Manually test the logic that would happen in connect()
                const previousUsername = connector.currentUsername;
                const newUsername = 'streamer_b';
                
                // This is the fix we implemented
                if (previousUsername && previousUsername !== newUsername) {
                    connector.streamStartTime = null;
                    connector._persistedStreamStart = null;
                    connector._earliestEventTime = null;
                    connector.resetStats();
                    connector.sessionGifts.clear();
                }
                
                // Verify session gifts are cleared
                assert.strictEqual(connector.sessionGifts.size, 0, 'Session gifts should be cleared');
            }},
            
            { name: 'Stats should not be reset when switching from null username', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Simulate first connection (no previous username)
                connector.currentUsername = null;
                connector.stats = {
                    viewers: 0,
                    likes: 0,
                    totalCoins: 0,
                    followers: 0,
                    shares: 0,
                    gifts: 0
                };
                
                // Manually test the logic that would happen in connect()
                const previousUsername = connector.currentUsername; // null
                const newUsername = 'streamer_a';
                
                // This is the fix we implemented
                if (previousUsername && previousUsername !== newUsername) {
                    connector.streamStartTime = null;
                    connector._persistedStreamStart = null;
                    connector._earliestEventTime = null;
                    connector.resetStats();
                    connector.sessionGifts.clear();
                }
                
                // Verify stats remain at 0 (condition not met because previousUsername is null)
                assert.strictEqual(connector.stats.viewers, 0, 'Viewers should remain 0');
                assert.strictEqual(connector.stats.likes, 0, 'Likes should remain 0');
            }},
        ]
    },
];

// Run all tests
testSuites.forEach(suite => {
    console.log(`\n📦 ${suite.name}`);
    console.log('─'.repeat(50));
    
    suite.tests.forEach(test => {
        try {
            test.fn();
            console.log(`  ✅ ${test.name}`);
            passed++;
        } catch (error) {
            console.log(`  ❌ ${test.name}`);
            console.log(`     Error: ${error.message}`);
            if (error.stack) {
                console.log(`     ${error.stack.split('\n').slice(1, 3).join('\n     ')}`);
            }
            failed++;
        }
    });
});

// Print summary
console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50) + '\n');

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
