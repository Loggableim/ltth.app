/**
 * Test: Goals Stream Session Reset
 * 
 * This test verifies that goals correctly reset between stream sessions.
 * It addresses the bug where goals carried over values from previous streams,
 * causing the display to show "much more coins than actually gifted" in new sessions.
 * 
 * Bug: Goals with 'hide' or 'reset' actions were not resetting their current_value
 * when the stream ended, causing accumulated values to persist into new sessions.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('🧪 Testing Goals Stream Session Reset...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

// Mock plugin structure
class MockStateMachine {
  constructor() {
    this.data = {
      currentValue: 0,
      targetValue: 1000,
      previousValue: 0
    };
  }
  
  updateValue(value, checkReached = true) {
    this.data.currentValue = value;
    return true;
  }
}

class MockStateMachineManager {
  constructor() {
    this.machines = new Map();
  }
  
  getMachine(goalId) {
    if (!this.machines.has(goalId)) {
      this.machines.set(goalId, new MockStateMachine());
    }
    return this.machines.get(goalId);
  }
}

class MockDatabase {
  constructor() {
    this.goals = [];
    this.settings = new Map();
    this.updates = [];
  }
  
  getAllGoals() {
    return this.goals;
  }
  
  updateGoal(id, updates) {
    this.updates.push({ id, updates });
    const goal = this.goals.find(g => g.id === id);
    if (goal) {
      Object.assign(goal, updates);
    }
    return goal;
  }
  
  getSetting(key) {
    return this.settings.get(key) || null;
  }
  
  setSetting(key, value) {
    this.settings.set(key, value);
  }
}

class MockAPI {
  constructor() {
    this.logs = [];
    this.db = new MockDatabase();
  }
  
  log(message, level) {
    this.logs.push({ message, level });
  }
  
  getDatabase() {
    return this.db;
  }
}

class MockPlugin {
  constructor() {
    this.broadcasts = [];
  }
  
  broadcastGoalReset(goal) {
    this.broadcasts.push({ type: 'reset', goal });
  }
}

// Import the event handlers class
const GoalsEventHandlers = require(path.join(__dirname, '..', 'plugins', 'goals', 'backend', 'event-handlers'));

// Test 1: Goals with 'hide' action should reset current_value on stream end
runTest('Goals with "hide" action should reset current_value when stream ends', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  // Create a goal with 'hide' action that has accumulated coins
  mockAPI.db.goals = [{
    id: 1,
    name: 'Coin Goal',
    goal_type: 'coin',
    on_reach_action: 'hide',
    current_value: 5000,  // Accumulated from previous stream
    target_value: 1000,
    start_value: 0
  }];
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  // Simulate stream end
  eventHandlers.resetGoalsOnStreamEnd();
  
  // Verify goal was reset
  assert.strictEqual(mockAPI.db.updates.length, 1, 'Should have one update');
  assert.strictEqual(mockAPI.db.updates[0].updates.current_value, 0, 'Current value should be reset to start_value (0)');
  assert.strictEqual(mockAPI.db.goals[0].current_value, 0, 'Goal current_value should be 0');
  assert.strictEqual(mockPlugin.broadcasts.length, 1, 'Should broadcast reset');
});

// Test 2: Goals with 'reset' action should reset current_value on stream end
runTest('Goals with "reset" action should reset current_value when stream ends', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  mockAPI.db.goals = [{
    id: 2,
    name: 'Likes Goal',
    goal_type: 'likes',
    on_reach_action: 'reset',
    current_value: 3000,
    target_value: 500,
    start_value: 0
  }];
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  eventHandlers.resetGoalsOnStreamEnd();
  
  assert.strictEqual(mockAPI.db.goals[0].current_value, 0, 'Goal should be reset to 0');
});

// Test 3: Goals with 'double' action should reset both current_value AND target_value
runTest('Goals with "double" action should reset current_value and target_value when stream ends', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  // Store initial target
  mockAPI.db.settings.set('goal_3_initial_target', '1000');
  
  mockAPI.db.goals = [{
    id: 3,
    name: 'Follower Goal',
    goal_type: 'follower',
    on_reach_action: 'double',
    current_value: 2500,  // Reached goal and doubled
    target_value: 2000,   // Was doubled from 1000
    start_value: 0
  }];
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  eventHandlers.resetGoalsOnStreamEnd();
  
  assert.strictEqual(mockAPI.db.goals[0].current_value, 0, 'Current value should be reset to 0');
  assert.strictEqual(mockAPI.db.goals[0].target_value, 1000, 'Target value should be reset to initial 1000');
});

// Test 4: Goals with 'increment' action should reset both values
runTest('Goals with "increment" action should reset current_value and target_value when stream ends', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  mockAPI.db.settings.set('goal_4_initial_target', '500');
  
  mockAPI.db.goals = [{
    id: 4,
    name: 'Custom Goal',
    goal_type: 'custom',
    on_reach_action: 'increment',
    on_reach_increment: 100,
    current_value: 700,
    target_value: 600,  // Was incremented from 500
    start_value: 0
  }];
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  eventHandlers.resetGoalsOnStreamEnd();
  
  assert.strictEqual(mockAPI.db.goals[0].current_value, 0, 'Current value should be reset');
  assert.strictEqual(mockAPI.db.goals[0].target_value, 500, 'Target should be reset to initial');
});

// Test 5: Multiple goals of different types should all reset correctly
runTest('Multiple goals of different types should all reset correctly', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  mockAPI.db.settings.set('goal_5_initial_target', '2000');
  
  mockAPI.db.goals = [
    {
      id: 5,
      name: 'Coin Goal (hide)',
      goal_type: 'coin',
      on_reach_action: 'hide',
      current_value: 8000,
      target_value: 2000,
      start_value: 0
    },
    {
      id: 6,
      name: 'Likes Goal (reset)',
      goal_type: 'likes',
      on_reach_action: 'reset',
      current_value: 1500,
      target_value: 1000,
      start_value: 0
    },
    {
      id: 7,
      name: 'Follower Goal (double)',
      goal_type: 'follower',
      on_reach_action: 'double',
      current_value: 150,
      target_value: 100,
      start_value: 0
    }
  ];
  
  mockAPI.db.settings.set('goal_7_initial_target', '50');
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  eventHandlers.resetGoalsOnStreamEnd();
  
  // All goals should have current_value reset to 0
  assert.strictEqual(mockAPI.db.goals[0].current_value, 0, 'Hide goal should reset current_value');
  assert.strictEqual(mockAPI.db.goals[1].current_value, 0, 'Reset goal should reset current_value');
  assert.strictEqual(mockAPI.db.goals[2].current_value, 0, 'Double goal should reset current_value');
  
  // Only double/increment goals should have target_value reset
  assert.strictEqual(mockAPI.db.goals[0].target_value, 2000, 'Hide goal target should not change');
  assert.strictEqual(mockAPI.db.goals[1].target_value, 1000, 'Reset goal target should not change');
  assert.strictEqual(mockAPI.db.goals[2].target_value, 50, 'Double goal target should reset to initial');
  
  // All goals should broadcast reset
  assert.strictEqual(mockPlugin.broadcasts.length, 3, 'Should broadcast 3 resets');
});

// Test 6: Goals with non-zero start_value should reset to start_value, not 0
runTest('Goals with non-zero start_value should reset to that value', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  mockAPI.db.goals = [{
    id: 8,
    name: 'Goal with start value',
    goal_type: 'coin',
    on_reach_action: 'hide',
    current_value: 5000,
    target_value: 10000,
    start_value: 1000  // Non-zero start
  }];
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  eventHandlers.resetGoalsOnStreamEnd();
  
  assert.strictEqual(mockAPI.db.goals[0].current_value, 1000, 'Should reset to start_value of 1000, not 0');
});

// Test 7: State machine should be updated correctly
runTest('State machine should be updated to match reset goal values', () => {
  const mockPlugin = new MockPlugin();
  const mockAPI = new MockAPI();
  const mockStateMachineManager = new MockStateMachineManager();
  
  mockAPI.db.goals = [{
    id: 9,
    name: 'Test Goal',
    goal_type: 'coin',
    on_reach_action: 'hide',
    current_value: 3000,
    target_value: 1000,
    start_value: 0
  }];
  
  // Set initial machine state
  const machine = mockStateMachineManager.getMachine(9);
  machine.data.currentValue = 3000;
  machine.data.previousValue = 2000;
  
  const eventHandlers = new GoalsEventHandlers(mockPlugin);
  eventHandlers.api = mockAPI;
  eventHandlers.db = mockAPI.db;
  eventHandlers.stateMachineManager = mockStateMachineManager;
  eventHandlers.plugin = mockPlugin;
  
  eventHandlers.resetGoalsOnStreamEnd();
  
  assert.strictEqual(machine.data.currentValue, 0, 'Machine current value should be reset');
  assert.strictEqual(machine.data.previousValue, 0, 'Machine previous value should be reset');
});

// Print summary
console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed + failed}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('='.repeat(50));

if (failed === 0) {
  console.log('\n✅ All stream session reset tests passed!');
  console.log('\nVerification Results:');
  console.log('  ✓ Goals with "hide" action reset current_value on stream end');
  console.log('  ✓ Goals with "reset" action reset current_value on stream end');
  console.log('  ✓ Goals with "double" action reset both current and target values');
  console.log('  ✓ Goals with "increment" action reset both current and target values');
  console.log('  ✓ Multiple goals of different types all reset correctly');
  console.log('  ✓ Goals with non-zero start_value reset to that value');
  console.log('  ✓ State machines are updated correctly');
  console.log('\n🎯 Bug Fix Verified: Goals now correctly reset between stream sessions!');
  console.log('   This fixes the issue where overlay goals showed accumulated values');
  console.log('   from previous streams, displaying "much more coins than actually gifted".');
  process.exit(0);
} else {
  console.log(`\n❌ ${failed} test(s) failed`);
  process.exit(1);
}
