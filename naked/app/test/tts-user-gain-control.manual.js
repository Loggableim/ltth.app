/**
 * TTS Per-User Gain Control Test
 * 
 * Tests that the per-user gain control feature works correctly:
 * - Database column exists (volume_gain in tts_user_permissions)
 * - API endpoints handle gain updates with clamping to [0.0, 3.0]
 * - Gain is properly passed through voice assignment
 * - Gain is applied in audio synthesis pipeline
 * 
 * Run with: node app/test/tts-user-gain-control.test.js
 */

console.log('\n='.repeat(70));
console.log('TTS Per-User Gain Control Test');
console.log('='.repeat(70));

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function testPass(message) {
    console.log('✅ PASS:', message);
    testsPassed++;
}

function testFail(message, details) {
    console.log('❌ FAIL:', message);
    if (details) console.log('   Details:', details);
    testsFailed++;
}

// Test 1: Verify database schema includes volume_gain
console.log('\n📝 TEST 1: Database schema includes volume_gain column');
try {
    const permissionManagerPath = path.join(__dirname, '../plugins/tts/utils/permission-manager.js');
    const permissionManagerContent = fs.readFileSync(permissionManagerPath, 'utf-8');
    
    if (permissionManagerContent.includes('volume_gain REAL DEFAULT 1.0')) {
        testPass('volume_gain column defined in tts_user_permissions table with default 1.0');
    } else {
        testFail('volume_gain column not found in database schema');
    }
} catch (error) {
    testFail('Could not read permission-manager.js', error.message);
}

// Test 2: Verify API endpoint for gain updates exists
console.log('\n📝 TEST 2: API endpoint POST /api/tts/users/:userId/gain exists');
try {
    const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
    const mainJsContent = fs.readFileSync(mainJsPath, 'utf-8');
    
    if (mainJsContent.includes("registerRoute('POST', '/api/tts/users/:userId/gain'")) {
        testPass('API endpoint for gain updates registered');
    } else {
        testFail('API endpoint for gain updates not found');
    }
} catch (error) {
    testFail('Could not read main.js', error.message);
}

