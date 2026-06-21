# OpenShock Queue API - Integration Guide

## Overview

The OpenShock plugin provides a **central queue system** that allows other plugins to trigger OpenShock commands (shocks, vibrations, sounds) through a unified interface. All commands are queued and executed sequentially with proper timing and safety checks.

## Why Use the Queue?

- **Prevents command collisions**: Multiple triggers won't interrupt each other
- **Guaranteed execution order**: FIFO queue with priority support
- **Built-in safety**: Automatic intensity/duration limits and cooldowns
- **Real-time monitoring**: Live queue UI at `/openshock/queue`
- **Event tracking**: Complete history and statistics

## Public API Method

### `addToQueue(source, triggerData)`

Add a shock/vibration/sound command to the OpenShock queue from any plugin.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | Your plugin ID or source name (e.g., 'goals', 'game-engine', 'custom-plugin') |
| `triggerData` | object | Yes | Shock parameters (see below) |

**triggerData Object:**

```javascript
{
  deviceId: string,          // Required: OpenShock device ID
  commandType: string,       // Optional: 'shock', 'vibrate', or 'sound' (default: 'vibrate')
  intensity: number,         // Optional: 0-100 (default: 50)
  duration: number,          // Optional: milliseconds (default: 1000)
  priority: number,          // Optional: 1-10, where 10 = highest (default: 5)
  userId: string            // Optional: User ID who triggered (default: 'external-plugin')
}
```

**Returns:** `Promise<Object>`

```javascript
{
  success: boolean,    // Whether command was added to queue
  queueId: string,     // Unique queue item ID (null if failed)
  position: number,    // Position in queue (-1 if failed)
  message: string      // Success or error message
}
```

## Integration Examples

### Example 1: Goals Plugin - Shock on Goal Completion

When a viewer goal is reached, trigger a celebration shock:

```javascript
// In plugins/goals/main.js or your plugin's goal handler

async handleGoalReached(goalData) {
  try {
    // Get OpenShock plugin instance
    const pluginLoader = this.api.pluginLoader || this.api.getApp().locals.pluginLoader;
    const openshockPlugin = pluginLoader.getPluginInstance('openshock');
    
    if (!openshockPlugin) {
      this.api.log('OpenShock plugin not found or not enabled', 'warn');
      return;
    }

    // Get device ID from your config
    const deviceId = this.config.openshockDeviceId || 'your-device-id';

    // Add to queue
    const result = await openshockPlugin.addToQueue('goals', {
      deviceId: deviceId,
      commandType: 'vibrate',
      intensity: 75,
      duration: 3000,
      priority: 8,  // High priority for goal completion
      userId: goalData.userId || 'goal-system'
    });

    if (result.success) {
      this.api.log(`Goal shock queued at position ${result.position}`, 'info');
    } else {
      this.api.log(`Failed to queue shock: ${result.message}`, 'error');
    }

  } catch (error) {
    this.api.log(`Error triggering OpenShock: ${error.message}`, 'error');
  }
}
```

### Example 2: Game Engine - Progressive Intensity

Trigger shocks with increasing intensity based on game difficulty:

```javascript
// In plugins/game-engine/main.js

async triggerGamePenalty(level) {
  const pluginLoader = this.api.pluginLoader;
  const openshockPlugin = pluginLoader.getPluginInstance('openshock');
  
  if (!openshockPlugin) return;

  // Calculate intensity based on level (10-80%)
  const intensity = Math.min(10 + (level * 10), 80);
  const duration = 1000 + (level * 500); // 1-4 seconds

  const result = await openshockPlugin.addToQueue('game-engine', {
    deviceId: this.config.openshockDeviceId,
    commandType: 'shock',
    intensity: intensity,
    duration: duration,
    priority: 6,
    userId: 'game-system'
  });

  console.log(`Game penalty queued: intensity=${intensity}%, duration=${duration}ms`);
}
```

### Example 3: Custom Plugin - Multiple Devices

Trigger multiple devices in sequence:

```javascript
// In your custom plugin

async triggerMultiDeviceEffect() {
  const pluginLoader = this.api.pluginLoader;
  const openshockPlugin = pluginLoader.getPluginInstance('openshock');
  
  if (!openshockPlugin) return;

  // Queue commands for multiple devices
  const devices = ['device-1', 'device-2', 'device-3'];
  
  for (let i = 0; i < devices.length; i++) {
    await openshockPlugin.addToQueue('my-plugin', {
      deviceId: devices[i],
      commandType: 'vibrate',
      intensity: 50,
      duration: 2000,
      priority: 5
    });
  }

  this.api.log('Multi-device effect queued', 'info');
}
```

### Example 4: TikTok Event Handler - Gift-Based Triggers

Trigger different effects based on gift values:

