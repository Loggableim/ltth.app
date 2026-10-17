'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildObsCaptureInventory } = require('../lib/obs-docs-capture-inventory');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = path.join(ROOT, 'docs/coordination/obs-104-acceptance-matrix.json');
const PLAN = path.join(ROOT, 'docs/coordination/obs-pruefplan.md');
const SOURCE_INVENTORY = path.join(ROOT, 'docs/coordination/obs-104-source-inventory.json');
const PILOT_ORDER = ['stt-ticker', 'spotlight', 'goals', 'music-bot'];

// Contracts below were read against the actual overlay entrypoint and its
// client/backend event contract. Unknown producer details stay explicit blockers.
const PROFILES = Object.freeze({
  chatango: {
    entry: 'Retirement control for /plugins/chatango/ui.html; no current dedicated renderer exists.',
    initial: 'The historical target is absent from the current plugin tree; it was a settings/integration page, not a verified OBS renderer.',
    trigger: { event: null, payload: null },
    update: 'No rendered update is expected. The control records that this historical target remains absent.',
    negative: 'The target must remain absent/404; do not load an external Chatango embed or create a replacement renderer in this task.',
    cleanup: 'No OBS source or product route is started for a retirement control.',
    fixtureStatus: 'retired-control-not-obs',
    retirementEvidence: 'app/test/chatango-backend-removal.test.js',
    visualReview: 'not-applicable-no-renderer',
    gpu: 'none', audio: 'none', external: 'External Chatango embed is intentionally not loaded.',
    risk: 'This row preserves the historical 104-case denominator but is not a renderer or a practical OBS pass.',
    blocker: 'No current plugin manifest, main.js, ui.html or dedicated overlay renderer exists; owner decision required before any replacement scope.',
    evidence: 'Current source absence and route/registry denial only; no Browser Source evidence.'
  },
  'advanced-timer': {
    entry: 'app/plugins/advanced-timer/overlay/index.html → overlay/overlay.js',
    initial: 'The guide requires ?timer=non-empty; fixture URL uses a reserved synthetic timer id and a fake same-origin response, with no timer record or backend.',
    trigger: { event: 'advanced-timer:tick', payload: { id: 'fixture-timer-1', currentValue: 89, state: 'running' } },
    update: 'Only matching data.id updates the timer value/state; the visible countdown must move to 01:29 after a seeded 90-second timer.',
    negative: 'Missing timer query produces the source-defined missing-timer diagnostic; nonexistent id must show timer-not-found, not a fabricated active timer.',
    cleanup: 'Close the fixture-owned socket and JSDOM window; verify no rotator interval started and no persistent timer state was touched. Product overlay exposes no explicit pagehide cleanup hook.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/test/obs-timer-goals-renderer-fixtures.test.js',
    gpu: 'none', audio: 'none', external: 'none in entrypoint; local i18n and Socket.IO scripts.',
    risk: 'Guide postcondition requires a timer query id; use fixture-timer-{locale} against fake HTTP/socket endpoints only. No database/API seed.',
    queryContract: 'timer=fixture-timer-{locale} (synthetic fixture only)',
    evidence: 'HTTP/console, missing-id frame, seeded 01:30→01:29 frames, matching and nonmatching timer IDs, unload cleanup; runtime integration and image review.'
  },
  clarityhud: {
    entry: 'app/plugins/clarityhud/overlays/full.html → overlays/full.js',
    initial: 'Full feed starts with empty event arrays; settings and initial state are loaded from /api/clarityhud/settings/full and /api/clarityhud/state/full before render.',
    trigger: { event: 'clarityhud.update.chat', payload: { username: 'Pilot Viewer', comment: 'Synthetic HUD fixture', message: 'Synthetic HUD fixture' } },
    update: 'With showChat enabled, one synthetic chat enters the feed and is rendered by the full-layout event card.',
    negative: 'Return 503 for the initial settings request; source retries up to three times and shows its explicit initialization failure state.',
    cleanup: 'Close source; remove socket listeners and verify retry timers stop. Do not persist fixture settings or events.',
    gpu: 'DOM/CSS; no WebGL.', audio: 'none', external: 'OpenDyslexic CSS is referenced from jsDelivr; block or replace with local fallback for isolated run.',
    risk: 'Initial-state API plus large settings object; synthetic user/avatar data only. External font request must be denied/recorded.',
    blocker: 'Need seed of full settings/state response and a verified offline font fallback before isolated image evidence.',
    evidence: 'Empty baseline, one chat card, 503/recovery, socket disconnect, request log proving CDN blocked, console and image review.'
  },
  coinbattle: {
    entry: 'app/plugins/coinbattle/overlay/overlay.html → overlay/overlay.js',
    initial: 'Client state is inactive with default team labels/config; match panels are not a running battle until coinbattle:match-state arrives.',
    trigger: { event: 'coinbattle:match-state', payload: { active: true, match: { id: 'fixture-match-1', status: 'active' }, leaderboard: [], teamScores: { red: 1, blue: 0 } } },
    update: 'handleMatchState renders the active match snapshot; verify timer/team/score regions follow the provided synthetic state.',
    negative: 'Send malformed state without an active match and a separate disconnected-socket case; renderer must not expose stale winner/timer values.',
    cleanup: 'Emit a final inactive state, close source, clear match/multiplier/winner timers, and prove no persisted coin/balance mutation.',
    gpu: 'DOM/CSS animations.', audio: 'none in overlay entrypoint.', external: 'No external script/link refs; user avatar URLs may be data-dependent.',
    risk: 'Backend has coin/accounting and game side effects; never start it. Use synthetic Socket.IO fixture payload only; no coins or viewers.',
    blocker: 'Sample state is listener-shaped; confirm every nested match/leaderboard field against engine-produced snapshot before practical fixture run.',
    evidence: 'Inactive baseline, synthetic active match, malformed/disconnect state, score/timer text and image review, timer cleanup, proof backend was absent.'
  },
  'emoji-rain': {
    entry: 'GET /emoji-rain/obs-hud → app/plugins/emoji-rain/obs-hud.html → app/public/js/emoji-rain-obs-hud.js',
    initial: 'Use fake GET config and user-mappings responses, with enabled and obs_hud_enabled true. The source begins with an empty transparent canvas; the #perf-hud and #resolution-indicator diagnostics are hidden by default. Keep this empty baseline distinct from pixel/effect proof.',
    trigger: {
      event: 'emoji-rain:spawn',
      payloadStatus: 'source-confirmed-minimal-fixture',
      payload: { count: 1, emoji: '💙', x: 0.5, y: 0.15, username: 'Pilot Viewer', profilePictureUrl: null, reason: 'manual', source: 'manual', burst: false, intensity: 1 }
    },
    update: 'With rate limiting disabled in the fake config, the actual HUD handler receives one source-produced spawn payload and schedules one emoji; emoji-rain:clear returns it to the empty state. Any pixel claim still requires a real isolated renderer capture.',
    negative: 'Return disabled config and verify spawn is ignored. Reject invalid, non-finite, out-of-range or extra-field opacity payloads without changing container opacity. Delay the initial GET response until after a newer opacity event and verify it cannot overwrite that event; on reconnect verify a fresh GET wins over an older outstanding read.',
    cleanup: 'Send the existing emoji-rain:clear event and close the isolated source; verify the renderer loop/socket stops. No plugin backend, preset, user mapping, or config file may be created.',
    readGetContracts: [
      { method: 'GET', path: '/api/emoji-rain/config', rendererCalls: true, response: '{success:true,config:{enabled:true,obs_hud_enabled:true,rate_limit_enabled:false}}' },
      { method: 'GET', path: '/api/emoji-rain/user-mappings', rendererCalls: true, response: '{success:true,mappings:{},stats:{totalMappings:0,uniqueEmojis:0}}' },
      { method: 'GET', path: '/api/emoji-rain/overlay/state', rendererCalls: true, response: '{success:true,state:{opacity:0.35}}', contract: 'Existing GET handler returns only overlayState.opacity; public registry allows GET/HEAD. The HUD reads this on initialization and reconnect and applies it to #canvas-container, with newer socket values taking precedence.' }
    ],
    opacityCheck: { event: 'emoji-rain:opacity', payload: { opacity: 0.35 }, producer: 'POST /api/emoji-rain/overlay/opacity updates in-memory state and emits this event.', rendererConsumes: true, expected: 'The existing socket handler sets #canvas-container.style.opacity to 0.35 for all contained particle layers; diagnostics outside the container remain independent. Default is 1, and 0 hides particles without stopping physics. A visible particle before/after change still requires actual renderer capture and independent image review.' },
    gpu: 'Matter.js physics and DOM sprites; no WebGL in the served HUD.', audio: 'none', external: 'Local i18n client, Matter.js and OBS HUD script only.',
    risk: 'Normal plugin startup can migrate/persist user state. Use fake GET responses and the actual source producer method with a no-write API double; no plugin constructor, DB, upload directory, or user data.',
    obsStatus: 'not-run',
    visualReview: 'pending',
    evidence: 'Source-backed route/producer/GET contract, empty transparent baseline, one synthetic spawn and clear plan, config-disabled and invalid-opacity negatives, late GET/event race and reconnect checks, exact request/event log, visible particle opacity capture and independent image review. DOM fixtures alone are not pixel or OBS proof.'
  },
  fireworks: {
    entry: 'app/plugins/fireworks/overlay.html → gpu/engine.js',
    initial: 'Idle particle canvas with renderer/debug metrics; no firework until a trigger arrives.',
    trigger: { event: 'fireworks:trigger', payloadStatus: 'source-confirmed-minimal-fixture', payload: { id: 'fixture-firework-{locale}', timestamp: 1, type: 'burst', shape: 'burst', colors: ['#ff4500', '#ffd700'], position: { x: 0.25, y: 0.4 }, intensity: 0.5, particleCount: 12, requestedParticleCount: 12, tier: 'small', username: 'FixtureViewer', coins: 10, combo: 1, playSound: false, giftPopupEnabled: true, giftPopupPosition: 'bottom' } },
    update: 'The renderer creates one bounded firework at the source-backed position and displays the localized synthetic gift card; audio and network remain disabled.',
    negative: 'Invalid position/intensity and simulated WebGL context loss must be rejected or fall back without an uncaught error.',
    cleanup: 'Wait for bounded effect lifetime, destroy renderer/source, release WebGL resources and verify active count/timers reach zero.',
    gpu: 'WebGL with Canvas fallback; GPU/context-loss path required.', audio: 'none', external: 'Local JS only.',
    risk: 'GPU availability/context loss and particle CPU use; use low-intensity, low-particle fixture only.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/test/obs-priority-trigger-renderer-fixtures.test.js',
    sourceFixtureEvidence: 'Original overlay HTML and gpu/engine.js with in-memory Socket.IO; producer-shaped fireworks:trigger creates one Firework and a locale-specific textContent gift card. Fake audio is disabled; fetch is denied; test-only init skips GPU/audio startup.',
    blocker: 'Browser Source/OBS rendering and independent image review remain untested.',
    evidence: 'Eight locale-specific event-to-renderer tests across Flame/Fireworks; Fireworks assertion checks one synthetic firework, target coordinates, localized gift-card text, no network/audio, and zero renderer errors.'
  },
  'flame-overlay': {
    entry: 'app/plugins/flame-overlay/renderer/index.html → effects-engine.js',
    initial: 'Canvas renderer loads default configuration; configured effect can start immediately, so initial frame must be recorded before any trigger.',
    trigger: { event: 'flame-overlay:trigger', payload: { id: 'fixture-flame-{locale}', type: 'intensity-boost', amount: 0.5, duration: 5000, revert: true, source: 'gift:100' }, payloadStatus: 'source-confirmed-minimal-fixture' },
    update: 'The renderer applies the producer-shaped intensity-boost to its flame shader configuration and records the updated uniform input; clear-triggers returns to the configured baseline.',
    negative: 'Send unsupported effect type and verify safe fallback/no throw; separately deny config update.',
    cleanup: 'Send clear-triggers, destroy renderer on unload, and verify animation loop, socket handlers, and textures/resources are released.',
    gpu: 'Canvas-based effects; no confirmed WebGPU requirement.', audio: 'none', external: 'Local config/renderer assets only.',
    risk: 'Default effect may animate before trigger; fixed seed/time control is needed for deterministic captures.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/test/obs-priority-trigger-renderer-fixtures.test.js',
    sourceFixtureEvidence: 'Original renderer/effects-engine.js with fake config GET and in-memory socket; type/amount/duration/revert/source match flame-overlay main.js dispatchTrigger output for the gift 100 rule. Assertion checks active trigger, increased flameIntensity, and the values passed to the uniform update path.',
    blocker: 'WebGL pixels, Browser Source/OBS rendering, and independent image review remain untested.',
    evidence: 'Eight locale-specific event-to-renderer tests across Flame/Fireworks; Flame asserts source-shaped event updates active trigger, flame intensity and uniform input without backend or network.'
  },
  'game-engine': {
    entry: 'app/plugins/game-engine/overlay/game-hud.html',
    initial: 'Queries /api/game-engine/active-session; with no active session the HUD must remain idle/hidden.',
    trigger: { event: 'game-engine:game-started', payload: { sessionId: 'fixture-session-1', gameType: 'connect4', state: { board: [], currentPlayer: 1, players: [] }, interactive: true } },
    update: 'The HUD records sessionId/gameType and renders data.state; a matching game-ended event clears the active session.',
    negative: '404/empty active-session response and a game-ended event for a different session must not render stale board data.',
    cleanup: 'Emit matching game-ended, clear the game-time interval, disconnect fixture socket, and verify no game/accounting backend ran.',
    gpu: 'DOM/SVG game boards; no WebGL required.', audio: 'none in the HUD entrypoint.', external: 'Same-origin API and Socket.IO.',
    risk: 'Engine can mutate game/coin state; use fake socket and fake active-session response only; no game engine instance.',
    blocker: 'The exact complete state object varies by game type; choose a fixture with a source-backed connect4 state before practical capture.',
    evidence: 'Idle, one synthetic started/move/ended sequence, unrelated-session negative, timer/listener cleanup, screenshots and console.'
  },
  goals: {
    entry: 'app/plugins/goals/overlay/index.html → overlay/overlay.js',
    initial: 'The guide requires ?id=non-empty; fixture URL uses a reserved synthetic goal id and fake Socket.IO responses, without invoking GoalsWebSocket or its database.',
    trigger: { event: 'goals:subscribed', payload: { goalId: 'fixture-goal-1', goal: { id: 'fixture-goal-1', title: 'Synthetic goal', target: 10 }, state: { state: 'active', progress: 4 } } },
    update: 'After a valid id subscription, matching goals:value-changed updates goal/state/progress; wrong goalId is ignored.',
    negative: 'Missing id and goals:error/goal-not-found must leave no fabricated progress.',
    cleanup: 'Close the fixture-owned socket and JSDOM window; verify the deterministic animation timeout settles, no event arrives after teardown, and no goal row/DB write exists. Product overlay exposes no explicit unsubscribe/pagehide hook.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/test/obs-timer-goals-renderer-fixtures.test.js',
    gpu: 'SVG/DOM progress visualization.', audio: 'none', external: 'Same-origin Socket.IO; no external static assets.',
    risk: 'Production subscribe handler looks up the id in persistent storage; fixture must intercept goals:subscribe and emit synthetic responses without backend/database.',
    queryContract: 'id=fixture-goal-{locale} (synthetic fixture only)',
    evidence: 'Missing-id diagnostic, fixture id initial state, update and wrong-id negative, unsubscribe and image review.'
  },
  'interactive-story': {
    entry: 'app/plugins/interactive-story/overlay.html',
    initial: 'Story layers await config/participant/position responses and chapter events; no story content is seeded by the static URL.',
    trigger: { event: 'story:chapter-ready', payload: { id: 'fixture-chapter-1', title: 'Pilot chapter', content: 'Synthetic chapter text for overlay review.' } },
    update: 'The current chapter title/content and story image/title layer update; no vote or TTS event is sent in this visual check.',
    negative: 'Return an empty config/participants payload and emit image-generation-failed; visible fallback must remain readable and not retain a prior chapter.',
    cleanup: 'Emit story:ended, unload, and verify DOM listeners/socket timers are removed; never invoke provider, image generation, or TTS playback.',
    gpu: 'DOM/CSS, no GPU renderer.', audio: 'TTS playback listeners exist; keep them silent and do not emit playback events.', external: 'Same-origin APIs/Socket.IO; image URLs in payload require local fixture assets.',
    risk: 'Provider/image/TTS paths are high-risk; only socket fixture with local synthetic chapter and local image is permitted.',
    blocker: 'Confirm required chapter fields from _prepareChapterForEmit before using the candidate payload; no generation or TTS backend.',
    evidence: 'Empty baseline, synthetic chapter, failure state, no provider/network/audio, event cleanup, console and image review.'
  },
  'milestone-leaderboard': {
    entry: 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html',
    initial: 'GET /overlay/viewer-xp/leaderboard serves the vendored template; on load it requests viewer-xp:public-leaderboard with bounded limit/days; empty array is a valid empty state.',
    trigger: { event: 'viewer-xp:public-leaderboard', payload: [{ username: 'Fixture Viewer', name_color: '#2468ac', title: 'Fixture title', xp: 120, level: 2, rank: 1 }], payloadStatus: 'source-confirmed-minimal-fixture' },
    update: 'The actual renderer displays only public username/color/title/level/xp/rank fields; viewer-xp:public-update schedules a refresh and public-level-up requests immediately.',
    negative: 'Empty, malformed and recovered responses replace prior rows; markup in public username/title stays text and invalid colors fall back to white; IDs/raw profile/settings never enter DOM.',
    cleanup: 'On non-persisted pagehide all three renderer clients disconnect their socket and clear owned timers; late callbacks are ignored. Persisted BFCache pages remain active; no DB writes.',
    gpu: 'DOM/CSS.', audio: 'none', external: 'Same-origin Socket.IO and allowlisted HTML/i18n assets only; fake profile values and no profile image/network request.',
    risk: 'Viewer data is privacy-sensitive; use only synthetic public fields, no plugin initialization, database, IDs, coins or real profile data.',
    blocker: 'No OBS Browser Source, captured image or independent visual review has been run; BFCache restore is covered only by the in-process fixture.',
    evidence: 'Real GET/registry/socket source contract, direct handler doubles, three actual renderer scripts, empty/update/error/recovery, hostile display text, invalid style fallback, private-field scan and pending lifecycle.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js',
    sourceFixtureEvidence: 'Actual XP-bar/leaderboard/level-up HTML, shared i18n client and Viewer-XP i18n bridge with all four locale dictionaries; real public handler and producer doubles/projections; malformed markup, recovery, no-private-DOM, persisted pagehide/pageshow and final-hide late-callback assertions. Locale fetches are local stubs; no DB/plugin init/network/live activity.',
    obsStatus: 'not-run',
    visualReview: 'pending'
  },
  'minecraft-connect': {
    entry: 'app/plugins/minecraft-connect/overlay/minecraft_overlay.html → overlay/minecraft_overlay.js',
    initial: 'Overlay starts hidden until minecraft-connect:overlay-show arrives.',
    trigger: { event: 'minecraft-connect:overlay-show', payload: { username: 'Pilot Viewer', message: 'Synthetic connection notice', timestamp: 1 } },
    update: 'Synthetic connection notice becomes visible; source-defined hide timer returns it to hidden state.',
    negative: 'Missing username/invalid message must not render markup or start Minecraft/network integration.',
    cleanup: 'Wait only the shortened fixture hide timer, unload and clear it; do not start Minecraft server/client or command handler.',
    gpu: 'DOM/CSS.', audio: 'none', external: 'No static external refs; icons/images require local data.',
    risk: 'Real plugin can communicate with Minecraft; isolate at event projection and never instantiate the connector.',
    blocker: 'Payload field contract and hide duration should be checked against overlay source before a practical fixture.',
    evidence: 'Hidden baseline, visible synthetic notice, auto-hide, invalid payload and absence of connector process/network.'
  },
  'music-bot': {
    entry: 'app/plugins/music-bot/overlay.html',
    initial: 'Connects and requests current status; null now-playing and empty queue are the expected empty baseline.',
    trigger: { event: 'musicbot:now-playing', payload: { playbackId: 'fixture-playback-1', title: 'Synthetic preview track', artist: 'Local Fixture', duration: 90, currentTime: 12, isPlaying: true } },
    update: 'Current-track widget displays title/artist and progress; paused/resumed/queue-update events alter only overlay view.',
    negative: 'Null now-playing and disconnected socket return to empty/disconnected status; no player or URL may be started.',
    cleanup: 'Disconnect fixture socket and cancel visual progress timers; never instantiate MusicBotPlugin, Resolver, queue, or MPV.',
    gpu: 'DOM/CSS.', audio: 'Overlay does not play audio; live Music Bot audio is expressly out of this visual fixture.', external: 'Track artwork/avatar URLs could be remote; use local placeholder only.',
    risk: 'Resolver, queue and playback can start external processes; only fake Socket.IO events and local artwork.',
    blocker: 'Confirm full now-playing field projection against _buildNowPlayingPayload and overlay renderer before fixture run.',
    evidence: 'Empty and synthetic track frames, progress/paused state, null/disconnect negative, no MPV/yt-dlp process, image review.'
  },
  openshock: {
    entry: 'app/plugins/openshock/overlay/openshock_overlay.html → overlay/openshock_overlay.js',
    initial: 'The real overlay template starts with an empty hidden event card; only the synthetic fixture config GET is answered.',
    trigger: { event: 'openshock:command-sent', payload: { command: { type: 'vibrate', intensity: 35, duration: 1200 }, deviceName: 'Fixture Device', username: 'Fixture Viewer', source: 'gift' } },
    update: 'The original renderer displays the synthetic command summary in text nodes; it performs no device command or mutation.',
    negative: 'Markup-like device/user strings remain text; private IDs/API-key/pattern metadata are not projected to the display or error log; no route beyond config is fetched.',
    cleanup: 'BFCache hide/show preserves the socket; final pagehide detaches handlers, cancels owned timers, disconnects once, and ignores a captured late callback.',
    gpu: 'DOM/CSS only.', audio: 'none in overlay event renderer.', external: 'No external provider request; synthetic config GET only.',
    risk: 'Renderer handles the visual summary of a hardware command; isolated tests must never invoke the plugin/provider or emit a command.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/plugins/openshock/test/obs-primary-overlay-fixture.test.js',
    sourceFixtureEvidence: 'Original primary overlay HTML and JS with in-memory Socket.IO, fake config GET, disabled external scripts, locale-derived emergency text, markup-like synthetic display strings, and no plugin/backend/provider/device process.',
    obsStatus: 'NOT_TESTED',
    visualReview: 'pending',
    evidence: 'de/en/es/fr: hidden empty baseline, synthetic command summary, safe text rendering, no private data/action, localized emergency notice, BFCache preservation and final cleanup. This is JSDOM evidence only.'
  },
  'quiz-show': {
    entry: 'app/plugins/quiz-show/quiz_show_overlay.html → quiz_show_overlay.js',
    initial: 'State machine enters IDLE and hides overlay; on load it requests local HUD config/brand-kit/state/layout.',
    trigger: { event: 'quiz-show:state-update', payload: null },
    update: 'A valid RUNNING question state reveals question/answers and round/category; no answer submission or chat interaction is sent.',
    negative: 'Malformed/idle state hides overlay; suppress quiz-show:play-sound to avoid audio playback.',
    cleanup: 'Emit quiz-show:stopped, clear state/timer animation, unload listeners; do not start quiz/game/GCCE.',
    gpu: 'DOM/CSS.', audio: 'Sound playback listener exists; block it and capture muted.', external: 'Same-origin API/Socket.IO; image assets must be local.',
    risk: 'Quiz actions can include joker/chat/game effects; mock read-only state and fake events only.',
    blocker: 'Capture exact state-update shape from the quiz controller/test fixture; current candidate intentionally lacks a guessed payload.',
    evidence: 'Idle frame, valid question frame, invalid/idle state, no sound call, timer/listener cleanup, image review.'
  },
  schnorrbecher: {
    entry: 'app/plugins/schnorrbecher/overlay/coincup.html → overlay/coincup.js',
    initial: 'Client requests coinJar.sync on connect; initial counter/config comes from server projection.',
    trigger: { event: 'coinJar.add', payload: null },
    update: 'One synthetic coin animation increments visual jar count; reset event returns count to zero.',
    negative: 'Empty sync and invalid add payload must not add coins or trigger external effect.',
    cleanup: 'Mute Browser Source audio, send coinJar.reset, stop Matter.js runner and unload listeners; no persistence/account balance.',
    gpu: 'Matter.js physics and DOM/CSS; no WebGL.', audio: 'Local impact audio element exists; must stay muted for acceptance.', external: 'Local Matter.js and local asset paths only.',
    risk: 'Real plugin credits coins and may launch connected actions; fixture must be socket-only with in-memory display state.',
    blocker: 'Confirm coinJar.add exact producer payload and sync count shape; never use real gift/coin event.',
    evidence: 'Zero baseline, one synthetic coin, reset, muted audio, malformed payload, process/listener cleanup and image review.'
  },
  spotlight: {
    entry: 'app/plugins/spotlight/overlays/chatter.html → overlays/single-overlay.js',
    initial: 'On connect loads /api/lastevent/settings/chatter and /api/lastevent/last/chatter; null user renders empty state.',
    trigger: { event: 'lastevent.update.chatter', payload: { sessionId: 'fixture-session', nickname: 'Pilot Viewer', username: 'pilot-viewer' } },
    update: 'A current-session user replaces empty display with the chatter template; stale session updates are ignored.',
    negative: '404/503/null user and stale session id leave safe empty display; no external avatar URL.',
    cleanup: 'Disconnect stops refresh timer; unload cancels animations and refresh loop.',
    gpu: 'DOM/CSS animation.', audio: 'none', external: 'Local fonts/assets; dynamic avatar URL must be local placeholder.',
    risk: 'Real last-event data may expose viewers; use synthetic response and session only.',
    blocker: 'Confirm renderer-required public user keys/template fields before practical fixture and ensure no sensitive handle leaks.',
    evidence: 'Empty→synthetic chatter→stale-session negative, API error, no private identifiers, disconnect/timer cleanup.'
  },
  'stream-monsters': {
    entry: 'app/plugins/stream-monsters/streammonsters-overlay.html → overlay runtime/view modules',
    initial: 'Fetches locales/audio manifest and /api/stream-monsters/state; exact visible baseline depends on isolated creator/season/encounter seed.',
    trigger: { event: 'streammonsters:config_updated', payload: null },
    update: 'Configuration refresh is followed by state refetch; a synthetic idle/egg or encounter state should update corresponding arena panel.',
    negative: 'Unavailable state/locale/audio manifest must yield explicit fallback, not create a season or mutate progression.',
    cleanup: 'pagehide/beforeunload sends overlay heartbeat cleanup and destroys render/audio/arena timers; audio disabled.',
    gpu: 'Canvas/effects renderer; verify GPU path and fallback.', audio: 'Local audio engine/manifest exists; keep playback disabled.', external: 'Same-origin state/API, locale and audio manifest; synthetic local assets only.',
    risk: 'High: progression, eggs, seasons and game state are persistent; use Docs-Capture seed-only DB and no normal runtime.',
    blocker: 'Need complete current state/seed contract; route may call season/progression code outside Docs-Capture. Do not use a generic state fixture.',
    evidence: 'Seedless and seeded-state frames, season rows unchanged, no audio, API/asset failures, full timer/heartbeat cleanup, image review.'
  },
  'stt-ticker': {
    entry: 'app/plugins/stt-ticker/overlay/ticker.html',
    initial: 'Three classic line slots start empty; no microphone/provider is opened by the overlay itself.',
    trigger: { event: 'stt-ticker:transcript', payload: { text: 'Synthetic caption fixture.' } },
    update: 'Classic ticker displays the synthetic text; stt-ticker:clear removes it. Multi/dual branches are separate follow-up cases.',
    negative: 'Empty text, missing data, and disconnect preserve a safe empty ticker.',
    cleanup: 'Emit clear, unload mutation observer/listeners, disconnect; do not start STT backend, microphone, Deepgram, or TTS.',
    gpu: 'CSS/DOM only.', audio: 'none', external: 'Same-origin Socket.IO and local i18n.',
    risk: 'STT/TTS credentials and audio capture are out of scope; renderer fixture supplies synthetic text only.',
    blocker: null,
    evidence: 'Empty baseline, one synthetic caption, clear and invalid/empty payload, proof no mic/provider, socket cleanup and image review.'
  },
  'talking-heads': {
    entry: 'app/plugins/talking-heads/overlay.html → assets/overlay.js',
    initial: 'Stage is idle until avatar/animation socket event and config fetch complete.',
    trigger: { event: 'talkingheads:animation:start', payload: null },
    update: 'A source-valid animation start/frame changes stage/avatar position; end restores idle stage.',
    negative: 'Unknown avatar/asset or malformed frame displays idle fallback without retaining prior animation.',
    cleanup: 'Emit animation:stop/end and pagehide; stop animation frame loops and disconnect.',
    gpu: 'DOM/CSS sprite animation.', audio: 'none in overlay asset.', external: 'Same-origin config/socket; avatar asset may be profile-backed.',
    risk: 'Avatar/profile migration and asset assignment are excluded; use existing isolated fixture asset only.',
    blocker: 'Keep product untouched; confirm a non-profile synthetic avatar fixture and exact event payload before practical run.',
    evidence: 'Idle, synthetic animation and stop frames, no profile changes, asset fallback, animation cleanup and image review.'
  },
  toptier: {
    entry: 'app/plugins/toptier/overlay.html → assets/overlay.js',
    initial: 'Query parameter selects board; client emits toptier:get-board for likes/gifts and renders empty entries for inactive board.',
    trigger: { event: 'toptier:update', payload: { board: 'likes', entries: [{ username: 'fixture-liker', nickname: 'Fixture Liker', profile_picture_url: '', score: 42, rank: 1 }], sessionId: 'fixture-session-a' }, payloadStatus: 'source-confirmed-minimal-fixture' },
    update: 'Matching board entries replace its data and render rank/score; other board payloads are ignored.',
    negative: 'Inactive empty boards render the default empty state; invalid board IDs and malformed board/entry payloads are ignored.',
    cleanup: 'pagehide disconnects the owned socket and cancels spotlight/score-tick timers; queued events are inert. No TopTier session/database writes.',
    gpu: 'DOM/CSS.', audio: 'none', external: 'No external refs; fixture profile_picture_url is empty and avatars are disabled.',
    risk: 'Real ranking data is user data; all records synthetic and session scoped.',
    blocker: 'No Browser Source/OBS capture or independent visual review has been run.',
    fixtureStatus: 'in-process-renderer-fixture-passed-not-obs',
    fixtureTest: 'app/plugins/toptier/test/obs-toptier-fixtures.test.js',
    sourceFixtureEvidence: 'Actual overlay template + renderer + i18n client; four local locale dictionaries; direct GET/socket handler doubles; ScoreEngine._emitUpdate synthetic likes/gifts; malformed payload and pagehide cleanup assertions. No DB/plugin init/network/profile assets.',
    obsStatus: 'not-run',
    visualReview: 'pending',
    evidence: 'Four locale title states, empty/inactive board, actual synthetic score updates, wrong-board/malformed negatives, GET errors and idempotent timer/socket cleanup.'
  },
  'visual-fx-frame-webgpu': {
    entry: 'app/plugins/visual-fx-frame-webgpu/renderer/index.html → overlay-controller.js',
    initial: 'Boot fetches /api/visual-fx-frame-webgpu/config then initializes WebGPU engine; config failure falls back to VISUAL_FX_DEFAULT_CONFIG.',
    trigger: { event: 'visual-fx-frame-webgpu:trigger', payload: null },
    update: 'Valid trigger creates configured frame effect; clear-triggers restores idle canvas.',
    negative: 'WebGPU unavailable or config 503 reports renderer error/fallback in debug state without throwing uncaught.',
    cleanup: 'pagehide calls engine.destroy; verify adapter/device/resources released and socket disconnected.',
    gpu: 'WebGPU mandatory in primary engine; document fallback if unsupported.', audio: 'none', external: 'Same-origin config/socket and local GPU scripts.',
    risk: 'GPU adapter/device availability and variable frame timing; use fixed low-complexity config.',
    blocker: 'Exact trigger schema and browser fallback behavior require source contract/test confirmation; candidate payload withheld.',
    evidence: 'Default and trigger frames, config failure, unsupported GPU, renderer status, resource destruction and image review.'
  },
  'weather-control': {
    entry: 'app/plugins/weather-control/overlay.html → weather-engine.js',
    initial: 'Loads local weather config and gamification state; canvas is idle until weather:trigger.',
    trigger: { event: 'weather:trigger', payload: null },
    update: 'A valid bounded effect event changes canvas/weather scene; weather:stop returns baseline.',
    negative: 'Empty/invalid config and disconnected socket leave transparent/idle scene; never call weather provider.',
    cleanup: 'Send weather:stop, unload and verify animation/audio timers and socket reconnect loop stop.',
    gpu: 'Canvas 2D effects.', audio: 'Sound effects supported by overlay; mute audio output.', external: 'Same-origin config/gamification API; no external static assets.',
    risk: 'Config may enable live event gamification; no backend or persisted state, synthetic renderer event only.',
    blocker: 'Exact weather:trigger payload and engine stop semantics must be sourced before fixture injection.',
    evidence: 'Idle, synthetic weather, stop, denied config API, muted audio, no provider and cleanup.'
  },
  'webgpu-emoji-rain': {
    entry: 'app/plugins/webgpu-emoji-rain/overlay.html → gpu/engine.js',
    initial: 'WebGPU engine starts enabled with empty queues; debug state distinguishes ready/fallback.',
    trigger: { event: 'webgpu-emoji-rain:spawn', payload: { type: 'like', username: 'Pilot Viewer', count: 1, x: 0.5, y: 0.15, duration: 1200 } },
    update: 'One GPU sprite appears; clear event empties effects; WebGPU unavailable follows explicit fallback hint.',
    negative: 'Invalid normalized coordinates or unavailable GPU must be bounded and reported, not crash renderer.',
    cleanup: 'Clear events, pagehide/destroy engine, stop rate timer and release GPU resources.',
    gpu: 'WebGPU primary with renderer fallback handling.', audio: 'none', external: 'Local GPU scripts and Socket.IO.',
    risk: 'GPU and animation nondeterminism; low-rate single synthetic spawn only.',
    blocker: 'Confirm spawn schema and fallback contract from current GPU test fixtures before screenshot run.',
    evidence: 'Ready/idle, one spawn, clear, unsupported GPU/error state, bounds, timers/resources and image review.'
  },
  'webgpu-fireworks': {
    entry: 'app/plugins/webgpu-fireworks/overlay.html → gpu/engine.js',
    initial: 'WebGPU canvas initializes in idle state; socket registers an overlay instance and trigger admission is scope-gated.',
    trigger: { event: 'webgpu-fireworks:trigger', payload: null },
    update: 'Only a correctly scoped trigger is admitted and acknowledged; renderer produces one bounded burst.',
    negative: 'Missing/mismatched scope or expired benchmark admission must be rejected with reason and no effect.',
    cleanup: 'Destroy engine on pagehide, clear active/finale queue, release GPU resources and socket; no preview/audio invocation.',
    gpu: 'WebGPU; explicit admission/renderer status path.', audio: 'Audio engine exists; keep audio disabled/muted.', external: 'Local JS only.',
    risk: 'GPU, audio and benchmark/session scoping; only synthetic fixture scope with short admission may be used.',
    blocker: 'Scoped event schema and overlay registration response must be established from renderer tests; no guessed payload.',
    evidence: 'Idle, accepted scoped trigger, rejected scope/expiry, renderer status, audio muted and GPU cleanup.'
  },
  'webgpu-weather-control': {
    entry: 'app/plugins/webgpu-weather-control/overlay.html',
    initial: 'Initializes WebGPU engine then requests overlay config; config failure leaves transparent canvas. On connect emits client-ready and permanent-effects request.',
    trigger: { event: 'webgpu-weather:trigger', payload: null },
    update: 'Valid effect is rendered; stop/stop-effect clears it. Gamification HUD remains hidden unless config.overlay.enabled is true.',
    negative: 'Config 503 and unsupported WebGPU preserve transparent/error-safe state; no external provider call.',
    cleanup: 'Stop effects, cancel requestAnimationFrame and destroy GPU resources/socket on pagehide.',
    gpu: 'WebGPU framegraph/cinematic engine.', audio: 'none confirmed in overlay entrypoint.', external: 'Same-origin config and Socket.IO; local renderer scripts.',
    risk: 'WebGPU availability, config seed, and ongoing animation telemetry; synthetic only.',
    blocker: 'Trigger schema and engine destroy lifecycle need a source-backed fixture before practical run.',
    evidence: 'Transparent baseline, bounded effect, stop, API failure, HUD hidden/enabled state, telemetry stop and GPU release.'
  }
});

