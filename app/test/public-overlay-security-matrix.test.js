'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const {
  OUTGOING_SOCKET_EVENTS,
  isHttpAllowed,
  isOutgoingSocketEventAllowed,
  listPublicEntrypoints,
  redactPublicPayload
} = require('../modules/public-overlay-registry');
const {
  createPublicOverlayMiddleware
} = require('../modules/public-overlay-access');

const appRoot = path.resolve(__dirname, '..');
const publicHost = 'quiet-river.trycloudflare.com';

const entrypointFixtures = new Map([
  ['/animation-overlay.html', 'public/animation-overlay.html'],
  ['/advanced-timer/overlay', 'plugins/advanced-timer/overlay/index.html'],
  ['/overlay/animazingpal/stream-assistant', 'plugins/animazingpal/overlay/stream-assistant-hud.html'],
  ['/overlay/clarity/chat', 'plugins/clarityhud/overlays/chat.html'],
  ['/overlay/clarity/full', 'plugins/clarityhud/overlays/full.html'],
  ['/overlay/clarity/multi', 'plugins/clarityhud/overlays/multi.html'],
  ['/overlay/clarity/stream', 'plugins/clarityhud/overlays/stream.html'],
  ['/plugins/coinbattle/overlay', 'plugins/coinbattle/overlay/overlay.html'],
  ['/emoji-rain/obs-hud', 'plugins/emoji-rain/obs-hud.html'],
  ['/fireworks/overlay', 'plugins/fireworks/overlay.html'],
  ['/flame-overlay/overlay', 'plugins/flame-overlay/renderer/index.html'],
  ['/overlay/game-engine/arena', 'plugins/game-engine/overlay/arena.html'],
  ['/overlay/game-engine/chess', 'plugins/game-engine/overlay/chess.html'],
  ['/overlay/game-engine/connect4', 'plugins/game-engine/overlay/connect4.html'],
  ['/overlay/game-engine/hud', 'plugins/game-engine/overlay/game-hud.html'],
  ['/overlay/game-engine/plinko', 'plugins/game-engine/overlay/plinko.html'],
  ['/overlay/game-engine/slot', 'plugins/game-engine/overlay/slot.html'],
  ['/overlay/game-engine/unified', 'plugins/game-engine/overlay/unified.html'],
  ['/overlay/game-engine/wheel', 'plugins/game-engine/overlay/wheel.html'],
  ['/plugins/gcce/overlay-hud', 'plugins/gcce/overlay-hud.html'],
  ['/goals/overlay', 'plugins/goals/overlay/index.html'],
  ['/goals/multigoal-overlay', 'plugins/goals/overlay/multigoal.html'],
  ['/interactive-story/overlay', 'plugins/interactive-story/overlay.html'],
  ['/plugins/music-bot/overlay.html', 'plugins/music-bot/overlay.html'],
  ['/openshock/zappiehell/overlay', 'plugins/openshock/overlay/zappiehell-overlay.html'],
  ['/quiz-show/overlay', 'plugins/quiz-show/quiz_show_overlay.html'],
  ['/quiz-show/overlay/splitscreen', 'plugins/quiz-show/quiz_show_overlay.html'],
  ['/quiz-show/leaderboard-overlay', 'plugins/quiz-show/quiz_show_leaderboard_overlay.html'],
  ['/overlay/coincup', 'plugins/schnorrbecher/overlay/coincup.html'],
  ['/overlay/spotlight/gifter', 'plugins/spotlight/overlays/gifter.html'],
  ['/stream-monsters/overlay', 'plugins/stream-monsters/streammonsters-overlay.html'],
  ['/streammonsters/overlay', 'plugins/stream-monsters/streammonsters-overlay.html'],
  ['/streamalchemy/overlay', 'plugins/stream-monsters/streammonsters-overlay.html'],
  ['/overlay/stt-ticker', 'plugins/stt-ticker/overlay/ticker.html'],
  ['/overlay/talking-heads', 'plugins/talking-heads/overlay.html'],
  ['/plugins/toptier/overlay.html', 'plugins/toptier/overlay.html'],
  ['/visual-fx-frame-webgpu/overlay', 'plugins/visual-fx-frame-webgpu/renderer/index.html'],
  ['/weather-control/overlay', 'plugins/weather-control/overlay.html'],
  ['/webgpu-emoji-rain/obs-hud', 'plugins/webgpu-emoji-rain/obs-hud.html'],
  ['/webgpu-fireworks/overlay', 'plugins/webgpu-fireworks/overlay.html'],
  ['/webgpu-weather-control/overlay', 'plugins/webgpu-weather-control/overlay.html']
]);

