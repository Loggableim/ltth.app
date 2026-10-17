# Renderer-Quellprüfungen außerhalb der OBS-Abnahme

Stand: 2026-10-07

Diese Liste ordnet vorhandene Quell- und In-Process-Rendererprüfungen zu. Sie ist ein Arbeitsinventar, **kein OBS-Ergebnis** und verändert weder den offiziellen 104-Fälle-Zähler noch `obs-104-acceptance-matrix.json`.

## Abgleich aller 26 OBS-Rendererfamilien

Quelle der 26 Familie-/Entry-/Fallstatuszeilen ist der aktuelle `items`-Bestand in `docs/coordination/obs-104-acceptance-matrix.json` (104 Localefälle); der Fixturepfad ist nur eingetragen, wenn die Matrix einen konkreten Rendererfixture nennt oder ein vorhandener Quelltest im aktuellen Checkout direkt dazu gehört. `CEO-Bericht` bezeichnet explizite aktuelle Prüfbelege aus `docs/coordination/CEO_HANDOFF.md` und den unten genannten Fixtureberichten. `Worker-/Quellstand` ist getrennt davon der Matrixstatus samt lokalem Rendererfixture. `Kein Rendererbeleg` bedeutet nicht, dass keine Plugin- oder Backendtests existieren. Alle 104 OBS-Fälle haben weiterhin null Capture-Receipts und Status `source-reviewed-plan-only-no-obs-execution`.

