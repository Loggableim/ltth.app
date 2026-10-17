# OBS Abnahmeplan: Overlay-Inventar und isolierter Pilot

Stand: 2026-10-09. Planung und Quellpruefung; es wurde weder OBS noch LTTH fuer diese Abnahme gestartet. Praktische OBS-Abdeckung: **0/104**.

## Gepruefter Umfang

- docs/plugin-docs-qa/report.json: obs.expected=104, obs.records=0, obs.reportPath=null. Das QA-Report enthaelt keine OBS-Aufnahmen.
- Der Matrixgenerator verwendet `buildObsCaptureInventory()` fuer 68 aktuelle oeffentliche Guide-Faelle (17 x de/en/es/fr). Die historische 104er-Matrix fuegt 32 lokale Closed-Beta-Planfaelle und vier Chatango-Rueckbaukontrollen hinzu. Das sind 104 Plan-IDs, nicht 104 aktive oeffentliche Guides oder 104 verschiedene Plugins; alle 104 bleiben fuer OBS `NOT_TESTED`.
- Jede URL ist HTTP auf Loopback 127.0.0.1:3000 als Planplatzhalter. Vor einer autorisierten Ausfuehrung muss sie auf den verifizierten isolierten LTTH-Port zeigen; ein Lauf ausserhalb Loopback ist ungueltig. Die vorhandene Query wird vom Generator beibehalten und lang ergaenzt.
- OBS-Eingangstyp fuer alle Zeilen: browser_source; Szene tutorial; Quellenname LTTH Docs Capture. OBS Input-UUIDs und Capture-Ergebnisse fehlen, solange records=0.
- Aufloesung: regulaer 1280x720; webgpu-weather-control 1920x1080. Die vier expliziten GPU-Faelle sind visual-fx-frame-webgpu, webgpu-emoji-rain, webgpu-fireworks, webgpu-weather-control.

## OBS-Version, Steuerung und Bind-Sicherheit

Der koordinierte Statusbericht nennt installierte OBS-Version **32.1.0** und die Module obs-browser.dll und obs-websocket.dll; ich konnte die native Oberflaeche hier nicht mit CUA erfassen (keine Native-App-Oberflaeche verfuegbar; cua.listWindows ist keine unterstuetzte API). Daher ist 32.1.0 ein berichteter Installationsbefund, keine von mir visuell oder laufzeitseitig bestaetigte Version. Installationsordner/Benutzerprofile wurden nicht erneut untersucht.

Vorhandene Steuerung: obs-websocket v5 via obs-websocket-js (App-Abhaengigkeit ^5.0.6); LTTH-Manager verbindet standardmaessig zu localhost:4455. Capture-Session nutzt schmale Requests: GetStreamStatus, GetRecordStatus, GetSceneItemList, CreateInput, GetInputSettings, GetSourceScreenshot, RemoveSceneItem, RemoveInput. Der OBS-Protokollvertrag stellt nach Verbindung GetVersion fuer Laufzeitversion/RPC-Pruefung bereit. Keine Verbindung wurde hergestellt und keine Zugangsdaten oder OBS-Logs gelesen.

Loopback-Bindung des OBS-WebSocket-Servers ist derzeit **nicht nachgewiesen**. Die offizielle obs-websocket-README dokumentiert Startargumente fuer Port, Passwort und IPv4-only, aber kein Bind-Adressargument; Port/PW allein beweisen keine Loopback-Exklusivitaet. Das Projekt verwendet standardmaessig ws:// mit Authentifizierung. Vor jeder Freigabe muss ein isolierter Probeaufbau die tatsaechlichen Listening-Adressen fuer den OBS-PID belegen (nur 127.0.0.1/::1 zulassen, unerwartete Wildcard-/LAN-Listener als Stop-Bedingung); andernfalls bleibt der OBS-WebSocket-Start blockiert. Siehe [offizielle obs-websocket README](https://github.com/obsproject/obs-websocket/blob/master/README.md?plain=1).

