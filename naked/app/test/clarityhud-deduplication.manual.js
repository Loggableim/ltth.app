/**
 * Test to verify ClarityHUD overlay duplicate detection
 * Tests the fix for duplicate gifts being displayed in the ClarityHUD full overlay
 */

const assert = require('assert');

console.log('🧪 Testing ClarityHUD Overlay Deduplication...\n');

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

// Simulate the duplicate key generation logic from full.js
function generateDuplicateKey(type, data, timestamp) {
    const roundedTime = Math.floor(timestamp / 500) * 500;
    
    // Build duplicate key based on event type
    let uniqueIdentifier = '';
    if (type === 'chat') {
        uniqueIdentifier = data.message || data.comment || '';
    } else if (type === 'gift' || type === 'treasure') {
        // For gifts, include both name and coins to prevent legitimate different gifts from being marked as duplicates
        const giftName = data.gift?.name || data.giftName || '';
        const coins = data.gift?.coins || data.coins || 0;
        uniqueIdentifier = `${giftName}_${coins}`;
    } else if (type === 'like') {
        // For likes, include the like count
        uniqueIdentifier = `${data.likeCount || 1}`;
    } else {
        // For other events (follow, share, subscribe, join), type and user is enough
        uniqueIdentifier = type;
    }
    
    const duplicateKey = `${type}_${data.user?.uniqueId || data.uniqueId}_${uniqueIdentifier}_${roundedTime}`;
    return duplicateKey;
}

// Test 1: Different gifts generate different keys
runTest('Different gifts generate different keys', () => {
    const timestamp = Date.now();
    const gift1 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Rose', coins: 5 },
        giftName: 'Rose',
        coins: 5
    };
    const gift2 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Heart', coins: 10 },
        giftName: 'Heart',
        coins: 10
    };
    
    const key1 = generateDuplicateKey('gift', gift1, timestamp);
    const key2 = generateDuplicateKey('gift', gift2, timestamp);
    
    assert.notStrictEqual(key1, key2, 'Different gifts should generate different keys');
});

// Test 2: Identical gifts at same time generate same key (will be deduplicated)
runTest('Identical gifts at same time generate same key', () => {
    const baseTime = 1000000;  // Use a fixed round number
    const gift1 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Rose', coins: 5 },
        giftName: 'Rose',
        coins: 5
    };
    const gift2 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Rose', coins: 5 },
        giftName: 'Rose',
        coins: 5
    };
    
    const key1 = generateDuplicateKey('gift', gift1, baseTime);
    const key2 = generateDuplicateKey('gift', gift2, baseTime + 400); // within 500ms window (both round to 1000000)
    
    assert.strictEqual(key1, key2, 'Identical gifts within 500ms should generate same key');
});

// Test 3: Same gift with different coins generates different keys
runTest('Same gift with different coins generates different keys', () => {
    const timestamp = Date.now();
    const gift1 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Rose', coins: 5 },
        giftName: 'Rose',
        coins: 5
    };
    const gift2 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Rose', coins: 10 },
        giftName: 'Rose',
        coins: 10
    };
    
    const key1 = generateDuplicateKey('gift', gift1, timestamp);
    const key2 = generateDuplicateKey('gift', gift2, timestamp);
    
    assert.notStrictEqual(key1, key2, 'Same gift with different coins should generate different keys');
});

// Test 4: Gifts from different users generate different keys
runTest('Gifts from different users generate different keys', () => {
    const timestamp = Date.now();
    const gift1 = {
        type: 'gift',
        user: { uniqueId: 'user123' },
        gift: { name: 'Rose', coins: 5 },
        giftName: 'Rose',
        coins: 5
    };
    const gift2 = {
        type: 'gift',
        user: { uniqueId: 'user456' },
        gift: { name: 'Rose', coins: 5 },
        giftName: 'Rose',
        coins: 5
    };
    
    const key1 = generateDuplicateKey('gift', gift1, timestamp);
    const key2 = generateDuplicateKey('gift', gift2, timestamp);
    
    assert.notStrictEqual(key1, key2, 'Same gift from different users should generate different keys');
});

