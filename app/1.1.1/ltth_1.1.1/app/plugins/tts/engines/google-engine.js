const axios = require('axios');

/**
 * Google Cloud Text-to-Speech Engine
 * Premium TTS with high-quality voices (requires API key)
 */
class GoogleEngine {
    constructor(apiKey, logger, config = {}) {
        this.apiKey = apiKey;
        this.logger = logger;
        this.apiUrl = 'https://texttospeech.googleapis.com/v1/text:synthesize';
        
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
        this.logger.info(`Google TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);
    }

    /**
     * Get all available Google TTS voices
     */
    static getVoices() {
        return {
            // German
            'de-DE-Wavenet-A': { name: 'Deutsch (Wavenet A)', lang: 'de', gender: 'female', style: 'wavenet' },
            'de-DE-Wavenet-B': { name: 'Deutsch (Wavenet B)', lang: 'de', gender: 'male', style: 'wavenet' },
            'de-DE-Wavenet-C': { name: 'Deutsch (Wavenet C)', lang: 'de', gender: 'female', style: 'wavenet' },
            'de-DE-Wavenet-D': { name: 'Deutsch (Wavenet D)', lang: 'de', gender: 'male', style: 'wavenet' },
            'de-DE-Wavenet-E': { name: 'Deutsch (Wavenet E)', lang: 'de', gender: 'male', style: 'wavenet' },
            'de-DE-Wavenet-F': { name: 'Deutsch (Wavenet F)', lang: 'de', gender: 'female', style: 'wavenet' },
            'de-DE-Standard-A': { name: 'Deutsch (Standard A)', lang: 'de', gender: 'female', style: 'standard' },
            'de-DE-Standard-B': { name: 'Deutsch (Standard B)', lang: 'de', gender: 'male', style: 'standard' },
            'de-DE-Neural2-A': { name: 'Deutsch (Neural2 A)', lang: 'de', gender: 'female', style: 'neural2' },
            'de-DE-Neural2-B': { name: 'Deutsch (Neural2 B)', lang: 'de', gender: 'male', style: 'neural2' },

            // English (US)
            'en-US-Wavenet-A': { name: 'English US (Wavenet A)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-US-Wavenet-B': { name: 'English US (Wavenet B)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-US-Wavenet-C': { name: 'English US (Wavenet C)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-US-Wavenet-D': { name: 'English US (Wavenet D)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-US-Wavenet-E': { name: 'English US (Wavenet E)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-US-Wavenet-F': { name: 'English US (Wavenet F)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-US-Wavenet-G': { name: 'English US (Wavenet G)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-US-Wavenet-H': { name: 'English US (Wavenet H)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-US-Wavenet-I': { name: 'English US (Wavenet I)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-US-Wavenet-J': { name: 'English US (Wavenet J)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-US-Standard-A': { name: 'English US (Standard A)', lang: 'en', gender: 'male', style: 'standard' },
            'en-US-Standard-B': { name: 'English US (Standard B)', lang: 'en', gender: 'male', style: 'standard' },
            'en-US-Standard-C': { name: 'English US (Standard C)', lang: 'en', gender: 'female', style: 'standard' },
            'en-US-Standard-D': { name: 'English US (Standard D)', lang: 'en', gender: 'male', style: 'standard' },
            'en-US-Neural2-A': { name: 'English US (Neural2 A)', lang: 'en', gender: 'male', style: 'neural2' },
            'en-US-Neural2-C': { name: 'English US (Neural2 C)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-US-Neural2-D': { name: 'English US (Neural2 D)', lang: 'en', gender: 'male', style: 'neural2' },
            'en-US-Neural2-E': { name: 'English US (Neural2 E)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-US-Neural2-F': { name: 'English US (Neural2 F)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-US-Neural2-G': { name: 'English US (Neural2 G)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-US-Neural2-H': { name: 'English US (Neural2 H)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-US-Neural2-I': { name: 'English US (Neural2 I)', lang: 'en', gender: 'male', style: 'neural2' },
            'en-US-Neural2-J': { name: 'English US (Neural2 J)', lang: 'en', gender: 'male', style: 'neural2' },

            // English (GB)
            'en-GB-Wavenet-A': { name: 'English GB (Wavenet A)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-GB-Wavenet-B': { name: 'English GB (Wavenet B)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-GB-Wavenet-C': { name: 'English GB (Wavenet C)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-GB-Wavenet-D': { name: 'English GB (Wavenet D)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-GB-Wavenet-F': { name: 'English GB (Wavenet F)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-GB-Standard-A': { name: 'English GB (Standard A)', lang: 'en', gender: 'female', style: 'standard' },
            'en-GB-Standard-B': { name: 'English GB (Standard B)', lang: 'en', gender: 'male', style: 'standard' },
            'en-GB-Neural2-A': { name: 'English GB (Neural2 A)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-GB-Neural2-B': { name: 'English GB (Neural2 B)', lang: 'en', gender: 'male', style: 'neural2' },

            // English (AU)
            'en-AU-Wavenet-A': { name: 'English AU (Wavenet A)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-AU-Wavenet-B': { name: 'English AU (Wavenet B)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-AU-Wavenet-C': { name: 'English AU (Wavenet C)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-AU-Wavenet-D': { name: 'English AU (Wavenet D)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-AU-Neural2-A': { name: 'English AU (Neural2 A)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-AU-Neural2-B': { name: 'English AU (Neural2 B)', lang: 'en', gender: 'male', style: 'neural2' },

            // Spanish
            'es-ES-Wavenet-A': { name: 'Español (Wavenet A)', lang: 'es', gender: 'female', style: 'wavenet' },
            'es-ES-Wavenet-B': { name: 'Español (Wavenet B)', lang: 'es', gender: 'male', style: 'wavenet' },
            'es-ES-Neural2-A': { name: 'Español (Neural2 A)', lang: 'es', gender: 'female', style: 'neural2' },

            // French
            'fr-FR-Wavenet-A': { name: 'Français (Wavenet A)', lang: 'fr', gender: 'female', style: 'wavenet' },
            'fr-FR-Wavenet-B': { name: 'Français (Wavenet B)', lang: 'fr', gender: 'male', style: 'wavenet' },
            'fr-FR-Wavenet-C': { name: 'Français (Wavenet C)', lang: 'fr', gender: 'female', style: 'wavenet' },
            'fr-FR-Wavenet-D': { name: 'Français (Wavenet D)', lang: 'fr', gender: 'male', style: 'wavenet' },
            'fr-FR-Neural2-A': { name: 'Français (Neural2 A)', lang: 'fr', gender: 'female', style: 'neural2' },

            // Italian
            'it-IT-Wavenet-A': { name: 'Italiano (Wavenet A)', lang: 'it', gender: 'female', style: 'wavenet' },
            'it-IT-Wavenet-B': { name: 'Italiano (Wavenet B)', lang: 'it', gender: 'female', style: 'wavenet' },
            'it-IT-Wavenet-C': { name: 'Italiano (Wavenet C)', lang: 'it', gender: 'male', style: 'wavenet' },
            'it-IT-Wavenet-D': { name: 'Italiano (Wavenet D)', lang: 'it', gender: 'male', style: 'wavenet' },

            // Japanese
            'ja-JP-Wavenet-A': { name: '日本語 (Wavenet A)', lang: 'ja', gender: 'female', style: 'wavenet' },
            'ja-JP-Wavenet-B': { name: '日本語 (Wavenet B)', lang: 'ja', gender: 'female', style: 'wavenet' },
            'ja-JP-Wavenet-C': { name: '日本語 (Wavenet C)', lang: 'ja', gender: 'male', style: 'wavenet' },
            'ja-JP-Wavenet-D': { name: '日本語 (Wavenet D)', lang: 'ja', gender: 'male', style: 'wavenet' },
            'ja-JP-Neural2-B': { name: '日本語 (Neural2 B)', lang: 'ja', gender: 'female', style: 'neural2' },
            'ja-JP-Neural2-C': { name: '日本語 (Neural2 C)', lang: 'ja', gender: 'male', style: 'neural2' },

            // Korean
            'ko-KR-Wavenet-A': { name: '한국어 (Wavenet A)', lang: 'ko', gender: 'female', style: 'wavenet' },
            'ko-KR-Wavenet-B': { name: '한국어 (Wavenet B)', lang: 'ko', gender: 'female', style: 'wavenet' },
            'ko-KR-Wavenet-C': { name: '한국어 (Wavenet C)', lang: 'ko', gender: 'male', style: 'wavenet' },
            'ko-KR-Wavenet-D': { name: '한국어 (Wavenet D)', lang: 'ko', gender: 'male', style: 'wavenet' },

            // Portuguese (BR)
            'pt-BR-Wavenet-A': { name: 'Português BR (Wavenet A)', lang: 'pt', gender: 'female', style: 'wavenet' },
            'pt-BR-Wavenet-B': { name: 'Português BR (Wavenet B)', lang: 'pt', gender: 'male', style: 'wavenet' },
            'pt-BR-Neural2-A': { name: 'Português BR (Neural2 A)', lang: 'pt', gender: 'female', style: 'neural2' },
            'pt-BR-Neural2-B': { name: 'Português BR (Neural2 B)', lang: 'pt', gender: 'male', style: 'neural2' }
        };
    }

    /**
     * Get default voice for a language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const languageDefaults = {
            'de': 'de-DE-Wavenet-A',
            'en': 'en-US-Wavenet-C',
            'es': 'es-ES-Wavenet-A',
            'fr': 'fr-FR-Wavenet-A',
            'pt': 'pt-BR-Wavenet-A',
            'it': 'it-IT-Wavenet-A',
            'ja': 'ja-JP-Wavenet-A',
            'ko': 'ko-KR-Wavenet-A'
        };

        return languageDefaults[langCode] || 'en-US-Wavenet-C';
    }

    /**
     * Generate TTS audio from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - Google voice ID
     * @param {number} speed - Speaking rate (0.25 - 4.0)
     * @param {number} pitch - Speaking pitch (-20.0 - 20.0)
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId, speed = 1.0, pitch = 0.0) {
        if (!this.apiKey) {
            throw new Error('Google TTS API key not configured');
        }

        // Parse language code from voice ID (e.g., "de-DE-Wavenet-A" -> "de-DE")
        const languageCode = voiceId.substring(0, 5);

        let lastError;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    `${this.apiUrl}?key=${this.apiKey}`,
                    {
                        input: { text: text },
                        voice: {
                            languageCode: languageCode,
                            name: voiceId
                        },
                        audioConfig: {
                            audioEncoding: 'MP3',
                            speakingRate: Math.max(0.25, Math.min(4.0, speed)),
                            pitch: Math.max(-20.0, Math.min(20.0, pitch)),
                            effectsProfileId: ['headphone-class-device']
                        }
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        timeout: this.timeout
                    }
                );

                if (response.data && response.data.audioContent) {
                    this.logger.info(`Google TTS success: ${text.substring(0, 30)}... (voice: ${voiceId}, attempt: ${attempt + 1})`);
                    return response.data.audioContent;
                }

                throw new Error('Invalid response format from Google TTS API');

            } catch (error) {
                lastError = error;
                const errorMsg = error.response?.data?.error?.message || error.message;
                this.logger.warn(`Google TTS attempt ${attempt + 1} failed: ${errorMsg}`);

                // Check for quota/auth errors (don't retry)
                if (error.response?.status === 429 || error.response?.status === 403 || error.response?.status === 401) {
                    // Provide helpful error messages for common issues
                    if (error.response.status === 401 || error.response.status === 403) {
                        const helpfulMsg = this._getAuthErrorHelp(errorMsg);
                        this.logger.error(`Google TTS Authentication Error: ${helpfulMsg}`);
                        throw new Error(`Google TTS ${error.response.status}: ${helpfulMsg}`);
                    }
                    throw new Error(`Google TTS ${error.response.status}: ${errorMsg}`);
                }

                // Exponential backoff for other errors
                if (attempt < this.maxRetries - 1) {
                    await this._delay(Math.pow(2, attempt) * 1000);
                }
            }
        }

        throw new Error(`Google TTS failed after ${this.maxRetries} attempts. Last error: ${lastError?.message || 'Unknown'}`);
    }

    /**
     * Get helpful error message for authentication errors
     * @private
     */
    _getAuthErrorHelp(errorMsg) {
        // Handle null/undefined error messages
        if (!errorMsg) {
            return 'Authentication error occurred. Please check your Google Cloud TTS API key configuration.';
        }
        
        // Check for OAuth2 error message
        if (errorMsg.includes('OAuth2') || errorMsg.includes('Expected OAuth2 access token')) {
            return 'Google Cloud TTS API requires an API key, not OAuth2 tokens. ' +
                   'Please ensure you have:\n' +
                   '1. Created a Google Cloud Project\n' +
                   '2. Enabled the Text-to-Speech API\n' +
                   '3. Created an API Key (not OAuth credentials)\n' +
                   '4. Enabled billing for your project\n' +
                   '5. Added the API key to TTS Admin Panel > Configuration\n' +
                   'Visit: https://console.cloud.google.com/apis/credentials';
        }
        
        if (errorMsg.includes('API key not valid')) {
            return 'Your Google Cloud API key is invalid. Please check:\n' +
                   '1. The API key is correctly copied\n' +
                   '2. The API key has not been revoked\n' +
                   '3. API restrictions allow Text-to-Speech API\n' +
                   'Visit: https://console.cloud.google.com/apis/credentials';
        }
        
        if (errorMsg.includes('billing')) {
            return 'Google Cloud TTS requires billing to be enabled. Please:\n' +
                   '1. Visit https://console.cloud.google.com/billing\n' +
                   '2. Enable billing for your project\n' +
                   '3. Wait a few minutes for changes to propagate';
        }
        
        // Return original error message if no specific pattern matched
        return errorMsg;
    }

    /**
     * Helper: Delay promise
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Test if engine is available
     */
    async test() {
        try {
            await this.synthesize('Test', 'en-US-Standard-A');
            return true;
        } catch (error) {
            this.logger.error(`Google TTS engine test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Update API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
    }
}

module.exports = GoogleEngine;
