/**
 * ClarityHUD Backend API
 *
 * Handles settings management, event processing, and WebSocket broadcasting
 * for both Chat HUD and Full HUD overlays
 */

const TikTokConnector = require('../../../modules/tiktok');

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

    // Multi-stream specific: event queue and connectors
    this.multiStreamQueue = [];
    this.multiStreamConnectors = [];
    this.multiStreamMaxMessages = 300;

    // P7: Like aggregation buffer (5-second window)
    // Accumulates individual like events and emits a single batched event per window.
    this._likeBuffer = {
      count: 0,
      userCount: 0,
      users: new Set(),
      flushTimer: null
    };
    this._likeFlushInterval = 5000; // ms

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

    // Default settings for Stream Overlay (viewer-facing broadcast overlay)
    this.defaultStreamSettings = {
      orientation: 'landscape',
      showChat: false,
      showFollows: true,
      showShares: true,
      showLikes: false,
      showGifts: true,
      showSubs: true,
      showTreasureChests: true,
      showJoins: false,
      slotChat: 'slot-right-rail',
      slotFollow: 'slot-bottom-right',
      slotShare: 'slot-bottom-right',
      slotLike: 'slot-bottom-right',
      slotGift: 'slot-top-center',
      slotSub: 'slot-top-center',
      slotTreasure: 'slot-top-center',
      slotJoin: 'slot-bottom-right',
      highlightGiftThreshold: 100,
      highlightAlwaysSub: true,
      highlightAlwaysTreasure: true,
      ttlChat: 8000,
      ttlFollow: 7000,
      ttlShare: 7000,
      ttlLike: 5000,
      ttlGift: 9000,
      ttlSub: 10000,
      ttlTreasure: 10000,
      ttlJoin: 4000,
      animIn: 'auto',
      animOut: 'auto',
      reduceMotion: false,
      opacity: 1,
      dyslexiaFont: false,
      tickerEnabled: false,
      tickerSpeed: 60,
      tickerLabel: '🔴 LIVE',
    };

    // Default settings for Multi-Stream HUD
    this.defaultMultiSettings = {
      enabled: false,
      streams: [
        {
          enabled: false,
          username: '',
          displayName: '',
          textColor: '#00D4FF',
          bgColor: '#1E3A8A',
          accentColor: '#60A5FA'
        },
        {
          enabled: false,
          username: '',
          displayName: '',
          textColor: '#A78BFA',
          bgColor: '#581C87',
          accentColor: '#C084FC'
        },
        {
          enabled: false,
          username: '',
          displayName: '',
          textColor: '#FBBF24',
          bgColor: '#78350F',
          accentColor: '#FCD34D'
        }
      ],
      layout: 'mixed',
      columns: 'auto',
      primarySpan2: false,
      messageStyle: 'stripe',
      density: 'compact',
      showAvatars: false,
      showTimestamps: false,
      highlightPrimary: true,
      primaryOpacity: 1.2,
      maxMessages: 300,
      autoContrast: true,
      pulseOnNew: false
    };

    // Current settings
    this.settings = {
      chat: { ...this.defaultChatSettings },
      full: { ...this.defaultFullSettings },
      multi: { ...this.defaultMultiSettings },
      stream: { ...this.defaultStreamSettings }
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

      // Load multi-stream settings
      const multiSettings = await this.api.getConfig('clarityhud.settings.multi');
      if (multiSettings) {
        this.settings.multi = { ...this.defaultMultiSettings, ...multiSettings };
      }

      // Load stream overlay settings
      const streamSettings = await this.api.getConfig('clarityhud.settings.stream');
      if (streamSettings) {
        this.settings.stream = { ...this.defaultStreamSettings, ...streamSettings };
      }

      this.api.log('ClarityHUD backend initialized with settings loaded', 'info');
    } catch (error) {
      this.api.log(`Error initializing ClarityHUD backend: ${error.message}`, 'error');
      // Use defaults if loading fails
      this.settings.chat = { ...this.defaultChatSettings };
      this.settings.full = { ...this.defaultFullSettings };
      this.settings.multi = { ...this.defaultMultiSettings };
      this.settings.stream = { ...this.defaultStreamSettings };
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

        if (dock !== 'chat' && dock !== 'full' && dock !== 'multi' && dock !== 'stream') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat", "full", "multi", or "stream"'
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

        if (dock !== 'chat' && dock !== 'full' && dock !== 'multi' && dock !== 'stream') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat", "full", "multi", or "stream"'
          });
        }

        // Merge with existing settings
        const defaults = dock === 'chat' ? this.defaultChatSettings :
                        dock === 'full' ? this.defaultFullSettings :
                        dock === 'stream' ? this.defaultStreamSettings :
                        this.defaultMultiSettings;
        this.settings[dock] = { ...defaults, ...this.settings[dock], ...newSettings };

        // Persist to database
        await this.api.setConfig(`clarityhud.settings.${dock}`, this.settings[dock]);

        // Broadcast settings update to overlays
        this.api.emit(`clarityhud.settings.${dock}`, this.settings[dock]);

        // If multi-stream settings changed, reconnect streams
        if (dock === 'multi') {
          await this.reconnectMultiStreams();
        }

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

        if (dock !== 'chat' && dock !== 'full' && dock !== 'multi' && dock !== 'stream') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat", "full", "multi", or "stream"'
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
        } else if (dock === 'multi') {
          // For multi dock, return multi-stream events
          res.json({
            success: true,
            dock: dock,
            events: {
              multi: this.multiStreamQueue
            },
            settings: this.settings.multi
          });
        } else if (dock === 'stream') {
          res.json({
            success: true,
            dock: 'stream',
            events: {},
            settings: this.settings.stream
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

        if (dock !== 'chat' && dock !== 'full' && dock !== 'multi' && dock !== 'stream') {
          return res.status(400).json({
            success: false,
            error: 'Invalid dock. Must be "chat", "full", "multi", or "stream"'
          });
        }

        // Reset to defaults
        const defaults = dock === 'chat' ? this.defaultChatSettings :
                        dock === 'full' ? this.defaultFullSettings :
                        dock === 'stream' ? this.defaultStreamSettings :
                        this.defaultMultiSettings;
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

    // Test event endpoint for stream overlay
    this.api.registerRoute('post', '/api/clarityhud/test/stream', async (req, res) => {
      try {
        const { type } = req.body || {};

        const testEvents = {
          follow:   async () => this.handleFollowEvent({ uniqueId: 'TestViewer', nickname: 'TestViewer', profilePictureUrl: null }),
          share:    async () => this.handleShareEvent({ uniqueId: 'TestSharer', nickname: 'TestSharer', profilePictureUrl: null }),
          like:     async () => this.handleLikeEvent({ uniqueId: 'TestLiker', nickname: 'TestLiker', likeCount: 5 }),
          join:     async () => this.handleJoinEvent({ uniqueId: 'NewViewer', nickname: 'NewViewer', profilePictureUrl: null }),
          chat:     async () => this.handleChatEvent({ uniqueId: 'ChatUser', nickname: 'ChatUser', message: 'Hello stream! 🎉' }),
          gift:     async () => this.handleGiftEvent({
            uniqueId: 'GenerousGifter', nickname: 'GenerousGifter',
            giftName: 'Rose', repeatCount: 5, coins: 250, diamondCount: 50, giftPictureUrl: null, giftType: 0
          }),
          sub:      async () => this.handleSubscribeEvent({ uniqueId: 'NewSub', nickname: 'NewSub', subscribeType: 'subscribe' }),
          treasure: async () => this.handleGiftEvent({
            uniqueId: 'TreasureHunter', nickname: 'TreasureHunter',
            giftName: 'Treasure Chest', repeatCount: 1, coins: 1000, diamondCount: 1000, giftPictureUrl: null, giftType: 1
          }),
        };

        if (type && testEvents[type]) {
          await testEvents[type]();
        } else {
          // Send all if no type specified
          for (const fn of Object.values(testEvents)) {
            await fn();
            await new Promise(r => setTimeout(r, 300));
          }
        }

        res.json({ success: true, message: `Test stream event${type ? ` (${type})` : 's'} sent` });
      } catch (error) {
        this.api.log(`Error sending test stream event: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
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
   * P7: Aggregates individual likes over a 5-second window and emits a single
   * batched event so the Full HUD feed stays readable during like floods.
   * The internal queue and all other consumers are not affected.
   */
  async handleLikeEvent(data) {
    try {
      // Check if full HUD has likes enabled
      if (this.settings.full.showLikes === false) {
        return;
      }

      const likeCount = data.likeCount || data.count || 1;
      const userId = data.username || data.uniqueId || 'unknown';

      const likeEvent = {
        user: {
          uniqueId: userId,
          nickname: data.nickname || data.username || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        likeCount,
        totalLikeCount: data.totalLikeCount || 0,
        // Include old format fields for backward compatibility
        uniqueId: userId,
        username: data.nickname || data.username || 'Anonymous',
        raw: data
      };

      // Add to like queue (with type and timestamp for internal storage)
      this.addToQueue('like', {
        type: 'like',
        timestamp: Date.now(),
        ...likeEvent
      });

      // P7: Accumulate into the aggregation buffer instead of emitting immediately.
      this._likeBuffer.count += likeCount;
      if (!this._likeBuffer.users.has(userId)) {
        this._likeBuffer.users.add(userId);
        this._likeBuffer.userCount++;
      }

      // Schedule flush if not already pending
      if (!this._likeBuffer.flushTimer) {
        this._likeBuffer.flushTimer = setTimeout(() => {
          this._flushLikeBuffer();
        }, this._likeFlushInterval);
      }

      this.api.log(`Like event buffered from ${likeEvent.user.nickname} (count: ${likeCount}, buffer total: ${this._likeBuffer.count})`, 'debug');
    } catch (error) {
      this.api.log(`Error handling like event: ${error.message}`, 'error');
    }
  }

  /**
   * Flush the like aggregation buffer and emit a single aggregated like event
   * to the clarityhud.update.like channel.
   */
  _flushLikeBuffer() {
    const { count, userCount } = this._likeBuffer;

    if (count > 0) {
      // Resolve the single-user display name once to avoid calling the iterator twice
      const singleUser = userCount === 1
        ? `${this._likeBuffer.users.values().next().value}`
        : `${userCount} viewers`;

      const aggregatedEvent = {
        // Use a synthetic aggregate user so the overlay renders correctly
        user: {
          uniqueId: 'aggregate',
          nickname: singleUser,
          profilePictureUrl: null,
          badge: null
        },
        likeCount: count,
        userCount,
        totalLikeCount: 0,
        uniqueId: 'aggregate',
        username: singleUser,
        isAggregated: true
      };

      this.api.emit('clarityhud.update.like', aggregatedEvent);
      this.api.log(`Flushed like buffer: ${count} likes from ${userCount} user(s)`, 'debug');
    }

    // Reset buffer
    this._likeBuffer.count = 0;
    this._likeBuffer.userCount = 0;
    this._likeBuffer.users.clear();
    this._likeBuffer.flushTimer = null;
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
    this.multiStreamQueue = [];
    this.api.log('Cleared all event queues', 'info');
  }

  /**
   * Initialize multi-stream connectors
   */
  async reconnectMultiStreams() {
    try {
      // Disconnect existing connectors
      await this.disconnectMultiStreams();

      // Check if multi-stream is enabled
      if (!this.settings.multi.enabled) {
        this.api.log('Multi-stream HUD is disabled, skipping connector initialization', 'debug');
        return;
      }

      // Create new connectors for enabled streams
      const io = this.api.getSocketIO();
      const db = this.api.getDatabase();
      const logger = {
        info: (msg) => this.api.log(msg, 'info'),
        warn: (msg) => this.api.log(msg, 'warn'),
        error: (msg) => this.api.log(msg, 'error'),
        debug: (msg) => this.api.log(msg, 'debug')
      };

      for (let i = 0; i < this.settings.multi.streams.length; i++) {
        const streamConfig = this.settings.multi.streams[i];
        
        if (!streamConfig.enabled || !streamConfig.username) {
          continue;
        }

        try {
          const connector = new TikTokConnector(io, db, logger);
          const sourceId = `stream${i + 1}`;
          const sourceLabel = streamConfig.displayName || streamConfig.username;

          // Listen to chat events from this connector
          connector.on('chat', (data) => {
            this.handleMultiStreamChat(data, i, sourceId, sourceLabel, streamConfig);
          });

          // Listen to gift events from this connector
          connector.on('gift', (data) => {
            this.handleMultiStreamGift(data, i, sourceId, sourceLabel, streamConfig);
          });

          // Connect to the stream
          await connector.connect(streamConfig.username);
          this.multiStreamConnectors.push(connector);
          
          this.api.log(`Connected multi-stream connector ${i + 1} to @${streamConfig.username}`, 'info');
        } catch (error) {
          this.api.log(`Failed to connect multi-stream ${i + 1} (@${streamConfig.username}): ${error.message}`, 'error');
        }
      }
    } catch (error) {
      this.api.log(`Error reconnecting multi-streams: ${error.message}`, 'error');
    }
  }

  /**
   * Disconnect all multi-stream connectors
   */
  async disconnectMultiStreams() {
    for (const connector of this.multiStreamConnectors) {
      try {
        await connector.disconnect();
      } catch (error) {
        this.api.log(`Error disconnecting multi-stream connector: ${error.message}`, 'error');
      }
    }
    this.multiStreamConnectors = [];
    this.api.log('Disconnected all multi-stream connectors', 'debug');
  }

  /**
   * Handle chat event from multi-stream connector
   */
  handleMultiStreamChat(data, streamIndex, sourceId, sourceLabel, streamConfig) {
    try {
      // Normalize the event
      const normalizedEvent = {
        sourceId: sourceId,
        sourceLabel: sourceLabel,
        streamIndex: streamIndex,
        colors: {
          text: streamConfig.textColor,
          bg: streamConfig.bgColor,
          accent: streamConfig.accentColor
        },
        user: {
          uniqueId: data.uniqueId || 'unknown',
          nickname: data.nickname || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        message: data.comment || data.message || '',
        timestamp: Date.now(),
        raw: data
      };

      // Add to queue with max length management
      this.multiStreamQueue.unshift(normalizedEvent);
      if (this.multiStreamQueue.length > this.settings.multi.maxMessages) {
        this.multiStreamQueue = this.multiStreamQueue.slice(0, this.settings.multi.maxMessages);
      }

      // Broadcast to multi-stream overlay
      this.api.emit('clarityhud:multi:chat', normalizedEvent);

      this.api.log(`Multi-stream chat from ${sourceLabel}: ${normalizedEvent.user.nickname}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling multi-stream chat: ${error.message}`, 'error');
    }
  }

  /**
   * Handle gift event from multi-stream connector
   */
  handleMultiStreamGift(data, streamIndex, sourceId, sourceLabel, streamConfig) {
    try {
      // Normalize the gift event
      const normalizedEvent = {
        sourceId: sourceId,
        sourceLabel: sourceLabel,
        streamIndex: streamIndex,
        colors: {
          text: streamConfig.textColor,
          bg: streamConfig.bgColor,
          accent: streamConfig.accentColor
        },
        user: {
          uniqueId: data.uniqueId || 'unknown',
          nickname: data.nickname || 'Anonymous',
          profilePictureUrl: data.profilePictureUrl || null,
          badge: data.badge || null
        },
        gift: {
          name: data.giftName || data.name || 'Gift',
          count: data.repeatCount || data.count || 1,
          diamondCount: data.diamondCount || 0,
          coins: data.coins || 0,
          pictureUrl: data.giftPictureUrl || null
        },
        timestamp: Date.now(),
        raw: data
      };

      // Add to queue with max length management
      this.multiStreamQueue.unshift(normalizedEvent);
      if (this.multiStreamQueue.length > this.settings.multi.maxMessages) {
        this.multiStreamQueue = this.multiStreamQueue.slice(0, this.settings.multi.maxMessages);
      }

      // Broadcast to multi-stream overlay
      this.api.emit('clarityhud:multi:gift', normalizedEvent);

      this.api.log(`Multi-stream gift from ${sourceLabel}: ${normalizedEvent.user.nickname} sent ${normalizedEvent.gift.name}`, 'debug');
    } catch (error) {
      this.api.log(`Error handling multi-stream gift: ${error.message}`, 'error');
    }
  }

  /**
   * Cleanup on plugin unload
   */
  async cleanup() {
    try {
      // Disconnect multi-stream connectors
      await this.disconnectMultiStreams();

      // Flush any pending like buffer before cleanup to emit accumulated events
      if (this._likeBuffer.flushTimer) {
        clearTimeout(this._likeBuffer.flushTimer);
        this._likeBuffer.flushTimer = null;
        this._flushLikeBuffer();
      }

      // Clear all queues
      this.clearAllQueues();

      // Save current settings
      await this.api.setConfig('clarityhud.settings.chat', this.settings.chat);
      await this.api.setConfig('clarityhud.settings.full', this.settings.full);
      await this.api.setConfig('clarityhud.settings.multi', this.settings.multi);
      await this.api.setConfig('clarityhud.settings.stream', this.settings.stream);

      this.api.log('ClarityHUD backend cleaned up', 'info');
    } catch (error) {
      this.api.log(`Error during cleanup: ${error.message}`, 'error');
    }
  }
}

module.exports = ClarityHUDBackend;
