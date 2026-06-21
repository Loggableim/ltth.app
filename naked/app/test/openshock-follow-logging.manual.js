/**
 * Test: OpenShock Follow Event Logging System
 * 
 * Verifies that the logging system properly tracks follow events,
 * including successful processing and cooldown-based skipping.
 */

const assert = require('assert');

console.log('🧪 Running OpenShock Follow Event Logging System Test...\n');

const MappingEngine = require('../plugins/openshock/helpers/mappingEngine');

// Capture all log messages for analysis
const logCapture = {
    info: [],
    warn: [],
    error: [],
    debug: []
};

const logger = {
    info: (msg) => {
        logCapture.info.push(msg);
        console.log(`[INFO] ${msg}`);
    },
    warn: (msg) => {
        logCapture.warn.push(msg);
        console.log(`[WARN] ${msg}`);
    },
    error: (msg) => {
        logCapture.error.push(msg);
        console.log(`[ERROR] ${msg}`);
    },
    debug: (msg) => {
        logCapture.debug.push(msg);
        console.log(`[DEBUG] ${msg}`);
    }
};

console.log('Test Scenario: Verify comprehensive follow event logging');
console.log('Expected: Logs should contain user info, cooldown details, and event tracking\n');

// Setup
const engine = new MappingEngine(logger);

// Create follow mapping with moderate cooldown
const mapping = engine.addMapping({
    name: 'Test Follow Mapping',
    eventType: 'follow',
    enabled: true,
    conditions: {},
    action: {
        type: 'command',
        deviceId: 'device-test',
        commandType: 'vibrate',
        intensity: 50,
        duration: 2000
    },
    cooldown: {
        perUser: 30000  // 30 second cooldown
    }
});

console.log('Step 1: Processing first follow event from user...');
logCapture.info = []; // Clear logs

const followEvent1 = {
    uniqueId: 'LogTestUser',
    username: 'LogTestUser',
    nickname: 'Log Test User',
    timestamp: new Date().toISOString()
};

const matches1 = engine.evaluateEvent('follow', followEvent1);

// Verify logging for successful follow
console.log('\nStep 2: Analyzing logs for successful follow event...');
const successLogs = logCapture.info.filter(msg => 
    msg.includes('Follow event processed') &&
    msg.includes('LogTestUser') &&
    msg.includes('Cooldown set: 30000ms')
);

assert.ok(successLogs.length > 0, 'Should log successful follow event processing');
console.log(`✓ Found ${successLogs.length} success log(s)`);
console.log(`  Log: "${successLogs[0]}"`);

// Verify log contains all required information
const logMsg = successLogs[0];
assert.ok(logMsg.includes('LogTestUser'), 'Log should contain username');
assert.ok(logMsg.includes('30000ms'), 'Log should contain cooldown duration');
assert.ok(logMsg.includes('Test Follow Mapping'), 'Log should contain mapping name');
console.log('✅ Success log contains all required information\n');

// Step 3: Process duplicate follow (should be blocked by cooldown)
console.log('Step 3: Processing duplicate follow from same user...');
logCapture.info = []; // Clear logs

const followEvent2 = {
    uniqueId: 'LogTestUser',
    username: 'LogTestUser',
    nickname: 'Log Test User',
    timestamp: new Date().toISOString()
};

const matches2 = engine.evaluateEvent('follow', followEvent2);

// Verify cooldown skip logging
console.log('\nStep 4: Analyzing logs for cooldown skip...');
const cooldownLogs = logCapture.info.filter(msg => 
    msg.includes('Follow skipped') &&
    msg.includes('LogTestUser') &&
    msg.includes('Cooldown active')
);

assert.ok(cooldownLogs.length > 0, 'Should log when follow is skipped due to cooldown');
console.log(`✓ Found ${cooldownLogs.length} cooldown skip log(s)`);
console.log(`  Log: "${cooldownLogs[0]}"`);

// Verify cooldown log contains detailed information
const cooldownMsg = cooldownLogs[0];
assert.ok(cooldownMsg.includes('LogTestUser'), 'Log should contain username');
assert.ok(cooldownMsg.includes('Cooldown active'), 'Log should indicate cooldown is active');
assert.ok(cooldownMsg.includes('ms remaining'), 'Log should show remaining cooldown time');
console.log('✅ Cooldown skip log contains all required information\n');

// Step 5: Verify remaining cooldown value is reasonable
const remainingMatch = cooldownMsg.match(/\((\d+)ms remaining/);
if (remainingMatch) {
    const remainingTime = parseInt(remainingMatch[1]);
    assert.ok(remainingTime > 0, 'Remaining cooldown should be positive');
    assert.ok(remainingTime <= 30000, 'Remaining cooldown should not exceed total cooldown');
    console.log(`Step 5: Remaining cooldown validation: ${remainingTime}ms`);
    console.log('✅ Remaining cooldown time is within expected range\n');
}

// Step 6: Test getRemainingCooldown method directly
console.log('Step 6: Testing getRemainingCooldown method for logging support...');
const remaining = engine.getRemainingCooldown(mapping, 'LogTestUser', 'device-test');

assert.ok(typeof remaining === 'object', 'getRemainingCooldown should return object');
assert.ok(typeof remaining.perUser === 'number', 'perUser should be a number');
assert.ok(typeof remaining.perDevice === 'number', 'perDevice should be a number');
assert.ok(typeof remaining.global === 'number', 'global should be a number');

console.log(`✓ getRemainingCooldown returns: ${JSON.stringify(remaining)}`);
console.log('✅ getRemainingCooldown method provides detailed cooldown info\n');

// Step 7: Test with different user (no cooldown)
console.log('Step 7: Testing logging with different user (no cooldown)...');
logCapture.info = []; // Clear logs

const followEvent3 = {
    uniqueId: 'DifferentUser',
    username: 'DifferentUser',
    nickname: 'Different User',
    timestamp: new Date().toISOString()
};

const matches3 = engine.evaluateEvent('follow', followEvent3);

const differentUserLogs = logCapture.info.filter(msg => 
    msg.includes('Follow event processed') &&
    msg.includes('DifferentUser')
);

assert.ok(differentUserLogs.length > 0, 'Should log follow from different user');
console.log('✓ Different user follow is logged correctly');
console.log('✅ Logging system properly distinguishes between users\n');

// Final verification
console.log('Step 8: Verifying no error logs were generated...');
assert.strictEqual(logCapture.error.length, 0, 'Should not have any error logs');
console.log('✅ No errors occurred during logging operations\n');

// Summary
console.log('═══════════════════════════════════════════════════════');
console.log('✅ ALL LOGGING TESTS PASSED');
console.log('═══════════════════════════════════════════════════════');
console.log('\nLogging System Features Verified:');
console.log('  ✓ Successful follow events are logged with user details');
console.log('  ✓ Cooldown settings are included in success logs');
console.log('  ✓ Cooldown skips are logged at info level');
console.log('  ✓ Remaining cooldown time is logged');
console.log('  ✓ User-specific logging works correctly');
console.log('  ✓ getRemainingCooldown provides debugging data');
console.log('  ✓ No errors during normal operation');
console.log('\nThe logging system provides comprehensive follow event tracking!');
