/**
 * SafetyManager - Comprehensive safety system for OpenShock commands
 *
 * Features:
 * - Multi-level limits (global, device, user)
 * - Rate limiting and cooldowns
 * - Blacklist/Whitelist management
 * - Follower age filtering
 * - Emergency stop functionality
 * - Command history and statistics
 * - Automatic cleanup of old records
 */

class SafetyManager {
  constructor(config = {}, logger = console) {
    this.logger = logger;

    // Default configuration
    this.config = {
      globalLimits: {
        maxIntensity: 80,
        maxDuration: 5000,
        maxCommandsPerMinute: 30
      },
      deviceLimits: {},
      userLimits: {
        minFollowerAge: 7,
        maxCommandsPerUser: 10,
        whitelist: [],
        blacklist: []
      },
      emergencyStop: {
        enabled: false,
        triggeredAt: null,
        reason: ""
      },
      ...config
    };

    // Tracking data structures
    this.commandHistory = [];
    this.deviceCooldowns = new Map();
    this.deviceDailyCommands = new Map();
    this.userHourlyCommands = new Map();
    this.lastCleanup = Date.now();

    // Auto-cleanup interval (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this._cleanupOldRecords();
    }, 5 * 60 * 1000);

    this.logger.info('[SafetyManager] Initialized with config:', {
      globalLimits: this.config.globalLimits,
      deviceCount: Object.keys(this.config.deviceLimits).length,
      userLimits: this.config.userLimits
    });
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration object
   */
  updateConfig(config) {
    this.config = {
      ...this.config,
      ...config,
      globalLimits: {
        ...this.config.globalLimits,
        ...(config.globalLimits || {})
      },
      deviceLimits: {
        ...this.config.deviceLimits,
        ...(config.deviceLimits || {})
      },
      userLimits: {
        ...this.config.userLimits,
        ...(config.userLimits || {})
      },
      emergencyStop: {
        ...this.config.emergencyStop,
        ...(config.emergencyStop || {})
      }
    };

    this.logger.info('[SafetyManager] Configuration updated');
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Validate a command and apply safety limits
   * This is a wrapper around checkCommand that provides a simpler interface
   * compatible with main.js expectations
   * 
   * @param {Object} params - Command parameters
   * @param {string} params.deviceId - Device ID
   * @param {string} params.type - Command type (shock, vibrate, sound)
   * @param {number} params.intensity - Intensity (1-100)
   * @param {number} params.duration - Duration in milliseconds
   * @param {string} params.userId - User ID
   * @param {string} [params.source] - Command source (for logging)
   * @returns {Object} { allowed: boolean, reason: string, adjustedIntensity: number, adjustedDuration: number }
   */
  validateCommand(params) {
    const { deviceId, type, intensity, duration, userId, source } = params;
    
    const command = { type, intensity, duration, source };
    const result = this.checkCommand(command, userId, deviceId);
    
    // If allowed, extract adjusted values from modifiedCommand
    if (result.allowed && result.modifiedCommand) {
      return {
        allowed: true,
        reason: result.reason,
        adjustedIntensity: result.modifiedCommand.intensity,
        adjustedDuration: result.modifiedCommand.duration
      };
    }
    
    // If not allowed, return with original values
    return {
      allowed: result.allowed,
      reason: result.reason,
      adjustedIntensity: intensity,
      adjustedDuration: duration
    };
  }

  /**
   * Check if a command is allowed
   * @param {Object} command - Command object { type, intensity, duration }
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {Object} { allowed: boolean, reason: string, modifiedCommand: Object }
   */
  checkCommand(command, userId, deviceId) {
    // Emergency stop check
    if (this.isEmergencyStopActive()) {
      return {
        allowed: false,
        reason: `Emergency stop active: ${this.config.emergencyStop.reason}`,
        modifiedCommand: null
      };
    }

    // Blacklist check
    const blacklistCheck = this.checkBlacklist(userId);
    if (!blacklistCheck.allowed) {
      return {
        allowed: false,
        reason: blacklistCheck.reason,
        modifiedCommand: null
      };
    }

    // User limits check (skip for whitelisted users)
    const whitelisted = this.checkWhitelist(userId);
    if (!whitelisted) {
      const userLimitsCheck = this.checkUserLimits(userId);
      if (!userLimitsCheck.allowed) {
        return {
          allowed: false,
          reason: userLimitsCheck.reason,
          modifiedCommand: null
        };
      }
    }

    // Device cooldown check
    const cooldownCheck = this.checkDeviceCooldown(deviceId);
    if (!cooldownCheck.allowed) {
      return {
        allowed: false,
        reason: cooldownCheck.reason,
        modifiedCommand: null
      };
    }

    // Daily limit check
    const dailyLimitCheck = this.checkDailyLimit(deviceId);
    if (!dailyLimitCheck.allowed) {
      return {
        allowed: false,
        reason: dailyLimitCheck.reason,
        modifiedCommand: null
      };
    }

    // Global rate limit check
    const globalRateCheck = this._checkGlobalRateLimit();
    if (!globalRateCheck.allowed) {
      return {
        allowed: false,
        reason: globalRateCheck.reason,
        modifiedCommand: null
      };
    }

    // Apply safety limits and create modified command
    const modifiedCommand = this.applySafetyLimits(command, deviceId);

    return {
      allowed: true,
      reason: 'Command approved',
      modifiedCommand
    };
  }

  /**
   * Apply safety limits to a command
   * @param {Object} command - Original command
   * @param {string} deviceId - Device ID
   * @returns {Object} Modified command with limits applied
   */
  applySafetyLimits(command, deviceId) {
    const modifiedCommand = { ...command };

    // Get applicable limits
    const globalLimits = this.config.globalLimits;
    const deviceLimits = this.config.deviceLimits[deviceId] || {};

    // Apply intensity limits (most restrictive wins)
    const maxIntensity = Math.min(
      globalLimits.maxIntensity || 100,
      deviceLimits.maxIntensity || 100
    );

    if (modifiedCommand.intensity > maxIntensity) {
      this.logger.warn(`[SafetyManager] Intensity capped from ${modifiedCommand.intensity} to ${maxIntensity}`);
      modifiedCommand.intensity = maxIntensity;
      modifiedCommand.cappedIntensity = true;
    }

    // Apply duration limits (most restrictive wins)
    const maxDuration = Math.min(
      globalLimits.maxDuration || 30000,
      deviceLimits.maxDuration || 30000
    );

    if (modifiedCommand.duration > maxDuration) {
      this.logger.warn(`[SafetyManager] Duration capped from ${modifiedCommand.duration} to ${maxDuration}`);
      modifiedCommand.duration = maxDuration;
      modifiedCommand.cappedDuration = true;
    }

    // Ensure minimum safe values
    modifiedCommand.intensity = Math.max(1, Math.min(100, modifiedCommand.intensity));
    modifiedCommand.duration = Math.max(100, modifiedCommand.duration);

    return modifiedCommand;
  }

  /**
   * Check device cooldown
   * @param {string} deviceId - Device ID
   * @returns {Object} { allowed: boolean, reason: string, remainingMs: number }
   */
  checkDeviceCooldown(deviceId) {
    const deviceLimits = this.config.deviceLimits[deviceId];
    if (!deviceLimits || !deviceLimits.cooldown) {
      return { allowed: true, reason: 'No cooldown configured', remainingMs: 0 };
    }

    const lastCommand = this.deviceCooldowns.get(deviceId);
    if (!lastCommand) {
      return { allowed: true, reason: 'First command', remainingMs: 0 };
    }

    const timeSinceLastCommand = Date.now() - lastCommand;
    const remainingMs = deviceLimits.cooldown - timeSinceLastCommand;

    if (remainingMs > 0) {
      return {
        allowed: false,
        reason: `Device cooldown active. Wait ${Math.ceil(remainingMs / 1000)}s`,
        remainingMs
      };
    }

    return { allowed: true, reason: 'Cooldown expired', remainingMs: 0 };
  }

  /**
   * Register a command execution
   * @param {string} deviceId - Device ID
   * @param {string} userId - User ID
   * @param {Object} command - Command object
   */
  registerCommand(deviceId, userId, command) {
    const timestamp = Date.now();

    // Add to command history
    this.commandHistory.push({
      deviceId,
      userId,
      command: { ...command },
      timestamp,
      date: new Date(timestamp).toISOString()
    });

    // Update device cooldown
    this.deviceCooldowns.set(deviceId, timestamp);

    // Update daily device counter
    const today = new Date(timestamp).toDateString();
    const dailyKey = `${deviceId}:${today}`;
    const currentDaily = this.deviceDailyCommands.get(dailyKey) || 0;
    this.deviceDailyCommands.set(dailyKey, currentDaily + 1);

    // Update hourly user counter
    const currentHour = new Date(timestamp).setMinutes(0, 0, 0);
    const hourlyKey = `${userId}:${currentHour}`;
    const currentHourly = this.userHourlyCommands.get(hourlyKey) || 0;
    this.userHourlyCommands.set(hourlyKey, currentHourly + 1);

    this.logger.debug(`[SafetyManager] Command registered: device=${deviceId}, user=${userId}`);

    // Cleanup if needed (every hour)
    if (timestamp - this.lastCleanup > 60 * 60 * 1000) {
      this._cleanupOldRecords();
    }
  }

  /**
   * Check user limits
   * @param {string} userId - User ID
   * @returns {Object} { allowed: boolean, reason: string }
   */
  checkUserLimits(userId) {
    const currentHour = new Date().setMinutes(0, 0, 0);
    const hourlyKey = `${userId}:${currentHour}`;
    const commandCount = this.userHourlyCommands.get(hourlyKey) || 0;
    const maxCommands = this.config.userLimits.maxCommandsPerUser || 10;

    if (commandCount >= maxCommands) {
      return {
        allowed: false,
        reason: `User hourly limit reached (${commandCount}/${maxCommands})`
      };
    }

    return {
      allowed: true,
      reason: `User within limits (${commandCount}/${maxCommands})`
    };
  }

  /**
   * Check if user is blacklisted
   * @param {string} userId - User ID
   * @returns {Object} { allowed: boolean, reason: string }
   */
  checkBlacklist(userId) {
    const blacklist = this.config.userLimits.blacklist || [];

    if (blacklist.includes(userId)) {
      return {
        allowed: false,
        reason: 'User is blacklisted'
      };
    }

    return {
      allowed: true,
      reason: 'User not blacklisted'
    };
  }

  /**
   * Check if user is whitelisted
   * @param {string} userId - User ID
   * @returns {boolean} True if whitelisted
   */
  checkWhitelist(userId) {
    const whitelist = this.config.userLimits.whitelist || [];
    return whitelist.includes(userId);
  }

  /**
   * Check follower age
   * @param {string} userId - User ID
   * @param {Date|string|number} followedAt - Follower timestamp
   * @returns {Object} { allowed: boolean, reason: string, age: number }
   */
  checkFollowerAge(userId, followedAt) {
    // Skip check for whitelisted users
    if (this.checkWhitelist(userId)) {
      return {
        allowed: true,
        reason: 'User whitelisted',
        age: Infinity
      };
    }

    const minAge = this.config.userLimits.minFollowerAge || 0;

    if (minAge === 0) {
      return {
        allowed: true,
        reason: 'No minimum age required',
        age: 0
      };
    }

    if (!followedAt) {
      return {
        allowed: false,
        reason: 'Follower date not provided',
        age: 0
      };
    }

    const followDate = new Date(followedAt);
    const now = new Date();
    const ageDays = (now - followDate) / (1000 * 60 * 60 * 24);

    if (ageDays < minAge) {
      return {
        allowed: false,
        reason: `Follower too new (${Math.floor(ageDays)} days, minimum ${minAge} days)`,
        age: ageDays
      };
    }

    return {
      allowed: true,
      reason: `Follower age sufficient (${Math.floor(ageDays)} days)`,
      age: ageDays
    };
  }

  /**
   * Check daily device limit
   * @param {string} deviceId - Device ID
   * @returns {Object} { allowed: boolean, reason: string, count: number }
   */
  checkDailyLimit(deviceId) {
    const deviceLimits = this.config.deviceLimits[deviceId];

    if (!deviceLimits || !deviceLimits.dailyLimit) {
      return {
        allowed: true,
        reason: 'No daily limit configured',
        count: 0
      };
    }

    const today = new Date().toDateString();
    const dailyKey = `${deviceId}:${today}`;
    const commandCount = this.deviceDailyCommands.get(dailyKey) || 0;
    const dailyLimit = deviceLimits.dailyLimit;

    if (commandCount >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily device limit reached (${commandCount}/${dailyLimit})`,
        count: commandCount
      };
    }

    return {
      allowed: true,
      reason: `Within daily limit (${commandCount}/${dailyLimit})`,
      count: commandCount
    };
  }

  /**
   * Get device statistics
   * @param {string} deviceId - Device ID
   * @returns {Object} Device statistics
   */
  getDeviceStats(deviceId) {
    const today = new Date().toDateString();
    const dailyKey = `${deviceId}:${today}`;
    const dailyCommands = this.deviceDailyCommands.get(dailyKey) || 0;
    const lastCommand = this.deviceCooldowns.get(deviceId);
    const deviceLimits = this.config.deviceLimits[deviceId] || {};

    // Count total commands from history
    const totalCommands = this.commandHistory.filter(h => h.deviceId === deviceId).length;

    // Calculate commands in last hour
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    const hourlyCommands = this.commandHistory.filter(
      h => h.deviceId === deviceId && h.timestamp > oneHourAgo
    ).length;

    return {
      deviceId,
      totalCommands,
      dailyCommands,
      hourlyCommands,
      lastCommand: lastCommand ? new Date(lastCommand).toISOString() : null,
      timeSinceLastCommand: lastCommand ? Date.now() - lastCommand : null,
      limits: {
        maxIntensity: deviceLimits.maxIntensity || this.config.globalLimits.maxIntensity,
        maxDuration: deviceLimits.maxDuration || this.config.globalLimits.maxDuration,
        cooldown: deviceLimits.cooldown || 0,
        dailyLimit: deviceLimits.dailyLimit || null
      },
      cooldownActive: this.checkDeviceCooldown(deviceId).remainingMs > 0,
      dailyLimitReached: dailyCommands >= (deviceLimits.dailyLimit || Infinity)
    };
  }

  /**
   * Get user statistics
   * @param {string} userId - User ID
   * @returns {Object} User statistics
   */
  getUserStats(userId) {
    const currentHour = new Date().setMinutes(0, 0, 0);
    const hourlyKey = `${userId}:${currentHour}`;
    const hourlyCommands = this.userHourlyCommands.get(hourlyKey) || 0;

    // Count total commands from history
    const totalCommands = this.commandHistory.filter(h => h.userId === userId).length;

    // Count daily commands
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const dailyCommands = this.commandHistory.filter(
      h => h.userId === userId && h.timestamp >= todayStart
    ).length;

    // Find last command
    const userCommands = this.commandHistory.filter(h => h.userId === userId);
    const lastCommand = userCommands.length > 0
      ? userCommands[userCommands.length - 1]
      : null;

    const isWhitelisted = this.checkWhitelist(userId);
    const isBlacklisted = this.checkBlacklist(userId).allowed === false;
    const maxCommandsPerHour = this.config.userLimits.maxCommandsPerUser || 10;

    return {
      userId,
      totalCommands,
      dailyCommands,
      hourlyCommands,
      lastCommand: lastCommand ? lastCommand.date : null,
      isWhitelisted,
      isBlacklisted,
      limits: {
        maxCommandsPerHour,
        minFollowerAge: this.config.userLimits.minFollowerAge || 0
      },
      hourlyLimitReached: hourlyCommands >= maxCommandsPerHour && !isWhitelisted
    };
  }

  /**
   * Trigger emergency stop
   * @param {string} reason - Reason for emergency stop
   */
  triggerEmergencyStop(reason) {
    this.config.emergencyStop = {
      enabled: true,
      triggeredAt: new Date().toISOString(),
      reason: reason || 'Emergency stop activated'
    };

    this.logger.error(`[SafetyManager] EMERGENCY STOP TRIGGERED: ${reason}`);
  }

  /**
   * Clear emergency stop
   */
  clearEmergencyStop() {
    this.config.emergencyStop = {
      enabled: false,
      triggeredAt: null,
      reason: ''
    };

    this.logger.info('[SafetyManager] Emergency stop cleared');
  }

  /**
   * Check if emergency stop is active
   * @returns {boolean} True if active
   */
  isEmergencyStopActive() {
    return this.config.emergencyStop.enabled === true;
  }

  /**
   * Reset all statistics
   */
  resetStats() {
    this.commandHistory = [];
    this.deviceCooldowns.clear();
    this.deviceDailyCommands.clear();
    this.userHourlyCommands.clear();
    this.lastCleanup = Date.now();

    this.logger.warn('[SafetyManager] All statistics reset');
  }

  /**
   * Get command history
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Command history
   */
  getCommandHistory(limit = 100) {
    const history = [...this.commandHistory];

    // Sort by timestamp descending (newest first)
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    return history.slice(0, limit);
  }

  /**
   * Check global rate limit
   * @private
   * @returns {Object} { allowed: boolean, reason: string }
   */
  _checkGlobalRateLimit() {
    const maxCommandsPerMinute = this.config.globalLimits.maxCommandsPerMinute;

    if (!maxCommandsPerMinute) {
      return { allowed: true, reason: 'No global rate limit' };
    }

    const oneMinuteAgo = Date.now() - (60 * 1000);
    const recentCommands = this.commandHistory.filter(
      h => h.timestamp > oneMinuteAgo
    ).length;

    if (recentCommands >= maxCommandsPerMinute) {
      return {
        allowed: false,
        reason: `Global rate limit exceeded (${recentCommands}/${maxCommandsPerMinute} per minute)`
      };
    }

    return {
      allowed: true,
      reason: `Within global rate limit (${recentCommands}/${maxCommandsPerMinute})`
    };
  }

  /**
   * Cleanup old records (older than 24 hours)
   * @private
   */
  _cleanupOldRecords() {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
    const originalHistoryLength = this.commandHistory.length;

    // Cleanup command history
    this.commandHistory = this.commandHistory.filter(
      h => h.timestamp > twentyFourHoursAgo
    );

    // Cleanup device cooldowns (only keep recent ones)
    const cooldownsToKeep = new Map();
    for (const [deviceId, timestamp] of this.deviceCooldowns.entries()) {
      if (timestamp > twentyFourHoursAgo) {
        cooldownsToKeep.set(deviceId, timestamp);
      }
    }
    this.deviceCooldowns = cooldownsToKeep;

    // Cleanup old daily counters (keep today and yesterday)
    const today = new Date().toDateString();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

    const dailyToKeep = new Map();
    for (const [key, count] of this.deviceDailyCommands.entries()) {
      const [, date] = key.split(':');
      if (date === today || date === yesterday) {
        dailyToKeep.set(key, count);
      }
    }
    this.deviceDailyCommands = dailyToKeep;

    // Cleanup old hourly counters
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    const hourlyToKeep = new Map();
    for (const [key, count] of this.userHourlyCommands.entries()) {
      const [, timestamp] = key.split(':');
      if (parseInt(timestamp) > twoHoursAgo) {
        hourlyToKeep.set(key, count);
      }
    }
    this.userHourlyCommands = hourlyToKeep;

    this.lastCleanup = Date.now();

    const removedRecords = originalHistoryLength - this.commandHistory.length;
    if (removedRecords > 0) {
      this.logger.info(`[SafetyManager] Cleanup completed: ${removedRecords} old records removed`);
    }
  }

  /**
   * Get overall system statistics
   * @returns {Object} System statistics
   */
  getSystemStats() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneDayAgo = now - (24 * 60 * 60 * 1000);

    return {
      totalCommands: this.commandHistory.length,
      commandsLastHour: this.commandHistory.filter(h => h.timestamp > oneHourAgo).length,
      commandsLast24Hours: this.commandHistory.filter(h => h.timestamp > oneDayAgo).length,
      uniqueDevices: new Set(this.commandHistory.map(h => h.deviceId)).size,
      uniqueUsers: new Set(this.commandHistory.map(h => h.userId)).size,
      emergencyStopActive: this.isEmergencyStopActive(),
      lastCleanup: new Date(this.lastCleanup).toISOString(),
      memoryUsage: {
        commandHistory: this.commandHistory.length,
        deviceCooldowns: this.deviceCooldowns.size,
        deviceDailyCommands: this.deviceDailyCommands.size,
        userHourlyCommands: this.userHourlyCommands.size
      }
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.commandHistory = [];
    this.deviceCooldowns.clear();
    this.deviceDailyCommands.clear();
    this.userHourlyCommands.clear();

    this.logger.info('[SafetyManager] Destroyed');
  }
}

module.exports = SafetyManager;
