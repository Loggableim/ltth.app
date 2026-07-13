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
  'weather-control': ['weather-card', 'weather-effect', 'lifecycle-rule', 'weather-pulse', 'weather-overlay', 'weather-reset'],
  'webgpu-emoji-rain': ['gpu-rain-card', 'gpu-preset', 'asset-rule', 'gpu-rain-test', 'gpu-rain-overlay', 'gpu-rain-reset'],
  'webgpu-fireworks': ['gpu-fireworks-card', 'gpu-quality', 'follower-trigger', 'gpu-fireworks-test', 'gpu-fireworks-overlay', 'gpu-fireworks-reset'],
  'store-admin': ['store-card', 'official-source', 'package-status', 'store-inspection', 'store-review']
});

// These selectors are checked against the shipped UI in the capture run. They
// deliberately name real controls/canvases rather than deriving CSS ids from
// documentation labels. The entry order mirrors the named step ids above.
const UI_ANCHORS = Object.freeze({
  'advanced-timer': ['#timer-form', '#initial-duration', '#timer-mode', '#save-profile-btn', '#timer-container', '#tab-profiles'],
  animazingpal: ['#connectionStatus', '#giftMappingGift', '#followEnabled', '#connectBtn', '#tab-settings', '#statusText'],
  'api-bridge': ['#bridge-info', '#bridge-actions', '#bridge-events', '#bridge-request', '#bridge-safety'],
  chatango: ['#config-form', '#roomHandle', '#widgetPosition', '#btn-preview', '#preview-card'],
  clarityhud: ['#plugin-version', '#chat-url', '#chat-preview', '#full-preview', '#overlay-container', '#reset-defaults-btn'],
  coinbattle: ['#control-tab', '#match-mode', '#btn-start-simulation', '#current-leaderboard', '#overlay-container', '#btn-end-match'],
  'config-import': ['#tab-export', '#incPluginSettings', '#exportBtn', '#tab-import', '#exportResultCard'],
  'data-source': ['#card-eulerstream', '#tikfinity-settings-card', '#tikfinity-port', '#btn-save-tikfinity', '#status-badge'],
  'emoji-rain': ['#hero-enabled-status', '#emoji_set', '#user-emoji-mappings', '#save-config-btn', '#canvas-container', '#toggle-enabled-status'],
  fireworks: ['#settings', '#master-toggle', '#audio-volume', '#test-btn', '#fireworks-canvas', '#save-btn'],
  'flame-overlay': ['#status', '#frameMode', '#flameSpeed', '#previewToggle', '#flameCanvas', '#savePresetBtn'],
  'game-engine': ['#tab-manual-mode', '#manual-game-type', '#manual-player1-name', '#start-manual-game', '#hud', '#end-manual-game'],
  gcce: ['#config-form', '#command-prefix', '#cmd-filter-permission', '#btn-refresh-stats', '#tab-monitoring'],
  'gift-catalog': ['#config-form', '#app-language', '#run-refresh-form', '#catalog-output', '#connection-state'],
  goals: ['#goals-container', '#goal-target', '#goal-on-reach', '#goal-preview-frame', '#goal-container', '#goal-form'],
  'interactive-story': ['#configurationCard', '#languageSelect', '#storyStateBadge', '#heroOpenOverlayBtn', '#votingOverlay', '#statusCard'],
  'milestone-leaderboard': ['#tiersList', '#tierThreshold', '#tierName', '#testButton', '#leaderboardList', '#resetAllUsersButton'],
  'minecraft-connect': ['#commands-tab', '#wsHost', '#chatRelayTargets', '#testActionBtn', '#connectionMeta'],
  multicam: ['#currentScene', '#sceneSelect', '#switch-scene-btn', '#giftGridContainer', '#saveMappingsBtn'],
  'music-bot': ['#musicbot-onboarding', '#musicbot-onboarding-settings', '#preview-source', '#request-btn', '#overlay-root', '#clear-btn'],
  openshock: ['#safety', '#globalMaxIntensity', '#testShockDevice', '#testShockButton', '#overlay-container', '#headerEmergencyStop'],
  'osc-bridge': ['#config-form', '#sendHost', '#sendPort', '#btn-test', '#status-indicator'],
  'quiz-show': ['#dashboard', '#questionInput', '#timeRemaining', '#startQuizBtn', '#overlay-container', '#stopQuizBtn'],
  sidekick: ['#tab-status', '#host-asr-language', '#test-message', '#btn-test', '#overlay', '#btn-reset'],
  soundboard: ['#overview-enabled-state', '#soundboard-gift-url', '#soundboard-gift-volume', '#test-focused-animation-btn', '#soundboard-save-state'],
  spotlight: ['#overlay-grid', '#settings-form-container', '#preview-test-btn', '#preview-frame', '#overlay-container', '#close-preview-btn'],
  streamalchemy: ['#settingsForm', '#generationMode', '#defaultStyle', '#runLocalTestBtn', '#craftPanel', '#refreshBtn'],
  'stt-ticker': ['#tabs', '#asr-languageDefault', '#design-select', '#btn-test-deepgram', '#lines', '#btn-clear-buffer'],
  'talking-heads': ['#apiStatus', '#sourceAvatarSelect', '#previewTtsText', '#previewTtsBtn', '#avatarContainer', '#clearCacheBtn'],
  'thermal-printer': ['#config-form', '#printerType', '#encoding', '#test-print-btn', '#queue-size'],
  toptier: ['#panel-live', '#decay-enabled', '#test-overlay', '#panel-obs', '#tt-root', '#reset-all'],
  tts: ['#content-config', '#defaultVoice', '#profanityFilter', '#saveConfigBtnSidebar', '#overviewQueueLength'],
  vdoninja: ['#roomSection', '#roomNameInput', '#maxGuestsInput', '#createRoomBtn', '#directorIframeContainer', '#activeRoomInfo'],
  'weather-control': ['#statusAlert', '#qualityPreset', '#testRainEffectBtn', '#preview-canvas', '#weather-canvas', '#stopAllPreviewBtn'],
  'webgpu-emoji-rain': ['#renderer-state', '#quality_preset', '#effect_intensity', '#save-config-btn', '#emoji-rain-canvas', '#toggle-enabled-status'],
  'webgpu-fireworks': ['#webgpu-runtime-state', '#webgpu-visual-style', '#min-coins', '#test-btn', '#fireworks-canvas', '#save-btn'],
  'store-admin': ['.plugin-mode-btn[data-plugin-mode="store"]', '#plugins-container', '#plugin-search', '#plugins-container', '.plugin-mode-btn[data-plugin-mode="store"]']
});

