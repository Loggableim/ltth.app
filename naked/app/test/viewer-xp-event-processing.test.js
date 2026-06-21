/**
 * Test for Viewer XP System Event Processing
 * 
 * This test verifies that the XP system correctly processes TikTok events
 * and integrates with the shared currency system (user_statistics).
 */

const path = require('path');
const fs = require('fs');
const DatabaseManager = require('../modules/database');
const EventEmitter = require('events');

describe('Viewer XP System - Event Processing', () => {
    let db;
    let viewerXPPlugin;
    let mockAPI;
    let mockIO;
    let mockTikTok;
    let testDbPath;

    beforeEach(async () => {
        // Create temporary test database
        testDbPath = path.join(__dirname, 'test-viewer-xp.db');
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }

        db = new DatabaseManager(testDbPath, 'test-streamer');
        
        // Mock Socket.IO
        mockIO = new EventEmitter();
        mockIO.emit = jest.fn();

        // Mock TikTok connector
        mockTikTok = new EventEmitter();

        // Create mock PluginAPI
        mockAPI = {
            log: jest.fn(),
            getDatabase: () => db,
            getSocketIO: () => mockIO,
            registerRoute: jest.fn(),
            registerTikTokEvent: (event, callback) => {
                mockTikTok.on(event, callback);
                return true;
            },
            registerSocket: jest.fn(),
            emit: jest.fn(),
            pluginLoader: {
                loadedPlugins: new Map()
            }
        };

        // Load viewer-xp plugin
        const ViewerXPPlugin = require('../plugins/viewer-leaderboard/viewer-xp-impl');
        viewerXPPlugin = new ViewerXPPlugin(mockAPI);
        await viewerXPPlugin.init();
    });

    afterEach(async () => {
        if (viewerXPPlugin && typeof viewerXPPlugin.destroy === 'function') {
            await viewerXPPlugin.destroy();
        }
        
        if (db && db.db) {
            db.db.close();
        }

        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    test('should process chat event and award XP', async () => {
        const chatEvent = {
            username: 'testuser',
            uniqueId: 'testuser',
            userId: 'user123',
            nickname: 'Test User',
            comment: 'Hello world!',
            profilePictureUrl: 'https://example.com/pic.jpg',
            teamMemberLevel: 0,
            isModerator: false,
            isSubscriber: false
        };

        // Emit chat event
        mockTikTok.emit('chat', chatEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile was created and XP awarded
        const profile = viewerXPPlugin.db.getViewerProfile('testuser');
        expect(profile).toBeTruthy();
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        
        // Check shared user statistics were updated
        const userStats = db.getUserStatistics('user123', 'test-streamer');
        expect(userStats).toBeTruthy();
        expect(userStats.total_comments).toBe(1);
    });

    test('should process gift event and award XP based on coin value', async () => {
        const giftEvent = {
            username: 'giftgiver',
            uniqueId: 'giftgiver',
            userId: 'user456',
            nickname: 'Gift Giver',
            giftName: 'Rose',
            giftId: '5655',
            diamondCount: 1,
            repeatCount: 10,
            coins: 10, // 1 diamond * 10 repeats
            profilePictureUrl: 'https://example.com/pic2.jpg',
            teamMemberLevel: 0
        };

        // Emit gift event
        mockTikTok.emit('gift', giftEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile and XP
        const profile = viewerXPPlugin.db.getViewerProfile('giftgiver');
        expect(profile).toBeTruthy();
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        
        // Check shared user statistics - coins should be tracked
        const userStats = db.getUserStatistics('user456', 'test-streamer');
        expect(userStats).toBeTruthy();
        expect(userStats.total_coins_sent).toBe(10);
        expect(userStats.total_gifts_sent).toBe(1);
    });

    test('should process large gift and award tier 3 XP', async () => {
        const largeGiftEvent = {
            username: 'bigspender',
            uniqueId: 'bigspender',
            userId: 'user789',
            nickname: 'Big Spender',
            giftName: 'Galaxy',
            giftId: '9999',
            diamondCount: 1000,
            repeatCount: 2,
            coins: 2000, // 1000 diamonds * 2 repeats = tier 3
            profilePictureUrl: 'https://example.com/pic3.jpg'
        };

        // Emit gift event
        mockTikTok.emit('gift', largeGiftEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile
        const profile = viewerXPPlugin.db.getViewerProfile('bigspender');
        expect(profile).toBeTruthy();
        
        // Tier 3 gifts should award more XP than tier 1
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        
        // Check shared currency
        const userStats = db.getUserStatistics('user789', 'test-streamer');
        expect(userStats.total_coins_sent).toBe(2000);
    });

    test('should process follow event and award XP', async () => {
        const followEvent = {
            username: 'newfollower',
            uniqueId: 'newfollower',
            userId: 'user111',
            nickname: 'New Follower',
            profilePictureUrl: 'https://example.com/pic4.jpg'
        };

        // Emit follow event
        mockTikTok.emit('follow', followEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile
        const profile = viewerXPPlugin.db.getViewerProfile('newfollower');
        expect(profile).toBeTruthy();
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        
        // Check shared statistics
        const userStats = db.getUserStatistics('user111', 'test-streamer');
        expect(userStats).toBeTruthy();
        expect(userStats.total_follows).toBe(1);
    });

    test('should process share event and award XP', async () => {
        const shareEvent = {
            username: 'sharer',
            uniqueId: 'sharer',
            userId: 'user222',
            nickname: 'Sharer',
            profilePictureUrl: 'https://example.com/pic5.jpg'
        };

        // Emit share event
        mockTikTok.emit('share', shareEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile
        const profile = viewerXPPlugin.db.getViewerProfile('sharer');
        expect(profile).toBeTruthy();
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        
        // Check shared statistics
        const userStats = db.getUserStatistics('user222', 'test-streamer');
        expect(userStats).toBeTruthy();
        expect(userStats.total_shares).toBe(1);
    });

    test('should process like event and award XP', async () => {
        const likeEvent = {
            username: 'liker',
            uniqueId: 'liker',
            userId: 'user333',
            nickname: 'Liker',
            likeCount: 5,
            profilePictureUrl: 'https://example.com/pic6.jpg'
        };

        // Emit like event
        mockTikTok.emit('like', likeEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile
        const profile = viewerXPPlugin.db.getViewerProfile('liker');
        expect(profile).toBeTruthy();
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        
        // Check shared statistics
        const userStats = db.getUserStatistics('user333', 'test-streamer');
        expect(userStats).toBeTruthy();
        expect(userStats.total_likes).toBe(1);
    });

    test('should process join event and handle daily bonus', async () => {
        const joinEvent = {
            username: 'dailyuser',
            uniqueId: 'dailyuser',
            userId: 'user444',
            nickname: 'Daily User',
            profilePictureUrl: 'https://example.com/pic7.jpg'
        };

        // Emit join event
        mockTikTok.emit('join', joinEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check viewer profile
        const profile = viewerXPPlugin.db.getViewerProfile('dailyuser');
        expect(profile).toBeTruthy();
        
        // Should have XP from daily bonus
        expect(profile.total_xp_earned).toBeGreaterThan(0);
        expect(profile.last_daily_bonus).toBeTruthy();
    });

    test('should integrate XP points with shared currency system', async () => {
        const userId = 'integration_test_user';
        const username = 'integrationuser';

        // Send multiple events
        mockTikTok.emit('chat', {
            username,
            uniqueId: username,
            userId,
            comment: 'Test message',
            nickname: 'Integration User'
        });

        mockTikTok.emit('gift', {
            username,
            uniqueId: username,
            userId,
            giftName: 'Rose',
            coins: 50,
            nickname: 'Integration User'
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check XP system
        const xpProfile = viewerXPPlugin.db.getViewerProfile(username);
        expect(xpProfile).toBeTruthy();
        expect(xpProfile.total_xp_earned).toBeGreaterThan(0);

        // Check shared currency system
        const userStats = db.getUserStatistics(userId, 'test-streamer');
        expect(userStats).toBeTruthy();
        expect(userStats.total_comments).toBe(1);
        expect(userStats.total_coins_sent).toBe(50);
        expect(userStats.total_gifts_sent).toBe(1);
    });

    test('should emit IFTTT events when XP is gained', async () => {
        // Mock IFTTT engine
        const mockIFTTTEngine = {
            processEvent: jest.fn().mockResolvedValue({ success: true })
        };
        mockAPI.pluginLoader.iftttEngine = mockIFTTTEngine;

        const chatEvent = {
            username: 'iftttuser',
            uniqueId: 'iftttuser',
            userId: 'user555',
            comment: 'IFTTT test',
            nickname: 'IFTTT User'
        };

        // Emit chat event
        mockTikTok.emit('chat', chatEvent);

        // Wait for async processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Check IFTTT event was emitted (viewer-xp:xp-gained)
        // Note: This is called through emitIFTTTEvent which checks if engine exists
        expect(mockIFTTTEngine.processEvent).toHaveBeenCalled();
    });
});
