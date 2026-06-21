/**
 * Command Helper Utilities
 * Provides useful helper functions for command development and testing
 */

class CommandHelpers {
  constructor(api, registry, parser) {
    this.api = api;
    this.registry = registry;
    this.parser = parser;
  }

  /**
   * Test a command with mock data
   * @param {string} commandName - Command name
   * @param {Array} args - Arguments
   * @param {Object} mockContext - Mock context
   * @returns {Promise<Object>} Test result
   */
  async testCommand(commandName, args = [], mockContext = {}) {
    const command = this.registry.getCommand(commandName);
    
    if (!command) {
      return {
        success: false,
        error: `Command '${commandName}' not found`
      };
    }

    const context = {
      userId: mockContext.userId || 'test-user',
      username: mockContext.username || 'TestUser',
      userRole: mockContext.userRole || 'all',
      timestamp: Date.now(),
      userData: mockContext.userData || {},
      ...mockContext
    };

    try {
      const startTime = Date.now();
      const result = await command.handler(args, context);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        result,
        executionTime,
        command: command.name,
        context
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
        command: command.name
      };
    }
  }

  /**
   * Generate command documentation
   * @param {string} commandName - Command name
   * @returns {Object} Documentation object
   */
  generateDocs(commandName) {
    const command = this.registry.getCommand(commandName);
    
    if (!command) {
      return null;
    }

    const aliases = this.registry.getCommandAliases ? 
      this.registry.getCommandAliases(commandName) : [];

    return {
      name: command.name,
      description: command.description,
      syntax: command.syntax,
      aliases,
      permission: command.permission,
      category: command.category,
      minArgs: command.minArgs,
      maxArgs: command.maxArgs,
      enabled: command.enabled,
      plugin: command.pluginId,
      examples: this.generateExamples(command)
    };
  }

  /**
   * Generate usage examples for a command
   * @param {Object} command - Command object
   * @returns {Array} Array of examples
   */
  generateExamples(command) {
    const examples = [];
    
    // Basic usage
    examples.push({
      description: `Basic usage of /${command.name}`,
      command: `/${command.name}`,
      explanation: command.description
    });

    // With minimum args
    if (command.minArgs > 0) {
      const mockArgs = Array(command.minArgs).fill('value').map((v, i) => `${v}${i + 1}`);
      examples.push({
        description: `With required arguments`,
        command: `/${command.name} ${mockArgs.join(' ')}`,
        explanation: `Requires ${command.minArgs} argument(s)`
      });
    }

    return examples;
  }

  /**
   * Validate command registration
   * @param {Object} commandDef - Command definition
   * @returns {Object} Validation result
   */
  validateCommandDefinition(commandDef) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!commandDef.name) errors.push('Missing required field: name');
    if (!commandDef.handler) errors.push('Missing required field: handler');
    if (typeof commandDef.handler !== 'function') {
      errors.push('Handler must be a function');
    }

    // Recommended fields
    if (!commandDef.description) {
      warnings.push('No description provided');
    }
    if (!commandDef.syntax) {
      warnings.push('No syntax provided');
    }
    if (!commandDef.category) {
      warnings.push('No category provided');
    }

    // Name format
    if (commandDef.name && !/^[a-z0-9_-]+$/.test(commandDef.name)) {
      errors.push('Command name should only contain lowercase letters, numbers, hyphens, and underscores');
    }

    // Permission level
    if (commandDef.permission && !['all', 'subscriber', 'vip', 'moderator', 'broadcaster'].includes(commandDef.permission)) {
      warnings.push(`Unknown permission level: ${commandDef.permission}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get command usage statistics
   * @param {string} commandName - Command name
   * @returns {Object} Usage statistics
   */
  getCommandStats(commandName) {
    const command = this.registry.getCommand(commandName);
    
    if (!command) {
      return null;
    }

    return {
      name: command.name,
      executionCount: command.executionCount || 0,
      registeredAt: command.registeredAt,
      enabled: command.enabled,
      plugin: command.pluginId
    };
  }

  /**
   * Find similar commands (for "did you mean?" suggestions)
   * @param {string} input - Input command
   * @param {number} maxDistance - Maximum Levenshtein distance
   * @returns {Array} Similar commands
   */
  findSimilarCommands(input, maxDistance = 3) {
    const allCommands = this.registry.getAllCommands();
    const similar = [];

    for (const command of allCommands) {
      const distance = this.levenshteinDistance(input.toLowerCase(), command.name.toLowerCase());
      
      if (distance <= maxDistance) {
        similar.push({
          command: command.name,
          distance,
          description: command.description
        });
      }
    }

    return similar.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Calculate Levenshtein distance
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Distance
   */
  levenshteinDistance(a, b) {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Bulk import commands from JSON
   * @param {Array} commands - Array of command definitions
   * @returns {Object} Import result
   */
  bulkImportCommands(commands) {
    const results = {
      success: [],
      failed: [],
      warnings: []
    };

    for (const cmdDef of commands) {
      const validation = this.validateCommandDefinition(cmdDef);
      
      if (!validation.valid) {
        results.failed.push({
          command: cmdDef.name || 'unknown',
          errors: validation.errors
        });
        continue;
      }

      if (validation.warnings.length > 0) {
        results.warnings.push({
          command: cmdDef.name,
          warnings: validation.warnings
        });
      }

      try {
        const success = this.registry.registerCommand(cmdDef);
        if (success) {
          results.success.push(cmdDef.name);
        } else {
          results.failed.push({
            command: cmdDef.name,
            errors: ['Registration failed (duplicate or conflict)']
          });
        }
      } catch (error) {
        results.failed.push({
          command: cmdDef.name,
          errors: [error.message]
        });
      }
    }

    return results;
  }

  /**
   * Export commands to JSON
   * @param {string} pluginId - Plugin ID (optional)
   * @returns {Array} Commands as JSON
   */
  exportCommands(pluginId = null) {
    let commands;
    
    if (pluginId) {
      commands = this.registry.getPluginCommands(pluginId);
    } else {
      commands = this.registry.getAllCommands();
    }

    return commands.map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      syntax: cmd.syntax,
      permission: cmd.permission,
      category: cmd.category,
      minArgs: cmd.minArgs,
      maxArgs: cmd.maxArgs,
      pluginId: cmd.pluginId
      // Note: handler function cannot be serialized
    }));
  }
}

module.exports = CommandHelpers;
