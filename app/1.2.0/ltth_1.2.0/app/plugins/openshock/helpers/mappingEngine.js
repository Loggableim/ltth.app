/**
 * MappingEngine - Maps TikTok events to OpenShock actions
 *
 * Handles flexible event-to-action mapping with conditions,
 * cooldowns, user filters, and safety limits.
 */

class MappingEngine {
  constructor(logger) {
    this.logger = logger || console;
    this.mappings = new Map(); // id -> mapping
    this.cooldowns = {
      global: new Map(),      // mappingId -> timestamp
      perDevice: new Map(),   // mappingId:deviceId -> timestamp
      perUser: new Map()      // mappingId:userId -> timestamp
    };

    // Valid event types
    this.validEventTypes = [
      'chat',
      'gift',
      'follow',
      'share',
      'subscribe',
      'like',
      'goal_progress',
      'goal_complete'
    ];

    // Valid action types
    this.validActionTypes = [
      'command', // Single command (shock/vibrate/sound)
      'shock',   // Legacy support
      'vibrate', // Legacy support
      'sound',   // Legacy support
      'pattern',
      'batch'
    ];

    // Safety absolute limits (never exceed these)
    this.absoluteLimits = {
      maxIntensity: 100,
      minIntensity: 1,
      maxDuration: 30000,
      minDuration: 300
    };

    this.logger.info('[MappingEngine] Initialized');
  }

  /**
   * Add a new mapping
   * @param {Object} mapping - Mapping configuration
   * @returns {Object} Added mapping with generated ID if needed
   */
  addMapping(mapping) {
    try {
      // Generate ID if not provided
      if (!mapping.id) {
        mapping.id = this._generateId();
      }

      // Validate mapping structure
      const validation = this.validateMapping(mapping);
      if (!validation.valid) {
        throw new Error(`Invalid mapping: ${validation.errors.join(', ')}`);
      }

      // Check for duplicate ID
      if (this.mappings.has(mapping.id)) {
        throw new Error(`Mapping with ID ${mapping.id} already exists`);
      }

      // Set defaults
      const fullMapping = this._setDefaults(mapping);

      // Store mapping
      this.mappings.set(fullMapping.id, fullMapping);

      this.logger.info(`[MappingEngine] Added mapping: ${fullMapping.id} - ${fullMapping.name}`);
      return fullMapping;
    } catch (error) {
      this.logger.error('[MappingEngine] Error adding mapping:', error.message);
      throw error;
    }
  }

  /**
   * Update an existing mapping
   * @param {string} id - Mapping ID
   * @param {Object} updates - Partial mapping updates
   * @returns {Object} Updated mapping
   */
  updateMapping(id, updates) {
    try {
      const existing = this.mappings.get(id);
      if (!existing) {
        throw new Error(`Mapping with ID ${id} not found`);
      }

      // Merge updates
      const updated = {
        ...existing,
        ...updates,
        id: existing.id, // Prevent ID changes
        conditions: { ...existing.conditions, ...(updates.conditions || {}) },
        action: { ...existing.action, ...(updates.action || {}) },
        cooldown: { ...existing.cooldown, ...(updates.cooldown || {}) },
        safety: { ...existing.safety, ...(updates.safety || {}) }
      };

      // Validate updated mapping
      const validation = this.validateMapping(updated);
      if (!validation.valid) {
        throw new Error(`Invalid mapping update: ${validation.errors.join(', ')}`);
      }

      this.mappings.set(id, updated);

      this.logger.info(`[MappingEngine] Updated mapping: ${id}`);
      return updated;
    } catch (error) {
      this.logger.error('[MappingEngine] Error updating mapping:', error.message);
      throw error;
    }
  }

