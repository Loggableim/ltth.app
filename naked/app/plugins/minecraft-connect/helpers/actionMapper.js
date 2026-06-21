/**
 * Action Mapper
 * 
 * Maps TikTok events to Minecraft actions with dynamic parameter substitution
 */

class ActionMapper {
    constructor(logger) {
        this.logger = logger;
        this.mappings = [];
    }

    /**
     * Load mappings from config
     */
    loadMappings(mappings) {
        this.mappings = mappings || [];
        this.logger.info(`Loaded ${this.mappings.length} action mappings`);
    }

    /**
     * Process TikTok event and return matched actions
     */
    processEvent(eventType, eventData) {
        const matchedActions = [];

        for (const mapping of this.mappings) {
            if (!mapping.enabled) {
                continue;
            }

            // Check if event type matches
            if (mapping.trigger !== eventType) {
                continue;
            }

            // Check conditions
            if (mapping.conditions && !this.checkConditions(mapping.conditions, eventData)) {
                continue;
            }

            // Create action with substituted parameters
            const action = {
                action: mapping.action,
                params: this.substituteParameters(mapping.params, eventData),
                mapping: mapping
            };

            matchedActions.push(action);
        }

        return matchedActions;
    }

    /**
     * Check if conditions are met
     */
    checkConditions(conditions, eventData) {
        for (const condition of conditions) {
            const value = this.getNestedValue(eventData, condition.field);
            
            switch (condition.operator) {
                case 'equals':
                    if (value !== condition.value) return false;
                    break;
                
                case 'not_equals':
                    if (value === condition.value) return false;
                    break;
                
                case 'greater_than':
                    if (!(value > condition.value)) return false;
                    break;
                
                case 'less_than':
                    if (!(value < condition.value)) return false;
                    break;
                
                case 'greater_or_equal':
                    if (!(value >= condition.value)) return false;
                    break;
                
                case 'less_or_equal':
                    if (!(value <= condition.value)) return false;
                    break;
                
                case 'contains':
                    if (!String(value).includes(condition.value)) return false;
                    break;
                
                case 'not_contains':
                    if (String(value).includes(condition.value)) return false;
                    break;
                
                case 'starts_with':
                    if (!String(value).startsWith(condition.value)) return false;
                    break;
                
                case 'ends_with':
                    if (!String(value).endsWith(condition.value)) return false;
                    break;
                
                default:
                    this.logger.warn(`Unknown condition operator: ${condition.operator}`);
                    return false;
            }
        }

        return true;
    }

    /**
     * Substitute parameters with event data
     */
    substituteParameters(params, eventData) {
        if (!params) return {};

        const substituted = {};

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                substituted[key] = this.substituteString(value, eventData);
            } else if (Array.isArray(value)) {
                substituted[key] = value.map(v => 
                    typeof v === 'string' ? this.substituteString(v, eventData) : v
                );
            } else if (typeof value === 'object' && value !== null) {
                substituted[key] = this.substituteParameters(value, eventData);
            } else {
                substituted[key] = value;
            }
        }

        return substituted;
    }

    /**
     * Substitute placeholders in a string
     */
    substituteString(str, eventData) {
        if (!str || typeof str !== 'string') {
            return str;
        }

        // Replace {field} placeholders
        return str.replace(/\{([^}]+)\}/g, (match, field) => {
            const value = this.getNestedValue(eventData, field);
            return value !== undefined ? value : match;
        });
    }

    /**
     * Get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
        if (!obj || !path) return undefined;

        const keys = path.split('.');
        let value = obj;

        for (const key of keys) {
            if (value === undefined || value === null) {
                return undefined;
            }
            value = value[key];
        }

        return value;
    }

    /**
     * Add mapping
     */
    addMapping(mapping) {
        this.mappings.push({
            id: this.generateId(),
            enabled: true,
            ...mapping
        });
        this.logger.info(`Added action mapping: ${mapping.trigger} -> ${mapping.action}`);
    }

    /**
     * Update mapping
     */
    updateMapping(id, updates) {
        const index = this.mappings.findIndex(m => m.id === id);
        if (index === -1) {
            throw new Error(`Mapping not found: ${id}`);
        }

        this.mappings[index] = {
            ...this.mappings[index],
            ...updates
        };
        
        this.logger.info(`Updated action mapping: ${id}`);
    }

    /**
     * Remove mapping
     */
    removeMapping(id) {
        const index = this.mappings.findIndex(m => m.id === id);
        if (index === -1) {
            throw new Error(`Mapping not found: ${id}`);
        }

        this.mappings.splice(index, 1);
        this.logger.info(`Removed action mapping: ${id}`);
    }

    /**
     * Get all mappings
     */
    getMappings() {
        return this.mappings;
    }

    /**
     * Generate unique ID
     */
    generateId() {
        return `mapping_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

module.exports = ActionMapper;