| Familie | Tatsächlicher Matrix-Entry | Tatsächlicher Rendererfixture im Checkout | CEO-Bericht | Worker-/Quellstand |
| --- | --- | --- | --- | --- |
| advanced-timer | `app/plugins/advanced-timer/overlay/index.html` → `overlay/overlay.js` | `app/test/obs-timer-goals-renderer-fixtures.test.js` | In-Process-Rendererpass; keine OBS-Abnahme | Matrix: `in-process-renderer-fixture-passed-not-obs` |
| chatango | `app/plugins/chatango/ui.html` (Settingsoberfläche, nicht Overlay) | — | Kein Rendererpass; Entry unzutreffend für Capture | Matrix: `blocked-before-practical-capture` |
| clarityhud | `app/plugins/clarityhud/overlays/full.html` → `overlays/full.js` | `app/plugins/clarityhud/test/full-overlay-renderer-lifecycle.test.js` (neu; originales HTML + Bibliotheken + Full-JS) | Noch kein CEO-Rerun dieser Lifecycle-Fixture | Matrix: `blocked-before-practical-capture`; vollständiger Lifecycle-/Reconnectfixture neu |
| coinbattle | `app/plugins/coinbattle/overlay/overlay.html` → `overlay/overlay.js` | `app/plugins/coinbattle/test/overlay-renderer-lifecycle.test.js` (neu in dieser Runde) | Vor dieser Runde kein Rendererpass; Projektorpass getrennt | Matrix: `blocked-before-practical-capture`; Lifecycle-/Statefixture neu |
| emoji-rain | `app/plugins/emoji-rain/obs-hud.html` → `app/public/js/emoji-rain-obs-hud.js` | `app/test/emoji-rain-obs-hud-renderer-lifecycle.test.js` (Legacy-HUD; WebGPU separat) | CEO: Rechteworker Public-Mapping-Producer/Legacy-Consumer 224 Tests PASS; kein OBS | Matrix: `blocked-before-practical-capture`; isolierte Legacy-HUD-Fixture neu |
| fireworks | `app/plugins/fireworks/overlay.html` → `gpu/engine.js` | `app/plugins/fireworks/test/overlay-lifecycle.test.js` (Originalentry/Engine-Lifecycle) | Historischer Workerpass mit Game Engine: 2 Suites/4 Tests; CEO wies Wiederholung ausdrücklich zurück | Matrix: `blocked-before-practical-capture`; OBS offen |
| flame-overlay | `app/plugins/flame-overlay/renderer/index.html` → `effects-engine.js` | `app/plugins/flame-overlay/test/renderer-lifecycle.test.js` | CEO: 2/2 Lifecycletests bestanden | Matrix: `blocked-before-practical-capture` (OBS bleibt ungeprüft) |
| game-engine | `app/plugins/game-engine/overlay/game-hud.html` | `app/plugins/game-engine/test/game-hud-renderer-lifecycle.test.js` (neu in dieser Runde; bestehende DOM-Fixtures zielen auf andere Overlaydateien) | Noch keine CEO-Wiederholung dokumentiert | Matrix: `blocked-before-practical-capture`; HUD-Fixture neu |
| goals | `app/plugins/goals/overlay/index.html` → `overlay/overlay.js` | `app/test/obs-timer-goals-renderer-fixtures.test.js` | In-Process-Rendererpass; keine OBS-Abnahme | Matrix: `in-process-renderer-fixture-passed-not-obs` |
| interactive-story | `app/plugins/interactive-story/overlay.html` | — | Kein Rendererpass; Provider/TTS ausgeschlossen | Matrix: `blocked-before-practical-capture` |
| milestone-leaderboard | `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/leaderboard.html` | `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js` | Rendererfixture vorhanden; kein OBS-Beleg | Matrix: `in-process-renderer-fixture-passed-not-obs` |
| minecraft-connect | `app/plugins/minecraft-connect/overlay/minecraft_overlay.html` → `overlay/minecraft_overlay.js` | `app/plugins/minecraft-connect/test/overlay-renderer-lifecycle.test.js` (neu; lokale Legacyoberfläche) | CEO: 2 Suites/3 Tests inkl. Legacy EmojiRain bestanden; Public-Zugang bleibt gesperrt | Matrix: `blocked-before-practical-capture`; kein öffentlicher Overlayzugang |
| music-bot | `app/plugins/music-bot/overlay.html` | — | Kein Rendererpass; keine Audioausgabe in Scope | Matrix: `blocked-before-practical-capture` |
| openshock | `app/plugins/openshock/overlay/openshock_overlay.html` → `overlay/openshock_overlay.js` | `app/plugins/openshock/test/zappiehell-overlay.test.js` (paralleler Worker; hier nicht erneut ausgeführt) | Kein eigener Rendererpass in diesem Auftrag; Hardware-/Aktuatorprüfung ausgeschlossen | Matrix: `blocked-before-practical-capture`; parallele Rendererbelege erst nach Owner-/CEO-Abgleich als geprüft werten |
| quiz-show | `app/plugins/quiz-show/quiz_show_overlay.html` → `quiz_show_overlay.js` | `app/test/quiz-show-overlay-renderer-lifecycle.test.js` (neu in dieser Runde) | CEO: requester-only Reconnect + Originalrenderer CPU-Integration, 188 Tests PASS; kein OBS | Matrix: `blocked-before-practical-capture`; isolierte Fixture neu |
| schnorrbecher | `app/plugins/schnorrbecher/overlay/coincup.html` → `overlay/coincup.js` | `app/plugins/schnorrbecher/test/obs-renderer-offline.test.js` | CEO: 3 Suites/22 Tests Lifecycle bestanden; kein Physik-/Audio-/OBS-Beleg | Matrix: `blocked-before-practical-capture` |
| spotlight | `app/plugins/spotlight/overlays/chatter.html` → `overlays/single-overlay.js` | — (Plugin-/I18n-Tests sind keine Rendererfixture) | CEO: Rendererauftrag früher abgeschlossen; laut CEO ausgeschlossen | Matrix: `blocked-before-practical-capture` |
| stream-monsters | `app/plugins/stream-monsters/streammonsters-overlay.html` → Overlay-Module | `app/plugins/stream-monsters/test/overlay-renderer-lifecycle.test.js` (neu; Originalentry + Module) | Kein aktueller OBS-Rendererpass; Captureplan getrennt | Matrix: `blocked-before-practical-capture`; isolierte CPU-Lifecycle-Fixture neu |
| stt-ticker | `app/plugins/stt-ticker/overlay/ticker.html` | `app/test/obs-stt-renderer-fixtures.test.js` | 9/9 Quellfixtures im Bericht; kein OBS-/Livepass | Matrix: `ready-for-isolated-fixture-review` |
| talking-heads | `app/plugins/talking-heads/overlay.html` → `assets/overlay.js` | `app/test/talking-heads-renderer-lifecycle.test.js` (Lifecycle-/TTS-Nachbarscope, keine OBS-Fixture) | Paralleländerungen geschützt; kein Rendererauftrag hier | Matrix: `blocked-before-practical-capture` |
| toptier | `app/plugins/toptier/overlay.html` → `assets/overlay.js` | `app/plugins/toptier/test/obs-toptier-fixtures.test.js` | CEO: Renderer-/Public-Session-Fixtures bestanden; kein OBS | Matrix: `in-process-renderer-fixture-passed-not-obs` |
| visual-fx-frame-webgpu | `app/plugins/visual-fx-frame-webgpu/renderer/index.html` → `overlay-controller.js` | `app/test/visual-fx-frame-webgpu-overlay-lifecycle.test.js` (neu; Originalentry/-module im Unsupported-CPU-Fallback); `app/test/visual-fx-frame-webgpu-renderer.test.js` (Enginefixture) | Lokaler Originalrenderer-Lifecycle 1/1 PASS; OBS offen | Matrix: `blocked-before-practical-capture` |
| weather-control | `app/plugins/weather-control/overlay.html` → `weather-engine.js` | `app/test/weather-overlay-reconnect.test.js` (Reconnect-/Overlaytest; kein Matrixfixture) | CEO: frühere Renderer-/Runde-3-Belege vorhanden, kein aktueller OBS-Pass | Matrix: `blocked-before-practical-capture` |
| webgpu-emoji-rain | `app/plugins/webgpu-emoji-rain/overlay.html` → `gpu/engine.js` | `app/plugins/webgpu-emoji-rain/test/overlay-renderer-lifecycle.test.js` (neu; Originalentry + Engines); `app/test/webgpu-emoji-rain-renderer-parity.test.js` | CEO: 9 Suites/81 Tests; kein OBS | Matrix: `blocked-before-practical-capture`; CPU-Fallback-Lifecycle-Fixture neu |
| webgpu-fireworks | `app/plugins/webgpu-fireworks/overlay.html` → `gpu/engine.js` | `app/test/webgpu-fireworks-overlay-renderer-lifecycle.test.js` (Originalentry/CPU lifecycle); `app/test/webgpu-fireworks-gpu-lifecycle.test.js` (GPU-resource fixture) | Lokaler Originalrenderer-Lifecycle 1/1 PASS; OBS offen | Matrix: `blocked-before-practical-capture` |
| webgpu-weather-control | `app/plugins/webgpu-weather-control/overlay.html` | `app/test/webgpu-weather-control-overlay-lifecycle.test.js` (Originalentry/CPU lifecycle); `app/test/webgpu-weather-renderer.test.js` (Rendererfixture) | Lokaler Originalentry-Lifecycle 1/1 PASS; OBS offen | Matrix: `blocked-before-practical-capture` |

Hinweis: Ein Testpfad in dieser Liste beweist nur den dort explizit getesteten Quellumfang. Insbesondere sind Plugin-Backendtests, Registrytests, Public-Projektionsfixtures, statische CSS-Tests und GPU-Engine-Doubles nicht als vollständige Renderer- oder OBS-Abnahmen umetikettiert.

## CoinBattle: Originalrenderer-Lifecycle und initialer Zustand

