const { franc } = require('franc-min');

/**
 * Language Detector
 * Detects language from text and routes to appropriate voice
 * Enhanced with confidence threshold and fallback language support
 */
class LanguageDetector {
    constructor(logger, config = {}) {
        this.logger = logger;

        // Configuration with defaults
        this.config = {
            confidenceThreshold: config.confidenceThreshold || 0.90, // 90% confidence required
            fallbackLanguage: config.fallbackLanguage || 'de', // German as system default
            minTextLength: config.minTextLength || 10, // Minimum text length for reliable detection
            ...config
        };

        // Language code mapping (franc uses ISO 639-3, we need ISO 639-1)
        this.languageMap = {
            // Germanic
            'deu': 'de', // German
            'eng': 'en', // English
            'nld': 'nl', // Dutch
            'swe': 'sv', // Swedish
            'dan': 'da', // Danish
            'nor': 'no', // Norwegian

            // Romance
            'spa': 'es', // Spanish
            'fra': 'fr', // French
            'ita': 'it', // Italian
            'por': 'pt', // Portuguese
            'ron': 'ro', // Romanian

            // Slavic
            'pol': 'pl', // Polish
            'rus': 'ru', // Russian
            'ukr': 'uk', // Ukrainian
            'ces': 'cs', // Czech

            // Asian
            'jpn': 'ja', // Japanese
            'kor': 'ko', // Korean
            'cmn': 'zh', // Chinese (Mandarin)
            'zho': 'zh', // Chinese
            'tha': 'th', // Thai
            'vie': 'vi', // Vietnamese
            'ind': 'id', // Indonesian
            'msa': 'ms', // Malay

            // Middle Eastern
            'ara': 'ar', // Arabic
            'tur': 'tr', // Turkish
            'fas': 'fa', // Persian
            'heb': 'he', // Hebrew

            // Other
            'hin': 'hi', // Hindi
            'ben': 'bn', // Bengali
            'tam': 'ta', // Tamil
            'tel': 'te'  // Telugu
        };

        // Cache recent detections for performance
        this.cache = new Map();
        this.maxCacheSize = 1000;

        this.logger.info(`LanguageDetector initialized: confidenceThreshold=${this.config.confidenceThreshold}, fallbackLanguage=${this.config.fallbackLanguage}, minTextLength=${this.config.minTextLength}`);
    }

    /**
     * Detect language from text with confidence-based fallback
     * @param {string} text - Text to analyze
     * @param {string} customFallbackLang - Optional custom fallback language (overrides config)
     * @returns {object} { langCode, confidence, detected, usedFallback, reason }
     */
    detect(text, customFallbackLang = null) {
        // Safety check for null/undefined/empty text
        if (!text || typeof text !== 'string') {
            const fallbackLang = customFallbackLang || this.config.fallbackLanguage;
            this.logger.warn(`Language detection: null/undefined text, using fallback language: ${fallbackLang}`);
            return {
                langCode: fallbackLang,
                confidence: 0,
                detected: false,
                usedFallback: true,
                reason: 'null_or_undefined_text'
            };
        }

        const trimmedText = text.trim();

        // Check for minimum text length (short texts are unreliable)
        if (trimmedText.length < this.config.minTextLength) {
            const fallbackLang = customFallbackLang || this.config.fallbackLanguage;
            this.logger.info(`Language detection: Text too short (${trimmedText.length} chars < ${this.config.minTextLength}), using fallback language: ${fallbackLang}`);
            return {
                langCode: fallbackLang,
                confidence: 0,
                detected: false,
                usedFallback: true,
                reason: 'text_too_short',
                textLength: trimmedText.length
            };
        }

        // Check cache - use hash of full text to avoid collisions
        const cacheKey = this._hashText(trimmedText);
        if (this.cache.has(cacheKey)) {
            const cachedResult = this.cache.get(cacheKey);
            this.logger.info(`Language detection: Using cached result for "${trimmedText.substring(0, 30)}..."`);
            return cachedResult;
        }

        try {
            // Use franc for detection
            const detected = franc(trimmedText, { minLength: 3 });

            if (detected === 'und' || !detected) {
                // Undefined detection - use fallback
                const fallbackLang = customFallbackLang || this.config.fallbackLanguage;
                this.logger.warn(`Language detection: franc returned 'undefined', using fallback language: ${fallbackLang}`);
                const result = {
                    langCode: fallbackLang,
                    confidence: 0,
                    detected: false,
                    usedFallback: true,
                    reason: 'detection_undefined'
                };
                this._addToCache(cacheKey, result);
                return result;
            }

            // Map to ISO 639-1
            const detectedLangCode = this.languageMap[detected];
            
            if (!detectedLangCode) {
                // Unknown language code - use fallback
                const fallbackLang = customFallbackLang || this.config.fallbackLanguage;
                this.logger.warn(`Language detection: Unknown language code '${detected}', using fallback language: ${fallbackLang}`);
                const result = {
                    langCode: fallbackLang,
                    confidence: 0,
                    detected: false,
                    usedFallback: true,
                    reason: 'unknown_language_code',
                    detectedCode: detected
                };
                this._addToCache(cacheKey, result);
                return result;
            }

            // Estimate confidence (franc doesn't provide this, so we use heuristics)
            const confidence = this._estimateConfidence(trimmedText, detected);

            // Check if confidence meets threshold
            const meetsThreshold = confidence >= this.config.confidenceThreshold;
            const usedFallback = !meetsThreshold;
            const finalLangCode = meetsThreshold ? detectedLangCode : (customFallbackLang || this.config.fallbackLanguage);

            const result = {
                langCode: finalLangCode,
                confidence,
                detected: true,
                usedFallback,
                detectedLangCode: detectedLangCode,
                detectedCode: detected,
                reason: usedFallback ? 'confidence_below_threshold' : 'confidence_above_threshold',
                threshold: this.config.confidenceThreshold
            };

            this._addToCache(cacheKey, result);

            if (usedFallback) {
                this.logger.info(
                    `Language detection: Detected ${detectedLangCode} (${detected}) with confidence ${confidence.toFixed(2)} ` +
                    `< threshold ${this.config.confidenceThreshold}, using fallback: ${finalLangCode} for text: "${trimmedText.substring(0, 30)}..."`
                );
            } else {
                this.logger.info(
                    `Language detection: Detected ${detectedLangCode} (${detected}) with confidence ${confidence.toFixed(2)} ` +
                    `>= threshold ${this.config.confidenceThreshold} for text: "${trimmedText.substring(0, 30)}..."`
                );
            }

            return result;

        } catch (error) {
            // Error in detection - use fallback
            const fallbackLang = customFallbackLang || this.config.fallbackLanguage;
            this.logger.error(`Language detection failed with error: ${error.message}, using fallback language: ${fallbackLang}`);
            const result = {
                langCode: fallbackLang,
                confidence: 0,
                detected: false,
                usedFallback: true,
                reason: 'detection_error',
                error: error.message
            };
            this._addToCache(cacheKey, result);
            return result;
        }
    }

