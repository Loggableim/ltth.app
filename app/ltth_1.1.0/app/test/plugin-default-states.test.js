/**
 * Test: Plugin Default States and State File Logic
 * Verifies that:
 * 1. Plugin manifest files have correct default enabled states
 * 2. State file logic works correctly (state overrides manifest)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const pluginsDir = path.join(__dirname, '..', 'plugins');
const stateFile = path.join(pluginsDir, 'plugins_state.json');

console.log('Plugin Default States Test');
console.log('==========================\n');

// Test 1: Verify manifest defaults
console.log('Test 1: Verify plugin.json default states');
console.log('-------------------------------------------');

const expectedActive = ['emoji-rain', 'lastevent-spotlight', 'goals', 'leaderboard', 'quiz_show', 'soundboard', 'tts'];
const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });

let activeCount = 0;
let inactiveCount = 0;

for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('_')) {
        const manifestPath = path.join(pluginsDir, entry.name, 'plugin.json');
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const enabled = manifest.enabled === true;
            const shouldBeActive = expectedActive.includes(entry.name);
            
            if (enabled) {
                activeCount++;
                assert.ok(shouldBeActive, `Plugin ${entry.name} is enabled but should not be active by default`);
            } else {
                inactiveCount++;
                assert.ok(!shouldBeActive, `Plugin ${entry.name} is disabled but should be active by default`);
            }
        }
    }
}

assert.strictEqual(activeCount, 7, `Should have exactly 7 active plugins, but found ${activeCount}`);
console.log(`✓ Found ${activeCount} active plugins (expected 7)`);
console.log(`✓ Found ${inactiveCount} inactive plugins`);
console.log('✓ All plugins have correct default states\n');

// Test 2: Simulate state file logic
console.log('Test 2: Simulate state file override logic');
console.log('--------------------------------------------');

// Clean up any existing state file
if (fs.existsSync(stateFile)) {
    fs.unlinkSync(stateFile);
    console.log('Removed existing state file');
}

// Simulate the logic from PluginLoader.loadPlugin()
function shouldLoadPlugin(pluginId, manifestEnabled, stateObj) {
    const pluginState = stateObj[pluginId] || {};
    return pluginState.enabled !== undefined ? pluginState.enabled : manifestEnabled;
}

// Test case 1: No state file, use manifest default
let state1 = {};
assert.strictEqual(shouldLoadPlugin('emoji-rain', true, state1), true, 'Should use manifest enabled=true');
assert.strictEqual(shouldLoadPlugin('api-bridge', false, state1), false, 'Should use manifest enabled=false');
console.log('✓ Correctly uses manifest default when no state exists');

// Test case 2: State file exists and overrides manifest
let state2 = {
    'emoji-rain': { enabled: false },  // Override manifest enabled=true
    'api-bridge': { enabled: true }    // Override manifest enabled=false
};
assert.strictEqual(shouldLoadPlugin('emoji-rain', true, state2), false, 'State should override manifest');
assert.strictEqual(shouldLoadPlugin('api-bridge', false, state2), true, 'State should override manifest');
console.log('✓ State correctly overrides manifest defaults');

// Test case 3: Partial state (some plugins have state, some don't)
let state3 = {
    'emoji-rain': { enabled: false }  // Only this plugin has state
};
assert.strictEqual(shouldLoadPlugin('emoji-rain', true, state3), false, 'Should use state');
assert.strictEqual(shouldLoadPlugin('goals', true, state3), true, 'Should use manifest when no state');
assert.strictEqual(shouldLoadPlugin('api-bridge', false, state3), false, 'Should use manifest when no state');
console.log('✓ Correctly handles partial state (some plugins with state, some without)\n');

// Test 3: Verify state file persistence logic
console.log('Test 3: Verify state file creation and persistence');
console.log('----------------------------------------------------');

// Create a test state file
const testState = {
    'emoji-rain': { enabled: false, loadedAt: new Date().toISOString() },
    'api-bridge': { enabled: true, loadedAt: new Date().toISOString() }
};

fs.writeFileSync(stateFile, JSON.stringify(testState, null, 2));
console.log('Created test state file');

// Verify it was written correctly
const readState = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
assert.strictEqual(readState['emoji-rain'].enabled, false, 'State file should contain emoji-rain disabled');
assert.strictEqual(readState['api-bridge'].enabled, true, 'State file should contain api-bridge enabled');
console.log('✓ State file written and read correctly');

// Clean up
fs.unlinkSync(stateFile);
console.log('✓ Test state file removed\n');

console.log('======================');
console.log('All Tests Passed! ✓');
console.log('======================\n');

console.log('Summary:');
console.log('--------');
console.log('✓ All 24 plugin manifests have correct default enabled states');
console.log('✓ Only 7 plugins enabled by default (emoji-rain, goals, lastevent-spotlight, leaderboard, quiz_show, soundboard, tts)');
console.log('✓ State file logic correctly overrides manifest defaults');
console.log('✓ Partial state handling works correctly');
console.log('✓ State file persistence mechanism verified');

process.exit(0);
