'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const EmojiRainPlugin = require('../plugins/emoji-rain/main');
const { createPublicOverlayMiddleware, protectPublicSocket } = require('../modules/public-overlay-access');
const { projectPublicOverlayPayload, projectEmojiRainUserMappingsResponse } = require('../modules/public-overlay-payload-projection');
const { isHttpAllowed, isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');

const APP_ROOT = path.resolve(__dirname, '..');
let fixtureRoot;

function createMatterMock() {
  return {
    Engine: {
      create: () => ({ gravity: { y: 0 }, world: { bodies: [] } }),
      update: jest.fn(),
      clear: jest.fn()
    },
    Render: {},
    World: {
      add: (world, bodies) => world.bodies.push(...(Array.isArray(bodies) ? bodies : [bodies])),
      remove: jest.fn()
    },
    Bodies: {
      rectangle: (x, y, width, height, options = {}) => ({ type: 'rectangle', x, y, width, height, options, vertices: [] }),
      circle: (x, y, radius, options = {}) => ({ type: 'circle', position: { x, y }, circleRadius: radius, options, vertices: [] })
    },
    Body: {
      setVelocity: jest.fn((body, velocity) => { body.velocity = velocity; }),
      setPosition: jest.fn((body, position) => { body.position = position; }),
      setVertices: jest.fn()
    },
    Events: { on: jest.fn(), off: jest.fn() }
  };
}

function loadOriginalRenderer(scriptPath, mappingsResponse) {
  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="canvas-container"></div><div id="debug-info"></div><div id="perf-hud"></div><div id="fps"></div><div id="emoji-count"></div><div id="emoji-max"></div><div id="body-count"></div><div id="memory-usage"></div><div id="frame-time"></div><div id="perf-resolution"></div><div id="resolution-indicator"></div></body></html>',
    { pretendToBeVisual: true, url: 'http://localhost/emoji-rain/obs-hud' }
  );
  Object.defineProperty(dom.window.document, 'readyState', { value: 'loading', configurable: true });
  Object.defineProperty(dom.window, 'innerWidth', { value: 1920, configurable: true });
  Object.defineProperty(dom.window, 'innerHeight', { value: 1080, configurable: true });
  dom.window.document.addEventListener = jest.fn();
  dom.window.addEventListener = jest.fn();

  const matter = createMatterMock();
  const socket = { on: jest.fn(), disconnect: jest.fn() };
  const context = {
    console: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    Matter: matter,
    Math: Object.assign(Object.create(Math), { random: () => 0.5 }),
    window: dom.window,
    document: dom.window.document,
    performance: { now: jest.fn(() => 1000) },
    requestAnimationFrame: jest.fn(),
    fetch: jest.fn(async () => ({ ok: true, json: async () => mappingsResponse })),
    io: jest.fn(() => socket),
    setTimeout: jest.fn(),
    clearTimeout: jest.fn(),
    setInterval: jest.fn(),
    clearInterval: jest.fn()
  };
  Object.assign(dom.window, {
    requestAnimationFrame: context.requestAnimationFrame,
    fetch: context.fetch,
    io: context.io,
    setTimeout: context.setTimeout,
    clearTimeout: context.clearTimeout,
    setInterval: context.setInterval,
    clearInterval: context.clearInterval
  });
  Object.defineProperty(dom.window, 'performance', { value: context.performance, configurable: true });
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(APP_ROOT, scriptPath), 'utf8'), context, { filename: scriptPath });
  return { context, dom };
}

function createResponse() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {},
    sendFile() {}
  };
}

function callPublicMiddleware(handler, { method = 'GET', pathname, host = 'fixture-emoji.trycloudflare.com', query = {} }) {
  const req = {
    method,
    originalUrl: pathname,
    url: pathname,
    headers: { host },
    query,
    body: {}
  };
  const res = createResponse();
  let passed = false;
  createPublicOverlayMiddleware({ logger: { warn: jest.fn() } })(req, res, () => { passed = true; });
  if (passed) handler(req, res);
  return res;
}

function createSocket(host) {
  const rawEmit = jest.fn(() => true);
  return {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use: jest.fn(),
    emit: rawEmit,
    rawEmit
  };
}

function makePluginFixture() {
  const routes = new Map();
  const api = {
    registerRoute: jest.fn((method, pathname, ...handlers) => routes.set(`${method} ${pathname}`, handlers.at(-1))),
    registerMiddleware: jest.fn(),
    emit: jest.fn(),
    log: jest.fn()
  };
  const plugin = Object.create(EmojiRainPlugin.prototype);
  plugin.api = api;
  plugin.uploadDir = path.join(fixtureRoot, 'uploads');
  plugin.userMappingsPath = path.join(fixtureRoot, 'profile', 'users.json');
  plugin.userConfigMappingsPath = path.join(fixtureRoot, 'config', 'users.json');
  plugin.registerRoutes();
  return { plugin, api, routes };
}

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-emoji-rain-mappings-'));
});

