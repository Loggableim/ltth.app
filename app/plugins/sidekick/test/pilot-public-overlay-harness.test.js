'use strict';

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { Server } = require('socket.io');
const { Client } = require(path.join(path.dirname(require.resolve('socket.io')), 'client'));
const { Decoder, Encoder, PacketType } = require('socket.io-parser');
const SidekickPlugin = require('../main');
const { isHttpAllowed } = require('../../../modules/public-overlay-registry');
const { createPublicOverlayMiddleware, attachPublicSocketPolicy, isApprovedQuickTunnelRequest } = require('../../../modules/public-overlay-access');
const { projectAnonymousOverlayStatus, projectPublicOverlayEvent } = require('../backend/public-status');

function makeInProcessSocketTransport(io) {
  const conn = new EventEmitter();
  const serverClient = new Client(io, Object.assign(conn, {
    id: 'sidekick-pilot-fixture',
    protocol: 4,
    readyState: 'open',
    remoteAddress: '127.0.0.1',
    transport: { writable: true },
    request: {
      headers: { host: 'sidekick-pilot.trycloudflare.com' },
      url: '/socket.io/?EIO=4&transport=websocket',
      connection: { encrypted: false }
    },
    write() {},
    close() {
      this.readyState = 'closed';
      this.emit('close', 'fixture closed');
    }
  }));
  const outbound = new Decoder();
  const serverEvents = [];
  outbound.on('decoded', packet => {
    if (packet.type === PacketType.EVENT) serverEvents.push(packet.data);
  });
  const clientListeners = new Map();
  const clientEncoder = new Encoder();

  conn.write = packet => outbound.add(packet);
  conn.emit('data', '0{}');

  const socket = {
    on(eventName, callback) {
      clientListeners.set(eventName, callback);
      return this;
    },
    emit(eventName, ...args) {
      for (const packet of clientEncoder.encode({
        type: PacketType.EVENT,
        nsp: '/',
        data: [eventName, ...args]
      })) conn.emit('data', packet);
      return this;
    }
  };

  outbound.on('decoded', packet => {
    if (packet.type === PacketType.EVENT) {
      clientListeners.get(packet.data[0])?.(...packet.data.slice(1));
    }
  });

  return {
    socket,
    serverEvents,
    async flush() {
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    },
    close() {
      serverClient.close();
      outbound.destroy();
    }
  };
}

function createSidekickFixture() {
  const routes = new Map();
  const socketHandlers = [];
  const io = new Server(); // No HTTP server is attached and no port is opened.
  const socketStats = { connections: 0, requests: 0, disconnects: 0 };
  const api = {
    isDocsCapture: false,
    getSocketIO: () => io,
    getDatabase: () => ({}),
    log: jest.fn(),
    registerRoute: (method, routePath, handler) => {
      routes.set(`${method.toUpperCase()} ${routePath}`, handler);
      return true;
    },
    registerSocket: (event, callback) => {
      socketHandlers.push({ event, callback });
      return true;
    }
  };
  const plugin = new SidekickPlugin(api);
  let rawStatus = {
    avatar: { isConnected: true, uri: 'private-canary' },
    muted: false,
    currentRates: { chatsPerMinute: 12 },
    session: { totalGifts: 3, totalFollows: 2, totalDiamonds: 9876 },
    activeViewers: 5,
    apiKey: 'private-canary'
  };
  plugin._getStatus = () => rawStatus;
  plugin.eventBus = {
    getRecentEvents: () => [
      { type: 'chat', ts: 100, uid: 'private-uid', nickname: 'Synthetic Viewer', payload: { comment: 'Hello from the fixture', private: 'canary' } },
      { type: 'gift', ts: 101, uid: 'private-uid', nickname: 'Synthetic Viewer', payload: { giftName: 'Synthetic Rose', private: 'canary' } }
    ]
  };
  plugin._registerRoutes();
  plugin._registerSocketEvents();

  attachPublicSocketPolicy({ io, logger: { warn: jest.fn() } });
  io.on('connection', socket => {
    socketStats.connections += 1;
    socket.on('disconnect', () => { socketStats.disconnects += 1; });
    for (const { event, callback } of socketHandlers) {
      socket.on(event, (...args) => {
          if (event === 'sidekick:public-status:request') socketStats.requests += 1;
        callback(socket, ...args);
      });
    }
  });

  const publicMiddleware = createPublicOverlayMiddleware({ logger: { warn: jest.fn() } });
  const routeCalls = [];
  const dispatch = async (method, pathname, query = {}, host = 'sidekick-pilot.trycloudflare.com') => {
    const req = {
      method,
      originalUrl: pathname,
      url: pathname,
      headers: { host },
      query,
      body: {}
    };
    const res = {
      statusCode: 200,
      body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      sendFile(filePath) { this.filePath = filePath; return this; }
    };
    const handler = routes.get(`${method.toUpperCase()} ${pathname}`);
    publicMiddleware(req, res, () => {
      routeCalls.push(`${method.toUpperCase()} ${pathname}`);
      if (!handler) return res.status(404).json({ error: 'Not found' });
      return handler(req, res);
    });
    return res;
  };

  return {
    io,
    plugin,
    routes,
    routeCalls,
    dispatch,
    setStatus(status) { rawStatus = status; },
    getSocketStats() { return { ...socketStats }; }
  };
}

