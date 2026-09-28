/**
 * Sidekick Plugin - Response Engine
 * 
 * Relevance scoring and response generation for chat messages.
 * Determines when and how to respond to stream events.
 */

/**
 * Relevance scorer for chat messages
 */
class Relevance {
  constructor(config) {
    this.config = config;
    this._updatePatterns();
  }
  
  /**
   * Update regex patterns from config
   * @private
   */
  _updatePatterns() {
    const commentConfig = this.config.comment || {};
    
    // Keywords that boost relevance
    this.keywordsBonus = (commentConfig.keywordsBonus || []).map(k => k.toLowerCase());
    
    // Patterns to ignore
    this.ignoreStartswith = (commentConfig.ignoreIfStartswith || []).map(s => s.toLowerCase());
    this.ignoreContains = (commentConfig.ignoreContains || []).map(c => c.toLowerCase());
    
    // URL pattern
    this.urlPattern = /https?:\/\/|\bdiscord\.gg\b/i;
    
    // Greeting pattern
    const greetings = commentConfig.greetings || ['hallo', 'hi', 'hey', 'servus', 'moin', 'hello'];
    this.greetingsPattern = new RegExp(
      `\\b(?:${greetings.join('|')})\\b`,
      'iu'
    );
    
    // Thanks pattern
    const thanks = commentConfig.thanks || ['danke', 'thx', 'thanks', 'ty', 'merci'];
    this.thanksPattern = new RegExp(
      `\\b(?:${thanks.join('|')})\\b`,
      'iu'
    );
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = config;
    this._updatePatterns();
  }
  