## Isolierter Pilot: Sidekick HUD

Sidekick ist kein Bestandteil der 26 Guide-IDs/104-Zeilen-Inventarliste. Separater Pilotfall zur Ueberpruefung des zuvor reparierten Public-Overlay-Vertrags:

| Fall | Einstieg | Lesepfade | Socket-Vertrag | Rendering |
|---|---|---|---|---|
| sidekick/de (Pilot) | GET /overlay/sidekick/hud?lang=de | GET /api/sidekick/public-status, GET /api/sidekick/public-events | Request sidekick:public-status:request; Antwort sidekick:public-status; begrenzte Projektionsdaten | OBS browser_source, 1280x720; lokale HTML/CSS/JS-Assets aus Sidekick-Overlayverzeichnis; Status/Events laden und mit synthetischen Loopback-Events aktualisieren |

Pilotpass erst nach ausdruecklicher Freigabe: frisches portables OBS-Profil und leere Tutorial-Szene; isolierter LTTH-Testprofilprozess auf Loopback und minimaler Pluginallowlist mit Sidekick; Browser-URL ausschliesslich auf denselben Loopback-Host; Quell-URL/-Dimension mit GetInputSettings pruefen; Quelle und Szene via GetSourceScreenshot getrennt erfassen; nur synthetische Events einspeisen; Stream/Record vor/wahrend/nach inaktiv; Quelle entfernen und leere Ausgangsszene vergleichen. Nie Admin-/Schreibpfade, reale TikTok-Konten, bestehende OBS-Profile oder geheime Logs verwenden. Der CUA-Befund blockiert native UI-Inspektion, nicht den spaeteren Protokolltest; Bind-Adressnachweis und CEO-Freigabe blockieren jeden Start.

## Pure Fixture-Hosts fuer die restlichen Overlays

Ein lokaler HTTP-/Socket-Fixturehost kann vor OBS die 104 URL-, Locale-, Asset-, Status- und synthetischen Updatevertraege pruefen, ohne App/OBS zu starten. Er ist fuer Testabdeckung und schnelle Diagnose nuetzlich, zaehlt aber **nicht** als Produkt- oder OBS-Live-Readiness: Er beweist weder OBS Browser Source Chromium noch WebGPU/GPU, OBS-Capture, UI-Komposition, reale Pluginregistrierung noch OBS-Lifecycle. Bereits vorhandene isolierte Registry-/Overlay-Tests bleiben getrennte Evidenz. Fuer 104 Faelle ist daher eine reine Fixture-Vorstufe optional; sobald Screenshots als OBS-Abnahme beansprucht werden, muss jeder Fall durch den echten isolierten OBS-Protokollpfad laufen.

### Sidekick Fehlerzustand fuer den synthetischen Pilot

Der Pilot injiziert ausschliesslich lokal synthetische HTTP-503- bzw. Netzwerkfehler auf public-status und public-events. Erwarteter HUD-Vertrag: status-Fehler setzt den Indikator auf getrennt und zeigt „Sidekick status unavailable“ sichtbar/aria-live; ein Eventfeed-Fehler zeigt „Event feed unavailable“, ohne einen separat erfolgreichen TikTok-Status als getrennt zu markieren. Ein erfolgreicher Request setzt nur den zugehoerigen Fehler zurueck. Belege sind app/plugins/sidekick/test/hud-availability.test.js und app/plugins/sidekick/test/pilot-public-overlay-harness.test.js: 3 Suites / 7 Tests liefen gruen mit --detectOpenHandles; keine Handle-Warnung. Der Pilot nutzt den echten Socket.IO-Server-Client und Parser mit CONNECT-/EVENT-Paketen, aber einen speicherinternen Transport; er prueft keinen Engine.IO-TCP/WebSocket-Handshake und oeffnet keinen HTTP-/Socket-Listener. Middleware, Registry, Pluginhandler, HTTP-Handler und HUD-Datei sind echt; 503 wird im reinen Test-Fetch synthetisch injiziert. Kein Serverprozess oder OBS wurde gestartet.
## Geplante Ablaufpruefung je Matrixzeile

