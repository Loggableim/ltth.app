/**
 * IFTTT Trigger Registry
 * Central registry for all available triggers in the automation system
 */

class TriggerRegistry {
    constructor(logger) {
        this.logger = logger;
        this.triggers = new Map();
        this.registerCoreTriggers();
    }

    /**
     * Register a trigger
     * @param {string} id - Unique trigger ID
     * @param {Object} config - Trigger configuration
     */
    register(id, config) {
        if (this.triggers.has(id)) {
            this.logger?.warn(`Trigger ${id} already registered, overwriting`);
        }

        const trigger = {
            id,
            name: config.name || id,
            description: config.description || '',
            category: config.category || 'custom',
            icon: config.icon || 'zap',
            fields: config.fields || [],
            validator: config.validator || null,
            metadata: config.metadata || {}
        };

        this.triggers.set(id, trigger);
        this.logger?.info(`✅ Registered trigger: ${id}`);
    }

    /**
     * Unregister a trigger
     */
    unregister(id) {
        if (this.triggers.has(id)) {
            this.triggers.delete(id);
            this.logger?.info(`Unregistered trigger: ${id}`);
            return true;
        }
        return false;
    }

    /**
     * Get trigger configuration
     */
    get(id) {
        return this.triggers.get(id);
    }

    /**
     * Get all triggers
     */
    getAll() {
        return Array.from(this.triggers.values());
    }

    /**
     * Get all triggers for frontend (without validator functions)
     */
    getAllForFrontend() {
        return Array.from(this.triggers.values()).map(trigger => {
            const { validator, ...triggerWithoutValidator } = trigger;
            return triggerWithoutValidator;
        });
    }

    /**
     * Get triggers by category
     */
    getByCategory(category) {
        return Array.from(this.triggers.values()).filter(t => t.category === category);
    }

    /**
     * Check if trigger exists
     */
    has(id) {
        return this.triggers.has(id);
    }

