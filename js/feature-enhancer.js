/* Shared, localized setup guide for the public feature pages. */
(function () {
  'use strict';

  const guides = {
    animazingpal: ['AnimazingPal', 'AI-Persönlichkeit, Gedächtnis und Antwortlogik für interaktive Streams.', 'KI-Persönlichkeit auswählen', 'OpenAI-Key und Antwortregeln hinterlegen', 'Mit Testnachrichten und TTS prüfen'],
    'plugin-advanced-timer': ['Advanced Timer', 'Zeitgesteuerte Aktionen, Countdowns und Flow-Auslöser für planbare Streams.', 'Timer und Zeitzone anlegen', 'Intervalle, Wiederholungen und Aktionen setzen', 'Mit einem kurzen Testlauf verifizieren'],
    'plugin-gcce': ['GCCE', 'Rollenbasierte Chat-Befehle mit Cooldowns, Variablen und sicherem Moderationsfluss.', 'Rollen und Befehle definieren', 'Berechtigungen und Cooldowns testen', 'GCCE-HUD in OBS prüfen'],
    'plugin-stream-alchemy': ['Stream Alchemy', 'Items, Drops und Belohnungsregeln für spielerische Community-Events.', 'Item-Pool und Seltenheiten erstellen', 'Gift- und Chat-Regeln verknüpfen', 'Testdrops auslösen und Balance nachjustieren'],
    'plugin-music-bot': ['Music Bot', 'Moderierte Musikwünsche mit Warteschlange, Quellen und Lautstärkeschutz.', 'Audioquelle und Rechte konfigurieren', 'Queue- und Moderationsregeln festlegen', 'Eine Testanfrage abspielen'],
    'stt-ticker': ['STT Ticker', 'Sprache-zu-Text als lesbarer Live-Ticker für Zuschauer und Barrierefreiheit.', 'Sprache und Mikrofon auswählen', 'Overlay-URL und Darstellung konfigurieren', 'OBS-Browser-Quelle testen'],
    'plugin-thermal-printer': ['Thermal Printer', 'Physische Ausdrucke für Gifts, Meilensteine und Stream-Momente.', 'Drucker anschließen und Testseite drucken', 'Vorlage und Trigger definieren', 'Mit einem kontrollierten Event testen'],
    tts: ['Text-to-Speech', 'Mehrere Stimmen, Engines, Queue-Regeln und sichere Moderation in einem Workflow.', 'Engine und Stimme auswählen', 'API-Key, Filter, Queue und Rechte konfigurieren', 'Testtext senden und Audiopegel prüfen'],
    soundboard: ['Soundboard', 'Schnelle Soundeffekte mit Moderationsrechten, Kategorien und OBS-Ausgabe.', 'Sounds importieren oder suchen', 'Hotkeys, Rechte und Lautstärke festlegen', 'Sound im OBS-Testlauf auslösen'],
    'plugin-clarity-hud': ['ClarityHUD', 'Klares HUD für Status, Events und wichtige Stream-Informationen.', 'Widgets auswählen und aktivieren', 'Position, Farben und Datenquellen setzen', 'Overlay in OBS auf Lesbarkeit prüfen'],
    'plugin-leaderboard': ['Viewer XP', 'XP, Level und Ranglisten belohnen aktive Zuschauer sichtbar im Stream.', 'XP-Quellen und Levelkurve definieren', 'Rangliste und Datenschutzoptionen konfigurieren', 'Overlay mit Testevents prüfen'],
    'viewer-xp': ['Viewer XP', 'XP, Level und Ranglisten belohnen aktive Zuschauer sichtbar im Stream.', 'XP-Quellen und Levelkurve definieren', 'Rangliste und Datenschutzoptionen konfigurieren', 'Overlay mit Testevents prüfen'],
    multicam: ['Multi-Cam', 'Kamera- und OBS-Szenenwechsel über Events oder Chat steuern.', 'Kameras und OBS-Szenen zuordnen', 'Trigger und Fallback-Szene setzen', 'Szenenwechsel im Vorschau-Modus testen'],
    vdoninja: ['VDO.Ninja', 'Multi-Guest-Räume, Layouts und Audio für Interviews und Co-Streams.', 'Raum und Gastlinks erstellen', 'Layout, Audio und Browserquellen konfigurieren', 'Mit einem Gast und privater URL testen'],
    'osc-bridge': ['OSC Bridge', 'VRChat-Parameter und Aktionen über OSC mit TikTok-Events verbinden.', 'VRChat-Adresse und Parameter eintragen', 'Events und sichere Werte mappen', 'OSC-Testaktion ausführen'],
    goals: ['Goals', 'Ziele, Fortschritt und Belohnungen als verständliche Stream-Overlays.', 'Ziel und Startwert anlegen', 'Events, Meilensteine und Overlay gestalten', 'Fortschritt mit Testevent erhöhen'],
    alerts: ['Alerts', 'Einheitliche Alerts für Gifts, Follows, Likes und Shares.', 'Eventtypen und Medien auswählen', 'Text, Sound, Dauer und Cooldown konfigurieren', 'Jeden Alert mit Testevent abnehmen'],
    'emoji-rain': ['Emoji Rain', 'Performante Emoji-Effekte für Interaktionen und besondere Momente.', 'Emoji-Set und Eventquelle wählen', 'Dichte, Geschwindigkeit und Grenzen setzen', 'Browserquelle in OBS testen'],
    'plugin-weather-overlay': ['Weather Overlay', 'Wetterdaten und atmosphärische Effekte als kontrolliertes Overlay.', 'Ort und Datenquelle eintragen', 'Aktualisierung und Darstellung einstellen', 'Overlay-URL in OBS prüfen'],
    'talking-heads': ['Talking Heads', 'Avatar- und Kopfanimationen passend zu Stimme und Events.', 'Avatar und Animationsset auswählen', 'Trigger, Timing und Audioquelle konfigurieren', 'Mit Testevent und TTS synchronisieren'],
    'plugin-openshock': ['Hybridshock', 'Sicherheitsorientierte haptische Reaktionen auf Live-Events.', 'Gerät und Endpoint sicher hinterlegen', 'Mapping, Intensität, Queue und Limits setzen', 'Nur im sicheren Testmodus auslösen'],
    hybridshock: ['Hybridshock', 'Sicherheitsorientierte haptische Reaktionen auf Live-Events.', 'Gerät und Endpoint sicher hinterlegen', 'Mapping, Intensität, Queue und Limits setzen', 'Nur im sicheren Testmodus auslösen'],
    'plugin-quiz-show': ['Quiz Show', 'Moderierte Quizrunden mit Fragen, Antwortzeit und Ergebnisanzeige.', 'Quiz und Antwortoptionen anlegen', 'Timeout, Punkte und Overlay konfigurieren', 'Eine private Proberunde starten'],
    'flow-engine': ['Flow Engine', 'Visuelle Wenn-Dann-Automation für komplexe TikTok-LIVE-Abläufe.', 'Trigger und Bedingungen erstellen', 'Aktionen, Variablen und Fehlerpfade verbinden', 'Flow speichern und mit Testevent ausführen'],
    'auto-updater': ['Auto-Updater', 'Versionen, Backups, Rollback und sichere Updates über den Launcher.', 'Launcher installieren und Kanal wählen', 'Update- und Backup-Verhalten prüfen', 'Update testen und bei Bedarf Rollback ausführen'],
    security: ['Security & Privacy', 'Lokale Verarbeitung, Clerk-Store-Login, CSP, CORS und Rate-Limits verständlich erklärt.', 'Lokales Profil und Store-Login trennen', 'Allowed Origins, Rollen und Secrets prüfen', 'Healthcheck und Logs kontrollieren'],
    'plugin-system': ['Plugin System', 'Plugin-Lifecycle, Admin-UI, Datenverzeichnisse und JavaScript-API für Entwickler.', 'Manifest und Plugin-Struktur anlegen', 'API, Events und persistente Daten anbinden', 'Plugin laden, testen und sauber stoppen']
  };

  const copy = {
    de: ['Praxisleitfaden', 'Voraussetzungen', 'Einrichtung', 'Konfiguration', 'Test und Troubleshooting', 'Wenn etwas nicht funktioniert: zuerst den Testschritt wiederholen, Logs prüfen und die Browser-Quelle neu laden.'],
    en: ['Practical guide', 'Requirements', 'Setup', 'Configuration', 'Test and troubleshooting', 'If something fails: repeat the test step, inspect the logs, and reload the browser source.'],
    es: ['Guía práctica', 'Requisitos', 'Instalación', 'Configuración', 'Prueba y solución de problemas', 'Si algo falla: repite la prueba, revisa los registros y recarga la fuente del navegador.'],
    fr: ['Guide pratique', 'Prérequis', 'Installation', 'Configuration', 'Test et dépannage', 'En cas de problème : répétez le test, consultez les journaux et rechargez la source navigateur.']
  };

  function init() {
    const slug = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
    const guide = guides[slug];
    if (!guide || document.querySelector('.feature-guide')) return;
    const lang = (window.__ltthLang || 'de').slice(0, 2);
    const labels = copy[lang] || copy.de;
    const details = lang === 'en'
      ? [`Configure ${guide[0]} for your stream and keep the workflow predictable.`, `Choose the source, permissions and limits for ${guide[0]}.`, `Connect the overlay or action and validate it with a controlled test event.`]
      : lang === 'es'
        ? [`Configura ${guide[0]} para tu emisión y mantén el flujo controlado.`, `Selecciona la fuente, los permisos y los límites de ${guide[0]}.`, `Conecta el overlay o la acción y valida todo con un evento de prueba.`]
        : lang === 'fr'
          ? [`Configurez ${guide[0]} pour votre stream et gardez un flux maîtrisé.`, `Choisissez la source, les droits et les limites de ${guide[0]}.`, `Reliez l’overlay ou l’action puis validez avec un événement de test.`]
          : [guide[1], guide[2], guide[3]];
    const section = document.createElement('section');
    section.className = 'feature-guide features-preview';
    section.innerHTML = `<div class="container"><div class="feature-guide__header"><span class="feature-guide__eyebrow">${labels[0]}</span><h2 class="section-title">${guide[0]}: ${labels[1]}</h2><p>${details[0]}</p></div><div class="feature-guide__grid"><article><span>01</span><h3>${labels[2]}</h3><p>${lang === 'de' ? guide[2] : details[1]}</p></article><article><span>02</span><h3>${labels[3]}</h3><p>${lang === 'de' ? guide[3] : details[1]}</p></article><article><span>03</span><h3>${labels[4]}</h3><p>${lang === 'de' ? guide[4] : details[2]}</p></article></div><p class="feature-guide__note">${labels[5]}</p></div>`;
    const main = document.querySelector('main');
    if (main) main.appendChild(section);
  }

  document.addEventListener('DOMContentLoaded', init);
  document.addEventListener('i18nApplied', init);
}());
