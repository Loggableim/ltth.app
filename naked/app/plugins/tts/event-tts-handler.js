/**
 * Event TTS Handler
 * Verarbeitet TikTok Events und generiert TTS-Nachrichten
 * 
 * TODO: Future Features (Not in scope for current PR):
 * - End-of-Stream Summary TTS: Auto-summary at stream end with followers, gifts, top supporter stats
 * - Conditional Templates: Support {if coins > 100}Wow!{else}Thanks!{endif} logic in templates
 * - Random Template Pool: Multiple templates per event, randomly selected for variety
 * - Custom Variable Registry: Allow plugins to register custom variables (streamTitle, uptime, totalViewers)
 * - Variable Formatters: Support {coins|number}, {username|upper}, {giftCount|ordinal} formatting
 * - Per-Event Voice Selection: Different voice per event type (deep for gifts, cheerful for follows)
 * - Per-Tier Voice Escalation: Higher coin tiers get progressively more dramatic voices/effects
 * - Emotion Injection: Auto-inject Fish.audio emotion markers based on event type
 */
class EventTTSHandler {
  constructor(ttsPlugin) {
    this.tts = ttsPlugin;
    this.api = ttsPlugin.api;
    this.logger = ttsPlugin.logger;
    this.cooldowns = new Map(); // key: `${userId}:${eventType}` -> timestamp
    this.destroyed = false;
    this.initialized = false;
    
    // Gift combo streak tracking
    this.giftStreaks = new Map(); // key: userId -> { count, lastGiftTime, timeoutId }
    
    // Session gifter tracking for top gifter announcements + Top-N TTS access
    this.sessionGifters = new Map(); // key: userId -> { username, totalCoins }
    this.currentTopGifter = null; // { userId, username, coins }
    this.topNGifterSet = new Set(); // userId set of current top-N gifters
    
    // Periodic reminder system
    this.periodicReminderInterval = null;
  }

  init() {
    if (this.initialized && !this.destroyed) {
      this.logger.debug('Event TTS Handler already initialized');
      return;
    }

    this.destroyed = false;
    this.initialized = true;

    const config = this.tts.config.eventTTS;
    if (!config?.enabled) {
      this.logger.info('Event TTS is disabled');
      return;
    }
    this.logger.info('Initializing Event TTS Handler...');
    this._registerEventHandlers();
    this._startPeriodicReminders();
    this.logger.info('Event TTS Handler initialized');
  }

  _registerEventHandlers() {
    const events = this.tts.config.eventTTS.events;

    if (events.gift?.enabled) {
      this.api.registerTikTokEvent('gift', (data) => {
        if (!this.destroyed) this._handleGift(data);
      });
    }
    if (events.follow?.enabled) {
      this.api.registerTikTokEvent('follow', (data) => {
        if (!this.destroyed) this._handleFollow(data);
      });
    }
    if (events.share?.enabled) {
      this.api.registerTikTokEvent('share', (data) => {
        if (!this.destroyed) this._handleShare(data);
      });
    }
    if (events.subscribe?.enabled) {
      this.api.registerTikTokEvent('subscribe', (data) => {
        if (!this.destroyed) this._handleSubscribe(data);
      });
    }
    if (events.like?.enabled) {
      this.api.registerTikTokEvent('like', (data) => {
        if (!this.destroyed) this._handleLike(data);
      });
    }
    if (events.join?.enabled) {
      this.api.registerTikTokEvent('join', (data) => {
        if (!this.destroyed) this._handleJoin(data);
      });
    }
  }

