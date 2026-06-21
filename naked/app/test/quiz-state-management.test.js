/**
 * Test for Quiz Show State Management Fixes
 * 
 * Tests the fixes for:
 * 1. "Quiz already running" error after quiz ends
 * 2. Last question visibility after auto mode ends without restart
 */

const fs = require('fs');
const path = require('path');

describe('Quiz Show Plugin - State Management', () => {
    let mainCode;

    beforeAll(() => {
        // Read the main plugin file
        const mainPath = path.join(__dirname, '../plugins/quiz-show/main.js');
        mainCode = fs.readFileSync(mainPath, 'utf8');
    });

    test('quiz-show:start handler should check for ended rounds', () => {
        // Find the quiz-show:start handler
        const startHandlerMatch = mainCode.match(/this\.api\.registerSocket\('quiz-show:start'[\s\S]*?\}\);/);
        
        expect(startHandlerMatch).toBeTruthy();
        
        const handlerCode = startHandlerMatch[0];
        
        // Check that it handles the case where isRunning is true but roundState is 'ended'
        expect(handlerCode).toContain("roundState === 'ended'");
        expect(handlerCode).toContain('this.resetGameState()');
    });

    test('quiz-show:start handler should prevent starting when actively running', () => {
        // Find the quiz-show:start handler
        const startHandlerMatch = mainCode.match(/this\.api\.registerSocket\('quiz-show:start'[\s\S]*?\}\);/);
        
        expect(startHandlerMatch).toBeTruthy();
        
        const handlerCode = startHandlerMatch[0];
        
        // Check that it still prevents starting when quiz is actively running
        expect(handlerCode).toContain('Quiz already running');
    });

    test('endRound should reset state when auto mode ends without restart', () => {
        // Find the endRound function
        const endRoundMatch = mainCode.match(/async endRound\([^)]*\)[\s\S]*?^    \}/m);
        
        expect(endRoundMatch).toBeTruthy();
        
        const endRoundCode = endRoundMatch[0];
        
        // Check for resetGameState call in the no-auto-restart path
        expect(endRoundCode).toContain('this.resetGameState()');
        
        // Check that quiz-show:stopped is emitted to hide overlay
        expect(endRoundCode).toContain("this.api.emit('quiz-show:stopped'");
    });

    test('endRound should handle auto-restart correctly', () => {
        // Find the endRound function
        const endRoundMatch = mainCode.match(/async endRound\([^)]*\)[\s\S]*?^    \}/m);
        
        expect(endRoundMatch).toBeTruthy();
        
        const endRoundCode = endRoundMatch[0];
        
        // Check that auto mode with restart starts a new round
        expect(endRoundCode).toContain('this.startRound()');
        expect(endRoundCode).toContain('autoRestartRound');
    });

    test('resetGameState should set isRunning to false', () => {
        // Find the resetGameState function
        const resetStateMatch = mainCode.match(/resetGameState\(\)[\s\S]*?isRunning: false/);
        
        expect(resetStateMatch).toBeTruthy();
    });

    test('resetGameState should clear auto mode timeout', () => {
        // Find the resetGameState function by looking for the function definition
        // and the first occurrence of setting isRunning: false
        const resetStateFunctionMatch = mainCode.match(/resetGameState\(\)\s*\{[\s\S]*?isRunning:\s*false[\s\S]*?askedQuestionIds:\s*new Set\(\)/);
        
        expect(resetStateFunctionMatch).toBeTruthy();
        
        const resetCode = resetStateFunctionMatch[0];
        
        // Check that autoModeTimeout is cleared
        expect(resetCode).toContain('clearTimeout(this.autoModeTimeout)');
        expect(resetCode).toContain('this.autoModeTimeout = null');
    });

    test('auto-restart should reset game state before starting new session', () => {
        // Find the endRound function
        const endRoundMatch = mainCode.match(/async endRound\([^)]*\)[\s\S]*?^    \}/m);
        
        expect(endRoundMatch).toBeTruthy();
        
        const endRoundCode = endRoundMatch[0];
        
        // Find the specific auto-restart section (after totalRoundsReached check)
        const autoRestartSectionMatch = endRoundCode.match(
            /if \(this\.config\.autoMode && this\.config\.autoRestartRound !== false\)[\s\S]*?setTimeout\([\s\S]*?\}, autoDelay\);/
        );
        
        expect(autoRestartSectionMatch).toBeTruthy();
        
        const autoRestartSection = autoRestartSectionMatch[0];
        
        // Verify that resetGameState is called BEFORE startRound in auto-restart scenario
        expect(autoRestartSection).toContain('this.resetGameState()');
        expect(autoRestartSection).toContain('this.startRound()');
        
        // Verify the order: resetGameState should come before startRound
        const resetIndex = autoRestartSection.indexOf('this.resetGameState()');
        const startIndex = autoRestartSection.indexOf('this.startRound()');
        
        expect(resetIndex).toBeGreaterThan(-1);
        expect(startIndex).toBeGreaterThan(-1);
        expect(resetIndex).toBeLessThan(startIndex);
        
        // Verify there's a comment explaining why we reset
        expect(autoRestartSection).toContain('clears askedQuestionIds');
    });

    test('quiz-show:stop shows leaderboard before resetting state', () => {
        const stopIndex = mainCode.indexOf("this.api.registerSocket('quiz-show:stop'");
        expect(stopIndex).toBeGreaterThan(-1);

        const handlerCode = mainCode.slice(stopIndex, stopIndex + 2000);
        const leaderboardIndex = handlerCode.indexOf('await this.showLeaderboardAtEnd');
        const resetIndex = handlerCode.indexOf('this.resetGameState');

        expect(leaderboardIndex).toBeGreaterThan(-1);
        expect(resetIndex).toBeGreaterThan(-1);
        expect(leaderboardIndex).toBeLessThan(resetIndex);
    });

    test('quiz-show:next suppresses TTS when skipping and stops active playback', () => {
        const nextIndex = mainCode.indexOf("this.api.registerSocket('quiz-show:next'");
        expect(nextIndex).toBeGreaterThan(-1);

        const handlerCode = mainCode.slice(nextIndex, nextIndex + 1200);
        expect(handlerCode).toContain('suppressTTS: true');
        const stopTTSIndex = mainCode.indexOf('stopActiveTTS', nextIndex);
        expect(stopTTSIndex).toBeGreaterThan(-1);
    });

    test('resetGameState should clear end game timeouts', () => {
        const resetStateFunctionMatch = mainCode.match(/resetGameState\(\)\s*\{[\s\S]*?askedQuestionIds:\s*new Set\(\)[\s\S]*?\}/);

        expect(resetStateFunctionMatch).toBeTruthy();

        const resetCode = resetStateFunctionMatch[0];

        expect(resetCode).toContain('clearEndGameTimeouts');
    });

    test('clearEndGameTimeouts should clear tracked leaderboard timers', () => {
        const clearTimeoutsMatch = mainCode.match(/clearEndGameTimeouts\(\)\s*\{[\s\S]*?endGameAutoRestartTimeout[\s\S]*?\}/);

        expect(clearTimeoutsMatch).toBeTruthy();

        const clearCode = clearTimeoutsMatch[0];

        expect(clearCode).toContain('matchLeaderboardTimeout');
        expect(clearCode).toContain('seasonLeaderboardTimeout');
        expect(clearCode).toContain('endGameTimeout');
        expect(clearCode).toContain('endGameAutoRestartTimeout');
    });

    test('startRound resets when total round limit already reached', () => {
        const startIndex = mainCode.indexOf('async startRound()');
        expect(startIndex).toBeGreaterThan(-1);

        const nextFunctionIndex = mainCode.indexOf('async getNextQuestion', startIndex);
        const START_ROUND_FALLBACK_LENGTH = 2000; // generous buffer to cover the full function body if next function is not found
        const endIndex = nextFunctionIndex > -1 ? nextFunctionIndex : startIndex + START_ROUND_FALLBACK_LENGTH;

        const startRoundCode = mainCode.slice(startIndex, endIndex);
        expect(startRoundCode).toContain('this.config.totalRounds > 0');
        expect(startRoundCode).toContain('this.gameState.currentRound >= this.config.totalRounds');
        expect(startRoundCode).toContain('this.resetGameState');
    });

    test('quiz-show:stop should clear timer interval', () => {
        const stopIndex = mainCode.indexOf("this.api.registerSocket('quiz-show:stop'");
        expect(stopIndex).toBeGreaterThan(-1);

        const handlerCode = mainCode.slice(stopIndex, stopIndex + 2000);
        
        // Verify timer interval is cleared before resetting state
        expect(handlerCode).toContain('clearInterval(this.timerInterval)');
        expect(handlerCode).toContain('this.timerInterval = null');
        
        // Verify it happens before resetGameState
        const timerClearIndex = handlerCode.indexOf('clearInterval(this.timerInterval)');
        const resetStateIndex = handlerCode.indexOf('this.resetGameState()');
        
        expect(timerClearIndex).toBeGreaterThan(-1);
        expect(resetStateIndex).toBeGreaterThan(-1);
        expect(timerClearIndex).toBeLessThan(resetStateIndex);
    });

    test('resetGameState should clear timer interval', () => {
        const resetStateFunctionMatch = mainCode.match(/resetGameState\(\)\s*\{[\s\S]*?askedQuestionIds:\s*new Set\(\)[\s\S]*?\}/);

        expect(resetStateFunctionMatch).toBeTruthy();

        const resetCode = resetStateFunctionMatch[0];

        // Verify timer interval is cleared
        expect(resetCode).toContain('clearInterval(this.timerInterval)');
        expect(resetCode).toContain('this.timerInterval = null');
    });
});
