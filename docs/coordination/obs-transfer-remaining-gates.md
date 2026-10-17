## Aktueller Gate-Status — Readiness fail-closed, isolierter Host-OBS-Klon vorbereitet (2026-10-07)

- Maschinenlesbares Gate: [obs-104-renderer-readiness.json](obs-104-renderer-readiness.json), erzeugt durch `scripts/obs-pilot/renderer-readiness.js`. Status `BLOCKED`, Release/Transfer/ISO false, Freeze `HOLD`. 9/9 statische Manifeste und 9/9 CPU-Belege bestehen; tatsächliche Consumer-Localeabdeckung 8/9; Weather-Shared-Source-Review pending; Backend 0/9 und OBS 0/104.
- Negativproben bestanden: pending Weather bleibt trotz stable Owner-Claim blockiert; fehlender Shared Witness, missing evidence, stale source hash, leere family list und doppelte Matrix `caseId` fail closed. `renderer-readiness.test.js` 6/6; `renderer-fixture-contract.test.js` 7/7 (beide direkt via gebündeltem Node 22 ausgeführt).
- Host-Pilot: eigener Klon `tmp/obs-portable-pilot/bin/64bit/obs64.exe` mit portablem Profil `LTTH-Isolated`; 1.685 Dateien / 457.304.146 Bytes kopiert, initialer SHA-Abgleich 0 Abweichungen. WebSocket samt Locale, WASAPI, DirectShow, Windows Capture, VST, RTMP-Services, AJA/DeckLink und Virtual-Camera-Installer ausgeschlossen. Seed lädt CEO-STT-Loopback `http://127.0.0.1:49387/overlay/stt-ticker?lang=de` bei 1280x720, Audioausleitung aus, Mic/Desktop-Audio disabled; Simple Output verhindert unnötigen Advanced Encoderaufbau.
- Computer-Use-Aufruf `sky.launch_app` wurde mit „Computer Use was not approved to use obs64“ abgewiesen; Nutzer kündigte Freigabe an, aber noch keine tatsächliche UI-Freigabe. Keine Shell-/CLI-Umgehung. Der kurze frühere UI-Start vor finalem Seed meldete Startup complete plus Advanced-Encoderfehler; finaler Simple-Mode-Seed wurde seither nicht gestartet. Screenshot/Browserrender bleibt ungeprüft. Nächster Schritt: CEO startet die eigene portable Kopie sichtbar nach bestätigter Computer-Use-Freigabe.
- Keine VM-/ISO-Aktion, OBS-/Serverstart, Firewalländerung, Recording/Streaming, Prozessmutation oder echte Abnahme durchgeführt. Start bleibt separater CEO-Schritt.

- **ViewerXP:** neues source-bound Manifest für drei Renderer und vier Locales, 10 Dateien / 502.279 Bytes. Original-JSDOM-Suite 16/16 PASS; isolierter Manifestcontract 1/1 PASS. Keine OBS-Ausführung.
- **Gesamt-Contract:** alle neun vier-Locale Fixture-Manifeste und fail-closed Negativtests **7/7 PASS**. Quiz-Manifest wurde auf den final owner-bestätigten Renderer, `main.js` SHA `c8aa91ba8334c3f04150335b3774e627fc10c31ba5b955228ee6883861d97857` und Registry SHA `ce94de179543bc839b61bd91abb1b914ad1382a5f6274a0e97d24af3a82c2ef5` aktualisiert; source-review beschreibt den exakt query-gebundenen Round-GET. Quiz CPU Fixture bleibt 4/4 PASS, Round-Route owner suite 6/366 und Consumer suite 3/18 PASS.
- **Weather Control:** statisches Renderer-Manifest pinnt 8 Dateien / 274.572 Bytes. Finaler Overlay SHA `9eeded141cbd7803ba671837926cc9d52f99ae636983ec44836b9c2ad64d128e`, Owner-Test SHA `6e57aa75f231acb280c574f47db1a738434315ac7db7b27ea124022873ab53a1`; Originalrenderer-Jest 1/1 PASS. Der importierte gemeinsame Projektor ist wegen laufender Arena-Arbeit noch nicht source-pinned; finale Weather-Kompatibilitätsregression nach Arena-Owner-Finalbericht ist offen. Kein GPU-/Audio-/OBS-Nachweis.
- ViewerXP-Evidence pinnt die finale Public-Overlay-Registry SHA `ce94de179543bc839b61bd91abb1b914ad1382a5f6274a0e97d24af3a82c2ef5`; der Test überprüft GET/HEAD, POST-Deny und Socket-Allowlist gegen die tatsächliche Registry.
- Nächster Schritt: auf finalen Arena-Owner-SHA und CEO-Kompatibilitätsregression warten, dann Weather-Projektor-Witness final pinnen. Kein OBS/Live-Beleg.

## Vorheriger Gate-Status — Quiz-Manifestpin vor Weather Control (CEO, 2026-10-07)

