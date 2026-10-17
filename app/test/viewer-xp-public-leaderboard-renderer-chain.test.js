'use strict';

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { JSDOM } = require('jsdom');
jest.mock('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/backend/database', () => class ViewerXPDatabaseFixture {});
const ViewerXPPlugin = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl');
const {
  createPublicOverlayMiddleware,
  attachPublicSocketPolicy
} = require('../modules/public-overlay-access');

const APP_ROOT = path.join(__dirname, '..');
const LEADERBOARD_HTML = path.join(
  APP_ROOT,
  'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html'
);
const PUBLIC_HOST = 'viewer-xp-leaderboard-fixture.trycloudflare.com';
const PRIVATE_FIELDS = [
  'FIXTURE_PRIVATE_USER_ID',
  'FIXTURE_PRIVATE_SESSION_ID',
  'FIXTURE_PRIVATE_API_KEY',
  'FIXTURE_PRIVATE_RAW_PAYLOAD',
  'FIXTURE_PRIVATE_SETTINGS',
  'FIXTURE_PRIVATE_COIN_BALANCE',
  'user_id',
  'sessionId',
  'apiKey',
  'settings',
  'rawData',
  'coin_balance',
  'total_xp_earned'
];

function createPluginFixture(rows) {
  const routes = new Map();
  const connectionHandlers = [];
  const io = {
    use(middleware) { this.middleware = middleware; },
    on(eventName, handler) {
      if (eventName === 'connection') connectionHandlers.push(handler);
    }
  };
  attachPublicSocketPolicy({ io, logger: { warn: jest.fn() } });
  const api = {
    getSocketIO: () => io,
    registerRoute(method, route, handler) {
      routes.set(`${String(method).toUpperCase()} ${route}`, handler);
      return true;
    },
    registerSocket: jest.fn(),
    log: jest.fn()
  };
  const plugin = Object.create(ViewerXPPlugin.prototype);
  plugin.api = api;
  plugin.db = { getTopViewers: jest.fn((limit, days) => rows.slice(0, limit)) };

  plugin.registerRoutes();
  plugin.registerWebSocketHandlers();
  return { api, connectionHandlers, io, plugin, routes };
}

function createPublicSocketPair(io) {
  const clientEvents = new EventEmitter();
  const serverHandlers = new Map();
  const serverSocket = {
    handshake: { headers: { host: PUBLIC_HOST } },
    data: {},
    join: jest.fn(),
    use(middleware) { this.packetGuard = middleware; },
    on(eventName, handler) { serverHandlers.set(eventName, handler); },
    emit(eventName, ...args) {
      if (!client.connected) return false;
      clientEvents.emit(eventName, ...args);
      return true;
    }
  };
  const client = {
    connected: true,
    on(eventName, handler) { clientEvents.on(eventName, handler); },
    emit(eventName, ...args) {
      let denial = null;
      serverSocket.packetGuard([eventName, ...args], error => { denial = error || null; });
      if (denial) return false;
      const handler = serverHandlers.get(eventName);
      if (handler) handler(...args);
      return true;
    },
    disconnect() { client.connected = false; }
  };

  io.middleware(serverSocket, error => { if (error) throw error; });
  return { client, serverSocket };
}

function createRenderer(socket, url) {
  const source = fs.readFileSync(LEADERBOARD_HTML, 'utf8');
  const inlineScripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes));
  if (!inlineScripts.length) throw new Error('Viewer-XP leaderboard inline renderer was not found');

  const dom = new JSDOM(source, { url, runScripts: 'outside-only' });
  dom.window.io = () => socket;
  dom.window.ViewerXpI18n = {
    text: (_key, fallback, params = {}) => String(fallback).replace(/\{(\w+)\}/g, (_match, key) => params[key] ?? _match)
  };
  dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  dom.window.setInterval = jest.fn(() => 1);
  dom.window.clearInterval = jest.fn();
  dom.window.setTimeout = jest.fn(() => 1);
  dom.window.clearTimeout = jest.fn();
  for (const [, , contents] of inlineScripts) dom.window.eval(contents);
  return dom;
}

function createRouteResponse() {
  return {
    statusCode: 200,
    filePath: null,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendFile(filePath) { this.filePath = filePath; return this; }
  };
}

