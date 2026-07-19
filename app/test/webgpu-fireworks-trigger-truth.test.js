const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

function createApi(emitImplementation) {
  const routes = new Map();
  const flowActions = new Map();
  return {
    routes,
    flowActions,
    getPluginDataDir: jest.fn(() => path.join(__dirname, '.tmp-webgpu-fireworks-trigger-truth')),
    getConfig: jest.fn(() => null),
    setConfig: jest.fn(),
    getDatabase: jest.fn(() => null),
    emit: jest.fn(emitImplementation),
    log: jest.fn(),
    registerMiddleware: jest.fn(),
    registerRoute: jest.fn((method, route, handler) => routes.set(`${method}:${route}`, handler)),
    registerFlowAction: jest.fn((id, action) => flowActions.set(id, action))
  };
}

function createPlugin(config = {}, emitImplementation) {
  const api = createApi(emitImplementation);
  const plugin = new FireworksPlugin(api);
  plugin.config = normalizeConfig(config);
  plugin.spawnPlanner.plan = jest.fn(() => ({
    position: { x: 0.25, y: 0.4 },
    origin: { x: 0.5, y: 1 },
    seed: 1234
  }));
  return { api, plugin };
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status: jest.fn(function setStatus(statusCode) {
      this.statusCode = statusCode;
      return this;
    }),
    json: jest.fn(function sendJson(body) {
      this.body = body;
      return this;
    })
  };
}

