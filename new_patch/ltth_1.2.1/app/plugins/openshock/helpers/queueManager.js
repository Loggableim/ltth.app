/**
 * QueueManager - Priority-based Command Queue System
 *
 * Manages command execution with priority queuing, retry logic,
 * and comprehensive statistics tracking.
 */

const { nanoid } = require('nanoid');
const EventEmitter = require('events');

class QueueManager extends EventEmitter {
  /**
   * Create a new QueueManager
   * @param {Object} openShockClient - OpenShock API client
   * @param {Object} safetyManager - Safety validation manager
   * @param {Object} logger - Logger instance
   */
  constructor(openShockClient, safetyManager, logger) {
    super(); // EventEmitter constructor
    this.openShockClient = openShockClient;
    this.safetyManager = safetyManager;
    this.logger = logger;

    // Queue storage
    this.queue = [];
    this.maxQueueSize = 1000;
    this.maxCompletedItems = 100;

    // Processing state
    this.isProcessing = false;
    this.isPaused = false;
    this.processingDelay = 300; // ms between commands
    this.currentlyProcessingItem = null;

    // Queue synchronization
    this._queueLock = false;
    this._lockWaiters = [];
    
    // Pattern execution cancellation callback
    // Set by main.js to check if a pattern execution has been cancelled
    this.shouldCancelExecution = null;

    // Statistics
    this.stats = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      totalCancelled: 0,
      totalRetried: 0,
      processingTimes: [], // Store last 100 processing times
      commandsPerMinute: [],
      lastMinuteTimestamp: Date.now(),
      lastMinuteCount: 0
    };

    // Retry configuration
    this.maxRetries = 3;
    this.retryDelay = 1000; // ms

