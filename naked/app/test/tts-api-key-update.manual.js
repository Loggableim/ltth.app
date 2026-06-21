/**
 * Test suite for TTS API Key Update Functionality
 * Tests that all engines properly support updating API keys via setApiKey method
 */

const assert = require('assert');
const GoogleEngine = require('../plugins/tts/engines/google-engine');
const SpeechifyEngine = require('../plugins/tts/engines/speechify-engine');
const ElevenLabsEngine = require('../plugins/tts/engines/elevenlabs-engine');
const OpenAIEngine = require('../plugins/tts/engines/openai-engine');

// Mock logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

console.log('🧪 Running TTS API Key Update Tests...\n');

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

// Test 1: Google Engine setApiKey
runTest('Google Engine should update API key via setApiKey', () => {
    const engine = new GoogleEngine('initial-key', mockLogger);
    assert.strictEqual(engine.apiKey, 'initial-key');
    
    engine.setApiKey('updated-key');
    assert.strictEqual(engine.apiKey, 'updated-key');
});

// Test 2: Speechify Engine setApiKey
runTest('Speechify Engine should update API key via setApiKey', () => {
    const engine = new SpeechifyEngine('initial-key', mockLogger);
    assert.strictEqual(engine.apiKey, 'initial-key');
    
    engine.setApiKey('updated-key');
    assert.strictEqual(engine.apiKey, 'updated-key');
    
    // Verify cache is cleared
    assert.strictEqual(engine.cachedVoices, null);
    assert.strictEqual(engine.cacheTimestamp, null);
});

// Test 3: ElevenLabs Engine setApiKey
runTest('ElevenLabs Engine should update API key via setApiKey', () => {
    const engine = new ElevenLabsEngine('initial-key', mockLogger);
    assert.strictEqual(engine.apiKey, 'initial-key');
    
    engine.setApiKey('updated-key');
    assert.strictEqual(engine.apiKey, 'updated-key');
    
    // Verify cache is cleared
    assert.strictEqual(engine.cachedVoices, null);
    assert.strictEqual(engine.cacheTimestamp, null);
});

// Test 4: OpenAI Engine setApiKey
runTest('OpenAI Engine should update API key via setApiKey', () => {
    const engine = new OpenAIEngine('initial-key', mockLogger);
    assert.strictEqual(engine.apiKey, 'initial-key');
    
    engine.setApiKey('updated-key');
    assert.strictEqual(engine.apiKey, 'updated-key');
    
    // Verify client is recreated with new key
    assert.ok(engine.client);
});

// Test 5: Google Engine setApiKey validation
runTest('Google Engine should reject empty API key', () => {
    const engine = new GoogleEngine('initial-key', mockLogger);
    
    try {
        engine.setApiKey('');
        assert.fail('Should have thrown an error for empty API key');
    } catch (error) {
        assert.ok(error.message.includes('non-empty string'));
    }
});

// Test 6: OpenAI Engine setApiKey validation
runTest('OpenAI Engine should reject empty API key', () => {
    const engine = new OpenAIEngine('initial-key', mockLogger);
    
    try {
        engine.setApiKey('');
        assert.fail('Should have thrown an error for empty API key');
    } catch (error) {
        assert.ok(error.message.includes('non-empty string'));
    }
});

// Test 7: ElevenLabs Engine setApiKey validation
runTest('ElevenLabs Engine should reject null API key', () => {
    const engine = new ElevenLabsEngine('initial-key', mockLogger);
    
    try {
        engine.setApiKey(null);
        assert.fail('Should have thrown an error for null API key');
    } catch (error) {
        assert.ok(error.message.includes('non-empty string'));
    }
});

// Test 8: Speechify Engine setApiKey validation
runTest('Speechify Engine should reject whitespace-only API key', () => {
    const engine = new SpeechifyEngine('initial-key', mockLogger);
    
    try {
        engine.setApiKey('   ');
        assert.fail('Should have thrown an error for whitespace-only API key');
    } catch (error) {
        assert.ok(error.message.includes('non-empty string'));
    }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

// Exit with appropriate code
process.exit(failed > 0 ? 1 : 0);
