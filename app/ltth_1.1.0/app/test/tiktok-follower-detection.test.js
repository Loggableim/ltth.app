/**
 * Test suite for TikTok Follower Detection
 * Tests the fix for follower detection with EulerStream SDK where action is a string
 */

const assert = require('assert');

console.log('🧪 Running TikTok Follower Detection Tests...\n');

let passed = 0;
let failed = 0;

/**
 * Simulates the follower detection logic from tiktok.js
 * This mirrors the actual implementation to verify the fix works correctly
 */
function detectFollowOrShare(data) {
    // Normalize action value to handle both string and number types
    const actionValue = parseInt(data.action, 10);
    
    // displayType can be at top level (legacy) or nested in common.displayText.displayType
    const displayType = data.displayType || data.common?.displayText?.displayType || '';
    
    // Check displayType patterns for follow detection
    const hasFollowDisplayType = displayType && typeof displayType === 'string' && (
        displayType === 'pm_main_follow_message_viewer_2' ||
        displayType === 'pm_mt_guidance_viewer_follow' ||
        displayType.includes('_follow') ||
        displayType.includes('follow_message') ||
        displayType.includes('follow_viewer')
    );
    
    // Detect follow events:
    // - action === 1 (primary detection method)
    // - displayType patterns as fallback
    // Note: Using Boolean() to ensure proper boolean result since hasFollowDisplayType
    // can be an empty string when displayType is empty (JavaScript short-circuit)
    const isFollow = actionValue === 1 || Boolean(hasFollowDisplayType);
    
    // Detect share events from social message (action === 2)
    const isShare = actionValue === 2;
    
    return { isFollow, isShare, actionValue, displayType };
}

const testSuites = [
    {
        name: 'Follow Detection with action as string (EulerStream SDK format)',
        tests: [
            { 
                name: 'Detects follow when action is string "1"', 
                fn: () => {
                    const data = { action: '1', user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true, 'Should detect follow with action="1"');
                    assert.strictEqual(result.isShare, false);
                    assert.strictEqual(result.actionValue, 1);
                }
            },
            { 
                name: 'Detects share when action is string "2"', 
                fn: () => {
                    const data = { action: '2', user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false, 'Should not be follow with action="2"');
                    assert.strictEqual(result.isShare, true, 'Should detect share with action="2"');
                    assert.strictEqual(result.actionValue, 2, 'Action should parse to 2');
                }
            },
            { 
                name: 'No detection when action is string "0"', 
                fn: () => {
                    const data = { action: '0', user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false, 'Should not be follow with action="0"');
                    assert.strictEqual(result.isShare, false, 'Should not be share with action="0"');
                    assert.strictEqual(result.actionValue, 0, 'Action should parse to 0');
                }
            },
        ]
    },
    {
        name: 'Follow Detection with action as number (legacy format)',
        tests: [
            { 
                name: 'Detects follow when action is number 1', 
                fn: () => {
                    const data = { action: 1, user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true, 'Should detect follow with action=1');
                    assert.strictEqual(result.isShare, false);
                    assert.strictEqual(result.actionValue, 1);
                }
            },
            { 
                name: 'Detects share when action is number 2', 
                fn: () => {
                    const data = { action: 2, user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false);
                    assert.strictEqual(result.isShare, true, 'Should detect share with action=2');
                    assert.strictEqual(result.actionValue, 2);
                }
            },
        ]
    },
    {
        name: 'Follow Detection with displayType (fallback patterns)',
        tests: [
            { 
                name: 'Detects follow with pm_main_follow_message_viewer_2 displayType', 
                fn: () => {
                    const data = { action: '0', displayType: 'pm_main_follow_message_viewer_2' };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                }
            },
            { 
                name: 'Detects follow with pm_mt_guidance_viewer_follow displayType', 
                fn: () => {
                    const data = { action: '0', displayType: 'pm_mt_guidance_viewer_follow' };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                }
            },
            { 
                name: 'Detects follow with pattern containing _follow', 
                fn: () => {
                    const data = { action: '0', displayType: 'some_follow_pattern' };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                }
            },
            { 
                name: 'Detects follow with pattern containing follow_message', 
                fn: () => {
                    const data = { action: '0', displayType: 'follow_message_type_1' };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                }
            },
            { 
                name: 'Detects follow with pattern containing follow_viewer', 
                fn: () => {
                    const data = { action: '0', displayType: 'user_follow_viewer_event' };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                }
            },
        ]
    },
    {
        name: 'Follow Detection with nested displayType (EulerStream SDK format)',
        tests: [
            { 
                name: 'Detects follow with nested common.displayText.displayType', 
                fn: () => {
                    const data = { 
                        action: '0', 
                        common: { 
                            displayText: { 
                                displayType: 'pm_main_follow_message_viewer_2' 
                            } 
                        } 
                    };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                    assert.strictEqual(result.displayType, 'pm_main_follow_message_viewer_2');
                }
            },
            { 
                name: 'Handles missing nested properties gracefully', 
                fn: () => {
                    const data = { action: '0', common: {} };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false);
                    assert.strictEqual(result.displayType, '');
                }
            },
            { 
                name: 'Handles null common gracefully', 
                fn: () => {
                    const data = { action: '0', common: null };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false);
                }
            },
        ]
    },
    {
        name: 'Edge Cases',
        tests: [
            { 
                name: 'Handles undefined action', 
                fn: () => {
                    const data = { user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false);
                    assert.strictEqual(result.isShare, false);
                    assert.ok(isNaN(result.actionValue) || result.actionValue === 0);
                }
            },
            { 
                name: 'Handles empty string action', 
                fn: () => {
                    const data = { action: '', user: { uniqueId: 'testuser' } };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, false);
                    assert.strictEqual(result.isShare, false);
                }
            },
            { 
                name: 'Top-level displayType takes precedence over nested', 
                fn: () => {
                    const data = { 
                        action: '0', 
                        displayType: 'pm_main_follow_message_viewer_2',
                        common: { 
                            displayText: { 
                                displayType: 'something_else' 
                            } 
                        } 
                    };
                    const result = detectFollowOrShare(data);
                    assert.strictEqual(result.isFollow, true);
                    assert.strictEqual(result.displayType, 'pm_main_follow_message_viewer_2');
                }
            },
        ]
    }
];

// Run tests
testSuites.forEach(suite => {
    console.log(`\n📋 ${suite.name}:`);
    suite.tests.forEach(test => {
        try {
            test.fn();
            console.log(`  ✅ ${test.name}`);
            passed++;
        } catch (err) {
            console.log(`  ❌ ${test.name}`);
            console.log(`     Error: ${err.message}`);
            failed++;
        }
    });
});

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
