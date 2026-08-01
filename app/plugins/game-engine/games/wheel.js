/**
 * Glücksrad (Wheel of Fortune) Game Logic
 * 
 * Spin-to-win game where viewers trigger spins via gifts or chat commands.
 * Supports multiple wheels with individual configurations and triggers.
 */

const UnifiedQueueManager = require('../backend/unified-queue');

// Constants
const CLEANUP_INTERVAL_MS = 30000; // 30 seconds
const MAX_SPIN_AGE_MS = 120000; // 2 minutes
const MIN_SPIN_ROTATIONS = 5; // Minimum full rotations
const SPIN_ROTATION_VARIANCE = 3; // Random additional rotations (0 to this value)
const LANDING_ZONE_START = 0.1; // Where in the segment to start landing (10% from edge)
const LANDING_ZONE_SIZE = 0.8; // Size of safe landing zone (80% of segment)
const SHOCK_MIN_INTENSITY = 1; // Minimum shock intensity
const SHOCK_MAX_INTENSITY = 100; // Maximum shock intensity
const SHOCK_MIN_DURATION = 300; // Minimum shock duration (ms)
const SHOCK_MAX_DURATION = 30000; // Maximum shock duration (ms)
const SHOCK_DISPLAY_DELAY_MS = 500; // Delay before triggering shock to ensure result is visible first
const OPENSHOCK_BATCH_CLEANUP_THRESHOLD = 50; // Minimum batches before triggering cleanup
const SPIN_SAFETY_TIMEOUT_BUFFER = 10000; // 10 seconds buffer for spin safety timeout

class WheelGame {
  constructor(api, db, logger) {
    this.api = api;
    this.db = db;
    this.logger = this._normalizeLogger(logger);
    this.io = this._getSocketIO();
    // Standalone instances use the same queue abstraction. The main plugin
    // replaces this with its shared queue during initialization.
    this.unifiedQueue = new UnifiedQueueManager(this.logger, this.io);
    this.unifiedQueue.setWheelGame(this);
    
    // Track active spins in-flight
    this.activeSpins = new Map(); // spinId -> { username, nickname, timestamp, status, wheelId }
    
    // Is a spin currently in progress?
    this.isSpinning = false;
    
    // Current active spin
    this.currentSpin = null;
    
    // Spin ID counter
    this.spinIdCounter = 0;
    
    // OpenShock batch deduplication tracking
    // Prevents duplicate multi-device commands within a time window
    // Key format: "username:deviceIds:type:intensity:duration"
    this.openshockBatches = new Map(); // batchKey -> timestamp
    this.openshockBatchWindow = 5000; // 5 second window for batch deduplication
    
    // Server-side spin safety timeout (independent of overlay response)
    this.spinSafetyTimeout = null;
    
    // Cleanup timer
    this.cleanupTimer = null;

    // Keep every Wheel-owned timeout cancellable during plugin teardown.
    this.pendingTimers = new Set();
    this.finalizingSpins = new Set();
    this.destroyed = false;
  }

  _normalizeLogger(logger) {
    const fallback = (level) => (message) => {
      if (typeof this.api?.log === 'function') {
        this.api.log(message, level);
      }
    };

    return {
      info: typeof logger?.info === 'function' ? logger.info.bind(logger) : fallback('info'),
      warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : fallback('warn'),
      error: typeof logger?.error === 'function' ? logger.error.bind(logger) : fallback('error'),
      debug: typeof logger?.debug === 'function' ? logger.debug.bind(logger) : fallback('debug')
    };
  }

  _getSocketIO() {
    if (typeof this.api?.getSocketIO === 'function') {
      return this.api.getSocketIO() || { emit: () => {}, on: () => {} };
    }
    return { emit: () => {}, on: () => {} };
  }

