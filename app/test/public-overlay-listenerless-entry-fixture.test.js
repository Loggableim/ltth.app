'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');
const SidekickPlugin = require('../plugins/sidekick/main');
jest.mock('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/backend/database', () => class ViewerXPDatabaseFixture {});
const ViewerXPPlugin = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl');
const {
  createPublicOverlayMiddleware,
  attachPublicSocketPolicy,
  isApprovedPublicIncomingPacket
} = require('../modules/public-overlay-access');
const {
  projectPublicOverlayPayload
} = require('../modules/public-overlay-payload-projection');
const {
  createPublicOverlayAdapter,
  PUBLIC_QUICK_TUNNEL_ROOM
} = require('../modules/public-overlay-socket-adapter');
const {
  projectPublicOverlayEvent
} = require('../plugins/sidekick/backend/public-status');

const APP_ROOT = path.join(__dirname, '..');
const PUBLIC_HOST = 'listenerless-fixture.trycloudflare.com';
const PROFILE_CANARY = 'FIXTURE_PRIVATE_PROFILE_CANARY';
const SETTINGS_CANARY = 'FIXTURE_PRIVATE_SETTINGS_CANARY';
const TOKEN_CANARY = 'FIXTURE_PRIVATE_TOKEN_CANARY';

function createRouteResponse() {
  return {
    statusCode: 200,
    body: undefined,
    filePath: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile(filePath) { this.filePath = filePath; return this; }
  };
}

function createSidekickFixture() {
  const routes = new Map();
  const plugin = new SidekickPlugin({
    isDocsCapture: false,
    getSocketIO: () => null,
    getDatabase: () => ({}),
    log: jest.fn(),
    registerRoute(method, pathname, handler) {
      routes.set(`${method.toUpperCase()} ${pathname}`, handler);
      return true;
    },
    registerSocket: jest.fn(() => true)
  });
  plugin.eventBus = {
    getRecentEvents: jest.fn(() => [
      {
        type: 'chat', ts: 20, uid: PROFILE_CANARY, nickname: 'Fixture Viewer',
        payload: { comment: `hello ${SETTINGS_CANARY}`, apiKey: TOKEN_CANARY }
      },
      {
        type: 'gift', ts: 21, uid: PROFILE_CANARY, nickname: 'Fixture Gifter',
        payload: { giftName: 'Synthetic Rose', private: SETTINGS_CANARY }
      },
      { type: 'follow', ts: 22, uid: PROFILE_CANARY, nickname: 'Private Follow', payload: {} }
    ])
  };
  plugin._registerRoutes();

  const middleware = createPublicOverlayMiddleware({ logger: { warn: jest.fn() } });
  const routeCalls = [];
  function dispatch(method, pathname, query = {}, host = PUBLIC_HOST) {
    const req = {
      method,
      originalUrl: pathname,
      url: pathname,
      headers: { host },
      query,
      body: {}
    };
    const res = createRouteResponse();
    middleware(req, res, () => {
      routeCalls.push(`${method.toUpperCase()} ${pathname}`);
      const handler = routes.get(`${method.toUpperCase()} ${pathname}`);
      if (handler) return handler(req, res);
      res.status(404).json({ error: 'Not found' });
    });
    return res;
  }

  return { dispatch, routeCalls, plugin, routes };
}

function createProtectedConnection(host = PUBLIC_HOST, configureIo = () => {}) {
  const clientEvents = new EventEmitter();
  let packetMiddleware = null;
  const handlers = new Map();
  const rooms = new Set();
  const serverSocket = {
    handshake: { headers: { host } },
    data: {},
    join(room) { rooms.add(room); },
    use(middleware) { packetMiddleware = middleware; },
    on(eventName, handler) { handlers.set(eventName, handler); },
    emit(eventName, ...args) {
      if (!clientEvents.connected) return false;
      clientEvents.emit(eventName, ...args);
      return true;
    }
  };
  const connectionHandlers = [];
  const io = {
    use: jest.fn(handler => { io.middleware = handler; }),
    on(eventName, handler) {
      if (eventName === 'connection') connectionHandlers.push(handler);
    }
  };
  configureIo(io);
  attachPublicSocketPolicy({ io, logger: { warn: jest.fn() } });
  io.middleware(serverSocket, error => { if (error) throw error; });
  for (const handler of connectionHandlers) handler(serverSocket);

  clientEvents.connected = true;
  const client = {
    connected: true,
    on: (eventName, handler) => clientEvents.on(eventName, handler),
    emit(eventName, ...args) {
      if (packetMiddleware) {
        let denial = null;
        packetMiddleware([eventName, ...args], error => { denial = error || null; });
        if (denial) return false;
      }
      handlers.get(eventName)?.(...args);
      return true;
    },
    disconnect() { client.connected = false; clientEvents.connected = false; }
  };
  return { client, serverSocket, rooms, io };
}

