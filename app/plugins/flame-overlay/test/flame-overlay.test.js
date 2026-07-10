const fs = require('fs');
const path = require('path');
const vm = require('vm');
const FlameOverlayPlugin = require('../main');

function createPlugin(overrides = {}) {
    const handlers = {};
    const routes = {};
    const sockets = {};
    const api = {
        getConfig: jest.fn(() => null),
        setConfig: jest.fn(),
        emit: jest.fn(),
        log: jest.fn(),
        registerTikTokEvent: jest.fn((event, handler) => {
            handlers[event] = handler;
        }),
        registerRoute: jest.fn((method, route, handler) => {
            routes[`${method.toUpperCase()} ${route}`] = handler;
        }),
        registerSocket: jest.fn((event, handler) => {
            sockets[event] = handler;
        }),
        getApp: jest.fn(() => ({ use: jest.fn() })),
        getDatabase: jest.fn(() => ({
            getGiftCatalog: jest.fn(() => [
                { id: 5655, name: 'Rose', image_url: 'rose.png', diamond_count: 1 }
            ])
        })),
        ...overrides
    };

    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();
    plugin.config.triggerCooldown = 0;

    return { plugin, api, handlers, routes, sockets };
}

function createResponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn()
    };
    return res;
}

function loadEffectsEngineClass() {
    const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'effects-engine.js'), 'utf8');
    const context = {
        console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        window: {
            innerWidth: 320,
            innerHeight: 240,
            devicePixelRatio: 1,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        },
        document: {
            addEventListener: jest.fn(),
            getElementById: jest.fn()
        },
        Date,
        Math,
        JSON,
        Number,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: jest.fn(),
        cancelAnimationFrame: jest.fn()
    };

    vm.createContext(context);
    vm.runInContext(`${source}\nglobalThis.EffectsEngine = EffectsEngine;`, context, {
        filename: 'effects-engine.js'
    });
    return context.EffectsEngine;
}

