/**
 * Sidekick Plugin - VNyan WebSocket Client
 * 
 * High-performance 3D/VRM avatar driver connecting to VNyan via WebSockets.
 * Default endpoint: ws://127.0.0.1:8000/vnyan
 */

const path = require('path');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (err) {
  try {
    WebSocket = require(require.resolve('ws', {
      paths: [process.cwd(), path.join(__dirname, '../../../../app/node_modules')]
    }));
  } catch (err2) {
    WebSocket = global.WebSocket;
  }
}
const { BaseAvatarDriver } = require('./avatarDriver');

class VNyanClient extends BaseAvatarDriver {
  constructor(api, config) {
    super(api, config);
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.isManualDisconnect = false;
    
    // Statistics & diagnostics
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      reconnectCount: 0,
      errors: 0,
      lastConnectedAt: null,
      lastDisconnectedAt: null,
      lastTriggerSent: null
    };

    // Speech state tracking
    this.speechState = {
      isSpeaking: false,
      speechStartedAt: null,
      speechEndedAt: null
    };

    // Emotion state machine tracking
    this.currentEmotion = 'Neutral';
    this.emotionTimer = null;
    this.emotionExpiresAt = null;
  }

  /**
   * Get VNyan configuration
   */
  getVnyanConfig() {
    const avatarConf = this.config.avatar || {};
    const vnyanConf = avatarConf.vnyan || {};
    return {
      enabled: avatarConf.driver === 'vnyan' || (!avatarConf.driver && this.config.animaze?.enabled !== true),
      host: vnyanConf.host || '127.0.0.1',
      port: vnyanConf.port || 8000,
      path: vnyanConf.path || '/vnyan',
      reconnectOnDisconnect: vnyanConf.reconnectOnDisconnect !== false,
      reconnectDelay: vnyanConf.reconnectDelay || 4000,
      maxReconnectAttempts: vnyanConf.maxReconnectAttempts || 15,
      sendPlainTriggers: vnyanConf.sendPlainTriggers !== false,
      triggers: {
        speechStart: vnyanConf.triggers?.speechStart || 'SK_Speak_Start',
        speechEnd: vnyanConf.triggers?.speechEnd || 'SK_Speak_End',
        gift: vnyanConf.triggers?.gift || 'SK_Gift',
        like: vnyanConf.triggers?.like || 'SK_Like',
        follow: vnyanConf.triggers?.follow || 'SK_Follow',
        share: vnyanConf.triggers?.share || 'SK_Share',
        chat: vnyanConf.triggers?.chat || 'SK_Chat',
        question: vnyanConf.triggers?.question || 'SK_Question'
      },
      giftRules: Array.isArray(vnyanConf.giftRules) ? vnyanConf.giftRules : [],
      emotions: vnyanConf.emotions || {},
      itemDrop: vnyanConf.itemDrop || {}
    };
  }

  /**
   * Get WebSocket URI
   * @returns {string}
   */
  getUri() {
    const conf = this.getVnyanConfig();
    const cleanPath = conf.path.startsWith('/') ? conf.path : `/${conf.path}`;
    return `ws://${conf.host}:${conf.port}${cleanPath}`;
  }

  /**
   * Connect to VNyan WebSocket
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (this.isConnected) {
      return true;
    }

    this.isManualDisconnect = false;

    // Clean up previous socket if any
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* ignore */ }
      this.ws = null;
    }

    const uri = this.getUri();
    this.api.log(`[VNyan] Connecting to VNyan at ${uri}...`, 'info');

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(uri, {
          handshakeTimeout: 5000
        });

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.stats.lastConnectedAt = Date.now();
          this.api.log(`[VNyan] Connected successfully to ${uri}`, 'info');
          this.emit('connected');
          resolve(true);
        });

        this.ws.on('message', (data) => {
          this._handleIncomingMessage(data);
        });

        this.ws.on('close', (code, reason) => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this.stats.lastDisconnectedAt = Date.now();

          if (wasConnected) {
            this.api.log(`[VNyan] Disconnected from VNyan (code: ${code})`, 'warn');
            this.emit('disconnected', { code, reason });
          }

          const conf = this.getVnyanConfig();
          if (!this.isManualDisconnect && conf.reconnectOnDisconnect) {
            this._scheduleReconnect();
          }
        });

        this.ws.on('error', (err) => {
          this.stats.errors++;
          this.api.log(`[VNyan] WebSocket error: ${err.message}`, 'error');
          this.isConnected = false;
          this.emit('error', err);
          resolve(false);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            this.api.log(`[VNyan] Connection to ${uri} timed out`, 'warn');
            if (this.ws) {
              try { this.ws.close(); } catch (e) { /* ignore */ }
            }
            resolve(false);
          }
        }, 6000);

      } catch (error) {
        this.api.log(`[VNyan] Failed to initiate connection: ${error.message}`, 'error');
        this.stats.errors++;
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from VNyan
   */
  disconnect() {
    this.isManualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.emotionTimer) {
      clearTimeout(this.emotionTimer);
      this.emotionTimer = null;
    }
    this.currentEmotion = 'Neutral';
    this.emotionExpiresAt = null;

    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* ignore */ }
      this.ws = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.setSpeaking(false);
    this.api.log('[VNyan] Disconnected from VNyan', 'info');
  }

  /**
   * Reconnection scheduler with exponential backoff
   * @private
   */
  _scheduleReconnect() {
    const conf = this.getVnyanConfig();
    if (this.reconnectAttempts >= conf.maxReconnectAttempts) {
      this.api.log('[VNyan] Maximum reconnect attempts reached', 'warn');
      return;
    }

    this.reconnectAttempts++;
    this.stats.reconnectCount++;

    const baseDelay = conf.reconnectDelay || 4000;
    const delay = Math.min(
      baseDelay * Math.pow(1.4, this.reconnectAttempts - 1) + Math.random() * 1000,
      30000
    );

    this.api.log(`[VNyan] Scheduling reconnect #${this.reconnectAttempts} in ${Math.round(delay)}ms`, 'debug');

    this.reconnectTimer = setTimeout(async () => {
      await this.connect();
    }, delay);
  }

  /**
   * Handle incoming messages from VNyan
   * @private
   */
  _handleIncomingMessage(data) {
    try {
      this.stats.messagesReceived++;
      const str = data.toString();
      let parsed = null;
      try {
        parsed = JSON.parse(str);
      } catch (e) {
        parsed = { text: str };
      }
      this.emit('message', parsed);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Send payload to VNyan
   * @param {string|Object} payload 
   * @returns {boolean}
   */
  send(payload) {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
      this.ws.send(message);
      this.stats.messagesSent++;
      return true;
    } catch (err) {
      this.stats.errors++;
      this.api.log(`[VNyan] Error sending payload: ${err.message}`, 'error');
      return false;
    }
  }

  /**
   * Send a named trigger with optional metadata
   * Sends both a JSON structure and optionally a raw string trigger for direct node callbacks.
   * @param {string} triggerName 
   * @param {Object} [data={}]
   * @returns {boolean}
   */
  sendTrigger(triggerName, data = {}) {
    if (!triggerName) return false;

    const conf = this.getVnyanConfig();
    this.stats.lastTriggerSent = {
      name: triggerName,
      data,
      timestamp: Date.now()
    };

    // 1. Structured JSON for modern VNyan Callback nodes
    const payload = {
      action: 'trigger',
      name: triggerName,
      trigger: triggerName,
      data,
      timestamp: Date.now()
    };
    const jsonSent = this.send(payload);

    // 2. Also send plain text trigger if configured (VNyan simple string matching)
    if (conf.sendPlainTriggers && jsonSent) {
      this.send(triggerName);
    }

    this.api.log(`[VNyan] Trigger sent: ${triggerName}`, 'debug');
    return jsonSent;
  }

  /**
   * Notify VNyan when avatar starts/stops speaking
   * @param {boolean} isSpeaking 
   * @param {string} [text]
   */
  async setSpeaking(isSpeaking, text = '') {
    this.isSpeaking = !!isSpeaking;
    this.speechState.isSpeaking = this.isSpeaking;

    const conf = this.getVnyanConfig();
    const triggerName = this.isSpeaking ? conf.triggers.speechStart : conf.triggers.speechEnd;

    if (this.isSpeaking) {
      this.speechState.speechStartedAt = Date.now();
    } else {
      this.speechState.speechEndedAt = Date.now();
    }

    this.sendTrigger(triggerName, {
      isSpeaking: this.isSpeaking,
      text: text || ''
    });
  }

  /**
   * Trigger an expression / emotion on avatar
   * @param {string} emotion 
   * @param {number} [intensity=1.0]
   * @param {number} [durationMs]
   */
  async triggerExpression(emotion, intensity = 1.0, durationMs = null) {
    return this.triggerEmotion(emotion, durationMs, intensity);
  }

  /**
   * Trigger an emotion with automatic decay timer back to Neutral
   * @param {string} emotion (e.g. 'Happy', 'Blush', 'Surprised', 'Thinking', 'Neutral')
   * @param {number} [durationMs]
   * @param {number} [intensity=1.0]
   * @returns {boolean}
   */
  triggerEmotion(emotion, durationMs = null, intensity = 1.0) {
    if (!emotion) return false;

    const conf = this.getVnyanConfig();
    const clampedIntensity = Math.max(0, Math.min(1, intensity !== undefined ? intensity : 1.0));

    // Clear active timer if any
    if (this.emotionTimer) {
      clearTimeout(this.emotionTimer);
      this.emotionTimer = null;
    }

    this.currentEmotion = emotion;

    const triggerName = `SK_Emotion_${emotion}`;
    const payload = {
      emotion,
      intensity: clampedIntensity
    };
    if (durationMs !== null && durationMs !== undefined) {
      payload.durationMs = durationMs;
    }

    const sent = this.sendTrigger(triggerName, payload);

    const isNeutral = emotion.toLowerCase() === 'neutral';

    // Auto-reset state machine
    if (!isNeutral && conf.emotions?.autoReset !== false) {
      const decayDuration = durationMs !== null && durationMs !== undefined
        ? durationMs
        : (conf.emotions?.defaultDurationMs || 4000);

      this.emotionExpiresAt = Date.now() + decayDuration;

      this.emotionTimer = setTimeout(() => {
        this.resetEmotion();
      }, decayDuration);
    } else if (isNeutral) {
      this.emotionExpiresAt = null;
    }

    return sent;
  }

  /**
   * Reset avatar expression back to Neutral
   * @returns {boolean}
   */
  resetEmotion() {
    if (this.emotionTimer) {
      clearTimeout(this.emotionTimer);
      this.emotionTimer = null;
    }

    const conf = this.getVnyanConfig();
    const neutral = conf.emotions?.neutralEmotion || 'Neutral';
    this.currentEmotion = neutral;
    this.emotionExpiresAt = null;

    const triggerName = `SK_Emotion_${neutral}`;
    return this.sendTrigger(triggerName, {
      emotion: neutral,
      intensity: 1.0,
      isReset: true
    });
  }

  /**
   * Trigger an Item Drop / Prop Throw in VNyan
   * @param {string} itemName 
   * @param {number} [count=1] 
   * @param {string} [user='']
   * @returns {boolean}
   */
  triggerItemDrop(itemName, count = 1, user = '') {
    const conf = this.getVnyanConfig();
    if (conf.itemDrop?.enabled === false) {
      return false;
    }

    const maxDrop = conf.itemDrop?.maxDropPerGift || 30;
    const safeCount = Math.min(Math.max(1, parseInt(count, 10) || 1), maxDrop);
    const triggerName = conf.itemDrop?.triggerName || 'SK_ItemDrop';

    return this.sendTrigger(triggerName, {
      item: itemName || 'Gift',
      count: safeCount,
      user: user || '',
      timestamp: Date.now()
    });
  }

  /**
   * Match a gift event against configured gift rules
   * @param {string} giftName 
   * @param {number} diamondCount 
   * @param {number} repeatCount 
   * @returns {Object|null}
   */
  matchGiftRule(giftName = '', diamondCount = 1, repeatCount = 1) {
    const conf = this.getVnyanConfig();
    const rules = conf.giftRules || [];
    if (!Array.isArray(rules) || rules.length === 0) {
      return null;
    }

    const cleanName = String(giftName || '').toLowerCase().trim();
    const totalDiamonds = (Number(diamondCount) || 1) * (Number(repeatCount) || 1);

    for (const rule of rules) {
      if (!rule || !rule.trigger) continue;

      if (rule.matchType === 'name' && rule.matchValue) {
        const ruleName = String(rule.matchValue).toLowerCase().trim();
        if (cleanName === ruleName || cleanName.includes(ruleName)) {
          return rule;
        }
      } else if (rule.matchType === 'minDiamonds' && rule.matchValue !== undefined) {
        const threshold = Number(rule.matchValue) || 0;
        if (totalDiamonds >= threshold || (Number(diamondCount) || 1) >= threshold) {
          return rule;
        }
      }
    }

    return null;
  }

  /**
   * Trigger an action or animation
   * @param {string} actionName 
   * @param {Object} [params={}]
   */
  async triggerAction(actionName, params = {}) {
    if (!actionName) return;
    this.sendTrigger(actionName, params);
  }

  /**
   * Handle TikTok / Stream events and map them to VNyan triggers
   * @param {string} eventType 
   * @param {Object} eventData 
   */
  async handleStreamEvent(eventType, eventData = {}) {
    const conf = this.getVnyanConfig();
    const triggerBase = conf.triggers[eventType] || `SK_${eventType.toUpperCase()}`;

    switch (eventType) {
      case 'gift': {
        const rawGiftName = eventData.giftName || 'Gift';
        const giftName = rawGiftName.replace(/[^a-zA-Z0-9]/g, '');
        const diamonds = eventData.diamondCount || 1;
        const repeat = eventData.repeatCount || 1;
        const user = eventData.nickname || eventData.uniqueId || 'Viewer';

        // Check custom gift rules
        const matchedRule = this.matchGiftRule(rawGiftName, diamonds, repeat);

        if (matchedRule) {
          // Send custom rule trigger
          this.sendTrigger(matchedRule.trigger, {
            type: 'gift',
            giftName: rawGiftName,
            diamonds,
            repeat,
            user,
            ruleId: matchedRule.id
          });

          // Trigger custom emotion if defined
          if (matchedRule.emotion) {
            this.triggerEmotion(matchedRule.emotion, matchedRule.durationMs || 4000);
          }

          // Trigger item drop if enabled for rule
          if (matchedRule.itemDrop) {
            const dropCount = matchedRule.dropCount || repeat || 1;
            this.triggerItemDrop(rawGiftName, dropCount, user);
          }
        }

        // Trigger general gift base trigger
        this.sendTrigger(triggerBase, {
          type: 'gift',
          giftName: rawGiftName,
          diamonds,
          repeat,
          user,
          matchedRule: !!matchedRule
        });

        // Trigger specific gift name (e.g. SK_Gift_Rose)
        if (giftName) {
          this.sendTrigger(`${triggerBase}_${giftName}`, {
            diamonds,
            repeat,
            user
          });
        }
        break;
      }

      case 'like': {
        this.sendTrigger(triggerBase, {
          type: 'like',
          ...eventData
        });

        const streakConf = conf.emotions?.eventEmotions?.likeStreak;
        const likeCount = eventData.likeCount || eventData.totalLikeCount || 1;
        if (streakConf && likeCount >= (streakConf.threshold || 50)) {
          this.triggerEmotion(streakConf.emotion || 'Happy', streakConf.durationMs || 2500);
        }
        break;
      }

      case 'follow': {
        this.sendTrigger(triggerBase, {
          type: 'follow',
          ...eventData
        });

        const followEmo = conf.emotions?.eventEmotions?.follow;
        if (followEmo?.emotion) {
          this.triggerEmotion(followEmo.emotion, followEmo.durationMs || 3500);
        }
        break;
      }

      case 'share': {
        this.sendTrigger(triggerBase, {
          type: 'share',
          ...eventData
        });

        const shareEmo = conf.emotions?.eventEmotions?.share;
        if (shareEmo?.emotion) {
          this.triggerEmotion(shareEmo.emotion, shareEmo.durationMs || 3000);
        }
        break;
      }

      case 'subscribe': {
        this.sendTrigger(triggerBase, {
          type: 'subscribe',
          ...eventData
        });

        const subEmo = conf.emotions?.eventEmotions?.subscribe;
        if (subEmo?.emotion) {
          this.triggerEmotion(subEmo.emotion, subEmo.durationMs || 6000);
        }
        break;
      }

      case 'chat': {
        this.sendTrigger(triggerBase, {
          type: 'chat',
          ...eventData
        });

        const comment = (eventData.comment || '').toLowerCase();
        const questionWords = ['warum', 'wieso', 'wie', 'wann', 'wo', 'wer', 'was', 'welche', 'why', 'how', 'when', 'where', 'who', 'what'];
        const isQuestion = comment.includes('?') || questionWords.some(w => comment.split(/\s+/).includes(w));
        const qEmo = conf.emotions?.eventEmotions?.question;

        if (isQuestion && qEmo?.emotion) {
          this.triggerEmotion(qEmo.emotion, qEmo.durationMs || 4500);
        }
        break;
      }

      default:
        this.sendTrigger(triggerBase, eventData);
        break;
    }
  }

  /**
   * Get detailed status for UI and API
   * @returns {Object}
   */
  getStatus() {
    return {
      driver: 'vnyan',
      isConnected: this.isConnected,
      isSpeaking: this.isSpeaking,
      currentEmotion: this.currentEmotion,
      emotionExpiresAt: this.emotionExpiresAt,
      giftRulesCount: (this.getVnyanConfig().giftRules || []).length,
      reconnectAttempts: this.reconnectAttempts,
      uri: this.getUri(),
      stats: { ...this.stats },
      speechState: { ...this.speechState }
    };
  }
}

module.exports = { VNyanClient };
