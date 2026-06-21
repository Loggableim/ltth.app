# IFTTT Plugin Integration Guide

This guide explains how plugins can register triggers, conditions, and actions for the visual flow editor.

## Overview

The IFTTT (If-This-Then-That) system provides a visual flow editor where users can create automation rules by combining:
- **Triggers**: Events that start a flow (e.g., "Gift Received", "Chat Message")
- **Conditions**: Logic that determines if a flow should continue (e.g., "Gift value > 100")
- **Actions**: Operations to perform (e.g., "Show Alert", "Play Sound", "Update Goal")

Plugins can extend the flow editor by registering their own triggers, conditions, and actions.

## Plugin API Methods

### registerIFTTTTrigger(id, config)

Registers a trigger that can start automation flows.

**Parameters:**
- `id` (string): Unique trigger ID. If not prefixed, plugin ID will be added automatically (e.g., `'my_trigger'` becomes `'plugin-id:my_trigger'`)
- `config` (object): Trigger configuration

**Config Structure:**
```javascript
{
    name: 'Human-readable name',
    description: 'Description of what triggers this event',
    category: 'category-name', // Optional, defaults to plugin ID
    icon: 'icon-name', // Icon identifier (see Icon List below)
    fields: [
        // Fields that appear in the event data
        { name: 'fieldName', label: 'Field Label', type: 'text|number|boolean' }
    ]
}
```

**Example:**
```javascript
this.api.registerIFTTTTrigger('goal_reached', {
    name: 'Goal Reached',
    description: 'Triggered when a goal reaches its target',
    category: 'goals',
    icon: 'target',
    fields: [
        { name: 'goalId', label: 'Goal ID', type: 'number' },
        { name: 'goalName', label: 'Goal Name', type: 'text' },
        { name: 'targetValue', label: 'Target Value', type: 'number' }
    ]
});

// Later, to trigger this event:
this.api.emit('ifttt:trigger', {
    type: 'goals:goal_reached',
    data: {
        goalId: 1,
        goalName: 'Follower Goal',
        targetValue: 1000
    }
});
```

### registerIFTTTCondition(id, config)

Registers a condition that can filter flow execution.

**Parameters:**
- `id` (string): Unique condition ID
- `config` (object): Condition configuration

**Config Structure:**
```javascript
{
    name: 'Condition Name',
    description: 'What this condition checks',
    category: 'category-name', // Optional
    icon: 'icon-name',
    valueType: 'text|number|boolean|dynamic',
    operators: ['equals', 'greater_than', 'contains', ...], // Which operators to allow
    evaluator: async (condition, context) => {
        // Return true if condition is met, false otherwise
        // condition = { type, operator, value, ... }
        // context = { data: eventData, state: systemState, ... }
        return true;
    }
}
```

**Example:**
```javascript
this.api.registerIFTTTCondition('goal_progress', {
    name: 'Goal Progress',
    description: 'Check goal completion percentage',
    category: 'goals',
    icon: 'trending-up',
    valueType: 'number',
    operators: ['equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'],
    evaluator: async (condition, context) => {
        const goalId = condition.goalId;
        const goal = this.db.getGoal(goalId);
        if (!goal) return false;
        
        const percentage = (goal.current / goal.target) * 100;
        
        switch (condition.operator) {
            case 'greater_than':
                return percentage > condition.value;
            case 'less_than':
                return percentage < condition.value;
            // ... handle other operators
            default:
                return false;
        }
    }
});
```

### registerIFTTTAction(id, config)

Registers an action that can be performed in flows.

**Parameters:**
- `id` (string): Unique action ID
- `config` (object): Action configuration

**Config Structure:**
```javascript
{
    name: 'Action Name',
    description: 'What this action does',
    category: 'category-name', // Optional
    icon: 'icon-name',
    fields: [
        // Input fields for the action
        {
            name: 'fieldName',
            label: 'Field Label',
            type: 'text|number|textarea|select|checkbox|range|file|color',
            required: true|false,
            default: 'default value',
            min: 0, // for number/range
            max: 100, // for number/range
            step: 1, // for range
            options: ['option1', 'option2'], // for select
            placeholder: 'placeholder text'
        }
    ],
    executor: async (action, context, services) => {
        // action = { type, ...field values }
        // context = { data: eventData, flowId, flowName, ... }
        // services = { logger, io, db, templateEngine, ... }
        
        // Perform the action
        services.logger?.info('Action executed');
        
        // Return result (optional)
        return { success: true, result: 'result data' };
    }
}
```

**Example:**
```javascript
this.api.registerIFTTTAction('goals:increment', {
    name: 'Increment Goal',
    description: 'Increment a goal by a specified amount',
    category: 'goals',
    icon: 'plus',
    fields: [
        {
            name: 'goalId',
            label: 'Goal ID',
            type: 'number',
            required: true,
            min: 1
        },
        {
            name: 'amount',
            label: 'Amount',
            type: 'number',
            default: 1,
            min: 0
        }
    ],
    executor: async (action, context, services) => {
        const goalId = parseInt(action.goalId);
        const amount = parseFloat(action.amount) || 1;
        
        if (!goalId) {
            throw new Error('Goal ID is required');
        }
        
        this.incrementGoal(goalId, amount);
        services.logger?.info(`🎯 Goals: Incremented goal ${goalId} by ${amount}`);
        
        return { success: true, goalId, amount };
    }
});
```

