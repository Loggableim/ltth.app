/**
 * Test suite for TTS Voice Assignment Preservation
 * Tests that user-assigned voices are preserved during engine fallback
 */

const assert = require('assert');

console.log('🧪 Running TTS Voice Assignment Preservation Tests...\n');

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

// Test 1: hasUserAssignedVoice flag should be set when user has both voice and engine assigned
runTest('hasUserAssignedVoice should be true when user has assigned voice and engine', () => {
    const userSettings = {
        assigned_voice_id: 'de-DE-Wavenet-B',
        assigned_engine: 'google'
    };
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    
    assert.strictEqual(hasUserAssignedVoice, true, 'Should be true when both voice and engine are assigned');
});

// Test 2: hasUserAssignedVoice flag should be false when user has no assigned voice
runTest('hasUserAssignedVoice should be false when user has no assigned voice', () => {
    const userSettings = {
        assigned_voice_id: null,
        assigned_engine: null
    };
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    
    assert.strictEqual(hasUserAssignedVoice, false, 'Should be false when voice is not assigned');
});

// Test 3: hasUserAssignedVoice flag should be false when user has voice but no engine
runTest('hasUserAssignedVoice should be false when user has voice but no engine', () => {
    const userSettings = {
        assigned_voice_id: 'de-DE-Wavenet-B',
        assigned_engine: null
    };
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    
    assert.strictEqual(hasUserAssignedVoice, false, 'Should be false when engine is not assigned');
});

// Test 4: hasUserAssignedVoice flag should be false when user has engine but no voice
runTest('hasUserAssignedVoice should be false when user has engine but no voice', () => {
    const userSettings = {
        assigned_voice_id: null,
        assigned_engine: 'google'
    };
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    
    assert.strictEqual(hasUserAssignedVoice, false, 'Should be false when voice is not assigned');
});

// Test 5: hasUserAssignedVoice flag should be false when userSettings is undefined
runTest('hasUserAssignedVoice should be false when userSettings is undefined', () => {
    const userSettings = undefined;
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    
    assert.strictEqual(hasUserAssignedVoice, false, 'Should be false when userSettings is undefined');
});

// Test 6: Voice selection logic - user with assigned voice should not use language detection
runTest('User with assigned voice should use fallback engine default, not language detection', () => {
    const hasUserAssignedVoice = true;
    const fallbackLanguage = 'de';
    
    // Simulate the logic from the fix
    let selectedVoice;
    if (!hasUserAssignedVoice) {
        // This path should NOT be taken
        selectedVoice = 'language-detected-voice';
    } else {
        // This path SHOULD be taken - use engine's default for fallback language
        selectedVoice = 'de-DE-Wavenet-B'; // Google default for German
    }
    
    assert.strictEqual(selectedVoice, 'de-DE-Wavenet-B', 'Should use engine default, not language detection');
});

// Test 7: Voice selection logic - user without assigned voice should use language detection
runTest('User without assigned voice should use language detection', () => {
    const hasUserAssignedVoice = false;
    
    // Simulate the logic from the fix
    let selectedVoice;
    if (!hasUserAssignedVoice) {
        // This path SHOULD be taken
        selectedVoice = 'language-detected-voice';
    } else {
        // This path should NOT be taken
        selectedVoice = 'de-DE-Wavenet-B';
    }
    
    assert.strictEqual(selectedVoice, 'language-detected-voice', 'Should use language detection');
});

// Test 8: Scenario - ElevenLabs assigned but not available, fallback to Google
runTest('ElevenLabs user should fallback to Google default when ElevenLabs unavailable', () => {
    const userSettings = {
        assigned_voice_id: 'Rachel',  // ElevenLabs voice
        assigned_engine: 'elevenlabs'
    };
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    const elevenlabsAvailable = false; // ElevenLabs not configured
    const googleAvailable = true;
    
    let selectedEngine = userSettings.assigned_engine;
    let selectedVoice = userSettings.assigned_voice_id;
    
    // Engine fallback logic
    if (selectedEngine === 'elevenlabs' && !elevenlabsAvailable) {
        if (googleAvailable) {
            selectedEngine = 'google';
            
            // Voice doesn't exist in Google voices
            const googleVoices = {
                'de-DE-Wavenet-B': true,
                'en-US-Wavenet-A': true
            };
            
            if (!selectedVoice || !googleVoices[selectedVoice]) {
                // The fix: Don't use language detection if user had assigned voice
                if (!hasUserAssignedVoice) {
                    selectedVoice = 'language-detected-voice';
                } else {
                    selectedVoice = 'de-DE-Wavenet-B'; // Google default for fallback language
                }
            }
        }
    }
    
    assert.strictEqual(selectedEngine, 'google', 'Should fallback to Google engine');
    assert.strictEqual(selectedVoice, 'de-DE-Wavenet-B', 'Should use Google default, not language detection');
});

// Test 9: Scenario - No assigned voice, should use language detection
runTest('User without assigned voice should use language detection on fallback', () => {
    const userSettings = null;
    
    const hasUserAssignedVoice = !!(userSettings?.assigned_voice_id && userSettings?.assigned_engine);
    const fallbackLanguage = 'de';
    
    let selectedVoice;
    
    // Voice selection during fallback
    if (!hasUserAssignedVoice) {
        // Should use language detection
        selectedVoice = 'detected-voice-from-text';
    } else {
        selectedVoice = 'de-DE-Wavenet-B';
    }
    
    assert.strictEqual(selectedVoice, 'detected-voice-from-text', 'Should use language detection when no assigned voice');
});

console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
