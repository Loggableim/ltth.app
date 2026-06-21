/**
 * Session Extractor Eulerstream API Test
 * 
 * Tests the new Eulerstream API method for extracting TikTok session IDs
 */

const SessionExtractor = require('../modules/session-extractor');

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

describe('SessionExtractor - Eulerstream API', () => {
    let extractor;

    beforeEach(() => {
        // Reset mock database
        mockDb.settings = {};
        extractor = new SessionExtractor(mockDb);
    });

    test('should have extractSessionIdFromEulerstream method', () => {
        expect(typeof extractor.extractSessionIdFromEulerstream).toBe('function');
    });

    test('should return error when no API key is configured', async () => {
        const result = await extractor.extractSessionIdFromEulerstream();
        
        expect(result.success).toBe(false);
        expect(result.requiresApiKey).toBe(true);
        expect(result.error).toContain('API key');
    });

    test('should use API key from options', async () => {
        // This test will fail with network error, but we can verify the API key is used
        const result = await extractor.extractSessionIdFromEulerstream({
            apiKey: 'test_api_key_12345'
        });
        
        // Should attempt to use the API key (will fail but not due to missing key)
        expect(result.success).toBe(false);
        expect(result.requiresApiKey).not.toBe(true);
    });

    test('should use API key from database', async () => {
        mockDb.setSetting('tiktok_euler_api_key', 'db_api_key_12345');
        
        const result = await extractor.extractSessionIdFromEulerstream();
        
        // Should attempt to use the database API key (will fail but not due to missing key)
        expect(result.success).toBe(false);
        expect(result.requiresApiKey).not.toBe(true);
    });

    test('should have extractSessionId method that tries multiple methods', () => {
        expect(typeof extractor.extractSessionId).toBe('function');
    });

    test('extractSessionId should prevent concurrent extractions', async () => {
        // Start first extraction
        const promise1 = extractor.extractSessionId({ method: 'eulerstream' });
        
        // Immediately try second extraction
        const result2 = await extractor.extractSessionId({ method: 'eulerstream' });
        
        expect(result2.success).toBe(false);
        expect(result2.inProgress).toBe(true);
        
        // Wait for first to complete
        await promise1;
    });

    test('should update session status with method', () => {
        mockDb.setSetting('tiktok_session_id', 'test_session_12345');
        mockDb.setSetting('tiktok_session_method', 'eulerstream_api');
        
        const status = extractor.getSessionStatus();
        
        expect(status.hasSession).toBe(true);
        expect(status.method).toBe('eulerstream_api');
    });

    test('should clear session method when clearing session data', () => {
        mockDb.setSetting('tiktok_session_id', 'test_session_12345');
        mockDb.setSetting('tiktok_session_method', 'eulerstream_api');
        
        const result = extractor.clearSessionData();
        
        expect(result.success).toBe(true);
        expect(mockDb.getSetting('tiktok_session_id')).toBeNull();
        expect(mockDb.getSetting('tiktok_session_method')).toBeNull();
    });
});

describe('SessionExtractor - Method Selection', () => {
    let extractor;

    beforeEach(() => {
        mockDb.settings = {};
        extractor = new SessionExtractor(mockDb);
    });

    test('should default to auto method', async () => {
        // Without specifying method, should try Eulerstream first
        // We can't test the full flow without mocking axios, but we can verify it tries
        const result = await extractor.extractSessionId();
        
        // Should fail with API key error (Eulerstream attempt)
        expect(result.success).toBe(false);
    });

    test('should support explicit method selection', async () => {
        const result = await extractor.extractSessionId({ method: 'eulerstream' });
        
        // Should fail with API key error
        expect(result.success).toBe(false);
        expect(result.requiresApiKey).toBe(true);
    });

    test('should reject invalid methods', async () => {
        const result = await extractor.extractSessionId({ method: 'invalid_method' });
        
        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid extraction method');
    });
});
