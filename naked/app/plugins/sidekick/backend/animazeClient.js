/**
 * Sidekick Plugin - Animaze/ChatPal WebSocket Client
 * 
 * WebSocket client for connecting to Animaze ChatPal API.
 * Handles connection, reconnection, and message sending with batching support.
 */

const WebSocket = require('ws');

/**
 * Speech state tracker for Animaze ChatPal
 */
class SpeechState {
  constructor() {
    this.isSpeaking = false;
    this.speechStartedAt = null;
    this.speechEndedAt = null;
    this.listeners = {
      start: [],
      end: []
    };
  }
  
  markStarted() {
    this.isSpeaking = true;
    this.speechStartedAt = Date.now();
    this.listeners.start.forEach(cb => {
      try { cb(); } catch (e) { /* ignore */ }
    });
  }
  
  markEnded() {
    this.isSpeaking = false;
    this.speechEndedAt = Date.now();
    this.listeners.end.forEach(cb => {
      try { cb(); } catch (e) { /* ignore */ }
    });
  }
  
  onStart(callback) {
    this.listeners.start.push(callback);
  }
  
  onEnd(callback) {
    this.listeners.end.push(callback);
  }
  
  /**
   * Wait for speech to end
   * @param {number} timeoutMs - Maximum wait time
   * @returns {Promise<boolean>} True if speech ended, false if timeout
   */
  waitForEnd(timeoutMs = 15000) {
    return new Promise((resolve) => {
      if (!this.isSpeaking) {
        resolve(true);
        return;
      }
      
      let resolved = false;
      
      const onEnd = () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      };
      
      this.onEnd(onEnd);
      
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, timeoutMs);
    });
  }
}

/**
 * Animaze/ChatPal WebSocket client
 */
class AnimazeClient {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    
    // Speech state tracker
    this.speechState = new SpeechState();
    
    // Message queue for when waiting for speech
    this.messageQueue = [];
    this.processingQueue = false;
    
    // Request ID counter
    this.requestIdCounter = 0;
    this.pendingRequests = new Map();
    
