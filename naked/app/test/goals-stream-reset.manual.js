/**
 * Test suite for Goals Plugin Stream Reset Behavior
 * Tests that goals reset to their initial target values after stream ends
 */

const assert = require('assert');
const path = require('path');

console.log('🧪 Running Goals Stream Reset Tests...\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
    try {
        fn();
        console.log(`✓ ${name}`);
        passed++;
    } catch (error) {
        console.error(`✗ ${name}`);
        console.error(`  Error: ${error.message}`);
        failed++;
    }
}

// Mock database for testing
class MockDatabase {
    constructor() {
        this.settings = new Map();
    }

    getSetting(key) {
        return this.settings.get(key) || null;
    }

    setSetting(key, value) {
        this.settings.set(key, value);
    }
}

// Mock API
class MockAPI {
    constructor() {
        this.db = new MockDatabase();
        this.logs = [];
    }

    getDatabase() {
        return this.db;
    }

    log(message, level = 'info') {
        this.logs.push({ message, level });
    }
}

// Mock state machine manager
class MockStateMachineManager {
    constructor() {
        this.machines = new Map();
    }

    getMachine(goalId) {
        if (!this.machines.has(goalId)) {
            this.machines.set(goalId, {
                goalId,
                data: {
                    currentValue: 0,
                    targetValue: 1000,
                    previousValue: 0
                },
                updateValue(value, broadcast) {
                    this.data.currentValue = value;
                    this.data.previousValue = value;
                }
            });
        }
        return this.machines.get(goalId);
    }
}

// Mock goals database
class MockGoalsDatabase {
    constructor() {
        this.goals = new Map();
    }

    getAllGoals() {
        return Array.from(this.goals.values());
    }

    getGoal(id) {
        return this.goals.get(id);
    }

    updateGoal(id, updates) {
        const goal = this.goals.get(id);
        if (!goal) throw new Error(`Goal ${id} not found`);
        
        Object.assign(goal, updates);
        return goal;
    }

    createTestGoal(id, config) {
        const goal = {
            id,
            name: config.name || 'Test Goal',
            goal_type: config.goal_type || 'likes',
            enabled: 1,
            current_value: config.current_value || 0,
            target_value: config.target_value || 1000,
            start_value: config.start_value || 0,
            on_reach_action: config.on_reach_action || 'increment',
            on_reach_increment: config.on_reach_increment || 1000,
            template_id: 'compact-bar',
            animation_on_update: 'smooth-progress',
            animation_on_reach: 'celebration',
            theme_json: null,
            overlay_width: 500,
            overlay_height: 100
        };
        this.goals.set(id, goal);
        return goal;
    }
}

// Mock plugin
class MockPlugin {
    constructor() {
        this.api = new MockAPI();
        this.db = new MockGoalsDatabase();
        this.stateMachineManager = new MockStateMachineManager();
        this.resetBroadcasts = [];
    }

    broadcastGoalReset(goal) {
        this.resetBroadcasts.push(goal);
    }
}

// Load the event handlers
const GoalsEventHandlers = require('../plugins/goals/backend/event-handlers');

// Test 1: Reset goal with increment behavior to initial target
runTest('resetGoalsOnStreamEnd: Resets increment goal to initial target', () => {
    const plugin = new MockPlugin();
    const handlers = new GoalsEventHandlers(plugin);

    // Create a goal with increment behavior
    const goal = plugin.db.createTestGoal('goal_1', {
        name: 'Like Goal',
        goal_type: 'likes',
        current_value: 8000,
        target_value: 8000,  // Has been incremented from 1000 to 8000
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 1000
    });

    // Simulate that the initial target was 1000
    plugin.api.db.setSetting('goal_goal_1_initial_target', '1000');

    // Call resetGoalsOnStreamEnd
    handlers.resetGoalsOnStreamEnd();

    // Verify current_value was reset to start_value (0)
    assert.strictEqual(goal.current_value, 0, 
        `Expected current_value to be 0, got ${goal.current_value}`);

    // Verify target_value was reset to initial target (1000)
    assert.strictEqual(goal.target_value, 1000,
        `Expected target_value to be reset to 1000, got ${goal.target_value}`);

    // Verify state machine was updated
    const machine = plugin.stateMachineManager.getMachine('goal_1');
    assert.strictEqual(machine.data.currentValue, 0,
        `Expected machine currentValue to be 0, got ${machine.data.currentValue}`);
    assert.strictEqual(machine.data.targetValue, 1000,
        `Expected machine targetValue to be 1000, got ${machine.data.targetValue}`);

    // Verify broadcast was called
    assert.strictEqual(plugin.resetBroadcasts.length, 1,
        `Expected 1 reset broadcast, got ${plugin.resetBroadcasts.length}`);
});

