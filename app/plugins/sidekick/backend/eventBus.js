/**
 * Sidekick Plugin - Event Bus
 * 
 * Typed event system for internal event routing and stream analytics.
 * Provides pub/sub functionality with event history and statistics.
 */

const EventEmitter = require('events');

/**
 * Event types
 */
const EventTypes = {
  CHAT: 'chat',
  GIFT: 'gift',
  LIKE: 'like',
  JOIN: 'join',
  FOLLOW: 'follow',
  SHARE: 'share',
  SUBSCRIBE: 'subscribe',
  RESPONSE_SENT: 'response_sent',
  JOIN_ANNOUNCED: 'join_announced',
  ANIMAZE_CONNECTED: 'animaze_connected',
  ANIMAZE_DISCONNECTED: 'animaze_disconnected',
  SPEECH_STARTED: 'speech_started',
  SPEECH_ENDED: 'speech_ended'
};

/**
 * Normalized event schema
 */
class StreamEvent {
  constructor(type, uid, nickname, payload = {}) {
    this.type = type;
    this.ts = Date.now();
    this.uid = uid;
    this.nickname = nickname;
    this.payload = payload;
  }
  
  /**
   * Create a unique signature for deduplication
   * @returns {string} Signature hash
   */
  getSignature() {
    const raw = `${this.type}|${this.uid}|${JSON.stringify(this.payload)}`;
    // Simple hash for deduplication
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${this.type}_${this.uid}_${hash}`;
  }
}

/**
 * Event bus for typed events and analytics
 */
class EventBus extends EventEmitter {
  constructor(api) {
    super();
    this.api = api;
    
    // Event history for analytics (rolling window)
    this.eventHistory = [];
    this.maxHistorySize = 1000;
    
    // Event counters (per minute rolling)
    this.counters = {
      chat: 0,
      gift: 0,
      like: 0,
      join: 0,
      follow: 0,
      share: 0,
      subscribe: 0,
      responseSent: 0
    };
    
    // Rolling window for rate calculations
    this.windowEvents = [];
    this.windowDurationMs = 60000; // 1 minute
    
    // Analytics aggregation
    this.analytics = {
      sessionStart: Date.now(),
      totalEvents: 0,
      peakEventsPerMinute: 0,
      lastBurst: null
    };
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this._cleanup(), 10000);
  }
  
  /**
   * Publish an event
   * @param {StreamEvent} event - Event to publish
   */
  publish(event) {
    // Add to history
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    
    // Add to rolling window
    this.windowEvents.push({ ts: event.ts, type: event.type });
    
    // Update counters
    if (this.counters[event.type] !== undefined) {
      this.counters[event.type]++;
    }
    
    // Update analytics
    this.analytics.totalEvents++;
    
    // Emit typed event
    this.emit(event.type, event);
    
    // Emit generic event for subscribers wanting all events
    this.emit('event', event);
  }
  
  /**
   * Create and publish a chat event
   */
  publishChat(uid, nickname, comment) {
    const event = new StreamEvent(EventTypes.CHAT, uid, nickname, { comment });
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a gift event
   */
  publishGift(uid, nickname, giftName, giftId, diamondCount, repeatCount = 1) {
    const event = new StreamEvent(EventTypes.GIFT, uid, nickname, {
      giftName,
      giftId,
      diamondCount,
      repeatCount
    });
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a like event
   */
  publishLike(uid, nickname, likeCount) {
    const event = new StreamEvent(EventTypes.LIKE, uid, nickname, { likeCount });
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a join event
   */
  publishJoin(uid, nickname) {
    const event = new StreamEvent(EventTypes.JOIN, uid, nickname, {});
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a follow event
   */
  publishFollow(uid, nickname) {
    const event = new StreamEvent(EventTypes.FOLLOW, uid, nickname, {});
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a share event
   */
  publishShare(uid, nickname) {
    const event = new StreamEvent(EventTypes.SHARE, uid, nickname, {});
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a subscribe event
   */
  publishSubscribe(uid, nickname) {
    const event = new StreamEvent(EventTypes.SUBSCRIBE, uid, nickname, {});
    this.publish(event);
    return event;
  }
  
  /**
   * Create and publish a response sent event
   */
  publishResponseSent(text) {
    const event = new StreamEvent(EventTypes.RESPONSE_SENT, 'system', 'Sidekick', { text });
    this.publish(event);
    return event;
  }
  
  /**
   * Get events per minute for a specific type
   * @param {string} type - Event type
   * @returns {number} Events per minute
   */
  getEventsPerMinute(type = null) {
    const cutoff = Date.now() - this.windowDurationMs;
    const windowEvents = this.windowEvents.filter(e => e.ts > cutoff);
    
    if (type) {
      return windowEvents.filter(e => e.type === type).length;
    }
    return windowEvents.length;
  }
  
  /**
   * Get current analytics snapshot
   * @returns {Object} Analytics data
   */
  getAnalytics() {
    const eventsPerMinute = this.getEventsPerMinute();
    
    // Update peak if needed
    if (eventsPerMinute > this.analytics.peakEventsPerMinute) {
      this.analytics.peakEventsPerMinute = eventsPerMinute;
    }
    
    // Detect burst (>50% above average)
    const avgEventsPerMinute = this.analytics.totalEvents / 
      ((Date.now() - this.analytics.sessionStart) / 60000) || 0;
    if (eventsPerMinute > avgEventsPerMinute * 1.5 && eventsPerMinute > 10) {
      this.analytics.lastBurst = Date.now();
    }
    
    return {
      sessionStart: this.analytics.sessionStart,
      sessionDurationMs: Date.now() - this.analytics.sessionStart,
      totalEvents: this.analytics.totalEvents,
      eventsPerMinute,
      peakEventsPerMinute: this.analytics.peakEventsPerMinute,
      lastBurst: this.analytics.lastBurst,
      byType: {
        chat: this.getEventsPerMinute(EventTypes.CHAT),
        gift: this.getEventsPerMinute(EventTypes.GIFT),
        like: this.getEventsPerMinute(EventTypes.LIKE),
        join: this.getEventsPerMinute(EventTypes.JOIN),
        follow: this.getEventsPerMinute(EventTypes.FOLLOW),
        share: this.getEventsPerMinute(EventTypes.SHARE),
        subscribe: this.getEventsPerMinute(EventTypes.SUBSCRIBE)
      }
    };
  }
  
  /**
   * Get recent events of a specific type
   * @param {string} type - Event type
   * @param {number} limit - Max events to return
   * @returns {Array} Recent events
   */
  getRecentEvents(type = null, limit = 50) {
    let events = this.eventHistory;
    if (type) {
      events = events.filter(e => e.type === type);
    }
    return events.slice(-limit);
  }
  
  /**
   * Clean up old data
   * @private
   */
  _cleanup() {
    const cutoff = Date.now() - this.windowDurationMs;
    this.windowEvents = this.windowEvents.filter(e => e.ts > cutoff);
  }
  
  /**
   * Reset counters (call at stream start)
   */
  resetSession() {
    this.eventHistory = [];
    this.windowEvents = [];
    this.counters = {
      chat: 0,
      gift: 0,
      like: 0,
      join: 0,
      follow: 0,
      share: 0,
      subscribe: 0,
      responseSent: 0
    };
    this.analytics = {
      sessionStart: Date.now(),
      totalEvents: 0,
      peakEventsPerMinute: 0,
      lastBurst: null
    };
    this.api.log('Event bus session reset', 'info');
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.removeAllListeners();
  }
}

module.exports = { EventBus, EventTypes, StreamEvent };
