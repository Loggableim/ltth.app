/**
 * Test suite for SiliconFlow TTS Integration
 * Verifies that SiliconFlow engine is properly integrated into TTS system
 */

const assert = require('assert');
const SiliconFlowEngine = require('../plugins/tts/engines/siliconflow-engine');

console.log('🧪 Running SiliconFlow Integration Tests...\n');

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

// Test 1: SiliconFlow engine can be instantiated with API key
runTest('SiliconFlow engine should initialize with valid API key', () => {
    const engine = new SiliconFlowEngine('test-api-key', mockLogger);
    assert(engine !== null, 'Engine should be created');
    assert(engine.apiKey === 'test-api-key', 'API key should be set');
});

// Test 2: SiliconFlow engine rejects empty API key
runTest('SiliconFlow engine should reject empty API key', () => {
    try {
        new SiliconFlowEngine('', mockLogger);
        throw new Error('Should have thrown error for empty API key');
    } catch (error) {
        assert(error.message.includes('required'), 'Error should mention API key is required');
    }
});

// Test 3: SiliconFlow has static voices method
runTest('SiliconFlow should have getVoices static method', () => {
    const voices = SiliconFlowEngine.getVoices();
    assert(voices !== null, 'Voices should exist');
    assert(typeof voices === 'object', 'Voices should be an object');
    assert(Object.keys(voices).length > 0, 'Should have at least one voice');
});

// Test 4: SiliconFlow voices include example voices
runTest('SiliconFlow should include example voices', () => {
    const voices = SiliconFlowEngine.getVoices();
    const voiceIds = Object.keys(voices);
    
    // SiliconFlow uses siliconflow- prefix for voice IDs
    const hasSiliconFlowVoices = voiceIds.some(id => id.startsWith('siliconflow-'));
    
    assert(hasSiliconFlowVoices, 'Should have siliconflow- prefixed voices');
    assert(voiceIds.includes('siliconflow-default'), 'Should include siliconflow-default voice');
});

// Test 5: SiliconFlow getDefaultVoiceForLanguage works
runTest('SiliconFlow should return default voice for any language', () => {
    const enVoice = SiliconFlowEngine.getDefaultVoiceForLanguage('en');
    const deVoice = SiliconFlowEngine.getDefaultVoiceForLanguage('de');
    const zhVoice = SiliconFlowEngine.getDefaultVoiceForLanguage('zh');
    
    // SiliconFlow uses default voice for all languages
    assert(enVoice === 'siliconflow-default', 'English default should be siliconflow-default');
    assert(deVoice === 'siliconflow-default', 'German default should be siliconflow-default');
    assert(zhVoice === 'siliconflow-default', 'Chinese default should be siliconflow-default');
});

// Test 6: SiliconFlow engine has async getVoices method
runTest('SiliconFlow instance should have async getVoices method', async () => {
    const engine = new SiliconFlowEngine('test-api-key', mockLogger);
    const voices = await engine.getVoices();
    assert(voices !== null, 'Async getVoices should return voices');
    assert(typeof voices === 'object', 'Async getVoices should return object');
});

// Test 7: SiliconFlow engine has performance mode settings
runTest('SiliconFlow should support performance modes', () => {
    const fastEngine = new SiliconFlowEngine('test-key', mockLogger, { performanceMode: 'fast' });
    const balancedEngine = new SiliconFlowEngine('test-key', mockLogger, { performanceMode: 'balanced' });
    const qualityEngine = new SiliconFlowEngine('test-key', mockLogger, { performanceMode: 'quality' });
    
    assert(fastEngine.performanceMode === 'fast', 'Fast mode should be set');
    assert(balancedEngine.performanceMode === 'balanced', 'Balanced mode should be set');
    assert(qualityEngine.performanceMode === 'quality', 'Quality mode should be set');
});

// Test 8: SiliconFlow engine has correct API configuration
runTest('SiliconFlow should have correct API endpoint and model', () => {
    const engine = new SiliconFlowEngine('test-key', mockLogger);
    assert(engine.apiBaseUrl === 'https://api.siliconflow.com', 'API base URL should be SiliconFlow API');
    assert(engine.apiSynthesisUrl === 'https://api.siliconflow.com/v1/audio/speech', 'Synthesis URL should be correct');
    assert(engine.model === 'fishaudio/fish-speech-1.5', 'Model should be Fish Speech 1.5');
});

// Test 9: SiliconFlow engine has setApiKey method
runTest('SiliconFlow should allow updating API key', () => {
    const engine = new SiliconFlowEngine('test-key', mockLogger);
    engine.setApiKey('new-key');
    assert(engine.apiKey === 'new-key', 'API key should be updated');
});

// Test 10: SiliconFlow setApiKey rejects empty key
runTest('SiliconFlow should reject empty API key in setApiKey', () => {
    const engine = new SiliconFlowEngine('test-key', mockLogger);
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
