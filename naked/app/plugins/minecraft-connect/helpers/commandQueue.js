/**
 * Command Queue Manager
 * 
 * Manages queuing and rate limiting of Minecraft commands
 */

class CommandQueue {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        
        this.queue = [];
        this.processing = false;
        this.lastCommandTime = 0;
        this.commandsInLastMinute = [];
        
        // Stats
        this.stats = {
            totalQueued: 0,
            totalProcessed: 0,
            totalFailed: 0,
            totalDropped: 0
        };
    }

    /**
     * Add command to queue
     */
    enqueue(command, priority = 0) {
        const maxQueueSize = this.config.limits?.maxQueueSize || 100;
        
        if (this.queue.length >= maxQueueSize) {
            this.logger.warn('Command queue full, dropping command');
            this.stats.totalDropped++;
            return false;
        }

        this.queue.push({
            ...command,
            priority,
            timestamp: Date.now(),
            id: this.generateId()
        });

        this.stats.totalQueued++;
        
        // Sort by priority (higher first)
        this.queue.sort((a, b) => b.priority - a.priority);
        
        // Start processing if not already running
        if (!this.processing) {
            this.processQueue();
        }

        return true;
    }

    /**
     * Process queue
     */
    async processQueue() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;

        while (this.queue.length > 0) {
            // Check rate limit
            if (!this.checkRateLimit()) {
                // Wait for cooldown
                await this.sleep(100);
                continue;
            }

            const command = this.queue.shift();
            
            try {
                await this.executeCommand(command);
                this.stats.totalProcessed++;
                this.recordCommand();
            } catch (error) {
                this.logger.error(`Command execution failed: ${error.message}`);
                this.stats.totalFailed++;
                
                // Emit error event
                if (command.onError) {
                    command.onError(error);
                }
            }

            // Apply cooldown between commands
            const cooldown = this.config.limits?.commandCooldown || 1000;
            if (cooldown > 0) {
                await this.sleep(cooldown);
            }
        }

        this.processing = false;
    }

    /**
     * Execute a command
     */
    async executeCommand(command) {
        if (!command.executor) {
            throw new Error('No executor provided for command');
        }

        this.logger.debug(`Executing command: ${command.action}`);
        
        await command.executor(command.action, command.params);
        
        if (command.onSuccess) {
            command.onSuccess();
        }
    }

    /**
     * Check if we're within rate limits
     */
    checkRateLimit() {
        const now = Date.now();
        const maxPerMinute = this.config.limits?.maxActionsPerMinute || 30;
        
        // Clean up old entries
        this.commandsInLastMinute = this.commandsInLastMinute.filter(
            time => now - time < 60000
        );

        // Check limit
        if (this.commandsInLastMinute.length >= maxPerMinute) {
            return false;
        }

        return true;
    }

    /**
     * Record command execution for rate limiting
     */
    recordCommand() {
        const now = Date.now();
        this.lastCommandTime = now;
        this.commandsInLastMinute.push(now);
        
        // Keep only last minute
        this.commandsInLastMinute = this.commandsInLastMinute.filter(
            time => now - time < 60000
        );
    }

    /**
     * Clear queue
     */
    clear() {
        const count = this.queue.length;
        this.queue = [];
        this.logger.info(`Cleared ${count} commands from queue`);
        return count;
    }

    /**
     * Get queue status
     */
    getStatus() {
        return {
            queueSize: this.queue.length,
            processing: this.processing,
            stats: this.stats,
            commandsInLastMinute: this.commandsInLastMinute.length
        };
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Sleep utility
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = CommandQueue;
