/**
 * LastEvent Spotlight Plugin
 *
 * Provides six permanent live overlays showing the last active user for each event type.
 * Supports real-time updates via WebSocket and comprehensive customization settings.
 */

class LastEventSpotlightPlugin {
  constructor(api) {
    this.api = api;
    this.pluginId = 'lastevent-spotlight';

    // Event type mappings
    this.eventTypes = {
      'follower': { event: 'follow', label: 'New Follower' },
      'like': { event: 'like', label: 'New Like' },
      'chatter': { event: 'chat', label: 'New Chat' },
      'share': { event: 'share', label: 'New Share' },
      'gifter': { event: 'gift', label: 'New Gift' },
      'subscriber': { event: 'subscribe', label: 'New Subscriber' },
      'topgift': { event: 'gift', label: 'Top Gift' },
      'giftstreak': { event: 'gift', label: 'Gift Streak' }
    };

    // Store last user for each type
    this.lastUsers = {
      follower: null,
      like: null,
      chatter: null,
      share: null,
      gifter: null,
      subscriber: null,
      topgift: null,
      giftstreak: null
    };

    // Track top gift (most expensive) in current session
    this.topGift = null;
    
    // Track gift streaks
    this.currentStreak = {
      giftName: null,
      count: 0,
      user: null,
      userData: null, // Store full user data
      startTime: null,
      totalCoins: 0
    };
    this.longestStreak = null;

    this.defaultSettings = this.getDefaultSettings();
  }

  /**
   * Get default settings for an overlay type
   */
  getDefaultSettings() {
    return {
      // Design variant - determines overall look and feel
      // Options: default, minimal, compact, neon, glassmorphism, retro
      designVariant: 'default',

      // Font settings
      fontFamily: 'Exo 2',
      fontSize: '32px',
      fontLineSpacing: '1.2',
      fontLetterSpacing: 'normal',
      fontColor: '#FFFFFF',

      // Username effects
      usernameEffect: 'none', // none, wave, wave-slow, wave-fast, jitter, bounce
      usernameWave: false,
      usernameWaveSpeed: 'medium',
      usernameGlow: false,
      usernameGlowColor: '#00FF00',

      // Border
      enableBorder: true,
      borderColor: '#FFFFFF',
      borderWidth: '3px',
      borderRadius: '50%',

      // Background
      enableBackground: false,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',

      // Profile picture
      showProfilePicture: true,
      profilePictureSize: '80px',

      // Layout
      showUsername: true,
      alignCenter: true,

      // Animations
      inAnimationType: 'fade', // fade, slide, pop, zoom, glow, bounce
      outAnimationType: 'fade',
      animationSpeed: 'medium', // slow, medium, fast
      fadeDuration: '0.5s',

      // Behavior
      refreshIntervalSeconds: 0, // 0 = no auto-refresh
      hideOnNullUser: true,
      preloadImages: true
    };
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('LastEvent Spotlight plugin loading...');

    // Initialize settings for all types if not exist
    await this.initializeSettings();

    // Load saved last users
    await this.loadLastUsers();

    // Register API routes
    this.registerRoutes();

    // Register event listeners
    this.registerEventListeners();

    this.api.log('LastEvent Spotlight plugin loaded successfully');
  }

  /**
   * Initialize settings for all overlay types
   */
  async initializeSettings() {
    for (const type of Object.keys(this.eventTypes)) {
      const key = `settings:${type}`;
      const existing = await this.api.getConfig(key);

      if (!existing) {
        await this.api.setConfig(key, this.defaultSettings);
        this.api.log(`Initialized default settings for ${type}`);
      }
    }
  }

  /**
   * Load last users from storage
   */
  async loadLastUsers() {
    for (const type of Object.keys(this.eventTypes)) {
      const key = `lastuser:${type}`;
      const user = await this.api.getConfig(key);
      if (user) {
        this.lastUsers[type] = user;
      }
    }
  }

  /**
   * Save last user for a type
   */
  async saveLastUser(type, userData) {
    this.lastUsers[type] = userData;
    const key = `lastuser:${type}`;
    await this.api.setConfig(key, userData);
  }

