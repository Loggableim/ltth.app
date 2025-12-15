/**
 * Command Parser
 * 
 * Parses chat messages, validates syntax, checks permissions,
 * and routes to appropriate handlers.
 * Enhanced with token bucket rate limiting, cooldowns, and better error handling.
 */

const config = require('./config');
const TokenBucketRateLimiter = require('./utils/TokenBucketRateLimiter');
const CommandCooldownManager = require('./utils/CommandCooldownManager');
const ErrorHandler = require('./utils/ErrorHandler');

class CommandParser {
    constructor(registry, permissionChecker, logger) {
        this.registry = registry;
        this.permissionChecker = permissionChecker;
        this.logger = logger;
        
        // P2: Token Bucket Rate Limiter (O(1) performance)
        this.rateLimiter = new TokenBucketRateLimiter(
            config.RATE_LIMIT.COMMANDS_PER_USER_PER_MINUTE,
            config.RATE_LIMIT.COMMANDS_PER_USER_PER_MINUTE,
            60000 // 1 minute refill interval
        );

        // F2: Command Cooldown Manager
        this.cooldownManager = new CommandCooldownManager();

        // V2: Enhanced Error Handler
        this.errorHandler = new ErrorHandler();

        // P3: Pre-compiled RegEx for parser optimization
        this.whitespaceRegex = /\s+/g;
        this.commandPrefixRegex = new RegExp(`^\\${config.COMMAND_PREFIX}`);
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

            // P2: Check rate limiting with Token Bucket
            const rateLimitResult = this.rateLimiter.tryConsume(context.userId);
            if (!rateLimitResult.allowed) {
                const remainingSeconds = Math.ceil(rateLimitResult.retryAfter || 0);
                const error = this.errorHandler.createError(
                    rateLimitResult.reason === 'global_limit' 
                        ? 'RATE_LIMIT_GLOBAL' 
                        : 'RATE_LIMIT_USER',
                    { remaining: remainingSeconds }
                );
                
                return {
                    success: false,
                    error: error.message,
                    suggestion: error.suggestion,
                    displayOverlay: true,
                    errorCode: error.code
                };
            }

            // P3: Parse command structure (optimized)
            const parsed = this.parseCommandStructure(message);
            
            // Look up command in registry (with cache and alias support)
            const commandDef = this.registry.getCommand(parsed.command);
            
            if (!commandDef) {
                const error = this.errorHandler.createError('COMMAND_NOT_FOUND', {
                    command: parsed.command
                });
                
                return {
                    success: false,
                    error: error.message,
                    suggestion: error.suggestion,
                    displayOverlay: true,
                    errorCode: error.code
                };
            }

            // Check if command is enabled
            if (!commandDef.enabled) {
                const error = this.errorHandler.createError('COMMAND_DISABLED', {
                    command: commandDef.name
                });
                
                return {
                    success: false,
                    error: error.message,
                    displayOverlay: true,
                    errorCode: error.code
                };
            }

            // F2: Check command cooldown
            const cooldownCheck = this.cooldownManager.checkCooldown(commandDef.name, context.userId);
            if (cooldownCheck.onCooldown) {
                const remainingSeconds = Math.ceil(cooldownCheck.remainingMs / 1000);
                const error = this.errorHandler.createError('COMMAND_ON_COOLDOWN', {
                    command: commandDef.name,
                    remaining: remainingSeconds
                });
                
                return {
                    success: false,
                    error: error.message,
                    suggestion: error.suggestion,
                    displayOverlay: true,
                    errorCode: error.code
                };
            }

            // Check permissions
            const hasPermission = this.permissionChecker.checkPermission(
                context.userRole,
                commandDef.permission,
                context.userId
            );
            
            if (!hasPermission) {
                const error = this.errorHandler.createError('PERMISSION_DENIED', {
                    command: commandDef.name,
                    required: this.permissionChecker.getPermissionName(commandDef.permission)
                });
                
                return {
                    success: false,
                    error: error.message,
                    suggestion: error.suggestion,
                    displayOverlay: true,
                    errorCode: error.code
                };
            }

            // Validate arguments
            const validationResult = this.validateArguments(parsed.args, commandDef);
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: validationResult.error,
                    suggestion: validationResult.suggestion,
                    displayOverlay: true,
                    errorCode: 'VALIDATION_ERROR'
                };
            }

            // Execute command
            const result = await this.executeCommand(commandDef, parsed.args, context);
            
            // Record execution
            this.registry.recordExecution(commandDef.name, result.success);
            
            // F2: Record cooldown usage if successful
            if (result.success) {
                this.cooldownManager.recordUsage(commandDef.name, context.userId);
            }
            
            return result;

        } catch (error) {
            this.logger.error(`[GCCE Parser] Error parsing command: ${error.message}`);
            const errorObj = this.errorHandler.createError('INTERNAL_ERROR');
            
            return {
                success: false,
                error: errorObj.message,
                displayOverlay: true,
                errorCode: errorObj.code
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
     * Parse command structure from message (P3: Optimized with pre-compiled regex)
     * @param {string} message - The command message
     * @returns {Object} Parsed structure { command, args, raw }
     */
    parseCommandStructure(message) {
        // Input validation - prevent DoS with extremely long messages
        if (message.length > 500) {
            throw new Error('Command message is too long');
        }
        
        // Fast path: check if message starts with prefix
        const trimmed = message.trim();
        if (!this.commandPrefixRegex.test(trimmed)) {
            return null;
        }
        
        // Remove prefix (single operation)
        const withoutPrefix = trimmed.substring(config.COMMAND_PREFIX.length);
        
        // Split into parts (using pre-compiled regex)
        const parts = withoutPrefix.trim().split(this.whitespaceRegex);
        
        // Extract command and arguments (toLowerCase only once)
        const command = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        return {
            command,
            args,
            raw: trimmed
        };
    }

    /**
     * Validate command arguments (enhanced with better error messages)
     * @param {Array} args - Arguments array
     * @param {Object} commandDef - Command definition
     * @returns {Object} Validation result { valid, error?, suggestion? }
     */
    validateArguments(args, commandDef) {
        // Check minimum arguments
        if (args.length < commandDef.minArgs) {
            const error = this.errorHandler.createError('MISSING_ARGUMENTS', {
                command: commandDef.name,
                syntax: commandDef.syntax
            });
            
            return {
                valid: false,
                error: error.message,
                suggestion: error.suggestion
            };
        }

        // Check maximum arguments
        if (args.length > commandDef.maxArgs) {
            const error = this.errorHandler.createError('TOO_MANY_ARGUMENTS', {
                command: commandDef.name,
                syntax: commandDef.syntax
            });
            
            return {
                valid: false,
                error: error.message,
                suggestion: error.suggestion
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
                const errorObj = this.errorHandler.createError('INVALID_ARGUMENT_VALUE', {
                    command: commandDef.name,
                    value: error.message
                });
                
                return {
                    valid: false,
                    error: errorObj.message,
                    suggestion: errorObj.suggestion
                };
            }
        }

        return { valid: true };
    }

    /**
     * Execute a command (enhanced error handling)
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
            
            const errorObj = this.errorHandler.createError('EXECUTION_FAILED', {
                command: commandDef.name,
                error: error.message
            });
            
            return {
                success: false,
                error: errorObj.message,
                displayOverlay: true,
                errorCode: errorObj.code
            };
        }
    }

    /**
     * Clean up old rate limit entries and cooldowns
     */
    cleanupRateLimits() {
        this.rateLimiter.cleanup();
        this.cooldownManager.cleanup();
    }

    /**
     * Set cooldown for a command (F2: Command Cooldowns)
     * @param {string} commandName - Command name
     * @param {number} userCooldown - Per-user cooldown in ms
     * @param {number} globalCooldown - Global cooldown in ms (optional)
     */
    setCommandCooldown(commandName, userCooldown, globalCooldown = 0) {
        this.cooldownManager.setCooldown(commandName, userCooldown, globalCooldown);
        this.logger.info(`[GCCE Parser] Set cooldown for /${commandName}: user=${userCooldown}ms, global=${globalCooldown}ms`);
    }

    /**
     * Get rate limiter statistics
     * @returns {Object} Rate limiter stats
     */
    getRateLimiterStats() {
        return this.rateLimiter.getStats();
    }

    /**
     * Get cooldown manager statistics
     * @returns {Object} Cooldown stats
     */
    getCooldownStats() {
        return this.cooldownManager.getStats();
    }
}

module.exports = CommandParser;
