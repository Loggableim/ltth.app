/**
 * ClarityHUD Backend API
 *
 * Handles settings management, event processing, and WebSocket broadcasting
 * for both Chat HUD and Full HUD overlays
 */

class ClarityHUDBackend {
  constructor(api) {
    this.api = api;

    // Event queues for each event type
    this.eventQueues = {
      chat: [],
      follow: [],
      share: [],
      like: [],
      gift: [],
      subscribe: [],
      treasure: [],
      join: []
    };

    // Default settings for Chat HUD
    this.defaultChatSettings = {
      fontSize: '48px',
      fontFamily: 'Exo 2',
      fontColor: '#FFFFFF',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      lineHeight: '1.6',
      letterSpacing: '0.5px',
      align: 'left',
      showTimestamps: false,
      maxLines: 10,
      outlineThickness: '2px',
      outlineColor: '#000000',
      wrapLongWords: true,
      mode: 'day',
      highContrastMode: false,
      colorblindSafeMode: false,
      reduceMotion: false,
      dyslexiaFont: false,
      accessibilityPreset: 'default',
      opacity: 1,
      keepOnTop: false,
      // New settings for enhanced features
      transparency: 100, // 0-100%
      emojiRenderMode: 'image', // 'image' or 'unicode'
      badgeSize: 'medium', // 'small', 'medium', 'large'
      teamLevelStyle: 'icon-glow', // 'icon-color', 'icon-glow', 'number-only'
      showTeamLevel: true,
      showModerator: true,
      showSubscriber: true,
      showGifter: true,
      showFanClub: true,
      useVirtualScrolling: false,
      usernameColorByTeamLevel: true
    };

    // Default settings for Full HUD (includes all chat settings plus activity settings)
    this.defaultFullSettings = {
      ...this.defaultChatSettings,
      showChat: true,
      showFollows: true,
      showShares: true,
      showLikes: true,
      showGifts: true,
      showSubs: true,
      showTreasureChests: true,
      showJoins: true,
      layoutMode: 'singleStream',
      feedDirection: 'newestTop',
      animationIn: 'fadeSlideIn',
      animationOut: 'fadeSlideOut',
      animationSpeed: 'medium',
      lineHeight: 1.2,
      opacity: 1,
      keepOnTop: false,
      // Gift display settings
      showGiftImages: false, // Show gift catalogue images instead of emoji
      giftImageSize: 'medium' // 'small', 'medium', 'large'
    };

    // Current settings
    this.settings = {
      chat: { ...this.defaultChatSettings },
      full: { ...this.defaultFullSettings }
    };
  }

  /**
   * Initialize backend - load settings from database
   */
  async initialize() {
    try {
      // Load chat settings
      const chatSettings = await this.api.getConfig('clarityhud.settings.chat');
      if (chatSettings) {
        this.settings.chat = { ...this.defaultChatSettings, ...chatSettings };
      }

      // Load full settings
      const fullSettings = await this.api.getConfig('clarityhud.settings.full');
      if (fullSettings) {
        this.settings.full = { ...this.defaultFullSettings, ...fullSettings };
      }

      this.api.log('ClarityHUD backend initialized with settings loaded', 'info');
    } catch (error) {
      this.api.log(`Error initializing ClarityHUD backend: ${error.message}`, 'error');
      // Use defaults if loading fails
      this.settings.chat = { ...this.defaultChatSettings };
      this.settings.full = { ...this.defaultFullSettings };
    }
  }

