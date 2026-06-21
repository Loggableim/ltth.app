/**
 * StreamAlchemy LightX Service
 * 
 * Handles image generation via LightX API for fusion items.
 * Based on official LightX API documentation and SDK:
 * https://docs.lightxeditor.com/
 * https://github.com/lightXapi/AIStack-Integrator
 * 
 * Features:
 * - Image-to-Image transformation with style transfer
 * - Text-to-Image generation as fallback
 * - Async order status polling
 * - Request queue for rate limiting
 * - Error handling and retries
 * 
 * API Endpoints used:
 * - POST /v1/image2image - Transform images with prompts/styles
 * - POST /v1/text2image - Generate images from text
 * - POST /v1/order-status - Poll for generation completion
 * 
 * Response format:
 * - statusCode: 2000 = success
 * - body.orderId: Order ID for polling
 * - body.status: 'init' (processing), 'active' (completed), 'failed'
 * - body.output: Final image URL when completed
 */

const https = require('https');
const http = require('http');

// LightX API Constants
const LIGHTX_SUCCESS_CODE = 2000;

class LightXService {
    /**
     * @param {Object} logger - Logger instance
     * @param {string|null} apiKey - LightX API key
     */
    constructor(logger, apiKey = null) {
        this.logger = logger;
        this.apiKey = apiKey;
        
        // API Configuration - based on official LightX SDK
        this.baseUrl = 'https://api.lightxeditor.com/external/api';
        this.timeout = 120000; // 120 seconds (generation can take time)
        
        // Polling configuration
        this.maxRetries = 30; // Max polling attempts
        this.retryInterval = 3000; // 3 seconds between polls
        
        // Request queue for rate limiting
        this.queue = [];
        this.isProcessing = false;
        this.requestDelay = 1000; // 1 second between requests
        
        // Statistics
        this.stats = {
            totalRequests: 0,
            successfulGenerations: 0,
            failedGenerations: 0,
            imageToImageRequests: 0,
            textToImageRequests: 0
        };
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.logger.info('[LIGHTX SERVICE] API key updated');
    }

    /**
     * Check if API key is configured
     * @returns {boolean} True if API key is set
     */
    hasApiKey() {
        return !!this.apiKey && this.apiKey.trim().length > 0;
    }

    /**
     * Generate fusion image using Image-to-Image API
     * Uses LightX /v1/image2image endpoint
     * 
     * @param {string} imageUrl1 - First source image URL
     * @param {string} imageUrl2 - Second source image URL (used as style reference)
     * @param {string} prompt - Text prompt for the transformation
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated image URL
     */
    async generateImageToImage(imageUrl1, imageUrl2, prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('LightX API key not configured');
        }

        const {
            strength = 0.7,
            styleStrength = 0.5
        } = options;

        const payload = {
            imageUrl: imageUrl1,
            textPrompt: prompt,
            strength: strength
        };

        // Add style image if provided
        if (imageUrl2) {
            payload.styleImageUrl = imageUrl2;
            payload.styleStrength = styleStrength;
        }

