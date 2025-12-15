const axios = require('axios');

/**
 * Fish.audio TTS Engine (Official API)
 * High-quality multilingual TTS using Fish Audio S1 engine
 * 
 * API Documentation: https://docs.fish.audio/developer-guide/getting-started/introduction
 * - Base URL: https://api.fish.audio
 * - Endpoint: POST /v1/tts
 * - Model: Fish Audio S1 (latest generation)
 * - Request Format: JSON (MessagePack also supported)
 * - Audio Formats: mp3, wav, pcm, opus
 * 
 * Features:
 * - Multilingual support (13+ languages: EN, ZH, JA, DE, FR, ES, KO, AR, RU, NL, IT, PL, PT)
 * - Voice cloning with reference audio  
 * - 64+ emotion expressions via text markers (happy, sad, angry, excited, etc.)
 * - Advanced audio effects (laughing, crying, whispering, shouting, etc.)
 * - Fine-grained control (phoneme control, paralanguage)
 * - Streaming support for low latency
 * - Automatic retry with exponential backoff
 * - Performance mode optimization
 * 
 * References:
 * - Models: https://docs.fish.audio/developer-guide/models-pricing/models-overview
 * - TTS: https://docs.fish.audio/developer-guide/core-features/text-to-speech
 * - Emotions: https://docs.fish.audio/developer-guide/core-features/emotions
 * - Fine-grained control: https://docs.fish.audio/developer-guide/core-features/fine-grained-control
 * - Best practices: https://docs.fish.audio/developer-guide/best-practices/emotion-control
 */
class FishSpeechEngine {
    // Default voice reference ID (Sarah - warm female voice)
    static DEFAULT_REFERENCE_ID = '933563129e564b19a115bedd57b7406a';
    
    // Opus auto bitrate constant (-1000 means automatic bitrate selection)
    static OPUS_AUTO_BITRATE = -1000;
    
