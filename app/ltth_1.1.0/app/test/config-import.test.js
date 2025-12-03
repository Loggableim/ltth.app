/**
 * Test suite for Config Import Plugin
 * Tests path sanitization, validation, and import functionality
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧪 Running Config Import Plugin Tests...\n');

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

// Load the plugin
const ConfigImportPlugin = require('../plugins/config-import/main.js');

// Mock API for testing
const mockApi = {
    logs: [],
    log: function(msg, level) {
        this.logs.push({ msg, level });
    },
    registerRoute: function() {}
};

// Create plugin instance
const plugin = new ConfigImportPlugin(mockApi);

// Test 1: Plugin can be instantiated
runTest('Plugin should be instantiable', () => {
    assert(plugin instanceof ConfigImportPlugin, 'Plugin should be instance of ConfigImportPlugin');
});

// Test 2: Path sanitization - valid Linux paths
runTest('Should accept valid Linux absolute paths', () => {
    const testPath = '/home/user/old-install';
    const result = plugin.sanitizePath(testPath);
    assert(result !== null, 'Valid Linux path should not be null');
    assert(result === path.resolve(testPath), 'Path should be resolved to absolute path');
});

// Test 3: Path sanitization - valid Windows paths
runTest('Should accept valid Windows paths with drive letters', () => {
    const result = plugin.sanitizePath('C:\\Users\\User\\old-install');
    assert(result !== null, 'Valid Windows path should not be null');
});

// Test 4: Path sanitization - Windows path with forward slashes
runTest('Should accept Windows paths with forward slashes', () => {
    const result = plugin.sanitizePath('C:/Users/User/old-install');
    assert(result !== null, 'Windows path with forward slashes should not be null');
});

// Test 5: Path sanitization - reject directory traversal
runTest('Should reject directory traversal attempts with ../', () => {
    const result = plugin.sanitizePath('../../../etc/passwd');
    assert(result === null, 'Directory traversal should be rejected');
});

// Test 6: Path sanitization - reject directory traversal in absolute path
runTest('Should reject directory traversal in absolute paths', () => {
    const result = plugin.sanitizePath('/home/user/../../../etc/passwd');
    assert(result === null, 'Directory traversal in absolute path should be rejected');
});

// Test 7: Path sanitization - reject empty paths
runTest('Should reject empty paths', () => {
    const result = plugin.sanitizePath('');
    assert(result === null, 'Empty path should be rejected');
});

// Test 8: Path sanitization - reject non-string inputs
runTest('Should reject non-string inputs', () => {
    const result = plugin.sanitizePath(123);
    assert(result === null, 'Non-string input should be rejected');
});

// Test 9: Path sanitization - reject paths with invalid characters
runTest('Should reject paths with invalid < character', () => {
    const result = plugin.sanitizePath('path<test');
    assert(result === null, 'Path with < should be rejected');
});

runTest('Should reject paths with invalid > character', () => {
    const result = plugin.sanitizePath('path>test');
    assert(result === null, 'Path with > should be rejected');
});

runTest('Should reject paths with invalid | character', () => {
    const result = plugin.sanitizePath('path|test');
    assert(result === null, 'Path with | should be rejected');
});

runTest('Should reject paths with invalid ? character', () => {
    const result = plugin.sanitizePath('path?test');
    assert(result === null, 'Path with ? should be rejected');
});

runTest('Should reject paths with invalid * character', () => {
    const result = plugin.sanitizePath('path*test');
    assert(result === null, 'Path with * should be rejected');
});

runTest('Should reject paths with invalid " character', () => {
    const result = plugin.sanitizePath('path"test');
    assert(result === null, 'Path with " should be rejected');
});

// Test 10: Path validation - non-existent path
runTest('Should report non-existent paths as invalid', () => {
    const validation = plugin.validateImportPath('/non/existent/path/that/does/not/exist');
    assert(validation.valid === false, 'Non-existent path should be invalid');
    assert(validation.error === 'Path does not exist', 'Should have correct error message');
});

// Test 11: Create temporary test directories for validation tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-test-'));
const tmpDirWithConfigs = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-test-with-configs-'));

// Create test structure
fs.mkdirSync(path.join(tmpDirWithConfigs, 'user_configs'), { recursive: true });
fs.writeFileSync(path.join(tmpDirWithConfigs, 'user_configs', 'test.json'), '{}');
fs.mkdirSync(path.join(tmpDirWithConfigs, 'user_data'), { recursive: true });
fs.writeFileSync(path.join(tmpDirWithConfigs, 'user_data', 'test.db'), 'test');

runTest('Should validate empty directory as invalid', () => {
    const validation = plugin.validateImportPath(tmpDir);
    assert(validation.valid === false, 'Empty directory should be invalid');
    assert(validation.error === 'No configuration files found in the specified path', 'Should have correct error message');
});

runTest('Should validate directory with config files as valid', () => {
    const validation = plugin.validateImportPath(tmpDirWithConfigs);
    assert(validation.valid === true, 'Directory with configs should be valid');
    assert(validation.findings.userConfigs === true, 'Should find user_configs');
    assert(validation.findings.userData === true, 'Should find user_data');
});

// Test 12: File validation should identify correct directories
runTest('Should correctly identify found directories', () => {
    const validation = plugin.validateImportPath(tmpDirWithConfigs);
    assert(validation.findings.userConfigs === true, 'user_configs should be found');
    assert(validation.findings.userData === true, 'user_data should be found');
    assert(validation.findings.uploads === false, 'uploads should not be found');
    assert(Array.isArray(validation.findings.files), 'files should be an array');
    assert(validation.findings.files.length > 0, 'Should have found files');
});

// Test 13: copyDirectoryContents basic functionality
runTest('Should copy directory contents correctly', () => {
    const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-src-'));
    const destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-dest-'));
    
    // Create test files
    fs.writeFileSync(path.join(srcDir, 'test1.txt'), 'content1');
    fs.writeFileSync(path.join(srcDir, 'test2.txt'), 'content2');
    fs.mkdirSync(path.join(srcDir, 'subdir'));
    fs.writeFileSync(path.join(srcDir, 'subdir', 'test3.txt'), 'content3');
    
    const count = plugin.copyDirectoryContents(srcDir, destDir);
    
    assert(count === 3, 'Should have copied 3 files');
    assert(fs.existsSync(path.join(destDir, 'test1.txt')), 'test1.txt should exist');
    assert(fs.existsSync(path.join(destDir, 'test2.txt')), 'test2.txt should exist');
    assert(fs.existsSync(path.join(destDir, 'subdir', 'test3.txt')), 'subdir/test3.txt should exist');
    
    // Verify content
    assert(fs.readFileSync(path.join(destDir, 'test1.txt'), 'utf8') === 'content1', 'Content should match');
    
    // Cleanup
    fs.rmSync(srcDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
});

// Test 14: getConfigPathManager should return valid instance
runTest('Should get ConfigPathManager instance', () => {
    const configPathManager = plugin.getConfigPathManager();
    assert(configPathManager !== null, 'ConfigPathManager should not be null');
    assert(typeof configPathManager.getUserConfigsDir === 'function', 'Should have getUserConfigsDir method');
    assert(typeof configPathManager.getUserDataDir === 'function', 'Should have getUserDataDir method');
    assert(typeof configPathManager.getUploadsDir === 'function', 'Should have getUploadsDir method');
});

// ========== NEW TESTS FOR LEGACY FORMAT SUPPORT ==========

// Test 15: Should validate legacy database.db file
const tmpDirWithLegacyDb = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-legacy-db-'));
fs.writeFileSync(path.join(tmpDirWithLegacyDb, 'database.db'), 'sqlite3 mock data');

runTest('Should validate directory with legacy database.db as valid', () => {
    const validation = plugin.validateImportPath(tmpDirWithLegacyDb);
    assert(validation.valid === true, 'Directory with legacy database.db should be valid');
    assert(validation.findings.legacyDatabase === true, 'Should find legacy database');
    assert(validation.findings.files.includes('database.db'), 'Files should include database.db');
});

// Test 16: Should validate legacy data directory
const tmpDirWithLegacyData = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-legacy-data-'));
fs.mkdirSync(path.join(tmpDirWithLegacyData, 'data'));
fs.writeFileSync(path.join(tmpDirWithLegacyData, 'data', 'session.json'), '{}');

runTest('Should validate directory with legacy data folder as valid', () => {
    const validation = plugin.validateImportPath(tmpDirWithLegacyData);
    assert(validation.valid === true, 'Directory with legacy data folder should be valid');
    assert(validation.findings.legacyData === true, 'Should find legacy data folder');
    assert(validation.findings.files.some(f => f.startsWith('data/')), 'Files should include data/ files');
});

// Test 17: Should validate mixed legacy and new format
const tmpDirMixed = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-mixed-'));
fs.writeFileSync(path.join(tmpDirMixed, 'database.db'), 'sqlite3 mock data');
fs.mkdirSync(path.join(tmpDirMixed, 'user_configs'));
fs.writeFileSync(path.join(tmpDirMixed, 'user_configs', 'profile1.db'), 'profile data');

runTest('Should validate directory with both legacy and new format', () => {
    const validation = plugin.validateImportPath(tmpDirMixed);
    assert(validation.valid === true, 'Directory with mixed format should be valid');
    assert(validation.findings.legacyDatabase === true, 'Should find legacy database');
    assert(validation.findings.userConfigs === true, 'Should find user_configs');
});

// Test 18: Should detect legacy database WAL and SHM files
const tmpDirWithWal = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-wal-'));
fs.writeFileSync(path.join(tmpDirWithWal, 'database.db'), 'sqlite3 mock data');
fs.writeFileSync(path.join(tmpDirWithWal, 'database.db-wal'), 'wal data');
fs.writeFileSync(path.join(tmpDirWithWal, 'database.db-shm'), 'shm data');

runTest('Should include WAL and SHM files in legacy database detection', () => {
    const validation = plugin.validateImportPath(tmpDirWithWal);
    assert(validation.valid === true, 'Should be valid');
    assert(validation.findings.legacyDatabase === true, 'Should find legacy database');
    assert(validation.findings.files.includes('database.db'), 'Should include database.db');
    assert(validation.findings.files.includes('database.db-wal'), 'Should include WAL file');
    assert(validation.findings.files.includes('database.db-shm'), 'Should include SHM file');
});

// ========== TESTS FOR PLUGINS DIRECTORY SUPPORT ==========

// Test 19: Should validate plugins directory
const tmpDirWithPlugins = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-plugins-'));
fs.mkdirSync(path.join(tmpDirWithPlugins, 'plugins', 'quiz_show', 'data'), { recursive: true });
fs.writeFileSync(path.join(tmpDirWithPlugins, 'plugins', 'quiz_show', 'data', 'quiz_show.db'), 'sqlite3 mock data');

runTest('Should validate directory with plugins folder as valid', () => {
    const validation = plugin.validateImportPath(tmpDirWithPlugins);
    assert(validation.valid === true, 'Directory with plugins folder should be valid');
    assert(validation.findings.plugins === true, 'Should find plugins folder');
    assert(validation.findings.files.some(f => f.startsWith('plugins/')), 'Files should include plugins/ files');
});

// Test 20: Should detect plugin data files correctly
runTest('Should correctly detect plugin data files', () => {
    const validation = plugin.validateImportPath(tmpDirWithPlugins);
    assert(validation.valid === true, 'Should be valid');
    assert(validation.findings.plugins === true, 'Should find plugins');
    assert(validation.findings.files.includes('plugins/quiz_show/data/quiz_show.db'), 
           'Should include quiz_show.db in files list');
});

// Test 21: Should validate directory with multiple plugins
const tmpDirWithMultiplePlugins = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-multi-plugins-'));
fs.mkdirSync(path.join(tmpDirWithMultiplePlugins, 'plugins', 'quiz_show', 'data'), { recursive: true });
fs.mkdirSync(path.join(tmpDirWithMultiplePlugins, 'plugins', 'another_plugin', 'data'), { recursive: true });
fs.writeFileSync(path.join(tmpDirWithMultiplePlugins, 'plugins', 'quiz_show', 'data', 'quiz.db'), 'data1');
fs.writeFileSync(path.join(tmpDirWithMultiplePlugins, 'plugins', 'another_plugin', 'data', 'plugin.db'), 'data2');

runTest('Should validate directory with multiple plugins', () => {
    const validation = plugin.validateImportPath(tmpDirWithMultiplePlugins);
    assert(validation.valid === true, 'Directory with multiple plugins should be valid');
    assert(validation.findings.plugins === true, 'Should find plugins');
    assert(validation.findings.files.some(f => f.includes('quiz_show')), 'Should include quiz_show files');
    assert(validation.findings.files.some(f => f.includes('another_plugin')), 'Should include another_plugin files');
});

// Test 22: Should handle plugins directory without data subdirectories
const tmpDirPluginsNoData = fs.mkdtempSync(path.join(os.tmpdir(), 'config-import-plugins-no-data-'));
fs.mkdirSync(path.join(tmpDirPluginsNoData, 'plugins', 'empty_plugin'), { recursive: true });

runTest('Should handle plugins directory without data subdirectories', () => {
    const validation = plugin.validateImportPath(tmpDirPluginsNoData);
    // Should be invalid because the plugin has no data directory with files
    assert(validation.valid === false, 'Should be invalid when plugins have no data');
    assert(validation.error === 'No configuration files found in the specified path', 
           'Should have appropriate error message');
});

// Cleanup plugin test directories
try {
    fs.rmSync(tmpDirWithPlugins, { recursive: true, force: true });
    fs.rmSync(tmpDirWithMultiplePlugins, { recursive: true, force: true });
    fs.rmSync(tmpDirPluginsNoData, { recursive: true, force: true });
} catch (error) {
    console.warn('Warning: Failed to cleanup plugin test directories:', error.message);
}

// Cleanup legacy test directories
try {
    fs.rmSync(tmpDirWithLegacyDb, { recursive: true, force: true });
    fs.rmSync(tmpDirWithLegacyData, { recursive: true, force: true });
    fs.rmSync(tmpDirMixed, { recursive: true, force: true });
    fs.rmSync(tmpDirWithWal, { recursive: true, force: true });
} catch (error) {
    console.warn('Warning: Failed to cleanup legacy test directories:', error.message);
}

// Cleanup temporary directories
try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tmpDirWithConfigs, { recursive: true, force: true });
} catch (error) {
    console.warn('Warning: Failed to cleanup temporary directories:', error.message);
}

// Print summary
console.log('\n📊 Test Summary:');
console.log(`   Total: ${passed + failed}`);
console.log(`   Passed: ${passed}`);
console.log(`   Failed: ${failed}`);

if (failed === 0) {
    console.log('\n✅ All tests passed!');
    process.exit(0);
} else {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
}