        this.stats.imageToImageRequests++;
        return this.queueRequest('/v1/image2image', payload);
    }

    /**
     * Generate image using Text-to-Image API
     * Uses LightX /v1/text2image endpoint
     * 
     * @param {string} prompt - Text prompt for image generation
     * @param {Object} options - Additional options
     * @returns {Promise<string>} Generated image URL
     */
    async generateTextToImage(prompt, options = {}) {
        if (!this.hasApiKey()) {
            throw new Error('LightX API key not configured');
        }

        const payload = {
            textPrompt: prompt
        };

        this.stats.textToImageRequests++;
        return this.queueRequest('/v1/text2image', payload);
    }

    /**
     * Generate fusion image with automatic mode selection
     * Uses Image-to-Image if base images available, otherwise Text-to-Image
     * 
     * @param {Object} itemA - First item with optional imageURL
     * @param {Object} itemB - Second item with optional imageURL
     * @param {string} prompt - Fusion prompt
     * @param {Object} options - Generation options
     * @returns {Promise<string>} Generated image URL
     */
    async generateFusionImage(itemA, itemB, prompt, options = {}) {
        const hasImageA = this.isValidImageUrl(itemA?.imageURL);
        const hasImageB = this.isValidImageUrl(itemB?.imageURL);

        this.logger.info(`[LIGHTX SERVICE] Generating fusion image. Image A: ${hasImageA}, Image B: ${hasImageB}`);

        // If both images available, use image-to-image
        if (hasImageA && hasImageB) {
            this.logger.info('[LIGHTX SERVICE] Using Image-to-Image mode (both images available)');
            return this.generateImageToImage(itemA.imageURL, itemB.imageURL, prompt, options);
        }
        
        // If one image available, use image-to-image with just base image
        if (hasImageA || hasImageB) {
            const baseImage = hasImageA ? itemA.imageURL : itemB.imageURL;
            this.logger.info('[LIGHTX SERVICE] Using Image-to-Image mode (single image as base)');
            return this.generateImageToImage(baseImage, null, prompt, options);
        }

        // No images - use text-to-image
        this.logger.info('[LIGHTX SERVICE] Using Text-to-Image mode (no base images)');
        return this.generateTextToImage(prompt, options);
    }

    /**
     * Check if URL is a valid image URL (not placeholder/data URL)
     * @param {string} url - URL to check
     * @returns {boolean} True if valid HTTP(S) image URL
     */
    isValidImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        // Exclude data URLs and placeholder images
        if (url.startsWith('data:')) return false;
        if (url.includes('placeholder')) return false;
        // Must be HTTP(S)
        return url.startsWith('http://') || url.startsWith('https://');
    }

    /**
     * Queue a request to the API
     * @param {string} endpoint - API endpoint
     * @param {Object} payload - Request payload
     * @returns {Promise<string>} Response image URL
     */
    async queueRequest(endpoint, payload) {
        return new Promise((resolve, reject) => {
            this.queue.push({ endpoint, payload, resolve, reject });
            this.stats.totalRequests++;
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
                this.logger.debug(`[LIGHTX SERVICE] Processing request to ${request.endpoint}. Queue length: ${this.queue.length}`);
                
                const result = await this.makeRequest(request.endpoint, request.payload);
                this.stats.successfulGenerations++;
                request.resolve(result);
                
            } catch (error) {
                this.logger.error(`[LIGHTX SERVICE] Request failed: ${error.message}`);
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
     * Make HTTP request to LightX API
     * Based on official LightX API structure:
     * - statusCode: 2000 = success
     * - body contains orderId for async polling
     * 
     * @param {string} endpoint - API endpoint (e.g., '/v1/image2image')
     * @param {Object} payload - Request payload
     * @returns {Promise<string>} Image URL from response
     */
    async makeRequest(endpoint, payload) {
        const url = `${this.baseUrl}${endpoint}`;
        
        this.logger.info(`[LIGHTX SERVICE] Making request to ${url}`);
        
        try {
            // Step 1: Submit the generation request
            const initialResponse = await this.httpPost(url, payload);
            
            // Check for LightX API success status code
            if (initialResponse.statusCode !== LIGHTX_SUCCESS_CODE) {
                throw new Error(`LightX API error: ${initialResponse.message || 'Unknown error'} (code: ${initialResponse.statusCode})`);
            }
            
            const orderInfo = initialResponse.body;
            
            if (!orderInfo || !orderInfo.orderId) {
                throw new Error('No orderId in response');
            }
            
            this.logger.info(`[LIGHTX SERVICE] Order created: ${orderInfo.orderId}, status: ${orderInfo.status}`);
            this.logger.debug(`[LIGHTX SERVICE] Max retries: ${orderInfo.maxRetriesAllowed}, avg time: ${orderInfo.avgResponseTimeInSec}s`);
            
            // Step 2: Poll for completion
            const result = await this.pollForCompletion(orderInfo.orderId);
            
            if (!result.output) {
                throw new Error('No output URL in completed result');
            }
            
            this.logger.info('[LIGHTX SERVICE] Image generated successfully');
            return result.output;
            
        } catch (error) {
            this.logger.error(`[LIGHTX SERVICE] Request error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Poll for order completion using official LightX order-status endpoint
     * Status values: 'init' (processing), 'active' (completed), 'failed'
     * 
     * @param {string} orderId - Order ID from initial request
     * @returns {Promise<Object>} Completed order with output URL
     */
    async pollForCompletion(orderId) {
        const statusUrl = `${this.baseUrl}/v1/order-status`;
        
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            // Wait before checking (except first attempt)
            if (attempt > 0) {
                await this.sleep(this.retryInterval);
            }
            
            try {
                this.logger.debug(`[LIGHTX SERVICE] Polling attempt ${attempt + 1}/${this.maxRetries} for order ${orderId}`);
                
                const response = await this.httpPost(statusUrl, { orderId });
                
                if (response.statusCode !== LIGHTX_SUCCESS_CODE) {
                    this.logger.warn(`[LIGHTX SERVICE] Status check failed: ${response.message}`);
                    continue;
                }
                
                const status = response.body;
                this.logger.debug(`[LIGHTX SERVICE] Order status: ${status.status}`);
                
                switch (status.status) {
                    case 'active':
                        // Generation completed successfully
                        this.logger.info(`[LIGHTX SERVICE] Generation completed for order ${orderId}`);
                        return status;
                        
                    case 'failed':
                        throw new Error(`Generation failed for order ${orderId}`);
                        
                    case 'init':
                        // Still processing, continue polling
                        this.logger.debug(`[LIGHTX SERVICE] Order ${orderId} still processing...`);
                        break;
                        
                    default:
                        this.logger.warn(`[LIGHTX SERVICE] Unknown status: ${status.status}`);
                        break;
                }
                
            } catch (error) {
                this.logger.warn(`[LIGHTX SERVICE] Poll attempt ${attempt + 1} failed: ${error.message}`);
                // Continue polling unless it's a definitive failure
                if (error.message.includes('Generation failed')) {
                    throw error;
                }
            }
        }
        
        throw new Error(`Timeout waiting for order ${orderId} completion after ${this.maxRetries} attempts`);
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
                    'x-api-key': this.apiKey
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
            hasApiKey: this.hasApiKey()
        };
    }

    /**
     * Clean up resources
     */
    async destroy() {
        this.queue = [];
        this.isProcessing = false;
        this.logger.info('[LIGHTX SERVICE] Service destroyed');
    }
}

module.exports = LightXService;
