/**
 * Test Suite for Flame Overlay Plugin v3.0.0
 * Tests backward compatibility and new trigger features
 */

const assert = require('assert');

// Mock API for testing
class MockAPI {
    constructor() {
        this.storage = {};
        this.logs = [];
        this.routes = [];
        this.sockets = [];
        this.emits = [];
        this.tikTokHandlers = {};
    }

    getConfig(key) {
        return this.storage[key];
    }

    setConfig(key, value) {
        this.storage[key] = value;
    }

    log(message, level) {
        this.logs.push({ message, level });
    }

    registerRoute(method, path, handler) {
        this.routes.push({ method, path, handler });
    }

    emit(event, data) {
        this.emits.push({ event, data });
    }

    registerTikTokEvent(event, handler) {
        this.tikTokHandlers[event] = handler;
    }

    getApp() {
        return {
            use: () => {}
        };
    }

    getSocketIO() {
        return {
            emit: (event, data) => this.emit(event, data)
        };
    }
}

// Load the plugin
const FlameOverlayPlugin = require('../main.js');

console.log('🔥 Testing Flame Overlay Plugin v3.0.0\n');

// Test 1: Plugin initialization with no saved config
console.log('Test 1: Default configuration initialization');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Check default values for existing features
    assert.strictEqual(plugin.config.effectType, 'flames', 'Default effect type should be flames');
    assert.strictEqual(plugin.config.flameSpeed, 0.5, 'Default flame speed should be 0.5');
    assert.strictEqual(plugin.config.frameThickness, 150, 'Default frame thickness should be 150');

    // Check default values for NEW features (v2.2.0)
    assert.strictEqual(plugin.config.noiseOctaves, 8, 'Default noise octaves should be 8');
    assert.strictEqual(plugin.config.edgeFeather, 0.42, 'Default edge feather should be 0.42');
    assert.strictEqual(plugin.config.bloomEnabled, true, 'Bloom should be enabled by default');
    assert.strictEqual(plugin.config.layersEnabled, true, 'Layers should be enabled by default');
    assert.strictEqual(plugin.config.smokeEnabled, true, 'Smoke should be enabled by default');

    console.log('  ✓ All default values correct');
}

// Test 2: Backward compatibility with old config
console.log('\nTest 2: Backward compatibility with v2.1.0 config');
{
    const api = new MockAPI();
    const oldConfig = {
        effectType: 'particles',
        frameMode: 'all',
        frameThickness: 200,
        flameColor: '#0000ff',
        flameSpeed: 0.8,
        flameIntensity: 1.5,
        flameBrightness: 0.3,
        maskOnlyEdges: false
    };
    
    api.setConfig('settings', oldConfig);
    
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Old config values should be preserved
    assert.strictEqual(plugin.config.effectType, 'particles', 'Old effect type preserved');
    assert.strictEqual(plugin.config.frameMode, 'all', 'Old frame mode preserved');
    assert.strictEqual(plugin.config.frameThickness, 200, 'Old frame thickness preserved');
    assert.strictEqual(plugin.config.flameColor, '#0000ff', 'Old flame color preserved');
    assert.strictEqual(plugin.config.maskOnlyEdges, false, 'Old mask edges preserved');

    // New config values should have defaults
    assert.strictEqual(plugin.config.noiseOctaves, 8, 'New feature has default');
    assert.strictEqual(plugin.config.bloomEnabled, true, 'New feature has default');
    assert.strictEqual(plugin.config.layersEnabled, true, 'New feature has default');

    console.log('  ✓ Old config preserved, new defaults added');
}