  _scheduleTimer(callback, delayMs) {
    let timer = null;
    timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      if (this.destroyed) return;

      try {
        const result = callback();
        if (result && typeof result.catch === 'function') {
          result.catch(error => this.logger.error(`Wheel timer callback failed: ${error.message}`));
        }
      } catch (error) {
        this.logger.error(`Wheel timer callback failed: ${error.message}`);
      }
    }, delayMs);
    this.pendingTimers.add(timer);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    return timer;
  }

  _clearTimer(timer) {
    if (!timer) return;
    clearTimeout(timer);
    this.pendingTimers.delete(timer);
  }

  _clearSpinSafetyTimeout() {
    if (!this.spinSafetyTimeout) return;
    this._clearTimer(this.spinSafetyTimeout);
    this.spinSafetyTimeout = null;
  }

  _clearScheduledTimers() {
    for (const timer of this.pendingTimers) {
      clearTimeout(timer);
    }
    this.pendingTimers.clear();
    this.spinSafetyTimeout = null;
  }

  /**
   * Initialize Wheel game
   */
  init() {
    this.logger.info('🎡 Glücksrad game initialized (multi-wheel support enabled)');
  }

  /**
   * Set unified queue manager
   */
  setUnifiedQueue(unifiedQueue) {
    this.unifiedQueue = unifiedQueue;
  }

  /**
   * Get all wheels
   * @returns {Array} List of all wheel configurations
   */
  getAllWheels() {
    return this.db.getAllWheels();
  }

  /**
   * Get Wheel configuration by ID
   * @param {number} wheelId - Wheel ID (optional, defaults to first wheel)
   */
  getConfig(wheelId = null) {
    return this.db.getWheelConfig(wheelId);
  }

  /**
   * Create a new wheel
   * @param {string} name - Name of the wheel
   * @param {Array} segments - Initial segments (optional)
   * @param {Object} settings - Initial settings (optional)
   * @returns {number} New wheel ID
   */
  createWheel(name, segments = null, settings = null) {
    const defaultSegments = segments || [
      { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
      { text: '200 XP', color: '#FFA500', weight: 8, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
      { text: '500 XP', color: '#FFD700', weight: 5, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
      { text: 'Shoutout!', color: '#4CAF50', weight: 4, isNiete: false, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] },
      { text: 'Niete', color: '#607D8B', weight: 15, isNiete: true, isShock: false, shockIntensity: 0, shockDuration: 0, shockType: 'shock', shockDevices: [] }
    ];
    
    const defaultSettings = settings || {
      spinDuration: 5000,
      soundEnabled: true,
      soundVolume: 0.7,
      showQueue: true,
      winnerDisplayDuration: 5,
      nieteText: 'Leider kein Gewinn!',
      infoScreenEnabled: false,
      infoScreenText: 'Um deinen Gewinn abzuholen, besuche discord.gg/deinserver',
      infoScreenDuration: 5,
      displayTexts: {
        titleText:   '🎡 GLÜCKSRAD',
        labelSpin:   '🔄 Dreht sich...',
        labelResult: '🎉 Ergebnis:',
        labelNiete:  '💔 Niete!',
        labelWin:    '🎊 Gewonnen!',
        labelQueued: '⏳ In der Warteschlange...',
      }
    };
    
    const wheelId = this.db.createWheel(name, defaultSegments, defaultSettings);
    this.logger.info(`🎡 Created new wheel: ${name} (ID: ${wheelId})`);
    
    return wheelId;
  }

  /**
   * Update Wheel configuration
   * @param {number} wheelId - Wheel ID
   * @param {Array} segments - Wheel segments
   * @param {Object} settings - Wheel settings
   */
  updateConfig(wheelId, segments, settings) {
    // Validate segments before updating
    if (!segments || !Array.isArray(segments)) {
      this.logger.error(`Failed to update config: segments is not an array (wheelId: ${wheelId})`);
      throw new Error('Segments must be an array');
    }
    
    if (segments.length === 0) {
      this.logger.error(`Failed to update config: segments array is empty (wheelId: ${wheelId})`);
      throw new Error('Segments array cannot be empty');
    }
    
    // Validate each segment has required properties
    const invalidSegments = segments.filter(seg => 
      !seg.text || typeof seg.color !== 'string' || typeof seg.weight !== 'number'
    );
    
    if (invalidSegments.length > 0) {
      this.logger.error(`Failed to update config: ${invalidSegments.length} segments have invalid properties (wheelId: ${wheelId})`);
      throw new Error(`${invalidSegments.length} segments have invalid properties`);
    }
    
    this.db.updateWheelConfig(wheelId, segments, settings);
    
    // Get fresh config to ensure consistency
    const updatedConfig = this.getConfig(wheelId);
    
    if (!updatedConfig) {
      this.logger.error(`Failed to retrieve updated config after save (wheelId: ${wheelId})`);
      return;
    }
    
    // Emit config update to overlays with validated, complete data
    this.io.emit('wheel:config-updated', {
      wheelId,
      segments: updatedConfig.segments,
      settings: updatedConfig.settings,
      wheelName: updatedConfig.name,
      numSegments: updatedConfig.segments.length,
      timestamp: Date.now()
    });
    
    this.logger.info(`✅ Glücksrad configuration updated: ${updatedConfig.segments.length} segments (Wheel ID: ${wheelId}, Name: "${updatedConfig.name}")`);
  }

  /**
   * Update wheel name
   */
  updateWheelName(wheelId, name) {
    this.db.updateWheelName(wheelId, name);
    this.logger.info(`✅ Wheel name updated: ${name} (ID: ${wheelId})`);
  }

  /**
   * Update wheel chat command
   */
  updateWheelChatCommand(wheelId, chatCommand) {
    this.db.updateWheelChatCommand(wheelId, chatCommand);
    this.logger.info(`✅ Wheel chat command updated: ${chatCommand || 'disabled'} (ID: ${wheelId})`);
  }

  /**
   * Update wheel enabled status
   */
  updateWheelEnabled(wheelId, enabled) {
    this.db.updateWheelEnabled(wheelId, enabled);
    this.logger.info(`✅ Wheel ${enabled ? 'enabled' : 'disabled'} (ID: ${wheelId})`);
  }

  /**
   * Delete a wheel
   */
  deleteWheel(wheelId) {
    const result = this.db.deleteWheel(wheelId);
    if (result) {
      this.logger.info(`✅ Wheel deleted (ID: ${wheelId})`);
    }
    return result;
  }

  /**
   * Find wheel by gift trigger
   * @param {string} giftIdentifier - Gift name or ID
   * @returns {Object|null} Wheel config if found
   */
  findWheelByGiftTrigger(giftIdentifier) {
    return this.db.findWheelByGiftTrigger(giftIdentifier);
  }

  /**
   * Find wheel by chat command
   * @param {string} command - Chat command
   * @returns {Object|null} Wheel config if found
   */
  findWheelByChatCommand(command) {
    return this.db.findWheelByChatCommand(command);
  }

  /**
   * Trigger a wheel spin (from gift or command)
   * @param {string} username - Username
   * @param {string} nickname - Nickname
   * @param {string} profilePictureUrl - Profile picture URL
   * @param {string} giftName - Gift name or trigger source
   * @param {number} wheelId - Wheel ID (optional, defaults to first wheel)
   * @returns {Object} { success: boolean, spinId?: string, queued?: boolean, position?: number, error?: string }
   */
  async triggerSpin(username, nickname, profilePictureUrl, giftName, wheelId = null) {
    // Get wheel config
    const config = this.getConfig(wheelId);
    if (!config) {
      this.logger.error(`Failed to trigger spin: Wheel not found (wheelId: ${wheelId})`);
      return { success: false, error: 'Wheel not found' };
    }
    
    if (!config.enabled) {
      this.logger.debug(`Failed to trigger spin: Wheel is disabled (wheelId: ${config.id})`);
      return { success: false, error: 'Wheel is disabled' };
    }
    
    // Validate segments exist and are properly configured
    if (!config.segments || !Array.isArray(config.segments) || config.segments.length === 0) {
      this.logger.error(`Failed to trigger spin: Wheel has no segments (wheelId: ${config.id})`);
      return { success: false, error: 'Wheel has no segments configured' };
    }
    
    // Validate all segments have required properties
    const invalidSegments = config.segments.filter(seg => 
      !seg.text || typeof seg.color !== 'string' || typeof seg.weight !== 'number'
    );
    if (invalidSegments.length > 0) {
      this.logger.error(`Failed to trigger spin: Wheel has invalid segments (wheelId: ${config.id}, invalid count: ${invalidSegments.length})`);
      return { success: false, error: 'Wheel has invalid segments' };
    }
    
    const actualWheelId = config.id;
    
    // Generate unique spin ID
    const spinId = `spin_${Date.now()}_${this.spinIdCounter++}`;
    
    const spinData = {
      spinId,
      username,
      nickname,
      profilePictureUrl: profilePictureUrl || '',
      giftName: giftName || '',
      timestamp: Date.now(),
      status: 'pending',
      wheelId: actualWheelId,
      wheelName: config.name,
      // Store segment count at time of trigger for validation
      segmentCount: config.segments.length
    };

    // Store spin data
    this.activeSpins.set(spinId, spinData);

    // All spins go through the shared queue. A Wheel instance without the queue
    // is not a usable runtime configuration.
    if (this.unifiedQueue) {
      // Determine if this spin will start immediately by checking state BEFORE queueing.
      // JavaScript is single-threaded, so no race condition between check and queueWheel().
      // If queue is empty and not processing, queueWheel() will trigger processNext()
      // which will start processing THIS item immediately.
      const willStartImmediately = !this.unifiedQueue.isProcessing && this.unifiedQueue.queue.length === 0;
      
      const queueResult = this.unifiedQueue.queueWheel(spinData);
      
      // Check if queue was full
      if (!queueResult.queued && queueResult.error) {
        this.logger.warn(`🎡 Wheel queue full, cannot queue spin for ${username} on "${config.name}"`);
        this.activeSpins.delete(spinId); // Clean up active spin
        return { 
          success: false, 
          error: queueResult.error, 
          wheelId: actualWheelId, 
          wheelName: config.name 
        };
      }
      
      const startResult = willStartImmediately
        ? await this.unifiedQueue.processNext()
        : null;

      if (willStartImmediately && (!startResult || !startResult.success)) {
        this.activeSpins.delete(spinId);
        return { success: false, error: startResult?.error || 'Failed to start wheel spin' };
      }

      this.logger.info(`🎡 Wheel spin ${willStartImmediately ? 'starting' : 'queued'} via unified queue: ${username} on "${config.name}" (spinId: ${spinId}, position: ${queueResult.position}, segments: ${config.segments.length})`);
      
      return { 
        success: true, 
        spinId, 
        queued: !willStartImmediately,
        position: queueResult.position, 
        wheelId: actualWheelId, 
        wheelName: config.name,
        ...(startResult?.winningSegment && { winningSegment: startResult.winningSegment })
      };
    }
    this.activeSpins.delete(spinId);
    return { success: false, error: 'Unified queue unavailable' };
  }

  /**
   * Start a wheel spin
   */
  async startSpin(spinData) {
    const { spinId, username, nickname, profilePictureUrl, giftName, wheelId, wheelName, segmentCount } = spinData;
    
    // Prevent race condition: if already spinning a different spin, reject
    if (this.isSpinning && this.currentSpin?.spinId !== spinData.spinId) {
      this.logger.warn(`Cannot start spin ${spinId}: already spinning ${this.currentSpin.spinId}`);
      return { success: false, error: 'Already spinning' };
    }
    
    this.isSpinning = true;
    this.currentSpin = spinData;
    
    // Update status
    spinData.status = 'spinning';
    this.activeSpins.set(spinId, spinData);

    // Get config for the specific wheel - ALWAYS fetch fresh config
    const config = this.getConfig(wheelId);
    
    // Comprehensive config validation
    if (!config) {
      this.logger.error(`Failed to start spin: Wheel config not found (wheelId: ${wheelId}, spinId: ${spinId})`);
      this._cleanupSpinState(spinId, 'config_not_found');
      return { success: false, error: 'Wheel not found' };
    }
    
    if (!config.segments || !Array.isArray(config.segments)) {
      this.logger.error(`Failed to start spin: Wheel segments is not an array (wheelId: ${wheelId}, spinId: ${spinId})`);
      this._cleanupSpinState(spinId, 'segments_invalid');
      return { success: false, error: 'Wheel segments invalid' };
    }
    
    if (config.segments.length === 0) {
      this.logger.error(`Failed to start spin: Wheel has no segments (wheelId: ${wheelId}, spinId: ${spinId})`);
      this._cleanupSpinState(spinId, 'no_segments');
      return { success: false, error: 'Wheel not configured' };
    }
    
    // CRITICAL: Validate segment count hasn't changed since spin was queued
    // If segment count changed, the rotation calculation would be completely wrong
    if (segmentCount && segmentCount !== config.segments.length) {
      this.logger.error(`❌ Segment count changed during queue: was ${segmentCount}, now ${config.segments.length}. Cannot proceed with spin (wheelId: ${wheelId}, spinId: ${spinId})`);
      this._cleanupSpinState(spinId, 'segment_count_changed');
      
      // Emit error event
      this.io.emit('wheel:spin-error', {
        spinId,
        username: spinData.username,
        nickname: spinData.nickname,
        error: 'Segment count changed',
        messageKey: 'plugins.game-engine.runtime.wheel.segment_count_changed',
        messageParams: {
          previousCount: segmentCount,
          currentCount: config.segments.length
        },
        wheelId,
        wheelName: config.name
      });
      
      return { success: false, error: 'Segment count changed during queue' };
    }

    // Calculate winning segment based on weights
    const winningSegmentIndex = this.calculateWinningSegment(config.segments);
    
    // Validate winning segment index
    if (winningSegmentIndex < 0 || winningSegmentIndex >= config.segments.length) {
      this.logger.error(`Invalid winning segment index ${winningSegmentIndex} (total segments: ${config.segments.length}, wheelId: ${wheelId}, spinId: ${spinId})`);
      this._cleanupSpinState(spinId, 'invalid_segment_index');
      return { success: false, error: 'Invalid segment calculation' };
    }
    
    const winningSegment = config.segments[winningSegmentIndex];
    
    // Validate winning segment has required properties
    if (!winningSegment || !winningSegment.text) {
      this.logger.error(`Winning segment has no text (index: ${winningSegmentIndex}, wheelId: ${wheelId}, spinId: ${spinId})`);
      this._cleanupSpinState(spinId, 'invalid_winning_segment');
      return { success: false, error: 'Invalid winning segment' };
    }
    
    // ============================================================================
    // WHEEL LANDING CALCULATION - CRITICAL SYNCHRONIZATION LOGIC
    // ============================================================================
    // This calculation determines where the wheel will land after spinning.
    // It MUST remain synchronized with the client-side landing reconstruction
    // in overlay/wheel.html::calculateLandingSegment()
    //
    // COORDINATE SYSTEM ASSUMPTIONS (must match client exactly):
    // - Segment 0 starts at 0° (top/12 o'clock position where pointer is located)
    // - Segments increase clockwise: segment i spans from (i * segmentAngle) to ((i+1) * segmentAngle)
    // - The pointer is fixed at 0° (top) and points downward into the wheel
    // - Rotation is clockwise (positive degrees = clockwise rotation)
    //
    // CALCULATION STEPS:
    // 1. Calculate segment angle: 360° / numSegments (e.g., 72° for 5 segments)
    // 2. Calculate landing angle: position within winning segment (0° to 360°)
    // 3. Calculate total rotation: (full rotations) + (360° - landingAngle)
    //    The (360 - landingAngle) ensures the wheel rotates to bring landingAngle under the pointer
    //
    // EXAMPLE: 5 segments, want to land on segment 2 (middle)
    // - segmentAngle = 360° / 5 = 72°
    // - segment 2 spans from 144° to 216°
    // - landingAngle = 144° + 36° (middle) = 180°
    // - totalRotation = (5 × 360°) + (360° - 180°) = 1800° + 180° = 1980°
    // - After 1980° rotation, the 180° position is under the pointer (segment 2) ✓
    // ============================================================================
    
    const numSegments = config.segments.length;
    const segmentAngle = 360 / numSegments;
    
    // Add randomness to number of rotations for variety (5-7 full rotations)
    // This doesn't affect the landing position, just the visual excitement
    const fullRotations = MIN_SPIN_ROTATIONS + Math.floor(Math.random() * SPIN_ROTATION_VARIANCE);
    
    // Calculate landing angle within the winning segment
    // LANDING_ZONE_START and LANDING_ZONE_SIZE prevent landing too close to segment edges
    // This creates a natural appearance and avoids visual ambiguity at boundaries
    // landingAngle = segmentStart + offset within safe zone
    const segmentStartAngle = winningSegmentIndex * segmentAngle;
    const offsetInSegment = (segmentAngle * LANDING_ZONE_START) + (Math.random() * segmentAngle * LANDING_ZONE_SIZE);
    const landingAngle = segmentStartAngle + offsetInSegment;
    
    // Total rotation = full spins + final position
    // The formula (360 - landingAngle) brings landingAngle to the pointer position (0°/360° at top)
    // This is because rotating the wheel clockwise by (360 - landingAngle) moves
    // the landingAngle position from its current location to the top (under pointer)
    const totalRotation = (fullRotations * 360) + (360 - landingAngle);

    // Get spin duration from config or default (MUST remain constant for correct landing)
    // This duration is used by both server calculation and client animation
    // Changing this dynamically would cause landing position desynchronization
    const spinDuration = config.settings?.spinDuration || 5000;

    spinData.winningSegmentIndex = winningSegmentIndex;
    spinData.landingAngle = landingAngle;
    spinData.totalRotation = totalRotation;
    spinData.segmentAngle = segmentAngle;
    spinData.spinDuration = spinDuration;
    spinData.wheelName = config.name || wheelName || 'Wheel';
    spinData.wheelSettings = { ...(config.settings || {}) };
    // Deep-copy segments at spin time – this snapshot is the authoritative source for
    // handleSpinComplete, so config edits between startSpin and completion cannot affect results.
    spinData.segments = config.segments.map(s => ({ ...s }));
    this.activeSpins.set(spinId, spinData);

    // Debug logging for rotation calculation
    this.logger.debug(`🎡 Wheel rotation calc: segments=${numSegments}, segmentAngle=${segmentAngle.toFixed(2)}°, winningIndex=${winningSegmentIndex}, landingAngle=${landingAngle.toFixed(2)}°, totalRotation=${totalRotation.toFixed(2)}° (wheelId: ${wheelId}, spinId: ${spinId})`);
    this.logger.info(`🎡 Wheel spin started: ${username} on "${wheelName || 'Wheel'}" -> segment[${winningSegmentIndex}]="${winningSegment.text}" (spinId: ${spinId})`);

    // Emit spin event to overlay with comprehensive, validated data
    this.io.emit('wheel:spin-start', {
      spinId,
      username,
      nickname,
      profilePictureUrl,
      giftName,
      totalRotation,
      spinDuration,
      winningSegmentIndex,
      winningSegment: {
        index: winningSegmentIndex,
        text: winningSegment.text,
        color: winningSegment.color,
        isNiete: winningSegment.isNiete || false,
        isShock: winningSegment.isShock || false,
        shockIntensity: winningSegment.shockIntensity || 0,
        shockDuration: winningSegment.shockDuration || 0,
        shockType: winningSegment.shockType || 'shock',
        shockDevices: winningSegment.shockDevices || [],
        prizeAudio: winningSegment.prizeAudio || 1
      },
      // Include full config to ensure overlay has correct data
      // This is the authoritative segment list for this spin
      segments: config.segments,
      settings: config.settings,
      wheelId,
      wheelName: wheelName || config.name,
      timestamp: Date.now(),
      // Add metadata for debugging
      numSegments: config.segments.length,
      segmentAngle: segmentAngle
    });

    // Set server-side safety timeout (independent of overlay response)
    // This ensures the queue doesn't get stuck if overlay doesn't respond
    const winnerDisplayDuration = (config.settings?.winnerDisplayDuration || 5) * 1000;
    const infoScreenDuration = (config.settings?.infoScreenEnabled && !winningSegment.isNiete) 
      ? (config.settings?.infoScreenDuration || 5) * 1000 
      : 0;
    const safetyTimeoutMs = spinDuration + winnerDisplayDuration + infoScreenDuration + SPIN_SAFETY_TIMEOUT_BUFFER;
    
    this.spinSafetyTimeout = this._scheduleTimer(() => {
      // Only trigger if this specific spin is still active
      if (this.isSpinning && this.currentSpin?.spinId === spinId) {
        this.logger.warn(`⚠️ Spin ${spinId} safety timeout triggered after ${safetyTimeoutMs}ms - overlay did not respond`);
        this.forceCompleteSpin(spinId, spinData, config);
      }
    }, safetyTimeoutMs);
    if (typeof this.spinSafetyTimeout.unref === 'function') {
      this.spinSafetyTimeout.unref();
    }
    
    this.logger.debug(`🎡 Spin safety timeout set: ${safetyTimeoutMs}ms (spin: ${spinDuration}ms, winner: ${winnerDisplayDuration}ms, info: ${infoScreenDuration}ms, buffer: ${SPIN_SAFETY_TIMEOUT_BUFFER}ms)`);

    return { 
      success: true, 
      spinId, 
      queued: false,
      wheelId,
      wheelName: wheelName || config.name,
      spinDuration,
      totalRotation,
      landingAngle,
      segmentAngle,
      winningSegmentIndex,
      winningSegment: {
        index: winningSegmentIndex,
        text: winningSegment.text,
        color: winningSegment.color,
        isNiete: winningSegment.isNiete || false,
        isShock: winningSegment.isShock || false,
        shockIntensity: winningSegment.shockIntensity || 0,
        shockDuration: winningSegment.shockDuration || 0,
        shockType: winningSegment.shockType || 'shock',
        shockDevices: winningSegment.shockDevices || [],
        prizeAudio: winningSegment.prizeAudio || 1
      }
    };
  }

  /**
   * Calculate winning segment based on weights
   */
  calculateWinningSegment(segments) {
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return 0;
    }
    
    const weights = segments.map((segment) => {
      const weight = Number(segment.weight);
      if (!Number.isFinite(weight)) {
        return 1;
      }
      return weight > 0 ? weight : 0;
    });
    
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
      return Math.floor(Math.random() * segments.length);
    }
    
    let random = Math.random() * totalWeight;
    
    for (let i = 0; i < weights.length; i++) {
      const weight = weights[i];
      if (weight <= 0) {
        continue;
      }
      random -= weight;
      if (random <= 0) {
        return i;
      }
    }
    
    for (let i = weights.length - 1; i >= 0; i--) {
      if (weights[i] > 0) {
        return i;
      }
    }
    
    return segments.length - 1;
  }


  /**
   * Claim a spin for one terminal path. Overlay completion, the Wheel safety
   * timeout, and any queue fallback must all pass through this gate so a prize
   * can never be recorded twice.
   */
  _claimSpinFinalization(spinId) {
    if (this.finalizingSpins.has(spinId) || !this.activeSpins.has(spinId)) {
      this.logger.debug(`Spin ${spinId} already completed, ignoring`);
      return null;
    }

    const spinData = this.activeSpins.get(spinId);
    if (!spinData) {
      this.logger.warn(`Spin ${spinId} not found in active spins`);
      return null;
    }

    this.finalizingSpins.add(spinId);
    this.activeSpins.delete(spinId);
    this._clearSpinSafetyTimeout();
    return spinData;
  }

  _failSpinFinalization(spinId, reason, error) {
    this._cleanupSpinState(spinId, reason);
    this.unifiedQueue?.completeProcessing();
    return { success: false, error };
  }

  /**
   * Perform the one authoritative terminal transition for a spin. Both overlay
   * completion and the server timeout resolve the spin-start snapshot here
   * before either path emits its mode-specific overlay event.
   */
  finalizeSpin(spinId, {
    mode = 'overlay',
    segmentIndex = null,
    reportedSegmentIndex = null,
    config: providedConfig = null
  } = {}) {
    const spinData = this._claimSpinFinalization(spinId);
    if (!spinData) {
      return { success: false, duplicate: true };
    }

    const wheelId = spinData.wheelId;
    const hasSegmentSnapshot = Array.isArray(spinData.segments) && spinData.segments.length > 0;
    const config = providedConfig || (hasSegmentSnapshot ? null : this.getConfig(wheelId));
    if (!config && !hasSegmentSnapshot) {
      this.logger.error(`Invalid wheel config for spin finalization (wheelId: ${wheelId})`);
      return this._failSpinFinalization(spinId, 'invalid_config_on_finalize', 'Invalid segment');
    }

    const spinSegments = hasSegmentSnapshot ? spinData.segments : config?.segments;
    const wheelName = spinData.wheelName || config?.name || 'Wheel';
    const settings = spinData.wheelSettings || config?.settings || {};
    if (!Array.isArray(spinSegments) || spinSegments.length === 0) {
      this.logger.error(`Invalid wheel segments for spin finalization (wheelId: ${wheelId})`);
      return this._failSpinFinalization(spinId, 'invalid_segments_on_finalize', 'Invalid segment');
    }

    const timeout = mode === 'timeout';
    const expectedSegmentIndex = Number.isInteger(spinData.winningSegmentIndex)
      ? spinData.winningSegmentIndex
      : null;
    const reportedIndex = Number.isInteger(reportedSegmentIndex)
      ? reportedSegmentIndex
      : (Number.isInteger(segmentIndex) ? segmentIndex : null);
    const syncMismatch = !timeout && Number.isInteger(expectedSegmentIndex) &&
      Number.isInteger(reportedIndex) && expectedSegmentIndex !== reportedIndex;
    let finalSegmentIndex = expectedSegmentIndex;
    let resolvedSource = 'expected';

    if (!Number.isInteger(finalSegmentIndex) || finalSegmentIndex < 0 || finalSegmentIndex >= spinSegments.length) {
      if (!timeout && Number.isInteger(reportedIndex) && reportedIndex >= 0 && reportedIndex < spinSegments.length) {
        finalSegmentIndex = reportedIndex;
        resolvedSource = 'reported';
        this.logger.warn(`Wheel spin fallback to reported segment index ${reportedIndex} (spinId: ${spinId}, wheelId: ${wheelId})`);
      } else {
        this.logger.error(`Invalid segment index for spin finalization (expected: ${expectedSegmentIndex}, reported: ${reportedIndex}, spinSegments: ${spinSegments.length})`);
        return this._failSpinFinalization(spinId, 'invalid_segment_index_on_finalize', 'Invalid segment');
      }
    } else if (syncMismatch) {
      this.logger.warn(`Wheel spin desync detected: expected ${expectedSegmentIndex} but overlay reported ${reportedIndex} (spinId: ${spinId}, wheelId: ${wheelId}, spinSegments: ${spinSegments.length}, landingAngle: ${spinData.landingAngle?.toFixed(2)}, totalRotation: ${spinData.totalRotation?.toFixed(2)})`);
    }

    const segment = spinSegments[finalSegmentIndex];
    try {
      this.db.recordWheelWin(
        spinData.username,
        spinData.nickname,
        segment.text,
        finalSegmentIndex,
        spinData.giftName,
        wheelId
      );
    } catch (error) {
      this.logger.error(`Error recording wheel result: ${error.message}`);
      return this._failSpinFinalization(spinId, 'record_wheel_win_failed', 'Could not record wheel result');
    }

    let xpAwarded = 0;
    if (segment.xpReward && segment.xpReward > 0 && !segment.isNiete) {
      try {
        const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
        if (viewerLeaderboard?.instance?.db) {
          viewerLeaderboard.instance.db.addXP(
            spinData.username,
            segment.xpReward,
            'wheel_prize',
            { prize: segment.text, spinId, wheelId, wheelName, timeout }
          );
          xpAwarded = segment.xpReward;
          this.logger.info(`Awarded ${segment.xpReward} XP to ${spinData.nickname} from wheel prize (${wheelName})${timeout ? ' [timeout]' : ''}`);
        } else if (!timeout) {
          this.logger.warn('Viewer XP plugin not available, could not award XP');
        }
      } catch (error) {
        this.logger.error(`Error awarding XP${timeout ? ' during force complete' : ''}: ${error.message}`);
      }
    }

    spinData.status = timeout ? 'timeout' : 'completed';
    spinData.result = segment.text;
    spinData.segmentIndex = finalSegmentIndex;
    spinData.reportedSegmentIndex = reportedIndex;

    this._cleanupSpinState(spinId, timeout ? 'force_complete_timeout' : 'completed');

    return {
      success: true,
      timeout,
      spinData,
      wheelId,
      wheelName,
      settings,
      segment,
      finalSegmentIndex,
      expectedSegmentIndex,
      reportedIndex,
      syncMismatch,
      resolvedSource,
      xpAwarded
    };
  }

  /**
   * Handle spin completed (called from overlay)
   */
  async handleSpinComplete(spinId, segmentIndex, reportedSegmentIndex = null) {
    const finalization = this.finalizeSpin(spinId, {
      mode: 'overlay',
      segmentIndex,
      reportedSegmentIndex
    });
    if (!finalization.success) {
      if (finalization.duplicate) {
        this.logger.debug(`Spin ${spinId} already completed, ignoring`);
        return;
      }
      return finalization;
    }

    const {
      spinData,
      wheelId,
      wheelName,
      settings,
      segment,
      finalSegmentIndex,
      expectedSegmentIndex,
      reportedIndex,
      syncMismatch,
      resolvedSource,
      xpAwarded
    } = finalization;

    let shockScheduled = false;
    if (segment.isShock &&
        typeof segment.shockIntensity === 'number' && segment.shockIntensity > 0 &&
        typeof segment.shockDuration === 'number' && segment.shockDuration > 0) {
      try {
        const openShockPlugin = this.api.pluginLoader?.loadedPlugins?.get('openshock');
        if (openShockPlugin?.instance) {
          const logger = this.logger;
          this._scheduleTimer(() => {
            (async () => {
              try {
                const currentPlugin = this.api.pluginLoader?.loadedPlugins?.get('openshock');
                if (!currentPlugin?.instance) {
                  logger.warn(`OpenShock plugin no longer available for delayed shock (spinId: ${spinData.spinId})`);
                  return;
                }

                await this.triggerShock(currentPlugin.instance, segment, spinData, wheelId, wheelName);
                const actionType = segment.shockType || 'shock';
                logger.info(`Triggered ${actionType} for ${spinData.nickname} from wheel (${wheelName}): intensity=${segment.shockIntensity}, duration=${segment.shockDuration}ms, devices=${(segment.shockDevices || []).length}`);
              } catch (error) {
                logger.error(`Error triggering delayed shock/vibrate: ${error.message}`);
              }
            })();
          }, SHOCK_DISPLAY_DELAY_MS);
          shockScheduled = true;
          this.logger.debug(`Shock scheduled for ${spinData.nickname} (delay: ${SHOCK_DISPLAY_DELAY_MS}ms)`);
        } else {
          this.logger.warn('OpenShock plugin not available, could not trigger shock/vibrate');
        }
      } catch (error) {
        this.logger.error(`Error setting up shock/vibrate trigger: ${error.message}`);
      }
    }

    this.io.emit('wheel:spin-result', {
      spinId,
      username: spinData.username,
      nickname: spinData.nickname,
      prize: segment.text,
      prizeColor: segment.color,
      segmentIndex: finalSegmentIndex,
      isNiete: segment.isNiete || false,
      isShock: segment.isShock || false,
      shockIntensity: segment.shockIntensity || 0,
      shockDuration: segment.shockDuration || 0,
      shockScheduled,
      xpAwarded,
      prizeAudio: segment.prizeAudio || 1,
      expectedSegmentIndex,
      reportedSegmentIndex: reportedIndex,
      syncMismatch,
      syncSource: resolvedSource,
      wheelId,
      wheelName
    });

    this.logger.info(
      `Wheel result (${wheelName}): ${spinData.nickname} ${segment.isNiete ? 'got "Niete" (no win)' : `won "${segment.text}"`}${xpAwarded > 0 ? ` (+${xpAwarded} XP)` : ''}${shockScheduled ? ` (shock scheduled: ${segment.shockIntensity}/${segment.shockDuration}ms, delay: ${SHOCK_DISPLAY_DELAY_MS}ms)` : ''} (spinId: ${spinId})`
    );

    const winnerDisplayDuration = (settings.winnerDisplayDuration || 5) * 1000;
    const infoScreenDuration = (settings.infoScreenEnabled && !segment.isNiete) ? (settings.infoScreenDuration || 5) * 1000 : 0;
    const nextSpinDelay = winnerDisplayDuration + infoScreenDuration + 1000;
    this._scheduleTimer(() => {
      this.unifiedQueue?.completeProcessing();
    }, nextSpinDelay);

    return {
      success: true,
      username: spinData.username,
      nickname: spinData.nickname,
      prize: segment.text,
      segmentIndex: finalSegmentIndex,
      isNiete: segment.isNiete || false,
      xpAwarded,
      expectedSegmentIndex,
      reportedSegmentIndex: reportedIndex,
      syncMismatch,
      wheelId
    };
  }

  /**
   * Force complete a spin when the overlay does not respond.
   * Uses the same terminal finalizer as normal overlay completion.
   */
  forceCompleteSpin(spinId, _legacySpinData, config) {
    // The active-map snapshot is authoritative; legacy callers may still pass spin data.
    void _legacySpinData;
    this.logger.warn(`Force completing spin ${spinId} due to timeout`);

    const finalization = this.finalizeSpin(spinId, { mode: 'timeout', config });
    if (!finalization.success) {
      return finalization;
    }

    const { spinData, wheelId, wheelName, segment, finalSegmentIndex, xpAwarded } = finalization;
    this.io.emit('wheel:spin-timeout', {
      spinId,
      username: spinData.username,
      nickname: spinData.nickname,
      prize: segment.text,
      prizeColor: segment.color,
      segmentIndex: finalSegmentIndex,
      isNiete: segment.isNiete || false,
      wheelId,
      wheelName,
      timestamp: Date.now()
    });

    this.logger.info(`Wheel spin timeout handled: ${spinData.nickname} -> "${segment.text}" (spinId: ${spinId}, wheelId: ${wheelId})`);
    this.unifiedQueue?.completeProcessing();

    return {
      success: true,
      timeout: true,
      username: spinData.username,
      nickname: spinData.nickname,
      prize: segment.text,
      segmentIndex: finalSegmentIndex,
      isNiete: segment.isNiete || false,
      xpAwarded,
      wheelId
    };
  }
  /**
   * Get win history
   */
  getWinHistory(limit = 50, wheelId = null) {
    return this.db.getWheelWinHistory(limit, wheelId);
  }

  /**
   * Get user's win history
   */
  getUserWinHistory(username, limit = 10) {
    return this.db.getWheelUserWinHistory(username, limit);
  }

  /**
   * Mark a prize as paid out
   */
  markPrizeAsPaid(winId) {
    return this.db.markWheelPrizePaid(winId);
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    const status = this.unifiedQueue?.getStatus();
    return {
      isSpinning: this.isSpinning,
      currentSpin: this.currentSpin ? {
        spinId: this.currentSpin.spinId,
        username: this.currentSpin.username,
        nickname: this.currentSpin.nickname,
        wheelId: this.currentSpin.wheelId,
        wheelName: this.currentSpin.wheelName
      } : null,
      queueLength: status?.queue.filter(item => item.type === 'wheel').length || 0,
      queue: (status?.queue || []).filter(item => item.type === 'wheel')
    };
  }

  /**
   * Get Wheel statistics
   */
  getStats(wheelId = null) {
    return this.db.getWheelStats(wheelId);
  }

  /**
   * Clean up old spins (if they get stuck)
   */
  cleanupOldSpins(maxAgeMs = MAX_SPIN_AGE_MS) {
    const now = Date.now();
    const oldSpins = [];

    for (const [spinId, spinData] of this.activeSpins.entries()) {
      if (now - spinData.timestamp > maxAgeMs) {
        oldSpins.push(spinId);
      }
    }

    for (const spinId of oldSpins) {
      this.logger.warn(`Force-finalizing stuck spin ${spinId}`);
      try {
        const result = this.forceCompleteSpin(spinId);
        if (!result?.success && !result?.duplicate) {
          this.logger.warn(`Stuck spin ${spinId} could not be finalized: ${result?.error || 'unknown error'}`);
        }
      } catch (error) {
        this.logger.error(`Could not force-finalize stuck spin ${spinId}: ${error.message}`);
        this._cleanupSpinState(spinId, 'cleanup_old_spins_error');
        this.unifiedQueue?.completeProcessing();
      }
    }

    if (oldSpins.length > 0) {
      this.logger.info(`Force-finalized ${oldSpins.length} stuck wheel spins`);
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldSpins();
    }, CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Generate a batch key for OpenShock command deduplication
   * @private
   * @param {string} username - Username
   * @param {Array<string>} deviceIds - Device IDs (sorted)
   * @param {string} type - Command type
   * @param {number} intensity - Intensity value
   * @param {number} duration - Duration in ms
   * @returns {string} Batch key
   */
  _getOpenshockBatchKey(username, deviceIds, type, intensity, duration) {
    // Sort device IDs to ensure consistent key regardless of order
    const sortedDevices = [...deviceIds].sort().join(',');
    return `${username}:${sortedDevices}:${type}:${intensity}:${duration}`;
  }

  /**
   * Check if an OpenShock batch is a duplicate within the deduplication window
   * @private
   * @param {string} batchKey - Batch key
   * @returns {boolean} True if duplicate
   */
  _isDuplicateOpenshockBatch(batchKey) {
    const now = Date.now();
    const lastBatchTime = this.openshockBatches.get(batchKey);
    
    if (lastBatchTime && (now - lastBatchTime) < this.openshockBatchWindow) {
      // Duplicate batch within window
      return true;
    }
    
    // Not a duplicate, update timestamp
    this.openshockBatches.set(batchKey, now);
    
    // Clean up old batches to prevent memory leak
    this._cleanupOpenshockBatches(now);
    
    return false;
  }

  /**
   * Clean up old OpenShock batch tracking entries
   * @private
   * @param {number} now - Current timestamp
   */
  _cleanupOpenshockBatches(now) {
    // Only clean up occasionally to reduce overhead
    if (this.openshockBatches.size < OPENSHOCK_BATCH_CLEANUP_THRESHOLD) {
      return;
    }
    
    for (const [key, timestamp] of this.openshockBatches.entries()) {
      if ((now - timestamp) > this.openshockBatchWindow) {
        this.openshockBatches.delete(key);
      }
    }
  }

  /**
   * Trigger shock/vibrate via OpenShock plugin
   * Supports multiple devices and both shock and vibrate actions
   * @private
   */
  async triggerShock(openShockInstance, segment, spinData, wheelId, wheelName) {
    // Validate shock parameters using defined constants
    const intensity = Math.max(SHOCK_MIN_INTENSITY, Math.min(SHOCK_MAX_INTENSITY, segment.shockIntensity || 50));
    const duration = Math.max(SHOCK_MIN_DURATION, Math.min(SHOCK_MAX_DURATION, segment.shockDuration || 1000));
    
    // Determine action type (shock or vibrate)
    const actionType = (segment.shockType || 'shock').toLowerCase();
    
    // Get available devices
    const availableDevices = openShockInstance.devices || [];
    if (availableDevices.length === 0) {
      this.logger.warn('No OpenShock devices available for wheel action');
      return;
    }
    
    // Get target devices - use specified devices or fall back to first available
    let targetDevices = [];
    if (segment.shockDevices && Array.isArray(segment.shockDevices) && segment.shockDevices.length > 0) {
      // Filter to only include devices that exist and are available
      targetDevices = segment.shockDevices
        .map(deviceId => availableDevices.find(d => d.id === deviceId))
        .filter(d => d !== undefined);
      
      if (targetDevices.length === 0) {
        this.logger.warn(`None of the configured devices are available. Configured: ${segment.shockDevices.join(', ')}`);
        // Fall back to first available device
        targetDevices = [availableDevices[0]];
      }
    } else {
      // No devices configured, use first available
      targetDevices = [availableDevices[0]];
      this.logger.debug(`No devices configured for segment, using first available: ${targetDevices[0].name}`);
    }
    
    // Check for duplicate batch within deduplication window
    const deviceIds = targetDevices.map(d => d.id);
    const batchKey = this._getOpenshockBatchKey(spinData.username, deviceIds, actionType, intensity, duration);
    if (this._isDuplicateOpenshockBatch(batchKey)) {
      this.logger.info(`[Wheel] Duplicate OpenShock batch blocked for ${spinData.username}`, {
        deviceCount: deviceIds.length,
        actionType,
        intensity,
        duration,
        windowMs: this.openshockBatchWindow
      });
      return;
    }
    
    // Send commands to all target devices
    const results = [];
    for (const device of targetDevices) {
      try {
        // Choose appropriate method based on action type
        if (actionType === 'vibrate') {
          await openShockInstance.openShockClient.sendVibrate(
            device.id,
            intensity,
            duration,
            {
              priority: 2,
              source: 'wheel',
              metadata: {
                username: spinData.username,
                nickname: spinData.nickname,
                prize: segment.text,
                wheelId,
                wheelName,
                spinId: spinData.spinId
              }
            }
          );
        } else {
          // Default to shock
          await openShockInstance.openShockClient.sendShock(
            device.id,
            intensity,
            duration,
            {
              priority: 2,
              source: 'wheel',
              metadata: {
                username: spinData.username,
                nickname: spinData.nickname,
                prize: segment.text,
                wheelId,
                wheelName,
                spinId: spinData.spinId
              }
            }
          );
        }
        
        results.push({ deviceId: device.id, deviceName: device.name, success: true });
        this.logger.debug(`Successfully sent ${actionType} to device: ${device.name} (${device.id})`);
        
      } catch (error) {
        this.logger.error(`Failed to send ${actionType} command to device ${device.name}: ${error.message}`);
        results.push({ deviceId: device.id, deviceName: device.name, success: false, error: error.message });
      }
    }
    
    // Emit event for overlay/UI with all device results
    this.io.emit('wheel:shock-triggered', {
      spinId: spinData.spinId,
      username: spinData.username,
      nickname: spinData.nickname,
      actionType,
      intensity,
      duration,
      wheelId,
      wheelName,
      devices: results
    });
    
    // Check if any commands succeeded
    const successCount = results.filter(r => r.success).length;
    if (successCount === 0) {
      throw new Error(`Failed to send ${actionType} command to any of the ${targetDevices.length} target device(s)`);
    } else if (successCount < targetDevices.length) {
      this.logger.warn(`${actionType} command succeeded for ${successCount}/${targetDevices.length} devices`);
    }
  }

  /**
   * Central cleanup for spin state.
   * Cancels the safety timeout, removes the spin from activeSpins, and resets
   * isSpinning / currentSpin. Must be called on every terminal path of a spin
   * (success, any failure, timeout) to guarantee a consistent state.
   *
   * @param {string|null} spinId - Spin ID to remove from activeSpins (may be null)
   * @param {string} reason - Short reason tag used in debug logging
   */
  _cleanupSpinState(spinId, reason) {
    this.logger.debug(`🎡 [WHEEL] Spin state cleanup (spinId: ${spinId || 'none'}, reason: ${reason})`);

    // Cancel server-side safety timeout
    if (this.spinSafetyTimeout) {
      this._clearTimer(this.spinSafetyTimeout);
      this.spinSafetyTimeout = null;
    }

    // Remove from active spins tracking
    if (spinId) {
      this.activeSpins.delete(spinId);
    }

    if (spinId) {
      this.finalizingSpins.delete(spinId);
    }

    // Reset global spin busy-state
    this.isSpinning = false;
    this.currentSpin = null;
  }

  /**
   * Destroy Wheel game
   */
  destroy() {
    this.stopCleanupTimer();

    this.destroyed = true;
    this._clearScheduledTimers();
    
    this.activeSpins.clear();
    this.finalizingSpins.clear();
    this.isSpinning = false;
    this.currentSpin = null;
    this.logger.info('🎡 Glücksrad game destroyed');
  }
}

module.exports = WheelGame;
