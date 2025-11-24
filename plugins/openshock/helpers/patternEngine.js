/**
 * PatternEngine - Advanced Pattern/Sequence Engine for OpenShock
 *
 * Manages complex shock patterns and sequences with support for:
 * - Multiple step types (shock, vibrate, pause)
 * - Looping and repetition
 * - Pattern validation and execution tracking
 * - Preset patterns and custom curve generation
 * - Import/Export functionality
 */

class PatternEngine {
  constructor(logger) {
    this.logger = logger || console;
    this.patterns = new Map();
    this.executions = new Map();
    this.executionIdCounter = 0;

    // Initialize preset patterns
    this._initializePresetPatterns();

    this.logger.info('[PatternEngine] Initialized with preset patterns');
  }

  /**
   * Initialize preset patterns that come pre-installed
   * @private
   */
  _initializePresetPatterns() {
    const presets = [
      {
        id: 'preset-pulse',
        name: 'Pulse',
        description: 'Stufenweise ansteigende Intensität',
        preset: true,
        steps: [
          { type: 'shock', intensity: 20, duration: 500, delay: 0 },
          { type: 'pause', duration: 300 },
          { type: 'shock', intensity: 40, duration: 500, delay: 0 },
          { type: 'pause', duration: 300 },
          { type: 'shock', intensity: 60, duration: 500, delay: 0 },
          { type: 'pause', duration: 300 },
          { type: 'shock', intensity: 80, duration: 500, delay: 0 }
        ],
        loop: false,
        loopCount: 1
      },
      {
        id: 'preset-wave',
        name: 'Wave',
        description: 'Wellenförmiges Muster',
        preset: true,
        steps: [
          { type: 'shock', intensity: 30, duration: 400, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 50, duration: 400, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 70, duration: 400, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 50, duration: 400, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 30, duration: 400, delay: 0 }
        ],
        loop: false,
        loopCount: 1
      },
      {
        id: 'preset-random',
        name: 'Random',
        description: 'Zufällige Intensitäten (20-80%)',
        preset: true,
        steps: [
          { type: 'shock', intensity: 40, duration: 400, delay: 0 },
          { type: 'pause', duration: 250 },
          { type: 'shock', intensity: 60, duration: 400, delay: 0 },
          { type: 'pause', duration: 250 },
          { type: 'shock', intensity: 35, duration: 400, delay: 0 },
          { type: 'pause', duration: 250 },
          { type: 'shock', intensity: 70, duration: 400, delay: 0 },
          { type: 'pause', duration: 250 },
          { type: 'shock', intensity: 50, duration: 400, delay: 0 }
        ],
        loop: false,
        loopCount: 1,
        // NOTE: For true randomness, implement a generateRandomPattern() method
        isRandomTemplate: true
      },
      {
        id: 'preset-heartbeat',
        name: 'Heartbeat',
        description: 'Herzschlag-Muster',
        preset: true,
        steps: [
          { type: 'shock', intensity: 60, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 40, duration: 300, delay: 0 },
          { type: 'pause', duration: 800 },
          { type: 'shock', intensity: 60, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 40, duration: 300, delay: 0 },
          { type: 'pause', duration: 800 }
        ],
        loop: true,
        loopCount: 3
      },
      {
        id: 'preset-thunder',
        name: 'Thunder',
        description: 'Blitz-Muster mit schnellen Impulsen',
        preset: true,
        steps: [
          { type: 'shock', intensity: 90, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'shock', intensity: 95, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'shock', intensity: 85, duration: 300, delay: 0 },
          { type: 'pause', duration: 1500 },
          { type: 'shock', intensity: 70, duration: 500, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 60, duration: 400, delay: 0 }
        ],
        loop: false,
        loopCount: 1
      },
      {
        id: 'preset-crescendo',
        name: 'Crescendo',
        description: 'Langsam aufbauende Intensität',
        preset: true,
        steps: [
          { type: 'shock', intensity: 10, duration: 600, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 20, duration: 600, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 35, duration: 600, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 50, duration: 600, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 70, duration: 600, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 90, duration: 800, delay: 0 }
        ],
        loop: false,
        loopCount: 1
      },
      {
        id: 'preset-earthquake',
        name: 'Earthquake',
        description: 'Zitterndes Vibrationsmuster',
        preset: true,
        steps: [
          { type: 'vibrate', intensity: 40, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'vibrate', intensity: 60, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'vibrate', intensity: 50, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'vibrate', intensity: 70, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'vibrate', intensity: 45, duration: 300, delay: 0 },
          { type: 'pause', duration: 100 },
          { type: 'vibrate', intensity: 65, duration: 300, delay: 0 }
        ],
        loop: false,
        loopCount: 1
      },
      {
        id: 'preset-fireworks',
        name: 'Fireworks',
        description: 'Explosives Muster',
        preset: true,
        steps: [
          { type: 'shock', intensity: 30, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 40, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 55, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 75, duration: 400, delay: 0 },
          { type: 'pause', duration: 200 },
          { type: 'shock', intensity: 95, duration: 500, delay: 0 },
          { type: 'vibrate', intensity: 80, duration: 1000, delay: 0 },
          { type: 'pause', duration: 300 },
          { type: 'shock', intensity: 60, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 40, duration: 300, delay: 0 },
          { type: 'pause', duration: 150 },
          { type: 'shock', intensity: 20, duration: 300, delay: 0 }
        ],
        loop: false,
        loopCount: 1
      }
    ];

    presets.forEach(pattern => {
      pattern.totalDuration = this.calculateTotalDuration(pattern);
      this.patterns.set(pattern.id, pattern);
    });
  }

