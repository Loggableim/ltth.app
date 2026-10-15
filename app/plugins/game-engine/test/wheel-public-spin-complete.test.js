'use strict';

const GameEnginePlugin = require('../main');
const WheelGame = require('../games/wheel');
const { protectPublicSocket } = require('../../../modules/public-overlay-access');
const { isIncomingSocketEventAllowed } = require('../../../modules/public-overlay-registry');

const SPIN_ID = 'spin_fixture_1';
const WHEEL_ID = 71;

function createWheelFixture() {
  const emitted = [];
  const recordWheelWin = jest.fn();
  const addXP = jest.fn();
  const api = {
    getSocketIO: () => ({ emit: (event, data) => emitted.push({ event, data }), on: jest.fn() }),
    log: jest.fn(),
    pluginLoader: {
      loadedPlugins: new Map([
        ['viewer-leaderboard', { instance: { db: { addXP } } }],
        ['openshock', { instance: { syntheticFixture: true } }]
      ])
    }
  };
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  };
  const db = { recordWheelWin };
  const wheel = new WheelGame(api, db, logger);
  wheel.triggerShock = jest.fn().mockResolvedValue(true);
  const spinData = {
    spinId: SPIN_ID,
    username: 'fixture-viewer',
    nickname: 'Synthetic Viewer',
    giftName: 'Synthetic Gift',
    wheelId: WHEEL_ID,
    wheelName: 'Synthetic Wheel',
    status: 'spinning',
    timestamp: Date.now(),
    winningSegmentIndex: 0,
    segments: [
      {
        text: 'Synthetic shock prize',
        color: '#123456',
        isNiete: false,
        isShock: true,
        shockIntensity: 12,
        shockDuration: 800,
        shockType: 'shock',
        shockDevices: ['fixture-device'],
        xpReward: 25
      }
    ],
    wheelSettings: { winnerDisplayDuration: 5, infoScreenEnabled: false }
  };
  wheel.activeSpins.set(SPIN_ID, spinData);
  wheel.currentSpin = spinData;
  wheel.isSpinning = true;

  return { api, db, emitted, addXP, recordWheelWin, spinData, wheel };
}

function createSocket(handshake) {
  const handlers = new Map();
  let incomingMiddleware = null;
  return {
    handshake,
    data: {},
    join: jest.fn(),
    use: middleware => { incomingMiddleware = middleware; },
    on: (event, handler) => handlers.set(event, handler),
    emit: jest.fn(() => true),
    handlerFor: event => handlers.get(event),
    async dispatch(event, payload) {
      if (incomingMiddleware) {
        const error = await new Promise(resolve => {
          incomingMiddleware([event, payload], nextError => resolve(nextError || null));
        });
        if (error) return error;
      }
      return handlers.get(event)?.(payload);
    }
  };
}

function registerWheelSocketHandler(wheel) {
  let connectionHandler;
  const api = {
    getSocketIO: () => ({ emit: jest.fn(), on: jest.fn() }),
    registerSocketConnection: handler => { connectionHandler = handler; return true; },
    log: jest.fn()
  };
  const gameEngine = new GameEnginePlugin(api);
  gameEngine.wheelGame = wheel;
  gameEngine.registerSocketEvents();
  return { connectionHandler, gameEngine };
}

function publicWheelSocket() {
  return createSocket({
    address: '203.0.113.15',
    auth: { role: 'overlay' },
    headers: {
      host: 'fixture.trycloudflare.com',
      referer: 'https://fixture.trycloudflare.com/overlay/game-engine/wheel'
    }
  });
}

function localWheelSocket() {
  return createSocket({
    address: '127.0.0.1',
    auth: { role: 'overlay' },
    headers: {
      host: '127.0.0.1:3000',
      referer: 'http://127.0.0.1:3000/overlay/game-engine/wheel'
    }
  });
}

