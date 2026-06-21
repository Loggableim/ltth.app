/**
 * TTS Username Announcement Test
 * 
 * Tests the username announcement functionality to ensure usernames
 * are properly prepended to chat messages when the option is enabled.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Mock logger - silent to avoid cluttering test output
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
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
    const dbPath = path.join(__dirname, 'test-tts-username-announcement.db');
    
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
        
        CREATE TABLE IF NOT EXISTS tts_users (
            user_id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            assigned_voice_id TEXT,
            assigned_engine TEXT,
            allow_tts INTEGER DEFAULT 1,
            volume_gain REAL DEFAULT 1.0,
            created_at INTEGER DEFAULT (strftime('%s','now'))
        );
    `);
    
    // Set TTS enabled
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('tts_enabled', 'true');
    
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
            INSERT OR REPLACE INTO settings (key, value)
            VALUES (?, ?)
        `);
        stmt.run(key, value);
    }
}

describe('TTS Username Announcement', () => {
    let ttsPlugin;
    let mockDb;
    let dbPath;
    let db;
    let capturedText;

    // Helper function to setup mocks for TTS testing
    function setupTTSMocks() {
        capturedText = null;
        
        // Mock the queue manager
        ttsPlugin.queueManager = {
            enqueue: (item) => {
                capturedText = item.text;
                return {
                    success: true,
                    position: 0,
                    queueSize: 1,
                    estimatedWaitMs: 0
                };
            }
        };
        
        // Mock the TikTok engine
        ttsPlugin.engines.tiktok = {
            synthesize: async (text) => {
                return Buffer.from('mock-audio-data');
            }
        };
    }

    beforeEach(async () => {
        // Create test database
        const dbSetup = createTestDatabase();
        db = dbSetup.db;
        dbPath = dbSetup.dbPath;
        mockDb = new MockDatabase(db);
        
        // Create mock API
        const mockApi = new MockAPI(mockDb);
        
        // Load TTS plugin
        const TTSPlugin = require('../plugins/tts/main.js');
        ttsPlugin = new TTSPlugin(mockApi);
        
        // Initialize plugin
        await ttsPlugin.init();
    });

    afterEach(() => {
        // Clean up test database
        if (db) {
            db.close();
        }
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
    });

    test('Should prepend username when announceUsername is enabled for chat messages', async () => {
        // Enable username announcement
        ttsPlugin.config.announceUsername = true;
        
        // Setup mocks
        setupTTSMocks();
        
        // Call speak with chat source
        const result = await ttsPlugin.speak({
            text: 'Hello world!',
            userId: 'testuser123',
            username: 'TestUser',
            source: 'chat',
            teamLevel: 0,
            isSubscriber: false
        });
        
        // Verify username was prepended
        expect(result.success).toBe(true);
        expect(capturedText).toBe('TestUser sagt: Hello world!');
    });

    test('Should NOT prepend username when announceUsername is disabled', async () => {
        // Disable username announcement
        ttsPlugin.config.announceUsername = false;
        
        // Setup mocks
        setupTTSMocks();
        
        // Call speak with chat source
        const result = await ttsPlugin.speak({
            text: 'Hello world!',
            userId: 'testuser123',
            username: 'TestUser',
            source: 'chat',
            teamLevel: 0,
            isSubscriber: false
        });
        
        // Verify username was NOT prepended
        expect(result.success).toBe(true);
        expect(capturedText).toBe('Hello world!');
    });

    test('Should NOT prepend username for non-chat sources even when enabled', async () => {
        // Enable username announcement
        ttsPlugin.config.announceUsername = true;
        
        // Setup mocks
        setupTTSMocks();
        
        // Call speak with manual source (not chat)
        const result = await ttsPlugin.speak({
            text: 'Hello world!',
            userId: 'testuser123',
            username: 'TestUser',
            source: 'manual',
            teamLevel: 0,
            isSubscriber: false
        });
        
        // Verify username was NOT prepended for non-chat source
        expect(result.success).toBe(true);
        expect(capturedText).toBe('Hello world!');
    });

    test('Should handle missing username gracefully', async () => {
        // Enable username announcement
        ttsPlugin.config.announceUsername = true;
        
        // Setup mocks
        setupTTSMocks();
        
        // Call speak without username
        const result = await ttsPlugin.speak({
            text: 'Hello world!',
            userId: 'testuser123',
            username: null, // No username provided
            source: 'chat',
            teamLevel: 0,
            isSubscriber: false
        });
        
        // Verify no username announcement when username is missing
        expect(result.success).toBe(true);
        expect(capturedText).toBe('Hello world!');
    });
});
