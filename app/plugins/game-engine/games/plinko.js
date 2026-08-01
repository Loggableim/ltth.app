/**
 * Plinko Game Logic
 * 
 * Physics-based Plinko game where viewers bet XP for a chance to win multipliers.
 * Balls drop through pegs and land in slots with different multipliers.
 */

const crypto = require('crypto');
// Constants
const CLEANUP_INTERVAL_MS = 30000; // 30 seconds
const MAX_BALL_AGE_MS = 120000; // 2 minutes
const MIN_FLIGHT_TIME_MS = 1000; // Minimum time a ball must be in flight (anti-cheat)

// OpenShock safety limits
const OPENSHOCK_MIN_DURATION_MS = 300;
const OPENSHOCK_MAX_DURATION_MS = 5000;
const OPENSHOCK_MIN_INTENSITY = 1;
const OPENSHOCK_MAX_INTENSITY = 100;
const OPENSHOCK_BATCH_CLEANUP_THRESHOLD = 50; // Minimum batches before triggering cleanup

class PlinkoGame {
  constructor(api, db, logger) {
    this.api = api;
    this.db = db;
    this.logger = logger;
    this.io = api.getSocketIO();
    this.random = typeof api.random === 'function' ? api.random.bind(api) : Math.random;
    this.unifiedQueue = null; // Set by main.js
    
    // Debug flag - can be set via config or environment variable
    this.debugMode = process.env.PLINKO_DEBUG === 'true';
    
    // Track active balls in-flight
    this.activeBalls = new Map(); // ballId -> { username, bet, timestamp }
    this.batchTrackers = new Map(); // batchId -> { remaining, totalBet, totalWinnings, slots: [] }
    
    // OpenShock batch deduplication tracking
    // Prevents duplicate multi-device commands within a time window
    // Key format: "username:deviceIds:type:intensity:duration"
    this.openshockBatches = new Map(); // batchKey -> timestamp
    this.openshockBatchWindow = 5000; // 5 second window for batch deduplication
    
    // Ball ID counter
    this.ballIdCounter = 0;
    
    // Cleanup timer
    this.cleanupTimer = null;

    // User color cache (per session)
    this.userColors = new Map();

    // Slot heatmap
    this.slotHitCounts = [];

    // Cached config to avoid repeated DB reads
    this.cachedConfig = null;
    this.inFlightRecoveryPromise = null;
  }

  /**
   * Choose the payout slot on the server before the ball is rendered.
   * A binomial walk keeps the familiar centre-weighted Plinko distribution
   * without trusting a browser-side physics result for XP or hardware actions.
   */
  _selectServerSlotIndex(config) {
    const slotCount = Array.isArray(config?.slots) ? config.slots.length : 0;
    if (slotCount < 1) {
      throw new Error('Plinko board has no slots');
    }

    const pegRows = Math.max(1, Math.min(32, Number(config?.physicsSettings?.pegRows) || 12));
    let rightSteps = 0;
    for (let index = 0; index < pegRows; index++) {
      if (this.random() >= 0.5) {
        rightSteps++;
      }
    }

    return Math.max(0, Math.min(slotCount - 1, Math.round((rightSteps / pegRows) * (slotCount - 1))));
  }

  /**
   * Initialize Plinko game
   */
  init() {
    this.logger.info('🎰 Plinko game initialized');
    if (this._supportsDurableInFlight()) {
      this.inFlightRecoveryPromise = this.recoverInFlightBalls().catch(error => {
        this.logger.error(`[PLINKO] In-flight recovery failed: ${error.message}`);
        return [];
      });
    }
    return this.inFlightRecoveryPromise;
  }

  /**
   * Set unified queue manager
   */
  setUnifiedQueue(unifiedQueue) {
    this.unifiedQueue = unifiedQueue;
  }

  /**
   * Get all plinko boards
   * @returns {Array} List of all plinko board configurations
   */
  getAllBoards() {
    return this.db.getAllPlinkoBoards();
  }

  /**
   * Get Plinko configuration by ID
   * @param {number} boardId - Plinko board ID (optional, defaults to first board)
   */
  getConfig(boardId = null) {
    // For backward compatibility, use cached config if no boardId specified
    if (boardId === null && this.cachedConfig) {
      return this.cachedConfig;
    }

    const defaults = {
      slots: [
        { multiplier: 10, label: '10x', color: '#FFD700' },
        { multiplier: 5, label: '5x', color: '#FF6B6B' },
        { multiplier: 2, label: '2x', color: '#4ECDC4' },
        { multiplier: 1, label: '1x', color: '#95E1D3' },
        { multiplier: 0.5, label: '0.5x', color: '#F38181' },
        { multiplier: 1, label: '1x', color: '#95E1D3' },
        { multiplier: 2, label: '2x', color: '#4ECDC4' },
        { multiplier: 5, label: '5x', color: '#FF6B6B' },
        { multiplier: 10, label: '10x', color: '#FFD700' }
      ],
      physicsSettings: {
        gravity: 2.5,
        ballRestitution: 0.6,
        pegRestitution: 0.8,
        pegRows: 12,
        pegSpacing: 60,
        testModeEnabled: false,
        hideTestControls: false,
        maxSimultaneousBalls: 5,
        rateLimitMs: 800
      },
      giftMappings: {},
      displayTexts: {
        titleText:             '🎰 PLINKO',
        labelDrop:             '⬇️ Ball wird gedropt!',
        labelWin:              '🎉 Gewonnen!',
        labelMultiplierPrefix: '×',
        labelQueued:           '⏳ Warteschlange...',
      }
    };

    const cfg = this.db.getPlinkoConfig(boardId) || defaults;
    const rawPhysics = cfg.physicsSettings || {};
    // Extract displayTexts stored inside physicsSettings (backward-compat storage)
    const { displayTexts: storedDisplayTexts, ...cleanPhysics } = rawPhysics;
    const physicsSettings = { ...defaults.physicsSettings, ...cleanPhysics };
    const displayTexts = Object.assign({ ...defaults.displayTexts }, storedDisplayTexts || {});
    const config = {
      id: cfg.id,
      name: cfg.name || 'Unnamed Plinko',
      slots: cfg.slots || defaults.slots,
      physicsSettings,
      giftMappings: cfg.giftMappings || {},
      chatCommand: cfg.chatCommand || null,
      enabled: cfg.enabled !== undefined ? cfg.enabled : true,
      displayTexts
    };

    // Cache first board config for backward compatibility
    if (boardId === null) {
      this.cachedConfig = config;
    }

    if (!this.slotHitCounts.length && config.slots.length > 0) {
      this.slotHitCounts = new Array(config.slots.length).fill(0);
    }

    return config;
  }

  /**
   * Create a new plinko board
   * @param {string} name - Name of the board
   * @param {Array} slots - Initial slots (optional)
   * @param {Object} physicsSettings - Initial physics settings (optional)
   * @returns {number} New board ID
   */
  createBoard(name, slots = null, physicsSettings = null) {
    const defaultSlots = slots || [
      { multiplier: 10, label: '10x', color: '#FFD700', openshockReward: { enabled: false } },
      { multiplier: 5, label: '5x', color: '#FF6B6B', openshockReward: { enabled: false } },
      { multiplier: 2, label: '2x', color: '#4ECDC4', openshockReward: { enabled: false } },
      { multiplier: 1, label: '1x', color: '#95E1D3', openshockReward: { enabled: false } },
      { multiplier: 0.5, label: '0.5x', color: '#F38181', openshockReward: { enabled: false } },
      { multiplier: 1, label: '1x', color: '#95E1D3', openshockReward: { enabled: false } },
      { multiplier: 2, label: '2x', color: '#4ECDC4', openshockReward: { enabled: false } },
      { multiplier: 5, label: '5x', color: '#FF6B6B', openshockReward: { enabled: false } },
      { multiplier: 10, label: '10x', color: '#FFD700', openshockReward: { enabled: false } }
    ];
    
    const defaultPhysicsSettings = physicsSettings || {
      gravity: 2.5,
      ballRestitution: 0.6,
      pegRestitution: 0.8,
      pegRows: 12,
      pegSpacing: 60,
      testModeEnabled: false,
      hideTestControls: false,
      maxSimultaneousBalls: 5,
      rateLimitMs: 800
    };
    
    const boardId = this.db.createPlinkoBoard(name, defaultSlots, defaultPhysicsSettings, {}, null);
    this.logger.info(`🎰 Created new plinko board: ${name} (ID: ${boardId})`);
    
    return boardId;
  }

