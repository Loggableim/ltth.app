const {
  createAdminSocketAuthorization
} = require('../modules/admin-socket-authorization');
const { protectPublicSocket } = require('../modules/public-overlay-access');

function createSocket({ address = '192.168.1.20', auth = {}, headers = {}, query = {} } = {}) {
  const packetMiddlewares = [];
  const handlers = new Map();
  const outbound = [];
  return {
    handshake: { address, auth, headers, query },
    data: {},
    packetMiddlewares,
    outbound,
    join: jest.fn(),
    use: middleware => packetMiddlewares.push(middleware),
    on: (event, handler) => handlers.set(event, handler),
    emit: (event, ...args) => outbound.push([event, ...args]),
    invoke: (event, ...args) => handlers.get(event)?.(...args)
  };
}

function runConnectionMiddleware(middleware, socket) {
  return new Promise((resolve, reject) => {
    middleware(socket, error => error ? reject(error) : resolve());
  });
}

async function connectThroughMiddleware(middleware, socket, connectionHandler) {
  await runConnectionMiddleware(middleware, socket);
  connectionHandler(socket);
}

function runPacket(socket, eventName, payload) {
  return new Promise(resolve => {
    const packet = [eventName, payload];
    let index = 0;
    const next = error => {
      if (error || index >= socket.packetMiddlewares.length) {
        if (!error) socket.invoke(eventName, payload);
        resolve(error || null);
        return;
      }
      socket.packetMiddlewares[index++](packet, next);
    };
    next();
  });
}