describe('Viewer-XP public leaderboard producer-to-renderer chain', () => {
  test('bounds the renderer request and projects synthetic database rows into the original leaderboard DOM', () => {
    const rawRows = [
      {
        username: 'Alpha Viewer', name_color: '#12abef', title: 'Top Supporter', level: 12,
        total_xp_earned: 9000, xp_period: 920, user_id: 'FIXTURE_PRIVATE_USER_ID',
        sessionId: 'FIXTURE_PRIVATE_SESSION_ID', apiKey: 'FIXTURE_PRIVATE_API_KEY',
        rawData: 'FIXTURE_PRIVATE_RAW_PAYLOAD', settings: 'FIXTURE_PRIVATE_SETTINGS',
        coin_balance: 'FIXTURE_PRIVATE_COIN_BALANCE', privateExtra: 'DROP_PRIVATE_EXTRA'
      },
      {
        username: 'Beta Viewer', name_color: '#aa33cc', title: 'Regular Supporter', level: 7,
        total_xp_earned: 4500, xp_period: 610, user_id: 'FIXTURE_PRIVATE_USER_ID_2',
        sessionId: 'FIXTURE_PRIVATE_SESSION_ID_2', apiKey: 'FIXTURE_PRIVATE_API_KEY_2',
        rawData: 'FIXTURE_PRIVATE_RAW_PAYLOAD_2', settings: 'FIXTURE_PRIVATE_SETTINGS_2',
        coin_balance: 'FIXTURE_PRIVATE_COIN_BALANCE_2', privateExtra: 'DROP_PRIVATE_EXTRA_2'
      },
      {
        username: 'Gamma Viewer', name_color: '#55aa22', title: 'New Supporter', level: 3,
        total_xp_earned: 1800, xp_period: 240, user_id: 'FIXTURE_PRIVATE_USER_ID_3',
        sessionId: 'FIXTURE_PRIVATE_SESSION_ID_3', apiKey: 'FIXTURE_PRIVATE_API_KEY_3',
        rawData: 'FIXTURE_PRIVATE_RAW_PAYLOAD_3', settings: 'FIXTURE_PRIVATE_SETTINGS_3',
        coin_balance: 'FIXTURE_PRIVATE_COIN_BALANCE_3', privateExtra: 'DROP_PRIVATE_EXTRA_3'
      }
    ];
    const fixture = createPluginFixture(rawRows);
    const route = fixture.routes.get('GET /overlay/viewer-xp/leaderboard');
    expect(route).toEqual(expect.any(Function));

    const middleware = createPublicOverlayMiddleware({ logger: { warn: jest.fn() } });
    const req = {
      method: 'GET',
      originalUrl: '/overlay/viewer-xp/leaderboard?limit=4&days=7',
      url: '/overlay/viewer-xp/leaderboard?limit=4&days=7',
      headers: { host: PUBLIC_HOST },
      query: { limit: '4', days: '7' }
    };
    const res = createRouteResponse();
    middleware(req, res, () => route(req, res));
    expect(res.statusCode).toBe(200);
    expect(res.filePath).toBe(LEADERBOARD_HTML);

    const publicConnection = createPublicSocketPair(fixture.io);
    fixture.connectionHandlers.forEach(handler => handler(publicConnection.serverSocket));
    const received = [];
    publicConnection.client.on('viewer-xp:public-leaderboard', payload => received.push(payload));
    const dom = createRenderer(
      publicConnection.client,
      'http://localhost/overlay/viewer-xp/leaderboard?limit=4&days=7'
    );
    try {
      expect(fixture.plugin.db.getTopViewers).toHaveBeenCalledTimes(1);
      expect(fixture.plugin.db.getTopViewers).toHaveBeenCalledWith(4, 7);
      expect(received).toEqual([[
        { username: 'Alpha Viewer', name_color: '#12abef', title: 'Top Supporter', level: 12, xp: 920, rank: 1, xp_period: 920 },
        { username: 'Beta Viewer', name_color: '#aa33cc', title: 'Regular Supporter', level: 7, xp: 610, rank: 2, xp_period: 610 },
        { username: 'Gamma Viewer', name_color: '#55aa22', title: 'New Supporter', level: 3, xp: 240, rank: 3, xp_period: 240 }
      ]]);

      const items = [...dom.window.document.querySelectorAll('#leaderboardList .leaderboard-item')];
      expect(items).toHaveLength(3);
      expect(items.map(item => item.querySelector('.viewer-name').textContent))
        .toEqual(['Alpha Viewer', 'Beta Viewer', 'Gamma Viewer']);
      expect(items.map(item => item.querySelector('.rank-icon').textContent)).toEqual(['🥇', '🥈', '🥉']);
      expect(items.map(item => item.querySelector('.level-badge').textContent))
        .toEqual(['Level 12', 'Level 7', 'Level 3']);
      expect(items.map(item => item.querySelector('.xp-amount').textContent))
        .toEqual(['920 XP', '610 XP', '240 XP']);
      expect(items.map(item => item.querySelector('.viewer-title').textContent))
        .toEqual(['Top Supporter', 'Regular Supporter', 'New Supporter']);
      expect(items[0].querySelector('.viewer-name').style.color).toBe('rgb(18, 171, 239)');
      expect(items[1].querySelector('.viewer-name').style.color).toBe('rgb(170, 51, 204)');

      const deliveredJson = JSON.stringify(received);
      const renderedHtml = dom.window.document.documentElement.outerHTML;
      for (const canary of PRIVATE_FIELDS) {
        expect(deliveredJson).not.toContain(canary);
        expect(renderedHtml).not.toContain(canary);
      }
      expect(deliveredJson).not.toContain('DROP_PRIVATE_EXTRA');
      expect(renderedHtml).not.toContain('DROP_PRIVATE_EXTRA');

      expect(publicConnection.client.emit('viewer-xp:public-leaderboard:request', {
        limit: 51, days: 7
      })).toBe(false);
      expect(publicConnection.client.emit('viewer-xp:public-leaderboard:request', {
        limit: 4, days: 7, user_id: 'FIXTURE_PRIVATE_USER_ID'
      })).toBe(false);
      expect(fixture.plugin.db.getTopViewers).toHaveBeenCalledTimes(1);
    } finally {
      dom.window.close();
    }
  });
});