Jede autorisierte Zeile nutzt denselben Ablauf: HTTP-Dokumentantwort/Locale/Assets pruefen; URL und Dimensionen per OBS GetInputSettings verifizieren; auf Source-Screenshot und Tutorial-Scene-Screenshot sichtbare Ausgabe pruefen; erwartetes Update nur mit isolierten synthetischen Daten anstossen; Fehlerstatus erfassen; danach Element und Input entfernen und exakte leere Szenenbaseline bestaetigen. Ein Browser-preview oder HTTP-200 allein zaehlt nicht als OBS-Rendering.

Fuer GPU-Faelle wird separat protokolliert, ob OBS Chromium/WebGPU initialisiert und das erwartete Bild im OBS-eigenen Screenshot entsteht. Ein GPU-Ausfall ist ein dokumentierter Fall, kein stiller Wechsel auf einen Browser-Mock. Fuer alle anderen Faelle muessen relevante Bilder, Fonts, CSS/JS und Locale-JSON geladen sein.

## Startgates

1. CEO bestaetigt den konkreten isolierten Start und Cleanupplan.
2. OBS-Kopie portable, frisches Profil/Collection, dedizierte leere Szene; Hashes und Prozesspfad vor Start bestaetigen.
3. Isolierter LTTH-Prozess mit Testprofil, minimaler Pluginallowlist, LTTH_BIND_ADDRESS=127.0.0.1, eigenem Temp-/LOCALAPPDATA-Baum und loopback-only Port; keine TikTok-Reconnects, Browser- oder Swagger-Dienste.
4. Vor weiterer Arbeit Listener dem exakten OBS-PID zuordnen und tatsaechlich nur Loopback-Interfaces bestaetigen. Wenn OBS bind nicht eng konfigurierbar ist, muss die Isolation auf OS-/VM-Ebene Netz-Zugriff fuer fremde Interfaces nachweisbar sperren; ohne diesen Nachweis kein OBS-Start.
5. Stream/Record/Replays/Virtual Camera inaktiv, Szene anfangs leer, keine fremden Prozesse oder Quellen.
6. Output, Screenshots, Receipts, Logs und temporaere Passwoerter ausschliesslich im dedizierten Temp-Abnahmeordner; Passwoerter weder in Kommandozeilenreports, Logs noch Chat aufnehmen.
7. Pro Pilot/Zeile Cleanup-Baseline und Prozessende belegen. Bei Abbruch sichere Cleanup-Evidenz vor weiterem Fall.

## Matrix der 104 Quellfaelle