- Quiz JSDOM bleibt **4/4 PASS**. Der Manifest-Contract ist **4/5 PASS, 1 FAIL** wegen Source-Hash-Drift in `app/plugins/quiz-show/main.js`: Evidence erwartet `68e02ab080d93d6e23d1655b7cb1d08925acfd5cebe77d01d6cb4260763c4269`, aktueller Hash `e68ba7bbe0b48efc0743cade90bcbf7007bedf1ac93c40aceb2ca736c04e48a8`.
- Das aktuelle Producer-Delta umfasst den Public-State-Builder/Requester und einen read-only Round-Leaderboard-Builder. Der zuständige Rechte-Owner arbeitet noch daran. Keine Hashaktualisierung oder Produktänderung, bis der Owner das geprüfte stabile Delta bestätigt.
- Weather Control ist die Folgefamilie. CEO bestätigte, dass der Overlay-Owner ausschließlich `app/plugins/webgpu-weather-control/overlay.html` und `app/plugins/webgpu-weather-control/test/webgpu-weather-control-overlay-lifecycle.test.js` ändert: Config-GET-Dedupe, Config-Refresh und BFCache; Registry/Projektor bleiben unberührt. Renderer-Pins warten auf den finalen SHA. Vorinventar: 4 Locales, 4 statische Rendererquellen (206.719 Bytes ohne Locales), WebGPU-Engine/Framegraph, feste Config-GET-Quelle und Socket-Zustände. GPU-/Audio-/Providerpfade werden nicht ausgeführt.
- Danach: Evidence-Pin nach Ownerabgleich erneuern, Manifestcontract vollständig grün prüfen, anschließend Weather CPU-Fixture mit exakten 4-Locale-/Source-Allowlists sowie Missing-Asset-, Hash-, External- und Dynamic-Negativfällen erstellen.

## Voriger Quiz-Show-Closurestand — vor dem `main.js`-Source-Delta (CEO, 2026-10-07)

### Befund und Ergebnis

- Kuratiertes CPU-Manifest: **11 Dateien / 614.009 Bytes**, inklusive Original-HTML/JS/CSS, Themes, shared i18n, Public-Overlay-Render-Mode, Socket.IO-Client-Hash und vier Plugin-Locales. Manifest-SHA-256: `3fa9e29dd40805129b69b1200c6066d7a7a25fada672a9bc1ffc6d086fa4a06e`. Die Evidence pinnt Fixture-Test/Helper, Validator, Quiz-Show-Handler und Public-Event-Registry per SHA-256.
- Feste in-process Reads: vier Locale-Übersetzungen, `/api/quiz-show/hud-config`, `/api/quiz-show/brand-kit`, `/api/quiz-show/state`. Es gibt keinen Listener; Antworten stammen ausschließlich aus dem Fixture.
- Socket-Abgleich: einzige ausgehende Rendereranfrage ist argumentlos `quiz-show:get-public-state`; bei initial verbundenem Socket wird sie zweimal emittiert (`connect` und `socket.connected`). Central Public-Overlay-Registry enthält den Event; Quiz-Show-Handler verweigert Requestargumente und antwortet über dasselbe Socket mit `quiz-show:state-update` aus dem Safe-State-Builder `buildGameStatePayload()`.
- **Offen:** bedingter aktiver Layout-GET `/api/quiz-show/layouts/${activeLayoutId}` und Custom-Layout-Render; `/api/quiz-show/leaderboard?type=round` ohne passenden GET-Producer oder Public-HTTP-Allowlist; dynamische Brand-Kit-Farben, Logo-/Voter-/Joker-Bild-URLs; Sound-Dateipfad und `Audio`; shared i18n `/api/i18n/locales` wird nicht durch den Fixturefall aufgerufen; echte `/api/quiz-show/state`-Route führt `checkSeasonAutomation()` aus und ist nicht backendintegriert geprüft.
- Nächste kleinste zulässige, noch nicht gepinnte Familie gemäß statischem Inventar: **WebGPU Weather Control, 270.792 Bytes**. Talking Heads (251.941 Bytes) bleibt ausgeschlossen; Minecraft Connect (252.440 Bytes) hat keinen unterstützten Public-Renderer-Einstieg. WebGPU-Verhalten nur mit CPU-Stubs im Folgeauftrag prüfen.

### Behoben und geprüft

- Vier Locale CPU-Fixture: `app/test/obs-quiz-show-renderer-fixtures.test.js`; feste Requests und Assets, synthetische Frage, keine dynamischen Bilder/Sounds/Layouts, Cleanup.
- Manifest enthält jetzt getrennte Listen für eingehende Socket-Events und den ausgehenden Status-Requester sowie eine verbindliche Liste unresolved dynamischer Abhängigkeiten.
- Gezielte Befehle: `cd app; ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand --no-cache --detectOpenHandles --runTestsByPath test/obs-quiz-show-renderer-fixtures.test.js` (**4/4 PASS**) und ab Repository-Root `runtime\node\node.exe --experimental-test-isolation=none --test scripts\obs-pilot\test\renderer-fixture-contract.test.js` (**5/5 PASS**).
- Der Fixture-Contract verifiziert nur source-backed JSDOM-Verhalten. Die 614.009 Bytes beschreiben gepinnte statische Quellen/Locales, keine portable Gesamt-Runtime.

