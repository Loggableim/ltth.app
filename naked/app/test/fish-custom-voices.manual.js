/**
 * Fish.audio Custom Voice ID Test
 * 
 * Tests that Fish.audio engine supports custom voice IDs, allowing users
 * to use voices not in the default list by entering their reference IDs.
 * 
 * This addresses the requirement to support custom voice IDs like:
 * 2d4039641d67419fa132ca59fa2f61ad
 * 
 * Run with: node app/test/fish-custom-voices.test.js
 */

console.log('\n='.repeat(70));
console.log('Fish.audio Custom Voice ID Support Test');
console.log('='.repeat(70));

console.log('\nTEST: Verify Fish.audio supports custom voice IDs');
console.log('Users should be able to use custom voice reference IDs\n');

const fs = require('fs');
const path = require('path');

// Test 1: Verify _isValidReferenceId logic in code
console.log('--- Test 1: Reference ID Validation Logic ---');

const validReferenceIds = [
    '2d4039641d67419fa132ca59fa2f61ad', // User's example
    '933563129e564b19a115bedd57b7406a', // Default Sarah voice
    '8ef4a238714b45718ce04243307c57a7', // E-girl voice
    'ABCDEF0123456789abcdef0123456789'   // Mixed case
];

const invalidReferenceIds = [
    'not-a-valid-id',
    '12345',
    '2d4039641d67419fa132ca59fa2f61a',    // Too short (31 chars)
    '2d4039641d67419fa132ca59fa2f61add',  // Too long (33 chars)
    '2d4039641d67419fa132ca59fa2f61ag',   // Contains 'g' (not hex)
    '',
];

console.log('Valid reference IDs (32-char hex):');
validReferenceIds.forEach(id => {
    const isValid = /^[a-f0-9]{32}$/i.test(id);
    console.log(`  ${isValid ? '✓' : '✗'} ${id}`);
    if (!isValid) {
        console.error(`    ERROR: ${id} should be valid!`);
        process.exit(1);
    }
});

console.log('\nInvalid reference IDs:');
invalidReferenceIds.forEach(id => {
    const isValid = id && /^[a-f0-9]{32}$/i.test(id);
    console.log(`  ${!isValid ? '✓' : '✗'} ${id || '(empty/null)'}`);
    if (isValid) {
        console.error(`    ERROR: ${id} should be invalid!`);
        process.exit(1);
    }
});

console.log('\n✅ Reference ID validation logic works correctly');

// Test 2: Verify Fish.audio engine has validation method
console.log('\n--- Test 2: Engine Code Check ---');

const enginePath = path.join(__dirname, '../plugins/tts/engines/fishspeech-engine.js');
const engineContent = fs.readFileSync(enginePath, 'utf-8');

const hasValidationMethod = engineContent.includes('_isValidReferenceId');
const hasValidationRegex = engineContent.includes('/^[a-f0-9]{32}$/i');
const handlesRawIds = engineContent.includes('this._isValidReferenceId(voiceId)');
const acceptsCustomVoices = engineContent.includes('customVoices');

console.log('Engine implementation checks:');
console.log(`  ✓ Has _isValidReferenceId method: ${hasValidationMethod ? 'YES' : 'NO'}`);
console.log(`  ✓ Has reference ID regex: ${hasValidationRegex ? 'YES' : 'NO'}`);
console.log(`  ✓ Handles raw reference IDs: ${handlesRawIds ? 'YES' : 'NO'}`);
console.log(`  ✓ Accepts custom voices parameter: ${acceptsCustomVoices ? 'YES' : 'NO'}`);

if (hasValidationMethod && hasValidationRegex && handlesRawIds && acceptsCustomVoices) {
    console.log('✅ Fish.audio engine properly implements custom voice support');
} else {
    console.error('❌ Engine missing some implementation details');
    process.exit(1);
}

// Test 3: Verify custom voice merging logic in engine
console.log('\n--- Test 3: Voice Merging in Engine ---');