    constructor(apiKey, logger, config = {}) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Fish.audio API key is required and must be a non-empty string');
        }

        this.apiKey = apiKey;
        this.logger = logger;
        this.config = config;

        // Fish.audio Official API Configuration
        this.apiBaseUrl = 'https://api.fish.audio';
        this.apiSynthesisUrl = `${this.apiBaseUrl}/v1/tts`;
        this.model = 's1'; // Fish Audio S1 model (latest generation)

        // Performance mode optimization
        const performanceMode = config.performanceMode || 'balanced';
        
        // Adjust timeout and retries based on performance mode
        if (performanceMode === 'fast') {
            // Fast mode: optimized for low-resource PCs
            this.timeout = 8000;  // 8s timeout for faster failure
            this.maxRetries = 1;  // Only 1 retry (2 attempts total)
        } else if (performanceMode === 'quality') {
            // Quality mode: longer timeouts for better reliability
            this.timeout = 30000; // 30s timeout
            this.maxRetries = 3;  // 3 retries (4 attempts total)
        } else {
            // Balanced mode (default): moderate settings
            this.timeout = 15000; // 15s timeout
            this.maxRetries = 2;  // 2 retries (3 attempts total)
        }
        
        this.performanceMode = performanceMode;
        this.logger.info(`Fish.audio TTS: Performance mode set to '${performanceMode}' (timeout: ${this.timeout}ms, retries: ${this.maxRetries})`);

        // Supported emotions for Fish.audio (64+ emotions available)
        // Basic emotions (24)
        this.supportedEmotions = [
            'neutral', 'happy', 'sad', 'angry', 'excited', 'calm', 'nervous', 'confident',
            'surprised', 'satisfied', 'delighted', 'scared', 'worried', 'upset', 'frustrated',
            'depressed', 'empathetic', 'embarrassed', 'disgusted', 'moved', 'proud', 'relaxed',
            'grateful', 'curious', 'sarcastic',
            // Advanced emotions (25)
            'disdainful', 'unhappy', 'anxious', 'hysterical', 'indifferent', 'uncertain',
            'doubtful', 'confused', 'disappointed', 'regretful', 'guilty', 'ashamed',
            'jealous', 'envious', 'hopeful', 'optimistic', 'pessimistic', 'nostalgic',
            'lonely', 'bored', 'contemptuous', 'sympathetic', 'compassionate', 'determined', 'resigned'
        ];

        // Tone markers (5)
        this.supportedTones = [
            'in a hurry tone', 'shouting', 'screaming', 'whispering', 'soft tone'
        ];

        // Audio effects (10)
        this.supportedEffects = [
            'laughing', 'chuckling', 'sobbing', 'crying loudly', 'sighing',
            'groaning', 'panting', 'gasping', 'yawning', 'snoring',
            // Paralanguage effects
            'break', 'long-break', 'breath', 'laugh', 'cough', 'lip-smacking', 'sigh',
            // Background effects
            'audience laughing', 'background laughter', 'crowd laughing'
        ];

        this.logger.info('Fish.audio TTS engine initialized (Fish Audio S1 model)');
    }

    /**
     * Get all available Fish.audio voices
     * Note: These are example voice IDs. In production, users should use voice IDs from their Fish.audio account
     * or from the Fish.audio discovery page: https://fish.audio/discovery
     * @returns {Object} Voice map with voiceId as key
     */
    static getVoices() {
        return {
            // Example voices from Fish.audio (users can add their own)
            'fish-egirl': { 
                name: 'E-girl (Energetic Female)', 
                lang: 'en', 
                gender: 'female',
                model: 's1',
                reference_id: '8ef4a238714b45718ce04243307c57a7',
                description: 'Energetic young female voice',
                supportedEmotions: true
            },
            'fish-energetic-male': { 
                name: 'Energetic Male', 
                lang: 'en', 
                gender: 'male',
                model: 's1',
                reference_id: '802e3bc2b27e49c2995d23ef70e6ac89',
                description: 'Energetic and dynamic male voice',
                supportedEmotions: true
            },
            'fish-sarah': { 
                name: 'Sarah (Warm Female)', 
                lang: 'en', 
                gender: 'female',
                model: 's1',
                reference_id: '933563129e564b19a115bedd57b7406a',
                description: 'Warm and friendly female voice',
                supportedEmotions: true
            },
            'fish-adrian': { 
                name: 'Adrian (Professional Male)', 
                lang: 'en', 
                gender: 'male',
                model: 's1',
                reference_id: 'bf322df2096a46f18c579d0baa36f41d',
                description: 'Professional male voice',
                supportedEmotions: true
            },
            'fish-selene': { 
                name: 'Selene (Elegant Female)', 
                lang: 'en', 
                gender: 'female',
                model: 's1',
                reference_id: 'b347db033a6549378b48d00acb0d06cd',
                description: 'Elegant and sophisticated female voice',
                supportedEmotions: true
            },
            'fish-ethan': { 
                name: 'Ethan (Calm Male)', 
                lang: 'en', 
                gender: 'male',
                model: 's1',
                reference_id: '536d3a5e000945adb7038665781a4aca',
                description: 'Calm and reassuring male voice',
                supportedEmotions: true
            }
        };
    }

    /**
     * Get default voice for a specific language
     * @param {string} langCode - Language code (e.g., 'en', 'de', 'zh')
     * @returns {string} Default voice ID for the language
     */
    static getDefaultVoiceForLanguage(langCode) {
        // All languages currently use the same default voice (fish-sarah)
        // since Fish.audio S1 model supports multilingual synthesis
        return 'fish-sarah';
    }

    /**
     * Convert text to speech using Fish.audio API
     * @param {string} text - The text to convert (supports emotion markers like "(happy) Hello!")
     * @param {string} voiceId - The voice ID (e.g., 'fish-sarah')
     * @param {number} speed - Speaking rate (0.5 - 2.0) - Note: Controlled via text normalization in Fish.audio
     * @param {object} options - Additional options
     *   - format: Audio format (mp3, wav, opus, pcm) - default: mp3
     *   - emotion: Emotion to inject into text (will be added as text marker)
     *   - normalize: Normalize text (default: true, set to false for fine-grained control)
     *   - latency: Latency mode ('normal' or 'balanced') - default: 'normal'
     *   - chunk_length: Characters per chunk (100-300) - default: 200
     *   - mp3_bitrate: MP3 bitrate (64, 128, 192) - default: 128
     * @returns {Promise<string>} Base64-encoded audio data
     */
    async synthesize(text, voiceId = 'fish-sarah', speed = 1.0, options = {}) {
        const voices = FishSpeechEngine.getVoices();
        const voiceConfig = voices[voiceId];

        if (!voiceConfig) {
            this.logger.warn(`Invalid voice ID: ${voiceId}, falling back to default`);
            voiceId = 'fish-sarah';
        }

        // Get the reference_id from voice config
        const referenceId = voiceConfig?.reference_id || FishSpeechEngine.DEFAULT_REFERENCE_ID;

        // Process emotion injection if provided
        let processedText = text;
        if (options.emotion && this.isValidEmotion(options.emotion)) {
            // Add emotion marker at the beginning of the text if not already present
            if (!text.trim().startsWith('(')) {
                processedText = `(${options.emotion}) ${text}`;
                this.logger.info(`Fish.audio TTS: Injecting emotion '${options.emotion}' into text`);
            }
        }

        // Extract parameters
        const format = options.format || 'mp3';
        const normalize = options.normalize !== undefined ? options.normalize : true;
        const latency = options.latency || 'normal';
        const chunkLength = options.chunk_length || 200;
        const mp3Bitrate = options.mp3_bitrate || 128;

        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    // Exponential backoff: 1s, 2s, 4s...
                    const delay = Math.pow(2, attempt - 1) * 1000;
                    this.logger.info(`Fish.audio TTS: Retry attempt ${attempt}/${this.maxRetries} after ${delay}ms delay`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                this.logger.info(`Fish.audio TTS: Synthesizing with voice=${voiceId}, reference_id=${referenceId}, format=${format}, normalize=${normalize} (attempt ${attempt + 1}/${this.maxRetries + 1})`);

                // Fish.audio API request body
                const requestBody = {
                    text: processedText,
                    reference_id: referenceId,
                    format: format,
                    mp3_bitrate: mp3Bitrate,
                    normalize: normalize,
                    latency: latency,
                    chunk_length: chunkLength
                };

                // If format is opus, add opus_bitrate
                if (format === 'opus') {
                    requestBody.opus_bitrate = FishSpeechEngine.OPUS_AUTO_BITRATE; // Automatic bitrate selection
                }

                const response = await axios.post(this.apiSynthesisUrl, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'model': this.model  // Fish Audio S1 model
                    },
                    responseType: 'arraybuffer',
                    timeout: this.timeout
                });

                // Convert response to base64
                const buffer = Buffer.from(response.data);
                const base64Audio = buffer.toString('base64');

                this.logger.info(`Fish.audio TTS: Successfully synthesized ${buffer.length} bytes`);
                return base64Audio;

            } catch (error) {
                lastError = error;
                
                // Determine if error is retryable
                const isRetryable = error.code === 'ECONNABORTED' || 
                                   error.code === 'ETIMEDOUT' ||
                                   (error.response && error.response.status >= 500);
                
                if (!isRetryable || attempt === this.maxRetries) {
                    // Don't retry on client errors (4xx) or if max retries reached
                    break;
                }
                
                this.logger.warn(`Fish.audio TTS: Attempt ${attempt + 1} failed (retryable error), retrying...`);
            }
        }

        // All retries exhausted
        if (lastError.response) {
            // API error response
            const errorMessage = lastError.response.data ? 
                (Buffer.isBuffer(lastError.response.data) ? 
                    lastError.response.data.toString('utf-8') : 
                    JSON.stringify(lastError.response.data)) : 
                'Unknown error';
            this.logger.error(`Fish.audio TTS: API error (${lastError.response.status}): ${errorMessage}`);
            throw new Error(`Fish.audio API error: ${errorMessage}`);
        } else if (lastError.request) {
            // Network error
            this.logger.error(`Fish.audio TTS: Network error - ${lastError.message}`);
            throw new Error(`Fish.audio network error: ${lastError.message}`);
        } else {
            // Other error
            this.logger.error(`Fish.audio TTS: Synthesis failed - ${lastError.message}`);
            throw lastError;
        }
    }

    /**
     * Update API key
     * @param {string} apiKey - New API key
     */
    setApiKey(apiKey) {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            throw new Error('Fish.audio API key must be a non-empty string');
        }
        this.apiKey = apiKey;
        this.logger.info('Fish.audio TTS: API key updated');
    }

    /**
     * Get voices asynchronously (for consistency with other engines)
     * @returns {Promise<Object>} Voice map
     */
    async getVoices() {
        return FishSpeechEngine.getVoices();
    }

    /**
     * Get supported emotions
     * @returns {Array<string>} List of supported emotions
     */
    getSupportedEmotions() {
        return [...this.supportedEmotions];
    }

    /**
     * Get supported tones
     * @returns {Array<string>} List of supported tones
     */
    getSupportedTones() {
        return [...this.supportedTones];
    }

    /**
     * Get supported effects
     * @returns {Array<string>} List of supported effects
     */
    getSupportedEffects() {
        return [...this.supportedEffects];
    }

    /**
     * Validate emotion
     * @param {string} emotion - Emotion to validate
     * @returns {boolean} True if emotion is supported
     */
    isValidEmotion(emotion) {
        return this.supportedEmotions.includes(emotion) || 
               this.supportedTones.includes(emotion) ||
               this.supportedEffects.includes(emotion);
    }

    /**
     * Helper: Add emotion marker to text
     * @param {string} text - Original text
     * @param {string} emotion - Emotion to add
     * @returns {string} Text with emotion marker
     */
    static addEmotionMarker(text, emotion) {
        if (!text || !emotion) return text;
        // Only add if not already present
        if (text.trim().startsWith('(')) {
            return text;
        }
        return `(${emotion}) ${text}`;
    }

    /**
     * Helper: Add paralanguage effect to text
     * @param {string} text - Original text
     * @param {string} effect - Effect to add (e.g., 'break', 'laugh', 'breath')
     * @returns {string} Text with effect marker
     */
    static addParalanguageEffect(text, effect) {
        if (!text || !effect) return text;
        return `${text} (${effect})`;
    }
}

module.exports = FishSpeechEngine;