### Teilweise geprüft / blockiert / nicht geprüft

- **Teilweise geprüft:** ursprüngliche Rendererquelle und statische Abhängigkeiten im CPU-only in-process JSDOM; Socket.IO-Browserbundle ist nur gehasht, nicht ausgeführt.
- **Blockiert:** vollständige dynamische Quiz-Show-Closure wegen der oben genannten Layout-, Leaderboard-, Bild-, Sound- und State-Producerpfade.
- **Nicht geprüft:** Plugin-Backend/DB, realer HTTP-/Socket-Transport, OBS/Browser Source, visuelle Prüfung, alle 104 OBS-Cases. Keine Produkt-/Server-/Docs-Captureänderung, kein Listener, keine Kopie, ISO, VM, OBS, Push oder Veröffentlichung.
- Das vorherige Profil-/Backup-Ergebnis **8 Suites / 49 Tests** war außerhalb dieses aktuellen Auftrags und ist kein aktueller Closure-Abnahmeclaim.

## Historischer Abschluss — dritte sichere Familie Goals, STT-Negativprobe und Spotlight Chatter (CEO, 2026-10-07)

### Rapport

- **Behoben und geprüft:** Goals 8 Dateien / 275.523 Bytes und fokussierter Suite-Run 7/7; STT führte `/api/i18n/locales` tatsächlich aus und erhielt `unknown-route`/404 ohne Allowlist-Erweiterung, Suite 9/9. Spotlight Chatter wurde als nächste begrenzbare Familie geprüft: Manifest 12 Dateien / **275.823 Bytes**, vier Locale-Dateien, feste lokale Assetliste, festes Chatter-API-Paar und festes Eventset. Quelle und Inventar zeigen 6 dynamische Risiken; Tests deaktivieren dynamische Bildpfade und prüfen feste Locale-/Chatter-Routen, zwei identische Boot-/Connect-GET-Paare, Sessiontokenfilter, Update, Reset und Cleanup.
- **Spotlight CPU-Renderer:** Jest **5/5 PASS** (Entry-Pin plus vier Locales). Kein Listener, echte Pluginroute/-DB, TikTok-Produzent, echte Socket.IO-Verbindung oder OBS.
- **Manifestregressionen:** vier Familien plus Evidence-Hashes und Fail-closed Traversal, Userstate, Hash-/Byte-Drift, Reparse-Punkt, externe URL, dynamische APIroute und Listener **6/6 PASS**.
- **Evidence:** [Spotlight Manifest](obs-104-spotlight-fixture.json), [Spotlight Evidence](obs-104-spotlight-fixture-evidence.json); Manifest SHA `f677503cd13bc7f995800f964afe8cba77389178977f3ad00ef7174610b80932`, Test SHA `c82918d869e04ecec0d2bd5417612ead4637b1e9fefb2979c2df3476945acc37`, Helper SHA `5dfe994d769c682400ab15b68b92a81ac4c77fd3accf6c5f3767a3fad735dd46`.
- **Teilweise geprüft:** nur CPU/in-process JSDOM an originalen Quellen. Fontdateien werden von JSDOM nicht abgerufen; Produktintegration, realer Browser/OBS sind nicht bewiesen.
- **Blockiert:** kein Blocker für synthetische Fixtures.
- **Nicht geprüft:** übrige Rendererfamilien/OBS-Renders, echter Transport und Backendproducer. 2.651-Datei-Normmanifest SHA `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b` bleibt unangetastet; Talking Heads/TTS read-only, `Bugstofix.md` nicht bearbeitet.
- **Nächster Schritt:** neuen CEO-Auftrag für die nächste Closurefamilie abwarten/erbitten.

---

## Abgeschlossener Vorauftrag — Advanced Timer + zweite sichere Rendererfamilie (CEO, 2026-10-07)

CPU-only: den Advanced-Timer-Vierlocale-Fixturevertrag an original HTML/JS, existierende Interceptor-/Socket-Shim-Tests und verifizierte Initial-/Update-/Recovery-/Cleanup-Belege binden; fehlende Assets, Hashdrift, externe URL und dynamische Route fail-closed testen. Zweite sichere Rendererfamilie aus dem Closureinventar auswählen und die familienbezogenen dynamischen Risiken genau auflisten. Talking Heads/TTS nur read-only.

Unverändert bleibt die normalisierte 2.651-Dateien-Liste, 490.389.602 Bytes, SHA `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b`. Kein großes Bundle/Kopie/ISO, kein Listener, keine VM, kein GuestControl, kein OBS-Start. Receipt-Sidecar ist weiterhin Design-only/unverified. Talking Heads/TTS werden nicht geändert.

