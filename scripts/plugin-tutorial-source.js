'use strict';

// This is the maintained source for the public tutorial catalog. The data is
// intentionally explicit: a manifest without a guide, or a stale guide, is a
// build failure instead of silently receiving generic documentation.
const fs = require('fs');
const path = require('path');

const LOCALES = ['de', 'en', 'es', 'fr'];
const L = (de, en, es, fr) => ({ de, en, es, fr });

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

// These are deliberate workflows, not profile-derived defaults. Their ids
// become public anchors and capture-manifest ids, so adding a plugin requires
// a conscious description of its specific configuration and safe proof.
const WORKFLOWS = Object.freeze({
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

function fact(id, route, topic, test, expected, options = {}) {
  if (!WORKFLOWS[id]) throw new Error(`Missing explicit workflow for ${id}`);
  return {
    id,
    route,
    topic: L(...topic),
    test: L(...test),
    expected: L(...expected),
    requirement: options.requirement || 'standard',
    safety: options.safety || 'local',
    overlay: options.overlay || null,
    related: options.related || [],
    mode: options.mode || 'ui',
    workflow: WORKFLOWS[id],
    // The leading selectors are guide-specific; the structural alternatives
    // keep older plugin UIs capturable while the verifier records the matched
    // element and visible text for manual review.
    focus: options.focus || `[data-plugin-id="${id}"], #${id}, .${id}, main, form, [role="main"], .container, #app, canvas`
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
  fact('clarityhud', '/plugins/clarityhud/overlays/full.html', ['HUD-Module, Chatbereich und Stream-Overlay', 'HUD modules, chat area, and stream overlay', 'módulos HUD, área de chat y overlay de stream', 'modules HUD, zone de chat et overlay de stream'], ['die Full-HUD-Vorschau mit Demo-Daten', 'the full HUD preview with demo data', 'la vista previa Full HUD con datos demo', 'l’aperçu Full HUD avec des données démo'], ['die gewählten HUD-Bereiche sind in der Vorschau sichtbar', 'the selected HUD sections are visible in preview', 'las áreas HUD seleccionadas son visibles en la vista previa', 'les zones HUD sélectionnées sont visibles dans l’aperçu'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/clarityhud/overlays/full.html', related: ['spotlight', 'toptier'] }),
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
  fact('interactive-story', '/plugins/interactive-story/ui.html', ['Geschichtenmodus, Abstimmung und Modelloption', 'story mode, voting, and model option', 'modo de historia, votación y opción de modelo', 'mode histoire, vote et option de modèle'], ['eine lokale Testentscheidung ohne API-Schlüssel', 'a local test decision without an API key', 'una decisión de prueba local sin clave API', 'une décision de test locale sans clé API'], ['die Abstimmungsoberfläche reagiert, ohne einen externen Modellaufruf auszuführen', 'the voting UI responds without an external model request', 'la interfaz de votación responde sin solicitar un modelo externo', 'l’interface de vote répond sans appel de modèle externe'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/interactive-story/overlay.html', related: ['quiz-show', 'sidekick'] }),
  fact('milestone-leaderboard', '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/ui.html', ['XP-Regeln, Meilenstein und Ranglistenanzeige', 'XP rules, milestone, and leaderboard display', 'reglas de XP, hito y visualización de clasificación', 'règles XP, jalon et affichage du classement'], ['einen lokalen XP-Impuls', 'a local XP pulse', 'un impulso de XP local', 'une impulsion XP locale'], ['ein Demonutzer erscheint in der Ranglisten-Vorschau', 'a demo user appears in the leaderboard preview', 'un usuario demo aparece en la vista previa de clasificación', 'un utilisateur démo apparaît dans l’aperçu du classement'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html', related: ['goals', 'toptier'] }),
  fact('minecraft-connect', '/plugins/minecraft-connect/minecraft-connect.html', ['Serveradresse, Ereignisbindung und Nachrichtenformat', 'server address, event binding, and message format', 'dirección del servidor, enlace de eventos y formato de mensaje', 'adresse serveur, liaison d’événements et format de message'], ['eine lokale Offline-Nachricht', 'a local offline message', 'un mensaje local sin conexión', 'un message local hors ligne'], ['die Konfiguration wird geprüft, ohne einen Minecraft-Server zu kontaktieren', 'the configuration is checked without contacting a Minecraft server', 'la configuración se comprueba sin contactar un servidor de Minecraft', 'la configuration est contrôlée sans contacter de serveur Minecraft'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/minecraft-connect/overlay/minecraft_overlay.html', related: ['osc-bridge', 'api-bridge'] }),
  fact('multicam', '/plugins/multicam/ui.html', ['Kameraquelle, Szenenregel und Umschaltbedingung', 'camera source, scene rule, and switch condition', 'fuente de cámara, regla de escena y condición de cambio', 'source caméra, règle de scène et condition de bascule'], ['eine nicht sendende OBS-Testszene', 'an OBS test scene that is not live', 'una escena de prueba de OBS que no está al aire', 'une scène de test OBS non diffusée'], ['die Regel wird gespeichert, ohne OBS zu schalten', 'the rule is saved without switching OBS', 'la regla se guarda sin cambiar OBS', 'la règle est enregistrée sans basculer OBS'], { requirement: 'obs', safety: 'obs', related: ['vdoninja', 'clarityhud'] }),
  fact('music-bot', '/plugins/music-bot/ui.html', ['MPV-Pfad, Anfragequeue und Moderationsregel', 'MPV path, request queue, and moderation rule', 'ruta de MPV, cola de solicitudes y regla de moderación', 'chemin MPV, file de demandes et règle de modération'], ['eine lokale Beispieldatei in der Queue', 'a local sample file in the queue', 'un archivo de ejemplo local en la cola', 'un fichier d’exemple local dans la file'], ['die Queue zeigt den Eintrag; es startet keine externe Suche und keine Wiedergabe', 'the queue shows the entry; no external search or playback starts', 'la cola muestra la entrada; no inicia búsqueda externa ni reproducción', 'la file affiche l’entrée ; aucune recherche externe ni lecture ne démarre'], { requirement: 'audio', safety: 'local', overlay: '/plugins/music-bot/overlay.html', related: ['soundboard', 'tts'] }),
  fact('openshock', '/plugins/openshock/ui.html', ['Sicherheitslimit, Queue und Gerätezuordnung', 'safety limit, queue, and device mapping', 'límite de seguridad, cola y asignación de dispositivo', 'limite de sécurité, file et mappage d’appareil'], ['die eingebaute Simulation ohne Token und Gerät', 'the built-in simulation without a token or device', 'la simulación integrada sin token ni dispositivo', 'la simulation intégrée sans jeton ni appareil'], ['der Ablauf wird als Simulation angezeigt und löst keine Haptik aus', 'the flow is shown as a simulation and triggers no haptics', 'el flujo se muestra como simulación y no activa háptica', 'le flux est affiché comme simulation et ne déclenche aucune haptique'], { requirement: 'hardware', safety: 'hardware', overlay: '/plugins/openshock/overlay/openshock_overlay.html', related: ['game-engine', 'thermal-printer'] }),
  fact('osc-bridge', '/plugins/osc-bridge/ui.html', ['Loopback-Adresse, UDP-Port und Nachrichtentyp', 'loopback address, UDP port, and message type', 'dirección loopback, puerto UDP y tipo de mensaje', 'adresse loopback, port UDP et type de message'], ['eine lokale Loopback-Prüfung', 'a local loopback check', 'una comprobación loopback local', 'un contrôle loopback local'], ['die Eingaben bleiben auf 127.0.0.1 und es wird kein VRChat-Client gesteuert', 'inputs remain on 127.0.0.1 and no VRChat client is controlled', 'las entradas permanecen en 127.0.0.1 y no se controla ningún cliente VRChat', 'les entrées restent sur 127.0.0.1 et aucun client VRChat n’est contrôlé'], { requirement: 'network', safety: 'local', related: ['stt-ticker', 'minecraft-connect'] }),
  fact('quiz-show', '/plugins/quiz-show/quiz_show.html', ['Fragenpool, Antwortzeit und Punktelogik', 'question pool, answer time, and scoring logic', 'banco de preguntas, tiempo de respuesta y lógica de puntuación', 'banque de questions, temps de réponse et logique de score'], ['eine lokale Quizfrage', 'a local quiz question', 'una pregunta de cuestionario local', 'une question de quiz locale'], ['die Spielansicht zeigt die Frage ohne LIVE-Chatinteraktion', 'the game view shows the question without LIVE chat interaction', 'la vista de juego muestra la pregunta sin interacción de chat LIVE', 'la vue de jeu affiche la question sans interaction de chat LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/quiz-show/quiz_show_overlay.html', related: ['game-engine', 'interactive-story'] }),
  fact('sidekick', '/plugins/sidekick/ui.html', ['Assistentenmodus, Kontextquelle und Antwortkanal', 'assistant mode, context source, and response channel', 'modo asistente, fuente de contexto y canal de respuesta', 'mode assistant, source de contexte et canal de réponse'], ['eine lokale Vorschauanfrage ohne Modellzugang', 'a local preview request without model access', 'una solicitud de vista previa local sin acceso a modelo', 'une requête d’aperçu locale sans accès au modèle'], ['die UI bestätigt die Konfiguration, ohne einen externen Dienst anzurufen', 'the UI confirms the configuration without calling an external service', 'la UI confirma la configuración sin llamar a un servicio externo', 'l’UI confirme la configuration sans appeler de service externe'], { requirement: 'network', safety: 'credentials', overlay: '/plugins/sidekick/overlay/sidekick-hud.html', related: ['interactive-story', 'api-bridge'] }),
  fact('soundboard', '/dashboard.html?view=plugins', ['Sound-Slot, Lautstärke und Ereigniszuordnung', 'sound slot, volume, and event mapping', 'ranura de sonido, volumen y asignación de evento', 'slot sonore, volume et mappage d’événement'], ['einen stummen lokalen Soundtest', 'a muted local sound test', 'una prueba local de sonido silenciada', 'un test sonore local muet'], ['die Zuordnung wird sichtbar, ohne Audio auszugeben', 'the mapping becomes visible without audio output', 'la asignación se hace visible sin emitir audio', 'le mappage devient visible sans sortie audio'], { requirement: 'audio', safety: 'local', related: ['music-bot', 'tts'] }),
  fact('spotlight', '/plugins/spotlight/overlays/chatter.html', ['Ereignistyp, Anzeigedauer und Spotlight-Stil', 'event type, display duration, and spotlight style', 'tipo de evento, duración de visualización y estilo Spotlight', 'type d’événement, durée d’affichage et style Spotlight'], ['eine lokale Chatter-Vorschau', 'a local chatter preview', 'una vista previa local de chatter', 'un aperçu local de chatter'], ['die Spotlight-Karte wird in der Vorschau gerendert', 'the spotlight card is rendered in preview', 'la tarjeta Spotlight se renderiza en la vista previa', 'la carte Spotlight est rendue dans l’aperçu'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/spotlight/overlays/chatter.html', related: ['clarityhud', 'toptier'] }),
  fact('streamalchemy', '/plugins/streamalchemy/ui.html', ['Automationsregel, Auslöser und Aktionskette', 'automation rule, trigger, and action chain', 'regla de automatización, disparador y cadena de acciones', 'règle d’automatisation, déclencheur et chaîne d’actions'], ['einen lokalen Trockenlauf', 'a local dry run', 'una ejecución en seco local', 'un essai à blanc local'], ['die Regel protokolliert den Trockenlauf, ohne LIVE-Aktionen auszuführen', 'the rule logs the dry run without executing LIVE actions', 'la regla registra la ejecución en seco sin realizar acciones LIVE', 'la règle journalise l’essai à blanc sans exécuter d’actions LIVE'], { safety: 'local', overlay: '/plugins/streamalchemy/overlay.html', related: ['api-bridge', 'gcce'] }),
  fact('stt-ticker', '/plugins/stt-ticker/ui.html', ['Sprache, Untertitelmodus und Textstil', 'language, subtitle mode, and text style', 'idioma, modo de subtítulos y estilo de texto', 'langue, mode de sous-titres et style de texte'], ['einen lokalen Beispielsatz', 'a local sample sentence', 'una frase de ejemplo local', 'une phrase locale d’exemple'], ['der Satz erscheint im Ticker ohne Mikrofonaufnahme', 'the sentence appears in the ticker without microphone capture', 'la frase aparece en el ticker sin captura de micrófono', 'la phrase apparaît dans le ticker sans capture micro'], { requirement: 'obs', safety: 'local', overlay: '/plugins/stt-ticker/overlay/ticker.html', related: ['osc-bridge', 'talking-heads'] }),
  fact('talking-heads', '/plugins/talking-heads/ui.html', ['Charakter, Sprachereignis und Lippenbewegung', 'character, speech event, and lip movement', 'personaje, evento de voz y movimiento de labios', 'personnage, événement vocal et mouvement des lèvres'], ['eine lokale Textvorschau', 'a local text preview', 'una vista previa de texto local', 'un aperçu de texte local'], ['der Charakter reagiert in der Vorschau ohne TTS-Provider', 'the character reacts in preview without a TTS provider', 'el personaje reacciona en la vista previa sin proveedor TTS', 'le personnage réagit dans l’aperçu sans fournisseur TTS'], { requirement: 'audio', safety: 'credentials', overlay: '/plugins/talking-heads/overlay.html', related: ['tts', 'animazingpal'] }),
  fact('thermal-printer', '/plugins/thermal-printer/ui.html', ['Druckerprofil, Zeichensatz und Warteschlange', 'printer profile, character set, and queue', 'perfil de impresora, juego de caracteres y cola', 'profil d’imprimante, jeu de caractères et file'], ['den Offline-Queue-Test', 'the offline queue test', 'la prueba de cola sin conexión', 'le test de file hors ligne'], ['ein Testeintrag bleibt in der Queue; es wird nichts gedruckt', 'a test item remains in the queue; nothing is printed', 'una entrada de prueba permanece en la cola; no se imprime nada', 'une entrée de test reste dans la file ; rien n’est imprimé'], { requirement: 'hardware', safety: 'hardware', related: ['openshock', 'config-import'] }),
  fact('toptier', '/plugins/toptier/ui.html', ['Ranking-Regel, Schwelle und Anzeigestil', 'ranking rule, threshold, and display style', 'regla de ranking, umbral y estilo de visualización', 'règle de classement, seuil et style d’affichage'], ['einen lokalen Ranglistenwert', 'a local leaderboard value', 'un valor de clasificación local', 'une valeur de classement locale'], ['die Top-Tier-Karte zeigt den Demo-Rang in der Vorschau', 'the Top Tier card shows the demo rank in preview', 'la tarjeta Top Tier muestra el rango demo en la vista previa', 'la carte Top Tier affiche le rang démo dans l’aperçu'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/toptier/overlay.html', related: ['milestone-leaderboard', 'spotlight'] }),
  fact('tts', '/dashboard.html?view=plugins', ['Stimme, Warteschlange und Moderationsfilter', 'voice, queue, and moderation filter', 'voz, cola y filtro de moderación', 'voix, file et filtre de modération'], ['eine stumme lokale Sprachvorschau', 'a muted local speech preview', 'una vista previa de voz local silenciada', 'un aperçu vocal local muet'], ['die Vorschau validiert Text und Stimme, ohne Audio auszugeben', 'the preview validates text and voice without audio output', 'la vista previa valida texto y voz sin emitir audio', 'l’aperçu valide le texte et la voix sans sortie audio'], { requirement: 'audio', safety: 'credentials', related: ['talking-heads', 'soundboard'] }),
  fact('vdoninja', '/plugins/vdoninja/ui.html', ['Raumname, Gastlayout und Browserquelle', 'room name, guest layout, and browser source', 'nombre de sala, diseño de invitados y fuente de navegador', 'nom de salle, disposition des invités et source navigateur'], ['eine lokale URL-Vorschau mit Platzhalterraum', 'a local URL preview with a placeholder room', 'una vista previa de URL local con sala de marcador', 'un aperçu d’URL local avec salle fictive'], ['die Browser-Quelle ist vorbereitet, ohne einen Gast zu verbinden', 'the browser source is prepared without connecting a guest', 'la fuente de navegador está preparada sin conectar un invitado', 'la source navigateur est préparée sans connecter d’invité'], { requirement: 'obs', safety: 'credentials', related: ['multicam', 'clarityhud'] }),
  fact('visual-fx-frame-webgpu', '/plugins/visual-fx-frame-webgpu/ui/settings.html', ['WebGPU-Rahmen, Textur und Qualitätsprofil', 'WebGPU frame, texture, and quality profile', 'marco WebGPU, textura y perfil de calidad', 'cadre WebGPU, texture et profil de qualité'], ['eine lokale WebGPU-Vorschau', 'a local WebGPU preview', 'una vista previa WebGPU local', 'un aperçu WebGPU local'], ['der Rahmen wird gerendert und die Qualitätsanzeige bleibt im Testprofil', 'the frame is rendered and the quality indicator stays in the test profile', 'el marco se renderiza y el indicador de calidad permanece en el perfil de prueba', 'le cadre est rendu et l’indicateur de qualité reste dans le profil de test'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/visual-fx-frame-webgpu/renderer/index.html', related: ['webgpu-fireworks', 'flame-overlay'] }),
  fact('weather-control', '/plugins/weather-control/ui.html', ['Wettereffect, Intensität und Lebenszyklus', 'weather effect, intensity, and lifecycle', 'efecto meteorológico, intensidad y ciclo de vida', 'effet météo, intensité et cycle de vie'], ['einen lokalen Wetterimpuls', 'a local weather pulse', 'un impulso meteorológico local', 'une impulsion météo locale'], ['der Effekt startet und endet in der Vorschau ohne LIVE-Szene', 'the effect starts and ends in preview without a LIVE scene', 'el efecto inicia y termina en la vista previa sin escena LIVE', 'l’effet commence et finit dans l’aperçu sans scène LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/weather-control/overlay.html', related: ['webgpu-fireworks', 'emoji-rain'] }),
  fact('webgpu-emoji-rain', '/plugins/webgpu-emoji-rain/ui.html', ['WebGPU-Preset, Assets und Geschenkregel', 'WebGPU preset, assets, and gift rule', 'preajuste WebGPU, recursos y regla de regalo', 'préréglage WebGPU, assets et règle de cadeau'], ['ein lokales Emoji-Regen-Testereignis', 'a local emoji-rain test event', 'un evento de prueba local de lluvia de emoji', 'un événement local de test de pluie emoji'], ['die GPU-Vorschau zeigt Emojis und meldet keinen LIVE-Kontakt', 'the GPU preview shows emojis and reports no LIVE connection', 'la vista previa GPU muestra emojis y no informa conexión LIVE', 'l’aperçu GPU montre des emojis et n’indique aucune connexion LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/plugins/webgpu-emoji-rain/overlay.html', related: ['emoji-rain', 'webgpu-fireworks'] }),
  fact('webgpu-fireworks', '/plugins/webgpu-fireworks/ui/settings.html', ['WebGPU-Qualität, Auslöser und Performance-Grenze', 'WebGPU quality, trigger, and performance limit', 'calidad WebGPU, disparador y límite de rendimiento', 'qualité WebGPU, déclencheur et limite de performance'], ['den lokalen Follower-Test und die Overlay-Vorschau', 'the local follower test and overlay preview', 'la prueba local de follower y la vista previa del overlay', 'le test local de follower et l’aperçu overlay'], ['das WebGPU-Feuerwerk wird gerendert, ohne TikTok LIVE zu verbinden', 'the WebGPU fireworks render without connecting TikTok LIVE', 'los fuegos WebGPU se renderizan sin conectar TikTok LIVE', 'les feux WebGPU sont rendus sans connecter TikTok LIVE'], { requirement: 'obs', safety: 'obs', overlay: '/webgpu-fireworks/overlay', related: ['fireworks', 'visual-fx-frame-webgpu'] }),
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

function stepCopy(name, entry, id, index) {
  const copy = {};
  for (const locale of LOCALES) {
    const topic = entry.topic[locale];
    const test = entry.test[locale];
    const expected = entry.expected[locale];
    const action = index === 0
      ? { title: locale === 'de' ? `${name} gezielt aktivieren` : locale === 'en' ? `Enable ${name} deliberately` : locale === 'es' ? `Activa ${name} de forma intencionada` : `Activez ${name} volontairement`, body: locale === 'de' ? `Öffne den Plugin Manager, suche ${name} und bestätige den Status. Die Aufnahme markiert ausschließlich diese Plugin-Karte.` : locale === 'en' ? `Open Plugin Manager, find ${name}, and confirm its status. The capture highlights this plugin card only.` : locale === 'es' ? `Abre el gestor de plugins, busca ${name} y confirma su estado. La captura resalta solo esta tarjeta.` : `Ouvrez le gestionnaire de plugins, trouvez ${name} et confirmez son état. La capture met en évidence cette carte uniquement.`, expected: locale === 'de' ? `${name} ist im Testprofil verfügbar.` : locale === 'en' ? `${name} is available in the test profile.` : locale === 'es' ? `${name} está disponible en el perfil de prueba.` : `${name} est disponible dans le profil de test.` }
      : index === 1
        ? { title: locale === 'de' ? `${topic} öffnen` : locale === 'en' ? `Open ${topic}` : locale === 'es' ? `Abre ${topic}` : `Ouvrez ${topic}`, body: locale === 'de' ? `Rufe die echte Plugin-Oberfläche über ${entry.route} auf und lies die sichtbaren Optionen, bevor du etwas speicherst.` : locale === 'en' ? `Open the real plugin surface at ${entry.route} and read the visible options before saving anything.` : locale === 'es' ? `Abre la interfaz real del plugin en ${entry.route} y lee las opciones visibles antes de guardar.` : `Ouvrez la véritable interface du plugin à ${entry.route} et lisez les options visibles avant tout enregistrement.`, expected: locale === 'de' ? `Die Oberfläche für ${topic} ist ohne Fehler sichtbar.` : locale === 'en' ? `The ${topic} surface is visible without errors.` : locale === 'es' ? `La interfaz de ${topic} es visible sin errores.` : `L’interface ${topic} est visible sans erreur.` }
        : index === 2
          ? { title: locale === 'de' ? `${topic} mit Demo-Werten setzen` : locale === 'en' ? `Set ${topic} with demo values` : locale === 'es' ? `Configura ${topic} con valores demo` : `Réglez ${topic} avec des valeurs démo`, body: locale === 'de' ? `Verwende nur lokale Beispielwerte. Speichere keine Produktivzugänge, Geräte-IDs oder LIVE-Ziele.` : locale === 'en' ? `Use local sample values only. Do not save production credentials, device IDs, or LIVE targets.` : locale === 'es' ? `Usa solo valores de ejemplo locales. No guardes credenciales, IDs de dispositivo ni destinos LIVE de producción.` : `Utilisez uniquement des valeurs d’exemple locales. N’enregistrez aucun accès de production, identifiant d’appareil ou cible LIVE.`, expected: locale === 'de' ? `Die Testkonfiguration ist nachvollziehbar gespeichert.` : locale === 'en' ? `The test configuration is saved and reviewable.` : locale === 'es' ? `La configuración de prueba queda guardada y puede revisarse.` : `La configuration de test est enregistrée et contrôlable.` }
          : index === 3
            ? { title: locale === 'de' ? `${test} ausführen` : locale === 'en' ? `Run ${test}` : locale === 'es' ? `Ejecuta ${test}` : `Exécutez ${test}`, body: locale === 'de' ? `Nutze ausschließlich den lokalen Test, die Vorschau oder den Trockenlauf dieser Oberfläche.` : locale === 'en' ? `Use this surface’s local test, preview, or dry run only.` : locale === 'es' ? `Usa solo la prueba local, vista previa o ejecución en seco de esta interfaz.` : `Utilisez uniquement le test local, l’aperçu ou l’essai à blanc de cette interface.`, expected }
            : index === 4
              ? { title: locale === 'de' ? `Sichtbares Ergebnis kontrollieren` : locale === 'en' ? `Confirm the visible result` : locale === 'es' ? `Confirma el resultado visible` : `Confirmez le résultat visible`, body: locale === 'de' ? `Prüfe genau dieses Soll-Ergebnis: ${expected}` : locale === 'en' ? `Check this exact expected result: ${expected}` : locale === 'es' ? `Comprueba este resultado esperado exacto: ${expected}` : `Contrôlez ce résultat attendu précis : ${expected}`, expected }
              : { title: locale === 'de' ? `Testzustand zurücksetzen` : locale === 'en' ? `Reset the test state` : locale === 'es' ? `Restablece el estado de prueba` : `Réinitialisez l’état de test`, body: locale === 'de' ? `Entferne Demo-Werte oder schließe die Vorschau, bevor du in eine produktive Szene wechselst.` : locale === 'en' ? `Remove demo values or close the preview before moving to a production scene.` : locale === 'es' ? `Elimina los valores demo o cierra la vista previa antes de pasar a una escena de producción.` : `Supprimez les valeurs démo ou fermez l’aperçu avant de passer à une scène de production.`, expected: locale === 'de' ? `Das Testprofil bleibt sauber und nicht produktiv.` : locale === 'en' ? `The test profile remains clean and non-production.` : locale === 'es' ? `El perfil de prueba permanece limpio y no productivo.` : `Le profil de test reste propre et non productif.` };
    copy[locale] = { ...action, alt: `${name}: ${action.title}` };
  }
  return copy;
}

function buildSteps(name, entry) {
  const routes = ['/dashboard.html?view=plugins', entry.route, entry.route, entry.route, entry.overlay || entry.route];
  return entry.workflow.map((id, index) => ({
    id,
    copy: stepCopy(name, entry, id, Math.min(index, 5)),
    capture: {
      route: routes[Math.min(index, routes.length - 1)],
      assertVisible: entry.focus,
      focusText: entry.topic,
      action: index === 0 ? { type: 'plugin-manager', pluginId: entry.id } : index === 3 ? { type: 'safe-test', target: entry.test } : index === 4 && entry.overlay ? { type: 'overlay-preview', target: entry.overlay } : { type: 'focus-topic', target: entry.topic },
      expected: entry.expected
    }
  }));
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
      steps: buildSteps(name, entry)
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = { LOCALES, buildGuides };
