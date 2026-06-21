/**
 * Emoji Parser for ClarityHUD
 * 
 * Handles both TikTok emotes and standard Unicode emojis with CSP compliance
 */

class EmojiParser {
  constructor() {
    // Cache for TikTok emote images
    this.emoteCache = new Map();
    
    // Emoji shortcode patterns (e.g., :smile:, :heart:)
    this.shortcodePattern = /:([a-z0-9_+-]+):/gi;
    
    // Common emoji shortcode mappings
    this.shortcodeMap = {
      'heart': '❤️',
      'fire': '🔥',
      'star': '⭐',
      'smile': '😊',
      'laugh': '😂',
      'cry': '😢',
      'thinking': '🤔',
      'thumbsup': '👍',
      'thumbsdown': '👎',
      'clap': '👏',
      'rocket': '🚀',
      'gift': '🎁',
      'money': '💰',
      'diamond': '💎',
      'crown': '👑',
      'rose': '🌹',
      'cake': '🎂',
      'celebrate': '🎉'
    };
  }

  /**
   * Parse message text to extract and replace emojis
   * @param {string} text - The message text
   * @param {Array} emotes - TikTok emote objects from event.emotes or event.common.emoteList
   * @param {string} mode - Render mode: 'image' or 'unicode'
   * @returns {Array} - Array of text segments and emoji objects
   */
  parse(text, emotes = [], mode = 'image') {
    if (!text) return [];

    // Step 1: Extract TikTok emotes from event data
    const tiktokEmotes = this.extractTikTokEmotes(emotes);

    // Step 2: Parse text into segments
    let segments = [{ type: 'text', content: text }];

    // Step 3: Replace TikTok emotes
    if (tiktokEmotes.length > 0 && mode === 'image') {
      segments = this.replaceTikTokEmotes(segments, tiktokEmotes);
    }

    // Step 4: Replace emoji shortcodes
    segments = this.replaceShortcodes(segments);

    return segments;
  }

  /**
   * Extract TikTok emotes from event data
   */
  extractTikTokEmotes(emotes) {
    const extracted = [];

    if (!emotes || !Array.isArray(emotes)) {
      return extracted;
    }

    for (const emote of emotes) {
      // Handle different emote data structures
      const emoteObj = {
        id: emote.emoteId || emote.id,
        text: emote.emoteText || emote.text || emote.shortcode,
        imageUrl: this.getEmoteImageUrl(emote)
      };

      if (emoteObj.text && emoteObj.imageUrl) {
        extracted.push(emoteObj);
        // Cache for future use
        if (emoteObj.id) {
          this.emoteCache.set(emoteObj.id, emoteObj);
        }
      }
    }

    return extracted;
  }

  /**
   * Get emote image URL from various possible fields
   */
  getEmoteImageUrl(emote) {
    // Try different possible URL fields
    return emote.imageUrl ||
           emote.image?.imageUrl ||
           emote.emote?.image?.imageUrl ||
           emote.urls?.[0] ||
           emote.image?.urls?.[0] ||
           null;
  }

  /**
   * Replace TikTok emotes in text segments
   */
  replaceTikTokEmotes(segments, tiktokEmotes) {
    const result = [];

    for (const segment of segments) {
      if (segment.type !== 'text') {
        result.push(segment);
        continue;
      }

      let text = segment.content;
      let lastIndex = 0;
      let foundEmote = false;

      // Try to find each emote in the text
      for (const emote of tiktokEmotes) {
        const emoteText = emote.text;
        if (!emoteText) continue;

        let index = text.indexOf(emoteText, lastIndex);
        
        while (index !== -1) {
          foundEmote = true;

          // Add text before emote
          if (index > lastIndex) {
            result.push({
              type: 'text',
              content: text.substring(lastIndex, index)
            });
          }

          // Add emote
          result.push({
            type: 'tiktok-emote',
            id: emote.id,
            text: emoteText,
            imageUrl: emote.imageUrl
          });

          lastIndex = index + emoteText.length;
          index = text.indexOf(emoteText, lastIndex);
        }
      }

      // Add remaining text or original segment if no emotes found
      if (foundEmote) {
        if (lastIndex < text.length) {
          result.push({
            type: 'text',
            content: text.substring(lastIndex)
          });
        }
      } else {
        result.push(segment);
      }
    }

    return result;
  }

  /**
   * Replace emoji shortcodes with Unicode emojis
   */
  replaceShortcodes(segments) {
    const result = [];

    for (const segment of segments) {
      if (segment.type !== 'text') {
        result.push(segment);
        continue;
      }

      const text = segment.content;
      let lastIndex = 0;
      let match;

      this.shortcodePattern.lastIndex = 0;

      while ((match = this.shortcodePattern.exec(text)) !== null) {
        const shortcode = match[1].toLowerCase();
        const emoji = this.shortcodeMap[shortcode];

        if (emoji) {
          // Add text before shortcode
          if (match.index > lastIndex) {
            result.push({
              type: 'text',
              content: text.substring(lastIndex, match.index)
            });
          }

          // Add emoji
          result.push({
            type: 'unicode-emoji',
            emoji: emoji,
            shortcode: shortcode
          });

          lastIndex = this.shortcodePattern.lastIndex;
        }
      }

      // Add remaining text or original segment if no matches
      if (lastIndex > 0) {
        if (lastIndex < text.length) {
          result.push({
            type: 'text',
            content: text.substring(lastIndex)
          });
        }
      } else {
        result.push(segment);
      }
    }

    return result;
  }

  /**
   * Render parsed segments to HTML (CSP-compliant)
   * @param {Array} segments - Parsed message segments
   * @param {HTMLElement} container - Container element
   */
  renderToHTML(segments, container) {
    // Clear container
    container.innerHTML = '';

    for (const segment of segments) {
      switch (segment.type) {
        case 'text':
          // Create text node for safety
          const textNode = document.createTextNode(segment.content);
          container.appendChild(textNode);
          break;

        case 'tiktok-emote':
          const emoteImg = document.createElement('img');
          emoteImg.className = 'tiktok-emote';
          emoteImg.src = segment.imageUrl;
          emoteImg.alt = segment.text;
          emoteImg.title = segment.text;
          emoteImg.style.cssText = 'display: inline-block; height: 1.5em; vertical-align: middle; margin: 0 2px;';
          container.appendChild(emoteImg);
          break;

        case 'unicode-emoji':
          const emojiSpan = document.createElement('span');
          emojiSpan.className = 'unicode-emoji';
          emojiSpan.textContent = segment.emoji;
          emojiSpan.title = `:${segment.shortcode}:`;
          emojiSpan.style.cssText = 'display: inline-block; margin: 0 1px;';
          container.appendChild(emojiSpan);
          break;
      }
    }
  }

  /**
   * Clear emote cache
   */
  clearCache() {
    this.emoteCache.clear();
  }
}

// Export for browser usage
if (typeof window !== 'undefined') {
  window.EmojiParser = EmojiParser;
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmojiParser;
}
