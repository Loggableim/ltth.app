const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const SoundboardFetcher = require('./fetcher');
const SoundboardWebSocketTransport = require('./transport-ws');
const SoundboardApiRoutes = require('./api-routes');
const MyInstantsAPI = require('./myinstants-api');
const AudioCacheManager = require('./audio-cache');
const CacheCleanupJob = require('./cache-cleanup');

const DEFAULT_GIPHY_API_KEY = 'HFGAjZBhpxeQkITNlLQTbAI91qPmWVZp';

/**
 * Soundboard Manager Class
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardManager extends EventEmitter {
    constructor(db, io, logger) {
        super();
        this.db = db;
        this.io = io;
        this.logger = logger;
        this.likeHistory = []; // Deque for like threshold tracking
        this.MAX_LIKE_HISTORY_SIZE = 100;

        console.log('✅ Soundboard Manager initialized (Queue managed in frontend)');
    }

    /**
     * Get sound for a specific gift
     */
    getGiftSound(giftId) {
        const stmt = this.db.db.prepare('SELECT * FROM gift_sounds WHERE gift_id = ?');
        const sound = stmt.get(giftId);
        return sound ? {
            id: sound.id,
            giftId: sound.gift_id,
            label: sound.label,
            mp3Url: sound.mp3_url,
            volume: sound.volume || 1.0,
            animationUrl: sound.animation_url || null,
            animationType: sound.animation_type || 'none',
            animationVolume: sound.animation_volume || 1.0
        } : null;
    }

    /**
     * Get all gift sounds
     */
    getAllGiftSounds() {
        const stmt = this.db.db.prepare('SELECT * FROM gift_sounds ORDER BY label ASC');
        const sounds = stmt.all();
        return sounds.map(s => ({
            id: s.id,
            giftId: s.gift_id,
            label: s.label,
            mp3Url: s.mp3_url,
            volume: s.volume || 1.0,
            animationUrl: s.animation_url || null,
            animationType: s.animation_type || 'none',
            animationVolume: s.animation_volume || 1.0
        }));
    }

    /**
     * Recommend frequently dropped gifts that do not have a configured sound yet.
     */
    getUnconfiguredGiftRecommendations(options = {}) {
        const limit = Math.max(1, Math.min(50, parseInt(options.limit, 10) || 10));
        const lookback = Math.max(limit, Math.min(5000, parseInt(options.lookback, 10) || 1000));
        const configuredGiftIds = new Set(this.getAllGiftSounds().map(gift => Number(gift.giftId)));
        const rows = this.db.getEventLogsFiltered({ limit: lookback, eventType: 'gift' });
        const catalogStmt = this.db.db.prepare('SELECT * FROM gift_catalog WHERE id = ?');
        const grouped = new Map();

        rows.forEach(row => {
            const normalizedGift = this.normalizeGiftEvent(row.data || {});
            const giftId = normalizedGift.giftId;

            if (!giftId || configuredGiftIds.has(Number(giftId))) {
                return;
            }

            const existing = grouped.get(giftId) || {
                giftId,
                label: normalizedGift.giftName || `Gift ${giftId}`,
                imageUrl: normalizedGift.giftPictureUrl || null,
                diamondCount: null,
                dropCount: 0,
                repeatCount: 0,
                lastDroppedAt: row.timestamp || null
            };

            const repeatCount = this._positiveInt(normalizedGift.repeatCount, 1) || 1;
            existing.dropCount += 1;
            existing.repeatCount += repeatCount;
            if (!existing.lastDroppedAt || (row.timestamp && row.timestamp > existing.lastDroppedAt)) {
                existing.lastDroppedAt = row.timestamp;
            }
            grouped.set(giftId, existing);
        });

        return Array.from(grouped.values())
            .map(item => {
                const catalog = catalogStmt.get(item.giftId);
                return {
                    ...item,
                    label: catalog?.name || item.label,
                    imageUrl: catalog?.image_url || item.imageUrl,
                    diamondCount: catalog?.diamond_count ?? item.diamondCount
                };
            })
            .sort((a, b) => {
                if (b.repeatCount !== a.repeatCount) return b.repeatCount - a.repeatCount;
                return b.dropCount - a.dropCount;
            })
            .slice(0, limit);
    }

    /**
     * Add or update gift sound
     */
    setGiftSound(giftId, label, mp3Url, volume = 1.0, animationUrl = null, animationType = 'none', animationVolume = 1.0) {
        const stmt = this.db.db.prepare(`
            INSERT INTO gift_sounds (gift_id, label, mp3_url, volume, animation_url, animation_type, animation_volume)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(gift_id) DO UPDATE SET
                label = excluded.label,
                mp3_url = excluded.mp3_url,
                volume = excluded.volume,
                animation_url = excluded.animation_url,
                animation_type = excluded.animation_type,
                animation_volume = excluded.animation_volume
        `);

        const result = stmt.run(giftId, label, mp3Url, volume, animationUrl, animationType, animationVolume);
        return result.lastInsertRowid || result.changes;
    }

    /**
     * Delete gift sound
     */
    deleteGiftSound(giftId) {
        const stmt = this.db.db.prepare('DELETE FROM gift_sounds WHERE gift_id = ?');
        stmt.run(giftId);
    }

    _firstValue(...values) {
        return values.find(value => value !== undefined && value !== null && value !== '');
    }

    _positiveInt(value, fallback = null) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }

    _repeatCountFromAmount(amountValue, diamondCount) {
        const amount = this._positiveInt(amountValue, null);
        if (!amount) return null;

        const diamonds = this._positiveInt(diamondCount, null);
        if (diamonds && diamonds > 1 && amount >= diamonds && amount % diamonds === 0) {
            return Math.max(amount / diamonds, 1);
        }

        return amount;
    }

    _normalizeGiftRepeatCount(giftData, gift, diamondCount) {
        const explicitRepeat = this._positiveInt(this._firstValue(
            giftData.repeatCount,
            giftData.repeat_count,
            giftData.comboCount,
            giftData.combo_count,
            gift.repeatCount,
            gift.repeat_count,
            gift.comboCount,
            gift.combo_count
        ), null);
        if (explicitRepeat) return explicitRepeat;

        const giftCount = this._positiveInt(this._firstValue(
            giftData.giftCount,
            giftData.gift_count,
            gift.giftCount,
            gift.gift_count,
            giftData.count,
            gift.count
        ), null);
        if (giftCount) return giftCount;

        return this._repeatCountFromAmount(this._firstValue(giftData.amount, gift.amount), diamondCount) || 1;
    }

    normalizeGiftEvent(giftData = {}) {
        const gift = giftData.giftDetails || giftData.gift || giftData.giftInfo || {};
        const giftId = this._positiveInt(this._firstValue(
            giftData.giftId,
            giftData.gift_id,
            gift.giftId,
            gift.gift_id,
            gift.id,
            giftData.id
        ));

        const diamondCount = this._positiveInt(this._firstValue(
            giftData.diamondCount,
            giftData.diamond_count,
            gift.diamondCount,
            gift.diamond_count,
            gift.diamonds,
            giftData.diamonds
        ), null);
        const repeatCount = this._normalizeGiftRepeatCount(giftData, gift, diamondCount);

        return {
            ...giftData,
            giftId,
            giftName: this._firstValue(
                giftData.giftName,
                giftData.gift_name,
                gift.giftName,
                gift.gift_name,
                gift.name,
                giftData.name
            ),
            giftPictureUrl: this._firstValue(
                giftData.giftPictureUrl,
                giftData.gift_image,
                gift.giftPictureUrl,
                gift.imageUrl,
                gift.image,
                gift.icon
            ),
            repeatCount,
            username: this._firstValue(
                giftData.username,
                giftData.uniqueId,
                giftData.user?.uniqueId,
                giftData.user?.nickname,
                giftData.nickname,
                'unknown'
            )
        };
    }

    /**
     * Play sound for gift event
     * repeatCount is forwarded once; the dashboard/OBS frontend expands gift
     * streak playback according to the active queue/overlap mode.
     */
    async playGiftSound(giftData = {}) {
        const normalizedGift = this.normalizeGiftEvent(giftData);
        const repeatCount = normalizedGift.repeatCount;

        this.logger.info(`[Soundboard] Gift event: ${normalizedGift.giftName} (ID: ${normalizedGift.giftId}) from ${normalizedGift.username}, repeatCount: ${repeatCount}`);

        const giftSound = this.getGiftSound(normalizedGift.giftId);

        if (giftSound) {
            await this.playSound(giftSound.mp3Url, giftSound.volume, giftSound.label, {
                giftId: normalizedGift.giftId,
                eventType: 'gift',
                repeatCount
            });
            if (giftSound.animationType && giftSound.animationType !== 'none') {
                this.playGiftAnimation(normalizedGift, giftSound);
            }
        } else {
            // Only fetch default sound settings when no specific gift sound is configured
            const defaultUrl = this.db.getSetting('soundboard_default_gift_sound');
            if (defaultUrl) {
                const defaultVolume = parseFloat(this.db.getSetting('soundboard_gift_volume')) || 1.0;
                await this.playSound(defaultUrl, defaultVolume, 'Default Gift', {
                    giftId: normalizedGift.giftId,
                    eventType: 'gift',
                    repeatCount
                });
            } else {
                this.logger.debug(`[Soundboard] No sound configured for gift: ${normalizedGift.giftName} (ID: ${normalizedGift.giftId})`);
            }

            this.playDefaultGiftAnimation(normalizedGift);
        }
    }

    /**
     * Helper method: Check if URL is an audio file
     * @private
     */
    _isAudioFile(url) {
        if (!url || typeof url !== 'string') return false;
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        const urlLower = url.toLowerCase();
        // Remove query parameters for accurate extension detection
        const urlPath = urlLower.split('?')[0];
        return audioExtensions.some(ext => urlPath.endsWith(ext));
    }

    /**
     * Helper method: Play audio directly in the main app
     * @private
     */
    async _playAudioInMainApp(audioUrl, volume = 1.0, label = 'Animation Audio') {
        try {
            console.log(`🔊 [Soundboard] Playing audio animation in main app: ${audioUrl} (volume: ${volume})`);
            
            // Use the existing playSound() method
            await this.playSound(audioUrl, volume, label, {
                eventType: 'animation'
            });
            
        } catch (error) {
            if (this.logger) {
                this.logger.error(`Audio animation playback error: ${error.message}`);
            }
            console.error(`❌ [Soundboard] Audio animation playback failed: ${error.message}`);
        }
    }

    /**
     * Read global OBS animation placement settings.
     * Values are percentages so one setup works across OBS source sizes.
     */
    getAnimationLayout(overrides = {}) {
        const clampNumber = (value, fallback, min, max) => {
            const parsed = parseFloat(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(min, Math.min(max, parsed));
        };

        const readNumber = (key, fallback, min, max) => {
            const overrideValue = overrides[key];
            if (overrideValue !== undefined && overrideValue !== null && overrideValue !== '') {
                return clampNumber(overrideValue, fallback, min, max);
            }
            return clampNumber(this.db.getSetting(`soundboard_animation_${key}`), fallback, min, max);
        };

        const allowedAnchors = ['center', 'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'];
        const allowedFits = ['contain', 'cover', 'fill'];
        const settingAnchor = this.db.getSetting('soundboard_animation_anchor');
        const settingFit = this.db.getSetting('soundboard_animation_fit');
        const anchor = allowedAnchors.includes(overrides.anchor)
            ? overrides.anchor
            : (allowedAnchors.includes(settingAnchor) ? settingAnchor : 'center');
        const fit = allowedFits.includes(overrides.fit)
            ? overrides.fit
            : (allowedFits.includes(settingFit) ? settingFit : 'contain');

        return {
            x: readNumber('x', 50, 0, 100),
            y: readNumber('y', 50, 0, 100),
            width: readNumber('width', 45, 5, 100),
            height: readNumber('height', 45, 5, 100),
            duration: readNumber('duration', 5, 1, 30),
            anchor,
            fit
        };
    }

    /**
     * Emit a configured animation to OBS, or route audio animations to the app.
     */
    emitAnimation(channel, animationData, audioLabel = 'Animation') {
        if (!animationData || !animationData.url || !animationData.type || animationData.type === 'none') {
            return false;
        }

        const isAudioFile = this._isAudioFile(animationData.url);
        const isAudioType = animationData.type === 'audio';

        if (isAudioFile || isAudioType) {
            if (isAudioFile) {
                this._playAudioInMainApp(
                    animationData.url,
                    animationData.volume || 1.0,
                    audioLabel
                );
                return true;
            }

            console.warn(`[Soundboard] Animation type is 'audio' but URL does not match an audio extension: ${animationData.url}`);
            return false;
        }

        const payload = {
            ...animationData,
            layout: this.getAnimationLayout(animationData.layout),
            timestamp: animationData.timestamp || Date.now()
        };

        this.io.emit(channel, payload);
        return true;
    }

    /**
     * Play animation for gift event
     */
    playGiftAnimation(giftData, giftSound) {
        const animationData = {
            type: giftSound.animationType,
            url: giftSound.animationUrl,
            volume: giftSound.animationVolume || 1.0,
            giftName: giftData.giftName || giftSound.label,
            username: giftData.username || 'Anonymous',
            giftImage: giftData.giftPictureUrl || null,
            timestamp: Date.now()
        };

        this.emitAnimation('gift:animation', animationData, `Gift Animation: ${animationData.giftName}`);
        return;

        console.log(`🎬 Playing gift animation: ${animationData.type} for ${animationData.giftName} (volume: ${animationData.volume})`);
        
        this.emitAnimation('gift:animation', animationData, `Gift Animation: ${animationData.giftName}`);
        return;

        // Distinguish between audio and visual animations
        // Prioritize URL-based detection (more reliable than type declaration)
        const isAudioFile = this._isAudioFile(giftSound.animationUrl);
        const isAudioType = giftSound.animationType === 'audio';
        
        if (isAudioFile || isAudioType) {
            // Audio: play directly in the main app
            if (isAudioFile) {
                this._playAudioInMainApp(
                    giftSound.animationUrl, 
                    giftSound.animationVolume || 1.0,
                    `Gift Animation: ${animationData.giftName}`
                );
            } else {
                // Type is 'audio' but URL is not audio - log warning
                console.warn(`⚠️ [Soundboard] Animation type is 'audio' but URL doesn't match audio extension: ${giftSound.animationUrl}`);
            }
        } else if (giftSound.animationType !== 'none' && giftSound.animationUrl) {
            // Visual animations (video, gif, image) to OBS overlay
            this.io.emit('gift:animation', animationData);
        }
    }

    /**
     * Play the fallback animation for gifts without a gift-specific mapping.
     */
    playDefaultGiftAnimation(giftData) {
        const animationType = this.db.getSetting('soundboard_gift_animation_type');
        const animationUrl = this.db.getSetting('soundboard_gift_animation_url');
        const animationVolume = parseFloat(this.db.getSetting('soundboard_gift_animation_volume')) || 1.0;

        if (!animationType || animationType === 'none' || !animationUrl) {
            return;
        }

        this.playGiftAnimation(giftData, {
            label: 'Default Gift',
            animationType,
            animationUrl,
            animationVolume
        });
    }

    /**
     * Extract username from event data with fallbacks
     */
    getUsernameFromData(data) {
        return data.username || data.nickname || data.uniqueId || 'Anonymous';
    }

    /**
     * Play animation for event (follow, subscribe, share)
     */
    playEventAnimation(eventType, username) {
        const animationType = this.db.getSetting(`soundboard_${eventType}_animation_type`);
        const animationUrl = this.db.getSetting(`soundboard_${eventType}_animation_url`);
        const animationVolume = parseFloat(this.db.getSetting(`soundboard_${eventType}_animation_volume`)) || 1.0;

        if (!animationType || animationType === 'none' || !animationUrl) {
            return;
        }

        const animationData = {
            type: animationType,
            url: animationUrl,
            volume: animationVolume,
            eventType: eventType,
            username: username || 'Anonymous',
            timestamp: Date.now()
        };

        console.log(`🎬 Playing ${eventType} animation: ${animationData.type} (volume: ${animationData.volume})`);
        
        // Distinguish between audio and visual animations
        // Prioritize URL-based detection (more reliable than type declaration)
        const isAudioFile = this._isAudioFile(animationUrl);
        const isAudioType = animationType === 'audio';
        
        if (isAudioFile || isAudioType) {
            // Audio: play directly in the main app
            if (isAudioFile) {
                this._playAudioInMainApp(
                    animationUrl,
                    animationVolume,
                    `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Animation`
                );
            } else {
                // Type is 'audio' but URL is not audio - log warning
                console.warn(`⚠️ [Soundboard] Animation type is 'audio' but URL doesn't match audio extension: ${animationUrl}`);
            }
        } else {
            // Visual animations (video, gif, image) to OBS overlay
            this.emitAnimation(
                'event:animation',
                animationData,
                `${eventType.charAt(0).toUpperCase() + eventType.slice(1)} Animation`
            );
        }
    }

    /**
     * Play sound for follow event
     */
    async playFollowSound(data = {}) {
        console.log(`⭐ [Soundboard] Follow event received`);
        const url = this.db.getSetting('soundboard_follow_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_follow_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Follow', {
                eventType: 'follow'
            });
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for follow event`);
        }
        
        // Play animation if configured (independent of sound)
        this.playEventAnimation('follow', this.getUsernameFromData(data));
    }

    /**
     * Play sound for subscribe event
     */
    async playSubscribeSound(data = {}) {
        console.log(`🌟 [Soundboard] Subscribe event received`);
        const url = this.db.getSetting('soundboard_subscribe_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_subscribe_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Subscribe', {
                eventType: 'subscribe'
            });
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for subscribe event`);
        }
        
        // Play animation if configured (independent of sound)
        this.playEventAnimation('subscribe', this.getUsernameFromData(data));
    }

    /**
     * Play sound for share event
     */
    async playShareSound(data = {}) {
        console.log(`🔄 [Soundboard] Share event received`);
        const url = this.db.getSetting('soundboard_share_sound');
        const volume = parseFloat(this.db.getSetting('soundboard_share_volume')) || 1.0;

        if (url) {
            await this.playSound(url, volume, 'Share', {
                eventType: 'share'
            });
        } else {
            console.log(`ℹ️ [Soundboard] No sound configured for share event`);
        }
        
        // Play animation if configured (independent of sound)
        this.playEventAnimation('share', this.getUsernameFromData(data));
    }

    /**
     * Handle like event with threshold logic
     */
    async handleLikeEvent(likeCount, data = {}) {
        const now = Date.now();
        const threshold = parseInt(this.db.getSetting('soundboard_like_threshold')) || 0;
        const windowSeconds = parseInt(this.db.getSetting('soundboard_like_window_seconds')) || 10;

        if (threshold === 0) {
            return; // Like threshold disabled
        }

        console.log(`👍 [Soundboard] Like event received: ${likeCount} likes`);

        // Add current like event to history
        this.likeHistory.push({ count: likeCount, timestamp: now });

        // Remove likes outside the time window
        const windowMs = windowSeconds * 1000;
        this.likeHistory = this.likeHistory.filter(like => (now - like.timestamp) <= windowMs);

        // Enforce max size to prevent unbounded growth
        if (this.likeHistory.length > this.MAX_LIKE_HISTORY_SIZE) {
            this.likeHistory = this.likeHistory.slice(-this.MAX_LIKE_HISTORY_SIZE);
            if (this.logger) {
                this.logger.warn(`Like history exceeded ${this.MAX_LIKE_HISTORY_SIZE}, trimmed to most recent`);
            }
        }

        // Calculate total likes in window
        const totalLikes = this.likeHistory.reduce((sum, like) => sum + like.count, 0);

        console.log(`👍 [Soundboard] Like threshold check: ${totalLikes}/${threshold} likes in last ${windowSeconds}s`);

        // Check if threshold is met
        if (totalLikes >= threshold) {
            const url = this.db.getSetting('soundboard_like_sound');
            const volume = parseFloat(this.db.getSetting('soundboard_like_volume')) || 1.0;

            if (url) {
                console.log(`🎵 [Soundboard] Like threshold reached! Playing sound (${totalLikes} likes)`);
                await this.playSound(url, volume, `Like Threshold (${totalLikes} likes)`, {
                    eventType: 'like'
                });
            } else {
                console.log(`ℹ️ [Soundboard] Like threshold reached but no sound configured`);
            }

            this.playEventAnimation('like', this.getUsernameFromData(data));

            // Clear history after triggering
            this.likeHistory = [];
        }
    }

    /**
     * Core sound playback function
     * Queue management happens in the frontend based on play_mode
     * @param {string} url - URL of the sound file
     * @param {number} volume - Volume level (0.0 to 1.0)
     * @param {string} label - Display label for the sound
     * @param {Object} metadata - Optional metadata for queue management
     * @param {number} metadata.giftId - Gift ID for per-gift queue mode
     * @param {string} metadata.eventType - Event type (gift, follow, subscribe, share, like)
     */
    async playSound(url, volume = 1.0, label = 'Sound', metadata = {}) {
        // Validierung
        if (!url || typeof url !== 'string') {
            console.error('❌ [Soundboard] Invalid sound URL:', url);
            return;
        }

        if (typeof volume !== 'number' || volume < 0 || volume > 1) {
            console.warn('⚠️ [Soundboard] Invalid volume, using 1.0:', volume);
            volume = 1.0;
        }

        // Validate metadata
        let validGiftId = null;
        if (metadata.giftId !== undefined && metadata.giftId !== null) {
            const parsedGiftId = parseInt(metadata.giftId, 10);
            if (!isNaN(parsedGiftId) && parsedGiftId > 0) {
                validGiftId = parsedGiftId;
            } else {
                console.warn('⚠️ [Soundboard] Invalid giftId, ignoring:', metadata.giftId);
            }
        }

        const validEventTypes = ['gift', 'follow', 'subscribe', 'share', 'like', 'test', 'preview', 'animation'];
        let validEventType = 'unknown';
        if (metadata.eventType && typeof metadata.eventType === 'string') {
            const normalizedType = metadata.eventType.toLowerCase().trim();
            if (validEventTypes.includes(normalizedType)) {
                validEventType = normalizedType;
            } else {
                console.warn('⚠️ [Soundboard] Unknown eventType, using "unknown":', metadata.eventType);
            }
        }

        const soundData = {
            url: url,
            volume: volume,
            label: label,
            timestamp: Date.now(),
            giftId: validGiftId,
            eventType: validEventType,
            repeatCount: Math.max(parseInt(metadata.repeatCount || 1, 10) || 1, 1)
        };

        console.log(`🎵 [Soundboard] Emitting sound to frontend:`, {
            label: label,
            url: url,
            volume: volume,
            giftId: soundData.giftId,
            eventType: soundData.eventType,
            timestamp: new Date().toISOString()
        });

        // Always send to frontend immediately
        // Frontend handles queue management based on play_mode
        this.emitSound(soundData);
    }

    /**
     * Emit sound to overlay via Socket.io
     */
    emitSound(soundData) {
        // Get the audio playback target from settings (dashboard, obs_overlay, or both)
        // Default to 'both' for backwards compatibility
        const audioTarget = this.db.getSetting('soundboard_audio_target') || 'both';
        
        const payload = {
            url: soundData.url,
            volume: soundData.volume,
            label: soundData.label,
            giftId: soundData.giftId,
            eventType: soundData.eventType,
            repeatCount: soundData.repeatCount,
            timestamp: soundData.timestamp,
            audioTarget: audioTarget
        };
        
        console.log(`📡 [Soundboard] Emitting 'soundboard:play' event (target: ${audioTarget}):`, payload);
        
        this.io.emit('soundboard:play', payload);
        
        // Log the number of connected clients for debugging
        const clientCount = this.io.sockets.sockets.size;
        console.log(`📡 [Soundboard] Event emitted to ${clientCount} connected client(s)`);
    }

    /**
     * Test sound playback
     */
    async testSound(url, volume = 1.0) {
        await this.playSound(url, volume, 'Test Sound', {
            eventType: 'test'
        });
    }

    /**
     * Clear sound queue (deprecated - queue is now managed in frontend)
     */
    clearQueue() {
        // Queue management is now handled in the frontend
        console.log('⚠️ clearQueue() called but queue is managed in frontend');
    }

    /**
     * Get current queue status (deprecated - queue is now managed in frontend)
     */
    getQueueStatus() {
        return {
            length: 0,
            isProcessing: false,
            items: [],
            note: 'Queue management is now handled in the frontend'
        };
    }

    destroy() {
        // No backend playback timers are owned here; the frontend manages audio queues.
    }
}

