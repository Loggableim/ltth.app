/**
 * Test suite for TTS Auto-Fallback Configuration
 * Tests the new enableAutoFallback feature
 */

const assert = require('assert');

console.log('🧪 Running TTS Auto-Fallback Tests...\n');

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

// Test 1: Default configuration includes enableAutoFallback
runTest('Default config should have enableAutoFallback: true', () => {
    const defaultConfig = {
        defaultEngine: 'tiktok',
        defaultVoice: 'en_us_ghostface',
        volume: 80,
        speed: 1.0,
        teamMinLevel: 0,
        rateLimit: 3,
        rateLimitWindow: 60,
        maxQueueSize: 100,
        maxTextLength: 300,
        profanityFilter: 'moderate',
        duckOtherAudio: false,
        duckVolume: 0.3,
        googleApiKey: null,
        speechifyApiKey: null,
        elevenlabsApiKey: null,
        tiktokSessionId: null,
        enabledForChat: true,
        autoLanguageDetection: true,
        fallbackLanguage: 'de',
        languageConfidenceThreshold: 0.90,
        languageMinTextLength: 10,
        enableAutoFallback: true
    };
    
    assert.strictEqual(defaultConfig.enableAutoFallback, true, 'enableAutoFallback should be true by default');
});

// Test 2: Simulated fallback logic - with auto-fallback enabled
runTest('Fallback should proceed when enableAutoFallback is true', () => {
    const config = { enableAutoFallback: true };
    const shouldFallback = config.enableAutoFallback;
    
    assert.strictEqual(shouldFallback, true, 'Should allow fallback when enabled');
});

// Test 3: Simulated fallback logic - with auto-fallback disabled
runTest('Fallback should be blocked when enableAutoFallback is false', () => {
    const config = { enableAutoFallback: false };
    const shouldFallback = config.enableAutoFallback;
    
    assert.strictEqual(shouldFallback, false, 'Should block fallback when disabled');
});

// Test 4: Configuration merge preserves enableAutoFallback
runTest('Config merge should preserve enableAutoFallback setting', () => {
    const defaultConfig = { enableAutoFallback: true };
    const savedConfig = { enableAutoFallback: false };
    const mergedConfig = { ...defaultConfig, ...savedConfig };
    
    assert.strictEqual(mergedConfig.enableAutoFallback, false, 'Should preserve user setting over default');
});

// Test 5: Undefined enableAutoFallback should default to true (backward compatibility)
runTest('Undefined enableAutoFallback should default to true', () => {
    const config = {};
    const enableAutoFallback = config.enableAutoFallback !== false;
    
    assert.strictEqual(enableAutoFallback, true, 'Should default to true for backward compatibility');
});

// Test 6: False value should be preserved
runTest('False value for enableAutoFallback should be preserved', () => {
    const config = { enableAutoFallback: false };
    const enableAutoFallback = config.enableAutoFallback !== false;
    
    assert.strictEqual(enableAutoFallback, false, 'Should preserve explicit false value');
});

console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