  /**
   * Check if a message should be ignored
   * @param {string} text - Message text
   * @returns {boolean} True if should be ignored
   */
  isIgnored(text) {
    const low = text.toLowerCase().trim();
    
    // Check startswith patterns
    if (this.ignoreStartswith.some(s => low.startsWith(s))) {
      return true;
    }
    
    // Check contains patterns
    if (this.ignoreContains.some(c => low.includes(c))) {
      return true;
    }
    
    // Check URL pattern
    if (this.urlPattern.test(low)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if message is a greeting
   * @param {string} text - Message text
   * @returns {boolean} True if greeting
   */
  isGreeting(text) {
    return this.greetingsPattern.test(text);
  }
  
  /**
   * Check if message is a thanks
   * @param {string} text - Message text
   * @returns {boolean} True if thanks
   */
  isThanks(text) {
    return this.thanksPattern.test(text);
  }
  
  /**
   * Calculate relevance score for a message
   * @param {string} text - Message text
   * @returns {number} Score from 0 to 1
   */
  score(text) {
    const low = text.toLowerCase().trim();
    let score = 0;
    
    // Question mark bonus
    if (low.includes('?')) {
      score += 0.6;
    }
    
    // Keyword bonus
    if (this.keywordsBonus.some(k => low.includes(k))) {
      score += 0.35;
    }
    
    // Length bonus
    if (low.length >= 7) {
      score += 0.1;
    }
    
    // Punctuation bonus (indicates engagement)
    if (/[!:;]/.test(low)) {
      score += 0.05;
    }
    
    return Math.min(1.0, score);
  }
}

/**
 * Response engine for generating replies
 */
class ResponseEngine {
  constructor(api, config, memoryStore) {
    this.api = api;
    this.config = config;
    this.memoryStore = memoryStore;
    this.relevance = new Relevance(config);
    
    // Response templates (used when no LLM available)
    this.templates = {
      greeting: [
        'Hallo {nickname}! 👋',
        'Hey {nickname}, willkommen! 🎉',
        '{nickname} sagt hallo! ✨'
      ],
      thanks: [
        '{nickname} bedankt sich! 💜',
        'Danke {nickname}! 🙏',
        '{nickname} zeigt Liebe! ❤️'
      ],
      gift: [
        'Danke {nickname} für {giftName}! 🎁',
        '{nickname} hat {giftName} geschickt! ✨',
        'Wow {nickname}, danke für {giftName}! 💜'
      ],
      follow: [
        'Willkommen {nickname}! 🎉',
        '{nickname} ist jetzt dabei! ✨',
        'Hey {nickname}, danke fürs Folgen! 💜'
      ],
      share: [
        '{nickname} teilt den Stream! 🚀',
        'Danke {nickname} fürs Teilen! ❤️',
        '{nickname} hilft beim Wachsen! 🌟'
      ],
      subscribe: [
        '{nickname} ist jetzt Subscriber! 🎉',
        'Willkommen im Team {nickname}! 💎',
        '{nickname} hat abonniert! ✨'
      ],
      joinAnnouncement: [
        'Willkommen: {names}! 👋',
        'Neu dabei: {names}! 🎉'
      ]
    };
  }
  
  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = config;
    this.relevance.updateConfig(config);
  }
  
  /**
   * Get a random template response
   * @param {string} type - Response type
   * @param {Object} placeholders - Placeholder values
   * @returns {string} Formatted response
   */
  getTemplateResponse(type, placeholders = {}) {
    const templates = this.templates[type] || [];
    if (templates.length === 0) return '';
    
    const template = templates[Math.floor(Math.random() * templates.length)];
    
    let response = template;
    for (const [key, value] of Object.entries(placeholders)) {
      response = response.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    
    return response;
  }
  
  /**
   * Determine response for a chat message
   * @param {string} uid - User ID
   * @param {string} nickname - User nickname
   * @param {string} text - Message text
   * @returns {Object|null} Response object or null
   */
  evaluateChat(uid, nickname, text) {
    const commentConfig = this.config.comment || {};
    
    // Check minimum length
    if (text.length < (commentConfig.minLength || 3)) {
      return null;
    }
    
    // Check if ignored
    if (this.relevance.isIgnored(text)) {
      return null;
    }
    
    // Check for greeting
    if (commentConfig.respondToGreetings && this.relevance.isGreeting(text)) {
      // Don't respond to greetings that are also questions
      if (!text.includes('?') && text.split(/\s+/).length <= 4) {
        return {
          type: 'greeting',
          response: this.getTemplateResponse('greeting', { nickname }),
          priority: 1
        };
      }
    }
    
    // Check for thanks
    if (commentConfig.respondToThanks && this.relevance.isThanks(text)) {
      return {
        type: 'thanks',
        response: this.getTemplateResponse('thanks', { nickname }),
        priority: 1
      };
    }
    
    // Score relevance
    const score = this.relevance.score(text);
    const threshold = commentConfig.replyThreshold || 0.6;
    
    // Guard against misconfigured high threshold (>0.8 would rarely trigger)
    // If threshold is too high, use a sensible default of 0.4 to ensure some responses
    // This prevents user confusion when no responses are generated
    const effectiveThreshold = threshold > 0.8 ? 0.4 : threshold;
    
    if (score >= effectiveThreshold) {
      // For now, return a generic acknowledgment
      // In future, could integrate LLM for intelligent responses
      return {
        type: 'relevant',
        score,
        response: `@${nickname}: ${text}`, // Echo the relevant message
        priority: 2
      };
    }
    
    return null;
  }
  
  /**
   * Generate response for a gift
   * @param {string} nickname - Sender nickname
   * @param {string} giftName - Gift name
   * @param {number} count - Gift count
   * @returns {Object} Response object
   */
  evaluateGift(nickname, giftName, count = 1) {
    const countText = count > 1 ? ` x${count}` : '';
    return {
      type: 'gift',
      response: this.getTemplateResponse('gift', {
        nickname,
        giftName: giftName + countText
      }),
      priority: 3
    };
  }
  
  /**
   * Generate response for a follow
   * @param {string} nickname - Follower nickname
   * @returns {Object} Response object
   */
  evaluateFollow(nickname) {
    return {
      type: 'follow',
      response: this.getTemplateResponse('follow', { nickname }),
      priority: 2
    };
  }
  
  /**
   * Generate response for a share
   * @param {string} nickname - Sharer nickname
   * @returns {Object} Response object
   */
  evaluateShare(nickname) {
    return {
      type: 'share',
      response: this.getTemplateResponse('share', { nickname }),
      priority: 2
    };
  }
  
  /**
   * Generate response for a subscription
   * @param {string} nickname - Subscriber nickname
   * @returns {Object} Response object
   */
  evaluateSubscribe(nickname) {
    return {
      type: 'subscribe',
      response: this.getTemplateResponse('subscribe', { nickname }),
      priority: 4
    };
  }
  
  /**
   * Generate join announcement
   * @param {Array<string>} names - Names to announce
   * @returns {Object} Response object
   */
  generateJoinAnnouncement(names) {
    if (names.length === 0) return null;
    
    const namesText = names.slice(0, 20).join(', ');
    return {
      type: 'joinAnnouncement',
      response: this.getTemplateResponse('joinAnnouncement', { names: namesText }),
      priority: 1
    };
  }
  
  /**
   * Get relevance scorer
   * @returns {Relevance} Relevance instance
   */
  getRelevance() {
    return this.relevance;
  }
}

module.exports = { ResponseEngine, Relevance };