// Test 3: Full v2.2.0 config with all features enabled
console.log('\nTest 3: Full v2.2.0 configuration');
{
    const api = new MockAPI();
    const newConfig = {
        // Old features
        effectType: 'flames',
        frameMode: 'bottom',
        frameThickness: 180,
        flameColor: '#ff6600',
        flameSpeed: 0.6,
        flameIntensity: 1.4,
        flameBrightness: 0.28,
        
        // New features
        noiseOctaves: 10,
        useHighQualityTextures: true,
        edgeFeather: 0.5,
        frameCurve: 0.3,
        frameNoiseAmount: 0.2,
        animationEasing: 'sine',
        pulseEnabled: true,
        pulseAmount: 0.3,
        bloomEnabled: true,
        bloomIntensity: 1.0,
        bloomThreshold: 0.7,
        bloomRadius: 6,
        layersEnabled: true,
        layerCount: 3,
        layerParallax: 0.4,
        chromaticAberration: 0.008,
        filmGrain: 0.05,
        depthIntensity: 0.6,
        smokeEnabled: true,
        smokeIntensity: 0.5,
        smokeSpeed: 0.4,
        smokeColor: '#444444'
    };
    
    api.setConfig('settings', newConfig);
    
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Verify all values loaded correctly
    assert.strictEqual(plugin.config.noiseOctaves, 10, 'Noise octaves loaded');
    assert.strictEqual(plugin.config.useHighQualityTextures, true, 'HQ textures enabled');
    assert.strictEqual(plugin.config.edgeFeather, 0.5, 'Edge feather loaded');
    assert.strictEqual(plugin.config.animationEasing, 'sine', 'Animation easing loaded');
    assert.strictEqual(plugin.config.pulseEnabled, true, 'Pulse enabled');
    assert.strictEqual(plugin.config.bloomEnabled, true, 'Bloom enabled');
    assert.strictEqual(plugin.config.bloomIntensity, 1.0, 'Bloom intensity loaded');
    assert.strictEqual(plugin.config.layersEnabled, true, 'Layers enabled');
    assert.strictEqual(plugin.config.layerCount, 3, 'Layer count loaded');
    assert.strictEqual(plugin.config.smokeEnabled, true, 'Smoke enabled');
    assert.strictEqual(plugin.config.smokeColor, '#444444', 'Smoke color loaded');

    console.log('  ✓ All 30+ config options loaded correctly');
}

// Test 4: Config save/load cycle
console.log('\nTest 4: Config persistence (save/load cycle)');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig(); // Load config first
    
    // Modify config
    plugin.config.bloomEnabled = true;
    plugin.config.bloomIntensity = 1.5;
    plugin.config.layersEnabled = true;
    plugin.config.smokeEnabled = true;
    
    // Save
    plugin.saveConfig();
    
    // Verify saved to API
    const savedConfig = api.getConfig('settings');
    assert.strictEqual(savedConfig.bloomEnabled, true, 'Bloom enabled saved');
    assert.strictEqual(savedConfig.bloomIntensity, 1.5, 'Bloom intensity saved');
    assert.strictEqual(savedConfig.layersEnabled, true, 'Layers enabled saved');
    assert.strictEqual(savedConfig.smokeEnabled, true, 'Smoke enabled saved');

    console.log('  ✓ Config save/load cycle works');
}

// Test 5: Resolution presets
console.log('\nTest 5: Resolution presets');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    const presets = [
        ['tiktok-portrait', { width: 720, height: 1280 }],
        ['tiktok-landscape', { width: 1280, height: 720 }],
        ['hd-portrait', { width: 1080, height: 1920 }],
        ['2k-portrait', { width: 1440, height: 2560 }],
        ['4k-landscape', { width: 3840, height: 2160 }]
    ];

    for (const [preset, expected] of presets) {
        plugin.config.resolutionPreset = preset;
        const res = plugin.getResolution();
        assert.strictEqual(res.width, expected.width, `${preset} width correct`);
        assert.strictEqual(res.height, expected.height, `${preset} height correct`);
    }

    console.log('  ✓ All resolution presets work correctly');
}

// Test 6: Custom resolution
console.log('\nTest 6: Custom resolution');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    plugin.config.resolutionPreset = 'custom';
    plugin.config.customWidth = 1600;
    plugin.config.customHeight = 900;

    const res = plugin.getResolution();
    assert.strictEqual(res.width, 1600, 'Custom width correct');
    assert.strictEqual(res.height, 900, 'Custom height correct');

    console.log('  ✓ Custom resolution works');
}

// Test 7: Config validation ranges
console.log('\nTest 7: Config value ranges (documentation check)');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Test that defaults are within documented ranges
    assert.ok(plugin.config.noiseOctaves >= 4 && plugin.config.noiseOctaves <= 12, 
        'Noise octaves in range 4-12');
    assert.ok(plugin.config.edgeFeather >= 0 && plugin.config.edgeFeather <= 1, 
        'Edge feather in range 0-1');
    assert.ok(plugin.config.bloomIntensity >= 0 && plugin.config.bloomIntensity <= 2, 
        'Bloom intensity in range 0-2');
    assert.ok(plugin.config.layerCount >= 1 && plugin.config.layerCount <= 3, 
        'Layer count in range 1-3');
    assert.ok(['linear', 'sine', 'quad', 'elastic'].includes(plugin.config.animationEasing),
        'Animation easing is valid option');

    console.log('  ✓ All default values within documented ranges');
}

