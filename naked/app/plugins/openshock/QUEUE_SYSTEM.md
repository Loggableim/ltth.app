# OpenShock Queue System Documentation

## Overview

The OpenShock plugin implements a robust command queue system that ensures all shock, vibrate, and sound commands are processed sequentially, one at a time, regardless of which plugin or source triggers them.

## Architecture

### QueueManager (`helpers/queueManager.js`)

The QueueManager is the central component that handles all OpenShock commands. It provides:

- **Sequential Processing**: Commands are executed one at a time with configurable delays
- **Priority Queue**: Commands can be prioritized (1-10, where 10 is highest priority)
- **Retry Logic**: Failed commands are automatically retried up to 3 times
- **Safety Checks**: All commands pass through the SafetyManager before execution
- **Statistics Tracking**: Comprehensive tracking of queue performance and command success rates

### Key Features

#### 1. Command Queuing

Any plugin can send commands to the OpenShock queue using:

```javascript
const openshockPlugin = api.pluginLoader.loadedPlugins.get('openshock');
if (openshockPlugin && openshockPlugin.instance) {
  await openshockPlugin.instance.queueManager.enqueue(
    command,        // { type, deviceId, intensity, duration }
    username,       // User who triggered the command
    source,         // Source identifier (e.g., 'plinko-reward', 'tiktok-gift')
    metadata,       // Additional metadata object
    priority        // 1-10, where 10 is highest (default: 5)
  );
}
```

#### 2. Command Types

The queue manager accepts commands in **any case** (case-insensitive):
- `'shock'`, `'Shock'`, `'SHOCK'` → Triggers electric shock
- `'vibrate'`, `'Vibrate'`, `'VIBRATE'` → Triggers vibration
- `'sound'`, `'Sound'`, `'SOUND'`, `'beep'`, `'Beep'` → Triggers sound/beep

This flexibility allows different plugins to use their preferred casing convention.

#### 3. Sequential Processing

Commands are processed in order with a configurable delay (default: 300ms) between each command. This ensures:
- Commands don't overlap or interfere with each other
- Devices have time to process each command
- Users experience predictable, controlled sensations

#### 4. Priority System

Commands can be assigned priorities (1-10):
- **10**: Emergency/critical (e.g., emergency stop)
- **7-9**: High priority (e.g., important events)
- **5-6**: Medium priority (e.g., Plinko rewards, gifts) - **DEFAULT**
- **3-4**: Low priority (e.g., follows, shares)
- **1-2**: Very low priority (e.g., background/ambient events)

Higher priority commands are executed before lower priority ones, but all commands in the queue are still processed sequentially.

#### 5. Safety Layer

All commands pass through the SafetyManager which:
- Validates command parameters
- Applies global intensity and duration limits
- Enforces device-specific cooldowns
- Checks user permissions and follower age requirements
- Can modify or block commands based on safety rules

#### 6. Retry Logic

If a command fails (e.g., network error, device unavailable):
- It's automatically retried up to 3 times
- A 1-second delay is applied between retries
- After max retries, the command is marked as failed
- Success/failure is tracked in statistics

## Integration Examples

### Plinko Game Integration

The Plinko game triggers OpenShock rewards when a ball lands in a slot:

```javascript
// In plinko.js
async triggerOpenshockReward(username, reward, slotIndex) {
  const openshockPlugin = this.api.pluginLoader?.loadedPlugins?.get('openshock');
  
  const command = {
    deviceId: targetDeviceId,
    type: 'Vibrate',  // Note: Capitalized (case-insensitive)
    intensity: 50,
    duration: 1000
  };
  
  await openshockPlugin.instance.queueManager.enqueue(
    command,
    username,
    'plinko-reward',
    { slotIndex, reward },
    5  // Medium priority
  );
}
```

### TikTok Event Integration

TikTok events (gifts, follows, etc.) can trigger OpenShock commands through the mapping engine:

```javascript
// In main.js mappingEngine
const action = this.mappingEngine.getActionForEvent('gift', giftData);
if (action && action.type === 'openshock') {
  this.queueManager.addItem({
    commandType: action.commandType,  // 'shock', 'vibrate', or 'sound'
    deviceId: action.deviceId,
    intensity: action.intensity,
    duration: action.duration,
    userId: event.userId,
    source: 'tiktok-gift',
    priority: action.priority || 5
  });
}
```