    /**
     * Estimate confidence based on text characteristics
     * Enhanced heuristics for better confidence estimation
     */
    _estimateConfidence(text, detectedCode) {
        const trimmedText = text.trim();
        const length = trimmedText.length;

        // Base confidence on text length - longer text = more reliable
        let baseConfidence = 0;
        if (length < 10) {
            baseConfidence = 0.3; // Very low confidence for very short text
        } else if (length < 20) {
            baseConfidence = 0.5; // Low confidence
        } else if (length < 50) {
            baseConfidence = 0.7; // Moderate confidence
        } else if (length < 100) {
            baseConfidence = 0.85; // Good confidence
        } else {
            baseConfidence = 0.95; // High confidence for long text
        }

        // Check for special characters that indicate specific languages
        const hasSpecialChars = this._hasLanguageSpecificChars(trimmedText, detectedCode);
        if (hasSpecialChars) {
            // Boost confidence if language-specific characters are present
            baseConfidence = Math.min(0.98, baseConfidence + 0.1);
        }

        // Penalize very short exclamations or single words
        const wordCount = trimmedText.split(/\s+/).length;
        if (wordCount < 3 && length < 15) {
            // Single word or very short phrases are unreliable
            baseConfidence = Math.min(baseConfidence, 0.6);
        }

        return baseConfidence;
    }

    /**
     * Check if text contains language-specific characters
     */
    _hasLanguageSpecificChars(text, detectedCode) {
        // Character ranges for specific languages
        const charPatterns = {
            'jpn': /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/, // Hiragana, Katakana, Kanji
            'kor': /[\uAC00-\uD7AF\u1100-\u11FF]/, // Hangul
            'zho': /[\u4E00-\u9FFF]/, // Chinese characters
            'cmn': /[\u4E00-\u9FFF]/, // Chinese characters
            'ara': /[\u0600-\u06FF]/, // Arabic script
            'heb': /[\u0590-\u05FF]/, // Hebrew script
            'tha': /[\u0E00-\u0E7F]/, // Thai script
            'rus': /[\u0400-\u04FF]/, // Cyrillic script
            'ukr': /[\u0400-\u04FF]/, // Cyrillic script
            'deu': /[äöüÄÖÜß]/, // German umlauts
            'fra': /[àâäæçéèêëïîôùûüÿœ]/, // French accents
            'spa': /[áéíóúñ¿¡]/, // Spanish accents
            'por': /[ãõáéíóúâêôç]/ // Portuguese accents
        };

        const pattern = charPatterns[detectedCode];
        return pattern ? pattern.test(text) : false;
    }