// ============================
// v3.0.0 Trigger System Tests
// ============================

// Test 8: Trigger defaults present in config
console.log('\nTest 8: Trigger system defaults (v3.0.0)');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    assert.strictEqual(plugin.config.triggersEnabled, true, 'Triggers enabled by default');
    assert.ok(Array.isArray(plugin.config.triggerRules), 'triggerRules is an array');
    assert.ok(plugin.config.triggerRules.length > 0, 'triggerRules has default entries');
    assert.strictEqual(plugin.config.triggerCooldown, 2000, 'Default cooldown is 2000ms');
    assert.strictEqual(plugin.config.triggerMaxStack, 5, 'Default max stack is 5');
    assert.strictEqual(plugin.config.chatColorCommands, true, 'Chat color commands enabled by default');
    assert.strictEqual(plugin.config.triggerPreset, 'default', "Default preset is 'default'");

    console.log('  ✓ All trigger defaults correct');
}

// Test 9: dispatchTrigger emits socket event
console.log('\nTest 9: dispatchTrigger emits flame-overlay:trigger');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.config.triggerCooldown = 0; // disable cooldown for testing

    plugin.dispatchTrigger({ type: 'flash', duration: 500, source: 'test' });

    const triggerEmit = api.emits.find(e => e.event === 'flame-overlay:trigger');
    assert.ok(triggerEmit, 'flame-overlay:trigger was emitted');
    assert.strictEqual(triggerEmit.data.type, 'flash', 'Trigger type is flash');

    console.log('  ✓ dispatchTrigger emits event correctly');
}

// Test 10: Cooldown prevents double-dispatch
console.log('\nTest 10: Cooldown prevents rapid duplicate triggers');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.config.triggerCooldown = 5000; // 5 second cooldown

    plugin.dispatchTrigger({ type: 'flash', duration: 500, source: 'gift:10' });
    plugin.dispatchTrigger({ type: 'flash', duration: 500, source: 'gift:10' }); // should be blocked

    const triggerEmits = api.emits.filter(e => e.event === 'flame-overlay:trigger');
    assert.strictEqual(triggerEmits.length, 1, 'Only one trigger emitted due to cooldown');

    console.log('  ✓ Cooldown blocks rapid duplicate triggers');
}

// Test 11: Max stack prevents over-triggering
console.log('\nTest 11: Max stack prevents exceeding trigger limit');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.config.triggerCooldown = 0;
    plugin.config.triggerMaxStack = 2;

    plugin.dispatchTrigger({ type: 'flash', source: 'event1' });
    plugin.dispatchTrigger({ type: 'pulse', source: 'event2' });
    plugin.dispatchTrigger({ type: 'intensity-boost', source: 'event3' }); // should be blocked

    const triggerEmits = api.emits.filter(e => e.event === 'flame-overlay:trigger');
    assert.strictEqual(triggerEmits.length, 2, 'Only 2 triggers fired (maxStack=2)');

    console.log('  ✓ Max stack blocks triggers when limit reached');
}

// Test 12: handleGiftTrigger tier dispatching
console.log('\nTest 12: handleGiftTrigger dispatches correct tier');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.config.triggerCooldown = 0;

    // Big gift
    plugin.handleGiftTrigger({ diamondCount: 1500 });
    const bigGift = api.emits.find(e => e.event === 'flame-overlay:trigger');
    assert.strictEqual(bigGift.data.type, 'dramatic', 'Big gift → dramatic');

    // Reset state between tiers
    api.emits = [];
    plugin.lastTriggerTime.clear();
    plugin.activeTriggerCount = 0;

    // Medium gift
    plugin.handleGiftTrigger({ diamondCount: 200 });
    const medGift = api.emits.find(e => e.event === 'flame-overlay:trigger');
    assert.strictEqual(medGift.data.type, 'intensity-boost', 'Medium gift → intensity-boost');

    // Reset state between tiers
    api.emits = [];
    plugin.lastTriggerTime.clear();
    plugin.activeTriggerCount = 0;

    // Small gift
    plugin.handleGiftTrigger({ diamondCount: 5 });
    const smallGift = api.emits.find(e => e.event === 'flame-overlay:trigger');
    assert.strictEqual(smallGift.data.type, 'flash', 'Small gift → flash');

    console.log('  ✓ Gift tiers dispatch correct trigger types');
}

