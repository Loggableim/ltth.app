/**
 * StreamAlchemy Silicon Flow Service
 * 
 * Handles image generation via Silicon Flow API using FLUX.1-schnell model.
 * Based on official Silicon Flow API documentation:
 * https://docs.siliconflow.com/en/api-reference/images/images-generations
 * 
 * Features:
 * - FLUX.1-schnell text-to-image generation (1-4 inference steps, very fast)
 * - Multiple image sizes and aspect ratios
 * - Seed-based reproducibility
 * - Request queue for rate limiting
 * - Error handling and retries
 * 
 * API Endpoint:
 * - POST /v1/images/generations - Generate images from text prompts
 * 
 * Response format:
 * - images: Array of { url: string }
 * - timings: { inference: number }
 * - seed: number
 * 
 * Note: FLUX.1-schnell is optimized for speed (1-4 steps) and is free for
 * personal, scientific, and commercial use (Apache 2.0 license).
 */

const https = require('https');
const http = require('http');

// API Constants
const SILICONFLOW_SUCCESS_CODES = [200, 201];
const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';
const FLUX_SCHNELL_MODEL = 'black-forest-labs/FLUX.1-schnell';

// Supported image sizes for FLUX.1-schnell
const SUPPORTED_IMAGE_SIZES = [
    '1024x1024',  // 1:1 Square
    '512x512',    // 1:1 Square (smaller)
    '768x512',    // 3:2 Landscape
    '512x768',    // 2:3 Portrait
    '1024x576',   // 16:9 Landscape
    '576x1024',   // 9:16 Portrait
    '1280x720',   // 16:9 HD
    '720x1280',   // 9:16 HD Portrait
    '1664x928',   // Widescreen
    '928x1664'    // Tall Portrait
];

