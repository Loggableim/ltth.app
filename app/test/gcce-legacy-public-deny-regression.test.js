'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');
const GCCEPlugin = require('../plugins/gcce');
const {
  createPublicOverlayMiddleware,
  attachPublicSocketPolicy
} = require('../modules/public-overlay-access');

const PLUGIN_DIR = path.resolve(__dirname, '../plugins/gcce');
const LEGACY_HTML = path.join(PLUGIN_DIR, 'overlay.html');
const PUBLIC_HOST = 'fixture-legacy-gcce.trycloudflare.com';
const PUBLIC_COMMAND_CANARY = 'PRIVATE_GCCE_COMMAND_CANARY';
const PUBLIC_RESULT_CANARY = 'PRIVATE_GCCE_RESULT_CANARY';

function createGCCEPluginRoutes() {
  const routes = new Map();
  const api = {
    registerRoute(method, route, handler) {
      routes.set(`${String(method).toUpperCase()} ${route}`, jest.fn(handler));
      return true;
    },
    getSocketIO: jest.fn(),
    registerSocket: jest.fn(),
    log: jest.fn()
  };
  const plugin = Object.assign(Object.create(GCCEPlugin.prototype), {
    api,
    pluginDir: PLUGIN_DIR,
    socketBatcher: null,
    hudManager: {
      getGiftRotator: jest.fn(() => ({ enabled: false, intervalSeconds: 10, entries: [] })),
      updateGiftRotator: jest.fn(async value => value)
    }
  });
  plugin.registerRoutes();
  return { plugin, routes };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    filePath: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile(filePath) { this.filePath = filePath; return this; }
  };
}

function createProtectedSocket(host) {
  const client = new EventEmitter();
  client.connected = true;
  let policyMiddleware;
  let serverSocket;
  const io = {
    use(middleware) { policyMiddleware = middleware; }
  };
  attachPublicSocketPolicy({ io, logger: { warn: jest.fn() } });

  serverSocket = {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use(middleware) { this.packetMiddleware = middleware; },
    emit(eventName, ...args) {
      if (!client.connected) return false;
      client.emit(eventName, ...args);
      return true;
    }
  };

  let connectionError = null;
  policyMiddleware(serverSocket, error => { connectionError = error || null; });
  if (connectionError) throw connectionError;
  return { client, serverSocket };
}

function loadLegacyRenderer(socket) {
  const source = fs.readFileSync(LEGACY_HTML, 'utf8');
  const inlineScript = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .find(([, attributes]) => !/\bsrc\s*=/.test(attributes));
  if (!inlineScript) throw new Error('GCCE legacy overlay inline renderer was not found');

  const dom = new JSDOM(source.replace(inlineScript[0], ''), {
    url: 'http://localhost/gcce/overlay',
    runScripts: 'outside-only'
  });
  dom.window.io = () => socket;
  dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  dom.window.setTimeout = () => 0;
  dom.window.clearTimeout = () => {};
  dom.window.eval(inlineScript[2]);
  return dom;
}

describe('GCCE legacy command overlay public deny boundary', () => {
  test('denies the legacy route and command events publicly while preserving local route and renderer behavior', () => {
    const { routes } = createGCCEPluginRoutes();
    const legacyRoute = routes.get('GET /gcce/overlay');
    expect(legacyRoute).toEqual(expect.any(Function));

    const middleware = createPublicOverlayMiddleware({ logger: { warn: jest.fn() } });
    const publicReq = {
      method: 'GET', originalUrl: '/gcce/overlay', url: '/gcce/overlay',
      headers: { host: PUBLIC_HOST }
    };
    const publicRes = createResponse();
    const publicNext = jest.fn(() => legacyRoute(publicReq, publicRes));
    middleware(publicReq, publicRes, publicNext);

    expect(publicRes.statusCode).toBe(404);
    expect(publicRes.body).toEqual({ error: 'Not found' });
    expect(publicRes.filePath).toBeUndefined();
    expect(publicNext).not.toHaveBeenCalled();
    expect(legacyRoute).not.toHaveBeenCalled();

    const publicSocket = createProtectedSocket(PUBLIC_HOST);
    const publicDom = loadLegacyRenderer(publicSocket.client);
    try {
      const commandDelivered = publicSocket.serverSocket.emit('gcce:command_input', {
        username: PUBLIC_COMMAND_CANARY,
        command: `/${PUBLIC_COMMAND_CANARY}`,
        apiKey: PUBLIC_RESULT_CANARY
      });
      const resultDelivered = publicSocket.serverSocket.emit('gcce:command_result', {
        success: true,
        message: PUBLIC_RESULT_CANARY,
        data: { command: PUBLIC_COMMAND_CANARY, apiKey: PUBLIC_RESULT_CANARY }
      });

      expect(commandDelivered).toBe(false);
      expect(resultDelivered).toBe(false);
      expect(publicDom.window.document.querySelectorAll('.command-input-notification')).toHaveLength(0);
      expect(publicDom.window.document.querySelectorAll('.command-message')).toHaveLength(0);
      expect(publicDom.window.document.documentElement.outerHTML).not.toContain(PUBLIC_COMMAND_CANARY);
      expect(publicDom.window.document.documentElement.outerHTML).not.toContain(PUBLIC_RESULT_CANARY);
    } finally {
      publicDom.window.close();
    }

    const localReq = {
      method: 'GET', originalUrl: '/gcce/overlay', url: '/gcce/overlay',
      headers: { host: '127.0.0.1:3000' }
    };
    const localRes = createResponse();
    const localNext = jest.fn(() => legacyRoute(localReq, localRes));
    middleware(localReq, localRes, localNext);
    expect(localNext).toHaveBeenCalledTimes(1);
    expect(legacyRoute).toHaveBeenCalledTimes(1);
    expect(localRes.filePath).toBe(LEGACY_HTML);

    const localSocket = createProtectedSocket('127.0.0.1:3000');
    const localDom = loadLegacyRenderer(localSocket.client);
    try {
      expect(localSocket.serverSocket.emit('gcce:command_input', {
        username: 'Local Fixture Viewer', command: '/help'
      })).toBe(true);
      expect(localSocket.serverSocket.emit('gcce:command_result', {
        success: true, message: 'Local fixture command result'
      })).toBe(true);
      expect(localDom.window.document.querySelector('.command-input-notification .command-input-user').textContent)
        .toBe('Local Fixture Viewer');
      expect(localDom.window.document.querySelector('.command-input-notification .command-input-text').textContent)
        .toBe('/help');
      expect(localDom.window.document.querySelector('.command-message').textContent)
        .toBe('Local fixture command result');
    } finally {
      localDom.window.close();
    }
  });
});
