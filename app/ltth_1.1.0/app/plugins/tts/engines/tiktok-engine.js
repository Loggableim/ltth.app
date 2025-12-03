const axios = require('axios');
const TikTokSessionExtractor = require('./tiktok-session-extractor');

/**
 * TikTok TTS Engine
 * Uses TikTok's official API endpoints with SessionID authentication
 * Based on research from TikTok-Chat-Reader and community TTS projects
 * 
 * 🔑 MANUAL SESSIONID SETUP (December 2024):
 * Configure your TikTok SessionID via the TTS Admin Panel:
 * 1. Open TTS Admin Panel > Configuration tab
 * 2. Find "TikTok SessionID" section
 * 3. Follow the German instructions to extract your SessionID
 * 4. Paste it into the input field and save
 * 
 * ALTERNATIVE SETUP:
 * Set TIKTOK_SESSION_ID environment variable with your SessionID
 * 
 * A fallback SessionID is provided for testing, but for best reliability
 * you should configure your own SessionID in the Admin Panel.
 */
class TikTokEngine {
    constructor(logger, config = {}) {
        this.logger = logger;
        this.config = config;
        
        // Fallback SessionID (provided by user)
        const FALLBACK_SESSION_ID = 'd0613ed4ad91345d1b376a1d21f6dd1a';
        
        // Get SessionID from config or environment, with fallback
        this.sessionId = config.sessionId || process.env.TIKTOK_SESSION_ID || FALLBACK_SESSION_ID;
        this.sessionExtractor = new TikTokSessionExtractor(logger);
        this.autoExtractEnabled = false; // Disabled by default - use manual entry instead
        
        // Direct TikTok API endpoints (require SessionID for authentication)
        // Updated endpoints as of November 2025 - TikTok rotates between "normal" and "core" variants
        // Multiple endpoint versions (api16, api19, api22) with both -normal- and -core- variants for maximum redundancy
        // Community reports show both variants can work depending on region and TikTok's backend routing
        this.apiEndpoints = [
            // -normal- variant endpoints (commonly working as of Nov 2025)
            {
                url: 'https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api19-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api22-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-normal-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-normal-c-useast2a.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            // -core- variant endpoints (backup endpoints)
            {
                url: 'https://api16-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api19-core-c-useast1a.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-core-useast5.us.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api22-core-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            {
                url: 'https://api16-core-c-alisg.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            }
        ];
        
        this.currentEndpointIndex = 0;
        this.timeout = 10000; // 10s timeout
        this.maxRetries = 1; // One retry per endpoint
        this.maxChunkLength = 300; // TikTok API limit per request
        
        // Log SessionID status
        if (this.sessionId) {
            const isFallback = this.sessionId === 'd0613ed4ad91345d1b376a1d21f6dd1a';
            if (isFallback) {
                this.logger.info(`✅ TikTok SessionID using fallback (length: ${this.sessionId.length} chars)`);
                this.logger.info('💡 For better reliability, set your own SessionID in TTS Admin Panel');
            } else {
                this.logger.info(`✅ TikTok SessionID configured (length: ${this.sessionId.length} chars)`);
            }
        } else {
            this.logger.warn('⚠️  No TikTok SessionID configured. TikTok TTS will not work.');
            this.logger.warn('💡 To fix: Set TIKTOK_SESSION_ID in TTS Admin Panel');
            this.logger.warn('📚 See: plugins/tts/engines/TIKTOK_TTS_STATUS.md for instructions.');
        }
    }

    /**
     * Get all available voices for TikTok TTS
     */
    static getVoices() {
        return {
            // English - Characters/Disney
            'en_us_ghostface': { name: 'Ghostface (Scream)', lang: 'en', gender: 'male', style: 'character' },
            'en_us_chewbacca': { name: 'Chewbacca', lang: 'en', gender: 'male', style: 'character' },
            'en_us_c3po': { name: 'C3PO', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stitch': { name: 'Stitch', lang: 'en', gender: 'male', style: 'character' },
            'en_us_stormtrooper': { name: 'Stormtrooper', lang: 'en', gender: 'male', style: 'character' },
            'en_us_rocket': { name: 'Rocket', lang: 'en', gender: 'male', style: 'character' },

            // English - Standard
            'en_male_narration': { name: 'Male Narrator', lang: 'en', gender: 'male', style: 'narration' },
            'en_male_funny': { name: 'Male Funny', lang: 'en', gender: 'male', style: 'funny' },
            'en_female_emotional': { name: 'Female Emotional', lang: 'en', gender: 'female', style: 'emotional' },
            'en_female_samc': { name: 'Female Friendly', lang: 'en', gender: 'female', style: 'friendly' },
            'en_us_001': { name: 'US Female 1', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_002': { name: 'US Female 2', lang: 'en', gender: 'female', style: 'standard' },
            'en_us_006': { name: 'US Male 1', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_007': { name: 'US Male 2', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_009': { name: 'US Male 3', lang: 'en', gender: 'male', style: 'standard' },
            'en_us_010': { name: 'US Male 4', lang: 'en', gender: 'male', style: 'standard' },
            'en_uk_001': { name: 'UK Male 1', lang: 'en', gender: 'male', style: 'british' },
            'en_uk_003': { name: 'UK Female 1', lang: 'en', gender: 'female', style: 'british' },
            'en_au_001': { name: 'Australian Female', lang: 'en', gender: 'female', style: 'australian' },
            'en_au_002': { name: 'Australian Male', lang: 'en', gender: 'male', style: 'australian' },

            // German
            'de_001': { name: 'Deutsch Männlich', lang: 'de', gender: 'male', style: 'standard' },
            'de_002': { name: 'Deutsch Weiblich', lang: 'de', gender: 'female', style: 'standard' },

            // Spanish
            'es_002': { name: 'Español Male', lang: 'es', gender: 'male', style: 'standard' },
            'es_mx_002': { name: 'Español MX Female', lang: 'es', gender: 'female', style: 'mexican' },

            // French
            'fr_001': { name: 'Français Male', lang: 'fr', gender: 'male', style: 'standard' },
            'fr_002': { name: 'Français Female', lang: 'fr', gender: 'female', style: 'standard' },

            // Portuguese
            'pt_female': { name: 'Português Female', lang: 'pt', gender: 'female', style: 'standard' },
            'br_003': { name: 'Português BR Female', lang: 'pt', gender: 'female', style: 'brazilian' },
            'br_004': { name: 'Português BR Male', lang: 'pt', gender: 'male', style: 'brazilian' },
            'br_005': { name: 'Português BR Friendly', lang: 'pt', gender: 'female', style: 'friendly' },

            // Italian
            'it_male_m18': { name: 'Italiano Male', lang: 'it', gender: 'male', style: 'standard' },

            // Japanese
            'jp_001': { name: '日本語 Female', lang: 'ja', gender: 'female', style: 'standard' },
            'jp_003': { name: '日本語 Male', lang: 'ja', gender: 'male', style: 'standard' },
            'jp_005': { name: '日本語 Energetic', lang: 'ja', gender: 'female', style: 'energetic' },
            'jp_006': { name: '日本語 Calm', lang: 'ja', gender: 'male', style: 'calm' },

            // Korean
            'kr_002': { name: '한국어 Male', lang: 'ko', gender: 'male', style: 'standard' },
            'kr_003': { name: '한국어 Female', lang: 'ko', gender: 'female', style: 'standard' },
            'kr_004': { name: '한국어 Bright', lang: 'ko', gender: 'female', style: 'bright' },

            // Indonesian
            'id_001': { name: 'Bahasa Indonesia Female', lang: 'id', gender: 'female', style: 'standard' },

            // Others
            'nl_001': { name: 'Nederlands Male', lang: 'nl', gender: 'male', style: 'standard' },
            'pl_001': { name: 'Polski Female', lang: 'pl', gender: 'female', style: 'standard' },
            'ru_female': { name: 'Русский Female', lang: 'ru', gender: 'female', style: 'standard' },
            'tr_female': { name: 'Türkçe Female', lang: 'tr', gender: 'female', style: 'standard' },
            'vi_female': { name: 'Tiếng Việt Female', lang: 'vi', gender: 'female', style: 'standard' },
            'th_female': { name: 'ภาษาไทย Female', lang: 'th', gender: 'female', style: 'standard' },
            'ar_male': { name: 'العربية Male', lang: 'ar', gender: 'male', style: 'standard' },
            'zh_CN_female': { name: '中文 Female', lang: 'zh', gender: 'female', style: 'standard' },
            'zh_CN_male': { name: '中文 Male', lang: 'zh', gender: 'male', style: 'standard' }
        };
    }

    /**
     * Get default voice for a language
     */
    static getDefaultVoiceForLanguage(langCode) {
        const languageDefaults = {
            'de': 'de_002',
            'en': 'en_us_001',
            'es': 'es_002',
            'fr': 'fr_002',
            'pt': 'br_003',
            'it': 'it_male_m18',
            'ja': 'jp_001',
            'ko': 'kr_003',
            'zh': 'zh_CN_female',
            'ru': 'ru_female',
            'ar': 'ar_male',
            'tr': 'tr_female',
            'vi': 'vi_female',
            'th': 'th_female',
            'nl': 'nl_001',
            'pl': 'pl_001',
            'id': 'id_001'
        };

        return languageDefaults[langCode] || 'en_us_001';
    }

    /**
     * Generate TTS audio from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - TikTok voice ID
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId) {
        // Split text into chunks if it exceeds the limit
        const chunks = this._splitTextIntoChunks(text, this.maxChunkLength);
        
        if (chunks.length > 1) {
            this.logger.info(`Text split into ${chunks.length} chunks for TTS processing`);
        }
        
        // Process each chunk and combine results
        const audioChunks = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            this.logger.debug(`Processing chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..."`);
            
            const audioData = await this._synthesizeChunk(chunk, voiceId);
            audioChunks.push(audioData);
        }
        
        // If multiple chunks, concatenate them (simple concatenation for base64)
        // Note: This is a simple approach. For perfect audio joining, decode->join->encode would be better
        if (audioChunks.length === 1) {
            return audioChunks[0];
        } else {
            this.logger.warn(`Text was split into ${audioChunks.length} chunks. Only the first chunk will be returned.`);
            this.logger.warn(`For best results, keep TTS messages under 300 characters.`);
            // TODO: Implement proper audio concatenation by decoding base64, joining MP3 files, re-encoding
            // For now, return the first chunk to ensure some audio is played
            return audioChunks[0];
        }
    }
    
    /**
     * Synthesize a single chunk of text
     * @private
     */
    async _synthesizeChunk(text, voiceId) {
        // Check if SessionID is available
        if (!this.sessionId) {
            const errorMessage = 'TikTok TTS requires a SessionID. Please set TIKTOK_SESSION_ID in the TTS Admin Panel.';
            this.logger.error(errorMessage);
            this.logger.error('📚 Instructions: See TTS Admin Panel > Configuration > TikTok SessionID');
            this.logger.error('💡 Alternative: Use Google Cloud TTS, ElevenLabs, or browser SpeechSynthesis instead.');
            throw new Error(errorMessage);
        }
        
        let lastError;
        
        // Try each endpoint until one succeeds
        for (let endpointAttempt = 0; endpointAttempt < this.apiEndpoints.length; endpointAttempt++) {
            const endpointConfig = this.apiEndpoints[this.currentEndpointIndex];
            
            // Try the current endpoint with retries
            for (let retryAttempt = 0; retryAttempt < this.maxRetries; retryAttempt++) {
                try {
                    this.logger.debug(`Attempting ${endpointConfig.type} TTS: ${endpointConfig.url} (attempt ${retryAttempt + 1}/${this.maxRetries})`);
                    
                    const result = await this._makeRequest(endpointConfig, text, voiceId);
                    if (result) {
                        this.logger.info(`✅ TikTok TTS success via ${endpointConfig.type}: ${text.substring(0, 30)}... (voice: ${voiceId})`);
                        return result;
                    }
                } catch (error) {
                    lastError = error;
                    this.logger.warn(`TikTok TTS ${endpointConfig.type} endpoint failed: ${error.message}`);
                    
                    // Log more details for debugging
                    if (error.response) {
                        this.logger.debug(`HTTP Status: ${error.response.status}`);
                        this.logger.debug(`Response data: ${JSON.stringify(error.response.data || {})}`);
                    }
                    
                    // Check if error is due to 404 (API endpoint changed)
                    if (error.message.includes('404')) {
                        this.logger.warn('⚠️  API endpoint returned 404 - TikTok may have changed their API');
                        this.logger.warn('💡 Try updating to the latest version or report this issue');
                    }
                    
                    // Check if error is due to invalid/expired SessionID
                    if (error.message.includes('401') || error.message.includes('403') || error.message.includes('Invalid session')) {
                        this.logger.warn('⚠️  SessionID may be expired or invalid');
                        this.logger.warn('💡 Please update your SessionID in the TTS Admin Panel');
                    }
                    
                    // Small backoff for retries on same endpoint
                    if (retryAttempt < this.maxRetries - 1) {
                        await this._delay(500);
                    }
                }
            }
            
            // Move to next endpoint for next attempt
            this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.apiEndpoints.length;
        }
        
        // All endpoints and retries failed
        const errorMessage = `All TikTok TTS endpoints failed. Last error: ${lastError?.message || 'Unknown'}`;
        this.logger.error(errorMessage);
        this.logger.error('❌ TikTok TTS UNAVAILABLE - All endpoints returned errors');
        this.logger.error('');
        
        // Check if all errors were 404
        if (lastError?.message?.includes('404')) {
            this.logger.error('🔍 ROOT CAUSE: TikTok API endpoints have changed (all returned 404)');
            this.logger.error('');
            this.logger.error('📋 RECOMMENDED ACTIONS:');
            this.logger.error('   1. Use ElevenLabs TTS (best quality, requires API key)');
            this.logger.error('   2. Use Google Cloud TTS (good quality, requires API key)');
            this.logger.error('   3. Use Browser TTS (free, no setup needed, client-side)');
            this.logger.error('');
            this.logger.error('⚙️  HOW TO SWITCH:');
            this.logger.error('   • Open TTS Admin Panel in your browser');
            this.logger.error('   • Go to Configuration tab');
            this.logger.error('   • Set "Default Engine" to "elevenlabs" or "google"');
            this.logger.error('   • Add your API key in the respective field');
            this.logger.error('   • Enable "Auto Fallback" for redundancy');
        } else if (lastError?.message?.includes('401') || lastError?.message?.includes('403') || lastError?.message?.includes('Invalid session')) {
            this.logger.error('🔍 ROOT CAUSE: Invalid or expired SessionID');
            this.logger.error('');
            this.logger.error('📋 QUICK FIX:');
            this.logger.error('   1. Update your TikTok SessionID in TTS Admin Panel');
            this.logger.error('   2. Or set TIKTOK_SESSION_ID environment variable');
            this.logger.error('   3. See: plugins/tts/engines/TIKTOK_TTS_STATUS.md for instructions');
            this.logger.error('');
            this.logger.error('💡 ALTERNATIVE: Switch to ElevenLabs or Google TTS for reliability');
        } else {
            this.logger.error('🔍 POSSIBLE CAUSES:');
            this.logger.error('   1. Network/firewall blocking TikTok domains');
            this.logger.error('   2. TikTok API changes (endpoints updated)');
            this.logger.error('   3. Invalid SessionID configuration');
            this.logger.error('');
            this.logger.error('💡 RECOMMENDED: Switch to ElevenLabs or Google TTS');
        }
        
        this.logger.error('');
        this.logger.error('📚 Documentation: plugins/tts/engines/TIKTOK_TTS_STATUS.md');
        this.logger.error('');
        
        throw new Error(errorMessage);
    }

    /**
     * Make TTS request to endpoint
     * Handles different API formats (proxy services vs official TikTok API)
     * @private
     */
    async _makeRequest(endpointConfig, text, voiceId) {
        const { url, type, format } = endpointConfig;
        
        // Configure request for TikTok API format with SessionID authentication
        if (format !== 'tiktok') {
            throw new Error(`Unsupported endpoint format: ${format}`);
        }
        
        // Official TikTok API format with SessionID authentication
        // Note: aid (Application ID) parameter is required by TikTok's internal API
        // Common values: 1233 (TikTok app), 1180 (TikTok Lite)
        const params = new URLSearchParams({
            text_speaker: voiceId,
            req_text: text,
            speaker_map_type: '0',
            aid: '1233' // Application ID for TikTok
        });
        const requestData = params.toString();
        const requestConfig = {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                // Using a recent Android User-Agent string
                // Format: app_name/version (OS; device_info; Build/build_id; api_version)
                'User-Agent': 'com.zhiliaoapp.musically/2023400040 (Linux; U; Android 13; en_US; Pixel 7; Build/TQ3A.230805.001; tt-ok/3.12.13.4)',
                'Accept': '*/*',
                // CRITICAL: SessionID cookie is required for authentication
                'Cookie': `sessionid=${this.sessionId}`
            },
            timeout: this.timeout,
            responseType: 'json'
        };
        
        this.logger.debug(`Making TikTok TTS request to: ${url}`);
        this.logger.debug(`Request params: ${requestData}`);
        this.logger.debug(`SessionID length: ${this.sessionId?.length || 0}`);
        
        const response = await axios.post(url, requestData, requestConfig);
        
        // Handle different response formats
        return this._extractAudioData(response.data);
    }
    
    /**
     * Extract audio data from TikTok API response
     * @private
     */
    _extractAudioData(data) {
        // Official TikTok API returns: { status_code: 0, data: { v_str: "base64..." } }
        if (data && data.status_code === 0) {
            if (data.data && data.data.v_str) {
                return data.data.v_str;
            } else if (data.data && typeof data.data === 'string') {
                return data.data;
            }
        }
        
        // Check for error message
        if (data && data.status_msg) {
            throw new Error(`TikTok API error: ${data.status_msg}`);
        }
        
        // Fallback: try to find base64 data in response
        if (typeof data === 'string' && data.length > 100) {
            return data;
        }
        
        throw new Error('Invalid response format from TikTok TTS API');
    }
    
    /**
     * Split text into chunks that fit within TikTok's character limit
     * @private
     */
    _splitTextIntoChunks(text, maxLength) {
        if (text.length <= maxLength) {
            return [text];
        }
        
        const chunks = [];
        let currentChunk = '';
        
        // Split by sentences first (period, exclamation, question mark)
        const sentences = text.split(/([.!?]+\s+)/);
        
        for (const sentence of sentences) {
            if ((currentChunk + sentence).length <= maxLength) {
                currentChunk += sentence;
            } else {
                if (currentChunk) {
                    chunks.push(currentChunk.trim());
                }
                
                // If a single sentence is too long, split by words
                if (sentence.length > maxLength) {
                    const words = sentence.split(' ');
                    currentChunk = '';
                    
                    for (const word of words) {
                        if ((currentChunk + ' ' + word).length <= maxLength) {
                            currentChunk += (currentChunk ? ' ' : '') + word;
                        } else {
                            if (currentChunk) {
                                chunks.push(currentChunk.trim());
                            }
                            currentChunk = word;
                        }
                    }
                } else {
                    currentChunk = sentence;
                }
            }
        }
        
        if (currentChunk) {
            chunks.push(currentChunk.trim());
        }
        
        return chunks.filter(c => c.length > 0);
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
            await this.synthesize('Test', 'en_us_001');
            return true;
        } catch (error) {
            this.logger.error(`TikTok TTS engine test failed: ${error.message}`);
            return false;
        }
    }
}

module.exports = TikTokEngine;
