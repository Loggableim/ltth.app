'use strict';

class PublicPathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublicPathError';
    this.code = 'PUBLIC_PATH_INVALID';
  }
}

const ENTRYPOINTS = Object.freeze([
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
  '/streammonsters/overlay',
  '/overlay/stt-ticker',
  '/overlay/talking-heads',
  '/plugins/toptier/overlay.html',
  '/visual-fx-frame-webgpu/overlay',
  '/weather-control/overlay',
  '/webgpu-emoji-rain/obs-hud',
  '/webgpu-fireworks/overlay',
  '/webgpu-weather-control/overlay'
]);

const EXACT_ENTRYPOINTS = new Set(
  ENTRYPOINTS.filter(pathname => !pathname.includes(':type'))
);
const SPOTLIGHT_ENTRYPOINT = /^\/overlay\/spotlight\/[A-Za-z0-9_-]+$/;

function exact(pathname) {
  return value => value === pathname;
}

function pattern(expression) {
  return value => expression.test(value);
}

function rule(methods, matcher) {
  return Object.freeze({
    methods: new Set(methods),
    matcher
  });
}

const HTTP_RULES = Object.freeze([
  rule(['GET', 'HEAD'], exact('/socket.io/socket.io.js')),
  rule(['GET', 'POST'], exact('/socket.io/')),
  rule(['GET', 'HEAD'], exact('/js/i18n-client.js')),
  rule(['GET', 'HEAD'], exact('/js/public-overlay-render-mode.js')),
  rule(['GET', 'HEAD'], exact('/js/matter.min.js')),
  rule(['GET', 'HEAD'], exact('/css/themes.css')),
  rule(['GET', 'HEAD'], exact('/css/overlay-base.css')),
  rule(['GET', 'HEAD'], exact('/fonts/exo-2.css')),
  rule(['GET', 'HEAD'], exact('/fonts/open-sans.css')),
  rule(['GET', 'HEAD'], exact('/fonts/opendyslexic.css')),
  rule(['GET', 'HEAD'], exact('/vendor/pixi/pixi.min.mjs')),
  rule(['GET', 'HEAD'], exact('/vendor/rapier2d/rapier.es.js')),

  rule(['GET', 'HEAD'], pattern(/^\/uploads\/animations\/[A-Za-z0-9._ -]+\.(?:gif|jpe?g|mp4|png|webm)$/i)),
  rule(['GET', 'HEAD'], pattern(/^\/sounds\/[A-Za-z0-9._ -]+\.(?:m4a|mp3|ogg|wav|webm)$/i)),

  rule(['GET', 'HEAD'], exact('/advanced-timer/overlay.js')),
  rule(['GET', 'HEAD'], exact('/plugins/advanced-timer/overlay/overlay.js')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/advanced-timer\/timers\/[^/]+$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/advanced-timer\/timers\/[^/]+\/(?:rotator|threshold-effects)$/)),

  rule(['GET', 'HEAD'], exact('/api/animazingpal/live-host/stream-assistant/status')),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/animazingpal\/locales\/(?:de|en|es|fr)(?:\.json)?$/)),

  rule(['GET', 'HEAD'], pattern(/^\/plugins\/clarityhud\/lib\/(?:accessibility|animations|badge-renderer|emoji-parser|i18n-runtime|layout-engine|message-parser|settings-schema|stream-animations|virtual-scroller)\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/clarityhud\/overlays\/(?:chat|full|multi|stream)\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/clarityhud\/settings\/(?:chat|full|multi|stream)$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/clarityhud\/state\/(?:chat|full)$/)),
  rule(['GET', 'HEAD'], exact('/api/clarityhud/multi/status')),

  rule(['GET', 'HEAD'], pattern(/^\/plugins\/coinbattle\/overlay\/(?:gpu-animations\.css|overlay\.js|styles\.css|template-manager\.js|victory-animations\.css)$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/plugins\/coinbattle\/leaderboard\/(?:lifetime|season|weekly)$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/plugins\/coinbattle\/overlay-layouts(?:\/[^/]+)?$/)),

  rule(['GET', 'HEAD'], exact('/js/emoji-rain-engine.js')),
  rule(['GET', 'HEAD'], exact('/js/emoji-rain-obs-hud.js')),
  rule(['GET', 'HEAD'], exact('/api/emoji-rain/config')),
  rule(['GET', 'HEAD'], exact('/api/emoji-rain/user-mappings')),

  rule(['GET', 'HEAD'], pattern(/^\/plugins\/fireworks\/gpu\/(?:engine|particle-system-soa|webgl-particle-engine)\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/fireworks\/audio\/[A-Za-z0-9._ ,()-]+\.mp3$/i)),

  rule(['GET', 'HEAD'], exact('/api/flame-overlay/config')),
  rule(['GET', 'HEAD'], exact('/flame-overlay/default-config.js')),
  rule(['GET', 'HEAD'], pattern(/^\/flame-overlay\/(?:effects-engine|post-processor)\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/flame-overlay\/textures\/[A-Za-z0-9._-]+\.(?:jpg|png|webp)$/i)),

  rule(['GET', 'HEAD'], pattern(/^\/api\/game-engine\/config\/(?:chess|connect4)$/)),
  rule(['GET', 'HEAD'], exact('/api/game-engine/media/connect4')),
  rule(['GET', 'HEAD'], exact('/api/game-engine/active-session')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/game-engine\/leaderboards\/[A-Za-z0-9_-]+$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/game-engine\/(?:daily|season|lifetime)-leaderboard\/(?:chess|connect4)$/)),
  rule(['GET', 'HEAD'], exact('/api/game-engine/arena/state')),
  rule(['GET', 'HEAD'], exact('/api/game-engine/gift-catalog')),
  rule(['GET', 'HEAD'], exact('/api/gift-catalog')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/game-engine\/(?:slot|wheel)\/audio-settings$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/game-engine\/(?:slot|wheel)\/audio\/settings$/)),
  rule(['GET', 'HEAD'], pattern(/^\/game-engine\/sounds\/(?:default|wheel|slot)\/(?:custom\/\d+\/)?[A-Za-z0-9._ -]+\.mp3$/i)),

  rule(['GET', 'HEAD'], exact('/api/gcce/hud/rotator')),
  rule(['GET', 'HEAD'], exact('/gcce/style.css')),

  rule(['GET', 'HEAD'], exact('/plugins/goals/overlay/overlay.js')),
  rule(['GET', 'HEAD'], exact('/plugins/goals/overlay/multigoal.js')),
  rule(['GET', 'HEAD'], exact('/plugins/goals/templates-shared.js')),

  rule(['GET', 'HEAD'], exact('/api/interactive-story/config')),
  rule(['GET', 'HEAD'], exact('/api/interactive-story/overlay-positions')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/interactive-story\/image\/[A-Za-z0-9._-]+$/)),

  rule(['GET', 'HEAD'], exact('/quiz-show/quiz_show_overlay.css')),
  rule(['GET', 'HEAD'], exact('/quiz-show/quiz_show_overlay.js')),
  rule(['GET', 'HEAD'], exact('/api/quiz-show/brand-kit')),
  rule(['GET', 'HEAD'], exact('/api/quiz-show/hud-config')),
  rule(['GET', 'HEAD'], exact('/api/quiz-show/state')),
  rule(['GET', 'HEAD'], exact('/api/quiz-show/leaderboard')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/quiz-show\/layouts\/[^/]+$/)),

  rule(['GET', 'HEAD'], exact('/plugins/schnorrbecher/overlay/coincup.css')),
  rule(['GET', 'HEAD'], exact('/plugins/schnorrbecher/overlay/coincup.js')),
  rule(['GET', 'HEAD'], exact('/plugins/schnorrbecher/assets/sounds/adriantnt_glass.mp3')),

  rule(['GET', 'HEAD'], pattern(/^\/plugins\/spotlight\/overlays\/[A-Za-z0-9_-]+\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/spotlight\/lib\/(?:animations|text-effects|template-renderer)\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/lastevent\/settings\/[A-Za-z0-9_-]+$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/lastevent\/last\/[A-Za-z0-9_-]+$/)),
  rule(['GET', 'HEAD'], exact('/api/lastevent/all')),

  rule(['GET', 'HEAD'], exact('/api/streammonsters/state')),
  rule(['GET', 'HEAD'], exact('/api/streammonsters/battle-state')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/streammonsters\/battles\/[A-Za-z0-9_-]+\/replay$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/streammonsters\/art\/kenney-[a-f0-9]{16}\.svg$/)),
  rule(['POST'], exact('/api/streammonsters/overlay/heartbeat')),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/streamalchemy\/streammonsters-(?:effects-renderer|overlay-runtime|arena-director|audio-engine|arena-view|chat-view)\.js$/)),
  rule(['GET', 'HEAD'], exact('/plugins/streamalchemy/streammonsters-egg-stage-view.js')),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/streamalchemy\/locales\/(?:de|en|es|fr)\.json$/)),
  rule(['GET', 'HEAD'], exact('/plugins/streamalchemy/assets/branding/stream-monsters-icon.png')),
  rule(['GET', 'HEAD'], exact('/plugins/streamalchemy/assets/branding/stream-monsters-logo.png')),
  rule(['GET', 'HEAD'], exact('/plugins/streamalchemy/assets/audio/manifest.json')),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/streamalchemy\/assets\/audio\/cues\/[A-Za-z0-9._-]+\.wav$/i)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/streamalchemy\/assets\/eggs\/[a-z]+-(?:charged|standard)\.png$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/streamalchemy\/assets\/streammonsters\/furry\/[a-z0-9-]+\.png$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/streamalchemy\/assets\/streammonsters\/furry\/evolution\/[a-z]+\/[a-z0-9-]+-stage[23]\.png$/)),

  rule(['GET', 'HEAD'], exact('/overlay/talking-heads/assets/overlay.css')),
  rule(['GET', 'HEAD'], exact('/overlay/talking-heads/assets/overlay.js')),
  rule(['GET', 'HEAD'], pattern(/^\/api\/talkingheads\/overlay\/translations\/(?:de|en|es|fr)$/)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/talkingheads\/sprite\/[A-Za-z0-9_.-]+\.(?:png|svg)$/i)),
  rule(['GET', 'HEAD'], pattern(/^\/api\/talkingheads\/manual-sprite\/[a-z0-9-]{1,64}\/[A-Za-z0-9_.-]+\.png$/i)),

  rule(['GET', 'HEAD'], exact('/plugins/toptier/assets/animations.css')),
  rule(['GET', 'HEAD'], exact('/plugins/toptier/assets/avatar-placeholder.svg')),
  rule(['GET', 'HEAD'], exact('/plugins/toptier/assets/overlay.css')),
  rule(['GET', 'HEAD'], exact('/plugins/toptier/assets/overlay.js')),

  rule(['GET', 'HEAD'], exact('/api/visual-fx-frame-webgpu/config')),
  rule(['GET', 'HEAD'], exact('/plugins/visual-fx-frame-webgpu/default-config.js')),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/visual-fx-frame-webgpu\/renderer\/(?:adaptive-quality|effect-pipelines|gpu-resources|hdr-post-processor|overlay-controller|webgpu-effects-engine)\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/visual-fx-frame-webgpu\/textures\/[A-Za-z0-9._-]+\.(?:jpg|png|webp)$/i)),
  rule(['GET', 'HEAD'], pattern(/^\/visual-fx-frame-webgpu\/(?:default-config|adaptive-quality|effect-pipelines|gpu-resources|hdr-post-processor|overlay-controller|webgpu-effects-engine)\.js$/)),

  rule(['GET', 'HEAD'], exact('/api/weather/config')),
  rule(['GET', 'HEAD'], exact('/api/weather/gamification')),
  rule(['GET', 'HEAD'], exact('/plugins/weather-control/weather-engine.js')),

  rule(['GET', 'HEAD'], pattern(/^\/plugins\/webgpu-emoji-rain\/gpu\/(?:engine|webgpu-emoji-engine)\.js$/)),
  rule(['GET', 'HEAD'], exact('/plugins/webgpu-emoji-rain/lib/webgpu-config.js')),

  rule(['GET', 'HEAD'], pattern(/^\/plugins\/webgpu-fireworks\/gpu\/[A-Za-z0-9._-]+\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/webgpu-fireworks\/lib\/[A-Za-z0-9._/-]+\.js$/)),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/webgpu-fireworks\/audio\/[A-Za-z0-9._ ,()-]+\.mp3$/i)),

  rule(['GET', 'HEAD'], exact('/api/webgpu-weather/overlay-config')),
  rule(['GET', 'HEAD'], pattern(/^\/plugins\/webgpu-weather-control\/gpu\/(?:cinematic-weather-engine|weather-framegraph)\.js$/)),
  rule(['GET', 'HEAD'], exact('/plugins/webgpu-weather-control/lib/bootstrap-config.js'))
]);

