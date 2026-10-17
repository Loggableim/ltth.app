# Zielbild 1 – Fortschritt praktische Abnahme

Stand: 2026-10-10; die Reihenfolge aus `ZIELBILD_PRIORITAETEN.md` bleibt verbindlich. **Punkt 1 bleibt IN ARBEIT.** Engine-Teilbelege am exakten Quellhash `D87B4B8C…DB889DFD` sind vorhanden: echter MPV-Null-AO-Steuerungslauf und ein synthetischer 440-Hz-Ton bei Volume 60, vom Nutzer als hörbar bestätigt. Der isolierte Candidate `bb132aba` hat außerdem 2 synthetische Suiten / 68 Tests bestanden. Historische lokale Queue→MPV-Fixtureläufe und eine getrennte öffentliche Resolver-Textsuche sind ebenfalls belegt, aber kein durchgängiger Providerergebnis→Pluginrequest→Queue→MPV-Musiktracklauf. Der aktuelle dirty Shared-Source-Stand besteht den sicheren Persistenz-vor-MPV-Shutdown-Quellordnungscheck, erfüllt aber noch nicht die gewählte Recoverysemantik: nach drei Versuchen gibt es keinen selbsttätigen Folgeversuch; der 4,5-s-Unload-Timeout kann die Orchestrierung beenden, während `destroy()` noch läuft. Der isolierte, nicht integrierte Recovery-Candidate besteht **9/9 Fake-/Timer-/Quellvertragstests**; SQLite-/Runtime-Recovery wurde nicht geprüft. Offen sind integrierte Providerwiedergabe, Queue-Persistenz/Host-Shutdown-Recovery und Heartbeat/Recovery. Punkt 2 bleibt auf ausdrücklichen Nutzerwunsch zurückgestellt: OBS praktisch 0/104, kein OBS-Start. Punkte 2–6 werden nicht vorgezogen. Es gibt kein Release/Push/Signieren/Publish/Deployment.

## 1. Music Bot / echte MPV-Wiedergabe — IN ARBEIT; ältere lokale Abnahme historisch

### Geprüft und belegt

- MPV liegt unter `C:\ProgramData\chocolatey\lib\mpvio.install\tools\mpv.exe` (115,788,288 Bytes, geprüft am 07.10.2026). Die MPV-Proben verwenden eigene Prozesse und temporäre Fixtures. Keine App, kein Nutzerprofil, keine TikTok-Verbindung und kein Safetylock-Unlockpfad wurde gestartet/verändert.
- **MPV-Steuerung / Nullausgabe:** isolierter echter MPV-Test lud ein synthetisches Silent-WAV, prüfte IPC und Position, Heartbeat, Seek während Wiedergabe und Pause, Pause/Resume, Stop, Shutdown, PID-Ownership und Temp-Cleanup. Bestanden: 1 Test. Historische PID `40236`; Shutdown schloss sie mit Exitcode 1 (Windows-Termination), Ownership 0 und Tempverzeichnis entfernt.
- **Hörnachweis:** Tonprobe 1 um 00:24:53, Softwarevolume 15, war nach Nutzerfeedback zu leise. Probe 2 am 07.10.2026 um 00:26:16 Europe/Vienna nutzte denselben ca. 2-Sekunden-440-Hz-Sinuston bei MPV-Softwarevolume 60 am Standardgerät. MPV meldete Volume 60, trackete die Position und erreichte Idle; PID `11628`, Temp-WAV und Verzeichnis bereinigt. CEO-Handoff-Zitat: „Ja, klar gehört“. Systemlautstärke und Profile blieben unverändert. Das belegt hörbare MPV-Ausgabe mit synthetischem Ton, nicht Musikprovider-Wiedergabe.
- **Zusätzliche Nutzerbestätigung / korrigierte Pfadzuordnung:** Der Nutzer bestätigt, den zuletzt abgespielten ca. 2,3-Sekunden-Testton bei MPV-Softwarevolume 60 klar gehört zu haben, und ordnet ihn gemäß aktuellem Orchestrierungshandoff dem separaten Music-Bot-Queue-Handler-Test zu. Damit ist synthetischer Queue→MPV-Hörpfad nutzerbestätigt; kein Provider-/Live-Track. Der in `CEO_HANDOFF.md` zuletzt gespeicherte Stand widerspricht noch und bezeichnet die Probe als direkten MPV-Ton ohne Queue-Handler; die Handoff-Angabe muss vom Orchestrierungschat synchronisiert werden. Kein weiterer Ton wurde abgespielt.
- **Lautstärke und Engine-Replacement:** echter Null-Audio-MPV meldete Volume 20; `PlaybackController.setVolume(37)` wurde via MPV-IPC mit Volume 37 zurückgelesen. Danach erzeugte der Controller planmäßig für den Ersatztrack eine zweite Engine. Im korrigierten Lauf meldeten beide eigenen MPV-Kinder nach Cleanup Exitcode 1, Ownership 0 und Tempverzeichnis entfernt. Der neue Engine-Socket antwortete auf `time-pos`; aktiver Slot zeigte `playing`, verbundene IPC und Titel `Second local silence`. Volumevererbung 37 auf den Ersatz-MPV wurde ebenfalls ausgelesen und bestätigt. Der korrigierte Test bestand: 1 Suite / 1 Test; `--detectOpenHandles` meldete keine offenen Handles.
- **QueueManager → Controller → MPV:** In-Memory-SQLite mit zwei eigenen Silent-WAVs und `QueueManager.shiftNext()` spielte die Songs in eingetragener Reihenfolge via echtem `PlaybackController` und MPV mit Null-Audio. Geprüft wurden beide Track-IDs/Titel, Queue-Reihenfolge und -Leere, aktive Wiedergabe, MPV-IPC/Position, Volume 37 sowie Slot-Retirement. Eigene MPV-PIDs `24188` und `25516` endeten beim Lifecycle-Cleanup mit Exitcode 1, Ownership 0; SQLite-Verbindung geschlossen und Tempverzeichnis entfernt. Bestanden: 1 Suite / 1 Test, `--detectOpenHandles`, kein Handle-Warnhinweis. Dies prüft den lokalen QueueManager→Controller-Pfad, nicht den Plugin-Handler `_playNextFromQueueInternal` samt Resolver.
- **Vollständiger Plugin-Queuehandler → Queue → Controller → MPV:** Ein separater, CEO-freigegebener Null-Audio-Lauf rief den echten `MusicBotPlugin._playNextFromQueueInternal()` für zwei synthetische lokale Queueeinträge auf. Der Handler entfernte und spielte beide Songs in Reihenfolge; beide gingen durch MPV-IPC bis `time-pos`, der zweite Track blieb aktiv. Null-Audio, zwei eigene MPV-Kinder `37964`/`27032` (beide Exitcode 1 beim Shutdown, Ownership 0), In-Memory-SQLite und Temp-WAVs. Queue/DB/Temp-Cleanup nachgewiesen. Bestanden: 1 Suite / 1 Test mit `--detectOpenHandles`, kein Handle-Warnhinweis. Kein Resolver oder externer Provider in diesem lokalen Handlerlauf.
- **Lokale Katalogsuche:** `MusicCatalog.searchSongs` nutzt echte In-Memory-SQLite-Suche. Zusätzlich wurde der registrierte Plugin-Route-Handler `GET /api/plugins/music-bot/catalog/search` mit einem isolierten Katalog, synthetischem Fixture-Titel/-Künstler und bekanntem Genre (`Electronic`) aufgerufen; Titel-, Künstler- und Genretreffer kamen über den realen Katalogdienst zurück. Bestanden: 1 Suite / 1 Test mit Node 22. Zwei UI-Regressionsfälle für ausstehende/überschriebene Suchantworten bestanden: 1 Suite / 2 Tests; deren Fetchantworten sind synthetisch. Diese Belege umfassen lokale Suche/UI, nicht die externe YouTube-/SoundCloud-Suche des `MusicResolver`.
- **Externe Read-only-Suche:** Ein CEO-freigegebener `MusicResolver.resolve()`-Lauf für die öffentliche, nicht kontoidentifizierende Query `Daft Punk Harder Better Faster Stronger` lief mit Workspace-Node v22.14.0 und dem konfigurierten `youtube-dl-exec`-yt-dlp. Ergebnis wurde nur als `match`/Provider, ohne Titel/URL/Kanal-ID ausgegeben. YouTube lieferte einen passenden Treffer in 7.797 ms; SoundCloud-Fallback wurde deshalb nicht aufgerufen. Kein Download oder MPV-Playback. Guard unterband zusätzliche Prozessversuche je Provider. Eigener yt-dlp-PID `40476` schloss mit Exitcode 0; Runner active/queued 0. `MusicResolver` konfigurierte 12.000-ms Gesamtdeadline, bis fünf Ergebnisse pro Provider; ein interner transient retry wurde durch den One-shot-Runner blockiert, kein zweiter Kindprozess. Ergebnis belegt echte YouTube-Textsuche/Resolver-Matching, nicht Playback dieser Provider-URL.
- **Normales MPV-IPC-Quit:** separater Null-Audio-Prozess bestätigte JSON-Antwort `error: "success"` und Child-Exitcode 0 (`signal=null`); PID `33928`, Ownership 0, Tempverzeichnis entfernt. Gezielter Test bestanden: 1 Suite / 1 Test. Der Test hatte zunächst eine falsche Assertion und wurde mit korrekter Antwortmarke bestanden. Die damalige Jest-Verzögerung kam von einem nach erfolgreichem `Promise.race` nicht abgeräumten Timeout; der Fixture-Timer ist nun in `finally` gecleart, aber dieser Quit-Test wurde nach dieser Timerkorrektur nicht wiederholt. `PlaybackEngine.shutdown()` sendet aktuell kein IPC-`quit`; es verwendet `_terminateProcess()` und Child-Shutdown wurde mit Exitcode 1 beobachtet. Das Verhalten ist getrennt von der unterstützten normalen MPV-`quit`-Fähigkeit dokumentiert; kein Produktfix vorgenommen.
- **Regressionen:** Mit Workspace-Bundle `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe` (Node v22.14.0, ABI 127; passend zum `better-sqlite3`-Binding) bestanden QueueManager, MusicCatalog und PlaybackController: 3 Suites / 95 Tests. Dieselbe Runtime bestätigte den Syntaxcheck der MPV-Fixtures. `git diff --check` bestand. System-/Codex-Node 24 (ABI 137) war vorher versehentlich benutzt worden; dessen 32 SQLite-Ladefehler sind verworfen und kein Produktbefund. Es wurden keine Abhängigkeiten installiert oder rebuilt.

### Teilweise geprüft / nicht geprüft

- Keine Provider-Musik-/Stream-URL per MPV geladen oder abgespielt; der Provider-Resolver wurde nur read-only gesucht. Die One-shot-Suche lieferte YouTube, daher wurde der SoundCloud-Fallback nicht ausgeführt. Keine externe Query wiederholt.
- Vollständiger Plugin-Queuehandler wurde mit realem lokalen Queue/MPV getestet; Safetylock normal offen im neu konstruierten Fixture, kein Unlockpfad. Banliste blieb im isolierten Fixture leer; Resolver-/Providerresult wird vor Queueeintrag noch nicht über Pluginrequestpfad eingespielt.
- Der frühere rote Replacement-Fixturelauf fragte nach `controller.play()` die absichtlich retired alte Engine ab. Quellprüfung ergab, dass `_playOnActiveSlot()` alte Engine beendet und einen neuen Slot/Prozess erstellt. Der Fehler lag in der Testmessstelle, kein Produkt-IPC-Defekt ist daraus belegt. Die Assertion wurde auf Controller-Slot-ID/Tracktitel korrigiert und der Folgelauf bestand.
- MPV shutdown über Controller/Destroy wurde praktisch mit Child-Exitcode 1 beobachtet und gibt PID-/Ressourcen frei; reguläres MPV-IPC-`quit` mit Exitcode 0 ist separat bestätigt. Der Produkt-Shutdownpfad sendet das normale Quit nicht. Keine Änderung am Produktverhalten erfolgt, da kein unbeabsichtigter Restprozess reproduziert wurde.

### Verbleibende Risiken

- Die unabhängige Abnahme von Punkt 1 liegt vor; der Orchestrierungschat verlangte keinen zusätzlichen Provider-Stream.
- Kein tatsächlich geladener Provider-Song. Der vollständige Handler wurde isoliert mit localPath-Fixtures ausgeführt, der Provider-Resolver separat mit einer öffentlichen Query; der Kombinationstest fehlt.
- MPV normaler IPC-Quit-Test mit repariertem Jest-Timer ist noch nicht erneut gelaufen. Der bereits bestandene IPC-Quit-Exitcode-0-Nachweis bleibt technisch gültig; nur Jest-Harness-Handle-Cleanup ist unbestätigt.
- Es gibt keinen Safetylock-Bypass: Fixture-Controller nutzt einen neu konstruierten Zustand; kein `/safety-lock`-Unlock, `emergencyStop` oder `resetPlayer({remainLocked:false})` wurde ausgelöst. Bestehende fremde Änderungen (einschließlich Music-Bot Parser/Prozessregistry) blieben unangetastet. Keine Music-Bot-Produktdatei geändert.

## 2. OBS-Quellen — aktive Vorbereitung, noch keine OBS-Ausführung

### Current-source revalidation (2026-10-08)

- Gegen den aktuellen Checkout statisch neu abgeglichen: 104 historische IDs = 68 aktuelle öffentliche Guide-Fälle + 32 lokale Closed-Beta-Fälle + 4 Chatango-Retirement-Kontrollen. Die aktive Renderer-Matrix umfasst 100 Fälle; Chatango bleibt im Denominator, hat aber keinen Renderer und kann keinen OBS-Pass erhalten.
- Alle 100 aktiven Fälle haben aktuell vorhandene HTML-Renderer und Locale-JSONs. Der statische Referenzparser löst alle aus den HTML-Entrypoints gelesenen lokalen Asset-Dateien auf; dynamische Socket-/API-Endpunkte werden getrennt als Runtimeabhängigkeiten geführt.
- Der Recheck fand eine veraltete Handlerzuordnung in den vier Music-Bot-Localezeilen: Checklist behauptet Handler `/plugins/music-bot/overlay.html` in `main.js`, während der aktuelle Produktcode die GET-Route `/plugins/music-bot/overlay` registriert. Das Rendererfile selbst existiert und die angegebene Kandidaten-URL ist in der statischen Overlayregistry; der Pfadunterschied ist in der Revalidation sichtbar gehalten und im Audit/Test explizit erfasst.
- Vorhandene Fixturetestdateien sind für 16 Localefälle explizit angegeben und vorhanden; für 88 Localezeilen ist kein fallbezogener Fixturetest deklariert. Das besagt nur Dateiexistenz/Benennung, nicht aktuelle Abdeckung oder Lauf. Der Recheck fand 0 OBS-Pässe und markiert alle 104 IDs `NOT_TESTED`.
- **Geänderte Dateien:** `scripts/obs-pilot/reverify-obs-104-source.js`, `scripts/obs-pilot/test/obs-104-source-reverification.test.js`, `docs/coordination/obs-104-current-source-audit-20261008.json`, `docs/coordination/obs-104-guest-runbook-20261008.md` und dieser Bericht.
- **Prüfauftrag:** gebündeltes Node-22 Fixturetest für die 104 IDs, aktuelle Renderer-/Locale-Existenz, statische Assetreferenzen, Fixture-Dateiverfügbarkeit, Chatango-Retirement und Music-Bot-Handlerdrift. Kein OBS-/VM-/Serverstart; praktische OBS-Abnahme bleibt **0/104**. Runbook ist keine Startfreigabe.

- `docs/plugin-docs-qa/report.json` nennt erwartete 104 Datensätze, weist aber `records: 0` und `reportPath: null` aus; es enthält daher keine konkrete 104er Prüfliste.
- `docs/coordination/obs-104-source-inventory.json` ist eine abgeleitete Planliste: aktueller Generator liefert 26 Plugin-Overlay-Guides × vier Locales (de/en/es/fr) = 104 loopback-URLs. Der Orchestrierungschat hat bestätigt, dass dies die kanonischen 104 Prüffälle sind (keine 104 verschiedenen Plugins); IDs, Dimensionen und localhost-Ziele sind explizit.
- Installierte OBS-Version: 32.1.0. Installationsordner enthält Browser-Source (`obs-browser.dll`) und WebSocket (`obs-websocket.dll`). Zum Checkzeitpunkt lief kein OBS-Prozess. Es wurde keine OBS-Instanz gestartet und keine vorhandene Szene/Profile gelesen oder verändert.
- **Plananpassung nach CEO-Vorprüfung:** der portable 26-Plugin-LTTH-Startplan ist verworfen. LTTHs globale Docs-Capture-Policy beweist nicht, dass alle Backends inert sind; `%TEMP%` isoliert Datenpfade, nicht automatisch Netzwerk/Connectoren. CEO hat Starts und Batch noch nicht freigegeben und verlangt vorerst Quell-/Guardprüfungen plus genau einen Sidekick- oder Stream-Monsters-Pilot nach Freigabe; 104er Batch erst nach dessen Cleanup.
- **Sidekick-Quellbefund für einen möglichen Pilot:** `main.js` im Docs-Capture-Modus härtet eingelesene Konfiguration, registriert keine TikTok-/Socket-/GCCE-Handler und startet keine pluginseitigen Cleanup-/Announcer-Timer; Avatar-Autoconnect kehrt früh zurück. Docs-Capture-Guards blockieren VNyan/Animaze-Verbindung, Reconnect und Senden; EventBus/RateLimit/Metrics und Deduper starten keine Hintergrundtimer. SQLite-Schemaoperationen würden nur die von Docs-Capture validierte Temp-Profil-DB betreffen. Die existierenden Unit-Fixtures prüfen diese Verträge. Allerdings registriert `_registerDocsCaptureRoutes()` nicht die vom echten HUD genutzten `GET /api/sidekick/public-status` und `.../public-events`, auch kein Public-Status-Socket. Das HUD ist ein einzelnes HTML-Asset mit inline CSS/JS, einem same-origin `/socket.io/socket.io.js`, same-origin Fetches zu diesen zwei Pfaden und ohne statische externe HTTP(S)-Abhängigkeiten. Fixtureverträge: Status JSON enthält exakt `connected`, `muted`, `chatsPerMinute`, `totalGifts`, `totalFollows`, `activeViewers`; Events enthalten nur künstliche Chat-/Gift-Einträge mit `ts`, `nickname` und begrenztem `payload`. Ein Socketstub beantwortet nur `sidekick:public-status:request` mit synthetischer Statusprojektion und bleibt explizit ein Rendererfixture, kein Socket.IO-Integrationsnachweis. Der Parallelworker hat den HUD-Fehlerpfad geändert: fehlgeschlagener Status-GET zeigt jetzt disconnected plus `aria-live`-Meldung; Event-Feed-Fehler wird getrennt angezeigt; erfolgreiche Recovery löscht die jeweilige Meldung. Gezielter gebündelter-Node-22-Test `plugins/sidekick/test/hud-availability.test.js`: 1 Suite / 2 Tests bestanden. Aktuelle HUD-SHA256: `BC3D024F67CC28A8D0D9DBE31CB32530B6014BFD835772B194E29D367CEC42CC` (vor Pilot erneut berechnen und exakt dieses Asset/den Hash stagen). Noch nicht in Browser oder OBS praktisch geprüft.
- **Pilot-/104-Laufzeitplan (Gast-only):** OBS-WebSocket bindet im Guest weiterhin Wildcard; Loopbackbindung wird nicht behauptet. Isolation kommt ausschließlich vom nachgewiesenen VirtualBox-Guest ohne NIC/Shared Folders; OBS-Control-Client und Fixturehost sprechen innerhalb des Guest-Namespaces zu `127.0.0.1`. Ein Pilot mit dem unveränderten Sidekick-HUD und synthetischen API-/Socket-Fixtures belegt ausschließlich OBS Browser-Renderer, Quelleinstellungen, Sichtbarkeit, leere Szenenbaseline, Item-/Source-Entfernung und Guest-PID-/Port-Cleanup, keine Live-Sidekick-Integration. Kein LTTH-Backendstart. Für den Pilot wird der aktuelle HUD-Stand SHA256 `BC3D024F67CC28A8D0D9DBE31CB32530B6014BFD835772B194E29D367CEC42CC` nur nach erneuter Hashprüfung in den Plan aufgenommen. Ein späterer 104er Batch bleibt bis Pilot-Cleanup/CEO-Review gesperrt; jedes Ergebnis ist den 26×4 expliziten Prüffällen zuzuordnen. Screenshot-/Hashbelege gehen in einen neuen Evidenzordner, nie in die fest codierten Bestandsziele `screenshots/docs/obs` oder `screenshots/docs-obs-capture-report.json`.
- **Host-Isolationbefund / gewählte Alternative:** `netsh advfirewall show allprofiles` meldet Firewall AUS für Domain/Private/Public; „Eingehend blockieren“ ist damit nicht aktiv. `Get-NetFirewallProfile -PolicyStore ActiveStore` lieferte Zugriff verweigert; Regelinventar gilt als nicht verifiziert, nicht als leer. Es wird keine Firewalländerung vorgenommen. `WindowsSandbox.exe` ist nicht verfügbar; DISM konnte den optionalen Featurestatus nur mit erhöhten Rechten lesen (Error 740), `wsl.exe` allein belegt keine Isolation. OBS-WebSocket bietet laut installiertem Sprachinventar kein Bind-Interface; upstream `WebSocketServer::Start` lauscht Wildcard auf allen Interfaces bzw. IPv4-Wildcard. `--websocket_ipv4_only` wählt nur die Adressfamilie. Quellen: https://github.com/obsproject/obs-websocket/blob/master/src/websocketserver/WebSocketServer.cpp und https://github.com/obsproject/obs-websocket/blob/master/README.md?plain=1.
- **Gast-Pilotcheckliste:** nur in der neuen VirtualBox-VM unter `C:\Virtualbox\VMs\ltth-obs-pilot-20261007`, nach erneuter read-only Prüfung des Guest-/Bootpfads. Guest-Netz und Hostintegration müssen vor dem Start über `showvminfo --machinereadable` nachgewiesen werden: keine enabled NICs, Shared Folders, Clipboard/Drag-drop, USB oder VRDE. OBS-WebSocket-Wildcard bleibt im isolierten Guest; OBS-Client und Fixturehost sprechen nur `127.0.0.1`. OBS-Kopie/Profil/Collection/`tutorial`-Szene im Guest, `--disable-updater`, gebündelte Plugins; keine existierenden Host-/Guest-Profile lesen. Ausschließlich unverändertes Sidekick-HUD-Asset auf schreibgeschütztem, eigens zusammengestelltem Stagingmedium; synthetischer Loopback-HTTP-Host liefert nur `public-status`/`public-events`, Socketstub nur den synthetischen Initialstatus. Kein Sidekick-Backend oder LTTH-Server. Keine TikTok-, Euler-, GCCE-, Vnyan-, Animaze-, externe API- oder echten Viewer-Verbindungen. Authpasswort zufällig/kurzlebig und nie protokolliert. Vor/nach jeder OBS-Mutation Stream-/Recordstatus inaktiv prüfen; genau eine Browserquelle auf leerer Szene anlegen, URL/Größe prüfen, Screenshot-Pixel prüfen, Quelle/Szeneelement entfernen und leere Baseline vergleichen. Danach OBS/Fixturehost stoppen, Guest-PIDs/Ports aufgeräumt belegen und nur nichtgeheime Hash-/Testbelege exportieren.
- **Aktueller VM-Zustand (CEO-`showvminfo`, read-only):** die neue VM/VDI ist angelegt; effektiver Zustand `poweroff`, 4,096 MiB, 2 CPUs, EFI, NIC 1–8 `none/disabled`, Shared Folders/USB/Clipboard/Drag-and-drop/Dateiübertragung/VRDE/Autostart aus; DVD auf ein von `unattended detect` als Windows 11 Enterprise Evaluation erkanntes Medium, eigene leere VDI. Kein Gaststart und keine Windows-Installation. Die ISO-Quelle wurde nicht per SHA-256 gegen Herstellerbeleg geprüft. Secure Boot ist nicht verifiziert; Unattended-Answer-/Auxiliary-Medium-Schutz wird vor Installationsausführung geprüft. Host-RAM-Verfügbarkeit ist nicht messbar gewesen; `vm-plan.md` setzt dafür ≥8 GiB als Gate. Eine fremde VirtualBox-VM läuft; deren Zustand wird nicht weiter enumeriert/geändert. Ich habe die eigene VM weder gestartet noch geändert.
- **Statische und In-process-Pilotfixture-Tests:** mit gebündeltem Node v22.14.0 bestanden: `test/docs-capture-plugin-fixture.test.js`, `plugins/sidekick/test/docs-capture-egress.test.js`, `plugins/sidekick/test/hud-availability.test.js` sowie `plugins/sidekick/test/pilot-public-overlay-harness.test.js`; insgesamt 4 Suites / 15 Tests. Die Pilotfixture führt unverändertes HUD, echte Pluginrouten/-projektion und Socket.IO-Protokollpacket im Prozess aus; es wird kein HTTP-Listener/Port geöffnet. Sie prüft anonyme Felder, synthetische Statusänderungen, 503/Recovery, begrenzte Eventprojektion und verweigerte Routen/Ereignisse. Kein OBS-Renderer-, Netzwerk- oder Screenshotnachweis. Die drei vorausgehenden gezielten Läufe nutzten `--detectOpenHandles`; Pilotfixture separat ohne diesen Schalter bestanden.
- Zusätzliche Generatorprüfung am 2026-10-07: `test/obs-docs-capture-contract.test.js` und `test/obs-docs-capture-batch.test.js` bestanden mit gebündeltem Node v22.14.0 (2 Suites / 4 Tests). Diese prüfen den aus den aktuellen Guide-Quellen generierten Umfang und Batchvertrag (26 × 4 = 104); sie führen OBS nicht aus und ersetzen keine der 104 Rendererabnahmen.
- Offline-Transfermanifest `docs/coordination/obs-sidekick-pilot-transfer-manifest.json` erstellt und nach Entrypoint-/Harness-Änderungen aktualisiert (plan-only; keine ISO/Übertragung/Gastaktion): 546 gehashte Dateien, 24 Runtimepakete, 87,757,583 Bytes inkl. gebündeltem Node 22.14.0 (ABI 127). Alle Pfade/Größen/SHA-256-Werte und Paketversionen wurden aktuell gegen den Checkout verifiziert; transitive Runtime-Dependencies (außer TypeScript-`@types`) vollständig.
- `scripts/obs-pilot/create-isolation-receipt.js`, `fixture-host.js`, `run-pilot.js` und `safety-contract.js` wurden als source-only Pilotwerkzeuge erstellt. Der Receipt-Producer führt ausschließlich read-only `showvminfo` für die fest codierte eigene VM-UUID aus; `poweroff` (Setupvorbereitung) oder `running` (Pilot) sind als Host-Abfrage zulässig. Nur `running`-Receipts können den Gastfixture-Listener freigeben; ein powered-off Vorstartbeleg wird fail-closed zurückgewiesen. Der Producer schreibt ein gehashte, strukturierte Host-Reviewdatei mit UUID/Zustand/NIC-/Integrationswerten und Rohantwort-SHA, ohne die private Rohantwort oder Pfade zu kopieren. Diese Reviewdatei bleibt host-only. Der Gast verlangt die separat CEO-geprüfte Receipt-Datei-SHA als zweite Eingabe, gleicht sie exakt ab und verwirft Receipt älter als 30 Minuten oder mehr als 2 Minuten in der Zukunft. Das ist ein nachvollziehbarer Hash-Handoff, keine digitale Signatur. OBS-Version und genau eine aktive, leere `tutorial`-Szene werden separat im Gast geprüft. Capturestatus bleibt bis Bildprüfung `capture-complete-review-pending`. Zwölf Node-22-Vertragstests bestehen in-process (keine Listener, OBS oder VM gestartet); geprüft wurden Synthetic-HTTP/Socket contracts, denied methods/routes, Loopback-only WS-Ziel, isolation-receipt gate, geschützter Evidenzpfad, exklusive Schreibe und Secret-Redaction. `git diff --check` bestanden. Praktische OBS-Abdeckung steht weiterhin bei 0/104: kein Laden, Sichtbarkeit, Aktualisierung, Fehler- oder Lifecycle-Test ausgeführt.

### Folgeauftrag CEO: 104-Fall-Abnahmematrix

- **Befund/Umsetzung:** Die Generatorquelle `scripts/lib/obs-docs-capture-inventory.js` liefert 26 konkrete Plugin-Overlay-Ziele × vier Locales. Für diese 104 Fälle wurden die kanonische URL, Locale, Auflösung, Scene/Source, der aktuelle Asset-Einstieg und ein plugin-spezifisches Sourceprofil mit Anfangsbild, Event/Payload, erwarteter Änderung, Fehlerpfad, Cleanup, GPU/Audio/externe Abhängigkeiten, Seed-Risiko und Evidenzbedarf zusammengeführt. Profile mit fehlendem Query-Seed, falschem Entry-Asset, unbestätigter Payload oder riskantem Backend bleiben explizit gesperrt; Payload-Beispiele sind als Kandidat oder unbekannt markiert, nicht als verifizierte Runtime-Schemas.
- **Konkrete offene Befunde:** Advanced Timer und Goals benötigen IDs, die in den kanonischen URLs fehlen. Chatango zielt im Inventar auf `ui.html` (Settings/UI) und lädt zusätzlich ein externes Chatango-Script. ClarityHUD braucht isolierte Settings/State-Antworten und einen offline Fontpfad. CoinBattle, Game Engine, Stream Monsters, Overlay-Controller mit GPU/Audio und weitere Profile benötigen noch payload-/seedbezogene Quellenverifikation; Matrix führt sie einzeln auf. Unbekannte Inputs bleiben Blocker und senken nicht den 104-Fall-Umfang.
- **Pilotfolge:** STT Ticker (vier synthetische Text-/Clear-Fälle), Spotlight (isolierte Last-Event-Projektion), Goals erst nach erlaubter fixture-only ID-Erweiterung, dann Music Bot nur mit Fake-Socket-Trackdaten. Die Pilotfolge reduziert den 104-Fall-Abnahmedenominator nicht.
- **Geänderte Dateien:** `scripts/obs-pilot/build-obs-104-matrix.js`, `scripts/obs-pilot/test/obs-104-matrix.test.js`, `docs/coordination/obs-104-acceptance-matrix.json`, `docs/coordination/obs-pruefplan.md` und dieser Bericht. Keine Plugin-/Adapter-/Overlay-Registrierungsdatei geändert.
- **Tests:** gebündelter Node v22.14.0; `obs-104-matrix.test.js`: 5 Tests bestanden. Abgleich gegen den aktuellen Codegenerator und gespeichertes kanonisches Inventory: exakt 104 eindeutige `plugin:locale`-Keys, 26 getrennte Sourceprofile, loopback-only URLs, keine Credentials und exakte Auflösungen. `node --check` für Generator/Test bestanden.
- **Status:** Matrix-/Planprüfung bestanden, aber **keine** Browser-Renderer-, Plugin-Integrations- oder Bildabnahme ausgeführt. Matrixstatus: 4 Fälle bereit für isolierte Fixtureprüfung (STT Ticker) und 100 Fälle durch konkrete Source-/Seed-/Routefragen blockiert; OBS bleibt **0/104**. Keine Listener, VM, OBS, Provider, Konten, Audioaktionen, echten Zuschauer oder Daten gestartet/verändert.

## 3–6. Warten auf Vorgänger

Öffentliche Overlays/Tunnel, Eulerstream SuperFan, Dashboard und DE/EN/ES/FR plus Layouts beginnen erst nach praktischer Evidenz und unabhängiger CEO-Abnahme des jeweils vorherigen Punktes.

## Status

