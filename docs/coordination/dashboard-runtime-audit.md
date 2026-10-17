# Dashboard: Vorbereitung der späteren praktischen Abnahme

Stand 2026-10-07. Read-only Codeaudit plus fokussierte bestehende Tests; kein Backend, Provider oder produktives Profil gestartet. Zielbild 1 bleibt in Priorität 2. Dieser Bericht bereitet Punkt 5 vor und gibt ihn nicht zur vorgezogenen Abnahme frei.

## Tatsächliche Pfade

- `app/public/js/dashboard.js:82–117`: wartet auf `/api/init-state`, lädt parallel Settings/Flows/aktives Profil/Configpfad/Sessionstatus/Aliase, erzeugt anschließend `io()` und registriert Listener.
- `dashboard.js:575–619`: tatsächliche `tiktok:status`, `tiktok:stats`, `tiktok:event` und `profile:switched`. Server sendet neuen Sockets aktuelle Verbindung und bei aktiver Verbindung Statistik (`app/server.js:3392–3431`).
- Ereignisverlauf ist der browserseitige Livepuffer `#event-log`: `addEventToLog` fügt neueste Zeile vorn ein und begrenzt auf 100 (`dashboard.js:1092–1184`). Kein aktueller Lade-/Replaypfad für historische Ereignisse in diesem Modul gefunden. Das allein ist kein Defekt ohne zugesagte Persistenz.
- Profil: `/api/profiles/active` (`dashboard.js:2989`) und POST `/api/profiles/switch` (`server.js:2186`). Backend plant nach Response einen echten Neustart; `profile-manager.js:276–302` zeigt Warnung und beginnt Restart. Datenbankisolation ist separat von tatsächlicher Browser-/Restartabnahme zu prüfen.
- Sprache: tatsächlicher POST `/api/i18n/current` persistiert Auswahl und sendet `locale-changed` (`server.js:1901–1919`). `/api/i18n/locale` ist ein anderer Pfad ohne Broadcast. Shared `i18n-client.js` synchronisiert Socketlocale und statische `data-i18n`-Elemente; `init-language-switchers.js` bindet Auswahl.

## Konkrete Befunde

1. **Bestätigte HTMLinjection im Liveverlauf.** `dashboard.js:1168–1172` setzt `username`, `typeIcon` und `details` unescaped in `row.innerHTML`; Chatdetails sind `data.message` (1140). Eulerstream übernimmt `data.comment || data.message` unverändert (Adapter:1406) und sendet dieselben Daten per `tiktok:event` (3103–3117). Der aktive Dashboardlistener ruft genau diese Funktion auf (592–593), kein Ersatzrenderer in Dashboard-Enhancements gefunden. Kontrollierte Originalfunktionsprobe in JSDOM ohne Netzwerk: Username `<b data-audit=username>Owned</b>` und Nachricht `<span data-audit=message>Marker</span>` erzeugen echte `b`/`span`-DOMelemente. Ergebnis beide `true`. Kein Script oder externer Request verwendet; CSP ist kein HTMLescapingbeleg. Minimaler späterer Fix: dynamische Textfelder per `textContent` erstellen oder konsequent escapen, generierten statischen Badge getrennt halten; Regression mit harmlosen Markuptokens.
2. **Initialisierungszirkel bei erstem Dashboardclient.** Dashboard wartet vor Socketerzeugung auf `ready` (82–109). `initialization-state.js:99–108` benötigt hierfür `socketReady`; Server setzt dieses erst im Socketconnectionhandler (3392–3398). Ohne bereits verbundenen Client wartet der erste Dashboardstart bis zum 10-Sekunden-Timeout, obwohl HTTP/DB/Plugins schon bereit sein können. Navigation/Profilemanager warten ebenfalls auf den Dashboard-Socket und lösen den Zirkel nicht. Praktischer Kaltstartnachweis steht aus; minimal später readiness für HTTPladen von erstem Clientanschluss entkoppeln oder Socket früh erzeugen und sichere Datenverarbeitung weiterhin separat sperren.
3. **Dynamische Eventlabels werden nicht lokalisiert.** `dashboard.js:1137–1165` erzeugt feste Texte wie `Gift`, `New follower!`, `Shared the stream`, `New subscriber!` und `coins`; erzeugte Zeilen haben keine Übersetzungsschlüssel und dieses Modul keinen Sprachwechsel-Rebuild. Sprachwechsel kann statisches Chrome aktualisieren, diese Laufzeitzeilen bleiben Englisch. Spätere Probe muss Nutzinhalte erhalten und ausschließlich Anzeigelabels übersetzen.

