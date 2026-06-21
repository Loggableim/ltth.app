/**
 * Command Auto-Complete System
 * F11: Provides intelligent command suggestions as users type
 */

class CommandAutoCompleteEngine {
  constructor(commandRegistry) {
    this.commandRegistry = commandRegistry;
    
    // Suggestion cache
    // Map<prefix, Array<suggestions>>
    this.suggestionCache = new Map();
    
    // Usage frequency tracking for better suggestions
    // Map<commandName, usage count>
    this.usageFrequency = new Map();
    
    // Recently used commands per user
    // Map<userId, Array<commandName>>
    this.userRecentCommands = new Map();
  }

  /**
   * Get command suggestions based on partial input
   * @param {string} input - Partial command input
   * @param {Object} context - User context
   * @param {number} maxSuggestions - Maximum suggestions to return
   * @returns {Array} Array of suggestions
   */
  getSuggestions(input, context = {}, maxSuggestions = 5) {
    input = input.toLowerCase().trim();
    
    // Remove command prefix if present
    if (input.startsWith('/')) {
      input = input.substring(1);
    }

    // Check cache
    const cacheKey = `${input}:${context.userId || 'anon'}`;
    if (this.suggestionCache.has(cacheKey)) {
      return this.suggestionCache.get(cacheKey);
    }

    // Get all commands
    const allCommands = this.commandRegistry.getAllCommands({ enabled: true });
    
    // Find matching commands
    let matches = [];

    if (input.length === 0) {
      // No input - show most used or recent commands
      matches = this.getMostRelevantCommands(context, allCommands);
    } else {
      // Find prefix matches
      const prefixMatches = allCommands.filter(cmd => 
        cmd.name.toLowerCase().startsWith(input)
      );

      // Find substring matches (if not enough prefix matches)
      const substringMatches = allCommands.filter(cmd => 
        cmd.name.toLowerCase().includes(input) && 
        !cmd.name.toLowerCase().startsWith(input)
      );

      matches = [...prefixMatches, ...substringMatches];
    }

    // Score and sort suggestions
    const scoredSuggestions = matches.map(cmd => ({
      command: cmd,
      score: this.calculateSuggestionScore(cmd, input, context)
    }));

    scoredSuggestions.sort((a, b) => b.score - a.score);

    // Format suggestions
    const suggestions = scoredSuggestions
      .slice(0, maxSuggestions)
      .map(item => this.formatSuggestion(item.command, input));

    // Cache result
    this.suggestionCache.set(cacheKey, suggestions);
    
    // Limit cache size
    if (this.suggestionCache.size > 1000) {
      const firstKey = this.suggestionCache.keys().next().value;
      this.suggestionCache.delete(firstKey);
    }

    return suggestions;
  }

  /**
   * Calculate suggestion score for ranking
   * @param {Object} command - Command object
   * @param {string} input - User input
   * @param {Object} context - User context
   * @returns {number} Score
   */
  calculateSuggestionScore(command, input, context) {
    let score = 0;

    // Exact prefix match bonus
    if (command.name.toLowerCase().startsWith(input)) {
      score += 100;
      // More bonus for shorter remaining text
      score += (50 - (command.name.length - input.length) * 2);
    }

    // Usage frequency bonus
    const usage = this.usageFrequency.get(command.name) || 0;
    score += Math.min(usage, 50);

    // Recent usage bonus for this user
    if (context.userId) {
      const recentCommands = this.userRecentCommands.get(context.userId) || [];
      const recentIndex = recentCommands.indexOf(command.name);
      if (recentIndex !== -1) {
        score += (10 - recentIndex) * 5;
      }
    }

    // Permission bonus (user can actually use this command)
    if (context.userRole && command.permission) {
      // Simplified permission check - commands user can use get bonus
      score += 10;
    }

    // Category bonus (prefer certain categories)
    if (command.category === 'System' || command.category === 'Information') {
      score += 5;
    }

    return score;
  }

  /**
   * Get most relevant commands when no input provided
   * @param {Object} context - User context
   * @param {Array} allCommands - All commands
   * @returns {Array} Most relevant commands
   */
  getMostRelevantCommands(context, allCommands) {
    // Get user's recent commands
    if (context.userId) {
      const recentCommands = this.userRecentCommands.get(context.userId) || [];
      if (recentCommands.length > 0) {
        return recentCommands
          .map(name => allCommands.find(cmd => cmd.name === name))
          .filter(cmd => cmd !== undefined)
          .slice(0, 5);
      }
    }

    // Fallback to most frequently used globally
    const commandsWithUsage = allCommands.map(cmd => ({
      command: cmd,
      usage: this.usageFrequency.get(cmd.name) || 0
    }));

    commandsWithUsage.sort((a, b) => b.usage - a.usage);

    return commandsWithUsage.slice(0, 5).map(item => item.command);
  }

  /**
   * Format a suggestion for display
   * @param {Object} command - Command object
   * @param {string} input - User input
   * @returns {Object} Formatted suggestion
   */
  formatSuggestion(command, input) {
    return {
      name: command.name,
      displayName: `/${command.name}`,
      description: command.description,
      syntax: command.syntax,
      category: command.category,
      aliases: this.commandRegistry.getCommandAliases ? 
        this.commandRegistry.getCommandAliases(command.name) : [],
      // Highlight matching part
      matchStart: 0,
      matchEnd: input.length,
      permission: command.permission
    };
  }

  /**
   * Record command usage for better suggestions
   * @param {string} commandName - Command that was used
   * @param {string} userId - User ID
   */
  recordUsage(commandName, userId = null) {
    // Update global usage frequency
    const currentUsage = this.usageFrequency.get(commandName) || 0;
    this.usageFrequency.set(commandName, currentUsage + 1);

    // Update user's recent commands
    if (userId) {
      if (!this.userRecentCommands.has(userId)) {
        this.userRecentCommands.set(userId, []);
      }

      const recentCommands = this.userRecentCommands.get(userId);
      
      // Remove if already exists
      const index = recentCommands.indexOf(commandName);
      if (index !== -1) {
        recentCommands.splice(index, 1);
      }

      // Add to front
      recentCommands.unshift(commandName);

      // Keep only last 10
      if (recentCommands.length > 10) {
        recentCommands.pop();
      }
    }

    // Invalidate relevant cache entries
    this.suggestionCache.clear();
  }

  /**
   * Get fuzzy matches for typo tolerance
   * @param {string} input - User input
   * @param {Array} allCommands - All commands
   * @returns {Array} Fuzzy matches
   */
  getFuzzyMatches(input, allCommands) {
    const matches = [];
    
    for (const command of allCommands) {
      const distance = this.levenshteinDistance(input, command.name.substring(0, input.length));
      
      // Allow 1-2 character differences
      if (distance <= 2) {
        matches.push({
          command,
          distance
        });
      }
    }

    matches.sort((a, b) => a.distance - b.distance);
    return matches.map(item => item.command);
  }

  /**
   * Calculate Levenshtein distance between strings
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {number} Edit distance
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
   * Clear all caches
   */
  clearCache() {
    this.suggestionCache.clear();
  }

  /**
   * Get statistics
   * @returns {Object} Autocomplete stats
   */
  getStats() {
    return {
      cachedSuggestions: this.suggestionCache.size,
      trackedCommands: this.usageFrequency.size,
      usersTracked: this.userRecentCommands.size
    };
  }
}

module.exports = CommandAutoCompleteEngine;
