/**
 * Sidekick Plugin - Response Engine
 * 
 * Relevance scoring and response generation for chat messages.
 * Determines when and how to respond to stream events.
 */

/**
 * Relevance scorer for chat messages
 */

function clampValue(value, min, max, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.min(max, Math.max(min, normalized));
}

function sanitizeList(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item.length >= 2)
    .filter((item, index, items) => items.indexOf(item) === index);
}

function normalizeDecisionMode(mode) {
  const safe = String(mode || 'auto').toLowerCase().trim();
  if (safe === 'always' || safe === 'mentions' || safe === 'probability' || safe === 'off') {
    return safe;
  }
  return 'auto';
}

function buildSafeReason(value) {
  const safe = String(value || '').trim();
  return safe.length > 80 ? `${safe.slice(0, 77)}...` : safe;
}

function findMention(text, terms = []) {
  if (!Array.isArray(terms) || terms.length === 0) return null;
  const normalized = text.toLowerCase();
  for (const term of terms) {
    const token = String(term || '').trim().toLowerCase();
    if (!token || token.length < 2) continue;
    if (normalized.includes(token)) return token;
  }
  return null;
}

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
    let score = 0.25;
    
    // Question mark bonus
    if (low.includes('?')) {
      score += 0.45;
    }
    
    // Keyword bonus
    if (this.keywordsBonus.some(k => low.includes(k))) {
      score += 0.3;
    }
    
    // Length bonus
    if (low.length >= 4) {
      score += 0.15;
    }
    
    // Punctuation bonus (indicates engagement)
    if (/[!:;]/.test(low)) {
      score += 0.1;
    }

    if (this.config.comment?.mentionEnabled) {
      const mentions = sanitizeList(this.config.comment.mentionTerms, []);
      const mentioned = findMention(low, mentions);
      if (mentioned) score += 0.25;
    }
    
    return Math.min(1.0, score);
  }

  extractFeatures(text, commentConfig = {}) {
    const clean = String(text || '').trim();
    const low = clean.toLowerCase();
    const words = low.split(/\s+/).filter(Boolean);
    const mentionTerms = sanitizeList(commentConfig.mentionTerms, []);
    const mention = findMention(low, mentionTerms);
    return {
      textLength: clean.length,
      wordCount: words.length,
      isQuestion: low.includes('?'),
      isLongForm: words.length > Number(commentConfig.longFormWordLimit || 45),
      mentionTerm: mention,
      mentionsKnownName: Boolean(mention),
      hasEmoji: /\p{Extended_Pictographic}/u.test(clean),
      startsWithCommand: low.startsWith('!') || low.startsWith('/'),
      hasPunctuation: /[!?.,;:]/.test(low)
    };
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

  _getConversationState(context = {}) {
    const state = context?.conversationState || context?.conversation || null;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    return state;
  }

  _getConversationBias(conversationState = null, features = {}) {
    if (!conversationState) {
      return {
        thresholdBoost: 0,
        probabilityBoost: 0,
        mentionRelaxed: false
      };
    }

    let thresholdBoost = 0;
    let probabilityBoost = 0;
    if (conversationState.active) {
      thresholdBoost += 0.15;
      probabilityBoost += 0.1;
    }
    if (conversationState.lastSpeaker === 'host') {
      thresholdBoost += 0.05;
      probabilityBoost += 0.05;
    }
    if (Number.isFinite(Number(conversationState.turnCount)) && Number(conversationState.turnCount) >= 4) {
      thresholdBoost += 0.05;
    }
    if (features.isQuestion) {
      thresholdBoost += 0.05;
    }

    return {
      thresholdBoost: clampValue(thresholdBoost, 0, 0.35, 0),
      probabilityBoost: clampValue(probabilityBoost, 0, 0.3, 0),
      mentionRelaxed: conversationState.active && Number(conversationState.turnCount) >= 2
    };
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
  evaluateChat(uid, nickname, text, context = {}) {
    const commentConfig = this.config.comment || {};
    const decisionMode = normalizeDecisionMode(commentConfig.decisionMode || 'auto');
    const minLength = commentConfig.minLength || 3;
    // Keep Sidekick a bit more conversational than the raw threshold suggests.
    const responseBias = clampValue(commentConfig.responseBias, 0, 0.5, 0.2);
    const decisionMinScore = Math.max(0, clampValue(commentConfig.replyThreshold, 0, 1, 0.6) - responseBias);
    const decisionProbability = clampValue(commentConfig.decisionProbability, 0, 1, commentConfig.chatResponseProbability ?? 1);
    const mentionTerms = sanitizeList(commentConfig.mentionTerms, ['sidekick', 'animazingpal', 'pal']);
    const conversationState = this._getConversationState(context);
    const features = this.relevance.extractFeatures(text, {
      ...commentConfig,
      mentionTerms
    });
    const conversationBias = this._getConversationBias(conversationState, features);
    const effectiveDecisionMinScore = Math.max(0, decisionMinScore - conversationBias.thresholdBoost);
    const effectiveDecisionProbability = Math.min(1, decisionProbability + conversationBias.probabilityBoost);
    const effectiveMinLength = conversationBias.mentionRelaxed ? Math.min(minLength, 2) : minLength;
    
    // Check minimum length
    if (text.length < effectiveMinLength) {
      return {
        respond: false,
        score: 0,
        mode: decisionMode,
        reason: 'too_short',
        skipReason: 'too_short',
        selection: 'none',
        type: 'chat',
        priority: 0,
        features
      };
    }
    
    // Check if ignored
    if (this.relevance.isIgnored(text)) {
      return {
        respond: false,
        score: 0,
        mode: decisionMode,
        reason: 'ignored',
        skipReason: 'ignored',
        selection: 'none',
        type: 'chat',
        priority: 0,
        features
      };
    }
    
    // Check for greeting
    if (commentConfig.respondToGreetings && this.relevance.isGreeting(text)) {
      // Don't respond to greetings that are also questions
      if (!text.includes('?') && text.split(/\s+/).length <= 4) {
        return {
          respond: true,
          type: 'greeting',
          response: this.getTemplateResponse('greeting', { nickname }),
          priority: 1,
          mode: decisionMode,
          score: 0.65,
          reason: 'greeting',
          selection: 'greeting',
          features
        };
      }
    }
    
    // Check for thanks
    if (commentConfig.respondToThanks && this.relevance.isThanks(text)) {
      return {
        respond: true,
        type: 'thanks',
        response: this.getTemplateResponse('thanks', { nickname }),
        priority: 1,
        mode: decisionMode,
        score: 0.65,
        reason: 'thanks',
        selection: 'thanks',
        features
      };
    }
    
    // Sidekick decision mode gate
    if (decisionMode === 'off') {
      return {
        respond: false,
        score: 0,
        mode: decisionMode,
        reason: 'mode_off',
        skipReason: 'mode_off',
        selection: 'none',
        type: 'chat',
        priority: 0,
        features
      };
    }

    // Score relevance
    const score = this.relevance.score(text);
    const needsMention =
      decisionMode === 'mentions'
      && !features.isQuestion
      && !features.isLongForm
      && !features.mentionsKnownName
      && !commentConfig.respondToGreetings
      && !conversationBias.mentionRelaxed;
    if (needsMention) {
      return {
        respond: false,
        score,
        mode: decisionMode,
        reason: 'mention_required',
        skipReason: 'mention_required',
        selection: 'none',
        type: 'chat',
        priority: 0,
        features,
        matchedMention: null
      };
    }

    let passed = score >= effectiveDecisionMinScore;
    if (decisionMode === 'probability') {
      const roll = Math.random();
      passed = passed && roll <= effectiveDecisionProbability;
      return {
        respond: passed,
        score,
        mode: decisionMode,
        probability: effectiveDecisionProbability,
        roll,
        reason: passed ? 'auto' : 'probability_reject',
        skipReason: passed ? null : 'probability_reject',
        threshold: effectiveDecisionMinScore,
        selection: passed ? 'chat' : 'none',
        type: 'chat',
        priority: passed ? 2 : 0,
        features,
        matchedMention: features.mentionsKnownName ? features.mentionTerm : null,
        mentionTerms: mentionTerms.slice(0, 20)
      };
    }

    if (!passed) {
      return {
        respond: false,
        score,
        mode: decisionMode,
        reason: 'score_below_threshold',
        skipReason: 'score_below_threshold',
        threshold: decisionMinScore,
        selection: 'none',
        type: 'chat',
        priority: 0,
        features
      };
    }
    
    // Additional relevance boost for explicit user mentions
    const hasMention = !!features.mentionsKnownName || !!findMention(text.toLowerCase(), mentionTerms);
    return {
      respond: true,
      type: 'relevant',
      score,
      mode: decisionMode,
      reason: hasMention ? 'mention_or_threshold' : 'relevance',
      threshold: effectiveDecisionMinScore,
      selection: 'chat',
      priority: 2,
      matchedMention: hasMention ? (features.mentionTerm || findMention(text.toLowerCase(), mentionTerms)) : null,
      mentionTerms: mentionTerms.slice(0, 20),
      response: buildSafeReason(`@${nickname}: ${text}`),
      features
    }
    
    // unreachable fallback
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

module.exports = ResponseEngine;
module.exports.ResponseEngine = ResponseEngine;
module.exports.Relevance = Relevance;
