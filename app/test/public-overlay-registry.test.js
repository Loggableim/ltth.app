'use strict';

const {
  normalizePublicPath,
  isRegisteredEntrypoint,
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed,
  listPublicEntrypoints,
  redactPublicPayload
} = require('../modules/public-overlay-registry');

const expectedEntrypoints = [
  '/animation-overlay.html',
  '/advanced-timer/overlay',
  '/overlay/animazingpal/stream-assistant',
  '/overlay/clarity/chat',
  '/overlay/clarity/full',
  '/overlay/clarity/multi',
  '/overlay/clarity/stream',
  '/plugins/coinbattle/overlay',
  '/emoji-rain/obs-hud',
  '/fireworks/overlay',
  '/flame-overlay/overlay',
  '/overlay/game-engine/arena',
  '/overlay/game-engine/chess',
  '/overlay/game-engine/connect4',
  '/overlay/game-engine/hud',
  '/overlay/game-engine/plinko',
  '/overlay/game-engine/slot',
  '/overlay/game-engine/unified',
  '/overlay/game-engine/wheel',
  '/plugins/gcce/overlay-hud',
  '/goals/overlay',
  '/goals/multigoal-overlay',
  '/interactive-story/overlay',
  '/plugins/music-bot/overlay.html',
  '/openshock/zappiehell/overlay',
  '/quiz-show/overlay',
  '/quiz-show/overlay/splitscreen',
  '/quiz-show/leaderboard-overlay',
  '/overlay/coincup',
  '/overlay/spotlight/:type',
  '/stream-monsters/overlay',
  '/streammonsters/overlay',
  '/streamalchemy/overlay',
  '/overlay/stt-ticker',
  '/overlay/talking-heads',
  '/plugins/toptier/overlay.html',
  '/visual-fx-frame-webgpu/overlay',
  '/weather-control/overlay',
  '/webgpu-emoji-rain/obs-hud',
  '/webgpu-fireworks/overlay',
  '/webgpu-weather-control/overlay'
];

describe('public overlay path normalization', () => {
  test('returns one decoded canonical pathname without query parameters', () => {
    expect(normalizePublicPath('/goals/overlay?id=goal%201')).toBe('/goals/overlay');
    expect(normalizePublicPath('https://demo.trycloudflare.com/quiz-show/overlay'))
      .toBe('/quiz-show/overlay');
  });

  test.each([
    '/%2e%2e/dashboard.html',
    '/plugins%5cgame-engine%5cui.html',
    '/plugins/game-engine/%00overlay',
    '/plugins/game-engine/%2e%2e/ui.html',
    '/plugins/game-engine/overlay%2f..%2fui.html',
    '/plugins//coinbattle/overlay',
    '/plugins/game-engine/../ui.html'
  ])('rejects ambiguous or unsafe path %s', pathname => {
    expect(() => normalizePublicPath(pathname)).toThrow();
  });
});

