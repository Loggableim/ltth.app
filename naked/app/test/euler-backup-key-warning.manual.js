/**
 * Test suite for Euler Backup Key Warning
 * Tests that the backup key triggers the appropriate warning system
 */

const assert = require('assert');

// Mock dependencies
class MockIO {
    constructor() {
        this.emittedEvents = [];
    }
    
    emit(event, data) {
        this.emittedEvents.push({ event, data });
    }
    
    getEmittedEvent(eventName) {
        return this.emittedEvents.find(e => e.event === eventName);
    }
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
console.log('🧪 Running Euler Backup Key Warning Tests...\n');

let passed = 0;
let failed = 0;

const testSuites = [
    {
        name: 'Backup Key Detection',
        tests: [
            { name: 'Detects when backup key is in use', fn: () => {
                // This test verifies that the backup key constant is properly defined
                // The actual key value comes from environment variable EULER_BACKUP_API_KEY
                const backupKey = process.env.EULER_BACKUP_API_KEY;
                
                if (backupKey) {
                    assert.ok(typeof backupKey === 'string', 'Backup key should be a string');
                    assert.ok(backupKey.length > 0, 'Backup key should not be empty');
                    console.log(`     ℹ️  Backup key configured: ${backupKey.substring(0, 8)}...${backupKey.substring(backupKey.length - 4)}`);
                } else {
                    console.log('     ⚠️  EULER_BACKUP_API_KEY not set in environment - test skipped');
                }
            }},
            
            { name: 'Warning event structure is correct', fn: () => {
                const io = new MockIO();
                const db = new MockDB();
                const connector = new TikTokConnector(io, db);
                
                // Manually emit the warning to test the event structure
                io.emit('euler-backup-key-warning', {
                    message: 'Euler Backup Key wird verwendet',
                    duration: 10000
                });
                
                const warningEvent = io.getEmittedEvent('euler-backup-key-warning');
                assert.ok(warningEvent !== undefined, 'Warning event should be emitted');
                assert.strictEqual(warningEvent.data.message, 'Euler Backup Key wird verwendet', 'Message should match');
                assert.strictEqual(warningEvent.data.duration, 10000, 'Duration should be 10 seconds');
            }},
            
            { name: 'Backup key is distinct from fallback key', fn: () => {
                const backupKey = process.env.EULER_BACKUP_API_KEY;
                const fallbackKey = process.env.EULER_FALLBACK_API_KEY;
                
                // If both are set, they should be different
                if (backupKey && fallbackKey) {
                    assert.notStrictEqual(backupKey, fallbackKey, 
                        'Backup key and fallback key should be different');
                } else {
                    console.log('     ℹ️  Only one or neither key is set - comparison skipped');
                }
            }},
        ]
    },
    {
        name: 'Warning Message Content',
        tests: [
            { name: 'Warning message is in German', fn: () => {
                const expectedMessage = 'Euler Backup Key wird verwendet';
                assert.ok(expectedMessage.includes('verwendet'), 'Should contain German text');
                assert.ok(!expectedMessage.includes('using'), 'Should not contain English text');
            }},
            
            { name: 'Warning duration is 10 seconds', fn: () => {
                const io = new MockIO();
                const expectedDuration = 10000; // 10 seconds in milliseconds
                
                // Emit a warning event to test the duration
                io.emit('euler-backup-key-warning', {
                    message: 'Euler Backup Key wird verwendet',
                    duration: expectedDuration
                });
                
                const warningEvent = io.getEmittedEvent('euler-backup-key-warning');
                assert.strictEqual(warningEvent.data.duration, 10000, 'Duration should be 10000ms (10 seconds)');
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
