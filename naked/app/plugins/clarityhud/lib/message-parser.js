/**
 * Message Parser for ClarityHUD
 * 
 * Robust parser for TikTok chat messages that handles:
 * - New API textArray format
 * - Legacy comment.text format
 * - Emote parsing from various sources
 * - Sanitization and safety
 */

class MessageParser {
  constructor() {
    // Cache for parsed messages
    this.messageCache = new Map();
    this.cacheSize = 100;
  }

  /**
   * Parse TikTok chat event to extract message text and emotes
   * @param {Object} eventData - TikTok chat event data
   * @returns {Object} - { text, emotes, raw }
   */
  parseMessage(eventData) {
    if (!eventData) {
      return { text: '', emotes: [], raw: eventData };
    }

    // Check cache
    const cacheKey = this.getCacheKey(eventData);
    if (this.messageCache.has(cacheKey)) {
      return this.messageCache.get(cacheKey);
    }

    const result = {
      text: '',
      emotes: [],
      raw: eventData
    };

    // Priority 1: Try textArray (new TikTok API)
    if (eventData.textArray && Array.isArray(eventData.textArray)) {
      const parsed = this.parseTextArray(eventData.textArray);
      result.text = parsed.text;
      result.emotes = parsed.emotes;
    }
    // Priority 2: Try comment.text (legacy)
    else if (eventData.comment) {
      result.text = this.sanitizeText(eventData.comment);
    }
    // Priority 3: Try message field
    else if (eventData.message) {
      result.text = this.sanitizeText(eventData.message);
    }
    // Priority 4: Try text field
    else if (eventData.text) {
      result.text = this.sanitizeText(eventData.text);
    }

    // Extract emotes from various possible locations
    if (!result.emotes.length) {
      result.emotes = this.extractEmotes(eventData);
    }

    // Cache result
    this.addToCache(cacheKey, result);

    return result;
  }

  /**
   * Parse textArray format from new TikTok API
   * Returns combined text and emote objects
   */
  parseTextArray(textArray) {
    let text = '';
    const emotes = [];

    for (const segment of textArray) {
      // Text segment
      if (segment.type === 'text' || segment.text) {
        const segmentText = segment.text || segment.content || '';
        text += this.sanitizeText(segmentText);
      }
      // Emote segment
      else if (segment.type === 'emote' || segment.emote) {
        const emote = segment.emote || segment;
        
        // Add placeholder text for emote
        const emoteText = emote.emoteText || emote.text || `[emote:${emote.emoteId || emotes.length}]`;
        text += emoteText;

        // Store emote data
        emotes.push({
          emoteId: emote.emoteId || emote.id,
          emoteText: emoteText,
          imageUrl: this.getEmoteImageUrl(emote)
        });
      }
      // Unknown segment type - try to extract text
      else if (typeof segment === 'string') {
        text += this.sanitizeText(segment);
      }
    }

    return { text, emotes };
  }

  /**
   * Extract emotes from event data
   */
  extractEmotes(eventData) {
    const emotes = [];

    // Try event.emotes
    if (eventData.emotes && Array.isArray(eventData.emotes)) {
      for (const emote of eventData.emotes) {
        emotes.push({
          emoteId: emote.emoteId || emote.id,
          emoteText: emote.emoteText || emote.text,
          imageUrl: this.getEmoteImageUrl(emote)
        });
      }
    }

    // Try event.common.emoteList
    if (eventData.common?.emoteList && Array.isArray(eventData.common.emoteList)) {
      for (const emote of eventData.common.emoteList) {
        emotes.push({
          emoteId: emote.emoteId || emote.id,
          emoteText: emote.emoteText || emote.text,
          imageUrl: this.getEmoteImageUrl(emote)
        });
      }
    }

    return emotes;
  }

  /**
   * Get emote image URL from various possible fields
   */
  getEmoteImageUrl(emote) {
    // Try various URL patterns
    return emote.imageUrl ||
           emote.image?.imageUrl ||
           emote.emote?.image?.imageUrl ||
           emote.urls?.[0] ||
           emote.image?.urls?.[0] ||
           emote.url ||
           null;
  }

  /**
   * Sanitize text to prevent XSS and fix encoding issues
   */
  sanitizeText(text) {
    if (typeof text !== 'string') {
      return '';
    }

    // Remove null bytes and control characters
    text = text.replace(/\x00/g, '');
    text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

    // Trim whitespace
    text = text.trim();

    // Prevent double escaping - decode if already encoded
    if (text.includes('&lt;') || text.includes('&gt;') || text.includes('&quot;')) {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = text;
      text = textarea.value;
    }

    return text;
  }

  /**
   * Generate cache key from event data
   */
  getCacheKey(eventData) {
    // Use combination of timestamp and user to create unique key
    const timestamp = eventData.timestamp || eventData.createTime || Date.now();
    const userId = eventData.userId || eventData.uniqueId || 'unknown';
    const comment = eventData.comment || eventData.message || '';
    return `${userId}_${timestamp}_${comment.substring(0, 20)}`;
  }

  /**
   * Add to cache with size limit
   */
  addToCache(key, value) {
    if (this.messageCache.size >= this.cacheSize) {
      // Remove oldest entry
      const firstKey = this.messageCache.keys().next().value;
      this.messageCache.delete(firstKey);
    }
    this.messageCache.set(key, value);
  }

  /**
   * Clear message cache
   */
  clearCache() {
    this.messageCache.clear();
  }

  /**
   * Parse user data from event
   * @param {Object} eventData - TikTok event data
   * @returns {Object} - User information
   */
  parseUser(eventData) {
    const user = {
      uniqueId: '',
      nickname: '',
      profilePictureUrl: null,
      teamMemberLevel: 0,
      badges: {}
    };

    // Extract user ID
    user.uniqueId = eventData.uniqueId || 
                    eventData.user?.uniqueId || 
                    eventData.userId || 
                    'unknown';

    // Extract nickname
    user.nickname = eventData.nickname || 
                    eventData.user?.nickname || 
                    eventData.displayName ||
                    eventData.user?.displayName ||
                    user.uniqueId;

    // Extract profile picture
    user.profilePictureUrl = eventData.profilePictureUrl ||
                             eventData.user?.profilePictureUrl ||
                             eventData.user?.avatarUrl ||
                             null;

    // Extract team member level
    user.teamMemberLevel = eventData.teamMemberLevel ||
                           eventData.user?.teamMemberLevel ||
                           0;

    // Set moderator team level to max
    if (eventData.userIdentity?.isModeratorOfAnchor) {
      user.teamMemberLevel = Math.max(user.teamMemberLevel, 10);
    }

    return user;
  }

  /**
   * Create formatted message object ready for rendering
   * @param {Object} eventData - TikTok chat event
   * @returns {Object} - Formatted message
   */
  createFormattedMessage(eventData) {
    const parsed = this.parseMessage(eventData);
    const user = this.parseUser(eventData);

    return {
      id: this.generateMessageId(eventData),
      user: user,
      text: parsed.text,
      emotes: parsed.emotes,
      timestamp: eventData.timestamp || eventData.createTime || Date.now(),
      raw: eventData
    };
  }

  /**
   * Generate unique message ID
   */
  generateMessageId(eventData) {
    const timestamp = eventData.timestamp || eventData.createTime || Date.now();
    const userId = eventData.userId || eventData.uniqueId || 'unknown';
    const random = Math.random().toString(36).substring(2, 9);
    return `msg_${timestamp}_${userId}_${random}`;
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.MessageParser = MessageParser;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageParser;
}
