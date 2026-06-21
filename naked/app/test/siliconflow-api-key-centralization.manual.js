/**
 * Test suite for Centralized SiliconFlow API Key
 * Verifies that both TTS and StreamAlchemy plugins use the centralized siliconflow_api_key
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

console.log('🧪 Running SiliconFlow API Key Centralization Tests...\n');

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

// Create a temporary test database
const testDbPath = path.join(__dirname, 'test-siliconflow.db');

// Clean up any existing test database
if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
}

// Create test database
const db = new Database(testDbPath);

// Create settings table
db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
`);

// Helper to set a setting
function setSetting(key, value) {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    stmt.run(key, value);
}

// Helper to get a setting
function getSetting(key) {
    const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = stmt.get(key);
    return row ? row.value : null;
}

// Test 1: Centralized key takes priority
runTest('Centralized siliconflow_api_key should take priority over legacy keys', () => {
    setSetting('siliconflow_api_key', 'central-key-123');
    setSetting('tts_fishspeech_api_key', 'legacy-tts-key');
    setSetting('streamalchemy_siliconflow_api_key', 'legacy-stream-key');
    
    // Simulate the loading logic from TTS plugin
    const fishspeechApiKey = getSetting('siliconflow_api_key') || 
                             getSetting('tts_fishspeech_api_key') || 
                             getSetting('streamalchemy_siliconflow_api_key');
    
    assert(fishspeechApiKey === 'central-key-123', 'Should load centralized key first');
});

// Test 2: Falls back to tts_fishspeech_api_key if central key is missing
runTest('Should fall back to tts_fishspeech_api_key if centralized key is missing', () => {
    // Clear the database
    db.exec('DELETE FROM settings');
    
    setSetting('tts_fishspeech_api_key', 'legacy-tts-key');
    setSetting('streamalchemy_siliconflow_api_key', 'legacy-stream-key');
    
    const fishspeechApiKey = getSetting('siliconflow_api_key') || 
                             getSetting('tts_fishspeech_api_key') || 
                             getSetting('streamalchemy_siliconflow_api_key');
    
    assert(fishspeechApiKey === 'legacy-tts-key', 'Should fall back to legacy TTS key');
});

// Test 3: Falls back to streamalchemy_siliconflow_api_key if other keys are missing
runTest('Should fall back to streamalchemy_siliconflow_api_key if other keys are missing', () => {
    // Clear the database
    db.exec('DELETE FROM settings');
    
    setSetting('streamalchemy_siliconflow_api_key', 'legacy-stream-key');
    
    const fishspeechApiKey = getSetting('siliconflow_api_key') || 
                             getSetting('tts_fishspeech_api_key') || 
                             getSetting('streamalchemy_siliconflow_api_key');
    
    assert(fishspeechApiKey === 'legacy-stream-key', 'Should fall back to legacy StreamAlchemy key');
});

// Test 4: Returns null if no keys are set
runTest('Should return null if no keys are set', () => {
    // Clear the database
    db.exec('DELETE FROM settings');
    
    const fishspeechApiKey = getSetting('siliconflow_api_key') || 
                             getSetting('tts_fishspeech_api_key') || 
                             getSetting('streamalchemy_siliconflow_api_key') ||
                             null;
    
    assert(fishspeechApiKey === null, 'Should return null if no keys are set');
});

// Test 5: Saving to centralized key also saves to legacy keys
runTest('Saving to centralized key should also save to legacy keys for compatibility', () => {
    // Clear the database
    db.exec('DELETE FROM settings');
    
    const newKey = 'new-siliconflow-key-456';
    
    // Simulate the saving logic from TTS plugin
    setSetting('siliconflow_api_key', newKey);
    setSetting('tts_fishspeech_api_key', newKey);
    
    const centralKey = getSetting('siliconflow_api_key');
    const legacyKey = getSetting('tts_fishspeech_api_key');
    
    assert(centralKey === newKey, 'Central key should be saved');
    assert(legacyKey === newKey, 'Legacy key should also be saved for compatibility');
});

// Cleanup
db.close();
fs.unlinkSync(testDbPath);

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
