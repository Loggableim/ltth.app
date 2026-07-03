/**
 * HUD Manager for GCCE
 * 
 * Integrated HUD overlay management system with enhancements from Phase 1-3:
 * - Token bucket rate limiting (Phase 1)
 * - Advanced permission system (Phase 2)
 * - Audit logging (Phase 3)
 * - User data caching (Phase 1)
 * - Socket event batching (Phase 3)
 * 
 * Replaces standalone gcce-hud plugin with better integration and performance.
 */

class HUDManager {
  constructor(api, rateLimiter, permissionSystem, auditLog, userCache, socketBatcher) {
    this.api = api;
    this.rateLimiter = rateLimiter;
    this.permissionSystem = permissionSystem;
    this.auditLog = auditLog;
    this.userCache = userCache;
    this.socketBatcher = socketBatcher;
    this.io = api.getSocketIO();

    // Active HUD elements
    this.activeElements = new Map();
    this.elementIdCounter = 0;

    // Statistics
    this.stats = {
      totalDisplayed: 0,
      byPosition: {},
      byType: {},
      totalDuration: 0
    };

    // Default configuration
    this.config = {
      enabled: true,
      chatCommands: {
        enabled: true,
        allowText: true,
        allowImages: true,
        allowMedia: true
      },
      defaults: {
        textDuration: 10,
        imageDuration: 10,
        maxDuration: 60,
        minDuration: 3,
        fontSize: 48,
        fontFamily: 'Arial, sans-serif',
        textColor: '#FFFFFF',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        position: 'top-center',
        maxWidth: 800,
        imageMaxWidth: 400,
        imageMaxHeight: 400,
        mediaDuration: 12,
        mediaMaxWidth: 480,
        mediaMaxHeight: 480
      },
      permissions: {
        text: 'all',
        image: 'subscriber',
        clear: 'moderator',
        media: 'subscriber'
      },
      mediaLibrary: [],
      giftRotator: {
        enabled: false,
        intervalSeconds: 10,
        entries: []
      }
    };
  }

  /**
   * Initialize HUD Manager
   */
  async init() {
    await this.loadConfig();
    this.startCleanupTimer();
    this.api.log('[HUD] HUD Manager initialized', 'info');
  }

