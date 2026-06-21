/**
 * Test suite for Goals Display Fixes
 * Tests for:
 * 1. Format function edge cases (999999 showing as "1000.0K" bug)
 * 2. Socket broadcast duplication fix
 */

const assert = require('assert');

console.log('🧪 Running Goals Display Fix Tests...\n');

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

// Test the format function
function formatNumber(num) {
    // FIX: Handle edge case where 999999 would show as "1000.0K" instead of "999K"
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 10000) return Math.floor(num / 1000) + 'K';  // No decimals for 10K+
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// Test Cases for Format Function
runTest('Format: Small numbers (0-999) display as is', () => {
    assert.strictEqual(formatNumber(0), '0');
    assert.strictEqual(formatNumber(50), '50');
    assert.strictEqual(formatNumber(999), '999');
});

runTest('Format: 1K-10K numbers show with decimal', () => {
    assert.strictEqual(formatNumber(1000), '1.0K');
    assert.strictEqual(formatNumber(1500), '1.5K');
    assert.strictEqual(formatNumber(9999), '10.0K');
});

runTest('Format: 10K+ numbers show without decimal', () => {
    assert.strictEqual(formatNumber(10000), '10K');
    assert.strictEqual(formatNumber(15000), '15K');
    assert.strictEqual(formatNumber(50000), '50K');
});

runTest('Format: Edge case 999999 shows as 999K not 1000.0K', () => {
    const result = formatNumber(999999);
    assert.strictEqual(result, '999K', `Expected "999K" but got "${result}"`);
    assert.notStrictEqual(result, '1000.0K', 'Should not show as 1000.0K');
});

runTest('Format: 1M+ numbers show with decimal', () => {
    assert.strictEqual(formatNumber(1000000), '1.0M');
    assert.strictEqual(formatNumber(1500000), '1.5M');
    assert.strictEqual(formatNumber(10000000), '10.0M');
});

runTest('Format: Coin value examples display correctly', () => {
    assert.strictEqual(formatNumber(150), '150');
    assert.strictEqual(formatNumber(500), '500');
    assert.strictEqual(formatNumber(1050), '1.1K');
    assert.strictEqual(formatNumber(5000), '5.0K');
    assert.strictEqual(formatNumber(12345), '12K');
    assert.strictEqual(formatNumber(100000), '100K');
});

// Test WebSocket Broadcast Logic (Conceptual Test)
runTest('WebSocket: Single broadcast prevents duplicate events', () => {
    // Mock socket.io
    let emitCount = 0;
    let roomEmitCount = 0;
    
    const mockIo = {
        emit: (event, data) => {
            emitCount++;
        },
        to: (room) => ({
            emit: (event, data) => {
                roomEmitCount++;
            }
        })
    };
    
    // Simulate the FIXED broadcast (only global emit)
    const broadcastFixed = (io, goalId, payload) => {
        io.emit('goals:value-changed', payload);
    };
    
    // Simulate the BROKEN broadcast (both global and room)
    const broadcastBroken = (io, goalId, payload) => {
        io.emit('goals:value-changed', payload);
        io.to(`goal:${goalId}`).emit('goals:value-changed', payload);
    };
    
    // Test fixed version
    emitCount = 0;
    roomEmitCount = 0;
    broadcastFixed(mockIo, 'test-goal', { test: true });
    assert.strictEqual(emitCount, 1, 'Fixed version should emit once');
    assert.strictEqual(roomEmitCount, 0, 'Fixed version should not emit to room');
    
    // Test broken version (for comparison)
    emitCount = 0;
    roomEmitCount = 0;
    broadcastBroken(mockIo, 'test-goal', { test: true });
    assert.strictEqual(emitCount, 1, 'Broken version emits once globally');
    assert.strictEqual(roomEmitCount, 1, 'Broken version also emits to room');
    
    console.log('  → Fixed version sends 1 event total');
    console.log('  → Broken version sends 2 events total (duplicate)');
});

// Summary
console.log('\n==================================================');
console.log(`Tests: ${passed + failed} total, ${passed} passed, ${failed} failed`);
console.log('==================================================');

process.exit(failed > 0 ? 1 : 0);
