'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { JSDOM } = require('jsdom');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const { Adapter } = require('socket.io-adapter');
const request = require('supertest');
const PluginLoader = require('../modules/plugin-loader');
const ViewerXPPlugin = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl');
const {
  attachPublicSocketPolicy,
  createPublicOverlayMiddleware,
  isApprovedPublicIncomingPacket,
  isApprovedQuickTunnelRequest,
  protectPublicSocket
} = require('../modules/public-overlay-access');
const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');
const { createPublicOverlayAdapter } = require('../modules/public-overlay-socket-adapter');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');
const { isIncomingSocketEventAllowed, isOutgoingSocketEventAllowed } = require('../modules/public-overlay-registry');

const PUBLIC_HOST = 'quiet-river.trycloudflare.com';
const PLUGIN_ROOT = path.join(__dirname, '../plugins/milestone-leaderboard/vendor/viewer-leaderboard');
const XP_BAR_FILE = path.join(PLUGIN_ROOT, 'overlays/xp-bar.html');
const XP_I18N_FILE = path.join(PLUGIN_ROOT, 'viewer-xp-i18n.js');
const I18N_CLIENT_FILE = path.join(__dirname, '../public/js/i18n-client.js');
const AVATAR_URL = 'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp';
const PROFILE_CANARY = 'PRIVATE_ID_CANARY';
const SETTINGS_CANARY = 'PRIVATE_SETTINGS_CANARY';
const TOKEN_CANARY = 'PRIVATE_TOKEN_CANARY';

function waitFor(predicate, timeoutMs = 5000, label = 'Viewer-XP renderer state') {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - started >= timeoutMs) return reject(new Error(`Timed out waiting for ${label}`));
      setTimeout(check, 10);
    };
    check();
  });
}

function makeProfile(overrides = {}) {
  return {
    username: 'VisibleName',
    name_color: '#12abef',
    title: 'Community Supporter',
    level: 4,
    xp_progress: 40,
    xp_for_next_level: 100,
    xp_progress_percent: 40,
    profilePictureUrl: AVATAR_URL,
    user_id: PROFILE_CANARY,
    coin_balance: 12345,
    settings: { secret: SETTINGS_CANARY },
    apiKey: TOKEN_CANARY,
    ...overrides
  };
}

