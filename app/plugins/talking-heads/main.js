/**
 * Talking Heads Plugin - Main Class
 * Local modular 2D avatars with synchronized animations for TikTok users speaking via TTS
 */

const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Import engines and utilities
const AnimationController = require('./engines/animation-controller');
const AssetSpriteLibrary = require('./engines/asset-sprite-library');
const CacheManager = require('./utils/cache-manager');
const RoleManager = require('./utils/role-manager');
const AvatarLotteryManager = require('./utils/avatar-lottery-manager');

class TalkingHeadsPlugin {
  constructor(api) {
    this.api = api;
    this.logger = api.logger;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    
    // Load configuration
    this.config = this._loadConfig();
    
    // Initialize managers and engines
    this.cacheManager = null;
    this.roleManager = null;
    this.avatarLotteryManager = null;
    this.assetSpriteLibrary = null;
    this.animationController = null;
    this.logBuffer = [];
    this.maxLogEntries = 200;
    
    // TTS event tracking
    this.ttsEventQueue = [];
    this.processingTTS = false;
    
    // Custom voice users (loaded from TTS plugin config)
    this.customVoiceUsers = [];

    // Bridge handlers for TTS playback events
    this.ttsBridgeHandlers = null;
    this.pendingAvatarSpins = new Map();
    this.initialAvatarPlaybackReservations = new Map();
    this.activePlaybackByUser = new Map();
    this.pendingGiftRerolls = new Map();
    this.generatedAssetCleanupTimers = new Set();

    // Viewer presence tracker for Viewer Bar
    this.viewerPresence = new Map(); // userId → { username, sprites, lastSeen, joinedAt }
    this.viewerCleanupInterval = null;
  }

  /**
   * Load plugin configuration from database
   * @returns {object} Configuration object
   * @private
   */
  _loadConfig() {
    const defaultConfig = {
      enabled: false,
      assetPack: 'boba',
      assetCharacter: 'Fox',
      assetOptions: {},
      firstAssignmentEnabled: true,
      rerollGiftEnabled: true,
      rerollGiftId: '',
      rerollGiftNames: ['Go Popular', 'Heart Me', 'Team Heart', 'Team Herz'],
      spinDurationMs: 2600,
      cacheEnabled: true,
      cacheDuration: 2592000000, // 30 days in milliseconds
      obsEnabled: true,
      obsHudEnabled: true,
      spawnAnimationMode: 'standard',
      spawnAnimationUrl: '',
      spawnAnimationVolume: 0.8,
      animationDuration: 5000,
      fadeInDuration: 300,
      fadeOutDuration: 300,
      blinkInterval: 3000,
      rolePermission: 'all',
      minTeamLevel: 0,
      requireSubscriber: false,
      requireCustomVoice: false,
      debugLogging: false, // Enable/disable detailed logging
      // Manual sprite mode
      spriteMode: 'asset-library', // 'asset-library' | 'manual' | 'hybrid'
      manualFallback: true,      // fallback to local assets when no set is assigned
      defaultManualSetId: null,  // default manual set for users without an assigned set
      // Viewer Bar configuration
      viewerBar: {
        enabled: false,
        maxVisibleViewers: 20,
        avatarSize: 64,
        scrollSpeed: 30,
        scrollDirection: 'left',
        popUpDuration: 5000,
        popUpHeight: 150,
        popUpAnimation: 'bounce',
        showChatBubble: true,
        chatBubbleDuration: 4000,
        barPosition: 'bottom',
        barBackground: 'rgba(0,0,0,0.3)',
        barBorderRadius: 12,
        idleBlinkEnabled: true,
        idleBlinkInterval: 3000,
        viewerTimeout: 300000,
        requireAvatar: true,
        fallbackAvatar: 'default',
        showUsername: true,
        pauseScrollOnSpeak: true
      }
    };

    const savedConfig = this.api.getConfig('talking_heads_config');
    const mergedConfig = savedConfig ? { ...defaultConfig, ...savedConfig } : defaultConfig;
    // Deep-merge viewerBar so partial saved configs don't lose defaults
    mergedConfig.viewerBar = { ...defaultConfig.viewerBar, ...(mergedConfig.viewerBar || {}) };
    return this._normalizeAvatarConfig(mergedConfig);
  }

  /**
   * Normalize the current first-assignment and cosmetic reroll configuration.
   * Legacy lottery keys are read once so existing persisted viewer avatars and
   * settings survive the release migration without carrying old UI language.
   * @param {object} config
   * @returns {object}
   * @private
   */
  _normalizeAvatarConfig(config) {
    const defaultGiftNames = ['Go Popular', 'Heart Me', 'Team Heart', 'Team Herz'];
    const hasLegacyEnabled = Object.hasOwn(config, 'avatarLotteryEnabled');
    const hasLegacyGiftId = Object.hasOwn(config, 'lotteryGiftId');
    const hasLegacyGiftNames = Object.hasOwn(config, 'lotteryGiftNames');
    const hasLegacyDuration = Object.hasOwn(config, 'lotteryAnimationDuration');
    const rawGiftNames = hasLegacyGiftNames
      ? config.lotteryGiftNames
      : config.rerollGiftNames;
    const rerollGiftNames = (Array.isArray(rawGiftNames)
      ? rawGiftNames
      : String(rawGiftNames || '').split(','))
      .map((name) => String(name || '').trim().slice(0, 80))
      .filter(Boolean);
    const requestedDuration = Number(hasLegacyDuration
      ? config.lotteryAnimationDuration
      : config.spinDurationMs);
    const {
      avatarLotteryEnabled: _legacyEnabled,
      lotteryGiftId: _legacyGiftId,
      lotteryGiftNames: _legacyGiftNames,
      lotteryAnimationDuration: _legacyDuration,
      ...normalizedConfig
    } = config;

    return {
      ...normalizedConfig,
      firstAssignmentEnabled: hasLegacyEnabled
        ? config.avatarLotteryEnabled !== false
        : config.firstAssignmentEnabled !== false,
      rerollGiftEnabled: hasLegacyEnabled
        ? config.avatarLotteryEnabled !== false
        : config.rerollGiftEnabled !== false,
      rerollGiftId: String((hasLegacyGiftId ? config.lotteryGiftId : config.rerollGiftId) || '')
        .trim()
        .slice(0, 80),
      rerollGiftNames: rerollGiftNames.length ? rerollGiftNames : defaultGiftNames,
      spinDurationMs: Number.isFinite(requestedDuration)
        ? Math.min(10000, Math.max(800, Math.round(requestedDuration)))
        : 2600
    };
  }

  /**
   * Log message with debug level control
   * @param {string} message - Log message
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {object} data - Additional data to log
   * @private
   */
  _log(message, level = 'info', data = null) {
    const prefix = 'TalkingHeads:';
    const fullMessage = `${prefix} ${message}`;
    const entry = {
      level,
      message: fullMessage,
      data: data || null,
      timestamp: new Date().toISOString()
    };

    // Safety check
    if (!this.logger) {
      this._appendLogEntry(entry);
      console.warn('TalkingHeads: Logger not initialized');
      return;
    }
    
    // Always log errors and warnings
    if (level === 'error' || level === 'warn') {
      this._appendLogEntry(entry);
      this.logger[level](fullMessage, data || '');
      return;
    }
    
    // Log info and debug based on debugLogging setting
    // Default to false if config or debugLogging is undefined
    const debugEnabled = this.config && this.config.debugLogging === true;
    if (level === 'debug' && !debugEnabled) {
      return; // Skip debug logs if debugging is disabled
    }
    
    this._appendLogEntry(entry);
    if (data) {
      this.logger[level](fullMessage, data);
    } else {
      this.logger[level](fullMessage);
    }
  }

