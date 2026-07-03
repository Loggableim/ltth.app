/**
 * ZappieHellManager - Manages goal-based event chains for OpenShock
 * 
 * Tracks coin-based goals and executes event chains when goals are reached.
 * Supports long-running event chains with multiple steps (OpenShock, TTS, webhooks, delays).
 */

const EventEmitter = require('events');
const axios = require('axios');

class ZappieHellManager extends EventEmitter {
  constructor(db, logger, openShockClient, patternEngine, queueManager) {
    super();
    this.db = db;
    this.logger = logger || console;
    this.openShockClient = openShockClient;
    this.patternEngine = patternEngine;
    this.queueManager = queueManager;
    
    // Goals: id -> goal object
    this.goals = new Map();
    
    // Event chains: id -> chain object
    this.eventChains = new Map();
    
    // Running executions: executionId -> execution state
    this.runningExecutions = new Map();
    
    this.logger.info('[ZappieHellManager] Initialized');
  }

  /**
   * Initialize database tables for ZappieHell
   */
  static initializeTables(db, api) {
    try {
      // Goals table
      db.exec(`
        CREATE TABLE IF NOT EXISTS zappiehell_goals (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          target_coins INTEGER NOT NULL,
          current_coins INTEGER DEFAULT 0,
          type TEXT NOT NULL DEFAULT 'stream',
          active INTEGER DEFAULT 1,
          chain_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Event chains table
      db.exec(`
        CREATE TABLE IF NOT EXISTS zappiehell_chains (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          steps TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Chain execution history
      db.exec(`
        CREATE TABLE IF NOT EXISTS zappiehell_executions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          chain_id TEXT NOT NULL,
          goal_id TEXT,
          status TEXT NOT NULL,
          started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          error_message TEXT
        )
      `);

      if (api && api.log) {
        api.log('[ZappieHellManager] Database tables initialized', 'info');
      }
    } catch (error) {
      const errorMsg = `[ZappieHellManager] Error initializing tables: ${error.message}`;
      if (api && api.log) {
        api.log(errorMsg, 'error');
      } else {
        console.error(errorMsg);
      }
      throw error;
    }
  }

  /**
   * Load goals and chains from database
   */
  loadFromDatabase() {
    try {
      // Load goals
      const goals = this.db.prepare('SELECT * FROM zappiehell_goals').all();
      for (const row of goals) {
        const goal = {
          id: row.id,
          name: row.name,
          targetCoins: row.target_coins,
          currentCoins: row.current_coins,
          type: row.type,
          active: row.active === 1,
          chainId: row.chain_id
        };
        this.goals.set(goal.id, goal);
      }

      // Load event chains
      const chains = this.db.prepare('SELECT * FROM zappiehell_chains').all();
      for (const row of chains) {
        const chain = {
          id: row.id,
          name: row.name,
          description: row.description,
          steps: JSON.parse(row.steps)
        };
        this.eventChains.set(chain.id, chain);
      }

      this.logger.info(`[ZappieHellManager] Loaded ${this.goals.size} goals and ${this.eventChains.size} chains`);
    } catch (error) {
      this.logger.error('[ZappieHellManager] Error loading from database:', error.message);
    }
  }

  /**
   * Add coins to goals and check for completion
   */
  async addCoins(coins, source = 'gift') {
    const completedGoals = [];

    for (const [id, goal] of this.goals) {
      if (!goal.active) continue;

      const oldCoins = goal.currentCoins;
      goal.currentCoins += coins;

      // Check if goal was just completed
      if (oldCoins < goal.targetCoins && goal.currentCoins >= goal.targetCoins) {
        this.logger.info(`[ZappieHellManager] Goal completed: ${goal.name} (${goal.currentCoins}/${goal.targetCoins})`);
        completedGoals.push(goal);

        // Execute event chain if configured
        if (goal.chainId) {
          const chain = this.eventChains.get(goal.chainId);
          if (chain) {
            await this.executeEventChain(chain, { goal, source });
          }
        }
      }

      // Save updated progress
      this._saveGoalToDatabase(goal);
    }

    // Emit update event
    this.emit('goals:update', {
      goals: Array.from(this.goals.values()),
      coinsAdded: coins
    });

    // Emit completion events
    for (const goal of completedGoals) {
      this.emit('goals:completed', { goal });
    }

    return completedGoals;
  }

  /**
   * Execute an event chain
   */
  async executeEventChain(chain, context = {}) {
    const executionId = this._generateExecutionId();
    
    this.logger.info(`[ZappieHellManager] Starting event chain: ${chain.name} (execution ${executionId})`);

    const execution = {
      id: executionId,
      chainId: chain.id,
      goalId: context.goal?.id,
      status: 'running',
      startedAt: Date.now(),
      currentStep: 0
    };

    this.runningExecutions.set(executionId, execution);

    // Save to database
    this.db.prepare(`
      INSERT INTO zappiehell_executions (chain_id, goal_id, status)
      VALUES (?, ?, ?)
    `).run(chain.id, context.goal?.id || null, 'running');

    try {
      // Execute steps sequentially
      for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];
        execution.currentStep = i;

        this.logger.info(`[ZappieHellManager] Executing step ${i + 1}/${chain.steps.length}: ${step.type}`);

        await this._executeStep(step, context);
      }

      execution.status = 'completed';
      execution.completedAt = Date.now();

      this.logger.info(`[ZappieHellManager] Event chain completed: ${chain.name}`);

      // Update database
      this.db.prepare(`
        UPDATE zappiehell_executions
        SET status = 'completed', completed_at = CURRENT_TIMESTAMP
        WHERE chain_id = ? AND started_at >= datetime('now', '-1 hour')
        ORDER BY started_at DESC
        LIMIT 1
      `).run(chain.id);

    } catch (error) {
      execution.status = 'failed';
      execution.error = error.message;

      this.logger.error(`[ZappieHellManager] Event chain failed: ${error.message}`);

      // Update database
      this.db.prepare(`
        UPDATE zappiehell_executions
        SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
        WHERE chain_id = ? AND started_at >= datetime('now', '-1 hour')
        ORDER BY started_at DESC
        LIMIT 1
      `).run(error.message, chain.id);
    } finally {
      this.runningExecutions.delete(executionId);
    }

    return execution;
  }

