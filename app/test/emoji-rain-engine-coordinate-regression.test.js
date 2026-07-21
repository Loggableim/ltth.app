const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const APP_DIR = path.join(__dirname, '..');

function createMatterMock() {
  const circleBodies = [];

  const matter = {
    Engine: {
      create: () => ({
        gravity: { y: 0 },
        world: { bodies: [] }
      }),
      update: jest.fn(),
      clear: jest.fn()
    },
    Render: {},
    World: {
      add: (world, bodies) => {
        const list = Array.isArray(bodies) ? bodies : [bodies];
        world.bodies.push(...list);
        list.forEach(body => {
          if (body.type === 'circle') {
            circleBodies.push(body);
          }
        });
      },
      remove: (world, body) => {
        world.bodies = world.bodies.filter(candidate => candidate !== body);
      }
    },
    Bodies: {
      rectangle: (x, y, width, height, options = {}) => ({
        type: 'rectangle',
        label: options.label,
        position: { x, y },
        bounds: {
          min: { x: x - width / 2, y: y - height / 2 },
          max: { x: x + width / 2, y: y + height / 2 }
        },
        vertices: []
      }),
      circle: (x, y, radius, options = {}) => {
        const body = {
          type: 'circle',
          label: options.label,
          position: { x, y },
          circleRadius: radius,
          angle: 0,
          velocity: { x: 0, y: 0 },
          ...options
        };
        return body;
      }
    },
    Body: {
      setVelocity: jest.fn((body, velocity) => {
        body.velocity = velocity;
      }),
      setPosition: (body, position) => {
        body.position = position;
      },
      setVertices: (body, vertices) => {
        body.vertices = vertices;
      },
      applyForce: jest.fn()
    },
    Events: {
      on: jest.fn(),
      off: jest.fn()
    }
  };

  return { matter, circleBodies };
}

function loadOverlayScript(scriptPath, options = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="canvas-container"></div><div id="debug-info"></div><div id="perf-hud"></div><div id="fps"></div><div id="emoji-count"></div><div id="emoji-max"></div><div id="body-count"></div><div id="memory-usage"></div><div id="frame-time"></div><div id="perf-resolution"></div><div id="resolution-indicator"></div></body></html>',
    {
      pretendToBeVisual: true,
      url: options.url || 'http://localhost/emoji-rain/obs-hud'
    }
  );
  Object.defineProperty(dom.window.document, 'readyState', {
    value: 'loading',
    configurable: true
  });
  Object.defineProperty(dom.window, 'innerWidth', {
    value: 1920,
    configurable: true
  });
  Object.defineProperty(dom.window, 'innerHeight', {
    value: 1080,
    configurable: true
  });
  dom.window.document.addEventListener = jest.fn();
  dom.window.addEventListener = jest.fn();

  const { matter, circleBodies } = createMatterMock();
  const math = Object.create(Math);
  math.random = jest.fn(() => 0.5);
  const socketHandlers = {};
  const socket = {
    on: jest.fn((eventName, handler) => {
      socketHandlers[eventName] = handler;
    })
  };

  const context = {
    console: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    Matter: matter,
    Math: math,
    window: dom.window,
    document: dom.window.document,
    performance: {
      now: jest.fn(() => 1000)
    },
    requestAnimationFrame: jest.fn(),
    fetch: jest.fn(),
    io: jest.fn(() => socket),
    setTimeout: jest.fn(),
    clearTimeout: jest.fn(),
    setInterval: jest.fn(),
    clearInterval: jest.fn()
  };

  context.window.requestAnimationFrame = context.requestAnimationFrame;
  context.window.fetch = context.fetch;
  context.window.io = context.io;
  Object.defineProperty(context.window, 'performance', {
    value: context.performance,
    configurable: true
  });
  context.window.setTimeout = context.setTimeout;
  context.window.clearTimeout = context.clearTimeout;
  context.window.setInterval = context.setInterval;
  context.window.clearInterval = context.clearInterval;
  context.socketHandlers = socketHandlers;

  vm.createContext(context);
  const source = fs.readFileSync(path.join(APP_DIR, scriptPath), 'utf8');
  vm.runInContext(source, context, { filename: scriptPath });

  return { context, dom, circleBodies, source };
}

function enableCustomImages(context, imageUrl = '/global-custom.webp') {
  vm.runInContext(`
    config.use_custom_images = true;
    config.image_urls = [${JSON.stringify(imageUrl)}];
  `, context);
}

