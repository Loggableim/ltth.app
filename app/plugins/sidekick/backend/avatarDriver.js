/**
 * Sidekick Plugin - Base Avatar Driver
 * 
 * Abstract interface for avatar controllers (VNyan, Animaze, etc.)
 */

const EventEmitter = require('events');

class BaseAvatarDriver extends EventEmitter {
  constructor(api, config) {
    super();
    this.api = api;
    this.config = config;
    this.isConnected = false;
    this.isSpeaking = false;
  }

  /**
   * Connect to avatar software
   * @returns {Promise<boolean>}
   */
  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  /**
   * Disconnect from avatar software
   */
  disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  /**
   * Get driver connection and speech status
   * @returns {Object}
   */
  getStatus() {
    return {
      name: this.constructor.name,
      isConnected: this.isConnected,
      isSpeaking: this.isSpeaking
    };
  }

  /**
   * Notify avatar that speech has started or ended
   * @param {boolean} isSpeaking 
   * @param {string} [text]
   */
  async setSpeaking(isSpeaking, text = '') {
    this.isSpeaking = !!isSpeaking;
  }

  /**
   * Trigger an expression on avatar
   * @param {string} emotion (e.g. 'joy', 'thinking', 'angry', 'surprised')
   * @param {number} [intensity=1.0] (0.0 to 1.0)
   */
  async triggerExpression(emotion, intensity = 1.0) {
    // optional override in subclass
  }

  /**
   * Trigger an action/animation on avatar
   * @param {string} actionName
   * @param {Object} [params]
   */
  async triggerAction(actionName, params = {}) {
    // optional override in subclass
  }

  /**
   * Handle stream event (gift, follow, like, chat)
   * @param {string} eventType ('gift', 'like', 'follow', 'share', 'chat')
   * @param {Object} eventData
   */
  async handleStreamEvent(eventType, eventData = {}) {
    // optional override in subclass
  }

  /**
   * Send speech / message text to avatar
   * @param {string} text
   * @param {Object} [options]
   */
  async sendMessage(text, options = {}) {
    // optional override in subclass
  }

  /**
   * Update configuration
   * @param {Object} config
   */
  updateConfig(config) {
    this.config = config;
  }

  /**
   * Cleanup
   */
  destroy() {
    this.disconnect();
    this.removeAllListeners();
  }
}

module.exports = { BaseAvatarDriver };
