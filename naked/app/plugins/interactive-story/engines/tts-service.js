const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * TTS Service for SiliconFlow Audio API
 * Multi-voice support with emotion and pre-caching
 */
class TTSService {
  constructor(apiKey, logger, cacheDir) {
    this.apiKey = apiKey;
    this.logger = logger;
    this.cacheDir = cacheDir;
    this.baseURL = 'https://api.siliconflow.com/v1';  // Fixed: Use .com instead of .cn
    this.model = 'fishaudio/fish-speech-1.5';
    
    // Available voices with characteristics
    this.voices = {
      narrator: { name: 'default', description: 'Neutral narrator voice' },
      hero: { name: 'male', description: 'Strong heroic voice' },
      heroine: { name: 'female', description: 'Female protagonist voice' },
      villain: { name: 'male', description: 'Mysterious antagonist voice' },
      sidekick: { name: 'default', description: 'Friendly companion voice' },
      elder: { name: 'default', description: 'Wise elder voice' }
    };

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate TTS audio and cache it
   * @param {string} text - Text to convert to speech
   * @param {string} voiceType - Voice type (narrator, hero, heroine, etc.)
   * @param {number} speed - Speech speed (0.25 to 4.0)
   * @returns {Promise<string>} - Path to cached audio file
   */
  async generateSpeech(text, voiceType = 'narrator', speed = 1.0) {
    try {
      const voice = this.voices[voiceType] || this.voices.narrator;
      
      // Create cache key from text and voice
      const cacheKey = this._generateCacheKey(text, voiceType, speed);
      const cachedPath = this.getCachedAudio(cacheKey);
      
      if (cachedPath) {
        this.logger.debug(`TTS: Using cached audio for ${voiceType}`);
        return cachedPath;
      }

      this.logger.info(`TTS: Generating speech with ${voice.name} (${text.substring(0, 50)}...)`);

      const response = await axios.post(
        `${this.baseURL}/audio/speech`,
        {
          model: this.model,
          voice: voice.name,
          input: text,
          speed: speed,
          response_format: 'mp3'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );

      // Cache the audio
      const filepath = await this._cacheAudio(response.data, cacheKey);
      return filepath;
    } catch (error) {
      this.logger.error(`TTS Service Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`API Response: ${error.response.status}`);
      }
      throw error;
    }
  }

  /**
   * Pre-generate all TTS segments for a chapter
   * @param {Array} segments - Array of {text, voiceType, speed}
   * @returns {Promise<Array>} - Array of audio file paths
   */
  async preGenerateChapter(segments) {
    const audioPaths = [];
    
    this.logger.info(`TTS: Pre-generating ${segments.length} audio segments...`);
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      try {
        const audioPath = await this.generateSpeech(
          segment.text,
          segment.voiceType || 'narrator',
          segment.speed || 1.0
        );
        audioPaths.push(audioPath);
        this.logger.debug(`TTS: Generated segment ${i + 1}/${segments.length}`);
      } catch (error) {
        this.logger.error(`TTS: Failed to generate segment ${i + 1}: ${error.message}`);
        audioPaths.push(null);
      }
    }
    
    this.logger.info(`TTS: Pre-generation complete (${audioPaths.filter(p => p).length}/${segments.length} succeeded)`);
    return audioPaths;
  }

  /**
   * Generate cache key from text and voice parameters
   * @param {string} text - Text content
   * @param {string} voiceType - Voice type
   * @param {number} speed - Speech speed
   * @returns {string} - Cache key
   */
  _generateCacheKey(text, voiceType, speed) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(`${text}_${voiceType}_${speed}`).digest('hex');
    return `${hash}.mp3`;
  }

  /**
   * Cache audio data to local file
   * @param {Buffer} audioData - Audio buffer
   * @param {string} cacheKey - Cache filename
   * @returns {Promise<string>} - Path to cached file
   */
  async _cacheAudio(audioData, cacheKey) {
    try {
      const filepath = path.join(this.cacheDir, cacheKey);
      fs.writeFileSync(filepath, audioData);
      this.logger.debug(`TTS: Audio cached to ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error(`TTS: Failed to cache audio: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get cached audio path if it exists
   * @param {string} cacheKey - Cache filename
   * @returns {string|null} - Full path or null
   */
  getCachedAudio(cacheKey) {
    const filepath = path.join(this.cacheDir, cacheKey);
    return fs.existsSync(filepath) ? filepath : null;
  }

  /**
   * Clean old cached audio (older than N days)
   * @param {number} daysOld - Days threshold
   */
  cleanOldCache(daysOld = 3) {
    try {
      const files = fs.readdirSync(this.cacheDir);
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      let cleaned = 0;

      for (const file of files) {
        if (!file.endsWith('.mp3')) continue;
        
        const filepath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filepath);
        
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(filepath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.logger.info(`TTS: Cleaned ${cleaned} old cached audio files`);
      }
    } catch (error) {
      this.logger.error(`TTS: Failed to clean cache: ${error.message}`);
    }
  }

  /**
   * Get available voices
   * @returns {Object} - Voice configurations
   */
  getAvailableVoices() {
    return this.voices;
  }
}

module.exports = TTSService;
