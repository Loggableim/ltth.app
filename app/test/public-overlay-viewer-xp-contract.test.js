'use strict';

const ViewerXPPlugin = require('../plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { io: createClient } = require('socket.io-client');
const request = require('supertest');
const { projectPublicOverlayEvent } = require('../plugins/sidekick/backend/public-status');
const {
  attachPublicSocketPolicy,
  createPublicOverlayMiddleware
} = require('../modules/public-overlay-access');
const {
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed
} = require('../modules/public-overlay-registry');

describe('Viewer XP public overlay contract', () => {
  test('serves projected HTTP and Socket.IO data on an isolated local server', async () => {
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/sidekick/public-status', (_req, res) => res.json({ success: true, status: {} }));
    const rawSidekickEvents = Array.from({ length: 12 }, (_, index) => index % 2 === 0
      ? {
        type: 'chat', ts: index, uid: `private-uid-${index}`, nickname: `Synthetic Viewer ${index} ${'N'.repeat(90)}`,
        payload: { comment: `Synthetic chat ${'C'.repeat(60)}`, apiKey: 'private-chat-key', raw: { totalDiamonds: 9000 } }
      }
      : {
        type: 'gift', ts: index, uid: `private-uid-${index}`, nickname: `Synthetic Viewer ${index}`,
        payload: { giftName: `Synthetic Rose ${'G'.repeat(90)}`, giftId: 'private-gift-id', raw: { token: 'private-gift-token' } }
      });
    app.get('/api/sidekick/public-events', (req, res) => {
      const parsedLimit = Number.parseInt(req.query.limit || '5', 10);
      const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(10, parsedLimit)) : 5;
      const events = rawSidekickEvents.slice(0, limit).map(projectPublicOverlayEvent).filter(Boolean);
      res.json({ success: true, events });
    });
    const server = http.createServer(app);
    const io = new Server(server, { serveClient: false });
    attachPublicSocketPolicy({ io, logger: { warn: jest.fn() } });

    const plugin = Object.create(ViewerXPPlugin.prototype);
    plugin.api = {
      getSocketIO: () => io,
      registerSocket: jest.fn(),
      log: jest.fn()
    };
    plugin.db = { getViewerProfile: () => ({ username: 'PublicName', level: 2, total_xp_earned: 50, user_id: 'secret' }) };
    plugin.registerWebSocketHandlers();

    let client;
    let secondClient;
    try {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      const localStatusResponse = await request(server)
        .get('/api/sidekick/public-status')
        .set('Host', '127.0.0.1:3000');
      const publicStatusRead = await request(server)
        .get('/api/sidekick/public-status')
        .set('Host', 'quiet-river.trycloudflare.com');
      const deniedWrite = await request(server)
        .post('/api/sidekick/public-status')
        .set('Host', 'quiet-river.trycloudflare.com');
      const deniedEventsWrite = await request(server)
        .post('/api/sidekick/public-events')
        .set('Host', 'quiet-river.trycloudflare.com');
      const publicEventsResponse = await request(server)
        .get('/api/sidekick/public-events?limit=5')
        .set('Host', 'quiet-river.trycloudflare.com');
      expect(localStatusResponse.status).toBe(200);
      expect(localStatusResponse.body).toEqual({ success: true, status: {} });
      expect(publicStatusRead.status).toBe(404);
      expect(deniedWrite.status).toBe(404);
      expect(deniedEventsWrite.status).toBe(404);
      expect(publicEventsResponse.status).toBe(200);
      expect(publicEventsResponse.body.events).toHaveLength(5);
      expect(publicEventsResponse.body.events.every(event => ['chat', 'gift'].includes(event.type))).toBe(true);
      for (const event of publicEventsResponse.body.events) {
        expect(Object.keys(event).sort()).toEqual(['nickname', 'payload', 'ts', 'type']);
        expect(event.nickname.length).toBeLessThanOrEqual(80);
        expect(Object.keys(event.payload).sort()).toEqual(event.type === 'chat'
          ? ['comment', 'commentTruncated']
          : ['giftName']);
        expect(event.type === 'chat' ? event.payload.comment.length : event.payload.giftName.length).toBeLessThanOrEqual(80);
        if (event.type === 'chat') expect(event.payload.comment.length).toBeLessThanOrEqual(30);
      }
      expect(JSON.stringify(publicEventsResponse.body)).not.toMatch(/private-uid|private-chat-key|private-gift-id|private-gift-token|totalDiamonds|apiKey|token/i);

      client = createClient(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
        extraHeaders: { Host: 'quiet-river.trycloudflare.com' },
        reconnection: false
      });
      secondClient = createClient(`http://127.0.0.1:${address.port}`, {
        transports: ['websocket'],
        extraHeaders: { Host: 'quiet-river.trycloudflare.com' },
        reconnection: false
      });
      const waitForConnect = socket => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('isolated socket connection timed out')), 3000);
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('connect_error', error => {
          clearTimeout(timer);
          reject(error);
        });
      });
      await Promise.all([waitForConnect(client), waitForConnect(secondClient)]);
      let secondClientReceivedPublicProfile = false;
      secondClient.on('viewer-xp:public-profile', () => { secondClientReceivedPublicProfile = true; });
      const response = new Promise(resolve => client.once('viewer-xp:public-profile', resolve));
      client.emit('viewer-xp:public-profile:request', 'PublicName');
      expect(await response).toEqual({
        username: 'PublicName', name_color: null, title: '', level: 2,
        xp_progress: 0, xp_for_next_level: 0,
        xp_progress_percent: 0, profilePictureUrl: null
      });
      await new Promise(resolve => setTimeout(resolve, 25));
      expect(secondClientReceivedPublicProfile).toBe(false);
    } finally {
      client?.close();
      secondClient?.close();
      await new Promise(resolve => io.close(resolve));
    }
  }, 10000);

  test('public Socket.IO requests return only rendered profile and leaderboard fields', () => {
    const ioHandlers = {};
    const registered = {};
    const plugin = Object.create(ViewerXPPlugin.prototype);
    plugin.api = {
      getSocketIO: () => ({ on: (event, handler) => { (ioHandlers[event] ||= []).push(handler); } }),
      registerSocket: (event, handler) => { registered[event] = handler; },
      log: jest.fn()
    };
    let profilePictureUrl = 'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp';
    plugin.db = {
      getViewerProfile: jest.fn(username => ({
        username, name_color: '#abc', title: 'Supporter', level: 8,
        total_xp_earned: 2400, xp_progress: 40, xp_for_next_level: 200,
        xp_progress_percent: 20, profilePictureUrl,
        user_id: 'private-id', coin_balance: 900, first_seen: 'secret', apiKey: 'canary'
      })),
      getTopViewers: jest.fn(() => [{
        username: 'Visible', name_color: '#abc', title: 'Supporter', level: 8,
        total_xp_earned: 2400, xp_period: 90, coin_balance: 900, user_id: 'private-id'
      }])
    };
    plugin.registerWebSocketHandlers();

    const listeners = {};
    const emitted = [];
    const socket = {
      on: (event, handler) => { listeners[event] = handler; },
      emit: (event, data) => emitted.push([event, data])
    };
    ioHandlers.connection[0](socket);
    listeners['viewer-xp:public-profile:request']('Visible');
    listeners['viewer-xp:public-leaderboard:request']({ limit: '50', days: '7' });

    expect(emitted).toEqual([
      ['viewer-xp:public-profile', {
        username: 'Visible', name_color: '#abc', title: 'Supporter', level: 8,
        xp_progress: 40, xp_for_next_level: 200, xp_progress_percent: 20,
        profilePictureUrl: 'https://p16-common-sign.tiktokcdn-eu.com/avatar.webp'
      }],
      ['viewer-xp:public-leaderboard', [{
        username: 'Visible', name_color: '#abc', title: 'Supporter', level: 8,
        xp: 90, rank: 1, xp_period: 90
      }]]
    ]);
    expect(isIncomingSocketEventAllowed('viewer-xp:public-profile:request')).toBe(true);
    expect(isIncomingSocketEventAllowed('viewer-xp:get-profile')).toBe(false);
    expect(isOutgoingSocketEventAllowed('viewer-xp:profile')).toBe(false);
    expect(isOutgoingSocketEventAllowed('viewer-xp:public-profile')).toBe(true);
    expect(plugin.db.getTopViewers).toHaveBeenCalledWith(50, 7);

    emitted.length = 0;
    listeners['viewer-xp:public-profile:request']('名字😊');
    expect(plugin.db.getViewerProfile).toHaveBeenLastCalledWith('名字😊');
    expect(emitted[0][1].username).toBe('名字😊');

    emitted.length = 0;
    for (const params of [
      { limit: '5garbage', days: 7 },
      { limit: 5.5, days: 7 },
      { limit: 5, days: '2x' }
    ]) {
      listeners['viewer-xp:public-leaderboard:request'](params);
      expect(emitted.at(-1)).toEqual(['viewer-xp:public-leaderboard', []]);
    }
    expect(plugin.db.getTopViewers).toHaveBeenCalledTimes(1);

    emitted.length = 0;
    profilePictureUrl = 'https://p16.tiktokcdn.com.attacker.invalid/avatar.webp';
    listeners['viewer-xp:public-profile:request']('Visible');
    expect(emitted[0][1].profilePictureUrl).toBeNull();
    emitted.length = 0;
    profilePictureUrl = 'https://user:password@p16.tiktokcdn.com/avatar.webp';
    listeners['viewer-xp:public-profile:request']('Visible');
    expect(emitted[0][1].profilePictureUrl).toBeNull();
  });

  test('public level-up projection keeps only bounded presentation values', () => {
    const plugin = Object.create(ViewerXPPlugin.prototype);
    const io = { emit: jest.fn() };
    plugin.api = { getSocketIO: () => io, log: jest.fn() };
    plugin.db = {
      getViewerProfile: () => ({ total_xp_earned: 300, coin_balance: 999 }),
      getSetting: () => false
    };
    plugin.emitIFTTTEvent = jest.fn();
    plugin.emitLevelUp('Name', 3, 4, {
      title: 'New title', name_color: '#123456', announcement_message: 'Welcome {username}',
      special_effects: { animation: 'gold', private: 'canary' }, coin_reward: 100
    });

    const publicEvent = io.emit.mock.calls.find(([name]) => name === 'viewer-xp:public-level-up');
    expect(publicEvent[1]).toEqual({
      username: 'Name', oldLevel: 3, newLevel: 4,
      rewards: {
        title: 'New title', name_color: '#123456'
      }
    });
    expect(JSON.stringify(publicEvent)).not.toContain('canary');
    expect(JSON.stringify(publicEvent)).not.toContain('coin_reward');
    expect(JSON.stringify(publicEvent)).not.toContain('Welcome');
    expect(JSON.stringify(publicEvent)).not.toContain('gold');
  });

  test('XP update public broadcast omits raw profile, coin balance and event metadata', () => {
    const plugin = Object.create(ViewerXPPlugin.prototype);
    const io = { emit: jest.fn(), to: jest.fn(() => ({ emit: jest.fn() })) };
    plugin.api = { getSocketIO: () => io, log: jest.fn() };
    plugin.db = {
      getViewerProfile: () => ({ username: 'Visible', level: 4, total_xp_earned: 120, coin_balance: 99, apiKey: 'canary' }),
      getCoinBalance: () => ({ coins: 99, total_coins_earned: 999 })
    };
    plugin.emitThrottledLeaderboardUpdate = jest.fn();
    plugin.emitIFTTTEvent = jest.fn();
    plugin.emitXPUpdate('Visible', 8, 'gift', { userId: 'private-id', token: 'canary' });

    const publicEvent = io.emit.mock.calls.find(([name]) => name === 'viewer-xp:public-update');
    expect(publicEvent[1]).toEqual({
      username: 'Visible', amount: 8,
      profile: {
        username: 'Visible', name_color: null, title: '', level: 4,
        xp_progress: 0, xp_for_next_level: 0, xp_progress_percent: 0,
        profilePictureUrl: null
      }
    });
    expect(JSON.stringify(publicEvent)).not.toContain('canary');
    expect(JSON.stringify(publicEvent)).not.toContain('coin_balance');
    expect(JSON.stringify(publicEvent)).not.toContain('private-id');
  });
});
