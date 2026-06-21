/**
 * Test for soundboard queue functionality
 * Verifies that sounds are queued correctly with three modes:
 * - overlap: Play immediately
 * - queue-all: Global sequential queue
 * - queue-per-gift: Per-gift queues (same gift types wait, different gifts play simultaneously)
 */

const fs = require('fs');
const path = require('path');

describe('Soundboard Queue Functionality', () => {
    let dashboardSoundboardJs;
    
    beforeAll(() => {
        // Read the dashboard-soundboard.js file
        const filePath = path.join(__dirname, '../public/js/dashboard-soundboard.js');
        dashboardSoundboardJs = fs.readFileSync(filePath, 'utf8');
    });
    
    describe('Queue Management Variables', () => {
        test('should have global queue management variables', () => {
            expect(dashboardSoundboardJs).toContain('let globalSoundQueue = []');
            expect(dashboardSoundboardJs).toContain('let isProcessingGlobalQueue = false');
            expect(dashboardSoundboardJs).toContain('let currentPlayMode');
        });
        
        test('should have per-gift queue management variables', () => {
            expect(dashboardSoundboardJs).toContain('let perGiftSoundQueues = {}');
        });
    });
    
    describe('Queue-All Mode (Global Sequential)', () => {
        test('should check for queue-all mode in playDashboardSoundboard', () => {
            expect(dashboardSoundboardJs).toContain("currentPlayMode === 'queue-all'");
            expect(dashboardSoundboardJs).toContain('globalSoundQueue.push(data)');
        });
        
        test('should have processGlobalQueue function for global queue processing', () => {
            expect(dashboardSoundboardJs).toContain('function processGlobalQueue()');
            expect(dashboardSoundboardJs).toContain('globalSoundQueue.shift()');
            expect(dashboardSoundboardJs).toContain('isProcessingGlobalQueue = true');
        });
    });
    
    describe('Queue-Per-Gift Mode (Per-Gift Queues)', () => {
        test('should check for queue-per-gift mode in playDashboardSoundboard', () => {
            expect(dashboardSoundboardJs).toContain("currentPlayMode === 'queue-per-gift'");
        });
        
        test('should have getQueueKey function to identify queue by gift/event type', () => {
            expect(dashboardSoundboardJs).toContain('function getQueueKey(data)');
            // Check for template literal usage (as raw string in source code)
            expect(dashboardSoundboardJs).toContain('`gift-${data.giftId}`');
            expect(dashboardSoundboardJs).toContain('`event-${data.eventType}`');
        });
        
        test('should handle URL-based queue keys with filename extraction', () => {
            expect(dashboardSoundboardJs).toContain('url-${filename}');
            expect(dashboardSoundboardJs).toContain("url.pathname.split('/').pop()");
        });
        
        test('should have processPerGiftQueue function for per-gift queue processing', () => {
            expect(dashboardSoundboardJs).toContain('function processPerGiftQueue(queueKey)');
            expect(dashboardSoundboardJs).toContain('queueData.queue.shift()');
            expect(dashboardSoundboardJs).toContain('queueData.isProcessing = true');
        });
    });
    
    describe('Common Queue Functionality', () => {
        test('should have separate playSound function with callback', () => {
            expect(dashboardSoundboardJs).toContain('function playSound(data, onComplete)');
            expect(dashboardSoundboardJs).toContain('if (onComplete) onComplete()');
        });
        
        test('should have clearAllQueues function', () => {
            expect(dashboardSoundboardJs).toContain('function clearAllQueues()');
            expect(dashboardSoundboardJs).toContain('globalSoundQueue = []');
            expect(dashboardSoundboardJs).toContain('isProcessingGlobalQueue = false');
            expect(dashboardSoundboardJs).toContain('perGiftSoundQueues = {}');
        });
        
        test('should update currentPlayMode when settings are loaded', () => {
            expect(dashboardSoundboardJs).toContain('currentPlayMode = playModeValue');
        });
        
        test('should update currentPlayMode when play mode selector changes', () => {
            expect(dashboardSoundboardJs).toContain("playModeSelector.addEventListener('change'");
            expect(dashboardSoundboardJs).toContain('currentPlayMode = this.value');
        });
        
        test('should clear all queues when switching modes', () => {
            expect(dashboardSoundboardJs).toContain('clearAllQueues()');
        });
        
        test('should play immediately in overlap mode', () => {
            // Check that overlap mode calls playSound directly
            expect(dashboardSoundboardJs).toContain('playSound(data)');
        });
        
        test('should log queue operations', () => {
            expect(dashboardSoundboardJs).toContain('Added to global queue');
            expect(dashboardSoundboardJs).toContain('Processing from global queue');
            expect(dashboardSoundboardJs).toContain('queue length');
        });
    });
    
    describe('Backwards Compatibility', () => {
        test('should handle migration from old sequential mode to queue-all', () => {
            expect(dashboardSoundboardJs).toContain("playModeValue === 'sequential'");
            expect(dashboardSoundboardJs).toContain("playModeValue = 'queue-all'");
        });
    });
});
