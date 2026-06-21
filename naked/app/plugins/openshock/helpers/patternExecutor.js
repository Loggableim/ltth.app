/**
 * PatternExecutor - Sequential Pattern Execution with Queue Feedback
 *
 * Executes patterns step-by-step with queue confirmation feedback.
 * Waits for queue 'item-processed' event before enqueuing next step.
 * Supports pattern repetition for gift multipliers.
 * 
 * Features:
 * - Step-by-step pattern execution with confirmation
 * - Pattern repetition (for gift multipliers)
 * - Active execution tracking
 * - Cancellation support
 * - Error handling and recovery
 */

const { nanoid } = require('nanoid');
const EventEmitter = require('events');

class PatternExecutor extends EventEmitter {
  /**
   * Create a new PatternExecutor
   * @param {Object} queueManager - QueueManager instance
   * @param {Function} logger - Logger function
   */
  constructor(queueManager, logger) {
    super(); // EventEmitter constructor
    this.queueManager = queueManager;
    this.logger = logger;

    // Active executions: executionId -> execution state
    this.activeExecutions = new Map();

    // Listen to queue events
    this._setupQueueListeners();

    this.logger('[PatternExecutor] Initialized', 'info');
  }

  /**
   * Setup queue event listeners
   * @private
   */
  _setupQueueListeners() {
    // Listen for item-processed events to coordinate pattern steps
    this.queueManager.on('item-processed', (item, success) => {
      this._handleItemProcessed(item, success);
    });
  }