describe('EmojiRain client coordinate regressions', () => {
  const scripts = [
    {
      name: 'standard overlay',
      path: 'public/js/emoji-rain-engine.js',
      spawnBatch: context => context.processSpawn('heart', 0, 0, 50, null, null, null, false)
    },
    {
      name: 'OBS HUD overlay',
      path: 'public/js/emoji-rain-obs-hud.js',
      spawnBatch: context => context.handleSpawnEvent({ count: 50, emoji: 'heart', x: 0, y: 0 })
    }
  ];

  test.each(scripts)('$name maps normalized Y coordinates to canvas pixels', ({ path: scriptPath }) => {
    const { context, circleBodies } = loadOverlayScript(scriptPath);

    context.initPhysics();
    context.spawnEmoji('heart', 0.5, 0.5, 60);

    expect(circleBodies).toHaveLength(1);
    expect(circleBodies[0].position.y).toBeCloseTo(540, 0);
  });

  test.each(scripts)('$name stores a command-specific lifetime on normal emojis', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    context.initPhysics();

    const emoji = context.spawnEmoji(
      'paw',
      0.5,
      0.5,
      60,
      null,
      null,
      null,
      'command',
      false,
      12000
    );

    expect(emoji.lifetimeMs).toBe(12000);
  });

  test.each(scripts)('$name keeps a locked command emoji when custom images are enabled', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    context.initPhysics();
    enableCustomImages(context);

    const rendered = context.spawnEmoji(
      '🐶',
      0.5,
      0.5,
      60,
      null,
      null,
      null,
      'command',
      false,
      12000,
      true
    );

    expect(rendered.element.querySelector('img')).toBeNull();
    expect(rendered.element.textContent).toBe('🐶');
  });

  test.each(scripts)('$name keeps a locked command image when custom images are enabled', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    context.initPhysics();
    enableCustomImages(context);

    const rendered = context.spawnEmoji(
      '{{profilePicture}}',
      0.5,
      0.5,
      60,
      null,
      '/command.webp',
      null,
      'command',
      false,
      12000,
      true
    );
    const image = rendered.element.querySelector('img');

    expect(image?.src).toContain('/command.webp');
    expect(image?.src).not.toContain('/global-custom.webp');
  });

  test.each(scripts)('$name still uses a global custom image for unlocked rain', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    context.initPhysics();
    enableCustomImages(context);

    const rendered = context.spawnEmoji('🐶', 0.5, 0.5, 60);

    expect(rendered.element.querySelector('img')?.src).toContain('/global-custom.webp');
  });

  test.each(scripts)('$name carries command lifetime through its rate-limit queue', ({ path: scriptPath }) => {
    const { source } = loadOverlayScript(scriptPath);
    const queueStart = source.indexOf('rateLimitQueue.push({');
    const queueEnd = source.indexOf('});', queueStart);
    const drainStart = source.indexOf('const emojiData = rateLimitQueue.shift();');
    const drainEnd = source.indexOf('emojisSpawnedThisSecond++', drainStart);

    expect(queueStart).toBeGreaterThan(-1);
    expect(source.slice(queueStart, queueEnd)).toContain('lifetimeMs');
    expect(source.slice(queueStart, queueEnd)).toContain('assetLocked');
    expect(drainStart).toBeGreaterThan(-1);
    expect(source.slice(drainStart, drainEnd)).toContain('emojiData.lifetimeMs');
    expect(source.slice(drainStart, drainEnd)).toContain('emojiData.assetLocked');
    expect(source).toContain('emoji.despawnMs || emoji.lifetimeMs || config.emoji_lifetime_ms');
  });

  test('standard overlay carries command lifetime through its spawn queue', () => {
    const { source } = loadOverlayScript('public/js/emoji-rain-engine.js');
    const queueStart = source.indexOf('spawnQueue.push({');
    const queueEnd = source.indexOf('});', queueStart);

    expect(queueStart).toBeGreaterThan(-1);
    expect(source.slice(queueStart, queueEnd)).toContain('lifetimeMs');
    expect(source.slice(queueStart, queueEnd)).toContain('assetLocked');
    expect(source).toMatch(/function processSpawn\([^)]*lifetimeMs[^)]*\)/);
    expect(source).toContain('event.spawnKind, event.lifetimeMs');
    expect(source).toContain('event.assetLocked');
  });

  test.each(scripts)('$name keeps large top-spawn batches close enough to enter the viewport', async ({ path: scriptPath, spawnBatch }) => {
    const { context, circleBodies } = loadOverlayScript(scriptPath);

    context.fetch.mockResolvedValue({
      json: async () => ({
        success: true,
        config: {
          rate_limit_enabled: false
        }
      })
    });

    await context.loadConfig();
    context.initPhysics();
    spawnBatch(context);

    expect(circleBodies).toHaveLength(50);
    circleBodies.forEach(body => {
      expect(body.position.y).toBeGreaterThanOrEqual(-(body.circleRadius * 2));
    });
  });

  test.each(scripts)('$name pops heart balloons with an inline transform that preserves their position', ({ path: scriptPath }) => {
    const { context, dom } = loadOverlayScript(scriptPath);
    const element = dom.window.document.createElement('div');
    element.style.transform = 'translate3d(100px, 540px, 0) translate(-50%, -50%) rotate(0deg) scale(1)';

    context.popHeartBalloon({
      element,
      popping: false,
      removed: false
    });

    expect(element.style.opacity).toBe('0');
    expect(element.style.transform).toContain('translate3d(100px, 540px, 0)');
    expect(element.style.transform).toContain('scale(0.1)');
  });

  test.each(scripts)('$name renders the TikTok profile image on every fifth heart balloon by default', ({ path: scriptPath }) => {
    const { context, dom } = loadOverlayScript(scriptPath);
    context.initPhysics();

    for (let i = 0; i < 5; i++) {
      context.spawnHeartBalloon({
        count: 5,
        username: 'liker',
        profilePictureUrl: 'https://example.test/tiktok-avatar.jpg',
        x: 0.5
      }, i);
    }

    const balloons = dom.window.document.querySelectorAll('.heart-balloon');
    expect(balloons).toHaveLength(5);
    expect(balloons[0].querySelector('img')).toBeNull();
    expect(balloons[3].querySelector('img')).toBeNull();
    expect(balloons[4].querySelector('img').src).toBe('https://example.test/tiktok-avatar.jpg');
  });

  test('standard overlay spawns gift ball rain as physics bodies with image and price despawn', () => {
    const { context, dom, circleBodies } = loadOverlayScript('public/js/emoji-rain-engine.js');
    context.initPhysics();

    context.handleSpawnEvent({
      mode: 'gift-balls',
      type: 'gift-balls',
      count: 3,
      giftName: 'Rose',
      giftImageUrl: 'https://example.test/rose.png',
      size: 88,
      despawnMs: 9000,
      x: 0.5,
      y: 0
    });

    const giftBalls = dom.window.document.querySelectorAll('.gift-ball');
    expect(giftBalls).toHaveLength(3);
    giftBalls.forEach(giftBall => {
      expect(giftBall.querySelector('img').src).toBe('https://example.test/rose.png');
    });
    expect(circleBodies).toHaveLength(3);
    circleBodies.forEach(body => {
      expect(body.circleRadius).toBeCloseTo(44, 0);
    });
    expect(context.setTimeout).toHaveBeenCalledTimes(3);
    expect(context.setTimeout).toHaveBeenCalledWith(expect.any(Function), 9000);
  });

  test.each(scripts)('$name gift ball socket event respects gift rain count', ({ path: scriptPath }) => {
    const { context, dom, circleBodies } = loadOverlayScript(scriptPath);
    context.initPhysics();
    context.initSocket();

    context.socketHandlers['emoji-rain:gift-balls']({
      mode: 'gift-balls',
      type: 'gift-balls',
      count: 4,
      giftName: 'Rose',
      giftImageUrl: 'https://example.test/rose.png',
      size: 72,
      despawnMs: 9000,
      x: 0.5,
      y: 0
    });

    const giftBalls = dom.window.document.querySelectorAll('.gift-ball');
    expect(giftBalls).toHaveLength(4);
    giftBalls.forEach(giftBall => {
      expect(giftBall.textContent).toBe('');
      expect(giftBall.querySelector('img').src).toBe('https://example.test/rose.png');
    });
    expect(circleBodies).toHaveLength(4);
  });

  test.each([
    ['all', 'http://localhost/emoji-rain/obs-hud', { emoji: true, hearts: true, gifts: true }],
    ['emoji', 'http://localhost/emoji-rain/obs-hud/emojiregen', { emoji: true, hearts: false, gifts: false }],
    ['hearts', 'http://localhost/emoji-rain/obs-hud/herzballons', { emoji: false, hearts: true, gifts: false }],
    ['gifts', 'http://localhost/emoji-rain/obs-hud/geschenkeregen', { emoji: false, hearts: false, gifts: true }],
    ['emoji-gifts', 'http://localhost/emoji-rain/obs-hud/emojiregen-geschenkeregen', { emoji: true, hearts: false, gifts: true }]
  ])('standard overlay resolves %s OBS layer permissions', (_layer, url, expected) => {
    const { context } = loadOverlayScript('public/js/emoji-rain-engine.js', { url });

    expect(context.overlayAllowsEventCategory('emoji')).toBe(expected.emoji);
    expect(context.overlayAllowsEventCategory('hearts')).toBe(expected.hearts);
    expect(context.overlayAllowsEventCategory('gifts')).toBe(expected.gifts);
  });

  test.each(scripts)('$name filters socket events for the emoji plus gift OBS layer', async ({ path: scriptPath }) => {
    const { context, circleBodies } = loadOverlayScript(scriptPath, {
      url: 'http://localhost/emoji-rain/obs-hud/emojiregen-geschenkeregen'
    });

    context.fetch.mockResolvedValue({
      json: async () => ({
        success: true,
        config: {
          rate_limit_enabled: false
        }
      })
    });

    await context.loadConfig();
    context.initPhysics();
    context.initSocket();

    context.socketHandlers['emoji-rain:heart-balloons']({ count: 1, x: 0.5 });
    expect(circleBodies).toHaveLength(0);

    context.socketHandlers['emoji-rain:spawn']({ count: 1, emoji: 'heart', x: 0.5, y: 0 });
    expect(circleBodies).toHaveLength(1);

    context.socketHandlers['emoji-rain:gift-balls']({
      count: 2,
      giftName: 'Rose',
      giftImageUrl: 'https://example.test/rose.png',
      size: 72,
      despawnMs: 9000,
      x: 0.5,
      y: 0
    });
    expect(circleBodies).toHaveLength(3);
  });

  test.each(scripts)('$name leaves floor bounce to physics and does not pop on first impact', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    const timers = [];
    context.setTimeout.mockImplementation((callback, delay) => {
      const timerId = timers.length + 1;
      timers.push({ callback, delay, timerId });
      return timerId;
    });
    context.window.setTimeout = context.setTimeout;

    context.initPhysics();
    const emoji = context.spawnEmoji('heart', 0.5, 0.5, 60);
    emoji.body.velocity = { x: -40, y: -35 };
    context.Matter.Body.setVelocity.mockClear();

    context.handleCollision({
      pairs: [
        {
          bodyA: { label: 'ground' },
          bodyB: emoji.body
        }
      ]
    });

    expect(context.Matter.Body.setVelocity).not.toHaveBeenCalled();
    expect(emoji.body.velocity).toEqual({ x: -40, y: -35 });
    expect(emoji.element.style.animation).toBe('');
    expect(emoji.element.classList.contains('bouncing')).toBe(false);
    expect(emoji.fading).toBe(false);
    expect(timers.some(timer => timer.delay >= 1000)).toBe(false);
  });

  test.each(scripts)('$name fades despawning emojis in place without scaling toward the viewport origin', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    context.setTimeout.mockImplementation((callback, delay) => delay);
    context.window.setTimeout = context.setTimeout;

    context.initPhysics();
    const emoji = context.spawnEmoji('heart', 0.5, 0.5, 60);
    const transformBeforeFade = 'translate3d(960px, 1020px, 0) translate(-50%, -50%) rotate(0rad)';
    emoji.element.style.transform = transformBeforeFade;

    context.fadeOutEmoji(emoji);

    expect(emoji.fading).toBe(true);
    expect(emoji.element.style.transform).toBe(transformBeforeFade);
    expect(emoji.element.style.scale).toBe('');
    expect(emoji.element.classList.contains('fading')).toBe(true);
  });

  test.each(scripts)('$name lets gift balls keep their price despawn after touching the floor', ({ path: scriptPath }) => {
    const { context } = loadOverlayScript(scriptPath);
    const timers = [];
    context.setTimeout.mockImplementation((callback, delay) => {
      const timerId = timers.length + 1;
      timers.push({ callback, delay, timerId });
      return timerId;
    });
    context.window.setTimeout = context.setTimeout;

    context.initPhysics();
    const giftBall = context.spawnGiftBall({
      giftName: 'Rose',
      giftImageUrl: 'https://example.test/rose.png',
      size: 88,
      despawnMs: 9000,
      x: 0.5,
      y: 0
    });
    timers.length = 0;
    context.Matter.Body.setVelocity.mockClear();

    context.handleCollision({
      pairs: [
        {
          bodyA: { label: 'ground' },
          bodyB: giftBall.body
        }
      ]
    });

    expect(context.Matter.Body.setVelocity).not.toHaveBeenCalled();
    expect(giftBall.fading).toBe(false);
    expect(timers.some(timer => timer.delay >= 1000)).toBe(false);
  });

  test('OBS HUD bounce animation does not overwrite sprite translate3d positioning', () => {
    const source = fs.readFileSync(path.join(APP_DIR, 'plugins/emoji-rain/obs-hud.html'), 'utf8');
    const bubbleKeyframes = source.match(/@keyframes bubbleBlop[\s\S]*?\.emoji-sprite\.bouncing/);

    expect(bubbleKeyframes).not.toBeNull();
    expect(bubbleKeyframes[0]).not.toMatch(/\btransform\s*:/);
  });
});
