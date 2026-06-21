/**
 * Test suite for Stream Stats Connect Reset Fix
 * Tests that stats are correctly reset on connect and loaded from roomInfo
 * 
 * Related Issue: Stream start time and coins not correctly read on connect
 * - Stats from previous streams persist in database and are loaded on app start
 * - Stats should be reset on connect to avoid accumulation
 * - Stats should be properly extracted from roomInfo API response
 */

const assert = require('assert');

// Mock dependencies
class MockIO {
    emit() {}
}

class MockDB {
    constructor() {
        this.savedStats = null;
    }
    
    setSetting() {}
    getSetting() { return null; }
    getGift() { return null; }
    getGiftCatalog() { return []; }
    updateGiftCatalog() { return 0; }
    logEvent() {}
    
    // Return old stats to simulate database persistence
    loadStreamStats() { 
        return this.savedStats;
    }
    
    saveStreamStats(stats) {
        this.savedStats = stats;
    }
    
    resetStreamStats() {
        this.savedStats = null;
    }
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
console.log('🧪 Running Stream Stats Connect Reset Tests...\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'Stats Reset on Connect',
        tests: [
            { name: 'Constructor should load old stats from database', fn: () => {
                const mockDb = new MockDB();
                // Simulate old stats in database from previous stream
                mockDb.savedStats = {
                    viewers: 100,
                    likes: 500,
                    totalCoins: 1000,
                    followers: 10,
                    shares: 5,
                    gifts: 20
                };
                
                const connector = new TikTokConnector(new MockIO(), mockDb, new MockLogger());
                
                // Stats should be loaded from database in constructor
                assert.strictEqual(connector.stats.viewers, 100, 'Constructor should load viewers from DB');
                assert.strictEqual(connector.stats.likes, 500, 'Constructor should load likes from DB');
                assert.strictEqual(connector.stats.totalCoins, 1000, 'Constructor should load coins from DB');
            }},
            
            { name: 'Stats extraction from roomInfo should overwrite old values', fn: () => {
                const mockDb = new MockDB();
                // Old stats from previous stream
                mockDb.savedStats = {
                    viewers: 100,
                    likes: 500,
                    totalCoins: 1000,
                    followers: 10,
                    shares: 5,
                    gifts: 20
                };
                
                const connector = new TikTokConnector(new MockIO(), mockDb, new MockLogger());
                
                // Verify old stats loaded
                assert.strictEqual(connector.stats.totalCoins, 1000, 'Old coins should be loaded');
                
                // Simulate roomInfo with new stream data
                const roomInfo = {
                    viewer_count: 50,
                    like_count: 200,
                    total_coins: 300,  // Different from old value
                    follower_count: 15
                };
                
                // Call the extraction method directly
                connector._extractStatsFromRoomInfo(roomInfo);
                
                // Stats should now reflect the actual current stream values
                assert.strictEqual(connector.stats.viewers, 50, 'Viewers should be updated from roomInfo');
                assert.strictEqual(connector.stats.likes, 200, 'Likes should be updated from roomInfo');
                assert.strictEqual(connector.stats.totalCoins, 300, 'Coins should be updated from roomInfo (NOT accumulated)');
                assert.strictEqual(connector.stats.followers, 15, 'Followers should be updated from roomInfo');
            }},
            
            { name: 'Empty roomInfo should not cause errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Set some initial stats
                connector.stats.totalCoins = 100;
                
                // Call with empty roomInfo
                connector._extractStatsFromRoomInfo({});
                
                // Stats should remain unchanged (no crash)
                assert.strictEqual(connector.stats.totalCoins, 100, 'Stats should remain unchanged with empty roomInfo');
            }},
            
            { name: 'roomInfo with nested room object should work', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Simulate roomInfo with nested structure
                const roomInfo = {
                    room: {
                        viewer_count: 75,
                        total_coins: 500
                    }
                };
                
                connector._extractStatsFromRoomInfo(roomInfo);
                
                assert.strictEqual(connector.stats.viewers, 75, 'Should extract from nested room object');
                assert.strictEqual(connector.stats.totalCoins, 500, 'Should extract coins from nested room object');
            }},
            
            { name: 'roomInfo with stats object should work', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Simulate roomInfo with stats object
                const roomInfo = {
                    stats: {
                        viewer_count: 90,
                        total_coins: 700
                    }
                };
                
                connector._extractStatsFromRoomInfo(roomInfo);
                
                assert.strictEqual(connector.stats.viewers, 90, 'Should extract from stats object');
                assert.strictEqual(connector.stats.totalCoins, 700, 'Should extract coins from stats object');
            }},
            
            { name: 'Multiple field name formats should be tried', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB(), new MockLogger());
                
                // Test different field name formats
                const testCases = [
                    { roomInfo: { viewerCount: 10 }, expected: 10 },
                    { roomInfo: { viewer_count: 20 }, expected: 20 },
                    { roomInfo: { userCount: 30 }, expected: 30 },
                    { roomInfo: { user_count: 40 }, expected: 40 }
                ];
                
                for (const testCase of testCases) {
                    connector.stats.viewers = 0;
                    connector._extractStatsFromRoomInfo(testCase.roomInfo);
                    assert.strictEqual(connector.stats.viewers, testCase.expected, 
                        `Should extract viewers from ${Object.keys(testCase.roomInfo)[0]}`);
                }
            }}
        ]
    }
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
            console.log(`     ${error.message}`);
            if (error.stack) {
                console.log(`     ${error.stack.split('\n').slice(1, 3).join('\n     ')}`);
            }
            failed++;
        }
    });
});

console.log('\n' + '='.repeat(50));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