- **Entry und erforderliche Dateien:** `GET /plugins/coinbattle/overlay/overlay.html` lädt Socket.IO (`/socket.io/socket.io.js`), `/plugins/coinbattle/overlay/styles.css`, `/js/i18n-client.js` und `/plugins/coinbattle/overlay/overlay.js`. Die Registry enthält die Overlayassets sowie exakt begrenzte GETs für Leaderboards und Overlaylayouts; der Renderer liest nach `coinbattle:post-match` nur die drei registrierten Leaderboardpfade (weekly/season/lifetime). Kein POST/PUT/DELETE, Admin- oder Persistenzpfad wurde ergänzt.
- **Ereignisvertrag:** Initialisierung registriert Handler für CoinBattle-Match/Timer/Leaderboard/Matchende/Postmatch/Multiplikator/Geschenk/Badges/Teamnamen/Konfigurationsanzeige sowie die Pyramid-Status-/Rundenereignisse. Der initiale Request ist `coinbattle:get-state`, zusätzlich `pyramid:get-state` nur mit `?pyramidMode=true`. Der getrennte Rechteauftrag hat für den Public-Socketvertrag `coinbattle:match-state` als begrenzten Rendererstatus (match mode/duration/elapsed/remaining/isPaused, angezeigte Leaderboardfelder, Team-/Multiplieranzeige, ohne Gesamtconfig oder DB-/Match-/Plattform-IDs) und `coinbattle:gift-received` als `{}` bestätigt, da der Renderer dessen Inhalt nicht ausliest. Die normalen lokalen Producerpayloads bleiben laut Rechteauftrag erhalten. Diese Fixture prüft nur die Konsumentenseite mit synthetischem Vertrag, nicht die Public-Projektionsimplementierung.
- **Vorheriger Befund:** `overlay.js` startete Heartbeat und diverse Animations-/Anzeigetimer ohne gemeinsamen Besitzer, hielt den `MutationObserver` und `storage`-Listener nicht zum Entfernen fest, registrierte keine Reconnect-Synchronisierung und hatte keinen finalen `pagehide`-Cleanup. Bei Reconnect blieb damit der Zustand stale; nach endgültigem Verlassen konnten Socketcallbacks weiter rendern und Timer weiterlaufen.
- **Umsetzung:** Renderer hält jetzt alle eigenen Sockethandler und Timer fest, schützt Socket- und Timercallbacks gegen späte Ausführung, entfernt Observer/Storage-/Sockethandler und trennt den vom Renderer angelegten Socket beim finalen `pagehide`. `pagehide.persisted` belässt Zustand und Verbindung für BFCache; ein späteres `connect` nach bereits beobachteter Verbindung fordert den aktuellen Status erneut an. Cleanup ist idempotent. Registry, Plugin-Main, Engine und Public-Projektoren wurden von dieser Runde nicht geändert.
- **Fixture und Ergebnis:** `app/plugins/coinbattle/test/overlay-renderer-lifecycle.test.js` lädt Original-HTML und Original-`overlay.js` in JSDOM; Socket und Timer sind lokale Doubles. 3 Tests prüfen Initialstatus, aktive Match-/Leaderboarddarstellung, Timerupdate, Reconnect-Request, BFCache hide/show, finales `pagehide`, Handler-/Timerbereinigung und verspätete Socket-/Timeout-/Intervallcallbacks. **3/3 Tests bestanden**, `--detectOpenHandles` meldet keinen offenen Testhandle.
- **Grenzen:** Kein echter HTTP-/Socket.IO-Server, keine DB/Plugin-Main/Profil, kein echter Assetabruf, kein Audio, keine GPU/Physics, keine OBS-/Browser-Source-/Tunnel-/Liveabnahme. Der Rechteworker-Projektor wurde nicht durch diese Rendererfixture verifiziert.

## Quiz Show: Originalrenderer und finaler Seiten-Lifecycle

- **Entry und Assets:** `GET /quiz-show/overlay` rendert `app/plugins/quiz-show/quiz_show_overlay.html`, lädt `/quiz-show/quiz_show_overlay.css`, `/socket.io/socket.io.js`, `/js/i18n-client.js`, `/js/public-overlay-render-mode.js` und `/quiz-show/quiz_show_overlay.js`. Keine Assets oder Registrypfade wurden geändert.
- **Lesepfade/Schreibschutz:** Beim Start verwendet der Renderer nur `GET /api/quiz-show/hud-config`, `GET /api/quiz-show/brand-kit` und `GET /api/quiz-show/state`; die exakte read-only Fixture-Whitelist lehnt alle anderen Pfade und alle Nicht-GET-Methoden ab. Das separate Render-Mode-Asset lässt `postJsonLocalOnly` auf einem nichtlokalen Host Writes überspringen. Der Renderer emittiert beim getesteten Ablauf keine Socketevents. `GET /api/quiz-show/state` enthält produktseitig mehr als nur HUD-Zustand; diese Runde benutzt dessen Ergebnis nur für den bestehenden Layoutflag-Pfad und leitet daraus keine Fragezustands-Hydrierung ab.
- **Socket-/Startzustand:** Originalrenderer registriert eingehende `quiz-show:*` Events, einschließlich `state-update`, `time-update`, Quiz-, HUD-, Layout-, Joker-, Leaderboard-, Kategorie-/Duel- und Achievementanzeigen. Es gibt keinen initialen Socket-State-Request; `state-update` wird vom Plugin bei Zustandswechsel publiziert. Der Test stellt diesen Event mit einer synthetischen Frage zu und bestätigt Frage-/Antwortanzeige. Kein Antwortschlüssel/DB-Record wurde geladen.
- **Vorheriger Befund und Umsetzung:** Cleanup existierte nur bei `beforeunload` und räumte lediglich die gerade aktive Timeranimation und `stateTimeout` auf. Weitere `setTimeout`/`setInterval`, Socket-Listener und ein BFCache-geeigneter Lebenszyklus waren nicht abgedeckt. Renderer besitzt jetzt eigene Timer/Intervalle/RAF-IDs und guardet verzögerte Callbacks, registriert/entfernt seine Sockethandler, trennt seinen Socket bei finalem `pagehide` und lässt bei `pagehide.persisted` den BFCache-Zustand erhalten. Das fehlende sichere State-Request-Protokoll wurde nicht durch einen neuen Backendhandler oder einen weiter gefassten Read-Pfad ersetzt.
- **Fixture/Ergebnis:** `app/test/quiz-show-overlay-renderer-lifecycle.test.js` lädt Original-HTML, Render-Mode-Script und Overlay-JS in JSDOM; nur drei bestehende GET-Routen, Socket, Timer und RAF sind lokale Doubles. Es prüft Originalentry, erlaubte GETs, synthetisches Stateupdate, BFCache hide/show, final cleanup, späte Socket-/Timer-/RAFcallbacks und Consolefehler. Gemeinsamer Fokuslauf mit CoinBattle: 2 Suites/5 Tests bestanden; für diesen Quiz-Renderer allein 2 Tests.
- **Reststatus:** Kein neuer Statusrefresh bei Socket-Reconnect, da der Renderer keinen Requestvertrag besitzt und die vorhandene State-GET-Antwort für einen Renderer-State-Request umfangreiche Spieldaten führt. Eine sichere Projektion bzw. ein neues dediziertes Requestevent wäre ein separater Backend-/Rechteauftrag; `main.js` bleibt in dieser Runde unverändert. Keine echte Server-/Socket-/Audio-/OBS-/Tunnel-/Liveabnahme.