```javascript
// In your plugin that handles TikTok events

async init() {
  // Register TikTok gift event
  this.api.registerTikTokEvent('gift', async (data) => {
    await this.handleGift(data);
  });
}

async handleGift(giftData) {
  const pluginLoader = this.api.pluginLoader;
  const openshockPlugin = pluginLoader.getPluginInstance('openshock');
  
  if (!openshockPlugin) return;

  // Different effects based on gift value
  let commandType, intensity, duration;
  
  if (giftData.diamondCount >= 100) {
    // Big gift = shock
    commandType = 'shock';
    intensity = 60;
    duration = 2000;
  } else if (giftData.diamondCount >= 50) {
    // Medium gift = strong vibrate
    commandType = 'vibrate';
    intensity = 70;
    duration = 1500;
  } else {
    // Small gift = light vibrate
    commandType = 'vibrate';
    intensity = 40;
    duration = 1000;
  }

  await openshockPlugin.addToQueue('gift-handler', {
    deviceId: this.config.openshockDeviceId,
    commandType: commandType,
    intensity: intensity,
    duration: duration,
    priority: 5,
    userId: giftData.userId
  });
}
```

## Best Practices

### 1. Check if Plugin is Available

Always check if the OpenShock plugin is loaded before calling it:

```javascript
const pluginLoader = this.api.pluginLoader;
const openshockPlugin = pluginLoader ? pluginLoader.getPluginInstance('openshock') : null;

if (!openshockPlugin) {
  this.api.log('OpenShock plugin not available', 'warn');
  return;
}
```

### 2. Handle Errors Gracefully

Wrap calls in try-catch blocks:

```javascript
try {
  const result = await openshockPlugin.addToQueue('my-plugin', {...});
  
  if (!result.success) {
    this.api.log(`Queue failed: ${result.message}`, 'error');
  }
} catch (error) {
  this.api.log(`Exception: ${error.message}`, 'error');
}
```

### 3. Use Appropriate Priorities

- **Priority 1-3**: Low priority, background effects
- **Priority 4-6**: Normal priority, regular triggers
- **Priority 7-9**: High priority, important events
- **Priority 10**: Critical priority, emergency/special events

### 4. Validate Device IDs

Store device IDs in your plugin's config and validate before use:

```javascript
async init() {
  // Load config
  let config = this.api.getConfig('myPluginConfig');
  
  if (!config || !config.openshockDeviceId) {
    this.api.log('OpenShock device ID not configured', 'warn');
    // Set default or prompt user
  }
  
  this.config = config;
}
```

### 5. Log All Triggers

Always log when you trigger OpenShock for debugging:

```javascript
this.api.log(`OpenShock triggered: ${commandType} at ${intensity}% for ${duration}ms`, 'info');
```

## Queue UI

The queue can be monitored in real-time at:

**URL**: `http://localhost:3000/openshock/queue`

Features:
- Live queue status
- Currently processing command
- All pending commands
- Queue statistics
- Clear queue button

## Safety Features

The OpenShock plugin has built-in safety features that apply to all queue items:

- **Intensity limits**: Global max intensity (default: 80%)
- **Duration limits**: Global max duration (default: 5000ms)
- **Cooldowns**: Global, per-device, and per-user cooldowns
- **Emergency stop**: Can be activated to immediately stop all commands
- **Command rate limiting**: Max commands per minute

These limits are automatically enforced by the queue manager.

## Accessing Plugin Loader

There are multiple ways to access the plugin loader from your plugin:

### Method 1: Via api.pluginLoader (if available)

```javascript
const pluginLoader = this.api.pluginLoader;
```

### Method 2: Via Express app (fallback)

```javascript
const app = this.api.getApp();
const pluginLoader = app.locals.pluginLoader;
```

### Method 3: Store reference during init

```javascript
// In your plugin's init()
async init() {
  // Get plugin loader and store reference
  this.pluginLoader = this.api.pluginLoader || this.api.getApp().locals.pluginLoader;
}

// Later in your code
async someMethod() {
  const openshockPlugin = this.pluginLoader.getPluginInstance('openshock');
  // ...
}
```

## Troubleshooting

### "OpenShock plugin not found"

The OpenShock plugin is not loaded or not enabled. Check:
1. Plugin is enabled in the plugin manager
2. OpenShock plugin loaded successfully (check logs)
3. No errors during OpenShock initialization

### "Device not found"

The device ID doesn't exist or isn't loaded. Check:
1. Device ID is correct
2. OpenShock API key is configured
3. Devices are loaded (check OpenShock dashboard)

### Queue not processing

Check:
1. Queue is not paused
2. Emergency stop is not activated
3. OpenShock API connection is working
4. Check queue UI for error messages

## Advanced: Direct Queue Manager Access

For advanced use cases, you can access the queue manager directly:

```javascript
const openshockPlugin = pluginLoader.getPluginInstance('openshock');
const queueManager = openshockPlugin.queueManager;

// Get queue status
const status = queueManager.getQueueStatus();
console.log(`Queue has ${status.pending} pending items`);

// Get all queue items
const items = queueManager.getQueueItems();

// Get queue statistics
const stats = queueManager.getStats();
console.log(`Success rate: ${stats.successRate}%`);
```

## Support

For issues or questions:
- Check OpenShock plugin logs
- Monitor queue UI at `/openshock/queue`
- Check main application logs
- GitHub: [ltth_desktop2](https://github.com/Loggableim/ltth_desktop2)

## Version History

- **1.0.0** (2026-02-01): Initial queue API implementation
  - Public `addToQueue()` method
  - Queue UI with real-time updates
  - Socket.IO event support
  - Cross-plugin integration support
