/**
 * Tests for Stream Session Isolation
 * 
 * This test verifies that when connecting to different TikTok streams,
 * goals and leaderboard session stats are properly reset.
 */

const EventEmitter = require('events');
const Database = require('../modules/database');
const Leaderboard = require('../modules/leaderboard');
const { GoalManager } = require('../modules/goals');
const fs = require('fs');
const path = require('path');

const TEST_DB_PATH = '/tmp/test_stream_session_isolation.db';

// Mock TikTok connector
class MockTikTokConnector extends EventEmitter {
    constructor() {
        super();
        this.currentUsername = null;
        this.isConnected = false;
    }

    async connect(username) {
        const previousUsername = this.currentUsername;
        
        // Emit streamChanged event when connecting to different stream
        // (regardless of connection state - matches real TikTok connector behavior)
        if (previousUsername && previousUsername !== username) {
            this.emit('streamChanged', {
                previousUsername,
                newUsername: username,
                timestamp: new Date().toISOString()
            });
        }
        
        this.currentUsername = username;
        this.isConnected = true;
        
        this.emit('connected', {
            username,
            timestamp: new Date().toISOString()
        });
    }

    disconnect() {
        this.isConnected = false;
        this.emit('disconnected', {
            username: this.currentUsername,
            timestamp: new Date().toISOString()
        });
        // Note: Do NOT clear currentUsername on disconnect - it should be preserved
        // for reconnection detection (same stream vs different stream)
    }
}

// Mock Socket.IO
const mockIO = {
    emit: jest.fn(),
    to: jest.fn(() => mockIO)
};