const apiReadPaths = [
  '/api/advanced-timer/timers/timer-1',
  '/api/advanced-timer/timers/timer-1/rotator',
  '/api/advanced-timer/timers/timer-1/threshold-effects',
  '/api/animazingpal/live-host/stream-assistant/status',
  ...['chat', 'full', 'multi', 'stream'].map(type => `/api/clarityhud/settings/${type}`),
  '/api/clarityhud/state/chat',
  '/api/clarityhud/state/full',
  '/api/clarityhud/multi/status',
  ...['lifetime', 'season', 'weekly'].map(type => `/api/plugins/coinbattle/leaderboard/${type}`),
  '/api/plugins/coinbattle/overlay-layouts',
  '/api/plugins/coinbattle/overlay-layouts/layout-1',
  '/api/emoji-rain/config',
  '/api/emoji-rain/user-mappings',
  '/api/flame-overlay/config',
  '/api/game-engine/config/chess',
  '/api/game-engine/config/connect4',
  '/api/game-engine/media/connect4',
  '/api/game-engine/active-session',
  '/api/game-engine/leaderboards/current',
  ...['daily', 'season', 'lifetime'].flatMap(scope => (
    ['chess', 'connect4'].map(game => `/api/game-engine/${scope}-leaderboard/${game}`)
  )),
  '/api/game-engine/arena/state',
  '/api/game-engine/gift-catalog',
  '/api/gift-catalog',
  '/api/game-engine/slot/audio-settings',
  '/api/game-engine/wheel/audio-settings',
  '/api/game-engine/slot/audio/settings',
  '/api/game-engine/wheel/audio/settings',
  '/api/gcce/hud/rotator',
  '/api/interactive-story/config',
  '/api/interactive-story/overlay-positions',
  '/api/quiz-show/brand-kit',
  '/api/quiz-show/hud-config',
  '/api/quiz-show/state',
  '/api/quiz-show/leaderboard',
  '/api/quiz-show/layouts/layout-1',
  '/api/lastevent/settings/gift',
  '/api/lastevent/last/gift',
  '/api/lastevent/all',
  '/api/streammonsters/state',
  '/api/visual-fx-frame-webgpu/config',
  '/api/weather/config',
  '/api/weather/gamification',
  '/api/webgpu-weather/overlay-config'
];

const secretCanaries = {
  apiKey: 'canary-api-key',
  api_key: 'canary-api-key-snake',
  token: 'canary-token',
  accessToken: 'canary-access-token',
  auth_token: 'canary-auth-token',
  refreshToken: 'canary-refresh-token',
  secret: 'canary-secret',
  password: 'canary-password',
  credential: 'canary-credential',
  cookie: 'canary-cookie'
};

function rendererPayload() {
  return {
    rendererId: 'fixture-renderer',
    enabled: true,
    nested: {
      intensity: 0.75,
      ...secretCanaries
    },
    items: [
      {
        label: 'visible',
        secrets: { ...secretCanaries }
      }
    ],
    ...secretCanaries
  };
}

function createMatrixApp() {
  const app = express();
  app.use(createPublicOverlayMiddleware({
    logger: { warn: jest.fn() }
  }));
  app.use(express.json());
  app.use((req, res) => {
    const fixture = entrypointFixtures.get(req.path);
    if (fixture) {
      return res.type('html').send(
        fs.readFileSync(path.join(appRoot, fixture), 'utf8')
      );
    }
    if (req.path.startsWith('/api/')) {
      return res.json(rendererPayload());
    }
    return res.type('text').send('registered public asset');
  });
  return app;
}

function materializedEntrypoints() {
  return listPublicEntrypoints().map(entrypoint => (
    entrypoint === '/overlay/spotlight/:type'
      ? '/overlay/spotlight/gifter'
      : entrypoint
  ));
}

function collectHtmlSubresources(source, entrypoint) {
  const resources = new Set();
  const expression =
    /<(?:audio|iframe|img|link|script|source)\b[^>]*?\b(?:href|src)=["']([^"'#]+)["']/gi;
  for (const match of source.matchAll(expression)) {
    const raw = match[1].trim();
    if (!raw || /^(?:data|blob|javascript|mailto):/i.test(raw)) continue;
    const resolved = new URL(raw, `https://${publicHost}${entrypoint}`);
    if (resolved.hostname !== publicHost) continue;
    resources.add(`${resolved.pathname}${resolved.search}`);
  }
  return [...resources];
}

