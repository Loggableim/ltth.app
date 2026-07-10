/**
 * Unified Queue Manager for Game Engine
 * 
 * Manages a single FIFO queue for Plinko, Wheel, Connect4, and Chess games.
 * Ensures proper ordering and prevents conflicts when multiple games are triggered.
 */

class UnifiedQueueManager {
  constructor(logger, io) {
    this.logger = logger;
    this.io = io;
    
    // Unified queue for all games
    // Format: { type: 'plinko'|'wheel'|'connect4'|'chess', data: {...}, timestamp: number }
    this.queue = [];
    
    // Is any game currently processing?
    this.isProcessing = false;
    
    // Current active item
    this.currentItem = null;
    
    // Game references (set by games themselves)
    this.plinkoGame = null;
    this.wheelGame = null;
    this.slotGame = null;
    this.gameEnginePlugin = null; // Reference to main plugin for Connect4/Chess
    
    // Processing timeout (for safety)
    this.processingTimeout = null;
    this.processNextTimer = null;
    this.MAX_PROCESSING_TIME = 180000; // 3 minutes max per item (fallback)
    
    // Game-specific timeouts (in milliseconds)
    // These are realistic timeouts based on actual game duration
    this.GAME_TIMEOUTS = {
      wheel: 45000,      // 45 seconds (spin + winner display + info screen + buffer)
      plinko: 60000,     // 60 seconds (ball drop + result display)
      slot: 25000,       // 25 seconds (spin animation + result display + buffer)
      connect4: 300000,  // 5 minutes (interactive gameplay)
      chess: 600000      // 10 minutes (turn-based gameplay)
    };
    
    // Queue size limits (prevent memory exhaustion from rapid triggers)
    this.MAX_QUEUE_SIZE = 50; // Maximum items in queue
    this.QUEUE_WARNING_SIZE = 40; // Warning threshold
    
    // Overlay mode tracking per game type (unified vs legacy)
    this.gameModes = new Map(); // gameType -> useUnified (boolean)
  }

  /**
   * Set game references
   */
  setPlinkoGame(plinkoGame) {
    this.plinkoGame = plinkoGame;
  }

  setWheelGame(wheelGame) {
    this.wheelGame = wheelGame;
  }

  setSlotGame(slotGame) {
    this.slotGame = slotGame;
  }

  setGameEnginePlugin(gameEnginePlugin) {
    this.gameEnginePlugin = gameEnginePlugin;
  }
  
  /**
   * Set overlay mode for a specific game type
   * @param {string} gameType - Game type (connect4, chess, plinko, wheel)
   * @param {boolean} useUnified - Whether to use unified overlay
   */
  setGameMode(gameType, useUnified) {
    this.gameModes.set(gameType, useUnified);
    this.logger.debug(`[UNIFIED QUEUE] Set overlay mode for ${gameType}: ${useUnified ? 'unified' : 'legacy'}`);
  }
  
  /**
   * Check if a game type should use unified overlay
   * @param {string} gameType - Game type
   * @returns {boolean} True if should use unified overlay (default: true if not explicitly set)
   */
  shouldUseUnifiedOverlay(gameType) {
    // Default to true if not explicitly set to false
    // This allows opt-out behavior: games default to unified mode unless specifically disabled
    return this.gameModes.get(gameType) !== false;
  }
  