  _handleGift(data) {
    const config = this.tts.config.eventTTS.events.gift;
    const advancedConfig = this.tts.config.eventTTS.advanced || {};
    const coins = data.coins || data.diamondCount || 0;
    const username = data.username || data.uniqueId || 'Someone';
    const nickname = data.nickname || data.username || 'Someone';
    const giftName = data.giftName || 'a gift';
    const giftCount = data.repeatCount || data.count || 1;
    
    // Check specific gift name triggers first (highest priority)
    if (advancedConfig.specificGiftTriggers?.enabled && advancedConfig.specificGiftTriggers.rules?.length > 0) {
      const matchingRule = advancedConfig.specificGiftTriggers.rules.find(rule => 
        rule.enabled && rule.giftName.toLowerCase() === giftName.toLowerCase()
      );
      
      if (matchingRule) {
        const text = this._fillTemplate(matchingRule.template, {
          username, nickname, giftName, giftCount, coins
        });
        this._queueEventTTS(text, data.userId, username, 'gift-specific', matchingRule.voiceId);
        this._updateSessionGifter(data.userId, username, coins);
        this._updateGiftStreak(data.userId, username);
        return;
      }
    }
    
    // Check tiered gift TTS (second priority)
    if (advancedConfig.tieredGiftTTS?.enabled) {
      const tiers = advancedConfig.tieredGiftTTS.tiers || {};
      let tier = null;
      
      if (coins >= 1000 && tiers.tier4?.enabled) {
        tier = tiers.tier4;
      } else if (coins >= 100 && tiers.tier3?.enabled) {
        tier = tiers.tier3;
      } else if (coins >= 10 && tiers.tier2?.enabled) {
        tier = tiers.tier2;
      } else if (coins >= 1 && tiers.tier1?.enabled) {
        tier = tiers.tier1;
      }
      
      if (tier) {
        const text = this._fillTemplate(tier.template, {
          username, nickname, giftName, giftCount, coins
        });
        this._queueEventTTS(text, data.userId, username, 'gift-tiered', tier.voiceId);
        this._updateSessionGifter(data.userId, username, coins);
        this._updateGiftStreak(data.userId, username);
        return;
      }
    }
    
    // Default gift handling (backwards compatibility)
    if (coins < (config.minCoins || 0)) return;
    if (!this._checkCooldown(data.userId, 'gift', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username, nickname, giftName, giftCount, coins
    });

    this._queueEventTTS(text, data.userId, username, 'gift');
    this._updateSessionGifter(data.userId, username, coins);
    this._updateGiftStreak(data.userId, username);
  }

