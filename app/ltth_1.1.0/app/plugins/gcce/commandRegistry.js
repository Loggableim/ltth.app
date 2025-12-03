/**
 * Command Registry
 * 
 * Central registry for all chat commands from all plugins.
 * Manages command registration, lookup, validation, and conflict resolution.
 */

const config = require('./config');

class CommandRegistry {
    constructor(logger) {
        this.logger = logger;
        
        // Map<commandName, CommandDefinition>
        this.commands = new Map();
        
        // Map<pluginId, Set<commandName>>
        this.pluginCommands = new Map();
        
        // Command execution statistics
        this.stats = {
            totalRegistered: 0,
            totalExecuted: 0,
            totalFailed: 0,
            commandUsage: new Map() // commandName -> count
        };
    }

    /**
     * Register a command from a plugin
     * @param {Object} commandDef - Command definition
     * @returns {boolean} Success status
     */
    registerCommand(commandDef) {
        try {
            // Validate command definition
            this.validateCommandDefinition(commandDef);
            
            const fullCommandName = this.getFullCommandName(commandDef.pluginId, commandDef.name);
            
            // Check for conflicts
            if (this.commands.has(commandDef.name)) {
                const existing = this.commands.get(commandDef.name);
                if (existing.pluginId !== commandDef.pluginId) {
                    this.logger.warn(`[GCCE] Command conflict: ${commandDef.name} already registered by ${existing.pluginId}`);
                    return false;
                }
            }
            
            // Register command
            this.commands.set(commandDef.name, {
                ...commandDef,
                registeredAt: new Date().toISOString(),
                executionCount: 0
            });
            
            // Track plugin commands
            if (!this.pluginCommands.has(commandDef.pluginId)) {
                this.pluginCommands.set(commandDef.pluginId, new Set());
            }
            this.pluginCommands.get(commandDef.pluginId).add(commandDef.name);
            
            this.stats.totalRegistered++;
            this.logger.info(`[GCCE] Registered command: /${commandDef.name} (${commandDef.pluginId})`);
            
            return true;
        } catch (error) {
            this.logger.error(`[GCCE] Failed to register command: ${error.message}`);
            return false;
        }
    }

    /**
     * Unregister a command
     * @param {string} commandName - Name of the command
     * @param {string} pluginId - Plugin ID (for verification)
     * @returns {boolean} Success status
     */
    unregisterCommand(commandName, pluginId) {
        try {
            const command = this.commands.get(commandName);
            
            if (!command) {
                this.logger.warn(`[GCCE] Cannot unregister unknown command: ${commandName}`);
                return false;
            }
            
            if (command.pluginId !== pluginId) {
                this.logger.warn(`[GCCE] Plugin ${pluginId} cannot unregister command owned by ${command.pluginId}`);
                return false;
            }
            
            this.commands.delete(commandName);
            
            if (this.pluginCommands.has(pluginId)) {
                this.pluginCommands.get(pluginId).delete(commandName);
            }
            
            this.stats.totalRegistered--;
            this.logger.info(`[GCCE] Unregistered command: /${commandName}`);
            
            return true;
        } catch (error) {
            this.logger.error(`[GCCE] Failed to unregister command: ${error.message}`);
            return false;
        }
    }

    /**
     * Unregister all commands from a plugin
     * @param {string} pluginId - Plugin ID
     */
    unregisterPluginCommands(pluginId) {
        const commands = this.pluginCommands.get(pluginId);
        if (!commands) return;
        
        for (const commandName of commands) {
            this.commands.delete(commandName);
            this.stats.totalRegistered--;
        }
        
        this.pluginCommands.delete(pluginId);
        this.logger.info(`[GCCE] Unregistered all commands from plugin: ${pluginId}`);
    }

    /**
     * Get a command definition
     * @param {string} commandName - Name of the command
     * @returns {Object|null} Command definition or null
     */
    getCommand(commandName) {
        return this.commands.get(commandName) || null;
    }

