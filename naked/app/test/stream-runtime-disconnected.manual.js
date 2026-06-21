/**
 * Test suite for Stream Runtime Display Bug
 * Tests that stream runtime is correctly set to 0 when disconnected
 * even if streamStartTime is preserved for reconnection
 */

const assert = require('assert');

// Mock dependencies
class MockIO {
    constructor() {
        this.lastEmit = null;
    }
    emit(event, data) {
        this.lastEmit = { event, data };
    }
}

class MockDB {
    setSetting() {}
    getSetting() { return null; }
    getGift() { return null; }
    getGiftCatalog() { return []; }
    updateGiftCatalog() { return 0; }
    logEvent() {}
    saveStreamStats() {}
    loadStreamStats() { return null; }
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
console.log('🧪 Running Stream Runtime Disconnected Display Tests...\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'Stream Runtime Display When Disconnected',
        tests: [
            { 
                name: 'Stream duration should be 0 when disconnected even with streamStartTime set', 
                fn: () => {
                    const mockIO = new MockIO();
                    const connector = new TikTokConnector(mockIO, new MockDB(), new MockLogger());
                    
                    // Simulate a stream that was running (streamStartTime preserved for reconnection)
                    connector.streamStartTime = Date.now() - 3600000; // 1 hour ago
                    connector.isConnected = false; // Disconnected
                    
                    // Simulate some stats
                    connector.stats = {
                        viewers: 100,
                        likes: 500,
                        totalCoins: 1000,
                        followers: 50,
                        shares: 10,
                        gifts: 25
                    };
                    
                    // Broadcast stats
                    connector.broadcastStats();
                    
                    // Verify that streamDuration is 0 when disconnected
                    assert.ok(mockIO.lastEmit !== null, 'Stats should be emitted');
                    assert.strictEqual(mockIO.lastEmit.event, 'tiktok:stats', 'Event should be tiktok:stats');
                    assert.strictEqual(mockIO.lastEmit.data.streamDuration, 0, 'Stream duration should be 0 when disconnected');
                    
                    // Verify other stats are still broadcast correctly
                    assert.strictEqual(mockIO.lastEmit.data.viewers, 100, 'Viewers should be broadcast');
                    assert.strictEqual(mockIO.lastEmit.data.likes, 500, 'Likes should be broadcast');
                    assert.strictEqual(mockIO.lastEmit.data.totalCoins, 1000, 'Total coins should be broadcast');
                }
            },
            
            { 
                name: 'Stream duration should be calculated when connected with streamStartTime', 
                fn: () => {
                    const mockIO = new MockIO();
                    const connector = new TikTokConnector(mockIO, new MockDB(), new MockLogger());
                    
                    // Simulate a connected stream
                    const startTime = Date.now() - 3600000; // 1 hour ago
                    connector.streamStartTime = startTime;
                    connector.isConnected = true; // Connected
                    
                    // Broadcast stats
                    connector.broadcastStats();
                    
                    // Verify that streamDuration is calculated when connected
                    assert.ok(mockIO.lastEmit !== null, 'Stats should be emitted');
                    assert.strictEqual(mockIO.lastEmit.event, 'tiktok:stats', 'Event should be tiktok:stats');
                    
                    // Duration should be approximately 3600 seconds (1 hour)
                    const expectedDuration = Math.floor((Date.now() - startTime) / 1000);
                    assert.ok(
                        Math.abs(mockIO.lastEmit.data.streamDuration - expectedDuration) <= 1,
                        `Stream duration should be approximately ${expectedDuration} seconds, got ${mockIO.lastEmit.data.streamDuration}`
                    );
                    assert.ok(mockIO.lastEmit.data.streamDuration > 3590, 'Stream duration should be more than 3590 seconds');
                    assert.ok(mockIO.lastEmit.data.streamDuration < 3610, 'Stream duration should be less than 3610 seconds');
                }
            },
            
            { 
                name: 'Stream duration should be 0 when connected but no streamStartTime', 
                fn: () => {
                    const mockIO = new MockIO();
                    const connector = new TikTokConnector(mockIO, new MockDB(), new MockLogger());
                    
                    // Simulate connected but no stream start time yet
                    connector.streamStartTime = null;
                    connector.isConnected = true; // Connected
                    
                    // Broadcast stats
                    connector.broadcastStats();
                    
                    // Verify that streamDuration is 0 when no streamStartTime
                    assert.ok(mockIO.lastEmit !== null, 'Stats should be emitted');
                    assert.strictEqual(mockIO.lastEmit.event, 'tiktok:stats', 'Event should be tiktok:stats');
                    assert.strictEqual(mockIO.lastEmit.data.streamDuration, 0, 'Stream duration should be 0 when no streamStartTime');
                }
            },
            
            { 
                name: 'Stream duration should be 0 when disconnected with no streamStartTime', 
                fn: () => {
                    const mockIO = new MockIO();
                    const connector = new TikTokConnector(mockIO, new MockDB(), new MockLogger());
                    
                    // Simulate disconnected with no stream start time
                    connector.streamStartTime = null;
                    connector.isConnected = false; // Disconnected
                    
                    // Broadcast stats
                    connector.broadcastStats();
                    
                    // Verify that streamDuration is 0
                    assert.ok(mockIO.lastEmit !== null, 'Stats should be emitted');
                    assert.strictEqual(mockIO.lastEmit.event, 'tiktok:stats', 'Event should be tiktok:stats');
                    assert.strictEqual(mockIO.lastEmit.data.streamDuration, 0, 'Stream duration should be 0');
                }
            },
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
