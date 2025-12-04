/**
 * Test suite for TTS Engine Improvements
 * Tests the enhanced error handling and fallback logic
 */

const assert = require('assert');
const GoogleEngine = require('../plugins/tts/engines/google-engine');
const TikTokEngine = require('../plugins/tts/engines/tiktok-engine');
const SpeechifyEngine = require('../plugins/tts/engines/speechify-engine');
const ElevenLabsEngine = require('../plugins/tts/engines/elevenlabs-engine');

// Mock logger
const mockLogger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {}
};

console.log('🧪 Running TTS Engine Improvements Tests...\n');

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

// Test 1: Google Engine initialization
runTest('Google Engine should initialize with API key', () => {
    const engine = new GoogleEngine('test-api-key', mockLogger);
    assert.strictEqual(engine.apiKey, 'test-api-key');
    assert.strictEqual(engine.apiUrl, 'https://texttospeech.googleapis.com/v1/text:synthesize');
});

// Test 2: Google Engine static voice list
runTest('Google Engine should have predefined voices', () => {
    const voices = GoogleEngine.getVoices();
    assert.ok(voices);
    assert.ok(Object.keys(voices).length > 0);
    assert.ok(voices['de-DE-Wavenet-A']);
    assert.ok(voices['en-US-Wavenet-C']);
});

// Test 3: Google Engine default voice for German
runTest('Google Engine should return German default voice', () => {
    const voice = GoogleEngine.getDefaultVoiceForLanguage('de');
    assert.strictEqual(voice, 'de-DE-Wavenet-A');
});

// Test 4: Google Engine default voice for English
runTest('Google Engine should return English default voice', () => {
    const voice = GoogleEngine.getDefaultVoiceForLanguage('en');
    assert.strictEqual(voice, 'en-US-Wavenet-C');
});

// Test 5: Google Engine fallback for unknown language
runTest('Google Engine should fallback to English for unknown language', () => {
    const voice = GoogleEngine.getDefaultVoiceForLanguage('xyz');
    assert.strictEqual(voice, 'en-US-Wavenet-C');
});

// Test 6: Google Engine auth error helper - OAuth2 error
runTest('Google Engine should provide helpful OAuth2 error message', () => {
    const engine = new GoogleEngine('test-key', mockLogger);
    const helpMsg = engine._getAuthErrorHelp('Expected OAuth2 access token');
    assert.ok(helpMsg.includes('API key'));
    assert.ok(helpMsg.includes('OAuth2'));
    assert.ok(helpMsg.includes('console.cloud.google.com'));
});

// Test 7: Google Engine auth error helper - Invalid key error
runTest('Google Engine should provide helpful invalid key error message', () => {
    const engine = new GoogleEngine('test-key', mockLogger);
    const helpMsg = engine._getAuthErrorHelp('API key not valid');
    assert.ok(helpMsg.includes('invalid'));
    assert.ok(helpMsg.includes('correctly copied'));
});

// Test 8: Google Engine auth error helper - Billing error
runTest('Google Engine should provide helpful billing error message', () => {
    const engine = new GoogleEngine('test-key', mockLogger);
    const helpMsg = engine._getAuthErrorHelp('billing must be enabled');
    assert.ok(helpMsg.includes('billing'));
    assert.ok(helpMsg.includes('console.cloud.google.com/billing'));
});

// Test 9: Google Engine API key setter
runTest('Google Engine should allow updating API key', () => {
    const engine = new GoogleEngine('old-key', mockLogger);
    engine.setApiKey('new-key');
    assert.strictEqual(engine.apiKey, 'new-key');
});

// Test 10: TikTok Engine static voice list
runTest('TikTok Engine should have predefined voices', () => {
    const voices = TikTokEngine.getVoices();
    assert.ok(voices);
    assert.ok(Object.keys(voices).length > 0);
    assert.ok(voices['de_001']);
    assert.ok(voices['en_us_ghostface']);
});

// Test 11: TikTok Engine default voice for German
runTest('TikTok Engine should return German default voice', () => {
    const voice = TikTokEngine.getDefaultVoiceForLanguage('de');
    assert.strictEqual(voice, 'de_002');
});

// Test 12: Speechify Engine default voice for German
runTest('Speechify Engine should return German default voice', () => {
    const voice = SpeechifyEngine.getDefaultVoiceForLanguage('de');
    assert.strictEqual(voice, 'mads');
});

// Test 13: ElevenLabs Engine default voice for any language
runTest('ElevenLabs Engine should return Rachel as default for any language', () => {
    const voiceDe = ElevenLabsEngine.getDefaultVoiceForLanguage('de');
    const voiceEn = ElevenLabsEngine.getDefaultVoiceForLanguage('en');
    const voiceUnknown = ElevenLabsEngine.getDefaultVoiceForLanguage('xyz');
    
    // ElevenLabs uses multilingual Rachel voice as default
    assert.strictEqual(voiceDe, '21m00Tcm4TlvDq8ikWAM');
    assert.strictEqual(voiceEn, '21m00Tcm4TlvDq8ikWAM');
    assert.strictEqual(voiceUnknown, '21m00Tcm4TlvDq8ikWAM');
});

console.log('\n' + '='.repeat(50));
console.log(`Tests completed: ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));

if (failed > 0) {
    process.exit(1);
}