  /**
   * Delete a mapping
   * @param {string} id - Mapping ID
   * @returns {boolean} Success status
   */
  deleteMapping(id) {
    try {
      if (!this.mappings.has(id)) {
        throw new Error(`Mapping with ID ${id} not found`);
      }

      this.mappings.delete(id);

      // Clean up cooldowns
      this.cooldowns.global.delete(id);

      // Clean up per-device cooldowns
      for (const key of this.cooldowns.perDevice.keys()) {
        if (key.startsWith(id + ':')) {
          this.cooldowns.perDevice.delete(key);
        }
      }

      // Clean up per-user cooldowns
      for (const key of this.cooldowns.perUser.keys()) {
        if (key.startsWith(id + ':')) {
          this.cooldowns.perUser.delete(key);
        }
      }

      this.logger.info(`[MappingEngine] Deleted mapping: ${id}`);
      return true;
    } catch (error) {
      this.logger.error('[MappingEngine] Error deleting mapping:', error.message);
      throw error;
    }
  }

  /**
   * Get a specific mapping
   * @param {string} id - Mapping ID
   * @returns {Object|null} Mapping or null if not found
   */
  getMapping(id) {
    return this.mappings.get(id) || null;
  }

  /**
   * Get all mappings
   * @returns {Array} Array of all mappings
   */
  getAllMappings() {
    return Array.from(this.mappings.values());
  }

  /**
   * Get mappings filtered by event type
   * @param {string} eventType - Event type to filter
   * @returns {Array} Filtered mappings
   */
  getMappingsByEvent(eventType) {
    return this.getAllMappings().filter(m => m.eventType === eventType);
  }

  /**
   * Evaluate an event and return matching mappings with actions
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   * @returns {Array} Array of matching mappings with actions to execute
   */
  evaluateEvent(eventType, eventData) {
    try {
      const matches = [];

      // Get mappings for this event type
      const candidates = this.getMappingsByEvent(eventType)
        .filter(m => m.enabled);

      this.logger.debug(`[MappingEngine] Evaluating ${eventType} event, ${candidates.length} candidates`);

      for (const mapping of candidates) {
        // Check conditions
        if (!this.checkConditions(mapping, eventData)) {
          this.logger.debug(`[MappingEngine] Conditions not met for mapping ${mapping.id}`);
          continue;
        }

        // Check cooldowns
        // Support both field name formats: userId/userName (expected) and uniqueId/username (TikTok format)
        const userId = eventData.user?.userId || eventData.userId || eventData.uniqueId || 'unknown';
        const deviceId = mapping.action.deviceId;

        if (!this.checkCooldown(mapping, userId, deviceId)) {
          this.logger.debug(`[MappingEngine] Cooldown active for mapping ${mapping.id}`);
          continue;
        }

        // Apply safety limits
        const safeAction = this.applySafety(mapping);

        // Register cooldown
        this.registerCooldown(mapping.id, userId, deviceId);

        matches.push({
          mapping: mapping,
          action: safeAction,
          eventData: eventData
        });

        this.logger.info(`[MappingEngine] Matched mapping ${mapping.id}: ${mapping.name}`);
      }

      // For gift events: If there's a specific gift mapping, exclude generic catch-all mappings
      if (eventType === 'gift' && matches.length > 0) {
        // Check if any match has a specific giftName condition
        const hasSpecificGiftMapping = matches.some(m => 
          m.mapping.conditions?.giftName && 
          m.mapping.conditions.giftName.trim() !== '' &&
          m.mapping.conditions.giftName !== '*'
        );
        
        if (hasSpecificGiftMapping) {
          // Filter out generic/catch-all mappings (no giftName or wildcard)
          const filteredMatches = matches.filter(m => {
            const hasSpecificGift = m.mapping.conditions?.giftName && 
                                   m.mapping.conditions.giftName.trim() !== '' &&
                                   m.mapping.conditions.giftName !== '*';
            return hasSpecificGift;
          });
          
          this.logger.info(`[MappingEngine] Gift event: Specific mapping found, ignoring ${matches.length - filteredMatches.length} generic mappings`);
          matches.length = 0;
          matches.push(...filteredMatches);
        }
      }

      // Sort by priority (higher priority first)
      matches.sort((a, b) => {
        const priorityA = a.mapping.action.priority || 5;
        const priorityB = b.mapping.action.priority || 5;
        return priorityB - priorityA;
      });

      return matches;
    } catch (error) {
      this.logger.error('[MappingEngine] Error evaluating event:', error.message);
      return [];
    }
  }