class SiliconFlowService {
    /**
     * @param {Object} logger - Logger instance
     * @param {string|null} apiKey - Silicon Flow API key
     */
    constructor(logger, apiKey = null) {
        this.logger = logger;
        this.apiKey = apiKey;
        
        // API Configuration
        this.baseUrl = SILICONFLOW_BASE_URL;
        this.model = FLUX_SCHNELL_MODEL;
        this.timeout = 60000; // 60 seconds (FLUX.1-schnell is very fast)
        
        // Default generation parameters
        this.defaultParams = {
            image_size: '1024x1024',
            num_inference_steps: 4, // FLUX.1-schnell supports 1-4 steps
            batch_size: 1,
            guidance_scale: 7.5
        };
        
        // Request queue for rate limiting
        this.queue = [];
        this.isProcessing = false;
        this.requestDelay = 500; // 500ms between requests
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulGenerations: 0,
            failedGenerations: 0,
            averageInferenceTime: 0,
            totalInferenceTime: 0
        };
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.logger.info('[SILICONFLOW SERVICE] API key updated');
    }

    /**
     * Check if API key is configured
     * @returns {boolean} True if API key is set
     */
    hasApiKey() {
        return !!this.apiKey && this.apiKey.trim().length > 0;
    }

    /**
     * Generate image using FLUX.1-schnell model
     * 
     * @param {string} prompt - Text prompt for image generation
     * @param {Object} options - Generation options
     * @param {string} options.imageSize - Image size (e.g., '1024x1024')
     * @param {number} options.steps - Number of inference steps (1-4)
     * @param {number} options.seed - Seed for reproducibility
     * @param {string} options.negativePrompt - Negative prompt (concepts to avoid)
     * @param {number} options.guidanceScale - Prompt adherence strength
     * @returns {Promise<string>} Generated image URL
     */
    async generateImage(prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('Silicon Flow API key not configured');
        }

        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new Error('Prompt is required and must be a non-empty string');
        }

        const {
            imageSize = this.defaultParams.image_size,
            steps = this.defaultParams.num_inference_steps,
            seed = null,
            negativePrompt = null,
            guidanceScale = this.defaultParams.guidance_scale
        } = options;

        // Validate image size
        const validatedSize = this.validateImageSize(imageSize);

        // Validate steps (1-4 for FLUX.1-schnell)
        const validatedSteps = Math.max(1, Math.min(4, parseInt(steps) || 4));

        const payload = {
            model: this.model,
            prompt: prompt.trim(),
            image_size: validatedSize,
            num_inference_steps: validatedSteps,
            batch_size: 1,
            guidance_scale: guidanceScale
        };

        // Add optional parameters
        if (seed !== null && seed !== undefined) {
            payload.seed = parseInt(seed);
        }

        if (negativePrompt && negativePrompt.trim().length > 0) {
            payload.negative_prompt = negativePrompt.trim();
        }

        this.stats.totalRequests++;
        return this.queueRequest(payload);
    }

    /**
     * Generate fusion image for StreamAlchemy
     * Creates an image based on fusion prompt with style-appropriate settings
     * 
     * @param {Object} itemA - First item (for metadata)
     * @param {Object} itemB - Second item (for metadata)
     * @param {string} prompt - Fusion prompt from PromptGenerator
     * @param {Object} options - Generation options
     * @returns {Promise<string>} Generated image URL
     */
    async generateFusionImage(itemA, itemB, prompt, options = {}) {
        this.logger.info('[SILICONFLOW SERVICE] Generating fusion image with FLUX.1-schnell');

        // Optimize settings for game icon generation
        const fusionOptions = {
            imageSize: options.imageSize || '1024x1024',
            steps: options.steps || 4, // Max quality for fusion
            negativePrompt: options.negativePrompt || 'blurry, low quality, distorted, text, watermark, logo',
            guidanceScale: options.guidanceScale || 7.5,
            ...options
        };

        return this.generateImage(prompt, fusionOptions);
    }

    /**
     * Validate and normalize image size
     * @param {string} size - Requested image size
     * @returns {string} Valid image size
     */
    validateImageSize(size) {
        if (SUPPORTED_IMAGE_SIZES.includes(size)) {
            return size;
        }
        
        // Default to 1024x1024 if invalid
        this.logger.warn(`[SILICONFLOW SERVICE] Invalid image size "${size}", using default 1024x1024`);
        return '1024x1024';
    }

    /**
     * Queue a request to the API
     * @param {Object} payload - Request payload
     * @returns {Promise<string>} Response image URL
     */
    async queueRequest(payload) {
        return new Promise((resolve, reject) => {
            this.queue.push({ payload, resolve, reject });
            this.processQueue();
        });
    }

    /**
     * Process the request queue
     */
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const request = this.queue.shift();
            
            try {
                this.logger.debug(`[SILICONFLOW SERVICE] Processing request. Queue length: ${this.queue.length}`);
                
                const result = await this.makeRequest(request.payload);
                this.stats.successfulGenerations++;
                request.resolve(result);
                
            } catch (error) {
                this.logger.error(`[SILICONFLOW SERVICE] Request failed: ${error.message}`);
                this.stats.failedGenerations++;
                request.reject(error);
            }

            // Delay between requests for rate limiting
            if (this.queue.length > 0) {
                await this.sleep(this.requestDelay);
            }
        }

        this.isProcessing = false;
    }

    /**
     * Make HTTP request to Silicon Flow API
     * 
     * @param {Object} payload - Request payload
     * @returns {Promise<string>} Image URL from response
     */
    async makeRequest(payload) {
        const url = `${this.baseUrl}/images/generations`;
        
        this.logger.info(`[SILICONFLOW SERVICE] Generating image with FLUX.1-schnell`);
        this.logger.debug(`[SILICONFLOW SERVICE] Prompt: ${payload.prompt.substring(0, 100)}...`);
        
        try {
            const response = await this.httpPost(url, payload);
            
            // Check for successful response
            if (response.error) {
                throw new Error(`Silicon Flow API error: ${response.error.message || response.error}`);
            }
            
            // Extract image URL from response
            if (!response.images || response.images.length === 0) {
                throw new Error('No images in response');
            }
            
            const imageUrl = response.images[0].url;
            
            if (!imageUrl) {
                throw new Error('No image URL in response');
            }
            
            // Update timing statistics
            if (response.timings?.inference) {
                this.stats.totalInferenceTime += response.timings.inference;
                this.stats.averageInferenceTime = this.stats.totalInferenceTime / this.stats.successfulGenerations;
            }
            
            this.logger.info(`[SILICONFLOW SERVICE] Image generated successfully (seed: ${response.seed || 'random'})`);
            
            if (response.timings?.inference) {
                this.logger.debug(`[SILICONFLOW SERVICE] Inference time: ${response.timings.inference}ms`);
            }
            
            return imageUrl;
            
        } catch (error) {
            this.logger.error(`[SILICONFLOW SERVICE] Request error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Make HTTP POST request
     * @param {string} url - Full URL
     * @param {Object} payload - Request payload
     * @returns {Promise<Object>} Parsed JSON response
     */
    async httpPost(url, payload) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const isHttps = urlObj.protocol === 'https:';
            const httpModule = isHttps ? https : http;

            const data = JSON.stringify(payload);
            
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    'Authorization': `Bearer ${this.apiKey}`
                },
                timeout: this.timeout
            };

            const req = httpModule.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const json = JSON.parse(responseData);
                        
                        // Check HTTP status code
                        if (!SILICONFLOW_SUCCESS_CODES.includes(res.statusCode)) {
                            reject(new Error(`HTTP ${res.statusCode}: ${json.error?.message || json.message || 'Unknown error'}`));
                            return;
                        }
                        
                        resolve(json);
                    } catch (parseError) {
                        reject(new Error(`Failed to parse response: ${parseError.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`HTTP request error: ${error.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.write(data);
            req.end();
        });
    }

    /**
     * Sleep helper
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get service statistics
     * @returns {Object} Statistics object
     */
    getStats() {
        return {
            ...this.stats,
            queueLength: this.queue.length,
            isProcessing: this.isProcessing,
            hasApiKey: this.hasApiKey(),
            model: this.model,
            supportedSizes: SUPPORTED_IMAGE_SIZES
        };
    }

    /**
     * Get supported image sizes
     * @returns {string[]} Array of supported image sizes
     */
    getSupportedImageSizes() {
        return [...SUPPORTED_IMAGE_SIZES];
    }

    /**
     * Clean up resources
     */
    async destroy() {
        this.queue = [];
        this.isProcessing = false;
        this.logger.info('[SILICONFLOW SERVICE] Service destroyed');
    }
}

// Export class and constants
module.exports = SiliconFlowService;
module.exports.SUPPORTED_IMAGE_SIZES = SUPPORTED_IMAGE_SIZES;
module.exports.FLUX_SCHNELL_MODEL = FLUX_SCHNELL_MODEL;