    /**
     * Register core TikTok triggers
     */
    registerCoreTriggers() {
        // TikTok Events
        this.register('tiktok:gift', {
            name: 'Gift Received',
            description: 'Triggered when a viewer sends a gift',
            category: 'tiktok',
            icon: 'gift',
            fields: [
                { name: 'giftName', label: 'Gift Name', type: 'text' },
                { name: 'giftId', label: 'Gift ID', type: 'number' },
                { name: 'coins', label: 'Coins', type: 'number' },
                { name: 'repeatCount', label: 'Repeat Count', type: 'number' },
                { name: 'username', label: 'Username', type: 'text' },
                { name: 'nickname', label: 'Nickname', type: 'text' }
            ]
        });

        this.register('tiktok:chat', {
            name: 'Chat Message',
            description: 'Triggered when a viewer sends a chat message',
            category: 'tiktok',
            icon: 'message-circle',
            fields: [
                { name: 'message', label: 'Message', type: 'text' },
                { name: 'username', label: 'Username', type: 'text' },
                { name: 'nickname', label: 'Nickname', type: 'text' }
            ]
        });

        this.register('tiktok:follow', {
            name: 'New Follow',
            description: 'Triggered when someone follows the stream',
            category: 'tiktok',
            icon: 'user-plus',
            fields: [
                { name: 'username', label: 'Username', type: 'text' },
                { name: 'nickname', label: 'Nickname', type: 'text' }
            ]
        });

        this.register('tiktok:share', {
            name: 'Stream Shared',
            description: 'Triggered when someone shares the stream',
            category: 'tiktok',
            icon: 'share-2',
            fields: [
                { name: 'username', label: 'Username', type: 'text' }
            ]
        });

        this.register('tiktok:like', {
            name: 'Likes Received',
            description: 'Triggered when someone likes the stream',
            category: 'tiktok',
            icon: 'heart',
            fields: [
                { name: 'likeCount', label: 'Like Count', type: 'number' },
                { name: 'totalLikeCount', label: 'Total Likes', type: 'number' },
                { name: 'username', label: 'Username', type: 'text' }
            ]
        });

        this.register('tiktok:join', {
            name: 'Viewer Joined',
            description: 'Triggered when a viewer joins the stream',
            category: 'tiktok',
            icon: 'log-in',
            fields: [
                { name: 'username', label: 'Username', type: 'text' },
                { name: 'nickname', label: 'Nickname', type: 'text' }
            ]
        });

        this.register('tiktok:subscribe', {
            name: 'New Subscriber',
            description: 'Triggered when someone subscribes',
            category: 'tiktok',
            icon: 'star',
            fields: [
                { name: 'username', label: 'Username', type: 'text' },
                { name: 'subMonth', label: 'Month', type: 'number' }
            ]
        });

        this.register('tiktok:viewerChange', {
            name: 'Viewer Count Changed',
            description: 'Triggered when viewer count changes',
            category: 'tiktok',
            icon: 'users',
            fields: [
                { name: 'viewerCount', label: 'Viewer Count', type: 'number' }
            ]
        });

        // System Events
        this.register('system:connected', {
            name: 'TikTok Connected',
            description: 'Triggered when connected to TikTok LIVE',
            category: 'system',
            icon: 'wifi',
            fields: []
        });

        this.register('system:disconnected', {
            name: 'TikTok Disconnected',
            description: 'Triggered when disconnected from TikTok LIVE',
            category: 'system',
            icon: 'wifi-off',
            fields: [
                { name: 'reason', label: 'Reason', type: 'text' }
            ]
        });

        this.register('system:error', {
            name: 'System Error',
            description: 'Triggered when a system error occurs',
            category: 'system',
            icon: 'alert-triangle',
            fields: [
                { name: 'error', label: 'Error Message', type: 'text' },
                { name: 'module', label: 'Module', type: 'text' }
            ]
        });

        // Timer Events
        this.register('timer:interval', {
            name: 'Interval Timer',
            description: 'Triggered at regular intervals',
            category: 'timer',
            icon: 'clock',
            fields: [
                { name: 'intervalSeconds', label: 'Interval (seconds)', type: 'number' }
            ],
            metadata: { requiresScheduler: true }
        });

        this.register('timer:countdown', {
            name: 'Countdown Timer',
            description: 'Triggered after a countdown completes',
            category: 'timer',
            icon: 'timer',
            fields: [
                { name: 'seconds', label: 'Seconds', type: 'number' }
            ],
            metadata: { requiresScheduler: true }
        });

        this.register('timer:schedule', {
            name: 'Scheduled Time',
            description: 'Triggered at specific time(s)',
            category: 'timer',
            icon: 'calendar',
            fields: [
                { name: 'time', label: 'Time (HH:MM)', type: 'text' },
                { name: 'days', label: 'Days', type: 'multiselect', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] }
            ],
            metadata: { requiresScheduler: true }
        });

        // Manual Trigger
        this.register('manual:trigger', {
            name: 'Manual Trigger',
            description: 'Manually triggered from dashboard or API',
            category: 'manual',
            icon: 'hand',
            fields: []
        });

        // Webhook Trigger
        this.register('webhook:incoming', {
            name: 'Webhook Received',
            description: 'Triggered when webhook receives data',
            category: 'webhook',
            icon: 'globe',
            fields: [
                { name: 'path', label: 'Webhook Path', type: 'text' },
                { name: 'method', label: 'HTTP Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] }
            ],
            metadata: { requiresWebhookEndpoint: true }
        });

        // Plugin Events
        this.register('plugin:event', {
            name: 'Plugin Event',
            description: 'Triggered by plugin-specific events',
            category: 'plugin',
            icon: 'puzzle',
            fields: [
                { name: 'pluginId', label: 'Plugin ID', type: 'text' },
                { name: 'eventName', label: 'Event Name', type: 'text' }
            ]
        });

        // Goal Events
        this.register('goal:reached', {
            name: 'Goal Reached',
            description: 'Triggered when a goal is reached',
            category: 'goal',
            icon: 'target',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number' },
                { name: 'goalType', label: 'Goal Type', type: 'text' },
                { name: 'targetValue', label: 'Target Value', type: 'number' }
            ]
        });

        this.register('goal:progress', {
            name: 'Goal Progress',
            description: 'Triggered when goal progress changes',
            category: 'goal',
            icon: 'trending-up',
            fields: [
                { name: 'goalId', label: 'Goal ID', type: 'number' },
                { name: 'percentage', label: 'Percentage', type: 'number' }
            ]
        });
    }
}

module.exports = TriggerRegistry;
