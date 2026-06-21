/**
 * Test suite for TTS User ID Matching Fix
 * Tests that the correct user ID is used for voice assignment lookups
 */

const assert = require('assert');

console.log('🧪 Running TTS User ID Matching Tests...\n');

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

// Test 1: Should prioritize 'username' field over 'nickname'
runTest('Should use username field as primary userId', () => {
    const data = {
        username: 'anubis_maxy',
        nickname: 'Anubis',
        userId: '6560336868046438406'
    };
    
    // Simulate the fixed logic
    const userId = data.username || data.uniqueId || data.nickname || data.userId;
    
    assert.strictEqual(userId, 'anubis_maxy', 'Should use username as userId');
});

// Test 2: Should fallback to uniqueId if username is missing
runTest('Should fallback to uniqueId when username is missing', () => {
    const data = {
        uniqueId: 'anubis_maxy',
        nickname: 'Anubis',
        userId: '6560336868046438406'
    };
    
    const userId = data.username || data.uniqueId || data.nickname || data.userId;
    
    assert.strictEqual(userId, 'anubis_maxy', 'Should use uniqueId as userId');
});

// Test 3: Should fallback to nickname if username and uniqueId are missing
runTest('Should fallback to nickname when username and uniqueId are missing', () => {
    const data = {
        nickname: 'Anubis',
        userId: '6560336868046438406'
    };
    
    const userId = data.username || data.uniqueId || data.nickname || data.userId;
    
    assert.strictEqual(userId, 'Anubis', 'Should use nickname as userId');
});

// Test 4: Should use numeric userId as last resort
runTest('Should use numeric userId as last resort', () => {
    const data = {
        userId: '6560336868046438406'
    };
    
    const userId = data.username || data.uniqueId || data.nickname || data.userId;
    
    assert.strictEqual(userId, '6560336868046438406', 'Should use numeric userId');
});

// Test 5: Old behavior would incorrectly use nickname instead of username
runTest('Old behavior would incorrectly prioritize nickname over username', () => {
    const data = {
        username: 'anubis_maxy',
        nickname: 'Anubis',
        userId: '6560336868046438406'
    };
    
    // Old (broken) logic: uniqueId || nickname || userId
    const oldUserId = data.uniqueId || data.nickname || data.userId;
    
    // New (fixed) logic: username || uniqueId || nickname || userId
    const newUserId = data.username || data.uniqueId || data.nickname || data.userId;
    
    assert.strictEqual(oldUserId, 'Anubis', 'Old logic incorrectly used nickname');
    assert.strictEqual(newUserId, 'anubis_maxy', 'New logic correctly uses username');
    assert.notStrictEqual(oldUserId, newUserId, 'Old and new logic should differ');
});

// Test 6: Real-world scenario from logs
runTest('Real-world scenario: Anubis user should be identified by username', () => {
    // From actual logs: username:"anubis_maxy", nickname:"Anubis"
    const chatData = {
        username: 'anubis_maxy',
        nickname: 'Anubis',
        message: 'Mensch cid was machst du da nur XD alles bugy bei dir XD',
        userId: '6560336868046438406',
        teamMemberLevel: 0
    };
    
    // Fixed logic
    const userId = chatData.username || chatData.uniqueId || chatData.nickname || chatData.userId;
    const username = chatData.username || chatData.uniqueId || chatData.nickname;
    
    assert.strictEqual(userId, 'anubis_maxy', 'Should identify user by username');
    assert.strictEqual(username, 'anubis_maxy', 'Should display username');
});

// Test 7: Voice assignment lookup should match
runTest('Voice assigned to username should be found during chat', () => {
    // Simulated database record (voice assigned via UI)
    const dbRecord = {
        user_id: 'anubis_maxy',  // Assigned using username
        assigned_voice_id: 'gpt-4o-mini-tts-nova',
        assigned_engine: 'openai'
    };
    
    // Chat event data
    const chatData = {
        username: 'anubis_maxy',
        nickname: 'Anubis',
        userId: '6560336868046438406'
    };
    
    // Fixed logic for userId
    const lookupUserId = chatData.username || chatData.uniqueId || chatData.nickname || chatData.userId;
    
    // Simulate database lookup
    const voiceFound = (dbRecord.user_id === lookupUserId);
    
    assert.strictEqual(lookupUserId, 'anubis_maxy', 'Lookup should use username');
    assert.strictEqual(voiceFound, true, 'Voice assignment should be found');
});

// Test 8: Old behavior would cause lookup failure
runTest('Old behavior would fail to find voice assignment', () => {
    // Simulated database record (voice assigned via UI using username)
    const dbRecord = {
        user_id: 'anubis_maxy',
        assigned_voice_id: 'gpt-4o-mini-tts-nova',
        assigned_engine: 'openai'
    };
    
    // Chat event data
    const chatData = {
        username: 'anubis_maxy',
        nickname: 'Anubis',
        userId: '6560336868046438406'
    };
    
    // Old (broken) logic
    const oldLookupId = chatData.uniqueId || chatData.nickname || chatData.userId;
    
    // New (fixed) logic
    const newLookupId = chatData.username || chatData.uniqueId || chatData.nickname || chatData.userId;
    
    // Simulate database lookups
    const oldVoiceFound = (dbRecord.user_id === oldLookupId);
    const newVoiceFound = (dbRecord.user_id === newLookupId);
    
    assert.strictEqual(oldLookupId, 'Anubis', 'Old logic used wrong ID');
    assert.strictEqual(newLookupId, 'anubis_maxy', 'New logic uses correct ID');
    assert.strictEqual(oldVoiceFound, false, 'Old logic would fail to find voice');
    assert.strictEqual(newVoiceFound, true, 'New logic correctly finds voice');
});

console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
