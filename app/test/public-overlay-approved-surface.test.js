'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { createPluginReleasePolicy } = require('../modules/plugin-release-policy');
const { createPublicReleaseEventGuard } = require('../modules/public-overlay-release-event-policy');
const { createPublicOverlayAdapter, PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');
const {
  createPublicOverlayMiddleware,
  isApprovedQuickTunnelRequest,
  protectPublicSocket
} = require('../modules/public-overlay-access');
const {
  isHttpAllowed,
  listPublicEntrypoints
} = require('../modules/public-overlay-registry');
const { projectPublicOverlayPayload } = require('../modules/public-overlay-payload-projection');

const PUBLIC_HOST = 'isolated-fixture.trycloudflare.com';

function createSocket(host = PUBLIC_HOST) {
  const socket = {
    handshake: { headers: { host } },
    data: {},
    join: jest.fn(),
    use: jest.fn(handler => { socket.incomingMiddleware = handler; }),
    emit: jest.fn(() => true)
  };
  return socket;
}

class RecordingAdapter {
  constructor() { this.calls = []; }
  broadcast(packet, options) { this.calls.push({ packet, options }); }
  broadcastWithAck(packet, options) { this.calls.push({ packet, options }); }
}

describe('public Quick-Tunnel consent boundary', () => {
  test('keeps Quick-Tunnel overlay entrypoints limited to the approved Viewer-XP and Sidekick routes', () => {
    const entrypoints = listPublicEntrypoints().map(pathname => (
      pathname === '/overlay/spotlight/:type'
        ? '/overlay/spotlight/gifter'
        : pathname
    ));
    const approved = entrypoints.filter(pathname => isApprovedQuickTunnelRequest({
      method: 'GET',
      pathname
    }));

    expect(approved.sort()).toEqual([
      '/overlay/sidekick/hud',
      '/overlay/viewer-xp/level-up',
      '/overlay/viewer-xp/leaderboard',
      '/overlay/viewer-xp/xp-bar'
    ].sort());
    expect(entrypoints.filter(pathname => !approved.includes(pathname))).toHaveLength(44);
  });

  test('keeps locale discovery as an exact read-only Quick-Tunnel dependency', () => {
    for (const method of ['GET', 'HEAD']) {
      expect(isApprovedQuickTunnelRequest({ method, pathname: '/api/i18n/locales' })).toBe(true);
      expect(isHttpAllowed({ method, pathname: '/api/i18n/locales' })).toBe(true);
    }
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/i18n/locales' })).toBe(false);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/i18n/locales/extra' })).toBe(false);
  });

  test('serves only the approved Viewer-XP and Sidekick display surfaces', async () => {
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/overlay/viewer-xp/xp-bar', (_req, res) => res.send('xp-bar fixture'));
    app.get('/overlay/viewer-xp/level-up', (_req, res) => res.send('level-up fixture'));
    app.get('/overlay/viewer-xp/leaderboard', (_req, res) => res.send('unapproved rank surface'));
    app.get('/overlay/sidekick/hud', (_req, res) => res.send('sidekick fixture'));
    app.get('/api/sidekick/public-events', (_req, res) => res.json({
      success: true,
      events: [{ type: 'chat', ts: 1, nickname: 'Fixture Viewer', payload: { comment: 'hello', commentTruncated: false } }]
    }));
    app.get('/api/sidekick/public-status', (_req, res) => res.json({
      success: true,
      status: { connected: true, muted: true, chatsPerMinute: 12, totalGifts: 3, totalFollows: 4, activeViewers: 5 }
    }));
    app.get('/api/sidekick/config', (_req, res) => res.json({ success: true, config: { apiKey: 'private-canary' } }));
    app.get('/api/weather/config', (_req, res) => res.json({ success: true, config: { token: 'private-canary' } }));
    app.get('/api/i18n/translations/en', (_req, res) => res.json({ overlayTitle: 'Viewer XP' }));
    app.get('/socket.io/socket.io.js', (_req, res) => res.type('application/javascript').send('window.io = function () {};'));

    const allowed = await request(app).get('/api/sidekick/public-events').set('Host', PUBLIC_HOST);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({
      success: true,
      events: [{ type: 'chat', ts: 1, nickname: 'Fixture Viewer', payload: { comment: 'hello', commentTruncated: false } }]
    });
    for (const route of [
      '/overlay/viewer-xp/xp-bar',
      '/overlay/viewer-xp/level-up',
      '/overlay/viewer-xp/leaderboard',
      '/overlay/sidekick/hud',
      '/api/i18n/translations/en',
      '/socket.io/socket.io.js'
    ]) {
      expect((await request(app).get(route).set('Host', PUBLIC_HOST)).status).toBe(200);
    }
    for (const route of [
      '/api/sidekick/public-status',
      '/api/sidekick/config',
      '/api/weather/config',
      '/api/unknown/config'
    ]) {
      const denied = await request(app).get(route).set('Host', PUBLIC_HOST);
      expect(denied.status).toBe(404);
      expect(JSON.stringify(denied.body)).not.toContain('private-canary');
    }

    const local = await request(app).get('/api/weather/config').set('Host', '127.0.0.1:3000');
    expect(local.status).toBe(200);
    expect(local.body.config.token).toBe('private-canary');
  });

  test('maps only the approved Viewer-XP socket request and display events', () => {
    const guard = createPublicReleaseEventGuard();
    for (const eventName of [
      'viewer-xp:public-profile:request',
      'viewer-xp:public-profile',
      'viewer-xp:public-update',
      'viewer-xp:public-level-up',
      'viewer-xp:public-leaderboard:request',
      'viewer-xp:public-leaderboard'
    ]) {
      const direction = eventName.endsWith(':request') ? 'incoming' : 'outgoing';
      expect(guard(direction, eventName)).toBe(true);
    }
    expect(guard('outgoing', 'toptier:update')).toBe(false);
    expect(guard('outgoing', 'musicbot:unknown')).toBe(false);
    expect(guard('other', 'viewer-xp:public-profile')).toBe(false);
  });

  test('quick-tunnel sockets deny unsafe input, Beta owners, raw events, and unapproved projections', () => {
    const socket = createSocket();
    const originalEmit = socket.emit;
    protectPublicSocket({ socket, logger: { warn: jest.fn() } });

    const allowedInput = jest.fn();
    socket.incomingMiddleware(['viewer-xp:public-profile:request', 'Fixture Viewer'], allowedInput);
    expect(allowedInput).toHaveBeenCalledWith();

    const allowedLeaderboardInput = jest.fn();
    socket.incomingMiddleware(['viewer-xp:public-leaderboard:request', { limit: 50, days: 7 }], allowedLeaderboardInput);
    expect(allowedLeaderboardInput).toHaveBeenCalledWith();

    for (const packet of [
      ['viewer-xp:public-profile:request', { userId: 'private-id' }],
      ['viewer-xp:public-profile:request', 'Fixture Viewer', 'extra'],
      ['viewer-xp:public-leaderboard:request', { limit: 51 }],
      ['sidekick:public-status:request'],
      ['weather:client-ready', { config: 'private-canary' }]
    ]) {
      const denied = jest.fn();
      socket.incomingMiddleware(packet, denied);
      expect(denied).toHaveBeenCalledWith(expect.any(Error));
    }

    const rawProfile = {
      username: 'Fixture Viewer', name_color: '#abc', title: 'Supporter', level: 4,
      xp_progress: 20, xp_for_next_level: 30, xp_progress_percent: 40,
      profilePictureUrl: null, user_id: 'private-id', coin_balance: 900, setting: 'private-canary'
    };
    expect(socket.emit('viewer-xp:public-profile', rawProfile)).toBe(true);
    expect(originalEmit).toHaveBeenCalledWith('viewer-xp:public-profile', {
      username: 'Fixture Viewer', name_color: '#abc', title: 'Supporter', level: 4,
      xp_progress: 20, xp_for_next_level: 30, xp_progress_percent: 40, profilePictureUrl: null
    });
    expect(socket.emit('viewer-xp:public-leaderboard', [{ username: 'Visible', xp: 20 }])).toBe(true);
    expect(socket.emit('toptier:update', { entries: [] })).toBe(false);
    expect(socket.emit('musicbot:now-playing', { title: 'private-canary' })).toBe(false);
    expect(socket.emit('sidekick:public-status', { muted: true, totalGifts: 8 })).toBe(false);
    expect(originalEmit).toHaveBeenCalledTimes(2);
    expect(originalEmit).toHaveBeenLastCalledWith('viewer-xp:public-leaderboard', [{
      username: 'Visible', name_color: null, title: '', level: 0, xp: 20, rank: 1
    }]);

    const localSocket = createSocket('127.0.0.1:3000');
    const localEmit = localSocket.emit;
    protectPublicSocket({ socket: localSocket });
    const localPayload = { user_id: 'local-only', setting: 'unchanged' };
    localSocket.emit('sidekick:status', localPayload);
    expect(localEmit).toHaveBeenCalledWith('sidekick:status', localPayload);
  });

  test('adapter sends only the explicit projected Viewer-XP event to the public room', () => {
    const Adapter = createPublicOverlayAdapter(RecordingAdapter);
    const adapter = new Adapter();
    const privateProfile = {
      username: 'Fixture Viewer', name_color: '#abc', title: 'Supporter', level: 4,
      xp_progress: 20, xp_for_next_level: 30, xp_progress_percent: 40,
      profilePictureUrl: null, user_id: 'private-id', coin_balance: 900, setting: 'private-canary'
    };
    const options = { rooms: new Set(), except: new Set() };

    adapter.broadcast({ data: ['viewer-xp:public-profile', privateProfile] }, options);
    expect(adapter.calls).toHaveLength(2);
    expect(adapter.calls[0].packet.data[1]).toBe(privateProfile);
    expect(adapter.calls[0].options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(true);
    expect(adapter.calls[1].packet.data[1]).toEqual(projectPublicOverlayPayload('viewer-xp:public-profile', privateProfile));
    expect(JSON.stringify(adapter.calls[1].packet.data)).not.toContain('private-id');
    expect(JSON.stringify(adapter.calls[1].packet.data)).not.toContain('private-canary');
    expect(adapter.calls[1].options.rooms).toEqual(new Set([PUBLIC_QUICK_TUNNEL_ROOM]));

    adapter.broadcast({ data: ['viewer-xp:public-leaderboard', [{ username: 'Viewer', xp: 10, user_id: 'private-id' }]] }, options);
    adapter.broadcast({ data: ['toptier:update', { entries: [] }] }, options);
    adapter.broadcast({ data: ['musicbot:now-playing', { title: 'private-canary' }] }, options);
    expect(adapter.calls).toHaveLength(6);
    expect(adapter.calls[3].packet.data).toEqual(['viewer-xp:public-leaderboard', [{
      username: 'Viewer', name_color: null, title: '', level: 0, xp: 10, rank: 1
    }]]);
    expect(JSON.stringify(adapter.calls[3].packet.data)).not.toContain('private-id');
    expect(adapter.calls[3].options.rooms).toEqual(new Set([PUBLIC_QUICK_TUNNEL_ROOM]));
    for (const call of adapter.calls.slice(4)) {
      expect(call.options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(true);
    }
  });

  test('closed-Beta owner decisions stay dynamic for public sockets even in local distribution mode', () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-public-surface-policy-'));
    try {
      fs.mkdirSync(path.join(temp, 'config'));
      const configuredPolicy = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/plugin-release-policy.json'), 'utf8'));
      fs.writeFileSync(path.join(temp, 'config/plugin-release-policy.json'), JSON.stringify(configuredPolicy));
      fs.writeFileSync(path.join(temp, 'config/distribution-mode.json'), JSON.stringify({ channel: 'local' }));
      const policy = createPluginReleasePolicy({ appRoot: temp });
      const guard = createPublicReleaseEventGuard(policy);

      expect(policy.getSnapshot().publicMode).toBe(false);
      expect(guard('outgoing', 'musicbot:now-playing')).toBe(false);
      expect(guard('outgoing', 'viewer-xp:public-profile')).toBe(true);

      configuredPolicy.closedBeta = configuredPolicy.closedBeta.filter(id => id !== 'music-bot');
      fs.writeFileSync(path.join(temp, 'config/plugin-release-policy.json'), JSON.stringify(configuredPolicy));
      expect(guard('outgoing', 'musicbot:now-playing')).toBe(true);

      configuredPolicy.closedBeta = 'invalid';
      fs.writeFileSync(path.join(temp, 'config/plugin-release-policy.json'), JSON.stringify(configuredPolicy));
      expect(guard('outgoing', 'viewer-xp:public-profile')).toBe(false);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  });
});
