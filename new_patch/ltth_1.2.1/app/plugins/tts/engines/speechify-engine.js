const axios = require('axios');

/**
 * Speechify TTS Engine
 * Premium TTS with high-quality AI voices (requires API key)
 *
 * API Documentation (2025):
 * - Official Docs: https://docs.sws.speechify.com
 * - Base URL: https://api.sws.speechify.com/v1
 * - Voices: GET /v1/voices - https://docs.sws.speechify.com/api-reference/tts/voices/list
 * - Synthesis: POST /v1/audio/speech - https://docs.sws.speechify.com/api-reference/tts/audio/speech
 * - Audio Formats: mp3, wav, ogg, aac, pcm
 * - Speed Range: 0.5 - 2.0
 * - Authentication: Bearer token in Authorization header
 *
 * Features:
 * - 200+ voices in 30+ languages
 * - Human-like speech quality with voice cloning support
 * - SSML support with emotion control (angry, cheerful, sad, etc.)
 * - Language detection and multilingual support
 * - 1-hour voice caching for performance
 * - Automatic retry with exponential backoff
 * - Comprehensive error handling
 * - Cost tracking & budget monitoring
 * - Network diagnostics for troubleshooting
 *
 * Supported Languages (Fully):
 * - English (en), French (fr-FR), German (de-DE), Spanish (es-ES)
 * - Portuguese Brazil (pt-BR), Portuguese Portugal (pt-PT)
 *
 * Supported Emotions:
 * - angry, cheerful, sad, terrified, relaxed, fearful, surprised
 * - calm, assertive, energetic, warm, direct, bright
 *
 * Network Requirements:
 * - Outbound HTTPS access to api.sws.speechify.com
 * - DNS resolution for api.sws.speechify.com
 * - Port 443 (HTTPS) must be open
 */
class SpeechifyEngine {
    // Supported emotions for SSML
    static VALID_EMOTIONS = [
        'angry', 'cheerful', 'sad', 'terrified', 'relaxed', 
        'fearful', 'surprised', 'calm', 'assertive', 'energetic',
        'warm', 'direct', 'bright'
    ];

