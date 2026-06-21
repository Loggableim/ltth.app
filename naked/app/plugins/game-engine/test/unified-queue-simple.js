#!/usr/bin/env node

/**
 * Simple Integration Test for Unified Queue
 * 
 * Tests basic functionality without requiring Jest
 */

const UnifiedQueueManager = require('../backend/unified-queue');

// Mock logger
const mockLogger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

// Mock Socket.IO
const mockIO = {
  emit: (event, data) => console.log(`[EMIT] ${event}:`, JSON.stringify(data, null, 2))
};

// Mock Plinko game
const mockPlinkoGame = {
  spawnBalls: async (username, nickname, profilePictureUrl, betAmount, count, options) => {
    console.log(`[PLINKO] Spawning balls for ${username}, bet: ${betAmount}, count: ${count}, forceStart: ${options.forceStart}`);
    return { success: true };
  }
};

// Mock Wheel game
const mockWheelGame = {
  startSpin: async (spinData) => {
    console.log(`[WHEEL] Starting spin for ${spinData.username}, spinId: ${spinData.spinId}`);
    return { success: true };
  }
};

// Test runner
function runTest(name, fn) {
  console.log(`\n🧪 TEST: ${name}`);
  try {
    fn();
    console.log(`✅ PASS: ${name}\n`);
    return true;
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(error);
    console.log();
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Run tests
console.log('='.repeat(60));
console.log('Unified Queue Manager - Integration Tests');
console.log('='.repeat(60));

let passedTests = 0;
let totalTests = 0;

// Test 1: Initialization
totalTests++;
if (runTest('Queue should initialize correctly', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  assert(queue.queue.length === 0, 'Queue should be empty');
  assert(queue.isProcessing === false, 'Should not be processing');
  queue.destroy();
})) passedTests++;

// Test 2: Set game references
totalTests++;
if (runTest('Should set game references', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  queue.setPlinkoGame(mockPlinkoGame);
  queue.setWheelGame(mockWheelGame);
  assert(queue.plinkoGame === mockPlinkoGame, 'Plinko game should be set');
  assert(queue.wheelGame === mockWheelGame, 'Wheel game should be set');
  queue.destroy();
})) passedTests++;

// Test 3: Queue Plinko
totalTests++;
if (runTest('Should queue Plinko drop', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  queue.setPlinkoGame(mockPlinkoGame);
  
  const dropData = {
    username: 'testuser',
    nickname: 'Test User',
    betAmount: 100,
    count: 1,
    batchId: 'test123'
  };
  
  const result = queue.queuePlinko(dropData);
  
  assert(result.queued === true, 'Should be queued');
  assert(result.position === 1, 'Position should be 1');
  assert(queue.queue.length === 1, 'Queue should have 1 item');
  assert(queue.queue[0].type === 'plinko', 'Type should be plinko');
  
  queue.destroy();
})) passedTests++;

// Test 4: Queue Wheel
totalTests++;
if (runTest('Should queue Wheel spin', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  queue.setWheelGame(mockWheelGame);
  
  const spinData = {
    username: 'testuser',
    nickname: 'Test User',
    spinId: 'spin123',
    wheelId: 1
  };
  
  const result = queue.queueWheel(spinData);
  
  assert(result.queued === true, 'Should be queued');
  assert(result.position === 1, 'Position should be 1');
  assert(queue.queue.length === 1, 'Queue should have 1 item');
  assert(queue.queue[0].type === 'wheel', 'Type should be wheel');
  
  queue.destroy();
})) passedTests++;