### Rapport

- **Behoben und geprüft:** [Closureinventar](obs-104-renderer-closure.json) und reproduzierbares Crawlscript [inventory-104-renderer-closure.js](../../scripts/obs-pilot/inventory-104-renderer-closure.js) erfassen 26 HTML-Entrypoints/104 Matrixfälle, lokale statische Abhängigkeitspfade, Locale-Dateien, HTTP fetch Verbraucher, Socket Event-Consumer, Trigger/Negative-Matrixvertrag sowie Bytezahl/SHA. Jeder gelesene lokale Pfad bleibt unter dem Repo; Symlinks/Reparse-Punkte und sensible Profil-/Credential-/Runtimepfade werden zurückgewiesen. 105 einzigartige statische Closuredateien / 6.510.957 Bytes sowie 104 getrennte Locale-Dateien gefunden. Zwei externe Ressourcen bleiben geblockt/offline. Riskregister unterscheidet 44 grobe source/category/template Gruppen, 85 zeilengebundene Codefundstellen und 109 Familienvorkommen; exakte Quelle, Kategorie und Fail-closed Disposition stehen im JSON.
- **Zwei CPU-Fixtures:** Advanced Timer hat 8 Quell-/Locale-Dateien / 288.581 Bytes; STT Ticker 7 / 275.488 Bytes. Die Manifeste und exakten Route-/Eventallowlists sind [hier](obs-104-advanced-timer-fixture.json) und [hier](obs-104-stt-ticker-fixture.json). In-Process JSDOM/Socket-Shims, kein Listener, kein Pluginbackend, kein Audio-/STT-Provider.
- **Timerbelege:** Original-HTML/JS und Interceptor/Socket-Shim sind in [obs-104-renderer-fixture-evidence.json](obs-104-renderer-fixture-evidence.json) per SHA gebunden. Nach vier neuen locale-spezifischen Shim-Reconnectfällen lief die Suite aktuell **22/22 PASS**. Initial/Update/Reload-Recovery/synthetisches Disconnect+Reconnect/Cleanup sind abgedeckt; echter Socket.IO-Transport-Reconnect ist nicht nachgewiesen.
- **STT-Belege:** [obs-stt-renderer-fixtures.test.js](../../app/test/obs-stt-renderer-fixtures.test.js) lief gezielt **9/9 PASS** mit synthetischen de/en/es/fr Transcripts, malformed inputs, locale-race/cleanup und route denial. Evidenzdatei pinnt Test/Helper/Manifest-SHA. Kein Speech-Service/Audio.
- **Manifestregressionen:** Node22 `renderer-fixture-contract.test.js` **5/5 PASS** für beide Fixturefamilien: missing asset, traversal/Profilpfad/Credentialfeld, Byte-/SHA-Drift, synthetischer Reparse-Punkt, externe Asset-URL, dynamische APIroute und Listener-/Allowlist-Erweiterung werden fail-closed abgewiesen.
- **Talking Heads/TTS, read-only:** Talking Heads benötigt zusätzlich Pluginproducer `app/plugins/talking-heads/main.js`, `engines/asset-sprite-library.js`, `engines/animation-controller.js`, Socket.IO-Produzenten/-Payloads, `/api/talkingheads/config` Route sowie konkrete Spriteassets, die aktuell dynamisch aus Runtimeevents kommen. TTS ist kein Matrixrenderer; eine etwaige Integration braucht TTS main/Event-Handler, Utilities, eine ausgewählte Engine sowie provider/package/network dependencies. Keine dieser Dateien wurde geändert.
- **Prüfungen:** Gebündelter Node 22.14.0: `app/test/obs-timer-goals-renderer-fixtures.test.js` **22/22 PASS**, `app/test/obs-stt-renderer-fixtures.test.js` **9/9 PASS** und `scripts/obs-pilot/test/renderer-fixture-contract.test.js` **5/5 PASS** nach dem fehlendes-Asset/externe-URL/dynamische-Route-Delta. Timer-Evidenz bindet aktuelle Test/Helper-SHA; STT-Test/Helper/Manifest ebenfalls hashgebunden. Closureinventar erfasst 26/104. Receiptcontract 15/15 ist nur frühere CEO-Prüfung. Normiertes 2.651 Manifest weder neu berechnet noch kopiert/geändert.
- **Teilweise geprüft:** statische Referenzen und zwei JSDOM-Quellfixtures. Pattern crawl beweist keine vollständige transitive oder runtime closure und belegt keine echte Socket.IO-/HTTP-Serververbindung.
- **Blockiert:** realer Offline-Gastlauf und GuestControl Sidecar bleiben unverified und nutzerabhängig; keine Übertragung im Auftrag.
- **Nicht geprüft:** übrige 24 Familien als auslieferbarer Rendererpayload, echte Listener/HTTP/socket handshake, Backendintegration, alle OBS Renderings/104, dynamische Sprites, Produkt-Installationsgröße, echte Bildreview.

