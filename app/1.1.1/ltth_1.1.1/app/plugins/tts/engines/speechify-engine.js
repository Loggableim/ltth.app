const axios = require('axios');

/**
 * Speechify TTS Engine
 * Premium TTS with high-quality AI voices (requires API key)
 *
 * API Documentation:
 * - Base URL: https://api.sws.speechify.com/v1
 * - Voices: GET /voices
 * - Synthesis: POST /audio/speech
 * - Audio Format: MP3
 * - Speed Range: 0.5 - 2.0
 *
 * Features:
 * - 100+ voices in 30+ languages
 * - Human-like speech quality
 * - 1-hour voice caching
 * - Automatic retry with exponential backoff
 * - Comprehensive error handling
 * - Cost tracking & budget monitoring
 */
class SpeechifyEngine {
    constructor(apiKey, logger, config = {}) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Speechify API key is required and must be a non-empty string');
        }

        this.apiKey = apiKey;
        this.logger = logger;
        this.config = config;

        // API Configuration
        this.apiBaseUrl = 'https://api.sws.speechify.com/v1';
        this.apiVoicesUrl = `${this.apiBaseUrl}/voices`;
        this.apiSynthesisUrl = `${this.apiBaseUrl}/audio/speech`;

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
        this.logger.info(`Speechify TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);

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
        this.pricePerKChars = 0.015; // $0.015 per 1k chars

        this.logger.info('Speechify TTS engine initialized');
    }

    /**
     * Get all available Speechify voices
     * Uses 1-hour caching to reduce API calls
     * @param {boolean} forceRefresh - Force refresh cache
     * @returns {Promise<Object>} Voice map
     */
    async getVoices(forceRefresh = false) {
        // Return cached voices if available and not expired
        if (!forceRefresh && this.cachedVoices && this._isCacheValid()) {
            this.logger.info('Speechify: Returning cached voices');
            return this.cachedVoices;
        }

        // If a fetch is already in progress, return that promise
        if (this.voicesFetchPromise) {
            this.logger.info('Speechify: Returning in-progress voices fetch');
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
            this.logger.info('Speechify: Fetching voices from API');

            const response = await axios.get(this.apiVoicesUrl, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TikTokLiveStreamTool/2.0'
                },
                timeout: this.timeout
            });

            let voices = null;
            
            // Handle new API format (voices array in data.voices)
            if (response.data && Array.isArray(response.data.voices)) {
                voices = response.data.voices;
                this.logger.info('Speechify: Using new API format (data.voices)');
            } 
            // Handle legacy format (direct array in data) - backward compatibility
            else if (response.data && Array.isArray(response.data) && response.data.length > 0 && response.data[0]?.id) {
                voices = response.data;
                this.logger.info('Speechify: Using legacy API format (direct array) for backward compatibility');
            }

            if (voices) {
                const voiceMap = this._transformVoicesToMap(voices);

                // Update cache
                this.cachedVoices = voiceMap;
                this.cacheTimestamp = Date.now();

                this.logger.info(`Speechify: Fetched ${Object.keys(voiceMap).length} voices from API`);
                return voiceMap;
            } else {
                throw new Error('Invalid response format from Speechify voices API');
            }
        } catch (error) {
            const statusCode = error.response?.status;
            const errorMessage = error.response?.data?.error?.message || 
                               error.response?.data?.message || 
                               error.message;
            
            // Log detailed error for debugging
            if (statusCode === 404) {
                this.logger.error(`Speechify: Voices API returned 404 - API endpoint may have changed`);
                this.logger.error(`Speechify: Attempted URL: ${this.apiVoicesUrl}`);
                this.logger.error(`Speechify: Please check https://speechify.com/api for updated endpoint`);
            } else {
                this.logger.error(`Speechify: Failed to fetch voices from API (${statusCode || 'network error'}): ${errorMessage}`);
            }

            // If cache exists (even if expired), return it as fallback
            if (this.cachedVoices) {
                this.logger.warn('Speechify: Using expired cache as fallback');
                return this.cachedVoices;
            }

            // Otherwise, return static fallback voices
            this.logger.warn('Speechify: Using static fallback voices');
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
            // Skip null/undefined entries
            if (!voice) continue;
            
            // Handle both old and new API response formats
            const voiceId = voice.voice_id || voice.id;
            const voiceName = voice.display_name || voice.name;
            
            if (voiceId && voiceName) {
                voiceMap[voiceId] = {
                    name: voiceName,
                    lang: this._extractLanguageCode(voice.language || voice.lang || 'en'),
                    language: voice.language || voice.lang || 'en-US',
                    gender: voice.gender || 'neutral',
                    style: voice.style || 'standard',
                    engine: 'speechify'
                };
            }
        }

        return voiceMap;
    }

    /**
     * Extract language code from full language tag
     * @private
     * @param {string} languageTag - e.g., "en-US"
     * @returns {string} Language code - e.g., "en"
     */
    _extractLanguageCode(languageTag) {
        if (!languageTag) return 'en';
        return languageTag.split('-')[0].toLowerCase();
    }

    /**
     * Get fallback voices when API is unavailable
     * Static list of most common Speechify voices
     * @private
     * @returns {Object} Fallback voice map
     */
    _getFallbackVoices() {
        return {
            // English Voices
            'george': { name: 'George - Conversational', lang: 'en', language: 'en-US', gender: 'male', style: 'conversational' },
            'henry': { name: 'Henry - Narrative', lang: 'en', language: 'en-US', gender: 'male', style: 'narrative' },
            'mrbeast': { name: 'Mr. Beast', lang: 'en', language: 'en-US', gender: 'male', style: 'energetic' },
            'snoop': { name: 'Snoop', lang: 'en', language: 'en-US', gender: 'male', style: 'casual' },
            'gwyneth': { name: 'Gwyneth', lang: 'en', language: 'en-US', gender: 'female', style: 'professional' },
            'emma': { name: 'Emma', lang: 'en', language: 'en-US', gender: 'female', style: 'friendly' },

            // German Voices
            'mads': { name: 'Mads - Deutsch', lang: 'de', language: 'de-DE', gender: 'male', style: 'standard' },
            'marlene': { name: 'Marlene - Deutsch', lang: 'de', language: 'de-DE', gender: 'female', style: 'standard' },

            // Spanish Voices
            'diego': { name: 'Diego - Español', lang: 'es', language: 'es-ES', gender: 'male', style: 'standard' },
            'camila': { name: 'Camila - Español', lang: 'es', language: 'es-ES', gender: 'female', style: 'standard' },

            // French Voices
            'thomas': { name: 'Thomas - Français', lang: 'fr', language: 'fr-FR', gender: 'male', style: 'standard' },
            'marie': { name: 'Marie - Français', lang: 'fr', language: 'fr-FR', gender: 'female', style: 'standard' },

            // Italian Voices
            'luca': { name: 'Luca - Italiano', lang: 'it', language: 'it-IT', gender: 'male', style: 'standard' },
            'sofia': { name: 'Sofia - Italiano', lang: 'it', language: 'it-IT', gender: 'female', style: 'standard' },

            // Portuguese Voices
            'miguel': { name: 'Miguel - Português', lang: 'pt', language: 'pt-BR', gender: 'male', style: 'standard' },
            'ana': { name: 'Ana - Português', lang: 'pt', language: 'pt-BR', gender: 'female', style: 'standard' },

            // Japanese Voices
            'kenji': { name: 'Kenji - 日本語', lang: 'ja', language: 'ja-JP', gender: 'male', style: 'standard' },
            'sakura': { name: 'Sakura - 日本語', lang: 'ja', language: 'ja-JP', gender: 'female', style: 'standard' },

            // Korean Voices
            'minho': { name: 'Minho - 한국어', lang: 'ko', language: 'ko-KR', gender: 'male', style: 'standard' },
            'jieun': { name: 'Jieun - 한국어', lang: 'ko', language: 'ko-KR', gender: 'female', style: 'standard' }
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
            'en': 'george',      // English - George (Conversational)
            'de': 'mads',        // German - Mads
            'es': 'diego',       // Spanish - Diego
            'fr': 'thomas',      // French - Thomas
            'it': 'luca',        // Italian - Luca
            'pt': 'miguel',      // Portuguese - Miguel
            'ja': 'kenji',       // Japanese - Kenji
            'ko': 'minho',       // Korean - Minho
            'zh': 'george',      // Chinese - Fallback to George
            'ru': 'george',      // Russian - Fallback to George
            'ar': 'george',      // Arabic - Fallback to George
            'tr': 'george',      // Turkish - Fallback to George
            'vi': 'george',      // Vietnamese - Fallback to George
            'th': 'george',      // Thai - Fallback to George
            'nl': 'george',      // Dutch - Fallback to George
            'pl': 'george',      // Polish - Fallback to George
            'id': 'george'       // Indonesian - Fallback to George
        };

        return languageDefaults[langCode] || 'george'; // Default to George
    }

    /**
     * Synthesize text to speech audio
     * @param {string} text - Text to synthesize (max 300 chars recommended)
     * @param {string} voiceId - Speechify voice ID
     * @param {number} speed - Speaking rate (0.5 - 2.0)
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId, speed = 1.0) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text is required and must be a string');
        }

        if (!voiceId || typeof voiceId !== 'string') {
            throw new Error('Voice ID is required and must be a string');
        }

        // Validate and clamp speed
        speed = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));

        // Track usage
        this.usageStats.totalRequests++;
        this.usageStats.totalCharacters += text.length;

        let lastError = null;

        // Retry loop with exponential backoff
        for (let attempt = 0; attempt < this.maxRetries + 1; attempt++) {
            try {
                const response = await axios.post(
                    this.apiSynthesisUrl,
                    {
                        input: text,
                        voice_id: voiceId,
                        audio_format: 'mp3',
                        speed: speed
                    },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                            'User-Agent': 'TikTokLiveStreamTool/2.0'
                        },
                        timeout: this.timeout,
                        validateStatus: (status) => {
                            // Accept 2xx status codes
                            return status >= 200 && status < 300;
                        }
                    }
                );

                // Handle response
                if (response.data) {
                    let audioData = null;

                    // Try different response formats
                    if (response.data.audio_data) {
                        audioData = response.data.audio_data;
                    } else if (response.data.data) {
                        audioData = response.data.data;
                    } else if (response.data.audioContent) {
                        audioData = response.data.audioContent;
                    } else if (typeof response.data === 'string' && response.data.length > 100) {
                        audioData = response.data;
                    }

                    if (audioData) {
                        this.usageStats.successfulRequests++;

                        // Calculate and track cost
                        const cost = this._calculateCost(text.length);
                        this.usageStats.totalCost += cost;

                        this.logger.info(
                            `Speechify TTS success: "${text.substring(0, 30)}..." ` +
                            `(voice: ${voiceId}, speed: ${speed}, attempt: ${attempt + 1}, ` +
                            `chars: ${text.length}, cost: $${cost.toFixed(4)})`
                        );

                        return audioData;
                    }
                }

                throw new Error('Invalid response format from Speechify API');

            } catch (error) {
                lastError = error;

                // Handle specific error types
                if (error.response) {
                    const status = error.response.status;
                    const errorMessage = error.response.data?.error?.message ||
                                       error.response.data?.error ||
                                       error.response.data?.message ||
                                       'Unknown error';

                    // Don't retry on authentication/authorization errors
                    if (status === 401) {
                        this.usageStats.failedRequests++;
                        throw new Error(`Speechify API authentication failed (401): Invalid API key`);
                    }

                    if (status === 403) {
                        this.usageStats.failedRequests++;
                        throw new Error(`Speechify API access forbidden (403): ${errorMessage}`);
                    }

                    // Don't retry on rate limit errors (should be handled at higher level)
                    if (status === 429) {
                        this.usageStats.failedRequests++;
                        throw new Error(`Speechify API rate limit exceeded (429): ${errorMessage}`);
                    }

                    // Don't retry on invalid request errors
                    if (status === 400) {
                        this.usageStats.failedRequests++;
                        throw new Error(`Speechify API bad request (400): ${errorMessage}`);
                    }

                    this.logger.warn(
                        `Speechify TTS attempt ${attempt + 1} failed: ` +
                        `HTTP ${status} - ${errorMessage}`
                    );
                } else {
                    // Network or timeout error
                    this.logger.warn(
                        `Speechify TTS attempt ${attempt + 1} failed: ${error.message}`
                    );
                }

                // Exponential backoff before retry (except on last attempt)
                if (attempt < this.maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, ...
                    this.logger.info(`Speechify: Retrying in ${delay}ms...`);
                    await this._delay(delay);
                }
            }
        }

        // All attempts failed
        this.usageStats.failedRequests++;
        const errorMsg = lastError?.response?.data?.error?.message ||
                        lastError?.response?.data?.message ||
                        lastError?.message ||
                        'Unknown error';

        throw new Error(
            `Speechify TTS failed after ${this.maxRetries + 1} attempts. ` +
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
        this.logger.info('Speechify: Usage stats reset');
    }

    /**
     * Test if engine is available and API key is valid
     * @returns {Promise<boolean>} True if available
     */
    async test() {
        try {
            this.logger.info('Speechify: Testing API connectivity...');

            // Try to synthesize a short test message
            const testText = 'Test';
            const testVoice = 'george';
            const audio = await this.synthesize(testText, testVoice, 1.0);

            if (audio && audio.length > 100) {
                this.logger.info('Speechify: Test successful');
                return true;
            }

            this.logger.error('Speechify: Test failed - Invalid response');
            return false;
        } catch (error) {
            this.logger.error(`Speechify: Test failed - ${error.message}`);
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

        this.logger.info('Speechify: API key updated');
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
            name: 'Speechify',
            version: '1.0.0',
            apiBaseUrl: this.apiBaseUrl,
            timeout: this.timeout,
            maxRetries: this.maxRetries,
            cacheTTL: this.cacheTTL,
            pricePerKChars: this.pricePerKChars,
            cacheValid: this._isCacheValid(),
            voiceCount: this.cachedVoices ? Object.keys(this.cachedVoices).length : 0
        };
    }
}

module.exports = SpeechifyEngine;
