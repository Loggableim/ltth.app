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
      'giftstreak': { event: 'gift', label: 'Gift Streak' },
      'multihud': { event: 'multi', label: 'Multi-HUD Rotation' }
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
      giftstreak: null,
      multihud: null
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
      lastActivity: null,
      totalCoins: 0
    };
    this.longestStreak = null;
    this.sessionId = this.createSessionId();
    this.chatterPersistDelayMs = 1000;
    this.pendingPersistTimers = new Map();
    this.highVolumeEventTypes = new Set(['chatter', 'like']);

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
      hudAlignment: 'center',

      // Animations
      inAnimationType: 'fade', // fade, slide, pop, zoom, glow, bounce
      outAnimationType: 'fade',
      animationSpeed: 'medium', // slow, medium, fast
      fadeDuration: '0.5s',

      // Behavior
      refreshIntervalSeconds: 0, // 0 = no auto-refresh
      hideOnNullUser: true,
      preloadImages: true,

      // Multi-HUD specific settings
      selectedEvents: ['follower', 'like', 'chatter', 'share', 'gifter', 'subscriber'], // Events to show in rotation
      rotationIntervalSeconds: 5 // Rotation interval in seconds
    };
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('LastEvent Spotlight plugin loading...');

    await this.loadSession();

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
        await this.persistConfig(key, this.defaultSettings);
        this.api.log(`Initialized default settings for ${type}`);
      }
    }
  }

  createSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async persistConfig(key, value) {
    const result = await this.api.setConfig(key, value);
    if (result === false) {
      throw new Error(`Failed to save ${key}`);
    }
  }

  async loadSession() {
    const existingSessionId = await this.api.getConfig('session:id');
    if (typeof existingSessionId === 'string' && existingSessionId.trim()) {
      this.sessionId = existingSessionId;
      return;
    }

    await this.persistConfig('session:id', this.sessionId);
  }

  /**
   * Load last users from storage
   */
  async loadLastUsers() {
    for (const type of Object.keys(this.eventTypes)) {
      const key = `lastuser:${type}`;
      const user = await this.api.getConfig(key);
      if (user && this.isCurrentSessionUser(user)) {
        this.lastUsers[type] = user;
      }
    }

    this.restoreDerivedSessionState();
  }

  isCurrentSessionUser(user) {
    return !user || !user.sessionId || user.sessionId === this.sessionId;
  }

  restoreDerivedSessionState() {
    const topGift = this.lastUsers.topgift;
    if (topGift && topGift.metadata) {
      this.topGift = topGift;
    }

    const giftStreak = this.lastUsers.giftstreak;
    if (giftStreak && giftStreak.metadata) {
      const restoredStreak = {
        giftName: giftStreak.metadata.giftName || null,
        giftPictureUrl: this.normalizeImageUrl(giftStreak.metadata.giftPictureUrl),
        count: Number(giftStreak.metadata.streakLength || giftStreak.metadata.giftCount || 0),
        user: giftStreak.uniqueId || null,
        userData: {
          uniqueId: giftStreak.uniqueId,
          nickname: giftStreak.nickname,
          profilePictureUrl: giftStreak.profilePictureUrl
        },
        startTime: giftStreak.timestamp || new Date().toISOString(),
        lastActivity: giftStreak.timestamp || new Date().toISOString(),
        totalCoins: Number(giftStreak.metadata.coins || 0)
      };

      this.longestStreak = { ...restoredStreak };
      this.currentStreak = { ...restoredStreak };
    }
  }

  /**
   * Save last user for a type
   */
  async saveLastUser(type, userData) {
    const dataToSave = userData && typeof userData === 'object'
      ? { ...userData, sessionId: userData.sessionId || this.sessionId }
      : userData;

    this.lastUsers[type] = dataToSave;
    const key = `lastuser:${type}`;

    if (this.highVolumeEventTypes.has(type) && dataToSave) {
      this.schedulePersist(key, dataToSave);
      return;
    }

    await this.persistConfig(key, dataToSave);
  }

  schedulePersist(key, value) {
    this.cancelPendingPersist(key);

    const timer = setTimeout(async () => {
      this.pendingPersistTimers.delete(key);
      try {
        await this.persistConfig(key, value);
      } catch (error) {
        this.api.log(`Error saving debounced config ${key}: ${error.message}`, 'error');
      }
    }, this.chatterPersistDelayMs);

    this.pendingPersistTimers.set(key, timer);
  }

  cancelPendingPersist(key) {
    const timer = this.pendingPersistTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.pendingPersistTimers.delete(key);
    }
  }

  cancelAllPendingPersists() {
    for (const key of this.pendingPersistTimers.keys()) {
      this.cancelPendingPersist(key);
    }
  }

  /**
   * Get valid event types selected for the Multi-HUD rotation.
   */
  getSelectedMultihudEvents(selectedEvents) {
    const configuredEvents = Array.isArray(selectedEvents)
      ? selectedEvents
      : this.defaultSettings.selectedEvents;

    return configuredEvents.filter((type, index) => {
      return type !== 'multihud' &&
        this.eventTypes[type] &&
        configuredEvents.indexOf(type) === index;
    });
  }

  getDisplayEventTypes(selectedEvents = null) {
    const candidates = selectedEvents
      ? this.getSelectedMultihudEvents(selectedEvents)
      : Object.keys(this.eventTypes).filter(type => type !== 'multihud');

    return candidates.filter(type => type !== 'multihud' && this.eventTypes[type]);
  }

  parseSelectedEvents(value) {
    if (Array.isArray(value)) {
      return this.getDisplayEventTypes(value);
    }

    if (typeof value !== 'string' || value.trim() === '') {
      return null;
    }

    return this.getDisplayEventTypes(value.split(',').map(type => type.trim()));
  }

  isCssLength(value) {
    return typeof value === 'string' &&
      /^-?\d+(\.\d+)?(px|em|rem|%|vh|vw)?$/i.test(value.trim());
  }

  isCssDuration(value) {
    return typeof value === 'string' &&
      /^\d+(\.\d+)?(ms|s)$/i.test(value.trim());
  }

  isColorValue(value) {
    return typeof value === 'string' &&
      (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value.trim()) ||
        /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(value.trim()));
  }

  sanitizeString(value, fallback, pattern) {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    if (pattern && !pattern.test(trimmed)) return fallback;
    return trimmed;
  }

  sanitizeChoice(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }

  sanitizeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  sanitizeInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
  }

  normalizeSettings(type, rawSettings = {}, options = {}) {
    const raw = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
    const defaults = this.defaultSettings;
    const selectedEvents = Array.isArray(raw.selectedEvents)
      ? this.getSelectedMultihudEvents(raw.selectedEvents)
      : defaults.selectedEvents;

    if (type === 'multihud' && options.rejectEmptyMultihudSelection && selectedEvents.length === 0) {
      return {
        settings: null,
        error: 'Select at least one event for Multi-HUD rotation'
      };
    }

    // Migrate old alignCenter boolean to new hudAlignment string
    if (raw.hudAlignment === undefined || raw.hudAlignment === null) {
      if (raw.alignCenter === false) {
        raw.hudAlignment = 'left';
      }
      // alignCenter === true or undefined → keep default 'center'
    }

    const settings = {
      designVariant: this.sanitizeChoice(raw.designVariant, ['default', 'minimal', 'compact', 'neon', 'glassmorphism', 'retro'], defaults.designVariant),
      fontFamily: this.sanitizeString(raw.fontFamily, defaults.fontFamily, /^[\w\s"',-]+$/),
      fontSize: this.isCssLength(raw.fontSize) ? raw.fontSize.trim() : defaults.fontSize,
      fontLineSpacing: this.sanitizeString(raw.fontLineSpacing, defaults.fontLineSpacing, /^\d+(\.\d+)?$/),
      fontLetterSpacing: raw.fontLetterSpacing === 'normal' || this.isCssLength(raw.fontLetterSpacing) ? raw.fontLetterSpacing : defaults.fontLetterSpacing,
      fontColor: this.isColorValue(raw.fontColor) ? raw.fontColor.trim() : defaults.fontColor,
      usernameEffect: this.sanitizeChoice(raw.usernameEffect, ['none', 'wave', 'wave-slow', 'wave-fast', 'jitter', 'bounce'], defaults.usernameEffect),
      usernameWave: this.sanitizeBoolean(raw.usernameWave, defaults.usernameWave),
      usernameWaveSpeed: this.sanitizeChoice(raw.usernameWaveSpeed, ['slow', 'medium', 'fast'], defaults.usernameWaveSpeed),
      usernameGlow: this.sanitizeBoolean(raw.usernameGlow, defaults.usernameGlow),
      usernameGlowColor: this.isColorValue(raw.usernameGlowColor) ? raw.usernameGlowColor.trim() : defaults.usernameGlowColor,
      enableBorder: this.sanitizeBoolean(raw.enableBorder, defaults.enableBorder),
      borderColor: this.isColorValue(raw.borderColor) ? raw.borderColor.trim() : defaults.borderColor,
      borderWidth: this.isCssLength(raw.borderWidth) ? raw.borderWidth.trim() : defaults.borderWidth,
      borderRadius: raw.borderRadius === '50%' || this.isCssLength(raw.borderRadius) ? raw.borderRadius : defaults.borderRadius,
      enableBackground: this.sanitizeBoolean(raw.enableBackground, defaults.enableBackground),
      backgroundColor: this.isColorValue(raw.backgroundColor) ? raw.backgroundColor.trim() : defaults.backgroundColor,
      showProfilePicture: this.sanitizeBoolean(raw.showProfilePicture, defaults.showProfilePicture),
      profilePictureSize: this.isCssLength(raw.profilePictureSize) ? raw.profilePictureSize.trim() : defaults.profilePictureSize,
      showUsername: this.sanitizeBoolean(raw.showUsername, defaults.showUsername),
      hudAlignment: this.sanitizeChoice(raw.hudAlignment, ['center', 'left', 'right'], defaults.hudAlignment),
      inAnimationType: this.sanitizeChoice(raw.inAnimationType, ['fade', 'slide', 'pop', 'zoom', 'glow', 'bounce', 'none'], defaults.inAnimationType),
      outAnimationType: this.sanitizeChoice(raw.outAnimationType, ['fade', 'slide', 'pop', 'zoom', 'glow', 'bounce', 'none'], defaults.outAnimationType),
      animationSpeed: this.sanitizeChoice(raw.animationSpeed, ['slow', 'medium', 'fast'], defaults.animationSpeed),
      fadeDuration: this.isCssDuration(raw.fadeDuration) ? raw.fadeDuration.trim() : defaults.fadeDuration,
      refreshIntervalSeconds: this.sanitizeInteger(raw.refreshIntervalSeconds, defaults.refreshIntervalSeconds, 0, 3600),
      hideOnNullUser: this.sanitizeBoolean(raw.hideOnNullUser, defaults.hideOnNullUser),
      preloadImages: this.sanitizeBoolean(raw.preloadImages, defaults.preloadImages),
      selectedEvents,
      rotationIntervalSeconds: this.sanitizeInteger(raw.rotationIntervalSeconds, defaults.rotationIntervalSeconds, 1, 60)
    };

    return { settings, error: null };
  }

  /**
   * Generate representative test user data for an overlay type.
   */
  createTestUser(type) {
    const isGiftType = type === 'gifter' || type === 'topgift' || type === 'giftstreak';

    return {
      uniqueId: `testuser_${Date.now()}`,
      nickname: `Test ${this.eventTypes[type].label}`,
      profilePictureUrl: 'https://via.placeholder.com/150/0000FF/FFFFFF?text=Test',
      timestamp: new Date().toISOString(),
      eventType: type,
      label: this.eventTypes[type].label,
      sessionId: this.sessionId,
      metadata: {
        giftName: isGiftType ? 'Rose' : null,
        giftPictureUrl: isGiftType ? 'https://p16-webcast.tiktokcdn.com/img/maliva/webcast-va/eba3a9bb85c33e017f3648db945cc9b2~tplv-obj.image' : null,
        giftCount: type === 'giftstreak' ? 10 : 1,
        coins: type === 'gifter' || type === 'topgift' ? 100 : 0,
        streakLength: type === 'giftstreak' ? 10 : null
      }
    };
  }

  /**
   * Save and broadcast test user data for an overlay type.
   */
  async publishTestUser(type) {
    const testUser = this.createTestUser(type);

    await this.saveLastUser(type, testUser);

    this.api.emit(`lastevent.update.${type}`, testUser);
    this.api.emit('lastevent.multihud.update', { type, user: testUser });

    return testUser;
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

    this.api.registerRoute('GET', '/plugins/lastevent-spotlight/overlays/single-overlay.js', (req, res) => {
      const jsPath = path.join(__dirname, 'overlays', 'single-overlay.js');
      res.sendFile(jsPath);
    });

    // Get all settings
    this.api.registerRoute('GET', '/api/lastevent/settings', async (req, res) => {
      try {
        const allSettings = {};
        for (const type of Object.keys(this.eventTypes)) {
          const key = `settings:${type}`;
          const storedSettings = await this.api.getConfig(key);
          allSettings[type] = this.normalizeSettings(type, storedSettings || this.defaultSettings).settings;
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
        const storedSettings = await this.api.getConfig(key);
        const settings = this.normalizeSettings(type, storedSettings || this.defaultSettings).settings;
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

        const normalized = this.normalizeSettings(type, newSettings, {
          rejectEmptyMultihudSelection: true
        });

        if (normalized.error) {
          return res.status(400).json({ success: false, error: normalized.error });
        }

        await this.persistConfig(key, normalized.settings);

        // Broadcast settings update to all overlays
        this.api.emit(`lastevent.settings.${type}`, normalized.settings);

        res.json({ success: true, settings: normalized.settings });
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
        res.json({ success: true, type, sessionId: this.sessionId, user: userData });
      } catch (error) {
        this.api.log(`Error getting last user for ${req.params.type}: ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all last users (for multihud rotation)
    this.api.registerRoute('GET', '/api/lastevent/all', async (req, res) => {
      try {
        const selectedEvents = this.parseSelectedEvents(req.query.selected || req.query.selectedEvents || req.query.events);
        const eventTypes = selectedEvents || this.getDisplayEventTypes();
        const allUsers = {};
        for (const type of eventTypes) {
          allUsers[type] = this.lastUsers[type];
        }
        res.json({ success: true, sessionId: this.sessionId, users: allUsers });
      } catch (error) {
        this.api.log(`Error getting all last users: ${error.message}`);
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

        if (type === 'multihud') {
          const storedSettings = await this.api.getConfig('settings:multihud');
          const settings = this.normalizeSettings('multihud', storedSettings || this.defaultSettings).settings;
          const selectedEvents = this.getSelectedMultihudEvents(settings.selectedEvents);
          const users = {};

          for (const eventType of selectedEvents) {
            users[eventType] = await this.publishTestUser(eventType);
          }

          return res.json({ success: true, users });
        }

        const testUser = await this.publishTestUser(type);

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
        res.json({ success: true, sessionId: this.sessionId, message: 'Stream session reset successfully' });
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
    this.cancelAllPendingPersists();

    this.sessionId = this.createSessionId();
    await this.persistConfig('session:id', this.sessionId);

    // Reset in-memory tracking
    this.topGift = null;
    this.currentStreak = {
      giftName: null,
      count: 0,
      user: null,
      userData: null,
      startTime: null,
      lastActivity: null,
      totalCoins: 0
    };
    this.longestStreak = null;

    // Clear all last user data
    for (const type of Object.keys(this.eventTypes)) {
      this.lastUsers[type] = null;
      await this.persistConfig(`lastuser:${type}`, null);
    }

    // Notify all overlay clients to clear their displays
    this.api.emit('lastevent.session.reset', {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString()
    });

    this.api.log('Session data reset successfully');
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

      // Also broadcast to multihud overlay if it's tracking this event type
      this.api.emit('lastevent.multihud.update', { type: overlayType, user: userData });

      const logLevel = this.highVolumeEventTypes.has(overlayType) ? 'debug' : 'info';
      this.api.log(`Updated last ${overlayType}: ${userData.nickname}`, logLevel);

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
      this.api.emit('lastevent.multihud.update', { type: 'topgift', user: this.topGift });
      this.api.log(`New top gift: ${giftName} (${giftCoins} coins) from ${userData.nickname}`);
    }

    // Track gift streaks
    const now = new Date();
    // Use lastActivity instead of startTime for timeout calculation
    const timeSinceLastGift = this.currentStreak.lastActivity 
      ? now - new Date(this.currentStreak.lastActivity) 
      : Infinity;
    
    // Consider it a streak if same gift from same user within 30 seconds
    const isStreakContinuation = 
      this.currentStreak.giftName === giftName &&
      this.currentStreak.user === uniqueId &&
      timeSinceLastGift < 30000;

    if (isStreakContinuation) {
      // Continue streak
      this.currentStreak.count += giftCount;
      this.currentStreak.totalCoins += giftCoins;
      this.currentStreak.lastActivity = now.toISOString(); // Reset timer
    } else {
      // Evaluate previous streak
      if (this.currentStreak.count > 0) {
        if (!this.longestStreak || this.currentStreak.count > this.longestStreak.count) {
          this.longestStreak = { ...this.currentStreak };
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
        lastActivity: now.toISOString(), // New field for timeout calculation
        totalCoins: giftCoins
      };
    }

    // Broadcast the active streak immediately so it shows up in real-time
    const streakToDisplay = (this.currentStreak.count > (this.longestStreak?.count || 1)) 
      ? this.currentStreak 
      : (this.longestStreak || this.currentStreak);

    if (streakToDisplay.count > 1) {
      const storedUserData = streakToDisplay.userData || {};
      const streakData = {
        uniqueId: storedUserData.uniqueId || streakToDisplay.user,
        nickname: storedUserData.nickname || 'Unknown',
        profilePictureUrl: storedUserData.profilePictureUrl || '',
        timestamp: streakToDisplay.lastActivity,
        eventType: 'giftstreak',
        label: 'Gift Streak',
        sessionId: this.sessionId,
        metadata: {
          giftName: streakToDisplay.giftName,
          giftPictureUrl: streakToDisplay.giftPictureUrl,
          giftCount: streakToDisplay.count,
          coins: streakToDisplay.totalCoins,
          streakLength: streakToDisplay.count
        }
      };
      
      await this.saveLastUser('giftstreak', streakData);
      this.api.emit('lastevent.update.giftstreak', streakData);
      this.api.emit('lastevent.multihud.update', { type: 'giftstreak', user: streakData });
    }
  }

  /**
   * Extract profile picture URL from TikTok user object
   * TikTok can provide profile pictures in different formats:
   * - As a string URL (legacy)
   * - As an object with url array field (current format from Eulerstream)
   */
  extractProfilePictureUrl(user) {
    if (!user) return '';

    // Try various fields that might contain the profile picture
    // Order matches tiktok.js module for consistency
    const pictureData = user.profilePictureUrl || user.profilePicture || user.avatarThumb || user.avatarLarger || user.avatarUrl;

    return this.normalizeImageUrl(pictureData) || '';
  }

  normalizeImageUrl(value) {
    if (!value) return '';

    if (typeof value === 'string') {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const firstString = value.find(item => typeof item === 'string' && item.trim());
      return firstString ? firstString.trim() : '';
    }

    if (typeof value === 'object') {
      const candidates = [
        value.url,
        value.urlList,
        value.url_list,
        value.urls,
        value.imageUrl,
        value.image_url,
        value.giftPictureUrl,
        value.picture_url,
        value.uri,
        value.image?.url,
        value.image?.urlList,
        value.image?.url_list,
        value.image?.urls,
        value.icon?.url,
        value.icon?.urlList,
        value.icon?.url_list,
        value.icon?.urls
      ];

      for (const candidate of candidates) {
        const normalized = this.normalizeImageUrl(candidate);
        if (normalized) return normalized;
      }
    }

    return '';
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
    let giftPictureUrl = this.normalizeImageUrl(data.giftPictureUrl);
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
      profilePictureUrl: this.extractProfilePictureUrl(user),
      timestamp: new Date().toISOString(),
      eventType: overlayType,
      label: this.eventTypes[overlayType].label,
      sessionId: this.sessionId,
      // Additional event-specific data
      metadata: {
        giftName: data.giftName,
        giftPictureUrl: giftPictureUrl,
        giftId: giftId,
        giftCount: data.repeatCount || data.count || 1,
        message: data.comment || data.message,
        // FIX: Use data.coins (already calculated), only fallback to 0 if not present
        // Don't fallback to diamondCount as it's the raw diamond value, not coins
        coins: Number(data.coins) || 0
      }
    };
  }

  /**
   * Cleanup on plugin unload
   */
  async destroy() {
    this.api.log('LastEvent Spotlight plugin unloading...');
    this.cancelAllPendingPersists();
  }
}

// Export plugin class
module.exports = LastEventSpotlightPlugin;
