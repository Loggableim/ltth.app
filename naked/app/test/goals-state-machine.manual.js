/**
 * Test suite for Goals Plugin State Machine
 * Tests the multi-milestone catch-up behavior for like goals
 */

const assert = require('assert');

console.log('🧪 Running Goals State Machine Tests...\n');

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

// Load the state machine
const { GoalStateMachine, STATES, EVENTS } = require('../plugins/goals/engine/state-machine');

/**
 * Helper to complete the full animation cycle when goal is reached
 * The state machine requires: UPDATING -> ANIMATING_UPDATE -> REACHED -> ANIMATING_REACH -> PROCESSING_REACH
 */
function completeReachAnimation(machine) {
    if (machine.getState() === STATES.ANIMATING_UPDATE) {
        machine.onUpdateAnimationEnd();
    }
    if (machine.getState() === STATES.ANIMATING_REACH) {
        machine.onReachAnimationEnd();
    }
}

// Test: Increment action calculates correct target when value exceeds multiple milestones
runTest('Increment action: catches up to correct target when connecting late', () => {
    const machine = new GoalStateMachine('test-goal-1');
    
    // Scenario: Goal is target=1000, increment=1000
    // Tool connects when stream already has 10002 likes
    machine.initialize({
        current_value: 0,
        target_value: 1000,
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 1000
    });

    let newTargetFromEvent = null;
    machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
        newTargetFromEvent = data.newTarget;
    });

    // Update value to 10002 (simulating late connection to stream)
    machine.updateValue(10002, true);
    completeReachAnimation(machine);

    // The goal should be reached and behavior applied
    // Target should be incremented to 11000 (next milestone after 10002)
    assert.strictEqual(newTargetFromEvent, 11000, 
        `Expected target to be 11000, got ${newTargetFromEvent}`);
    assert.strictEqual(machine.data.targetValue, 11000,
        `Expected machine targetValue to be 11000, got ${machine.data.targetValue}`);
});

// Test: Increment action works correctly for single milestone reach
runTest('Increment action: single milestone reach works correctly', () => {
    const machine = new GoalStateMachine('test-goal-2');
    
    machine.initialize({
        current_value: 0,
        target_value: 1000,
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 1000
    });

    let newTargetFromEvent = null;
    machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
        newTargetFromEvent = data.newTarget;
    });

    // Update value to exactly 1000
    machine.updateValue(1000, true);
    completeReachAnimation(machine);

    // Target should be incremented to 2000
    assert.strictEqual(newTargetFromEvent, 2000, 
        `Expected target to be 2000, got ${newTargetFromEvent}`);
});

// Test: Double action catches up correctly when value exceeds multiple milestones
runTest('Double action: catches up to correct target when connecting late', () => {
    const machine = new GoalStateMachine('test-goal-3');
    
    // Scenario: Goal is target=1000, action=double
    // Tool connects when stream already has 5000 likes
    machine.initialize({
        current_value: 0,
        target_value: 1000,
        start_value: 0,
        on_reach_action: 'double',
        on_reach_increment: 0
    });

    let newTargetFromEvent = null;
    machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
        newTargetFromEvent = data.newTarget;
    });

    // Update value to 5000
    machine.updateValue(5000, true);
    completeReachAnimation(machine);

    // Target should be doubled until it exceeds 5000
    // 1000 -> 2000 -> 4000 -> 8000
    assert.strictEqual(newTargetFromEvent, 8000, 
        `Expected target to be 8000, got ${newTargetFromEvent}`);
});

// Test: Value exactly at target works correctly
runTest('Increment action: value exactly at multiple of increment works', () => {
    const machine = new GoalStateMachine('test-goal-4');
    
    machine.initialize({
        current_value: 0,
        target_value: 1000,
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 1000
    });

    let newTargetFromEvent = null;
    machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
        newTargetFromEvent = data.newTarget;
    });

    // Update value to exactly 5000
    machine.updateValue(5000, true);
    completeReachAnimation(machine);

    // Target should be 6000 (next milestone after 5000)
    assert.strictEqual(newTargetFromEvent, 6000, 
        `Expected target to be 6000, got ${newTargetFromEvent}`);
});

// Test: Normal incremental updates still work
runTest('Increment action: normal incremental updates work correctly', () => {
    const machine = new GoalStateMachine('test-goal-5');
    
    machine.initialize({
        current_value: 0,
        target_value: 1000,
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 500
    });

    let reachBehaviorCount = 0;
    let lastTarget = null;
    machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
        reachBehaviorCount++;
        lastTarget = data.newTarget;
    });

    // Update value gradually - not reaching target yet
    machine.updateValue(500, true);
    completeReachAnimation(machine);
    assert.strictEqual(reachBehaviorCount, 0, 'Should not trigger reach behavior at 500');
    
    // Now reach the target
    machine.updateValue(1000, true);
    completeReachAnimation(machine);
    assert.strictEqual(reachBehaviorCount, 1, 'Should trigger reach behavior at 1000');
    assert.strictEqual(lastTarget, 1500, 'Target should be 1500 after first reach');
    
    // Reach next milestone
    machine.updateValue(1500, true);
    completeReachAnimation(machine);
    assert.strictEqual(reachBehaviorCount, 2, 'Should trigger reach behavior at 1500');
    assert.strictEqual(lastTarget, 2000, 'Target should be 2000 after second reach');
});

// Test: Edge case - very large jump
runTest('Increment action: handles very large value jumps', () => {
    const machine = new GoalStateMachine('test-goal-6');
    
    machine.initialize({
        current_value: 0,
        target_value: 100,
        start_value: 0,
        on_reach_action: 'increment',
        on_reach_increment: 100
    });

    let newTargetFromEvent = null;
    machine.on(EVENTS.REACH_BEHAVIOR_APPLIED, (data) => {
        newTargetFromEvent = data.newTarget;
    });

    // Update value to 1000050 (simulating very late connection)
    machine.updateValue(1000050, true);
    completeReachAnimation(machine);

    // Target should be the next 100 milestone after 1000050 = 1000100
    assert.strictEqual(newTargetFromEvent, 1000100, 
        `Expected target to be 1000100, got ${newTargetFromEvent}`);
});

// Print results
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) {
    process.exit(1);
}
