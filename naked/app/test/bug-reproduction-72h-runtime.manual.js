/**
 * Test suite for Bug Reproduction: 72h Runtime Display When Disconnected
 * This test reproduces the exact scenario the user reported
 */

const assert = require('assert');

// Mock dependencies
class MockIO {
    constructor() {
        this.emittedStats = [];
    }
    emit(event, data) {
        if (event === 'tiktok:stats') {
            this.emittedStats.push(data);
        }
    }
    getLastStats() {
        return this.emittedStats[this.emittedStats.length - 1];
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
    constructor() {
        this.logs = [];
    }
    info(msg) { this.logs.push({ level: 'info', msg }); }
    warn(msg) { this.logs.push({ level: 'warn', msg }); }
    error(msg) { this.logs.push({ level: 'error', msg }); }
    debug(msg) { this.logs.push({ level: 'debug', msg }); }
}

// Load the TikTokConnector class
const TikTokConnector = require('../modules/tiktok.js');

console.log('🧪 Bug Reproduction Test: 72h Runtime Display When Disconnected\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'User Scenario: 72h Runtime When Disconnected',
        tests: [
            { 
                name: 'Should NOT show accumulated runtime (72h) when disconnected', 
                fn: () => {
                    const mockIO = new MockIO();
                    const mockLogger = new MockLogger();
                    const connector = new TikTokConnector(mockIO, new MockDB(), mockLogger);
                    
                    // ===== STEP 1: Simulate a stream that ran 3 days ago =====
                    // (This represents the user having connected to TikTok 72+ hours ago)
                    const threeDaysAgo = Date.now() - (72 * 3600 * 1000); // 72 hours ago
                    connector.streamStartTime = threeDaysAgo;
                    connector.isConnected = true;
                    connector.currentUsername = 'test_user';
                    
                    // Stats during the stream
                    connector.stats = {
                        viewers: 150,
                        likes: 5000,
                        totalCoins: 2000,
                        followers: 100,
                        shares: 50,
                        gifts: 75
                    };
                    
                    // Broadcast stats while connected - should show ~72h runtime
                    connector.broadcastStats();
                    let stats = mockIO.getLastStats();
                    
                    // Verify that runtime IS calculated when connected
                    assert.ok(stats.streamDuration > 0, 'Runtime should be > 0 when connected');
                    
                    // The duration should be approximately 72 hours (259200 seconds)
                    const expectedDuration = Math.floor((Date.now() - threeDaysAgo) / 1000);
                    assert.ok(
                        Math.abs(stats.streamDuration - expectedDuration) <= 2,
                        `Connected runtime should be approximately ${expectedDuration}s (72h), got ${stats.streamDuration}s`
                    );
                    
                    console.log(`    ⏱️  Connected runtime: ${formatDuration(stats.streamDuration)} (${stats.streamDuration}s)`);
                    
                    // ===== STEP 2: User disconnects =====
                    // Simulate what happens in disconnect() method
                    connector.isConnected = false; // Line 1500 in tiktok.js
                    connector.currentUsername = null; // Line 1503
                    
                    // Reset stats (line 1536-1543)
                    connector.stats = {
                        viewers: 0,
                        likes: 0,
                        totalCoins: 0,
                        followers: 0,
                        shares: 0,
                        gifts: 0
                    };
                    
                    // Note: streamStartTime is preserved for potential reconnection (line 1523-1527)
                    // This is intentional behavior, but should NOT affect the displayed runtime
                    assert.ok(connector.streamStartTime !== null, 'streamStartTime is preserved after disconnect');
                    
                    // Broadcast stats after disconnect (line 1544)
                    connector.broadcastStats();
                    stats = mockIO.getLastStats();
                    
                    // ===== STEP 3: Verify the bug is FIXED =====
                    // The bug was: runtime would still show ~72h because streamStartTime was preserved
                    // The fix: broadcastStats() now checks isConnected before calculating duration
                    
                    assert.strictEqual(
                        stats.streamDuration,
                        0,
                        `🐛 BUG REPRODUCTION: Runtime should be 0 when disconnected, but got ${stats.streamDuration}s (${formatDuration(stats.streamDuration)})`
                    );
                    
                    console.log(`    ✅ Disconnected runtime: ${formatDuration(stats.streamDuration)} (${stats.streamDuration}s)`);
                    console.log(`    ✅ Fix verified: Runtime is 0 even though streamStartTime is preserved`);
                    
                    // Verify stats are reset
                    assert.strictEqual(stats.viewers, 0, 'Viewers should be 0 when disconnected');
                    assert.strictEqual(stats.likes, 0, 'Likes should be 0 when disconnected');
                    assert.strictEqual(stats.totalCoins, 0, 'Coins should be 0 when disconnected');
                }
            },
        ]
    },
];

// Helper function to format duration as HH:MM:SS
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Run all tests
testSuites.forEach(suite => {
    console.log(`📦 ${suite.name}`);
    console.log('─'.repeat(70));
    
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
console.log('\n' + '='.repeat(70));
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
if (passed > 0 && failed === 0) {
    console.log('🎉 Bug fix verified! Runtime will no longer show accumulated time when disconnected.');
}
console.log('='.repeat(70) + '\n');

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
