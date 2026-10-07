'use strict';

const express = require('express');
const request = require('supertest');
const {
  normalizeHostname,
  isQuickTunnelHost,
  isQuickTunnelRequest,
  createPublicOverlayMiddleware,
  protectPublicSocket
} = require('../modules/public-overlay-access');
const ArenaGame = require('../plugins/game-engine/games/arena');

function createApp() {
  const app = express();
  app.use(createPublicOverlayMiddleware({
    logger: { warn: jest.fn() }
  }));
  app.use(express.json());
  app.get('/dashboard.html', (_req, res) => {
    res.type('html').send('<h1>Dashboard</h1>');
  });
  app.get('/api/weather/config', (_req, res) => {
    res.json({
      success: true,
      config: {
        enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4,
        apiKey: 'must-not-leak',
        effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20 } },
        gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true } }
      }
    });
  });
  app.get('/api/stable-overlay-routing/status', (_req, res) => {
    res.json({ connected: true, routeKey: 'must-stay-local' });
  });
  app.get('/api/stable-overlay-routing/account', (_req, res) => {
    res.json({ username: 'must-stay-local' });
  });
  app.get('/api/game-engine/arena/state', (_req, res) => {
    res.json({
      gameType: 'arena', reason: 'snapshot', timestamp: 123,
      config: { arenaWidth: 1080, apiKey: 'private-config' },
      fever: { active: false, endsAt: 456 }, players: [], food: [], weaponPickups: [],
      mines: [], bombs: [], leaderboard: [], localOnly: 'private-state'
    });
  });
  app.get('/api/game-engine/config/:gameType', (req, res) => {
    const config = req.params.gameType === 'chess'
      ? {
          boardTheme: 'wood', backgroundColor: '#123456', whiteColor: '#abcdef', blackColor: '#fedcba',
          fontFamily: 'Verdana, sans-serif', showCoordinates: false, highlightLastMove: true,
          highlightCheck: false, showCapturedPieces: true, timerWarningTime: 30, animationSpeed: 400,
          displayTexts: { titleText: 'Chess', privateText: 'drop' },
          streamerRole: 'black', autoplay: { enabled: true, moveDelayMs: 750 }, privateCanary: 'local-only'
        }
      : {
          boardColor: '#123456', player1Color: '#abcdef', player2Color: '#fedcba', textColor: '#ffffff',
          fontFamily: 'Arial, sans-serif', showCoordinates: true, soundEnabled: false, soundVolume: 0.5,
          leaderboardTypes: ['daily'], displayTexts: { titleText: 'Connect4' },
          chatCommand: 'local-command', timeoutLockoutMinutes: 1440, privateCanary: 'local-only'
        };
    res.json(config);
  });
  app.post('/api/game-engine/manual/move', (req, res) => {
    res.json({ accepted: true, move: req.body.move });
  });
  return app;
}

