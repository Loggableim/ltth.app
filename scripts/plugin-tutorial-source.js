'use strict';

// This is the maintained source for the public tutorial catalog. The data is
// intentionally explicit: a manifest without a guide, or a stale guide, is a
// build failure instead of silently receiving generic documentation.
const fs = require('fs');
const path = require('path');

const LOCALES = ['de', 'en', 'es', 'fr'];
const L = (de, en, es, fr) => ({ de, en, es, fr });

const STEP_NAME_OVERRIDES = Object.freeze({
  'bridge-info': ['Bridge-Information', 'Bridge information', 'Informacion de Bridge', 'Information Bridge'],
  'actions-list': ['Aktionsliste', 'action list', 'lista de acciones', 'liste des actions'],
  'request-example': ['POST-Request-Vertrag', 'POST request contract', 'contrato de solicitud POST', 'contrat de requete POST'],
  'event-stream-check': ['Ereignisprotokoll', 'event log', 'registro de eventos', 'journal des evenements'],
  'bridge-review': ['Bridge-Sicherheitsgrenze', 'Bridge safety boundary', 'limite de seguridad de Bridge', 'limite de securite Bridge'],
  'mpv-path': ['MPV-Pfad', 'MPV path', 'ruta de MPV', 'chemin MPV'],
  'safe-limit': ['globales Sicherheitslimit', 'global safety limit', 'limite global de seguridad', 'limite global de securite'],
  'device-placeholder': ['Testgeraet ohne Verbindung', 'offline test device', 'dispositivo de prueba sin conexion', 'appareil de test hors connexion'],
  'shock-simulation': ['lokale Impuls-Simulation', 'local impulse simulation', 'simulacion de impulso local', 'simulation locale d impulsion'],
  'gpu-quality': ['WebGPU-Qualitaetsprofil', 'WebGPU quality profile', 'perfil de calidad WebGPU', 'profil de qualite WebGPU'],
  'follower-trigger': ['Follower-Ausloeser', 'follower trigger', 'disparador de follower', 'declencheur de follower'],
  'gpu-fireworks-test': ['lokaler Feuerwerk-Test', 'local fireworks test', 'prueba local de fuegos', 'test local de feux'],
  'store-card': ['Store-Modus', 'store mode', 'modo tienda', 'mode store']
});

const WORDS = {
  de: { manager: 'Plugin Manager', enable: 'aktiviere', open: 'öffne', save: 'speichere', preview: 'Vorschau', result: 'Ergebnis', safe: 'sicher', overlay: 'Overlay', obs: 'OBS Browser-Quelle', reset: 'zurücksetzen' },
  en: { manager: 'Plugin Manager', enable: 'enable', open: 'open', save: 'save', preview: 'preview', result: 'result', safe: 'safe', overlay: 'overlay', obs: 'OBS browser source', reset: 'reset' },
  es: { manager: 'Gestor de plugins', enable: 'activa', open: 'abre', save: 'guarda', preview: 'vista previa', result: 'resultado', safe: 'segura', overlay: 'overlay', obs: 'fuente de navegador de OBS', reset: 'restablece' },
  fr: { manager: 'Gestionnaire de plugins', enable: 'activez', open: 'ouvrez', save: 'enregistrez', preview: 'aperçu', result: 'résultat', safe: 'sûre', overlay: 'overlay', obs: 'source navigateur OBS', reset: 'réinitialisez' }
};

const REQUIREMENTS = {
  standard: L('LTTH Dashboard und ein lokales Testprofil.', 'LTTH Dashboard and a local test profile.', 'El panel de LTTH y un perfil de prueba local.', 'Le tableau de bord LTTH et un profil de test local.'),
  obs: L('LTTH Dashboard; für die Ausgabe zusätzlich eine OBS-Testszene.', 'LTTH Dashboard; use an OBS test scene for output.', 'El panel de LTTH y una escena de prueba de OBS para la salida.', 'Le tableau de bord LTTH et une scène de test OBS pour la sortie.'),
  audio: L('LTTH Dashboard und ein lokales Audio-Ausgabegerät.', 'LTTH Dashboard and a local audio output device.', 'El panel de LTTH y un dispositivo de salida de audio local.', 'Le tableau de bord LTTH et un périphérique audio local.'),
  network: L('LTTH Dashboard; externe Endpunkte bleiben in dieser Anleitung getrennt.', 'LTTH Dashboard; external endpoints remain disconnected in this guide.', 'El panel de LTTH; los extremos externos permanecen desconectados en esta guía.', 'Le tableau de bord LTTH ; les points externes restent déconnectés dans ce guide.'),
  hardware: L('LTTH Dashboard; Hardware bleibt ausgeschaltet oder wird simuliert.', 'LTTH Dashboard; hardware remains powered off or simulated.', 'El panel de LTTH; el hardware permanece apagado o simulado.', 'Le tableau de bord LTTH ; le matériel reste éteint ou simulé.'),
  api: L('LTTH Dashboard und Zugriff auf die lokale LTTH-URL.', 'LTTH Dashboard and access to the local LTTH URL.', 'El panel de LTTH y acceso a la URL local de LTTH.', 'Le tableau de bord LTTH et l’accès à l’URL locale LTTH.')
};

const SAFETY = {
  local: L('Verwende ausschließlich Demo-Ereignisse und ein temporäres Testprofil.', 'Use demo events and a temporary test profile only.', 'Usa solo eventos de demostración y un perfil de prueba temporal.', 'Utilisez uniquement des événements de démonstration et un profil de test temporaire.'),
  credentials: L('Keine echten API-Schlüssel oder Konten eingeben; Platzhalter bleiben Platzhalter.', 'Do not enter real API keys or accounts; placeholders stay placeholders.', 'No introduzcas claves API ni cuentas reales; los marcadores siguen siendo marcadores.', 'Ne saisissez aucune clé API ni compte réel ; les espaces réservés restent des espaces réservés.'),
  hardware: L('Keine Hardware auslösen: Verbindung, Druck und Haptik bleiben im Demo- oder Offline-Zustand.', 'Do not trigger hardware: connection, printing, and haptics stay in demo or offline state.', 'No actives hardware: conexión, impresión y háptica permanecen en modo demo o sin conexión.', 'Ne déclenchez aucun matériel : connexion, impression et haptique restent en démo ou hors ligne.'),
  obs: L('Nutze eine nicht gesendete OBS-Testszene; LIVE-Ausgaben bleiben deaktiviert.', 'Use an OBS test scene that is not live; LIVE output remains disabled.', 'Usa una escena de prueba de OBS que no esté al aire; la salida LIVE permanece desactivada.', 'Utilisez une scène de test OBS non diffusée ; la sortie LIVE reste désactivée.')
};

// These are the public, per-guide step anchors. They are not an ordered
// template: a descriptor is materialised from its own action and selector
// below, so capture semantics never depend on a step's array position.
const GUIDE_STEP_IDS = Object.freeze({
  'advanced-timer': ['timer-card', 'timer-duration', 'start-signal', 'countdown-preview', 'timer-overlay', 'timer-reset'],
  animazingpal: ['avatar-card', 'avatar-event-map', 'placeholder-provider', 'sample-event', 'mapping-review'],
  'api-bridge': ['bridge-info', 'actions-list', 'request-example', 'event-stream-check', 'bridge-review'],
  chatango: ['chatango-card', 'room-placeholder', 'widget-position', 'widget-preview', 'chatango-review'],
  clarityhud: ['hud-card', 'hud-modules', 'chat-region', 'full-hud-preview', 'obs-hud-source', 'hud-reset'],
  coinbattle: ['coinbattle-card', 'coin-values', 'battle-mode', 'demo-match', 'battle-overlay', 'match-reset'],
  'config-import': ['backup-card', 'export-scope', 'test-export', 'restore-inspection', 'backup-cleanup'],
  'data-source': ['source-card', 'local-source', 'field-map', 'data-preview', 'source-review'],
  'emoji-rain': ['emoji-card', 'rain-preset', 'gift-map', 'rain-test', 'rain-overlay', 'rain-reset'],
  fireworks: ['fireworks-card', 'effect-profile', 'audio-limit', 'fireworks-test', 'fireworks-overlay', 'fireworks-reset'],
  'flame-overlay': ['frame-card', 'frame-style', 'frame-intensity', 'frame-preview', 'frame-obs-source', 'frame-reset'],
  'game-engine': ['engine-card', 'game-mode', 'queue-rule', 'test-round', 'game-hud', 'queue-reset'],
  gcce: ['command-card', 'command-name', 'permission-rule', 'command-dry-run', 'command-review'],
  'gift-catalog': ['catalog-card', 'catalog-filter', 'coin-threshold', 'gift-preview', 'catalog-review'],
  goals: ['goals-card', 'goal-target', 'reset-rule', 'progress-pulse', 'goal-overlay', 'goal-reset'],
  'interactive-story': ['story-card', 'story-mode', 'vote-rule', 'local-decision', 'story-overlay', 'story-reset'],
  'milestone-leaderboard': ['xp-card', 'xp-rule', 'milestone', 'xp-pulse', 'leaderboard-overlay', 'xp-reset'],
  'minecraft-connect': ['minecraft-card', 'offline-address', 'event-format', 'offline-message', 'minecraft-review'],
  multicam: ['multicam-card', 'camera-source', 'scene-rule', 'scene-dry-run', 'multicam-review'],
  'music-bot': ['music-card', 'mpv-path', 'queue-rule', 'sample-queue', 'music-overlay', 'queue-reset'],
  openshock: ['safety-card', 'safe-limit', 'device-placeholder', 'shock-simulation', 'shock-overlay', 'safety-reset'],
  'osc-bridge': ['osc-card', 'loopback-host', 'udp-port', 'loopback-check', 'osc-review'],
  'quiz-show': ['quiz-card', 'question-pool', 'answer-window', 'sample-question', 'quiz-overlay', 'quiz-reset'],
  sidekick: ['sidekick-card', 'assistant-mode', 'context-source', 'local-request', 'sidekick-overlay', 'sidekick-reset'],
  soundboard: ['soundboard-card', 'sound-slot', 'volume-rule', 'muted-sound-test', 'soundboard-review'],
  spotlight: ['spotlight-card', 'event-style', 'display-duration', 'chatter-preview', 'spotlight-overlay', 'spotlight-reset'],
  streamalchemy: ['alchemy-card', 'automation-rule', 'action-chain', 'rule-dry-run', 'alchemy-overlay', 'rule-reset'],
  'stt-ticker': ['ticker-card', 'subtitle-language', 'ticker-style', 'sample-sentence', 'ticker-overlay', 'ticker-reset'],
  'talking-heads': ['heads-card', 'character-select', 'speech-map', 'text-preview', 'heads-overlay', 'heads-reset'],
  'thermal-printer': ['printer-card', 'offline-profile', 'encoding-rule', 'queue-test', 'printer-review'],
  toptier: ['tier-card', 'ranking-rule', 'tier-threshold', 'rank-preview', 'tier-overlay', 'tier-reset'],
  tts: ['tts-card', 'voice-select', 'moderation-filter', 'muted-voice-preview', 'tts-review'],
  vdoninja: ['ninja-card', 'placeholder-room', 'guest-layout', 'browser-preview', 'obs-guest-source', 'ninja-reset'],
  'visual-fx-frame-webgpu': ['webgpu-frame-card', 'texture-select', 'quality-profile', 'gpu-frame-preview', 'frame-obs-source', 'frame-reset'],
  'weather-control': ['weather-card', 'weather-effect', 'lifecycle-rule', 'weather-pulse', 'weather-overlay', 'weather-reset'],
  'webgpu-emoji-rain': ['gpu-rain-card', 'gpu-preset', 'asset-rule', 'gpu-rain-test', 'gpu-rain-overlay', 'gpu-rain-reset'],
  'webgpu-fireworks': ['gpu-fireworks-card', 'gpu-quality', 'follower-trigger', 'gpu-fireworks-test', 'gpu-fireworks-overlay', 'gpu-fireworks-reset'],
  'store-admin': ['store-card', 'official-source', 'package-status', 'store-inspection', 'store-review']
});

// These selectors are checked against the shipped UI in the capture run. They
// deliberately name real controls/canvases rather than deriving CSS ids from
// documentation labels. The entry order mirrors the named step ids above.
const UI_ANCHORS = Object.freeze({
  'advanced-timer': ['#tab-timers', '#initial-duration', '#timer-mode', '#timers-container', '#timer-container', '#tab-profiles'],
  animazingpal: ['#connectionStatus', '#giftMappingGift', '#followEnabled', '#connectBtn', '#tab-settings', '#statusText'],
  'api-bridge': ['#bridge-info', '#bridge-actions', '#bridge-events', '#bridge-request', '#bridge-safety'],
  chatango: ['#config-form', '#roomHandle', '#widgetPosition', '#btn-preview', '#close-preview-btn'],
  clarityhud: ['#plugin-version', '#chat-url', '#chat-preview', '#full-preview', '#full-url', '#reset-defaults-btn'],
  coinbattle: ['#control-tab', '#match-mode', '#btn-start-simulation', '#current-leaderboard', '#overlay-url', '#btn-end-match'],
  'config-import': ['#tab-export', '#incPluginSettings', '#exportBtn', '#tab-import', '#exportResultCard'],
  'data-source': ['#card-eulerstream', '#tikfinity-settings-card', '#tikfinity-port', '#btn-save-tikfinity', '#status-badge'],
  'emoji-rain': ['#hero-enabled-status', '#emoji_set', '#user-emoji-mappings', '#save-config-btn', '#canvas-container', '#toggle-enabled-status'],
  fireworks: ['#settings', '#master-toggle', '#audio-volume', '#test-btn', '#fireworks-canvas', '#save-btn'],
  'flame-overlay': ['#status', '#frameMode', '#flameSpeed', '#previewToggle', '#flameCanvas', '#savePresetBtn'],
  'game-engine': ['#tab-manual-mode', '#manual-game-type', '#manual-player1-name', '#manual-game-controls', '#hud', '#end-manual-game'],
  gcce: ['#config-form', '#command-prefix', '#cmd-filter-permission', '#btn-refresh-stats', '#tab-monitoring'],
  'gift-catalog': ['#config-form', '#app-language', '#run-refresh-form', '#catalog-output', '#connection-state'],
  goals: ['#goals-container', '#goal-target', '#goal-on-reach', '#goal-preview-frame', '#goal-container', '#goal-form'],
  'interactive-story': ['#configurationCard', '#languageSelect', '#storyStateBadge', '#toggleOverlayPreviewBtn', '#heroOpenOverlayBtn', '#statusCard'],
  'milestone-leaderboard': ['#tiersList', '#tierThreshold', '#tierName', '#testButton', '#leaderboardList', '#resetAllUsersButton'],
  'minecraft-connect': ['#commands-tab', '#wsHost', '#chatRelayTargets', '#testActionBtn', '#connectionMeta'],
  multicam: ['#currentScene', '#obs-connect-btn', '#sceneSelect', '#giftGridContainer', '#saveMappingsBtn'],
  'music-bot': ['#musicbot-onboarding', '#musicbot-onboarding-settings', '#preview-source', '#request-btn', '#overlay-root', '#clear-btn'],
  openshock: ['#safety', '#globalMaxIntensity', '#testShockDevice', '#testShockButton', '#overlay-container', '#headerEmergencyStop'],
  'osc-bridge': ['#config-form', '#sendHost', '#sendPort', '#btn-test', '#status-indicator'],
  'quiz-show': ['#dashboard', '#questionInput', '#timeRemaining', '#startQuizBtn', '#openOverlayBtn', '#stopQuizBtn'],
  sidekick: ['#tab-status', '#host-asr-language', '#test-message', '#btn-test', '#overlay', '#btn-reset'],
  soundboard: ['#overview-enabled-state', '#soundboard-gift-url', '#soundboard-gift-volume-slider', '#test-focused-animation-btn', '#soundboard-save-state'],
  spotlight: ['#overlay-grid', '#settings-form-container', '#save-settings-btn', '#preview-test-btn', '#preview-frame', '#close-preview-btn'],
  streamalchemy: ['#settingsForm', '#generationMode', '#defaultStyle', '#runLocalTestBtn', '#craftPanel', '#refreshBtn'],
  'stt-ticker': ['#tabs', '#asr-languageDefault', '#design-select', '#btn-test-deepgram', '#lines', '#btn-clear-buffer'],
  'talking-heads': ['#apiStatus', '#sourceAvatarSelect', '#previewTtsText', '#previewTtsBtn', '#avatarContainer', '#clearCacheBtn'],
  'thermal-printer': ['#config-form', '#printerType', '#encoding', '#test-print-btn', '#queue-size'],
  toptier: ['#panel-live', '#decay-enabled', '#test-overlay', '#panel-obs', '#tt-root', '#reset-all'],
  tts: ['#content-config', '#defaultVoice', '#profanityFilter', '#saveConfigBtnSidebar', '#overviewQueueLength'],
  vdoninja: ['#statusIndicator', '#roomNameInput', '.layout-grid', '#createRoomBtn', '.alert-info', '#guestsContainer'],
  'visual-fx-frame-webgpu': ['#webgpuRuntimeState', '#visualStyle', '#qualityMode', '#previewToggle', '#visualFxCanvas', '#savePresetBtn'],
  'weather-control': ['#statusAlert', '#qualityPreset', '#testRainEffectBtn', '#preview-particles', '#weather-canvas', '#stopAllPreviewBtn'],
  'webgpu-emoji-rain': ['#renderer-state', '#quality_preset', '#effect_intensity', '#save-config-btn', '#emoji-rain-canvas', '#toggle-enabled-status'],
  'webgpu-fireworks': ['#webgpu-runtime-state', '#webgpu-visual-style', '#min-coins', '#toast', '#fireworks-canvas', '#save-btn'],
  'store-admin': ['.plugin-store-mode-tabs', '.plugin-store-auth-card', '[data-store-auth-mode="sign-in"]', '[data-store-auth-mode="sign-up"]', '[data-store-account-signin]']
});