    /**
     * Get all commands
     * @param {Object} filters - Optional filters
     * @returns {Array} Array of command definitions
     */
    getAllCommands(filters = {}) {
        let commands = Array.from(this.commands.values());
        
        // Filter by plugin
        if (filters.pluginId) {
            commands = commands.filter(cmd => cmd.pluginId === filters.pluginId);
        }
        
        // Filter by enabled status
        if (filters.enabled !== undefined) {
            commands = commands.filter(cmd => cmd.enabled === filters.enabled);
        }
        
        // Filter by permission level
        if (filters.permission) {
            commands = commands.filter(cmd => cmd.permission === filters.permission);
        }
        
        return commands;
    }

    /**
     * Get commands for a specific plugin
     * @param {string} pluginId - Plugin ID
     * @returns {Array} Array of command definitions
     */
    getPluginCommands(pluginId) {
        const commandNames = this.pluginCommands.get(pluginId);
        if (!commandNames) return [];
        
        return Array.from(commandNames).map(name => this.commands.get(name));
    }

    /**
     * Update command enabled status
     * @param {string} commandName - Name of the command
     * @param {boolean} enabled - Enabled status
     * @returns {boolean} Success status
     */
    setCommandEnabled(commandName, enabled) {
        const command = this.commands.get(commandName);
        if (!command) return false;
        
        command.enabled = enabled;
        this.logger.info(`[GCCE] Command /${commandName} ${enabled ? 'enabled' : 'disabled'}`);
        return true;
    }

    /**
     * Record command execution
     * @param {string} commandName - Name of the command
     * @param {boolean} success - Whether execution succeeded
     */
    recordExecution(commandName, success) {
        const command = this.commands.get(commandName);
        if (command) {
            command.executionCount++;
        }
        
        if (success) {
            this.stats.totalExecuted++;
        } else {
            this.stats.totalFailed++;
        }
        
        // Track usage
        const currentCount = this.stats.commandUsage.get(commandName) || 0;
        this.stats.commandUsage.set(commandName, currentCount + 1);
    }

    /**
     * Get statistics
     * @returns {Object} Registry statistics
     */
    getStats() {
        return {
            ...this.stats,
            registeredCommands: this.commands.size,
            pluginsWithCommands: this.pluginCommands.size,
            topCommands: this.getTopCommands(5)
        };
    }

    /**
     * Get top used commands
     * @param {number} limit - Number of commands to return
     * @returns {Array} Array of {command, count}
     */
    getTopCommands(limit = 10) {
        return Array.from(this.stats.commandUsage.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([command, count]) => ({ command, count }));
    }

    /**
     * Validate command definition
     * @param {Object} commandDef - Command definition
     * @throws {Error} If validation fails
     */
    validateCommandDefinition(commandDef) {
        if (!commandDef.pluginId) {
            throw new Error('Command must have a pluginId');
        }
        
        if (!commandDef.name || typeof commandDef.name !== 'string') {
            throw new Error('Command must have a valid name');
        }
        
        // Normalize command name (lowercase, no spaces)
        commandDef.name = commandDef.name.toLowerCase().trim();
        
        if (!commandDef.handler || typeof commandDef.handler !== 'function') {
            throw new Error('Command must have a handler function');
        }
        
        // Set defaults
        commandDef.description = commandDef.description || 'No description provided';
        commandDef.syntax = commandDef.syntax || `/${commandDef.name}`;
        commandDef.permission = commandDef.permission || config.DEFAULT_PERMISSIONS.ALL;
        commandDef.enabled = commandDef.enabled !== undefined ? commandDef.enabled : true;
        commandDef.minArgs = commandDef.minArgs !== undefined ? commandDef.minArgs : 0;
        commandDef.maxArgs = commandDef.maxArgs !== undefined ? commandDef.maxArgs : Infinity;
        commandDef.category = commandDef.category || 'General';
    }

    /**
     * Get full command name (plugin:command)
     * @param {string} pluginId - Plugin ID
     * @param {string} commandName - Command name
     * @returns {string} Full command name
     */
    getFullCommandName(pluginId, commandName) {
        return `${pluginId}:${commandName}`;
    }

    /**
     * Clear all commands (for testing)
     */
    clear() {
        this.commands.clear();
        this.pluginCommands.clear();
        this.stats = {
            totalRegistered: 0,
            totalExecuted: 0,
            totalFailed: 0,
            commandUsage: new Map()
        };
    }
}

module.exports = CommandRegistry;