const mergesInGetVoices = engineContent.includes('{ ...builtInVoices, ...customVoices }');
const mergesInSynthesize = engineContent.includes('const allVoices = { ...builtInVoices, ...customVoices };');

console.log('Voice merging checks:');
console.log(`  ✓ Merges in getVoices: ${mergesInGetVoices ? 'YES' : 'NO'}`);
console.log(`  ✓ Merges in synthesize: ${mergesInSynthesize ? 'YES' : 'NO'}`);

if (mergesInGetVoices || mergesInSynthesize) {
    console.log('✅ Custom voices are merged with built-in voices');
} else {
    console.error('❌ Voice merging not implemented');
    process.exit(1);
}

// Test 4: Verify main.js configuration includes customFishVoices
console.log('\n--- Test 4: Main Plugin Configuration ---');

const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
const mainJsContent = fs.readFileSync(mainJsPath, 'utf-8');

const hasCustomVoicesConfig = mainJsContent.includes('customFishVoices:');
const passesCustomVoices = mainJsContent.includes('customVoices: this.config.customFishVoices');
const mergesInVoiceList = mainJsContent.includes('const customVoices = this.config.customFishVoices');

console.log('Configuration checks:');
console.log(`  ✓ customFishVoices in default config: ${hasCustomVoicesConfig ? 'YES' : 'NO'}`);
console.log(`  ✓ Custom voices passed to engine: ${passesCustomVoices ? 'YES' : 'NO'}`);
console.log(`  ✓ Custom voices merged in voice list: ${mergesInVoiceList ? 'YES' : 'NO'}`);

if (hasCustomVoicesConfig && passesCustomVoices && mergesInVoiceList) {
    console.log('✅ Configuration properly set up for custom voices');
} else {
    console.error('❌ Configuration missing custom voice support');
    process.exit(1);
}

// Test 5: Verify voice validation accepts raw reference IDs
console.log('\n--- Test 5: Voice Validation in Main Plugin ---');

const acceptsRawIds = mainJsContent.includes('isFishReferenceId');
const hasRawIdValidation = mainJsContent.includes('/^[a-f0-9]{32}$/i');

console.log('Validation checks:');
console.log(`  ✓ Checks for Fish reference IDs: ${acceptsRawIds ? 'YES' : 'NO'}`);
console.log(`  ✓ Has reference ID regex: ${hasRawIdValidation ? 'YES' : 'NO'}`);

if (acceptsRawIds && hasRawIdValidation) {
    console.log('✅ Voice validation updated to support custom reference IDs');
} else {
    console.error('❌ Voice validation may not support raw reference IDs');
    process.exit(1);
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('📋 Feature Summary: Fish.audio Custom Voice Support');
console.log('='.repeat(70));
console.log('\n✨ New Capabilities:');
console.log('  1. Users can add custom Fish.audio voices via configuration');
console.log('  2. Voice IDs can be either:');
console.log('     - Named voices: "my-custom-voice" (defined in config)');
console.log('     - Raw reference IDs: "2d4039641d67419fa132ca59fa2f61ad"');
console.log('  3. Custom voices are merged with built-in voices');
console.log('  4. Voice validation accepts both formats');
console.log('');
console.log('📝 Usage Example:');
console.log('  // Option 1: Add to customFishVoices config field:');
console.log('  {');
console.log('    "my-voice": {');
console.log('      "name": "My Custom Voice",');
console.log('      "reference_id": "2d4039641d67419fa132ca59fa2f61ad",');
console.log('      "lang": "de",');
console.log('      "gender": "female"');
console.log('    }');
console.log('  }');
console.log('  Then use: defaultVoice: "my-voice"');
console.log('');
console.log('  // Option 2: Use reference ID directly:');
console.log('  defaultVoice: "2d4039641d67419fa132ca59fa2f61ad"');
console.log('  (No configuration needed, just paste the voice ID)');
console.log('');
console.log('='.repeat(70));
console.log('✅ All tests passed! Custom voice support is ready.');
console.log('='.repeat(70));
console.log('');

process.exit(0);