## Game Engine HUD: Initial-State, Reconnect und Cleanup

- **Entry/Assets:** Die Matrixfamilie zeigt auf `app/plugins/game-engine/overlay/game-hud.html`. Das Original-HTML lädt `/js/i18n-client.js` und Socket.IO; CSS und HUD-Renderer sind inline. Bestehende `interactive-overlay-dom.test.js`-Fixtures decken Connect4/Chess/Slot-/Plinko-Overlays ab, laden aber nicht diesen `game-hud.html`-Entry.
- **Read-/Eventvertrag:** HUD nutzt genau `GET /api/game-engine/active-session` zur initialen Hydrierung; dieser Pfad steht bereits explizit in der Public-Registry. Socket-Ausgaben sind `game-engine:game-started`, `game-engine:move-made`, `game-engine:game-ended`, `plinko:spawn-ball`, `plinko:ball-result`, `plinko:config-updated`. Es sendet keine Socketevents und lädt weder Audio noch GPU-Assets. Die HTTP-Fixture gestattet nur den vorhandenen `active-session` GET und weist andere Pfade/Methoden ab.
- **Vorheriger Befund/Umsetzung:** Renderer machte nur einen Active-Session-GET beim Laden und hatte keinen Reconnect-Refresh, finalen `pagehide`-Cleanup oder Schutz gegen einen verspäteten initialen GET nach neuerem Live-Socketevent. Jetzt wird derselbe bereits verwendete GET nach einer echten Socket-Wiederverbindung wiederholt; Revisionen machen ältere Reads nach neueren Spielereignissen wirkungslos. Eigene Timer und Socketlistener werden gehalten, Guarded Callbacks ignorieren verspätete Aufrufe, finaler `pagehide` trennt sie idempotent; BFCache-`pagehide.persisted` erhält Verbindung und HUD-Zustand. Keine `main.js`-/Rollen-/Registry-/Projektoränderung.
- **Fixture/Ergebnis:** `app/plugins/game-engine/test/game-hud-renderer-lifecycle.test.js` lädt das originale HTML vollständig in JSDOM und verwendet lokale Socket-, GET- und Timer-Doubles. Drei Tests prüfen initiale Sessiondarstellung, Move-Update, Reconnect-Hydrierung, Vorrang neuer Live-Socketdaten vor einem verspäteten GET, BFCache und finalen Cleanup inklusive verspätetem Read-/Socket-/Timercallback. **3/3 Tests bestanden** (`--no-cache --detectOpenHandles`). Kein echter Server, Plugin-/DB-/Profilzustand oder Audio/GPU wird gestartet.
- **Grenzen:** Ein weiterer Socket-/API-/OBS-/Browser-Source-/Tunnel-/Livebeleg fehlt. Der `active-session` Response enthält den für die Anzeige benötigten aktuellen Matchzustand; die Fixture nutzt nur synthetische Spielernamen und keine echten IDs.

## Bereits dokumentierte In-Process-Prüfungen

| Rendererfamilie | Nachweis | Umfang / Grenze |
| --- | --- | --- |
| Advanced Timer und Goals | `docs/coordination/obs-timer-goals-fixtures.md` | 18/18 JSDOM-Tests; keine OBS-Abnahme |
| Viewer XP | `docs/coordination/obs-viewerxp-fixtures.md` | Vier Localezeilen als In-Process-Fixture bestanden; OBS-Status `not-run`, Sichtprüfung ausstehend |
| TopTier | `docs/coordination/obs-toptier-fixtures.md` | 8/8 Rendererfixtures; OBS-Status `not-run` |
| STT-Ticker | `docs/coordination/obs-stt-fixtures.md` | 9/9 Tests inkl. Locale-, Event- und Cleanupfälle; keine OBS-/Liveabnahme |
| EmojiRain / öffentliche Registry | `docs/coordination/public-overlays.md` | Historisch dokumentierte lokale Fixture- und IAB-Proben; nicht als OBS-Abnahme werten |

Diese dokumentierten Familien sind keine Kandidaten für die aktuelle Einzelrenderer-Aufgabe.

## Aktueller Einzelrenderer: Schnorrbecher

- Öffentlicher Entry laut Registry: `GET /overlay/coincup`.
- HTML: `app/plugins/schnorrbecher/overlay/coincup.html`; erforderliche lokale CSS-, Matter-, Socket.IO-, Renderer-JS- und Glassound-Pfade stehen im Markup. Der Sound bleibt im Fixture ungespielt.
- Quelle: `app/plugins/schnorrbecher/overlay/coincup.js`; der Renderer fordert bei Socket-Verbindung `coinJar.sync.request` an und konsumiert `coinJar.sync`, `coinJar.add`, `coinJar.reset` und `coinJar.config`.
- Producerhinweis: `coinJar.add` enthält neben aggregierten Werten die ursprünglichen Eventfelder. Der öffentliche Payload-Vertrag muss deshalb durch den getrennt bearbeiteten Plugin-Main begrenzt bleiben; dieser Quellbereich wurde hier nicht geändert.
- Befund: Renderer startet beim Initialisieren einen Matter-Runner und stellte vorher keine `pagehide`-Bereinigung bereit.
- Umsetzung: Renderer hängt eine finale `pagehide`-Bereinigung an, erhält bei BFCache (`persisted`) den laufenden Zustand, und beendet beim finalen Verlassen Runner, Engine, eigene Socket-/Matter-Handler, ausstehende Timer/RAF und aktuell gehaltene Impact-Audioelemente idempotent. Ein injiziertes/fremdes Socket wird nicht disconnectet; fremde Eventhandler bleiben registriert. Bereits eingeplante Callbacks prüfen den Destroy-Status.
- Test: `app/plugins/schnorrbecher/test/obs-renderer-offline.test.js` lädt das Original-HTML und den Originalrenderer in JSDOM, ersetzt Netzwerk-/Socket-/Matter-Grenzen durch lokale Doubles und prüft Sync-Anfrage, BFCache-hide/show, Reconnect-Anfrage, doppelten Snapshot, Generationsgrenze, verspätete Socket-/Matter-/Timer-/RAF-Callbacks sowie Cleanup. Die Add-/Sync-/Config-Payloads nutzen synthetische Shapes entsprechend dem inzwischen vorhandenen Projektor; Consumerprüfung und Projektorprüfung sind separate Nachweise. Kein Plugin-Backend, persistenter Producer, echter Assetabruf oder OBS wurde gestartet. Sound bleibt ungespielt.