- **Punkt 1:** unabhängig vom Orchestrierungschat abgenommen. Evidenz und Grenzen oben: Resolverresult wurde nicht gestreamt; der lokale Handler→Queue→MPV-Pfad ist separat belegt.
- **Punkt 2:** Quell-/Fixturevorbereitung und 12/12 isolierte Vertragstests unabhängig abgenommen; kanonischer Umfang 26 Guides × 4 Locales bestätigt. OBS praktisch 0/104. Letzter CEO-Nachweis zur eigens angelegten VM: `poweroff`, NIC 1–8 aus, eigene VDI und Evaluations-ISO; kein Gaststart. Dieser Nachweis ist zeitpunktbezogen und wird nicht als aktueller VM-Zustand ausgegeben. Der Orchestrierungschat hat die Quellen freigegeben, aber keinen OBS- oder Gaststart autorisiert; laut abgestimmtem Ablauf steht der spätere Gaststart durch den Nutzer noch aus. Keine weitere Zustandsabfrage/VM-Aktion bis dahin.
- **Punkt 3:** offen, wartet auf Punkt 2.
- **Punkt 4:** offen, wartet auf Punkt 3; ausstehende SuperFan-Fallbackschlüsselbestätigung bleibt Voraussetzung.
- **Punkt 5:** offen, wartet auf Punkt 4.
- **Punkt 6:** offen, wartet auf Punkt 5.

## CEO-Auftrag: Stage-Contract, Matrixbefunde und Transfermanifest (2026-10-07)

### Befund

- Der neue, vom Overlay-Modulowner bereitgestellte `scripts/obs-pilot/stage-contract.js` definiert fünf geordnete Sidekick-HUD-Zustände samt exakten Socket-/HTTP-/Cleanupdeltas. Runner und Fixture verwendeten ihn zunächst nicht; die Status-Eventliste zeigte zudem nur Broadcast-Aufrufe und konnte zugestellte Socket-Payloads nicht belegen.
- Chatango-Guide (`mode: ui`, `/plugins/chatango/ui.html`) führt zur Einstellungs-/Dashboardseite mit Widgetvorschau. Es gibt im Pluginordner kein separates Overlay-Asset; die Seite bindet `st.chatango.com` ein. Ein tatsächlicher lokaler Overlay-Zielpfad ist nicht belegt.
- Advanced-Timer- und Goals-Guides enthalten jeweils einen belegten Query-Vertrag (`timer: non-empty`, `id: non-empty`). Die bisherige Matrix hatte diese als offene ID-Lücke behandelt. Goals-Produkt-WebSocket liest Query-IDs aus persistenter DB; ein synthetischer Lauf darf deshalb den Produkt-Handler nicht aufrufen.
- Transfermanifest führte zwei widersprüchliche Dateizahlen (`totals.files=546`, `filesTotal=545`) und keinen expliziten `package-lock.json`-Provenienzverweis.

### Umsetzung

- Stage-Vertrag im Runner integriert: pro Zustand werden Baseline, Aktivitätsprobe, Cleanupzähler und die tatsächlich an den synthetischen Socket zugestellten Status-Payloads geprüft. Captures sind ohne fünf verifizierte Stage-Receipts nicht abschließbar. Fremdes `stage-contract.js` blieb unverändert.
- Fixture protokolliert Socket-Status nur bei Zustellung an den verbundenen Client. Regressionen decken echte Zustellung und negative Stage-Verträge ab.
- Advanced Timer und Goals nutzen in der Matrix je Locale `fixture-timer-{locale}` bzw. `fixture-goal-{locale}`; IDs im Trigger und in der URL stimmen überein. Es werden keine Goals-/Timer-Backends oder Datensätze gestartet/erzeugt.
- Chatango wurde nicht aus dem Gate entfernt. Ein eng begrenzter Zielkorrekturplan dokumentiert den UI/Overlay-Mismatch und die noch nötige Ownerentscheidung; keine Guide-API, Produkt-API oder öffentliche Registry wurde verändert.
- Matrix bleibt bei 104 Fällen: 12 sind `ready-for-isolated-fixture-review`, 92 bleiben vor praktischer Rendererabnahme blockiert. Das sind keine OBS-Pässe.
- Manifest enthält Stage-Modul und Test; `filesTotal` entfernt, maßgebliche Zahl ist `files.length`/`totals.files=548`. Paketlock-Provenienz: `app/package-lock.json`, 534051 Bytes, SHA-256 `eff811ac8e412af80cb71927575ee080df84d0073a5106f67057b31ab314698d`. Gesamtgröße 87,786,368 Bytes, 24 Runtimepakete; alle 548 Dateihashes stimmen.

### Geänderte Dateien

- `scripts/obs-pilot/run-pilot.js`
- `scripts/obs-pilot/fixture-host.js`
- `scripts/obs-pilot/test/contract.test.js`
- `scripts/obs-pilot/test/obs-104-matrix.test.js`
- `scripts/obs-pilot/build-obs-104-matrix.js`
- `scripts/obs-pilot/stage-contract.js` und `scripts/obs-pilot/test/stage-contract.test.js` waren bereits von der Modulowner-Arbeit vorhanden; Manifestreferenz ergänzt, Modul selbst nicht verändert.
- `docs/coordination/obs-104-acceptance-matrix.json`
- `docs/coordination/obs-pruefplan.md`
- `docs/coordination/obs-guide-target-fix-plan.md` (neu)
- `docs/coordination/obs-sidekick-pilot-transfer-manifest.json`
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests und Prüfungen

- Bestanden mit gebündeltem Node v22.14.0: `scripts/obs-pilot/test/stage-contract.test.js`, `scripts/obs-pilot/test/contract.test.js`, `scripts/obs-pilot/test/obs-104-matrix.test.js` — 27 Tests.
- Matrixgenerator erzeugte 104 Fälle / 26 Profile; synthetische IDs und Locale stimmen. Chatango bleibt explizit als Zielentscheidung offen.
- Manifestprüfung: 548 Einträge, 0 Hash-/Größenabweichungen, kein redundantes `filesTotal`; package-lock SHA referenziert.
- `git diff --check` meldete vorhandenes, nicht zu diesem Auftrag gehörendes Trailing Whitespace in `docs/plugin-docs-qa/index.html:29`; die Datei wurde nicht angefasst. Keine OBS-/VM-/App-/Serverstarts.

### Verbleibende Risiken / offen

- Chatango braucht eine Zielentscheidung des Plugin-/Guideowners. Bis dahin bleiben alle vier Fälle im 104er Nenner und blockiert.
- Zwölf Fälle haben nur Fixture-Reviewstatus. Keine praktische Browser-Renderer-, Screenshot-, Bildsichtungs- oder OBS-Abnahme wurde ausgeführt. Alle 104 OBS-Pässe bleiben offen.
- Stage-Contract-Integration ist source-/fixture-getestet; ein realer OBS-Browserlauf ist weiterhin durch das separate Gaststart-Gate gesperrt.
- `git diff --check` ist wegen des dokumentierten Fremdwhitespace nicht vollständig grün.

## CEO-Folgeauftrag: Advanced-Timer-/Goals-Renderer-Fixtures (2026-10-07)

### Befund

- Advanced-Timer-Guide fordert `timer` in der Query; Originalrenderer ruft drei reine GET-Routen ab und filtert `advanced-timer:tick` nach exakter ID. HTTP 404/503 mit `{success:false}` wird unabhängig vom Statuscode als „Timer not found“ gerendert. Ein automatischer Retry existiert nicht; Recovery ist erst mit sauberem Reload und erfolgreicher Antwort möglich.
- Goals-Guide fordert `id`; Originalrenderer sendet `goals:subscribe` mit diesem Wert. `GoalsWebSocket` greift auf DB zu, wurde nicht instanziiert. `goals:error` hat im Overlay keinen Handler, eine spätere gültige `goals:subscribed`-Antwort kann dennoch initialisieren. Value-change-Payload stammt aus `broadcastGoalValueChanged()` als `{goalId,goal,state}`; der Snapshot ist `GoalStateMachine.getSnapshot()`.
- Beide Renderer besitzen keinen expliziten `pagehide`-/Unsubscribe-Hook. Daher testet das Fixture den eigenen Socket-/JSDOM-Teardown und behauptet keine Produkt-Cleanupintegration.

### Umsetzung

- Neues `app/test/helpers/obs-overlay-jsdom-fixture.js`: JSDOM-Request-Interceptor mit exakter Allowlist für unverändertes i18n- und Overlay-JavaScript, synthetischen same-origin JSON-Antworten und Socketstub. Externe Skripte, unbekannte Routen und nicht erlaubte Socket-Aktionen werden fail-closed verweigert. Es wird kein Port gebunden.
- Neues `app/test/obs-timer-goals-renderer-fixtures.test.js`: 4 Locale-IDs für beide Renderer, Timer-Initialrender/korrekter und fremder Tick, 404- und 503-Fehler plus Reload-Recovery; Goals-Subscribe, not-found ohne erfundenen Zustand, spätere Initialisierung, passende/fremde Wertänderung, Animation-Ende über kontrollierte Fixture-Uhr und Teardown ohne nachträgliche Zustellung.
- Original-HTML und Renderer-Skripte bleiben unverändert. Keine Timer-/Goals-Backend-Instanz, Datenbankzeile, Produkt-API-Änderung oder Netzwerk-Listener.
- Matrix-/Planstatus für 8 Timer-/Goals-Zeilen ist `in-process-renderer-fixture-passed-not-obs`; 4 Fälle bleiben `ready-for-isolated-fixture-review`, 92 blockiert. Der Nenner bleibt 104; alle 4 Chatango-Fälle bleiben explizit blockiert.
- Neues Vertragsdokument `docs/coordination/obs-timer-goals-fixtures.md` erfasst die Quellen, echte Payloadformen, die beobachteten Fehlersemantiken und die Abnahmegrenzen.

### Geänderte Dateien

- `app/test/helpers/obs-overlay-jsdom-fixture.js` (neu)
- `app/test/obs-timer-goals-renderer-fixtures.test.js` (neu)
- `scripts/obs-pilot/build-obs-104-matrix.js`
- `scripts/obs-pilot/test/obs-104-matrix.test.js`
- `docs/coordination/obs-104-acceptance-matrix.json`
- `docs/coordination/obs-pruefplan.md`
- `docs/coordination/obs-timer-goals-fixtures.md` (neu)
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests und Prüfungen

- Jest (Workspace Node v22.14.0): `test/obs-timer-goals-renderer-fixtures.test.js` bestanden, 12 Tests.
- Node `node:test`: `scripts/obs-pilot/test/obs-104-matrix.test.js` bestanden, 6 Tests.
- Matrixgenerator erzeugte 104 Fälle / 26 Profile. Statusgruppen geprüft: 8 In-Process-Renderer-Fixtures bestanden (nicht OBS), 4 zur Fixtureprüfung bereit, 92 blockiert.
- Kein OBS-/Chromium-/Produktserver-/VM-Start und kein echter HTTP-Port. Keine Zuschauer-, Rollen- oder Guthabendaten.

### Verbleibende Risiken / nicht geprüft

- Die JSDOM-Fixtures belegen DOM-/Eventlogik und Fake-Transportverträge, nicht echte BrowserSource-/Chromium-/OBS-Darstellung, HTTP-Serverroute oder Socket.IO-Transport.
- Timer unterscheidet 404 und 503 nicht im Overlay und retryt nicht selbst; Reload-Recovery ist Fixture-Semantik, keine automatische Recovery-Funktion.
- Goals ignoriert `goals:error`; synthetische Folgeantwort kann den Renderer aktualisieren. Produktions-DB-Fehlerbehandlung/Socketraum und Produkt-Unsubscribe wurden nicht gestartet/geprüft. Harness-Cleanup ist kein Beleg für die Produktseite.
- Keine visuelle Bildprüfung und keine der 104 praktischen OBS-Abnahmen.

## CEO-Folgeauftrag: Timer-/Goals-Fehleranzeigen und Overlay-Cleanup (2026-10-07)

### Befund

- Advanced Timer API liefert 404 mit `success:false` für einen fehlenden Timer; der Renderer prüfte zuvor nur `data.success` und zeigte für 404, 503 und Netzwerkfehler denselben „Timer nicht gefunden“-Text. Es gab keinen automatischen Retry.
- Goals-WebSocket sendet `goals:error` bei fehlender Goal-ID oder Backendfehlern. Der Renderer hörte zuvor nicht auf dieses Event. Der bestehende Serverhandler `goals:unsubscribe` ruft nur `socket.leave('goal:<id>')` auf.

### Umsetzung

- Timer zeigt 404 als lokalisiertes „nicht gefunden“, andere HTTP-Fehler, unerwartete Fehlerantworten und Netzwerkfehler als lokalisiertes „vorübergehend nicht verfügbar“. Meldungen erscheinen als zugänglicher Alert. Der eigene Socket wird bei `pagehide` getrennt.
- Goals zeigt passende `goals:error`-Events sichtbar und lokalisiert, ignoriert fremde IDs und entfernt den Fehler bei einer gültigen Folgeantwort. Bei `pagehide` sendet es das bestehende `goals:unsubscribe` genau einmal und trennt den eigenen Socket.
- Vier Locale-Dateien pro Plugin ergänzt. Keine Produkt-API, Datenbank oder Socket-Eventsemantik hinzugefügt.
- Quellen und Grenzen stehen in `docs/coordination/obs-timer-goals-fixtures.md`.

### Geänderte Dateien

- `app/plugins/advanced-timer/overlay/overlay.js` und `app/plugins/advanced-timer/locales/{de,en,es,fr}.json`
- `app/plugins/goals/overlay/overlay.js` und `app/plugins/goals/locales/{de,en,es,fr}.json`
- `app/test/helpers/obs-overlay-jsdom-fixture.js`
- `app/test/obs-timer-goals-renderer-fixtures.test.js`
- `docs/coordination/obs-timer-goals-fixtures.md`
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests

- Bestanden: `cd app; ..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --runTestsByPath test/obs-timer-goals-renderer-fixtures.test.js` — 14 Tests. Deckt Timer 404/503/Netzwerkfehler, lokalisierte Anzeige, Reload-Recovery, Goals-Fehler/Erholung, `pagehide`-Cleanup und den echten Serverhandler für Leave-only-Unsubscribe ohne DB-Aufruf ab.
- Nur JSDOM und synthetische Antworten; kein Produktserver, OBS, BrowserSource oder Live-Socket.

### Verbleibende Risiken / nicht geprüft

- Kein automatischer Retry: Timer braucht Reload; Goals braucht eine gültige Folgeantwort. Reconnect-/Backoff-Verhalten ist nicht Teil des Auftrags.
- Die vier Locale-Dateien wurden vom Fixture geladen; umfassende Translation-Validierung wurde nicht erneut gestartet.
- Reale BrowserSource-/OBS-Darstellung und Produkttransport bleiben ungeprüft. Parallele Änderungen an denselben Locale-Dateien blieben erhalten.

## CEO-Folgeauftrag: Timer-/Goals-Lifecycle bei verspäteten Ereignissen (2026-10-07)

### Befund

- Lifecycle-Fixtures reproduzierten einen verspäteten erfolgreichen Timer-Fetch nach `pagehide`: der Overlay-Renderer schrieb danach noch Timer-DOM und installierte Socketlistener.
- Ein vor `pagehide` eingereihtes `goals:subscribed`-Callback wurde nach dem Disconnect noch ausgeführt und renderte einen neuen Stand. Ein vor der Zerstörung gestartetes Bounce-Timeout konnte außerdem sein DOM-Style zurücksetzen; Animation-Promise-Callbacks konnten `goals:animation-end` emittieren.
- Doppelte `pagehide`-Ereignisse müssen den vorhandenen Cleanup idempotent halten: genau ein eigener Socket-Disconnect sowie für Goals genau ein bereits servergestütztes `goals:unsubscribe`.

### Umsetzung

- Timer führt jetzt einen Lifecycle-Guard über den Fetch-/JSON-Fortsetzungspfad und alle Socket-Handler. Nach `pagehide` bricht jede verspätete Antwort ab, bevor sie DOM, Timerzustand, weitere GETs oder Listener verändert. Rotatorintervall wird beim Cleanup beendet.
- Goals umschließt alle Socket-Handler mit dem Cleanup-Guard. `render()`/Fehleranzeige werden nach Cleanup blockiert. Animationen erhalten eine Aktivitätsprüfung, sodass verspätete Style-/Konfetti-Cleanupwrites und `goals:animation-end` nach Cleanup ausbleiben.
- Der isolierte Harness kann eine bereits eingereihte Callbackkopie nach Disconnect zustellen, Timer-HTTP-Antworten gezielt verzögern sowie Disconnect-Aufrufe zählen. `closeDom()` unterbindet ein ausstehendes i18n-Update im Harness nach Fenster-Cleanup.
- Vertragsdokument aktualisiert. Keine neue API, kein neues Socket-Event und kein automatischer Retry/Reconnect implementiert.

### Geänderte Dateien

- `app/plugins/advanced-timer/overlay/overlay.js`
- `app/plugins/goals/overlay/overlay.js`
- `app/test/helpers/obs-overlay-jsdom-fixture.js`
- `app/test/obs-timer-goals-renderer-fixtures.test.js`
- `docs/coordination/obs-timer-goals-fixtures.md`
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests

- Neue lifecyclebezogene Auswahl, no-cache: `cd app; ..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath test/obs-timer-goals-renderer-fixtures.test.js --testNamePattern="deferred successful fetch|queued subscribed delivery"` — 2 Tests bestanden.
- Vollständige nächste Renderer-Fixturedatei, no-cache: `cd app; ..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath test/obs-timer-goals-renderer-fixtures.test.js` — 16/16 bestanden.
- Die Regressionstests prüfen tatsächliche Render-/Eventwirkung, MutationObserver-Aufzeichnungen, verzögerte Antwortauflösung, Double-`pagehide`, exakt einen Disconnect/Unsubscribe und keine Socketemission nach Destroy. Keine Tests verlassen sich nur auf Quelltextsuche.

### Verbleibende Risiken / nicht geprüft

- Tests verwenden JSDOM, einen synthetischen Transport und kontrollierte Timeouts. Reale Socket.IO-Warteschlangen, BrowserSource und OBS sind nicht geprüft.
- Timer-Recovery bleibt explizites Reload. Goals-Reconnect/Backoff bleibt außerhalb dieses Auftrags.
- Das Overlay-Routenprojekt läuft parallel, hat laut Koordination eigene STT-/Inventardateien; keine dieser Dateien wurde hier verändert.

## CEO-Folgeauftrag: EmojiRain OBS-HUD-Matrixprofil korrigieren (2026-10-07)

### Befund

- Das kanonische Inventory enthält bereits `/emoji-rain/obs-hud`; dessen echter `GET`-Handler in `app/plugins/emoji-rain/main.js` sendet `obs-hud.html`. Dieses HTML lädt `i18n-client.js`, Matter.js und `emoji-rain-obs-hud.js`; es lädt nicht `emoji-rain-engine.js`. Das Matrixprofil zeigte zuvor stattdessen `overlay.html` plus das falsche Script.
- Der tatsächliche Producer `triggerEmojiRain()` normalisiert und emittiert `emoji-rain:spawn` mit `{count,emoji,x,y,username,profilePictureUrl,reason,source,burst,intensity,...}`. Der vorherige Kandidat mit `type`, `duration` und fehlenden Producerfeldern entsprach dieser Emission nicht.
- Der reale GET-Handler `/api/emoji-rain/overlay/state` liefert `{success:true,state:{opacity}}` und die öffentliche Registry erlaubt GET. Das gelieferte OBS-HUD ruft diesen Zustand aber nicht ab und hört nicht auf `emoji-rain:opacity`; die aktuelle Opacityänderung ist daher kein belegter sichtbarer Renderer-Vertrag.
- Das initiale Canvas ist leer/transparent; `#perf-hud` und `#resolution-indicator` starten verborgen. Canvas-Simulationen sind kein Ersatz für sichtbare BrowserRenderer-/OBS-Evidenz.

### Umsetzung

- Matrixprofil auf tatsächlichen Route-/HTML-/Scriptpfad und die reale Minimalemission des Producers umgestellt. Das Fixtureevent ist durch Aufruf der echten `triggerEmojiRain()`- und `emitOverlaySpawn()`-Methoden mit einem no-write API-/DB-Double bestätigt.
- Lesende Fake-GETs für Config und User-Mappings als Initialisierungsplan dokumentiert. Den separaten öffentlichen Overlay-State-GET samt Responseform und Registry-Allowlist als Sourcevertrag ergänzt.
- Den bestehenden `emoji-rain:opacity`-Producer als synthetischen Prüfpunkt in der Matrix notiert, aber ohne sichtbare Änderung zu behaupten: der tatsächliche OBS-HUD-Renderer hat keinen Consumer. Die vier EmojiRain-Fälle bleiben blockiert, Nenner bleibt 104.
- Locale-Sourceübersicht auf die tatsächlich geladenen Assets und versteckte Baseline-/Opacitygrenze korrigiert. Keine EmojiRain-Produktdatei, Registry-Regel, Canvasrenderer oder öffentliche API geändert.

### Geänderte Dateien

- `scripts/obs-pilot/build-obs-104-matrix.js`
- `scripts/obs-pilot/test/obs-104-matrix.test.js`
- `docs/coordination/obs-104-acceptance-matrix.json`
- `docs/coordination/obs-pruefplan.md`
- `docs/coordination/obs-locale-expectations.json`
- `docs/coordination/obs-locale-expectations.md`
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests und Prüfungen

- Bestanden: `.\runtime\node\node.exe scripts/obs-pilot/test/obs-104-matrix.test.js` — 7/7. Der EmojiRain-Test ruft echten Producer, GET-Handler und Opacity-Producer auf und prüft die öffentliche GET-Allowlist; keine reine `source contains`-Behauptung.
- Bestanden: `.\runtime\node\node.exe scripts/obs-pilot/test/route-resolution.test.js` — 2/2. Der echte registrierte GET sendet `obs-hud.html`; das HTML enthält den tatsächlichen HUD-/Locale-Einstieg.
- Generator: `.\runtime\node\node.exe scripts/obs-pilot/build-obs-104-matrix.js` — 104 Fälle / 26 Profile geschrieben.
- Ein Aufruf mit `node --test` scheiterte an `spawn EPERM` des eingeschränkten Windows-Testprozesses; die beiden Node-`test`-Dateien wurden danach direkt mit gebündeltem Node v22.14.0 ausgeführt und bestanden.

### Verbleibende Risiken / nicht geprüft

- Der tatsächliche OBS-HUD konsumiert derzeit weder die Opacity-Eventemission noch den separaten State-GET. Matrixprofile macht diese Lücke sichtbar; Umsetzung/Produktentscheidung dazu ist offen und nicht Teil dieses Auftrags.
- Keine JSDOM-/Canvasmock-Pixelabnahme, kein BrowserSource-, OBS-, Produktserver-, Listener- oder VM-Start. Praktische Baseline, Spawnbild und Opacitywirkung bleiben ungeprüft.
- Inventory 104/104 und 26×4 bleiben unverändert; keine Overlay-Registryänderungen.

## CEO-Folgeauftrag: EmojiRain OBS-HUD-Opacity (Fixplan, 2026-10-07)

### Verifizierter Quellvertrag / Fixplan

- `POST /api/emoji-rain/overlay/opacity` akzeptiert eine endliche Zahl von 0 bis 1, aktualisiert `overlayState.opacity` und emittiert das bestehende öffentliche Ereignis `emoji-rain:opacity` mit `{opacity}`.
- `GET /api/emoji-rain/overlay/state` liefert `{success:true,state:{opacity}}`; der bestehende Public-Overlay-Vertrag erlaubt diesen GET und das vorhandene Ereignis.
- Der tatsächlich gelieferte OBS-HUD lädt `app/public/js/emoji-rain-obs-hud.js`, fragt aber weder den State-GET ab noch registriert er einen Opacitylistener. Sein `#canvas-container` erhält daher keine zentrale Opacity.
- Fix: echten HUD-Renderer beim Start den bereits erlaubten State lesen und anschließend auf das bestehende Event hören lassen. Nur exakt numerische, endliche Opacitywerte im Bereich 0..1 anwenden; ungültige/private Eventpayloads ignorieren und bei initialem Fehler den sichtbaren Standardwert 1 verwenden. Nach `pagehide` verspätete Antworten/Events sperren sowie Listener, RAF und Intervall aufräumen. Keine Registry-, Payload-, Einstellungs- oder Produkt-API-Änderung.
- Regressionstest führt den echten Renderer in einem isolierten JSDOM mit minimalen Matter-/Canvas-/Transportstubs aus und prüft `canvas-container.style.opacity`; daraus werden keine Pixel- oder OBS-Darstellungsbehauptungen abgeleitet.

### Befund / Umsetzung

- Sourcebefund bestätigt: Controller und Public-Overlay-Registry lieferten GET-Zustand und `emoji-rain:opacity` bereits korrekt, der ausgelieferte HUD-Consumer fehlte.
- OBS-HUD wendet jetzt beim Start den GET-Fallback an, registriert das bestehende Opacityevent am vorhandenen Socket und schreibt ausschließlich `#canvas-container.style.opacity`. Die GET-Antwort kann ein zwischenzeitlich empfangenes neueres Ereignis nicht überschreiben.
- Werte sind nur als Zahl mit `Number.isFinite` und im inklusiven Bereich 0..1 zulässig. GET-Fehler/ungültige Zustände bleiben bei Opacity 1; Eventpayloads mit Zusatzfeldern (einschließlich privaten Feldern) werden vollständig ignoriert.
- `pagehide`/`beforeunload` sind über idempotentes Cleanup abgesichert: spätere Opacityereignisse und Init-Fortsetzungen sind gesperrt; eigener RAF, Cleanupintervall und Socketverbindung werden beendet. Keine API- oder Registryänderung.

### Geänderte Dateien

- `app/public/js/emoji-rain-obs-hud.js`
- `app/plugins/emoji-rain/test/obs-hud-opacity.test.js`
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests

- Bestanden, no-cache, gebündeltes Node v22.14.0: `cd app; ..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath plugins/emoji-rain/test/obs-hud-opacity.test.js` — 4/4.
- Tests führen den tatsächlichen HUD-Renderer aus und prüfen den tatsächlichen Containerstil bei GET-Wert, Eventupdate, ungültigen/nicht endlichen/außerhalb liegenden und privaten Eventpayloads, verzögerter veralteter GET-Antwort, ungültigem GET-Fallback und Events nach `pagehide`.
- `git diff --check` für die drei geänderten Dateien bestanden. Vorherige Matrix-Suite wurde nicht erneut ausgeführt.

### Verbleibende Risiken / offene Entscheidungen

- JSDOM- und Matter-/Canvasstubs belegen DOM-Style-/Socketlogik, keine Canvaspixel, BrowserSource, OBS-Komposition oder reale Produkttransportwirkung.
- Keine Registryänderung; der bekannte öffentliche State-GET und das bestehende Event sind verwendet. Die parallele Ownership-Anfrage für `docs/coordination/obs-locale-expectations.json` und `.md` ist noch offen; diese Dateien wurden in diesem Folgeauftrag nicht verändert.
- Keine realen Liveaktionen, Zuschauer-, Rollen- oder Guthabendaten, kein Produktserver und keine Veröffentlichung verwendet.

## CEO-Folgeauftrag: EmojiRain OBS-HUD Spawn-/Lifecycle-Resilienz (Analyse/Fixplan, 2026-10-07)

### Verifizierter Quellvertrag / konkrete Repros

- `emitOverlaySpawn()` leitet normale Events an `emoji-rain:spawn` mit dem producerförmigen Objekt weiter. `triggerEmojiRain()` begrenzt positive Counts über `max_count_per_event` und Intensität, kann aber bei `NaN` auf eine NaN-Anzahl sowie bei negativen Eingaben auf negative Werte hinauslaufen; `Infinity` wird durch `Math.min` auf den Producer-Cap reduziert. Konfiguration und Input sind nicht in jedem Pfad identisch typisiert.
- HUD `handleSpawnEvent()` verwendet `const count = data.count || 1`. Bei Rate-Limitierung prüft der vorhandene 500er-Queue-Cap nur, ob die Queue anschließend gekürzt werden soll, führt aber weiterhin `for (i < count)`-Iterationen aus. Direkt reproduzierbare Risiken sind unendliche `count`-Schleifen, riesige positive Counts und ein NaN/Null-Fallback zu einem Spawn; negative Counts führen zu keinem Spawn. Vor Produktänderung folgen isolierte Tests am echten Renderer für diese Payloads, ohne Physics-/Pixelbehauptung.
- `profilePictureUrl` wird beim normalen Emoji nicht als Bild verwendet, aber bei `emoji === '{{profilePicture}}'` direkt in ein `img.src` übernommen. Serverseitige Mappings haben derzeit keine Schema-/Wertprüfung. Externe Profilbild-/Mappingassets sind aktuelle Featuresemantik; der Test blockierter Count-Payloads prüft daher, dass diese Payloads gar keine Image-DOM-/Assetwirkung erreichen, ohne legitime Profilbildspawns pauschal zu verbieten.
- Lifecycle-Plan: verzögerte Config- und Mappingantworten nach `pagehide` dürfen weder Mappingzustand/DOM aktualisieren noch danach Socket/RAF/Intervall reaktivieren. `pagehide` muss ausstehende RAF/Intervall beenden und den eigenen Socket genau einmal trennen. Regression testet echte Startpfade mit kontrollierten Promiseantworten sowie öffentliche Producer-förmige Spawnpayloads.
- Fixentscheidung folgt dem minimalen Repro: Client akzeptiert nur positive, endliche numerische Counts und begrenzt Iterationen auf den bestehenden 500er Queue-Cap; nach Cleanup abgewiesene/queued Socketcallbacks dürfen keinen DOM-/Assetpfad auslösen. Keine Änderung an legitimen gift/physicssemantischen Feldern, Locale-Dateien oder externem Profilbildvertrag ohne weitere Evidenz.

### Umsetzung

- Der echte HUD-`handleSpawnEvent()` blockiert fehlende/ungültige nichtnumerische, NaN-/Infinite-, Null-, Null-/Negativcounts vor Log, Queue oder DOM. Positive Bruchteile behalten die bisherige `for (i < count)`-Anzahlsemantik via Aufrunden. Positive Counts werden vor jeder Schleife auf 500 beschränkt.
- Verzögerte Config-/Mappingantworten prüfen nach Fetch und nach JSON-Auflösung den Destroyzustand, bevor sie Konfiguration, Mappingzustand oder Logs verändern. Socketregistrierungen laufen durch einen Cleanup-Guard; auch bereits kopierte Callbacks laufen nach `pagehide` nicht weiter. Cleanup bleibt idempotent.
- Isolierter echter Producer-Aufruf `triggerEmojiRain({count:-1,...})` emittiert tatsächlich `emoji-rain:spawn` mit Count -1. Das gleiche Producerpayload wird an den echten HUD-Handler gegeben und erzeugt keine DOM-/Assetwirkung. Der Renderer verarbeitet darüber hinaus 500 statt riesige `Number.MAX_SAFE_INTEGER`-Countwerte. Fixturebilder mit externer URL werden bei invaliden Counts nie als `<img>`-Quelle gesetzt.
- Profilbild-URL und Upload-/Mappingassets behalten ihre Featuresemantik. Der öffentliche Socket/GET ist nicht als Client-zu-Server-Schreibweg zu verwechseln; ein valider Profilbildspawn darf weiterhin ein Bild laden. Für externe URL-Sanitization gab es aus diesem Auftrag keinen reproduzierten Produktfehler, deshalb wurde keine Domain-/URL-Policy eingeführt.
- JSDOMs `VirtualConsole` wird im Test abgefangen; normale Runs bleiben still. Gespeicherte Fixturelogs werden auf externe URLs redigiert und pro Zeile auf 240 Zeichen begrenzt.