  /**
   * Append log entry to in-memory buffer for UI consumption
   * @param {{level: string, message: string, data?: object, timestamp: string}} entry
   * @private
   */
  _appendLogEntry(entry) {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxLogEntries) {
      this.logBuffer.shift();
    }
  }

  /**
   * Convert absolute sprite paths to relative URLs for overlays/HUD
   * @param {object} sprites
   * @returns {object}
   * @private
   */
  _getRelativeSpritePaths(sprites) {
    const relativeSprites = {};
    Object.entries(sprites || {}).forEach(([key, value]) => {
      if (value) {
        const filename = value.split(/[\\/]/).pop();
        // Sanitize filename: only allow alphanumeric, underscore, dash, and dot
        const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        relativeSprites[key] = `/api/talkingheads/sprite/${encodeURIComponent(safeFilename)}`;
      }
    });
    return relativeSprites;
  }

  /**
   * Convert absolute manual sprite paths to relative URLs using the manual-sprite route
   * @param {string} setId - Set identifier
   * @param {object} sprites - Absolute file paths
   * @returns {object} Relative URL paths
   * @private
   */
  _getManualRelativeSpritePaths(setId, sprites) {
    const safeSetId = encodeURIComponent(setId);
    const relativeSprites = {};
    Object.entries(sprites || {}).forEach(([key, value]) => {
      if (value) {
        const filename = path.basename(value);
        const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        relativeSprites[key] = `/api/talkingheads/manual-sprite/${safeSetId}/${encodeURIComponent(safeFilename)}`;
      }
    });
    return relativeSprites;
  }

  /**
   * Return an avatar already owned by this viewer that the normal renderer can
   * use without creating a first-voice assignment. Manual assignments and a
   * configured default manual set only participate in manual or hybrid mode,
   * matching _handleTTSEvent.
   * @param {string} userId
   * @returns {object|null}
   * @private
   */
  _getExistingCachedAvatar(userId) {
    if (!userId || !this.cacheManager) return null;

    const spriteMode = this.config.spriteMode || 'auto';
    if (spriteMode === 'manual' || spriteMode === 'hybrid') {
      const manualStyleKey = this._getManualStyleKeyForUser(userId);
      if (manualStyleKey && typeof this.cacheManager.getAvatar === 'function') {
        const manualAvatar = this.cacheManager.getAvatar(userId, manualStyleKey);
        if (manualAvatar) return manualAvatar;
      }

      if (this.config.defaultManualSetId && typeof this.cacheManager.getManualSet === 'function') {
        const defaultSet = this.cacheManager.getManualSet(this.config.defaultManualSetId);
        if (defaultSet?.sprites) return defaultSet;
      }
    }

    return typeof this.cacheManager.getAvatar === 'function'
      ? this.cacheManager.getAvatar(userId, 'asset-library')
      : null;
  }

  _ensureAssetSpriteLibrary() {
    if (!this.assetSpriteLibrary) {
      this.assetSpriteLibrary = new AssetSpriteLibrary({
        dataDir: this.api.getPluginDataDir(),
        logger: this.logger,
        generatedAssetRegistry: this.cacheManager
      });
    }
    return this.assetSpriteLibrary;
  }

  _resolveViewerIdentity(data = {}) {
    const rawUserId = String(data.userId || data.user_id || '').trim();
    const rawUniqueId = String(data.uniqueId || data.unique_id || '').trim();
    const rawUsername = String(data.username || '').trim();
    const rawNickname = String(data.nickname || '').trim();
    const handle = rawUserId && !/^\d+$/.test(rawUserId)
      ? rawUserId
      : (rawUniqueId || rawUsername || rawUserId);
    if (!handle) return null;
    return {
      userId: handle.slice(0, 128),
      username: (rawUniqueId || rawUsername || rawNickname || handle).slice(0, 128)
    };
  }

  _playbackAssetOwnerId(playbackId) {
    const normalizedPlaybackId = String(playbackId || '').trim();
    return normalizedPlaybackId ? `playback:${normalizedPlaybackId}` : null;
  }

  _getActiveGeneratedAssetOwnerIds() {
    return [...new Set([
      ...this.activePlaybackByUser.values(),
      ...this.initialAvatarPlaybackReservations.values()
    ].map(playbackId => this._playbackAssetOwnerId(playbackId)).filter(Boolean))];
  }

  _scheduleGeneratedAssetRelease(ownerId, delayMs) {
    if (!ownerId || !this.cacheManager?.releaseGeneratedAssetOwner) return;
    const timer = setTimeout(() => {
      this.generatedAssetCleanupTimers.delete(timer);
      this.cacheManager.releaseGeneratedAssetOwner(ownerId).catch((error) => {
        this.logger.warn(`TalkingHeads: Generated asset cleanup failed for ${ownerId}`, error);
      });
    }, Math.max(0, Number(delayMs) || 0));
    timer.unref?.();
    this.generatedAssetCleanupTimers.add(timer);
  }

  /**
   * Resolve the configured local selection into a shared five-frame sprite set.
   * The files are materialized once per selection in the plugin data directory.
   * @private
   */
  async _getConfiguredAssetAvatar(userId, username, selection = {}, assetUse = {}) {
    const assetSpriteLibrary = this._ensureAssetSpriteLibrary();
    const ownerId = assetUse.ownerId || `ephemeral:${this._createSpinId()}`;
    const expiresAt = Number.isFinite(Number(assetUse.expiresAt))
      ? Number(assetUse.expiresAt)
      : Date.now() + 10 * 60 * 1000;
    const spriteSet = await assetSpriteLibrary.getSpriteSet({
      packId: selection.assetPack || selection.packId || this.config.assetPack,
      characterId: selection.assetCharacter || selection.characterId || this.config.assetCharacter,
      options: {
        ...(this.config.assetOptions || {}),
        ...(selection.assetOptions || selection.options || {})
      }
    }, {
      ownerId,
      expiresAt,
      frameNames: assetUse.frameNames
    });

    return {
      userId,
      username,
      styleKey: `asset:${spriteSet.packId}:${spriteSet.characterId}`,
      assetSelection: {
        packId: spriteSet.packId,
        characterId: spriteSet.characterId,
        options: spriteSet.options
      },
      sprites: spriteSet.sprites
    };
  }

  /**
   * Resolve or create the persistent automatic avatar assignment used by TTS.
   * Manual and cached legacy avatars are resolved by their existing paths before
   * this primitive is asked to create a new assignment.
   * @param {{userId: string, username: string, hasAssignedVoice: boolean}} input
   * @returns {{created: boolean, selection: object|null, reason: string, assignment?: object}}
   */
  prepareAvatarAssignment({ userId, username, hasAssignedVoice } = {}) {
    const identity = this._resolveViewerIdentity({ userId, username });
    if (!identity || !this.avatarLotteryManager) {
      return { created: false, selection: null, reason: 'unavailable' };
    }

    const existing = this.avatarLotteryManager.getAssignment(identity.userId);
    if (existing?.selection) {
      return {
        created: false,
        selection: existing.selection,
        reason: 'existing',
        assignment: existing
      };
    }

    if (hasAssignedVoice !== true) {
      return { created: false, selection: null, reason: 'voice-not-assigned' };
    }

    if (this.config.firstAssignmentEnabled === false || this.config.avatarLotteryEnabled === false) {
      return { created: false, selection: null, reason: 'first-assignment-disabled' };
    }

    const selection = this._ensureAssetSpriteLibrary().getRandomSelection();
    const assignment = this.avatarLotteryManager.assign(identity.userId, identity.username, selection);
    this._log(`Assigned ${selection.packId}/${selection.characterId} to ${identity.username}`, 'info');
    return {
      created: true,
      selection,
      reason: 'assigned-voice',
      assignment
    };
  }

  _createSpinId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return crypto.randomBytes(16).toString('hex');
  }

  async _emitAvatarSpin({
    userId,
    username,
    playbackId,
    winnerSelection,
    reason = 'initial-assignment',
    preview = false
  } = {}) {
    if (!userId || !winnerSelection || !this.assetSpriteLibrary) return null;
    const legacyDuration = Number(this.config.lotteryAnimationDuration);
    const duration = Number.isFinite(legacyDuration)
      ? legacyDuration
      : this.config.spinDurationMs || 2600;
    const spinId = this._createSpinId();
    const revealLifetimeMs = Math.max(1, Number(duration) || 2600) + 5500;
    const candidateOwnerId = `spin:${spinId}:candidates`;
    const winnerOwnerId = reason === 'initial-assignment' && playbackId
      ? this._playbackAssetOwnerId(playbackId)
      : `spin:${spinId}:winner`;
    const candidateExpiresAt = Date.now() + revealLifetimeMs;
    const winnerExpiresAt = reason === 'initial-assignment'
      ? Date.now() + 60 * 60 * 1000
      : candidateExpiresAt;
    const candidates = this.assetSpriteLibrary.getLotteryCandidates(
      3,
      Math.random,
      [winnerSelection]
    );
    let winnerSpriteSet;
    let candidateCards;
    try {
      [winnerSpriteSet, candidateCards] = await Promise.all([
        this.assetSpriteLibrary.getSpriteSet(winnerSelection, {
          ownerId: winnerOwnerId,
          expiresAt: winnerExpiresAt
        }),
        Promise.all(candidates.map(async (selection) => {
          const spriteSet = await this.assetSpriteLibrary.getSpriteSet(selection, {
            ownerId: candidateOwnerId,
            expiresAt: candidateExpiresAt,
            frameNames: ['idle_neutral']
          });
          const sprites = this._getRelativeSpritePaths(spriteSet.sprites);
          return {
            selection,
            spriteUrl: sprites.idle_neutral,
            sprites
          };
        }))
      ]);
    } catch (error) {
      await Promise.allSettled([
        this.cacheManager?.releaseGeneratedAssetOwner?.(candidateOwnerId),
        this.cacheManager?.releaseGeneratedAssetOwner?.(winnerOwnerId)
      ].filter(Boolean));
      throw error;
    }
    const payload = {
      spinId,
      playbackId: String(playbackId || ''),
      userId,
      username: username || userId,
      reason,
      duration,
      preview: preview === true,
      candidates: candidateCards,
      winner: {
        selection: winnerSelection,
        sprites: this._getRelativeSpritePaths(winnerSpriteSet.sprites)
      }
    };
    this.io.emit('talkingheads:avatar:spin:start', payload);
    this._scheduleGeneratedAssetRelease(candidateOwnerId, revealLifetimeMs);
    if (reason !== 'initial-assignment') {
      this._scheduleGeneratedAssetRelease(winnerOwnerId, revealLifetimeMs);
    }
    return payload;
  }

  _waitForAvatarSpin(payload, preparation) {
    const playbackId = String(payload?.playbackId || '').trim();
    if (!playbackId) {
      return Promise.resolve({ ...preparation, spinStatus: 'untracked' });
    }

    const existing = this.pendingAvatarSpins.get(playbackId);
    if (existing) return existing.promise;

    const timeoutMs = Math.max(0, Number(payload.duration) || 0) + 500;
    const createdAt = Date.now();
    let timer = null;
    const pending = {
      userId: payload.userId,
      spinId: payload.spinId,
      reason: payload.reason,
      duration: payload.duration,
      createdAt,
      revealAt: createdAt + Math.max(0, Number(payload.duration) || 0),
      promise: null,
      resolve: null,
      timer: null
    };
    pending.promise = new Promise((resolve) => {
      pending.resolve = resolve;
      timer = setTimeout(() => {
        if (this.pendingAvatarSpins.get(playbackId) !== pending) return;
        this.pendingAvatarSpins.delete(playbackId);
        resolve({ ...preparation, spinStatus: 'timeout' });
      }, timeoutMs);
      pending.timer = timer;
    });
    this.pendingAvatarSpins.set(playbackId, pending);
    return pending.promise;
  }

  _hasPendingAvatarSpinForUser(userId) {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return false;
    return Array.from(this.pendingAvatarSpins.values()).some((pending) => (
      String(pending?.userId || '').trim() === normalizedUserId
    ));
  }

  _reserveInitialAvatarPlayback(userId, playbackId) {
    const normalizedUserId = String(userId || '').trim();
    const normalizedPlaybackId = String(playbackId || '').trim();
    if (!normalizedUserId || !normalizedPlaybackId) return false;
    this.initialAvatarPlaybackReservations.set(normalizedUserId, normalizedPlaybackId);
    return true;
  }

  _hasInitialAvatarPlaybackReservation(userId) {
    const normalizedUserId = String(userId || '').trim();
    return Boolean(normalizedUserId && this.initialAvatarPlaybackReservations.has(normalizedUserId));
  }

  _completeAvatarSpin(data = {}) {
    const playbackId = String(data.playbackId || '').trim();
    const pending = this.pendingAvatarSpins.get(playbackId);
    if (!pending) return false;
    if (!data.userId || String(data.userId) !== String(pending.userId)) return false;
    if (!data.spinId || String(data.spinId) !== String(pending.spinId)) return false;
    if (Date.now() < pending.revealAt) return false;
    if (pending.timer) clearTimeout(pending.timer);
    this.pendingAvatarSpins.delete(playbackId);
    pending.resolve({ created: true, spinStatus: 'complete' });
    return true;
  }

  _cancelPendingAvatarSpins() {
    this.pendingAvatarSpins.forEach((pending) => {
      if (pending.timer) clearTimeout(pending.timer);
      pending.resolve?.({ created: false, spinStatus: 'cancelled' });
    });
    this.pendingAvatarSpins.clear();
  }

  _getStreamDirectorStatus() {
    const activeSpeaker = Array.from(this.activePlaybackByUser.entries())
      .map(([userId, playbackId]) => ({ userId, playbackId }))
      .at(0) || null;
    const [spinPlaybackId, pendingSpin] = Array.from(this.pendingAvatarSpins.entries()).at(0) || [];

    return {
      enabled: this.config.enabled === true,
      assetPack: this.config.assetPack || 'boba',
      activeSpeaker,
      activeSpin: pendingSpin ? {
        playbackId: spinPlaybackId,
        userId: pendingSpin.userId,
        spinId: pendingSpin.spinId,
        reason: pendingSpin.reason || null,
        duration: pendingSpin.duration || null
      } : null,
      rendererBridge: {
        available: Boolean(this.ttsBridgeHandlers),
        activePlaybackCount: this.activePlaybackByUser.size,
        state: this.activePlaybackByUser.size > 0
          ? 'playing'
          : this.ttsBridgeHandlers ? 'ready' : 'unavailable'
      }
    };
  }

  /**
   * TTS calls this before audio dispatch. The selection is persisted by the
   * assignment primitive before the presentation spin starts, so an absent
   * overlay can never lose the definitive avatar result.
   */
  async prepareAvatarForPlayback(meta = {}) {
    if (!this.config.enabled) {
      return { created: false, reason: 'disabled' };
    }

    // The TTS gate runs before renderer:start. Existing manual and legacy
    // cache avatars therefore have to be recognized here, otherwise this
    // first-voice path would persist and reveal a replacement automatic avatar.
    const identity = this._resolveViewerIdentity(meta);
    if (!identity) {
      return { created: false, reason: 'unavailable' };
    }

    if (this._getExistingCachedAvatar(identity.userId)) {
      return { created: false, reason: 'existing-cache-avatar' };
    }

    const preparation = this.prepareAvatarAssignment({
      userId: identity.userId,
      username: identity.username,
      hasAssignedVoice: meta.hasAssignedVoice === true
    });
    if (!preparation.created) return preparation;

    const playbackId = String(meta.playbackId || meta.id || '').trim();
    this._reserveInitialAvatarPlayback(identity.userId, playbackId);

    const payload = await this._emitAvatarSpin({
      userId: identity.userId,
      username: identity.username,
      playbackId,
      winnerSelection: preparation.selection,
      reason: 'initial-assignment'
    });
    if (!payload) return { ...preparation, spinStatus: 'unavailable' };
    return this._waitForAvatarSpin(payload, preparation);
  }

  /**
   * Register the TikTok events used by the gift avatar lottery.
   * @private
   */
  _registerAvatarLotteryEvents() {
    this.api.registerTikTokEvent('gift', async (data) => {
      try {
        await this._handleLotteryGift(data || {});
      } catch (error) {
        this.logger.error('TalkingHeads: Avatar lottery gift event failed', error);
      }
    });
  }

  /**
   * Check whether a TikTok gift is configured as the avatar lottery trigger.
   * A configured gift ID always takes precedence over the fallback names.
   * @param {object} data
   * @returns {boolean}
   * @private
   */
  _isLotteryGift(data = {}) {
    if (this.config.rerollGiftEnabled === false || this.config.avatarLotteryEnabled === false) return false;

    const configuredGiftId = String(
      this.config.rerollGiftId || this.config.lotteryGiftId || ''
    ).trim();
    if (configuredGiftId) {
      const receivedGiftId = String(data.giftId || data.gift_id || data.id || '').trim();
      return receivedGiftId === configuredGiftId;
    }

    const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const receivedName = normalizeName(data.giftName || data.gift_name || data.name);
    if (!receivedName) return false;
    const configuredNames = this.config.rerollGiftNames || this.config.lotteryGiftNames || [];
    return configuredNames.some((giftName) => normalizeName(giftName) === receivedName);
  }

  /**
   * Extract the stable TikTok identity used for a lottery record.
   * @param {object} data
   * @returns {{userId: string, username: string}|null}
   * @private
   */
  _getLotteryUser(data = {}) {
    return this._resolveViewerIdentity(data);
  }

  /**
   * Reroll and publish one local avatar result for an existing assignment.
   * @param {object} data
   * @returns {Promise<boolean>}
   * @private
   */
  async _handleLotteryGift(data = {}) {
    if (!this._isLotteryGift(data) || !this.avatarLotteryManager) return false;
    const user = this._getLotteryUser(data);
    if (!user) return false;

    const currentAssignment = this.avatarLotteryManager.getAssignment(user.userId);
    if (!currentAssignment?.selection) return false;

    // A cosmetic reroll must never swap the portrait underneath an actively
    // speaking avatar or while its first persisted assignment is revealing.
    // Keep just the latest configured gift for this viewer and run it after
    // the renderer terminal event.
    if (
      this.activePlaybackByUser.has(user.userId)
      || this._hasPendingAvatarSpinForUser(user.userId)
      || this._hasInitialAvatarPlaybackReservation(user.userId)
    ) {
      this.pendingGiftRerolls.set(user.userId, data);
      this._log(`Avatar reroll deferred until ${user.username} finishes speaking or revealing`, 'debug');
      return true;
    }

    this._ensureAssetSpriteLibrary();

    const winnerSelection = this.assetSpriteLibrary.getRandomSelection(Math.random, currentAssignment.selection);
    const assignment = this.avatarLotteryManager.reroll(user.userId, user.username, winnerSelection);
    if (!assignment) return false;
    const spin = await this._emitAvatarSpin({
      userId: user.userId,
      username: user.username,
      playbackId: `gift-reroll-${Date.now()}-${user.userId}`,
      winnerSelection,
      reason: 'gift-reroll'
    });
    if (!spin) return false;
    this._log(`Avatar reroll: drew ${winnerSelection.packId}/${winnerSelection.characterId} for ${user.username}`, 'info');
    return true;
  }

  /**
   * Slugify a set name to produce a safe setId
   * @param {string} name
   * @returns {string}
   * @private
   */
  _slugifySetId(name) {
    return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  }

  /**
   * Emit spawn animation event for new avatars
   * @param {string} userId
   * @param {string} username
   * @param {object} sprites
   * @private
   */
  _emitSpawnAnimation(userId, username, sprites) {
    const volume = typeof this.config.spawnAnimationVolume === 'number'
      ? Math.min(1, Math.max(0, this.config.spawnAnimationVolume))
      : 0.8;

    this.io.emit('talkingheads:avatar:spawn', {
      userId,
      username,
      sprites: this._getRelativeSpritePaths(sprites),
      mode: this.config.spawnAnimationMode || 'standard',
      customMediaUrl: this.config.spawnAnimationUrl || '',
      volume
    });
  }

  /**
   * Return recent log entries
   * @param {number} limit
   * @returns {Array}
   * @private
   */
  _getRecentLogs(limit = 100) {
    const startIndex = Math.max(0, this.logBuffer.length - limit);
    return this.logBuffer.slice(startIndex);
  }

  /**
   * Sanitize user input to prevent XSS and injection attacks
   * @param {any} input - Input to sanitize
   * @param {string} type - Type of sanitization to apply
   * @returns {any} Sanitized input
   * @private
   */
  _sanitizeInput(input, type) {
    if (input === null || input === undefined) {
      return input;
    }

    switch (type) {
      case 'userId':
        // Only alphanumeric, underscore, dash - max 64 chars
        return String(input).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      
      case 'username':
        // Remove HTML special characters, max 50 chars
        return String(input).replace(/[<>'"&]/g, '').slice(0, 50);
      
      case 'styleKey':
        return String(input).replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 96);
      
      case 'url':
        // Validate URL format and ensure HTTPS only
        try {
          const url = new URL(String(input));
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
          }
          return url.href;
        } catch {
          return null;
        }
      
      default:
        return input;
    }
  }

  /**
   * Save configuration to database
   * @param {object} newConfig - Configuration to save
   * @private
   */
  _saveConfig(newConfig) {
    try {
      const oldDebugLogging = this.config ? this.config.debugLogging : false;
      this.config = this._normalizeAvatarConfig({ ...this.config, ...newConfig });
      this.config.spawnAnimationMode = this.config.spawnAnimationMode || 'standard';
      this.config.spawnAnimationUrl = this.config.spawnAnimationUrl || '';
      if (typeof this.config.spawnAnimationVolume === 'number') {
        this.config.spawnAnimationVolume = Math.min(1, Math.max(0, this.config.spawnAnimationVolume));
      } else {
        this.config.spawnAnimationVolume = 0.8;
      }
      this.api.setConfig('talking_heads_config', this.config);
      
      // Log configuration change
      this._log('Configuration saved', 'info');
      
      // If debug logging was toggled, log the change
      if (oldDebugLogging !== this.config.debugLogging) {
        this._log(`Debug logging ${this.config.debugLogging ? 'ENABLED' : 'DISABLED'}`, 'info');
      }
      
      // Log other important config changes
      if (this.config.debugLogging) {
        this._log('Config updated', 'debug', {
          enabled: this.config.enabled,
          assetPack: this.config.assetPack,
          assetCharacter: this.config.assetCharacter,
          rolePermission: this.config.rolePermission,
          cacheEnabled: this.config.cacheEnabled,
          debugLogging: this.config.debugLogging
        });
      }
    } catch (error) {
      // If logging fails, use basic logger
      if (this.logger) {
        this.logger.error('TalkingHeads: Failed to save config internally', error);
      }
      throw error; // Re-throw to be caught by the route handler
    }
  }

  /**
   * Initialize plugin
   */
  async init() {
    try {
      this._log('Initializing plugin...', 'info');
      this._log(`Debug logging: ${this.config.debugLogging ? 'ENABLED' : 'DISABLED'}`, 'info');

      // Ensure plugin data directory exists
      const pluginDataDir = this.api.getPluginDataDir();
      this._log(`Plugin data directory: ${pluginDataDir}`, 'debug');
      await this.api.ensurePluginDataDir();

      // Initialize cache manager
      this._log('Initializing cache manager...', 'debug');
      this.cacheManager = new CacheManager(pluginDataDir, this.db, this.logger, this.config);
      await this.cacheManager.init();
      await this.cacheManager.cleanupGeneratedAssets();
      this._log('Cache manager initialized', 'debug');

      // Initialize role manager
      this._log('Initializing role manager...', 'debug');
      this.roleManager = new RoleManager(this.config, this.logger);
      this._log(`Role permission: ${this.config.rolePermission}`, 'debug');

      this.avatarLotteryManager = new AvatarLotteryManager(this.db, this.logger);
      this.avatarLotteryManager.init();
      this._log('Avatar lottery manager initialized', 'debug');

      // Local packs are composed on demand into the plugin data directory.
      this._ensureAssetSpriteLibrary();
      this._log('Local asset sprite library initialized', 'debug');

      // Initialize animation controller
      this._log('Initializing animation controller...', 'debug');
      this.animationController = new AnimationController(
        this.io,
        this.logger,
        this.config,
        null // OBS WebSocket integration can be added later
      );
      this._log('Animation controller initialized', 'debug');

    // Register API routes
    this._log('Registering API routes...', 'debug');
    this._registerRoutes();

    // Register socket events
      this._log('Registering socket events...', 'debug');
      this._registerSocketEvents();

    // Register TTS event listener
    this._log('Registering TTS event listeners...', 'debug');
    this._registerTTSEvents();

    // Bridge playback events from TTS plugin so avatars follow speech
    this._registerPlaybackBridge();

    // Register configured gifts that reroll existing avatar assignments.
    this._registerAvatarLotteryEvents();

    // Register Viewer Bar TikTok events
    this._log('Registering viewer bar events...', 'debug');
    this._registerViewerBarEvents();

    // Load custom voice users from TTS plugin
    this._log('Loading custom voice users...', 'debug');
    this._loadCustomVoiceUsers();

      // Start cache cleanup interval (once per day)
      this._startCacheCleanup();

      this.logger.info('TalkingHeads: ✅ Plugin initialized successfully');

    } catch (error) {
      this.logger.error('TalkingHeads: Failed to initialize plugin', error);
      throw error;
    }
  }

  /**
   * Register API routes
   * @private
   */
  _registerRoutes() {
    // Serve overlay and OBS HUD
    this.api.registerRoute('get', '/talking-heads/overlay', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay.html'));
    });

    this.api.registerRoute('get', '/talking-heads/obs-hud', (req, res) => {
      res.sendFile(path.join(__dirname, 'obs-hud.html'));
    });

    const assetsDir = path.join(__dirname, 'assets');
    this.api.registerRoute('get', '/talking-heads/assets/:filename', (req, res) => {
      const safeFilename = path.basename(req.params.filename || '');
      res.sendFile(path.join(assetsDir, safeFilename));
    });

    // OBS overlay aliases (stream overlay namespace)
    this.api.registerRoute('get', '/overlay/talking-heads', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay.html'));
    });

    this.api.registerRoute('get', '/overlay/talking-heads/obs-hud', (req, res) => {
      res.sendFile(path.join(__dirname, 'obs-hud.html'));
    });

    this.api.registerRoute('get', '/overlay/talking-heads/assets/:filename', (req, res) => {
      const safeFilename = path.basename(req.params.filename || '');
      res.sendFile(path.join(assetsDir, safeFilename));
    });

    this.api.registerRoute('get', '/api/talkingheads/overlay/translations/:locale', (req, res) => {
      const locale = String(req.params.locale || '').trim().toLowerCase();
      if (!['de', 'en', 'es', 'fr'].includes(locale)) {
        return res.status(404).json({ success: false, error: 'Locale not found' });
      }
      return res.json(require(path.join(__dirname, 'locales', `${locale}.json`)));
    });

    // Stream Director health is intentionally local-only. It omits message
    // text and audio data, exposing only the render bridge state needed by
    // the dashboard surface.
    this.api.registerRoute('get', '/api/talkingheads/status', (req, res) => {
      res.json({ success: true, status: this._getStreamDirectorStatus() });
    });

    // This preview never creates an assignment, triggers TTS, or imitates a
    // gift. It exists solely to check the Broadcast Arcade overlay pipeline.
    this.api.registerRoute('post', '/api/talkingheads/test-spin', async (req, res) => {
      try {
        this._ensureAssetSpriteLibrary();
        const playbackId = `preview-spin-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
        const winnerSelection = this.assetSpriteLibrary.getRandomSelection();
        const spin = await this._emitAvatarSpin({
          userId: 'talking-heads-preview',
          username: 'Character Lab',
          playbackId,
          winnerSelection,
          reason: 'preview',
          preview: true
        });
        if (!spin) {
          return res.status(503).json({ success: false, error: 'Avatar preview is unavailable' });
        }
        return res.json({
          success: true,
          preview: true,
          spin: {
            preview: true,
            playbackId: spin.playbackId,
            spinId: spin.spinId,
            duration: spin.duration
          }
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Test spin failed', error);
        return res.status(500).json({ success: false, error: 'Test spin failed' });
      }
    });

    // Local dashboard recovery action. It deliberately reuses the configured
    // gift path so persistence, no-repeat selection, speaking deferral, and
    // the OBS spin stay identical to a real TikTok reroll.
    this.api.registerRoute('post', '/api/talkingheads/avatar-reroll', async (req, res) => {
      try {
        const identity = this._resolveViewerIdentity(req.body || {});
        if (!identity) {
          return res.status(400).json({ success: false, error: 'Missing or invalid userId and username' });
        }
        const requestedUserId = identity.userId;
        const username = identity.username;

        const configuredGiftId = String(
          this.config.rerollGiftId || this.config.lotteryGiftId || ''
        ).trim();
        const configuredGiftName = !configuredGiftId
          ? (this.config.rerollGiftNames || this.config.lotteryGiftNames || [])
            .map((name) => String(name || '').trim())
            .find(Boolean)
          : '';
        if (!configuredGiftId && !configuredGiftName) {
          return res.status(409).json({ success: false, error: 'No avatar reroll gift is configured' });
        }

        const rerolled = await this._handleLotteryGift({
          userId: requestedUserId,
          uniqueId: username,
          username,
          ...(configuredGiftId ? { giftId: configuredGiftId } : { giftName: configuredGiftName })
        });
        if (!rerolled) {
          return res.status(409).json({
            success: false,
            error: 'No eligible persistent avatar assignment is available for this viewer'
          });
        }

        return res.json({ success: true, userId: requestedUserId, username });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual avatar reroll failed', error);
        return res.status(500).json({ success: false, error: 'Manual avatar reroll failed' });
      }
    });

    // Get configuration
    this.api.registerRoute('get', '/api/talkingheads/config', (req, res) => {
      res.json({
        success: true,
        config: this.config,
        assetCatalog: this.assetSpriteLibrary.getCatalog(),
        generationMode: 'asset-library'
      });
    });

    // Update configuration
    this.api.registerRoute('post', '/api/talkingheads/config', (req, res) => {
      try {
        // Shallow copy to avoid mutating Express request body
        const newConfig = { ...req.body };
        
        const selection = this.assetSpriteLibrary.normalizeSelection({
          packId: newConfig.assetPack ?? this.config.assetPack,
          characterId: newConfig.assetCharacter ?? this.config.assetCharacter,
          options: newConfig.assetOptions ?? this.config.assetOptions
        });
        newConfig.assetPack = selection.packId;
        newConfig.assetCharacter = selection.characterId;
        newConfig.assetOptions = selection.options;

        if (newConfig.spawnAnimationVolume !== undefined) {
          newConfig.spawnAnimationVolume = parseFloat(newConfig.spawnAnimationVolume);
        }
        
        this._saveConfig(newConfig);

        // Update managers with new config
        if (this.roleManager) {
          this.roleManager.updateConfig(this.config);
        }

        res.json({ 
          success: true, 
          config: this.config,
          assetCatalog: this.assetSpriteLibrary.getCatalog(),
          generationMode: 'asset-library'
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to save config', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get cache statistics
    this.api.registerRoute('get', '/api/talkingheads/cache/stats', (req, res) => {
      try {
        const stats = this.cacheManager.getStats();
        res.json({ success: true, stats });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('get', '/api/talkingheads/cache/list', (req, res) => {
      try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const entries = this.cacheManager.listAvatars(limit);
        const avatars = entries.map((entry) => ({
          ...entry,
          sprites: this._getRelativeSpritePaths(entry.sprites)
        }));
        res.json({ success: true, avatars });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear cache
    this.api.registerRoute('post', '/api/talkingheads/cache/clear', async (req, res) => {
      try {
        const deleted = await this.cacheManager.clearAllCache(
          this._getActiveGeneratedAssetOwnerIds()
        );
        res.json({ success: true, deleted });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Export sprites as ZIP
    this.api.registerRoute('get', '/api/talkingheads/export/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        
        if (!sanitizedUserId) {
          return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        // Get cached avatar
        const cached = this.cacheManager.getAvatar(sanitizedUserId, 'asset-library');
        
        if (!cached) {
          return res.status(404).json({ success: false, error: 'Avatar not found in cache' });
        }

        this._log(`Exporting sprites for user ${cached.username}`, 'info');

        const archiver = require('archiver');
        const fs = require('fs');
        
        // Create archive
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });

        // Set response headers
        const safeUsername = cached.username.replace(/[^a-zA-Z0-9]/g, '_');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeUsername}_sprites.zip"`);
        
        // Pipe archive to response
        archive.pipe(res);

        // Add sprite files to archive
        let filesAdded = 0;
        for (const [frameName, spritePath] of Object.entries(cached.sprites)) {
          if (spritePath && fs.existsSync(spritePath)) {
            archive.file(spritePath, { name: `${frameName}.png` });
            filesAdded++;
          }
        }

        // Add avatar file if exists
        if (cached.avatarPath && fs.existsSync(cached.avatarPath)) {
          archive.file(cached.avatarPath, { name: 'avatar_full.png' });
          filesAdded++;
        }

        if (filesAdded === 0) {
          archive.abort();
          return res.status(404).json({ success: false, error: 'No sprite files found' });
        }

        // Finalize archive
        await archive.finalize();
        
        this._log(`Exported ${filesAdded} files for ${cached.username}`, 'info');
      } catch (error) {
        this.logger.error('TalkingHeads: Sprite export failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Verify that local assets can be selected and materialized.
    this.api.registerRoute('post', '/api/talkingheads/test-api', async (req, res) => {
      try {
        const avatar = await this._getConfiguredAssetAvatar('asset_check', 'Asset Check');
        res.json({
          success: true,
          message: 'Local asset library is ready',
          assetSelection: avatar.assetSelection,
          sprites: avatar.sprites
        });
      } catch (error) {
        this._log(`Local asset check failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message || 'Local asset check failed' });
      }
    });

    // Test local sprite materialization.
    this.api.registerRoute('post', '/api/talkingheads/test-generate', async (req, res) => {
      try {
        const result = await this._getConfiguredAssetAvatar(
          `asset_test_${Date.now()}`,
          'Asset Test',
          req.body || {}
        );

        res.json({ 
          success: true, 
          message: 'Local asset sprites prepared successfully',
          sprites: result.sprites ? Object.keys(result.sprites).length : 0,
          spriteUrls: result.sprites,
          assetSelection: result.assetSelection
        });
      } catch (error) {
        this._log(`Local sprite test failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message || 'Local sprite test failed' });
      }
    });

    // Talking Heads + TTS preview using local engine
    this.api.registerRoute('post', '/api/talkingheads/preview-tts', async (req, res) => {
      try {
        const ttsPlugin = this.api.pluginLoader?.getPluginInstance('tts');
        if (!ttsPlugin || typeof ttsPlugin.speak !== 'function') {
          return res.status(503).json({ success: false, error: 'TTS plugin is not available' });
        }

        const previewText = (req.body && req.body.text) || 'Hallo! Dies ist eine Talking Heads Vorschau.';
        const previewUserId = (req.body && req.body.userId) || 'talkingheads_preview';
        const previewUsername = (req.body && req.body.username) || 'TalkingHeads Preview';

        const assetAvatar = await this._getConfiguredAssetAvatar(
          previewUserId,
          previewUsername,
          req.body || {}
        );

        // Now play TTS with the avatar
        this._log('Calling TTS speak for preview...', 'info');
        const speakResult = await ttsPlugin.speak({
          text: previewText,
          userId: previewUserId,
          username: previewUsername,
          source: 'talking-heads-preview',
          engine: ttsPlugin.config?.defaultEngine || undefined,
          priority: 0
        });

        // Check if TTS was successful
        if (speakResult && speakResult.success === false) {
          this._log(`TTS preview failed: ${speakResult.error || speakResult.reason || 'Unknown error'}`, 'warn', speakResult);
          
          // Return error with helpful message
          return res.status(400).json({
            success: false,
            error: speakResult.error || 'TTS konnte nicht gestartet werden',
            reason: speakResult.reason,
            blocked: speakResult.blocked,
            details: speakResult.reason === 'tts_disabled' 
              ? 'TTS ist über Quick Actions deaktiviert. Bitte aktivieren Sie TTS in den Quick Actions oder Einstellungen.'
              : undefined
          });
        }

        this._log('TTS preview started successfully', 'info', { queueId: speakResult?.id });
        
        res.json({ 
          success: true, 
          result: speakResult,
          assetSelection: assetAvatar.assetSelection
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Preview TTS failed', error);
        res.status(500).json({ success: false, error: error.message || 'Preview failed' });
      }
    });

    // Assign the selected local asset set to a user for immediate preview.
    this.api.registerRoute('post', '/api/talkingheads/generate', async (req, res) => {
      try {
        const { userId, username } = req.body;

        if (!userId || !username) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');

        if (!sanitizedUserId || !sanitizedUsername) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        const result = await this._getConfiguredAssetAvatar(sanitizedUserId, sanitizedUsername, req.body);

        // Emit socket event to notify UI of new avatar
        this.io.emit('talkingheads:avatar:generated', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: result.styleKey,
          sprites: this._getRelativeSpritePaths(result.sprites)
        });

        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual generation failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get users from stream database for assignment
    this.api.registerRoute('get', '/api/talkingheads/users', (req, res) => {
      try {
        // Validate and limit the number of users to prevent DoS
        const requestedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(requestedLimit) 
          ? 1000 
          : Math.min(Math.max(requestedLimit, 1), 5000);
        
        const filter = req.query.filter || 'active';
        const searchTerm = req.query.search ? req.query.search.trim() : '';
        
        let users;
        const streamerId = this.db.streamerId || 'default';
        
        if (searchTerm) {
          // Global search across all users (ignore filter when searching)
          const searchPattern = `%${searchTerm}%`;
          const stmt = this.db.prepare(`
            SELECT * FROM user_statistics 
            WHERE streamer_id = ? 
              AND (username LIKE ? OR unique_id LIKE ?)
            ORDER BY total_coins_sent DESC, last_seen_at DESC
            LIMIT ?
          `);
          users = stmt.all(streamerId, searchPattern, searchPattern, limit);
        } else if (filter === 'active') {
          // Get users active in the last 5 minutes (currently watching)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          
          const stmt = this.db.prepare(`
            SELECT * FROM user_statistics 
            WHERE streamer_id = ? AND last_seen_at >= ?
            ORDER BY last_seen_at DESC 
            LIMIT ?
          `);
          users = stmt.all(streamerId, fiveMinutesAgo, limit);
        } else {
          // Get all users
          users = this.db.getAllUserStatistics(limit, 0);
        }
        
        // Map users with talking head status
        const usersWithStatus = users.map(user => {
          const hasAvatar = this.cacheManager.hasAvatar(user.user_id, 'asset-library');
          const cached = hasAvatar ? this.cacheManager.getAvatar(user.user_id, 'asset-library') : null;
          
          return {
            userId: user.user_id,
            username: user.username,
            uniqueId: user.unique_id,
            profilePictureUrl: user.profile_picture_url,
            totalCoins: user.total_coins_sent,
            totalGifts: user.total_gifts_sent,
            totalComments: user.total_comments,
            lastSeenAt: user.last_seen_at,
            hasAvatar,
            avatarCreatedAt: cached ? cached.createdAt : null,
            avatarStyleKey: cached ? cached.styleKey : null
          };
        });
        
        res.json({ success: true, users: usersWithStatus });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to fetch users', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Assign the currently selected local asset set to a user.
    this.api.registerRoute('post', '/api/talkingheads/assign', async (req, res) => {
      try {
        const { userId, username } = req.body;

        if (!userId || !username) {
          return res.status(400).json({ success: false, error: 'Missing required fields: userId and username' });
        }

        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');

        if (!sanitizedUserId || !sanitizedUsername) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        const result = await this._getConfiguredAssetAvatar(sanitizedUserId, sanitizedUsername, req.body);

        // Emit socket event to notify UI of new avatar
        this.io.emit('talkingheads:avatar:generated', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: result.styleKey,
          sprites: this._getRelativeSpritePaths(result.sprites)
        });

        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('TalkingHeads: User assignment failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Manual sprite assignment - assign sprites from one user to another
    this.api.registerRoute('post', '/api/talkingheads/assign-manual-sprite', async (req, res) => {
      try {
        const { userId, username, targetUserId } = req.body;

        if (!userId || !username || !targetUserId) {
          return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, username, and targetUserId' 
          });
        }

        // Sanitize inputs
        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');
        const sanitizedTargetUserId = this._sanitizeInput(targetUserId, 'userId');

        if (!sanitizedUserId || !sanitizedUsername || !sanitizedTargetUserId) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        // Get target user's avatar from cache
        const targetAvatar = this.cacheManager.getAvatar(sanitizedTargetUserId, 'asset-library');
        
        if (!targetAvatar) {
          return res.status(404).json({ 
            success: false, 
            error: `No avatar found for target user ID: ${sanitizedTargetUserId}` 
          });
        }

        this._log(`Manually assigning sprites from ${targetAvatar.username} to ${sanitizedUsername}`, 'info');

        // Copy sprites to new user in cache
        this.cacheManager.saveAvatar(
          sanitizedUserId,
          sanitizedUsername,
          targetAvatar.styleKey,
          targetAvatar.avatarPath,
          targetAvatar.sprites,
          targetAvatar.profileImageUrl
        );

        // Emit socket event to notify UI of new avatar assignment
        this.io.emit('talkingheads:avatar:generated', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: targetAvatar.styleKey,
          sprites: this._getRelativeSpritePaths(targetAvatar.sprites),
          manuallyAssigned: true,
          sourceUser: targetAvatar.username
        });

        res.json({ 
          success: true, 
          message: `Successfully assigned sprites from ${targetAvatar.username} to ${sanitizedUsername}`,
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: targetAvatar.styleKey,
          sourceUserId: sanitizedTargetUserId,
          sourceUsername: targetAvatar.username
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual sprite assignment failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available sprites for manual assignment
    this.api.registerRoute('get', '/api/talkingheads/available-sprites', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        
        // Get all cached avatars
        const cachedAvatars = this.cacheManager.listAvatars(limit);
        
        // Format for dropdown/selection
        const availableSprites = cachedAvatars.map(avatar => ({
          userId: avatar.userId,
          username: avatar.username,
          styleKey: avatar.styleKey,
          previewUrl: this._getRelativeSpritePaths(avatar.sprites).idle_neutral,
          createdAt: avatar.createdAt,
          lastUsed: avatar.lastUsed
        }));

        res.json({ 
          success: true, 
          sprites: availableSprites,
          total: availableSprites.length
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to list available sprites', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get active animations
    this.api.registerRoute('get', '/api/talkingheads/animations', (req, res) => {
      try {
        const animations = this.animationController.getActiveAnimations();
        res.json({ success: true, animations });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test animation endpoint (bypasses TTS, tests animation directly)
    this.api.registerRoute('post', '/api/talkingheads/test-animation', async (req, res) => {
      try {
        const { userId, username, duration } = req.body;
        const testUserId = userId || 'test_animation_user';
        const testUsername = username || 'Test Animation User';
        const animationDuration = duration || 5000;

        // Resolve sprites based on spriteMode, mirroring _handleTTSEvent logic
        const spriteMode = this.config.spriteMode || 'auto';
        let avatarData = null;

        if (spriteMode === 'manual' || spriteMode === 'hybrid') {
          // Check for default manual set first
          if (this.config.defaultManualSetId) {
            const defaultSet = this.cacheManager.getManualSet(this.config.defaultManualSetId);
            if (defaultSet) {
              avatarData = { userId: testUserId, username: testUsername, styleKey: `manual:${this.config.defaultManualSetId}`, sprites: defaultSet.sprites };
              this._log(`Using default manual set "${this.config.defaultManualSetId}" for test animation`, 'debug');
            }
          }

          if (!avatarData && spriteMode === 'manual') {
            if (!this.config.manualFallback) {
              return res.status(404).json({
                success: false,
                error: 'No manual sprite set configured and local asset fallback is disabled. Please configure a manual set in settings.'
              });
            }
            this._log('No manual sprites for test animation, falling back to local assets', 'warn');
          }
        }

        if (!avatarData) {
          avatarData = await this._getConfiguredAssetAvatar(testUserId, testUsername, req.body || {});
        }

        // Start animation directly
        this._log(`Starting test animation for ${testUsername} (${animationDuration}ms)`, 'info');
        this.animationController.startAnimation(
          testUserId,
          testUsername,
          avatarData.sprites,
          animationDuration
        );

        res.json({
          success: true,
          message: 'Test animation started',
          userId: testUserId,
          duration: animationDuration
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Test animation failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Socket.IO connection test - verifies overlay is connected
    this.api.registerRoute('get', '/api/talkingheads/test-socket', (req, res) => {
      try {
        // Get count of connected clients (compatible with Socket.IO v2 and v4+)
        let clientCount = 0;
        try {
          if (this.io.sockets && this.io.sockets.sockets) {
            // v4+: Map with .size property
            if (typeof this.io.sockets.sockets.size === 'number') {
              clientCount = this.io.sockets.sockets.size;
            } else {
              // v2: Plain object
              clientCount = Object.keys(this.io.sockets.sockets).length;
            }
          } else if (this.io.engine && typeof this.io.engine.clientsCount === 'number') {
            clientCount = this.io.engine.clientsCount;
          }
        } catch (countError) {
          this._log(`Could not determine client count: ${countError.message}`, 'debug');
        }
        
        // Send a test ping to all clients
        this.io.emit('talkingheads:test:ping', { 
          timestamp: Date.now(),
          message: 'Socket.IO connection test'
        });
        
        this._log(`Socket test ping sent to ${clientCount} clients`, 'info');
        
        res.json({ 
          success: true, 
          clientCount,
          message: 'Test ping sent. Check overlay console for "talkingheads:test:ping" event.'
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Socket test failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Expose recent logs for the admin UI
    this.api.registerRoute('get', '/api/talkingheads/logs', (req, res) => {
      try {
        const limit = parseInt(req.query.limit, 10) || 100;
        res.json({ success: true, logs: this._getRecentLogs(limit) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test permission settings with different user types
    this.api.registerRoute('post', '/api/talkingheads/test-permissions', (req, res) => {
      try {
        const { rolePermission, minTeamLevel } = req.body;
        
        // Create test config
        const testConfig = {
          rolePermission: rolePermission || 'all',
          minTeamLevel: minTeamLevel || 0
        };
        
        // Create a temporary role manager for testing
        const testRoleManager = new RoleManager(testConfig, this.logger);
        
        // Define test users with different roles
        const testUsers = [
          {
            userType: 'Normaler Viewer',
            userData: {
              uniqueId: 'test_viewer',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 999
            }
          },
          {
            userType: 'Team-Mitglied (Level 1)',
            userData: {
              uniqueId: 'test_team_member',
              teamMemberLevel: 1,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 999
            }
          },
          {
            userType: 'Moderator',
            userData: {
              uniqueId: 'test_moderator',
              teamMemberLevel: 0,
              isModerator: true,
              isSubscriber: false,
              topGifterRank: 999
            }
          },
          {
            userType: 'Abonnent/Superfan',
            userData: {
              uniqueId: 'test_subscriber',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: true,
              topGifterRank: 999
            }
          },
          {
            userType: 'Top Gifter (Rang 1)',
            userData: {
              uniqueId: 'test_top_gifter',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 1
            }
          },
          {
            userType: 'User mit Custom Voice',
            userData: {
              uniqueId: 'test_custom_voice',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 999,
              hasAssignedVoice: true
            }
          }
        ];
        
        // Test each user type
        const testResults = testUsers.map(test => {
          const customVoiceUsers = test.userData.hasAssignedVoice 
            ? [test.userData.uniqueId] 
            : [];
          
          const result = testRoleManager.checkEligibility(
            test.userData,
            customVoiceUsers
          );
          
          return {
            userType: test.userType,
            eligible: result.eligible,
            reason: result.reason
          };
        });
        
        res.json({ success: true, testResults });
      } catch (error) {
        this.logger.error('TalkingHeads: Permission test failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve sprite images (from avatars/ directory)
    this.api.registerRoute('get', '/api/talkingheads/sprite/:filename', async (req, res) => {
      try {
        const pluginDataDir = this.api.getPluginDataDir();
        const filepath = this._resolveAvatarSpritePath(pluginDataDir, req.params.filename);
        if (!filepath) {
          return res.status(400).json({ success: false, error: 'Invalid sprite path' });
        }

        // Check if file exists
        await fs.access(filepath);
        
        // Send file
        res.sendFile(filepath);
      } catch (error) {
        res.status(404).json({ success: false, error: 'Sprite not found' });
      }
    });

    // Serve manual sprite images (from manual/{setId}/ directory)
    this.api.registerRoute('get', '/api/talkingheads/manual-sprite/:setId/:filename', async (req, res) => {
      try {
        const { setId, filename } = req.params;
        const safeSetId = path.basename(setId || '');
        const safeFilename = path.basename(filename || '');
        if (!safeSetId || !safeFilename) {
          return res.status(400).json({ success: false, error: 'Invalid path' });
        }
        const pluginDataDir = this.api.getPluginDataDir();
        const filepath = path.join(pluginDataDir, 'manual', safeSetId, safeFilename);
        await fs.access(filepath);
        res.sendFile(filepath);
      } catch (error) {
        res.status(404).json({ success: false, error: 'Manual sprite not found' });
      }
    });

    // ==================== MANUAL SPRITE UPLOAD ROUTES ====================

    // Upload manual sprite set (5 PNGs or 1 ZIP)
    this.api.registerRoute('post', '/api/talkingheads/manual-upload', async (req, res) => {
      try {
        const multer = require('multer');
        const pluginDataDir = this.api.getPluginDataDir();
        const tmpDir = path.join(pluginDataDir, 'manual', '_tmp');
        await fs.mkdir(tmpDir, { recursive: true });

        const storage = multer.diskStorage({
          destination: (_req, _file, cb) => cb(null, tmpDir),
          filename: (_req, file, cb) => cb(null, `${Date.now()}_${path.basename(file.originalname)}`)
        });

        const SPRITE_FIELDS = ['idle_neutral', 'blink', 'speak_closed', 'speak_mid', 'speak_open'];
        const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB per file

        const uploadMiddleware = multer({
          storage,
          limits: { fileSize: MAX_FILE_SIZE },
          fileFilter: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase();
            if (ext === '.png' || ext === '.zip') {
              cb(null, true);
            } else {
              cb(new Error('Only PNG or ZIP files are accepted'));
            }
          }
        }).fields([
          ...SPRITE_FIELDS.map((f) => ({ name: f, maxCount: 1 })),
          { name: 'zip', maxCount: 1 }
        ]);

        // Run multer inside the handler
        await new Promise((resolve, reject) => {
          uploadMiddleware(req, res, (err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        const setName = (req.body && req.body.setName) ? String(req.body.setName).trim() : '';
        if (!setName) {
          return res.status(400).json({ success: false, error: 'Missing setName' });
        }

        // Slugify setName to create setId
        const setId = this._slugifySetId(setName);
        if (!setId) {
          return res.status(400).json({ success: false, error: 'setName produces an empty setId' });
        }

        const setDir = path.join(pluginDataDir, 'manual', setId);
        await fs.mkdir(setDir, { recursive: true });

        let spritePaths = {};

        // Handle ZIP upload
        if (req.files && req.files.zip && req.files.zip[0]) {
          const zipFile = req.files.zip[0];
          const extractDir = path.join(tmpDir, `zip_${Date.now()}`);
          try {
            const extractZip = require('extract-zip');
            await fs.mkdir(extractDir, { recursive: true });
            await extractZip(zipFile.path, { dir: extractDir });

            // Copy matching frames from the extracted contents
            const extractedFiles = await fs.readdir(extractDir);
            for (const file of extractedFiles) {
              const base = path.basename(file, '.png');
              if (SPRITE_FIELDS.includes(base)) {
                const srcPath = path.join(extractDir, file);
                const destPath = path.join(setDir, `${base}.png`);
                await fs.copyFile(srcPath, destPath);
                spritePaths[base] = destPath;
              }
            }
          } finally {
            try { await fs.unlink(zipFile.path); } catch (_) {}
            // Cleanup extracted temp dir
            try {
              const tmpExtracted = await fs.readdir(extractDir);
              for (const f of tmpExtracted) {
                try { await fs.unlink(path.join(extractDir, f)); } catch (_) {}
              }
              await fs.rmdir(extractDir);
            } catch (_) {}
          }
        }

        // Handle individual PNG uploads (overrides ZIP for matching fields)
        for (const field of SPRITE_FIELDS) {
          if (req.files && req.files[field] && req.files[field][0]) {
            const uploadedFile = req.files[field][0];
            const destPath = path.join(setDir, `${field}.png`);
            try {
              await fs.rename(uploadedFile.path, destPath);
            } catch (_) {
              // rename may fail across devices; fall back to copy+delete
              await fs.copyFile(uploadedFile.path, destPath);
              try { await fs.unlink(uploadedFile.path); } catch (__) {}
            }
            spritePaths[field] = destPath;
          }
        }

        // Clean up leftover tmp files
        try {
          const tmpFiles = await fs.readdir(tmpDir);
          for (const f of tmpFiles) {
            try { await fs.unlink(path.join(tmpDir, f)); } catch (_) {}
          }
        } catch (_) {}

        // Validate all 5 frames are present
        const missing = SPRITE_FIELDS.filter((f) => !spritePaths[f]);
        if (missing.length > 0) {
          // Clean up partial upload
          for (const p of Object.values(spritePaths)) {
            try { await fs.unlink(p); } catch (_) {}
          }
          return res.status(400).json({
            success: false,
            error: `Missing sprite frames: ${missing.join(', ')}`
          });
        }

        // Save to DB
        this.cacheManager.cacheManualSprites(setId, setName, spritePaths);

        this.io.emit('talkingheads:manual:uploaded', { setId, setName });
        this._log(`Manual sprite set uploaded: ${setName} (${setId})`, 'info');

        res.json({
          success: true,
          setId,
          setName,
          sprites: this._getManualRelativeSpritePaths(setId, spritePaths)
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual sprite upload failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // List all manual sprite sets
    this.api.registerRoute('get', '/api/talkingheads/manual-templates', (req, res) => {
      try {
        const sets = this.cacheManager.listManualSets();
        const result = sets.map((s) => ({
          setId: s.setId,
          setName: s.setName,
          createdAt: s.createdAt,
          sprites: this._getManualRelativeSpritePaths(s.setId, s.sprites)
        }));
        res.json({ success: true, sets: result });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to list manual templates', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Assign a manual sprite set to a user
    this.api.registerRoute('post', '/api/talkingheads/manual-assign', (req, res) => {
      try {
        const { userId, username, setId } = req.body;

        if (!userId || !username || !setId) {
          return res.status(400).json({ success: false, error: 'Missing userId, username, or setId' });
        }

        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');
        const sanitizedSetId = String(setId).replace(/[^a-z0-9-]/g, '').slice(0, 64);

        if (!sanitizedUserId || !sanitizedUsername || !sanitizedSetId) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        this.cacheManager.assignManualSetToUser(sanitizedUserId, sanitizedUsername, sanitizedSetId);

        const set = this.cacheManager.getManualSet(sanitizedSetId);
        this.io.emit('talkingheads:manual:assigned', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          setId: sanitizedSetId,
          sprites: set ? this._getManualRelativeSpritePaths(sanitizedSetId, set.sprites) : null
        });

        this._log(`Manual set "${sanitizedSetId}" assigned to ${sanitizedUsername}`, 'info');
        res.json({ success: true, userId: sanitizedUserId, username: sanitizedUsername, setId: sanitizedSetId });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual sprite assignment failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete a manual sprite set
    this.api.registerRoute('delete', '/api/talkingheads/manual-upload/:setId', async (req, res) => {
      try {
        const rawSetId = req.params.setId || '';
        const setId = String(rawSetId).replace(/[^a-z0-9-]/g, '').slice(0, 64);
        if (!setId) {
          return res.status(400).json({ success: false, error: 'Invalid setId' });
        }

        const deleted = await this.cacheManager.deleteManualSet(setId);
        if (!deleted) {
          return res.status(404).json({ success: false, error: 'Manual sprite set not found' });
        }

        this.io.emit('talkingheads:manual:deleted', { setId });
        res.json({ success: true, setId });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to delete manual sprite set', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ==================== VIEWER BAR ROUTES ====================

    // Serve Viewer Bar overlay HTML
    this.api.registerRoute('get', '/talking-heads/viewer-bar', (req, res) => {
      res.sendFile(path.join(__dirname, 'viewer-bar.html'));
    });

    this.api.registerRoute('get', '/overlay/talking-heads/viewer-bar', (req, res) => {
      res.sendFile(path.join(__dirname, 'viewer-bar.html'));
    });

    // Get Viewer Bar configuration
    this.api.registerRoute('get', '/api/talkingheads/viewer-bar/config', (req, res) => {
      try {
        const port = this.api.getConfig('server_port') || process.env.PORT || 3000;
        res.json({
          success: true,
          config: this.config.viewerBar,
          overlayUrl: `http://localhost:${port}/talking-heads/viewer-bar`
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Save Viewer Bar configuration
    this.api.registerRoute('post', '/api/talkingheads/viewer-bar/config', (req, res) => {
      try {
        const newViewerBarConfig = { ...this.config.viewerBar, ...req.body };
        this._saveConfig({ viewerBar: newViewerBarConfig });
        this.io.emit('viewer-bar:config:update', { config: this.config.viewerBar });
        res.json({ success: true, config: this.config.viewerBar });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to save viewer bar config', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get current viewer list with sprites
    this.api.registerRoute('get', '/api/talkingheads/viewer-bar/viewers', (req, res) => {
      try {
        const viewers = [];
        for (const [userId, data] of this.viewerPresence.entries()) {
          viewers.push({
            userId,
            username: data.username,
            sprites: data.sprites,
            lastSeen: data.lastSeen,
            joinedAt: data.joinedAt
          });
        }
        res.json({ success: true, viewers });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.logger.info('TalkingHeads: API routes registered');
  }

  /**
   * Register socket events
   * @private
   */
  _registerSocketConnection(handler) {
    if (typeof this.api.registerSocketConnection === 'function') {
      return this.api.registerSocketConnection(handler);
    }

    // Compatibility for isolated legacy test APIs; production uses PluginAPI.
    return this.io.on('connection', handler);
  }

  _registerSocketEvents() {
    // Client requests animation test
    this.api.registerSocket('talkingheads:test', async (data) => {
      try {
        const { userId, username, duration } = data;
        
        // Resolve the selected local sprite set.
        const cached = await this._getConfiguredAssetAvatar(userId, username, data || {});
        
        if (cached) {
          this.animationController.startAnimation(
            userId,
            username,
            cached.sprites,
            duration || 5000
          );
        }
      } catch (error) {
        this.logger.error('TalkingHeads: Test animation failed', error);
      }
    });

    this.api.registerSocket('talkingheads:avatar:spin:complete', (socket, data) => {
      this._completeAvatarSpin(data || {});
    });

    this.logger.info('TalkingHeads: Socket events registered');
  }

  /**
   * Register TTS event listeners
   * @private
   */
  _registerTTSEvents() {
    // Listen for TTS events from TTS plugin
    this._registerSocketConnection((socket) => {
      socket.on('tts:speaking', async (data) => {
        if (!this.config.enabled) return;

        try {
          await this._handleTTSEvent(data);
        } catch (error) {
          this.logger.error('TalkingHeads: Failed to handle TTS event', error);
        }
      });
    });

    this.logger.info('TalkingHeads: TTS event listeners registered');
  }

  /**
   * Bridge TTS playback events from the TTS plugin to Talking Heads animations
   * Uses PluginLoader event emitter to avoid socket roundtrips
   * @private
   */
  _registerPlaybackBridge() {
    const loader = this.api.pluginLoader;
    if (!loader || typeof loader.on !== 'function') {
      this._log('PluginLoader not available for TTS bridge', 'debug');
      return;
    }

    const rendererStartHandler = async (payload = {}) => {
      const source = String(payload.source || '').toLowerCase();
      const isPreview = source === 'talking-heads-preview';
      if (!this.config.enabled && !isPreview) return;

      const playbackId = String(payload.playbackId || '').trim();
      const userId = String(payload.userId || payload.username || '').trim();
      if (!playbackId || !userId) return;
      this.activePlaybackByUser.set(userId, playbackId);

      try {
        await this._handleTTSEvent({
          userId,
          username: payload.username || userId,
          text: '',
          duration: this.config.animationDuration || 5000,
          isPreview,
          playbackId,
          externalLifecycle: true,
          userData: {
            uniqueId: userId,
            hasAssignedVoice: payload.hasAssignedVoice === true
          }
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to start renderer-synchronised avatar', error);
      }
    };

    const rendererProgressHandler = (payload = {}) => {
      const playbackId = String(payload.playbackId || '').trim();
      const userId = String(payload.userId || payload.username || '').trim();
      if (!playbackId || !userId || this.activePlaybackByUser.get(userId) !== playbackId) return;
      this.animationController?.setMouthIntensity(userId, playbackId, payload.level ?? null);
    };

    const rendererTerminalHandler = (payload = {}) => {
      const playbackId = String(payload.playbackId || '').trim();
      const userId = String(payload.userId || payload.username || '').trim();
      if (!playbackId || !userId) return;
      const isActivePlayback = this.activePlaybackByUser.get(userId) === playbackId;
      const isInitialReservation = this.initialAvatarPlaybackReservations.get(userId) === playbackId;
      if (!isActivePlayback && !isInitialReservation) return;

      if (isActivePlayback) {
        this.activePlaybackByUser.delete(userId);
        this.animationController?.endExternalAnimation(userId, playbackId);
      }
      if (isInitialReservation) {
        this.initialAvatarPlaybackReservations.delete(userId);
      }
      const generatedOwnerId = this._playbackAssetOwnerId(playbackId);
      if (generatedOwnerId && this.cacheManager?.releaseGeneratedAssetOwner) {
        this.cacheManager.releaseGeneratedAssetOwner(generatedOwnerId).catch((error) => {
          this.logger.warn(`TalkingHeads: Playback asset cleanup failed for ${playbackId}`, error);
        });
      }
      const pendingGift = this.pendingGiftRerolls.get(userId);
      if (pendingGift) {
        this.pendingGiftRerolls.delete(userId);
        this._handleLotteryGift(pendingGift).catch((error) => {
          this.logger.error('TalkingHeads: Deferred avatar gift reroll failed', error);
        });
      }
    };

    const startHandler = async (payload = {}) => {
      // TTS retains this alias for legacy consumers. Renderer-authoritative
      // playback has already been handled above and must not start twice.
      if (payload.rendererAuthoritative === true) return;
      const source = String(payload.source || '').toLowerCase();
      const isPreview = source === 'talking-heads-preview';

      // Allow preview to work even if plugin is not enabled
      if (!this.config.enabled && !isPreview) return;
      
      const userId = payload.userId || payload.username;
      if (!userId) return;

      // Log preview requests
      if (isPreview) {
        this._log(`Preview TTS request received for ${payload.username || userId}`, 'info');
      }

      try {
        await this._handleTTSEvent({
          userId,
          username: payload.username || userId,
          text: payload.text || '',
          duration: payload.duration || this.config.animationDuration || 5000,
          isPreview,
          userData: {
            profilePictureUrl: payload.profileImageUrl || '',
            uniqueId: userId,
            hasAssignedVoice: payload.hasAssignedVoice === true
          }
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to handle bridged TTS playback', error);
      }
    };

    const endHandler = (payload = {}) => {
      // See startHandler: legacy aliases are compatibility-only and must not
      // stop the renderer-authoritative Talking Heads animation.
      if (payload.rendererAuthoritative === true) return;
      const userId = payload.userId || payload.username;
      if (!userId || !this.animationController) return;
      this.animationController.stopAnimation(userId);
    };

    loader.on('tts:renderer:started', rendererStartHandler);
    loader.on('tts:renderer:progress', rendererProgressHandler);
    loader.on('tts:renderer:ended', rendererTerminalHandler);
    loader.on('tts:renderer:failed', rendererTerminalHandler);
    loader.on('tts:playback:started', startHandler);
    loader.on('tts:playback:ended', endHandler);
    this.ttsBridgeHandlers = {
      rendererStartHandler,
      rendererProgressHandler,
      rendererTerminalHandler,
      startHandler,
      endHandler
    };
    this._log('TTS playback bridge registered', 'debug');
  }

  /**
   * Handle TTS speaking event
   * @param {object} data - TTS event data
   * @private
   */
  async _handleTTSEvent(data) {
    const {
      userId,
      username,
      text,
      duration,
      userData,
      isPreview,
      playbackId = null,
      externalLifecycle = false
    } = data;

    this._log(`TTS event received for user: ${username}`, 'debug', { userId, duration });

    if (!userId || !username) {
      this._log('Invalid TTS event data - missing userId or username', 'warn');
      return;
    }
    const generatedOwnerId = this._playbackAssetOwnerId(playbackId)
      || `legacy:${userId}:${this._createSpinId()}`;
    const generatedLifetimeMs = externalLifecycle === true
      ? 60 * 60 * 1000
      : Math.max(1000, Number(duration) || 5000) + 2000;
    const generatedAssetUse = {
      ownerId: generatedOwnerId,
      expiresAt: Date.now() + generatedLifetimeMs
    };

    const enrichedUserData = {
      ...(userData || {}),
      uniqueId: userId || username,
      username,
      hasAssignedVoice: userData?.hasAssignedVoice === true
    };

    // Skip permission check for preview/test users
    if (!isPreview) {
      // Check role permission
      this._log(`Checking eligibility for user: ${username}`, 'debug');
      const eligibility = this.roleManager.checkEligibility(enrichedUserData, this.customVoiceUsers);
      
      if (!eligibility.eligible) {
        this._log(`User ${username} not eligible - ${eligibility.reason}`, 'info');
        return;
      }
    } else {
      this._log(`Preview mode - skipping permission check for ${username}`, 'debug');
    }

    this._log(`User ${username} is eligible for talking head`, 'debug');

    // Resolve sprites based on spriteMode
    const spriteMode = this.config.spriteMode || 'auto';
    let avatarData = null;
    let wasCached = false;

    // Existing assignment records include valid rows created by the legacy
    // gift-lottery implementation.
    const existingAssignment = this.avatarLotteryManager?.getAssignment(userId);
    if (existingAssignment?.selection) {
      try {
        avatarData = await this._getConfiguredAssetAvatar(
          userId,
          username,
          existingAssignment.selection,
          generatedAssetUse
        );
        wasCached = true;
        this._log(`Using assigned avatar for ${username}`, 'debug', existingAssignment.selection);
      } catch (error) {
        this._log(`Failed to prepare assigned avatar for ${username}: ${error.message}`, 'warn');
      }
    }

    if (!avatarData && (spriteMode === 'manual' || spriteMode === 'hybrid')) {
      // Check for manually assigned sprite set first
      const manualStyleKey = this._getManualStyleKeyForUser(userId);
      if (manualStyleKey) {
        avatarData = this.cacheManager.getAvatar(userId, manualStyleKey);
        wasCached = !!avatarData;
        this._log(`Using manual sprites (${manualStyleKey}) for ${username}`, 'debug');
      }

      if (!avatarData && this.config.defaultManualSetId) {
        // Use default manual set if no user-specific one
        const defaultSet = this.cacheManager.getManualSet(this.config.defaultManualSetId);
        if (defaultSet) {
          avatarData = { userId, username, styleKey: `manual:${this.config.defaultManualSetId}`, sprites: defaultSet.sprites };
          wasCached = true;
          this._log(`Using default manual set "${this.config.defaultManualSetId}" for ${username}`, 'debug');
        }
      }

      if (!avatarData && spriteMode === 'manual') {
        if (this.config.manualFallback) {
          this._log(`No manual sprites for ${username}, falling back to local assets`, 'warn');
        } else {
          this._log(`No manual sprites for ${username} and fallback disabled`, 'warn');
          return;
        }
      }
    }

    if (!avatarData) {
      // Retain previously assigned legacy/manual sprites when they exist.
      avatarData = this.cacheManager.getAvatar(userId, 'asset-library');
      wasCached = !!avatarData;
    }

    if (!avatarData) {
      const prepared = this.prepareAvatarAssignment({
        userId,
        username,
        hasAssignedVoice: enrichedUserData.hasAssignedVoice
      });
      if (prepared.selection) {
        try {
          avatarData = await this._getConfiguredAssetAvatar(
            userId,
            username,
            prepared.selection,
            generatedAssetUse
          );
          wasCached = !prepared.created;
        } catch (error) {
          this._log(`Failed to prepare automatic avatar for ${username}: ${error.message}`, 'warn');
        }
      }
    }

    if (!avatarData) {
      try {
        avatarData = await this._getConfiguredAssetAvatar(userId, username, {}, generatedAssetUse);
        wasCached = true;
        this._log(`Using local asset selection for ${username}`, 'debug', avatarData.assetSelection);
      } catch (error) {
        this._log(`Failed to prepare local assets for ${username}: ${error.message}`, 'error');
        return;
      }
    } else {
      this._log(`Using cached avatar for ${username}`, 'debug');
    }

    const isNewAvatar = !wasCached;

    // Start animation
    this._log(`Starting animation for ${username} (duration: ${duration}ms)`, 'debug');
    if (isNewAvatar && this.config.obsHudEnabled !== false) {
      this._emitSpawnAnimation(userId, username, avatarData.sprites);
    }
    if (externalLifecycle === true) {
      this.animationController.startAnimation(
        userId,
        username,
        avatarData.sprites,
        duration || 5000,
        { playbackId, externalLifecycle: true }
      );
    } else {
      this.animationController.startAnimation(
        userId,
        username,
        avatarData.sprites,
        duration || 5000
      );
      this._scheduleGeneratedAssetRelease(generatedOwnerId, generatedLifetimeMs);
    }
  }

  /**
   * Find if user has a manually assigned sprite set and return its styleKey
   * @param {string} userId
   * @returns {string|null} styleKey of the form 'manual:{setId}' or null
   * @private
   */
  _getManualStyleKeyForUser(userId) {
    try {
      // Check if the user has any cache entry with a manual: style key
      const row = this.db.prepare(
        "SELECT style_key FROM talking_heads_cache WHERE user_id = ? AND style_key LIKE 'manual:%' LIMIT 1"
      ).get(userId);
      return row ? row.style_key : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Register Viewer Bar TikTok event handlers (member join, chat speak)
   * @private
   */
  _registerViewerBarEvents() {
    // Listen for new Socket.IO connections to sync state to newly connected overlays
    this._registerSocketConnection((socket) => {
      socket.on('viewer-bar:request:sync', () => {
        const viewers = [];
        for (const [userId, data] of this.viewerPresence.entries()) {
          viewers.push({ userId, username: data.username, sprites: data.sprites });
        }
        socket.emit('viewer-bar:state:sync', { viewers, config: this.config.viewerBar });
      });
    });

    // TikTok member join
    this.api.registerTikTokEvent('member', async (data) => {
      if (!this.config.viewerBar || !this.config.viewerBar.enabled) return;

      try {
        const userId = data.userId || data.uniqueId;
        const username = data.nickname || data.uniqueId || 'Unknown';
        if (!userId) return;

        const now = Date.now();

        // Get sprites for this viewer
        const sprites = await this._getSpritesForViewerBar(userId, username);

        if (!sprites && this.config.viewerBar.requireAvatar) {
          this._log(`Viewer bar: No sprites for ${username}, requireAvatar=true, skipping`, 'debug');
          return;
        }

        this.viewerPresence.set(userId, {
          username,
          sprites: sprites || null,
          lastSeen: now,
          joinedAt: this.viewerPresence.has(userId) ? this.viewerPresence.get(userId).joinedAt : now
        });

        const relativeSprites = sprites ? this._resolveViewerBarSprites(userId, sprites) : null;
        this.io.emit('viewer-bar:viewer:join', { userId, username, sprites: relativeSprites });
        this._log(`Viewer bar: ${username} joined`, 'debug');
      } catch (error) {
        this.logger.error('TalkingHeads: Viewer bar member event failed', error);
      }
    });

    // TikTok chat event – viewer speaks
    this.api.registerTikTokEvent('chat', (data) => {
      if (!this.config.viewerBar || !this.config.viewerBar.enabled) return;

      try {
        const userId = data.userId || data.uniqueId;
        const username = data.nickname || data.uniqueId || 'Unknown';
        const message = data.comment || data.message || '';
        if (!userId) return;

        const now = Date.now();

        // Update lastSeen; if viewer is not in presence map, add with null sprites
        if (!this.viewerPresence.has(userId)) {
          this.viewerPresence.set(userId, {
            username,
            sprites: null,
            lastSeen: now,
            joinedAt: now
          });
        } else {
          this.viewerPresence.get(userId).lastSeen = now;
          this.viewerPresence.get(userId).username = username;
        }

        const presenceData = this.viewerPresence.get(userId);
        const relativeSprites = presenceData.sprites
          ? this._resolveViewerBarSprites(userId, presenceData.sprites)
          : null;

        const duration = (this.config.viewerBar.popUpDuration || 5000);

        this.io.emit('viewer-bar:viewer:speak', {
          userId,
          username,
          message,
          duration,
          sprites: relativeSprites
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Viewer bar chat event failed', error);
      }
    });

    // Periodic cleanup: remove viewers not seen for viewerTimeout ms
    const timeoutMs = (this.config.viewerBar && this.config.viewerBar.viewerTimeout) || 300000;
    this.viewerCleanupInterval = setInterval(() => {
      const cutoff = Date.now() - timeoutMs;
      for (const [userId, data] of this.viewerPresence.entries()) {
        if (data.lastSeen < cutoff) {
          this.viewerPresence.delete(userId);
          this.io.emit('viewer-bar:viewer:leave', { userId });
          this._log(`Viewer bar: removed idle viewer ${data.username}`, 'debug');
        }
      }
    }, Math.min(timeoutMs, 60000));
    this.viewerCleanupInterval.unref?.();

    this._log('Viewer bar events registered', 'info');
  }

  /**
   * Get sprites for a viewer based on the current spriteMode
   * Returns absolute-path sprites object or null
   * @param {string} userId
   * @param {string} username
   * @returns {Promise<object|null>}
   * @private
   */
  async _getSpritesForViewerBar(userId, username) {
    const spriteMode = this.config.spriteMode || 'auto';

    // Manual / hybrid: check manual assignment first
    if (spriteMode === 'manual' || spriteMode === 'hybrid') {
      const manualStyleKey = this._getManualStyleKeyForUser(userId);
      if (manualStyleKey) {
        const cached = this.cacheManager.getAvatar(userId, manualStyleKey);
        if (cached) return cached.sprites;
      }

      if (this.config.defaultManualSetId) {
        const defaultSet = this.cacheManager.getManualSet(this.config.defaultManualSetId);
        if (defaultSet) return defaultSet.sprites;
      }

      if (spriteMode === 'manual') return null; // no local fallback in pure manual mode
    }

    const avatar = await this._getConfiguredAssetAvatar(userId, username);
    return avatar.sprites;
  }

  /**
   * Resolve viewer bar sprite paths to relative URLs
   * Handles both regular (avatars/) and manual (manual/{setId}/) paths
   * @param {string} userId
   * @param {object} sprites - Absolute paths
   * @returns {object}
   * @private
   */
  _resolveViewerBarSprites(userId, sprites) {
    if (!sprites) return null;

    // Check if these are manual sprites (path contains '/manual/')
    const firstPath = Object.values(sprites).find(Boolean) || '';
    const pluginDataDir = this.api.getPluginDataDir();
    const manualDir = path.join(pluginDataDir, 'manual');

    if (firstPath.startsWith(manualDir)) {
      // Extract setId from path: manual/{setId}/filename
      const relative = firstPath.slice(manualDir.length + 1);
      const setId = relative.split(/[\\/]/)[0];
      return this._getManualRelativeSpritePaths(setId, sprites);
    }

    return this._getRelativeSpritePaths(sprites);
  }

  /**
   * Load custom voice users from TTS plugin
   * @private
   */
  _loadCustomVoiceUsers() {
    try {
      // Try to get TTS plugin config
      const ttsConfig = this.api.getConfig('tts_config');
      
      if (ttsConfig && ttsConfig.voiceWhitelist) {
        this.customVoiceUsers = Object.keys(ttsConfig.voiceWhitelist);
        this.logger.info(`TalkingHeads: Loaded ${this.customVoiceUsers.length} custom voice users`);
      }
    } catch (error) {
      this.logger.warn('TalkingHeads: Could not load custom voice users', error);
    }
  }

  /**
   * Start cache cleanup interval
   * @private
   */
  _startCacheCleanup() {
    // Run cleanup once per day
    this.cacheCleanupInterval = setInterval(async () => {
      try {
        // Get active user IDs to skip them during cleanup
        const activeUserIds = this.animationController 
          ? Array.from(this.animationController.activeAnimations.keys()) 
          : [];
        
        await this.cacheManager.cleanupOldCache(
          activeUserIds,
          this._getActiveGeneratedAssetOwnerIds()
        );
      } catch (error) {
        this.logger.error('TalkingHeads: Cache cleanup failed', error);
      }
    }, 86400000); // 24 hours
    this.cacheCleanupInterval.unref?.();

    this.logger.info('TalkingHeads: Cache cleanup scheduled');
  }

  _resolveAvatarSpritePath(pluginDataDir, filename) {
    const safeFilename = path.basename(filename || '');
    if (!safeFilename || safeFilename !== filename) {
      return null;
    }

    const avatarsRoot = path.resolve(pluginDataDir, 'avatars');
    const filepath = path.resolve(avatarsRoot, safeFilename);
    if (filepath !== avatarsRoot && filepath.startsWith(avatarsRoot + path.sep)) {
      return filepath;
    }

    return null;
  }

  /**
   * Destroy plugin and cleanup
   */
  async destroy() {
    try {
      this.logger.info('TalkingHeads: Destroying plugin...');

      // Stop all animations and clear timeouts
      if (this.animationController) {
        this.animationController.stopAllAnimations();
        this.animationController.clearAllTimeouts();
      }

      if (this.ttsBridgeHandlers && this.api.pluginLoader) {
        const loader = this.api.pluginLoader;
        loader.removeListener('tts:renderer:started', this.ttsBridgeHandlers.rendererStartHandler);
        loader.removeListener('tts:renderer:progress', this.ttsBridgeHandlers.rendererProgressHandler);
        loader.removeListener('tts:renderer:ended', this.ttsBridgeHandlers.rendererTerminalHandler);
        loader.removeListener('tts:renderer:failed', this.ttsBridgeHandlers.rendererTerminalHandler);
        loader.removeListener('tts:playback:started', this.ttsBridgeHandlers.startHandler);
        loader.removeListener('tts:playback:ended', this.ttsBridgeHandlers.endHandler);
        this.ttsBridgeHandlers = null;
      }

      this._cancelPendingAvatarSpins();
      this.initialAvatarPlaybackReservations.clear();
      this.activePlaybackByUser.clear();
      this.pendingGiftRerolls.clear();
      this.generatedAssetCleanupTimers.forEach(timer => clearTimeout(timer));
      this.generatedAssetCleanupTimers.clear();

      // Clear cleanup interval
      if (this.cacheCleanupInterval) {
        clearInterval(this.cacheCleanupInterval);
      }

      // Clear viewer bar cleanup interval
      if (this.viewerCleanupInterval) {
        clearInterval(this.viewerCleanupInterval);
      }

      this.logger.info('TalkingHeads: Plugin destroyed');
    } catch (error) {
      this.logger.error('TalkingHeads: Error during destroy', error);
    }
  }
}

module.exports = TalkingHeadsPlugin;
