/**
 * Test: OpenShock Follow Event Cooldown and Logging
 * 
 * Verifies that follow events respect per-user cooldowns to prevent
 * duplicate shocks when users follow, unfollow, and re-follow.
 */

const assert = require('assert');

console.log('🧪 Running OpenShock Follow Event Cooldown Test...\n');

const MappingEngine = require('../plugins/openshock/helpers/mappingEngine');

// Logger that captures log messages for verification
const logMessages = [];
const logger = {
    info: (msg) => {
        logMessages.push({ level: 'info', message: msg });
        console.log(`[INFO] ${msg}`);
    },
    warn: (msg) => {
        logMessages.push({ level: 'warn', message: msg });
        console.log(`[WARN] ${msg}`);
    },
    error: (msg) => {
        logMessages.push({ level: 'error', message: msg });
        console.log(`[ERROR] ${msg}`);
    },
    debug: (msg) => {
        logMessages.push({ level: 'debug', message: msg });
        console.log(`[DEBUG] ${msg}`);
    }
};

// Test Scenario: Follow event with per-user cooldown
console.log('Scenario: User follows, unfollows, and re-follows quickly');
console.log('Expected: First follow triggers action, second follow is blocked by cooldown\n');

// Step 1: Create a mapping with per-user cooldown for follow events
console.log('Step 1: Creating follow mapping with 60-second per-user cooldown...');
const engine = new MappingEngine(logger);

const followMapping = engine.addMapping({
    name: 'Follow Shock Mapping',
    eventType: 'follow',
    enabled: true,
    conditions: {
        // No specific conditions - all followers trigger this
    },
    action: {
        type: 'command',
        deviceId: 'test-device-1',
        commandType: 'vibrate',
        intensity: 30,
        duration: 1000
    },
    cooldown: {
        global: 0,
        perDevice: 0,
        perUser: 60000  // 60 seconds per-user cooldown
    }
});

console.log(`✓ Mapping created: ${followMapping.name} (ID: ${followMapping.id})`);
console.log(`  Per-user cooldown: ${followMapping.cooldown.perUser}ms\n`);

// Step 2: User follows (first time)
console.log('Step 2: User "TestFollower" follows for the first time...');
const followEvent1 = {
    uniqueId: 'TestFollower123',
    username: 'TestFollower123',
    nickname: 'Test Follower',
    timestamp: new Date().toISOString()
};

const matches1 = engine.evaluateEvent('follow', followEvent1);
console.log(`✓ First follow: ${matches1.length} mapping(s) matched`);

assert.strictEqual(matches1.length, 1, 'First follow should match the mapping');
console.log('✅ First follow correctly triggered the mapping\n');

// Step 3: Same user re-follows immediately (within cooldown period)
console.log('Step 3: Same user re-follows 5 seconds later (within 60s cooldown)...');
// Simulate 5 seconds passing (but still within 60s cooldown)
const followEvent2 = {
    uniqueId: 'TestFollower123',
    username: 'TestFollower123',
    nickname: 'Test Follower',
    timestamp: new Date(Date.now() + 5000).toISOString()
};

// Clear previous log messages
logMessages.length = 0;

const matches2 = engine.evaluateEvent('follow', followEvent2);
console.log(`✓ Second follow (within cooldown): ${matches2.length} mapping(s) matched`);

assert.strictEqual(matches2.length, 0, 'Second follow within cooldown should NOT match');
console.log('✅ Second follow correctly blocked by cooldown\n');

// Step 4: Verify cooldown logging
console.log('Step 4: Verifying cooldown logging...');
const cooldownLogs = logMessages.filter(log => 
    log.message.includes('Follow skipped') && 
    log.message.includes('Cooldown active')
);

assert.ok(cooldownLogs.length > 0, 'Should have logged the cooldown skip');
console.log(`✓ Found ${cooldownLogs.length} cooldown log message(s)`);
console.log(`  Example: "${cooldownLogs[0].message}"`);
console.log('✅ Cooldown logging is working\n');

// Step 5: Test that cooldown is user-specific
console.log('Step 5: Testing that cooldown is user-specific...');
const followEvent3 = {
    uniqueId: 'DifferentUser456',
    username: 'DifferentUser456',
    nickname: 'Different User',
    timestamp: new Date().toISOString()
};

const matches3 = engine.evaluateEvent('follow', followEvent3);
console.log(`✓ Different user follow: ${matches3.length} mapping(s) matched`);

assert.strictEqual(matches3.length, 1, 'Different user should not be affected by first user\'s cooldown');
console.log('✅ Cooldown is correctly user-specific\n');

// Step 6: Test getRemainingCooldown method
console.log('Step 6: Testing getRemainingCooldown method...');
const remaining = engine.getRemainingCooldown(
    followMapping,
    'TestFollower123',
    'test-device-1'
);

console.log(`✓ Remaining cooldown for TestFollower123: ${remaining.perUser}ms`);
assert.ok(remaining.perUser > 0, 'Remaining cooldown should be greater than 0');
assert.ok(remaining.perUser <= 60000, 'Remaining cooldown should be less than or equal to 60s');
console.log('✅ getRemainingCooldown method works correctly\n');

// Step 7: Test cooldown expiry (simulate time passing)
console.log('Step 7: Testing cooldown expiry...');
console.log('  Simulating cooldown expiry by directly manipulating timestamps...');

// Manually clear the cooldown (simulating time passing)
const cooldownKey = `${followMapping.id}:TestFollower123`;
const oldTimestamp = engine.cooldowns.perUser.get(cooldownKey);
const expiredTimestamp = oldTimestamp - 61000; // Move timestamp back 61 seconds
engine.cooldowns.perUser.set(cooldownKey, expiredTimestamp);

const followEvent4 = {
    uniqueId: 'TestFollower123',
    username: 'TestFollower123',
    nickname: 'Test Follower',
    timestamp: new Date().toISOString()
};

const matches4 = engine.evaluateEvent('follow', followEvent4);
console.log(`✓ Follow after cooldown expiry: ${matches4.length} mapping(s) matched`);

assert.strictEqual(matches4.length, 1, 'Follow after cooldown expiry should match again');
console.log('✅ Cooldown correctly expires and allows subsequent follows\n');

// Final summary
console.log('═══════════════════════════════════════════════════════');
console.log('✅ ALL TESTS PASSED');
console.log('═══════════════════════════════════════════════════════');
console.log('\nSummary:');
console.log('  ✓ First follow correctly triggers action');
console.log('  ✓ Second follow within cooldown is blocked');
console.log('  ✓ Cooldown logging provides detailed information');
console.log('  ✓ Cooldown is user-specific (not global)');
console.log('  ✓ getRemainingCooldown method works');
console.log('  ✓ Cooldown expires correctly');
console.log('\nThe follow event cooldown system is working as expected!');