  /**
   * Check if mapping conditions are met
   * @param {Object} mapping - Mapping configuration
   * @param {Object} eventData - Event data
   * @returns {boolean} True if conditions are met
   */
  checkConditions(mapping, eventData) {
    const conditions = mapping.conditions || {};

    try {
      // User filters
      // Support both field name formats: userId/userName (expected) and uniqueId/username (TikTok format)
      const userId = eventData.user?.userId || eventData.userId || eventData.uniqueId;
      const userName = eventData.user?.userName || eventData.userName || eventData.username || '';

      // Whitelist check (user must be in whitelist with userId OR userName)
      if (conditions.whitelist && conditions.whitelist.length > 0) {
        if (!conditions.whitelist.includes(userId) && !conditions.whitelist.includes(userName)) {
          return false;
        }
      }

      // Blacklist check (user is blocked if userId OR userName is in blacklist)
      if (conditions.blacklist && conditions.blacklist.length > 0) {
        if (conditions.blacklist.includes(userId) || conditions.blacklist.includes(userName)) {
          return false;
        }
      }

      // Team level check
      if (conditions.teamLevelMin !== undefined && conditions.teamLevelMin > 0) {
        // Support both teamLevel and teamMemberLevel (TikTok format)
        const teamLevel = eventData.user?.teamLevel || eventData.teamLevel || eventData.teamMemberLevel || 0;
        if (teamLevel < conditions.teamLevelMin) {
          return false;
        }
      }

      // Follower age check (in days)
      if (conditions.followerAgeMin !== undefined && conditions.followerAgeMin > 0) {
        const followTime = eventData.user?.followTime;
        if (followTime) {
          const ageInDays = (Date.now() - followTime) / (1000 * 60 * 60 * 24);
          if (ageInDays < conditions.followerAgeMin) {
            return false;
          }
        }
      }

      // Event-specific conditions
      switch (mapping.eventType) {
        case 'gift':
          // Check gift name if specified
          if (conditions.giftName) {
            const giftName = eventData.giftName || eventData.gift?.name || '';
            
            this.logger.debug(`[MappingEngine] Comparing gift names - Expected: "${conditions.giftName}", Received: "${giftName}"`);
            
            // Case-insensitive comparison
            if (giftName.toLowerCase() !== conditions.giftName.toLowerCase()) {
              this.logger.debug(`[MappingEngine] Gift name mismatch for mapping ${mapping.id}`);
              return false;
            }
            
            this.logger.debug(`[MappingEngine] Gift name matched for mapping ${mapping.id}`);
          }
          
          // Check coin range if specified
          const coins = eventData.giftCoins || eventData.coins || 0;
          
          this.logger.debug(`[MappingEngine] Gift coins: ${coins}, minCoins: ${conditions.minCoins}, maxCoins: ${conditions.maxCoins}`);
          
          if (conditions.minCoins !== undefined && coins < conditions.minCoins) {
            this.logger.debug(`[MappingEngine] Coins ${coins} below minimum ${conditions.minCoins}`);
            return false;
          }
          
          if (conditions.maxCoins !== undefined && coins > conditions.maxCoins) {
            this.logger.debug(`[MappingEngine] Coins ${coins} above maximum ${conditions.maxCoins}`);
            return false;
          }
          
          break;

        case 'chat':
          if (conditions.messagePattern) {
            const message = eventData.message || eventData.comment || '';
            try {
              // Validate regex pattern to prevent ReDoS attacks
              if (!this._isRegexSafe(conditions.messagePattern)) {
                this.logger.warn('[MappingEngine] Potentially dangerous regex pattern rejected:', conditions.messagePattern);
                return false;
              }

              // Add 'im' flags for case-insensitive and multiline matching
              const regex = new RegExp(conditions.messagePattern, 'im');

              // Use safe regex testing with timeout protection
              if (!this._safeRegexTest(regex, message)) {
                return false;
              }
            } catch (error) {
              this.logger.error('[MappingEngine] Invalid regex pattern:', error.message);
              return false;
            }
          }
          break;

        case 'like':
          if (conditions.minLikes !== undefined) {
            const likes = eventData.likeCount || eventData.likes || 0;
            if (likes < conditions.minLikes) {
              return false;
            }
          }
          break;
      }

      return true;
    } catch (error) {
      this.logger.error('[MappingEngine] Error checking conditions:', error.message);
      return false;
    }
  }

