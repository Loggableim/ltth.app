/**
 * Advanced Timer Event Handlers
 * Handles TikTok events and applies them to timers
 */

class TimerEventHandlers {
    constructor(plugin) {
        this.plugin = plugin;
        this.api = plugin.api;
        
        // Track likes for speed calculation
        this.likesPerSecondTracker = new Map();
        this.likeTrackingInterval = null;
    }

    registerHandlers() {
        // Register TikTok event handlers
        this.api.registerTikTokEvent('gift', (data) => {
            this.handleGiftEvent(data);
        });

        this.api.registerTikTokEvent('like', (data) => {
            this.handleLikeEvent(data);
        });

        this.api.registerTikTokEvent('follow', (data) => {
            this.handleFollowEvent(data);
        });

        this.api.registerTikTokEvent('share', (data) => {
            this.handleShareEvent(data);
        });

        this.api.registerTikTokEvent('subscribe', (data) => {
            this.handleSubscribeEvent(data);
        });

        this.api.registerTikTokEvent('chat', (data) => {
            this.handleChatEvent(data);
        });

        // Start like tracking for speed modifications
        this.startLikeTracking();

        this.api.log('Advanced Timer TikTok event handlers registered', 'info');
    }

    /**
     * Handle gift events
     */
    async handleGiftEvent(data) {
        try {
            const { giftName, coins, uniqueId, repeatCount } = data;
            
            // Get all timers
            const timers = this.plugin.db.getAllTimers();
            
            for (const timerConfig of timers) {
                const timer = this.plugin.engine.getTimer(timerConfig.id);
                if (!timer) continue;

                // Get timer events configured for gift
                const events = this.plugin.db.getTimerEvents(timerConfig.id);
                
                for (const event of events) {
                    if (!event.enabled) continue;
                    if (event.event_type !== 'gift') continue;

                    // Check conditions
                    const conditions = event.conditions || {};
                    
                    // Check gift name filter
                    if (conditions.giftName && conditions.giftName !== giftName) {
                        continue;
                    }

                    // Check minimum coins
                    if (conditions.minCoins && coins < conditions.minCoins) {
                        continue;
                    }

                    // Apply action
                    const actionValue = event.action_value || 0;
                    const actualValue = actionValue * (repeatCount || 1);
                    
                    if (event.action_type === 'add_time') {
                        timer.addTime(actualValue, `gift:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'gift',
                            uniqueId,
                            actualValue,
                            `Gift: ${giftName} (${coins} coins) x${repeatCount}`
                        );
                    } else if (event.action_type === 'remove_time') {
                        timer.removeTime(actualValue, `gift:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'gift',
                            uniqueId,
                            -actualValue,
                            `Gift: ${giftName} (${coins} coins) x${repeatCount}`
                        );
                    } else if (event.action_type === 'set_value') {
                        timer.setValue(actionValue);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'gift',
                            uniqueId,
                            0,
                            `Gift: ${giftName} - Set to ${actionValue}s`
                        );
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling gift event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle like events
     */
    async handleLikeEvent(data) {
        try {
            const { likeCount, uniqueId, totalLikeCount } = data;
            
            // Track likes for speed calculation
            const now = Date.now();
            this.likesPerSecondTracker.set(now, likeCount || 1);

            // Get all timers
            const timers = this.plugin.db.getAllTimers();
            
            for (const timerConfig of timers) {
                const timer = this.plugin.engine.getTimer(timerConfig.id);
                if (!timer) continue;

                // Get timer events configured for likes
                const events = this.plugin.db.getTimerEvents(timerConfig.id);
                
                for (const event of events) {
                    if (!event.enabled) continue;
                    if (event.event_type !== 'like') continue;

                    // Check conditions
                    const conditions = event.conditions || {};
                    
                    // Check minimum like count per event
                    if (conditions.minLikes && likeCount < conditions.minLikes) {
                        continue;
                    }

                    // Apply action
                    const actionValue = event.action_value || 0;
                    const actualValue = actionValue * (likeCount || 1);
                    
                    if (event.action_type === 'add_time') {
                        timer.addTime(actualValue, `like:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'like',
                            uniqueId,
                            actualValue,
                            `Likes: ${likeCount}`
                        );
                    } else if (event.action_type === 'remove_time') {
                        timer.removeTime(actualValue, `like:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'like',
                            uniqueId,
                            -actualValue,
                            `Likes: ${likeCount}`
                        );
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling like event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle follow events
     */
    async handleFollowEvent(data) {
        try {
            const { uniqueId } = data;
            
            // Get all timers
            const timers = this.plugin.db.getAllTimers();
            
            for (const timerConfig of timers) {
                const timer = this.plugin.engine.getTimer(timerConfig.id);
                if (!timer) continue;

                // Get timer events configured for follows
                const events = this.plugin.db.getTimerEvents(timerConfig.id);
                
                for (const event of events) {
                    if (!event.enabled) continue;
                    if (event.event_type !== 'follow') continue;

                    // Apply action
                    const actionValue = event.action_value || 0;
                    
                    if (event.action_type === 'add_time') {
                        timer.addTime(actionValue, `follow:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'follow',
                            uniqueId,
                            actionValue,
                            'New follower'
                        );
                    } else if (event.action_type === 'remove_time') {
                        timer.removeTime(actionValue, `follow:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'follow',
                            uniqueId,
                            -actionValue,
                            'New follower'
                        );
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling follow event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle share events
     */
    async handleShareEvent(data) {
        try {
            const { uniqueId } = data;
            
            // Get all timers
            const timers = this.plugin.db.getAllTimers();
            
            for (const timerConfig of timers) {
                const timer = this.plugin.engine.getTimer(timerConfig.id);
                if (!timer) continue;

                // Get timer events configured for shares
                const events = this.plugin.db.getTimerEvents(timerConfig.id);
                
                for (const event of events) {
                    if (!event.enabled) continue;
                    if (event.event_type !== 'share') continue;

                    // Apply action
                    const actionValue = event.action_value || 0;
                    
                    if (event.action_type === 'add_time') {
                        timer.addTime(actionValue, `share:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'share',
                            uniqueId,
                            actionValue,
                            'Stream shared'
                        );
                    } else if (event.action_type === 'remove_time') {
                        timer.removeTime(actionValue, `share:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'share',
                            uniqueId,
                            -actionValue,
                            'Stream shared'
                        );
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling share event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle subscribe events
     */
    async handleSubscribeEvent(data) {
        try {
            const { uniqueId } = data;
            
            // Get all timers
            const timers = this.plugin.db.getAllTimers();
            
            for (const timerConfig of timers) {
                const timer = this.plugin.engine.getTimer(timerConfig.id);
                if (!timer) continue;

                // Get timer events configured for subscribes
                const events = this.plugin.db.getTimerEvents(timerConfig.id);
                
                for (const event of events) {
                    if (!event.enabled) continue;
                    if (event.event_type !== 'subscribe') continue;

                    // Apply action
                    const actionValue = event.action_value || 0;
                    
                    if (event.action_type === 'add_time') {
                        timer.addTime(actionValue, `subscribe:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'subscribe',
                            uniqueId,
                            actionValue,
                            'New subscriber'
                        );
                    } else if (event.action_type === 'remove_time') {
                        timer.removeTime(actionValue, `subscribe:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'subscribe',
                            uniqueId,
                            -actionValue,
                            'New subscriber'
                        );
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling subscribe event: ${error.message}`, 'error');
        }
    }

    /**
     * Handle chat events
     */
    async handleChatEvent(data) {
        try {
            const { uniqueId, comment } = data;
            
            // Get all timers
            const timers = this.plugin.db.getAllTimers();
            
            for (const timerConfig of timers) {
                const timer = this.plugin.engine.getTimer(timerConfig.id);
                if (!timer) continue;

                // Get timer events configured for chat
                const events = this.plugin.db.getTimerEvents(timerConfig.id);
                
                for (const event of events) {
                    if (!event.enabled) continue;
                    if (event.event_type !== 'chat') continue;

                    // Check conditions
                    const conditions = event.conditions || {};
                    
                    // Check for command match
                    if (conditions.command) {
                        const command = conditions.command.toLowerCase();
                        if (!comment || !comment.toLowerCase().startsWith(command)) {
                            continue;
                        }
                    }

                    // Check for keyword match
                    if (conditions.keyword) {
                        const keyword = conditions.keyword.toLowerCase();
                        if (!comment || !comment.toLowerCase().includes(keyword)) {
                            continue;
                        }
                    }

                    // Apply action
                    const actionValue = event.action_value || 0;
                    
                    if (event.action_type === 'add_time') {
                        timer.addTime(actionValue, `chat:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'chat',
                            uniqueId,
                            actionValue,
                            `Chat: ${comment?.substring(0, 50)}`
                        );
                    } else if (event.action_type === 'remove_time') {
                        timer.removeTime(actionValue, `chat:${uniqueId}`);
                        this.plugin.db.updateTimerState(timerConfig.id, timer.state, timer.currentValue);
                        this.plugin.db.addTimerLog(
                            timerConfig.id,
                            'chat',
                            uniqueId,
                            -actionValue,
                            `Chat: ${comment?.substring(0, 50)}`
                        );
                    }
                }
            }
        } catch (error) {
            this.api.log(`Error handling chat event: ${error.message}`, 'error');
        }
    }

    /**
     * Start tracking likes per second for speed modifications
     */
    startLikeTracking() {
        // Calculate likes per second every 2 seconds
        this.likeTrackingInterval = setInterval(() => {
            const now = Date.now();
            const twoSecondsAgo = now - 2000;
            
            // Remove old entries and count recent likes
            let recentLikes = 0;
            const entriesToDelete = [];
            
            for (const [timestamp, count] of this.likesPerSecondTracker.entries()) {
                if (timestamp < twoSecondsAgo) {
                    entriesToDelete.push(timestamp);
                } else {
                    recentLikes += count;
                }
            }
            
            // Clean up old entries
            for (const timestamp of entriesToDelete) {
                this.likesPerSecondTracker.delete(timestamp);
            }
            
            // Calculate likes per second (average over 2 seconds)
            const likesPerSecond = recentLikes / 2;
            
            // Update all timers with like-based speed modifications
            const timers = this.plugin.engine.getAllTimers();
            for (const timer of timers) {
                if (timer.config.likesToSpeedRatio > 0) {
                    timer.updateLikeSpeed(likesPerSecond);
                }
            }
        }, 2000);
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.likeTrackingInterval) {
            clearInterval(this.likeTrackingInterval);
            this.likeTrackingInterval = null;
        }
        this.likesPerSecondTracker.clear();
    }
}

module.exports = TimerEventHandlers;
