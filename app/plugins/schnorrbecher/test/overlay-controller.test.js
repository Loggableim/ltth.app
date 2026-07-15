const {
  calculateJarBounds,
  calculateCoinSize,
  calculateSpillBounds,
  planVisualCoins,
  CoinJarOverlay
} = require('../overlay/coincup');

describe('CoinJarOverlay planning', () => {
  test('keeps the open top and walls inside the configured jar', () => {
    expect(calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    )).toMatchObject({
      left: 720,
      right: 1200,
      top: 286,
      bottom: 886
    });
  });

  test('bounds icon sizes and compacts an oversized spawn request', () => {
    expect(calculateCoinSize(1, 1)).toBeGreaterThanOrEqual(34);
    expect(calculateCoinSize(1000000, 3)).toBeLessThanOrEqual(180);
    expect(planVisualCoins(
      { totalValue: 10000, visualCoins: 100 },
      { maxPhysicalIcons: 300 },
      295
    )).toMatchObject({
      spawnCount: 5,
      compact: true,
      overflow: true
    });
  });

  test('keeps side-spilled gifts inside the visible scene', () => {
    expect(calculateSpillBounds({ width: 1920, height: 1080 })).toMatchObject({
      floor: { x: 960, y: 1092, width: 1968, height: 24 },
      left: { x: -12, y: 540 },
      right: { x: 1932, y: 540 }
    });
  });

  test('invalidates queued spawns when a reset generation arrives', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.generation = 0;
    overlay.queue = [{ generation: 0 }];
    overlay.bodies = [];

    overlay.clear({ generation: 1, reason: 'admin' });

    expect(overlay.queue).toEqual([]);
    expect(overlay.generation).toBe(1);
  });

  test('requests a full sync after reconnecting', () => {
    const socket = { on: jest.fn(), emit: jest.fn() };
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.socket = socket;
    overlay.applySync = jest.fn();
    overlay.enqueueSpawn = jest.fn();
    overlay.clear = jest.fn();
    overlay.applyConfig = jest.fn();

    overlay.bindSocket();

    const connectHandler = socket.on.mock.calls.find(([event]) => event === 'connect')[1];
    connectHandler();
    expect(socket.emit).toHaveBeenCalledWith('coinJar.sync.request');
  });

  test('keeps server generation zero after an initial sync so matching spawns are accepted', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.generation = 0;
    overlay.queue = [];
    overlay.bodies = [];
    overlay.config = { maxPhysicalIcons: 300 };
    overlay.applyConfig = jest.fn();
    overlay._renderCounter = jest.fn();
    overlay._createCoin = jest.fn();
    overlay._emitTelemetry = jest.fn();

    overlay.applySync({ generation: 0, totalCoinValue: 0, visualCoinCount: 0 });

    expect(overlay.generation).toBe(0);
  });
});