    /**
     * Add result to cache
     */
    _addToCache(key, value) {
        // LRU eviction: remove oldest if cache is full
        if (this.cache.size >= this.maxCacheSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        this.cache.set(key, value);
    }

    /**
     * Get language name from code
     */
    getLanguageName(langCode) {
        const names = {
            'de': 'Deutsch',
            'en': 'English',
            'es': 'Español',
            'fr': 'Français',
            'it': 'Italiano',
            'pt': 'Português',
            'ja': '日本語',
            'ko': '한국어',
            'zh': '中文',
            'ru': 'Русский',
            'ar': 'العربية',
            'tr': 'Türkçe',
            'nl': 'Nederlands',
            'pl': 'Polski',
            'th': 'ภาษาไทย',
            'vi': 'Tiếng Việt',
            'id': 'Bahasa Indonesia'
        };

        return names[langCode] || langCode.toUpperCase();
    }

    /**
     * Detect language and get default voice for detected language
     * Enhanced with confidence threshold and fallback logic
     * @param {string} text - Text to analyze
     * @param {object} engineClass - Engine class with getDefaultVoiceForLanguage method
     * @param {string} customFallbackLang - Optional custom fallback language
     * @returns {object|null} { langCode, confidence, voiceId, languageName, usedFallback, reason }
     */
    detectAndGetVoice(text, engineClass, customFallbackLang = null) {
        // Safety check for engineClass
        if (!engineClass || typeof engineClass.getDefaultVoiceForLanguage !== 'function') {
            this.logger.error('Language detection: Invalid engine class provided, missing getDefaultVoiceForLanguage method');
            return null;
        }

        // Detect language with confidence
        const detectionResult = this.detect(text, customFallbackLang);
        
        // Safety check for detection result
        if (!detectionResult || !detectionResult.langCode) {
            this.logger.error('Language detection: Detection returned null or invalid result');
            const fallbackLang = customFallbackLang || this.config.fallbackLanguage;
            const voiceId = engineClass.getDefaultVoiceForLanguage(fallbackLang);
            return {
                langCode: fallbackLang,
                confidence: 0,
                voiceId: voiceId,
                languageName: this.getLanguageName(fallbackLang),
                usedFallback: true,
                reason: 'detection_returned_null'
            };
        }

        const { langCode, confidence, usedFallback, reason } = detectionResult;

        // Get voice for the selected language (either detected or fallback)
        const voiceId = engineClass.getDefaultVoiceForLanguage(langCode);

        // Safety check for voiceId
        if (!voiceId || voiceId === 'undefined' || voiceId === 'null') {
            this.logger.error(`Language detection: getDefaultVoiceForLanguage returned invalid voiceId for language: ${langCode}`);
            const systemFallbackLang = customFallbackLang || this.config.fallbackLanguage;
            const systemFallbackVoice = engineClass.getDefaultVoiceForLanguage(systemFallbackLang);
            return {
                langCode: systemFallbackLang,
                confidence: 0,
                voiceId: systemFallbackVoice,
                languageName: this.getLanguageName(systemFallbackLang),
                usedFallback: true,
                reason: 'invalid_voice_id_for_detected_language'
            };
        }

        return {
            langCode,
            confidence,
            voiceId,
            languageName: this.getLanguageName(langCode),
            usedFallback,
            reason,
            detectedLangCode: detectionResult.detectedLangCode,
            threshold: detectionResult.threshold
        };
    }

    /**
     * Update configuration (e.g., when user changes settings)
     * @param {object} newConfig - New configuration values
     */
    updateConfig(newConfig) {
        if (newConfig.confidenceThreshold !== undefined) {
            this.config.confidenceThreshold = Math.max(0, Math.min(1, newConfig.confidenceThreshold));
            this.logger.info(`LanguageDetector: confidenceThreshold updated to ${this.config.confidenceThreshold}`);
        }
        
        if (newConfig.fallbackLanguage !== undefined && typeof newConfig.fallbackLanguage === 'string') {
            this.config.fallbackLanguage = newConfig.fallbackLanguage;
            this.logger.info(`LanguageDetector: fallbackLanguage updated to ${this.config.fallbackLanguage}`);
        }
        
        if (newConfig.minTextLength !== undefined) {
            this.config.minTextLength = Math.max(1, newConfig.minTextLength);
            this.logger.info(`LanguageDetector: minTextLength updated to ${this.config.minTextLength}`);
        }

        // Clear cache when config changes to ensure fresh detections
        this.clearCache();
    }

    /**
     * Get current configuration
     * @returns {object} Current config
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.clear();
        this.logger.info('Language detector cache cleared');
    }

    /**
     * Get cache stats
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize
        };
    }

    /**
     * Simple hash function for text caching
     * Prevents cache collisions from texts with identical prefixes
     */
    _hashText(text) {
        let hash = 0;
        const str = text.length > 500 ? text.substring(0, 500) : text;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }
}

module.exports = LanguageDetector;