describe('central remote Socket.IO authorization', () => {
  const token = 'fixture-admin-token';
  const logger = { warn: jest.fn() };

  beforeEach(() => logger.warn.mockClear());

  test.each([
    ['TopTier config save', 'toptier:save-config'],
    ['Goals manual update', 'goals:manual-update'],
    ['Quiz start', 'quiz-show:start'],
    ['Music Bot volume', 'musicbot:dashboard-volume']
  ])('rejects %s remote sockets before connection for missing and invalid credentials', async (_label, eventName) => {
    for (const auth of [{ role: 'admin' }, { role: 'admin', adminToken: 'wrong-token' }]) {
      const socket = createSocket({ auth });
      const handler = jest.fn();
      const connection = jest.fn(client => {
        client.emit('init:state', { fixture: true });
        client.emit('tiktok:status', { fixture: true });
        client.emit('tiktok:stats', { fixture: true });
      });
      socket.on(eventName, handler);
      await expect(connectThroughMiddleware(
        createAdminSocketAuthorization({ token, logger }),
        socket,
        connection
      )).rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });

      expect(connection).not.toHaveBeenCalled();
      expect(socket.outbound).toEqual([]);
      expect(handler).not.toHaveBeenCalled();
    }
  });

  test.each([
    'toptier:save-config',
    'goals:manual-update',
    'quiz-show:start',
    'musicbot:dashboard-volume'
  ])('allows a remote admin with the shared token for %s', async eventName => {
    const socket = createSocket({ auth: { adminToken: token } });
    const handler = jest.fn();
    socket.on(eventName, handler);
    await runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket);

    const error = await runPacket(socket, eventName, { fixture: true });

    expect(error).toBeNull();
    expect(handler).toHaveBeenCalledWith({ fixture: true });
    expect(socket.data.ltthSocketAccess).toBe('admin');
  });

  test.each([
    ['custom auth header', { headers: { 'x-ltth-admin-token': token } }],
    ['Bearer header', { headers: { authorization: `Bearer ${token}` } }]
  ])('accepts the existing HTTP token format in the Socket.IO handshake via %s', async (_label, options) => {
    const socket = createSocket({ ...options, auth: {} });
    const handler = jest.fn();
    socket.on('quiz-show:start', handler);
    await runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket);

    const error = await runPacket(socket, 'quiz-show:start');

    expect(error).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('keeps loopback mutations working without a token', async () => {
    const socket = createSocket({ address: '::ffff:127.0.0.1' });
    const handler = jest.fn();
    socket.on('quiz-show:start', handler);
    await runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket);

    const error = await runPacket(socket, 'quiz-show:start');

    expect(error).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(socket.data.ltthSocketAccess).toBe('loopback-admin');
  });

  test('treats forwarded loopback as remote, matching HTTP AdminAuth', async () => {
    const socket = createSocket({
      address: '127.0.0.1',
      auth: { adminToken: '' },
      headers: { 'x-forwarded-for': '127.0.0.1' }
    });
    const handler = jest.fn();
    socket.on('quiz-show:start', handler);
    await expect(runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket))
      .rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  test('lets existing per-plugin guards trust the central AdminAuth decision', () => {
    const GameEngineSocketAuthorization = require('../plugins/game-engine/backend/socket-authorization');
    const MusicBotPlugin = require('../plugins/music-bot/main');
    const WebgpuWeatherControlPlugin = require('../plugins/webgpu-weather-control/main');
    const authorizedSocket = {
      handshake: { address: '192.168.1.20', auth: {} },
      data: { ltthSocketAccess: 'admin' }
    };

    const gameEngineAuthorization = new GameEngineSocketAuthorization(logger);
    const musicBot = Object.create(MusicBotPlugin.prototype);
    musicBot.api = { log: jest.fn() };
    const weatherControl = Object.create(WebgpuWeatherControlPlugin.prototype);

    expect(gameEngineAuthorization.isAdmin(authorizedSocket)).toBe(true);
    expect(musicBot._requireDashboardSocketAdmin(authorizedSocket, 'musicbot:dashboard-pause')).toBe(true);
    expect(weatherControl.isAuthorizedAdminSocket(authorizedSocket)).toBe(true);
  });

  test.each([
    'game-engine:request-state',
    'goals:subscribe',
    'musicbot:request-status',
    'leaderboard:request-update',
    'multicam:join',
    'multicam:leave'
  ])
    ('requires an authenticated namespace before remote read event %s', async eventName => {
      const socket = createSocket();
      const handler = jest.fn();
      socket.on(eventName, handler);
      await expect(connectThroughMiddleware(
        createAdminSocketAuthorization({ token, logger }),
        socket,
        jest.fn()
      )).rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });

      expect(handler).not.toHaveBeenCalled();
      expect(socket.outbound).toEqual([]);
    });

  test.each([
    'toptier:get-config',
    'tts:queue:status',
    'stt-ticker:get-transcript',
    'visual-fx-frame-webgpu:renderer-status',
    'goals:animation-end',
    'sidekick:get-metrics',
    'gcce:get_commands',
    'unregistered:mutation'
  ])('rejects remote namespace handshakes before non-public event %s', async eventName => {
    const socket = createSocket();
    const handler = jest.fn();
    socket.on(eventName, handler);
    await expect(connectThroughMiddleware(
      createAdminSocketAuthorization({ token, logger }),
      socket,
      jest.fn()
    )).rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });

    expect(handler).not.toHaveBeenCalled();
    expect(socket.outbound).toEqual([]);
  });

  test('does not accept a token from the URL query string', async () => {
    const socket = createSocket({
      auth: { role: 'admin' },
      query: { adminToken: token }
    });
    await expect(runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket))
      .rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });
  });

  test('denies remote admin mutation if the server has no AdminAuth token configured', async () => {
    const socket = createSocket({ auth: { adminToken: token } });
    const handler = jest.fn();
    socket.on('goals:manual-update', handler);
    await expect(runConnectionMiddleware(createAdminSocketAuthorization({ token: '', logger }), socket))
      .rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });
    expect(handler).not.toHaveBeenCalled();
  });

  test('re-evaluates credentials on every reconnect handshake', async () => {
    const connection = jest.fn(socket => {
      socket.emit('init:state', { ready: true });
      socket.emit('tiktok:status', { status: 'live' });
      socket.emit('tiktok:stats', { viewers: 12 });
    });
    const middleware = createAdminSocketAuthorization({ token, logger });
    const firstHandshake = createSocket({ auth: { adminToken: token } });
    await connectThroughMiddleware(middleware, firstHandshake, connection);

    const reconnectWithoutToken = createSocket({ auth: {} });
    await expect(connectThroughMiddleware(middleware, reconnectWithoutToken, connection))
      .rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });

    const reconnectWithToken = createSocket({ auth: { adminToken: token } });
    await connectThroughMiddleware(middleware, reconnectWithToken, connection);

    expect(connection).toHaveBeenCalledTimes(2);
    expect(reconnectWithoutToken.outbound).toEqual([]);
    expect(firstHandshake.outbound.map(([event]) => event)).toEqual([
      'init:state',
      'tiktok:status',
      'tiktok:stats'
    ]);
    expect(reconnectWithToken.outbound.map(([event]) => event)).toEqual([
      'init:state',
      'tiktok:status',
      'tiktok:stats'
    ]);
  });

  test('preserves the existing Quick-Tunnel packet policy', async () => {
    const socket = createSocket({
      address: '198.51.100.40',
      headers: { host: 'fixture.trycloudflare.com' }
    });
    const mutation = jest.fn();
    const publicRead = jest.fn();
    socket.on('quiz-show:start', mutation);
    socket.on('viewer-xp:public-profile:request', publicRead);

    protectPublicSocket({ socket, logger });
    await runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket);

    const denied = await runPacket(socket, 'quiz-show:start');
    const allowed = await runPacket(socket, 'viewer-xp:public-profile:request', 'fixture-viewer');

    expect(denied?.data?.code).toBe('PUBLIC_SOCKET_EVENT_NOT_ALLOWED');
    expect(mutation).not.toHaveBeenCalled();
    expect(allowed).toBeNull();
    expect(publicRead).toHaveBeenCalledWith('fixture-viewer');
    expect(socket.data.ltthSocketAccess).toBe('public-overlay');
  });

  test('keeps the exact Quick-Tunnel status projector ahead of remote socket denial', async () => {
    const socket = createSocket({
      address: '198.51.100.40',
      headers: { host: 'fixture.trycloudflare.com' }
    });
    const pluginReleasePolicy = {
      getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }),
      isClosedBetaId: () => false
    };
    protectPublicSocket({ socket, logger, pluginReleasePolicy });
    await runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket);
    socket.emit('musicbot:now-playing', {
      title: 'Fixture Track',
      id: 'private-track-id',
      playbackId: 'private-playback-id',
      url: 'https://private.invalid/stream',
      requesterAvatar: 'https://p16-sign.tiktokcdn.com/avatar.png'
    });

    expect(socket.outbound).toContainEqual(['musicbot:now-playing', {
      title: 'Fixture Track',
      requesterAvatar: 'https://p16-sign.tiktokcdn.com/avatar.png'
    }]);
    expect(JSON.stringify(socket.outbound)).not.toContain('private-track-id');
    expect(JSON.stringify(socket.outbound)).not.toContain('private-playback-id');
    expect(JSON.stringify(socket.outbound)).not.toContain('private.invalid/stream');
  });

  test('does not treat a hostname containing a trycloudflare suffix as the public projector path', async () => {
    const socket = createSocket({
      headers: { host: 'fixture.trycloudflare.com.attacker.invalid' }
    });
    protectPublicSocket({ socket, logger });

    await expect(runConnectionMiddleware(createAdminSocketAuthorization({ token, logger }), socket))
      .rejects.toMatchObject({ data: { code: 'SOCKET_ADMIN_AUTH_REQUIRED' } });
    expect(socket.data.publicQuickTunnel).toBe(false);
  });
});