  /**
   * Execute a pattern with optional repetition
   * @param {Object} pattern - Pattern object with steps
   * @param {string} deviceId - Target device ID
   * @param {string} userId - User ID
   * @param {string} source - Source identifier
   * @param {number} repeatCount - Number of times to repeat the pattern (default: 1)
   * @param {Object} context - Additional context (username, sourceData, etc.)
   * @returns {string} executionId - Unique execution ID for tracking
   */
  async executePattern(pattern, deviceId, userId, source, repeatCount = 1, context = {}) {
    try {
      const executionId = nanoid();
      
      this.logger(`[PatternExecutor] Starting pattern execution: ${pattern.name} (repeat: ${repeatCount}x)`, 'info');

      // Validate pattern
      if (!pattern || !pattern.steps || pattern.steps.length === 0) {
        throw new Error('Invalid pattern: no steps defined');
      }

      // Validate device
      if (!deviceId) {
        throw new Error('Invalid device: deviceId is required');
      }

      // Initialize execution state
      const execution = {
        executionId,
        pattern,
        deviceId,
        userId,
        source,
        context,
        repeatCount: Math.max(1, repeatCount),
        currentRepeat: 0,
        currentStepIndex: 0,
        status: 'running', // running, completed, failed, cancelled
        startedAt: Date.now(),
        completedAt: null,
        queuedItems: [], // Track queued item IDs
        error: null
      };

      this.activeExecutions.set(executionId, execution);

      // Start executing the first step
      await this._enqueueNextStep(execution);

      return executionId;

    } catch (error) {
      this.logger(`[PatternExecutor] Error starting pattern execution: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Enqueue the next step in the pattern
   * @private
   * @param {Object} execution - Execution state object
   */
  async _enqueueNextStep(execution) {
    try {
      // Check if execution was cancelled
      if (execution.status === 'cancelled') {
        this.logger(`[PatternExecutor] Execution ${execution.executionId} was cancelled`, 'info');
        return;
      }

      const pattern = execution.pattern;
      const steps = pattern.steps;

      // Check if we've completed all repeats
      if (execution.currentRepeat >= execution.repeatCount) {
        this._completeExecution(execution);
        return;
      }

      // Check if we need to move to next repeat
      if (execution.currentStepIndex >= steps.length) {
        execution.currentRepeat++;
        execution.currentStepIndex = 0;
        
        this.logger(
          `[PatternExecutor] Pattern ${pattern.name} repeat ${execution.currentRepeat}/${execution.repeatCount} completed`,
          'info'
        );

        // Check again if we've completed all repeats
        if (execution.currentRepeat >= execution.repeatCount) {
          this._completeExecution(execution);
          return;
        }
      }

      const step = steps[execution.currentStepIndex];
      
      // Handle pause steps - don't enqueue, just schedule next step
      if (step.type === 'pause') {
        const pauseDuration = step.duration || 0;
        this.logger(
          `[PatternExecutor] Pattern ${pattern.name} step ${execution.currentStepIndex}: Pause (${pauseDuration}ms)`,
          'debug'
        );

        execution.currentStepIndex++;
        
        // Wait for pause duration, then enqueue next step
        setTimeout(() => {
          this._enqueueNextStep(execution);
        }, pauseDuration);
        
        return;
      }

      // Enqueue command step
      const command = {
        type: step.type,
        deviceId: execution.deviceId,
        intensity: step.intensity,
        duration: step.duration
      };

      this.logger(
        `[PatternExecutor] Pattern ${pattern.name} (repeat ${execution.currentRepeat + 1}/${execution.repeatCount}) step ${execution.currentStepIndex}: ${step.type} (intensity: ${step.intensity}, duration: ${step.duration}ms)`,
        'info'
      );

      const result = await this.queueManager.enqueue(
        command,
        execution.userId,
        execution.source,
        execution.context.sourceData || {},
        5, // priority
        {
          executionId: execution.executionId,
          stepIndex: execution.currentStepIndex,
          repeatIndex: execution.currentRepeat
        }
      );

      if (result.success) {
        execution.queuedItems.push(result.queueId);
        this.logger(
          `[PatternExecutor] Step enqueued successfully: ${result.queueId}`,
          'debug'
        );
      } else {
        throw new Error(`Failed to enqueue step: ${result.message}`);
      }

    } catch (error) {
      this.logger(`[PatternExecutor] Error enqueuing next step: ${error.message}`, 'error');
      this._failExecution(execution, error);
    }
  }

  /**
   * Handle item-processed event from queue
   * @private
   * @param {Object} item - Processed queue item
   * @param {boolean} success - Whether item was processed successfully
   */
  _handleItemProcessed(item, success) {
    try {
      // Check if this item belongs to a pattern execution
      if (!item.executionId) {
        return; // Not a pattern step
      }

      const execution = this.activeExecutions.get(item.executionId);
      if (!execution) {
        return; // Execution not found (might have been cleaned up)
      }

      if (!success) {
        this.logger(
          `[PatternExecutor] Step ${item.stepIndex} failed for execution ${item.executionId}`,
          'error'
        );
        this._failExecution(execution, new Error('Pattern step execution failed'));
        return;
      }

      this.logger(
        `[PatternExecutor] Step ${item.stepIndex} completed for execution ${item.executionId}`,
        'debug'
      );

      // Move to next step
      execution.currentStepIndex++;
      
      // Enqueue next step
      this._enqueueNextStep(execution);

    } catch (error) {
      this.logger(`[PatternExecutor] Error handling item-processed: ${error.message}`, 'error');
    }
  }

  /**
   * Complete an execution
   * @private
   * @param {Object} execution - Execution state
   */
  _completeExecution(execution) {
    execution.status = 'completed';
    execution.completedAt = Date.now();

    const duration = execution.completedAt - execution.startedAt;
    
    this.logger(
      `[PatternExecutor] Pattern execution completed: ${execution.pattern.name} (${execution.repeatCount} repeats, ${duration}ms total)`,
      'info'
    );

    // Emit completion event
    this.emit('execution-completed', execution);

    // Keep execution in map for status queries, will be cleaned up later
    // Don't remove immediately to allow status checks
  }

  /**
   * Fail an execution
   * @private
   * @param {Object} execution - Execution state
   * @param {Error} error - Error that caused failure
   */
  _failExecution(execution, error) {
    execution.status = 'failed';
    execution.completedAt = Date.now();
    execution.error = error.message;

    this.logger(
      `[PatternExecutor] Pattern execution failed: ${execution.pattern.name} - ${error.message}`,
      'error'
    );

    // Emit failure event
    this.emit('execution-failed', execution);

    // Keep execution in map for status queries
  }

  /**
   * Cancel a pattern execution
   * @param {string} executionId - Execution ID to cancel
   * @returns {boolean} Success status
   */
  cancelExecution(executionId) {
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      this.logger(`[PatternExecutor] Execution not found: ${executionId}`, 'warn');
      return false;
    }

    if (execution.status !== 'running') {
      this.logger(
        `[PatternExecutor] Execution ${executionId} is not running (status: ${execution.status})`,
        'warn'
      );
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = Date.now();

    this.logger(
      `[PatternExecutor] Pattern execution cancelled: ${execution.pattern.name}`,
      'info'
    );

    // Emit cancellation event
    this.emit('execution-cancelled', execution);

    return true;
  }

  /**
   * Get execution status
   * @param {string} executionId - Execution ID
   * @returns {Object} Status object { found, status, execution }
   */
  getExecutionStatus(executionId) {
    const execution = this.activeExecutions.get(executionId);
    
    if (!execution) {
      return { found: false, status: null, execution: null };
    }

    return {
      found: true,
      status: execution.status,
      execution: {
        executionId: execution.executionId,
        patternName: execution.pattern.name,
        status: execution.status,
        currentRepeat: execution.currentRepeat,
        totalRepeats: execution.repeatCount,
        currentStepIndex: execution.currentStepIndex,
        totalSteps: execution.pattern.steps.length,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        error: execution.error
      }
    };
  }

  /**
   * Get all active executions (running)
   * @returns {Array} Array of active execution objects
   */
  getActiveExecutions() {
    const active = [];
    
    for (const [executionId, execution] of this.activeExecutions) {
      if (execution.status === 'running') {
        active.push({
          executionId,
          patternName: execution.pattern.name,
          currentRepeat: execution.currentRepeat,
          totalRepeats: execution.repeatCount,
          startedAt: execution.startedAt
        });
      }
    }

    return active;
  }

  /**
   * Cleanup completed/failed/cancelled executions older than specified time
   * @param {number} maxAge - Maximum age in milliseconds (default: 5 minutes)
   */
  cleanupOldExecutions(maxAge = 5 * 60 * 1000) {
    const now = Date.now();
    const toRemove = [];

    for (const [executionId, execution] of this.activeExecutions) {
      if (execution.status !== 'running' && execution.completedAt) {
        const age = now - execution.completedAt;
        if (age > maxAge) {
          toRemove.push(executionId);
        }
      }
    }

    for (const executionId of toRemove) {
      this.activeExecutions.delete(executionId);
    }

    if (toRemove.length > 0) {
      this.logger(
        `[PatternExecutor] Cleaned up ${toRemove.length} old execution(s)`,
        'debug'
      );
    }
  }

  /**
   * Get statistics about pattern executions
   * @returns {Object} Statistics object
   */
  getStats() {
    const stats = {
      total: this.activeExecutions.size,
      running: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const execution of this.activeExecutions.values()) {
      stats[execution.status]++;
    }

    return stats;
  }
}

module.exports = PatternExecutor;