/**
 * Soundboard Plugin
 *
 * Handles gift-specific sounds, audio queue management, and MyInstants integration
 */
class SoundboardPlugin {
    constructor(api) {
        this.api = api;
        this.soundboard = null;
    }

    async init() {
        this.api.log('Initializing Soundboard Plugin...', 'info');

        // Initialize SoundboardManager
        const db = this.api.getDatabase();
        const io = this.api.getSocketIO();
        this.soundboard = new SoundboardManager(db, io, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error'),
            debug: (msg) => this.api.log(msg, 'debug')
        });

        // Initialize MyInstants API
        this.myinstantsAPI = new MyInstantsAPI({
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error')
        });

        // Initialize Audio Cache Manager with persistent storage
        const configPathManager = this.api.getConfigPathManager();
        const cacheDir = path.join(configPathManager.getUserDataDir(), 'soundboard-cache', 'sounds');
        this.audioCacheManager = new AudioCacheManager(db, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error')
        }, cacheDir);

        this.api.log(`📂 [SOUNDBOARD] Using persistent cache storage: ${cacheDir}`, 'info');

        // Initialize Cache Cleanup Job
        this.cleanupJob = new CacheCleanupJob(this.audioCacheManager, {
            info: (msg) => this.api.log(msg, 'info'),
            warn: (msg) => this.api.log(msg, 'warn'),
            error: (msg) => this.api.log(msg, 'error')
        });
        
        // Run cleanup on startup (async, non-blocking)
        this.cleanupJob.runOnStartup().catch(err => {
            this.api.log(`Cache cleanup on startup failed: ${err.message}`, 'warn');
        });

        // Initialize preview system components
        this.initPreviewSystem();

        // Register routes
        this.registerRoutes();

        // Register TikTok event handlers
        this.registerTikTokEventHandlers();

        this.api.log('✅ Soundboard Plugin initialized', 'info');
    }

    /**
     * Initialize the client-side preview system
     */
    initPreviewSystem() {
        const apiLimiter = require('../../modules/rate-limiter').apiLimiter;
        
        // Get sounds directory path
        const soundsDir = path.join(__dirname, '../../public/sounds');
        
        // Initialize fetcher (path validation & URL whitelist)
        this.fetcher = new SoundboardFetcher();
        
        // Initialize WebSocket transport (dashboard client tracking & broadcasting)
        this.transport = new SoundboardWebSocketTransport(this.api);
        
        // Initialize API routes (preview endpoint with auth & validation)
        this.apiRoutes = new SoundboardApiRoutes(
            this.api,
            apiLimiter,
            this.fetcher,
            this.transport,
            {
                info: (msg) => this.api.log(msg, 'info'),
                warn: (msg) => this.api.log(msg, 'warn'),
                error: (msg) => this.api.log(msg, 'error')
            },
            soundsDir
        );
        
        this.api.log('✅ Soundboard preview system initialized (client-side mode)', 'info');
        
        // Check environment configuration
        const previewMode = process.env.SOUNDBOARD_PREVIEW_MODE || 'client';
        if (previewMode !== 'client') {
            this.api.log(`⚠️ SOUNDBOARD_PREVIEW_MODE is set to "${previewMode}" but only "client" mode is supported`, 'warn');
        }
    }

    registerRoutes() {
        // Serve plugin UI (configuration page)
        this.api.registerRoute('get', '/soundboard/ui', (req, res) => {
            const uiPath = path.join(__dirname, 'ui', 'index.html');
            res.sendFile(uiPath);
        });

        // Get all gift sounds
        this.api.registerRoute('get', '/api/soundboard/gifts', (req, res) => {
            try {
                const gifts = this.soundboard.getAllGiftSounds();
                res.json(gifts);
            } catch (error) {
                this.api.log(`Error getting gift sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Recommend frequently dropped gifts that do not have configured audio yet
        this.api.registerRoute('get', '/api/soundboard/recommendations/unconfigured-gifts', (req, res) => {
            try {
                const recommendations = this.soundboard.getUnconfiguredGiftRecommendations({
                    limit: req.query.limit,
                    lookback: req.query.lookback
                });
                res.json({ success: true, recommendations });
            } catch (error) {
                this.api.log(`Error getting gift recommendations: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Add/update gift sound
        this.api.registerRoute('post', '/api/soundboard/gifts', (req, res) => {
            const { giftId, label, mp3Url, volume, animationUrl, animationType, animationVolume } = req.body;

            if (!giftId || !label || !mp3Url) {
                return res.status(400).json({ success: false, error: 'giftId, label and mp3Url are required' });
            }

            try {
                // Validate and clamp volume values between 0 and 1
                const validVolume = Math.max(0, Math.min(1, parseFloat(volume) || 1.0));
                const validAnimVolume = Math.max(0, Math.min(1, parseFloat(animationVolume) || 1.0));

                const id = this.soundboard.setGiftSound(
                    giftId,
                    label,
                    mp3Url,
                    validVolume,
                    animationUrl || null,
                    animationType || 'none',
                    validAnimVolume
                );
                this.api.log(`🎵 Gift sound set: ${label} (ID: ${giftId})`, 'info');
                res.json({ success: true, id });
            } catch (error) {
                this.api.log(`Error setting gift sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Delete gift sound
        this.api.registerRoute('delete', '/api/soundboard/gifts/:giftId', (req, res) => {
            try {
                this.soundboard.deleteGiftSound(req.params.giftId);
                this.api.log(`🗑️ Deleted gift sound: ${req.params.giftId}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error deleting gift sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test sound
        this.api.registerRoute('post', '/api/soundboard/test', async (req, res) => {
            const { url, volume } = req.body;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            try {
                await this.soundboard.testSound(url, volume || 1.0);
                this.api.log(`🔊 Testing sound: ${url}`, 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error testing sound: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Test visual animation in the OBS overlay
        this.api.registerRoute('post', '/api/soundboard/test-animation', (req, res) => {
            const { url, type, volume, eventType, label, layout } = req.body || {};

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            try {
                const animationType = type && type !== 'none' ? type : 'auto';
                this.soundboard.emitAnimation('event:animation', {
                    type: animationType,
                    url,
                    volume: Math.max(0, Math.min(1, parseFloat(volume) || 1.0)),
                    eventType: eventType || 'test',
                    username: 'TestUser',
                    giftName: label || 'Test Animation',
                    layout,
                    timestamp: Date.now()
                }, label || 'Test Animation');

                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error testing animation: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get queue status
        this.api.registerRoute('get', '/api/soundboard/queue', (req, res) => {
            try {
                const status = this.soundboard.getQueueStatus();
                res.json(status);
            } catch (error) {
                this.api.log(`Error getting queue status: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Clear queue
        this.api.registerRoute('post', '/api/soundboard/queue/clear', (req, res) => {
            try {
                this.soundboard.clearQueue();
                this.api.log('🧹 Soundboard queue cleared', 'info');
                res.json({ success: true });
            } catch (error) {
                this.api.log(`Error clearing queue: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants search - NEW API
        this.api.registerRoute('get', '/api/myinstants/search', async (req, res) => {
            const { query, page, limit } = req.query;

            if (!query) {
                return res.status(400).json({ success: false, error: 'query is required' });
            }

            try {
                const results = await this.myinstantsAPI.search(query, page || 1, limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error searching MyInstants: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // GIF search for animation URLs. Uses the app-wide GIPHY key by default.
        this.api.registerRoute('get', '/api/soundboard/gif-search', async (req, res) => {
            const query = String(req.query.query || '').trim();
            const limit = Math.max(1, Math.min(30, parseInt(req.query.limit, 10) || 16));

            if (!query) {
                return res.status(400).json({ success: false, error: 'query is required' });
            }

            const apiKey = process.env.GIPHY_API_KEY || DEFAULT_GIPHY_API_KEY;

            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    needsApiKey: true,
                    provider: 'giphy',
                    error: 'GIPHY API key is required for GIF search'
                });
            }

            try {
                const response = await axios.get('https://api.giphy.com/v1/gifs/search', {
                    timeout: 15000,
                    params: {
                        api_key: apiKey,
                        q: query,
                        limit,
                        rating: 'pg-13',
                        lang: 'de'
                    }
                });

                const results = (response.data?.data || []).map(item => {
                    const images = item.images || {};
                    const original = images.original || images.downsized_medium || images.fixed_height;
                    const preview = images.fixed_width_small || images.fixed_height_small || images.downsized_still || original;
                    return {
                        id: item.id,
                        title: item.title || 'GIPHY GIF',
                        url: original?.url,
                        previewUrl: preview?.url || preview?.webp || original?.url,
                        width: parseInt(original?.width, 10) || null,
                        height: parseInt(original?.height, 10) || null,
                        source: 'giphy'
                    };
                }).filter(item => item.url);

                res.json({ success: true, provider: 'giphy', results });
            } catch (error) {
                this.api.log(`Error searching GIPHY GIFs: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants trending - NEW API
        this.api.registerRoute('get', '/api/myinstants/trending', async (req, res) => {
            const { limit } = req.query;

            try {
                const results = await this.myinstantsAPI.getTrending(limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting trending sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants random - NEW API
        this.api.registerRoute('get', '/api/myinstants/random', async (req, res) => {
            const { limit } = req.query;

            try {
                const results = await this.myinstantsAPI.getRandom(limit || 20);
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting random sounds: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants categories (optional) - NEW API
        this.api.registerRoute('get', '/api/myinstants/categories', async (req, res) => {
            try {
                const results = await this.myinstantsAPI.getCategories();
                res.json({ success: true, results });
            } catch (error) {
                this.api.log(`Error getting categories: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // MyInstants resolve URL - NEW API
        this.api.registerRoute('get', '/api/myinstants/resolve', async (req, res) => {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url is required' });
            }

            // Wenn es bereits eine direkte MP3-URL ist, direkt zurückgeben
            if (url.match(/\.mp3($|\?)/i)) {
                return res.json({ success: true, mp3: url });
            }

            try {
                const mp3Url = await this.myinstantsAPI.resolvePageUrl(url);
                return res.json({ success: true, mp3: mp3Url });
            } catch (error) {
                this.api.log(`Error resolving MyInstants URL: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // ========== WICHTIGSTER ENDPOINT: Audio Proxy mit Caching ==========
        this.api.registerRoute('get', '/api/myinstants/proxy-audio', async (req, res) => {
            const { url } = req.query;

            if (!url) {
                return res.status(400).json({ success: false, error: 'url parameter is required' });
            }

            try {
                // Validate URL is from MyInstants
                if (!this.myinstantsAPI.isValidMyInstantsUrl(url)) {
                    return res.status(403).json({ 
                        success: false, 
                        error: 'Only MyInstants URLs are allowed' 
                    });
                }

                // Check cache first
                let cacheEntry = this.audioCacheManager.getCacheEntry(url);

                if (cacheEntry) {
                    // Cache HIT - serve from cache
                    this.api.log(`[AudioProxy] Cache HIT: ${url}`, 'info');
                    
                    // Update last_played timestamp
                    this.audioCacheManager.updateLastPlayed(url);

                    // Stream cached file
                    const fileStream = fs.createReadStream(cacheEntry.file_path);
                    
                    res.setHeader('Content-Type', 'audio/mpeg');
                    res.setHeader('Cache-Control', 'public, max-age=3600');
                    res.setHeader('X-Cache-Status', 'HIT');
                    
                    fileStream.pipe(res);
                    
                } else {
                    // Cache MISS - download and cache
                    this.api.log(`[AudioProxy] Cache MISS: ${url}`, 'info');

                    try {
                        // Download and cache
                        cacheEntry = await this.audioCacheManager.cacheAudio(url);

                        this.api.log(`[AudioProxy] Cached successfully: ${url}`, 'info');

                        // Stream newly cached file
                        const fileStream = fs.createReadStream(cacheEntry.file_path);
                        
                        res.setHeader('Content-Type', 'audio/mpeg');
                        res.setHeader('Cache-Control', 'public, max-age=3600');
                        res.setHeader('X-Cache-Status', 'MISS');
                        
                        fileStream.pipe(res);

                    } catch (cacheError) {
                        this.api.log(`[AudioProxy] Cache error, falling back to direct proxy: ${cacheError.message}`, 'warn');
                        
                        // Fallback: Direct proxy without caching
                        const axios = require('axios');
                        const https = require('https');
                        const httpsAgent = new https.Agent({
                            rejectUnauthorized: true,
                            keepAlive: true,
                            timeout: 30000
                        });
                        
                        const response = await axios.get(url, {
                            responseType: 'stream',
                            timeout: 30000,
                            httpsAgent: httpsAgent,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Accept': 'audio/mpeg, audio/*;q=0.9, */*;q=0.8'
                            }
                        });

                        res.setHeader('Content-Type', 'audio/mpeg');
                        res.setHeader('X-Cache-Status', 'BYPASS');
                        response.data.pipe(res);
                    }
                }

            } catch (error) {
                this.api.log(`[AudioProxy] Error: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Cache management endpoints
        this.api.registerRoute('get', '/api/soundboard/cache/stats', (req, res) => {
            try {
                const stats = this.audioCacheManager.getCacheStats();
                res.json({ success: true, stats });
            } catch (error) {
                this.api.log(`Error getting cache stats: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('post', '/api/soundboard/cache/cleanup', async (req, res) => {
            try {
                const stats = await this.cleanupJob.runNow();
                res.json({ success: true, stats });
            } catch (error) {
                this.api.log(`Error running cleanup: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.registerRoute('delete', '/api/soundboard/cache', async (req, res) => {
            try {
                await this.audioCacheManager.clearCache();
                res.json({ success: true, message: 'Cache cleared' });
            } catch (error) {
                this.api.log(`Error clearing cache: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Export audio animations configuration
        this.api.registerRoute('get', '/api/soundboard/export-animations', (req, res) => {
            try {
                const sounds = this.soundboard.getAllGiftSounds();
                
                // Export all configured gift sounds (with and without animations)
                // This allows full configuration transfer between profiles
                const animationsData = sounds.map(sound => ({
                    giftId: sound.giftId,
                    label: sound.label,
                    mp3Url: sound.mp3Url,
                    volume: sound.volume,
                    animationUrl: sound.animationUrl || null,
                    animationType: sound.animationType || 'none',
                    animationVolume: sound.animationVolume || 1.0
                }));
                
                const exportData = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    animationsCount: animationsData.length,
                    animations: animationsData
                };
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="soundboard-animations-${Date.now()}.json"`);
                res.json(exportData);
                
                this.api.log(`Exported ${animationsData.length} audio animations`, 'info');
            } catch (error) {
                this.api.log(`Error exporting animations: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Import audio animations configuration
        this.api.registerRoute('post', '/api/soundboard/import-animations', (req, res) => {
            try {
                const importData = req.body;
                
                // Validate import data structure
                if (!importData || !importData.animations || !Array.isArray(importData.animations)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid import data format'
                    });
                }
                
                let imported = 0;
                let updated = 0;
                let failed = 0;
                const errors = [];
                
                // Import each animation configuration
                for (const anim of importData.animations) {
                    try {
                        // Validate required fields (allow giftId to be 0)
                        if (anim.giftId === undefined || anim.giftId === null || !anim.label || !anim.mp3Url) {
                            errors.push(`Missing required fields for gift ID ${anim.giftId !== undefined ? anim.giftId : 'unknown'}`);
                            failed++;
                            continue;
                        }
                        
                        // Check if gift sound already exists
                        const existing = this.soundboard.getGiftSound(anim.giftId);
                        
                        // Set the gift sound with animation data
                        this.soundboard.setGiftSound(
                            anim.giftId,
                            anim.label,
                            anim.mp3Url,
                            anim.volume || 1.0,
                            anim.animationUrl || null,
                            anim.animationType || 'none',
                            anim.animationVolume || 1.0
                        );
                        
                        if (existing) {
                            updated++;
                        } else {
                            imported++;
                        }
                    } catch (error) {
                        errors.push(`Failed to import gift ID ${anim.giftId}: ${error.message}`);
                        failed++;
                    }
                }
                
                const result = {
                    success: true,
                    imported,
                    updated,
                    failed,
                    total: importData.animations.length
                };
                
                if (errors.length > 0) {
                    result.errors = errors;
                }
                
                this.api.log(`Import complete: ${imported} new, ${updated} updated, ${failed} failed`, 'info');
                res.json(result);
                
            } catch (error) {
                this.api.log(`Error importing animations: ${error.message}`, 'error');
                res.status(500).json({ success: false, error: error.message });
            }
        });

        this.api.log('✅ Soundboard routes registered (with audio proxy & caching)', 'info');
    }

    registerTikTokEventHandlers() {
        const db = this.api.getDatabase();

        // Gift Event
        this.api.registerTikTokEvent('gift', async (data) => {
            // Enabled if not explicitly set to 'false' (matches frontend behavior)
            const soundboardEnabled = db.getSetting('soundboard_enabled') !== 'false';
            console.log(`🎁 [Soundboard] Gift event received. Enabled: ${soundboardEnabled} (setting value: ${db.getSetting('soundboard_enabled')})`);
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Gift event skipped - soundboard is disabled');
                return;
            }
            await this.soundboard.playGiftSound(data);
        });

        // Follow Event
        this.api.registerTikTokEvent('follow', async (data) => {
            // Enabled if not explicitly set to 'false' (matches frontend behavior)
            const soundboardEnabled = db.getSetting('soundboard_enabled') !== 'false';
            console.log(`⭐ [Soundboard] Follow event received. Enabled: ${soundboardEnabled} (setting value: ${db.getSetting('soundboard_enabled')})`);
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Follow event skipped - soundboard is disabled');
                return;
            }
            await this.soundboard.playFollowSound(data);
        });

        // Subscribe Event
        this.api.registerTikTokEvent('subscribe', async (data) => {
            // Enabled if not explicitly set to 'false' (matches frontend behavior)
            const soundboardEnabled = db.getSetting('soundboard_enabled') !== 'false';
            console.log(`🌟 [Soundboard] Subscribe event received. Enabled: ${soundboardEnabled} (setting value: ${db.getSetting('soundboard_enabled')})`);
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Subscribe event skipped - soundboard is disabled');
                return;
            }
            await this.soundboard.playSubscribeSound(data);
        });

        // Share Event
        this.api.registerTikTokEvent('share', async (data) => {
            // Enabled if not explicitly set to 'false' (matches frontend behavior)
            const soundboardEnabled = db.getSetting('soundboard_enabled') !== 'false';
            console.log(`🔄 [Soundboard] Share event received. Enabled: ${soundboardEnabled} (setting value: ${db.getSetting('soundboard_enabled')})`);
            if (!soundboardEnabled) {
                console.log('ℹ️ [Soundboard] Share event skipped - soundboard is disabled');
                return;
            }
            await this.soundboard.playShareSound(data);
        });

        // Like Event
        this.api.registerTikTokEvent('like', async (data) => {
            // Enabled if not explicitly set to 'false' (matches frontend behavior)
            const soundboardEnabled = db.getSetting('soundboard_enabled') !== 'false';
            // Note: Like events are very frequent, so we skip logging to reduce noise
            if (!soundboardEnabled) {
                return;
            }
            await this.soundboard.handleLikeEvent(data.likeCount || 1, data);
        });

        this.api.log('✅ Soundboard TikTok event handlers registered', 'info');
    }

    /**
     * Public method to access soundboard manager (for other modules/plugins)
     */
    getSoundboard() {
        return this.soundboard;
    }

    async destroy() {
        if (this.soundboard) {
            this.soundboard.destroy();
        }
        this.api.log('🎵 Soundboard Plugin destroyed', 'info');
    }
}

module.exports = SoundboardPlugin;
module.exports.SoundboardManager = SoundboardManager;