Neue Detaildokumentation: [obs-104-renderer-closure.md](obs-104-renderer-closure.md). Statusänderung ist nur CPU/source-side; nichts staged oder committed.

---

## Historischer Auftrag — Receipt-Sidecar und 104-Rendererpayload (CEO, 2026-10-07)

CPU-only: prüfe und dokumentiere einen exakten user-reviewed Receipt-Sidecarpfad über VirtualBox GuestControl, ohne Netzwerk, Shared Folders, Clipboard, ISOänderung oder veraltete Receiptannahme. Bestehenden normalisierten 2.651-Datei-/490.389.602-Byte-Vertrag SHA `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b` unverändert lassen. Host Receipt muss die tatsächliche laufende isolierte Ziel-VM belegen; Runner muss SHA, UUID, Alter ≤30min, Isolationsflags und fehlenden Pfad fail-closed prüfen. Regressionen ausschließlich synthetisch im Runnercontract harness; keine echte Receipt, GuestControl- oder VM-Aktion.

Read-only: 104-Case Produkt-Rendererquellen, Localeassets, lokale HTML-Assets, Core-Server/Abhängigkeiten und fehlenden Runner inventarisieren; minimale sichere Aufbauoption und verbleibende Lücken benennen. Keine Kopie, ISO, COM, Download, VM-/Gast-/OBS-Start. Zielbild2/Restaufgaben und Talking Heads/TTS-Änderungen bleiben gesperrt.
## Neuer Rapport — Receipt-Sidecar und 104-Rendererpayload (2026-10-07)

### Receipt-Transferdesign und Umsetzung

- `create-isolation-receipt.js` akzeptiert jetzt nur noch `VMState=running`; ein Poweroff-/Prebootreceipt kann hostseitig nicht geschrieben werden.
- Synthetischer Sidecarcontract im vorhandenen Runnerharness deckt fehlenden Pfad, falsche UUID, falschen SHA, stale Receipt und Isolationflag-Drift ab. Guestseite akzeptiert nur den exakten reviewed SHA und validiert zusätzlich `running`, VM-UUID, Flags, Schema, zulässige Felder und `observedAtUtc`.
- Transferdesign: Nach finalem user-initiierten Pilotstart einmalige read-only Hostabfrage, separate sanitized Review, eine Datei per `VBoxManage guestcontrol <UUID> copyto --no-replace ... --passwordfile ...` zum privaten Gast-Temp-Pfad, Gast-Hashvergleich und danach Runnerstart innerhalb 30 Minuten. Keine zweite Query im selben Pilotlauf. Dieses Host-zu-Gast GuestControl-Verfahren braucht GA und ein vom Nutzer verwaltetes Gastkonto/Passwortfile. Es benötigt keinen Netzwerkadapter, Shared Folder, Clipboardtransfer oder Manifest-/ISOänderung. Oracle 7.2.4 User Guide dokumentiert `guestcontrol copyto`, target-directory/no-replace und passwordfile.
- Physischer/echter Transfer bleibt **nicht ausgeführt/unverified**. Bei GA/Konto/Zeitfenster/Hashproblem: Stop; kein Netzwerk-/Share-/Clipboard-/ISOfallback. 2.651-Dateivertrag bleibt unverändert.

### 104-Fälle Sourceinventar und Aufbauoptionen

- Aktuelle Matrix SHA `0463f02d25c85db0282a10a157a5aadf589badd387bace0dd4e54e0800e76f0f`: 104 Fälle, 26 Plugins × de/en/es/fr; Status 84 blockiert, 16 in-process Fixture-only, 4 bereit für Fixture-review; OBS 0/104.
- **71** eindeutige evidence-source Dateien, **3.638.254 Bytes**, alle außerhalb Sidekick-Guest-Allowlist; **104** Pluginlocale-Dateien, **2.963.340 Bytes**, ebenfalls alle außerhalb. Read-only HTML-Scan: 76 verschiedene lokale `src`/`href` Assets (3.998.850 Bytes); direkte Sources plus Assets ergeben zusammen 126 Dateien / 6.495.130 Bytes (noch keine transitive JS/CSS/GPU closure). Ein externer `chatango` Embed bleibt blocked/offline und in diesem Sourceplan ein bekannter Blocker.
- Fehlende Runtimeanker im Sidekick-Payload sind u. a. `app/server.js`, `app/routes/plugin-routes.js`, `app/modules/plugin-loader.js`, `app/modules/public-overlay-registry.js`, `app/public/js/i18n-client.js`; damit fehlen normaler Pluginroute-/i18n-/APIserver und Producerintegration. Einige Socket.IO bundles sind enthalten, aber nicht der vollständige Server-/Appclosure. Aktueller `run-pilot.js` ist Sidekick-spezifisch, kein 104-case runner.
- **Kleinste sinnvolle Rendereroption:** gesondertes allowlisted payload aus 26 Pluginstatic trees, exakt 104 locales, nachgewiesenen shared assets und Node22/Socket.IO; kleiner Loopback HTTP/Socket fixture füttert pro Case nur synthetische GET/event payloads. Ein neuer case-runner speichert pro Plugin/Locale initial/trigger/update/negative Belege. Das wäre OBS Browser-Source renderer evidence, aber kein echter Plugin backend/product-integration Pass.
- **Produktintegrationsoption:** isolierter `app/server.js`/Docs-Capture-Runtime-Ablauf mit genau einem explizit erlaubten Plugin pro temp profile/Case, no dotenv, external connectors off, loopback-only und alles user data in guest temp. Vor Transfer müsste `modules`, `node_modules`, routes, locale/assets und Plugin-Closure materialisiert und source-reviewed sein. Bestehender docs-capture fixture symlink/junctions `modules` und `node_modules` an den Host; er ist keine portable guest-payload. Server startup/write effects brauchen weitere offline no-write Regressionen. Keine dieser Optionen wurde gebaut oder gestartet.
- Nicht in Payload: `app/.env`, `app/user_configs`, `app/logs`, `app/archive`, Datenbanken oder sonstiger Nutzer-/Laufzeitstate. Aktueller Sidekick-Transfermanifest hash `e3f475badac6b1ee51fd873654f310c79d3213b768612164dddf6ed9c633c0ed`; effective 544 Guestfiles. Die normalisierte 2651-Dateiliste/SHA wurde nicht neu berechnet oder kopiert und blieb unverändert.

