/**
 * Command Scheduler
 * F7: Allows scheduling commands for delayed or recurring execution
 */

class CommandScheduler {
  constructor(commandParser) {
    this.commandParser = commandParser;
    
    // Map<scheduleId, ScheduleEntry>
    this.schedules = new Map();
    
    // Active timers
    this.timers = new Map();
    
    // Schedule ID counter
    this.nextId = 1;
    
    // Statistics
    this.stats = {
      totalScheduled: 0,
      totalExecuted: 0,
      totalCancelled: 0
    };
  }

  /**
   * Schedule a command for execution
   * @param {Object} scheduleDef - Schedule definition
   * @returns {number} Schedule ID
   */
  scheduleCommand(scheduleDef) {
    const scheduleId = this.nextId++;
    
    const schedule = {
      id: scheduleId,
      command: scheduleDef.command,
      context: scheduleDef.context,
      executeAt: scheduleDef.executeAt, // Timestamp or null for recurring
      delay: scheduleDef.delay || 0, // Delay in ms
      recurring: scheduleDef.recurring || false,
      interval: scheduleDef.interval || 0, // Interval for recurring in ms
      maxExecutions: scheduleDef.maxExecutions || (scheduleDef.recurring ? Infinity : 1),
      executionCount: 0,
      enabled: true,
      createdAt: Date.now()
    };

    this.schedules.set(scheduleId, schedule);
    this.stats.totalScheduled++;

    // Start timer
    this.startSchedule(scheduleId);

    return scheduleId;
  }

  /**
   * Start a schedule timer
   * @param {number} scheduleId - Schedule ID
   */
  startSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled) return;

    let delay;
    
    if (schedule.executeAt) {
      delay = schedule.executeAt - Date.now();
      if (delay < 0) delay = 0;
    } else {
      delay = schedule.delay;
    }

    const timer = setTimeout(async () => {
      await this.executeScheduledCommand(scheduleId);
    }, delay);

    this.timers.set(scheduleId, timer);
  }

  /**
   * Execute a scheduled command
   * @param {number} scheduleId - Schedule ID
   */
  async executeScheduledCommand(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule || !schedule.enabled) return;

    try {
      // Execute command
      await this.commandParser.parse(schedule.command, schedule.context);
      
      schedule.executionCount++;
      this.stats.totalExecuted++;

      // Check if should continue recurring
      if (schedule.recurring && schedule.executionCount < schedule.maxExecutions) {
        // Schedule next execution
        schedule.delay = schedule.interval;
        schedule.executeAt = null;
        this.startSchedule(scheduleId);
      } else {
        // Remove completed schedule
        this.cancelSchedule(scheduleId);
      }
    } catch (error) {
      // On error, don't reschedule
      this.cancelSchedule(scheduleId);
    }
  }

  /**
   * Cancel a scheduled command
   * @param {number} scheduleId - Schedule ID
   * @returns {boolean} True if cancelled
   */
  cancelSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;

    // Clear timer
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }

    // Remove schedule
    this.schedules.delete(scheduleId);
    this.stats.totalCancelled++;

    return true;
  }

  /**
   * Get schedule by ID
   * @param {number} scheduleId - Schedule ID
   * @returns {Object|null} Schedule or null
   */
  getSchedule(scheduleId) {
    return this.schedules.get(scheduleId) || null;
  }

  /**
   * Get all schedules
   * @returns {Array} Array of schedules
   */
  getAllSchedules() {
    return Array.from(this.schedules.values());
  }

  /**
   * Get active schedules for user
   * @param {string} userId - User ID
   * @returns {Array} Array of user's schedules
   */
  getUserSchedules(userId) {
    return Array.from(this.schedules.values())
      .filter(schedule => schedule.context.userId === userId);
  }

  /**
   * Pause a schedule
   * @param {number} scheduleId - Schedule ID
   * @returns {boolean} True if paused
   */
  pauseSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;

    schedule.enabled = false;
    
    // Clear timer
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }

    return true;
  }

  /**
   * Resume a paused schedule
   * @param {number} scheduleId - Schedule ID
   * @returns {boolean} True if resumed
   */
  resumeSchedule(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;

    schedule.enabled = true;
    this.startSchedule(scheduleId);

    return true;
  }

  /**
   * Get statistics
   * @returns {Object} Scheduler stats
   */
  getStats() {
    return {
      ...this.stats,
      activeSchedules: this.schedules.size,
      activeTimers: this.timers.size
    };
  }

  /**
   * Clear all schedules
   */
  clearAllSchedules() {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.schedules.clear();
    this.timers.clear();
    this.stats = {
      totalScheduled: 0,
      totalExecuted: 0,
      totalCancelled: 0
    };
  }
}

module.exports = CommandScheduler;
