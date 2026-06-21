const OpenShockPlugin = require('../main');

function createHarness() {
  const routes = [];
  const plugin = new OpenShockPlugin({
    log: jest.fn(),
    registerRoute: (method, routePath, handler) => routes.push({ method, routePath, handler }),
    getDatabase: jest.fn(),
    getSocketIO: jest.fn(() => ({ emit: jest.fn(), on: jest.fn() })),
    emit: jest.fn()
  });

  plugin.config.apiKey = 'openshock-secret';
  plugin.config.pishock.apiKey = 'pishock-secret';
  plugin.saveData = jest.fn(async () => {});
  plugin._reinitializeShockClient = jest.fn();
  plugin.loadDevices = jest.fn(async () => []);
  plugin.safetyManager = { updateConfig: jest.fn() };
  plugin.queueManager = {
    clearQueue: jest.fn(async () => 0),
    pauseProcessing: jest.fn(),
    resumeProcessing: jest.fn(),
    getQueueStatus: jest.fn(() => ({ queueSize: 0, pending: 0, processing: 0 })),
    getQueueItems: jest.fn(() => []),
    removeItem: jest.fn()
  };
  plugin.patternExecutor = { getActiveExecutions: jest.fn(() => []), getStats: jest.fn(() => ({})) };
  plugin.mappingEngine = { getAllMappings: jest.fn(() => []), mappings: new Map() };
  plugin.patternEngine = { getAllPatterns: jest.fn(() => []) };
  plugin.zappieHellManager = {
    getAllGoals: jest.fn(() => []),
    getActiveGoals: jest.fn(() => []),
    addGoal: jest.fn(),
    updateGoal: jest.fn(),
    deleteGoal: jest.fn(),
    resetGoal: jest.fn(),
    resetStreamGoals: jest.fn(),
    getAllEventChains: jest.fn(() => []),
    addEventChain: jest.fn(),
    updateEventChain: jest.fn(),
    deleteEventChain: jest.fn(),
    eventChains: new Map(),
    executeEventChain: jest.fn()
  };

  plugin._registerRoutes();

  const findRoute = (method, routePath) =>
    routes.find(route => route.method === method && route.routePath === routePath)?.handler;

  return { plugin, findRoute };
}

function createResponse() {
  return {
    status: jest.fn(function status() { return this; }),
    json: jest.fn()
  };
}

describe('OpenShockPlugin route safety', () => {
  test('returns masked credentials after updating config', async () => {
    const { plugin, findRoute } = createHarness();
    const handler = findRoute('post', '/api/openshock/config');
    const res = createResponse();

    await handler({ body: { baseUrl: 'https://api.openshock.app' } }, res);

    expect(plugin.config.apiKey).toBe('openshock-secret');
    expect(plugin.config.pishock.apiKey).toBe('pishock-secret');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      config: expect.objectContaining({
        apiKey: '***cret',
        pishock: expect.objectContaining({ apiKey: '***cret' })
      })
    }));
  });

  test('registers queue pause/resume and stats reset API routes used by the UI', () => {
    const { findRoute } = createHarness();

    expect(findRoute('post', '/api/openshock/queue/pause')).toBeDefined();
    expect(findRoute('post', '/api/openshock/queue/resume')).toBeDefined();
    expect(findRoute('post', '/api/openshock/stats/reset')).toBeDefined();
  });
});