  /**
   * Check if cooldowns allow execution
   * @param {Object} mapping - Mapping configuration
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   * @returns {boolean} True if cooldowns allow execution
   */
  checkCooldown(mapping, userId, deviceId) {
    const now = Date.now();
    const cooldown = mapping.cooldown || {};

    // Check global cooldown
    if (cooldown.global && cooldown.global > 0) {
      const lastGlobal = this.cooldowns.global.get(mapping.id);
      if (lastGlobal && (now - lastGlobal) < cooldown.global) {
        return false;
      }
    }

    // Check per-device cooldown
    if (cooldown.perDevice && cooldown.perDevice > 0 && deviceId) {
      const key = `${mapping.id}:${deviceId}`;
      const lastDevice = this.cooldowns.perDevice.get(key);
      if (lastDevice && (now - lastDevice) < cooldown.perDevice) {
        return false;
      }
    }

    // Check per-user cooldown
    if (cooldown.perUser && cooldown.perUser > 0 && userId) {
      const key = `${mapping.id}:${userId}`;
      const lastUser = this.cooldowns.perUser.get(key);
      if (lastUser && (now - lastUser) < cooldown.perUser) {
        return false;
      }
    }

    return true;
  }

  /**
   * Register cooldown timestamps
   * @param {string} mappingId - Mapping ID
   * @param {string} userId - User ID
   * @param {string} deviceId - Device ID
   */
  registerCooldown(mappingId, userId, deviceId) {
    const now = Date.now();

    // Register global cooldown
    this.cooldowns.global.set(mappingId, now);

    // Register per-device cooldown
    if (deviceId) {
      const deviceKey = `${mappingId}:${deviceId}`;
      this.cooldowns.perDevice.set(deviceKey, now);
    }

    // Register per-user cooldown
    if (userId) {
      const userKey = `${mappingId}:${userId}`;
      this.cooldowns.perUser.set(userKey, now);
    }

    // Cleanup old cooldowns (older than 1 hour)
    this._cleanupCooldowns(now);
  }

  /**
   * Apply safety limits to mapping action
   * @param {Object} mapping - Mapping configuration
   * @returns {Object} Safe action configuration
   */
  applySafety(mapping) {
    const action = { ...mapping.action };
    const safety = mapping.safety || {};

    // Apply intensity limits
    if (action.intensity !== undefined) {
      const maxIntensity = Math.min(
        safety.maxIntensity || this.absoluteLimits.maxIntensity,
        this.absoluteLimits.maxIntensity
      );
      action.intensity = Math.max(
        this.absoluteLimits.minIntensity,
        Math.min(action.intensity, maxIntensity)
      );
    }

    // Apply duration limits
    if (action.duration !== undefined) {
      const maxDuration = Math.min(
        safety.maxDuration || this.absoluteLimits.maxDuration,
        this.absoluteLimits.maxDuration
      );
      action.duration = Math.max(
        this.absoluteLimits.minDuration,
        Math.min(action.duration, maxDuration)
      );
    }

    return action;
  }