## Available Services in Executor

The `services` object passed to action executors contains:

- `logger`: Winston logger instance
- `io`: Socket.io instance for real-time communication
- `db`: Database instance
- `templateEngine`: Template engine for variable substitution
- `tts`: Text-to-speech service
- `alertManager`: Alert manager
- `obs`: OBS WebSocket controller
- `osc`: OSC controller (VRChat, etc.)
- `pluginLoader`: Plugin loader (access other plugins)
- `iftttEngine`: IFTTT engine (trigger other flows)
- `variables`: IFTTT variable store
- `axios`: HTTP client for webhooks
- `fs`: File system (for safe file operations)
- `path`: Path utilities
- `safeDir`: Safe directory for file writes

## Icon Reference

Common icons available:
- `gift`, `message-circle`, `user-plus`, `share-2`, `heart`, `log-in`, `star`, `users`
- `wifi`, `wifi-off`, `alert-triangle`, `clock`, `timer`, `calendar`, `hand`
- `globe`, `puzzle`, `target`, `trending-up`, `mic`, `bell`, `volume-2`
- `image`, `type`, `cloud-rain`, `send`, `database`, `plus`, `video`
- `radio`, `file-text`, `save`, `zap`, `git-branch`, `rotate-ccw`, `toggle-right`

## Best Practices

1. **Check IFTTT Engine Availability**: Always check if the IFTTT engine is available before registering:
   ```javascript
   if (this.api.iftttEngine) {
       this.registerIFTTTActions();
   }
   ```

2. **Use Descriptive IDs**: Use clear, namespaced IDs like `'goals:increment'` instead of generic names

3. **Provide Good Defaults**: Set sensible default values for fields to improve user experience

4. **Validate Inputs**: Always validate input in your executor before performing actions

5. **Use Template Variables**: Support template variables in text fields using `services.templateEngine.render()`

6. **Handle Errors Gracefully**: Throw descriptive errors for validation failures

7. **Log Actions**: Use `services.logger` to log action execution for debugging

8. **Return Results**: Return meaningful results from executors for debugging and testing

## Field Types

- `text`: Single-line text input
- `textarea`: Multi-line text input
- `number`: Numeric input with optional min/max
- `range`: Slider input with min/max/step
- `select`: Dropdown menu (requires `options` array)
- `checkbox`: Boolean checkbox
- `file`: File picker (specify `accept` for file types)
- `color`: Color picker

## Category Best Practices

Categories are used to group components in the UI. Common categories:
- `tiktok`: TikTok-specific events
- `system`: System events (connection, errors)
- `timer`: Time-based triggers
- `tts`: Text-to-speech
- `alert`: Alerts and notifications
- `overlay`: Overlay effects
- `audio`: Audio/sound
- Plugin-specific: Use your plugin ID as category (e.g., `'goals'`, `'leaderboard'`)

## Example: Complete Plugin Integration

```javascript
class MyPlugin {
    constructor(api) {
        this.api = api;
    }

    async init() {
        // ... other initialization ...
        
        // Register IFTTT components if engine is available
        if (this.api.iftttEngine) {
            this.registerIFTTTComponents();
        }
    }

    registerIFTTTComponents() {
        // Register trigger
        this.api.registerIFTTTTrigger('custom_event', {
            name: 'Custom Event',
            description: 'Triggered when something happens',
            icon: 'zap',
            fields: [
                { name: 'value', label: 'Value', type: 'number' }
            ]
        });

        // Register action
        this.api.registerIFTTTAction('custom_action', {
            name: 'Custom Action',
            description: 'Performs a custom action',
            icon: 'play',
            fields: [
                { name: 'message', label: 'Message', type: 'text', required: true }
            ],
            executor: async (action, context, services) => {
                const message = services.templateEngine.render(action.message, context.data);
                services.logger?.info(`Custom action: ${message}`);
                this.doSomething(message);
                return { success: true };
            }
        });
    }

    doSomething(message) {
        // ... your logic ...
        
        // Trigger the custom event
        this.api.emit('ifttt:trigger', {
            type: 'my-plugin:custom_event',
            data: { value: 42 }
        });
    }
}
```

## Migration from Legacy Flow Actions

If you have existing `registerFlowAction()` registrations, you can keep them for backward compatibility and add IFTTT actions alongside:

```javascript
// Legacy (still works)
this.api.registerFlowAction('old_action', async (params) => {
    return { success: true };
});

// New IFTTT action (for visual editor)
this.api.registerIFTTTAction('new_action', {
    name: 'New Action',
    // ... config ...
    executor: async (action, context, services) => {
        // Implementation
    }
});
```

The visual flow editor will only show IFTTT actions, but legacy actions will continue to work in existing flows.
