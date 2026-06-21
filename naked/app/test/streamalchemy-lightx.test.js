/**
 * Tests for StreamAlchemy LightX Service
 * 
 * Tests cover:
 * - API key configuration
 * - Image URL validation
 * - Request queue processing
 * - Error handling
 */

const LightXService = require('../plugins/streamalchemy/lightxService');

// Mock logger for testing
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

describe('LightXService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new LightXService(mockLogger, null);
    });

    afterEach(async () => {
        if (service) {
            await service.destroy();
        }
    });

    describe('API Key Management', () => {
        test('should return false for hasApiKey when no key is set', () => {
            expect(service.hasApiKey()).toBe(false);
        });

        test('should return false for hasApiKey with empty string', () => {
            service.setApiKey('');
            expect(service.hasApiKey()).toBe(false);
        });

        test('should return false for hasApiKey with whitespace only', () => {
            service.setApiKey('   ');
            expect(service.hasApiKey()).toBe(false);
        });

        test('should return true for hasApiKey with valid key', () => {
            service.setApiKey('lx-test-api-key');
            expect(service.hasApiKey()).toBe(true);
        });

        test('should update API key', () => {
            service.setApiKey('new-api-key');
            expect(service.hasApiKey()).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('[LIGHTX SERVICE] API key updated');
        });
    });

    describe('Image URL Validation', () => {
        test('should reject null URL', () => {
            expect(service.isValidImageUrl(null)).toBe(false);
        });

        test('should reject undefined URL', () => {
            expect(service.isValidImageUrl(undefined)).toBe(false);
        });

        test('should reject empty string', () => {
            expect(service.isValidImageUrl('')).toBe(false);
        });

        test('should reject non-string values', () => {
            expect(service.isValidImageUrl(123)).toBe(false);
            expect(service.isValidImageUrl({})).toBe(false);
            expect(service.isValidImageUrl([])).toBe(false);
        });

        test('should reject data URLs', () => {
            expect(service.isValidImageUrl('data:image/png;base64,abc123')).toBe(false);
        });

        test('should reject placeholder URLs', () => {
            expect(service.isValidImageUrl('https://example.com/placeholder.png')).toBe(false);
            expect(service.isValidImageUrl('http://placeholder.com/image.jpg')).toBe(false);
        });

        test('should accept valid HTTPS URLs', () => {
            expect(service.isValidImageUrl('https://example.com/image.png')).toBe(true);
        });

        test('should accept valid HTTP URLs', () => {
            expect(service.isValidImageUrl('http://example.com/image.jpg')).toBe(true);
        });
    });

    describe('Request Validation', () => {
        test('should throw error when generating without API key', async () => {
            await expect(service.generateTextToImage('test prompt'))
                .rejects.toThrow('LightX API key not configured');
        });

        test('should throw error for image-to-image without API key', async () => {
            await expect(service.generateImageToImage('http://a.com/1.jpg', 'http://b.com/2.jpg', 'prompt'))
                .rejects.toThrow('LightX API key not configured');
        });
    });

    describe('Statistics', () => {
        test('should return initial stats', () => {
            const stats = service.getStats();
            
            expect(stats.totalRequests).toBe(0);
            expect(stats.successfulGenerations).toBe(0);
            expect(stats.failedGenerations).toBe(0);
            expect(stats.imageToImageRequests).toBe(0);
            expect(stats.textToImageRequests).toBe(0);
            expect(stats.queueLength).toBe(0);
            expect(stats.isProcessing).toBe(false);
            expect(stats.hasApiKey).toBe(false);
        });

        test('should reflect API key status in stats', () => {
            service.setApiKey('test-key');
            const stats = service.getStats();
            
            expect(stats.hasApiKey).toBe(true);
        });
    });

    describe('Service Lifecycle', () => {
        test('should clean up on destroy', async () => {
            service.queue.push({ test: 'item' });
            service.isProcessing = true;
            
            await service.destroy();
            
            expect(service.queue.length).toBe(0);
            expect(service.isProcessing).toBe(false);
            expect(mockLogger.info).toHaveBeenCalledWith('[LIGHTX SERVICE] Service destroyed');
        });
    });

    describe('Fusion Image Generation Mode Selection', () => {
        beforeEach(() => {
            service.setApiKey('test-key');
            // Mock the actual HTTP request to prevent network calls
            service.queueRequest = jest.fn().mockResolvedValue('https://result.com/image.png');
        });

        test('should use image-to-image when both images available', async () => {
            const itemA = { imageURL: 'https://a.com/image.png' };
            const itemB = { imageURL: 'https://b.com/image.png' };
            
            await service.generateFusionImage(itemA, itemB, 'test prompt');
            
            expect(service.queueRequest).toHaveBeenCalledWith('/v1/image2image', expect.objectContaining({
                imageUrl: itemA.imageURL,
                styleImageUrl: itemB.imageURL,
                textPrompt: 'test prompt'
            }));
        });

        test('should use image-to-image with single image when only one available', async () => {
            const itemA = { imageURL: 'https://a.com/image.png' };
            const itemB = { name: 'No Image Item' };
            
            await service.generateFusionImage(itemA, itemB, 'test prompt');
            
            expect(service.queueRequest).toHaveBeenCalledWith('/v1/image2image', expect.objectContaining({
                imageUrl: itemA.imageURL,
                textPrompt: 'test prompt'
            }));
        });

        test('should use text-to-image when no images available', async () => {
            const itemA = { name: 'Item A' };
            const itemB = { name: 'Item B' };
            
            await service.generateFusionImage(itemA, itemB, 'test prompt');
            
            expect(service.queueRequest).toHaveBeenCalledWith('/v1/text2image', expect.objectContaining({
                textPrompt: 'test prompt'
            }));
        });

        test('should exclude data URLs from valid images', async () => {
            const itemA = { imageURL: 'data:image/png;base64,abc' };
            const itemB = { name: 'Item B' };
            
            await service.generateFusionImage(itemA, itemB, 'test prompt');
            
            // Should fall back to text-to-image since data URL is not valid
            expect(service.queueRequest).toHaveBeenCalledWith('/v1/text2image', expect.any(Object));
        });
    });
});

describe('LightX API Configuration', () => {
    test('should use correct base URL', () => {
        const service = new LightXService(mockLogger);
        expect(service.baseUrl).toBe('https://api.lightxeditor.com/external/api');
    });

    test('should have correct default polling configuration', () => {
        const service = new LightXService(mockLogger);
        expect(service.maxRetries).toBe(30);
        expect(service.retryInterval).toBe(3000);
    });

    test('should have correct timeout', () => {
        const service = new LightXService(mockLogger);
        expect(service.timeout).toBe(120000); // 2 minutes
    });
});
