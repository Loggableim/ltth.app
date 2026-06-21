/**
 * Regression tests for dashboard-soundboard.js reliability improvements.
 *
 * These are static-analysis tests (read + pattern-match) because the
 * soundboard runs in a browser context and cannot be executed under Node/Jest.
 *
 * Covered behaviour:
 *  - onComplete is guarded against double-calls (completionFired / safeComplete)
 *  - A stall safety timeout exists to prevent queue from hanging on broken audio
 *  - cleanup() clears the stall timeout to prevent leaks after normal playback
 *  - Queue continuation (processGlobalQueue, processPerGiftQueue) still works
 *    after playback errors
 */

const fs = require('fs');
const path = require('path');

describe('dashboard-soundboard.js reliability', () => {
    let soundboardJs;

    beforeAll(() => {
        const filePath = path.join(__dirname, '../public/js/dashboard-soundboard.js');
        soundboardJs = fs.readFileSync(filePath, 'utf8');
    });

    // ── Single-fire completion guard ──────────────────────────────────────────

    describe('onComplete single-fire guard (safeComplete)', () => {
        test('completionFired flag is declared inside playSound', () => {
            // Extract the playSound function body
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            expect(fnMatch[0]).toContain('completionFired');
        });

        test('safeComplete wrapper is defined inside playSound', () => {
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            expect(fnMatch[0]).toContain('safeComplete');
        });

        test('safeComplete is called in play() catch handler instead of raw onComplete', () => {
            // The catch block must now call safeComplete(), not `if (onComplete) onComplete()`.
            // Verify the source file calls safeComplete() inside the .catch handler body.
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            const fn = fnMatch[0];
            // The catch block is between .catch( and the closing }) of the play chain.
            // Use a simple text search instead of a regex to avoid partial-match issues
            // with lazy quantifiers stopping at the first }) inside template literals.
            const catchIdx = fn.indexOf('.catch(');
            expect(catchIdx).toBeGreaterThan(-1);
            // Find the matching }) for the .catch( by scanning for safeComplete before it
            const afterCatch = fn.slice(catchIdx);
            expect(afterCatch).toContain('safeComplete()');
        });

        test('safeComplete is called in onended handler', () => {
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            const fn = fnMatch[0];
            const onendedMatch = fn.match(/audio\.onended\s*=[\s\S]*?\};/);
            expect(onendedMatch).toBeTruthy();
            expect(onendedMatch[0]).toContain('safeComplete()');
        });

        test('safeComplete is called in onerror handler', () => {
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            const fn = fnMatch[0];
            const onerrorMatch = fn.match(/audio\.onerror\s*=[\s\S]*?\};/);
            expect(onerrorMatch).toBeTruthy();
            expect(onerrorMatch[0]).toContain('safeComplete()');
        });
    });

    // ── Stall safety timeout ──────────────────────────────────────────────────

    describe('Playback stall safety timeout', () => {
        test('PLAY_STALL_TIMEOUT_MS constant is defined', () => {
            expect(soundboardJs).toContain('PLAY_STALL_TIMEOUT_MS');
        });

        test('stallTimeoutId is declared inside playSound', () => {
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            expect(fnMatch[0]).toContain('stallTimeoutId');
        });

        test('stall timeout is started after successful play() resolution', () => {
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            const fn = fnMatch[0];
            // The .then() block is where playback was confirmed – startStallTimeout
            // must be called there. Use indexOf for reliable matching.
            const thenIdx = fn.indexOf('.then(');
            expect(thenIdx).toBeGreaterThan(-1);
            const afterThen = fn.slice(thenIdx);
            expect(afterThen).toContain('startStallTimeout');
        });

        test('cleanup clears the stall timeout', () => {
            const fnMatch = soundboardJs.match(/function playSound\([\s\S]*?^}/m);
            expect(fnMatch).toBeTruthy();
            const fn = fnMatch[0];
            const cleanupMatch = fn.match(/const cleanup\s*=[\s\S]*?\n\s{4}\};/);
            expect(cleanupMatch).toBeTruthy();
            expect(cleanupMatch[0]).toContain('clearTimeout');
            expect(cleanupMatch[0]).toContain('stallTimeoutId');
        });

        test('stall timeout calls safeComplete to advance the queue', () => {
            expect(soundboardJs).toContain('startStallTimeout');
            // The startStallTimeout inner setTimeout must call safeComplete
            const startFnMatch = soundboardJs.match(/const startStallTimeout\s*=[\s\S]*?\n\s{4}\};/);
            expect(startFnMatch).toBeTruthy();
            expect(startFnMatch[0]).toContain('safeComplete()');
        });
    });

    // ── Queue continuation after failure ─────────────────────────────────────

    describe('Queue continues after playback error', () => {
        test('processGlobalQueue calls playSound with a callback', () => {
            expect(soundboardJs).toContain('processGlobalQueue');
            // playSound called with a callback that re-invokes processGlobalQueue
            expect(soundboardJs).toMatch(/playSound\(data,\s*\(\)\s*=>/);
        });

        test('processPerGiftQueue calls playSound with a callback', () => {
            expect(soundboardJs).toContain('processPerGiftQueue');
            expect(soundboardJs).toMatch(/playSound\(data,\s*\(\)\s*=>/);
        });

        test('isProcessingGlobalQueue is reset when queue is empty', () => {
            expect(soundboardJs).toContain('isProcessingGlobalQueue = false');
        });

        test('perGiftQueue isProcessing is reset when queue is empty', () => {
            expect(soundboardJs).toContain('queueData.isProcessing = false');
        });
    });
});