const API_ROUTES = Object.freeze({
  'bridge-info': '/api/bridge/info',
  'actions-list': '/api/bridge/actions',
  'request-example': '/api/bridge/info',
  'event-stream-check': '/api/bridge/events',
  'bridge-review': '/api/bridge/actions'
});

// A small number of verified anchors are results of a local UI transition.
// These declarations name the real preceding control; the capture runner never
// exposes or fabricates hidden content just to make a screenshot possible.
const CAPTURE_WORKFLOW_OVERRIDES = Object.freeze({
  'advanced-timer:countdown-preview': { type: 'run-local-preview', prepare: 'create-demo-timer', allowClick: true, clickSelector: '#timer-form button[type="submit"]', settleMs: 1000 },
  'chatango:chatango-review': { type: 'run-local-preview', allowClick: true, clickSelector: '#btn-preview' },
  'clarityhud:hud-reset': { type: 'open-local-settings', allowClick: true, clickSelector: '#chat-settings-btn', settleMs: 1000 },
  'config-import:backup-cleanup': { type: 'save-demo-config', allowClick: true, clickSelector: '#exportBtn', settleMs: 1000 },
  'data-source:local-source': { type: 'select-local-source', allowClick: true, clickSelector: '#card-tikfinity', settleMs: 1000 },
  'data-source:field-map': { type: 'select-local-source', allowClick: true, clickSelector: '#card-tikfinity', settleMs: 1000 },
  'data-source:data-preview': { type: 'save-demo-config', prepare: 'select-local-tikfinity', allowClick: true, clickSelector: '#btn-save-tikfinity', settleMs: 1000 },
  'goals:goal-target': { type: 'set-demo-value', prepare: 'open-goal-create-modal' },
  'goals:reset-rule': { type: 'set-demo-value', prepare: 'open-goal-create-modal' },
  'goals:progress-pulse': { type: 'run-local-preview', prepare: 'open-goal-create-modal' },
  'goals:goal-reset': { type: 'save-demo-config', prepare: 'open-goal-create-modal' },
  'fireworks:fireworks-card': { type: 'open-plugin-surface', prepare: 'open-fireworks-settings' },
  'fireworks:effect-profile': { type: 'set-demo-value', prepare: 'open-fireworks-settings' },
  'fireworks:audio-limit': { type: 'set-demo-value', prepare: 'open-fireworks-settings' },
  'fireworks:fireworks-test': { type: 'run-local-preview', allowClick: true, clickSelector: '#test-btn', settleMs: 1000 },
  'fireworks:fireworks-reset': { type: 'save-demo-config', prepare: 'open-fireworks-settings', allowClick: true, clickSelector: '#save-btn', settleMs: 1000 },
  'flame-overlay:frame-style': { type: 'set-demo-value', prepare: 'open-flame-frame-tab' },
  'flame-overlay:frame-intensity': { type: 'set-demo-value', prepare: 'open-flame-motion-tab' },
  'game-engine:test-round': { type: 'run-local-preview', prepare: 'start-local-manual-game', cleanupSelector: '#end-manual-game', settleMs: 1000 },
  'game-engine:queue-reset': { type: 'reset-demo-state', prepare: 'start-local-manual-game', settleMs: 1000 },
  'interactive-story:local-decision': { type: 'run-local-preview' },
  'interactive-story:story-overlay': { type: 'open-plugin-surface' },
  'openshock:safety-card': { type: 'open-plugin-surface', prepare: 'open-openshock-safety-tab' },
  'openshock:safe-limit': { type: 'set-demo-value', prepare: 'open-openshock-safety-tab' },
  'minecraft-connect:offline-address': { type: 'set-demo-value', prepare: 'open-minecraft-setup-tab' },
  'minecraft-connect:event-format': { type: 'set-demo-value', prepare: 'open-minecraft-chat-tab' },
  'quiz-show:question-pool': { type: 'set-demo-value', prepare: 'open-quiz-questions-tab' },
  'quiz-show:answer-window': { type: 'run-local-preview', prepare: 'start-local-quiz', cleanupSelector: '#stopQuizBtn' },
  'quiz-show:sample-question': { type: 'run-local-preview', prepare: 'start-local-quiz', cleanupSelector: '#stopQuizBtn' },
  'quiz-show:quiz-overlay': { type: 'open-plugin-surface', prepare: 'open-quiz-overlay-config-tab' },
  'quiz-show:quiz-reset': { type: 'reset-demo-state', prepare: 'start-local-quiz', cleanupSelector: '#stopQuizBtn' },
  'soundboard:sound-slot': { type: 'set-demo-value', prepare: 'open-soundboard-event-sounds' },
  'soundboard:volume-rule': { type: 'set-demo-value', prepare: 'open-soundboard-event-sounds' },
  'soundboard:muted-sound-test': { type: 'run-local-preview', prepare: 'open-soundboard-obs-overlay' },
  'webgpu-fireworks:gpu-fireworks-test': { type: 'run-local-preview', allowClick: true, clickSelector: '#test-btn', settleMs: 250 },
  'store-admin:store-card': { type: 'inspect-safe-store-state', prepare: 'open-store-admin-view' },
  'store-admin:official-source': { type: 'inspect-safe-store-state', prepare: 'open-store-admin-view' },
  'store-admin:package-status': { type: 'inspect-safe-store-state', prepare: 'open-store-admin-view' },
  'store-admin:store-inspection': { type: 'inspect-safe-store-state', prepare: 'open-store-admin-view' },
  'store-admin:store-review': { type: 'inspect-safe-store-state', prepare: 'open-store-admin-view' },
  'spotlight:event-style': { type: 'set-demo-value', prepare: 'open-spotlight-settings' },
  'spotlight:display-duration': { type: 'set-demo-value', prepare: 'open-spotlight-settings' },
  'spotlight:chatter-preview': { type: 'run-local-preview', prepare: 'open-spotlight-preview', allowClick: true, clickSelector: '#preview-test-btn', settleMs: 750 },
  'spotlight:spotlight-overlay': { type: 'run-local-preview', prepare: 'open-spotlight-preview', allowClick: true, clickSelector: '#preview-test-btn', settleMs: 750, allowEmptySurface: true },
  'spotlight:spotlight-reset': { type: 'reset-demo-state', prepare: 'open-spotlight-preview' },
  'streamalchemy:alchemy-card': { type: 'open-plugin-surface', prepare: 'open-streamalchemy-settings' },
  'streamalchemy:automation-rule': { type: 'set-demo-value', prepare: 'open-streamalchemy-settings' },
  'streamalchemy:action-chain': { type: 'set-demo-value', prepare: 'open-streamalchemy-settings' },
  'streamalchemy:rule-dry-run': { type: 'run-local-preview', prepare: 'open-streamalchemy-settings' },
  'weather-control:weather-pulse': { type: 'run-local-preview', allowClick: true, clickSelector: '#testRainEffectBtn', settleMs: 750 },
  'milestone-leaderboard:xp-rule': { type: 'set-demo-value', prepare: 'open-milestone-tier-modal' },
  'milestone-leaderboard:milestone': { type: 'set-demo-value', prepare: 'open-milestone-tier-modal' }
});

function fact(id, route, topic, test, expected, options = {}) {
  if (!GUIDE_STEP_IDS[id]) throw new Error(`Missing explicit step descriptors for ${id}`);
  const entry = {
    id,
    route,
    topic: L(...topic),
    test: L(...test),
    expected: L(...expected),
    requirement: options.requirement || 'standard',
    safety: options.safety || 'local',
    overlay: options.overlay || null,
    related: options.related || [],
    mode: options.mode || 'ui'
  };
  return {
    ...entry,
    steps: GUIDE_STEP_IDS[id].map((stepId) => createStepDescriptor(entry, stepId))
  };
}