  /**
   * Update Plinko configuration
   * @param {number} boardId - Plinko board ID
   * @param {Array} slots - Plinko slots
   * @param {Object} physicsSettings - Physics settings
   * @param {Object} giftMappings - Gift mappings (optional)
   */
  updateConfig(boardId, slots, physicsSettings, giftMappings) {
    this.db.updatePlinkoConfig(boardId, slots, physicsSettings, giftMappings);
    
    // Clear cached config if updating the first/default board
    if (this.cachedConfig && this.cachedConfig.id === boardId) {
      // Re-read displayTexts from physicsSettings (stored there for backward compat)
      const { displayTexts: storedDt, ...cleanPhysics } = physicsSettings || {};
      this.cachedConfig = {
        id: boardId,
        slots,
        physicsSettings: cleanPhysics,
        giftMappings: giftMappings || {},
        displayTexts: storedDt || {}
      };
    }
    
    this.slotHitCounts = new Array(slots.length || 0).fill(0);
    
    // Extract displayTexts from physicsSettings for the socket event
    const { displayTexts, ...cleanPhysicsForEmit } = physicsSettings || {};
    
    // Emit config update to overlays
    this.io.emit('plinko:config-updated', {
      boardId,
      slots,
      physicsSettings: cleanPhysicsForEmit,
      giftMappings,
      displayTexts: displayTexts || {}
    });
    
    this.logger.info(`✅ Plinko configuration updated (Board ID: ${boardId})`);
  }

  /**
   * Update plinko board name
   */
  updateBoardName(boardId, name) {
    this.db.updatePlinkoName(boardId, name);
    this.logger.info(`✅ Plinko board name updated: ${name} (ID: ${boardId})`);
  }

  /**
   * Update plinko board chat command
   */
  updateBoardChatCommand(boardId, chatCommand) {
    this.db.updatePlinkoChatCommand(boardId, chatCommand);
    this.logger.info(`✅ Plinko board chat command updated: ${chatCommand || 'disabled'} (ID: ${boardId})`);
  }

  /**
   * Update plinko board enabled status
   */
  updateBoardEnabled(boardId, enabled) {
    this.db.updatePlinkoEnabled(boardId, enabled);
    this.logger.info(`✅ Plinko board ${enabled ? 'enabled' : 'disabled'} (ID: ${boardId})`);
  }

  /**
   * Delete a plinko board
   */
  deleteBoard(boardId) {
    const result = this.db.deletePlinkoBoard(boardId);
    if (result) {
      this.logger.info(`✅ Plinko board deleted (ID: ${boardId})`);
      // Clear cache if deleting the cached board
      if (this.cachedConfig && this.cachedConfig.id === boardId) {
        this.cachedConfig = null;
      }
    }
    return result;
  }

  /**
   * Find plinko board by gift trigger
   * @param {string} giftIdentifier - Gift name or ID
   * @returns {Object|null} Board config if found
   */
  findBoardByGiftTrigger(giftIdentifier) {
    return this.db.findPlinkoBoardByGiftTrigger(giftIdentifier);
  }

  /**
   * Find plinko board by chat command
   * @param {string} command - Chat command
   * @returns {Object|null} Board config if found
   */
  findBoardByChatCommand(command) {
    return this.db.findPlinkoBoardByChatCommand(command);
  }