    // Language code mapping for Speechify API
    static LANGUAGE_MAP = {
        'en': 'en',        // English (auto-detect variant)
        'de': 'de-DE',     // German
        'fr': 'fr-FR',     // French
        'es': 'es-ES',     // Spanish
        'pt': 'pt-BR',     // Portuguese (Brazil)
        'it': 'it-IT',     // Italian (beta)
        'ja': 'ja-JP',     // Japanese (beta)
        'ru': 'ru-RU',     // Russian (beta)
        'ar': 'ar-AE',     // Arabic (beta)
        'nl': 'nl-NL',     // Dutch (beta)
        'pl': 'pl-PL',     // Polish (beta)
        'tr': 'tr-TR',     // Turkish (beta)
        'ko': 'ko-KR',     // Korean (coming soon)
        'zh': 'zh-CH',     // Mandarin (coming soon)
        'vi': 'vi-VN',     // Vietnamese (beta)
        'th': 'th-TH',     // Thai (coming soon)
        'hi': 'hi-IN',     // Hindi (beta)
        'he': 'he-IL',     // Hebrew (beta)
        'sv': 'sv-SE',     // Swedish (beta)
        'da': 'da-DK',     // Danish (beta)
        'fi': 'fi-FI',     // Finnish (beta)
        'no': 'nb-NO',     // Norwegian (beta)
        'el': 'el-GR',     // Greek (beta)
        'uk': 'uk-UA',     // Ukrainian (beta)
        'et': 'et-EE'      // Estonian (beta)
    };

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
            if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                this.logger.error(`Speechify: Network connectivity error - Unable to reach api.sws.speechify.com`);
                this.logger.error(`Speechify: Error code: ${error.code}`);
                this.logger.error(`Speechify: This may be caused by:`);
                this.logger.error(`Speechify:   1. Firewall blocking outbound HTTPS to api.sws.speechify.com`);
                this.logger.error(`Speechify:   2. DNS resolution failure for api.sws.speechify.com`);
                this.logger.error(`Speechify:   3. No internet connection or proxy issues`);
                this.logger.error(`Speechify: Please verify network settings and firewall rules`);
            } else if (statusCode === 404) {
                this.logger.error(`Speechify: Voices API returned 404 - API endpoint may have changed`);
                this.logger.error(`Speechify: Attempted URL: ${this.apiVoicesUrl}`);
                this.logger.error(`Speechify: Please check https://docs.sws.speechify.com for updated endpoint`);
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
     * Escape special characters for SSML
     * @private
     * @param {string} text - Text to escape
     * @returns {string} SSML-safe text
     */
    _escapeSSML(text) {
        if (!text) return text;
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Check if text is already SSML (contains <speak> tag)
     * @private
     * @param {string} text - Text to check
     * @returns {boolean} True if text is SSML
     */
    _isSSML(text) {
        if (!text) return false;
        return text.trim().startsWith('<speak>') || text.trim().startsWith('<speak ');
    }

    /**
     * Generate SSML with emotion tag
     * @private
     * @param {string} text - Plain text to wrap
     * @param {string} emotion - Emotion (angry, cheerful, sad, etc.)
     * @returns {string} SSML with emotion
     */
    _generateSSMLWithEmotion(text, emotion) {
        if (!text) return '';
        
        // Validate emotion using class constant
        if (!emotion || !SpeechifyEngine.VALID_EMOTIONS.includes(emotion.toLowerCase())) {
            // No emotion or invalid - just escape and wrap in speak tag
            return `<speak>${this._escapeSSML(text)}</speak>`;
        }
        
        // Escape text and wrap with emotion tag
        const escapedText = this._escapeSSML(text);
        return `<speak><speechify:style emotion="${emotion}">${escapedText}</speechify:style></speak>`;
    }

    /**
     * Map language code to Speechify language parameter
     * @private
     * @param {string} langCode - ISO language code (e.g., "en", "de")
     * @returns {string} Speechify language code (e.g., "en", "de-DE")
     */
    _mapLanguageCode(langCode) {
        if (!langCode) return null;
        return SpeechifyEngine.LANGUAGE_MAP[langCode.toLowerCase()] || null;
    }

    /**
     * Get fallback voices when API is unavailable
     * Static list of most common Speechify voices
     * 
     * Note: Speechify offers 200+ voices. This is a curated list of popular ones.
     * For the full list, use the API endpoint: GET /v1/voices
     * 
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
     * @param {Object} options - Optional parameters
     * @param {string} options.language - Language code (e.g., "en", "de-DE") for better quality
     * @param {string} options.emotion - Emotion for SSML (angry, cheerful, sad, etc.)
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId, speed = 1.0, options = {}) {
        if (!text || typeof text !== 'string') {
            throw new Error('Text is required and must be a string');
        }

        if (!voiceId || typeof voiceId !== 'string') {
            throw new Error('Voice ID is required and must be a string');
        }

        // Validate and clamp speed
        speed = Math.max(0.5, Math.min(2.0, parseFloat(speed) || 1.0));

        // Process options
        const { language, emotion } = options;
        
        // Prepare input text (apply SSML if emotion is specified)
        let inputText = text;
        let isSSML = this._isSSML(text);
        
        if (emotion && !isSSML) {
            // Generate SSML with emotion tag
            inputText = this._generateSSMLWithEmotion(text, emotion);
            isSSML = true;
            this.logger.debug(`Speechify: Generated SSML with emotion: ${emotion}`);
        }

        // Track usage
        this.usageStats.totalRequests++;
        this.usageStats.totalCharacters += text.length;

        let lastError = null;

        // Retry loop with exponential backoff
        for (let attempt = 0; attempt < this.maxRetries + 1; attempt++) {
            try {
                // Build request body
                const requestBody = {
                    input: inputText,
                    voice_id: voiceId,
                    audio_format: 'mp3',
                    speed: speed
                };

                // Add language parameter if specified (for better quality)
                if (language) {
                    const mappedLanguage = this._mapLanguageCode(language);
                    if (mappedLanguage) {
                        requestBody.language = mappedLanguage;
                        this.logger.debug(`Speechify: Using language parameter: ${mappedLanguage}`);
                    }
                }

                const response = await axios.post(
                    this.apiSynthesisUrl,
                    requestBody,
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

                // Handle response - try different response formats based on API version
                if (response.data) {
                    let audioData = null;

                    // Format 1: New API format (audio_data field)
                    if (response.data.audio_data) {
                        audioData = response.data.audio_data;
                        this.logger.debug('Speechify: Using response format: audio_data');
                    } 
                    // Format 2: Alternative field name (data)
                    else if (response.data.data) {
                        audioData = response.data.data;
                        this.logger.debug('Speechify: Using response format: data');
                    } 
                    // Format 3: Alternative field name (audioContent)
                    else if (response.data.audioContent) {
                        audioData = response.data.audioContent;
                        this.logger.debug('Speechify: Using response format: audioContent');
                    } 
                    // Format 4: Direct base64 string response
                    else if (typeof response.data === 'string' && response.data.length > 100) {
                        audioData = response.data;
                        this.logger.debug('Speechify: Using response format: direct string');
                    }
                    // Format 5: Buffer/binary data (convert to base64)
                    else if (Buffer.isBuffer(response.data)) {
                        audioData = response.data.toString('base64');
                        this.logger.debug('Speechify: Using response format: buffer converted to base64');
                    }

                    if (audioData) {
                        this.usageStats.successfulRequests++;

                        // Calculate and track cost
                        const cost = this._calculateCost(text.length);
                        this.usageStats.totalCost += cost;

                        const logDetails = [
                            `voice: ${voiceId}`,
                            `speed: ${speed}`,
                            `attempt: ${attempt + 1}`,
                            `chars: ${text.length}`,
                            `cost: $${cost.toFixed(4)}`
                        ];
                        
                        if (language) {
                            logDetails.push(`lang: ${language}`);
                        }
                        
                        if (emotion) {
                            logDetails.push(`emotion: ${emotion}`);
                        }

                        this.logger.info(
                            `Speechify TTS success: "${text.substring(0, 30)}..." ` +
                            `(${logDetails.join(', ')})`
                        );

                        return audioData;
                    } else {
                        // Log the response structure for debugging
                        this.logger.warn('Speechify: Unexpected response structure');
                        this.logger.debug('Speechify: Response keys:', Object.keys(response.data).join(', '));
                        throw new Error('Invalid response format from Speechify API - no audio data found');
                    }
                } else {
                    throw new Error('Empty response from Speechify API');
                }

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
                } else if (error.code === 'ENOTFOUND') {
                    // DNS resolution failure - network issue
                    this.logger.warn(
                        `Speechify TTS attempt ${attempt + 1} failed: DNS resolution error (ENOTFOUND)`
                    );
                    this.logger.warn('Speechify: Cannot resolve api.sws.speechify.com - check network/firewall');
                } else if (error.code === 'ECONNREFUSED') {
                    // Connection refused - network/firewall issue
                    this.logger.warn(
                        `Speechify TTS attempt ${attempt + 1} failed: Connection refused (ECONNREFUSED)`
                    );
                    this.logger.warn('Speechify: Connection blocked - check firewall settings');
                } else if (error.code === 'ETIMEDOUT') {
                    // Timeout error
                    this.logger.warn(
                        `Speechify TTS attempt ${attempt + 1} failed: Request timeout after ${this.timeout}ms`
                    );
                } else {
                    // Other network or timeout error
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
            
            // Provide helpful diagnostic information
            if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
                this.logger.error('Speechify: Network connectivity issue detected');
                this.logger.error('Speechify: Run network diagnostics with testConnectivity() method');
            }
            
            return false;
        }
    }

    /**
     * Test network connectivity to Speechify API
     * Useful for diagnosing connection issues
     * @returns {Promise<Object>} Diagnostic results
     */
    async testConnectivity() {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            baseUrl: this.apiBaseUrl,
            voicesUrl: this.apiVoicesUrl,
            synthesisUrl: this.apiSynthesisUrl,
            results: {
                dnsResolution: 'unknown',
                voicesEndpoint: 'unknown',
                synthesisEndpoint: 'unknown',
                authentication: 'unknown'
            },
            errors: []
        };

        this.logger.info('Speechify: Running network connectivity diagnostics...');

        // Test 1: Voices endpoint (checks DNS + connectivity + auth)
        try {
            const response = await axios.get(this.apiVoicesUrl, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TikTokLiveStreamTool/2.0'
                },
                timeout: this.timeout,
                validateStatus: () => true // Don't throw on any status
            });

            diagnostics.results.dnsResolution = 'success';
            diagnostics.results.voicesEndpoint = 'reachable';

            if (response.status === 200) {
                diagnostics.results.authentication = 'valid';
                this.logger.info('Speechify: ✓ Voices endpoint accessible and authenticated');
            } else if (response.status === 401 || response.status === 403) {
                diagnostics.results.authentication = 'invalid';
                diagnostics.errors.push(`Authentication failed: ${response.status} - ${response.data?.message || 'Invalid API key'}`);
                this.logger.warn('Speechify: ✗ Authentication failed - check API key');
            } else {
                diagnostics.results.voicesEndpoint = `error-${response.status}`;
                diagnostics.errors.push(`Voices endpoint returned ${response.status}`);
                this.logger.warn(`Speechify: ⚠ Voices endpoint returned ${response.status}`);
            }
        } catch (error) {
            if (error.code === 'ENOTFOUND') {
                diagnostics.results.dnsResolution = 'failed';
                diagnostics.errors.push('DNS resolution failed for api.sws.speechify.com');
                this.logger.error('Speechify: ✗ DNS resolution failed - domain not found');
            } else if (error.code === 'ECONNREFUSED') {
                diagnostics.results.dnsResolution = 'success';
                diagnostics.results.voicesEndpoint = 'connection-refused';
                diagnostics.errors.push('Connection refused by api.sws.speechify.com');
                this.logger.error('Speechify: ✗ Connection refused - firewall may be blocking');
            } else if (error.code === 'ETIMEDOUT') {
                diagnostics.results.dnsResolution = 'success';
                diagnostics.results.voicesEndpoint = 'timeout';
                diagnostics.errors.push(`Request timeout after ${this.timeout}ms`);
                this.logger.error('Speechify: ✗ Request timeout - slow connection or firewall');
            } else {
                diagnostics.results.voicesEndpoint = 'error';
                diagnostics.errors.push(`Network error: ${error.message}`);
                this.logger.error(`Speechify: ✗ Network error: ${error.message}`);
            }
        }

        // Test 2: Synthesis endpoint (if voices succeeded)
        if (diagnostics.results.authentication === 'valid') {
            try {
                const response = await axios.post(
                    this.apiSynthesisUrl,
                    { input: 'test', voice_id: 'george', audio_format: 'mp3' },
                    {
                        headers: {
                            'Authorization': `Bearer ${this.apiKey}`,
                            'Content-Type': 'application/json',
                            'User-Agent': 'TikTokLiveStreamTool/2.0'
                        },
                        timeout: this.timeout,
                        validateStatus: () => true
                    }
                );

                if (response.status === 200) {
                    diagnostics.results.synthesisEndpoint = 'working';
                    this.logger.info('Speechify: ✓ Synthesis endpoint working correctly');
                } else {
                    diagnostics.results.synthesisEndpoint = `error-${response.status}`;
                    diagnostics.errors.push(`Synthesis endpoint returned ${response.status}`);
                    this.logger.warn(`Speechify: ⚠ Synthesis endpoint returned ${response.status}`);
                }
            } catch (error) {
                diagnostics.results.synthesisEndpoint = 'error';
                diagnostics.errors.push(`Synthesis test failed: ${error.message}`);
                this.logger.error(`Speechify: ✗ Synthesis test error: ${error.message}`);
            }
        }

        // Log summary
        this.logger.info('Speechify: Diagnostic summary:');
        this.logger.info(`  DNS Resolution: ${diagnostics.results.dnsResolution}`);
        this.logger.info(`  Voices Endpoint: ${diagnostics.results.voicesEndpoint}`);
        this.logger.info(`  Synthesis Endpoint: ${diagnostics.results.synthesisEndpoint}`);
        this.logger.info(`  Authentication: ${diagnostics.results.authentication}`);
        
        if (diagnostics.errors.length > 0) {
            this.logger.error('Speechify: Errors encountered:');
            diagnostics.errors.forEach((err, idx) => {
                this.logger.error(`  ${idx + 1}. ${err}`);
            });
        }

        return diagnostics;
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

    /**
     * Create descriptive error message based on HTTP status code
     * @private
     * @param {number} statusCode - HTTP status code
     * @param {string} baseErrorMessage - Base error message from API
     * @returns {string} Enhanced error message with helpful context
     */
    _createVoiceCloneErrorMessage(statusCode, baseErrorMessage) {
        if (statusCode === 400) {
            return `Bad request - The Speechify API rejected the request. This may indicate that voice cloning is not available with your API key, or the request format is incorrect. Details: ${baseErrorMessage}`;
        } else if (statusCode === 401 || statusCode === 403) {
            return `Authentication failed - Voice cloning may not be available with your current Speechify API plan. Please check if your API key supports voice cloning. Details: ${baseErrorMessage}`;
        } else if (statusCode === 404) {
            return `Endpoint not found - The voice cloning endpoint may have changed or may not be available. Details: ${baseErrorMessage}`;
        }
        return baseErrorMessage;
    }

    /**
     * Create a custom voice clone
     * 
     * **IMPORTANT**: Voice cloning may not be available in all Speechify API plans.
     * This feature might require an enterprise/premium API key with voice cloning enabled.
     * 
     * @param {Object} options - Voice clone creation options
     * @param {string|Buffer} options.audioData - Audio sample (base64 string or Buffer)
     * @param {string} options.voiceName - Name for the custom voice
     * @param {string} options.language - Language code (e.g., 'en', 'de')
     * @param {string} options.consentConfirmation - Consent confirmation text
     * @returns {Promise<Object>} Created voice object with voice_id
     */
    async createVoiceClone(options) {
        const { audioData, voiceName, language = 'en', consentConfirmation } = options;

        if (!audioData) {
            throw new Error('Audio data is required for voice cloning');
        }

        if (!voiceName || typeof voiceName !== 'string') {
            throw new Error('Voice name is required and must be a string');
        }

        if (!consentConfirmation || typeof consentConfirmation !== 'string') {
            throw new Error('Consent confirmation is required');
        }

        try {
            this.logger.info(`Speechify: Creating voice clone "${voiceName}" (language: ${language})`);

            // Convert Buffer to base64 if needed
            const audioBase64 = Buffer.isBuffer(audioData) 
                ? audioData.toString('base64') 
                : audioData;

            // Prepare request body
            const requestBody = {
                audio_data: audioBase64,
                voice_name: voiceName,
                language: language,
                consent_confirmation: consentConfirmation
            };

            this.logger.info(`Speechify: Sending voice clone request to ${this.apiVoicesUrl}`);
            this.logger.debug(`Speechify: Request body keys: ${Object.keys(requestBody).join(', ')}`);
            this.logger.debug(`Speechify: Audio data length: ${audioBase64.length} characters (base64)`);

            const response = await axios.post(
                this.apiVoicesUrl,
                requestBody,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'TikTokLiveStreamTool/2.0'
                    },
                    timeout: this.timeout * 3, // Voice cloning may take longer
                    validateStatus: function (status) {
                        // Return true (don't throw) for 4xx client errors so we can provide
                        // context-specific error messages. Only throw on 5xx server errors.
                        return status < 500;
                    }
                }
            );

            // Check response status
            if (response.status !== 200 && response.status !== 201) {
                // Log full response for debugging
                this.logger.error(`Speechify: Voice clone API returned status ${response.status}`);
                this.logger.error(`Speechify: Response data:`, JSON.stringify(response.data, null, 2));
                
                const baseErrorMessage = response.data?.error?.message || 
                                   response.data?.message || 
                                   response.data?.error ||
                                   `HTTP ${response.status}`;
                
                const enhancedErrorMessage = this._createVoiceCloneErrorMessage(response.status, baseErrorMessage);
                throw new Error(enhancedErrorMessage);
            }

            if (response.data && (response.data.voice_id || response.data.id)) {
                const voiceId = response.data.voice_id || response.data.id;
                this.logger.info(`Speechify: Voice clone "${voiceName}" created successfully (ID: ${voiceId})`);

                // Invalidate voice cache to refresh list
                this.cachedVoices = null;
                this.cacheTimestamp = null;

                return {
                    voice_id: voiceId,
                    voice_name: voiceName,
                    language: language,
                    ...response.data
                };
            } else {
                throw new Error('Invalid response format from Speechify voice creation API');
            }
        } catch (error) {
            const statusCode = error.response?.status;
            const baseErrorMessage = error.response?.data?.error?.message || 
                               error.response?.data?.message || 
                               error.response?.data?.error ||
                               error.message;
            
            // Log full error response for debugging
            if (error.response?.data) {
                this.logger.error(`Speechify: Voice clone creation failed - Full API response:`, JSON.stringify(error.response.data, null, 2));
            }

            this.logger.error(`Speechify: Failed to create voice clone "${voiceName}" (${statusCode || 'network error'}): ${baseErrorMessage}`);
            
            // Use helper to create enhanced error message
            const enhancedErrorMessage = statusCode 
                ? this._createVoiceCloneErrorMessage(statusCode, baseErrorMessage)
                : baseErrorMessage;
            
            throw new Error(enhancedErrorMessage);
        }
    }

    /**
     * Get list of custom voice clones
     * Note: Fetches all voices and filters for custom ones client-side
     * @returns {Promise<Array>} List of custom voices
     */
    async getCustomVoices() {
        try {
            this.logger.info('Speechify: Fetching custom voice clones');

            // Fetch all voices from API
            const response = await axios.get(this.apiVoicesUrl, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TikTokLiveStreamTool/2.0'
                },
                timeout: this.timeout
            });

            // Helper function to check if a voice is custom
            const isCustomVoice = (voice) => {
                return voice.custom === true || 
                       voice.is_custom === true || 
                       voice.created_by_user === true ||
                       voice.type === 'custom';
            };

            let customVoices = [];

            // Handle different response formats and filter for custom voices
            if (response.data && Array.isArray(response.data.voices)) {
                customVoices = response.data.voices.filter(isCustomVoice);
            } else if (response.data && Array.isArray(response.data)) {
                customVoices = response.data.filter(isCustomVoice);
            }

            this.logger.info(`Speechify: Found ${customVoices.length} custom voice clones`);
            return customVoices;
        } catch (error) {
            this.logger.error(`Speechify: Failed to fetch custom voices: ${error.message}`);
            return []; // Return empty array on error
        }
    }

    /**
     * Delete a custom voice clone
     * @param {string} voiceId - Voice ID to delete
     * @returns {Promise<boolean>} True if successful
     */
    async deleteVoiceClone(voiceId) {
        if (!voiceId || typeof voiceId !== 'string') {
            throw new Error('Voice ID is required and must be a string');
        }

        try {
            this.logger.info(`Speechify: Deleting voice clone ${voiceId}`);

            await axios.delete(`${this.apiVoicesUrl}/${voiceId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'TikTokLiveStreamTool/2.0'
                },
                timeout: this.timeout
            });

            // Invalidate voice cache to refresh list
            this.cachedVoices = null;
            this.cacheTimestamp = null;

            this.logger.info(`Speechify: Voice clone ${voiceId} deleted successfully`);
            return true;
        } catch (error) {
            const statusCode = error.response?.status;
            const errorMessage = error.response?.data?.error?.message || 
                               error.response?.data?.message || 
                               error.message;

            this.logger.error(`Speechify: Failed to delete voice clone ${voiceId} (${statusCode || 'network error'}): ${errorMessage}`);
            
            throw new Error(`Failed to delete voice clone: ${errorMessage}`);
        }
    }
}

module.exports = SpeechifyEngine;
