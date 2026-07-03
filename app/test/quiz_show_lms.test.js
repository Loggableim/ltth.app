const fs = require('fs');
const path = require('path');

// Import the QuizShow plugin class
const QuizShow = require('../plugins/quiz-show/main');

// Helper to create a minimal plugin instance
function createPlugin(configOverrides = {}) {
    const config = {
        lastManStandingEnabled: true,
        lastManStandingJoinTime: 1, // 1 second for test
        lastManStandingInitialTime: 10,
        lastManStandingMinTime: 5,
        lastManStandingDecrement: 1,
        lastManStandingDecrementFromRound: 2,
        ...configOverrides
    };
    const plugin = new QuizShow();
    plugin.config = config;
    // Mock api with minimal emit/log
    plugin.api = {
        emit: jest.fn(),
        log: jest.fn()
    };
    // Mock db
    plugin.db = {
        prepare: () => ({
            all: () => [],
            get: () => ({})
        })
    };
    // Mock gameState
    plugin.gameState = {
        currentRound: 0,
        lastManStanding: {
            active: false,
            joinPhase: false,
            survivors: new Set(),
            eliminated: new Set(),
            joinEndTime: null,
            currentRoundTime: null
        }
    };
    return plugin;
}

describe('Last Man Standing (LMS) logic', () => {
    test('join phase starts and ends correctly', async () => {
        const plugin = createPlugin();
        plugin.startLMSJoinPhase();
        expect(plugin.gameState.lastManStanding.active).toBe(true);
        expect(plugin.gameState.lastManStanding.joinPhase).toBe(true);
        expect(plugin.api.emit).toHaveBeenCalledWith('quiz-show:lms-join-phase-started', expect.any(Object));
        // Wait for join phase timeout
        await new Promise(r => setTimeout(r, 1100));
        expect(plugin.gameState.lastManStanding.joinPhase).toBe(false);
        expect(plugin.api.emit).toHaveBeenCalledWith('quiz-show:lms-join-phase-ended', expect.any(Object));
    });

    test('auto join on first round answer', () => {
        const plugin = createPlugin();
        plugin.gameState.lastManStanding.active = true;
        plugin.autoJoinLMS('u1', 'Alice', null);
        expect(plugin.gameState.lastManStanding.survivors.has('u1')).toBe(true);
    });

    test('timer decrement logic', () => {
        const plugin = createPlugin({ lastManStandingInitialTime: 20, lastManStandingDecrement: 2, lastManStandingDecrementFromRound: 3 });
        plugin.gameState.currentRound = 0;
        expect(plugin.getLMSTimerDuration()).toBe(20);
        plugin.gameState.currentRound = 2; // round 3
        expect(plugin.getLMSTimerDuration()).toBe(18);
        plugin.gameState.currentRound = 10; // round 11
        expect(plugin.getLMSTimerDuration()).toBe(10); // min time
    });

    test('eliminate player and trigger winner', () => {
        const plugin = createPlugin();
        plugin.gameState.lastManStanding.active = true;
        plugin.gameState.lastManStanding.survivors.add('u1');
        plugin.gameState.lastManStanding.survivors.add('u2');
        plugin.eliminateLMSPlayer('u1', 'wrong answer');
        expect(plugin.gameState.lastManStanding.survivors.has('u1')).toBe(false);
        expect(plugin.gameState.lastManStanding.eliminated.has('u1')).toBe(true);
        expect(plugin.api.emit).toHaveBeenCalledWith('quiz-show:lms-eliminated', expect.objectContaining({ userId: 'u1', survivors: 1 }));
        // Now only one survivor -> winner
        expect(plugin.api.emit).toHaveBeenCalledWith('quiz-show:lms-winner', expect.objectContaining({ userId: 'u2' }));
    });
});