describe('Wheel public spin-complete boundary', () => {
  test('the original role-qualified handler and finalizer reproduce the side effects if reached', async () => {
    jest.useFakeTimers();
    const fixture = createWheelFixture();
    const { connectionHandler, gameEngine } = registerWheelSocketHandler(fixture.wheel);
    const socket = publicWheelSocket();
    protectPublicSocket({ socket, logger: fixture.api });
    connectionHandler(socket);

    try {
      expect(gameEngine._isOverlaySocket(socket)).toBe(true);
      expect(isIncomingSocketEventAllowed('wheel:spin-complete')).toBe(false);
      const completion = socket.handlerFor('wheel:spin-complete')({
        spinId: SPIN_ID,
        segmentIndex: 0,
        reportedSegmentIndex: 0
      });
      await completion;

      expect(fixture.db.recordWheelWin).toHaveBeenCalledWith(
        'fixture-viewer', 'Synthetic Viewer', 'Synthetic shock prize', 0, 'Synthetic Gift', WHEEL_ID
      );
      expect(fixture.addXP).toHaveBeenCalledWith(
        'fixture-viewer', 25, 'wheel_prize', expect.objectContaining({ spinId: SPIN_ID, timeout: false })
      );
      expect(fixture.wheel.activeSpins.has(SPIN_ID)).toBe(false);
      expect(fixture.emitted.find(item => item.event === 'wheel:spin-result')?.data).toEqual(
        expect.objectContaining({ spinId: SPIN_ID, prize: 'Synthetic shock prize', shockScheduled: true })
      );
      await jest.advanceTimersByTimeAsync(500);
      expect(fixture.wheel.triggerShock).toHaveBeenCalledTimes(1);
    } finally {
      fixture.wheel.destroy();
      gameEngine.unifiedQueue?.destroy?.();
      jest.useRealTimers();
    }
  });

  test('public socket policy blocks wheel completion before the handler or finalizer', async () => {
    const fixture = createWheelFixture();
    const { connectionHandler } = registerWheelSocketHandler(fixture.wheel);
    const socket = publicWheelSocket();
    protectPublicSocket({ socket, logger: fixture.api });
    connectionHandler(socket);

    try {
      expect(isIncomingSocketEventAllowed('wheel:spin-complete')).toBe(false);
      expect(isIncomingSocketEventAllowed('wheel:request-config')).toBe(true);
      const error = await socket.dispatch('wheel:spin-complete', {
        spinId: SPIN_ID,
        segmentIndex: 0,
        reportedSegmentIndex: 0
      });

      expect(error).toMatchObject({
        data: { code: 'PUBLIC_SOCKET_EVENT_NOT_ALLOWED' }
      });
      expect(fixture.wheel.activeSpins.has(SPIN_ID)).toBe(true);
      expect(fixture.db.recordWheelWin).not.toHaveBeenCalled();
      expect(fixture.addXP).not.toHaveBeenCalled();
      expect(fixture.emitted.some(item => item.event === 'wheel:spin-result')).toBe(false);
      expect(fixture.wheel.triggerShock).not.toHaveBeenCalled();
    } finally {
      fixture.wheel.destroy();
    }
  });

  test('local role-qualified overlay still finalizes the same synthetic spin', async () => {
    const fixture = createWheelFixture();
    const { connectionHandler, gameEngine } = registerWheelSocketHandler(fixture.wheel);
    const socket = localWheelSocket();
    protectPublicSocket({ socket, logger: fixture.api });
    connectionHandler(socket);

    try {
      expect(socket.data.publicQuickTunnel).toBe(false);
      expect(gameEngine._isOverlaySocket(socket)).toBe(true);
      await socket.dispatch('wheel:spin-complete', {
        spinId: SPIN_ID,
        segmentIndex: 0,
        reportedSegmentIndex: 0
      });

      expect(fixture.wheel.activeSpins.has(SPIN_ID)).toBe(false);
      expect(fixture.db.recordWheelWin).toHaveBeenCalledTimes(1);
      expect(fixture.addXP).toHaveBeenCalledTimes(1);
      expect(fixture.emitted.find(item => item.event === 'wheel:spin-result')?.data).toEqual(
        expect.objectContaining({ spinId: SPIN_ID, prize: 'Synthetic shock prize', shockScheduled: true })
      );
    } finally {
      fixture.wheel.destroy();
      gameEngine.unifiedQueue?.destroy?.();
    }
  });
});