  /**
   * Register HTTP API routes
   */
  registerRoutes() {
    // Get all settings (both chat and full)
    this.api.registerRoute('get', '/api/clarityhud/settings', (req, res) => {
      try {
        res.json({
          success: true,
          settings: this.settings
        });
      } catch (error) {
        this.api.log(`Error getting all settings: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get settings for specific dock (chat or full)
    this.api.registerRoute('get', '/api/clarityhud/settings/:dock', (req, res) => {
      try {
        const { dock } = req.params;

        if (dock !== 'chat' && dock !== 'full') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat" or "full"'
          });
        }

        res.json({
          success: true,
          dock: dock,
          settings: this.settings[dock]
        });
      } catch (error) {
        this.api.log(`Error getting ${req.params.dock} settings: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Update settings for specific dock
    this.api.registerRoute('post', '/api/clarityhud/settings/:dock', async (req, res) => {
      try {
        const { dock } = req.params;
        const newSettings = req.body;

        if (dock !== 'chat' && dock !== 'full') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat" or "full"'
          });
        }

        // Merge with existing settings
        const defaults = dock === 'chat' ? this.defaultChatSettings : this.defaultFullSettings;
        this.settings[dock] = { ...defaults, ...this.settings[dock], ...newSettings };

        // Persist to database
        await this.api.setConfig(`clarityhud.settings.${dock}`, this.settings[dock]);

        // Broadcast settings update to overlays
        this.api.emit(`clarityhud.settings.${dock}`, this.settings[dock]);

        this.api.log(`Settings updated for ${dock} HUD`, 'info');

        res.json({
          success: true,
          dock: dock,
          settings: this.settings[dock]
        });
      } catch (error) {
        this.api.log(`Error updating ${req.params.dock} settings: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get current event state for specific dock
    this.api.registerRoute('get', '/api/clarityhud/state/:dock', (req, res) => {
      try {
        const { dock } = req.params;

        if (dock !== 'chat' && dock !== 'full') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat" or "full"'
          });
        }

        // For chat dock, return only chat events
        if (dock === 'chat') {
          res.json({
            success: true,
            dock: dock,
            events: {
              chat: this.eventQueues.chat
            },
            settings: this.settings.chat
          });
        } else {
          // For full dock, return all event queues
          res.json({
            success: true,
            dock: dock,
            events: this.eventQueues,
            settings: this.settings.full
          });
        }
      } catch (error) {
        this.api.log(`Error getting ${req.params.dock} state: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Reset settings to defaults for specific dock
    this.api.registerRoute('post', '/api/clarityhud/settings/:dock/reset', async (req, res) => {
      try {
        const { dock } = req.params;

        if (dock !== 'chat' && dock !== 'full') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat" or "full"'
          });
        }

        // Reset to defaults
        const defaults = dock === 'chat' ? this.defaultChatSettings : this.defaultFullSettings;
        this.settings[dock] = { ...defaults };

        // Persist to database
        await this.api.setConfig(`clarityhud.settings.${dock}`, this.settings[dock]);

        // Broadcast settings update to overlays
        this.api.emit(`clarityhud.settings.${dock}`, this.settings[dock]);

        this.api.log(`Settings reset to defaults for ${dock} HUD`, 'info');

        res.json({
          success: true,
          dock: dock,
          settings: this.settings[dock]
        });
      } catch (error) {
        this.api.log(`Error resetting ${req.params.dock} settings: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Test event endpoint for chat HUD
    this.api.registerRoute('post', '/api/clarityhud/test/chat', async (req, res) => {
      try {
        // Create a test chat event
        const testEvent = {
          uniqueId: 'testuser123',
          nickname: 'TestUser',
          comment: 'This is a test message for the Chat HUD! 🎉',
          profilePictureUrl: null,
          badge: null
        };

        // Handle the event (broadcasts to overlays)
        await this.handleChatEvent(testEvent);

        this.api.log('Test chat event sent', 'info');

        res.json({
          success: true,
          message: 'Test chat event sent successfully'
        });
      } catch (error) {
        this.api.log(`Error sending test chat event: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Test event endpoint for full HUD
    this.api.registerRoute('post', '/api/clarityhud/test/full', async (req, res) => {
      try {
        // Create test events for all event types
        const testChatEvent = {
          uniqueId: 'testuser123',
          nickname: 'TestUser',
          comment: 'Test chat message for Full HUD! 💬',
          profilePictureUrl: null,
          badge: null
        };

        const testFollowEvent = {
          uniqueId: 'follower456',
          nickname: 'NewFollower',
          profilePictureUrl: null,
          badge: null
        };

        const testGiftEvent = {
          uniqueId: 'gifter789',
          nickname: 'GenerousGifter',
          giftName: 'Rose',
          repeatCount: 5,
          diamondCount: 50,
          coins: 250, // 50 diamonds * 5 repeatCount = 250 coins
          giftPictureUrl: null,
          giftType: 0,
          profilePictureUrl: null,
          badge: null
        };

        const testTreasureEvent = {
          uniqueId: 'treasurehunter999',
          nickname: 'TreasureHunter',
          giftName: 'Treasure Chest',
          repeatCount: 1,
          diamondCount: 1000,
          coins: 1000,
          giftPictureUrl: null,
          giftType: 1, // Treasure chest type
          profilePictureUrl: null,
          badge: null
        };

        // Send all test events
        await this.handleChatEvent(testChatEvent);
        await this.handleFollowEvent(testFollowEvent);
        await this.handleGiftEvent(testGiftEvent);
        await this.handleGiftEvent(testTreasureEvent);

        this.api.log('Test full HUD events sent', 'info');

        res.json({
          success: true,
          message: 'Test events sent successfully to Full HUD'
        });
      } catch (error) {
        this.api.log(`Error sending test full HUD events: ${error.message}`, 'error');
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    this.api.log('ClarityHUD API routes registered', 'info');
  }

  /**
   * Handle chat message event
   * Broadcasts to both chat and full HUDs
   */
  async handleChatEvent(data) {
    try {
      // Extract message with fallback (data.message is the standard field from TikTok module)
      const messageText = data.message || data.comment || '';
      
      const chatEvent = {
        user: {
          uniqueId: data.uniqueId || data.username || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        message: messageText,
        // Also include old format fields for backward compatibility with chat overlay
        uniqueId: data.uniqueId || data.username || 'unknown',
        comment: messageText,
        raw: data
      };

      // Add to chat queue (with type and timestamp for internal storage)
      this.addToQueue('chat', {
        type: 'chat',
        timestamp: Date.now(),
        ...chatEvent
      });

      // Broadcast to both HUDs (without type/timestamp - overlays will add them)
      this.api.emit('clarityhud.update.chat', chatEvent);

      this.api.log(`Chat event from ${chatEvent.user.nickname}: ${chatEvent.message}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling chat event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle follow event
   * Broadcasts to full HUD only
   */
  async handleFollowEvent(data) {
    try {
      // Check if full HUD has follows enabled
      if (this.settings.full.showFollows === false) {
        return;
      }

      const followEvent = {
        user: {
          uniqueId: data.username || data.uniqueId || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        // Include old format fields for backward compatibility
        uniqueId: data.username || data.uniqueId || 'unknown',
        username: data.nickname || data.username || 'Anonymous',
        raw: data
      };

      // Add to follow queue (with type and timestamp for internal storage)
      this.addToQueue('follow', {
        type: 'follow',
        timestamp: Date.now(),
        ...followEvent
      });

      // Broadcast to full HUD (without type/timestamp - overlay will add them)
      this.api.emit('clarityhud.update.follow', followEvent);

      this.api.log(`Follow event from ${followEvent.user.nickname}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling follow event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle share event
   * Broadcasts to full HUD only
   */
  async handleShareEvent(data) {
    try {
      // Check if full HUD has shares enabled
      if (this.settings.full.showShares === false) {
        return;
      }

      const shareEvent = {
        user: {
          uniqueId: data.username || data.uniqueId || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        // Include old format fields for backward compatibility
        uniqueId: data.username || data.uniqueId || 'unknown',
        username: data.nickname || data.username || 'Anonymous',
        raw: data
      };

      // Add to share queue (with type and timestamp for internal storage)
      this.addToQueue('share', {
        type: 'share',
        timestamp: Date.now(),
        ...shareEvent
      });

      // Broadcast to full HUD (without type/timestamp - overlay will add them)
      this.api.emit('clarityhud.update.share', shareEvent);

      this.api.log(`Share event from ${shareEvent.user.nickname}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling share event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle like event
   * Broadcasts to full HUD only
   */
  async handleLikeEvent(data) {
    try {
      // Check if full HUD has likes enabled
      if (this.settings.full.showLikes === false) {
        return;
      }

      const likeEvent = {
        user: {
          uniqueId: data.username || data.uniqueId || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        likeCount: data.likeCount || data.count || 1,
        totalLikeCount: data.totalLikeCount || 0,
        // Include old format fields for backward compatibility
        uniqueId: data.username || data.uniqueId || 'unknown',
        username: data.nickname || data.username || 'Anonymous',
        raw: data
      };

      // Add to like queue (with type and timestamp for internal storage)
      this.addToQueue('like', {
        type: 'like',
        timestamp: Date.now(),
        ...likeEvent
      });

      // Broadcast to full HUD (without type/timestamp - overlay will add them)
      this.api.emit('clarityhud.update.like', likeEvent);

      this.api.log(`Like event from ${likeEvent.user.nickname} (count: ${likeEvent.likeCount})`, 'debug');
    } catch (error) {
      this.api.log(`Error handling like event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle gift event
   * Broadcasts to full HUD only
   */
  async handleGiftEvent(data) {
    try {
      // Check if full HUD has gifts enabled
      if (this.settings.full.showGifts === false) {
        return;
      }

      // Resolve gift name with fallback chain: data.giftName → database catalog → 'Gift'
      let giftName = data.giftName || null;
      
      // If no gift name but we have a giftId, try to get it from the database catalog
      if (!giftName && data.giftId) {
        try {
          const db = this.api.getDatabase();
          const catalogGift = db.getGift(data.giftId);
          if (catalogGift && catalogGift.name) {
            giftName = catalogGift.name;
            this.api.log(`Gift name resolved from catalog: ${giftName} (ID: ${data.giftId})`, 'debug');
          }
        } catch (error) {
          this.api.log(`Error looking up gift in catalog: ${error.message}`, 'warn');
        }
      }
      
      // Final fallback to just 'Gift' (not 'Unknown Gift' which sounds like an error)
      giftName = giftName || 'Gift';

      // Check if this is a treasure chest (special case)
      const isTreasureChest = data.giftType === 1 || giftName.toLowerCase().includes('treasure');

      // Skip treasure chests if disabled
      if (isTreasureChest && this.settings.full.showTreasureChests === false) {
        return;
      }

      // FIX: Use data.coins (already calculated as diamondCount * repeatCount)
      // instead of data.diamondCount (which is just the raw diamond value per gift)
      const giftEvent = {
        user: {
          uniqueId: data.username || data.uniqueId || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        gift: {
          name: giftName,
          count: data.repeatCount || 1,
          coins: data.coins || 0,
          image: data.giftPictureUrl || null,
          isTreasureChest: isTreasureChest
        },
        // Include old format fields for backward compatibility
        uniqueId: data.username || data.uniqueId || 'unknown',
        username: data.nickname || data.username || 'Anonymous',
        giftName: giftName,
        coins: data.coins || 0,
        raw: data
      };

      // Determine event type based on whether it's a treasure chest
      const eventType = isTreasureChest ? 'treasure' : 'gift';
      const eventName = isTreasureChest ? 'clarityhud.update.treasure' : 'clarityhud.update.gift';

      // Add to appropriate queue (with type and timestamp for internal storage)
      this.addToQueue(eventType, {
        type: eventType,
        timestamp: Date.now(),
        ...giftEvent
      });

      // Broadcast to full HUD (without type/timestamp - overlay will add them)
      this.api.emit(eventName, giftEvent);

      this.api.log(`${isTreasureChest ? 'Treasure' : 'Gift'} event from ${giftEvent.user.nickname}: ${giftEvent.gift.name} x${giftEvent.gift.count}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling gift event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle subscribe/superfan event
   * Broadcasts to full HUD only
   */
  async handleSubscribeEvent(data) {
    try {
      // Check if full HUD has subs enabled
      if (this.settings.full.showSubs === false) {
        return;
      }

      const subscribeEvent = {
        user: {
          uniqueId: data.username || data.uniqueId || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        subscribeType: data.subscribeType || 'subscribe',
        // Include old format fields for backward compatibility
        uniqueId: data.username || data.uniqueId || 'unknown',
        username: data.nickname || data.username || 'Anonymous',
        raw: data
      };

      // Add to subscribe queue (with type and timestamp for internal storage)
      this.addToQueue('subscribe', {
        type: 'subscribe',
        timestamp: Date.now(),
        ...subscribeEvent
      });

      // Broadcast to full HUD (without type/timestamp - overlay will add them)
      this.api.emit('clarityhud.update.subscribe', subscribeEvent);

      this.api.log(`Subscribe event from ${subscribeEvent.user.nickname}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling subscribe event: ${error.message}`, 'error');
    }
  }

  /**
   * Handle join event (user joined stream)
   * Broadcasts to full HUD only
   */
  async handleJoinEvent(data) {
    try {
      // Check if full HUD has joins enabled
      if (this.settings.full.showJoins === false) {
        return;
      }

      const joinEvent = {
        user: {
          uniqueId: data.username || data.uniqueId || 'unknown',
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        // Include old format fields for backward compatibility
        uniqueId: data.username || data.uniqueId || 'unknown',
        username: data.nickname || data.username || 'Anonymous',
        raw: data
      };

      // Add to join queue (with type and timestamp for internal storage)
      this.addToQueue('join', {
        type: 'join',
        timestamp: Date.now(),
        ...joinEvent
      });

      // Broadcast to full HUD (without type/timestamp - overlay will add them)
      this.api.emit('clarityhud.update.join', joinEvent);

      this.api.log(`Join event from ${joinEvent.user.nickname}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling join event: ${error.message}`, 'error');
    }
  }

  /**
   * Add event to queue with max length management
   */
  addToQueue(queueName, event) {
    if (!this.eventQueues[queueName]) {
      this.eventQueues[queueName] = [];
    }

    // Add event to beginning of queue (newest first)
    this.eventQueues[queueName].unshift(event);

    // Determine max length based on settings
    const maxLines = queueName === 'chat'
      ? this.settings.chat.maxLines
      : this.settings.full.maxLines;

    // Trim queue to max length
    if (this.eventQueues[queueName].length > maxLines) {
      this.eventQueues[queueName] = this.eventQueues[queueName].slice(0, maxLines);
    }
  }

  /**
   * Clear event queue for specific type
   */
  clearQueue(queueName) {
    if (this.eventQueues[queueName]) {
      this.eventQueues[queueName] = [];
      this.api.log(`Cleared ${queueName} queue`, 'debug');
    }
  }

  /**
   * Clear all event queues
   */
  clearAllQueues() {
    Object.keys(this.eventQueues).forEach(queueName => {
      this.eventQueues[queueName] = [];
    });
    this.api.log('Cleared all event queues', 'info');
  }

  /**
   * Cleanup on plugin unload
   */
  async cleanup() {
    try {
      // Clear all queues
      this.clearAllQueues();

      // Save current settings
      await this.api.setConfig('clarityhud.settings.chat', this.settings.chat);
      await this.api.setConfig('clarityhud.settings.full', this.settings.full);

      this.api.log('ClarityHUD backend cleaned up', 'info');
    } catch (error) {
      this.api.log(`Error during cleanup: ${error.message}`, 'error');
    }
  }
}

module.exports = ClarityHUDBackend;