describe('public overlay HTTP registry', () => {
  test('lists and allows every declared entrypoint with GET and HEAD', () => {
    expect(listPublicEntrypoints()).toEqual(expectedEntrypoints);
    for (const pathname of expectedEntrypoints) {
      if (pathname.includes(':type')) continue;
      expect(isRegisteredEntrypoint(pathname)).toBe(true);
      expect(isHttpAllowed({ method: 'GET', pathname })).toBe(true);
      expect(isHttpAllowed({ method: 'HEAD', pathname })).toBe(true);
    }
    expect(isRegisteredEntrypoint('/overlay/spotlight/gift')).toBe(true);
  });

  test.each([
    ['GET', '/socket.io/socket.io.js'],
    ['POST', '/socket.io/'],
    ['GET', '/js/i18n-client.js'],
    ['GET', '/js/public-overlay-render-mode.js'],
    ['GET', '/plugins/advanced-timer/overlay/overlay.js'],
    ['GET', '/api/advanced-timer/timers/timer-1'],
    ['GET', '/api/clarityhud/settings/chat'],
    ['GET', '/plugins/coinbattle/overlay/overlay.js'],
    ['GET', '/uploads/animations/animation-1.webm'],
    ['GET', '/plugins/schnorrbecher/overlay/coincup.js'],
    ['GET', '/api/interactive-story/image/chapter-1.png'],
    ['GET', '/api/quiz-show/layouts/7'],
    ['GET', '/api/lastevent/last/gift'],
    ['GET', '/api/streammonsters/state'],
    ['GET', '/api/streammonsters/avatar/cDE2LXNpZ24tdmEudGlrdG9rY2RuLmNvbS9hLndlYnA'],
    ['GET', '/api/stream-monsters/avatar/cDE2LXNpZ24tdmEudGlrdG9rY2RuLmNvbS9hLndlYnA'],
    ['GET', '/plugins/streamalchemy/streammonsters-egg-stage-view.js'],
    ['GET', '/plugins/streamalchemy/streammonsters-portrait-arena.js'],
    ['GET', '/plugins/stream-monsters/streammonsters-portrait-arena.js'],
    ['GET', '/plugins/streamalchemy/locales/de.json'],
    ['HEAD', '/plugins/streamalchemy/locales/en.json'],
    ['GET', '/plugins/streamalchemy/locales/es.json'],
    ['HEAD', '/plugins/streamalchemy/locales/fr.json'],
    ['GET', '/overlay/talking-heads/assets/overlay.css'],
    ['GET', '/overlay/talking-heads/assets/overlay.js'],
    ['GET', '/api/talkingheads/overlay/translations/de'],
    ['GET', '/api/talkingheads/sprite/Fox.png'],
    ['GET', '/api/talkingheads/manual-sprite/creator-set/Fox.png'],
    ['GET', '/plugins/toptier/assets/overlay.js'],
    ['GET', '/api/weather/config'],
    ['GET', '/api/webgpu-weather/overlay-config']
  ])('allows registered dependency %s %s', (method, pathname) => {
    expect(isHttpAllowed({ method, pathname })).toBe(true);
  });

  test.each([
    ['GET', '/'],
    ['GET', '/dashboard.html'],
    ['GET', '/api/network/config'],
    ['GET', '/api/i18n/translations/de'],
    ['GET', '/api/talkingheads/overlay/translations/it'],
    ['POST', '/api/talkingheads/overlay/translations/de'],
    ['POST', '/api/plugins/game-engine/reload'],
    ['GET', '/plugins/game-engine/ui.html'],
    ['GET', '/plugins/streamalchemy/locales/it.json'],
    ['GET', '/plugins/streamalchemy/locales/de.json/private'],
    ['POST', '/plugins/streamalchemy/locales/de.json'],
    ['GET', '/plugins/streamalchemy/streammonsters-egg-stage-view.js.map'],
    ['DELETE', '/api/game-engine/manual/end'],
    ['POST', '/api/game-engine/manual/start'],
    ['POST', '/api/game-engine/manual/move'],
    ['POST', '/api/game-engine/manual/end'],
    ['POST', '/api/game-engine/wheel/spin'],
    ['TRACE', '/animation-overlay.html'],
    ['POST', '/api/interactive-story/overlay-positions'],
    ['POST', '/api/quiz-show/hud-config']
  ])('denies unregistered request %s %s', (method, pathname) => {
    expect(isHttpAllowed({ method, pathname })).toBe(false);
  });
});

describe('public overlay Socket.IO registry', () => {
  test.each([
    'coinbattle:get-state',
    'fireworks:register-overlay',
    'game-engine:request-state',
    'goals:subscribe',
    'musicbot:request-status',
    'weather:client-ready',
    'webgpu-weather:overlay-state',
    'talkingheads:avatar:spin:complete'
  ])('allows required incoming event %s', eventName => {
    expect(isIncomingSocketEventAllowed(eventName)).toBe(true);
  });

  test.each([
    'admin:reload',
    'plugins:disable',
    'api:key:read',
    ''
  ])('denies unknown incoming event %s', eventName => {
    expect(isIncomingSocketEventAllowed(eventName)).toBe(false);
  });

  test.each([
    'soundboard:play',
    'advanced-timer:tick',
    'coinbattle:match-state',
    'game-engine:current-state',
    'story:chapter-display',
    'stt-ticker:transcript',
    'streammonsters:battle_choices_revealed',
    'streammonsters:monster_discovered',
    'streammonsters:config_updated',
    'streammonsters:tutorial_hint',
    'talkingheads:animation:start',
    'talkingheads:animation:frame',
    'talkingheads:animation:end',
    'talkingheads:animation:stop',
    'talkingheads:avatar:spawn',
    'talkingheads:avatar:spin:start',
    'weather:trigger'
  ])('allows required outgoing event %s', eventName => {
    expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
  });

  test('denies an unrelated outgoing dashboard event', () => {
    expect(isOutgoingSocketEventAllowed('admin:settings-updated')).toBe(false);
  });

  test.each([
    'tts:renderer:started',
    'tts:renderer:progress',
    'tts:renderer:ended',
    'tts:renderer:failed'
  ])('keeps renderer acknowledgements local-only: %s', eventName => {
    expect(isIncomingSocketEventAllowed(eventName)).toBe(false);
    expect(isOutgoingSocketEventAllowed(eventName)).toBe(false);
  });
});

describe('public JSON redaction', () => {
  test('removes credential-shaped keys recursively without mutating input', () => {
    const input = {
      enabled: true,
      sessionId: 'renderer-session',
      nested: {
        apiKey: 'secret-a',
        access_token: 'secret-b',
        ordinaryTokenCount: 3,
        rows: [{ password: 'secret-c', label: 'visible' }]
      }
    };

    expect(redactPublicPayload(input)).toEqual({
      enabled: true,
      sessionId: 'renderer-session',
      nested: {
        ordinaryTokenCount: 3,
        rows: [{ label: 'visible' }]
      }
    });
    expect(input.nested.apiKey).toBe('secret-a');
  });

  test('rejects cyclic and non-JSON payloads', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    expect(() => redactPublicPayload(cyclic)).toThrow();
    expect(() => redactPublicPayload(new Date())).toThrow();
  });
});