describe('Viewer-XP public renderer smoke', () => {
  test('in-memory PluginAPI registers and dispatches the two read-only readiness GET handlers', async () => {
    const app = express();
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const pluginLoader = {
      plugins: new Map(),
      pluginRouters: new Map(),
      attachSocketEventToConnectedClients: jest.fn(),
      registerPluginConnectionHandler: jest.fn(() => true),
      getPluginRouter(pluginId) {
        let router = this.pluginRouters.get(pluginId);
        if (!router) {
          router = express.Router();
          this.pluginRouters.set(pluginId, router);
        }
        return router;
      }
    };
    const pluginRouter = express.Router();
    pluginRouter.use((req, res, next) => {
      const routers = Array.from(pluginLoader.pluginRouters.values());
      let index = 0;
      const dispatch = error => error || index >= routers.length
        ? next(error)
        : routers[index++](req, res, dispatch);
      dispatch();
    });
    app.use(pluginRouter);

    const sourceDb = { db: {} };
    const configPathManager = { getUserConfigsDir: jest.fn(() => { throw new Error('persistent config path accessed'); }) };
    const api = new PluginLoader.PluginAPI(
      'viewer-leaderboard',
      PLUGIN_ROOT,
      app,
      null,
      sourceDb,
      logger,
      pluginLoader,
      configPathManager
    );
    api.registerSocket = jest.fn(() => true);
    api.registerTikTokEvent = jest.fn(() => true);
    api.registerFlowAction = jest.fn(() => true);
    api.registerIFTTTTrigger = jest.fn(() => true);
    api.registerIFTTTCondition = jest.fn(() => true);
    api.registerIFTTTAction = jest.fn(() => true);
    api.getDatabase = jest.fn(() => sourceDb);
    api.getSocketIO = jest.fn(() => null);
    api.getPluginDataDir = jest.fn(() => { throw new Error('plugin data path accessed'); });
    api.ensurePluginDataDir = jest.fn(() => { throw new Error('plugin data directory created'); });
    api.getConfig = jest.fn(() => null);
    api.setConfig = jest.fn(() => true);

    const plugin = Object.create(ViewerXPPlugin.prototype);
    const syntheticDb = {
      getOverallStats: jest.fn(() => ({ totalViewers: 3, totalXP: 17 })),
      getTopViewers: jest.fn(limit => [{ username: 'SyntheticViewer', level: 2, total_xp_earned: 17 }].slice(0, limit))
    };
    Object.assign(plugin, {
      api,
      db: syntheticDb,
      watchTimers: new Map(),
      eventThrottle: { lastLeaderboardEmit: 0, leaderboardThrottleMs: 2000, pendingEvents: [], eventBatchTimer: null, eventBatchMs: 500 },
      cooldowns: new Map(),
      rateLimitTracker: new Map(),
      globalXPTracker: new Map(),
      gifterSessionData: new Map()
    });
    plugin.registerRoutes();
    pluginLoader.plugins.set('viewer-leaderboard', { api, instance: plugin });

    const invokeWithoutListener = url => new Promise((resolve, reject) => {
      const req = {
        method: 'GET', url, path: url, originalUrl: url, query: {}, params: {}, headers: {},
        get: () => undefined, app, baseUrl: '', body: {}, protocol: 'http', hostname: 'localhost',
        ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' }, xhr: false
      };
      const res = {
        app, locals: {}, headersSent: false, statusCode: 200,
        setHeader: jest.fn(), getHeader: jest.fn(), removeHeader: jest.fn(),
        status(code) { this.statusCode = code; return this; },
        json(body) { resolve({ status: this.statusCode, body }); return this; },
        send(body) { resolve({ status: this.statusCode, body }); return this; },
        end(body) { resolve({ status: this.statusCode, body }); return this; },
        sendFile(file) { resolve({ status: this.statusCode, file }); return this; },
        set() { return this; }, type() { return this; }
      };
      app.handle(req, res, error => error ? reject(error) : resolve({ status: 404, body: 'not found' }));
    });

    const registeredReadinessRoutes = api.registeredRoutes.filter(({ path: routePath }) =>
      routePath === '/api/viewer-xp/stats' || routePath === '/api/viewer-xp/leaderboard'
    );
    expect(registeredReadinessRoutes).toHaveLength(2);
    expect(api.registrationFailures).toEqual([]);
    expect(configPathManager.getUserConfigsDir).not.toHaveBeenCalled();

    await expect(invokeWithoutListener('/api/viewer-xp/stats')).resolves.toEqual({
      status: 200, body: { totalViewers: 3, totalXP: 17 }
    });
    await expect(invokeWithoutListener('/api/viewer-xp/leaderboard')).resolves.toEqual({
      status: 200, body: [{ username: 'SyntheticViewer', level: 2, total_xp_earned: 17 }]
    });
    expect(syntheticDb.getOverallStats).toHaveBeenCalledTimes(1);
    expect(syntheticDb.getTopViewers).toHaveBeenCalledTimes(1);
    expect(api.getPluginDataDir).not.toHaveBeenCalled();
    expect(api.ensurePluginDataDir).not.toHaveBeenCalled();
    expect(api.setConfig).not.toHaveBeenCalled();
    expect(api.registrationFailures).toEqual([]);
  });

  test('only the existing Viewer-XP display events have bounded projections', () => {
    expect(isApprovedPublicIncomingPacket(['viewer-xp:public-profile:request', 'VisibleName'])).toBe(true);
    expect(isApprovedPublicIncomingPacket(['viewer-xp:public-leaderboard:request', { limit: '10', days: '7' }])).toBe(true);
    expect(isApprovedPublicIncomingPacket(['viewer-xp:public-leaderboard:request', {}])).toBe(true);
    for (const packet of [
      ['viewer-xp:public-leaderboard:request', { limit: 51 }],
      ['viewer-xp:public-leaderboard:request', { days: 366 }],
      ['viewer-xp:public-leaderboard:request', { limit: 10, apiKey: TOKEN_CANARY }],
      ['viewer-xp:get-profile', 'VisibleName'],
      ['viewer-xp:public-profile:request', { username: 'VisibleName' }]
    ]) expect(isApprovedPublicIncomingPacket(packet)).toBe(false);

    expect(isIncomingSocketEventAllowed('viewer-xp:public-profile:request')).toBe(true);
    expect(isIncomingSocketEventAllowed('viewer-xp:public-leaderboard:request')).toBe(true);
    for (const eventName of [
      'viewer-xp:public-profile', 'viewer-xp:public-update',
      'viewer-xp:public-level-up', 'viewer-xp:public-leaderboard'
    ]) expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
    for (const eventName of ['viewer-xp:profile', 'viewer-xp:update', 'viewer-xp:get-profile']) {
      expect(isOutgoingSocketEventAllowed(eventName)).toBe(false);
      expect(isIncomingSocketEventAllowed(eventName)).toBe(false);
    }

    expect(projectPublicOverlayPayload('viewer-xp:public-profile', makeProfile())).toEqual({
      username: 'VisibleName', name_color: '#12abef', title: 'Community Supporter', level: 4,
      xp_progress: 40, xp_for_next_level: 100, xp_progress_percent: 40, profilePictureUrl: AVATAR_URL
    });
    expect(projectPublicOverlayPayload('viewer-xp:public-level-up', {
      username: 'VisibleName', oldLevel: 4, newLevel: 5,
      rewards: { title: 'Supporter', name_color: '#abc', secret: PROFILE_CANARY },
      user_id: PROFILE_CANARY, announcement: SETTINGS_CANARY
    })).toEqual({ username: 'VisibleName', oldLevel: 4, newLevel: 5, rewards: { title: 'Supporter', name_color: '#abc' } });
    expect(projectPublicOverlayPayload('viewer-xp:public-leaderboard', [{
      username: 'VisibleName', name_color: '#abc', title: 'Supporter', level: 4,
      xp: 90, rank: 99, total_xp_earned: 9000, user_id: PROFILE_CANARY, apiKey: TOKEN_CANARY
    }])).toEqual([{
      username: 'VisibleName', name_color: '#abc', title: 'Supporter', level: 4, xp: 90, rank: 1
    }]);
  });

  test('public leaderboard request is exact, read-only and returns only projected display fields', () => {
    const releasePolicy = createPluginReleasePolicy();
    const releaseEventAllowed = createPublicReleaseEventGuard(releasePolicy);
    expect(releaseEventAllowed('incoming', 'viewer-xp:public-leaderboard:request')).toBe(true);
    expect(releaseEventAllowed('outgoing', 'viewer-xp:public-leaderboard')).toBe(true);
    expect(releaseEventAllowed('incoming', 'viewer-xp:delete-profile')).toBe(false);
    expect(releaseEventAllowed('outgoing', 'viewer-xp:leaderboard')).toBe(false);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/overlay/viewer-xp/leaderboard' })).toBe(true);
    expect(isApprovedQuickTunnelRequest({ method: 'POST', pathname: '/overlay/viewer-xp/leaderboard' })).toBe(false);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/viewer-xp/leaderboard' })).toBe(false);
    expect(isApprovedPublicIncomingPacket([
      'viewer-xp:public-leaderboard:request', { limit: 10, days: 7 }
    ])).toBe(true);

    const connectionHandlers = [];
    const dbRows = [{
      username: 'VisibleName', name_color: '#12abef', title: 'Supporter', level: 4,
      total_xp_earned: 900, xp_period: 90, user_id: PROFILE_CANARY,
      settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY, coin_balance: 500
    }];
    const plugin = Object.create(ViewerXPPlugin.prototype);
    plugin.api = {
      getSocketIO: () => ({ on: (eventName, handler) => {
        if (eventName === 'connection') connectionHandlers.push(handler);
      } }),
      registerSocket: jest.fn(),
      log: jest.fn()
    };
    plugin.db = { getTopViewers: jest.fn(() => dbRows) };
    plugin.registerWebSocketHandlers();

    const handlers = new Map();
    const emitted = [];
    const socket = {
      handshake: { headers: { host: PUBLIC_HOST } }, data: {},
      join: jest.fn(),
      use(handler) { this.packetGuard = handler; },
      on(eventName, handler) { handlers.set(eventName, handler); },
      emit(eventName, payload) { emitted.push([eventName, payload]); return true; }
    };
    protectPublicSocket({ socket, logger: { warn: jest.fn() }, pluginReleasePolicy: releasePolicy });
    connectionHandlers[0](socket);
    let requestAllowed = false;
    socket.packetGuard(['viewer-xp:public-leaderboard:request', { limit: 10, days: 7 }], error => {
      requestAllowed = !error;
    });
    expect(requestAllowed).toBe(true);
    handlers.get('viewer-xp:public-leaderboard:request')({ limit: 10, days: 7 });

    expect(plugin.db.getTopViewers).toHaveBeenCalledWith(10, 7);
    expect(emitted).toEqual([['viewer-xp:public-leaderboard', [{
      username: 'VisibleName', name_color: '#12abef', title: 'Supporter', level: 4,
      xp: 90, rank: 1, xp_period: 90
    }]]]);
    expect(JSON.stringify(emitted)).not.toMatch(/PRIVATE_CANARY|settings|apiKey|coin_balance|total_xp_earned/i);
  });

  test('actual XP bar page loads, renders projected events and refreshes after reconnect', async () => {
    const app = express();
    const logger = { warn: jest.fn(), error: jest.fn() };
    const privateHttpHandlers = { profile: jest.fn(), award: jest.fn() };
    app.use(createPublicOverlayMiddleware({ logger }));
    // Stand in for the real plugin routes behind the public middleware. If the
    // public path policy ever admits either raw profile reads or award writes,
    // these sentinels make the access test fail before any DTO assertions.
    app.get('/api/viewer-xp/profile/:username', (req, res) => {
      privateHttpHandlers.profile(req, res);
      res.json(makeProfile());
    });
    app.post('/api/viewer-xp/award', (req, res) => {
      privateHttpHandlers.award(req, res);
      res.json({ success: true });
    });
    app.get('/overlay/viewer-xp/xp-bar', (_req, res) => res.sendFile(XP_BAR_FILE));
    app.get('/plugins/viewer-leaderboard/viewer-xp-i18n.js', (_req, res) => res.sendFile(XP_I18N_FILE));
    app.get('/js/i18n-client.js', (_req, res) => res.sendFile(I18N_CLIENT_FILE));

    const server = http.createServer(app);
    const io = new Server(server, { serveClient: true, transports: ['websocket'] });
    io.adapter(createPublicOverlayAdapter(Adapter));
    attachPublicSocketPolicy({ io, logger });

    const serverSockets = [];
    let profileRequestCount = 0;
    io.on('connection', socket => {
      serverSockets.push(socket);
      socket.on('viewer-xp:public-profile:request', () => { profileRequestCount += 1; });
    });

    let currentProfile = makeProfile();
    const plugin = Object.create(ViewerXPPlugin.prototype);
    plugin.api = { getSocketIO: () => io, registerSocket: jest.fn(), log: jest.fn() };
    plugin.db = {
      getViewerProfile: jest.fn(() => currentProfile),
      getCoinBalance: () => ({ coins: 9000, total_coins_earned: 20000 }),
      getTopViewers: () => []
    };
    plugin.emitThrottledLeaderboardUpdate = jest.fn();
    plugin.emitIFTTTEvent = jest.fn();
    plugin.registerWebSocketHandlers();

    let dom;
    let client;
    const received = [];
    const rawEventNames = [
      'viewer-xp:update', 'viewer-xp:profile', 'viewerxp:event',
      'viewer-xp:leaderboard', 'viewer-xp:level-up'
    ];
    let connectCount = 0;
    let disconnectCount = 0;

    try {
      await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
      const port = server.address().port;
      const origin = `http://127.0.0.1:${port}`;

      const pageResponse = await request(server)
        .get('/overlay/viewer-xp/xp-bar?username=VisibleName&autoHide=false')
        .set('Host', PUBLIC_HOST)
        .expect(200);
      expect(pageResponse.text).toContain('viewer-xp:public-profile:request');
      await request(server).get('/plugins/viewer-leaderboard/viewer-xp-i18n.js').set('Host', PUBLIC_HOST).expect(200);
      await request(server).get('/js/i18n-client.js').set('Host', PUBLIC_HOST).expect(200);
      await request(server).get('/api/viewer-xp/profile/VisibleName').set('Host', PUBLIC_HOST).expect(404);
      await request(server).post('/api/viewer-xp/award').set('Host', PUBLIC_HOST).send({ username: 'VisibleName', amount: 100 }).expect(404);
      expect(privateHttpHandlers.profile).not.toHaveBeenCalled();
      expect(privateHttpHandlers.award).not.toHaveBeenCalled();

      dom = new JSDOM(pageResponse.text, {
        url: `${origin}/overlay/viewer-xp/xp-bar?username=VisibleName&autoHide=false`,
        runScripts: 'outside-only'
      });
      dom.window.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
      dom.window.io = () => {
        client = createClient(origin, {
          transports: ['websocket'],
          reconnection: false,
          extraHeaders: { Host: PUBLIC_HOST },
          timeout: 3000
        });
        client.on('connect', () => { connectCount += 1; });
        client.on('disconnect', () => { disconnectCount += 1; });
        for (const eventName of ['viewer-xp:public-profile', 'viewer-xp:public-update', 'viewer-xp:public-level-up', ...rawEventNames]) {
          client.on(eventName, payload => received.push({ eventName, payload }));
        }
        return client;
      };

      dom.window.eval(fs.readFileSync(XP_I18N_FILE, 'utf8'));
      for (const script of dom.window.document.querySelectorAll('script:not([src])')) {
        dom.window.eval(script.textContent);
      }

      await waitFor(() => connectCount === 1 && profileRequestCount === 1 && received.some(item => item.eventName === 'viewer-xp:public-profile'), 5000, 'initial public profile');
      const firstProfile = received.find(item => item.eventName === 'viewer-xp:public-profile').payload;
      expect(firstProfile).toEqual({
        username: 'VisibleName', name_color: '#12abef', title: 'Community Supporter', level: 4,
        xp_progress: 40, xp_for_next_level: 100, xp_progress_percent: 40, profilePictureUrl: AVATAR_URL
      });
      expect(dom.window.document.getElementById('username').textContent).toBe('VisibleName');
      expect(dom.window.document.getElementById('title').textContent).toBe('Community Supporter');
      expect(dom.window.document.getElementById('xpBar').style.width).toBe('40%');
      expect(dom.window.document.getElementById('xpText').textContent).toBe('40 / 100 XP');
      expect(dom.window.document.getElementById('profilePic').src).toBe(AVATAR_URL);

      const safeProfile = {
        username: 'VisibleName', name_color: '#12abef', title: '<img id="dom-canary">', level: 5,
        xp_progress: 55, xp_for_next_level: 100, xp_progress_percent: 55, profilePictureUrl: AVATAR_URL
      };
      serverSockets[0].emit('viewer-xp:public-profile', { ...safeProfile, user_id: PROFILE_CANARY, settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY });
      await waitFor(() => received.filter(item => item.eventName === 'viewer-xp:public-profile').length === 2, 5000, 'projected direct profile');
      expect(received.at(-1).payload).toEqual(safeProfile);
      expect(dom.window.document.querySelector('#dom-canary')).toBeNull();
      expect(dom.window.document.getElementById('title').textContent).toBe('<img id="dom-canary">');

      currentProfile = makeProfile({ level: 5, xp_progress: 67, xp_progress_percent: 67 });
      plugin.emitXPUpdate('VisibleName', 12, 'gift', { userId: PROFILE_CANARY, token: TOKEN_CANARY, settings: SETTINGS_CANARY });
      await waitFor(() => received.some(item => item.eventName === 'viewer-xp:public-update'), 5000, 'plugin XP update');
      const pluginUpdate = received.find(item => item.eventName === 'viewer-xp:public-update').payload;
      expect(pluginUpdate).toEqual({
        username: 'VisibleName', amount: 12,
        profile: {
          username: 'VisibleName', name_color: '#12abef', title: 'Community Supporter', level: 5,
          xp_progress: 67, xp_for_next_level: 100, xp_progress_percent: 67, profilePictureUrl: AVATAR_URL
        }
      });
      expect(dom.window.document.getElementById('xpBar').style.width).toBe('67%');
      expect(dom.window.document.getElementById('xpText').textContent).toBe('67 / 100 XP');

      io.emit('viewer-xp:public-update', {
        username: 'VisibleName', amount: 3,
        profile: { ...safeProfile, title: 'Projected title', user_id: PROFILE_CANARY, settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY }
      });
      await waitFor(() => received.filter(item => item.eventName === 'viewer-xp:public-update').length === 2, 5000, 'adapter-projected XP update');
      expect(received.at(-1).payload).toEqual({
        username: 'VisibleName', amount: 3,
        profile: { ...safeProfile, title: 'Projected title' }
      });
      expect(dom.window.document.getElementById('xpBar').style.width).toBe('55%');

      io.emit('viewer-xp:public-level-up', {
        username: 'VisibleName', oldLevel: 5, newLevel: 6,
        rewards: { title: 'Level Champion', name_color: '#fa0', private: PROFILE_CANARY },
        user_id: PROFILE_CANARY, settings: SETTINGS_CANARY, apiKey: TOKEN_CANARY
      });
      await waitFor(() => received.some(item => item.eventName === 'viewer-xp:public-level-up'), 5000, 'projected level-up event');
      expect(received.find(item => item.eventName === 'viewer-xp:public-level-up').payload).toEqual({
        username: 'VisibleName', oldLevel: 5, newLevel: 6,
        rewards: { title: 'Level Champion', name_color: '#fa0' }
      });
      expect(dom.window.document.querySelector('.level-up-animation')?.textContent).toContain('6');

      const profileCountBeforeReconnect = received.filter(item => item.eventName === 'viewer-xp:public-profile').length;
      const requestCountBeforeReconnect = profileRequestCount;
      currentProfile = makeProfile({ level: 6, xp_progress: 9, xp_progress_percent: 9 });
      client.disconnect();
      await waitFor(() => disconnectCount === 1, 5000, 'socket disconnect');
      client.connect();
      await waitFor(() => connectCount === 2 && profileRequestCount === requestCountBeforeReconnect + 1, 5000, 'profile request after reconnect');
      await waitFor(() => received.filter(item => item.eventName === 'viewer-xp:public-profile').length === profileCountBeforeReconnect + 1, 5000, 'refreshed profile after reconnect');
      expect(dom.window.document.getElementById('xpBar').style.width).toBe('9%');
      expect(dom.window.document.getElementById('levelBadge').textContent).toContain('6');

      const wireText = JSON.stringify(received);
      const domText = dom.window.document.documentElement.outerHTML;
      for (const secret of [PROFILE_CANARY, SETTINGS_CANARY, TOKEN_CANARY, 'coin_balance', 'total_coins_earned']) {
        expect(wireText).not.toContain(secret);
        expect(domText).not.toContain(secret);
      }
      expect(received.filter(item => rawEventNames.includes(item.eventName))).toEqual([]);
    } finally {
      if (dom) {
        dom.window.dispatchEvent(new dom.window.Event('pagehide'));
        dom.window.close();
      }
      if (client?.connected) client.disconnect();
      await new Promise(resolve => io.close(() => resolve()));
      if (server.listening) await new Promise(resolve => server.close(() => resolve()));
    }
  });
});
