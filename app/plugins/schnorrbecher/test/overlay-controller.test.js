const {
  calculateJarBounds,
  calculateJarPhysicsBounds,
  calculateJarWallSegments,
  calculateJarInteriorBounds,
  calculateJarContainmentPosition,
  calculateGiftSize,
  calculateJarFillRatio,
  isOutsideJarInterior,
  calculateSpillBounds,
  planVisualCoins,
  CoinJarOverlay
} = require('../overlay/coincup');
const { JSDOM } = require('jsdom');

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

  test('maps invisible walls to the visible inner contour of each generated glass', () => {
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    );

    expect(calculateJarPhysicsBounds(renderBounds, 'classic')).toMatchObject({
      opening: { left: 777, right: 1143, y: 352 },
      floor: { left: 813, right: 1107, y: 733 }
    });
    expect(calculateJarPhysicsBounds(renderBounds, 'mason')).toMatchObject({
      opening: { left: 830, right: 1090, y: 358 },
      floor: { left: 816, right: 1104, y: 784 }
    });
    expect(calculateJarPhysicsBounds(renderBounds, 'arcade')).toMatchObject({
      opening: { left: 826, right: 1094, y: 406 },
      floor: { left: 806, right: 1114, y: 757 }
    });
  });

  test('keeps collision walls within the visible glass contour', () => {
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    );
    expect(calculateJarWallSegments(calculateJarPhysicsBounds(renderBounds, 'arcade'))).toEqual({
      leftWall: {
        start: { x: 826, y: 406 },
        end: { x: 806, y: 757 }
      },
      rightWall: {
        start: { x: 1094, y: 406 },
        end: { x: 1114, y: 757 }
      }
    });
  });

  test('uses fixed configurable gift sizes for every coin-value band', () => {
    const config = {
      iconScale: 1,
      giftSize1: 32,
      giftSize2To10: 40,
      giftSize11To29: 50,
      giftSize30To99: 62,
      giftSize100To199: 76,
      giftSize200To499: 92,
      giftSize500To999: 110,
      giftSize1000To1999: 132,
      giftSize2000To4999: 158,
      giftSize5000Plus: 180
    };

    expect(calculateGiftSize(1, config)).toBe(32);
    expect(calculateGiftSize(10, config)).toBe(40);
    expect(calculateGiftSize(29, config)).toBe(50);
    expect(calculateGiftSize(999, config)).toBe(110);
    expect(calculateGiftSize(1000, config)).toBe(132);
    expect(calculateGiftSize(5000, config)).toBe(180);
    expect(calculateGiftSize(1000, { ...config, iconScale: 0.5 })).toBe(66);
    expect(calculateGiftSize(5000, { ...config, iconScale: 3 })).toBe(240);
  });

  test('projects escaped normal gifts back inside the visible jar shape only below the opening', () => {
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    );
    const physicsBounds = calculateJarPhysicsBounds(renderBounds, 'arcade');
    const interior = calculateJarInteriorBounds(physicsBounds, 600);
    const position = { x: 780, y: 600 };

    expect(isOutsideJarInterior(position, 20, physicsBounds)).toBe(true);
    expect(calculateJarContainmentPosition(position, 20, physicsBounds)).toEqual({
      x: interior.left + 20,
      y: 600
    });
    expect(isOutsideJarInterior({ x: 780, y: 360 }, 20, physicsBounds)).toBe(false);
  });

  test('compacts an oversized spawn request', () => {
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

  test('selects the configured jar artwork and renders catalog gifts without coin styling', () => {
    const document = new JSDOM([
      '<main id="coin-jar-scene"><div id="coin-jar-sprites"></div>',
      '<div id="coin-jar"><div class="jar-label"></div></div>',
      '<div id="coin-jar-counter"></div><div id="coin-jar-debug"></div></main>'
    ].join('')).window.document;
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.document = document;
    overlay.config = { jarStyle: 'classic', maxPhysicalIcons: 300, iconScale: 1, spawnMultiplier: 1, spawnDelayMs: 80, jarOpacity: 0.22 };
    overlay.elements = {
      scene: document.querySelector('#coin-jar-scene'),
      jar: document.querySelector('#coin-jar'),
      jarLabel: document.querySelector('.jar-label'),
      counter: document.querySelector('#coin-jar-counter'),
      sprites: document.querySelector('#coin-jar-sprites'),
      debug: document.querySelector('#coin-jar-debug')
    };
    overlay.resize = jest.fn();
    overlay._renderCounter = jest.fn();

    overlay.applyConfig({ jarStyle: 'arcade', maxPhysicalIcons: 99999 });
    const sprite = overlay._createSprite({ giftName: 'Rose', giftImage: 'https://catalog.example/rose.png' }, 64, 0);

    expect(overlay.elements.jar.dataset.jarStyle).toBe('arcade');
    expect(overlay.config.maxPhysicalIcons).toBe(3000);
    expect(overlay.elements.jar.style.getPropertyValue('--jar-artwork')).toContain('/assets/jars/arcade.png');
    expect(sprite.className).toContain('gift-sprite');
    expect(sprite.className).not.toContain('coin-sprite');
    expect(sprite.querySelector('img').src).toBe('https://catalog.example/rose.png');
    expect(overlay._createSprite({ giftName: 'Missing catalog art' }, 64, 0)).toBeNull();
  });

  test('uses the visible glass capacity instead of the global 3,000-icon safety limit', () => {
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 230, jarHeight: 290, jarX: 90, jarY: 92 }
    );
    const physicsBounds = calculateJarPhysicsBounds(renderBounds, 'mason');
    const bodies = Array.from({ length: 100 }, () => ({
      circleRadius: 8,
      plugin: { overflow: false }
    }));
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.bodies = bodies;
    overlay.physicsBounds = physicsBounds;
    overlay.config = { maxPhysicalIcons: 3000 };

    expect(calculateJarFillRatio(bodies, physicsBounds, 16)).toBeGreaterThanOrEqual(1);
    expect(overlay._isJarFull(16)).toBe(true);
    expect(overlay._isJarFull(128)).toBe(true);
  });

  test('rechecks glass capacity for every queued gift icon before it spawns', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    const payload = { totalValue: 1, giftImage: 'https://catalog.example/rose.png' };
    let scheduled;
    overlay.generation = 0;
    overlay.queue = [{ payload, generation: 0, overflow: false, tier: 0 }];
    overlay.spawnTimer = null;
    overlay.config = { spawnMultiplier: 1 };
    overlay.random = () => 0;
    overlay.setTimeoutFn = callback => {
      scheduled = callback;
      return 1;
    };
    overlay._isJarFull = jest.fn(() => true);
    overlay._createCoin = jest.fn();
    overlay._emitTelemetry = jest.fn();

    overlay._scheduleSpawn();
    scheduled();

    expect(overlay._createCoin).toHaveBeenCalledWith(payload, expect.objectContaining({ overflow: true }));
  });
});
