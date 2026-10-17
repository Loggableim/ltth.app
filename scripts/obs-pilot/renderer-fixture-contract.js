'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FORBIDDEN_PATH = /(?:^|\/)(?:\.env(?:\.|$)|user_configs?|profiles?|logs?|archive|archives|database|databases|uploads?|cache|credentials?)(?:\/|$)|(?:^|\/)[^/]*\.(?:sqlite3?|db)(?:$|\/)/i;
const SOCKET_BUNDLE_ROLE = 'browser-socket-client-source';
const I18N_ROLE = 'shared-i18n-client';
const COMMON_CONTRACT = {
  transport: 'in-process-jsdom-interceptor',
  origin: 'http://127.0.0.1:3000 (synthetic JSDOM URL only; requests are intercepted in process)',
  externalNetwork: 'blocked',
  productProfileOrCredentialData: 'excluded'
};
const FIXTURES = new Map([
  ['advanced-timer-source-fixture-v1', {
    plugin: 'advanced-timer', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/advanced-timer/overlay/index.html', 'renderer-entry'],
      ['app/plugins/advanced-timer/overlay/overlay.js', 'renderer-script'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' },
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/plugins/advanced-timer/overlay/overlay.js?v=3', source: 'app/plugins/advanced-timer/overlay/overlay.js' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)',
      '/api/advanced-timer/timers/{fixture-timer-{locale}}',
      '/api/advanced-timer/timers/{fixture-timer-{locale}}/rotator',
      '/api/advanced-timer/timers/{fixture-timer-{locale}}/threshold-effects'
    ],
    socketEventsConsumed: [
      'advanced-timer:completed', 'advanced-timer:paused', 'advanced-timer:reset',
      'advanced-timer:rotator-snapshot', 'advanced-timer:started', 'advanced-timer:stopped',
      'advanced-timer:threshold-effect', 'advanced-timer:tick', 'advanced-timer:time-added', 'advanced-timer:time-removed'
    ],
    driverEvents: [{
      event: 'advanced-timer:tick', matchingId: 'fixture-timer-{locale}',
      payload: { currentValue: 89, state: 'running' },
      negativeCase: 'same event with nonmatching fixture id is ignored'
    }],
    pluginControlProducer: 'excluded; runner returns fixed synthetic GET responses and drives the renderer socket shim only',
    cleanup: 'dispatch pagehide, assert renderer disconnect and no recurring timers in scoped scenario, close JSDOM; localStorage exists only in ephemeral JSDOM instance'
  }],
  ['stt-ticker-source-fixture-v1', {
    plugin: 'stt-ticker', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/stt-ticker/overlay/ticker.html', 'renderer-entry-inline-css-js'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)'
    ],
    socketEventsConsumed: ['connect', 'disconnect', 'stt-ticker:clear', 'stt-ticker:interim', 'stt-ticker:transcript'],
    driverEvents: [
      { event: 'stt-ticker:interim', payload: { text: 'Synthetic caption fixture.', isFinal: false } },
      { event: 'stt-ticker:transcript', payload: { text: 'Synthetic caption fixture.' } },
      { event: 'stt-ticker:clear', payload: null }
    ],
    pluginControlProducer: 'excluded; speech recognition, audio capture, provider services and STT plugin runtime are not started or connected',
    cleanup: 'dispatch pagehide, assert socket shim disconnect and observer/timer cleanup, close JSDOM; parent theme and localStorage are isolated to the synthetic JSDOM instance'
  }],
  ['goals-source-fixture-v1', {
    plugin: 'goals', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/goals/overlay/index.html', 'renderer-entry'],
      ['app/plugins/goals/overlay/overlay.js', 'renderer-script'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' },
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/plugins/goals/overlay/overlay.js', source: 'app/plugins/goals/overlay/overlay.js' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)'
    ],
    socketEventsConsumed: [
      'connect', 'disconnect', 'goals:animation-end', 'goals:config-changed', 'goals:deleted',
      'goals:error', 'goals:reach-complete', 'goals:reached', 'goals:reset', 'goals:subscribe',
      'goals:subscribed', 'goals:value-changed', 'locale-changed'
    ],
    driverEvents: [
      { event: 'goals:subscribed', matchingId: 'fixture-goal-{locale}', payload: { currentValue: 25, targetValue: 100, goalType: 'coin' }, negativeCase: 'same event with nonmatching goalId is ignored' },
      { event: 'goals:value-changed', matchingId: 'fixture-goal-{locale}', payload: { currentValue: 40, targetValue: 100, goalType: 'coin' }, negativeCase: 'same event with nonmatching goalId is ignored' },
      { event: 'goals:error', matchingId: 'fixture-goal-{locale}', payload: { error: 'Synthetic service error' }, negativeCase: 'wrong goalId leaves the renderer unchanged' },
      { event: 'locale-changed', payload: { locale: 'fr' }, negativeCase: 'unsupported locales are rejected and do not change the renderer locale' }
    ],
    pluginControlProducer: 'excluded; runner uses fixed synthetic GET responses and an in-memory socket shim, with no Goals plugin backend or database',
    cleanup: 'dispatch pagehide, assert socket disconnect and renderer handler cleanup, flush scoped animation timers and close JSDOM'
  }],
  ['spotlight-chatter-source-fixture-v1', {
    plugin: 'spotlight', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/spotlight/overlays/chatter.html', 'renderer-entry'],
      ['app/plugins/spotlight/overlays/single-overlay.js', 'renderer-script'],
      ['app/plugins/spotlight/lib/animations.js', 'renderer-library'],
      ['app/plugins/spotlight/lib/text-effects.js', 'renderer-library'],
      ['app/plugins/spotlight/lib/template-renderer.js', 'renderer-library'],
      ['app/public/fonts/exo-2.css', 'renderer-font-stylesheet'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/fonts/exo-2.css', source: 'app/public/fonts/exo-2.css; font files are not requested by JSDOM and no font bytes are pinned' },
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/plugins/spotlight/lib/animations.js', source: 'app/plugins/spotlight/lib/animations.js' },
      { path: '/plugins/spotlight/lib/text-effects.js', source: 'app/plugins/spotlight/lib/text-effects.js' },
      { path: '/plugins/spotlight/lib/template-renderer.js', source: 'app/plugins/spotlight/lib/template-renderer.js' },
      { path: '/plugins/spotlight/overlays/single-overlay.js', source: 'app/plugins/spotlight/overlays/single-overlay.js' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)',
      '/api/lastevent/settings/chatter',
      '/api/lastevent/last/chatter'
    ],
    socketEventsConsumed: ['connect', 'disconnect', 'lastevent.update.chatter', 'lastevent.settings.chatter', 'lastevent.session.reset'],
    driverEvents: [
      { event: 'lastevent.update.chatter', payload: { nickname: 'Synthetic Chatter', eventType: 'chat', overlaySessionToken: 'fixture-session' }, negativeCase: 'wrong overlaySessionToken is ignored' },
      { event: 'lastevent.settings.chatter', payload: { preloadImages: false, refreshIntervalSeconds: 0, showProfilePicture: false, outAnimationType: 'none', inAnimationType: 'none', usernameEffect: 'none', showUsername: true, animationSpeed: 'fast' }, negativeCase: 'non-chatter route is denied; dynamic image URLs are absent' },
      { event: 'lastevent.session.reset', payload: { overlaySessionToken: 'fixture-session-next' }, negativeCase: 'stale session update is ignored' }
    ],
    pluginControlProducer: 'excluded; runner provides synthetic chatter settings/users and an in-memory socket shim; no Spotlight backend, TikTok producer or database is started',
    cleanup: 'dispatch non-persisted pagehide, assert socket disconnect, handler removal and no active interval/animation timers, close JSDOM'
  }],
  ['quiz-show-source-fixture-v1', {
    plugin: 'quiz-show', caseCount: 4,
    socketEventsEmitted: ['quiz-show:get-public-state'],
    unresolvedDynamicDependencies: [
      'Conditional GET /api/quiz-show/layouts/${activeLayoutId} and custom layout payload/rendering when /api/quiz-show/state enables an active layout',
      'Fixture does not invoke GET /api/quiz-show/leaderboard?type=round; the exact-query read-only producer and public HTTP allowlist are verified in dedicated owner tests',
      'Runtime brand-kit primary_color/secondary_color updates and logo_path, voter profilePictureUrl, and joker giftIcon image URLs',
      'quiz-show:play-sound filePath and Audio playback',
      'Shared i18n /api/i18n/locales consumer; it is not invoked in the fixture',
      'Real /api/quiz-show/state producer calls checkSeasonAutomation(); backend route side effects were not exercised'
    ],
    expectedRoles: new Map([
      ['app/plugins/quiz-show/quiz_show_overlay.html', 'renderer-entry'],
      ['app/plugins/quiz-show/quiz_show_overlay.js', 'renderer-script'],
      ['app/plugins/quiz-show/quiz_show_overlay.css', 'renderer-stylesheet'],
      ['app/public/css/themes.css', 'shared-theme-stylesheet'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/public/js/public-overlay-render-mode.js', 'shared-render-mode-script'],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/css/themes.css', source: 'app/public/css/themes.css; imported by pinned quiz-show stylesheet' },
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/js/public-overlay-render-mode.js', source: 'app/public/js/public-overlay-render-mode.js' },
      { path: '/quiz-show/quiz_show_overlay.css', source: 'app/plugins/quiz-show/quiz_show_overlay.css' },
      { path: '/quiz-show/quiz_show_overlay.js', source: 'app/plugins/quiz-show/quiz_show_overlay.js' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)',
      '/api/quiz-show/hud-config',
      '/api/quiz-show/brand-kit',
      '/api/quiz-show/state'
    ],
    socketEventsConsumed: [
      'connect', 'disconnect', 'quiz-show:state-update', 'quiz-show:time-update', 'quiz-show:round-ended',
      'quiz-show:joker-activated', 'quiz-show:stopped', 'quiz-show:hud-config-updated', 'quiz-show:play-sound',
      'quiz-show:quiz-ended', 'quiz-show:brand-kit-updated', 'quiz-show:error', 'quiz-show:hide-timer',
      'quiz-show:show-leaderboard', 'quiz-show:hide-leaderboard', 'quiz-show:leaderboard-updated',
      'quiz-show:layout-updated', 'quiz-show:config-updated', 'quiz-show:slot-machine-start',
      'quiz-show:slot-machine-stop', 'quiz-show:category-vote-started', 'quiz-show:category-vote-update',
      'quiz-show:category-vote-ended', 'quiz-show:duel-update', 'quiz-show:duel-ended',
      'quiz-show:achievement-unlocked'
    ],
    driverEvents: [
      {
        event: 'quiz-show:state-update',
        payload: {
          isRunning: true, currentQuestion: { question: 'Synthetic question?', answers: ['Synthetic answer A', 'Synthetic answer B', 'Synthetic answer C', 'Synthetic answer D'], category: 'Fixture' },
          currentRound: 1, totalRounds: 2,
          voterIconsConfig: { enabled: false }, votersPerAnswer: { 0: [], 1: [], 2: [], 3: [] }, hiddenAnswers: []
        },
        negativeCase: 'no sound event, user-provided logo, voter image, joker image or active layout is driven'
      },
      {
        event: 'quiz-show:time-update',
        payload: { timeRemaining: 20, totalTime: 30 },
        negativeCase: 'countdown is driven through its dedicated time-update consumer, separately from public question state'
      }
    ],
    pluginControlProducer: 'excluded; fixed synthetic GET responses and two in-memory Quiz Show renderer events; no Quiz Show backend/database/producer; Audio constructor is blocked and no sound event is driven',
    cleanup: 'dispatch non-persisted pagehide, assert socket disconnect, handler removal, timers and animation frames canceled, and close JSDOM'
  }],
  ['toptier-source-fixture-v1', {
    plugin: 'toptier', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/toptier/overlay.html', 'renderer-entry'],
      ['app/plugins/toptier/assets/overlay.js', 'renderer-script'],
      ['app/plugins/toptier/assets/overlay.css', 'renderer-stylesheet'],
      ['app/plugins/toptier/assets/animations.css', 'renderer-stylesheet'],
      ['app/plugins/toptier/assets/avatar-placeholder.svg', 'dynamic-avatar-fallback'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/plugins/toptier/assets/animations.css', source: 'app/plugins/toptier/assets/animations.css' },
      { path: '/plugins/toptier/assets/overlay.css', source: 'app/plugins/toptier/assets/overlay.css' },
      { path: '/plugins/toptier/assets/overlay.js', source: 'app/plugins/toptier/assets/overlay.js' },
      { path: '/plugins/toptier/assets/avatar-placeholder.svg', source: 'app/plugins/toptier/assets/avatar-placeholder.svg; only the fixed no-profile fallback is used' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: ['/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)'],
    socketEventsConsumed: ['connect', 'toptier:update', 'toptier:rank-change', 'toptier:new-leader', 'toptier:decay'],
    driverEvents: [
      { event: 'toptier:update', payload: { board: 'likes', entries: [{ username: 'fixture-liker', nickname: 'Fixture Liker', profile_picture_url: '', score: 42, rank: 1 }], sessionId: 'fixture-session-a' }, negativeCase: 'invalid board and malformed entries are ignored; the synthetic profile URL is empty and only the fixed local placeholder is pinned' }
    ],
    pluginControlProducer: 'excluded; fixed synthetic in-memory toptier:update event and Socket.IO shim only; no TopTier backend/database/producer; profile_picture_url is empty and only the fixed local placeholder is referenced',
    cleanup: 'dispatch non-persisted pagehide, assert renderer disconnects shim and clears scoped timers, then close JSDOM'
  }],
  ['viewerxp-source-fixture-v1', {
    plugin: 'milestone-leaderboard', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html', 'renderer-entry'],
      ['app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html', 'renderer-entry'],
      ['app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/level-up.html', 'renderer-entry'],
      ['app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-i18n.js', 'renderer-library'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/plugins/viewer-leaderboard/viewer-xp-i18n.js', source: 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-i18n.js' },
      { path: '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/{xp-bar|leaderboard|level-up}.html', source: 'three pinned Viewer-XP renderer entries' },
      { path: '/plugins/viewer-leaderboard/locales/{de|en|es|fr}.json', source: 'four pinned milestone-leaderboard locale files' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)',
      '/api/i18n/locales is not consumed by the fixture and remains unreviewed'
    ],
    socketEventsConsumed: [
      'connect', 'connect_error', 'disconnect', 'locale-changed', 'viewer-xp:public-profile', 'viewer-xp:public-leaderboard',
      'viewer-xp:public-update', 'viewer-xp:public-level-up'
    ],
    socketEventsEmitted: ['viewer-xp:public-profile:request', 'viewer-xp:public-leaderboard:request'],
    unresolvedDynamicDependencies: [
      'Shared i18n /api/i18n/locales consumer is not invoked; only four fixed translation locales are intercepted',
      'Production HTTP/Socket.IO transport and database-backed producers are not started; handlers are exercised with an in-memory plugin/socket double',
      'Profile picture URLs are projected to null and no image/network dependency is loaded'
    ],
    driverEvents: [
      { event: 'viewer-xp:public-profile', payload: { username: 'Synthetic Viewer', level: 7, xp_progress: 11 }, negativeCase: 'private user identifiers, coin balance and settings are absent from projected public display data' },
      { event: 'viewer-xp:public-leaderboard', payload: [{ username: 'Synthetic <img>', title: '<b>Fixture</b>', level: 7, xp: 42, rank: 1 }], negativeCase: 'hostile display text remains text; invalid style values are rejected' },
      { event: 'viewer-xp:public-level-up', payload: { username: 'Synthetic Viewer', oldLevel: 6, newLevel: 7 }, negativeCase: 'fixture uses no audio or external image URLs' }
    ],
    pluginControlProducer: 'excluded; actual public handlers are called on an isolated prototype double with synthetic in-memory DB/socket; no plugin runtime or database is started',
    cleanup: 'dispatch persisted pagehide/pageshow and non-persisted pagehide; assert all three original renderers restore, disconnect, ignore late callbacks, publish only when window.socket is empty, preserve foreign socket ownership, remove only their own socket reference, and close JSDOM'
  }],
  ['webgpu-weather-control-source-fixture-v1', {
    plugin: 'webgpu-weather-control', caseCount: 1,
    expectedRoles: new Map([
      ['app/plugins/webgpu-weather-control/overlay.html', 'renderer-entry'],
      ['app/plugins/webgpu-weather-control/gpu/cinematic-weather-engine.js', 'renderer-script'],
      ['app/plugins/webgpu-weather-control/gpu/weather-framegraph.js', 'renderer-library'],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/plugins/webgpu-weather-control/gpu/cinematic-weather-engine.js', source: 'app/plugins/webgpu-weather-control/gpu/cinematic-weather-engine.js' },
      { path: '/plugins/webgpu-weather-control/gpu/weather-framegraph.js', source: 'app/plugins/webgpu-weather-control/gpu/weather-framegraph.js imported by the pinned weather engine' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: ['/api/webgpu-weather/overlay-config'],
    socketEventsConsumed: [
      'connect', 'webgpu-weather:config-changed', 'webgpu-weather:gamification-state',
      'webgpu-weather:stop', 'webgpu-weather:stop-effect', 'webgpu-weather:trigger'
    ],
    socketEventsEmitted: [
      'webgpu-weather:client-ready', 'webgpu-weather:overlay-state', 'webgpu-weather:request-permanent-effects'
    ],
    unresolvedDynamicDependencies: [
      'The CPU fixture injects a synthetic GET response; the live plugin/backend producer and real HTTP transport are not started',
      'WebGPU is intentionally unavailable in JSDOM; GPU rendering, device behavior, audio and visual output are untested',
      'The four pinned plugin locale catalogs are not loaded by this renderer entry and are not translation coverage'
    ],
    driverEvents: [
      { event: 'webgpu-weather:trigger', payload: { action: 'rain', intensity: 0.7, duration: 5000, permanent: false, options: { layer: 32, wind: 0.4, opacity: 0.75, particleScale: 0.9 } }, negativeCase: 'only the actual public projection is passed to the renderer and the unsupported engine reports synthetic effect state without a GPU' },
      { event: 'webgpu-weather:config-changed', payload: {}, negativeCase: 'duplicate/stale config reads are controlled; new valid config wins and the connect path does not duplicate the initial GET' },
      { event: 'webgpu-weather:gamification-state', payload: { communityMeter: { current: 6, max: 10 }, quest: { active: { title: 'Rain goal' } }, streaks: { current: 3 }, rewards: { history: [{ label: 'Umbrella' }] } }, negativeCase: 'only projected synthetic display fields reach the renderer' }
    ],
    pluginControlProducer: 'excluded; original renderer and actual weather engine run with synthetic fetch/socket doubles, but no weather plugin runtime, database or GPU device is started',
    cleanup: 'exercise BFCache pagehide/pageshow and final non-persisted pagehide; assert animation loop stops/restores, handlers disconnect, late events are ignored, and JSDOM closes'
  }],
  ['interactive-story-source-fixture-v1', {
    plugin: 'interactive-story', caseCount: 4,
    expectedRoles: new Map([
      ['app/plugins/interactive-story/overlay.html', 'renderer-entry-inline-css-js'],
      ['app/public/js/i18n-client.js', I18N_ROLE],
      ['app/public/js/public-overlay-render-mode.js', 'shared-render-mode-script'],
      ['app/node_modules/socket.io/client-dist/socket.io.js', SOCKET_BUNDLE_ROLE]
    ]),
    assetGetRoutes: [
      { path: '/js/i18n-client.js', source: 'app/public/js/i18n-client.js' },
      { path: '/js/public-overlay-render-mode.js', source: 'app/public/js/public-overlay-render-mode.js' },
      { path: '/socket.io/socket.io.js', source: 'synthetic in-memory Socket.IO shim; pinned browser client source is recorded but not executed in current JSDOM fixture' }
    ],
    apiGetPatterns: [
      '/api/i18n/translations/{de|en|es|fr} (fixture reads the corresponding pinned plugin locale file)',
      '/api/interactive-story/config', '/api/interactive-story/participants', '/api/interactive-story/overlay-positions'
    ],
    socketEventsConsumed: [
      'connect', 'connect_error', 'disconnect', 'story:chapter-display', 'story:chapter-ready',
      'story:chapter-sentence', 'story:chapter-title-phase', 'story:chapter-tts-complete',
      'story:chapter-tts-start', 'story:config-updated', 'story:dnd-participants-updated', 'story:ended',
      'story:generation-started', 'story:image-generation-failed', 'story:image-updated', 'story:vote-update',
      'story:voting-ended', 'story:voting-started', 'tts:playback:ended'
    ],
    driverEvents: [{
      event: 'story:chapter-display',
      payload: { mode: 'immediate', chapter: { title: 'Synthetic chapter', content: 'Synthetic chapter text.' } },
      negativeCase: 'chapter has no imagePath, config uses default generating animation with empty URL, TTS relay event is not driven'
    }],
    pluginControlProducer: 'excluded; synthetic fixed GET responses and one in-memory chapter-display event; no Interactive Story backend, database, LLM/image/TTS provider or audio playback',
    cleanup: 'close the isolated JSDOM and its shim after the case; source has no pagehide cleanup handler, so product transport cleanup is not proven'
  }]
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`Renderer fixture manifest rejected: ${message}`);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function isWithin(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function validateRendererFixtureManifest(repoRoot, manifest, { fsApi = fs } = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('manifest object is required');
  const config = FIXTURES.get(manifest.fixtureId);
  if (!config) fail('fixture family is not allowlisted');
  const expectedKeys = ['caseCount', 'files', 'fixtureId', 'runnerContract', 'schemaVersion', 'status'];
  if (manifest.schemaVersion !== 1 || Object.keys(manifest).sort().join('|') !== expectedKeys.sort().join('|')) fail('unexpected schema or manifest fields');
  if (manifest.status !== 'cpu-only-source-fixture-no-listener-no-obs') fail('manifest scope must remain CPU-only');
  if (manifest.caseCount !== config.caseCount || !Array.isArray(manifest.files) || manifest.files.length !== config.expectedRoles.size + 4) fail('expected the exact four-locale pinned renderer closure');

  const contract = manifest.runnerContract;
  const contractKeys = ['apiGetPatterns', 'assetGetRoutes', 'cleanup', 'driverEvents', 'externalNetwork', 'listenerStarted', 'origin', 'pluginControlProducer', 'productProfileOrCredentialData', 'socketEventsConsumed', 'transport'];
  if (config.socketEventsEmitted) contractKeys.push('socketEventsEmitted');
  if (config.unresolvedDynamicDependencies) contractKeys.push('unresolvedDynamicDependencies');
  if (!contract || Object.keys(contract).sort().join('|') !== contractKeys.sort().join('|')) fail('runner contract has unknown or missing fields');
  if (contract.listenerStarted !== false || contract.transport !== COMMON_CONTRACT.transport) fail('a network listener is forbidden in this fixture');
  if (contract.externalNetwork !== COMMON_CONTRACT.externalNetwork || contract.productProfileOrCredentialData !== COMMON_CONTRACT.productProfileOrCredentialData) fail('fixture must exclude external network and user state');
  if (contract.origin !== COMMON_CONTRACT.origin) fail('unexpected fixture origin');
  if (stableJson(contract.assetGetRoutes) !== stableJson(config.assetGetRoutes)) fail('asset route allowlist changed');
  if (stableJson(contract.apiGetPatterns) !== stableJson(config.apiGetPatterns)) fail('API route allowlist changed');
  if (stableJson(contract.socketEventsConsumed) !== stableJson(config.socketEventsConsumed)) fail('socket event consumer allowlist changed');
  if (config.socketEventsEmitted && stableJson(contract.socketEventsEmitted) !== stableJson(config.socketEventsEmitted)) fail('socket requester allowlist changed');
  if (config.unresolvedDynamicDependencies && stableJson(contract.unresolvedDynamicDependencies) !== stableJson(config.unresolvedDynamicDependencies)) fail('dynamic dependency review changed');
  if (stableJson(contract.driverEvents) !== stableJson(config.driverEvents)) fail('synthetic driver event contract changed');
  if (contract.pluginControlProducer !== config.pluginControlProducer) fail('plugin/backend producer is outside this fixture');
  if (contract.cleanup !== config.cleanup) fail('cleanup contract changed');

  const root = fsApi.realpathSync(repoRoot);
  const seen = new Set();
  const checked = [];
  for (const entry of manifest.files) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('file entry must be an object');
    if (Object.keys(entry).sort().join('|') !== ['bytes', 'path', 'role', 'sha256'].sort().join('|')) fail('unsupported file entry fields');
    if (typeof entry.path !== 'string' || !entry.path || path.posix.isAbsolute(entry.path) || entry.path.includes('\\') || entry.path.split('/').includes('..')) fail('file path must be a safe repository-relative path');
    const filePath = entry.path;
    const folded = filePath.toLowerCase();
    if (seen.has(folded)) fail('duplicate or case-colliding file path');
    seen.add(folded);
    if (FORBIDDEN_PATH.test(filePath)) fail('user profile, credential or runtime state path is forbidden');
    const allowedLocale = new RegExp(`^app/plugins/${config.plugin}/locales/(?:de|en|es|fr)\\.json$`).test(filePath);
    const expectedRole = config.expectedRoles.get(filePath) || (allowedLocale ? 'plugin-locale' : null);
    if (!expectedRole || entry.role !== expectedRole) fail(`file is outside the reviewed ${config.plugin} fixture closure: ${filePath}`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`invalid size or SHA-256 for ${filePath}`);
    const absolute = path.resolve(root, ...filePath.split('/'));
    if (!isWithin(root, absolute)) fail('file escapes repository root');
    let current = root;
    for (const segment of path.relative(root, absolute).split(path.sep)) {
      current = path.join(current, segment);
      let stat;
      try { stat = fsApi.lstatSync(current); } catch (error) { fail(`missing local asset ${filePath}: ${error.code || 'read error'}`); }
      if (stat.isSymbolicLink() || stat.isReparsePoint === true) fail(`reparse point is forbidden: ${filePath}`);
    }
    const real = fsApi.realpathSync(absolute);
    if (!isWithin(root, real)) fail(`resolved path escapes repository root: ${filePath}`);
    const stat = fsApi.statSync(real);
    if (!stat.isFile()) fail(`only regular files are permitted: ${filePath}`);
    const bytes = fsApi.readFileSync(real);
    if (bytes.length !== entry.bytes) fail(`byte count mismatch: ${filePath}`);
    if (sha256(bytes) !== entry.sha256) fail(`SHA-256 mismatch: ${filePath}`);
    checked.push({ path: filePath, bytes: bytes.length, sha256: sha256(bytes), role: entry.role });
  }

  for (const [filePath, role] of config.expectedRoles) {
    if (!checked.some((entry) => entry.path === filePath && entry.role === role)) fail(`required source dependency missing: ${filePath}`);
  }
  const requiredLocales = ['de', 'en', 'es', 'fr'];
  const actualLocales = checked.filter((entry) => entry.role === 'plugin-locale').map((entry) => path.posix.basename(entry.path, '.json')).sort();
  if (actualLocales.join('|') !== requiredLocales.join('|')) fail('all four explicit plugin locale files are required');
  return { fixtureId: manifest.fixtureId, files: checked, totalBytes: checked.reduce((sum, entry) => sum + entry.bytes, 0), listenerStarted: false };
}

module.exports = { validateRendererFixtureManifest };