// Each record names the real configuration surface and the safe result that a
// reader can observe. The wording is composed below, but facts are never
// inferred from broad "visual/game/integration" profiles.
const FACTS = [
  fact('advanced-timer', '/plugins/advanced-timer/ui.html', ['Timerdauer, Startsignal und Ablaufregeln', 'timer duration, start signal, and flow rules', 'duración, señal de inicio y reglas de flujo del temporizador', 'durée, signal de départ et règles du minuteur'], ['die lokale Timer-Vorschau', 'the local timer preview', 'la vista previa local del temporizador', 'l’aperçu local du minuteur'], ['der Countdown startet mit deinen Demo-Werten', 'the countdown starts with your demo values', 'la cuenta atrás inicia con los valores de demostración', 'le compte à rebours démarre avec vos valeurs de démonstration'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/advanced-timer/overlay/index.html', related: ['goals', 'game-engine'] }),
  fact('animazingpal', '/plugins/animazingpal/ui.html', ['Avatar- und Ereigniszuordnung', 'avatar and event mapping', 'asignación de avatar y eventos', 'mappage d’avatar et d’événements'], ['ein lokales Beispielereignis ohne Kontoanmeldung', 'a local sample event without account sign-in', 'un evento de ejemplo local sin iniciar sesión', 'un événement local sans connexion au compte'], ['die Zuordnung wird gespeichert, ohne einen externen Dienst zu kontaktieren', 'the mapping is saved without contacting an external service', 'la asignación se guarda sin contactar un servicio externo', 'le mappage est enregistré sans contacter de service externe'], { requirement: 'network', safety: 'credentials', related: ['talking-heads', 'osc-bridge'] }),
  fact('api-bridge', '/api/bridge/info', ['lokale Aktionen, Ereignisse und die API-Bridge', 'local actions, events, and the API bridge', 'acciones locales, eventos y la API Bridge', 'actions locales, événements et l’API Bridge'], ['GET /api/bridge/info und eine harmlose Action-Abfrage', 'GET /api/bridge/info and a harmless action lookup', 'GET /api/bridge/info y una consulta de acción inocua', 'GET /api/bridge/info et une lecture d’action inoffensive'], ['die Antwort beschreibt die verfügbare Bridge, ohne eine Aktion auszuführen', 'the response describes the available bridge without executing an action', 'la respuesta describe el puente disponible sin ejecutar una acción', 'la réponse décrit le bridge disponible sans exécuter d’action'], { requirement: 'api', safety: 'credentials', mode: 'api', related: ['data-source', 'gcce'] }),
  fact('chatango', '/plugins/chatango/ui.html', ['Raumname, Widget-Position und Chat-Thema', 'room name, widget position, and chat theme', 'nombre de sala, posición del widget y tema del chat', 'nom de salon, position du widget et thème du chat'], ['die lokale Widget-Vorschau mit einem Platzhalterraum', 'the local widget preview with a placeholder room', 'la vista previa local con una sala de marcador', 'l’aperçu local du widget avec un salon fictif'], ['das Widget zeigt die gewählte Position ohne einen externen Chat zu öffnen', 'the widget shows the chosen position without opening an external chat', 'el widget muestra la posición elegida sin abrir un chat externo', 'le widget montre la position choisie sans ouvrir de chat externe'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/chatango/ui.html', related: ['clarityhud', 'spotlight'] }),
  fact('clarityhud', '/clarityhud/ui', ['HUD-Module, Chatbereich und Stream-Overlay', 'HUD modules, chat area, and stream overlay', 'módulos HUD, área de chat y overlay de stream', 'modules HUD, zone de chat et overlay de stream'], ['die Full-HUD-Vorschau mit Demo-Daten', 'the full HUD preview with demo data', 'la vista previa Full HUD con datos demo', 'l’aperçu Full HUD avec des données démo'], ['die gewählten HUD-Bereiche sind in der Vorschau sichtbar', 'the selected HUD sections are visible in preview', 'las áreas HUD seleccionadas son visibles en la vista previa', 'les zones HUD sélectionnées sont visibles dans l’aperçu'], { requirement: 'obs', safety: 'obs', overlay: '/overlay/clarity/full', related: ['spotlight', 'toptier'] }),
  fact('coinbattle', '/plugins/coinbattle/ui.html', ['Münzwerte, Kampfmodus und Match-Start', 'coin values, battle mode, and match start', 'valores de monedas, modo de batalla e inicio de partida', 'valeurs des pièces, mode de combat et démarrage du match'], ['ein lokales Testmatch', 'a local test match', 'una partida de prueba local', 'un match de test local'], ['die Spielansicht zeigt ein gestartetes Demo-Match ohne LIVE-Ereignis', 'the game view shows a started demo match without a LIVE event', 'la vista de juego muestra una partida demo iniciada sin evento LIVE', 'la vue de jeu montre un match démo démarré sans événement LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/coinbattle/overlay/overlay.html', related: ['game-engine', 'quiz-show'] }),
  fact('config-import', '/plugins/config-import/ui.html', ['Backup-Datei, Export und Wiederherstellungsprüfung', 'backup file, export, and restore check', 'archivo de copia, exportación y comprobación de restauración', 'fichier de sauvegarde, export et contrôle de restauration'], ['einen Export in das temporäre Testprofil', 'an export into the temporary test profile', 'una exportación al perfil de prueba temporal', 'un export dans le profil de test temporaire'], ['eine Testdatei wird erzeugt, ohne dein Produktivprofil zu überschreiben', 'a test file is created without overwriting your production profile', 'se crea un archivo de prueba sin sobrescribir tu perfil de producción', 'un fichier de test est créé sans écraser votre profil de production'], { safety: 'local', related: ['data-source', 'store-admin'] }),
  fact('data-source', '/plugins/data-source/ui.html', ['Datenquelle, Feldzuordnung und Aktualisierungsintervall', 'data source, field mapping, and refresh interval', 'fuente de datos, asignación de campos e intervalo de actualización', 'source de données, mappage des champs et intervalle de mise à jour'], ['eine lokale Beispieldatenquelle', 'a local example data source', 'una fuente de datos de ejemplo local', 'une source de données locale d’exemple'], ['die Vorschau zeigt die Testfelder, ohne einen Fremdserver anzufragen', 'the preview shows test fields without requesting an external server', 'la vista previa muestra campos de prueba sin consultar un servidor externo', 'l’aperçu affiche les champs de test sans interroger de serveur externe'], { requirement: 'api', safety: 'credentials', related: ['api-bridge', 'streamalchemy'] }),
  fact('emoji-rain', '/plugins/emoji-rain/ui.html', ['Emoji-Preset, Spawn-Regeln und Geschenkzuordnung', 'emoji preset, spawn rules, and gift mapping', 'preajuste de emoji, reglas de aparición y asignación de regalos', 'préréglage emoji, règles d’apparition et mappage des cadeaux'], ['ein lokales Regen-Testereignis', 'a local rain test event', 'un evento de prueba de lluvia local', 'un événement local de test de pluie'], ['Emojis erscheinen in der Vorschau, ohne TikTok LIVE zu verbinden', 'emojis appear in preview without connecting TikTok LIVE', 'los emojis aparecen en la vista previa sin conectar TikTok LIVE', 'les emojis apparaissent dans l’aperçu sans connecter TikTok LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/emoji-rain/overlay.html', related: ['webgpu-emoji-rain', 'fireworks'] }),
  fact('fireworks', '/plugins/fireworks/ui/settings.html', ['Effektprofil, Auslöser und Audio-Lautstärke', 'effect profile, trigger, and audio volume', 'perfil de efecto, disparador y volumen de audio', 'profil d’effet, déclencheur et volume audio'], ['den eingebauten Feuerwerk-Test', 'the built-in fireworks test', 'la prueba integrada de fuegos artificiales', 'le test intégré de feux d’artifice'], ['das Feuerwerk erscheint in der lokalen Overlay-Vorschau', 'the fireworks appear in the local overlay preview', 'los fuegos artificiales aparecen en la vista previa local', 'les feux d’artifice apparaissent dans l’aperçu local'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/fireworks/overlay.html', related: ['webgpu-fireworks', 'flame-overlay'] }),
  fact('flame-overlay', '/plugins/flame-overlay/ui/settings.html', ['Rahmenstil, Intensität und Farbvorgabe', 'frame style, intensity, and color preset', 'estilo de marco, intensidad y preajuste de color', 'style de cadre, intensité et préréglage de couleur'], ['die lokale Rahmenvorschau', 'the local frame preview', 'la vista previa local del marco', 'l’aperçu local du cadre'], ['der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern', 'the frame is visible without changing a LIVE scene', 'el marco es visible sin cambiar una escena LIVE', 'le cadre est visible sans modifier une scène LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/flame-overlay/renderer/index.html', related: ['visual-fx-frame-webgpu', 'fireworks'] }),
  fact('game-engine', '/plugins/game-engine/ui.html', ['Spielmodus, Queue und Geschenk- oder Chat-Trigger', 'game mode, queue, and gift or chat trigger', 'modo de juego, cola y disparador de regalo o chat', 'mode de jeu, file et déclencheur cadeau ou chat'], ['eine lokale Runde im Testmodus', 'a local test round', 'una ronda local en modo de prueba', 'une manche locale en mode test'], ['die Testqueue wird abgearbeitet und die Spielansicht aktualisiert sich', 'the test queue is processed and the game view updates', 'la cola de prueba se procesa y la vista del juego se actualiza', 'la file de test est traitée et la vue de jeu se met à jour'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/game-engine/overlay/game-hud.html', related: ['coinbattle', 'quiz-show', 'gcce'] }),
  fact('gcce', '/plugins/gcce/ui.html', ['Befehl, Berechtigung und Chat-Antwort', 'command, permission, and chat response', 'comando, permiso y respuesta de chat', 'commande, autorisation et réponse de chat'], ['einen lokalen Testbefehl', 'a local test command', 'un comando de prueba local', 'une commande de test locale'], ['der Befehl wird validiert, ohne eine LIVE-Chatnachricht zu senden', 'the command is validated without sending a LIVE chat message', 'el comando se valida sin enviar un mensaje de chat LIVE', 'la commande est validée sans envoyer de message de chat LIVE'], { safety: 'local', related: ['api-bridge', 'game-engine'] }),
  fact('gift-catalog', '/plugins/gift-catalog/ui.html', ['Geschenkkatalog, Coinschwelle und Beispielzuordnung', 'gift catalog, coin threshold, and sample mapping', 'catálogo de regalos, umbral de monedas y asignación de ejemplo', 'catalogue de cadeaux, seuil de pièces et mappage d’exemple'], ['einen Katalogfilter mit Demodaten', 'a catalog filter with demo data', 'un filtro de catálogo con datos demo', 'un filtre de catalogue avec des données démo'], ['die gefilterte Geschenkauswahl wird angezeigt, ohne LIVE-Daten zu laden', 'the filtered gift selection is shown without loading LIVE data', 'la selección filtrada se muestra sin cargar datos LIVE', 'la sélection filtrée est affichée sans charger de données LIVE'], { safety: 'local', related: ['goals', 'fireworks'] }),
  fact('goals', '/plugins/goals/ui.html', ['Zielwert, Fortschrittsanzeige und Reset-Regel', 'goal value, progress display, and reset rule', 'valor de objetivo, visualización de progreso y regla de reinicio', 'valeur d’objectif, affichage de progression et règle de remise à zéro'], ['einen lokalen Fortschrittsimpuls', 'a local progress pulse', 'un impulso de progreso local', 'une impulsion de progression locale'], ['die Fortschrittsanzeige ändert sich nur im Testprofil', 'the progress display changes only in the test profile', 'la visualización de progreso cambia solo en el perfil de prueba', 'l’affichage de progression change uniquement dans le profil de test'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/goals/overlay/index.html', related: ['advanced-timer', 'milestone-leaderboard'] }),
  fact('interactive-story', '/plugins/interactive-story/ui.html?demo=1', ['Geschichtenmodus, Abstimmung und Modelloption', 'story mode, voting, and model option', 'modo de historia, votación y opción de modelo', 'mode histoire, vote et option de modèle'], ['eine lokale Testentscheidung ohne API-Schlüssel', 'a local test decision without an API key', 'una decisión de prueba local sin clave API', 'une décision de test locale sans clé API'], ['die Abstimmungsoberfläche reagiert, ohne einen externen Modellaufruf auszuführen', 'the voting UI responds without an external model request', 'la interfaz de votación responde sin solicitar un modelo externo', 'l’interface de vote répond sans appel de modèle externe'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/interactive-story/overlay.html', related: ['quiz-show', 'sidekick'] }),
  fact('milestone-leaderboard', '/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html', ['XP-Regeln, Meilenstein und Ranglistenanzeige', 'XP rules, milestone, and leaderboard display', 'reglas de XP, hito y visualización de clasificación', 'règles XP, jalon et affichage du classement'], ['einen lokalen XP-Impuls', 'a local XP pulse', 'un impulso de XP local', 'une impulsion XP locale'], ['ein Demonutzer erscheint in der Ranglisten-Vorschau', 'a demo user appears in the leaderboard preview', 'un usuario demo aparece en la vista previa de clasificación', 'un utilisateur démo apparaît dans l’aperçu du classement'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html', related: ['goals', 'toptier'] }),
  fact('minecraft-connect', '/plugins/minecraft-connect/minecraft-connect.html', ['Serveradresse, Ereignisbindung und Nachrichtenformat', 'server address, event binding, and message format', 'dirección del servidor, enlace de eventos y formato de mensaje', 'adresse serveur, liaison d’événements et format de message'], ['eine lokale Offline-Nachricht', 'a local offline message', 'un mensaje local sin conexión', 'un message local hors ligne'], ['die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren', 'the configuration is checked without contacting a Minecraft server', 'la configuración se comprueba sin contactar un servidor de Minecraft', 'la configuration est contrôlée sans contacter de serveur Minecraft'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/minecraft-connect/overlay/minecraft_overlay.html', related: ['osc-bridge', 'api-bridge'] }),
  fact('multicam', '/plugins/multicam/ui.html', ['Kameraquelle, Szenenregel und Umschaltbedingung', 'camera source, scene rule, and switch condition', 'fuente de cámara, regla de escena y condición de cambio', 'source caméra, règle de scène et condition de bascule'], ['eine nicht sendende OBS-Testszene', 'an OBS test scene that is not live', 'una escena de prueba de OBS que no está al aire', 'une scène de test OBS non diffusée'], ['die Regel wird gespeichert, ohne OBS zu schalten', 'the rule is saved without switching OBS', 'la regla se guarda sin cambiar OBS', 'la règle est enregistrée sans basculer OBS'], { requirement: 'obs', safety: 'obs', related: ['vdoninja', 'clarityhud'] }),
  fact('music-bot', '/plugins/music-bot/ui.html', ['MPV-Pfad, Anfragequeue und Moderationsregel', 'MPV path, request queue, and moderation rule', 'ruta de MPV, cola de solicitudes y regla de moderación', 'chemin MPV, file de demandes et règle de modération'], ['eine lokale Beispieldatei in der Queue', 'a local sample file in the queue', 'un archivo de ejemplo local en la cola', 'un fichier d’exemple local dans la file'], ['die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe', 'the queue shows the entry; no external search or playback starts', 'la cola muestra la entrada; no inicia búsqueda externa ni reproducción', 'la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre'], { requirement: 'audio', safety: 'local', overlay: '/plugins/music-bot/overlay.html', related: ['soundboard', 'tts'] }),
  fact('openshock', '/plugins/openshock/ui.html', ['Sicherheitslimit, Queue und Gerätezuordnung', 'safety limit, queue, and device mapping', 'límite de seguridad, cola y asignación de dispositivo', 'limite de sécurité, file et mappage d’appareil'], ['die eingebaute Simulation ohne Token und Gerät', 'the built-in simulation without a token or device', 'la simulación integrada sin token ni dispositivo', 'la simulation intégrée sans jeton ni appareil'], ['der Ablauf wird als Simulation angezeigt und löst keine Haptik aus', 'the flow is shown as a simulation and triggers no haptics', 'el flujo se muestra como simulación y no activa háptica', 'le flux est affiché comme simulation et ne déclenche aucune haptique'], { requirement: 'hardware', safety: 'hardware', overlay: '/plugins/openshock/overlay/openshock_overlay.html', related: ['game-engine', 'thermal-printer'] }),
  fact('osc-bridge', '/plugins/osc-bridge/ui.html', ['Loopback-Adresse, UDP-Port und Nachrichtentyp', 'loopback address, UDP port, and message type', 'dirección loopback, puerto UDP y tipo de mensaje', 'adresse loopback, port UDP et type de message'], ['eine lokale Loopback-Prüfung', 'a local loopback check', 'una comprobación loopback local', 'un contrôle loopback local'], ['die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert', 'inputs remain on 127.0.0.1 and no VRChat client is controlled', 'las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat', 'les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé'], { requirement: 'network', safety: 'local', related: ['stt-ticker', 'minecraft-connect'] }),
  fact('quiz-show', '/plugins/quiz-show/quiz_show.html', ['Fragenpool, Antwortzeit und Punktelogik', 'question pool, answer time, and scoring logic', 'banco de preguntas, tiempo de respuesta y lógica de puntuación', 'banque de questions, temps de réponse et logique de score'], ['eine lokale Quizfrage', 'a local quiz question', 'una pregunta de cuestionario local', 'une question de quiz locale'], ['die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion', 'the game view shows the question without LIVE chat interaction', 'la vista de juego muestra la pregunta sin interacción de chat LIVE', 'la vue de jeu affiche la question sans interaction de chat LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/quiz-show/quiz_show_overlay.html', related: ['game-engine', 'interactive-story'] }),
  fact('sidekick', '/plugins/sidekick/ui.html', ['Assistentenmodus, Kontextquelle und Antwortkanal', 'assistant mode, context source, and response channel', 'modo asistente, fuente de contexto y canal de respuesta', 'mode assistant, source de contexte et canal de réponse'], ['eine lokale Vorschauanfrage ohne Modellzugang', 'a local preview request without model access', 'una solicitud de vista previa local sin acceso a modelo', 'une requête d’aperçu locale sans accès au modèle'], ['die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen', 'the UI confirms the configuration without calling an external service', 'la UI confirma la configuración sin llamar a un servicio externo', 'l’UI confirme la configuration sans appeler de service externe'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/sidekick/overlay/sidekick-hud.html', related: ['interactive-story', 'api-bridge'] }),
  fact('soundboard', '/plugins/soundboard/ui/index.html', ['Sound-Slot, Lautstärke und Ereigniszuordnung', 'sound slot, volume, and event mapping', 'ranura de sonido, volumen y asignación de evento', 'slot sonore, volume et mappage d’événement'], ['einen stummen lokalen Soundtest', 'a muted local sound test', 'una prueba local de sonido silenciada', 'un test sonore local muet'], ['die Zuordnung wird sichtbar, ohne Audio auszugeben', 'the mapping becomes visible without audio output', 'la asignación se hace visible sin emitir audio', 'le mappage devient visible sans sortie audio'], { requirement: 'audio', safety: 'local', related: ['music-bot', 'tts'] }),
  fact('spotlight', '/plugins/spotlight/ui/main.html', ['Ereignistyp, Anzeigedauer und Spotlight-Stil', 'event type, display duration, and spotlight style', 'tipo de evento, duración de visualización y estilo Spotlight', 'type d’événement, durée d’affichage et style Spotlight'], ['eine lokale Chatter-Vorschau', 'a local chatter preview', 'una vista previa local de chatter', 'un aperçu local de chatter'], ['die Spotlight-Karte wird in der Vorschau gerendert', 'the spotlight card is rendered in preview', 'la tarjeta Spotlight se renderiza en la vista previa', 'la carte Spotlight est rendue dans l’aperçu'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/spotlight/overlays/chatter.html', related: ['clarityhud', 'toptier'] }),
  fact('streamalchemy', '/plugins/streamalchemy/ui.html', ['Automationsregel, Auslöser und Aktionskette', 'automation rule, trigger, and action chain', 'regla de automatización, disparador y cadena de acciones', 'règle d’automatisation, déclencheur et chaîne d’actions'], ['einen lokalen Trockenlauf', 'a local dry run', 'una ejecución en seco local', 'un essai à blanc local'], ['die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen', 'the rule logs the dry run without executing LIVE actions', 'la regla registra la ejecución en seco sin realizar acciones LIVE', 'la règle journalise l’essai à blanc sans exécuter d’actions LIVE'], { safety: 'local', overlay: '/plugins/streamalchemy/overlay.html', related: ['api-bridge', 'gcce'] }),
  fact('stt-ticker', '/plugins/stt-ticker/ui.html', ['Sprache, Untertitelmodus und Textstil', 'language, subtitle mode, and text style', 'idioma, modo de subtítulos y estilo de texto', 'langue, mode de sous-titres et style de texte'], ['einen lokalen Beispielsatz', 'a local sample sentence', 'una frase de ejemplo local', 'une phrase locale d’exemple'], ['der Satz erscheint im Ticker ohne Mikrofonaufnahme', 'the sentence appears in the ticker without microphone capture', 'la frase aparece en el ticker sin captura de micrófono', 'la phrase apparaît dans le ticker sans capture micro'], { requirement: 'obs', safety: 'local', overlay: '/plugins/stt-ticker/overlay/ticker.html', related: ['osc-bridge', 'talking-heads'] }),
  fact('talking-heads', '/plugins/talking-heads/ui.html', ['Charakter, Sprachereignis und Lippenbewegung', 'character, speech event, and lip movement', 'personaje, evento de voz y movimiento de labios', 'personnage, événement vocal et mouvement des lèvres'], ['eine lokale Textvorschau', 'a local text preview', 'una vista previa de texto local', 'un aperçu de texte local'], ['der Charakter reagiert in der Vorschau ohne TTS-Provider', 'the character reacts in preview without a TTS provider', 'el personaje reacciona en la vista previa sin proveedor TTS', 'le personnage réagit dans l’aperçu sans fournisseur TTS'], { requirement: 'audio', safety: 'credentials', overlay: '/plugins/talking-heads/overlay.html', related: ['tts', 'animazingpal'] }),
  fact('thermal-printer', '/plugins/thermal-printer/ui.html', ['Druckerprofil, Zeichensatz und Warteschlange', 'printer profile, character set, and queue', 'perfil de impresora, juego de caracteres y cola', 'profil d’imprimante, jeu de caractères et file'], ['den Offline-Queue-Test', 'the offline queue test', 'la prueba de cola sin conexión', 'le test de file hors ligne'], ['ein Testeintrag bleibt in der Queue; es wird nichts gedruckt', 'a test item remains in the queue; nothing is printed', 'una entrada de prueba permanece en la cola; no se imprime nada', 'une entrée de test reste dans la file ; rien n’est imprimé'], { requirement: 'hardware', safety: 'hardware', related: ['openshock', 'config-import'] }),
  fact('toptier', '/plugins/toptier/ui.html', ['Ranking-Regel, Schwelle und Anzeigestil', 'ranking rule, threshold, and display style', 'regla de ranking, umbral y estilo de visualización', 'règle de classement, seuil et style d’affichage'], ['einen lokalen Ranglistenwert', 'a local leaderboard value', 'un valor de clasificación local', 'une valeur de classement locale'], ['die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau', 'the Top Tier card shows the demo rank in preview', 'la tarjeta Top Tier muestra el rango demo en la vista previa', 'la carte Top Tier affiche le rang démo dans l’aperçu'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/toptier/overlay.html', related: ['milestone-leaderboard', 'spotlight'] }),
  fact('tts', '/plugins/tts/ui/admin-panel.html', ['Stimme, Warteschlange und Moderationsfilter', 'voice, queue, and moderation filter', 'voz, cola y filtro de moderación', 'voix, file et filtre de modération'], ['eine stumme lokale Sprachvorschau', 'a muted local speech preview', 'una vista previa de voz local silenciada', 'un aperçu vocal local muet'], ['die Vorschau validiert Text und Stimme, ohne Audio auszugeben', 'the preview validates text and voice without audio output', 'la vista previa valida texto y voz sin emitir audio', 'l’aperçu valide le texte et la voix sans sortie audio'], { requirement: 'audio', safety: 'credentials', related: ['talking-heads', 'soundboard'] }),
  fact('vdoninja', '/plugins/vdoninja/ui.html', ['Raumname, Gastlayout und Browserquelle', 'room name, guest layout, and browser source', 'nombre de sala, diseño de invitados y fuente de navegador', 'nom de salle, disposition des invités et source navigateur'], ['eine lokale URL-Vorschau mit Platzhalterraum', 'a local URL preview with a placeholder room', 'una vista previa de URL local con sala de marcador', 'un aperçu d’URL local avec salle fictive'], ['die Browser-Quelle ist vorbereitet, ohne einen Gast zu verbinden', 'the browser source is prepared without connecting a guest', 'la fuente de navegador está preparada sin conectar un invitado', 'la source navigateur est préparée sans connecter d’invité'], { requirement: 'obs', safety: 'credentials', related: ['multicam', 'clarityhud'] }),
  fact('visual-fx-frame-webgpu', '/visual-fx-frame-webgpu/ui', ['WebGPU-Rahmen, Premium-Stile und Qualitätsprofil', 'WebGPU frame, premium styles, and quality profile', 'marco WebGPU, estilos premium y perfil de calidad', 'cadre WebGPU, styles premium et profil de qualité'], ['eine lokale WebGPU-Vorschau', 'a local WebGPU preview', 'una vista previa WebGPU local', 'un aperçu WebGPU local'], ['der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil', 'the frame is rendered and the quality indicator stays in the test profile', 'el marco se renderiza y el indicador de calidad permanece en el perfil de prueba', 'le cadre est rendu et l’indicateur de qualité reste dans le profil de test'], { requirement: 'obs', safety: 'obs', overlay: '/visual-fx-frame-webgpu/overlay', related: ['webgpu-fireworks', 'flame-overlay'] }),
  fact('weather-control', '/plugins/weather-control/ui.html', ['Wettereffect, Intensität und Lebenszyklus', 'weather effect, intensity, and lifecycle', 'efecto meteorológico, intensidad y ciclo de vida', 'effet météo, intensité et cycle de vie'], ['einen lokalen Wetterimpuls', 'a local weather pulse', 'un impulso meteorológico local', 'une impulsion météo locale'], ['der Effekt startet und endet in der Vorschau ohne LIVE-Szene', 'the effect starts and ends in preview without a LIVE scene', 'el efecto inicia y termina en la vista previa sin escena LIVE', 'l’effet commence et finit dans l’aperçu sans scène LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/weather-control/overlay.html', related: ['webgpu-fireworks', 'emoji-rain'] }),
  fact('webgpu-emoji-rain', '/plugins/webgpu-emoji-rain/ui.html', ['WebGPU-Preset, Assets und Geschenkregel', 'WebGPU preset, assets, and gift rule', 'preajuste WebGPU, recursos y regla de regalo', 'préréglage WebGPU, assets et règle de cadeau'], ['ein lokales Emoji-Regen-Testereignis', 'a local emoji-rain test event', 'un evento de prueba local de lluvia de emoji', 'un événement local de test de pluie emoji'], ['die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt', 'the GPU preview shows emojis and reports no LIVE connection', 'la vista previa GPU muestra emojis y no informa conexión LIVE', 'l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/webgpu-emoji-rain/overlay.html', related: ['emoji-rain', 'webgpu-fireworks'] }),
  fact('webgpu-fireworks', '/webgpu-fireworks/ui', ['WebGPU-Qualität, Auslöser und Performance-Grenze', 'WebGPU quality, trigger, and performance limit', 'calidad WebGPU, disparador y límite de rendimiento', 'qualité WebGPU, déclencheur et limite de performance'], ['den lokalen Follower-Test und die Overlay-Vorschau', 'the local follower test and overlay preview', 'la prueba local de follower y la vista previa del overlay', 'le test local de follower et l’aperçu overlay'], ['das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden', 'the WebGPU fireworks render without connecting TikTok LIVE', 'los fuegos WebGPU se renderizan sin conectar TikTok LIVE', 'les feux WebGPU sont rendus sans connecter TikTok LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/webgpu-fireworks/overlay', related: ['fireworks', 'visual-fx-frame-webgpu'] }),
  fact('store-admin', '/dashboard.html?view=plugins', ['Store-Ansicht, Quellenfreigabe und Paketstatus', 'store view, source approval, and package status', 'vista de tienda, aprobación de fuentes y estado de paquetes', 'vue du store, approbation des sources et état des paquets'], ['die lokale Store-Ansicht ohne Community-Quelle', 'the local store view without a community source', 'la vista de tienda local sin fuente comunitaria', 'la vue locale du store sans source communautaire'], ['der Store zeigt den sicheren Standardzustand; keine Quelle wird aktiviert', 'the store shows the safe default state; no source is enabled', 'la tienda muestra el estado seguro predeterminado; no se activa ninguna fuente', 'le store affiche l’état sûr par défaut ; aucune source n’est activée'], { requirement: 'api', safety: 'credentials', mode: 'admin', related: ['config-import', 'api-bridge'] })
];

function readManifests(repoRoot) {
  const roots = [
    path.join(repoRoot, 'app', 'plugins'),
    path.join(repoRoot, 'plugin-store', 'sources')
  ];
  const manifests = roots.flatMap((pluginRoot) => fs.readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, entry.name, 'plugin.json')))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(pluginRoot, entry.name, 'plugin.json'), 'utf8'))))
    .filter((manifest) => manifest.id !== 'store-admin');
  const duplicate = manifests.find((manifest, index) => manifests.findIndex((candidate) => candidate.id === manifest.id) !== index);
  if (duplicate) throw new Error(`Duplicate plugin tutorial manifest id: ${duplicate.id}`);
  return manifests.sort((left, right) => left.id.localeCompare(right.id));
}

function readStoreAdmin(repoRoot) {
  const store = JSON.parse(fs.readFileSync(path.join(repoRoot, 'plugin-store.json'), 'utf8'));
  return store.plugins.find((plugin) => plugin.id === 'store-admin') || { id: 'store-admin', name: 'Store Admin', version: 'current', devStatus: 'admin-only' };
}

function displayName(value, fallback) {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') return value.de || value.en || fallback;
  return fallback;
}

function localizedGuideCopy(name, entry) {
  const copy = {};
  for (const locale of LOCALES) {
    const words = WORDS[locale];
    copy[locale] = {
      title: name,
      summary: locale === 'de' ? `${name} richtet ${entry.topic[locale]} ein – mit einer sicheren lokalen Kontrolle statt einer LIVE-Auslösung.`
        : locale === 'en' ? `${name} configures ${entry.topic[locale]} with a safe local check instead of a LIVE trigger.`
          : locale === 'es' ? `${name} configura ${entry.topic[locale]} mediante una comprobación local segura, no un disparador LIVE.`
            : `${name} configure ${entry.topic[locale]} avec un contrôle local sûr plutôt qu’un déclencheur LIVE.`,
      firstResult: entry.expected[locale],
      requirements: REQUIREMENTS[entry.requirement][locale],
      safety: SAFETY[entry.safety][locale],
      troubleshooting: locale === 'de' ? `Wenn ${entry.topic[locale]} nicht sichtbar ist, prüfe zuerst den aktiven Plugin-Status, die lokale Route und gespeicherte Testwerte.`
        : locale === 'en' ? `If ${entry.topic[locale]} is not visible, first check the active plugin status, local route, and saved test values.`
          : locale === 'es' ? `Si ${entry.topic[locale]} no aparece, comprueba primero el estado activo del plugin, la ruta local y los valores de prueba guardados.`
            : `Si ${entry.topic[locale]} n’est pas visible, vérifiez d’abord l’état actif du plugin, la route locale et les valeurs de test enregistrées.`,
      related: entry.related
    };
  }
  return copy;
}

// A step's safe action is deliberately declared from its public anchor, never
// from its position in a sequence. This makes adding or reordering a step a
// data change instead of silently changing a capture's meaning.
function stepAction(entry, stepId) {
  if (entry.mode === 'api') return 'inspect-readonly-api';
  if (entry.mode === 'admin') return 'inspect-safe-store-state';
  if (stepId.endsWith('-card')) return 'open-plugin-surface';
  if (/(?:overlay|obs-source|hud-source|-hud)$/.test(stepId)) return 'open-overlay-preview';
  if (/(?:reset|cleanup)$/.test(stepId)) return 'reset-demo-state';
  if (/(?:test|preview|pulse|match|round|message|run|sentence|simulation|check|request|question|queue-test|dry-run)$/.test(stepId)) return 'run-local-preview';
  if (/(?:review|inspection)$/.test(stepId)) return 'save-demo-config';
  return 'set-demo-value';
}

function stepRoute(entry, action, stepId) {
  if (entry.id === 'spotlight' && stepId === 'spotlight-overlay') return entry.route;
  if (entry.id === 'quiz-show' && stepId === 'quiz-overlay') return entry.route;
  if (entry.id === 'clarityhud' && stepId === 'obs-hud-source') return entry.route;
  if (entry.id === 'coinbattle' && stepId === 'battle-overlay') return entry.route;
  if (entry.id === 'interactive-story') return action === 'open-overlay-preview' ? '/plugins/interactive-story/overlay.html' : '/plugins/interactive-story/ui.html?demo=1';
  if (entry.id === 'webgpu-fireworks') return action === 'open-overlay-preview' ? '/plugins/webgpu-fireworks/overlay.html' : '/plugins/webgpu-fireworks/ui/settings.html';
  if (action === 'inspect-readonly-api') return entry.id === 'api-bridge' ? '/api-bridge/ui' : API_ROUTES[stepId];
  // The Store opens the account bridge as soon as the Plugins view loads for a
  // fresh profile. Start on the ordinary dashboard, then use the shipped
  // navigation after the signed-out state has been established.
  if (action === 'inspect-safe-store-state') return '/dashboard.html';
  if (action === 'open-overlay-preview') return entry.overlay || entry.route;
  return entry.route;
}

function stepSelector(entry, stepId, action) {
  const anchors = UI_ANCHORS[entry.id];
  const index = GUIDE_STEP_IDS[entry.id].indexOf(stepId);
  if (!anchors || index < 0 || !anchors[index]) throw new Error(`Missing verified UI anchor for ${entry.id}/${stepId}`);
  return anchors[index];
}

function localizedStepCopy(entry, stepId, action) {
  const copy = {};
  for (const locale of LOCALES) {
    const topic = entry.topic[locale];
    const test = entry.test[locale];
    const expected = entry.expected[locale];
    let title;
    let body;
    let result;
    if (action === 'open-plugin-surface') {
      title = locale === 'de' ? 'Plugin-Konfiguration öffnen' : locale === 'en' ? 'Open the plugin configuration' : locale === 'es' ? 'Abre la configuración del plugin' : 'Ouvrez la configuration du plugin';
      body = locale === 'de' ? `Öffne die lokale Konfigurationsoberfläche für ${topic} im Testprofil. Aktiviere das Plugin zuvor im Plugin Manager, falls die Oberfläche nicht erreichbar ist.` : locale === 'en' ? `Open the local configuration surface for ${topic} in the test profile. Enable the plugin first in Plugin Manager if the surface is unavailable.` : locale === 'es' ? `Abre la superficie de configuración local de ${topic} en el perfil de prueba. Activa primero el plugin en el gestor si la superficie no está disponible.` : `Ouvrez la surface de configuration locale pour ${topic} dans le profil de test. Activez d’abord le plugin dans le gestionnaire si la surface est indisponible.`;
      result = locale === 'de' ? 'Die passende Plugin-Oberfläche ist eindeutig sichtbar.' : locale === 'en' ? 'The relevant plugin surface is visibly identified.' : locale === 'es' ? 'La superficie correspondiente del plugin queda identificada.' : 'La surface de plugin correspondante est clairement visible.';
    } else if (action === 'inspect-readonly-api') {
      title = locale === 'de' ? 'Lokale API-Antwort nur lesend prüfen' : locale === 'en' ? 'Inspect the local API response read-only' : locale === 'es' ? 'Inspecciona la respuesta de API local en solo lectura' : 'Inspectez la réponse API locale en lecture seule';
      body = locale === 'de' ? `Rufe die lokale Bridge-Information für ${topic} ab. Sende keinen POST-Request und führe keine Aktion aus.` : locale === 'en' ? `Read the local bridge information for ${topic}. Do not send a POST request or execute an action.` : locale === 'es' ? `Consulta la información local del puente para ${topic}. No envíes POST ni ejecutes acciones.` : `Lisez les informations locales du bridge pour ${topic}. N’envoyez aucune requête POST et n’exécutez aucune action.`;
      result = expected;
    } else if (action === 'inspect-safe-store-state') {
      title = locale === 'de' ? 'Sicheren Store-Standardzustand prüfen' : locale === 'en' ? 'Inspect the safe default store state' : locale === 'es' ? 'Inspecciona el estado seguro predeterminado de la tienda' : 'Inspectez l’état sûr par défaut du store';
      body = locale === 'de' ? `Öffne die Store-Ansicht für ${topic}; Community-Quellen und Installationen bleiben unverändert.` : locale === 'en' ? `Open the store view for ${topic}; leave community sources and installations unchanged.` : locale === 'es' ? `Abre la vista de tienda de ${topic}; no cambies fuentes comunitarias ni instalaciones.` : `Ouvrez la vue du store pour ${topic} ; ne modifiez ni les sources communautaires ni les installations.`;
      result = expected;
    } else if (action === 'open-overlay-preview') {
      title = locale === 'de' ? `Overlay-Vorschau für ${topic} öffnen` : locale === 'en' ? `Open the overlay preview for ${topic}` : locale === 'es' ? `Abre la vista previa del overlay de ${topic}` : `Ouvrez l’aperçu overlay pour ${topic}`;
      body = locale === 'de' ? 'Nutze ausschließlich eine nicht gesendete OBS-Testszene; keine produktive Browser-Quelle wird geändert.' : locale === 'en' ? 'Use only an OBS test scene that is not live; do not change a production browser source.' : locale === 'es' ? 'Usa solo una escena de prueba de OBS que no esté al aire; no cambies una fuente de navegador de producción.' : 'Utilisez uniquement une scène de test OBS non diffusée ; ne modifiez pas de source navigateur de production.';
      result = expected;
    } else if (action === 'run-local-preview') {
      title = locale === 'de' ? `${test} ausführen` : locale === 'en' ? `Run ${test}` : locale === 'es' ? `Ejecuta ${test}` : `Exécutez ${test}`;
      body = locale === 'de' ? `Starte ausschließlich den lokalen Test für ${topic}; externe Dienste, Geräte und LIVE-Ereignisse bleiben getrennt.` : locale === 'en' ? `Run only the local test for ${topic}; external services, devices, and LIVE events stay disconnected.` : locale === 'es' ? `Ejecuta solo la prueba local de ${topic}; servicios externos, dispositivos y eventos LIVE permanecen desconectados.` : `Exécutez uniquement le test local pour ${topic} ; les services externes, appareils et événements LIVE restent déconnectés.`;
      result = expected;
    } else if (action === 'reset-demo-state') {
      title = locale === 'de' ? `Demo-Zustand für ${topic} zurücksetzen` : locale === 'en' ? `Reset the demo state for ${topic}` : locale === 'es' ? `Restablece el estado demo de ${topic}` : `Réinitialisez l’état démo de ${topic}`;
      body = locale === 'de' ? 'Entferne die Testwerte oder beende die Vorschau, bevor du einen produktiven Stream vorbereitest.' : locale === 'en' ? 'Remove test values or end the preview before preparing a production stream.' : locale === 'es' ? 'Elimina los valores de prueba o finaliza la vista previa antes de preparar un directo de producción.' : 'Supprimez les valeurs de test ou fermez l’aperçu avant de préparer un stream de production.';
      result = locale === 'de' ? 'Das Testprofil bleibt ohne produktive Auswirkung.' : locale === 'en' ? 'The test profile remains free of production impact.' : locale === 'es' ? 'El perfil de prueba permanece sin impacto de producción.' : 'Le profil de test reste sans impact de production.';
    } else if (action === 'save-demo-config') {
      title = locale === 'de' ? `${topic} als Testkonfiguration prüfen` : locale === 'en' ? `Review ${topic} as a test configuration` : locale === 'es' ? `Revisa ${topic} como configuración de prueba` : `Vérifiez ${topic} comme configuration de test`;
      body = locale === 'de' ? 'Kontrolliere die sichtbaren Demo-Werte vor dem Speichern; verwende keine Zugangsdaten, Geräte-IDs oder LIVE-Ziele.' : locale === 'en' ? 'Review the visible demo values before saving; use no credentials, device IDs, or LIVE targets.' : locale === 'es' ? 'Revisa los valores demo visibles antes de guardar; no uses credenciales, IDs de dispositivo ni destinos LIVE.' : 'Contrôlez les valeurs démo visibles avant l’enregistrement ; n’utilisez ni identifiants, ni ID d’appareil, ni cible LIVE.';
      result = locale === 'de' ? 'Die Testkonfiguration ist nachvollziehbar und sicher gespeichert.' : locale === 'en' ? 'The test configuration is saved safely and can be reviewed.' : locale === 'es' ? 'La configuración de prueba se guarda de forma segura y puede revisarse.' : 'La configuration de test est enregistrée de manière sûre et vérifiable.';
    } else {
      title = locale === 'de' ? `${topic} mit Demo-Werten konfigurieren` : locale === 'en' ? `Configure ${topic} with demo values` : locale === 'es' ? `Configura ${topic} con valores demo` : `Configurez ${topic} avec des valeurs démo`;
      body = locale === 'de' ? `Bearbeite nur das beschriftete Feld „${stepId}“ und verwende einen lokalen Platzhalterwert.` : locale === 'en' ? `Edit only the labelled “${stepId}” field and use a local placeholder value.` : locale === 'es' ? `Edita solo el campo etiquetado «${stepId}» y usa un valor local de marcador.` : `Modifiez uniquement le champ « ${stepId} » et utilisez une valeur locale fictive.`;
      result = locale === 'de' ? 'Der Demo-Wert ist sichtbar und kann vor dem Test geprüft werden.' : locale === 'en' ? 'The demo value is visible and can be reviewed before testing.' : locale === 'es' ? 'El valor demo queda visible y puede revisarse antes de probar.' : 'La valeur démo est visible et peut être vérifiée avant le test.';
    }
    copy[locale] = { title, body, expected: result, alt: `${title} — ${topic}` };
  }
  return copy;
}

function visibleStepName(stepId, locale) {
  const explicit = STEP_NAME_OVERRIDES[stepId];
  if (explicit) return explicit[LOCALES.indexOf(locale)];
  return stepId.split('-').map((word) => word.length <= 3 ? word.toUpperCase() : `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function contextualizeStepCopy(entry, stepId, action, copy) {
  for (const locale of LOCALES) {
    const label = visibleStepName(stepId, locale);
    const topic = entry.topic[locale];
    const test = entry.test[locale];
    const current = copy[locale];
    if (entry.id === 'vdoninja') {
      const vdoSteps = {
        'ninja-card': {
          de: ['VDO.Ninja im Zustand ohne aktiven Raum pruefen', 'Oeffne VDO.Ninja und pruefe zuerst den Statuspunkt. Ohne angelegten Raum sind keine Gast- oder OBS-Steuerungen aktiv.', 'Der echte Startzustand ist sichtbar; es wird kein Raum und keine externe Verbindung erzeugt.'],
          en: ['Check VDO.Ninja with no active room', 'Open VDO.Ninja and check the status indicator first. Until a room exists, guest and OBS controls are not active.', 'The real starting state is visible; no room or external connection is created.'],
          es: ['Comprueba VDO.Ninja sin sala activa', 'Abre VDO.Ninja y revisa primero el indicador de estado. Hasta crear una sala, los controles de invitados y OBS no estan activos.', 'Se ve el estado inicial real; no se crea ninguna sala ni conexion externa.'],
          fr: ['Verifiez VDO.Ninja sans salle active', 'Ouvrez VDO.Ninja et verifiez d abord lindicateur detat. Tant qu aucune salle nexiste, les controles des invites et d OBS ne sont pas actifs.', 'Le vrai etat initial est visible ; aucune salle ni connexion externe nest creee.']
        },
        'placeholder-room': {
          de: ['Namen fuer einen lokalen Testraum festlegen', 'Trage im Feld Room Name einen nicht persoenlichen Testnamen ein. Dieser Schritt bereitet nur die lokale Raumerstellung vor und teilt noch keine Gast-URL.', 'Der echte Nameingabebereich ist sichtbar und kann vor dem Erstellen geprueft werden.'],
          en: ['Set a name for a local test room', 'Enter a non-personal test name in Room Name. This only prepares the local room creation and does not share a guest URL yet.', 'The real name field is visible and can be reviewed before creating a room.'],
          es: ['Define un nombre para una sala local de prueba', 'Introduce un nombre de prueba no personal en Room Name. Solo prepara la creacion local y aun no comparte una URL de invitacion.', 'El campo de nombre real esta visible y puede revisarse antes de crear la sala.'],
          fr: ['Definissez un nom pour une salle de test locale', 'Saisissez un nom de test non personnel dans Room Name. Cela prepare seulement la creation locale et ne partage encore aucune URL dinvitation.', 'Le vrai champ de nom est visible et peut etre verifie avant de creer la salle.']
        },
        'guest-layout': {
          de: ['Vor dem Raumstart ein vorhandenes Gastlayout waehlen', 'Pruefe die vorhandenen Layout-Vorgaben wie Grid oder Solo. Waehle ein Layout erst fuer einen aktiven Raum; die Ansicht verbindet dabei keinen Gast.', 'Die echten Layout-Vorgaben sind sichtbar, ohne einen Gast zu verbinden.'],
          en: ['Choose an available guest layout before starting a room', 'Review the available layout presets such as Grid or Solo. Select one only for an active room; viewing these presets does not connect a guest.', 'The real layout presets are visible without connecting a guest.'],
          es: ['Elige un diseno de invitados disponible antes de iniciar una sala', 'Revisa los preajustes disponibles como Grid o Solo. Elige uno solo para una sala activa; revisar los preajustes no conecta invitados.', 'Los preajustes reales estan visibles sin conectar invitados.'],
          fr: ['Choisissez une disposition dinvites disponible avant de demarrer une salle', 'Verifiez les predefinis disponibles, comme Grid ou Solo. Choisissez-en un seulement pour une salle active ; les consulter ne connecte aucun invite.', 'Les vrais predefinis de disposition sont visibles sans connecter dinvite.']
        },
        'browser-preview': {
          de: ['Lokalen Raum erst nach Namen und Gastlimit erstellen', 'Pruefe Room Name und Max Guests und klicke dann auf den echten Button Create Room. Dadurch wird nur ein lokaler Raumeintrag mit den spaeteren URLs vorbereitet; es wird kein Gast eingeladen.', 'Der echte Create-Room-Button markiert den Beginn des Raum-Workflows.'],
          en: ['Create the local room only after checking its name and guest limit', 'Review Room Name and Max Guests, then click the real Create Room button. This prepares only a local room record with the later URLs; no guest is invited.', 'The real Create Room button marks the start of the room workflow.'],
          es: ['Crea la sala local solo despues de revisar el nombre y limite de invitados', 'Revisa Room Name y Max Guests y luego haz clic en el boton real Create Room. Solo prepara un registro local con las URL posteriores; no invita a ningun invitado.', 'El boton real Create Room marca el inicio del flujo de sala.'],
          fr: ['Creez la salle locale seulement apres avoir verifie son nom et sa limite dinvites', 'Verifiez Room Name et Max Guests, puis cliquez sur le vrai bouton Create Room. Cela prepare uniquement un enregistrement local avec les futures URL ; aucun invite nest convie.', 'Le vrai bouton Create Room marque le debut du workflow de salle.']
        },
        'obs-guest-source': {
          de: ['Die echte OBS-Browserquellen-Reihenfolge beachten', 'Nach dem Erstellen eines Raums zeigt die App die Director URL. Kopiere genau diese URL in eine OBS-Browserquelle mit 1920x1080; die Startansicht zeigt absichtlich noch keine erfundene URL.', 'Die eingebaute Quick Guide beschreibt die reale Reihenfolge: Raum, Director-URL, Gast-Einladung und Steuerung.'],
          en: ['Follow the real OBS browser-source order', 'After creating a room, the app shows the Director URL. Copy that exact URL into an OBS Browser Source at 1920x1080; the starting view deliberately shows no invented URL.', 'The built-in Quick Guide gives the real order: room, Director URL, guest invite, and control.'],
          es: ['Sigue el orden real para la fuente de navegador de OBS', 'Tras crear una sala, la app muestra la Director URL. Copia esa URL exacta en una fuente de navegador OBS de 1920x1080; la vista inicial no muestra una URL inventada.', 'La Quick Guide integrada indica el orden real: sala, Director URL, invitacion de invitados y control.'],
          fr: ['Suivez le vrai ordre pour la source navigateur OBS', 'Apres creation dune salle, lapp affiche la Director URL. Copiez cette URL exacte dans une source navigateur OBS en 1920x1080 ; la vue initiale naffiche volontairement aucune URL inventee.', 'Le Quick Guide integre donne lordre reel : salle, Director URL, invitation dinvites et controle.']
        },
        'ninja-reset': {
          de: ['Keinen erfundenen Reset im leeren Raumzustand suchen', 'VDO.Ninja zeigt ohne aktiven Raum keine Reset-Schaltflaeche und keine verbundenen Gaeste. Wenn du einen lokalen Testraum erstellt hast, beendet Close Room diesen ueber den echten Raumdialog.', 'Die leere Gastansicht bestaetigt den Ausgangszustand ohne Raum und ohne verbundene Gaeste.'],
          en: ['Do not look for an invented reset in the empty-room state', 'With no active room, VDO.Ninja shows neither a reset control nor connected guests. If you created a local test room, Close Room ends it through the real room dialog.', 'The empty guest view confirms the starting state: no room and no connected guests.'],
          es: ['No busques un reinicio inventado en el estado sin sala', 'Sin sala activa, VDO.Ninja no muestra control de reinicio ni invitados conectados. Si creaste una sala local de prueba, Close Room la termina mediante el dialogo real.', 'La vista vacia de invitados confirma el estado inicial: sin sala ni invitados conectados.'],
          fr: ['Ne cherchez pas de reinitialisation inventee dans letat sans salle', 'Sans salle active, VDO.Ninja naffiche ni controle de reinitialisation ni invite connecte. Si vous avez cree une salle de test locale, Close Room y met fin via le vrai dialogue de salle.', 'La vue vide des invites confirme letat initial : aucune salle et aucun invite connecte.']
        }
      };
      const vdoCopy = vdoSteps[stepId]?.[locale];
      if (vdoCopy) [current.title, current.body, current.expected] = vdoCopy;
    } else if (entry.id === 'coinbattle' && stepId === 'battle-overlay') {
      current.title = locale === 'de' ? 'Die echte Coinbattle-URL als OBS-Browserquelle kopieren' : locale === 'en' ? 'Copy the real Coinbattle URL into an OBS Browser Source' : locale === 'es' ? 'Copia la URL real de Coinbattle en una fuente de navegador OBS' : 'Copiez la vraie URL Coinbattle dans une source navigateur OBS';
      current.body = locale === 'de' ? 'Kopiere die sichtbare OBS Browser Source URL aus der Coinbattle-Konfiguration. Erst ein lokales Testmatch fuellt das Overlay; eine leere Overlay-Leinwand wird nicht als Spielansicht ausgegeben.' : locale === 'en' ? 'Copy the visible OBS Browser Source URL from the Coinbattle configuration. Only a local test match populates the overlay; an empty overlay canvas is not presented as game output.' : locale === 'es' ? 'Copia la URL visible de OBS Browser Source desde la configuracion de Coinbattle. Solo una partida local de prueba llena el overlay; un lienzo vacio no se presenta como salida del juego.' : 'Copiez lURL visible de source navigateur OBS depuis la configuration Coinbattle. Seul un match de test local remplit loverlay ; une toile vide nest pas presentee comme sortie de jeu.';
      current.expected = locale === 'de' ? 'Die konkrete Browserquellen-URL ist sichtbar und kann vor dem Testmatch kopiert werden.' : locale === 'en' ? 'The concrete Browser Source URL is visible and can be copied before the test match.' : locale === 'es' ? 'La URL concreta de la fuente de navegador queda visible y puede copiarse antes de la partida de prueba.' : 'LURL concrete de source navigateur est visible et peut etre copiee avant le match de test.';
    } else if (entry.id === 'clarityhud' && stepId === 'obs-hud-source') {
      current.title = locale === 'de' ? 'Die echte Full-HUD-URL als OBS-Browserquelle verwenden' : locale === 'en' ? 'Use the real Full HUD URL as an OBS Browser Source' : locale === 'es' ? 'Usa la URL real de Full HUD como fuente de navegador OBS' : 'Utilisez la vraie URL Full HUD comme source navigateur OBS';
      current.body = locale === 'de' ? 'Kopiere die sichtbare Full-HUD-URL und fuege sie in eine OBS-Browserquelle ein. Ein leeres Overlay zeigt ohne Ereignisdaten absichtlich nichts; die URL in der Konfiguration ist der echte Einstieg.' : locale === 'en' ? 'Copy the visible Full HUD URL into an OBS Browser Source. An overlay intentionally shows nothing without event data; the configuration URL is the real entry point.' : locale === 'es' ? 'Copia la URL visible de Full HUD en una fuente de navegador OBS. Un overlay no muestra nada intencionalmente sin datos de eventos; la URL de configuracion es la entrada real.' : 'Copiez lURL Full HUD visible dans une source navigateur OBS. Un overlay naffiche volontairement rien sans donnees devenement ; lURL de configuration est le vrai point dentree.';
      current.expected = locale === 'de' ? 'Die konkrete Full-HUD-URL ist sichtbar und kann ohne erfundene Overlay-Inhalte kopiert werden.' : locale === 'en' ? 'The concrete Full HUD URL is visible and can be copied without invented overlay content.' : locale === 'es' ? 'La URL concreta de Full HUD queda visible y puede copiarse sin contenido de overlay inventado.' : 'LURL Full HUD concrete est visible et peut etre copiee sans contenu overlay invente.';
    } else if (entry.id === 'multicam' && stepId === 'camera-source') {
      current.title = locale === 'de' ? 'OBS vor einer Szenenzuordnung verbinden' : locale === 'en' ? 'Connect OBS before assigning a scene' : locale === 'es' ? 'Conecta OBS antes de asignar una escena' : 'Connectez OBS avant dattribuer une scene';
      current.body = locale === 'de' ? 'Die echte Multicam-Oberflaeche zeigt den Button „OBS verbinden“. Richte die OBS-Verbindung in LTTH ein und verbinde erst dann; ohne diese Verbindung wird keine Kamera- oder Szenenliste erfunden.' : locale === 'en' ? 'The real Multicam surface shows the “Connect OBS” button. Configure the OBS connection in LTTH and connect only then; without it, no camera or scene list is invented.' : locale === 'es' ? 'La superficie real de Multicam muestra el boton «Connect OBS». Configura la conexion OBS en LTTH y conectala solo entonces; sin ella no se inventa ninguna lista de camaras ni escenas.' : 'La vraie interface Multicam affiche le bouton « Connect OBS ». Configurez la connexion OBS dans LTTH, puis connectez-vous ; sans elle, aucune liste de cameras ou de scenes nest inventee.';
      current.expected = locale === 'de' ? 'Der echte OBS-Verbindungs-Einstieg ist sichtbar.' : locale === 'en' ? 'The real OBS connection entry point is visible.' : locale === 'es' ? 'La entrada real de conexion OBS queda visible.' : 'Le vrai point dentree de connexion OBS est visible.';
    } else if (entry.id === 'multicam' && stepId === 'scene-rule') {
      current.title = locale === 'de' ? 'Eine Szene erst aus der echten OBS-Liste waehlen' : locale === 'en' ? 'Choose a scene only from the real OBS list' : locale === 'es' ? 'Elige una escena solo de la lista OBS real' : 'Choisissez une scene uniquement dans la vraie liste OBS';
      current.body = locale === 'de' ? 'Nach erfolgreicher OBS-Verbindung waehle eine vorhandene Szene im Szenen-Dropdown und nutze erst dann „Wechseln“. Bleibt OBS getrennt, ist eine leere Liste der korrekte Zustand.' : locale === 'en' ? 'After OBS connects, choose an existing scene in the scene drop-down and only then use “Switch”. While OBS is disconnected, an empty list is the correct state.' : locale === 'es' ? 'Tras conectar OBS, elige una escena existente en el desplegable y solo entonces usa «Switch». Mientras OBS este desconectado, una lista vacia es el estado correcto.' : 'Apres connexion d OBS, choisissez une scene existante dans la liste deroulante, puis utilisez « Switch ». Tant qu OBS est deconnecte, une liste vide est letat correct.';
      current.expected = locale === 'de' ? 'Der echte Szenen-Dropdown zeigt nur von OBS gelieferte Szenen.' : locale === 'en' ? 'The real scene drop-down shows only scenes supplied by OBS.' : locale === 'es' ? 'El desplegable real muestra solo escenas proporcionadas por OBS.' : 'La vraie liste de scenes naffiche que les scenes fournies par OBS.';
    } else if (entry.id === 'webgpu-fireworks' && stepId === 'gpu-fireworks-test') {
      current.title = locale === 'de' ? 'Den eingebauten WebGPU-Feuerwerkstest lokal ausloesen' : locale === 'en' ? 'Trigger the built-in WebGPU fireworks test locally' : locale === 'es' ? 'Activa localmente la prueba integrada de fuegos WebGPU' : 'Declenchez localement le test integre de feux dartifice WebGPU';
      current.body = locale === 'de' ? 'Klicke auf den echten Button „Test Firework“. Er loest das eingebaute lokale Testereignis aus; weder TikTok LIVE noch eine externe Quelle wird verbunden.' : locale === 'en' ? 'Click the real “Test Firework” button. It triggers the built-in local test event; neither TikTok LIVE nor an external source is connected.' : locale === 'es' ? 'Haz clic en el boton real «Test Firework». Activa el evento de prueba local integrado; no conecta TikTok LIVE ni una fuente externa.' : 'Cliquez sur le vrai bouton « Test Firework ». Il declenche levenement de test local integre ; ni TikTok LIVE ni source externe nest connecte.';
      current.expected = locale === 'de' ? 'Die echte Test-Rueckmeldung ist nach dem lokalen Ausloesen sichtbar.' : locale === 'en' ? 'The real test feedback is visible after the local trigger.' : locale === 'es' ? 'La respuesta real de prueba queda visible tras el disparo local.' : 'Le vrai retour du test est visible apres le declenchement local.';
    } else if (entry.id === 'advanced-timer' && stepId === 'countdown-preview') {
      current.title = locale === 'de' ? 'Lokalen Countdown auf dem Timer-Dashboard pruefen' : locale === 'en' ? 'Verify a local countdown on the timer dashboard' : locale === 'es' ? 'Comprueba una cuenta atras local en el panel del temporizador' : 'Verifiez un compte a rebours local sur le tableau de bord';
      current.body = locale === 'de' ? 'Oeffne „Create Timer“, gib den lokalen Demo-Namen und die Dauer ein und klicke auf „Create Timer“. Die Aufnahme verwendet nur das temporaere Testprofil und startet keine LIVE-Ausgabe.' : locale === 'en' ? 'Open “Create Timer”, enter the local demo name and duration, then click “Create Timer”. The capture uses only the temporary test profile and starts no LIVE output.' : locale === 'es' ? 'Abre «Create Timer», introduce el nombre demo local y la duracion, y haz clic en «Create Timer». La captura usa solo el perfil temporal y no inicia ninguna salida LIVE.' : 'Ouvrez « Create Timer », saisissez le nom de demonstration local et la duree, puis cliquez sur « Create Timer ». La capture utilise uniquement le profil temporaire et ne demarre aucune sortie LIVE.';
      current.expected = locale === 'de' ? 'Die neue Countdown-Karte ist im echten Timer-Dashboard sichtbar.' : locale === 'en' ? 'The new countdown card is visible in the real timer dashboard.' : locale === 'es' ? 'La nueva tarjeta de cuenta atras queda visible en el panel real.' : 'La nouvelle carte de compte a rebours est visible sur le vrai tableau de bord.';
    } else if (entry.id === 'data-source' && stepId === 'data-preview') {
      current.title = locale === 'de' ? 'Lokalen TikFinity-Port speichern und Rueckmeldung pruefen' : locale === 'en' ? 'Save the local TikFinity port and review the response' : locale === 'es' ? 'Guarda el puerto local de TikFinity y revisa la respuesta' : 'Enregistrez le port TikFinity local et verifiez la reponse';
      current.body = locale === 'de' ? 'Nach der Auswahl von „TikFinity“ klicke auf „Einstellungen speichern“. Der Port wird ausschliesslich im isolierten Testprofil gespeichert; es wird keine TikTok-Verbindung aufgebaut.' : locale === 'en' ? 'After selecting “TikFinity”, click “Save settings”. The port is saved only in the isolated test profile; no TikTok connection is created.' : locale === 'es' ? 'Despues de seleccionar «TikFinity», haz clic en «Guardar configuracion». El puerto se guarda solo en el perfil aislado; no se crea conexion con TikTok.' : 'Apres avoir selectionne « TikFinity », cliquez sur « Enregistrer les reglages ». Le port est enregistre uniquement dans le profil isole ; aucune connexion TikTok n est creee.';
      current.expected = locale === 'de' ? 'Die echte Erfolgsmeldung bestaetigt die gespeicherten lokalen Einstellungen.' : locale === 'en' ? 'The real success message confirms the saved local settings.' : locale === 'es' ? 'El mensaje real de exito confirma los ajustes locales guardados.' : 'Le vrai message de succes confirme les reglages locaux enregistres.';
    } else if (entry.id === 'config-import' && stepId === 'backup-cleanup') {
      current.title = locale === 'de' ? 'Test-Backup erstellen und Ergebnis pruefen' : locale === 'en' ? 'Create a test backup and review the result' : locale === 'es' ? 'Crea una copia de prueba y revisa el resultado' : 'Creez une sauvegarde de test et verifiez le resultat';
      current.body = locale === 'de' ? 'Klicke im isolierten Testprofil auf „Download Backup“. Die Ergebnis-Karte bestaetigt die lokale Test-Sicherung; weder Import noch produktive Daten werden veraendert.' : locale === 'en' ? 'In the isolated test profile, click “Download Backup”. The result card confirms the local test backup; neither an import nor production data is changed.' : locale === 'es' ? 'En el perfil de prueba aislado, haz clic en «Descargar copia de seguridad». La tarjeta de resultado confirma la copia local; no se modifica ninguna importacion ni dato de produccion.' : 'Dans le profil de test isole, cliquez sur « Telecharger la sauvegarde ». La carte de resultat confirme la sauvegarde locale ; aucun import ni donnees de production ne sont modifies.';
      current.expected = locale === 'de' ? 'Die Karte „Backup Created“ zeigt die erstellte Test-Sicherung.' : locale === 'en' ? 'The “Backup Created” card shows the generated test backup.' : locale === 'es' ? 'La tarjeta «Backup Created» muestra la copia de prueba generada.' : 'La carte « Backup Created » affiche la sauvegarde de test generee.';
    } else if (entry.id === 'fireworks' && stepId === 'fireworks-test') {
      current.title = locale === 'de' ? 'Lokales Test-Feuerwerk ausloesen' : locale === 'en' ? 'Trigger a local test firework' : locale === 'es' ? 'Activa un fuego artificial local de prueba' : 'Declenchez un feu d artifice de test local';
      current.body = locale === 'de' ? 'Klicke im isolierten Testprofil auf den echten Button „Test Firework“. Der Test sendet nur an die lokale Vorschau und verwendet weder eine LIVE-Quelle noch ein externes Geraet.' : locale === 'en' ? 'In the isolated test profile, click the real “Test Firework” button. The test targets only the local preview and uses neither a LIVE source nor an external device.' : locale === 'es' ? 'En el perfil de prueba aislado, haz clic en el boton real «Test Firework». La prueba solo llega a la vista previa local y no usa una fuente LIVE ni un dispositivo externo.' : 'Dans le profil de test isole, cliquez sur le vrai bouton « Test Firework ». Le test cible uniquement l apercu local et n utilise ni source LIVE ni appareil externe.';
      current.expected = locale === 'de' ? 'Die echte Erfolgsmeldung bestaetigt das ausgeloeste Test-Feuerwerk.' : locale === 'en' ? 'The real success message confirms that the test firework was triggered.' : locale === 'es' ? 'El mensaje real de exito confirma que se activo el fuego artificial de prueba.' : 'Le vrai message de succes confirme le declenchement du feu d artifice de test.';
    } else if (entry.id === 'fireworks' && stepId === 'fireworks-reset') {
      current.title = locale === 'de' ? 'Isolierte Fireworks-Einstellungen speichern' : locale === 'en' ? 'Save the isolated Fireworks settings' : locale === 'es' ? 'Guarda los ajustes aislados de Fireworks' : 'Enregistrez les reglages Fireworks isoles';
      current.body = locale === 'de' ? 'Pruefe die sichtbaren Testwerte und klicke auf „Save Settings“. Gespeichert wird ausschliesslich im temporaeren Capture-Profil; ein Reset ist nicht erforderlich und produktive Einstellungen bleiben unveraendert.' : locale === 'en' ? 'Review the visible test values and click “Save Settings”. This writes only to the temporary capture profile; no reset is required and production settings stay unchanged.' : locale === 'es' ? 'Revisa los valores de prueba visibles y haz clic en «Save Settings». Solo se guarda en el perfil temporal de captura; no hace falta restablecer y los ajustes de produccion no cambian.' : 'Verifiez les valeurs de test visibles et cliquez sur « Save Settings ». L enregistrement concerne uniquement le profil temporaire de capture ; aucune reinitialisation n est necessaire et les reglages de production restent inchanges.';
      current.expected = locale === 'de' ? 'Die echte Erfolgsmeldung bestaetigt die gespeicherten Test-Einstellungen.' : locale === 'en' ? 'The real success message confirms that the test settings were saved.' : locale === 'es' ? 'El mensaje real de exito confirma que se guardaron los ajustes de prueba.' : 'Le vrai message de succes confirme l enregistrement des reglages de test.';
    } else if (entry.id === 'interactive-story' && stepId === 'local-decision') {
      current.title = locale === 'de' ? 'Lokale Voting-Vorschau oeffnen und testen' : locale === 'en' ? 'Open and test the local voting preview' : locale === 'es' ? 'Abre y prueba la vista previa local de voto' : 'Ouvrez et testez l apercu de vote local';
      current.body = locale === 'de' ? 'Klicke im Demo-Modus zuerst auf „Show preview“. Danach ist der echte Button „Test Voting Choices“ sichtbar; er sendet nur die eingebauten Beispieloptionen an die lokale Vorschau und ruft weder ein Modell noch einen externen Dienst auf.' : locale === 'en' ? 'In demo mode, first click “Show preview”. The real “Test Voting Choices” button then becomes visible; it sends only the built-in sample choices to the local preview and calls neither a model nor an external service.' : locale === 'es' ? 'En modo demo, primero haz clic en «Show preview». Entonces aparece el boton real «Test Voting Choices»; solo envia las opciones de ejemplo integradas a la vista previa local y no llama a un modelo ni a un servicio externo.' : 'En mode demonstration, cliquez d abord sur « Show preview ». Le vrai bouton « Test Voting Choices » devient alors visible ; il envoie uniquement les choix exemples integres vers l apercu local et n appelle ni modele ni service externe.';
      current.expected = locale === 'de' ? 'Die lokale Vorschau erhaelt die echten Beispieloptionen.' : locale === 'en' ? 'The local preview receives the real sample choices.' : locale === 'es' ? 'La vista previa local recibe las opciones de ejemplo reales.' : 'L apercu local recoit les vrais choix exemples.';
    } else if (entry.id === 'interactive-story' && stepId === 'story-overlay') {
      current.title = locale === 'de' ? 'Echten Story-Overlay-Einstieg pruefen' : locale === 'en' ? 'Review the real Story overlay entry point' : locale === 'es' ? 'Revisa la entrada real del overlay de historias' : 'Verifiez le vrai point d entree de l overlay Story';
      current.body = locale === 'de' ? 'Nutze in der Konfiguration den echten Button „Open Overlay“, um die Browserquelle zu pruefen. Ohne eine gestartete lokale Story bleibt das Overlay absichtlich leer; es werden keine Demo-Inhalte eingeblendet.' : locale === 'en' ? 'Use the real “Open Overlay” button in the configuration to check the browser source. Until a local story has started, the overlay intentionally stays empty; no demo content is injected.' : locale === 'es' ? 'Usa el boton real «Open Overlay» de la configuracion para comprobar la fuente del navegador. Hasta que inicies una historia local, el overlay queda vacio intencionadamente; no se inyecta contenido demo.' : 'Utilisez le vrai bouton « Open Overlay » dans la configuration pour verifier la source navigateur. Tant qu aucune story locale n a demarre, l overlay reste volontairement vide ; aucun contenu de demonstration n est injecte.';
      current.expected = locale === 'de' ? 'Der echte Overlay-Einstieg ist sichtbar, ohne ein Story-Ereignis vorzutäuschen.' : locale === 'en' ? 'The real overlay entry point is visible without simulating a story event.' : locale === 'es' ? 'La entrada real del overlay queda visible sin simular un evento de historia.' : 'Le vrai point d entree de l overlay est visible sans simuler un evenement Story.';
    } else if (entry.id === 'store-admin' && stepId === 'store-card') {
      current.title = locale === 'de' ? 'Store im abgemeldeten Ausgangszustand oeffnen' : locale === 'en' ? 'Open the Store in its signed-out starting state' : locale === 'es' ? 'Abre la tienda en su estado inicial sin sesion' : 'Ouvrez le Store dans son etat initial deconnecte';
      current.body = locale === 'de' ? 'Oeffne Plugins im Dashboard. Ohne LTTH-Konto zeigt der Store bewusst den echten Account-Dialog statt einer Paketliste; es wird keine Quelle aktiviert.' : locale === 'en' ? 'Open Plugins in the dashboard. Without an LTTH account, the Store deliberately shows the real account dialog rather than a package list; no source is enabled.' : locale === 'es' ? 'Abre Plugins en el panel. Sin una cuenta LTTH, la tienda muestra deliberadamente el dialogo real de cuenta en lugar de una lista de paquetes; no se activa ninguna fuente.' : 'Ouvrez Plugins dans le tableau de bord. Sans compte LTTH, le Store affiche volontairement le vrai dialogue de compte au lieu dune liste de paquets ; aucune source nest activee.';
      current.expected = locale === 'de' ? 'Der echte Account-Dialog ist sichtbar und es werden keine Pakete oder Quellen veraendert.' : locale === 'en' ? 'The real account dialog is visible and no package or source has changed.' : locale === 'es' ? 'El dialogo real de cuenta queda visible y no cambia ningun paquete ni fuente.' : 'Le vrai dialogue de compte est visible et aucun paquet ni source na change.';
    } else if (entry.id === 'store-admin' && stepId === 'official-source') {
      current.title = locale === 'de' ? 'Vor der offiziellen Paketliste sicher anmelden' : locale === 'en' ? 'Sign in safely before browsing official packages' : locale === 'es' ? 'Inicia sesion de forma segura antes de ver paquetes oficiales' : 'Connectez-vous en securite avant de parcourir les paquets officiels';
      current.body = locale === 'de' ? 'Klicke erst nach einer bewussten Entscheidung auf „Sign in“. Der Account-Bridge oeffnet ltth.app und kehrt danach zur lokalen App zurueck; diese Anleitung zeigt keine erfundene Paketquelle vor der Anmeldung.' : locale === 'en' ? 'Click “Sign in” only after a deliberate decision. The account bridge opens ltth.app and then returns to the local app; this guide does not invent a package source before sign-in.' : locale === 'es' ? 'Haz clic en «Sign in» solo tras decidirlo conscientemente. El puente de cuenta abre ltth.app y luego vuelve a la aplicacion local; esta guia no inventa una fuente de paquetes antes de iniciar sesion.' : 'Cliquez sur « Sign in » seulement apres une decision consciente. Le bridge de compte ouvre ltth.app puis revient vers l application locale ; ce guide ninvente pas de source de paquets avant connexion.';
      current.expected = locale === 'de' ? 'Der echte Sign-in-Einstieg ist sichtbar, ohne den externen Login auszufuehren.' : locale === 'en' ? 'The real sign-in entry point is visible without performing the external login.' : locale === 'es' ? 'La entrada real de inicio de sesion queda visible sin ejecutar el login externo.' : 'Le vrai point dentree de connexion est visible sans effectuer le login externe.';
    } else if (entry.id === 'store-admin' && stepId === 'package-status') {
      current.title = locale === 'de' ? 'Paketstatus erst nach erfolgreicher Anmeldung erwarten' : locale === 'en' ? 'Expect package status only after successful sign-in' : locale === 'es' ? 'Espera el estado de paquetes solo despues de iniciar sesion' : 'Attendez letat des paquets seulement apres une connexion reussie';
      current.body = locale === 'de' ? 'Im abgemeldeten Zustand zeigt der Store keinen Paketstatus und keine Suchliste. Melde dich an und kehre zur lokalen App zurueck, bevor du Installations- oder Update-Status bewertest.' : locale === 'en' ? 'While signed out, the Store shows neither package status nor a search list. Sign in and return to the local app before assessing installation or update status.' : locale === 'es' ? 'Sin sesion, la tienda no muestra estado de paquetes ni lista de busqueda. Inicia sesion y vuelve a la aplicacion local antes de evaluar instalaciones o actualizaciones.' : 'Lorsque vous etes deconnecte, le Store naffiche ni etat de paquet ni liste de recherche. Connectez-vous et revenez a l application locale avant devaluer installations ou mises a jour.';
      current.expected = locale === 'de' ? 'Der sichtbare Sign-in-Button erklaert, warum noch kein Paketstatus angezeigt wird.' : locale === 'en' ? 'The visible Sign in button explains why no package status is shown yet.' : locale === 'es' ? 'El boton Sign in visible explica por que aun no se muestra estado de paquetes.' : 'Le bouton Sign in visible explique pourquoi aucun etat de paquet nest encore affiche.';
    } else if (entry.id === 'store-admin' && stepId === 'store-inspection') {
      current.title = locale === 'de' ? 'LTTH-Konto vor der Store-Inspektion erstellen' : locale === 'en' ? 'Create an LTTH account before Store inspection' : locale === 'es' ? 'Crea una cuenta LTTH antes de inspeccionar la tienda' : 'Creez un compte LTTH avant dinspecter le Store';
      current.body = locale === 'de' ? 'Nutze bei Bedarf „Create account“. Der externe Account-Flow ist absichtlich nicht Teil der lokalen Screenshot-Aufnahme; nach der Rueckkehr kannst du offizielle Pakete pruefen.' : locale === 'en' ? 'Use “Create account” when needed. The external account flow is intentionally not part of the local screenshot capture; after returning, you can review official packages.' : locale === 'es' ? 'Usa «Create account» si lo necesitas. El flujo externo de cuenta no forma parte intencionalmente de la captura local; tras volver puedes revisar paquetes oficiales.' : 'Utilisez « Create account » si necessaire. Le flux de compte externe ne fait volontairement pas partie de la capture locale ; apres votre retour, vous pouvez verifier les paquets officiels.';
      current.expected = locale === 'de' ? 'Der echte Create-account-Einstieg ist sichtbar, ohne einen Account anzulegen.' : locale === 'en' ? 'The real Create account entry point is visible without creating an account.' : locale === 'es' ? 'La entrada real Create account queda visible sin crear una cuenta.' : 'Le vrai point dentree Create account est visible sans creer de compte.';
    } else if (entry.id === 'store-admin' && stepId === 'store-review') {
      current.title = locale === 'de' ? 'Store-Accountzugang vor dem Verlassen pruefen' : locale === 'en' ? 'Review Store account access before leaving' : locale === 'es' ? 'Revisa el acceso de cuenta de la tienda antes de salir' : 'Verifiez lacces au compte Store avant de quitter';
      current.body = locale === 'de' ? 'Der Sign-in-Button im Store-Kopf ist der echte Einstieg zum Konto. Ohne Anmeldung bleiben Paketlisten, Kauf- und Installationsaktionen bewusst gesperrt.' : locale === 'en' ? 'The Sign in button in the Store header is the real account entry point. Until you sign in, package lists, purchase actions, and installs intentionally stay unavailable.' : locale === 'es' ? 'El boton Sign in en la cabecera de la tienda es la entrada real de cuenta. Hasta iniciar sesion, las listas de paquetes, compras e instalaciones permanecen intencionalmente no disponibles.' : 'Le bouton Sign in dans len-tete du Store est le vrai point dentree de compte. Tant que vous ne vous connectez pas, listes de paquets, achats et installations restent volontairement indisponibles.';
      current.expected = locale === 'de' ? 'Der echte Header-Sign-in ist sichtbar; die Aufnahme loest keinen Login aus.' : locale === 'en' ? 'The real header Sign in is visible; the capture triggers no login.' : locale === 'es' ? 'El Sign in real de la cabecera queda visible; la captura no inicia ningun login.' : 'Le vrai Sign in de len-tete est visible ; la capture ne declenche aucun login.';
    } else if (entry.id === 'spotlight' && stepId === 'event-style') {
      current.title = locale === 'de' ? 'Chatter-Design im echten Settings-Dialog pruefen' : locale === 'en' ? 'Review the Chatter design in the real Settings dialog' : locale === 'es' ? 'Revisa el diseno Chatter en el dialogo real de ajustes' : 'Verifiez le design Chatter dans la vraie boite de reglages';
      current.body = locale === 'de' ? 'Oeffne auf der Chatter-Karte „Settings“ und waehle dort eine vorhandene Design-Variante. Speichere erst nach einer eigenen Pruefung; die Aufnahme aendert keine produktive Overlay-Konfiguration.' : locale === 'en' ? 'On the Chatter card, open “Settings” and choose one of the available design variants. Save only after your own review; the capture does not change a production overlay configuration.' : locale === 'es' ? 'En la tarjeta Chatter, abre «Settings» y elige una variante de diseno disponible. Guarda solo tras revisarla; la captura no cambia una configuracion de overlay de produccion.' : 'Sur la carte Chatter, ouvrez « Settings » et choisissez une variante de design disponible. Enregistrez seulement apres verification ; la capture ne modifie aucune configuration overlay de production.';
      current.expected = locale === 'de' ? 'Der echte Settings-Dialog zeigt die fuer Chatter verfuegbaren Designfelder.' : locale === 'en' ? 'The real Settings dialog shows the design fields available for Chatter.' : locale === 'es' ? 'El dialogo real muestra los campos de diseno disponibles para Chatter.' : 'La vraie boite de reglages affiche les champs de design disponibles pour Chatter.';
    } else if (entry.id === 'spotlight' && stepId === 'display-duration') {
      current.title = locale === 'de' ? 'Keinen erfundenen Display-Timer konfigurieren' : locale === 'en' ? 'Do not configure an invented display timer' : locale === 'es' ? 'No configures un temporizador de pantalla inventado' : 'Ne configurez pas de minuteur d affichage invente';
      current.body = locale === 'de' ? 'Spotlight bietet in diesem Dialog keine separate „Display Duration“. Nutze stattdessen die echten Animations- und Trigger-Einstellungen; die Sichtbarkeit wird vom ausgelosten Overlay-Ereignis bestimmt.' : locale === 'en' ? 'Spotlight has no separate “Display Duration” in this dialog. Use the real animation and trigger settings instead; visibility is determined by the triggered overlay event.' : locale === 'es' ? 'Spotlight no ofrece una «Display Duration» separada en este dialogo. Usa los ajustes reales de animacion y disparador; la visibilidad depende del evento de overlay activado.' : 'Spotlight ne propose pas de « Display Duration » separee dans cette boite. Utilisez les vrais reglages d animation et de declencheur ; la visibilite depend de l evenement overlay declenche.';
      current.expected = locale === 'de' ? 'Der sichtbare Speichern-Button bestaetigt den echten Abschluss des Settings-Workflows.' : locale === 'en' ? 'The visible Save button marks the real end of the Settings workflow.' : locale === 'es' ? 'El boton Guardar visible marca el final real del flujo de ajustes.' : 'Le bouton Enregistrer visible marque la vraie fin du workflow de reglages.';
    } else if (entry.id === 'spotlight' && stepId === 'chatter-preview') {
      current.title = locale === 'de' ? 'Chatter-Vorschau mit dem echten Test ausloesen' : locale === 'en' ? 'Trigger the Chatter preview with the real test' : locale === 'es' ? 'Activa la vista previa Chatter con la prueba real' : 'Declenchez l apercu Chatter avec le vrai test';
      current.body = locale === 'de' ? 'Klicke auf der Chatter-Karte auf „Preview“ und dann im Dialog auf „Test“. Das Ereignis wird nur im isolierten lokalen Profil gesendet; keine OBS- oder LIVE-Quelle wird geaendert.' : locale === 'en' ? 'On the Chatter card, click “Preview” and then “Test” in the dialog. The event is sent only in the isolated local profile; no OBS or LIVE source is changed.' : locale === 'es' ? 'En la tarjeta Chatter, haz clic en «Preview» y luego en «Test» dentro del dialogo. El evento se envia solo en el perfil local aislado; no cambia ninguna fuente OBS ni LIVE.' : 'Sur la carte Chatter, cliquez sur « Preview », puis sur « Test » dans la boite. L evenement est envoye uniquement dans le profil local isole ; aucune source OBS ou LIVE n est modifiee.';
      current.expected = locale === 'de' ? 'Der Test-Button ist in der echten Vorschau sichtbar.' : locale === 'en' ? 'The Test button is visible in the real preview.' : locale === 'es' ? 'El boton Test queda visible en la vista previa real.' : 'Le bouton Test est visible dans le vrai apercu.';
    } else if (entry.id === 'spotlight' && stepId === 'spotlight-overlay') {
      current.title = locale === 'de' ? 'Echtes Spotlight-Overlay im Preview-Rahmen pruefen' : locale === 'en' ? 'Review the real Spotlight overlay in the preview frame' : locale === 'es' ? 'Revisa el overlay Spotlight real en el marco de vista previa' : 'Verifiez le vrai overlay Spotlight dans le cadre d apercu';
      current.body = locale === 'de' ? 'Die Vorschau wird ueber den echten „Preview“-Einstieg der Chatter-Karte geoeffnet. Der lokale Test liefert das Ereignis an diesen Rahmen; es werden keine Inhalte in ein leeres Overlay eingesetzt.' : locale === 'en' ? 'Open the preview through the real “Preview” entry point on the Chatter card. The local test sends its event to that frame; no content is inserted into an empty overlay.' : locale === 'es' ? 'Abre la vista previa mediante la entrada real «Preview» de la tarjeta Chatter. La prueba local envia su evento a ese marco; no se inserta contenido en un overlay vacio.' : 'Ouvrez l apercu depuis le vrai point d entree « Preview » de la carte Chatter. Le test local envoie son evenement vers ce cadre ; aucun contenu n est insere dans un overlay vide.';
      current.expected = locale === 'de' ? 'Der echte Preview-Rahmen bleibt sichtbar und ist fuer eine OBS-Testquelle nachvollziehbar.' : locale === 'en' ? 'The real preview frame remains visible and can be reviewed for an OBS test source.' : locale === 'es' ? 'El marco de vista previa real permanece visible y puede revisarse para una fuente de prueba OBS.' : 'Le vrai cadre d apercu reste visible et peut etre verifie pour une source OBS de test.';
    } else if (entry.id === 'spotlight' && stepId === 'spotlight-reset') {
      current.title = locale === 'de' ? 'Spotlight-Vorschau sauber schliessen' : locale === 'en' ? 'Close the Spotlight preview cleanly' : locale === 'es' ? 'Cierra la vista previa Spotlight correctamente' : 'Fermez proprement l apercu Spotlight';
      current.body = locale === 'de' ? 'Nutze im echten Vorschau-Dialog „Close“. Das beendet nur die lokale Vorschau; es loescht keine Einstellungen und aendert keine produktive Browser-Quelle.' : locale === 'en' ? 'Use “Close” in the real preview dialog. It ends only the local preview; it neither deletes settings nor changes a production browser source.' : locale === 'es' ? 'Usa «Close» en el dialogo real de vista previa. Solo termina la vista previa local; no borra ajustes ni cambia una fuente de navegador de produccion.' : 'Utilisez « Close » dans la vraie boite d apercu. Cela termine seulement l apercu local ; aucun reglages ni source navigateur de production ne sont modifies.';
      current.expected = locale === 'de' ? 'Der echte Close-Button ist vor dem Verlassen der Vorschau sichtbar.' : locale === 'en' ? 'The real Close button is visible before leaving the preview.' : locale === 'es' ? 'El boton Close real queda visible antes de salir de la vista previa.' : 'Le vrai bouton Close est visible avant de quitter l apercu.';
    } else if (action === 'open-local-settings') {
      current.title = locale === 'de' ? `${label}: Einstellungen oeffnen` : locale === 'en' ? `Open settings for ${label}` : locale === 'es' ? `Abre los ajustes de ${label}` : `Ouvrez les reglages de ${label}`;
      current.body = locale === 'de' ? `Klicke auf den echten Button „Settings“ der Chat-HUD-Karte. Es wird nur der lokale Einstellungsdialog geoeffnet; die Reset-Schaltflaeche wird nicht ausgefuehrt.` : locale === 'en' ? 'Click the real “Settings” button on the Chat HUD card. This opens only the local settings dialog; do not run the reset control.' : locale === 'es' ? 'Haz clic en el boton real «Settings» de la tarjeta Chat HUD. Solo abre el dialogo de ajustes local; no ejecutes el control de restablecimiento.' : 'Cliquez sur le vrai bouton « Settings » de la carte Chat HUD. Il ouvre uniquement la boite de dialogue locale ; n executez pas la commande de reinitialisation.';
      current.expected = locale === 'de' ? 'Im Einstellungsdialog ist „Reset to Defaults“ sichtbar, ohne dass Einstellungen geaendert wurden.' : locale === 'en' ? '“Reset to Defaults” is visible in the settings dialog without changing any settings.' : locale === 'es' ? '«Reset to Defaults» queda visible en el dialogo sin cambiar ningun ajuste.' : '« Reset to Defaults » est visible dans la boite de dialogue sans modifier aucun reglage.';
    } else if (action === 'select-local-source') {
      current.title = locale === 'de' ? `${label}: lokale TikFinity-Quelle auswaehlen` : locale === 'en' ? `Select the local TikFinity source for ${label}` : locale === 'es' ? `Selecciona la fuente local TikFinity para ${label}` : `Selectionnez la source TikFinity locale pour ${label}`;
      current.body = locale === 'de' ? 'Klicke auf die echte Karte „TikFinity“. Das waehlt nur die lokale WebSocket-Quelle im isolierten Testprofil; es stellt keine TikTok- oder externe Verbindung her.' : locale === 'en' ? 'Click the real “TikFinity” card. It selects only the local WebSocket source in the isolated test profile; it does not connect to TikTok or any external service.' : locale === 'es' ? 'Haz clic en la tarjeta real «TikFinity». Solo selecciona la fuente WebSocket local del perfil aislado; no conecta con TikTok ni con un servicio externo.' : 'Cliquez sur la vraie carte « TikFinity ». Elle selectionne uniquement la source WebSocket locale dans le profil isole ; elle ne se connecte ni a TikTok ni a un service externe.';
      current.expected = locale === 'de' ? 'Die TikFinity-Einstellungen und der lokale Port sind sichtbar und koennen ohne Verbindung geprueft werden.' : locale === 'en' ? 'The TikFinity settings and local port are visible and can be reviewed without connecting.' : locale === 'es' ? 'Los ajustes de TikFinity y el puerto local quedan visibles y pueden revisarse sin conectar.' : 'Les reglages TikFinity et le port local sont visibles et peuvent etre verifies sans connexion.';
    } else if (action === 'inspect-readonly-api') {
      current.title = locale === 'de' ? `${label} nur lesend pruefen` : locale === 'en' ? `Inspect ${label} read-only` : locale === 'es' ? `Inspecciona ${label} en solo lectura` : `Inspectez ${label} en lecture seule`;
      current.body = locale === 'de' ? `Pruefe den Abschnitt ${label} in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.` : locale === 'en' ? `Inspect the ${label} section in the local API Bridge reference. This guide sends no POST request.` : locale === 'es' ? `Revisa la seccion ${label} en la referencia local de API Bridge. Esta guia no envia POST.` : `Inspectez la section ${label} dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.`;
    } else if (action === 'open-overlay-preview') {
      current.title = locale === 'de' ? `${label} als Overlay-Vorschau oeffnen` : locale === 'en' ? `Open ${label} as an overlay preview` : locale === 'es' ? `Abre ${label} como vista previa de overlay` : `Ouvrez ${label} comme apercu overlay`;
      current.body = locale === 'de' ? `Oeffne die echte ${label}-Oberflaeche nur in einer nicht sendenden OBS-Testszene. Ohne lokales Testereignis kann sie leer oder transparent bleiben; es werden keine Demo-Inhalte eingefuegt.` : locale === 'en' ? `Open the real ${label} surface only in an OBS test scene that is not live. Without a local test event, it can remain empty or transparent; no demo content is inserted.` : locale === 'es' ? `Abre la superficie real ${label} solo en una escena de prueba de OBS que no esta al aire. Sin un evento local de prueba, puede quedar vacia o transparente; no se inserta contenido demo.` : `Ouvrez la vraie surface ${label} uniquement dans une scene de test OBS non diffusee. Sans evenement de test local, elle peut rester vide ou transparente ; aucun contenu de demonstration nest insere.`;
    } else if (action === 'run-local-preview') {
      current.title = locale === 'de' ? `${label} lokal testen` : locale === 'en' ? `Test ${label} locally` : locale === 'es' ? `Prueba ${label} localmente` : `Testez ${label} localement`;
      current.body = locale === 'de' ? `Fuehre ${label} nur mit ${test} im isolierten Testprofil aus; keine LIVE-Quelle, Hardware oder externe Verbindung wird benutzt.` : locale === 'en' ? `Run ${label} only with ${test} in the isolated test profile; no LIVE source, hardware, or external connection is used.` : locale === 'es' ? `Ejecuta ${label} solo con ${test} en el perfil aislado; no se usa fuente LIVE, hardware ni conexion externa.` : `Executez ${label} uniquement avec ${test} dans le profil isole ; aucune source LIVE, materiel ou connexion externe n est utilisee.`;
    } else if (action === 'reset-demo-state') {
      current.title = locale === 'de' ? `${label} sicher zuruecksetzen` : locale === 'en' ? `Reset ${label} safely` : locale === 'es' ? `Restablece ${label} con seguridad` : `Reinitialisez ${label} en securite`;
      current.body = locale === 'de' ? `Entferne nur die Demo-Werte fuer ${label}, bevor du ${topic} produktiv vorbereitest.` : locale === 'en' ? `Remove only the demo values for ${label} before preparing ${topic} for production.` : locale === 'es' ? `Elimina solo los valores demo de ${label} antes de preparar ${topic} para produccion.` : `Supprimez uniquement les valeurs demo de ${label} avant de preparer ${topic} pour la production.`;
    } else {
      current.title = locale === 'de' ? `${label} im Testprofil konfigurieren` : locale === 'en' ? `Configure ${label} in the test profile` : locale === 'es' ? `Configura ${label} en el perfil de prueba` : `Configurez ${label} dans le profil de test`;
      current.body = locale === 'de' ? `Arbeite im sichtbaren Bereich ${label} von ${topic}. Verwende nur lokale Demo-Werte; keine Zugangsdaten, Geraete-ID oder LIVE-Ziel.` : locale === 'en' ? `Work in the visible ${label} area of ${topic}. Use local demo values only; never credentials, a device ID, or a LIVE target.` : locale === 'es' ? `Trabaja en el area visible ${label} de ${topic}. Usa solo valores demo locales; nunca credenciales, ID de dispositivo ni destino LIVE.` : `Travaillez dans la zone visible ${label} de ${topic}. Utilisez uniquement des valeurs demo locales, jamais identifiants, ID appareil ou cible LIVE.`;
    }
    current.alt = `${current.title} - ${topic}`;
  }
  return copy;
}

function createStepDescriptor(entry, stepId) {
  const override = CAPTURE_WORKFLOW_OVERRIDES[`${entry.id}:${stepId}`];
  const action = override ? override.type : stepAction(entry, stepId);
  const copy = contextualizeStepCopy(entry, stepId, action, localizedStepCopy(entry, stepId, action));
  const actionConfig = override ? { ...override, stepId } : { type: action, stepId };
  return {
    id: stepId,
    copy,
    capture: {
      route: stepRoute(entry, action, stepId),
      assertVisible: stepSelector(entry, stepId, action),
      focusText: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].title])),
      action: actionConfig,
      expected: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].expected]))
    }
  };
}

function manualStep(id, route, assertVisible, action, copy) {
  const localized = Object.fromEntries(LOCALES.map((locale) => {
    const [title, body, expected] = copy[locale];
    return [locale, { title, body, expected, alt: `${title} - Emoji Rain` }];
  }));
  return {
    id,
    copy: localized,
    capture: {
      route,
      assertVisible,
      focusText: Object.fromEntries(LOCALES.map((locale) => [locale, localized[locale].title])),
      action,
      expected: Object.fromEntries(LOCALES.map((locale) => [locale, localized[locale].expected]))
    }
  };
}

const MANUAL_GUIDES = Object.freeze({
  'emoji-rain': {
    overlay: '/emoji-rain/obs-hud',
    copy: {
      de: {
        title: 'Emoji Rain',
        summary: 'Konfiguriere Emojis, die optionale OBS-HUD-Auflösung und einen lokalen Testrain. Die Anleitung verwendet keine TikTok-Verbindung und keine produktive OBS-Szene.',
        firstResult: 'Der Test lässt die gewählten Emojis im lokalen HUD fallen.',
        requirements: 'LTTH Dashboard, ein lokales Testprofil und optional die nicht sendende OBS-Szene „tutorial“.',
        safety: 'Für diesen Ablauf keine TikTok-Verbindung herstellen. Nutze ausschließlich die lokale Testtaste und entferne die Test-Browserquelle danach wieder.',
        troubleshooting: 'Wenn der Test leer bleibt, aktiviere Emoji Rain, speichere die Konfiguration und prüfe die Browserquelle auf die exakte lokale HUD-URL.',
        related: ['webgpu-emoji-rain', 'fireworks']
      },
      en: {
        title: 'Emoji Rain',
        summary: 'Configure the emoji list, optional OBS HUD resolution, and a local test rain. This guide uses no TikTok connection and no production OBS scene.',
        firstResult: 'The test drops the selected emojis in the local HUD.',
        requirements: 'LTTH Dashboard, a local test profile, and optionally the non-live OBS scene named “tutorial”.',
        safety: 'Do not connect TikTok for this workflow. Use only the local test button and remove the temporary browser source afterwards.',
        troubleshooting: 'If the test stays empty, enable Emoji Rain, save the configuration, and check that the browser source uses the exact local HUD URL.',
        related: ['webgpu-emoji-rain', 'fireworks']
      },
      es: {
        title: 'Emoji Rain',
        summary: 'Configura la lista de emojis, la resolución opcional del HUD de OBS y una lluvia de prueba local. Esta guía no usa TikTok ni una escena productiva de OBS.',
        firstResult: 'La prueba deja caer los emojis seleccionados en el HUD local.',
        requirements: 'Panel de LTTH, un perfil de prueba local y, de forma opcional, la escena de OBS no emitida llamada «tutorial».',
        safety: 'No conectes TikTok durante este flujo. Usa solo el botón de prueba local y elimina después la fuente de navegador temporal.',
        troubleshooting: 'Si la prueba queda vacía, activa Emoji Rain, guarda la configuración y comprueba que la fuente use la URL local exacta del HUD.',
        related: ['webgpu-emoji-rain', 'fireworks']
      },
      fr: {
        title: 'Emoji Rain',
        summary: 'Configurez la liste d’emoji, la résolution facultative du HUD OBS et une pluie de test locale. Ce guide n’utilise ni TikTok ni une scène OBS de production.',
        firstResult: 'Le test fait tomber les emoji sélectionnés dans le HUD local.',
        requirements: 'Tableau de bord LTTH, profil de test local et, en option, la scène OBS non diffusée nommée « tutorial ».',
        safety: 'Ne connectez pas TikTok pendant ce flux. Utilisez uniquement le bouton de test local et supprimez ensuite la source navigateur temporaire.',
        troubleshooting: 'Si le test reste vide, activez Emoji Rain, enregistrez la configuration et vérifiez que la source utilise l’URL HUD locale exacte.',
        related: ['webgpu-emoji-rain', 'fireworks']
      }
    },
    steps: [
      manualStep('enable-emoji-rain', '/emoji-rain/ui', '.toggle-switch', { type: 'set-demo-value', stepId: 'enable-emoji-rain', inputSelector: '#enabled-toggle' }, {
        de: ['Emoji Rain aktivieren', 'Aktiviere den Schalter „Emoji Rain“. Erst danach verarbeitet das Plugin lokale Testereignisse.', 'Der Status neben dem Schalter zeigt „Aktiviert“.'],
        en: ['Enable Emoji Rain', 'Turn on the “Emoji Rain” switch. The plugin processes local test events only after it is enabled.', 'The status beside the switch reads “Enabled”.'],
        es: ['Activa Emoji Rain', 'Activa el interruptor «Emoji Rain». El plugin procesa eventos de prueba locales solo después de activarlo.', 'El estado junto al interruptor indica «Activado».'],
        fr: ['Activez Emoji Rain', 'Activez l’interrupteur « Emoji Rain ». Le plugin ne traite les événements de test locaux qu’après son activation.', 'L’état près de l’interrupteur indique « Activé ».']
      }),
      manualStep('choose-emojis', '/emoji-rain/ui', '#emoji_set', { type: 'set-demo-value', stepId: 'choose-emojis' }, {
        de: ['Emoji-Liste festlegen', 'Trage zum Beispiel „💧, ✨, 🎉“ in „Emojis (durch Komma getrennt)“ ein. Jeder lokale Test wählt nur aus dieser Liste.', 'Das Textfeld enthält die drei durch Komma getrennten Demo-Emojis.'],
        en: ['Choose the emoji list', 'Enter, for example, “💧, ✨, 🎉” in “Emojis (comma-separated)”. Each local test chooses only from this list.', 'The text area contains the three comma-separated demo emojis.'],
        es: ['Elige la lista de emojis', 'Introduce, por ejemplo, «💧, ✨, 🎉» en «Emojis (separados por comas)». Cada prueba local elige solo de esta lista.', 'El área de texto contiene los tres emojis de demostración separados por comas.'],
        fr: ['Choisissez la liste d’emoji', 'Saisissez par exemple « 💧, ✨, 🎉 » dans « Emoji (séparés par des virgules) ». Chaque test local ne choisit que dans cette liste.', 'La zone de texte contient les trois emoji de démonstration séparés par des virgules.']
      }),
      manualStep('enable-obs-hud', '/emoji-rain/ui', '#obs_hud_enabled', { type: 'set-demo-value', stepId: 'enable-obs-hud' }, {
        de: ['OBS-HUD für die Testquelle einschalten', 'Aktiviere „OBS HUD aktivieren“. Das schaltet lediglich die separate lokale HUD-Seite frei; es startet weder OBS noch einen Stream.', 'Die Checkbox für das OBS HUD ist aktiviert.'],
        en: ['Enable the OBS HUD for the test source', 'Enable “OBS HUD”. This only makes the separate local HUD page available; it does not start OBS or a stream.', 'The OBS HUD checkbox is selected.'],
        es: ['Activa el HUD de OBS para la fuente de prueba', 'Activa «OBS HUD». Esto solo habilita la página HUD local independiente; no inicia OBS ni una transmisión.', 'La casilla del HUD de OBS está marcada.'],
        fr: ['Activez le HUD OBS pour la source de test', 'Activez « HUD OBS ». Cela rend uniquement la page HUD locale disponible ; OBS et le stream ne démarrent pas.', 'La case du HUD OBS est cochée.']
      }),
      manualStep('select-hud-resolution', '/emoji-rain/ui', '#obs_hud_preset', { type: 'set-demo-value', stepId: 'select-hud-resolution' }, {
        de: ['HUD-Auflösung auswählen', 'Wähle für die Tutorial-Szene „1080p (1920×1080)“ oder die Auflösung deiner späteren Browserquelle. Breite und Höhe müssen in OBS identisch sein.', 'Im Auflösungsmenü ist das gewünschte Preset sichtbar.'],
        en: ['Select the HUD resolution', 'Choose “1080p (1920×1080)” for the tutorial scene, or the resolution planned for your browser source. Width and height must match in OBS.', 'The chosen preset is visible in the resolution menu.'],
        es: ['Selecciona la resolución del HUD', 'Elige «1080p (1920×1080)» para la escena tutorial o la resolución prevista para la fuente de navegador. El ancho y el alto deben coincidir en OBS.', 'El preajuste elegido aparece en el menú de resolución.'],
        fr: ['Sélectionnez la résolution du HUD', 'Choisissez « 1080p (1920×1080) » pour la scène tutorial, ou la résolution prévue pour votre source navigateur. La largeur et la hauteur doivent correspondre dans OBS.', 'Le préréglage choisi est visible dans le menu de résolution.']
      }),
      manualStep('save-emoji-rain', '/emoji-rain/ui', '#save-config-btn', { type: 'save-demo-config', stepId: 'save-emoji-rain', allowClick: true }, {
        de: ['Konfiguration im Testprofil speichern', 'Klicke auf „Konfiguration speichern“. Die Werte werden nur im isolierten Testprofil abgelegt.', 'Nach dem Speichern bleibt der gewählte Emoji- und HUD-Zustand sichtbar.'],
        en: ['Save the configuration in the test profile', 'Click “Save configuration”. The values are stored only in the isolated test profile.', 'After saving, the selected emoji and HUD state remain visible.'],
        es: ['Guarda la configuración en el perfil de prueba', 'Haz clic en «Guardar configuración». Los valores se guardan solo en el perfil de prueba aislado.', 'Después de guardar, siguen visibles los emojis y el estado del HUD elegidos.'],
        fr: ['Enregistrez la configuration dans le profil de test', 'Cliquez sur « Enregistrer la configuration ». Les valeurs ne sont stockées que dans le profil de test isolé.', 'Après l’enregistrement, les emoji et l’état HUD choisis restent visibles.']
      }),
      manualStep('run-local-rain-test', '/emoji-rain/ui', '#notification', { type: 'run-local-preview', stepId: 'run-local-rain-test', allowClick: true, clickSelector: '#test-emoji-rain-btn', settleMs: 250 }, {
        de: ['Lokalen Emoji-Regen testen', 'Klicke auf „Test Emoji Rain“. Dieser Button erzeugt ein lokales Demo-Ereignis; er sendet nichts an TikTok und löst keine externe Hardware aus.', 'Die echte Erfolgsmeldung bestätigt, dass das Ereignis an die lokale HUD-Quelle gesendet wurde.'],
        en: ['Run the local Emoji Rain test', 'Click “Test Emoji Rain”. This button creates a local demo event; it sends nothing to TikTok and triggers no external hardware.', 'The real success notification confirms that the event was sent to the local HUD source.'],
        es: ['Ejecuta la prueba local de Emoji Rain', 'Haz clic en «Probar Emoji Rain». Este botón crea un evento de demostración local; no envía nada a TikTok ni activa hardware externo.', 'La notificación de éxito real confirma que el evento se envió a la fuente HUD local.'],
        fr: ['Lancez le test local Emoji Rain', 'Cliquez sur « Tester Emoji Rain ». Ce bouton crée un événement de démonstration local ; il n’envoie rien à TikTok et ne déclenche aucun matériel externe.', 'La vraie notification de succès confirme que l’événement a été envoyé à la source HUD locale.']
      }),
      manualStep('verify-obs-hud', '/emoji-rain/obs-hud', '#canvas-container', { type: 'open-overlay-preview', stepId: 'verify-obs-hud' }, {
        de: ['HUD in der OBS-Testszene prüfen', 'Füge in der leeren OBS-Szene „tutorial“ eine temporäre Browser-Quelle mit `http://localhost:3000/emoji-rain/obs-hud` und der zuvor gewählten Auflösung hinzu. Starte keine Aufnahme und kein Streaming.', 'Die Quelle zeigt die echte Emoji-Rain-HUD-Fläche ohne eingeblendete Doku-Labels.'],
        en: ['Verify the HUD in the OBS test scene', 'In the empty OBS scene named “tutorial”, add a temporary browser source using `http://localhost:3000/emoji-rain/obs-hud` and the resolution chosen above. Do not record or stream.', 'The source shows the real Emoji Rain HUD with no documentation labels over it.'],
        es: ['Comprueba el HUD en la escena de prueba de OBS', 'En la escena vacía de OBS llamada «tutorial», añade una fuente de navegador temporal con `http://localhost:3000/emoji-rain/obs-hud` y la resolución elegida. No grabes ni transmitas.', 'La fuente muestra el HUD real de Emoji Rain sin etiquetas de documentación superpuestas.'],
        fr: ['Vérifiez le HUD dans la scène de test OBS', 'Dans la scène OBS vide nommée « tutorial », ajoutez une source navigateur temporaire avec `http://localhost:3000/emoji-rain/obs-hud` et la résolution choisie. N’enregistrez pas et ne diffusez pas.', 'La source affiche le vrai HUD Emoji Rain sans étiquette de documentation superposée.']
      })
    ]
  }
});

function buildGuides(repoRoot) {
  const manifests = readManifests(repoRoot);
  const byId = new Map(FACTS.map((entry) => [entry.id, entry]));
  const expectedIds = [...manifests.map((manifest) => manifest.id), 'store-admin'].sort();
  const definedIds = [...byId.keys()].sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(definedIds)) {
    const missing = expectedIds.filter((id) => !byId.has(id));
    const stale = definedIds.filter((id) => !expectedIds.includes(id));
    throw new Error(`Tutorial definition inventory mismatch. Missing: ${missing.join(', ') || 'none'}; stale: ${stale.join(', ') || 'none'}`);
  }
  const storeAdmin = readStoreAdmin(repoRoot);
  const records = [...manifests, storeAdmin];
  return records.map((record) => {
    const entry = byId.get(record.id);
    const manual = MANUAL_GUIDES[record.id];
    const name = manual ? manual.copy.en.title : displayName(record.name, record.id);
    return {
      id: record.id,
      name,
      version: record.version || 'current',
      devStatus: record.devStatus || record.accessType || 'available',
      category: record.category || 'plugin',
      copy: manual ? manual.copy : localizedGuideCopy(name, entry),
      related: manual ? manual.copy.en.related : entry.related,
      overlay: manual && manual.overlay ? manual.overlay : entry.overlay,
      capture: { fixture: { profile: `docs-${record.id}`, externalPolicy: 'blocked', mode: entry.mode } },
      steps: manual ? manual.steps : entry.steps
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = { LOCALES, buildGuides };
