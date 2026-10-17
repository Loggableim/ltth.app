const GameEnginePlugin = require('../main');

function createRouteHarness(triggerSpin) {
  const routes = new Map();
  const plugin = {
    api: {
      registerRoute: (method, route, handler) => routes.set(`${method.toLowerCase()} ${route}`, handler)
    },
    wheelGame: { triggerSpin },
    logger: { error: jest.fn() }
  };
  GameEnginePlugin.prototype.registerWheelSpinRoute.call(plugin);
  return { handler: routes.get('post /api/game-engine/wheel/spin'), logger: plugin.logger };
}

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

describe('Game Engine wheel spin HTTP route', () => {
  test('waits for triggerSpin and returns its resolved result', async () => {
    let resolveSpin;
    const triggerSpin = jest.fn(() => new Promise(resolve => { resolveSpin = resolve; }));
    const { handler } = createRouteHarness(triggerSpin);
    const response = createResponse();

    const pendingResponse = handler({ body: { username: 'fixture-user', nickname: 'Fixture User', giftName: 'Fixture', wheelId: '3' } }, response);
    expect(response.body).toBeUndefined();
    resolveSpin({ success: true, queued: true, spinId: 'fixture-spin' });
    await pendingResponse;

    expect(triggerSpin).toHaveBeenCalledWith('fixture-user', 'Fixture User', '', 'Fixture', 3);
    expect(response.body).toEqual({ success: true, queued: true, spinId: 'fixture-spin' });
  });

  test('returns a rejected triggerSpin as HTTP 500 with a useful error', async () => {
    const triggerSpin = jest.fn(() => Promise.reject(new Error('fixture wheel unavailable')));
    const { handler, logger } = createRouteHarness(triggerSpin);
    const response = createResponse();

    await handler({ body: {} }, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'fixture wheel unavailable' });
    expect(logger.error).toHaveBeenCalledWith('Error triggering Wheel spin: fixture wheel unavailable');
  });
});
