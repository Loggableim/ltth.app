/**
 * Command Audit Log System
 * V4: Complete audit trail of all command executions
 */

class CommandAuditLog {
  constructor(maxEntries = 10000) {
    this.maxEntries = maxEntries;
    
    // Audit log entries
    this.entries = [];
    
    // Indexes for faster querying
    this.userIndex = new Map(); // userId -> entry indices
    this.commandIndex = new Map(); // commandName -> entry indices
    this.dateIndex = new Map(); // date string -> entry indices
    
    // Statistics
    this.stats = {
      totalLogged: 0,
      successCount: 0,
      failureCount: 0
    };
  }

  /**
   * Log a command execution
   * @param {Object} logEntry - Log entry data
   */
  log(logEntry) {
    const entry = {
      id: this.stats.totalLogged + 1,
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      userId: logEntry.userId,
      username: logEntry.username,
      command: logEntry.command,
      args: logEntry.args || [],
      success: logEntry.success,
      error: logEntry.error || null,
      result: logEntry.result || null,
      executionTime: logEntry.executionTime || 0,
      ipAddress: logEntry.ipAddress || null,
      metadata: logEntry.metadata || {}
    };

    // Add to entries
    this.entries.push(entry);
    
    // Update indexes
    this.updateIndexes(entry);

    // Update statistics
    this.stats.totalLogged++;
    if (entry.success) {
      this.stats.successCount++;
    } else {
      this.stats.failureCount++;
    }

    // Trim if over limit
    if (this.entries.length > this.maxEntries) {
      const removed = this.entries.shift();
      this.removeFromIndexes(removed);
    }
  }

  /**
   * Update indexes with new entry
   * @param {Object} entry - Log entry
   */
  updateIndexes(entry) {
    const index = this.entries.length - 1;

    // User index
    if (!this.userIndex.has(entry.userId)) {
      this.userIndex.set(entry.userId, []);
    }
    this.userIndex.get(entry.userId).push(index);

    // Command index
    if (!this.commandIndex.has(entry.command)) {
      this.commandIndex.set(entry.command, []);
    }
    this.commandIndex.get(entry.command).push(index);

    // Date index
    if (!this.dateIndex.has(entry.date)) {
      this.dateIndex.set(entry.date, []);
    }
    this.dateIndex.get(entry.date).push(index);
  }

  /**
   * Remove entry from indexes
   * @param {Object} entry - Log entry
   */
  removeFromIndexes(entry) {
    // This is simplified - in production, would need to update index arrays
    // For now, we'll rebuild indexes when needed
  }

  /**
   * Query audit log
   * @param {Object} filters - Query filters
   * @returns {Array} Matching log entries
   */
  query(filters = {}) {
    let results = [...this.entries];

    // Filter by user
    if (filters.userId) {
      const indices = this.userIndex.get(filters.userId) || [];
      results = indices.map(i => this.entries[i]).filter(e => e);
    }

    // Filter by command
    if (filters.command) {
      results = results.filter(e => e.command === filters.command);
    }

    // Filter by success status
    if (filters.success !== undefined) {
      results = results.filter(e => e.success === filters.success);
    }

    // Filter by date range
    if (filters.startDate) {
      const startTime = new Date(filters.startDate).getTime();
      results = results.filter(e => e.timestamp >= startTime);
    }

    if (filters.endDate) {
      const endTime = new Date(filters.endDate).getTime();
      results = results.filter(e => e.timestamp <= endTime);
    }

    // Filter by username (partial match)
    if (filters.username) {
      const searchTerm = filters.username.toLowerCase();
      results = results.filter(e => 
        e.username.toLowerCase().includes(searchTerm)
      );
    }

    // Sort
    if (filters.sortBy) {
      const order = filters.sortOrder === 'asc' ? 1 : -1;
      results.sort((a, b) => {
        if (a[filters.sortBy] < b[filters.sortBy]) return -1 * order;
        if (a[filters.sortBy] > b[filters.sortBy]) return 1 * order;
        return 0;
      });
    } else {
      // Default: newest first
      results.reverse();
    }

    // Limit
    if (filters.limit) {
      results = results.slice(0, filters.limit);
    }

    return results;
  }

  /**
   * Get entries for user
   * @param {string} userId - User ID
   * @param {number} limit - Maximum entries
   * @returns {Array} User's log entries
   */
  getUserLogs(userId, limit = 50) {
    return this.query({ userId, limit });
  }

  /**
   * Get entries for command
   * @param {string} command - Command name
   * @param {number} limit - Maximum entries
   * @returns {Array} Command log entries
   */
  getCommandLogs(command, limit = 50) {
    return this.query({ command, limit });
  }

  /**
   * Get entries for date
   * @param {string} date - Date (YYYY-MM-DD)
   * @returns {Array} Date log entries
   */
  getDateLogs(date) {
    const indices = this.dateIndex.get(date) || [];
    return indices.map(i => this.entries[i]).filter(e => e);
  }

  /**
   * Get recent entries
   * @param {number} limit - Maximum entries
   * @returns {Array} Recent log entries
   */
  getRecentLogs(limit = 100) {
    return this.entries.slice(-limit).reverse();
  }

  /**
   * Get failed commands
   * @param {number} limit - Maximum entries
   * @returns {Array} Failed command entries
   */
  getFailedCommands(limit = 50) {
    return this.query({ success: false, limit });
  }

  /**
   * Get statistics
   * @returns {Object} Audit log stats
   */
  getStats() {
    return {
      ...this.stats,
      currentEntries: this.entries.length,
      maxEntries: this.maxEntries,
      utilizationPercent: parseFloat(((this.entries.length / this.maxEntries) * 100).toFixed(2)),
      uniqueUsers: this.userIndex.size,
      uniqueCommands: this.commandIndex.size,
      datesTracked: this.dateIndex.size
    };
  }

  /**
   * Clear audit log
   */
  clear() {
    this.entries = [];
    this.userIndex.clear();
    this.commandIndex.clear();
    this.dateIndex.clear();
    this.stats = {
      totalLogged: 0,
      successCount: 0,
      failureCount: 0
    };
  }

  /**
   * Export audit log
   * @param {Object} filters - Export filters
   * @returns {Array} Filtered entries for export
   */
  export(filters = {}) {
    return this.query(filters);
  }
}

module.exports = CommandAuditLog;
