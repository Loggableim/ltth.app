/**
 * TTS @ Character Removal Test
 * 
 * Tests that messages starting with @ character have the @ removed
 * but are still processed by TTS (not blocked).
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
        this.emittedEvents = [];
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

    emit(event, data) {
        this.emittedEvents.push({ event, data });
    }

    getConfigPathManager() {
        // Return mock ConfigPathManager
        return {
            getTikTokSessionId: () => null
        };
    }

    registerRoute() {}
    registerSocket() {}
    registerTikTokEvent() {}
}

// Test database setup
function createTestDatabase() {
    const dbPath = path.join(__dirname, 'test-tts-at-removal.db');
    
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
        );
        
        CREATE TABLE IF NOT EXISTS tts_user_permissions (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            allow_tts INTEGER DEFAULT 1,
            assigned_voice_id TEXT,
            assigned_engine TEXT,
            voice_emotion TEXT,
            volume_gain REAL DEFAULT 1.0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
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
    console.log('🧪 Starting TTS @ Character Removal Tests...\n');
    
    const { db, dbPath } = createTestDatabase();
    const mockDb = new MockDatabase(db);
    const mockAPI = new MockAPI(mockDb);
    
    try {
        // Load TTS Plugin
        const TTSPlugin = require('../plugins/tts/main.js');
        
        // Test 1: Message starting with @ should have @ removed
        console.log('Test 1: Message starting with @ has @ removed');
        mockAPI.setConfig('config', {
            messagePrefixFilter: [],
            enabledForChat: true,
            defaultEngine: 'tiktok',
            defaultVoice: 'de_002',
            enableAutoFallback: false // Disable fallback to test text processing only
        });
        mockDb.setSetting('tts_enabled', 'true');
        
        const ttsPlugin1 = new TTSPlugin(mockAPI);
        
        // Mock profanity filter to just pass text through
        ttsPlugin1.profanityFilter.filter = function(text) {
            return { filtered: text, hasProfanity: false, action: 'allow', matches: [] };
        };
        
        await ttsPlugin1.init();
        
        // We'll test by checking what text gets passed to profanity filter
        let textPassedToProfanityFilter = null;
        const originalFilter = ttsPlugin1.profanityFilter.filter;
        ttsPlugin1.profanityFilter.filter = function(text) {
            textPassedToProfanityFilter = text;
            return originalFilter.call(this, text);
        };
        
        const result1 = await ttsPlugin1.speak({
            text: '@testuser hello world',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        // Check if the @ was removed before profanity filter
        if (textPassedToProfanityFilter !== 'testuser hello world') {
            console.log('❌ FAIL: @ character should be removed from message');
            console.log('Expected text to profanity filter: "testuser hello world"');
            console.log('Got:', textPassedToProfanityFilter);
            process.exit(1);
        }
        console.log('✅ PASS: @ character removed before processing\n');
        
        await ttsPlugin1.destroy();
        
        // Test 2: Message with @ and leading whitespace
        console.log('Test 2: Message with leading whitespace and @');
        const ttsPlugin2 = new TTSPlugin(mockAPI);
        await ttsPlugin2.init();
        
        textPassedToProfanityFilter = null;
        ttsPlugin2.profanityFilter.filter = function(text) {
            textPassedToProfanityFilter = text;
            return { filtered: text, hasProfanity: false, action: 'allow', matches: [] };
        };
        
        const result2 = await ttsPlugin2.speak({
            text: '  @user test message',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (textPassedToProfanityFilter !== 'user test message') {
            console.log('❌ FAIL: @ character and whitespace should be removed');
            console.log('Expected: "user test message"');
            console.log('Got:', textPassedToProfanityFilter);
            process.exit(1);
        }
        console.log('✅ PASS: Leading whitespace and @ removed\n');
        
        await ttsPlugin2.destroy();
        
        // Test 3: Message without @ should be unchanged
        console.log('Test 3: Message without @ is unchanged');
        const ttsPlugin3 = new TTSPlugin(mockAPI);
        await ttsPlugin3.init();
        
        textPassedToProfanityFilter = null;
        ttsPlugin3.profanityFilter.filter = function(text) {
            textPassedToProfanityFilter = text;
            return { filtered: text, hasProfanity: false, action: 'allow', matches: [] };
        };
        
        const result3 = await ttsPlugin3.speak({
            text: 'hello world',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (textPassedToProfanityFilter !== 'hello world') {
            console.log('❌ FAIL: Message should remain unchanged');
            console.log('Expected: "hello world"');
            console.log('Got:', textPassedToProfanityFilter);
            process.exit(1);
        }
        console.log('✅ PASS: Message without @ is unchanged\n');
        
        await ttsPlugin3.destroy();
        
        // Test 4: Message with @ in the middle should be unchanged
        console.log('Test 4: Message with @ in middle is unchanged');
        const ttsPlugin4 = new TTSPlugin(mockAPI);
        await ttsPlugin4.init();
        
        textPassedToProfanityFilter = null;
        ttsPlugin4.profanityFilter.filter = function(text) {
            textPassedToProfanityFilter = text;
            return { filtered: text, hasProfanity: false, action: 'allow', matches: [] };
        };
        
        const result4 = await ttsPlugin4.speak({
            text: 'email me at user@example.com',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (textPassedToProfanityFilter !== 'email me at user@example.com') {
            console.log('❌ FAIL: @ in middle should not be removed');
            console.log('Expected: "email me at user@example.com"');
            console.log('Got:', textPassedToProfanityFilter);
            process.exit(1);
        }
        console.log('✅ PASS: @ in middle of message is preserved\n');
        
        await ttsPlugin4.destroy();
        
        // Test 5: Just @ character should result in empty text error
        console.log('Test 5: Just @ character results in empty text');
        const ttsPlugin5 = new TTSPlugin(mockAPI);
        await ttsPlugin5.init();
        
        const result5 = await ttsPlugin5.speak({
            text: '@',
            userId: 'user1',
            username: 'testuser',
            source: 'chat',
            teamLevel: 0
        });
        
        if (result5.success || result5.error !== 'empty_text') {
            console.log('❌ FAIL: Just @ should result in empty text error');
            console.log('Result:', result5);
            process.exit(1);
        }
        console.log('✅ PASS: Just @ character handled correctly\n');
        
        await ttsPlugin5.destroy();
        
        console.log('🎉 All TTS @ Character Removal tests passed!');
        
    } catch (error) {
        console.error('❌ Test Error:', error);
        console.error(error.stack);
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