    // Statistics
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      errors: 0
    };
  }
  
  /**
   * Get WebSocket URI
   * @returns {string} WebSocket URI
   */
  getUri() {
    const host = this.config.animaze?.host || '127.0.0.1';
    const port = this.config.animaze?.port || 9000;
    return `ws://${host}:${port}`;
  }
  
  /**
   * Connect to Animaze
   * @returns {Promise<boolean>} True if connected
   */
  async connect() {
    if (this.isConnected) {
      return true;
    }
    
    // Close existing connection
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) { /* ignore */ }
      this.ws = null;
    }
    
    const uri = this.getUri();
    this.api.log(`Connecting to Animaze at ${uri}...`, 'info');
    
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(uri, {
          handshakeTimeout: 5000
        });
        
        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.api.log('Connected to Animaze successfully', 'info');
          
          // Start queue processor
          this._processQueue();
          
          resolve(true);
        });
        
        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });
        
        this.ws.on('close', () => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this.speechState.markEnded();
          
          if (wasConnected) {
            this.api.log('Disconnected from Animaze', 'info');
          }
          
          // Auto-reconnect if enabled
          if (this.config.animaze?.reconnectOnDisconnect && 
              this.config.animaze?.enabled) {
            this._scheduleReconnect();
          }
        });
        
        this.ws.on('error', (error) => {
          this.stats.errors++;
          this.api.log(`Animaze WebSocket error: ${error.message}`, 'error');
          this.isConnected = false;
          resolve(false);
        });
        
        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            this.api.log('Connection to Animaze timed out', 'warn');
            if (this.ws) {
              try { this.ws.close(); } catch (e) { /* ignore */ }
            }
            resolve(false);
          }
        }, 10000);
        
      } catch (error) {
        this.api.log(`Failed to connect to Animaze: ${error.message}`, 'error');
        this.stats.errors++;
        resolve(false);
      }
    });
  }
  
  /**
   * Disconnect from Animaze
   */
  disconnect() {
    // Clear reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Close WebSocket
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) { /* ignore */ }
      this.ws = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.speechState.markEnded();
    
    this.api.log('Disconnected from Animaze', 'info');
  }
  
  /**
   * Schedule a reconnection attempt
   * @private
   */
  _scheduleReconnect() {
    const maxAttempts = this.config.animaze?.maxReconnectAttempts || 10;
    
    if (this.reconnectAttempts >= maxAttempts) {
      this.api.log('Max reconnect attempts reached', 'warn');
      return;
    }
    
    this.reconnectAttempts++;
    this.stats.reconnectCount++;
    
    // Exponential backoff with jitter
    const baseDelay = this.config.animaze?.reconnectDelay || 5000;
    const delay = Math.min(
      baseDelay * Math.pow(1.5, this.reconnectAttempts - 1) + 
      Math.random() * 1000,
      30000 // Max 30 seconds
    );
    
    this.api.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${Math.round(delay)}ms`, 'info');
    
    this.reconnectTimer = setTimeout(async () => {
      await this.connect();
    }, delay);
  }
  
  /**
   * Handle incoming message
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      this.stats.messagesReceived++;
      
      // Handle speech state events
      const action = message.action || message.event || '';
      
      if (action === 'ChatbotSpeechStarted') {
        this.speechState.markStarted();
        this.api.log('ChatPal started speaking', 'debug');
      } else if (action === 'ChatbotSpeechEnded') {
        this.speechState.markEnded();
        this.api.log('ChatPal finished speaking', 'debug');
        // Process next message in queue
        this._processQueue();
      }
      
      // Handle pending request responses
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve } = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        resolve(message);
      }
      
      // Handle errors
      if (message.error) {
        this.api.log(`Animaze error: ${message.error}`, 'error');
        this.stats.errors++;
      }
      
    } catch (error) {
      this.api.log(`Failed to parse Animaze message: ${error.message}`, 'warn');
    }
  }
  
  /**
   * Send a command to Animaze
   * @param {Object} command - Command object
   * @param {boolean} waitForResponse - Wait for response
   * @returns {Promise<Object|boolean>} Response or success status
   */
  async sendCommand(command, waitForResponse = false) {
    if (!this.isConnected || !this.ws) {
      this.api.log('Cannot send command: Not connected to Animaze', 'warn');
      return waitForResponse ? null : false;
    }
    
    try {
      if (waitForResponse) {
        command.id = `sidekick_${++this.requestIdCounter}_${Date.now()}`;
      }
      
      const message = JSON.stringify(command);
      this.ws.send(message);
      this.stats.messagesSent++;
      
      if (waitForResponse) {
        return new Promise((resolve) => {
          this.pendingRequests.set(command.id, { resolve });
          
          // Timeout after 10 seconds
          setTimeout(() => {
            if (this.pendingRequests.has(command.id)) {
              this.pendingRequests.delete(command.id);
              resolve(null);
            }
          }, 10000);
        });
      }
      
      return true;
    } catch (error) {
      this.api.log(`Failed to send command: ${error.message}`, 'error');
      this.stats.errors++;
      return waitForResponse ? null : false;
    }
  }
  
  /**
   * Send a message to ChatPal
   * @param {string} text - Message text
   * @param {boolean} useEcho - Use -echo prefix for TTS only
   * @param {number} priority - Message priority (higher = more important)
   * @returns {Promise<boolean>} True if queued/sent
   */
  async sendMessage(text, useEcho = false, priority = 1) {
    if (!text || !text.trim()) {
      return false;
    }
    
    // Trim to max line length
    const maxLen = this.config.style?.maxLineLength || 140;
    let trimmedText = text.trim();
    if (trimmedText.length > maxLen) {
      trimmedText = trimmedText.substring(0, maxLen - 1) + '…';
    }
    
    // Apply echo prefix if needed
    const finalText = useEcho ? `-echo ${trimmedText}` : trimmedText;
    
    // Add to queue
    this.messageQueue.push({
      text: finalText,
      priority,
      timestamp: Date.now()
    });
    
    // Sort by priority (higher first)
    this.messageQueue.sort((a, b) => b.priority - a.priority);
    
    this.api.log(`Message queued: ${finalText}`, 'debug');
    
    // Try to process queue
    this._processQueue();
    
    return true;
  }
  
  /**
   * Process message queue
   * @private
   */
  async _processQueue() {
    if (this.processingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    if (!this.isConnected) {
      // Try to connect
      await this.connect();
      if (!this.isConnected) {
        return;
      }
    }
    
    // Wait for speech to end
    if (this.speechState.isSpeaking) {
      return;
    }
    
    this.processingQueue = true;
    
    try {
      const item = this.messageQueue.shift();
      if (!item) {
        this.processingQueue = false;
        return;
      }
      
      const command = {
        action: 'ChatbotSendMessage',
        message: item.text,
        priority: item.priority
      };
      
      this.api.log(`Sending to ChatPal: ${item.text}`, 'info');
      await this.sendCommand(command);
      
      // Wait for speech to start and end
      const speechConfig = this.config.speech || {};
      const waitStartTimeout = speechConfig.waitStartTimeoutMs || 1200;
      const maxSpeechTime = speechConfig.maxSpeechMs || 15000;
      const postGap = speechConfig.postGapMs || 250;
      
      // Wait a bit for speech to start
      await new Promise(resolve => setTimeout(resolve, waitStartTimeout));
      
      // If speaking, wait for it to end
      if (this.speechState.isSpeaking) {
        await this.speechState.waitForEnd(maxSpeechTime);
      }
      
      // Post-speech gap
      await new Promise(resolve => setTimeout(resolve, postGap));
      
    } catch (error) {
      this.api.log(`Queue processing error: ${error.message}`, 'error');
      this.stats.errors++;
    } finally {
      this.processingQueue = false;
      
      // Continue processing if more messages
      if (this.messageQueue.length > 0) {
        setImmediate(() => this._processQueue());
      }
    }
  }
  
  /**
   * Get connection status
   * @returns {Object} Status object
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isSpeaking: this.speechState.isSpeaking,
      queueLength: this.messageQueue.length,
      reconnectAttempts: this.reconnectAttempts,
      stats: { ...this.stats }
    };
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = config;
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    this.disconnect();
    this.messageQueue = [];
    this.pendingRequests.clear();
  }
}

module.exports = { AnimazeClient, SpeechState };