  /**
   * Load configuration from database
   */
  async loadConfig() {
    try {
      const savedConfig = await this.api.getConfig('hud_config');
      if (savedConfig) {
        this.config = this.mergeConfig(savedConfig);
      }
      await this.api.setConfig('hud_config', this.config);
    } catch (error) {
      this.api.log(`[HUD] Error loading config: ${error.message}`, 'error');
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig) {
    this.config = this.mergeConfig(newConfig);
    await this.api.setConfig('hud_config', this.config);
    return this.config;
  }

  /**
   * Merge new config while preserving nested defaults
   * @param {Object} newConfig
   * @returns {Object}
   */
  mergeConfig(newConfig = {}) {
    return {
      ...this.config,
      ...newConfig,
      chatCommands: { ...this.config.chatCommands, ...newConfig.chatCommands },
      defaults: { ...this.config.defaults, ...newConfig.defaults },
      permissions: { ...this.config.permissions, ...newConfig.permissions },
      mediaLibrary: this.normalizeMediaLibrary(newConfig.mediaLibrary || this.config.mediaLibrary),
      giftRotator: this.normalizeGiftRotator(newConfig.giftRotator || this.config.giftRotator)
    };
  }

  /**
   * Normalize media library entries
   * @param {Array} mediaLibrary
   * @returns {Array}
   */
  normalizeMediaLibrary(mediaLibrary = []) {
    if (!Array.isArray(mediaLibrary)) return [];

    return mediaLibrary
      .filter(item => item && item.url && item.label)
      .map((item, index) => ({
        id: item.id || `media-${index + 1}`,
        label: this.sanitizeText(item.label).substring(0, 80),
        url: item.url,
        duration: Math.max(this.config.defaults.minDuration, Math.min(this.config.defaults.maxDuration, parseInt(item.duration || this.config.defaults.mediaDuration, 10))),
        type: item.type || this.inferMediaType(item.url)
      }));
  }

  /**
   * Normalize gift rotator config
   * @param {Object} giftRotator
   * @returns {Object}
   */
  normalizeGiftRotator(giftRotator = {}) {
    const intervalSeconds = Math.max(3, Math.min(60, parseInt(giftRotator.intervalSeconds || this.config.giftRotator.intervalSeconds || 10, 10)));

    const entries = Array.isArray(giftRotator.entries) ? giftRotator.entries : [];
    const normalizedEntries = entries
      .filter(entry => entry && entry.giftId)
      .map((entry, index) => ({
        id: entry.id || `gift-${index + 1}`,
        giftId: entry.giftId,
        giftName: this.sanitizeText(entry.giftName || ''),
        giftImage: entry.giftImage || '',
        title: this.sanitizeText(entry.title || '').substring(0, 120),
        info: this.sanitizeText(entry.info || '').substring(0, 160),
        template: entry.template || 'card',
        fontFamily: entry.fontFamily || 'Inter, sans-serif',
        textColor: entry.textColor || '#ffffff',
        accentColor: entry.accentColor || '#ff5f9e',
        backgroundColor: entry.backgroundColor || 'rgba(0, 0, 0, 0.65)'
      }));

    return {
      enabled: giftRotator.enabled === true || giftRotator.enabled === false ? giftRotator.enabled : this.config.giftRotator.enabled,
      intervalSeconds,
      entries: normalizedEntries
    };
  }

  /**
   * Handle text display command
   */
  async handleTextCommand(args, context) {
    try {
      if (!this.config.enabled || !this.config.chatCommands.allowText) {
        return { success: false, error: 'HUD text display is disabled' };
      }

      // Permission check
      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.text',
        this.config.permissions.text
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Rate limiting
      const rateLimitResult = this.rateLimiter.tryConsume(context.userId, 1);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Retry in ${rateLimitResult.retryAfter}s`
        };
      }

      // Parse duration and text
      let duration = this.config.defaults.textDuration;
      let text = args.join(' ');

      const firstArg = parseFloat(args[0]);
      if (!isNaN(firstArg) && args.length > 1) {
        duration = Math.max(
          this.config.defaults.minDuration,
          Math.min(this.config.defaults.maxDuration, firstArg)
        );
        text = args.slice(1).join(' ');
      }

      // Sanitize text
      text = this.sanitizeText(text);

      if (!text || text.length === 0) {
        return { success: false, error: 'Text cannot be empty' };
      }

      if (text.length > 200) {
        text = text.substring(0, 200) + '...';
      }

      // Create HUD element
      const elementId = this.createTextElement(text, duration, context);

      // Audit log
      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudtext', args, {
          elementId,
          duration,
          textLength: text.length
        });
      }

      return {
        success: true,
        message: `Text displayed for ${duration} seconds`,
        data: { elementId, duration }
      };

    } catch (error) {
      this.api.log(`[HUD] Error in hudtext command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display text' };
    }
  }

  /**
   * Handle image display command
   */
  async handleImageCommand(args, context) {
    try {
      if (!this.config.enabled || !this.config.chatCommands.allowImages) {
        return { success: false, error: 'HUD image display is disabled' };
      }

      // Permission check
      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.image',
        this.config.permissions.image
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      // Rate limiting
      const rateLimitResult = this.rateLimiter.tryConsume(context.userId, 1);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Retry in ${rateLimitResult.retryAfter}s`
        };
      }

      // Parse duration and URL
      let duration = this.config.defaults.imageDuration;
      let imageUrl = args.join(' ');

      const firstArg = parseFloat(args[0]);
      if (!isNaN(firstArg) && args.length > 1) {
        duration = Math.max(
          this.config.defaults.minDuration,
          Math.min(this.config.defaults.maxDuration, firstArg)
        );
        imageUrl = args.slice(1).join(' ');
      }

      // Validate URL
      if (!this.isValidImageUrl(imageUrl)) {
        return { success: false, error: 'Invalid image URL' };
      }

      // Create HUD element
      const elementId = this.createImageElement(imageUrl, duration, context);

      // Audit log
      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudimage', args, {
          elementId,
          duration,
          url: imageUrl
        });
      }

      return {
        success: true,
        message: `Image displayed for ${duration} seconds`,
        data: { elementId, duration }
      };

    } catch (error) {
      this.api.log(`[HUD] Error in hudimage command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display image' };
    }
  }

  /**
   * Handle media display command (GIF/MP4)
   */
  async handleMediaCommand(args, context) {
    try {
      if (!this.config.enabled || !this.config.chatCommands.allowMedia) {
        return { success: false, error: 'HUD media display is disabled' };
      }

      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.media',
        this.config.permissions.media || this.config.permissions.image
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const rateLimitResult = this.rateLimiter.tryConsume(context.userId, 1);
      if (!rateLimitResult.allowed) {
        return {
          success: false,
          error: `Rate limit exceeded. Retry in ${rateLimitResult.retryAfter}s`
        };
      }

      let duration = this.config.defaults.mediaDuration;
      let target = args[0];

      const possibleDuration = parseFloat(args[0]);
      if (!isNaN(possibleDuration) && args.length > 1) {
        duration = Math.max(
          this.config.defaults.minDuration,
          Math.min(this.config.defaults.maxDuration, possibleDuration)
        );
        target = args[1];
      }

      const mediaItem = this.findMediaItem(target);
      const url = mediaItem ? mediaItem.url : target;
      const mediaDuration = mediaItem ? mediaItem.duration || duration : duration;
      const mediaType = mediaItem ? mediaItem.type : this.inferMediaType(url);

      if (!this.isValidMediaUrl(url)) {
        return { success: false, error: 'Invalid media URL or entry' };
      }

      const elementId = this.createMediaElement(url, mediaDuration, mediaType, context, mediaItem?.label);

      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudmedia', args, {
          elementId,
          duration: mediaDuration,
          url,
          mediaType
        });
      }