### Pattern Integration

Patterns can schedule multiple commands with precise timing:

```javascript
// In patternEngine
for (let i = 0; i < pattern.steps.length; i++) {
  const step = pattern.steps[i];
  const scheduledTime = baseTimestamp + cumulativeDelay;
  
  this.queueManager.addItem({
    commandType: step.type,
    deviceId: device.id,
    intensity: step.intensity,
    duration: step.duration,
    timestamp: scheduledTime,  // Scheduled execution time
    executionId: patternExecutionId,
    stepIndex: i,
    priority: 5
  });
}
```

## Queue Status and Monitoring

### Get Queue Status

```javascript
const status = queueManager.getQueueStatus();
// Returns:
// {
//   length: 10,           // Total items in queue
//   queueSize: 3,         // Active items (pending + processing)
//   pending: 2,           // Items waiting to be processed
//   processing: 1,        // Item currently being processed
//   completed: 5,         // Successfully completed items
//   failed: 1,            // Failed items (after max retries)
//   cancelled: 1,         // Cancelled items
//   isProcessing: true,   // Whether queue is actively processing
//   isPaused: false,      // Whether queue is paused
//   stats: { ... }        // Detailed statistics
// }
```

### Statistics

```javascript
const stats = queueManager.getStats();
// Returns:
// {
//   totalEnqueued: 100,           // Total commands added to queue
//   totalProcessed: 95,           // Total commands processed (success + failed)
//   totalFailed: 5,               // Total failed commands
//   totalCancelled: 2,            // Total cancelled commands
//   totalRetried: 8,              // Total retry attempts
//   averageProcessingTime: 250,   // Average time to process a command (ms)
//   commandsPerMinute: 12,        // Recent throughput
//   successRate: 94.74            // Success rate percentage
// }
```

## Configuration

### Queue Settings

Configured in OpenShock plugin config:

```javascript
queueSettings: {
  maxQueueSize: 1000,      // Maximum number of items in queue
  processingDelay: 300     // Delay between commands (ms)
}
```

### Safety Limits

```javascript
globalLimits: {
  maxIntensity: 80,         // Maximum allowed intensity (1-100)
  maxDuration: 5000,        // Maximum allowed duration (ms)
  maxCommandsPerMinute: 30  // Rate limit for commands
}
```

### Cooldowns

```javascript
defaultCooldowns: {
  global: 500,       // Minimum delay between any commands (ms)
  perDevice: 3000,   // Minimum delay between commands to same device (ms)
  perUser: 10000     // Minimum delay between commands from same user (ms)
}
```

## Troubleshooting

### Commands Not Executing

1. **Check queue status**: Verify commands are being added to the queue
2. **Check safety manager**: Commands may be blocked by safety rules
3. **Check API key**: Ensure OpenShock API key is configured
4. **Check device IDs**: Verify device IDs are correct and devices are online
5. **Check logs**: Look for error messages in the OpenShock plugin logs

### Commands Executing Out of Order

- This should not happen - the queue is strictly sequential
- Check that all plugins are using the same QueueManager instance
- Verify priority values are set correctly

### High Latency

- Adjust `processingDelay` to reduce delay between commands
- Check network connectivity to OpenShock API
- Verify OpenShock API is responding quickly

## Best Practices

1. **Always use the queue**: Never bypass the queue to send commands directly
2. **Set appropriate priorities**: Use priorities to ensure important events are processed first
3. **Provide good metadata**: Include source and context information for debugging
4. **Monitor queue health**: Check queue status periodically to detect issues
5. **Handle errors gracefully**: Commands may fail - have fallback logic if needed
6. **Respect safety limits**: Don't try to bypass or override safety checks
7. **Test thoroughly**: Test your integration with various scenarios before deployment

## Case Sensitivity Fix (v1.0.1)

**Issue**: Originally, the QueueManager expected lowercase command types ('shock', 'vibrate', 'sound'), but some plugins (like Plinko) sent capitalized types ('Shock', 'Vibrate', 'Sound') matching the OpenShock API convention.

**Fix**: QueueManager now normalizes all command types to lowercase before processing, making it fully case-insensitive.

**Impact**: All plugins now work correctly regardless of the casing used for command types. This ensures maximum compatibility and eliminates a common integration error.