### Geänderte Dateien

- `app/public/js/emoji-rain-obs-hud.js`
- `app/plugins/emoji-rain/test/obs-hud-opacity.test.js`
- `docs/coordination/prioritaeten-fortschritt.md`

### Tests

- Bestanden, no-cache, gebündeltes Node v22.14.0: `cd app; ..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath plugins/emoji-rain/test/obs-hud-opacity.test.js` — 9/9.
- Suite prüft actual producer-shaped negative spawn, NaN/Infinity/Null/nichtnumerische Counts, external profile URL ohne `<img>`-Assetwirkung für blockierte Payloads, sehr große endliche Countbegrenzung, verzögerte Config-/Mappingantworten, late socket callback und genau einen Disconnect/Cleanup.
- Bestehende Matrix-Suite nicht erneut gestartet. Keine Pixel-/Physicsbehauptung.

### Verbleibende Risiken / offene Entscheidungen

- JSDOM-/Matterstubs prüfen Event-/DOMgrenzen und begrenztes Rendererverhalten, nicht Browser-/Canvas-/Physics-/OBS-Darstellung oder echte externe Netzwerkrequests.
- Beliebige, vom Produktserver absichtlich als Profilbild-/Uploadasset gelieferte HTTPS-URLs bleiben featurebedingt möglich. URL-Zulassung/Domainpolicy müsste separat mit der Upload-/Profilbildsemantik abgestimmt werden; dieser Auftrag verändert sie nicht.
- Locale-Erwartungsdateien gehören dem Overlay-Agenten und blieben unverändert. Keine realen Liveaktionen oder Daten, kein Produktserverstart, keine Veröffentlichung.

## Fortsetzungs-Audit — OBS-Vorgänger-Gate, 2026-10-07

- Aktive Nutzerziel-Reihenfolge bleibt verbindlich: Punkt 2 und danach Punkt 3 müssen vor SuperFan (Punkt 4) praktisch abgenommen werden. Den inzwischen eingegangenen SuperFan-Folgeauftrag habe ich dem CEO als nachrangig markiert; begonnen wird er nicht.
- Neuer Read-only-Audit des aktuellen gemeinsamen Worktrees: `docs/coordination/obs-104-source-inventory.json` enthält 26 Quell-IDs × vier Locales = 104 Fälle inklusive Chatango. Die aktuelle untracked `obs-104-acceptance-matrix.json` meldet dagegen 100 Fälle / 25 Profile und lässt Chatango vollständig aus.
- Die aktuelle lokale Änderung an `scripts/lib/obs-docs-capture-inventory.js` reduziert den erwarteten Guideumfang auf 17; committed HEAD `b11366cf1` erwartet 26. Eine parallele lokale Änderung an `scripts/lib/published-plugin-catalog.js` entfernt die Unterstützung für `publicAssetPathOwners`, obwohl die aktuelle Plugin-Release-Policy dieses Feld enthält. Dadurch scheitert der Quellinventargenerator im gemeinsamen Worktree mit „unknown key“. Beide parallelen Dateien bleiben unangetastet.
- `obs64` war während dieses Audits nicht aktiv. Keine VM-/OBS-Aktion und kein `obs64`-Computer-Use gestartet. Fortschrittsbericht nennt weiterhin fehlende tatsächliche Computer-Use-Freigabe für `obs64`; dafür sowie für Eigentümerschaft und isolierten Reparaturweg des 100/104-Matrixfehlers wurde der CEO konkret um Entscheidung gebeten.
- **Status Punkt 2 unverändert:** OBS praktisch 0/104. Matrix-/Fixture-/Hostnachweise zählen nicht als OBS-Pass. Punkt 3–6 bleiben ungeöffnet, bis die vorigen Gates praktisch und unabhängig abgenommen sind.

## OBS-104 Scope-/Parserreview und OBS-Startblockade — 2026-10-07

- Current review base is `3f6bb84f9`. The reconciled candidate keeps the 104-case denominator as 68 current public-guide cases (17 × 4), 32 local Closed-Beta cases (8 × 4), and four Chatango retirement controls. All 100 active rows are `NOT_TESTED` for OBS. Chatango controls are explicitly `RETIRED_NOT_APPLICABLE` and never count as a visual pass.
- An isolated Express static fixture bound to `127.0.0.1` returned 404 for `/plugins/chatango/ui.html`. The remaining Chatango directory has no manifest, `main.js`, or `ui.html`.
- The exact committed HEAD catalog parser accepts valid `publicAssetPathOwners` mappings and rejects bad owner/path/traversal/encoded/unknown-key fixtures. The current dirty parser rejects the valid committed policy because its parallel diff removes this contract. Regression evidence is in `docs/coordination/output/obs-104-scope-review-3f6bb84f9/`; shared parser and guide-capture files were not changed.
- OBS Preview 32.0.0 was staged temporarily with matching source hash `A6C425CD1FAE70FEC18252FAAC641F3D01FDCD2D668FC6829ABA4FAD96F11D99`; before launch there were zero `obs64` processes and no listener on 4455. Computer Use launch returned exactly `Computer Use was not approved to use obs64`; no OBS window/process was started. User must authorize `obs64` in Computer Use before the single-source DE pilot. Portable-mode activation and config-path proof must precede any future start.
- **Status Punkt 2:** Matrix/parser/scope checks pass; practical OBS acceptance remains 0/104 and is blocked at the Computer Use app-authorization gate. No screenshots or visual pass are claimed. Punkte 3–6 remain unopened.

## Policy-Parität / Pilotvorbereitung, OBS vorerst ausgesetzt — 2026-10-07

- Nutzerentscheidung: OBS-Pilot vorerst zurückstellen. Keine weiteren OBS-Startversuche oder Freigabeanfragen. Punkt 2 bleibt praktisch unabgenommen bei 0/104; Punkte 3–6 werden nicht vorgezogen.
- Consumer-Parität gegen HEAD `3f6bb84f9`: Catalog-Parser, Python Pages-/Release-Bundler und Go-Extractor verlangen einen kanonischen Owner, der direkt in `closedBeta` steht. Der Runtime-Guard normalisiert zusätzlich Plugin-Aliase und akzeptiert dadurch `streamalchemy` als Asset-Owner, während Build-Consumer ihn ablehnen. Isolierter zweifile Kandidatenpatch `policy-owner-parent-child-parity.patch` (Runtime-Ownerprüfung + neue Regressionstestdatei) behebt diesen Semantikunterschied; nicht angewendet.
- Prüfungen: acht Kandidaten-Paritätstests PASS; exakte HEAD Python Pages-/Release-Consumerfixture PASS (zugeordnetes Asset ausgeschlossen, nicht zugeordnetes erhalten, invalid/dotdot/encoded/Owner/unknown-key abgelehnt); exakter HEAD Go-Extractor-Test PASS. `git apply --check` für den Zweifilepatch bestanden. Die bestehende dirty Rollbackänderung an Catalog/Python/Go/Tests blieb unangetastet.
- Matrixreview bleibt 68 aktuelle öffentliche Fälle + 32 lokale Beta-Fälle + vier Retirement-Kontrollen; alle aktiven Fälle OBS NOT_TESTED. Chatango-Static-404 ist keine OBS-Darstellung.
- Vorbereitete STT-Pilotartefakte (`pilot/PLAN.md`, Evidence-Schema, Loopback-Fixture, Cleanupscript, Marker-Template) sind ausschließlich Plan/Quellfiles. Sie wurden nicht gestartet; weder OBS-Profil/Szene noch Browser Source, Screenshot oder Fixtureprozess wurden erstellt.
- Quelleinschränkung: Computer Use hatte zuvor `Computer Use was not approved to use obs64` geliefert. Die spätere Nutzerentscheidung stellt den Pilot ausdrücklich zurück; keine erneute Anfrage.

## GIPHY-Pages Link-Audit — vorbereitende Quellprüfung, 2026-10-07

- Der Orchestrierungschat beauftragte einen isolierten Audit des vorbereiteten Pages-Filters gegen aktuellen HEAD und Coming-Soon-Marketingseiten in DE/EN/ES/FR. Während der Vorbereitung bewegte sich HEAD von `7ba4aedac` zu `afcf36a44`; dieser aktuelle Commit enthält `7ba4aedac` als Vorfahren und wurde als exakte Testbasis verwendet.
- **PASS:** actual Pages-Builder im isolierten Fixture mit `PAGES_FILTER.patch` gebaut. Die vier kanonischen Seiten (Deutsch `features/index.html`, Englisch/Spanisch/Französisch `features-{en,es,fr}.html`) behalten jeweils 7 Coming-Soon-Karten; pro Sprache wurden 23 lokale Kartenlinks/-bilder gegen Git-HEAD und die erzeugte Ausgabe geprüft (92/92 erhalten). Alle vier HTML-Dateien sind bytegleich mit HEAD.
- **Patchkorrektur nicht nötig:** der Filter betrifft beta-spezifische Guides/Guide-Screenshots und Chatango-Pfade; keine Coming-Soon-Marketingreferenz wird dabei entfernt.
- Ein erster Erkundungslauf verwendete `features.html`, das deutsche Redirectdokument, nicht den eigentlichen Inhalt unter `/features/`. Die endgültige Regression verwendet `features/index.html` und besteht. Keine Produktdatei, kein Storepaket und kein Pages-Release wurde geändert.
- **Grenzen:** der isolierte Kandidat enthält die Link-Closure (252 Dateien, 19,83 MB), kein vollständiges Pages-Release. Kein Browserrendering, Deployment, Publishing oder echter GIPHY-Providerzugriff. Kandidatenfilter wartet weiterhin auf CEO-Review; praktische Priorität 2 bleibt gemäß Nutzerentscheidung ausgesetzt, Prioritäten 3–6 bleiben offen.
- Bericht und wiederholbarer Regressionstest: `docs/coordination/output/giphy-pages-link-audit-7ba4aedac-20261007/REPORT.md`, `test-coming-soon-pages-links.py`, `final-head-run/RESULT.json`.

## CEO-Zwischenauftrag: Runtime-/Website-Artefaktvertrag — 2026-10-07

- Der CEO stellte OBS ausdrücklich weiter zurück und wies den Rechte-Agenten stattdessen an, den vorhandenen Runtime-/Installer-Artefaktvertrag abzuschließen. Daher gab es keine OBS-Start-, Freigabe- oder VM-Aktion. Priorität 2 bleibt praktisch **0/104**; die Punkte 3–6 bleiben ungeöffnet.
- Der unveränderte Runtimekandidat aus exakt `fde29a99d95222e8f441ffedc78df43e15ba0f06` besteht die benannten ZIP-/Sidecar-, Marker-, Policy-, Beta-/Alias-/Chatango-Ausschluss- und Launcher-Paritätschecks. Der Website-Worker meldete PASS für die begrenzten Website-Artefaktgates. Das ist keine Veröffentlichung und ersetzt keine praktische Prioritätenabnahme.
- Routen-/UI-Metadaten führen im Runtimebericht weiter zu `PARTIAL_DORMANT_ROUTE_REFERENCES`; die vorhandenen direkten Middleware-Fixtures fanden keinen Beta-Handler oder Beta-Inhalt, aber Full-App-/HTTP-Dispatch bleibt wegen Loopback-`EACCES` ungeprüft. Installerlauf, Runtimestart und Liveverhalten wurden nicht geprüft.
- Detaillierter Nachtrag: `docs/coordination/permissions-events.md`, Abschnitt „Runtime-/Website-Artefaktvertrag“; isolierter Website-Bericht: `docs/coordination/website-runtime-artifact-contract-review.md`.

## CEO Runtime-Startnachtrag — 2026-10-07

- Exaktes bestehendes Runtime-ZIP unter isoliertem Dokumentations-Capture-Profil mit Node 22.14 gestartet: Initialisierung bis zur Ready-/Dashboard-Meldung, lokales Binding konfiguriert, null Plugins; kein Produktprofil oder Netzwerkconnector genutzt.
- HTTP-Healthcheck blockiert mit Windows-Socket-`EACCES`; Listener nicht nachgewiesen. Prozess kontrolliert beendet, Temp-Profil bereinigt, Paket unverändert. Das ist ein teilweiser Startnachweis und kein HTTP-/App-Acceptance-PASS.
- Installer/Update/Rollback weiter NOT_CHECKED; kein Push/Publish.

### Runtime-Healthcheck-Ursachengrenze

- Read-only-Prüfung von `app/server.js` plus dem unveränderten Startlog belegt, dass `server.listen(..., onServerListening)` den Listening-Callback erreicht hat und dort Serverstatus/CORS-Ready- sowie Dashboard-Logs geschrieben wurden. Sonstige Server-Listenerfehler würden den Prozess sofort beenden; der beobachtete `EACCES` stammt aus dem Harness-`HttpClient.GetAsync` zum Loopback.
- Der Client-Connect scheitert also im eingeschränkten Hostkontext. Die Listeneradressabfrage war durch abgefangene Fehler unbestimmt. Keine Rechte-/Firewalländerung und keine Wiederholung vorgenommen. HTTP bleibt ungeprüft, kein Health-/Routendispatch-PASS.
- Dokumentation: `docs/coordination/permissions-events.md` und `docs/coordination/CEO_HANDOFF.md`; `git diff --check` für diese Statusdokumente bestanden.

### Harness-Korrektur (keine neue Runtime-Ausführung)

- Isoliertes Startdiagnose-Harness trennt Ready-Callback-Marker, Listenerabfrage (observed / no-owned-listener / error), Client-Connect-Fehler, Health-HTTP-Antwort und Shutdown/Prozessende. Fehler bei `Get-NetTCPConnection` werden nicht mehr als leere Adressliste dargestellt; Socketcode 10013 wird im Client-Connect-Feld als EACCES vermerkt.
- Synthetischer Regressionstest plus PowerShell-Parserprüfung bestanden. Bestehendes Runtime-`result.json` und Logs bleiben unverändert. Kein neuer Prozesslauf, kein HTTP-PASS; der Gatepunkt bleibt offen.
- Bericht: `docs/coordination/output/runtime-startup-contract-dd824-20261007/HARNESS_CORRECTION.md`.

## Unterstützender Website-Linkreview während OBS-Pause — 2026-10-07

- Punkt 2 bleibt nach Nutzerentscheidung ausgesetzt bei 0/104; diese unterstützende Website-Prüfung zählt nicht als praktische Abnahme und zieht keine Folgepriorität vor.
- Read-only geprüft wurde der saubere Websitecandidate `codex/closed-beta-chatango-web` HEAD `82db0aaf505801429916160cc3fea6dc996c9fb0`. Vier historische fehlende Ziele bestehen in der Quelle fort: fehlendes Mascot-Sprite, FAQ-OBS-Frag, FAQ-Troubleshooting-Frag und Config-Import-Docs-Frag.
- Ein dreiteiliger Patchvorschlag `docs/coordination/output/giphy-four-links-82db0aaf-20261007/PAGES_FOUR_LINKS_FIX.patch` besteht `git apply --check` auf exakt diesem HEAD, wurde jedoch nicht angewendet. Bericht: `docs/coordination/output/giphy-four-links-82db0aaf-20261007/REPORT.md`.
- Der aktuelle Websitecheckout enthält kein gebautes Pages-Bundle; Browser-/Deploymentnachweis nicht geprüft. Websitecheckout blieb sauber, kein Build, Push oder Publishing.

## OBS-104 Scope-Readiness während der Nutzerpause — 2026-10-07

- Read-only Abgleich abgeschlossen; kein OBS-/VM-/Produktstart. Punkt 2 bleibt pausiert und praktisch 0/104.
- Die 104 historischen Case-IDs wurden bewahrt und mit der aktuellen 100-Fall-Matrix abgeglichen: IDs deckungsgleich; 68 Public-Guide, 32 lokale Beta-Overlayprofile, 4 Chatango-Retirement-Kontrollen. Die vier Retirement-Kontrollen sind keine OBS-Pässe.
- Aktueller Scope: 24 Store-Einträge (23 App-Pakete plus Store Admin), 26 öffentliche Top-Level-Manifeste, 11 Beta-Policy-IDs, 17 Public-Guide-Overlayprofile und 8 lokale Beta-Overlayprofile. Drei Beta-IDs haben kein OBS-Ziel. Drei öffentliche Runtime-Manifeste haben keine Store-ZIP; davon sind `minecraft-connect` und `webgpu-fireworks` weiterhin Public-Guide-OBS-Ziele. Scopebeziehungen bleiben getrennt und historische Case-IDs unverändert.
- Für 14/25 aktiven Matrixpfaden ist die Matrix-URL nicht selbst in der Public-Overlay-Registry registriert; 13 haben einen registrierten Alternativpfadkandidaten, Minecraft Connect keinen. Das ist nur ein Tunnel-/Registryhinweis und kein lokaler Browser-Source-Fehlernachweis.
- Neue Artefakte: `docs/coordination/obs-104-readiness-checklist-20261007.json` (104 konkrete Zeilen) und die zugehörige Markdown-Kurzfassung. Alle aktiven Guide-Definitionen, Source-HTML-Ziele und Evidence-Dateien vorhanden; vorhandene Fixture-Metadaten wurden nicht erneut ausgeführt oder als OBS-Pass gezählt.
- JSON-Parsing, 104 eindeutige IDs, 68/32/4, Locale-Verteilung 25 je Sprache und aktive ID-Parität zur aktuellen Matrix geprüft. Keine Tests, OBS-/VM-/Appstarts, Registryänderung oder Liveaktion.
## CEO Folgeauftrag: OBS-104 Guide-URL-/Registry-Zuordnung — 2026-10-07

- Read-only Mapping auf exakt `fde29a99d95222e8f441ffedc78df43e15ba0f06` erstellt: `docs/coordination/obs-104-route-mapping-20261007.json` und Kurzbericht `.md`. 14 Profile/Casegruppen, mit Case-IDs und HEAD-Blobpins zu Handler, URL-Produzent und HTML-Ziel.
- 11 registrierte Alternativpfade sind dateigleich mit dem Matrixziel (8 public, 3 local Beta). Advanced Timer und OpenShock sind Renderer-Mismatches mit offener Ownerentscheidung. Minecraft Connect: öffentliches Runtimemanifest ohne Store-ZIP; nur statische `/plugins`-Route, kein bestätigter registrierter Tunnelpfad.
- Keine Registry-/Produkt-/104-Matrixänderung und keine OBS-/VM-/App-/Tunnel-Ausführung. Lokale Browser-Source-Routbarkeit und öffentlicher Tunnel bleiben getrennte Fragen; Punkt 2 bleibt pausiert bei 0/104. HTTP-Dispatch und tatsächliches OBS nicht geprüft. Offene Decisions: Renderer bei Advanced Timer/OpenShock, gewünschte Dokumentation von Minecraft Connect.

## CEO Folgeauftrag: Advanced-Timer-/OpenShock-Renderersemantik — 2026-10-07

- Read-only auf exakt `fde29a99d95222e8f441ffedc78df43e15ba0f06` verglichen: `docs/coordination/renderer-url-semantics-20261007.json` und `.md`; HEAD-Blobpins beigefügt.
- Advanced Timer: Guide- und registrierte UI-URL teilen Timer-ID, REST/Eventvertrag und Overlay-JS; registrierte Root-Shell hat zusätzlich Rotator-/Threshold-Layer. Vorschlag `/advanced-timer/overlay?lang=…&timer=…`; visuelle Erwartungen müssen auf Timerkern begrenzt oder für Zusatzlayer erweitert werden.
- OpenShock: Guideziel ist generische Shock-Eventkarte (`openshock:command-sent`); `/openshock/overlay` sendet dieselbe HTML-Datei. Registrierte `/openshock/zappiehell/overlay` rendert stattdessen Coin-Goals/Completion und Audio, ohne Shock-Command-Listener; kein Ersatz. Lokale OBS-URL bleibt generisch. Public Tunnel für generischen Shock-Renderer erfordert separate Registry-/Policyentscheidung.
- JSON-Struktur/HEAD-Pins und `git diff --check` validiert. Kein HTTP, OBS, Tunnel, Produktstart, Registry- oder Guide-URL-Edit. Punkt 2 bleibt pausiert bei 0/104.

## CEO Folgeauftrag: Advanced-Timer-Guide auf registrierte URL umstellen — 2026-10-07

- Auf Basis des damaligen CEO-gepinnten Commits `a86ebdde078ec56c91d112073af100df0c338fe3` wurde `scripts/plugin-guides/advanced-timer.js` minimal angepasst: `overlay`, Capture-Route, Workflow-Route, `goto` und URL-Postcondition verweisen jetzt auf `/advanced-timer/overlay`. Die 4 Locale-Cases, `lang`- und nichtleerer `timer`-Parameter sowie die 01:30-Kernerwartung bleiben erhalten. In DE/EN/ES/FR ist ausdrücklich vermerkt, dass Rotator-/Threshold-Layer optional und außerhalb dieser Timerprüfung liegen.
- Regressionstest in `app/test/plugin-workflow-contract.test.js` prüft registrierten Einstiegspunkt, identische Guide-/Workflow-/Capture-Route, Queryvertrag, optionale Layertexte in allen vier Locales und unveränderte 01:30-Erwartung.
- **PASS, fokussierter Node-22-Vertrag:** einzelner Guide mit bestehendem `safe-workflow-contracts` komponiert; registrierter Pfad, vier Locale-Copy-/Workflow-Verträge, Query/01:30 und Route im Screenshot-Spec bestätigt. `node --check` für Guide und Regressionstest sowie scoped `git diff --check` bestanden.
- **Jest NICHT AUSGEFÜHRT:** vor Teststart scheitert Jest an Windows-Sandbox `EPERM` in `fs.realpathSync.native` für App-/Temp-Pfad. **Vollständiger Guidegenerator NICHT AUSGEFÜHRT:** `buildGuides` bricht an der parallelen dirty `scripts/lib/published-plugin-catalog.js` Änderung ab (`plugin-release-policy.json contains an unknown key`, weil die aktuelle Policy `publicAssetPathOwners` enthält). Keine der parallelen Dateien geändert.
- `obs-104`-Case-IDs, OBS-Matrix und Readiness-Artefakte blieben unverändert. Der neue Guidepfad ist noch nicht in die frühere Readiness-Checkliste fortgeschrieben; vor einem künftigen OBS-Lauf dort die URL-Zuordnung synchronisieren. Kein OBS/VM/Produktstart oder Public-Tunnel/HTTP-Lauf. Praktische OBS bleibt pausiert bei 0/104.

## CEO-Folgeauftrag: Advanced-Timer-Guide Patch-Freeze auf a86 — 2026-10-07

- Minimaler Patch gegen exakten Basiscommit `a86ebdde078ec56c91d112073af100df0c338fe3` erstellt: `scripts/plugin-guides/advanced-timer.js` und `app/test/plugin-workflow-contract.test.js`. Benannter Patch und Prüfpins: `docs/coordination/output/advanced-timer-guide-a86-20261007/REPORT.md` und `advanced-timer-guide-a86.patch`.
- Isolierter Standalone-Quellkandidat `standalone-a86/` wurde aus Git-Archiv des Basiscommits erzeugt. Der ursprüngliche veröffentlichte Katalog/Policy-Vertrag aus a86 blieb erhalten; ergänzende Quellarchive stammen ebenfalls aus demselben Commit. Patch vor Anwendung mit `git apply --check --whitespace=error-all` geprüft, danach Reverse-Apply-Check bestanden. Keine fremden Änderungen zurückgesetzt.
- **PASS:** vollständiger Generatorlauf im Kandidaten: `node scripts/build-plugin-docs.js` → `Built 27 detailed plugin tutorial pages in four locales.` Guide-Komposition und Screenshot-Spec bestätigen `/advanced-timer/overlay` für Guide/Capture/Workflow, Queryvertrag und 01:30. Syntax- und scoped whitespace checks bestanden.
- **Teilweise geprüft:** fokussierter Original-Jest-Aufruf im Kandidaten wurde versucht. Vor Testausführung Usage-Ausgabe und `EPERM` bei `fs.realpath` auf Sandbox-Temp; Exit 1. Jest ist damit blockiert, der Regressionstest ist nicht als bestanden belegt.
- Separater Readiness-URL-Vorschlag im Output-Ordner enthält alle 104 unveränderten IDs der Readiness-Checkliste; die vier Advanced-Timer-Locale-IDs erhalten die vorgeschlagene URL. Alle vier bleiben `NOT_TESTED`, `obsPass:false`. Checkliste und Acceptance-Matrix nicht geändert. OBS bleibt pausiert bei **0/104**, kein OBS-Pass.
- Keine OBS/VM-, HTTP-, Browser-, App-, Katalog-/Registry-, Veröffentlichungs- oder Live-Aktion. Der Detailbericht enthält Befehl, Kandidatenpfad, Hashes, Generatorausgabe und offene Testgrenze.

## CEO-Folgeauftrag: Public-Guide-URLs read-only geprüft — 2026-10-07

- Gegen aktuellen HEAD `2e00eff1a30a0de2a4db99e92ef20dd719ae9fdd` alle 17 Profile der 104er Readiness-Checkliste mit UI-URL-Produzenten, Handlerpfaden, Registry und Renderer-HTML abgeglichen. Readiness-IDs/Datei blieben unverändert.
- Acht Guidepfade sind nicht im Public-Overlay-Registry registriert, haben aber einen registrierten UI-/Handlerpfad, der dieselbe Renderer-HTML-Datei liefert. Für CoinBattle, Fireworks, Game Engine, Viewer-XP, Quiz Show, Spotlight, STT Ticker und Weather Control liegen getrennte Patchvorschläge mit HEAD-Blobpins, SHA-256 und erfolgreichem `git apply --cached --check --whitespace=error-all` vor: `docs/coordination/output/public-guide-route-audit-2e00eff1/`.
- ClarityHUD, Emoji Rain, Flame Overlay, Goals, TopTier und WebGPU Fireworks sind bereits routenparitätisch. Advanced Timer ist im Arbeitsbaum durch den separaten Guide-Patch auf den registrierten UI-Pfad umgestellt.
- OpenShock bleibt ohne Pfadpatch: generischer Shock-Renderer und registrierter ZappieHell-Goals-Renderer sind semantisch verschieden; Public-Tunnel-Allowlist benötigt separate Entscheidung. Minecraft Connect hat nur globale lokale Static-Auslieferung, keinen UI-erzeugten oder registrierten Public-Pfad; keinen erfunden.
- Nur Quellprüfung und Patchvorschläge: kein HTTP, OBS, VM, Tunnel, App-, Profil- oder Live-Lauf; keine Registryänderung. OBS bleibt pausiert bei **0/104**.

### CEO-Folgeauftrag: acht Public-Guide-Routen im isolierten Snapshot geprüft — 2026-10-07

- Exakten Source-Stand `2e00eff1a30a0de2a4db99e92ef20dd719ae9fdd` isoliert eingefroren; die acht Routenpatches dort durch den vollständigen Generator geprüft. Voller Ergebnissatz, 64 Locale-URLs und Freeze-/Einzelpatch-Hashes: `docs/coordination/output/public-guide-route-audit-2e00eff1/combined-freeze-2e00/REPORT.md`, `route-evidence.json`, `freeze-manifest.json`.
- **PASS:** Generator 27 Guides/4 Locales, Dokument-, Screenshot-Spec-, Source- und GuideDefinition-Verträge; neue Snapshot-only Route-Regression 8/8; gezielter bestehender Workflow-Postconditionstest 1/1; Locale-Bundle-Suite nach Ergänzung der selektiven Snapshotdatei 1/1.
- **Teilweise / Baselinefehler:** `2e00` liefert 27 Guides/17 Overlay-Guides, aber vorhandene Tests und Capture-Inventar erwarten 38/26 bzw. 26. Der unveränderte OBS-Capture-Contracttest scheitert daher bereits an `Expected 26 overlay guides, found 17`; weitere ältere Suiten referenzieren aus dem Public-Katalog ausgeschlossene IDs. Der originale Anchor-Verifier kennt neue Alias-zu-HTML-Zuordnungen nicht; angepasster isolierter Prüfer besteht.
- Keine Route-, Registry-, Renderer- oder Testdatei im gemeinsamen Produktbaum geändert; keine Integration, HTTP-, Browser-, OBS-, Tunnel-, App- oder Live-Aktion. OBS-Priorität bleibt pausiert bei **0/104**.
## CEO-Folgeauftrag: Guide-Policy-/Anchor-Validator-Freeze (2026-10-07)

- Isolierter Ausgangsstand: `f9be287f583da73777a9ccc53630923e08b6382b`. Die committed Release-Policy/Katalogwerte ergeben 27 öffentliche Guides und 17 öffentliche Overlay-Guides; die früheren Validatorverträge 38/26 sowie 152 Live-Varianten waren veraltet. Vier Locales ergeben 108 öffentliche Guidevarianten. Das OBS-Hilfsinventar enthält die 17 aktiven öffentlichen Overlay-IDs; die praktische OBS-Abnahme bleibt ausdrücklich 0/104 und pausiert.
- Public, Local-Beta, Alias und aus dem Katalog ausgeschiedene ID sind in den Regressionen getrennt. Vorhandene lokale Workflowassertions bleiben erhalten. Der Anchorverifier löst die acht geprüften Routenaliase und Rendererpfade auf dasselbe HTML auf; öffentliche Overlay-Registry unverändert.
- Freeze-Artefakte, SHA-256 und vollständige Prüfergebnisse: `docs/coordination/output/release-policy-guide-validator-sync-f9be-20261007/REPORT.md` und `freeze-manifest.json`. 11 Jest-Suiten/153 Tests bestanden; zusätzlich aktualisierte Local-Beta-/Retired-Regression 70/70. Generator/Contract-Audit und alle vier Docs-/Source-/Anchorvalidatoren bestanden.
- Kein Patch in den gemeinsamen Arbeitsbaum portiert: aktuelle Arbeitskopie `0b4401d1765c446471d7e3956752bd7676c5da33` enthält parallele Änderungen in überlappenden Guide-, Katalog-, Generator- und OBS-Hilfsdateien. Fremde Änderungen blieben unangetastet; der Freeze ist isoliert.
- Unterbrechung: neue Nutzereingabe fiel während des Polls der Abschluss-Jest-Runde ein. Der Prozesshandle war danach nicht mehr pollbar, aber gespeicherter Jest-Log und JSON-Ergebnis belegen 11/11 Suites, 153/153 Tests und null Fehler; die geänderte Workflow-Suite wurde danach separat erneut erfolgreich ausgeführt.

## Neuer CEO-Folgeauftrag: Punkt 1 MPV kontrollierter Shutdown

- Vorhandene Music-Bot-Arbeit ist uncommitted und wird zuerst read-only geprüft. CEO-Befund: normale Stop-/Replacement-/Shutdownpfade enden aktuell mit Child-Exitcode 1 durch harten `taskkill`, obwohl explizites MPV-IPC-`quit` Exitcode 0 liefert. Auftrag: bestätigtes IPC-`quit` und bounded wait für regulären Stop; ownership-/marker-gebundener Fallback bleibt als Sicherheitsgrenze bestehen. Regression soll Exitcode 0 sowie PID-/Temp-Cleanup nachweisen.
- Kein Hörtest im Folgeauftrag; dafür ist keine Nutzerfreigabe erteilt. Kein Produktivprofil, keine Safetylock-Umgehung und keine Live-Verbindung.


## CEO-Nachtrag: frische MPV-Prüfung — 2026-10-07

