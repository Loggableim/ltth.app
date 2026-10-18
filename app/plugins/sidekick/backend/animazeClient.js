/**
 * Sidekick Plugin - Animaze/ChatPal high-level client
 *
 * Adds the message queue and speech pacing on top of the raw
 * {@link AnimazeTransport} (see ./animazeTransport.js for the wire contract).
 *
 * The transport socket implementation can be injected through `options`
 * (`socketFactory`, `setTimeout`, `clearTimeout`) which allows the client to be
 * exercised against mocks without a running Animaze instance.
 */

const {
  AnimazeTransport,
  SpeechState,
  ANIMAZE_ACTIONS,
  buildSendMessageCommand
} = require('./animazeTransport');

const DEFAULT_WAIT_START_TIMEOUT_MS = 1200;
const DEFAULT_MAX_SPEECH_MS = 15000;
const DEFAULT_POST_GAP_MS = 250;
const DEFAULT_MAX_LINE_LENGTH = 140;

class AnimazeClient {
  constructor(api, config, options = {}) {
    this.api = api;
    this.config = config;

    this.transport = new AnimazeTransport(api, config, options);
    // Shared with the transport so external readers (main.js) keep working.
    this.speechState = this.transport.speechState;

    // Message queue for when waiting for speech
    this.messageQueue = [];
    this.processingQueue = false;

    this._onSpeechEnded = () => {
      this._processQueue();
    };
    this.transport.on('speech-ended', this._onSpeechEnded);
  }

  /**
   * @returns {boolean}
   */
  get isConnected() {
    return this.transport.isConnected;
  }

  /**
   * @returns {string} WebSocket URI
   */
  getUri() {
    return this.transport.getUri();
  }

  /**
   * Connect to Animaze.
   * @returns {Promise<boolean>}
   */
  async connect() {
    return this.transport.connect();
  }

  /**
   * Disconnect from Animaze.
   */
  disconnect() {
    this.transport.disconnect();
  }

  /**
   * Send a raw command envelope.
   * @param {Object} command
   * @param {boolean} [waitForResponse=false]
   * @returns {Promise<Object|boolean|null>}
   */
  async sendCommand(command, waitForResponse = false) {
    return this.transport.send(command, { waitForResponse });
  }

  /**
   * Queue a message for ChatPal.
   * @param {string} text
   * @param {boolean} [useEcho=false] - use -echo prefix for TTS only
   * @param {number} [priority=1] - higher = more important
   * @returns {Promise<boolean>} true when queued
   */
  async sendMessage(text, useEcho = false, priority = 1) {
    if (!text || !text.trim()) {
      return false;
    }

    const maxLen = this.config.style?.maxLineLength || DEFAULT_MAX_LINE_LENGTH;
    let trimmedText = text.trim();
    if (trimmedText.length > maxLen) {
      trimmedText = trimmedText.substring(0, maxLen - 1) + '…';
    }

    const finalText = useEcho ? `-echo ${trimmedText}` : trimmedText;

    this.messageQueue.push({
      text: finalText,
      priority,
      timestamp: Date.now()
    });

    // Sort by priority (higher first)
    this.messageQueue.sort((a, b) => b.priority - a.priority);

    this.api.log(`Message queued: ${finalText}`, 'debug');

    this._processQueue();

    return true;
  }

  /**
   * Process the message queue: send one message and wait for speech to end.
   * @private
   */
  async _processQueue() {
    if (this.processingQueue || this.messageQueue.length === 0) {
      return;
    }

    if (!this.transport.isConnected) {
      await this.transport.connect();
      if (!this.transport.isConnected) {
        return;
      }
    }

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

      const command = buildSendMessageCommand(item.text, { priority: item.priority });

      this.api.log(`Sending to ChatPal: ${item.text}`, 'info');
      this.transport.send(command);

      const speechConfig = this.config.speech || {};
      const waitStartTimeout = speechConfig.waitStartTimeoutMs || DEFAULT_WAIT_START_TIMEOUT_MS;
      const maxSpeechTime = speechConfig.maxSpeechMs || DEFAULT_MAX_SPEECH_MS;
      const postGap = speechConfig.postGapMs || DEFAULT_POST_GAP_MS;

      // Wait a bit for speech to start
      await new Promise(resolve => setTimeout(resolve, waitStartTimeout));

      // If speaking, wait for it to end
      if (this.speechState.isSpeaking) {
        await this.speechState.waitForEnd(maxSpeechTime);
      }

      // Post-speech gap
      await new Promise(resolve => setTimeout(resolve, postGap));

    } catch (error) {
      this.transport.stats.errors++;
      this.api.log(`Queue processing error: ${error.message}`, 'error');
    } finally {
      this.processingQueue = false;

      // Continue processing if more messages
      if (this.messageQueue.length > 0) {
        setImmediate(() => this._processQueue());
      }
    }
  }

  /**
   * @returns {Object} status snapshot
   */
  getStatus() {
    return {
      ...this.transport.getStatus(),
      queueLength: this.messageQueue.length
    };
  }

  /**
   * @param {Object} config
   */
  updateConfig(config) {
    this.config = config;
    this.transport.updateConfig(config);
  }

  /**
   * Clean up resources.
   */
  destroy() {
    this.transport.removeListener('speech-ended', this._onSpeechEnded);
    this.transport.destroy();
    this.messageQueue = [];
    this.processingQueue = false;
  }
}

module.exports = { AnimazeClient, SpeechState, ANIMAZE_ACTIONS };
