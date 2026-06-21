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
      setVelocity: (body, velocity) => {
        body.velocity = velocity;
      },
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

function loadOverlayScript(scriptPath) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="canvas-container"></div><div id="debug-info"></div><div id="perf-hud"></div><div id="fps"></div><div id="emoji-count"></div><div id="emoji-max"></div><div id="body-count"></div><div id="memory-usage"></div><div id="frame-time"></div><div id="perf-resolution"></div><div id="resolution-indicator"></div></body></html>',
    { pretendToBeVisual: true }
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
    io: jest.fn(() => ({ on: jest.fn() })),
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

  vm.createContext(context);
  const source = fs.readFileSync(path.join(APP_DIR, scriptPath), 'utf8');
  vm.runInContext(source, context, { filename: scriptPath });

  return { context, dom, circleBodies, source };
}

describe('WebGPU Emoji Rain client coordinate regressions', () => {
  const scripts = [
    {
      name: 'standard overlay',
      path: 'public/js/webgpu-emoji-rain-engine.js',
      spawnBatch: context => context.processSpawn('heart', 0, 0, 50, null, null, null, false)
    },
    {
      name: 'OBS HUD overlay',
      path: 'public/js/webgpu-emoji-rain-obs-hud.js',
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

  test.each(scripts)('$name keeps large top-spawn batches close enough to enter the viewport', ({ path: scriptPath, spawnBatch }) => {
    const { context, circleBodies } = loadOverlayScript(scriptPath);

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

  test.each(scripts)('$name clamps ground bounce velocity and schedules a delayed pop', ({ path: scriptPath }) => {
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

    context.handleCollision({
      pairs: [
        {
          bodyA: { label: 'ground' },
          bodyB: emoji.body
        }
      ]
    });

    expect(Math.abs(emoji.body.velocity.x)).toBeLessThanOrEqual(4);
    expect(emoji.body.velocity.y).toBeLessThanOrEqual(-6);
    expect(emoji.body.velocity.y).toBeGreaterThanOrEqual(-18);

    const popTimer = timers.find(timer => timer.delay >= 1000);
    expect(popTimer).toBeDefined();

    popTimer.callback();

    expect(emoji.fading).toBe(true);
  });

  test('OBS HUD bounce animation does not overwrite sprite translate3d positioning', () => {
    const source = fs.readFileSync(path.join(APP_DIR, 'plugins/webgpu-emoji-rain/obs-hud.html'), 'utf8');
    const bubbleKeyframes = source.match(/@keyframes bubbleBlop[\s\S]*?\.emoji-sprite\.bouncing/);

    expect(bubbleKeyframes).not.toBeNull();
    expect(bubbleKeyframes[0]).not.toMatch(/\btransform\s*:/);
  });
});