- Unabhängig zusätzlich ausgeführt: fünf echte MPV-Nullausgabe-Integrationen bestanden (1 Steuerungs-/Heartbeat-/Seek-/Pause-/Stop-Test sowie 4 Lautstärke/Trackwechsel, IPC-Quit, QueueManager-Sequenz und Musikbot-Queuehandler). Eigene PIDs und temporäre Dateien/DBs wurden nach jedem Fall bereinigt.
- Echter MusicResolver-Suchlauf mit yt-dlp erfolgreich, nur Metadaten/Match ausgewertet; keine Mediendatei geladen, kein Provider-URL-Playback.
- Geordneter JSON-IPC-quit endet mit Exitcode 0. Der reguläre Controller-Stop/Replace-Pfad erzwingt derzeit Taskkill und MPV meldet Exitcode 1. Rights-Worker untersucht einen minimalen Fix mit Regression; noch nicht integriert.
- Der bereits vom Nutzer bestätigte synthetische Hörnachweis bleibt gültig. Eine weitere Hörprobe ist nur bei Antwort „Ja, jetzt testen“ freigegeben und wartet derzeit.
- Punkt 1 ist damit nicht vollständig abgenommen. In dieser Runde keine Produktdatei geändert, kein Commit, Push oder Release.

## CEO-Folgeauftrag: Music-Bot-Safety-Lock-Profiltest (2026-10-07)

### Befund und Scope

- Codepfad geprüft: `MusicBotPlugin.init()` lädt den `config`-Wert aus dem Profil-DB, initialisiert Playback und reconciled markierte Player. Wenn gespeicherte `config.safety.locked` wahr ist, ruft init `PlaybackController.emergencyStop()` auf; andernfalls löst es den Controller-Lock. Diese init-Transition wurde in diesem Testauftrag absichtlich nicht ausgeführt, weil der Auftrag jeden `emergencyStop`-Test verbietet.
- `_isSafetyLocked()` berücksichtigt gespeicherten Pluginzustand und Controllerzustand. Die Resume-Route antwortet bei gespeichertem Lock vor Zugriff auf den Player mit HTTP 423. `PlaybackController.play()` prüft den internen Safety-Lock vor der Engine-Erzeugung.
- Kein Music-Bot-Produktcode und keine bestehende Testdatei geändert. Ein neuer gezielter Jest-Test ist in `app/test/music-bot-safety-profile-lock.test.js` abgelegt.

### Isolierter Test und Assertions

- Das Testfixture legt unter `os.tmpdir()` ein temporäres Konfigurationsverzeichnis mit `ConfigPathManager` und `UserProfileManager` an, erstellt für `safety_lock_review` eine echte SQLite-Profil-DB mit `DatabaseManager` und verwendet die echte `PluginAPI` für `setConfig/getConfig`. Kein Nutzerprofil/produktive DB.
- Die Fixture persistiert `locked: true` samt Zeit/Grund, erzeugt MusicBotPlugin und lädt den Wert durch `_loadConfig()`. Assertions prüfen Profilpfad, round-trip Persistenz, normalisierten Plugin-Lock und `_isSafetyLocked() === true`.
- Die echte Resume-Route wird mit einer reinen Response-Fixture aufgerufen; erwartet sind HTTP 423/`locked: true` und kein Resolver-Aufruf. Ein echter `PlaybackController` erhält eine zählende Engine-Factory; mit direkt gesätem Test-Lock muss `play(file://...)` am Lock scheitern und die Factory nullmal aufgerufen werden.
- Aufräumen im `afterEach`: SQLite-Verbindung schließen und nur den erzeugten eindeutigen Temp-Root rekursiv entfernen. Es gibt keinen MPV-Pfadcheck, kein `spawn`, keine App-/Audio-/LIVE-/HTTP-Prozessstarts. Kein `emergencyStop`, `releaseSafetyLock`, `resetPlayer` oder `remainLocked: false` wird aufgerufen. Die Controller-Lock-Eigenschaft wird als Fixturezustand gesetzt, nicht über Safety-Transition-Methoden.

### Ausführbarkeit und Ergebnis

- Syntaxcheck der neuen Testdatei mit gebündeltem `runtime/node/node.exe` (Node v22.14.0): PASS.
- Gezielter Jest-Befehl (aus dem Repository-Root):

```powershell
$env:TEMP = (Resolve-Path app\.codex-test-tmp).Path
$env:TMP = $env:TEMP
runtime\node\node.exe app\node_modules\jest\bin\jest.js --config app\jest.config.js --runInBand --runTestsByPath app\test\music-bot-safety-profile-lock.test.js
```

- Eigene Jest-Versuche in der Worker-Sandbox starteten nicht zur Testsammlung und endeten vor 0 Tests mit `EPERM: operation not permitted, realpath` auf Temp-/Workspacepfaden. Keine Sandbox-Eskalation oder Umgehung versucht.
- **Unabhängige CEO-Wiederholung bestanden:** exakt `runtime\node\node.exe app\node_modules\jest\bin\jest.js --config app\jest.config.js --runInBand --no-cache --runTestsByPath app\test\music-bot-safety-profile-lock.test.js` ab Repo-Root; Exit 0, 1 Suite / 1 Test PASS. Keine Prozess- oder Audioausgabe. Die Testassertions oben sind damit ausgeführt und bestanden.

### Status getrennt

- **Geprüft und bestanden:** Neue isolierte Regressionstestdatei; CEO-Wiederholung 1 Suite / 1 Test PASS, inklusive SQLite-Profilpersistenz, Laden des Safety-Locks, HTTP-423-Resume-Ablehnung und Engine-Factory-Aufrufszähler `0`. Keine Produktkorrektur war Teil dieses Auftrags.
- **Teilweise geprüft:** Test bestätigt die Profil-/PluginAPI-Persistenz und gesperrte Resume-/Controller-Grenze ohne Audio/Prozessstart. Eigene Runnerverifikation blieb in der Worker-Sandbox durch `realpath EPERM` blockiert; unabhängiger CEO-Lauf schließt die Jest-Testverifikation.
- **Nicht geprüft / weiterhin offen:** echte `init()`-Locktransition, OS-Prozess-Reconciliation und echte App-/MPV-Integration. Diese Abgrenzung ist beabsichtigt: kein Safety-Unlock, `emergencyStop`, Reset oder echter Playerstart wurde getestet.
- **Restlücke:** Der isolierte PASS beweist nicht den gesamten Pluginstart samt Not-Aus- und Prozess-Reconciliation-Pfad. Dafür ist ein späterer, ausdrücklich freigegebener und weiterhin prozesssicherer Testauftrag erforderlich; kein Safety-Gesamtabschluss wird behauptet.


## CEO-Folgeauftrag: init-Orchestrierung mit gespeichertem Safety-Lock (2026-10-07)

### Test und Abgrenzung

- Separate Regression: `app/test/music-bot-safety-profile-init-lock.test.js`. Sie nutzt einen echten temporären Profilpfad (`UserProfileManager`), echte temporäre SQLite-Profil-DB (`DatabaseManager`) und echte `PluginAPI`-/`MusicBotPlugin.init()`-Orchestrierung. Der gespeicherte Lock wird über `_loadConfig()` geladen.
- `PlaybackController` ist im Test ein EventEmitter-Testdouble. `emergencyStop` ist ausschließlich `jest.fn` und hat keine Prozesswirkung; der Test erwartet genau einen Aufruf mit gespeichertem Grund. `releaseSafetyLock` muss nullmal laufen. `play`, Engine-Erzeugung und Spawn-Testgrenzen werfen, falls sie aufgerufen werden. `child_process.spawn`/`execFile` sind ebenfalls werfende Spies; `SoundbotProcessRegistry`-Konstruktion wirft. Yt-dlp-/MPV-Probes und nicht relevante Background-/Route-/Resolverdienste sind im Init-Test isoliert.
- Der echte Plugin-Init-Aufruf und die echte `_reconcilePlaybackProcessesAtInit()`-Methode laufen; deren Controller-Reconciliation ist ein inert gemocktes Ergebnis. Damit wird die Startup-Orchestrierung geprüft, aber weder OS-Prozessscan noch PID-Kill. Keine echte MPV-, App-, Audio- oder LIVE-Aktion.
- Test-Cleanup schließt nur die temporäre SQLite-Verbindung und entfernt den eindeutigen Temp-Root. Keine Dateien wurden gestaged.

### Ergebnis

- Mein geforderter Node-22-Jest-Aufruf endete in der Worker-Sandbox vor Testsammlung mit `EPERM realpath`, 0 Tests; danach keine Alternativversuche.
- **Unabhängige CEO-Wiederholung bestanden:** `runtime\node\node.exe app\node_modules\jest\bin\jest.js --config app\jest.config.js --runInBand --no-cache --runTestsByPath app\test\music-bot-safety-profile-init-lock.test.js`; 1 Suite / 1 Test PASS, Exit 0, keine Prozess-/Audioausgabe.

### Status getrennt

- **Geprüft und bestanden:** persistierter Profil-Lock wird beim echten Plugin-Init geladen; Startup fordert genau einen inert gemockten `emergencyStop(savedReason)` an; kein Unlock, Playback, Engine-/Spawn-Aufruf oder Prozessregistry-Konstruktor.
- **Teilweise geprüft:** `init()`-Lock-Orchestrierung unter sicheren Inert-Stubs. Mein Runner war durch Sandbox-`EPERM` blockiert; unabhängiger CEO-Runner bestätigte den Test.
- **Nicht geprüft / offen:** reale OS-Prozess-Reconciliation/Prozesskill, echter `emergencyStop`, echte MPV-/Audioausgabe und App-Integration. Safety-Unlock und Reset waren nicht Teil des Tests.

### Punkt 1 — MPV graceful-shutdown Kandidat (2026-10-07)

- Befund aus current-HEAD `0b4401d1765c446471d7e3956752bd7676c5da33`: `PlaybackEngine.shutdown()` schloss den IPC-Socket, bevor es MPV beenden konnte, und griff dann auf harten owned-PID-Taskkill zurück. `PlaybackController.shutdown()` startete die markierte Prozessbereinigung parallel zum Slot-Shutdown; dadurch konnte Registry-Cleanup das eigene MPV vor dem regulären `quit` beenden.
- Read-only Dirty-Tree-Review: bestehende Music-Bot-Hunks in `soundbot-process-registry.js`, Command-Parser, Overlay/Locales sowie `music-bot-playback-mpv-integration.test.js` blieben unangetastet. Die sauberen Zielmodule `playback-engine.js` und `playback-controller.js` wurden nur in einem isolierten Kandidaten geändert.
- Kandidat `docs/coordination/output/mpv-graceful-shutdown-0b4401d/`: bestätigtes IPC-`quit`, bounded Child-close-Wait, nur registrierte eigene PID als Fallback; Controller wartet mit Registry-Scan bis Slot-Shutdown abgeschlossen ist. Neue Regressionen prüfen Quit-Ack/Cleanup, unowned refusal und geordnete Registry-Reihenfolge.
- Unit-Verifikation: 2 Suiten, 86/86 Tests bestanden. Null-Audio-MPV-Verifikation mit echten lokalen stillen WAV-Fixtures: 1 Suite, 2/2 Tests, Exit 0. Prozessbelege: Stop-PID 7560 Exit 0; Replacement-PIDs 27492 und 27124 Exit 0; alle owned sets leer, IPC-Pfad entfernt, Tempfixture nach jedem Test entfernt. `audioOutputDriver: null`; kein Hörtest, Profil, Provider oder Live-Verbindung.
- Noch nicht integriert: CEO verlangte Resultat/Dateien/Tests vor Integration. Kandidatenpatch und Hashmanifest sind vorbereitet; aktuelle fremde Music-Bot-Hunks bleiben unberührt.

## CEO-Folgeauftrag: MPV Safety-Lock Reconciliation – Vorabblocker (2026-10-07)

### Präziser geplanter Testablauf (nicht ausgeführt)

1. Mit der echten `SoundbotProcessRegistry.findMarkedProcesses()` read-only CIM-Abfrage vor Start Markerprozesse suchen; nur bei erfolgreichem Scan und exakt null Treffern fortfahren.
2. Eine einzelne absolute `mpv.exe` direkt mit `--idle=yes`, `--no-config`, `--ao=null`, `--volume=0`, exaktem `--title=ltth-soundbot-mpv-v1` und einer eindeutigen `--input-ipc-server=\\.\pipe\ltth-soundbot-mpv-v1-<uuid>` Signatur starten; PID sofort erfassen.
3. Erneut mit echter Registry scannen und exakt diese eine PID/Signatur verlangen. Bei jedem zusätzlichen Treffer sofort abbrechen und ausschließlich den eigenen Prozess per IPC `quit` beenden.
4. Reale `PlaybackController.reconcileProcesses()` mit gesetztem `safetyLock=true` ausführen; Assertions: `detected=[testPid]`, `killed=[testPid]`, `remaining=[]`, Prozess beendet, Folgescan leer. Cleanup-Guard darf nur exakt den festgehaltenen Test-PID terminieren; zusätzliche Marker verhindern echte Cleanup-Delegation. Keine Default-Audio-, Netzwerk-, Resolver-, TikTok- oder Apppfade.
5. Integrationstest wäre eigene opt-in Datei; normale Jest-Runs dürften keinen MPV-Prozess starten.

### Tatsächlicher Befund / Blocker

- `mpv.exe` ist vorhanden unter `C:\ProgramData\chocolatey\lib\mpvio.install\tools\mpv.exe`.
- Die notwendige reale Registry-Vorabfrage scheiterte bereits vor jeglichem MPV-Start: `SoundbotProcessRegistry.findMarkedProcesses({ timeoutMs: 5000 })` lieferte `SOUNDBOT_PROCESS_SCAN_FAILED`; PowerShell `Get-CimInstance Win32_Process` endete mit Exitcode 1 (`kein Zugriff auf eine CIM-Ressource`). Damit ist „kein fremder Markerprozess läuft“ nicht nachweisbar.
- Der Quellpfad bestätigt das Schadenspotenzial eines unsicheren Fortsetzens: Bei `safetyLock=true` behandelt der echte Controller jeden Marker als unerwartet; `reconcileProcesses()` fordert dann `emergencyStop()` an, dessen Cleanup die Registry nach Markern scannt und terminieren kann. Ohne belastbare CIM-/PID-Sicht ist keine sichere OS-Prozessabnahme möglich.
- **Abbruch:** kein MPV gestartet, keine echte Controller-Reconciliation, kein `cleanupMarked`, keine PID beendet oder geändert. Keine neue Integrationstestdatei angelegt, weil die geforderte sichere Vorbedingung nicht erfüllbar war. Die Registry-/Controller-Produktdateien und vorhandene MPV-Tests blieben unangetastet.

### Status

- **Teilweise geprüft:** Marker-/IPC-Signatur, Registry-CIM-Scan und Controller-Cleanup-Kette statisch gelesen; MPV-Datei vorhanden.
- **Blockiert:** CIM-Vorabscan hat keinen verwertbaren Prozessbestand geliefert; fremde Marker können nicht ausgeschlossen werden.
- **Nicht geprüft:** echte MPV-Erkennung, Reconciliation/Kill der Test-PID, PID-Nichtveränderung fremder Prozesse und Cleanup per IPC.
- **Nächster notwendiger Schritt:** eine Umgebung, in der der unveränderte Registry-`Get-CimInstance`-Scan zuverlässig lesend funktioniert. Erst nach erfolgreichem Nulltreffer-Preflight kann der eng begrenzte opt-in Test gestartet werden.
- Patch-Kandidatencheck (historisch): `git apply --check` war gegen den früheren gemeinsamen Stand `0b4401d` erfolgreich. Der aktuelle gemeinsame HEAD ist inzwischen weitergelaufen; erneute Applyability-Prüfung gegen das Integrationsziel steht aus. Patch nicht angewendet; CEO-Prüfung vor Integration ausstehend. Vollständiger Befund, Prozess-IDs und Logs: `docs/coordination/output/mpv-graceful-shutdown-0b4401d/REPORT.md`.

## CEO-Folgeauftrag: Music-Bot-Steuerungsrouten gegen MPV Null-Audio (2026-10-07)

### Befund und Änderungen

- Die bestehenden Seek-/Volume-Tests rufen Handler direkt mit Response-Fixtures auf; vorhandene MPV-Integration deckt den kombinierten Routenablauf für Pause, pausierten Seek, Lautstärke, Resume/Heartbeat und Stop nicht vollständig ab.
- Neue separate Opt-in-Regression: `app/test/music-bot-control-routes-mpv-optin.test.js`. Nur `LTTH_RUN_MUSIC_BOT_NULL_MPV=1` und installiertem MPV werden Test und Prozess gestartet; ohne Opt-in wird Jest den Test überspringen.
- Fixture: stille lokale WAV in eindeutigem Temp-Verzeichnis, SQLite `:memory:`, eigene Plugin-/Queue-/PlaybackController-Instanzen, registrierte Route-Handler direkt ohne App-Server. Resolver-Spy wirft bei Aufruf; gestarteter Child muss `--ao=null` führen.
- Assertions umfassen Queue-Play, Pause, Seek bei pausiertem Zustand (bleibt pausiert), Volume-Persistenz und MPV-IPC-Eigenschaft, Resume/Heartbeat/GetPosition sowie Clear/Stop. Cleanup-Assertions prüfen Prozessende, leeres owned-PID-Set, geschlossene In-Memory-DB und entferntes Temp-Verzeichnis.
- Kein Produktcode und keine vorhandene Testdatei geändert. Kein Netzwerk, Resolverlauf, Default-Audio, App-/TikTok-/LIVE-Pfad.

### Verifikation und Status

- Syntaxcheck (`runtime\node\node.exe --check ...`) und `git diff --check` bestanden.
- Eigener Jest-Aufruf drei Mal durch Worker-Sandbox-`EPERM realpath` vor Testsammlung blockiert; 0 Tests in diesen Versuchen.
- CEO-Wiederholung in der funktionierenden Runnerumgebung: **1 Suite / 1 Test PASS, Exit 0**. Tatsächliche Route-Play → MPV Null-AO → Pause → paused seek → persistierte Volume-Änderung und IPC-Wert → Resume/Heartbeat/GetPosition → Clear/Stop bestätigt. Eigner MPV-PID `29232` freigegeben; temporäre DB und Fixturedateien bereinigt.
- Die Stop-Route endet derzeit mit MPV Exitcode 1 über den Taskkill-Fallback. Damit ist Steuerungs-/Cleanup-Verhalten geprüft, aber geordneter MPV-Abschluss nicht erfüllt. Das deckt sich mit dem separaten Graceful-Shutdown-Befund; dessen Kandidatenpatch wartet weiter auf CEO-Abnahme und wurde hier nicht angewendet.

### Status getrennt

- **Behoben und geprüft:** Regressionstest hinzugefügt; CEO-Lauf bestand und belegte tatsächliche null-audio-Routensteuerung sowie eigene PID-/Temp-/DB-Bereinigung.
- **Teilweise geprüft:** Worker-Jest selbst war durch `EPERM realpath` blockiert; unabhängiger CEO-Lauf bestätigte denselben Test. Stop beendet und bereinigt den eigenen MPV, jedoch aktuell nicht graceful (Exitcode 1).
- **Blockiert:** integrierter/geordneter Stop bleibt bis Prüfung und Integration der separaten Graceful-Shutdown-Korrektur offen.
- **Nicht geprüft:** Default-Audio oder reale Hörbarkeit (bewusst ausgeschlossen); App-Server-, LIVE- und TikTok-Integration (außerhalb des Auftrags).
- **Geänderte Dateien dieses Auftrags:** `app/test/music-bot-control-routes-mpv-optin.test.js` und dieser Koordinationsbericht. Vorhandene dirty MPV-Integration und Music-Bot-Produktpfade blieben unverändert.

### MPV graceful-shutdown Kandidat: nicht-scannende Registry im Null-Audio-Test (2026-10-07)

- CEO-Review fand korrekt, dass das erste Kandidatenfixture ohne `processRegistry` den echten `SoundbotProcessRegistry` instanziierte. Das wäre wegen des fehlgeschlagenen CIM-Scans nicht sicher gewesen.
- Isoliertes Fixture korrigiert: Controller injiziert ausschließlich eine eigene Registry mit inertem `register`/`unregister`, leerem `findMarkedProcesses` und leerem `cleanupMarked`. Assertions bestätigen, dass der systemweite Scan nie aufgerufen wird; der Unit-Test des Controller-Cleanup-Orderings bleibt separat zuständig.
- Verifikation nach Korrektur: isolierte Null-Audio-MPV-Suite 1/1 Suite, 2/2 Tests PASS. Stop-PID 13496 Exit 0; Replacement/Shutdown-PIDs 4468 und 27456 Exit 0. Owned-PIDs freigegeben; IPC- und Temp-Fixtures entfernt. Erste Wiederholung fand eine zu früh platzierte Cleanup-Assertion; nach Verschieben auf den Cleanup-Abschluss bestanden beide Tests.
- Candidate manifest und Patch aktualisiert. `git apply --numstat` liest alle fünf Patch-Hunks; keine Änderungen in gemeinsame Produktdateien übernommen. Da HEAD inzwischen `e4be68b` ist, ist Applyability für dieses Ziel noch nicht geprüft.
- **Behoben und geprüft:** Gefahr einer echten OS-weiten Markerbereinigung im Testfixture durch injizierte No-Scan-Registry beseitigt; Tests belegen graceful Exit und sichere Fixture-Bereinigung.
- **Teilweise geprüft:** zwei MPV-Null-Audio-Szenarien bestanden; dieser Test beweist ausdrücklich keine echte Registry-Reconciliation.
- **Blockiert/offen:** Patch-Integration erfordert CEO-Review und erneute Applyability-Prüfung gegen das gewünschte Ziel; echte CIM-Reconciliation bleibt am bestehenden Windows-CIM-Zugriffsfehler blockiert.
- **Nicht geprüft:** Default-Audio, Nutzerprofil/App/LIVE, echte Prozesslisten/Registry-Bereinigung, Provider/Netzwerk.
- Bericht, vollständiger Kandidat, Logs und Hashes: `docs/coordination/output/mpv-graceful-shutdown-0b4401d/REPORT.md` und `candidate-manifest.json`.

## CEO-Abgleich — Music Bot / Priorität 1 (2026-10-07)

### Behoben und geprüft

- MusicResolver ignoriert yt-dlp-Benutzerkonfiguration (`--ignore-config`), damit fremde Cookies-/Profilkonfiguration die Such-/URL-Auflösung nicht unbemerkt verändert. Commit `f58309616`; CEO-Verifikation: 2 Suiten / 31 Tests bestanden.
- Opt-in Queue-/Steuerungsrouten→echter MPV-Test in Commit `e4be68b08`: CEO-Lauf Play, Pause, paused seek, Lautstärke, Resume/Heartbeat/Position und Clear mit lokaler stiller WAV, `audioOutputDriver='null'`, Resolver fail-if-called. Der Clear-MPV endete vor Shutdown-Fix mit Exitcode 1; PID/DB/Temp wurden bereinigt.
- Graceful Shutdown in Commit `705c92d1e466189ab3a0e18e6cdeed1d808db939`: normale Stop-/Clear-, Trackwechsel- und Controller-Shutdown-Pfade beenden den jeweils eigenen MPV per IPC mit Exitcode 0. CEO-unabhängiger gemeinsamer Lauf: 4 Suiten / 89 Tests bestanden; Route-PID 32528, Stop-PID 17240, Replacement-PID 28108 und Shutdown-PID 20796 jeweils sauber freigegeben. Die neue Null-Audio-Suite injiziert eine nicht-scannende Registry; es gab keinen OS-weiten CIM-Prozessscan.
- Der Nutzer bestätigte „hab gehört“ für genau die bereits abgespielte synthetische Testsequenz. Das ist eine Hörbestätigung für diese Sequenz; keine weitere Hörprobe wurde daraus autorisiert.

### Teilweise geprüft / offene Gates

- **Cross-Profile-Isolation:** Der zuletzt abgeschlossene Auftrag im Profile-Chat lieferte nur Read-only-Quellanalyse und ausdrücklich keinen Testlauf. Damit fehlt weiterhin der angekündigte praktische Zwei-Profil-Nachweis. Die Analyse fand im regulären Loaderpfad kein belegtes geteiltes Konfigurationsobjekt; ein Rest-Risiko bei manuell vor `init()` konstruierten Instanzen wurde benannt. Das ersetzt den geforderten Test nicht.
- **Provider-/Rechte-Gate:** kein echter YouTube-/SoundCloud-Stream in MPV. Der Overlay-Worker stoppte vor einer externen Provideranfrage; offizielle Nutzungs-/API-Berechtigung für Direktstreaming ist nicht nachgewiesen. Lokale synthetische Fixtures bestätigen nur lokalen Resolver-/Queue-/MPV-Vertrag.
- **OS-Prozess-Reconciliation:** weiter blockiert durch `SOUNDBOT_PROCESS_SCAN_FAILED` / fehlenden Win32-CIM-Zugriff. Kein Safety-Lock-Bypass, kein echter systemweiter Prozessscan im MPV-Test und keine fremde PID verändert.
- **Status Priorität 1:** noch **nicht vollständig abgenommen**. Zusätzlich zu den Provider-/Rights- und OS-Reconciliation-Gates fehlt vor allem der praktische Cross-Profile-Test samt unabhängiger CEO-Prüfung. Prioritäten 2–6 bleiben dahinter.

### Artefakte / Hashes

- Graceful-Shutdown-Patchartefakt korrigiert: der neue Testhunk umfasst alle 149 Zeilen; `git apply --numstat` zeigt den vollständigen Hunk. Commit und Testbeleg: `docs/coordination/output/mpv-graceful-shutdown-0b4401d/REPORT.md`, `mpv-integration-jest.log`, `candidate-manifest.json`.
- SHA-256 Testfixture `app/test/music-bot-playback-graceful-mpv.test.js`: `79cb39f26a74cf93bc3d363ecc010445094018f165a8c8544856273f85ebeab6`.
- SHA-256 aktualisierter Patch: siehe `candidate-manifest.json` (Dateihash nach dieser Aktualisierung erneut eingetragen).

## CEO-Nachtrag — MPV und Profilreferenzen (2026-10-07)

### MPV-Abnahmebelege

- CEO-Lauf auf dem integrierten Stand: **9 Suiten bestanden / 96 Tests bestanden**, 1 zusätzlicher Opt-in-Test übersprungen. Im Lauf waren Controller/Registry, Graceful-MPV, Clear-Routen, Profil-Speicherisolation, Safety-Lock, Resolverconfig und Resolver→MPV enthalten. Die env-gated Loopback-HTTP→MPV-Fixture wurde separat mit Opt-in ausgeführt: **1 Suite / 1 Test PASS**. Das beweist nur den lokalen synthetischen HTTP-Stream, keine Provider-URL.
- Default-Audio-Testton: 2,3 Sekunden, MPV Volume 60, eigener Prozess Exit 0 und Tempdaten bereinigt (PIDs 29804 und 2476 in zwei kontrollierten Läufen). Der Nutzer bestätigte anschließend ausdrücklich „hab gehört“. Die Bestätigung gilt für diese synthetische Testton-Wiedergabe; keine weitere Wiedergabe wird daraus abgeleitet.

### Profilreferenzen: Reproduktion und Fix

- Der CEO führte vor dem Fix den gezielten roten Lauf aus: **2 Suiten fehlgeschlagen, 3 neue Assertions rot, 30 bestehende Tests grün**. Befunde: direkt konstruierte MusicBotPlugin-Instanzen teilten das `queue`-Defaultobjekt; zwei MusicResolver-Fälle (ausgelassene bzw. partielle Moderation) teilten `blockedKeywords`.
- Fix und gezielte Regressionen sind in Commit `3f4314682` gesichert: defensives Klonen der `DEFAULT_CONFIG`-Unterobjekte im Plugin-Konstruktor und Kopieren der Resolver-Standardliste, ergänzt um die beiden fokussierten Tests. Unabhängige CEO-Nachprüfung danach: **2 Suiten / 33 Tests PASS**.
- Der echte Zwei-Profil-SQLite-/PluginAPI-Test `app/test/music-bot-profile-storage-isolation.test.js` war im separaten 9-Suiten-Lauf enthalten und bestand dort. Damit sind Testprofile, Konfiguration, Queue/Requester und Plugin-Datenpfade unter synthetischen Fixtures geprüft; kein produktiver Profilwechsel oder aktives Profil wurde verwendet.

### Weiter offene Gates / Status Priorität 1

- **Provider-Rechte offen:** Es wurde keine YouTube-/SoundCloud-Provider-URL in MPV abgespielt. Die getrennten lokalen WAV-/Loopback-Belege ersetzen diesen Nachweis nicht; offizieller erlaubter Playbackpfad/Rechtefreigabe muss vor einem solchen Lauf feststehen.
- **OS-Prozess-Reconciliation blockiert:** globaler `SoundbotProcessRegistry`-CIM-Scan bleibt wegen `SOUNDBOT_PROCESS_SCAN_FAILED`/Win32-CIM-Zugriff offen. Die sicheren MPV-Fixtures injizieren eine nicht-scannende Registry und umgehen den Safety Lock nicht.
- **Priorität 1 bleibt offen** bis Provider-/Rights-Gate und sichere Prozess-Reconciliation entschieden/abgenommen sind. Prioritäten 2–6 werden weiterhin nicht vorgezogen.
- Kein Produktivprofil, fremder MPV-Prozess, App-Start, TikTok-/Liveaktion oder Publishing.

## CEO-Folgeauftrag — Queue-Handler Default-Audio-Test (2026-10-07)

- Neue separate Datei: `app/test/music-bot-queue-handler-audible-optin.test.js`. Der eine Test beschreibt synthetische 2-Sekunden-440-Hz-WAV → Music-Bot-Queue → `_playNextFromQueueInternal()` → echten MPV mit Default-Audiogerät (`audioDevice=auto`, kein `--ao=null`). Er prüft Queue-Entnahme/Trackidentität, echten MPV-Fortschritt via IPC, eigene PID/Exit 0 und Temp-/DB-Cleanup.
- Opt-in ist ausschließlich `LTTH_RUN_MUSIC_BOT_AUDIBLE_TEST=1`; ohne Opt-in wird der Test vor seinem Callback übersprungen. Die injizierte Registry stellt nur `register`/`unregister` bereit und besitzt weder `findMarkedProcesses` noch `cleanupMarked`; Shutdown wird explizit mit `{ reconcileOrphans: false }` ausgeführt.
- Tatsächlich geprüft wurde nur der konkrete Test bei nicht gesetztem Opt-in: **1 Suite skipped, 0 Tests gestartet**, Exit 0. Ein regulärer Node-Syntaxcheck und Whitespace-Scan bestanden. Es gab bei diesem Auftrag keine MPV-/Audioausführung und keinen Prozessinventar-Scan.
- Hash Testdatei nach explizitem No-Reconcile-Shutdown: `270b56f0015138ccf7ed618ac2b0ac84d8d2df72974846a1ca8279fe517a4ad5` (150 Zeilen).
- **Teilweise geprüft:** Opt-in-Gate und Skipped-Verhalten sind praktisch belegt; der echte Queue-Handler-/Default-Audiopfad ist als isolierter Test vorbereitet, aber nicht ausgeführt.
- **Offen:** kein Nachweis, dass dieser neue Queue-Handler-Aufruf tatsächlich hörbar bis MPV läuft; dafür ist eine separate Ausführung mit Opt-in erforderlich. Provider-URL-/Rechte-Gate und globale CIM-Reconciliation bleiben ebenfalls offen. Kein neuer Hörtest wurde durch dieses Artefakt autorisiert.
- Geänderte Dateien dieses Folgeauftrags: `app/test/music-bot-queue-handler-audible-optin.test.js` und dieser Fortschrittsbericht. Keine bestehenden MPV-Testdateien oder Produktquellen geändert; kein Commit.

## CEO-Nachtrag — Music-Bot-Lifecycle-Kontext (2026-10-07)

### Befund und Umsetzung