### Geänderte Dateien / Prüfungen

- `scripts/obs-pilot/create-isolation-receipt.js`: nur laufende VM darf als Receiptquelle dienen.
- `scripts/obs-pilot/safety-contract.js`: stale Fehler stoppt die aktuelle Pilotsitzung.
- `scripts/obs-pilot/test/contract.test.js`: running-only Producer sowie falsche UUID/Hash/Alter/Flags/fehlender Pfad.
- `scripts/obs-pilot/inventory-104-renderer-payload.js` und `docs/coordination/obs-104-payload-inventory.json`: reproduzierbares read-only Source-/Locale-/Asset-/Runtimeinventar.
- `docs/coordination/obs-guest-bootstrap.md`: GuestControl Sidecardesign mit exakter VBoxManage-Schnittstelle, Host-/Gast-Hashprüfung und no-fallback Grenzen.
- `& .\runtime\node\node.exe --experimental-test-isolation=none --test .\\scripts\\obs-pilot\\test\\contract.test.js` — **15/15 PASS**.
- Inventoryscript via Node 22 lief; 104 Source-/Locale-Verteilung, Assetpfade und externe Referenz konsistent. Keine Payload gebaut.

### Status

- **Behoben und getestet:** kein powered-off Receipt, stale/wrong-hash/wrong-UUID/isolation-drift/missing path fail-closed; GuestControl Sidecardesign hält Transfermanifest unverändert.
- **Teilweise geprüft:** VirtualBox GuestControl 7.2.4 dokumentiert und Host-/Guest-hashüberprüfung geplant; echter GA-/Account-/Copyto-Lauf nicht erfolgt.
- **Blockiert:** tatsächlicher GuestControl-Transfer hängt von Guest Additions, user-provided Gastkonto und späterem Nutzerstart ab.
- **Nicht geprüft:** OBS 104 Browser Source, Produktserverintegration, transitive Plugin-/GPU-/CSS-Closure, product payload build/size/runtime, echte Screenshots/Locales.
## Historischer Auditrapport — Guest-Bootstrap / 104-Fall Evidence vor dem Sidecar-Design (2026-10-07)

### Befund

- Der Credential-Rule-1-False-Positive-Fix ist horizontal begrenzt: Whitespace nach `authorization` ist `[ \t]*`; der mehrzeilige `ws`-Code wird nicht mehr als Secrettext erkannt. Ein tab-getrennter gleichzeiliger Secret-ähnlicher Literalfall wird weiter verworfen.
- Die validierte Liste hat nur `obs/`, `pilot/`, `runtime/`: 2.107 + 543 + 1 = 2.651 Dateien, 490.389.602 Bytes, SHA oben. `host-receipt/` fehlt. Runner verlangt Receipt-Dateipfad plus getrennt reviewed Datei-SHA; das Guest-Eingabeproblem ist damit real und ungelöst.
- Runtime-/Assetauflösung im Sidekick-Runner stimmt mit dem Transferlayout überein. Runner startet und schließt sein eigenes Loopback-Fixture. OBS-EXE/Browser/WebSocket-Dateien sind im `obs/`-Baum. Manifest-/Dateihashprüfung beweist keine portable Closure oder Gastlaufzeit.
- Die 104-Fälle-Matrix ist separat: 26 Plugins × 4 Locales, ihre Sourcebelege/Server sind kein Teil dieses Sidekick-Payloads. Ein Matrix-Runner/Transfervertrag ist nicht vorhanden. `?lang=en` beim Sidekick ist No-op (`applied:false`).

