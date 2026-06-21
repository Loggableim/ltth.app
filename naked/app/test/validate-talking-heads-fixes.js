#!/usr/bin/env node
/**
 * Validation Script: Talking Heads Fixes
 * Validates the code changes without requiring full dependencies
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Validating Talking Heads Fixes...\n');

let passed = 0;
let failed = 0;

// Test 1: Check TTS playback metadata includes source field
console.log('Test 1: TTS playback metadata includes source field');
const ttsMainPath = path.join(__dirname, '../plugins/tts/main.js');
const ttsMain = fs.readFileSync(ttsMainPath, 'utf8');

if (ttsMain.includes('source: item.source')) {
  console.log('✅ PASS: TTS playback metadata includes source field\n');
  passed++;
} else {
  console.log('❌ FAIL: TTS playback metadata missing source field\n');
  failed++;
}

// Test 2: Check Talking Heads logs preview requests
console.log('Test 2: Talking Heads logs preview requests');
const thMainPath = path.join(__dirname, '../plugins/talking-heads/main.js');
const thMain = fs.readFileSync(thMainPath, 'utf8');

if (thMain.includes('Preview TTS request received')) {
  console.log('✅ PASS: Talking Heads logs preview requests\n');
  passed++;
} else {
  console.log('❌ FAIL: Talking Heads preview logging missing\n');
  failed++;
}

// Test 3: Check socket event emission after avatar generation
console.log('Test 3: Socket event emission after avatar generation');
const generateRoutePattern = /talkingheads:avatar:generated/g;
const matches = thMain.match(generateRoutePattern);

if (matches && matches.length >= 2) {
  console.log(`✅ PASS: Socket event emitted in ${matches.length} places (generate & assign)\n`);
  passed++;
} else {
  console.log(`❌ FAIL: Socket event not emitted correctly (found ${matches ? matches.length : 0} occurrences)\n`);
  failed++;
}

// Test 4: Check UI has socket listener for avatar generation
console.log('Test 4: UI has socket listener for avatar generation');
const uiJsPath = path.join(__dirname, '../plugins/talking-heads/assets/ui.js');
const uiJs = fs.readFileSync(uiJsPath, 'utf8');

if (uiJs.includes('talkingheads:avatar:generated') && uiJs.includes('loadAvatarList')) {
  console.log('✅ PASS: UI has socket listener that refreshes avatar list\n');
  passed++;
} else {
  console.log('❌ FAIL: UI socket listener missing or incomplete\n');
  failed++;
}

// Test 5: Check enhanced logging in _generateAvatarAndSprites
console.log('Test 5: Enhanced logging in _generateAvatarAndSprites');
const loggingPatterns = [
  'Starting avatar generation for',
  'Avatar generated successfully:',
  'Starting sprite generation for',
  'Sprites generated successfully for'
];

const hasAllLogging = loggingPatterns.every(pattern => thMain.includes(pattern));

if (hasAllLogging) {
  console.log('✅ PASS: All enhanced logging messages present\n');
  passed++;
} else {
  console.log('❌ FAIL: Some logging messages missing\n');
  failed++;
}

// Test 6: Verify error handling with stack traces
console.log('Test 6: Error handling with stack traces');
if (thMain.includes('stack: error.stack')) {
  console.log('✅ PASS: Error logging includes stack traces\n');
  passed++;
} else {
  console.log('❌ FAIL: Error logging missing stack traces\n');
  failed++;
}

// Summary
console.log('═══════════════════════════════════════');
console.log(`Total Tests: ${passed + failed}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log('═══════════════════════════════════════\n');

if (failed > 0) {
  console.log('❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('✅ All validation tests passed!');
  process.exit(0);
}