| ID / Plugin-Locale | Overlaypfad | Plan-URL (Loopback-Platzhalter) | OBS-Browser-Source | Renderanforderung | Praktischer Status |
|---|---|---|---|---|---|
| 001 advanced-timer/de | /plugins/advanced-timer/overlay/index.html | http://127.0.0.1:3000/plugins/advanced-timer/overlay/index.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 002 advanced-timer/en | /plugins/advanced-timer/overlay/index.html | http://127.0.0.1:3000/plugins/advanced-timer/overlay/index.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 003 advanced-timer/es | /plugins/advanced-timer/overlay/index.html | http://127.0.0.1:3000/plugins/advanced-timer/overlay/index.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 004 advanced-timer/fr | /plugins/advanced-timer/overlay/index.html | http://127.0.0.1:3000/plugins/advanced-timer/overlay/index.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 005 chatango/de | /plugins/chatango/ui.html | http://127.0.0.1:3000/plugins/chatango/ui.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 006 chatango/en | /plugins/chatango/ui.html | http://127.0.0.1:3000/plugins/chatango/ui.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 007 chatango/es | /plugins/chatango/ui.html | http://127.0.0.1:3000/plugins/chatango/ui.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 008 chatango/fr | /plugins/chatango/ui.html | http://127.0.0.1:3000/plugins/chatango/ui.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 009 clarityhud/de | /overlay/clarity/full | http://127.0.0.1:3000/overlay/clarity/full?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 010 clarityhud/en | /overlay/clarity/full | http://127.0.0.1:3000/overlay/clarity/full?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 011 clarityhud/es | /overlay/clarity/full | http://127.0.0.1:3000/overlay/clarity/full?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 012 clarityhud/fr | /overlay/clarity/full | http://127.0.0.1:3000/overlay/clarity/full?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 013 coinbattle/de | /plugins/coinbattle/overlay/overlay.html | http://127.0.0.1:3000/plugins/coinbattle/overlay/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 014 coinbattle/en | /plugins/coinbattle/overlay/overlay.html | http://127.0.0.1:3000/plugins/coinbattle/overlay/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 015 coinbattle/es | /plugins/coinbattle/overlay/overlay.html | http://127.0.0.1:3000/plugins/coinbattle/overlay/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 016 coinbattle/fr | /plugins/coinbattle/overlay/overlay.html | http://127.0.0.1:3000/plugins/coinbattle/overlay/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 017 emoji-rain/de | /emoji-rain/obs-hud | http://127.0.0.1:3000/emoji-rain/obs-hud?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 018 emoji-rain/en | /emoji-rain/obs-hud | http://127.0.0.1:3000/emoji-rain/obs-hud?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 019 emoji-rain/es | /emoji-rain/obs-hud | http://127.0.0.1:3000/emoji-rain/obs-hud?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 020 emoji-rain/fr | /emoji-rain/obs-hud | http://127.0.0.1:3000/emoji-rain/obs-hud?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 021 fireworks/de | /plugins/fireworks/overlay.html | http://127.0.0.1:3000/plugins/fireworks/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 022 fireworks/en | /plugins/fireworks/overlay.html | http://127.0.0.1:3000/plugins/fireworks/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 023 fireworks/es | /plugins/fireworks/overlay.html | http://127.0.0.1:3000/plugins/fireworks/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 024 fireworks/fr | /plugins/fireworks/overlay.html | http://127.0.0.1:3000/plugins/fireworks/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 025 flame-overlay/de | /flame-overlay/overlay | http://127.0.0.1:3000/flame-overlay/overlay?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 026 flame-overlay/en | /flame-overlay/overlay | http://127.0.0.1:3000/flame-overlay/overlay?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 027 flame-overlay/es | /flame-overlay/overlay | http://127.0.0.1:3000/flame-overlay/overlay?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 028 flame-overlay/fr | /flame-overlay/overlay | http://127.0.0.1:3000/flame-overlay/overlay?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 029 game-engine/de | /plugins/game-engine/overlay/game-hud.html | http://127.0.0.1:3000/plugins/game-engine/overlay/game-hud.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 030 game-engine/en | /plugins/game-engine/overlay/game-hud.html | http://127.0.0.1:3000/plugins/game-engine/overlay/game-hud.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 031 game-engine/es | /plugins/game-engine/overlay/game-hud.html | http://127.0.0.1:3000/plugins/game-engine/overlay/game-hud.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 032 game-engine/fr | /plugins/game-engine/overlay/game-hud.html | http://127.0.0.1:3000/plugins/game-engine/overlay/game-hud.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 033 goals/de | /goals/overlay | http://127.0.0.1:3000/goals/overlay?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 034 goals/en | /goals/overlay | http://127.0.0.1:3000/goals/overlay?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 035 goals/es | /goals/overlay | http://127.0.0.1:3000/goals/overlay?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 036 goals/fr | /goals/overlay | http://127.0.0.1:3000/goals/overlay?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 037 interactive-story/de | /plugins/interactive-story/overlay.html | http://127.0.0.1:3000/plugins/interactive-story/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 038 interactive-story/en | /plugins/interactive-story/overlay.html | http://127.0.0.1:3000/plugins/interactive-story/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 039 interactive-story/es | /plugins/interactive-story/overlay.html | http://127.0.0.1:3000/plugins/interactive-story/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 040 interactive-story/fr | /plugins/interactive-story/overlay.html | http://127.0.0.1:3000/plugins/interactive-story/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 041 milestone-leaderboard/de | /plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html | http://127.0.0.1:3000/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 042 milestone-leaderboard/en | /plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html | http://127.0.0.1:3000/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 043 milestone-leaderboard/es | /plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html | http://127.0.0.1:3000/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 044 milestone-leaderboard/fr | /plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html | http://127.0.0.1:3000/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 045 minecraft-connect/de | /plugins/minecraft-connect/overlay/minecraft_overlay.html | http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 046 minecraft-connect/en | /plugins/minecraft-connect/overlay/minecraft_overlay.html | http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 047 minecraft-connect/es | /plugins/minecraft-connect/overlay/minecraft_overlay.html | http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 048 minecraft-connect/fr | /plugins/minecraft-connect/overlay/minecraft_overlay.html | http://127.0.0.1:3000/plugins/minecraft-connect/overlay/minecraft_overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 049 music-bot/de | /plugins/music-bot/overlay.html | http://127.0.0.1:3000/plugins/music-bot/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 050 music-bot/en | /plugins/music-bot/overlay.html | http://127.0.0.1:3000/plugins/music-bot/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 051 music-bot/es | /plugins/music-bot/overlay.html | http://127.0.0.1:3000/plugins/music-bot/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 052 music-bot/fr | /plugins/music-bot/overlay.html | http://127.0.0.1:3000/plugins/music-bot/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 053 openshock/de | /plugins/openshock/overlay/openshock_overlay.html | http://127.0.0.1:3000/plugins/openshock/overlay/openshock_overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 054 openshock/en | /plugins/openshock/overlay/openshock_overlay.html | http://127.0.0.1:3000/plugins/openshock/overlay/openshock_overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 055 openshock/es | /plugins/openshock/overlay/openshock_overlay.html | http://127.0.0.1:3000/plugins/openshock/overlay/openshock_overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 056 openshock/fr | /plugins/openshock/overlay/openshock_overlay.html | http://127.0.0.1:3000/plugins/openshock/overlay/openshock_overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 057 quiz-show/de | /plugins/quiz-show/quiz_show_overlay.html | http://127.0.0.1:3000/plugins/quiz-show/quiz_show_overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 058 quiz-show/en | /plugins/quiz-show/quiz_show_overlay.html | http://127.0.0.1:3000/plugins/quiz-show/quiz_show_overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 059 quiz-show/es | /plugins/quiz-show/quiz_show_overlay.html | http://127.0.0.1:3000/plugins/quiz-show/quiz_show_overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 060 quiz-show/fr | /plugins/quiz-show/quiz_show_overlay.html | http://127.0.0.1:3000/plugins/quiz-show/quiz_show_overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 061 schnorrbecher/de | /overlay/coincup?transparent=1 | http://127.0.0.1:3000/overlay/coincup?transparent=1&lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 062 schnorrbecher/en | /overlay/coincup?transparent=1 | http://127.0.0.1:3000/overlay/coincup?transparent=1&lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 063 schnorrbecher/es | /overlay/coincup?transparent=1 | http://127.0.0.1:3000/overlay/coincup?transparent=1&lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 064 schnorrbecher/fr | /overlay/coincup?transparent=1 | http://127.0.0.1:3000/overlay/coincup?transparent=1&lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 065 spotlight/de | /plugins/spotlight/overlays/chatter.html | http://127.0.0.1:3000/plugins/spotlight/overlays/chatter.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 066 spotlight/en | /plugins/spotlight/overlays/chatter.html | http://127.0.0.1:3000/plugins/spotlight/overlays/chatter.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 067 spotlight/es | /plugins/spotlight/overlays/chatter.html | http://127.0.0.1:3000/plugins/spotlight/overlays/chatter.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 068 spotlight/fr | /plugins/spotlight/overlays/chatter.html | http://127.0.0.1:3000/plugins/spotlight/overlays/chatter.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 069 stream-monsters/de | /stream-monsters/overlay | http://127.0.0.1:3000/stream-monsters/overlay?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 070 stream-monsters/en | /stream-monsters/overlay | http://127.0.0.1:3000/stream-monsters/overlay?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 071 stream-monsters/es | /stream-monsters/overlay | http://127.0.0.1:3000/stream-monsters/overlay?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 072 stream-monsters/fr | /stream-monsters/overlay | http://127.0.0.1:3000/stream-monsters/overlay?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 073 stt-ticker/de | /plugins/stt-ticker/overlay/ticker.html | http://127.0.0.1:3000/plugins/stt-ticker/overlay/ticker.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 074 stt-ticker/en | /plugins/stt-ticker/overlay/ticker.html | http://127.0.0.1:3000/plugins/stt-ticker/overlay/ticker.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 075 stt-ticker/es | /plugins/stt-ticker/overlay/ticker.html | http://127.0.0.1:3000/plugins/stt-ticker/overlay/ticker.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 076 stt-ticker/fr | /plugins/stt-ticker/overlay/ticker.html | http://127.0.0.1:3000/plugins/stt-ticker/overlay/ticker.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 077 talking-heads/de | /plugins/talking-heads/overlay.html | http://127.0.0.1:3000/plugins/talking-heads/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 078 talking-heads/en | /plugins/talking-heads/overlay.html | http://127.0.0.1:3000/plugins/talking-heads/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 079 talking-heads/es | /plugins/talking-heads/overlay.html | http://127.0.0.1:3000/plugins/talking-heads/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 080 talking-heads/fr | /plugins/talking-heads/overlay.html | http://127.0.0.1:3000/plugins/talking-heads/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 081 toptier/de | /plugins/toptier/overlay.html | http://127.0.0.1:3000/plugins/toptier/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 082 toptier/en | /plugins/toptier/overlay.html | http://127.0.0.1:3000/plugins/toptier/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 083 toptier/es | /plugins/toptier/overlay.html | http://127.0.0.1:3000/plugins/toptier/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 084 toptier/fr | /plugins/toptier/overlay.html | http://127.0.0.1:3000/plugins/toptier/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 085 visual-fx-frame-webgpu/de | /visual-fx-frame-webgpu/overlay | http://127.0.0.1:3000/visual-fx-frame-webgpu/overlay?lang=de | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 086 visual-fx-frame-webgpu/en | /visual-fx-frame-webgpu/overlay | http://127.0.0.1:3000/visual-fx-frame-webgpu/overlay?lang=en | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 087 visual-fx-frame-webgpu/es | /visual-fx-frame-webgpu/overlay | http://127.0.0.1:3000/visual-fx-frame-webgpu/overlay?lang=es | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 088 visual-fx-frame-webgpu/fr | /visual-fx-frame-webgpu/overlay | http://127.0.0.1:3000/visual-fx-frame-webgpu/overlay?lang=fr | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 089 weather-control/de | /plugins/weather-control/overlay.html | http://127.0.0.1:3000/plugins/weather-control/overlay.html?lang=de | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 090 weather-control/en | /plugins/weather-control/overlay.html | http://127.0.0.1:3000/plugins/weather-control/overlay.html?lang=en | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 091 weather-control/es | /plugins/weather-control/overlay.html | http://127.0.0.1:3000/plugins/weather-control/overlay.html?lang=es | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 092 weather-control/fr | /plugins/weather-control/overlay.html | http://127.0.0.1:3000/plugins/weather-control/overlay.html?lang=fr | 1280x720 | OBS Browser Source; DOM/CSS/Canvas pruefen | Offen |
| 093 webgpu-emoji-rain/de | /plugins/webgpu-emoji-rain/overlay.html | http://127.0.0.1:3000/plugins/webgpu-emoji-rain/overlay.html?lang=de | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 094 webgpu-emoji-rain/en | /plugins/webgpu-emoji-rain/overlay.html | http://127.0.0.1:3000/plugins/webgpu-emoji-rain/overlay.html?lang=en | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 095 webgpu-emoji-rain/es | /plugins/webgpu-emoji-rain/overlay.html | http://127.0.0.1:3000/plugins/webgpu-emoji-rain/overlay.html?lang=es | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 096 webgpu-emoji-rain/fr | /plugins/webgpu-emoji-rain/overlay.html | http://127.0.0.1:3000/plugins/webgpu-emoji-rain/overlay.html?lang=fr | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 097 webgpu-fireworks/de | /webgpu-fireworks/overlay | http://127.0.0.1:3000/webgpu-fireworks/overlay?lang=de | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 098 webgpu-fireworks/en | /webgpu-fireworks/overlay | http://127.0.0.1:3000/webgpu-fireworks/overlay?lang=en | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 099 webgpu-fireworks/es | /webgpu-fireworks/overlay | http://127.0.0.1:3000/webgpu-fireworks/overlay?lang=es | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 100 webgpu-fireworks/fr | /webgpu-fireworks/overlay | http://127.0.0.1:3000/webgpu-fireworks/overlay?lang=fr | 1280x720 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 101 webgpu-weather-control/de | /webgpu-weather-control/overlay | http://127.0.0.1:3000/webgpu-weather-control/overlay?lang=de | 1920x1080 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 102 webgpu-weather-control/en | /webgpu-weather-control/overlay | http://127.0.0.1:3000/webgpu-weather-control/overlay?lang=en | 1920x1080 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 103 webgpu-weather-control/es | /webgpu-weather-control/overlay | http://127.0.0.1:3000/webgpu-weather-control/overlay?lang=es | 1920x1080 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |
| 104 webgpu-weather-control/fr | /webgpu-weather-control/overlay | http://127.0.0.1:3000/webgpu-weather-control/overlay?lang=fr | 1920x1080 | OBS Browser Source; WebGPU/GPU-Pfad separat verifizieren | Offen |

