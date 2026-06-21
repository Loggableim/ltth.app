/**
 * TikTok TTS Engine - Eulerstream Error Message Test
 * 
 * Tests that the TikTok TTS engine provides helpful, targeted error messages
 * when Eulerstream session extraction fails for different reasons.
 */

const TikTokEngine = require('../plugins/tts/engines/tiktok-engine');

// Mock logger
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

// Mock database
const mockDb = {
    settings: {},
    getSetting: function(key) {
        return this.settings[key] || null;
    },
    setSetting: function(key, value) {
        this.settings[key] = value;
    }
};

describe('TikTok TTS Engine - Eulerstream Error Messages', () => {
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        mockDb.settings = {};
    });

    test('should track Eulerstream failure when API key is missing', async () => {
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        // The engine should attempt extraction and track the failure
        await engine._ensureSessionId();
        
        expect(engine.lastEulerstreamFailure).toBeDefined();
        expect(engine.lastEulerstreamFailure.requiresApiKey).toBe(true);
        expect(engine.lastEulerstreamFailure.success).toBe(false);
    });

    test('should provide targeted error message for missing API key', async () => {
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        // Trigger synthesis which will check sessionId
        await expect(engine.synthesize('Test text', 'en_us_001')).rejects.toThrow('SessionID');
        
        // Verify targeted error message was logged
        const errorLogs = mockLogger.error.mock.calls.map(call => call[0]).join('\n');
        
        expect(errorLogs).toContain('EULERSTREAM API KEY REQUIRED');
        expect(errorLogs).toContain('https://www.eulerstream.com/dashboard');
        expect(errorLogs).toContain('EULERSTREAM_AUTHENTICATION_GUIDE.md');
        expect(errorLogs).toContain('tiktok_euler_api_key');
        expect(errorLogs).toContain('EULER_API_KEY');
    });

    test('should provide targeted error message for invalid API key', async () => {
        // Set an invalid API key (too short)
        mockDb.setSetting('tiktok_euler_api_key', 'short_key');
        
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        // Trigger synthesis
        await expect(engine.synthesize('Test text', 'en_us_001')).rejects.toThrow('SessionID');
        
        const errorLogs = mockLogger.error.mock.calls.map(call => call[0]).join('\n');
        
        expect(errorLogs).toContain('INVALID EULERSTREAM API KEY');
        expect(errorLogs).toContain('too short');
        expect(errorLogs).toContain('euler_');
    });

    test('should log info message when attempting Eulerstream extraction', async () => {
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        await engine._ensureSessionId();
        
        // Verify info message was logged
        const infoLogs = mockLogger.info.mock.calls.map(call => call[0]).join('\n');
        expect(infoLogs).toContain('Attempting automatic SessionID extraction via Eulerstream');
    });

    test('should log helpful warning when Eulerstream extraction fails', async () => {
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        await engine._ensureSessionId();
        
        // Verify warning messages were logged with helpful guidance
        const warnLogs = mockLogger.warn.mock.calls.map(call => call[0]).join('\n');
        
        expect(warnLogs).toContain('Eulerstream session extraction failed');
        expect(warnLogs).toContain('Configure your Eulerstream API key');
        expect(warnLogs).toContain('EULERSTREAM_AUTHENTICATION_GUIDE.md');
    });

    test('should clear lastEulerstreamFailure on successful extraction', async () => {
        // Set a valid session ID in database
        mockDb.setSetting('tiktok_session_id', 'valid_session_id_12345');
        
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        // First ensure session ID is loaded
        await engine._ensureSessionId();
        
        // Should have no failure tracked
        expect(engine.sessionId).toBe('valid_session_id_12345');
    });

    test('should provide generic instructions when no Eulerstream failure info available', async () => {
        const engine = new TikTokEngine(mockLogger, { db: null }); // No DB to prevent Eulerstream attempt
        
        await expect(engine.synthesize('Test text', 'en_us_001')).rejects.toThrow('SessionID');
        
        const errorLogs = mockLogger.error.mock.calls.map(call => call[0]).join('\n');
        
        // Should provide all three methods
        expect(errorLogs).toContain('METHOD 1 (RECOMMENDED): Eulerstream API');
        expect(errorLogs).toContain('METHOD 2 (FALLBACK): Browser Automation');
        expect(errorLogs).toContain('METHOD 3 (MANUAL): Copy from Browser');
    });

    test('should handle errors gracefully during Eulerstream extraction', async () => {
        // Create engine with working DB
        const engine = new TikTokEngine(mockLogger, { db: mockDb });
        
        // The extraction will fail due to missing API key, which should be handled gracefully
        await engine._ensureSessionId();
        
        // Should have tracked the failure
        expect(engine.lastEulerstreamFailure).toBeDefined();
        expect(engine.lastEulerstreamFailure.success).toBe(false);
        expect(engine.sessionId).toBeNull();
    });
});
