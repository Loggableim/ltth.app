/**
 * Command Parser
 * 
 * Parses chat messages, validates syntax, checks permissions,
 * and routes to appropriate handlers.
 */

const config = require('./config');

class CommandParser {
    constructor(registry, permissionChecker, logger) {
        this.registry = registry;
        this.permissionChecker = permissionChecker;
        this.logger = logger;
        
        // Rate limiting
        this.userRateLimits = new Map(); // userId -> { count, resetTime }
        this.globalRateLimit = { count: 0, resetTime: Date.now() + 60000 };
    }

    /**
     * Parse and execute a chat message
     * @param {string} message - The chat message
     * @param {Object} context - Execution context (user, permissions, etc.)
     * @returns {Promise<Object>} Execution result
     */
    async parse(message, context) {
        try {
            // Check if message is a command
            if (!this.isCommand(message)) {
                return { isCommand: false };
            }

            // Check rate limiting
            const rateLimitResult = this.checkRateLimit(context.userId);
            if (!rateLimitResult.allowed) {
                return {
                    success: false,
                    error: config.ERRORS.RATE_LIMIT_EXCEEDED,
                    displayOverlay: true
                };
            }

            // Parse command structure
            const parsed = this.parseCommandStructure(message);
            
            // Look up command in registry
            const commandDef = this.registry.getCommand(parsed.command);
            
            if (!commandDef) {
                return {
                    success: false,
                    error: config.ERRORS.COMMAND_NOT_FOUND,
                    displayOverlay: true
                };
            }

            // Check if command is enabled
            if (!commandDef.enabled) {
                return {
                    success: false,
                    error: config.ERRORS.COMMAND_DISABLED,
                    displayOverlay: true
                };
            }

            // Check permissions
            const hasPermission = this.permissionChecker.checkPermission(
                context.userRole,
                commandDef.permission
            );
            
            if (!hasPermission) {
                return {
                    success: false,
                    error: config.ERRORS.PERMISSION_DENIED,
                    displayOverlay: true
                };
            }

            // Validate arguments
            const validationResult = this.validateArguments(parsed.args, commandDef);
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: validationResult.error,
                    displayOverlay: true,
                    suggestion: `Use /help ${parsed.command} for correct syntax`
                };
            }

            // Execute command
            const result = await this.executeCommand(commandDef, parsed.args, context);
            
            // Record execution
            this.registry.recordExecution(parsed.command, result.success);
            
            return result;

        } catch (error) {
            this.logger.error(`[GCCE Parser] Error parsing command: ${error.message}`);
            return {
                success: false,
                error: 'An error occurred while processing your command.',
                displayOverlay: true
            };
        }
    }

    /**
     * Check if a message is a command
     * @param {string} message - The message to check
     * @returns {boolean} True if message is a command
     */
    isCommand(message) {
        return message && message.trim().startsWith(config.COMMAND_PREFIX);
    }

    /**
     * Parse command structure from message
     * @param {string} message - The command message
     * @returns {Object} Parsed structure { command, args, raw }
     */
    parseCommandStructure(message) {
        // Input validation - prevent DoS with extremely long messages
        if (message.length > 500) {
            throw new Error('Command message is too long');
        }
        
        // Remove prefix
        const withoutPrefix = message.trim().substring(config.COMMAND_PREFIX.length);
        
        // Split into parts
        const parts = withoutPrefix.trim().split(/\s+/);
        
        // Extract command and arguments
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        return {
            command,
            args,
            raw: message.trim()
        };
    }

    /**
     * Validate command arguments
     * @param {Array} args - Arguments array
     * @param {Object} commandDef - Command definition
     * @returns {Object} Validation result { valid, error? }
     */
    validateArguments(args, commandDef) {
        // Check minimum arguments
        if (args.length < commandDef.minArgs) {
            return {
                valid: false,
                error: `${config.ERRORS.MISSING_ARGUMENTS}\nSyntax: ${commandDef.syntax}`
            };
        }

        // Check maximum arguments
        if (args.length > commandDef.maxArgs) {
            return {
                valid: false,
                error: `Too many arguments.\nSyntax: ${commandDef.syntax}`
            };
        }

        // Custom validation if provided
        if (commandDef.validateArgs) {
            try {
                const customValidation = commandDef.validateArgs(args);
                if (!customValidation.valid) {
                    return customValidation;
                }
            } catch (error) {
                return {
                    valid: false,
                    error: `Invalid arguments: ${error.message}`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Execute a command
     * @param {Object} commandDef - Command definition
     * @param {Array} args - Command arguments
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Execution result
     */
    async executeCommand(commandDef, args, context) {
        try {
            this.logger.debug(`[GCCE Parser] Executing command: /${commandDef.name} for user ${context.userId}`);
            
            // Call the command handler
            const result = await commandDef.handler(args, context);
            
            // Ensure result has required fields
            return {
                success: true,
                ...result,
                commandName: commandDef.name,
                pluginId: commandDef.pluginId
            };

        } catch (error) {
            this.logger.error(`[GCCE Parser] Command execution failed: ${error.message}`);
            return {
                success: false,
                error: `Command failed: ${error.message}`,
                displayOverlay: true
            };
        }
    }

    /**
     * Check rate limiting for a user
     * @param {string} userId - User ID
     * @returns {Object} { allowed, reason? }
     */
    checkRateLimit(userId) {
        const now = Date.now();
        
        // Check global rate limit
        if (now > this.globalRateLimit.resetTime) {
            this.globalRateLimit = { count: 0, resetTime: now + 60000 };
        }
        
        if (this.globalRateLimit.count >= config.RATE_LIMIT.GLOBAL_COMMANDS_PER_MINUTE) {
            return { allowed: false, reason: 'global_limit' };
        }
        
        // Check user rate limit
        if (!this.userRateLimits.has(userId)) {
            this.userRateLimits.set(userId, { count: 0, resetTime: now + 60000 });
        }
        
        const userLimit = this.userRateLimits.get(userId);
        
        if (now > userLimit.resetTime) {
            userLimit.count = 0;
            userLimit.resetTime = now + 60000;
        }
        
        if (userLimit.count >= config.RATE_LIMIT.COMMANDS_PER_USER_PER_MINUTE) {
            return { allowed: false, reason: 'user_limit' };
        }
        
        // Increment counters
        userLimit.count++;
        this.globalRateLimit.count++;
        
        return { allowed: true };
    }

    /**
     * Clean up old rate limit entries
     */
    cleanupRateLimits() {
        const now = Date.now();
        const maxEntries = 1000; // Prevent unbounded growth

        // Remove expired entries
        for (const [userId, data] of this.userRateLimits.entries()) {
            if (now > data.resetTime) {
                this.userRateLimits.delete(userId);
            }
        }
        
        // If still too large, remove oldest entries (LRU)
        if (this.userRateLimits.size > maxEntries) {
            const entries = Array.from(this.userRateLimits.entries())
                .sort((a, b) => a[1].resetTime - b[1].resetTime);
            
            const toRemove = entries.slice(0, entries.length - maxEntries);
            for (const [userId] of toRemove) {
                this.userRateLimits.delete(userId);
            }
        }
    }
}

module.exports = CommandParser;