describe('WebGPU Fireworks trigger truth contract', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('returns structured rejection reasons before dispatch', () => {
    const disabled = createPlugin({ enabled: false });
    expect(disabled.plugin.triggerFirework({ reason: 'gift' })).toEqual({
      accepted: false,
      reason: 'disabled'
    });
    expect(disabled.api.emit).not.toHaveBeenCalled();

    const rateLimited = createPlugin({ queueEnabled: true });
    rateLimited.plugin.shouldAllowFirework = jest.fn(() => false);
    expect(rateLimited.plugin.triggerFirework({ reason: 'gift' })).toEqual({
      accepted: false,
      reason: 'rate-limit'
    });
    expect(rateLimited.api.emit).not.toHaveBeenCalled();

    const policyDenied = createPlugin({ minFps: 24 });
    policyDenied.plugin.getTriggerHealth = jest.fn(() => ({
      currentFps: 10,
      activeFireworkCount: 0,
      queueDepth: 0
    }));
    expect(policyDenied.plugin.triggerFirework({
      reason: 'gift',
      tier: 'small',
      particleCount: 30
    })).toEqual({
      accepted: false,
      reason: 'low-fps-small-gift'
    });
    expect(policyDenied.api.emit).not.toHaveBeenCalled();

    const concurrent = createPlugin({ maxConcurrentFireworks: 2 });
    concurrent.plugin.getTriggerHealth = jest.fn(() => ({
      currentFps: 60,
      activeFireworkCount: 2,
      queueDepth: 0
    }));
    expect(concurrent.plugin.triggerFirework({
      reason: 'gift',
      tier: 'medium',
      particleCount: 60
    })).toEqual({
      accepted: false,
      reason: 'concurrent-limit'
    });
    expect(concurrent.api.emit).not.toHaveBeenCalled();
  });

  test.each([
    ['an explicit false return', () => false],
    ['a thrown exception', () => { throw new Error('socket unavailable'); }]
  ])('does not create active state when emit fails through %s', (_label, emitImplementation) => {
    const { api, plugin } = createPlugin({}, emitImplementation);

    expect(plugin.triggerFirework({ shape: 'heart' })).toEqual({
      accepted: false,
      reason: 'emit-failed'
    });
    expect(api.emit).toHaveBeenCalledWith(
      'webgpu-fireworks:trigger',
      expect.objectContaining({ shape: 'heart' })
    );
    expect(plugin.activeFireworkCount).toBe(0);
    expect(plugin.activeFireworkTimers.size).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('treats legacy undefined emit returns as a successful submission and tracks it afterwards', () => {
    const { api, plugin } = createPlugin();

    const result = plugin.triggerFirework({ shape: 'star', intensity: 1.5 });

    expect(result).toEqual({
      accepted: true,
      reason: 'submitted',
      payload: expect.objectContaining({
        shape: 'star',
        intensity: 1.5,
        reason: 'manual'
      })
    });
    expect(api.emit).toHaveBeenCalledWith('webgpu-fireworks:trigger', result.payload);
    expect(plugin.activeFireworkCount).toBe(1);
    expect(plugin.activeFireworkTimers.size).toBe(1);
    expect(jest.getTimerCount()).toBe(1);

    jest.runOnlyPendingTimers();
    expect(plugin.activeFireworkCount).toBe(0);
    expect(plugin.activeFireworkTimers.size).toBe(0);
  });

  test('manual trigger route returns accepted truth and strips internal dispatch fields', () => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    const handler = api.routes.get('post:/api/webgpu-fireworks/trigger');
    const response = createResponse();

    handler({
      body: {
        shape: 'heart',
        forceRocket: true,
        playSound: false,
        reason: 'gift',
        bypassEnabled: false,
        requestedParticleCount: 999,
        avatarRocketHead: true,
        lane: 'required',
        priority: 999,
        required: true
      }
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      accepted: true,
      reason: 'submitted',
      message: 'Firework submitted',
      payload: expect.objectContaining({
        shape: 'heart',
        forceRocket: true,
        playSound: false,
        reason: 'manual',
        avatarRocketHead: false,
        requestedParticleCount: 50
      })
    });
    expect(response.body.payload).not.toHaveProperty('lane');
    expect(response.body.payload).not.toHaveProperty('priority');
    expect(response.body.payload).not.toHaveProperty('required');
  });

  test.each([
    ['rate-limit', 429],
    ['disabled', 409],
    ['low-fps-small-gift', 409],
    ['concurrent-limit', 409],
    ['emit-failed', 503]
  ])('manual trigger route maps %s rejection to HTTP %i', (reason, expectedStatus) => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerFirework = jest.fn(() => ({ accepted: false, reason }));
    const response = createResponse();

    api.routes.get('post:/api/webgpu-fireworks/trigger')({ body: {} }, response);

    expect(response.statusCode).toBe(expectedStatus);
    expect(response.body).toEqual({
      success: false,
      accepted: false,
      reason
    });
  });

  test('random trigger route returns the wrapper submission result', () => {
    const payload = { id: 'random-1', reason: 'random' };
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerRandomFirework = jest.fn(() => ({
      accepted: true,
      reason: 'submitted',
      payload
    }));
    const response = createResponse();

    api.routes.get('post:/api/webgpu-fireworks/random')({ body: {} }, response);

    expect(plugin.triggerRandomFirework).toHaveBeenCalledWith(true);
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      success: true,
      accepted: true,
      reason: 'submitted',
      message: 'Random firework submitted',
      payload
    });
  });

  test.each([
    ['rate-limit', 429],
    ['disabled', 409],
    ['concurrent-limit', 409],
    ['emit-failed', 503]
  ])('random trigger route maps %s rejection to HTTP %i', (reason, expectedStatus) => {
    const { api, plugin } = createPlugin();
    plugin.registerRoutes();
    plugin.triggerRandomFirework = jest.fn(() => ({ accepted: false, reason }));
    const response = createResponse();

    api.routes.get('post:/api/webgpu-fireworks/random')({ body: {} }, response);

    expect(response.statusCode).toBe(expectedStatus);
    expect(response.body).toEqual({
      success: false,
      accepted: false,
      reason
    });
  });

  test('internal wrappers and flow action return the trigger result', async () => {
    const result = { accepted: false, reason: 'rate-limit' };
    const { api, plugin } = createPlugin();
    plugin.triggerFirework = jest.fn(() => result);
    plugin.getGiftInfo = jest.fn(() => null);

    expect(plugin.triggerRandomFirework()).toBe(result);
    expect(plugin.trigger('burst', { intensity: 2 })).toBe(result);
    expect(plugin.triggerGift(123, { username: 'viewer' })).toBe(result);

    plugin.config.chatTriggerKeywords = ['boom'];
    expect(plugin.handleChatTrigger({ comment: 'boom!' })).toBe(result);

    plugin.config.minGiftCoins = 1;
    expect(plugin.handleGiftEvent({
      giftId: 123,
      uniqueId: 'viewer',
      coins: 5,
      repeatCount: 1
    })).toBe(result);

    plugin.registerFlowActions();
    await expect(api.flowActions.get('webgpu_fireworks_trigger').execute({
      shape: 'star',
      visualStyle: 'realistic',
      intensity: 2,
      colors: '#ff0000, #00ff00'
    })).resolves.toBe(result);
  });
});