- `5124aa798` (`Limit orphan MPV cleanup to app shutdown`) begrenzt die Suche/Bereinigung verwaister MPV-Prozesse auf den App-Shutdown-Kontext. Ein reguläres Plugin-Unload fährt weiterhin nur die eigenen Slots kontrolliert herunter.
- `3165ebb27` (`Pass app shutdown context to plugin unload`) übergibt beim Herunterfahren der Anwendung `{ reason: 'application-shutdown' }` an den Plugin-Loader. Erst dieser Kontext veranlasst Music Bot, beim Destroy `shutdown({ reconcileOrphans: true })` aufzurufen. Damit wird ein gewöhnliches Plugin-Unload nicht als globale Prozessbereinigung interpretiert.
- Unabhängige CEO-Prüfung des Lifecycle-Stands: **4 Suiten / 126 Tests PASS** (Playback Controller, Prozess-Registry, Safety Runtime, Plugin-Lifecycle-Routen). `safety-profile-init-lock` war zuvor separat mit Node 22 PASS geprüft worden.

### Status getrennt

- **Behoben und geprüft:** App-Shutdown und gewöhnliches Plugin-Unload tragen unterscheidbaren Kontext; die vier genannten Lifecycle-Suiten bestanden laut CEO-Lauf.
- **Teilweise geprüft:** `app/test/music-bot-route-resolve-queue-null-mpv-optin.test.js` ist als lokale Route→Resolver→Queue→MPV-Null-Audio-Fixture angelegt, aber das Opt-in wurde nicht gestartet. Vorherige Jest-Sammlung war durch `EPERM` blockiert; Syntax-/Skip-Prüfungen belegen keine MPV-Ausführung.
- **Nicht geprüft:** Der Queue-Handler-Default-Audio-Test in `app/test/music-bot-queue-handler-audible-optin.test.js` wurde nur ohne Opt-in als übersprungen bestätigt. Es gab dabei keine neue Audiowiedergabe; die frühere Hörbestätigung gilt ausschließlich der damaligen Testton-Sequenz.
- **Blockiert/offen:** Provider-Rechtefreigabe für externe Streams und systemweite CIM-Prozess-Reconciliation bleiben offen. Priorität 1 ist daher nicht vollständig abgenommen; Prioritäten 2–6 bleiben unangetastet.

### Dateien und Prüfgrenzen

- Lifecycle-Produktänderungen und Regressionen liegen in den beiden genannten Commits; der unabhängige CEO-Lauf deckte die vier Lifecycle-Suiten ab.
- In diesem Nachtrag wurde nur `docs/coordination/prioritaeten-fortschritt.md` geändert. Die beiden Opt-in-Testdateien wurden nicht ausgeführt oder verändert. Kein App-Start, kein Produktivprofil, keine fremde Prozessbereinigung, keine TikTok-/LIVE-Aktion und kein Publishing.

### Offene CEO-Entscheidungen (2026-10-07)

- Zur Fortsetzung der echten MPV-Abnahme habe ich den CEO um eine konkrete Rechteentscheidung gebeten: eine benannte, nachweislich erlaubte Testquelle samt Abrufweg oder Bestätigung, dass P1 bis dahin auf lokale Fixtures begrenzt bleibt. Keine externe Quelle wird vor dieser Festlegung verwendet.
- Der CEO-Chat ist laut aktuellem Snapshot noch aktiv. Dort wurde parallel nach einer erneuten Lautsprecher-Hörprobe gefragt; ich habe klargestellt, dass die frühere Zustimmung nur eine bereits abgeschlossene Wiedergabe abdeckte und ein weiterer hörbarer Lauf eine neue ausdrückliche Freigabe braucht. Bis dahin kein Default-Audio-Opt-in.
- Ich greife nicht in die laufenden CEO-Prüfungen der getrennten MPV-Fixtures ein. Eine Null-AO-Prüfung bleibt ohne hörbare Ausgabe möglich.

## CEO-Abnahme — Graceful-MPV-Integration mit explizitem App-Shutdown (2026-10-07)

- Nach der Korrektur der beiden App-Shutdown-Aufrufe führte der CEO unabhängig dieselbe einzelne Suite `app/test/music-bot-playback-graceful-mpv.test.js` erneut aus: **1 Suite / 2 Tests PASS**.
- Die echte MPV-Null-Audio-Ausführung deckte Stop, Track-Replacement und Shutdown ab. Eigene MPV-Prozesse endeten mit Exitcode 0; Owned-PID-Sets waren leer; IPC- und Temp-Fixtures wurden entfernt.
- Die Suite injiziert eine lokale Fake-Registry. `findMarkedProcesses` wurde nicht aufgerufen; `cleanupMarked` erfasste nur den vorgesehenen Fake-Aufruf. Es fand kein OS-weites PID-Inventar oder CIM-Scan statt.
- **Behoben und geprüft:** Die Regression prüft den App-Shutdown-Vertrag nun mit `shutdown({ reconcileOrphans: true })`; reguläres Plugin-Unload bleibt davon getrennt. Lokaler Lauf und unabhängige CEO-Wiederholung bestanden jeweils mit 1 Suite / 2 Tests.
- **Nicht geprüft:** Default-Audio, Provider-Playback und echte globale Prozess-Reconciliation. Laut CEO-Entscheidung bleibt die MPV-Abnahme auf lokale/synthetische Fixtures begrenzt, bis eine nachweislich lizenzierte Quelle samt Abrufweg benannt ist. Priorität 1 bleibt offen; Prioritäten 2–6 bleiben unangetastet.
- In diesem Folgeauftrag wurde ausschließlich dieser Fortschrittsbericht ergänzt. Kein Produktcode-/Teständerung in diesem Schritt und kein Commit.

## P1 — Music-Bot-MPV-Test-Safety-Matrix (Read-only, 2026-10-07)

- **Default-CI:** `.github/workflows/backend-ci.yml` nutzt `ubuntu-latest` mit Node 20/22 und `npm test -- --runInBand --forceExit`. Jest sammelt `**/test/**/*.test.js`. Im Workflow werden keine Music-Bot-MPV-Opt-in-Variablen gesetzt; die Windows-MPV-Pfade existieren dort nicht. Damit startet reguläres CI keine MPV-Instanz und keine hörbare Wiedergabe.
- **Pfadgebundene Null-AO-Fälle auf Windows:** `music-bot-playback-mpv-integration.test.js` enthält fünf Fälle, `music-bot-playback-graceful-mpv.test.js` zwei und `music-bot-resolver-playback-mpv.test.js` einen. Sie können bei vorhandener MPV-Datei durch normales Jest laufen und starten reale, aber stille MPV-Prozesse mit `audioOutputDriver: 'null'`. Im ersten File verwendet der Controller die Standard-Registry, aber `shutdown()` bleibt beim Default `reconcileOrphans: false`; es gibt dort keinen Orphan-Scan.
- **Explizite Null-AO-Opt-ins:** `music-bot-control-routes-mpv-optin.test.js` und `music-bot-route-resolve-queue-null-mpv-optin.test.js` verlangen `LTTH_RUN_MUSIC_BOT_NULL_MPV=1` plus MPV-Datei. `music-bot-loopback-stream-mpv.test.js` verlangt `LTTH_RUN_LOOPBACK_MPV_STREAM_TEST=1` und prüft den MPV-Pfad im Test. Alle drei verwenden lokale Fixture-Eingaben und Null-AO; Registry-Aufrufe sind injizierte Fakes bzw. der Shutdown läuft ohne Orphan-Reconciliation.
- **Hörbare Opt-ins:** `music-bot-playback-mpv-integration.test.js` und `music-bot-queue-handler-audible-optin.test.js` verlangen beide `LTTH_RUN_MUSIC_BOT_AUDIBLE_TEST=1`. Beide wählen Default-Audio für synthetische lokale Töne. Die gemeinsame Variable aktiviert beide Tests bei einem vollständigen Jest-Lauf. Kein solcher Lauf wurde im Safety-Matrix-Auftrag gestartet.
- **Prozessbereinigung:** Die Graceful-MPV-Suite fordert `reconcileOrphans: true`, injiziert dafür aber eine Fake-Registry; der Fake-`cleanupMarked`-Aufruf wird geprüft und `findMarkedProcesses` bleibt unaufgerufen. Die Prozess-Registry-Unit-Suite mockt `child_process.spawn` bzw. injiziert Scanner und Terminator. Controller- und Scan-Budget-Suites verwenden Fake-Engines/Provider. In den geprüften Fällen fand keine echte systemweite Prozessinventur oder -bereinigung statt.
- **Einschätzung:** Keine hörbare Default-Jest-Ausgabe und keine echte globale Prozessbereinigung gefunden. Auf Windows mit MPV-Datei sind acht stille MPV-Starts im normalen Jest-Lauf möglich; sie sind nicht per Env opt-in geschützt. Standard-CI bleibt wegen Linux-Runner und fehlender MPV-Datei davon ausgenommen. Das gemeinsame Hörtest-Env ist die einzige erkennbare unbeabsichtigte Mehrfachausführungsgefahr bei aktivem Opt-in.
- **Prüfgrenze:** Nur Testquellen, Jest-Konfiguration, Workflow und Controller-Defaults gelesen. Keine Tests ausgeführt, keine Prozesse inventarisiert oder geändert. Der Safety-Matrix-Auftrag ändert P1-Abnahme nicht; Prioritäten 2–6 bleiben unangetastet.

## P1 — Bereinigter Profil-/manueller Serverneustart (2026-10-07)

- **Befund:** `serverRestartCoordinator` schloss bisher DB und HTTP-Server und beendete den Prozess mit Code 75, ohne geladene Plugins mit dem Kontext `application-shutdown` zu entladen. Dadurch lief Music Bots `destroy()` beim Profil-/manuellen Neustart nicht garantiert vor DB-Schluss; Queue-Persistierung und MPV-Shutdown waren auf diesem Pfad nicht gesichert.
- **Umsetzung:** Der Coordinator entlädt geladene Plugins in umgekehrter Ladereihenfolge innerhalb eines Gesamtzeitlimits und startet den Force-Exit-Timer erst nach erfolgreichem Cleanup. Bei `false`, Fehler oder Timeout bricht er fail-closed ab, ohne DB-/HTTP-Schluss oder Exit 75. `server.js` übergibt den bestehenden PluginLoader und zeigt den Fehler als `restartFailure`; der Restart-Zustand bleibt sichtbar, weil ein Teilcleanup möglich ist. Launcher-Vertrag mit Exitcode 75 bleibt bestehen.
- **Geänderte Dateien:** `app/modules/server-restart-coordinator.js`, `app/server.js` (nur Dependency-Wiring neben bestehenden unabhängigen Änderungen), `app/test/server-restart-coordinator.test.js` sowie dieser Statusbericht.
- **Tests:** Zuerst schlug die neue Regression gegen den alten Coordinator erwartungsgemäß fehl (kein Plugin-Unload). Danach bestanden `server-restart-coordinator` und `profile-restart-flow`: 2 Suiten / 13 Tests. `git diff --check` für die gezielten Dateien war sauber.
- **Verbleibende Risiken/offene Entscheidungen:** Ein Cleanup-Timeout lässt den Prozess absichtlich weiterlaufen und hält DB/HTTP offen; der Neustart bleibt sichtbar als unvollständig und wird nicht automatisch erneut versucht. `PluginLoader.unloadPlugin()` entfernt eine Plugininstanz auch bei Cleanup-Fehlern aus seiner Map, sodass bereits teilweise entladene Instanzen nicht sicher erneut bereinigt werden können. Ein verspätet endender `destroy()` kann nach dem Abbruch noch abschließen, löst aber keinen späteren Exit 75 aus. Kein App-/MPV-Start und keine Prozessinventur in diesem Auftrag.
- **Status getrennt:** **Behoben und geprüft:** Plugin-Shutdown-Reihenfolge und fail-closed Timeout-/Fehlerpfade in Fake-Timer-Tests. **Teilweise geprüft:** tatsächliche Music-Bot-Integration auf diesem Restartpfad wurde nicht gestartet. **Blockiert/offen:** P1 bleibt bis zu den separaten Music-Bot-Abnahmen offen. **Nicht geprüft:** reale Profile, MPV-Prozesse, Default-Audio, Provider-Playback; Prioritäten 2–6 nicht bearbeitet.

## P1 — Null-Audio-MPV-Tests nur per Opt-in (2026-10-07)

- **Änderung:** Die acht stillen, pfadgebundenen MPV-Prozesstests in `music-bot-playback-mpv-integration.test.js` (5), `music-bot-playback-graceful-mpv.test.js` (2) und `music-bot-resolver-playback-mpv.test.js` (1) starten nur noch mit `LTTH_RUN_MUSIC_BOT_NULL_MPV=1`, Windows und vorhandener MPV-Datei. Der hörbare Fall in der Integration-Suite bleibt ausschließlich an `LTTH_RUN_MUSIC_BOT_AUDIBLE_TEST=1` gebunden.
- **Default-Prüfung:** Alle drei Suiten ohne beide Variablen: **3 Suiten skipped / 9 Tests skipped**. Die neun sind acht Null-Audio-Prozesstests plus der separate Hörtest; kein Testcallback läuft, daher startet dieser Jest-Lauf keinen MPV-Prozess.
- **Opt-in-Prüfung:** Dieselben drei Suiten mit ausschließlich `LTTH_RUN_MUSIC_BOT_NULL_MPV=1`: **3 Suiten / 8 Tests PASS**, 1 hörbarer Test skipped. Alle acht Null-AO-MPV-Prozesse endeten mit Exitcode 0, Owned-PID-Sets waren leer; temporäre Dateien wurden entfernt. Resolver-/Graceful-Fixtures nutzten Fake- bzw. nicht-scannende Registries; keine OS-weite Prozesssuche.
- **Zusätzliche lokale Kette:** `music-bot-route-resolve-queue-null-mpv-optin.test.js` bestand separat mit 1 Suite / 1 Test: lokale WAV über Route→Resolver→Queue zu owned Null-AO-MPV, Exitcode 0 und Cleanup.
- **Prüfgrenze:** Stille WAV-Fixtures; kein Default-Audio, externer Provider, Produktivprofil, App oder Liveaktion. Der Standard-Windows-Jest-Lauf startet diese acht MPV-Tests nicht. Provider-/Rights-Gate und sichere reale Orphan-Reconciliation bleiben für P1 offen.
- **Geänderte Dateien:** die drei genannten Testdateien und dieser Fortschrittsbericht. Kein Produktcode, Commit oder Push.

## P1 — Restartfehler im Profilstatus ehrlich ausweisen (2026-10-07)

- `/api/profiles/active` behält `activeProfile` als aktuell geladene Laufzeitinstanz und `pendingProfile` als Ziel aus der Active-Profile-Datei getrennt. Bei fehlgeschlagenem Plugin-Cleanup ergänzt die API `restartState: 'blocked-cleanup'` und einen sanitisierten, stabilen Fehler `{code:'PLUGIN_CLEANUP_BLOCKED', message:...}`; Grund und Stackdetails bleiben intern.
- Ein nachfolgender `POST /api/server/restart` liefert bei dieser Blockade HTTP 503, `success:false`, `restartScheduled:false` und denselben Fehlercode, ohne einen neuen Schedule-/Cleanupversuch. Der Coordinator-Latch bleibt unverändert fail-closed. Der ursprüngliche Profilwechselrequest wird nicht nachträglich als Erfolg dargestellt; Active- und Pending-Profil bleiben unterscheidbar.
- Tests: tatsächliche Handler aus `server.js` in isolierter VM mit Stub-Abhängigkeiten geprüft; Koordinator-Doppelversuch ausgeschlossen. `server-restart-blocked-cleanup-api`, `server-restart-coordinator` und `profile-restart-flow`: **3 Suiten / 17 Tests PASS**. Node-Syntax und `git diff --check` für geänderte Dateien PASS.
- Dateien: `app/server.js`, `app/test/server-restart-blocked-cleanup-api.test.js`, `app/test/server-restart-coordinator.test.js` sowie dieser Bericht. Keine App-/Profilstarts, kein Commit/Push.
- Offen: Recovery nach Plugin-Cleanup-Fehler bleibt absichtlich gesperrt; ein späterer App-Prozessstart ist nötig. Die separate UI-Reaktion auf `restartState`/`restartFailure` wird vom CEO-Fachagenten geprüft. P1 bleibt offen; P2–P6 unangetastet.
- **Unabhängiges CEO-Replay:** Der CEO wiederholte `server-restart-blocked-cleanup-api`, `server-restart-coordinator` und `profile-restart-flow`: **3/3 Suiten, 17/17 Tests PASS**; getrennte geladene/ausstehende Profile, sanitisiertes Fehlerobjekt und HTTP-503/false/no-schedule bestätigt. `server.js` Syntax und gezieltes `git diff --check` ebenfalls PASS. Keine Produktstarts.
- SHA-256 der neuen API-Regression `app/test/server-restart-blocked-cleanup-api.test.js`: `DBF9D59F3A4FEA5869131B323548CF62DA987205A828AADC56E6E6704B7A472A`.

## P1 — Music-Bot-Nachweismatrix (aktualisiert 2026-10-07)

| Fähigkeit / Gate | Aktuelle lokale Evidenz | Einordnung |
|---|---|---|
| **Audio** | Nutzer hat den 2,3-Sekunden-Testton bei Softwarevolume 60 als klar hörbar bestätigt. Nach aktuellem Orchestrierungshandoff war dies der synthetische Music-Bot-Queue-Handler-Testton über den Standardausgang. | **Hörbestätigt: synthetischer Queue→MPV-Ton.** Kein Provider-/Live-Track, keine akustische Sollpegelmessung. Der gespeicherte CEO-Handoff enthält noch eine ältere, widersprechende Zuordnung als direkten MPV-Ton; Synchronisierung angefragt. |
| **Queue** | `music-bot-playback-mpv-integration.test.js` spielte zwei lokale WAVs über QueueManager und zusätzlich über echten `_playNextFromQueueInternal()`-Handler/MPV. `music-bot-route-resolve-queue-null-mpv-optin.test.js` prüft Dashboard-Resolve/Request→Queue→MPV. | **Lokal praktisch geprüft mit echtem MPV, Null-AO.** Resolver in Routefixture kontrolliert; kein echter Provider. Zusätzlich separate synthetische Queue-Hörbestätigung, keine echte Musik. |
| **Suche** | `music-bot-resolver-concurrency.test.js` prüft echten `MusicResolver` mit Fake-Runner, normalisiertem `ytsearch5:`-Ziel und Ergebnisranking. Neue `music-bot-resolver-real-mpv-optin.test.js` verbindet echten Resolver und Queue mit kontrolliertem Runner, der synthetische JSON-Suchergebnisse zurückgibt und nur eine lokale WAV in den Cache kopiert. | **Resolvernormalisierung und Resolver→Queue→MPV lokal geprüft.** Nie echter yt-dlp-Prozess, Provider-/Netzwerkzugriff oder echte YouTube-/SoundCloud-URL geöffnet; Runner-/Suchantwort ist kontrolliert. Nur mit `LTTH_RUN_MUSIC_BOT_NULL_MPV=1`, Windows und MPV-Binary; ohne Flag: **1 Suite skipped**. |
| **Pause** | `music-bot-playback-mpv-integration.test.js` prüft echten MPV Pause/Resume; `music-bot-control-routes-mpv-optin.test.js` führt Pluginrouten Play→Pause→Resume durch. Beides mit Null-AO. | **Lokal praktisch geprüft mit echtem MPV/IPC, ohne hörbare Pause-/Resume-Ausgabe.** |
| **Seek** | Playback-Integration prüft Vorwärtsseek während Wiedergabe und Seek nach Pause am echten MPV; Control-Routenfixture prüft Seek im pausierten Zustand. | **Lokal praktisch geprüft mit echtem MPV/IPC, Null-AO.** |
| **Lautstärke** | Playback-Integration setzt Volume 37 und liest den MPV-Wert samt Vererbung beim Trackwechsel zurück. Separater Nutzer-Hörnachweis ist Volume 60 auf dem synthetischen Queue-Testton. | **Softwarewert/Trackwechsel praktisch geprüft; synthetischer Queue-Ton hörbestätigt.** Keine Providerlautstärke oder kalibrierte akustische Messung. |
| **Heartbeat** | `music-bot-playback-mpv-integration.test.js`, Resolver-/Queue- und Route-Opt-in-Fixtures lesen MPV-IPC-Position/Health am realen lokalen Player aus. | **Lokal praktisch geprüft mit echtem MPV/IPC, Null-AO.** Keine Providerverbindung. |
| **Sauberes Beenden** | `music-bot-playback-graceful-mpv.test.js` und Playback-Integration prüfen IPC-Quit, Stop, Replacement und Controller-Shutdown; Opt-in-Kinder enden mit Exitcode 0, Owned-PID-Sets werden leer, Tempdaten/DB geschlossen. | **Normaler MPV-Lifecycle lokal praktisch geprüft.** Kein LTTH-Hostcrash/Profilneustart mit lebendem MPV. |
| **Provider-/Broadcastrechte** | Kein YouTube-/SoundCloud-Track wurde real aufgelöst oder abgespielt. Der neue echte Resolver-Flow verwendet ausschließlich einen kontrollierten Fake-Runner. | **Nicht geprüft; Rechte- und erlaubter Abrufweg bleiben offene P1-Gates.** |
| **Hostcrash / Orphan-Reconciliation** | Echte MPV-Tests injizieren eine Fake-/nicht scannende Registry oder setzen `reconcileOrphans:false`; globale CIM/`ps`-Suche und Kill wurden nicht ausgeführt. Native Job Object-/pidfd-/OS-Lease fehlt. | **Nicht geprüft; Produktentscheidung über native Ownership/Plattformumfang versus Best-Effort ist offen.** Kein PID-only Kill und keine fremde Prozessaktion. |

- **Aktuelle Testläufe:** fünf vorhandene Null-AO-Suites `music-bot-playback-mpv-integration`, `music-bot-playback-graceful-mpv`, `music-bot-control-routes-mpv-optin`, `music-bot-resolver-playback-mpv`, `music-bot-route-resolve-queue-null-mpv-optin`: **10 PASS / 1 SKIP** (der separate Default-AO-Testton). Neue echte Resolver-Kompositionssuite `music-bot-resolver-real-mpv-optin.test.js`: expliziter Opt-in **1/1 PASS**, Standardlauf **1 skipped**. Alle MPV-Prozesse in diesen Tests sind eigene Null-AO-Kinder; keine Provideranfrage.
- **P1-Status:** lokale Queue-/Suchkomposition, MPV-Steuerung und normaler Shutdown praktisch belegt; synthetischer Queue-Ton hörbestätigt. P1 bleibt offen für Providerrechte/Streamabruf und eine Produktentscheidung samt sicherer Hostcrash-/Ownership-Abnahme. Punkte 2–6 werden nicht vorgezogen.

## P1 — unabhängiger fokussierter Restart-/Destroy-Testlauf (2026-10-07)

- Der gemeinsame Checkout enthält die Coordinator-Erweiterung, die Plugins vor DB-/HTTP-Teardown rückwärts nach Ladefolge mit `{ reason: 'application-shutdown' }` entlädt. Ein Fehler, `false` oder Timeout blockiert den Restart fail-closed und lässt DB/HTTP offen. `MusicBotPlugin.destroy(context)` reicht genau diesen Shutdown-Grund an den Playback-Shutdown weiter, der dadurch Orphan-Reconciliation aktiviert.
- Lokaler fokussierter Lauf nach Abgleich des aktuellen Diffs: `server-restart-coordinator`, `server-restart-blocked-cleanup-api`, `profile-restart-flow`, `music-bot-safety-runtime`, `plugin-lifecycle-routes` — **5 Suites / 58 Tests PASS**. `node --check` für `app/modules/server-restart-coordinator.js` und `app/server.js` sowie gezieltes `git diff --check` bestanden. Die erste Jest-Initialisierung wurde vor Collection durch Temp-Pfad-`EPERM` verhindert; derselbe Lauf wurde danach über den freigegebenen Testausführungspfad erfolgreich abgeschlossen.
- **Belegt:** Reihenfolge und Timeout-/Fehlerkontrakt im Coordinator-Fake; API-Status/503; Profile-Flow; Music-Bot-Destroy-Weitergabe des `application-shutdown`-Kontexts; PluginLoader-Unload-Kontext. **Nicht belegt:** laufender MPV im echten Server-Profilwechsel-/Restart-Lifecycle. Keine App-/Profil-/MPV-Starts und keine Liveaktionen in diesem Lauf.
- **Status getrennt:** **Behoben und unit-geprüft:** Restart-Aufrufe laufen durch geordneten Plugin-Unload mit dem App-Shutdown-Grund; DB-/HTTP-Teardown erfolgt danach, Exit 75 nur nach erfolgreichem Cleanup. **Unabhängig abgenommen:** CEO wiederholte dieselben 5 Suites / 58 Tests sowie Syntax- und gezielte Diff-Prüfung erfolgreich. **Teilweise geprüft:** Music-Bot-Controller besitzt separate Null-Audio- und direkte Hörproben; End-to-End-Neustart mit lebendem Player blieb aus. **Offen:** externe Playback-/OS-Reconciliation-Gates. P1 bleibt offen, P2–P6 unangetastet.

## P1 — Search-/Queue-Rechteaudit (read-only, 2026-10-07)

- Der Dashboard-Suchpfad macht GET `/api/plugins/music-bot/resolve`; der separate POST `/request` löst die Query erneut auf. Resolvercache kann Providerarbeit sparen, aber der Route-Test belegt zwei Resolveraufrufe (`app/test/music-bot-route-resolve-queue-null-mpv-optin.test.js`).
- Chatrequests durchlaufen standardmäßig die Viewer-Rechteprüfung und optional den Superfan-Gate. Dashboard-POST umgeht den CommandParser und nimmt `username`/Avatar aus dem Body; die UI sendet keinen Namen und fällt auf `dashboard` zurück. Per-Requester Queue-Limits hängen somit für diese Route an einer caller-kontrollierten Kennung.
- `/api` Admin-Auth überspringt GET, schützt POST für nicht-loopback Aufrufer mit Token und lässt direkte Loopback-Aufrufe ohne Forwarding-Header passieren. Für Music-Bot-Routen wurde keine eigene HTTP-Rate-Limit-Middleware gefunden. Der yt-dlp-Runner begrenzt Prozesskonkurrenz/Warteschlange, nicht die Zahl der eingehenden `/resolve`-Aufrufe.
- Vorhandene Tests decken Chatparser, Queue-Limits/Cooldown und paralleles Resolver-Single-flight ab. Route-Abuse-, spoofbare Dashboard-Identität- und Gate-Vertragsregressionen fehlen. Befund, genaue Codepfade und engste Regressionsempfehlung stehen ausführlicher in `docs/coordination/permissions-events.md` (Abschnitt ab Zeile 2085).
- Keine Änderung an Music-Bot-/API-Produktcode, keine Tests/Provideraufrufe/Appstarts in diesem Audit. **Nicht geprüft:** reale Auth-/Proxy-/Tunnel-Erreichbarkeit, Providerverhalten. CEO wurde um den nächsten konkreten P1-Auftrag gebeten; Queue-Handler-Audiotest und Provider-Playback bleiben aus.

## P1 — Dashboard-Rate-Limit: Route-Integration (2026-10-07)

- Auf CEO-Auftrag wurde das separate Modul `app/plugins/music-bot/lib/dashboard-request-rate-limit.js` in genau GET `/api/plugins/music-bot/resolve` (30/min) und POST `/api/plugins/music-bot/request` (10/min) als erste Route-Middleware eingebunden. Die Middleware antwortet bei Überschreitung mit HTTP 429, `MUSIC_BOT_RATE_LIMITED` und `Retry-After`; fehlende Peer-IP schlägt geschlossen fehl. Keine globale Auth-, Proxy-, Netzwerk- oder Serveränderung.
- Request-Buckets nutzen nur `req.socket.remoteAddress`, niemals `req.ip`/XFF. Loopback- und IPv4-mapped-Adressen werden normalisiert; IPv6 nutzt /56. Tradeoff: Nutzer hinter einem gemeinsamen Reverse-/Tunnel-Proxy teilen einen Bucket. Zähler sind pro Prozess und werden beim Plugin-/Prozessneustart zurückgesetzt.
- POST ignoriert caller username/avatar und setzt `requestedBy='dashboard'`, Avatar `null`. Separate Budgets je Route und direktem Peer.
- Neue isolierte Regressionen prüfen die realen registrierten Handler-Listen der Plugin-Routen mit Resolver-/Queue-Stubs: 31. Resolve und 11. Request werden vor Resolver/Queue blockiert; Header/Fehlercode, Peertrennung, getrennte Routenbudgets, XFF-Ignorierung und feste Dashboard-Identität sind abgedeckt.
- Der CEO beauftragte anschließend die Aktualisierung der veralteten Identitätserwartung in `music-bot-route-resolve-queue-null-mpv-optin.test.js` und den Null-AO-End-to-End-Lauf. Die Fixture speichert und durchläuft jetzt die gesamte `registerRoute`-Middlewarekette einschließlich Limiter, nutzt die synthetische lokale WAV-Datei und prüft `dashboard`/`requesterAvatar: null`. Dieser Lauf bestand: **1 Suite / 1 Test PASS**; eigener MPV-Prozess und Tempressourcen bereinigt.
- Gemeinsamer Node-22-Lauf nach dieser Anpassung: **6 Suites / 107 Tests PASS** (`music-bot-route-resolve-queue-null-mpv-optin`, `music-bot-dashboard-request-routes`, `music-bot-dashboard-request-rate-limit`, `music-bot-core-features`, `music-bot-command-parser`, `music-bot-resolver-concurrency`). Die Core-Suite enthält CEO-autorisierte Korrekturen zweier alter Fake-Child-Fixtures; Produktverhalten wurde dabei nicht geändert. Kein App- oder Providerstart; MPV nur im Null-AO-Opt-in-Test.
- UI-429/i18n bleibt beim Overlay-Worker.
- **Status:** Route-Limiter und Caller-Identität mit Fixtures geprüft. Externes Playback, Queue-Handler-Hörprobe, reale Proxyverteilung, MPV-Restart/OS-Reconciliation und UI-429-Darstellung bleiben separat offen. P1 bleibt in Arbeit; P2–P6 unangetastet.

## P1 — Null-AO-MPV-Abdeckungsmatrix: unabhängiger Fixturelauf (2026-10-07)

- Auf CEO-Auftrag wurden vorhandene opt-in Fixtures gegen Queue-Handler, echtes MPV-Child, Pause/Resume, Seek, Volume, Heartbeat und normales Beenden abgeglichen. Keine Produktdatei oder Testdatei geändert; alle Lücken unten sind verbleibende Reichweitengrenzen, keine fehlgeschlagenen Tests.
- **Ausgeführt:** Workspace Node 22.14, `LTTH_RUN_MUSIC_BOT_NULL_MPV=1`, Jest `--runInBand --no-cache` über `music-bot-playback-mpv-integration.test.js`, `music-bot-playback-graceful-mpv.test.js`, `music-bot-control-routes-mpv-optin.test.js`, `music-bot-resolver-playback-mpv.test.js` und `music-bot-route-resolve-queue-null-mpv-optin.test.js`: **5 Suites, 10 PASS, 1 SKIP**. Skip ist der separate Default-AO-Testton (eigenes `LTTH_RUN_MUSIC_BOT_AUDIBLE_TEST` Opt-in), nicht Teil der Null-AO-Abnahme.
- **Echte MPV-Prozesse / Null-AO:** die Playback-Integrationssuite prüfte echte Child-PIDs und IPC für Heartbeat/Position, Seek beim Abspielen und pausiert, Pause/Resume, Stop, Lautstärke 37, Trackwechsel, QueueManager-Reihenfolge, Plugin-Queuehandler sowie reguläres IPC-Quit. Zusatzsuite prüfte Stop, Replacement und Controller-Shutdown mit Exitcode 0. Control-Routenfixture führte Pause→Seek im pausierten Zustand→Resume durch die Plugin-Routen. Resolver- und Resolve/Request-Fixtures leiteten jeweils lokale synthetische WAVs über gemockten Resolver bzw. registrierte Routen bis zum eigenen MPV.
- **Bereinigungsnachweis:** Jest-Ausgaben zeigten für alle gestarteten MPV-Kinder Exitcode 0, leere Owned-PID-Sets und entfernte Tempverzeichnisse; Fixtures mit SQLite schlossen auch die In-Memory-DB. Prozess-Reconciliation blieb deaktiviert bzw. injizierte Registry war nicht scannend; es gab keinen systemweiten Scan/Kill.
- **Abgrenzung:** Dieser Opt-in-Lauf belegt echte MPV-IPC-/Queueverarbeitung mit `--ao=null`; separat ist der 2,3-Sekunden-Sinuston durch den Music-Bot-Queue-Handler am Standardgerät laut Nutzer klar hörbar gewesen. Diese Hörbestätigung stammt aus einem synthetischen Testpfad, kein Provider-/Live-Track oder Provider-/Netzwerksuche. Kein weiterer hörbarer Ton, kein LTTH-App-/Produktivprofilstart, kein fremder Prozess und keine Liveaktion.
- **Verbleibende P1-Gates:** echte Provider-Rechte und zulässiger Streamabruf sowie echte Crash-/Orphan-Reconciliation; die synthetische Queue-Hörprobe schließt keines dieser Gaps. P1 bleibt offen, P2–P6 unangetastet.

