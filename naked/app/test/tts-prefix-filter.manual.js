/**
 * TTS Prefix Filter Test
 * 
 * Tests the message prefix filter functionality to ensure messages
 * starting with configured prefixes are properly ignored by TTS.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`)
};

// Mock API
class MockAPI {
    constructor(db) {
        this.db = db;
        this.logger = mockLogger;
        this.config = {};
    }

    getDatabase() {
        return this.db;
    }

    getConfig(key) {
        return this.config[key];
    }

    setConfig(key, value) {
        this.config[key] = value;
    }

    emit() {}
    registerRoute() {}
    registerSocket() {}
    registerTikTokEvent() {}
}

// Test database setup
function createTestDatabase() {
    const dbPath = path.join(__dirname, 'test-tts-prefix-filter.db');
    
    // Remove existing test database
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    
    const db = new Database(dbPath);
    
    // Create required tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    
    return { db, dbPath };
}

// Minimal database wrapper to match expected interface
class MockDatabase {
    constructor(db) {
        this.db = db;
    }

    getSetting(key) {
        const stmt = this.db.prepare('SELECT value FROM settings WHERE key = ?');
        const result = stmt.get(key);
        return result ? result.value : null;
    }

    setSetting(key, value) {
        const stmt = this.db.prepare(`
            INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `);
        stmt.run(key, String(value));
    }
}

// Run tests
async function runTests() {
    console.log('🧪 Starting TTS Prefix Filter Tests...\n');
    
    const { db, dbPath } = createTestDatabase();
    const mockDb = new MockDatabase(db);
    const mockAPI = new MockAPI(mockDb);
    
    try {
        // Load TTS Plugin
        const TTSPlugin = require('../plugins/tts/main.js');
        
        // Test 1: Prefix filter with empty array (no filtering)
        console.log('Test 1: Empty prefix filter (no filtering)');
        mockAPI.setConfig('config', {
            messagePrefixFilter: [],
            enabledForChat: true
        });
        mockDb.setSetting('tts_enabled', 'true');
        
        const ttsPlugin1 = new TTSPlugin(mockAPI);
        await ttsPlugin1.init();
        
        const result1 = await ttsPlugin1.speak({
            text: '!command test',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (result1.error === 'prefix_filtered') {
            console.log('❌ FAIL: Message should not be filtered with empty prefix array');
            process.exit(1);
        }
        console.log('✅ PASS: Empty prefix filter allows all messages\n');
        
        await ttsPlugin1.destroy();
        
        // Test 2: Prefix filter with configured prefixes
        console.log('Test 2: Filter messages starting with "!" and "/"');
        mockAPI.setConfig('config', {
            messagePrefixFilter: ['!', '/'],
            enabledForChat: true
        });
        
        const ttsPlugin2 = new TTSPlugin(mockAPI);
        await ttsPlugin2.init();
        
        // Should be filtered
        const result2a = await ttsPlugin2.speak({
            text: '!command test',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (result2a.error !== 'prefix_filtered') {
            console.log('❌ FAIL: Message starting with "!" should be filtered');
            process.exit(1);
        }
        console.log('✅ PASS: Message starting with "!" is filtered');
        
        // Should be filtered
        const result2b = await ttsPlugin2.speak({
            text: '/help me',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (result2b.error !== 'prefix_filtered') {
            console.log('❌ FAIL: Message starting with "/" should be filtered');
            process.exit(1);
        }
        console.log('✅ PASS: Message starting with "/" is filtered');
        
        // Should NOT be filtered
        const result2c = await ttsPlugin2.speak({
            text: 'Hello world',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (result2c.error === 'prefix_filtered') {
            console.log('❌ FAIL: Normal message should not be filtered');
            process.exit(1);
        }
        console.log('✅ PASS: Normal message is not filtered\n');
        
        await ttsPlugin2.destroy();
        
        // Test 3: Prefix filter only applies to chat messages
        console.log('Test 3: Prefix filter only applies to chat source');
        mockAPI.setConfig('config', {
            messagePrefixFilter: ['!', '/'],
            enabledForChat: true
        });
        
        const ttsPlugin3 = new TTSPlugin(mockAPI);
        await ttsPlugin3.init();
        
        // Manual source should NOT be filtered even with prefix
        const result3 = await ttsPlugin3.speak({
            text: '!test message',
            userId: 'user1',
            username: 'testuser',
            source: 'manual',
            teamLevel: 999
        });
        
        if (result3.error === 'prefix_filtered') {
            console.log('❌ FAIL: Manual source should not be affected by prefix filter');
            process.exit(1);
        }
        console.log('✅ PASS: Prefix filter only applies to chat messages\n');
        
        await ttsPlugin3.destroy();
        
        // Test 4: Whitespace handling
        console.log('Test 4: Whitespace handling');
        mockAPI.setConfig('config', {
            messagePrefixFilter: ['!'],
            enabledForChat: true
        });
        
        const ttsPlugin4 = new TTSPlugin(mockAPI);
        await ttsPlugin4.init();
        
        // Leading whitespace should be trimmed before checking
        const result4 = await ttsPlugin4.speak({
            text: '  !command',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        // Note: Current implementation trims before checking, so this should be filtered
        if (result4.error !== 'prefix_filtered') {
            console.log('❌ FAIL: Message with leading whitespace should be filtered after trim');
            process.exit(1);
        }
        console.log('✅ PASS: Whitespace is properly trimmed before prefix check\n');
        
        await ttsPlugin4.destroy();
        
        console.log('🎉 All TTS Prefix Filter tests passed!');
        
    } catch (error) {
        console.error('❌ Test Error:', error);
        process.exit(1);
    } finally {
        // Cleanup
        db.close();
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    }
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
