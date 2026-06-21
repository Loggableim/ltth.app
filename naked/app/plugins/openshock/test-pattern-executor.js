/**
 * Manual Test: PatternExecutor Sequential Execution
 * 
 * Tests that PatternExecutor coordinates pattern steps with queue feedback
 */

const QueueManager = require('./helpers/queueManager');
const PatternExecutor = require('./helpers/patternExecutor');

// Mock OpenShock Client
const mockClient = {
  sendShock: async (deviceId, intensity, duration) => {
    console.log(`  ✅ [${new Date().toISOString()}] Shock: intensity=${intensity}, duration=${duration}ms`);
    return { success: true };
  },
  sendVibrate: async (deviceId, intensity, duration) => {
    console.log(`  ✅ [${new Date().toISOString()}] Vibrate: intensity=${intensity}, duration=${duration}ms`);
    return { success: true };
  },
  sendSound: async (deviceId, intensity, duration) => {
    console.log(`  ✅ [${new Date().toISOString()}] Sound: intensity=${intensity}, duration=${duration}ms`);
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
const mockLogger = (msg, level) => {
  const lvl = (level || 'info').toString().toUpperCase();
  if (lvl !== 'DEBUG') {
    console.log(`[${lvl}] ${msg}`);
  }
};

console.log('🧪 Testing PatternExecutor Sequential Execution\n');
console.log('='.repeat(60));

const queueManager = new QueueManager(mockClient, mockSafety, {
  info: mockLogger,
  warn: mockLogger,
  error: mockLogger,
  debug: () => {} // Suppress debug logs for cleaner output
});

const patternExecutor = new PatternExecutor(queueManager, mockLogger);

// Test pattern with 3 steps
const testPattern = {
  id: 'test-pattern',
  name: 'Test Wave',
  steps: [
    { type: 'vibrate', intensity: 30, duration: 500 },
    { type: 'pause', duration: 200 },
    { type: 'vibrate', intensity: 50, duration: 500 },
    { type: 'pause', duration: 200 },
    { type: 'vibrate', intensity: 70, duration: 500 }
  ]
};

console.log('\n📊 Test Scenario 1: Single Pattern Execution');
console.log('  Pattern:', testPattern.name);
console.log('  Steps:', testPattern.steps.length);
console.log('  Expected duration: ~2000ms (3x 500ms commands + 2x 200ms pauses)\n');

let startTime = Date.now();

// Listen to pattern executor events
patternExecutor.on('execution-completed', (execution) => {
  const elapsed = Date.now() - startTime;
  console.log('\n' + '='.repeat(60));
  console.log('📈 Pattern Completed!');
  console.log('  Total time:', elapsed, 'ms');
  console.log('  Expected: ~2000ms');
  console.log('  Repeats completed:', execution.repeatCount);
  
  // Test scenario 2: Pattern with repeats
  setTimeout(() => {
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Test Scenario 2: Pattern with Repeats (Gift Multiplier)');
    console.log('  Pattern:', testPattern.name);
    console.log('  Repeat count: 3 (simulating 3 gifts)');
    console.log('  Expected: Pattern executes 3 times sequentially\n');
    
    startTime = Date.now();
    
    patternExecutor.once('execution-completed', (execution) => {
      const elapsed = Date.now() - startTime;
      console.log('\n' + '='.repeat(60));
      console.log('📈 All Repeats Completed!');
      console.log('  Total time:', elapsed, 'ms');
      console.log('  Expected: ~6000ms (3 repeats × 2000ms)');
      console.log('  Repeats completed:', execution.repeatCount);
      
      if (execution.repeatCount === 3) {
        console.log('\n✅ SUCCESS: Pattern repetition works correctly!');
      } else {
        console.log('\n❌ FAILURE: Expected 3 repeats, got', execution.repeatCount);
      }
      
      queueManager.stopProcessing();
      process.exit(0);
    });
    
    // Execute with repeat count
    patternExecutor.executePattern(
      testPattern,
      'test-device',
      'test-user',
      'test-gift',
      3, // repeatCount (simulating gift multiplier)
      {
        username: 'TestUser',
        sourceData: {}
      }
    );
  }, 500);
});

// Execute pattern once
patternExecutor.executePattern(
  testPattern,
  'test-device',
  'test-user',
  'manual-test',
  1, // single execution
  {
    username: 'TestUser',
    sourceData: {}
  }
);

console.log('⏳ Executing pattern...\n');