### Umsetzung und geänderte Dateien

- `scripts/obs-pilot/test/validate-manifest-only.test.ps1`: echte CRLF/Tabs-Regression, benigner crossline-Fall zulässig; same-line secret-like text abgelehnt.
- `scripts/obs-pilot/test/validate-104-evidence-plan.js`: CPU-only Prüfung von 104 IDs, 26 je Locale, Statusverteilung, Sourcepfaden und eindeutigen geplanten 104 Resultat-, 104 Locale- und 416 Screenshotpfaden; prüft Matrix-Sources gegen Sidekick-Transferallowlist.
- `docs/coordination/obs-guest-bootstrap.md`: validierten 2.651-Dateien-Vertrag, exakte Gastpfade, OBS-Binaries/Plugins, Receipt-Bedingungen, Setup-/Pilot-Boot-Reihenfolge, Loopback-/Runnervertrag, Receipt-Transferblocker und Trennung zwischen Sidekick- und 104-Matrix-Evidence dokumentiert.
- `docs/coordination/obs-pruefplan.md`: getrennten pro-Fall Resultat-/Locale-/Screenshotbelegplan und Statusgrenzen ergänzt.
- `docs/coordination/obs-guest-bootstrap-checklist.json`: normierte Manifestvalidierung mit Roots/Zählung/SHA und Receipt-Gate dokumentiert; VM-Gates bleiben unverändert blockiert.

### Prüfungen

- `pwsh -NoProfile -File scripts/obs-pilot/test/validate-manifest-only.test.ps1` — **6/6 PASS**, Exit 0, Temp-Cleanup; kein ISO/COM.
- `node scripts/obs-pilot/test/validate-104-evidence-plan.js` — **PASS**; 104 Fälle, Localeverteilung und Evidence-Pfadplan; keine OBS-Evidence behauptet.
- JSON-Parse für Checklist, Matrix und Transfermanifest — **PASS**.
- PowerShell-Parser für die geänderte Helperregression — **PASS**.
- Produktcode-/OBS-/VM-/ISO-/COM-/Mount-/Download-/Transferlauf nicht ausgeführt. Der historische vollständige manifest-only Lauf wurde nicht wiederholt.

### Verbleibende Risiken / offene Entscheidungen

- **Blockiert:** kein genehmigter Weg für den Receipt in den Gast; jede Aufnahme in den Payload ändert Manifesthash und braucht separaten Review/Validatorlauf.
- **Blockiert:** Gaststart bleibt nutzergesteuert; Windows/EFI/TPM/Secure-Boot, Gastlogin, Redist-Review/-Lizenz und OBS portable Closure/Gast-MSVC offen.
- **Nicht geprüft:** Produkt-ISO/Readback, tatsächlicher Gastpfad, OBS-/Browser-Source-Laufzeit, praktische Locale-Sichtbarkeit und unabhängiger Bildreview.
- **Nicht geprüft:** alle 104 OBS Fälle (0/104); separater Produktpayload und Runner fehlen.
- **Blockiert:** externe Redistribution/Release bleibt nicht freigegeben.
- Die benannten Screenshotpfade sind ein Plan, keine vorhandenen Bildbelege. Der frühere tatsächliche PS-Reparse-Rejection-Test bleibt wie zuvor präzise abgegrenzt und wird durch diese Arbeit nicht geändert.
# OBS preparation gates — 2026-10-07

## Ergebnis

Die maschinenlesbare Übersicht [obs-transfer-remaining-gates.json](obs-transfer-remaining-gates.json) enthält **8 `passed_source`, 2 `blocked`, 4 `not_checked`**. Quell- und isolierte Validatorbelege sind keine Laufzeit- oder Gastabnahme.

Der echte PowerShell-Helper hat das vollständige kanonische OBS-plus-Sidekick-Manifest mit 2.651 Dateien über eine einmalige isolierte Temp-Kopie erfolgreich validiert. Der Temp-Ordner wurde nach der Prüfung anhand seines aufgelösten GUID-Pfads und seiner Zugehörigkeit zu `%TEMP%` entfernt.

## Vollständiger Manifest-only-Lauf

Befehl: `pwsh -NoProfile -File scripts/obs-pilot/test/validate-full-normalized-manifest-only.ps1` → **Exit 0**.

| Messpunkt | Ergebnis |
|---|---|
| Freier Platz vor Kopie | 269.034.479.616 Bytes; Mindestreserve >2 GiB |
| Node | v22.14.0, ABI 127; Runtime-Hash geprüft |
| Kanonischer Normalizer-Manifest-SHA-256 | `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b` |
| Geschriebener `transfer-manifest.json` SHA-256 | `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b` |
| Isolierter Temp-Payload | 2.651 Dateien, 490.389.602 Bytes |
| Echte Helper-Ausgabe | `manifest-validation-only-passed`, Exit 0, `isoCreated=false` |
| Ausgabeordner | vor und nach dem Helper leer |
| Cleanup | GUID-Temp-Root unter `%TEMP%` aufgelöst und geprüft; anschließend entfernt; kein passender Root blieb zurück |

