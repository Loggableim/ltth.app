const path = require('path');
const multer = require('multer');
const TikTokEngine = require('./engines/tiktok-engine');
const GoogleEngine = require('./engines/google-engine');
const SpeechifyEngine = require('./engines/speechify-engine');
const ElevenLabsEngine = require('./engines/elevenlabs-engine');
const OpenAIEngine = require('./engines/openai-engine');
const FishSpeechEngine = require('./engines/fishspeech-engine');
const SiliconFlowEngine = require('./engines/siliconflow-engine');
const LanguageDetector = require('./utils/language-detector');
const ProfanityFilter = require('./utils/profanity-filter');
const PermissionManager = require('./utils/permission-manager');
const QueueManager = require('./utils/queue-manager');

/**
 * TTS Plugin - Main Class
 * Enterprise-grade Text-to-Speech system with multi-engine support
 */
class TTSPlugin {
    // Static emoji pattern compiled once for performance
    // Matches: emoticons, symbols, pictographs, transport, modifiers, sequences, flags
    static EMOJI_PATTERN = /(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]|[\u{20E3}])+/gu;
    
    // Error message constant for missing engines
    static NO_ENGINES_ERROR = 'No TTS engines available - please configure at least one engine (TikTok, Google, Speechify, ElevenLabs, OpenAI, Fish.audio, or SiliconFlow)';


    constructor(api) {
        this.api = api;
        this.logger = api.logger;

        // Startup timestamp - used to ignore historical chat messages
        this.startupTimestamp = new Date().toISOString();

        // Debug logging system
        this.debugLogs = [];
        this.maxDebugLogs = 500;
        this.debugEnabled = true;

        // Load configuration
        this.config = this._loadConfig();
        
        // Sanitize message prefix filter on load
        this.config.messagePrefixFilter = this._sanitizePrefixFilter(this.config.messagePrefixFilter);

        // Initialize engines
        // Only load engines that are enabled (as primary or fallback) to save system resources
        this.engines = {
            tiktok: null, // TikTok TTS - free, fast, good quality (default)
            google: null, // Initialized if API key is available AND engine is enabled
            speechify: null, // Initialized if API key is available AND engine is enabled
            elevenlabs: null, // Initialized if API key is available AND engine is enabled
            openai: null, // Initialized if API key is available AND engine is enabled
            fishaudio: null, // Fish.audio official API - initialized if API key is available AND engine is enabled
            siliconflow: null // SiliconFlow (Fish Speech 1.5) - initialized if API key is available AND engine is enabled
        };

        // Helper function to check if an engine should be loaded
        const shouldLoadEngine = (engineName) => {
            // Always load the default/primary engine
            if (this.config.defaultEngine === engineName) {
                return true;
            }
            // Load fallback engines only if they are enabled
            switch (engineName) {
                case 'tiktok':
                    return this.config.enableTikTokFallback === true;
                case 'google':
                    return this.config.enableGoogleFallback === true;
                case 'speechify':
                    return this.config.enableSpeechifyFallback === true;
                case 'elevenlabs':
                    return this.config.enableElevenlabsFallback === true;
                case 'openai':
                    return this.config.enableOpenAIFallback === true;
                case 'fishaudio':
                    return this.config.enableFishAudioFallback === true;
                case 'siliconflow':
                    return this.config.enableSiliconFlowFallback === true;
                default:
                    return false;
            }
        };

        // Initialize TikTok engine if enabled (no API key needed - uses session from Eulerstream)
        // TikTok TTS is free and works well, making it a great default option
        if (shouldLoadEngine('tiktok')) {
            try {
                this.engines.tiktok = new TikTokEngine(
                    this.logger,
                    { 
                        db: this.api.getDatabase(), // Pass database for session ID retrieval
                        performanceMode: this.config.performanceMode 
                    }
                );
                this.logger.info('TTS: ✅ TikTok TTS engine initialized (free, fast, good quality)');
                this._logDebug('INIT', 'TikTok TTS engine initialized', { 
                    isDefault: this.config.defaultEngine === 'tiktok', 
                    isFallback: this.config.enableTikTokFallback 
                });
            } catch (error) {
                this.logger.error(`TTS: ❌ TikTok TTS engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'TikTok TTS engine initialization failed', { error: error.message });
                this.engines.tiktok = null;
            }
        } else {
            this.logger.info('TTS: ⏸️  TikTok TTS engine NOT loaded (disabled)');
            this._logDebug('INIT', 'TikTok TTS engine NOT loaded', { disabled: true });
        }


        // Initialize Google engine if API key is configured AND engine is enabled
        if (this.config.googleApiKey && shouldLoadEngine('google')) {
            try {
                this.engines.google = new GoogleEngine(
                    this.config.googleApiKey, 
                    this.logger, 
                    { performanceMode: this.config.performanceMode }
                );
                this.logger.info('TTS: ✅ Google Cloud TTS engine initialized');
                this._logDebug('INIT', 'Google TTS engine initialized', { hasApiKey: true, isDefault: this.config.defaultEngine === 'google', isFallback: this.config.enableGoogleFallback });
            } catch (error) {
                this.logger.error(`TTS: ❌ Google Cloud TTS engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'Google TTS engine initialization failed', { hasApiKey: true, error: error.message });
                this.engines.google = null;
            }
        } else if (this.config.googleApiKey) {
            this.logger.info('TTS: ⏸️  Google Cloud TTS engine NOT loaded (disabled as fallback)');
            this._logDebug('INIT', 'Google TTS engine NOT loaded', { hasApiKey: true, disabled: true });
        } else {
            this.logger.info('TTS: ⚠️  Google Cloud TTS engine NOT initialized (no API key)');
            this._logDebug('INIT', 'Google TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize Speechify engine if API key is configured
        // Note: Always initialize when API key is present to support voice cloning feature,
        // regardless of whether it's used for TTS
        if (this.config.speechifyApiKey) {
            try {
                this.engines.speechify = new SpeechifyEngine(
                    this.config.speechifyApiKey,
                    this.logger,
                    { performanceMode: this.config.performanceMode }
                );
                const isEnabledForTTS = shouldLoadEngine('speechify');
                this.logger.info(`TTS: ✅ Speechify engine initialized (TTS: ${isEnabledForTTS ? 'enabled' : 'disabled'}, Voice Cloning: enabled)`);
                this._logDebug('INIT', 'Speechify engine initialized', { hasApiKey: true, isDefault: this.config.defaultEngine === 'speechify', isFallback: this.config.enableSpeechifyFallback, forVoiceCloning: true });
            } catch (error) {
                this.logger.error(`TTS: ❌ Speechify engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'Speechify engine initialization failed', { hasApiKey: true, error: error.message });
                this.engines.speechify = null;
            }
        } else {
            this.logger.info('TTS: ⚠️  Speechify engine NOT initialized (no API key)');
            this._logDebug('INIT', 'Speechify engine NOT initialized', { hasApiKey: false });
        }

        // Initialize ElevenLabs engine if API key is configured AND engine is enabled
        if (this.config.elevenlabsApiKey && shouldLoadEngine('elevenlabs')) {
            try {
                this.engines.elevenlabs = new ElevenLabsEngine(
                    this.config.elevenlabsApiKey,
                    this.logger,
                    { performanceMode: this.config.performanceMode }
                );
                this.logger.info('TTS: ✅ ElevenLabs TTS engine initialized');
                this._logDebug('INIT', 'ElevenLabs TTS engine initialized', { hasApiKey: true, isDefault: this.config.defaultEngine === 'elevenlabs', isFallback: this.config.enableElevenlabsFallback });
            } catch (error) {
                this.logger.error(`TTS: ❌ ElevenLabs TTS engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'ElevenLabs TTS engine initialization failed', { hasApiKey: true, error: error.message });
                this.engines.elevenlabs = null;
            }
        } else if (this.config.elevenlabsApiKey) {
            this.logger.info('TTS: ⏸️  ElevenLabs TTS engine NOT loaded (disabled as fallback)');
            this._logDebug('INIT', 'ElevenLabs TTS engine NOT loaded', { hasApiKey: true, disabled: true });
        } else {
            this.logger.info('TTS: ⚠️  ElevenLabs TTS engine NOT initialized (no API key)');
            this._logDebug('INIT', 'ElevenLabs TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize OpenAI engine if API key is configured AND engine is enabled
        if (this.config.openaiApiKey && shouldLoadEngine('openai')) {
            try {
                this.engines.openai = new OpenAIEngine(
                    this.config.openaiApiKey,
                    this.logger,
                    { performanceMode: this.config.performanceMode }
                );
                this.logger.info('TTS: ✅ OpenAI TTS engine initialized');
                this._logDebug('INIT', 'OpenAI TTS engine initialized', { hasApiKey: true, isDefault: this.config.defaultEngine === 'openai', isFallback: this.config.enableOpenAIFallback });
            } catch (error) {
                this.logger.error(`TTS: ❌ OpenAI TTS engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'OpenAI TTS engine initialization failed', { hasApiKey: true, error: error.message });
                this.engines.openai = null;
            }
        } else if (this.config.openaiApiKey) {
            this.logger.info('TTS: ⏸️  OpenAI TTS engine NOT loaded (disabled as fallback)');
            this._logDebug('INIT', 'OpenAI TTS engine NOT loaded', { hasApiKey: true, disabled: true });
        } else {
            this.logger.info('TTS: ⚠️  OpenAI TTS engine NOT initialized (no API key)');
            this._logDebug('INIT', 'OpenAI TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize Fish.audio engine if API key is configured AND engine is enabled
        if (this.config.fishaudioApiKey && shouldLoadEngine('fishaudio')) {
            try {
                this.engines.fishaudio = new FishSpeechEngine(
                    this.config.fishaudioApiKey,
                    this.logger,
                    { performanceMode: this.config.performanceMode }
                );
                this.logger.info('TTS: ✅ Fish.audio TTS engine initialized (Official API)');
                this._logDebug('INIT', 'Fish.audio TTS engine initialized', { hasApiKey: true, isDefault: this.config.defaultEngine === 'fishaudio', isFallback: this.config.enableFishAudioFallback });
            } catch (error) {
                this.logger.error(`TTS: ❌ Fish.audio TTS engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'Fish.audio TTS engine initialization failed', { hasApiKey: true, error: error.message });
                // Ensure engine is null if initialization failed
                this.engines.fishaudio = null;
            }
        } else if (this.config.fishaudioApiKey) {
            this.logger.info('TTS: ⏸️  Fish.audio TTS engine NOT loaded (disabled as fallback)');
            this._logDebug('INIT', 'Fish.audio TTS engine NOT loaded', { hasApiKey: true, disabled: true });
        } else {
            this.logger.info('TTS: ⚠️  Fish.audio TTS engine NOT initialized (no API key)');
            this._logDebug('INIT', 'Fish.audio TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize SiliconFlow engine if API key is configured AND engine is enabled
        if (this.config.siliconflowApiKey && shouldLoadEngine('siliconflow')) {
            try {
                this.engines.siliconflow = new SiliconFlowEngine(
                    this.config.siliconflowApiKey,
                    this.logger,
                    { performanceMode: this.config.performanceMode }
                );
                this.logger.info('TTS: ✅ SiliconFlow TTS engine initialized (Fish Speech 1.5)');
                this._logDebug('INIT', 'SiliconFlow TTS engine initialized', { hasApiKey: true, isDefault: this.config.defaultEngine === 'siliconflow', isFallback: this.config.enableSiliconFlowFallback });
            } catch (error) {
                this.logger.error(`TTS: ❌ SiliconFlow TTS engine initialization failed: ${error.message}`);
                this._logDebug('INIT', 'SiliconFlow TTS engine initialization failed', { hasApiKey: true, error: error.message });
                // Ensure engine is null if initialization failed
                this.engines.siliconflow = null;
            }
        } else if (this.config.siliconflowApiKey) {
            this.logger.info('TTS: ⏸️  SiliconFlow TTS engine NOT loaded (disabled as fallback)');
            this._logDebug('INIT', 'SiliconFlow TTS engine NOT loaded', { hasApiKey: true, disabled: true });
        } else {
            this.logger.info('TTS: ⚠️  SiliconFlow TTS engine NOT initialized (no API key)');
            this._logDebug('INIT', 'SiliconFlow TTS engine NOT initialized', { hasApiKey: false });
        }

        // Initialize utilities
        this.languageDetector = new LanguageDetector(this.logger, {
            confidenceThreshold: this.config.languageConfidenceThreshold,
            fallbackLanguage: this.config.fallbackLanguage,
            minTextLength: this.config.languageMinTextLength
        });
        this.profanityFilter = new ProfanityFilter(this.logger);
        this.permissionManager = new PermissionManager(this.api.getDatabase(), this.logger);
        this.queueManager = new QueueManager(this.config, this.logger);

        // Set profanity filter mode
        this.profanityFilter.setMode(this.config.profanityFilter);
        this.profanityFilter.setReplacement('asterisk');

        // Define fallback chains for each engine
        // Each engine has a preferred order of fallback engines based on quality and reliability
        this.fallbackChains = {
            'tiktok': ['google', 'openai', 'fishaudio', 'siliconflow', 'elevenlabs', 'speechify'],    // Free → Standard → OpenAI → Fish.audio → SiliconFlow → Premium engines
            'google': ['tiktok', 'openai', 'fishaudio', 'siliconflow', 'elevenlabs', 'speechify'],     // Standard → Free → OpenAI → Fish.audio → SiliconFlow → Premium engines
            'elevenlabs': ['openai', 'fishaudio', 'siliconflow', 'tiktok', 'google', 'speechify'],     // Premium → OpenAI → Fish.audio → SiliconFlow → Free → Standard
            'speechify': ['openai', 'fishaudio', 'siliconflow', 'tiktok', 'google', 'elevenlabs'],     // Speechify → OpenAI → Fish.audio → SiliconFlow → Free → Standard
            'openai': ['fishaudio', 'siliconflow', 'tiktok', 'google', 'elevenlabs', 'speechify'],     // OpenAI → Fish.audio → SiliconFlow → Free → Standard → Premium
            'fishaudio': ['siliconflow', 'openai', 'tiktok', 'google', 'elevenlabs', 'speechify'],     // Fish.audio → SiliconFlow → OpenAI → Free → Standard → Premium
            'siliconflow': ['fishaudio', 'openai', 'tiktok', 'google', 'elevenlabs', 'speechify']      // SiliconFlow → Fish.audio → OpenAI → Free → Standard → Premium
        };

        this._logDebug('INIT', 'TTS Plugin initialized', {
            defaultEngine: this.config.defaultEngine,
            defaultVoice: this.config.defaultVoice,
            enabledForChat: this.config.enabledForChat,
            autoLanguageDetection: this.config.autoLanguageDetection,
            performanceMode: this.config.performanceMode,
            enabledFallbacks: {
                tiktok: this.config.enableTikTokFallback,
                google: this.config.enableGoogleFallback,
                speechify: this.config.enableSpeechifyFallback,
                elevenlabs: this.config.enableElevenlabsFallback,
                openai: this.config.enableOpenAIFallback,
                fishaudio: this.config.enableFishAudioFallback,
                siliconflow: this.config.enableSiliconFlowFallback
            },
            startupTimestamp: this.startupTimestamp
        });

        // Log available engines summary
        const availableEngines = [];
        if (this.engines.tiktok) availableEngines.push('TikTok TTS');
        if (this.engines.google) availableEngines.push('Google Cloud TTS');
        if (this.engines.speechify) availableEngines.push('Speechify');
        if (this.engines.elevenlabs) availableEngines.push('ElevenLabs');
        if (this.engines.openai) availableEngines.push('OpenAI');
        if (this.engines.fishaudio) availableEngines.push('Fish.audio');
        if (this.engines.siliconflow) availableEngines.push('SiliconFlow');
        
        this.logger.info(`TTS Plugin initialized successfully`);
        this.logger.info(`TTS: Available engines: ${availableEngines.length > 0 ? availableEngines.join(', ') : 'None configured'}`);
        this.logger.info(`TTS: Default engine: ${this.config.defaultEngine}, Auto-fallback: ${this.config.enableAutoFallback ? 'enabled' : 'disabled'}`);
    }

    /**
     * Sanitize and validate message prefix filter array
     * @private
     * @param {Array} filterArray - Array of prefix strings to filter
     * @returns {Array} Sanitized array of valid, non-empty prefix strings
     */
    _sanitizePrefixFilter(filterArray) {
        if (!Array.isArray(filterArray)) return [];
        return filterArray
            .filter(p => p && typeof p === 'string' && p.trim().length > 0)
            .map(p => p.trim());
    }

    /**
     * Try to synthesize with a fallback engine
     * @private
     * @param {string} engineName - Engine to try
     * @param {string} text - Text to synthesize
     * @param {string} currentVoice - Current voice (may not be compatible)
     * @param {boolean} hasUserAssignedVoice - Whether user has an assigned voice (to preserve assignment intent)
     * @returns {Promise<{audioData: string, voice: string}>} Audio data and used voice
     */
    async _tryFallbackEngine(engineName, text, currentVoice, hasUserAssignedVoice = false) {
        if (!this.engines[engineName]) {
            throw new Error(`Engine ${engineName} not available`);
        }

        let fallbackVoice = currentVoice;
        
        // Adjust voice for target engine
        if (engineName === 'tiktok') {
            const tiktokVoices = TikTokEngine.getVoices();
            if (!fallbackVoice || !tiktokVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, TikTokEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || 'de_002';
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = TikTokEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || 'de_002';
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        } else if (engineName === 'elevenlabs') {
            const elevenlabsVoices = await this.engines.elevenlabs.getVoices();
            if (!fallbackVoice || !elevenlabsVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, ElevenLabsEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || ElevenLabsEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = ElevenLabsEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        } else if (engineName === 'speechify') {
            const speechifyVoices = await this.engines.speechify.getVoices();
            if (!fallbackVoice || !speechifyVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, SpeechifyEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        } else if (engineName === 'google') {
            const googleVoices = GoogleEngine.getVoices();
            if (!fallbackVoice || !googleVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, GoogleEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        } else if (engineName === 'openai') {
            const openaiVoices = OpenAIEngine.getVoices();
            if (!fallbackVoice || !openaiVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, OpenAIEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        } else if (engineName === 'fishaudio') {
            const fishaudioVoices = FishSpeechEngine.getVoices();
            if (!fallbackVoice || !fishaudioVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, FishSpeechEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || FishSpeechEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = FishSpeechEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        } else if (engineName === 'siliconflow') {
            const siliconflowVoices = SiliconFlowEngine.getVoices();
            if (!fallbackVoice || !siliconflowVoices[fallbackVoice]) {
                // Only use language detection if user doesn't have an assigned voice
                if (!hasUserAssignedVoice) {
                    const langResult = this.languageDetector.detectAndGetVoice(text, SiliconFlowEngine, this.config.fallbackLanguage);
                    fallbackVoice = langResult?.voiceId || SiliconFlowEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted via language detection for ${engineName}`, { fallbackVoice, langResult });
                } else {
                    // User had assigned voice - use engine's default for fallback language
                    fallbackVoice = SiliconFlowEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                    this._logDebug('FALLBACK', `Voice adjusted for ${engineName} (preserving user assignment intent)`, { fallbackVoice, hasUserAssignedVoice });
                }
            }
        }

        const audioData = await this.engines[engineName].synthesize(text, fallbackVoice, this.config.speed, 
            engineName === 'speechify' ? { language: this.languageDetector.detectLanguage(text)?.language } : {});
        
        return { audioData, voice: fallbackVoice };
    }

    /**
     * Strip emojis from text
     * Removes all Unicode emoji characters and emoji sequences
     * @param {string} text - Text to process
     * @returns {string} Text with emojis removed
     */
    _stripEmojis(text) {
        if (!text) return text;
        
        // Use static regex pattern (reset lastIndex for global regex)
        TTSPlugin.EMOJI_PATTERN.lastIndex = 0;
        
        // Remove emojis and clean up extra whitespace
        return text.replace(TTSPlugin.EMOJI_PATTERN, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Internal debug logging
     */
    _logDebug(category, message, data = {}) {
        if (!this.debugEnabled) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            category,
            message,
            data
        };

        this.debugLogs.push(logEntry);

        // Keep only last N logs
        if (this.debugLogs.length > this.maxDebugLogs) {
            this.debugLogs.shift();
        }

        // Emit to clients
        this.api.emit('tts:debug', logEntry);

        // Also log to console with category prefix
        this.logger.info(`[TTS:${category}] ${message}`, data);
    }

    /**
     * Plugin initialization
     */
    async init() {
        try {
            // Register API routes
            this._registerRoutes();

            // Register Socket.IO events
            this._registerSocketEvents();

            // Register TikTok events (for chat messages)
            this._registerTikTokEvents();

            // Start queue processing
            this.queueManager.startProcessing(async (item) => {
                await this._playAudio(item);
            });

            this.logger.info('TTS Plugin: All systems ready');

        } catch (error) {
            this.logger.error(`TTS Plugin initialization failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Load configuration from database or defaults
     */
    _loadConfig() {
        const defaultConfig = {
            defaultEngine: 'tiktok', // TikTok TTS - free, fast, good quality (no API key needed)
            defaultVoice: 'de_002', // Default German voice for TikTok
            defaultEmotion: null, // Default emotion for Speechify (null = no emotion)
            defaultFishaudioEmotion: 'neutral', // Default emotion for Fish.audio (neutral, happy, sad, angry, fearful, disgusted, surprised)
            defaultFishaudioPitch: 0, // Default pitch for Fish.audio (-1.0 to 1.0)
            defaultFishaudioVolume: 1.0, // Default volume for Fish.audio (0.0 to 2.0)
            volume: 80,
            speed: 1.0,
            teamMinLevel: 0,
            rateLimit: 3,
            rateLimitWindow: 60,
            maxQueueSize: 100,
            maxTextLength: 300,
            profanityFilter: 'moderate',
            duckOtherAudio: false,
            duckVolume: 0.3,
            googleApiKey: null,
            speechifyApiKey: null,
            elevenlabsApiKey: null,
            openaiApiKey: null,
            fishaudioApiKey: null, // Fish.audio official API key
            siliconflowApiKey: null, // SiliconFlow API key (Fish Speech 1.5)
            tiktokSessionId: null, // Deprecated but kept for backwards compatibility
            enabledForChat: true,
            autoLanguageDetection: true,
            // New language detection settings
            fallbackLanguage: 'de', // Default fallback language (German)
            languageConfidenceThreshold: 0.90, // 90% confidence required
            languageMinTextLength: 10, // Minimum text length for reliable detection
            enableAutoFallback: true, // Enable automatic fallback to other engines when primary fails
            stripEmojis: false, // Strip emojis from TTS text (prevents emojis from being read aloud)
            performanceMode: 'balanced', // Performance mode: 'fast' (low-resource), 'balanced', 'quality' (high-resource)
            // Fallback engine activation settings - only activated engines are loaded
            enableTikTokFallback: true, // Enable TikTok as fallback engine (free, no API key needed)
            enableGoogleFallback: true, // Enable Google as fallback engine (for backward compatibility)
            enableSpeechifyFallback: false, // Enable Speechify as fallback engine
            enableElevenlabsFallback: false, // Enable ElevenLabs as fallback engine
            enableOpenAIFallback: false, // Enable OpenAI as fallback engine
            enableFishAudioFallback: false, // Enable Fish.audio as fallback engine (official Fish.audio API)
            enableSiliconFlowFallback: false, // Enable SiliconFlow as fallback engine (Fish Speech 1.5)
            // Message prefix filter - ignore messages starting with these prefixes
            messagePrefixFilter: [] // e.g., ['!', '/', '.'] - messages starting with these will be ignored
        };

        // Try to load from database
        const saved = this.api.getConfig('config');
        const config = saved ? { ...defaultConfig, ...saved } : { ...defaultConfig };
        
        // API Keys: Retrieve from global settings (for centralized management)
        // Fallback to plugin config for backwards compatibility
        const db = this.api.getDatabase();
        
        // Helper function to validate API key (must be non-empty string after trimming)
        const getValidApiKey = (...keys) => {
            for (const key of keys) {
                const value = db.getSetting(key);
                if (value && typeof value === 'string' && value.trim() !== '') {
                    return value.trim();
                }
            }
            return null;
        };
        
        config.googleApiKey = getValidApiKey('tts_google_api_key') || config.googleApiKey;
        config.speechifyApiKey = getValidApiKey('tts_speechify_api_key') || config.speechifyApiKey;
        config.elevenlabsApiKey = getValidApiKey('tts_elevenlabs_api_key') || config.elevenlabsApiKey;
        config.openaiApiKey = getValidApiKey('tts_openai_api_key') || config.openaiApiKey;
        
        // Fish.audio API key (official API)
        config.fishaudioApiKey = getValidApiKey('tts_fishaudio_api_key', 'fishaudio_api_key') || config.fishaudioApiKey;
        
        // SiliconFlow API key (centralized for Fish Speech TTS + StreamAlchemy image generation)
        // Try centralized key first, then legacy keys for backwards compatibility
        config.siliconflowApiKey = getValidApiKey('siliconflow_api_key', 'tts_fishspeech_api_key', 'streamalchemy_siliconflow_api_key') || config.siliconflowApiKey;
        
        // If no saved config exists, save defaults
        if (!saved) {
            this.api.setConfig('config', defaultConfig);
        }
        
        return config;
    }

    /**
     * Save configuration
     */
    _saveConfig() {
        this.api.setConfig('config', this.config);
    }

    /**
     * Register HTTP API routes
     */
    _registerRoutes() {
        // Configure multer for voice clone audio uploads (in-memory storage)
        const voiceCloneUpload = multer({
            storage: multer.memoryStorage(),
            limits: { 
                fileSize: 5 * 1024 * 1024, // 5MB limit
                files: 1 // Only one file allowed
            },
            fileFilter: (req, file, cb) => {
                // Accept common audio formats
                const allowedMimes = [
                    'audio/mpeg',       // MP3
                    'audio/mp3',        // MP3 alternative
                    'audio/wav',        // WAV
                    'audio/wave',       // WAV alternative
                    'audio/x-wav',      // WAV alternative
                    'audio/webm',       // WebM audio
                    'audio/ogg',        // OGG
                    'audio/mp4',        // MP4 audio
                    'audio/m4a',        // M4A
                    'audio/x-m4a'       // M4A alternative
                ];
                
                if (allowedMimes.includes(file.mimetype)) {
                    cb(null, true);
                } else {
                    cb(new Error(`Invalid audio format. Supported: MP3, WAV, WebM, OGG, M4A. Received: ${file.mimetype}`));
                }
            }
        });

        // Serve plugin UI (admin panel)
        this.api.registerRoute('GET', '/tts/ui', (req, res) => {
            res.sendFile(path.join(__dirname, 'ui', 'admin-panel.html'));
        });

        // Get TTS configuration
        this.api.registerRoute('GET', '/api/tts/config', (req, res) => {
            res.json({
                success: true,
                config: {
                    ...this.config,
                    googleApiKey: this.config.googleApiKey ? '***HIDDEN***' : null,
                    speechifyApiKey: this.config.speechifyApiKey ? '***REDACTED***' : null,
                    elevenlabsApiKey: this.config.elevenlabsApiKey ? '***REDACTED***' : null,
                    openaiApiKey: this.config.openaiApiKey ? '***REDACTED***' : null,
                    fishaudioApiKey: this.config.fishaudioApiKey ? '***REDACTED***' : null,
                    siliconflowApiKey: this.config.siliconflowApiKey ? '***REDACTED***' : null,
                    tiktokSessionId: this.config.tiktokSessionId ? '***HIDDEN***' : null
                }
            });
        });

        // Update TTS configuration
        this.api.registerRoute('POST', '/api/tts/config', async (req, res) => {
            try {
                const updates = req.body;

                // Validate defaultVoice is compatible with defaultEngine
                // Note: Voice validation is performed when possible, but configuration save
                // is allowed even if validation cannot be completed (e.g., API temporarily unavailable)
                // Voice compatibility will be validated again during actual TTS synthesis
                if (updates.defaultVoice && updates.defaultEngine) {
                    let engineVoices = {};
                    let canValidate = false;

                    try {
                        if (updates.defaultEngine === 'tiktok' && this.engines.tiktok) {
                            engineVoices = TikTokEngine.getVoices();
                            canValidate = true;
                        } else if (updates.defaultEngine === 'google' && this.engines.google) {
                            engineVoices = GoogleEngine.getVoices();
                            canValidate = true;
                        } else if (updates.defaultEngine === 'speechify' && this.engines.speechify) {
                            engineVoices = await this.engines.speechify.getVoices();
                            canValidate = true;
                        } else if (updates.defaultEngine === 'elevenlabs' && this.engines.elevenlabs) {
                            engineVoices = await this.engines.elevenlabs.getVoices();
                            canValidate = true;
                        } else if (updates.defaultEngine === 'openai' && this.engines.openai) {
                            engineVoices = OpenAIEngine.getVoices();
                            canValidate = true;
                        } else if (updates.defaultEngine === 'fishaudio' && this.engines.fishaudio) {
                            engineVoices = FishSpeechEngine.getVoices();
                            canValidate = true;
                        } else if (updates.defaultEngine === 'siliconflow' && this.engines.siliconflow) {
                            engineVoices = SiliconFlowEngine.getVoices();
                            canValidate = true;
                        }
                    } catch (error) {
                        // Voice fetching failed - log warning but allow save to proceed
                        this.logger.warn(`Failed to fetch voices for validation during config save: ${error.message}`);
                        this._logDebug('CONFIG', 'Voice validation skipped due to fetch error', { 
                            error: error.message,
                            voice: updates.defaultVoice,
                            engine: updates.defaultEngine
                        });
                        canValidate = false;
                    }

                    // Attempt validation if voices were fetched successfully
                    if (canValidate && typeof engineVoices === 'object' && engineVoices !== null && Object.keys(engineVoices).length > 0) {
                        if (!engineVoices[updates.defaultVoice]) {
                            // Voice not found - but check if this might be due to fallback voices
                            // Log warning with helpful info but DON'T block the save
                            // This prevents config save failures when API is temporarily unavailable
                            this.logger.warn(
                                `Voice '${updates.defaultVoice}' not found in current voice list for engine '${updates.defaultEngine}'. ` +
                                `This might indicate the voice is unavailable or the API is using fallback data. ` +
                                `Configuration will be saved anyway and voice compatibility will be checked during synthesis.`
                            );
                            this._logDebug('CONFIG', 'Voice not in available list - allowing save anyway', {
                                voice: updates.defaultVoice,
                                engine: updates.defaultEngine,
                                voiceCount: Object.keys(engineVoices).length,
                                sampleVoices: Object.keys(engineVoices).slice(0, 10)
                            });
                            // DO NOT return error - allow save to proceed
                        } else {
                            this._logDebug('CONFIG', 'Voice validation successful', {
                                voice: updates.defaultVoice,
                                engine: updates.defaultEngine
                            });
                        }
                    } else {
                        // Cannot validate (engine not available or no voices returned)
                        this.logger.warn(
                            `Cannot validate voice '${updates.defaultVoice}' for engine '${updates.defaultEngine}' ` +
                            `(engine not initialized or voices unavailable). Configuration will be saved anyway.`
                        );
                        this._logDebug('CONFIG', 'Voice validation skipped - engine unavailable', {
                            voice: updates.defaultVoice,
                            engine: updates.defaultEngine,
                            canValidate
                        });
                    }
                }

                // Update config (skip API keys and SessionID - they have dedicated handling below)
                Object.keys(updates).forEach(key => {
                    if (updates[key] !== undefined && key in this.config && 
                        key !== 'googleApiKey' && key !== 'speechifyApiKey' && 
                        key !== 'elevenlabsApiKey' && key !== 'openaiApiKey' && 
                        key !== 'fishaudioApiKey' && key !== 'siliconflowApiKey' && 
                        key !== 'tiktokSessionId') {
                        this.config[key] = updates[key];
                    }
                });

                // TikTok SessionID support removed (engine no longer used)

                // Update Google API key if provided (and not the placeholder)
                if (updates.googleApiKey && updates.googleApiKey !== '***HIDDEN***') {
                    this.config.googleApiKey = updates.googleApiKey;
                    // Save to global settings for centralized management
                    const db = this.api.getDatabase();
                    db.setSetting('tts_google_api_key', updates.googleApiKey);
                    if (!this.engines.google) {
                        this.engines.google = new GoogleEngine(
                            updates.googleApiKey,
                            this.logger,
                            { performanceMode: this.config.performanceMode }
                        );
                        this.logger.info('Google TTS engine initialized via config update');
                    } else {
                        this.engines.google.setApiKey(updates.googleApiKey);
                    }
                }

                // Update Speechify API key if provided (and not the placeholder)
                if (updates.speechifyApiKey && updates.speechifyApiKey !== '***REDACTED***') {
                    this.config.speechifyApiKey = updates.speechifyApiKey;
                    // Save to global settings for centralized management
                    const db = this.api.getDatabase();
                    db.setSetting('tts_speechify_api_key', updates.speechifyApiKey);
                    if (!this.engines.speechify) {
                        this.engines.speechify = new SpeechifyEngine(
                            updates.speechifyApiKey,
                            this.logger,
                            { performanceMode: this.config.performanceMode }
                        );
                        this.logger.info('Speechify TTS engine initialized via config update');
                    } else {
                        this.engines.speechify.setApiKey(updates.speechifyApiKey);
                    }
                }

                // Update ElevenLabs API key if provided (and not the placeholder)
                if (updates.elevenlabsApiKey && updates.elevenlabsApiKey !== '***REDACTED***') {
                    this.config.elevenlabsApiKey = updates.elevenlabsApiKey;
                    // Save to global settings for centralized management
                    const db = this.api.getDatabase();
                    db.setSetting('tts_elevenlabs_api_key', updates.elevenlabsApiKey);
                    if (!this.engines.elevenlabs) {
                        this.engines.elevenlabs = new ElevenLabsEngine(
                            updates.elevenlabsApiKey,
                            this.logger,
                            { performanceMode: this.config.performanceMode }
                        );
                        this.logger.info('ElevenLabs TTS engine initialized via config update');
                    } else {
                        this.engines.elevenlabs.setApiKey(updates.elevenlabsApiKey);
                    }
                }

                // Update OpenAI API key if provided (and not the placeholder)
                if (updates.openaiApiKey && updates.openaiApiKey !== '***REDACTED***') {
                    this.config.openaiApiKey = updates.openaiApiKey;
                    // Save to global settings for centralized management
                    const db = this.api.getDatabase();
                    db.setSetting('tts_openai_api_key', updates.openaiApiKey);
                    if (!this.engines.openai) {
                        this.engines.openai = new OpenAIEngine(
                            updates.openaiApiKey,
                            this.logger,
                            { performanceMode: this.config.performanceMode }
                        );
                        this.logger.info('OpenAI TTS engine initialized via config update');
                    } else {
                        this.engines.openai.setApiKey(updates.openaiApiKey);
                    }
                }

                // Update Fish.audio API key if provided (and not the placeholder)
                if (updates.fishaudioApiKey && updates.fishaudioApiKey !== '***REDACTED***') {
                    this.config.fishaudioApiKey = updates.fishaudioApiKey;
                    // Save to Fish.audio API key setting
                    const db = this.api.getDatabase();
                    db.setSetting('tts_fishaudio_api_key', updates.fishaudioApiKey);
                    db.setSetting('fishaudio_api_key', updates.fishaudioApiKey); // Also save to global key
                    if (!this.engines.fishaudio) {
                        try {
                            this.engines.fishaudio = new FishSpeechEngine(
                                updates.fishaudioApiKey,
                                this.logger,
                                { performanceMode: this.config.performanceMode }
                            );
                            this.logger.info('Fish.audio TTS engine initialized via config update');
                        } catch (error) {
                            this.logger.error(`Fish.audio TTS engine initialization failed: ${error.message}`);
                            this.engines.fishaudio = null;
                        }
                    } else {
                        try {
                            this.engines.fishaudio.setApiKey(updates.fishaudioApiKey);
                        } catch (error) {
                            this.logger.error(`Fish.audio API key update failed: ${error.message}`);
                        }
                    }
                }
                
                // Update SiliconFlow API key if provided (and not the placeholder)
                if (updates.siliconflowApiKey && updates.siliconflowApiKey !== '***REDACTED***') {
                    this.config.siliconflowApiKey = updates.siliconflowApiKey;
                    // Save to centralized SiliconFlow API key setting (shared with StreamAlchemy)
                    const db = this.api.getDatabase();
                    db.setSetting('siliconflow_api_key', updates.siliconflowApiKey);
                    // Also save to legacy key for backwards compatibility
                    db.setSetting('tts_fishspeech_api_key', updates.siliconflowApiKey);
                    if (!this.engines.siliconflow) {
                        try {
                            this.engines.siliconflow = new SiliconFlowEngine(
                                updates.siliconflowApiKey,
                                this.logger,
                                { performanceMode: this.config.performanceMode }
                            );
                            this.logger.info('SiliconFlow TTS engine initialized via config update');
                        } catch (error) {
                            this.logger.error(`SiliconFlow TTS engine initialization failed: ${error.message}`);
                            this.engines.siliconflow = null;
                        }
                    } else {
                        try {
                            this.engines.siliconflow.setApiKey(updates.siliconflowApiKey);
                        } catch (error) {
                            this.logger.error(`SiliconFlow API key update failed: ${error.message}`);
                        }
                    }
                }

                // Update profanity filter if changed
                if (updates.profanityFilter) {
                    this.profanityFilter.setMode(updates.profanityFilter);
                }

                // Update language detector configuration if changed
                if (updates.fallbackLanguage || updates.languageConfidenceThreshold || updates.languageMinTextLength) {
                    this.languageDetector.updateConfig({
                        fallbackLanguage: updates.fallbackLanguage,
                        confidenceThreshold: updates.languageConfidenceThreshold,
                        minTextLength: updates.languageMinTextLength
                    });
                    this._logDebug('CONFIG', 'Language detector configuration updated', {
                        fallbackLanguage: updates.fallbackLanguage,
                        confidenceThreshold: updates.languageConfidenceThreshold,
                        minTextLength: updates.languageMinTextLength
                    });
                }

                // Reinitialize engines if performance mode changed
                if (updates.performanceMode && updates.performanceMode !== this.config.performanceMode) {
                    this.logger.info(`Performance mode changed from '${this.config.performanceMode}' to '${updates.performanceMode}' - reinitializing engines`);
                    
                    // Reinitialize Google engine with new performance mode
                    if (this.engines.google) {
                        this.engines.google = new GoogleEngine(
                            this.config.googleApiKey,
                            this.logger,
                            { performanceMode: updates.performanceMode }
                        );
                    }
                    
                    // Reinitialize Speechify engine with new performance mode
                    if (this.engines.speechify) {
                        this.engines.speechify = new SpeechifyEngine(
                            this.config.speechifyApiKey,
                            this.logger,
                            { ...this.config, performanceMode: updates.performanceMode }
                        );
                    }
                    
                    // Reinitialize ElevenLabs engine with new performance mode
                    if (this.engines.elevenlabs) {
                        try {
                            this.engines.elevenlabs = new ElevenLabsEngine(
                                this.config.elevenlabsApiKey,
                                this.logger,
                                { ...this.config, performanceMode: updates.performanceMode }
                            );
                        } catch (error) {
                            this.logger.error(`ElevenLabs engine reinitialization failed: ${error.message}`);
                            this.engines.elevenlabs = null;
                        }
                    }
                    
                    // Reinitialize OpenAI engine with new performance mode
                    if (this.engines.openai) {
                        try {
                            this.engines.openai = new OpenAIEngine(
                                this.config.openaiApiKey,
                                this.logger,
                                { ...this.config, performanceMode: updates.performanceMode }
                            );
                        } catch (error) {
                            this.logger.error(`OpenAI engine reinitialization failed: ${error.message}`);
                            this.engines.openai = null;
                        }
                    }
                    
                    // Reinitialize Fish.audio engine with new performance mode
                    if (this.engines.fishaudio) {
                        try {
                            this.engines.fishaudio = new FishSpeechEngine(
                                this.config.fishaudioApiKey,
                                this.logger,
                                { ...this.config, performanceMode: updates.performanceMode }
                            );
                        } catch (error) {
                            this.logger.error(`Fish.audio engine reinitialization failed: ${error.message}`);
                            this.engines.fishaudio = null;
                        }
                    }
                    
                    // Reinitialize SiliconFlow engine with new performance mode
                    if (this.engines.siliconflow) {
                        try {
                            this.engines.siliconflow = new SiliconFlowEngine(
                                this.config.siliconflowApiKey,
                                this.logger,
                                { ...this.config, performanceMode: updates.performanceMode }
                            );
                        } catch (error) {
                            this.logger.error(`SiliconFlow engine reinitialization failed: ${error.message}`);
                            this.engines.siliconflow = null;
                        }
                    }
                }

                // Handle fallback engine enable/disable changes
                // Note: Changes to fallback engines require a server restart to fully take effect
                // This is because engine initialization happens at startup for resource efficiency
                const fallbackChanged = (
                    updates.enableTikTokFallback !== undefined ||
                    updates.enableGoogleFallback !== undefined ||
                    updates.enableSpeechifyFallback !== undefined ||
                    updates.enableElevenlabsFallback !== undefined ||
                    updates.enableOpenAIFallback !== undefined ||
                    updates.enableFishAudioFallback !== undefined ||
                    updates.enableSiliconFlowFallback !== undefined ||
                    updates.defaultEngine !== undefined
                );
                
                if (fallbackChanged) {
                    this._logDebug('CONFIG', 'Fallback engine settings changed', {
                        enableTikTokFallback: updates.enableTikTokFallback,
                        enableGoogleFallback: updates.enableGoogleFallback,
                        enableSpeechifyFallback: updates.enableSpeechifyFallback,
                        enableElevenlabsFallback: updates.enableElevenlabsFallback,
                        enableOpenAIFallback: updates.enableOpenAIFallback,
                        enableFishAudioFallback: updates.enableFishAudioFallback,
                        enableSiliconFlowFallback: updates.enableSiliconFlowFallback,
                        defaultEngine: updates.defaultEngine
                    });
                    
                    // Helper function to validate and retrieve API key from database
                    const getValidApiKey = (...keys) => {
                        for (const key of keys) {
                            const value = db.getSetting(key);
                            if (value && typeof value === 'string' && value.trim() !== '') {
                                return value.trim();
                            }
                        }
                        return null;
                    };
                    
                    // Reload API keys from database to ensure we have the latest values
                    // This is critical when enabling engines that weren't initialized at startup
                    if (!this.config.googleApiKey) {
                        this.config.googleApiKey = getValidApiKey('tts_google_api_key');
                    }
                    if (!this.config.speechifyApiKey) {
                        this.config.speechifyApiKey = getValidApiKey('tts_speechify_api_key');
                    }
                    if (!this.config.elevenlabsApiKey) {
                        this.config.elevenlabsApiKey = getValidApiKey('tts_elevenlabs_api_key');
                    }
                    if (!this.config.openaiApiKey) {
                        this.config.openaiApiKey = getValidApiKey('tts_openai_api_key');
                    }
                    if (!this.config.fishaudioApiKey) {
                        this.config.fishaudioApiKey = getValidApiKey('tts_fishaudio_api_key', 'fishaudio_api_key');
                    }
                    if (!this.config.siliconflowApiKey) {
                        this.config.siliconflowApiKey = getValidApiKey('siliconflow_api_key', 'tts_fishspeech_api_key', 'streamalchemy_siliconflow_api_key');
                    }
                    
                    // Helper function to determine if an engine should be loaded
                    const shouldLoadEngine = (engineName) => {
                        const newDefaultEngine = updates.defaultEngine || this.config.defaultEngine;
                        if (newDefaultEngine === engineName) return true;
                        
                        switch (engineName) {
                            case 'tiktok':
                                return (updates.enableTikTokFallback !== undefined ? updates.enableTikTokFallback : this.config.enableTikTokFallback) === true;
                            case 'google':
                                return (updates.enableGoogleFallback !== undefined ? updates.enableGoogleFallback : this.config.enableGoogleFallback) === true;
                            case 'speechify':
                                return (updates.enableSpeechifyFallback !== undefined ? updates.enableSpeechifyFallback : this.config.enableSpeechifyFallback) === true;
                            case 'elevenlabs':
                                return (updates.enableElevenlabsFallback !== undefined ? updates.enableElevenlabsFallback : this.config.enableElevenlabsFallback) === true;
                            case 'openai':
                                return (updates.enableOpenAIFallback !== undefined ? updates.enableOpenAIFallback : this.config.enableOpenAIFallback) === true;
                            case 'fishaudio':
                                return (updates.enableFishAudioFallback !== undefined ? updates.enableFishAudioFallback : this.config.enableFishAudioFallback) === true;
                            case 'siliconflow':
                                return (updates.enableSiliconFlowFallback !== undefined ? updates.enableSiliconFlowFallback : this.config.enableSiliconFlowFallback) === true;
                            default:
                                return false;
                        }
                    };
                    
                    // Enable/Disable TikTok engine based on new settings
                    // TikTok TTS is free and doesn't require an API key
                    if (shouldLoadEngine('tiktok') && !this.engines.tiktok) {
                        try {
                            this.engines.tiktok = new TikTokEngine(
                                this.logger,
                                { 
                                    db: this.api.getDatabase(),
                                    performanceMode: this.config.performanceMode 
                                }
                            );
                            this.logger.info('TTS: ✅ TikTok engine enabled via config update');
                        } catch (error) {
                            this.logger.error(`TikTok engine initialization failed: ${error.message}`);
                            this.engines.tiktok = null;
                        }
                    } else if (!shouldLoadEngine('tiktok') && this.engines.tiktok) {
                        this.engines.tiktok = null;
                        this.logger.info('TTS: ⏸️  TikTok engine disabled via config update');
                    }
                    
                    // Enable/Disable Google engine based on new settings
                    if (this.config.googleApiKey) {
                        if (shouldLoadEngine('google') && !this.engines.google) {
                            this.engines.google = new GoogleEngine(this.config.googleApiKey, this.logger, { performanceMode: this.config.performanceMode });
                            this.logger.info('TTS: ✅ Google engine enabled via config update');
                        } else if (!shouldLoadEngine('google') && this.engines.google) {
                            this.engines.google = null;
                            this.logger.info('TTS: ⏸️  Google engine disabled via config update');
                        }
                    }
                    
                    // Enable/Disable Speechify engine based on new settings
                    // Note: Always keep Speechify engine initialized when API key is present
                    // to support voice cloning feature, regardless of TTS settings
                    if (this.config.speechifyApiKey) {
                        if (!this.engines.speechify) {
                            try {
                                this.engines.speechify = new SpeechifyEngine(this.config.speechifyApiKey, this.logger, { performanceMode: this.config.performanceMode });
                                this.logger.info('TTS: ✅ Speechify engine enabled via config update');
                            } catch (error) {
                                this.logger.error(`Speechify engine initialization failed: ${error.message}`);
                                this.engines.speechify = null;
                            }
                        }
                        // Do NOT disable Speechify engine even if not needed for TTS
                        // It's required for voice cloning functionality
                    }
                    
                    // Enable/Disable ElevenLabs engine based on new settings
                    if (this.config.elevenlabsApiKey) {
                        if (shouldLoadEngine('elevenlabs') && !this.engines.elevenlabs) {
                            try {
                                this.engines.elevenlabs = new ElevenLabsEngine(this.config.elevenlabsApiKey, this.logger, { performanceMode: this.config.performanceMode });
                                this.logger.info('TTS: ✅ ElevenLabs engine enabled via config update');
                            } catch (error) {
                                this.logger.error(`ElevenLabs engine initialization failed: ${error.message}`);
                                this.engines.elevenlabs = null;
                            }
                        } else if (!shouldLoadEngine('elevenlabs') && this.engines.elevenlabs) {
                            this.engines.elevenlabs = null;
                            this.logger.info('TTS: ⏸️  ElevenLabs engine disabled via config update');
                        }
                    }
                    
                    // Enable/Disable OpenAI engine based on new settings
                    if (this.config.openaiApiKey) {
                        if (shouldLoadEngine('openai') && !this.engines.openai) {
                            try {
                                this.engines.openai = new OpenAIEngine(this.config.openaiApiKey, this.logger, { performanceMode: this.config.performanceMode });
                                this.logger.info('TTS: ✅ OpenAI engine enabled via config update');
                            } catch (error) {
                                this.logger.error(`OpenAI engine initialization failed: ${error.message}`);
                                this.engines.openai = null;
                            }
                        } else if (!shouldLoadEngine('openai') && this.engines.openai) {
                            this.engines.openai = null;
                            this.logger.info('TTS: ⏸️  OpenAI engine disabled via config update');
                        }
                    }
                    
                    // Enable/Disable Fish.audio engine based on new settings
                    if (this.config.fishaudioApiKey) {
                        if (shouldLoadEngine('fishaudio') && !this.engines.fishaudio) {
                            try {
                                this.engines.fishaudio = new FishSpeechEngine(this.config.fishaudioApiKey, this.logger, { performanceMode: this.config.performanceMode });
                                this.logger.info('TTS: ✅ Fish.audio engine enabled via config update');
                            } catch (error) {
                                this.logger.error(`Fish.audio engine initialization failed: ${error.message}`);
                                this.engines.fishaudio = null;
                            }
                        } else if (!shouldLoadEngine('fishaudio') && this.engines.fishaudio) {
                            this.engines.fishaudio = null;
                            this.logger.info('TTS: ⏸️  Fish.audio engine disabled via config update');
                        }
                    }
                    
                    // Enable/Disable SiliconFlow engine based on new settings
                    if (this.config.siliconflowApiKey) {
                        if (shouldLoadEngine('siliconflow') && !this.engines.siliconflow) {
                            try {
                                this.engines.siliconflow = new SiliconFlowEngine(this.config.siliconflowApiKey, this.logger, { performanceMode: this.config.performanceMode });
                                this.logger.info('TTS: ✅ SiliconFlow engine enabled via config update');
                            } catch (error) {
                                this.logger.error(`SiliconFlow engine initialization failed: ${error.message}`);
                                this.engines.siliconflow = null;
                            }
                        } else if (!shouldLoadEngine('siliconflow') && this.engines.siliconflow) {
                            this.engines.siliconflow = null;
                            this.logger.info('TTS: ⏸️  SiliconFlow engine disabled via config update');
                        }
                    }
                }

                this._saveConfig();

                res.json({ success: true, config: this.config });

            } catch (error) {
                this.logger.error(`Failed to update config: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get available voices
        this.api.registerRoute('GET', '/api/tts/voices', async (req, res) => {
            const engine = req.query.engine || 'all';

            const voices = {};

            // TikTok engine - free TTS option
            if ((engine === 'all' || engine === 'tiktok') && this.engines.tiktok) {
                voices.tiktok = TikTokEngine.getVoices();
            }

            if ((engine === 'all' || engine === 'google') && this.engines.google) {
                try {
                    // Use dynamic voice fetching if available, fallback to static
                    voices.google = await this.engines.google.getAllVoices();
                } catch (error) {
                    this.logger.error('Failed to load Google voices', { error: error.message });
                    voices.google = GoogleEngine.getVoices();
                }
            }

            if ((engine === 'all' || engine === 'speechify') && this.engines.speechify) {
                try {
                    voices.speechify = await this.engines.speechify.getVoices();
                } catch (error) {
                    this.logger.error('Failed to load Speechify voices', { error: error.message });
                    voices.speechify = {};
                }
            }

            if ((engine === 'all' || engine === 'elevenlabs') && this.engines.elevenlabs) {
                try {
                    voices.elevenlabs = await this.engines.elevenlabs.getVoices();
                } catch (error) {
                    this.logger.error('Failed to load ElevenLabs voices', { error: error.message });
                    voices.elevenlabs = {};
                }
            }

            if ((engine === 'all' || engine === 'openai') && this.engines.openai) {
                voices.openai = OpenAIEngine.getVoices();
            }

            if ((engine === 'all' || engine === 'fishaudio') && this.engines.fishaudio) {
                voices.fishaudio = FishSpeechEngine.getVoices();
            }

            if ((engine === 'all' || engine === 'siliconflow') && this.engines.siliconflow) {
                voices.siliconflow = SiliconFlowEngine.getVoices();
            }

            res.json({ success: true, voices });
        });

        // Refresh voices from Google API (force fresh fetch)
        // Rate-limited to prevent API abuse (max 10 refreshes per minute)
        const rateLimiter = require('express-rate-limit');
        const voiceRefreshLimiter = rateLimiter({
            windowMs: 60 * 1000, // 1 minute
            max: 10, // Max 10 refreshes per minute
            message: {
                success: false,
                error: 'Too many voice refresh requests, please try again after a minute'
            },
            standardHeaders: true,
            legacyHeaders: false,
            handler: (req, res) => {
                this.logger.warn('Voice refresh rate limit exceeded', {
                    ip: req.ip,
                    path: req.path
                });
                res.status(429).json({
                    success: false,
                    error: 'Too many voice refresh requests, please try again after a minute'
                });
            }
        });

        this.api.registerRoute('POST', '/api/tts/voices/refresh', voiceRefreshLimiter, async (req, res) => {
            try {
                if (!this.engines.google) {
                    return res.status(400).json({
                        success: false,
                        error: 'Google TTS engine not initialized'
                    });
                }

                // Force fresh fetch from API
                const voices = await this.engines.google.getAllVoices(true);
                
                this.logger.info('Google TTS voices manually refreshed', {
                    voiceCount: Object.keys(voices).length,
                    ip: req.ip
                });
                
                return res.json({
                    success: true,
                    message: 'Voices refreshed from Google API',
                    voiceCount: Object.keys(voices).length,
                    voices
                });
            } catch (error) {
                this.logger.error('Failed to refresh voices from API', { error: error.message });
                return res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Manual TTS trigger
        this.api.registerRoute('POST', '/api/tts/speak', async (req, res) => {
            try {
                const { text, userId, username, voiceId, engine, source = 'manual' } = req.body;

                if (!text || !username) {
                    return res.status(400).json({
                        success: false,
                        error: 'Missing required fields: text, username'
                    });
                }

                const result = await this.speak({
                    text,
                    userId: userId || username,
                    username,
                    voiceId,
                    engine,
                    source,
                    teamLevel: 999, // Manual triggers bypass team level
                    priority: 50 // High priority
                });

                res.json(result);

            } catch (error) {
                this.logger.error(`Manual TTS speak error: ${error.message}`);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get queue info
        this.api.registerRoute('GET', '/api/tts/queue', (req, res) => {
            res.json({
                success: true,
                queue: this.queueManager.getInfo(),
                stats: this.queueManager.getStats()
            });
        });

        // Clear queue
        this.api.registerRoute('POST', '/api/tts/queue/clear', (req, res) => {
            const count = this.queueManager.clear();
            res.json({ success: true, cleared: count });
        });

        // Skip current item
        this.api.registerRoute('POST', '/api/tts/queue/skip', (req, res) => {
            const skipped = this.queueManager.skipCurrent();
            res.json({ success: true, skipped });
        });

        // User management routes
        this.api.registerRoute('GET', '/api/tts/users', (req, res) => {
            const filter = req.query.filter || null;
            const users = this.permissionManager.getAllUsers(filter);
            res.json({ success: true, users });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/allow', (req, res) => {
            const { userId } = req.params;
            const { username } = req.body;
            const result = this.permissionManager.allowUser(userId, username || userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/deny', (req, res) => {
            const { userId } = req.params;
            const { username } = req.body;
            const result = this.permissionManager.denyUser(userId, username || userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/blacklist', (req, res) => {
            const { userId } = req.params;
            const { username } = req.body;
            const result = this.permissionManager.blacklistUser(userId, username || userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/unblacklist', (req, res) => {
            const { userId } = req.params;
            const result = this.permissionManager.unblacklistUser(userId);
            res.json({ success: result });
        });

        this.api.registerRoute('POST', '/api/tts/users/:userId/voice', (req, res) => {
            const { userId } = req.params;
            const { username, voiceId, engine, emotion } = req.body;

            if (!voiceId || !engine) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: voiceId, engine'
                });
            }

            const result = this.permissionManager.assignVoice(
                userId,
                username || userId,
                voiceId,
                engine,
                emotion
            );
            res.json({ success: result });
        });

        this.api.registerRoute('DELETE', '/api/tts/users/:userId/voice', (req, res) => {
            const { userId } = req.params;
            const result = this.permissionManager.removeVoiceAssignment(userId);
            res.json({ success: result });
        });

        this.api.registerRoute('DELETE', '/api/tts/users/:userId', (req, res) => {
            const { userId } = req.params;
            const result = this.permissionManager.deleteUser(userId);
            res.json({ success: result });
        });

        // Permission stats
        this.api.registerRoute('GET', '/api/tts/permissions/stats', (req, res) => {
            const stats = this.permissionManager.getStats();
            res.json({ success: true, stats });
        });

        // Debug logs
        this.api.registerRoute('GET', '/api/tts/debug/logs', (req, res) => {
            const limit = parseInt(req.query.limit) || 100;
            const category = req.query.category || null;

            let logs = this.debugLogs;

            if (category) {
                logs = logs.filter(log => log.category === category);
            }

            res.json({
                success: true,
                logs: logs.slice(-limit),
                totalLogs: this.debugLogs.length
            });
        });

        // Clear debug logs
        this.api.registerRoute('POST', '/api/tts/debug/clear', (req, res) => {
            const count = this.debugLogs.length;
            this.debugLogs = [];
            res.json({ success: true, cleared: count });
        });

        // Enable/disable debug
        this.api.registerRoute('POST', '/api/tts/debug/toggle', (req, res) => {
            this.debugEnabled = !this.debugEnabled;
            this._logDebug('DEBUG', `Debug logging ${this.debugEnabled ? 'enabled' : 'disabled'}`);
            res.json({ success: true, debugEnabled: this.debugEnabled });
        });

        // Get plugin status
        this.api.registerRoute('GET', '/api/tts/status', (req, res) => {
            res.json({
                success: true,
                status: {
                    initialized: true,
                    config: {
                        defaultEngine: this.config.defaultEngine,
                        defaultVoice: this.config.defaultVoice,
                        enabledForChat: this.config.enabledForChat,
                        autoLanguageDetection: this.config.autoLanguageDetection,
                        volume: this.config.volume,
                        speed: this.config.speed
                    },
                    engines: {
                        google: !!this.engines.google,
                        speechify: !!this.engines.speechify,
                        elevenlabs: !!this.engines.elevenlabs,
                        openai: !!this.engines.openai
                    },
                    queue: this.queueManager.getInfo(),
                    debugEnabled: this.debugEnabled,
                    totalDebugLogs: this.debugLogs.length
                }
            });
        });

        // Get recent active chat users for autocomplete
        this.api.registerRoute('GET', '/api/tts/recent-users', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const db = this.api.getDatabase();
                
                // Query event_logs for recent chat messages
                const stmt = db.db.prepare(`
                    SELECT DISTINCT username, MAX(timestamp) as last_seen
                    FROM event_logs
                    WHERE event_type = 'chat' AND username IS NOT NULL AND username != ''
                    GROUP BY username
                    ORDER BY last_seen DESC
                    LIMIT ?
                `);
                
                const users = stmt.all(limit);
                
                res.json({
                    success: true,
                    users: users.map(u => ({
                        username: u.username,
                        lastSeen: u.last_seen
                    }))
                });
            } catch (error) {
                this.logger.error(`Failed to get recent users: ${error.message}`);
                res.json({ success: false, error: error.message });
            }
        });

        // Voice Cloning Routes - Using multipart/form-data instead of JSON for efficiency
        this.api.registerRoute('POST', '/api/tts/voice-clones/create', (req, res) => {
            // Execute multer middleware inside the handler (registerRoute only accepts 3 params)
            voiceCloneUpload.single('audioFile')(req, res, async (err) => {
                try {
                    // Handle multer errors
                    if (err) {
                        if (err.code === 'LIMIT_FILE_SIZE') {
                            return res.status(400).json({
                                success: false,
                                error: 'Audio file is too large. Maximum size is 5MB.'
                            });
                        }
                        return res.status(400).json({
                            success: false,
                            error: err.message
                        });
                    }

                    // Extract form data
                    const { voiceName, language, consentConfirmation } = req.body;
                    const audioFile = req.file;

                    // Validate required fields
                    if (!audioFile) {
                        return res.status(400).json({
                            success: false,
                            error: 'Missing audio file. Please upload an audio file.'
                        });
                    }

                    if (!voiceName) {
                        return res.status(400).json({
                            success: false,
                            error: 'Missing voice name. Please provide a name for the voice clone.'
                        });
                    }

                    if (!consentConfirmation) {
                        return res.status(400).json({
                            success: false,
                            error: 'Missing consent confirmation. You must confirm consent to create a voice clone.'
                        });
                    }

                    // Validate voice name length
                    if (voiceName.length > 100) {
                        return res.status(400).json({
                            success: false,
                            error: 'Voice name is too long. Maximum 100 characters.'
                        });
                    }

                    // Check if Speechify engine is available
                    if (!this.engines.speechify) {
                        return res.status(400).json({
                            success: false,
                            error: 'Speechify engine is not configured. Please add your Speechify API key in the Configuration tab.'
                        });
                    }

                    // Convert buffer to base64 for Speechify API
                    // Note: Speechify's API currently expects base64-encoded audio in JSON format
                    // (verified in speechify-engine.js line 613-619). While this requires conversion,
                    // using multipart upload from client to server still provides benefits:
                    // - No HTTP 413 errors (multipart bypasses express.json() limits)
                    // - Reduced client-to-server bandwidth (33% savings)
                    // - Better browser memory efficiency (no client-side base64 encoding)
                    const audioBase64 = audioFile.buffer.toString('base64');

                    this.logger.info(`Creating voice clone "${voiceName}" (${audioFile.size} bytes, ${audioFile.mimetype})`);

                    const result = await this.engines.speechify.createVoiceClone({
                        audioData: audioBase64,
                        voiceName,
                        language: language || 'en',
                        consentConfirmation
                    });

                    this.logger.info(`Voice clone "${voiceName}" created successfully (ID: ${result.voice_id})`);

                    res.json({
                        success: true,
                        voice: result
                    });
                } catch (error) {
                    this.logger.error(`Failed to create voice clone: ${error.message}`);
                    
                    res.status(500).json({
                        success: false,
                        error: error.message
                    });
                }
            });
        });

        this.api.registerRoute('GET', '/api/tts/voice-clones/list', async (req, res) => {
            try {
                // Check if Speechify engine is available
                if (!this.engines.speechify) {
                    return res.json({
                        success: true,
                        voices: []
                    });
                }

                const voices = await this.engines.speechify.getCustomVoices();

                res.json({
                    success: true,
                    voices
                });
            } catch (error) {
                this.logger.error(`Failed to get custom voices: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.api.registerRoute('DELETE', '/api/tts/voice-clones/:voiceId', async (req, res) => {
            try {
                const { voiceId } = req.params;

                if (!voiceId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Voice ID is required'
                    });
                }

                // Check if Speechify engine is available
                if (!this.engines.speechify) {
                    return res.status(400).json({
                        success: false,
                        error: 'Speechify engine is not configured'
                    });
                }

                await this.engines.speechify.deleteVoiceClone(voiceId);

                res.json({
                    success: true
                });
            } catch (error) {
                this.logger.error(`Failed to delete voice clone: ${error.message}`);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        this.logger.info('TTS Plugin: HTTP routes registered');
    }

    /**
     * Register Socket.IO events
     */
    _registerSocketEvents() {
        // Client requests TTS
        this.api.registerSocket('tts:speak', async (socket, data) => {
            try {
                const result = await this.speak(data);
                socket.emit('tts:speak:response', result);
            } catch (error) {
                socket.emit('tts:error', { error: error.message });
            }
        });

        // Get queue status
        this.api.registerSocket('tts:queue:status', (socket) => {
            socket.emit('tts:queue:status', this.queueManager.getInfo());
        });

        // Clear queue
        this.api.registerSocket('tts:queue:clear', (socket) => {
            const count = this.queueManager.clear();
            socket.emit('tts:queue:cleared', { count });
            this.api.emit('tts:queue:cleared', { count });
        });

        // Skip current
        this.api.registerSocket('tts:queue:skip', (socket) => {
            const skipped = this.queueManager.skipCurrent();
            socket.emit('tts:queue:skipped', { skipped });
            this.api.emit('tts:queue:skipped', { skipped });
        });

        this.logger.info('TTS Plugin: Socket.IO events registered');
    }

    /**
     * Register TikTok events (for automatic chat TTS)
     */
    _registerTikTokEvents() {
        this.api.registerTikTokEvent('chat', async (data) => {
            try {
                // Skip historical messages - only process messages that arrive after plugin startup
                if (data.timestamp && data.timestamp < this.startupTimestamp) {
                    this._logDebug('TIKTOK_EVENT', 'Skipping historical chat message', {
                        messageTimestamp: data.timestamp,
                        startupTimestamp: this.startupTimestamp,
                        username: data.uniqueId || data.nickname
                    });
                    this.logger.info(`TTS: Skipping historical chat message from ${data.uniqueId || data.nickname}`);
                    return;
                }

                // Extract text from either 'message' or 'comment' field
                const chatText = data.message || data.comment;

                // IMPORTANT: Use username/uniqueId as the primary userId for consistency
                // username is the TikTok handle (@username) and is stable across sessions
                // Prioritize: username (actual handle) > uniqueId > nickname (display name)
                const userId = data.username || data.uniqueId || data.nickname || data.userId;
                const username = data.username || data.uniqueId || data.nickname;

                this._logDebug('TIKTOK_EVENT', 'Chat event received', {
                    uniqueId: data.uniqueId,
                    nickname: data.nickname,
                    message: chatText,
                    teamMemberLevel: data.teamMemberLevel,
                    isSubscriber: data.isSubscriber,
                    userId: data.userId,
                    normalizedUserId: userId,
                    normalizedUsername: username,
                    timestamp: data.timestamp
                });

                this.logger.info(`TTS: Received chat event from ${username}: "${chatText}"`);

                // Only process if chat TTS is enabled
                // Note: Global tts_enabled check is now in speak() method
                if (!this.config.enabledForChat) {
                    this._logDebug('TIKTOK_EVENT', 'Chat TTS disabled in config', { enabledForChat: false });
                    this.logger.warn('TTS: Chat TTS is disabled in config');
                    return;
                }

                // Speak chat message
                const result = await this.speak({
                    text: chatText,
                    userId: userId,
                    username: username,
                    source: 'chat',
                    teamLevel: data.teamMemberLevel || 0,
                    isSubscriber: data.isSubscriber || false
                });

                if (!result.success) {
                    this._logDebug('TIKTOK_EVENT', 'Chat message rejected', {
                        error: result.error,
                        reason: result.reason,
                        details: result.details
                    });
                    this.logger.warn(`TTS: Chat message rejected: ${result.error} - ${result.reason || ''}`);
                } else {
                    this._logDebug('TIKTOK_EVENT', 'Chat message queued successfully', {
                        position: result.position,
                        queueSize: result.queueSize
                    });
                }

            } catch (error) {
                this._logDebug('TIKTOK_EVENT', 'Chat event error', {
                    error: error.message,
                    stack: error.stack
                });
                this.logger.error(`TTS chat event error: ${error.message}`);
            }
        });

        this._logDebug('INIT', 'TikTok events registered', { enabledForChat: this.config.enabledForChat });
        this.logger.info(`TTS Plugin: TikTok events registered (enabledForChat: ${this.config.enabledForChat})`);
    }

    /**
     * Main speak method - synthesizes and queues TTS
     * @param {object} params - { text, userId, username, voiceId?, engine?, source?, teamLevel?, ... }
     */
    async speak(params) {
        // ===== GLOBAL TTS ENABLE/DISABLE CHECK =====
        // This check MUST be first to block ALL TTS calls when disabled
        const db = this.api.getDatabase();
        const ttsEnabled = db.getSetting('tts_enabled');
        if (ttsEnabled === 'false') {
            this._logDebug('SPEAK_BLOCKED', 'TTS is globally disabled via Quick Actions', {
                tts_enabled: false,
                source: params.source || 'unknown'
            });
            this.logger.info(`TTS: Blocked - TTS is globally disabled (source: ${params.source || 'unknown'})`);
            return {
                success: false,
                error: 'TTS is globally disabled',
                blocked: true,
                reason: 'tts_disabled'
            };
        }

        const {
            text,
            userId,
            username,
            voiceId = null,
            engine = null,
            source = 'unknown',
            teamLevel = 0,
            isSubscriber = false,
            priority = null
        } = params;

        this._logDebug('SPEAK_START', 'Speak method called', {
            text: text?.substring(0, 50),
            userId,
            username,
            voiceId,
            engine,
            source,
            teamLevel,
            isSubscriber,
            priority
        });

        try {
            // Step 0: Check message prefix filter (only for chat messages)
            // Note: messagePrefixFilter is pre-sanitized in constructor
            if (source === 'chat' && this.config.messagePrefixFilter.length > 0) {
                const trimmedText = text?.trim() || '';
                if (trimmedText.length > 0) {
                    const hasFilteredPrefix = this.config.messagePrefixFilter.some(prefix => 
                        trimmedText.startsWith(prefix)
                    );
                    
                    if (hasFilteredPrefix) {
                        this._logDebug('SPEAK_DENIED', 'Message starts with filtered prefix', {
                            text: trimmedText.substring(0, 50),
                            username,
                            prefixFilters: this.config.messagePrefixFilter
                        });
                        this.logger.info(`TTS blocked for ${username}: Message starts with filtered prefix (${trimmedText.charAt(0)})`);
                        return {
                            success: false,
                            error: 'prefix_filtered',
                            reason: 'message_starts_with_filtered_prefix'
                        };
                    }
                }
            }

            // Step 1: Check permissions
            this._logDebug('SPEAK_STEP1', 'Checking permissions', {
                userId,
                username,
                teamLevel,
                minTeamLevel: this.config.teamMinLevel
            });

            const permissionCheck = this.permissionManager.checkPermission(
                userId,
                username,
                teamLevel,
                this.config.teamMinLevel
            );

            this._logDebug('SPEAK_STEP1', 'Permission check result', permissionCheck);

            if (!permissionCheck.allowed) {
                this._logDebug('SPEAK_DENIED', 'Permission denied', {
                    username,
                    reason: permissionCheck.reason
                });
                this.logger.info(`TTS permission denied for ${username}: ${permissionCheck.reason}`);
                return {
                    success: false,
                    error: 'permission_denied',
                    reason: permissionCheck.reason,
                    details: permissionCheck
                };
            }

            // Step 2: Filter profanity
            this._logDebug('SPEAK_STEP2', 'Filtering profanity', {
                text,
                mode: this.config.profanityFilter
            });

            const profanityResult = this.profanityFilter.filter(text);

            this._logDebug('SPEAK_STEP2', 'Profanity filter result', {
                hasProfanity: profanityResult.hasProfanity,
                action: profanityResult.action,
                matches: profanityResult.matches
            });

            if (this.config.profanityFilter === 'strict' && profanityResult.action === 'drop') {
                this._logDebug('SPEAK_DENIED', 'Dropped due to profanity', {
                    username,
                    text,
                    matches: profanityResult.matches
                });
                this.logger.warn(`TTS dropped due to profanity: ${username} - "${text}"`);
                return {
                    success: false,
                    error: 'profanity_detected',
                    matches: profanityResult.matches
                };
            }

            const filteredText = profanityResult.filtered;

            // Step 2b: Strip emojis if configured
            let processedText = filteredText;
            if (this.config.stripEmojis) {
                const originalWithEmojis = processedText;
                processedText = this._stripEmojis(processedText);
                this._logDebug('SPEAK_STEP2B', 'Stripping emojis', {
                    original: originalWithEmojis,
                    stripped: processedText,
                    emojisRemoved: originalWithEmojis !== processedText
                });
            }

            // Step 3: Validate and truncate text
            this._logDebug('SPEAK_STEP3', 'Validating text', {
                originalLength: text?.length,
                filteredLength: processedText?.length
            });

            if (!processedText || processedText.trim().length === 0) {
                this._logDebug('SPEAK_DENIED', 'Empty text after filtering');
                return { success: false, error: 'empty_text' };
            }

            let finalText = processedText.trim();
            if (finalText.length > this.config.maxTextLength) {
                finalText = finalText.substring(0, this.config.maxTextLength) + '...';
                this._logDebug('SPEAK_STEP3', 'Text truncated', {
                    originalLength: text.length,
                    truncatedLength: this.config.maxTextLength
                });
                this.logger.warn(`TTS text truncated for ${username}: ${text.length} -> ${this.config.maxTextLength}`);
            }

            // Step 4: Determine voice and engine
            this._logDebug('SPEAK_STEP4', 'Getting user settings', { userId });

            const userSettings = this.permissionManager.getUserSettings(userId);
            
            // Track if user has an assigned voice to preserve assignment intent during engine fallback
            const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
            
            // Prioritize user custom voices over source-provided voices
            // EXCEPT for system sources (quiz-show, manual) which should use their configured voice
            const isSystemSource = source === 'quiz-show' || source === 'manual';
            
            let selectedEngine;
            let selectedVoice;
            
            if (isSystemSource) {
                // System sources: use provided voice/engine, fall back to defaults
                selectedEngine = engine || this.config.defaultEngine;
                selectedVoice = voiceId;
            } else {
                // User sources (chat, etc): prioritize user custom voice, then provided voice, then defaults
                selectedEngine = userSettings?.assigned_engine || engine || this.config.defaultEngine;
                selectedVoice = userSettings?.assigned_voice_id || voiceId;
            }

            this._logDebug('SPEAK_STEP4', 'Voice/Engine selection', {
                userId: userId,
                username: username,
                source: source,
                isSystemSource: isSystemSource,
                userSettingsFound: !!userSettings,
                userSettingsRaw: userSettings ? {
                    user_id: userSettings.user_id,
                    username: userSettings.username,
                    assigned_voice_id: userSettings.assigned_voice_id,
                    assigned_engine: userSettings.assigned_engine,
                    allow_tts: userSettings.allow_tts
                } : null,
                requestedEngine: engine,
                assignedEngine: userSettings?.assigned_engine,
                selectedEngine,
                requestedVoice: voiceId,
                assignedVoice: userSettings?.assigned_voice_id,
                selectedVoice,
                hasUserAssignedVoice,
                autoLanguageDetection: this.config.autoLanguageDetection,
                defaultEngine: this.config.defaultEngine,
                defaultVoice: this.config.defaultVoice
            });

            // Priority 1: Auto language detection (if enabled and no user-assigned voice)
            if (!selectedVoice && this.config.autoLanguageDetection) {
                let engineClass = GoogleEngine; // Default to Google instead of TikTok
                if (selectedEngine === 'speechify' && this.engines.speechify) {
                    engineClass = SpeechifyEngine;
                } else if (selectedEngine === 'google' && this.engines.google) {
                    engineClass = GoogleEngine;
                } else if (selectedEngine === 'elevenlabs' && this.engines.elevenlabs) {
                    engineClass = ElevenLabsEngine;
                } else if (selectedEngine === 'openai' && this.engines.openai) {
                    engineClass = OpenAIEngine;
                }

                this._logDebug('SPEAK_STEP4', 'Starting language detection', {
                    text: finalText.substring(0, 50),
                    textLength: finalText.length,
                    engineClass: engineClass.name,
                    fallbackLanguage: this.config.fallbackLanguage,
                    confidenceThreshold: this.config.languageConfidenceThreshold,
                    minTextLength: this.config.languageMinTextLength
                });

                const langResult = this.languageDetector.detectAndGetVoice(
                    finalText, 
                    engineClass,
                    this.config.fallbackLanguage
                );

                this._logDebug('SPEAK_STEP4', 'Language detection result', {
                    originalText: text.substring(0, 50),
                    normalizedText: finalText.substring(0, 50),
                    textLength: finalText.length,
                    result: langResult
                });

                if (langResult && langResult.voiceId) {
                    selectedVoice = langResult.voiceId;
                    
                    // Log comprehensive detection information
                    if (langResult.usedFallback) {
                        this.logger.warn(
                            `Language detection FALLBACK: ` +
                            `Detected="${langResult.detectedLangCode || 'N/A'}" ` +
                            `(confidence: ${(langResult.confidence * 100).toFixed(0)}% < ${(this.config.languageConfidenceThreshold * 100).toFixed(0)}% threshold), ` +
                            `Using fallback="${langResult.langCode}" (${langResult.languageName}), ` +
                            `Voice="${langResult.voiceId}", ` +
                            `Reason="${langResult.reason}", ` +
                            `Text="${finalText.substring(0, 50)}..."`
                        );
                        this._logDebug('LANG_DETECTION_FALLBACK', 'Used fallback language', {
                            originalText: text.substring(0, 50),
                            normalizedText: finalText.substring(0, 50),
                            detectedLangCode: langResult.detectedLangCode,
                            confidence: langResult.confidence,
                            threshold: langResult.threshold,
                            fallbackLangCode: langResult.langCode,
                            fallbackLanguageName: langResult.languageName,
                            selectedVoice: langResult.voiceId,
                            reason: langResult.reason,
                            engine: selectedEngine
                        });
                    } else {
                        this.logger.info(
                            `Language detected: ${langResult.languageName} (${langResult.langCode}) ` +
                            `with confidence ${(langResult.confidence * 100).toFixed(0)}% >= ${(this.config.languageConfidenceThreshold * 100).toFixed(0)}% threshold, ` +
                            `Voice="${langResult.voiceId}" for "${finalText.substring(0, 30)}..."`
                        );
                        this._logDebug('LANG_DETECTION_SUCCESS', 'Language detected with high confidence', {
                            originalText: text.substring(0, 50),
                            normalizedText: finalText.substring(0, 50),
                            langCode: langResult.langCode,
                            languageName: langResult.languageName,
                            confidence: langResult.confidence,
                            threshold: langResult.threshold,
                            selectedVoice: langResult.voiceId,
                            engine: selectedEngine
                        });
                    }
                } else {
                    // Language detection completely failed - use system fallback
                    this.logger.error('Language detection returned null or invalid result, using system fallback');
                    this._logDebug('LANG_DETECTION_ERROR', 'Detection failed completely', {
                        result: langResult,
                        systemFallback: this.config.fallbackLanguage
                    });
                    
                    // Get fallback voice from engine
                    const fallbackVoice = engineClass.getDefaultVoiceForLanguage(this.config.fallbackLanguage);
                    if (fallbackVoice) {
                        selectedVoice = fallbackVoice;
                        this.logger.info(`Using system fallback voice: ${fallbackVoice} for language: ${this.config.fallbackLanguage}`);
                    }
                }
            }

            // Priority 2: Use configured default voice if language detection is disabled or failed
            if (!selectedVoice && this.config.defaultVoice) {
                selectedVoice = this.config.defaultVoice;
                this._logDebug('SPEAK_STEP4', 'Using configured default voice (language detection disabled or failed)', { selectedVoice });
            }

            // Final fallback to hardcoded default if nothing else worked
            if (!selectedVoice || selectedVoice === 'undefined' || selectedVoice === 'null') {
                // Use fallback language voice as last resort from Google engine
                const fallbackVoice = GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage);
                selectedVoice = fallbackVoice || 'de-DE-Wavenet-B'; // Absolute hardcoded fallback (German male voice)
                this._logDebug('SPEAK_STEP4', 'Using absolute fallback voice', {
                    selectedVoice,
                    reason: 'no_voice_selected',
                    fallbackLanguage: this.config.fallbackLanguage
                });
                this.logger.warn(`No voice selected, using absolute fallback: ${selectedVoice}`);
            }

            // Validate engine availability and fallback to working engines
            if (selectedEngine === 'elevenlabs' && !this.engines.elevenlabs) {
                this._logDebug('SPEAK_STEP4', 'ElevenLabs engine not available, falling back', { hasUserAssignedVoice });
                this.logger.warn(`ElevenLabs TTS requested but not available (no API key configured)`);

                // Fallback to Speechify, Google, or OpenAI
                if (this.engines.speechify) {
                    selectedEngine = 'speechify';
                    const speechifyVoices = await this.engines.speechify.getVoices();
                    if (!selectedVoice || !speechifyVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, SpeechifyEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for Speechify fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for Speechify fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to Speechify engine`);
                } else if (this.engines.google) {
                    selectedEngine = 'google';
                    const googleVoices = GoogleEngine.getVoices();
                    if (!selectedVoice || !googleVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, GoogleEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for Google fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for Google fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to Google Cloud TTS engine`);
                } else if (this.engines.openai) {
                    selectedEngine = 'openai';
                    const openaiVoices = OpenAIEngine.getVoices();
                    if (!selectedVoice || !openaiVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, OpenAIEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for OpenAI fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for OpenAI fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to OpenAI TTS engine`);
                } else {
                    throw new Error(TTSPlugin.NO_ENGINES_ERROR);
                }
            }

            if (selectedEngine === 'speechify' && !this.engines.speechify) {
                this._logDebug('SPEAK_STEP4', 'Speechify engine not available, falling back', { hasUserAssignedVoice });
                this.logger.warn(`Speechify TTS requested but not available (no API key configured)`);

                // Fallback to ElevenLabs, Google, or OpenAI
                if (this.engines.elevenlabs) {
                    selectedEngine = 'elevenlabs';
                    const elevenlabsVoices = await this.engines.elevenlabs.getVoices();
                    if (!selectedVoice || !elevenlabsVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, ElevenLabsEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || ElevenLabsEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for ElevenLabs fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = ElevenLabsEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for ElevenLabs fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to ElevenLabs engine (premium quality)`);
                } else if (this.engines.google) {
                    selectedEngine = 'google';
                    const googleVoices = GoogleEngine.getVoices();
                    if (!selectedVoice || !googleVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, GoogleEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for Google fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = GoogleEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for Google fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to Google Cloud TTS engine`);
                } else if (this.engines.openai) {
                    selectedEngine = 'openai';
                    const openaiVoices = OpenAIEngine.getVoices();
                    if (!selectedVoice || !openaiVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, OpenAIEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for OpenAI fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for OpenAI fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to OpenAI TTS engine`);
                } else {
                    throw new Error(TTSPlugin.NO_ENGINES_ERROR);
                }
            }

            if (selectedEngine === 'google' && !this.engines.google) {
                this._logDebug('SPEAK_STEP4', 'Google engine not available, falling back', { hasUserAssignedVoice });
                this.logger.warn(`Google TTS requested but not available (no API key configured)`);
                
                // Fallback to ElevenLabs, Speechify, or OpenAI
                if (this.engines.elevenlabs) {
                    selectedEngine = 'elevenlabs';
                    const elevenlabsVoices = await this.engines.elevenlabs.getVoices();
                    if (!selectedVoice || !elevenlabsVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, ElevenLabsEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || ElevenLabsEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for ElevenLabs fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = ElevenLabsEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for ElevenLabs fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to ElevenLabs engine (premium quality)`);
                } else if (this.engines.speechify) {
                    selectedEngine = 'speechify';
                    const speechifyVoices = await this.engines.speechify.getVoices();
                    if (!selectedVoice || !speechifyVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, SpeechifyEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for Speechify fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = SpeechifyEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for Speechify fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to Speechify engine`);
                } else if (this.engines.openai) {
                    selectedEngine = 'openai';
                    const openaiVoices = OpenAIEngine.getVoices();
                    if (!selectedVoice || !openaiVoices[selectedVoice]) {
                        // Only use language detection if user doesn't have an assigned voice
                        if (!hasUserAssignedVoice) {
                            const langResult = this.languageDetector.detectAndGetVoice(finalText, OpenAIEngine, this.config.fallbackLanguage);
                            selectedVoice = langResult?.voiceId || OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected via language detection for OpenAI fallback', { selectedVoice, langResult });
                        } else {
                            // User had assigned voice - use engine's default for fallback language without overriding with text detection
                            selectedVoice = OpenAIEngine.getDefaultVoiceForLanguage(this.config.fallbackLanguage) || this.config.defaultVoice;
                            this._logDebug('SPEAK_STEP4', 'Voice selected for OpenAI fallback (preserving user assignment intent)', { selectedVoice, hasUserAssignedVoice });
                        }
                    }
                    this.logger.info(`Falling back to OpenAI TTS engine`);
                } else {
                    throw new Error(TTSPlugin.NO_ENGINES_ERROR);
                }
            }

            // Step 5: Generate TTS (no caching)
            this._logDebug('SPEAK_STEP5', 'Starting TTS synthesis', {
                engine: selectedEngine,
                voice: selectedVoice,
                textLength: finalText.length,
                speed: this.config.speed
            });

            const ttsEngine = this.engines[selectedEngine];
            if (!ttsEngine) {
                this._logDebug('SPEAK_ERROR', 'Engine not available', { selectedEngine });
                throw new Error(`TTS engine not available: ${selectedEngine}`);
            }

            let audioData;
            let fallbackAttempts = [];
            
            try {
                // Prepare synthesis options for Speechify
                const synthesisOptions = {};
                
                // Add language parameter for Speechify if engine is speechify
                if (selectedEngine === 'speechify' && this.config.autoLanguageDetection) {
                    // Detect language from text
                    const detectedLang = this.languageDetector.detectLanguage(finalText);
                    if (detectedLang && detectedLang.language) {
                        synthesisOptions.language = detectedLang.language;
                        this._logDebug('SPEAK_STEP5', 'Language detected for Speechify', { language: detectedLang.language, confidence: detectedLang.confidence });
                    }
                }
                
                // Add emotion parameter for Speechify
                if (selectedEngine === 'speechify') {
                    // Priority: user emotion > default emotion
                    const emotion = userSettings?.voice_emotion || this.config.defaultEmotion;
                    if (emotion) {
                        synthesisOptions.emotion = emotion;
                        this._logDebug('SPEAK_STEP5', 'Emotion set for Speechify', { emotion });
                    }
                }
                
                // Add emotion and prosody parameters for Fish.audio
                if (selectedEngine === 'fishaudio') {
                    // Priority: user emotion > default Fish.audio emotion
                    const emotion = userSettings?.voice_emotion || this.config.defaultFishaudioEmotion;
                    if (emotion && emotion !== 'neutral') {
                        synthesisOptions.emotion = emotion;
                        this._logDebug('SPEAK_STEP5', 'Emotion set for Fish.audio', { emotion });
                    }
                    
                    // Add Fish.audio-specific options
                    synthesisOptions.normalize = true; // Default to true for stability
                    synthesisOptions.latency = 'balanced'; // Use balanced latency for good responsiveness
                    synthesisOptions.chunk_length = 200; // Optimal chunk length
                    synthesisOptions.mp3_bitrate = 128; // Good quality-to-size ratio
                    
                    // Add pitch and volume if configured
                    if (this.config.defaultFishaudioPitch !== undefined && this.config.defaultFishaudioPitch !== 0) {
                        synthesisOptions.pitch = this.config.defaultFishaudioPitch;
                        this._logDebug('SPEAK_STEP5', 'Pitch set for Fish.audio', { pitch: this.config.defaultFishaudioPitch });
                    }
                    
                    if (this.config.defaultFishaudioVolume !== undefined && this.config.defaultFishaudioVolume !== 1.0) {
                        synthesisOptions.volume = this.config.defaultFishaudioVolume;
                        this._logDebug('SPEAK_STEP5', 'Volume set for Fish.audio', { volume: this.config.defaultFishaudioVolume });
                    }
                }
                
                audioData = await ttsEngine.synthesize(finalText, selectedVoice, this.config.speed, synthesisOptions);
                this._logDebug('SPEAK_STEP5', 'TTS synthesis successful', {
                    engine: selectedEngine,
                    voice: selectedVoice,
                    audioDataLength: audioData?.length || 0,
                    options: synthesisOptions
                });
            } catch (engineError) {
                // Check if auto-fallback is enabled
                if (!this.config.enableAutoFallback) {
                    this._logDebug('SPEAK_ERROR', 'TTS engine failed and auto-fallback is disabled', {
                        failedEngine: selectedEngine,
                        error: engineError.message
                    });
                    this.logger.error(`TTS engine ${selectedEngine} failed: ${engineError.message}. Auto-fallback is disabled. Please check your ${selectedEngine} configuration.`);
                    throw engineError;
                }

                // Track the primary failure
                fallbackAttempts.push({ engine: selectedEngine, error: engineError.message });

                // Fallback to alternative engine
                this._logDebug('SPEAK_STEP5', 'TTS engine failed, trying fallback', {
                    failedEngine: selectedEngine,
                    error: engineError.message
                });
                this.logger.error(`TTS engine ${selectedEngine} failed: ${engineError.message}, trying fallback`);

                // Improved fallback chain based on quality and reliability
                // Use predefined fallback chains for each engine
                const fallbackChain = this.fallbackChains[selectedEngine] || ['openai', 'elevenlabs', 'speechify', 'google'];
                
                // Try each fallback engine in order
                for (const fallbackEngine of fallbackChain) {
                    // Skip if this is the engine that already failed
                    if (fallbackEngine === selectedEngine) {
                        continue;
                    }
                    
                    // Skip if engine not available
                    if (!this.engines[fallbackEngine]) {
                        this._logDebug('FALLBACK', `Skipping ${fallbackEngine} - not available`);
                        continue;
                    }
                    
                    try {
                        this.logger.info(`Falling back from ${selectedEngine} to ${fallbackEngine}`);
                        
                        const result = await this._tryFallbackEngine(fallbackEngine, finalText, selectedVoice, hasUserAssignedVoice);
                        audioData = result.audioData;
                        selectedVoice = result.voice;
                        selectedEngine = fallbackEngine;
                        
                        this._logDebug('SPEAK_STEP5', 'Fallback synthesis successful', {
                            fallbackEngine,
                            fallbackVoice: selectedVoice,
                            audioDataLength: audioData?.length || 0
                        });
                        
                        // Success! Break out of fallback loop
                        break;
                        
                    } catch (fallbackError) {
                        // This fallback also failed, track it and continue to next
                        fallbackAttempts.push({ engine: fallbackEngine, error: fallbackError.message });
                        this.logger.warn(`Fallback engine ${fallbackEngine} also failed: ${fallbackError.message}`);
                        this._logDebug('FALLBACK', `${fallbackEngine} failed`, { error: fallbackError.message });
                    }
                }
                
                // If we still don't have audio data, all engines failed
                if (!audioData) {
                    const failureReport = fallbackAttempts.map(a => `${a.engine}: ${a.error}`).join('; ');
                    this._logDebug('SPEAK_ERROR', 'All engines failed', { attempts: fallbackAttempts });
                    this.logger.error('All TTS engines failed. Attempts: ' + failureReport);
                    throw new Error(`All TTS engines failed. Primary: ${engineError.message}. Fallbacks: ${failureReport}`);
                }
            }

            // Validate audioData
            if (!audioData || audioData.length === 0) {
                this._logDebug('SPEAK_ERROR', 'Empty audio data returned', {
                    engine: selectedEngine,
                    audioData: audioData
                });
                throw new Error('Engine returned empty audio data');
            }

            // Step 6: Enqueue for playback
            this._logDebug('SPEAK_STEP6', 'Enqueueing for playback', {
                username,
                textLength: finalText.length,
                voice: selectedVoice,
                engine: selectedEngine,
                volume: this.config.volume * (userSettings?.volume_gain ?? 1.0),
                speed: this.config.speed,
                source,
                priority
            });

            const queueResult = this.queueManager.enqueue({
                userId,
                username,
                text: finalText,
                voice: selectedVoice,
                engine: selectedEngine,
                audioData,
                volume: this.config.volume * (userSettings?.volume_gain ?? 1.0),
                speed: this.config.speed,
                source,
                teamLevel,
                isSubscriber,
                priority,
                hasAssignedVoice: hasUserAssignedVoice === true
            });

            this._logDebug('SPEAK_STEP6', 'Enqueue result', queueResult);

            if (!queueResult.success) {
                this._logDebug('SPEAK_DENIED', 'Queue rejected item', {
                    reason: queueResult.reason,
                    details: queueResult
                });
                return {
                    success: false,
                    error: queueResult.reason,
                    details: queueResult
                };
            }

            // Emit queue update event
            this.api.emit('tts:queued', {
                username,
                text: finalText,
                voice: selectedVoice,
                engine: selectedEngine,
                position: queueResult.position,
                queueSize: queueResult.queueSize
            });

            this._logDebug('SPEAK_SUCCESS', 'TTS queued successfully', {
                position: queueResult.position,
                queueSize: queueResult.queueSize,
                estimatedWaitMs: queueResult.estimatedWaitMs
            });

            return {
                success: true,
                queued: true,
                position: queueResult.position,
                queueSize: queueResult.queueSize,
                estimatedWaitMs: queueResult.estimatedWaitMs,
                voice: selectedVoice,
                engine: selectedEngine,
                cached: false
            };

        } catch (error) {
            this._logDebug('SPEAK_ERROR', 'Speak method error', {
                error: error.message,
                stack: error.stack
            });
            this.logger.error(`TTS speak error: ${error.message}`);
            return {
                success: false,
                error: 'synthesis_failed',
                message: error.message
            };
        }
    }

    /**
     * Play audio (called by queue processor)
     */
    async _playAudio(item) {
        try {
            this._logDebug('PLAYBACK', 'Starting playback', {
                id: item.id,
                username: item.username,
                text: item.text?.substring(0, 50),
                voice: item.voice,
                engine: item.engine,
                volume: item.volume,
                speed: item.speed
            });

            const playbackMeta = {
                id: item.id,
                userId: item.userId,
                username: item.username,
                text: item.text,
                voice: item.voice,
                engine: item.engine,
                hasAssignedVoice: item.hasAssignedVoice === true
            };

            // Emit playback start event
            this.api.emit('tts:playback:started', {
                id: item.id,
                username: item.username,
                text: item.text
            });

            // Send audio to clients for playback
            this.api.emit('tts:play', {
                id: item.id,
                username: item.username,
                text: item.text,
                voice: item.voice,
                engine: item.engine,
                audioData: item.audioData,
                volume: item.volume,
                speed: item.speed,
                duckOther: this.config.duckOtherAudio,
                duckVolume: this.config.duckVolume
            });

            this._logDebug('PLAYBACK', 'Audio event emitted to clients', {
                id: item.id,
                event: 'tts:play',
                audioDataLength: item.audioData?.length || 0
            });

            // Estimate playback duration based on realistic speech rate
            // Average speaking rate: ~150 words/min = ~2.5 words/sec = ~12.5 chars/sec
            // Formula: chars * 100ms + buffer (accounting for pauses, pacing, etc.)
            const baseDelay = Math.ceil(item.text.length * 100); // 100ms per character
            const speedAdjustment = item.speed ? (1 / item.speed) : 1; // Adjust for speed
            const buffer = 2000; // 2 second buffer for network latency and startup
            const estimatedDuration = Math.ceil(baseDelay * speedAdjustment) + buffer;
            playbackMeta.duration = estimatedDuration;

            if (this.api.pluginLoader && typeof this.api.pluginLoader.emit === 'function') {
                try {
                    this.api.pluginLoader.emit('tts:playback:started', playbackMeta);
                } catch (error) {
                    this.logger.warn(`TTS: Failed to broadcast playback start to plugins: ${error.message}`);
                }
            }

            this._logDebug('PLAYBACK', 'Waiting for playback to complete', {
                estimatedDuration,
                textLength: item.text.length,
                speed: item.speed,
                calculation: `${item.text.length} chars * 100ms * ${speedAdjustment.toFixed(2)} + ${buffer}ms = ${estimatedDuration}ms`
            });

            // Wait for playback to complete
            await new Promise(resolve => setTimeout(resolve, estimatedDuration));

            // Emit playback end event
            this.api.emit('tts:playback:ended', {
                id: item.id,
                username: item.username
            });

            if (this.api.pluginLoader && typeof this.api.pluginLoader.emit === 'function') {
                try {
                    this.api.pluginLoader.emit('tts:playback:ended', {
                        id: item.id,
                        userId: item.userId,
                        username: item.username
                    });
                } catch (error) {
                    this.logger.warn(`TTS: Failed to broadcast playback end to plugins: ${error.message}`);
                }
            }

            this._logDebug('PLAYBACK', 'Playback completed', { id: item.id });

        } catch (error) {
            this._logDebug('PLAYBACK', 'Playback error', {
                id: item.id,
                error: error.message,
                stack: error.stack
            });
            this.logger.error(`TTS playback error: ${error.message}`);
            this.api.emit('tts:playback:error', {
                id: item.id,
                error: error.message
            });
        }
    }

    /**
     * Plugin cleanup
     */
    async destroy() {
        try {
            // Stop queue processing
            this.queueManager.stopProcessing();

            // Clear debug logs to free memory
            this.debugLogs = [];

            // Clear caches in utilities
            if (this.permissionManager) {
                this.permissionManager.clearCache();
            }

            this.logger.info('TTS Plugin destroyed and resources cleaned up');
        } catch (error) {
            this.logger.error(`TTS Plugin destroy error: ${error.message}`);
        }
    }
}

module.exports = TTSPlugin;