afterAll(() => {
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  const target = path.resolve(fixtureRoot);
  if (target.startsWith(tempRoot) && path.basename(target).startsWith('ltth-emoji-rain-mappings-')) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('Legacy EmojiRain public mapping privacy boundary', () => {
  const mappingFixture = {
    'Fixture Viewer': '🌟',
    'Private Fixture': '{{profilePicture}}'
  };

  test('projects the real GET producer to an empty public map while leaving the local admin response intact', () => {
    const { plugin, routes } = makePluginFixture();
    fs.mkdirSync(path.dirname(plugin.userMappingsPath), { recursive: true });
    fs.writeFileSync(plugin.userMappingsPath, JSON.stringify(mappingFixture));
    const handler = routes.get('get /api/emoji-rain/user-mappings');
    expect(handler).toBeDefined();

    const local = callPublicMiddleware(handler, { pathname: '/api/emoji-rain/user-mappings', host: '127.0.0.1:3000' });
    const publicResponse = callPublicMiddleware(handler, {
      pathname: '/api/emoji-rain/user-mappings?username=Fixture%20Viewer',
      query: { username: 'Fixture Viewer' }
    });

    expect(local.body).toEqual({
      success: true,
      mappings: mappingFixture,
      stats: { totalMappings: 2, uniqueEmojis: 2 }
    });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.body).toEqual({ success: true, mappings: {} });
    expect(JSON.stringify(publicResponse.body)).not.toMatch(/Fixture Viewer|Private Fixture|totalMappings|uniqueEmojis|profilePicture/);
    expect(projectEmojiRainUserMappingsResponse({ success: true, mappings: [] })).toBeNull();
    expect(projectEmojiRainUserMappingsResponse({ success: false, mappings: mappingFixture })).toBeNull();
  });

  test('projects the actual update producer for public sockets and preserves local update payloads', () => {
    const { plugin, api, routes } = makePluginFixture();
    const update = routes.get('post /api/emoji-rain/user-mappings');
    expect(update).toBeDefined();
    const response = createResponse();
    update({ body: { mappings: mappingFixture } }, response);
    expect(response.body).toEqual({ success: true, message: 'User emoji mappings updated' });
    expect(api.emit).toHaveBeenCalledWith('emoji-rain:user-mappings-update', { mappings: mappingFixture });

    const localSocket = createSocket('127.0.0.1:3000');
    const publicSocket = createSocket('fixture-emoji.trycloudflare.com');
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    const [eventName, payload] = api.emit.mock.calls[0];
    localSocket.emit(eventName, payload);
    publicSocket.emit(eventName, payload);

    expect(localSocket.rawEmit).toHaveBeenCalledWith(eventName, { mappings: mappingFixture });
    expect(publicSocket.rawEmit).toHaveBeenCalledWith(eventName, { mappings: {} });
    expect(isOutgoingSocketEventAllowed('emoji-rain:user-mappings-update')).toBe(true);
    expect(projectPublicOverlayPayload('emoji-rain:user-mappings-update', { mappings: [] })).toBeNull();
    expect(publicSocket.emit('emoji-rain:user-mappings-update', { mappings: [] })).toBe(false);
  });

  test('fails malformed public GET responses closed and does not expose write methods', () => {
    const response = callPublicMiddleware((_req, res) => res.json({ success: true, mappings: [] }), {
      pathname: '/api/emoji-rain/user-mappings'
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: 'Response unavailable' });
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/emoji-rain/user-mappings' })).toBe(false);
  });

  test.each([
    ['public response', { success: true, mappings: {} }],
    ['local response', { success: true, mappings: mappingFixture }]
  ])('feeds the %s through each original renderer and verifies mapping behavior', async (_label, mappingResponse) => {
    for (const scriptPath of ['public/js/emoji-rain-engine.js', 'public/js/emoji-rain-obs-hud.js']) {
      const { context, dom } = loadOriginalRenderer(scriptPath, mappingResponse);
      try {
        await context.loadUserEmojiMappings();
        context.initPhysics();
        const mapped = context.spawnEmoji('💧', 0.5, 0.2, 60, 'Fixture Viewer');
        if (mappingResponse.mappings['Fixture Viewer']) {
          expect(mapped.element.textContent).toBe('🌟');
        } else {
          expect(mapped.element.textContent).toBe('💧');
        }

        const profileMapped = context.spawnEmoji('💙', 0.5, 0.3, 60, 'Private Fixture', 'https://example.test/profile.jpg');
        if (mappingResponse.mappings['Private Fixture'] === '{{profilePicture}}') {
          expect(profileMapped.element.querySelector('img')?.src).toBe('https://example.test/profile.jpg');
        } else {
          expect(profileMapped.element.querySelector('img')).toBeNull();
          expect(profileMapped.element.textContent).toBe('💙');
        }
      } finally {
        dom.window.close();
      }
    }
  });
});
