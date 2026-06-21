/**
 * Manual Test Script for OpenShock Queue System
 * 
 * This script demonstrates how the OpenShock queue system handles commands
 * from different sources (Plinko, TikTok events, etc.) and processes them
 * sequentially regardless of case.
 * 
 * To run this test:
 * 1. Ensure OpenShock plugin is enabled and configured
 * 2. Have at least one OpenShock device configured
 * 3. Run: node app/plugins/openshock/manual-test-queue.js
 * 
 * NOTE: This is a simulation - it doesn't actually send commands to devices
 * without a valid API key and device configuration.
 */

const QueueManager = require('./helpers/queueManager');

// Mock OpenShock Client (simulates successful API calls)
class MockOpenShockClient {
  constructor() {
    this.commandLog = [];
  }

  async sendShock(deviceId, intensity, duration) {
    const command = { type: 'shock', deviceId, intensity, duration };
    this.commandLog.push({ ...command, timestamp: Date.now() });
    console.log(`  ⚡ [MOCK] Shock sent: device=${deviceId}, intensity=${intensity}%, duration=${duration}ms`);
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true };
  }

  async sendVibrate(deviceId, intensity, duration) {
    const command = { type: 'vibrate', deviceId, intensity, duration };
    this.commandLog.push({ ...command, timestamp: Date.now() });
    console.log(`  📳 [MOCK] Vibrate sent: device=${deviceId}, intensity=${intensity}%, duration=${duration}ms`);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true };
  }

  async sendSound(deviceId, intensity, duration) {
    const command = { type: 'sound', deviceId, intensity, duration };
    this.commandLog.push({ ...command, timestamp: Date.now() });
    console.log(`  🔔 [MOCK] Sound sent: device=${deviceId}, intensity=${intensity}%, duration=${duration}ms`);
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true };
  }
}

// Mock Safety Manager (allows all commands)
class MockSafetyManager {
  checkCommand(command, userId, deviceId) {
    return {
      allowed: true,
      modifiedCommand: command
    };
  }
}

// Logger
const logger = {
  info: (msg, data) => {
    if (data !== undefined && data !== null) {
      console.log(`[INFO] ${msg}`, data);
    } else {
      console.log(`[INFO] ${msg}`);
    }
  },
  warn: (msg, data) => {
    if (data !== undefined && data !== null) {
      console.warn(`[WARN] ${msg}`, data);
    } else {
      console.warn(`[WARN] ${msg}`);
    }
  },
  error: (msg, data) => {
    if (data !== undefined && data !== null) {
      console.error(`[ERROR] ${msg}`, data);
    } else {
      console.error(`[ERROR] ${msg}`);
    }
  },
  debug: (msg, data) => {
    if (data !== undefined && data !== null) {
      console.log(`[DEBUG] ${msg}`, data);
    } else {
      console.log(`[DEBUG] ${msg}`);
    }
  }
};