describe('flame-overlay trigger handling', () => {
    afterEach(() => {
        jest.useRealTimers();
    });

    test('normalizes TikTok gift payloads for gift rules', () => {
        const { plugin } = createPlugin();

        const normalized = plugin.normalizeGiftEvent({
            giftId: '5655',
            giftName: 'Rose',
            diamondCount: 99,
            repeatCount: 3
        });

        expect(normalized.giftId).toBe('5655');
        expect(normalized.giftName).toBe('Rose');
        expect(normalized.diamondCount).toBe(99);
        expect(normalized.repeatCount).toBe(3);
        expect(normalized.coins).toBe(297);
    });

    test('supports gift id and coin range conditions', () => {
        const { plugin } = createPlugin();
        const data = { giftId: 5655, giftName: 'Rose', coins: 297 };

        expect(plugin.evaluateCondition('giftId == "5655"', data)).toBe(true);
        expect(plugin.evaluateCondition('giftName == "Rose"', data)).toBe(true);
        expect(plugin.evaluateCondition('coins >= 99 && coins <= 499', data)).toBe(true);
        expect(plugin.evaluateCondition('coins >= 500', data)).toBe(false);
    });

    test('custom resolution config resolves to custom dimensions', () => {
        const { plugin } = createPlugin();

        plugin.config.resolutionPreset = 'custom';
        plugin.config.customWidth = 1024;
        plugin.config.customHeight = 768;

        expect(plugin.getResolution()).toEqual({ width: 1024, height: 768 });
    });

    test('renderer sizes canvas from configured custom resolution', () => {
        const EffectsEngine = loadEffectsEngineClass();
        const engine = Object.create(EffectsEngine.prototype);
        engine.canvas = { width: 0, height: 0, style: {} };
        engine.gl = { viewport: jest.fn() };
        engine.config = {
            resolutionPreset: 'custom',
            customWidth: 1024,
            customHeight: 768,
            highDPI: false
        };
        engine.postProcessor = { resize: jest.fn() };
        engine.uniforms = {};
        engine.updateUniforms = jest.fn();

        engine.handleResize();

        expect(engine.canvas.width).toBe(1024);
        expect(engine.canvas.height).toBe(768);
        expect(engine.canvas.style.width).toBe('100%');
        expect(engine.canvas.style.height).toBe('100%');
        expect(engine.gl.viewport).toHaveBeenCalledWith(0, 0, 1024, 768);
        expect(engine.postProcessor.resize).toHaveBeenCalledWith(1024, 768);
    });

    test('gift events use configured gift rules before tier fallback', () => {
        const { plugin, api, handlers } = createPlugin();
        plugin.config.triggerRules = [{
            id: 'gift-range',
            event: 'gift',
            condition: 'coins >= 99 && coins <= 499',
            action: 'dramatic',
            effect: 'particles',
            duration: 5000,
            enabled: true
        }];

        plugin.registerTikTokEventHandlers();
        handlers.gift({ giftId: 5655, giftName: 'Rose', diamondCount: 99, repeatCount: 3 });

        const triggerEmit = api.emit.mock.calls.find(call => call[0] === 'flame-overlay:trigger');
        expect(triggerEmit).toBeTruthy();
        expect(triggerEmit[1]).toEqual(expect.objectContaining({
            type: 'dramatic',
            effect: 'particles',
            source: 'rule:gift-range'
        }));
        plugin.clearActiveTriggers();
    });

    test('init always registers TikTok handlers and gates disabled processing at runtime', async () => {
        const { plugin, api, handlers } = createPlugin({
            getConfig: jest.fn(key => (key === 'settings' ? { triggersEnabled: false } : null))
        });

        await plugin.init();

        expect(api.registerTikTokEvent).toHaveBeenCalledWith('gift', expect.any(Function));
        expect(api.registerTikTokEvent).toHaveBeenCalledWith('follow', expect.any(Function));
        expect(api.registerTikTokEvent).toHaveBeenCalledWith('like', expect.any(Function));
        expect(api.registerTikTokEvent).toHaveBeenCalledWith('share', expect.any(Function));
        expect(api.registerTikTokEvent).toHaveBeenCalledWith('chat', expect.any(Function));
        expect(api.registerTikTokEvent).toHaveBeenCalledWith('subscribe', expect.any(Function));

        const result = handlers.gift({ giftId: 5655, giftName: 'Rose', diamondCount: 1200, repeatCount: 1 });

        expect(result).toEqual(expect.objectContaining({ accepted: false, reason: 'disabled' }));
        expect(api.emit).not.toHaveBeenCalledWith('flame-overlay:trigger', expect.anything());
    });

    test('default gift rules use total coin value before small gift fallback', () => {
        const { plugin, api, handlers } = createPlugin();

        plugin.registerTikTokEventHandlers();
        handlers.gift({ giftId: 5655, giftName: 'Rose', diamondCount: 99, repeatCount: 3 });

        const triggerEmit = api.emit.mock.calls.find(call => call[0] === 'flame-overlay:trigger');
        expect(triggerEmit[1]).toEqual(expect.objectContaining({
            type: 'intensity-boost',
            amount: 0.5,
            source: 'rule:gift-medium'
        }));
        plugin.clearActiveTriggers();
    });

    test('dispatchTrigger sanitizes duration and clears active trigger count', () => {
        jest.useFakeTimers();
        const { plugin, api } = createPlugin();

        plugin.dispatchTrigger({ type: 'flash', duration: '800', source: 'test' });

        const triggerEmit = api.emit.mock.calls.find(call => call[0] === 'flame-overlay:trigger');
        expect(triggerEmit[1].duration).toBe(800);
        expect(plugin.activeTriggerCount).toBe(1);

        jest.advanceTimersByTime(1050);

        expect(plugin.activeTriggerCount).toBe(0);
    });

    test('clearActiveTriggers resets active triggers and notifies renderers', () => {
        jest.useFakeTimers();
        const { plugin, api } = createPlugin();

        plugin.dispatchTrigger({ type: 'flash', duration: 5000, source: 'test' });
        plugin.clearActiveTriggers();

        expect(plugin.activeTriggerCount).toBe(0);
        expect(api.emit).toHaveBeenCalledWith('flame-overlay:clear-triggers', {});
    });

    test('manual trigger endpoint reports when cooldown blocks duplicate test triggers', () => {
        const { plugin, routes } = createPlugin();
        plugin.config.triggerCooldown = 10000;
        plugin.registerRoutes();

        const firstRes = createResponse();
        routes['POST /api/flame-overlay/trigger'](
            { body: { type: 'flash', duration: 800, source: 'test:flash' } },
            firstRes
        );

        const secondRes = createResponse();
        routes['POST /api/flame-overlay/trigger'](
            { body: { type: 'flash', duration: 800, source: 'test:flash' } },
            secondRes
        );

        expect(firstRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            accepted: true
        }));
        expect(secondRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            accepted: false,
            reason: 'cooldown'
        }));
        plugin.clearActiveTriggers();
    });

    test('feature test endpoint simulates TikTok event handlers with cooldown bypass', () => {
        const { plugin, api, routes } = createPlugin();
        plugin.config.triggerCooldown = 10000;
        plugin.config.triggerRules = [{
            id: 'gift-medium-test',
            event: 'gift',
            condition: 'coins >= 100 && coins <= 499',
            action: 'intensity-boost',
            amount: 0.6,
            duration: 4000,
            enabled: true
        }];
        plugin.registerRoutes();

        const firstRes = createResponse();
        routes['POST /api/flame-overlay/test-event'](
            { body: { type: 'gift-medium' } },
            firstRes
        );

        const secondRes = createResponse();
        routes['POST /api/flame-overlay/test-event'](
            { body: { type: 'gift-medium' } },
            secondRes
        );

        const triggerEmits = api.emit.mock.calls.filter(call => call[0] === 'flame-overlay:trigger');
        expect(triggerEmits).toHaveLength(2);
        expect(triggerEmits[0][1]).toEqual(expect.objectContaining({
            type: 'intensity-boost',
            amount: 0.6,
            source: 'rule:gift-medium-test'
        }));
        expect(firstRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            accepted: true,
            event: 'gift',
            type: 'gift-medium'
        }));
        expect(secondRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            accepted: true,
            event: 'gift',
            type: 'gift-medium'
        }));
        plugin.clearActiveTriggers();
    });

    test('config endpoint clamps numeric settings and rejects unknown effect types', () => {
        const { plugin, routes } = createPlugin();
        plugin.registerRoutes();

        const clampRes = createResponse();
        routes['POST /api/flame-overlay/config'](
            { body: { triggerCooldown: -20, triggerMaxStack: 999, bloomRadius: 50 } },
            clampRes
        );

        expect(clampRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Configuration updated'
        }));
        expect(plugin.config.triggerCooldown).toBe(0);
        expect(plugin.config.triggerMaxStack).toBe(50);
        expect(plugin.config.bloomRadius).toBe(10);

        const invalidRes = createResponse();
        routes['POST /api/flame-overlay/config'](
            { body: { effectType: 'not-real' } },
            invalidRes
        );

        expect(invalidRes.status).toHaveBeenCalledWith(400);
        expect(invalidRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false
        }));
    });

    test('default config ships cinematic HDR v3 visual controls in OBS-safe mode', () => {
        const { plugin } = createPlugin();

        expect(plugin.config).toEqual(expect.objectContaining({
            visualProfileVersion: 3,
            qualityMode: 'obs-safe',
            sparkEnabled: true,
            heatDistortionEnabled: true,
            cinematicContrast: expect.any(Number),
            coreWhiteness: expect.any(Number),
            emberTrailAmount: expect.any(Number)
        }));
    });

    test('config endpoint accepts and clamps cinematic HDR v3 controls', () => {
        const { plugin, routes } = createPlugin();
        plugin.registerRoutes();

        const res = createResponse();
        routes['POST /api/flame-overlay/config'](
            {
                body: {
                    qualityMode: 'max-quality',
                    sparkDensity: 99,
                    heatDistortionStrength: -5,
                    cinematicContrast: 9,
                    coreWhiteness: 2,
                    emberTrailAmount: 3
                }
            },
            res
        );

        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Configuration updated'
        }));
        expect(plugin.config).toEqual(expect.objectContaining({
            qualityMode: 'max-quality',
            sparkDensity: 2,
            heatDistortionStrength: 0,
            cinematicContrast: 2,
            coreWhiteness: 1,
            emberTrailAmount: 1
        }));
    });

    test('v3 migration upgrades old defaults without overwriting custom visual choices', () => {
        const { plugin } = createPlugin({
            getConfig: jest.fn(key => (key === 'settings' ? {
                visualProfileVersion: 2,
                flameBrightness: 0.92,
                bloomIntensity: 1.7,
                smokeEnabled: false,
                sparkDensity: 0.44
            } : null))
        });

        plugin.loadConfig();

        expect(plugin.config.visualProfileVersion).toBe(3);
        expect(plugin.config.flameBrightness).toBe(0.92);
        expect(plugin.config.bloomIntensity).toBe(1.7);
        expect(plugin.config.smokeEnabled).toBe(false);
        expect(plugin.config.sparkDensity).toBe(0.44);
        expect(plugin.config.qualityMode).toBe('obs-safe');
        expect(plugin.config.heatDistortionEnabled).toBe(true);
    });

    test('renderer exposes adaptive quality and cinematic HDR uniforms', () => {
        const EffectsEngine = loadEffectsEngineClass();
        const engine = Object.create(EffectsEngine.prototype);
        engine.config = { qualityMode: 'low-load', noiseOctaves: 12, sparkDensity: 1.2 };

        expect(engine.getQualitySettings()).toEqual(expect.objectContaining({
            maxNoiseOctaves: 6,
            sparkScale: 0.35,
            bloomScale: 0.55,
            heatScale: 0.45
        }));
        expect(engine.getEffectiveNoiseOctaves()).toBe(6);
        expect(engine.getEffectiveSparkDensity()).toBeCloseTo(0.42);

        const source = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'effects-engine.js'), 'utf8');
        expect(source).toContain('uSparkDensity');
        expect(source).toContain('uHeatDistortionStrength');
        expect(source).toContain('uCinematicContrast');
        expect(source).toContain('uCoreWhiteness');
        expect(source).toContain('uEmberTrailAmount');
    });

    test('settings UI exposes Pro Control Room layout and cinematic presets', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'settings.html'), 'utf8');

        expect(source).toContain('control-room-shell');
        expect(source).toContain('id="qualityMode"');
        expect(source).toContain('data-visual-preset="cinematic-hdr"');
        expect(source).toContain('data-tab-target="look"');
        expect(source).toContain('id="sparkDensity"');
        expect(source).toContain('id="heatDistortionStrength"');
    });

    test('config endpoint reports persistence failure instead of success', () => {
        const { plugin, api, routes } = createPlugin({
            setConfig: jest.fn(() => false)
        });
        plugin.registerRoutes();

        const res = createResponse();
        routes['POST /api/flame-overlay/config'](
            { body: { triggerCooldown: 1234 } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false
        }));
        expect(api.emit).not.toHaveBeenCalledWith('flame-overlay:config-update', expect.anything());
    });

    test('trigger rule endpoint validates known event action effect values and clamps duration', () => {
        const { plugin, routes } = createPlugin();
        plugin.registerRoutes();

        const validRes = createResponse();
        routes['POST /api/flame-overlay/triggers'](
            {
                body: {
                    rules: [{
                        id: 'gift-clamped',
                        event: 'gift',
                        condition: 'coins >= 100',
                        action: 'dramatic',
                        effect: 'lightning',
                        duration: 999999,
                        enabled: true
                    }]
                }
            },
            validRes
        );

        expect(validRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: true,
            message: 'Trigger rules saved'
        }));
        expect(plugin.config.triggerRules[0]).toEqual(expect.objectContaining({
            id: 'gift-clamped',
            duration: 30000
        }));

        const invalidRes = createResponse();
        routes['POST /api/flame-overlay/triggers'](
            {
                body: {
                    rules: [{
                        id: 'bad',
                        event: 'raid',
                        condition: 'any',
                        action: 'explode',
                        effect: 'unknown',
                        duration: 1000,
                        enabled: true
                    }]
                }
            },
            invalidRes
        );

        expect(invalidRes.status).toHaveBeenCalledWith(400);
        expect(invalidRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false
        }));
    });

    test('manual trigger and feature test endpoints validate input values', () => {
        const { plugin, routes } = createPlugin();
        plugin.registerRoutes();

        const triggerRes = createResponse();
        routes['POST /api/flame-overlay/trigger'](
            { body: { type: 'explode', duration: 1000 } },
            triggerRes
        );

        expect(triggerRes.status).toHaveBeenCalledWith(400);
        expect(triggerRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false
        }));

        const testRes = createResponse();
        routes['POST /api/flame-overlay/test-event'](
            { body: { type: { nested: true } } },
            testRes
        );

        expect(testRes.status).toHaveBeenCalledWith(400);
        expect(testRes.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false
        }));
    });

    test('preset routes reject malformed preset names before saving', () => {
        const { plugin, api, routes } = createPlugin();
        plugin.registerRoutes();

        const res = createResponse();
        routes['POST /api/flame-overlay/presets/:name'](
            { params: { name: '../bad' } },
            res
        );

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false
        }));
        expect(api.setConfig).not.toHaveBeenCalledWith('presets', expect.anything());
    });

    test('malformed trigger rules do not crash event processing and preserve gift fallback', () => {
        const { plugin, api } = createPlugin();
        plugin.config.triggerRules = { bad: true };

        expect(() => {
            plugin.handleTikTokEvent('gift', { giftId: 5655, giftName: 'Rose', diamondCount: 1, repeatCount: 1 });
        }).not.toThrow();

        const triggerEmit = api.emit.mock.calls.find(call => call[0] === 'flame-overlay:trigger');
        expect(triggerEmit[1]).toEqual(expect.objectContaining({
            type: 'flash',
            source: 'gift:1'
        }));
        plugin.clearActiveTriggers();
    });

    test('flow registration adds real action and socket fallback receives socket before data', async () => {
        const registerFlowAction = jest.fn();
        const { plugin, api, sockets } = createPlugin({ registerFlowAction });

        plugin.registerFlowActions();

        expect(registerFlowAction).toHaveBeenCalledWith('flame-overlay.trigger', expect.any(Function));
        await expect(registerFlowAction.mock.calls[0][1]({
            type: 'pulse',
            intensity: 0.4,
            duration: 1200
        })).resolves.toEqual(expect.objectContaining({
            success: true,
            accepted: true
        }));

        plugin.clearActiveTriggers();
        api.emit.mockClear();

        const socket = { emit: jest.fn() };
        sockets['flow:flame-overlay:trigger'](socket, {
            burstType: 'flash',
            duration: 800
        });

        expect(api.emit).toHaveBeenCalledWith('flame-overlay:trigger', expect.objectContaining({
            type: 'flash',
            duration: 800,
            source: 'flow'
        }));
        plugin.clearActiveTriggers();
    });
});
