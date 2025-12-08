/**
 * IFTTT Engine
 * Core automation engine that processes triggers, conditions, and actions
 */

const TriggerRegistry = require('./trigger-registry');
const ConditionRegistry = require('./condition-registry');
const ActionRegistry = require('./action-registry');
const VariableStore = require('./variable-store');
const templateEngine = require('../template-engine');

class IFTTTEngine {
    constructor(db, logger, services = {}) {
        this.db = db;
        this.logger = logger;
        this.services = services;

        // Initialize registries
        this.triggers = new TriggerRegistry(logger);
        this.conditions = new ConditionRegistry(logger);
        this.actions = new ActionRegistry(logger);
        this.variables = new VariableStore(logger);

        // Execution tracking
        this.executionQueue = [];
        this.isProcessing = false;
        this.executionHistory = [];
        this.maxExecutionHistory = 100;

        // Flow execution stats
        this.stats = {
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0,
            averageExecutionTime: 0
        };

        // Scheduler for timer-based triggers
        this.schedulers = new Map();
        this.webhooks = new Map();

        // Deadlock prevention
        this.maxExecutionDepth = 10;
        this.executionStack = [];

        this.logger?.info('✅ IFTTT Engine initialized');
    }

    /**
     * Process an event through the IFTTT system
     */
    async processEvent(eventType, eventData = {}) {
        try {
            // Check if flows are globally enabled
            const flowsEnabled = this.db.getSetting('flows_enabled');
            if (flowsEnabled === 'false') {
                this.logger?.debug(`⏭️ Flows globally disabled, skipping ${eventType}`);
                return;
            }

            // Add event to history
            this.variables.addEvent({
                type: eventType,
                data: eventData
            });

            // Get all enabled flows
            const flows = this.db.getEnabledFlows();

            // Find matching flows
            const matchingFlows = flows.filter(flow => {
                // Legacy trigger type mapping
                const triggerType = this.mapLegacyTriggerType(flow.trigger_type);
                return triggerType === eventType;
            });

            if (matchingFlows.length === 0) {
                this.logger?.debug(`No flows registered for event: ${eventType}`);
                return;
            }

            this.logger?.info(`📡 Processing ${eventType} event, ${matchingFlows.length} matching flow(s)`);

            // Emit debug event to frontend
            if (this.services.io) {
                this.services.io.emit('ifttt:debug', {
                    type: 'event_received',
                    eventType,
                    eventData,
                    matchingFlows: matchingFlows.length,
                    timestamp: Date.now()
                });
            }

            // Execute matching flows in parallel (with depth limit)
            const executions = matchingFlows.map(flow => 
                this.executeFlow(flow, eventData)
            );

            await Promise.allSettled(executions);

        } catch (error) {
            this.logger?.error('❌ Event processing error:', error);
            
            // Emit error to frontend
            if (this.services.io) {
                this.services.io.emit('ifttt:debug', {
                    type: 'error',
                    error: error.message,
                    eventType,
                    timestamp: Date.now()
                });
            }
        }
    }