## Read-only Guest-Transfer-Vorbereitung

Der genaue Fixture-Quellstand samt SHA-256/Bytegroessen und Testlauf steht in [sidekick-pilot-fixture-manifest.json](sidekick-pilot-fixture-manifest.json). Das Manifest enthaelt HUD, Sidekick-Handler, Public-Projection, Registry/Middleware, drei fokussierte Tests und Dependency-Manifeste. Es wurde kein Guest-Paket kopiert und keine VM gestartet. Fuer einen spaeteren Gasttransfer nur diese aufgelisteten Dateien in einen wegwerfbaren Checkout kopieren und vor dem Test alle Hashes pruefen; keine Laufzeitkonfiguration, DB, Profile, Logs oder Zugangsdaten transferieren. Fixturepass beweist keinen echten Engine.IO/WebSocket-Transport und kein OBS-Rendering.

## Status

- **Behoben/geprueft:** Inventar exakt gegen den aktuellen Quellgenerator verifiziert (26 IDs x 4 Sprachen); Capture-Session-Quellvertrag gelesen; Matrix vollstaendig erzeugt.
- **Teilweise geprueft:** OBS 32.1.0 und DLLs stehen im koordinierten Statusbericht; native UI und Laufzeitversion nicht mit CUA bestaetigt. Sidekick-Routen/Sockets aus Quelltext ermittelt; Pilot nicht ausgefuehrt.
- **Blockiert:** OBS-/App-Start wartet auf CEO-Freigabe und beweisbare Netzisolation/Listenerbindung. Die offizielle OBS-WebSocket-Dokumentation belegt kein loopback-bind-Flag.
- **Nicht geprueft:** alle 104 OBS-Ladevorgaenge, Visuals, Updates, Fehler- und Lifecycle-Verhalten; OBS-WebSocket-Handshake und Screenshotlauf. Abdeckung bleibt 0/104.

Quelle der Laufzeit-API: offizielles [obs-websocket Protokoll](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md?plain=1).