  /**
   * Generate or reuse per-user ball color
   */
  getBallColor(username, preferredColor = null) {
    if (preferredColor) {
      return preferredColor;
    }
    if (this.userColors.has(username)) {
      return this.userColors.get(username);
    }
    // Simple hash-based pastel color
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = ((hash << 5) - hash) + username.charCodeAt(i);
      hash |= 0;
    }
    const r = (hash & 0xFF0000) >> 16;
    const g = (hash & 0x00FF00) >> 8;
    const b = (hash & 0x0000FF);
    const color = `#${((r & 0x7f) | 0x80).toString(16).padStart(2, '0')}${((g & 0x7f) | 0x80).toString(16).padStart(2, '0')}${((b & 0x7f) | 0x80).toString(16).padStart(2, '0')}`;
    this.userColors.set(username, color);
    return color;
  }

  /** Check whether the unified queue is currently busy. */
  shouldQueuePlinko() {
    return Boolean(this.unifiedQueue?.shouldQueue());
  }

  /**
   * Validate bet amount
   * @returns {Object} { valid: boolean, error?: string }
   */
  async validateBet(username, betAmount) {
    // Check for negative or zero bet
    if (betAmount <= 0) {
      return { valid: false, error: 'Bet amount must be positive' };
    }

    // Check if bet is an integer
    if (!Number.isInteger(betAmount)) {
      return { valid: false, error: 'Bet amount must be a whole number' };
    }

    // Get viewer XP from viewer-leaderboard plugin
    try {
      const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
      if (!viewerLeaderboard || !viewerLeaderboard.instance) {
        return { valid: false, error: 'XP system not available' };
      }

      const profile = viewerLeaderboard.instance.db.getViewerProfile(username);
      if (!profile) {
        return { valid: false, error: 'User profile not found. You need to interact with the stream first!' };
      }

      if (profile.xp < betAmount) {
        return { 
          valid: false, 
          error: `Insufficient XP. You have ${profile.xp} XP but tried to bet ${betAmount} XP` 
        };
      }

      return { valid: true, currentXP: profile.xp };
    } catch (error) {
      this.logger.error(`Error validating bet: ${error.message}`);
      return { valid: false, error: 'Failed to validate bet' };
    }
  }

  /**
   * Deduct XP from user
   */
  async deductXP(username, amount) {
    const idempotencyKey = arguments[2] || null;
    try {
      const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
      if (!viewerLeaderboard || !viewerLeaderboard.instance) {
        throw new Error('XP system not available');
      }

      if (idempotencyKey) {
        const viewerDatabase = viewerLeaderboard.instance.db;
        if (typeof viewerDatabase?.addXPOnce !== 'function') {
          throw new Error('XP idempotency support is unavailable');
        }
        const result = await viewerDatabase.addXPOnce(
          username,
          -amount,
          'plinko_bet',
          { bet: amount, source: 'game-engine-plinko' },
          idempotencyKey
        );
        return Boolean(result?.applied || result?.duplicate || result?.optedOut);
      }

      // Deduct XP by adding negative amount
      viewerLeaderboard.instance.db.addXP(username, -amount, 'plinko_bet', {
        bet: amount,
        source: 'game-engine-plinko'
      });

      return true;
    } catch (error) {
      this.logger.error(`Error deducting XP: ${error.message}`);
      return false;
    }
  }

  /**
   * Award XP to user (winnings)
   */
  async awardXP(username, amount, multiplier) {
    const idempotencyKey = arguments[3] || null;
    const actionType = arguments[4] || 'plinko_win';
    const extraDetails = arguments[5] || null;
    try {
      const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
      if (!viewerLeaderboard || !viewerLeaderboard.instance) {
        throw new Error('XP system not available');
      }

      if (idempotencyKey) {
        const viewerDatabase = viewerLeaderboard.instance.db;
        if (typeof viewerDatabase?.addXPOnce !== 'function') {
          throw new Error('XP idempotency support is unavailable');
        }
        const result = await viewerDatabase.addXPOnce(
          username,
          amount,
          actionType,
          {
            winnings: amount,
            multiplier,
            source: 'game-engine-plinko',
            ...(extraDetails || {})
          },
          idempotencyKey
        );
        return Boolean(result?.applied || result?.duplicate || result?.optedOut);
      }

      viewerLeaderboard.instance.db.addXP(username, amount, 'plinko_win', {
        winnings: amount,
        multiplier: multiplier,
        source: 'game-engine-plinko'
      });

      return true;
    } catch (error) {
      this.logger.error(`Error awarding XP: ${error.message}`);
      return false;
    }
  }

  /**
   * Spawn a ball (from chat command or gift)
   * @returns {Object} { success: boolean, ballId?: string, error?: string }
   */
  async spawnBall(username, nickname, profilePictureUrl, betAmount, ballType = 'standard', options = {}) {
    if (this._supportsDurableInFlight()) {
      return this._spawnDurableBall(
        username,
        nickname,
        profilePictureUrl,
        betAmount,
        ballType,
        options
      );
    }

    const { skipValidation = false, skipDeduction = false, testMode = false, batchId = null, preferredColor = null, boardId = null } = options;
    const isQueueManaged = options.queueManaged === true || options.forceStart === true;
    const config = boardId !== null ? this.getConfig(boardId) : this.getConfig();
    const isTest = testMode || config.physicsSettings.testModeEnabled;

    if (!skipValidation && !isTest) {
      const validation = await this.validateBet(username, betAmount);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    if (!skipDeduction && !isTest) {
      const deducted = await this.deductXP(username, betAmount);
      if (!deducted) {
        return { success: false, error: 'Failed to deduct XP' };
      }
    }

    // Resolve the outcome before notifying an overlay. The browser renders the
    // selected target but never decides a payout-relevant slot.
    const serverSlotIndex = this._selectServerSlotIndex(config);

    // Generate unique ball ID
    const ballId = `ball_${Date.now()}_${this.ballIdCounter++}`;

    // Store ball data
    this.activeBalls.set(ballId, {
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType,
      timestamp: Date.now(),
      batchId,
      boardId,
      serverSlotIndex,
      isTest, // Store test mode flag for proper handling in handleBallLanded
      queueManaged: isQueueManaged
    });

    let globalMultiplier = 1.0;
    
    if (config.giftMappings && config.giftMappings[ballType]) {
      globalMultiplier = config.giftMappings[ballType].multiplier || 1.0;
    }

    const color = this.getBallColor(username, preferredColor);

    // Emit spawn event to overlay
    this.io.emit('plinko:spawn-ball', {
      ballId,
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType,
      globalMultiplier,
      timestamp: Date.now(),
      color,
      batchId,
      boardId,
      boardName: config.name,
      targetSlotIndex: serverSlotIndex,
      testMode: isTest
    });

    this.logger.info(`🎰 Plinko ball spawned: ${username} bet ${betAmount} XP (ballId: ${ballId}${batchId ? `, batch ${batchId}` : ''})`);

    return { success: true, ballId };
  }

  /**
   * Spawn multiple balls at once (shared validation)
   */
  async spawnBalls(username, nickname, profilePictureUrl, betAmount, count = 1, options = {}) {
    const boardId = options.boardId ?? null;
    const config = boardId !== null ? this.getConfig(boardId) : this.getConfig();
    const isTest = options.testMode || config.physicsSettings.testModeEnabled;
    const queueManaged = options.forceStart === true;
    const limitedCount = Math.max(1, Math.min(count, config.physicsSettings.maxSimultaneousBalls || 5));
    const totalBet = betAmount * limitedCount;

    // Rate limit to prevent spam
    const now = Date.now();
    const rateKey = username;
    const rateLimitMs = config.physicsSettings.rateLimitMs || 800;
    if (!isTest) {
      if (!this.rateLimitMap) this.rateLimitMap = new Map();
      const last = this.rateLimitMap.get(rateKey) || 0;
      if (now - last < rateLimitMs) {
        return { success: false, error: 'Please wait before dropping another ball' };
      }
      this.rateLimitMap.set(rateKey, now);
    }

    if (this.shouldQueuePlinko() && !options.forceStart) {
      const batchId = options.batchId || `batch_${Date.now()}_${this.ballIdCounter++}`;
      
      if (this.unifiedQueue) {
        const dropData = {
          username,
          nickname,
          profilePictureUrl,
          betAmount,
          count: limitedCount,
          batchId,
          preferredColor: options.preferredColor || null,
          boardId
        };
        
        this.logger.info(`🎰 Plinko queued via unified queue for ${username} (batch ${batchId})`);
        const queueResult = this.unifiedQueue.queuePlinko(dropData);
        return { success: true, queued: true, position: queueResult.position, batchId };
      }
    }

    const usesDurableInFlight = this._supportsDurableInFlight();

    // Validate once for the full batch. Durable balls debit individually so a
    // crash cannot leave an aggregate debit without a recoverable outcome.
    if (!isTest) {
      const validation = await this.validateBet(username, totalBet);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
      if (!usesDurableInFlight) {
        const deducted = await this.deductXP(username, totalBet);
        if (!deducted) {
          return { success: false, error: 'Failed to deduct XP' };
        }
      }
    }

    const batchId = options.batchId || (limitedCount > 1 ? `batch_${Date.now()}_${this.ballIdCounter++}` : null);
    const tracksStartedDurableBalls = usesDurableInFlight;
    if (batchId && limitedCount > 1) {
      this.batchTrackers.set(batchId, {
        remaining: tracksStartedDurableBalls ? 0 : limitedCount,
        totalBet: tracksStartedDurableBalls ? 0 : totalBet,
        totalWinnings: 0,
        net: tracksStartedDurableBalls ? 0 : -totalBet,
        slots: [],
        boardId,
        queueManaged
      });
    }

    const ballIds = [];
    const failures = [];
    for (let i = 0; i < limitedCount; i++) {
      const tracker = batchId && tracksStartedDurableBalls
        ? this.batchTrackers.get(batchId)
        : null;
      if (tracker) {
        tracker.remaining += 1;
        tracker.totalBet += betAmount;
        tracker.net -= betAmount;
        this.batchTrackers.set(batchId, tracker);
      }

      const result = await this.spawnBall(
        username,
        nickname,
        profilePictureUrl,
        betAmount,
        'standard',
        {
          skipValidation: true,
          skipDeduction: usesDurableInFlight ? false : true,
          testMode: isTest,
          batchId,
          preferredColor: options.preferredColor,
          boardId,
          queueManaged
        }
      );
      if (result.success && result.ballId) {
        ballIds.push(result.ballId);
        continue;
      }

      failures.push({ index: i, error: result.error || 'Failed to start Plinko ball' });
      if (tracker) {
        tracker.remaining = Math.max(0, tracker.remaining - 1);
        tracker.totalBet -= betAmount;
        tracker.net += betAmount;
        this.batchTrackers.set(batchId, tracker);
      }
    }

    const completedTracker = batchId && tracksStartedDurableBalls
      ? this.batchTrackers.get(batchId)
      : null;
    if (completedTracker?.remaining <= 0 && ballIds.length > 0) {
      this.batchTrackers.delete(batchId);
      this._emitCompletedBatch(batchId, username, boardId, completedTracker);
    }

    const actualTotalBet = ballIds.length * betAmount;
    if (ballIds.length === 0) {
      if (batchId) this.batchTrackers.delete(batchId);
      return {
        success: false,
        error: failures[0]?.error || 'Failed to start Plinko ball',
        batchId,
        ballIds,
        totalBet: 0,
        count: 0,
        requestedTotalBet: totalBet,
        requestedCount: limitedCount,
        failures,
        queued: false
      };
    }

    return {
      success: true,
      partial: failures.length > 0,
      batchId,
      ballIds,
      totalBet: actualTotalBet,
      count: ballIds.length,
      requestedTotalBet: totalBet,
      requestedCount: limitedCount,
      failures,
      queued: false
    };

  }
  _emitCompletedBatch(batchId, username, boardId, tracker) {
    this.io.emit('plinko:batch-complete', {
      batchId,
      username,
      totalBet: tracker.totalBet,
      totalWinnings: tracker.totalWinnings,
      net: tracker.net,
      slots: tracker.slots,
      boardId
    });
    if (tracker.queueManaged === true && this.unifiedQueue) {
      this.unifiedQueue.completeProcessing();
    }
  }

  _scheduleQueueRelease() {
    if (!this.unifiedQueue) return;
    const queue = this.unifiedQueue;
    const completeTimer = setTimeout(() => {
      queue.completeProcessing();
    }, 1000);
    if (typeof completeTimer.unref === 'function') {
      completeTimer.unref();
    }
  }


  /**
   * Spawn a test ball (bypasses XP validation, unified queue, and gift triggers)
   * @param {string} playerName - Display name for the test player
   * @param {number} betAmount - Bet amount in XP
   * @param {number|null} boardId - Optional board ID (defaults to first available)
   * @returns {Promise<Object>} Result with ballId
   */
  async spawnTestBall(playerName, betAmount, boardId = null) {
    if (this._supportsDurableInFlight()) {
      return this._spawnDurableTestBall(playerName, betAmount, boardId);
    }

    // Create mock user profile
    const username = `test_${playerName}_${Date.now()}`;
    const nickname = playerName;
    const profilePictureUrl = '';

    // Get board config (optional boardId for future multi-board support)
    const config = boardId ? this.getConfig(boardId) : this.getConfig();
    
    if (!config) {
      return { success: false, error: 'Board not found' };
    }

    const serverSlotIndex = this._selectServerSlotIndex(config);

    // Generate unique ball ID
    const ballId = `test-ball-${Date.now()}_${this.ballIdCounter++}`;

    // Store ball data with test flag
    this.activeBalls.set(ballId, {
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType: 'standard',
      timestamp: Date.now(),
      boardId,
      serverSlotIndex,
      isTest: true // <-- Flag for test mode
    });

    // Get ball color
    const color = this.getBallColor(username, null);

    // Emit spawn event to overlay (identical to regular balls)
    this.io.emit('plinko:spawn-ball', {
      ballId,
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType: 'standard',
      globalMultiplier: 1.0,
      timestamp: Date.now(),
      color,
      boardId,
      boardName: config.name,
      targetSlotIndex: serverSlotIndex,
      isTest: true // <-- Flag for overlay (optional tracking)
    });

    this.logger.info(`🧪 [TEST] Plinko test ball spawned: ${playerName} bet ${betAmount} XP (ballId: ${ballId})`);

    return { success: true, ballId, testMode: true };
  }

  /**
   * Handle ball landing in a slot
   */
  async handleBallLanded(ballId, reportedSlotIndex) {
    const ballData = this.activeBalls.get(ballId);
    if (this._supportsDurableInFlight()) {
      return this._handleDurableBallLanded(ballId, reportedSlotIndex);
    }

    
    this._debugLog(`Ball landing reported: ${ballId} in slot ${reportedSlotIndex}`);
    
    if (!ballData) {
      this.logger.warn(`Ball ${ballId} not found in active balls`);
      return { success: false, error: 'Ball not found' };
    }

    // Get configuration to check test mode
    const config = ballData.boardId !== null && ballData.boardId !== undefined
      ? this.getConfig(ballData.boardId)
      : this.getConfig();
    const isTestMode = config.physicsSettings.testModeEnabled;

    // Anti-cheat: Validate flight time (skip in test mode)
    if (!isTestMode) {
      const flightTime = Date.now() - ballData.timestamp;
      if (flightTime < MIN_FLIGHT_TIME_MS) {
        this.logger.warn(`Ball landed too quickly: ${flightTime}ms (minimum: ${MIN_FLIGHT_TIME_MS}ms) - possible glitch or manipulation`);
        this.activeBalls.delete(ballId);
        return { success: false, error: 'Invalid drop time' };
      }
    }

    // The browser result is display-only. It can diagnose a visual desync but
    // must never determine XP, statistics, or OpenShock behaviour.
    // Balls created before this release do not have a stored target. Pick one
    // on the server as a safe migration path; never fall back to browser input.
    const slotIndex = Number.isInteger(ballData.serverSlotIndex)
      ? ballData.serverSlotIndex
      : this._selectServerSlotIndex(config);

    if (Number.isInteger(reportedSlotIndex) && reportedSlotIndex !== slotIndex) {
      this.logger.warn(`Plinko visual desync for ${ballId}: overlay reported ${reportedSlotIndex}, server selected ${slotIndex}`);
    }

    // Validate the server-selected slot configuration
    if (!config || !config.slots || slotIndex < 0 || slotIndex >= config.slots.length) {
      this.logger.error(`Invalid slot index: ${slotIndex}`);
      this.activeBalls.delete(ballId);
      return { success: false, error: 'Invalid slot' };
    }

    // Remove from active balls after all validations pass
    this.activeBalls.delete(ballId);

    const slot = config.slots[slotIndex];
    const multiplier = slot.multiplier;

    this._debugLog(`Slot configuration:`, {
      slotIndex,
      multiplier,
      hasOpenshockReward: !!slot.openshockReward,
      openshockEnabled: slot.openshockReward?.enabled
    });

    // Calculate winnings
    // Note: Math.floor is used to ensure XP is always a whole number (no fractional XP)
    // This prevents precision issues and matches the XP system's integer-only behavior
    const profit = Math.floor(ballData.bet * multiplier);
    const netProfit = profit - ballData.bet;

    // Check if this is a test ball
    const isTestBall = ballData.isTest || false;

    // Award XP if won (skip for test balls)
    if (profit > 0 && !isTestBall) {
      await this.awardXP(ballData.username, profit, multiplier);
    }

    // OpenShock is deliberately decoupled from gambling outcomes. Existing
    // configurations are surfaced to the streamer as a review signal only;
    // no Plinko result can dispatch a hardware command automatically.
    if (slot.openshockReward?.enabled) {
      this.io.emit('plinko:openshock-review-required', {
        ballId,
        username: ballData.username,
        nickname: ballData.nickname,
        slotIndex,
        boardId: ballData.boardId
      });
      this.logger.warn(`Plinko OpenShock reward suppressed for ${ballId}; streamer review is required`);
    }

    // Record transaction (separate tables for test vs regular)
    if (isTestBall) {
      if (typeof this.db.recordPlinkoTestTransaction === 'function') {
        this.db.recordPlinkoTestTransaction(
          ballData.username,
          ballData.bet,
          multiplier,
          netProfit,
          slotIndex
        );
      } else {
        this.logger.warn('[PLINKO] Test transaction recording unavailable; skipping test-mode history entry');
      }
    } else {
      if (typeof this.db.recordPlinkoTransaction === 'function') {
        this.db.recordPlinkoTransaction(
          ballData.username,
          ballData.bet,
          multiplier,
          netProfit,
          slotIndex
        );
      } else {
        this.logger.warn('[PLINKO] Transaction recording unavailable; skipping history entry');
      }
    }

    // Heatmap tracking
    if (!this.slotHitCounts.length) {
      this.slotHitCounts = new Array(config.slots.length || 0).fill(0);
    }
    if (this.slotHitCounts[slotIndex] !== undefined) {
      this.slotHitCounts[slotIndex] += 1;
      this.io.emit('plinko:heatmap', { counts: this.slotHitCounts });
    }

    // Batch aggregation
    if (ballData.batchId && this.batchTrackers.has(ballData.batchId)) {
      const tracker = this.batchTrackers.get(ballData.batchId);
      tracker.remaining -= 1;
      tracker.totalWinnings += profit;
      tracker.net += netProfit;
      tracker.slots.push({ slotIndex, multiplier, winnings: profit, net: netProfit });
      if (tracker.remaining <= 0) {
        this.batchTrackers.delete(ballData.batchId);
        this._emitCompletedBatch(
          ballData.batchId,
          ballData.username,
          tracker.boardId,
          tracker
        );
      } else {
        this.batchTrackers.set(ballData.batchId, tracker);
      }
    } else if (ballData.queueManaged === true) {
      this._scheduleQueueRelease();
    }

    // Emit result event
    this.io.emit('plinko:ball-result', {
      ballId,
      username: ballData.username,
      nickname: ballData.nickname,
      bet: ballData.bet,
      slotIndex,
      multiplier,
      winnings: profit,
      netProfit,
      boardId: ballData.boardId
    });

    this.logger.info(
      `🎰 Plinko result: ${ballData.username} bet ${ballData.bet} XP, ` +
      `landed in slot ${slotIndex} (${multiplier}x), won ${profit} XP (net: ${netProfit >= 0 ? '+' : ''}${netProfit} XP)`
    );

    return {
      success: true,
      username: ballData.username,
      bet: ballData.bet,
      multiplier,
      winnings: profit,
      netProfit,
      boardId: ballData.boardId
    };
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
   * Trigger OpenShock reward for the user
   */
  async triggerOpenshockReward(username, reward, slotIndex) {
    try {
      this._debugLog('triggerOpenshockReward called', {
        username,
        slotIndex,
        reward: {
          enabled: reward.enabled,
          type: reward.type,
          intensity: reward.intensity,
          duration: reward.duration,
          deviceIds: reward.deviceIds
        }
      });

      // Get OpenShock plugin
      const openshockPlugin = this.api.pluginLoader?.loadedPlugins?.get('openshock');
      
      this._debugLog('OpenShock plugin lookup', {
        found: !!openshockPlugin,
        hasInstance: !!openshockPlugin?.instance
      });
      
      if (!openshockPlugin || !openshockPlugin.instance) {
        this.logger.warn('OpenShock plugin not available for reward trigger');
        return false;
      }

      let { duration, intensity, type, deviceIds, deviceId } = reward;
      
      // Validate and sanitize reward parameters
      const isValidParam = (val) => val != null && val !== '';
      const isValidNumber = (val) => typeof val === 'number' && !isNaN(val);
      
      // Validate type
      if (!isValidParam(type)) {
        this.logger.warn('Invalid OpenShock reward configuration - missing type field');
        return false;
      }
      
      // Check if intensity and duration exist at all
      if (intensity === undefined || duration === undefined) {
        this.logger.warn('Invalid OpenShock reward configuration - missing intensity or duration field');
        return false;
      }
      
      // Validate and sanitize intensity and duration (handle NaN from invalid input)
      // This handles the case where parseInt() returns NaN from invalid form input
      if (!isValidNumber(intensity)) {
        this.logger.warn(`Invalid OpenShock reward intensity value (${intensity}), using default value of 30`);
        intensity = 30;
      }
      
      if (!isValidNumber(duration)) {
        this.logger.warn(`Invalid OpenShock reward duration value (${duration}), using default value of 1000ms`);
        duration = 1000;
      }

      // Support both old (deviceId) and new (deviceIds) format
      let targetDeviceIds = [];
      if (Array.isArray(deviceIds) && deviceIds.length > 0) {
        targetDeviceIds = deviceIds;
      } else if (deviceId && deviceId !== '') {
        // Backward compatibility with old single deviceId format
        targetDeviceIds = [deviceId];
      }

      if (targetDeviceIds.length === 0) {
        this.logger.warn('No device IDs configured for OpenShock reward');
        return false;
      }

      // Check for duplicate batch within deduplication window
      const batchKey = this._getOpenshockBatchKey(username, targetDeviceIds, type, intensity, duration);
      if (this._isDuplicateOpenshockBatch(batchKey)) {
        this.logger.info(`[Plinko] Duplicate OpenShock batch blocked for ${username}`, {
          deviceCount: targetDeviceIds.length,
          type,
          intensity,
          duration,
          windowMs: this.openshockBatchWindow
        });
        return false;
      }

      this._debugLog(`Queuing ${targetDeviceIds.length} OpenShock commands`, {
        devices: targetDeviceIds,
        type,
        intensity,
        duration
      });

      // Trigger for all selected devices in parallel
      let successCount = 0;
      const queuePromises = targetDeviceIds.map(targetDeviceId => {
        // Build command for queue with safety limits
        const command = {
          deviceId: targetDeviceId,
          type: type, // 'Shock', 'Vibrate', or 'Sound'
          intensity: Math.min(Math.max(OPENSHOCK_MIN_INTENSITY, intensity), OPENSHOCK_MAX_INTENSITY), // Clamp to safety range
          duration: Math.min(Math.max(OPENSHOCK_MIN_DURATION_MS, duration), OPENSHOCK_MAX_DURATION_MS) // Clamp to safety range
        };

        // Queue OpenShock command via QueueManager
        return openshockPlugin.instance.queueManager.enqueue(
          command,
          username,
          'plinko-reward',
          { 
            slotIndex: slotIndex, // Pass actual slot index from handleBallLanded
            reward: reward 
          },
          5 // Medium priority
        ).then(result => ({ targetDeviceId, result }));
      });

      // Wait for all queue operations to complete
      const results = await Promise.allSettled(queuePromises);

      // Process results
      results.forEach(({ status, value, reason }) => {
        if (status === 'fulfilled' && value.result.success) {
          successCount++;
          this.logger.info(`⚡ OpenShock ${type} queued for ${username} on device ${value.targetDeviceId}: ${intensity}% for ${duration}ms (Queue ID: ${value.result.queueId})`);
        } else {
          const deviceId = status === 'fulfilled' ? value.targetDeviceId : 'unknown';
          const message = status === 'fulfilled' ? value.result.message : reason?.message || 'Unknown error';
          this.logger.warn(`Failed to queue OpenShock command for device ${deviceId}: ${message}`);
        }
      });

      this._debugLog('OpenShock trigger complete', {
        successCount,
        totalDevices: targetDeviceIds.length,
        successRate: `${Math.round((successCount / targetDeviceIds.length) * 100)}%`
      });

      // Emit event for overlay notification if at least one succeeded
      if (successCount > 0) {
        this.io.emit('plinko:openshock-triggered', {
          username,
          type,
          duration,
          intensity,
          deviceCount: successCount,
          totalDevices: targetDeviceIds.length
        });
        
        return true;
      } else {
        this.logger.warn('All OpenShock commands failed to queue');
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to trigger OpenShock reward: ${error.message}`);
      this._debugLog('OpenShock trigger error', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Get Plinko statistics
   */
  getStats() {
    return this.db.getPlinkoStats();
  }

  /**
   * Get user's Plinko history
   */
  getUserHistory(username, limit = 10) {
    return this.db.getPlinkUserStats(username, limit);
  }

  /**
   * Get Plinko leaderboard
   */
  getLeaderboard(limit = 10) {
    return this.db.getPlinkoLeaderboard(limit);
  }
  _supportsDurableInFlight() {
    if (typeof this.db?.db?.transaction !== 'function') return false;
    return [
      'createPlinkoInFlight',
      'getPlinkoInFlight',
      'getRecoverablePlinkoInFlight',
      'markPlinkoInFlightSettled',
      'markPlinkoInFlightRefunded',
      'discardPlinkoInFlight',
      'discardPendingPlinkoDebit',
      'markPlinkoInFlightDebitConfirmed',
      'claimPlinkoInFlightPayout',
      'claimPlinkoInFlightRefund'
    ].every(method => typeof this.db?.[method] === 'function');
  }

  async _spawnDurableBall(username, nickname, profilePictureUrl, betAmount, ballType, options) {
    const {
      skipValidation = false,
      skipDeduction = false,
      testMode = false,
      batchId = null,
      preferredColor = null,
      boardId = null,
      queueManaged = false
    } = options;
    const config = boardId !== null ? this.getConfig(boardId) : this.getConfig();
    const isTest = testMode || config.physicsSettings.testModeEnabled;
    const isQueueManaged = queueManaged === true || options.forceStart === true;

    if (!skipValidation && !isTest) {
      const validation = await this.validateBet(username, betAmount);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    const ballId = `ball_${crypto.randomUUID()}`;
    let serverSlotIndex;
    try {
      serverSlotIndex = this._selectServerSlotIndex(config);
    } catch (error) {
      return { success: false, error: error.message };
    }

    const serverMultiplier = Number(config.slots[serverSlotIndex]?.multiplier);
    const requiresDurableDebit = !skipDeduction && !isTest;
    const ballData = {
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType,
      timestamp: Date.now(),
      batchId,
      boardId,
      serverSlotIndex,
      serverMultiplier: Number.isFinite(serverMultiplier) ? serverMultiplier : null,
      isTest,
      queueManaged: isQueueManaged,
      state: requiresDurableDebit ? 'debit_pending' : 'in_flight'
    };

    try {
      this.db.createPlinkoInFlight({ ballId, ...ballData });
    } catch (error) {
      this.logger.error(`[PLINKO] Failed to persist in-flight ball ${ballId}: ${error.message}`);
      return { success: false, error: 'Failed to persist Plinko outcome' };
    }

    if (requiresDurableDebit) {
      const deducted = await this.deductXP(username, betAmount, `plinko:${ballId}:bet`);
      if (!deducted) {
        this.db.discardPendingPlinkoDebit(ballId, { reason: 'bet_debit_failed' });
        return { success: false, error: 'Failed to deduct XP' };
      }

      const confirmed = this.db.markPlinkoInFlightDebitConfirmed(ballId);
      if (!confirmed) {
        const persisted = this.db.getPlinkoInFlight(ballId);
        if (persisted?.state !== 'in_flight') {
          return { success: false, error: 'Failed to confirm Plinko bet' };
        }
      }
    }

    this.activeBalls.set(ballId, ballData);

    const globalMultiplier = config.giftMappings?.[ballType]?.multiplier || 1.0;
    const color = this.getBallColor(username, preferredColor);
    this.io.emit('plinko:spawn-ball', {
      ballId,
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType,
      globalMultiplier,
      timestamp: ballData.timestamp,
      color,
      batchId,
      boardId,
      boardName: config.name,
      targetSlotIndex: serverSlotIndex,
      testMode: isTest
    });

    this.logger.info(
      `[PLINKO] Durable ball spawned: ${username} bet ${betAmount} XP (ballId: ${ballId}${batchId ? `, batch ${batchId}` : ''})`
    );
    return { success: true, ballId };
  }

  async _spawnDurableTestBall(playerName, betAmount, boardId) {
    const username = `test_${playerName}_${Date.now()}`;
    const nickname = playerName;
    const profilePictureUrl = '';
    const config = boardId ? this.getConfig(boardId) : this.getConfig();
    if (!config) {
      return { success: false, error: 'Board not found' };
    }

    let serverSlotIndex;
    try {
      serverSlotIndex = this._selectServerSlotIndex(config);
    } catch (error) {
      return { success: false, error: error.message };
    }

    const ballId = `test-ball_${crypto.randomUUID()}`;
    const serverMultiplier = Number(config.slots[serverSlotIndex]?.multiplier);
    const ballData = {
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType: 'standard',
      timestamp: Date.now(),
      batchId: null,
      boardId,
      serverSlotIndex,
      serverMultiplier: Number.isFinite(serverMultiplier) ? serverMultiplier : null,
      isTest: true
    };

    try {
      this.db.createPlinkoInFlight({ ballId, ...ballData });
    } catch (error) {
      this.logger.error(`[PLINKO] Failed to persist test ball ${ballId}: ${error.message}`);
      return { success: false, error: 'Failed to persist Plinko outcome' };
    }

    this.activeBalls.set(ballId, ballData);
    const color = this.getBallColor(username, null);
    this.io.emit('plinko:spawn-ball', {
      ballId,
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType: 'standard',
      globalMultiplier: 1.0,
      timestamp: ballData.timestamp,
      color,
      boardId,
      boardName: config.name,
      targetSlotIndex: serverSlotIndex,
      isTest: true
    });

    return { success: true, ballId, testMode: true };
  }

  async recoverInFlightBalls() {
    if (!this._supportsDurableInFlight()) return [];

    const recovered = [];
    for (let ball of this.db.getRecoverablePlinkoInFlight()) {
      if (ball.state === 'payout_claimed') {
        const payout = await this._resumeDurablePayout(ball);
        recovered.push({ ballId: ball.ballId, payoutResumed: payout.settled });
        continue;
      }

      if (ball.state === 'refund_claimed') {
        const refunded = await this._refundDurableBall(ball);
        recovered.push({ ballId: ball.ballId, refundResumed: refunded });
        continue;
      }

      if (ball.state === 'debit_pending') {
        const debitedBall = await this._recoverDurableDebit(ball);
        if (!debitedBall) {
          recovered.push({ ballId: ball.ballId, debitPending: true });
          continue;
        }
        ball = debitedBall;
      }

      if (Date.now() - ball.timestamp > MAX_BALL_AGE_MS) {
        if (ball.isTest) {
          const discarded = this.db.discardPlinkoInFlight(ball.ballId, {
            reason: 'expired_test_ball'
          });
          recovered.push({ ballId: ball.ballId, discarded });
        } else {
          const refunded = await this._refundDurableBall(ball);
          recovered.push({ ballId: ball.ballId, refunded });
        }
        continue;
      }

      this._hydrateDurableBall(ball);
      recovered.push({ ballId: ball.ballId, recovered: true });
    }
    return recovered;
  }

  _hydrateDurableBall(ball) {
    const ballData = {
      username: ball.username,
      nickname: ball.nickname,
      profilePictureUrl: ball.profilePictureUrl || '',
      bet: ball.bet,
      ballType: ball.ballType || 'standard',
      timestamp: ball.timestamp,
      batchId: ball.batchId || null,
      boardId: ball.boardId,
      serverSlotIndex: ball.serverSlotIndex,
      serverMultiplier: ball.serverMultiplier,
      isTest: ball.isTest,
      queueManaged: ball.queueManaged === true
    };
    this.activeBalls.set(ball.ballId, ballData);
    return ballData;
  }

  async _recoverDurableDebit(ball) {
    if (ball.isTest) {
      this.db.discardPlinkoInFlight(ball.ballId, { reason: 'test_ball_without_debit' });
      return null;
    }

    const deducted = await this.deductXP(
      ball.username,
      ball.bet,
      `plinko:${ball.ballId}:bet`
    );
    if (!deducted) {
      this.logger.warn(`[PLINKO] Could not resume pending bet for ${ball.ballId}`);
      return null;
    }

    const confirmed = this.db.markPlinkoInFlightDebitConfirmed(ball.ballId);
    const current = this.db.getPlinkoInFlight(ball.ballId);
    if (!confirmed && current?.state !== 'in_flight') {
      this.logger.warn(`[PLINKO] Could not confirm pending bet for ${ball.ballId}`);
      return null;
    }
    return current;
  }

  _getDurableSettlement(ball) {
    const stored = ball.settlement || {};
    const slotIndex = Number.isInteger(stored.slotIndex)
      ? stored.slotIndex
      : ball.serverSlotIndex;
    const rawMultiplier = stored.multiplier ?? ball.serverMultiplier;
    if (!Number.isInteger(slotIndex) || rawMultiplier === null || rawMultiplier === undefined) {
      return null;
    }

    const multiplier = Number(rawMultiplier);
    if (!Number.isFinite(multiplier)) return null;

    const rawWinnings = stored.winnings;
    const winnings = rawWinnings === null || rawWinnings === undefined
      ? Math.floor(ball.bet * multiplier)
      : Number(rawWinnings);
    if (!Number.isFinite(winnings)) return null;

    const rawNetProfit = stored.netProfit;
    const netProfit = rawNetProfit === null || rawNetProfit === undefined
      ? winnings - ball.bet
      : Number(rawNetProfit);
    if (!Number.isFinite(netProfit)) return null;

    return { slotIndex, multiplier, winnings, netProfit };
  }

  async _resumeDurablePayout(ball) {
    const settlement = this._getDurableSettlement(ball);
    if (!settlement) {
      this.logger.error(`[PLINKO] Missing payout snapshot for ${ball.ballId}`);
      return { settled: false };
    }

    if (ball.isTest) {
      const discarded = this.db.discardPlinkoInFlight(ball.ballId, {
        ...settlement,
        reason: 'test_ball_landed'
      });
      return { ...settlement, settled: discarded, newlySettled: discarded };
    }

    if (settlement.winnings > 0) {
      const awarded = await this.awardXP(
        ball.username,
        settlement.winnings,
        settlement.multiplier,
        `plinko:${ball.ballId}:payout`
      );
      if (!awarded) {
        return { ...settlement, settled: false };
      }
    }

    if (typeof this.db.recordPlinkoTransaction === 'function') {
      this.db.recordPlinkoTransaction(
        ball.username,
        ball.bet,
        settlement.multiplier,
        settlement.netProfit,
        settlement.slotIndex,
        ball.ballId
      );
    }
    const marked = this.db.markPlinkoInFlightSettled(ball.ballId, settlement);
    const state = marked ? 'settled' : this.db.getPlinkoInFlight(ball.ballId)?.state;
    return {
      ...settlement,
      settled: state === 'settled',
      newlySettled: marked
    };
  }

  async _handleDurableBallLanded(ballId, reportedSlotIndex) {
    let ballData = this.activeBalls.get(ballId);
    if (!ballData) {
      const persisted = this.db.getPlinkoInFlight(ballId);
      if (!persisted) {
        this.logger.warn(`Ball ${ballId} not found in active balls`);
        return { success: false, error: 'Ball not found' };
      }
      if (persisted.state === 'payout_claimed') {
        const payout = await this._resumeDurablePayout(persisted);
        return {
          success: payout.settled,
          username: persisted.username,
          bet: persisted.bet,
          multiplier: payout.multiplier,
          winnings: payout.winnings,
          netProfit: payout.netProfit,
          boardId: persisted.boardId
        };
      }
      if (persisted.state !== 'in_flight') {
        this.logger.warn(`Ball ${ballId} is no longer eligible to land (${persisted.state})`);
        return { success: false, error: 'Ball is no longer in flight' };
      }
      ballData = this._hydrateDurableBall(persisted);
    }

    const isTestBall = Boolean(ballData.isTest);
    if (!isTestBall) {
      const flightTime = Date.now() - ballData.timestamp;
      if (flightTime < MIN_FLIGHT_TIME_MS) {
        this.logger.warn(`Ball landed too quickly: ${flightTime}ms (minimum: ${MIN_FLIGHT_TIME_MS}ms) - possible glitch or manipulation`);
        this.activeBalls.delete(ballId);
        return { success: false, error: 'Invalid drop time' };
      }
    }

    let config = null;
    try {
      config = ballData.boardId !== null && ballData.boardId !== undefined
        ? this.getConfig(ballData.boardId)
        : this.getConfig();
    } catch (error) {
      this.logger.warn(`[PLINKO] Display config unavailable for durable ball ${ballId}: ${error.message}`);
    }

    let slotIndex = ballData.serverSlotIndex;
    if (!Number.isInteger(slotIndex)) {
      if (!config?.slots?.length) {
        this.activeBalls.delete(ballId);
        return { success: false, error: 'Missing durable slot snapshot' };
      }
      slotIndex = this._selectServerSlotIndex(config);
      ballData.serverSlotIndex = slotIndex;
    }
    if (Number.isInteger(reportedSlotIndex) && reportedSlotIndex !== slotIndex) {
      this.logger.warn(`Plinko visual desync for ${ballId}: overlay reported ${reportedSlotIndex}, server selected ${slotIndex}`);
    }
    if (slotIndex < 0) {
      this.activeBalls.delete(ballId);
      return { success: false, error: 'Invalid slot' };
    }

    this.activeBalls.delete(ballId);
    const fallbackMultiplier = config?.slots?.[slotIndex]?.multiplier;
    const settlement = this._getDurableSettlement({
      ...ballData,
      serverSlotIndex: slotIndex,
      serverMultiplier: ballData.serverMultiplier ?? fallbackMultiplier
    });
    if (!settlement) {
      return { success: false, error: 'Missing durable payout snapshot' };
    }
    const { multiplier, winnings: profit, netProfit } = settlement;
    const slot = config?.slots?.[slotIndex] || null;

    let newlySettled = false;
    if (isTestBall) {
      if (typeof this.db.recordPlinkoTestTransaction === 'function') {
        this.db.recordPlinkoTestTransaction(
          ballData.username,
          ballData.bet,
          multiplier,
          netProfit,
          slotIndex
        );
      }
      newlySettled = this.db.discardPlinkoInFlight(ballId, {
        ...settlement,
        reason: 'test_ball_landed'
      });
    } else {
      let operation = this.db.getPlinkoInFlight(ballId);
      let payout;
      if (operation?.state === 'refund_claimed') {
        return { success: false, error: 'Ball is being refunded' };
      }
      if (operation?.state === 'payout_claimed') {
        payout = await this._resumeDurablePayout(operation);
      } else {
        const claimed = this.db.claimPlinkoInFlightPayout(ballId, settlement);
        if (claimed) {
          payout = await this._resumeDurablePayout(this.db.getPlinkoInFlight(ballId));
        } else {
          operation = this.db.getPlinkoInFlight(ballId);
          if (operation?.state === 'payout_claimed') {
            payout = await this._resumeDurablePayout(operation);
          } else if (operation?.state === 'settled') {
            payout = { settled: true, newlySettled: false };
          } else {
            return { success: false, error: 'Failed to claim Plinko payout' };
          }
        }
      }
      if (!payout?.settled) {
        return { success: false, error: 'Failed to award XP' };
      }
      newlySettled = Boolean(payout.newlySettled);
    }

    if (!newlySettled) {
      return {
        success: true,
        username: ballData.username,
        bet: ballData.bet,
        multiplier,
        winnings: profit,
        netProfit,
        boardId: ballData.boardId
      };
    }

    if (slot?.openshockReward?.enabled) {
      this.io.emit('plinko:openshock-review-required', {
        ballId,
        username: ballData.username,
        nickname: ballData.nickname,
        slotIndex,
        boardId: ballData.boardId
      });
      this.logger.warn(`Plinko OpenShock reward suppressed for ${ballId}; streamer review is required`);
    }

    if (config?.slots?.length && (!this.slotHitCounts.length || this.slotHitCounts.length !== config.slots.length)) {
      this.slotHitCounts = new Array(config.slots.length || 0).fill(0);
    }
    if (config?.slots?.length && this.slotHitCounts[slotIndex] !== undefined) {
      this.slotHitCounts[slotIndex] += 1;
      this.io.emit('plinko:heatmap', { counts: this.slotHitCounts });
    }

    if (ballData.batchId && this.batchTrackers.has(ballData.batchId)) {
      const tracker = this.batchTrackers.get(ballData.batchId);
      tracker.remaining -= 1;
      tracker.totalWinnings += profit;
      tracker.net += netProfit;
      tracker.slots.push({ slotIndex, multiplier, winnings: profit, net: netProfit });
      if (tracker.remaining <= 0) {
        this.batchTrackers.delete(ballData.batchId);
        this._emitCompletedBatch(
          ballData.batchId,
          ballData.username,
          tracker.boardId,
          tracker
        );
      } else {
        this.batchTrackers.set(ballData.batchId, tracker);
      }
    } else if (ballData.queueManaged === true) {
      this._scheduleQueueRelease();
    }

    this.io.emit('plinko:ball-result', {
      ballId,
      username: ballData.username,
      nickname: ballData.nickname,
      bet: ballData.bet,
      slotIndex,
      multiplier,
      winnings: profit,
      netProfit,
      boardId: ballData.boardId
    });

    return {
      success: true,
      username: ballData.username,
      bet: ballData.bet,
      multiplier,
      winnings: profit,
      netProfit,
      boardId: ballData.boardId
    };
  }

  async _cleanupDurableOldBalls(maxAgeMs) {
    const results = [];

    for (let ball of this.db.getRecoverablePlinkoInFlight()) {
      if (ball.state === 'payout_claimed') {
        const payout = await this._resumeDurablePayout(ball);
        results.push({ ballId: ball.ballId, payoutResumed: payout.settled });
        continue;
      }

      if (ball.state === 'refund_claimed') {
        const refunded = await this._refundDurableBall(ball);
        results.push({ ballId: ball.ballId, refundResumed: refunded });
        continue;
      }

      if (ball.state === 'debit_pending') {
        const debitedBall = await this._recoverDurableDebit(ball);
        if (!debitedBall) {
          results.push({ ballId: ball.ballId, debitPending: true });
          continue;
        }
        ball = debitedBall;
      }

      if (Date.now() - ball.timestamp <= maxAgeMs) continue;

      this.activeBalls.delete(ball.ballId);
      if (ball.isTest) {
        const discarded = this.db.discardPlinkoInFlight(ball.ballId, {
          reason: 'expired_test_ball'
        });
        results.push({ ballId: ball.ballId, discarded });
        continue;
      }

      const refunded = await this._refundDurableBall(ball);
      results.push({ ballId: ball.ballId, refunded });
    }

    if (results.length > 0) {
      this.logger.info(`[PLINKO] Cleaned up ${results.length} durable stuck ball(s)`);
    }
    return results;
  }

  async _refundDurableBall(ball) {
    if (ball.isTest) {
      return this.db.discardPlinkoInFlight(ball.ballId, { reason: 'expired_test_ball' });
    }

    let refundBall = ball;
    const refundSettlement = {
      bet: ball.bet,
      reason: 'expired_in_flight_ball'
    };
    if (ball.state === 'in_flight') {
      const claimed = this.db.claimPlinkoInFlightRefund(ball.ballId, refundSettlement);
      if (claimed) {
        refundBall = this.db.getPlinkoInFlight(ball.ballId);
      } else {
        const current = this.db.getPlinkoInFlight(ball.ballId);
        if (current?.state !== 'refund_claimed') return false;
        refundBall = current;
      }
    } else if (ball.state !== 'refund_claimed') {
      return false;
    }

    const refunded = await this.awardXP(
      refundBall.username,
      refundBall.bet,
      1,
      `plinko:${refundBall.ballId}:refund`,
      'plinko_refund',
      {
        ballId: refundBall.ballId,
        bet: refundBall.bet,
        reason: 'expired_in_flight_ball'
      }
    );
    if (!refunded) return false;

    const marked = this.db.markPlinkoInFlightRefunded(refundBall.ballId, refundSettlement);
    const state = marked ? 'refunded' : this.db.getPlinkoInFlight(refundBall.ballId)?.state;
    if (marked) {
      this.io.emit('plinko:notification', {
        message: `Stuck ball refunded for ${refundBall.nickname || refundBall.username}`,
        username: refundBall.username,
        nickname: refundBall.nickname,
        amount: refundBall.bet,
        type: 'refund'
      });
    }
    return state === 'refunded';
  }


  /**
   * Clean up old balls (if they get stuck)
   */
  cleanupOldBalls(maxAgeMs = MAX_BALL_AGE_MS) {
    const now = Date.now();
    const oldBalls = [];
    if (this._supportsDurableInFlight()) {
      return this._cleanupDurableOldBalls(maxAgeMs);
    }

    
    for (const [ballId, ballData] of this.activeBalls.entries()) {
      if (now - ballData.timestamp > maxAgeMs) {
        oldBalls.push(ballId);
      }
    }

    for (const ballId of oldBalls) {
      const ballData = this.activeBalls.get(ballId);
      this.logger.warn(`Cleaning up stuck ball ${ballId} for user ${ballData.username}`);
      
      // Refund the bet (add it back)
      this.awardXP(ballData.username, ballData.bet, 1.0);
      
      // Notify overlay about the refund
      this.io.emit('plinko:notification', {
        message: `Stuck ball refunded for ${ballData.nickname || ballData.username}`,
        username: ballData.username,
        nickname: ballData.nickname,
        amount: ballData.bet,
        type: 'refund'
      });
      
      // Remove from active balls
      this.activeBalls.delete(ballId);
    }

    if (oldBalls.length > 0) {
      this.logger.info(`🧹 Cleaned up ${oldBalls.length} stuck Plinko balls`);
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanupTimer() {
    // Run cleanup every 30 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldBalls();
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
   * Debug log helper - only logs if debugMode is enabled
   * @private
   * @param {string} message - Debug message
   * @param {object} data - Optional data to log
   */
  _debugLog(message, data = null) {
    if (this.debugMode) {
      if (data) {
        this.logger.info(`🔍 [Plinko Debug] ${message}`, data);
      } else {
        this.logger.info(`🔍 [Plinko Debug] ${message}`);
      }
    }
  }

  /**
   * Enable or disable debug mode
   * @param {boolean} enabled - Debug mode state
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.logger.info(`🔍 Plinko debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Destroy Plinko game
   */
  destroy() {
    this.stopCleanupTimer();
    this.activeBalls.clear();
    this.logger.info('🎰 Plinko game destroyed');
  }
}

module.exports = PlinkoGame;
