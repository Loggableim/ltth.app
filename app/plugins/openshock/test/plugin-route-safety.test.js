const OpenShockPlugin = require('../main');
const {
  projectPublicOverlayPayload
} = require('../../../modules/public-overlay-payload-projection');

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

  test('forgets only the deleted goal display token and preserves the full local update', () => {
    const { plugin, findRoute } = createHarness();
    const goal = {
      id: 'route-delete-token-fixture', name: 'Fixture', targetCoins: 10,
      currentCoins: 0, type: 'stream', active: true, chainId: 'local-chain'
    };
    plugin.zappieHellManager.getAllGoals.mockReturnValue([goal]);
    const beforeDelete = projectPublicOverlayPayload('zappiehell:goals:state', { goals: [goal] })
      .goals[0].displayToken;
    const handler = findRoute('delete', '/api/openshock/zappiehell/goals/:id');
    const res = createResponse();

    handler({ params: { id: goal.id } }, res);

    expect(plugin.zappieHellManager.deleteGoal).toHaveBeenCalledWith(goal.id);
    expect(plugin.api.emit).toHaveBeenCalledWith('zappiehell:goals:update', { goals: [goal] });
    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [goal] })).toBeNull();

    const recreatedGoal = { ...goal, name: 'Recreated' };
    plugin.zappieHellManager.addGoal.mockReturnValue(recreatedGoal);
    plugin.zappieHellManager.getAllGoals.mockReturnValue([recreatedGoal]);
    const createHandler = findRoute('post', '/api/openshock/zappiehell/goals');
    createHandler({ body: recreatedGoal }, createResponse());
    const afterDelete = projectPublicOverlayPayload('zappiehell:goals:update', { goals: [recreatedGoal] })
      .goals[0].displayToken;
    expect(afterDelete).not.toBe(beforeDelete);
  });

  test('retains the display token when manager deletion fails', () => {
    const { plugin, findRoute } = createHarness();
    const goal = {
      id: 'route-delete-failure-token-fixture', name: 'Fixture', targetCoins: 10,
      currentCoins: 0, type: 'stream', active: true
    };
    plugin.zappieHellManager.deleteGoal.mockImplementation(() => {
      throw new Error('fixture delete failure');
    });
    const token = projectPublicOverlayPayload('zappiehell:goals:state', { goals: [goal] })
      .goals[0].displayToken;
    const handler = findRoute('delete', '/api/openshock/zappiehell/goals/:id');
    const res = createResponse();

    handler({ params: { id: goal.id } }, res);

    expect(projectPublicOverlayPayload('zappiehell:goals:update', { goals: [goal] })
      .goals[0].displayToken).toBe(token);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
