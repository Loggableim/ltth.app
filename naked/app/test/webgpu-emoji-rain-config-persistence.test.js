/**
 * Test: WebGPU Emoji Rain Configuration Persistence
 * 
 * Verifies that user configuration for WebGPU Emoji Rain plugin
 * is properly persisted across database reloads and doesn't get
 * reset to default values.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('../modules/database');

describe('WebGPU Emoji Rain - Configuration Persistence', () => {
    let testDbPath;
    let db;

    beforeEach(() => {
        // Create a temporary database for testing
        const tmpDir = path.join(os.tmpdir(), 'test-webgpu-emoji-rain-config');
        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        testDbPath = path.join(tmpDir, 'test-config-persistence.db');
        
        // Delete if exists
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
        
        // Create new database
        db = new Database(testDbPath, 'test_user');
    });

    afterEach(() => {
        // Cleanup
        if (db) {
            db.close();
        }
        
        // Clean up database files with error handling
        try {
            if (fs.existsSync(testDbPath)) {
                fs.unlinkSync(testDbPath);
            }
        } catch (err) {
            console.warn(`Failed to delete test database: ${err.message}`);
        }
        
        // Cleanup WAL and SHM files
        const walPath = `${testDbPath}-wal`;
        const shmPath = `${testDbPath}-shm`;
        try {
            if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        } catch (err) {
            console.warn(`Failed to delete WAL file: ${err.message}`);
        }
        try {
            if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
        } catch (err) {
            console.warn(`Failed to delete SHM file: ${err.message}`);
        }
    });

    test('should initialize with default configuration', () => {
        const config = db.getEmojiRainConfig();
        
        // Check that defaults are loaded
        expect(config).toBeDefined();
        expect(config.enabled).toBe(true);
        expect(config.emoji_set).toEqual(["💧","💙","💚","💜","❤️","🩵","✨","🌟","🔥","🎉"]);
        expect(config.obs_hud_width).toBe(1920);
        expect(config.obs_hud_height).toBe(1080);
        expect(config.target_fps).toBe(60);
    });

    test('should persist user configuration after update', () => {
        // Get initial config
        const initialConfig = db.getEmojiRainConfig();
        
        // Update with custom user settings
        const userConfig = {
            ...initialConfig,
            emoji_set: ["🚀", "🎮", "🎸", "🎨"],
            obs_hud_width: 2560,
            obs_hud_height: 1440,
            target_fps: 144,
            enable_glow: false,
            wind_enabled: true,
            wind_strength: 75,
            emoji_min_size_px: 50,
            emoji_max_size_px: 150
        };
        
        db.updateEmojiRainConfig(userConfig, true);
        
        // Read back the config
        const savedConfig = db.getEmojiRainConfig();
        
        // Verify user settings are saved
        expect(savedConfig.emoji_set).toEqual(["🚀", "🎮", "🎸", "🎨"]);
        expect(savedConfig.obs_hud_width).toBe(2560);
        expect(savedConfig.obs_hud_height).toBe(1440);
        expect(savedConfig.target_fps).toBe(144);
        expect(savedConfig.enable_glow).toBe(false);
        expect(savedConfig.wind_enabled).toBe(true);
        expect(savedConfig.wind_strength).toBe(75);
        expect(savedConfig.emoji_min_size_px).toBe(50);
        expect(savedConfig.emoji_max_size_px).toBe(150);
    });

    test('should preserve user configuration after database reload', () => {
        // Set custom user configuration
        const userConfig = {
            emoji_set: ["🔥", "⚡", "💎", "👑"],
            obs_hud_width: 3840,
            obs_hud_height: 2160,
            target_fps: 120,
            enable_particles: false,
            rainbow_enabled: true,
            rainbow_speed: 2.5,
            pixel_enabled: true,
            pixel_size: 8
        };
        
        db.updateEmojiRainConfig(userConfig, false);
        
        // Close and reopen database (simulating app restart)
        db.close();
        db = new Database(testDbPath, 'test_user');
        
        // Read config after reload
        const reloadedConfig = db.getEmojiRainConfig();
        
        // Verify user settings are still there
        expect(reloadedConfig.emoji_set).toEqual(["🔥", "⚡", "💎", "👑"]);
        expect(reloadedConfig.obs_hud_width).toBe(3840);
        expect(reloadedConfig.obs_hud_height).toBe(2160);
        expect(reloadedConfig.target_fps).toBe(120);
        expect(reloadedConfig.enable_particles).toBe(false);
        expect(reloadedConfig.rainbow_enabled).toBe(true);
        expect(reloadedConfig.rainbow_speed).toBe(2.5);
        expect(reloadedConfig.pixel_enabled).toBe(true);
        expect(reloadedConfig.pixel_size).toBe(8);
        expect(reloadedConfig.enabled).toBe(false); // Should preserve enabled state too
    });

    test('should preserve user settings across multiple restarts', () => {
        // First update
        let userConfig = {
            emoji_set: ["🌈", "☀️", "🌙"],
            obs_hud_width: 1280,
            target_fps: 90
        };
        db.updateEmojiRainConfig(userConfig, true);
        
        // First restart
        db.close();
        db = new Database(testDbPath, 'test_user');
        let config = db.getEmojiRainConfig();
        expect(config.emoji_set).toEqual(["🌈", "☀️", "🌙"]);
        expect(config.obs_hud_width).toBe(1280);
        expect(config.target_fps).toBe(90);
        
        // Second update (modify some values)
        userConfig = {
            ...config,
            emoji_set: ["🎭", "🎪", "🎡"],
            wind_strength: 85
        };
        db.updateEmojiRainConfig(userConfig, true);
        
        // Second restart
        db.close();
        db = new Database(testDbPath, 'test_user');
        config = db.getEmojiRainConfig();
        expect(config.emoji_set).toEqual(["🎭", "🎪", "🎡"]);
        expect(config.obs_hud_width).toBe(1280); // Should still be there
        expect(config.wind_strength).toBe(85);
        expect(config.target_fps).toBe(90); // Should still be there
        
        // Third restart (no changes)
        db.close();
        db = new Database(testDbPath, 'test_user');
        config = db.getEmojiRainConfig();
        expect(config.emoji_set).toEqual(["🎭", "🎪", "🎡"]);
        expect(config.obs_hud_width).toBe(1280);
        expect(config.wind_strength).toBe(85);
        expect(config.target_fps).toBe(90);
    });

    test('should add new default fields without overwriting existing user settings', () => {
        // Simulate an older config (missing some newer fields)
        const oldStyleConfig = {
            emoji_set: ["🎵", "🎶", "🎼"],
            obs_hud_width: 1920,
            obs_hud_height: 1080,
            enable_glow: false,
            wind_enabled: true
        };
        
        db.updateEmojiRainConfig(oldStyleConfig, true);
        
        // Close and reopen (this will trigger initializeEmojiRainDefaults)
        db.close();
        db = new Database(testDbPath, 'test_user');
        
        // Get config - should have old values preserved and new defaults added
        const config = db.getEmojiRainConfig();
        
        // Old user settings should be preserved
        expect(config.emoji_set).toEqual(["🎵", "🎶", "🎼"]);
        expect(config.obs_hud_width).toBe(1920);
        expect(config.obs_hud_height).toBe(1080);
        expect(config.enable_glow).toBe(false);
        expect(config.wind_enabled).toBe(true);
        
        // New fields should be added with defaults
        expect(config.target_fps).toBeDefined();
        expect(config.enable_particles).toBeDefined();
        expect(config.enable_depth).toBeDefined();
    });

    test('should not reset ALL settings to defaults on restart', () => {
        // This is the critical test for the bug fix
        const RESTART_ITERATIONS = 5; // Number of restart cycles to test
        
        const customConfig = {
            emoji_set: ["💀", "👻", "🎃", "🦇", "🕷️"],
            obs_hud_width: 2560,
            obs_hud_height: 1440,
            enable_glow: false,
            enable_particles: false,
            target_fps: 144,
            wind_enabled: true,
            wind_strength: 100,
            emoji_min_size_px: 80,
            emoji_max_size_px: 200,
            rainbow_enabled: true,
            pixel_enabled: false
        };
        
        db.updateEmojiRainConfig(customConfig, false);
        
        // Multiple restarts
        for (let i = 0; i < RESTART_ITERATIONS; i++) {
            db.close();
            db = new Database(testDbPath, 'test_user');
            
            const config = db.getEmojiRainConfig();
            
            // NONE of these should be reset to defaults
            expect(config.emoji_set).toEqual(["💀", "👻", "🎃", "🦇", "🕷️"]);
            expect(config.obs_hud_width).toBe(2560);
            expect(config.obs_hud_height).toBe(1440);
            expect(config.enable_glow).toBe(false);
            expect(config.enable_particles).toBe(false);
            expect(config.target_fps).toBe(144);
            expect(config.wind_enabled).toBe(true);
            expect(config.wind_strength).toBe(100);
            expect(config.emoji_min_size_px).toBe(80);
            expect(config.emoji_max_size_px).toBe(200);
            expect(config.rainbow_enabled).toBe(true);
            expect(config.pixel_enabled).toBe(false);
            expect(config.enabled).toBe(false);
        }
    });

    test('should preserve toaster_mode setting', () => {
        const config = db.getEmojiRainConfig();
        const updatedConfig = {
            ...config,
            toaster_mode: true
        };
        
        db.updateEmojiRainConfig(updatedConfig, true);
        
        // Restart
        db.close();
        db = new Database(testDbPath, 'test_user');
        
        const reloadedConfig = db.getEmojiRainConfig();
        expect(reloadedConfig.toaster_mode).toBe(true);
    });

    test('should preserve SuperFan burst settings', () => {
        const config = db.getEmojiRainConfig();
        const updatedConfig = {
            ...config,
            superfan_burst_enabled: false,
            superfan_burst_intensity: 5.0,
            superfan_burst_duration: 5000
        };
        
        db.updateEmojiRainConfig(updatedConfig, true);
        
        // Restart
        db.close();
        db = new Database(testDbPath, 'test_user');
        
        const reloadedConfig = db.getEmojiRainConfig();
        expect(reloadedConfig.superfan_burst_enabled).toBe(false);
        expect(reloadedConfig.superfan_burst_intensity).toBe(5.0);
        expect(reloadedConfig.superfan_burst_duration).toBe(5000);
    });
});