## P1 — Crash-/Orphan-Ownership-Abnahmetest: Designprüfung (read-only, 2026-10-07)

- **Aktueller Mechanismus:** `PlaybackEngine` hält `ChildProcess` und `_ownedPids` nur im Arbeitsspeicher; normaler Shutdown kann MPV über IPC-`quit` und die gehaltene Child-Referenz sauber beenden. `SoundbotProcessRegistry` hält bekannte PIDs ebenfalls nur im Arbeitsspeicher. Nach Hostcrash versucht die nächste Instanz globale Windows-CIM- (`mpv.exe`/`mpv.com`) oder Unix-`ps`-Enumeration, filtert Name plus frei reproduzierbare Title-/IPC-Marker und beendet markierte PIDs (`taskkill /PID /T /F` bzw. numerische Signale). `known:false` wird klassifiziert, aber `cleanupMarked` beendet alle markierten Einträge; Prozessidentität/CreationTime/OS-Handle wird vor Signal nicht atomar gebunden.
- **Bestehende Tests:** `music-bot-process-registry.test.js` prüft Markerfilter, Mock-Scanner/Mock-Terminator, Cleanup-Timeout, Reconciliation und Safety Lock; `music-bot-playback-controller.test.js` prüft Fake-Registry-/Child-Grenzen. Echte MPV-Fixtures prüfen nur laufenden Kindprozess und regulären Shutdown. Sie verwenden nicht-scannende Registry oder `reconcileOrphans:false` und testen keinen Hostcrash.
- **Sicherer Fixtureentwurf vor Umsetzung:** Ohne globale Inventur kann ein Unit-/Contract-Test eine injizierte `listProcesses` nur mit zwei synthetischen Einträgen (eigenes Markerfixture, fremdes/unowned Fixture) liefern und einen aufgezeichneten `terminateProcess` ausschließlich für den ausdrücklich vom Test gestarteten Fixtureeintrag zulassen. Assertions: `known:false` allein reicht derzeit zum Cleanup; nicht markierter Fremd-MPV bleibt unberührt; Scannerfehler ist kein erfolgreicher Cleanup. Das beweist lediglich Filter-/Dispatch-Vertrag, weder OS-Prozessbeendigung noch Crashgarantie.
- **Crashfixture nach gewählter Ownership-Architektur:** ein isolierter Supervisor-Testhost startet genau einen synthetischen MPV und bindet ihn vor Resume an eine OS-eigene Lifetime-Lease. Testhost wird als eigener, genau referenzierter Prozess abrupt beendet; die Lease muss ausschließlich den gebundenen MPV beenden. Ein zweites, test-eigenes MPV außerhalb der Lease muss dabei weiterlaufen und anschließend über seine gehaltene Test-Child-Referenz sauber beendet werden. Keine globale `ps`/CIM-Suche und kein PID-only kill. Fremde Nutzerprozesse werden weder enumeriert noch angesprochen.
- **Plattformgrenzen / Produktentscheidung:** Dieser Crashfall ist mit dem aktuellen Code nicht valide sicher ausführbar: es gibt weder Job Object, pidfd/Prozessgruppen-Lifetimevertrag noch macOS-äquivalente Lease. Vor einer maßgeblichen Crash-Abnahme ist die Produktwahl zwingend: Windows-x64-Job-Object zuerst (andere Plattformen fail-closed), plattformübergreifende native Ownership mit getrennten OS-Verträgen/Builds, oder ausdrücklich nur Best-Effort ohne harte Crashgarantie. Option 3 kann nur ehrliche Scanner-/Fehler-/Fremdmarker-Tests begründen, nicht „MPV endet bei Hostcrash“.
- **Beweist / beweist nicht:** Die injizierte Testvariante beweist Selektionslogik; der Lease-basierte Test würde nach Implementierung nur für seine Plattform/Runtime den kontrollierten Parent-Crash und die Abgrenzung eines außerhalb liegenden Fixturekindes belegen. Ohne Plattformmatrix, spawn-race/assignment-error-Test und Releaseartefaktprüfung keine Cross-Platform-Garantie. Der isolierte Entwurfslauf nahm keine Änderungen vor, führte keine Tests aus und startete keinen Prozess.
- **Status:** Read-only Designprüfung abgeschlossen; tatsächlicher Crash-/Orphan-Schutz bleibt offen bis Produktentscheidung und native Ownership-Implementierung. P1 offen; P2–P6 unangetastet.

## P1 — Clean-Shutdown-Garantie: fokussierter Source-/Testreview (2026-10-07)

- **Bestätigt:** `serverRestartCoordinator` entlädt Plugins rückwärts und wartet pro `unloadPlugin(id, { reason: 'application-shutdown' })`, bevor es DB/HTTP schließt und Exit 75 anfordert. `false`, Fehler oder Plugin-Unload-Timeout brechen diesen Coordinatorpfad ab, ohne DB-/HTTP-Teardown.
- **Konkrete Restlücken:** `MusicBotPlugin.destroy()` fängt und protokolliert eine Rejection von `playbackEngine.shutdown()` und kann dadurch erfolgreich auflösen. `PlaybackEngine.shutdown()` ignoriert `false` von `_terminateProcess()` nach einem Close-Timeout; `PlaybackController` beendet Retire-Fehler/Timeout ebenfalls als aufgelösten Cleanup. So kann Plugin-Unload als erfolgreich gelten, obwohl MPV nicht nachweislich beendet wurde. Der Coordinator protokolliert Fehler aus `flushEventBatch()`/`db.close()` und setzt Teardown/Exit fort. Der separate SIGINT/SIGTERM-Pfad in `app/server.js` protokolliert Plugin-Unloadfehler ebenfalls und schließt DB/HTTP weiter.
- **Gezielte Verifikation:** Workspace Node 22.14.0, fünf Suiten / 111 Tests PASS: `server-restart-coordinator`, `server-restart-blocked-cleanup-api`, `plugin-lifecycle-routes`, `music-bot-safety-runtime`, `music-bot-playback-controller`. Die Coordinator-Fixtures belegen Reihenfolge und blockierendes Verhalten bei Pluginfehler/Timeout; Music-Bot-Tests mocken Playback-Shutdown. Kein vorhandener Test erzwingt `_terminateProcess() === false` mit offenem Child oder bestätigt den SIGINT/SIGTERM-Fehlerpfad als fail-closed. Keine Datei geändert, keine App-/MPV-/Profilstarts.
- **Status getrennt:** Coordinator-Reihenfolge und Plugin-Unload-Fehlerpfad sind unit-geprüft; Clean-Shutdown-Erfolg eines echten MPV ist für die isolierten Null-AO-Normalfälle separat belegt. **Teilweise geprüft:** MPV-Terminationstimeout und DB-Fehlerbehandlung fehlen als Regression; der Shutdownbericht ist Source-/Fake-Test-Evidenz, keine Host-/Profilrestartabnahme. **Offen:** Music-Bot darf Unload nicht erfolgreich melden, wenn MPV-Ende unbestätigt ist; zudem ist zu entscheiden, ob DB-/Flushfehler und der normale Signalpfad fail-closed werden müssen. P1 bleibt offen; P2–P6 unangetastet.

## P1 — Clean-Shutdown-Fix: Fehlerpropagierung und Plugin-Unload-Gate (2026-10-07)

- **Umgesetzt:** Music-Bot-`PlaybackEngine.shutdown()` behandelt `_terminateProcess()`-`false` bei weiterhin lebendem eigenen MPV und aktive unowned Kindprozesse als Fehler. Termination-Throws werden weitergereicht; bei unbestätigtem Ende bleibt die Child-Referenz erhalten und ein erneuter Engine-Shutdown kann versuchen, sie zu beenden. `PlaybackController` propagiert Slot-Shutdownfehler und den 2-s-Retire-Timeout; wiederholter Controller-Shutdown meldet den gespeicherten Fehler erneut.
- `MusicBotPlugin.destroy()` wartet weiter auf alle übrigen Cleanup-/Queuepersistierungsschritte und wirft anschließend den MPV-Shutdownfehler, statt Plugin-Unload als erfolgreich zu melden. `PluginLoader.unloadPlugin()` liefert in diesem Fall bereits `false` zurück und entfernt trotzdem Pluginrouten/-referenz.
- **Gemeinsames Gate:** neues `app/modules/plugin-shutdown.js` entlädt Plugins in umgekehrter Reihenfolge mit `{ reason: 'application-shutdown' }` und positivem Timeoutvertrag. Restart-Coordinator nutzt das Gate vor DB-/HTTP-Teardown und Exit 75. Der normale SIGINT/SIGTERM-Pfad wartet maximal 4,5 s; bei false/throw/Timeout löscht er den 5-s-Force-Timer, setzt Exitcode 1 und kehrt vor TikTok-/OBS-/Cloud-/Socket-/DB-/HTTP-Teardown zurück.
- **Geänderte Dateien in diesem Auftrag:** `app/modules/plugin-shutdown.js`, `app/modules/server-restart-coordinator.js`, `app/server.js`, `app/plugins/music-bot/lib/playback-engine.js`, `app/plugins/music-bot/lib/playback-controller.js`, `app/plugins/music-bot/main.js`; Regressionen `app/test/plugin-shutdown.test.js`, `app/test/server-shutdown-plugin-gate.test.js`, `app/test/server-restart-coordinator.test.js` (nur bestehender Diff wird genutzt), `app/test/music-bot-playback-controller.test.js`, `app/test/music-bot-safety-runtime.test.js`, `app/test/plugin-lifecycle-routes.test.js`.
- **Prüfung:** gezielter Workspace-Node-22.14-Jestlauf: **7 Suiten / 121 Tests PASS** (`plugin-shutdown`, `server-shutdown-plugin-gate`, `server-restart-coordinator`, `music-bot-playback-controller`, `music-bot-safety-runtime`, `plugin-lifecycle-routes`, `server-restart-blocked-cleanup-api`). Enthalten: Erfolg in Reverse-Loadreihenfolge; false/throw/Timeout blockieren; Engine false/throw propagieren; Controller Timeout/Fehler propagieren; echtes PluginLoader-Destroy-Throw liefert false und entfernt Pluginrouten. Zusätzlich Node-Syntaxprüfungen für sechs geänderte Produktmodule und gezieltes `git diff --check` bestanden. Keine App-/MPV-/Profilstarts, Provider-/Liveaktionen oder globale Prozesssuche. Erster Jeststart scheiterte nur beim Temp-realpath mit Sandbox-EPERM; der genehmigte isolierte Wiederholungslauf bestand.
- **Status getrennt:** **Behoben und geprüft:** Fehlerverträge zwischen MPV-Engine, Controller, Plugin-Destroy, PluginLoader und Restart-Gate; Reverse-Order-Unload; Signalpfad-Quellvertrag vor allen Teardowns. **Teilweise geprüft:** SIGINT/SIGTERM wird nicht als vollständiger Serverintegrationstest ausgeführt; die Gate-Reihenfolge ist statisch belegt. **Verbleibende Risiken:** PluginLoader entfernt ein Plugin auch nach fehlgeschlagenem Destroy aus seiner Map; der Server bleibt daher nach abgebrochener Signalabschaltung ohne Music Bot aktiv. Restart-Coordinator protokolliert weiterhin `flushEventBatch()`-/`db.close()`-Fehler und fährt den HTTP-/Exitpfad fort; dieser separate Befund ist noch nicht behoben. Keine echte MPV-Fehler-/Timeout-Abschaltung wurde gestartet. P1 bleibt offen; P2–P6 unangetastet.

## Music-Bot-Dashboard: UI-Abdeckungsabgleich (read-only, 2026-10-07)

| Pfad | Dashboard-Handler | Vorhandene Tests und Reichweite |
|---|---|---|
| Suche / Queue-Request | `resolvePreview()` (`#search-btn`, Enter) → GET `/resolve`; `submitDashboardRequest()` (`#request-btn`) → POST `/request`, setzt `#request-feedback` und aktualisiert nach Erfolg die Queue. | JSDOM: `music-bot-runtime-ui-regression.test.js` — `reports an empty dashboard request in %s without posting`, `keeps dashboard request toast visual-only after its inline status is announced (%s)`, `keeps resolve network toast visual-only when the live search status reports failure`. Echter Chrome, lokaler Fixture-Server: `music-bot-dashboard-browser-smoke.manual.js` prüft Keyboard-Suche/Vorschau/Request und Fehlerantworten, aber keinen Produktserver. Backend/Null-AO: `music-bot-route-resolve-queue-null-mpv-optin.test.js` — `resolves a local fixture through Music Bot routes, queues it, and plays through owned null-AO MPV`; zusätzlich `music-bot-playback-mpv-integration.test.js` — `plays queued local tracks through the real Music Bot queue handler and MPV`. Beide verwenden lokale synthetische Medien, keinen Providerstream. |
| Pause / Resume | Pause sendet POST `/pause`; Resume sendet POST `/resume` und rendert den zurückgegebenen Track; Socketevents synchronisieren Status und Fortschritt. | JSDOM (`music-bot-runtime-ui-regression.test.js`): `posts pause then resume from real player clicks and renders the resumed track state`; beide Ablehnungsfälle zeigen sichtbares Fehlerfeedback. Backend/Null-AO: `music-bot-control-routes-mpv-optin.test.js` und `music-bot-playback-mpv-integration.test.js`. Keine Browserprüfung gegen Produktserver/MPV. |
| Seek | `input` zeigt Vorschau; `change` sendet POST `/seek`; Server-Sync bestätigt Position/Dauer, Fehler rollen zurück. | JSDOM (`music-bot-runtime-ui-regression.test.js`): `sends the selected seek position and displays the server-confirmed playback position`, plus Fehlerrollback. IPC/Route (`music-bot-seek.test.js`) prüft exaktes IPC-Seek und autoritativen Sync; echter Null-AO-Steuerungslauf prüft Seek im pausierten Zustand. Kein Dashboard-Browser-Seek gegen Produktserver/MPV. |
| Lautstärke | Master- und Quell-Slider zeigen den aktuellen Wert sofort und senden debounced POST `/volume`; `musicbot:volume-changed` synchronisiert Serverwerte. | JSDOM (`music-bot-runtime-ui-regression.test.js`): die Master- und Quell-Slider-Regressionen prüfen Anzeige, Debounce, genaue POST-Payload und Ablehnungsfeedback. Backend/Null-AO: Control-Routes- und `music-bot-playback-mpv-integration.test.js` prüfen MPV-Lautstärke/IPC. Kein Browserlauf gegen Produktserver/MPV. |
| Playing / Heartbeat | `musicbot:now-playing` rendert Titel/Status; `musicbot:playback-sync` aktualisiert Zeit/Seekbar. Backend `_startPlaybackSync()` fragt alle 5 s den Engine-Heartbeat ab und emittiert den Sync. | JSDOM: `music-bot-runtime-ui-regression.test.js` — `adopts the current runtime playback identity, ignores stale syncs, and freezes seek previews`; Producer/Heartbeat-Tests im selben File prüfen unter anderem `delegates stalled-player recovery to the single controller heartbeat without advancing the queue` und das Playback-Sync-Payload. Echte MPV-IPC/Null-AO: `plays, heartbeats, and fully cleans up real MPV with null audio output`. Kein positiver Playing-/Heartbeat-Status im Browser-Smoke; der Smoke nutzt nur lokale UI-Fixtures.
| Fehlerdarstellung | Resolve-Fehler erscheinen in `#search-feedback`; Request-Ergebnisfehler in `#request-feedback`; Netzwerk-/Socket-/Playbackfehler laufen zusätzlich über Toasts, bei Request/Resolve teilweise `aria-hidden`, um eine zweite Live-Ansage zu vermeiden. | JSDOM: `exposes search and request feedback as polite atomic status regions`, `keeps resolve network toast visual-only when the live search status reports failure`, `shows only one toast for a dashboard request network failure`, `emits playback errors through one UI channel`. Echter Chrome, lokaler Fixture-Server: derselbe manuelle Runner prüft Resolve-503/Request-429, `role=status`, `aria-live=polite` und `aria-hidden`-Toast. Kein echter Produktserver-/Livefehler im Browser geprüft. |

- **Evidenz getrennt:** JSDOM prüft DOM-Verhalten, kein realer Browser. Der Chrome-Smoke prüft das originale Dashboard-Markup/-JS gegen deterministische Loopback-Fixtures, nicht gegen Pluginserver/MPV. Die dokumentierte Opt-in-Abnahme (`music-bot-playback-mpv-integration`, `music-bot-playback-graceful-mpv`, `music-bot-control-routes-mpv-optin`, `music-bot-resolver-playback-mpv`, `music-bot-route-resolve-queue-null-mpv-optin`) meldet 5 Suites / 10 PASS / 1 SKIP und belegt echte MPV-IPC ausschließlich mit `--ao=null`; dieser Abgleich hat sie nicht erneut ausgeführt.
- **Hörnachweis / offene UI-Lücken:** Der dokumentierte Nutzer-Hörnachweis ist ein synthetischer kurzer Ton durch den Queue→MPV-Pfad, kein Musikprovider-/Live-Track. JSDOM prüft jetzt Benutzeraktionen und Requests für Pause/Resume, Seek und Master-/Quellvolume. Ein echter Dashboard-Browserlauf gegen Produktserver/MPV und ein positiver Browser-Playing-/Heartbeat-Lauf fehlen weiter; der Queue→MPV-Hörnachweis ist noch mit der abweichenden älteren `CEO_HANDOFF.md`-Angabe abzugleichen.

## P1 — Restart-DB-Flush/-Close fail-closed (2026-10-07)

- Dieser Abschnitt schließt die DB-/Eventbatch-Lücke aus dem vorherigen Clean-Shutdown-Bericht.
- **Bestätigter Fehler:** `DatabaseManager.flushEventBatch()` gibt ein Promise zurück. Der Restart-Coordinator hat es bisher ohne `await` gerufen; ein asynchroner Reject wurde so nicht vom lokalen `try/catch` erfasst. Einen synchronen Throw und `db.close()`-Throw hat er ebenfalls nur protokolliert und danach HTTP-Schluss/Exit 75 fortgesetzt.
- **Umgesetzt:** `flushEventBatch()` wird awaited und durch `databaseFlushTimeoutMs` begrenzt (Default 2 s). Promise-Reject, synchroner Throw, Timeout und `db.close()`-Throw brechen vor HTTP-Schluss und Exit 75 ab. Flush-Fehler brechen außerdem vor Restart-Socketmeldung/-Disconnect ab; der DB-Close-Fehler kommt nach Socketdisconnect, aber vor HTTP-Close. Der Force-Exit-Timer wird bei beiden DB-Fehlern gecleart. `onRestartAborted` erhält Stage, Grund und nur sanitisiertes Error-Name/Code; Originalmeldung/Stack/Pfad wird nicht weitergegeben.
- **Geprüft:** `server-restart-coordinator.test.js` prüft asynchronen Reject, synchronen Flush-Throw, 2-s-Timeout, DB-Close-Throw sowie den erfolgreichen Ablauf Flush → Socketmeldung/Disconnect → DB-Close → HTTP-Close → Exit 75. Die fokussierten Coordinator-/API-Suiten bestanden mit **2 Suiten / 13 Tests**; die abschließende gemeinsame Shutdown-Wiederholung bestand mit **7 Suiten / 126 Tests PASS**, inklusive Plugin-/MPV-Shutdown-Gates. Fake-Timer/Fake-DB, kein echtes DB-Backend/Appstart.
- **Status getrennt:** **Behoben und geprüft:** diese vier Eventbatch-/DB-Fehlerpfade fail-closed; sanitized Failure-Callback; Force-Timer-Abbruch. **Teilweise geprüft:** sync-throw/reject/timeout sind Stubs, kein SQLite-I/O. **Offen:** Server-Signalpfad nicht als echte Serverintegration gestartet; `db.close()` kann einen Fehler nach teilweisem internem Close melden, und das lässt sich nicht rückgängig machen. P1 bleibt offen; P2–P6 unangetastet.

## P1 — Restart-Status korrekt nach Abbruchstufe (2026-10-07)

- `server.js` bildet `onRestartAborted` nun auf einen begrenzten öffentlichen Fehlervertrag ab. Plugin-Unload behält unverändert `PLUGIN_CLEANUP_BLOCKED`. Datenbank-Flush und Datenbank-Schluss erhalten generische, zutreffende Meldungen plus whitelisted Stage und validierten Fehlercode; unbekannte Stages/Codes und Originaltexte/Pfade werden verworfen.
- `/api/profiles/active` und `POST /api/server/restart` zeigen dieselbe bereinigte Ursache; Restart bleibt HTTP 503 und wird nicht automatisch neu geplant.
- **Prüfung:** `server-restart-blocked-cleanup-api.test.js` plus `profile-restart-flow.test.js`: **2 Suiten / 14 Tests PASS**. Plugin-Vertrag, beide DB-Stages, invalid stage/code und kein Retry sind mit VM-Handler-/Payloadfixtures geprüft; kein Server-/DB-Prozess.
- **Status:** Behoben und geprüft auf API-Vertragsebene. P1 bleibt offen; P2–P6 unangetastet.

## P1 — MPV-Unload-Fehler: Besitzerreferenz und Recovery (read-only, 2026-10-07)

- **Bestätigter Folgeeffekt:** `MusicBotPlugin.destroy()` setzt `this._destroyed = true`, bevor es `PlaybackEngine.shutdown()` abwartet. Wenn MPV nach dem Terminationsversuch weiterlebt, hält die Engine zwar noch `this.process` und `_ownedPids` und wirft den Fehler; zugleich wurde ihr IPC-Socket bereits geschlossen und der IPC-Pfad entfernt. Der Destroy-Hook wirft nach seinen übrigen Cleanup-Schritten weiter.
- **Loader-Verhalten:** `PluginLoader.unloadPlugin()` entfernt in `finally` TikTok-Listener, registrierte Plugin-Routen/-Events über `unregisterAll()` und löscht `this.plugins` auch bei einem Destroy-Fehler. Der Aufrufer erhält `false`. Der Restart-Coordinator bricht daraufhin vor DB-/HTTP-Teardown ab; der Hostprozess bleibt offen, aber ohne gemappte Music-Bot-Instanz.
- **Recovery-Bewertung:** Ein Retry derselben Instanz wird nicht angeboten: `destroy()` kehrt bei `_destroyed` sofort erfolgreich zurück, während `unloadPlugin()` wegen fehlender Map-Instanz `false` liefert. Ein neuer Plugin-Init hat einen indirekten Reconcile-Pfad (`MusicBotPlugin.init()` → `_reconcilePlaybackProcessesAtInit()` → `PlaybackController.reconcileProcesses()`); dieser scannt markierte MPVs und kann unerwartete Marker über `emergencyStop()`/`cleanupMarked()` terminieren. Das ist kein Wiederaufnehmen des konkreten `ChildProcess`-Handles und keine belastbare Recovery-Garantie: Die Map-Referenz ist weg, Registry-/Engine-Ownership war im Speicher der alten Instanz, und Reconcile beruht auf Prozessscan plus reproduzierbaren Markern. Ein bewusst unterstützter manueller Unload-Retry oder automatischer Restart/Reconcile-Aufruf nach diesem Abbruch ist im geprüften Pfad nicht vorhanden.
- **Minimale Alternative A — Owner/Instanz bei Shutdownfehler behalten:** Bei `reason === 'application-shutdown'` Destroyfehler nicht als vollständigen Unload behandeln: Listener/Routen weiter sicher entfernen, aber Plugin-Instanz/Engine-Owner in einer separaten `cleanup-pending`-Map mit begrenztem Zugriff halten; ein expliziter Retry ruft ausschließlich deren Shutdown erneut auf. **Tradeoff:** hält Ressourcen und Codeobjekte bis zur Auflösung im Prozess; braucht einen klaren Zustand/Retryvertrag, damit Plugin nicht wieder normale Requests/Eventhandler annimmt.
- **Minimale Alternative B — kontrollierter Reconcile-Retry:** Nach fehlgeschlagenem Unload den Restart blockiert lassen und einen einzelnen, expliziten Retry auslösen, der die vorhandene `SoundbotProcessRegistry`-Reconciliation mit enger Fixture-/Marker-Policy abwartet und nur bei bestätigtem `remaining: []` den Unload als bereinigt akzeptiert. **Tradeoff:** nutzt vorhandene Registry-Mechanik, aber nicht den ursprünglichen Child-Handle; Marker-/PID-Scan hat schwächere Identitätsbindung und derzeit keinen atomaren Prozessidentitätsnachweis. Kein automatisches Retry ohne Produktentscheidung.
- **Empfehlung zur Entscheidung:** Alternative A ist die kleinere sichere Semantik für denselben Prozessbesitzer. Alternative B darf erst nach expliziter Entscheidung zu Marker-/PID-Ownership als Recovery-Garantie verwendet werden. Beides ist Vorschlag; dieser Auftrag änderte keinen Produktcode.
- **Prüfung / Status getrennt:** Source-only anhand `app/plugins/music-bot/main.js`, `app/plugins/music-bot/lib/playback-engine.js`, `app/plugins/music-bot/lib/playback-controller.js`, `app/plugins/music-bot/lib/soundbot-process-registry.js`, `app/modules/plugin-loader.js` und `app/modules/plugin-shutdown.js`. Keine Tests und keine Prozesse gestartet. **Befund geprüft; Umsetzung nicht beauftragt; Recovery-Garantie offen; keine Änderung an MPV/App/Profilen.**
## P1 — Aktueller Music-Bot-UI-Regressionstand (2026-10-08)

- **Änderungsstand im geteilten Arbeitsbaum:** `app/test/music-bot-runtime-ui-regression.test.js` enthält inzwischen DOM-Regressionen für Pause/Resume, deren Fehlerfeedback, Seek-Payload/Serverbestätigung sowie Master-/Quellvolume mit Debounce, exakter Payload und Fehlerfeedback. `app/plugins/music-bot/assets/ui.js` und `ui.html` weisen ebenfalls parallele lokale Änderungen auf; dieser Audit hat sie nicht editiert.
- **Lokale Prüfung:** Node-22-Syntaxprüfungen für `assets/ui.js` und die Regressionstestdatei bestanden; `git diff --check` auf den drei UI-Dateien bestanden. SHA-256: `assets/ui.js` `9F050D529B6F745B0B098F54B85A2DB73AFC7FFBA4FED84ABDB7BBB5587FE4B6`; Testdatei `8282609AD7FB96C80F38D862F58845559A184B7BD6F6C80908DADBF7C20840B3`.
- **Prüfung:** Der erste Sandbox-Lauf scheiterte vor Teststart mit `EPERM` bei `realpath` des Tempverzeichnisses. Der genehmigte Wiederholungslauf mit gebündeltem Node 22 außerhalb der Sandbox bestand: `music-bot-runtime-ui-regression.test.js`, **1 Suite / 155 Tests PASS**. Node-Syntax und scoped `git diff --check` bestanden.
- **Status getrennt:** **Geprüft:** DOM-Assertions für Pause/Resume, Seek, Master-/Quellvolume sowie bestehende Music-Bot-UI-Regressionen; Syntax/Diff. **Teilweise geprüft:** JSDOM liefert keine echte Chrome-/Produktserver-/MPV-Abnahme. **Offen für P1-Abnahme:** unabhängiger CEO-Replay, Browser-/Produktservergrenze, Providerrechte/zulässiger Streamabruf und Recovery bei echtem Shutdownfehler. Keine Produkt-App, kein MPV, Provider, Profil oder Liveaktion gestartet; Prioritäten 2–6 unangetastet.

## P1 — Music-Bot-Owner bei fehlgeschlagenem Shutdown behalten und retrybar machen (2026-10-07)

- **Befund bestätigt:** Vor der Änderung blieb ein fehlgeschlagener Slot nur als `retired` markiert und wurde aus den aktiven Slots entfernt; ein erneuter Controller-Shutdown übersprang ihn. `MusicBotPlugin.destroy()` behandelte den Pluginzustand als endgültig und hatte keinen Wiederholpfad. `PluginLoader` entfernte die Instanz auch bei Shutdownfehler aus seiner Map. Der Restart-Coordinator blieb nach Plugin-Cleanup-Abbruch als bereits geplant markiert; die Restart-API wies einen expliziten Retry zurück.
- **Umsetzung:** Cleanup-fehlgeschlagene Slots bleiben im selben Controller als ausstehende Owner referenziert und lassen erneuten Shutdown desselben Engine-Handles zu. Bei `application-shutdown` markiert der Music-Bot fehlgeschlagene Playbackbereinigung als `cleanupPending`; der Loader entfernt weiterhin Routen/Listener, behält aber genau diese Instanz für den Retry. Entladeaufrufe pro Plugin laufen serialisiert, damit ein expliziter Retry nach Timeout nicht mit einem noch laufenden Destroy konkurriert. Plugin-Cleanup-Fehler setzen den Coordinator für eine neue explizite Restart-Anforderung frei; ausschließlich `PLUGIN_CLEANUP_BLOCKED` ist über die Restart-API erneut anforderbar. DB-Flush-/DB-Close-Fehler bleiben gesperrt. Keine automatische Wiederholung.
- **Geänderte Dateien:** `app/plugins/music-bot/lib/playback-controller.js`, `app/plugins/music-bot/main.js`, `app/modules/plugin-loader.js`, `app/modules/server-restart-coordinator.js`, `app/server.js`; Regressionen in `app/test/music-bot-playback-controller.test.js`, `app/test/music-bot-safety-runtime.test.js`, `app/test/plugin-lifecycle-routes.test.js`, `app/test/server-restart-coordinator.test.js`, `app/test/server-restart-blocked-cleanup-api.test.js`.
- **Tests:** Gebündeltes Node 22 / Jest `--runInBand --no-cache`: 8 Suites, **141 Tests PASS** (`music-bot-playback-controller`, `music-bot-safety-runtime`, `plugin-lifecycle-routes`, `server-restart-coordinator`, `server-restart-blocked-cleanup-api`, `plugin-shutdown`, `server-shutdown-plugin-gate`, `profile-restart-flow`). Abgedeckt: Fehler→derselbe Child-Handle/derselbe Slot→Retry erfolgreich; parallel angeforderter Retry wartet auf denselben Plugin-Owner; auch Timeout→Owner verbleibt→erster Destroy endet→expliziter Retry→Restart-Teardown fortgesetzt; DB-Fehler bleiben gesperrt. Die nachträglich kombinierte Timeout-/Restart-Fixture lief separat erneut: **2 Suites / 17 Tests PASS** (`server-restart-coordinator`, `plugin-lifecycle-routes`); direkter PlaybackEngine-Fake-Child-Retry: `music-bot-playback-controller`, **1 Suite / 65 Tests PASS**. Node-22 `--check` über die fünf Produktdateien bestanden. Scoped `git diff --check` für Produkt-/Regressiondateien bestanden. Der erste Jest-Aufruf in der Sandbox scheiterte vor Teststart beim `realpath` des System-Tempordners (`EPERM`); Wiederholung mit Sandbox-Freigabe war grün.
- **Verbleibende Risiken / Grenzen:** Nur Fake-Engines und isolierte Plugin-/API-Fixtures; keine echte MPV-Fehler-/Wiederherstellung, keine laufende LTTH-App und keine Datenbank-/Profilmutation. Pluginrouten und Listener bleiben nach fehlgeschlagenem Shutdown entfernt, während die Owner-Instanz im Loader für explizite Cleanup-Versuche gehalten wird. Echte Prozessidentitäts-/Hostcrash-Reconciliation, Providerrechte und Streamabruf bleiben offen; keine Änderung an diesen Bereichen.
- **Status getrennt:** **Behoben und geprüft:** derselbe in-memory Owner kann nach `false`/Cleanupfehler erneut bereinigt werden; Restart läuft erst nach erfolgreichem Retry weiter. **Teilweise geprüft:** Timeout-/Serialisierungsvertrag über lokale Fixtures, nicht echter MPV-Prozess. **Blockiert/offen:** P1-Abnahme für Providerrechte und echte Crash-/Orphan-Ownership sowie unabhängiger CEO-Replay. **Nicht geprüft:** reale App-/MPV-/Provider-/Profilumgebung. P2–P6 unangetastet.