describe('Stream Session Isolation', () => {
    let db;
    let leaderboard;
    let goals;
    let tiktok;

    beforeEach(() => {
        // Clean up test database
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        const walPath = `${TEST_DB_PATH}-wal`;
        const shmPath = `${TEST_DB_PATH}-shm`;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        // Create fresh database and modules for each test
        db = new Database(TEST_DB_PATH, 'testuser');
        leaderboard = new Leaderboard(db, mockIO, 'testuser');
        goals = new GoalManager(db, mockIO, { info: jest.fn(), error: jest.fn(), warn: jest.fn() });
        tiktok = new MockTikTokConnector();

        // Clear mock calls
        mockIO.emit.mockClear();
    });

    afterEach(() => {
        if (db) {
            db.close();
        }
    });

    describe('Goals - Stream Session Isolation', () => {
        test('should reset goals when connecting to a different stream', async () => {
            // Simulate connecting to first stream and accumulating goals
            await tiktok.connect('streamer1');
            await goals.incrementGoal('likes', 500);
            await goals.incrementGoal('coins', 1000);

            // Verify goals have data
            const statusBefore = goals.getStatus();
            expect(statusBefore.likes.total).toBe(500);
            expect(statusBefore.coins.total).toBe(1000);

            // Disconnect from first stream
            tiktok.disconnect();

            // Connect to different stream
            await tiktok.connect('streamer2');

            // Simulate the streamChanged event handler that resets goals
            await goals.resetAllGoals();

            // Verify goals are reset
            const statusAfter = goals.getStatus();
            expect(statusAfter.likes.total).toBe(0);
            expect(statusAfter.coins.total).toBe(0);
            expect(statusAfter.followers.total).toBe(0);
            expect(statusAfter.subs.total).toBe(0);
        });

        test('should keep goals when reconnecting to same stream', async () => {
            // Simulate connecting to stream and accumulating goals
            await tiktok.connect('streamer1');
            await goals.incrementGoal('likes', 300);
            await goals.incrementGoal('followers', 5);

            const statusBefore = goals.getStatus();
            expect(statusBefore.likes.total).toBe(300);
            expect(statusBefore.followers.total).toBe(5);

            // Disconnect and reconnect to SAME stream
            tiktok.disconnect();
            
            // When reconnecting to the same stream, no streamChanged event is emitted
            // So goals should NOT be reset
            await tiktok.connect('streamer1');

            // Verify goals are preserved (no reset happened)
            const statusAfter = goals.getStatus();
            expect(statusAfter.likes.total).toBe(300);
            expect(statusAfter.followers.total).toBe(5);
        });
    });

    describe('Leaderboard - Session Stats Isolation', () => {
        test('should reset session stats when connecting to different stream', async () => {
            // Connect to first stream
            await tiktok.connect('streamer1');
            
            // Add some activity
            leaderboard.updateStats('user1', 'gift', { coins: 100 });
            leaderboard.updateStats('user2', 'chat');
            leaderboard.updateStats('user2', 'chat');

            // Verify session stats
            const stats1 = leaderboard.getUserStats('user1');
            expect(stats1.session_coins).toBe(100);
            expect(stats1.total_coins).toBe(100);

            const stats2 = leaderboard.getUserStats('user2');
            expect(stats2.session_messages).toBe(2);
            expect(stats2.message_count).toBe(2);

            // Disconnect and connect to different stream
            tiktok.disconnect();
            await tiktok.connect('streamer2');

            // Simulate the streamChanged event handler that resets session stats
            leaderboard.resetSessionStats();

            // Verify session stats are reset but all-time stats remain
            const statsAfter1 = leaderboard.getUserStats('user1');
            expect(statsAfter1.session_coins).toBe(0);
            expect(statsAfter1.total_coins).toBe(100); // All-time stats preserved

            const statsAfter2 = leaderboard.getUserStats('user2');
            expect(statsAfter2.session_messages).toBe(0);
            expect(statsAfter2.message_count).toBe(2); // All-time stats preserved
        });

        test('should maintain separate all-time stats across stream sessions', async () => {
            // Session 1: streamer1
            await tiktok.connect('streamer1');
            leaderboard.updateStats('viewer1', 'gift', { coins: 200 });
            
            const session1Stats = leaderboard.getUserStats('viewer1');
            expect(session1Stats.total_coins).toBe(200);
            expect(session1Stats.session_coins).toBe(200);

            // Switch to streamer2
            tiktok.disconnect();
            await tiktok.connect('streamer2');
            leaderboard.resetSessionStats();

            // Verify session reset but all-time preserved
            const afterSwitchStats = leaderboard.getUserStats('viewer1');
            expect(afterSwitchStats.total_coins).toBe(200);
            expect(afterSwitchStats.session_coins).toBe(0);

            // Session 2: more activity
            leaderboard.updateStats('viewer1', 'gift', { coins: 150 });

            const session2Stats = leaderboard.getUserStats('viewer1');
            expect(session2Stats.total_coins).toBe(350); // All-time accumulated
            expect(session2Stats.session_coins).toBe(150); // New session only
        });
    });

    describe('TikTok Connector - streamChanged Event', () => {
        test('should emit streamChanged event when switching streams', async () => {
            const streamChangedHandler = jest.fn();
            tiktok.on('streamChanged', streamChangedHandler);

            // Connect to first stream
            await tiktok.connect('alice');
            expect(streamChangedHandler).not.toHaveBeenCalled();

            // Switch to different stream
            await tiktok.connect('bob');
            expect(streamChangedHandler).toHaveBeenCalledWith({
                previousUsername: 'alice',
                newUsername: 'bob',
                timestamp: expect.any(String)
            });
        });

        test('should NOT emit streamChanged when reconnecting to same stream', async () => {
            const streamChangedHandler = jest.fn();
            tiktok.on('streamChanged', streamChangedHandler);

            // Connect to stream
            await tiktok.connect('alice');
            tiktok.disconnect();

            // Reconnect to same stream
            await tiktok.connect('alice');
            
            // streamChanged should not be emitted since it's the same stream
            expect(streamChangedHandler).not.toHaveBeenCalled();
        });

        test('should emit streamChanged on first connection after disconnect from different stream', async () => {
            const streamChangedHandler = jest.fn();
            tiktok.on('streamChanged', streamChangedHandler);

            await tiktok.connect('streamer_a');
            tiktok.disconnect();
            await tiktok.connect('streamer_b');

            expect(streamChangedHandler).toHaveBeenCalledTimes(1);
            expect(streamChangedHandler).toHaveBeenCalledWith({
                previousUsername: 'streamer_a',
                newUsername: 'streamer_b',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Integration - Full Stream Switching Flow', () => {
        test('should properly isolate session data across multiple stream switches', async () => {
            // Stream 1: Alice
            await tiktok.connect('alice');
            await goals.incrementGoal('likes', 1000);
            leaderboard.updateStats('fan1', 'gift', { coins: 500 });

            expect(goals.getStatus().likes.total).toBe(1000);
            expect(leaderboard.getUserStats('fan1').session_coins).toBe(500);

            // Switch to Bob
            tiktok.disconnect();
            await tiktok.connect('bob');
            await goals.resetAllGoals();
            leaderboard.resetSessionStats();

            // Session stats should be reset
            expect(goals.getStatus().likes.total).toBe(0);
            expect(leaderboard.getUserStats('fan1').session_coins).toBe(0);
            
            // All-time stats should be preserved
            expect(leaderboard.getUserStats('fan1').total_coins).toBe(500);

            // Add new activity in Bob's stream
            await goals.incrementGoal('likes', 2000);
            leaderboard.updateStats('fan2', 'gift', { coins: 800 });

            expect(goals.getStatus().likes.total).toBe(2000);
            expect(leaderboard.getUserStats('fan2').session_coins).toBe(800);

            // Switch back to Alice
            tiktok.disconnect();
            await tiktok.connect('alice');
            await goals.resetAllGoals();
            leaderboard.resetSessionStats();

            // Goals should be reset again
            expect(goals.getStatus().likes.total).toBe(0);
            
            // Session stats reset, all-time preserved
            expect(leaderboard.getUserStats('fan1').session_coins).toBe(0);
            expect(leaderboard.getUserStats('fan1').total_coins).toBe(500);
            expect(leaderboard.getUserStats('fan2').total_coins).toBe(800);
        });
    });
});

module.exports = {};