  _handleFollow(data) {
    const config = this.tts.config.eventTTS.events.follow;
    if (!this._checkCooldown(data.userId, 'follow', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'follow');
  }

  _handleShare(data) {
    const config = this.tts.config.eventTTS.events.share;
    if (!this._checkCooldown(data.userId, 'share', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'share');
  }

  _handleSubscribe(data) {
    const config = this.tts.config.eventTTS.events.subscribe;
    if (!this._checkCooldown(data.userId, 'subscribe', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'subscribe');
  }

  _handleLike(data) {
    const config = this.tts.config.eventTTS.events.like;
    const likeCount = data.likeCount || data.totalLikeCount || 1;

    if (likeCount < (config.minLikes || 1)) return;
    if (!this._checkCooldown(data.userId, 'like', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone',
      likeCount: likeCount
    });

    this._queueEventTTS(text, data.userId, data.username, 'like');
  }

  _handleJoin(data) {
    const config = this.tts.config.eventTTS.events.join;
    if (!this._checkCooldown(data.userId, 'join', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'join');
  }

  _fillTemplate(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  _checkCooldown(userId, eventType, cooldownSeconds) {
    if (!cooldownSeconds || cooldownSeconds <= 0) return true;

    const key = `${userId}:${eventType}`;
    const now = Date.now();
    const lastTime = this.cooldowns.get(key) || 0;

    if (now - lastTime < cooldownSeconds * 1000) {
      return false;
    }

    this.cooldowns.set(key, now);
    return true;
  }

  _queueEventTTS(text, userId, username, eventType, voiceOverride = null) {
    const config = this.tts.config.eventTTS;

    if (!this._isStreamActive()) {
      this.logger.debug(`Event TTS skipped for ${eventType}: TikTok stream is inactive`);
      return false;
    }

    const ttsRequest = {
      text: text,
      userId: userId || 'event-system',
      username: username || 'Event',
      source: `event:${eventType}`,
      voiceId: voiceOverride || config.voice || undefined,
      volume: config.volume || 80,
      priority: config.priorityOverChat ? 'high' : 'normal'
    };

    this.tts.speak(ttsRequest).catch(err => {
      this.logger.error(`Event TTS failed for ${eventType}: ${err.message}`);
    });

    this.logger.debug(`Event TTS queued: ${eventType} - ${text}`);
    return true;
  }

  _isStreamActive() {
    const tiktok = this.api?.tiktok;

    if (!tiktok) {
      return true;
    }

    try {
      if (typeof tiktok.isActive === 'function') {
        return tiktok.isActive() === true;
      }

      if (typeof tiktok.isConnected === 'function') {
        return tiktok.isConnected() === true;
      }

      if (typeof tiktok.isConnected === 'boolean') {
        return tiktok.isConnected === true;
      }
    } catch (error) {
      this.logger.warn(`Event TTS stream status check failed: ${error.message}`);
      return false;
    }

    return true;
  }

  /**
   * Update session gifter tracking for top gifter announcements
   */
  _updateSessionGifter(userId, username, coins) {
    if (!userId) return;

    // Always track session gifters (needed for Top-N TTS access AND announcements)
    if (!this.sessionGifters.has(userId)) {
      this.sessionGifters.set(userId, { username, totalCoins: 0 });
    }
    const gifter = this.sessionGifters.get(userId);
    gifter.totalCoins += coins;
    gifter.username = username;

    // Always rebuild Top-N set after a coin update
    this._rebuildTopNGifterSet();

    // Top Gifter Announcement (only when enabled)
    const advancedConfig = this.tts.config.eventTTS.advanced || {};
    if (advancedConfig.topGifterAnnouncement?.enabled) {
      let newTopGifter = null;
      let maxCoins = 0;
      for (const [uid, data] of this.sessionGifters.entries()) {
        if (data.totalCoins > maxCoins) {
          maxCoins = data.totalCoins;
          newTopGifter = { userId: uid, username: data.username, coins: data.totalCoins };
        }
      }
      if (newTopGifter && (!this.currentTopGifter || newTopGifter.userId !== this.currentTopGifter.userId)) {
        const previousTopGifter = this.currentTopGifter ? this.currentTopGifter.username : 'None';
        this.currentTopGifter = newTopGifter;
        const template = advancedConfig.topGifterAnnouncement.template ||
          '🏆 {username} ist jetzt der Top Supporter mit {coins} Coins!';
        const text = this._fillTemplate(template, {
          username: newTopGifter.username,
          coins: newTopGifter.coins,
          previousTopGifter
        });
        this._queueEventTTS(text, newTopGifter.userId, newTopGifter.username, 'top-gifter', advancedConfig.topGifterAnnouncement.voiceId);
      }
    }
  }

  /**
   * Returns true if userId is in the current top-N gifter set
   * @param {string} userId
   * @returns {boolean}
   */
  isTopNGifter(userId) {
    if (!userId) return false;
    return this.topNGifterSet.has(userId);
  }

  /**
   * Returns the current top-N gifters sorted by coins descending
   * @returns {Array<{userId, username, totalCoins, rank}>}
   */
  getTopNGifters() {
    const advancedConfig = this.tts.config.eventTTS.advanced || {};
    const topN = advancedConfig.topGifterTTSAccess?.topN || 3;
    return Array.from(this.sessionGifters.entries())
      .map(([userId, data]) => ({ userId, username: data.username, totalCoins: data.totalCoins }))
      .sort((a, b) => b.totalCoins - a.totalCoins)
      .slice(0, topN)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  /**
   * Rebuilds the topNGifterSet based on current session gifters and config
   */
  _rebuildTopNGifterSet() {
    const advancedConfig = this.tts.config.eventTTS.advanced || {};
    const accessConfig = advancedConfig.topGifterTTSAccess;
    if (!accessConfig?.enabled || !accessConfig.topN || accessConfig.topN <= 0) {
      this.topNGifterSet.clear();
      return;
    }
    const topN = accessConfig.topN;
    const sorted = Array.from(this.sessionGifters.entries())
      .sort((a, b) => b[1].totalCoins - a[1].totalCoins)
      .slice(0, topN);
    this.topNGifterSet.clear();
    for (const [userId] of sorted) {
      this.topNGifterSet.add(userId);
    }
    this.logger.debug(`Top-N TTS set rebuilt: topN=${topN}, members=[${Array.from(this.topNGifterSet).join(', ')}]`);
  }

  /**
   * Update gift combo streak tracking
   */
  _updateGiftStreak(userId, username) {
    const advancedConfig = this.tts.config.eventTTS.advanced || {};
    if (!advancedConfig.giftComboStreak?.enabled) return;

    const threshold = advancedConfig.giftComboStreak.threshold || 3;
    const timeWindow = (advancedConfig.giftComboStreak.timeWindowSeconds || 10) * 1000;
    const now = Date.now();

    // Get or create streak data
    let streak = this.giftStreaks.get(userId);
    
    if (!streak || (now - streak.lastGiftTime) > timeWindow) {
      // Start new streak
      streak = { count: 1, lastGiftTime: now, timeoutId: null };
    } else {
      // Continue streak
      streak.count++;
      streak.lastGiftTime = now;
      
      // Clear existing timeout
      if (streak.timeoutId) {
        clearTimeout(streak.timeoutId);
      }
    }

    // Store updated streak
    this.giftStreaks.set(userId, streak);

    // Announce if threshold reached
    if (streak.count === threshold) {
      const template = advancedConfig.giftComboStreak.template || 
        '🔥 {username} ist auf einer {streak}-Gift Combo Streak!';
      
      const text = this._fillTemplate(template, {
        username,
        streak: streak.count
      });

      this._queueEventTTS(text, userId, username, 'gift-streak', advancedConfig.giftComboStreak.voiceId);
    }

    // Set timeout to reset streak
    streak.timeoutId = setTimeout(() => {
      this.giftStreaks.delete(userId);
    }, timeWindow);
  }

  /**
   * Start periodic reminder system
   */
  _startPeriodicReminders() {
    const advancedConfig = this.tts.config.eventTTS.advanced || {};
    const periodicConfig = advancedConfig.periodicReminder;

    // Clear existing interval
    if (this.periodicReminderInterval) {
      clearInterval(this.periodicReminderInterval);
      this.periodicReminderInterval = null;
    }

    if (!periodicConfig?.enabled) return;

    const intervalMinutes = periodicConfig.intervalMinutes || 5;
    const messages = periodicConfig.messages || [];

    if (messages.length === 0) {
      this.logger.warn('Periodic reminder enabled but no messages configured');
      return;
    }

    this.logger.info(`Starting periodic reminders: every ${intervalMinutes} minutes`);

    // Track last message to avoid consecutive repeats
    let lastMessageIndex = -1;

    this.periodicReminderInterval = setInterval(() => {
      // Select random message different from last one (if multiple messages available)
      let randomIndex;
      if (messages.length === 1) {
        randomIndex = 0;
      } else {
        do {
          randomIndex = Math.floor(Math.random() * messages.length);
        } while (randomIndex === lastMessageIndex);
        lastMessageIndex = randomIndex;
      }
      
      const randomMessage = messages[randomIndex];
      
      this._queueEventTTS(randomMessage, 'periodic-reminder', 'System', 'periodic-reminder', periodicConfig.voiceId);
      
      this.logger.debug(`Periodic reminder announced: ${randomMessage}`);
    }, intervalMinutes * 60 * 1000);
  }

  destroy() {
    this.destroyed = true;
    this.initialized = false;

    // Clear all cooldowns
    this.cooldowns.clear();
    
    // Clear gift streaks and their timeouts
    for (const streak of this.giftStreaks.values()) {
      if (streak.timeoutId) {
        clearTimeout(streak.timeoutId);
      }
    }
    this.giftStreaks.clear();
    
    // Clear session gifters
    this.sessionGifters.clear();
    this.currentTopGifter = null;
    this.topNGifterSet.clear();
    
    // Clear periodic reminder interval
    if (this.periodicReminderInterval) {
      clearInterval(this.periodicReminderInterval);
      this.periodicReminderInterval = null;
    }
    
    this.logger.info('Event TTS Handler destroyed');
  }
}

module.exports = EventTTSHandler;