// Test 5: Chat messages use message content
runTest('Chat messages use message content for deduplication', () => {
    const timestamp = Date.now();
    const chat1 = {
        user: { uniqueId: 'user123' },
        message: 'Hello world'
    };
    const chat2 = {
        user: { uniqueId: 'user123' },
        message: 'Different message'
    };
    
    const key1 = generateDuplicateKey('chat', chat1, timestamp);
    const key2 = generateDuplicateKey('chat', chat2, timestamp);
    
    assert.notStrictEqual(key1, key2, 'Different chat messages should generate different keys');
});

// Test 6: Like events use like count
runTest('Like events use like count for deduplication', () => {
    const timestamp = Date.now();
    const like1 = {
        user: { uniqueId: 'user123' },
        likeCount: 5
    };
    const like2 = {
        user: { uniqueId: 'user123' },
        likeCount: 10
    };
    
    const key1 = generateDuplicateKey('like', like1, timestamp);
    const key2 = generateDuplicateKey('like', like2, timestamp);
    
    assert.notStrictEqual(key1, key2, 'Different like counts should generate different keys');
});

// Test 7: Join events work correctly
runTest('Join events are deduplicated by user and timestamp', () => {
    const baseTime = 1000000;  // Use a fixed round number
    const join1 = {
        user: { uniqueId: 'user123', nickname: 'TestUser' }
    };
    const join2 = {
        user: { uniqueId: 'user123', nickname: 'TestUser' }
    };
    
    const key1 = generateDuplicateKey('join', join1, baseTime);
    const key2 = generateDuplicateKey('join', join2, baseTime + 400); // within 500ms (both round to 1000000)
    
    assert.strictEqual(key1, key2, 'Same user joining within 500ms should generate same key');
});

// Test 8: Treasure chests work like gifts
runTest('Treasure chests use gift logic with coins', () => {
    const timestamp = Date.now();
    const treasure1 = {
        user: { uniqueId: 'user123' },
        gift: { name: 'Treasure Chest', coins: 1000, isTreasureChest: true },
        giftName: 'Treasure Chest',
        coins: 1000
    };
    const treasure2 = {
        user: { uniqueId: 'user123' },
        gift: { name: 'Treasure Chest', coins: 2000, isTreasureChest: true },
        giftName: 'Treasure Chest',
        coins: 2000
    };
    
    const key1 = generateDuplicateKey('treasure', treasure1, timestamp);
    const key2 = generateDuplicateKey('treasure', treasure2, timestamp);
    
    assert.notStrictEqual(key1, key2, 'Treasure chests with different coins should generate different keys');
});

// Test 9: Backward compatibility - old format with top-level uniqueId
runTest('Backward compatibility with old data format', () => {
    const baseTime = 1000000;  // Use a fixed round number
    const gift1 = {
        uniqueId: 'user123',  // Old format - no nested user object
        giftName: 'Rose',
        coins: 5
    };
    const gift2 = {
        uniqueId: 'user123',
        giftName: 'Rose',
        coins: 5
    };
    
    const key1 = generateDuplicateKey('gift', gift1, baseTime);
    const key2 = generateDuplicateKey('gift', gift2, baseTime + 400); // within 500ms (both round to 1000000)
    
    assert.strictEqual(key1, key2, 'Old format should work with backward compatibility');
});

// Summary
console.log(`\n📊 Test Summary: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
    console.log('✅ All tests passed!\n');
    console.log('ClarityHUD deduplication improvements:');
    console.log('  ✓ Gift/treasure events include coins value for accurate deduplication');
    console.log('  ✓ Chat events use message content');
    console.log('  ✓ Like events use like count');
    console.log('  ✓ Join events are properly deduplicated');
    console.log('  ✓ Backward compatibility maintained\n');
    process.exit(0);
} else {
    console.error('❌ Some tests failed!\n');
    process.exit(1);
}
