'use strict';

const {
  normalizePublicPath,
  isRegisteredEntrypoint,
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isLocalOnlyOutgoingSocketEvent,
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
  '/emoji-rain/overlay',
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
  '/gcce/overlay',
  '/goals/overlay',
  '/goals/multigoal-overlay',
  '/interactive-story/overlay',
  '/plugins/music-bot/overlay.html',
  '/openshock/zappiehell/overlay',
  '/quiz-show/overlay',
  '/quiz-show/overlay/splitscreen',
  '/quiz-show/leaderboard-overlay',
  '/overlay/coincup',
  '/overlay/sidekick/hud',
  '/overlay/spotlight/:type',
  '/overlay/viewer-xp/level-up',
  '/overlay/viewer-xp/leaderboard',
  '/overlay/viewer-xp/xp-bar',
  '/stream-monsters/overlay',
  '/streammonsters/overlay',
  '/streamalchemy/overlay',
  '/overlay/stt-ticker',
  '/overlay/talking-heads',
  '/plugins/toptier/overlay.html',
  '/visual-fx-frame-webgpu/overlay',
  '/weather-control/overlay',
  '/webgpu-emoji-rain/obs-hud',
  '/webgpu-emoji-rain/overlay',
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
    ['GET', '/api/i18n/translations/de'],
    ['GET', '/api/emoji-rain/overlay/state'],
    ['GET', '/api/webgpu-emoji-rain/overlay/state'],
    ['GET', '/plugins/visual-fx-frame-webgpu/renderer/overlay-controller.js'],
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

  test.each(['/api/webgpu-emoji-rain/config', '/api/webgpu-emoji-rain/user-mappings'])('keeps unprojected WebGPU initial data local-only: %s', pathname => {
    expect(isHttpAllowed({ method: 'GET', pathname })).toBe(false);
    expect(isHttpAllowed({ method: 'HEAD', pathname })).toBe(false);
  });

  test('keeps ClarityHUD multi-stream status local-only', () => {
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/clarityhud/multi/status' })).toBe(false);
    expect(isHttpAllowed({ method: 'HEAD', pathname: '/api/clarityhud/multi/status' })).toBe(false);
  });

  test('allows Quiz Show round leaderboard only with one exact round query on GET/HEAD', () => {
    for (const method of ['GET', 'HEAD']) {
      expect(isHttpAllowed({ method, pathname: '/api/quiz-show/leaderboard?type=round' })).toBe(true);
    }
    for (const method of ['GET', 'HEAD', 'POST']) {
      for (const pathname of [
        '/api/quiz-show/leaderboard',
        '/api/quiz-show/leaderboard?type=season',
        '/api/quiz-show/leaderboard?type=round&type=round',
        '/api/quiz-show/leaderboard?type=round&extra=1',
        '/api/quiz-show/leaderboard?type=%72ound',
        '/api/quiz-show/leaderboard?Type=round',
        '/api/quiz-show/leaderboard?type=round#fragment'
      ]) {
        expect(isHttpAllowed({ method, pathname })).toBe(false);
      }
    }
  });

  test('limits EmojiRain overlay state to public GET and HEAD reads', () => {
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/emoji-rain/overlay/state' })).toBe(true);
    expect(isHttpAllowed({ method: 'HEAD', pathname: '/api/emoji-rain/overlay/state' })).toBe(true);
    expect(isHttpAllowed({ method: 'POST', pathname: '/api/emoji-rain/overlay/state' })).toBe(false);
    expect(isHttpAllowed({ method: 'GET', pathname: '/api/emoji-rain/overlay/metrics' })).toBe(false);
  });

  test('allows the public EmojiRain opacity update event without opening incoming controls', () => {
    expect(isOutgoingSocketEventAllowed('emoji-rain:opacity')).toBe(true);
    expect(isIncomingSocketEventAllowed('emoji-rain:opacity')).toBe(false);
    expect(isOutgoingSocketEventAllowed('emoji-rain:admin-config')).toBe(false);
  });

  test.each([
    ['GET', '/'],
    ['GET', '/dashboard.html'],
    ['GET', '/api/network/config'],
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
    ['POST', '/api/quiz-show/hud-config'],
    ['GET', '/api/quiz-show/leaderboard'],
    ['HEAD', '/api/quiz-show/leaderboard']
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
    'sidekick:public-status:request',
    'viewer-xp:public-profile:request',
    'viewer-xp:public-leaderboard:request',
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
    'weather:trigger',
    'flame-overlay:config-update',
    'flame-overlay:trigger',
    'flame-overlay:clear-triggers',
    'emoji-rain:opacity',
    'webgpu-emoji-rain:spawn',
    'webgpu-emoji-rain:config-update',
    'sidekick:public-status',
    'viewer-xp:public-level-up',
    'viewer-xp:public-update',
    'viewer-xp:public-profile',
    'viewer-xp:public-leaderboard'
    ,'flame-overlay:trigger'
    ,'flame-overlay:config-update'
    ,'flame-overlay:clear-triggers'
    ,'webgpu-emoji-rain:spawn'
    ,'webgpu-emoji-rain:config-update'
  ])('allows required outgoing event %s', eventName => {
    expect(isOutgoingSocketEventAllowed(eventName)).toBe(true);
  });

  test('denies an unrelated outgoing dashboard event', () => {
    expect(isOutgoingSocketEventAllowed('admin:settings-updated')).toBe(false);
  });

  test('classifies D&D participant roster updates as local-only', () => {
    const eventName = 'story:dnd-participants-updated';

    expect(isLocalOnlyOutgoingSocketEvent(eventName)).toBe(true);
    expect(isOutgoingSocketEventAllowed(eventName)).toBe(false);
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
