/**
 * Test script for Minecraft Connect plugin
 */

const path = require('path');
const fs = require('fs');

console.log('Testing Minecraft Connect plugin...\n');

// Test 1: Check plugin.json exists and is valid
console.log('Test 1: Checking plugin.json...');
const pluginJsonPath = path.join(__dirname, 'plugin.json');
const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf8'));
console.log(`✓ Plugin ID: ${pluginJson.id}`);
console.log(`✓ Plugin Name: ${pluginJson.name}`);
console.log(`✓ Version: ${pluginJson.version}`);
console.log(`✓ Entry: ${pluginJson.entry}`);

// Test 2: Check main.js exists
console.log('\nTest 2: Checking main.js...');
const mainPath = path.join(__dirname, pluginJson.entry);
if (fs.existsSync(mainPath)) {
    console.log('✓ main.js exists');
} else {
    console.log('✗ main.js not found');
    process.exit(1);
}

// Test 3: Check helpers exist
console.log('\nTest 3: Checking helper files...');
const helpers = [
    'helpers/minecraftWebSocket.js',
    'helpers/commandQueue.js',
    'helpers/actionMapper.js'
];

for (const helper of helpers) {
    const helperPath = path.join(__dirname, helper);
    if (fs.existsSync(helperPath)) {
        console.log(`✓ ${helper} exists`);
    } else {
        console.log(`✗ ${helper} not found`);
        process.exit(1);
    }
}

// Test 4: Check UI files
console.log('\nTest 4: Checking UI files...');
const uiFiles = [
    'minecraft-connect.html',
    'minecraft-connect.css',
    'minecraft-connect.js'
];

for (const file of uiFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✓ ${file} exists`);
    } else {
        console.log(`✗ ${file} not found`);
        process.exit(1);
    }
}

// Test 5: Check overlay files
console.log('\nTest 5: Checking overlay files...');
const overlayFiles = [
    'overlay/minecraft_overlay.html',
    'overlay/minecraft_overlay.css',
    'overlay/minecraft_overlay.js'
];

for (const file of overlayFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✓ ${file} exists`);
    } else {
        console.log(`✗ ${file} not found`);
        process.exit(1);
    }
}

// Test 6: Check documentation
console.log('\nTest 6: Checking documentation...');
const docFiles = [
    'README.md',
    'docs/MINECRAFT_MOD.md',
    'docs/BUILD_INSTRUCTIONS.md',
    'docs/EXAMPLE_CODE.md'
];

for (const file of docFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        console.log(`✓ ${file} exists`);
    } else {
        console.log(`✗ ${file} not found`);
        process.exit(1);
    }
}

// Test 7: Check locales
console.log('\nTest 7: Checking localization files...');
const localeFiles = [
    'locales/en.json',
    'locales/de.json'
];

for (const file of localeFiles) {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        const locale = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`✓ ${file} exists and is valid JSON`);
    } else {
        console.log(`✗ ${file} not found`);
        process.exit(1);
    }
}

// Test 8: Instantiate plugin class
console.log('\nTest 8: Testing plugin class instantiation...');
try {
    const MinecraftConnectPlugin = require('./main.js');
    
    // Mock API
    const mockApi = {
        pluginId: 'minecraft-connect',
        pluginDir: __dirname,
        app: {},
        io: { emit: () => {} },
        db: {},
        logger: console,
        log: (msg, level) => console.log(`[${level || 'info'}] ${msg}`),
        registerRoute: () => {},
        registerSocket: () => {},
        registerTikTokEvent: () => {},
        registerFlowAction: () => {}
    };
    
    const plugin = new MinecraftConnectPlugin(mockApi);
    console.log('✓ Plugin class instantiated successfully');
    console.log(`✓ Plugin has ${Object.keys(plugin).length} properties`);
} catch (error) {
    console.log(`✗ Failed to instantiate plugin: ${error.message}`);
    process.exit(1);
}

console.log('\n✅ All tests passed!');
console.log('\nPlugin structure is valid and ready for use.');
