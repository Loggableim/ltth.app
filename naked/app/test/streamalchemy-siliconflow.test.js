/**
 * Tests for StreamAlchemy Silicon Flow Service
 * 
 * Tests cover:
 * - API key configuration
 * - Image size validation
 * - Request parameter validation
 * - Statistics tracking
 */

const SiliconFlowService = require('../plugins/streamalchemy/siliconFlowService');
const { SUPPORTED_IMAGE_SIZES, FLUX_SCHNELL_MODEL } = require('../plugins/streamalchemy/siliconFlowService');

// Mock logger for testing
const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
};

describe('SiliconFlowService', () => {
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new SiliconFlowService(mockLogger, null);
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

        test('should return true for hasApiKey with valid key', () => {
            service.setApiKey('sf-test-api-key');
            expect(service.hasApiKey()).toBe(true);
        });

        test('should update API key', () => {
            service.setApiKey('new-api-key');
            expect(service.hasApiKey()).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith('[SILICONFLOW SERVICE] API key updated');
        });
    });

    describe('Image Size Validation', () => {
        test('should accept valid image size 1024x1024', () => {
            expect(service.validateImageSize('1024x1024')).toBe('1024x1024');
        });

        test('should accept valid image size 512x512', () => {
            expect(service.validateImageSize('512x512')).toBe('512x512');
        });

        test('should accept valid image size 768x512', () => {
            expect(service.validateImageSize('768x512')).toBe('768x512');
        });

        test('should fallback to default for invalid size', () => {
            expect(service.validateImageSize('999x999')).toBe('1024x1024');
            expect(mockLogger.warn).toHaveBeenCalled();
        });

        test('should fallback to default for empty string', () => {
            expect(service.validateImageSize('')).toBe('1024x1024');
        });
    });

    describe('SUPPORTED_IMAGE_SIZES constant', () => {
        test('should include common aspect ratios', () => {
            expect(SUPPORTED_IMAGE_SIZES).toContain('1024x1024'); // 1:1
            expect(SUPPORTED_IMAGE_SIZES).toContain('512x512');   // 1:1
            expect(SUPPORTED_IMAGE_SIZES).toContain('1024x576');  // 16:9
            expect(SUPPORTED_IMAGE_SIZES).toContain('576x1024');  // 9:16
        });

        test('should have valid format for all sizes', () => {
            SUPPORTED_IMAGE_SIZES.forEach(size => {
                expect(size).toMatch(/^\d+x\d+$/);
            });
        });
    });

    describe('FLUX_SCHNELL_MODEL constant', () => {
        test('should be the correct model name', () => {
            expect(FLUX_SCHNELL_MODEL).toBe('black-forest-labs/FLUX.1-schnell');
        });

        test('should match service model property', () => {
            expect(service.model).toBe(FLUX_SCHNELL_MODEL);
        });
    });

    describe('Request Validation', () => {
        test('should throw error when generating without API key', async () => {
            await expect(service.generateImage('test prompt'))
                .rejects.toThrow('Silicon Flow API key not configured');
        });

        test('should throw error for empty prompt', async () => {
            service.setApiKey('test-key');
            await expect(service.generateImage(''))
                .rejects.toThrow('Prompt is required and must be a non-empty string');
        });

        test('should throw error for null prompt', async () => {
            service.setApiKey('test-key');
            await expect(service.generateImage(null))
                .rejects.toThrow('Prompt is required and must be a non-empty string');
        });
    });

    describe('Statistics', () => {
        test('should return initial stats', () => {
            const stats = service.getStats();
            
            expect(stats.totalRequests).toBe(0);
            expect(stats.successfulGenerations).toBe(0);
            expect(stats.failedGenerations).toBe(0);
            expect(stats.averageInferenceTime).toBe(0);
            expect(stats.queueLength).toBe(0);
            expect(stats.isProcessing).toBe(false);
            expect(stats.hasApiKey).toBe(false);
        });

        test('should reflect API key status in stats', () => {
            service.setApiKey('test-key');
            const stats = service.getStats();
            
            expect(stats.hasApiKey).toBe(true);
        });

        test('should include model info in stats', () => {
            const stats = service.getStats();
            
            expect(stats.model).toBe(FLUX_SCHNELL_MODEL);
            expect(stats.supportedSizes).toEqual(SUPPORTED_IMAGE_SIZES);
        });
    });

    describe('Service Lifecycle', () => {
        test('should clean up on destroy', async () => {
            service.queue.push({ test: 'item' });
            service.isProcessing = true;
            
            await service.destroy();
            
            expect(service.queue.length).toBe(0);
            expect(service.isProcessing).toBe(false);
            expect(mockLogger.info).toHaveBeenCalledWith('[SILICONFLOW SERVICE] Service destroyed');
        });
    });

    describe('getSupportedImageSizes', () => {
        test('should return a copy of supported sizes', () => {
            const sizes = service.getSupportedImageSizes();
            
            expect(sizes).toEqual(SUPPORTED_IMAGE_SIZES);
            
            // Should be a copy, not the original
            sizes.push('invalid');
            expect(service.getSupportedImageSizes()).not.toContain('invalid');
        });
    });
});

describe('Silicon Flow API Configuration', () => {
    test('should use correct base URL', () => {
        const service = new SiliconFlowService(mockLogger);
        expect(service.baseUrl).toBe('https://api.siliconflow.cn/v1');
    });

    test('should have correct default parameters', () => {
        const service = new SiliconFlowService(mockLogger);
        expect(service.defaultParams.image_size).toBe('1024x1024');
        expect(service.defaultParams.num_inference_steps).toBe(4);
        expect(service.defaultParams.batch_size).toBe(1);
    });

    test('should have 60 second timeout', () => {
        const service = new SiliconFlowService(mockLogger);
        expect(service.timeout).toBe(60000);
    });
});
