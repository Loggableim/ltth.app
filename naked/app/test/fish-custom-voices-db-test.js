/**
 * Fish.audio Custom Voices Database Persistence Test
 * 
 * Tests actual database read/write for custom Fish.audio voices
 * Uses real SQLite database to test persistence
 * 
 * Run with: node app/test/fish-custom-voices-db-test.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('\n' + '='.repeat(70));
console.log('Fish.audio Custom Voices Database Persistence Test');
console.log('='.repeat(70));
console.log('\nTesting: Actual SQLite database read/write\n');

// Import the database module
const dbModule = require('../modules/database');

// Create a temporary database for testing
const tempDbPath = path.join(os.tmpdir(), `ltth_test_${Date.now()}.db`);
console.log(`Using temporary database: ${tempDbPath}\n`);

try {
    // Initialize database
    const Database = require('better-sqlite3');
    const db = new Database(tempDbPath);
    
    // Create settings table
    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    
    console.log('✓ Database initialized');
    
    // Test 1: Save config with customFishVoices
    console.log('\n--- Test 1: Save Configuration ---');
    
    const testConfig = {
        defaultEngine: 'fishaudio',
        defaultVoice: 'sarah',
        volume: 80,
        customFishVoices: {
            'my-test-voice': {
                name: 'my-test-voice',
                reference_id: '2d4039641d67419fa132ca59fa2f61ad',
                lang: 'de',
                gender: 'unknown',
                model: 's1',
                supportedEmotions: true
            },
            'another-voice': {
                name: 'another-voice',
                reference_id: '933563129e564b19a115bedd57b7406a',
                lang: 'en',
                gender: 'female',
                model: 's1',
                supportedEmotions: true
            }
        }
    };
    
    const configKey = 'plugin:tts:config';
    const configJson = JSON.stringify(testConfig);
    
    console.log(`Saving config with ${Object.keys(testConfig.customFishVoices).length} custom voices...`);
    
    const insertStmt = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    
    insertStmt.run(configKey, configJson);
    console.log('✓ Config saved to database');
    
    // Test 2: Verify data was written
    console.log('\n--- Test 2: Verify Database Write ---');
    
    const selectStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
    const row = selectStmt.get(configKey);
    
    if (!row) {
        console.error('❌ FAIL: No data found in database!');
        process.exit(1);
    }
    
    console.log('✓ Data exists in database');
    console.log(`  Raw value length: ${row.value.length} characters`);
    
    // Test 3: Parse saved data
    console.log('\n--- Test 3: Parse Saved Data ---');
    
    let parsedConfig;
    try {
        parsedConfig = JSON.parse(row.value);
        console.log('✓ JSON parse successful');
    } catch (error) {
        console.error('❌ FAIL: JSON parse error:', error.message);
        process.exit(1);
    }
    
    // Test 4: Verify customFishVoices structure
    console.log('\n--- Test 4: Verify customFishVoices Structure ---');
    
    if (!parsedConfig.customFishVoices) {
        console.error('❌ FAIL: customFishVoices is missing from parsed config!');
        console.log('Parsed config keys:', Object.keys(parsedConfig));
        process.exit(1);
    }
    
    console.log('✓ customFishVoices exists in parsed config');
    
    const voiceKeys = Object.keys(parsedConfig.customFishVoices);
    console.log(`  Voice count: ${voiceKeys.length}`);
    console.log(`  Voice keys: ${JSON.stringify(voiceKeys)}`);
    
    if (voiceKeys.length !== 2) {
        console.error(`❌ FAIL: Expected 2 voices, got ${voiceKeys.length}`);
        process.exit(1);
    }
    
    // Test 5: Verify voice details
    console.log('\n--- Test 5: Verify Voice Details ---');
    
    const voice1 = parsedConfig.customFishVoices['my-test-voice'];
    const voice2 = parsedConfig.customFishVoices['another-voice'];
    
    if (!voice1) {
        console.error('❌ FAIL: Voice "my-test-voice" is missing!');
        process.exit(1);
    }
    
    if (!voice2) {
        console.error('❌ FAIL: Voice "another-voice" is missing!');
        process.exit(1);
    }
    
    console.log('✓ Both voices exist');
    console.log(`  Voice 1: ${voice1.name} (${voice1.reference_id})`);
    console.log(`  Voice 2: ${voice2.name} (${voice2.reference_id})`);
    
    if (voice1.reference_id !== '2d4039641d67419fa132ca59fa2f61ad') {
        console.error('❌ FAIL: Voice 1 reference_id mismatch!');
        process.exit(1);
    }
    
    if (voice2.reference_id !== '933563129e564b19a115bedd57b7406a') {
        console.error('❌ FAIL: Voice 2 reference_id mismatch!');
        process.exit(1);
    }
    
    console.log('✓ Voice details match expected values');
    
    // Test 6: Simulate update (add new voice)
    console.log('\n--- Test 6: Update Configuration (Add Voice) ---');
    
    parsedConfig.customFishVoices['third-voice'] = {
        name: 'third-voice',
        reference_id: '8ef4a238714b45718ce04243307c57a7',
        lang: 'ja',
        gender: 'female',
        model: 's1',
        supportedEmotions: true
    };
    
    const updatedJson = JSON.stringify(parsedConfig);
    insertStmt.run(configKey, updatedJson);
    console.log('✓ Updated config saved');
    
    // Test 7: Reload and verify update
    console.log('\n--- Test 7: Reload and Verify Update ---');
    
    const reloadedRow = selectStmt.get(configKey);
    const reloadedConfig = JSON.parse(reloadedRow.value);
    
    const reloadedVoiceKeys = Object.keys(reloadedConfig.customFishVoices);
    console.log(`  Voice count after update: ${reloadedVoiceKeys.length}`);
    
    if (reloadedVoiceKeys.length !== 3) {
        console.error(`❌ FAIL: Expected 3 voices after update, got ${reloadedVoiceKeys.length}`);
        process.exit(1);
    }
    
    if (!reloadedConfig.customFishVoices['third-voice']) {
        console.error('❌ FAIL: New voice "third-voice" not found after reload!');
        process.exit(1);
    }
    
    console.log('✓ All 3 voices present after reload');
    console.log(`  Keys: ${JSON.stringify(reloadedVoiceKeys)}`);
    
    // Test 8: Simulate config merge (like _loadConfig does)
    console.log('\n--- Test 8: Config Merge Simulation ---');
    
    const defaultConfig = {
        defaultEngine: 'tiktok',
        defaultVoice: 'de_002',
        volume: 80,
        customFishVoices: {}  // Empty by default
    };
    
    const mergedConfig = { ...defaultConfig, ...reloadedConfig };
    
    console.log('  Default customFishVoices:', Object.keys(defaultConfig.customFishVoices));
    console.log('  Saved customFishVoices:', Object.keys(reloadedConfig.customFishVoices));
    console.log('  Merged customFishVoices:', Object.keys(mergedConfig.customFishVoices));
    
    if (Object.keys(mergedConfig.customFishVoices).length !== 3) {
        console.error('❌ FAIL: Merge lost custom voices!');
        console.error('  Merged has only:', Object.keys(mergedConfig.customFishVoices).length, 'voices');
        process.exit(1);
    }
    
    console.log('✓ Config merge preserves custom voices');
    
    // Cleanup
    db.close();
    fs.unlinkSync(tempDbPath);
    console.log('\n✓ Database cleaned up');
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('Test Summary');
    console.log('='.repeat(70));
    console.log('\n✅ All database persistence tests passed!');
    console.log('\n📝 Tested Scenarios:');
    console.log('  1. Save config with customFishVoices to SQLite ✓');
    console.log('  2. Verify data was written to database ✓');
    console.log('  3. Parse JSON data from database ✓');
    console.log('  4. Verify customFishVoices structure ✓');
    console.log('  5. Verify individual voice details ✓');
    console.log('  6. Update config (add new voice) ✓');
    console.log('  7. Reload and verify changes persist ✓');
    console.log('  8. Config merge preserves customFishVoices ✓');
    console.log('\n💡 Conclusion:');
    console.log('  Database persistence mechanism works correctly with SQLite.');
    console.log('  JSON serialization/deserialization preserves nested objects.');
    console.log('  Config merge properly overrides default empty object.');
    console.log('\n  If issue persists, check:');
    console.log('  - Application database file permissions');
    console.log('  - Database file path correctness');
    console.log('  - No code overwriting config after save');
    console.log('  - Browser not caching old config');
    console.log('  - Server actually calling _saveConfig()');
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ Database test complete');
    console.log('='.repeat(70));
    console.log('');
    
} catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    
    // Cleanup on error
    try {
        if (fs.existsSync(tempDbPath)) {
            fs.unlinkSync(tempDbPath);
        }
    } catch (cleanupError) {
        // Ignore cleanup errors
    }
    
    process.exit(1);
}

process.exit(0);