    this.logger.info('[QueueManager] Initialized');
  }
  
  /**
   * Set a callback function to check if a pattern execution should be cancelled
   * @param {Function} callback - Function that takes executionId and returns true if cancelled
   */
  setShouldCancelExecution(callback) {
    this.shouldCancelExecution = callback;
  }

  /**
   * Enqueue a command for execution
   * @param {Object} command - Command object { type, deviceId, intensity, duration }
   * @param {string} userId - User ID who triggered the command
   * @param {string} source - Source of command (gift, chat, follow, etc.)
   * @param {Object} sourceData - Original event data
   * @param {number} priority - Priority level (1-10, 10 = highest)
   * @param {Object} options - Additional options for scheduling and tracking
   * @param {number} [options.timestamp] - Scheduled execution timestamp (for pattern timing)
   * @param {string} [options.executionId] - Pattern execution ID for tracking
   * @param {number} [options.stepIndex] - Step index within a pattern
   * @returns {Object} { success: boolean, queueId: string, position: number, message: string }
   */
  async enqueue(command, userId, source, sourceData = {}, priority = 5, options = {}) {
    try {
      // Validate priority
      priority = Math.max(1, Math.min(10, priority));

      // Acquire lock before modifying queue
      await this._acquireLock();

      try {
        // Check queue size limit
        const pendingCount = this.queue.filter(item =>
          item.status === 'pending' || item.status === 'processing'
        ).length;

        if (pendingCount >= this.maxQueueSize) {
          this.logger.warn('[QueueManager] Queue is full, rejecting command', {
            queueSize: pendingCount,
            maxSize: this.maxQueueSize
          });
          return {
            success: false,
            queueId: null,
            position: -1,
            message: 'Queue is full'
          };
        }

        // Create queue item
        const queueItem = {
          id: `queue-${nanoid()}`,
          priority,
          command,
          userId,
          source,
          sourceData,
          enqueuedAt: Date.now(),
          status: 'pending',
          retries: 0,
          maxRetries: this.maxRetries,
          error: null,
          processingStartedAt: null,
          completedAt: null
        };
        
        // Add optional scheduling and tracking properties
        if (options.timestamp !== undefined) {
          queueItem.timestamp = options.timestamp;
        }
        if (options.executionId) {
          queueItem.executionId = options.executionId;
        }
        if (options.stepIndex !== undefined) {
          queueItem.stepIndex = options.stepIndex;
        }

        // Add to queue
        this.queue.push(queueItem);
        this.stats.totalEnqueued++;

        // Sort queue by priority
        this._sortQueue();

        // Calculate position
        const position = this.queue.findIndex(item => item.id === queueItem.id) + 1;

        this.logger.info('[QueueManager] Command enqueued', {
          queueId: queueItem.id,
          type: command.type,
          priority,
          position,
          userId,
          source
        });

        // Start processing if not already running
        if (!this.isProcessing && !this.isPaused) {
          this.processQueue();
        }

        return {
          success: true,
          queueId: queueItem.id,
          position,
          message: `Queued at position ${position}`
        };
      } finally {
        // Always release lock
        this._releaseLock();
      }

    } catch (error) {
      this.logger.error('[QueueManager] Error enqueueing command', { error: error.message });
      return {
        success: false,
        queueId: null,
        position: -1,
        message: error.message
      };
    }
  }

  /**
   * Add an item to the queue (wrapper for enqueue with item object format)
   * 
   * This method provides compatibility with calling code that uses the item object format
   * instead of separate parameters. It transforms the item object into individual parameters
   * for the enqueue() method.
   * 
   * @param {Object} item - Queue item object
   * @param {string} item.commandType - Command type (shock, vibrate, sound)
   * @param {string} item.deviceId - Target device ID
   * @param {string} item.deviceName - Target device name
   * @param {number} item.intensity - Command intensity (1-100)
   * @param {number} item.duration - Command duration in milliseconds
   * @param {string} [item.userId='unknown'] - User ID who triggered the command
   * @param {string} [item.source='unknown'] - Source of command (gift, pattern, manual, etc.)
   * @param {Object} [item.sourceData={}] - Original event data
   * @param {number} [item.priority=5] - Priority level (1-10, 10 = highest)
   * 
   * @returns {Promise<Object>} Result object with success, queueId, position, and message
   * 
   * @example
   * await queueManager.addItem({
   *   commandType: 'shock',
   *   deviceId: 'abc123',
   *   deviceName: 'My Device',
   *   intensity: 50,
   *   duration: 1000,
   *   userId: 'user123',
   *   source: 'pattern:Wave',
   *   priority: 7
   * });
   */
  async addItem(item) {
    try {
      // Extract command data from item
      const command = {
        type: item.commandType || item.type,
        deviceId: item.deviceId,
        deviceName: item.deviceName,
        intensity: item.intensity,
        duration: item.duration
      };

      // Build options object for scheduling and pattern tracking
      const options = {};
      
      // Preserve timestamp for scheduled execution (critical for pattern timing)
      if (item.timestamp !== undefined) {
        options.timestamp = item.timestamp;
      }
      
      // Preserve pattern execution tracking properties
      if (item.executionId) {
        options.executionId = item.executionId;
      }
      if (item.stepIndex !== undefined) {
        options.stepIndex = item.stepIndex;
      }

      // Call enqueue with extracted parameters and options
      const result = await this.enqueue(
        command,
        item.userId || 'unknown',
        item.source || 'unknown',
        item.sourceData || {},
        item.priority || 5,
        options
      );

      return result;
    } catch (error) {
      this.logger.error('[QueueManager] Error adding item', { error: error.message });
      return {
        success: false,
        queueId: null,
        position: -1,
        message: error.message
      };
    }
  }

  /**
   * Get the next command from the queue (highest priority)
   * @returns {Promise<Object|null>} Queue item or null if queue is empty
   */
  async dequeue() {
    // Acquire lock before reading queue
    await this._acquireLock();

    try {
      // Find the first pending item (queue is already sorted by priority)
      const index = this.queue.findIndex(item => item.status === 'pending');

      if (index === -1) {
        return null;
      }

      const item = this.queue[index];
      return item;
    } finally {
      // Always release lock
      this._releaseLock();
    }
  }

  /**
   * Start processing the queue
   */
  async processQueue() {
    if (this.isProcessing) {
      this.logger.debug('[QueueManager] Queue processing already running');
      return;
    }

    this.isProcessing = true;
    this.logger.info('[QueueManager] Started queue processing');
    this.emit('queue-started');

    while (this.isProcessing) {
      // Check if paused
      if (this.isPaused) {
        await this._sleep(100);
        continue;
      }

      // Get next item (now async with lock)
      const item = await this.dequeue();

      if (!item) {
        // Queue is empty, stop processing
        this.logger.debug('[QueueManager] Queue is empty, stopping processing');
        this.isProcessing = false;
        this.emit('queue-empty');
        break;
      }

      // Process item
      await this._processNextItem(item);

      // Delay before next item
      if (this.isProcessing) {
        await this._sleep(this.processingDelay);
      }

      // Update commands per minute
      this._updateCommandsPerMinute();

      // Cleanup old completed items
      await this._cleanupCompletedItems();

      // Emit queue-changed event
      this.emit('queue-changed');
    }

    this.logger.info('[QueueManager] Stopped queue processing');
    this.emit('queue-stopped');
  }

  /**
   * Stop queue processing
   */
  stopProcessing() {
    this.isProcessing = false;
    this.isPaused = false;
    this.logger.info('[QueueManager] Queue processing stopped');
  }

  /**
   * Pause queue processing
   */
  pauseProcessing() {
    this.isPaused = true;
    this.logger.info('[QueueManager] Queue processing paused');
  }

  /**
   * Resume queue processing
   */
  resumeProcessing() {
    if (!this.isProcessing) {
      this.processQueue();
    } else {
      this.isPaused = false;
      this.logger.info('[QueueManager] Queue processing resumed');
    }
  }

  /**
   * Clear all pending items from queue
   * @returns {Promise<number>} Number of items cleared
   */
  async clearQueue() {
    // Acquire lock before modifying queue
    await this._acquireLock();

    try {
      const pendingItems = this.queue.filter(item => item.status === 'pending');
      const count = pendingItems.length;

      // Mark all pending items as cancelled
      pendingItems.forEach(item => {
        item.status = 'cancelled';
        item.completedAt = Date.now();
        this.stats.totalCancelled++;
      });

      this.logger.info('[QueueManager] Queue cleared', { itemsCleared: count });
      return count;
    } finally {
      // Always release lock
      this._releaseLock();
    }
  }

  /**
   * Cancel a specific queue item
   * @param {string} queueId - Queue item ID
   * @returns {Promise<boolean>} Success status
   */
  async cancelItem(queueId) {
    // Acquire lock before modifying queue
    await this._acquireLock();

    try {
      const item = this.queue.find(i => i.id === queueId);

      if (!item) {
        this.logger.warn('[QueueManager] Item not found for cancellation', { queueId });
        return false;
      }

      if (item.status === 'completed' || item.status === 'cancelled') {
        this.logger.warn('[QueueManager] Item already completed/cancelled', {
          queueId,
          status: item.status
        });
        return false;
      }

      if (item.status === 'processing') {
        this.logger.warn('[QueueManager] Cannot cancel item currently processing', { queueId });
        return false;
      }

      item.status = 'cancelled';
      item.completedAt = Date.now();
      this.stats.totalCancelled++;

      this.logger.info('[QueueManager] Item cancelled', { queueId });
      return true;
    } finally {
      // Always release lock
      this._releaseLock();
    }
  }

  /**
   * Get queue status
   * @returns {Object} Queue status and statistics
   */
  getQueueStatus() {
    const pending = this.queue.filter(i => i.status === 'pending').length;
    const processing = this.queue.filter(i => i.status === 'processing').length;
    const completed = this.queue.filter(i => i.status === 'completed').length;
    const failed = this.queue.filter(i => i.status === 'failed').length;
    const cancelled = this.queue.filter(i => i.status === 'cancelled').length;

    return {
      length: this.queue.length,
      queueSize: pending + processing, // Alias for compatibility - counts active items
      pending,
      processing,
      completed,
      failed,
      cancelled,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      stats: this.getStats()
    };
  }

  /**
   * Get queue items filtered by status
   * @param {string} status - Status to filter by (pending, processing, completed, failed, cancelled)
   * @returns {Array} Filtered queue items
   */
  getQueueItems(status = null) {
    if (status) {
      return this.queue.filter(item => item.status === status);
    }
    return [...this.queue];
  }

  /**
   * Get a specific queue item by ID
   * @param {string} queueId - Queue item ID
   * @returns {Object|null} Queue item or null
   */
  getItemById(queueId) {
    return this.queue.find(item => item.id === queueId) || null;
  }

  /**
   * Remove a queue item by ID (alias for cancelItem for API compatibility)
   * @param {string} queueId - Queue item ID
   * @returns {boolean} Success status
   */
  removeItem(queueId) {
    // Use cancelItem for pending items, or remove from queue directly for completed items
    const item = this.queue.find(i => i.id === queueId);
    
    if (!item) {
      return false;
    }
    
    // If pending, use cancelItem
    if (item.status === 'pending') {
      // Synchronous version - cancelItem is async but we need sync here
      item.status = 'cancelled';
      item.completedAt = Date.now();
      this.stats.totalCancelled++;
      this.logger.info('[QueueManager] Item removed (cancelled)', { queueId });
      return true;
    }
    
    // If already completed/failed/cancelled, just remove from queue
    const index = this.queue.findIndex(i => i.id === queueId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.logger.info('[QueueManager] Item removed from queue', { queueId });
      return true;
    }
    
    return false;
  }

  /**
   * Update item status
   * @param {string} queueId - Queue item ID
   * @param {string} status - New status
   * @param {string} error - Error message (optional)
   * @returns {boolean} Success status
   */
  updateItemStatus(queueId, status, error = null) {
    const item = this.queue.find(i => i.id === queueId);

    if (!item) {
      return false;
    }

    item.status = status;
    if (error) {
      item.error = error;
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      item.completedAt = Date.now();
    }

    return true;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const avgProcessingTime = this.stats.processingTimes.length > 0
      ? this.stats.processingTimes.reduce((a, b) => a + b, 0) / this.stats.processingTimes.length
      : 0;

    const recentCommandsPerMinute = this.stats.commandsPerMinute.slice(-5);
    const avgCommandsPerMinute = recentCommandsPerMinute.length > 0
      ? recentCommandsPerMinute.reduce((a, b) => a + b, 0) / recentCommandsPerMinute.length
      : 0;

    const successRate = this.stats.totalProcessed > 0
      ? ((this.stats.totalProcessed - this.stats.totalFailed) / this.stats.totalProcessed) * 100
      : 0;

    return {
      totalEnqueued: this.stats.totalEnqueued,
      totalProcessed: this.stats.totalProcessed,
      totalFailed: this.stats.totalFailed,
      totalCancelled: this.stats.totalCancelled,
      totalRetried: this.stats.totalRetried,
      averageProcessingTime: Math.round(avgProcessingTime),
      commandsPerMinute: Math.round(avgCommandsPerMinute),
      successRate: Math.round(successRate * 100) / 100
    };
  }

  /**
   * Acquire queue lock for synchronization
   * @private
   * @returns {Promise<void>}
   */
  async _acquireLock() {
    // If lock is not held, acquire it immediately
    if (!this._queueLock) {
      this._queueLock = true;
      return;
    }

    // Lock is held, wait for it to be released
    return new Promise((resolve) => {
      this._lockWaiters.push(resolve);
    });
  }

  /**
   * Release queue lock
   * @private
   */
  _releaseLock() {
    // If there are waiters, wake up the next one
    if (this._lockWaiters.length > 0) {
      const nextWaiter = this._lockWaiters.shift();
      nextWaiter();
    } else {
      // No waiters, release the lock
      this._queueLock = false;
    }
  }

  /**
   * Sort queue by priority (highest first), scheduled timestamp, and enqueue time
   * Items with scheduled timestamps are sorted to respect their scheduling order.
   * This is critical for pattern execution where steps must execute in sequence.
   * NOTE: This is called frequently and can be a performance bottleneck
   * @private
   */
  _sortQueue() {
    // Only sort pending items to reduce complexity
    const pending = this.queue.filter(item => item.status === 'pending');
    const nonPending = this.queue.filter(item => item.status !== 'pending');

    pending.sort((a, b) => {
      // First, sort by priority (descending) - higher priority items first
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }

      // If same priority, sort by scheduled timestamp (ascending)
      // Items with no timestamp default to their enqueuedAt time for immediate processing
      // This ensures non-pattern commands aren't delayed behind pattern steps
      const aTimestamp = a.timestamp || a.enqueuedAt;
      const bTimestamp = b.timestamp || b.enqueuedAt;
      
      if (aTimestamp !== bTimestamp) {
        // Items with earlier timestamps should be processed first
        return aTimestamp - bTimestamp;
      }

      // If same priority and timestamp, sort by enqueue time (ascending - FIFO)
      return a.enqueuedAt - b.enqueuedAt;
    });

    // Rebuild queue with sorted pending items first, then others
    this.queue = [...pending, ...nonPending];
  }

  /**
   * Process the next item in the queue
   * @private
   * @param {Object} item - Queue item to process
   */
  async _processNextItem(item) {
    try {
      // Check if item has a scheduled timestamp and wait if needed
      if (item.timestamp && item.timestamp > Date.now()) {
        const waitTime = item.timestamp - Date.now();
        this.logger.debug('[QueueManager] Waiting for scheduled time', {
          queueId: item.id,
          waitTime: `${waitTime}ms`
        });
        await this._sleep(waitTime);
      }
      
      // Check if pattern execution was cancelled (before processing)
      if (item.executionId && typeof this.shouldCancelExecution === 'function') {
        if (this.shouldCancelExecution(item.executionId)) {
          this.logger.info(`[QueueManager] Pattern execution ${item.executionId} was cancelled, skipping step ${item.stepIndex}`, {
            queueId: item.id
          });
          item.status = 'cancelled';
          item.completedAt = Date.now();
          this.stats.totalCancelled++;
          // Cancelled items will be cleaned up by _cleanupCompletedItems()
          return;
        }
      }

      // Update status to processing
      item.status = 'processing';
      item.processingStartedAt = Date.now();
      this.currentlyProcessingItem = item;

      this.logger.debug('[QueueManager] Processing item', {
        queueId: item.id,
        type: item.command.type,
        priority: item.priority,
        retry: item.retries
      });

      // Execute command
      await this._executeCommand(item);

    } catch (error) {
      this.logger.error('[QueueManager] Error in _processNextItem', {
        queueId: item.id,
        error: error.message
      });
      await this._handleCommandError(item, error);
    } finally {
      this.currentlyProcessingItem = null;
    }
  }

  /**
   * Execute a command from queue item
   * @private
   * @param {Object} item - Queue item
   */
  async _executeCommand(item) {
    try {
      const { command, userId } = item;

      this.logger.info(`[QueueManager] Executing command: ${command.type} on device ${command.deviceId} (intensity: ${command.intensity}, duration: ${command.duration})`, {
        queueId: item.id,
        userId,
        source: item.source
      });

      // Safety check via SafetyManager
      // checkCommand expects (command, userId, deviceId) with command as an object
      const safetyCheck = this.safetyManager.checkCommand(
        command,
        userId,
        command.deviceId
      );

      if (!safetyCheck.allowed) {
        this.logger.warn(`[QueueManager] Safety check failed: ${safetyCheck.reason}`);
        throw new Error(`Safety check failed: ${safetyCheck.reason}`);
      }

      // Extract adjusted values from modifiedCommand
      const adjustedIntensity = safetyCheck.modifiedCommand?.intensity || command.intensity;
      const adjustedDuration = safetyCheck.modifiedCommand?.duration || command.duration;

      if (adjustedIntensity !== command.intensity || adjustedDuration !== command.duration) {
        this.logger.info(`[QueueManager] Safety adjustments applied: intensity ${command.intensity} -> ${adjustedIntensity}, duration ${command.duration} -> ${adjustedDuration}`);
      }

      // Execute command via OpenShockClient
      // The OpenShock API returns different response structures:
      // - Success: HTTP 200 with response body (may be empty or contain data)
      // - Failure: HTTP error codes (4xx, 5xx) throw exceptions
      // 
      // The sendShock/sendVibrate/sendSound methods return the raw API response
      // which does NOT have a 'success' property. If the call succeeds without
      // throwing, the command was accepted by the API.
      
      try {
        switch (command.type) {
          case 'shock':
            await this.openShockClient.sendShock(
              command.deviceId,
              adjustedIntensity,
              adjustedDuration
            );
            break;

          case 'vibrate':
            await this.openShockClient.sendVibrate(
              command.deviceId,
              adjustedIntensity,
              adjustedDuration
            );
            break;

          case 'beep':
          case 'sound':
            await this.openShockClient.sendSound(
              command.deviceId,
              adjustedIntensity,
              adjustedDuration
            );
            break;

          default:
            throw new Error(`Unknown command type: ${command.type}`);
        }

        // If we reach here without exception, the command was sent successfully
        this.logger.info(`[QueueManager] Command executed successfully: ${command.type} on ${command.deviceId}`);
      } catch (apiError) {
        // Re-throw with more context for the error handler
        this.logger.error(`[QueueManager] OpenShock API error: ${apiError.message}`);
        throw apiError;
      }

      // Handle success
      await this._handleCommandSuccess(item);

    } catch (error) {
      this.logger.error(`[QueueManager] Error executing command: ${error.message}`);
      await this._handleCommandError(item, error);
    }
  }

  /**
   * Handle successful command execution
   * @private
   * @param {Object} item - Queue item
   */
  async _handleCommandSuccess(item) {
    item.status = 'completed';
    item.completedAt = Date.now();

    // Track processing time
    const processingTime = item.completedAt - item.processingStartedAt;
    this.stats.processingTimes.push(processingTime);
    if (this.stats.processingTimes.length > 100) {
      this.stats.processingTimes.shift();
    }

    this.stats.totalProcessed++;

    this.logger.info('[QueueManager] Command executed successfully', {
      queueId: item.id,
      type: item.command.type,
      processingTime: `${processingTime}ms`,
      retries: item.retries
    });

    // Emit item-processed event
    this.emit('item-processed', item, true);
  }

  /**
   * Handle command execution error
   * @private
   * @param {Object} item - Queue item
   * @param {Error} error - Error object
   */
  async _handleCommandError(item, error) {
    item.error = error.message;

    this.logger.error('[QueueManager] Command execution failed', {
      queueId: item.id,
      type: item.command.type,
      error: error.message,
      retries: item.retries,
      maxRetries: item.maxRetries
    });

    // Check if should retry
    if (item.retries < item.maxRetries) {
      await this._retryItem(item);
    } else {
      // Max retries reached
      item.status = 'failed';
      item.completedAt = Date.now();
      this.stats.totalProcessed++;
      this.stats.totalFailed++;

      this.logger.error('[QueueManager] Max retries reached, marking as failed', {
        queueId: item.id,
        type: item.command.type,
        totalRetries: item.retries
      });

      // Emit item-processed event with failure
      this.emit('item-processed', item, false);
    }
  }

  /**
   * Retry a failed item
   * @private
   * @param {Object} item - Queue item
   */
  async _retryItem(item) {
    // Acquire lock before modifying queue
    await this._acquireLock();

    try {
      item.retries++;
      item.status = 'pending';
      item.processingStartedAt = null;
      this.stats.totalRetried++;

      this.logger.info('[QueueManager] Retrying item', {
        queueId: item.id,
        type: item.command.type,
        retry: item.retries,
        maxRetries: item.maxRetries
      });

      // Re-sort queue (retry items maintain their priority)
      this._sortQueue();
    } finally {
      // Always release lock
      this._releaseLock();
    }

    // Add retry delay (outside lock to avoid blocking other operations)
    await this._sleep(this.retryDelay);
  }

  /**
   * Cleanup old completed items (keep only last 100)
   * @private
   */
  async _cleanupCompletedItems() {
    // Acquire lock before modifying queue
    await this._acquireLock();

    try {
      const completedStatuses = ['completed', 'failed', 'cancelled'];
      const completedItems = this.queue.filter(item =>
        completedStatuses.includes(item.status)
      );

      if (completedItems.length > this.maxCompletedItems) {
        // Sort by completion time (oldest first)
        completedItems.sort((a, b) => a.completedAt - b.completedAt);

        // Remove oldest items
        const itemsToRemove = completedItems.slice(0, completedItems.length - this.maxCompletedItems);

        itemsToRemove.forEach(item => {
          const index = this.queue.findIndex(i => i.id === item.id);
          if (index !== -1) {
            this.queue.splice(index, 1);
          }
        });

        this.logger.debug('[QueueManager] Cleaned up old items', {
          removed: itemsToRemove.length,
          remaining: this.queue.length
        });
      }
    } finally {
      // Always release lock
      this._releaseLock();
    }
  }

  /**
   * Update commands per minute tracking
   * @private
   */
  _updateCommandsPerMinute() {
    const now = Date.now();
    const minuteElapsed = now - this.stats.lastMinuteTimestamp >= 60000;

    if (minuteElapsed) {
      this.stats.commandsPerMinute.push(this.stats.lastMinuteCount);
      if (this.stats.commandsPerMinute.length > 10) {
        this.stats.commandsPerMinute.shift();
      }
      this.stats.lastMinuteCount = 0;
      this.stats.lastMinuteTimestamp = now;
    }

    this.stats.lastMinuteCount++;
  }

  /**
   * Sleep helper
   * @private
   * @param {number} ms - Milliseconds to sleep
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = QueueManager;