  /**
   * Execute a single step in an event chain
   */
  async _executeStep(step, context) {
    switch (step.type) {
      case 'openshock':
        await this._executeOpenShockStep(step);
        break;

      case 'delay':
        await this._executeDelayStep(step);
        break;

      case 'audio':
      case 'tts':
        await this._executeAudioStep(step);
        break;

      case 'webhook':
        await this._executeWebhookStep(step, context);
        break;

      case 'overlay':
        await this._executeOverlayStep(step);
        break;

      default:
        this.logger.warn(`[ZappieHellManager] Unknown step type: ${step.type}`);
    }
  }

  /**
   * Execute OpenShock step
   */
  async _executeOpenShockStep(step) {
    if (step.patternId) {
      // Execute pattern
      const pattern = this.patternEngine.getPattern(step.patternId);
      if (!pattern) {
        throw new Error(`Pattern not found: ${step.patternId}`);
      }

      // Queue pattern execution
      await this.queueManager.enqueuePattern(
        pattern,
        step.deviceId || null,
        step.intensity || 50,
        step.durationMs || 1000,
        { source: 'zappiehell' }
      );
    } else {
      // Execute direct command
      await this.queueManager.enqueue({
        deviceId: step.deviceId,
        commandType: step.commandType || 'vibrate',
        intensity: step.intensity || 50,
        duration: step.durationMs || 1000,
        source: 'zappiehell'
      });
    }
  }

  /**
   * Execute delay step
   */
  async _executeDelayStep(step) {
    const duration = step.durationMs || 1000;
    this.logger.info(`[ZappieHellManager] Waiting ${duration}ms`);
    return new Promise(resolve => setTimeout(resolve, duration));
  }

  /**
   * Execute audio/TTS step
   */
  async _executeAudioStep(step) {
    // Emit socket event for TTS/audio playback
    this.emit('audio:play', {
      audioId: step.audioId,
      text: step.text,
      voice: step.voice
    });
  }

