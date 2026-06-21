/**
 * Test for Viewer XP Profile Isolation
 * 
 * This test verifies that viewer XP data is properly isolated per streamer profile
 * and that data persists across application restarts/updates.
 */

const path = require('path');
const fs = require('fs');
const DatabaseManager = require('../modules/database');
const UserProfileManager = require('../modules/user-profiles');
const ConfigPathManager = require('../modules/config-path-manager');
const EventEmitter = require('events');

describe('Viewer XP System - Profile Isolation', () => {
    let testConfigDir;
    let configPathManager;
    let profileManager;
    let db1, db2;
    let viewerXPPlugin1, viewerXPPlugin2;
    let mockIO1, mockIO2;
    let mockTikTok1, mockTikTok2;

    beforeAll(() => {
        testConfigDir = path.join(__dirname, 'test-config-profiles');
    });

    afterAll(() => {
        if (fs.existsSync(testConfigDir)) {
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        }
    });

    beforeEach(async () => {
        if (fs.existsSync(testConfigDir)) {
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testConfigDir, { recursive: true });

        configPathManager = new ConfigPathManager();
        configPathManager.customConfigPath = testConfigDir;

        profileManager = new UserProfileManager(configPathManager);
        // Create two separate profiles
        if (!profileManager.profileExists('streamer1')) {
            profileManager.createProfile('streamer1');
        }
        if (!profileManager.profileExists('streamer2')) {
            profileManager.createProfile('streamer2');
        }

        // Initialize databases for both profiles
        const dbPath1 = profileManager.getProfilePath('streamer1');
        const dbPath2 = profileManager.getProfilePath('streamer2');

        db1 = new DatabaseManager(dbPath1, 'streamer1');
        db2 = new DatabaseManager(dbPath2, 'streamer2');

        // Create mock Socket.IO instances
        mockIO1 = new EventEmitter();
        mockIO1.emit = jest.fn();
        mockIO2 = new EventEmitter();
        mockIO2.emit = jest.fn();

        // Create mock TikTok connectors
        mockTikTok1 = new EventEmitter();
        mockTikTok2 = new EventEmitter();

        // Create mock PluginAPI for streamer1
        const mockAPI1 = {
            log: jest.fn(),
            getDatabase: () => db1,
            getSocketIO: () => mockIO1,
            registerRoute: jest.fn(),
            registerTikTokEvent: (event, callback) => {
                mockTikTok1.on(event, callback);
                return true;
            },
            registerSocket: jest.fn(),
            emit: jest.fn(),
            pluginLoader: {
                loadedPlugins: new Map()
            }
        };

        // Create mock PluginAPI for streamer2
        const mockAPI2 = {
            log: jest.fn(),
            getDatabase: () => db2,
            getSocketIO: () => mockIO2,
            registerRoute: jest.fn(),
            registerTikTokEvent: (event, callback) => {
                mockTikTok2.on(event, callback);
                return true;
            },
            registerSocket: jest.fn(),
            emit: jest.fn(),
            pluginLoader: {
                loadedPlugins: new Map()
            }
        };

        // Load viewer-xp plugin for both profiles
        const ViewerXPPlugin = require('../plugins/viewer-leaderboard/viewer-xp-impl');
        viewerXPPlugin1 = new ViewerXPPlugin(mockAPI1);
        viewerXPPlugin2 = new ViewerXPPlugin(mockAPI2);

        await viewerXPPlugin1.init();
        await viewerXPPlugin2.init();
    });

    afterEach(async () => {
        // Cleanup
        if (viewerXPPlugin1 && typeof viewerXPPlugin1.destroy === 'function') {
            await viewerXPPlugin1.destroy();
        }
        if (viewerXPPlugin2 && typeof viewerXPPlugin2.destroy === 'function') {
            await viewerXPPlugin2.destroy();
        }

        if (db1 && typeof db1.close === 'function') {
            db1.close();
        }
        if (db2 && typeof db2.close === 'function') {
            db2.close();
        }
    });

    test('should isolate viewer XP data between different streamer profiles', async () => {
        // Simulate chat event for streamer1
        const chatEvent1 = {
            username: 'viewer123',
            uniqueId: 'viewer123',
            userId: 'user123',
            nickname: 'Viewer 123',
            comment: 'Hello streamer1!'
        };
        mockTikTok1.emit('chat', chatEvent1);

        // Wait for batch processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify viewer exists in streamer1's database
        const viewer1InDb1 = db1.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get('viewer123');
        expect(viewer1InDb1).toBeDefined();
        expect(viewer1InDb1.xp).toBeGreaterThan(0);

        // Verify viewer does NOT exist in streamer2's database
        const viewer1InDb2 = db2.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get('viewer123');
        expect(viewer1InDb2).toBeUndefined();

        // Simulate chat event for streamer2 with the SAME viewer username
        const chatEvent2 = {
            username: 'viewer123',
            uniqueId: 'viewer123',
            userId: 'user123',
            nickname: 'Viewer 123',
            comment: 'Hello streamer2!'
        };
        mockTikTok2.emit('chat', chatEvent2);

        // Wait for batch processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify viewer now exists in streamer2's database with INDEPENDENT XP
        const viewer1InDb2After = db2.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get('viewer123');
        expect(viewer1InDb2After).toBeDefined();
        expect(viewer1InDb2After.xp).toBeGreaterThan(0);

        // Verify XP values are independent (could be same or different, but stored separately)
        const viewer1InDb1After = db1.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get('viewer123');
        
        // Both should have XP, but they're stored in different database files
        expect(viewer1InDb1After.xp).toBeGreaterThan(0);
        expect(viewer1InDb2After.xp).toBeGreaterThan(0);

        // Verify they're in different database files
        const dbPath1 = profileManager.getProfilePath('streamer1');
        const dbPath2 = profileManager.getProfilePath('streamer2');
        expect(dbPath1).not.toBe(dbPath2);
        expect(fs.existsSync(dbPath1)).toBe(true);
        expect(fs.existsSync(dbPath2)).toBe(true);
    });

    test('should persist viewer XP data across database reopens (simulating app restart)', async () => {
        // Add XP for a viewer
        const chatEvent = {
            username: 'persistentviewer',
            uniqueId: 'persistentviewer',
            userId: 'user456',
            nickname: 'Persistent Viewer',
            comment: 'Testing persistence!'
        };
        mockTikTok1.emit('chat', chatEvent);

        // Wait for batch processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get initial XP
        const viewerBefore = db1.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get('persistentviewer');
        expect(viewerBefore).toBeDefined();
        const initialXP = viewerBefore.xp;
        expect(initialXP).toBeGreaterThan(0);

        // Close the plugin and database (simulating app shutdown)
        await viewerXPPlugin1.destroy();
        db1.close();

        // Reopen the database (simulating app restart)
        const dbPath1 = profileManager.getProfilePath('streamer1');
        db1 = new DatabaseManager(dbPath1, 'streamer1');

        // Create new plugin instance
        const mockAPI1New = {
            log: jest.fn(),
            getDatabase: () => db1,
            getSocketIO: () => mockIO1,
            registerRoute: jest.fn(),
            registerTikTokEvent: (event, callback) => {
                mockTikTok1.on(event, callback);
                return true;
            },
            registerSocket: jest.fn(),
            emit: jest.fn(),
            pluginLoader: {
                loadedPlugins: new Map()
            }
        };

        const ViewerXPPlugin = require('../plugins/viewer-leaderboard/viewer-xp-impl');
        viewerXPPlugin1 = new ViewerXPPlugin(mockAPI1New);
        await viewerXPPlugin1.init();

        // Verify data persisted
        const viewerAfter = db1.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get('persistentviewer');
        expect(viewerAfter).toBeDefined();
        expect(viewerAfter.xp).toBe(initialXP);
        expect(viewerAfter.username).toBe('persistentviewer');
    });

    test('should use persistent storage location (user_configs directory)', () => {
        const dbPath1 = profileManager.getProfilePath('streamer1');
        const dbPath2 = profileManager.getProfilePath('streamer2');

        // Verify database files are in the user_configs directory
        const userConfigsDir = configPathManager.getUserConfigsDir();
        expect(dbPath1).toContain('user_configs');
        expect(dbPath2).toContain('user_configs');

        // Verify database files exist
        expect(fs.existsSync(dbPath1)).toBe(true);
        expect(fs.existsSync(dbPath2)).toBe(true);

        // Verify files are NOT in the application directory
        expect(dbPath1).not.toContain(path.join(__dirname, '..', 'plugins', 'viewer-xp'));
        expect(dbPath2).not.toContain(path.join(__dirname, '..', 'plugins', 'viewer-xp'));
    });

    test('should handle multiple viewers per profile with independent XP tracking', async () => {
        // Add multiple viewers to streamer1
        const viewers = ['alice', 'bob', 'charlie'];
        
        for (const username of viewers) {
            const chatEvent = {
                username,
                uniqueId: username,
                userId: `user_${username}`,
                nickname: username.charAt(0).toUpperCase() + username.slice(1),
                comment: 'Hello!'
            };
            mockTikTok1.emit('chat', chatEvent);
        }

        // Wait for batch processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify all viewers exist in streamer1's database
        for (const username of viewers) {
            const viewer = db1.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
            expect(viewer).toBeDefined();
            expect(viewer.xp).toBeGreaterThan(0);
        }

        // Verify viewers do NOT exist in streamer2's database
        for (const username of viewers) {
            const viewer = db2.db.prepare('SELECT * FROM viewer_profiles WHERE username = ?').get(username);
            expect(viewer).toBeUndefined();
        }

        // Get count of viewers in each database
        const count1 = db1.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles').get();
        const count2 = db2.db.prepare('SELECT COUNT(*) as count FROM viewer_profiles').get();

        expect(count1.count).toBe(3);
        expect(count2.count).toBe(0);
    });

    test('should maintain separate leaderboards for each profile', async () => {
        // Add viewers with different XP to streamer1
        const viewer1Event = {
            username: 'topviewer',
            uniqueId: 'topviewer',
            userId: 'user_top',
            nickname: 'Top Viewer',
            comment: 'Multiple messages!'
        };
        
        mockTikTok1.emit('chat', viewer1Event);
        viewerXPPlugin1.db.addXP('topviewer', 20, 'manual_award', { reason: 'leaderboard test' });

        // Add same viewer to streamer2 but with different activity
        const viewer2Event = {
            username: 'topviewer',
            uniqueId: 'topviewer',
            userId: 'user_top',
            nickname: 'Top Viewer',
            comment: 'Just one message!'
        };
        mockTikTok2.emit('chat', viewer2Event);

        // Wait for batch processing
        await new Promise(resolve => setTimeout(resolve, 150));

        // Get leaderboard from both profiles
        const leaderboard1 = db1.db.prepare('SELECT username, xp FROM viewer_profiles ORDER BY xp DESC LIMIT 10').all();
        const leaderboard2 = db2.db.prepare('SELECT username, xp FROM viewer_profiles ORDER BY xp DESC LIMIT 10').all();

        // Verify leaderboards are different
        expect(leaderboard1.length).toBeGreaterThan(0);
        expect(leaderboard2.length).toBeGreaterThan(0);

        // topviewer should have more XP in streamer1's database
        const topviewer1 = leaderboard1.find(v => v.username === 'topviewer');
        const topviewer2 = leaderboard2.find(v => v.username === 'topviewer');

        expect(topviewer1).toBeDefined();
        expect(topviewer2).toBeDefined();
        expect(topviewer1.xp).toBeGreaterThan(topviewer2.xp);
    });
});
