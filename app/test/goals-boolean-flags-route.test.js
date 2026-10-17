const Database = require('better-sqlite3');
const GoalsPlugin = require('../plugins/goals/main');

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function createGoalsHarness() {
  const db = new Database(':memory:');
  const routes = new Map();
  const api = {
    getDatabase: () => db,
    registerRoute: (method, route, handler) => routes.set(`${method.toLowerCase()} ${route}`, handler),
    log: jest.fn()
  };
  const plugin = new GoalsPlugin(api);
  plugin.db.initialize();
  plugin.broadcastGoalCreated = jest.fn();
  plugin.broadcastGoalUpdated = jest.fn();
  plugin.setupStateMachineListeners = jest.fn();
  plugin.apiModule.registerRoutes();
  return { db, routes, plugin };
}

describe('Goals API boolean flag binding', () => {
  let harness;

  beforeEach(() => {
    harness = createGoalsHarness();
  });

  afterEach(() => {
    harness.db.close();
  });

  test('normalizes boolean create flags before binding to SQLite', async () => {
    const response = createResponse();
    await harness.routes.get('post /api/goals')({
      body: {
        name: 'Fixture likes goal',
        goal_type: 'coins',
        target_value: 10,
        enabled: true,
        reset_on_stream_end: false,
        firework_enabled: false,
        firework_progress_enabled: true
      }
    }, response);

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.goal).toMatchObject({
      enabled: 1,
      reset_on_stream_end: 0,
      firework_enabled: 0,
      firework_progress_enabled: 1
    });
    expect(harness.db.prepare('SELECT enabled, reset_on_stream_end, firework_enabled, firework_progress_enabled FROM goals').get())
      .toEqual({ enabled: 1, reset_on_stream_end: 0, firework_enabled: 0, firework_progress_enabled: 1 });
  });

  test('normalizes boolean update flags and rejects invalid flag values with 400', async () => {
    const createResponseValue = createResponse();
    await harness.routes.get('post /api/goals')({
      body: { name: 'Fixture update goal', goal_type: 'coins', target_value: 10 }
    }, createResponseValue);
    const goalId = createResponseValue.body.goal.id;

    const updateResponse = createResponse();
    harness.routes.get('put /api/goals/:id')({
      params: { id: goalId },
      body: { enabled: false, reset_on_stream_end: true }
    }, updateResponse);

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.body.goal).toMatchObject({ enabled: 0, reset_on_stream_end: 1 });
    expect(harness.db.prepare('SELECT enabled, reset_on_stream_end FROM goals WHERE id = ?').get(goalId))
      .toEqual({ enabled: 0, reset_on_stream_end: 1 });

    const invalidResponse = createResponse();
    harness.routes.get('put /api/goals/:id')({
      params: { id: goalId },
      body: { firework_enabled: 'false' }
    }, invalidResponse);
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.body).toMatchObject({ success: false, error: expect.stringContaining('firework_enabled') });
    expect(harness.db.prepare('SELECT firework_enabled FROM goals WHERE id = ?').get(goalId).firework_enabled).toBe(0);
  });
});
