/**
 * Test: TikTok Engine ConfigPathManager Integration
 * 
 * Verifies that TikTok engine receives ConfigPathManager during initialization
 * This is needed for SessionExtractor to work properly with Eulerstream
 * 
 * Run with: node app/test/tiktok-configpathmanager-fix.test.js
 */

const fs = require('fs');
const path = require('path');

console.log('\n' + '='.repeat(70));
console.log('TikTok Engine ConfigPathManager Integration Test');
console.log('='.repeat(70));
console.log('');

const mainJsPath = path.join(__dirname, '../plugins/tts/main.js');
const mainJsCode = fs.readFileSync(mainJsPath, 'utf-8');

let allTestsPassed = true;

// Test 1: Check initial TikTok engine initialization
console.log('Test 1: Initial TikTok Engine Initialization');
console.log('-'.repeat(70));

const initMatch = mainJsCode.match(/this\.engines\.tiktok\s*=\s*new\s+TikTokEngine\(\s*this\.logger,\s*\{([^}]+)\}\s*\);/);
if (initMatch) {
    const configBlock = initMatch[1];
    const hasDb = configBlock.includes('db: this.api.getDatabase()');
    const hasConfigPathManager = configBlock.includes('configPathManager: this.api.getConfigPathManager()');
    const hasPerformanceMode = configBlock.includes('performanceMode: this.config.performanceMode');
    
    console.log('✓ Checking initial engine initialization parameters:');
    if (hasDb) {
        console.log('  ✅ db: this.api.getDatabase()');
    } else {
        console.log('  ❌ Missing: db parameter');
        allTestsPassed = false;
    }
    
    if (hasConfigPathManager) {
        console.log('  ✅ configPathManager: this.api.getConfigPathManager()');
    } else {
        console.log('  ❌ Missing: configPathManager parameter (REQUIRED for SessionExtractor)');
        allTestsPassed = false;
    }
    
    if (hasPerformanceMode) {
        console.log('  ✅ performanceMode: this.config.performanceMode');
    } else {
        console.log('  ❌ Missing: performanceMode parameter');
        allTestsPassed = false;
    }
} else {
    console.log('  ❌ Could not find initial TikTok engine initialization');
    allTestsPassed = false;
}

console.log('');

// Test 2: Check dynamic TikTok engine initialization (config update)
console.log('Test 2: Dynamic TikTok Engine Initialization (Config Update)');
console.log('-'.repeat(70));

// Find all TikTok engine initializations
const allInits = mainJsCode.match(/this\.engines\.tiktok\s*=\s*new\s+TikTokEngine\([^)]+\)/g) || [];
console.log(`✓ Found ${allInits.length} TikTok engine initialization(s)`);

let configUpdateInitFound = false;
for (let i = 0; i < allInits.length; i++) {
    const init = allInits[i];
    if (init.includes('configPathManager')) {
        console.log(`  ✅ Initialization ${i+1}: Has configPathManager`);
    } else {
        console.log(`  ❌ Initialization ${i+1}: Missing configPathManager`);
        allTestsPassed = false;
    }
}

console.log('');

// Test 3: Verify SessionExtractor receives ConfigPathManager
console.log('Test 3: SessionExtractor Usage in TikTok Engine');
console.log('-'.repeat(70));

const enginePath = path.join(__dirname, '../plugins/tts/engines/tiktok-engine.js');
const engineCode = fs.readFileSync(enginePath, 'utf-8');

const extractorMatch = engineCode.match(/new\s+SessionExtractor\(\s*this\.db,\s*this\.config\.configPathManager\s*\|\|\s*null\s*\)/);
if (extractorMatch) {
    console.log('✅ SessionExtractor correctly receives this.config.configPathManager');
    console.log('   Location: tiktok-engine.js _ensureSessionId() method');
} else {
    console.log('❌ SessionExtractor not properly configured');
    allTestsPassed = false;
}

console.log('');

// Summary
console.log('='.repeat(70));
console.log('Test Summary');
console.log('='.repeat(70));
console.log('');

if (allTestsPassed) {
    console.log('✅ ALL TESTS PASSED');
    console.log('');
    console.log('Fix verified:');
    console.log('  • TikTok engine receives ConfigPathManager during initialization');
    console.log('  • SessionExtractor can access ConfigPathManager for Eulerstream');
    console.log('  • SessionID from Eulerstream should now be properly accessible');
    console.log('');
    console.log('Expected behavior:');
    console.log('  1. SessionID stored by Eulerstream in database');
    console.log('  2. TikTok engine loads SessionID from database on init');
    console.log('  3. If SessionID missing, SessionExtractor uses Eulerstream API');
    console.log('  4. ConfigPathManager enables proper data path resolution');
    console.log('');
    process.exit(0);
} else {
    console.log('❌ SOME TESTS FAILED');
    console.log('');
    console.log('Please review the output above for details.');
    console.log('');
    process.exit(1);
}