## Statusgrenzen

- Geprüft: Quellvertrag, Markup-/Assetreferenzen, Renderer-Socketnamen und isolierter finaler Cleanup des Schnorrbecher-Renderers. 3 Suites/22 Tests bestanden; Node-Syntax- und scoped Diff-Prüfung bestanden.
- Nicht geprüft: visuelle Browser-/OBS-Darstellung, reale Socket.IO-Verbindung, tatsächliche Serverprojektion der `coinJar.add`-Daten, Audioausgabe und Livebetrieb.
- Nicht geändert: öffentliche Registry, OBS-Matrix/-Zähler, Plugin-Main und Producer-/Persistenzlogik. Parallel laufende Plugin-Main-Änderungen sind fremd.

## TopTier Session-ID: Boundary-Nachprüfung

Der vorherige Hinweis auf einen Leak durch direkte TopTier-Socket-Replies war unvollständig und ist zurückgezogen. `app/modules/public-overlay-access.js` wrappt im Public-Quick-Tunnel-Kontext `socket.emit` und projiziert auch direkte Replies über `projectPublicOverlayPayload()`. `app/test/toptier-public-session-boundary.test.js` ruft den tatsächlichen `toptier:get-board`-Handler mit einem lokalen und einem per `protectPublicSocket` geschützten Socket auf: das lokale Paket enthält `sessionId`, das öffentliche enthält nur `board` und projizierte Einträge. Die gezielten Suites für Boundary, Access, Projektion und Adapter bestanden frisch: 4 Suites/61 Tests. Das sind In-Process-Middlewaretests, kein realer Tunnel.

## Flame Overlay: Public-Config und Lifecycle-Quellprüfung

- **Entry und Ressourcen:** Registry-Entry `GET /flame-overlay/overlay`; das Originalmarkup lädt `/js/i18n-client.js`, Socket.IO, `/flame-overlay/default-config.js`, `post-processor.js`, `effects-engine.js` und Texturen `nzw.png`/`firetex.png`. Der exakte öffentliche Config-Read ist `GET /api/flame-overlay/config`.
- **Public-Scope:** die drei ausgehenden Namen `flame-overlay:config-update`, `flame-overlay:trigger` und `flame-overlay:clear-triggers` sind registriert; es gibt keine eingehenden öffentlichen Events. Öffentliche POSTs für Config/Trigger sind nicht registriert und werden deny-by-default abgewiesen.
- **Behobener Public-Befund:** `public-overlay-access.js` ruft für `GET /api/flame-overlay/config` jetzt `projectFlameOverlayConfigResponse()` auf. Der zentrale Projektor behält ausschließlich typ-/bereichsgeprüfte Visualfelder und das erste gerenderte Frame-Rechteck; Triggerregeln, Chatkommandos und Triggerlimits bleiben lokal. `flame-overlay:config-update` nutzt denselben Visual-Projektor. `flame-overlay:trigger` begrenzt Typ, Dauer, Effekt, Farbe und numerische Triggerfelder und ersetzt die Producer-ID durch eine pro Emission erzeugte UUID; `clear-triggers` bleibt leer. Der lokale Security-Matrix-Test vergleicht den projizierten GET mit den Visualdefaults und bestätigt zugleich, dass der lokale Config-Payload die privaten Canaryfelder weiter enthält. Der ursprüngliche Fake-Public-Room-Repro dokumentiert den vorherigen Fehlerzustand.
- **Lifecycle-Befund und Fix:** `EffectsEngine.init()` bindet jetzt `pagehide` vor dem asynchronen Config-Read. Finales `pagehide` ruft den idempotenten `destroy()` auf; `pagehide.persisted` erhält die vorhandene Engine für BFCache. Nach jedem Config-Await verhindert ein Destroy-Guard das verspätete Setup. `beforeunload` wird nicht mehr zur Bereinigung verwendet, damit ein anschließendes BFCache-`pagehide` den Renderer nicht bereits zerstört vorfindet. Socketcallbacks und ausstehende Textur-/Revert-/Triggercallbacks prüfen den Destroy-Status; Resize wird nach Cleanup ignoriert. Der vorhandene Cleanup gibt eigene Socket-, PostProcessor- und WebGL-Stubressourcen frei.
- **Lifecycle-Fixture:** `app/plugins/flame-overlay/test/renderer-lifecycle.test.js` liest das originale HTML und `effects-engine.js`; es verwendet einen Stub-WebGL-Kontext, Fake-Fetch, Fake-Socket und Fake-RAF ohne GPU-Kontext, Server, Netzabruf, Audio oder externe Assets. Es reproduziert finalen Seitenwechsel während des offenen Config-Fetchs und prüft, dass danach keine Shader-/Geometrie-/Textur-/Socket-/Renderloop-Initialisierung erfolgt. Ein zweiter Fall erhält dieselbe Engine bei BFCache hide/show und prüft danach idempotente Freigabe ihrer Handles sowie inert gewordene verspätete Socket-, Texturbild- und RAFcallbacks.
- **Abgrenzung / Restprüfung:** Public-Config- und Trigger-Projektoren sind inzwischen im gemeinsamen Quellstand vorhanden; diese Rendereränderung hat sie nicht verändert. Die aktuellen Tests, die ich für den Lifecycle-Auftrag ausgeführt habe, prüfen nicht direkt die Flame-Socketprojektionen. Deshalb sind Projektion selbst und echter Tunnelbetrieb hier als Quellstand beziehungsweise nicht geprüft getrennt ausgewiesen.
- **Prüfstatus:** Flame-Overlay-Suites frisch **2 Suites / 25 Tests bestanden**; beide geänderten JavaScriptdateien bestehen `node --check`. Keine Live-Server-, Tunnel-, TikTok-, Audio- oder OBS-Prüfung.