  /**
   * Add a new pattern
   * @param {Object} pattern - Pattern object
   * @returns {Object} Added pattern with calculated total duration
   */
  addPattern(pattern) {
    try {
      // Validate pattern
      this.validatePattern(pattern);

      // Generate ID if not provided
      if (!pattern.id) {
        pattern.id = `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      }

      // Check if pattern ID already exists
      if (this.patterns.has(pattern.id)) {
        throw new Error(`Pattern with ID ${pattern.id} already exists`);
      }

      // Calculate total duration
      pattern.totalDuration = this.calculateTotalDuration(pattern);

      // Set defaults
      pattern.loop = pattern.loop || false;
      pattern.loopCount = pattern.loopCount || 1;
      pattern.preset = false; // User patterns are not presets

      this.patterns.set(pattern.id, pattern);
      this.logger.info(`[PatternEngine] Added pattern: ${pattern.name} (${pattern.id})`);

      return pattern;
    } catch (error) {
      this.logger.error(`[PatternEngine] Error adding pattern: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update an existing pattern
   * @param {string} id - Pattern ID
   * @param {Object} updates - Pattern updates
   * @returns {Object} Updated pattern
   */
  updatePattern(id, updates) {
    try {
      const pattern = this.patterns.get(id);
      if (!pattern) {
        throw new Error(`Pattern with ID ${id} not found`);
      }

      // Prevent updating preset patterns
      if (pattern.preset) {
        throw new Error('Cannot update preset patterns');
      }

      // Merge updates
      const updatedPattern = { ...pattern, ...updates, id: pattern.id };

      // Validate updated pattern
      this.validatePattern(updatedPattern);

      // Recalculate total duration
      updatedPattern.totalDuration = this.calculateTotalDuration(updatedPattern);

      this.patterns.set(id, updatedPattern);
      this.logger.info(`[PatternEngine] Updated pattern: ${id}`);

      return updatedPattern;
    } catch (error) {
      this.logger.error(`[PatternEngine] Error updating pattern: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a pattern
   * @param {string} id - Pattern ID
   * @returns {boolean} Success status
   */
  deletePattern(id) {
    try {
      const pattern = this.patterns.get(id);
      if (!pattern) {
        throw new Error(`Pattern with ID ${id} not found`);
      }

      // Prevent deleting preset patterns
      if (pattern.preset) {
        throw new Error('Cannot delete preset patterns');
      }

      this.patterns.delete(id);
      this.logger.info(`[PatternEngine] Deleted pattern: ${id}`);

      return true;
    } catch (error) {
      this.logger.error(`[PatternEngine] Error deleting pattern: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get a pattern by ID
   * @param {string} id - Pattern ID
   * @returns {Object|null} Pattern object or null
   */
  getPattern(id) {
    return this.patterns.get(id) || null;
  }

  /**
   * Get all patterns
   * @returns {Array} Array of all patterns
   */
  getAllPatterns() {
    return Array.from(this.patterns.values());
  }

  /**
   * Get only preset patterns
   * @returns {Array} Array of preset patterns
   */
  getPresetPatterns() {
    return Array.from(this.patterns.values()).filter(p => p.preset === true);
  }

  /**
   * Execute a pattern on a device
   * @param {string} patternId - Pattern ID
   * @param {string} deviceId - OpenShock device ID
   * @param {Object} openShockClient - OpenShock client instance
   * @returns {string} Execution ID
   */
  async executePattern(patternId, deviceId, openShockClient) {
    try {
      const pattern = this.patterns.get(patternId);
      if (!pattern) {
        throw new Error(`Pattern with ID ${patternId} not found`);
      }

      // Generate execution ID
      const executionId = `exec-${++this.executionIdCounter}-${Date.now()}`;

      // Create execution tracking object
      const execution = {
        id: executionId,
        patternId: patternId,
        deviceId: deviceId,
        startTime: Date.now(),
        status: 'running',
        currentLoop: 0,
        timeouts: []
      };

      this.executions.set(executionId, execution);

      this.logger.info(`[PatternEngine] Starting pattern execution: ${patternId} on device ${deviceId}`);

      // Start pattern execution
      await this._executePatternLoop(pattern, deviceId, openShockClient, execution);

      return executionId;
    } catch (error) {
      this.logger.error(`[PatternEngine] Error executing pattern: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute pattern with loop support
   * @private
   */
  async _executePatternLoop(pattern, deviceId, openShockClient, execution) {
    const maxLoops = pattern.loop ? pattern.loopCount : 1;

    for (let loop = 0; loop < maxLoops; loop++) {
      execution.currentLoop = loop + 1;

      // Check if execution was stopped
      if (execution.status === 'stopped') {
        this.logger.info(`[PatternEngine] Execution ${execution.id} stopped at loop ${loop + 1}`);
        return;
      }

      this.logger.debug(`[PatternEngine] Executing loop ${loop + 1}/${maxLoops}`);

      // Execute all steps in sequence
      await this._executeSteps(pattern.steps, deviceId, openShockClient, execution);
    }

    // Mark execution as completed
    execution.status = 'completed';
    execution.endTime = Date.now();
    this.logger.info(`[PatternEngine] Execution ${execution.id} completed`);
  }

  /**
   * Execute all steps in sequence
   * @private
   */
  async _executeSteps(steps, deviceId, openShockClient, execution) {
    for (let i = 0; i < steps.length; i++) {
      // Check if execution was stopped
      if (execution.status === 'stopped') {
        return;
      }

      const step = steps[i];
      
      // Execute the step - for pause steps this includes the wait
      // For action steps (shock/vibrate/sound), this sends the command to the device
      await this._executeStep(step, deviceId, openShockClient, execution);
      
      // For action steps (not pause), wait for the device to complete execution
      // The OpenShock API sends the command async, but the device takes time to execute
      if (step.type !== 'pause') {
        await this._sleep(step.duration, execution);
      }
      
      // Additional delay between steps if specified (currently not used in presets)
      const delay = step.delay || 0;
      if (delay > 0) {
        await this._sleep(delay, execution);
      }
    }
  }

  /**
   * Execute a single step
   * @private
   */
  async _executeStep(step, deviceId, openShockClient, execution) {
    try {
      if (step.type === 'pause') {
        // Pause step - just wait
        this.logger.debug(`[PatternEngine] Pause: ${step.duration}ms`);
        await this._sleep(step.duration, execution);
        return;
      }

      // NO delay here - it was applied in _executeSteps

      this.logger.debug(`[PatternEngine] Executing ${step.type}: intensity=${step.intensity}, duration=${step.duration}ms`);

      // Use correct API methods
      if (step.type === 'shock') {
        await openShockClient.sendShock(deviceId, step.intensity, step.duration);
      } else if (step.type === 'vibrate') {
        await openShockClient.sendVibrate(deviceId, step.intensity, step.duration);
      } else if (step.type === 'sound' || step.type === 'beep') {
        await openShockClient.sendSound(deviceId, step.intensity, step.duration);
      } else {
        throw new Error(`Unknown step type: ${step.type}`);
      }
    } catch (error) {
      this.logger.error(`[PatternEngine] Error executing step: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sleep with execution tracking
   * @private
   */
  _sleep(ms, execution) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
        // Remove timeout from tracking AFTER resolve
        const index = execution.timeouts.indexOf(timeout);
        if (index > -1) {
          execution.timeouts.splice(index, 1);
        }
      }, ms);

      // Track timeout for cancellation
      execution.timeouts.push(timeout);
    });
  }

  /**
   * Stop a running pattern execution
   * @param {string} executionId - Execution ID
   * @returns {boolean} Success status
   */
  stopPattern(executionId) {
    try {
      const execution = this.executions.get(executionId);
      if (!execution) {
        throw new Error(`Execution with ID ${executionId} not found`);
      }

      if (execution.status === 'stopped' || execution.status === 'completed') {
        this.logger.warn(`[PatternEngine] Execution ${executionId} already ${execution.status}`);
        return false;
      }

      // Clear all timeouts
      execution.timeouts.forEach(timeout => clearTimeout(timeout));
      execution.timeouts = [];

      // Mark as stopped
      execution.status = 'stopped';
      execution.endTime = Date.now();

      this.logger.info(`[PatternEngine] Stopped pattern execution: ${executionId}`);

      return true;
    } catch (error) {
      this.logger.error(`[PatternEngine] Error stopping pattern: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validate a pattern
   * @param {Object} pattern - Pattern to validate
   * @returns {boolean} Validation result
   */
  validatePattern(pattern) {
    if (!pattern) {
      throw new Error('Pattern is required');
    }

    if (!pattern.name || typeof pattern.name !== 'string') {
      throw new Error('Pattern name is required and must be a string');
    }

    if (!pattern.steps || !Array.isArray(pattern.steps) || pattern.steps.length === 0) {
      throw new Error('Pattern must have at least one step');
    }

    // Validate each step
    pattern.steps.forEach((step, index) => {
      if (!step.type || !['shock', 'vibrate', 'pause'].includes(step.type)) {
        throw new Error(`Step ${index}: Invalid type. Must be 'shock', 'vibrate', or 'pause'`);
      }

      if (step.type !== 'pause') {
        // Validate intensity (1-100)
        if (typeof step.intensity !== 'number' || step.intensity < 1 || step.intensity > 100) {
          throw new Error(`Step ${index}: Intensity must be between 1 and 100`);
        }

        // Validate duration (300-30000)
        if (typeof step.duration !== 'number' || step.duration < 300 || step.duration > 30000) {
          throw new Error(`Step ${index}: Duration must be between 300 and 30000 ms`);
        }
      } else {
        // Pause must have duration
        if (typeof step.duration !== 'number' || step.duration < 0) {
          throw new Error(`Step ${index}: Pause duration must be a positive number`);
        }
      }

      // Validate delay if present
      if (step.delay !== undefined && (typeof step.delay !== 'number' || step.delay < 0)) {
        throw new Error(`Step ${index}: Delay must be a non-negative number`);
      }
    });

    return true;
  }

  /**
   * Calculate total duration of a pattern
   * @param {Object} pattern - Pattern object
   * @returns {number} Total duration in milliseconds
   */
  calculateTotalDuration(pattern) {
    if (!pattern || !pattern.steps) {
      return 0;
    }

    const singleLoopDuration = pattern.steps.reduce((total, step) => {
      const stepDuration = step.duration || 0;
      const stepDelay = step.delay || 0;
      return total + stepDuration + stepDelay;
    }, 0);

    const loopCount = pattern.loop ? (pattern.loopCount || 1) : 1;
    return singleLoopDuration * loopCount;
  }

  /**
   * Build a pattern from a mathematical curve
   * @param {string} curveType - Type of curve (linear, exponential, sine, triangle, sawtooth, square)
   * @param {number} duration - Total duration in milliseconds
   * @param {number} maxIntensity - Maximum intensity (1-100)
   * @returns {Object} Generated pattern
   */
  buildPatternFromCurve(curveType, duration, maxIntensity) {
    const steps = [];
    const numSteps = 10; // Number of steps in the pattern
    const stepDuration = Math.floor(duration / numSteps);

    for (let i = 0; i < numSteps; i++) {
      const progress = i / (numSteps - 1); // 0 to 1
      let intensity;

      switch (curveType) {
        case 'linear':
          intensity = Math.floor(maxIntensity * progress);
          break;

        case 'exponential':
          intensity = Math.floor(maxIntensity * Math.pow(progress, 2));
          break;

        case 'sine':
          intensity = Math.floor(maxIntensity * Math.sin(progress * Math.PI / 2));
          break;

        case 'triangle':
          intensity = progress < 0.5
            ? Math.floor(maxIntensity * (progress * 2))
            : Math.floor(maxIntensity * (2 - progress * 2));
          break;

        case 'sawtooth':
          intensity = Math.floor(maxIntensity * progress);
          // Reset at the end
          if (i === numSteps - 1) {
            intensity = Math.floor(maxIntensity * 0.1);
          }
          break;

        case 'square':
          intensity = progress < 0.5 ? Math.floor(maxIntensity * 0.3) : Math.floor(maxIntensity);
          break;

        default:
          throw new Error(`Unknown curve type: ${curveType}`);
      }

      // Ensure intensity is within bounds
      intensity = Math.max(1, Math.min(100, intensity));

      steps.push({
        type: 'shock',
        intensity: intensity,
        duration: Math.max(300, stepDuration),
        delay: 0
      });

      // Add pause between steps (except last)
      if (i < numSteps - 1) {
        steps.push({
          type: 'pause',
          duration: 100
        });
      }
    }

    const pattern = {
      name: `${curveType.charAt(0).toUpperCase() + curveType.slice(1)} Curve`,
      description: `Generated pattern using ${curveType} curve`,
      steps: steps,
      loop: false,
      loopCount: 1
    };

    pattern.totalDuration = this.calculateTotalDuration(pattern);

    return pattern;
  }

  /**
   * Export a pattern as JSON
   * @param {string} id - Pattern ID
   * @returns {string} JSON string
   */
  exportPattern(id) {
    const pattern = this.patterns.get(id);
    if (!pattern) {
      throw new Error(`Pattern with ID ${id} not found`);
    }

    // Create export object without preset flag
    const exportData = {
      name: pattern.name,
      description: pattern.description,
      steps: pattern.steps,
      loop: pattern.loop,
      loopCount: pattern.loopCount,
      totalDuration: pattern.totalDuration,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Import a pattern from JSON
   * @param {string} json - JSON string
   * @returns {Object} Imported pattern
   */
  importPattern(json) {
    try {
      const data = JSON.parse(json);

      // Create pattern object
      const pattern = {
        name: data.name,
        description: data.description,
        steps: data.steps,
        loop: data.loop || false,
        loopCount: data.loopCount || 1
      };

      // Add the pattern (this will validate and generate ID)
      return this.addPattern(pattern);
    } catch (error) {
      this.logger.error(`[PatternEngine] Error importing pattern: ${error.message}`);
      throw new Error(`Failed to import pattern: ${error.message}`);
    }
  }

  /**
   * Get execution status
   * @param {string} executionId - Execution ID
   * @returns {Object|null} Execution status or null
   */
  getExecutionStatus(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      return null;
    }

    return {
      id: execution.id,
      patternId: execution.patternId,
      deviceId: execution.deviceId,
      status: execution.status,
      currentLoop: execution.currentLoop,
      startTime: execution.startTime,
      endTime: execution.endTime,
      duration: execution.endTime
        ? execution.endTime - execution.startTime
        : Date.now() - execution.startTime
    };
  }

  /**
   * Get all active executions
   * @returns {Array} Array of active executions
   */
  getActiveExecutions() {
    return Array.from(this.executions.values())
      .filter(e => e.status === 'running')
      .map(e => this.getExecutionStatus(e.id));
  }

  /**
   * Stop all active executions
   * @returns {number} Number of executions stopped
   */
  stopAllExecutions() {
    const activeExecutions = this.getActiveExecutions();
    let stoppedCount = 0;

    activeExecutions.forEach(exec => {
      try {
        this.stopPattern(exec.id);
        stoppedCount++;
      } catch (error) {
        this.logger.error(`[PatternEngine] Error stopping execution ${exec.id}: ${error.message}`);
      }
    });

    this.logger.info(`[PatternEngine] Stopped ${stoppedCount} active executions`);
    return stoppedCount;
  }

  /**
   * Clean up old completed executions
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   */
  cleanupExecutions(maxAge = 3600000) {
    const now = Date.now();
    let cleanedCount = 0;

    this.executions.forEach((execution, id) => {
      if (execution.status !== 'running' && execution.endTime) {
        if (now - execution.endTime > maxAge) {
          this.executions.delete(id);
          cleanedCount++;
        }
      }
    });

    if (cleanedCount > 0) {
      this.logger.info(`[PatternEngine] Cleaned up ${cleanedCount} old executions`);
    }
  }
}

module.exports = PatternEngine;