## P1 — Expliziter UI-Retry für blockierte Plugin-Bereinigung (2026-10-08)

- **Befund bestätigt:** Der Profilmanager setzt bei jeder Restart-Bereinigungssperre `restartBlocked`, entfernt den bisherigen „Restart jetzt“-Button und verhindert manuelle Restart-Aufrufe. Für `PLUGIN_CLEANUP_BLOCKED` gab es daher keinen UI-Auslöser für den vom Restart-API-Vertrag unterstützten expliziten Retry.
- **Umsetzung:** Bei genau `PLUGIN_CLEANUP_BLOCKED` zeigt der Profilmanager nun einen sichtbaren Retry-Button. Er sendet einen neuen `POST /api/server/restart`, wartet danach auf den Profil-/Serverstatus und entfernt den Hinweis nach erfolgreicher Wiederaufnahme. Andere Restartfehler, insbesondere `RESTART_CLEANUP_BLOCKED` bei Datenbank-Flush/Close, erhalten keinen Retry-Button; bestehende fail-closed Guards bleiben aktiv. Ein später erfolgreich geladener Profilstatus entfernt den alten Blockadehinweis.
- **Geänderte Dateien:** `app/public/js/profile-manager.js`; JSDOM-Regressions in `app/test/profile-restart-flow.test.js`.
- **Tests:** `profile-restart-flow.test.js`: **1 Suite / 10 Tests PASS**. Die JSDOM-Fixture prüft Button, POST auf den bestehenden Restart-Endpunkt, erfolgreiches Statuspolling und Entfernen des Hinweises. Eine zweite Fixture bestätigt für Datenbankfehler: kein Retry-Button, keine Restart-POST. Node-22 `--check` für Produktdatei und Test bestanden; scoped `git diff --check` bestanden.
- **Verbleibende Grenzen:** Nur synthetische API-Antworten/JSDOM; keine App-, Datenbank- oder Profilprozesse gestartet. Keine automatische Wiederholung. P1 bleibt für echte MPV-Fehler-/Crash-Recovery, Providerrechte/Streamabruf und unabhängige CEO-Abnahme offen.
- **Status getrennt:** **Behoben und geprüft:** der zulässige Plugin-Cleanup-Retry ist für Nutzer im UI erreichbar; DB-Blockaden bleiben ohne Retry. **Teilweise geprüft:** UI-/API-Vertrag isoliert in JSDOM. **Nicht geprüft:** reale Serverwiederkehr, MPV, Profile oder Provider. P2–P6 unangetastet.

## P1 — Stummer echter MPV-Resolver-/Queue-Retest nach Shutdown-Retry (2026-10-08)

- **CEO-Disposition:** Die bereits bestätigte lokale synthetische WAV über echten MPV zählt als Hör-/Audio-/Queue-Nachweis für diesen Pfad, nicht als komplette P1-Abnahme. Provider-Suche und Stream bleiben bis zu einer Nutzerantwort offen; bis dahin kein externer Abruf.
- **Ausgeführt:** Gebündeltes Node 22/Jest mit `LTTH_RUN_MUSIC_BOT_NULL_MPV=1` auf `music-bot-resolver-playback-mpv.test.js` und `music-bot-route-resolve-queue-null-mpv-optin.test.js`: **2 Suites / 2 Tests PASS**. Beide laden ausschließlich synthetische, lokale WAV-Fixtures über den Resolver-/Route-/Queuepfad in echten MPV-Child mit `--ao=null`; isolierte In-Memory-DB und nicht-scannende Fake-Registry. Kein externer Provider, Stream oder URL-Abruf.
- **Geltungsgrenze:** Erneut bestätigte lokale Such-/Queue-Verarbeitung und echte MPV-IPC/Position/Heartbeat nach den Shutdownänderungen. Das beweist keine reale Provider-Suche, Streamrechte, Internetwiedergabe oder Crash-/Orphan-Recovery.
- **Status getrennt:** **Behoben und geprüft:** stummer Resolver→Queue→MPV-Lokalfixturepfad. **Teilweise geprüft:** echte MPV-Prozesse nur mit Test-WAV und Null-Ausgabe. **Blockiert/offen:** CEO-Abnahme des Cleanup-/UI-Retrys und Nutzerentscheidung, ob/welche lizenzierte externe Provider-Suche Teil der P1-Abnahme sein soll. **Nicht geprüft:** externe Provider/Streams. P2–P6 unangetastet.

## P1 — Playback-Heartbeat: IPC-Position und Timer-Cleanup (2026-10-08)

- **Befund bestätigt:** `PlaybackEngine.heartbeat()` sendet einen position request und coalesziert parallele Checks; Fehlerfenster, Bestätigung und Safety-Lock waren bereits regressionsgeprüft. Plugin-Sync pollt alle 5 Sekunden und prüft nach await auf stale Track. `PlaybackEngine.getPosition()` verwendete einen separaten Socket-`data`-Listener mit Timeout, aber direkte Tests fehlten für Antwortzuordnung sowie Listener-Cleanup bei Antwort, Timeout und Write-Fehler. Periodischer Sync-Timer wurde beim Neustart ersetzt und durch `_stopPlaybackSync()` gecleart; ein direkter Idempotenz-/Cleanup-Test fehlte.
- **Umsetzung:** Nur synthetische Tests ergänzt. Fake-IPC prüft, dass fremde request IDs ignoriert werden, die passende Position die Promise erfüllt und Listener entfernt werden; Timeout und Schreibfehler entfernen den Listener ebenfalls. Runtime-Regression prüft Timerersatz, Clear des aktuellen Timers, `null`-Zustand und idempotenten Stop. Kein Produktcode geändert.
- **Geänderte Dateien:** `app/test/music-bot-playback-controller.test.js`, `app/test/music-bot-runtime-ui-regression.test.js` (beide Dateien besitzen parallele/unabhängige Änderungen im gemeinsamen Arbeitsbaum; dieser Auftrag fügte die beschriebenen isolierten Tests hinzu). SHA-256 aktuell: playback-controller test `10C09A1B102246…`; runtime UI test `4809F9DFCDA392…`.
- **Tests:** Vollständige Suites `music-bot-playback-controller.test.js` + `music-bot-seek.test.js`: **2 Suites / 93 Tests PASS** (nach IPC-Testergänzung). Anschließend Heartbeat-/Timer-Fokus über Controller, Seek und Runtime-UI: **2 Suites PASS / 15 Tests PASS**, **1 Suite übersprungen** wegen des `--testNamePattern`-Filters (234 Tests); damit lief der neue Timer-Test und Controller-Hearbeat-Fälle. Syntax `node --check` für beide Testdateien und scoped `git diff --check` PASS. Sandbox-Aufrufe von Jest scheiterten beim Temp-`realpath` mit `EPERM`; genehmigte fokussierte Läufe außerhalb der Sandbox bestanden.
- **Verbleibende Risiken / Grenzen:** Ausschließlich Fake-IPC/JSDOM-artige synthetische Lifecycle; keine echte App, MPV, Provider, Profile oder Nutzeraktion gestartet. Probe `PlaybackEngine.probe()` nutzt `_sendCommand()` und teilt dessen Timeout-Vertrag; kein eigenständiger neuer Probe-Timeout-Test in diesem Auftrag. Shutdown beendet den Timer per `_stopPlaybackSync()` im Destroy-Pfad, aber kein zusätzlicher vollständiger Plugin-Destroy-Test speziell für Timer ergänzt.
- **Status getrennt:** **Behoben und geprüft:** fehlende Regressionen für Position-IPC-Listenercleanup und periodischen Timer-Stop ergänzt und bestanden. **Teilweise geprüft:** echte IPC-Latenz/MPV-Antwort und Plugin-Destroy in Laufzeit nicht ausgeführt. **Blockiert:** nichts in diesem lokalen Fake-Testauftrag. **Nicht geprüft:** produktive App/MPV/provider sowie P1-Gesamtabnahme.

## P1 — Echter MPV-Null-Audio-Steuerpfad (2026-10-08)

- **CEO-Auftrag / Scope:** Streng lokaler echter MPV-Smoke mit synthetischer WAV und `--ao=null`; Queue, Start, Pause/Resume, Seek, Volume-IPC, Position/Heartbeat, sauberer Exit und Fixture-Cleanup. Kein Provider/Internet, keine echte App oder Nutzerprofile.
- **Umsetzung:** `app/test/music-bot-resolver-playback-mpv.test.js` erweitert. Der vorhandene isolierte Resolver→Dashboard-Queue→PlaybackController-Pfad prüft jetzt zusätzlich Pause-property, Volume-property (37 %), Seek auf 4 Sekunden samt Positionsbestätigung, Resume-property, direkte Positionsabfrage und nachfolgende Heartbeat-Antwort. Nach Seek/getPosition bleibt die Socket-Listenerzahl auf dem MPV-Standardlistener. Shutdown prüft Child exit, Owner-PID-Entfernung/Registry-Abmeldung, Engine process/socket null, keine ausstehenden IPC-Kommandos, Duck-/Fade-Timer null sowie In-Memory-DB und temporäre WAV/Ordner geschlossen/entfernt. Kein Produktcode geändert.
- **Tests:** Gebündeltes Node 22/Jest mit explizitem `LTTH_RUN_MUSIC_BOT_NULL_MPV=1`, außerhalb der Sandbox nach Sandbox-`EPERM` beim Temp-`realpath`: `music-bot-resolver-playback-mpv.test.js` und `music-bot-route-resolve-queue-null-mpv-optin.test.js`: **2 Suites / 2 Tests PASS**. Die erste Suite belegt Resolver→Queue→Start plus Pause/Resume/Seek/Volume/Position/Heartbeat/Shutdown; die zweite belegt echte Route-Auflösung, Queue/AutoPlay→MPV, Heartbeat und Exit. Node-22 `--check` und scoped `git diff --check` auf der Testdatei PASS. SHA-256: `2D87610E61D5DDAC807C24273DB0B81853002CCF0CB4B61E1AEE930493F5A4F6`.
- **Cleanup-Evidenz:** Testassertions bestätigen exitCode 0 ohne Signal, `_ownedPids.size === 0`, Registry-Abmeldung, `process/socket === null`, leere `_pendingCommands`, null Timerfelder, geschlossene In-Memory-DB und entfernte Tempdatei/-ordner. Separate CIM-Abfrage nach zurückgebliebenen MPV-Prozessen war in der Umgebung nicht verfügbar; unabhängiger Systemprozess-Scan daher nicht geprüft.
- **Verbleibende Risiken / Grenzen:** MPV lief nur mit synthetischer WAV und Null-Audioausgabe. Diese Ausführung belegt keine hörbare Audioausgabe; separater früherer Testton war vom Nutzer als hörbar bestätigt. Kein Provider-Suchrecht, echter Internetstream oder reale Live-App geprüft. Timer-Cleanup im Plugin-Sync bleibt separat per synthetischer Timer-Regression geprüft; dieser Integrationstest startet keinen periodischen Plugin-Sync.
- **Status getrennt:** **Behoben und geprüft:** realer lokaler MPV-IPC-Steuer-/Queue-/Shutdownpfad mit Null-Ausgabe. **Teilweise geprüft:** echter Child-Lifecycle durch Testassertions, kein unabhängiger CIM-Restprozessscan. **Blockiert/offen:** Provider-/Streamrechte und CEO-Gesamtabnahme von P1. **Nicht geprüft:** produktive Musikwiedergabe, App/Profil, externe Provider, unabhängige Hostprozessinventur.

## P1 — Lokale Such-/Request-Verträge ohne Providerzugriff (2026-10-08)

- **Semantik am aktuellen Code bestätigt:** `GET /catalog/search` ist ein lokaler DB-Katalogfilter (`MusicCatalog.searchSongs`) für Genres/Playlists, kein Provider-Suchendpunkt und kein Queue-Request. Das Dashboard-Musik-Request-Preview ruft separat `GET /resolve?q=…` auf; der Queue-Button sendet dieselbe Texteingabe als `POST /request`, dessen Serverhandler den Resolver erneut abfragt und das Ergebnis erst danach mit vertrauenswürdiger `requestedBy: dashboard`-Identität einreiht. Die getrennte Resolver-Abfrage im POST verhindert, dass Previewdaten direkt als Wiedergabequelle vertraut werden.
- **Befund:** Lokaler Katalogroute-Test war mit SQLite `:memory:` vorhanden; Request-Route-Suite hatte Limiter-, Disconnect- und Byte-Limit-Regressions, aber keinen expliziten Happy-Path mit Song-Metadatenmapping und keinen gemeinsamen Resolver-Leer-/Throw-Fall über Preview und Request.
- **Umsetzung:** Nur `app/test/music-bot-dashboard-request-routes.test.js` ergänzt: GET gibt exakte Fixture-Metadaten zurück, trimmt den Query und reiht nichts ein; POST reicht dasselbe Query an gemockten Resolver und mappt alle Songfelder in Queue mit `dashboard`-/Avatar-null-Identität; leeres Resolverergebnis und Provider-Throw scheitern in GET/POST ohne Queue-/Precache-/Song-added-Aufruf. Netzwerkzugriff ist ausgeschlossen, da `musicResolver.resolve` vollständig durch Jest-Mock ersetzt ist; keine `nock`-Schicht nötig. Bestehende JSDOM-Tests prüfen Previewanzeige, stale/overlap-Verhalten, leere Ergebnisse und Fehlerfeedback; nicht verändert.
- **Tests:** `music-bot-catalog-search-route.test.js` + `music-bot-dashboard-request-routes.test.js`: **2 Suiten / 19 Tests PASS**. Bestehende JSDOM-Preview-/Overlap-Auswahl (`music-bot-runtime-ui-regression.test.js`): **1 Suite / 4 ausgewählte Tests PASS**, 152 durch Filter übersprungen. Node-22 `--check` und scoped `git diff --check` auf geänderter Testdatei PASS. Jest-Sandboxstart scheiterte vor Ausführung beim System-Temp-`realpath` (`EPERM`); genehmigte Läufe außerhalb der Sandbox grün.
- **Verbleibende Risiken / Grenzen:** Belegt ist lokaler Resolver-/Route-/UI-Vertrag mit Fixtureantworten, nicht die tatsächliche Netzwerksuche eines Providers, dessen Rechte, Verfügbarkeit, Streamabruf oder MPV-Kompatibilität. Der echte Provider-Such-/Streamnachweis bleibt ausdrückliches externes Freigabe-/Abnahmegate.
- **Status getrennt:** **Behoben und geprüft:** lokale Suchvorschau-/Queue-Mapping- und Fail-closed Regressionen ergänzt. **Teilweise geprüft:** JSDOM/UI und Route contract mit Mockresolver. **Blockiert/offen:** öffentliche Provider-Suche/-Stream mangels Freigabe; P1-Gesamtabnahme offen. **Nicht geprüft:** externes Netzwerk/Provider und echte Produktprofile.


## P2-Gate — Fortsetzung wartet auf Disposition (2026-10-08)

- P1 ist laut unabhängiger CEO-Bestätigung auf lokalem Umfang abgeschlossen: echter MPV mit synthetischer Queue-Audiodatei plus nutzerbestätigter Hörprobe; externe Provider-Suche/Stream bleibt ein eigenes Freigabegate.
- P2 wurde ausdrücklich vom Nutzer zurückgestellt. Deshalb keine OBS-Prozess-, Profil-, Quellen- oder Liveaktion. Die 104-Quellen-Abnahme bleibt offen und darf nicht übersprungen werden.
- CEO wurde um konkrete Disposition gebeten: P2 weiter pausieren oder einen isolierten, nicht-produktiven Abnahmepfad samt erlaubten Aktionen und erforderlichen Nutzerfreigaben festlegen. Bis dahin keine P3-6-Zielbild-Abnahme.

## P2 — OBS-104 statischer Quellenabgleich und Fixture-Rerun (2026-10-08)

- **CEO-Auftrag:** P2 bleibt praktisch pausiert. Statisch/fixture-basiert die 104 Matrix gegen aktuellen Quellcode abgleichen, Renderer/Routen/Assets/Locale und vorhandene Fixtures bzw. Lücken dokumentieren sowie einen späteren Gast-Runbook-Entwurf liefern. OBS bleibt `NOT_TESTED`; nicht registrierte Producer-Ereignisse nicht öffnen. Kein OBS-, VM-, Produktprofil- oder Produktprozessstart.
- **Befund bestätigt:** Der Nenner besteht aus 68 öffentlichen Guide-Fällen, 32 lokalen Closed-Beta-Rendererfällen und 4 Chatango-Retirementkontrollen. Letztere sind keine OBS-Pässe. Die neu gebaute Matrix enthält alle 104 IDs/26 Profile; 100 sind aktive Rendererfälle und 4 Retirementkontrollen. Alle **104/104 bleiben OBS `NOT_TESTED`**, 0 OBS-Pässe. Aktuell existieren 100 HTML-/Locale-Dateien; 44 Kandidatenpfade sind exakt und 52 über alternative Registry-/Static-Mount-Pfade belegt. Vier alte Music-Bot-Handlerpfadbehauptungen stimmen nicht mit der aktuellen Handlerquelle überein und bleiben im Audit als Drift sichtbar. 88 Fälle haben keine benannte Fixture-Testdeklaration; vorhandene Tests belegen keinen OBS-Abnahmelauf.
- **Fixture-Semantik:** Viewer-XP fordert den initialen Boardstand erst beim Socket-`connect`; Fixture löst dieses Ereignis nun explizit aus. TopTier rendert nach Locale-Initialisierung sofort zwei leere Boards; Empty-Label und Sprache stammen je aus der Locale, und Board-Requests kommen bei `connect`. Nur Testassertions wurden an diese beobachtete Renderersemantik angepasst; Produktcode blieb unverändert.
- **Umsetzung/Dateien:** Matrix-Generator und Matrixregression erweitert; aktuelle Quellenrevalidierung (`scripts/obs-pilot/reverify-obs-104-source.js`) samt Tests und JSON-Bericht ergänzt; späteres, ausdrücklich nicht autorisierendes Gast-Runbook erstellt. Die Fixture-Tests `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js` und `app/plugins/toptier/test/obs-toptier-fixtures.test.js` korrigiert. `docs/coordination/obs-104-acceptance-matrix.json`, `docs/coordination/obs-pruefplan.md` und dieser Status aktualisiert. Keine Änderung an OBS, Produktprofilen, Produktprozessen oder Laufzeitcode.
- **Tests:** Jest: Timer/Goals, Viewer-XP und TopTier Fixture-Suiten **3/3 Suiten, 60/60 Tests PASS**. Node-22 Matrix/Quellenrevalidierung **14/14 PASS**; beide neuen Skripte `--check` PASS. Revalidierung: 104 Fälle, 0 OBS-Pässe, 0 ungelöste lokale statische Assetabhängigkeiten; 4 Music-Bot-Handlerdrifts offengelegt. `git diff --check` meldete nur einen bereits vorhandenen, fremden Leerraum am EOF in `app/modules/adapters/EulerstreamAdapter.js`; an dieser fremden Datei wurde nichts geändert.
- **Getrennte Status:** **Behoben und geprüft:** Nenner-/Matrixabweichung und Fixtureassertions; statischer Pfad-/Asset-/Localeabgleich; späteres Runbook vorbereitet. **Teilweise geprüft:** nur lokaler Node/Jest-Testvertrag und statische Quellenauflösung. **Blockiert:** praktische OBS-Abnahme bleibt bis expliziter Nutzer-Wiederaufnahme plus CEO-Gastfreigabe pausiert; 88 Matrixfälle ohne benannte Fixtures und 4 Music-Bot-Routenquellenkonflikte bleiben Folgearbeit. **Nicht geprüft:** Browser-/OBS-Sichtbild, tatsächlicher Gastlauf, isolierte VM, Performance und reale Laufzeitintegration.

## P2 — Öffentliche OBS-Fälle: erste Hochrisiko-Fixture ergänzt (2026-10-08)

- **CEO-Folgeauftrag:** Unter den 68 öffentlichen Rendererfällen die Fälle mit dem höchsten Nutzer-/Release-Risiko und ohne nützliche synthetische Regression identifizieren; bis zu zehn isolierte Fixture-/DOM-/Sockettests ergänzen. OBS/VM/Server-/Produktprozesse, `main.js`-Änderungen und Duplikate für Viewer-XP, Sidekick, TopTier und Music Bot sind ausgeschlossen. Retirement- und Closed-Beta-Fälle bleiben getrennt.
- **Erste Umsetzung:** OpenShock-Primary-Overlay besitzt jetzt einen JSDOM-Test mit in-memory Socket.IO und lokal gefälschtem Config-GET für de/en/es/fr. Der Test kontrolliert Textescaping, Schlüsselredaktion, synthetische Command-Anzeige, Reconnect und Listener-/Timer-Cleanup. Kein Backend/Connector, Gerätezugriff oder Produktcode wird geladen. Matrix-Audit zählt dadurch 20 Fälle mit benanntem Fixture und 84 ohne; OpenShock zählt zu den öffentlichen Fällen. Die 4 OpenShock-Zeilen bleiben ausdrücklich `OBS NOT_TESTED`.
- **Rangfolge der zehn noch offenen öffentlichen Fälle ohne ausreichend spezifischen Renderer-Triggerbeleg (case IDs):** 1–4 `flame-overlay:de/en/es/fr` (vorhandener Test deckt Initialisierung/BFCache/Dispose, aber keinen synthetischen Effekt-Trigger und dessen sichtbaren Zustand ab); 5–8 `fireworks:de/en/es/fr` (vorhandener Test deckt primär Seitenlebenszyklus ab, nicht den echten Overlay-Triggerpfad); 9–10 `webgpu-fireworks:de/en` (vorhandene Lifecycle-Fixture prüft unsupported-GPU, Konfiguration und Cleanup, aber keinen akzeptierten scoped fireworks-Trigger). Auswahl priorisiert Lücken zwischen konkretem Renderer-Trigger und sichtbarer Wirkung; vorhandene Tests wurden inhaltlich gelesen und nicht nur nach Dateiexistenz gewertet. Localevariante ist als eigener Matrixfall geführt. Diese zehn sind die nächste Arbeitsreihenfolge, keine OBS-Resultate; in diesem Schritt wurden keine ihrer Fixtures ergänzt.
- **Prüfung:** Quellenrevalidierung `scripts/obs-pilot/test/obs-104-source-reverification.test.js`: **6/6 Node-Tests PASS**; Syntaxchecks für OpenShock-Fixture, Matrixgenerator und Revalidierung PASS. OpenShock-Jest-Fixture war in einem vorherigen Lauf **1 Suite / 4 Tests PASS**. Der aktuelle Wiederholungslauf scheiterte vor Teststart mit `EPERM` beim `realpath` des Jest-Tempverzeichnisses, auch mit workspace-lokalem `TEMP`; kein Testfehler. Matrixgenerator konnte wegen des parallelen `plugin-release-policy.json`-Schlüssels `publicAssetPathOwners` nicht laufen (`unknown key` im gemeinsamen `published-plugin-catalog.js`-Validator). Der Generator/Policy-Konflikt wurde nicht verändert. Die manuell aktualisierte Matrix und Auditwerte wurden durch den Node-Revalidierungstest geprüft.
- **Geänderte Dateien in diesem Teilauftrag:** `app/plugins/openshock/test/obs-primary-overlay-fixture.test.js`, `scripts/obs-pilot/build-obs-104-matrix.js`, `scripts/obs-pilot/test/obs-104-source-reverification.test.js`, `scripts/obs-pilot/test/obs-104-matrix.test.js`, `docs/coordination/obs-104-acceptance-matrix.json`, `docs/coordination/obs-pruefplan.md`, `docs/coordination/prioritaeten-fortschritt.md`. Kein `main.js`, kein Produkt-/Server-/OBS-Code.
- **Status getrennt:** **Synthetisch geprüft:** OpenShock vier Localefälle; Quellrevalidierung 6/6. **Teilweise geprüft:** Jest-Vorherlauf 4/4; aktueller Wiederholungslauf durch Temp-EPERM blockiert. **Blockiert:** automatische Matrixregeneration bis der parallel geänderte Release-Policy-Schlüssel mit dem strikten Katalogschema abgeglichen ist. **Nicht geprüft:** alle 104 OBS-Fälle bleiben `NOT_TESTED`; insbesondere keinerlei OBS-/VM-/Produktprozess oder Bildreview.

## P2 — Flame-/Fireworks Trigger bis Rendererwirkung (2026-10-08)

- **CEO-Auftrag:** Acht synthetische Locale-Fälle für Flame Overlay und Fireworks (je de/en/es/fr), reale Trigger-Eventform bis sichtbarer Rendererwirkung; keine OBS-/Produkt-/Liveaktion. Policyvalidator-Konflikt unverändert lassen; bei unklarer Payload blockieren.
- **Semantik bestätigt:** Flame Overlay `main.js:dispatchTrigger()` emittiert `flame-overlay:trigger` mit Trigger-ID, `type`, `amount`, `duration`, `revert`, `source`. Die `gift:100`-Regel liefert `type:intensity-boost`, `amount:0.5`, `duration:5000`, `revert:true`, `source:gift:100`; Renderer erhöht die Flame-Konfiguration und führt den Uniform-Updatepfad aus. Fireworks `main.js:triggerFirework()` emittiert den normalisierten `fireworks:trigger` mit Position, Form, Farben, Intensität, Partikelanzahl, Nutzer-/Coins, Audio- und Gift-Popup-Feldern; der Renderer erzeugt ein Firework und rendert die lokalisierte Gift-Karte. Keine Payload wurde aus dem Overlay-Plan geraten.
- **Umsetzung:** Neue isolierte `app/test/obs-priority-trigger-renderer-fixtures.test.js` lädt die Originalrenderer. Flame nutzt fake Config-GET, in-memory Socket und kontrollierten Uniform-Eingabepfad; Fireworks nutzt in-memory Socket, fake init ohne Audio/GPUstart, verbietet fetch, setzt `playSound:false` und prüft echte Firework-Instanz/Koordinaten sowie Locale-Text im DOM. Keine Plugin-`main.js`, Produkt- oder Serveränderung.
- **Tests:** Gebündeltes Projekt-Node 22.14 Jest: **1 Suite / 8 Tests PASS**. Enthält die vier Locale-Fälle je Plugin. `node --check` PASS. Der erste Jestlauf fand korrekterweise einen doppelten Flame-DOMContentLoaded-Bootstrap in der Testfixture (Fireworks 4/4 PASS); Fixture wurde angepasst, anschließender kompletter Lauf war grün. Quellenrevalidierung anschließend **6/6 PASS** mit 28 benannten Fixturefällen und 76 ohne Deklaration; Bericht `docs/coordination/obs-104-current-source-audit-20261008.json` aktualisiert. Matrixgenerator-Suite wurde wegen des parallel vorhandenen unbekannten Policy-Schlüssels nicht erneut ausgeführt.
- **Dateien:** `app/test/obs-priority-trigger-renderer-fixtures.test.js`, `scripts/obs-pilot/build-obs-104-matrix.js`, `scripts/obs-pilot/test/obs-104-matrix.test.js`, `scripts/obs-pilot/test/obs-104-source-reverification.test.js`, `docs/coordination/obs-104-acceptance-matrix.json`, `docs/coordination/obs-104-current-source-audit-20261008.json`, `docs/coordination/obs-pruefplan.md`, `docs/coordination/prioritaeten-fortschritt.md`. Die Matrixzeilen wurden lokal aktualisiert; automatischer Generator bleibt wegen fremder Policy-/Katalogschemaänderung blockiert.
- **Getrennte Status:** **Synthetisch geprüft:** Flame Overlay und Fireworks, acht Locale-Fälle, jeweils Socketevent bis Rendererstate/DOMwirkung. **Teilweise geprüft:** Renderer-Uniformeingang ist für Flame getestet, aber kein echter WebGL-Shader/Pixeloutput; Fireworks zeigt DOM-Popup und instanziiert Partikelmodell, aber kein realer GPU-Pixeloutput. **Blockiert:** Matrixgenerator aufgrund paralleler `publicAssetPathOwners`-/Validatorabweichung. **Nicht geprüft:** OBS bleibt 104/104 `NOT_TESTED`, 0 OBS-Pässe; kein OBS-/VM-/Server-/Produktprozess oder Bildreview.

## P2 — Matrixgenerator wiederhergestellt und Renderer-Folgebelege gezählt (2026-10-08)

- Nach Aktualisierung der isolierten Rendererprofile verschwand der zuvor beobachtete `publicAssetPathOwners`-Validatorfehler im aktuellen gemeinsamen Stand. `scripts/obs-pilot/build-obs-104-matrix.js` erzeugte erfolgreich alle 104 Fälle/26 Profile; kein Release-Policy- oder Katalogschema-Code wurde verändert.
- **Read-only Coverage-Audit der 68 öffentlichen Matrixfälle:** 47 haben im geprüften Fixtureinhalt konkrete Event-/Rendererzustands- oder DOM-Folgeassertions, 2 nur partiellen Nachweis (ClarityHUD `es`, Weather Control `en`), 19 keinen konkreten Folgebeleg. Davon sind 40 Fälle in zehn Locale-parametrisierten Gruppen abgedeckt; weitere sieben gezielte Einzel-Locales stehen im Audit. 32 Closed-Beta-Fälle und vier Retirement-Kontrollen sind getrennt und nicht im 68er-Nenner.
- **Grenze:** Nur die acht neuen Flame-/Fireworks-Fälle wurden in diesem Schritt frisch mit Jest ausgeführt. Die Zählung der übrigen Fixtures basiert auf read-only Inhaltsprüfung der Assertions; sie ist weder eine frische Komplettausführung noch ein OBS-/Bildreview.
- **Prüfung:** Matrixregression **11/11 Node-Tests PASS**, Quellenrevalidierung **7/7 PASS**; Generierung 104/26 erfolgreich; anschließende Auditwerte 28 Fälle mit benanntem Fixture / 76 ohne, 0/104 OBS-Pässe, 104 `NOT_TESTED`. Die neuen Rendererfixtures: **1 Suite / 8 Tests PASS** (gebündeltes Projekt-Node 22.14). `node --check` und `git diff --check` im Scope PASS.
- **Bericht:** `docs/coordination/obs-104-renderer-followthrough-audit-20261008.md`. Keine Produkt-/Server-/Overlay-Registrierungsänderung, kein OBS-/VM-/Liveprozess. P2 praktische OBS-Abnahme bleibt offen.
- **Getrennte Status:** **Synthetisch geprüft:** acht Flame-/Fireworks-Locales; Matrix-/Quellenprüfungen grün. **Teilweise geprüft:** 47 direkte und 2 partielle Folgebelege im Bestand, aber ältere Suites in dieser Read-only Zählung nicht erneut ausgeführt. **Blockiert:** nichts beim Matrixgenerator; praktische OBS-Abnahme bleibt im pausierten Gate. **Nicht geprüft:** 104/104 tatsächliche OBS-Fälle, unabhängiger Bildreview und End-to-End-Produktintegration.