## Fireworks Overlay: BFCache und finaler Seitenwechsel

- Originalentry: `app/plugins/fireworks/overlay.html`; Skript `/plugins/fireworks/gpu/engine.js` startet den Renderer bei `DOMContentLoaded`.
- Befund: `pagehide` war mit `{ once: true }` registriert. Ein BFCache-`pagehide` entfernt den Listener bereits, obwohl der Handler den Renderer nicht zerstört; ein späteres endgültiges Verlassen führt dann ebenfalls nicht zu `destroy()`.
- Fix: `pagehide` erhält den Renderer bei `event.persisted === true` und bleibt für den nachfolgenden finalen Seitenwechsel registriert. Finales `pagehide` ruft die bestehende `destroy()`-Methode auf.
- Fixture `app/plugins/fireworks/test/overlay-lifecycle.test.js` lädt das Originalmarkup und Originalskript in JSDOM, behält den DOMContentLoaded-Bootstrap bei und ersetzt nur Render-/Audioinitialisierung durch einen lokalen Destroy-Spy. BFCache-hide darf nicht zerstören; final-hide nach BFCache muss einmal zerstören.
- Prüfung: gemeinsam mit Game Engine HUD **2 Suites / 4 Tests bestanden** unter Node 22, Jest `--no-cache --detectOpenHandles`. Keine echte Canvas-/WebGL-/Audioausgabe, kein Backend/Socket-Server und keine OBS-/Live-Abnahme.

## Game Engine HUD: Initial-State, Reconnect und Cleanup

- Originalentry `app/plugins/game-engine/overlay/game-hud.html`; die bereits registrierten `GET /api/game-engine/active-session` und Game-Engine Socketereignisse bleiben unverändert.
- Der Renderer hydratisiert beim Start und nach Socket-Reconnect den aktiven Sitzungszustand. Versionszähler verhindert, dass ein veraltetes GET nach einem neueren Game-Socketevent den dargestellten Zustand überschreibt. BFCache bewahrt Renderer/Socket; finaler Seitenwechsel beendet eigene Timer, Handler und Verbindung und sperrt verspätete Callbacks.
- Fixture `app/plugins/game-engine/test/game-hud-renderer-lifecycle.test.js` lädt Originalentry und Inline-JS mit lokalen HTTP-/Socket-/Timer-Doubles. Keine echte Verbindung oder Renderer-Hardware.
- Prüfung gemeinsam mit Fireworks: **2 Suites / 4 Tests bestanden**. OBS-/Live-Darstellung nicht geprüft.

## Legacy EmojiRain OBS HUD: Read-State, Reconnect und Cleanup

- Originalentry `app/plugins/emoji-rain/obs-hud.html`; Overlay lädt `/js/matter.min.js`, Socket.IO und `/js/emoji-rain-obs-hud.js`. Renderer liest ausschließlich seine drei fest codierten GETs für Config, User-Mappings und Opacity-State; reagiert auf die bestehenden EmojiRain Socketevents.
- Befund: Reconnect protokollierte nur die Verbindung und las den letzten Config-/Mapping-/Opacityzustand nicht erneut. Finales `pagehide` rief aggressive Teilbereinigung auf und zerstörte den Renderer auch bei BFCache; `beforeunload` räumte unabhängig davon bereits vor dem Seitenevent auf. Bei finalem Cleanup wurden nur bis zu 50% der Emotes/Ballons entfernt.
- Fix: Reconnect und bereits verbundener Socket laden die drei bestehenden Reads erneut; pro Feld revisionsbasierte Guards lassen spätere Socketupdates und neuere Antworten vor verspäteten GETs gewinnen. Eigene Sockethandler werden gelöst. BFCache-pagehide bewahrt den Zustand; final-pagehide entfernt alle eigenen Emotes/Ballons, Timer/RAF, Map-/Queue-/Particle-Handles und Socket.
- Fixture `app/test/emoji-rain-obs-hud-renderer-lifecycle.test.js` lädt Originalentry und Renderer mit echtem CPU Matter.js, Fake-HTTP/Socket/Timer/RAF. Synthetische Public-Mappings sind leer und der Standardemoji-Fallback wird geprüft; synthetische lokale Map-Updates bleiben nur Fixturedaten. Der Test belegt keine reale Public-API-Projektion oder OBS.
- **Privacy-Grenze:** der Rechteworker hat die öffentliche `/api/emoji-rain/user-mappings`-Antwort auf `{success:true,mappings:{}}` und das Liveupdate auf `{mappings:{}}` projiziert; lokale Mappings bleiben unverändert. CEO bestätigt Owner-Producer-/Legacy-Consumer-Integration mit **224 Tests PASS**. Mein Rendererfixture nutzt synthetische leere Public-Mapdaten und prüft die Fallbackdarstellung; es ist kein unabhängiger erneuter Backend-Projektionslauf.
- Status: Legacy-Rendererfixture lokal grün; Browser-/OBS-/Live-Verhalten ungeprüft.

## ClarityHUD Full Overlay: Reconnect und Lifecycle

- Originalentry `app/plugins/clarityhud/overlays/full.html` → `overlays/full.js`; erforderliche Styles, Locale, Socket.IO und acht Hilfsbibliotheken werden geprüft.
- Bestehende GETs: `/api/clarityhud/settings/full`, `/api/clarityhud/state/full`; eingehende Rendererupdates: `clarityhud.settings.full` und die bestehenden `clarityhud.update.*`-Events. Kein neuer Public-Event, keine Route und kein Write.
- Befund/Fix: fehlender Reconnect-Read, keine finale Lifecycle-Bereinigung und stale Snapshot/Event-Race. Reconnect und BFCache pageshow laden die bestehenden Public-Reads; Socketupdates puffern währenddessen. Separate Revisionszähler verwerfen alte Settings-/State-GETs nach neueren Antworten oder Socketupdates. Final pagehide beendet eigene Handler/Timer/RAF/VirtualScroller/Accessibility-Styles; BFCache erhält den Renderer.
- Fixture `app/plugins/clarityhud/test/full-overlay-renderer-lifecycle.test.js`: Originalentry und Originalbibliotheken in JSDOM, lokale Response-/Socket-/Timer-/RAF-Doubles. **1 Suite / 1 Test PASS**.
- Keine Browser-/Tunnel-/OBS-Liveprüfung. `docs/coordination/clarityhud.md` dokumentiert die parallele UI-Arbeit; mein Patch liegt außerhalb deren dokumentierter Feed-/Accessibility-Hunks.