// Test 5: FIFO order
totalTests++;
if (runTest('Should maintain FIFO order', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  queue.setPlinkoGame(mockPlinkoGame);
  queue.setWheelGame(mockWheelGame);
  
  // Queue in specific order
  queue.queuePlinko({ username: 'plinkouser1', betAmount: 100, count: 1 });
  queue.queueWheel({ username: 'wheeluser1', spinId: 'spin1' });
  queue.queuePlinko({ username: 'plinkouser2', betAmount: 200, count: 1 });
  
  assert(queue.queue.length === 3, 'Should have 3 items');
  assert(queue.queue[0].type === 'plinko', 'First should be plinko');
  assert(queue.queue[0].data.username === 'plinkouser1', 'First username correct');
  assert(queue.queue[1].type === 'wheel', 'Second should be wheel');
  assert(queue.queue[1].data.username === 'wheeluser1', 'Second username correct');
  assert(queue.queue[2].type === 'plinko', 'Third should be plinko');
  assert(queue.queue[2].data.username === 'plinkouser2', 'Third username correct');
  
  queue.destroy();
})) passedTests++;

// Test 6: Queue status
totalTests++;
if (runTest('Should return correct queue status', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  queue.setPlinkoGame(mockPlinkoGame);
  
  queue.queuePlinko({ username: 'user1', betAmount: 100, count: 1 });
  queue.queuePlinko({ username: 'user2', betAmount: 200, count: 1 });
  
  const status = queue.getStatus();
  
  assert(status.queueLength === 2, 'Queue length should be 2');
  assert(status.queue.length === 2, 'Queue array length should be 2');
  assert(status.queue[0].type === 'plinko', 'First type should be plinko');
  assert(status.queue[0].username === 'user1', 'First username correct');
  assert(status.queue[0].position === 1, 'First position is 1');
  assert(status.queue[1].position === 2, 'Second position is 2');
  
  queue.destroy();
})) passedTests++;

// Test 7: shouldQueue
totalTests++;
if (runTest('shouldQueue should work correctly', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  
  // Initially should not queue
  assert(queue.shouldQueue() === false, 'Should not queue when idle');
  
  // When processing
  queue.isProcessing = true;
  assert(queue.shouldQueue() === true, 'Should queue when processing');
  queue.isProcessing = false;
  
  // When queue has items
  queue.queuePlinko({ username: 'test', betAmount: 100, count: 1 });
  assert(queue.shouldQueue() === true, 'Should queue when queue not empty');
  
  queue.destroy();
})) passedTests++;

// Test 8: Clear queue
totalTests++;
if (runTest('Should clear queue', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  
  queue.queuePlinko({ username: 'user1', betAmount: 100, count: 1 });
  queue.queuePlinko({ username: 'user2', betAmount: 200, count: 1 });
  queue.queuePlinko({ username: 'user3', betAmount: 300, count: 1 });
  
  assert(queue.queue.length === 3, 'Should have 3 items before clear');
  
  queue.clearQueue();
  
  assert(queue.queue.length === 0, 'Should have 0 items after clear');
  
  queue.destroy();
})) passedTests++;

// Test 9: Complete processing
totalTests++;
if (runTest('completeProcessing should reset state', () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  
  queue.isProcessing = true;
  queue.currentItem = { type: 'plinko', data: { username: 'test' } };
  
  queue.completeProcessing();
  
  assert(queue.isProcessing === false, 'Should not be processing');
  assert(queue.currentItem === null, 'Current item should be null');
  
  queue.destroy();
})) passedTests++;

// Test 10: Async processing
totalTests++;
if (runTest('Should process items asynchronously', async () => {
  const queue = new UnifiedQueueManager(mockLogger, mockIO);
  queue.setPlinkoGame(mockPlinkoGame);
  queue.setWheelGame(mockWheelGame);
  
  // Queue some items
  queue.queuePlinko({ username: 'plinkouser', betAmount: 100, count: 1 });
  queue.queueWheel({ username: 'wheeluser', spinId: 'spin123' });
  
  // Wait a bit for processing to start
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // First item should be processing or processed
  assert(queue.isProcessing === true || queue.queue.length < 2, 'Processing should have started');
  
  queue.destroy();
})) passedTests++;

// Summary
console.log('='.repeat(60));
console.log(`RESULTS: ${passedTests}/${totalTests} tests passed`);
console.log('='.repeat(60));

if (passedTests === totalTests) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed!');
  process.exit(1);
}
