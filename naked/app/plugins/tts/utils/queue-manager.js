/**
 * TTS Queue Manager
 * Manages TTS queue with prioritization, rate limiting, flood control, deduplication, and pre-generation
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
        this.hashExpirationMs = 60000; // Hashes expire after 60 seconds (matches TikTok module deduplication)

        // Pre-generation system
        this.preGenerationInProgress = new Map(); // Track ongoing pre-generations by item ID
        this.preGenerateCount = 3; // Number of items to pre-generate
        this.synthesizeCallback = null; // Callback for synthesis (set by TTSPlugin)

        // Queue statistics
        this.stats = {
            totalQueued: 0,
            totalPlayed: 0,
            totalDropped: 0,
            totalRateLimited: 0,
            totalDuplicatesBlocked: 0,
            preGenerationHits: 0,
            preGenerationMisses: 0,
            preGenerationErrors: 0
        };
    }

    /**
     * Set synthesis callback for pre-generation
     * @param {Function} callback - Async function(text, voice, engine, options) => audioData
     */
    setSynthesizeCallback(callback) {
        this.synthesizeCallback = callback;
        this.logger.info('Pre-generation synthesis callback registered');
    }

    /**
     * Peek at next N items in queue without removing them
     * @param {number} count - Number of items to peek at
     * @returns {Array} Array of next items
     */
    peek(count = 1) {
        // Sort to ensure correct order
        this._sortQueue();
        return this.queue.slice(0, count);
    }

    /**
     * Generate hash for content deduplication
     * @param {object} item - Queue item
     * @returns {string} Content hash
     */
    _generateContentHash(item) {
        // Create hash from userId + text (normalized)
        // Note: No timestamp in hash to ensure duplicates are always caught
        // The expiration time controls how long we remember duplicates
        const text = (item.text || '').toLowerCase().trim();
        const userId = item.userId || 'unknown';
        
        return `${userId}|${text}`;
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
            const existingTimestamp = this.recentHashes.get(hash);
            const timeSinceFirst = now - existingTimestamp;
            this.logger.warn(
                `🔄 [DUPLICATE BLOCKED] TTS item already queued ${Math.floor(timeSinceFirst / 1000)}s ago: ` +
                `"${item.text?.substring(0, 30)}..." from ${item.username} (hash: ${hash.substring(0, 30)}...)`
            );
            return true;
        }
        
        // Add hash to tracking
        this.recentHashes.set(hash, now);
        
        // Limit cache size (LRU eviction)
        if (this.recentHashes.size > this.maxRecentHashes) {
            const firstKey = this.recentHashes.keys().next().value;
            this.recentHashes.delete(firstKey);
        }
        
        this.logger.debug(`✓ TTS item unique, queuing: "${item.text?.substring(0, 30)}..." from ${item.username} (hash: ${hash.substring(0, 30)}...)`);
        
        return false;
    }

    /**
     * Add item to queue
     * @param {object} item - Queue item { userId, username, text, voice, engine, audioData, priority, bypassDuplicateFilter, ... }
     * @returns {object} { success: boolean, reason: string, position: number }
     */
    enqueue(item) {
        try {
            // Check for duplicate content (skip if bypass flag is set)
            if (!item.bypassDuplicateFilter && this._isDuplicate(item)) {
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
        const preGenStatus = this.synthesizeCallback ? 'with pre-generation enabled' : '(pre-generation not configured)';
        this.logger.info(`TTS Queue processing started ${preGenStatus}`);

        this._processNextOptimized(playCallback);
    }

    /**
     * Stop processing queue
     */
    stopProcessing() {
        this.isProcessing = false;
        this.currentItem = null;
        // Cancel any pending pre-generations
        this.preGenerationInProgress.clear();
        this.logger.info('TTS Queue processing stopped, pre-generations cancelled');
    }

    /**
     * Trigger pre-generation for next N items in queue
     */
    async _triggerPreGeneration() {
        if (!this.synthesizeCallback) {
            return; // No callback registered, skip pre-generation
        }

        const nextItems = this.peek(this.preGenerateCount);
        
        for (const item of nextItems) {
            // Skip if already has audio data or is streaming
            if (item.audioData || item.isStreaming) {
                continue;
            }

            // Skip if already pre-generating
            if (this.preGenerationInProgress.has(item.id)) {
                continue;
            }

            // Start pre-generation (fire and forget)
            this._preGenerateItem(item);
        }
    }

    /**
     * Find next item in queue with assigned custom voice
     * @param {string} currentItemId - Current item's ID to exclude (to avoid re-processing current item)
     * @returns {object|null} Next item with custom voice or null
     */
    _findNextItemWithAssignedVoice(currentItemId) {
        for (const item of this.queue) {
            // Skip the current item being processed
            if (item.id === currentItemId) {
                continue;
            }

            // Check if item has assigned custom voice
            if (item.hasAssignedVoice === true) {
                return item;
            }
        }

        return null;
    }

    /**
     * Pre-generate audio for a custom voice item
     * @param {object} item - Queue item with custom voice
     */
    async _preGenerateCustomVoiceItem(item) {
        const itemId = item.id;

        // Skip if item already has audio data
        if (item.audioData) {
            this.logger.debug(`[PRE-GEN] Skipping item ${itemId} - already has audio data`);
            return;
        }

        // Check if already pre-generating this item
        if (this.preGenerationInProgress.has(itemId)) {
            return;
        }

        // Mark as in progress
        this.preGenerationInProgress.set(itemId, true);

        try {
            this.logger.info(
                `🚀 [PRE-GEN] Starting pre-generation for custom voice user: ${item.username} ` +
                `(${item.engine}/${item.voice})`
            );
            this.logger.debug(`[PRE-GEN] Custom voice item details: "${item.text?.substring(0, 30)}...", ID: ${itemId}`);

            const audioData = await this.synthesizeCallback(
                item.text,
                item.voice,
                item.engine,
                item.synthesisOptions || {}
            );

            // Store audio data in the queue item
            const queueItem = this.queue.find(q => q.id === itemId);
            if (queueItem) {
                queueItem.audioData = audioData;
                queueItem.preGenerated = true;
                this.logger.info(
                    `✅ [PRE-GEN] Pre-generated audio for ${item.username}: ${audioData?.length || 0} bytes`
                );
            } else {
                this.logger.debug(`[PRE-GEN] Item ${itemId} no longer in queue (may have been removed)`);
            }

        } catch (error) {
            this.stats.preGenerationErrors++;
            this.logger.warn(`❌ [PRE-GEN] Failed for ${item.username}: ${error.message}`);
        } finally {
            this.preGenerationInProgress.delete(itemId);
        }
    }

    /**
     * Pre-generate audio for a single item
     * @param {object} item - Queue item
     */
    async _preGenerateItem(item) {
        const itemId = item.id;
        
        // Mark as in progress
        this.preGenerationInProgress.set(itemId, true);
        
        try {
            this.logger.debug(`[PRE-GEN] Starting pre-generation for item ${itemId}: "${item.text?.substring(0, 30)}..."`);
            
            const audioData = await this.synthesizeCallback(
                item.text,
                item.voice,
                item.engine,
                item.synthesisOptions || {}
            );
            
            // Store audio data in the queue item
            const queueItem = this.queue.find(q => q.id === itemId);
            if (queueItem) {
                queueItem.audioData = audioData;
                this.logger.debug(`[PRE-GEN] Completed for item ${itemId}, audio length: ${audioData?.length || 0}`);
            } else {
                this.logger.debug(`[PRE-GEN] Item ${itemId} no longer in queue (may have been removed)`);
            }
            
        } catch (error) {
            this.stats.preGenerationErrors++;
            this.logger.warn(`[PRE-GEN] Failed for item ${itemId}: ${error.message}`);
        } finally {
            this.preGenerationInProgress.delete(itemId);
        }
    }

    /**
     * Process next item in queue (optimized with pre-generation)
     */
    async _processNextOptimized(playCallback) {
        if (!this.isProcessing) {
            return;
        }

        // Get next item
        const item = this.dequeue();

        if (!item) {
            // Queue empty, check again in 500ms (optimized from 1000ms)
            setTimeout(() => this._processNextOptimized(playCallback), 500);
            return;
        }

        this.currentItem = item;

        // Track pre-generation effectiveness
        if (item.audioData && !item.isStreaming) {
            this.stats.preGenerationHits++;
            this.logger.debug(`[PRE-GEN] HIT: Audio ready for item ${item.id}`);
        } else if (!item.isStreaming) {
            this.stats.preGenerationMisses++;
            this.logger.debug(`[PRE-GEN] MISS: Audio not ready for item ${item.id}`);
        }

        try {
            // Trigger pre-generation for upcoming items BEFORE playing current item
            this._triggerPreGeneration();

            // NEW: Trigger pre-generation for next custom voice item (parallel, non-blocking)
            if (item.id && this.synthesizeCallback) {
                const nextCustomVoiceItem = this._findNextItemWithAssignedVoice(item.id);
                if (nextCustomVoiceItem && !nextCustomVoiceItem.audioData && !nextCustomVoiceItem.preGenerated && !nextCustomVoiceItem.isStreaming) {
                    // Start pre-generation for custom voice user (fire and forget)
                    this._preGenerateCustomVoiceItem(nextCustomVoiceItem);
                }
            }

            // Call play callback
            await playCallback(item);

            this.stats.totalPlayed++;
            this.logger.info(`TTS played: "${item.text.substring(0, 30)}..." (queue remaining: ${this.queue.length})`);

        } catch (error) {
            this.logger.error(`TTS playback error: ${error.message}`);
        } finally {
            this.currentItem = null;

            // Process next item (optimized delay: 50ms instead of 100ms)
            setTimeout(() => this._processNextOptimized(playCallback), 50);
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
        // Cancel any pending pre-generations
        this.preGenerationInProgress.clear();
        // Also clear deduplication cache when clearing queue
        this.clearDeduplicationCache();
        this.logger.info(`Queue cleared: ${count} items removed, pre-generations cancelled, deduplication cache cleared`);
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
                priority: this.currentItem.priority,
                hasAudio: !!this.currentItem.audioData,
                isPreGenerating: this.preGenerationInProgress.has(this.currentItem.id)
            } : null,
            nextItems: this.queue.slice(0, 5).map(item => ({
                id: item.id,
                username: item.username,
                text: item.text.substring(0, 50),
                priority: item.priority,
                hasAudio: !!item.audioData,
                isPreGenerating: this.preGenerationInProgress.has(item.id)
            }))
        };
    }

    /**
     * Get queue statistics
     */
    getStats() {
        const totalPreGenAttempts = this.stats.preGenerationHits + this.stats.preGenerationMisses;
        const preGenerationHitRate = totalPreGenAttempts > 0 
            ? ((this.stats.preGenerationHits / totalPreGenAttempts) * 100).toFixed(1) + '%'
            : 'N/A';

        return {
            ...this.stats,
            currentQueueSize: this.queue.length,
            rateLimitedUsers: this.userRateLimits.size,
            recentHashesSize: this.recentHashes.size,
            preGenerationHitRate: preGenerationHitRate,
            activePreGenerations: this.preGenerationInProgress.size
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
            totalDuplicatesBlocked: 0,
            preGenerationHits: 0,
            preGenerationMisses: 0,
            preGenerationErrors: 0
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