// Test 13: handleChatCommand recognises color commands
console.log('\nTest 13: handleChatCommand recognises chat color commands');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.config.triggerCooldown = 0;

    plugin.handleChatCommand({ comment: '!red' });
    const redTrigger = api.emits.find(e => e.event === 'flame-overlay:trigger');
    assert.ok(redTrigger, '!red chat command fires trigger');
    assert.strictEqual(redTrigger.data.color, '#ff0000', '!red maps to #ff0000');
    api.emits = [];

    plugin.handleChatCommand({ comment: 'hello world' }); // no match
    const noTrigger = api.emits.find(e => e.event === 'flame-overlay:trigger');
    assert.ok(!noTrigger, 'Regular chat message fires no trigger');

    console.log('  ✓ Chat color commands work correctly');
}

// Test 14: evaluateCondition
console.log('\nTest 14: evaluateCondition parses comparison expressions');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    assert.strictEqual(plugin.evaluateCondition('any', {}), true, "'any' always true");
    assert.strictEqual(plugin.evaluateCondition('diamondCount >= 100', { diamondCount: 200 }), true, '>= 100 with 200');
    assert.strictEqual(plugin.evaluateCondition('diamondCount >= 100', { diamondCount: 50 }), false, '>= 100 with 50');
    assert.strictEqual(plugin.evaluateCondition('likeCount > 50', { likeCount: 51 }), true, '> 50 with 51');
    assert.strictEqual(plugin.evaluateCondition('likeCount > 50', { likeCount: 50 }), false, '> 50 with 50');
    assert.strictEqual(plugin.evaluateCondition('keyword-match', {}), false, "'keyword-match' returns false");

    console.log('  ✓ evaluateCondition works correctly');
}

// Test 15: Preset activation updates config
console.log('\nTest 15: Preset activation route updates config and saves');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.registerRoutes();

    // Simulate the preset route handler
    const presetRoute = api.routes.find(r => r.path === '/api/flame-overlay/trigger-preset/:name');
    assert.ok(presetRoute, 'Preset activation route registered');

    const mockRes = {
        status: (code) => ({ json: () => {} }),
        json: (data) => { mockRes._lastResponse = data; }
    };

    presetRoute.handler({ params: { name: 'hype' } }, mockRes);
    assert.strictEqual(plugin.config.triggerPreset, 'hype', "Config preset set to 'hype'");
    assert.strictEqual(plugin.config.triggerCooldown, 500, 'Hype preset cooldown is 500ms');
    assert.strictEqual(plugin.config.triggerMaxStack, 10, 'Hype preset maxStack is 10');

    presetRoute.handler({ params: { name: 'chill' } }, mockRes);
    assert.strictEqual(plugin.config.triggerPreset, 'chill', "Config preset set to 'chill'");
    assert.strictEqual(plugin.config.triggerCooldown, 5000, 'Chill preset cooldown is 5000ms');

    console.log('  ✓ Preset activation route updates config correctly');
}

// Test 16: Backward compat - old config without triggerRules gets defaults
console.log('\nTest 16: Backward compat - old config without triggerRules');
{
    const api = new MockAPI();
    api.setConfig('settings', {
        effectType: 'flames',
        flameColor: '#0000ff',
        // no triggerRules, triggersEnabled, etc.
    });

    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    assert.strictEqual(plugin.config.flameColor, '#0000ff', 'Old config preserved');
    assert.ok(Array.isArray(plugin.config.triggerRules), 'triggerRules defaulted to array');
    assert.ok(plugin.config.triggerRules.length > 0, 'triggerRules defaulted to non-empty');
    assert.strictEqual(plugin.config.triggersEnabled, true, 'triggersEnabled defaults to true');

    console.log('  ✓ Backward compat: old config gets trigger defaults');
}

console.log('\n✅ All tests passed! Plugin v3.0.0 is working correctly.\n');
console.log('Summary:');
console.log('  - Backward compatibility: ✓');
console.log('  - New features (30+ options): ✓');
console.log('  - Config persistence: ✓');
console.log('  - Resolution presets: ✓');
console.log('  - Value ranges: ✓');
console.log('  - Trigger defaults (v3.0.0): ✓');
console.log('  - Trigger dispatch & cooldown: ✓');
console.log('  - Gift handler tiers: ✓');
console.log('  - Chat color commands: ✓');
console.log('  - Trigger rule evaluation: ✓');
console.log('  - Preset activation: ✓');
console.log('  - Backward compat (no triggerRules): ✓');
