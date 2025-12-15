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
        this.voicesUrl = 'https://texttospeech.googleapis.com/v1/voices';
        
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
        
        // Dynamic voice cache
        this.dynamicVoices = null;
        this.voicesCacheTimestamp = null;
        this.voicesCacheTTL = 24 * 60 * 60 * 1000; // 24 hours
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
            'pt-BR-Wavenet-C': { name: 'Português BR (Wavenet C)', lang: 'pt', gender: 'female', style: 'wavenet' },
            'pt-BR-Neural2-A': { name: 'Português BR (Neural2 A)', lang: 'pt', gender: 'female', style: 'neural2' },
            'pt-BR-Neural2-B': { name: 'Português BR (Neural2 B)', lang: 'pt', gender: 'male', style: 'neural2' },
            'pt-BR-Neural2-C': { name: 'Português BR (Neural2 C)', lang: 'pt', gender: 'female', style: 'neural2' },
            'pt-BR-Standard-A': { name: 'Português BR (Standard A)', lang: 'pt', gender: 'female', style: 'standard' },
            'pt-BR-Standard-B': { name: 'Português BR (Standard B)', lang: 'pt', gender: 'male', style: 'standard' },
            'pt-BR-Standard-C': { name: 'Português BR (Standard C)', lang: 'pt', gender: 'female', style: 'standard' },

            // Portuguese (PT)
            'pt-PT-Wavenet-A': { name: 'Português PT (Wavenet A)', lang: 'pt', gender: 'female', style: 'wavenet' },
            'pt-PT-Wavenet-B': { name: 'Português PT (Wavenet B)', lang: 'pt', gender: 'male', style: 'wavenet' },
            'pt-PT-Wavenet-C': { name: 'Português PT (Wavenet C)', lang: 'pt', gender: 'male', style: 'wavenet' },
            'pt-PT-Wavenet-D': { name: 'Português PT (Wavenet D)', lang: 'pt', gender: 'female', style: 'wavenet' },

            // Dutch
            'nl-NL-Wavenet-A': { name: 'Nederlands (Wavenet A)', lang: 'nl', gender: 'female', style: 'wavenet' },
            'nl-NL-Wavenet-B': { name: 'Nederlands (Wavenet B)', lang: 'nl', gender: 'male', style: 'wavenet' },
            'nl-NL-Wavenet-C': { name: 'Nederlands (Wavenet C)', lang: 'nl', gender: 'male', style: 'wavenet' },
            'nl-NL-Wavenet-D': { name: 'Nederlands (Wavenet D)', lang: 'nl', gender: 'female', style: 'wavenet' },
            'nl-NL-Wavenet-E': { name: 'Nederlands (Wavenet E)', lang: 'nl', gender: 'female', style: 'wavenet' },
            'nl-NL-Standard-A': { name: 'Nederlands (Standard A)', lang: 'nl', gender: 'female', style: 'standard' },

            // Polish
            'pl-PL-Wavenet-A': { name: 'Polski (Wavenet A)', lang: 'pl', gender: 'female', style: 'wavenet' },
            'pl-PL-Wavenet-B': { name: 'Polski (Wavenet B)', lang: 'pl', gender: 'male', style: 'wavenet' },
            'pl-PL-Wavenet-C': { name: 'Polski (Wavenet C)', lang: 'pl', gender: 'male', style: 'wavenet' },
            'pl-PL-Wavenet-D': { name: 'Polski (Wavenet D)', lang: 'pl', gender: 'female', style: 'wavenet' },
            'pl-PL-Wavenet-E': { name: 'Polski (Wavenet E)', lang: 'pl', gender: 'female', style: 'wavenet' },
            'pl-PL-Standard-A': { name: 'Polski (Standard A)', lang: 'pl', gender: 'female', style: 'standard' },

            // Russian
            'ru-RU-Wavenet-A': { name: 'Русский (Wavenet A)', lang: 'ru', gender: 'female', style: 'wavenet' },
            'ru-RU-Wavenet-B': { name: 'Русский (Wavenet B)', lang: 'ru', gender: 'male', style: 'wavenet' },
            'ru-RU-Wavenet-C': { name: 'Русский (Wavenet C)', lang: 'ru', gender: 'female', style: 'wavenet' },
            'ru-RU-Wavenet-D': { name: 'Русский (Wavenet D)', lang: 'ru', gender: 'male', style: 'wavenet' },
            'ru-RU-Wavenet-E': { name: 'Русский (Wavenet E)', lang: 'ru', gender: 'female', style: 'wavenet' },
            'ru-RU-Standard-A': { name: 'Русский (Standard A)', lang: 'ru', gender: 'female', style: 'standard' },

            // Chinese (Mandarin)
            'cmn-CN-Wavenet-A': { name: '中文 (Wavenet A)', lang: 'zh', gender: 'female', style: 'wavenet' },
            'cmn-CN-Wavenet-B': { name: '中文 (Wavenet B)', lang: 'zh', gender: 'male', style: 'wavenet' },
            'cmn-CN-Wavenet-C': { name: '中文 (Wavenet C)', lang: 'zh', gender: 'male', style: 'wavenet' },
            'cmn-CN-Wavenet-D': { name: '中文 (Wavenet D)', lang: 'zh', gender: 'female', style: 'wavenet' },
            'cmn-CN-Standard-A': { name: '中文 (Standard A)', lang: 'zh', gender: 'female', style: 'standard' },

            // Hindi
            'hi-IN-Wavenet-A': { name: 'हिन्दी (Wavenet A)', lang: 'hi', gender: 'female', style: 'wavenet' },
            'hi-IN-Wavenet-B': { name: 'हिन्दी (Wavenet B)', lang: 'hi', gender: 'male', style: 'wavenet' },
            'hi-IN-Wavenet-C': { name: 'हिन्दी (Wavenet C)', lang: 'hi', gender: 'male', style: 'wavenet' },
            'hi-IN-Wavenet-D': { name: 'हिन्दी (Wavenet D)', lang: 'hi', gender: 'female', style: 'wavenet' },
            'hi-IN-Neural2-A': { name: 'हिन्दी (Neural2 A)', lang: 'hi', gender: 'female', style: 'neural2' },
            'hi-IN-Neural2-B': { name: 'हिन्दी (Neural2 B)', lang: 'hi', gender: 'male', style: 'neural2' },
            'hi-IN-Neural2-C': { name: 'हिन्दी (Neural2 C)', lang: 'hi', gender: 'male', style: 'neural2' },
            'hi-IN-Neural2-D': { name: 'हिन्दी (Neural2 D)', lang: 'hi', gender: 'female', style: 'neural2' },

            // Arabic
            'ar-XA-Wavenet-A': { name: 'العربية (Wavenet A)', lang: 'ar', gender: 'female', style: 'wavenet' },
            'ar-XA-Wavenet-B': { name: 'العربية (Wavenet B)', lang: 'ar', gender: 'male', style: 'wavenet' },
            'ar-XA-Wavenet-C': { name: 'العربية (Wavenet C)', lang: 'ar', gender: 'male', style: 'wavenet' },
            'ar-XA-Wavenet-D': { name: 'العربية (Wavenet D)', lang: 'ar', gender: 'female', style: 'wavenet' },
            'ar-XA-Standard-A': { name: 'العربية (Standard A)', lang: 'ar', gender: 'female', style: 'standard' },

            // Turkish
            'tr-TR-Wavenet-A': { name: 'Türkçe (Wavenet A)', lang: 'tr', gender: 'female', style: 'wavenet' },
            'tr-TR-Wavenet-B': { name: 'Türkçe (Wavenet B)', lang: 'tr', gender: 'male', style: 'wavenet' },
            'tr-TR-Wavenet-C': { name: 'Türkçe (Wavenet C)', lang: 'tr', gender: 'female', style: 'wavenet' },
            'tr-TR-Wavenet-D': { name: 'Türkçe (Wavenet D)', lang: 'tr', gender: 'female', style: 'wavenet' },
            'tr-TR-Wavenet-E': { name: 'Türkçe (Wavenet E)', lang: 'tr', gender: 'male', style: 'wavenet' },
            'tr-TR-Standard-A': { name: 'Türkçe (Standard A)', lang: 'tr', gender: 'female', style: 'standard' },

            // Indonesian
            'id-ID-Wavenet-A': { name: 'Bahasa Indonesia (Wavenet A)', lang: 'id', gender: 'female', style: 'wavenet' },
            'id-ID-Wavenet-B': { name: 'Bahasa Indonesia (Wavenet B)', lang: 'id', gender: 'male', style: 'wavenet' },
            'id-ID-Wavenet-C': { name: 'Bahasa Indonesia (Wavenet C)', lang: 'id', gender: 'male', style: 'wavenet' },
            'id-ID-Wavenet-D': { name: 'Bahasa Indonesia (Wavenet D)', lang: 'id', gender: 'female', style: 'wavenet' },

            // Thai
            'th-TH-Neural2-C': { name: 'ภาษาไทย (Neural2 C)', lang: 'th', gender: 'female', style: 'neural2' },
            'th-TH-Standard-A': { name: 'ภาษาไทย (Standard A)', lang: 'th', gender: 'female', style: 'standard' },

            // Vietnamese
            'vi-VN-Wavenet-A': { name: 'Tiếng Việt (Wavenet A)', lang: 'vi', gender: 'female', style: 'wavenet' },
            'vi-VN-Wavenet-B': { name: 'Tiếng Việt (Wavenet B)', lang: 'vi', gender: 'male', style: 'wavenet' },
            'vi-VN-Wavenet-C': { name: 'Tiếng Việt (Wavenet C)', lang: 'vi', gender: 'female', style: 'wavenet' },
            'vi-VN-Wavenet-D': { name: 'Tiếng Việt (Wavenet D)', lang: 'vi', gender: 'male', style: 'wavenet' },
            'vi-VN-Neural2-A': { name: 'Tiếng Việt (Neural2 A)', lang: 'vi', gender: 'female', style: 'neural2' },
            'vi-VN-Neural2-D': { name: 'Tiếng Việt (Neural2 D)', lang: 'vi', gender: 'male', style: 'neural2' },

            // English (India)
            'en-IN-Wavenet-A': { name: 'English IN (Wavenet A)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-IN-Wavenet-B': { name: 'English IN (Wavenet B)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-IN-Wavenet-C': { name: 'English IN (Wavenet C)', lang: 'en', gender: 'male', style: 'wavenet' },
            'en-IN-Wavenet-D': { name: 'English IN (Wavenet D)', lang: 'en', gender: 'female', style: 'wavenet' },
            'en-IN-Neural2-A': { name: 'English IN (Neural2 A)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-IN-Neural2-B': { name: 'English IN (Neural2 B)', lang: 'en', gender: 'male', style: 'neural2' },
            'en-IN-Neural2-C': { name: 'English IN (Neural2 C)', lang: 'en', gender: 'male', style: 'neural2' },
            'en-IN-Neural2-D': { name: 'English IN (Neural2 D)', lang: 'en', gender: 'female', style: 'neural2' },

            // Spanish (US)
            'es-US-Wavenet-A': { name: 'Español US (Wavenet A)', lang: 'es', gender: 'female', style: 'wavenet' },
            'es-US-Wavenet-B': { name: 'Español US (Wavenet B)', lang: 'es', gender: 'male', style: 'wavenet' },
            'es-US-Wavenet-C': { name: 'Español US (Wavenet C)', lang: 'es', gender: 'male', style: 'wavenet' },
            'es-US-Neural2-A': { name: 'Español US (Neural2 A)', lang: 'es', gender: 'female', style: 'neural2' },
            'es-US-Neural2-B': { name: 'Español US (Neural2 B)', lang: 'es', gender: 'male', style: 'neural2' },
            'es-US-Neural2-C': { name: 'Español US (Neural2 C)', lang: 'es', gender: 'male', style: 'neural2' },
            'es-US-Studio-B': { name: 'Español US (Studio B)', lang: 'es', gender: 'male', style: 'studio' },
            'es-US-News-D': { name: 'Español US (News D)', lang: 'es', gender: 'male', style: 'news' },
            'es-US-News-E': { name: 'Español US (News E)', lang: 'es', gender: 'male', style: 'news' },
            'es-US-News-F': { name: 'Español US (News F)', lang: 'es', gender: 'female', style: 'news' },
            'es-US-News-G': { name: 'Español US (News G)', lang: 'es', gender: 'female', style: 'news' },

            // Spanish (ES) - Additional voices
            'es-ES-Wavenet-C': { name: 'Español ES (Wavenet C)', lang: 'es', gender: 'female', style: 'wavenet' },
            'es-ES-Wavenet-D': { name: 'Español ES (Wavenet D)', lang: 'es', gender: 'female', style: 'wavenet' },
            'es-ES-Neural2-B': { name: 'Español ES (Neural2 B)', lang: 'es', gender: 'male', style: 'neural2' },
            'es-ES-Neural2-C': { name: 'Español ES (Neural2 C)', lang: 'es', gender: 'female', style: 'neural2' },
            'es-ES-Neural2-D': { name: 'Español ES (Neural2 D)', lang: 'es', gender: 'female', style: 'neural2' },
            'es-ES-Neural2-E': { name: 'Español ES (Neural2 E)', lang: 'es', gender: 'female', style: 'neural2' },
            'es-ES-Neural2-F': { name: 'Español ES (Neural2 F)', lang: 'es', gender: 'male', style: 'neural2' },
            'es-ES-Polyglot-1': { name: 'Español ES (Polyglot 1)', lang: 'es', gender: 'male', style: 'polyglot' },

            // French - Additional voices
            'fr-FR-Wavenet-E': { name: 'Français (Wavenet E)', lang: 'fr', gender: 'female', style: 'wavenet' },
            'fr-FR-Neural2-B': { name: 'Français (Neural2 B)', lang: 'fr', gender: 'male', style: 'neural2' },
            'fr-FR-Neural2-C': { name: 'Français (Neural2 C)', lang: 'fr', gender: 'female', style: 'neural2' },
            'fr-FR-Neural2-D': { name: 'Français (Neural2 D)', lang: 'fr', gender: 'male', style: 'neural2' },
            'fr-FR-Neural2-E': { name: 'Français (Neural2 E)', lang: 'fr', gender: 'female', style: 'neural2' },
            'fr-FR-Studio-A': { name: 'Français (Studio A)', lang: 'fr', gender: 'female', style: 'studio' },
            'fr-FR-Studio-D': { name: 'Français (Studio D)', lang: 'fr', gender: 'male', style: 'studio' },
            'fr-FR-Polyglot-1': { name: 'Français (Polyglot 1)', lang: 'fr', gender: 'male', style: 'polyglot' },

            // German - Additional voices
            'de-DE-Neural2-C': { name: 'Deutsch (Neural2 C)', lang: 'de', gender: 'female', style: 'neural2' },
            'de-DE-Neural2-D': { name: 'Deutsch (Neural2 D)', lang: 'de', gender: 'male', style: 'neural2' },
            'de-DE-Neural2-F': { name: 'Deutsch (Neural2 F)', lang: 'de', gender: 'female', style: 'neural2' },
            'de-DE-Studio-B': { name: 'Deutsch (Studio B)', lang: 'de', gender: 'male', style: 'studio' },
            'de-DE-Studio-C': { name: 'Deutsch (Studio C)', lang: 'de', gender: 'female', style: 'studio' },
            'de-DE-Polyglot-1': { name: 'Deutsch (Polyglot 1)', lang: 'de', gender: 'male', style: 'polyglot' },

            // English (GB) - Additional voices
            'en-GB-Neural2-C': { name: 'English GB (Neural2 C)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-GB-Neural2-D': { name: 'English GB (Neural2 D)', lang: 'en', gender: 'male', style: 'neural2' },
            'en-GB-Neural2-F': { name: 'English GB (Neural2 F)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-GB-Studio-B': { name: 'English GB (Studio B)', lang: 'en', gender: 'male', style: 'studio' },
            'en-GB-Studio-C': { name: 'English GB (Studio C)', lang: 'en', gender: 'female', style: 'studio' },
            'en-GB-News-G': { name: 'English GB (News G)', lang: 'en', gender: 'female', style: 'news' },
            'en-GB-News-H': { name: 'English GB (News H)', lang: 'en', gender: 'female', style: 'news' },
            'en-GB-News-I': { name: 'English GB (News I)', lang: 'en', gender: 'female', style: 'news' },
            'en-GB-News-J': { name: 'English GB (News J)', lang: 'en', gender: 'male', style: 'news' },
            'en-GB-News-K': { name: 'English GB (News K)', lang: 'en', gender: 'male', style: 'news' },
            'en-GB-News-L': { name: 'English GB (News L)', lang: 'en', gender: 'male', style: 'news' },
            'en-GB-News-M': { name: 'English GB (News M)', lang: 'en', gender: 'male', style: 'news' },

            // English (US) - Additional voices
            'en-US-Studio-M': { name: 'English US (Studio M)', lang: 'en', gender: 'male', style: 'studio' },
            'en-US-Studio-O': { name: 'English US (Studio O)', lang: 'en', gender: 'female', style: 'studio' },
            'en-US-Studio-Q': { name: 'English US (Studio Q)', lang: 'en', gender: 'neutral', style: 'studio' },
            'en-US-News-K': { name: 'English US (News K)', lang: 'en', gender: 'female', style: 'news' },
            'en-US-News-L': { name: 'English US (News L)', lang: 'en', gender: 'female', style: 'news' },
            'en-US-News-N': { name: 'English US (News N)', lang: 'en', gender: 'male', style: 'news' },

            // English (AU) - Additional voices
            'en-AU-Neural2-C': { name: 'English AU (Neural2 C)', lang: 'en', gender: 'female', style: 'neural2' },
            'en-AU-Neural2-D': { name: 'English AU (Neural2 D)', lang: 'en', gender: 'male', style: 'neural2' },

            // Italian - Additional voices
            'it-IT-Neural2-A': { name: 'Italiano (Neural2 A)', lang: 'it', gender: 'female', style: 'neural2' },
            'it-IT-Neural2-C': { name: 'Italiano (Neural2 C)', lang: 'it', gender: 'male', style: 'neural2' },

            // Japanese - Additional voices
            'ja-JP-Neural2-D': { name: '日本語 (Neural2 D)', lang: 'ja', gender: 'male', style: 'neural2' },

            // Korean - Additional voices
            'ko-KR-Neural2-A': { name: '한국어 (Neural2 A)', lang: 'ko', gender: 'female', style: 'neural2' },
            'ko-KR-Neural2-B': { name: '한국어 (Neural2 B)', lang: 'ko', gender: 'female', style: 'neural2' },
            'ko-KR-Neural2-C': { name: '한국어 (Neural2 C)', lang: 'ko', gender: 'male', style: 'neural2' },

            // Chirp3-HD Voices - Premium, high-definition voices with emotional expressiveness
            // German (de-DE)
            'de-DE-Chirp3-HD-F1': { name: 'Deutsch (Chirp3 HD F1)', lang: 'de', gender: 'female', style: 'chirp3' },
            'de-DE-Chirp3-HD-F2': { name: 'Deutsch (Chirp3 HD F2)', lang: 'de', gender: 'female', style: 'chirp3' },
            'de-DE-Chirp3-HD-F3': { name: 'Deutsch (Chirp3 HD F3)', lang: 'de', gender: 'female', style: 'chirp3' },
            'de-DE-Chirp3-HD-F4': { name: 'Deutsch (Chirp3 HD F4)', lang: 'de', gender: 'female', style: 'chirp3' },
            'de-DE-Chirp3-HD-M1': { name: 'Deutsch (Chirp3 HD M1)', lang: 'de', gender: 'male', style: 'chirp3' },
            'de-DE-Chirp3-HD-M2': { name: 'Deutsch (Chirp3 HD M2)', lang: 'de', gender: 'male', style: 'chirp3' },
            'de-DE-Chirp3-HD-M3': { name: 'Deutsch (Chirp3 HD M3)', lang: 'de', gender: 'male', style: 'chirp3' },
            'de-DE-Chirp3-HD-M4': { name: 'Deutsch (Chirp3 HD M4)', lang: 'de', gender: 'male', style: 'chirp3' },

            // English (US)
            'en-US-Chirp3-HD-F1': { name: 'English US (Chirp3 HD F1)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-US-Chirp3-HD-F2': { name: 'English US (Chirp3 HD F2)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-US-Chirp3-HD-F3': { name: 'English US (Chirp3 HD F3)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-US-Chirp3-HD-F4': { name: 'English US (Chirp3 HD F4)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-US-Chirp3-HD-M1': { name: 'English US (Chirp3 HD M1)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-US-Chirp3-HD-M2': { name: 'English US (Chirp3 HD M2)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-US-Chirp3-HD-M3': { name: 'English US (Chirp3 HD M3)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-US-Chirp3-HD-M4': { name: 'English US (Chirp3 HD M4)', lang: 'en', gender: 'male', style: 'chirp3' },

            // English (GB)
            'en-GB-Chirp3-HD-F1': { name: 'English GB (Chirp3 HD F1)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-GB-Chirp3-HD-F2': { name: 'English GB (Chirp3 HD F2)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-GB-Chirp3-HD-F3': { name: 'English GB (Chirp3 HD F3)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-GB-Chirp3-HD-F4': { name: 'English GB (Chirp3 HD F4)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-GB-Chirp3-HD-M1': { name: 'English GB (Chirp3 HD M1)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-GB-Chirp3-HD-M2': { name: 'English GB (Chirp3 HD M2)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-GB-Chirp3-HD-M3': { name: 'English GB (Chirp3 HD M3)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-GB-Chirp3-HD-M4': { name: 'English GB (Chirp3 HD M4)', lang: 'en', gender: 'male', style: 'chirp3' },

            // English (AU)
            'en-AU-Chirp3-HD-F1': { name: 'English AU (Chirp3 HD F1)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-AU-Chirp3-HD-F2': { name: 'English AU (Chirp3 HD F2)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-AU-Chirp3-HD-F3': { name: 'English AU (Chirp3 HD F3)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-AU-Chirp3-HD-F4': { name: 'English AU (Chirp3 HD F4)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-AU-Chirp3-HD-M1': { name: 'English AU (Chirp3 HD M1)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-AU-Chirp3-HD-M2': { name: 'English AU (Chirp3 HD M2)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-AU-Chirp3-HD-M3': { name: 'English AU (Chirp3 HD M3)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-AU-Chirp3-HD-M4': { name: 'English AU (Chirp3 HD M4)', lang: 'en', gender: 'male', style: 'chirp3' },

            // Spanish (ES)
            'es-ES-Chirp3-HD-F1': { name: 'Español ES (Chirp3 HD F1)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-ES-Chirp3-HD-F2': { name: 'Español ES (Chirp3 HD F2)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-ES-Chirp3-HD-F3': { name: 'Español ES (Chirp3 HD F3)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-ES-Chirp3-HD-F4': { name: 'Español ES (Chirp3 HD F4)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-ES-Chirp3-HD-M1': { name: 'Español ES (Chirp3 HD M1)', lang: 'es', gender: 'male', style: 'chirp3' },
            'es-ES-Chirp3-HD-M2': { name: 'Español ES (Chirp3 HD M2)', lang: 'es', gender: 'male', style: 'chirp3' },
            'es-ES-Chirp3-HD-M3': { name: 'Español ES (Chirp3 HD M3)', lang: 'es', gender: 'male', style: 'chirp3' },
            'es-ES-Chirp3-HD-M4': { name: 'Español ES (Chirp3 HD M4)', lang: 'es', gender: 'male', style: 'chirp3' },

            // French (FR)
            'fr-FR-Chirp3-HD-F1': { name: 'Français (Chirp3 HD F1)', lang: 'fr', gender: 'female', style: 'chirp3' },
            'fr-FR-Chirp3-HD-F2': { name: 'Français (Chirp3 HD F2)', lang: 'fr', gender: 'female', style: 'chirp3' },
            'fr-FR-Chirp3-HD-F3': { name: 'Français (Chirp3 HD F3)', lang: 'fr', gender: 'female', style: 'chirp3' },
            'fr-FR-Chirp3-HD-F4': { name: 'Français (Chirp3 HD F4)', lang: 'fr', gender: 'female', style: 'chirp3' },
            'fr-FR-Chirp3-HD-M1': { name: 'Français (Chirp3 HD M1)', lang: 'fr', gender: 'male', style: 'chirp3' },
            'fr-FR-Chirp3-HD-M2': { name: 'Français (Chirp3 HD M2)', lang: 'fr', gender: 'male', style: 'chirp3' },
            'fr-FR-Chirp3-HD-M3': { name: 'Français (Chirp3 HD M3)', lang: 'fr', gender: 'male', style: 'chirp3' },
            'fr-FR-Chirp3-HD-M4': { name: 'Français (Chirp3 HD M4)', lang: 'fr', gender: 'male', style: 'chirp3' },

            // Italian (IT)
            'it-IT-Chirp3-HD-F1': { name: 'Italiano (Chirp3 HD F1)', lang: 'it', gender: 'female', style: 'chirp3' },
            'it-IT-Chirp3-HD-F2': { name: 'Italiano (Chirp3 HD F2)', lang: 'it', gender: 'female', style: 'chirp3' },
            'it-IT-Chirp3-HD-F3': { name: 'Italiano (Chirp3 HD F3)', lang: 'it', gender: 'female', style: 'chirp3' },
            'it-IT-Chirp3-HD-F4': { name: 'Italiano (Chirp3 HD F4)', lang: 'it', gender: 'female', style: 'chirp3' },
            'it-IT-Chirp3-HD-M1': { name: 'Italiano (Chirp3 HD M1)', lang: 'it', gender: 'male', style: 'chirp3' },
            'it-IT-Chirp3-HD-M2': { name: 'Italiano (Chirp3 HD M2)', lang: 'it', gender: 'male', style: 'chirp3' },
            'it-IT-Chirp3-HD-M3': { name: 'Italiano (Chirp3 HD M3)', lang: 'it', gender: 'male', style: 'chirp3' },
            'it-IT-Chirp3-HD-M4': { name: 'Italiano (Chirp3 HD M4)', lang: 'it', gender: 'male', style: 'chirp3' },

            // Japanese (JP)
            'ja-JP-Chirp3-HD-F1': { name: '日本語 (Chirp3 HD F1)', lang: 'ja', gender: 'female', style: 'chirp3' },
            'ja-JP-Chirp3-HD-F2': { name: '日本語 (Chirp3 HD F2)', lang: 'ja', gender: 'female', style: 'chirp3' },
            'ja-JP-Chirp3-HD-F3': { name: '日本語 (Chirp3 HD F3)', lang: 'ja', gender: 'female', style: 'chirp3' },
            'ja-JP-Chirp3-HD-F4': { name: '日本語 (Chirp3 HD F4)', lang: 'ja', gender: 'female', style: 'chirp3' },
            'ja-JP-Chirp3-HD-M1': { name: '日本語 (Chirp3 HD M1)', lang: 'ja', gender: 'male', style: 'chirp3' },
            'ja-JP-Chirp3-HD-M2': { name: '日本語 (Chirp3 HD M2)', lang: 'ja', gender: 'male', style: 'chirp3' },
            'ja-JP-Chirp3-HD-M3': { name: '日本語 (Chirp3 HD M3)', lang: 'ja', gender: 'male', style: 'chirp3' },
            'ja-JP-Chirp3-HD-M4': { name: '日本語 (Chirp3 HD M4)', lang: 'ja', gender: 'male', style: 'chirp3' },

            // Korean (KR)
            'ko-KR-Chirp3-HD-F1': { name: '한국어 (Chirp3 HD F1)', lang: 'ko', gender: 'female', style: 'chirp3' },
            'ko-KR-Chirp3-HD-F2': { name: '한국어 (Chirp3 HD F2)', lang: 'ko', gender: 'female', style: 'chirp3' },
            'ko-KR-Chirp3-HD-F3': { name: '한국어 (Chirp3 HD F3)', lang: 'ko', gender: 'female', style: 'chirp3' },
            'ko-KR-Chirp3-HD-F4': { name: '한국어 (Chirp3 HD F4)', lang: 'ko', gender: 'female', style: 'chirp3' },
            'ko-KR-Chirp3-HD-M1': { name: '한국어 (Chirp3 HD M1)', lang: 'ko', gender: 'male', style: 'chirp3' },
            'ko-KR-Chirp3-HD-M2': { name: '한국어 (Chirp3 HD M2)', lang: 'ko', gender: 'male', style: 'chirp3' },
            'ko-KR-Chirp3-HD-M3': { name: '한국어 (Chirp3 HD M3)', lang: 'ko', gender: 'male', style: 'chirp3' },
            'ko-KR-Chirp3-HD-M4': { name: '한국어 (Chirp3 HD M4)', lang: 'ko', gender: 'male', style: 'chirp3' },

            // Portuguese (BR)
            'pt-BR-Chirp3-HD-F1': { name: 'Português BR (Chirp3 HD F1)', lang: 'pt', gender: 'female', style: 'chirp3' },
            'pt-BR-Chirp3-HD-F2': { name: 'Português BR (Chirp3 HD F2)', lang: 'pt', gender: 'female', style: 'chirp3' },
            'pt-BR-Chirp3-HD-F3': { name: 'Português BR (Chirp3 HD F3)', lang: 'pt', gender: 'female', style: 'chirp3' },
            'pt-BR-Chirp3-HD-F4': { name: 'Português BR (Chirp3 HD F4)', lang: 'pt', gender: 'female', style: 'chirp3' },
            'pt-BR-Chirp3-HD-M1': { name: 'Português BR (Chirp3 HD M1)', lang: 'pt', gender: 'male', style: 'chirp3' },
            'pt-BR-Chirp3-HD-M2': { name: 'Português BR (Chirp3 HD M2)', lang: 'pt', gender: 'male', style: 'chirp3' },
            'pt-BR-Chirp3-HD-M3': { name: 'Português BR (Chirp3 HD M3)', lang: 'pt', gender: 'male', style: 'chirp3' },
            'pt-BR-Chirp3-HD-M4': { name: 'Português BR (Chirp3 HD M4)', lang: 'pt', gender: 'male', style: 'chirp3' },

            // Dutch (NL)
            'nl-NL-Chirp3-HD-F1': { name: 'Nederlands (Chirp3 HD F1)', lang: 'nl', gender: 'female', style: 'chirp3' },
            'nl-NL-Chirp3-HD-F2': { name: 'Nederlands (Chirp3 HD F2)', lang: 'nl', gender: 'female', style: 'chirp3' },
            'nl-NL-Chirp3-HD-F3': { name: 'Nederlands (Chirp3 HD F3)', lang: 'nl', gender: 'female', style: 'chirp3' },
            'nl-NL-Chirp3-HD-F4': { name: 'Nederlands (Chirp3 HD F4)', lang: 'nl', gender: 'female', style: 'chirp3' },
            'nl-NL-Chirp3-HD-M1': { name: 'Nederlands (Chirp3 HD M1)', lang: 'nl', gender: 'male', style: 'chirp3' },
            'nl-NL-Chirp3-HD-M2': { name: 'Nederlands (Chirp3 HD M2)', lang: 'nl', gender: 'male', style: 'chirp3' },
            'nl-NL-Chirp3-HD-M3': { name: 'Nederlands (Chirp3 HD M3)', lang: 'nl', gender: 'male', style: 'chirp3' },
            'nl-NL-Chirp3-HD-M4': { name: 'Nederlands (Chirp3 HD M4)', lang: 'nl', gender: 'male', style: 'chirp3' },

            // Polish (PL)
            'pl-PL-Chirp3-HD-F1': { name: 'Polski (Chirp3 HD F1)', lang: 'pl', gender: 'female', style: 'chirp3' },
            'pl-PL-Chirp3-HD-F2': { name: 'Polski (Chirp3 HD F2)', lang: 'pl', gender: 'female', style: 'chirp3' },
            'pl-PL-Chirp3-HD-F3': { name: 'Polski (Chirp3 HD F3)', lang: 'pl', gender: 'female', style: 'chirp3' },
            'pl-PL-Chirp3-HD-F4': { name: 'Polski (Chirp3 HD F4)', lang: 'pl', gender: 'female', style: 'chirp3' },
            'pl-PL-Chirp3-HD-M1': { name: 'Polski (Chirp3 HD M1)', lang: 'pl', gender: 'male', style: 'chirp3' },
            'pl-PL-Chirp3-HD-M2': { name: 'Polski (Chirp3 HD M2)', lang: 'pl', gender: 'male', style: 'chirp3' },
            'pl-PL-Chirp3-HD-M3': { name: 'Polski (Chirp3 HD M3)', lang: 'pl', gender: 'male', style: 'chirp3' },
            'pl-PL-Chirp3-HD-M4': { name: 'Polski (Chirp3 HD M4)', lang: 'pl', gender: 'male', style: 'chirp3' },

            // Russian (RU)
            'ru-RU-Chirp3-HD-F1': { name: 'Русский (Chirp3 HD F1)', lang: 'ru', gender: 'female', style: 'chirp3' },
            'ru-RU-Chirp3-HD-F2': { name: 'Русский (Chirp3 HD F2)', lang: 'ru', gender: 'female', style: 'chirp3' },
            'ru-RU-Chirp3-HD-F3': { name: 'Русский (Chirp3 HD F3)', lang: 'ru', gender: 'female', style: 'chirp3' },
            'ru-RU-Chirp3-HD-F4': { name: 'Русский (Chirp3 HD F4)', lang: 'ru', gender: 'female', style: 'chirp3' },
            'ru-RU-Chirp3-HD-M1': { name: 'Русский (Chirp3 HD M1)', lang: 'ru', gender: 'male', style: 'chirp3' },
            'ru-RU-Chirp3-HD-M2': { name: 'Русский (Chirp3 HD M2)', lang: 'ru', gender: 'male', style: 'chirp3' },
            'ru-RU-Chirp3-HD-M3': { name: 'Русский (Chirp3 HD M3)', lang: 'ru', gender: 'male', style: 'chirp3' },
            'ru-RU-Chirp3-HD-M4': { name: 'Русский (Chirp3 HD M4)', lang: 'ru', gender: 'male', style: 'chirp3' },

            // Chinese (Mandarin, CN)
            'cmn-CN-Chirp3-HD-F1': { name: '中文 (Chirp3 HD F1)', lang: 'zh', gender: 'female', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-F2': { name: '中文 (Chirp3 HD F2)', lang: 'zh', gender: 'female', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-F3': { name: '中文 (Chirp3 HD F3)', lang: 'zh', gender: 'female', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-F4': { name: '中文 (Chirp3 HD F4)', lang: 'zh', gender: 'female', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-M1': { name: '中文 (Chirp3 HD M1)', lang: 'zh', gender: 'male', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-M2': { name: '中文 (Chirp3 HD M2)', lang: 'zh', gender: 'male', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-M3': { name: '中文 (Chirp3 HD M3)', lang: 'zh', gender: 'male', style: 'chirp3' },
            'cmn-CN-Chirp3-HD-M4': { name: '中文 (Chirp3 HD M4)', lang: 'zh', gender: 'male', style: 'chirp3' },

            // Hindi (IN)
            'hi-IN-Chirp3-HD-F1': { name: 'हिन्दी (Chirp3 HD F1)', lang: 'hi', gender: 'female', style: 'chirp3' },
            'hi-IN-Chirp3-HD-F2': { name: 'हिन्दी (Chirp3 HD F2)', lang: 'hi', gender: 'female', style: 'chirp3' },
            'hi-IN-Chirp3-HD-F3': { name: 'हिन्दी (Chirp3 HD F3)', lang: 'hi', gender: 'female', style: 'chirp3' },
            'hi-IN-Chirp3-HD-F4': { name: 'हिन्दी (Chirp3 HD F4)', lang: 'hi', gender: 'female', style: 'chirp3' },
            'hi-IN-Chirp3-HD-M1': { name: 'हिन्दी (Chirp3 HD M1)', lang: 'hi', gender: 'male', style: 'chirp3' },
            'hi-IN-Chirp3-HD-M2': { name: 'हिन्दी (Chirp3 HD M2)', lang: 'hi', gender: 'male', style: 'chirp3' },
            'hi-IN-Chirp3-HD-M3': { name: 'हिन्दी (Chirp3 HD M3)', lang: 'hi', gender: 'male', style: 'chirp3' },
            'hi-IN-Chirp3-HD-M4': { name: 'हिन्दी (Chirp3 HD M4)', lang: 'hi', gender: 'male', style: 'chirp3' },

            // Arabic (XA - multi-region)
            'ar-XA-Chirp3-HD-F1': { name: 'العربية (Chirp3 HD F1)', lang: 'ar', gender: 'female', style: 'chirp3' },
            'ar-XA-Chirp3-HD-F2': { name: 'العربية (Chirp3 HD F2)', lang: 'ar', gender: 'female', style: 'chirp3' },
            'ar-XA-Chirp3-HD-F3': { name: 'العربية (Chirp3 HD F3)', lang: 'ar', gender: 'female', style: 'chirp3' },
            'ar-XA-Chirp3-HD-F4': { name: 'العربية (Chirp3 HD F4)', lang: 'ar', gender: 'female', style: 'chirp3' },
            'ar-XA-Chirp3-HD-M1': { name: 'العربية (Chirp3 HD M1)', lang: 'ar', gender: 'male', style: 'chirp3' },
            'ar-XA-Chirp3-HD-M2': { name: 'العربية (Chirp3 HD M2)', lang: 'ar', gender: 'male', style: 'chirp3' },
            'ar-XA-Chirp3-HD-M3': { name: 'العربية (Chirp3 HD M3)', lang: 'ar', gender: 'male', style: 'chirp3' },
            'ar-XA-Chirp3-HD-M4': { name: 'العربية (Chirp3 HD M4)', lang: 'ar', gender: 'male', style: 'chirp3' },

            // Turkish (TR)
            'tr-TR-Chirp3-HD-F1': { name: 'Türkçe (Chirp3 HD F1)', lang: 'tr', gender: 'female', style: 'chirp3' },
            'tr-TR-Chirp3-HD-F2': { name: 'Türkçe (Chirp3 HD F2)', lang: 'tr', gender: 'female', style: 'chirp3' },
            'tr-TR-Chirp3-HD-F3': { name: 'Türkçe (Chirp3 HD F3)', lang: 'tr', gender: 'female', style: 'chirp3' },
            'tr-TR-Chirp3-HD-F4': { name: 'Türkçe (Chirp3 HD F4)', lang: 'tr', gender: 'female', style: 'chirp3' },
            'tr-TR-Chirp3-HD-M1': { name: 'Türkçe (Chirp3 HD M1)', lang: 'tr', gender: 'male', style: 'chirp3' },
            'tr-TR-Chirp3-HD-M2': { name: 'Türkçe (Chirp3 HD M2)', lang: 'tr', gender: 'male', style: 'chirp3' },
            'tr-TR-Chirp3-HD-M3': { name: 'Türkçe (Chirp3 HD M3)', lang: 'tr', gender: 'male', style: 'chirp3' },
            'tr-TR-Chirp3-HD-M4': { name: 'Türkçe (Chirp3 HD M4)', lang: 'tr', gender: 'male', style: 'chirp3' },

            // Indonesian (ID)
            'id-ID-Chirp3-HD-F1': { name: 'Bahasa Indonesia (Chirp3 HD F1)', lang: 'id', gender: 'female', style: 'chirp3' },
            'id-ID-Chirp3-HD-F2': { name: 'Bahasa Indonesia (Chirp3 HD F2)', lang: 'id', gender: 'female', style: 'chirp3' },
            'id-ID-Chirp3-HD-F3': { name: 'Bahasa Indonesia (Chirp3 HD F3)', lang: 'id', gender: 'female', style: 'chirp3' },
            'id-ID-Chirp3-HD-F4': { name: 'Bahasa Indonesia (Chirp3 HD F4)', lang: 'id', gender: 'female', style: 'chirp3' },
            'id-ID-Chirp3-HD-M1': { name: 'Bahasa Indonesia (Chirp3 HD M1)', lang: 'id', gender: 'male', style: 'chirp3' },
            'id-ID-Chirp3-HD-M2': { name: 'Bahasa Indonesia (Chirp3 HD M2)', lang: 'id', gender: 'male', style: 'chirp3' },
            'id-ID-Chirp3-HD-M3': { name: 'Bahasa Indonesia (Chirp3 HD M3)', lang: 'id', gender: 'male', style: 'chirp3' },
            'id-ID-Chirp3-HD-M4': { name: 'Bahasa Indonesia (Chirp3 HD M4)', lang: 'id', gender: 'male', style: 'chirp3' },

            // Thai (TH)
            'th-TH-Chirp3-HD-F1': { name: 'ภาษาไทย (Chirp3 HD F1)', lang: 'th', gender: 'female', style: 'chirp3' },
            'th-TH-Chirp3-HD-F2': { name: 'ภาษาไทย (Chirp3 HD F2)', lang: 'th', gender: 'female', style: 'chirp3' },
            'th-TH-Chirp3-HD-F3': { name: 'ภาษาไทย (Chirp3 HD F3)', lang: 'th', gender: 'female', style: 'chirp3' },
            'th-TH-Chirp3-HD-F4': { name: 'ภาษาไทย (Chirp3 HD F4)', lang: 'th', gender: 'female', style: 'chirp3' },
            'th-TH-Chirp3-HD-M1': { name: 'ภาษาไทย (Chirp3 HD M1)', lang: 'th', gender: 'male', style: 'chirp3' },
            'th-TH-Chirp3-HD-M2': { name: 'ภาษาไทย (Chirp3 HD M2)', lang: 'th', gender: 'male', style: 'chirp3' },
            'th-TH-Chirp3-HD-M3': { name: 'ภาษาไทย (Chirp3 HD M3)', lang: 'th', gender: 'male', style: 'chirp3' },
            'th-TH-Chirp3-HD-M4': { name: 'ภาษาไทย (Chirp3 HD M4)', lang: 'th', gender: 'male', style: 'chirp3' },

            // Vietnamese (VN)
            'vi-VN-Chirp3-HD-F1': { name: 'Tiếng Việt (Chirp3 HD F1)', lang: 'vi', gender: 'female', style: 'chirp3' },
            'vi-VN-Chirp3-HD-F2': { name: 'Tiếng Việt (Chirp3 HD F2)', lang: 'vi', gender: 'female', style: 'chirp3' },
            'vi-VN-Chirp3-HD-F3': { name: 'Tiếng Việt (Chirp3 HD F3)', lang: 'vi', gender: 'female', style: 'chirp3' },
            'vi-VN-Chirp3-HD-F4': { name: 'Tiếng Việt (Chirp3 HD F4)', lang: 'vi', gender: 'female', style: 'chirp3' },
            'vi-VN-Chirp3-HD-M1': { name: 'Tiếng Việt (Chirp3 HD M1)', lang: 'vi', gender: 'male', style: 'chirp3' },
            'vi-VN-Chirp3-HD-M2': { name: 'Tiếng Việt (Chirp3 HD M2)', lang: 'vi', gender: 'male', style: 'chirp3' },
            'vi-VN-Chirp3-HD-M3': { name: 'Tiếng Việt (Chirp3 HD M3)', lang: 'vi', gender: 'male', style: 'chirp3' },
            'vi-VN-Chirp3-HD-M4': { name: 'Tiếng Việt (Chirp3 HD M4)', lang: 'vi', gender: 'male', style: 'chirp3' },

            // English (India)
            'en-IN-Chirp3-HD-F1': { name: 'English IN (Chirp3 HD F1)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-IN-Chirp3-HD-F2': { name: 'English IN (Chirp3 HD F2)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-IN-Chirp3-HD-F3': { name: 'English IN (Chirp3 HD F3)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-IN-Chirp3-HD-F4': { name: 'English IN (Chirp3 HD F4)', lang: 'en', gender: 'female', style: 'chirp3' },
            'en-IN-Chirp3-HD-M1': { name: 'English IN (Chirp3 HD M1)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-IN-Chirp3-HD-M2': { name: 'English IN (Chirp3 HD M2)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-IN-Chirp3-HD-M3': { name: 'English IN (Chirp3 HD M3)', lang: 'en', gender: 'male', style: 'chirp3' },
            'en-IN-Chirp3-HD-M4': { name: 'English IN (Chirp3 HD M4)', lang: 'en', gender: 'male', style: 'chirp3' },

            // Spanish (US)
            'es-US-Chirp3-HD-F1': { name: 'Español US (Chirp3 HD F1)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-US-Chirp3-HD-F2': { name: 'Español US (Chirp3 HD F2)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-US-Chirp3-HD-F3': { name: 'Español US (Chirp3 HD F3)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-US-Chirp3-HD-F4': { name: 'Español US (Chirp3 HD F4)', lang: 'es', gender: 'female', style: 'chirp3' },
            'es-US-Chirp3-HD-M1': { name: 'Español US (Chirp3 HD M1)', lang: 'es', gender: 'male', style: 'chirp3' },
            'es-US-Chirp3-HD-M2': { name: 'Español US (Chirp3 HD M2)', lang: 'es', gender: 'male', style: 'chirp3' },
            'es-US-Chirp3-HD-M3': { name: 'Español US (Chirp3 HD M3)', lang: 'es', gender: 'male', style: 'chirp3' },
            'es-US-Chirp3-HD-M4': { name: 'Español US (Chirp3 HD M4)', lang: 'es', gender: 'male', style: 'chirp3' }
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
            'ko': 'ko-KR-Wavenet-A',
            'nl': 'nl-NL-Wavenet-A',
            'pl': 'pl-PL-Wavenet-A',
            'ru': 'ru-RU-Wavenet-A',
            'zh': 'cmn-CN-Wavenet-A',
            'hi': 'hi-IN-Wavenet-A',
            'ar': 'ar-XA-Wavenet-A',
            'tr': 'tr-TR-Wavenet-A',
            'id': 'id-ID-Wavenet-A',
            'th': 'th-TH-Neural2-C',
            'vi': 'vi-VN-Wavenet-A'
        };

        return languageDefaults[langCode] || 'en-US-Wavenet-C';
    }

    /**
     * Check if voice cache is still valid
     * @private
     * @returns {boolean} True if cache is valid and not expired
     */
    _isCacheValid() {
        if (!this.dynamicVoices || !this.voicesCacheTimestamp) {
            return false;
        }
        const cacheAge = Date.now() - this.voicesCacheTimestamp;
        return cacheAge < this.voicesCacheTTL;
    }

    /**
     * Get cache age in minutes
     * @private
     * @returns {number} Cache age in minutes
     */
    _getCacheAgeMinutes() {
        if (!this.voicesCacheTimestamp) {
            return 0;
        }
        return Math.round((Date.now() - this.voicesCacheTimestamp) / 1000 / 60);
    }

    /**
     * Extract voice style from voice ID
     * @private
     * @param {string} voiceId - Voice identifier (e.g., 'en-US-Neural2-A')
     * @returns {string} Voice style
     */
    _extractVoiceStyle(voiceId) {
        const nameLower = voiceId.toLowerCase();
        
        // Check patterns in order of specificity
        // chirp3 must come before chirp to avoid false matches
        const patterns = ['chirp3', 'neural2', 'wavenet', 'studio', 'polyglot', 'news', 'journey', 'chirp'];
        
        for (const pattern of patterns) {
            if (nameLower.includes(pattern)) {
                return pattern;
            }
        }
        
        return 'standard';
    }

    /**
     * Map gender to human-readable label
     * @private
     * @param {string} gender - Gender string
     * @returns {string} Gender label
     */
    _getGenderLabel(gender) {
        const genderMap = {
            'male': 'Male',
            'female': 'Female',
            'neutral': 'Neutral'
        };
        return genderMap[gender] || 'Neutral';
    }

    /**
     * Fetch all available voices from Google TTS API
     * This provides the most up-to-date list including new voice types
     * (Neural2, Journey, Studio, Polyglot, etc.)
     * @returns {Promise<Object>} Voice list in same format as getVoices()
     */
    async fetchVoicesFromAPI() {
        // Check cache first
        if (this._isCacheValid()) {
            this.logger.info(`Google TTS: Using cached voices (age: ${this._getCacheAgeMinutes()} minutes)`);
            return this.dynamicVoices;
        }

        try {
            const response = await axios.get(
                this.voicesUrl,
                {
                    headers: {
                        'Accept': 'application/json'
                    },
                    params: {
                        key: this.apiKey
                    },
                    timeout: this.timeout
                }
            );

            if (response.data && response.data.voices) {
                const voices = {};
                
                // Transform Google API format to our internal format
                for (const voice of response.data.voices) {
                    const voiceId = voice.name;
                    
                    // Validate languageCodes array
                    if (!voice.languageCodes || voice.languageCodes.length === 0) {
                        this.logger.warn(`Google TTS: Skipping voice ${voiceId} - no language codes`);
                        continue;
                    }
                    
                    const languageCode = voice.languageCodes[0];
                    
                    // Extract language prefix (e.g., 'de' from 'de-DE')
                    const lang = languageCode.split('-')[0];
                    
                    // Extract voice style from name
                    const style = this._extractVoiceStyle(voiceId);
                    
                    // Map gender
                    const gender = voice.ssmlGender ? voice.ssmlGender.toLowerCase() : 'neutral';
                    const genderLabel = this._getGenderLabel(gender);
                    
                    // Create human-readable name
                    const styleName = style.charAt(0).toUpperCase() + style.slice(1);
                    const name = `${languageCode} (${styleName} - ${genderLabel})`;
                    
                    voices[voiceId] = {
                        name,
                        lang,
                        gender,
                        style,
                        languageCode,
                        sampleRate: voice.naturalSampleRateHertz || 24000
                    };
                }
                
                // Cache the results
                this.dynamicVoices = voices;
                this.voicesCacheTimestamp = Date.now();
                
                this.logger.info(`Google TTS: Fetched ${Object.keys(voices).length} voices from API`);
                return voices;
            }
            
            throw new Error('Invalid response format from Google TTS voices API');
            
        } catch (error) {
            this.logger.error(`Google TTS: Failed to fetch voices from API: ${error.message}`);
            // Fallback to static list
            return null;
        }
    }

    /**
     * Get all available voices (combines static fallback with dynamic API data)
     * @param {boolean} forceFresh - Force fetch from API instead of using cache
     * @returns {Promise<Object>} Voice list
     */
    async getAllVoices(forceFresh = false) {
        // Try to fetch from API if we have an API key
        if (this.apiKey) {
            // Return cached voices if valid and not forcing fresh
            if (!forceFresh && this._isCacheValid()) {
                return this.dynamicVoices;
            }
            
            // Fetch fresh voices from API
            const dynamicVoices = await this.fetchVoicesFromAPI();
            if (dynamicVoices) {
                return dynamicVoices;
            }
        }
        
        // Fallback to static list
        this.logger.info('Google TTS: Using static voice list (fallback)');
        return GoogleEngine.getVoices();
    }

    /**
     * Extract language code from voice ID
     * @private
     * @param {string} voiceId - Voice identifier (e.g., 'de-DE-Wavenet-A', 'cmn-CN-Wavenet-A', 'en-US-Chirp3-HD-F1')
     * @returns {string} Language code (e.g., 'de-DE', 'cmn-CN', 'en-US')
     */
    _extractLanguageCode(voiceId) {
        // Match language code pattern before voice type (Wavenet, Neural2, Chirp3, etc.)
        const match = voiceId.match(/^([a-z]{2,3}-[A-Z]{2})/);
        if (match) {
            return match[1];
        }
        
        // Fallback: try to extract first two parts separated by dash
        const parts = voiceId.split('-');
        if (parts.length >= 2) {
            return `${parts[0]}-${parts[1]}`;
        }
        
        // Last resort: return first 5 characters (works for most cases)
        return voiceId.substring(0, 5);
    }

    /**
     * Generate TTS audio from text
     * @param {string} text - Text to synthesize
     * @param {string} voiceId - Google voice ID
     * @param {number} speed - Speaking rate (0.25 - 4.0)
     * @param {object} options - Additional options (pitch, etc.)
     * @returns {Promise<string>} Base64-encoded MP3 audio
     */
    async synthesize(text, voiceId, speed = 1.0, options = {}) {
        const pitch = options.pitch || 0.0;
        if (!this.apiKey) {
            throw new Error('Google TTS API key not configured');
        }

        // Extract language code from voice ID using proper parsing
        const languageCode = this._extractLanguageCode(voiceId);

        let lastError;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    this.apiUrl,
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
                        params: {
                            key: this.apiKey
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
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('API key must be a non-empty string');
        }
        
        this.apiKey = apiKey;
        this.logger.info('Google Cloud TTS: API key updated');
    }
}

module.exports = GoogleEngine;
