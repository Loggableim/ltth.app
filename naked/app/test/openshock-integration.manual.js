/**
 * Integration test: Simulate complete gift event flow
 * TikTok Connector -> OpenShock Plugin -> MappingEngine
 * 
 * This verifies that the field name fix resolves the actual user-reported issue.
 */

const assert = require('assert');
const path = require('path');

console.log('🧪 Running OpenShock Integration Test (Gift Event Flow)...\n');

const MappingEngine = require('../plugins/openshock/helpers/mappingEngine');

// Silent logger
const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

console.log('Scenario: User creates a whitelist mapping for specific TikTok users');
console.log('Expected: Gifts from whitelisted users should trigger OpenShock actions\n');

// Step 1: User creates a mapping in OpenShock UI with whitelist
console.log('Step 1: Creating mapping with whitelist for user "VIPUser123"...');
const engine = new MappingEngine(logger);

const mapping = engine.addMapping({
    name: 'VIP Rose Gift Mapping',
    eventType: 'gift',
    enabled: true,
    conditions: {
        giftName: 'Rose',
        whitelist: ['VIPUser123'],  // Only VIP users
        minCoins: 1
    },
    action: {
        type: 'command',
        deviceId: 'openshock-device-1',
        commandType: 'vibrate',
        intensity: 50,
        duration: 1000
    }
});

console.log(`✓ Mapping created: ${mapping.name} (ID: ${mapping.id})`);

// Step 2: TikTok LIVE stream receives a gift from VIPUser123
console.log('\nStep 2: TikTok stream receives Rose gift from VIPUser123...');

// This is the EXACT format that TikTok connector sends (from tiktok.js lines 698-715)
const tiktokGiftEventFromVIP = {
    uniqueId: 'VIPUser123',       // TikTok uses uniqueId
    username: 'VIPUser123',       // TikTok uses username (lowercase)
    nickname: 'VIP User 123',
    giftName: 'Rose',
    giftId: 5655,
    giftPictureUrl: 'https://p16-webcast.tiktokcdn.com/img/gift/5655.png',
    repeatCount: 1,
    diamondCount: 1,
    coins: 1,                      // TikTok uses coins
    totalCoins: 100,
    isStreakEnd: true,
    giftType: 0,
    teamMemberLevel: 0,           // TikTok uses teamMemberLevel
    isModerator: false,
    isSubscriber: false,
    timestamp: new Date().toISOString()
};

console.log('Gift event data:', JSON.stringify({
    user: tiktokGiftEventFromVIP.uniqueId,
    gift: tiktokGiftEventFromVIP.giftName,
    coins: tiktokGiftEventFromVIP.coins
}, null, 2));

// Step 3: OpenShock plugin evaluates the event
console.log('\nStep 3: OpenShock plugin evaluating event against mappings...');
const matches = engine.evaluateEvent('gift', tiktokGiftEventFromVIP);

console.log(`✓ Found ${matches.length} matching mapping(s)`);

if (matches.length > 0) {
    console.log('\n✅ SUCCESS: Gift from whitelisted user was recognized!');
    matches.forEach(match => {
        console.log(`   - Mapping: ${match.mapping.name}`);
        console.log(`   - Action: ${match.action.commandType} (${match.action.intensity}%, ${match.action.duration}ms)`);
        console.log(`   - Device: ${match.action.deviceId}`);
    });
} else {
    console.log('\n❌ FAILURE: Gift from whitelisted user was NOT recognized!');
    console.log('   This would be the bug the user reported.');
    throw new Error('Whitelisted user gift not recognized');
}

// Step 4: Verify non-whitelisted user is blocked
console.log('\nStep 4: Testing that non-whitelisted users are blocked...');

const tiktokGiftEventFromNonVIP = {
    uniqueId: 'RegularUser456',
    username: 'RegularUser456',
    nickname: 'Regular User',
    giftName: 'Rose',
    giftId: 5655,
    coins: 1,
    isStreakEnd: true,
    teamMemberLevel: 0
};

const matchesNonVIP = engine.evaluateEvent('gift', tiktokGiftEventFromNonVIP);

if (matchesNonVIP.length === 0) {
    console.log('✅ PASS: Non-whitelisted user correctly blocked');
} else {
    console.log('❌ FAIL: Non-whitelisted user was not blocked!');
    throw new Error('Whitelist filtering not working correctly');
}

// Step 5: Test blacklist scenario
console.log('\nStep 5: Testing blacklist functionality...');

const blacklistMapping = engine.addMapping({
    name: 'Block Trolls',
    eventType: 'gift',
    enabled: true,
    conditions: {
        blacklist: ['TrollUser999']
    },
    action: {
        type: 'command',
        deviceId: 'openshock-device-1',
        commandType: 'vibrate',
        intensity: 50,
        duration: 1000
    }
});

const tiktokGiftEventFromTroll = {
    uniqueId: 'TrollUser999',
    username: 'TrollUser999',
    giftName: 'Rose',
    coins: 1,
    isStreakEnd: true
};

const matchesTroll = engine.evaluateEvent('gift', tiktokGiftEventFromTroll);

if (matchesTroll.length === 0) {
    console.log('✅ PASS: Blacklisted user correctly blocked');
} else {
    console.log('❌ FAIL: Blacklisted user was not blocked!');
    throw new Error('Blacklist filtering not working');
}

console.log('\n═══════════════════════════════════════════════════════');
console.log('✅ ALL INTEGRATION TESTS PASSED');
console.log('═══════════════════════════════════════════════════════');
console.log('\nThe fix successfully resolves the reported issue:');
console.log('OpenShock plugin now correctly recognizes gifts from the');
console.log('Live Event Log when using whitelists, blacklists, and');
console.log('other user-based filtering features.');
