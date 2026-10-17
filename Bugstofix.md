# LTTH Live-Testbericht und Bugliste

## Testlauf 2026-10-03 – laufend

- Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9.
- Umgebung: Windows, portable Node 22.14.0, App http://127.0.0.1:3000, geladenes Profil test.
- Vorbestehende Änderungen: Talking-Heads-Plugin und zugehörige Tests sowie app/public/js/tts-renderer-lifecycle.js, dashboard-tts-renderer.test.js und tts-renderer-lifecycle.test.js. Diese Änderungen werden erhalten.
- Keine Produktkorrekturen; keine Neustarts, öffentlichen Nachrichten oder Gifts.
- Status nicht beobachtet mit Zusatz Offen bedeutet ausstehender Test und keinen Abschlussstatus.
- Quelle: verbindliche Zielbeschreibung goal-objective.md; Mindestmatrix wird anhand tatsächlicher UI und Routes erweitert.

## Funktionsmatrix – erster Prüfplan

| Bereich | Mindestumfang | Status | Beleg / Einschränkung |
|---|---|---|---|
| A1 – Profile | Prüfe Erstellen/Auswählen des Testprofils, Wechsel, Speicherung, Wiederherstellung und Trennung von Einstellungen und Daten. Andere Profile dürfen nicht verändert werden. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A2 – TikTok-Verbindung | Prüfe Verbinden, Trennen, Statusanzeigen, Fehlerfälle, Stream-Ende, erneutes Verbinden und automatische Wiederverbindung. Prüfe doppelte Event-Listener, doppelte Ereignisse und veraltete Streamdaten nach einem Wechsel. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A3 – Live-Ereignisse einschließlich Super Fans | Prüfe Chat, Likes, Gifts einschließlich Serien und Serienabschluss, Follows, Shares, Abos und Zuschauerzahlen. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A3 – Live-Ereignisse einschließlich Super Fans | Prüfe ausdrücklich Super-Fan-Erkennung: | nicht beobachtet | Offen: noch nicht ausgeführt |
| A4 – Dashboard | Prüfe aktuelle Anzeigen, Event-Verlauf, Zähler, Bedienelemente, Ladezustände, Fehleranzeigen und Aktualisierung nach Verbindungs- und Profilwechseln. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A8 – TikTok-Studio-URLs und Overlay-Tunnel | Prüfe außerdem: | nicht beobachtet | Offen: noch nicht ausgeführt |
| A9 – Plugin-Verwaltung | Prüfe Aktivieren/Deaktivieren, Einstellungen, Persistenz, UI-/Backend-Status, Fehlerbehandlung und Bereinigung von Listenern/Timern. Nutze meinen gespeicherten Login. Schließe Talking Heads von Änderungen und Lifecycle-Tests aus. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A10 – Plugin-Store | Prüfe Katalog, Login/Zugang, Detailansichten, Installation, verfügbare Updates, Statusabgleich und Fehlerfälle. Beschränke Installationen/Updates auf den ausgewählten Testumfang; sichere betroffene Zustände vorher. Keine lokalen Codeänderungen überschreiben und Talking Heads nicht installieren oder aktualisieren. Nicht verfügbare Updates dürfen nicht als erfolgreich getestet gelten. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A11 – Einstellungen und Sprachen | Prüfe Speicherung, Validierung, Profilbezug, DE/EN-Oberfläche, fehlende Übersetzungen, Layout und Wiederherstellung nach einem zulässigen Neustart. | nicht beobachtet | Offen: noch nicht ausgeführt |
| A12 – Backup/Import | Prüfe Export, Archivinhalt, Vorschau, Konfliktanzeige, Import und Wiederherstellung im Testprofil. Erstelle vor Importen einen Wiederherstellungspunkt. Keine bestehenden Nutzerdaten löschen oder andere Profile überschreiben. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P1 Advanced Timer | Timer-Lifecycle, eventbasierte Verlängerung, mehrere Timer, Persistenz, Anzeige. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P2 AnimazingPal | Verfügbare Avatar-Anbindungen, Event-Reaktionen, KI-Funktionen, Gedächtnis, Viewer-Zuordnung. Externe Avatar-Software nur prüfen, wenn eine geeignete Testinstanz verfügbar ist. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P5 ClarityHUD | Chat und Aktivitätsfeed, Reihenfolge, Viewer-Daten, Lesbarkeit, Größen und Reconnect. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P6 CoinBattle | Gift-Wertung, Serien, Teams, Multiplikatoren, Runden, Rankings und Persistenz. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P7 Config Backup & Restore | Export, Import, Konflikte, Wiederherstellung und angebotene Migrationen. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P8 EmojiRain | Live-Trigger, Asset-Zuordnung, Presets, Commands, Physik, Limits und Bereinigung. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P9 Fireworks Superplugin | Live-Trigger, Gift-Zuordnung, Combos, Presets, Rendering und verfügbare Fallbacks. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P10 Visual FX Frame | Effekte, Live-Regeln, Presets, Cooldowns und Bereinigung. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P11 LTTH Game Engine | Alle tatsächlich vorhandenen Spiele, insbesondere Connect4, Schach, Plinko, Glücksrad, Slots und Live Arena. Prüfe Start/Ende, Teilnahme, Regeln, Event-Wertung, Ergebnis und Persistenz. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P12 Global Chat Command Engine | Registrierung, Parsing, Rechte, Cooldowns, Konflikte und Commands der ausgewählten Plugins. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P14 Live Goals | Coins, Likes, Follower und eigene Ziele; Fortschritt, Gift-Serien, Zielabschluss, Reset und Persistenz. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P15 Interactive Story Generator | Ollama-Anbindung mit dem ausdrücklich freigegebenen Schlüssel, Story-Erstellung, angebotene Bild-/Audiofunktionen, Stimmen, Voting, Fortschritt, Abbruch und Fehlerfälle. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P16 Viewer XP | Viewer-Identität, XP-Vergabe, Geschenk-Meilensteine, Rankings, Profile und Persistenz. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P19 Music Bot | Wünsche, Suche, Queue, Skip, Rechte, Wiedergabe und Fehlerfälle. Keine öffentlichen Nachrichten senden; Commands nötigenfalls lokal auslösen und entsprechend kennzeichnen. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P22 Quiz Show | Fragen, Antworten, Voting, Duelle, Joker, Punkte, Rankings und Rundenabschluss. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P23 Schnorrbecher | Gift-Zuordnung, Serien, Geschenkeglas, Physik, Reset und Belastungsverhalten. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P24 Sidekick | Event-Analyse, KI-Reaktionen, Queue, Viewer-Kontext und verfügbare Avatar-Anbindungen. Talking Heads bleibt ausgeschlossen. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P27 Stream Monsters | Zugang, Runden, Kämpfe, echte Event-Reaktionen, Fortschritt, Ergebnisse und Persistenz. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P31 Top Tier | Like-/Gift-Wertung, Serien, Rangfolge, Decay, Animationen und vorhandene Layouts. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P34 Visual FX Frame WEBGPU | GPU-Verfügbarkeit, Effekte, Presets, echte Event-Trigger, Fehlermeldungen und Stabilität. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P35 Weather Control | Wettereffekte, Trigger, Quests, Streaks, Belohnungen und Persistenz. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P36 WebGPU EmojiRain | GPU-Rendering/Physik, Assets, Trigger, Presets, Commands und Stabilität. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P37 WebGPU Fireworks | Prüfe den für dieses Plugin erforderlichen OBS-WebGPU-Build. Da OBS-Tests ausgeschlossen sind, dokumentiere den OBS-abhängigen Teil als „vom Nutzer zu prüfen“. Prüfe die übrigen verfügbaren UI-, Konfigurations-, Event- und Browserfunktionen. | nicht beobachtet | Offen: noch nicht ausgeführt |
| P38 WebGPU Weather Control | Wettersteuerung, Rendering, Transparenz, Trigger, Presets und Stabilität. | nicht beobachtet | Offen: noch nicht ausgeführt |

## Nachgewiesene Ausgangslage

| Prüfung | Status | Beleg |
|---|---|---|
| A1 geladenes Testprofil | bestanden | GET /api/profiles/active: activeProfile=test, requiresRestart=false, port=3000; gerenderte Topbar zeigt test |
| A1 Profilwechsel / Neustartpersistenz | blockiert | server.js Profilwechsel plant automatisch Neustart; parallele Talking-Heads-Arbeit darf nicht gestört werden |
| P37 OBS-WebGPU-Build | vom Nutzer zu prüfen | OBS-Tests ausdrücklich ausgeschlossen |

## Produktbugs

Noch keine bestätigten Produktbugs erfasst.

## Externe Einschränkungen und offene Prüfungen

- Live-Stream noch nicht ausgewählt; bislang kein echtes Live-Ereignis beobachtet.
- Profilwechsel und erforderliche Neustarts während paralleler Arbeit ausgesetzt.

## Testkonfiguration und Wiederherstellung

Bisher keine Testkonfiguration geändert. Nur Bericht erstellt und Browser geöffnet.

### Beobachtung A1/A2: Verbindung zu fremdem Stream erzwingt Profilwechsel
- 2026-10-03 ca. 19:17 Europe/Vienna, Profil test, Commit wie oben.
- Reproduktion: 1. Testprofil ohne Stream-Alias laden. 2. Im Dashboard sabrinasammer eintragen. 3. Verbinden klicken.
- Beobachtet: Profil sabrinasammer wird automatisch angelegt; profile:switched fordert Neustart an; Server vorübergehend nicht erreichbar; anschließend activeProfile=sabrinasammer.
- Codebeleg: app/server.js /api/connect, Zweig loadedProfile !== username.
- Einordnung noch offen: bestehendes Profil-/Alias-Konzept; kein vorschnell bestätigter Produktbug. Tests im Profil test benötigen einen temporären Alias.
- Wiederherstellung: POST /api/profiles/switch mit username=test; GET /api/profiles/active bestätigt test, requiresRestart=false. Der automatisch angelegte leere Profilrest bleibt erhalten, da keine Löschung von Profilen autorisiert ist.
- Schutzmaßnahme: SQLite-Onlinebackup test.before.db und Kopie test_plugins_state.before.json außerhalb Git unter %LOCALAPPDATA%/ltth.app/test-audit-20261003.
- Temporäre Änderung nur im Profil test: Stream-Alias sabrinasammer, nicht primär; am Ende zu entfernen.

### Streambeobachtung S1
- URL: https://www.tiktok.com/@sabrinasammer/live; Handle @sabrinasammer.
- 2026-10-03 ca. 19:16–19:18 Europe/Vienna: LIVE-Titel, 124–132 Zuschauer, wechselnder Chat, Gift Gerhard Giraffe x1 und Follow in TikTok-WebUI gesehen.
- Das sind Beobachtungen auf TikTok, bislang kein Beleg für Connector-Empfang oder Plugin-Reaktion. Chat-Inhalte und private Angaben werden nicht gespeichert.

## Belege 19:19–19:20 Europe/Vienna

- A2 Verbindung im Testprofil: bestanden für initiale Verbindung mit temporärem Alias; UI Verbunden @sabrinasammer; GET /api/status isConnected=true, restarting=false.
- A3 Zuschauer/Likes/Chat: echte Connector-Ereignisse beobachtet. 45-Sekunden-Socketfenster bis 19:20:22: tiktok:stats 101, clarityhud.update.chat 4, clarityhud.update.like 7. Keine Event-Duplikate daraus ableitbar; rohe und aggregierte Events haben unterschiedliche Granularität.
- P5 ClarityHUD: /overlay/clarity/full gerendert, echte Chats und Beitritte sichtbar. Lesbarkeit/Reihenfolge/Layouts/Reconnect noch offen.
- P16 Viewer XP: echte Live-Ereignisse führen zu viewer-xp:update 30, viewerxp:event 30, viewer-xp:level-up 26; korrekte Berechnung/Persistenz noch offen.
- Bereinigter Beleg außerhalb Git: %LOCALAPPDATA%/ltth.app/test-audit-20261003/socket-sanitized-01.json. Enthält nur Eventnamen, Zähler, Feldnamen und ausgewählte Gift-/Statuswerte, keine Chattexte, Namen oder Tokens.
- Abos/Super Fans/Gifts/Serienabschluss im Socketfenster nicht beobachtet. TikTok-WebUI-Gift vor Verbindungsbeginn ist kein Connector-Beleg.
- A9/A10 Login: App-Store-Klick führt zu LTTH-Anmeldeformular im Codex-Browser; kein gespeicherter Login dort verfügbar. Benutzer um Anmeldung gebeten; Zugang weiterhin offen.

## LTTH-LIVE-001 – Sidekick-HUD kann keine TikTok-Studio-Tunnel-URL erhalten (P2)

- Feature: A8 / P24 Sidekick, Overlay /overlay/sidekick/hud.
- Commit und lokale Änderungen: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; vorbestehende Talking-Heads-/TTS-Änderungen siehe Ausgangslage; keine Produktcodeänderungen durch diesen Test.
- Datum/Umgebung: 2026-10-03 19:20 Europe/Vienna, Windows, portable Node 22.14.0, tatsächlicher App-Port 3000, Profil test.
- Voraussetzung: laufende App. Für vollständige Browserabnahme muss Sidekick aktiviert sein; derzeit deaktiviert. Die zentrale URL-Validierung ist davon unabhängig.
- Schritte:
  1. POST /api/network/overlay-tunnel/ensure senden.
  2. Body: {"overlayURL":"http://127.0.0.1:3000/overlay/sidekick/hud"}.
  3. HTTP-Fehlerantwort lesen.
- Erwartet: vorhandener Sidekick-Overlay-Einstiegspunkt lässt sich über den ausgewählten Overlay-Tunnel bereitstellen.
- Tatsächlich: HTTP 400, success=false, code=OVERLAY_URL_NOT_REGISTERED, error=Overlay URL is not registered for public access.
- Testquelle: lokaler API-Aufruf ohne synthetische Live-Daten. Kein Tunnel gestartet, da die URL-Prüfung vorher abbricht.
- Belege: app/plugins/sidekick/main.js:213 registriert den HUD-Pfad; app/modules/public-overlay-registry.js ENTRYPOINTS enthält diesen Pfad nicht. Bereinigter Request und Fehlerantwort stehen oben vollständig.
- Reproduzierbarkeit: einmal live ausgeführt; deterministischer Quellcodepfad bestätigt. Kein Erfolg mit öffentlicher URL behauptet.
- Auswirkungen: Sidekick-HUD für A8 nicht über den zentralen Quick Tunnel freigebbar; öffentliches Rendering blockiert.
- Hypothese zur Ursache: Sidekick wurde bei der zentralen Overlay-Inventur ausgelassen. UI-Angebot und Assets noch separat zu prüfen.

## Overlay-Inventur – Quellcodeabgleich, Browserprüfung noch offen

| Plugin | Quellcodedatei | Overlay-/UI-Route oder URL-Verweis |
|---|---|---|
| animazingpal | app/plugins/animazingpal/main.js | 2683:    this.api.registerRoute('get', '/overlay/animazingpal/stream-assistant', (req, res) => { |
| clarityhud | app/plugins/clarityhud/main.js | 50:    this.api.registerRoute('GET', '/overlay/clarity/chat', (req, res) => { |
| clarityhud | app/plugins/clarityhud/main.js | 57:    this.api.registerRoute('GET', '/overlay/clarity/full', (req, res) => { |
| clarityhud | app/plugins/clarityhud/main.js | 64:    this.api.registerRoute('GET', '/overlay/clarity/multi', (req, res) => { |
| clarityhud | app/plugins/clarityhud/main.js | 71:    this.api.registerRoute('GET', '/overlay/clarity/stream', (req, res) => { |
| clarityhud | app/plugins/clarityhud/main.js | 90:    this.api.registerRoute('GET', '/plugins/clarityhud/*', (req, res) => { |
| clarityhud | app/plugins/clarityhud/main.js | 91:      // req.params[0] contains everything after '/plugins/clarityhud/' |
| coinbattle | app/plugins/coinbattle/main.js | 1391:    this.api.registerRoute('GET', '/api/plugins/coinbattle/overlay/layouts', (req, res) => { |
| coinbattle | app/plugins/coinbattle/main.js | 1403:    this.api.registerRoute('POST', '/api/plugins/coinbattle/overlay/layouts', |
| coinbattle | app/plugins/coinbattle/main.js | 1419:    this.api.registerRoute('DELETE', '/api/plugins/coinbattle/overlay/layouts/:id', |
| coinbattle | app/plugins/coinbattle/main.js | 1461:    this.api.registerRoute('GET', '/plugins/coinbattle/overlay', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 1630:    this.api.registerRoute('get', '/emoji-rain/overlay', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2382:    this.api.registerRoute('post', '/api/emoji-rain/overlay/pause', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2396:    this.api.registerRoute('post', '/api/emoji-rain/overlay/resume', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2421:    this.api.registerRoute('post', '/api/emoji-rain/overlay/clear', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2435:    this.api.registerRoute('post', '/api/emoji-rain/overlay/theme', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2455:    this.api.registerRoute('post', '/api/emoji-rain/overlay/opacity', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2475:    this.api.registerRoute('post', '/api/emoji-rain/overlay/speed', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2495:    this.api.registerRoute('post', '/api/emoji-rain/overlay/bounding-box', (req, res) => { |
| emoji-rain | app/plugins/emoji-rain/main.js | 2517:    this.api.registerRoute('get', '/api/emoji-rain/overlay/state', (req, res) => { |
| fireworks | app/plugins/fireworks/main.js | 460:        this.api.registerRoute('get', '/fireworks/overlay', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 778:        this.api.registerRoute('get', '/flame-overlay/ui', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 784:        this.api.registerRoute('get', '/flame-overlay/overlay', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 790:        this.api.registerRoute('get', '/api/flame-overlay/config', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 800:        this.api.registerRoute('post', '/api/flame-overlay/config', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 824:        this.api.registerRoute('get', '/api/flame-overlay/status', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 838:        this.api.registerRoute('get', '/api/flame-overlay/gift-catalog', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 848:        this.api.registerRoute('get', '/api/flame-overlay/presets', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 859:        this.api.registerRoute('post', '/api/flame-overlay/presets/:name', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 884:        this.api.registerRoute('post', '/api/flame-overlay/presets/:name/load', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 911:        this.api.registerRoute('delete', '/api/flame-overlay/presets/:name', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 936:        this.api.registerRoute('get', '/plugins/flame-overlay/textures/:texture', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 941:        this.api.registerRoute('get', '/flame-overlay/default-config.js', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 946:        this.api.registerRoute('get', '/flame-overlay/:asset', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 953:        this.api.registerRoute('post', '/api/flame-overlay/trigger', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 974:        this.api.registerRoute('post', '/api/flame-overlay/test-event', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 997:        this.api.registerRoute('post', '/api/flame-overlay/clear-triggers', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 1008:        this.api.registerRoute('get', '/api/flame-overlay/triggers', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 1020:        this.api.registerRoute('post', '/api/flame-overlay/triggers', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 1044:        this.api.registerRoute('get', '/api/flame-overlay/trigger-presets', (req, res) => { |
| flame-overlay | app/plugins/flame-overlay/main.js | 1054:        this.api.registerRoute('post', '/api/flame-overlay/trigger-preset/:name', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2342:    this.api.registerRoute('GET', '/overlay/game-engine/connect4', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2347:    this.api.registerRoute('GET', '/overlay/game-engine/chess', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2352:    this.api.registerRoute('GET', '/overlay/game-engine/plinko', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2357:    this.api.registerRoute('GET', '/overlay/game-engine/wheel', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2362:    this.api.registerRoute('GET', '/overlay/game-engine/unified', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2367:    this.api.registerRoute('GET', '/overlay/game-engine/hud', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 2372:    this.api.registerRoute('GET', '/overlay/game-engine/arena', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 4107:    this.api.registerRoute('GET', '/overlay/game-engine/slot', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 4339:    this.api.registerRoute('GET', '/api/game-engine/overlay-settings', (req, res) => { |
| game-engine | app/plugins/game-engine/main.js | 4354:          { id: 'connect4', name: 'Connect4', kind: 'interactive', overlayPath: '/overlay/game-engine/connect4' }, |
| game-engine | app/plugins/game-engine/main.js | 4355:          { id: 'chess', name: 'Blitzschach', kind: 'interactive', overlayPath: '/overlay/game-engine/chess' }, |
| game-engine | app/plugins/game-engine/main.js | 4356:          { id: 'plinko', name: 'Plinko', kind: 'queued', overlayPath: '/overlay/game-engine/plinko' }, |
| game-engine | app/plugins/game-engine/main.js | 4357:          { id: 'wheel', name: 'Glücksrad', kind: 'queued', overlayPath: '/overlay/game-engine/wheel' }, |
| game-engine | app/plugins/game-engine/main.js | 4358:          { id: 'slot', name: 'Slot Machine', kind: 'queued', overlayPath: '/overlay/game-engine/slot' }, |
| game-engine | app/plugins/game-engine/main.js | 4363:            overlayPath: '/overlay/game-engine/arena', |
| game-engine | app/plugins/game-engine/main.js | 4372:    this.api.registerRoute('POST', '/api/game-engine/overlay-settings', (req, res) => { |
| interactive-story | app/plugins/interactive-story/main.js | 1365:    this.api.registerRoute('get', '/interactive-story/overlay', (req, res) => { |
| interactive-story | app/plugins/interactive-story/main.js | 1505:    this.api.registerRoute('get', '/api/interactive-story/overlay-positions', (req, res) => { |
| interactive-story | app/plugins/interactive-story/main.js | 1520:    this.api.registerRoute('post', '/api/interactive-story/overlay-positions', (req, res) => { |
| music-bot | app/plugins/music-bot/main.js | 1991:    this.api.registerRoute('get', '/plugins/music-bot/overlay', async (req, res) => { |
| quiz-show | app/plugins/quiz-show/main.js | 1518:        this.api.registerRoute('get', '/quiz-show/overlay', (req, res) => { |
| quiz-show | app/plugins/quiz-show/main.js | 1522:        this.api.registerRoute('get', '/quiz-show/overlay/splitscreen', (req, res) => { |
| quiz-show | app/plugins/quiz-show/main.js | 1526:        this.api.registerRoute('get', '/quiz-show/leaderboard-overlay', (req, res) => { |
| quiz-show | app/plugins/quiz-show/main.js | 1539:        this.api.registerRoute('get', '/quiz-show/quiz_show_overlay.js', (req, res) => { |
| quiz-show | app/plugins/quiz-show/main.js | 1543:        this.api.registerRoute('get', '/quiz-show/quiz_show_overlay.css', (req, res) => { |
| schnorrbecher | app/plugins/schnorrbecher/main.js | 126:    this.api.registerRoute('get', '/overlay/coincup', (req, res) => { |
| sidekick | app/plugins/sidekick/main.js | 213:    this.api.registerRoute('get', '/overlay/sidekick/hud', (req, res) => { |
| visual-fx-frame-webgpu | app/plugins/visual-fx-frame-webgpu/main.js | 916:        this.api.registerRoute('get', '/visual-fx-frame-webgpu/overlay', (req, res) => { |
| visual-fx-frame-webgpu | app/plugins/visual-fx-frame-webgpu/main.js | 970:        this.api.registerRoute('get', '/api/visual-fx-frame-webgpu/import/flame-overlay', (req, res) => { |
| visual-fx-frame-webgpu | app/plugins/visual-fx-frame-webgpu/main.js | 979:        this.api.registerRoute('post', '/api/visual-fx-frame-webgpu/import/flame-overlay', (req, res) => { |
| weather-control | app/plugins/weather-control/main.js | 458:        this.api.registerRoute('get', '/weather-control/overlay', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 1689:    this.api.registerRoute('get', '/webgpu-emoji-rain/overlay', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2467:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/pause', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2481:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/resume', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2506:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/clear', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2520:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/theme', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2540:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/opacity', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2560:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/speed', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2580:    this.api.registerRoute('post', '/api/webgpu-emoji-rain/overlay/bounding-box', (req, res) => { |
| webgpu-emoji-rain | app/plugins/webgpu-emoji-rain/main.js | 2603:    this.api.registerRoute('get', '/api/webgpu-emoji-rain/overlay/state', (req, res) => { |
| webgpu-fireworks | app/plugins/webgpu-fireworks/main.js | 1496:        this.api.registerRoute('get', '/webgpu-fireworks/overlay', (req, res) => { |
| webgpu-weather-control | app/plugins/webgpu-weather-control/main.js | 664:        this.api.registerRoute('get', '/webgpu-weather-control/overlay', (req, res) => { |
| webgpu-weather-control | app/plugins/webgpu-weather-control/main.js | 1409:        this.api.registerRoute('get', '/api/webgpu-weather/overlay-config', (req, res) => { |

## A8 öffentliche ClarityHUD-Prüfung 19:21–19:23

| Prüfung | Status | Beleg |
|---|---|---|
| Tunnelstart am tatsächlichen Port 3000 | bestanden | ensure /overlay/clarity/full: success=true, reused=false |
| Tunnelwiederverwendung für anderes Overlay | bestanden | ensure /overlay/clarity/chat: reused=true, identischer Host, korrekter Chat-Pfad |
| Öffentliche Erreichbarkeit / Live-Rendering ClarityHUD full | bestanden | Gerenderte HTTPS-Seite zeigt neue echte Chats, Beitritte und Likes; keine reine lokale Vorschau |
| Kernassets für öffentliche ClarityHUD-Seite | bestanden | full.js und socket.io.js jeweils HTTP 200 |
| Öffentlicher Dashboard-/Profil-/Account-Zugriff | bestanden | GET /dashboard.html, /api/profiles, /api/plugin-store/account jeweils neutrale HTTP 404 |
| Öffentlicher Schreibzugriff auf Profile | bestanden | POST /api/profiles mit leerem Objekt: HTTP 404 |
| Tunnel-Kopierknopf, Abbruch, Neustart und geänderter Host | nicht beobachtet | Offen |
- Temporärer Tunnel wurde durch diesen Test gestartet: https://participated-lewis-affair-irc.trycloudflare.com. Am Ende zu stoppen; anderer manueller Tunnel darf nicht verändert werden.

## Login-Fehler – vorläufige Einordnung

- Benutzer hat sich im geöffneten LTTH-Accountformular angemeldet. Die lokale Callback-Seite zeigt Sign-in failed / Local account verification failed with HTTP 401.
- Backend-Beleg logs/app-2026-10-03.log:2933, 19:20:56: [Clerk] Could not verify store session token: Clerk session token verification failed: jwt not active.
- Token, Accountdaten und Header wurden nicht gespeichert.
- A9/A10 über den gespeicherten Login derzeit blockiert; Ursache noch nicht als Produktbug bestätigt. Hypothese: Zeitabweichung zwischen Aussteller und lokalem Verifier.

### Login-Zeitvergleich 19:22:26

- Lokale UTC-Zeit vor/nach HTTPS-JWKS-Anfrage: 17:22:26.008 / 17:22:26.390.
- Date-Header desselben Clerk-Endpunkts: 17:22:45 GMT (etwa 19 Sekunden voraus). HTTP 200.
- Der Verifier in app/modules/clerk-store-auth.js setzt clockTolerance=5. Zusammenspiel mit jwt not active ist ein belastbarer Hinweis auf Uhrzeitabweichung, kein bestätigter Defekt der Signaturprüfung.
- Systemzeit und Tokenprüfung bleiben unverändert. Keine Token aus Browser oder Requests ausgelesen.

## Fortsetzungsstand

- Persistentes Ziel aktiv; vollständige Prüfung nicht abgeschlossen. Matrixeinträge mit Offen sind ausstehend.
- LTTH läuft im Testprofil und empfängt @sabrinasammer. Temporärer Alias und Overlay-Tunnel bleiben während der weiteren Tests aktiv.
- Wiederherstellungspunkt liegt außerhalb Git. Alias am Ende entfernen, selbst gestarteten Overlay-Tunnel stoppen, veränderte Testeinstellungen gezielt zurücksetzen; nicht das gesamte Profil blind überschreiben.
- Anmeldung vom Benutzer durchgeführt, lokaler Callback scheitert mit 401 / jwt not active. Login-/Store-Arbeiten müssen die Zeitabweichung berücksichtigen, ohne Produktkorrektur oder Systemzeitänderung.
- Auth-Callback-Tab, TikTok-Live-Tab, lokales und öffentliches ClarityHUD sind für Fortsetzung erhalten.
- Nächste Arbeit: Matrix in einzelne Prüfschritte aufteilen; vollständige Overlay-Inventur einschließlich UI-Angeboten; Reconnect und Plugin-/Store-Login; übrige Pluginfunktionen und Fehlerfälle.
- Parallel entstandene Talking-Heads-Datei challenger-m2 bleibt erhalten.

## Fortsetzung 19:34–19:36 – Login und Pluginverwaltung

- Live-Status: Profil test, @sabrinasammer weiter verbunden, Zuschauer 118, Likes 80836, Coins 964, Follower 2, Gifts 16. Dies sind kumulierte Backend-Zähler, noch keine vollständige Payload-/Serienprüfung.
- Loginblocker überwunden: normale Session-Anfrage ausschließlich im Browser kurz verzögert, bis der Token zeitlich gültig war. Anschließend reguläre Verifikation erfolgreich und Store geladen. Raw-CDP-Interception danach mit leerem Fetch-patterns-Array entfernt, angehaltene Anfrage freigegeben. Keine Tokenprüfung/Systemzeit/Produktdateien geändert; keine Token oder Header ausgegeben.
- Store-Katalog gerendert: 35 Katalogeinträge, 35 installiert, 0 Updates. Updates daher nicht als erfolgreich getestet gewertet.
- Installed-Ansicht: 38 lokale Pluginmanifeste; lokale Versionen unter anderem EmojiRain 2.1.2, Top Tier 2.0.1, WebGPU EmojiRain 3.0.5 neuer als Storepakete. Keine Installation/kein Downgrade vorgenommen.
- A9 Advanced Timer: Aktivieren über angemeldete Installed-UI erfolgreich; Karte zeigt Aktiv und Loaded 19:35. Temporäre Änderung im Profil test: advanced-timer false -> true. Am Ende deaktivieren.

## Fortsetzung 2026-10-05 – Zustandsprüfung

- Voriger Zielturn: Fortschritt (Login erfolgreich, Advanced Timer aktiviert und separater 60-Sekunden-Timer in gerenderter UI angelegt/gestartet); kein abgeschlossener Gesamttest.
- Aktueller Commit unverändert: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Zusätzliche parallele Talking-Heads-Änderungen bleiben erhalten.
- GET /api/profiles/active am 2026-10-05 um ca. 06:00 Europe/Vienna: activeProfile=pupcid, requiresRestart=false, port=3000.
- Keine weiteren Live-/Konfigurations-/Lifecycle-Schreibtests ausgeführt: der verbindliche Testprofilumfang wäre sonst verletzt. Kein Profilwechsel und kein Neustart ausgelöst.
- Neuer Laufzeitblocker R1: App ist nicht mehr im Testprofil; Rückkehr ins Testprofil erfordert laut aktuellem Servercode einen Neustart, der während paralleler Arbeit nicht zulässig ist. Nicht mit dem inzwischen überwundenen Loginblocker verwechseln.

## LTTH-LIVE-002 – Advanced-Timer-Daten sind zwischen App-Profilen nicht getrennt (P1)

- Feature: A1 Profiltrennung / P1 Advanced Timer, Timer und Plugin-Datenbank.
- Getesteter Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; relevante lokale Änderungen beschränken sich auf parallele Talking-Heads-/TTS-Arbeit, keine Änderungen am geprüften Timer-/Pfadcode.
- Datum/Umgebung: UI-Test 2026-10-03 ca. 19:36 Europe/Vienna, Profil test, Windows, portable Node 22.14.0, App-Port 3000; read-only Nachprüfung 2026-10-05 ca. 06:01, App inzwischen pupcid.
- Voraussetzungen: Advanced Timer im Testprofil aktivieren; vorhandene Daten nicht löschen. Der Plugin-Datenpfad ist unabhängig vom geladenen App-Profil.
- Reproduktion:
  1. Im Testprofil Advanced Timer aktivieren.
  2. In der gerenderten Timer-UI einen Timer AUDIT-20261003-Countdown mit Anfangsdauer 60 Sekunden erstellen.
  3. Starten klicken: Karte zeigt LÄUFT, 00:59; API bestätigt state=running, initial_duration=60.
  4. Datenbankpfad und Schema read-only prüfen, ohne einen anderen Profilwechsel auszulösen.
  5. Die Tabelle advanced_timers enthält den Audit-Timer im gemeinsamen Plugin-Datenpfad, ohne Profilspalte. Der später unabhängig erfolgte Profilwechsel ändert diesen Speicherpfad nicht.
- Erwartet: Timerdaten und Teständerungen bleiben ausschließlich dem App-Profil test zugeordnet; andere Profile teilen diesen Zustand nicht.
- Tatsächlich: Speicherung unter %LOCALAPPDATA%/ltth.app/plugins/advanced-timer/data/timers.db. getPluginDataDir erhält ausschließlich die Plugin-ID, keinen Profilnamen. advanced_timers hat keine Profilspalte; getAllTimers wird ohne Profilfilter gelesen. Der Audit-Timer ist dort am 05.10. weiterhin vorhanden, state=stopped, current_value=0.
- Testquelle: lokaler UI-/API-Test am 03.10.; read-only SQLite- und Quellcode-Nachprüfung am 05.10. Keine synthetischen TikTok-Ereignisse. Kein erneuter gerenderter Test im Profil pupcid ausgeführt.
- Bereinigte Belege: app/modules/config-path-manager.js:140; app/plugins/advanced-timer/backend/database.js:43 und :52; app/plugins/advanced-timer/backend/api.js:118. SQLite-Schema hat id,name,mode,initial_duration,current_value,target_value,state,created_at,updated_at,config und Interaktionsfelder, keine profile_id.
- Audit-Timer-ID: timer_1791048981494_hb1kvdrzx. Name AUDIT-20261003-Countdown, Countdown 60 Sekunden, current_value am 05.10.=0, state=stopped.
- Reproduzierbarkeit: Speicherung eines Audit-Timers tatsächlich erfolgt und read-only nachgewiesen; Profilunabhängigkeit des Speicherpfads/ungefilterten Zugriffs deterministisch im aktuellen Code belegt. Eine zweite Schreibreproduktion ist wegen der Profiltrennungsgrenze ausdrücklich unterblieben.
- Auswirkungen: Erstellen, Reset, Löschen und Interaktionsfortschritt können gemeinsame Timerdaten anderer App-Profile beeinflussen. Das alleinige Umschalten auf Profil test garantiert für diesen Plugin-Speicher keine Isolation.
- Ursache (Codebefund): gemeinsamer persistenter Plugin-Datenpfad und Timer-Tabelle ohne Profilzuordnung. Nicht als Hypothese ausgegeben.

### Wiederherstellung und Schutzgrenze nach LIVE-002

- Der Audit-Timer wurde noch nicht entfernt, weil die App jetzt pupcid lädt und die Datenbank gemeinsam ist. Kein vorhandener Timer wird gelöscht oder blind aus einem Gesamtbackup überschrieben.
- Der schon vorher vorhandene Timer timer_1783352150509_sg5650syi zeigte beim ersten UI-Laden 54:24:38, später 54:25:08 trotz GESTOPPT; er hat aktive Like-/Coin-Interaktionen. Keine manuelle Einstellung dieses Timers geändert. Zuwachs durch echte Live-Ereignisse während Pluginaktivierung möglich; kein zweifelsfreier Baseline-Wert vor Aktivierung vorhanden. Deshalb keine willkürliche Zeitkorrektur.
- Der bisherige Wiederherstellungspunkt test.before.db sichert die Profil-Hauptdatenbank, NICHT die separate gemeinsame timers.db. Er darf nicht als vollständiger Plugin-Wiederherstellungspunkt bezeichnet werden.
- Temporär advanced-timer im Profil test aktiviert; Alias sabrinasammer im Testprofil und selbst gestarteter Overlay-Tunnel bleiben als offene Wiederherstellungspositionen geführt. Aktueller Tunnelstatus und aktuelle Testprofil-Pluginpersistenz noch nicht erneut geprüft.
- Weitere mutierende Timer-/Import-/Datei-Asset-Tests sind bis zu einem verlässlich isolierten Testzustand blockiert. Kein Produktfix vorgenommen.

| Einzelprüfung | Status | Aktueller Beleg / Grenze |
|---|---|---|
| A1 aktuell geladenes Profil | blockiert | Laufzeit lädt pupcid; test war nur am 03.10. aktiv |
| A1 Advanced-Timer-Datenprofiltrennung | Bug bestätigt | LIVE-002, gemeinsamer Datenpfad und ungefilterte Timer-Tabelle |
| P1 Audit-Timer erstellen / starten / Countdownanzeige | bestanden | UI erstellt 60s und zeigt LÄUFT/00:59; API state=running |
| P1 mehr als ein Timer gleichzeitig vorhanden | bestanden | UI-Gesamtzahl 2; Audit-Timer und vorbestehender Timer |
| P1 Countdown-Endzustand | nicht beobachtet | SQLite am 05.10. stopped/0; unmittelbarer Ablauf und sichtbare Reaktion nicht beobachtet |
| P1 Pause/Resume/Reset, Regeln, Profile, Persistenz nach kontrolliertem Lifecycle | blockiert | R1 und LIVE-002; nicht als getestet ausgeben |
| A9 Aktivieren Advanced Timer | bestanden | Authentifizierte Installed-UI zeigt Aktiv/Loaded am 03.10. |
| A9 Deaktivieren/Listener-/Timer-Bereinigung | blockiert | R1, aktive App nun pupcid |
| A10 Katalog und gespeicherter Login | bestanden | Am 03.10. nach zeitlicher Verzögerung regulär angemeldet; 35 Katalogeinträge |
| A10 verfügbare Updates | nicht beobachtet | Store meldete 0 Updates; kein Update ausgeführt |

## Präzisierte A8-Quellinventur 05.10. – 24 ausgewählte Plugins

Die frühe heuristische Routentabelle enthält auch API-/Assetpfade und ist keine vollständige Overlay-Liste. Der folgende Abgleich erfasst UI-Quellen mit Studio-Kopiermarkern und die tatsächlichen Manifest-Entry-Dateien. Quellcodebelege ersetzen keine gerenderte UI-Abnahme. Fehlende Marker sind Kandidaten, bis alle dynamischen UI-Zugänge geprüft wurden.

| Plugin | Manifest-Entry | UI-Quellen mit Studio-Kopiermarker | Gemeinsamer Datei-/DB-Speicher im Plugincode |
|---|---|---|---|
| advanced-timer | main.js | app\plugins\advanced-timer\ui\ui.js | app\plugins\advanced-timer\backend\database.js<br>app\plugins\advanced-timer\backend\api.js |
| animazingpal | main.js | app\plugins\animazingpal\live-host-ui.js | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| clarityhud | main.js | app\plugins\clarityhud\ui\main.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| coinbattle | main.js | app\plugins\coinbattle\ui.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| config-import | main.js | kein Marker im gescannten Code; UI-Abnahme offen | app\plugins\config-import\main.js |
| emoji-rain | main.js | app\plugins\emoji-rain\ui.html | app\plugins\emoji-rain\main.js |
| fireworks | main.js | app\plugins\fireworks\ui\settings.html | app\plugins\fireworks\main.js |
| flame-overlay | main.js | app\plugins\flame-overlay\ui\settings.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| game-engine | main.js | app\plugins\game-engine\tiktok-studio-ui.js | app\plugins\game-engine\main.js |
| gcce | index.js | app\plugins\gcce\ui.html | app\plugins\gcce\index.js |
| goals | main.js | app\plugins\goals\ui.js | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| interactive-story | main.js | app\plugins\interactive-story\ui.html | app\plugins\interactive-story\main.js |
| milestone-leaderboard | main.js | kein Marker im gescannten Code; UI-Abnahme offen | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| music-bot | main.js | app\plugins\music-bot\ui.html | app\plugins\music-bot\lib\media-cache.js |
| quiz-show | main.js | app\plugins\quiz-show\quiz_show.html | app\plugins\quiz-show\main.js |
| schnorrbecher | main.js | app\plugins\schnorrbecher\ui.html | app\plugins\schnorrbecher\main.js |
| sidekick | main.js | kein Marker im gescannten Code; UI-Abnahme offen | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| stream-monsters | index.js | app\plugins\stream-monsters\streammonsters-ui.html | app\plugins\stream-monsters\index.js |
| toptier | main.js | app\plugins\toptier\ui.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| visual-fx-frame-webgpu | main.js | app\plugins\visual-fx-frame-webgpu\ui\settings.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| weather-control | main.js | app\plugins\weather-control\ui.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |
| webgpu-emoji-rain | main.js | app\plugins\webgpu-emoji-rain\ui.html | app\plugins\webgpu-emoji-rain\main.js |
| webgpu-fireworks | main.js | app\plugins\webgpu-fireworks\ui\settings.html | app\plugins\webgpu-fireworks\main.js |
| webgpu-weather-control | main.js | app\plugins\webgpu-weather-control\ui.html | kein direkter getPluginDataDir-Aufruf im gescannten Code |

### 05.10. – Profilwechsel ausdrücklich freigegeben
- Benutzerantwort: kannst du wechseln. Damit ist dieser eine notwendige Profilwechsel/Neustart ausdrücklich erlaubt.
- POST /api/profiles/switch username=test: success=true, requiresRestart=true, restartScheduled=true, vorher activeProfile=pupcid.
- Abschließende Verifikation des geladenen Profils und Neustartzustands folgt; R1 erst danach als aufgehoben werten.
- LIVE-002 bleibt bestehen; gemeinsame Timerdaten werden nicht weiter verändert.

### Profilneustart verifiziert
- Freigegebene read-only Prozess-/HTTP-Prüfung bestätigt nach dem vom Nutzer erlaubten Wechsel: Port 3000, activeProfile=test, requiresRestart=false.
- R1 aufgehoben. Erste Abfragen aus der inzwischen eingeschränkten Sandbox waren kein Beleg für einen ausgefallenen Server. Keine zusätzlichen manuellen Appstarts ausgelöst.

### Schutzmaßnahme im wieder geladenen Testprofil
- Advanced Timer nach erneutem Profil-Guard ausschließlich in test deaktiviert; API success=true und Inventur enabled=false. Ursprünglicher Plugin-Aktivierungszustand damit wiederhergestellt.
- Gemeinsame Timerdaten einschließlich Audit-Timer bleiben unangetastet. Weitere echte Streamereignisse werden nicht mehr an den aktivierten Timer geleitet.
- Zum neuen Verbindungsaufbau am 05.10. ist erneut ein aktuell aktiver Stream zu verifizieren; der Streamstatus vom 03.10. wird nicht übernommen.

## Fortsetzung 2026-10-05 – Testprofil und CoinBattle

- Der ausdrücklich genehmigte Profilwechsel ist abgeschlossen: GET /api/profiles/active lieferte test, requiresRestart=false, Port 3000. Der Store-Zugang funktioniert nach dem Wechsel weiterhin.
- Neuer realer Stream: https://www.tiktok.com/@wahanfx/live, öffentlich sichtbares GTA-V-Live mit ca. 738 Zuschauern und Chat/Beitritten, ca. 06:03 Europe/Vienna. Temporärer nicht primärer Alias wahanfx nur im Profil test angelegt; Rücknahme weiterhin offen.
- Vor CoinBattle-Aktivierung SQLite-Online-Sicherung des Testprofils unter %LOCALAPPDATA%/ltth.app/test-audit-20261005/test.before-coinbattle.db. Keine anderen Profile gesichert oder geändert.
- CoinBattle über gerenderte Pluginverwaltung aktiviert, Solo-Runde 1 mit 90 Sekunden gestartet; ohne Simulation oder synthetische Gifts. Pause, Fortsetzen, Verlängerung um 60 Sekunden und 2x-Multiplikator ausgelöst. Verlängerung nach Fortsetzen im API-Status sichtbar (elapsed=48, remaining=102, gesamte Laufzeit=150 Sekunden).
- Runde anschließend über Match beenden abgeschlossen; vor dem Rücksetzen war data.active=false. CoinBattle wieder deaktiviert, API success=true. Ursprünglich deaktivierter Zustand wiederhergestellt. Historischer Datensatz der leeren Testrunde bleibt im Testprofil; keine bestehenden Runden gelöscht. Keine Konfiguration gespeichert.
- 45 Sekunden bereinigte Socket-Beobachtung ab ca. 06:06: tiktok:stats 65, tiktok:event 27, Clarity-Join 27, Viewer-XP-update 26, Viewer-XP-level-up 25, CoinBattle-timer-update 10. Keine tatsächlichen Chat-, Like-, Gift-, Abo- oder Super-Fan-Ereignisse in diesem Fenster nachgewiesen. Sichtbarer öffentlicher Chat ist kein Beweis für ein Connector-Chatereignis.

| Funktion | Status | Beleg / Grenze |
|---|---|---|
| A1 autorisierter Profilwechsel | bestanden | aktive API und gerenderter Header test |
| A10 bestehender Store-Zugang nach Wechsel | bestanden | lokaler eingeloggter Katalog; Installation/Update weiterhin offen |
| P6 Solo-Runde starten, pausieren, fortsetzen, beenden | bestanden | gerenderte Steuerelemente und aktive/inaktive Backendzustände |
| P6 Verlängerung um 60 Sekunden | bestanden | aktive Restzeit nach Fortsetzen entspricht 150 Sekunden Gesamtlaufzeit; Anzeige während Pause gesondert fehlerhaft |
| P6 pausierter Status | Bug bestätigt | LTTH-LIVE-003 |
| P6 2x-Multiplikator | nicht beobachtet | Aktivierungsanzeige gesehen; echte Giftwertung und vollständiges Pausenverhalten nicht nachgewiesen |
| P6 echte Gifts, Serien, Teams, Rankings | nicht beobachtet | keine Gifts im begrenzten Beobachtungsfenster; weitere Tests offen |
| P6 Pluginzustand zurücksetzen | bestanden | POST disable success=true, keine neue App-Neustartaktion |

## LTTH-LIVE-003 – CoinBattle meldet ablaufende Restzeit während einer Pause (P2)

- Betroffen: P6 CoinBattle, Status-API und Socket-Matchzustand, Timerdarstellung bei Verlängerung während Pause.
- Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Vorhandene parallele Talking-Heads-/TTS-Änderungen unverändert erhalten. Keine CoinBattle-Quelldatei geändert.
- Datum/Umgebung: 2026-10-05 ca. 06:07–06:11 Europe/Vienna, Windows, portable Node 22.14.0, Port 3000, Profil test, Codex-Browser.
- Voraussetzung: CoinBattle aktiv, eigene Solo-Testrunde läuft.
- Reproduktion:
  1. Über die gerenderte CoinBattle-Steuerung Solo-Match mit 90 Sekunden starten.
  2. Anhalten klicken. Optional um 60 Sekunden verlängern.
  3. Während derselben Pause wiederholt GET /api/plugins/coinbattle/state lesen; nur data.match auswerten.
  4. Mit der sichtbaren pausierten Restzeit vergleichen und anschließend Fortsetzen klicken.
- Erwartet: Die Restzeit einer pausierten Runde bleibt konstant; eine Verlängerung erhöht sie auch im pausierten Zustand. API, Socketzustand und sichtbarer Timer stimmen überein.
- Tatsächlich: Zweite Pause zeigte in der UI konstant 01:38. API um 04:10:42.634 UTC: id=1, isPaused=true, elapsed=67, remaining=83. Um 04:10:56.877 UTC weiterhin isPaused=true, elapsed=81, remaining=69. Die Restzeit fiel während derselben Pause um 14 Sekunden. Bei der ersten längeren Pause fiel die API bereits auf remaining=0, obwohl die UI 00:56 zeigte. Nach Fortsetzen wurde die Pausendauer wieder angerechnet; die Runde lief weiter. Ein tatsächlicher vorzeitiger Rundenabschluss wird deshalb nicht behauptet.
- Testquelle: lokale gerenderte UI- und API-Prüfung einer leeren Testrunde bei laufender echter Empfangsverbindung. Keine synthetischen Events; keine echte Giftwertung als Teil dieses Befunds.
- Reproduzierbarkeit: zwei Pausen derselben Runde; zweite Pause mit zwei zeitgestempelten Messpunkten eindeutig bestätigt.
- Auswirkungen: neue Clients, Overlays oder API-Verbraucher erhalten falsche pausierte Restzeiten, gegebenenfalls 0; Verlängerung wird im pausierten UI-Timer nicht unmittelbar sichtbar.
- Ursache durch Quellcode gestützt: game-engine.js getMatchState berechnet elapsed aus Date.now(), matchStartTime und totalPausedTime. Die laufende Pause wird erst in resumeMatch zu totalPausedTime addiert. UI aktualisiert seinen Timer über timer-update, der beim Pausieren gestoppt wird. Eine Produktkorrektur wurde nicht vorgenommen.
- Bereinigung: Testrunde beendet; CoinBattle wieder deaktiviert. Sicherung und historischer Test-Rundendatensatz bleiben erhalten.

## LTTH-LIVE-004 – Viewer XP bietet keine TikTok-Studio-URLs für seine drei Overlays (P2)

- Betroffen: A8 / P16 Viewer XP, gerendertes OBS-Panel unter /viewer-xp/admin.
- Commit/Änderungen: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; bestehende parallele Änderungen erhalten, keine Produktkorrektur.
- Umgebung: 2026-10-05 ca. 06:14 Europe/Vienna, Windows, portable Node 22.14.0, Profil test, Port 3000.
- Voraussetzung: Viewer XP läuft; Dashboard zeigt den Sidebar-Eintrag Viewer XP.
- Reproduktion:
  1. Viewer XP in der Sidebar öffnen.
  2. Richten Sie OBS-Overlays ein oder OBS-Panel auswählen.
  3. Die Karten XP-Balken-Overlay, Bestenlisten-Overlay und Level-Up-Animationsüberlagerung prüfen.
- Erwartet: Für jeden angebotenen Overlay-Einstieg gibt es das Erzeugen/Kopieren einer TikTok-Studio-URL wie bei anderen ausgewählten Plugins.
- Tatsächlich: Alle drei Karten bieten nur Kopieren, URL aktualisieren und Overlay testen. Kein TikTok-Studio-Kopierangebot. Angezeigte lokale Pfade: /overlay/viewer-xp/xp-bar, /overlay/viewer-xp/leaderboard, /overlay/viewer-xp/level-up; alle drei lokale GETs liefern HTTP 200.
- Zusätzlich fehlt jeder dieser drei Pfade in ENTRYPOINTS von app/modules/public-overlay-registry.js. Die aktuelle Registry ist deshalb keine vollständige Inventur der tatsächlich vorhandenen Overlays. Ein tatsächlich gesendeter Tunnel-Request/400 wird für diese drei Pfade nicht behauptet.
- Testquelle: gerenderte lokale Benutzeroberfläche, tatsächliche lokale HTTP-GETs und Quellabgleich; keine synthetischen TikTok-Daten.
- Reproduzierbarkeit: alle drei Karten derselben Panelansicht. Auswirkung: Studio-URL lässt sich dort nicht über den vorgesehenen Benutzerablauf erzeugen.
- Externer Prüfblocker getrennt vom Bug: automatische Freigabeprüfung lehnte die vorgesehenen Tunnel-POSTs wegen möglicher Veröffentlichung von Viewer-Daten ab. Kein Tunnel-POST ausgeführt; explizite Freigabe für öffentliche Namen/Profilbilder/XP angefragt. Lokale Prüfungen vollständig ausgeführt.

| A8 Overlay-Einstieg | UI-Zugang | Studio-Angebot | Lokaler GET | Öffentliche Prüfung |
|---|---|---|---|---|
| /overlay/viewer-xp/xp-bar | Viewer XP > OBS-Panel > XP-Balken | Bug bestätigt: fehlt | bestanden: 200 | blockiert: Freigabeprüfung; Registry fehlt |
| /overlay/viewer-xp/leaderboard | Viewer XP > OBS-Panel > Bestenliste | Bug bestätigt: fehlt | bestanden: 200 | blockiert: Freigabeprüfung; Registry fehlt |
| /overlay/viewer-xp/level-up | Viewer XP > OBS-Panel > Level-Up | Bug bestätigt: fehlt | bestanden: 200 | blockiert: Freigabeprüfung; Registry fehlt |

### LTTH-LIVE-004 – Ergänzung nach expliziter Freigabe

- Der Nutzer gab am 05.10. nach Benennung möglicher öffentlicher TikTok-Namen, Profilbilder und Testprofil-XP die öffentlichen Tests ausdrücklich frei. Der vorherige automatische Freigabeblocker ist damit für diese Prüfung aufgelöst.
- Tatsächlich ausgeführte POST /api/network/overlay-tunnel/ensure mit jeder der drei /overlay/viewer-xp/...-URLs: jeweils HTTP 400, code=OVERLAY_URL_NOT_REGISTERED, error=Overlay URL is not registered for public access. Somit zusätzlich zum fehlenden UI-Angebot eine bestätigte backendseitige Ablehnung, keine öffentliche Erreichbarkeit.
- Vierter betroffener Einstieg desselben kombinierten Plugins: /gift-milestone/overlay. Gerenderter Zugang Dashboard > Geschenk-Meilenstein > Overlay öffnen; nur lokaler Link, kein Studio-Angebot. GET lokal HTTP 200. Quellroute in vendor/gift-milestone/main.js:238 vorhanden, öffentliche Registry ohne diesen Einstieg. Für diesen vierten Pfad noch kein Tunnel-Request gesendet.

| Overlay | aktualisierter A8-Status |
|---|---|
| /overlay/viewer-xp/xp-bar | Bug bestätigt: UI-Angebot fehlt und tatsächlicher Tunnel-Request HTTP 400 / OVERLAY_URL_NOT_REGISTERED |
| /overlay/viewer-xp/leaderboard | Bug bestätigt: UI-Angebot fehlt und tatsächlicher Tunnel-Request HTTP 400 / OVERLAY_URL_NOT_REGISTERED |
| /overlay/viewer-xp/level-up | Bug bestätigt: UI-Angebot fehlt und tatsächlicher Tunnel-Request HTTP 400 / OVERLAY_URL_NOT_REGISTERED |
| /gift-milestone/overlay | Bug bestätigt: Studio-Angebot fehlt; lokale Erreichbarkeit HTTP 200; Registry fehlt; Tunnel-Request noch offen |

## LTTH-LIVE-005 – Benutzerprofil-Overlay zeigt CSS als sichtbaren Text (P2)

- Betroffen: P16 Viewer XP, /overlay/viewer-xp/user-profile, auch eingebettet in der Admin-Live-Vorschau.
- Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; keine Produktänderung, parallele Änderungen erhalten.
- Umgebung: 2026-10-05 ca. 06:18 Europe/Vienna, Windows, Profil test, Port 3000, Codex-In-App-Browser.
- Reproduktion:
  1. Viewer XP > Live-Vorschau öffnen.
  2. Benutzerprofil – Detaillierte Zuschauerstatistikkarte auswählen.
  3. Vorschau ansehen oder die angebotene URL /overlay/viewer-xp/user-profile direkt öffnen, ohne Testparameter.
- Erwartet: Transparentes Profil-Overlay ohne sichtbaren Quellcode; Theme-Regeln werden als CSS angewandt.
- Tatsächlich: Unter dem Profilbereich erscheinen mehrere CSS-Regeln beginnend mit html[data-theme="cid"] body als unformatierter Text. Direktansicht zeigt den Textblock unten im 1280x720-Viewport auch ohne aktiven Profil-Event.
- Bereinigter DOM-Beleg: Textknoten mit parent=BODY und Anfang html[data-theme="cid"] body { background: transparent; color: #f4fff4; }. Gerenderter Screenshot in der Testkonversation bestätigt sichtbaren Textblock; keine Screenshotdatei gespeichert.
- Quellbeleg: app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/user-profile.html enthält die Theme-Regeln nach </body></html>, ohne Style-Element. Browser nimmt sie als Body-Text auf.
- Testquelle: tatsächliche lokale Browserdarstellung und DOM-Prüfung, keine synthetischen Daten, kein öffentlicher Profil-Event nötig.
- Reproduzierbarkeit: eingebettete Vorschau und direkte URL. Auswirkung: Quelltext erscheint in der Browserquelle; die betreffenden Theme-Regeln werden nicht angewandt.
- Keine Änderung oder Bereinigung nötig: nur Vorschauauswahl und temporären Browser-Tab verwendet.

### Viewer-XP-Overlayinventur erweitert

- Insgesamt acht aktuelle Einstiege im kombinierten P16-Plugin: /overlay/viewer-xp/xp-bar, /overlay/viewer-xp/leaderboard, /overlay/viewer-xp/level-up, /overlay/viewer-xp/user-profile, /overlay/viewer-xp/event-ticker, /overlay/viewer-xp/spin-wheel, /leaderboard/overlay und /gift-milestone/overlay.
- Alle acht wurden lokal tatsächlich per GET geprüft: HTTP 200. Alle acht tatsächlich an den Tunnel-Endpunkt übergeben: HTTP 400 / OVERLAY_URL_NOT_REGISTERED. Damit ist die fehlende öffentliche Registrierung für sämtliche acht bestätigt; kein Tunnel wurde durch diese Requests gestartet.
- Die zweite automatische Ablehnung wurde durch konkreten Sicherheitsnachweis aufgelöst: overlay-tunnel-routes.js validiert vor ensureOverlayQuickTunnel; public-overlay-url.js weist unbekannte Einstiege vorher zurück. Danach wurde die Prüfung freigegeben und durchgeführt. Kein verbleibender Freigabeblocker für diesen Befund.
- User-profile-UI-Zugang zusätzlich gerendert geprüft: Viewer XP > Live-Vorschau > Benutzerprofil. Dort nur OBS-URL kopieren und Kopieren, kein Studio-Angebot. Lokale Vorschau rendert den Inhalt (mit LTTH-LIVE-005).
- Spin-Wheel-Konfigurationsseite tatsächlich gerendert: vorhandene Einstellungen/Werte und leere Historie sichtbar, aber dort kein Overlay-URL-Angebot. Keine Wette oder Spin ausgelöst, keine Konfiguration gespeichert.
- UI-Zugänge von event-ticker, spin-wheel als separater Browserquelle und /leaderboard/overlay noch genauer zuzuordnen; fehlende Registry ist bestätigt, Vollständigkeit aller dynamischen UI-Zugänge wird noch nicht behauptet.

## LTTH-LIVE-006 – Backup-Import von Plugin-Einstellungen scheitert mit db.transaction (P1)

- Betroffen: A12 / P7 Config Backup & Restore, POST /api/config-backup/import, generischer Plugin-Settings-Import.
- Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; bestehende parallele Änderungen erhalten, keine Produktkorrektur.
- Umgebung: 2026-10-05 ca. 06:19 Europe/Vienna, Windows, portable Node 22.14.0, aktive App Port 3000, Profil test.
- Vorbereitung: config-import temporär über gerenderte Pluginverwaltung aktiviert (ursprünglich false). SQLite-Online-Wiederherstellungspunkt %TEMP%/ltth-audit-20261005-before-import.db vor dem ersten Import. Guard verifizierte Profil test und keine bestehenden CoinBattle-Einstellungsschlüssel.
- Reproduktion:
  1. Kleines synthetisches ZIP im dokumentierten Format mit gültigem manifest.json und plugins/coinbattle/settings.json vorbereiten. Letzteres enthält ausschließlich audit_backup_20261005=baseline-A, keinen echten Konfigurationswert.
  2. Preview-Import mit pluginFilter=[coinbattle] durchführen: HTTP 200, settingsNew=1, settingsConflicts=0.
  3. Dasselbe ZIP per multipart an /api/config-backup/import senden. mode=merge, includePluginSettings=true; Globals, Plugin-Dateien, user_configs, Uploads und user_data=false; pluginFilter=[coinbattle].
  4. Fehlerrückgabe und Existenz des ausschließlich eigenen Audit-Schlüssels prüfen.
- Erwartet: Der eine neue Plugin-Einstellungswert wird im Testprofil importiert und ein erfolgreicher Bericht zurückgegeben.
- Tatsächlich: HTTP 500, success=false, error=db.transaction is not a function. Erneute Reproduktion mit demselben einzelnen Testwert: identischer HTTP500/Fehler. Audit-Datensatz danach count=0, keine bestehende Einstellung überschrieben.
- Bereinigter Log-Beleg: logs/app-2026-10-05.log:11582, 06:19:32, [Plugin:config-import] Import error: db.transaction is not a function.
- Quellbeleg: backup-manager reicht this.db an den Importer weiter. backup/plugin-discovery.js restorePluginSettings ruft db.transaction auf; app/modules/database.js stellt prepare bereit, aber keine transaction-Methode. Vermutete Ursache: Wrapper statt erwarteter better-sqlite3-Schnittstelle; kein Produktpatch vorgenommen.
- Testquelle: tatsächliche lokale API gegen laufende App, synthetisches minimales Backup; kein echter Live-Event-Test. Der Fehler wird nicht als erfolgreicher Restore bezeichnet.
- Reproduzierbarkeit: 2/2 minimale Importversuche. Auswirkung: Plugin-Einstellungswiederherstellung über diesen generischen Pfad blockiert. Custom-Provider und andere Importbereiche dadurch nicht pauschal bewertet.
- Zustand: kein Audit-Schlüssel angelegt; keine Datenrücksetzung nötig. Wiederherstellungspunkt und leeres Export-ZIP außerhalb Git bleiben erhalten. config-import-Rücksetzung im Anschluss vorgesehen.

### A12 / P7 aktualisierte Teilmatrix

| Funktion | Status | Beleg / Grenze |
|---|---|---|
| Temporäre Aktivierung und gerenderte Backup-UI | bestanden | Store-Card aktiv; Sidebar öffnet /config-import/ui |
| Eingeschränkter Export | bestanden | POST export HTTP200, ZIP 672 Bytes; Globals/Dateien/andere Profile ausgeschlossen |
| Archivinhalt | bestanden | leeres Manifest/checksums-ZIP korrekt inventarisiert; keine zuvor gespeicherten CoinBattle-Einstellungen vorhanden |
| ZIP-Validierung | bestanden | HTTP200 success=true |
| Vorschau neuer Einstellung | bestanden | synthetisches minimales ZIP: settingsNew=1 |
| Plugin-Einstellungsimport | Bug bestätigt | LTTH-LIVE-006, 2/2 HTTP500 |
| Konfliktvorschau und Wiederherstellung eines geänderten Werts | blockiert | neue Einstellung kann wegen LTTH-LIVE-006 nicht importiert werden; geplante Folgeschritte wurden nicht ausgeführt |
| Vollimport von Plugin-Dateien/user_configs/Uploads | blockiert | gemeinsame Dateispeicher und andere Profile dürfen nicht verändert werden; nur begrenzter Settings-Test ausgeführt |
| Legacy-Migration | nicht beobachtet | UI vorhanden, keine freigegebene separate Legacy-Installation importiert |

## A2/A3/A4 – Reconnect und echte Felder 05.10.

- Gerendertes Dashboard vor Reconnect: verbunden @wahanfx, ca. 684 Zuschauer, 64.025 Likes, 4 Coins/4 Gifts. Diese kumulativen Zähler beweisen keine einzeln geprüfte Gift-Serie.
- Trennen tatsächlich geklickt: Header getrennt, Verbinden aktiv, Trennen deaktiviert, Laufzeit --:--:--. Bestehende Zähler bleiben sichtbar. Danach denselben Alias wahanfx im Testprofil erneut verbunden, Backup-Key-Hinweis normal bestätigt; kein Profilwechsel und kein App-Neustart.
- Gerenderte Rückmeldung danach: Verbunden @wahanfx, test, Zuschauer 701. Die Laufzeit folgt der vorhandenen Streamdauer (ca. 15 Minuten), kein neuer Stream behauptet.
- 45-Sekunden-Fenster über Trennen/Reconnect: 14 join, 5 chat. Feldnamen in tiktok:event.data: username/nickname/userId/profilePictureUrl/teamMemberLevel/isModerator/isSubscriber/timestamp; join zusätzlich uniqueId, chat zusätzlich message. Keine Message-ID im normalisierten Ereignis vorhanden: eine ID-basierte Duplikatprüfung konnte deshalb nicht ausgewertet werden.
- Zweites 45-Sekunden-Fenster nach Reconnect: 6 chat, 21 join. Normalisierte Flags: teamMemberLevel=0 20-mal, =1 einmal, =17 viermal, =26 zweimal; isModerator=true zweimal, false 25-mal; isSubscriber=false 27-mal. Keine identischen vollständigen Payloads (0); kein Beweis für vollständige Listenerbereinigung über alle Eventtypen.
- Diese Felder sind tatsächlich am lokalen Eventbus empfangen und bereits vom aktiven Adapter normalisiert. Die ursprünglichen WebSocket-Rohpakete vor Normalisierung wurden nicht aufgezeichnet; SDK-Rohfeldnamen dürfen nicht als tatsächlich empfangen ausgegeben werden.
- Echte bezahlte Super-Fan-/Subscriber-Ereignisse weiterhin nicht beobachtet. Positive teamMemberLevel-Werte sind kein eindeutiger Nachweis bezahlter Super Fans. Kein ordinary viewer mit isSubscriber=true in diesem Fenster. Badge-Darstellung und bezahlte Reaktionen bleiben offen.
- Quellabgleich: EulerstreamAdapter _extractTeamMemberLevel liest explicit levels, fansClub/fansClubInfo und Fanbadges; Moderator-Fallback >=10, Subscriber-Fallback >=1. extractUserData gibt teamMemberLevel, isModerator und isSubscriber aus. EmojiRain hat unterschiedliche Kriterien: Sticker nutzt teamMemberLevel>=1; checkSuperFanLevel nutzt explizite Flags/Badges. Mögliche semantische Inkonsistenz ist Kandidat, kein live bestätigter Fehler.
- Gezielte vorhandene Tests mit portablem Node22: eulerstream-team-level-extraction und eulerstream-connection-state, 2 Suites / 23 Tests bestanden. Synthetische/mocked Quelltests, kein Ersatz für seltene echte Ereignisse oder echte automatische Reconnects.

| Funktion | Status | Grenze |
|---|---|---|
| A2 manuelles Trennen/erneut Verbinden | bestanden | gerenderte Statuswechsel, erneuter Empfang, Profil bleibt test |
| A2 automatische Wiederverbindung | nicht beobachtet | Mocktests bestanden, kein echter Transportabbruch provoziert |
| A2 doppelte Payloads nach Reconnect | bestanden | nur begrenztes Fenster, 27 Events, 0 identische Payloads; vollständige Listeneranalyse noch offen |
| A3 Chat/Join nach Reconnect | bestanden | 6/21 tatsächliche Eventbusereignisse |
| A3 normalisierte Fan-/Moderator-/Subscriber-Felder | bestanden | Feldnamen und Skalare tatsächlich empfangen; ursprüngliche Rohpakete nicht aufgezeichnet |
| A3 echte bezahlte Super-Fan-Erkennung | nicht beobachtet | 27-mal isSubscriber=false; Teamlevel allein unzureichend |
| A3 Giftserien/Abos/Shares in diesem Fenster | nicht beobachtet | keine betreffenden Ereignisse erfasst |
| A4 Verbindungs- und Laufzeitanzeigen | bestanden | getrennt --:--:--; nach Reconnect tatsächliche Streamdauer |

## A11 – DE/EN-Teilprüfung und Browsergrenze

- DE-Dashboard vor Wechsel gerendert; EN im Topbar-Selektor gewählt. Der bestehende Tab behielt zunächst DE-Beschriftungen und wurde für CDP-Steuerung nicht mehr erreichbar (Timeout bei FocusEmulation, Snapshot und Diagnose). Nach erneutem Anbinden ebenfalls Timeout.
- Frischer Dashboard-Tab mit derselben Browser-Origin zeigte EN korrekt: CORE FUNCTIONS, TikTok Live Connection, Connected, Disconnect, Live Statistics. Damit Browser-Persistenz der EN-Auswahl bestätigt.
- Dort DE gewählt; anschließend erneute CDP-Timeouts. Ein weiterer frischer Tab zeigte DE korrekt, Header Verbunden @wahanfx, Profil test. Ausgangs-DE damit wiederhergestellt. Keine App-Neustarts und kein Backend-Sprachwert verändert: GET /api/i18n/current blieb en (Profil hatte keinen language-Schlüssel, Backenddefault).
- Live-Sprachwechsel ohne Neuladen vorerst als Browser-/UI-Kandidat führen; ein CDP-Timeout allein beweist keinen Produktfreeze. Direkte Native-Browserprüfung oder zuverlässig reagierender Browser für denselben Wechsel noch offen. Keine Produktbug-ID dafür vergeben.
- Der Client speichert app_locale in localStorage; die Topbar-Auswahl benutzt loadTranslations/changeLanguage und schreibt nicht dieselbe Sprache in den Profil-DB-Wert der separaten /api/i18n/current-Route. Profileinstellungen und browserspezifische Sprachpersistenz müssen getrennt bewertet werden.

## LTTH-LIVE-007 – EmojiRain-Layer-URLs werden vom Studio-Tunnel abgelehnt (P2)

- Betroffen: A8 / P8 EmojiRain, OBS-HUD-Einstellungen, vier beworbene einzelne/kombinierte Layer.
- Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; kein Produktcode geändert, parallele Änderungen erhalten.
- Umgebung: 2026-10-05 ca. 06:29 Europe/Vienna, Profil test, Port 3000, Windows, Codex-Browser.
- Reproduktion:
  1. Gerenderte /emoji-rain/ui öffnen, Abschnitt OBS-HUD-Einstellungen ansehen.
  2. Die Studio-Kopierangebote für Emoji + Geschenke, Nur Emojiregen, Nur Herzballons und Nur Geschenkeregen prüfen.
  3. Angezeigte lokale Layer-URL aufrufen und an /api/network/overlay-tunnel/ensure übergeben.
- Erwartet: Jede beworbene Layer-URL kann genauso wie das vollständige HUD als öffentliche Studio-URL erstellt werden.
- Tatsächlich: /emoji-rain/obs-hud/emojiregen-geschenkeregen, /emojiregen, /herzballons und /geschenkeregen sind lokal HTTP200, aber Tunnel-Endpunkt jeweils HTTP400 / OVERLAY_URL_NOT_REGISTERED.
- UI enthält für alle vier einen tatsächlichen data-copy-tiktok-studio-url-Button; data-overlay-url-source referenziert #emoji-rain-url-combined/-emojis/-hearts/-gifts. Die UI-Aktion für combined wurde geklickt; keine eindeutige Fehlermeldung in der anschließend erfassten Ansicht sichtbar. Die sichere bestätigte Reproduktion ist der konkrete Request, keine erfolgreiche Clipboard-Kopie behauptet.
- Quellbeleg: getObsHudRoutePaths registriert diese Pfade plus englische Aliase. Die öffentliche ENTRYPOINTS-Registry enthält ausschließlich /emoji-rain/obs-hud, isRegisteredEntrypoint prüft exakt (keine Unterpfadfreigabe). Daher Ablehnung vor dem Tunnelstart.
- Testquelle: gerenderte UI, tatsächliche lokale GETs und Tunnel-Requests; keine synthetischen Events. Nutzerfreigabe öffentlicher Overlaytests liegt vor; diese Requests starten wegen der vorherigen Validierungsablehnung keinen Tunnel.
- Reproduzierbarkeit: 4/4 beworbene Layer-URLs. Auswirkung: separate Effektlayer können nicht über die angebotenen Studio-Kopieraktionen verwendet werden.
- Keine Testkonfiguration gespeichert und kein App-Neustart ausgelöst. WebGPU EmojiRain enthält ähnliche Quellrouten; deren tatsächliche UI-/Runtime-Abnahme steht noch aus, nicht pauschal als gleicher bestätigter Bug gezählt.

## LTTH-LIVE-008 – Öffentlicher Visual-FX-Frame erhält keine Trigger oder Konfigurationsupdates (P1)

- Betroffen: A8 / P10 Visual FX Frame, öffentliche /flame-overlay/overlay-Quelle und öffentliche Socketfilterung.
- Commit: e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; keine Produktänderung, parallele Änderungen erhalten.
- Umgebung: 2026-10-05 ca. 06:33–06:37 Europe/Vienna, Windows, portable Node22, Profil test, Port3000. Temporärer Tunnel necklace-defense-mills-scheduling.trycloudflare.com; Nutzerfreigabe öffentlicher Overlaytests liegt vor.
- Voraussetzung: flame-overlay aktiviert; lokale und öffentliche Browserquelle geöffnet. Öffentliche Seite rendert initialen Rahmen; effects-engine.js und i18n-client.js öffentlich HTTP200. Beide Vergleichssockets connected=true.
- Reproduktion:
  1. /api/network/overlay-tunnel/ensure für http://127.0.0.1:3000/flame-overlay/overlay aufrufen und zurückgegebene öffentliche Browserquelle öffnen.
  2. Auf lokalem und öffentlichem Socket die Events flame-overlay:config-update, flame-overlay:trigger und flame-overlay:clear-triggers zählen.
  3. Lokal gültige Konfiguration effectType=particles speichern, vorgesehenen Featuretest gift-big auslösen und clear-triggers aufrufen.
  4. Vier Sekunden Empfang vergleichen.
- Erwartet: Öffentliche Quelle erhält die freigegebenen FX-Updates und reagiert wie die lokale Quelle, ohne öffentliche Verwaltungsschreibrechte.
- Tatsächlich: alle drei API-Requests HTTP200. Lokaler Socket empfängt jeweils 1 config-update, 1 trigger, 1 clear-triggers. Öffentlicher Socket bei connected=true jeweils 0. Öffentliche Grundanimation läuft, reagiert aber nicht auf diese lokalen Updates.
- Quellbeleg: effects-engine.js registriert Listener für die drei flame-overlay:-Events. OUTGOING_SOCKET_EVENTS in public-overlay-registry.js enthält keinen dieser Namen. WebGPU-Pendant visual-fx-frame-webgpu:config-update ist getrennt vorhanden; das ersetzt die klassischen Events nicht.
- Testquelle: tatsächlicher öffentlicher Tunnel und Sockettransport, lokaler synthetischer Großgift-Featuretest und reale Konfigurationsänderung im Testprofil. Keine echte Giftreaktion behauptet.
- Reproduzierbarkeit: direkter Vergleich von drei Eventtypen, beide Sockets verbunden. Auswirkung: Studio-Overlay zeigt initiale Konfiguration, aber Live-Regeln/Testeffekte/Änderungen und Bereinigung erreichen es nicht.
- Testzustand gesichert: vorher keine flame-overlay-Settings; Sicherung %TEMP%/ltth-audit-20261005-flame-before.json. Eigenes AUDIT-20261005-Preset und Settings werden nach Abschluss zurückgesetzt. Keine OBS-Prüfung.

## LTTH-LIVE-009 – Öffentliche Visual-FX-Quelle kann Übersetzungen nicht laden (P3)

- Betroffen: A8/P10, i18n-Bootstrap der öffentlichen /flame-overlay/overlay-Seite.
- Commit/Umgebung: wie LTTH-LIVE-008, 05.10. ca. 06:33, test, tatsächlicher Cloudflare-Tunnel.
- Reproduktion:
  1. Dieselbe öffentliche Visual-FX-Overlay-URL in einem frischen Browser-Tab öffnen.
  2. Browserkonsole und GET /api/i18n/translations/de prüfen; lokalen Endpunkt zum Vergleich aufrufen.
- Erwartet: Von der öffentlichen Quelle benötigte Übersetzungen werden geladen.
- Tatsächlich: i18n-client.js öffentlich HTTP200; Übersetzungen lokal HTTP200, öffentlich HTTP404. Browser meldet Failed to load translations for de im I18nClient.init. Die rein grafische Grundanimation rendert trotzdem; kein Totalausfall oder unübersetzter sichtbarer Profiltext behauptet.
- Quellbeleg: renderer/index.html lädt /js/i18n-client.js und hat ein übersetzbares title-Element. Öffentliche HTTP-Whitelist erlaubt den Client, aber nicht den angeforderten allgemeinen Übersetzungsendpunkt.
- Testquelle: tatsächliche öffentliche Browserdarstellung, bereinigte Browserfehler und HTTP-GET-Vergleich. Keine synthetischen Benutzerdaten.
- Auswirkung: i18n-Bootstrap fehlerhaft und Übersetzung des Titels nicht zuverlässig; zusätzliche Consolefehler. Sicherheitsfilter nicht erweitert und kein Produktpatch vorgenommen.

## P10 Visual FX Frame – ausgeführte Teilmatrix und Rücksetzung

| Funktion | Status | Beleg / genaue Grenze |
|---|---|---|
| Aktivieren/Deaktivieren im Testprofil | bestanden | API200/success, aktuelle Konfiguration erreichbar; keine App-Neustarts |
| Gerenderte Steuerzentrale | bestanden | /flame-overlay/ui mit Aussehen/Rahmen/Bewegung/Post-FX/Auslöser, Quality-Modi, Presets und Studio-Button geöffnet |
| UI-Vorschau-Schaltfläche | nicht beobachtet | Klick lieferte keinen eindeutig geänderten Zustand; direkte Browserquelle anschließend separat geprüft, nicht als erfolgreicher UI-Vorschauablauf gewertet |
| Lokales Grundrendering | bestanden | tatsächlicher Browser-Screenshot zeigt animierten Rahmen; keine Rendererwarnung/-fehler im lokalen Konsolenfenster |
| Lokale acht Featuretests / Regelaktionen | bestanden | HTTP200 accepted=true; Socket flash, intensity-boost, dramatic, pulse, intensity-boost, effect-switch, color-flash, color-change für acht angeforderte Testtypen |
| Lokale sichtbare Großgift-Testreaktion | bestanden | nach synthetischem gift-big sichtbare Änderung der Grafik im Screenshot; keine echte Giftreaktion daraus ableiten |
| Konfigurationsvalidierung | bestanden | qualityMode=invalid-audit und effectType=waves HTTP400; gültiges particles gespeichert |
| Preset speichern/laden | bestanden | eigenes AUDIT-20261005 gespeichert; particles per API gespeichert, Presetload stellt flames wieder her; tatsächliche Werte geprüft |
| Backend-Triggerbereinigung | bestanden | Socketstatus 1..8, dann 0 nach clear-triggers |
| Cooldown-/Renderer-Regressionsprüfungen | bestanden | vier bestehende Suites / 65 Tests grün, darunter Plugin und Renderer/WebGL-State; ausschließlich Mock-/Quelltests, kein echter Lastbenchmark |
| Echte Live-Regelreaktion | nicht beobachtet | eigenes 45-Sekunden-Fenster: 25 join, 2 chat, keine Gifts oder FX-Trigger; kein öffentlicher Chat gesendet |
| Öffentliche Grunddarstellung/Assets | bestanden | tatsächliche Browserquelle rendert; effects-engine.js und i18n-client.js HTTP200 |
| Öffentliche Event-/Konfigurationsaktualisierung | Bug bestätigt | LTTH-LIVE-008, drei lokal empfangene Updates öffentlich jeweils0 bei verbundenen Sockets |
| Öffentliche benötigte Übersetzungen | Bug bestätigt | LTTH-LIVE-009, lokal200/öffentlich404 plus echter Konsolenfehler |
| Öffentliche Verwaltungssperre | bestanden | /dashboard.html weiterhin404 |
| Vollständige Effekt-/Layer- und Qualitätsabnahme | nicht beobachtet | einzelne sichtbare Zustände, nicht jeder Effekt/Layer/Qualitätsmodus einzeln abgenommen; bleibt offen |
| Rücksetzung | bestanden | ursprüngliches Plugin false, ursprüngliche Settingsanzahl0 wiederhergestellt; beide selbst erzeugten Settings-/Presetzeilen entfernt, remaining0 |
| Eigener Tunnel stoppen | bestanden | POST overlay-tunnel/stop HTTP200 success=true; temporäre FX-Browsertabs geschlossen |

- Sicherung bleibt außerhalb Git: %TEMP%/ltth-audit-20261005-flame-before.json, rowCount0.
- Keine gemeinsamen Plugin-Dateien verändert, keine anderen Profile geändert, Talking Heads nicht aktiviert/deaktiviert oder getestet.
- Der erste Presetversuch mit dem ungültigen Effekt waves wurde abgewiesen. Eine durch wiederverwendete PowerShell-Variable ausgegebene saved=true-Zeile war kein gültiger Speicherbeleg; ausschließlich der anschließende Stop-on-error-Durchlauf particles -> flames zählt als Presetnachweis.

### P15 Zwischenstand 05.10.2026 – Ollama-Textgenerierung
- Testprofil per `/api/profiles/active` bestätigt: test, Port 3000, kein Neustart erforderlich. Online-Sicherung vor Aktivierung: `%TEMP%\ltth-audit-20261005-before-story.db`; Originalwerte der ausschließlich betroffenen Einstellungen separat lokal gesichert, keine Secrets im Bericht.
- Interactive Story aktiviert (HTTP 200, keine gegenseitig ausgeschlossenen Plugins deaktiviert). Initiale Konfiguration: Ollama, `https://api.ollama.com/v1`, `qwen3.5:cloud`, Schlüssel nicht konfiguriert.
- Ausdrücklich freigegebenen STT-Ollama-Schlüssel ausschließlich aus benötigtem `pupcid`-Konfigurationsdatensatz gelesen; pupcid unverändert. Temporär im Profil test verwendet. Modell aus STT: `nemotron-3-nano:30b`. Manueller Modus, Text-only, automatische Bilder und beide TTS-Schalter aus, Debug/API-Logging aus, 45 s Timeout / ein Versuch.
- Lokales harmloses Story-Thema an `/api/interactive-story/start`: HTTP 500 nach 864 ms, bereinigte Antwort `405 Method Not Allowed`. Status: **blockiert**, Endpunkt-/Providerursache noch zu verifizieren; noch kein eigenständiger bestätigter Produktbug. Keine erfolgreich erzeugte Story, kein Voting-/Audio-/Bildnachweis.
- Plugin wieder deaktiviert (HTTP 200); ursprüngliche Einstellungen vollständig gezielt wiederhergestellt, ursprüngliche Story-Settings 0 / nach Wiederherstellung 0. Story-Sitzungen nach Versuch 0. Temporärer Ollama-Schlüssel wieder entfernt. Neue leere Story-Tabellen verbleiben als reguläre Initialisierung im Testprofil; keine vorhandenen Nutzerdaten gelöscht. Wiederherstellungspunkt bleibt lokal erhalten.

## LTTH-LIVE-010 – Interactive Story: voreingestellter Ollama-Cloud-Endpunkt liefert HTTP405 (P2)
- Feature: P15 Ollama-Textgenerierung. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Windows/portable Node22, Profil test, 05.10.2026. Vorhandene parallele Talking-Heads-/TTS-Änderungen erhalten; keine Produktänderungen.
- Voraussetzungen: gesichertes Testprofil, Interactive Story aktiviert, ausdrücklich freigegebener gültiger STT-Ollama-Schlüssel temporär zentral hinterlegt. Modell nemotron-3-nano:30b wie STT, manuell/Text-only, kein Bild/Audio, Debug/API-Logging aus.
- Reproduktion: 1. Voreinstellung ollamaBaseUrl=https://api.ollama.com/v1 belassen. 2. POST config mit obigen Schaltern. 3. POST /api/interactive-story/start mit harmlosem lokalem Thema und vorgegebener Outline.
- Erwartet: Voreinstellung adressiert die dokumentierte Cloud-API und erlaubt eine gültige Generierungsanfrage. Tatsächlich: HTTP500 nach864ms, error=405 Method Not Allowed. Keine Sitzung angelegt.
- Quelle: lokale API-Benutzeraktion mit echtem externem Ollama-Aufruf; kein TikTok-Live-Ereignis. Offizielle Ollama-Dokumentation nennt https://ollama.com/v1 für OpenAI-Kompatibilität: https://github.com/ollama/ollama/blob/main/docs/api/introduction.mdx . STT verwendet https://ollama.com/api/chat. Mit ausschließlich geändertem BaseURL=https://ollama.com/v1 kein sofortiges405; Anfrage läuft anschließend länger, Erfolg noch nicht belegt.
- Reproduzierbarkeit: ein tatsächlicher Voreinstellungsversuch, unterstützende aktuelle Konfigurations-/Quell- und Dokumentationsevidenz. Hypothese: veralteter/falscher voreingestellter Host. Kein allgemeiner Schlüssel-/Modelldefekt bewiesen.

## LTTH-LIVE-011 – Interactive Story ignoriert konfigurierten LLM-Timeout (P2)
- Umgebung/Commit/Profile wie010, 05.10.2026. Lokale Testaktion, echter Provideraufruf mit https://ollama.com/v1; llmTimeout=45000, llmMaxRetries=1, manuell/Text-only ohne Bild/TTS.
- Reproduktion: 1. Genannte Konfiguration speichern HTTP200. 2. Story starten. 3. Nach mehr als45s Status und ausstehenden HTTP-Aufruf prüfen.
- Erwartet: fehlende Providerantwort wird gemäß45s-Timeout begrenzt und als Fehler beendet. Tatsächlich: um04:44:23Z noch isGenerating=true / session=null; Startskript um04:42:17Z erstellt, mehr als120s vergangen, Clientrequest weiterhin ausstehend. Script-Prozesshandle15356 weiterhin lebend. Modellgenerierung noch nicht erfolgreich.
- Beleg/Ursachenevidenz: OpenAILLMService speichert options.timeout in this.timeout, aber übergibt weder timeout an new OpenAI noch Requestoptionen an chat.completions.create. SDK-interne Wiederholungen ebenfalls nicht mit llmMaxRetries gekoppelt; ihre tatsächliche Zahl hier nicht belegt.
- Regulärer Abbruch POST /api/interactive-story/end HTTP200 setzt isGenerating=false/chapter=null/session=null; ursprünglicher Startrequest bleibt ausstehend. Transportabbruch und Schutz vor späten Resultaten noch offen, nicht als bestanden gewertet. Kein Neustart ausgelöst.
- Temporärer zentraler Schlüssel aus persistenten Settings bereits wiederhergestellt; aktiver Service hält nur den für den laufenden Versuch erforderlichen In-Memory-Zustand. Story-Settings/Plugin müssen nach terminalem Request noch vollständig rückgesetzt werden; Wiederherstellungspunkt vorhanden.
- Ergänzende Provider-/Voting-Regression: zwei vorhandene Suites, 26 Tests bestanden (Mocks; kein Ersatz für externe Generierung).

### P15 Fortsetzung 05.10.2026 – terminaler Request und zusätzliche Teilmatrix
- Der bereits gestartete Request mit https://ollama.com/v1 ist terminal: HTTP500 nach240824ms, bereinigte Antwort `Failed to generate coherent chapter after 3 attempts`. Keine Sitzung/kein Kapitel erzeugt. Regulärer Abbruch wurde während des laufenden Requests zuvor angenommen; eine Transportbeendigung erfolgt dadurch nicht. Keine späten sichtbaren Story-/Votingdaten beobachtet. Ob die Ursache Modellinhalt, leere Antwort, Parsing oder andere Providerantwort ist, bleibt ohne vertrauliche Logauswertung unbestimmt; nicht pauschal als Ollama-Ausfall werten.
- Tatsächliche gerenderte UI: Ollama gewählt, BaseURL/Modell korrekt angezeigt, Story-Studio, Themen, klassische/DnD-Auswahl, TTS-Engine-/Stimmenauswahl, Bilder, Votingmuster, Overlay-Ausrichtung/Auflösung/Layout und Timing vorhanden. Lokale Overlayquelle geöffnet; ohne Kapitel leer, daher keine Inhaltsrender-Abnahme. Studio-URL-Kopieren wird für /interactive-story/overlay angeboten. Vorschau-Klick erzeugte keine eindeutig geöffnete Vorschau; UI-Interaktion noch nicht als bestanden gewertet.
- Sprachbefund vorläufig: DE-UI enthält sichtbar `API-Schl?ssel`, `standardm??ig`, `Erz?hlstimmung`, `Layout zur?cksetzen` und englische Themenbeschreibungen; vollständiger DE/EN-Vergleich noch offen. Statusbeschreibung zeigt OpenAI/DALL-E/System TTS trotz gewähltem Ollama; noch gezielt zu reproduzieren.
- Fehlerfälle bestanden (lokale tatsächliche API-Aufrufe): participants ohne DnD400, participants/join ohne aktive Sitzung400, next-chapter400, final-chapter400, overlay-positions mit ungültigen normierten Koordinaten400. Fehlende session/999999999 liefert200; Antwortsemantik noch zu prüfen, deshalb kein Fehlerfall-Pass dafür.
- Weitere neun bestehende Suites /55 Tests grün: Teilnehmerregistry/-DB, StoryMemory, Schlussnarration, Narrationspersistenz, Overlaylayout, NarrationDirector, Modellauswahl, optionale Bilder. Zusammen mit bisherigen zwei Suites 81 Tests; ausschließlich Mock-/Datenbank-/Quelltests, kein realer Voting-, Bild- oder Hörnachweis.
- Nach terminalem Request Plugin deaktiviert200; gezielte Originaleinstellungen wiederhergestellt, StorySettings0 und StorySessions0. Schlüssel nicht mehr persistent vorhanden. Profil test unverändert aktiv; kein Neustart, kein Eingriff in parallele Talking Heads.
- Weiter offen: echte Story-Erstellung/Voting/Fortschritt/Schluss, Bild-/Audioanbieter und hörbare Stimmen, DnD-Runden, öffentliche Story-Overlayupdates und Layoutpersistenz. Externe Generierung ist derzeit fehlgeschlagen, nicht bestanden; Mocktests ändern diesen Status nicht.

### P14 Einstieg 05.10.2026 – gerenderte UI, noch ohne Testdaten
- Aktives Goals-Plugin geöffnet über /goals/ui: gerenderte Anzeige verbunden, Testprofil ohne vorhandene Ziele. UI bietet Einzelziele und Mehrfachziele.
- Neues-Ziel-Schaltfläche über AX und anschließend semantischen Playwright-Klick geprüft: kein sichtbarer Dialog; DOM goal-modal bleibt class=modal / display=none. Keine Goals-Testdaten erzeugt. Ursache noch offen (Browserinteraktion/Frontend-Lifecycle), daher noch kein bestätigter Produktbug.
- Scripts im DOM lokal geladen, keine eindeutigen JS-Errors im abgefragten Fenster; mehrere i18n-not-initialized-Warnungen. Gemischte DE/EN-Texte sichtbar. Nächste Schritte: Dialog-/Listenerproblem eingrenzen, dann abgesicherte eigene Ziele und öffentliche Einzel-/Mehrfachquelle testen.

## P14 Live Goals – Teilmatrix 05.10.2026
- Profil test/Port3000 geprüft; vor Änderungen Online-Sicherung `%TEMP%\ltth-audit-20261005-before-goals.db`. Ursprünglich goals0/multigoals0. Vier eigene feste IDs `goal_AUDIT20261005_coin|likes|follower|custom`, keine Nutzerziele geändert; Likes startet automatisch mit tatsächlichem Streamtotal64203. Eigene Mehrfachquelle multigoal_AUDIT20261005 mit custom/coin, Rotation3s. Fireworks aus, Reset-on-stream-end aus.

| Funktion | Status | Beleg/Grenze |
|---|---|---|
| UI-Grunddarstellung und vier Zielkarten | bestanden | tatsächliches /goals/ui, verbunden, Socketkarten nach API-Erstellung automatisch aktualisiert |
| Neues-Ziel-Dialog über UI | nicht beobachtet | AX-Klick, semantischer Klick und Enter erzeugen keinen Dialog; echter click-Listener per DOMDebugger vorhanden, keine JS-Errors; Ursache offen |
| Zieltypen coin/likes/follower/custom erstellen | bestanden | vier HTTP200, DB/API-Karten stimmen; tatsächliches Likes-Total initialisiert |
| Eigener Custom-Fortschritt/Zielstand | bestanden | lokale API+3,+7 ergibt10/10; direktes Browseroverlay zeigt100%/Goal Reached; keine echte Livewertung daraus ableiten |
| Reset und sichtbare Aktualisierung | bestanden | POST reset200, Backend0/10, offenes lokales Overlay wechselt0%/10remaining |
| Studio-Angebot Einzelziele | bestanden | auf jeder tatsächlich gerenderten Karte Copy-Studio-Button mit eigener vollständiger id-URL |
| Öffentliche Einzelquelle/Updates | bestanden | neuer Tunnel reused=false; öffentlicher Browser rendert0/10, danach lokale Mutation+4 erscheint sowohl lokal als auch öffentlich40%/4/10 |
| Mehrfachquelle / Tunnel wiederverwenden | bestanden | ensure für multigoal-overlay reused=true, identischer Tunnelhost, query id erhalten |
| Öffentliche Mehrfachdarstellung/Rotation | bestanden | tatsächlicher Browser zeigt eigene compact-bar-Quelle custom40%; anschließend coin0% als aktive DOM-Quelle opacity1, customopacity0 |
| Öffentliche Übersetzungen | Bug bestätigt | bestehender LTTH-LIVE-009 betrifft auch beide Goals-Overlays: echter Fehler Failed to load translations for de, englische Rest-/Abschlusstexte |
| Echte Eventreaktion Coins/Likes/Follower | nicht beobachtet |45s ab04:50:51Z: join23/chat1, keine passenden Events; Werte unverändert0/64203/0, kein öffentliches Chat/Gift erzeugt |
| Geschenkserien, Abschlussaktionen hide/reset/double/increment | nicht beobachtet | echtes Serienereignis fehlt; numerischer10/10-Beleg bestätigt noch nicht alle automatischen Abschlussaktionen |
| Persistenz nach Lifecycle/Profilneustart, sechs Templates, Last | nicht beobachtet | bleibt offen, kein pauschaler Pass |
| Vorhandene Streamreset-/i18n-Regressionsprüfungen | bestanden | zwei Suites13Tests grün; Mock-/Quelltests |
| Vorhandener UI-Modal-Test | blockiert | Jest kann jsdom-Abhängigkeit @exodus/bytes/encoding-lite.js nicht parsen: Unexpected token export. Testinfrafehler, kein Produktbug aus diesem Ergebnis |

- Cleanup über reguläre DELETE-Routen für ausschließlich eigene Testquelle/Ziele. Selbst gestarteter Tunnel danach gestoppt. Endzählungen aus folgendem Laufzeitbeleg ergänzen; Online-Sicherung bleibt außerhalbGit.
- Verifizierter Cleanup: sämtliche fünf DELETE-Aufrufe HTTP200, Tunnelstop HTTP200; remainingGoals0, remainingMultigoals0, remainingAuditHistory0. Goals-Plugin war vor/nach Tests bereits aktiviert; kein Lifecyclewechsel durchgeführt.

## LTTH-LIVE-012 – Schnorrbecher verwendet gemeinsame Profildaten und leert Sessionzustand bei Aktivierung (P1)
- Feature: A1 Profiltrennung/P23 Schnorrbecher. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026, Windows/portable Node22, Prüfprofil test. Parallele Talking-Heads-/TTS-Änderungen unangetastet; kein Produktpatch.
- Voraussetzungen: vorhandene Dateien `%LOCALAPPDATA%\ltth.app\plugins\schnorrbecher\data\coin-jar-config.json` und `coin-jar-state.json`. Aktuell persistenceMode=session; nur nichtvertraulichen Modus und Feldnamen gelesen, keine Namen/Viewerinhalte exportiert.
- Reproduktion: 1. Schnorrbecher-Datenpfad im vorhandenen ConfigPathManager.getPluginDataDir prüfen: getConfigDir()/plugins/<persistentId>/data, ohne Profil. 2. Konstruktor SchnorrbecherPlugin prüfen: CoinJarStore(api.getPluginDataDir()), beide Dateien laden. 3. CoinJarEngine-Konstruktor prüfen: bei session sofort store.clearState(). 4. Aktivierung in einem anderen Profil würde dieselben Dateien laden und state leeren. Letzter destruktiver Schritt wurde zum Schutz fremder Daten ausdrücklich nicht ausgeführt.
- Erwartet: Testprofil verwendet eigene Konfiguration/Zustandsdaten; Aktivierung berührt keine fremden Profilzustände. Tatsächlich: profilunabhängige existierende JSON-Dateien; Sessioninitialisierung schreibt Defaultzustand in die gemeinsame Datei. Konfigurationsspeicherung schreibt ebenfalls dieselbe gemeinsame Datei.
- Testquelle/Beleggrenze: aktuelle Quellprüfung, reale vorhandene Dateipfade und nichtvertraulicher Session-Schalter; kein tatsächlicher profilübergreifender Reset ausgelöst und keine echte Giftreaktion bestätigt. Deterministischer Datenpfad-/Initialisierungsbefund, kein nur hypothetischer externer Ausfall. Gleiches Grundproblem wie002, hier separate Plugin-Dateien und automatische Resetwirkung.
- Auswirkungen: risikofreies Aktivieren/Config-/Reset-/Gift-/Lasttesten ausschließlich in test ist mit diesem Speichervertrag nicht möglich; vorhandene gemeinsame Daten könnten überschrieben werden. P23-Livetests dadurch blockiert. Keine fremden Profile oder gemeinsame Dateien verändert, Plugin nicht aktiviert.

## P23 Schnorrbecher – belegte Teilmatrix 05.10.2026
| Funktion | Status | Beleg/Grenze |
|---|---|---|
| Profiltrennung Konfiguration/Zustand | Bug bestätigt |012; reale gemeinsame Dateien, profilloser Store, Sessionclear im Konstruktor |
| Aktivierung und echte Live-Giftreaktion | blockiert | Aktivierung würde gemeinsame Sessiondatei leeren; reine Testprofiländerungen nicht möglich |
| Giftzuordnung/Serien/Deduplizierung/Reset/Bereinigung | bestanden | vorhandene Engine-/Plugin-/Config-Suites; ausschließlich isolierte Mocks/temporäre Storeverzeichnisse, keine tatsächliche Live-Abnahme |
| Tatsächliche Geschenkeglas-/Physik-/Lastdarstellung | blockiert | benötigt sichere Aktivierung; keine lokale oder öffentliche Renderingbehauptung |
| Öffentliches Studio-UI-Angebot | nicht beobachtet | Quellcodebutton /overlay/coincup vorhanden, gerenderter aktivierter Ablauf noch nicht ausgeführt |
| Konfigurationsvalidierung und Storepersistenz | bestanden | vorhandener isolierter config-and-store-Test; keine reale Benutzerprofilpersistenz daraus ableiten |
| Vorhandene Quell-/Engineprüfungen | bestanden | vier Suites29Tests: config-and-store, coin-jar-engine, plugin-integration, overlay-markup |
| Vorhandene Browsercontroller-/Admin-UI-Suites | blockiert | Jest/jsdom @exodus/bytes/encoding-lite.js Unexpected token export, beide Suites laufen nicht; kein Produktbug aus Testinfrafehler ableiten |
| Rücksetzung | bestanden | keine Aktivierung/Settings-/Dateimutation in dieser P23-Prüfung; nichts zurückzusetzen |

## P22 Quiz Show – Profiltrennungsgrenze 05.10.2026
- Aktueller Code initDatabase nutzt ConfigPathManager.getPluginDataDir('quiz_show')/quiz_show.db. Reale gemeinsame DB180224Bytes mit shm/wal existiert. Fragen, Pakete, Kategorien, BrandKit, OpenAI-/TTS-Konfiguration, Leaderboardanzeige, Slots, Wizard/Layout liegen dort; nur Viewer-Leaderboard verwendet Hauptprofildatenbank.
- Initialisierung enthält Migrationen/Defaultinserts/Seeding sowie gemeinsame History-Bereinigung; Aktivierung/Fragenbearbeitung/Konfigurationsmutation wäre daher keine ausschließlich profilbezogene Teständerung. Kein Zugriff auf vertrauliche DB-Inhalte/Schlüssel, keine Aktivierung und keine gemeinsame DB verändert.
- Status Profiltrennung: **blockiert** für sichere Live-Aktivierung im hier autorisierten Umfang; Fragen-/Konfigurationstrennung fehlt nach aktuellem Speichervertrag. Erweiterung des gemeinsamen Speicherbefunds002/012; tatsächlicher Wechsel/Überschreiben in anderem Profil bewusst nicht ausgeführt. Gameplay/Antworten/Voting/Duell/Joker/Punkte/Rundenabschluss/öffentliche drei Overlays dadurch weiterhin blockiert, nicht bestanden.
- Fünf bestehende Suites25Tests grün: question-selection, state-management, robustness, public-render-mode, slot-machine-mode. Mock-/Quelltests, kein gerenderter oder echter Live-Abnahmenachweis.

## P35 Weather Control – Teilmatrix 05.10.2026
- Aktives Profil test/Port3000 ohne Restartbedarf; Onlinesicherung `%TEMP%\ltth-audit-20261005-before-weather.db` und gezielte ursprüngliche Pluginsettings separat lokal, rowCount0. Plugin initial deaktiviert, Aktivierung200success, disabledPlugins[]. Keine gemeinsamen Datendateien im geprüften Konfigurationspfad; settings profilbezogen.
- Effektinventar per tatsächlichem API200: rain,snow,storm,fog,thunder,sunbeam,glitchclouds,aurora,fireflies,meteors,sakura,embers,heatwave.
- Lokales Overlay /weather-control/overlay tatsächlicher Browser: Gamification-HUD mit Quest/Streak/Meter. Eigener lokaler Admin-Test rain intensity0.7/duration15000 akzeptiert200 und im Screenshot sichtbarer Regen, keine abgefragten Console-Errors/-Warnings. Keine echte TikTok-Giftreaktion daraus ableiten.
- Fehlerfälle **bestanden**: action=audit-invalid400/Supported-Liste, gültiger rain mit nicht berechtigtem synthetischem Testnamen403/Permission denied. Lokaler Adminregen ohne Vieweridentität über regulären Authvertrag; Rechtekonfiguration nicht abgeschaltet. Intern erzeugten Weather-Schlüssel nur im Arbeitsspeicher an lokale API geschickt, nie ausgegeben.
- HUD während kurzen Tests zeigt später Quest1/10/Meter1/100/Streak4. Mangels parallel korreliertem Liveeventtrace kein Nachweis bestimmter echter Quest-/Streak-/Belohnungsreaktion; Status **nicht beobachtet**.
- Offen: gerenderte Steuerzentrale/Settingspersistenz, weitere12Effekte/Presets, echte Gift-/Like-/Chat-Trigger, Questabschluss/Belohnungen, öffentliche URL/Assets/Eventupdates, Belastung und Cleanup-Lifecycle. Aktuelle Teilprüfungen decken das nicht ab.
- Rücksetzung **bestanden**: Plugin deaktiviert200, nur eigene Testsettings nach Snapshot gezielt rückgesetzt, remainingSettings0. Temporärer Weather-Schlüssel entfernt, keine Giftmappings geschrieben, kein Tunnel in dieser Prüfung erzeugt, kein App-Neustart.

## P34 Visual FX Frame WEBGPU – Teilmatrix 05.10.2026
- Profil test/Port3000 geprüft, Restartbedarf false. Vor Aktivierung Snapshot `%TEMP%\ltth-audit-20261005-before-fxgpu.db` und gezielte Pluginsettings, Original0. Aktivierung200success, keine anderen Plugins deaktiviert.
- **bestanden** lokales Grundrendering: tatsächlicher Browser /visual-fx-frame-webgpu/overlay zeigt animierten Rahmen, Canvas720x1280, keine abgefragten Fehler/Warnungen, lokale DE-Übersetzungen geladen. Engine nutzt navigator.gpu.requestAdapter/requestDevice; sichtbare Enginegrafik belegt erfolgreiche Browserinitialisierung in dieser Sitzung, keine Aussage über andere Hardware/OBS.
- **bestanden** lokale Feature-API: invalid-audit400; gift-big200 acceptedtrue/dynamic lightning10s und follow200 acceptedtrue/pulse1.5s. Beide synthetischen Testpayloads, keine echte Gift-/Followreaktion. Anschließend clear-triggers200success; sichtbare einzelne Triggerreaktion nicht separat abgenommen.
- **bestanden** vorhandene Regression: vier Suites41Tests renderer/backend/config/adaptive-quality grün; Mocks/Quelltests, kein echter Benchmark.
- **nicht beobachtet**, weiterhin offen: alle Effekte/Qualitätsmodi, Presets, echte Live-Trigger, gerenderte Einstellungsabläufe, öffentliche Quelle/Assets/Eventupdates, GPU-Fehlerpfad bei Nichtverfügbarkeit, Stabilität und Last. Kein pauschaler GPU-Plugin-Pass.
- **bestanden** Rücksetzung: Plugin deaktiviert200, gezielte Originalsettings zurückgesetztremaining0. Snapshot bleibt außerhalbGit, kein Tunnel/Neustart, keine gemeinsamen Plugin-Dateien oder parallele Änderungen verändert.

## P19 Music Bot – Aktivierungsgrenze und isolierte Teiltests 05.10.2026
- Datenhaltung geprüft: Konfiguration/Queuehistorie/Katalog/Playlists nutzen Profildatenbank, jedoch Mediencache `%LOCALAPPDATA%\ltth.app\plugins\music-bot\data\cache` gemeinsam, aktuell202Dateien. Keine Dateiinhalte/vertraulichen Backupkonfigurationen gelesen.
- init() ruft ensurePluginDataDir, cache/mediaCache.schedulePrune unmittelbar auf; prune entfernt abgelaufene/unpinned Dateien bzw.LRU bei Größenlimit. Eine Aktivierung kann damit gemeinsamen Cache verändern/löschen, unabhängig von Profil test. Zur Erhaltung fremder Daten Plugin nicht aktiviert, keine Cachedateien verändert. mpv/yt-dlp-Prüfpfade im init versuchen nur Versionabfragen, kein automatischer Installer dort; tatsächliche Verfügbarkeit in dieser Prüfung noch nicht bestätigt.
- Tatsächliche Wünsche/Suche/Queue/Skip/Playback/RechteUI/öffentliche Quelle im aktiven Plugin: **blockiert** durch gemeinsame Cachebereinigung im autorisierten reinen Testprofilumfang. Kein hörbarer Wiedergabenachweis, keine echte TikTok-Commandreaktion, keine öffentlichen Nachrichten oder Installationen.
- Vorhandene isolierte Queue-/Dauer-/Safety-Suites: **bestanden**, drei Suites sowie58Tests des ersten Gesamtlaufs grün. Command-Parser-Suite zunächst ein Sandbox-EPERM beim lokalen execFileSync(process.execPath), daher kein Produktbug daraus; gezielte Wiederholung außerhalb Sandbox läuft separat. Mock-/Quelltests sind keine Liveabnahme.
- Weitere Funktionen nach aktuellem UI-/Routeinventar zusätzlich offen: Katalogfeedback/Genres, Playlists/import jobs, ArtistRadio/AutoDJ, Safetylock/Testton, Suche/resolver, Seek/Volume/Pause, History/Replay/Reorder, Banverwaltung und NextSongVote. Vorhandener Mindestumfang wird dadurch nicht reduziert.
- Rücksetzung: keine Music-Bot-Aktivierung oder Konfigurations-/Dateimutation durch diese Prüfung; kein Wiederherstellungsbedarf.
- Command-Parser-Wiederholung mit passender Node22 außerhalb Sandbox: vier Tests bestanden; EPERM eindeutig Umgebungsblocker des ersten Laufs. Zusammen vier ausgewählte Suites59Tests bestanden, ohne echte Pluginaktivierung.

### P27 Stream Monsters – Beginn der Laufzeitprüfung 05.10.2026
- Aktives Testprofil/Port3000 ohne Neustartbedarf überprüft. Onlinesicherung `%TEMP%\ltth-audit-20261005-before-monsters.db` plus gezielte Originalsettings `%TEMP%\ltth-monsters-before.json` vor Aktivierung. Viewer-/Monsterpersistenz nutzt Profilhauptdatenbank. Gemeinsame Kenney-Assets nur bei tatsächlicher Komposition zu beachten; keine solche Testgenerierung bisher angefordert.
- Aktivierung HTTP200success, disabledPlugins[]. GET /api/streammonsters/state HTTP200success mit config/effectiveHatchDurationMs/eggCounts/eggStage/hype/heartChain/streamMission/visualPack/season/gcce/battle/recentEvents/eventCursor. Nur Feldnamen ausgegeben, keine vertraulichen Konfigurationen oder Viewerpayloads.
- Tatsächliche lokale Browserquelle /stream-monsters/overlay geöffnet: initial Portrait Arcade Rally / Lebende Eierablage; später Idlelogo im Screenshot, keine abgefragten Rendererwarnungen/-fehler. **bestanden** für Grundinitialisierung, kein Kampf-/Fortschritts-/GPU-Lastbeleg.
- Plugin bleibt vorläufig im Testprofil aktiv für unmittelbar folgende Runden-/Eventprüfung. Kein öffentlicher Chat/Gift, kein Tunnel oder Neustart, keine Accountänderung. Rücksetzung auf ursprünglichen deaktivierten Zustand und gezielte Originalsettings nach diesem fortlaufenden Abschnitt noch ausstehend. Nicht als abgeschlossen markieren.

## LTTH-LIVE-013 – Stream Monsters: benötigtes Präsentationsskript öffentlich blockiert, Overlay startet nicht (P1)
- A8/P27, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Windows/Node22/IAB, Profil test, 05.10.2026. Parallele TH-/TTS-Dateien erhalten, keine Produktänderungen.
- Voraussetzungen: Plugin aktiv, gültiger lokaler Overlayzustand und durch ensure erzeugter eigener Tunnel. Repro: 1. /stream-monsters/overlay lokal öffnen. 2. ensure mit derselben overlayURL, success/publicURL/reusedfalse. 3. öffentliche URL im echten Browser öffnen. 4. Konsole und erforderliche JS-Assets prüfen.
- Erwartet: öffentliche Quelle initialisiert dieselbe Präsentation und Echtzeitdaten wie lokal. Tatsächlich: statische Anfangskarte ohne Eier; TypeError Cannot read properties of undefined (reading presentationView) in streammonsters-overlay-runtime.js:1727, ferner createOverlayLocaleResolver undefined in overlay:2289. Lokales Overlay hat echte Eier, UI-Demo zeigt zwei Kämpfer/HP/Skillwahl.
- Bereinigte Belege: /plugins/stream-monsters/streammonsters-presentation.js lokal200/öffentlich404. Neun andere tatsächlich referenzierte Monster-Skripte lokal/öffentlich200. DOM-Skriptinventar und echte Consolefehler aus öffentlichem Browser. Zusätzlicher bekannter i18n404/009 ebenfalls vorhanden. Tunnelhost males-last-portrait-satin.trycloudflare.com war nach anfänglichem DNS-Anlauf erreichbar; DNSfehler nicht als Produktbug gewertet.
- Quelle: tatsächliche öffentliche Browser-/HTTP-Tests, lokale nichtpersistierende Demo, passiver echter Testprofilzustand. Fehlender öffentlicher Skriptzugriff reproduziert einmal mit Assetvergleich; erwartbar bei identischer Registrierung wiederholbar, zweiter unabhängiger Tunnellauf noch nicht durchgeführt.
- Hypothese: presentation.js fehlt in Public-Overlay-Assetallowlist, wodurch Rendererbootstrap abbricht. Kein Patch vorgenommen.

## P27 Stream Monsters – Teilmatrix Fortsetzung 05.10.2026
| Funktion | Status | Beleg/Grenze |
|---|---|---|
| Aktivierung/Zugang/State | bestanden | vorheriger HTTP200; kein Abo-/Accountwechsel nötig |
| Gerenderte Creatorsteuerung | bestanden | tatsächliche sieben Bereiche LiveCenter/Gameplay/GiftsChat/Sprachen/OverlayStudio/Assets/Community; Studio-Copy vorhanden, aktive GCCE-Aliase dargestellt |
| Lokale komplette UI-Demo | bestanden | tatsächlicher Klick auf Kompletten Demoablauf starten; Overlay zeigt Round1, demo-viewer/demo-rival, Ashfang/Ripple, HP50/50 und48/52, Schild/Special und A/B/C-Skills. Nichtpersistierende Demo, kein echter Kampf-/XPbeleg |
| Einzelne API-Matchdemo | bestanden | POSTdemo200success; zu spätes Browserbeobachten nach Handleverlust war kein sichtbarer Beleg; nur nachfolgende UI-Demo zählt als Darstellung |
| Passive reale Zuschaueraktivität | nicht beobachtet | echte Eier/Quest-/Collectorstand im lokalen Overlay sichtbar, jedoch Entstehung zwischen Beobachtungsfenstern; kein bestimmter Gift-/Chatursachennachweis |
| Begrenztes echtes Eventfenster | bestanden |45s ab05:03:19Z, join27, keine streammonsters:-Events, eventCursor7 unverändert, ready1; keine relevante Game-Eventreaktion bestätigt |
| Öffentliche Initialisierung/Updates | Bug bestätigt |013, Präsentationsskript404 und zwei TypeErrors; deshalb kein öffentlicher Update-Pass |
| Regeln/Commands/Reports/Routen Regression | bestanden | vier Suites55Tests grün: chat-commands, battle-rules-v8, battle-report, battle-routes-v5; Mock-/Quelltests |
| Echte Kämpfe/Ergebnisse/Fortschritt/Persistenz | nicht beobachtet | Demo ersetzt keine echten Viewer-Runden; noch offen |
| Rücksetzung | bestanden | Plugin deaktiviert200, eigener Tunnelstop200, gezielte Originalsettings restauriert; Originalsettingsanzahl und aktuelle Anzahl separat verifiziert |

- Echte empfangene Testprofil-Eier/Viewer-/Questdaten wurden erhalten, nicht pauschal per Backup gelöscht. Keine synthetischen persistenten Viewer/Kämpfe angelegt. Vorheriger Snapshot außerhalbGit bleibt verfügbar. Kein App-Neustart, kein öffentliches Chat/Gift.

## P2 AnimazingPal – Teilmatrix 05.10.2026
- Profil test geprüft, gesichert `%TEMP%\ltth-audit-20261005-before-pal.db` plus gezielte Pluginsettingsoriginal0. Temporär config.enabled=false, aktive Animaze-Autoverbindung false und brain.enabled=false vor Aktivierung gesetzt; keine Avatarinstanz gesteuert oder externe KI angefordert. API-Aktivierung200success, keine anderen Plugins deaktiviert, isConnectedfalse/activePlatformanimaze.
- Plattforminventar **bestanden**: tatsächliches GETplatforms nennt animaze, vtube-studio, vseeface. Read-only Get-NetTCPConnection zeigt keine Listener auf Standardports9000/8001; daher Animaze-/VTubeStudio-Anbindung **blockiert** durch fehlende geeignete lokale Instanz. VSeeFace-UDP-39539 nicht geprüft, Status **nicht beobachtet**; fehlender TCPdienst beweist keine UDP-Abwesenheit.
- Braininitialisierung **bestanden**: tatsächlicher GETbrain/status success, acht Personas, Statistikfelder verfügbar. Keine Gedächtnis-/Prompt-/Viewerinhalte exportiert. KI bewusst deaktiviert; echte KI-Antwort/Provider-/Hörnachweis **nicht beobachtet**. Konfigurationsbools bei Rücksetzung separat erfasst.
- Lokaler StreamAssistant-HUD **bestanden** für Grunddarstellung/Empfangsstatus: tatsächliches /overlay/animazingpal/stream-assistant zeigt22Ereignisse/0Antworten/0Duplikate und join:event-disabled. Empfangene echte Aktivitäten bei ausgeschalteten Reaktionen, keine Avatar-/KI-Reaktion daraus ableiten; keine vollständige Eventtyp-/Korrelationserfassung in diesem Fenster.
- Isolierte Adapter-/Viewerbase-/LongTermMemory-/ConnectionErrorRegression **bestanden**: vier Suites41Tests grün, ausschließlich isolierte Mocks/Datenbanktests. Tatsächliche profilübergreifende Erinnerungspersistenz, Avatarbewegung, KI-Gedächtnisabruf, Reconnect zu externer Avatarinstanz, publicHUDupdates, Einstellungen/DE-EN und Last weiterhin offen.
- Rücksetzung **bestanden**: Plugin wieder deaktiviert200, gezielte Originalsettingsoriginal0/current0 restauriert. Keine App-Neustarts oder öffentliche Nachrichten/Gifts. Erzeugte reguläre Brain-Tabellen und empfangene echte Testprofil-Viewer-/Eventdaten erhalten, keine pauschale Profildatenbankrücksetzung.
- Wichtige Statusgrenze: plugin config.brain.enabled warfalse, tatsächliche Brainstatistik bei Rücksetzung enabled=true/apiKeyConfigured=false. Deshalb nicht behaupten, dass der BrainRuntime-Schalter nachweislich deaktiviert war; keine KI-Anfrage wegen fehlendem konfiguriertem Schlüssel belegt. Inkonsistenz gezielt zu reproduzieren, noch kein bestätigter eigener Bug.
- P2-Nachprüfung der Enabled-Inkonsistenz: BrainEngine.configure setzt Runtimeenabled=(brain.enabled===true || liveHost.enabled===true); liveHost hat eigenen standardmäßig aktiven Schalter. Daher lässt brain.enabled=false allein den LiveHost-Pfad aktiv. Der beobachtete Runtime-Status erklärt sich durch diese OR-Verknüpfung, kein neuer bestätigter Bug aus diesem Befund. Vollständige Abschaltung hätte zusätzlich liveHost.enabled=false benötigt. Frühere Aktivierung blieb ohne konfigurierten KI-Schlüssel; keine erfolgreiche KI-Reaktion beobachtet.

## P38 WebGPU Weather Control – Teilmatrix 05.10.2026
- Profil test vor Aktivierung geprüft und online gesichert: `%TEMP%\ltth-audit-20261005-before-weathergpu.db`, gezielter Originalzustand `%TEMP%\ltth-weathergpu-before.json`: Settings0, eigene Giftmappings0, Tabelle bereits vorhanden. Andere Profile und klassisches Weather Control unverändert.
- Aktivierung/Bootstrap **bestanden**: HTTP200success, Diagnose webgpu-bootstrap-complete. Anfangs abgeschaltete Effekte entsprechen dem Bootstrap; leere Vorschau ist allein kein Fehler.
- API-Zugangsschutz **bestanden**: Konfigurationsänderung ohne Schlüssel sowie Trigger mit klassischem X-Weather-Key liefern401. Korrektes X-WebGPU-Weather-Key aus eigener Testkonfiguration nur intern verwendet, nicht protokolliert.
- Lokaler synthetischer Trigger/Rendering **bestanden**: Konfiguration enabled/rain.enabled=true HTTP200; rain/intensity0.8/duration15000 HTTP200success. Tatsächliche Browservorschau /webgpu-weather-control/overlay zeigt Regen über die Fläche, keine Browserfehler/Warnungen. Visueller Beleg im Browsertool, kein exportierter Screenshotpfad. Dies bestätigt weder echte TikTok-Trigger noch öffentliche Darstellung oder Transparenz im Zielhost.
- Regression **bestanden**: vier Suites49Tests grün (telemetry-rate-limit, renderer, control-storage, control-plugin), portable Node22.14.0; isolierte Tests ersetzen keine Live-Abnahme.
- Rücksetzung **bestanden**: Plugin deaktiviert HTTP200; nur eigene temporäre Pluginsettings/Bootstrap-Giftmappings auf gesicherten Originalzustand zurückgesetzt und Counts0/0 verifiziert. Reguläre Tabelle erhalten, keine pauschale Datenbankrücksetzung, kein App-Neustart.
- Öffentliche URL/Assets/Updates, Transparenz, alle Wettervarianten/Presets, echte Eventreaktionen, Stabilität und Persistenz bleiben offen.

## LTTH-LIVE-014 – Öffentliches WebGPU EmojiRain erhält weder Startzustand noch Spawn-Events (P1)
- Bereich A8/P36; Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, unveränderte Pluginquellen; parallele Talking-Heads-/TTS-Änderungen erhalten. Windows/Node22.14.0, Profil test, 05.10.2026 ca.07:16 Europe/Vienna.
- Voraussetzungen: WebGPU EmojiRain aktiviert, vorhandene gemeinsame v3-Presets/Uploadverzeichnisse unverändert; gesicherte Testprofilsettings. Aktivierung deaktiviert klassisches EmojiRain automatisch.
- Reproduktion:
  1. Lokales /webgpu-emoji-rain/obs-hud öffnen.
  2. POST /api/network/overlay-tunnel/ensure mit dieser lokalen URL; HTTP200success erzeugt öffentlichen HUD-Einstiegspunkt.
  3. Öffentlichen HUD im Browser öffnen.
  4. Lokalen und öffentlichen Socket verbinden und ausschließlich webgpu-emoji-rain:spawn zählen.
  5. Lokal POST /api/webgpu-emoji-rain/test mit count12/emoji Regen auslösen.
- Erwartet: erlaubte Overlay-Lesekonfiguration und öffentlich sichtbarer Testspawn ohne öffentliche Verwaltungs-/Schreibrechte.
- Tatsächlich: GET /api/webgpu-emoji-rain/config, /user-mappings und /overlay/state lokal200/öffentlich404 (drei einzelne Vergleiche); öffentliche Browserwarnungen bestätigen die fehlenden Startdaten. Beide Sockets verbunden, lokale Spawnzählung2/öffentliche0. Lokaler Browser zeigt Partikel; öffentliche Fläche bleibt leer. Die lokale Zählung2 beinhaltet keine belegte identische Payload-Duplizierung und wird hier nicht als Duplikatbug interpretiert.
- Quelle: lokale synthetische Testtrigger; kein echtes Gift/Chat ausgelöst. Bereinigte Belege: drei Statuspaare[200,404], connected[true,true], spawnEvents[2,0]; Browsergrafik/Logs im Tool, kein gespeicherter Screenshotpfad. Öffentlicher i18n-Fehler entspricht zusätzlich bereits009.
- Reproduzierbarkeit: erster Testtrigger lokal sichtbar, erneuter öffentlicher Test leer; zusätzlicher verbundener Socketvergleich bestätigt fehlenden Empfang. Auswirkung: öffentliche TikTok-Studio-Quelle kann trotz erfolgreichem Tunnelstart keine zuverlässige Initialisierung/Animation liefern.
- Ursachenhinweis: app/modules/public-overlay-registry.js erlaubt klassische emoji-rain-Lesepfade/-Events; passende webgpu-emoji-rain-Lesepfade und Socketeventnamen fehlen. Als Ursache aus Quellvergleich gestützt, kein Produktpatch durchgeführt.

## P36 WebGPU EmojiRain – Teilmatrix 05.10.2026
| Prüfung | Status | Beleg / Grenze |
|---|---|---|
| Sicherung/Lifecycle | bestanden | Onlinebackup vor Aktivierung; vorher Pluginsettings0; Aktivierung200, klassische EmojiRain-Version automatisch deaktiviert |
| Lokale GPU/Grunddarstellung | bestanden | tatsächlicher Renderer ready, Intel gen-12hp, Auflösung1152x648, etwa60FPS, droppedParticles0; Browser zeigt Regenpartikel ohne Warnungen/Fehler |
| Begrenzter API-Testtrigger | bestanden | count24 Regen HTTP200; tatsächliche Grafik sichtbar; synthetisch, kein Live-Nachweis |
| Öffentliche Quelle | Bug bestätigt |014; erfolgreiche Tunnel-URL, aber drei Lesepfade404 und Spawnempfang0 bei verbundenem Socket |
| Isolierte Regression | bestanden | native/collision-solver/renderer-parity/spawn-position, vier Suites41Tests grün |
| Preset-/Assetänderungen | blockiert | Presets/uploads gemeinsam genutzt; keine Änderungen an deren Dateien oder Upload-/Mappingtests; reine Read-only-UI-Prüfung bleibt möglich |
| Reale Eventkette/Commands/alle Layer/Last/Persistenz | nicht beobachtet | weiterhin offen; GPU-Telemetrie und Testtrigger ersetzen keine vollständige Live-Abnahme |
| Rücksetzung | bestanden | WebGPU deaktiviert200, ursprüngliches klassisches EmojiRain wieder aktiviert200, gezielte Settings original0/current0, eigener Tunnelstop200 und beide Vorschautabs geschlossen |
- Keine geteilten Presets/Uploads verändert, kein App-Neustart, keine öffentlichen Nachrichten/Gifts. Profilbackup `%TEMP%\ltth-audit-20261005-before-emojigpu.db`; gezielte Originalrows `%TEMP%\ltth-emojigpu-before.json` außerhalbGit.

## P37 WebGPU Fireworks – Teilmatrix 05.10.2026
- Vorher Onlinebackup `%TEMP%\ltth-audit-20261005-before-fireworksgpu.db`; eigene Pluginsettingsoriginal0 separat gesichert. Vor Aktivierung enabled=false, randomEnabled=false, superfanFinaleEnabled=false, audioEnabled=false gesetzt; eigene Migrationsmarkierung verhindert Import mit erneuter Aktivierung von automatischen Reaktionen. Existierende gemeinsame Uploads/History unangetastet, keine Recovery-/Customshow-Datei geschrieben.
- Lifecycle **bestanden**: Aktivierung200success, keine anderen Plugins deaktiviert. Tatsächlicher GETstatus enabled=false, Giftcatalog794, Rendererregistered/ready/backendwebgpu/protocol3 und capabilities depth3d-v1/boykisser-v1, etwa60FPS, droppedParticles0.
- Lokaler manueller Browsertrigger **bestanden**: POSTtrigger burst/intensity1/particleCount120/playSoundfalse/forceRockettrue HTTP200 acceptedtrue/reasonsubmitted. Gerenderte Vorschau zeigt farbigen Burst. Kein echter Gift-/Superfan-Beleg, keine Hörprüfung. Drei frühe i18n-not-initialized-Warnungen, keine beobachteten Browsererror-Logs in diesem Fenster.
- Audioressourcen-Ladestatus **bestanden** ausschließlich für Renderertelemetrie: loadedSounds20/failedSounds0 bei bewusst deaktiviertem Audio. Hörbarer Ton bleibt nicht beobachtet.
- OBS-Abhängigkeit **vom Nutzer zu prüfen**: README sowie tatsächlicher Status verlangen Loggableim/obs-studio-webgpu, WebGPUmodeAuto und freigegebenen lokalen Origin. StandardOBS nicht unterstützt, kein Canvas/WebGLfallback; kein OBS gestartet oder geändert.
- Isolierte Regression: capability-routing, trigger-truth, superfan-finale **bestanden**, drei Suites108Tests grün. settings-http-truth **blockiert** vor Testausführung: jsdom-Abhängigkeit @exodus/bytes/encoding-lite.js enthält ESMexport, Jest meldet Unexpected token export. Kein Produktbug daraus abgeleitet.
- Rücksetzung **bestanden**: Plugin deaktiviert200, gezielte Settingsoriginal0/current0 verifiziert. SHA256 der gemeinsam genutzten superfan-finales.json vor/nach identisch (Hash selbst nicht protokolliert). Vorschautab geschlossen; keine App-Neustarts/öffentlichen Nachrichten/Gifts.
- Öffentliche Quelle/Assets/Updates, UI/Designer/Shows/Presets, andere Trigger/Combos, echte Events, Last/Stabilität und Persistenz weiterhin offen. Die erfolgreiche lokale Grafik bestätigt keine öffentliche Quelle.

## A8 Studio-Angebotsinventur – Quellabgleich 05.10.2026
- Alle 24 ausgewählten Pluginverzeichnisse auf tatsächliche data-copy-tiktok-studio-url-Angebote geprüft; dynamische Frontendgenerierung berücksichtigt. Dies ist ein Quellinventar, noch keine vollständige Klick-/Clipboardabnahme.
| Plugin | Angebotsquelle / Umfang |
|---|---|
| Advanced Timer | ui/ui.js:408, dynamische Timerkarte |
| AnimazingPal | live-host-ui.js:562, dynamischer StreamAssistantHUD; deaktiviertes Backend lässt Tab mit API endpoint not found statt HUD-Konfiguration erscheinen |
| ClarityHUD | ui/main.html:1149/1180/1211/1246, vier Varianten |
| CoinBattle | ui.html:1135/1305, Basis/Pyramide |
| Config Import | kein Overlay, kein Angebot erforderlich |
| EmojiRain | ui.html:1761–1770, fünf angebotene Layerquellen; Routensynonyme separat abgleichen |
| Fireworks / Flame | ui/settings.html:1505 / ui/settings.html:2232 |
| Game Engine | tiktok-studio-ui.js:96, dynamisch; targets enthalten Spiele/HUD/unified sowie Modusquellen |
| GCCE | ui.html:1330; zweite Legacyroute gesondert prüfen |
| Goals | ui.js:234/1139, Karten und Multigoal |
| Interactive Story | ui.html:4487 |
| Viewer XP | keine Angebote im aktuellen milestone-leaderboard-Verzeichnis; bereits004, alle acht Routen vollständig berücksichtigen |
| Music Bot | ui.html:483 |
| Quiz Show | quiz_show.html:1166/1168/1170, drei Varianten |
| Schnorrbecher | ui.html:57 |
| Sidekick | kein Angebot in UI/JS; ergänzender Befund zu001 unten |
| Stream Monsters | streammonsters-ui.html:356, dynamische OverlayStudioquellen |
| Top Tier | ui.html:2532/2685, Varianten/Boards dynamisch zuzuordnen |
| FX Frame WebGPU | ui/settings.html:2300 |
| Weather / WebGPU Weather | ui.html:934 / ui.html:935 |
| WebGPU EmojiRain | ui.html:1957–1966, fünf angebotene Quellen; sämtliche Routensynonyme gesondert prüfen |
| WebGPU Fireworks | ui/settings.html:1765; Designer ist Verwaltungs-UI, kein Overlay |
- Offene Inventurarbeit: vollständige Route-zu-UI-Zuordnung einschließlich Legacy-/Queryvarianten, echte Kopierabläufe/Clipboard/Port und öffentliche Assets/Updates; ein vorhandenes Attribut ist kein Funktionspass.

### LTTH-LIVE-001 – Ergänzung: Sidekick bietet im Adminpanel keinen HUD-/Studio-Zugang
- 05.10.2026, gleicher Commit/Windows/Profiltest. Read-only tatsächlich gerenderte /plugins/sidekick/ui.html geöffnet; Status und Einstellungen per echtem Klick betrachtet. DOM gesamt enthält0 Studio-Buttons und0 Overlaylinks; Quellscan des gesamten Sidekick-Verzeichnisses findet kein Studio-Angebot. Keine Einstellungen gespeichert, keine Verbindung oder Testnachricht ausgelöst.
- Schritte: Sidekick-Adminpanel öffnen, Status/Einstellungen und andere Panel-Tabs beziehungsweise gesamtes DOM auf HUD-/Overlay-URL untersuchen; bekannter Backend-HUD ist /overlay/sidekick/hud. Erwartet: sichtbarer Zugang und TikTok-Studio-URL-Angebot für diesen Einstiegspunkt. Tatsächlich: Adminpanel bietet Verbindung/Avatar/KI/Memory/Analytics/Events, aber keine HUD-URL oder Studio-Kopieraktion.
- Dieser UI-Befund ergänzt den unabhängig bestätigten Registryfehler001. Die statische Active-Beschriftung ist kein Backend-Aktivitätsnachweis. Quelle: gerenderte UI plus vollständiger Frontendquellscan, keine Live-/synthetischen Events. Öffentliche HUD-Abnahme bleibt durch001 blockiert; kein Produktpatch.

### LTTH-LIVE-007 / 014 – Ergänzung der Layer- und Legacy-Inventur 05.10.2026
- Aktuelle getObsHudRoutePaths-Methoden beider EmojiRain-Plugins definieren jeweils Basis plus acht Suffixe: emojiregen, herzballons, geschenkeregen, emojiregen-geschenkeregen, emojis, hearts, gifts, emoji-gifts. Zusätzlich registriert jedes Plugin /<plugin>/overlay als Legacy-Einstiegspunkt.
- Alle acht WebGPU-Suffixe sowie /webgpu-emoji-rain/overlay einzeln per POSTensure geprüft: jeweils400 OVERLAY_URL_NOT_REGISTERED. WebGPU zum Prüfzeitpunkt deaktiviert, lokale404 deshalb kein eigener Produktbug und kein Renderingnachweis. Quellrouten sind dennoch vorhanden und bei Aktivierung vorgesehen. Kein Tunnel gestartet.
- Klassisches /emoji-rain/overlay bei aktivem Plugin lokal200, ensure400 OVERLAY_URL_NOT_REGISTERED. Dies erweitert007 um den Legacy-Einstiegspunkt. Neue Definitionen und UI-Aliaszuordnung als Bestandteil vollständiger A8-Inventur berücksichtigt; angebotene Hauptlayerbuttons reichen nicht für vollständige Routenerreichbarkeit.

## LTTH-LIVE-015 – GCCE-Legacy-Overlay ist lokal vorhanden, aber nicht öffentlich registriert (P2)
- Bereich A8/P12; 05.10.2026, Windows, portable Node22.14.0, Profiltest, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Bestehende Talking-Heads-/TTS-Änderungen erhalten, keine Quelländerung.
- Voraussetzungen: GCCE aktiv, tatsächlicher App-Port3000.
- Reproduktion:
  1. GET http://127.0.0.1:3000/gcce/overlay: HTTP200.
  2. POST /api/network/overlay-tunnel/ensure mit overlayURL=http://127.0.0.1:3000/gcce/overlay.
  3. Fehlerantwort lesen.
- Erwartet: vorhandene Overlayquelle lässt sich im freigegebenen Testumfang als öffentliche Studioquelle erzeugen; Verwaltungszugriffe bleiben gesperrt.
- Tatsächlich:400 OVERLAY_URL_NOT_REGISTERED; Validierung bricht vor Tunnelstart ab. Neueres /plugins/gcce/overlay-hud steht in der Registry, die parallel registrierte Legacyroute /gcce/overlay nicht.
- Quelle: lokale API-/HTTP-Prüfung ohne synthetische Daten und ohne echte Live-Events. Bereinigter Beleg {path:/gcce/overlay,local:200,ensure:400,code:OVERLAY_URL_NOT_REGISTERED}. Keine Screenshotbehauptung; keine öffentliche Renderingabnahme möglich.
- Reproduzierbarkeit: direkte Route lokal200 plus deterministische Validierungsablehnung. Auswirkung: Legacyquelle kann trotz vorhandener lokaler HTMLdarstellung keine Studio-Tunnel-URL erhalten.
- Quellbelege: app/plugins/gcce/index.js:640 registriert Legacy, :1166 neueres HUD; app/modules/public-overlay-registry.js ENTRYPOINTS nur neueres HUD. Fehlende Registryroute als gestützte Ursache, keine Änderung vorgenommen.

## A2/A3 – erneutes passives Livefenster 05.10.2026 07:24 Europe/Vienna
- Profilguard unmittelbar bestätigt test/requiresRestartfalse; GETstatus isConnectedtrue/usernamewahanfx/restartingfalse. Dies ist aktueller Connector-Empfang, keine erneute TikTok-WebUI-Verifikation.
- 45s05:24:11.729Z–05:24:56.740Z: normalisierte tiktok:event join22/like3/chat2. Kein Gift/Follow/Share/Abo-/Superfan-Ereignis im Fenster beobachtet; keine öffentliche Nachricht/Gift gesendet.
- Begleitende Socketzähler: clarityhud.update.join22, like2, chat2; emoji-rain:heart-balloons3 und spawn3; viewer-xp:update508/viewerxp:event508, level-up20; toptier:update11/decay8; dashboard:widget:update88. Zähler der Pluginupdates sind kein Nachweis korrekter Einzelwertung, identischer Ereigniszuordnung oder sichtbarer Darstellung. Große XP-Updateanzahl gesondert prüfen; keine Duplikatbehauptung aus unterschiedlichen Eventgranularitäten.
- Kein Payloadinhalt/Namen/Chattexte/Tokens gespeichert. Ergebnisstatus: echte Join-/Like-/Chat-Empfangskette bestanden für den Connector; relevante sichtbare Pluginreaktionen dieses Fensters nicht beobachtet.

## P11 Game Engine – gesicherte nächste Testbasis 05.10.2026
- Read-only Quelle bestätigt ProfilDB api.getDatabase().db für Spielzustände; vorhandene sharedMedienverzeichnisse game-media, wheel-audio, slot-audio, slot-images nur auf Existenz geprüft. Keine Upload-/Medien-/Shareddateiänderung.
- Testprofil online gesichert `%TEMP%\ltth-audit-20261005-before-gameengine.db`. Vor Aktivierung Tabelleninventar game_% leer; kein bestehender Spielzustand in dieser Tabellenfamilie. Noch kein Aktivierungs-/Spielpass.
- Init lädt sechs Spiele Connect4/Chess/Plinko/Wheel/Slots/Arena und eigene Timer/Queues; daher gezielte Lifecycle-/Cleanup- und Persistenzprüfung erforderlich. App unverändert weiterlaufend, keine Game-Engine-Aktivierung in diesem Schritt.

## P11 Game Engine – erster tatsächlicher UI-Spielablauf 05.10.2026
- Aktivierung im gesicherten Profiltest HTTP200, keine anderen Plugins deaktiviert. Tatsächliche gerenderte UI zeigt Connect4, Blitzschach, Plinko, PlinkoTest, Glücksrad, SlotMachine, LiveArena sowie Trigger/XP/ELO/Medien/Statistiken und Overlaywerkzeuge.
- Manueller Offline-Tab bietet tatsächlich ausschließlich Connect4, manuelle beide Spieler oder Zufallsbot. Eigenes lokales Spiel AUDIT20261005-A/B per UI gestartet, Session1, StatusLäuft. Keine öffentliche Teilnahme, kein Gift; UI weist auf keine XP im manuellen Modus hin, Backend-XPfreiheit noch nicht separat verifiziert.
- Zwei echte UI-Spaltenaktionen ausgeführt: Spieler1SpalteA, Spieler2SpalteB; UI meldet Move made successfully und wechselt aktuellen Spieler2->1. API-/DB-Brettinhalt und Ergebnis noch nicht unabhängig geprüft.
- Auffälligkeit noch **nicht bestätigt**: zusätzliche Meldung session_not_found nach erstem Zug; erst nach Spielstart geöffnete spezifische Connect4-Vorschau leer, Unified zeigt Warte auf Spiel. Mögliche State-Rehydration/Manualrouting zuerst gezielt prüfen; kein pauschaler Renderingfehler abgeleitet.
- Versuch UI-Ende bekam Browsersteuerungs-CDP-Inputtimeout trotz eindeutigem sichtbarem Button. Kein Produktbug daraus. Regulärer lokaler API-Endeaufruf Session1 HTTP200success, danach Plugin deaktiviert200success und drei Testtabs geschlossen.
- Plugininitialisierung hat reguläre Testprofil-Spieltabellen/Defaultkonfiguration angelegt; eigenes Session1-Testprotokoll bleibt vorläufig für Persistenz-/Ergebnisanalyse erhalten. Gemeinsame Medien nicht hochgeladen/gelöscht/geändert; keine komplette DB-Rücksetzung. Wiederherstellungspunkt vom vorherigen Schritt vorhanden.
- Status: Start/manuelleZug-UI und regulärer API-Abbruch bestanden für diesen engen Ablauf; Regeln/Fehlerfälle/Sieg/Persistenz/öffentliche Darstellung sowie übrige fünf Spiele weiterhin offen. Folgetest muss Originalsettings/Defaults und eigene Sessionhistorie gezielt unterscheiden und Rücksetzung abschließen.

## LTTH-LIVE-016 – Später geöffnetes Connect4-Overlay erhält kein aktives manuelles Spiel (P2)
- A8/P11, Profiltest, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026. Keine Produktänderung; Talking Heads unverändert.
- Voraussetzungen: aktivierte GameEngine, Testprofilbackup vorhanden. Lokaler manueller Modus, keine echten Viewer-/Giftaktionen.
- Reproduktion:
  1. /overlay/game-engine/connect4 vor Spielstart öffnen.
  2. Manuellen Connect4-Start mit zwei Testspielern auslösen; Session2 HTTP200.
  3. Erstes Overlay zeigt Brett mit42leeren Zellen, Testspielern und aktuellem Spieler.
  4. Denselben Overlaypfad in einem zweiten frischen Browser-Tab öffnen, während Session2 läuft.
- Erwartet: neu verbundene Overlayquelle stellt das aktive Spiel aus dem aktuellen Zustand dar.
- Tatsächlich: zweiter Tab bleibt leer; erstes zeigt aktives Brett. Vorherige Session1 bestätigte ebenfalls leere nachträglich geöffnete Quelle. Unified zeigte damals Warte auf Spiel, wird hier nicht als separat bestätigter Bug gewertet.
- Quelle: lokales manuelles Testspiel, tatsächliche Browserdarstellung. Bereinigte AX-Belege: erster Tab game-container/board-grid/42Zellen/Spielernamen, zweiter nur AXWebArea. Keine Geheimnisse, kein gespeicherter Screenshotpfad.
- Reproduzierbarkeit:2manuelle Sessions mit nachträglich geöffnetem spezifischem Overlay; zweite zusätzlich direktes Vorher/Nachher-Tabpaar. Auswirkung: Overlayöffnung/Refresh während eines manuellen Testspiels liefert keine laufende Darstellung; echte Connector-Spiele noch nicht darauf geprüft.
- Gestützter Ursachenhinweis: connect4.html sendet game-engine:request-state, verarbeitet den manuellen Start aber über game-engine:game-started. main.js:4527 nimmt bei vorhandenem interactiveController ausschließlich dessen emitState-Pfad und kehrt zurück; startManualGame hält manuelles Spiel separat in activeSessions. Hypothese: manueller Zustand fehlt in diesem Snapshotpfad. Keine Produktkorrektur.

### P11 Nachprüfung: vollständiger manueller Connect4-Abschluss
- Bereits geöffnete spezifische Quelle zeigt Testspiel korrekt; Grundrendering bestanden. Lokale API-Züge1A/2B/1A/2B/1A/2B/1A: alleHTTP200success; erste sechs gameOverfalse, siebter gameOvertrue/winner1. Vertikaler Sieg korrekt, isolierter synthetischer Ablauf ohne öffentlichen Chat.
- session_not_found aus vorherigem Adminpanel weiterhin unbestätigt; nicht mit dem belegten LateJoin-Bug vermischen. Board-/Sieganimation nach letztem Zug und unabhängige DB-Ergebnis-/XPprüfung noch offen.
- Plugin nach Spielabschluss wieder deaktiviert; reguläre eigene Testsessionhistorie und initialisierte Defaults für folgende Persistenzanalyse behalten, keine pauschale Profildatenlöschung. Gemeinsame Medien unverändert.

### P11 Persistenz-/XP-Nachprüfung der eigenen manuellen Sessions 05.10.2026
- Tatsächliche Testprofildatenbank nach Plugindeaktivierung read-only geprüft, ausschließlich eigene AUDIT20261005-Spieler und Sessions1/2.
- Session1 persisted statuscompleted/winnernull/win_reasonmanual_end/triggermanual/test_playerbeide, gespeichert2Züge. Session2 persisted statuscompleted/winnerAUDIT20261005-C/win_reasonwin/triggermanual/test_playerbeide, gespeichert7Züge. Ergebnis und Zughistorie nach Plugin-Lifecycle erhalten: **bestanden** für diese manuellen Sessions, kein Neustart-/anderesProfilnachweis.
- viewer_profiles für eigene vier Testnamen0, xp_transactions0; game_player_stats enthält vier eigene Einträge, jeweils total_games0/wins0/losses0/total_xp_earned0. Keine XP-Vergabe an eigene Testspieler beobachtet: **bestanden** für die tatsächlichen beiden Sessionabschlüsse. Daraus keinen allgemeinen XP-/Viewer-Identitäts-Pass ableiten.
- game_player_stats-Zeilen werden auch für Testspieler angelegt, enthalten jedoch in diesem Befund keine Wertung; kein eigener Produktbug allein aus deren Existenz. Eigene Session-/Move-/Statsreste für weitere Prüfung erhalten; spätere gezielte Bereinigung erforderlich, ursprüngliche reguläre Tabellenstruktur/Defaults nicht pauschal entfernen.

## LTTH-LIVE-017 – Plinko-Teststatistik zeigt falschen Gesamteinsatz 0 XP (P2)
- A4/A11/P11, Profiltest, Windows/portableNode22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026 ca.07:30 Europe/Vienna. Keine Quelländerungen, parallele Arbeiten erhalten.
- Voraussetzungen: GameEngine aktiviert; PlinkoTesthistorie vor Test0; Standardboard. Offline-Testmodus, kein Viewer-XP-Einsatz und keine öffentlichen Aktionen.
- Reproduktion:
  1. GameEngine-UI öffnen, Plinko Test wählen, Overlay vorher öffnen.
  2. Eigenen Testspieler und Einsatz100XP/Anzahl1 wählen, Ball spawnen klicken.
  3. Sichtbaren Fall und Abschluss abwarten, Stats aktualisieren klicken.
  4. UI-Gesamteinsatz mit /api/game-engine/plinko/test/stats vergleichen, Aktualisieren wiederholen.
- Erwartet: Gesamtbetrag zeigt100XP passend zur Historie und API.
- Tatsächlich: UI test-total-bet bleibt0XP nach zwei Aktualisierungen; Historie zeigt100XP/2.00x/+100XP. APIHTTP200 totalGames1/totalBet100/totalPayout200/rtp200/avgMultiplier2.
- Quelle: lokaler eigener synthetischer Testwurf. Tatsächliches Overlay zeigt Ball mit Testnamen am Pegbrett; UI/DOM und API getrennt geprüft. Keine Browsererrorlogs beobachtet, kein gespeicherter Screenshotpfad.
- Reproduzierbarkeit:2Aktualisierungen desselben abgeschlossenen Testwurfs; unmittelbarer DOMinnerText0XP. Auswirkung: Offline-Testsumme irreführend, RTP und Verlauf im selben Befund stimmen mit API überein.
- Hypothese: ui.html:2347 trägt das dynamische Statistikfeld weiterhin data-i18n=plugins.game-engine.labels.0_xp; Übersetzungsrefresh könnte den in :9482 gesetzten Betrag überschreiben. Ursache nicht als abschließend bewiesen behandeln; kein Patch.

### P11 Plinko-Teilmatrix 05.10.2026
- Gerenderte Offline-Teststeuerung und einzelner Ballspawn **bestanden**; eigener AUDIT20261005-Plinko-Name, Standardboard,100XP/1Ball. Tatsächliche Vorschau zeigt fallenden Ball/Label/Pegs und Slots.
- Abschluss/Statistik-API **bestanden** für einen Wurf:2x/Payout200, History100Einsatz/+100Gewinn, totalGames1. Testwerte sind keine echten Viewer-XP-Wetten. Falsche UI-Summe **Bug bestätigt**017.
- GameEngine nach Abschluss wieder deaktiviert200. Eigene Plinko-Testhistorie bleibt für Persistenzprüfung erhalten; keine globale Historylöschung, keine Sharedmedienänderung, kein Neustart. Profilbackup vorhanden.
- Batch/Limits/Fehlerfälle/mehrereBoards, echte Gift-/Command-Zuordnung, reale XP-Belastung/-Auszahlung, öffentliche Darstellung/Updates sowie Stabilität bleiben offen; kein pauschaler Plinko-Pass.

## LTTH-LIVE-018 – Glücksrad-Testspin liefert leere Erfolgsantwort und UI meldet unbekannten Fehler (P2)
- A4/P11,05.10.2026, Profiltest, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Keine Produktpatches, parallele Talking-Heads-/TTS-Dateien erhalten.
- Voraussetzungen: GameEngine aktiv, StandardWheel1 mit acht Segmenten. Tatsächliche UI vor Test zeigt alle XPBonus0 und alle Shockschalteraus; keine externe Aktion/Accountänderung geplant. Backup vorher vorhanden.
- Reproduktion:
  1. GameEngine-UI -> Glücksrad, spezifisches Wheeloverlay öffnen.
  2. Eigenen AUDIT20261005-Wheel-Testnamen setzen und Test-Spin starten klicken.
  3. UI zeigt Fehler: Unbekannter Fehler.
  4. Lokale POST /api/game-engine/wheel/spin mit zweitem eigenem Testnamen/wheelId1 wiederholen und Antwort lesen.
- Erwartet: API wartet auf Triggerresultat und meldet nachvollziehbar Erfolg/Queue/Fehler; UI stimmt damit überein.
- Tatsächlich: HTTP200 body{}; gerenderte UI meldet unbekannten Fehler. Ob Spin dennoch gestartet/abgeschlossen wird, in diesem Fenster noch nicht bewiesen; keine pauschale Behauptung eines fehlenden Spins.
- Quelle: zwei lokale synthetische Testaktionen, erste tatsächliche UI, zweite direkte API. Bereinigte Belege Status200/body{} und UI-Fehlertext. Keine externen Gifts/Chatnachrichten, keine Screenshotpfadbehauptung.
- Ursache aus Quellvergleich gestützt: games/wheel.js:315 async triggerSpin, main.js Wheel/spin-Handler ruft ohne await auf und res.json(result) serialisiert das Promise als{}. Nicht behoben.
- Auswirkung: Teststeuerung zeigt Fehlschlag und kann bei Wiederholung zusätzliche Spins anstoßen; Status-/Fehlerkommunikation unzuverlässig.
- Rücksetzung: Plugin nach Test wieder deaktiviert200; keine Wheelkonfiguration geändert, keine Medien-/Historyglobalresetaktion. Eigene mögliche Spin-/Queue-/Gewinnreste noch gezielt zu prüfen und zu bereinigen; reguläre Testprofildaten erhalten.

### P11 Wheel-UI-Inventar
- Tatsächlich gerendert: mehrereWheels, Chat-/Gifttrigger, acht Standardsegmente mit Text/Farbe/Gewicht/Audio/XP/Niete/Shock, Idle-/Info-/Ergebnistext, customAudio, Statistik/Gewinnverwaltung/Testspin und spezifische Studio-URL-Kopieraktion.
- Inventar bestanden für gerenderte Angebote; Audio/Shock/OBS nicht ausgelöst. Alle funktionalen Varianten, persistierte Spinresultate/Queue/öffentliche Quelle bleiben offen. Slots in diesem Schritt noch nicht geprüft.

### P11 Wheel-Ergebnisnachprüfung nach018
- Eigene Testnamen gezielt in persistierter game_wheel_wins- und xp_transactions-Tabelle geprüft; fremde Daten nicht ausgegeben. Ergebnis wird nach tatsächlichem Querybefund ergänzend geführt, keine pauschale Wertung aus der leeren APIantwort.
- Tatsächlicher Wheel-Querybefund: zwei eigene Gewinneinträge persistiert, jeweils Niete/segment_index7/paid_out0, eigener XP-Transaktionscount0. Damit wurden beide Testaktionen trotz falscher API-/UI-Meldung bis zu einem gespeicherten Ergebnis verarbeitet; sichtbare Rotations-/Ergebnisanimation in diesem Fenster nicht geprüft. Die erste UI-Eingabe wurde als lowercase audit20261005-wheel gespeichert, zweite direkte API als AUDIT20261005-Wheel2; Identitätsnormalisierung gesondert prüfen, kein neuer Bug allein aus diesem Vergleich.

### P11 Slots – tatsächliche UI-Inventur 05.10.2026
- GameEngine erneut aktiviert200; tatsächlichen SlotMachine-Tab geöffnet. StandardSlot vorhanden, enabled-Schalter angezeigt, sharedWheel/SlotsFIFO-Queue ausdrücklich beschrieben. Keine Einstellungen gespeichert oder Testspins ausgelöst.
- Gerenderte Angebote: mehrereMaschinen, Chatcommand, reguläre/sub/mod-VIPCooldowns und Superfanrechte, Animation/Sound/Design, sechsLayouts (large/horizontal/vertical/compact-hud/compact-featured/icons-only), Symbol-/Giftkatalogeditor, dreiOddsProfile, Giftmappings, Rewardregeln, Statistik, Testspin und StudioCopy für spezifisches Slotoverlay.
- Wichtige Testgrenze: tatsächlicher Testspin ruft _triggerSpin mit triggerTypetest auf, umgeht Cooldowns und kann RewardDispatch auslösen. Quelle games/slot.js nennt XP/OpenShock und Regeln unterstützen chat/free_spin. Deshalb vor dem Funktionstest alle aktiven Reward-/Symbolaktionen gezielt lesen und nur eigenes Testprofil sichern/temporär konfigurieren; UI-Defaults allein reichen nicht als Beleg gefahrloser Testaktionen. Kein externer Reward/Chat/Shock ausgelöst.
- Noch unbestätigte UI-Ladeauffälligkeit: beim ersten Tabstand StandardSlot auswählbar, mehrere Felder leer und LadeStatistiken/LadeSlotmaschine dargestellt; Ursachen/Backendantworten noch prüfen, kein Bug aus anfänglichem Ladezustand.
- Plugin nach Inventur wieder deaktiviert200, keine Sharedmedien-/Configänderung; Funktionstest der Slots weiterhin offen.

### P11 Slots – erster tatsächlicher lokaler Testspin 05.10.2026
- Aktuelle Testprofilgame_slot_config gelesen: zwölf Standard-Emoji-Symbole; vier Rewardregeln ausschließlich audio für small/medium/big/jackpot. Keine chat/xp/free_spin/openshock-Regel in diesem Ausgangszustand. Vorhandenes Profilbackup, gemeinsame Medien unangetastet.
- Aktivierung200, spezifisches Slotoverlay vor Trigger geöffnet. POST /api/game-engine/slots/1/test-spin mit eigenem AUDIT20261005-Slot/oddsProfilechat HTTP200success/spinId1791178489274.
- Tatsächliche lokale Ergebnisgrafik **bestanden** für diesen einzelnen Test: eigener Name, drei Symbolreels und Kein Gewinn sichtbar; Browsererror-/warnlogs leer. Verlustresultat dargestellt, kein Gewinnreward-/Audiobeleg. Kontinuierliche Animationsbewegung nicht separat aufgezeichnet, daher kein umfassender Animationspass.
- Plugin wieder deaktiviert200, Vorschautab geschlossen. Kein öffentlicher Chat/Gift/Gerätetrigger; keine Konfiguration gespeichert oder Uploads verändert. Eigener Testspin-/Operationseintrag bleibt zur nachfolgenden Persistenz-/Cleanupprüfung erhalten.
- Offen: unabhängiger DB-Outcomenachweis/Idempotenz/Rewardzustand, tatsächliche UI-Testspinfunktion und anfänglicher Ladezustand, alleLayouts/Odds/Giftmappings, Cooldowns/Rechte/Superfanabgrenzung, gemeinsameWheelSlotsQueue, öffentlicheAssets/Eventupdates und echteLive-Trigger. Einzelner API-/Browser-Test ersetzt diese Umfänge nicht.

### P11 Slots – gespeicherter Ausgang/Rewardnachweis 05.10.2026
- Read-only Query nur eigenen AUDIT20261005-Slot-Spin geprüft: game_slot_sessions id1/triggertest/reelslemon-grape-clover/outcome_categoryloss/reward_actions[]. game_slot_operations spin1791178489274/statecompleted/completed_at_ms1791178493881, Rewarddeliveries0, eigene XPtransactions0.
- Gespeicherter Verlustausgang stimmt mit sichtbarem KeinGewinn überein; regulärer Abschluss und Persistenz nach Plugindeaktivierung **bestanden** für diesen einzelnen Test. Keine offenen Rewarddeliveries dieses Spins.
- Exakte Reel-Position/Stopanimation noch nicht vollständig geprüft; frühere Grafik könnte im Übergang erfasst sein und ersetzt keinen unabhängigen Symbolmatchnachweis. Kein zusätzlicher Reel-Bug aus dieser Momentaufnahme.
- Ergänzende isolierte Slotregression bestanden: slot-engine und slot-durability, zwei Suites73Tests grün. Mock-/SQLite-Regression; keine allgemeine reale Reward-/Restart-/Publicabnahme daraus ableiten.

### P11 Live Arena – erste tatsächliche Browser-/Validierungsprüfung 05.10.2026
- Profiltest/Backup vorhanden; GameEngine aktiviert200. Tatsächlicher spezifischer Arena-Browser zeigt Spielfläche, Avatarpartikel, Futterpunkte und Rangliste. Sichtbarer Aktivzähler anfangs1, später11. Echte empfangene Testprofilzuschauer, keine Namen/Profilbilder in Bericht exportiert. Entstehung einzelner Teilnehmer nicht lückenlos mit Connectorpayload korreliert; daher keine pauschal bestätigte Eventursachenkette.
- Lokaler synthetischer POST /api/game-engine/arena/test-activity mit eigenem AUDIT20261005-Arena/Typchat/ohneProfilbild: HTTP200successfalse/errorProfile picture required to spawn. Nachfolgend stateAPIplayers5 und eigenerTeilnehmer0. Negativer Validierungsfall **bestanden**; eigene künstliche Arenafigur nicht erzeugt. Profilbildpflicht im _adoptViewerProfilePicture/_isSpawnableProfilePictureUrl-Pfad gestützt.
- Browser-Grunddarstellung **bestanden** für lokale Quelle; Warnung rapierdeprecatedinitializationparameter, keine beobachtete Browsererrormeldung. Keine unabhängige Physik-/Waffen-/Fähigkeits-/Runden-/Ergebnisabnahme daraus.
- GameEngine wieder deaktiviert200 und Vorschau geschlossen. Kein ArenaReset/keine pauschale Zuschauerlöschung, keine Konfiguration/Medien geändert, keine öffentliche Nachricht/Gift. Reguläre empfangene Daten bleiben erhalten.
- Offen: erfolgreicher eigener Testspawn mit geeignetem Testbild, Giftwaffen/Serien, Fähigkeiten/Chatstrategien, Feedkorrelation, Last/Persistenz/Runden und öffentliche Darstellung. Echte unkorrelierte Teilnehmerbilder allein ersetzen diese Umfänge nicht.

### P11 Blitzschach – erster lokaler Command-/Browserablauf 05.10.2026
- Tatsächliche UI-Angebote: sechsZeitkontrollen3+0/3+2/5+0/5+3/10+0/10+5, Streamerfarbe/Timerwarnung, Brettthemes, Koordinaten/Zughervorhebung/geschlageneFiguren, Sound/Sieg/Leaderboard, ELO, StreamerAutoplay, OverlayURL/StudioCopy und SAN/UCI-/resign-Commands. Kein Settingssave, kein OBS.
- Über lokalen GCCE /api/gcce/helpers/test (führt Handler direkt aus, sendet keine TikToknachricht) eigener synthetischer UserAUDIT20261005-Chess. InvalidZeitkontrolle: HelperHTTP200/successtrue bedeutet nur ausgeführterHandler; internes result.successfalse/Invalid time control format. Valid3+0: internes successtrue.
- Spezifisches Overlay vor Start geöffnet, danach tatsächliches Brett mit32Figuren und Namen sichtbar; TestviewerSchwarz3:00, HostWeiß2:54. Grunddarstellung/Zeitkontrolle **bestanden** für lokale Quelle, keine Browsererrorlogs beobachtet.
- Eigener schwarzer Viewerzug e5 während WeißamZug lokal geprüft: result.successfalse/not_viewer_turn. Negativer Zugfolgeschutz **bestanden**. Kein erfolgreicher legaler Zug in diesem Fenster ausgeführt.
- Lokaler resign-Handler successtrue/You resigned from the game. Regulärer Aufgabeablauf **bestanden** auf Handlerantwortebene; Sieg-/ELO-/XP-/DBabschluss noch unabhängig prüfen. Dies ist kein manueller Connect4-Testplayerpfad: eigener synthetischer Chessviewer kann reguläre Testprofilaccounting-Daten erzeugen, gezielte Rücksetzung erforderlich.
- GameEngine wieder deaktiviert200, beide Browserpanels geschlossen. Kein öffentlicher Chat/Gift, keine fremden Profile/Sharedmedien geändert. Profilbackup vorher vorhanden.
- WeitereRegeln(SAN/UCI/legal/illegal/Rochade/Schachmatt/Remis)/Inkrement/Timeout/Autoplay/ELO/Reconnect/öffentlicheQuelle und realeTeilnahme bleiben offen.

### P11 Blitzschach – unabhängiger Abschluss-/Persistenznachweis
- Tatsächliche Profildatenbank read-only nach Plugindeaktivierung: eigene Session3/game_typechess/statuscompleted/winnerstreamer/win_reasonresignation; player1Rolestreamer/player2Roleviewer. game_interactive_sessions derselben eigenen Viewer-ID session3/statuscompleted/terminal_reasonresignation/time_control3+0/turn_rolehost.
- Abschluss und Persistenz nach Lifecycle **bestanden** für diesen einzelnen Aufgabeablauf. Kein noch aktiver eigener Schachzustand in diesen Daten; keine Restart-/Recoveryprüfung daraus ableiten.
- Eigener Testusername: xp_transactions0 und game_player_stats0. Keine tatsächliche XP-/ELO-Buchung für diesen Testspieler nachgewiesen. Das ist kein allgemeiner Reward-/ELO-Pass; Skippingursache noch nicht unabhängig bestimmt.
- Ergänzende isolierte Schachregression **bestanden**: chess-game/chess-rules/chess-lifecycle, drei Suites27Tests grün. Mock-/Quelltests ersetzen keine tatsächliche SAN/UCI/Rochade/Schachmatt/Remis-/Timeout-UI-Abnahme.

### A8 ClarityHUD-Studio-Button/Tunnel-Wiederverwendung 05.10.2026
- Tatsächliche gerenderte UI /clarityhud/ui zeigt vier StudioCopyangebote und lokale Quellen mit tatsächlichem Origin127.0.0.1:3000. Aktivitäts-HUD-Button per echter UI angeklickt; Fehlermeldung Beanspruche zuerst einen TikTok-Benutzernamen in den Netzwerkeinstellungen, Clipboard leer. Quelle tiktok-studio-url.js verwendet ohne expliziten temporary-Schalter stabile claimgebundene URLs. Erwarteter Zugangsvoraussetzungsfehler, kein Produktbug allein daraus; stabile Kopierabnahme **blockiert** wegen fehlendem aktivem Claim. Keine Claim-/Accountänderung vorgenommen.
- Separater freigegebener temporärer API-Tunnel: zweimalensure200success, zuerst reusedfalse, zweites reusedtrue und identischer publicURL-Pfad/Hostname. Tunnelstart und Wiederverwendung **bestanden**.
- Öffentliche GET-Abnahme dieses frischen Hosts **blockiert** in diesem Fenster: DNS ENOTFOUND vor HTTPzugriff, analog bekannter früher QuickTunnel-DNS-Anlaufverzögerung. Kein404/Accesspass/Produktbug daraus; GETAdmin-/Dashboard-Prüfungen nicht erreicht. Finallystop200, eigener Tunnel beendet. Spätere öffentliche Prüfung muss erneut erfolgen.
- Öffentlicher POST-Verwaltungsschutztest wurde von automatischer Freigabeprüfung vor Ausführung abgelehnt (Plugin-enable könnte Zustand verändern; breite Overlayfreigabe decke diesen öffentlichen Managementaufruf laut Reviewer nicht ab). Nicht ausgeführt, kein Umgehungsversuch. Sicherere GET-Alternative durchgeführt, jedoch DNSblockiert; dynamischer Schreibschutztest bleibt separat blockiert.

### A8 Öffentliche Clarity-GET-Prüfung und isolierter Zugriffsschutz 05.10.2026
- Zweiter temporärer Tunnelhost gray-kitty-edges-huntington.trycloudflare.com: begrenzte Wiederholungen für /overlay/clarity/full, /api/plugins und /dashboard.html. Alle drei Ergebnisse ENOTFOUND, kein HTTP-Status erreicht. Öffentliche Darstellung und tatsächlicher Verwaltungsschutz bleiben für dieses Fenster **blockiert** durch DNS; kein Produktbug aus fehlender Namensauflösung. Finally-Tunnelstop HTTP200, eigener Testprozess exit0; kein öffentlicher POST ausgeführt.
- Ergänzende lokale Repository-Sicherheitsmatrix public-overlay-security-matrix.test.js: 146 bestanden, drei fehlgeschlagen, 149 insgesamt. Die drei Assetfehler betreffen ausschließlich Stream-Monsters-Aliase und bestätigen den bereits dokumentierten LTTH-LIVE-013 (streammonsters-presentation.js fehlt). Kein neuer Bug und kein pauschaler Matrix-Pass.
- Zugriffsschutz im isolierten Express/Supertest-Harness mit simuliertem QuickTunnel-Host bestanden: neutrale404 für Dashboard/Pluginverwaltung/privateKonfiguration, sieben HTTP-Methoden auf /api/network/config, stabile Account-/Claim-/Device-Verwaltungsrouten und MethodOverride-Header. Dies ist Quell-/Harness-Evidenz, keine erfolgreiche Prüfung der echten öffentlichen Tunneladresse. Keine Account-/Claim-/Pluginänderungen durch diesen Harness.
- Die zentrale Fixturematrix enthielt auch nicht ausgewählte Overlay-Fixtures; der Talking-Heads-Ausschluss war dabei versehentlich nicht vollständig eingehalten. Keine Talking-Heads-Abnahme daraus, keine Dateien oder Runtimezustände dieses Plugins geändert; diese Gesamtsuite wird nicht erneut ausgeführt.

### P12 GCCE gezielte isolierte Regression 05.10.2026
- PortableNode22.14.0, drei ausgewählte Suites gcce-core-runtime/gcce-plugin-cooldown-contract/gcce-plugin-id-alias:17Tests bestanden,1fehlgeschlagen. Keine Talking-Heads-Suite, keine Runtime-/Profilmutation.
- Einzelner Fehler: Domainfailure-Test erwartet pluginIdstreamalchemy, tatsächliches Ergebnis stream-monsters bei identischem handledtrue/successfalse/statusegg_not_ready. commandRegistry canonicalizePluginId und grüne explizite Alias-Suite belegen beabsichtigte kanonische Identitätsprojektion. Veraltete Testexpectation als Testbestand-Einschränkung dokumentiert, kein bestätigter Produktbug und kein pauschaler Suite-Pass. Keine Test-/Produktdatei geändert.
- Core-/Aliasregression **bestanden** im isolierten Harness; tatsächliche gerenderte Rechte-/Cooldown-/Konfliktabläufe und Live-/Reconnectkorrelation bleiben separat zu prüfen. Der lokale helpers/test-Endpunkt allein umgeht Parsing und beweist diese Schutzschichten nicht.

## LTTH-LIVE-019 – GCCE-Übersicht aktualisiert die Ausführungskennzahl nicht (P3)
- Bereich A4/P12, 05.10.2026, Windows/portableNode22.14.0, Profil test (activeProfiletest/requiresRestartfalse/Port3000). Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Keine GCCE-Quelländerung; vorhandene parallele Talking-Heads-/TTS-Änderungen erhalten.
- Voraussetzungen: GCCE aktiv, 30 registrierte/aktivierte Befehle aus drei Plugins. Keine öffentliche Commandaktion nötig.
- Reproduktion:
  1. /gcce/ui im tatsächlichen Browser öffnen und Übersicht wählen.
  2. Vollständig geladene Befehlsliste abwarten; Statistiken aktualisieren klicken.
  3. Erfolgstoast Statistiken aktualisiert und Kennzahl Ausgeführte Befehle vergleichen.
  4. Lokale GET /api/gcce/stats read-only lesen. Seite neu laden, Aktualisieren wiederholen.
- Erwartet: Bekannter API-Wert totalExecuted0 wird als0 angezeigt; fehlende Daten werden nachvollziehbar bezeichnet.
- Tatsächlich: stat-executed bleibt '-' vor/nach Aktualisierung und nach Seitenneuladen. API HTTP200/successtrue/registeredCommands30/totalExecuted0/totalFailed0/pluginsWithCommands3; UI zeigt gleichzeitig korrekte Gesamtsumme30/aktiviert30/Plugins3 und Erfolgstoast.
- Quelle: tatsächliche gerenderte UI mit DOM-Read und bereinigte lokale API. Keine synthetischen Commands oder echten Live-Commands für diesen Befund ausgeführt; kein gespeicherter Screenshotpfad.
- Reproduzierbarkeit: zweimalige Aktualisierung mit dazwischenliegendem Browserreload, gleiches Ergebnis. Auswirkung: vorhandene Ausführungsstatistik bleibt in der Übersicht unlesbar. Erfolgsquote/Cache/AktiveBenutzer/Ereignisreduktion ebenfalls '-' beobachtet; deren Datenverfügbarkeit in dieser Teilprüfung nicht unabhängig belegt.
- Quellbeleg: ui.html:1840 updateStats setzt nur Gesamt-/aktivierteBefehle/Plugins; stat-executed erscheint im gesamten UI-Quelltext ausschließlich im initialen Markup:1086. Gestützte Ursache: fehlende DOM-Aktualisierung. Nicht behoben.

### P12 tatsächliche GCCE-UI-Teilmatrix
- Registrierte Befehle/Statusabgleich **bestanden** für aktuellen Ausgangszustand30aktiviert/3Plugins; tatsächliche Checkboxanzeigen und Übersicht stimmen nach Laden überein. Kurzzeitiges initiales aktiviert0 vor Commandsload nicht als eigenständiger Bug gewertet.
- Moderator-Berechtigungsfilter **bestanden**: tatsächlicher Select zeigt genau cmdtest/alias/hudclear/rainstop, jeweils moderator. Filter ist keine Durchsetzungsprüfung von Rechten.
- Ausführungskennzahl **Bug bestätigt**019. Überwachungsfläche rendert Liveprotokoll/Cache/RateLimiter/Cooldowns; keine lokalen Schutzschicht-Commands ausgeführt, deshalb Werte0/keinLog kein umfassender Monitoring-Pass.
- Keine Konfiguration gespeichert, kein Cache/Log gelöscht, kein Commandstatus geändert, keine öffentliche Nachricht/Gift, kein Pluginneustart. Rechte-/Cooldown-/Konflikt-Durchsetzung, Persistenz und reale Reconnect-Korrelation bleiben offen.

### P35 Weather Control – gerenderte Steuerzentrale 05.10.2026
- Aktives Profil unmittelbar per begrenzter PowerShell-GET geprüft: test/requiresRestartfalse/Port3000. Neuer Onlinebackup %TEMP%\ltth-audit-20261005-weather-ui.db, gezielter Settingssnapshot0. Erster Node-Netzwerkprozess ohne Output hing vor Sicherung/Aktivierung; gezielt abgebrochen (exit1), kein späterer Enable möglich. Unabhängige lokale GET erfolgreich, danach Sicherung und separate Aktivierung erfolgten erfolgreich. Kein Produktbug aus dem einzelnen Node-Prozesshänger.
- Tatsächliche Browser-UI /weather-control/ui nach Aktivierung **bestanden** als Inventur/Ladeablauf: Konfiguration erfolgreich geladen,13Effekte; Quality low/medium/high/ultra, adaptiveQuality, Chatcommandnamen/-rechte, Follower/Superfan/Subscriber/Teamlevel/Topgifter-Permissions,13Effektkarten mit Intensität/Dauer/Permament/Erweitert/Test.
- Zusätzlicher Umfang gerendert: Vorschau/FPS/Partikel, GamificationMeter/Quest/Streak/Rewardfeed, JSONQuestpool/Rewards, Such-/Kategorie-/Presetsteuerung, Export/Import, Sequenzeditor, Audio, aktiveEffekte, Follow/Share/Subscribe/Like-Meilenstein-Trigger und Giftmappings/Katalog. Kein Settingssave, Audio-/Sequenz-/Gifttrigger, Reset oder öffentlicher Command ausgelöst; Funktionsinventur ist kein Funktionspass dieser Varianten.
- UI-Auffälligkeiten zur weiteren Reproduktion: StudioCopylabel raw common.tiktok_studio.copy_url; vier Presets im Dropdown jeweils doppelt vorhanden; Eventtriggerselects zunächst leer. Einzelne erste Ladebeobachtung noch kein neuer bestätigter Bug.
- Rücksetzung **bestanden**: disable success, gezielte Settingswiederherstellung remainingSettings0, eigener Browser geschlossen. Kein Apprestart, keine Shareddateien oder andere Profile verändert. Persistenz-/Questabschluss-/Belohnungs-/Public-/Lastprüfungen bleiben offen.

## LTTH-LIVE-020 – Weather-Control-Standardpresets werden doppelt angeboten (P3)
- P35/A11,05.10.2026, Profiltest, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Keine Pluginquelländerungen; parallele Änderungen erhalten. Voraussetzungen: Plugin aktiviert, Settingsausgang0, Standardkonfiguration; Testprofilbackup vorhanden.
- Reproduktion:
  1. WeatherControl im Testprofil aktivieren und /weather-control/ui öffnen.
  2. Konfiguration erfolgreich geladen abwarten, Dropdown Effekt-Preset prüfen.
  3. Nach Rücksetzung und erneuter Aktivierung in neuem Browserpanel wiederholen.
- Erwartet: Vier unterschiedliche Standardpresets jeweils einmal angeboten.
- Tatsächlich: acht Optionen; GemütlicherRegen/Boss-Sturm/Winterkälte/Cyber-Glitch jeweils zweimal. Beide unabhängigen UI-Ladevorgänge zeigten dasselbe Ergebnis.
- Quelle: tatsächliche gerenderte UI und read-only DOM-Optionsliste; keine synthetischen Events/Settingssave. Bereinigter Beleg achtOptionen/vierNamen, kein gespeicherter Screenshotpfad. Auswirkung: verwirrende identische Auswahlangebote; abweichende Anwendungsergebnisse nicht getestet.
- Ursache quellenmäßig gestützt: ui.html:2593 hängt config.presets an builtInPresets, main.js:320 liefert bereits dieselben vierStandardpresets. Keine Deduplizierung. Kein Patch.

## LTTH-LIVE-021 – Weather-Control-Studio-Button zeigt Übersetzungsschlüssel (P3)
- P35/A8/A11, gleiche Umgebung/Commit/Testprofil wie020,05.10.2026; keine Quell-/Accountänderung. Voraussetzungen: deutsche UI, WeatherControl aktiv, vollständig geladene Konfiguration.
- Reproduktion:
  1. /weather-control/ui öffnen, Abschnitt Overlay-URL ansehen.
  2. Nach erfolgreichem Laden den StudioCopybutton neben Kopieren lesen.
  3. Nach Deaktivieren/Rücksetzen und erneuter Aktivierung in neuer Browserseite wiederholen.
- Erwartet: verständliche Beschriftung TikTok-Studio-URL kopieren.
- Tatsächlich: sichtbarer Text common.tiktok_studio.copy_url in beiden Ladevorgängen; normale benachbarte Beschriftungen deutsch. A8-Angebot existiert, darf deshalb nicht als fehlender Button gezählt werden. Copyaktion selbst in diesem Test nicht ausgelöst.
- Quelle: tatsächliche gerenderte deutsche UI, AX und DOMtext; kein Live-/synthetisches Event erforderlich. Kein gespeicherter Screenshotpfad. Auswirkung: unverständliche Beschriftung; Funktionsfähigkeit der Kopieraktion daraus nicht ableitbar.
- Quellbeleg: ui.html:936 data-i18n-key common.tiktok_studio.copy_url; app/locales/de.json:759 enthält die deutsche Übersetzung. Hypothese: pluginspezifischer Übersetzungsresolver findet gemeinsame Namespaces nicht und überschreibt den vorhandenen Fallback. Resolverursache nicht abschließend bewiesen, nicht behoben.

### P35 Reproduktionsmatrix / Rücksetzung
- DoppeltePresets **Bug bestätigt**020, StudioLabel **Bug bestätigt**021. Frühere leereEventtrigger-Selects hingegen nach vollständigem Laden nicht reproduziert: vierSelects mit jeweils13Effekten und plausiblen Standardauswahlen; kein Produktbug daraus.
- Plugin nach Test wieder deaktiviert(success), Originalsettings0 wiederhergestellt(remainingSettings0), Browser geschlossen. Kein Reset/Settingssave/öffentlicherCommand/Gift/Tunnel/Apprestart; andereProfile/Shareddateien unverändert. Presetanwendung/Settingspersistenz/Quest-/Reward-/Publicabnahme weiterhin offen.

### P35 Weather-Control-Settings: tatsächlicher Save, Validierung und Pluginpersistenz 05.10.2026
- Profiltest vor Mutationen geprüft, keine Restartanforderung. Aktueller Onlinebackup %TEMP%\ltth-audit-20261005-weather-ui.db und gezielter Originalsettingssnapshot0 vor Aktivierung. Keine Änderungen an anderen Profilen/Gemeinschaftsdateien.
- **bestanden** tatsächlicher gerenderter Save: qualityPreset von high auf medium gewählt und Konfiguration speichern geklickt. UI meldet Konfiguration erfolgreich gespeichert. GET /api/weather/config bestätigt success/qualityPresetmedium; sensible Configfelder nicht ausgegeben.
- **bestanden** Persistenz für diese konkrete Option: Browserreload zeigt medium; anschließend regulär nur WeatherControl deaktiviert/reaktiviert (beide success), Browserreload zeigt erneut medium/Konfiguration erfolgreich geladen. Kein Apprestart, kein allgemeiner Restart-/alleSettings-Pass daraus.
- **bestanden** negativer UI-Validierungsfall: Questpoolfeld auf {invalid gesetzt und Save geklickt. UI meldet konkret gamificationQuestPool contains invalid JSON plus JSON-Parserposition. Nachfolgende API zeigt gespeicherte Qualität weiterhinmedium und Questpool weiterhin4Einträge. Ungültiges JSON wurde für diesen Fall nicht gespeichert; andere Validierungspfade separat offen.
- Keine Testeffekte/Audio/Gifts/öffentlicheCommands/Presetanwendung ausgelöst; Rechte und Accountsettings nicht geändert. UI-Save übermittelt den regulären vollständigen Pluginconfigvertrag mit unveränderten übrigen Standardfeldern. Echte zwischenzeitliche Gamificationereignisse nicht als kontrollierte Quest-/Rewardabnahme gewertet.
- Rücksetzung **bestanden**: WeatherControl wieder deaktiviert(success), Originalsettings0 gezielt wiederhergestellt(remainingSettings0), eigener Browser geschlossen. Pluginpersistenz/Save/JSONfehlerfall nun mit tatsächlicher UI und API belegt; weitere Qualitätsmodi/Rendering/Questabschluss/Reward/Eventkorrelation/Public/Last bleiben offen.

### A2/A3 echter Live-Empfang 05.10.2026 07:54 Europe/Vienna
- Aktueller aktiver Profilstatus test/requiresRestartfalse/Port3000; /api/status connectedtrue/usernamewahanfx/restartingfalse. Passive lokale Socketverbindung, keine ausgehenden TikTok-Aktionen oder Konfigurationsänderungen.
- Konkretes45Sekundenfenster 2026-10-05T05:54:09.550Z–05:54:54.565Z: normalisierte tiktok:event49 = join27/like19/gift3. Stats83/Status84Updates. Regelmäßiger Live-Empfang in diesem Fenster **bestanden**; kein Nachweis von Reconnect-/Stream-Ende-Verhalten.
- Pluginweiterleitung im selben Fenster beobachtet: Clarityjoin27/like6/treasure3, EmojiRainheartballoons19/spawn22, ViewerXPupdate1997/levelup29, TopTierupdate30/rankchange6/decay8, Milestoneuserstats3/stats3/Leaderboard3, Dashboardwidget80. AusschließlichZähler gespeichert, keine Viewerpayloads/Identitäten. Updateanzahl allein beweist weder korrekte XP-Berechnung noch Eventduplikation oder vollständige einzelne sichtbare Reaktion; diese Bereiche separat offen.
- TikTok-URL https://www.tiktok.com/@wahanfx/live erneut im vorhandenen Browser geprüft: WAHAN/Vieweranzeige3 und Chat-/Gift-/Joinbereich vorhanden; Loginmodal geschlossen, Vollerlebnis-Anmeldehinweis bleibt und keinVideoelement. Aktuelle Videoabnahme dadurch eingeschränkt. Keine Anmeldung/Follow/Chat/Gifts ausgelöst. Connectorfenster liefert unabhängig aktuelle realeEreignisse; altes DOMchatmaterial nicht diesem45Sekundenfenster zugeordnet.
- Chat/Follows/Shares/Abos/bezahltbestätigteSuperfans und Giftserienabschluss **nicht beobachtet** in diesemFenster. DreiGifts ohne gesonderte Payload-/Serienkorrelation sind keine bestandene Serienabschlussprüfung. PassiveSockets sauber disconnected, Prozessexit0. Kein Tunnel/Pluginstatus/Profilalias verändert.

### A3 Live-Badge-/Giftserienfelder 05.10.2026 07:55–07:56 Europe/Vienna
- Profilguardtest,45Sekunden passive Socketbeobachtung 05:55:52.025Z–05:56:37.039Z: join20/like19/gift1/chat1. Nur anonyme Summen und Feldnamen, keine Vieweridentitäten persistiert. Prozess exit0/Socket disconnected.
- Normalisierte Felder tatsächlich beobachtet: isSubscriber/teamMemberLevel; isSubscriberfalse41, teamMemberLevelzero38/positive3; isModeratorfalse40/true1. Keine bezahlte Super-Fan-Bestätigung und kein isSuperFan-Feld beobachtet. Normalisierte Clientoberfläche ist nicht der rohe Eulerstream-Transport; ursprüngliche Rohpayloadfelder hier nicht separat aufgenommen.
- Ein Gift giftType1, repeatCount>1Count0; weder striktboolesches repeatEndtrue noch false im beobachteten Datenobjekt. Keine im Fenster korrelierte Pending->End-Serie. Fehlende Boolwerte können fehlende/anderscodierte Felder bedeuten; daraus kein neuer Produktbug oder Serienabschluss-Pass. Echte Serienabschlussprüfung **nicht beobachtet**.
- Quellvergleich extractUserData projiziert Teamlevel aus expliziten/Fansclub-/Fansbadges und Moderator-/Subscriberidentity, jedoch keine separat bestätigte bezahlteSuperfanidentität. Positiver Teamlevel darf in der Matrix nicht als bestätigter bezahlterSuperfan gelten. Reconnect-/UIbadge-/pluginübergreifendeIdentitätsabnahme weiterhin offen.

## LTTH-LIVE-022 – Weather-Rechte verwechseln Giftanzahl/Teamlevel mit Superfans und Abonnenten (P2)
- A3/P35,05.10.2026, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Kein Pluginpatch, keine Runtime-/Profildatenänderung; parallele Arbeiten erhalten. Testquelle ausdrücklich isolierte synthetische Daten, keine behauptete Fehlklassifikation eines echten Viewers.
- Voraussetzungen: tatsächliche UI bietet getrennte Optionen Top-Fans(allowSuperfans), Abonnenten(allowSubscribers) und Teammitglieder. Isolierte Instanz der unveränderten WeatherControl-Klasse; checkUserPermission nutzt künstlichen GCCEdbUser-Kontext. Kein APIinit/DBzugriff/Livetrigger.
- Reproduktion:
  1. Rechte aktiviert/allowAllfalse; nur Gruppe superfans aktiv, alle übrigen Gruppen/Topgifter/Minpoints/Whitelist aus.
  2. User mit gifts_sent50,team_member_level0,isSuperFanfalse,isSubscriberfalse prüfen.
  3. Kontrolluser gifts_sent49/teamlevel0 prüfen.
  4. Separat nur Gruppe subscribers aktiv; User team_member_level1/isSubscriberfalse prüfen; Teamlevel0 als Kontrolle.
- Erwartet: Ausschließlich bestätigter Gruppenstatus berechtigt; normale Gifts/Teammitgliedschaft beweisen weder bezahlteSuperfan- noch Subscriberzugehörigkeit.
- Tatsächlich: Superfangruppe erlaubt50Gifts trotz fehlendem Superfanstatus, Kontrolle49verweigert. Subscribergruppe erlaubtTeamlevel1 trotz isSubscriberfalse, Kontrolle0verweigert. Alle vier aktuellen Methodenergebnisse unabhängig ausgeführt, ohne Effekte/öffentliche Commands.
- Bereinigte Belege: superfans{paidSuperfanfalse,subscriberfalse,teamLevel0,giftCount50,allowedtrue,controlAllowedfalse}; subscribers{paidSuperfanfalse,subscriberfalse,teamLevel1,allowedtrue,controlAllowedfalse}. Kein gespeicherter Screenshotpfad; UI-Angebot zuvor tatsächlich gerendert belegt.
- Ursache aus aktuellem Code direkt gestützt: main.js:1627–1635 prüft superfans ausschließlich gifts_sent>=50 und subscribers ausschließlich team_member_level>0; relevante boolesche Identitätsfelder werden nicht geprüft. Auswirkung: für diese Gruppen vorgesehene Wetterrechte sind für andere Viewer erreichbar. Keine Aussage über konkrete echte Viewer oder andere Plugins ohne eigene Prüfung.
- Wiederherstellung: keine persistenten Testdaten oder Aktivierung dieser isolierten Instanz, kein Wiederherstellungsbedarf. WeatherControl bleibt nach letzter bestätigter Rücksetzung deaktiviert; kein Apprestart/Accountchange/Chat/Gift.

### A3 Präzisierung Giftabschlussvertrag / korrigierte Live-Beobachtung 05.10.2026
- Aktueller Quellvertrag EulerstreamAdapter.js:1535–1580: RunningStreaks werden nicht als gift an Plugins broadcastet; eventData trägt isStreakEnd, nicht repeatEnd. Frühere Observer-Counts für repeatEnd sind daher ausschließlich fehlendeFelder im Clientvertrag und kein Hinweis auf defekte Normalisierung. Pending->End-Korrelation kann mit dieser ausschließlichfinalenClientoberfläche nicht vollständig belegt werden; roherConnectorpfad bleibt separat offen.
- Korrigiertes45Sekundenfenster 05:57:43.991Z–05:58:29.005Z, aktives Profiltest ohne Restartbedarf: like24/join24/gift1. Dieses tatsächliche giftType1-Ereignis trägt isStreakEndtrue; repeatCount>1Count0. Lokaler Clientabschlussmarker **bestanden** für ein echtes abgeschlossenes Einzelgift, keine beobachtete Mehrfachserie.
- Tatsächlicher Wertvertrag für dasselbe Gift: coins===diamondCount*repeatCount, Checks1/Mismatches0. Basiswertnormalisierung **bestanden** für diesen einzelnen echtenPayload. Geschenkname/Identität/Werte nicht exportiert, nur Prüfzählung. Keine vollständige Statistik-/Pluginreward-/Serien-Deduplikationsabnahme daraus.
- Teamfelder im korrigiertenFenster isSubscriberfalse49/teamlevelzero40/positive9/moderatorfalse49; kein bezahlterSuperfanstatus bestätigt. Keine künstliche Eventinjektion/öffentlicheAktion. PassiveSocket disconnected/Prozess exit0, keine Plugin-/Profil-/Tunneländerung.
- Ergänzende RepeatCount-Regressionssuite **bestanden**: dreiTests amountFallback/multicoinDivision/nestedRepeatCount. Isolierte künstliche Payloads; Suite prüft extractGiftData und nicht den vollständigen Running->End-/Deduplikations-/Live-Pluginpfad. TalkingHeads weder getestet noch verändert.

### A2/A4 tatsächliches Dashboard-Disconnect/Reconnect 05.10.2026 ca.08:00–08:02 Europe/Vienna
- Vorher aktuelleAPI geprüft: profiletest/requiresRestartfalse/connectedtrue/usernamewahanfx; wahanfx ausdrücklichAliasdesaktivenTestprofils. Keine neueAlias-/Profilanlage, Accountänderung oder Restartaktion nötig.
- **bestanden** echte UI-Trennung: Disconnectbutton geklickt; DashboardDisconnected,Connectenabled,Disconnectdisabled. NachfolgendeAPI connectedfalse/usernamenull, profiletest/requiresRestartfalse. RegulärerDisconnectschritt abgeschlossen, keine öffentlicheNachricht/Gift.
- Wiederverbindung über tatsächlicheUI gestartet: usernamewahanfx gesetzt und Connecteinmalgeklickt. Dashboard zeigt Connecting.../Connectdisabled/Disconnectdisabled, StatusDisconnected. Wiederholte reineStatusabfragen bleiben connectedfalse/usernamenull; kein Fehlertoast/-Dialog in geprüfterUI. Kein zweiterConnect/keinApprestart ausgelöst; ursprünglicherUI-Versuch weiterhin ausstehend, nicht als terminaler Fehlschlag interpretiert.
- Verifizierte passive45Sekundenbeobachtung des ausstehendenVersuchs 06:01:19.279Z–06:02:04.283Z: initstate1/tiktokstatus1/dashboardwidget88/toptierdecay8/update8, keine tiktok:event. Prozess exit0/Socket disconnected. Wiederaufnahme echterEvents in diesemFenster **nicht beobachtet**; Widget-/Decayupdates sind kein Beleg einerTikTokverbindung.
- LetzteAPIweiterhintest/requiresRestartfalse/serverRestartfalse/connectedfalse. Wichtig: Ausgangs-Liveverbindung aktuell noch nicht wiederhergestellt; laufenden ursprünglichenDashboardrequest weiter diagnostizieren/beobachten. Keine vollständige A2Reconnect-/Listener-/Staledataabnahme und kein neuer bestätigterProduktbug allein aus diesem begrenztenFenster. Alle Pluginsettings unverändert.

### A2 Reconnect-Nachprüfung und terminaler Backendzustand 05.10.2026
- Ursprüngliches Dashboardrequest weiterhin Connecting... ohneDialog, Backenddisconnected. Danach bewusster regulärer API-Disconnect(success) zur Cancellation; kein bloßer Timeout als Prozessabschluss angenommen. Dashboardreload nach Cancellation zeigt Getrennt/Verbindenenabled. Kein Apprestart.
- Kontrollierter API-Connect zum nochmals verifizierten Testprofilaliaswahanfx: HTTP428. Aktueller Code verlangt nach manuellemDisconnect erneut fallbackKeyConfirmed. Regulärer Consentparameter im autorisierten Live-Test verwendet; folgende APIantwortHTTP409. Code409 steht im aktuellenAdapter für superseded; Antwort allein kein erfolgreicherConnect.
- Anschließender read-only /api/connection-health liefert statusoffline/connectionStateoffline/isConnectedfalse/retryAllowedAtnull. Damit terminalerOfflinezustand des Backends jetzt tatsächlich festgestellt; nicht mehr ausschließlich aus UI-/Beobachtungstimeout abgeleitet. Zwischenzeitliches usernamewahanfx bei connectedfalse ist keinLivebeweis.
- Wiederverbindung zum bisherigenStream aktuell **blockiert** durch gemeldetenOfflinezustand; Streamende auf TikTokseite noch separat zu verifizieren. Kein Produktbug allein aus Offlineantwort. Frühere ursprünglicheUI-Anfrage blieb ohne verständliche Fehlermeldung; weiterer unabhängiger UI-Abgleich/Normalreproduktion nötig, bevor daraus neueBugID entsteht.
- Profiltest und keinRestartbedarf verifiziert; keineAlias-/Account-/Aboänderung, kein öffentlicherChat/Gift, keinePluginsettings verändert. Live-Ausgangsverbindung noch nicht wiederhergestellt. NächsterSchritt: aktuellen öffentlichenStream verifizieren, nötigenfalls neuen geeignetenStream mit Testprofilalias anbinden; keine Verbindung zu fremdemProfil ohneAliasguard.

### A2/A3 Streamende verifiziert und Liveverbindung wiederhergestellt 05.10.2026 08:05–08:07 Europe/Vienna
- BisherigeTikTokseite https://www.tiktok.com/@wahanfx/live bewusstreload, danach tatsächlichesDOM LIVE ist zu Ende44Zuschauer*innen. Damit frühereBackendoffline-Antwort unabhängig durch aktuelleTikTokseite bestätigt. Seitentitel blieb istLIVE und wäre allein kein geeigneterBeweis gewesen. Streamende auf Plattform **bestanden** als Beobachtung, automatischeLTTH-Erkennung vor manuellemDisconnect nicht lückenlos belegt.
- NeuerStream über tatsächlich sichtbarenTikTok-Vorschlagslink gewählt: https://www.tiktok.com/@danutlungu151/live (LunguDanut). GerenderteVieweranzeige etwa56, mehrereChatnachrichten, Teamherzgiftx1 und Likeaktivität sichtbar. KeineöffentlicheInteraktion oder Anmeldung ausgelöst. RealeAktivität vor LTTHconnect verifiziert.
- Guardtest/requiresRestartfalse; aktuellerAliasbestand geprüft. Aliasdanutlungu151 vorhernichtvorhanden, ausschließlichimTestprofil als nichtprimärerAlias mit Auditlabel temporärangelegt. BeimGoalende gezieltentfernen, zusammenmit eigenen zuvorangelegten sabrinasammer/wahanfx-Aliassen; bestehendeAliaseserhalten. KeineandereProfiländerung/Apprestart.
- RegulärerConnect mit bestätigtemFallbackconsent: success/statuslive_identity_pending/profileSwitchedfalse. UnabhängigesBackendstatus connectedtrue/usernamedanutlungu151; ConnectionHealthstatushealthy/connectionStatelive/isConnectedtrue, Profiltest/requiresRestartfalse. TatsächlichesDashboardVerbunden/Connectdisabled/Disconnectenabled. Liveverbindung damit wiederhergestellt, nichtbloßausHTTPsuccessabgeleitet.
- Konkretes45Sekundenfenster 06:06:23.461Z–06:07:08.478Z: normalisiertlike40/join11/chat5/gift6 (gesamt62). TatsächlicherneuerLiveempfang **bestanden**. Stats109Updates. PassiveSocket disconnected/Prozess exit0.
- Pluginupdates imselbenFenster: Clarityjoin11/chat5/like8/treasure4/gift2; Emojiheartballoons40/spawn46; ViewerXPupdate28/levelup12; TopTierupdate42/rankchange25/newleader4/decay7; Milestonestats6/Leaderboard6; Dashboardwidget85. AnonymeZählerohneViewerpayloads. UnterschiedlicheEventkanäle/ThrottlingkeineautomatischeDuplikationsdiagnose; einzelne sichtbare/hörbareReaktionen, staleViewerinhalteundListenerzählungnochseparatzuprüfen.
- Mindestmatrixaktualisierung: Trennen **bestanden** (vorigerAbschnitt), regulärerConnectzuverifiziertemneuemStream **bestanden**, Testprofilbeibehaltung **bestanden**, neuerLike/Join/Chat/Giftempfang **bestanden** fürFenster. AutomatischerReconnect/FehlerdialogdesursprünglichenUIrequests/Serienvollständigkeit/Sub/Superfan/Statsresetnoch offen. KeineProduktpatches oder TalkingHeads-Tests.

## LTTH-LIVE-023 – ClarityHUD zeigt bei newestTop die ältesten statt neuesten Ereignisse (P2)
- A2/A4/P5,05.10.2026 ca.08:09Europe/Vienna, Profiltest/Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. KeineClarityquell-/Configänderung, paralleleArbeiten erhalten. EchteLivequelle danutlungu151 nach verifiziertemStreamwechsel.
- Voraussetzungen: aktuellerSettingsvertrag layoutModesingleStream/feedDirectionnewestTop/useVirtualScrollingtrue/maxLines10; alleChat/Like/Gift/Follow/Share/Joinfiltertrue. AktuelleEventqueues enthaltenChat10/Like10/Gift10/Treasure10/Join10/Follow3.
- Reproduktion:
  1. Mit aktivem echtenStream /overlay/clarity/full in tatsächlichemBrowser öffnen.
  2. Zehn sichtbareEinträge und deren anonyme data-event-id-Zeitstempel prüfen.
  3. Aktuelle /api/clarityhud/state/full-Zeitstempel read-only vergleichen, keineViewerinhalteausgeben.
  4. Browserseite neu laden und denselben Vergleich wiederholen.
- Erwartet: newestTop begrenzt auf die zehn neuesten Ereignisse und stellt neueLiveereignisse oben dar.
- Tatsächlich: DOM zeigt aufsteigend die altenZeitstempel1791175254091 bis1791179475018 (Follow/Gifts) statt aktuellerChat/Like/Joinwerte um179118054xxxx. Reload zeigt dieselben zehnZeitstempel; lediglich lokaleEventcounter ändernsich. KeineLoadinganzeige, zehnEinträge dauerhaftgerendert. AlteEreignisse aus vorherigemStream dominieren wegen falscherAuswahl; daraus kein zusätzlicher pauschalerQueue-Cleanup-Bug abgeleitet.
- Quelle: tatsächlicheBrowserdarstellung/DOM, echteempfangeneEvents, Settings-/State-API. Belege ausschließlich Typ/Zeitstempel undZähler, keineVieweridentitäten/Chats exportiert; kein gespeicherterScreenshotpfad. ZweiBrowserladezustände reproduziert.
- Quellursache gestützt: full.js:553 prüft feedDirection==='top'; aktiverVertrag liefert newestTop. Elsezweig sortiert aufsteigend und .slice(0,maxLines) nimmt ältesteEinträge. AuchincrementellerPfad prüft 'top'; mitVirtualScrolling wird rendererneutaufgerufen. KeineProduktänderung.
- Auswirkung: Livefeed kann trotz erfolgreichemEventempfang veraltet wirken und aktuelleEvents verdrängen; nachStreamwechsel weiterhin alteViewerinhalte sichtbar. Sortier-/Begrenzungsprüfung **Bug bestätigt**; übrigeLayouts/öffentlicheQuelle/Assets/Reconnect-Varianten separat offen.
- Wiederherstellung: reineRead-only-Prüfung, keineSettings-/Plugin-/Profiländerung; LiveverbindungundTemporäraliasesbestehenfürweitereTestsfort.

## LTTH-LIVE-024 – Clarity-Chat-HUD verliert initiale Historie bei VirtualScroller-Neuinitialisierung (P2)
- A4/P5,05.10.2026, Profiltest/Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, realerStreamdanutlungu151. KeineQuell-/Settingsänderung, paralleleArbeiten erhalten.
- Voraussetzungen: separates /overlay/clarity/chat, useVirtualScrollingtrue/maxLines10; GET /api/clarityhud/state/chat liefert success/events.chat.length10.
- Reproduktion:
  1. Chat-HUD im tatsächlichenBrowser öffnen, Initialisierung abwarten.
  2. AktuelleAPIqueueanzahl read-only prüfen und gerenderte .chat-message zählen.
  3. Neue echteChats abwarten (hier zwei sichtbareMessageelemente beobachtet).
  4. Browserreload durchführen und Readyzustand/Messageanzahl erneut prüfen.
- Erwartet: VorhandeneBackendhistorie beimÖffnen/Reload sichtbar; neueChats ergänzen sie.
- Tatsächlich: initialReady/Socketconnected/VirtualScroller1 aberMessageanzahl0 beiAPIhistory10. Später echteMessageelemente2 (damitLive-Renderinggrundsätzlichvorhanden); nachReload wiederReady/Scroller1/Messageanzahl0. KeineBrowsererror-/warnlogs in abgefragterSitzung. Historie wird in sichtbarerAnsicht verworfen; keineBackenddatenlöschung behauptet.
- Quelle: tatsächlicheBrowser-UI/DOM, echtesLivechatfenster, anonymeAPIzählung. KeineViewer-/Chatinhalteexportiert, kein gespeicherterScreenshotpfad. ZweiInitialisierungen reproduziert. LiveempfangundHistoryabnahme striktgetrennt.
- Quellursache gestützt: chat.js applySettings initialisiertVirtualScrolling; _initOnce lädt danachHistory überaddMessage in denScroller und ruft anschließend erneutinitializeVirtualScrolling auf. Diese zerstört denvorhandenenScroller und erzeugt einenneuen mit leerenitems, ohne vorhandene STATE.messages wieder einzufügen. KeinPatch.
- Auswirkung: frischgeöffnete/neuverbundeneChatquelle bleibt bis neuenChats leer und zeigt vorhandenenVerlauf nicht. Historyinitialisierung **Bug bestätigt**, einzelne neueLivechatdarstellung **bestanden** fürbeobachtetezweiElemente; Reihenfolge/Inhalt/Badges/Last/Public/alleReconnectpfadeweiteroffen.
- KeinePlugin-/Profil-/Account-/Tunneländerung; eigeneBrowserprüfunganschließendgeschlossen. LiveverbindungundtemporäreAliasesfürweiterenTestumfangerhalten.

### A8/P5 öffentliche Clarity-Chatquelle tatsächlich erreichbar 05.10.2026
- Profilguardtest/requiresRestartfalse; regulärer temporärerTunnelensure success/reusedfalse/publicURL https://workers-explorer-cats-material.trycloudflare.com/overlay/clarity/chat. TatsächlicheröffentlicherBrowser lädt ClarityHUD-Chatseite undVirtualScroller. Damit Erreichbarkeit **bestanden** für diese frischeAdresse imBrowser; frühereNodeENOTFOUND-Ergebnisse bleiben spezifischeDNS-/Clientblocker, kein allgemeineröffentlicherAusfallbeweis.
- InitialMessageanzahl0 beiScroller1; späterohneReload/synthetischeInjektion sieben echtegerenderte .chat-message mit monotonen anonymenIDs/Zeitstempeln1791180760463–1791180798746. ÖffentlicheLivechataktualisierung **bestanden** für diese siebenNachrichten. KeineViewer-/Chatinhalteexportiert. Historyinitialisierung weiterhinBug024; vollständigeInhalts-/Badge-/Reihenfolgenabnahme dadurchnichtautomatischbestanden.
- ÖffentlicherBrowsererror: Failed to load translations for de; Debugstatus/-socket zeigen unsubstituierte Status:{status}/Socket:{status}. Bestätigtweiterhinöffentlichei18n-Einschränkung009, keinepauschaleAssetabnahme. WesentlicheRenderer-/Socketassetswerdenaus tatsächlichemLivechatnachweisgestützt, nichtallebenötigtenVarianten.
- VerwaltungsGET /api/plugins imBrowserwurdeclientseitig ERR_BLOCKED_BY_CLIENT verhindert; keinBackendHTTPstatus darausableitbar. AnschließendeexpliziteHTTP-Statusprüfung /api/plugins und /dashboard.html von automatischerFreigabeprüfung vorAusführungabgelehnt: möglicherExportprivaterPlugin-/DashboardpayloadsdurchdenöffentlichenCloudflarehost, bisherigeOverlayfreigabe nachReviewinterpretationnichtausreichend. KeinUmgehungsversuch; spezifischeNutzerfreigabeperFrageangefordert, dynamischeVerwaltungsGET-PrüfungbisAntwort **blockiert**. ÖffentlichePOST-Prüfungbleibtebenfallsnichtausgeführt.
- EigenerTunnel regulärstop success, beideeigenenPrüftabsgeschlossen. KeinePlugin-/Profile-/Accountänderung/Apprestart/öffentlicheChataktion. Liveempfangdanutlungu151 bleibtfürweitereTests bestehen. URL-Neustart/Abbruchfehleranzeige/allevierClarityöffentlichenLayoutsweiteroffen.

### A8 Verwaltungs-GET-Freigabe und erneuter tatsächlicher Versuch
- Nutzer hat die beiden öffentlichenGETs /api/plugins und /dashboard.html über den temporärenCloudflaretunnel ausdrücklichfreigegeben. FrühereAutoReview-Autorisierungsblockade für dieseGETs damitgelöst; kein weitererConsentangefordert. ÖffentlichesPOST-Verwaltungsprobing istdadurchnichtalsausgeführt/bestandenanzusehen.
- NeuerTunnel parking-dublin-flags-bench.trycloudflare.com startet success. Beide explizitfreigegebenenGETs über tatsächlichesHTTPS aufgerufen; PowerShell erhält jeweils keineHTTPresponse(Statusintern0, nichtalsHTTP0interpretieren). Weder404nochAdminpayloadausgabe nachgewiesen. DynamischerGET-Zugriffsschutz bleibt wegenTransport-/DNS-/Clientumgebung **blockiert**, trotzjetztvorliegenderAutorisierung. KeineprivatePayloadpersistiert.
- Finallystop success; eigenerTunnelwiederbeendet. KeineApp-/Profil-/Plugin-/Accountmutation außertemporäremTunnel-Lifecycle. FrühereöffentlicheClaritychatdarstellungmitsiebenLiveupdatesbleibtgültig; keineAbleitungöffentlicherAdminfreigabeauserfolgreichemOverlayzugriff.

### P5 Clarity-Stream-Overlay: Ticker und lokaler Gift-Highlighttest, 05.10.2026
- Umgebung: HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Profil test, Liveverbindung danutlungu151, Browserquelle /overlay/clarity/stream. Keine Einstellungen geändert, parallele Talking-Heads-Dateien unberührt.
- showChat/showLikes/showJoins false; showGifts/showFollows/showShares/showSubs true; tickerEnabled false. Acht DOM-Slots. Ticker display:flex, aber ohne active-Klasse und berechnete opacity:0. Deaktivierter Ticker **bestanden**; DOM/Accessibility-Existenz allein ist kein sichtbarer Tickerfehler.
- Echtes passives Fenster 06:18:36.296Z–06:19:21.316Z: 33 Likes, sieben Joins, sieben Chats; Clarity sieben Joins, sechs Like-Aggregate, sieben Chats. Keine Gifts/Follows/Shares/Abos. Zwei DOM-Stichproben ohne Karten passen zu ausgeschalteten Ereignisarten; echte Gift-/Follow-/Abo-Karten **nicht beobachtet**, kein Fehler aus Kartenanzahl0 abgeleitet.
- Reguläre lokale POST-Testfunktion /api/clarityhud/test/stream, type:gift nach Profilguard: success true 06:20:07.476Z. DOM 06:20:13.500Z: eine highlight-card type-gift glow-pulse in slot-top-center; ausdrücklich synthetischer Testviewer GenerousGifter, Rose x5, Coins250. Lokale Gift-Highlightdarstellung für diesen Payload **bestanden**; kein Nachweis echter Gifts/Serien oder öffentlicher Stream-Quelle. Browsererror-/warnabfrage leer.
- Vorheriger type:follow-Test success true, aber DOM erst nach möglichem sieben Sekunden TTL geprüft; keine Karte erfasst. Follow-Darstellung **nicht beobachtet**, kein Produktbug abgeleitet.
- Beide Testereignisse können in Claritys flüchtiger Historie verbleiben; kein pauschales Löschen der gemeinsamen Historie. Keine persistente Konfigurationsänderung, öffentliche Chat-/Giftaktion oder Apprestart. Kartenbereinigung nach TTL separat prüfen. Weitere Slots/Größen/aktiver Ticker/Reconnect/öffentliche Stream-Quelle bleiben offen.
- Nachprüfung 06:20:42.810Z: Kartenanzahl0, Tickeropacity0. Zeitbegrenzte Bereinigung der beobachteten synthetischen Giftkarte **bestanden**; eigener Stream-Prüftab geschlossen.

### P5 Clarity-Mehrstream-Ansicht und Eingabevalidierung, 05.10.2026
- Profil test/requiresRestartfalse, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. GET /api/clarityhud/settings/multi liefert success/settings-Wrapper: enabled false, layout mixed, drei konfigurierte Slots und null enabledStreams. GET /api/clarityhud/multi/status success true; alle drei Slots status disabled. Keine zusätzlichen externen Connectoren aktiviert.
- Tatsächlicher Browser /overlay/clarity/multi meldet Ready/Connected/Übertragungen0. Reguläre lokale Testfunktion POST /api/clarityhud/test/multi {} success true 06:21:43.500Z. Danach zwei sichtbare chat-message style-stripe primary-stream visible: synthetisches MultiTestUser-Chat und synthetisches MultiTestGifter-Gift Rose x3. Lokale Testdarstellung **bestanden**, keine echte Mehrstream-/Giftserienabnahme. Giftzusatz zeigt 1 Diamant (Payload enthält diamondCount1 pro Gift und coins3); ohne geklärte Anforderung kein Fehler über Gesamtwert behauptet.
- Reload: wieder Ready/Connected/Übertragungen0, messages0. Frühere synthetische Nachrichten nicht erneut angezeigt; History-/Reconnectwiederherstellung nicht bestanden behauptet. Keine Browsererror-/warnlogs in abgefragter Sitzung.
- Vier tatsächliche Einstellungen-POSTs wurden jeweils HTTP400 abgewiesen: streams[0].enabled als String, username als vollständige TikTok-URL, displayName mit Winkelklammern, ungültige accentColor. Einstellungen vorher/nachher vollständig verglichen: unverändert. Validierung für diese vier Fehlerfälle **bestanden**. Nur begrenzte API-Prüfung, keine gerenderte Formularvalidierung daraus abgeleitet.
- Wiederherstellungspunkt der gelesenen Multi-Einstellungen: temporäre Datei ltth-clarity-multi-20261005-before.json im Betriebssystem-TEMP-Verzeichnis, nicht ins Repository übernommen. Keine gültigen Settings-POSTs, keine Änderung anderer Profile/Plugin-Lifecycle/Apprestart/Tunnel. Zwei zusätzliche synthetische Multi-Ereignisse können in flüchtiger Clarity-Historie verbleiben; keine gemeinsame Historie gelöscht.
- Offen: tatsächliche Verbindung zusätzlicher Streams, Quellfarben/-Badges und Zuordnung, alternative Layouts/Spalten, eigener Reconnect/Fehlerstatus/Last, Verlauf, öffentliche Mehrstream-URL. Eigener Mehrstream-Prüftab geschlossen; bestehende primäre Liveverbindung bleibt erhalten.

## LTTH-LIVE-025 – Clarity-Zusatzconnector sendet auf globalen Hauptstream-Kanälen ohne Quellkennung (P1)
- Bereich: P5 Mehrstream-Ansicht, A2/A4 Streamzuordnung. HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026 Windows/bundled Node22.14.0. Clarity-/Connector-/Dashboardquellen unverändert; parallele Talking-Heads-/TTS-Änderungen bleiben unberührt.
- Voraussetzung: Clarity connectMultiStream erstellt TikTokConnector mit demselben api.getSocketIO() und api.getDatabase() wie die Hauptinstanz. Für die sichere Reproduktion wurden ausschließlich FakeIO und FakeDB verwendet; keine echte Zusatzquelle aktiviert.
- Reproduktion:
  1. Tatsächliche Klassen TikTokConnector und ClarityHUDBackend aus dem Checkout laden; IO-emit in einer temporären In-Memory-Liste aufzeichnen, Datenbankmethoden durch Noops ersetzen.
  2. Chatlistener der Zusatzinstanz wie in connectMultiStream an handleMultiStreamChat mit sourceId stream1 binden.
  3. Ein ausdrücklich synthetisches AUDIT-Chatereignis über die echte Adaptermethode handleEvent verarbeiten.
  4. Zusatzadapter broadcastStatus und broadcastStats aufrufen.
- Erwartet: Zusätzliche Quelle aktualisiert ihre gekennzeichnete Clarity-Ansicht und überschreibt nicht ununterscheidbar globale Hauptstream-Events/-Status/-Statistik.
- Tatsächlich: clarityhud:multi:chat enthält sourceId stream1; zusätzlich tiktok:event(type chat), tiktok:status und tiktok:stats ohne sourceId. Dashboard.js:577–593 nimmt diese drei globalen Kanäle ohne Quellfilter direkt für updateConnectionStatus/updateStats/addEventToLog an.
- Belege: temporärer Harness ltth-clarity-secondary-isolated.js, exit0; bereinigte Ausgabe vier Kanalnamen mit sourceId stream1/null/null/null; realNetwork false, realDatabase false. Reproduktion nutzt echte Source-Methoden und synthetische Daten; **kein tatsächlich verunreinigtes Dashboard oder reales Zusatzstream-Ereignis behauptet**.
- Quellbezug: clarityhud/backend/api.js connectMultiStream ca.1140–1185; EulerstreamAdapter.js handleEvent/broadcastStatus/broadcastStats ca.3074–3120. Zusätzlich gemeinsamer DB-saveStreamStats-Aufruf in _persistStreamStats; tatsächliche Überschreibung von Datenbankstatistiken hier nicht reproduziert.
- Reproduzierbarkeit: isolierter aktueller Methodenpfad reproduziert, **Bug bestätigt auf Source-/isolierter Integrationsebene**. Auswirkung: fehlende Isolation macht gemischte Hauptstream-Anzeigen möglich; reale Reichweite/sekundäre Pluginwirkungen weiter nicht bewiesen. Kein Patch, keine echte Zusatzverbindung zur Risikovermeidung; entsprechende Live-Abnahme durch diesen Produktbefund blockiert.

## LTTH-LIVE-026 – Clarity-Mehrstream-Verbindung kann Fallback-Key-Bestätigung nicht weiterreichen (P2)
- Bereich: P5 Zusatzstream-Verbindung/Fehlerbehandlung. Derselbe Commit/Umgebung wie025. Voraussetzung: Connector verwendet Fallback-Key statt benutzerdefiniertem Key. Keine vertrauliche Konfiguration ausgelesen; isolierter FakeDB-Fall mit getSetting null.
- Reproduktion:
  1. Echten ClarityHUDBackend mit FakeDB/FakeIO und Noop-Logger erstellen.
  2. Nur in dieser isolierten Instanz multi.enabled true, Slot0 enabled true mit synthetischem Handle AUDITSecondary; reconnectMaxAttempts0.
  3. Echte Methode connectMultiStream(0,0) aufrufen. Sie erstellt den echten TikTokConnector und ruft connect(username) ohne Optionen auf.
- Erwartet: Erforderliche Zustimmung zur Fallback-Key-Nutzung muss im Mehrstream-Ablauf angeboten und nach Bestätigung an den Connector weitergegeben werden; keine stillschweigende Umgehung der Zustimmung.
- Tatsächlich: EulerstreamAdapter.connect verweigert vor Netzaufbau mit fallback_confirmation_required/HTTP-Semantik428. Clarity fängt den Fehler als allgemeinen Verbindungsfehler, isolierter Status failed, confirmationRequired true, registeredConnectors0. Bei Standardretries wird derselbe fehlende Optionspfad erneut verwendet. Clarity-UI main.js zeigt lastError als Text; kein spezifischer Bestätigungs-/Optionspfad im geprüften Mehrstream-Code.
- Belege: ltth-clarity-secondary-isolated.js exit0, bereinigte Ausgabe failed/true/0; kein Netzaufruf/keine echte DB. Quellbezug backend/api.js await connector.connect(streamConfig.username) und scheduleMultiStreamReconnect; EulerstreamAdapter.js:414–425 prüft options.fallbackKeyConfirmed.
- Quelle: isolierte echte Klassen mit synthetischem Handle/FakeDB. **Bug bestätigt für diesen Fallback-Konfigurationsfall**; kein realer Zusatzstream-Verbindungsversuch und keine aktuelle individuelle Key-Konfiguration behauptet. Eigener Key/realer Zusatzstream/Reconnect weiterhin nicht getestet.
- Wiederherstellung: keine App-Einstellungen geändert; isolierte Timer/Connectorliste über disconnectMultiStreams bereinigt. Keine Profile, produktiven Daten, Talking Heads, öffentliche Chat-/Giftaktionen oder Apprestart verändert.

### P5 Clarity-Profil-Export und Importvalidierung, 05.10.2026
- Profil test/requiresRestartfalse. Tatsächlicher GET /api/clarityhud/profile/export success true, plugin clarityhud/version1.1.0, vier Docks, null benutzerdefinierte Presets. Sicherung als ltth-clarity-profile-20261005-before.json im Betriebssystem-TEMP-Verzeichnis; keine vollständigen Settings im Bericht/Repository.
- Tatsächliche negative Import-POSTs: falsche Plugin-ID, settings als Array, unbekannter Dock und negatives chat.maxMessages jeweils HTTP400. Export-Settings und Custom-Presets danach unverändert. Diese vier API-Validierungsfälle **bestanden**, gerenderter Importdialog damit nicht abgenommen.
- Vollständiger eigener Export anschließend unverändert an regulären Import geschickt: HTTP400 mit vier falschen Farbvalidierungsfehlern. Einstellungen/Presets erneut vollständig verglichen und unverändert. Wiederherstellung nicht notwendig; positiver Roundtrip durch027 blockiert.

## LTTH-LIVE-027 – ClarityHUD lehnt seinen eigenen vollständigen Profil-Export beim Import ab (P1)
- Bereich: P5 Profilimport/Persistenz und A12 pluginbezogene Wiederherstellung. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026, Windows/bundled Node22.14.0, laufendes Profil test. Relevante Clarity-Quellen unverändert; parallele Talking-Heads-/TTS-Arbeit unberührt.
- Voraussetzungen: regulärer vollständiger Clarity-Export mit chat/full.colorblindSafeMode und usernameColorByTeamLevel (boolesche Optionen). Profilguard und TEMP-Sicherung vor Import.
- Reproduktion:
  1. GET /api/clarityhud/profile/export aufrufen und erhaltenes profile sichern.
  2. Dasselbe unveränderte Objekt als {profile:...} mit POST /api/clarityhud/profile/import senden.
  3. HTTPantwort und erneuten Export vergleichen.
- Erwartet: Eigener Export kann ohne manuelle Entfernung regulärer Einstellungen wiederhergestellt werden.
- Tatsächlich: HTTP400, success false, Invalid ClarityHUD profile; validationErrors: chat.colorblindSafeMode, chat.usernameColorByTeamLevel, full.colorblindSafeMode und full.usernameColorByTeamLevel jeweils must be a valid color. Danach Settings/Presets unverändert.
- Quelle: tatsächliche lokale Export-/Import-API; zusätzlich derselbe Fehler mit echten Source-Klassen in isoliertem In-Memory-Harness, kein Live-/Gift-Ereignis. Bereinigte HTTPfehler oben; keine vollständigen Konfigurationen/Viewer-/Zugangsdaten veröffentlicht.
- Quellursache gestützt: settings-schema.js:448 prüft jedes Feld mit Teilstring color als Farbwert, bevor die Booleanprüfung ca.484 erreicht wird. Beide regulären booleschen Optionsnamen werden dadurch fehlklassifiziert.
- Reproduzierbarkeit: aktuelle API und isolierter Default-Export jeweils reproduziert; **Bug bestätigt**. Auswirkung: vollständige Clarity-Profilwiederherstellung scheitert auch ohne Benutzeränderung. Kein Patch; positive Roundtrip-/vollständige UI-Speicherabnahme abhängig hiervon blockiert, kein Erfolg behauptet.

## LTTH-LIVE-028 – Clarity-Profilimport stellt eine ausdrücklich leere Custom-Preset-Liste nicht wieder her (P2)
- Bereich: P5 Presets/Profilimport, A12 pluginbezogene Wiederherstellung. Derselbe Commit/Umgebung wie027; ausschließlich isolierte Source-Klassen, keine echte App-Konfiguration geändert.
- Voraussetzungen: gespeichertes Profil mit customPresets:[], später hinzugefügtes eigenes Preset. Für den isolierten Folgepfad wurden nur die vier durch027 falsch abgewiesenen Felder aus der Eingabe entfernt; kein Produktcode geändert.
- Reproduktion:
  1. Echten ClarityHUDBackend mit FakeAPI registrieren; Defaultprofil mit leerer Custom-Preset-Liste erstellen.
  2. In isoliertem Backend ein synthetisches custom-AUDIT-retained-Preset einfügen und Chatfont ändern.
  3. Registrierten echten Importhandler mit dem früheren Profil aufrufen; Konfigurationsschreibvorgänge nur in einer In-Memory-Liste erfassen.
- Erwartet: Explizit exportierte leere Liste stellt null Custom-Presets wieder her und persistiert diese Liste.
- Tatsächlich: HTTP-Semantik200/success true, Chatfont korrekt auf 48px zurückgesetzt, aber actualCustomPresets1 statt0; kein clarityhud.customPresets-Persistenzaufruf.
- Beleg: temporärer Harness ltth-clarity-import-isolated.js exit0 mit status200/success true/expectedCustomPresets0/actualCustomPresets1/presetPersistenceWrites0/realDatabase false/realNetwork false.
- Ursache im aktuellen Handler gestützt: backend/api.js Import ersetzt/persistiert Custom-Presets nur bei validation.customPresets.length > 0. Ein expliziter leerer Export wird genauso behandelt wie fehlende Eingabe.
- **Bug bestätigt auf isolierter Handler-Ebene**; keine vorhandenen Benutzerpresets gelöscht/erstellt und kein tatsächlicher UI-Erfolgsdialog behauptet. Wiederherstellungspfad mit leerer Liste unvollständig; allgemeine echte Preset-Verwaltung weiter offen. Keine App-/Profil-/Plugin-Lifecycle-/Tunnel-/Accountmutation, kein Restart.

## LTTH-LIVE-029 – Top Tier multipliziert normalisierte Gift-Serien-Coins erneut mit repeatCount (P1)
- Bereich: P31 Gift-Wertung/Serien/Rangliste und Rank-Command. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026 Windows/bundled Node22.14.0; Top-Tier- und Adapterquellen unverändert, parallele Talking-Heads-/TTS-Arbeit unberührt.
- Voraussetzung: normalisiertes Gift-Ereignis vom aktuellen EulerstreamAdapter mit coins als Gesamtwert. Adapter ca.1516–1560 berechnet coins=diamondCount*repeatCount und liefert abgeschlossene streakable Gifts mit isStreakEnd. TopTier main.js registriert Giftlistener direkt an scoreEngine.handleGiftEvent.
- Reproduktion:
  1. Echte ScoreEngine-Klasse mit FakeAPI/FakeDB und isolierter Session laden.
  2. Synthetisches normalisiertes Serienabschluss-Gift mit coins15, diamondCount5, repeatCount3, isStreakEndtrue verarbeiten.
  3. Score sowie lokale !rank-Antwort überprüfen.
  4. Kontrollfälle Einzelgift coins5/repeat1 und unnormalisierter Fallback diamondCount5/repeat3 ohne coins verarbeiten.
- Erwartet: Laut Pluginvertrag/README Coins=Punkte, somit15 Punkte für15 normalisierte Coins. Fallback darf aus Einzelwert und Count15 berechnen.
- Tatsächlich: Serienabschluss45 Punkte; Rank-Reply giftsScore45. Einzelgift5 und Raw-Fallback15 korrekt. Quelle score-engine.js multipliziert (data.coins || data.diamondCount || 0) erneut mit repeatCount/count.
- Beleg: temporärer Harness ltth-toptier-score-isolated.js exit0; normalizedSeriesExpected15/Actual45, single5/5, rawFallback15/15, likeCount4*Multiplier2 ergibt8/8, rankReplyScore45; realDatabase false/realNetwork false.
- Quelle: synthetische Daten in echter Source-Engine mit FakeDB, ausdrücklich keine reale Drei-Gift-Serie und keine tatsächliche Testprofil-Rangliste verändert. **Bug bestätigt auf isolierter Engine-/Connectorvertragsebene**. Bestehende reale Gift-Zähler sind kein Beleg für korrekte Serie. Auswirkung: Serien werden proportional zur Serienlänge überbewertet und können Rangfolge/Leader/Rankantwort verfälschen.
- Reproduzierbarkeit: mit konkretem Drei-Gift-Payload und zwei negativen Kontrollen abgesichert. Kein Patch, keine öffentliche Nachricht/Giftaktion, keine Settings-/Profil-/Plugin-Lifecycle-/Apprestartänderung.

### P31 kontrollierte Wertungs- und Decay-Matrix, 05.10.2026
- Isolierte echte ScoreEngine: Einzelgift5, Raw-Giftfallback5*3=15 und Like4*Multiplier2=8 **bestanden für diese kontrollierten Payloads**; normalisierte Giftserie **Bug bestätigt029**. Rank-Reply enthält bereits falsch gewerteten Score; Parsing/Rechte/echte Chatantwort nicht hier abgenommen.
- Isolierter echter DecayScheduler._tick mit FakeDB: linear12->Floor10, percentage100->90, idle altes100->95/neues100unverändert, step100/120/200->95/115/200, none100unverändert, disconnected mit decayOnlyWhenConnected100unverändert. Alle sechs kontrollierten Fälle erwartungsgemäß; Decaylogs1/1/1/2/0/0 und Boardupdates1/1/1/1/0/0.
- Quelle: ltth-toptier-decay-isolated.js exit0, ausschließlich synthetische In-Memory-Boards, keine tatsächlichen Userwerte geändert. Mathematik/Floor/Idle-/Nähebedingung/Verbindungsgate **bestanden auf isolierter Methodenebene**; echte zeitliche Schedulerpersistenz, Gleichstände, alle UI-Konfigurationen, reale Serien, Overlayanimationen und öffentliche Layouts bleiben separat offen.

### P31 tatsächliche Like-Rangliste: Liveupdates und Reload, 05.10.2026
- Profilguard test/requiresRestartfalse, bestehende reale Verbindung danutlungu151; keine Settings geändert. Tatsächliche Browserquelle /plugins/toptier/overlay.html?board=likes&variant=animated-race.
- DOM 06:27:24.434Z: fünf Einträge; Scores4K/2.9K/528/280/224. Root tt-size-M/tt-theme-night/tt-variant-animated-race/tt-orientation-landscape. Keine Browsererror-/warnlogs in abgefragter Sitzung.
- Begrenztes reales Livefenster 06:27:30.347Z–06:28:15.361Z: 35 Likes, zwei Chats, acht Joins, ein Gift; TopTier40updates/8decay. Keine künstlichen Events/öffentlichen Chatnachrichten ausgelöst. Anzahl allein beweist keine Gift-Serienkorrektheit.
- Tatsächliches GET /board/likes success true/active true/count5/Scores4122,3056,508,260,210. Der in Quellkommentaren genannte /api/plugins/toptier/board/likes lieferte API endpoint not found; tatsächliche registrierte relative Route und UI/API_BASE führen zum Rootpfad /board/likes. Keine Fehlfunktion aus falschem Kommentarpfad abgeleitet.
- DOM 06:28:09.659Z: fünf Einträge, Scores4.1K/3.1K/508/260/210 passend zur gerundeten API-Darstellung; alle fünf Avatare complete true/naturalWidth72; Scorebalken100/74/12/6/5 Prozent. Werte ändern sich ohne Reload, echte Like-/Decayaktualisierung in dieser Ansicht **bestanden**. Keine Viewer-Namen/Bilderinhalte exportiert.
- Bewusster Reload: DOM 06:28:25.126Z erneut fünf Einträge mit aktuellen Scores4.2K/3.1K/498/250/200; keine abgefragten error/warnlogs. Initiale Boardwiederherstellung nach Browserreload **bestanden**; kein Beleg für Apprestart/Persistenz oder tatsächlichen TikTok-Reconnect.
- Eigener Prüftab geschlossen, passiver Beobachter beendet; keine App-/Profil-/Plugin-/Tunnel-/Accountmutation. Weitere Layouts/öffentliche URL/echte Serien/Giftboard-Rangfolge/Leaderanimationen bleiben offen;029 nicht durch sichtbare Likefunktion relativiert.

### A8/P31 öffentliche Top-Tier-Ranglisten, 05.10.2026
- Profil test/requiresRestartfalse; regulärer ensure-Tunnelstart success/reusedfalse, publicURL https://ann-bite-mouse-gratuit.trycloudflare.com/plugins/toptier/overlay.html?board=gifts&variant=animated-race. Queryparameter erhalten.
- Tatsächlicher öffentlicher Browser lädt Rootklassen/M/night/animated-race/landscape und fünf Giftscores0/0/0/0/0; lokale tatsächliche /board/gifts-API success/active/count5/Scores0/0/0/0/0. Öffentliche Giftboardinitialisierung **bestanden** für diesen Zustand, keine Giftwertung/Serie aus Nullwerten abgeleitet.
- Zweites ensure mit board=combined&variant=animated-race success/reusedtrue und unverändertem Tunnelhost; öffentliche URL korrekt angepasst. Kombinationsdarstellung jedoch leer, siehe030. Gegenprobe gleicher Host board=both&variant=animated-race zeigt nach Socketinitialisierung zwei Boardtitel und zehn Einträge; Like-Scores4.8K/3.2K/448/200/183, Gift-Scoresalle0. Reale Hauptstreamwerte werden öffentlich geladen; erforderlicher Overlay-/Socketcode funktioniert für diesen Pfad.
- Echtes Beobachtungsfenster 06:29:23.182Z–06:30:08.193Z: 35 Likes, fünf Joins, zwei Chats, kein Gift; TopTier39updates/5decay. Kein synthetischer Liveimpuls/öffentliche Chat-/Giftaktion. Öffentliche echte Giftaktualisierung bleibt **nicht beobachtet**, reine öffentliche Like-/Boarddarstellung ist kein Ersatz dafür.
- Öffentliche Browsererrors: DE-Translationsladen fehlgeschlagen, bereits009; keine vollständige Asset-/Sprachenabnahme. Queryänderung und Tunnelwiederverwendung **bestanden**; Kombination030 separat fehlgeschlagen.
- Regulärer stop success, eigener Browserprüftab geschlossen, passiver Beobachter exit0. Keine Settings-/Profil-/Plugin-Lifecycle-/Accountänderung/Apprestart. Weitere Varianten/öffentliche echte Serien/Stoppfehleranzeigen weiter offen.

## LTTH-LIVE-030 – Top-Tier-Option board=combined bleibt mit Standardvariante leer (P2)
- Bereich: P31 dokumentierte Overlayparameter und A8 öffentliches Layout. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026, Profil test/Windows, reale aktive Like-/Giftboards vorhanden. Quellen unverändert.
- Voraussetzung: README dokumentiert board-Werte likes,gifts,both,combined; Standardvariante animated-race. Öffentliche Quelle und Socket funktionierend, abgesichert mit gifts- und both-Gegenprobe.
- Reproduktion:
  1. Reguläre Top-Tier-Quelle mit board=combined&variant=animated-race über ensure veröffentlichen.
  2. Im tatsächlichen Browser öffnen und nach Initialisierung erneut DOM prüfen.
  3. Am selben Host nur board auf both ändern und erneut nach regulären Updates prüfen.
- Erwartet: Dokumentierte Boardoption zeigt kombinierte Werte oder einen verständlichen Hinweis auf die erforderliche Variante, statt einer dauerhaft leeren Quelle.
- Tatsächlich: combined/animated-race bleibt leer, Root vorhanden, DOM rows0/classesinner0 um06:29:19.438Z und06:29:36.404Z. both/animated-race zeigt um06:30:05.800Z zehn Einträge und beide Boardtitel; gifts/animated-race zuvor fünf Einträge. Keine reine frühe Loading-Stichprobe als Fehler verwendet.
- Quelle: tatsächlicher öffentlicher Browser, echte vorhandene Boarddaten; kein Testviewer/keine Scoremutation. Keine exportierten Viewer-Namen/Bilder, keine gespeicherten Screenshotpfade.
- Quellursache gestützt: overlay.js connect fordert für paramBoard combined beide Boards an. render verwendet renderCombined nur bei paramVariant combined; getActiveBoards berücksichtigt anschließend nur paramBoard likes/gifts/both, lässt combined aus. Genau die dokumentierte Kombination erhält daher keine Renderboards.
- **Bug bestätigt für diese URL-Parameterkombination**. Nicht behauptet, dass UI-generierte combined-Variante ebenfalls leer wäre; diese ist separat zu prüfen. Auswirkung: manuell konfigurierte dokumentierte Standardvariante mit combined-Board liefert leeres Overlay. Keine Produktänderung; eigener Tunnel/Tab wieder beendet.

## LTTH-LIVE-031 – Viewer-XP-Gifter-Rangliste zählt bei Giftserien nur den Einzelwert (P1)
- Bereich: P16 integrierte Gifter-Session/All-Time-Rangliste und Coin-/XP-Zuordnung. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026 Windows/bundled Node22.14.0. Aktuelle Implementierung liegt unter milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js; kein eigenständiger app/plugins/viewer-xp-Pfad. Quellen unverändert, parallele Talking-Heads-/TTS-Arbeit unberührt.
- Voraussetzung: normalisiertes Serienabschlussereignis coins15/diamondCount5/repeatCount3/isStreakEndtrue mit vorhandener userId. Aktueller Adapter liefert coins als Gesamtwert und diamondCount als Einzelwert.
- Reproduktion:
  1. Echte ViewerXPPlugin.handleGift-Methode mit isolierter FakeAPI/FakeDB/Sessionmap verwenden; gemeinsame Ausgangsstatistik90Coins.
  2. Synthetische Drei-Gift-Serie mit oben genanntem Payload verarbeiten.
  3. Gemeinsamen Coin-Zuwachs, Gifter-Sessionmap, addGifterCoins-Argument und XP-Tier-Metadaten vergleichen.
  4. Einzelgift coins5/diamondCount5/repeatCount1 als Kontrolle verarbeiten.
- Erwartet: Gesamtwert15 in gemeinsamer Statistik und beiden Gifter-Ranglisten; gleiche Gift-Identität/Coins in XP-Metadaten.
- Tatsächlich: gemeinsame Statistik +15, XP-Auswahl gift_tier3/coins15, Currency-Meilenstein100 korrekt. Gifter-Sessioncoins5 und All-Time-addGifterCoins-Delta5 statt15. Einzelgift ergibt in allen drei Zählungen5.
- Beleg: temporärer Harness ltth-viewerxp-gift-isolated.js exit0, ausschließlich AUDIT-Testidentität/FakeDB/kein Netz. Echte updateGifterSessionData-Methode und echter handleGift-Pfad; numerische Werte und Tiernamen protokolliert, keine tatsächlichen Viewerdaten verändert.
- Quellursache gestützt: handleGift ca.3020 nutzt coins korrekt; ca.3097 setzt diamondCount=data.diamondCount || data.coins || 0 und reicht diesen Einzelwert sowohl an Session- als auch All-Time-Gifterupdate weiter.
- **Bug bestätigt auf isolierter Handler-/Connectorvertragsebene**. Kein tatsächlich beobachtetes Drei-Gift-Ereignis/kein reales fehlgewertetes Userprofil behauptet. Auswirkung: Serie wird im Gifterboard um Faktor repeatCount unterzählt, während XP/Currencydaten anderen Gesamtwert zeigen. Kein Patch/öffentliche Chat-/Giftaktion/Settingsmutation/Restart.

### P16 isolierte Gift-Tier- und Meilensteinprüfung, 05.10.2026
- Grenzwerte1/2/11/30/100/300/1000/5000Coins führen im echten handleGift zu gift_tier1/2/3/4/5/6/7/8. Auswahl/Metadaten **bestanden für diese acht synthetischen Grenzfälle**; tatsächliche XP-Zahl, Cooldowns, Levelupdarstellung und Persistenz nicht durch Stub-awardXP geprüft.
- Gemeinsame Coinstatistik90+15 überschreitet100 genau einmal im geprüften Handlerlauf; Currency-Meilenstein100 **bestanden isoliert**. Kein ausgeschlossener IFTTT-Debugauftrag verfolgt; nur vorhandene Plugin-Meilensteinemission erfasst.
- Ergänzende bestehende Jest-Suites viewer-xp-idempotency.test.js und gift-milestone-regression.test.js gestartet mit bundled Node und --runTestsByPath/--runInBand. Tool-/Prozesslauf lieferte trotz begrenzter Beobachtung keinerlei Output; bestehende Session63006 anschließend gezielt mit Ctrl-C beendet, exit1. **Kein Testerfolg und kein Produktfehler daraus abgeleitet**, ergänzende Suiteausführung derzeit blockiert durch Ausführungsumgebung/fehlenden Output. Prozessabfrage per CIM Zugriff verweigert; nicht auf fremde Prozesse ausgewichen.
- Keine echte App-/Profil-/Plugin-Konfiguration geändert, keine gemeinsame Historie/Statistik gelöscht. Eigener Testprozess beendet. Reale Giftserien/Milestones/Rankings/Profilpersistenz und bisherige XP-Overlay-Tunnelabnahme weiterhin separat offen.

### P6 CoinBattle: kontrollierte Serien-, Multiplikator- und Teamwertung, 05.10.2026
- Aktuelle Engine app/plugins/coinbattle/engine/game-engine.js, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, bundled Node22.14.0. Keine CoinBattle-Datei oder App-Konfiguration geändert, Plugin nicht aktiviert; bestehende/parallele Talking-Heads-/TTS-Arbeit unberührt.
- Temporärer Harness ltth-coinbattle-score-isolated.js verwendet echte CoinBattleEngine mit FakeDB/FakeIO und synthetischer AUDIT-Session. Keine vorhandene Runde, Viewerwerte oder Historie verändert.
- Normalisierter Serienabschluss-Payload coins15/diamondCount5/repeatCount3 ergibt15 Scorecoins; aktive Engine-Multiplikation2 ergibt30. Anders als029 keine erneute Multiplikation mit repeatCount. Serien-Gesamtwert und Multiplikation **bestanden für diese kontrollierten Payloads**, keine echte Serie beobachtet.
- Derselbe explizite Eventidentifier AUDIT-event1 erneut geliefert: duplicate true; keine zweite Wertungsaufzeichnung. Deduplication dieses identischen Schlüssels **bestanden isoliert**; variable/fehlende IDs und echte Connectorlistener nicht automatisch abgenommen.
- Geschenk während isPaused true ergibt null und keine Wertung; Geschenk ohne aktive Runde/autoStartfalse ebenfalls null. Diese beiden Enginezustände **bestanden isoliert**. Bestehender Timer-/Pausenfehler003 bleibt separat bestehen.
- Teammodus/alternate: erste zwei neue AUDIT-Spieler landen in red/blue. Manual ohne vorherige Teamzuordnung wird mit Manual team assignment required before the first gift abgewiesen, keine Scoreaufzeichnung. Wechselnde Zuweisung und negativer Manualfall **bestanden isoliert**; tatsächliche UI-Teamzuweisung, bestehende Teams, Gewinnerwertung und Persistenz weiterhin separat offen.
- Vier erfolgreiche Scoreaufzeichnungen insgesamt; synthetische FakeDB-Records, keine reale SQLite-Datei. Engine.destroy in finally räumt eigenen Cleanupinterval/Timer auf, Prozess exit0. Keine App-/Profil-/Plugin-/Tunnel-/Accountmutation, kein öffentlicher Chat/Gift oder Restart.
- Noch offen im Live-/UI-Umfang: reale Runde mit Gift-Serie/Ende, Zeitmultiplikator-Lifecycle, Teamwechsel/Balance/Ergebnis, KOTH/Pyramide/Freundeschallenges, Ranglistenanimationen, XP-Gewinnerbelohnung, Persistenz und öffentlicher Ereignisfluss. Isolierte Ergebnisse ersetzen diese Prüfungen nicht.

### A9/A10 Store-Zustand erneut tatsächlich geprüft, 05.10.2026
- Voriger HTTP401/jwt-not-active-Blocker war laut früherem Abschnitt bereits am03.10. nach zeitlicher Verzögerung überwunden. Keine erneute Token-/Systemzeit-/Zugangsdatenänderung. Der historische Fehler darf nicht als aktueller Storeblocker fortgeschrieben werden.
- Aktuelle gerenderte App-Store-Navigation über vorhandenes Dashboard:35 data-store-card-Katalogeinträge; Konto-Menü sichtbar, Auth-root displaynone. Aktueller Katalogzugang **bestanden** in der vorhandenen Browsersitzung; keine Zugangsdaten/Accountdetails exportiert.
- Tatsächliche Top-Tier-Detailkarte geöffnet: Official/OpenBeta/Installed, Storeversion2.0.0, Installed2.0.1, CategoryFeatured, SourceOfficialLTTHStore, PriceFree, CompatibilityCurrentLTTH, Manage. Beschreibung/Versions-/Installiertabgleich und Details öffnen/schließen **bestanden** für diese konkrete Karte. Keine behauptete Screenshotgalerie-Abnahme, Installation oder Licenseclaim.
- Update-Tab tatsächlich geöffnet:0updates und Installed plugins do not have available store updates. Verfügbare Updates **nicht beobachtet**; nullUpdates/Leerzustand **bestanden**. Kein Update/automatisches Gesamtcheckoutupdate/Downgrade vorgenommen. Storeversionälter als lokale Top-Tier-Version, deshalb kein Reinstall als Update ausgegeben.
- Installed-Tab tatsächlich geöffnet:38lokale .plugin-card, Katalogkarten0, Detaildrawer geschlossen. Unterschied35Store/38lokal ist separat erfasster Inventurumfang, kein Fehler aus unterschiedlicher Anzahl allein abgeleitet.
- Keine Plugin-Aktivierung/Installation/Updates und insbesondere keine Talking-Heads-Lifecycleaktion. Account/Abo unverändert; eigene UI blieb im Installed-Tab des vorhandenen Benutzer-Dashboards, kein neuer Tab/Tunnel. Positive Paketinstallation/Rollback und Installationsfehlerfälle bleiben im ausgewählten sicheren Umfang separat offen.

### A10 isolierte Paketinstallation und transaktionale Wiederherstellung, 05.10.2026
- Aktuelle echte PluginStore.installPlugin-Implementierung, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Windows/bundled Node22.14.0. Temporärer Harness ltth-store-transaction-isolated.js, kein Produktcode geändert.
- Eigener eindeutig benannter TEMP-Root ltth-AUDIT-store-isolated-*; eigenes plugins-Verzeichnis, eigenes persistentes Datafile, SQLite :memory:, ausschließlich FakeLoader/FakeFetch. Kontrollierte ZIP-Fixture mit ausgewählter Plugin-ID goals und Version2.0.0, Dummyentry ausschließlich als Datei kopiert und nie ausgeführt. Kein offizielles Storepaket/keine reale Goals-Version/Installation im laufenden Checkout behauptet.
- Echte ZIP-Archivierung, echte sha256-Prüfung, echte Paketextraktion/Manifestprüfung und Promotion liefen durch den aktuellen Installer. Ergebnis installedVersion2.0.0 **bestanden isoliert**; neu installierter Zustand false entsprechend Fixture-Baseline. Kein Auth-/Lizenz-/Netz-/UI-Erfolg daraus abgeleitet.
- Falsche SHA256-Prüfsumme wurde vor Promotion mit checksum mismatch abgewiesen; bestehende Pluginentry bytegleich erhalten. Prüfsummen-Fehlerpfad **bestanden isoliert**.
- Folgende Fixture3.0.0 in bereits als loaded/enabled markierter eigener Installation: FakeLoader simuliert einen fehlgeschlagenen Start, nachdem eigenes Datafile und eigene Settings geändert wurden. Installer wirft Failed to initialize updated plugin und führt tatsächlichen Rollback durch.
- Nachprüfung: restaurierte Version2.0.0, Entrydatei bytegleich, enabledState true, Datafile original, SQLite-setting original, zwei Loadaufrufe (fehlgeschlagener Neubestand/erfolgreich restaurierter Altbestand), null verbleibende .store-transaction-Verzeichnisse. Dateien-/Zustands-/Daten-/Settings-Rollback nach Startfehler **bestanden isoliert**; kein wirklicher Pluginstart ausgeführt.
- Finally schließt eigene In-Memory-SQLite und entfernt nur den geprüften absoluten eigenen TEMP-Root nach Prefix-/Parentguard. Prozess exit0, realNetwork false/runningAppTouched false. Keine App-/Profil-/Plugin-Lifecycle-/Account-/Aboänderung oder Talking-Heads-Aktion.
- Gesamtscope bleibt getrennt: tatsächliche offizielle Neuinstallation/Updates nicht beobachtet (alle gewählten Pakete bereits vorhanden, UI0updates); Auth-/Lizenzfehler, Paketpfad-/Manifest-/Versionfehler, Windows-Dateilocks, Rollbackpaket-Angebote und gerenderte Installationsfehler weiterhin separat zu prüfen. Keine komplette A10-Abnahme aus dem kontrollierten Installerharness abgeleitet.

### A10 Manifest-/Pfadfehler und lokaler Installations-Zugangsschutz, 05.10.2026
- Echte PluginStore.validateExtractedPackage/findPlugin-Methoden mit eindeutigem eigenem TEMP-Fixture-Verzeichnis und ausgewählter ID goals, keine laufende Plugininstallation/kein Netz.
- Gültiges Kontrollmanifest goals/version2.0.0/index.js akzeptiert. Falsche Plugin-ID coinbattle, falsche Version1.0.0, fehlende Entrypointdatei, Entry ../AUDIT-outside.js und fehlender Name jeweils mit konkretem erwarteten Fehler abgewiesen. Diese fünf Manifest-/Pfad-Fehlerfälle plus positiver Kontrollfall **bestanden auf isolierter Methodenebene**.
- Gültig formatierte unbekannte Quelle audit-unknown-source wird mit Unknown store source abgewiesen, ohne Fetchaufruf. Erster Harnesslauf hatte versehentlich Großbuchstaben im Quellenidentifier und traf vorher Invalid plugin id; Fixture korrigiert und erneut geprüft, kein Produktbug daraus abgeleitet.
- Belege: ltth-store-validation-isolated.js, final exit0 mit sieben pass:true; realNetwork false/runningAppTouched false. Dummyentry wurde nie ausgeführt; eigene TEMP-Wurzel nach absolutem Parent-/Prefixguard entfernt.
- Tatsächliche lokale POST-Anfrage /api/plugin-store/official/goals/install ohne Browsercookie/Authorization und nach test-Profilguard: HTTP401/code AUTH_REQUIRED. Unangemeldete Installation **bestanden als abgewiesener negativer API-Fall**; vorhandene eingeloggte Browsersitzung unverändert. Keine Installation/Licenseclaim/Accountänderung ausgeführt.
- Gitstatus für app/plugins/goals anschließend leer. Keine Plugin-/Profileinstellungen, Accounts/Abos, Talking Heads oder Apprestart geändert.
- Scopegrenzen: weder öffentlicher Verwaltungs-POST noch gültige offizielle Paketinstallation oder authentifizierter Lizenz-/Subscriber-/Closed-Beta-/Adminfall damit abgenommen. ZIP-interne Pfadtraversierung (abweichend vom geprüften Manifestentry), Windows-Lockfallback, tatsächliche Paketrollbackauswahl und gerenderte Fehlermeldungen weiter offen.

### A10 Windows-Umbenennungsfallback und ZIP-Traversierung, 05.10.2026
- Aktuelle echte PluginStore-Implementierung, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Windows/bundled Node22.14.0. Eigene TEMP-Fixtures, FakeFetch/FakeLoader/isolierte Datenbank; keine App-/Profil-/Plugin-/Accountänderung oder Talking-Heads-Aktion.
- ltth-store-windows-lock-isolated.js simuliert EBUSY bei jedem fileOps.rename, belässt tatsächliche Datei-Copy-/Remove-Operationen im eigenen geprüften TEMP-Root. Vier Renameversuche: erste Promotion, Sicherung des späteren Altbestands, Promotion des späteren Neubestands, Restaurierung des Backups.
- Installation2.0.0 funktioniert trotz simulierter Renamefehler. Fehlerhafte3.0.0-Aktivierung wird erkannt; Restaurierung2.0.0 mit bytegleichen Files, enabledState true, original Datafile/SQLite-Setting. Null verbleibende Transaktionsverzeichnisse, zwei Loadaufrufe, Prozess exit0. Kopierfallback **bestanden für diese simulierten EBUSY-Renamefälle**. Keine echte OS-Dateisperre/fehlgeschlagene Removeoperation/geladenes natives Modul abgenommen.
- ltth-store-zip-isolated.js erstellt eigenes ZIP mit gültigem Manifest/Entry und einer kontrollierten Zusatzdatei; lokale/zentralen ZIP-Dateinamenseinträge gleichlang zu ../AUDIT.txt geändert. Passende SHA256 berechnet, sodass der eigentliche ZIP-Pfadvalidator erreicht wird.
- Echte installPlugin-Anfrage gegen FakeFetch lehnt vor Extraktion mit Invalid plugin ZIP: invalid relative path: ../AUDIT.txt ab. Eigene zuvor vorhandene Markerdatei bytegleich erhalten, kein neues Pluginmanifest im Zielverzeichnis. ZIP-interne relative Traversierung **bestanden als isolierter negativer Paketfall**.
- Keine Datei außerhalb eigener Fixtureverzeichnisse erzeugt; beide TEMP-Wurzeln in finally nach absolutem Parent-/Prefixguard entfernt. ZIP-Fixture/Dummycode nie ausgeführt, realNetwork false/runningAppTouched false.
- Authentifizierte echte Storepakete, verfügbare Updates, reale Dateihandlelocks, zusätzliche Archivvarianten und UI-Fehleranzeigen weiterhin nicht durch diese isolierten Fälle bewiesen. Kein abgeschlossener Gesamttest behauptet.

### P14 echtes Like-Ziel: Fortschritt, Abschluss und Bereinigung, 05.10.2026
- Profil test/requiresRestartfalse, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, bestehende Liveverbindung danutlungu151. Vorher GET/api/goals success/count0; SQLite-Onlinebackup als TEMP/ltth-audit-20261005-before-live-likes-goal.db erstellt, kein Gesamtbackup restauriert.
- Eigenes Ziel AUDIT20261005-Likes-Live, ID goal_8b4e2be1-cef3-4d19-b028-5ee67f7b4edc, Typlikes, target90313, enabled1, on_reach_action hide, firework_enabled0, reset_on_stream_end0. APIcreation success/current89331. Likes werden beim Erstellen mit gesamtem Streamzähler initialisiert, kein fälschlich neu bei0 beginnender Test behauptet.
- Tatsächlicher Browser /goals/overlay?id=... zeigt eigenes Ziel,99%,89K/90K, zunächst892remaining. DOM06:43:07.587Z zeigt491remaining, keine abgefragten error/warnlogs. DOM06:43:31.728Z zeigt30remaining/gerundet100%. Echte Like-Fortschrittsanzeige **bestanden** für dieses Ziel.
- Begrenztes passives Fenster06:42:54.449Z–06:43:39.465Z:39Likes,7Joins,1Follow,1Gift,1Chat; goals:value-changed39. Viewer-XPupdatezählung3703 auffällig höher als frühere Fenster, aber Anzahl allein beweist keine doppelte Vergabe; nicht als bestätigter Fehler oder korrekte Lastabnahme gewertet.
- Folgende tatsächliche DOM-Prüfung06:43:49.537Z: goal-container.class hidden/displaynone/Textleer. API danach current90904/target90313, reachedtrue. Echter Zielabschluss mit hide-Verhalten **bestanden**; keine synthetische Wertsetzung, kein Feuerwerk/öffentlicher Chat/Gift ausgelöst. Zielabschluss liegt nach dem genannten45s-Beobachterfenster und ist durch spätere DOM/APIprüfung belegt.
- Reguläres DELETE nur nach test-Profilguard und exaktem Namen-/ID-Guard. success true, remainingGoals0, remainingOwnHistory0; FK-Cascade hat eigene Historie entfernt. Eigener Prüftab geschlossen, passiver Beobachter exit0. Baseline ohne Ziele wiederhergestellt; keine fremden Daten gelöscht/kein Gesamtbackup überschrieben.
- Weitere Coin-/Follower-/Custom-/Superfan-Zieltypen, Reconnect/Reset-/Double-/Incrementverhalten, Styles/Mehrzielrotation und öffentlicher Livefluss bleiben getrennt zu prüfen.

## LTTH-LIVE-032 – Goals-API liefert bei booleschen Flags einen internen SQLite-Bindefehler (P2)
- Bereich: P14/A11 Eingabevalidierung und API-Fehlerfälle. Derselbe Commit/Umgebung, laufendes Profil test, Sources unverändert.
- Voraussetzungen: POST/api/goals mit gültigem Namen/goal_type likes/positivem target_value, aber booleschen JSONflags enabledtrue/firework_enabledfalse/reset_on_stream_endfalse. UI verwendet laut ui.js:369–380 stattdessen numerische0/1; boolesche Flagunterstützung nicht als dokumentierter Vertrag behauptet.
- Reproduktion:
  1. genannten Body an regulären lokalen POST/api/goals senden.
  2. HTTPstatus/Fehler und Zielinventur prüfen.
  3. Kontrollbody mit denselben Flags als0/1 erstellen; dieser funktionierte im obigen Livezieltest.
- Erwartet: Wenn boolesche Flags nicht unterstützt sind, verständliche Clientvalidierung mit HTTP400; andernfalls sichere Normalisierung. Kein interner Server-/Bindefehler.
- Tatsächlich: zweimal HTTP500, successfalse, SQLite3 can only bind numbers, strings, bigints, buffers, and null. Beide fehlgeschlagenen Anfragen erzeugten kein Ziel; Zielinventur danach0. Numerische0/1-Kontrolle success/livefunktioniert.
- Quelle: tatsächliche lokale API, kein Viewer-/Account-/Giftpayload. Quellursache gestützt: API übernimmt req.body ohne Typvalidierung, Datenbank bindet Werte direkt; SQLite akzeptiert JSboolean nicht.
- **Bug bestätigt als Fehlerbehandlungs-/Validierungsproblem**, nicht als Beleg einer fehlerhaften regulären UI-Checkbox. Kein Produktpatch; fehlgeschlagene Anfragen hinterließen keine Ziel-/Historieänderung. Eigene positive Kontrollrunde bereits vollständig bereinigt.

### A3/P16 Viewer-XP-Burst im echten Livefenster aufgeklärt, 05.10.2026
- Profil test/requiresRestartfalse vor passiver Socketbeobachtung. Zeitraum06:45:53.743Z–06:46:38.760Z,45s; keine synthetischen Events/öffentliche Aktionen/Appmutation.
- Tatsächliche TikTokevents:34Likes,4Joins,2Gifts,6Chats. Viewer-XPupdates3718 nach actionType aufgeschlüsselt: gift_tier1=2, like=5, chat_message=6, daily_bonus=3, watch_time_minute=3702.3708verschiedene Username-Schlüssel nur flüchtig intern gezählt, keine Namen/Payloads exportiert.
- Exakte Duplikate nach internem Fingerprint Username/actionType/amount/timestamp/profile.total_xp_earned:0. Die hohe Updateanzahl ist überwiegend Watch-Time-Vergabe, kein Beleg für3702duplizierte Like-/Gift-Ereignisse. Begrenzte Payload-Duplikatprüfung **bestanden für dieses Fenster und diesen Fingerprint**; allgemeine Listenerdeduplication/XP-Persistenz nicht damit bewiesen.
- Source hält watchTimers seit Join bis Streamdisconnect; periodischer30s-Check vergibt bei erreichtem Intervall watch_time_minute.3702erfasste Timer beweisen keine3702aktuell tatsächlich zuschauenden Personen. Echtzeit-Anwesenheit/Viewerabgang und ob diese Trackingheuristik gewünscht ist bleiben ungeklärt; kein zusätzlicher Produktbug allein aus Timerzahl abgeleitet.
- Temporärer passiver Helper ltth-xp-action-window.js beendet/disconnected/exit0. Keine Subscription-/Superfanerkennung oder korrekte XP-Gesamtzahl aus Histogramm behauptet.

## LTTH-LIVE-033 – Viewer-XP-Statistik unterzählt gebündelte Likes (P2)
- Bereich: P16 Viewerstatistik/-Identität und A3 Like-Normalisierung. HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9,05.10.2026 Windows/bundled Node22.14.0; aktuelle Implementierung milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js, Sources unverändert.
- Voraussetzung: normalisiertes TikTok-Likeereignis mit likeCount>1. Shared user_statistics.total_likes summiert den übergebenen updates.likes-Wert, kein separates Likeevent-Countfeld.
- Reproduktion:
  1. Echte handleLike-Methode mit FakeAPI/FakeDB und synthetischer AUDIT-Identität ausführen.
  2. Payload likeCount23 liefern; updateUserStatistics-Delta und awardXP-Metadaten erfassen.
  3. Likecount1 als negative Kontrolle liefern.
- Erwartet: gemeinsame total_likes-Statistik zählt23Likes; XP-Regeln können weiterhin pro Ereignis/Cooldown werten.
- Tatsächlich: Likecount23 -> sharedLikesDelta1, xpMetaLikes23. Likecount1 -> sharedLikesDelta1, xpMetaLikes1. XP-Vergabe pro Ereignis hier ausdrücklich nicht als Fehler bezeichnet.
- Belege: ltth-viewerxp-likes-isolated.js exit0, realDatabase false/realNetwork false. handleLike aktualisiert Shared-Statistik mit {likes:1}; database.js ca.2835 addiert diesen Wert auf total_likes. Currency/Profilauskunft liest total_likes anschließend als Likeanzahl.
- **Bug bestätigt auf isolierter Handler-/Statistikvertragsebene**, kein tatsächlich fehlgewertetes Userprofil oder bestimmte reale23Like-Payload behauptet. Auswirkung: gebündelte Likes unterzählen Viewer-Gesamtstatistik/Profilanzeige. Kein Patch, keine realen Userwerte verändert.

### P16 Watch-Time-Verbindungsgate und Disconnectbereinigung isoliert
- Echte startWatchTimeTracking-Callback-/handleStreamDisconnect-Methoden mit einem künstlich61s alten AUDIT-Timer, FakeDB/FakeAPI; setInterval nur im eigenen Harness zum Callbackcapture ersetzt und sofort restauriert. Kein realer Timer/App-Timer gestartet.
- Offline isActivefalse:0Awards; online true:1Award; sofortiger zweiter Tick bleibt1, lastUpdate verhindert Wiederholung; handleStreamDisconnect leert Map0, weiterer Tick bleibt1. Checkintervall30000ms.
- Diese Offline-/Intervall-/Disconnectfälle **bestanden isoliert**. Beleg ltth-viewerxp-watch-isolated.js exit0. Keine echte Verbindung getrennt/keine XP vergeben; tatsächlicher Reconnect/Anwesenheit/Streamprofilpersistenz bleiben separat offen.

### A3/P5/P12 tatsächliche Badgefelder und isolierte Rollenprüfung, 05.10.2026
- Profil test/requiresRestartfalse vor passiver45s-Socketbeobachtung. Zeitraum06:48:36.770Z–06:49:21.788Z:6Joins,45Likes,3Chats.54normalisierte Ereignisse mit isModeratorfalse/isSubscriberfalse und teamMemberLevelpositive. Keine Gifts im Fenster.
- Gelieferte für Fan/Badge relevante Feldnamen: isSubscriber,teamMemberLevel; kein isSuperFan/isSuperfan-/Badgefeld beobachtet. Positive Teamlevel sind kein Beleg bezahlter Super-Fan-Mitgliedschaft. Bezahlte Super-Fan-/Abo-Erkennung **nicht beobachtet**; nichts öffentlich gesendet oder gekauft.
- Temporärer Helper ltth-live-badge-window-current.js nutzt aktuellen isStreakEnd-Feldnamen; hier keinGift/keineSeriepaarung. Disconnected/exit0. Payloadwerte/Vieweridentitäten nicht exportiert; nur Typ-/Flagzählungen.
- Checkout-Normalisierung erhält Fanclublevel und getrennte isModerator/isSubscriber-Flags. Isolierte echte Adapter-/GCCE-Methoden legen folgende Rechtefehler offen; kein Command im Livechat oder tatsächlicher Moderatorcommand ausgeführt.

## LTTH-LIVE-034 – GCCE stuft gewöhnliche Teammitglieder und Subscriber als Moderatoren ein (P1)
- Bereich: P12 Commandrechte, A3 Badge-/Rollennormalisierung. HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9,05.10.2026 Windows/bundled Node22.14.0; GCCE/Adapterquellen unverändert, parallele Talking-Heads-/TTS-Arbeit unberührt.
- Voraussetzungen: Team-/Fanclub-Mitglied mit teamMemberLevel>0 und isModeratorfalse. Aktueller Connector kann dieses Teamlevel unabhängig von Moderator-/Subscriberstatus liefern, wie das obige echte Fenster zeigt.
- Reproduktion:
  1. Echte EulerstreamAdapter.extractUserData- und GCCE-PermissionChecker-Klassen isoliert laden.
  2. Synthetischen Fanclub-Payload mit fansClub.data.level1 normalisieren, ohne Moderator-/Subscriberflag.
  3. getUserRole und checkPermission(role,moderator) ausführen.
  4. Subscriber-Identity sowie gewöhnlichen Viewer ohne Team und echten Moderator als Kontrollen prüfen.
- Erwartet: Teammitglied und Subscriber erhalten keine Moderatorrechte ohne Moderatorflag; gewöhnlicher Viewer ohne Team wird abgewiesen, Moderator zugelassen.
- Tatsächlich: Fanclublevel1/isModeratorfalse/isSubscriberfalse -> rolemoderator/permissiontrue. Subscriberidentity -> teamlevel1/isModeratorfalse/isSubscribertrue -> ebenfalls rolemoderator/true. Gewöhnlicher Viewerlevel0 -> all/false, Moderator -> moderator/true.
- Beleg: ltth-gcce-roles-isolated.js exit0, vier anonymisierte Kontrollfälle; realNetwork false/realDatabase false/commandsExecuted0. PermissionChecker.getUserRole prüft isModerator || teamMemberLevel>0; GCCE-Kontext setzt zusätzlich isSubscriber bei jedem positiven Teamlevel. commandParser reicht die ermittelte Rolle an denselben Checker weiter.
- **Bug bestätigt auf isolierter Normalisierungs-/Rechteebene**. Keine tatsächliche unerlaubte Commandausführung behauptet. Auswirkung: Moderatorcommands der ausgewählten Plugins können für gewöhnliche Teammitglieder zugelassen werden. Kein Produktpatch oder öffentliche Aktion.

## LTTH-LIVE-035 – GCCE-Permissioncache behält Freigabe trotz herabgestufter Rolle (P1)
- Bereich: P12 Rollenwechsel/Commandrechte; gleicher Commit/Umgebung wie034, isolierte echte PermissionChecker/PermissionMemoizer-Klassen.
- Reproduktion:
  1. checkPermission(moderator,moderator,AUDIT-cache) aufrufen.
  2. Danach denselben Useridentifier mit userRoleall und requiredPermissionmoderator prüfen.
  3. Cache explizit invalidieren und erneut prüfen.
- Erwartet: Neue aktuelle Rolle all wird für Moderatorpermission abgewiesen.
- Tatsächlich: true -> nachDowngrade weitertrue -> erst nach invalidateCache false. Cachekey ist userId:requiredPermission ohne userRole, StandardTTL600000ms. Parser verwendet stabilen context.userId; geprüfter GCCE-Pfad invalidiert Permissioncache nur über administrative Cache-API, nicht beim normalen Rollenabgleich.
- Beleg: ltth-gcce-roles-isolated.js cacheinitialtrue/afterDowngradetrue/afterInvalidatefalse, kein echter Command/Moderatorstatus verändert. **Bug bestätigt isoliert**; tatsächlicher Rolechange/Reconnect/TTLablauf im Livebetrieb nicht beobachtet. Auswirkung: veraltete Commandfreigabe nach Rollenverlust im Cachefenster. Kein Patch/Appmutation.

## LTTH-LIVE-036 – ClarityHUD verliert normalisierte Moderator-/Subscriber-Badges (P2)
- Bereich: P5 Chatbadges/A3 normalisierte Viewer-Daten; gleicher Commit/Umgebung, aktuelle BadgeRenderer-Klasse.
- Reproduktion:
  1. extractBadges mit normalisiertem isModeratortrue/isSubscriberfalse/teamMemberLevel10 aufrufen.
  2. Mit normalisiertem isSubscribertrue/isModeratorfalse/teamMemberLevel1 prüfen.
  3. Rohe userIdentity mit beiden Flags sowie gewöhnliches Teammitglied als Kontrollen prüfen.
- Erwartet: Vom aktiven Connector normalisierte Moderator-/Subscriberflags bleiben erhalten; gewöhnliche Teammitglieder erhalten keine dieser Badges.
- Tatsächlich: beide normalisierten positiven Fälle liefern isModeratorfalse/isSubscriberfalse; nur Teamlevel bleibt. Rohe Identitykontrolle liefert beide true; gewöhnliche Teamkontrolle korrektfalse.
- Beleg: ltth-clarity-badges-isolated.js exit0 mit vier synthetischen Payloads. Backend handleChatEvent legt normalisierten Connectorpayload unter raw ab; Chat.js:517–519 reicht raw an BadgeRenderer.extractBadges. Dieser liest Flags nur aus eventData.userIdentity, nicht aus normalisierten Top-Level-Flags.
- **Bug bestätigt auf isolierter aktuellem Badge-Datenpfad-Ebene**; keine echte Subscriber-/Moderatorchatnachricht oder tatsächlich fehlendes Viewerbadge im genannten Fenster behauptet (dort alle entsprechendenFlagsfalse). Kein Super-Fan-Status aus Teamlevel abgeleitet. Kein Produktpatch/Configs-/Profile-/Plugin-Lifecycle-/Tunnel-/Accountänderung.

### P12 echte Registry-/Parserintegration isoliert, 05.10.2026
- Aktuelle CommandRegistry/CommandParser/PermissionChecker-Klassen, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, bundled Node22.14.0. Eigene In-Memory-Registry mit künstlichem auditparse/auditshort-Command unter ausgewählter Plugin-ID gcce. Handler sammelt nur Argumente, keine echten Commands/Plugins/Accounts/Profile beeinflusst.
- Registrierung success; Konfliktregistrierung desselben Namens durch ausgewählte ID goals abgewiesen, canonicalOwner gcce erhalten. Registrierung/Konfliktbesitz **bestanden isoliert**.
- Gewöhnlicher Text erkannt als isCommandfalse. Gewöhnliche Rolleall mit /auditparse A -> PERMISSION_DENIED. Fehlendes Argument und drei statt maximalzwei Argumente -> VALIDATION_ERROR. Unbekannter Command -> COMMAND_NOT_FOUND. Deaktivierter Alias -> COMMAND_DISABLED. Diese sieben Admission-/Fehlerfälle **bestanden isoliert**.
- Gemischte Groß-/Kleinschreibung und mehrfacher Whitespace: /AuDiTsHoRt A B löst canonical auditparse mit args[A,B] erfolgreich aus. Alias-/Argumentnormalisierung **bestanden für diesen Fall**; keine Unterstützung zitierter Mehrwortargumente behauptet.
- Benutzer-Cooldown10000ms auf canonical auditparse: erster Aufrufsuccess, danach derselbe User über auditshort -> COMMAND_ON_COOLDOWN. Gemeinsamer Cooldown für Alias/canonical **bestanden isoliert**; reale Zeitabläufe/globale Lastgrenze nicht damit abgenommen.
- Folgeprüfung zu034: getUserRole für isModeratorfalse/isSubscriberfalse/teamMemberLevel1 -> moderator; Parser /auditparse A damit success und erreicht denselben Testhandler. Rechtefehler **auch im tatsächlichen Registry-/Parser-/Handlerpfad isoliert reproduziert**, nicht nur direkte Checker-Rückgabe. Keine unerlaubte reale Commandausführung behauptet.
- Beleg ltth-gcce-parser-isolated.js exit0, drei Testhandleraufrufe (Aliaspositiv, ersterCooldownaufruf, Rechtefehlerfall), realNetwork false/runningAppTouched false. Keine App-Konfigurations-/DB-/Plugin-Lifecycle-/Tunnelmutation, kein öffentlicher Chat/Gift/Restart.
- Gesamtscope weiterhin offen: echte ausgewählte Plugincommands durch diesen Parser, gerenderte Fehlerrückmeldung, globale/per-user Tokenbucketlimits, Cooldownablauf/Reconnectbereinigung und persistente Commandsettings. Frühere direkte Handlerprüfungen bleiben davon getrennt.

### P12 GCCE: Benutzer-/Globallimits im echten Parser isoliert, 05.10.2026

- Umgebung: aktueller Checkout e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, gebündeltes Node 22; bestehende Talking-Heads-/TTS-Änderungen erhalten. Keine laufenden App-Einstellungen geändert.
- Quelle: synthetische Daten, echte CommandRegistry, CommandParser, PermissionChecker und TokenBucketRateLimiter; eigene In-Memory-Registry mit AUDIT-Command und Alias, Handler zählt ausschließlich Aufrufe. Helper: `%TEMP%\ltth-gcce-limits-isolated.js`, Exit 0.
- **Bestanden (isoliert):** Benutzerkapazität 1 sperrt den zweiten Aufruf desselben Benutzers auch über den Alias mit `RATE_LIMIT_USER`; kanonischer Command und Plugin bleiben in der Fehlerantwort erhalten. Abgewiesener Benutzeraufruf verbraucht kein zusätzliches Globaltoken.
- **Bestanden (isoliert):** Globalkapazität 3 sperrt den vierten unterschiedlichen Benutzer mit `RATE_LIMIT_GLOBAL`; genau drei Handleraufrufe bis zur Sperre.
- **Bestanden (isoliert):** Nach ausschließlich im eigenen Limiter vorgezogenen Refill-Zeitpunkten um 60.001 ms wird der Alias wieder zugelassen; insgesamt vier Handleraufrufe. Reset entfernt Benutzer-Buckets und stellt drei Globaltokens wieder her.
- Grenzen: Zeitablauf wurde an isolierten Bucket-Zeitstempeln simuliert. Keine öffentliche Chatnachricht, keine Netzwerkverbindung, kein echter Plugin-Command ausgelöst. Reale UI-Fehlerdarstellung, tatsächliche Minute Wartezeit, Reconnect/Persistenz und Commands der ausgewählten Plugins bleiben offen. Diese vier Prüfungen bestätigen keine vollständige P12-Live-Abnahme.

### P12/P35 Command-Registrierung und Weather-Parserpfad, 05.10.2026

- Lokale laufende Registry: GET `/api/gcce/commands`, HTTP 200, success true, Zeitpunkt 2026-10-05T06:53:51.832Z. Insgesamt 30 Commands. Ausgewählter aktueller Umfang: GCCE help/commands/cmdtest/alias/gcstats/suggest/hudtext/hudimage/hudmedia/hudclear sowie EmojiRain rain/emoji/beans/miau/rawr/woof/wuff/storm/herzballons/rainstop jeweils enabled true. Weather war nach vorheriger Wiederherstellung deaktiviert; fehlende aktuelle Weather-Commands werden deshalb nicht als Registrierungsbug gewertet. Nur Name, Plugin, Rechte und enabled ausgegeben; keine Viewer-Daten oder Konfigurationen.
- **Bestanden (synthetische isolierte Integration):** `%TEMP%\ltth-weather-gcce-isolated.js`, gebündeltes Node, Exit 0. Echter WeatherControl-Konstruktor und registerGCCECommands, echte öffentliche GCCE-Registrierungs-/Abmeldemethoden, Registry, Parser und PermissionChecker. Eigene Fake-API fängt Events ausschließlich im Arbeitsspeicher ab; kein init, keine Timer-/Socketverbindung, keine aktuelle App-Konfiguration geändert.
- Drei Weather-Commands registriert. `/weatherlist` liefert ausschließlich aktiviertes rain. `/weather rain 2 999999` erreicht den echten Plugin-Handler und emittiert weather:trigger mit Intensität 1 und Dauer 60000 ms. Deaktiviertes snow und unbekannter Effekt werden abgewiesen. `/weatherstop rain` wird für all mit PERMISSION_DENIED abgewiesen und für subscriber zugelassen; genau ein weather:stop-effect. Abmeldung entfernt alle drei registrierten Commands.
- Grenzen: eigene Testkonfiguration mit ausgeschalteter interner Weather-Berechtigungsprüfung; deren Gruppenfehler bleibt separat Bug 022. Keine echte TikTok-Chatnachricht, kein sichtbarer Wettereffekt, keine Live-Ausführung und keine aktuelle Plugin-Lifecycle-Abnahme. P12/P35 bleiben für diese tatsächlichen Benutzerabläufe offen.

### LTTH-LIVE-037 — P3: GCCE-Filter bieten vorhandene Kategorien/VIP nicht an und verwechseln keine Treffer mit leerer Registry

- Feature: P12 GCCE, A11 DE-Oberfläche, `/gcce/ui`, Reiter Befehle.
- Umgebung: 05.10.2026, Windows/IAB, laufendes Profil test, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Bestehende lokale Talking-Heads-/TTS-Änderungen nicht berührt; GCCE-Code unverändert.
- Voraussetzung: aktive GCCE-/EmojiRain-/Viewer-XP-Commandregistrierung (30 Commands).
- Reproduktion:
  1. `/gcce/ui` öffnen und vollständig laden lassen; Befehle anklicken.
  2. Kategorien- und Berechtigungsdropdowns lesen. Nach storm suchen: aktivierter EmojiRain-Befehl mit Berechtigung vip erscheint.
  3. Nach `AUDIT-NO-MATCH-20261005` suchen.
  4. Seite neu laden und Dropdownwerte erneut lesen.
- Erwartet: tatsächlich registrierte Kategorien und Rechte sind auswählbar; eine erfolglose Suche zeigt keine passenden Befehle, nicht eine leere Registry.
- Tatsächlich: API-Kategorien System/Information/HUD/XP System/Currency/Effects; Dropdown nur System/Information/HUD/Moderation/Fun/Utility. API-Rechte all/moderator/subscriber/vip; Dropdown all/subscriber/moderator/owner ohne vip. Keine Treffer meldet „Noch keine Befehle registriert.“ trotz 30 registrierter Commands. Nach Neuladen identische Dropdownwerte, DOM 30 Zeilen, Zeitpunkt 2026-10-05T06:55:32.231Z.
- Testquelle: tatsächliche gerenderte UI und lokaler read-only GET `/api/gcce/commands` HTTP 200; Suchtext ist lokale synthetische Eingabe, kein TikTok-Chat. Helper `%TEMP%\ltth-gcce-filter-read.js` gibt nur Command-Metadaten aus.
- Reproduzierbarkeit/Auswirkung: nach Neuladen bestätigt; Viewer-XP-/Effektkategorien und VIP können nicht gezielt ausgewählt werden. Suche nach rain funktioniert und liefert sieben Treffer über Namen/Beschreibung; storm liefert einen sichtbaren Treffer.
- Ursache (Quellbefund): fest kodierte option-Werte in `app/plugins/gcce/ui.html:1172` und `:1181`; filterCommands prüft exakte Kategorie-/Rechtegleichheit und übergibt eine leere Trefferliste an die allgemeine Commandanzeige. Kein Produktfix durchgeführt.
- Wiederherstellung: nur Filterfelder und Reiternavigation im eigenen temporären Browsertab geändert; keine gespeicherte Einstellung oder Command aktiviert/deaktiviert. Tab nach Prüfung geschlossen.

### P12 UI-Ladezustand, 05.10.2026

- **Bestanden:** 30 Commands nach Laden, 30 aktivierte Commands nach Aktualisierung der Übersicht, drei registrierte Plugins, sichtbare Checkboxen stimmen mit API enabled true überein. Initialer kurzzeitiger Wert 0 vor abgeschlossener Statistikaktualisierung wird nicht als dauerhafter Statusbug gewertet.
- **Bug bestätigt:** Filter/Leermeldung LTTH-LIVE-037; Ausführungsstatistik weiterhin LTTH-LIVE-019. Keine öffentliche Command-Ausführung und keine Lifecycle-Umschaltung vorgenommen.

### LTTH-LIVE-038 — P2: Weather zählt eine abgeschlossene Quest bei deaktivierter Rotation mehrfach

- Feature: P35 Weather Control, Gamification-Questabschluss und gespeicherte Abschlusszahl.
- Umgebung: 05.10.2026, Windows, gebündeltes Node 22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Isolierte Instanz; laufendes Profil test unverändert. Bestehende parallele Änderungen erhalten.
- Voraussetzung: Gamification aktiviert, Questrotation `rotateOnCompletion:false`, eigene chat_count-Quest Ziel 2, Rewards deaktiviert. Der Backendhandler berücksichtigt false explizit; die aktuelle UI setzt bei ihrer Konfigurationssammlung true. Der Befund behauptet deshalb keinen über einen sichtbaren UI-Schalter ausgelösten Normalablauf.
- Reproduktion:
  1. Echten WeatherControl-Konstruktor mit Fake-API für In-Memory-Events/Configspeicherung erstellen, ohne init/Netzwerk.
  2. Eigene oben genannte Konfiguration setzen; vier Chat-Ereignisse mit amount 1 verarbeiten.
  3. Nach jedem Ereignis Questprogress/status und completedCount lesen.
  4. Echte persistGamificationState-Methode aufrufen; gespeicherten Fake-Configzustand prüfen.
- Erwartet: eine Quest wird genau einmal abgeschlossen; weitere Ereignisse bei weiterhin abgeschlossener Quest erhöhen completedCount nicht erneut.
- Tatsächlich: Ereignisse 1–4 ergeben progress 1/2/2/2, status active/completed/completed/completed, completedCount 0/1/2/3. Drei weather:gamification-quest mit reason completed für dieselbe Quest; persistierter completedCount 3.
- Testquelle: synthetische Daten, echte applyGamificationEvent/advanceQuestProgress/persistGamificationState-Methoden. Helper `%TEMP%\ltth-weather-quest-completion-isolated.js`, Exit 0. Kein echtes Chatereignis/Live-Questabschluss behauptet; keine Config oder Datenbank der laufenden App geschrieben.
- Reproduzierbarkeit/Auswirkung: deterministische Folge im isolierten Backend; überhöhte Abschlusszahlen und wiederholte Abschlussmeldungen werden gespeichert. Keine zusätzliche ausgeschüttete Questbelohnung nachgewiesen.
- Ursache (Quellbefund): advanceQuestProgress prüft progress >= target ohne Schutz auf bereits completed; completedCount und Abschlussmeldung werden erneut erzeugt. Rotation false lässt denselben active-Questverweis bestehen. Defaultrotation true verwendet einen Timer mit 0 ms; ein tatsächlicher Live-Rennfall dieses Pfads wurde nicht geprüft.
- Bereinigung: ausschließlich eigene Quest-/Persist-Timer im Helper-finally beendet; Fake-Konfiguration nur im Speicher. Kein Produktfix.

### P35 Quest-Teststatus, 05.10.2026

- **Bestanden (isolierter Teilpfad):** Chatprogress 1 auf 2 erreicht den ersten Abschluss; echter Persistenzserializer übernimmt den Laufzeitzustand in die Fake-Konfiguration.
- **Bug bestätigt (isoliert):** Mehrfachabschluss bei deaktivierter Rotation, LTTH-LIVE-038.
- Weiter offen: echte Live-Quest-/Streak-/Rewardanzeige, tatsächliche Profilpersistenz, Rotation im laufenden Browser, weitere Questtypen, Belohnungsrendering. Der isolierte Pfad ersetzt diese Live-Abnahme nicht.

### P35 Streaks, Rewards und Zustandswiederherstellung isoliert, 05.10.2026

- Quelle: `%TEMP%\ltth-weather-streak-reward-isolated.js`, Exit 0, gebündeltes Node 22.14.0, aktueller unveränderter Weather-Plugin-Code auf Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Echte Plugin-Methoden, zwei eigene Instanzen, Fake-API für Events und Configspeicherung. Kein init und kein Netzverkehr; alle eigenen Timer abschließend durch clearGamificationTimers beendet.
- **Bestanden (isoliert):** Zwei Chatereignisse mit Streakbonus ab 2/Multiplikator 2 ergeben Streak 2, best 2 und Meter 3. Nach Vorziehen ausschließlich des eigenen lastEventAt um 60001 ms setzt das nächste Ereignis current auf 1 zurück, best bleibt 2.
- **Bestanden (isoliert):** Schwelle 4 erzeugt genau ein weather:trigger/rain; unmittelbare erneute Auswertung erzeugt keine zweite Belohnung. Dieser Fall prüft die firedThresholds-Sperre, nicht einen tatsächlichen Cooldownablauf.
- **Bestanden (isoliert):** persistGamificationState serialisiert in Fake-Config; neue Instanz mit kopiertem gespeicherten Zustand und initializeGamificationState stellt Meter 4, best 2 und firedThresholds [4] wieder her. Erneute Rewardauswertung bleibt gesperrt. Kein Neustart oder echte Profildatenbank-Persistenz damit bestätigt.
- **Bestanden (isoliert):** Reset all setzt aktuellen Meter/Streak auf 0 und leert firedThresholds. Gamification enabled false verhindert weitere Ereignisverarbeitung und Rewardauflösung. Lifetime-Gesamtsumme/best wurden vom Reset-Test nicht als gelöscht gefordert.
- Grenzen: Questverarbeitung hier deaktiviert, Rotation/Questbelohnung separat offen. Tatsächliche Live-/Browseranzeige, Eventkorrelation, Cooldownexpiry, weitere Schwellen/CarryOver-Modi, UI-Reset und Profilpersistenz bleiben offen. Kein zusätzlicher Produktbug aus diesen sechs Fällen.

### A2/A3/P8/P31 aktuelles echtes Live-Fenster, 05.10.2026

- Passive Beobachtung 2026-10-05T06:57:50.070Z–06:58:35.077Z, Helper `%TEMP%\ltth-live-current-window-20261005.js`, Exit 0. Aktives Profil test vorab geprüft, kein Restartbedarf; `/api/status` vor/nach connected true, username danutlungu151, restarting false. Stream https://www.tiktok.com/@danutlungu151/live. Dieses Fenster bestätigt den aktiven LTTH-Connector und reale Eventaktivität, nicht eine erneute externe TikTok-Browser-Verifikation.
- Tatsächliche Eventtypen: like 38, chat 3, join 8, gift 1. Follows/Shares/Abos hier nicht beobachtet. Im untersuchten clientseitigen Datenobjekt kein Gift mit repeatCount > 1 und kein isStreakEnd true; der Gift-Typ bzw. Rohconnector-Serienpfad wurde in diesem Helper nicht erfasst. Daraus keine Aussage über fehlenden Serienabschluss ableiten.
- Plugin-Socketzählungen: emoji-rain:heart-balloons 38, emoji-rain:spawn 39; toptier:update 35, toptier:decay 10. Zeitgleiche Pluginaktivität nachgewiesen, keine vollständige individuelle Gift-zu-Spawn-Korrelation oder Renderabnahme von EmojiRain damit bestätigt.
- Tatsächlich gerendertes TopTier-Overlay `/plugins/toptier/overlay.html?board=likes&variant=animated-race`: fünf Like-Ränge; initial sichtbare gerundete Werte 7.3K/5.3K/3.9K/754/638, danach DOM um 06:58:38.178Z Rohscores 7252/5303/3999/773/628 und Text 7.3K/5.3K/4K/773/628. Fünf Avatarbilder complete true/naturalWidth72. **Bestanden:** aktuelle lokale Initialdarstellung und beobachtete Wertänderung während realer Likeaktivität. Keine Aussage über öffentliche URL oder exakte Like-/Decay-Rechenkorrelation aus diesem Fenster.
- Flags im untersuchten Eventdatenobjekt: positiveModerator 0, positiveSubscriber 0, positiveTeam 49. Teamlevel ist kein Beleg für Super-Fan-/Abo-/Moderatorstatus; solche Erkennung bleibt nicht beobachtet. Keine Vieweridentitäten oder kompletten Payloads protokolliert.
- Bereinigung: eigener Socket finally getrennt; eigener TopTier-Browsertab geschlossen. Keine Eventinjektion, öffentlichen Nachrichten, Gifts, Verbindungsänderungen oder App-Neustarts.

### A11/P12 tatsächliche DE/EN-Initialisierung und Browser-Sprachpersistenz, 05.10.2026

- **Bestanden (gerenderte UI):** eigener Tab `/gcce/ui?lang=en` zeigt englischen Titel/Heading, Dashboard/Commands/Monitoring/HUD Overlay/Configuration, Quick Actions und englische Formbeschriftungen. DOM html.lang en, Heading Global Chat Command Engine, Suchplatzhalter Search commands. In der untersuchten Auswahl von data-i18n-Elementen 0 exakt als unveränderter Schlüsseltext gerenderte Werte; kein vollständiger Übersetzungskatalog-Test damit behauptet.
- **Bestanden:** Navigation im eigenen Tab zu `/gcce/ui?lang=de` stellt deutsche Navigation/Labels wieder her. Danach `/gcce/ui` ohne Sprachparameter um 2026-10-05T06:59:33.535Z zeigt html.lang de und Heading Globale Chat-Befehls-Engine; browserspezifischer deutscher Ausgangszustand damit wiederhergestellt.
- Quellenumfang: tatsächliches IAB-Rendering, keine synthetische Übersetzungsinjektion. i18n-client.js:37–80 verwendet lang-URLparameter und app_locale-localStorage; diese Navigation schreibt die Sprache im Browser. Keine Profil-DB-/Backend-Sprachkonfiguration geändert. Kein App-Neustart oder Dashboard-Livesprachwechsel geprüft.
- Grenzen: bereitgestellte Commandbeschreibungen und interne Rechtebezeichnungen bleiben auch in DE englisch; deren vollständige Lokalisierungsanforderung ist damit nicht bewertet. Layout aller Tabs, sofortiger Sprachwechsel bestehender Seiten, Profiltrennung, alle ausgewählten Plugins und Wiederherstellung nach App-Neustart bleiben offen. Die früheren Browser-Timeouts des Topbar-Livesprachwechsels werden durch diesen erfolgreichen Initialladepfad nicht widerlegt.
- Bereinigung: eigenes Browsertab geschlossen, Browser-Sprache wieder de; keine Produktdateien oder Plugin-Konfigurationen verändert.

### LTTH-LIVE-039 — P2: Weather-Questabschluss löst konfigurierte Quest-Wetterbelohnung nicht aus

- Feature: P35 Weather Control, Questreward, getrennt vom Community-Meter-Rewardpfad.
- Umgebung: 05.10.2026, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9; synthetische isolierte Instanz, laufendes Profil test unverändert. Parallele Änderungen erhalten.
- Voraussetzung: Plugin/Gamification/Quests/Rewards aktiviert, rain und snow aktiv; eigene chat_count-Quest Ziel 1 mit normalisierter reward action snow/intensity0.4/duration4000. Automatische Rotation auf dem Default true belassen. Meter-Rewardschwelle zunächst 100, sodass ein Chat die Schwelle nicht erreicht.
- Reproduktion:
  1. Echten Plugin-Konstruktor mit In-Memory-Fake-API erzeugen, ohne init.
  2. Quest durch echte normalizeQuestDefinition normalisieren und ein Chatereignis durch applyGamificationEvent verarbeiten.
  3. Status/Abschlussmeldung und alle weather:trigger-Events erfassen.
  4. Kontrollweise resolveRewardThreshold mit meter100 aufrufen.
- Erwartet: die in der Quest ausdrücklich hinterlegte Wetterbelohnung wird beim ersten Abschluss als snow-Wettertrigger ausgegeben.
- Tatsächlich: Quest completed/progress1/completedCount1 und genau eine Abschlussmeldung, reward unverändert snow/0.4/4000, aber null weather:trigger beim Questabschluss. Kontroll-Meterpfad erzeugt genau einen rain-Reward. Ein defekter Fake-Emitter erklärt das Ausbleiben daher nicht.
- Testquelle: `%TEMP%\ltth-weather-quest-reward-isolated.js`, Exit0, echte Backendmethoden; keine Live-Quest-/Browserreaktion oder hörbare Ausgabe behauptet. Es wurde weder an öffentliche Socketclients gesendet noch laufende Config gespeichert.
- Auswirkung/Reproduzierbarkeit: konfigurierte Quest-Wetterbelohnung bleibt im abgeschlossenen Questobjekt ohne Effekt. Ein deterministischer isolierter Abschluss reproduziert; die entsprechende Live-Abnahme bleibt offen.
- Ursache (Quellbefund): normalizeQuestDefinition nimmt reward auf; advanceQuestProgress emittiert Abschluss-/Zustandsmeldungen, ruft jedoch keinen Wettertrigger für quest.reward auf. Auch im untersuchten overlay.html existiert kein Listener, der quest.reward ausführt. Meter-Rewards werden separat in resolveRewardThreshold umgesetzt. Kein Produktfix.
- Bereinigung: alle ausschließlich eigenen Quest-/Persist-Timer durch clearGamificationTimers beendet, Konfiguration/Events nur im Speicher.

### A8 Verwaltungs-GET erneut vor Ausführung abgelehnt, 05.10.2026

- Nutzerfreigabe für öffentliche GETs `/api/plugins` und `/dashboard.html` liegt ausdrücklich vor. Neuer Helper `%TEMP%\ltth-admin-tunnel-authorized-20261005.js` hätte nur Status/Content-Type ausgegeben, Responsebodies verworfen und ausschließlich einen selbst neu gestarteten Tunnel im finally gestoppt.
- Die automatische Freigabeprüfung hat den gesamten Prozessstart vor Ausführung erneut abgelehnt: mögliche sensible Plugin-/Dashboard-Antwortinhalte würden über den öffentlichen Host empfangen; die bisherige Endpunktfreigabe wertet der Reviewer nicht als Freigabe dieser möglichen Inhalte. Status-only-Ausgabe genüge nach dieser Begründung nicht.
- **Blockiert (Freigabeprüfung):** tatsächlicher öffentlicher Verwaltungs-GET-Zugriffsschutz weiterhin unbelegt. Kein neuer Tunnel gestartet, kein GET ausgeführt und kein HTTPstatus aus dieser Runde vorhanden. Keine Umgehung mit anderem Werkzeug/HEAD/indirekter Ausführung versucht.
- Konkretisierte Nutzerfrage für mögliche Antwortinhalte gestellt. Frühere Zustimmung wird nicht widerrufen; dies dokumentiert die zusätzliche Reviewanforderung. Öffentliche Verwaltungs-POSTs weiterhin nicht ausgeführt. Lokale Source-/Testbelege sind kein Ersatz für den realen öffentlichen GET.

### P11 Connect4-Regeln und State-Restore isoliert, 05.10.2026

- `%TEMP%\ltth-connect4-rules-isolated.js`, Exit0, gebündeltes Node22, aktueller Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Echte games/connect4.js-Klasse mit eigenen AUDIT-Spielern/Instanzen; kein Plugin-init/Socket/DB, laufendes Profil test unverändert.
- **Bestanden (isoliert):** horizontale Siegfolge A,A,B,B,C,C,D und vertikale A,B,A,B,A,B,A führen zu Gewinner1/korrektem winType/vier winningCells. Nach Sieg weiterer Zug abgewiesen, gesamter State unverändert.
- **Bestanden (isoliert):** sechs abwechselnde Steine in A füllen die Spalte; weiterer A-Zug sowie H abgewiesen, moveCount unverändert.
- **Bestanden (isoliert):** vorgegebene synthetische 41-Steine-No-Winner-Boardfixture mit letztem freien Feld oben A, currentPlayer2, dropA meldet draw/gameOver/status completed/moveCount42. Keine vollständig durch UI gespielte 42-Zug-Partie damit bestätigt.
- **Bestanden (isoliert):** nach lowercase a und B JSON-getState in neue Instanz restoreState, vollständiger State identisch. Manipuliertes moveCount20 wird per Exception abgewiesen, vorheriger State bleibt vollständig erhalten.
- Beweisgrenzen: Regellogik und Serializer, keine tatsächliche Session-DB-Persistenz, Eventberechtigung, XP/ELO-Resultatauszahlung oder Browser-Sieg-/Drawdarstellung. Diagonalen, weitere Live-/UI-Teilnahmefälle und Reconnect bleiben gesondert offen. Keine weiteren eigenen Session-/Spielerstatistikdaten erzeugt und kein Produktbug behoben.

### P11 Schach-Regeln isoliert und LTTH-LIVE-040 — P2: Abgewiesener Schach-State-Restore verändert bereits das Brett

- Umgebung: 05.10.2026, Windows/gebündeltes Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Eigene ChessGame-Instanzen mit AUDIT-Spielern, kein Plugin-init/DB/Socket, laufendes Profil test unverändert; parallele Änderungen erhalten.
- **Bestanden (isoliert):** f3/e5/g4/Qh4# durch echte makeMove-Methode meldet black/checkmate nach vier Zügen; weiterer Zug abgewiesen und FEN unverändert. Falscher Spieler sowie illegaler erster weißer Zug e5 abgewiesen, Brett/Zugzahl unverändert. UCI e2e4 akzeptiert und 3+2-Inkrement bei übersprungener verstrichener Zeit auf 182000 ms addiert. GetState/Restore des abgeschlossenen Mattspiels reproduziert FEN/PGN und checkmate-Ergebnis.
- Bugfeature: ChessGame.restoreState, Wiederherstellung eines ungültigen Spielzustands.
- Voraussetzungen/Reproduktion:
  1. Eigene Zielinstanz: e2e4 ausführen; currentPlayer black, moveCount1.
  2. Eigene zweite Instanz: d4/d5 ausführen und JSON-getState lesen; FEN am Zug weiß, moveCount2.
  3. Nur im kopierten State currentPlayer fälschlich auf black setzen; restoreState an der Zielinstanz aufrufen.
  4. Exception abfangen und FEN/currentPlayer/moveCount der Zielinstanz vergleichen.
- Erwartet: ungültiger Restore wird abgewiesen, vorheriges Spiel bleibt unverändert.
- Tatsächlich: Restore wird abgewiesen, aber Ziel-FEN ist bereits durch das d4/d5-Brett ersetzt. Ziel-currentPlayer bleibt black und moveCount bleibt1, während FEN am Zug w und Brett nach zwei Halbzügen. Ablehnung ist damit nicht atomar und lässt widersprüchlichen Zustand zurück.
- Testquelle/Beleg: `%TEMP%\ltth-chess-rules-restore-isolated.js`, gebündelter Node-Prozess erfolgreich, neutraler Output invalidRestore rejected true/fenChanged true/moveCountUnchanged true/currentPlayer black/fenSide w. Zwei isolierte ungültige Restorevarianten zeigten Brettmutation; finale Variante beweist zusätzlich Seitenwiderspruch. Kein realer beschädigter Sessiondatensatz oder tatsächlicher Live-Restore beobachtet.
- Auswirkung: ein abgefangener Restorefehler kann ein bestehendes Spiel bereits verändert haben. Tatsächliche Route/DB-Fehlerbehandlung und daraus folgender Live-Spielverlauf nicht geprüft; keine Auszahlung oder Nutzerstatistik betroffen im Test.
- Ursache (Quellbefund): restoreState weist this.chess nach erfolgreicher PGN/FEN-Prüfung zu, bevor currentPlayer/FEN-Konsistenz geprüft wird. Ausnahme lässt das neu zugewiesene Brett bestehen. Kein Produktfix.
- Bereinigung: sämtliche eigenen Game-Timer abschließend stopTimer; keine aktuellen Spiel-/Profil-Daten geändert. Weitere Spezialzüge, Remisregeln, reale Uhren/Interaktivtimer/XP/ELO/UI-Ergebnis und DBpersistenz bleiben offen.

### P11 Schach-Spezialregeln/Remis gezielt isoliert, 05.10.2026

- Helper `%TEMP%\ltth-chess-special-rules-isolated.js`, Exit0, gebündeltes Node22; echte ChessGame.makeMove/checkGameEnd/restoreState, eigene AUDIT-Instanzen. Kein Plugin-init/Netzwerk/DB, alle eigenen Timer durch stopTimer beendet.
- **Bestanden (isolierte reguläre Zugfolgen):** e4/e5/Nf3/Nc6/Bc4/Nf6/O-O erzeugt UCI e1g1, weißen König g1/Turm f1. e4/a6/e5/d5/exd6 führt en passant aus, schwarzer Bauer d5 entfernt/weißer Bauer d6, captured p. Nf3/Nf6/Ng1/Ng8 zweimal führt repetition/winner null; JSON-State mit PGN in neue Instanz wiederhergestellt, checkGameEnd erkennt weiterhin repetition. Letzter Fall belegt den Erhalt der Wiederholungshistorie im Serializerpfad, nicht nur einer FEN.
- **Bestanden (synthetische FEN-Fixtures):** UCI a7a8q wandelt weißen Bauern in Dame um. Patt-FEN liefert stalemate, reine Königsstellung insufficient_material, Könige+Turm mit Halbzugzähler100 fifty_move_rule; jeweils winner null. Keine vollständig live gespielten Patt-/50-Zug-Partien damit bestätigt.
- Einordnung: ergänzt die bereits dokumentierten 27 isolierten Schachregressionen um konkret benannte Ausgaben/PGN-Restorebeleg. Kein neuer Produktbug aus diesen sieben Fällen. Spezialregeldarstellung/Teilnahme in der tatsächlichen UI, interaktive Uhren/Timeouts, ELO/XP und Session-DBpersistenz bleiben offen.

### P6 CoinBattle Teamregeln isoliert, 05.10.2026

- Helper `%TEMP%\ltth-coinbattle-teams-isolated.js`, finale Ausführung Exit0, echte CoinBattleEngine mit In-Memory-FakeDB/FakeIO/eigenem AUDIT-Match; kein Zugriff auf aktuelle Profildaten. Erste Ausführung hatte nach abgeschlossenen Assertions einen Harness-Cleanupfehler wegen fehlendem FakeDB-getMatchLeaderboard; FakeDB-Vertrag ergänzt und vollständiger Lauf einschließlich destroy erfolgreich. Kein Produktbug daraus abgeleitet.
- **Bestanden (isoliert):** alternate weist drei neue Spieler red/blue/red zu (2:1). setPlayerTeam red nach blue entfernt alte Setmitgliedschaft und aktualisiert Player.team; nie gleichzeitig beide Teams. FakeDB-Rückgabe eines gespeicherten red-Teams wird durch assignTeam in die Laufzeitsets rehydriert.
- **Bestanden (isoliert):** ungültiger Teamname wird abgewiesen, Setgrößen und Player.team unverändert. Manual-Modus weist neuen unzugewiesenen Spieler zurück ohne Teammitgliedschaft. Random-Modus liefert für 20 eigene Spieler ausschließlich red/blue, keine doppelte Setmitgliedschaft. Keine statistische Gleichverteilung damit bestätigt.
- Inventurkorrektur: Im untersuchten assignTeam/setPlayerTeam gibt es keine Teamkapazitätsgrenze. Ein angekündigter Test „volle Teams“ ist deshalb kein hier angebotener Regelpfad und wird nicht als bestanden oder fehlgeschlagen verbucht; weitere UI-/Modusregeln separat untersuchen.
- Grenzen: kein echter DB-Teamwechsel/Live-Gift/Browser-Teamranking, keine Round-/Pyramid-/KOTH-/FriendChallenge-Abnahme. FakeDB-Wiederherstellung ist kein Profilpersistenzbeleg. Eigene Cleanup-Intervalle durch destroy beendet, laufende App und parallele Arbeit unverändert.

### P6 King of the Hill und Pyramid isoliert, 05.10.2026

- Echte jeweilige Modusklassen, eigene AUDIT-Spieler, FakeDB/FakeIO, gebündeltes Node22, aktueller Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Keine laufenden CoinBattle-Runden verändert.
- `%TEMP%\ltth-coinbattle-koth-isolated.js`, Exit0. **Bestanden (isoliert):** Start ohne Match abgewiesen; leere Rangliste verändert King nicht. Bonus bei 9s null/20s fünf/überlanger Dauer maximal1000. Erster Spieler gekrönt, gleiche Spitze erzeugt keinen Kronenwechsel. Eigenen Reign-Zeitstempel um25s vorgezogen und fünf Bonuscoins vorab über echte awardBonus-Methode gezahlt: beim Kronenwechsel nur zwei weitere Coins an alten King, insgesamt sieben; transferCount1, neuer ReignPaid0. end beendet Timer/setzt inaktiv, wiederholtes end null, inaktiv keine neue Krönung. Zeitdauer synthetisch, echtes DB-Accounting und UI-Krone nicht bestätigt.
- `%TEMP%\ltth-coinbattle-pyramid-isolated.js`, Exit0. **Bestanden (isoliert):** inaktiv keine Giftwertung; neuer Spieler unter minCoins2 sowie negative Coins abgewiesen ohne Join/Verlängerung. Fünf Coins ergeben500 Punkte und2.5s Verlängerung; 23Likes zusätzlich23 Punkte. Sechs Coins des zweiten Spielers übernehmen Rang1, knockout true/roundKnockouts1. Gesamte Verlängerung auf300s begrenzt (Basis120/Enddauer420), weiterer Aufruf ergibt0. XP-Rewards ausgeschaltet liefern leere Distribution.
- Pyramid-Roundstart wurde für den Handler-Test über eigenen In-Memory-active-/Zeit-Zustand vorbereitet, nicht durch echte startRound/DB-Routen. Daher Roundstart/-abschluss/Persistenz weiterhin offen. Alle eigenen Timer und Sammlungen durch destroy bereinigt.
- Grenzen beider Modi: keine echten Gifts/Likes bis zur Browserdarstellung, kein aktueller Match-DB-Schreibpfad, keine öffentliche Overlay-Abnahme, keine XP-Auszahlung, kein Pause-/Resume-/Reconnectbeleg. Keine Produktbugs aus diesen Positivfällen und keine Vollabnahme von P6 behauptet.

### LTTH-LIVE-041 — P1: CoinBattle-Freundesduell verliert bei belegter Runde Einsätze und zieht sie beim Retry erneut ab

- Feature: P6 Friend Challenge, Annahme-/Fehler-/Erstattungspfad.
- Umgebung: 05.10.2026, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Echte FriendChallengeSystem-Methoden und echter CoinBattleEngine.prototype.startMatch-Guard; eigene In-Memory-Konten, FakeIO, laufendes Profil test unverändert. Kein Echtgeldgeschäft oder realer Profilcoin-Abzug im Test.
- Voraussetzungen: bestehendes currentMatch, zwei eigene Spieler mit jeweils200 gespeicherten Fake-Coins, Challenge-Einsatz10.
- Reproduktion:
  1. createChallenge für AUDIT-A gegen AUDIT-B aufrufen; success true.
  2. acceptChallenge durch AUDIT-B aufrufen, während gameEngine.currentMatch bereits gesetzt ist.
  3. Exception und beide Kontostände prüfen.
  4. Dieselbe weiterhin pending Challenge erneut annehmen.
- Erwartet: belegte Runde verhindert Annahme ohne Coinverlust; eventuell vorab abgezogene Einsätze werden vollständig erstattet und ein neutraler Fehler zurückgegeben. Retry darf nicht erneut verlustwirksam abbuchen.
- Tatsächlich: echter startMatch-Guard lehnt ab. acceptChallenge wirft dann ReferenceError „match is not defined“, statt sauberer Fehlerantwort. Beide Konten nach erstem Versuch190, nach Retry180; pendingCount weiterhin1, kein Duell gestartet.
- Testquelle: `%TEMP%\ltth-coinbattle-challenge-failure-isolated.js`, Exit0. Echte Challenge-/Engine-Guardmethoden, FakeDB-Balances im Speicher. Zunächst gleicher Fehler mit Fake-Startthrow, anschließend echte startMatch-Methode und Retry geprüft. Keine tatsächliche aktuelle Profildatenbank/öffentliche Chatannahme/UIfehlermeldung damit belegt.
- Auswirkung/Reproduzierbarkeit: zwei deterministische Annahmeversuche verlieren jeweils beide Einsätze im simulierten Coinvertrag; offene Challenge ermöglicht weitere Versuche. Tatsächliche Persistenz/Route-/UI-Fehlerbehandlung bleibt gesondert offen.
- Ursache (Quellbefund): acceptChallenge dekrementiert beide Konten vor dem Rundenstart. `const match` wird innerhalb try deklariert, catch greift bei vorhandenem currentMatch auf match.id zu; ReferenceError tritt vor beiden Erstattungsaufrufen auf. Produktcode nicht geändert.
- Bereinigung: destroy beendet ausschließlich eigene Challenge-Expirationtimer und leert eigene Maps; keine reale Runde/Coins/Spielerstatistik verändert. Erfolgreiche Challengeannahme, Ablehnung, Ablauf und Abschlussauszahlung bleiben noch zu prüfen.

### LTTH-LIVE-042 — P1: CoinBattle-Challenge-Commands erwarten einen vom GCCE-Livepfad nicht gelieferten Benutzerkontext

- Feature: P6 Friend Challenge/P12 ausgewählte Plugin-Commands, challenge/accept/decline.
- Umgebung: 05.10.2026, Windows/Node22.14.0, Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Eigene echte Registry/Parser/PermissionChecker/FriendChallengeSystem-Instanzen; laufendes Profil test und parallele Änderungen unverändert.
- Voraussetzung: FriendChallenge-GCCE-Commands registriert; Kontext mit userId/username/uniqueId/nickname/userRole/userData gemäß aktuellem Live-Kontextobjekt in gcce/index.js:1490, ohne zusätzliches context.user. In Memory getPlayerCoins200; keine echte Profildatenbank.
- Reproduktion:
  1. Echte registerGCCECommands an eigener Registry aufrufen (drei Commands).
  2. Echten Parser mit `/challenge @AUDIT-B` und top-level Kontext von AUDIT-A ausführen.
  3. Eigene pending Challenge über createChallenge direkt erzeugen; `/accept` und `/decline` mit top-level Kontext von AUDIT-B durch Parser ausführen.
  4. Kontrolle: zusätzliche verschachtelte user:{userId,nickname} für eigenen anderen Spieler liefern, `/challenge @AUDIT-D` wiederholen.
- Erwartet: Commands verwenden den GCCE-Benutzerkontext und erreichen regulären Challengepfad.
- Tatsächlich: challenge => EXECUTION_FAILED/undefined reading userId; accept und decline mit pending Challenge => EXECUTION_FAILED/undefined reading nickname. Kontrolle mit zusätzlichem context.user => success true. Drei Commands sind erfolgreich registriert; der Fehler ist somit keine fehlende Registrierung.
- Testquelle: `%TEMP%\ltth-coinbattle-challenge-parser-isolated.js`, Exit0, synthetische Chatstrings im echten Parser, echte Pluginhandler und separat geprüfter Live-Kontext-Quellvertrag. Keine öffentliche Nachricht, tatsächliche aktuelle TikTok-Commandausführung oder laufende Plugin-Lifecycleänderung behauptet.
- Auswirkung/Reproduzierbarkeit: alle drei Fälle deterministisch reproduziert, reguläre Challengeanlage bzw. Antwort auf vorhandene Challenge scheitern bei diesem Kontext. accept/decline ohne pending Challenge können einen normalen No-pending-Text liefern; der Befund betrifft deren tatsächlichen pending-Pfad.
- Ursache (Quellbefund): FriendChallengehandler lesen context.user, während GCCE-Livekontext Benutzeridentität auf top-level und Flagdaten in userData liefert; kein untersuchter Parserpfad fügt user hinzu. Produktcode unverändert.
- Bereinigung: eigene Expirationtimer/Maps durch destroy entfernt; keine realen Konten, Runden, Coins oder Einstellungen verändert. Erfolgreicher direkter Annahme-/Abschluss-/Ablehnungs-/Ablaufpfad bleibt separat zu prüfen.

### P6 FriendChallenge direkter Lifecycle isoliert, 05.10.2026

- `%TEMP%\ltth-coinbattle-challenge-lifecycle-isolated.js`, Exit0, echte FriendChallengeSystem-Methoden; In-Memory-CoinDB/eigene AUDIT-Identitäten/FakeIO/Fake-Matchstart. Kein realer Match-/Profilcoin-/XP-Schreibpfad, alle eigenen Timer/Maps im finally destroy bereinigt.
- **Bestanden (isoliert):** ungültiger NaN-Einsatz und unzureichendes Guthaben verhindern Challengeanlage. Zweite pending Challenge desselben Challengers abgewiesen; decline entfernt pending/Expirationtimer, erneutes decline false. Expliziter expireChallenge-Aufruf entfernt Timer; spätere Annahme abgewiesen. Dies ist kein Echtzeitablauf des 30s-Timers.
- **Bestanden (isoliert):** gültige Annahme entfernt pending/Expirationtimer und zieht je10 von200 ab. completeChallenge zahlt20 an Gewinner (210/190), wiederholter Abschluss false/keine zweite Zahlung. Fake-Matchstart/-teilnehmeraufnahme ersetzen keine tatsächliche 1v1-Runde oder Ergebnisintegration.
- **Bestanden (isoliert):** simulierte Race beim zweiten Kontodebit (vorheriger getPlayerCoins zeigt ausreichend, deduct gibt false zurück) erstattet ersten Abzug vollständig und liefert success false. Dieser andere Fehlerpfad widerlegt nicht Bug041 im Rundenstart-catch.
- Aktuelle Statusgrenzen: direkte Lifecycle-Methoden für diese fünf Fälle bestanden; tatsächliche GCCE-Anbindung bleibt Bug042, belegter Rundenstart/Retry bleibt Bug041. Erfolgreiche Live-/UI-Freundesrunde, wirkliche Profildatenpersistenz, tatsächlicher Challenge-Ablauf und Round-End-Auszahlung bis Overlay noch nicht beobachtet.

## Aktualisierte Teilmatrix P6/P11 — Belegumfang ausdrücklich getrennt, 05.10.2026

Diese Tabelle konsolidiert die vorstehenden Prüfungen; sie ersetzt keine noch fehlenden Live-Belege und erklärt die historische Startmatrix nicht rückwirkend für vollständig. „Bestanden“ gilt ausschließlich für den genannten Belegumfang. Nicht beobachtete Fälle bleiben Arbeitsumfang.

| Bereich/Funktion | Status | Autoritativer Beleg und Grenze |
|---|---|---|
| P6 Solo-Runde Start/Pause/Resume/Ende | bestanden | tatsächliche UI und API der leeren eigenen Runde; keine Giftwertung |
| P6 Verlängerung | bestanden | UI/API nach Resume, Gesamtdauer150s |
| P6 pausierte API-Restzeit | Bug bestätigt | LTTH-LIVE-003, zwei echte Messpunkte während Pause |
| P6 Seriengesamtwert/2x-Wertung | bestanden | echte Engine mit FakeDB:15/30 Coins; isoliert |
| P6 identische Event-ID | bestanden | isolierte Engine verwirft Duplikat; kein allgemeiner Connector-Idempotenzpass |
| P6 alternate/random/manuelle Teamregeln/Wechsel | bestanden | ltth-coinbattle-teams-isolated, echte Methoden/in-memory |
| P6 tatsächliche Teamrunde/Live-Ranking/DB-Teamwechsel | nicht beobachtet | isolierte Teamregeln reichen nicht aus |
| P6 KOTH Kronenwechsel/Bonus/Ende | bestanden | isolierte Modusklasse/FakeDB, eigener Zeitstempel |
| P6 KOTH echte Rangliste/Krone/DB-Bonus | nicht beobachtet | keine aktuelle Runde mit realem Ereignis geprüft |
| P6 Pyramid Punkte/Leaderwechsel/Extensioncap | bestanden | isolierte Handler und vorbereiteter In-Memory-Roundzustand |
| P6 Pyramid tatsächlicher Roundstart/-ende/XP/Overlay | nicht beobachtet | startRound/End-to-End-Auszahlung nicht durch Fake-Zustand belegt |
| P6 Challenge direkte Anlage/Annahme/Ablehnung/Ablauf/Auszahlung | bestanden | isolierter Lifecycle, einmalige Auszahlung; Ablauf expliziter Methodenaufruf |
| P6 Challenge Matchstartfehler/Retry | Bug bestätigt | LTTH-LIVE-041, echte Guardmethode/In-Memory-Coinverlust |
| P6 Challenge über GCCE | Bug bestätigt | LTTH-LIVE-042, echter Parser/Handler mit Live-Kontextvertrag |
| P6 tatsächliche Challenge-Runde/Timerablauf/DBpersistenz | nicht beobachtet | direkte Fake-Lifecycleprüfungen ersetzen diese nicht |
| P11 tatsächliche Aktivierung/Deaktivierung | bestanden | gesicherter Testprofil-Lifecycle ohne andere Plugins zu deaktivieren |
| P11 manuelles Connect4 Start/Zug/API-Ende | bestanden | tatsächliche gerenderte UI und eigene API-Session |
| P11 Connect4 Nachöffnen aktiver Quelle | Bug bestätigt | LTTH-LIVE-016, zwei reale lokale manuelle Sessions |
| P11 Connect4 vertikaler Sieg/Sessionpersistenz/keine Test-XP | bestanden | echte eigene lokale API-Partie + read-only test.db, Sessions1/2; kein Restartpass |
| P11 Connect4 horizontal/vertikal/Draw/Restorevalidierung | bestanden | isolierte Regellogik, Draw vorbereitete Boardfixture |
| P11 Connect4 reale Chatteilnahme/Diagonalsieg/UI-Ergebnis/Public/Reconnect | nicht beobachtet | bisherige lokale/isolierte Befunde decken diesen Umfang nicht |
| P11 Schach Start/Aufgabe | bestanden | tatsächliche lokale UI/Handlerantwort; Ergebnisaccounting gesondert |
| P11 Schach Zug-/Matt-/Spezial-/Remisregeln und PGN-Restore | bestanden | gezielte isolierte Klassenprüfungen; Spezial-FENs ausdrücklich synthetisch |
| P11 Schach ungültiger Restore | Bug bestätigt | LTTH-LIVE-040, Brettmutation trotz Abweisung |
| P11 Schach echte Uhren/Teilnahme/XP/ELO/Public/Reconnect | nicht beobachtet | keine Vollabnahme aus Regellogik ableiten |
| P11 Plinko Testwurf/Resultat | bestanden | tatsächlicher lokaler Testball: bet100/payout200, unabhängige Historie/API |
| P11 Plinko Gesamteinsatzanzeige | Bug bestätigt | LTTH-LIVE-017, UI0 vs API100 |
| P11 Plinko echte Viewer-Einsätze/Giftteilnahme/XP/Balllast/Public | nicht beobachtet | Offline-Testwurf deckt diese Varianten nicht |
| P11 Wheel Testspins/Resultathistorie | bestanden | zwei tatsächliche eigene lokale Niete-Spins, keine Reward-XP |
| P11 Wheel HTTP/UI-Resultat | Bug bestätigt | LTTH-LIVE-018, HTTP200 {} und UI unbekannter Fehler |
| P11 Wheel Gewinn/Queue-Recovery/Persistenz/Public | nicht beobachtet | zwei Nieten kein Gewinnbeleg |
| P11 Slots eigener Verlustspin | bestanden | tatsächlicher lokaler Spin/Operation abgeschlossen, keine XP-Auszahlung |
| P11 Slots Gewinner/Joker/Jackpot/Resultataccounting/Public | nicht beobachtet | Verlustspin belegt keinen Gewinnpfad |
| P11 Arena fehlendes Profilbild | bestanden | eigener negativer Spieler abgewiesen, keine eigene Spawnaktion |
| P11 Arena echte Teilnahme/Kampf/Rundenende/XP/Public | nicht beobachtet | sichtbare reale Avatare nicht mit eigenem Trigger korreliert |

P6/P11 sind weiterhin nicht vollständig abgenommen. Historische eigene Session-/Statistikreste werden bis zur gezielten Abschlussbereinigung erhalten; keine gesamte Datenbank zurücksetzen. Öffentliche Verwaltungs-GET-Prüfung wartet separat auf die konkretisierte Freigabe und blockiert diese unabhängigen Matrixarbeiten nicht.

### P14 tatsächliches eigenes Coins-Ziel mit begrenztem Live-Fenster, 05.10.2026

- Vorab activeProfile test/requiresRestartfalse geprüft. Neue SQLite-Onlinesicherung `%TEMP%\ltth-audit-20261005-before-coins-live-0704.db` aus readonly test.db erstellt; frühere Sicherungen unverändert. Helper `%TEMP%\ltth-goals-coins-live-0704.js`, Exit0.
- Regulärer POST /api/goals HTTP200 erzeugt ausschließlich eigenes Ziel goal_AUDIT20261005-coins-live-0704/name AUDIT20261005-Coins-Live-0704, Typ coin, target1/current0/enabled1, reset_on_stream_end0/firework_enabled0/on_reach_action hide. Kein manuelles Increment/Value-Override nach Erstellung.
- **Bestanden (tatsächliche lokale UI):** `/goals/overlay?id=goal_AUDIT20261005-coins-live-0704` zeigt Münzsymbol/eigenen Namen/0%/0 von1/1remaining. DOM 07:10:47.762Z und07:11:30.180Z display block; spätere innerText-Ausgabe ohne eingebettete Styletexte bestätigt sichtbare Anzeige.
- Passive Socketbeobachtung ab2026-10-05T07:10:30.096Z, 45s-Timer, abschließende GET-Auswertung endet07:11:20.642Z (inklusive HTTP-Latenz): like33/join7/chat5, gift0/coinSum0/eigene goal-value-changed0. Abschluss-API current0/target1/enabled1. Keine Gifts zur Wertung verfügbar; **nicht beobachtet:** tatsächlicher Coinsfortschritt/Giftserie/Zielabschluss/Hide. Kein Fehler daraus abgeleitet und kein synthetisches Gift zur Erfüllung verwendet.
- Bereinigung **bestanden:** eigener Socket finally getrennt, eigener Overlaytab geschlossen. `%TEMP%\ltth-goals-coins-live-0704-cleanup.js` prüft erneut test/Restartbedarf und genaue eigene ID+Name; ausschließlich dieses Ziel per DELETE entfernt, HTTP200/successtrue. Nachkontrolle ownGoalRemainingfalse/totalGoals0. Keine bestehende Zielhistorie oder andere Profildaten gelöscht, kein App-Neustart.
- Grenzen: lokale Darstellung, keine öffentliche URL; begrenztes Fenster ohne Gift ersetzt keinen Live-Giftpass. Zielkonfiguration vollständig entfernt, Sicherung bleibt als Wiederherstellungspunkt erhalten.

### P19 MusicBot-Aktivierungsgrenze aktuell präzisiert, 05.10.2026

- Read-only-Neuprüfung um2026-10-05T07:13:13.017Z: gemeinsamer Cache weiterhin202Dateien/749827604Bytes. Nach exakt aktuellem _publishedFiles-Namensfilter (64 Hexzeichen, ein Erweiterungsteil, keine .lock, positive Dateigröße) wird nur1Datei erkannt; davon0mit mtime älter30Tage. Keine Dateiinhalte oder Mediennamen ausgegeben, keine Datei geändert.
- Read-only-test.db-Preflight `%TEMP%\ltth-music-cache-preflight-read.js`, Exit0:0plugin:music-bot:-Settings, keine gespeicherte Config; wirksame Default-cacheTTLDays30/maxCacheSizeMB2048. Aktuelle erkannte Cachemenge unter Größenlimit und ohne abgelaufene Datei. Quelle init schedulePrune sowie media-cache.js _publishedFiles/prune tatsächlich geprüft.
- Präzisierung der früheren pauschalen Aktivierungsblockade: gemeinsame Datenhaltung bleibt wahr, jedoch würde die aktuelle Default-Prune-Auswertung in dieser Momentaufnahme keine bestehende erkannte Datei wegen TTL/Größe löschen. Die bloße Anzahl202 belegt keine Löschgefährdung. Frühere UI-/Live-Nichtausführung bleibt historisch wahr; Cache-Prune allein ist nach dieser Neuprüfung kein nachgewiesener aktueller Aktivierungsblocker.
- Nächste Voraussetzung vor tatsächlicher Aktivierung: _reconcilePlaybackProcessesAtInit/reconcileProcesses und Safetylock prüfen, um laufende fremde Wiedergabe nicht zu beeinflussen. Dieser Prozesspfad noch nicht als sicher oder blockiert bewertet. Noch keine Aktivierung, Einstellungsmutation, Playbackprobe oder tatsächliche UI-Abnahme durchgeführt. Gesamtumfang P19 bleibt offen.

### P19 tatsächliche Music-Bot-UI, Validierung und Wiederherstellung, 05.10.2026

- Getesteter HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Profil test; keine Music-Bot-Produktdatei geändert. Prozesspreflight: echter SoundbotProcessRegistry-Scanner im Sandboxprozess EPERM, außerhalb Sandbox bounded Scan timedOuttrue/accessDeniedfalse/scannerFailedfalse. Unabhängiges read-only Get-Process -Name mpv um07:14:52.396Z findet0Prozesse. Kein fremder Prozess beendet. Die frühere allgemeine Cacheblockade wurde bereits oben präzisiert.
- Helper %TEMP%\ltth-music-ui-0716-enable.js prüft test/requiresRestartfalse und deaktiviertes Plugin. Readonly test.db:0plugin:music-bot:-Settings,0plugin_music_bot_-Tabellen; neue SQLite-Onlinesicherung %TEMP%\ltth-audit-20261005-before-music-ui-0716.db und Baseline-Metadaten %TEMP%\ltth-music-ui-0716-before.json. Normaler enable POST HTTP200/successtrue/disabledPlugins[], kein App-Neustart und keine Talking-Heads-Lifecycleaktion.
- **Bestanden (tatsächliche lokale UI):** /plugins/music-bot/ui lädt deutsche Player-/Queue-/AutoDJ-/History-/Catalog-/Playlist-/Settings-/Alias-/Moderation-/Overlay-Tabs. Sichtbare Queue0, AutoDJaus, keine laufende Wiedergabe. Setup-API bestätigt mpvAvailabletrue/ytdlpAvailabletrue; Einstellungsseite zeigt vorhandenen autodetektierten mpv-Pfad und yt-dlp, Geschenkekatalog757sichtbareGeschenke/796API-Einträge. Keine Einstellung gespeichert, Installation gestartet oder externe Musiksuche ausgeführt.
- **Bestanden (tatsächliche lokale Schutzprüfung):** Safety-Lock aktiv, Testton/Pause/Resume/Skip-UI deaktiviert. Normaler lokaler skip POST HTTP423/successfalse mit deutscher Safety-Lock-Meldung; Queue danach0. resolve ohne Query GET400 und request{} POST400 jeweils Missing query. UI-Klick Song anfordern mit leerem Feld bleibt ohne sichtbare Rückmeldung; ui.js hat dafür bewusst early return. Kein leerer Song hinzugefügt; daraus hier kein zusätzlicher Produktbug abgeleitet.
- **Blockiert in aktueller Laufzeit:** Status aktualisieren zeigt IPC gestört/letzter Fehler Soundbot process scan timed out. Der Lock wurde nicht gelöst. Tatsächliche Audiowiedergabe/Testton/Skip eines laufenden Songs/Crossfade sind mit dieser Prozessdiagnose nicht ausgeführt und nicht bestanden; Timeout getrennt von bloßem mpv-Vorhandensein dokumentiert. Die genaue Ursache des Scanners bleibt ungeklärt, kein bestätigter Produktfehler daraus abgeleitet.
- **Bestanden (lokaler Overlay-Einstieg):** UI-Overlaytab bietet Design compact/banner/minimal/card,4Themes,6Positionen, lokales Kopieren, TikTok-Studio-URL kopieren und Öffnen. Angezeigte URL http://127.0.0.1:3000/plugins/music-bot/overlay.html?design=compact&theme=default&position=bottom-left. Eigener Browseraufruf lädt Music-Bot: Aktueller Titel mit Warte auf Musik, Queue ist leer und Nextsong/Voting-Bereichen. Keine öffentliche URL aus diesem Test, keine hörbare Reaktion und kein echter Songwunsch beobachtet.
- Wiederherstellung: normaler disable POST erfolgreich; eigener Helper stoppt weitere Settingsbereinigung zunächst bei2nichtleeren initialisierten Playlistzeilen, keine Daten gelöscht. Source PlaylistStore._ensureViewerRadio/_ensureStreamerPlaylist bestätigt2Defaultplaylists beim Erstinit. Andere22initialisierte plugin_music_bot_-Tabellen haben0Zeilen, Queue/History/Songs0. Nach erneutem Profil-/disabled-/Baselineguard wurde ausschließlich selbst erzeugter key plugin:music-bot:config entfernt; Eskalation wegen außerhalb Workspace liegender readonly-sandboxgeschützter DB erfolgreich freigegeben. Finale Ausgabe musicBotEnabledfalse/removedOwnConfig1/remainingSettings0/defaultPlaylistsRetained2. Initialisierte leere Tabellen und2Defaultplaylists bleiben ausdrücklich erhalten, keine ganze Datenbank zurückgesetzt, keine vorhandenen Live-XP-Daten geändert.
- Eigene Tabs63/64 geschlossen. Prozess-/Cache-Nachkontrolle separat unmittelbar unten. P19-Wünsche/Suche/Queueinhalt/Regeln/Rechte und tatsächliche Wiedergabe bleiben weiter offen; diese UI-/Negativchecks sind keine Gesamtfreigabe.

Cache-/Prozessnachkontrolle P19 um2026-10-05T07:20:28.7210920Z:202Dateien/749827604Bytes/1erkanntePublished-Datei unverändert gegenüber Preflight;0mpv-Prozesse. Kein bestehendes Cachemedium entfernt oder hinzugefügt.

### LTTH-LIVE-043 — P1: Music-Bot-Moderatorbefehle und Force-Skip für gewöhnliche Teammitglieder freigegeben

- Betroffen: P19 Music Bot, A3 Rollenzuordnung, lokale Chat-Command-Rechte. HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, Windows/bundledNode22.14.0,05.10.2026; Profil test als Laufzeitumgebung, Reproduktion vollständig isoliert ohne Profildatenänderung. Music-Bot-Dateien nicht geändert; parallele Talking-Heads/TTS-Arbeit unberührt.
- Voraussetzung: tatsächlicher CommandParser, commandPrefix!,pause/skip mit permission mod. FakeDatabase enthält ausschließlich eigenen Streamer AUDIT-streamer; ChatCallback und onCommand sammeln nur im Arbeitsspeicher. Keine Anbindung an echte Chatantworten, Queue, mpv oder TikTok.
- Reproduktion:
  1. Parser mit eigenem gewöhnlichem Viewer/isModeratorfalse/teamMemberLevel0 und !pause aufrufen: abgewiesen.
  2. Gleichen Viewer mit isModeratorfalse/teamMemberLevel1 und !pause aufrufen: Callback erhält {type:pause}.
  3. Gleichen nichtmoderierten Viewer mit !skip aufrufen: Callback erhält {type:skip,force:true}.
  4. Kontrollaufruf mit isModeratortrue/teamMemberLevel0: zugelassen. Assertions prüfen alle Ergebnisse, Helfer Exit0.
- Erwartet: Eine mod-Berechtigung verlangt tatsächlichen Moderator-/Streamerstatus; bloße Teammitgliedschaft darf keine Playersteuerung oder Force-Skip erlauben.
- Tatsächlich: _hasPermission('mod') akzeptiert isModeratortrue ODER teamMemberLevel>=1. _buildCommandPayload skip setzt für konfigurierte mod-Berechtigung forcetrue. Der _handleCommand-Pfad würde damit _skipCurrent statt Zuschauer-Voting auswählen. Im Helfer wurde dieser Playbackpfad ausdrücklich nicht ausgeführt.
- Testquelle: synthetische Daten, tatsächlicher Parser, isolierte FakeDB/Callbacks. Beleg %TEMP%\ltth-music-command-permissions-isolated.js: ordinaryDeniedtrue,teamNonModeratorPauseAdmitted[{type:pause}],teamNonModeratorForceSkipAdmitted[{type:skip,force:true}],actualPlaybackCalls0. Quelle command-parser.js157/84; deterministisch reproduziert.
- Auswirkungen: Bei aktivem Plugin und mod-konfigurierten Befehlen können gewöhnliche Teammitglieder Moderatoraktionen erreichen. Tatsächlicher unerlaubter Skip/Audioeingriff im Livebetrieb nicht beobachtet; keine öffentliche Nachricht gesendet. Gleicher Rollengrenzenfehler wie LTTH-LIVE-034 im GCCE, hier eigenständiger Music-Bot-Parser und Force-Skip-Folge.
- Quellbefund bestätigt; genaue Herkunft/Normalisierung eines tatsächlichen mod-Badges bleibt separat offen. Kein Produktfix vorgenommen.

### P19 ergänzende isolierte Command-Matrix, 05.10.2026

| Funktion | Status | Beleg/Grenze |
|---|---|---|
| Zuschauer ohne Moderator-/Teamstatus mod-Befehl | bestanden | tatsächlicher Parser weist eigenen Viewer ab |
| Gewöhnlicher Teamviewer mod-Befehl/ForceSkip | Bug bestätigt | LTTH-LIVE-043, Parserpayload; kein reales Playback |
| Moderatorflag/Streamer-Superfan-Bypass | bestanden | isolierter Parser und eigene StreamerDB |
| Alias !song/Query Title by Artist | bestanden | normalisiert zu Artist Title; keine externe Suche |
| Superfan-only mit bloßem Subscriber/Team1 | bestanden | abgewiesen; ausdrücklich kein echter Superfanbeleg |
| Explizites isSuperFantrue | bestanden | synthetischer Parserfall, nicht Live-Erkennung |
| Tatsächlicher Songwunsch/Suche/Queue/Skip/Audio | nicht beobachtet | aktuelle UIchecks/Parserfälle ersetzen keine Medien-/Liveabnahme |

### P19 Queue-/Voting-Regeln mit tatsächlichem Modul und SQLite, 05.10.2026

Helper %TEMP%\ltth-music-queue-isolated.js, bundledNode22.14.0, Exit0; tatsächlicher QueueManager und better-sqlite3 :memory:, ausschließlich AUDIT-Songs/Viewer mit example.invalid-URLs.0Netzwerkrequests/0Playbackcalls/0Fehlerlogs. Aktive App bleibt Music-Bot-deaktiviert, keine test.db- oder Cachemutation.

| Teilfunktion | Status | Beleg/Grenze |
|---|---|---|
| Dauer0/über Maximum60s | bestanden | queueDurationUnknown/queueDurationTooLong |
| Strikte Duplikatsperre | bestanden | gleiche URL abgewiesen, fremder Requester ändert dies nicht |
| Casefold-Cooldown30s | bestanden | AUDIT-A/audit-a gemeinsam gesperrt |
| Gift-Cooldown-Bypass | bestanden | eigene synthetische isGiftRequesttrue umgeht Cooldown |
| maxPerUser2/gesamteQueue3 | bestanden | dritte eigene Anfrage/Queue4 abgewiesen |
| Remove mit veralteter erwarteter ID | bestanden | QUEUE_ITEM_CHANGED, Eintrag bleibt erhalten |
| Reorder/SQLite-Rekonstruktion | bestanden | drei IDs nach Verschieben und neuer Instanzrestore identisch |
| Skip10%von30=min3/Duplikatstimme | bestanden | erforderlich3, gleiche Casefold-Identität nur einmal |
| Skip-Immunität hinzufügen/entfernen | bestanden | geschützt kein Skipvote, nach Entfernen Vote1 |
| History skippedflag/Clear | bestanden | SQLite skipped1, Queue0/currentnull/Voters0/Immunity0 |
| Reales Media-/Audio-/Live-Queue-Verhalten | nicht beobachtet | isolierte Regeln und SQLite-Memory sind keine tatsächliche Medienabnahme oder App-Neustartpersistenz |

### LTTH-LIVE-044 — P2: Music-Bot-Prozessscan verliert den zugesagten Fünf-Sekunden-Zeitrahmen

- Betroffen: P19 SoundbotProcessRegistry.findMarkedProcesses, PlaybackController-Prozessdiagnose. HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9,05.10.2026,Windows/bundledNode22.14.0. Keine Music-Bot-Datei geändert; vollständig isolierter Test ohne App-/Profil-/Prozessmutation.
- Voraussetzungen: tatsächlicher SoundbotProcessRegistry mit dokumentiertem listProcesses-Injektionspunkt; eigener Provider liefert leere Prozessliste nach2500ms. Keine echte Prozessabfrage und keine Termination im Reproduktionshelfer.
- Reproduktion:
  1. Registry mit listProcesses erstellen, das erhaltenes timeoutMs protokolliert und nach2500ms [] liefert.
  2. findMarkedProcesses({timeoutMs:5000}) aufrufen und vergangene Zeit messen.
  3. Rejection und Providerabschluss getrennt prüfen.
- Erwartet: Ein innerhalb des ausdrücklich erlaubten5000ms-Budgets erfolgreich abschließender2500ms-Scan liefert [] zurück.
- Tatsächlich: Provider bekommt5000ms, öffentliche Methode verwirft dennoch nach2007ms mit Soundbot process scan timed out. Provider läuft weiter und beendet danach erfolgreich; keine Prozesse beendet. Alle Assertions bestanden, Exit0.
- Beleg: %TEMP%\ltth-music-scan-budget-isolated.js, Ausgabe requestedScanBudgetMs5000/providerBudgetMs5000/providerCompletesInMs2500/rejectedAfterMs2007/processesKilled0. Source SoundbotProcessRegistry MAX_PROCESS_SCAN_MS5000, _settleWithin clamp MAX_CLEANUP_MS2000; PlaybackController PROCESS_SCAN_TIMEOUT_MS5000 und tatsächlicher reconcileProcesses-Aufruf nutzen denselben widersprüchlichen Pfad.
- Testquelle: synthetischer zeitgesteuerter Provider mit tatsächlicher Registry. Reproduzierbarkeit deterministisch mit kleinem Scheduling-Spielraum; keine Kontrolle/Verlangsamung bestehender Prozesse.
- Auswirkungen: Scans zwischen2und5Sekunden werden falsch als Timeout klassifiziert; Diagnose/Reconciliation kann trotz rechtzeitigem Ergebnis fehlschlagen. Der reale UI-Befund IPC gestört/Soundbot process scan timed out ist separat oben belegt. **Hypothese:** dieser Budgetfehler trägt zum tatsächlichen Windows-Timeout bei; tatsächliche CIM-Laufzeit im App-Prozess nicht gemessen, daher keine definitive Gleichsetzung.
- Keine Produktkorrektur. Cleanup-Terminierungsbudget2000ms selbst wird hier nicht beanstandet; betroffen ist dessen unbeabsichtigte Wiederverwendung für den5000ms-Scan.

P19 Requestgates ergänzend: %TEMP%\ltth-music-request-gates-isolated.js, Exit0 nach Korrektur unvollständiger Fake-BanList im Testhelfer (kein Produktbug). Tatsächliches MusicBotPlugin._handleRequest über prototype, eigene In-Memory-Like-/Credit-/Pendingmaps, FakeResolver/FakeQueue/noopChat-/Toast-/Playbackhooks. **Bestanden (isoliert):** Likegate5 und PayToPlaycreditgate verhindern vorzeitig Resolveraufruf; Erfolg verbraucht genau1Credit; Queueablehnung lässt Credit bestehen; Resolverexception räumt pending auf und bewahrt Credit; Doppelrequest/Pending und Userban führen zu keinem weiteren Resolveraufruf.0Netzwerk/0Playback/0öffentlicheAntworten. Damit keine reale Suche/Queue/UI-Audio oder echte Giftcreditvergabe abgenommen.

### A2/A3/A4 neuer tatsächlicher Stream S4 und P14 Follower-Zielfenster, 05.10.2026

- Passiver Helper ltth-live-current-window-20261005.js, tatsächliches Fenster07:23:36.139Z–07:24:21.175Z: before/afterconnectedfalse,handle danutlungu151,restartingfalse,0tiktok-/Pluginereignisse. Aktueller TikTok-Tab zeigt ausdrücklich LIVE ist zu Ende/1.2K Zuschauer*innen. Browser-Restchatinhalte nicht als neue Aktivität gewertet. **Bestanden (begrenzte Zustandsbeobachtung):** LTTH getrennt nach tatsächlichem Streamende; tatsächlicher disconnect-Payload/Zeitpunkt und automatischeReconnectversuche wurden nicht erfasst und damit nicht abgenommen.
- Eigenes Follower-Ziel goal_AUDIT20261005-followers-live-0728 wurde mit Backup/testguard/numerischenFlags normal erstellt, lokale Overlay-UI zeigt0/1. Passive45s07:24:14.168Z–07:24:59.175Z ohneEvents; Folgecurrent0/target1/enabled1. Kein Fortschrittpass im getrennten Zustand. Nach genauer eigener ID+Name per normalemDELETE HTTP200 entfernt,ownGoalRemainingfalse/totalGoals0,eigenerTab65geschlossen.
- Neue echte Quelle **S4 https://www.tiktok.com/@enisa.salihi/live**: tatsächlicher Browsertitel Enisa Salihi (@enisa.salihi) ist LIVE, Zuschauercount268 (Vorschlag272), sichtbare Chat- und Joinaktivität. Keine Nachrichten/Follow/Gifts/Anmeldung ausgelöst. Öffentliche Chattexte nicht in Bericht kopiert.
- %TEMP%\ltth-enisa-connect-0728.js: guardtest/noRestart, neuer nichtprimärer eigener Alias enisa.salihi,label AUDIT20261005-enisa-0728; Baselineexistedfalse in %TEMP%\ltth-enisa-alias-0728-before.json gespeichert. Erster normalerConnect HTTP428/fallback_confirmation_required. Regulärer bereits im autorisierten Livetest verwendeter fallbackKeyConfirmedtrue-Parameter in ltth-enisa-connect-0728-confirm.js: HTTP200/successtrue/profileSwitchedfalse/statuslive_identity_pending, danach APIconnectedtrue/handleenisa.salihi/profiletest/requiresRestartfalse/restartingfalse. Keine Fallback-Credentials ausgelesen, kein Apprestart/anderesProfil angefasst.
- Tatsächliches Dashboard nach Sidebarwechsel zeigt Verbunden @enisa.salihi/test, Streamlaufzeit00:00:36,Zuschauer285,Likes4636/Coins0/Followers0/Gifts0. Spätere neutrale DOMprobe Laufzeit00:01:09/Zuschauer291/Likes4775,weiterVerbunden/test. **Bestanden:** aktuellerHandle/Profil/Status, Laufzeit-/Zuschauer-/Likeanzeige verändert sich. Vollständiges Zählerreset-/Eventlog-/Duplicate-/Badgeverhalten daraus nicht abgeleitet.
- Neues eigenes Follower-Ziel goal_AUDIT20261005-followers-live-0730/name AUDIT20261005-Followers-Live-0730 mit neuem Backup %TEMP%\ltth-audit-20261005-before-followers-live-0730.db (273375232Bytes), normalerPOST200/initial0target1/enable1/reset0/firework0/hide. Backup unter aktiven Schreibzugriffen verzögert, daher erst nach tatsächlich gemeldetem created beobachtet; kein Prozess vorschnell neu gestartet.
- Echter passiver Connectorzeitraum07:26:50.905Z–07:27:35.915Z: join41/like12/chat6,gifts0/coins0/ownGoalUpdates0. Follower0, Abschlusscurrent0target1enabled1. Lokaler eigener Overlaytab66 zeigt Followericon/eigenenNamen/0%/0von1/1remaining. **Bestanden:** initiale lokale Followerdarstellung und aktiver Eventempfang; **nicht beobachtet:** tatsächlicherFollowerfortschritt/Zielabschluss/Hide/öffentlicheURL. Kein synthetischerFollow zum Erfüllen des Livefensters gesendet.
- GezielteCleanupprüfung unten: eigenerNormalDELETE200/successtrue/ownGoalRemainingfalse/totalGoals0. EigenenTab66 geschlossen, eigener Beobachtungssocket finally getrennt. NeuverbundenerStream und ausschließlich eigener temporärerAlias bleiben für die weitere Liveprüfung; amEnde Alias gezielt entfernen. Keine Live-XP-/Userdaten zurückgesetzt.
- Ergänzend ltth-goals-lifecycle-gates-isolated.js Exit0: tatsächlicher GoalsEventHandlers mit eigenem resetCounter; neueStreamsession dedupliziert, isNewStreamfalse/fehlendesIdentitytoken keinReset; transiente/1006/nichtLiveDisconnects erhaltenZustand; terminaler1000wasLivetrue genaueinmalReset.3kontrollierteCountercalls/0echteProfilresets. **Bestanden (isolierter Gatevertrag)**; tatsächlicher Streamende-Datenreset bleibt ohne beobachtete vorhandene Resetziele unbewiesen.

### P9 klassische Fireworks-UI und tatsächlicher Canvas-Fallback, 05.10.2026

- Ausgang: test/requiresRestartfalse, Fireworks und WebGPU-Fireworks beide deaktiviert. 0plugin:fireworks:-Settings in readonly test.db; ausschließlich diese betroffenen Settings als Baseline %TEMP%\ltth-fireworks-0732-before.json gesichert. Alter Pluginuploads-Ordner0Dateien, initMigration kopiert nur fehlende Dateien und entfernt keine; keine Uploadaktion ausgeführt.
- ltth-fireworks-0732-enable.js normalerenable HTTP200/successtrue/disabledPlugins[]. Effektkonfiguration enabledtrue/rendererauto/giftTriggersEnabledtrue/minGiftCoins1/followerFireworksEnabledfalse/randomEnabledfalse/audioEnabledtrue/interactiveEnabledfalse/chatTriggerEnabledfalse. Keine Talking-Heads-Lifecycleänderung und kein Apprestart.
- **Bestanden (tatsächliche lokale UI):** /fireworks/ui lädt deutsche Aktiviert-/Nacht-/1080pQuerformat-/60FPS1000Partikel-/QueueausAdaptivan-Anzeige, Test-/Savebuttons und Presetkarten Höchste/Hoch/Mittel/Niedrig/Sparmodus/Kartoffel mit sechs Anwendenbuttons. Preset-Rendering ist keine bestätigte Anwendung/Persistenz aller Presets; kein Benchmark hier ausgeführt.
- Eigener Overlaytab /fireworks/overlay lädt zwei sichtbareCanvasflächen und Followeranimationscontainer. Engine-Browserlogs WebGL2 renderer initialized successfully/Atlas64Slots59frei, DEtranslationsloaded; abgefragte Warn-/Errorlogs[]. DiagnosticUI per vorhandener D-Taste aktiviert (kein injectedAppstate). Erste FPS0/Renderer- waren Debugfelder vor Aktualisierung, später60/61 WEBGL normalQ0; daraus kein Initbug abgeleitet.
- Tatsächlicher UIbutton Feuerwerk testen zweimal zeigt Feuerwerk ausgelöst. Späte Pixelproben ohne erfasste Partikel kein Einzelrocket-Renderingpass; Zeitpunkt der kurzlebigen Animation nicht eindeutig korreliert.
- Normaler lokaler FinalePOST /api/fireworks/finale intensity1/duration5000,07:30:18.728Z HTTP200/successtrue. Unmittelbare tatsächliche Pixel-/AXprobe FPS59/Particles319/WEBGL normalQ5, Pixelbild schwarz außerDebugtext. Canvas-geometrie beideRect1280x720bei0,0, Hauptcanvasopacity1/visibilityvisible/displayblock/Z1; Transitioncanvasopacity0/Z2. **Ungeklärter Browserbefund**, keine bestandene WebGL-Pixelabnahme und noch kein neuer bestätigter Produktbug: Capture-/Frame-/Rendererursache nicht isoliert.
- Für tatsächlichen angebotenen Fallback normaler configPOST renderer canvas/audioEnabledfalse HTTP200; danach eigener FinalePOST07:30:51.114Z intensity1/duration5000 HTTP200. **Bestanden (tatsächliche lokale Pixel-/AXanzeige):** mehrere farbige Partikelgruppen auf transparenter/hell dargestellter Fläche; FPS56/Particles472/CANVAS normalQ5. Test war lokal manuell, kein echtesGift/Follow/Goalfinále, kein hörbarerAudio- oder OBSbeleg.
- Wiederherstellung ltth-fireworks-0732-restore.js: erneuttestguard/gesicherteBaseline, regulärerdisableHTTP200success, ausschließlich eigener plugin:fireworks:settingskey zurückauf0Settings (Baseline0). DBaußerhalbWorkspace erfordert erlaubteEskalation; Ergebnisrestore0/baseline0. EigeneTabs67/68geschlossen, keine User-/XP-/Giftstatistik gelöscht. BaselineWebGPU-Fireworks nicht aktiviert/verändert. KeinProduktcodepatch.

| P9 Teilumfang | Status | Beleg/Grenze |
|---|---|---|
| Aktivierung/deutsche UI/Deaktivierung/Configrestore | bestanden | tatsächliche API-/UI-/DBprüfungen oben |
| Lokale Finaleauslösung | bestanden | normalerPOST200; AnimationCanvasFallbackkorreliert |
| Canvas2D-Fallback tatsächliches Rendering | bestanden | sichtbareFarben/472Partikel/56FPS |
| WebGL2-Initialisierung | bestanden | tatsächlicherRendererlog/FPS59; keine pauschalePixelabnahme |
| WebGL2 tatsächliche Finale-Pixel | nicht beobachtet | Partikel319 abererfasstesBildschwarz, Ursacheoffen |
| EchtesGift/Serien/Combos/Follower/Chat/Goaltrigger | nicht beobachtet | keine solchen Events mit aktivemOverlaykorreliert |
| Giftmapping/Shapes/Presetanwendung/Benchmark/Limits | nicht beobachtet | tatsächliche UIinventur und Configwerte decken Verhaltennichtab |
| HörbaresAudio/PublicTunnel/Stabilitätslast | nicht beobachtet | lokaleFallbackprobe und Initlogs sind keinBeleg |

### P9 ergänzende tatsächliche Backend-Regeln, 05.10.2026

%TEMP%\ltth-fireworks-rules-isolated.js, bundledNode22.14.0/Exit0. Tatsächlicher FireworksPlugin-Konstruktor/loadConfig/handleGiftEvent/updateComboState/getEscalationTier sowie tatsächliches evaluateTriggerPolicy. Eigener FakeAPI mit getConfig null und ungenutztemTemp-Datenpfad; init nicht gestartet, triggerFirework sammelt nur3Payloads im Arbeitsspeicher.0Netzwerk/0AppEvents/0Plugin-Dateischreibvorgänge, keine echte Giftinjektion oder Configmutation.

| P9 zusätzliche Regel | Status | Beleg/Grenze |
|---|---|---|
| Normalisierte Giftserie coins15/diamond5/repeat3 | bestanden | payloadcoins15, kein erneutesRepeatmultiplizieren |
| Rawfallback diamond5/repeat3 | bestanden | payloadcoins15 |
| Combo-Wachstum/10sTimeout/Max5 | bestanden | zweiterGiftcombo2/intensity*1.2, ownlasttimestamp10001msalt reset1,50FolgeaufrufeMax5 |
| GiftspezifischeShape/Intensity/Farbe/Tier | bestanden | eigenesGift2 heart/intensity2/#ff0000/100coinsmedium |
| Mindestcoins und Eskalationsgrenzen | bestanden | coins0keinTrigger,500big/1000massive |
| Niedrig-FPS-Smallgift | bestanden | FPS20unter24 deny low-fps-small-gift |
| 60%-Lastsmallgift/Maxconcurrencymedium | bestanden | smallbei6/10denied,mediumbei10/10 concurrent-limit |
| GroßeGiftsunterLast | bestanden | bigallowed/reduced/Partikel700beiGlobalcap1400 |
| Finale-Bypass mit Partikelcap | bestanden | schlechteFPS/hoheLastallow,9000angefragt=>1400 |
| TatsächlicheLive-Serie/Combo/Render-Last | nicht beobachtet | echteMethoden mit In-Memory-Payloads sind keine Connector-/Browserabnahme |

Die Policy erlaubt bewusst großeGifts oberhalb der konfiguriertenConcurrency und begrenzt ihrePartikel; daraus ohne geklärte Anforderung kein zusätzlicher pauschalerConcurrencybug abgeleitet. Konfig-/Renderer-/öffentlicheURLprüfungen aus vorigemAbschnitt behalten ihren jeweiligen begrenztenStatus.

### LTTH-LIVE-045 — P1: Quiz Show akzeptiert Antwortpräfixe, wertet korrekte !a-/a-Antworten aber als falsch

- Betroffen: P22 Quiz Show, Antwortparser/Punkte/AnswerProgress, außerdem FastestFinger-/Marathon-Korrektheitsprüfung. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9,05.10.2026,Windows/bundledNode22.14.0. Quizdateien unverändert; AppProfiltest bleibt, Quizplugin deaktiviert. Reproduktion ausschließlich isoliert, keine gemeinsame quiz_show.db geöffnet.
- Voraussetzungen: tatsächlicher QuizShowPlugin-Konstruktor, klassische Runde mit vier eigenen Antworttexten und correct0. Default allowExclamationtrue/allowPlainLetterstrue/allowFullTexttrue; für zusätzlichen /a-Fall allowSlashtrue. addPoints/applyAnswerProgress und api.emit sammeln ausschließlich im Arbeitsspeicher; init/startRound nicht aufgerufen.
- Reproduktion:
  1. Eigene Frage AUDIT? mit Antworten Correct text/Wrong1/Wrong2/Wrong3, correct0 setzen.
  2. Jeweils frische Instanz verwenden und handleAnswer(AUDIT-user,AUDIT-user,a bzw !a bzw /a bzw Correct text) aufrufen.
  3. Gespeicherten answerIndex0 und answers.size1 prüfen; alle vier Formate werden angenommen.
  4. Tatsächliches calculateResults aufrufen und Gewinner/Punkte/Progress vergleichen.
- Erwartet: Alle aktivierten Formate für dieselbe korrekte Option A gelten gleich als richtig und erhalten die configured100Erstgewinnerpunkte.
- Tatsächlich: a und Correct text => correctUsers1/points100/Progresscorrecttrue. !a und aktiviertes /a => correctUsers0/points0/Progresscorrectfalse. Es handelt sich nicht um eine Parsingablehnung: answerIndex0 und answer-received-Pfad sind erreicht.
- Testquelle: synthetische Frage/Chatdaten mit tatsächlichem handleAnswer/calculateResults/isAnswerCorrect, isolierte Resultatcallbacks. Beleg %TEMP%\ltth-quiz-prefixed-answer-isolated.js,Exit0, viergenaueAssertions; databaseWrites0/networkRequests0/appEvents0. Keine echte öffentliche Chatantwort oder Livepunktemutation durchgeführt.
- Quellbefund: handleAnswer entfernt Prefix für answerIndex, speichert aber answer:message unverändert. calculateResults prüft isAnswerCorrect(answerData.answer,correctIndex,correctText); isAnswerCorrect akzeptiert ausschließlich nackten Buchstaben oder identischenFullText und entfernt keinePrefixes. Dieselbe Rohmessageprüfung ist in FastestFinger/Marathon sichtbar; tatsächlicher Abschluss dieser Modi hier nicht ausgeführt, Auswirkung dort quellgestützt.
- Reproduzierbarkeit: alle vier isolierten Kontrollfälle deterministisch. Auswirkung: standardmäßig beworbenes !a-Format kostet korrektantwortendenViewern Punkte und kann sie als falsch in Progress/Streak-Verarbeitung führen. Slashfall nur bei ausdrücklich aktivierterSlashoption betroffen. Kein Produktfix vorgenommen.

### P22 präzisierte Teilmatrix, 05.10.2026

| Teilumfang | Status | Beleg/Grenze |
|---|---|---|
| Gemeinsame Fragen-/Konfigdatenbank vs Testprofil | blockiert | initDatabase weiterhin ConfigPathManager quiz_show/quiz_show.db, Migration/Seeding/Historycleanup |
| NackterBuchstabe/FullText klassischeAuswertung | bestanden | eigenerIndex0/100Punkte, tatsächlicheMethoden,isoliert |
| Aktiviertes !-/Slash-Antwortformat | Bug bestätigt | LTTH-LIVE-045, angenommenaber0Punkte/falsch |
| TatsächlicheFragenverwaltung/Generierung/Pakete/Shows | blockiert | gemeinsameDB soll im Testprofilauftrag unverändertbleiben |
| Voting/Duell/Joker/Rankings/Season/Achievements | blockiert | realeAppaktivierung mit gemeinsamerDBnichtausgeführt |
| Rundenstart/-ende/AutoRestart/LMS/Marathon/Slots | blockiert | isolierte bestehendeTests keinLive-/UIbeleg |
| Drei lokale/publicOverlays/Layout/Wizard/AudioTTS | blockiert | Plugininaktiv, keine gerenderte sichereInstanz; reineQuellinventur getrennt |

Offered scope anhand aktuellem Konstruktor/Methodeninventar ergänzt: classic/fastestFinger/elimination/marathon, LastManStandingjoin/eliminate/winner, KategorieVoting, KategorieSlots, Fragenpakete/Shows, SetupWizard/BrandKit/Layout, Antwortrechte/GCCE, GiftsJoker/QuizStartgift, sechssekündigeResultat-/Leaderboardanzeige, Seasonrankings/Achievements, Frage-/TTSGenerierung. Inventar allein kein Funktionspass. Kein anderer Profil-/Quizdatenbestand geändert.

### A2 negative Connectvalidierung ohne Verbindungseingriff, 05.10.2026

%TEMP%\ltth-connect-validation-0738.js, bundledNode22.14.0,Exit0. Vor-/Nachguard activeProfiletest/requiresRestartfalse, APIisConnectedtrue/usernameenisa.salihi/restartingfalse. Vier reguläre lokale POST /api/connect mit fehlendem username,leeremString,ungültigem Zeichen AUDIT!invalid und Array stattString: jeweilsHTTP400/successfalse. Validator läuft vor Alias-/Profil-/Connectorpfad; kein zusätzlicher Alias, keinProfilwechsel,keinDisconnect/Restart durch diese Eingaben. **Bestanden** für exakt diese API-Validierungsfälle; kein Nichtlive-/Netzwerk-/Login-/Fallbackfehler dadurch abgenommen.

Tatsächliches aktuelles Dashboard nachRequests: Verbunden/test,connectdisabletrue/disconnectdisablefalse,Laufzeit00:08:06,Zuschauer307,Likes7824/Coins1/Followers2/Gifts1. Zähler belegen angezeigten Streamzustand; die zweiFollows und einGift sind nicht mit diesem Validatorfenster/Plugin-Reaktionen korreliert. Keine öffentlichenMessages/Gifts/Accountänderungen. Viewer-XP-Quellprüfung für frühere hoheUpdatezählung: tatsächlicher WatchTimeTrackingtick30s iteriert aktivewatchTimers und emitXPUpdate enthält actionType; hoheGesamtzählung allein weiterhin keinDuplikatbug oder korrektesWatchTime-Pass.

### P14 Follower-Ziel zweites aktives begrenztes Fenster S4, 05.10.2026

- ltth-goals-followers-live-0738.js prüft test/noRestart/isConnectedenisa.salihi,vorhandenenRecoverySnapshot before-followers-live-0730.db sowie leereGoalbaseline. RegulärerPOST erstellt ausschließlich goal_AUDIT20261005-followers-live-0738,name AUDIT20261005-Followers-Live-0738,typefollower,target1/current0/enabled1/reset0/firework0/hide,HTTP200. Kein eigener Increment/TestFollow.
- Tatsächlicher eigener Overlaytab69 initial0%/0von1/1remaining, spätereDOMprobe Containerdisplayblock/opacity1 weiterhin0/1. Echtes passives60sFenster07:34:52.652Z–07:35:52.665Z liefert join57/chat11/like9/gift1,follow0,ownGoalSignals{}. FinaleAPIcurrent0target1enabled1. **Nicht beobachtet:** tatsächlicherFollowfortschritt/Zielabschluss; einzelneGiftreaktion nicht Teil diesesFollowerziels. LiveGiftSerienfelder nicht mitgeschnitten, keinSerienpass.
- Socketfinallygetrennt/Exit0. GezielterCleanuphelper exactID/name/testguard normalDELETE200/successtrue/ownGoalRemainingfalse/totalGoals0;Tab69geschlossen. BestehendeLiveViewer-/XPdatenunverändert, keinWholeDBrestore. BegrenzteFenster decken selteneFollowereignisse weiter nicht ab; keine unbegrenzteWartezeit und keine künstlichenEvents alsLivebeleg.

### P16 aktuelle Live-XP-Aktionen, Datenbankspeicherung und lokale Rangliste, 05.10.2026

- %TEMP%\ltth-viewer-xp-live-persistence-0741.js, bundledNode22.14.0/Exit0. Vorab activeProfiletest/requiresRestartfalse. Ausschließlich passiver eigenerSocket und readonly better-sqlite3 test.db, prepared SELECT total_xp_earned FROM viewer_profiles WHERE username=? je empfangenem Update. Vieweridentitäten/Profilpayloads nicht gespeichert oder ausgegeben; exakteEnvelope-Duplikate nur über SHA256 im Arbeitsspeicher gezählt. Kein getViewerProfile mit Schreibnebeneffekt, keine XP-/Coinmutation.
- Tatsächlicher Stream enisa.salihi weiterconnectedtrue. Fenster07:36:54.658Z–07:37:39.679Z: like36/join39/chat5/gift1. XPupdates347: watch_time_minute299/daily_bonus38/like5/chat_message4/other1. other ist nur Whitelist-Restklasse; daraus keine eindeutige Gift-Korrelation oder eigener Bonuspass. Keine Follows/Shares/Subs in diesemFenster.
- **Bestanden (enge echteLive-/Persistenzprüfung):** alle347Updates haben gespeicherten viewer_profiles-Datensatz; dbObserved347/missingProfile0/queryErrors0, keinDB-Gesamtwert kleiner als e.profile.total_xp_earned (dbBehindEvent0). Das belegt im laufenden Testprofil sichtbare Speicherkonsistenz nach diesen Updates; keine Apprestartpersistenz, vollständigeBuchhaltung oder korrekteBasis-/Multiplier-/Coinbetrag-Abnahme.
- **Bestanden (enges Duplikatfenster):** duplicateExact0 bei347vollständigen Eventenvelopes. Nichtgleichbedeutendmit bewiesener genau-einmalVergabe: gleichesursprünglichesTikTokereignis mit abweichendenZeitstempeln/Profilwerten wäre hiervon nicht erkannt. Keine pauschaleListener-/Idempotenzfreigabe.
- Präzisierung hoherfrühererXPzählungen: in dieser aktuellen45sStichprobe299von347Updateevents explizit WatchTime. Quellpfad startWatchTimeTracking tickt30s und iteriert aktivewatchTimers; hoheUpdatezahl allein weiterhin kein bestätigterDuplikatbug. Das erklärt diese Stichprobe teilweise, nicht rückwirkend die früheren3703Updates und nicht die Richtigkeit jederWatchTimezuordnung.
- **Bestanden (tatsächliche lokale UI):** eigenerTab70 /overlay/viewer-xp/leaderboard lädt DE-Titel Top-Zuschauer/AlleZeit und zehn sichtbareRangzeilen mitStufe/XP. NeutralerDOMcheck rows10/visibleRows10/xpDescendingtrue/nonnegativetrue. AlteStreamviewer in AlleZeit sind erwartbar, nicht alsveralteterSessionfehlergewertet. KeinePrivateViewertexteimBericht; eigeneTabgeschlossen.
- Reconnect-/Useridentitäts-/Optout-/RateLimit-/Coin-/Milestone-/Levelup-/öffentlicheLivequellen-Abnahme weiter getrennt. KeineSettings-/Plugin-/Profil-/Accountänderung, eigenerSocketfinallygetrennt und readonlyDBgeschlossen. A8-Registryfehler004 bleibt durchlokaleRanglisteunverändert.

### A9/P9 Socket-Lifecycle mit tatsächlichem Loader-Abbau, 05.10.2026

- %TEMP%\ltth-fireworks-socket-cleanup-isolated.js,bundledNode22.14.0/Exit0. Tatsächlicher FireworksPlugin.loadConfig/registerSocketHandlers/destroy und tatsächliche PluginLoader.registerPluginConnectionHandler/invokePluginConnectionHandler/unregisterPluginConnectionHandlers über eigenesLoaderobjekt/eigeneEventEmitter-Socketmap. KeineAppaktivierung,keineNetzwerkverbindung,keineUser-/Profil-/Settingmutation.
- Drei vollständige eigeneRegistrierungs-/Abbauzyklen auf demselbenSocket. JederZyklus registerSocketHandlerszweimal => jeeinHandlerfürfps-update/register-overlay/renderer-fallback/active-count-response; disconnectgenau2 inklusiveeigenervorhandenerexternerListener. EigeneOverlayregistrierung/FPS60 ergibtTelemetry1/currentFps60.
- **Bestanden (isolierterLifecyclevertrag):** nachPlugin.destroy plusLoadercleanup jeweils0Pluginhandler, externerdisconnectListenergenau1unverändert,Telemetry0/connectedSockets0/activeFireworkTimers0/pluginConnectionHandlers0. KeinAnwachsenüber3Zyklen. Die tatsächlichin derAppbereitsdurchgeführteAktivierung/Deaktivierung ist separatvorherdokumentiert; interneAppListenercounts wurdennichtausgelesen und nicht ausdemisoliertenTestbehauptet.
- Präzisierung: Fireworks.destroy selbst entferntrenderer-fallback/anonymousdisconnectnichtmanuell; dasistindiesemaktuellenVertragkeinbestätigtesLeck, weilPluginLoaderbeimRegistrierenalle hinzugefügtenListeneridentitätenerfasstundseineUnregisterphasebeideentfernt. NurPlugin.destroyohneLoaderphasewärekeinvollständigerAppunloadtest. KeinProduktpatch.
- Grenzen: aktiveSocketshutdown-Rennen,echteAppreload-Stabilität,alleanderenPluginsundTikTokhandler-/Router-/Timerabbau bleiben getrennt; dreiisolierteZyklenkeinallgemeinerA9-Pass.

### LTTH-LIVE-046 — P3: WebGPU Weather Control zeigt beschädigte deutsche Zeichen

- Feature: P38/A11, `/webgpu-weather-control/ui`. Getesteter Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026, Windows/bundled Node22.14.0/Codex-IAB, Profil test. Parallel geänderte Talking-Heads-/TTS-Dateien bleiben unangetastet; kein Produktpatch.
- Voraussetzung: WebGPU Weather Control im Testprofil aktiviert, deutsche Appsprache, vollständig geladene UI.
- Reproduktion: 1. Wetter-UI öffnen. 2. Asynchrone Konfiguration/Übersetzungen vollständig laden lassen. 3. Titel, Qualitätslabels und Presetliste lesen. 4. Seite neu laden und nach fertiger Initialisierung erneut prüfen.
- Erwartet: korrekte Umlaute und Gedankenstrich, etwa „Qualitätsprofil“, „Adaptive Qualität“, „Gemütlicher Regen“.
- Tatsächlich: `QualitÃ¤tsprofil`, `Adaptive QualitÃ¤t`, `GemÃ¼tlicher Regen`, Titel `Wetterkontrolle â€“ moderne Konfiguration`; beschädigte Icons ebenfalls vorhanden. Nach Reload und fertiger Initialisierung erneut bestätigt. Frühe englische Initialansicht vor Übersetzung ist kein Gegenbeleg.
- Quelle: tatsächliche gerenderte lokale UI, keine TikTok-Live-Reaktion. Bereinigter DOM-Beleg: fünf beschädigte Labels sowie Titel/Presettexte; keine Schlüssel/Konfigurationspayloads protokolliert. Screenshot nur Toolansicht, kein exportierter Screenshotpfad.
- Reproduzierbarkeit: zwei geladene UI-Zustände desselben Laufs. Auswirkung: Lesbarkeit und deutsche Bedienoberfläche beschädigt. Quellenhinweis: ui.html UTF-8-Deklaration Zeile4; beschädigte Fallbacktexte bereits u.a. Zeilen2238/2310. Hypothese: schon im Quell-/Übersetzungstext beschädigte Kodierung; genaue Entstehung nicht bewiesen.

### P38 weitere lokale Browserdarstellung und Wiederherstellung, 05.10.2026

- Fresh baseline `%TEMP%\ltth-weathergpu-0745-before.json`: Plugin deaktiviert,0 Settings mit Präfix plugin:webgpu-weather-control:,0 Giftmappings. Normal enable200/success/disabledPlugins[]; kein Neustart und keine Aktivierung/Deaktivierung von Talking Heads.
- Eigene UI Tab71/Overlay Tab72 `/webgpu-weather-control/overlay?debug=1`. Tatsächliche lokale reguläre Config-/Trigger-POSTs für snow/fog/sakura, global enabledtrue, Intensität0.8/Dauer15000ms: jeweils200/successtrue. Autorisierungsschlüssel ausschließlich aus readonly test.db im Prozessspeicher an localhost-Header; keine Ausgabe oder Speicherung.
- **Bestanden (enge lokale Darstellung):** Screenshot Schnee zeigt sichtbare fallende helle Partikel, Diagnose60FPS/6ms/3204particles; Nebel graue Fläche,60FPS/6ms/0particles; Sakura rosa Partikel,60FPS/5–6ms/7200particles. Mögliche zeitliche Effektüberlagerung nicht alsisolierterPixeltest gewertet. Diese Screenshots sind Toolbilder ohne exportierte Dateien. Kein GPU-Backend-/Transparenz-/OBS-/public-/echterGifttrigger-Pass daraus.
- Regulärer POST /api/webgpu-weather/stop {} mit lokalem Authheader200/successtrue; danach tatsächliche leere Overlayansicht und Diagnose60FPS/4ms/0particles. **Bestanden** für globalen lokalen Effektstopp. Keine Dauer-/Dauereffekt-/Sequenz-/Laststabilitätsabnahme.
- Erweiterung bestehender **020** auf P38: fertige UI-Presetliste zeigt8Optionen, dieselben4 Namen jezweimal, nach Reload wieder8. Quelle ui.html2601 verbindet builtInPresets und config.presets ungefiltert. Erweiterung **021** auf P38: fertiger Studio-Button zeigt unverändert `common.tiktok_studio.copy_url`. Nur früh vorInitialisierung4englischeOptionen/keinButton; ausdrücklich erst fertiger Zustand alsBeleg.
- Restorative helper `%TEMP%\ltth-weathergpu-0754-restore.js`: Profiltest/noRestart und exakte leereBaseline geprüft; normale disableHTTP200. DB-Bereinigung ausschließlich zwei eigeneSettings bootstrap_v1/weather_config, guarded gegen zusätzlicheSettings oder Giftmappings. Danach Settings0/Mappings0; Tabellen erhalten. Beide eigenenTabs geschlossen. App-/Profil-/Accountzustand sonst unverändert; kein WholeDBrestore.

| P38 Teilfunktion | Status | Beleg/Grenze |
| --- | --- | --- |
| Schnee/Nebel/Sakura lokale Darstellung | bestanden | tatsächlicher Browser und normaler lokaler Testtrigger, keine echtenLiveevents |
| Globaler Effektstopp | bestanden |200 und leere Darstellung/0Particles |
| DE-Zeichen | Bug bestätigt |046, zwei fertig geladene UI-Zustände |
| Presetliste/Studio-Label | Bug bestätigt |020/021 auch P38 |
| Echtlive-Trigger/public/Transparenz/Sequenzen/alleEffekte | nicht beobachtet | dieser zusätzliche Lauf kein Vollpass |

### LTTH-LIVE-047 — P2: EmojiRain-Steuerung akzeptiert nichtnumerische Deckkraft und Geschwindigkeit

- Feature P8/A11, reguläre lokale Overlay-Control-API. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026, Windows/bundledNode22.14.0, laufendes Profil test/requiresRestartfalse, Stream enisa.salihi. Keine Produktdatei geändert; parallele Talking-Heads-/TTS-Arbeit erhalten.
- Voraussetzung: aktives klassisches EmojiRain. Baseline GET /api/emoji-rain/overlay/state200: pausedfalse/theme default/opacity1/speed1. Ausschließlich Laufzeitsteuerung, kein DB-/Preset-/Profilsetting verändert.
- Reproduktion: 1. POST /api/emoji-rain/overlay/opacity mit {"opacity":"AUDIT-invalid"}. 2. Overlaystate abfragen. 3. POST /api/emoji-rain/overlay/speed mit {"speed":"AUDIT-invalid"}. 4. Overlaystate erneut abfragen. 5. Beide Werte regulär auf1 zurücksetzen.
- Erwartet: HTTP400 für nicht endliche/nichtnumerische Eingaben; Laufzeitstatus bleibt bei vorherigen gültigen Werten.
- Tatsächlich: beideHTTP200/successtrue, jeweiliger Antwortwertnull; GET liefert erst opacitynull/speed1, dann opacitynull/speednull. Quellpfad main.js2455ff/2475ff vergleicht unkonvertierte Eingabe numerisch, parseFloat erzeugt anschließend NaN; JSON serialisiert NaN zu null.
- Testquelle: tatsächliche lokale API-Negativfälle, synthetische Eingabetexte; keine öffentliche Nachricht,kein echterTikTokCommand. Beleg %TEMP%\ltth-emoji-controls-validation-0800.js/Exit0, nur neutrale Requests/Status protokolliert.
- Kontrollen: opacity-1/2 und speed0/6 werden jeweils400/successfalse abgewiesen. Normaler Restoreopacity1/speed1 jeweils200; finalerState entspricht exakt gesicherter Baseline (%TEMP%\ltth-emoji-controls-0758-before.json), restoredtrue. Kein Neustart/Plugin-Lifecycle.
- Reproduzierbarkeit: beide verwandten ungültigenStringfälle einmal tatsächlich ausgeführt, deterministischer Quellpfad. Auswirkung: ungültiger Steuerzustand wird als Erfolg bestätigt und an Overlaykonsumenten ausgegeben. Visuelle Auswirkung auf aktuellen Browser nicht bestätigt; engine.js hat für diese Control-Events keinen erkennbaren Handler, dies noch kein separat bestätigter Darstellungsbug. Priorität bezieht sich auf defekten API-/Laufzeitvertrag, keine belegte Liveunterbrechung.

### P8 aktuelle lokale Overlay- und Eingabeprüfung, 05.10.2026

- EigenerTab73 `/emoji-rain/overlay` lädt ohne erfassteBrowserwarnung/-fehler. Lokaler POSTopacity0 und POSTtest count25/emojiTestsymbol beide200/successtrue. Testspawn inBrowserkonsoleempfangen; Screenshot/DOMprobe zeigt jedoch leereFläche/Containerchildren0/bodyopacity1/containeropacity1. Kein sichtbarer25Emoji-Pass oder bestätigterOpacityignorierbug: Spawnzeitpunkt/Lifetime/Layerfilter müssen dafür enger korreliert werden. Keine Viewer-/Chatpayloads inBericht übernommen.
- **Bestanden:** vier numerischeBereichsfehler opacity-1/2/speed0/6 abgewiesen. **Bug bestätigt:**047 für Stringwerte. **Nicht beobachtet:** visuelle Auswirkungopacity0/25Testemojis bei dieser Probe. RealeLive-Socketaktivität bleibt von lokalen Testspawns getrennt.
- Alle eigenen Steueränderungen regulär zurückgesetzt: pausedfalse/themedefault/opacity1/speed1. KeineClearaktion löscht existierendeLivepartikel,keinePresetdatei geändert,keinPluginreload. EigenerOverlaytab anschließend geschlossen.

### LTTH-LIVE-048 — P2: EmojiRain-Deckkraftsteuerung erreicht den klassischen Browserrenderer nicht

- Feature P8, `/emoji-rain/overlay`, lokale Overlay-Control-API. Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9, 05.10.2026, Windows/bundledNode22.14.0/IAB, Profil test/requiresRestartfalse. Keine Produktänderungen; Talking-Heads-/TTS-Arbeit erhalten.
- Voraussetzung: klassisches Plugin aktiv, eigenes Overlay und Konfigurations-UI geöffnet; baseline pausedfalse/theme default/opacity1/speed1.
- Schritte: 1. Im gerenderten UI „Emoji Rain testen“ anklicken und sichtbare Animation verifizieren. 2. Regulärer POST /api/emoji-rain/overlay/opacity {"opacity":0}. 3. UI-Testbutton erneut anklicken. 4. Overlaybild/DOM sowie GET Overlaystate prüfen. 5. Deckkraft regulär1 wiederherstellen.
- Erwartet: Deckkraft0 verbirgt die Overlaygrafiken, solange dieser Steuerwert gilt.
- Tatsächlich: POST200/successtrue/opacity0 und GET bestätigtopacity0; Screenshot weiterhin sichtbare Herzen/Profilbildballons, DOMbody/containeropacityje1,47Containerchildren,11EmojiKinderopacity1. Bereits vorher bestätigte sichtbareTestemojis/Herzballons schließen die zunächstleereProbe desVorabschnitts als ausreichendenOpacitybeleg aus. Dieser spätere Lauf liefert den konkreten visuellen Gegenbeleg.
- Quelle: tatsächliche gerenderte lokale UI plus reguläre lokaleTest-/Controlaktionen; reale eingehendePartikel und eigeneTests überlagern sich. SichtbareAnimationbeiDeckkraft0 bestätigt, exakteEinzelpartikelkorrelationkeinPass. Kein öffentlicherChat/keineGifts/keinOBS.
- Belege: bereinigteAPIwerte oben, DOMsummen, Screenshot inToolansicht, keinexportierterPfad. Engine.jsSocketbindungen2426ff behandeln spawn/hearts/gifts/clear/config-update/toggle/user-mappings; kein opacity-Handler oder initiales overlay/state-Laden gefunden. Hypothese: Control-API wurde ohne entsprechendenBrowserconsumer implementiert. AndereRenderer und speed/theme/bounding-box gesondert prüfen.
- Reproduzierbarkeit: eine gültigeDeckkraft0Probe nach zuvorverifiziertemRendering; Quellenvergleich stütztfehlendeWeiterleitung. Auswirkung: API meldet erfolgreiche Sichtbarkeitssteuerung, Overlay bleibt sichtbar. Kein Produktfix.
- Wiederherstellung: POSTopacity1 HTTP200,finalstate pausedfalse/themedefault/opacity1/speed1. Keine DB-/Presetmutation/kein Neustart/Pluginreload.

### P8 gerenderte Testbuttons, negative Geschenkprobe und Queue-Pause, 05.10.2026

- EigeneUI74/Overlay75. „Emoji Rain testen“ zeigt „Test-Emojis wurden erzeugt.“; direkter Screenshot sichtbareKonfettiemojis, DOM18Containerchildren/11EmojiNodes. „Herzballons testen“ zeigt „Test-Herzballons wurden erzeugt.“; Screenshot sichtbarefarbigeHerzen, DOM18HerzballonNodes/30Gesamtkinder. **Bestanden** fürdiese zwei tatsächlichenlokalenTestbuttonabläufe, keine korrekteEchtgift-/Superfan-/Limitabnahme.
- BaselineGeschenk-Kugelnfalse bewusst unverändert. „Geschenk-Kugel testen“ zeigt Fehler „Geschenk-Kugel-Test fehlgeschlagen: Geschenk-Kugeln are disabled“; giftNodes0. **Bestanden** fürAblehnung undsichtbareFehlerrückmeldungbei deaktivierterFunktion; positiverGeschenkkugeltestweiteroffen.
- PauseBaselinepausedfalse/Queue0. RegulärerPOSTpause200. UIerneutgetestet,bleibtvorübergehenddisabled; kein zusätzlicherUI-Erfolg darausbehauptet. SeparaterregulärerlokalerPOSTtestcount3/Testemoji200; GETpausedtrue/queuedSpawns1. finallyPOSTresume200,GETpausedfalse/queuedSpawns0. **Bestanden** fürBackendqueueundFortsetzung; keine bestätigtePixelkorrelationdesgenauqueuedTests. VorhandeneLiveereignissenichtgelöscht;keinClear.
- Nachfolgende Browserbeobachtung einmal30sTimeout; Runtimeverfügbarkeit nichtdadurchalsAppendegewertet. BrowserinventurzeigtTab74/75weiterbestehend; bestehenderTab74erneutgebundenzeigtTestbuttonwiederenabled. KeinApprestart/keineWiederholungdesTesttriggerswegenTimeout. Der Toolbeobachtungstimeout ist kein bestätigterProduktbug.
- UI-Inventarergänzung: fünfVisuallooks,Toaster,8Landscape/PortraitAuflösungenplusCustom,Glow/Particles/Depth,Uploads/mapping/profilepicture,Wind/Bounce/Color/Rainbow/Pixel,SuperfanBurst,Animalcommands/Cooldowns,adaptiveFPS,Physik/Lifetime/Limit,Ratequeue,Like/Giftscaling,GiftballsPreis-/Serienstufen,HerzballonProfilbilder/Popheight/Wind,Sticker/Cooldowns. GeseheneOptionenalleinkeinFunktionspass; bislangnichtausgeführteVariantenweiteroffen.
- EigeneTabs geschlossen;EndbaselineStatewievorher1/1/unpaused,Pluginbleibtaktiv. KeineKonfigurationsspeicherung,keineAssets/Maps/Presetsverändert.

- Korrektur zur unmittelbar vorstehenden Tabbereinigung: UI74 wurde geschlossen (aktuelleBrowserinventur enthält74nichtmehr). Overlay75 bleibt lautInventur bestehen. Zwei gezielte Bindungen an genau75 scheitern an CDP-Fokusbeobachtungstimeout; deshalb ist dessenSchließennichtbestätigt. Keine neueVorschau/keinNeustart alsAusweichaktion. Teststeuerzustand bereitsregulärrestauriert;verbliebener eigenerTab75 ist weiterergezieltzuprüfenderCleanuprest, keinBelegfürAppshutdown.

### P8 positive Geschenk-Kugel-UI, Konfigurationspersistenz und Cleanup, 05.10.2026

- Vorheriger Cleanuprest75 aktuell gezielt nachgeprüft: Browser meldet Tab not found in browser2. Damit eigener alterTab75 nichtmehr vorhanden; keineAppneustart-/Killaktion ausgeführt.
- %TEMP%\ltth-emoji-gift-0810-enable.js prüft activeProfiletest/requiresRestartfalse und gift_balls_enabledfalse. BetroffeneKonfiguration alsBaseline %TEMP%\ltth-emoji-gift-0810-before.json außerhalbGit gespeichert,keineKonfiguration ausgegeben. RegulärerPOST /api/emoji-rain/config ausschließlich {config:{gift_balls_enabled:true}} HTTP200/successtrue,Pluginenabledtrue/commandRegistrationactive. KeinPlugin-Lifecycle und keineChanges andererProfile.
- TatsächlicheeigeneUI76 zeigtGeschenkkugelCheckboxtrue nachNeuladen/Initialisierung, eigenesOverlay77 `/emoji-rain/overlay`. „Geschenk-Kugel testen“ => sichtbareMeldung „Test-Geschenk-Kugel wurde erzeugt.“; direkterScreenshot einzelne gelbeGeschenkbox imrundentransparentenRand; DOM genau1 `.gift-ball`, Klasse emoji-sprite gift-ball. **Bestanden** fürpositive lokaleUI-Testfunktion undFallbackgeschenkgrafik; kein echtesGift/Serien-/Katalogbild-/public-/OBS-Pass.
- %TEMP%\ltth-emoji-gift-0810-restore.js prüft KonfigurationgegenexakteBaselineplusnurtrue-Feld, brichtbeifremdenkonkurrierendenÄnderungenab. RegulärerPOSTnuroriginalfalse =>200/successtrue,commandRegistrationactive. GETvergleichallerKonfigurationsfelder allConfigFieldsRestoredtrue,giftBallsfalse. Aktualisierungszeitpunkt der DB-Zeile durch normaleSpeicherung geändert, keinMeta-/WholeDBrestore; Geschäftskonfiguration vollständigwiederhergestellt. Commandneuregistrierung/AnimalcommandCooldownclear gehört normalemapplyConfigUpdate; keinNachweiszeitunveränderterCooldowns.
- TatsächlicheUI76 nachReloadCheckboxfalse. WeiterbeobachtetesOverlaygiftNodes0 ohneClear- oderDetachinjektion. **Bestanden** für spätereDOMentfernungderlokalenTestkugel; exakterDespawnzeitpunkt/Fadeframe/Physicsbodycleanup nichtausDOMzählungbehauptet. Quelle engine.js1442ff Timerdespawn/Fade, nichtalsvollständigeMatterWorld-Abnahmegewertet.
- EigeneTabs76/77 regulärgeschlossen. KeineAssets/Usermappings/Presets/anderenSettings verändert;keinöffentlicherChat/Gift/Account-/Aboänderung,keinApprestart. P8positiveGiftserie/Livetrigger/Fallbackkatalog/Preis-/Tier-/Seriengrößenweitergesondertoffen.

| P8 zusätzlicher Teilumfang | Status | Beleg |
| --- | --- | --- |
| Konfigurationfalse→true,frischgeladeneUItrue | bestanden | regulärerPOST200/tatsächlicheCheckbox |
| LokalerGeschenk-Kugel-Testbutton/Defaultgrafik | bestanden | Erfolgsmeldung/sichtbareKugel/1GiftDOMnode |
| SpätereEntfernungTestkugel | bestanden | später0Nodes,zeitlicheGrenzwerte/Worldcleanupnichtbewiesen |
| KonfigurationsrestoreundNeuladen | bestanden | alleFeldergleichBaseline/Checkboxfalse |
| EchteGift-/Serienkorrelation/public | nicht beobachtet | lokalerTestkeinLivebeleg |

### A3/P8 echtes Giftfenster mit aktivierter Geschenk-Kugel, 05.10.2026

- %TEMP%\ltth-emoji-gift-live-0815.js/bundledNode22.14.0/Exit0. Vorabtest/noRestart/isConnectedenisa.salihi/gift_balls_enabledfalse. BetroffeneConfigBaselineaußerhalbGit0815-before.json,reguläreAktivierungnurGiftballsfieldtrue. EigenerpassiverSocket,keineChat-/Gift-/Accountaktion undkeinTestspawnindiesemFenster.
- BegrenztesechtesFenster07:54:35.813Z–07:55:20.823Z45s: join36/chat5/like10, gifts0/emoji-rain:gift-balls0/matched0. Empfangsquelle tiktok:event mittype/data,weitergeleiteteGiftballsseparatbeobachtet; VieweridentitätennurimArbeitsspeicherfürpotentielleZuordnung,keinePayloads/Namen/Bildergespeichertoderprotokolliert.
- EigenerOverlay78zeitgleichlokalgeöffnet;DOMprobe giftNodes0/heartNodes14/emojiNodes4. **Nicht beobachtet:** echteGift-/Serienreaktion oderGiftbildkorrelation. AktivitätvonanderenEventtypenbelegtaktiveStichprobe,keineGift-FreigabeauslokalerTestkugeloderbloßaktiviertemSetting.
- finallyeigenerSocketgetrennt;normalerPOSTzurückgiftballsfalse200/successtrue,alleKonfigurationsfelderexaktBaselineallConfigFieldsRestoredtrue. GuardgegenkonkurrierendeÄnderungen. EigenerTab78geschlossen;keineClear/DBrestore/anderenSettings/Plugin-Lifecycle/Apprestart. KeinweiteresunbegrenztesWartenaufselteneGifts;gegenwärtigeGift-/SerienbelegeandererFensterseparatundkeinrückwirkenderRendererpass.

### P38 restliche neun Wettereffekte einzeln im tatsächlichen Browser, 05.10.2026

- ErneutfrischeVorprüfung activeProfiletest/noRestart,Pluginfalse,Settings0/Mappings0. Eigene0745-BaselineaufidentischeleereAusgangslageaktualisiert;regulärenable200/disabledPlugins[]. EigenerTab79 `/webgpu-weather-control/overlay?debug=1`. KeineTalking-Heads-/anderePluginänderung/keinApprestart.
- Helper %TEMP%\ltth-weathergpu-effects-0830.js prüftProfil,erlaubteActionsundliestlokalenAPIkeynurimProzessspeicher. JeEffekt normalePOSTconfigenabledtrue,POSTstop{},POSTtriggeraction/intensity0.8/duration20000ms;alle27Aufrufe200/successtrue. StopvormnächstenEffektverhindertbeabsichtigteÜberlagerung,keinöffentlicherChat/Gift/Accountänderung.
- TatsächlicheScreenshot-/Diagnosebelege proEffekt:

| Effekt | Status | Sichtbare lokale Stichprobe / Diagnose |
| --- | --- | --- |
| storm | bestanden | dunklerSturmhintergrundmitRegenstrichen,60–61FPS/5–6ms/7200Partikel |
| thunder | bestanden | deutlicherweißerZickzackblitz,60FPS/5ms/0Partikel |
| sunbeam | bestanden | sichtbarerweicherLichtfleck/StrahlenaufdunklemGrund,59FPS/5ms/0Partikel; Farbtemperaturnichtabgenommen |
| glitchclouds | bestanden | wechselndeBlock-/Rauschstruktur,60FPS/5ms/0Partikel; einzelneRGB-/Displacementoptionennichtabgenommen |
| aurora | bestanden | türkise/lila/blaueLichtbänder,60FPS/5ms/0Partikel |
| fireflies | bestanden | gelblichgrünePartikel,60FPS/6ms/7200Partikel; biologischeBewegung/EinzelgrößekeinQualitätspass |
| meteors | bestanden | warmeStrichpartikel,60FPS/5ms/7200Partikel; geometrischeMeteorqualitätkeinPass |
| embers | bestanden | orangeGlutpartikel,61FPS/5ms/7200Partikel |
| heatwave | nicht beobachtet | API200/ready61FPS/5ms/0Partikel,SnapshotnurflachedunkleFläche; sichtbareVerzerrungeinesHintergrundsnichtbelegt |

- Bestandenbeziehtsichausschließlichaufgenannteerkennbare lokaleDarstellung; keineechtenLive-Trigger,publicURL,OBS,LangzeitlastoderPixelqualitätsfreigabe. VorherigerLaufhatregen/snow/fog/sakura separatbelegt; diesesneue9erFensterschließtHeatwavealsunbeobachteteDarstellungpräziseab,keinpassnurwegen200.
- DOMcssbodyundcanvasbackgroundColorrgba(0,0,0,0),Canvas1280x720/opacity1. DasbelegttransparenteCSS-Flächen,**keine**GPU-Pixelalpha-/OBS-Komposition. DiagnosewortframeistEreignisbezeichnungauscinematic-weather-engine.publishDiagnostic('frame'),keinBelegfürCPUFallback. GerätestatusreadyundtatsächlichesCanvasrendering;GPUfeatures/Adapterinformationnichtausgelesen.
- FinalePOSTstop{}200/successtrue,tatsächlicheleerehelleFläche/0Partikel/61FPS/5ms,erfassteBrowserwarnungen/-fehler0. BestandenfürlokalenGesamtstoppundkeinenFehlerindieserStichprobe;keinvollständigerSpeicher-/Deviceverlust-/Stabilitätspass. ScreenshotsnurToolbilder,keineexportiertenPfadeartefakte.
- Restore0754HelperprüftgenauleereBaselineundnurzweiownSettings;regularDisable200,gezielteBereinigungSettings0/Mappings0,Tab79geschlossen. Tabellenbehalten,keinWholeDBrestore. Produktcodeunverändert; UI-Mojibake046/Preset020/Studio021weiterseparat.

### LTTH-LIVE-049 — P3: WebGPU-Wetter-Presets verlieren ihre Intensitätswerte in den Range-Inputs

- FeatureP38/Presetanwendung/Persistenz,Commit e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9,05.10.2026,Windows/bundledNode22.14.0/IAB,Profiltest/noRestart. ParalleleTalking-Heads-/TTS-Dateienerhalten,keineProduktänderung.
- Voraussetzungen: eigenesWebGPU-WeatherPluginmitursprünglich0Settings/Mappings aktiviert; UI80 vollständiggeladen.
- Schritte: 1. Preset0CozyRainanwenden. 2. RainIntensitätlesen. 3. BossStorm/WinterChill/CyberGlitchüberdiegerendertenControlsanwenden. 4. CyberGlitchspeichern. 5. GETconfiglesen,nurrelevanteEffektzahlenprotokollieren.
- Erwartet: deklariertePresetintensitäten0.45/0.85/0.65/0.35 bleiben exakt erhalten und werden so gespeichert.
- Tatsächlich: CozyRainrain0.45→Input0.5;BossStormthunder0.85→0.9;WinterChillsnow0.65→0.7/fog0.35→0.4;CyberGlitchglitchclouds0.85→0.9/meteors0.45→0.5. AnzeigeundInputnachAnwendungzeigenjeweilsgerundeteWerte. SpeichernmeldetErfolg; tatsächlicherGETconfigglitchIntensity0.9/meteorIntensity0.5/snowIntensity0.7 bestätigtPersistenzderAbweichung.
- Quelle:tatsächlichelokalegerenderteUI/normalerSave/GET;keinLiveereignis. BelegPresetoptionen0–3,DOMwerteundneutraleBackendwerte. Quellenui.html1344undanalogeInputsstep0.1;2060–2082PresetdefinitionenmitHundertstelwerten;setEffectField2615ff setztinput.valueundinputEvent,collectEffectConfigliestValue. Hypothese: nativeStep-SanitizationrundetPresetwertebereitsbeimSetzen;QuelleundDOMstützen,detaillierteBrowser-Implementationnichtuntersucht.
- Reproduzierbarkeit: sechsbetroffeneFelderüberalle4Presets,SpeicherfallCyberGlitch. Auswirkung: PresetlookabweichtundexaktePresetwertegehenverloren;P3fürgeringeIntensitätsabweichungen. KeinProduktfix/Screenshotexport;ToolbilderseparatOverlay,keineToken/KeysimBericht.
- Rücksetzung: regulärdeaktiviert200,nurzweiownSettingsauforiginal0/Mappings0zurück;Tab80/81geschlossen.

### LTTH-LIVE-050 — P3: Winter-Chill-Preset übernimmt die konfigurierte eisblaue Nebelfarbe nicht

- FeatureP38/Presetfeldzuordnung,gleichesHEAD/Datum/WindowsNode22/IAB/testwie049; keineProduktänderungen.
- Voraussetzung: initialfogColor default, fullyloadedWeatherUI. Schritte: 1. PresetWinterChill(value2)auswählen. 2. „Voreinstellung anwenden“ anklicken. 3. Nebel-Farbvorlagelesen. 4. Konfigurationnormal speichernundgespeichertefogColorprüfen.
- Erwartet: builtInPresetsWinterChillenthältfog.fogColor ice;DropdownundgespeicherteKonfigurationwechselnzudieserFarbe.
- Tatsächlich: Dropdownvaluebleibtdefault; normaleSave-Erfolgsmeldung,readonlyDBconfigprüfungfogColordefault. Quellenui.html2075Presetice;setEffectField2615ffidMapenthältkeinfogColorundkehrtbeiunbekanntemFeldzurück. UrsacheaufQuellvergleichgestützt;keinRendererfarbbugbehauptet.
- Quelle:tatsächlichelokaleUI/SaveundreadonlyKonfigurationsfeld. Reproduzierbarkeit: WinterPresetzweimalausgewählt(dieletzteProbeinklusiveSave),konstantesdefault. Auswirkung: Winterlookwirdunvollständigangewandt. APIkeynurimHelperprozess,keineKonfiguration/Identitätenprotokolliert;keinexportierterScreenshotpfad.
- Restorationwie049:pluginfalse/settings0/mappings0/eigeneTabsgeschlossen.

### LTTH-LIVE-051 — P2: WebGPU-Wetter-UI zeigt trotz sichtbarer Effekte eine leere Aktive-Effekte-Liste

- FeatureP38/A4Pluginstatus/Telemetryvertrag. HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9,05.10.2026,WindowsNode22/IAB/test/noRestart,eigeneUI80/Overlay81. Produktcodeunverändert/Paralleländerungenerhalten.
- Schritte: 1. GlobalWeatherenabledtrue,Overlaydebug1öffnen. 2. NormalelokaleTriggerfürrainduration0/permanenttrueundsnowduration0/permanenttrueauslösen(beide200). 3. SichtbaresOverlayundUIAktive-EffekteListevergleichen. 4. RegenperPOSTstopactionrainbeenden. 5. ListeundverbleibendesSchneeoverlayerneutvergleichen.
- Erwartet: aktiveListezeigtRegen+Schnee,danachSchnee;GUIermöglichtverlässlicheKontrolleaktiverEffekte.
- Tatsächlich: ScreenshotzuerstRegenstricheundSchneepartikel,danachnurnochSchnee;Diagnose60FPS/3–4ms/3600Partikel. UIjeweilsactiveEffectsCount0und„Keine aktiven Effekte werden vom Overlay gemeldet.“ KeinebehauptetenanderenTelemetryfehlerausdieserProbe.
- Quelle: tatsächlicherlokalerBrowserundnormaleTesttrigger,keinTikTokLivecommand. Belege: neutralerDOMlistentext/counter/Diagnosewerte,Tool-Screenshots(keinexportierterDateipfad),POST200/triggerpermanenttrue/duration0.
- Quellen: overlay.htmlpublishOverlayStateemittiertengine.getMetrics()alswebgpu-weather:overlay-state;getMetricsenthältkeineactiveEffects-Liste;main.jssanitizeOverlayState282ff erwartetpayload.activeEffectsmit.typeunddefaultetzu[];UIrenderActiveEffectsverwendetactive-state.activeEffects. VermuteteUrsache: neuerCinematicrendererundbestehenderTelemetryvertragnichtaufeinanderabgestimmt. QuellvertragstütztHypothese;exakterautorisierterAdminsocketpayloadnichtmitgeschnitten.
- Reproduzierbarkeit: zweiaktiveZuständeinlaufenderUI(doppelterpermanenterTriggerundEinzelstopp). Auswirkung: irreführendeLive-Kontrolle/fehlendeListeundkontextuelleStopbuttons. KeinProduktpatch.
- FinaleGesamtstop200,reguläreDeaktivierung200/ownSettings0/Mappings0/eigeneTabs80/81geschlossen;keineWholeDB-/anderenProfildatenrestoration.

### P38 tatsächliche Sequenz, Preset-Bedienung und gezielter Stopp, 05.10.2026

- FreshBaselineerneutpluginfalse/settings0/giftmappings0;enable200disabledPlugins[]. LocaleConfigbootstrapglobalaus;normalerlokalerconfigenabledtrue/stop200. Schlüssel ausschließlichlokalimProzessbzwbestehenderUIAuthwrapper,keinAusgabe/Screenshotfeld.
- EigenerpassiverBeobachter%TEMP%\ltth-weather-sequence-observe-0840.js/Exit0/eigenerSocketfinallydisconnect: tatsächlicheUI-TriggersequenznameAUDIT20261005-sequence,firefliesdelay0/intensity0.4/duration4000+auroradelay3000/intensity0.6/duration5000. UIzeigtErfolg. Beobachtergenau2passendeTrigger:fireflies16333ms/aurora19319msseitObserverstart,Delta2986ms,permanentfalse,richtigeDauer/Intensität. ErsterScreenshotGlühwürmchen3600Partikel; ersterAuroraSnapshotspäterleer,daherhierkeinzweiterPixelpass.
- GezieltezweitevisuelleProbealsUIsequenzfirefliesduration6000/auroradelay2000duration15000: ScreenshotzeigtbeideLichtbänderundPartikelgleichzeitig/61FPS/4ms/3600Partikel. **Bestanden** fürgenannteslokalesUI-Sequenzstart-/Timing-/Überlagerungsverhalten. Keineöffentliche/Reconnect/Sequenzabbruch/alle20Steps-/Persistenzfreigabe.
- Alle4Preset-Controlswirklichangewandt(DOMwerteoben). Dauerwerteändernsicherwartet(12000/10000/6000/16000/12000/8000/7000); Intensitätsabweichung049/Nebelfarbe050separat. NormalerSavepersistiertownSeqnameundgenannteEffektfelder,GETbestätigt;keinApprestartpersistenzpass.
- LokalerHelper%TEMP%\ltth-weather-specific-stop-0845.jsguardtest/noRestart/read-onlykey;normalerStopall200,Triggerrainduration0/permanenttrue200,Triggersnowduration0/permanenttrue200. Tatsächlich beideEffektsichtbar. POSTstopactionrain200=>Regenstricheverschwinden/Schneebleibt. **Bestanden** fürgezieltenlokalenEinzelstoppundkurzeDauereffektprobe;UIStatus051defekt. UnbegrenztelangeDauer/Konfigpermanenz/StartnachReloadnichtabgenommen.
- NormalerStopall200abschließend;0754RestorehelperregularDisable200/guardsnurbootstrap_v1+weather_config/Mappings0,settings0. AlleeigenenUIeingabenundeigenergespeicherterSeqzustandentfernt;Tab80/81geschlossen. KeineGiftmapping/Userdaten/Profile/TalkingHeadsÄnderung/keinNeustart.

### A10 Store-Detailansichten, 05.10.2026

- Tatsächliche gerenderte lokale UI im bestehenden Dashboard-Tab, Profil test, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. 35 Katalogkarten; 38 lokal vorhandene Plugins. Paralleländerungen ausschließlich Talking-Heads/TTS-Bereich erhalten. Keine Installation, Aktualisierung, Deinstallation oder Accountänderung.
- Bestanden: Öffnen und Schließen der Detailansichten für advanced-timer, animazingpal, clarityhud, coinbattle, config-import, emoji-rain, fireworks, gcce, interactive-story, goals, game-engine, music-bot, quiz-show, schnorrbecher, sidekick, stream-monsters, toptier, flame-overlay, visual-fx-frame-webgpu, weather-control, webgpu-emoji-rain, webgpu-weather-control. Jeweils Installed/Manage sowie Version, installierte Version, Quelle, Autor, Preis und Kompatibilität sichtbar. Manage wurde nicht ausgeführt.
- Lokale neuere Versionen werden getrennt angezeigt: EmojiRain 2.1.2 gegenüber Katalog 2.1.0, Goals 1.0.1 gegenüber 1.0.0, Top Tier 2.0.1 gegenüber 2.0.0, WebGPU EmojiRain 3.0.5 gegenüber 3.0.0. Kein Update-Erfolg behauptet. Viewer XP und WebGPU Fireworks fehlen in diesen 35 Karten; Ursache/Absicht noch nicht abschließend geprüft, kein Bug allein aus der Anzahl abgeleitet.
- Screenshot-DOM unmittelbar nach Öffnung war überwiegend noch ungeladen; diese Momentaufnahmen belegen keine weiteren defekten Bilder. Advanced Timer wurde gesondert nach erneuter Öffnung und aktualisierter UI geprüft, siehe 052. Schnorrbecher, Sidekick und Visual FX Frame WEBGPU zeigen ausdrücklich No screenshots yet.
- Abschluss: Detaildrawer aria-hidden=true, aktuelles Profil test. Nur UI-Navigation verändert; keine Testkonfiguration zu restaurieren.

### LTTH-LIVE-052 — P3: Plugin-Store zeigt defekte Screenshot-Galerie für Advanced Timer

- Feature A10, Advanced-Timer-Detailansicht. Datum 05.10.2026, Windows, laufende LTTH 1.4.3, IAB, Profil test; getesteter HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Produktcode unverändert; vorhandene parallele Talking-Heads/TTS-Änderungen erhalten.
- Voraussetzungen: lokaler App Store erreichbar, Katalogkarte Advanced Timer vorhanden. Reproduktion: 1. App Store öffnen und Store wählen. 2. Advanced Timer anklicken. 3. Screenshot-Bereich nach Laden prüfen. 4. Den vom DOM angegebenen Bild-Endpunkt lokal per GET abrufen.
- Erwartet: Das angebotene Screenshot-Bild wird geladen, alternativ zeigt die Galerie einen verständlichen Hinweis auf ein fehlendes Bild.
- Tatsächlich: img src=/screenshots/features/advanced-timer.png, complete=true, naturalWidth=0, alt leer. Lokaler GET liefert HTTP 404, Content-Type text/html; charset=utf-8, 1284 Bytes. Detailansicht bietet weiterhin den Screenshot-Bereich ohne erklärenden Ersatztext. Andere Detail-Metadaten und Manage sichtbar.
- Testquelle: tatsächliche lokale Benutzeroberfläche und gezielter lokaler GET, kein TikTok-Ereignis. Bereinigte Belege: vorstehende DOM-Felder/HTTP-Metadaten; keine Antwortinhalte, Zugangsdaten oder Accountkennung protokolliert. Kein exportierter Screenshot-Dateipfad.
- Reproduzierbarkeit: zweimal geöffnet; nach zusätzlicher UI-Beobachtung weiterhin vollständiger Ladeabschluss ohne Bild, HTTP 404 bestätigt. Auswirkung: fehlende visuelle Produktvorschau. Vermutete Ursache: Katalog-Bildpfad verweist auf nicht ausgeliefertes Asset; Zuordnung zwischen Katalog und statischer Route noch nicht abschließend untersucht.
- Wiederherstellung: Drawer normal geschlossen; keine Paket-, Profil- oder Konfigurationsänderung, kein Neustart.

### A10 Suche, Kategoriefilter und Katalogidentität, 05.10.2026

- Tatsächliche UI im vorhandenen Dashboard, Profil test, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Store-Suche AUDIT-no-such-plugin-20261005 zeigt passenden Leerzustand No plugins match this search / Try another search term or category. Gemischte Schreibweise eMoJiRaIn findet genau emoji-rain und webgpu-emoji-rain. Leeren der Suche stellt 35 Karten wieder her. Bestanden für diese konkreten Suchfälle.
- Alle sichtbaren fachlichen Filter betätigt und resultierende Karten geprüft: Overlays 14, Audio & TTS 4, Games 6, Automation 4, Integrations 6, Utilities 1 (stream-monsters), Open Beta 34, All 35. Filter reagieren; fachliche Vollständigkeit nicht pauschal bestanden, siehe 053. Keine Talking-Heads-Detail- oder Lifecycle-Aktion; dessen Karte erscheint lediglich in der Katalogliste.
- Korrektur der offenen Viewer-XP-Katalogfrage: Die laufende Implementierung steckt in milestone-leaderboard/main.js (Initialisierung und Destroy von Viewer XP); Loader getSupersedingPluginId und migratePluginStateAliases ordnen viewer-xp sowie andere Legacy-IDs dem Bundle milestone-leaderboard zu. Ein eigener viewer-xp-Katalogeintrag ist deshalb kein belegter fehlender Eintrag. Bundle ist im Store vorhanden. WebGPU Fireworks hingegen hat ein eigenes lokales Manifest 3.1.1 und fehlt im eingecheckten plugin-store.json sowie im gerenderten Katalog; beabsichtigte Distribution noch ungeklärt, Storeinstallation dieses Pakets nicht verfügbar/nicht beobachtet.
- Ergänzung zu 052: Das Bild existiert im Repository unter screenshots/features/advanced-timer.png, jedoch nicht unter app/public/screenshots/features/advanced-timer.png. server.js liefert app/public statisch aus; fehlende lokale Asset-Auslieferung stützt die Hypothese. Keine Route oder Datei verändert.
- Abschluss: Kategorie All, Suche leer, 35 Karten, Profil test. Keine Paket-/Konfig-/Accountänderung.

### LTTH-LIVE-053 — P3: Store-Filter Utilities schließt Werkzeuge allein wegen Open-Beta-Status aus

- Feature A10 Katalogfilter, Windows/IAB/laufende LTTH 1.4.3/test, 05.10.2026, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Produktcode unverändert, parallele Änderungen erhalten.
- Voraussetzungen: Store-Katalog mit config-import (Config Backup & Restore), gcce und übrigen Open-Beta-Einträgen. Schritte: 1. Store öffnen. 2. Utilities wählen. 3. config-import suchen. 4. Bei unveränderter Suche All wählen.
- Erwartet: Der fachliche Utilities-Filter erlaubt das Finden passender Konfigurationswerkzeuge unabhängig vom Releasekanal. Open Beta ist ein gesonderter Filter, keine fachliche Gegenkategorie.
- Tatsächlich: Utilities enthält ausschließlich stream-monsters; mit config-import erscheint No plugins match this search. Derselbe Suchtext unter All zeigt die vorhandene config-import-Karte. Zahlreiche sonstige Werkzeuge werden ausgeschlossen, obwohl sie keine andere fachliche Kategorie treffen.
- Ursache durch aktuellen Quellcode gestützt: plugin-manager.js storePluginMatchesCategory (489ff) definiert Utilities als Negation von audio/games/automation/integrations/overlays UND open-beta. Damit wird jeder Open-Beta-Eintrag automatisch aus Utilities entfernt. Stream Monsters wird stattdessen durch fehlenden Namen/ID-Regex-Treffer als Utilities eingeordnet, obwohl es ein Arcade-Spiel beschreibt. Wetter-Plugins fehlen ebenfalls im Overlay-Regex; diese weitere Einordnung wurde beobachtet, aber nicht separat als vollständig geprüfter Kategorisierungsbug bewertet.
- Quelle: echte lokale UI-Filter/Suche und Quellvertrag, keine Live-Ereignisse/synthetische Plugininstallation. Bereinigte Belege: Utilities IDs=[stream-monsters], Utilities+config-import keine Karten, All+config-import IDs=[config-import], All+leere Suche 35 Karten. Kein exportierter Screenshotpfad, keine Accountinformationen ausgegeben.
- Reproduzierbarkeit: Utilities zweimal angewandt; Such-/All-Vergleich bestätigt. Auswirkung: fachliche Suche verbirgt vorhandene Hilfswerkzeuge und ordnet den einzigen verbleibenden Treffer irreführend ein. Wiederherstellung: All/Suche leer; keine persistenten Änderungen, kein Neustart oder Produktpatch.

## Konsolidierter Arbeitsstand aller ausgewählten Bereiche, 05.10.2026

Diese Übersicht ergänzt die historische Anfangsmatrix. Sie ist ausdrücklich keine Abschlussfreigabe. Bestanden gilt nur für den jeweils genannten Ablauf; offene Restprüfungen bleiben Teil des Auftrags. Die ausführlichen Reproduktionen und Teilmatrizen oben sind die Belege, keine pauschale Produktabnahme. Letzter Zielturn: Fortschritt durch tatsächliche Store-Suche/Filterprüfung und Bug 053.

| Bereich | Belegter Teilstatus | Noch auszuführen oder konkrete Grenze |
|---|---|---|
| A1 Profile | Testprofil geladen, ausdrücklich genehmigter Wechsel verifiziert; Bugs 002/012 bei gemeinsamen Plugin-Daten | Neustartpersistenz während paralleler Arbeit blockiert; fremde Profile nicht mutieren; gezielte eigene Aliasbereinigung am Abschluss |
| A2 Verbindung | Tatsächliches Verbinden/Trennen/Reconnect, Streamwechsel, Stream-Ende und negative Eingaben geprüft | Echter automatischer Transport-Reconnect und umfassende Listener-/Altstreambereinigung noch nicht beobachtet |
| A3 Ereignisse/Super Fans | Echte Chat/Join/Like/Gift-Felder und Serienabschlüsse in begrenzten Fenstern; Rollenfehler 022/034/035/036/043 | Bezahlter Super Fan/Subscribe/Share nicht durch Teamlevel ersetzen; genaue UI-/Plugin-Korrelation und Reconnect-Zuordnung teils offen |
| A4 Dashboard | Gerenderte Verbindungs-/Laufzeitanzeigen und reale Zähler, Disconnect/Reconnect geprüft | Vollständige Eventverlaufs-/Lade-/Fehler-/Profilwechselanzeige noch nicht zusammenhängend abgenommen |
| A8 Studio/Tunnel | Inventur, echte Tunnelwiederverwendung, ausgewählte öffentliche Assets/Updates; Bugs 001/004/007/008/009/013/014/015 | Öffentliche Prüfung verbleibender Quellen; Tunnelabbruch/geänderte URL; echte Clipboard-Kopie; Verwaltungs-GET-Freigabeprüfung separat blockiert, keine Abweisung als Erfolg ausgeben |
| A9 Pluginverwaltung | Viele tatsächliche Testprofil-Lifecycles mit gezielter Rücksetzung; Fireworks Socketabbau isoliert geprüft | Vollständige ausgewählte Listener/Timer und gerenderte Fehlerrückmeldung noch offen; Talking Heads ausgenommen |
| A10 Store | Login aktuell funktioniert; Katalog, 22 Detailansichten, Installiertabgleich, 0-Updates, Suche/Filter, isolierte Installerfehler; Bugs 052/053 | Echte offizielle Installation nicht ausgeführt, um vorhandene Pakete nicht zu überschreiben; kein Update verfügbar; Lizenz-/UI-Paketfehler und restliche Sortierung offen |
| A11 Sprache/Einstellungen | DE/EN-Initialisierung und browserspezifische Rückkehr, einzelne Speichern-/Validierungsfälle; Bugs 009/021/046 | Sofortiger Dashboard-Sprachwechsel, profilbezogene Sprache, vollständige Pluginlokalisierung/Layout und Neustartrestore nicht abgenommen |
| A12 Backup/Import | Export/Archiv/Validierung/Vorschau geprüft; Importbug 006 | Konflikt-/geänderter-Wert-Restore durch 006 blockiert; gemeinsame Dateien/fremde Profile nicht importieren; Legacy-Installation fehlt |
| P1 Advanced Timer | Eigener 60s-Timer erstellt/gestartet, Countdown sichtbar; mehrere Timer vorhanden; Bug 002 | Gemeinsame Daten blockieren weitere mutationsfreie Profiltests; Ablaufanzeige, Pause/Resume/Reset/Liveverlängerung nicht vollständig geprüft; eigener historischer Timerrest bereinigen |
| P2 AnimazingPal | Plattforminventar, Brainstatus, HUD-Grunddarstellung und passiver Empfang; isolierte Memory/Adaptertests | Keine geeignete Animaze/VTubeStudio-Instanz; VSeeFace-UDP nicht geprüft; KI-Schlüssel fehlt; Gedächtnis/Viewer-Reaktion/Public/Last offen |
| P5 ClarityHUD | Lokale/öffentliche Chatdarstellung, Ticker/Gifttest, Mehrstreamvalidierung, Export/Import; Bugs 023–028/036 | Vollständige Lesbarkeit/Größen/Livebadges/Mehrstream-Reconnect und Ursprungskorrelation offen |
| P6 CoinBattle | Reale leere Solo-Runde/Pause/Resume/Extension/Ende, isolierte Serien/Teams/Modi/Challenge; Bugs 003/041/042 | Tatsächliche Team/KOTH/Pyramid/Challenge-Runden mit Livewertung, Rankings/DB-Persistenz/Public offen; eigene leere Historie bereinigen |
| P7 Config Backup & Restore | Siehe A12; tatsächliche UI/Export/ZIP/Vorschau; Bug 006 | Tatsächlicher Restore blockiert; Migrationen ohne separate Legacy-Installation nicht beobachtet |
| P8 EmojiRain | Tatsächliche Emoji-/Herz-/Gift-Testbuttons, sichtbare Partikel, Queue-Pause/Resume, eigene Configrestoration; Bugs 007/047/048 | Echtes Giftfenster ohne Gift; Assetzuordnung/alle Presets/Commands/Physiklimits/öffentliche Layer und umfassende Bereinigung offen |
| P9 Fireworks | Tatsächliche UI, sichtbarer Canvas-Fallback; isolierte Serien/Combos/Policy/Loaderabbau | WebGL-Pixel trotz Partikelzählung nicht bestätigt; echte Giftreaktion/Public/Audio/Presets/Last offen |
| P10 Visual FX Frame | Lokaler Rahmen/Testreaktion, APIregeln/Validierung/Preset/clear; öffentliche Fehlkette 008/009 | Echte Events, vollständige Effekte/Livecooldowns/Last und UI-Vorschau offen; Publicupdates durch008 defekt |
| P11 Game Engine | Alle sechs Spiele inventarisiert; tatsächliche lokale Connect4/Schach/Plinko/Wheel/Slots-Abläufe und Arena-Negativfall, isolierte Regeln; Bugs016/017/018/040 | Vollständige Spielrestmatrix oben maßgeblich: echte Teilnahme/Wertung, Gewinnpfade, Uhren/ELO/XP/Public/Reconnect offen; eigene Sessions/Statistikreste bereinigen |
| P12 GCCE | Tatsächliche Registry/UI/DE-EN sowie isolierter echter Parser, Rechte/Limits/Weathercommands; Bugs019/034/035/037/042 | Ausgewählte reale Plugincommands und gerenderte Antworten, persistente Settings/Cooldown-Reconnect nicht vollständig abgenommen |
| P14 Goals | Reale Likes Fortschritt/Abschluss-Hide, lokale vier Zieltypen/Reset und öffentliche Einzel/Mehrfachrotation; Bug032 | Coins-/Follower-Fenster ohne passenden Fortschrittsbeleg; Serien/alle Abschlussaktionen/Templates/Last/Restart offen; eigene Ziele entfernt |
| P15 Story | Tatsächliche Ollama-Anfrage fehlgeschlagen, UI/negative API, isolierte Folgelogik; Bugs010/011 | Keine erzeugte Story: Voting/Fortschritt/Schluss und zugehörige Overlaykette blockiert; Bilder/Stimmen/Audio/DnD offen; Schlüssel entfernt |
| P16 Viewer XP | Echte XPupdates mit DB-/Ranglistenvergleich, isolierte Meilenstein-/Watchtimeregeln; Bugs004/005/031/033 | Exakte Originalevent-Idempotenz, echte Geschenkmeilensteinanimation/Profile und Restartpersistenz noch nicht vollständig bestätigt |
| P19 Music Bot | Tatsächliche UI/Negativvalidierung und eigener Lifecycle; isolierte Queue/Votes/Commands; Bugs043/044 | Safetylock verhindert reale Wiedergabe; kein Song-/Audio-/Suchepass; zusätzliche Playlists/Radio/AutoDJ/History/Seek/Volume/Genres offen, keine Sperre umgehen |
| P22 Quiz | UI-/Routeinventar und isolierte Regeln; Antwortpräfixbug045 | Gemeinsame Quizdatenbank blockiert Aktivierung im reinen Testprofil; Fragen/Voting/Duell/Joker/Ranking/Rundenabschluss tatsächlich nicht ausgeführt |
| P23 Schnorrbecher | Reale Speicherpfade/Sessionmodus, isolierte Regeln; Bug012 | Aktivierung überschreibt gemeinsamen Zustand: tatsächliche Giftglas/Physik/Reset/Last blockiert, keine fremden Daten anfassen |
| P24 Sidekick | Tatsächliche UI-/Status-/HUDinventur, öffentliche Registrierung fehlt001; isolierte Tests | Externe Avatar/KI-Reaktionen und komplette Queue/Viewer-Kontext/Public/Last noch nicht vollständig geprüft; Talking Heads ausgeschlossen |
| P27 Stream Monsters | Tatsächliche Creator-UI/lokale Demo, öffentlicher Assetfehler013; isolierte Kampfregeln | Demo ist kein echter Kampf: Live-Eventreaktion/Ergebnis/Fortschritt/Persistenz offen; Publicbootstrap defekt |
| P31 Top Tier | Echte Likes/Reload, öffentliche Like-/Giftboards, isolierter Decay; Bugs029/030 | Geschenkserienwertung defekt; vollständige echte Ranganimationen/alle Layouts/Decay im Livebrowser offen |
| P34 Visual FX WEBGPU | Tatsächliche GPU-/UI-/Testdarstellung und Lifecycle laut Teilmatrix | Alle Materialien/Presets/Liveeventkette/Public/Fehler/Stabilität noch nicht vollständig belegt |
| P35 Weather | Tatsächliche UI/Speichern/Persistenz, isolierte Commands/Quest/Streak/Rewards; Bugs020/021/022/038/039 | Alle tatsächlichen Effekte/Sequenzen/Audio/LiveTrigger/Questreaktion/Public/Last offen; isolierte Regeln ersetzen keine Pixel-/Liveabnahme |
| P36 WebGPU EmojiRain | Tatsächlicher WebGPUregen/Testtrigger, Publicfehler014, kontrollierte Rücksetzung | Gemeinsame Presets/Uploads nicht ändern; Read-only-UI/Commands/alle Layer/Liveevents/Last/Persistenz offen |
| P37 WebGPU Fireworks | Tatsächlicher lokaler Burst, Renderer-/Audioladetelemetrie, isolierte Triggerregeln | OBS-WebGPU-Build vom Nutzer zu prüfen; Public/UI-Designer/Shows/Presets/echte Combos/Last/Persistenz offen; Katalogpaket nicht angeboten |
| P38 WebGPU Weather | 13 Effekte einzeln angesteuert, 12 visuell belegt, Sequenz/Überlagerung/gezielter Stopp/Save; Bugs046/049/050/051 | Heatwave-Verzerrung nicht beobachtet; GPUpixelalpha, Audio, echte Trigger/Public/Gamification/Last/Restart noch nicht abgenommen |

Nächster breiter Prüfabschnitt: verbliebene öffentliche Quellen P2/P9/P34/P35/P37/P38 und gerenderte Restfunktionen nach erneuter Baseline-/Profilprüfung. Ein defekter Publicbootstrap kann Folgeprüfungen blockieren; dies muss je Quelle mit tatsächlichem Beleg dokumentiert werden. Anschließend seltene reale Events nur in begrenzten aktiven Fenstern; keine unbegrenzte Wartezeit. Abschließend gezielte eigene Alias-/Historienbereinigung und vollständiger Zustandsvergleich. Aktuell ist weder vollständige Abnahme noch vollständige Wiederherstellung behauptet.

### A8/P38 tatsächliche öffentliche WebGPU-Wetterquelle, 05.10.2026

- Voriger Zielturn: Fortschritt durch Konsolidierung aller Bereichsgrenzen. Aktuelle neue Laufzeitprobe: GET profiles/active test/requiresRestartfalse/port3000. FreshBaseline Plugin disabled, Settings0, Giftmappings0; bestehender geprüfter Helper erstellt erneut leeren Vorzustand und aktiviert normal200/success/disabledPlugins[]. Produktcode und parallele Arbeit unverändert.
- Reguläres ensure für http://127.0.0.1:3000/webgpu-weather-control/overlay?debug=1 erzeugt success=true/reused=false und https://fans-distinguished-elements-openings.trycloudflare.com/webgpu-weather-control/overlay?debug=1. Nutzerfreigabe öffentlicher Overlaytests liegt vor. Tatsächlicher eigener IAB-Tab82 initialisiert ready/61FPS/0particles, kein Startzustandfehler beobachtet.
- Lokaler normaler API-Helper liest den Schlüssel ausschließlich im Prozess aus test.db; config enabledtrue200, stop200, trigger rain/intensity0.8/duration20000 jeweils200/success. Öffentlicher Browser zeigt danach flächige Regenstriche, Diagnose ready/60FPS/4ms/7200particles. Ein Canvas; tatsächlich referenzierte Skripte socket.io/socket.io.js, weather-framegraph.js und cinematic-weather-engine.js. Deren erfolgreicher Bootstrap wird durch laufenden Renderer belegt; keine einzelnen HTTPstatus für Assets protokolliert.
- **Bestanden** für diese öffentliche Initialisierung, Queryerhaltung und sichtbare lokale Testreaktion über den temporären Tunnel. Testquelle lokaler kontrollierter Regen-Testtrigger, kein echtes Gift/Command/Liveereignis; kein OBS-, GPUpixelalpha-, Audio-, vollständiger Asset-/Dauerstabilitäts- oder Abbruch/Reconnectpass. Screenshots im Browsertool, kein exportierter Screenshotdateipfad.
- Cleanup: normaler stop200, eigener Tunnelstop success=true; eigener Tab82 geschlossen. GuardedRestore deaktiviert200 und entfernt ausschließlich bekannte selbst erzeugte bootstrap_v1/weather_config-Keys bei leerer Baseline, Giftmappings0. Finale Settings0/Mappings0; keine WholeDBrestoration, keine fremden Profildaten/Uploads/Viewer geändert, kein Appneustart. Tabellen bleiben erhalten.

### A8/P34 öffentlicher Tunnelversuch mit DNS-Blocker, 05.10.2026

- Voriger Zielturn: Fortschritt durch tatsächliche öffentliche P38-Regenprobe und vollständige eigene Rücksetzung. Neue Probe: Profil test/noRestart, P34 disabled, Pluginsettings0 read-only verifiziert; eigener TEMP-Snapshot ltth-fxgpu-public-before.json. Reguläre Aktivierung200/success/disabledPlugins[]. Kein Produktcode oder gemeinsame Datei geändert.
- ensure für /visual-fx-frame-webgpu/overlay liefert200/success/reused=false und https://annie-powered-parents-accomplished.trycloudflare.com/visual-fx-frame-webgpu/overlay. Öffentlicher Browserstart eigener Tab83 scheitert ERR_NAME_NOT_RESOLVED; anschließende Resolve-DnsName-Probe liefert ebenfalls keine Adresse. Kein Rendering-/Asset-/Eventpass, kein neuer Produktbug aus dem DNS-Ausfall.
- Wiederanbinden von Tab83 wird von der Browser-URL-Policy wegen der automatisch erzeugten data:-Fehlerseite abgelehnt. Ein ausschließliches Schließen über das dokumentierte Browser-Tab-API scheitert an derselben Policy. Keine Policyumgehung; Tab83 wurde nicht als Handoff markiert, explizites Schließen konnte aber nicht verifiziert werden. Neutraler Browserfehler ohne Nutzerdaten.
- Cleanup vollständig für App/Testprofil: clear-triggers200, eigener Tunnelstop200, Plugin disable200; gesicherte Baseline0, nur bekannte eigene config/presets-Keys erlaubt, finale Settings0. Helper ltth-fxgpu-public-restore.js Exit0. Kein eigenes Testevent ausgelöst, kein Neustart, keine fremden Profil-/Viewer-/Uploaddaten geändert.
- Status P34 öffentlicher Browserablauf: blockiert in dieser Probe durch externen DNS-Fehler; späterer eigener erneuter Tunnellauf bleibt erforderlich. Gesamtziel bleibt aktiv, da unabhängige Prüfungen möglich sind.

### P34 zweite öffentliche Probe und tatsächliche lokale Vorschau, 05.10.2026

- FreshBaseline test/noRestart/pluginfalse/settings0; reguläre Aktivierung200/disabledPlugins[]. Neuer ensure200/reusedfalse Host cities-joshua-levitra-him.trycloudflare.com. Resolve-DnsName ohne Adresse und Browser Tab84 ERR_NAME_NOT_RESOLVED. Zweiter unabhängiger öffentlicher Versuch durch externes DNS blockiert, kein Publicpass/Produktbug. Eigener Tab84 nicht als Handoff markiert, explizite Schließung der data:-Fehlerseite aufgrund vorigem Policyblock nicht erneut versucht.
- Unabhängige lokale UI85 tatsächlich geöffnet. Vorschau starten angeklickt: Button wird Vorschau stoppen, sichtbares iframe /visual-fx-frame-webgpu/overlay. Screenshot zeigt goldenen leuchtenden Rahmen/Partikel; Laufzeit ready/60FPS/0.3ms/scale100%. Bestanden für diesen lokalen UI-Start/Rendering-Ablauf. Vorschau stoppen stellt Button wieder her; eigene lokale Tabs85/86 geschlossen. Kein Vollbild-/Audio-/OBS/Public-/echter Giftpass daraus ableiten.
- Restoration: clear-triggers200, Tunnelstop200, disable200. Initialer gezielter Settingsguard hält unerwarteten settings-Key an, statt ihn unbesehen zu entfernen. Read-only Keyinventar genau plugin:visual-fx-frame-webgpu:settings; aktueller main.js saveConfig/setConfig('settings') Zeile439 bestätigt regulären eigenen Konfigkey. Nach Erweiterung des Guards ausschließlich um diesen belegten Key und ausgelassenem bereits erledigtem clear (nach Disable nicht mehr erreichbar) finale erneute stop200/disable200/settings0, Exit0. Keine fremden Einstellungen/WholeDB/Uploads geändert. Fehlgeschlagene Helperläufe ausdrücklich nicht als Restorationpass verwendet; finale verifizierte Ausgabe maßgeblich.

### LTTH-LIVE-054 — P3: WebGPU-FX-UI überschreibt initial den geladenen Rausch-Oktaven-Wert mit statischer Übersetzung

- Feature P34/A11, 05.10.2026, Windows/IAB/Node22/LTTH1.4.3/test, HEAD e9f135fd2e935e6fbcaa582902365d0e2cdfa7a9. Produktcode unverändert, parallele Talking-Heads/TTS-Dateien erhalten.
- Voraussetzungen: normale Defaultconfig noiseOctaves9, deutsche Browserlocale. Schritte: 1. /visual-fx-frame-webgpu/ui neu öffnen. 2. Rausch-Oktaven-Regler und Zahlenlabel vergleichen. 3. Nur Konfiguration neu laden anklicken. 4. UI in einem weiteren eigenen Tab neu öffnen.
- Erwartet: Das Zahlenlabel entspricht stets dem tatsächlichen Regler-/Konfigwert9.
- Tatsächlich: zwei unabhängige Initialöffnungen jeweils Regler.value9 / noiseOctavesValue.textContent8; gezielter tatsächlicher GETconfig enthält noiseOctaves9. Konfiguration neu laden korrigiert Label auf9, erneute Initialöffnung zeigt wieder8. Kein falscher gespeicherter Wert oder Rendererfehler behauptet.
- Quelle: tatsächliche lokale UI85/86 und GET eines einzelnen neutralen Feldes; keine synthetischen Events oder Zugangsdaten. Quellen settings.html1888 versieht dynamisches noiseOctavesValue mit data-i18n=plugins.visual-fx-frame-webgpu.visual_fx_frame_webgpu.ui.controls.values.eight; loadConfig3440–3441 setzt Regler/Label korrekt auf9. Hypothese: spätere Übersetzungsinitialisierung ersetzt den geladenen Zahlenwert durch statischen Text8. Die genaue asynchrone Reihenfolge wurde nicht instrumentiert.
- Reproduzierbarkeit: 2/2 frische Tabs, plus normaler Reload als Kontrollfall. Auswirkung: irreführende angezeigte Qualitätskonfiguration beim ersten Laden. Kein exportierter Screenshotdateipfad; Tool-Screenshot des lokalen Renderings vorhanden, Zahlenbelege DOM/AX.
- Cleanup wie vorstehend: eigene lokale Tabs geschlossen, Trigger/Tunnel gestoppt, Pluginfalse/settings0. Keine Produktkorrektur oder Neustart.