function loadPage(filePath, url, { socket, fetchImpl } = {}) {
  const dom = new JSDOM(fs.readFileSync(filePath, 'utf8'), {
    url,
    runScripts: 'outside-only'
  });
  dom.window.io = () => socket || { on() {}, emit() {}, disconnect() {} };
  dom.window.ViewerXpI18n = {
    text: (_key, fallback, params = {}) => String(fallback).replace(/\{(\w+)\}/g, (_match, key) => params[key] ?? _match)
  };
  if (fetchImpl) dom.window.fetch = fetchImpl;
  dom.window.setInterval = () => 0;
  dom.window.clearInterval = () => {};
  dom.window.setTimeout = () => 0;
  dom.window.clearTimeout = () => {};
  dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
    dom.window.eval(script.textContent);
  }
  return dom;
}

describe('listener-free public overlay entry contract', () => {
  test('passes Sidekick HUD and bounded public event feed through actual middleware into the original renderer', async () => {
    const fixture = createSidekickFixture();
    const page = fixture.dispatch('GET', '/overlay/sidekick/hud');
    expect(page.statusCode).toBe(200);
    expect(page.filePath).toBe(path.join(APP_ROOT, 'plugins/sidekick/overlay/sidekick-hud.html'));

    const reads = [];
    const hud = loadPage(page.filePath, 'http://localhost/overlay/sidekick/hud', {
      fetchImpl: async requestedUrl => {
        reads.push(requestedUrl);
        const parsed = new URL(requestedUrl, 'http://localhost');
        const response = fixture.dispatch('GET', parsed.pathname, Object.fromEntries(parsed.searchParams));
        return { ok: response.statusCode === 200, json: async () => response.body };
      }
    });
    try {
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      expect(reads).toEqual(['/api/sidekick/public-events?limit=5']);
      expect(hud.window.document.querySelectorAll('.event-item')).toHaveLength(2);
      expect(hud.window.document.querySelector('.event-user').textContent).toBe('Fixture Gifter');
      const rendered = hud.window.document.documentElement.outerHTML;
      expect(rendered).toContain('Synthetic Rose');
      for (const canary of [PROFILE_CANARY, SETTINGS_CANARY, TOKEN_CANARY, 'Private Follow']) {
        expect(rendered).not.toContain(canary);
      }
    } finally {
      hud.window.close();
    }

    const privateStatus = fixture.dispatch('GET', '/api/sidekick/public-status');
    expect(privateStatus.statusCode).toBe(404);
    expect(privateStatus.body).toEqual({ error: 'Not found' });
    const post = fixture.dispatch('POST', '/api/sidekick/public-events');
    expect(post.statusCode).toBe(404);
    expect(fixture.routeCalls).toEqual([
      'GET /overlay/sidekick/hud',
      'GET /api/sidekick/public-events'
    ]);
    expect(projectPublicOverlayEvent({ type: 'follow', nickname: 'hidden' })).toBeNull();
  });

  test('guards Viewer-XP requests and projections before the original XP-bar renderer sees them', () => {
    const fixture = createSidekickFixture();
    const expectedPage = path.join(
      APP_ROOT,
      'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html'
    );
    const rawProfile = {
      username: 'SyntheticViewer', name_color: '#12abef', title: '<img id="canary-node">', level: 5,
      xp_progress: 55, xp_for_next_level: 100, xp_progress_percent: 55,
      profilePictureUrl: null, user_id: PROFILE_CANARY,
      settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY
    };
    const viewerPlugin = Object.create(ViewerXPPlugin.prototype);
    viewerPlugin.api = {
      registerRoute(method, pathname, handler) {
        fixture.routes.set(`${String(method).toUpperCase()} ${pathname}`, handler);
        return true;
      },
      registerSocket: jest.fn(),
      log: jest.fn()
    };
    viewerPlugin.db = { getViewerProfile: jest.fn(() => rawProfile) };
    viewerPlugin.registerRoutes();
    const page = fixture.dispatch('GET', '/overlay/viewer-xp/xp-bar');
    expect(page.statusCode).toBe(200);
    expect(page.filePath).toBe(expectedPage);

    const configureViewerHandlers = io => {
      viewerPlugin.api.getSocketIO = () => io;
      viewerPlugin.registerWebSocketHandlers();
    };
    const connection = createProtectedConnection(PUBLIC_HOST, configureViewerHandlers);
    const dom = loadPage(expectedPage, 'http://localhost/overlay/viewer-xp/xp-bar?username=SyntheticViewer&autoHide=false', {
      socket: connection.client
    });
    try {
      expect(dom.window.document.getElementById('username').textContent).toBe('SyntheticViewer');
      expect(dom.window.document.getElementById('xpBar').style.width).toBe('55%');
      expect(dom.window.document.querySelector('#canary-node')).toBeNull();
      for (const canary of [PROFILE_CANARY, SETTINGS_CANARY, TOKEN_CANARY]) {
        expect(dom.window.document.documentElement.outerHTML).not.toContain(canary);
      }

      const extraArgument = connection.client.emit('viewer-xp:public-profile:request', 'SyntheticViewer', 'extra');
      const unknownRequest = connection.client.emit('viewer-xp:private-profile:request', 'SyntheticViewer');
      expect(extraArgument).toBe(false);
      expect(unknownRequest).toBe(false);
      expect(isApprovedPublicIncomingPacket(['viewer-xp:public-profile:request', 'SyntheticViewer'])).toBe(true);
      expect(isApprovedPublicIncomingPacket(['viewer-xp:public-profile:request', 'SyntheticViewer', 'extra'])).toBe(false);
      expect(connection.client.emit('sidekick:public-status:request')).toBe(false);
      expect(connection.serverSocket.emit('sidekick:public-status', {
        connected: true, apiKey: TOKEN_CANARY
      })).toBe(false);

      const local = createProtectedConnection('127.0.0.1:3000', configureViewerHandlers);
      const receivedLocally = jest.fn();
      local.client.on('viewer-xp:profile', receivedLocally);
      expect(local.client.emit('viewer-xp:get-profile', 'SyntheticViewer')).toBe(true);
      expect(receivedLocally).toHaveBeenCalledWith(rawProfile);
      const publicRawRequest = connection.client.emit('viewer-xp:get-profile', 'SyntheticViewer');
      expect(publicRawRequest).toBe(false);
      expect(viewerPlugin.db.getViewerProfile).toHaveBeenCalledWith('SyntheticViewer');

      const beforeDisconnect = dom.window.document.getElementById('username').textContent;
      connection.client.disconnect();
      expect(connection.serverSocket.emit('viewer-xp:public-profile', {
        ...projectPublicOverlayPayload('viewer-xp:public-profile', { ...rawProfile, username: 'AfterDisconnect' })
      })).toBe(false);
      expect(dom.window.document.getElementById('username').textContent).toBe(beforeDisconnect);
    } finally {
      dom.window.close();
    }
  });

  test('splits real owner-guarded public broadcasts from local payloads and renders only the projected DTO', () => {
    const publicConnection = createProtectedConnection();
    const localConnection = createProtectedConnection('127.0.0.1:3000');
    const publicReceived = [];
    const localReceived = [];
    publicConnection.client.on('viewer-xp:public-update', payload => publicReceived.push(payload));
    localConnection.client.on('viewer-xp:public-update', payload => localReceived.push(payload));

    const publicProfile = {
      username: 'SyntheticViewer', name_color: '#12abef', title: 'Fixture Title', level: 6,
      xp_progress: 63, xp_for_next_level: 100, xp_progress_percent: 63,
      profilePictureUrl: null, user_id: PROFILE_CANARY, settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY
    };
    const rawPayload = {
      username: 'SyntheticViewer', amount: 8, profile: publicProfile,
      user_id: PROFILE_CANARY, settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY
    };
    const calls = [];
    const clients = [publicConnection, localConnection];
    class InMemoryAdapter {
      broadcast(packet, options) {
        calls.push({ packet, options });
        const rooms = options.rooms || new Set();
        const except = options.except || new Set();
        for (const connection of clients) {
          const clientRooms = connection.rooms;
          const matchesRoom = rooms.size === 0 || [...rooms].some(room => clientRooms.has(room));
          const excluded = [...except].some(room => clientRooms.has(room));
          if (matchesRoom && !excluded) {
            connection.serverSocket.emit(packet.data[0], packet.data[1]);
          }
        }
      }
    }
    const Adapter = createPublicOverlayAdapter(InMemoryAdapter);
    const adapter = new Adapter({ name: '/' });
    const options = { rooms: new Set(), except: new Set() };
    adapter.broadcast({ data: ['viewer-xp:public-update', rawPayload] }, options);

    expect(calls).toHaveLength(2);
    expect(calls[0].packet.data[1]).toBe(rawPayload);
    expect([...calls[0].options.except]).toContain(PUBLIC_QUICK_TUNNEL_ROOM);
    expect([...calls[1].options.rooms]).toEqual([PUBLIC_QUICK_TUNNEL_ROOM]);
    expect(publicReceived).toEqual([projectPublicOverlayPayload('viewer-xp:public-update', rawPayload)]);
    expect(localReceived).toEqual([rawPayload]);
    expect(JSON.stringify(publicReceived)).not.toContain(PROFILE_CANARY);
    expect(JSON.stringify(publicReceived)).not.toContain(SETTINGS_CANARY);
    expect(JSON.stringify(publicReceived)).not.toContain(TOKEN_CANARY);

    const page = path.join(
      APP_ROOT,
      'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html'
    );
    const dom = loadPage(page, 'http://localhost/overlay/viewer-xp/xp-bar?autoHide=false', {
      socket: publicConnection.client
    });
    try {
      // Re-deliver after the original renderer has installed its event listener.
      adapter.broadcast({ data: ['viewer-xp:public-update', rawPayload] }, options);
      expect(dom.window.document.getElementById('username').textContent).toBe('SyntheticViewer');
      expect(dom.window.document.getElementById('xpBar').style.width).toBe('63%');
      expect(dom.window.document.documentElement.outerHTML).not.toContain(PROFILE_CANARY);
    } finally {
      dom.window.close();
    }
  });
});
