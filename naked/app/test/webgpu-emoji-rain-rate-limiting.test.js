/**
 * Tests for WebGPU Emoji Rain Rate Limiting Queue Feature
 * 
 * Tests the optional rate limiting functionality that limits
 * the number of emojis spawned per second and queues excess emojis.
 */

const Database = require('../modules/database');
const path = require('path');
const fs = require('fs');

// Test database path
const TEST_DB_PATH = path.join(__dirname, 'test-rate-limit.db');

describe('WebGPU Emoji Rain Rate Limiting', () => {
    let db;

    beforeEach(() => {
        // Remove test database if it exists
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }

        // Create new database instance
        db = new Database(TEST_DB_PATH);
    });

    afterEach(() => {
        // Close database
        if (db && db.db) {
            db.db.close();
        }

        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    test('Rate limiting config should have default values', () => {
        const config = db.getEmojiRainConfig();
        
        expect(config).toHaveProperty('rate_limit_enabled');
        expect(config).toHaveProperty('rate_limit_emojis_per_second');
        expect(config.rate_limit_enabled).toBe(false);
        expect(config.rate_limit_emojis_per_second).toBe(30);
    });

    test('Rate limiting config should be updateable', () => {
        const newConfig = {
            rate_limit_enabled: true,
            rate_limit_emojis_per_second: 50
        };

        db.updateEmojiRainConfig(newConfig);
        const updatedConfig = db.getEmojiRainConfig();

        expect(updatedConfig.rate_limit_enabled).toBe(true);
        expect(updatedConfig.rate_limit_emojis_per_second).toBe(50);
    });

    test('Rate limiting should not affect other config values', () => {
        const config = db.getEmojiRainConfig();
        const originalEmojiSet = config.emoji_set;
        const originalMaxEmojis = config.max_emojis_on_screen;

        const newConfig = {
            rate_limit_enabled: true,
            rate_limit_emojis_per_second: 20
        };

        db.updateEmojiRainConfig(newConfig);
        const updatedConfig = db.getEmojiRainConfig();

        expect(updatedConfig.emoji_set).toEqual(originalEmojiSet);
        expect(updatedConfig.max_emojis_on_screen).toBe(originalMaxEmojis);
        expect(updatedConfig.rate_limit_enabled).toBe(true);
        expect(updatedConfig.rate_limit_emojis_per_second).toBe(20);
    });

    test('Rate limiting values should persist across database reloads', () => {
        const config = {
            rate_limit_enabled: true,
            rate_limit_emojis_per_second: 15
        };

        db.updateEmojiRainConfig(config);
        
        // Close and reopen database
        db.db.close();
        db = new Database(TEST_DB_PATH);

        const reloadedConfig = db.getEmojiRainConfig();
        expect(reloadedConfig.rate_limit_enabled).toBe(true);
        expect(reloadedConfig.rate_limit_emojis_per_second).toBe(15);
    });

    test('Rate limiting should accept valid range of emojis per second', () => {
        const testValues = [5, 10, 30, 50, 100, 200];

        testValues.forEach(value => {
            db.updateEmojiRainConfig({
                rate_limit_emojis_per_second: value
            });

            const config = db.getEmojiRainConfig();
            expect(config.rate_limit_emojis_per_second).toBe(value);
        });
    });

    test('Disabling rate limiting should preserve emojis per second setting', () => {
        db.updateEmojiRainConfig({
            rate_limit_enabled: true,
            rate_limit_emojis_per_second: 25
        });

        db.updateEmojiRainConfig({
            rate_limit_enabled: false
        });

        const config = db.getEmojiRainConfig();
        expect(config.rate_limit_enabled).toBe(false);
        expect(config.rate_limit_emojis_per_second).toBe(25);
    });
});

/**
 * Client-side rate limiting queue logic tests
 * 
 * These tests simulate the queue behavior that happens in the browser.
 * Since we can't run browser code in Node.js tests, we'll test the logic directly.
 */
describe('WebGPU Emoji Rain Queue Logic (Simulated)', () => {
    let rateLimitQueue;
    let emojisSpawnedThisSecond;
    let secondStartTime;
    let spawnedEmojis;

    const mockConfig = {
        rate_limit_enabled: true,
        rate_limit_emojis_per_second: 10,
        emoji_min_size_px: 40,
        emoji_max_size_px: 80
    };

    // Simulate the processSpawn function
    function processSpawn(emoji, x, y, count) {
        if (mockConfig.rate_limit_enabled && mockConfig.rate_limit_emojis_per_second > 0) {
            for (let i = 0; i < count; i++) {
                const size = mockConfig.emoji_min_size_px + Math.random() * (mockConfig.emoji_max_size_px - mockConfig.emoji_min_size_px);
                const offsetX = x + (Math.random() - 0.5) * 0.2;
                const offsetY = y - i * 5;
                
                rateLimitQueue.push({
                    emoji,
                    x: offsetX,
                    y: offsetY,
                    size
                });
            }
        } else {
            // Spawn immediately
            for (let i = 0; i < count; i++) {
                spawnedEmojis.push({ emoji, x, y });
            }
        }
    }

    // Simulate the processRateLimitQueue function
    function processRateLimitQueue(now) {
        if (!mockConfig.rate_limit_enabled || mockConfig.rate_limit_emojis_per_second <= 0) {
            return;
        }
        
        if (rateLimitQueue.length === 0) {
            return;
        }
        
        const timeSinceSecondStart = now - secondStartTime;
        
        // Reset counter every second
        if (timeSinceSecondStart >= 1000) {
            emojisSpawnedThisSecond = 0;
            secondStartTime = now;
        }
        
        const maxEmojisPerSecond = mockConfig.rate_limit_emojis_per_second;
        const emojisAvailable = maxEmojisPerSecond - emojisSpawnedThisSecond;
        
        if (emojisAvailable <= 0) {
            return;
        }
        
        const emojisToSpawn = Math.min(emojisAvailable, rateLimitQueue.length);
        
        for (let i = 0; i < emojisToSpawn; i++) {
            const emojiData = rateLimitQueue.shift();
            spawnedEmojis.push(emojiData);
            emojisSpawnedThisSecond++;
        }
    }

    beforeEach(() => {
        rateLimitQueue = [];
        emojisSpawnedThisSecond = 0;
        secondStartTime = 0;
        spawnedEmojis = [];
    });

    test('Queue should store emojis when rate limiting is enabled', () => {
        processSpawn('💙', 0.5, 0, 15);
        
        expect(rateLimitQueue.length).toBe(15);
        expect(spawnedEmojis.length).toBe(0);
    });

    test('Queue should spawn emojis respecting the rate limit', () => {
        processSpawn('💙', 0.5, 0, 15);
        
        // Process queue - should spawn 10 (limit)
        processRateLimitQueue(100);
        
        expect(spawnedEmojis.length).toBe(10);
        expect(rateLimitQueue.length).toBe(5);
        expect(emojisSpawnedThisSecond).toBe(10);
    });

    test('Queue should reset counter after one second', () => {
        processSpawn('💙', 0.5, 0, 15);
        
        // Spawn 10 in first second
        processRateLimitQueue(100);
        expect(spawnedEmojis.length).toBe(10);
        
        // Try to spawn more in same second (should not spawn)
        processRateLimitQueue(500);
        expect(spawnedEmojis.length).toBe(10);
        
        // After 1 second, should spawn remaining 5
        processRateLimitQueue(1100);
        expect(spawnedEmojis.length).toBe(15);
        expect(rateLimitQueue.length).toBe(0);
    });

    test('Queue should handle multiple spawn events', () => {
        processSpawn('💙', 0.5, 0, 8);
        processSpawn('❤️', 0.3, 0, 7);
        
        expect(rateLimitQueue.length).toBe(15);
        
        processRateLimitQueue(100);
        expect(spawnedEmojis.length).toBe(10);
        expect(rateLimitQueue.length).toBe(5);
    });

    test('Disabled rate limiting should spawn immediately', () => {
        mockConfig.rate_limit_enabled = false;
        
        processSpawn('💙', 0.5, 0, 20);
        
        expect(rateLimitQueue.length).toBe(0);
        expect(spawnedEmojis.length).toBe(20);
    });
});

console.log('✅ WebGPU Emoji Rain Rate Limiting tests completed');