  /**
   * Switch to a specific game in the unified overlay
   * @param {string} gameType - Game type
   * @param {string} sessionId - Session ID
   * @param {Object} config - Game configuration
   */
  switchGame(gameType, sessionId, config) {
    const useUnified = this.shouldUseUnifiedOverlay(gameType);
    
    if (useUnified) {
      this.logger.info(`[UNIFIED QUEUE] Switching to ${gameType} (session: ${sessionId})`);
      
      // Emit game-switched event to unified overlay
      this.io.emit('game-engine:game-switched', {
        gameType,
        sessionId,
        state: 'starting',
        config,
        useUnified: true,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Add Plinko drop to queue
   * @param {Object} dropData - Plinko drop data
   * @returns {Object} { queued: boolean, position: number, error?: string }
   */
  queuePlinko(dropData) {
    // Check queue size limit
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Plinko queue full (${this.queue.length}/${this.MAX_QUEUE_SIZE}), rejecting ${dropData.username}`);
      this.io.emit('unified-queue:queue-full', {
        type: 'plinko',
        username: dropData.username,
        nickname: this.getDisplayName(dropData),
        queueLength: this.queue.length,
        maxSize: this.MAX_QUEUE_SIZE
      });
      return { queued: false, position: 0, error: 'Queue is full' };
    }
    
    const item = {
      type: 'plinko',
      data: dropData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    // Warning if queue is getting large
    if (this.queue.length >= this.QUEUE_WARNING_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Queue size warning: ${this.queue.length}/${this.MAX_QUEUE_SIZE}`);
    }
    
    this.logger.info(`🎰 [UNIFIED QUEUE] Plinko queued for ${dropData.username} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:plinko-queued', {
      position,
      username: dropData.username,
      nickname: this.getDisplayName(dropData),
      batchId: dropData.batchId,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.scheduleProcessNext();
    
    return { queued: true, position };
  }

  /**
   * Add Wheel spin to queue
   * @param {Object} spinData - Wheel spin data
   * @returns {Object} { queued: boolean, position: number, error?: string }
   */
  queueWheel(spinData) {
    // Check queue size limit
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Wheel queue full (${this.queue.length}/${this.MAX_QUEUE_SIZE}), rejecting ${spinData.username}`);
      this.io.emit('unified-queue:queue-full', {
        type: 'wheel',
        username: spinData.username,
        nickname: this.getDisplayName(spinData),
        spinId: spinData.spinId,
        queueLength: this.queue.length,
        maxSize: this.MAX_QUEUE_SIZE
      });
      return { queued: false, position: 0, error: 'Queue is full' };
    }
    
    const item = {
      type: 'wheel',
      data: spinData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    // Warning if queue is getting large
    if (this.queue.length >= this.QUEUE_WARNING_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Queue size warning: ${this.queue.length}/${this.MAX_QUEUE_SIZE}`);
    }
    
    this.logger.info(`🎡 [UNIFIED QUEUE] Wheel queued for ${spinData.username} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:wheel-queued', {
      position,
      username: spinData.username,
      nickname: this.getDisplayName(spinData),
      spinId: spinData.spinId,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.scheduleProcessNext();
    
    return { queued: true, position };
  }

  /**
   * Add Connect4 game to queue
   * @param {Object} gameData - Connect4 game data
   * @returns {Object} { queued: boolean, position: number, error?: string }
   */
  queueConnect4(gameData) {
    // Check queue size limit
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Connect4 queue full (${this.queue.length}/${this.MAX_QUEUE_SIZE}), rejecting ${gameData.viewerUsername}`);
      this.io.emit('unified-queue:queue-full', {
        type: 'connect4',
        username: gameData.viewerUsername,
        nickname: gameData.viewerNickname,
        queueLength: this.queue.length,
        maxSize: this.MAX_QUEUE_SIZE
      });
      return { queued: false, position: 0, error: 'Queue is full' };
    }
    
    const item = {
      type: 'connect4',
      data: gameData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    // Warning if queue is getting large
    if (this.queue.length >= this.QUEUE_WARNING_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Queue size warning: ${this.queue.length}/${this.MAX_QUEUE_SIZE}`);
    }
    
    this.logger.info(`🎮 [UNIFIED QUEUE] Connect4 queued for ${gameData.viewerUsername} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:connect4-queued', {
      position,
      gameType: 'connect4',
      username: gameData.viewerUsername,
      nickname: gameData.viewerNickname,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.scheduleProcessNext();
    
    return { queued: true, position };
  }

  /**
   * Add Chess game to queue
   * @param {Object} gameData - Chess game data
   * @returns {Object} { queued: boolean, position: number, error?: string }
   */
  queueChess(gameData) {
    // Check queue size limit
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Chess queue full (${this.queue.length}/${this.MAX_QUEUE_SIZE}), rejecting ${gameData.viewerUsername}`);
      this.io.emit('unified-queue:queue-full', {
        type: 'chess',
        username: gameData.viewerUsername,
        nickname: gameData.viewerNickname,
        queueLength: this.queue.length,
        maxSize: this.MAX_QUEUE_SIZE
      });
      return { queued: false, position: 0, error: 'Queue is full' };
    }
    
    const item = {
      type: 'chess',
      data: gameData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    // Warning if queue is getting large
    if (this.queue.length >= this.QUEUE_WARNING_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Queue size warning: ${this.queue.length}/${this.MAX_QUEUE_SIZE}`);
    }
    
    this.logger.info(`♟️ [UNIFIED QUEUE] Chess queued for ${gameData.viewerUsername} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:chess-queued', {
      position,
      gameType: 'chess',
      username: gameData.viewerUsername,
      nickname: gameData.viewerNickname,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.scheduleProcessNext();
    
    return { queued: true, position };
  }

  /**
   * Add Slot spin to queue
   * @param {Object} spinData - Slot spin data
   * @returns {Object} { queued: boolean, position: number, error?: string }
   */
  queueSlot(spinData) {
    // Check queue size limit
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Slot queue full (${this.queue.length}/${this.MAX_QUEUE_SIZE}), rejecting ${spinData.username}`);
      this.io.emit('unified-queue:queue-full', {
        type: 'slot',
        username: spinData.username,
        nickname: this.getDisplayName(spinData),
        spinId: spinData.spinId,
        queueLength: this.queue.length,
        maxSize: this.MAX_QUEUE_SIZE
      });
      return { queued: false, position: 0, error: 'Queue is full' };
    }

    const item = {
      type: 'slot',
      data: spinData,
      timestamp: Date.now()
    };

    this.queue.push(item);
    const position = this.queue.length;

    if (this.queue.length >= this.QUEUE_WARNING_SIZE) {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Queue size warning: ${this.queue.length}/${this.MAX_QUEUE_SIZE}`);
    }

    this.logger.info(`🎰 [UNIFIED QUEUE] Slot enqueued for ${spinData.username} (position: ${position}, spinId: ${spinData.spinId})`);

    this.io.emit('unified-queue:slot-queued', {
      position,
      type: 'slot',
      username: spinData.username,
      nickname: this.getDisplayName(spinData),
      spinId: spinData.spinId,
      queueLength: this.queue.length
    });

    // Try to process if not already processing
    this.scheduleProcessNext();

    return { queued: true, position };
  }

