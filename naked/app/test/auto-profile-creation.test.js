/**
 * Tests for Automatic Profile Creation and Switching
 * 
 * This test verifies that when a user connects to a TikTok stream for the first time:
 * 1. A profile is automatically created for that streamer
 * 2. The profile is automatically switched to
 * 3. When reconnecting to the same streamer, the existing profile is used
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const UserProfileManager = require('../modules/user-profiles');
const ConfigPathManager = require('../modules/config-path-manager');

// Use temp directory for tests (cross-platform compatible)
const TEST_CONFIG_DIR = path.join(os.tmpdir(), 'test-auto-profile-creation');

describe('Automatic Profile Creation and Switching', () => {
    let profileManager;
    let configPathManager;

    beforeEach(() => {
        // Clean up test directory
        if (fs.existsSync(TEST_CONFIG_DIR)) {
            fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
        }
        fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });

        // Create mock config path manager
        configPathManager = {
            getUserConfigsDir: () => TEST_CONFIG_DIR,
            ensureDirectoriesExist: () => {},
            migrateFromAppDirectory: () => {}
        };

        profileManager = new UserProfileManager(configPathManager);
    });

    afterEach(() => {
        // Clean up
        if (fs.existsSync(TEST_CONFIG_DIR)) {
            fs.rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
        }
    });

    test('should create profile when connecting to new streamer', () => {
        const username = 'teststreamer1';
        
        // Initially no profile exists
        expect(profileManager.profileExists(username)).toBe(false);
        
        // Create profile (simulating what /api/connect does)
        profileManager.createProfile(username);
        
        // Profile should now exist
        expect(profileManager.profileExists(username)).toBe(true);
        
        // Verify profile file was created
        const profilePath = profileManager.getProfilePath(username);
        expect(fs.existsSync(profilePath)).toBe(true);
    });

    test('should switch to newly created profile', () => {
        const username = 'teststreamer2';
        
        // Create and switch to profile
        profileManager.createProfile(username);
        profileManager.setActiveProfile(username);
        
        // Active profile should be the new one
        expect(profileManager.getActiveProfile()).toBe(username);
    });

    test('should reuse existing profile when reconnecting', () => {
        const username = 'teststreamer3';
        
        // First connection: create profile
        profileManager.createProfile(username);
        profileManager.setActiveProfile(username);
        
        const profilePath = profileManager.getProfilePath(username);
        const firstStats = fs.statSync(profilePath);
        
        // Simulate reconnection (profile already exists)
        const existsBeforeReconnect = profileManager.profileExists(username);
        expect(existsBeforeReconnect).toBe(true);
        
        // Active profile should remain the same
        expect(profileManager.getActiveProfile()).toBe(username);
        
        // Profile file should not be recreated (same mtime)
        const secondStats = fs.statSync(profilePath);
        expect(secondStats.mtimeMs).toBe(firstStats.mtimeMs);
    });

    test('should handle switching between different streamers', () => {
        const streamer1 = 'streamer_one';
        const streamer2 = 'streamer_two';
        
        // Connect to first streamer
        profileManager.createProfile(streamer1);
        profileManager.setActiveProfile(streamer1);
        expect(profileManager.getActiveProfile()).toBe(streamer1);
        
        // Connect to second streamer (profile doesn't exist)
        expect(profileManager.profileExists(streamer2)).toBe(false);
        profileManager.createProfile(streamer2);
        profileManager.setActiveProfile(streamer2);
        
        // Active profile should have switched
        expect(profileManager.getActiveProfile()).toBe(streamer2);
        
        // Both profiles should exist
        expect(profileManager.profileExists(streamer1)).toBe(true);
        expect(profileManager.profileExists(streamer2)).toBe(true);
    });

    test('should list all created profiles', () => {
        const streamers = ['streamer_a', 'streamer_b', 'streamer_c'];
        
        // Create multiple profiles
        streamers.forEach(username => {
            profileManager.createProfile(username);
        });
        
        // List profiles
        const profiles = profileManager.listProfiles();
        
        // Should have all created profiles
        expect(profiles.length).toBe(3);
        
        const usernames = profiles.map(p => p.username).sort();
        expect(usernames).toEqual(streamers.sort());
    });

    test('should handle special characters in usernames', () => {
        const username = 'test_user-123';
        
        // Create profile with special characters (allowed: alphanumeric, _, -)
        profileManager.createProfile(username);
        
        // Should sanitize and create successfully
        expect(profileManager.profileExists(username)).toBe(true);
        
        const profilePath = profileManager.getProfilePath(username);
        expect(fs.existsSync(profilePath)).toBe(true);
    });

    test('should throw error when creating duplicate profile', () => {
        const username = 'duplicate_test';
        
        // Create profile
        profileManager.createProfile(username);
        
        // Attempting to create again should throw error
        expect(() => {
            profileManager.createProfile(username);
        }).toThrow('Profile "duplicate_test" already exists');
    });
});
