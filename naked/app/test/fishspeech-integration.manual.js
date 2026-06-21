/**
 * Test suite for Fish.audio Integration
 * Verifies that Fish.audio engine is properly integrated into TTS system
 */

const assert = require('assert');
const FishSpeechEngine = require('../plugins/tts/engines/fishspeech-engine');

console.log('🧪 Running Fish.audio Integration Tests...\n');

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

// Mock logger for testing
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {}
};

// Test 1: Fish.audio engine can be instantiated with API key
runTest('Fish.audio engine should initialize with valid API key', () => {
    const engine = new FishSpeechEngine('test-api-key', mockLogger);
    assert(engine !== null, 'Engine should be created');
    assert(engine.apiKey === 'test-api-key', 'API key should be set');
});

// Test 2: Fish.audio engine rejects empty API key
runTest('Fish.audio engine should reject empty API key', () => {
    try {
        new FishSpeechEngine('', mockLogger);
        throw new Error('Should have thrown error for empty API key');
    } catch (error) {
        assert(error.message.includes('required'), 'Error should mention API key is required');
    }
});

// Test 3: Fish.audio has static voices method
runTest('Fish.audio should have getVoices static method', () => {
    const voices = FishSpeechEngine.getVoices();
    assert(voices !== null, 'Voices should exist');
    assert(typeof voices === 'object', 'Voices should be an object');
    assert(Object.keys(voices).length > 0, 'Should have at least one voice');
});

// Test 4: Fish.audio voices include example voices
runTest('Fish.audio should include example voices', () => {
    const voices = FishSpeechEngine.getVoices();
    const voiceIds = Object.keys(voices);
    
    // Fish.audio uses fish- prefix for voice IDs
    const hasFishVoices = voiceIds.some(id => id.startsWith('fish-'));
    
    assert(hasFishVoices, 'Should have fish- prefixed voices');
    assert(voiceIds.includes('fish-sarah'), 'Should include fish-sarah voice');
});

// Test 5: Fish.audio getDefaultVoiceForLanguage works
runTest('Fish.audio should return default voice for any language', () => {
    const enVoice = FishSpeechEngine.getDefaultVoiceForLanguage('en');
    const deVoice = FishSpeechEngine.getDefaultVoiceForLanguage('de');
    const zhVoice = FishSpeechEngine.getDefaultVoiceForLanguage('zh');
    
    // Fish.audio S1 model is multilingual, so all languages return the same default voice
    assert(enVoice === 'fish-sarah', 'English default should be fish-sarah');
    assert(deVoice === 'fish-sarah', 'German default should be fish-sarah');
    assert(zhVoice === 'fish-sarah', 'Chinese default should be fish-sarah');
});

// Test 6: Fish.audio engine has async getVoices method
runTest('Fish.audio instance should have async getVoices method', async () => {
    const engine = new FishSpeechEngine('test-api-key', mockLogger);
    const voices = await engine.getVoices();
    assert(voices !== null, 'Async getVoices should return voices');
    assert(typeof voices === 'object', 'Async getVoices should return object');
});

// Test 7: Fish.audio engine has performance mode settings
runTest('Fish.audio should support performance modes', () => {
    const fastEngine = new FishSpeechEngine('test-key', mockLogger, { performanceMode: 'fast' });
    const balancedEngine = new FishSpeechEngine('test-key', mockLogger, { performanceMode: 'balanced' });
    const qualityEngine = new FishSpeechEngine('test-key', mockLogger, { performanceMode: 'quality' });
    
    assert(fastEngine.performanceMode === 'fast', 'Fast mode should be set');
    assert(balancedEngine.performanceMode === 'balanced', 'Balanced mode should be set');
    assert(qualityEngine.performanceMode === 'quality', 'Quality mode should be set');
});

// Test 8: Fish.audio engine has correct API configuration
runTest('Fish.audio should have correct API endpoint and model', () => {
    const engine = new FishSpeechEngine('test-key', mockLogger);
    assert(engine.apiBaseUrl === 'https://api.fish.audio', 'API base URL should be Fish.audio official API');
    assert(engine.apiSynthesisUrl === 'https://api.fish.audio/v1/tts', 'Synthesis URL should be correct');
    assert(engine.model === 's1', 'Model should be Fish Audio S1');
});

// Test 9: Fish.audio engine has setApiKey method
runTest('Fish.audio should allow updating API key', () => {
    const engine = new FishSpeechEngine('test-key', mockLogger);
    engine.setApiKey('new-key');
    assert(engine.apiKey === 'new-key', 'API key should be updated');
});

// Test 10: Fish.audio setApiKey rejects empty key
runTest('Fish.audio should reject empty API key in setApiKey', () => {
    const engine = new FishSpeechEngine('test-key', mockLogger);
    try {
        engine.setApiKey('');
        throw new Error('Should have thrown error for empty API key');
    } catch (error) {
        assert(error.message.includes('non-empty'), 'Error should mention non-empty string requirement');
    }
});

// Print summary
console.log(`\n📊 Test Summary:`);
console.log(`   Passed: ${passed}`);
console.log(`   Failed: ${failed}`);
console.log(`   Total:  ${passed + failed}`);

if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
