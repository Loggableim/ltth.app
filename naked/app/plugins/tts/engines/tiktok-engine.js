const axios = require('axios');
const SessionExtractor = require('../../../modules/session-extractor');

/**
 * TikTok TTS Engine
 * Uses TikTok's official API endpoints with SessionID authentication
 * Based on research from Steve0929/tiktok-tts and community TTS projects
 * 
 * 🔑 SESSIONID SETUP - THREE METHODS AVAILABLE:
 * 
 * METHOD 1 (RECOMMENDED): Eulerstream API Extraction
 * - Fastest and most reliable method
 * - Requires: Eulerstream account with API key
 * - Automatic extraction via session-extractor module
 * - No browser automation needed
 * - Uses: `extractSessionIdFromEulerstream()` method
 * 
 * METHOD 2 (FALLBACK): Browser Automation
 * - Uses Puppeteer to extract session from browser
 * - Requires: Puppeteer installed (optional dependency)
 * - Slower but works without Eulerstream account
 * - Uses: `_extractSessionIdWithPuppeteer()` method
 * 
 * METHOD 3 (MANUAL): Copy from Browser
 * - Manual extraction from browser DevTools
 * - Steps:
 *   1. Open browser to https://www.tiktok.com and log in
 *   2. Open browser DevTools (F12) > Application > Cookies
 *   3. Copy the 'sessionid' cookie value
 *   4. Store it in database using: db.setSetting('tiktok_session_id', '<your_session_id>')
 * 
 * 💡 The SessionID is automatically retrieved from the database where it's
 * stored by the session-extractor module. No manual configuration needed
 * if you're using the session extraction features.
 */