const ROUTE_SOURCES = Object.freeze({
  chatango: ['app/server.js', 'app/modules/public-overlay-registry.js', 'app/test/chatango-backend-removal.test.js'],
  'advanced-timer': ['app/plugins/advanced-timer/overlay/index.html', 'app/plugins/advanced-timer/overlay/overlay.js'],
  clarityhud: ['app/plugins/clarityhud/overlays/full.html', 'app/plugins/clarityhud/overlays/full.js', 'app/plugins/clarityhud/main.js'],
  coinbattle: ['app/plugins/coinbattle/overlay/overlay.html', 'app/plugins/coinbattle/overlay/overlay.js', 'app/plugins/coinbattle/main.js'],
  'emoji-rain': ['app/plugins/emoji-rain/obs-hud.html', 'app/public/js/i18n-client.js', 'app/public/js/matter.min.js', 'app/public/js/emoji-rain-obs-hud.js', 'app/plugins/emoji-rain/main.js', 'app/modules/public-overlay-registry.js'],
  fireworks: ['app/plugins/fireworks/overlay.html', 'app/plugins/fireworks/gpu/engine.js', 'app/plugins/fireworks/main.js'],
  'flame-overlay': ['app/plugins/flame-overlay/renderer/index.html', 'app/plugins/flame-overlay/renderer/effects-engine.js', 'app/plugins/flame-overlay/main.js'],
  'game-engine': ['app/plugins/game-engine/overlay/game-hud.html', 'app/plugins/game-engine/main.js'],
  goals: ['app/plugins/goals/overlay/index.html', 'app/plugins/goals/overlay/overlay.js', 'app/plugins/goals/backend/websocket.js'],
  'interactive-story': ['app/plugins/interactive-story/overlay.html', 'app/plugins/interactive-story/main.js'],
  'milestone-leaderboard': ['app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/xp-bar.html', 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html', 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/level-up.html', 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-i18n.js', 'app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js', 'app/modules/public-overlay-registry.js'],
  'minecraft-connect': ['app/plugins/minecraft-connect/overlay/minecraft_overlay.html', 'app/plugins/minecraft-connect/overlay/minecraft_overlay.js', 'app/plugins/minecraft-connect/main.js'],
  'music-bot': ['app/plugins/music-bot/overlay.html', 'app/plugins/music-bot/main.js'],
  openshock: ['app/plugins/openshock/overlay/openshock_overlay.html', 'app/plugins/openshock/overlay/openshock_overlay.js'],
  'quiz-show': ['app/plugins/quiz-show/quiz_show_overlay.html', 'app/plugins/quiz-show/quiz_show_overlay.js'],
  schnorrbecher: ['app/plugins/schnorrbecher/overlay/coincup.html', 'app/plugins/schnorrbecher/overlay/coincup.js', 'app/plugins/schnorrbecher/main.js'],
  spotlight: ['app/plugins/spotlight/overlays/chatter.html', 'app/plugins/spotlight/overlays/single-overlay.js'],
  'stream-monsters': ['app/plugins/stream-monsters/streammonsters-overlay.html', 'app/plugins/stream-monsters/streammonsters-overlay-runtime.js', 'app/plugins/stream-monsters/backend/streammonsters/routes.js'],
  'stt-ticker': ['app/plugins/stt-ticker/overlay/ticker.html', 'app/plugins/stt-ticker/main.js'],
  'talking-heads': ['app/plugins/talking-heads/overlay.html', 'app/plugins/talking-heads/assets/overlay.js'],
  toptier: ['app/plugins/toptier/overlay.html', 'app/plugins/toptier/assets/overlay.js', 'app/plugins/toptier/backend/score-engine.js'],
  'visual-fx-frame-webgpu': ['app/plugins/visual-fx-frame-webgpu/renderer/index.html', 'app/plugins/visual-fx-frame-webgpu/renderer/overlay-controller.js', 'app/plugins/visual-fx-frame-webgpu/main.js'],
  'weather-control': ['app/plugins/weather-control/overlay.html', 'app/plugins/weather-control/main.js'],
  'webgpu-emoji-rain': ['app/plugins/webgpu-emoji-rain/overlay.html', 'app/plugins/webgpu-emoji-rain/gpu/engine.js', 'app/plugins/webgpu-emoji-rain/main.js'],
  'webgpu-fireworks': ['app/plugins/webgpu-fireworks/overlay.html', 'app/plugins/webgpu-fireworks/gpu/engine.js', 'app/plugins/webgpu-fireworks/main.js'],
  'webgpu-weather-control': ['app/plugins/webgpu-weather-control/overlay.html', 'app/plugins/webgpu-weather-control/main.js']
});

function buildMatrix(repoRoot = ROOT) {
  const sourceInventory = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/coordination/obs-104-source-inventory.json'), 'utf8'));
  const inventory = sourceInventory.items;
  if (!Array.isArray(inventory) || inventory.length !== 104) {
    throw new Error(`Expected the frozen OBS-104 source inventory, found ${inventory?.length || 0} cases`);
  }
  const checklist = JSON.parse(fs.readFileSync(path.join(repoRoot, 'docs/coordination/obs-104-readiness-checklist-20261007.json'), 'utf8'));
  const currentPublic = buildObsCaptureInventory(repoRoot, { baseUrl: 'http://127.0.0.1:3000' });
  const currentPublicIds = currentPublic.map(item => `${item.plugin}:${item.locale}`).sort();
  const checklistPublicIds = checklist.cases
    .filter(item => item.acceptanceScope === 'CURRENT_PUBLIC_OVERLAY_GUIDE')
    .map(item => item.caseId).sort();
  if (currentPublicIds.length !== 68 || currentPublicIds.join('\n') !== checklistPublicIds.join('\n')) {
    throw new Error('Current public guide IDs no longer match the public subset of the frozen 104-case scope');
  }
  const ids = inventory.map(item => `${item.plugin}:${item.locale}`);
  if (new Set(ids).size !== 104 || ids.some(id => !checklist.cases.some(item => item.caseId === id))) {
    throw new Error('The frozen 104-case inventory and current readiness checklist do not have exact unique case IDs');
  }
  const profiles = Object.fromEntries(Object.entries(PROFILES).map(([plugin, profile]) => [plugin, {
    ...profile,
    trigger: {
      ...profile.trigger,
      payloadStatus: !profile.trigger.event
        ? 'no-overlay-event-contract'
        : (!profile.trigger.payload ? 'unknown-payload-blocked' : (profile.trigger.payloadStatus || (profile.blocker ? 'candidate-requires-producer-confirmation' : 'source-confirmed-minimal-fixture')))
    },
    evidenceSources: ROUTE_SOURCES[plugin],
    sourceReview: 'reviewed-current-checkout; source and fixture contracts only; not a Browser Source/OBS pass'
  }]));
  const items = inventory.map((item) => {
    const profile = profiles[item.plugin];
    if (!profile) throw new Error(`Missing source-reviewed acceptance profile for ${item.plugin}`);
    const localeId = item.plugin === 'advanced-timer' ? `fixture-timer-${item.locale}` :
      item.plugin === 'goals' ? `fixture-goal-${item.locale}` : null;
    const trigger = localeId
      ? { ...profile.trigger, payload: item.plugin === 'goals'
        ? { ...profile.trigger.payload, goalId: localeId, goal: { ...profile.trigger.payload.goal, id: localeId } }
        : { ...profile.trigger.payload, id: localeId } }
      : (item.plugin === 'fireworks' || item.plugin === 'flame-overlay')
        ? { ...profile.trigger, payload: { ...profile.trigger.payload, id: `fixture-${item.plugin}-${item.locale}` } }
        : profile.trigger;
    const overlayUrl = new URL(item.overlayUrl);
    if (localeId) overlayUrl.searchParams.set(item.plugin === 'goals' ? 'id' : 'timer', localeId);
    const retiredControl = profile.fixtureStatus === 'retired-control-not-obs';
    return {
      caseId: `${item.plugin}:${item.locale}`,
      ...item,
      overlayUrl: overlayUrl.toString(),
      ...profile,
      trigger,
      status: profile.fixtureStatus || (profile.blocker ? 'blocked-before-practical-capture' : 'ready-for-isolated-fixture-review'),
      obsStatus: 'NOT_TESTED',
      obsVisualPass: false,
      notAnObsPass: true,
      acceptanceScope: retiredControl ? 'CHATANGO_RETIRED_CONTROL' : (checklist.cases.find(candidate => candidate.caseId === `${item.plugin}:${item.locale}`)?.acceptanceScope || 'scope-not-recorded')
    };
  });
  const activeCaseCount = items.filter(item => item.acceptanceScope !== 'CHATANGO_RETIRED_CONTROL').length;
  const retirementControlCount = items.length - activeCaseCount;
  if (activeCaseCount !== 100 || retirementControlCount !== 4) {
    throw new Error(`Expected 100 active renderer cases and 4 retirement controls; found ${activeCaseCount}/${retirementControlCount}`);
  }
  return {
    schemaVersion: 1,
    status: 'source-reviewed-plan-only-no-obs-execution',
    generatedAtUtc: new Date().toISOString(),
    sourceInventory: 'docs/coordination/obs-104-source-inventory.json; current public-guide IDs cross-checked against scripts/lib/obs-docs-capture-inventory.js',
    caseCount: items.length,
    activeCaseCount,
    retirementControlCount,
    profileCount: Object.keys(profiles).length,
    locales: ['de', 'en', 'es', 'fr'],
    pilotBatchOrder: PILOT_ORDER.map((plugin) => ({ plugin, locales: ['de', 'en', 'es', 'fr'], cases: 4, note: 'Batching does not reduce the 104-case acceptance denominator.' })),
    fixtureVsProductAcceptance: {
      sourceAndInProcessFixture: 'May validate URL/profile/schema contracts only.',
      browserRenderer: 'Requires later isolated Browser Source evidence for each case.',
      productIntegration: 'Requires source/API/socket contract evidence against isolated plugin runtime where risk allows.',
      visualReview: 'Every capture remains pending independent image review; pixels alone do not prove semantic correctness.',
      retirementControl: 'Chatango historical IDs remain in the 104-case denominator but are not renderer or OBS-pass cases.'
    },
    items
  };
}

function buildPlan(matrix) {
  const byPlugin = new Map();
  for (const item of matrix.items) if (!byPlugin.has(item.plugin)) byPlugin.set(item.plugin, item);
  const lines = [
    '# OBS-Prüfplan: 104 Overlay-Fälle',
    '',
    `Stand: ${matrix.generatedAtUtc}. Quellplan, keine OBS-Ausführung; ${matrix.caseCount} historische IDs, ${matrix.activeCaseCount} aktive Rendererfälle und ${matrix.retirementControlCount} Retirement-Kontrollen aus ${matrix.profileCount} Profilen × 4 Locales.`,
    '',
    '## Abnahmegrenzen',
    '',
    '- Fixture-/In-Process-Vertragstests bestätigen nur Matrix, URLs und synthetische Payload-Verträge.',
    '- Browser-Renderer-, Plugin-Integrations- und Sichtprüfung sind getrennte Nachweise. Kein Fixturepass zählt als OBS-Pass.',
    '- Jeder Fall benötigt isolierten Startzustand, initiales Bild, deterministischen Trigger, Updatebild, Fehlerfall, Console/Network-Protokoll und Cleanupbeleg.',
    '- Ungeklärte Routen, Payloads, Seeds, Audio/GPU oder externe Anforderungen bleiben als Blocker sichtbar; öffentliches Overlay-Register wird hier nicht geändert.',
    '- Jeder Case bleibt `NOT_TESTED` für OBS. Die vier Chatango-Retirement-Kontrollen sind keine Browser-Source-Fälle und keine OBS-Pässe.',
    '- Keine echten Konten, Viewer, Coins, Hardware, Provider, TTS/STT oder Liveaktionen. Stream/Record bleibt aus.',
    '',
    '## Kleinste Pilotbatch-Reihenfolge',
    '',
    '1. **stt-ticker (de/en/es/fr):** nur synthetischer `stt-ticker:transcript`-Text und `clear`; kein STT-Backend/Mikrofon/Provider.',
    '2. **spotlight (de/en/es/fr):** nur isolierte last-event-API-Fixture und `lastevent.update.chatter` mit Fake-Session.',
    '3. **goals (de/en/es/fr):** Guide belegt `id=non-empty`; `fixture-goal-{locale}` ausschließlich in fake Socket.IO ohne Goals-Datenbank.',
    '4. **music-bot (de/en/es/fr):** Socket-only Track-Payload; kein Pluginbackend, Resolver, Queue oder MPV.',
    '**advanced-timer (de/en/es/fr):** Guide belegt `timer=non-empty`; `fixture-timer-{locale}` ausschließlich in fake HTTP/Socket ohne Timer-Datensatz.',
    '',
    'Die Pilotfolge priorisiert kleine, renderernahe Contracts. Sie ändert nicht den Umfang: alle 104 Fälle bleiben im Gate.',
    '',
    '## Fallverträge nach Plugin',
    ''
  ];
  for (const [plugin, item] of byPlugin) {
    lines.push(`### ${plugin} — ${matrix.locales.join('/')}`);
    lines.push('');
    lines.push(`- URL/Größe: \`${item.overlayUrl.replace(`lang=${item.locale}`, 'lang={de|en|es|fr}')}\`, ${item.width}×${item.height}; Einstieg: \`${item.entry}\`.`);
    lines.push(`- Initial: ${item.initial}`);
    lines.push(`- Trigger/Update: ${item.trigger.event || 'kein bestätigter Overlay-Event'}${item.trigger.payload ? ` mit \`${JSON.stringify(item.trigger.payload)}\`` : ''} → ${item.update}`);
    lines.push(`- Negativ/Cleanup: ${item.negative} Cleanup: ${item.cleanup}`);
    lines.push(`- GPU: ${item.gpu}; Audio: ${item.audio}; externe Abhängigkeiten: ${item.external}`);
    lines.push(`- Seed-/Isolationrisiko: ${item.risk}`);
    if (item.readGetContracts) lines.push(`- Read-GET-Verträge: ${item.readGetContracts.map((contract) => `\`${contract.method} ${contract.path}\` (${contract.rendererCalls ? 'Rendereraufruf' : 'separater Sourcevertrag'}): ${contract.response}`).join('; ')}`);
    if (item.opacityCheck) lines.push(`- Opacity-Prüfplan: \`${item.opacityCheck.event}\` mit \`${JSON.stringify(item.opacityCheck.payload)}\`; aktueller Renderer-Verbrauch: ${item.opacityCheck.rendererConsumes ? 'ja' : 'nein'}; ${item.opacityCheck.expected}`);
    if (item.fixtureStatus) lines.push(`- In-process Fixture: ${item.fixtureStatus} (${item.fixtureTest || 'Testpfad nicht angegeben'}); OBS: ${item.obsStatus || 'not-run'}; unabhängiger Bildreview: ${item.visualReview || 'pending'}.`);
    if (item.retirementEvidence) lines.push(`- Retirement-Beleg: \`${item.retirementEvidence}\`; kein Renderer/keine OBS-Ausführung.`);
    if (item.sourceFixtureEvidence) lines.push(`- Fixturebeleg: ${item.sourceFixtureEvidence}`);
    lines.push(`- Evidenz: ${item.evidence}`);
    if (item.blocker) lines.push(`- **Offener Blocker:** ${item.blocker}`);
    lines.push(`- Sourcebelege: ${item.evidenceSources.map((source) => `\`${source}\``).join(', ')}; Einstufung: ${item.status}.`);
    lines.push('');
  }
  lines.push('## Ablauf pro Locale-Fall', '',
    '1. Exakte lokale URL, Query, Auflösung und tatsächliche Asset-/Routeauflösung gegen Matrix prüfen; alle externen Requests protokolliert blockieren.',
    '2. Frische isolierte Szene mit leerer Baseline und sämtlichen Integrationen/Backends aus starten; initiale Sichtbarkeit/Fehler dokumentieren.',
    '3. Nur den Fall-spezifischen synthetischen Fixturetrigger einmal senden; Eventname, Payloadhash und erwartete sichtbare Änderung sichern.',
    '4. Negativfall separat ausführen, Fehlerzustand und Console protokollieren; Effekte, Socket, Intervalle, Audio und GPU-Ressourcen stoppen.',
    '5. Szene-/Quellenbaseline, Prozess/Port/Cleanup, Stream/Record-off und Bildsemantik unabhängig prüfen. Status bleibt bis unabhängiger Bildreview „review-pending“.',
    '',
    '## Matrixdatei', '',
    '`docs/coordination/obs-104-acceptance-matrix.json` enthält 104 eindeutige `plugin:locale`-IDs: 100 aktive Rendererfälle plus vier Chatango-Retirement-Kontrollen. Alle 104 bleiben bis zur praktischen Prüfung `NOT_TESTED`.',
    '');
  return lines.join('\n');
}

function writeArtifacts(repoRoot = ROOT) {
  const matrix = buildMatrix(repoRoot);
  const output = path.join(repoRoot, 'docs/coordination/obs-104-acceptance-matrix.json');
  const plan = path.join(repoRoot, 'docs/coordination/obs-pruefplan.md');
  fs.writeFileSync(output, `${JSON.stringify(matrix, null, 2)}\n`, { flag: 'w' });
  fs.writeFileSync(plan, `${buildPlan(matrix)}\n`, { flag: 'w' });
  return { output, plan, cases: matrix.caseCount, profiles: matrix.profileCount };
}

if (require.main === module) {
  try {
    const result = writeArtifacts();
    process.stdout.write(`Wrote ${result.cases} cases / ${result.profiles} profiles: ${result.output}; ${result.plan}\n`);
  } catch (error) {
    process.stderr.write(`OBS matrix generation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { PROFILES, ROUTE_SOURCES, buildMatrix, buildPlan, writeArtifacts };
