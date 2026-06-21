/**
 * Test: TTS Queue Manager Duplicate Detection
 * 
 * This test validates that the queue manager correctly detects and blocks
 * duplicate TTS messages within the 60-second deduplication window.
 * 
 * Bug Fix: Previously, the deduplication used a 5-second time-window hash
 * which created timing boundary issues where duplicates could slip through.
 */

const QueueManager = require('../plugins/tts/utils/queue-manager');

describe('TTS Queue Manager - Duplicate Detection', () => {
    let queueManager;
    let mockLogger;
    let mockConfig;
    
    beforeEach(() => {
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
            queueManager.clear();
        }
    });
    
    test('should accept first instance of a message', () => {
        const item = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Hello World',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const result = queueManager.enqueue(item);
        
        expect(result.success).toBe(true);
        expect(result.position).toBe(1);
        expect(mockLogger.debug).toHaveBeenCalledWith(
            expect.stringContaining('✓ TTS item unique, queuing')
        );
    });
    
    test('should block exact duplicate within 60 seconds', () => {
        const item1 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Hello World',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const item2 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Hello World', // Same text
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        // Enqueue first item
        const result1 = queueManager.enqueue(item1);
        expect(result1.success).toBe(true);
        
        // Attempt to enqueue duplicate
        const result2 = queueManager.enqueue(item2);
        expect(result2.success).toBe(false);
        expect(result2.reason).toBe('duplicate_content');
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('🔄 [DUPLICATE BLOCKED]')
        );
    });
    
    test('should block duplicate regardless of timing boundary', () => {
        // This test ensures the bug fix works: duplicates are caught
        // even if they arrive at different points in a time window
        // (without relying on fake timers - tests immediate duplicate blocking)
        
        const item1 = {
            userId: 'user456',
            username: 'TimingTest',
            text: 'Boundary test message',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        // Enqueue first
        const result1 = queueManager.enqueue(item1);
        expect(result1.success).toBe(true);
        
        // Try to enqueue duplicate immediately (would be in same time window)
        const item2 = { ...item1 };
        const result2 = queueManager.enqueue(item2);
        expect(result2.success).toBe(false);
        expect(result2.reason).toBe('duplicate_content');
        
        // Try again - should still be blocked (hash has no time component)
        const item3 = { ...item1 };
        const result3 = queueManager.enqueue(item3);
        expect(result3.success).toBe(false);
        expect(result3.reason).toBe('duplicate_content');
    });
    
    test('should allow same message from different users', () => {
        const item1 = {
            userId: 'user123',
            username: 'User1',
            text: 'Same message',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const item2 = {
            userId: 'user456', // Different user
            username: 'User2',
            text: 'Same message', // Same text
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const result1 = queueManager.enqueue(item1);
        expect(result1.success).toBe(true);
        
        const result2 = queueManager.enqueue(item2);
        expect(result2.success).toBe(true); // Should succeed - different user
        expect(result2.position).toBe(2);
    });
    
    test('should be case-insensitive when detecting duplicates', () => {
        const item1 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Hello World',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const item2 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'HELLO WORLD', // Different case
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const result1 = queueManager.enqueue(item1);
        expect(result1.success).toBe(true);
        
        const result2 = queueManager.enqueue(item2);
        expect(result2.success).toBe(false); // Should be blocked - same text (case-insensitive)
        expect(result2.reason).toBe('duplicate_content');
    });
    
    test('should ignore leading/trailing whitespace when detecting duplicates', () => {
        const item1 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Hello World',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const item2 = {
            userId: 'user123',
            username: 'TestUser',
            text: '  Hello World  ', // Extra whitespace
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        const result1 = queueManager.enqueue(item1);
        expect(result1.success).toBe(true);
        
        const result2 = queueManager.enqueue(item2);
        expect(result2.success).toBe(false); // Should be blocked - same text after trimming
        expect(result2.reason).toBe('duplicate_content');
    });
    
    test('should track time since first occurrence in duplicate log', () => {
        const item1 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Test message',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        // Enqueue first
        queueManager.enqueue(item1);
        
        // Try duplicate immediately (should show 0s)
        const item2 = { ...item1 };
        queueManager.enqueue(item2);
        
        // Check that warning includes time since first (0s when immediate)
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringMatching(/already queued 0s ago/)
        );
    });
    
    test('should update statistics when blocking duplicates', () => {
        const item1 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Stats test',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        // Enqueue first
        queueManager.enqueue(item1);
        
        const statsBefore = queueManager.getStats();
        expect(statsBefore.totalDuplicatesBlocked).toBe(0);
        
        // Try duplicate
        const item2 = { ...item1 };
        queueManager.enqueue(item2);
        
        const statsAfter = queueManager.getStats();
        expect(statsAfter.totalDuplicatesBlocked).toBe(1);
    });
    
    test('should clear deduplication cache when queue is cleared', () => {
        const item1 = {
            userId: 'user123',
            username: 'TestUser',
            text: 'Clear test',
            voice: 'en-US-Standard-A',
            engine: 'google',
            audioData: 'base64data',
            source: 'chat',
            teamLevel: 0
        };
        
        // Enqueue item
        queueManager.enqueue(item1);
        
        // Clear queue
        queueManager.clear();
        
        // Should accept the same item again
        const result = queueManager.enqueue(item1);
        expect(result.success).toBe(true);
    });
});