  /**
   * Register API routes
   */
  registerRoutes() {
    const path = require('path');

    // Serve overlay HTML files
    for (const type of Object.keys(this.eventTypes)) {
      this.api.registerRoute('GET', `/overlay/lastevent/${type}`, (req, res) => {
        const overlayPath = path.join(__dirname, 'overlays', `${type}.html`);
        res.sendFile(overlayPath);
      });
      
      // Serve overlay JS files
      this.api.registerRoute('GET', `/plugins/lastevent-spotlight/overlays/${type}.js`, (req, res) => {
        const jsPath = path.join(__dirname, 'overlays', `${type}.js`);
        res.sendFile(jsPath);
      });
    }

    // Serve plugin UI
    this.api.registerRoute('GET', '/lastevent-spotlight/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui', 'main.html');
      res.sendFile(uiPath);
    });
    
    // Serve UI JS
    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/ui/main.js', (req, res) => {
      const jsPath = path.join(__dirname, 'ui', 'main.js');
      res.sendFile(jsPath);
    });

    // Serve library files
    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/lib/animations.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'animations.js');
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/lib/text-effects.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'text-effects.js');
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/lib/template-renderer.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'template-renderer.js');
      res.sendFile(libPath);
    });

    // Get all settings
    this.api.registerRoute('GET', '/api/lastevent/settings', async (req, res) => {
      try {
        const allSettings = {};
        for (const type of Object.keys(this.eventTypes)) {
          const key = `settings:${type}`;
          allSettings[type] = await this.api.getConfig(key) || this.defaultSettings;
        }
        res.json({ success: true, settings: allSettings });
      } catch (error) {
        this.api.log(`Error getting settings: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get settings for specific type
    this.api.registerRoute('GET', '/api/lastevent/settings/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        const key = `settings:${type}`;
        const settings = await this.api.getConfig(key) || this.defaultSettings;
        res.json({ success: true, settings });
      } catch (error) {
        this.api.log(`Error getting settings for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Update settings for specific type
    this.api.registerRoute('POST', '/api/lastevent/settings/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        const newSettings = req.body;
        const key = `settings:${type}`;

        // Merge with defaults to ensure all fields exist
        const mergedSettings = { ...this.defaultSettings, ...newSettings };

        await this.api.setConfig(key, mergedSettings);

        // Broadcast settings update to all overlays
        this.api.emit(`lastevent.settings.${type}`, mergedSettings);

        res.json({ success: true, settings: mergedSettings });
      } catch (error) {
        this.api.log(`Error updating settings for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get last user for specific type
    this.api.registerRoute('GET', '/api/lastevent/last/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        const userData = this.lastUsers[type];
        res.json({ success: true, type, user: userData });
      } catch (error) {
        this.api.log(`Error getting last user for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test endpoint - simulate event for testing
    this.api.registerRoute('POST', '/api/lastevent/test/:type', async (req, res) => {
      try {
        const { type } = req.params;
        if (!this.eventTypes[type]) {
          return res.status(404).json({ success: false, error: 'Invalid event type' });
        }

        // Generate test user data
        const testUser = {
          uniqueId: `testuser_${Date.now()}`,
          nickname: `Test ${this.eventTypes[type].label}`,
          profilePictureUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Test',
          timestamp: new Date().toISOString(),
          eventType: type,
          label: this.eventTypes[type].label,
          metadata: {
            giftName: type === 'gifter' || type === 'topgift' || type === 'giftstreak' ? 'Rose' : null,
            giftPictureUrl: type === 'gifter' || type === 'topgift' || type === 'giftstreak' ? 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648db945cc9b2~tplv-obj.image' : null,
            giftCount: type === 'giftstreak' ? 10 : 1,
            coins: type === 'gifter' || type === 'topgift' ? 100 : 0,
            streakLength: type === 'giftstreak' ? 10 : null
          }
        };

        await this.saveLastUser(type, testUser);

        // Broadcast update
        this.api.emit(`lastevent.update.${type}`, testUser);

        res.json({ success: true, user: testUser });
      } catch (error) {
        this.api.log(`Error testing ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Reset stream session (clear top gift and streaks)
    this.api.registerRoute('POST', '/api/lastevent/reset-session', async (req, res) => {
      try {
        await this.resetSession();
        res.json({ success: true, message: 'Stream session reset successfully' });
      } catch (error) {
        this.api.log(`Error resetting session: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.log('API routes registered');
  }

  /**
   * Register TikTok event listeners
   */
  registerEventListeners() {
    // Map TikTok events to overlay types
    const eventMappings = {
      'follow': 'follower',
      'like': 'like',
      'chat': 'chatter',
      'share': 'share',
      'gift': 'gifter',
      'subscribe': 'subscriber'
    };

    for (const [eventName, overlayType] of Object.entries(eventMappings)) {
      this.api.registerTikTokEvent(eventName, async (data) => {
        await this.handleEvent(eventName, overlayType, data);
      });
    }

    // Also handle 'superfan' as subscriber
    this.api.registerTikTokEvent('superfan', async (data) => {
      await this.handleEvent('superfan', 'subscriber', data);
    });

    // Reset session data when a new TikTok connection is established
    // This ensures overlays don't show events from the previous stream
    this.api.registerTikTokEvent('connected', async () => {
      this.api.log('New TikTok connection detected - resetting overlay session data');
      await this.resetSession();
    });

    this.api.log('Event listeners registered');
  }

  /**
   * Reset all session data (called on new stream connection)
   * Clears last users, top gift, and streaks
   */
  async resetSession() {
    try {
      // Reset in-memory tracking
      this.topGift = null;
      this.currentStreak = {
        giftName: null,
        count: 0,
        user: null,
        userData: null,
        startTime: null,
        totalCoins: 0
      };
      this.longestStreak = null;
      
      // Clear all last user data
      for (const type of Object.keys(this.eventTypes)) {
        this.lastUsers[type] = null;
        await this.api.setConfig(`lastuser:${type}`, null);
      }
      
      // Notify all overlay clients to clear their displays
      this.api.emit('lastevent.session.reset', { timestamp: new Date().toISOString() });
      
      this.api.log('Session data reset successfully');
    } catch (error) {
      this.api.log(`Error resetting session: ${error.message}`);
    }
  }

  /**
   * Handle incoming TikTok event
   */
  async handleEvent(eventName, overlayType, data) {
    try {
      // Extract user data from event
      const userData = this.extractUserData(eventName, overlayType, data);

      if (!userData) {
        this.api.log(`Could not extract user data from ${eventName} event`);
        return;
      }

      // Save as last user for this type
      await this.saveLastUser(overlayType, userData);

      // Broadcast to overlays
      this.api.emit(`lastevent.update.${overlayType}`, userData);

      this.api.log(`Updated last ${overlayType}: ${userData.nickname}`);

      // Handle gift-specific tracking (top gift and streak)
      if (eventName === 'gift' && userData.metadata.coins) {
        await this.handleGiftTracking(userData);
      }
    } catch (error) {
      this.api.log(`Error handling ${eventName} event: ${error.message}`);
    }
  }

  /**
   * Handle gift tracking for top gift and streaks
   */
  async handleGiftTracking(userData) {
    const giftCoins = userData.metadata.coins;
    const giftName = userData.metadata.giftName;
    const giftPictureUrl = userData.metadata.giftPictureUrl;
    const giftCount = userData.metadata.giftCount;
    const uniqueId = userData.uniqueId;

    // Track top gift (most expensive)
    if (!this.topGift || giftCoins > this.topGift.metadata.coins) {
      this.topGift = {
        ...userData,
        eventType: 'topgift',
        label: 'Top Gift'
      };
      await this.saveLastUser('topgift', this.topGift);
      this.api.emit('lastevent.update.topgift', this.topGift);
      this.api.log(`New top gift: ${giftName} (${giftCoins} coins) from ${userData.nickname}`);
    }

    // Track gift streaks
    const now = new Date();
    const timeSinceLastGift = this.currentStreak.startTime 
      ? now - new Date(this.currentStreak.startTime) 
      : Infinity;
    
    // Consider it a streak if same gift from same user within 30 seconds
    const isStreakContinuation = 
      this.currentStreak.giftName === giftName &&
      this.currentStreak.user === uniqueId &&
      timeSinceLastGift < 30000; // 30 seconds

    if (isStreakContinuation) {
      // Continue streak
      this.currentStreak.count += giftCount;
      this.currentStreak.totalCoins += giftCoins;
    } else {
      // Check if previous streak should be saved as longest
      if (this.currentStreak.count > 0) {
        if (!this.longestStreak || this.currentStreak.count > this.longestStreak.count) {
          this.longestStreak = { ...this.currentStreak };
          
          // Create userData for longest streak using stored user data
          const storedUserData = this.longestStreak.userData || {};
          const streakData = {
            uniqueId: storedUserData.uniqueId || this.longestStreak.user,
            nickname: storedUserData.nickname || 'Unknown',
            profilePictureUrl: storedUserData.profilePictureUrl || '',
            timestamp: this.longestStreak.startTime,
            eventType: 'giftstreak',
            label: 'Gift Streak',
            metadata: {
              giftName: this.longestStreak.giftName,
              giftPictureUrl: this.longestStreak.giftPictureUrl,
              giftCount: this.longestStreak.count,
              coins: this.longestStreak.totalCoins,
              streakLength: this.longestStreak.count
            }
          };
          
          await this.saveLastUser('giftstreak', streakData);
          this.api.emit('lastevent.update.giftstreak', streakData);
          this.api.log(`New gift streak record: ${this.longestStreak.count}x ${this.longestStreak.giftName}`);
        }
      }

      // Start new streak
      this.currentStreak = {
        giftName,
        giftPictureUrl,
        count: giftCount,
        user: uniqueId,
        userData: {
          uniqueId: userData.uniqueId,
          nickname: userData.nickname,
          profilePictureUrl: userData.profilePictureUrl
        },
        startTime: now.toISOString(),
        totalCoins: giftCoins
      };
    }
  }

  /**
   * Extract user data from TikTok event
   * Includes fallback to GiftCatalogue for gift images
   */
  extractUserData(eventName, overlayType, data) {
    // Handle different event data structures
    let user = null;

    if (data.user) {
      user = data.user;
    } else if (data.uniqueId || data.username) {
      user = data;
    }

    if (!user) {
      return null;
    }

    // Get gift picture URL, with fallback to GiftCatalogue
    let giftPictureUrl = data.giftPictureUrl;
    const giftId = data.giftId;
    
    // If no giftPictureUrl but we have a giftId, look up from GiftCatalogue
    if (!giftPictureUrl && giftId) {
      try {
        const db = this.api.getDatabase();
        if (db && typeof db.getGift === 'function') {
          const catalogGift = db.getGift(giftId);
          if (catalogGift && catalogGift.image_url) {
            giftPictureUrl = catalogGift.image_url;
            this.api.log(`Loaded gift image from catalog for gift ID ${giftId}: ${giftPictureUrl}`);
          }
        }
      } catch (error) {
        this.api.log(`Could not load gift from catalog: ${error.message}`);
      }
    }

    return {
      uniqueId: user.uniqueId || user.username || user.userId || 'unknown',
      nickname: user.nickname || user.displayName || user.uniqueId || user.username || 'Anonymous',
      profilePictureUrl: user.profilePictureUrl || user.avatarUrl || user.profilePicUrl || user.profilePicture || '',
      timestamp: new Date().toISOString(),
      eventType: overlayType,
      label: this.eventTypes[overlayType].label,
      // Additional event-specific data
      metadata: {
        giftName: data.giftName,
        giftPictureUrl: giftPictureUrl,
        giftId: giftId,
        giftCount: data.repeatCount || data.count || 1,
        message: data.comment || data.message,
        // FIX: Use data.coins (already calculated), only fallback to 0 if not present
        // Don't fallback to diamondCount as it's the raw diamond value, not coins
        coins: data.coins || 0
      }
    };
  }

  /**
   * Cleanup on plugin unload
   */
  async destroy() {
    this.api.log('LastEvent Spotlight plugin unloading...');
  }
}

// Export plugin class
module.exports = LastEventSpotlightPlugin;
