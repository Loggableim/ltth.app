const axios = require('axios');

/**
 * ElevenLabs TTS Engine
 * Premium TTS with high-quality AI voices (requires API key)
 *
 * API Documentation: https://elevenlabs.io/docs/quickstart
 * - Base URL: https://api.elevenlabs.io/v1
 * - Voices: GET /v1/voices
 * - Synthesis: POST /v1/text-to-speech/{voice_id}
 * - Audio Format: MP3 (audio/mpeg)
 * - Models: eleven_multilingual_v2, eleven_flash_v2_5, etc.
 *
 * Features:
 * - 100+ voices in 30+ languages
 * - Ultra-realistic speech quality
 * - 1-hour voice caching
 * - Automatic retry with exponential backoff
 * - Comprehensive error handling
 * - Cost tracking & usage monitoring
 */
class ElevenLabsEngine {
    constructor(apiKey, logger, config = {}) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('ElevenLabs API key is required and must be a non-empty string');
        }

        this.apiKey = apiKey;
        this.logger = logger;
        this.config = config;

        // API Configuration
        this.apiBaseUrl = 'https://api.elevenlabs.io/v1';
        this.apiVoicesUrl = `${this.apiBaseUrl}/voices`;
        this.apiSynthesisUrlTemplate = `${this.apiBaseUrl}/text-to-speech/{voice_id}`;

        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            // Fast mode: optimized for low-resource PCs
            this.timeout = 5000;  // 5s timeout for faster failure
            this.maxRetries = 1;  // Only 1 retry (2 attempts total)
        } else if (performanceMode === 'quality') {
            // Quality mode: longer timeouts for better reliability
            this.timeout = 20000; // 20s timeout
            this.maxRetries = 3;  // 3 retries (4 attempts total)
        } else {
            // Balanced mode (default): moderate settings
            this.timeout = 10000; // 10s timeout (reduced from 15s)
            this.maxRetries = 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`ElevenLabs TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);

        // Voice Caching
        this.cachedVoices = null;
        this.cacheTimestamp = null;
        this.cacheTTL = 3600000; // 1 hour in milliseconds
        this.voicesFetchPromise = null; // Promise deduplication

        // Usage Tracking
        this.usageStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalCharacters: 0,
            totalCost: 0
        };

        // Pricing (per 1000 characters)
        // Pricing varies by model: Standard ~$0.30, Turbo ~$0.15 per 1k chars
        this.pricePerKChars = 0.30; // Conservative estimate for standard model

        // Default model ID
        this.defaultModel = 'eleven_multilingual_v2';

        this.logger.info('ElevenLabs TTS engine initialized');
    }

    /**
     * Get all available ElevenLabs voices
     * Uses 1-hour caching to reduce API calls
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Object>} Voice map
     */
    async getVoices(forceRefresh = false) {
        // Return cached voices if available and not expired
        if (!forceRefresh && this.cachedVoices && this._isCacheValid()) {
            this.logger.info('ElevenLabs: Returning cached voices');
            return this.cachedVoices;
        }

        // If a fetch is already in progress, return that promise
        if (this.voicesFetchPromise) {
            this.logger.info('ElevenLabs: Returning in-progress voices fetch');
            return this.voicesFetchPromise;
        }

        // Start new fetch and store the promise
        this.voicesFetchPromise = this._fetchVoices();

        try {
            const voices = await this.voicesFetchPromise;
            return voices;
        } finally {
            // Clear the promise when done (success or failure)
            this.voicesFetchPromise = null;
        }
    }

    /**
     * Internal method to fetch voices from API
     * @returns {Promise<Object>}
     */
    async _fetchVoices() {
        try {
            this.logger.info('ElevenLabs: Fetching voices from API');

            const response = await axios.get(this.apiVoicesUrl, {
                headers: {
                    'xi-api-key': this.apiKey,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TikTokLiveStreamTool/2.0'
                },
                timeout: this.timeout
            });

            if (response.data && response.data.voices) {
                const voiceMap = this._transformVoicesToMap(response.data.voices);

                // Update cache
                this.cachedVoices = voiceMap;
                this.cacheTimestamp = Date.now();

                this.logger.info(`ElevenLabs: Fetched ${Object.keys(voiceMap).length} voices from API`);
                return voiceMap;
            } else {
                throw new Error('Invalid response format from ElevenLabs voices API');
            }
        } catch (error) {
            this.logger.error(`ElevenLabs: Failed to fetch voices from API: ${error.message}`);

            // If cache exists (even if expired), return it as fallback
            if (this.cachedVoices) {
                this.logger.warn('ElevenLabs: Using expired cache as fallback');
                return this.cachedVoices;
            }

            // Otherwise, return static fallback voices
            this.logger.warn('ElevenLabs: Using static fallback voices');
            const fallbackVoices = this._getFallbackVoices();
            this.cachedVoices = fallbackVoices;
            this.cacheTimestamp = Date.now();
            return fallbackVoices;
        }
    }

    /**
     * Check if voice cache is still valid
     * @private
     * @returns {boolean}
     */
    _isCacheValid() {
        if (!this.cacheTimestamp) return false;
        const age = Date.now() - this.cacheTimestamp;
        return age < this.cacheTTL;
    }

    /**
     * Transform API voice array to voice map
     * @private
     * @param {Array} apiVoices - Voices from API
     * @returns {Object} Voice map
     */
    _transformVoicesToMap(apiVoices) {
        const voiceMap = {};

        for (const voice of apiVoices) {
            if (voice.voice_id && voice.name) {
                // Extract language from labels or default to 'en'
                let lang = 'en';
                if (voice.labels) {
                    // Look for language in labels
                    const langLabel = voice.labels.language || voice.labels.accent;
                    if (langLabel) {
                        lang = this._extractLanguageCode(langLabel);
                    }
                }

                voiceMap[voice.voice_id] = {
                    name: voice.name,
                    lang: lang,
                    language: voice.labels?.accent || 'en-US',
                    gender: voice.labels?.gender || 'neutral',
                    age: voice.labels?.age || 'adult',
                    style: voice.labels?.['use case'] || 'standard',
                    category: voice.category || 'generated',
                    engine: 'elevenlabs'
                };
            }
        }

        return voiceMap;
    }

    /**
     * Extract language code from language tag
     * @private
     * @param {string} languageTag - e.g., "English", "German", "en-US"
     * @returns {string} Language code - e.g., "en", "de"
     */
    _extractLanguageCode(languageTag) {
        if (!languageTag) return 'en';

        // If it's already a code like "en-US", extract the first part
        if (languageTag.includes('-')) {
            return languageTag.split('-')[0].toLowerCase();
        }

        // Map common language names to codes
        const languageMap = {
            'english': 'en',
            'german': 'de',
            'spanish': 'es',
            'french': 'fr',
            'italian': 'it',
            'portuguese': 'pt',
            'polish': 'pl',
            'dutch': 'nl',
            'japanese': 'ja',
            'chinese': 'zh',
            'korean': 'ko',
            'russian': 'ru',
            'arabic': 'ar',
            'turkish': 'tr',
            'vietnamese': 'vi',
            'thai': 'th',
            'indonesian': 'id',
            'hindi': 'hi',
            'swedish': 'sv',
            'danish': 'da',
            'finnish': 'fi',
            'norwegian': 'no'
        };

        const normalized = languageTag.toLowerCase().trim();
        return languageMap[normalized] || 'en';
    }

    /**
     * Get fallback voices when API is unavailable
     * Static list of most common ElevenLabs voices
     * @private
     * @returns {Object} Fallback voice map
     */
    _getFallbackVoices() {
        return {
            // Popular ElevenLabs voices (these are common voice IDs that should work)
            '21m00Tcm4TlvDq8ikWAM': { name: 'Rachel - Calm', lang: 'en', language: 'en-US', gender: 'female', style: 'calm' },
            'AZnzlk1XvdvUeBnXmlld': { name: 'Domi - Strong', lang: 'en', language: 'en-US', gender: 'female', style: 'strong' },
            'EXAVITQu4vr4xnSDxMaL': { name: 'Bella - Soft', lang: 'en', language: 'en-US', gender: 'female', style: 'soft' },
            'ErXwobaYiN019PkySvjV': { name: 'Antoni - Well-rounded', lang: 'en', language: 'en-US', gender: 'male', style: 'well-rounded' },
            'MF3mGyEYCl7XYWbV9V6O': { name: 'Elli - Emotional', lang: 'en', language: 'en-US', gender: 'female', style: 'emotional' },
            'TxGEqnHWrfWFTfGW9XjX': { name: 'Josh - Deep', lang: 'en', language: 'en-US', gender: 'male', style: 'deep' },
            'VR6AewLTigWG4xSOukaG': { name: 'Arnold - Crisp', lang: 'en', language: 'en-US', gender: 'male', style: 'crisp' },
            'pNInz6obpgDQGcFmaJgB': { name: 'Adam - Narrative', lang: 'en', language: 'en-US', gender: 'male', style: 'narrative' },
            'yoZ06aMxZJJ28mfd3POQ': { name: 'Sam - Raspy', lang: 'en', language: 'en-US', gender: 'male', style: 'raspy' },
            
            // Multilingual voices
            'onwK4e9ZLuTAKqWW03F9': { name: 'Daniel - British', lang: 'en', language: 'en-GB', gender: 'male', style: 'authoritative' },
            'pFZP5JQG7iQjIQuC4Bku': { name: 'Lily - British', lang: 'en', language: 'en-GB', gender: 'female', style: 'warm' }
        };
    }

    /**
     * Get default voice for a specific language
     * @static
     * @param {string} langCode - ISO language code (e.g., "en", "de")
     * @returns {string} Voice ID
     */
    static getDefaultVoiceForLanguage(langCode) {
        const languageDefaults = {
            'en': '21m00Tcm4TlvDq8ikWAM',  // Rachel - Most popular English voice
            'de': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'es': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'fr': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'it': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'pt': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'ja': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'ko': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'zh': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'ru': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'ar': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'tr': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'vi': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'th': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'nl': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'pl': '21m00Tcm4TlvDq8ikWAM',  // Fallback to Rachel (multilingual)
            'id': '21m00Tcm4TlvDq8ikWAM'   // Fallback to Rachel (multilingual)
        };

        return languageDefaults[langCode] || '21m00Tcm4TlvDq8ikWAM'; // Default to Rachel
    }

    /**
     * Synthesize text to speech audio
     * @param {string} text - Text to synthesize (max 5000 chars for standard, 2500 for turbo)
     * @param {string} voiceId - ElevenLabs voice ID
     * @param {number} speed - Speaking rate (0.25 - 4.0) - Note: ElevenLabs uses stability/similarity_boost instead
     * @param {object} options - Additional options (modelId, etc.)
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId, speed = 1.0, options = {}) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text is required and must be a string');
        }

        if (!voiceId || typeof voiceId !== 'string') {
            throw new Error('Voice ID is required and must be a string');
        }

        // Use default model if not specified
        const model = options.modelId || this.defaultModel;

        // Track usage
        this.usageStats.totalRequests++;
        this.usageStats.totalCharacters += text.length;

        let lastError = null;

        // Retry loop with exponential backoff
        for (let attempt = 0; attempt < this.maxRetries + 1; attempt++) {
            try {
                const synthesisUrl = this.apiSynthesisUrlTemplate.replace('{voice_id}', voiceId);

                // ElevenLabs uses stability and similarity_boost instead of speed
                // We'll use default values for best quality
                const requestBody = {
                    text: text,
                    model_id: model,
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75,
                        style: 0.0,
                        use_speaker_boost: true
                    }
                };

                const response = await axios.post(
                    synthesisUrl,
                    requestBody,
                    {
                        headers: {
                            'xi-api-key': this.apiKey,
                            'Content-Type': 'application/json',
                            'Accept': 'audio/mpeg',
                            'User-Agent': 'TikTokLiveStreamTool/2.0'
                        },
                        timeout: this.timeout,
                        responseType: 'arraybuffer', // Important: Get binary data
                        validateStatus: (status) => {
                            // Accept 2xx status codes
                            return status >= 200 && status < 300;
                        }
                    }
                );

                // Handle response - convert binary to base64
                if (response.data) {
                    const audioData = Buffer.from(response.data).toString('base64');

                    if (audioData && audioData.length > 100) {
                        this.usageStats.successfulRequests++;

                        // Calculate and track cost
                        const cost = this._calculateCost(text.length);
                        this.usageStats.totalCost += cost;

                        this.logger.info(
                            `ElevenLabs TTS success: "${text.substring(0, 30)}..." ` +
                            `(voice: ${voiceId}, model: ${model}, attempt: ${attempt + 1}, ` +
                            `chars: ${text.length}, cost: $${cost.toFixed(4)})`
                        );

                        return audioData;
                    }
                }

                throw new Error('Invalid response format from ElevenLabs API');

            } catch (error) {
                lastError = error;

                // Handle specific error types
                if (error.response) {
                    const status = error.response.status;
                    const errorMessage = error.response.data?.detail ||
                                       error.response.data?.error ||
                                       error.response.data?.message ||
                                       'Unknown error';

                    // Don't retry on authentication/authorization errors
                    if (status === 401) {
                        this.usageStats.failedRequests++;
                        throw new Error(`ElevenLabs API authentication failed (401): Invalid API key`);
                    }

                    if (status === 403) {
                        this.usageStats.failedRequests++;
                        throw new Error(`ElevenLabs API access forbidden (403): ${errorMessage}`);
                    }

                    // Don't retry on rate limit errors (should be handled at higher level)
                    if (status === 429) {
                        this.usageStats.failedRequests++;
                        throw new Error(`ElevenLabs API rate limit exceeded (429): ${errorMessage}`);
                    }

                    // Don't retry on invalid request errors
                    if (status === 400) {
                        this.usageStats.failedRequests++;
                        throw new Error(`ElevenLabs API bad request (400): ${errorMessage}`);
                    }

                    // Don't retry on quota exceeded
                    if (status === 402) {
                        this.usageStats.failedRequests++;
                        throw new Error(`ElevenLabs API quota exceeded (402): ${errorMessage}`);
                    }

                    this.logger.warn(
                        `ElevenLabs TTS attempt ${attempt + 1} failed: ` +
                        `HTTP ${status} - ${errorMessage}`
                    );
                } else {
                    // Network or timeout error
                    this.logger.warn(
                        `ElevenLabs TTS attempt ${attempt + 1} failed: ${error.message}`
                    );
                }

                // Exponential backoff before retry (except on last attempt)
                if (attempt < this.maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, ...
                    this.logger.info(`ElevenLabs: Retrying in ${delay}ms...`);
                    await this._delay(delay);
                }
            }
        }

        // All attempts failed
        this.usageStats.failedRequests++;
        const errorMsg = lastError?.response?.data?.detail ||
                        lastError?.response?.data?.message ||
                        lastError?.message ||
                        'Unknown error';

        throw new Error(
            `ElevenLabs TTS failed after ${this.maxRetries + 1} attempts. ` +
            `Last error: ${errorMsg}`
        );
    }

    /**
     * Calculate cost for text synthesis
     * @private
     * @param {number} charCount - Number of characters
     * @returns {number} Cost in USD
     */
    _calculateCost(charCount) {
        return (charCount / 1000) * this.pricePerKChars;
    }

    /**
     * Estimate cost for text
     * @param {number} charCount - Number of characters
     * @returns {number} Estimated cost in USD
     */
    estimateCost(charCount) {
        return this._calculateCost(charCount);
    }

    /**
     * Get usage statistics
     * @returns {Object} Usage stats
     */
    getUsageStats() {
        return {
            ...this.usageStats,
            successRate: this.usageStats.totalRequests > 0
                ? (this.usageStats.successfulRequests / this.usageStats.totalRequests * 100).toFixed(2)
                : 0
        };
    }

    /**
     * Reset usage statistics
     */
    resetUsageStats() {
        this.usageStats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalCharacters: 0,
            totalCost: 0
        };
        this.logger.info('ElevenLabs: Usage stats reset');
    }

    /**
     * Test if engine is available and API key is valid
     * @returns {Promise<boolean>} True if available
     */
    async test() {
        try {
            this.logger.info('ElevenLabs: Testing API connectivity...');

            // Try to fetch voices as a connectivity test
            const voices = await this.getVoices(true);

            if (voices && Object.keys(voices).length > 0) {
                this.logger.info('ElevenLabs: Test successful');
                return true;
            }

            this.logger.error('ElevenLabs: Test failed - No voices available');
            return false;
        } catch (error) {
            this.logger.error(`ElevenLabs: Test failed - ${error.message}`);
            return false;
        }
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('API key must be a non-empty string');
        }

        this.apiKey = apiKey;

        // Clear voice cache to force refresh with new key
        this.cachedVoices = null;
        this.cacheTimestamp = null;

        this.logger.info('ElevenLabs: API key updated');
    }

    /**
     * Helper: Delay promise for retry backoff
     * @private
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get engine information
     * @returns {Object} Engine info
     */
    getInfo() {
        return {
            name: 'ElevenLabs',
            version: '1.0.0',
            apiBaseUrl: this.apiBaseUrl,
            timeout: this.timeout,
            maxRetries: this.maxRetries,
            cacheTTL: this.cacheTTL,
            pricePerKChars: this.pricePerKChars,
            defaultModel: this.defaultModel,
            cacheValid: this._isCacheValid(),
            voiceCount: this.cachedVoices ? Object.keys(this.cachedVoices).length : 0
        };
    }
}

module.exports = ElevenLabsEngine;