function makeHud(fetchImpl, socket) {
  const htmlPath = path.join(__dirname, '..', 'overlay', 'sidekick-hud.html');
  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), {
    runScripts: 'outside-only',
    url: 'http://127.0.0.1/overlay/sidekick/hud?lang=en'
  });
  const { window } = dom;
  window.fetch = fetchImpl;
  window.io = () => socket;
  window.setInterval = () => 0;
  window.console.error = jest.fn();
  const script = [...window.document.querySelectorAll('script:not([src])')].at(-1).textContent;
  window.eval(`${script}\nwindow.__pilot = { fetchEvents: typeof fetchEvents === 'function' ? fetchEvents : null };`);
  return { dom, window };
}

describe('Sidekick public overlay pilot fixture', () => {
  test('keeps the anonymous public status empty while retaining the projected event feed', async () => {
    const fixture = createSidekickFixture();
    const privateStatus = {
      avatar: { isConnected: true, uri: 'private-avatar-canary' }, muted: false,
      currentRates: { chatsPerMinute: 42 }, session: { totalGifts: 9, totalFollows: 7, totalDiamonds: 12345 },
      activeViewers: 99, apiKey: 'private-status-canary'
    };
    fixture.setStatus(privateStatus);
    expect(projectAnonymousOverlayStatus(privateStatus)).toEqual({});
    const publicChat = projectPublicOverlayEvent({
      type: 'chat', ts: 123, uid: 'private-uid-canary', nickname: 'N'.repeat(100),
      payload: { comment: 'C'.repeat(45), raw: { apiKey: 'private-event-canary' } }
    });
    expect(publicChat).toEqual({
      type: 'chat', ts: 123, nickname: 'N'.repeat(80),
      payload: { comment: 'C'.repeat(30), commentTruncated: true }
    });
    const publicGift = projectPublicOverlayEvent({
      type: 'gift', ts: 124, uid: 'private-uid-canary', nickname: 'Gift Viewer',
      payload: { giftName: 'G'.repeat(100), giftId: 'private-gift-canary', raw: { apiKey: 'private-event-canary' } }
    });
    expect(publicGift).toEqual({
      type: 'gift', ts: 124, nickname: 'Gift Viewer', payload: { giftName: 'G'.repeat(80) }
    });
    expect(projectPublicOverlayEvent({ type: 'follow', uid: 'private-uid-canary' })).toBeNull();
    expect(JSON.stringify([publicChat, publicGift])).not.toMatch(/private-uid-canary|private-event-canary|private-gift-canary|apiKey|giftId/i);
    const statusResponse = await fixture.dispatch('GET', '/api/sidekick/public-status', {}, '127.0.0.1:3000');
    expect(statusResponse.body).toEqual({ success: true, status: {} });
    const publicStatusResponse = await fixture.dispatch('GET', '/api/sidekick/public-status');
    expect(publicStatusResponse.statusCode).toBe(404);

    const transport = makeInProcessSocketTransport(fixture.io);
    await transport.flush();
    const fetches = [];
    const fetchImpl = async url => {
      fetches.push(String(url));
      const pathname = new URL(url, 'http://127.0.0.1').pathname;
      const query = Object.fromEntries(new URL(url, 'http://127.0.0.1').searchParams.entries());
      const response = await fixture.dispatch('GET', pathname, query);
      return { ok: response.statusCode < 400, status: response.statusCode, json: async () => response.body };
    };
    const hud = makeHud(fetchImpl, transport.socket);
    await transport.flush();

    const { document } = hud.window;
    expect(document.getElementById('status-dot')).toBeNull();
    expect(document.querySelector('.stats-grid')).toBeNull();
    expect(document.getElementById('availability-message').textContent).toBe('');
    expect(fetches).toEqual(['/api/sidekick/public-events?limit=5']);
    expect(transport.serverEvents.some(([eventName]) => eventName === 'sidekick:public-status')).toBe(false);
    expect(fixture.getSocketStats()).toEqual({ connections: 1, requests: 0, disconnects: 0 });

    const eventCards = [...document.querySelectorAll('#event-list .event-item')];
    expect(eventCards).toHaveLength(2);
    expect(eventCards.map(card => card.querySelector('.event-content').textContent.trim())).toEqual([
      'Synthetic Rose', 'Hello from the fixture'
    ]);
    const eventResponse = await fixture.dispatch('GET', '/api/sidekick/public-events', { limit: '9999' });
    expect(eventResponse.body.events).toHaveLength(2);
    expect(JSON.stringify([statusResponse.body, eventResponse.body])).not.toMatch(/private-status-canary|private-avatar-canary|private-uid|apiKey|totalDiamonds/i);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/sidekick/public-status' })).toBe(false);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/sidekick/public-events' })).toBe(true);

    hud.dom.window.close();
    transport.close();
    await transport.flush();
    expect(fixture.getSocketStats()).toEqual({ connections: 1, requests: 0, disconnects: 1 });
  });

  test('runs the real HUD, bounded HTTP routes and Socket.IO packets in-process only', async () => {
    const fixture = createSidekickFixture();
    const transport = makeInProcessSocketTransport(fixture.io);
    await transport.flush();
    const fetches = [];
    const fetchImpl = async url => {
      fetches.push(String(url));
      const pathname = new URL(url, 'http://127.0.0.1').pathname;
      const query = Object.fromEntries(new URL(url, 'http://127.0.0.1').searchParams.entries());
      const response = await fixture.dispatch('GET', pathname, query);
      return { ok: response.statusCode < 400, status: response.statusCode, json: async () => response.body };
    };
    const hud = makeHud(fetchImpl, transport.socket);

    await transport.flush();
    expect(hud.window.document.getElementById('status-dot')).toBeNull();
    expect(hud.window.document.querySelector('.stats-grid')).toBeNull();
    expect(hud.window.document.getElementById('availability-message').textContent).toBe('');
    expect(hud.window.document.querySelector('#event-list').textContent).toContain('Hello from the fixture');
    expect(hud.window.document.querySelector('#event-list').textContent).toContain('Synthetic Rose');
    expect(fetches).toEqual(['/api/sidekick/public-events?limit=5']);
    expect(fixture.getSocketStats()).toEqual({ connections: 1, requests: 0, disconnects: 0 });
    expect(transport.serverEvents.some(([eventName]) => eventName === 'sidekick:public-status')).toBe(false);

    const statusResponse = await fixture.dispatch('GET', '/api/sidekick/public-status', {}, '127.0.0.1:3000');
    const eventResponse = await fixture.dispatch('GET', '/api/sidekick/public-events', { limit: '9999' });
    const entrypointResponse = await fixture.dispatch('GET', '/overlay/sidekick/hud');
    expect(statusResponse.body).toEqual({ success: true, status: {} });
    expect((await fixture.dispatch('GET', '/api/sidekick/public-status')).statusCode).toBe(404);
    expect(eventResponse.body.events).toHaveLength(2);
    expect(JSON.stringify(eventResponse.body)).not.toContain('private-uid');
    expect(entrypointResponse.filePath).toBe(path.join(__dirname, '..', 'overlay', 'sidekick-hud.html'));
    expect(isHttpAllowed({ method: 'GET', pathname: '/overlay/sidekick/hud' })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/sidekick/public-status' })).toBe(true);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/sidekick/public-status' })).toBe(false);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/sidekick/public-events' })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/sidekick/public-events?limit=10000' })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/sidekick/config' })).toBe(false);
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/sidekick/mute' })).toBe(false);

    const callsBeforeDeniedRequests = fixture.routeCalls.length;
    const deniedGet = await fixture.dispatch('GET', '/api/sidekick/config');
    const deniedPost = await fixture.dispatch('POST', '/api/sidekick/mute');
    expect(deniedGet.statusCode).toBe(404);
    expect(deniedPost.statusCode).toBe(404);
    expect(fixture.routeCalls).toHaveLength(callsBeforeDeniedRequests);

    const unknownSocketEventsBefore = transport.serverEvents.filter(([eventName]) => eventName === 'sidekick:status').length;
    transport.socket.emit('sidekick:get-status');
    await transport.flush();
    expect(transport.serverEvents.filter(([eventName]) => eventName === 'sidekick:status')).toHaveLength(unknownSocketEventsBefore);

    hud.dom.window.close();
    transport.close();
  });
});
