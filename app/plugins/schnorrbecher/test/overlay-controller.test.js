const {
  calculateJarBounds,
  calculateJarPhysicsBounds,
  calculateJarWallSegments,
  calculateJarInteriorBounds,
  calculateJarContainmentPosition,
  calculateGiftSize,
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

  test('reconstructs sync gifts without catalog art as fallback coins', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.generation = 0;
    overlay.queue = [];
    overlay.bodies = [];
    overlay.config = { maxPhysicalIcons: 300 };
    overlay.applyConfig = jest.fn();
    overlay.clear = jest.fn();
    overlay._renderCounter = jest.fn();
    overlay._isJarFull = jest.fn(() => false);
    overlay._createCoin = jest.fn();
    overlay._emitTelemetry = jest.fn();

    overlay.applySync({
      generation: 0,
      totalCoinValue: 2,
      visualCoinCount: 2,
      recentGifts: [{ giftId: 'unknown-gift', giftName: 'Unknown Gift', giftImage: '' }]
    });

    expect(overlay._createCoin).toHaveBeenCalledTimes(2);
    expect(overlay._createCoin).toHaveBeenLastCalledWith(expect.objectContaining({
      giftId: 'unknown-gift',
      giftImage: ''
    }), expect.objectContaining({ settled: true }));
  });

  test('selects the configured jar artwork and renders catalog gifts or a neutral fallback', () => {
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
    expect(overlay._createSprite({ giftName: 'Missing catalog art' }, 64, 0).className).toContain('gift-fallback');

    overlay.config.showGiftImage = false;
    expect(overlay._createSprite({ giftName: 'Hidden catalog art', giftImage: 'https://catalog.example/hidden.png' }, 64, 0).className).toContain('gift-fallback');
  });

  test('keeps an existing gift body visible when its image request fails', () => {
    const document = new JSDOM('<div id="coin-jar-sprites"></div>').window.document;
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.document = document;
    overlay.config = { showGiftImage: true };
    overlay.elements = { sprites: document.querySelector('#coin-jar-sprites') };

    const sprite = overlay._createSprite({
      giftName: 'Broken catalog art',
      giftImage: 'https://catalog.example/missing.png'
    }, 64, 0);
    sprite.querySelector('img').dispatchEvent(new document.defaultView.Event('error'));

    expect(sprite.isConnected).toBe(true);
    expect(sprite.className).toContain('gift-fallback');
    expect(sprite.querySelector('img')).toBeNull();
  });

  test('spawns overflow gifts beside the glass and marks their bodies as overflow', () => {
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 230, jarHeight: 290, jarX: 90, jarY: 92 }
    );
    const physicsBounds = calculateJarPhysicsBounds(renderBounds, 'mason');
    const body = { position: {}, velocity: {}, plugin: {} };
    const Bodies = { circle: jest.fn(() => body) };
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.engine = { world: {} };
    overlay.Matter = {
      Bodies,
      Body: { setVelocity: jest.fn(), setAngularVelocity: jest.fn() },
      Composite: { add: jest.fn() }
    };
    overlay.bounds = renderBounds;
    overlay.physicsBounds = physicsBounds;
    overlay.config = { iconScale: 1, maxPhysicalIcons: 3000 };
    overlay.random = () => 0.5;
    overlay.bodies = [];
    overlay._createSprite = jest.fn(() => ({ remove: jest.fn() }));

    overlay._createCoin({
      totalValue: 1,
      giftImage: 'https://catalog.example/rose.png'
    }, { overflow: true });

    const [x, y] = Bodies.circle.mock.calls[0];
    expect(x).toBeGreaterThan(renderBounds.right);
    expect(y).toBeLessThan(physicsBounds.opening.y);
    expect(body.plugin.overflow).toBe(true);
  });

  test('keeps normal gifts inside the visible glass contour', () => {
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    );
    const physicsBounds = calculateJarPhysicsBounds(renderBounds, 'mason');
    const Body = { setPosition: jest.fn(), setVelocity: jest.fn() };
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.bounds = renderBounds;
    overlay.physicsBounds = physicsBounds;
    overlay.Matter = { Body };
    overlay._viewport = () => ({ width: 1920, height: 1080 });
    overlay._removeBody = jest.fn();
    overlay._renderDebug = jest.fn();
    overlay.bodies = [{
      position: { x: physicsBounds.opening.left - 40, y: physicsBounds.opening.y + 100 },
      velocity: { x: 0, y: 0 },
      circleRadius: 20,
      angle: 0,
      plugin: { overflow: false, element: null }
    }];

    overlay._updateBodies();

    expect(Body.setPosition).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ y: physicsBounds.opening.y + 100 }));
  });

  test('rechecks visible jar capacity before queued gifts spawn', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    const payload = { totalValue: 1, giftImage: 'https://catalog.example/rose.png' };
    let scheduled;
    overlay.generation = 0;
    overlay.queue = [{ payload, generation: 0, overflow: false, tier: 0 }];
    overlay.spawnTimer = null;
    overlay.config = { spawnDelayMs: 80, spawnMultiplier: 1 };
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
    expect(overlay._isJarFull).toHaveBeenCalled();
  });

  test('uses the configured spawn delay as the timer basis', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    let scheduledDelay;
    overlay.generation = 0;
    overlay.queue = [{ payload: {}, generation: 0, overflow: false, tier: 0 }];
    overlay.spawnTimer = null;
    overlay.config = { spawnDelayMs: 500, spawnMultiplier: 2 };
    overlay.random = () => 0.5;
    overlay.setTimeoutFn = (_callback, delay) => {
      scheduledDelay = delay;
      return 1;
    };
    overlay._emitTelemetry = jest.fn();

    overlay._scheduleSpawn();

    expect(scheduledDelay).toBe(1000);
  });

  test('keeps a physical fallback body when gift art is unavailable', () => {
    const document = new JSDOM('<div id="coin-jar-sprites"></div>').window.document;
    const renderBounds = calculateJarBounds(
      { width: 1920, height: 1080 },
      { jarWidth: 480, jarHeight: 600, jarX: 50, jarY: 82 }
    );
    const body = { position: {}, velocity: {}, plugin: {} };
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.engine = { world: {} };
    overlay.Matter = {
      Bodies: { circle: jest.fn(() => body) },
      Body: { setVelocity: jest.fn(), setAngularVelocity: jest.fn() },
      Composite: { add: jest.fn(), remove: jest.fn() }
    };
    overlay.bounds = renderBounds;
    overlay.physicsBounds = calculateJarPhysicsBounds(renderBounds, 'classic');
    overlay.config = { iconScale: 1, maxPhysicalIcons: 300, showGiftImage: true };
    overlay.random = () => 0.5;
    overlay.bodies = [];
    overlay.document = document;
    overlay.elements = { sprites: document.querySelector('#coin-jar-sprites') };

    const created = overlay._createCoin({ totalValue: 1, giftName: 'Unknown gift' });

    expect(created).toBe(body);
    expect(body.plugin.element.className).toContain('gift-fallback');
    expect(overlay.bodies).toEqual([body]);
  });

  test('keeps full-size representations so later gifts overflow instead of compacting forever', () => {
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.bodies = Array.from({ length: 10 }, (_, index) => ({
      position: { x: index * 10, y: index * 10 },
      plugin: {
        tier: 2,
        overflow: false,
        giftImage: 'https://catalog.example/rose.png',
        giftName: 'Rose'
      }
    }));
    overlay._removeBody = jest.fn(body => {
      overlay.bodies = overlay.bodies.filter(candidate => candidate !== body);
    });
    overlay._createCoin = jest.fn();

    expect(overlay._compactBodies()).toBe(false);
    expect(overlay._createCoin).not.toHaveBeenCalled();
  });

  test('plays the bundled glass impact sound at the configured volume', () => {
    const play = jest.fn(() => Promise.resolve());
    const cloneNode = jest.fn(() => ({ volume: 0, play }));
    const overlay = Object.create(CoinJarOverlay.prototype);
    overlay.config = { soundEnabled: true, soundVolume: 0.35 };
    overlay.elements = { impactSound: { cloneNode } };
    overlay.lastSoundAt = 0;
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(1000);

    overlay._playImpactSound();

    expect(cloneNode).toHaveBeenCalledWith(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(cloneNode.mock.results[0].value.volume).toBe(0.35);
    dateNow.mockRestore();
  });
});
