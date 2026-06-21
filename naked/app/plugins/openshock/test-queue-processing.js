/**
 * Test Queue Processing
 * 
 * This script tests if the queueManager actually processes commands
 */

const QueueManager = require('./helpers/queueManager');

// Mock OpenShock Client
const mockClient = {
  sendShock: async (deviceId, intensity, duration) => {
    console.log(`✅ [Mock Client] Shock sent: device=${deviceId}, intensity=${intensity}, duration=${duration}`);
    return { success: true };
  },
  sendVibrate: async (deviceId, intensity, duration) => {
    console.log(`✅ [Mock Client] Vibrate sent: device=${deviceId}, intensity=${intensity}, duration=${duration}`);
    return { success: true };
  },
  sendSound: async (deviceId, intensity, duration) => {
    console.log(`✅ [Mock Client] Sound sent: device=${deviceId}, intensity=${intensity}, duration=${duration}`);
    return { success: true };
  }
};

// Mock Safety Manager
const mockSafety = {
  checkCommand: (command, userId, deviceId) => {
    console.log(`✅ [Mock Safety] Checking command: ${command.type} for user ${userId}`);
    return {
      allowed: true,
      modifiedCommand: command
    };
  }
};

// Mock Logger
const mockLogger = {
  info: (msg, data) => console.log(`[INFO] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[WARN] ${msg}`, data || ''),
  error: (msg, data) => console.error(`[ERROR] ${msg}`, data || ''),
  debug: (msg, data) => console.log(`[DEBUG] ${msg}`, data || '')
};

console.log('🧪 Testing Queue Processing\n');
console.log('Creating QueueManager...');

const queueManager = new QueueManager(mockClient, mockSafety, mockLogger);

console.log('\n📊 Initial Queue Status:');
console.log(queueManager.getQueueStatus());

console.log('\n🎯 Adding test command to queue...');

// Add a test command
queueManager.enqueue(
  {
    type: 'Vibrate',
    deviceId: 'test-device-123',
    intensity: 50,
    duration: 1000
  },
  'test-user',
  'test-script',
  {},
  5
).then(result => {
  console.log('\n✅ Enqueue result:', result);
  
  // Check status after a short delay
  setTimeout(() => {
    console.log('\n📊 Queue Status after 2 seconds:');
    console.log(queueManager.getQueueStatus());
    
    // Check if command was processed
    if (queueManager.stats.totalProcessed > 0) {
      console.log('\n✅ SUCCESS: Command was processed!');
    } else {
      console.log('\n❌ PROBLEM: Command was NOT processed!');
      console.log('Queue is processing:', queueManager.isProcessing);
      console.log('Queue is paused:', queueManager.isPaused);
      console.log('Queue length:', queueManager.queue.length);
    }
    
    // Stop processing and exit
    queueManager.stopProcessing();
    process.exit(0);
  }, 2000);
}).catch(error => {
  console.error('\n❌ Error:', error);
  process.exit(1);
});

console.log('\nWaiting for queue to process...\n');