const INCOMING_SOCKET_EVENTS = new Set(`
coinbattle:get-state
pyramid:get-state
fireworks:renderer-fallback
fireworks:register-overlay
fireworks:active-count-response
fireworks:fps-update
game-engine:request-state
plinko:ball-landed
plinko:request-config
plinko:request-leaderboard
slot:spin-completed
unified-queue:request-status
wheel:request-config
wheel:spin-complete
goals:subscribe
goals:animation-end
multigoals:subscribe
tts:playback:ended
talkingheads:avatar:spin:complete
musicbot:request-status
zappiehell:request:state
coinJar.sync.request
toptier:get-board
visual-fx-frame-webgpu:renderer-status
weather:overlay-state
weather:client-ready
weather:request-gamification-state
weather:request-permanent-effects
webgpu-weather:client-ready
webgpu-weather:request-permanent-effects
webgpu-weather:overlay-state
`.trim().split(/\s+/));

const OUTGOING_SOCKET_EVENTS = new Set(`
advanced-timer:completed
advanced-timer:paused
advanced-timer:reset
advanced-timer:rotator-snapshot
advanced-timer:started
advanced-timer:stopped
advanced-timer:threshold-effect
advanced-timer:tick
advanced-timer:time-added
advanced-timer:time-removed
animazingpal:stream-assistant:event
animazingpal:stream-assistant:reset
arena:chainsaw-hit
arena:food-eaten
arena:mine-triggered
arena:player-absorbed
arena:player-removed
arena:state
arena:stream-surge
arena:weapon-activated
arena:weapon-collected
clarityhud.settings.chat
clarityhud.settings.full
clarityhud.settings.multi
clarityhud.settings.stream
clarityhud.update.chat
clarityhud.update.follow
clarityhud.update.gift
clarityhud.update.join
clarityhud.update.like
clarityhud.update.share
clarityhud.update.subscribe
clarityhud.update.treasure
clarityhud:multi:chat
clarityhud:multi:gift
coinbattle:badges-awarded
coinbattle:config-updated
coinbattle:gift-received
coinbattle:leaderboard-update
coinbattle:match-ended
coinbattle:match-state
coinbattle:multiplier-activated
coinbattle:multiplier-ended
coinbattle:post-match
coinbattle:team-names-updated
coinbattle:timer-update
coinJar.add
coinJar.config
coinJar.reset
coinJar.sync
emoji-rain:clear
emoji-rain:config-update
emoji-rain:gift-balls
emoji-rain:heart-balloons
emoji-rain:spawn
emoji-rain:toggle
emoji-rain:user-mappings-update
event:animation
game-engine:audio-state-updated
game-engine:challenge-created
game-engine:challenge-rejected
game-engine:config-updated
game-engine:current-state
game-engine:game-ended
game-engine:game-started
game-engine:game-switched
game-engine:idle
game-engine:interactive-state
game-engine:media-updated
game-engine:move-error
game-engine:move-made
game-engine:timer-update
gcce:hud:clear
gcce:hud:remove
gcce:hud:rotator:update
gcce:hud:show
gift:animation
gift-catalog:updated
goals:config-changed
goals:deleted
goals:reach-complete
goals:reached
goals:reset
goals:subscribed
goals:value-changed
multigoals:config-changed
multigoals:deleted
multigoals:subscribed
musicbot:next-song-vote
musicbot:now-playing
musicbot:paused
musicbot:playback-stopped
musicbot:playback-sync
musicbot:queue-update
musicbot:resumed
musicbot:volume-changed
musicbot:vote-skip-update
plinko:ball-result
plinko:batch-complete
plinko:config
plinko:config-updated
plinko:heatmap
plinko:leaderboard
plinko:spawn-ball
plugins:changed
pyramid:config-updated
pyramid:knockout
pyramid:leaderboard-update
pyramid:player-joined
pyramid:points-update
pyramid:round-ended
pyramid:round-extended
pyramid:round-started
pyramid:state
pyramid:timer-update
quiz-show:achievement-unlocked
quiz-show:brand-kit-updated
quiz-show:category-vote-ended
quiz-show:category-vote-started
quiz-show:category-vote-update
quiz-show:config-updated
quiz-show:duel-ended
quiz-show:duel-update
quiz-show:error
quiz-show:hide-leaderboard
quiz-show:hide-timer
quiz-show:hud-config-updated
quiz-show:joker-activated
quiz-show:layout-updated
quiz-show:leaderboard-hide
quiz-show:leaderboard-show
quiz-show:leaderboard-update
quiz-show:leaderboard-updated
quiz-show:play-sound
quiz-show:quiz-ended
quiz-show:round-ended
quiz-show:show-leaderboard
quiz-show:slot-machine-start
quiz-show:slot-machine-stop
quiz-show:state-update
quiz-show:stopped
quiz-show:time-update
slot:audio-updated
slot:overlay-effect
slot:play-audio
slot:spin-error
slot:spin-result
slot:spin-started
slot:spin-timeout
soundboard:play
story:chapter-display
story:chapter-ready
story:chapter-sentence
story:chapter-title-phase
story:chapter-tts-complete
story:chapter-tts-start
story:config-updated
story:ended
story:generation-started
story:image-generation-failed
story:image-updated
story:vote-update
story:voting-ended
story:voting-started
lastevent.multihud.update
lastevent.session.reset
lastevent.settings.chatter
lastevent.settings.follower
lastevent.settings.gifter
lastevent.settings.giftstreak
lastevent.settings.like
lastevent.settings.multihud
lastevent.settings.share
lastevent.settings.subscriber
lastevent.settings.topgift
lastevent.update.chatter
lastevent.update.follower
lastevent.update.gifter
lastevent.update.giftstreak
lastevent.update.like
lastevent.update.share
lastevent.update.subscriber
lastevent.update.topgift
streammonsters:achievement_unlocked
streammonsters:arena_rating_changed
streammonsters:battle_action
streammonsters:battle_arena_collapse
streammonsters:battle_cancelled
streammonsters:battle_choice_locked
streammonsters:battle_choice_opened
streammonsters:battle_choice_rejected
streammonsters:battle_choices_revealed
streammonsters:battle_completed
streammonsters:battle_knockout
streammonsters:battle_match_found
streammonsters:battle_roster_locked
streammonsters:battle_round
streammonsters:battle_skill_locked
streammonsters:battle_skill_prompt
streammonsters:battle_skill_used
streammonsters:battle_special_charged
streammonsters:battle_started
streammonsters:chat_result
streammonsters:egg_boosted
streammonsters:egg_expired
streammonsters:egg_landed
streammonsters:egg_hatched
streammonsters:egg_ready
streammonsters:egg_spawned
streammonsters:egg_stage_removed
streammonsters:egg_stage_updated
streammonsters:elemental_hour
streammonsters:free_egg_claimed
streammonsters:free_egg_public
streammonsters:free_egg_reserved
streammonsters:owned_ready_egg_claimed
streammonsters:owned_ready_egg_public
streammonsters:gift_combo
streammonsters:hatch_started
streammonsters:hype_changed
streammonsters:hype_milestone
streammonsters:monster_discovered
streammonsters:monster_evolved
streammonsters:monster_level_up
streammonsters:monster_stat_auto_assigned
streammonsters:monster_stat_chosen
streammonsters:monster_stat_prompt
streammonsters:monster_visual_evolved
streammonsters:monster_xp_awarded
streammonsters:quest_completed
streammonsters:rivalry
streammonsters:season_rank_changed
streammonsters:stance_revealed
streammonsters:stat_choice_opened
streammonsters:stream_started
streammonsters:tutorial_hint
streammonsters:upset
streammonsters:win_streak
stt-ticker:clear
stt-ticker:interim
stt-ticker:transcript
talkingheads:animation:end
talkingheads:animation:frame
talkingheads:animation:start
talkingheads:animation:stop
talkingheads:avatar:spawn
talkingheads:avatar:spin:start
toptier:decay
toptier:new-leader
toptier:rank-change
toptier:update
tts:playback:ended
unified-queue:chess-queued
unified-queue:cleared
unified-queue:connect4-queued
unified-queue:plinko-queued
unified-queue:status
unified-queue:wheel-queued
weather:config-changed
weather:gamification-state
weather:stop
weather:stop-effect
weather:trigger
webgpu-weather:config-changed
webgpu-weather:gamification-state
webgpu-weather:stop
webgpu-weather:stop-effect
webgpu-weather:trigger
wheel:audio-updated
wheel:config
wheel:config-updated
wheel:queue-processing
wheel:spin-error
wheel:spin-queued
wheel:spin-result
wheel:spin-start
wheel:spin-timeout
visual-fx-frame-webgpu:clear-triggers
visual-fx-frame-webgpu:config-update
visual-fx-frame-webgpu:trigger
zappiehell:audio:play
zappiehell:goals:completed
zappiehell:goals:state
zappiehell:goals:update
zappiehell:overlay:animate
`.trim().split(/\s+/));