// Test 2: Reset goal with double behavior to initial target
runTest('resetGoalsOnStreamEnd: Resets double goal to initial target', () => {
    const plugin = new MockPlugin();
    const handlers = new GoalsEventHandlers(plugin);

    // Create a goal with double behavior
    const goal = plugin.db.createTestGoal('goal_2', {
        name: 'Follower Goal',
        goal_type: 'follower',
        current_value: 150,
        target_value: 128,  // Has been doubled from initial target
        start_value: 0,
        on_reach_action: 'double',
        on_reach_increment: 0
    });

    // Simulate that the initial target was 10
    plugin.api.db.setSetting('goal_goal_2_initial_target', '10');

    // Call resetGoalsOnStreamEnd
    handlers.resetGoalsOnStreamEnd();

    // Verify current_value was reset
    assert.strictEqual(goal.current_value, 0,
        `Expected current_value to be 0, got ${goal.current_value}`);

    // Verify target_value was reset to initial target (10)
    assert.strictEqual(goal.target_value, 10,
        `Expected target_value to be reset to 10, got ${goal.target_value}`);
});

// Test 3: Goal without initial target stored (legacy goal)
runTest('resetGoalsOnStreamEnd: Handles legacy goals without stored initial target', () => {
    const plugin = new MockPlugin();
    const handlers = new GoalsEventHandlers(plugin);

    // Create a goal with increment behavior but no stored initial target
    const goal = plugin.db.createTestGoal('goal_3', {
        name: 'Legacy Goal',
        goal_type: 'likes',
        current_value: 5000,
        target_value: 5000,
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 1000
    });

    // Don't set initial target (simulating legacy goal)

    // Call resetGoalsOnStreamEnd
    handlers.resetGoalsOnStreamEnd();

    // For legacy goals, it should use current target_value as initial and store it
    assert.strictEqual(goal.target_value, 5000,
        `Expected target_value to remain at 5000 for legacy goal, got ${goal.target_value}`);

    // Verify it stored the initial target for future use
    const storedTarget = plugin.api.db.getSetting('goal_goal_3_initial_target');
    assert.strictEqual(storedTarget, '5000',
        `Expected initial target to be stored as '5000', got '${storedTarget}'`);
});

// Test 4: Goals with 'hide' behavior should not be reset
runTest('resetGoalsOnStreamEnd: Does not reset goals with hide behavior', () => {
    const plugin = new MockPlugin();
    const handlers = new GoalsEventHandlers(plugin);

    // Create a goal with hide behavior
    const goal = plugin.db.createTestGoal('goal_4', {
        name: 'Hide Goal',
        goal_type: 'custom',
        current_value: 100,
        target_value: 100,
        start_value: 0,
        on_reach_action: 'hide',
        on_reach_increment: 0
    });

    const originalCurrent = goal.current_value;
    const originalTarget = goal.target_value;

    // Call resetGoalsOnStreamEnd
    handlers.resetGoalsOnStreamEnd();

    // Verify goal was not reset
    assert.strictEqual(goal.current_value, originalCurrent,
        `Expected current_value to remain ${originalCurrent}, got ${goal.current_value}`);
    assert.strictEqual(goal.target_value, originalTarget,
        `Expected target_value to remain ${originalTarget}, got ${goal.target_value}`);

    // Verify no broadcast was called
    assert.strictEqual(plugin.resetBroadcasts.length, 0,
        `Expected 0 reset broadcasts for hide goals, got ${plugin.resetBroadcasts.length}`);
});

// Test 5: Multiple goals with mixed behaviors
runTest('resetGoalsOnStreamEnd: Handles multiple goals correctly', () => {
    const plugin = new MockPlugin();
    const handlers = new GoalsEventHandlers(plugin);

    // Create increment goal
    const goal1 = plugin.db.createTestGoal('goal_5a', {
        name: 'Likes',
        current_value: 3000,
        target_value: 3000,
        on_reach_action: 'increment',
        on_reach_increment: 500
    });
    plugin.api.db.setSetting('goal_goal_5a_initial_target', '500');

    // Create double goal
    const goal2 = plugin.db.createTestGoal('goal_5b', {
        name: 'Followers',
        current_value: 80,
        target_value: 64,
        on_reach_action: 'double'
    });
    plugin.api.db.setSetting('goal_goal_5b_initial_target', '5');

    // Create hide goal (should not be reset)
    const goal3 = plugin.db.createTestGoal('goal_5c', {
        name: 'Special',
        current_value: 50,
        target_value: 100,
        on_reach_action: 'hide'
    });

    // Call resetGoalsOnStreamEnd
    handlers.resetGoalsOnStreamEnd();

    // Verify increment goal reset
    assert.strictEqual(goal1.target_value, 500);
    assert.strictEqual(goal1.current_value, 0);

    // Verify double goal reset
    assert.strictEqual(goal2.target_value, 5);
    assert.strictEqual(goal2.current_value, 0);

    // Verify hide goal not reset
    assert.strictEqual(goal3.target_value, 100);
    assert.strictEqual(goal3.current_value, 50);

    // Verify correct number of broadcasts
    assert.strictEqual(plugin.resetBroadcasts.length, 2,
        `Expected 2 reset broadcasts, got ${plugin.resetBroadcasts.length}`);
});

// Print results
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
    process.exit(1);
}
