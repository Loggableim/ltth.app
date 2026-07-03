/**
 * Command Cooldown Manager
 * Prevents command spam with per-command, per-user cooldowns
 */

class CommandCooldownManager {
  constructor() {
    // Map<commandName, CooldownConfig>
    this.commandCooldowns = new Map();
    
    // Map<userId:commandName, timestamp>
    this.userCooldowns = new Map();
    
    // Map<commandName, timestamp> (global cooldowns)
    this.globalCooldowns = new Map();
  }

  /**
   * Set cooldown for a command
   * @param {string} commandName - Command name
   * @param {number} userCooldown - Per-user cooldown in ms
   * @param {number} globalCooldown - Global cooldown in ms (optional)
   */
  setCooldown(commandName, userCooldown, globalCooldown = 0) {
    this.commandCooldowns.set(commandName.toLowerCase(), {
      userCooldown,
      globalCooldown
    });
  }

  /**
   * Check if command is on cooldown for user
   * @param {string} commandName - Command name
   * @param {string} userId - User ID
   * @returns {Object} { onCooldown: boolean, remainingMs: number }
   */
  checkCooldown(commandName, userId) {
    commandName = commandName.toLowerCase();
    const config = this.commandCooldowns.get(commandName);
    
    if (!config) {
      return { onCooldown: false, remainingMs: 0 };
    }

    const now = Date.now();

    // Check global cooldown
    if (config.globalCooldown > 0) {
      const globalKey = commandName;
      const lastUsed = this.globalCooldowns.get(globalKey);
      
      if (lastUsed) {
        const elapsed = now - lastUsed;
        if (elapsed < config.globalCooldown) {
          return {
            onCooldown: true,
            remainingMs: config.globalCooldown - elapsed,
            type: 'global'
          };
        }
      }
    }

    // Check user cooldown
    if (config.userCooldown > 0) {
      const userKey = this.getUserCooldownKey(userId, commandName);
      const lastUsed = this.userCooldowns.get(userKey);
      
      if (lastUsed) {
        const elapsed = now - lastUsed;
        if (elapsed < config.userCooldown) {
          return {
            onCooldown: true,
            remainingMs: config.userCooldown - elapsed,
            type: 'user'
          };
        }
      }
    }

    return { onCooldown: false, remainingMs: 0 };
  }

  /**
   * Record command usage (start cooldown)
   * @param {string} commandName - Command name
   * @param {string} userId - User ID
   */
  recordUsage(commandName, userId) {
    commandName = commandName.toLowerCase();
    const config = this.commandCooldowns.get(commandName);
    
    if (!config) return;

    const now = Date.now();

    // Record global cooldown
    if (config.globalCooldown > 0) {
      this.globalCooldowns.set(commandName, now);
    }

    // Record user cooldown
    if (config.userCooldown > 0) {
      const userKey = this.getUserCooldownKey(userId, commandName);
      this.userCooldowns.set(userKey, now);
    }
  }

  /**
   * Reset cooldown for a user and command
   * @param {string} commandName - Command name
   * @param {string} userId - User ID (optional, resets global if not provided)
   */
  resetCooldown(commandName, userId = null) {
    commandName = commandName.toLowerCase();
    
    if (userId) {
      const userKey = this.getUserCooldownKey(userId, commandName);
      this.userCooldowns.delete(userKey);
    } else {
      this.globalCooldowns.delete(commandName);
    }
  }

  /**
   * Remove cooldown configuration for a command
   * @param {string} commandName - Command name
   */
  removeCooldown(commandName) {
    this.commandCooldowns.delete(commandName.toLowerCase());
  }

  /**
   * Get cooldown configuration for a command
   * @param {string} commandName - Command name
   * @returns {Object|null} Cooldown config or null
   */
  getCooldownConfig(commandName) {
    return this.commandCooldowns.get(commandName.toLowerCase()) || null;
  }

  /**
   * Get user cooldown key
   * @param {string} userId - User ID
   * @param {string} commandName - Command name
   * @returns {string} Cooldown key
   */
  getUserCooldownKey(userId, commandName) {
    return `${userId}:${commandName}`;
  }

  /**
   * Clean up expired cooldowns
   */
  cleanup() {
    const now = Date.now();

    // Cleanup user cooldowns
    for (const [key, timestamp] of this.userCooldowns.entries()) {
      const [userId, commandName] = key.split(':');
      const config = this.commandCooldowns.get(commandName);
      
      if (!config || now - timestamp > config.userCooldown) {
        this.userCooldowns.delete(key);
      }
    }

    // Cleanup global cooldowns
    for (const [commandName, timestamp] of this.globalCooldowns.entries()) {
      const config = this.commandCooldowns.get(commandName);
      
      if (!config || now - timestamp > config.globalCooldown) {
        this.globalCooldowns.delete(commandName);
      }
    }
  }

  /**
   * Get statistics
   * @returns {Object} Cooldown stats
   */
  getStats() {
    return {
      commandsWithCooldowns: this.commandCooldowns.size,
      activeUserCooldowns: this.userCooldowns.size,
      activeGlobalCooldowns: this.globalCooldowns.size
    };
  }

  /**
   * Clear all cooldowns
   */
  clear() {
    this.commandCooldowns.clear();
    this.userCooldowns.clear();
    this.globalCooldowns.clear();
  }
}

module.exports = CommandCooldownManager;
