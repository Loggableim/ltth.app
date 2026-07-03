const axios = require('axios');

/**
 * SiliconFlow TTS Engine
 * Provides access to Fish Speech 1.5 through SiliconFlow's API
 * 
 * API Documentation: https://docs.siliconflow.com/en/api-reference
 * - Base URL: https://api.siliconflow.com
 * - Endpoint: POST /v1/audio/speech
 * - Model: fishaudio/fish-speech-1.5
 * - Request Format: JSON (OpenAI-compatible)
 * - Audio Formats: mp3, wav, opus, flac
 * 
 * Features:
 * - Multilingual support
 * - Voice selection
 * - Speed control (0.25 - 4.0)
 * - Multiple audio format output
 * - Automatic retry with exponential backoff
 * - Performance mode optimization
 * 
 * References:
 * - API Guide: app/plugins/interactive-story/SILICONFLOW_API_GUIDE.md
 * - Dashboard: https://cloud.siliconflow.com
 * - Support: https://docs.siliconflow.com
 */
class SiliconFlowEngine {
    // Default voice identifier
    static DEFAULT_VOICE = 'default';
    
    constructor(apiKey, logger, config = {}) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('SiliconFlow API key is required and must be a non-empty string');
        }

        this.apiKey = apiKey;
        this.logger = logger;
        this.config = config;

        // SiliconFlow API Configuration
        this.apiBaseUrl = 'https://api.siliconflow.com';
        this.apiSynthesisUrl = `${this.apiBaseUrl}/v1/audio/speech`;
        this.model = 'fishaudio/fish-speech-1.5';

        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            // Fast mode: optimized for low-resource PCs
            this.timeout = 8000;  // 8s timeout for faster failure
            this.maxRetries = 1;  // Only 1 retry (2 attempts total)
        } else if (performanceMode === 'quality') {
            // Quality mode: longer timeouts for better reliability
            this.timeout = 30000; // 30s timeout
            this.maxRetries = 3;  // 3 retries (4 attempts total)
        } else {
            // Balanced mode (default): moderate settings
            this.timeout = 15000; // 15s timeout
            this.maxRetries = 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`SiliconFlow TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);

        this.logger.info('SiliconFlow TTS engine initialized (Fish Speech 1.5)');
    }

    /**
     * Get all available SiliconFlow voices
     * Note: SiliconFlow provides a default voice. Additional voices may be available - check SiliconFlow docs
     * @returns {Object} Voice map with voiceId as key
     */
    static getVoices() {
        return {
            'siliconflow-default': {
                name: 'Default Voice',
                lang: 'en',
                gender: 'neutral',
                model: 'fishaudio/fish-speech-1.5',
                voice: 'default',
                description: 'Default SiliconFlow Fish Speech voice',
                supportedEmotions: false
            },
            'siliconflow-female': {
                name: 'Female Voice',
                lang: 'en',
                gender: 'female',
                model: 'fishaudio/fish-speech-1.5',
                voice: 'female',
                description: 'Female voice (if available)',
                supportedEmotions: false
            },
            'siliconflow-male': {
                name: 'Male Voice',
                lang: 'en',
                gender: 'male',
                model: 'fishaudio/fish-speech-1.5',
                voice: 'male',
                description: 'Male voice (if available)',
                supportedEmotions: false
            }
        };
    }

    /**
     * Get default voice for a specific language
     * @param {string} langCode - Language code (e.g., 'en', 'de', 'zh')
     * @returns {string} Default voice ID for the language
     */
    static getDefaultVoiceForLanguage(langCode) {
        // All languages use the default voice
        return 'siliconflow-default';
    }

    /**
     * Convert text to speech using SiliconFlow API
     * @param {string} text - The text to convert
     * @param {string} voiceId - The voice ID (e.g., 'siliconflow-default')
     * @param {number} speed - Speaking rate (0.25 - 4.0)
     * @param {object} options - Additional options
     *   - format: Audio format (mp3, wav, opus, flac) - default: mp3
     * @returns {Promise<string>} Base64-encoded audio data
     */
    async synthesize(text, voiceId = 'siliconflow-default', speed = 1.0, options = {}) {
        const voices = SiliconFlowEngine.getVoices();
        const voiceConfig = voices[voiceId];

        if (!voiceConfig) {
            this.logger.warn(`Invalid voice ID: ${voiceId}, falling back to default`);
            voiceId = 'siliconflow-default';
        }

        // Get the voice identifier from voice config
        const voice = voiceConfig?.voice || SiliconFlowEngine.DEFAULT_VOICE;

        // Extract parameters
        const format = options.format || 'mp3';
        
        // Clamp speed to valid range (0.25 - 4.0)
        const clampedSpeed = Math.max(0.25, Math.min(4.0, speed));

        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff: 1s, 2s, 4s...
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    this.logger.info(`SiliconFlow TTS: Retry attempt ${attempt}/${this.maxRetries} after ${delay}ms delay`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                this.logger.info(`SiliconFlow TTS: Synthesizing with voice=${voice}, speed=${clampedSpeed}, format=${format} (attempt ${attempt + 1}/${this.maxRetries + 1})`);

                // SiliconFlow API request body (OpenAI-compatible format)
                const requestBody = {
                    model: this.model,
                    input: text,
                    voice: voice,
                    response_format: format,
                    speed: clampedSpeed
                };

                const response = await axios.post(this.apiSynthesisUrl, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    responseType: 'arraybuffer',
                    timeout: this.timeout
                });

                // Convert response to base64
                const buffer = Buffer.from(response.data);
                const base64Audio = buffer.toString('base64');

                this.logger.info(`SiliconFlow TTS: Successfully synthesized ${buffer.length} bytes`);
                return base64Audio;

            } catch (error) {
                lastError = error;
                
                // Determine if error is retryable
                const isRetryable = error.code === 'ECONNABORTED' || 
                                   error.code === 'ETIMEDOUT' ||
                                   (error.response && error.response.status >= 500);
                
                if (!isRetryable || attempt === this.maxRetries) {
                    // Don't retry on client errors (4xx) or if max retries reached
                    break;
                }
                
                this.logger.warn(`SiliconFlow TTS: Attempt ${attempt + 1} failed (retryable error), retrying...`);
            }
        }

        // All retries exhausted
        if (lastError.response) {
            // API error response
            const errorMessage = lastError.response.data ? 
                (Buffer.isBuffer(lastError.response.data) ? 
                    lastError.response.data.toString('utf-8') : 
                    JSON.stringify(lastError.response.data)) : 
                'Unknown error';
            this.logger.error(`SiliconFlow TTS: API error (${lastError.response.status}): ${errorMessage}`);
            throw new Error(`SiliconFlow API error: ${errorMessage}`);
        } else if (lastError.request) {
            // Network error
            this.logger.error(`SiliconFlow TTS: Network error - ${lastError.message}`);
            throw new Error(`SiliconFlow network error: ${lastError.message}`);
        } else {
            // Other error
            this.logger.error(`SiliconFlow TTS: Synthesis failed - ${lastError.message}`);
            throw lastError;
        }
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('SiliconFlow API key must be a non-empty string');
        }
        this.apiKey = apiKey;
        this.logger.info('SiliconFlow TTS: API key updated');
    }

    /**
     * Get voices asynchronously (for consistency with other engines)
     * @returns {Promise<Object>} Voice map
     */
    async getVoices() {
        return SiliconFlowEngine.getVoices();
    }
}

module.exports = SiliconFlowEngine;