      return {
        success: true,
        message: `Media displayed for ${mediaDuration} seconds`,
        data: { elementId, duration: mediaDuration }
      };
    } catch (error) {
      this.api.log(`[HUD] Error in hudmedia command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to display media' };
    }
  }

  /**
   * Handle clear command
   */
  async handleClearCommand(args, context) {
    try {
      // Permission check
      const hasPermission = await this.permissionSystem.checkPermission(
        context.userId,
        'gcce.hud.clear',
        this.config.permissions.clear
      );

      if (!hasPermission) {
        return { success: false, error: 'Insufficient permissions' };
      }

      const count = this.activeElements.size;
      this.clearAllElements();

      // Audit log
      if (this.auditLog) {
        this.auditLog.logCommand(context.userId, 'hudclear', args, {
          elementsCleared: count
        });
      }

      return {
        success: true,
        message: `Cleared ${count} HUD element(s)`
      };

    } catch (error) {
      this.api.log(`[HUD] Error in hudclear command: ${error.message}`, 'error');
      return { success: false, error: 'Failed to clear HUD' };
    }
  }

  /**
   * Create text HUD element
   */
  createTextElement(text, duration, context) {
    const elementId = `text-${++this.elementIdCounter}`;
    const element = {
      id: elementId,
      type: 'text',
      content: text,
      username: context.username,
      userId: context.userId,
      timestamp: Date.now(),
      duration: duration * 1000,
      expiresAt: Date.now() + (duration * 1000),
      style: {
        fontSize: this.config.defaults.fontSize,
        fontFamily: this.config.defaults.fontFamily,
        textColor: this.config.defaults.textColor,
        backgroundColor: this.config.defaults.backgroundColor,
        position: this.config.defaults.position,
        maxWidth: this.config.defaults.maxWidth
      }
    };

    this.activeElements.set(elementId, element);
    this.updateStats('text', this.config.defaults.position, duration);
    this.broadcastElement(element);

    return elementId;
  }

  /**
   * Create image HUD element
   */
  createImageElement(imageUrl, duration, context) {
    const elementId = `image-${++this.elementIdCounter}`;
    const element = {
      id: elementId,
      type: 'image',
      content: imageUrl,
      username: context.username,
      userId: context.userId,
      timestamp: Date.now(),
      duration: duration * 1000,
      expiresAt: Date.now() + (duration * 1000),
      style: {
        position: this.config.defaults.position,
        maxWidth: this.config.defaults.imageMaxWidth,
        maxHeight: this.config.defaults.imageMaxHeight
      }
    };

    this.activeElements.set(elementId, element);
    this.updateStats('image', this.config.defaults.position, duration);
    this.broadcastElement(element);

    return elementId;
  }

  /**
   * Create media HUD element (gif/mp4)
   */
  createMediaElement(mediaUrl, duration, mediaType, context, label = '') {
    const elementId = `media-${++this.elementIdCounter}`;
    const element = {
      id: elementId,
      type: 'media',
      mediaType: mediaType || this.inferMediaType(mediaUrl),
      content: mediaUrl,
      username: context.username,
      userId: context.userId,
      label: label ? this.sanitizeText(label).substring(0, 80) : '',
      timestamp: Date.now(),
      duration: duration * 1000,
      expiresAt: Date.now() + (duration * 1000),
      style: {
        position: this.config.defaults.position,
        maxWidth: this.config.defaults.mediaMaxWidth,
        maxHeight: this.config.defaults.mediaMaxHeight
      }
    };

    this.activeElements.set(elementId, element);
    this.updateStats('media', this.config.defaults.position, duration);
    this.broadcastElement(element);

    return elementId;
  }

  /**
   * Broadcast HUD element to overlays
   */
  broadcastElement(element) {
    if (this.io) {
      if (this.socketBatcher) {
        this.socketBatcher.emit('gcce:hud:show', element);
      } else {
        this.io.emit('gcce:hud:show', element);
      }
    }
  }

  /**
   * Clear all HUD elements
   */
  clearAllElements() {
    this.activeElements.clear();
    if (this.io) {
      if (this.socketBatcher) {
        this.socketBatcher.emit('gcce:hud:clear', {});
      } else {
        this.io.emit('gcce:hud:clear');
      }
    }
  }

  /**
   * Remove specific HUD element
   */
  removeElement(elementId) {
    const removed = this.activeElements.delete(elementId);
    if (removed && this.io) {
      if (this.socketBatcher) {
        this.socketBatcher.emit('gcce:hud:remove', { id: elementId });
      } else {
        this.io.emit('gcce:hud:remove', { id: elementId });
      }
    }
    return removed;
  }

  /**
   * Get active elements
   */
  getActiveElements() {
    return Array.from(this.activeElements.values());
  }

  /**
   * Get statistics
   */
  getStats() {
    const mostUsedPosition = Object.entries(this.stats.byPosition)
      .sort((a, b) => b[1] - a[1])[0];

    return {
      totalDisplayed: this.stats.totalDisplayed,
      activeCount: this.activeElements.size,
      mostUsedPosition: mostUsedPosition ? mostUsedPosition[0] : 'none',
      averageDuration: this.stats.totalDisplayed > 0
        ? Math.round(this.stats.totalDuration / this.stats.totalDisplayed)
        : 0,
      byType: this.stats.byType,
      byPosition: this.stats.byPosition
    };
  }

  /**
   * Update statistics
   */
  updateStats(type, position, duration) {
    this.stats.totalDisplayed++;
    this.stats.totalDuration += duration;

    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
    this.stats.byPosition[position] = (this.stats.byPosition[position] || 0) + 1;
  }

  /**
   * Sanitize text input
   */
  sanitizeText(text) {
    if (!text) return '';
    return text.replace(/<[^>]*>/g, '').trim();
  }

  /**
   * Validate image URL
   */
  isValidImageUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate media URL (gif/mp4/webm)
   */
  isValidMediaUrl(url) {
    try {
      const parsed = new URL(url);
      const allowed = ['http:', 'https:'];
      const ext = (parsed.pathname || '').toLowerCase();
      const hasAllowedExt = ext.endsWith('.gif') || ext.endsWith('.mp4') || ext.endsWith('.webm');
      return allowed.includes(parsed.protocol) && hasAllowedExt;
    } catch {
      return false;
    }
  }

  /**
   * Infer media type from URL
   * @param {string} url
   * @returns {string}
   */
  inferMediaType(url = '') {
    const lower = url.toLowerCase();
    if (lower.endsWith('.gif')) return 'gif';
    if (lower.endsWith('.mp4') || lower.endsWith('.webm')) return 'video';
    return 'gif';
  }

  /**
   * Find media item by label or id
   * @param {string} key
   * @returns {Object|null}
   */
  findMediaItem(key) {
    if (!key || !Array.isArray(this.config.mediaLibrary)) return null;
    const lower = key.toLowerCase();
    return this.config.mediaLibrary.find(item =>
      item.id?.toLowerCase() === lower ||
      item.label?.toLowerCase() === lower
    ) || null;
  }

  /**
   * Update media library
   * @param {Array} mediaLibrary
   */
  async updateMediaLibrary(mediaLibrary = []) {
    this.config.mediaLibrary = this.normalizeMediaLibrary(mediaLibrary);
    await this.api.setConfig('hud_config', this.config);
    return this.config.mediaLibrary;
  }

  /**
   * Update gift rotator config
   * @param {Object} giftRotator
   */
  async updateGiftRotator(giftRotator = {}) {
    this.config.giftRotator = this.normalizeGiftRotator(giftRotator);
    await this.api.setConfig('hud_config', this.config);
    return this.config.giftRotator;
  }

  /**
   * Get gift rotator config
   */
  getGiftRotator() {
    return this.config.giftRotator;
  }

  /**
   * Get media library
   */
  getMediaLibrary() {
    return this.config.mediaLibrary || [];
  }

  /**
   * Start cleanup timer for expired elements
   */
  startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;

      for (const [id, element] of this.activeElements.entries()) {
        if (now >= element.expiresAt) {
          this.activeElements.delete(id);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.api.log(`[HUD] Cleaned up ${cleaned} expired element(s)`, 'debug');
      }
    }, 5000);
  }

  /**
   * Cleanup and destroy
   */
  async destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clearAllElements();
    this.api.log('[HUD] HUD Manager destroyed', 'info');
  }
}

module.exports = HUDManager;
