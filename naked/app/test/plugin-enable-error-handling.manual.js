/**
 * Test: Plugin Enable Error Handling
 * Verifies that enablePlugin correctly throws errors when plugin fails to load
 * and that the plugin state remains disabled when loading fails
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const express = require('express');

// Determine the correct base directory
const baseDir = path.join(__dirname, '..');
const pluginsDir = path.join(baseDir, 'plugins');
const testPluginDir = path.join(pluginsDir, '_test-broken-plugin');
const userConfigsDir = path.join(baseDir, 'test_user_configs');
const profileName = 'testprofile';
const stateFile = path.join(userConfigsDir, `${profileName}_plugins_state.json`);

console.log('Plugin Enable Error Handling Test');
console.log('==================================\n');

// Clean up test plugin directory if it exists
if (fs.existsSync(testPluginDir)) {
    console.log('Removing existing test plugin...');
    fs.rmSync(testPluginDir, { recursive: true, force: true });
}

// Clean up state file entries for test plugin
if (!fs.existsSync(userConfigsDir)) {
    fs.mkdirSync(userConfigsDir, { recursive: true });
}
if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    delete state['test-broken-plugin'];
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

// Mock dependencies for PluginLoader
const mockApp = express();

const mockIO = {
    emit: () => {},
    sockets: {
        sockets: new Map()
    }
};

const mockDB = {
    prepare: () => ({
        get: () => null,
        run: () => {}
    })
};

const mockLogger = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    warn: (msg) => console.log(`[WARN] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => {}
};

const mockConfigPathManager = {
    getPluginDataPath: (pluginId) => path.join(baseDir, 'user_data', 'plugins', pluginId),
    getUserConfigsDir: () => userConfigsDir
};

// Load the PluginLoader
const PluginLoader = require('../modules/plugin-loader.js');

async function runTest() {
    let loader;
    
    try {
        console.log('Test 1: Create a broken plugin (missing entry file)');
        console.log('-----------------------------------------------------');
        
        // Create test plugin directory with manifest but missing entry file
        fs.mkdirSync(testPluginDir, { recursive: true });
        
        const brokenManifest = {
            id: 'test-broken-plugin',
            name: 'Test Broken Plugin',
            version: '1.0.0',
            description: 'A test plugin that is intentionally broken',
            author: 'Test',
            entry: 'main.js',
            enabled: false
        };
        
        fs.writeFileSync(
            path.join(testPluginDir, 'plugin.json'),
            JSON.stringify(brokenManifest, null, 2)
        );
        
        console.log('Created test plugin with missing entry file');
        console.log('✓ Test 1 passed\n');
        
        console.log('Test 2: Try to enable the broken plugin');
        console.log('-----------------------------------------');
        
        // Create PluginLoader instance
        loader = new PluginLoader(pluginsDir, mockApp, mockIO, mockDB, mockLogger, mockConfigPathManager, profileName);
        
        // Try to enable the broken plugin - should throw error
        let errorThrown = false;
        let errorMessage = '';
        
        try {
            await loader.enablePlugin('test-broken-plugin');
        } catch (error) {
            errorThrown = true;
            errorMessage = error.message;
            console.log(`Caught expected error: ${error.message}`);
        }
        
        assert.ok(errorThrown, 'enablePlugin should throw an error for broken plugin');
        assert.ok(
            errorMessage.includes('failed to load') || errorMessage.includes('directory not found') || errorMessage.includes('not found'),
            `Error message should mention failed to load or not found, got: ${errorMessage}`
        );
        
        console.log('✓ Test 2 passed: Error was thrown as expected\n');
        
        console.log('Test 3: Verify plugin state remains disabled');
        console.log('----------------------------------------------');
        
        // Check that the plugin is NOT in the loaded plugins
        const loadedPlugins = loader.getAllPlugins();
        const brokenPluginLoaded = loadedPlugins.some(p => p.id === 'test-broken-plugin');
        
        assert.ok(!brokenPluginLoaded, 'Broken plugin should NOT be in loaded plugins');
        
        // Check state file - plugin should be disabled
        const state = loader.state['test-broken-plugin'];
        const isEnabled = state ? state.enabled : false;
        
        assert.ok(!isEnabled, 'Broken plugin should remain disabled in state');
        
        console.log('✓ Test 3 passed: Plugin state correctly remains disabled\n');
        
        console.log('Test 4: Create a plugin with init() error');
        console.log('-------------------------------------------');
        
        // Create a plugin that fails during init()
        const failingPluginDir = path.join(pluginsDir, '_test-failing-init');
        if (fs.existsSync(failingPluginDir)) {
            fs.rmSync(failingPluginDir, { recursive: true, force: true });
        }
        fs.mkdirSync(failingPluginDir, { recursive: true });
        
        const failingManifest = {
            id: 'test-failing-init',
            name: 'Test Failing Init Plugin',
            version: '1.0.0',
            description: 'A test plugin that fails during init',
            author: 'Test',
            entry: 'main.js',
            enabled: false
        };
        
        fs.writeFileSync(
            path.join(failingPluginDir, 'plugin.json'),
            JSON.stringify(failingManifest, null, 2)
        );
        
        // Create a plugin class that throws during init
        const failingPluginCode = `
class FailingPlugin {
    constructor(api) {
        this.api = api;
    }
    
    async init() {
        throw new Error('Intentional initialization failure for testing');
    }
    
    async destroy() {
        // cleanup
    }
}

module.exports = FailingPlugin;
`;
        
        fs.writeFileSync(path.join(failingPluginDir, 'main.js'), failingPluginCode);
        
        console.log('Created test plugin that fails during init()');
        
        // Try to enable it
        let initErrorThrown = false;
        let initErrorMessage = '';
        
        try {
            await loader.enablePlugin('test-failing-init');
        } catch (error) {
            initErrorThrown = true;
            initErrorMessage = error.message;
            console.log(`Caught expected init error: ${error.message}`);
        }
        
        assert.ok(initErrorThrown, 'enablePlugin should throw an error when init() fails');
        assert.ok(
            initErrorMessage.includes('failed to load') || initErrorMessage.includes('initialization') || initErrorMessage.includes('not found'),
            `Error message should mention failed to load or initialization, got: ${initErrorMessage}`
        );
        
        // Verify plugin is not loaded
        const loadedPlugins2 = loader.getAllPlugins();
        const failingPluginLoaded = loadedPlugins2.some(p => p.id === 'test-failing-init');
        
        assert.ok(!failingPluginLoaded, 'Failing plugin should NOT be in loaded plugins');
        
        console.log('✓ Test 4 passed: Plugin with failing init() correctly rejected\n');
        
        console.log('\n======================');
        console.log('All Tests Passed! ✓');
        console.log('======================\n');
        
        // Clean up test plugins
        if (fs.existsSync(testPluginDir)) {
            fs.rmSync(testPluginDir, { recursive: true, force: true });
        }
        if (fs.existsSync(failingPluginDir)) {
            fs.rmSync(failingPluginDir, { recursive: true, force: true });
        }
        
        console.log('Test plugins cleaned up');
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n✗ TEST FAILED:', error.message);
        console.error(error.stack);
        
        // Clean up on failure
        if (fs.existsSync(testPluginDir)) {
            fs.rmSync(testPluginDir, { recursive: true, force: true });
        }
        const failingPluginDir = path.join(pluginsDir, '_test-failing-init');
        if (fs.existsSync(failingPluginDir)) {
            fs.rmSync(failingPluginDir, { recursive: true, force: true });
        }
        
        process.exit(1);
    }
}

// Run the test
runTest();
