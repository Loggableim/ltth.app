/**
 * Command Alias Manager
 * Allows multiple names to reference the same command
 * Example: /inventory = /inv = /bag
 */

class CommandAliasManager {
  constructor() {
    // Map<alias, canonicalCommandName>
    this.aliases = new Map();
    
    // Map<canonicalCommandName, Set<aliases>>
    this.reverseMap = new Map();
  }

  /**
   * Register an alias for a command
   * @param {string} alias - The alias name
   * @param {string} canonicalName - The canonical command name
   * @returns {boolean} Success status
   */
  registerAlias(alias, canonicalName) {
    alias = alias.toLowerCase();
    canonicalName = canonicalName.toLowerCase();

    // Check if alias already exists
    if (this.aliases.has(alias)) {
      return false;
    }

    // Register alias
    this.aliases.set(alias, canonicalName);

    // Update reverse map
    if (!this.reverseMap.has(canonicalName)) {
      this.reverseMap.set(canonicalName, new Set());
    }
    this.reverseMap.get(canonicalName).add(alias);

    return true;
  }

  /**
   * Register multiple aliases for a command
   * @param {Array<string>} aliases - Array of alias names
   * @param {string} canonicalName - The canonical command name
   * @returns {Object} { success: number, failed: number }
   */
  registerAliases(aliases, canonicalName) {
    let success = 0;
    let failed = 0;

    for (const alias of aliases) {
      if (this.registerAlias(alias, canonicalName)) {
        success++;
      } else {
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Resolve an alias to its canonical command name
   * @param {string} name - Alias or canonical name
   * @returns {string} Canonical command name
   */
  resolve(name) {
    name = name.toLowerCase();
    return this.aliases.get(name) || name;
  }

  /**
   * Check if a name is an alias
   * @param {string} name - Name to check
   * @returns {boolean} True if name is an alias
   */
  isAlias(name) {
    return this.aliases.has(name.toLowerCase());
  }

  /**
   * Get all aliases for a command
   * @param {string} canonicalName - Canonical command name
   * @returns {Array<string>} Array of aliases
   */
  getAliases(canonicalName) {
    const aliases = this.reverseMap.get(canonicalName.toLowerCase());
    return aliases ? Array.from(aliases) : [];
  }

  /**
   * Unregister an alias
   * @param {string} alias - Alias to remove
   * @returns {boolean} True if removed
   */
  unregisterAlias(alias) {
    alias = alias.toLowerCase();
    const canonicalName = this.aliases.get(alias);
    
    if (!canonicalName) {
      return false;
    }

    this.aliases.delete(alias);
    
    const aliasSet = this.reverseMap.get(canonicalName);
    if (aliasSet) {
      aliasSet.delete(alias);
      if (aliasSet.size === 0) {
        this.reverseMap.delete(canonicalName);
      }
    }

    return true;
  }

  /**
   * Unregister all aliases for a command
   * @param {string} canonicalName - Canonical command name
   */
  unregisterAllAliases(canonicalName) {
    canonicalName = canonicalName.toLowerCase();
    const aliases = this.getAliases(canonicalName);
    
    for (const alias of aliases) {
      this.aliases.delete(alias);
    }
    
    this.reverseMap.delete(canonicalName);
  }

  /**
   * Get all aliases
   * @returns {Array<Object>} Array of { alias, command }
   */
  getAllAliases() {
    return Array.from(this.aliases.entries()).map(([alias, command]) => ({
      alias,
      command
    }));
  }

  /**
   * Clear all aliases
   */
  clear() {
    this.aliases.clear();
    this.reverseMap.clear();
  }

  /**
   * Get statistics
   * @returns {Object} Alias stats
   */
  getStats() {
    return {
      totalAliases: this.aliases.size,
      commandsWithAliases: this.reverseMap.size
    };
  }
}

module.exports = CommandAliasManager;
