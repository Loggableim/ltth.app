/**
 * Test suite for Plugin TikTok Event Cleanup
 * Tests that TikTok event handlers are properly removed when plugins are unloaded
 * This prevents duplicate event processing (e.g., coins being counted twice)
 */

const assert = require('assert');
const EventEmitter = require('events');

console.log('🧪 Testing Plugin TikTok Event Cleanup...\n');

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
        console.error(`  Stack: ${error.stack}`);
        failed++;
    }
}

// Mock TikTok module (extends EventEmitter)
class MockTikTokConnector extends EventEmitter {
    constructor() {
        super();
    }
}

// Mock PluginAPI with the fix
class PluginAPI {
    constructor(pluginId, tiktok) {
        this.pluginId = pluginId;
        this.tiktok = tiktok;
        this.registeredTikTokEvents = [];
        this.logger = {
            info: (msg) => console.log(`  [${this.pluginId}] ${msg}`),
            warn: (msg) => console.log(`  ⚠️ [${this.pluginId}] ${msg}`),
            error: (msg) => console.error(`  ❌ [${this.pluginId}] ${msg}`)
        };
    }

    registerTikTokEvent(event, callback) {
        const wrappedCallback = async (data) => {
            try {
                await callback(data);
            } catch (error) {
                this.logger.error(`TikTok event error in ${event}: ${error.message}`);
            }
        };

        this.registeredTikTokEvents.push({ event, callback: wrappedCallback });
        this.logger.info(`Registered TikTok event: ${event}`);
        
        // Register with TikTok module
        if (this.tiktok) {
            this.tiktok.on(event, wrappedCallback);
        }

        return true;
    }

    unregisterAll() {
        // TikTok-Events deregistrieren
        // FIX: Remove actual event listeners from TikTok module to prevent duplicate handlers
        this.registeredTikTokEvents.forEach(({ event, callback }) => {
            try {
                if (this.tiktok) {
                    this.tiktok.removeListener(event, callback);
                    this.logger.info(`Unregistered TikTok event: ${event}`);
                } else {
                    this.logger.warn(`Cannot unregister TikTok event ${event}: TikTok module not available`);
                }
            } catch (error) {
                this.logger.error(`Failed to unregister TikTok event ${event}: ${error.message}`);
            }
        });

        this.registeredTikTokEvents = [];
    }

    log(message, level = 'info') {
        this.logger[level](message);
    }
}

// Test: Event handler is properly removed on unload
runTest('TikTok event handler is removed when plugin is unloaded', () => {
    const tiktok = new MockTikTokConnector();
    const api = new PluginAPI('test-plugin', tiktok);

    let eventCount = 0;
    const handler = (data) => {
        eventCount++;
        console.log(`    Event received: ${data.coins} coins`);
    };

    // Register event handler
    api.registerTikTokEvent('gift', handler);

    // Verify handler is registered
    const listenersBeforeUnload = tiktok.listenerCount('gift');
    assert.strictEqual(listenersBeforeUnload, 1, `Expected 1 listener, got ${listenersBeforeUnload}`);

    // Simulate gift event
    tiktok.emit('gift', { coins: 100 });
    assert.strictEqual(eventCount, 1, `Expected event count 1, got ${eventCount}`);

    // Unload plugin (should remove event handler)
    api.unregisterAll();

    // Verify handler is removed
    const listenersAfterUnload = tiktok.listenerCount('gift');
    assert.strictEqual(listenersAfterUnload, 0, `Expected 0 listeners after unload, got ${listenersAfterUnload}`);

    // Simulate another gift event
    tiktok.emit('gift', { coins: 50 });

    // Event count should still be 1 (handler was removed)
    assert.strictEqual(eventCount, 1, `Expected event count to remain 1 after unload, got ${eventCount}`);
});

// Test: Plugin reload scenario (simulates the bug)
runTest('Plugin reload does not create duplicate handlers', () => {
    const tiktok = new MockTikTokConnector();
    
    let totalCoins = 0;

    // Load plugin first time
    const api1 = new PluginAPI('goals-plugin', tiktok);
    api1.registerTikTokEvent('gift', (data) => {
        totalCoins += data.coins;
        console.log(`    First handler: ${data.coins} coins, total: ${totalCoins}`);
    });

    // Verify 1 listener
    assert.strictEqual(tiktok.listenerCount('gift'), 1, 'Expected 1 listener after first load');

    // Simulate gift event - should count once
    tiktok.emit('gift', { coins: 100 });
    assert.strictEqual(totalCoins, 100, `Expected total 100, got ${totalCoins}`);

    // Unload plugin (this is the fix - it should remove the handler)
    api1.unregisterAll();
    assert.strictEqual(tiktok.listenerCount('gift'), 0, 'Expected 0 listeners after unload');

    // Reload plugin (simulating re-enable or restart)
    const api2 = new PluginAPI('goals-plugin', tiktok);
    api2.registerTikTokEvent('gift', (data) => {
        totalCoins += data.coins;
        console.log(`    Second handler: ${data.coins} coins, total: ${totalCoins}`);
    });

    // Verify only 1 listener (not 2)
    assert.strictEqual(tiktok.listenerCount('gift'), 1, 'Expected 1 listener after reload, not 2');

    // Simulate another gift event - should count once, not twice
    tiktok.emit('gift', { coins: 50 });
    
    // Without the fix, totalCoins would be 250 (100 + 50 + 100)
    // With the fix, totalCoins should be 150 (100 + 50)
    assert.strictEqual(totalCoins, 150, `Expected total 150 (coins counted once), got ${totalCoins}. If 250, handlers were duplicated!`);
});

// Test: Multiple plugins with same event
runTest('Multiple plugins can register same event without interference', () => {
    const tiktok = new MockTikTokConnector();
    
    let plugin1Coins = 0;
    let plugin2Coins = 0;

    // Load plugin 1
    const api1 = new PluginAPI('plugin-1', tiktok);
    api1.registerTikTokEvent('gift', (data) => {
        plugin1Coins += data.coins;
    });

    // Load plugin 2
    const api2 = new PluginAPI('plugin-2', tiktok);
    api2.registerTikTokEvent('gift', (data) => {
        plugin2Coins += data.coins;
    });

    // Both plugins should have registered
    assert.strictEqual(tiktok.listenerCount('gift'), 2, 'Expected 2 listeners (one per plugin)');

    // Emit event - both should receive it
    tiktok.emit('gift', { coins: 100 });
    assert.strictEqual(plugin1Coins, 100, 'Plugin 1 should have received coins');
    assert.strictEqual(plugin2Coins, 100, 'Plugin 2 should have received coins');

    // Unload plugin 1
    api1.unregisterAll();
    assert.strictEqual(tiktok.listenerCount('gift'), 1, 'Expected 1 listener after unloading plugin 1');

    // Emit another event - only plugin 2 should receive it
    tiktok.emit('gift', { coins: 50 });
    assert.strictEqual(plugin1Coins, 100, 'Plugin 1 should not receive more coins after unload');
    assert.strictEqual(plugin2Coins, 150, 'Plugin 2 should receive the new coins');

    // Unload plugin 2
    api2.unregisterAll();
    assert.strictEqual(tiktok.listenerCount('gift'), 0, 'Expected 0 listeners after unloading both plugins');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log('='.repeat(50));

if (failed > 0) {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
} else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
}