## P2 — Emoji Rain `en` Renderer-Folgefixture (2026-10-08)

- **CEO-Einzelauftrag:** Genau einen öffentlichen OBS-Matrixfall ohne konkreten Renderer-Folgebeleg auswählen und mit einer isolierten synthetischen Renderer-/DOM-Fixture schließen. Keine OBS-/VM-/Server-/Live-/Policyänderung und keine gemeinsame Matrixgeneratoränderung.
- **Auswahl und Befund:** `emoji-rain:en` priorisiert wegen des sichtbaren öffentlichen Effekts und der Nutzerdaten-Grenze bei optionalen Viewer-Zuordnungen. Der Originalrenderer übernimmt `emoji-rain:spawn`; bei aktivierter Konfiguration und Kategorie `emoji` erzeugt `count`, `emoji`, `x` und `y` ein `.emoji-sprite` im HUD. Die Fixture sendet absichtlich keine Username-, Profilbild- oder Mappingdaten.
- **Umsetzung/Dateien:** Neu `app/test/emoji-rain-en-renderer-fixture.test.js`, JSDOM mit Original-HTML/Renderer, in-memory Socket, begrenzte synthetische Antworten auf die drei vorgesehenen GET-Lesewege und kontrollierte Timer. Ein synthetischer Spawn erzeugt genau einen sichtbaren DOM-Sprite; danach prüft `pagehide` Socket-/Timer-/DOM-Cleanup. Keine Produktdatei oder gemeinsame API geändert. Der Renderer-Folgebeleg-Audit zählt nun 48 direkte Fälle, 2 partielle und 18 ohne konkreten Folgebeleg; die OBS-Matrix und ihr Generator wurden nicht verändert.
- **Tests:** Gebündeltes Projekt-Node 22.14, gezielter Jestlauf aus `app/`: **1 Suite / 1 Test PASS**. Ein weiterer Jeststart außerhalb des Projektverzeichnisses scheiterte beim jsdom-Abhängigkeitsimport (`@exodus/bytes` ESM in Jest-CJS), vor Testausführung; der korrekte app-seitige Lauf bestand. Syntaxcheck PASS und scoped Whitespace-/Diffprüfung PASS.
- **Getrennte Status:** **Synthetisch geprüft:** ein `emoji-rain:en` Spawn-Event bis zum sichtbaren Originalrenderer-DOM samt Cleanup. **Teilweise geprüft:** Locale wird für diese Fixture explizit auf `en` gesetzt; sie prüft keine lokalisierten UI-Texte, sondern den locale-spezifischen Matrixfall plus identischen visuellen Spawn-Vertrag. **Blockiert:** nichts im Fixtureumfang. **Nicht geprüft:** OBS/Browser-Source, Pixel-/Bildreview, reale Socket-/Produktintegration oder Laufzeitperformance; alle 104 OBS-Matrixfälle bleiben `NOT_TESTED`.

## P2 — Weather Control `de` Renderer-Folgefixture (2026-10-08)

- **CEO-Einzelauftrag:** Eine der verbleibenden 18 öffentlichen Renderer-Folgebeleg-Lücken risikobasiert auswählen und genau eine isolierte synthetische Fixture im Originalrenderer/DOM ergänzen. Keine Produkt-/Policy-/Matrixgeneratoränderung und kein OBS-/VM-/Server-/Liveprozess.
- **Auswahl/Befund:** `weather-control:de` priorisiert, weil es den sichtbaren öffentlichen Wettereffekt bis zur realen Renderer-Engine abdeckt; der vorhandene Test prüfte nur den Engine-Aufruf, nicht den aktiven Effekt-/Partikelzustand. `main.js` enthält parallele fremde Änderungen und blieb unangetastet; Overlay und WeatherEngine wurden nur gelesen und sind im Arbeitsbaum unverändert.
- **Umsetzung/Dateien:** Neu `app/test/weather-control-de-renderer-effect-fixture.test.js`; lädt Original-Overlay und Original-WeatherEngine, lokale synthetische Config-/Gamification-Antworten, in-memory Socket und kontrollierte Timer. Ein minimales anonymes `weather:trigger` erzeugt aktiven `rain`-Enginezustand und Partikel. Der Folgebeleg-Audit zählt nun 49 direkt, 2 partiell, 17 ohne konkreten Nachweis. Keine Produktdatei, Matrix oder Generator geändert.
- **Tests:** Gebündeltes Node 22.14, gezielter Jestlauf aus `app/`: **2 Suiten / 2 Tests PASS** (neue Fixture plus bestehender Wetter-Payloadtest); `node --check` PASS. Scoped Whitespaceprüfung PASS.
- **Getrennte Status:** **Synthetisch geprüft:** Event bis zum Originalengine-Partikelzustand. **Teilweise geprüft:** Enginezustand, keine echten Pixel oder lokalisierten UI-Texte. **Blockiert:** nichts im Fixtureumfang. **Nicht geprüft:** OBS/Browser-Source, reale Socket-/Produktintegration, Bildreview, Performance und Liveevent; alle 104 OBS-Fälle bleiben `NOT_TESTED`.

## Ergänzung 2026-10-09 — kombinierter MPV-Retest fehlgeschlagen
Die früheren getrennten MPV-/Plugin-Fixtures bleiben als komponentenbezogene Belege erhalten. Der heute autorisierte, gepinnte Einmal-Kandidatenlauf mit kombinierter Steuerungs-/Seek-A→B-Sequenz scheiterte jedoch vor den eigentlichen Controls/Seek am nicht bestätigten MPV-IPC-`get_property`. Deshalb darf Punkt 1 nicht pauschal als durch diesen kombinierten Ablauf geschlossen gelten; erfolgreiche Einzel-Fixtures sind davon getrennt. Kein Retry ohne neue Nutzerfreigabe. Exakte Receipt- und Sicherheitsgrenzen siehe `CEO_HANDOFF.md`, Eintrag vom 2026-10-09.

## Ergänzung 2026-10-09 — Music-Bot getPosition IPC-Kandidat
- Der letzte genehmigte kombinierte MPV-Lauf bleibt fehlgeschlagen und die Einmalfreigabe ist verbraucht. Eine dependencyfreie Fake-Socketprobe reproduzierte in der aktuellen Shared-Quelle zwei Defekte im speziellen `getPosition()`-Pfad: fragmentierte JSON-Antworten führen zum Timeout; MPV-Fehlerantworten ohne `data` werden ebenfalls als Timeout gemeldet. `_sendCommand()` verwendet bereits den newline-buffernden Parser und liefert Fehler direkt weiter.
- Isolierte Kopie `C:\Users\logga\.codex\worktrees\mpv-get-position-ipc-20261009` delegiert `getPosition()` an `_sendCommand()`. **4/4 synthetische Verträge PASS** plus Syntaxcheck. Raw Frames des MPV-Fehllaufs fehlen; Zusammenhang bleibt plausibel, nicht bewiesen. Shared-Datei unverändert. Kein MPV/App/Server/DB/Profil/Netzwerk/Audio.
- Status Punkt 1: **in Arbeit, nicht CEO-abgenommen**; CTO-Review angefragt. Keine erneute MPV-Ausführung ohne neue konkrete Freigabe. Keine spätere Priorität vorgezogen.
## Statuskorrektur 2026-10-09 — Candidate review
- CTO hat den engen IPC-Kandidaten read-only als Source-GO bestätigt; missing `data` guard danach ergänzt und von CTO erneut als fail-closed bestätigt. Bundled Node 22.14.0: 5/5 fake-socket cases PASS plus syntaxcheck. Candidate SHA `18F90A4E205A0718047A27AE0F0FAC96DFECBEBCFA4F515BF98F86F691D0F193`; Shared source weiterhin SHA `583F45D2B46E5A19974F0CD4833B074B3C367DF07593C2C97FACFFBBE7C20058`.
- Ein einziger höchstens 15-sekündiger echter MPV-Null-AO-Kandidatenlauf wurde konkret zur Freigabe vorgelegt. Bis zur ausdrücklichen Antwort: kein Prozessstart. Die frühere MPV-Einmalfreigabe bleibt verbraucht.

## 2026-10-09 — MPV-Runner Review (isoliert, noch nicht ausgeführt)
- Der CTO hat die exakt gepinnte Runnerquelle `C:\Users\logga\.codex\worktrees\mpv-get-position-ipc-20261009\one-shot-null-mpv.manual.cjs` mit SHA-256 `04F84BE9743AEF5D4B4E12ACF98F7D38F3523F48300FC50AD463091F7F2456B2` read-only als Source-GO beurteilt. Der Runner fixiert MPV 0.41.0 per SHA, erzwingt Null-AO/no-config/no-scripts, temporäre Userdatenumgebung ohne Proxyvariablen, höchstens einen Spawn, Child-PID-Erfassung und Spawn-Sperre beim Watchdog/Cleanup. Jede Testphase raced gegen den 11-s-Testwatchdog; Cleanup ist ausdrücklich zusätzliche bounded best-effort Zeit und keine harte Gesamt-Wallclock-Garantie.
- Der CTO weist ausdrücklich darauf hin, dass Promise.race innere JavaScript-Continuations nicht abbricht; spätere Testschritte werden verhindert, und der Spawn-Gate blockiert neue MPV-Prozesse. Tempdaten werden nur bei bestätigtem Child-Exit und leerer Owned-PID-Registry gelöscht, sonst behalten und FAIL gemeldet.
- CTO hat nichts ausgeführt oder geändert. Nur `node --check` des CEO über den Kandidaten; kein MPV-/Prozess-/Audio-/Netz-/Profil-/DB-Lauf. Die frühere Popup-Freigabe bezog sich auf eine inzwischen ersetzte Runnerfassung und wird nicht verwendet; vor einer Laufzeitprüfung ist eine neue konkrete Nutzerfreigabe auf den exakten Hash nötig.
- Candidate bleibt außerhalb des Repositorys; Shared-Produktdatei unverändert. Punkt 1 bleibt **IN ARBEIT / nicht abgenommen**.


## 2026-10-09 — MPV-Null-AO-Lauf: erster Retry-Kandidat fehlgeschlagen
- Auf die direkte Nutzeranweisung „mach das noch“ wurde genau einmal Runner `04F84BE9743AEF5D4B4E12ACF98F7D38F3523F48300FC50AD463091F7F2456B2` gestartet. Ergebnis: FAIL `mpv command failed: property unavailable`, Child Exitcode 1; Cleanup bestätigte das Ende des einzigen eigenen MPV-Prozesses und entfernte die eigene Fixture. Der Runner enthielt keine Phasenangabe, daher ist die fehlende Property nicht belegt; kein Schluss, ob getPosition, Volume oder anderer Schritt scheiterte. Diese Runfreigabe ist verbraucht; kein Retry gestartet.
- Isolierter Runnerkandidat `C:\Users\logga\.codex\worktrees\mpv-get-position-ipc-20261009\one-shot-null-mpv.manual.cjs` wurde anschließend ausschließlich statisch geändert: Phasenlabels bei jedem Testschritt; nur `property unavailable` während der bestehenden maximal fünfsekündigen getPosition-Progresssuche wird in 100-ms-Abständen erneut abgefragt; andere Fehler bleiben FAIL. SHA-256 jetzt `C4091E9C63D1806934186A13EAA4C681CDF8E26C8464487A0998E6F5557AD5B2`; `node --check` PASS. CTO prüft diese exakte Fassung read-only. Ein erneuter MPV-Lauf braucht eine neue konkrete Einmalfreigabe.
- Keine Änderung an Shared-Produktcode. Punkt 1 bleibt **IN ARBEIT / nicht abgenommen**; keine spätere Priorität vorgezogen. Kein Release/Push/Signierung/Publish/Deployment.


## 2026-10-09 — Instrumentierter MPV-Null-AO-Lauf bestanden
- Nach separater frischer Einmalfreigabe wurde exakt der CTO-geprüfte Runner `C4091E9C63D1806934186A13EAA4C681CDF8E26C8464487A0998E6F5557AD5B2` gestartet. Ergebnis **PASS**: `getPosition` beobachtete Fortschritt, Pause-/Resume-Property bestätigt, Seek während Pause bestätigt, Volume 0 bestätigt, Stop/Shutdown erfolgreich. MPV `v0.41.0` Binary-Hash gepinnt; exakt ein Child, Exitcode 0, Owned-PID-Registry leer, eigener Tempordner gelöscht.
- Dieser Beleg ist echte lokale MPV-Prozesswiedergabe über Null-AO; kein hörbarer Ton in diesem Lauf. Keine Suche/Provider, Queue-/DB-Integration oder Heartbeat in diesem Test. Der frühere historische hörbare synthetische Ton bleibt separate menschliche Hörbestätigung und bezieht sich auf einen älteren Quellstand.
- Einziger unveröffentlichter Patch bleibt isoliert: `PlaybackEngine.getPosition()` Kandidat unter `C:\Users\logga\.codex\worktrees\mpv-get-position-ipc-20261009`. Kein Shared-Produktcode übertragen. Punkt 1 daher **weiter IN ARBEIT / nicht abgenommen**; Suche, Queue, Heartbeat und current-source binding bleiben offen.
- Der Repositoryzustand bleibt `main` bei `1957f7a6`, `[ahead 73, behind 2]`, ca. 1.137 Statuszeilen; Releaseversion in Root- und App-Metadaten weiterhin `1.4.4`. Kein Commit/Build/Sign/Push/Release/Publish/Deployment.


## 2026-10-09 — Sauberer Music-IPC-Kandidat committed (nicht veröffentlicht)
- Im sauberen Integrationsbranch `codex/market-readiness-20261009`, Parent `37ef1972df88bca21f53abd1629bcb66bfaf2cc3`, wurde nur der `getPosition()`-Parserfix plus enger Fake-Socket-Test festgeschrieben: Commit `205cd6fddef986c8204d5eee092b7a7843d5d757`. Branch bleibt lokal/unpublished. Nur `app/plugins/music-bot/lib/playback-engine.js` und `app/test/music-bot-get-position-ipc.test.js` enthalten.
- CTO Source-GO bezieht sich auf diese exakten zwei Pfade; die 6 Fake-Socket/Jest-Fälle sind **nicht ausgeführt**, da `app/node_modules` fehlt (AGENTS-Testvoraussetzung). Node-Syntaxchecks für beide Dateien und scoped whitespace-Prüfung bestanden. Die vier relevanten Methoden stimmen nach Zeilenenden-Normalisierung mit der vorherigen Testkopie überein. Der spätere einmalige Null-AO-PASS lief gegen exakt diesen Commit-Enginehash `D87B4B8CFA43E7861FCD314264456C2078C0DCF231C18443A4CA6D32DB889DFD` (siehe neueren Receipt unten); er ist source-bound für die Engine, jedoch kein Paket-, Provider-, Queue- oder Heartbeat-Nachweis.
- `git commit` meldete einen fehlgeschlagenen optionalen `gc/repack` wegen einer defekten internen checkpoint-Ref, danach aber erfolgreichen Commit und sauberen Kandidatenbranch. Kein `git gc`, Ref-Löschung oder Reparaturversuch durchgeführt. Kein Push/Release/Sign/Build/Publish/Deployment. Versionsmetadaten bleiben 1.4.4.
- Gesamtpunkt 1 **weiter IN ARBEIT**: Queue-/Resolver-/Heartbeat-/hörbarer Audio- und vollständiger Produktpfadbeleg bleiben offen; der exakte Engine-Null-AO-Runtime-Test ist inzwischen bestanden. OBS und nachfolgende Zielpunkte warten.

## Ergänzung 2026-10-09 — Source-bound MPV-Null-AO-PASS auf Commit `205cd6f`
- Genau ein frisch genehmigter, CTO-geprüfter Runner (`26E32EF7B7BE39EB7ED47AD7CA83E20913A47E241C0A95FB2BD841F718C7DDD7`) lief gegen sauberen Commit `205cd6fddef986c8204d5eee092b7a7843d5d757` und exakten Engine-SHA `D87B4B8CFA43E7861FCD314264456C2078C0DCF231C18443A4CA6D32DB889DFD`. **PASS** für Fortschritt, Pause/Resume, Seek während Pause, Volume 0 und Shutdown; MPV 0.41.0 SHA `7C87582006C31CF42C81747B7FEC598A88430D46A45FBFB24161EC6BC213B591`, Child Exit 0, Cleanup bestätigt.
- Nur lokaler synthetischer Null-AO-Prozesslauf; kein hörbarer Ton, Provider/Suche, echte Plugin-Queue, Heartbeat oder Profil-/Datenbank-/Appserverintegration. Freigabe verbraucht, kein Retry. Punkt 1 bleibt IN ARBEIT; kein Push/Release/Build/Sign/Publish/Deployment.

## Statuskorrektur 2026-10-09 — sauberer Commit-Runtimebeleg
- Maßgeblich ist der unmittelbar vorherige Eintrag: Commit `205cd6f` hat inzwischen den genehmigten Null-AO-Runtime-PASS. Ältere Einträge, die für diesen exakten Commit einen Runtime-Test als offen führen, sind überholt. Der PASS deckt nur den lokalen synthetischen `getPosition`/Pause/Resume/Seek/Volume-0/Stop-Shutdown-Lauf ab; reale Suche, Queue-Integration, hörbare Ausgabe und Heartbeat bleiben offen. Punkt 1 bleibt IN ARBEIT.

## 2026-10-09 — PlaybackController Pause/Resume-Regressionsfall vorbereitet
- CTO read-only empfahl als nächsten Source-Schritt genau einen Controller-Fake-Test. Im sauberen Kandidatenbranch kam der Test `pauses and resumes the active slot without replaying or replacing its track` hinzu; Commit `2f2747e448524b832823b832cf3f0521b1e47c98` (Parent `205cd6fddef986c8204d5eee092b7a7843d5d757`). Prüft aktive Engine, Positionssnapshot bei Pause, Transportstatus paused/playing, unveränderte Playback-ID/Track, genau einen Play-Aufruf und keinen Slot-Shutdown. Keine Produktdatei geändert, keine QueueManager-/Plugin-/DB-Integration behauptet.
- `node --check app/test/music-bot-playback-controller.test.js` und scoped `git diff --check` bestanden. Jest nicht ausgeführt: `app/node_modules` fehlt, gemäß AGENTS-Testvoraussetzung. Keine Installation, Imports, Runtime, MPV, Audio, Netzwerk, Profile, DB, Server oder echte Queue-Aktion.
- `git commit` gelang; optionales Auto-gc/repack meldete erneut dieselbe defekte interne checkpoint-Ref, die nicht verändert wurde. Branch lokal/unpublished und sauber. Zielpunkt 1 bleibt IN ARBEIT.

## 2026-10-09 — gezielte Jest-Wiederholung vor Teststart blockiert
- Im sauberen Kandidaten `2f2747e` wurden die beiden engen Music-Bot-Suiten (`music-bot-get-position-ipc.test.js`, `music-bot-playback-controller.test.js`) nur gezielt aufgerufen. Jest stoppte vor Testcollection mit `Cannot find module 'ansi-styles'` aus dem vorhandenen Shared-Dependencybaum (`chalk/source/index.js` → `jest-cli`). Somit **kein Test bestanden oder fehlgeschlagen**; der Lauf ist dependency-blockiert. Der gemeinsame `app/node_modules` existiert, ist aber unvollständig; der Clean-Candidate hat keine lokale `app/node_modules`-Kopie. `package-lock.json` ist in Shared und Candidate bytegleich; eine Installation/Netzwerkaktion wurde nicht vorgenommen. Der Aufruf nutzte Node `v24.16.0`, außerhalb der in den Projektinfos genannten Node-20/22-Matrix; kein weiteres Jest-Retry ohne intakten gepinnten Laufzeit-/Dependencybaum.
- Der zuvor hinzugefügte Regressionstest bleibt unbestätigter Testcode. Candidate-Branch bleibt unveröffentlicht; Punkt 1 IN ARBEIT. Keine Produkt-/Profil-/DB-/MPV-/Audio-/Provideraktion.

## 2026-10-09 - CTO read-only review of the PlaybackController regression
- CTO reviewed commit `2f2747e448524b832823b832cf3f0521b1e47c98` at the exact HEAD: only one test file changed (33 lines), no product code. The focused FakeEngine happy path calls real `PlaybackController.play/pause/resume` and checks `getPosition(timeoutMs:500)`, pause/resume calls, active slot and playback identity, paused-to-playing state, saved position 37, track identity, no replay, and no shutdown. No obvious state/race flaw in the changed hunk; Source-GO for this test scope, not an execution receipt.
- Limits: no concurrent/retirement race, rejection, safety-lock resume, queue/DB ordering, or MPV/IPC/audio integration. The targeted Jest attempt stopped before test collection because `ansi-styles` is missing; zero new test cases ran. Point 1 remains IN ARBEIT. CTO performed no execution or changes.

## 2026-10-09 - Music-Bot-Candidate: gezielte Controller-Regression bestanden
- Im isolierten Branch `codex/market-readiness-20261009` wurde die mit der unveraenderten Lockdatei installierte Jest-Umgebung verwendet (`npm ci --ignore-scripts --no-audit --no-fund`, 1,065 Pakete; keine Lifecycle-Skripte). Der erste gezielte Lauf fand einen Testfixture-Fehler: `track-start` mutiert das Trackobjekt um `playbackId`/`playbackSlot`; eine Deep-Equality-Assertion war deshalb zu streng. Nur die Testassertion wurde korrigiert und als `bb132aba8b22433604342c84d989c611021e6c87` committed (Parent `2f2747e448524b832823b832cf3f0521b1e47c98`).
- Exakter Wiederholungslauf im Candidate `app/`: `node node_modules/jest/bin/jest.js --runTestsByPath test/music-bot-get-position-ipc.test.js test/music-bot-playback-controller.test.js --no-cache --runInBand --detectOpenHandles` -> **2 Suiten / 68 Tests PASS**, keine offenen Handles gemeldet. Testhash `93686F622347D129A29344DEECF1ECF23A06C4E594A15209B6EDA2603CD82449`. Node `v24.19.0`, innerhalb `app/package.json` engines `>=18 <25`; keine Node-22-Paritaet daraus ableiten.
- CTO pruefte den finalen Testcommit und Testhash read-only als Source-GO: Assertion ist nach der Trackmutation sachgerecht, kein weiterer Aenderungsbedarf fuer den seriellen FakeEngine-Happy-Path. CTO hat nichts ausgefuehrt/geaendert.
- Beleggrenze: synthetische Controller/IPC-Parser-Jest-Suiten; kein Provider/Netzwerk, echte Plugin-Queue/DB, hoerbare Audioausgabe, Heartbeat-Recovery, MPV-Lauf oder Appserver. Die fruehere fehlende `ansi-styles`-Abhaengigkeit wurde nicht im Shared-Tree repariert; die vollstaendige Lock-Installation liegt ignoriert im isolierten Candidate. Gemeinsame dirty Arbeit blieb unangetastet. Kein Push/Release/Sign/Publish/Deployment; Punkt 1 bleibt IN ARBEIT.

### 2026-10-09 — Music Bot: einmaliger hörbarer Engine-Tontest
- Status Punkt 1: **IN ARBEIT**. Geprüfter Runner SHA `D2A20A7B747AB8D29D129A994EBD942C172F965D9EDCA412E8C05788AA6A4977`; CTO Source-GO, `node --check` PASS. Eine ausdrücklich freigegebene lokale synthetische 2 s / 440 Hz Wiedergabe über gepinnte MPV 0.41.0 und PlaybackEngine bei Volume 60 endete technisch PASS (ein Kindprozess, Exit 0, temporäre Daten bereinigt). Nutzer-Hörbestätigung steht aus; der technische PASS belegt sie nicht.
- Noch offen: öffentliche Provider-Suche und Trackwiedergabe, echte Plugin-Queue/Persistenz und Shutdown-Recovery, Heartbeat. OBS bleibt zurückgestellt; danach folgen Prioritäten 3–6 in Reihenfolge. Keine Release-/Publish-Aktion.

- Hörnachweis nach dem Test: Nutzer bestätigte „Ja, klar gehört“. Damit ist der exakt eine synthetische 2-Sekunden-Ton auch menschlich hörbar bestätigt. Keine Freigabe für weitere Audioaktionen abgeleitet.

### 2026-10-09 — localhost dashboard: Vorschau-Isolation statt belegtem Profil-UI-Fehler
- `localhost:3000` läuft mit isoliertem temporären Docs-Capture-Profil. Die `/api/profiles`-Antwort enthält dort nur `default`; die separate normale lokale Profildatei `pupcid.db` wurde lediglich per Dateimetadaten bestätigt, nicht geöffnet. Der Settings-Renderer zeigt korrekt die vom Preview-Server gelieferte Profilliste; ein Rendererfehler ist damit nicht belegt.
- Clerk ist im Capture-Modus absichtlich deaktiviert: Dotenv/Connectoren werden nicht geladen, sodass `CLERK_PUBLISHABLE_KEY missing` in dieser Vorschau erscheint. Das ist inhaltlich erwartbar, aber die UI-Meldung ist irreführend. Speicherort/Migrationsstatus zeigen zusätzlich Fehler, weil Preview-Umgebung und `os.homedir()` nicht zusammenpassen.
- Keine Daten, Schlüssel, Profile oder Prozesse verändert. Für die echte Profilliste ist ein normaler Start mit dem lokalen Datenverzeichnis erforderlich; das würde reale Profile lesen und ist noch nicht freigegeben. Keine spätere Priorität oder Releasearbeit vorgezogen.

## CEO-Statuskorrektur 2026-10-09 — Punkt 1 bleibt offen

Bei der aktuellen Handoff-Prüfung wurde ein widersprüchlicher älterer Status entdeckt: Der spätere Abschnitt „Status“ markiert Punkt 1 als unabhängig abgenommen, während die aktuelle P1-Zusammenfassung und die jüngeren Receipts ausdrücklich offene Gates nennen. Maßgeblich ist für die vollständige Zielbild-Abnahme: **Punkt 1 bleibt IN ARBEIT und nicht CEO-abgenommen.** Die ältere Abnahme beschreibt höchstens die damalige lokale Shared-Arbeitsbasis und schließt die aktuellen Candidate-Anforderungen nicht.

- Neuere, überprüfte Teilbelege: Null-AO-IPC auf Commit `205cd6f`; isolierte Fake-Controller-/IPC-Suiten am Candidate `bb132aba` mit 2 Suiten / 68 Tests PASS; getrennte öffentliche Resolver-Textsuche mit einem Treffer; synthetischer MPV-Hörtest mit Nutzerbestätigung auf einem älteren Quellstand.
- Offen für das angeforderte End-to-End-Ziel: den öffentlichen Provider-Track im Music-Bot-Pfad bis MPV laden und abspielen, Search→Plugin-Queue→Controller→MPV zusammenhängend am aktuellen Candidate belegen sowie Heartbeat-/Recovery- und Queue-Persistenz/Shutdownintegration schließen. Vorhandene Such-, Queue-Fixture- und ältere Hörbelege bleiben getrennte Teilnachweise.
- Die Einmalfreigaben für MPV-/Audio-/Providerläufe sind verbraucht. Keine Wiederholung oder Ausweitung ohne eine neue konkrete Freigabe. Punkt 2 (OBS) bleibt zurückgestellt; Punkte 3–6 werden nicht vorgezogen.
- Diese Statuskorrektur ändert weder Quellcode noch Testdaten. Kein Prozess-, Profil-, Datenbank-, Audio-, Netzwerk- oder Releaseeingriff.

### Nachtrag 2026-10-09 — aktueller Engine-Hörpfad bestätigt
Korrektur zur vorigen CEO-Statuskorrektur: Der nutzerbestätigte synthetische 2-s-/440-Hz-Ton war an denselben Engine-SHA `D87B4B8CFA43E7861FCD314264456C2078C0DCF231C18443A4CA6D32DB889DFD` gebunden, der im sauberen Commit `205cd6f` den MPV-Null-AO-Lauf bestand. Der isolierte Candidate `bb132aba` trägt die danach korrigierten Controller-Tests; der Hör-Receipt bezeichnet denselben exakten Enginehash. Damit sind Engine-Null-AO-Steuerung und synthetische hörbare Ausgabe samt Nutzerbestätigung auf dieser Enginequelle erledigt. Der Beleg ist kein Providertrack und keine Search→Pluginqueue→MPV-Integration. Aktuelle Queue-Persistenz/Shutdown- und Heartbeat-/Recovery-Gates bleiben offen; P1 bleibt IN ARBEIT. Die Einmalfreigabe für den Ton ist verbraucht.

### CEO-Konsolidierung nach CTO-Audit — 2026-10-09
Die oberste Kurzfassung dieses Berichts ist teilweise überholt: Der Pause/Resume-Fake-Regressionstest wurde im clean Candidate bis `bb132aba` ausgeführt; zusammen mit der IPC-Suite bestanden 2 Suiten / 68 Tests. Der hörbestätigte synthetische MPV-Ton ist ebenfalls am Enginehash `D87B4B8C…DB889DFD` source-bound und damit ein aktueller Engine-Teilnachweis, kein Ton auf „älterer Quelle“.

Historische lokale QueueManager→Controller→MPV- und Pluginhandler→Queue→MPV-Belege mit direkten lokalen Fixturetracks bleiben gültige Teilbelege, ebenso die getrennte externe Resolver-Textsuche. Sie sind kein durchgängiger Resolverergebnis→Pluginrequest→Queue→MPV-Musiktracklauf. Nicht ausreichend aktuell belegt bleiben außerdem Queue-Persistenz/Host-Shutdown-Recovery und praktischer Heartbeat-/Recoverypfad. P1 bleibt **IN ARBEIT / nicht vollständig CEO-abgenommen**; Punkte 2–6 werden nicht vorgezogen. Diese Konsolidierung ist Dokumentation, keine neue Runtimeprüfung.

## 2026-10-10 — P1: Queue-Shutdown-Schutz statisch geprüft
- CTO-Source-Audit: Reihenfolge „Mutationen sperren → Queue sicher persistieren/wiederherstellen → erst dann MPV beenden“ und Owner-/DB-/HTTP-Erhalt bei Fehler sind im aktuellen dirty Source erkennbar. Erfolgreiches Restore bewahrt pending/current Queue-Einträge vor DB-Inhalt, wendet Banprüfung an und übernimmt Memoryzustand erst nach erfolgreichem DB-Schreiben.
- Limitation: drei schnelle Persistenzversuche (25/75 ms), danach wird Shutdown abgebrochen und ein neuer Launcher-Shutdown-Aufruf benötigt; kein automatischer unbegrenzter Retry. Fehlgeschlagener Unload entfernt Plugin-Routen; Retry läuft über Launcher. Dauerhaft hängendes Destroy blockiert wegen Serialisierung Folgeretries.
- Ergebnis **SOURCE-AUDIT PASS / RUNTIME OFFEN**. SQLite-haltige Retrytests nicht ausgeführt. Keine Laufzeitaktionen oder Quelländerungen. P1 bleibt IN ARBEIT bis Fehler-/Recoverylauf im freigegebenen Candidate und die verbleibende Provider→Queue→MPV-/Heartbeat-Abnahme belegt sind.
