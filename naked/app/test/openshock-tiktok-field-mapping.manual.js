/**
 * Test suite for OpenShock MappingEngine TikTok Event Field Compatibility
 * 
 * This test verifies that the MappingEngine correctly handles TikTok event data
 * which uses different field names than originally expected:
 * - uniqueId instead of userId
 * - username instead of userName
 * - teamMemberLevel instead of teamLevel
 * 
 * This compatibility is critical for gift event recognition to work properly
 * with whitelists, blacklists, team level filters, and per-user cooldowns.
 */

const assert = require('assert');
const path = require('path');

console.log('🧪 Running OpenShock TikTok Field Mapping Tests...\n');

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

// Load the MappingEngine
const MappingEngine = require('../plugins/openshock/helpers/mappingEngine');

// Create a silent logger for tests
const silentLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

// Test 1: Whitelist filtering with uniqueId field (TikTok format)
runTest('Whitelist filtering works with uniqueId field', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'Whitelist Test',
        eventType: 'gift',
        enabled: true,
        conditions: {
            giftName: 'Rose',
            whitelist: ['testuser']
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        }
    });
    
    // Event with TikTok format (uniqueId instead of userId)
    const tiktokEvent = {
        uniqueId: 'testuser',
        username: 'testuser',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    const matches = engine.evaluateEvent('gift', tiktokEvent);
    assert(matches.length > 0, 'Whitelist should match user with uniqueId field');
});

// Test 2: Whitelist filtering with username field (TikTok format)
runTest('Whitelist filtering works with username field', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'Whitelist by Username',
        eventType: 'gift',
        enabled: true,
        conditions: {
            giftName: 'Rose',
            whitelist: ['testuser']  // Match by username
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        }
    });
    
    const tiktokEvent = {
        uniqueId: 'user123',
        username: 'testuser',  // This should match the whitelist
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    const matches = engine.evaluateEvent('gift', tiktokEvent);
    assert(matches.length > 0, 'Whitelist should match by username field');
});

// Test 3: Blacklist filtering with uniqueId field (TikTok format)
runTest('Blacklist filtering works with uniqueId field', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'Blacklist Test',
        eventType: 'gift',
        enabled: true,
        conditions: {
            giftName: 'Rose',
            blacklist: ['baduser']
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        }
    });
    
    // Blacklisted user
    const blacklistedEvent = {
        uniqueId: 'baduser',
        username: 'baduser',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    let matches = engine.evaluateEvent('gift', blacklistedEvent);
    assert(matches.length === 0, 'Blacklist should block user with uniqueId');
    
    // Non-blacklisted user
    const allowedEvent = {
        uniqueId: 'gooduser',
        username: 'gooduser',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    matches = engine.evaluateEvent('gift', allowedEvent);
    assert(matches.length > 0, 'Blacklist should allow non-blacklisted user');
});

// Test 4: Team level filtering with teamMemberLevel field (TikTok format)
runTest('Team level filtering works with teamMemberLevel field', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'Team Level Test',
        eventType: 'gift',
        enabled: true,
        conditions: {
            giftName: 'Rose',
            teamLevelMin: 3
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        }
    });
    
    // High team level (should match)
    const highTeamEvent = {
        uniqueId: 'teamuser',
        username: 'teamuser',
        giftName: 'Rose',
        coins: 1,
        teamMemberLevel: 5,  // TikTok uses teamMemberLevel
        isStreakEnd: true
    };
    
    let matches = engine.evaluateEvent('gift', highTeamEvent);
    assert(matches.length > 0, 'Should allow team level 5 when minimum is 3');
    
    // Low team level (should not match)
    const lowTeamEvent = {
        uniqueId: 'lowteamuser',
        username: 'lowteamuser',
        giftName: 'Rose',
        coins: 1,
        teamMemberLevel: 1,  // Below minimum
        isStreakEnd: true
    };
    
    matches = engine.evaluateEvent('gift', lowTeamEvent);
    assert(matches.length === 0, 'Should block team level 1 when minimum is 3');
});

// Test 5: Per-user cooldown with uniqueId tracking (TikTok format)
runTest('Per-user cooldown works with uniqueId tracking', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'Cooldown Test',
        eventType: 'gift',
        enabled: true,
        conditions: {
            giftName: 'Rose'
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        },
        cooldown: {
            perUser: 5000  // 5 second cooldown per user
        }
    });
    
    const user1Event = {
        uniqueId: 'user1',
        username: 'user1',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    const user2Event = {
        uniqueId: 'user2',
        username: 'user2',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    // First event from user1 should match
    let matches = engine.evaluateEvent('gift', user1Event);
    assert(matches.length > 0, 'First event should match');
    
    // Immediate second event from user1 should be blocked by cooldown
    matches = engine.evaluateEvent('gift', user1Event);
    assert(matches.length === 0, 'Cooldown should block second event from same user');
    
    // Event from different user should not be affected
    matches = engine.evaluateEvent('gift', user2Event);
    assert(matches.length > 0, 'Different user should not be affected by cooldown');
});

// Test 6: Gift name matching still works with new field format
runTest('Gift name matching works with TikTok event format', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'Rose Gift',
        eventType: 'gift',
        enabled: true,
        conditions: {
            giftName: 'Rose'
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        }
    });
    
    const roseEvent = {
        uniqueId: 'user1',
        username: 'user1',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    const lilyEvent = {
        uniqueId: 'user1',
        username: 'user1',
        giftName: 'Lily',
        coins: 1,
        isStreakEnd: true
    };
    
    let matches = engine.evaluateEvent('gift', roseEvent);
    assert(matches.length > 0, 'Rose gift should match');
    
    matches = engine.evaluateEvent('gift', lilyEvent);
    assert(matches.length === 0, 'Lily gift should not match Rose mapping');
});

// Test 7: Coin filtering still works
runTest('Coin filtering works with TikTok event format', () => {
    const engine = new MappingEngine(silentLogger);
    
    engine.addMapping({
        name: 'High Value Gifts',
        eventType: 'gift',
        enabled: true,
        conditions: {
            minCoins: 100
        },
        action: {
            type: 'command',
            deviceId: 'device-1',
            commandType: 'vibrate',
            intensity: 50,
            duration: 1000
        }
    });
    
    const highValueEvent = {
        uniqueId: 'user1',
        username: 'user1',
        giftName: 'Dragon',
        coins: 200,  // TikTok uses coins field
        isStreakEnd: true
    };
    
    const lowValueEvent = {
        uniqueId: 'user2',
        username: 'user2',
        giftName: 'Rose',
        coins: 1,
        isStreakEnd: true
    };
    
    let matches = engine.evaluateEvent('gift', highValueEvent);
    assert(matches.length > 0, 'High value gift should match');
    
    matches = engine.evaluateEvent('gift', lowValueEvent);
    assert(matches.length === 0, 'Low value gift should not match');
});

// Print summary
console.log(`\n📊 Test Summary: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    process.exit(1);
}