Vor der Kopie wurden Manifeste und drei Policies gegen ihre Pins geprüft. Der Normalizer hat alle Manifestquellen geprüft. Der Harness verifizierte zusätzlich pro Quelldatei Root-Containment, Reparse-Kette, tatsächliche Bytezahl und SHA-256. Jede temporäre Kopie wurde erneut gehasht; Case-insensitive Duplikate, fehlende/zusätzliche Zuordnungen und abweichende Gesamtzahlen brechen fail-closed ab. Die vier Host-only-Testdateien blieben ausgeschlossen; die OBS-Lizenznotiz blieb im Manifest.

Der erste volle Versuch endete mit Exit 1: Credential-Regel 1 verband wegen `\s*` über einen Zeilenumbruch den Codezugriff auf `authorization` mit dem folgenden sechs Zeichen langen Literal `'Basic '`. Der Wert wurde nicht protokolliert. Die Regel verwendet jetzt `[ \t]*` für gleichzeilige Trennung. Die gezielten echten Helper-Regressionsfälle melden **6/6 PASS**: harmloser `ws`-Code über Zeilenumbruch wird akzeptiert, ein gleichzeiliger credential-artiger Text bleibt abgelehnt; Cookie-Tampering und Lookalikes bleiben blockiert. Die Locale-Regel-1-Suite besteht **12/12**.

Es wurde kein tatsächlicher Disk-full-Zustand erzeugt. Der abgelehnte erste Validatorlauf und der erfolgreiche Lauf durchliefen beide die verifizierte `finally`-Bereinigung. Ein echtes Volume-Disk-full-Injection wurde nicht getestet. Die Cleanup-Route prüft Root-Auflösung, unmittelbare GUID-Kindzugehörigkeit zu `%TEMP%` und Reparse-Freiheit vor rekursivem Entfernen.

## Reparse-Nachweis — präzise Abgrenzung

Der frühere PowerShell-Fall namens `reparse-target-placeholder` wird **nicht** als tatsächlicher Reparse-Rejection-Test gewertet. Der Vollharness hat alle aktuellen Quell- und Kopierpfade auf Reparse-Punkte geprüft und keine gefunden; das ist ein Befund über diese konkreten Pfade, kein Negativtest gegen den Helper. Der JavaScript-Normalizer-Test enthält einen echten Symlink-Rejection-Zweig, kann aber bei nicht möglicher Symlinkerstellung überspringen. Daher wird kein plattformunabhängiger Symlink-Rejection-PASS aus dieser Ausgabe behauptet.

## Weitere Prüfungen und Grenzen

- JS-Syntax und Normalizer-Regressionssuite: **14/14 PASS**; read-only Vollnormalisierung: 2.651 Dateien / 490.389.602 Bytes / SHA oben.
- Isolierte PEM-Helper-Fixtures: **11/11 PASS**; Cookie-/Credential-Helper-Fixtures nach Regelkorrektur: **6/6 PASS**; Locale-Regel-1: **12/12 PASS**; Ausgabe-Ownership: **3/3 PASS**.
- Keine ISO-/COM-/7-Zip-Ausführung, kein Download, keine VM-Abfrage oder -Start, kein OBS-Pilot. Der vollständige Temp-Payload war nur ein Helper-Testinput und wurde entfernt; nichts wurde im Repository abgelegt.
- **Blocked:** externe Redistribution/Release und nutzergesteuerter VM-Start.
- **Nicht geprüft:** kompletter Verzeichnisinventarvergleich auf nicht-manifestierte zusätzliche Quelldateien, Produkt-ISO/Readback, Gast-Portabilität/VC++ Runtime und praktische OBS-Abnahme (0/104).

## Stable auftragsbezogener Dateisatz

- `scripts/obs-pilot/build-transfer-iso.ps1`
- `scripts/obs-pilot/normalize-transfer-manifests.js`
- `scripts/obs-pilot/transfer-public-key-exception.obs32.1.0.json`
- `scripts/obs-pilot/test/normalize-transfer-manifests.test.js`
- `scripts/obs-pilot/test/validate-public-key-exception.test.ps1`
- `scripts/obs-pilot/test/validate-manifest-only.test.ps1`
- `scripts/obs-pilot/test/validate-full-normalized-manifest-only.ps1`
- `docs/coordination/obs-transfer-remaining-gates.json`
- `docs/coordination/obs-transfer-remaining-gates.md`
- `docs/coordination/obs-pem-internal-test-exception-design.md`

Der Checkout enthält zahlreiche parallele Änderungen. Es wurde nichts gestaged und kein Commit erstellt; die obige Liste beschreibt den OBS-Auftragsscope und beansprucht keine Ownership über andere Änderungen.



