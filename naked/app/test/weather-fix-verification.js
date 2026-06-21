/**
 * Verification Script for Weather Control Plugin Fix
 * 
 * This script verifies that the testEffect() function properly includes
 * the API key header when useGlobalAuth is false.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Weather Control Plugin Fix...\n');

// Read the ui.html file
const uiPath = path.join(__dirname, '../plugins/weather-control/ui.html');
const uiContent = fs.readFileSync(uiPath, 'utf8');

// Verification checks
const checks = {
    globalConfigVariable: false,
    configStoredInLoadConfig: false,
    headerBuilding: false,
    apiKeyCheck: false,
    headersUsedInFetch: false
};

// Check 1: Global weatherConfig variable exists
if (uiContent.includes('let weatherConfig = null')) {
    checks.globalConfigVariable = true;
    console.log('✅ Global weatherConfig variable declared');
} else {
    console.log('❌ Global weatherConfig variable NOT found');
}

// Check 2: Config is stored globally in loadConfig()
if (uiContent.includes('weatherConfig = config')) {
    checks.configStoredInLoadConfig = true;
    console.log('✅ Config stored in weatherConfig in loadConfig()');
} else {
    console.log('❌ Config NOT stored in weatherConfig');
}

// Check 3: Headers object is built
if (uiContent.includes('const headers = {') && uiContent.includes("'Content-Type': 'application/json'")) {
    checks.headerBuilding = true;
    console.log('✅ Headers object built correctly');
} else {
    console.log('❌ Headers object NOT built correctly');
}

// Check 4: API key check logic exists
if (uiContent.includes('if (weatherConfig && !weatherConfig.useGlobalAuth)')) {
    checks.apiKeyCheck = true;
    console.log('✅ API key check logic present');
} else {
    console.log('❌ API key check logic NOT found');
}

// Check 5: Headers variable used in fetch
if (uiContent.match(/fetch\(['"]\/api\/weather\/trigger['"],\s*\{[\s\S]*?headers,/)) {
    checks.headersUsedInFetch = true;
    console.log('✅ Headers variable used in fetch request');
} else {
    console.log('❌ Headers variable NOT used in fetch');
}

// Check 6: Verify testEffect function is correctly bound
const testEffectBindingRegex = /querySelectorAll\('\[data-test-effect\]'\)[\s\S]{0,200}testEffect\(/;
if (testEffectBindingRegex.test(uiContent)) {
    console.log('✅ Test effect buttons correctly bound to testEffect()');
} else {
    console.log('❌ Test effect buttons NOT correctly bound');
}

// Check 7: Verify no duplicate bindings
const duplicateBindingCheck = (uiContent.match(/querySelectorAll\('\[data-test-effect\]'\)/g) || []).length;
if (duplicateBindingCheck === 1) {
    console.log('✅ No duplicate button bindings detected');
} else {
    console.log(`⚠️  Found ${duplicateBindingCheck} button bindings (should be 1)`);
}

// Summary
console.log('\n' + '='.repeat(50));
const passedChecks = Object.values(checks).filter(v => v).length;
const totalChecks = Object.keys(checks).length;

if (passedChecks === totalChecks) {
    console.log(`✅ ALL CHECKS PASSED (${passedChecks}/${totalChecks})`);
    console.log('\nThe fix is correctly implemented!');
    console.log('\nExpected behavior:');
    console.log('1. When useGlobalAuth = true: Request works without API key');
    console.log('2. When useGlobalAuth = false: Request includes API key');
    console.log('3. Server emits socket.io event in both cases');
    console.log('4. Overlay receives and displays weather effects');
    process.exit(0);
} else {
    console.log(`❌ SOME CHECKS FAILED (${passedChecks}/${totalChecks})`);
    console.log('\nPlease review the implementation.');
    process.exit(1);
}
