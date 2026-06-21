/**
 * Animation Controller
 * Manages sprite animation synchronized with TTS audio playback
 */

class AnimationController {
  constructor(io, logger, config, obsWebSocket = null) {
    this.io = io;
    this.logger = logger;
    this.config = config;
    this.obsWebSocket = obsWebSocket;
    
    // Active animations tracking
    this.activeAnimations = new Map();
    
    // Animation queue for concurrent TTS events
    this.animationQueue = [];
    
    // Timeout tracking for cleanup
    this.animationTimeouts = [];
    
    // Animation state machine states
    this.STATES = {
      IDLE: 'idle',
      SPEAKING: 'speaking',
      FADING_OUT: 'fading_out'
    };
  }

  /**
   * Start avatar animation for TTS event
   * @param {string} userId - TikTok user ID
   * @param {string} username - TikTok username
   * @param {object} sprites - Sprite paths
   * @param {number} audioDuration - Duration of TTS audio in milliseconds
   */
  async startAnimation(userId, username, sprites, audioDuration) {
    try {
      // Check if animation already active for this user - queue instead of skip
      if (this.activeAnimations.has(userId)) {
        this.logger.info(`TalkingHeads: Animation already active for ${username}, adding to queue`);
        this.animationQueue.push({ userId, username, sprites, audioDuration });
        return;
      }

      this.logger.info(`TalkingHeads: Starting animation for ${username} (${audioDuration}ms)`);

      // Create animation state
      const animationState = {
        userId,
        username,
        sprites,
        state: this.STATES.IDLE,
        startTime: Date.now(),
        audioDuration,
        blinkTimer: null,
        speakTimer: null,
        endTimer: null
      };

      this.activeAnimations.set(userId, animationState);

      // Emit initial animation start to overlay
      const relativeSprites = this._getRelativePaths(sprites);
      this.io.emit('talkingheads:animation:start', {
        userId,
        username,
        sprites: relativeSprites,
        fadeInDuration: this.config.fadeInDuration || 300
      });
      
      this.logger.info(`TalkingHeads: Emitting animation:start for ${username}`, { 
        userId, 
        spriteCount: Object.keys(relativeSprites).length 
      });

      // Setup OBS scene if enabled
      if (this.config.obsEnabled && this.obsWebSocket) {
        await this._setupOBSScene(userId, username, sprites);
      }

      // Start idle animation with blinking
      this._startIdleAnimation(userId);

      // Wait for fade-in, then start speaking animation
      const fadeInTimeout = setTimeout(() => {
        this._startSpeakingAnimation(userId, audioDuration);
      }, this.config.fadeInDuration || 300);
      this._trackTimeout(fadeInTimeout);

    } catch (error) {
      this.logger.error(`TalkingHeads: Failed to start animation for ${username}`, error);
      this.activeAnimations.delete(userId);
    }
  }

  /**
   * Start idle animation with periodic blinking
   * @param {string} userId - User ID
   * @private
   */
  _startIdleAnimation(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    animation.state = this.STATES.IDLE;

    // Emit idle frame
    this.io.emit('talkingheads:animation:frame', {
      userId,
      frame: 'idle_neutral'
    });

    // Setup periodic blinking
    const blinkInterval = this.config.blinkInterval || 3000;
    animation.blinkTimer = setInterval(() => {
      if (animation.state === this.STATES.IDLE) {
        this._performBlink(userId);
      }
    }, blinkInterval);
  }

  /**
   * Perform blink animation
   * @param {string} userId - User ID
   * @private
   */
  _performBlink(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    // Show blink frame
    this.io.emit('talkingheads:animation:frame', {
      userId,
      frame: 'blink'
    });

    // Return to idle after 150ms
    const blinkTimeout = setTimeout(() => {
      if (this.activeAnimations.has(userId)) {
        this.io.emit('talkingheads:animation:frame', {
          userId,
          frame: 'idle_neutral'
        });
      }
    }, 150);
    this._trackTimeout(blinkTimeout);
  }

