#!/usr/bin/env node
/**
 * Test script for Config Import Plugin
 * 
 * This script tests the main functionality of the config import plugin:
 * - Path validation
 * - Subdirectory detection
 * - Profile naming
 * - Conflict handling
 * - Legacy database import
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Color output helpers
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function success(msg) { log(`✅ ${msg}`, 'green'); }
function error(msg) { log(`❌ ${msg}`, 'red'); }
function info(msg) { log(`ℹ️  ${msg}`, 'cyan'); }
function warn(msg) { log(`⚠️  ${msg}`, 'yellow'); }

// Setup test environment
const testDataPath = path.join(__dirname, '../../../old_Config');
const tmpTestRoot = path.join(os.tmpdir(), 'config-import-test');

// Mock ConfigPathManager
class MockConfigPathManager {
  constructor(basePath) {
    this.basePath = basePath;
  }
  getUserConfigsDir() { return path.join(this.basePath, 'user_configs'); }
  getUserDataDir() { return path.join(this.basePath, 'user_data'); }
  getUploadsDir() { return path.join(this.basePath, 'uploads'); }
  getPluginDataDir(pluginId) { return path.join(this.basePath, 'plugins', pluginId, 'data'); }
}

// Mock API
const mockApi = {
  log: (msg, level) => {
    if (level === 'error') error(msg);
    else if (level === 'warn') warn(msg);
    else info(msg);
  },
  registerRoute: () => {},
  getSocketIO: () => ({}),
  getDatabase: () => ({})
};

async function runTests() {
  log('\n=== Config Import Plugin Test Suite ===\n', 'cyan');
  
  const ConfigImportPlugin = require('./main.js');
  const plugin = new ConfigImportPlugin(mockApi);
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  // Test 1: Validate direct config path
  try {
    info('Test 1: Validate direct config path');
    const result = plugin.validateImportPath(testDataPath);
    
    if (result.valid && result.findings.userConfigs && result.findings.plugins) {
      success('Direct path validation works');
      testsPassed++;
    } else {
      error('Direct path validation failed');
      testsFailed++;
    }
  } catch (e) {
    error(`Test 1 exception: ${e.message}`);
    testsFailed++;
  }
  
  // Test 2: Validate path with app/ subdirectory
  try {
    info('Test 2: Validate path with app/ subdirectory');
    
    // Create test structure
    const testRootPath = path.join(tmpTestRoot, 'with-app-subdir');
    const testAppPath = path.join(testRootPath, 'app');
    
    // Safety check: ensure test path is within system temp directory
    const normalizedRoot = path.normalize(testRootPath);
    const normalizedTmpDir = path.normalize(os.tmpdir());
    if (!normalizedRoot.startsWith(normalizedTmpDir)) {
      throw new Error(`Test path must be within system temp directory (${normalizedTmpDir})`);
    }
    
    if (fs.existsSync(testRootPath)) {
      fs.rmSync(testRootPath, { recursive: true });
    }
    fs.mkdirSync(testAppPath, { recursive: true });
    
    // Copy test data to app subdirectory
    const srcUserConfigs = path.join(testDataPath, 'user_configs');
    const destUserConfigs = path.join(testAppPath, 'user_configs');
    if (fs.existsSync(srcUserConfigs)) {
      fs.cpSync(srcUserConfigs, destUserConfigs, { recursive: true });
    }
    
    const result = plugin.validateImportPath(testRootPath);
    
    if (result.valid && result.detectedSubdirectory === 'app' && result.actualPath.endsWith('app')) {
      success('Subdirectory detection works');
      testsPassed++;
    } else {
      error('Subdirectory detection failed');
      console.log('Result:', result);
      testsFailed++;
    }
  } catch (e) {
    error(`Test 2 exception: ${e.message}`);
    testsFailed++;
  }
  
  // Test 3: Profile naming
  try {
    info('Test 3: Profile naming and conflict handling');
    
    const testDestPath = path.join(tmpTestRoot, 'dest');
    
    // Safety check: ensure test path is within system temp directory
    const normalizedDest = path.normalize(testDestPath);
    const normalizedTmpDirDest = path.normalize(os.tmpdir());
    if (!normalizedDest.startsWith(normalizedTmpDirDest)) {
      throw new Error(`Test path must be within system temp directory (${normalizedTmpDirDest})`);
    }
    
    if (fs.existsSync(testDestPath)) {
      fs.rmSync(testDestPath, { recursive: true });
    }
    fs.mkdirSync(testDestPath, { recursive: true });
    
    // Override getConfigPathManager
    plugin.getConfigPathManager = () => new MockConfigPathManager(testDestPath);
    
    // Create test legacy database
    const testLegacyPath = path.join(tmpTestRoot, 'legacy');
    
    // Safety check: ensure test path is within system temp directory
    const normalizedLegacy = path.normalize(testLegacyPath);
    const normalizedTmpDirLegacy = path.normalize(os.tmpdir());
    if (!normalizedLegacy.startsWith(normalizedTmpDirLegacy)) {
      throw new Error(`Test path must be within system temp directory (${normalizedTmpDirLegacy})`);
    }
    
    if (fs.existsSync(testLegacyPath)) {
      fs.rmSync(testLegacyPath, { recursive: true });
    }
    fs.mkdirSync(testLegacyPath);
    fs.writeFileSync(path.join(testLegacyPath, 'database.db'), 'test content');
    
    // First import
    const result1 = await plugin.importSettings(testLegacyPath, 'test-profile');
    
    if (result1.success && result1.profileName === 'test-profile') {
      success('Profile created with custom name');
      testsPassed++;
    } else {
      error('Profile naming failed');
      testsFailed++;
    }
    
    // Second import with same name (should add timestamp)
    const result2 = await plugin.importSettings(testLegacyPath, 'test-profile');
    
    if (result2.success && result2.profileName !== 'test-profile' && result2.profileName.startsWith('test-profile-')) {
      success('Conflict handling works (timestamp added)');
      testsPassed++;
    } else {
      error('Conflict handling failed');
      console.log('Result:', result2);
      testsFailed++;
    }
  } catch (e) {
    error(`Test 3 exception: ${e.message}`);
    testsFailed++;
  }
  
  // Test 4: Invalid path handling
  try {
    info('Test 4: Invalid path handling');
    const result = plugin.validateImportPath('/tmp/nonexistent-path-12345');
    
    if (!result.valid && result.error) {
      success('Invalid path handled correctly');
      testsPassed++;
    } else {
      error('Invalid path not handled correctly');
      testsFailed++;
    }
  } catch (e) {
    error(`Test 4 exception: ${e.message}`);
    testsFailed++;
  }
  
  // Summary
  log('\n=== Test Summary ===\n', 'cyan');
  success(`Passed: ${testsPassed}`);
  if (testsFailed > 0) {
    error(`Failed: ${testsFailed}`);
  }
  
  const totalTests = testsPassed + testsFailed;
  const successRate = Math.round((testsPassed / totalTests) * 100);
  
  if (testsFailed === 0) {
    success(`\n🎉 All tests passed! (${successRate}%)\n`);
    process.exit(0);
  } else {
    error(`\n❌ Some tests failed (${successRate}% success rate)\n`);
    process.exit(1);
  }
}

// Run tests
runTests().catch(err => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