describe('public overlay HTTP security matrix', () => {
  const app = createMatrixApp();

  test('covers every registered entrypoint with a real shipped HTML fixture', () => {
    expect([...entrypointFixtures.keys()].sort()).toEqual(
      materializedEntrypoints().sort()
    );
    for (const fixture of entrypointFixtures.values()) {
      expect(fs.existsSync(path.join(appRoot, fixture))).toBe(true);
    }
  });

  test.each(materializedEntrypoints())(
    'serves %s and every literal local HTML subresource through a Quick Tunnel host',
    async entrypoint => {
      const response = await request(app)
        .get(entrypoint)
        .set('Host', publicHost);

      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(400);

      for (const resource of collectHtmlSubresources(response.text, entrypoint)) {
        const dependency = await request(app)
          .get(resource)
          .set('Host', publicHost);
        expect(`${entrypoint} -> ${resource}: ${dependency.status}`).toEqual(
          expect.stringMatching(/: (?:2|3)\d\d$/)
        );
      }
    }
  );

  test.each([
    '/',
    '/dashboard.html',
    '/settings',
    '/api/network/config',
    '/api/plugins',
    '/api/plugins/game-engine/reload',
    '/api/stable-overlay-routing/recover',
    '/api/stable-overlay-routing/probe',
    '/api/weather/private',
    '/_ltth/v1/account',
    '/_ltth/v1/recover',
    '/_ltth_probe',
    '/stable-overlay-recovery.html',
    '/js/stable-overlay-recovery.js',
    '/plugins/game-engine/ui.html',
    '/plugins/interactive-story/ui.html',
    '/plugins/weather-control/not-registered.js',
    '/plugin-store.json',
    '/logs',
    '/config',
    '/.git/config',
    '/..%2f..%2f'
  ])('returns a neutral 404 for denied path %s', async pathname => {
    const response = await request(app)
      .get(pathname)
      .set('Host', publicHost);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test.each(['get', 'post', 'put', 'patch', 'delete', 'options', 'trace'])(
    'denies %s against a representative private API path',
    async method => {
      const response = await request(app)[method]('/api/network/config')
        .set('Host', publicHost);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    }
  );

  test.each([
    ['get', '/api/stable-overlay-routing/status'],
    ['get', '/api/stable-overlay-routing/account'],
    ['post', '/api/stable-overlay-routing/devices/enroll'],
    ['post', '/api/stable-overlay-routing/claims'],
    ['post', '/api/stable-overlay-routing/claims/streamer/restore'],
    ['delete', '/api/stable-overlay-routing/claims/streamer'],
    ['delete', '/api/stable-overlay-routing/devices/device-1'],
    ['put', '/api/stable-overlay-routing/default-username']
  ])('keeps local stable-routing management operation %s %s off the Quick Tunnel surface',
    async (method, pathname) => {
      const response = await request(app)[method](pathname)
        .set('Host', publicHost);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Not found' });
    }
  );

  test.each([
    'X-HTTP-Method-Override',
    'X-Method-Override',
    'X-Original-Method'
  ])('denies allowed reads carrying public method override header %s', async header => {
    const response = await request(app)
      .get('/api/weather/config')
      .set('Host', publicHost)
      .set(header, 'DELETE');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test('keeps the exact Socket.IO transport exception narrow', async () => {
    expect(isHttpAllowed({ method: 'POST', pathname: '/socket.io/' })).toBe(true);
    expect(isHttpAllowed({ method: 'PUT', pathname: '/socket.io/' })).toBe(false);
    expect(isHttpAllowed({ method: 'POST', pathname: '/socket.io/admin' })).toBe(false);
  });

  test('keeps the exact Stream Monsters heartbeat exception narrow', () => {
    const heartbeat = '/api/streammonsters/overlay/heartbeat';

    expect(isHttpAllowed({ method: 'POST', pathname: heartbeat })).toBe(true);
    expect(isHttpAllowed({ method: 'GET', pathname: heartbeat })).toBe(false);
    expect(isHttpAllowed({ method: 'PUT', pathname: heartbeat })).toBe(false);
    expect(isHttpAllowed({ method: 'POST', pathname: `${heartbeat}/` })).toBe(false);
    expect(isHttpAllowed({ method: 'POST', pathname: `${heartbeat}-private` })).toBe(false);
    expect(isHttpAllowed({
      method: 'POST',
      pathname: '/api/streammonsters/private'
    })).toBe(false);
  });
});

describe('public overlay JSON privacy matrix', () => {
  const app = createMatrixApp();
  const expectedPublicPayload = {
    rendererId: 'fixture-renderer',
    enabled: true,
    nested: { intensity: 0.75 },
    items: [{ label: 'visible', secrets: {} }]
  };

  test.each(apiReadPaths)(
    'redacts credentials from %s while preserving renderer fields and localhost data',
    async pathname => {
      expect(isHttpAllowed({ method: 'GET', pathname })).toBe(true);

      const publicResponse = await request(app)
        .get(pathname)
        .set('Host', publicHost);
      const localResponse = await request(app)
        .get(pathname)
        .set('Host', '127.0.0.1:3000');

      expect(publicResponse.status).toBe(200);
      expect(publicResponse.body).toEqual(expectedPublicPayload);
      expect(localResponse.status).toBe(200);
      expect(localResponse.body).toEqual(rendererPayload());
    }
  );

  test('keeps representative payload contracts credential-free for every public socket event', () => {
    for (const eventName of OUTGOING_SOCKET_EVENTS) {
      const representativePayload = {
        eventName,
        rendererState: { visible: true, sequence: 1 }
      };
      expect(redactPublicPayload(representativePayload)).toEqual(
        representativePayload
      );
    }
  });

  test.each([
    'follower',
    'like',
    'chatter',
    'share',
    'gifter',
    'subscriber',
    'topgift',
    'giftstreak'
  ])('allows Spotlight update and settings events for %s', type => {
    expect(isOutgoingSocketEventAllowed(`lastevent.update.${type}`)).toBe(true);
    expect(isOutgoingSocketEventAllowed(`lastevent.settings.${type}`)).toBe(true);
  });

  test.each([
    'lastevent.settings.multihud',
    'lastevent.multihud.update',
    'lastevent.session.reset'
  ])('allows required Spotlight lifecycle event %s', eventName => {
    expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
  });
});