const FORBIDDEN_PUBLIC_KEYS =
  /^(?:api[_-]?key|(?:(?:access|auth|refresh)[_-]?)?token|secret|password|credential|cookie)$/i;

function extractRawPath(value) {
  const raw = String(value);
  const absoluteMatch = raw.match(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*(\/[^?#]*)?/);
  if (absoluteMatch) {
    return absoluteMatch[1] || '/';
  }
  return raw.split(/[?#]/, 1)[0];
}

function normalizePublicPath(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) {
    throw new PublicPathError('Public path must be a non-empty string');
  }

  const rawPath = extractRawPath(rawUrl);
  if (
    !rawPath.startsWith('/') ||
    /%(?:00|2e|2f|5c)/i.test(rawPath)
  ) {
    throw new PublicPathError('Public path contains ambiguous encoding');
  }

  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (_) {
    throw new PublicPathError('Public path contains malformed encoding');
  }

  if (
    decoded.includes('\0') ||
    decoded.includes('\\') ||
    decoded.includes('//') ||
    decoded.split('/').some(segment => segment === '.' || segment === '..')
  ) {
    throw new PublicPathError('Public path is not canonical');
  }
  return decoded || '/';
}

function isRegisteredEntrypoint(pathname) {
  let normalized;
  try {
    normalized = normalizePublicPath(pathname);
  } catch (_) {
    return false;
  }
  return EXACT_ENTRYPOINTS.has(normalized) || SPOTLIGHT_ENTRYPOINT.test(normalized);
}

function isHttpAllowed({ method, pathname }) {
  const normalizedMethod = String(method || '').toUpperCase();
  let normalizedPath;
  try {
    normalizedPath = normalizePublicPath(pathname);
  } catch (_) {
    return false;
  }

  if (
    (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') &&
    isRegisteredEntrypoint(normalizedPath)
  ) {
    return true;
  }

  return HTTP_RULES.some(candidate => (
    candidate.methods.has(normalizedMethod) &&
    candidate.matcher(normalizedPath)
  ));
}

function isIncomingSocketEventAllowed(eventName) {
  return typeof eventName === 'string' && INCOMING_SOCKET_EVENTS.has(eventName);
}

function isOutgoingSocketEventAllowed(eventName) {
  return typeof eventName === 'string' && OUTGOING_SOCKET_EVENTS.has(eventName);
}

function listPublicEntrypoints() {
  return [...ENTRYPOINTS];
}

function isForbiddenPublicKey(key) {
  const normalized = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  if (FORBIDDEN_PUBLIC_KEYS.test(normalized)) return true;
  return normalized.split(/[^a-z0-9]+/).some(part => (
    ['secret', 'password', 'credential', 'cookie'].includes(part)
  ));
}

function redactPublicPayload(value) {
  const seen = new WeakSet();

  const visit = current => {
    if (
      current === null ||
      typeof current === 'string' ||
      typeof current === 'boolean'
    ) {
      return current;
    }
    if (typeof current === 'number' && Number.isFinite(current)) {
      return current;
    }
    if (!current || typeof current !== 'object') {
      throw new TypeError('Public payload must contain JSON values only');
    }
    if (seen.has(current)) {
      throw new TypeError('Public payload must not contain cycles');
    }

    const prototype = Object.getPrototypeOf(current);
    if (!Array.isArray(current) && prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Public payload must contain plain JSON objects only');
    }

    seen.add(current);
    let result;
    if (Array.isArray(current)) {
      result = current.map(visit);
    } else {
      result = {};
      for (const [key, nested] of Object.entries(current)) {
        if (!isForbiddenPublicKey(key)) {
          result[key] = visit(nested);
        }
      }
    }
    seen.delete(current);
    return result;
  };

  return visit(value);
}

module.exports = {
  PublicPathError,
  FORBIDDEN_PUBLIC_KEYS,
  INCOMING_SOCKET_EVENTS,
  OUTGOING_SOCKET_EVENTS,
  normalizePublicPath,
  isRegisteredEntrypoint,
  isHttpAllowed,
  isIncomingSocketEventAllowed,
  isOutgoingSocketEventAllowed,
  listPublicEntrypoints,
  redactPublicPayload
};
