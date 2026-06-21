/**
 * Test: TTS API Key Validation
 * 
 * Tests that API keys are properly validated and empty/whitespace-only keys
 * are treated as "no API key" to prevent invalid engine initialization.
 */

const Database = require('../modules/database');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('TTS API Key Validation', () => {
    let db;
    let testDbPath;

    beforeEach(() => {
        // Create a temporary database for testing
        testDbPath = path.join(os.tmpdir(), `test-tts-api-key-${Date.now()}.db`);
        db = new Database(testDbPath);
    });

    afterEach(() => {
        // Close and delete test database
        if (db) {
            db.db.close();
        }
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    /**
     * Helper function to simulate the getValidApiKey function from TTS plugin
     */
    function getValidApiKey(...keys) {
        for (const key of keys) {
            const value = db.getSetting(key);
            if (value && typeof value === 'string' && value.trim() !== '') {
                return value.trim();
            }
        }
        return null;
    }

    test('should return null when no API key is stored', () => {
        const apiKey = getValidApiKey('siliconflow_api_key', 'tts_fishspeech_api_key');
        expect(apiKey).toBeNull();
    });

    test('should return null when API key is empty string', () => {
        db.setSetting('siliconflow_api_key', '');
        const apiKey = getValidApiKey('siliconflow_api_key');
        expect(apiKey).toBeNull();
    });

    test('should return null when API key is whitespace only', () => {
        db.setSetting('siliconflow_api_key', '   ');
        const apiKey = getValidApiKey('siliconflow_api_key');
        expect(apiKey).toBeNull();
    });

    test('should return null when API key is tab/newline only', () => {
        db.setSetting('siliconflow_api_key', '\t\n  \t');
        const apiKey = getValidApiKey('siliconflow_api_key');
        expect(apiKey).toBeNull();
    });

    test('should return trimmed API key when valid', () => {
        db.setSetting('siliconflow_api_key', '  sk-valid-api-key-123  ');
        const apiKey = getValidApiKey('siliconflow_api_key');
        expect(apiKey).toBe('sk-valid-api-key-123');
    });

    test('should return first valid API key from multiple options', () => {
        db.setSetting('tts_fishspeech_api_key', '');
        db.setSetting('streamalchemy_siliconflow_api_key', 'sk-valid-key');
        const apiKey = getValidApiKey(
            'siliconflow_api_key',
            'tts_fishspeech_api_key',
            'streamalchemy_siliconflow_api_key'
        );
        expect(apiKey).toBe('sk-valid-key');
    });

    test('should prioritize centralized key over legacy keys', () => {
        db.setSetting('siliconflow_api_key', 'sk-centralized-key');
        db.setSetting('tts_fishspeech_api_key', 'sk-legacy-key');
        const apiKey = getValidApiKey(
            'siliconflow_api_key',
            'tts_fishspeech_api_key'
        );
        expect(apiKey).toBe('sk-centralized-key');
    });

    test('should skip empty legacy key and use next valid key', () => {
        db.setSetting('siliconflow_api_key', '');
        db.setSetting('tts_fishspeech_api_key', 'sk-legacy-key');
        const apiKey = getValidApiKey(
            'siliconflow_api_key',
            'tts_fishspeech_api_key'
        );
        expect(apiKey).toBe('sk-legacy-key');
    });

    test('should handle API keys with special characters', () => {
        const specialKey = 'sk-key_with-special.chars@123!';
        db.setSetting('siliconflow_api_key', specialKey);
        const apiKey = getValidApiKey('siliconflow_api_key');
        expect(apiKey).toBe(specialKey);
    });

    test('should handle very long API keys', () => {
        const longKey = 'sk-' + 'a'.repeat(500);
        db.setSetting('siliconflow_api_key', longKey);
        const apiKey = getValidApiKey('siliconflow_api_key');
        expect(apiKey).toBe(longKey);
    });

    test('should prioritize tts_fishaudio_api_key over fishaudio_api_key', () => {
        db.setSetting('fishaudio_api_key', 'secondary-key');
        db.setSetting('tts_fishaudio_api_key', 'primary-key');
        const apiKey = getValidApiKey('tts_fishaudio_api_key', 'fishaudio_api_key');
        expect(apiKey).toBe('primary-key');
    });

    test('should return null when Fish.audio keys are missing', () => {
        const apiKey = getValidApiKey('tts_fishaudio_api_key', 'fishaudio_api_key');
        expect(apiKey).toBeNull();
    });
});

describe('FishSpeech Engine API Key Validation', () => {
    test('should throw error when API key is null', () => {
        const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        expect(() => {
            new FishSpeechEngine(null, mockLogger);
        }).toThrow('Fish Speech API key is required and must be a non-empty string');
    });

    test('should throw error when API key is empty string', () => {
        const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        expect(() => {
            new FishSpeechEngine('', mockLogger);
        }).toThrow('Fish Speech API key is required and must be a non-empty string');
    });

    test('should throw error when API key is whitespace only', () => {
        const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        expect(() => {
            new FishSpeechEngine('   ', mockLogger);
        }).toThrow('Fish Speech API key is required and must be a non-empty string');
    });

    test('should initialize successfully with valid API key', () => {
        const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');
        const mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn()
        };

        const engine = new FishSpeechEngine('sk-valid-api-key', mockLogger);
        expect(engine).toBeDefined();
        expect(engine.apiKey).toBe('sk-valid-api-key');
    });
});