  /**
   * Start speaking animation synchronized with audio
   * @param {string} userId - User ID
   * @param {number} duration - Audio duration in milliseconds
   * @private
   */
  _startSpeakingAnimation(userId, duration) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) {
      this.logger.warn(`TalkingHeads: Cannot start speaking animation - no animation found for ${userId}`);
      return;
    }

    this.logger.info(`TalkingHeads: Starting speaking animation for ${animation.username} (duration: ${duration}ms)`);
    animation.state = this.STATES.SPEAKING;

    // Stop blinking during speech
    if (animation.blinkTimer) {
      clearInterval(animation.blinkTimer);
      animation.blinkTimer = null;
    }

    // Cycle through speaking frames with dynamic duration
    const speakFrames = ['speak_closed', 'speak_mid', 'speak_open', 'speak_mid'];
    let frameIndex = 0;
    
    // Calculate dynamic frame duration based on audio length
    // Each cycle is 4 frames, so calculate cycles and frame duration
    const totalCycles = Math.max(1, Math.floor(duration / 600)); // 4 frames = 1 cycle (minimum 600ms per cycle)
    const calculatedFrameDuration = duration / (totalCycles * speakFrames.length);
    
    // Apply min/max boundaries (100ms - 200ms per frame)
    const frameDuration = Math.max(100, Math.min(200, calculatedFrameDuration));

    this.logger.info(`TalkingHeads: Dynamic frame duration: ${frameDuration.toFixed(1)}ms for ${duration}ms audio (${totalCycles} cycles)`);
    
    animation.speakTimer = setInterval(() => {
      if (animation.state === this.STATES.SPEAKING) {
        this.io.emit('talkingheads:animation:frame', {
          userId,
          frame: speakFrames[frameIndex]
        });

        frameIndex = (frameIndex + 1) % speakFrames.length;
      }
    }, frameDuration);

    // Schedule end of animation
    animation.endTimer = setTimeout(() => {
      this._endAnimation(userId);
    }, duration);
    this._trackTimeout(animation.endTimer);
  }

  /**
   * End animation and fade out
   * @param {string} userId - User ID
   * @private
   */
  _endAnimation(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    this.logger.info(`TalkingHeads: Ending animation for ${animation.username}`);

    animation.state = this.STATES.FADING_OUT;

    // Clear timers
    if (animation.blinkTimer) {
      clearInterval(animation.blinkTimer);
    }
    if (animation.speakTimer) {
      clearInterval(animation.speakTimer);
    }
    if (animation.endTimer) {
      clearTimeout(animation.endTimer);
    }

    // Return to idle before fading out
    this.io.emit('talkingheads:animation:frame', {
      userId,
      frame: 'idle_neutral'
    });

    // Fade out after brief pause
    const fadeTimeout = setTimeout(() => {
      this.io.emit('talkingheads:animation:end', {
        userId,
        fadeOutDuration: this.config.fadeOutDuration || 300
      });

      // Cleanup OBS scene
      if (this.config.obsEnabled && this.obsWebSocket) {
        this._cleanupOBSScene(userId);
      }

      // Remove from active animations
      const cleanupTimeout = setTimeout(() => {
        this.activeAnimations.delete(userId);
        
        // Process next item in queue for this user
        this._processQueue(userId);
      }, this.config.fadeOutDuration || 300);
      this._trackTimeout(cleanupTimeout);

    }, 200);
    this._trackTimeout(fadeTimeout);
  }

  /**
   * Stop animation immediately
   * @param {string} userId - User ID
   */
  stopAnimation(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    this.logger.info(`TalkingHeads: Stopping animation for ${animation.username}`);

    // Clear all timers
    if (animation.blinkTimer) clearInterval(animation.blinkTimer);
    if (animation.speakTimer) clearInterval(animation.speakTimer);
    if (animation.endTimer) clearTimeout(animation.endTimer);

    // Emit stop event
    this.io.emit('talkingheads:animation:stop', { userId });

    // Cleanup
    this.activeAnimations.delete(userId);
  }

  /**
   * Setup OBS scene for avatar display
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {object} sprites - Sprite paths
   * @private
   */
  async _setupOBSScene(userId, username, sprites) {
    try {
      // This would integrate with OBS WebSocket to create/show sources
      // Implementation depends on OBS WebSocket v5 API
      this.logger.info(`TalkingHeads: OBS scene setup for ${username}`);
      
      // TODO: Implement OBS WebSocket integration
      // - Create browser source for avatar overlay
      // - Position and size the source
      // - Set visibility to true
      
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to setup OBS scene', error);
    }
  }

  /**
   * Cleanup OBS scene after animation
   * @param {string} userId - User ID
   * @private
   */
  async _cleanupOBSScene(userId) {
    try {
      this.logger.info(`TalkingHeads: OBS scene cleanup for user ${userId}`);
      
      // TODO: Implement OBS WebSocket cleanup
      // - Hide or remove browser source
      
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to cleanup OBS scene', error);
    }
  }

  /**
   * Convert absolute sprite paths to relative URLs for web overlay
   * @param {object} sprites - Sprite paths object
   * @returns {object} Sprite URLs object
   * @private
   */
  _getRelativePaths(sprites) {
    const relativeSprites = {};

    for (const [key, value] of Object.entries(sprites)) {
      if (value) {
        // Handle both forward and backslashes (Windows/Linux)
        const filename = value.split(/[\\/]/).pop();
        // Sanitize filename: only allow alphanumeric, underscore, dash, and dot
        const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        relativeSprites[key] = `/api/talkingheads/sprite/${encodeURIComponent(safeFilename)}`;
      }
    }

    return relativeSprites;
  }

  /**
   * Get active animations count
   * @returns {number} Number of active animations
   */
  getActiveCount() {
    return this.activeAnimations.size;
  }

  /**
   * Get all active animations
   * @returns {Array} Array of active animation info
   */
  getActiveAnimations() {
    const animations = [];
    
    for (const [userId, animation] of this.activeAnimations) {
      animations.push({
        userId,
        username: animation.username,
        state: animation.state,
        duration: Date.now() - animation.startTime
      });
    }
    
    return animations;
  }

  /**
   * Stop all animations
   */
  stopAllAnimations() {
    for (const userId of this.activeAnimations.keys()) {
      this.stopAnimation(userId);
    }
  }
  
  /**
   * Process next animation in queue for a specific user
   * @param {string} userId - User ID
   * @private
   */
  _processQueue(userId) {
    // Find next queued animation for this user
    const queueIndex = this.animationQueue.findIndex(item => item.userId === userId);
    
    if (queueIndex !== -1) {
      const nextAnimation = this.animationQueue.splice(queueIndex, 1)[0];
      this.logger.info(`TalkingHeads: Processing queued animation for ${nextAnimation.username} (${this.animationQueue.length} remaining in queue)`);
      
      // Start the queued animation
      this.startAnimation(
        nextAnimation.userId,
        nextAnimation.username,
        nextAnimation.sprites,
        nextAnimation.audioDuration
      );
    }
  }
  
  /**
   * Track a timeout ID for cleanup
   * @param {number} timeoutId - setTimeout or setInterval ID
   * @private
   */
  _trackTimeout(timeoutId) {
    this.animationTimeouts.push(timeoutId);
    // Prevent unbounded growth during long streaming sessions.
    // Keep only the 20 most recent IDs: earlier timeouts have already fired
    // (typical animation uses ~5 timeouts; 100 covers ~20 queued animations).
    if (this.animationTimeouts.length > 100) {
      this.animationTimeouts = this.animationTimeouts.slice(-20);
    }
  }
  
  /**
   * Clear all tracked timeouts
   */
  clearAllTimeouts() {
    this.logger.info(`TalkingHeads: Clearing ${this.animationTimeouts.length} tracked timeouts`);
    
    this.animationTimeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (err) {
        // Ignore errors for already cleared timeouts
      }
    });
    
    this.animationTimeouts = [];
    
    // Clear animation queue
    const queueLength = this.animationQueue.length;
    this.animationQueue = [];
    
    if (queueLength > 0) {
      this.logger.info(`TalkingHeads: Cleared ${queueLength} queued animations`);
    }
  }
}

module.exports = AnimationController;
