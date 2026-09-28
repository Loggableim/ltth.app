/**
 * Integration Tests for Sidekick AvatarDriver Integration with VNyan
 */

const SidekickPlugin = require('../main');
const { VNyanClient } = require('../backend/vnyanClient');
const { AnimazeClient } = require('../backend/animazeClient');

function createMockApi(initialConfig = {}) {
  const routes = new Map();
  const socketHandlers = new Map();
  const tiktokHandlers = new Map();
  let storedConfig = initialConfig;

  return {
    routes,
    socketHandlers,
    tiktokHandlers,
    getSocketIO: () => ({
      emit: jest.fn()
    }),
    getDatabase: () => ({
      prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn()
      }))
    }),
    log: jest.fn(),
    getConfig: jest.fn(() => storedConfig),
    setConfig: jest.fn((key, val) => {
      storedConfig = val;
    }),
    registerRoute: jest.fn((method, path, handler) => {
      routes.set(`${method.toUpperCase()} ${path}`, handler);
    }),
    registerSocket: jest.fn((event, handler) => {
      socketHandlers.set(event, handler);
    }),
    registerTikTokEvent: jest.fn((event, handler) => {
      tiktokHandlers.set(event, handler);
    }),
    on: jest.fn()
  };
}

describe('Sidekick AvatarDriver Integration', () => {
  let plugin;
  let api;

  afterEach(async () => {
    if (plugin) {
      await plugin.destroy();
    }
  });

  it('initializes VNyanClient as default avatarDriver', async () => {
    api = createMockApi({
      avatar: {
        driver: 'vnyan',
        vnyan: {
          autoConnect: false
        }
      }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    expect(plugin.avatarDriver).toBeInstanceOf(VNyanClient);
    expect(plugin.vnyanClient).toBeInstanceOf(VNyanClient);
    expect(plugin.animazeClient).toBeInstanceOf(AnimazeClient);

    const status = plugin._getStatus();
    expect(status.driver).toBe('vnyan');
    expect(status.avatar).toBeDefined();
    expect(status.avatar.driver).toBe('vnyan');
    expect(status.vnyan).toBeDefined();
  });

  it('selects AnimazeClient when driver is animaze', async () => {
    api = createMockApi({
      avatar: {
        driver: 'animaze'
      },
      animaze: {
        enabled: true,
        autoConnect: false
      }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    expect(plugin.avatarDriver).toBe(plugin.animazeClient);
    const status = plugin._getStatus();
    expect(status.driver).toBe('animaze');
  });

  it('registers avatar API routes', async () => {
    api = createMockApi({
      avatar: { driver: 'vnyan', vnyan: { autoConnect: false } }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    expect(api.routes.has('GET /api/sidekick/avatar/status')).toBe(true);
    expect(api.routes.has('POST /api/sidekick/avatar/connect')).toBe(true);
    expect(api.routes.has('POST /api/sidekick/avatar/disconnect')).toBe(true);
    expect(api.routes.has('POST /api/sidekick/avatar/trigger')).toBe(true);
    expect(api.routes.has('POST /api/sidekick/avatar/expression')).toBe(true);

    // Test GET /api/sidekick/avatar/status
    const req = {};
    const res = {
      json: jest.fn()
    };
    const statusHandler = api.routes.get('GET /api/sidekick/avatar/status');
    statusHandler(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        driver: 'vnyan',
        vnyan: expect.objectContaining({ driver: 'vnyan' })
      })
    );
  });

  it('handles test trigger route', async () => {
    api = createMockApi({
      avatar: { driver: 'vnyan', vnyan: { autoConnect: false } }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    plugin.avatarDriver.sendTrigger = jest.fn(() => true);

    const req = { body: { trigger: 'SK_Gift_Rose' } };
    const res = { json: jest.fn(), status: jest.fn(() => res) };
    const triggerHandler = api.routes.get('POST /api/sidekick/avatar/trigger');

    await triggerHandler(req, res);
    expect(plugin.avatarDriver.sendTrigger).toHaveBeenCalledWith('SK_Gift_Rose', {});
    expect(res.json).toHaveBeenCalledWith({ success: true, trigger: 'SK_Gift_Rose' });
  });

  it('dispatches speech triggers when _sendOutput is called', async () => {
    api = createMockApi({
      avatar: { driver: 'vnyan', vnyan: { autoConnect: false } }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    plugin.avatarDriver.setSpeaking = jest.fn();

    await plugin._sendOutput('Test Response');
    expect(plugin.avatarDriver.setSpeaking).toHaveBeenCalledWith(true, 'Test Response');
  });

  it('forwards TikTok events to avatarDriver', async () => {
    api = createMockApi({
      avatar: { driver: 'vnyan', vnyan: { autoConnect: false } }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    plugin.avatarDriver.handleStreamEvent = jest.fn();

    // Trigger gift
    const giftHandler = api.tiktokHandlers.get('gift');
    giftHandler({
      uniqueId: 'user123',
      nickname: 'SuperGifter',
      giftName: 'Rose',
      giftId: 5655,
      diamondCount: 1,
      repeatCount: 10
    });

    expect(plugin.avatarDriver.handleStreamEvent).toHaveBeenCalledWith(
      'gift',
      expect.objectContaining({
        giftName: 'Rose',
        repeatCount: 10
      })
    );
  });

  it('manages avatar rules via GET and POST /api/sidekick/avatar/rules', async () => {
    api = createMockApi({
      avatar: { driver: 'vnyan', vnyan: { autoConnect: false } }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    // 1. GET rules
    const getRes = { json: jest.fn() };
    const getHandler = api.routes.get('GET /api/sidekick/avatar/rules');
    getHandler({}, getRes);
    expect(getRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        giftRules: expect.any(Array)
      })
    );

    // 2. POST rules
    const newRules = [
      { id: 'custom_1', matchType: 'name', matchValue: 'Donut', trigger: 'SK_Donut', emotion: 'Joy' }
    ];
    const postReq = {
      body: {
        giftRules: newRules,
        emotions: { autoReset: true, defaultDurationMs: 5000 },
        itemDrop: { enabled: true, triggerName: 'SK_CustomDrop' }
      }
    };
    const postRes = { json: jest.fn(), status: jest.fn(() => postRes) };
    const postHandler = api.routes.get('POST /api/sidekick/avatar/rules');
    postHandler(postReq, postRes);

    expect(postRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        giftRules: newRules
      })
    );

    // Verify vnyanClient configuration updated
    expect(plugin.vnyanClient.getVnyanConfig().giftRules).toEqual(newRules);
  });

  it('handles /api/sidekick/avatar/test-gift and test-drop routes', async () => {
    api = createMockApi({
      avatar: { driver: 'vnyan', vnyan: { autoConnect: false } }
    });

    plugin = new SidekickPlugin(api);
    await plugin.init();

    plugin.avatarDriver.handleStreamEvent = jest.fn();
    plugin.avatarDriver.triggerItemDrop = jest.fn(() => true);

    // Test test-gift route
    const giftReq = {
      body: { giftName: 'Galaxy', diamondCount: 1000, repeatCount: 1, nickname: 'Tester' }
    };
    const giftRes = { json: jest.fn(), status: jest.fn(() => giftRes) };
    const testGiftHandler = api.routes.get('POST /api/sidekick/avatar/test-gift');

    await testGiftHandler(giftReq, giftRes);
    expect(plugin.avatarDriver.handleStreamEvent).toHaveBeenCalledWith(
      'gift',
      expect.objectContaining({ giftName: 'Galaxy', diamondCount: 1000 })
    );
    expect(giftRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true })
    );

    // Test test-drop route
    const dropReq = {
      body: { item: 'Banana', count: 7, user: 'Monkey' }
    };
    const dropRes = { json: jest.fn(), status: jest.fn(() => dropRes) };
    const testDropHandler = api.routes.get('POST /api/sidekick/avatar/test-drop');

    testDropHandler(dropReq, dropRes);
    expect(plugin.avatarDriver.triggerItemDrop).toHaveBeenCalledWith('Banana', 7, 'Monkey');
    expect(dropRes.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, item: 'Banana', count: 7 })
    );
  });
});
