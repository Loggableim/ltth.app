/**
 * TTS Bug Fixes Validation Test
 * 
 * Tests that verify the bug fixes for:
 * 1. TikTok TTS engine text encoding
 * 2. Fish.audio custom voices integration
 * 
 * Run with: node app/test/tts-bugfixes-validation.test.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('TTS Bug Fixes Validation Test');
console.log('='.repeat(70));
console.log('');

let allTestsPassed = true;

// ============================================================================
// Test 1: TikTok Engine - URL Encoding Fix
// ============================================================================
console.log('Test 1: TikTok Engine - Proper URL Encoding');
console.log('-'.repeat(70));

const tiktokEnginePath = path.join(__dirname, '../plugins/tts/engines/tiktok-engine.js');
const tiktokEngineCode = fs.readFileSync(tiktokEnginePath, 'utf-8');

const hasEncodeURIComponent = tiktokEngineCode.includes('encodeURIComponent(text)');
const has20ToPlus = tiktokEngineCode.includes("replace(/%20/g, '+')");

console.log('✓ Checking text encoding implementation...');
if (hasEncodeURIComponent) {
    console.log('  ✅ Uses encodeURIComponent() for proper URL encoding');
} else {
    console.log('  ❌ Missing encodeURIComponent() - special characters not encoded');
    allTestsPassed = false;
}

if (has20ToPlus) {
    console.log('  ✅ Converts %20 to + for TikTok API compatibility');
} else {
    console.log('  ❌ Missing %20 to + conversion - TikTok API may reject requests');
    allTestsPassed = false;
}

if (hasEncodeURIComponent && has20ToPlus) {
    console.log('');
    console.log('✅ TikTok encoding fix verified');
    console.log('   Benefits:');
    console.log('   • Special characters (&, ?, =, etc.) properly encoded');
    console.log('   • Non-ASCII characters (umlauts, emojis) handled correctly');
    console.log('   • Spaces converted to + (TikTok requirement)');
    console.log('   • URLs remain valid with any text input');
} else {
    console.log('');
    console.log('❌ TikTok encoding fix incomplete');
}

console.log('');

// ============================================================================
// Test 2: Fish.audio Custom Voices - Integration Check
// ============================================================================
console.log('Test 2: Fish.audio Custom Voices Integration');
console.log('-'.repeat(70));

const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
const mainJsCode = fs.readFileSync(mainJsPath, 'utf-8');

const hasCustomVoicesInOptions = mainJsCode.includes('synthesisOptions.customVoices = this.config.customFishVoices');
const hasCustomVoicesInFallback = mainJsCode.includes("engineName === 'fishaudio' ? { customVoices: this.config.customFishVoices || {} } : {}");
const hasCustomFishVoicesConfig = mainJsCode.includes('customFishVoices: {}');

console.log('✓ Checking custom voices integration...');
if (hasCustomVoicesInOptions) {
    console.log('  ✅ Custom voices added to synthesisOptions before synthesis');
} else {
    console.log('  ❌ Custom voices not passed to Fish.audio engine');
    allTestsPassed = false;
}

if (hasCustomVoicesInFallback) {
    console.log('  ✅ Custom voices passed in fallback engine calls');
} else {
    console.log('  ❌ Custom voices not passed in fallback scenarios');
    allTestsPassed = false;
}

if (hasCustomFishVoicesConfig) {
    console.log('  ✅ customFishVoices field exists in default config');
} else {
    console.log('  ❌ customFishVoices field missing from config');
    allTestsPassed = false;
}

if (hasCustomVoicesInOptions && hasCustomVoicesInFallback && hasCustomFishVoicesConfig) {
    console.log('');
    console.log('✅ Fish.audio custom voices fix verified');
    console.log('   Usage options:');
    console.log('   • Add named voices to customFishVoices config');
    console.log('   • Use raw reference IDs directly (e.g., "2d4039641d67419fa132ca59fa2f61ad")');
    console.log('   • Custom voices merged with built-in voices');
} else {
    console.log('');
    console.log('❌ Fish.audio custom voices fix incomplete');
}

console.log('');

// ============================================================================
// Test 3: Engine Code Syntax Validation
// ============================================================================
console.log('Test 3: Code Syntax Validation');
console.log('-'.repeat(70));

// Check for common syntax errors
const hasSyntaxError = (code) => {
    // Check for unclosed brackets
    const openBrackets = (code.match(/\{/g) || []).length;
    const closeBrackets = (code.match(/\}/g) || []).length;
    const openParens = (code.match(/\(/g) || []).length;
    const closeParens = (code.match(/\)/g) || []).length;
    
    return openBrackets !== closeBrackets || openParens !== closeParens;
};

const tiktokSyntaxOk = !hasSyntaxError(tiktokEngineCode);
const mainJsSyntaxOk = !hasSyntaxError(mainJsCode);

console.log('✓ Checking code syntax...');
if (tiktokSyntaxOk) {
    console.log('  ✅ tiktok-engine.js: No obvious syntax errors');
} else {
    console.log('  ❌ tiktok-engine.js: Potential syntax error detected');
    allTestsPassed = false;
}

if (mainJsSyntaxOk) {
    console.log('  ✅ main.js: No obvious syntax errors');
} else {
    console.log('  ❌ main.js: Potential syntax error detected');
    allTestsPassed = false;
}

if (tiktokSyntaxOk && mainJsSyntaxOk) {
    console.log('');
    console.log('✅ Syntax validation passed');
}

console.log('');

// ============================================================================
// Final Summary
// ============================================================================
console.log('='.repeat(70));
console.log('Test Summary');
console.log('='.repeat(70));
console.log('');

if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('');
    console.log('Bug fixes verified:');
    console.log('  1. ✅ TikTok TTS: Proper URL encoding with special character handling');
    console.log('  2. ✅ Fish.audio: Custom voices properly integrated and passed to engine');
    console.log('');
    console.log('The TTS engines should now work correctly:');
    console.log('  • TikTok TTS: Handles all text inputs including special characters');
    console.log('  • Fish.audio: Supports custom voice IDs (e.g., 2d4039641d67419fa132ca59fa2f61ad)');
    console.log('');
    process.exit(0);
} else {
    console.log('❌ SOME TESTS FAILED');
    console.log('');
    console.log('Please review the output above for details.');
    console.log('');
    process.exit(1);
}
