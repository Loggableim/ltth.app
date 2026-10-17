'use strict';

const GameEnginePlugin = require('../main');
const { projectPublicOverlayPayload, projectGameEngineConfigResponse } = require('../../../modules/public-overlay-payload-projection');

function createPlugin(storedConfigs = {}) {
  const routes = [];
  const io = { emit: jest.fn() };
  const api = {
    getSocketIO: () => io,
    log: jest.fn(),
    registerRoute: jest.fn((method, route, ...handlers) => routes.push({ method, route, handler: handlers.at(-1) }))
  };
  const plugin = new GameEnginePlugin(api);
  plugin.db = {
    getGameConfig: jest.fn(gameType => storedConfigs[gameType] || null),
    saveGameConfig: jest.fn()
  };
  plugin.registerRoutes();
  return { plugin, routes, io };
}

function responseRecorder() {
  const response = { json: jest.fn(), status: jest.fn() };
  response.status.mockReturnValue(response);
  return response;
}

describe('Game Engine Chess/Connect4 public config projection', () => {
  test.each(['chess', 'connect4'])('projects the actual %s GET producer while retaining its local response', gameType => {
    const stored = gameType === 'chess'
      ? {
          boardTheme: 'wood', backgroundColor: '#123456', whiteColor: '#abcdef', blackColor: '#fedcba',
          streamerRole: 'black', autoplay: { enabled: true, eloOffset: 40, moveDelayMs: 750 },
          privateCanary: 'local-only'
        }
      : {
          boardColor: '#123456', player1Color: '#abcdef', player2Color: '#fedcba', textColor: '#ffffff',
          chatCommand: 'private-command', timeoutLockoutMinutes: 1440, privateCanary: 'local-only'
        };
    const { routes } = createPlugin({ [gameType]: stored });
    const route = routes.find(item => item.method === 'GET' && item.route === '/api/game-engine/config/:gameType');
    const response = responseRecorder();

    route.handler({ params: { gameType } }, response);

    const localConfig = response.json.mock.calls[0][0];
    const publicConfig = projectGameEngineConfigResponse(gameType, localConfig);
    expect(localConfig).toMatchObject(gameType === 'connect4'
      ? { ...stored, player1Color: stored.player1Color.toUpperCase(), player2Color: stored.player2Color.toUpperCase(), textColor: stored.textColor.toUpperCase() }
      : stored);
    expect(publicConfig).not.toHaveProperty('privateCanary');
    expect(publicConfig).not.toHaveProperty('streamerRole');
    expect(publicConfig).not.toHaveProperty('autoplay');
    expect(publicConfig).not.toHaveProperty('chatCommand');
    expect(publicConfig).not.toHaveProperty('timeoutLockoutMinutes');
    expect(publicConfig.displayTexts).toBeDefined();
  });

  test.each([
    ['chess', { boardTheme: 'light', streamerRole: 'black', autoplay: { enabled: true, eloOffset: 30, moveDelayMs: 750 }, privateCanary: 'secret' }],
    ['connect4', { boardColor: '#123456', chatCommand: 'secret-command', timeoutLockoutMinutes: 60, privateCanary: 'secret' }]
  ])('projects the real %s save event but leaves producer/local config intact', (gameType, body) => {
    const { routes, io, plugin } = createPlugin();
    const route = routes.find(item => item.method === 'POST' && item.route === '/api/game-engine/config/:gameType');
    const response = responseRecorder();

    route.handler({ params: { gameType }, body }, response);

    expect(plugin.db.saveGameConfig).toHaveBeenCalledWith(gameType, expect.objectContaining(body));
    const [eventName, localEvent] = io.emit.mock.calls.find(([name]) => name === 'game-engine:config-updated');
    expect(eventName).toBe('game-engine:config-updated');
    expect(localEvent.config).toMatchObject(body);
    const publicEvent = projectPublicOverlayPayload(eventName, localEvent);
    expect(publicEvent.gameType).toBe(gameType);
    expect(publicEvent.config).not.toHaveProperty('privateCanary');
    expect(publicEvent.config).not.toHaveProperty('streamerRole');
    expect(publicEvent.config).not.toHaveProperty('autoplay');
    expect(publicEvent.config).not.toHaveProperty('chatCommand');
    expect(publicEvent.config).not.toHaveProperty('timeoutLockoutMinutes');
  });
});
