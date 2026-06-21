const path = require('path');
const fs = require('fs');
const axios = require('axios');

// Engines
const LLMService = require('./engines/llm-service');
const ImageService = require('./engines/image-service');
// Note: TTSService removed - now using LTTH TTS plugin for all TTS operations
const OpenAILLMService = require('./engines/openai-llm-service');
const OpenAIImageService = require('./engines/openai-image-service');
const StoryEngine = require('./engines/story-engine');

// Utils
const VotingSystem = require('./utils/voting-system');
const StoryMemory = require('./utils/story-memory');

// Backend
const StoryDatabase = require('./backend/database');

/**
 * Interactive Story Generator Plugin
 * AI-powered story generation with voting, TTS, images, and OBS overlays
 */
class InteractiveStoryPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.logger = api.logger;

    // Initialize database
    this.db = new StoryDatabase(api);

    // Get persistent storage directories
    const pluginDataDir = api.getPluginDataDir();
    this.imageCacheDir = path.join(pluginDataDir, 'images');
    this.audioCacheDir = path.join(pluginDataDir, 'audio');
    this.exportDir = path.join(pluginDataDir, 'exports');

    // Services (initialized in init())
    this.llmService = null;
    this.imageService = null;
    this.ttsService = null;
    this.storyEngine = null;
    this.votingSystem = null;

    // Current session state
    this.currentSession = null;
    this.currentChapter = null;
    this.isGenerating = false;
    this.ttsPaused = false;
    this.finalChapterEndTimer = null; // Timer for auto-ending after final chapter
    this.finalChapterEndPending = false; // Flag to prevent race conditions
    this.lastVoteResults = null; // Store last voting results for manual mode
    
    // TTS playback tracking
    // Maps username -> Promise resolve function for tracking TTS playback completion
    this.ttsPlaybackResolvers = new Map();
    this.TTS_USERNAME = 'Story Narrator (interactive-story)'; // Unique identifier for event matching
    this.TTS_PLAYBACK_TIMEOUT_MS = 60000; // 60 seconds timeout for TTS playback
    this.TTS_DISABLED_VOTING_BUFFER_MS = 2000; // 2 second buffer before voting when TTS disabled
    
    // Reading time constants (when TTS is disabled)
    this.READING_SPEED_WPS = 3.3; // Words per second (≈200 words per minute)
    this.MIN_READING_TIME_MS = 5000; // Minimum 5 seconds
    
    // Timing defaults (overridable by config)
    this.DEFAULT_TITLE_PREVIEW_DELAY_MS = 5000; // Default: Show image alone for 5 seconds before title/greyscale
    this.DEFAULT_MIN_TITLE_READ_TIME_MS = 3000; // Default: Minimum 3 seconds to keep title visible before chapter text
    this.DEFAULT_CONTENT_START_BUFFER_MS = 500; // Default: Small buffer between title TTS and content sentences
    
    // Configuration constants
    this.FINAL_CHAPTER_DELAY_MS = 5000; // Delay before auto-ending session after final chapter
    
    // Debug logs for offline testing
    this.debugLogs = [];
    this.maxDebugLogs = 100;
  }
  
  /**
   * Add debug log entry
   */
  _debugLog(level, message, data = null) {
    const config = this._loadConfig();
    if (!config.debugLogging) return;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    
    this.debugLogs.unshift(logEntry);
    if (this.debugLogs.length > this.maxDebugLogs) {
      this.debugLogs.pop();
    }
    
    // Log to Winston logger with appropriate level
    const logMessage = data ? `${message} ${JSON.stringify(data)}` : message;
    switch(level) {
      case 'error':
        this.logger.error(logMessage);
        break;
      case 'warn':
        this.logger.warn(logMessage);
        break;
      case 'debug':
        this.logger.debug(logMessage);
        break;
      default:
        this.logger.info(logMessage);
    }
    
    // Emit to UI
    this.io.emit('story:debug-log', logEntry);
  }

  async init() {
    this.api.log('📖 Initializing Interactive Story Generator Plugin...', 'info');

    try {
      // Ensure data directories exist
      this.api.ensurePluginDataDir();
      [this.imageCacheDir, this.audioCacheDir, this.exportDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // Initialize database
      this.db.initialize();

      // Load configuration
      const config = this._loadConfig();

      // Create debug callback that respects debugLogging config
      const debugCallback = (level, message, data) => this._debugLog(level, message, data);
      
      // Create LLM service options
      const llmOptions = {
        timeout: config.llmTimeout,
        maxRetries: config.llmMaxRetries,
        retryDelay: config.llmRetryDelay
      };

      // Initialize services based on provider selection
      const llmProvider = config.llmProvider || 'openai';
      const imageProvider = config.imageProvider || 'openai';
      const ttsProvider = config.ttsProvider || 'system';

      // Initialize LLM service
      if (llmProvider === 'openai') {
        const openaiApiKey = this._getOpenAIApiKey();
        if (openaiApiKey) {
          this.llmService = new OpenAILLMService(openaiApiKey, this.logger, debugCallback, llmOptions);
          this.storyEngine = new StoryEngine(this.llmService, this.logger, {
            language: config.storyLanguage || 'German',
            platform: 'tiktok'
          });
          this._debugLog('info', '✅ OpenAI LLM service initialized', { 
            apiKeyLength: openaiApiKey.length,
            apiKeyPrefix: openaiApiKey.substring(0, 6) + '...',
            timeout: config.llmTimeout,
            maxRetries: config.llmMaxRetries
          });
          this.api.log('✅ OpenAI LLM service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ OpenAI API key not configured in global settings', null);
          this.api.log('⚠️ OpenAI API key not configured in global settings', 'warn');
          this.api.log('Please configure API key in Settings → OpenAI API Configuration', 'warn');
        }
      } else {
        // SiliconFlow provider
        const siliconFlowApiKey = this._getSiliconFlowApiKey();
        if (siliconFlowApiKey) {
          this.llmService = new LLMService(siliconFlowApiKey, this.logger, debugCallback, llmOptions);
          this.storyEngine = new StoryEngine(this.llmService, this.logger, {
            language: config.storyLanguage || 'German',
            platform: 'tiktok'
          });
          this._debugLog('info', '✅ SiliconFlow LLM service initialized', { 
            apiKeyLength: siliconFlowApiKey.length,
            apiKeyPrefix: siliconFlowApiKey.substring(0, 6) + '...',
            timeout: config.llmTimeout,
            maxRetries: config.llmMaxRetries
          });
          this.api.log('✅ SiliconFlow LLM service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ SiliconFlow API key not configured in global settings', null);
          this.api.log('⚠️ SiliconFlow API key not configured in global settings', 'warn');
          this.api.log('Please configure API key in Settings → TTS API Keys → Fish Speech 1.5 API Key (SiliconFlow)', 'warn');
        }
      }

      // Initialize Image service
      if (imageProvider === 'openai') {
        const openaiApiKey = this._getOpenAIApiKey();
        if (openaiApiKey) {
          this.imageService = new OpenAIImageService(openaiApiKey, this.logger, this.imageCacheDir);
          this._debugLog('info', '✅ OpenAI Image service initialized', null);
          this.api.log('✅ OpenAI Image service (DALL-E) initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ OpenAI API key not configured for image generation', null);
          this.api.log('⚠️ OpenAI API key not configured for image generation', 'warn');
        }
      } else {
        // SiliconFlow provider
        const siliconFlowApiKey = this._getSiliconFlowApiKey();
        if (siliconFlowApiKey) {
          this.imageService = new ImageService(siliconFlowApiKey, this.logger, this.imageCacheDir);
          this._debugLog('info', '✅ SiliconFlow Image service initialized', null);
          this.api.log('✅ SiliconFlow Image service initialized', 'info');
        } else {
          this._debugLog('error', '⚠️ SiliconFlow API key not configured for image generation', null);
          this.api.log('⚠️ SiliconFlow API key not configured for image generation', 'warn');
        }
      }

      // Always use system TTS plugin (LTTH TTS plugin)
      // The LTTH TTS plugin supports all engines: OpenAI, TikTok, Google, ElevenLabs, Speechify, Fish.audio, SiliconFlow
      // No need for custom TTS service - let the TTS plugin handle everything
      this.api.log('Using LTTH TTS plugin for voice generation (supports all engines)', 'info');
      this._debugLog('info', '✅ Using LTTH TTS plugin for all TTS operations', null);

      // Ensure storyEngine is always initialized (even without LLM service for theme access)
      if (!this.storyEngine) {
        this._debugLog('warn', '⚠️ StoryEngine not initialized - creating basic instance for theme access', null);
        // Create a minimal storyEngine without LLM service for theme/configuration access
        this.storyEngine = new StoryEngine(null, this.logger, {
          language: config.storyLanguage || 'German',
          platform: 'tiktok'
        });
        this.api.log('⚠️ StoryEngine initialized in limited mode (themes only - configure API keys for full functionality)', 'warn');
      }

      // Initialize voting system
      this.votingSystem = new VotingSystem(this.logger, this.io);

      // Register routes
      this._registerRoutes();

      // Register socket handlers
      this._registerSocketHandlers();

      // Register TikTok event handlers
      this._registerTikTokHandlers();

      // Clean old cache on startup
      if (this.imageService && this.imageService.cleanOldCache) {
        this.imageService.cleanOldCache(7);
      }
      // Note: Audio cache cleanup no longer needed as we use LTTH TTS plugin
      // which manages its own audio cache

      // Check for active session
      const activeSession = this.db.getActiveSession();
      if (activeSession) {
        this.currentSession = activeSession;
        this.api.log(`Restored active session: ${activeSession.id}`, 'info');
      }

      this.api.log('✅ Interactive Story Plugin initialized successfully', 'info');
      this.api.log(`   📂 Images: ${this.imageCacheDir}`, 'info');
      this.api.log(`   🎵 Audio: ${this.audioCacheDir}`, 'info');
      this.api.log(`   📦 Exports: ${this.exportDir}`, 'info');
    } catch (error) {
      this.api.log(`❌ Error initializing Interactive Story Plugin: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get SiliconFlow API key from global settings
   * @returns {string|null} API key or null if not configured
   */
  _getSiliconFlowApiKey() {
    try {
      const db = this.api.getDatabase();
      const keyPriority = [
        'siliconflow_api_key',
        'tts_fishspeech_api_key',
        'streamalchemy_siliconflow_api_key'
      ];
      for (const key of keyPriority) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
        if (row && row.value) {
          return row.value.trim();
        }
      }
      return null;
    } catch (error) {
      this.logger.error('Error retrieving SiliconFlow API key from settings:', error);
      return null;
    }
  }

  /**
   * Get OpenAI API key from global settings
   * @returns {string|null} API key or null if not configured
   */
  _getOpenAIApiKey() {
    try {
      const db = this.api.getDatabase();
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('openai_api_key');
      
      if (row && row.value) {
        // Trim whitespace that might have been accidentally saved
        return row.value.trim();
      }
      
      return null;
    } catch (error) {
      this.logger.error('Error retrieving OpenAI API key from settings:', error);
      return null;
    }
  }

  /**
   * Get word count from text
   * @param {string} text - Text to count words in
   * @returns {number} Word count
   */
  _getWordCount(text) {
    return text.split(/\s+/).length;
  }
  
  /**
   * Speak text using the system TTS (LTTH TTS plugin)
   * Waits for actual TTS playback to complete
   * @param {string} text - Text to speak
   * @param {Object} options - TTS options
   * @returns {Promise<Object>} TTS result
   */
  async _speakThroughSystemTTS(text, options = {}) {
    try {
      const config = this._loadConfig();
      
      // Create promise that resolves when TTS playback ends
      const playbackEndPromise = new Promise((resolve, reject) => {
        // Set timeout to prevent hanging if TTS playback event is never received
        // Timeout value is configurable via TTS_PLAYBACK_TIMEOUT_MS (default: 60 seconds)
        // When timeout occurs, promise resolves with { timeout: true } flag
        const timeout = setTimeout(() => {
          this.ttsPlaybackResolvers.delete(this.TTS_USERNAME);
          const timeoutSeconds = this.TTS_PLAYBACK_TIMEOUT_MS / 1000;
          this.logger.warn(`TTS playback timeout (${timeoutSeconds}s) - continuing anyway`);
          resolve({ timeout: true });
        }, this.TTS_PLAYBACK_TIMEOUT_MS);
        
        // Store resolver for when tts:playback:ended event arrives
        // Event is emitted by LTTH TTS plugin when audio playback completes
        this.ttsPlaybackResolvers.set(this.TTS_USERNAME, (data) => {
          clearTimeout(timeout);
          resolve(data); // Resolve with event data (no timeout flag)
        });
      });
      
      // Build TTS request payload
      // Let the TTS plugin handle engine selection if not specified
      const requestPayload = {
        text: text,
        username: this.TTS_USERNAME, // Used for event matching
        userId: 'interactive-story',
        source: 'interactive-story'
      };
      
      // Add engine and voice if configured in interactive story settings
      // Otherwise, the TTS plugin will use its own defaults
      if (config.ttsEngine) {
        requestPayload.engine = config.ttsEngine;
      }
      
      if (config.ttsVoiceId) {
        requestPayload.voiceId = config.ttsVoiceId;
      } else if (config.ttsEngine) {
        // Use default voice for the specified engine
        requestPayload.voiceId = this._getDefaultVoiceForEngine(config.ttsEngine);
      }
      
      // Apply options overrides
      if (options.engine) {
        requestPayload.engine = options.engine;
      }
      if (options.voiceId) {
        requestPayload.voiceId = options.voiceId;
      }
      
      this.logger.debug(`TTS request:`, requestPayload);
      
      // Call the LTTH TTS plugin API
      const response = await axios.post('http://localhost:3000/api/tts/speak', requestPayload, {
        timeout: 30000
      });
      
      if (response.data && response.data.success) {
        this.logger.info(`TTS generation started (engine: ${requestPayload.engine || 'default'}, voice: ${requestPayload.voiceId || 'default'}) - waiting for playback to complete`);
        
        // Wait for actual playback to complete (via tts:playback:ended event)
        const playbackResult = await playbackEndPromise;
        
        // Check if playback timed out (timeout flag is set by promise resolver)
        if (playbackResult?.timeout === true) {
          this.logger.warn('TTS playback timed out but continuing story flow');
        } else if (playbackResult) {
          this.logger.info('TTS playback completed - continuing story flow');
        }
        
        return response.data;
      } else {
        // Clean up resolver on failure
        this.ttsPlaybackResolvers.delete(this.TTS_USERNAME);
        throw new Error('TTS generation failed: ' + (response.data.error || 'Unknown error'));
      }
    } catch (error) {
      // Clean up resolver on error
      this.ttsPlaybackResolvers.delete(this.TTS_USERNAME);
      this.logger.error(`System TTS error: ${error.message}`);
      
      // Don't throw - allow story to continue even if TTS fails
      // This prevents the entire story system from breaking due to TTS issues
      this.logger.warn('Continuing story without TTS due to error');
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get default voice ID for a given TTS engine
   * @param {string} engine - TTS engine name
   * @returns {string} Default voice ID
   */
  _getDefaultVoiceForEngine(engine) {
    const defaults = {
      'openai': 'alloy',
      'tiktok': 'en_us_001',
      'google': 'en-US-Neural2-C',
      'elevenlabs': 'default',
      'speechify': 'henry',
      'siliconflow': 'narrator',
      'fishaudio': 'narrator'
    };
    return defaults[engine] || 'alloy';
  }
  
  /**
   * Normalize voice ID for backward compatibility
   * Converts old OpenAI voice format (tts-1-alloy) to new format (alloy)
   * @param {string} voiceId - Voice ID to normalize
   * @returns {string} Normalized voice ID
   */
  _normalizeVoiceId(voiceId) {
    // Backward compatibility: convert old OpenAI format to new format
    // tts-1-alloy -> alloy, tts-1-hd-alloy -> alloy-hd
    if (voiceId && voiceId.startsWith('tts-1-')) {
      if (voiceId.startsWith('tts-1-hd-')) {
        return voiceId.replace('tts-1-hd-', '') + '-hd';
      }
      return voiceId.replace('tts-1-', '');
    }
    return voiceId;
  }

  /**
   * Generate TTS for a chapter if auto-TTS is enabled
   * Splits chapter into sentences and sends them progressively to overlay
   * @param {Object} chapter - Chapter object with title and content
   * @returns {Promise<void>}
   */
  async _generateChapterTTS(chapter) {
    try {
      const config = this._loadConfig();
      // Use configurable timing values
      const previewDelay = config.titlePreviewDelay || this.DEFAULT_TITLE_PREVIEW_DELAY_MS;
      const minTitleReadTime = config.minTitleReadTime || this.DEFAULT_MIN_TITLE_READ_TIME_MS;
      const contentStartBuffer = config.contentStartBuffer || this.DEFAULT_CONTENT_START_BUFFER_MS;
      
      // Check if TTS should be disabled
      // In manual mode, use manualModeTTS setting; otherwise use autoGenerateTTS
      const ttsEnabled = config.manualMode ? config.manualModeTTS : config.autoGenerateTTS;
      
      if (!ttsEnabled) {
        // TTS DISABLED: Self-reading mode
        this.logger.info(`📖 TTS disabled - entering self-reading mode for chapter ${chapter.chapterNumber}`);
        
        await this._wait(previewDelay);
        
        // Show title phase even without TTS for consistent overlay timing
        this.io.emit('story:chapter-title-phase', { 
          title: chapter.title,
          chapterNumber: chapter.chapterNumber
        });
        
        const titleReadMs = Math.max(
          (this._getWordCount(chapter.title) / this.READING_SPEED_WPS) * 1000,
          minTitleReadTime
        );
        await this._wait(titleReadMs);
        
        // Show the full chapter immediately for self-reading
        // Ensure chapter data is properly prepared
        const chapterForDisplay = this._prepareChapterForEmit(chapter);
        this.io.emit('story:chapter-display', { 
          mode: 'immediate',
          chapter: chapterForDisplay
        });
        
        // Calculate minimum reading time for viewer comprehension
        const wordCount = this._getWordCount(`${chapter.title} ${chapter.content}`);
        const readingTimeMs = Math.max((wordCount / this.READING_SPEED_WPS) * 1000, this.MIN_READING_TIME_MS);
        const readingTimeSeconds = Math.round(readingTimeMs / 1000);
        
        this.logger.info(`📖 Self-reading mode: waiting ${readingTimeSeconds}s for reading (${wordCount} words)`);
        
        // Wait for estimated reading time before signaling completion
        await this._wait(readingTimeMs);
        
        // Signal that "reading time" is complete (similar to TTS complete)
        this.io.emit('story:chapter-tts-complete', {
          chapterNumber: chapter.chapterNumber
        });
        
        this.logger.info(`📖 Self-reading complete for chapter ${chapter.chapterNumber}`);
        return;
      }

      // TTS ENABLED: Progressive sentence display synchronized with TTS
      const ttsProvider = config.ttsProvider || 'system';
      
      // Split content into sentences for progressive display
      const sentences = this._splitIntoSentences(chapter.content);
      const contentText = chapter.content;
      
      // Calculate realistic timing based on TTS speed for sentence display
      // Estimate based on typical TTS speaking rate (~2.5 words per second)
      const wordCount = this._getWordCount(contentText);
      const estimatedTTSDuration = (wordCount / 2.5) * 1000;
      
      this.logger.info(`🎙️ Starting chapter TTS: ${sentences.length} sentences, ${wordCount} words, ~${Math.round(estimatedTTSDuration/1000)}s estimated`);
      
      // STEP 1: Show image alone for preview
      this.logger.info(`🖼️ Showing title image for ${previewDelay/1000}s before narration`);
      await this._wait(previewDelay);
      
      // STEP 2: Show title phase with greyscale image
      this.io.emit('story:chapter-title-phase', {
        title: chapter.title,
        chapterNumber: chapter.chapterNumber
      });
      
      // STEP 3: Speak the title and wait for completion
      await this._speakThroughSystemTTS(chapter.title);
      this.logger.info(`🎙️ Chapter ${chapter.chapterNumber} title TTS completed`);
      
      await this._wait(contentStartBuffer);
      
      // STEP 4: Signal overlay that chapter content TTS is starting
      this.io.emit('story:chapter-tts-start', {
        title: chapter.title,
        chapterNumber: chapter.chapterNumber,
        totalSentences: sentences.length,
        estimatedDuration: estimatedTTSDuration
      });
      
      // STEP 5: Start TTS for content in parallel with sentence display
      // Calculate per-sentence timing based on word count for better sync
      const sentenceWordCounts = sentences.map(s => this._getWordCount(s));
      const totalWords = sentenceWordCounts.reduce((a, b) => a + b, 0);
      
      // Create TTS promise that we'll await at the end
      const ttsPromise = this._speakThroughSystemTTS(contentText).then(() => {
        this.logger.info(`🎙️ Chapter ${chapter.chapterNumber} content TTS completed`);
      }).catch(err => {
        this.logger.error(`🎙️ TTS playback error: ${err.message}`);
      });
      
      // STEP 6: Display sentences progressively, weighted by word count
      // This provides better sync as longer sentences get more time
      let accumulatedTime = 0;
      const baseDelay = Math.max(1200, estimatedTTSDuration / Math.max(sentences.length, 1));
      
      for (let i = 0; i < sentences.length; i++) {
        // Emit sentence to overlay
        this.io.emit('story:chapter-sentence', {
          sentence: sentences[i],
          index: i,
          total: sentences.length,
          chapterNumber: chapter.chapterNumber
        });
        
        // Calculate delay weighted by this sentence's word count
        if (i < sentences.length - 1) {
          const sentenceWeight = totalWords > 0 ? sentenceWordCounts[i] / totalWords : 1 / sentences.length;
          const sentenceDelay = Math.max(1000, estimatedTTSDuration * sentenceWeight);
          await this._wait(sentenceDelay);
          accumulatedTime += sentenceDelay;
        }
      }
      
      // STEP 7: Wait for TTS to ACTUALLY complete (if not already)
      await ttsPromise;
      
      // STEP 8: Signal that TTS is complete
      this.io.emit('story:chapter-tts-complete', {
        chapterNumber: chapter.chapterNumber
      });
      
      this.logger.info(`✅ Chapter ${chapter.chapterNumber} narration complete`);
      
    } catch (error) {
      // Don't fail chapter generation if TTS fails
      this.logger.error(`❌ Failed to generate TTS for chapter: ${error.message}`);
      
      // Fallback: Show full chapter immediately if TTS fails
      const chapterForDisplay = this._prepareChapterForEmit(chapter);
      this.io.emit('story:chapter-display', { 
        mode: 'immediate',
        chapter: chapterForDisplay
      });
      
      // Give reading time even on error
      const wordCount = this._getWordCount(`${chapter.title} ${chapter.content}`);
      const readingTimeMs = Math.max((wordCount / this.READING_SPEED_WPS) * 1000, this.MIN_READING_TIME_MS);
      await this._wait(readingTimeMs);
      
      // Signal completion
      this.io.emit('story:chapter-tts-complete', {
        chapterNumber: chapter.chapterNumber
      });
    }
  }
  
  /**
   * Wait for specified milliseconds
   * @param {number} ms - Milliseconds to wait
   * @returns {Promise<void>}
   */
  _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Prepare chapter data for socket emission
   * Ensures imagePath is just the filename for proper URL construction in overlay
   * @param {Object} chapter - Chapter object
   * @returns {Object} Chapter object prepared for emission
   */
  _prepareChapterForEmit(chapter) {
    const prepared = { ...chapter };
    
    // Extract just the filename from imagePath if it's a full path
    if (prepared.imagePath) {
      // Handle both forward and backslash path separators
      const pathParts = prepared.imagePath.split(/[/\\]/);
      prepared.imagePath = pathParts[pathParts.length - 1];
    }
    
    return prepared;
  }
  
  /**
   * Split text into sentences for progressive display
   * @param {string} text - Text to split
   * @returns {Array<string>} Array of sentences
   */
  _splitIntoSentences(text) {
    // Split on sentence endings but keep the punctuation
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.map(s => s.trim()).filter(s => s.length > 0);
  }

  /**
   * Generate TTS for voting choices if auto-TTS is enabled
   * @param {Array<string>} choices - Array of choice texts
   * @returns {Promise<void>}
   */
  async _generateChoicesTTS(choices) {
    try {
      const config = this._loadConfig();
      
      // Check if TTS should be disabled
      // In manual mode, use manualModeTTS setting; otherwise use autoGenerateTTS
      const ttsEnabled = config.manualMode ? config.manualModeTTS : config.autoGenerateTTS;
      
      if (!ttsEnabled) {
        // TTS disabled - small pause before voting to give users time to read choices on screen
        await this._wait(this.TTS_DISABLED_VOTING_BUFFER_MS);
        return;
      }

      const ttsProvider = config.ttsProvider || 'system';
      
      // Create choice text
      const choiceLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const choiceText = choices.map((choice, index) => 
        `Option ${choiceLetters[index]}: ${choice}`
      ).join('. ');
      
      const textToSpeak = `Voting time! ${choiceText}`;
      
      // Use LTTH TTS plugin for all TTS (supports all engines)
      // Waits for ACTUAL playback completion via tts:playback:ended event
      await this._speakThroughSystemTTS(textToSpeak);
      this.logger.info(`Choices TTS playback completed`);
    } catch (error) {
      // Don't fail voting if TTS fails
      this.logger.error(`Failed to generate TTS for choices: ${error.message}`);
    }
  }

  /**
   * Handle voting results and continue story automatically
   * @param {Object} results - Voting results from VotingSystem.end()
   * @returns {Promise<void>}
   */
  async _handleVoteResults(results) {
    if (!results || !this.currentSession || !this.currentChapter) {
      return;
    }

    // Store results for manual mode
    this.lastVoteResults = results;

    try {
      this.db.saveVote(
        this.currentSession.id,
        this.currentChapter.chapterNumber,
        results.winnerIndex,
        results.totalVotes
      );
    } catch (error) {
      this.logger.error(`Error saving vote results: ${error.message}`);
    }

    if (this.isGenerating) {
      this.logger.warn('Generation already in progress - skipping auto-continue');
      return;
    }

    // Check if manual mode is enabled
    const config = this._loadConfig();
    if (config.manualMode) {
      this.logger.info('Manual mode enabled - waiting for user to manually advance');
      // Don't auto-generate next chapter, wait for manual advance
      return;
    }

    // Auto-mode: continue to next chapter automatically
    try {
      await this._generateNextChapterFromChoice(results.winnerIndex ?? 0);
    } catch (error) {
      this._debugLog('error', `Error auto-generating next chapter after voting: ${error.message}`, {
        error: error.stack
      });
    }
  }

  /**
   * Generate next (or final) chapter based on winning choice
   * Shared between HTTP route and automatic voting continuation
   * @param {number} choiceIndex - Index of winning choice
   * @returns {Promise<{chapter: Object, isFinal: boolean}>}
   */
  async _generateNextChapterFromChoice(choiceIndex) {
    if (!this.currentSession || !this.storyEngine) {
      throw new Error('No active story session');
    }

    if (choiceIndex === undefined || choiceIndex < 0 || choiceIndex >= (this.currentChapter?.choices?.length || 0)) {
      throw new Error('Invalid choice index');
    }

    const previousChoice = this.currentChapter.choices[choiceIndex];

    this.isGenerating = true;
    this.io.emit('story:generation-started', {});

    const config = this._loadConfig();
    const chapterNumber = this.currentChapter.chapterNumber + 1;
    const maxChapters = config.maxChapters || 5;

    try {
      // Check if we've reached max chapters - if so, generate final chapter instead
      if (chapterNumber >= maxChapters) {
        this.logger.info(`Max chapters (${maxChapters}) reached, generating final chapter`);
        
        const finalChapter = await this.storyEngine.generateFinalChapter(
          chapterNumber,
          previousChoice,
          this.currentSession.model
        );

        // Generate image for final chapter
        if (config.autoGenerateImages && this.imageService) {
          try {
            const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
            const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(this.currentSession.theme) : '';
            const imagePrompt = `${finalChapter.title}: ${finalChapter.content.substring(0, 200)}`;
            
            this._debugLog('info', `🖼️ Starting image generation for FINAL chapter ${chapterNumber}`, { 
              provider: config.imageProvider,
              model: imageModel,
              promptLength: imagePrompt.length
            });
            
            finalChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
            
            this._debugLog('info', `✅ Image generated successfully for FINAL chapter ${chapterNumber}`, { 
              imagePath: finalChapter.imagePath,
              model: imageModel
            });
          } catch (imageError) {
            this._debugLog('error', `❌ Image generation failed for FINAL chapter ${chapterNumber}`, { 
              error: imageError.message,
              stack: imageError.stack,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data,
              provider: config.imageProvider,
              model: config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel
            });
            finalChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }

        // Save final chapter
        this.db.saveChapter(this.currentSession.id, finalChapter);
        this.currentChapter = finalChapter;

        this.isGenerating = false;

        // Show final chapter with TTS
        this.io.emit('story:chapter-ready', this._prepareChapterForEmit(finalChapter));
        
        // Read the final chapter (WAIT for completion)
        await this._generateChapterTTS(finalChapter);
        
        // No voting for final chapter - story is complete
        // Automatically end the session after a delay
        this.finalChapterEndPending = true;
        this.finalChapterEndTimer = setTimeout(() => {
          // Check if end is still pending (not cancelled externally)
          if (this.finalChapterEndPending) {
            try {
              if (this.currentSession) {
                this.db.updateSessionStatus(this.currentSession.id, 'completed');
                this.io.emit('story:ended', { message: 'Story completed!' });
                this.currentSession = null;
              }
            } catch (error) {
              this.logger.error(`Error in final chapter auto-end: ${error.message}`);
            } finally {
              this.finalChapterEndTimer = null;
              this.finalChapterEndPending = false;
            }
          }
        }, config.finalChapterDelay || this.FINAL_CHAPTER_DELAY_MS);

        return { chapter: finalChapter, isFinal: true };
      }

      // Generate next chapter (not final yet)
      const nextChapter = await this.storyEngine.generateChapter(
        chapterNumber,
        previousChoice,
        this.currentSession.model,
        config.numChoices
      );

      // Generate image
      if (config.autoGenerateImages && this.imageService) {
        try {
          const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
          const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(this.currentSession.theme) : '';
          const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
          
          this._debugLog('info', `🖼️ Starting image generation for chapter ${chapterNumber}`, { 
            provider: config.imageProvider,
            model: imageModel,
            promptLength: imagePrompt.length
          });
          
          nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
          
          this._debugLog('info', `✅ Image generated successfully for chapter ${chapterNumber}`, { 
            imagePath: nextChapter.imagePath,
            model: imageModel
          });
        } catch (imageError) {
          this._debugLog('error', `❌ Image generation failed for chapter ${chapterNumber}`, { 
            error: imageError.message,
            stack: imageError.stack,
            statusCode: imageError.response?.status,
            responseData: imageError.response?.data,
            provider: config.imageProvider,
            model: config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel
          });
          nextChapter.imagePath = null;
          this.io.emit('story:image-generation-failed', { 
            message: 'Image generation failed, but story continues',
            error: imageError.message 
          });
        }
      }

      // Save chapter
      this.db.saveChapter(this.currentSession.id, nextChapter);
      this.currentChapter = nextChapter;

      this.isGenerating = false;

      // IMPROVED FLOW: Progressive sentence-by-sentence display synchronized with TTS
      // 1. Emit chapter data to clients (overlay prepares but doesn't show yet)
      this.io.emit('story:chapter-ready', this._prepareChapterForEmit(nextChapter));
      
      // 2. Start TTS which will progressively send sentences to overlay (WAIT for completion)
      await this._generateChapterTTS(nextChapter);
      
      // 3. Read the voting choices (WAIT for it to complete)
      try {
        await this._generateChoicesTTS(nextChapter.choices);
      } catch (error) {
        this.logger.error(`Choices TTS error (chapter ${nextChapter.chapterNumber}): ${error.message}`);
        // Continue anyway - voting can start even if choices TTS fails
      }
      
      // 4. NOW start voting (after chapter narration is complete)
      this.votingSystem.start(nextChapter.choices, {
        votingDuration: config.votingDuration,
        minVotes: config.minVotes,
        useMinSwing: config.useMinSwing,
        swingThreshold: config.swingThreshold,
        voteKeywordPattern: config.voteKeywordPattern || '!letter',
        caseSensitive: config.caseSensitiveVoting || false,
        onVoteEnded: (voteResults) => this._handleVoteResults(voteResults)
      });

      return { chapter: nextChapter, isFinal: false };
    } catch (error) {
      this.isGenerating = false;
      
      // Emit error to UI for user feedback
      this.io.emit('story:generation-failed', { 
        error: error.message,
        statusCode: error.response?.status,
        isTimeout: error.response?.status === 504 || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
      });
      
      // Log detailed error information
      this.logger.error(`❌ Chapter generation failed: ${error.message}`);
      if (error.response?.status === 504) {
        this.logger.error('⏱️ API Gateway Timeout - Story generation interrupted');
        this.logger.error('   You can manually end the story using the "End Story" button');
      }
      
      throw error;
    }
  }

  /**
   * Load plugin configuration
   */
  _loadConfig() {
    const defaultConfig = {
      // Provider selection
      llmProvider: 'openai', // 'openai' or 'siliconflow'
      imageProvider: 'openai', // 'openai' or 'siliconflow'
      ttsProvider: 'system', // Always 'system' (uses LTTH TTS plugin with all engines)
      
      // OpenAI models
      openaiModel: 'gpt-5.2',
      openaiImageModel: 'gpt-image-1',
      
      // SiliconFlow models (legacy)
      defaultModel: 'deepseek',
      defaultImageModel: 'flux-schnell',
      
      // Voting settings
      votingDuration: 60,
      minVotes: 5,
      useMinSwing: false,
      swingThreshold: 10,
      numChoices: 3, // Default to 3 choices for TikTok (quick engagement)
      
      // Generation settings
      autoGenerateImages: true,
      autoGenerateTTS: true, // Enable TTS by default
      storyLanguage: 'German', // Language for story generation
      
      // Mode settings
      manualMode: false, // Manual mode: user manually advances each round
      manualModeTTS: true, // Use TTS in manual mode
      
      // TTS settings
      ttsEngine: 'openai', // TTS engine: 'openai', 'tiktok', 'google', 'elevenlabs', 'speechify', 'siliconflow', 'fishspeech'
      ttsVoiceMapping: {
        narrator: 'narrator',
        default: 'narrator'
      },
      ttsVoiceId: 'alloy', // Voice ID for selected engine
      
      // Timing configuration (in milliseconds)
      titlePreviewDelay: 5000, // How long to show title image alone before narration (default: 5 seconds)
      minTitleReadTime: 3000, // Minimum time to display title overlay (default: 3 seconds)
      contentStartBuffer: 500, // Buffer between title TTS and content TTS (default: 0.5 seconds)
      
      // Overlay customization
      overlayOrientation: 'landscape', // 'landscape' or 'portrait'
      overlayResolution: '1920x1080', // Common resolutions
      overlayDisplayMode: 'scroll', // 'full' (entire chapter), 'sentence' (sentence-by-sentence), or 'scroll' (Star Wars-style)
      overlayFontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif',
      overlayFontSize: 1.3, // em units
      overlayTitleFontSize: 2.5, // em units
      overlayTextColor: '#ffffff',
      overlayTitleColor: '#e94560',
      overlayVotingColor: '#e94560', // Color for voting highlights
      generatingAnimationMode: 'default',
      generatingAnimationUrl: '',
      overlayBackgroundGradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.95) 100%)',
      
      // Display duration settings (in milliseconds)
      votingResultsDuration: 5000, // How long to show voting results before continuing (default: 5s)
      chapterTransitionDelay: 1000, // Pause between chapters (default: 1s)
      finalChapterDelay: 5000, // Delay before auto-ending after final chapter (default: 5s)
      
      // System settings
      offlineMode: false,
      debugLogging: false,
      apiLogging: false,
      llmTimeout: 120000, // 120 seconds timeout for LLM API calls
      llmMaxRetries: 3, // Maximum retry attempts for failed API calls
      llmRetryDelay: 2000 // Initial retry delay in milliseconds
    };

    const savedConfig = this.api.getConfig('story-config');
    const config = { ...defaultConfig, ...savedConfig };
    
    // Backward compatibility: migrate 'siliconflow' ttsProvider to 'system'
    if (config.ttsProvider === 'siliconflow') {
      this.logger.info('Migrating ttsProvider from "siliconflow" to "system" (backward compatibility)');
      config.ttsProvider = 'system';
      // If ttsEngine is not set, default to siliconflow to maintain behavior
      if (!config.ttsEngine || config.ttsEngine === 'openai') {
        config.ttsEngine = 'siliconflow';
      }
      // Save migrated config
      this._saveConfig(config);
    }
    
    return config;
  }

  /**
   * Save plugin configuration
   */
  _saveConfig(config) {
    this.api.setConfig('story-config', config);
  }

  /**
   * Extract filename from imagePath (handles both Windows and Unix paths)
   * @param {string} imagePath - Full file path (can include Windows backslashes or Unix forward slashes)
   * @returns {string|null} - Just the filename, or null if imagePath is empty/null
   */
  _extractFilename(imagePath) {
    if (!imagePath) return null;
    // Use path.basename to handle both Windows (\) and Unix (/) separators
    return path.basename(imagePath);
  }

  /**
   * Prepare chapter data for emission (extracts filename from imagePath)
   * @param {Object} chapter - Chapter object with possible full imagePath
   * @returns {Object|null} - Chapter with filename-only imagePath, or null if chapter is empty
   */
  _prepareChapterForEmit(chapter) {
    if (!chapter) return null;
    
    const prepared = { ...chapter };
    if (prepared.imagePath) {
      prepared.imagePath = this._extractFilename(prepared.imagePath);
    }
    return prepared;
  }

  /**
   * Register API routes
   */
  _registerRoutes() {
    // Serve UI HTML
    this.api.registerRoute('get', '/interactive-story/ui', (req, res) => {
      res.sendFile(path.join(__dirname, 'ui.html'));
    });

    // Serve overlay HTML
    this.api.registerRoute('get', '/interactive-story/overlay', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay.html'));
    });

    // Get plugin status
    this.api.registerRoute('get', '/api/interactive-story/status', (req, res) => {
      const config = this._loadConfig();
      res.json({
        configured: !!this.llmService,
        session: this.currentSession,
        chapter: this.currentChapter,
        voting: this.votingSystem ? this.votingSystem.getStatus() : null,
        isGenerating: this.isGenerating,
        config: {
          maxChapters: config.maxChapters || 5,
          voteKeywordPattern: config.voteKeywordPattern || '!letter'
        }
      });
    });

    // Get configuration
    this.api.registerRoute('get', '/api/interactive-story/config', (req, res) => {
      const config = this._loadConfig();
      // Don't send API key to client
      const safeConfig = { ...config };
      if (safeConfig.siliconFlowApiKey) {
        safeConfig.siliconFlowApiKey = '***configured***';
      }
      res.json(safeConfig);
    });

    // Save configuration
    this.api.registerRoute('post', '/api/interactive-story/config', (req, res) => {
      try {
        const config = req.body;
        this._saveConfig(config);
        
        // Reinitialize services if API key changed or if timeout settings changed
        if (config.siliconFlowApiKey && config.siliconFlowApiKey !== '***configured***') {
          const debugCallback = (level, message, data) => this._debugLog(level, message, data);
          const llmOptions = {
            timeout: config.llmTimeout || 120000,
            maxRetries: config.llmMaxRetries || 3,
            retryDelay: config.llmRetryDelay || 2000
          };
          this.llmService = new LLMService(config.siliconFlowApiKey, this.logger, debugCallback, llmOptions);
          this.imageService = new ImageService(config.siliconFlowApiKey, this.logger, this.imageCacheDir);
          // Note: TTS service removed - now using LTTH TTS plugin for all TTS operations
          this.storyEngine = new StoryEngine(this.llmService, this.logger, {
            language: config.storyLanguage || 'German',
            platform: 'tiktok'
          });
        } else if (!this.storyEngine) {
          // If services not initialized, check for API key in database
          const apiKey = this._getSiliconFlowApiKey();
          if (apiKey) {
            const debugCallback = (level, message, data) => this._debugLog(level, message, data);
            const llmOptions = {
              timeout: config.llmTimeout || 120000,
              maxRetries: config.llmMaxRetries || 3,
              retryDelay: config.llmRetryDelay || 2000
            };
            this.llmService = new LLMService(apiKey, this.logger, debugCallback, llmOptions);
            this.imageService = new ImageService(apiKey, this.logger, this.imageCacheDir);
            // Note: TTS service removed - now using LTTH TTS plugin for all TTS operations
            this.storyEngine = new StoryEngine(this.llmService, this.logger, {
              language: config.storyLanguage || 'German',
              platform: 'tiktok'
            });
            this._debugLog('info', '✅ SiliconFlow services initialized from database API key', { 
              apiKeyConfigured: true
            });
          }
        } else {
          // Update existing services when only settings change (not API key)
          // Update timeout settings in existing LLM service
          if (this.llmService) {
            if (config.llmTimeout) this.llmService.timeout = config.llmTimeout;
            if (config.llmMaxRetries) this.llmService.maxRetries = config.llmMaxRetries;
            if (config.llmRetryDelay) this.llmService.retryDelay = config.llmRetryDelay;
            this._debugLog('info', '✅ LLM service settings updated', {
              timeout: this.llmService.timeout,
              maxRetries: this.llmService.maxRetries,
              retryDelay: this.llmService.retryDelay
            });
          }
          
          // Update story engine language if it changed
          if (this.storyEngine && config.storyLanguage) {
            this.storyEngine.updateConfig({ language: config.storyLanguage });
            this._debugLog('info', '✅ Story language updated', {
              language: config.storyLanguage
            });
          }
        }
        
        // Emit configuration update to overlay for real-time styling updates
        this.io.emit('story:config-updated', {
          overlayOrientation: config.overlayOrientation,
          overlayResolution: config.overlayResolution,
          overlayDisplayMode: config.overlayDisplayMode,
          overlayFontFamily: config.overlayFontFamily,
          overlayFontSize: config.overlayFontSize,
          overlayTitleFontSize: config.overlayTitleFontSize,
          overlayTextColor: config.overlayTextColor,
          overlayTitleColor: config.overlayTitleColor,
          overlayVotingColor: config.overlayVotingColor,
          overlayBackgroundGradient: config.overlayBackgroundGradient,
          generatingAnimationMode: config.generatingAnimationMode,
          generatingAnimationUrl: config.generatingAnimationUrl
        });

        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error saving config: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Get overlay positions
    this.api.registerRoute('get', '/api/interactive-story/overlay-positions', (req, res) => {
      try {
        const positions = this.api.getConfig('overlay_positions');
        if (!positions) {
          res.json({ positions: {} });
        } else {
          res.json(positions);
        }
      } catch (error) {
        this.logger.error(`Error loading overlay positions: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Save overlay positions
    this.api.registerRoute('post', '/api/interactive-story/overlay-positions', (req, res) => {
      try {
        const positions = req.body;
        this.api.setConfig('overlay_positions', positions);
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error saving overlay positions: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Start new story
    this.api.registerRoute('post', '/api/interactive-story/start', async (req, res) => {
      try {
        if (!this.storyEngine) {
          this._debugLog('error', 'Services not configured - missing API key', null);
          return res.status(400).json({ error: 'Services not configured. Please add SiliconFlow API key in Settings → TTS API Keys' });
        }
        const config = this._loadConfig();
        if (!this.llmService) {
          const llmProvider = config.llmProvider || 'openai';
          const providerName = llmProvider === 'openai' ? 'OpenAI' : 'SiliconFlow';
          this._debugLog('error', `${providerName} LLM service not configured - missing API key`, null);
          return res.status(400).json({ error: `${providerName} API key not configured. Please add it in Settings.` });
        }

        const { theme, outline, model } = req.body;
        
        this._debugLog('info', `🚀 Starting new story`, { 
          theme, 
          model, 
          hasOutline: !!outline,
          apiKeyConfigured: !!this._getSiliconFlowApiKey()
        });
        
        this.isGenerating = true;
        this.io.emit('story:generation-started', { theme });

        // Initialize story
        this._debugLog('info', `📡 Calling LLM API to generate first chapter...`, { theme, model });
        const firstChapter = await this.storyEngine.initializeStory(theme, outline, model);
        
        this._debugLog('info', `✅ First chapter generated successfully`, { 
          title: firstChapter.title, 
          choiceCount: firstChapter.choices.length,
          contentLength: firstChapter.content.length
        });

        // Create session in database
        // Use provider-appropriate default model if not specified
        const defaultModel = config.llmProvider === 'openai' ? config.openaiModel : config.defaultModel;
        const sessionModel = model || defaultModel;
        
        const sessionId = this.db.createSession({
          theme,
          outline: this.storyEngine.getMemory().memory.outline,
          model: sessionModel,
          metadata: { startedBy: 'manual' }
        });

        this.currentSession = { id: sessionId, theme, model: sessionModel };
        
        this._debugLog('info', `Session created`, { sessionId, theme });

        // Generate image if enabled
        if (config.autoGenerateImages && this.imageService) {
          try {
            const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
            const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(theme) : '';
            
            // For first chapter, create enhanced prompt showing protagonist(s) and theme
            const memory = this.storyEngine.getMemory().memory;
            let imagePrompt = '';
            
            // Safely extract protagonist information from memory
            // memory.characters is a Map (from story-memory.js)
            if (memory.characters instanceof Map && memory.characters.size > 0) {
              // Extract protagonist information from memory (Map structure)
              const protagonists = Array.from(memory.characters.values())
                .filter(char => char.status === 'active')
                .slice(0, 2) // Max 2 protagonists in first image
                .map(char => char.description || char.name)
                .join(' and ');
              
              imagePrompt = `${protagonists} in ${firstChapter.title}, ${firstChapter.content.substring(0, 150)}`;
            } else {
              // Fallback if no characters extracted yet
              imagePrompt = `Protagonist in ${firstChapter.title}, ${firstChapter.content.substring(0, 200)}`;
            }
            
            this._debugLog('info', `🖼️ Starting FIRST CHAPTER image generation (showing protagonists and theme)`, { 
              provider: config.imageProvider,
              model: imageModel,
              promptLength: imagePrompt.length,
              theme,
              characterCount: (memory.characters instanceof Map) ? memory.characters.size : 0
            });
            
            firstChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
            
            this._debugLog('info', `✅ Image generated successfully`, { 
              imagePath: firstChapter.imagePath,
              model: imageModel
            });
          } catch (imageError) {
            this._debugLog('error', `❌ Image generation failed`, { 
              error: imageError.message,
              stack: imageError.stack,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data,
              provider: config.imageProvider,
              model: config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel
            });
            firstChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }

        // Save chapter
        this.db.saveChapter(sessionId, firstChapter);
        this.currentChapter = firstChapter;

        this.isGenerating = false;

        // IMPROVED FLOW: Progressive sentence-by-sentence display synchronized with TTS
        // 1. Emit chapter data to clients (overlay prepares but doesn't show yet)
        this.io.emit('story:chapter-ready', this._prepareChapterForEmit(firstChapter));
        
        // 2. Start TTS which will progressively send sentences to overlay (WAIT for completion)
        await this._generateChapterTTS(firstChapter);
        
        // 3. Read the voting choices (WAIT for it to complete)
        try {
          await this._generateChoicesTTS(firstChapter.choices);
        } catch (error) {
          this.logger.error(`Choices TTS error (chapter ${firstChapter.chapterNumber}): ${error.message}`);
          // Continue anyway - voting can start even if choices TTS fails
        }
        
        // 4. NOW start voting (after chapter narration is complete)
        this.votingSystem.start(firstChapter.choices, {
          votingDuration: config.votingDuration,
          minVotes: config.minVotes,
          useMinSwing: config.useMinSwing,
          swingThreshold: config.swingThreshold,
          voteKeywordPattern: config.voteKeywordPattern || '!letter',
          caseSensitive: config.caseSensitiveVoting || false,
          onVoteEnded: (voteResults) => this._handleVoteResults(voteResults)
        });

        res.json({ success: true, chapter: firstChapter, sessionId });
      } catch (error) {
        this.isGenerating = false;
        this._debugLog('error', `❌ Error starting story: ${error.message}`, { 
          error: error.message,
          stack: error.stack,
          statusCode: error.response?.status,
          responseData: error.response?.data
        });
        this.logger.error(`Error starting story: ${error.message}`, error);
        res.status(500).json({ error: error.message });
      }
    });

    // Generate next chapter
    this.api.registerRoute('post', '/api/interactive-story/next-chapter', async (req, res) => {
      try {
        if (!this.currentSession || !this.storyEngine) {
          return res.status(400).json({ error: 'No active story session' });
        }

        const { choiceIndex } = req.body;
        const result = await this._generateNextChapterFromChoice(choiceIndex);
        res.json({ success: true, chapter: result.chapter, isFinal: result.isFinal });
      } catch (error) {
        this.isGenerating = false;
        if (error.message === 'Invalid choice index') {
          return res.status(400).json({ error: error.message });
        }
        this.logger.error(`Error generating chapter: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Generate final chapter (ending)
    this.api.registerRoute('post', '/api/interactive-story/final-chapter', async (req, res) => {
      try {
        if (!this.currentSession || !this.storyEngine) {
          return res.status(400).json({ error: 'No active story session' });
        }

        const { choiceIndex } = req.body;
        const previousChoice = this.currentChapter.choices[choiceIndex];

        this.isGenerating = true;
        this.io.emit('story:generation-started', {});

        const config = this._loadConfig();
        const chapterNumber = this.currentChapter.chapterNumber + 1;

        // Generate final chapter (no choices)
        const finalChapter = await this.storyEngine.generateFinalChapter(
          chapterNumber,
          previousChoice,
          this.currentSession.model
        );

        // Generate image
        if (config.autoGenerateImages && this.imageService) {
          try {
            const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
            const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(this.currentSession.theme) : '';
            const imagePrompt = `${finalChapter.title}: ${finalChapter.content.substring(0, 200)}`;
            
            this._debugLog('info', `🖼️ Starting image generation for FINAL chapter ${chapterNumber}`, { 
              provider: config.imageProvider,
              model: imageModel,
              promptLength: imagePrompt.length
            });
            
            finalChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
            
            this._debugLog('info', `✅ Image generated successfully for FINAL chapter ${chapterNumber}`, { 
              imagePath: finalChapter.imagePath,
              model: imageModel
            });
          } catch (imageError) {
            this._debugLog('error', `❌ Image generation failed for FINAL chapter ${chapterNumber}`, { 
              error: imageError.message,
              stack: imageError.stack,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data,
              provider: config.imageProvider,
              model: config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel
            });
            finalChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }

        // Save final chapter
        this.db.saveChapter(this.currentSession.id, finalChapter);
        this.currentChapter = finalChapter;

        this.isGenerating = false;

        // Show final chapter with TTS
        this.io.emit('story:chapter-ready', this._prepareChapterForEmit(finalChapter));
        
        // Read the final chapter (WAIT for completion)
        await this._generateChapterTTS(finalChapter);
        
        // No voting for final chapter - story is complete
        // Automatically end the session after a delay
        this.finalChapterEndPending = true;
        this.finalChapterEndTimer = setTimeout(() => {
          // Check if end is still pending (not cancelled externally)
          if (this.finalChapterEndPending) {
            try {
              if (this.currentSession) {
                this.db.updateSessionStatus(this.currentSession.id, 'completed');
                this.io.emit('story:ended', { message: 'Story completed!' });
                this.currentSession = null;
              }
            } catch (error) {
              this.logger.error(`Error in final chapter auto-end: ${error.message}`);
            } finally {
              this.finalChapterEndTimer = null;
              this.finalChapterEndPending = false;
            }
          }
        }, config.finalChapterDelay || this.FINAL_CHAPTER_DELAY_MS);

        res.json({ success: true, chapter: finalChapter, isFinal: true });
      } catch (error) {
        this.isGenerating = false;
        this.logger.error(`Error generating final chapter: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // End story
    this.api.registerRoute('post', '/api/interactive-story/end', (req, res) => {
      try {
        // Clear any pending final chapter timer
        if (this.finalChapterEndTimer) {
          clearTimeout(this.finalChapterEndTimer);
          this.finalChapterEndTimer = null;
        }
        this.finalChapterEndPending = false;
        
        // Stop any ongoing generation
        this.isGenerating = false;
        
        // Clear current state
        this.currentChapter = null;
        
        if (this.currentSession) {
          this.db.updateSessionStatus(this.currentSession.id, 'completed');
          this.currentSession = null;
        }
        
        if (this.votingSystem && this.votingSystem.isActive()) {
          this.votingSystem.stop();
        }

        if (this.storyEngine) {
          this.storyEngine.reset();
        }

        this.io.emit('story:ended', {});
        res.json({ success: true });
      } catch (error) {
        this.logger.error(`Error ending story: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Get random themes for selection
    this.api.registerRoute('get', '/api/interactive-story/random-themes', (req, res) => {
      try {
        if (!this.storyEngine) {
          return res.status(503).json({ error: 'Story engine not initialized' });
        }
        
        const count = parseInt(req.query.count) || 5;
        const themes = this.storyEngine.getRandomThemes(count);
        
        this._debugLog('info', `🎲 Generated ${themes.length} random themes`, {
          themes: themes.map(t => t.name)
        });
        
        res.json({ themes });
      } catch (error) {
        this.logger.error(`Error getting random themes: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available themes
    this.api.registerRoute('get', '/api/interactive-story/themes', (req, res) => {
      if (!this.storyEngine) {
        return res.status(400).json({ error: 'Services not configured' });
      }
      res.json(this.storyEngine.getThemes());
    });

    // Get story memory
    this.api.registerRoute('get', '/api/interactive-story/memory', (req, res) => {
      if (!this.storyEngine) {
        return res.status(400).json({ error: 'No active story' });
      }
      res.json(this.storyEngine.getMemory().getFullMemory());
    });

    // Get session history
    this.api.registerRoute('get', '/api/interactive-story/sessions', (req, res) => {
      const sessions = this.db.getAllSessions(50);
      res.json(sessions);
    });

    // Get session details
    this.api.registerRoute('get', '/api/interactive-story/session/:id', (req, res) => {
      const sessionId = parseInt(req.params.id);
      const session = this.db.getSession(sessionId);
      const chapters = this.db.getSessionChapters(sessionId);
      const topVoters = this.db.getTopVoters(sessionId, 10);
      
      res.json({ session, chapters, topVoters });
    });

    // Get top voters for current session
    this.api.registerRoute('get', '/api/interactive-story/top-voters', (req, res) => {
      if (!this.currentSession) {
        return res.json([]);
      }
      const topVoters = this.db.getTopVoters(this.currentSession.id, 10);
      res.json(topVoters);
    });

    // Serve cached images
    this.api.registerRoute('get', '/api/interactive-story/image/:filename', (req, res) => {
      const imagePath = path.join(this.imageCacheDir, req.params.filename);
      if (fs.existsSync(imagePath)) {
        res.sendFile(imagePath);
      } else {
        res.status(404).json({ error: 'Image not found' });
      }
    });
    
    // Get debug logs (for offline testing)
    this.api.registerRoute('get', '/api/interactive-story/debug-logs', (req, res) => {
      res.json({ logs: this.debugLogs });
    });
    
    // Validate API key
    this.api.registerRoute('post', '/api/interactive-story/validate-api-key', async (req, res) => {
      try {
        const config = this._loadConfig();
        const provider = req.body?.provider || config.llmProvider || 'openai';
        
        let apiKey;
        let providerName;
        let testModel;
        let apiUrl;
        
        // Determine which provider to test
        if (provider === 'openai') {
          apiKey = this._getOpenAIApiKey();
          providerName = 'OpenAI';
          testModel = 'gpt-3.5-turbo';
          apiUrl = 'https://api.openai.com/v1/chat/completions';
        } else {
          apiKey = this._getSiliconFlowApiKey();
          providerName = 'SiliconFlow';
          testModel = 'meta-llama/Meta-Llama-3.1-8B-Instruct';
          apiUrl = 'https://api.siliconflow.com/v1/chat/completions';
        }
        
        if (!apiKey) {
          const settingsPath = provider === 'openai' 
            ? 'Settings → OpenAI API Configuration'
            : 'Settings → TTS API Keys → SiliconFlow API Key';
          
          return res.json({
            valid: false,
            error: `No ${providerName} API key configured`,
            message: `Please configure API key in ${settingsPath}`,
            configured: false,
            provider: providerName
          });
        }
        
        // Log validation attempt
        this._debugLog('info', `🔍 Validating ${providerName} API key...`, {
          provider: providerName,
          keyLength: apiKey.length,
          keyPrefix: apiKey.substring(0, 6) + '...'
        });
        
        // Test API key with a minimal request
        try {
          const response = await axios.post(
            apiUrl,
            {
              model: testModel,
              messages: [{ role: 'user', content: 'test' }],
              max_tokens: 5,
              temperature: 0.1
            },
            {
              headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            }
          );
          
          this._debugLog('info', `✅ ${providerName} API key validation successful`, {
            statusCode: response.status
          });
          
          res.json({
            valid: true,
            configured: true,
            provider: providerName,
            message: `${providerName} API key is valid and working!`,
            details: {
              keyLength: apiKey.length,
              keyPrefix: apiKey.substring(0, 6) + '...',
              testedModel: testModel
            }
          });
        } catch (error) {
          const statusCode = error.response?.status || 0;
          const responseData = error.response?.data || error.message;
          
          this._debugLog('error', `❌ ${providerName} API key validation failed`, {
            statusCode,
            error: responseData,
            keyLength: apiKey.length,
            keyPrefix: apiKey.substring(0, 6) + '...'
          });
          
          let message = 'API key validation failed';
          let troubleshooting = [];
          
          if (statusCode === 401) {
            message = 'API key is invalid or not authorized';
            const dashboardUrl = provider === 'openai' 
              ? 'https://platform.openai.com/api-keys'
              : 'https://cloud.siliconflow.com/';
            
            troubleshooting = [
              `Check that the API key is correct and active on ${dashboardUrl}`,
              'Make sure you copied the entire API key without extra spaces',
              'Verify the API key hasn\'t expired',
              `Check that you have credits/quota available on ${providerName}`,
              `Try generating a new API key on ${providerName} dashboard`
            ];
          } else if (statusCode === 429) {
            message = 'Rate limit exceeded or quota exhausted';
            troubleshooting = [
              `Check your API usage quota on ${providerName} dashboard`,
              'Wait a few minutes and try again',
              'Consider upgrading your plan if needed'
            ];
          } else if (statusCode === 0) {
            message = `Network error - cannot reach ${providerName} API`;
            const apiDomain = provider === 'openai' ? 'api.openai.com' : 'api.siliconflow.com';
            troubleshooting = [
              'Check your internet connection',
              `Verify that ${apiDomain} is accessible`,
              'Check firewall/proxy settings'
            ];
          }
          
          res.json({
            valid: false,
            configured: true,
            provider: providerName,
            error: String(responseData),
            message,
            troubleshooting,
            details: {
              statusCode,
              keyLength: apiKey.length,
              keyPrefix: apiKey.substring(0, 6) + '...',
              hasWhitespace: apiKey !== apiKey.trim()
            }
          });
        }
      } catch (error) {
        this.logger.error('Error validating API key:', error);
        res.status(500).json({
          valid: false,
          error: error.message
        });
      }
    });
    
    // Admin manual choice selection (offline mode)
    this.api.registerRoute('post', '/api/interactive-story/admin-choice', async (req, res) => {
      try {
        const config = this._loadConfig();
        
        if (!config.offlineMode) {
          return res.status(403).json({ error: 'Offline mode not enabled' });
        }
        
        if (!this.currentSession || !this.storyEngine) {
          return res.status(400).json({ error: 'No active story session' });
        }
        
        const { choiceIndex } = req.body;
        
        if (choiceIndex === undefined || choiceIndex < 0 || choiceIndex >= this.currentChapter.choices.length) {
          return res.status(400).json({ error: 'Invalid choice index' });
        }
        
        this._debugLog('info', `Admin selected choice ${choiceIndex} in offline mode`, { choice: this.currentChapter.choices[choiceIndex] });
        
        const previousChoice = this.currentChapter.choices[choiceIndex];
        
        this.isGenerating = true;
        this.io.emit('story:generation-started', {});
        
        const chapterNumber = this.currentChapter.chapterNumber + 1;
        const maxChapters = config.maxChapters || 5;
        
        // Check if we've reached max chapters - if so, generate final chapter instead
        if (chapterNumber >= maxChapters) {
          this.logger.info(`Max chapters (${maxChapters}) reached in offline mode, generating final chapter`);
          
          // Generate final chapter (no choices)
          const finalChapter = await this.storyEngine.generateFinalChapter(
            chapterNumber,
            previousChoice,
            this.currentSession.model
          );
          
          // Generate image
          if (config.autoGenerateImages && this.imageService) {
            try {
              const imageModel = config.imageProvider === 'openai' ? config.openaiImageModel : config.defaultImageModel;
              const style = this.imageService.getStyleForTheme ? this.imageService.getStyleForTheme(this.currentSession.theme) : '';
              const imagePrompt = `${finalChapter.title}: ${finalChapter.content.substring(0, 200)}`;
              finalChapter.imagePath = await this.imageService.generateImage(imagePrompt, imageModel, style);
            } catch (imageError) {
              this._debugLog('warn', `⚠️ Image generation failed, continuing without image`, { 
                error: imageError.message,
                statusCode: imageError.response?.status,
                responseData: imageError.response?.data
              });
              finalChapter.imagePath = null;
              this.io.emit('story:image-generation-failed', { 
                message: 'Image generation failed, but story continues',
                error: imageError.message 
              });
            }
          }
          
          // Save final chapter
          this.db.saveChapter(this.currentSession.id, finalChapter);
          this.db.saveVote(this.currentSession.id, this.currentChapter.chapterNumber, choiceIndex, 1);
          this.currentChapter = finalChapter;
          
          this.isGenerating = false;
          
          // Emit chapter
          this.io.emit('story:chapter-ready', this._prepareChapterForEmit(finalChapter));
          
          // Read the chapter (WAIT for it to complete)
          await this._generateChapterTTS(finalChapter);
          
          // Automatically end the session after a delay
          this.finalChapterEndPending = true;
          this.finalChapterEndTimer = setTimeout(() => {
            if (this.finalChapterEndPending) {
              try {
                if (this.currentSession) {
                  this.db.updateSessionStatus(this.currentSession.id, 'completed');
                  this.io.emit('story:ended', { message: 'Story completed!' });
                  this.currentSession = null;
                }
              } catch (error) {
                this.logger.error(`Error in final chapter auto-end: ${error.message}`);
              } finally {
                this.finalChapterEndTimer = null;
                this.finalChapterEndPending = false;
              }
            }
          }, config.finalChapterDelay || this.FINAL_CHAPTER_DELAY_MS);
          
          this._debugLog('info', `Final chapter generated (max chapters reached)`, { chapterNumber, title: finalChapter.title });
          
          return res.json({ success: true, chapter: finalChapter, isFinal: true });
        }
        
        // Generate next chapter (not final yet)
        const nextChapter = await this.storyEngine.generateChapter(
          chapterNumber,
          previousChoice,
          this.currentSession.model,
          config.numChoices
        );
        
        // Generate image
        if (config.autoGenerateImages && this.imageService) {
          try {
            const style = this.imageService.getStyleForTheme(this.currentSession.theme);
            const imagePrompt = `${nextChapter.title}: ${nextChapter.content.substring(0, 200)}`;
            nextChapter.imagePath = await this.imageService.generateImage(imagePrompt, config.defaultImageModel, style);
          } catch (imageError) {
            this._debugLog('warn', `⚠️ Image generation failed, continuing without image`, { 
              error: imageError.message,
              statusCode: imageError.response?.status,
              responseData: imageError.response?.data
            });
            nextChapter.imagePath = null;
            this.io.emit('story:image-generation-failed', { 
              message: 'Image generation failed, but story continues',
              error: imageError.message 
            });
          }
        }
        
        // Save chapter with admin choice
        this.db.saveChapter(this.currentSession.id, nextChapter);
        this.db.saveVote(this.currentSession.id, this.currentChapter.chapterNumber, choiceIndex, 1);
        this.currentChapter = nextChapter;
        
        this.isGenerating = false;
        
        // Emit chapter
        this.io.emit('story:chapter-ready', this._prepareChapterForEmit(nextChapter));
        
        // NEW FLOW: TTS first (for admin choice path - no voting after)
        // Read the chapter (WAIT for it to complete)
        await this._generateChapterTTS(nextChapter);
        
        this._debugLog('info', `Next chapter generated`, { chapterNumber, title: nextChapter.title });
        
        res.json({ success: true, chapter: nextChapter });
      } catch (error) {
        this.isGenerating = false;
        this._debugLog('error', `Error in admin choice: ${error.message}`, { error: error.stack });
        this.logger.error(`Error in admin choice: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Manual mode advance (user manually triggers next round)
    this.api.registerRoute('post', '/api/interactive-story/manual-advance', async (req, res) => {
      try {
        const config = this._loadConfig();
        
        if (!config.manualMode) {
          return res.status(403).json({ error: 'Manual mode is not enabled. Please enable manual mode in the configuration settings.' });
        }
        
        if (!this.currentSession || !this.storyEngine) {
          return res.status(400).json({ error: 'No active story session' });
        }
        
        // Check if voting is complete
        if (this.votingSystem && this.votingSystem.isActive()) {
          return res.status(400).json({ error: 'Voting is still active. Wait for voting to end naturally or use the "Force Vote End" button.' });
        }
        
        // Get the winning choice from the last voting results
        // In manual mode, voting should have completed before this is called
        // Use != null to catch both null and undefined, but allow 0 (which is a valid index)
        if (!this.lastVoteResults || this.lastVoteResults.winnerIndex == null) {
          return res.status(400).json({ error: 'No voting results available. Start or complete voting first.' });
        }
        
        this._debugLog('info', `Manual advance triggered`, { winnerIndex: this.lastVoteResults.winnerIndex });
        
        // Generate next chapter directly (don't call _handleVoteResults to avoid recursion)
        await this._generateNextChapterFromChoice(this.lastVoteResults.winnerIndex);
        
        res.json({ success: true, message: 'Advancing to next round' });
      } catch (error) {
        this.logger.error(`Error in manual advance: ${error.message}`);
        res.status(500).json({ error: error.message });
      }
    });
  }

  /**
   * Register Socket.io event handlers
   */
  _registerSocketHandlers() {
    // Listen for TTS playback ended events
    // Note: registerSocket callback receives (socket, data) where socket is the client socket
    this.api.registerSocket('tts:playback:ended', (socket, data) => {
      this.logger.debug(`TTS playback ended event received:`, data);
      
      // Check if we have a resolver waiting for this (match by username)
      if (data && this.ttsPlaybackResolvers.has(data.username)) {
        const resolve = this.ttsPlaybackResolvers.get(data.username);
        this.ttsPlaybackResolvers.delete(data.username);
        resolve(data);
      }
    });
    
    this.api.registerSocket('story:force-vote-end', async (socket) => {
      if (this.votingSystem && this.votingSystem.isActive()) {
        const results = this.votingSystem.end();
        await this._handleVoteResults(results);
      }
    });

    this.api.registerSocket('story:regenerate-image', async (socket, data) => {
      if (!this.currentChapter || !this.imageService) {
        return;
      }

      try {
        const config = this._loadConfig();
        const style = this.imageService.getStyleForTheme(this.currentSession.theme);
        const imagePrompt = (data && data.customPrompt) || `${this.currentChapter.title}: ${this.currentChapter.content.substring(0, 200)}`;
        
        const imagePath = await this.imageService.generateImage(
          imagePrompt,
          config.defaultImageModel,
          style
        );

        this.currentChapter.imagePath = imagePath;
        this.io.emit('story:image-updated', { imagePath: this._extractFilename(imagePath) });
      } catch (error) {
        this.logger.error(`Error regenerating image: ${error.message}`);
      }
    });
  }

  /**
   * Register TikTok event handlers
   */
  _registerTikTokHandlers() {
    // Listen for chat messages to process votes
    this.api.registerTikTokEvent('chat', (data) => {
      if (!this.votingSystem || !this.votingSystem.isActive()) {
        return;
      }

      // Normalize chat text (some connectors send `message`, others `comment`)
      const message = (data.comment || data.message || '').trim();
      if (!message) {
        return;
      }
      
      // Quick filter: Skip obviously non-vote messages (longer than 15 chars, multi-line, or starts with common non-vote patterns)
      if (message.length > 15 || message.includes('\n') || message.startsWith('@') || message.startsWith('#')) {
        return;
      }
      
      // Try to process as vote - voting system will handle pattern matching
      const accepted = this.votingSystem.processVote(
        data.uniqueId,
        data.nickname,
        message
      );

      if (accepted && this.currentSession) {
        this.db.updateViewerStats(
          this.currentSession.id,
          data.uniqueId,
          data.nickname
        );
      }
    });
  }

  async destroy() {
    this.api.log('Interactive Story Plugin shutting down...', 'info');

    // Stop any active voting
    if (this.votingSystem && this.votingSystem.isActive()) {
      this.votingSystem.stop();
    }

    // Save memory if there's an active session
    if (this.currentSession && this.storyEngine) {
      const memory = this.storyEngine.getMemory().getFullMemory();
      this.db.saveMemory(this.currentSession.id, memory);
    }

    this.api.log('Interactive Story Plugin destroyed', 'info');
  }
}

module.exports = InteractiveStoryPlugin;
