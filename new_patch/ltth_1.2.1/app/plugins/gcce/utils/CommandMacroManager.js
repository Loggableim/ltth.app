/**
 * Command Macro Manager
 * F5: Allows creating macros that execute multiple commands in sequence
 * Example: /quickstart -> /setup + /initcam + /startalerts
 */

class CommandMacroManager {
  constructor(commandRegistry, commandParser) {
    this.commandRegistry = commandRegistry;
    this.commandParser = commandParser;
    
    // Map<macroName, MacroDefinition>
    this.macros = new Map();
    
    // Execution statistics
    this.stats = {
      totalMacros: 0,
      totalExecutions: 0,
      totalFailed: 0
    };
  }

  /**
   * Register a command macro
   * @param {Object} macroDef - Macro definition
   * @returns {boolean} Success status
   */
  registerMacro(macroDef) {
    try {
      this.validateMacroDefinition(macroDef);
      
      const macro = {
        name: macroDef.name.toLowerCase(),
        description: macroDef.description || 'No description',
        commands: macroDef.commands, // Array of command strings
        delay: macroDef.delay || 0, // Delay between commands in ms
        stopOnError: macroDef.stopOnError !== undefined ? macroDef.stopOnError : true,
        permission: macroDef.permission || 'all',
        enabled: macroDef.enabled !== undefined ? macroDef.enabled : true,
        createdAt: Date.now()
      };

      this.macros.set(macro.name, macro);
      this.stats.totalMacros++;
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Execute a macro
   * @param {string} macroName - Name of the macro
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} Execution result
   */
  async executeMacro(macroName, context) {
    const macro = this.macros.get(macroName.toLowerCase());
    
    if (!macro) {
      return {
        success: false,
        error: `Macro '${macroName}' not found`
      };
    }

    if (!macro.enabled) {
      return {
        success: false,
        error: `Macro '${macroName}' is disabled`
      };
    }

    this.stats.totalExecutions++;
    
    const results = [];
    let allSuccess = true;

    for (let i = 0; i < macro.commands.length; i++) {
      const command = macro.commands[i];
      
      try {
        // Execute command
        const result = await this.commandParser.parse(command, context);
        results.push({
          command,
          ...result
        });

        if (!result.success && macro.stopOnError) {
          allSuccess = false;
          break;
        }

        // Delay before next command (if not last command)
        if (macro.delay > 0 && i < macro.commands.length - 1) {
          await this.sleep(macro.delay);
        }
      } catch (error) {
        results.push({
          command,
          success: false,
          error: error.message
        });
        
        if (macro.stopOnError) {
          allSuccess = false;
          break;
        }
      }
    }

    if (!allSuccess) {
      this.stats.totalFailed++;
    }

    return {
      success: allSuccess,
      macroName,
      results,
      totalCommands: macro.commands.length,
      executedCommands: results.length
    };
  }

  /**
   * Get a macro definition
   * @param {string} macroName - Macro name
   * @returns {Object|null} Macro definition or null
   */
  getMacro(macroName) {
    return this.macros.get(macroName.toLowerCase()) || null;
  }

  /**
   * Get all macros
   * @returns {Array} Array of macro definitions
   */
  getAllMacros() {
    return Array.from(this.macros.values());
  }

  /**
   * Unregister a macro
   * @param {string} macroName - Macro name
   * @returns {boolean} True if removed
   */
  unregisterMacro(macroName) {
    const result = this.macros.delete(macroName.toLowerCase());
    if (result) {
      this.stats.totalMacros--;
    }
    return result;
  }

  /**
   * Update macro enabled status
   * @param {string} macroName - Macro name
   * @param {boolean} enabled - Enabled status
   * @returns {boolean} Success status
   */
  setMacroEnabled(macroName, enabled) {
    const macro = this.macros.get(macroName.toLowerCase());
    if (!macro) return false;
    
    macro.enabled = enabled;
    return true;
  }

  /**
   * Validate macro definition
   * @param {Object} macroDef - Macro definition
   * @throws {Error} If validation fails
   */
  validateMacroDefinition(macroDef) {
    if (!macroDef.name || typeof macroDef.name !== 'string') {
      throw new Error('Macro must have a valid name');
    }

    if (!Array.isArray(macroDef.commands) || macroDef.commands.length === 0) {
      throw new Error('Macro must have at least one command');
    }

    // Check for circular references
    if (this.macros.has(macroDef.name.toLowerCase())) {
      throw new Error('Macro already exists');
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get statistics
   * @returns {Object} Macro stats
   */
  getStats() {
    return {
      ...this.stats,
      currentMacros: this.macros.size
    };
  }

  /**
   * Clear all macros
   */
  clear() {
    this.macros.clear();
    this.stats = {
      totalMacros: 0,
      totalExecutions: 0,
      totalFailed: 0
    };
  }
}

module.exports = CommandMacroManager;