  /**
   * Check if queue should accept new items (i.e., is something currently active?)
   * @returns {boolean} True if items should be queued
   */
  shouldQueue() {
    return this.isProcessing || this.queue.length > 0;
  }

  /**
   * Connect4 and Chess share the main game session map. Do not dequeue a new
   * interactive game while another session or challenge is still active.
   */
  hasBlockingInteractiveGame(item) {
    if (!item || (item.type !== 'connect4' && item.type !== 'chess')) {
      return false;
    }

    return !!(
      this.gameEnginePlugin &&
      (
        this.gameEnginePlugin.activeSessions?.size > 0 ||
        this.gameEnginePlugin.pendingChallenges?.size > 0
      )
    );
  }

  /**
   * Get display name for queued item.
   */
  getDisplayName(data) {
    return data?.nickname || data?.viewerNickname || data?.username || data?.viewerUsername;
  }

  /**
   * Extract username from queued item data
   */
  extractUsername(data) {
    return data?.username || data?.viewerUsername;
  }

  /**
   * Get timeout duration for a specific game type
   * For wheel games, calculate based on spin configuration
   * @param {Object} item - Queue item
   * @returns {number} Timeout in milliseconds
   */
  getTimeoutForGame(item) {
    if (!item || !item.type) {
      return this.MAX_PROCESSING_TIME;
    }
    
    // For wheel, calculate based on actual spin configuration
    if (item.type === 'wheel' && item.data) {
      const spinDuration = item.data.spinDuration || 5000;
      const settings = item.data.settings || {};
      const winnerDisplayDuration = (settings.winnerDisplayDuration || 5) * 1000;
      const infoScreenDuration = settings.infoScreenEnabled ? (settings.infoScreenDuration || 5) * 1000 : 0;
      const buffer = 10000; // 10 second safety buffer
      
      const calculatedTimeout = spinDuration + winnerDisplayDuration + infoScreenDuration + buffer;
      this.logger.debug(`[UNIFIED QUEUE] Calculated wheel timeout: ${calculatedTimeout}ms (spin: ${spinDuration}ms, winner: ${winnerDisplayDuration}ms, info: ${infoScreenDuration}ms, buffer: ${buffer}ms)`);
      return calculatedTimeout;
    }

    // For slot, calculate based on actual spin configuration
    if (item.type === 'slot' && item.data) {
      const settings = item.data.settings || {};
      const spinDuration = settings.spinDuration || 3000;
      const reelStopDelay = settings.reelStopDelay || 400;
      const showResultDuration = settings.showResultDuration || 5000;
      const buffer = 8000; // 8 second safety buffer
      const calculatedTimeout = spinDuration + (reelStopDelay * 2) + 600 + showResultDuration + buffer;
      this.logger.debug(`[UNIFIED QUEUE] Calculated slot timeout: ${calculatedTimeout}ms`);
      return calculatedTimeout;
    }
    
    // Use predefined timeout for other game types
    return this.GAME_TIMEOUTS[item.type] || this.MAX_PROCESSING_TIME;
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      currentItem: this.currentItem ? {
        type: this.currentItem.type,
        username: this.extractUsername(this.currentItem.data),
        nickname: this.getDisplayName(this.currentItem.data),
        timestamp: this.currentItem.timestamp,
        ...(this.currentItem.data.spinId && { spinId: this.currentItem.data.spinId }),
        ...(this.currentItem.data.batchId && { batchId: this.currentItem.data.batchId }),
        ...(this.currentItem.data.gameType && { gameType: this.currentItem.data.gameType })
      } : null,
      queue: this.queue.map((item, index) => ({
        position: index + 1,
        type: item.type,
        username: this.extractUsername(item.data),
        nickname: this.getDisplayName(item.data),
        timestamp: item.timestamp,
        ...(item.data.spinId && { spinId: item.data.spinId }),
        ...(item.data.batchId && { batchId: item.data.batchId }),
        ...(item.data.gameType && { gameType: item.data.gameType })
      }))
    };
  }

  /**
   * Process next item in queue
   */
  async processNext() {
    // Already processing or queue empty
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    const nextItem = this.queue[0];
    if (this.hasBlockingInteractiveGame(nextItem)) {
      this.logger.debug(`[UNIFIED QUEUE] Deferring ${nextItem.type}; another interactive game is active`);
      return;
    }

    // Get next item (FIFO)
    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.isProcessing = true;
    this.currentItem = item;

    this.logger.info(`🎮 [UNIFIED QUEUE] Processing ${item.type} for ${item.data.username} (${this.queue.length} remaining)`);

    // Set safety timeout based on game type
    const timeoutDuration = this.getTimeoutForGame(item);
    this.processingTimeout = setTimeout(() => {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Processing timeout for ${item.type} after ${timeoutDuration}ms, forcing completion`);
      this.forceCompleteProcessing(item);
    }, timeoutDuration);
    if (typeof this.processingTimeout.unref === 'function') {
      this.processingTimeout.unref();
    }

    try {
      if (item.type === 'plinko') {
        await this.processPlinkoItem(item.data);
      } else if (item.type === 'wheel') {
        await this.processWheelItem(item.data);
      } else if (item.type === 'slot') {
        await this.processSlotItem(item.data);
      } else if (item.type === 'connect4') {
        await this.processConnect4Item(item.data);
      } else if (item.type === 'chess') {
        await this.processChessItem(item.data);
      }
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error processing ${item.type}: ${error.message}`);
      // Don't call completeProcessing here - let games handle their own completion
    }
  }

  scheduleProcessNext(delayMs = 0) {
    if (this.processNextTimer) {
      return;
    }

    this.processNextTimer = setTimeout(() => {
      this.processNextTimer = null;
      this.processNext();
    }, delayMs);
    if (typeof this.processNextTimer.unref === 'function') {
      this.processNextTimer.unref();
    }
  }

  /**
   * Process Plinko item
   */
  async processPlinkoItem(dropData) {
    if (!this.plinkoGame) {
      this.logger.error('❌ [UNIFIED QUEUE] Plinko game not set');
      this.completeProcessing();
      return;
    }

    try {
      const config = typeof this.plinkoGame.getConfig === 'function'
        ? this.plinkoGame.getConfig(dropData.boardId || null)
        : undefined;
      this.switchGame('plinko', dropData.batchId || `plinko_${dropData.username}_${Date.now()}`, config);

      const result = await this.plinkoGame.spawnBalls(
        dropData.username,
        dropData.nickname,
        dropData.profilePictureUrl,
        dropData.betAmount,
        dropData.count,
        { 
          batchId: dropData.batchId, 
          preferredColor: dropData.preferredColor,
          boardId: dropData.boardId || null,
          forceStart: true // Skip queue check since we're already in unified queue
        }
      );
      
      // Check if spawnBalls returned a failure response (not an exception)
      if (!result || result.success === false) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Plinko spawnBalls returned failure: ${result?.error || 'unknown'}`);
        this.completeProcessing();
        return;
      }
      
      // Note: completeProcessing() will be called by Plinko when batch is complete
      // or after a timeout
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error spawning Plinko balls: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Wheel item
   */
  async processWheelItem(spinData) {
    if (!this.wheelGame) {
      this.logger.error('❌ [UNIFIED QUEUE] Wheel game not set');
      this.completeProcessing();
      return;
    }

    try {
      const config = typeof this.wheelGame.getConfig === 'function'
        ? this.wheelGame.getConfig(spinData.wheelId || null)
        : undefined;
      this.switchGame('wheel', spinData.spinId, config);

      const result = await this.wheelGame.startSpin(spinData);
      
      // Check if startSpin returned a failure response (not an exception)
      // This happens when wheel is already spinning or config is invalid
      if (!result || !result.success) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Wheel startSpin returned failure: ${result?.error || 'unknown'}`);
        this.completeProcessing();
        return;
      }
      
      // Note: completeProcessing() will be called by Wheel when spin is complete
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Wheel spin: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Connect4 game item
   */
  async processConnect4Item(gameData) {
    if (!this.gameEnginePlugin) {
      this.logger.error('❌ [UNIFIED QUEUE] Game Engine plugin not set');
      this.completeProcessing();
      return;
    }

    try {
      // Start Connect4 game without queuing (since we're already in the queue)
      const result = await this.gameEnginePlugin.startGameFromQueue(
        'connect4',
        gameData.viewerUsername,
        gameData.viewerNickname,
        gameData.triggerType,
        gameData.triggerValue,
        gameData.giftPictureUrl
      );
      
      // Check if startGameFromQueue returned a failure response (not an exception)
      if (result?.completed) {
        return;
      }

      if (!result || result.success === false) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Connect4 startGameFromQueue returned failure: ${result?.error || 'unknown'}`);
        this.completeProcessing();
        return;
      }
      
      // Note: completeProcessing() will be called by game engine when game ends
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Connect4 game: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Chess game item
   */
  async processChessItem(gameData) {
    if (!this.gameEnginePlugin) {
      this.logger.error('❌ [UNIFIED QUEUE] Game Engine plugin not set');
      this.completeProcessing();
      return;
    }

    try {
      // Start Chess game without queuing (since we're already in the queue)
      const result = await this.gameEnginePlugin.startGameFromQueue(
        'chess',
        gameData.viewerUsername,
        gameData.viewerNickname,
        gameData.triggerType,
        gameData.triggerValue,
        gameData.giftPictureUrl
      );
      
      // Check if startGameFromQueue returned a failure response (not an exception)
      if (result?.completed) {
        return;
      }

      if (!result || result.success === false) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Chess startGameFromQueue returned failure: ${result?.error || 'unknown'}`);
        this.completeProcessing();
        return;
      }
      
      // Note: completeProcessing() will be called by game engine when game ends
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Chess game: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Slot spin item
   * Called by processNext when a slot item reaches the front of the queue.
   * completeProcessing() is called by SlotGame.handleSpinCompleted() after the
   * overlay confirms the animation has finished (slot:spin-completed event).
   */
  async processSlotItem(spinData) {
    if (!this.slotGame) {
      this.logger.error('❌ [UNIFIED QUEUE] Slot game not set');
      this.completeProcessing();
      return;
    }

    this.logger.info(`🎰 [UNIFIED QUEUE] Dequeued slot spin for ${spinData.username} (spinId: ${spinData.spinId})`);

    try {
      const config = typeof this.slotGame.getConfig === 'function'
        ? this.slotGame.getConfig(spinData.machineId || null)
        : undefined;
      this.switchGame('slot', spinData.spinId, config);

      const result = await this.slotGame.startSpinFromQueue(spinData);

      if (!result || !result.success) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Slot startSpinFromQueue returned failure: ${result?.error || 'unknown'}`);
        this.completeProcessing();
        return;
      }

      // Note: completeProcessing() is called by slotGame.handleSpinCompleted()
      // after the overlay confirms the animation is done (slot:spin-completed).
      // The safety timeout above handles the case where the overlay never responds.
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Slot spin: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Force complete processing when timeout occurs
   * Performs game-specific cleanup before completing
   * @param {Object} item - Queue item that timed out
   */
  forceCompleteProcessing(item) {
    this.logger.warn(`⚠️ [UNIFIED QUEUE] Force completing ${item?.type || 'unknown'} (timeout)`);
    
    // Game-specific cleanup
    if (item?.type === 'wheel' && this.wheelGame) {
      // Reset wheel state if it's stuck spinning
      if (this.wheelGame.isSpinning) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Resetting stuck wheel state (spinId: ${item.data?.spinId})`);
        this.wheelGame.isSpinning = false;
        this.wheelGame.currentSpin = null;
      }
      
      // Remove from active spins
      if (item.data?.spinId) {
        this.wheelGame.activeSpins.delete(item.data.spinId);
      }
      
      // Emit timeout event to overlay
      this.io.emit('wheel:spin-timeout', {
        spinId: item.data?.spinId,
        username: item.data?.username,
        nickname: item.data?.nickname,
        wheelId: item.data?.wheelId,
        wheelName: item.data?.wheelName,
        reason: 'overlay_no_response',
        timestamp: Date.now()
      });
      
      this.logger.info(`⚠️ [UNIFIED QUEUE] Wheel spin timeout handled (spinId: ${item.data?.spinId})`);
    } else if (item?.type === 'plinko' && this.plinkoGame) {
      // Plinko cleanup if needed
      this.logger.debug(`[UNIFIED QUEUE] Plinko timeout cleanup (batchId: ${item.data?.batchId})`);
    } else if (item?.type === 'slot' && this.slotGame) {
      // Force-complete the pending slot spin so rewards still fire
      if (item.data?.spinId) {
        this.logger.warn(`⚠️ [UNIFIED QUEUE] Forcing slot spin completion (spinId: ${item.data.spinId})`);
        this.slotGame.forceCompleteSpin(item.data.spinId);
      }
      this.io.emit('slot:spin-timeout', {
        spinId: item.data?.spinId,
        username: item.data?.username,
        nickname: item.data?.nickname,
        machineId: item.data?.machineId,
        reason: 'overlay_no_response',
        timestamp: Date.now()
      });
    }
    
    // Complete processing and move to next item
    this.completeProcessing();
  }

  /**
   * Mark current processing as complete and process next item
   * Should be called by games when they finish their operation
   */
  completeProcessing() {
    // Clear timeout
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    const wasProcessing = this.isProcessing;
    this.isProcessing = false;
    this.currentItem = null;

    if (wasProcessing) {
      this.logger.debug(`✅ [UNIFIED QUEUE] Processing complete, ${this.queue.length} items remaining`);
      
      // Emit status update
      this.io.emit('unified-queue:status', this.getStatus());
    }

    // Process next item if queue has items
    if (this.queue.length > 0) {
      // Small delay to prevent rapid-fire processing
      this.scheduleProcessNext(250);
    }
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    
    if (clearedCount > 0) {
      this.logger.info(`🧹 [UNIFIED QUEUE] Cleared ${clearedCount} items from queue`);
      this.io.emit('unified-queue:cleared', { count: clearedCount });
    }
  }

  /**
   * Destroy queue manager
   */
  destroy() {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    if (this.processNextTimer) {
      clearTimeout(this.processNextTimer);
      this.processNextTimer = null;
    }
    
    this.clearQueue();
    this.isProcessing = false;
    this.currentItem = null;
    this.plinkoGame = null;
    this.wheelGame = null;
    this.slotGame = null;
  }
}

module.exports = UnifiedQueueManager;