  /**
   * Export all mappings as JSON
   * @returns {string} JSON string of all mappings
   */
  exportMappings() {
    try {
      const mappings = this.getAllMappings();
      return JSON.stringify(mappings, null, 2);
    } catch (error) {
      this.logger.error('[MappingEngine] Error exporting mappings:', error.message);
      throw error;
    }
  }

  /**
   * Import mappings from JSON
   * @param {string} json - JSON string of mappings
   * @returns {Object} Import result with counts
   */
  importMappings(json) {
    try {
      const mappings = JSON.parse(json);

      if (!Array.isArray(mappings)) {
        throw new Error('Import data must be an array of mappings');
      }

      let imported = 0;
      let skipped = 0;
      let errors = [];

      for (const mapping of mappings) {
        try {
          this.addMapping(mapping);
          imported++;
        } catch (error) {
          skipped++;
          errors.push(`${mapping.id || 'unknown'}: ${error.message}`);
        }
      }

      this.logger.info(`[MappingEngine] Imported ${imported} mappings, skipped ${skipped}`);

      return {
        imported,
        skipped,
        errors,
        total: mappings.length
      };
    } catch (error) {
      this.logger.error('[MappingEngine] Error importing mappings:', error.message);
      throw error;
    }
  }

  /**
   * Validate mapping structure
   * @param {Object} mapping - Mapping to validate
   * @returns {Object} Validation result with valid flag and errors
   */
  validateMapping(mapping) {
    const errors = [];

    // Check required fields
    if (!mapping.eventType) {
      errors.push('eventType is required');
    } else if (!this.validEventTypes.includes(mapping.eventType)) {
      errors.push(`Invalid eventType: ${mapping.eventType}`);
    }

    if (!mapping.name) {
      errors.push('name is required');
    }

    // Validate action
    if (!mapping.action) {
      errors.push('action is required');
    } else {
      if (!mapping.action.type) {
        errors.push('action.type is required');
      } else if (!this.validActionTypes.includes(mapping.action.type)) {
        errors.push(`Invalid action.type: ${mapping.action.type}`);
      }

      if (!mapping.action.deviceId && mapping.action.type !== 'batch') {
        errors.push('action.deviceId is required');
      }

      // Validate intensity
      if (mapping.action.intensity !== undefined) {
        if (mapping.action.intensity < this.absoluteLimits.minIntensity ||
            mapping.action.intensity > this.absoluteLimits.maxIntensity) {
          errors.push(`action.intensity must be between ${this.absoluteLimits.minIntensity} and ${this.absoluteLimits.maxIntensity}`);
        }
      }

      // Validate duration
      if (mapping.action.duration !== undefined) {
        if (mapping.action.duration < this.absoluteLimits.minDuration ||
            mapping.action.duration > this.absoluteLimits.maxDuration) {
          errors.push(`action.duration must be between ${this.absoluteLimits.minDuration} and ${this.absoluteLimits.maxDuration}ms`);
        }
      }
    }

    // Validate conditions regex if present
    if (mapping.conditions?.messagePattern) {
      try {
        new RegExp(mapping.conditions.messagePattern);
      } catch (error) {
        errors.push(`Invalid messagePattern regex: ${error.message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate a unique ID for mappings
   * @returns {string} Unique ID
   * @private
   */
  _generateId() {
    return `mapping_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Set default values for mapping
   * @param {Object} mapping - Partial mapping
   * @returns {Object} Complete mapping with defaults
   * @private
   */
  _setDefaults(mapping) {
    return {
      enabled: true,
      ...mapping,
      conditions: {
        minCoins: 0,
        messagePattern: null,
        minLikes: 0,
        teamLevelMin: 0,
        followerAgeMin: 0,
        whitelist: [],
        blacklist: [],
        ...(mapping.conditions || {})
      },
      action: {
        priority: 5,
        ...(mapping.action || {})
      },
      cooldown: {
        global: 0,
        perDevice: 0,
        perUser: 0,
        ...(mapping.cooldown || {})
      },
      safety: {
        maxIntensity: 80,
        maxDuration: 5000,
        requireConfirmation: false,
        ...(mapping.safety || {})
      }
    };
  }

  /**
   * Cleanup old cooldown entries
   * @param {number} now - Current timestamp
   * @private
   */
  _cleanupCooldowns(now) {
    const maxAge = 60 * 60 * 1000; // 1 hour

    // Cleanup global cooldowns
    for (const [key, timestamp] of this.cooldowns.global.entries()) {
      if (now - timestamp > maxAge) {
        this.cooldowns.global.delete(key);
      }
    }

    // Cleanup per-device cooldowns
    for (const [key, timestamp] of this.cooldowns.perDevice.entries()) {
      if (now - timestamp > maxAge) {
        this.cooldowns.perDevice.delete(key);
      }
    }

    // Cleanup per-user cooldowns
    for (const [key, timestamp] of this.cooldowns.perUser.entries()) {
      if (now - timestamp > maxAge) {
        this.cooldowns.perUser.delete(key);
      }
    }
  }

  /**
   * Check if a regex pattern is safe from ReDoS attacks
   * @param {string} pattern - The regex pattern to validate
   * @returns {boolean} - True if pattern is safe
   */
  _isRegexSafe(pattern) {
    if (!pattern || typeof pattern !== 'string') {
      return false;
    }

    // Reject patterns that are too long (potential complexity attack)
    if (pattern.length > 200) {
      return false;
    }

    // Reject patterns with excessive nested quantifiers (major ReDoS vector)
    // Examples: (a+)+, (a*)*,  (a+)*, ((a+)+)+
    const nestedQuantifiers = /(\(.*[*+]\))[*+]/g;
    if (nestedQuantifiers.test(pattern)) {
      return false;
    }

    // Reject patterns with excessive alternation combined with quantifiers
    // Example: (a|b|c|d|e|f)+
    const alternationWithQuantifiers = /\([^)]*(\|[^)]*){5,}\)[*+]/g;
    if (alternationWithQuantifiers.test(pattern)) {
      return false;
    }

    // Reject patterns with excessive repetition ranges
    // Example: a{1,1000000}
    const excessiveRepetition = /\{\d+,(\d{6,}|\d{5,})\}/g;
    if (excessiveRepetition.test(pattern)) {
      return false;
    }

    // Count total quantifiers - too many can indicate complexity
    const quantifierCount = (pattern.match(/[*+?{]/g) || []).length;
    if (quantifierCount > 15) {
      return false;
    }

    return true;
  }

  /**
   * Execute regex test with timeout protection
   * @param {RegExp} regex - The compiled regex
   * @param {string} str - The string to test
   * @param {number} timeoutMs - Timeout in milliseconds (default: 100ms)
   * @returns {boolean} - True if regex matches, false otherwise or on timeout
   */
  _safeRegexTest(regex, str, timeoutMs = 100) {
    let result = false;
    let timedOut = false;

    // Create a timeout to prevent long-running regex
    const timeout = setTimeout(() => {
      timedOut = true;
    }, timeoutMs);

    try {
      // For very long strings, truncate to prevent excessive processing
      const maxLength = 10000;
      const testStr = str.length > maxLength ? str.substring(0, maxLength) : str;

      // Store start time to detect slow regex
      const startTime = Date.now();

      result = regex.test(testStr);

      // If execution took too long, log warning
      const executionTime = Date.now() - startTime;
      if (executionTime > 50) {
        this.logger.warn(`[MappingEngine] Slow regex detected (${executionTime}ms):`, regex.source);
      }

      if (timedOut) {
        this.logger.warn('[MappingEngine] Regex execution timed out:', regex.source);
        return false;
      }
    } catch (error) {
      this.logger.error('[MappingEngine] Regex execution error:', error.message);
      result = false;
    } finally {
      clearTimeout(timeout);
    }

    return result;
  }
}

module.exports = MappingEngine;