describe('public overlay hostname classification', () => {
  test.each([
    ['Quiet-River.trycloudflare.com', 'quiet-river.trycloudflare.com'],
    ['quiet-river.trycloudflare.com:443', 'quiet-river.trycloudflare.com']
  ])('normalizes %s', (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  test.each([
    'quiet-river.trycloudflare.com',
    'a.trycloudflare.com'
  ])('classifies valid Quick Tunnel host %s', hostname => {
    expect(isQuickTunnelHost(hostname)).toBe(true);
  });

  test.each([
    'trycloudflare.com',
    'quiet-river.trycloudflare.com.evil.example',
    'nested.quiet-river.trycloudflare.com',
    'overlay.ltth.app',
    'r-4m7k9p2x.ltth.app',
    'public.example.com',
    'localhost',
    ''
  ])('does not classify lookalike host %s', hostname => {
    expect(isQuickTunnelHost(hostname)).toBe(false);
  });

  test('classifies solely from the exact Host header', () => {
    expect(isQuickTunnelRequest({
      headers: {
        host: 'quiet-river.trycloudflare.com',
        'x-forwarded-host': 'overlay.ltth.app'
      }
    })).toBe(true);
    expect(isQuickTunnelRequest({
      headers: {
        host: 'overlay.ltth.app',
        'x-forwarded-host': 'quiet-river.trycloudflare.com'
      }
    })).toBe(false);
  });
});

describe('public overlay Express middleware', () => {
  test('leaves localhost routes unchanged', async () => {
    const response = await request(createApp())
      .get('/dashboard.html')
      .set('Host', '127.0.0.1:3000');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Dashboard');
  });

  test('allows a registered route and redacts credential-shaped JSON keys', async () => {
    const response = await request(createApp())
      .get('/api/weather/config')
      .set('Host', 'quiet-river.trycloudflare.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      config: { enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4, effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20 } }, gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true } } }
    });
  });

  test('projects the Arena state GET only on the public Quick Tunnel request', async () => {
    const publicResponse = await request(createApp())
      .get('/api/game-engine/arena/state')
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(createApp())
      .get('/api/game-engine/arena/state')
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).toEqual({
      gameType: 'arena', config: { arenaWidth: 1080, giftWeaponMappings: {} },
      fever: { active: false }, players: [], food: [], weaponPickups: [],
      mines: [], bombs: [], leaderboard: []
    });
    expect(JSON.stringify(publicResponse.body)).not.toMatch(/private-config|private-state|endsAt|timestamp|reason/);
    expect(localResponse.body.localOnly).toBe('private-state');
    expect(localResponse.body.config.apiKey).toBe('private-config');
    expect(localResponse.body.timestamp).toBe(123);
  });

  test.each(['chess', 'connect4'])('projects %s config GET fields for the public overlay and preserves local config', async gameType => {
    const app = createApp();
    const publicResponse = await request(app)
      .get(`/api/game-engine/config/${gameType}`)
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app)
      .get(`/api/game-engine/config/${gameType}`)
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body).not.toHaveProperty('privateCanary');
    expect(publicResponse.body).not.toHaveProperty('chatCommand');
    expect(publicResponse.body).not.toHaveProperty('timeoutLockoutMinutes');
    expect(publicResponse.body).not.toHaveProperty('autoplay');
    expect(publicResponse.body).not.toHaveProperty('streamerRole');
    expect(publicResponse.body.displayTexts).not.toHaveProperty('privateText');
    expect(publicResponse.body).toHaveProperty('displayTexts.titleText', gameType === 'chess' ? 'Chess' : 'Connect4');
    expect(localResponse.body).toHaveProperty('privateCanary', 'local-only');
    if (gameType === 'chess') {
      expect(localResponse.body).toHaveProperty('displayTexts.privateText', 'drop');
      expect(localResponse.body.autoplay).toEqual({ enabled: true, moveDelayMs: 750 });
    }
    if (gameType === 'connect4') expect(localResponse.body.chatCommand).toBe('local-command');
  });

  test('projects a GET response produced by ArenaGame.getState while keeping the local snapshot intact', async () => {
    const io = { emit: jest.fn() };
    const game = new ArenaGame(
      { getSocketIO: () => io },
      { getGameConfig: () => null, saveGameConfig: jest.fn() },
      { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
      { now: () => 1700000000000, random: () => 0.5 }
    );
    const actualProducerState = game.getState('api');
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/game-engine/arena/state', (_req, res) => res.json(actualProducerState));

    const publicResponse = await request(app)
      .get('/api/game-engine/arena/state')
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app)
      .get('/api/game-engine/arena/state')
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.gameType).toBe('arena');
    expect(publicResponse.body.config).toHaveProperty('giftWeaponMappings', {});
    expect(publicResponse.body).not.toHaveProperty('timestamp');
    expect(localResponse.body).toEqual(actualProducerState);
    expect(game.tickTimer).toBeNull();
  });

  test('withholds malformed Arena state from the public response while keeping the local response', async () => {
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/game-engine/arena/state', (_req, res) => res.json({
      gameType: 'arena', config: { arenaWidth: Infinity }, fever: { active: false },
      players: [], food: [], weaponPickups: [], mines: [], bombs: [], leaderboard: [], secret: 'local'
    }));

    const publicResponse = await request(app)
      .get('/api/game-engine/arena/state')
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app)
      .get('/api/game-engine/arena/state')
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(500);
    expect(publicResponse.body).toEqual({ error: 'Response unavailable' });
    expect(JSON.stringify(publicResponse.body)).not.toContain('local');
    expect(localResponse.body.secret).toBe('local');
  });

  test('denies game-control writes publicly while preserving the local route', async () => {
    const publicResponse = await request(createApp())
      .post('/api/game-engine/manual/move')
      .set('Host', 'quiet-river.trycloudflare.com')
      .send({ move: 'A1' });
    const localResponse = await request(createApp())
      .post('/api/game-engine/manual/move')
      .set('Host', '127.0.0.1:3000')
      .send({ move: 'A1' });

    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body).toEqual({ error: 'Not found' });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual({ accepted: true, move: 'A1' });
  });

  test.each([
    '/api/stable-overlay-routing/status',
    '/api/stable-overlay-routing/account'
  ])('keeps local stable-routing management path %s off the public surface', async pathname => {
    const publicResponse = await request(createApp())
      .get(pathname)
      .set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(createApp())
      .get(pathname)
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body).toEqual({ error: 'Not found' });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).not.toEqual({ error: 'Not found' });
  });

  test.each([
    '/dashboard.html',
    '/api/network/config',
    '/plugins/game-engine/ui.html',
    '/does-not-exist'
  ])('returns the same neutral 404 for denied public path %s', async pathname => {
    const response = await request(createApp())
      .get(pathname)
      .set('Host', 'quiet-river.trycloudflare.com');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test.each([
    'overlay.ltth.app',
    'r-4m7k9p2x.ltth.app',
    'public.example.com'
  ])('does not apply the local public-surface policy to non-Quick-Tunnel Host %s', async host => {
    const response = await request(createApp())
      .get('/dashboard.html')
      .set('Host', host)
      .set('X-Forwarded-Host', 'quiet-river.trycloudflare.com');

    expect(response.status).toBe(200);
    expect(response.text).toContain('Dashboard');
  });

  test('rejects method override headers on a public host', async () => {
    const response = await request(createApp())
      .get('/api/weather/config')
      .set('Host', 'quiet-river.trycloudflare.com')
      .set('X-HTTP-Method-Override', 'DELETE');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test('uses Host instead of X-Forwarded-Host for classification', async () => {
    const localResponse = await request(createApp())
      .get('/dashboard.html')
      .set('Host', '127.0.0.1:3000')
      .set('X-Forwarded-Host', 'quiet-river.trycloudflare.com');
    const publicResponse = await request(createApp())
      .get('/dashboard.html')
      .set('Host', 'quiet-river.trycloudflare.com')
      .set('X-Forwarded-Host', '127.0.0.1:3000');

    expect(localResponse.status).toBe(200);
    expect(publicResponse.status).toBe(404);
  });
});

describe('public overlay socket protection', () => {
  function createSocket(host, forwardedHost, origin) {
    const socket = {
      handshake: {
        headers: {
          host,
          ...(forwardedHost ? { 'x-forwarded-host': forwardedHost } : {}),
          ...(origin ? { origin } : {})
        }
      },
      data: {},
      join: jest.fn(),
      use: jest.fn(handler => {
        socket.incomingMiddleware = handler;
      }),
      emit: jest.fn(() => true)
    };
    return socket;
  }

  test('limits incoming and direct outgoing events for a public socket', () => {
    const logger = { warn: jest.fn() };
    const socket = createSocket(
      'quiet-river.trycloudflare.com',
      'overlay.ltth.app',
      'https://quiet-river.trycloudflare.com'
    );
    const originalEmit = socket.emit;

    protectPublicSocket({ socket, logger });

    expect(socket.data.publicQuickTunnel).toBe(true);
    expect(socket.join).toHaveBeenCalledWith('__ltth_public_quick_tunnel__');

    const registeredNext = jest.fn();
    socket.incomingMiddleware(['weather:client-ready', { renderer: 'overlay' }], registeredNext);
    expect(registeredNext).toHaveBeenCalledWith();

    const deniedNext = jest.fn();
    const secretPayload = { token: 'never log this' };
    socket.incomingMiddleware(['admin:reload', secretPayload], deniedNext);
    expect(deniedNext.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(logger.warn.mock.calls.flat().join(' ')).not.toContain('never log this');

    expect(socket.emit('weather:trigger', { action: 'rain', intensity: 1, duration: 1000, permanent: false, options: {} })).toBe(true);
    expect(socket.emit('admin:settings-updated', secretPayload)).toBe(false);
    expect(originalEmit).toHaveBeenCalledTimes(1);
    const warningText = logger.warn.mock.calls.flat().join(' ');
    expect(warningText).not.toContain('quiet-river.trycloudflare.com');
    expect(warningText).not.toContain(
      'https://quiet-river.trycloudflare.com'
    );
    expect(warningText).not.toContain('admin:reload');
    expect(warningText).not.toContain('admin:settings-updated');
  });

  test('projects only ZappieHell state fields for public sockets and leaves local emits untouched', () => {
    const publicSocket = createSocket('quiet-river.trycloudflare.com');
    const publicOriginalEmit = publicSocket.emit;
    const reconnectedPublicSocket = createSocket('quiet-river.trycloudflare.com');
    const reconnectedOriginalEmit = reconnectedPublicSocket.emit;
    const localSocket = createSocket('127.0.0.1:3000');
    const localOriginalEmit = localSocket.emit;
    const payload = {
      goals: [{
        id: 'internal-goal-id',
        name: 'Goal',
        targetCoins: 100,
        currentCoins: 20,
        type: 'stream',
        active: true,
        chainId: 'internal-chain-id',
        privateSetting: 'local-only'
      }]
    };

    protectPublicSocket({ socket: publicSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: reconnectedPublicSocket, logger: { warn: jest.fn() } });
    protectPublicSocket({ socket: localSocket, logger: { warn: jest.fn() } });

    publicSocket.emit('zappiehell:goals:state', payload);
    reconnectedPublicSocket.emit('zappiehell:goals:state', payload);
    localSocket.emit('zappiehell:goals:state', payload);

    expect(publicOriginalEmit).toHaveBeenCalledTimes(1);
    expect(reconnectedOriginalEmit).toHaveBeenCalledTimes(1);
    const publicPayload = publicOriginalEmit.mock.calls[0][1];
    expect(publicOriginalEmit.mock.calls[0][0]).toBe('zappiehell:goals:state');
    expect(publicPayload.goals[0]).toMatchObject({
      name: 'Goal', targetCoins: 100, currentCoins: 20, type: 'stream', active: true
    });
    expect(publicPayload.goals[0].displayToken).toMatch(/^[0-9a-f-]{36}$/i);
    expect(publicPayload.goals[0]).not.toHaveProperty('id');
    expect(JSON.stringify(publicPayload)).not.toContain('internal-goal-id');
    expect(reconnectedOriginalEmit.mock.calls[0][1].goals[0].displayToken)
      .toBe(publicPayload.goals[0].displayToken);
    expect(localOriginalEmit).toHaveBeenCalledWith('zappiehell:goals:state', payload);
  });

  test.each([
    '127.0.0.1:3000',
    'overlay.ltth.app',
    'r-4m7k9p2x.ltth.app',
    'public.example.com'
  ])('does not restrict non-Quick-Tunnel socket Host %s', host => {
    const socket = createSocket(host, 'quiet-river.trycloudflare.com');
    const originalEmit = socket.emit;

    protectPublicSocket({ socket, logger: { warn: jest.fn() } });

    expect(socket.data.publicQuickTunnel).toBe(false);
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.use).not.toHaveBeenCalled();
    expect(socket.emit).toBe(originalEmit);
  });
});

describe('public Weather HTTP response projection', () => {
  test('projects Weather config only for the public HTTP request context', async () => {
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/weather/config', (_req, res) => res.json({ success: true, config: {
      enabled: true, qualityPreset: 'high', adaptiveQuality: true, maxConcurrentEffects: 4,
      apiKey: 'secret', permissions: { admin: ['private'] }, presets: [{ id: 'private' }],
      effects: { rain: { enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20, category: 'private' } },
      gamification: { enabled: true, overlay: { enabled: true, showMeter: true, showQuest: true, showStreak: true, showRewardFeed: true }, state: { private: true } }
    } }));
    const publicResponse = await request(app).get('/api/weather/config').set('Host', 'quiet-river.trycloudflare.com');
    const localResponse = await request(app).get('/api/weather/config').set('Host', '127.0.0.1:3000');
    expect(publicResponse.body.config).not.toHaveProperty('apiKey');
    expect(publicResponse.body.config).not.toHaveProperty('permissions');
    expect(publicResponse.body.config.effects.rain).toEqual({ enabled: true, defaultIntensity: 0.5, defaultDuration: 10000, layer: 20 });
    expect(localResponse.body.config).toHaveProperty('apiKey', 'secret');
    expect(localResponse.body.config).toHaveProperty('permissions.admin');
  });

  test('projects public Weather gamification HTTP data and rejects malformed config', async () => {
    const app = express();
    app.use(createPublicOverlayMiddleware({ logger: { warn: jest.fn() } }));
    app.get('/api/weather/gamification', (_req, res) => res.json({ success: true, gamification: {
      enabled: true, communityMeter: { current: 3, max: 10, total: 100 }, streaks: { current: 2, best: 8 },
      quest: null, rewards: { nextThreshold: null, history: ['private'] }, timestamp: 1
    } }));
    app.get('/api/weather/config', (_req, res) => res.json({ success: true, config: { apiKey: 'must-not-leak' } }));
    const gamification = await request(app).get('/api/weather/gamification').set('Host', 'quiet-river.trycloudflare.com');
    const malformed = await request(app).get('/api/weather/config').set('Host', 'quiet-river.trycloudflare.com');
    expect(gamification.body).toEqual({ success: true, gamification: {
      enabled: true, communityMeter: { current: 3, max: 10 }, streaks: { current: 2 }, quest: null, rewards: { nextThreshold: null }
    } });
    expect(malformed.status).toBe(500);
    expect(JSON.stringify(malformed.body)).not.toContain('must-not-leak');
  });
});