## Stream Monsters: BFCache-Rehydrierung und finaler Cleanup

- Originalentry `app/plugins/stream-monsters/streammonsters-overlay.html` lädt Socket.IO, i18n und zehn explizite Pluginmodule; sämtliche statischen Entry-Assets sind in der Public-Registry registriert. Initialer Zustand kommt über den festgelegten `GET /api/stream-monsters/state`; der Renderer konsumiert bestehende `streammonsters:*`-Ausgaben, darunter `streammonsters:hype_changed`. Bestehender Heartbeat-POST ist im lokalen Test nur abgefangen, nicht an einen Server gesendet.
- Befund: BFCache-pagehide bewahrte den Renderer, aber ein `pageshow.persisted` ohne neues Socket-`connect` holte keinen Snapshot. Finaler Cleanup ließ laufende Präsentations-Warte-Timer bis zu ihrem Timeout bestehen.
- Fix: BFCache-Restore startet bei aktiver Socketverbindung den vorhandenen Snapshot-/Reconnectpfad. Finaler Cleanup löscht offene Präsentations-Warte-Timer und löst die Promises kontrolliert auf, damit nachfolgende Lifecycle-Guards die Präsentation beenden.
- Fixture `app/plugins/stream-monsters/test/overlay-renderer-lifecycle.test.js` lädt Originalentry und alle zehn Originalmodule; prüft Assets über Registry, initialen State, ein bestehendes Socketevent, BFCache-Snapshot-GET und finalen Socket-/Handler-/Timer-Cleanup. **1 Suite / 1 Test bestanden**.
- Nur synthetischer JSDOM-/CPU-Verkehr; WebGPU und Audio bleiben deaktiviert. Keine Plugin-main-/Registryänderung, kein echter HTTP-/Socketserver, Browser, Tunnel oder OBS/LIVE. Public-Payloadprojektion ist damit nicht zusätzlich geprüft.

## WebGPU EmojiRain: Originalentry, State-Refresh und Cleanup (CPU-Fallback)

- Originalentry `app/plugins/webgpu-emoji-rain/overlay.html` lädt i18n, Socket.IO, `gpu/webgpu-emoji-engine.js` und `gpu/engine.js`. Die Fixture gleicht die statischen Assets und drei exakten GETs (`/api/webgpu-emoji-rain/config`, `/user-mappings`, `/overlay/state`) mit der Public-Registry ab. Sie verwendet ausdrücklich keine WebGPU-Implementierung, Audioausgabe oder echte Netzwerkverbindung.
- Befund: der Engine-Entry hydrierte zwar beim initialen Start und Socket-`connect`, hatte aber nur `beforeunload`-Cleanup, keinen BFCache-Refresh, keine Handler-/Socket-Freigabe und keinen Schutz vor verspäteten Runtime-GETs nach neueren Socketevents oder finalem Verlassen.
- Fix in `app/plugins/webgpu-emoji-rain/gpu/engine.js`: BFCache `pageshow` aktualisiert die drei bestehenden Public Reads; Hydration-Generation und Public-State-Revision verwerfen veraltete Antworten. Finales `pagehide` invalidiert ausstehende Reads, leert Rate-/Spawnqueues und Timer, zerstört den Renderer, entfernt eigene Sockethandler und trennt die Socketverbindung. Bestehende Eventnamen und Registry bleiben unverändert.
- Fixture `app/plugins/webgpu-emoji-rain/test/overlay-renderer-lifecycle.test.js` lädt Originalentry/-engine im JSDOM-Fallback: initiale Projektion, Overlaystatus-Events, Spawnqueue ohne GPU, stale Reply, BFCache-Refresh und final cleanup. **1 Suite / 1 Test bestanden**.
- Grenzen: Prüfung nur CPU-Fallback mit synthetischen GET-/Socketdaten. Keine GPU-, Browser-, Backend-, Tunnel- oder OBS-/Liveabnahme; serverseitige Projektion ist separater Nachweis.

## Visual FX Frame WebGPU: Originalentry-Lifecycle (Unsupported-CPU-Fallback)

- Originalentry `app/plugins/visual-fx-frame-webgpu/renderer/index.html` lädt i18n, Socket.IO, Defaultkonfiguration und sechs Renderer-/Controllerdateien. Alle statischen Assets und `GET /api/visual-fx-frame-webgpu/config` sind mit der bestehenden Registry abgeglichen. Der bereits vorhandene Clientstatus-Event `visual-fx-frame-webgpu:renderer-status` ist incoming; Config-/Trigger-/Clear-Events sind bestehende outgoing Events. Keine Registry-/Backendfreigabe geändert.
- Befund: Controller hatte keinen Reconnect- oder BFCache-Refresh, zerstörte die Engine auch bei BFCache-pagehide, hielt keine Handler zum Entfernen fest und ließ den Boot-/Config-GET nach finalem pagehide weiterlaufen. Ein neueres Config-Event während eines GETs konnte von dessen stale Antwort überschrieben werden; Events während des initialen GETs gingen verloren.
- Fix in `app/plugins/visual-fx-frame-webgpu/renderer/overlay-controller.js`: initiale Socketupdates puffern und nach dem Start anwenden; Connect/BFCache laden die bestehende Config-GET neu. Requestgeneration und Public-State-Revision verwerfen stale Antworten. BFCache behält Engine/Socket; finales pagehide invalidiert offene Reads, leert Puffer, entfernt eigene Socket-/Window-Handler, trennt den Socket und zerstört die Engine. Keine echten GPU-APIs.
- Fixture `app/test/visual-fx-frame-webgpu-overlay-lifecycle.test.js`: Originalentry und alle Originalmodule in JSDOM, echter Enginepfad meldet `navigator.gpu` unsupported; initial stale GET, Config-/Trigger-/Clear-Events, reconnect stale GET, BFCache-Refresh, verspätete Antwort nach final cleanup. **1 Suite / 1 Test bestanden**.
- Grenzen: synthetische GET-/Socketdaten im CPU-Fallback. Kein GPU-, Server-, Browser-, Tunnel-, OBS- oder Live-Start; serverseitige Public-Projektion separat.

