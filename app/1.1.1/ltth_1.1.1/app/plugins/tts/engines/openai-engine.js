const OpenAI = require('openai');

/**
 * OpenAI Text-to-Speech Engine
 * High-quality TTS using OpenAI's TTS API (requires API key)
 */
class OpenAIEngine {
    constructor(apiKey, logger, config = {}) {
        this.apiKey = apiKey;
        this.logger = logger;
        this.client = new OpenAI({ apiKey });
        
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
            this.timeout = config.timeout || 10000; // 10s timeout (reduced from 15s)
            this.maxRetries = config.maxRetries || 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`OpenAI TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);
    }

    /**
     * Get all available OpenAI TTS voices
     */
    static getVoices() {
        return {
            // Standard TTS-1 voices (faster, lower latency)
            'tts-1-alloy': { name: 'Alloy (Standard)', lang: 'multi', gender: 'neutral', model: 'tts-1', voice: 'alloy', description: 'Neutral voice' },
            'tts-1-echo': { name: 'Echo (Standard)', lang: 'multi', gender: 'male', model: 'tts-1', voice: 'echo', description: 'Male voice' },
            'tts-1-fable': { name: 'Fable (Standard)', lang: 'multi', gender: 'neutral', model: 'tts-1', voice: 'fable', description: 'British accent' },
            'tts-1-onyx': { name: 'Onyx (Standard)', lang: 'multi', gender: 'male', model: 'tts-1', voice: 'onyx', description: 'Deep male voice' },
            'tts-1-nova': { name: 'Nova (Standard)', lang: 'multi', gender: 'female', model: 'tts-1', voice: 'nova', description: 'Female voice' },
            'tts-1-shimmer': { name: 'Shimmer (Standard)', lang: 'multi', gender: 'female', model: 'tts-1', voice: 'shimmer', description: 'Soft female voice' },
            
            // HD TTS-1-HD voices (higher quality)
            'tts-1-hd-alloy': { name: 'Alloy (HD)', lang: 'multi', gender: 'neutral', model: 'tts-1-hd', voice: 'alloy', description: 'Neutral voice, high quality' },
            'tts-1-hd-echo': { name: 'Echo (HD)', lang: 'multi', gender: 'male', model: 'tts-1-hd', voice: 'echo', description: 'Male voice, high quality' },
            'tts-1-hd-fable': { name: 'Fable (HD)', lang: 'multi', gender: 'neutral', model: 'tts-1-hd', voice: 'fable', description: 'British accent, high quality' },
            'tts-1-hd-onyx': { name: 'Onyx (HD)', lang: 'multi', gender: 'male', model: 'tts-1-hd', voice: 'onyx', description: 'Deep male voice, high quality' },
            'tts-1-hd-nova': { name: 'Nova (HD)', lang: 'multi', gender: 'female', model: 'tts-1-hd', voice: 'nova', description: 'Female voice, high quality' },
            'tts-1-hd-shimmer': { name: 'Shimmer (HD)', lang: 'multi', gender: 'female', model: 'tts-1-hd', voice: 'shimmer', description: 'Soft female voice, high quality' }
        };
    }

    /**
     * Convert text to speech using OpenAI TTS
     * @param {string} text - The text to convert
     * @param {string} voiceId - The voice ID (e.g., 'tts-1-alloy' or 'tts-1-hd-alloy')
     * @param {object} options - Additional options
     * @returns {Promise<string>} Base64-encoded audio data
     */
    async synthesize(text, voiceId = 'tts-1-alloy', options = {}) {
        const voices = OpenAIEngine.getVoices();
        const voiceConfig = voices[voiceId];

        if (!voiceConfig) {
            throw new Error(`Invalid voice ID: ${voiceId}`);
        }

        const { model, voice } = voiceConfig;

        try {
            this.logger.info(`OpenAI TTS: Synthesizing with model=${model}, voice=${voice}`);

            const response = await this.client.audio.speech.create({
                model: model,
                voice: voice,
                input: text,
                response_format: options.format || 'mp3',
                speed: options.speed || 1.0
            });

            // Convert the response to a buffer and then to base64
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const base64Audio = buffer.toString('base64');

            this.logger.info(`OpenAI TTS: Successfully synthesized ${buffer.length} bytes`);
            return base64Audio;

        } catch (error) {
            this.logger.error(`OpenAI TTS: Synthesis failed - ${error.message}`);
            throw error;
        }
    }

    /**
     * Get default voice for a language
     * OpenAI TTS voices are multilingual, so we return the same voice for all languages
     * @param {string} langCode - Language code (e.g., 'de', 'en', 'es')
     * @returns {string} Voice ID
     */
    static getDefaultVoiceForLanguage(langCode) {
        // OpenAI voices support all languages, return standard quality Alloy by default
        return 'tts-1-alloy';
    }

    /**
     * Check if the engine is ready to use
     * @returns {Promise<boolean>}
     */
    async isReady() {
        try {
            // Test by listing available models
            await this.client.models.list();
            return true;
        } catch (error) {
            this.logger.error(`OpenAI TTS: Engine not ready - ${error.message}`);
            return false;
        }
    }

    /**
     * Get engine info
     */
    getInfo() {
        return {
            name: 'OpenAI TTS',
            description: 'High-quality text-to-speech using OpenAI API',
            requiresApiKey: true,
            supportedFormats: ['mp3', 'opus', 'aac', 'flac'],
            supportedLanguages: ['multi'], // Supports multiple languages automatically
            maxTextLength: 4096
        };
    }
}

module.exports = OpenAIEngine;
