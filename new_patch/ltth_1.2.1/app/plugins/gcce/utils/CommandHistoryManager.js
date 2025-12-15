/**
 * Command History Manager
 * F3: Tracks command execution history with undo/redo capability
 */

class CommandHistoryManager {
  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
    
    // Map<userId, UserHistory>
    this.userHistories = new Map();
    
    // Global history
    this.globalHistory = [];
    
    // Statistics
    this.stats = {
      totalCommands: 0,
      totalUndos: 0,
      totalRedos: 0
    };
  }

  /**
   * Record a command execution
   * @param {Object} commandInfo - Command information
   * @param {Object} context - Execution context
   * @param {Object} result - Execution result
   */
  recordCommand(commandInfo, context, result) {
    const historyEntry = {
      command: commandInfo.name,
      args: commandInfo.args,
      userId: context.userId,
      username: context.username,
      timestamp: Date.now(),
      success: result.success,
      result: result,
      undoable: commandInfo.undoable || false,
      undoHandler: commandInfo.undoHandler || null
    };

    // Add to global history
    this.globalHistory.push(historyEntry);
    if (this.globalHistory.length > this.maxHistory * 10) {
      this.globalHistory.shift();
    }

    // Add to user history
    if (!this.userHistories.has(context.userId)) {
      this.userHistories.set(context.userId, {
        history: [],
        currentIndex: -1
      });
    }

    const userHistory = this.userHistories.get(context.userId);
    
    // Remove any commands after current index (if user executed new command after undo)
    if (userHistory.currentIndex < userHistory.history.length - 1) {
      userHistory.history.splice(userHistory.currentIndex + 1);
    }

    // Add to history
    userHistory.history.push(historyEntry);
    userHistory.currentIndex = userHistory.history.length - 1;

    // Limit history size
    if (userHistory.history.length > this.maxHistory) {
      userHistory.history.shift();
      userHistory.currentIndex--;
    }

    this.stats.totalCommands++;
  }

  /**
   * Undo last command for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Undo result
   */
  async undo(userId) {
    const userHistory = this.userHistories.get(userId);
    
    if (!userHistory || userHistory.currentIndex < 0) {
      return {
        success: false,
        error: 'No commands to undo'
      };
    }

    const entry = userHistory.history[userHistory.currentIndex];
    
    if (!entry.undoable || !entry.undoHandler) {
      return {
        success: false,
        error: 'Command is not undoable'
      };
    }

    try {
      // Execute undo handler
      const result = await entry.undoHandler(entry.args, entry.result);
      
      // Move index back
      userHistory.currentIndex--;
      this.stats.totalUndos++;

      return {
        success: true,
        undoneCommand: entry.command,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: `Undo failed: ${error.message}`
      };
    }
  }

  /**
   * Redo last undone command for user
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Redo result
   */
  async redo(userId) {
    const userHistory = this.userHistories.get(userId);
    
    if (!userHistory || userHistory.currentIndex >= userHistory.history.length - 1) {
      return {
        success: false,
        error: 'No commands to redo'
      };
    }

    // Move index forward
    userHistory.currentIndex++;
    const entry = userHistory.history[userHistory.currentIndex];
    
    this.stats.totalRedos++;

    return {
      success: true,
      redoneCommand: entry.command,
      message: `Redone command: /${entry.command}`
    };
  }

  /**
   * Get command history for user
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of entries
   * @returns {Array} Command history
   */
  getUserHistory(userId, limit = 10) {
    const userHistory = this.userHistories.get(userId);
    
    if (!userHistory) {
      return [];
    }

    const history = userHistory.history.slice(-limit).reverse();
    
    return history.map((entry, index) => ({
      command: entry.command,
      args: entry.args,
      timestamp: entry.timestamp,
      success: entry.success,
      undoable: entry.undoable,
      isCurrent: (userHistory.history.length - 1 - index) === userHistory.currentIndex
    }));
  }

  /**
   * Get global command history
   * @param {number} limit - Maximum number of entries
   * @returns {Array} Global command history
   */
  getGlobalHistory(limit = 50) {
    return this.globalHistory.slice(-limit).reverse().map(entry => ({
      command: entry.command,
      args: entry.args,
      userId: entry.userId,
      username: entry.username,
      timestamp: entry.timestamp,
      success: entry.success
    }));
  }

  /**
   * Clear history for user
   * @param {string} userId - User ID
   */
  clearUserHistory(userId) {
    this.userHistories.delete(userId);
  }

  /**
   * Clear all history
   */
  clearAllHistory() {
    this.userHistories.clear();
    this.globalHistory = [];
    this.stats = {
      totalCommands: 0,
      totalUndos: 0,
      totalRedos: 0
    };
  }

  /**
   * Get statistics
   * @returns {Object} History stats
   */
  getStats() {
    return {
      ...this.stats,
      activeUsers: this.userHistories.size,
      globalHistorySize: this.globalHistory.length
    };
  }
}

module.exports = CommandHistoryManager;