  /**
   * Execute webhook step
   */
  async _executeWebhookStep(step, context) {
    const url = step.url;
    const method = (step.method || 'POST').toUpperCase();
    const body = step.body || {};

    // Add context data to body
    const requestBody = {
      ...body,
      context: {
        goal: context.goal ? {
          id: context.goal.id,
          name: context.goal.name,
          targetCoins: context.goal.targetCoins,
          currentCoins: context.goal.currentCoins
        } : null,
        source: context.source
      }
    };

    try {
      if (method === 'GET') {
        await axios.get(url, { params: requestBody });
      } else {
        await axios.post(url, requestBody);
      }
      this.logger.info(`[ZappieHellManager] Webhook ${method} to ${url} succeeded`);
    } catch (error) {
      this.logger.error(`[ZappieHellManager] Webhook ${method} to ${url} failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute overlay step
   */
  async _executeOverlayStep(step) {
    // Emit socket event for overlay animation
    this.emit('overlay:animate', {
      animationType: step.animationType,
      duration: step.duration,
      data: step.data
    });
  }

  /**
   * Create a new goal
   */
  addGoal(goal) {
    if (!goal.id) {
      goal.id = this._generateId();
    }

    const fullGoal = {
      id: goal.id,
      name: goal.name,
      targetCoins: goal.targetCoins,
      currentCoins: goal.currentCoins || 0,
      type: goal.type || 'stream',
      active: goal.active !== undefined ? goal.active : true,
      chainId: goal.chainId || null
    };

    this.goals.set(fullGoal.id, fullGoal);
    this._saveGoalToDatabase(fullGoal);

    this.logger.info(`[ZappieHellManager] Added goal: ${fullGoal.name}`);
    return fullGoal;
  }

  /**
   * Update a goal
   */
  updateGoal(id, updates) {
    const goal = this.goals.get(id);
    if (!goal) {
      throw new Error(`Goal not found: ${id}`);
    }

    Object.assign(goal, updates);
    this._saveGoalToDatabase(goal);

    this.logger.info(`[ZappieHellManager] Updated goal: ${goal.name}`);
    return goal;
  }

  /**
   * Delete a goal
   */
  deleteGoal(id) {
    this.goals.delete(id);
    this.db.prepare('DELETE FROM zappiehell_goals WHERE id = ?').run(id);
    this.logger.info(`[ZappieHellManager] Deleted goal: ${id}`);
  }

  /**
   * Reset goal progress
   */
  resetGoal(id) {
    const goal = this.goals.get(id);
    if (goal) {
      goal.currentCoins = 0;
      this._saveGoalToDatabase(goal);
      this.logger.info(`[ZappieHellManager] Reset goal: ${goal.name}`);
    }
  }

  /**
   * Reset all stream-type goals (called when stream ends)
   */
  resetStreamGoals() {
    for (const [id, goal] of this.goals) {
      if (goal.type === 'stream') {
        goal.currentCoins = 0;
        this._saveGoalToDatabase(goal);
      }
    }
    this.logger.info('[ZappieHellManager] Reset all stream goals');
  }

  /**
   * Add event chain
   */
  addEventChain(chain) {
    if (!chain.id) {
      chain.id = this._generateId();
    }

    const fullChain = {
      id: chain.id,
      name: chain.name,
      description: chain.description || '',
      steps: chain.steps || []
    };

    this.eventChains.set(fullChain.id, fullChain);
    this._saveEventChainToDatabase(fullChain);

    this.logger.info(`[ZappieHellManager] Added event chain: ${fullChain.name}`);
    return fullChain;
  }

  /**
   * Update event chain
   */
  updateEventChain(id, updates) {
    const chain = this.eventChains.get(id);
    if (!chain) {
      throw new Error(`Event chain not found: ${id}`);
    }

    Object.assign(chain, updates);
    this._saveEventChainToDatabase(chain);

    this.logger.info(`[ZappieHellManager] Updated event chain: ${chain.name}`);
    return chain;
  }

  /**
   * Delete event chain
   */
  deleteEventChain(id) {
    this.eventChains.delete(id);
    this.db.prepare('DELETE FROM zappiehell_chains WHERE id = ?').run(id);
    this.logger.info(`[ZappieHellManager] Deleted event chain: ${id}`);
  }

  /**
   * Get all goals
   */
  getAllGoals() {
    return Array.from(this.goals.values());
  }

  /**
   * Get all event chains
   */
  getAllEventChains() {
    return Array.from(this.eventChains.values());
  }

  /**
   * Get active goals
   */
  getActiveGoals() {
    return Array.from(this.goals.values()).filter(g => g.active);
  }

  /**
   * Save goal to database
   */
  _saveGoalToDatabase(goal) {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO zappiehell_goals
        (id, name, target_coins, current_coins, type, active, chain_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        goal.id,
        goal.name,
        goal.targetCoins,
        goal.currentCoins,
        goal.type,
        goal.active ? 1 : 0,
        goal.chainId
      );
    } catch (error) {
      this.logger.error(`[ZappieHellManager] Error saving goal to database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save event chain to database
   */
  _saveEventChainToDatabase(chain) {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO zappiehell_chains
        (id, name, description, steps, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        chain.id,
        chain.name,
        chain.description,
        JSON.stringify(chain.steps)
      );
    } catch (error) {
      this.logger.error(`[ZappieHellManager] Error saving event chain to database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate unique ID
   */
  _generateId() {
    return `zh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate execution ID
   */
  _generateExecutionId() {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = ZappieHellManager;
