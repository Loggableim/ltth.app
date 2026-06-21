/**
 * Test suite for Session Extractor Concurrent Extraction Handling
 * Tests that multiple concurrent extraction requests are handled gracefully
 */

const assert = require('assert');
const SessionExtractor = require('../modules/session-extractor');
const path = require('path');
const fs = require('fs');

// Mock Database
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
}

// Simple test runner
console.log('🧪 Running Session Extractor Concurrent Extraction Tests...\n');

let passed = 0;
let failed = 0;

async function runTests() {
    const testDbPath = path.join(__dirname, 'test-session-concurrent.db');
    
    // Test 1: Concurrent extraction attempts should return "in progress" status
    console.log('Test 1: Concurrent extraction returns "in progress" status');
    try {
        const db = new MockDB();
        const extractor = new SessionExtractor(db);
        
        // Manually set isExtracting to simulate an extraction in progress
        extractor.isExtracting = true;
        
        const result = await extractor.extractSessionId({ headless: true });
        
        assert.strictEqual(result.success, false, 'Result should not be successful');
        assert.strictEqual(result.inProgress, true, 'Result should indicate extraction in progress');
        assert.ok(result.message, 'Result should have a message');
        assert.ok(result.message.includes('already in progress'), 'Message should indicate extraction in progress');
        
        // Reset the flag
        extractor.isExtracting = false;
        
        console.log('✅ Test passed: Concurrent extraction returns correct status\n');
        passed++;
    } catch (error) {
        console.log('❌ Test failed:', error.message, '\n');
        failed++;
    }
    
    // Test 2: Manual extraction handles "in progress" status
    console.log('Test 2: Manual extraction handles "in progress" status');
    try {
        const db = new MockDB();
        const extractor = new SessionExtractor(db);
        
        // Manually set isExtracting to simulate an extraction in progress
        extractor.isExtracting = true;
        
        const result = await extractor.extractWithManualLogin({ headless: false });
        
        assert.strictEqual(result.success, false, 'Result should not be successful');
        assert.strictEqual(result.inProgress, true, 'Result should indicate extraction in progress');
        assert.ok(result.message, 'Result should have a message');
        
        // Reset the flag
        extractor.isExtracting = false;
        
        console.log('✅ Test passed: Manual extraction handles in-progress status\n');
        passed++;
    } catch (error) {
        console.log('❌ Test failed:', error.message, '\n');
        failed++;
    }
    
    // Test 3: Normal extraction works when not in progress
    console.log('Test 3: Normal extraction flow when not in progress');
    try {
        const db = new MockDB();
        const extractor = new SessionExtractor(db);
        
        // Ensure isExtracting is false
        assert.strictEqual(extractor.isExtracting, false, 'isExtracting should be false initially');
        
        // Try extraction (will fail because no browser, but shouldn't have "inProgress" flag)
        const result = await extractor.extractSessionId({ headless: true });
        
        // Should not have inProgress flag
        assert.strictEqual(result.inProgress, undefined, 'Result should not have inProgress flag when not concurrent');
        
        // After extraction attempt, isExtracting should be reset to false
        assert.strictEqual(extractor.isExtracting, false, 'isExtracting should be false after extraction');
        
        console.log('✅ Test passed: Normal extraction flow works correctly\n');
        passed++;
    } catch (error) {
        console.log('❌ Test failed:', error.message, '\n');
        failed++;
    }
    
    // Summary
    console.log('='.repeat(50));
    console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
    
    if (failed === 0) {
        console.log('✅ All tests passed!\n');
    } else {
        console.log('❌ Some tests failed\n');
    }
    
    // Cleanup
    try {
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    } catch (error) {
        console.log('⚠️  Cleanup error:', error.message);
    }
    
    return failed === 0 ? 0 : 1;
}

// Run tests
runTests()
    .then(exitCode => {
        process.exit(exitCode);
    })
    .catch(error => {
        console.error('❌ Test suite error:', error);
        process.exit(1);
    });