## Restlücken und sachliche Ausschlüsse (Stand 2026-10-07)

### Konkrete Renderer-Lücken

- **WebGPU Fireworks:** Originalentry `app/plugins/webgpu-fireworks/overlay.html` ist statisch öffentlich registriert; `/api/webgpu-fireworks/config` sowie `webgpu-fireworks:config-update`, `:register-overlay`, `:renderer-status` und `:trigger` bleiben in der Public-Registry deny-by-default. Es gibt keinen öffentlichen Config-GET. Fixture `app/test/webgpu-fireworks-overlay-renderer-lifecycle.test.js` prüft CPU-Fallback, nur synthetische lokale Socketereignisse, BFCache-Erhalt und finalen Cleanup; **1 Suite / 1 Test bestanden**. Das belegt keine öffentliche Config-/Eventfunktion und keinen GPU-/Audio-/Browser-/OBS-Livebetrieb.
- **WebGPU Weather Control:** `app/test/webgpu-weather-control-overlay-lifecycle.test.js` lädt den Originalentry und Originalengine im CPU-Fixture (nur `init()` als ready gestubbt, kein GPU-Aufruf). Es prüft vorhandenen öffentlichen GET-/Socketvertrag, veraltete Configantwort, Reconnect, Community-HUD-Projektion, BFCache-Refresh und finalen RAF-/Socket-/Engine-Cleanup; **1 Suite / 1 Test bestanden**. Public-Projektion selbst ist hier nur per bestehender Funktion/Allowlist verifiziert, kein Server-/Livebeleg.
- **OpenShock/ZappieHell:** Im parallelen Workerstand liegen `app/plugins/openshock/test/zappiehell-overlay.test.js` und zugehörige dirty Overlay-/Pluginänderungen vor. Diese Arbeit wurde hier weder verändert noch erneut ausgeführt. Der Rendererbeleg braucht Handoff-/Ownerabgleich; reale Hardware-/Aktuatorstarts sind ausgeschlossen.

### Sachliche Scope-Ausschlüsse / kein passender OBS-Overlayentry

- **chatango:** Matrix-Entry ist `app/plugins/chatango/ui.html`, eine Settingsoberfläche und kein Overlayrenderer; der korrekte OBS-Entry müsste separat benannt werden.
- **interactive-story:** Renderer koppelt Provider-/Sprachausgabe; Originalrenderer-Test bleibt außerhalb dieses Auftrags wegen TTS-Scope.
- **music-bot:** Präsentation hängt an Audio-/Playbackverhalten; kein Audio wird in diesem Auftrag gestartet.
- **spotlight:** CEO hat die Familie ausdrücklich aus dieser Runde ausgeschlossen.
- **talking-heads:** durch Auftrag ausdrücklich geschützte Talking Heads/TTS-Familie; keine Bearbeitung oder Wiederholung.
- **minecraft-connect:** Legacyoberfläche; Public-Entry und Event bleiben absichtlich deny-by-default. Lokaler Fixturebeleg ist keine Public-Unterstützung.

### Kuratierter aktueller Renderer-Fixture-Gesamtbefehl

Der folgende lokale Node-22/Jest-Aufruf führt nur die gegenwärtigen, explizit zugeordneten Rendererfixtures aus. Er startet keinen GPU-Adapter, Audioausgang, Aktuator, Tunnel oder OBS. OpenShock ist bis zum Parallel-Handoff ausgeschlossen; Talking Heads/TTS, Interactive Story und Music Bot sind Scope-ausgeschlossen. Dieser Gesamtaufruf ist ein späterer Regressionsbefehl und wurde in dieser Runde nicht vollständig ausgeführt; die oben je Familie notierten Ergebnisse sind getrennte Einzelbelege.

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath `
  test/obs-timer-goals-renderer-fixtures.test.js `
  plugins/clarityhud/test/full-overlay-renderer-lifecycle.test.js `
  plugins/coinbattle/test/overlay-renderer-lifecycle.test.js `
  test/emoji-rain-obs-hud-renderer-lifecycle.test.js `
  plugins/fireworks/test/overlay-lifecycle.test.js `
  plugins/flame-overlay/test/renderer-lifecycle.test.js `
  plugins/game-engine/test/game-hud-renderer-lifecycle.test.js `
  plugins/milestone-leaderboard/vendor/viewer-leaderboard/test/obs-viewerxp-fixtures.test.js `
  plugins/minecraft-connect/test/overlay-renderer-lifecycle.test.js `
  test/quiz-show-overlay-renderer-lifecycle.test.js `
  plugins/schnorrbecher/test/obs-renderer-offline.test.js `
  plugins/stream-monsters/test/overlay-renderer-lifecycle.test.js `
  test/obs-stt-renderer-fixtures.test.js `
  plugins/toptier/test/obs-toptier-fixtures.test.js `
  test/visual-fx-frame-webgpu-overlay-lifecycle.test.js `
  test/visual-fx-frame-webgpu-renderer.test.js `
  test/weather-overlay-reconnect.test.js `
  test/webgpu-emoji-rain-renderer-parity.test.js `
  plugins/webgpu-emoji-rain/test/overlay-renderer-lifecycle.test.js `
  test/webgpu-fireworks-gpu-lifecycle.test.js `
  test/webgpu-weather-renderer.test.js
```

Kein Gesamtbefehl ersetzt Sichtprüfung oder OBS-Akzeptanz. Von den 26 Familien besitzen 20 zugeordnete lokale Renderer-/Enginefixtures unterschiedlichen Umfangs; die Tabellenzellen und Einzelabschnitte grenzen Engine-/CPU-/Projektor-/Lifecyclebelege jeweils ab. Drei offene Originalrenderer-/Owner-Lücken oben, die sachlichen Ausschlüsse und null OBS-Capture-Receipts bleiben offen.