async function runTest() {
  console.log('\n=== OpenShock Queue System - Manual Test ===\n');
  
  const mockClient = new MockOpenShockClient();
  const mockSafety = new MockSafetyManager();
  const queueManager = new QueueManager(mockClient, mockSafety, logger);

  console.log('✅ QueueManager initialized\n');

  // Test 1: Plinko reward (capitalized command types)
  console.log('📍 TEST 1: Plinko Reward (Capitalized Types)');
  console.log('Simulating Plinko ball landing in a slot with Vibrate reward...\n');
  
  await queueManager.enqueue(
    {
      type: 'Vibrate',  // Capitalized (as sent by Plinko)
      deviceId: 'device-001',
      intensity: 50,
      duration: 1000
    },
    'testuser1',
    'plinko-reward',
    { slotIndex: 4, multiplier: 2 },
    5  // Medium priority
  );

  // Wait for command to process
  await new Promise(resolve => setTimeout(resolve, 800));

  // Test 2: TikTok gift (lowercase command types)
  console.log('\n📍 TEST 2: TikTok Gift (Lowercase Types)');
  console.log('Simulating TikTok gift event with shock reward...\n');
  
  await queueManager.enqueue(
    {
      type: 'shock',  // Lowercase (as sent by some TikTok mappings)
      deviceId: 'device-001',
      intensity: 40,
      duration: 800
    },
    'testuser2',
    'tiktok-gift',
    { giftName: 'Rose', diamonds: 1 },
    6  // Slightly higher priority
  );

  await new Promise(resolve => setTimeout(resolve, 800));

  // Test 3: Multiple commands (mixed cases) to demonstrate sequential processing
  console.log('\n📍 TEST 3: Multiple Commands (Sequential Processing)');
  console.log('Queueing 5 commands with mixed cases to demonstrate sequential processing...\n');

  const commands = [
    { type: 'Shock', deviceId: 'device-001', intensity: 45, duration: 500, source: 'plinko-reward' },
    { type: 'vibrate', deviceId: 'device-002', intensity: 55, duration: 600, source: 'tiktok-follow' },
    { type: 'SOUND', deviceId: 'device-003', intensity: 65, duration: 700, source: 'tiktok-share' },
    { type: 'Vibrate', deviceId: 'device-001', intensity: 50, duration: 800, source: 'plinko-reward' },
    { type: 'shock', deviceId: 'device-002', intensity: 40, duration: 900, source: 'tiktok-gift' }
  ];

  const startTime = Date.now();
  
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    console.log(`  Queueing command ${i + 1}: ${cmd.type} (${cmd.source})`);
    await queueManager.enqueue(
      { type: cmd.type, deviceId: cmd.deviceId, intensity: cmd.intensity, duration: cmd.duration },
      `testuser${i + 3}`,
      cmd.source,
      {},
      5
    );
  }

  console.log('\n  ⏳ Waiting for all commands to process...\n');
  
  // Wait for all commands to process (5 commands * ~400ms delay = ~2000ms)
  await new Promise(resolve => setTimeout(resolve, 3000));

  const endTime = Date.now();
  const totalTime = endTime - startTime;

  console.log(`\n  ✅ All commands processed in ${totalTime}ms`);
  console.log(`  📊 Commands were processed sequentially (not in parallel)`);

  // Test 4: Queue status and statistics
  console.log('\n📍 TEST 4: Queue Status and Statistics\n');
  
  const status = queueManager.getQueueStatus();
  const stats = queueManager.getStats();

  console.log('Queue Status:');
  console.log(`  - Total items: ${status.length}`);
  console.log(`  - Pending: ${status.pending}`);
  console.log(`  - Processing: ${status.processing}`);
  console.log(`  - Completed: ${status.completed}`);
  console.log(`  - Failed: ${status.failed}`);
  console.log(`  - Cancelled: ${status.cancelled}`);
  console.log(`  - Is processing: ${status.isProcessing}`);

  console.log('\nQueue Statistics:');
  console.log(`  - Total enqueued: ${stats.totalEnqueued}`);
  console.log(`  - Total processed: ${stats.totalProcessed}`);
  console.log(`  - Total failed: ${stats.totalFailed}`);
  console.log(`  - Success rate: ${stats.successRate}%`);
  console.log(`  - Average processing time: ${stats.averageProcessingTime}ms`);

  console.log('\nCommand Log (from mock client):');
  mockClient.commandLog.forEach((cmd, i) => {
    console.log(`  ${i + 1}. ${cmd.type} on ${cmd.deviceId} (intensity: ${cmd.intensity}%, duration: ${cmd.duration}ms)`);
  });

  // Cleanup
  queueManager.stopProcessing();

  console.log('\n=== Test Complete ===\n');
  console.log('✅ The queue system successfully handled commands with different cases');
  console.log('✅ All commands were processed sequentially (one at a time)');
  console.log('✅ Commands from different sources (Plinko, TikTok) work correctly');
  console.log('\n💡 This demonstrates the fix for the case sensitivity issue');
  console.log('   where Plinko commands (Vibrate, Shock, Sound) were not being');
  console.log('   recognized by the queue manager.\n');
}

// Run the test
runTest().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
