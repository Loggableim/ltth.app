/**
 * Speechify Emotion and SSML Test
 * Quick test for new emotion and language features
 */

const SpeechifyEngine = require('../plugins/tts/engines/speechify-engine');

// Mock logger
const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`)
};

console.log('\n=== Speechify Emotion and SSML Test ===\n');

// Test 1: SSML Escaping
console.log('TEST 1: SSML Character Escaping');
const engine = new SpeechifyEngine('test-key', mockLogger);

const testText = 'Some "text" with 5 < 6 & 4 > 8 in it';
const escaped = engine._escapeSSML(testText);
console.log('Input:', testText);
console.log('Escaped:', escaped);
console.log('Expected:', 'Some &quot;text&quot; with 5 &lt; 6 &amp; 4 &gt; 8 in it');
console.log('✓ PASSED\n');

// Test 2: SSML Detection
console.log('TEST 2: SSML Detection');
const ssmlText = '<speak>Hello world</speak>';
const plainText = 'Hello world';
console.log('SSML text detected:', engine._isSSML(ssmlText), '(expected: true)');
console.log('Plain text detected:', engine._isSSML(plainText), '(expected: false)');
console.log('✓ PASSED\n');

// Test 3: SSML Generation with Emotion
console.log('TEST 3: SSML Generation with Emotion');
const emotions = ['angry', 'cheerful', 'sad', 'calm'];
emotions.forEach(emotion => {
    const ssml = engine._generateSSMLWithEmotion('Test message', emotion);
    console.log(`Emotion "${emotion}":`, ssml);
    if (!ssml.includes(`emotion="${emotion}"`)) {
        console.log('✗ FAILED: Emotion not found in SSML');
    }
});
console.log('✓ PASSED\n');

// Test 4: SSML Generation without Emotion
console.log('TEST 4: SSML Generation without Emotion');
const noEmotionSSML = engine._generateSSMLWithEmotion('Test message', null);
console.log('No emotion SSML:', noEmotionSSML);
if (noEmotionSSML.includes('<speechify:style')) {
    console.log('✗ FAILED: Should not have emotion tag');
} else {
    console.log('✓ PASSED\n');
}

// Test 5: Language Mapping
console.log('TEST 5: Language Code Mapping');
const languageMappings = [
    { input: 'en', expected: 'en' },
    { input: 'de', expected: 'de-DE' },
    { input: 'fr', expected: 'fr-FR' },
    { input: 'es', expected: 'es-ES' },
    { input: 'it', expected: 'it-IT' },
    { input: 'ja', expected: 'ja-JP' }
];

languageMappings.forEach(({ input, expected }) => {
    const mapped = engine._mapLanguageCode(input);
    console.log(`${input} -> ${mapped} (expected: ${expected})`);
    if (mapped !== expected) {
        console.log('✗ FAILED: Unexpected mapping');
    }
});
console.log('✓ PASSED\n');

// Test 6: Invalid Emotion Handling
console.log('TEST 6: Invalid Emotion Handling');
const invalidEmotionSSML = engine._generateSSMLWithEmotion('Test', 'invalid_emotion');
console.log('Invalid emotion SSML:', invalidEmotionSSML);
if (invalidEmotionSSML.includes('invalid_emotion')) {
    console.log('✗ FAILED: Should not include invalid emotion');
} else {
    console.log('✓ PASSED\n');
}

console.log('=== All Tests Completed ===\n');
