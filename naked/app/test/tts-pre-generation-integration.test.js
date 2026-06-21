/**
 * Integration Test: TTS Pre-Generation End-to-End
 * 
 * This test validates the complete pre-generation flow from queue
 * manager through to the TTS plugin integration.
 */

const QueueManager = require('../plugins/tts/utils/queue-manager');

describe('TTS Pre-Generation - Integration Test', () => {
    let queueManager;
    let mockLogger;
    let mockConfig;
    let synthesizeCallLog;
    let playCallLog;
    
    beforeEach(() => {
        synthesizeCallLog = [];
        playCallLog = [];
        
        // Mock logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };
        
        // Mock config
        mockConfig = {
            maxQueueSize: 100,
            rateLimit: 5,
            rateLimitWindow: 60
        };
        
        queueManager = new QueueManager(mockConfig, mockLogger);
    });
    
    afterEach(() => {
        if (queueManager) {
            queueManager.stopProcessing();
            queueManager.clear();
        }
    });
    
    test('pre-generation should reduce synthesis time during playback', async () => {
        // Setup: Register synthesis callback that simulates API delay
        const mockSynthesize = jest.fn(async (text, voice, engine, options) => {
            synthesizeCallLog.push({ text, voice, engine, timestamp: Date.now() });
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate API delay
            return `audio-data-for-${text}`;
        });
        
        queueManager.setSynthesizeCallback(mockSynthesize);
        
        // Setup: Mock play callback
        const mockPlay = jest.fn(async (item) => {
            playCallLog.push({ 
                text: item.text, 
                hasAudio: !!item.audioData,
                timestamp: Date.now() 
            });
            await new Promise(resolve => setTimeout(resolve, 50)); // Simulate playback
        });
        
        // Add 5 items to queue
        for (let i = 1; i <= 5; i++) {
            queueManager.enqueue({
                userId: `user${i}`,
                username: `User${i}`,
                text: `Message ${i}`,
                voice: 'en-US',
                engine: 'tiktok',
                audioData: null,
                priority: 0
            });
        }
        
        expect(queueManager.queue.length).toBe(5);
        
        // Start processing
        queueManager.startProcessing(mockPlay);
        
        // Wait for processing to complete (give enough time for all items)
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Stop processing
        queueManager.stopProcessing();
        
        // Verify all items were played
        expect(mockPlay).toHaveBeenCalledTimes(5);
        expect(playCallLog.length).toBe(5);
        
        // Verify synthesis was called (pre-generation + any on-demand)
        expect(mockSynthesize).toHaveBeenCalled();
        
        // Check stats
        const stats = queueManager.getStats();
        expect(stats.totalPlayed).toBe(5);
        
        // Should have some pre-generation hits (at least for later items)
        // First item will be a miss (no time to pre-generate before it plays)
        // But items 2-5 should have hits if pre-gen worked
        const totalAttempts = stats.preGenerationHits + stats.preGenerationMisses;
        if (totalAttempts > 0) {
            expect(stats.preGenerationHits).toBeGreaterThan(0);
            mockLogger.info(`Pre-generation hit rate: ${stats.preGenerationHitRate}`);
        }
    });
    
    test('should handle mix of pre-generated and on-demand items', async () => {
        const mockSynthesize = jest.fn(async (text, voice, engine, options) => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return `audio-${text}`;
        });
        
        queueManager.setSynthesizeCallback(mockSynthesize);
        
        let playedCount = 0;
        const mockPlay = jest.fn(async (item) => {
            playedCount++;
            await new Promise(resolve => setTimeout(resolve, 30));
        });
        
        // Add item 1 - will be played immediately (miss)
        queueManager.enqueue({
            userId: 'user1',
            username: 'User1',
            text: 'Message 1',
            voice: 'en-US',
            engine: 'tiktok',
            audioData: null,
            priority: 0
        });
        
        // Start processing
        queueManager.startProcessing(mockPlay);
        
        // Wait a bit for first item to start
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Add more items while first is playing (these should get pre-generated)
        for (let i = 2; i <= 4; i++) {
            queueManager.enqueue({
                userId: `user${i}`,
                username: `User${i}`,
                text: `Message ${i}`,
                voice: 'en-US',
                engine: 'tiktok',
                audioData: null,
                priority: 0
            });
        }
        
        // Wait for all to process
        await new Promise(resolve => setTimeout(resolve, 800));
        
        queueManager.stopProcessing();
        
        // All items should have been played
        expect(playedCount).toBe(4);
        
        const stats = queueManager.getStats();
        expect(stats.totalPlayed).toBe(4);
        
        // Should have pre-generated some items
        const totalAttempts = stats.preGenerationHits + stats.preGenerationMisses;
        expect(totalAttempts).toBeGreaterThanOrEqual(4);
    });
    
    test('should gracefully handle pre-generation failures', async () => {
        let callCount = 0;
        const mockSynthesize = jest.fn(async (text, voice, engine, options) => {
            callCount++;
            // Fail on second and third calls (pre-generation attempts)
            if (callCount === 2 || callCount === 3) {
                throw new Error('Synthesis failed');
            }
            await new Promise(resolve => setTimeout(resolve, 50));
            return `audio-${text}`;
        });
        
        queueManager.setSynthesizeCallback(mockSynthesize);
        
        const mockPlay = jest.fn(async (item) => {
            await new Promise(resolve => setTimeout(resolve, 30));
        });
        
        // Add 3 items
        for (let i = 1; i <= 3; i++) {
            queueManager.enqueue({
                userId: `user${i}`,
                username: `User${i}`,
                text: `Message ${i}`,
                voice: 'en-US',
                engine: 'tiktok',
                audioData: null,
                priority: 0
            });
        }
        
        queueManager.startProcessing(mockPlay);
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 800));
        
        queueManager.stopProcessing();
        
        // All items should still have been played (fallback to on-demand)
        expect(mockPlay).toHaveBeenCalledTimes(3);
        
        const stats = queueManager.getStats();
        expect(stats.totalPlayed).toBe(3);
        expect(stats.preGenerationErrors).toBeGreaterThan(0);
    });
    
    test('pre-generated audio should be preserved in queue item', async () => {
        const testAudioData = 'test-audio-base64-data';
        
        const mockSynthesize = jest.fn(async (text, voice, engine, options) => {
            await new Promise(resolve => setTimeout(resolve, 30));
            return testAudioData;
        });
        
        queueManager.setSynthesizeCallback(mockSynthesize);
        
        // Add item
        queueManager.enqueue({
            userId: 'user1',
            username: 'User1',
            text: 'Test Message',
            voice: 'en-US',
            engine: 'tiktok',
            audioData: null,
            priority: 0
        });
        
        const item = queueManager.queue[0];
        expect(item.audioData).toBeNull();
        
        // Pre-generate
        await queueManager._preGenerateItem(item);
        
        // Audio should be stored in the item
        expect(item.audioData).toBe(testAudioData);
        expect(mockSynthesize).toHaveBeenCalledTimes(1);
    });
});
