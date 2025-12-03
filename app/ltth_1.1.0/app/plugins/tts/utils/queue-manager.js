/**
 * TTS Queue Manager
 * Manages TTS queue with prioritization, rate limiting, flood control, and deduplication
 */
class QueueManager {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;

        // Queue storage (priority queue)
        this.queue = [];
        this.isProcessing = false;
        this.currentItem = null;

        // Rate limiting: track user message timestamps
        this.userRateLimits = new Map();

        // Deduplication: track recently queued items by content hash
        this.recentHashes = new Map();
        this.maxRecentHashes = 500; // Keep last 500 hashes
        this.hashExpirationMs = 30000; // Hashes expire after 30 seconds

        // Queue statistics
        this.stats = {
            totalQueued: 0,
            totalPlayed: 0,
            totalDropped: 0,
            totalRateLimited: 0,
            totalDuplicatesBlocked: 0
        };
    }

    /**
     * Generate hash for content deduplication
     * @param {object} item - Queue item
     * @returns {string} Content hash
     */
    _generateContentHash(item) {
        // Create hash from userId + text (normalized)
        const text = (item.text || '').toLowerCase().trim();
        const userId = item.userId || 'unknown';
        
        // Include timestamp rounded to nearest 5 seconds to allow same user to say same thing
        // but prevent rapid duplicates (within 5 second window)
        const timestamp = Math.floor(Date.now() / 5000);
        
        return `${userId}|${text}|${timestamp}`;
    }

    /**
     * Check if item is duplicate based on content hash
     * @param {object} item - Queue item
     * @returns {boolean} true if duplicate, false if unique
     */
    _isDuplicate(item) {
        const hash = this._generateContentHash(item);
        const now = Date.now();
        
        // Clean up expired hashes
        for (const [h, timestamp] of this.recentHashes.entries()) {
            if (now - timestamp > this.hashExpirationMs) {
                this.recentHashes.delete(h);
            }
        }
        
        // Check if hash exists
        if (this.recentHashes.has(hash)) {
            this.logger.warn(`Duplicate TTS item blocked: "${item.text?.substring(0, 30)}..." from ${item.username}`);
            return true;
        }
        
        // Add hash to tracking
        this.recentHashes.set(hash, now);
        
        // Limit cache size
        if (this.recentHashes.size > this.maxRecentHashes) {
            const firstKey = this.recentHashes.keys().next().value;
            this.recentHashes.delete(firstKey);
        }
        
        return false;
    }

    /**
     * Add item to queue
     * @param {object} item - Queue item { userId, username, text, voice, engine, audioData, priority, ... }
     * @returns {object} { success: boolean, reason: string, position: number }
     */
    enqueue(item) {
        try {
            // Check for duplicate content
            if (this._isDuplicate(item)) {
                this.stats.totalDuplicatesBlocked++;
                return {
                    success: false,
                    reason: 'duplicate_content',
                    message: 'This message was already queued recently'
                };
            }

            // Check rate limit
            if (!this._checkRateLimit(item.userId, item.username)) {
                this.stats.totalRateLimited++;
                this.logger.warn(`Rate limit exceeded for user ${item.username}`);
                return {
                    success: false,
                    reason: 'rate_limit',
                    retryAfter: this._getRateLimitRetryTime(item.userId)
                };
            }

            // Check max queue size
            if (this.queue.length >= this.config.maxQueueSize) {
                this.stats.totalDropped++;
                this.logger.error(`Queue full (${this.config.maxQueueSize}), dropping message from ${item.username}`);
                return {
                    success: false,
                    reason: 'queue_full',
                    queueSize: this.queue.length,
                    maxSize: this.config.maxQueueSize
                };
            }

            // Add timestamp and ID
            item.timestamp = Date.now();
            item.id = this._generateId();

            // Default priority if not set
            if (item.priority === undefined) {
                item.priority = this._calculatePriority(item);
            }

            // Add to queue and sort by priority
            this.queue.push(item);
            this._sortQueue();

            this.stats.totalQueued++;

            // Update rate limit tracker
            this._recordUserMessage(item.userId);

            const position = this.queue.findIndex(q => q.id === item.id) + 1;

            this.logger.info(`TTS queued: "${item.text.substring(0, 30)}..." from ${item.username} (priority: ${item.priority}, position: ${position}/${this.queue.length})`);

            return {
                success: true,
                position,
                queueSize: this.queue.length,
                estimatedWaitMs: this._estimateWaitTime(position)
            };

        } catch (error) {
            this.logger.error(`Failed to enqueue TTS: ${error.message}`);
            return {
                success: false,
                reason: 'error',
                error: error.message
            };
        }
    }

    /**
     * Get next item from queue
     */
    dequeue() {
        if (this.queue.length === 0) {
            return null;
        }

        // Sort to ensure highest priority is first
        this._sortQueue();

        return this.queue.shift();
    }

    /**
     * Start processing queue
     */
    startProcessing(playCallback) {
        if (this.isProcessing) {
            this.logger.warn('Queue processing already started');
            return;
        }

        this.isProcessing = true;
        this.logger.info('TTS Queue processing started');

        this._processNext(playCallback);
    }

    /**
     * Stop processing queue
     */
    stopProcessing() {
        this.isProcessing = false;
        this.currentItem = null;
        this.logger.info('TTS Queue processing stopped');
    }

    /**
     * Process next item in queue
     */
    async _processNext(playCallback) {
        if (!this.isProcessing) {
            return;
        }

        // Get next item
        const item = this.dequeue();

        if (!item) {
            // Queue empty, check again in 1 second
            setTimeout(() => this._processNext(playCallback), 1000);
            return;
        }

        this.currentItem = item;

        try {
            // Call play callback
            await playCallback(item);

            this.stats.totalPlayed++;
            this.logger.info(`TTS played: "${item.text.substring(0, 30)}..." (queue remaining: ${this.queue.length})`);

        } catch (error) {
            this.logger.error(`TTS playback error: ${error.message}`);
        } finally {
            this.currentItem = null;

            // Process next item
            setTimeout(() => this._processNext(playCallback), 100);
        }
    }

    /**
     * Calculate priority for item
     * Higher priority = played first
     */
    _calculatePriority(item) {
        let priority = 0;

        // Team level priority (higher team level = higher priority)
        if (item.teamLevel !== undefined) {
            priority += item.teamLevel * 10;
        }

        // Subscriber priority
        if (item.isSubscriber) {
            priority += 5;
        }

        // Gift-triggered TTS (higher priority)
        if (item.source === 'gift') {
            priority += 20;
        }

        // Manual trigger (highest priority)
        if (item.source === 'manual') {
            priority += 50;
        }

        return priority;
    }

    /**
     * Sort queue by priority (descending)
     */
    _sortQueue() {
        this.queue.sort((a, b) => {
            // Higher priority first
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            // Same priority -> FIFO (older first)
            return a.timestamp - b.timestamp;
        });
    }

    /**
     * Check if user is rate limited
     */
    _checkRateLimit(userId, username) {
        const now = Date.now();
        const userLimit = this.userRateLimits.get(userId);

        if (!userLimit) {
            return true; // No history, allow
        }

        // Filter timestamps within rate limit window
        const windowMs = this.config.rateLimitWindow * 1000;
        const recentMessages = userLimit.timestamps.filter(ts => now - ts < windowMs);

        // Update user limit with filtered timestamps
        this.userRateLimits.set(userId, {
            timestamps: recentMessages,
            username
        });

        // Check if exceeded limit
        if (recentMessages.length >= this.config.rateLimit) {
            return false;
        }

        return true;
    }

    /**
     * Record user message for rate limiting
     */
    _recordUserMessage(userId) {
        const now = Date.now();
        const userLimit = this.userRateLimits.get(userId);

        if (!userLimit) {
            this.userRateLimits.set(userId, {
                timestamps: [now],
                username: userId
            });
        } else {
            userLimit.timestamps.push(now);

            // Limit cache size (LRU)
            if (this.userRateLimits.size > 1000) {
                const firstKey = this.userRateLimits.keys().next().value;
                this.userRateLimits.delete(firstKey);
            }
        }
    }

    /**
     * Get time until user can send again
     */
    _getRateLimitRetryTime(userId) {
        const userLimit = this.userRateLimits.get(userId);
        if (!userLimit || userLimit.timestamps.length === 0) {
            return 0;
        }

        const now = Date.now();
        const windowMs = this.config.rateLimitWindow * 1000;
        const oldestTimestamp = userLimit.timestamps[0];
        const retryAfter = (oldestTimestamp + windowMs) - now;

        return Math.max(0, Math.ceil(retryAfter / 1000)); // Return seconds
    }

    /**
     * Estimate wait time for position in queue
     */
    _estimateWaitTime(position) {
        // Rough estimate: 5 seconds per item + current item remaining time
        const avgDurationMs = 5000;
        return position * avgDurationMs;
    }

    /**
     * Generate unique ID
     */
    _generateId() {
        return `tts_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    }

    /**
     * Clear entire queue
     */
    clear() {
        const count = this.queue.length;
        this.queue = [];
        this.currentItem = null;
        // Also clear deduplication cache when clearing queue
        this.clearDeduplicationCache();
        this.logger.info(`Queue cleared: ${count} items removed, deduplication cache cleared`);
        return count;
    }

    /**
     * Remove specific item from queue
     */
    remove(itemId) {
        const index = this.queue.findIndex(item => item.id === itemId);
        if (index !== -1) {
            const item = this.queue.splice(index, 1)[0];
            this.logger.info(`Removed item from queue: ${item.text.substring(0, 30)}...`);
            return true;
        }
        return false;
    }

    /**
     * Skip current item
     */
    skipCurrent() {
        if (this.currentItem) {
            this.logger.info(`Skipped current item: ${this.currentItem.text.substring(0, 30)}...`);
            this.currentItem = null;
            return true;
        }
        return false;
    }

    /**
     * Get queue info
     */
    getInfo() {
        return {
            size: this.queue.length,
            maxSize: this.config.maxQueueSize,
            isProcessing: this.isProcessing,
            currentItem: this.currentItem ? {
                id: this.currentItem.id,
                username: this.currentItem.username,
                text: this.currentItem.text.substring(0, 50),
                priority: this.currentItem.priority
            } : null,
            nextItems: this.queue.slice(0, 5).map(item => ({
                id: item.id,
                username: item.username,
                text: item.text.substring(0, 50),
                priority: item.priority
            }))
        };
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            ...this.stats,
            currentQueueSize: this.queue.length,
            rateLimitedUsers: this.userRateLimits.size,
            recentHashesSize: this.recentHashes.size
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalQueued: 0,
            totalPlayed: 0,
            totalDropped: 0,
            totalRateLimited: 0,
            totalDuplicatesBlocked: 0
        };
        this.logger.info('Queue statistics reset');
    }

    /**
     * Clear rate limit for user
     */
    clearUserRateLimit(userId) {
        this.userRateLimits.delete(userId);
        this.logger.info(`Rate limit cleared for user: ${userId}`);
    }

    /**
     * Clear all rate limits
     */
    clearAllRateLimits() {
        this.userRateLimits.clear();
        this.logger.info('All rate limits cleared');
    }

    /**
     * Clear deduplication cache
     */
    clearDeduplicationCache() {
        this.recentHashes.clear();
        this.logger.info('Deduplication cache cleared');
    }
}

module.exports = QueueManager;
