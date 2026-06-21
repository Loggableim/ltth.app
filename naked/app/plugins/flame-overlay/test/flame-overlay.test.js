const FlameOverlayPlugin = require('../main');

function createPlugin(overrides = {}) {
    const handlers = {};
    const routes = {};
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
        registerSocket: jest.fn(),
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

    return { plugin, api, handlers, routes };
}

function createResponse() {
    const res = {
        status: jest.fn(() => res),
        json: jest.fn()
    };
    return res;
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
});
