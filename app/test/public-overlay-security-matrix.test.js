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
const { isApprovedQuickTunnelRequest } = require('../modules/public-overlay-access');

const appRoot = path.resolve(__dirname, '..');
const publicHost = 'quiet-river.trycloudflare.com';
const { VISUAL_FX_DEFAULT_CONFIG: visualFxFrameConfig } = require('../plugins/visual-fx-frame-webgpu/default-config');
const { VISUAL_FX_DEFAULT_CONFIG: flameOverlayVisualConfig } = require('../plugins/flame-overlay/default-config');
const claritySettingsSchema = require('../plugins/clarityhud/lib/settings-schema');

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
  ['/emoji-rain/overlay', 'plugins/emoji-rain/overlay.html'],
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
  ['/gcce/overlay', 'plugins/gcce/overlay.html'],
  ['/goals/overlay', 'plugins/goals/overlay/index.html'],
  ['/goals/multigoal-overlay', 'plugins/goals/overlay/multigoal.html'],
  ['/interactive-story/overlay', 'plugins/interactive-story/overlay.html'],
  ['/plugins/music-bot/overlay.html', 'plugins/music-bot/overlay.html'],
  ['/openshock/zappiehell/overlay', 'plugins/openshock/overlay/zappiehell-overlay.html'],
  ['/quiz-show/overlay', 'plugins/quiz-show/quiz_show_overlay.html'],
  ['/quiz-show/overlay/splitscreen', 'plugins/quiz-show/quiz_show_overlay.html'],
  ['/quiz-show/leaderboard-overlay', 'plugins/quiz-show/quiz_show_leaderboard_overlay.html'],
  ['/overlay/coincup', 'plugins/schnorrbecher/overlay/coincup.html'],
  ['/overlay/sidekick/hud', 'plugins/sidekick/overlay/sidekick-hud.html'],
  ['/overlay/viewer-xp/xp-bar', 'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html'],
  ['/overlay/viewer-xp/leaderboard', 'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html'],
  ['/overlay/viewer-xp/level-up', 'plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/level-up.html'],
  ['/overlay/sidekick/hud', 'plugins/sidekick/overlay/sidekick-hud.html'],
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
  ['/webgpu-emoji-rain/overlay', 'plugins/webgpu-emoji-rain/overlay.html'],
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
  ...['lifetime', 'season', 'weekly'].map(type => `/api/plugins/coinbattle/leaderboard/${type}`),
  '/api/plugins/coinbattle/overlay-layouts',
  '/api/plugins/coinbattle/overlay-layouts/layout-1',
  '/api/emoji-rain/config',
  '/api/emoji-rain/user-mappings',
  '/api/i18n/translations/de',
  '/api/i18n/locales',
  '/api/i18n/translations/de',
  '/api/webgpu-emoji-rain/overlay/state',
  '/api/flame-overlay/config',
  '/api/sidekick/public-status',
  '/api/sidekick/public-events',
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
  '/api/quiz-show/leaderboard?type=round',
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
    if (req.path === '/api/emoji-rain/overlay/state') {
      return res.json({
        success: true,
        state: { opacity: 1 }
      });
    }
    if (req.path === '/api/game-engine/arena/state') {
      return res.json({
        gameType: 'arena', reason: 'fixture', timestamp: 123,
        config: { arenaWidth: 1080, arenaHeight: 1000, apiKey: 'canary-arena-config', giftWeaponMappings: { 'gift-id': { weaponType: 'mine' } } },
        fever: { active: false, scheduleId: 'canary-arena-schedule' },
        players: [], food: [], weaponPickups: [], mines: [], bombs: [], leaderboard: [],
        localOnly: 'canary-arena-state', ...secretCanaries
      });
    }
    if (req.path === '/api/game-engine/config/chess') {
      return res.json({
        boardTheme: 'wood', backgroundColor: '#123456', whiteColor: '#abcdef', blackColor: '#fedcba',
        fontFamily: 'Verdana, sans-serif', showCoordinates: false, highlightLastMove: true,
        highlightCheck: false, showCapturedPieces: true, celebrationEnabled: true,
        timerWarningTime: 30, animationSpeed: 400,
        displayTexts: { titleText: 'Chess', labelWhite: 'White', privateText: 'canary-private' },
        streamerRole: 'black', autoplay: { enabled: true, eloOffset: 50, moveDelayMs: 750 }, ...secretCanaries
      });
    }
    if (req.path === '/api/game-engine/config/connect4') {
      return res.json({
        boardColor: '#123456', player1Color: '#abcdef', player2Color: '#fedcba', textColor: '#ffffff',
        fontFamily: 'Arial, sans-serif', showCoordinates: true, animationSpeed: 500,
        soundEnabled: true, soundVolume: 0.4, showWinStreaks: true, celebrationEnabled: false,
        leaderboardEnabled: true, leaderboardDisplayTime: 5, leaderboardTypes: ['daily', 'elo'], eloEnabled: true,
        displayTexts: { titleText: 'Connect4', labelPlayer1: 'P1', privateText: 'canary-private' },
        chatCommand: 'private-command', timeoutLockoutMinutes: 1440, streamerRole: 'player2', ...secretCanaries
      });
    }
    if (req.path === '/api/animazingpal/live-host/stream-assistant/status') {
      return res.json({
        success: true,
        config: { enabled: true, muted: false, overlayUrl: '/private/admin-url', ...secretCanaries },
        runtime: {
          animazeConnected: true,
          sourceStatus: { account: 'private', ...secretCanaries },
          diagnostics: {
            processedEvents: 12, respondedEvents: 5, dedupedEvents: 2,
            lastEventResult: { eventType: 'chat', reason: 'answered', decision: { prompt: 'private', ...secretCanaries }, ...secretCanaries },
            ...secretCanaries
          },
          ...secretCanaries
        },
        analytics: { processedEvents: 12, respondedEvents: 5, dedupedEvents: 2, skippedEvents: 7, sessionStartedAt: 'private', ...secretCanaries },
        events: [{ eventType: 'chat', reason: 'answered', checkedAt: 'private', decision: { prompt: 'private' }, ...secretCanaries }],
        ...secretCanaries
      });
    }
    if (req.path === '/api/emoji-rain/user-mappings') {
      return res.json({
        success: true,
        mappings: { 'fixture-viewer': '🌟', ...secretCanaries },
        stats: { totalMappings: 1, uniqueEmojis: 1, ...secretCanaries }
      });
    }
    if (req.path === '/api/gcce/hud/rotator') {
      return res.json({
        success: true,
        rotator: {
          enabled: true,
          intervalSeconds: 10,
          entries: [{
            id: 'gift-1', type: 'gift', giftId: 'rose-id', giftName: 'Rose', giftImage: '',
            title: 'Fixture Gifter', info: 'Thanks', template: 'card', animation: 'fade',
            fontFamily: 'Inter, sans-serif', textColor: '#ffffff', accentColor: '#ff5f9e',
            backgroundColor: 'rgba(0,0,0,0.65)', ...secretCanaries
          }],
          ...secretCanaries
        }
      });
    }
    if (req.path === '/api/interactive-story/config') {
      return res.json({
        llmProvider: 'openrouter', openaiModel: 'fixture-model',
        openRouterApiKey: '***configured***', ttsEngine: 'fishaudio',
        votingDuration: 60, debugLogging: true, storyLanguage: 'German',
        overlayOrientation: 'landscape', overlayResolution: '1920x1080', overlayDisplayMode: 'scroll',
        overlayFontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', overlayFontSize: 1.3,
        overlayTitleFontSize: 2.5, overlayTextColor: '#ffffff', overlayTitleColor: '#e94560',
        overlayBackgroundGradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.95) 100%)',
        generatingAnimationMode: 'custom', generatingAnimationUrl: 'https://tracking.invalid/custom.mp4',
        ...secretCanaries
      });
    }
    if (req.path === '/api/quiz-show/brand-kit') {
      return res.json({
        success: true,
        brandKit: { id: 1, logo_path: '/uploads/quiz-logo.png', primary_color: '#123456', secondary_color: '#abcdef', ...secretCanaries }
      });
    }
    if (req.path === '/api/quiz-show/hud-config') {
      return res.json({
        success: true,
        config: {
          theme: 'dark', themePreset: 'neon', reducedMotion: false, highContrast: false,
          questionAnimation: 'slide-in-bottom', correctAnimation: 'glow-pulse', wrongAnimation: 'shake',
          timerVariant: 'circular', answersLayout: 'grid', animationSpeed: 1, glowIntensity: 1,
          customCSS: '', streamWidth: 1920, streamHeight: 1080,
          positions: { question: { top: null, left: null, width: '100%', maxWidth: '1200px' } },
          colors: { primary: '#3b82f6', secondary: '#8b5cf6', success: '#10b981', danger: '#ef4444', warning: '#f59e0b' },
          fonts: { family: 'Inter, sans-serif', sizeQuestion: '2.2rem', sizeAnswer: '1.1rem' },
          avatarPerformance: { mode: 'balanced', cacheEnabled: true, maxVisible: 10 },
          ...secretCanaries
        }
      });
    }
    if (req.path === '/api/quiz-show/state') {
      return res.json({
        success: true,
        config: { customLayoutEnabled: true, activeLayoutId: 1, ...secretCanaries },
        questions: [{ id: 22, correct: 2, answers: ['A', 'B', 'C', 'D'] }],
        leaderboard: [{ userId: 'private-user-id', username: 'Fixture Viewer', points: 20 }],
        packages: [], hasOpenAIKey: true, stats: secretCanaries
      });
    }
    if (req.path === '/api/quiz-show/leaderboard') {
      return res.json({
        success: true,
        leaderboard: [{ userId: 'private-viewer-id', username: 'Fixture Viewer', points: 17, rank: 1, ...secretCanaries }],
        ...secretCanaries
      });
    }
    if (req.path === '/api/visual-fx-frame-webgpu/config') {
      return res.json({ success: true, config: { ...visualFxFrameConfig, ...secretCanaries } });
    }
    if (req.path === '/api/flame-overlay/config') {
      return res.json({
        success: true,
        config: {
          ...flameOverlayVisualConfig,
          triggerRules: [{ id: 'local-rule', event: 'gift', condition: 'any', action: 'flash', enabled: true }],
          triggersEnabled: true,
          triggerCooldown: 2000,
          triggerMaxStack: 5,
          triggerPreset: 'default',
          chatColorCommands: true,
          ...secretCanaries
        }
      });
    }
    const claritySettingsMatch = req.path.match(/^\/api\/clarityhud\/settings\/(chat|full|multi|stream)$/);
    if (claritySettingsMatch) {
      const dock = claritySettingsMatch[1];
      return res.json({ success: true, dock, settings: { ...claritySettingsSchema.getDefaults(dock), ...secretCanaries } });
    }
    const clarityStateMatch = req.path.match(/^\/api\/clarityhud\/state\/(chat|full)$/);
    if (clarityStateMatch) {
      const dock = clarityStateMatch[1];
      return res.json({
        success: true, dock, settings: claritySettingsSchema.getDefaults(dock),
        events: dock === 'chat' ? { chat: [] } : Object.fromEntries(['chat', 'follow', 'share', 'like', 'gift', 'subscribe', 'treasure', 'join'].map(type => [type, []])),
        ...secretCanaries
      });
    }
    const coinBattleLeaderboardMatch = req.path.match(/^\/api\/plugins\/coinbattle\/leaderboard\/(lifetime|season|weekly)$/);
    if (coinBattleLeaderboardMatch) {
      return res.json({
        success: true,
        data: [{
          id: 17, user_id: 'private-user-id', unique_id: 'fixture_viewer', nickname: 'Fixture Viewer',
          profile_picture_url: 'https://assets.invalid/avatar.png', total_coins: 321,
          total_gifts: 4, matches_played: 2, matches_won: 1, last_seen: 1791342000,
          ...secretCanaries
        }],
        season: { id: 9, name: 'Private Season Data', ...secretCanaries }
      });
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
    'preserves localhost access to %s and applies the approved Quick Tunnel surface',
    async entrypoint => {
      const local = await request(app)
        .get(entrypoint)
        .set('Host', '127.0.0.1:3000');
      expect(local.status).toBeGreaterThanOrEqual(200);
      expect(local.status).toBeLessThan(400);

      const publicResponse = await request(app).get(entrypoint).set('Host', publicHost);
      if (isApprovedQuickTunnelRequest({ method: 'GET', pathname: new URL(entrypoint, 'http://localhost').pathname })) {
        expect(publicResponse.status).toBeGreaterThanOrEqual(200);
        expect(publicResponse.status).toBeLessThan(400);
      } else {
        expect(publicResponse.status).toBe(404);
        expect(publicResponse.body).toEqual({ error: 'Not found' });
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
    '/api/clarityhud/multi/status',
    '/api/webgpu-emoji-rain/config',
    '/api/webgpu-emoji-rain/user-mappings',
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

  test('keeps ClarityHUD multi status available locally while denying it through Quick Tunnel', async () => {
    const publicResponse = await request(app)
      .get('/api/clarityhud/multi/status')
      .set('Host', publicHost);
    const localResponse = await request(app)
      .get('/api/clarityhud/multi/status')
      .set('Host', '127.0.0.1:3000');

    expect(publicResponse.status).toBe(404);
    expect(publicResponse.body).toEqual({ error: 'Not found' });
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual(rendererPayload());
  });

  test('serves the current EmojiRain overlay state through the public read allowlist', async () => {
    const response = await request(app)
      .get('/api/emoji-rain/overlay/state')
      .set('Host', publicHost);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
    const localResponse = await request(app)
      .get('/api/emoji-rain/overlay/state')
      .set('Host', '127.0.0.1:3000');
    expect(localResponse.status).toBe(200);
    expect(localResponse.body).toEqual({ success: true, state: { opacity: 1 } });
    const writeResponse = await request(app)
      .post('/api/emoji-rain/overlay/state')
      .set('Host', publicHost);
    expect(writeResponse.status).toBe(404);
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
    'applies the approved public API surface to %s and preserves localhost data',
    async pathname => {
      const publicResponse = await request(app)
        .get(pathname)
        .set('Host', publicHost);
      const localResponse = await request(app)
        .get(pathname)
        .set('Host', '127.0.0.1:3000');

      expect(localResponse.status).toBe(200);
      if (!isApprovedQuickTunnelRequest({ method: 'GET', pathname: new URL(pathname, 'http://localhost').pathname })) {
        expect(publicResponse.status).toBe(404);
        expect(publicResponse.body).toEqual({ error: 'Not found' });
        return;
      }
      expect(isHttpAllowed({ method: 'GET', pathname })).toBe(true);

      expect(publicResponse.status).toBe(200);
      if (pathname === '/api/visual-fx-frame-webgpu/config') {
        expect(publicResponse.body).toMatchObject({ success: true, config: { effectType: 'flames', designControls: visualFxFrameConfig.designControls } });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-/);
      } else if (pathname === '/api/flame-overlay/config') {
        expect(publicResponse.body).toEqual({ success: true, config: flameOverlayVisualConfig });
      } else if (pathname.startsWith('/api/clarityhud/settings/')) {
        const dock = pathname.split('/').pop();
        expect(publicResponse.body).toMatchObject({ success: true, dock, settings: claritySettingsSchema.getDefaults(dock) });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-/);
      } else if (pathname.startsWith('/api/clarityhud/state/')) {
        expect(publicResponse.body.success).toBe(true);
        expect(publicResponse.body.events).toBeDefined();
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-/);
      } else if (pathname.startsWith('/api/plugins/coinbattle/leaderboard/')) {
        expect(publicResponse.body).toEqual({
          success: true,
          data: [{ nickname: 'Fixture Viewer', unique_id: 'fixture_viewer', profile_picture_url: 'https://assets.invalid/avatar.png', total_coins: 321 }]
        });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/private-|canary-/);
      } else if (pathname === '/api/emoji-rain/user-mappings') {
        expect(publicResponse.body).toEqual({ success: true, mappings: {} });
      } else if (pathname === '/api/game-engine/arena/state') {
        expect(publicResponse.body).toEqual({
          gameType: 'arena', config: { giftWeaponMappings: {}, arenaWidth: 1080, arenaHeight: 1000 },
          fever: { active: false }, players: [], food: [], weaponPickups: [], mines: [], bombs: [], leaderboard: []
        });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-|gift-id|scheduleId|timestamp|reason/);
      } else if (pathname === '/api/game-engine/config/chess') {
        expect(publicResponse.body).toEqual({
          boardTheme: 'wood', backgroundColor: '#123456', whiteColor: '#ABCDEF', blackColor: '#FEDCBA',
          fontFamily: 'Verdana, sans-serif', showCoordinates: false, highlightLastMove: true,
          highlightCheck: false, showCapturedPieces: true, celebrationEnabled: true,
          timerWarningTime: 30, animationSpeed: 400,
          displayTexts: { titleText: 'Chess', labelWhite: 'White' }
        });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-|streamerRole|autoplay/);
      } else if (pathname === '/api/game-engine/config/connect4') {
        expect(publicResponse.body).toEqual({
          boardColor: '#123456', player1Color: '#ABCDEF', player2Color: '#FEDCBA', textColor: '#FFFFFF',
          fontFamily: 'Arial, sans-serif', showCoordinates: true, animationSpeed: 500,
          soundEnabled: true, soundVolume: 0.4, showWinStreaks: true, celebrationEnabled: false,
          leaderboardEnabled: true, leaderboardDisplayTime: 5, leaderboardTypes: ['daily', 'elo'], eloEnabled: true,
          displayTexts: { titleText: 'Connect4', labelPlayer1: 'P1' }
        });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-|private-command|timeoutLockoutMinutes|streamerRole/);
      } else if (pathname === '/api/gcce/hud/rotator') {
        expect(publicResponse.body).toEqual({
          success: true,
          rotator: {
            enabled: true, intervalSeconds: 10,
            entries: [{
              type: 'gift', template: 'card', animation: 'fade', fontFamily: 'Inter, sans-serif',
              textColor: '#ffffff', accentColor: '#ff5f9e', backgroundColor: 'rgba(0,0,0,0.65)',
              title: 'Fixture Gifter', info: 'Thanks', giftName: 'Rose', giftImage: ''
            }]
          }
        });
      } else if (pathname === '/api/quiz-show/brand-kit') {
        expect(publicResponse.body).toEqual({ success: true, brandKit: {
          logo_path: '/uploads/quiz-logo.png', primary_color: '#123456', secondary_color: '#abcdef'
        } });
      } else if (pathname === '/api/quiz-show/hud-config') {
        expect(publicResponse.body).toEqual({ success: true, config: {
          theme: 'dark', themePreset: 'neon', reducedMotion: false, highContrast: false,
          questionAnimation: 'slide-in-bottom', correctAnimation: 'glow-pulse', wrongAnimation: 'shake',
          timerVariant: 'circular', answersLayout: 'grid', animationSpeed: 1, glowIntensity: 1,
          customCSS: '', positions: { question: { top: null, left: null, width: '100%', maxWidth: '1200px' } },
          colors: { primary: '#3b82f6', secondary: '#8b5cf6', success: '#10b981', danger: '#ef4444', warning: '#f59e0b' },
          fonts: { family: 'Inter, sans-serif', sizeQuestion: '2.2rem', sizeAnswer: '1.1rem' },
          avatarPerformance: { mode: 'balanced', maxVisible: 10 }
        } });
      } else if (pathname === '/api/quiz-show/state') {
        expect(publicResponse.body).toEqual({ success: true, config: { customLayoutEnabled: true, activeLayoutId: 1 } });
      } else if (pathname === '/api/quiz-show/leaderboard?type=round') {
        expect(publicResponse.body).toEqual({ success: true, leaderboard: [{ username: 'Fixture Viewer', points: 17 }] });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/private-|canary-|rank/);
      } else if (pathname === '/api/interactive-story/config') {
        expect(publicResponse.body).toEqual({
          overlayOrientation: 'landscape', overlayResolution: '1920x1080', overlayDisplayMode: 'scroll',
          overlayFontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', overlayFontSize: 1.3,
          overlayTitleFontSize: 2.5, overlayTextColor: '#ffffff', overlayTitleColor: '#e94560',
          overlayBackgroundGradient: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.9) 30%, rgba(0,0,0,0.95) 100%)',
          generatingAnimationMode: 'default'
        });
      } else if (pathname === '/api/animazingpal/live-host/stream-assistant/status') {
        expect(publicResponse.body).toEqual({
          success: true,
          config: { enabled: true, muted: false },
          runtime: { diagnostics: { processedEvents: 12, respondedEvents: 5, dedupedEvents: 2, lastEventResult: { eventType: 'chat', reason: 'answered' } } },
          analytics: { processedEvents: 12, respondedEvents: 5, dedupedEvents: 2 },
          events: [{ eventType: 'chat', reason: 'answered' }]
        });
        expect(JSON.stringify(publicResponse.body)).not.toMatch(/canary-|private|prompt/);
      } else {
        expect(publicResponse.body).toEqual(expectedPublicPayload);
      }
      if (pathname === '/api/visual-fx-frame-webgpu/config') {
        expect(localResponse.body).toEqual({ success: true, config: { ...visualFxFrameConfig, ...secretCanaries } });
      } else if (pathname === '/api/flame-overlay/config') {
        expect(localResponse.body.config).toMatchObject({ ...flameOverlayVisualConfig, ...secretCanaries, triggerCooldown: 2000 });
        expect(localResponse.body.config.triggerRules[0].id).toBe('local-rule');
      } else if (pathname.startsWith('/api/clarityhud/settings/')) {
        const dock = pathname.split('/').pop();
        expect(localResponse.body).toEqual({ success: true, dock, settings: { ...claritySettingsSchema.getDefaults(dock), ...secretCanaries } });
      } else if (pathname.startsWith('/api/clarityhud/state/')) {
        expect(localResponse.body.success).toBe(true);
        expect(localResponse.body).toMatchObject(secretCanaries);
      } else if (pathname.startsWith('/api/plugins/coinbattle/leaderboard/')) {
        expect(localResponse.body.data[0]).toMatchObject({ id: 17, user_id: 'private-user-id', total_gifts: 4, last_seen: 1791342000 });
        expect(localResponse.body.season).toMatchObject({ id: 9, name: 'Private Season Data' });
      } else if (pathname === '/api/emoji-rain/user-mappings') {
        expect(localResponse.body).toMatchObject({
          success: true, mappings: { 'fixture-viewer': '🌟' }, stats: { totalMappings: 1, uniqueEmojis: 1 }
        });
      } else if (pathname === '/api/game-engine/arena/state') {
        expect(localResponse.body).toMatchObject({
          reason: 'fixture', timestamp: 123, config: { apiKey: 'canary-arena-config' },
          localOnly: 'canary-arena-state', secret: 'canary-secret'
        });
      } else if (pathname === '/api/game-engine/config/chess') {
        expect(localResponse.body).toMatchObject({ streamerRole: 'black', autoplay: { enabled: true }, ...secretCanaries });
      } else if (pathname === '/api/game-engine/config/connect4') {
        expect(localResponse.body).toMatchObject({ chatCommand: 'private-command', timeoutLockoutMinutes: 1440, streamerRole: 'player2', ...secretCanaries });
      } else if (pathname === '/api/gcce/hud/rotator') {
        expect(localResponse.body.rotator.entries[0]).toMatchObject({ id: 'gift-1', giftId: 'rose-id' });
      } else if (pathname === '/api/quiz-show/leaderboard?type=round') {
        expect(localResponse.body.leaderboard[0]).toMatchObject({ userId: 'private-viewer-id', rank: 1, ...secretCanaries });
      } else if (pathname.startsWith('/api/quiz-show/')) {
        expect(JSON.stringify(localResponse.body)).toContain('canary-');
      } else if (pathname === '/api/interactive-story/config') {
        expect(localResponse.body).toMatchObject({ llmProvider: 'openrouter', openaiModel: 'fixture-model', ttsEngine: 'fishaudio', generatingAnimationUrl: 'https://tracking.invalid/custom.mp4', ...secretCanaries });
      } else if (pathname === '/api/animazingpal/live-host/stream-assistant/status') {
        expect(localResponse.body.runtime.sourceStatus).toMatchObject({ account: 'private' });
        expect(localResponse.body.analytics).toMatchObject({ sessionStartedAt: 'private', skippedEvents: 7 });
        expect(JSON.stringify(localResponse.body)).toContain('canary-');
      } else {
        expect(localResponse.body).toEqual(rendererPayload());
      }
    }
  );

  test.each([
    '/api/quiz-show/leaderboard',
    '/api/quiz-show/leaderboard?type=season',
    '/api/quiz-show/leaderboard?type=round&type=round',
    '/api/quiz-show/leaderboard?type=round&extra=1',
    '/api/quiz-show/leaderboard?type=%72ound'
  ])('denies unsupported public Quiz Show leaderboard query %s', async pathname => {
    const response = await request(app).get(pathname).set('Host', publicHost);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
  });

  test('keeps the unapproved Quiz Show leaderboard route off Quick Tunnel for public HEAD', async () => {
    const valid = await request(app).head('/api/quiz-show/leaderboard?type=round').set('Host', publicHost);
    const invalid = await request(app).head('/api/quiz-show/leaderboard?type=season').set('Host', publicHost);
    expect(valid.status).toBe(404);
    expect(valid.text || '').toBe('');
    expect(invalid.status).toBe(404);
    expect(invalid.text || '').toBe('');
  });

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