    /**
     * Execute a single flow
     */
    async executeFlow(flow, eventData = {}) {
        const startTime = Date.now();
        const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Prevent infinite recursion
            if (this.executionStack.length >= this.maxExecutionDepth) {
                this.logger?.warn(`⚠️ Max execution depth reached for flow: ${flow.name}`);
                return;
            }

            this.executionStack.push(flow.id);

            this.logger?.info(`⚡ Executing flow: "${flow.name}" (ID: ${flow.id})`);
            
            // Emit flow start debug event
            if (this.services.io) {
                this.services.io.emit('ifttt:debug', {
                    type: 'flow_started',
                    executionId,
                    flowId: flow.id,
                    flowName: flow.name,
                    eventData,
                    timestamp: startTime
                });
            }

            // Create execution context
            const context = this.variables.createContext(eventData, {
                flowId: flow.id,
                flowName: flow.name,
                executionId
            });

            // Increment execution counter for this flow
            const executionCount = this.variables.increment(`flow_${flow.id}_executions`);
            context.executionCount = executionCount;

            // Evaluate conditions
            const conditionsMet = this.evaluateConditions(flow.trigger_condition, context);

            if (!conditionsMet) {
                this.logger?.debug(`⏭️ Flow "${flow.name}" conditions not met, skipping`);
                
                // Emit condition not met event
                if (this.services.io) {
                    this.services.io.emit('ifttt:debug', {
                        type: 'flow_skipped',
                        executionId,
                        flowId: flow.id,
                        flowName: flow.name,
                        reason: 'conditions_not_met',
                        condition: flow.trigger_condition,
                        timestamp: Date.now()
                    });
                }
                
                this.executionStack.pop();
                return;
            }

            // Emit conditions met event
            if (this.services.io) {
                this.services.io.emit('ifttt:debug', {
                    type: 'conditions_met',
                    executionId,
                    flowId: flow.id,
                    flowName: flow.name,
                    timestamp: Date.now()
                });
            }

            // Execute actions
            const actionResults = [];
            for (const actionDef of flow.actions) {
                // Check if execution should stop
                if (context.stopExecution) {
                    this.logger?.info(`⏹️ Flow "${flow.name}" execution stopped`);
                    break;
                }

                // Emit action start event
                if (this.services.io) {
                    this.services.io.emit('ifttt:debug', {
                        type: 'action_started',
                        executionId,
                        flowId: flow.id,
                        flowName: flow.name,
                        actionType: actionDef.type,
                        timestamp: Date.now()
                    });
                }

                const actionStartTime = Date.now();
                const result = await this.executeAction(actionDef, context);
                const actionTime = Date.now() - actionStartTime;
                actionResults.push(result);

                // Emit action completed event
                if (this.services.io) {
                    this.services.io.emit('ifttt:debug', {
                        type: result.success ? 'action_completed' : 'action_failed',
                        executionId,
                        flowId: flow.id,
                        flowName: flow.name,
                        actionType: actionDef.type,
                        success: result.success,
                        error: result.error,
                        executionTime: actionTime,
                        timestamp: Date.now()
                    });
                }

                if (!result.success) {
                    this.logger?.warn(`⚠️ Action ${actionDef.type} failed:`, result.error);
                }
            }

            // Record execution
            const executionTime = Date.now() - startTime;
            const executionRecord = {
                executionId,
                flowId: flow.id,
                flowName: flow.name,
                success: actionResults.every(r => r.success),
                executionTime,
                actionResults,
                timestamp: startTime
            };
            
            this.recordExecution(executionRecord);

            this.logger?.info(`✅ Flow "${flow.name}" completed in ${executionTime}ms`);
            
            // Emit flow completed event
            if (this.services.io) {
                this.services.io.emit('ifttt:debug', {
                    type: 'flow_completed',
                    executionId,
                    flowId: flow.id,
                    flowName: flow.name,
                    success: executionRecord.success,
                    executionTime,
                    actionsExecuted: actionResults.length,
                    timestamp: Date.now()
                });
            }

            this.executionStack.pop();

        } catch (error) {
            this.logger?.error(`❌ Flow "${flow.name}" execution error:`, error);
            
            const executionRecord = {
                executionId,
                flowId: flow.id,
                flowName: flow.name,
                success: false,
                error: error.message,
                timestamp: startTime,
                executionTime: Date.now() - startTime
            };
            
            this.recordExecution(executionRecord);
            
            // Emit error event
            if (this.services.io) {
                this.services.io.emit('ifttt:debug', {
                    type: 'flow_error',
                    executionId,
                    flowId: flow.id,
                    flowName: flow.name,
                    error: error.message,
                    timestamp: Date.now()
                });
            }
            
            this.executionStack.pop();
        }
    }

    /**
     * Execute flow by ID
     */
    async executeFlowById(flowId, eventData = {}) {
        const flow = this.db.getFlow(flowId);
        if (!flow) {
            throw new Error(`Flow ${flowId} not found`);
        }

        if (!flow.enabled) {
            throw new Error(`Flow ${flowId} is disabled`);
        }

        return this.executeFlow(flow, eventData);
    }

    /**
     * Evaluate conditions
     */
    evaluateConditions(condition, context) {
        if (!condition) {
            return true; // No conditions = always true
        }

        // Handle complex condition trees (AND/OR/NOT)
        if (condition.logic) {
            return this.conditions.evaluateComplex(condition, context);
        }

        // Legacy condition evaluation
        return this.evaluateLegacyCondition(condition, context.data);
    }

    /**
     * Legacy condition evaluation (backward compatibility)
     */
    evaluateLegacyCondition(condition, eventData) {
        if (!condition) return true;

        const { operator, field, value } = condition;
        let fieldValue = this.variables.getNestedValue(eventData, field);

        // Special field handling
        if (field === 'superfan_level' || field === 'superFanLevel') {
            if (eventData.isSuperFan || eventData.superFan) {
                fieldValue = eventData.superFanLevel || 1;
            } else if (eventData.badges && Array.isArray(eventData.badges)) {
                const superFanBadge = eventData.badges.find(b => 
                    b.type === 'superfan' || b.name?.toLowerCase().includes('superfan')
                );
                fieldValue = superFanBadge ? (superFanBadge.level || 1) : 0;
            } else {
                fieldValue = 0;
            }
        }

        if (field === 'gift_type' || field === 'giftType') {
            fieldValue = eventData.giftName || eventData.giftType || '';
        }

        if (field === 'gift_value' || field === 'giftValue') {
            fieldValue = eventData.coins || eventData.giftValue || 0;
        }

        // Evaluate using operator
        const op = this.conditions.getOperator(operator);
        if (op) {
            return op.evaluator(fieldValue, value);
        }

        // Fallback to legacy operators
        switch (operator) {
            case '==':
            case 'equals':
                return fieldValue == value;
            case '!=':
            case 'not_equals':
                return fieldValue != value;
            case '>':
            case 'greater_than':
                return Number(fieldValue) > Number(value);
            case '<':
            case 'less_than':
                return Number(fieldValue) < Number(value);
            case '>=':
            case 'greater_or_equal':
                return Number(fieldValue) >= Number(value);
            case '<=':
            case 'less_or_equal':
                return Number(fieldValue) <= Number(value);
            case 'contains':
                return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
            case 'not_contains':
                return !String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
            case 'starts_with':
                return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
            case 'ends_with':
                return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
            default:
                this.logger?.warn(`Unknown operator: ${operator}`);
                return false;
        }
    }

    /**
     * Execute an action
     */
    async executeAction(actionDef, context) {
        try {
            // Get services for action execution
            const services = {
                ...this.services,
                templateEngine,
                variables: this.variables,
                iftttEngine: this,
                logger: this.logger,
                db: this.db
            };

            // Execute using action registry
            const result = await this.actions.execute(actionDef, context, services);
            return result;

        } catch (error) {
            this.logger?.error(`Action execution error:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Record execution
     */
    recordExecution(execution) {
        this.executionHistory.push(execution);

        // Keep only last N executions
        if (this.executionHistory.length > this.maxExecutionHistory) {
            this.executionHistory.shift();
        }

        // Update stats
        this.stats.totalExecutions++;
        if (execution.success) {
            this.stats.successfulExecutions++;
        } else {
            this.stats.failedExecutions++;
        }

        // Update average execution time
        const totalTime = this.executionHistory.reduce((sum, e) => sum + (e.executionTime || 0), 0);
        this.stats.averageExecutionTime = totalTime / this.executionHistory.length;

        // Emit execution event if Socket.io available
        if (this.services.io) {
            this.services.io.emit('ifttt:execution', execution);
        }
    }

    /**
     * Get execution history
     */
    getExecutionHistory(count = 20) {
        return this.executionHistory.slice(-count);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            variableStats: this.variables.getStats(),
            activeFlows: this.db.getEnabledFlows().length,
            totalFlows: this.db.getFlows().length,
            registeredTriggers: this.triggers.getAll().length,
            registeredConditions: this.conditions.getAll().length,
            registeredActions: this.actions.getAll().length
        };
    }

    /**
     * Map legacy trigger types to new format
     */
    mapLegacyTriggerType(triggerType) {
        const mapping = {
            'gift': 'tiktok:gift',
            'chat': 'tiktok:chat',
            'follow': 'tiktok:follow',
            'share': 'tiktok:share',
            'like': 'tiktok:like',
            'join': 'tiktok:join',
            'subscribe': 'tiktok:subscribe',
            'viewerChange': 'tiktok:viewerChange'
        };

        return mapping[triggerType] || triggerType;
    }

    /**
     * Setup timer-based triggers
     */
    setupTimerTriggers() {
        const flows = this.db.getEnabledFlows();

        flows.forEach(flow => {
            const triggerType = flow.trigger_type;

            if (triggerType === 'timer:interval') {
                this.setupIntervalTrigger(flow);
            } else if (triggerType === 'timer:countdown') {
                this.setupCountdownTrigger(flow);
            } else if (triggerType === 'timer:schedule') {
                this.setupScheduleTrigger(flow);
            }
        });
    }

    /**
     * Setup interval trigger
     */
    setupIntervalTrigger(flow) {
        const intervalSeconds = flow.trigger_condition?.intervalSeconds || 60;
        const intervalId = setInterval(() => {
            this.executeFlow(flow, {
                type: 'timer:interval',
                intervalSeconds
            });
        }, intervalSeconds * 1000);

        this.schedulers.set(`interval_${flow.id}`, intervalId);
        this.logger?.info(`⏰ Interval trigger set up for flow "${flow.name}" (${intervalSeconds}s)`);
    }

    /**
     * Setup countdown trigger
     */
    setupCountdownTrigger(flow) {
        const seconds = flow.trigger_condition?.seconds || 60;
        const timeoutId = setTimeout(() => {
            this.executeFlow(flow, {
                type: 'timer:countdown',
                seconds
            });
            this.schedulers.delete(`countdown_${flow.id}`);
        }, seconds * 1000);

        this.schedulers.set(`countdown_${flow.id}`, timeoutId);
        this.logger?.info(`⏰ Countdown trigger set up for flow "${flow.name}" (${seconds}s)`);
    }

    /**
     * Setup schedule trigger
     */
    setupScheduleTrigger(flow) {
        // Check every minute if it's time to trigger
        const intervalId = setInterval(() => {
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const currentDay = days[now.getDay()];

            const triggerTime = flow.trigger_condition?.time;
            const triggerDays = flow.trigger_condition?.days || days;

            if (currentTime === triggerTime && triggerDays.includes(currentDay)) {
                this.executeFlow(flow, {
                    type: 'timer:schedule',
                    time: currentTime,
                    day: currentDay
                });
            }
        }, 60000); // Check every minute

        this.schedulers.set(`schedule_${flow.id}`, intervalId);
        this.logger?.info(`⏰ Schedule trigger set up for flow "${flow.name}"`);
    }

    /**
     * Clear all schedulers
     */
    clearSchedulers() {
        this.schedulers.forEach((scheduler, key) => {
            clearInterval(scheduler);
            clearTimeout(scheduler);
        });
        this.schedulers.clear();
        this.logger?.info('All schedulers cleared');
    }

    /**
     * Reload timer triggers
     */
    reloadTimerTriggers() {
        this.clearSchedulers();
        this.setupTimerTriggers();
        this.logger?.info('Timer triggers reloaded');
    }

    /**
     * Get registries (for external access)
     */
    getRegistries() {
        return {
            triggers: this.triggers,
            conditions: this.conditions,
            actions: this.actions,
            variables: this.variables
        };
    }

    /**
     * Cleanup on shutdown
     */
    destroy() {
        this.clearSchedulers();
        this.logger?.info('IFTTT Engine destroyed');
    }
}

module.exports = IFTTTEngine;