class TikTokEngine {
    constructor(logger, config = {}) {
        this.logger = logger;
        this.config = config;
        this.db = config.db; // Database instance for session ID retrieval
        
        // Track last Eulerstream extraction failure for better error messages
        this.lastEulerstreamFailure = null;
        
        // Get SessionID from database (set by session-extractor module)
        // Falls back to config or environment variable for backwards compatibility
        this.sessionId = null;
        this.ttTargetIdc = null; // Secondary cookie sometimes required by TikTok API
        
        if (this.db) {
            const rawDbValue = this.db.getSetting('tiktok_session_id');
            this.logger.debug(`TikTok TTS: Constructor database check - raw value: ${rawDbValue ? '[EXISTS]' : '[NULL/EMPTY]'}`);
            this.sessionId = this._sanitizeSessionIdValue(rawDbValue);
            if (!this.sessionId && rawDbValue) {
                this.logger.warn(`TikTok TTS: Database tiktok_session_id exists but was filtered (value: "${rawDbValue}")`);
            }
            
            // Also load tt-target-idc cookie if available (often needed for API requests)
            const ttTargetIdcValue = this.db.getSetting('tiktok_tt_target_idc');
            if (ttTargetIdcValue) {
                this.ttTargetIdc = this._sanitizeSessionIdValue(ttTargetIdcValue);
                this.logger.debug(`TikTok TTS: tt-target-idc cookie loaded from database`);
            }
        }
        // Fallback to config or environment variable
        if (!this.sessionId) {
            this.sessionId = this._sanitizeSessionIdValue(
                config.sessionId || process.env.TIKTOK_SESSION_ID
            );
        }
        
        // Log SessionID status (for debugging)
        if (this.sessionId) {
            const method = this.db?.getSetting('tiktok_session_method') || 'unknown';
            const cookieInfo = this.ttTargetIdc ? ' (with tt-target-idc)' : ' (sessionid only)';
            this.logger.info(`✅ TikTok TTS: SessionID loaded${cookieInfo} (method: ${method})`);
        } else {
            this.logger.warn('⚠️  TikTok TTS: No SessionID found. TikTok TTS will not work.');
            this.logger.warn('💡 To enable: Use session-extractor (Eulerstream API or browser method)');
            this.logger.warn('💡 Or manually set tiktok_session_id in database');
        }
        
        // Direct TikTok API endpoints (require SessionID for authentication)
        // Updated endpoints as of December 2024 - TikTok rotates between "normal" and "core" variants
        // Multiple endpoint versions (api16, api19, api22) with both -normal- and -core- variants for maximum redundancy
        // Community reports show both variants can work depending on region and TikTok's backend routing
        // Based on Steve0929/tiktok-tts and oscie57/tiktok-voice repository research
        // 
        // IMPORTANT: Parameters must be passed as URL query string, NOT as POST body!
        // Working format: POST {url}?text_speaker=xxx&req_text=xxx&speaker_map_type=0&aid=1233
        this.apiEndpoints = [
            // Priority 1: Most commonly working endpoint as of Dec 2024 (from GitHub issues)
            {
                url: 'https://api16-normal-useast5.us.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            // Priority 2: Original working endpoint (api16-normal-v6)
            {
                url: 'https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            // Priority 3: US East endpoints
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
                url: 'https://api16-normal-c-useast2a.tiktokv.com/media/api/text/speech/invoke/',
                type: 'official',
                format: 'tiktok',
                requiresAuth: true
            },
            // Priority 4: Asia/Singapore endpoints
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
            // Priority 5: -core- variant endpoints (backup endpoints)
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
        
        // If multiple chunks, concatenate them
        // Note: Simple base64 concatenation works reasonably well for MP3 files
        // since they can be concatenated at the binary level
        if (audioChunks.length === 1) {
            return audioChunks[0];
        } else {
            this.logger.info(`Text was split into ${audioChunks.length} chunks. Concatenating audio...`);
            this.logger.info(`💡 For best audio quality, keep TTS messages under 300 characters.`);
            
            // Concatenate base64 MP3 chunks
            // This works because MP3 files can be concatenated at the byte level
            const buffers = audioChunks.map(base64 => Buffer.from(base64, 'base64'));
            const combined = Buffer.concat(buffers);
            return combined.toString('base64');
        }
    }
    
    /**
     * Synthesize a single chunk of text
     * @private
     */
    async _synthesizeChunk(text, voiceId) {
        await this._ensureSessionId();

        // Check if SessionID is available
        if (!this.sessionId) {
            const errorMessage = 'TikTok TTS requires a SessionID. Please use the session-extractor to obtain one.';
            this.logger.error(errorMessage);
            this.logger.error('');
            
            // Provide targeted guidance based on Eulerstream extraction failure reason
            if (this.lastEulerstreamFailure) {
                if (this.lastEulerstreamFailure.requiresApiKey) {
                    this.logger.error('🔑 EULERSTREAM API KEY REQUIRED:');
                    this.logger.error('');
                    this.logger.error('The automatic SessionID extraction via Eulerstream failed because no API key is configured.');
                    this.logger.error('');
                    this.logger.error('📋 HOW TO FIX:');
                    this.logger.error('   1. Get your Eulerstream API key from https://www.eulerstream.com/dashboard');
                    this.logger.error('   2. Configure it in one of these ways:');
                    this.logger.error('      • Dashboard: Settings → TikTok → Eulerstream API Key');
                    this.logger.error('      • Database: Set "tiktok_euler_api_key" or "euler_api_key"');
                    this.logger.error('      • Environment: Set EULER_API_KEY or SIGN_API_KEY');
                    this.logger.error('   3. Restart the application or re-run TTS');
                    this.logger.error('');
                    this.logger.error('📚 Documentation: app/docs/EULERSTREAM_AUTHENTICATION_GUIDE.md');
                } else if (this.lastEulerstreamFailure.requiresValidApiKey) {
                    this.logger.error('⚠️  INVALID EULERSTREAM API KEY:');
                    this.logger.error('');
                    this.logger.error(`Reason: ${this.lastEulerstreamFailure.message}`);
                    this.logger.error('');
                    this.logger.error('📋 HOW TO FIX:');
                    this.logger.error('   1. Verify your Eulerstream API key at https://www.eulerstream.com/dashboard');
                    this.logger.error('   2. Make sure you copied the complete key (starts with "euler_")');
                    this.logger.error('   3. Update the key in Settings → TikTok → Eulerstream API Key');
                    this.logger.error('   4. Restart the application or re-run TTS');
                    this.logger.error('');
                    this.logger.error('📚 Documentation: app/docs/EULERSTREAM_AUTHENTICATION_GUIDE.md');
                } else {
                    this.logger.error('❌ EULERSTREAM SESSION EXTRACTION FAILED:');
                    this.logger.error('');
                    this.logger.error(`Reason: ${this.lastEulerstreamFailure.message || this.lastEulerstreamFailure.error}`);
                    if (this.lastEulerstreamFailure.suggestion) {
                        this.logger.error('');
                        this.logger.error(`💡 Suggestion: ${this.lastEulerstreamFailure.suggestion}`);
                    }
                    this.logger.error('');
                    this.logger.error('📋 ALTERNATIVE METHODS:');
                    this.logger.error('');
                    this.logger.error('METHOD 2: Browser Automation (Puppeteer)');
                    this.logger.error('   • Requires Puppeteer to be installed');
                    this.logger.error('   • Use Dashboard session extraction feature (will auto-fallback to Puppeteer)');
                    this.logger.error('');
                    this.logger.error('METHOD 3: Manual Extraction');
                    this.logger.error('   1. Open https://www.tiktok.com in browser and log in');
                    this.logger.error('   2. Press F12 → Application → Cookies');
                    this.logger.error('   3. Copy the "sessionid" cookie value');
                    this.logger.error('   4. Paste in Dashboard → Settings → TikTok → Session ID');
                }
            } else {
                // Generic instructions when no Eulerstream failure info is available
                this.logger.error('📋 HOW TO GET SESSIONID - THREE METHODS:');
                this.logger.error('');
                this.logger.error('METHOD 1 (RECOMMENDED): Eulerstream API');
                this.logger.error('   • Use the session-extractor with your Eulerstream API key');
                this.logger.error('   • Fastest and most reliable method');
                this.logger.error('   • Get API key: https://www.eulerstream.com/dashboard');
                this.logger.error('   • Configure: Dashboard → Settings → TikTok → Eulerstream API Key');
                this.logger.error('   • Documentation: app/docs/EULERSTREAM_AUTHENTICATION_GUIDE.md');
                this.logger.error('');
                this.logger.error('METHOD 2 (FALLBACK): Browser Automation');
                this.logger.error('   • Requires Puppeteer to be installed');
                this.logger.error('   • Use Dashboard session extraction feature (Puppeteer fallback)');
                this.logger.error('');
                this.logger.error('METHOD 3 (MANUAL): Copy from Browser');
                this.logger.error('   1. Open https://www.tiktok.com in browser and log in');
                this.logger.error('   2. Press F12 → Application → Cookies');
                this.logger.error('   3. Copy the "sessionid" cookie value');
                this.logger.error('   4. Paste in Dashboard → Settings → TikTok → Session ID');
            }
            
            this.logger.error('');
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
                        this.logger.warn('💡 Please refresh your SessionID using the session-extractor module');
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
            this.logger.error('   1. Use the session-extractor module to refresh your SessionID');
            this.logger.error('   2. Or manually update tiktok_session_id in database settings');
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
        
        // Preprocess text for TikTok API compatibility
        // Based on working implementations from Steve0929/tiktok-tts and oscie57/tiktok-voice
        // Strategy: Use proper URL encoding first, then adjust for TikTok's specific requirements
        
        // Step 1: Proper URL encoding for all special characters
        let processedText = encodeURIComponent(text);
        
        // Step 2: TikTok API quirk - Convert %20 (encoded space) to + (form encoding style)
        // This is required by TikTok's API which expects + for spaces, not %20
        processedText = processedText.replace(/%20/g, '+');
        
        // Validate voiceId is a safe identifier (alphanumeric and underscores only)
        // This prevents URL injection via voiceId parameter
        if (!/^[a-zA-Z0-9_-]+$/.test(voiceId)) {
            throw new Error(`Invalid voice ID format: ${voiceId}`);
        }
        
        // Official TikTok API format with SessionID authentication
        // CRITICAL: Parameters must be passed as URL query string, NOT as POST body!
        // This is the key difference from broken implementations.
        // Based on Steve0929/tiktok-tts and oscie57/tiktok-voice
        // Note: aid (Application ID) parameter is required by TikTok's internal API
        // Common values: 1233 (TikTok app), 1180 (TikTok Lite)
        const fullUrl = `${url}?text_speaker=${voiceId}&req_text=${processedText}&speaker_map_type=0&aid=1233`;
        
        // Build cookie header with both sessionid and tt-target-idc if available
        let cookieHeader = `sessionid=${this.sessionId}`;
        if (this.ttTargetIdc) {
            cookieHeader += `; tt-target-idc=${this.ttTargetIdc}`;
        }
        
        const requestConfig = {
            headers: {
                // User-Agent from working implementations (oscie57/tiktok-voice, Steve0929/tiktok-tts)
                // Using an older, proven User-Agent that TikTok accepts
                'User-Agent': 'com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)',
                // CRITICAL: SessionID cookie is required for authentication
                // tt-target-idc cookie is also often required by TikTok's backend
                'Cookie': cookieHeader
            },
            timeout: this.timeout,
            responseType: 'json'
        };
        
        this.logger.debug(`Making TikTok TTS request to: ${url}`);
        this.logger.debug(`Full URL with params: ${fullUrl.substring(0, 150)}...`);
        this.logger.debug(`SessionID length: ${this.sessionId?.length || 0}`);
        
        // POST request with parameters in URL (body is null/empty)
        // This matches the working implementation format
        const response = await axios.post(fullUrl, null, requestConfig);
        
        // Handle different response formats
        return this._extractAudioData(response.data);
    }

    /**
     * Ensure SessionID is available, attempting automatic Eulerstream extraction when missing
     * @private
     */
    async _ensureSessionId() {
        // First, re-check database in case SessionID was added after initialization
        if (this.db && !this.sessionId) {
            this.logger.debug('TikTok TTS: Checking database for SessionID...');
            const rawDbValue = this.db.getSetting('tiktok_session_id');
            this.logger.debug(`TikTok TTS: Database raw value: ${rawDbValue ? '[EXISTS]' : '[NULL/EMPTY]'}`);
            
            const dbSessionId = this._sanitizeSessionIdValue(rawDbValue);
            if (dbSessionId) {
                this.sessionId = dbSessionId;
                
                // Also check for tt-target-idc cookie
                const ttTargetIdcValue = this.db.getSetting('tiktok_tt_target_idc');
                if (ttTargetIdcValue) {
                    this.ttTargetIdc = this._sanitizeSessionIdValue(ttTargetIdcValue);
                    this.logger.debug('TikTok TTS: tt-target-idc cookie also loaded from database');
                }
                
                const method = this.db.getSetting('tiktok_session_method') || 'database';
                const cookieInfo = this.ttTargetIdc ? ' (with tt-target-idc)' : '';
                this.logger.info(`✅ TikTok TTS: SessionID loaded from database${cookieInfo} (method: ${method})`);
                return this.sessionId;
            } else if (rawDbValue) {
                this.logger.warn(`TikTok TTS: Database has tiktok_session_id but it was filtered by sanitization (value: "${rawDbValue}")`);
            } else {
                this.logger.debug('TikTok TTS: No SessionID found in database');
            }
        }

        const sanitizedSessionId = this._sanitizeSessionIdValue(this.sessionId);
        if (sanitizedSessionId) {
            this.sessionId = sanitizedSessionId;
            return this.sessionId;
        }

        if (typeof this.config.sessionIdLoader === 'function') {
            try {
                const loaded = await this.config.sessionIdLoader();
                const sanitizedLoaderSessionId = this._sanitizeSessionIdValue(loaded);
                if (sanitizedLoaderSessionId) {
                    this.sessionId = sanitizedLoaderSessionId;
                    this.logger.info('✅ TikTok TTS: SessionID loaded via custom loader');
                    return this.sessionId;
                }
            } catch (error) {
                this.logger.warn(`TikTok TTS: SessionID loader failed: ${error.message}`);
            }
        }

        if (!this.db) {
            this.logger.warn('TikTok TTS: Database unavailable - cannot auto-load SessionID');
            return null;
        }

        try {
            this.logger.info('🔄 TikTok TTS: Attempting automatic SessionID extraction via Eulerstream...');
            const extractor = new SessionExtractor(this.db, this.config.configPathManager || null);
            const result = await extractor.extractSessionId({ method: 'eulerstream' });

            const sanitizedExtractedSessionId = this._sanitizeSessionIdValue(result?.sessionId);
            if (result?.success && sanitizedExtractedSessionId) {
                this.sessionId = sanitizedExtractedSessionId;
                this.logger.info('✅ TikTok TTS: SessionID auto-extracted via Eulerstream');
                // Clear any previous failure info
                this.lastEulerstreamFailure = null;
                return this.sessionId;
            }

            // Store failure information for better error messaging
            this.lastEulerstreamFailure = result;
            
            if (result?.message || result?.error) {
                this.logger.warn(`TikTok TTS: Eulerstream session extraction failed: ${result.message || result.error}`);
                if (result.requiresApiKey) {
                    this.logger.warn('💡 Configure your Eulerstream API key to enable automatic SessionID extraction');
                    this.logger.warn('📚 See: app/docs/EULERSTREAM_AUTHENTICATION_GUIDE.md');
                } else if (result.requiresValidApiKey) {
                    this.logger.warn('💡 Please verify your Eulerstream API key configuration');
                }
            }
        } catch (error) {
            this.logger.warn(`TikTok TTS: Eulerstream session extraction error: ${error.message}`);
            this.lastEulerstreamFailure = {
                success: false,
                error: error.message,
                message: `Unexpected error during Eulerstream extraction: ${error.message}`
            };
        }

        return null;
    }

    /**
     * Normalize session ID values and filter out invalid placeholders
     * @private
     */
    _sanitizeSessionIdValue(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        const trimmed = value.trim();
        if (!trimmed || trimmed === 'null') {
            return null;
        }
        return trimmed;
    }
    
    /**
     * Extract audio data from TikTok API response
     * Based on response formats from Steve0929/tiktok-tts and oscie57/tiktok-voice
     * @private
     */
    _extractAudioData(data) {
        // Handle different status codes according to TikTok API documentation
        // https://github.com/oscie57/tiktok-voice/wiki/Status-Codes
        if (data) {
            const statusCode = data.status_code;
            const message = data.message || data.status_msg || '';
            
            // Check for specific error cases first
            if (message === "Couldn't load speech. Try again." || statusCode === 1) {
                // Status code 1: Usually means invalid/expired session ID or invalid parameters
                throw new Error('TikTok API: Session ID may be invalid or expired (status_code: 1)');
            }
            
            if (statusCode === 2) {
                throw new Error('TikTok API: Text is too long (status_code: 2)');
            }
            
            if (statusCode === 4) {
                throw new Error('TikTok API: Invalid voice/speaker (status_code: 4)');
            }
            
            if (statusCode === 5) {
                throw new Error('TikTok API: No session ID provided (status_code: 5)');
            }
            
            // Success case: status_code 0
            if (statusCode === 0) {
                if (data.data && data.data.v_str) {
                    return data.data.v_str;
                } else if (data.data && typeof data.data === 'string') {
                    return data.data;
                }
            }
            
            // Generic error with status message
            if (data.status_msg) {
                throw new Error(`TikTok API error (${statusCode}): ${data.status_msg}`);
            }
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
