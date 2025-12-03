/**
 * Test: Plugin State Persistence
 * Verifies that plugin enable/disable state is correctly persisted to plugins_state.json
 * and that the state survives across restarts (simulated by reloading the PluginLoader)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Determine the correct base directory
const baseDir = path.join(__dirname, '..');
const pluginsDir = path.join(baseDir, 'plugins');
const stateFile = path.join(pluginsDir, 'plugins_state.json');

console.log('Plugin State Persistence Test');
console.log('==============================\n');

// Clean up state file if it exists
if (fs.existsSync(stateFile)) {
    console.log('Removing existing state file...');
    fs.unlinkSync(stateFile);
}

// Mock dependencies for PluginLoader
const mockApp = {
    get: () => {},
    post: () => {},
    put: () => {},
    delete: () => {}
};

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
    error: (msg) => console.log(`[ERROR] ${msg}`)
};

// Load the PluginLoader
const PluginLoader = require('../modules/plugin-loader.js');

async function runTest() {
    try {
        console.log('Test 1: Initial Load (No State File)');
        console.log('--------------------------------------');
        const loader1 = new PluginLoader(pluginsDir, mockApp, mockIO, mockDB, mockLogger);
        
        // Load all plugins - should respect manifest.enabled values
        await loader1.loadAllPlugins();
        
        const plugins1 = loader1.getAllPlugins();
        console.log(`Loaded ${plugins1.length} plugins initially`);
        
        // Verify default active plugins
        const defaultActive = ['emoji-rain', 'lastevent-spotlight', 'goals', 'quiz-show', 'soundboard', 'tts'];
        const activePlugins1 = plugins1.map(p => p.id);
        
        console.log('Active plugins:', activePlugins1.sort().join(', '));
        
        // Check that only default plugins are active
        const allDefaultsActive = defaultActive.every(id => activePlugins1.includes(id));
        const onlyDefaultsActive = activePlugins1.every(id => defaultActive.includes(id));
        
        assert.ok(allDefaultsActive, 'All default plugins should be active');
        assert.ok(onlyDefaultsActive, 'Only default plugins should be active');
        assert.strictEqual(plugins1.length, 6, 'Should have exactly 6 active plugins');
        
        console.log('✓ Test 1 passed: Correct plugins loaded by default\n');
        
        console.log('Test 2: Enable a disabled plugin');
        console.log('----------------------------------');
        // Enable a plugin that's disabled by default
        await loader1.enablePlugin('api-bridge');
        
        // Verify the plugin is now in the loaded plugins
        const plugins2 = loader1.getAllPlugins();
        const apiPluginEnabled = plugins2.some(p => p.id === 'api-bridge');
        assert.ok(apiPluginEnabled, 'api-bridge should be enabled');
        console.log('✓ Test 2 passed: Plugin enabled successfully\n');
        
        console.log('Test 3: Disable a default plugin');
        console.log('----------------------------------');
        // Disable a plugin that's enabled by default
        await loader1.disablePlugin('emoji-rain');
        
        // Verify the plugin is no longer in loaded plugins
        const plugins3 = loader1.getAllPlugins();
        const emojiPluginDisabled = !plugins3.some(p => p.id === 'emoji-rain');
        assert.ok(emojiPluginDisabled, 'emoji-rain should be disabled');
        console.log('✓ Test 3 passed: Plugin disabled successfully\n');
        
        console.log('Test 4: Verify state file was created and contains correct data');
        console.log('------------------------------------------------------------------');
        assert.ok(fs.existsSync(stateFile), 'State file should exist');
        
        const stateData = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        console.log('State file contents:', JSON.stringify(stateData, null, 2));
        
        assert.strictEqual(stateData['api-bridge'].enabled, true, 'api-bridge should be enabled in state');
        assert.strictEqual(stateData['emoji-rain'].enabled, false, 'emoji-rain should be disabled in state');
        console.log('✓ Test 4 passed: State file contains correct data\n');
        
        console.log('Test 5: State persistence across restart (new PluginLoader instance)');
        console.log('-----------------------------------------------------------------------');
        // Create a new PluginLoader instance (simulates restart)
        const loader2 = new PluginLoader(pluginsDir, mockApp, mockIO, mockDB, mockLogger);
        await loader2.loadAllPlugins();
        
        const plugins4 = loader2.getAllPlugins();
        const activePluginIds = plugins4.map(p => p.id).sort();
        
        console.log('Active plugins after "restart":', activePluginIds.join(', '));
        
        // Verify that our changes persisted
        const apiBridgeStillEnabled = activePluginIds.includes('api-bridge');
        const emojiRainStillDisabled = !activePluginIds.includes('emoji-rain');
        
        assert.ok(apiBridgeStillEnabled, 'api-bridge should still be enabled after restart');
        assert.ok(emojiRainStillDisabled, 'emoji-rain should still be disabled after restart');
        
        // Verify other default plugins are still active
        const otherDefaults = ['lastevent-spotlight', 'goals', 'quiz-show', 'soundboard', 'tts'];
        const otherDefaultsActive = otherDefaults.every(id => activePluginIds.includes(id));
        assert.ok(otherDefaultsActive, 'Other default plugins should still be active');
        
        console.log('✓ Test 5 passed: State persisted correctly across restart\n');
        
        console.log('Test 6: Verify state overrides manifest default');
        console.log('--------------------------------------------------');
        // Re-enable emoji-rain
        await loader2.enablePlugin('emoji-rain');
        
        // Create another new loader instance
        const loader3 = new PluginLoader(pluginsDir, mockApp, mockIO, mockDB, mockLogger);
        await loader3.loadAllPlugins();
        
        const plugins5 = loader3.getAllPlugins();
        const emojiRainReEnabled = plugins5.some(p => p.id === 'emoji-rain');
        
        assert.ok(emojiRainReEnabled, 'emoji-rain should be enabled again after re-enabling');
        console.log('✓ Test 6 passed: State correctly overrides manifest default\n');
        
        // Clean up
        console.log('\n======================');
        console.log('All Tests Passed! ✓');
        console.log('======================\n');
        
        // Keep the state file for manual inspection
        console.log(`State file preserved at: ${stateFile}`);
        console.log('Final state:', JSON.stringify(JSON.parse(fs.readFileSync(stateFile, 'utf8')), null, 2));
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n✗ TEST FAILED:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test
runTest().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});