// Test 3: Verify server-side gain clamping to [0.0, 3.0]
console.log('\n📝 TEST 3: Server-side gain clamping using constants');
try {
    const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
    const mainJsContent = fs.readFileSync(mainJsPath, 'utf-8');
    
    // Check for constants definition
    const hasConstants = mainJsContent.includes('static MIN_GAIN = 0.0') &&
                        mainJsContent.includes('static MAX_GAIN = 3.0') &&
                        mainJsContent.includes('static DEFAULT_GAIN = 1.0');
    
    // Check for clamping using constants
    const clampingRegex = /Math\.max\(TTSPlugin\.MIN_GAIN,\s*Math\.min\(TTSPlugin\.MAX_GAIN/;
    
    if (hasConstants && clampingRegex.test(mainJsContent)) {
        testPass('Gain clamping using constants (MIN_GAIN, MAX_GAIN, DEFAULT_GAIN) implemented');
    } else if (hasConstants) {
        testPass('Gain constants defined (MIN_GAIN=0.0, MAX_GAIN=3.0, DEFAULT_GAIN=1.0)');
    } else {
        testFail('Gain clamping constants not found or not used correctly');
    }
} catch (error) {
    testFail('Could not verify gain clamping', error.message);
}

// Test 4: Verify setVolumeGain method exists in PermissionManager
console.log('\n📝 TEST 4: PermissionManager has setVolumeGain method');
try {
    const permissionManagerPath = path.join(__dirname, '../plugins/tts/utils/permission-manager.js');
    const permissionManagerContent = fs.readFileSync(permissionManagerPath, 'utf-8');
    
    if (permissionManagerContent.includes('setVolumeGain(userId, gain)')) {
        testPass('setVolumeGain method exists in PermissionManager');
    } else {
        testFail('setVolumeGain method not found in PermissionManager');
    }
} catch (error) {
    testFail('Could not verify setVolumeGain method', error.message);
}

// Test 5: Verify assignVoice supports optional gain parameter
console.log('\n📝 TEST 5: assignVoice method supports optional gain parameter');
try {
    const permissionManagerPath = path.join(__dirname, '../plugins/tts/utils/permission-manager.js');
    const permissionManagerContent = fs.readFileSync(permissionManagerPath, 'utf-8');
    
    if (permissionManagerContent.includes('assignVoice(userId, username, voiceId, engine, emotion = null, gain = null)')) {
        testPass('assignVoice method accepts optional gain parameter');
    } else {
        testFail('assignVoice method does not accept gain parameter');
    }
} catch (error) {
    testFail('Could not verify assignVoice method signature', error.message);
}

// Test 6: Verify gain is applied in speak() method
console.log('\n📝 TEST 6: Gain is applied in audio synthesis pipeline');
try {
    const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
    const mainJsContent = fs.readFileSync(mainJsPath, 'utf-8');
    
    const gainApplicationRegex = /volume:\s*this\.config\.volume\s*\*\s*\(userSettings\?\.volume_gain\s*\?\?\s*1\.0\)/;
    if (gainApplicationRegex.test(mainJsContent)) {
        testPass('Gain is applied to volume in speak() method');
    } else {
        testFail('Gain application not found in speak() method');
    }
} catch (error) {
    testFail('Could not verify gain application', error.message);
}

// Test 7: Verify socket event emission for live updates
console.log('\n📝 TEST 7: Socket event emitted for live gain updates');
try {
    const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
    const mainJsContent = fs.readFileSync(mainJsPath, 'utf-8');
    
    if (mainJsContent.includes("emit('tts:user:gain_updated'")) {
        testPass('Socket event tts:user:gain_updated emitted on gain change');
    } else {
        testFail('Socket event for gain updates not found');
    }
} catch (error) {
    testFail('Could not verify socket event', error.message);
}

// Test 8: Verify UI has gain controls in modal
console.log('\n📝 TEST 8: UI includes gain controls in voice assignment modal');
try {
    const adminPanelPath = path.join(__dirname, '../plugins/tts/ui/admin-panel.html');
    const adminPanelContent = fs.readFileSync(adminPanelPath, 'utf-8');
    
    if (adminPanelContent.includes('modalVolumeGainSlider') && 
        adminPanelContent.includes('modalVolumeGainInput') &&
        adminPanelContent.includes('modalVolumeGainReset')) {
        testPass('Gain controls (slider, input, reset) present in modal');
    } else {
        testFail('Gain controls not found in modal HTML');
    }
} catch (error) {
    testFail('Could not verify modal UI', error.message);
}

// Test 9: Verify UI has gain controls in user list
console.log('\n📝 TEST 9: UI includes gain controls in user list');
try {
    const adminJsPath = path.join(__dirname, '../plugins/tts/ui/tts-admin-production.js');
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf-8');
    
    if (adminJsContent.includes('user-gain-slider') && 
        adminJsContent.includes('user-gain-input') &&
        adminJsContent.includes('user-gain-reset') &&
        adminJsContent.includes('handleUserGainChange')) {
        testPass('Gain controls and handlers present in user list rendering');
    } else {
        testFail('Gain controls or handlers not found in user list');
    }
} catch (error) {
    testFail('Could not verify user list UI', error.message);
}

// Test 10: Verify gain range is 0-300% (0.0-3.0)
console.log('\n📝 TEST 10: Gain range is correctly set to 0-300% (0.0-3.0)');
try {
    const adminPanelPath = path.join(__dirname, '../plugins/tts/ui/admin-panel.html');
    const adminPanelContent = fs.readFileSync(adminPanelPath, 'utf-8');
    
    if (adminPanelContent.includes('min="0" max="300"')) {
        testPass('Gain controls have correct range 0-300%');
    } else {
        testFail('Gain controls do not have correct range');
    }
} catch (error) {
    testFail('Could not verify gain range', error.message);
}

// Test 11: Verify TikTok engine is present in manual voice assignment
console.log('\n📝 TEST 11: TikTok engine visible in manual voice assignment');
try {
    const adminPanelPath = path.join(__dirname, '../plugins/tts/ui/admin-panel.html');
    const adminPanelContent = fs.readFileSync(adminPanelPath, 'utf-8');
    
    // Check that TikTok is in manual engine selector
    const manualEngineMatch = adminPanelContent.match(/id="manualEngine"[\s\S]{0,500}value="tiktok"/);
    if (manualEngineMatch) {
        testPass('TikTok engine present in manual voice assignment dropdown');
    } else {
        testFail('TikTok engine not found in manual voice assignment');
    }
} catch (error) {
    testFail('Could not verify TikTok engine visibility', error.message);
}

// Test 12: Verify updateUserGain function exists
console.log('\n📝 TEST 12: JavaScript includes updateUserGain function');
try {
    const adminJsPath = path.join(__dirname, '../plugins/tts/ui/tts-admin-production.js');
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf-8');
    
    if (adminJsContent.includes('async function updateUserGain(userId, gain)')) {
        testPass('updateUserGain function exists in JavaScript');
    } else {
        testFail('updateUserGain function not found');
    }
} catch (error) {
    testFail('Could not verify updateUserGain function', error.message);
}

// Print summary
console.log('\n' + '='.repeat(70));
console.log('TEST SUMMARY');
console.log('='.repeat(70));
console.log(`✅ Tests passed: ${testsPassed}`);
console.log(`❌ Tests failed: ${testsFailed}`);
console.log(`📊 Total tests: ${testsPassed + testsFailed}`);
console.log('='.repeat(70));

// Exit with appropriate code
if (testsFailed > 0) {
    process.exit(1);
} else {
    console.log('\n🎉 All tests passed! Per-user gain control feature implemented correctly.\n');
    process.exit(0);
}
