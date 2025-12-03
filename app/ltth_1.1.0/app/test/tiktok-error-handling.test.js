/**
 * Test suite for TikTok Connection Error Handling
 * Tests the error detection and retry logic improvements
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
}

// Load the TikTokConnector class
const TikTokConnector = require('../modules/tiktok.js');

// Simple test runner
console.log('🧪 Running TikTok Error Handling Tests...\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'analyzeConnectionError',
        tests: [
            { name: 'SIGI_STATE errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('Failed to extract the SIGI_STATE HTML tag, you might be blocked by TikTok.');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'BLOCKED_BY_TIKTOK');
                assert.strictEqual(result.retryable, false);
                assert.ok(result.message.includes('blockiert'));
                assert.ok(result.suggestion.includes('NICHT SOFORT ERNEUT VERSUCHEN'));
            }},
            { name: 'Sign API 401 errors (invalid API key)', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('[Sign Error] Unexpected sign server status 401. Payload:\n{"code":401,"message":"The provided API Key is invalid."}');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'SIGN_API_INVALID_KEY');
                assert.strictEqual(result.retryable, false);
                assert.ok(result.message.includes('401'));
                assert.ok(result.suggestion.includes('eulerstream.com'));
            }},
            { name: 'Sign API 504 errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('[Sign Error] 504 error occurred');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'SIGN_API_GATEWAY_TIMEOUT');
                assert.strictEqual(result.retryable, true);
                assert.ok(result.message.includes('504 Gateway Timeout'));
                assert.ok(result.suggestion.includes('2-5 Minuten'));
            }},
            { name: 'Sign API 500 errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('[Sign Error] 500 Internal Server Error');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'SIGN_API_ERROR');
                assert.strictEqual(result.retryable, true);
                assert.ok(result.message.includes('500'));
                assert.ok(result.suggestion.includes('1-2 Minuten'));
            }},
            { name: 'Room ID errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('Failed to retrieve Room ID');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'ROOM_NOT_FOUND');
                assert.strictEqual(result.retryable, false);
            }},
            { name: 'Timeout errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('Verbindungs-Timeout nach 30 Sekunden');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'CONNECTION_TIMEOUT');
                assert.strictEqual(result.retryable, true);
            }},
            { name: 'Network errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('ECONNREFUSED');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'NETWORK_ERROR');
                assert.strictEqual(result.retryable, true);
            }},
            { name: 'Unknown errors', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const error = new Error('Some random error');
                const result = connector.analyzeConnectionError(error);
                assert.strictEqual(result.type, 'UNKNOWN_ERROR');
                assert.strictEqual(result.retryable, true);
            }},
        ]
    },
    {
        name: 'initialization',
        tests: [
            { name: 'Correct default values', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                // Auto-reconnect properties (managed by connector)
                assert.strictEqual(connector.autoReconnectCount, 0);
                assert.strictEqual(connector.maxAutoReconnects, 5);
                assert.strictEqual(connector.isConnected, false);
                assert.strictEqual(connector.currentUsername, null);
                // Connection attempt tracking
                assert.ok(Array.isArray(connector.connectionAttempts));
                assert.strictEqual(connector.connectionAttempts.length, 0);
            }},
        ]
    }
];

testSuites.forEach(suite => {
    console.log(`\n📋 ${suite.name}:`);
    suite.tests.forEach(test => {
        try {
            test.fn();
            console.log(`  ✅ ${test.name}`);
            passed++;
        } catch (err) {
            console.log(`  ❌ ${test.name}`);
            console.log(`     Error: ${err.message}`);
            failed++;
        }
    });
});

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);

