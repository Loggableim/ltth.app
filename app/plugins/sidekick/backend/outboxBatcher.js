/**
 * Sidekick Plugin - Outbox Batcher
 * 
 * Batches multiple messages into combined outputs to reduce spam.
 * Uses configurable window, max items, and character limits.
 */

/**
 * Outbox batcher for message aggregation
 */
class OutboxBatcher {
  constructor(api, config, sendCallback) {
    this.api = api;
    this.config = config;
    this.sendCallback = sendCallback;
    
    // Buffer for pending messages
    this.buffer = [];
    this.firstTimestamp = null;
    
    // Flush timer
    this.flushTimer = null;
    this.checkInterval = null;
    
    // Statistics
    this.stats = {
      messagesReceived: 0,
      batchesSent: 0,
      messagesSent: 0
    };
    
    // Start check interval
    this._startCheckInterval();
  }
  
  /**
   * Get batch configuration
   * @private
   */
  _getBatchConfig() {
    const outboxConfig = this.config.outbox || {};
    return {
      windowSeconds: outboxConfig.windowSeconds || 8,
      maxItems: outboxConfig.maxItems || 8,
      maxChars: outboxConfig.maxChars || 320,
      separator: outboxConfig.separator || ' • '
    };
  }
  
  /**
   * Add a message to the batch
   * @param {string} text - Message text
   * @param {number} priority - Message priority (higher = more important)
   * @returns {boolean} True if added
   */
  add(text, priority = 1) {
    if (!text || !text.trim()) {
      return false;
    }
    
    const trimmedText = text.trim();
    this.stats.messagesReceived++;
    
    // Add to buffer with priority
    this.buffer.push({
      text: trimmedText,
      priority,
      timestamp: Date.now()
    });
    
    // Set first timestamp if not set
    if (this.firstTimestamp === null) {
      this.firstTimestamp = Date.now();
    }
    
    // Sort by priority (higher first)
    this.buffer.sort((a, b) => b.priority - a.priority);
    
    const batchConfig = this._getBatchConfig();
    
    // Check if we should flush immediately
    const joined = this.buffer.map(b => b.text).join(batchConfig.separator);
    
    if (joined.length > batchConfig.maxChars || 
        this.buffer.length >= batchConfig.maxItems) {
      this.flush();
    }
    
    this.api.log(`Batch add: ${trimmedText} (buffer: ${this.buffer.length})`, 'debug');
    return true;
  }
  
  /**
   * Start the check interval for time-based flushing
   * @private
   */
  _startCheckInterval() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    this.checkInterval = setInterval(() => {
      if (this.buffer.length === 0 || this.firstTimestamp === null) {
        return;
      }
      
      const batchConfig = this._getBatchConfig();
      const elapsed = Date.now() - this.firstTimestamp;
      
      if (elapsed >= batchConfig.windowSeconds * 1000) {
        this.flush();
      }
    }, 250);
  }
  
  /**
   * Flush the buffer and send batched message
   * @returns {string|null} Flushed message or null
   */
  flush() {
    if (this.buffer.length === 0) {
      return null;
    }
    
    const batchConfig = this._getBatchConfig();
    
    // Build payload from buffer
    const payload = this.buffer
      .map(b => b.text)
      .join(batchConfig.separator);
    
    // Clear buffer
    this.buffer = [];
    this.firstTimestamp = null;
    
    // Update stats
    this.stats.batchesSent++;
    this.stats.messagesSent += payload.split(batchConfig.separator).length;
    
    this.api.log(`Batch flush: ${payload}`, 'info');
    
    // Call send callback
    if (this.sendCallback) {
      try {
        this.sendCallback(payload);
      } catch (error) {
        this.api.log(`Batch send error: ${error.message}`, 'error');
      }
    }
    
    return payload;
  }
  
  /**
   * Get current buffer status
   * @returns {Object} Buffer status
   */
  getStatus() {
    const batchConfig = this._getBatchConfig();
    const joined = this.buffer.map(b => b.text).join(batchConfig.separator);
    
    return {
      bufferSize: this.buffer.length,
      bufferChars: joined.length,
      maxItems: batchConfig.maxItems,
      maxChars: batchConfig.maxChars,
      windowSeconds: batchConfig.windowSeconds,
      firstTimestamp: this.firstTimestamp,
      timeRemaining: this.firstTimestamp 
        ? Math.max(0, batchConfig.windowSeconds * 1000 - (Date.now() - this.firstTimestamp))
        : null
    };
  }
  
  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return { ...this.stats };
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = config;
  }
  
  /**
   * Clear the buffer without sending
   */
  clear() {
    this.buffer = [];
    this.firstTimestamp = null;
    this.api.log('Batch buffer cleared', 'debug');
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    
    // Flush any remaining messages
    this.flush();
  }
}

module.exports = OutboxBatcher;