## Aktuelle Tests

Bundled Node 22, ausgeführt ohne Produktbackend:

`runtime/node/node.exe app/node_modules/jest/bin/jest.js --runInBand --config app/jest.config.js --runTestsByPath app/test/dashboard-enhancements-plugin-probe.test.js app/test/dashboard-csp-static.test.js app/test/profile-switching-integration.test.js app/test/profile-switch-localstorage-cleanup.test.js app/test/profile-switch-socket-event.test.js`

**5 Suites / 20 Tests PASS.** DB-Integration verwendet eigene temporäre SQLiteprofile. Profile-Socketeventtest simuliert das Serveremit; er ist keine tatsächliche Endpoint-/Restartprüfung. CSP/static und Pluginprobe ersetzen weder Liveverlaufescaping noch tatsächlichen Browserkaltstart. Weitere relevante vorhandene Tests: `dashboard-tts-initialization.test.js`, `dashboard-tts-renderer.test.js` (fremde TTS-Arbeit, hier nicht wiederholt), `locale-route.test.js` (Express-/HTTProute), `public-i18n-document-language.test.js` (öffentliche Dokui18n, nicht Dashboardruntime).

## Spätere praktische Sequenz ohne Provider

1. Nach Prioritätsfreigabe eigene clean docs-capture Umgebung mit leerer Pluginallowlist, freiem Loopbackport, eigener Temp-DB und Chromium; Originaldashboardassets sowie Vor-/Nachpins binden. Netzwerk außerhalb eigener Origin blockieren, keine Audio-/Micaktion.
2. Ersten Client ohne vorherigen Socket öffnen; `/api/init-state` und sichtbare Initialladezeit beobachten. Erfolgs-/leerzustände der echten Profil-/Settings-/Flowendpoints vergleichen. HTTPfehler gezielt am Browserrequest erzeugen und sichtbare Fehlermeldung/Retry prüfen; das ist Browserfaultinjection, kein Backendfehlerclaim.
3. Ereignispipeline über einen ausdrücklich eigenen backendseitigen sicheren Injektionseinstieg prüfen, falls vorhanden. Kein externes TikTokkonto anschließen und keine browserseitigen Fakepakete als tatsächlichen Backendnachweis ausgeben. Fehlt dieser Einstieg, separaten source-backed Renderernachweis für Eventzeilen verwenden und Backendpipeline als offen kennzeichnen.
4. POST `/api/i18n/current` DE/EN/ES/FR: statisches Chrome und vorhandene dynamische Zeilen prüfen; Username/Chattext unverändert erhalten. Verbindungstrennung/Reconnect auf stale Status/Statistik prüfen.
5. Zwei ausschließlich eigene Profile: Settings differenzieren, tatsächliche `/api/profiles/switch` und vorgesehenen Neustart beobachten; neuer PID/Port/aktive DB, geleerter Browserpuffer und Profilanzeige kontrollieren. Restart mit docs-capture muss vorher source-geprüft werden; keine ungebundene Relaunchumgebung erlauben.
6. Eigener POST `/api/shutdown`; Exit 0, DB-/Servercleanup, Browserabschluss und Portschluss dokumentieren. Keine Schrittfreigabe oder OBS-Pass aus diesem vorbereitenden Audit ableiten.