const API_ROUTES = Object.freeze({
  'bridge-info': '/api/bridge/info',
  'actions-list': '/api/bridge/actions',
  'request-example': '/api/bridge/info',
  'event-stream-check': '/api/bridge/events',
  'bridge-review': '/api/bridge/actions'
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
  fact('flame-overlay', '/plugins/flame-overlay/ui/settings.html', ['Rahmenstil, Intensität und Farbvorgabe', 'frame style, intensity, and color preset', 'estilo de marco, intensidad y preajuste de color', 'style de cadre, intensité et préréglage de couleur'], ['die lokale Rahmenvorschau', 'the local frame preview', 'la vista previa local del marco', 'l’aperçu local du cadre'], ['der Rahmen ist sichtbar, ohne eine LIVE-Szene zu verändern', 'the frame is visible without changing a LIVE scene', 'el marco es visible sin cambiar una escena LIVE', 'le cadre est visible sans modifier une scène LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/flame-overlay/renderer/index.html', related: ['webgpu-fireworks', 'fireworks'] }),
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
  fact('weather-control', '/plugins/weather-control/ui.html', ['Wettereffect, Intensität und Lebenszyklus', 'weather effect, intensity, and lifecycle', 'efecto meteorológico, intensidad y ciclo de vida', 'effet météo, intensité et cycle de vie'], ['einen lokalen Wetterimpuls', 'a local weather pulse', 'un impulso meteorológico local', 'une impulsion météo locale'], ['der Effekt startet und endet in der Vorschau ohne LIVE-Szene', 'the effect starts and ends in preview without a LIVE scene', 'el efecto inicia y termina en la vista previa sin escena LIVE', 'l’effet commence et finit dans l’aperçu sans scène LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/weather-control/overlay.html', related: ['webgpu-fireworks', 'emoji-rain'] }),
  fact('webgpu-emoji-rain', '/plugins/webgpu-emoji-rain/ui.html', ['WebGPU-Preset, Assets und Geschenkregel', 'WebGPU preset, assets, and gift rule', 'preajuste WebGPU, recursos y regla de regalo', 'préréglage WebGPU, assets et règle de cadeau'], ['ein lokales Emoji-Regen-Testereignis', 'a local emoji-rain test event', 'un evento de prueba local de lluvia de emoji', 'un événement local de test de pluie emoji'], ['die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt', 'the GPU preview shows emojis and reports no LIVE connection', 'la vista previa GPU muestra emojis y no informa conexión LIVE', 'l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/webgpu-emoji-rain/overlay.html', related: ['emoji-rain', 'webgpu-fireworks'] }),
  fact('webgpu-fireworks', '/webgpu-fireworks/ui', ['WebGPU-Qualität, Auslöser und Performance-Grenze', 'WebGPU quality, trigger, and performance limit', 'calidad WebGPU, disparador y límite de rendimiento', 'qualité WebGPU, déclencheur et limite de performance'], ['den lokalen Follower-Test und die Overlay-Vorschau', 'the local follower test and overlay preview', 'la prueba local de follower y la vista previa del overlay', 'le test local de follower et l’aperçu overlay'], ['das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden', 'the WebGPU fireworks render without connecting TikTok LIVE', 'los fuegos WebGPU se renderizan sin conectar TikTok LIVE', 'les feux WebGPU sont rendus sans connecter TikTok LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/webgpu-fireworks/overlay', related: ['fireworks', 'flame-overlay'] }),
  fact('store-admin', '/dashboard.html?view=plugins', ['Store-Ansicht, Quellenfreigabe und Paketstatus', 'store view, source approval, and package status', 'vista de tienda, aprobación de fuentes y estado de paquetes', 'vue du store, approbation des sources et état des paquets'], ['die lokale Store-Ansicht ohne Community-Quelle', 'the local store view without a community source', 'la vista de tienda local sin fuente comunitaria', 'la vue locale du store sans source communautaire'], ['der Store zeigt den sicheren Standardzustand; keine Quelle wird aktiviert', 'the store shows the safe default state; no source is enabled', 'la tienda muestra el estado seguro predeterminado; no se activa ninguna fuente', 'le store affiche l’état sûr par défaut ; aucune source n’est activée'], { requirement: 'api', safety: 'credentials', mode: 'admin', related: ['config-import', 'api-bridge'] })
];

function readManifests(repoRoot) {
  const pluginRoot = path.join(repoRoot, 'app', 'plugins');
  return fs.readdirSync(pluginRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(pluginRoot, entry.name, 'plugin.json')))
    .map((entry) => JSON.parse(fs.readFileSync(path.join(pluginRoot, entry.name, 'plugin.json'), 'utf8')))
    .sort((left, right) => left.id.localeCompare(right.id));
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
  if (entry.id === 'interactive-story') return action === 'open-overlay-preview' ? '/plugins/interactive-story/overlay.html' : '/plugins/interactive-story/ui.html';
  if (entry.id === 'webgpu-fireworks') return action === 'open-overlay-preview' ? '/plugins/webgpu-fireworks/overlay.html' : '/plugins/webgpu-fireworks/ui/settings.html';
  if (action === 'inspect-readonly-api') return entry.id === 'api-bridge' ? '/api-bridge/ui' : API_ROUTES[stepId];
  if (action === 'inspect-safe-store-state') return '/dashboard.html?view=plugins';
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
    if (action === 'inspect-readonly-api') {
      current.title = locale === 'de' ? `${label} nur lesend pruefen` : locale === 'en' ? `Inspect ${label} read-only` : locale === 'es' ? `Inspecciona ${label} en solo lectura` : `Inspectez ${label} en lecture seule`;
      current.body = locale === 'de' ? `Pruefe den Abschnitt ${label} in der lokalen API-Bridge-Referenz. Diese Anleitung sendet keinen POST-Request.` : locale === 'en' ? `Inspect the ${label} section in the local API Bridge reference. This guide sends no POST request.` : locale === 'es' ? `Revisa la seccion ${label} en la referencia local de API Bridge. Esta guia no envia POST.` : `Inspectez la section ${label} dans la reference API Bridge locale. Ce guide n envoie aucune requete POST.`;
    } else if (action === 'open-overlay-preview') {
      current.title = locale === 'de' ? `${label} als Overlay-Vorschau oeffnen` : locale === 'en' ? `Open ${label} as an overlay preview` : locale === 'es' ? `Abre ${label} como vista previa de overlay` : `Ouvrez ${label} comme apercu overlay`;
      current.body = locale === 'de' ? `Oeffne die echte ${label}-Oberflaeche ausschliesslich in einer nicht sendenden OBS-Testszene.` : locale === 'en' ? `Open the real ${label} surface only in an OBS test scene that is not live.` : locale === 'es' ? `Abre la superficie real ${label} solo en una escena de prueba de OBS que no esta al aire.` : `Ouvrez la vraie surface ${label} uniquement dans une scene de test OBS non diffusee.`;
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
  const action = stepAction(entry, stepId);
  const copy = contextualizeStepCopy(entry, stepId, action, localizedStepCopy(entry, stepId, action));
  return {
    id: stepId,
    copy,
    capture: {
      route: stepRoute(entry, action, stepId),
      assertVisible: stepSelector(entry, stepId, action),
      focusText: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].title])),
      action: { type: action, stepId },
      expected: Object.fromEntries(LOCALES.map((locale) => [locale, copy[locale].expected]))
    }
  };
}

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
    const name = displayName(record.name, record.id);
    return {
      id: record.id,
      name,
      version: record.version || 'current',
      devStatus: record.devStatus || record.accessType || 'available',
      category: record.category || 'plugin',
      copy: localizedGuideCopy(name, entry),
      related: entry.related,
      overlay: entry.overlay,
      capture: { fixture: { profile: `docs-${record.id}`, externalPolicy: 'blocked', mode: entry.mode } },
      steps: entry.steps
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = { LOCALES, buildGuides };
