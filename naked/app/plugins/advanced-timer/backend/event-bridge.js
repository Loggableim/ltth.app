/**
 * Advanced Timer Event Bridge
 * Replaces event-handlers.js with an in-memory cache for O(1) per-event lookups.
 *
 * For each TikTok event type the bridge checks cached per_* values first (no DB queries).
 * It falls back to the advanced_timer_events table only for timers that have advanced rules
 * (gift-name filters, minCoins, commands, keywords, etc.).
 */

class TimerEventBridge {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;

        // In-memory cache: timerId → { per_coin, per_follow, … , multiplier, multiplier_enabled }
        this.cache = new Map();

        // Pre-computed set of timer IDs that have advanced event rules
        this.timersWithAdvancedRules = new Set();

        // Like speed tracking (kept from old event-handlers for likesToSpeedRatio feature)
        this.likesPerSecondTracker = new Map();
        this.likeTrackingInterval = null;
    }

    /**
     * Build / rebuild the in-memory cache from the database.
     * Call this whenever a timer is created, updated or deleted.
     */
    rebuildCache() {
        try {
            this.cache.clear();
            this.timersWithAdvancedRules.clear();
            const timers = this.plugin.db.getAllTimers();
            for (const t of timers) {
                this.cache.set(t.id, {
                    per_coin: parseFloat(t.per_coin) || 0,
                    per_follow: parseFloat(t.per_follow) || 0,
                    per_share: parseFloat(t.per_share) || 0,
                    per_subscribe: parseFloat(t.per_subscribe) || 0,
                    per_like: parseFloat(t.per_like) || 0,
                    per_chat: parseFloat(t.per_chat) || 0,
                    multiplier: parseFloat(t.multiplier) || 1.0,
                    multiplier_enabled: t.multiplier_enabled ? true : false
                });
            }
            // Pre-compute which timers have advanced event rules (gift-name filters, conditions, etc.)
            const allEvents = this.plugin.db.db.prepare('SELECT DISTINCT timer_id FROM advanced_timer_events WHERE enabled = 1').all();
            for (const { timer_id } of allEvents) {
                this.timersWithAdvancedRules.add(timer_id);
            }
            this.api.log(`EventBridge cache rebuilt: ${this.cache.size} timer(s), ${this.timersWithAdvancedRules.size} with advanced rules`, 'debug');
        } catch (error) {
            this.api.log(`EventBridge rebuildCache error: ${error.message}`, 'error');
        }
    }

    /**
     * Update a single timer entry in the cache without a full rebuild.
     * Used by interaction/multiplier endpoints for efficiency.
     * Falls back to a full rebuildCache() when the timer is not yet cached.
     */
    updateCacheEntry(timerId, fields) {
        const existing = this.cache.get(timerId);
        if (existing) {
            Object.assign(existing, fields);
        } else {
            this.api.log(`EventBridge: timer ${timerId} not found in cache — triggering full rebuild`, 'debug');
            this.rebuildCache();
        }
    }

    registerHandlers() {
        this.api.registerTikTokEvent('gift', (data) => this.handleGiftEvent(data));
        this.api.registerTikTokEvent('like', (data) => this.handleLikeEvent(data));
        this.api.registerTikTokEvent('follow', (data) => this.handleFollowEvent(data));
        this.api.registerTikTokEvent('share', (data) => this.handleShareEvent(data));
        this.api.registerTikTokEvent('subscribe', (data) => this.handleSubscribeEvent(data));
        this.api.registerTikTokEvent('chat', (data) => this.handleChatEvent(data));

        this.startLikeTracking();
        this.api.log('Advanced Timer EventBridge handlers registered', 'info');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply a flat per_* interaction to all cached timers.
     * @param {string} field   - e.g. 'per_coin'
     * @param {number} units   - number of units (coins, likes, …)
     * @param {string} source  - source string for logging
     * @param {string} logType - event type name for the log entry
     * @param {string} userId  - TikTok uniqueId
     * @param {string} logMsg  - human-readable description
     */
    _applyFlat(field, units, source, logType, userId, logMsg) {
        if (this.cache.size === 0) {
            this.api.log(`EventBridge _applyFlat: no timers in cache for ${logType} event — skipping`, 'debug');
            return;
        }
        for (const [timerId, cached] of this.cache.entries()) {
            const perUnit = cached[field];
            this.api.log(`EventBridge _applyFlat: timer=${timerId} ${field}=${perUnit} units=${units} source=${source}`, 'debug');
            if (perUnit === 0) continue;

            const timer = this.plugin.engine.getTimer(timerId);
            if (!timer) continue;

            const mult = cached.multiplier_enabled ? cached.multiplier : 1.0;
            const delta = perUnit * units * mult;

            if (delta > 0) {
                timer.addTime(delta, source);
            } else if (delta < 0) {
                timer.removeTime(-delta, source);
            } else {
                continue;
            }

            this.plugin.db.updateTimerState(timerId, timer.state, timer.currentValue);
            this.plugin.db.addTimerLog(timerId, logType, userId, delta, logMsg);
        }
    }

    /**
     * Apply advanced timer_events rules (gift-name filter, minCoins, commands, etc.)
     * Only processes events that have conditions set.
     */
    _applyAdvancedEvents(eventType, timerId, timer, data) {
        const events = this.plugin.db.getTimerEvents(timerId);

        for (const ev of events) {
            if (!ev.enabled) continue;
            if (ev.event_type !== eventType) continue;

            const conditions = ev.conditions || {};

            // Gift-specific conditions
            if (eventType === 'gift') {
                if (conditions.giftName && conditions.giftName !== data.giftName) continue;
                if (conditions.minCoins && (data.coins || 0) < conditions.minCoins) continue;
            }

            // Like-specific conditions
            if (eventType === 'like') {
                if (conditions.minLikes && (data.likeCount || 0) < conditions.minLikes) continue;
            }

            // Chat conditions
            if (eventType === 'chat') {
                if (conditions.command) {
                    const cmd = conditions.command.toLowerCase();
                    if (!data.comment || !data.comment.toLowerCase().startsWith(cmd)) continue;
                }
                if (conditions.keyword) {
                    const kw = conditions.keyword.toLowerCase();
                    if (!data.comment || !data.comment.toLowerCase().includes(kw)) continue;
                }
            }

            const actionValue = parseFloat(ev.action_value) || 0;
            let units = 1;
            if (eventType === 'gift') units = (data.coins || 0) * (data.repeatCount || 1);
            else if (eventType === 'like') units = data.likeCount || 1;

            const actualValue = actionValue * units;

            if (ev.action_type === 'add_time') {
                timer.addTime(actualValue, `${eventType}:${data.uniqueId}`);
                this.plugin.db.updateTimerState(timerId, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(timerId, eventType, data.uniqueId, actualValue, `Advanced rule: +${actualValue.toFixed(2)}s`);
            } else if (ev.action_type === 'remove_time') {
                timer.removeTime(actualValue, `${eventType}:${data.uniqueId}`);
                this.plugin.db.updateTimerState(timerId, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(timerId, eventType, data.uniqueId, -actualValue, `Advanced rule: -${actualValue.toFixed(2)}s`);
            } else if (ev.action_type === 'set_value') {
                timer.setValue(actionValue);
                this.plugin.db.updateTimerState(timerId, timer.state, timer.currentValue);
                this.plugin.db.addTimerLog(timerId, eventType, data.uniqueId, 0, `Advanced rule: set to ${actionValue}s`);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event handlers
    // ─────────────────────────────────────────────────────────────────────────

    async handleGiftEvent(data) {
        try {
            const { giftName, coins, uniqueId, repeatCount } = data;
            const totalCoins = (coins || 0) * (repeatCount || 1);

            // Fast flat path (per_coin)
            this._applyFlat(
                'per_coin', totalCoins,
                `gift:${uniqueId}`, 'gift', uniqueId,
                `Gift: ${giftName} (${coins} coins) x${repeatCount || 1} = ${totalCoins.toFixed(0)} coins`
            );

            // Advanced rules fallback — only for pre-computed timers that have event rows
            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (this.timersWithAdvancedRules.has(timer.id)) {
                    this._applyAdvancedEvents('gift', timer.id, timer, data);
                }
            }
        } catch (error) {
            this.api.log(`EventBridge gift error: ${error.message}`, 'error');
        }
    }

    async handleLikeEvent(data) {
        try {
            const { likeCount, uniqueId } = data;
            const count = likeCount || 1;

            // Track likes for speed modifier
            this.likesPerSecondTracker.set(Date.now(), count);

            // Fast flat path (per_like)
            this._applyFlat(
                'per_like', count,
                `like:${uniqueId}`, 'like', uniqueId,
                `Likes: ${count}`
            );

            // Advanced rules fallback
            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (this.timersWithAdvancedRules.has(timer.id)) {
                    this._applyAdvancedEvents('like', timer.id, timer, data);
                }
            }
        } catch (error) {
            this.api.log(`EventBridge like error: ${error.message}`, 'error');
        }
    }

    async handleFollowEvent(data) {
        try {
            const { uniqueId } = data;
            this._applyFlat('per_follow', 1, `follow:${uniqueId}`, 'follow', uniqueId, 'New follower');

            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (this.timersWithAdvancedRules.has(timer.id)) {
                    this._applyAdvancedEvents('follow', timer.id, timer, data);
                }
            }
        } catch (error) {
            this.api.log(`EventBridge follow error: ${error.message}`, 'error');
        }
    }

    async handleShareEvent(data) {
        try {
            const { uniqueId } = data;
            this._applyFlat('per_share', 1, `share:${uniqueId}`, 'share', uniqueId, 'Stream shared');

            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (this.timersWithAdvancedRules.has(timer.id)) {
                    this._applyAdvancedEvents('share', timer.id, timer, data);
                }
            }
        } catch (error) {
            this.api.log(`EventBridge share error: ${error.message}`, 'error');
        }
    }

    async handleSubscribeEvent(data) {
        try {
            const { uniqueId } = data;
            this._applyFlat('per_subscribe', 1, `subscribe:${uniqueId}`, 'subscribe', uniqueId, 'New subscriber');

            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (this.timersWithAdvancedRules.has(timer.id)) {
                    this._applyAdvancedEvents('subscribe', timer.id, timer, data);
                }
            }
        } catch (error) {
            this.api.log(`EventBridge subscribe error: ${error.message}`, 'error');
        }
    }

    async handleChatEvent(data) {
        try {
            const { uniqueId, comment } = data;
            this._applyFlat('per_chat', 1, `chat:${uniqueId}`, 'chat', uniqueId, `Chat: ${(comment || '').substring(0, 50)}`);

            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (this.timersWithAdvancedRules.has(timer.id)) {
                    this._applyAdvancedEvents('chat', timer.id, timer, data);
                }
            }
        } catch (error) {
            this.api.log(`EventBridge chat error: ${error.message}`, 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Like-speed tracking (retained for likesToSpeedRatio feature)
    // ─────────────────────────────────────────────────────────────────────────

    startLikeTracking() {
        this.likeTrackingInterval = setInterval(() => {
            const now = Date.now();
            const twoSecondsAgo = now - 2000;

            let recentLikes = 0;
            for (const [ts, count] of this.likesPerSecondTracker.entries()) {
                if (ts < twoSecondsAgo) {
                    this.likesPerSecondTracker.delete(ts);
                } else {
                    recentLikes += count;
                }
            }

            const likesPerSecond = recentLikes / 2;
            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (timer.config.likesToSpeedRatio > 0) {
                    timer.updateLikeSpeed(likesPerSecond);
                }
            }
        }, 2000);
    }

    destroy() {
        if (this.likeTrackingInterval) {
            clearInterval(this.likeTrackingInterval);
            this.likeTrackingInterval = null;
        }
        this.likesPerSecondTracker.clear();
        this.cache.clear();
        this.timersWithAdvancedRules.clear();
    }
}

module.exports = TimerEventBridge;
