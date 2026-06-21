/**
 * Test suite for Euler API Key Diagnostics
 * Tests the diagnostics endpoint returns proper data structure
 */

const assert = require('assert');

// Mock dependencies
class MockIO {
    emit() {}
}

class MockDB {
    constructor() {
        this.settings = {};
    }
    
    setSetting(key, value) {
        this.settings[key] = value;
    }
    
    getSetting(key) {
        return this.settings[key] || null;
    }
    
    getGift() { return null; }
    getGiftCatalog() { return []; }
    updateGiftCatalog() { return 0; }
    logEvent() {}
}

// Load the TikTokConnector class
const TikTokConnector = require('../modules/tiktok.js');

// Simple test runner
console.log('🧪 Running Euler API Key Diagnostics Tests...\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'getEulerApiKeyInfo',
        tests: [
            { name: 'Uses fallback key when no key is configured', fn: () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const keyInfo = connector.getEulerApiKeyInfo();
                
                assert.ok(keyInfo !== undefined, 'keyInfo should not be undefined');
                assert.ok('activeKey' in keyInfo, 'keyInfo should have activeKey property');
                assert.ok('activeSource' in keyInfo, 'keyInfo should have activeSource property');
                assert.ok('configured' in keyInfo, 'keyInfo should have configured property');
                assert.strictEqual(keyInfo.configured, true, 'configured should be true when fallback key is used');
                assert.strictEqual(keyInfo.activeSource, 'Fallback Key', 'activeSource should be Fallback Key');
                assert.ok(typeof keyInfo.activeKey === 'string' && keyInfo.activeKey.includes('...'), 'activeKey should be masked string');
                assert.ok(keyInfo.activeKey.length >= 12, 'activeKey should show masked sections of the fallback key');
            }},
            
            { name: 'Detects database setting key', fn: () => {
                const db = new MockDB();
                db.setSetting('tiktok_euler_api_key', 'test_key_from_database_1234567890abcdef');
                const connector = new TikTokConnector(new MockIO(), db);
                const keyInfo = connector.getEulerApiKeyInfo();
                
                assert.strictEqual(keyInfo.configured, true, 'configured should be true');
                assert.strictEqual(keyInfo.activeSource, 'Database Setting', 'activeSource should be Database Setting');
                assert.ok(keyInfo.activeKey.includes('test_key'), 'activeKey should contain masked key');
                assert.ok(keyInfo.activeKey.includes('...'), 'activeKey should be masked');
            }},
            
            { name: 'Masks API key properly', fn: () => {
                const db = new MockDB();
                db.setSetting('tiktok_euler_api_key', '12345678901234567890abcdefghijklmnop');
                const connector = new TikTokConnector(new MockIO(), db);
                const keyInfo = connector.getEulerApiKeyInfo();
                
                assert.ok(keyInfo.activeKey.startsWith('12345678'), 'Should show first 8 chars');
                assert.ok(keyInfo.activeKey.includes('...'), 'Should contain ...');
                assert.ok(keyInfo.activeKey.endsWith('mnop'), 'Should show last 4 chars');
                assert.strictEqual(keyInfo.activeKey, '12345678...mnop', 'Should mask middle of key');
            }},
        ]
    },
    {
        name: 'runDiagnostics',
        tests: [
            { name: 'Returns all required properties', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const diagnostics = await connector.runDiagnostics('testuser');
                
                assert.ok(diagnostics !== undefined, 'diagnostics should not be undefined');
                assert.ok('timestamp' in diagnostics, 'should have timestamp');
                assert.ok('eulerApiKey' in diagnostics, 'should have eulerApiKey');
                assert.ok('tiktokApi' in diagnostics, 'should have tiktokApi');
                assert.ok('eulerWebSocket' in diagnostics, 'should have eulerWebSocket');
                assert.ok('connectionConfig' in diagnostics, 'should have connectionConfig');
                assert.ok('connection' in diagnostics, 'should have connection');
                assert.ok('configuration' in diagnostics, 'should have configuration');
                assert.ok('recentAttempts' in diagnostics, 'should have recentAttempts');
                assert.ok('stats' in diagnostics, 'should have stats');
            }},
            
            { name: 'eulerApiKey has proper structure', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const diagnostics = await connector.runDiagnostics('testuser');
                
                assert.ok(diagnostics.eulerApiKey !== undefined, 'eulerApiKey should not be undefined');
                assert.ok('activeKey' in diagnostics.eulerApiKey, 'eulerApiKey should have activeKey');
                assert.ok('activeSource' in diagnostics.eulerApiKey, 'eulerApiKey should have activeSource');
                assert.ok('configured' in diagnostics.eulerApiKey, 'eulerApiKey should have configured');
            }},
            
            { name: 'tiktokApi has proper structure', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const diagnostics = await connector.runDiagnostics('testuser');
                
                assert.ok(diagnostics.tiktokApi !== undefined, 'tiktokApi should not be undefined');
                assert.ok('success' in diagnostics.tiktokApi, 'tiktokApi should have success');
                assert.ok('error' in diagnostics.tiktokApi, 'tiktokApi should have error');
                assert.ok('responseTime' in diagnostics.tiktokApi, 'tiktokApi should have responseTime');
            }},
            
            { name: 'eulerWebSocket has proper structure', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const diagnostics = await connector.runDiagnostics('testuser');
                
                assert.ok(diagnostics.eulerWebSocket !== undefined, 'eulerWebSocket should not be undefined');
                assert.ok('success' in diagnostics.eulerWebSocket, 'eulerWebSocket should have success');
                assert.ok('error' in diagnostics.eulerWebSocket, 'eulerWebSocket should have error');
                assert.ok('responseTime' in diagnostics.eulerWebSocket, 'eulerWebSocket should have responseTime');
            }},
            
            { name: 'connectionConfig has proper structure', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const diagnostics = await connector.runDiagnostics('testuser');
                
                assert.ok(diagnostics.connectionConfig !== undefined, 'connectionConfig should not be undefined');
                assert.ok('enableEulerFallbacks' in diagnostics.connectionConfig, 'connectionConfig should have enableEulerFallbacks');
                assert.ok('connectWithUniqueId' in diagnostics.connectionConfig, 'connectionConfig should have connectWithUniqueId');
                assert.ok('connectionTimeout' in diagnostics.connectionConfig, 'connectionConfig should have connectionTimeout');
            }},
        ]
    },
    {
        name: 'getConnectionHealth',
        tests: [
            { name: 'Returns eulerKeyConfigured and eulerKeySource', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const health = await connector.getConnectionHealth();
                
                assert.ok(health !== undefined, 'health should not be undefined');
                assert.ok('eulerKeyConfigured' in health, 'should have eulerKeyConfigured');
                assert.ok('eulerKeySource' in health, 'should have eulerKeySource');
                assert.strictEqual(typeof health.eulerKeyConfigured, 'boolean', 'eulerKeyConfigured should be boolean');
                assert.strictEqual(typeof health.eulerKeySource, 'string', 'eulerKeySource should be string');
            }},
            
            { name: 'Shows configured when key is set', fn: async () => {
                const db = new MockDB();
                db.setSetting('tiktok_euler_api_key', 'test_key_1234567890abcdef');
                const connector = new TikTokConnector(new MockIO(), db);
                const health = await connector.getConnectionHealth();
                
                assert.strictEqual(health.eulerKeyConfigured, true, 'eulerKeyConfigured should be true');
                assert.strictEqual(health.eulerKeySource, 'Database Setting', 'eulerKeySource should be Database Setting');
            }},
            
            { name: 'Shows fallback source when no key is set', fn: async () => {
                const connector = new TikTokConnector(new MockIO(), new MockDB());
                const health = await connector.getConnectionHealth();
                
                assert.strictEqual(health.eulerKeyConfigured, true, 'eulerKeyConfigured should be true due to fallback');
                assert.strictEqual(health.eulerKeySource, 'Fallback Key', 'eulerKeySource should indicate fallback');
            }},
        ]
    }
];

async function runTests() {
    for (const suite of testSuites) {
        console.log(`\n📋 ${suite.name}:`);
        for (const test of suite.tests) {
            try {
                await test.fn();
                console.log(`  ✅ ${test.name}`);
                passed++;
            } catch (err) {
                console.log(`  ❌ ${test.name}`);
                console.log(`     Error: ${err.message}`);
                failed++;
            }
        }
    }
    
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log(`${'='.repeat(50)}\n`);
    
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
