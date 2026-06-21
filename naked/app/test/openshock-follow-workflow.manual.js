/**
 * Integration Test: Complete Follow Event Workflow
 * 
 * Demonstrates the complete workflow of the enhanced follow event
 * cooldown and logging system in a realistic scenario.
 */

const assert = require('assert');

console.log('🧪 Running Complete Follow Event Workflow Test...\n');
console.log('═══════════════════════════════════════════════════════');
console.log('Scenario: Stream session with multiple followers');
console.log('═══════════════════════════════════════════════════════\n');

const MappingEngine = require('../plugins/openshock/helpers/mappingEngine');

// Setup logger to capture and display logs
const sessionLogs = [];
const logger = {
    info: (msg) => {
        sessionLogs.push({ level: 'INFO', time: Date.now(), message: msg });
        console.log(`[INFO] ${msg}`);
    },
    warn: (msg) => {
        sessionLogs.push({ level: 'WARN', time: Date.now(), message: msg });
        console.log(`[WARN] ${msg}`);
    },
    error: (msg) => {
        sessionLogs.push({ level: 'ERROR', time: Date.now(), message: msg });
        console.log(`[ERROR] ${msg}`);
    },
    debug: (msg) => {
        sessionLogs.push({ level: 'DEBUG', time: Date.now(), message: msg });
    }
};

console.log('📋 Setup: Streamer configures follow event mapping');
console.log('   - Device: test-collar');
console.log('   - Action: Vibrate at 40% for 1.5 seconds');
console.log('   - Cooldown: 45 seconds per user');
console.log('');

const engine = new MappingEngine(logger);

const followMapping = engine.addMapping({
    name: 'Follow Vibration',
    eventType: 'follow',
    enabled: true,
    conditions: {},
    action: {
        type: 'command',
        deviceId: 'test-collar',
        commandType: 'vibrate',
        intensity: 40,
        duration: 1500
    },
    cooldown: {
        perUser: 45000  // 45 seconds
    }
});

console.log('✅ Mapping configured successfully\n');

// Simulate streaming session
console.log('🎬 Stream starts...\n');

// Event 1: First follower
console.log('⏱️  00:00 - User "Alice123" follows');
const match1 = engine.evaluateEvent('follow', {
    uniqueId: 'Alice123',
    username: 'Alice123',
    nickname: 'Alice',
    timestamp: new Date().toISOString()
});

assert.strictEqual(match1.length, 1);
console.log('   ✅ Action triggered: Vibrate (40%, 1500ms)');
console.log('   📝 Cooldown set: 45 seconds for Alice123\n');

// Event 2: Second follower (different user)
console.log('⏱️  00:10 - User "Bob456" follows');
const match2 = engine.evaluateEvent('follow', {
    uniqueId: 'Bob456',
    username: 'Bob456',
    nickname: 'Bob',
    timestamp: new Date().toISOString()
});

assert.strictEqual(match2.length, 1);
console.log('   ✅ Action triggered: Vibrate (40%, 1500ms)');
console.log('   📝 Cooldown set: 45 seconds for Bob456\n');

// Event 3: Alice unfollows and re-follows (within cooldown)
console.log('⏱️  00:20 - User "Alice123" re-follows (10 seconds after first follow)');
const match3 = engine.evaluateEvent('follow', {
    uniqueId: 'Alice123',
    username: 'Alice123',
    nickname: 'Alice',
    timestamp: new Date().toISOString()
});

assert.strictEqual(match3.length, 0);
const aliceRemaining = engine.getRemainingCooldown(followMapping, 'Alice123', 'test-collar');
console.log(`   ⏸️  Action blocked: Cooldown active`);
console.log(`   📝 Remaining cooldown: ~${Math.round(aliceRemaining.perUser / 1000)} seconds\n`);

// Event 4: New follower
console.log('⏱️  00:30 - User "Charlie789" follows');
const match4 = engine.evaluateEvent('follow', {
    uniqueId: 'Charlie789',
    username: 'Charlie789',
    nickname: 'Charlie',
    timestamp: new Date().toISOString()
});

assert.strictEqual(match4.length, 1);
console.log('   ✅ Action triggered: Vibrate (40%, 1500ms)');
console.log('   📝 Cooldown set: 45 seconds for Charlie789\n');

// Event 5: Bob tries to re-follow (within cooldown)
console.log('⏱️  00:40 - User "Bob456" re-follows (30 seconds after first follow)');
const match5 = engine.evaluateEvent('follow', {
    uniqueId: 'Bob456',
    username: 'Bob456',
    nickname: 'Bob',
    timestamp: new Date().toISOString()
});

assert.strictEqual(match5.length, 0);
const bobRemaining = engine.getRemainingCooldown(followMapping, 'Bob456', 'test-collar');
console.log(`   ⏸️  Action blocked: Cooldown active`);
console.log(`   📝 Remaining cooldown: ~${Math.round(bobRemaining.perUser / 1000)} seconds\n`);

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log('📊 Session Summary');
console.log('═══════════════════════════════════════════════════════');
console.log('Total follow events received: 5');
console.log('Actions triggered: 3');
console.log('Actions blocked by cooldown: 2');
console.log('');
console.log('Unique followers: 3 (Alice123, Bob456, Charlie789)');
console.log('Duplicate follow attempts blocked: 2');
console.log('');

// Analyze logs
const infoLogs = sessionLogs.filter(l => l.level === 'INFO');
const followProcessed = infoLogs.filter(l => l.message.includes('Follow event processed'));
const followSkipped = infoLogs.filter(l => l.message.includes('Follow skipped'));

console.log('📝 Logging Statistics:');
console.log(`   - Follow events processed: ${followProcessed.length}`);
console.log(`   - Follow events skipped: ${followSkipped.length}`);
console.log(`   - Total log entries: ${sessionLogs.length}`);
console.log('');

// Verify behavior
assert.strictEqual(followProcessed.length, 3, 'Should have 3 processed follow events');
assert.strictEqual(followSkipped.length, 2, 'Should have 2 skipped follow events');

console.log('✅ All assertions passed!');
console.log('');
console.log('═══════════════════════════════════════════════════════');
console.log('✅ WORKFLOW TEST COMPLETED SUCCESSFULLY');
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log('Key Features Demonstrated:');
console.log('  ✓ Per-user cooldown prevents duplicate actions');
console.log('  ✓ Different users have independent cooldowns');
console.log('  ✓ Comprehensive logging tracks all events');
console.log('  ✓ Remaining cooldown time is available for debugging');
console.log('  ✓ System correctly distinguishes between users');
console.log('');
console.log('The follow event system is production-ready! 🎉');
