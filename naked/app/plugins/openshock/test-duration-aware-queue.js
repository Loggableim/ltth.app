/**
 * Manual Test: Duration-Aware Queue Processing
 * 
 * Tests that the queue waits for command duration + safety margin before processing next command
 */

const QueueManager = require('./helpers/queueManager');

// Mock OpenShock Client
const mockClient = {
  sendShock: async (deviceId, intensity, duration) => {
    console.log(`✅ [${new Date().toISOString()}] Shock sent: device=${deviceId}, intensity=${intensity}, duration=${duration}`);
    return { success: true };
  },
  sendVibrate: async (deviceId, intensity, duration) => {
    console.log(`✅ [${new Date().toISOString()}] Vibrate sent: device=${deviceId}, intensity=${intensity}, duration=${duration}`);
    return { success: true };
  },
  sendSound: async (deviceId, intensity, duration) => {
    console.log(`✅ [${new Date().toISOString()}] Sound sent: device=${deviceId}, intensity=${intensity}, duration=${duration}`);
    return { success: true };
  }
};

// Mock Safety Manager
const mockSafety = {
  checkCommand: (command, userId, deviceId) => {
    return {
      allowed: true,
      modifiedCommand: command
    };
  }
};

// Mock Logger
const mockLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`),
  error: (msg, data) => console.error(`[ERROR] ${msg}`),
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`)
};

console.log('🧪 Testing Duration-Aware Queue Processing\n');
console.log('='.repeat(60));

const queueManager = new QueueManager(mockClient, mockSafety, mockLogger);

console.log('\n📊 Test Scenario:');
console.log('  - Adding 3 commands with 1000ms duration each');
console.log('  - Expected: Each command waits 1200ms (1000ms + 200ms safety)');
console.log('  - Total expected time: ~3.6 seconds\n');

const startTime = Date.now();
const commandTimes = [];

// Listen to queue events
queueManager.on('item-processed', (item, success) => {
  const elapsed = Date.now() - startTime;
  commandTimes.push(elapsed);
  console.log(`✅ Command ${commandTimes.length} processed at ${elapsed}ms`);
  
  if (commandTimes.length === 3) {
    // All commands processed
    console.log('\n' + '='.repeat(60));
    console.log('📈 Results:');
    console.log('  Command 1:', commandTimes[0], 'ms');
    console.log('  Command 2:', commandTimes[1], 'ms (gap:', commandTimes[1] - commandTimes[0], 'ms)');
    console.log('  Command 3:', commandTimes[2], 'ms (gap:', commandTimes[2] - commandTimes[1], 'ms)');
    console.log('  Total time:', commandTimes[2], 'ms');
    
    // Verify timing
    const gap1 = commandTimes[1] - commandTimes[0];
    const gap2 = commandTimes[2] - commandTimes[1];
    const expectedGap = 1200; // 1000ms duration + 200ms safety
    const tolerance = 100; // Allow 100ms tolerance
    
    console.log('\n🎯 Validation:');
    if (Math.abs(gap1 - expectedGap) < tolerance && Math.abs(gap2 - expectedGap) < tolerance) {
      console.log('✅ SUCCESS: Duration-aware processing works correctly!');
      console.log(`   Expected gap: ${expectedGap}ms, Actual gaps: ${gap1}ms, ${gap2}ms`);
    } else {
      console.log('❌ FAILURE: Duration-aware processing not working as expected');
      console.log(`   Expected gap: ${expectedGap}ms, Actual gaps: ${gap1}ms, ${gap2}ms`);
    }
    
    queueManager.stopProcessing();
    process.exit(0);
  }
});

// Add 3 commands
console.log('📝 Enqueuing commands...\n');

(async () => {
  for (let i = 1; i <= 3; i++) {
    await queueManager.enqueue(
      {
        type: 'vibrate',
        deviceId: 'test-device',
        intensity: 50,
        duration: 1000  // 1 second duration
      },
      'test-user',
      'test-script',
      {},
      5
    );
    console.log(`  Command ${i} enqueued`);
  }
  
  console.log('\n⏳ Processing commands...\n');
})();
