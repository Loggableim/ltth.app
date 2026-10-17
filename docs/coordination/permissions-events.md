# Rollenrechte und Ereignisberechnung

Stand: 2026-10-07

## Public Quick Tunnel Surface — P3 Sicherheitsauftrag

Stand: 2026-10-08. Der CEO-Auftrag beschränkte die öffentliche Quick-Tunnel-Oberfläche auf genehmigte Viewer-XP-Anzeigedaten und Sidekick-Chat-/Gift-Feed-Ereignisse. P2/OBS bleibt pausiert; diese Arbeit war ausschließlich source-/fixturebasiert.

### Befund und Umsetzung

- Die bestehende Registry erlaubte mehr öffentliche HTTP- und Socket-Oberflächen, als der genehmigte Datenumfang deckt. Ein Release-Owner allein reichte zudem nicht: im lokalen Distributionsmodus lieferte der bisherige Snapshot keine dynamischen Beta-Blocker für ein extern erreichbares Tunnel-Socket.
- Quick Tunnel HTTP ist jetzt auf Viewer-XP-Balken/Level-Up-Rendererressourcen, Sidekick-HUD und synthetisch projizierten Sidekick-Events sowie notwendige Locale-/Socket-Clientdateien begrenzt. Nicht freigegebene Plugin-Overlays und APIs geben einen neutralen 404 zurück. Lokale Hosts durchlaufen den bisherigen Handlerpfad unverändert.
- Eingehend ist nur `viewer-xp:public-profile:request` mit exakt einem begrenzten String erlaubt. Ausgehend muss ein Ereignis sowohl in der gepinnten Owner-Tabelle einem nicht Beta-Owner zugeordnet sein als auch einen nichtleeren typisierten Projektor besitzen. Unbekannte, ungemappte und Beta-Events werden blockiert; zusätzliche Argumente werden nicht weitergeleitet.
- `getPublicSurfaceSnapshot()` berechnet dynamische Beta-Blocker für die Tunneloberfläche auch bei lokaler Distribution, ohne normale lokale Snapshot-/Registrysemantik zu ändern. Der Owner-Map-Hash und die Ereigniszahlen werden validiert; kaputte Map- oder Policyzustände schließen den Tunnelzugriff.
- Sidekick-Status liefert im Projektor keine Metriken, Zähler, Verbindungs-/Mute- oder Kontofelder. Das HUD zeigt den genehmigten Chat-/Gift-Feed; Statusfetch, Statussocket und Statusanzeige sind entfernt.
- Quell-Audit ergab zusätzlich genau drei noch nicht in der Registry vorhandene Producer-Ereignisse: `wheel:spin-complete`, `goals:animation-end`, `tts:playback:ended`. Sie sind dokumentiert und bleiben unregistriert/öffentlich gesperrt, bis Producer, Consumer und Datenvertrag separat geprüft und genehmigt sind.

### Geänderte Dateien

- Produktcode: `app/modules/plugin-release-policy.js`, `app/modules/public-overlay-access.js`, `app/modules/public-overlay-release-event-policy.js`, `app/modules/public-overlay-release-event-owners.json`, `app/modules/public-overlay-socket-adapter.js`, `app/plugins/sidekick/backend/public-status.js`, `app/plugins/sidekick/overlay/sidekick-hud.html`.
- Regressionen: `app/test/public-overlay-approved-surface.test.js`, `app/test/public-overlay-access.test.js`, `app/test/public-overlay-release-owner-contract.test.js`, `app/test/public-overlay-security-matrix.test.js`, `app/test/public-overlay-socket-adapter.test.js`, `app/test/public-overlay-socket-events.test.js`, `app/test/public-overlay-viewer-xp-contract.test.js`, `app/plugins/sidekick/test/public-status-projection.test.js`.
- Drei vom Owner-Contract benötigte historische Fixturedateien unter `app/test/fixtures/` waren im gemeinsamen Arbeitsbaum gelöscht, obwohl der Contracttest sie weiter referenzierte. Sie wurden bytegetreu aus `HEAD` wiederhergestellt.

### Geprüft

- Gebündeltes Node 22.14.0, isolierte Jest-Fixtures: 9 Suites / 294 Tests bestanden (`public-overlay-approved-surface`, Viewer-XP-Contract, Security-Matrix, Socket-Events, Access, Socket-Adapter, Owner-Contract, Sidekick-Status-Projektion, Plugin-Release-Policy).
- Die Security-Matrix prüft nun alle materialisierten Overlay-Einstiege gegen die genehmigte Tunnel-Allowlist und bestätigt lokale Erreichbarkeit unabhängig davon. Nicht genehmigte API-Prüffälle erwarten neutrales 404; genehmigte Ereignis-/Profil-Contracts bleiben separat abgedeckt.
- Viewer-XP-Feedlimit wird auf dem erlaubten Pfad mit `limit=5` geprüft. Nicht erlaubte Quiz-Show-Leaderboardabfragen bleiben für Quick Tunnel gesperrt.
- Drei unbekannte Producer-Ereignisse werden im Quell-Audit explizit als offene Liste erwartet, statt sie durch Registryfreigabe zu kaschieren.
- Die zuvor gelöschten historischen Fixtures wurden wiederhergestellt; Owner-Contract bestand im Gesamtretetest.

### Verbleibende Risiken und Grenzen

- Kein LTTH-Server, kein öffentlicher Tunnel, kein Browser/OBS, keine echte Socket.IO-Verbindung und keine Zuschauer-/Kontodaten wurden gestartet oder verwendet. Das Ergebnis ist eine Quell- und Fixtureprüfung, keine praktische P3-Laufzeitabnahme.
- Andere bestehende Overlay-HTML-Einstiege sind über Quick Tunnel vorerst nicht erreichbar. Ihre benötigten Datenflächen brauchen jeweils einen expliziten Datenvertrag, Owner, Projektor und separate Freigabe, bevor sie wieder aufgenommen werden.
- Die drei Producer-Ereignisse sind offene Integrationsbefunde. Sie wurden weder zur öffentlichen Registry hinzugefügt noch als Fehlerzustand in einer Liveproduktion getestet.
- OBS/P2 bleibt nach Nutzerentscheidung pausiert und bei 0/104 praktisch geprüft. Eulerstream/P4 und spätere Zielbildpunkte bleiben entsprechend offen.

### Status und nächste Entscheidung

- **Behoben und geprüft:** dynamische Beta-Sperre für öffentliche Tunnel-Events im Local- und Public-Distributionsmodus, enge eingehende Profilanfrage, neutrale HTTP-Allowlist, typisierte ausgehende Projektion, Sidekick-Statusentfernung, lokale Host-Abgrenzung.
- **Teilweise geprüft:** nur source-/fixturebasiert; der öffentliche Quick Tunnel selbst wurde nicht gestartet.
- **Blockiert:** praktische P3-Abnahme hinter OBS/P2-Pause; Freigabe weiterer Overlay-Datenflächen; Einordnung und Verantwortlichkeit der drei unregistrierten Producer-Events.
- **Nicht geprüft:** reale Tunnelverbindung, Browserrenderer über externen Host, Liveviewer-Events, OBS und echte Sidekick-Daten.

## Aktueller Arbeitsauftrag

- **Erledigt und geprüft:** Game-Engine `current-state` projiziert die intern unnötige `sessionId` heraus; CPU-Projektor-/Adapter-/Registryfixtures bestanden.
- **Erledigt nach Freigabe:** Quiz-Show-Request `quiz-show:get-public-state`, reiner In-Memory-Payloadbuilder und requester-only Antwort über bestehendes `quiz-show:state-update`; Rendererrequest connect/reconnect/pageshow und Lifecycle sind separat vom Overlayowner fixturegeprüft.
- **Erledigt und geprüft:** Legacy EmojiRain Mapping-GET und -Update geben auf Public-Tunnel-Sockets nur eine leere Map ohne Statistiken weiter; lokale Admin-/Overlayantworten behalten Personalisierung. Die beiden originalen Legacyrenderer zeigen den erwarteten öffentlichen Default-Fallback.
- **Erledigt und geprüft:** TopTier `rank-change`, `new-leader` und `decay` werden zentral nach dem Vertrag ihrer Originaloverlay-Consumer projiziert; bestehende Registryfreigaben und lokale Payloads bleiben unverändert.
- **Erledigt und geprüft:** GCCE-Public-HUD Show/Remove/Clear/Rotator-Update und der bestehende Rotator-GET-Pfad verwenden zentrale typisierte Public-Projektionen. Medien werden nur über den bereits registrierten lokalen `/uploads/animations/...`-Assetpfad weitergereicht.
- **Erledigt und geprüft:** Game Engine `timer-update` gibt Public-Sockets nur die beiden Chess-Uhrwerte weiter. Die echte Timerproduktion und der vorhandene Chess-Overlay-Consumer sind als Fixture gekoppelt.
- **Erledigt und geprüft:** Game Engine `audio-state-updated` projiziert ausschließlich die für das Connect4-Overlay erlaubten Audioereignisse und Felder. Wheel-/Slotvarianten und malformed Daten werden für Public-Sockets verworfen.
- **Erledigt und geprüft:** Game Engine `media-updated` löst für das Connect4-Overlay nur dessen Medien-Neuladen aus; Public-Payload enthält nur `gameType: connect4`. Der interne Medien-Eventname und weitere Producer-Metadaten bleiben privat.
- **Erledigt und geprüft:** Chess-/Connect4-Config-GETs und `game-engine:config-updated` verwenden für Public nur die typisierte Allowlist tatsächlicher Originalrenderer-Felder. Autoplay-/Streamerrollen-/Chatcommand-/Lockout- und unbekannte Configwerte bleiben lokal.
- **Erledigt und geprüft:** Stream Monsters `egg_spawned` verwendet jetzt denselben typisierten Asset-/Ei-Projektor wie andere Lifecycle-Events. IDs und Korrelation bleiben stabil; nicht benötigtes Gift-/Providerereignis wird nicht in Live- oder Replaypayload persistiert.
- **Erledigt und geprüft:** Stream Monsters `mastery_unlocked` veröffentlicht nur den freigeschalteten Bonusnamen, den der Consumer anzeigt. Mastery-Datenbankobjekt und User-/Templatekontext bleiben intern; stabile opaque Ereignis- und Korrelations-IDs bleiben erhalten.
- **Erledigt und geprüft:** Stream Monsters `stream_mission_completed` enthält öffentlich nur den vom Overlay angezeigten bekannten Mission-Key. Streamschlüssel, Abschlusszeit, Fortschritt und Population-Metadaten bleiben intern.
- **Erledigt und geprüft:** Stream Monsters `achievement_unlocked` enthält nur den bekannten Achievement-Key plus den bestehenden sicheren Anzeigenamen. DB-Zeitstempel, Titelhilfsfelder und User-ID bleiben intern.
- **Erledigt und geprüft:** Stream Monsters `egg_ready` projiziert Toast-/Shelf-Felder, `owned_ready_egg_claimed` nur die vom Stage-Consumer verwendete Stage; rohe Ei-/Rescue-Zeilenfelder entfallen. Der bestehende Stream-Monsters-Emitter verwendet dieselbe Projektion für seinen Socketemit und die kritische Persistenz.
- **Erledigt und geprüft:** WebGPU Weather Trigger, Stop-, Config- und Gamification-Events sind jetzt für Public-Sockets typisiert; Gamification-Snapshot und Trigger-Metadaten werden auf die Felder des ausgelieferten Canvas-/HUD-Consumers reduziert. Lokale Emits bleiben unverändert.
- **Abgeschlossen:** gezielte Stream-Monsters-Coverageinventur der 21 kritischen Outboxtypen; Details, Replaygrenzen und verbleibende generische Stagefälle stehen im Abschlussnachtrag.

## Ergänzung: GCCE-Übersicht/Filter und LIVE-040 Chess-Restore

Stand: 2026-10-06. `Bugstofix.md` blieb unverändert.

- **LTTH-LIVE-019 bestätigt und im aktuellen GCCE-Diff behoben:** `/api/gcce/stats` lieferte `totalExecuted`, aber `updateStats()` aktualisierte das zugehörige DOM-Feld nicht. Die Funktion schreibt den API-Wert jetzt ins Feld und zeigt `-`, wenn er fehlt/kein endlicher Zahlenwert ist.
- **LTTH-LIVE-037 bestätigt und im aktuellen GCCE-Diff behoben:** Kategorien- und Rechtefilter enthielten nur fest codierte Werte und ließen vorhandene Kategorien wie VIP weg. Die Optionen werden jetzt aus den tatsächlich registrierten Commands aufgebaut; gefilterte leere Treffer werden als „Keine Befehle entsprechen diesen Filtern“ kenntlich gemacht. Die Liste wird nach Laden der Commands dynamisch befüllt.
- **LTTH-LIVE-040 bestätigt und behoben:** `ChessGame.restoreState()` mutierte bei inkonsistentem `currentPlayer` bereits `this.chess`, bevor es die Übereinstimmung mit der FEN-Zugseite prüfte. Das Restore lädt und validiert nun ein lokales temporäres `Chess`-Objekt und übernimmt es erst nach erfolgreicher Validierung. Die Regression beginnt mit einem nichtleeren Zielbrett, triggert den fehlerhaften Restore und prüft, dass der vollständige Zustand unverändert bleibt.
- **Geänderte Dateien dieser Ergänzung:** `app/plugins/game-engine/games/chess.js`, `app/plugins/game-engine/test/chess-game.test.js`, `docs/coordination/permissions-events.md`. GCCE-UI-Datei und `app/test/gcce-all-commands-display.test.js` waren bereits geänderte parallele Facharbeit und wurden von dieser Ergänzung nicht verändert.
- **Gezielt geprüft:** gebündelter Node 22.14.0, 5 Suites / 45 Tests bestanden: GCCE-Filter/UI, Rollen-/Ereignisregression, Viewer-XP/GCCE-Integration, CoinBattle-Regressionen und ChessGame. `git diff --check` für die beiden Chess-Dateien ohne Fehler.
- **Teilweise geprüft:** LIVE-019/037 sind durch eine bereits durchgeführte gerenderte GCCE-UI-/API-Beobachtung in `Bugstofix.md` bestätigt; die Filteränderung hat zusätzlich eine Quellregression. In dieser Runde wurde keine echte GCCE-UI erneut geöffnet. LIVE-040 ist auf echter Spielklasse mit isolierter Fixture regressiongeprüft, nicht über Route, persisted Session oder Live-Spiel.
- Keine Nutzer-/Zuschauerdaten, Konten, Rollen, Guthaben oder Liveaktionen verändert. Keine Adapter-/Shared-API-Änderung.

## Befund

- **LTTH-LIVE-034/035:** bestätigt. GCCE leitete Moderatorrechte aus `teamMemberLevel > 0` ab, setzte Fanclublevel zusätzlich als Subscriberstatus und cachete Rechteentscheidungen ohne die aktuelle Rolle im Schlüssel. Eine Moderatorfreigabe blieb daher nach einer Herabstufung bis zum Cacheablauf verwendbar.
- **LTTH-LIVE-043:** bestätigt. Music Bot erlaubte `mod` und `subscriber` anhand eines positiven Fanclublevels; bei einem `skip` mit `mod`-Konfiguration wurde dadurch der Force-Skip-Payload erzeugt.
- **LTTH-LIVE-029/031/033:** bestätigt. Der aktuelle normalisierte Adaptervertrag liefert `coins` als bereits mit `repeatCount` multiplizierte Seriengesamtsumme und `likeCount` als Anzahl gebündelter Likes. Top Tier multiplizierte normalisierte Coins ein zweites Mal. Viewer-XP führte Gifter-Session- und Allzeitwerte nur mit `diamondCount` fort und erhöhte die gemeinsame Like-Statistik pauschal um eins. Der bestehende CoinBattle-Pfad verwendet bereits die Gift-Gesamtsumme einmal.
- **LTTH-LIVE-041:** bestätigt. `acceptChallenge` buchte beide Einsätze vor `startMatch` ab. Im Fehlerpfad bezog sich der catch-Block auf `match`, das im try-Block deklariert war; der resultierende `ReferenceError` verhinderte die Erstattung. Die pending Challenge blieb bestehen und ein Retry konnte erneut abbuchen.
- **LTTH-LIVE-042:** bestätigt. Challenge-Handler erwarteten `context.user`, während GCCE Benutzer-ID und Nickname auf oberster Kontextebene liefert.

## Umsetzung

- GCCE stuft nur ein explizites `isModerator === true` als Moderator ein. Fanclublevel wird nicht mehr als Subscriber weitergereicht.
- Der GCCE-Rechtecache berücksichtigt Nutzer-ID, aktuelle Rolle und erforderliche Berechtigungsstufe. Ein Eintrag für eine höhere Rolle kann eine spätere niedrigere Rolle nicht freigeben.
- Music Bot verwendet für `mod` ausschließlich das Moderatorflag und für `subscriber` ausschließlich das Subscriberflag.
- Top Tier verwendet vorhandene normalisierte `coins` direkt. Nur wenn das Feld fehlt, fällt es auf `diamondCount * repeatCount/count` zurück.
- Viewer-XP übernimmt gebündeltes `likeCount` in die gemeinsame Like-Statistik. Für Giftpunkte und beide Gifter-Ranglisten verwendet es die normalisierte Gesamtcoinzahl; Rohpayloads ohne `coins` werden aus Einzelwert und Serienanzahl berechnet.
- CoinBattle baut Benutzerinformationen aus GCCE-Top-Level-Feldern auf. Die Matchreferenz ist im Fehlerpfad sicher initialisiert, sodass beide vorab abgebuchten Einsätze bei einem Matchstartfehler erstattet werden. Eine fehlgeschlagene Runde verbleibt pending; ein Retry kann wieder versuchen, startet aber bei jedem fehlgeschlagenen Versuch mit unverändertem Guthaben.
- Der Orchestrierungschat hat den Adaptervertrag bestätigt; dort sind keine Adapteränderungen geplant. Adapter und gemeinsame APIs blieben unverändert.

## Folgeauftrag: Game-Engine-Public-Event-Projektionen

Stand: 2026-10-07. Auf CEO-Priorisierung wurde die Eventmatrix von Game Engine und Stream Monsters weiter auditiert; umgesetzt wurden hier zwei eng belegte Game-Engine-Events. Der zentrale TikTok-Adapter, Registry, Producer und Originalrenderer blieben unverändert.

- **Befund `game-engine:timer-update`:** Producer sendet `{sessionId,timers,currentPlayer}`; der originale Chess-Overlayconsumer liest nur `timers.white` und `timers.black`. Die Session-ID und der aktuelle Spieler sind für die Anzeige unnötig und bleiben intern.
- **Umsetzung:** zentrale Projektion validiert beide nichtnegativen Uhrenwerte bis maximal ein Jahr und gibt ausschließlich `{timers:{white,black}}` weiter. Ungültige Zustände fail-closed; lokale Broadcastpayload unverändert.
- **Befund `game-engine:audio-state-updated`:** ein gemeinsamer Producername trägt Connect4-, Wheel- und Slotzustände. Nur das originale Connect4-Overlay konsumiert diesen generischen Eventnamen. Es prüft `gameType === 'connect4'` und nutzt `audioEvent` sowie Boolean `enabled`; `scopeId` wird nicht gelesen. Die Connect4-Audioevents sind eine feste Producerliste.
- **Umsetzung:** Public-Projektion akzeptiert nur Connect4 plus die sieben Producer-Audioevents und Boolean `enabled`; gibt `{gameType,audioEvent,enabled}` aus. Wheel-/Slotpayloads, fremde Audioevents, falsche Typen und unbekannte Metadaten werden verworfen. Lokale Payload und Produzenten bleiben erhalten.
- **Geänderte Dateien dieses Folgeauftrags:** `app/modules/public-overlay-payload-projection.js`, neue `app/test/game-engine-public-timer-update.test.js`, neue `app/test/game-engine-public-audio-state-projection.test.js` sowie dieser Bericht. Keine Registry- oder Shared-API-Änderung.
- **Geprüft:** erster Entwicklungscheck lief mit Node `v24.16.0`, 7 Suites / 202 Tests bestanden; der zwischenzeitlich unvollständige Fetchstub erzeugte eine `HTTP undefined`-Warnung. Das war kein finaler Runtime-/Fixturebefund und wurde nicht als Abnahme gewertet.
- **Fixtureumfang:** Timerfixture ruft den realen `_startChessMatch()`-Producer mit isolierten Sessions/Fake-Timern auf und führt sowohl projizierte als auch lokale Payload durch die echte Inline-Logik des Chess-Overlays. Audiofixture ruft die echte registrierte PUT-Route mit gemockter SQLite-Methode und getrennten Local/Public-Sockets auf; die Public-Payload wird durch den originalen Connect4-Handler im JSDOM geprüft. Keine reale Datenbank, Rolle, Guthaben oder Liveaktion.
- **Vollständige Fixtureabnahme:** Fetchstub wurde auf `{ok:true,status:200,json}` korrigiert. Der kanonische Node-22.14.0-Lauf folgte weiter unten ohne Warnung. Keine vollständige Game-Engine- oder Stream-Monsters-Matrix und keine vollständige Jest-Suite in diesem Schritt.
- **Befund `game-engine:media-updated`:** Produzenten für Connect4 Upload, Delete und Audioenabled-Änderung senden `{gameType,mediaEvent}`. Der einzige Originaloverlay-Consumer prüft nur `gameType === 'connect4'` und lädt dann den bestehenden Medienkatalog erneut; `mediaEvent` wird nicht gelesen. Der Katalogpfad ist ein separater Public-HTTP-Vertrag und wurde nicht verändert.
- **Umsetzung und Prüfung:** zentrale Projektion akzeptiert nur Connect4 und eine der sieben Connect4-Producer-Medienkennungen, gibt nur `{gameType:'connect4'}` zurück und verwirft andere Spiele/Events. Neue Fixture ruft die echte Delete-Route mit isolierter gemockter DB und Local/Public-Socketpair auf und führt den Public-Payload über den tatsächlichen Connect4-Handler aus. Unbekannte Zusatzmetadaten werden entfernt.
- **Geänderte Dateien für Media-Update:** `app/modules/public-overlay-payload-projection.js`, neue `app/test/game-engine-public-media-updated-projection.test.js` und dieser Bericht.
- **Kanonischer Runtimepfad:** `runtime/node/node.exe` im Projektroot liefert `v22.14.0` und wurde für die maßgeblichen Läufe verwendet. Der frühere Node-24-Lauf diente nur dem Fixturefeedback.
- **Kanonischer Lauf:** über `app` mit `../runtime/node/node.exe` (Node `v22.14.0`), exakt 8 Suites / 207 Tests bestanden, ohne Warnung (`test/game-engine-public-audio-state-projection.test.js`, `test/game-engine-public-media-updated-projection.test.js`, `test/game-engine-public-timer-update.test.js`, `test/game-engine-public-current-state-projection.test.js`, `test/public-overlay-payload-projection.test.js`, `test/public-overlay-access.test.js`, `test/public-overlay-registry.test.js`, `test/public-overlay-socket-adapter.test.js`). Der frühere Lauf mit v24.19.0 diente nur dem Fixturefeedback. Kein Vollsuite-Lauf.
- **Offen:** Die Stream-Monsters-Outbox-/Public-Payload-Matrix wird separat geprüft; frühere Chat-Sequenz-/Dedupeänderungen wurden nicht angetastet.
- **Stream-Monsters-Befund:** `streammonsters:egg_spawned` lief bisher im generischen rekursiven Key-Filter, obwohl `egg_hatched` bereits `projectEgg()` verwendete. Der Producer liefert `egg.imageUrl` normalerweise aus `createDefaultEggImage()` auf einem lokalen Assetpfad; der generische Pfad hätte aber ein unbekanntes/providerexternes `image_url` in Livepayload und Outbox übernommen. Der konkrete Consumer nutzt dieses Bild direkt für die Arcade-Card. Der Egg-Stage-Reducer ignoriert dieses Event mangels `visualId`; `egg_spawned` wird außerdem beim aktuellen Snapshot-Replay bewusst übersprungen.
- **Umsetzung:** eigener `egg_spawned`-Projektor gibt nur Displayname, `projectEgg()`-Whitelist und begrenzten Commandhinweis aus. `projectEgg()` akzeptiert ausschließlich etablierte lokale Stream-Monsters-Assetpfade oder die bekannten lokalen Art-/Avatar-Referenzen; fremde URLs werden `null`. Rohes `gift`, Provider-`event`, Plattform-/Egg-ID, Gift-ID, Seed und Visual-Key gehen nicht weiter. `eventId` und `correlationId` werden vom bestehenden Identitätsprojektor ergänzt und bleiben im Live-/persistierten Vertrag erhalten.
- **Outbox-/Replayprüfung:** `emitStreamMonsters()` projiziert vor dem Append; derselbe `emitted`-Payload wird in `appendCriticalEvent` persistiert und live gesendet, der vorhandene Recent-Events-Vertrag liest den gespeicherten Public-Payload. Flush sendet den gespeicherten Eventpayload ohne Neuprojektion; daher liegt die Bereinigung vor beiden Pfaden. Für `egg_spawned` ist der bestehende Snapshot-Replay-Filter explizit ausgeschlossen und wurde nicht geändert. Keine Producer-/Renderer-/Registry-/Adapteränderung, keine Änderung früherer Deduplogik.
- **Regression:** neue Fixture fügt ein synthetisches externes `image_url` und private Identifikatoren/Providerdaten ein; prüft Livepayload, gespeichertes Recent-Event, interne IDs, stabile opake event-/correlation-IDs und das Entfernen der Gift-/Providerobjekte. Isolierte SQLite-`:memory:`-Datenbank; kein echtes Konto oder Zuschauer.
- **Kanonischer kombinierter Lauf:** Node `v22.14.0`, exakt 11 Suites / 254 Tests PASS: `test/streammonsters-public-events-v15.test.js`, `test/streammonsters-overlay.test.js`, `test/streammonsters-egg-overlay-state-reliability.test.js`, plus die 8 Game-Engine-/Public-Overlay-Suites aus der vorherigen Zeile. Die v1.5-Suite enthält den neuen `egg_spawned`-Fall. Keine vollständige Jest-Suite.
- **Offene Auditfläche:** andere kritische Stream-Monsters-Ereignisse verwenden noch `deepProject()` plus private-Key-Heuristik. Für jeden Kandidaten sind Producer, konkrete Consumerfelder und Replay-/ID-Vertrag separat zu belegen, bevor weitere typisierte Whitelists geändert werden.
- **Nächster belegter Überschuss:** `streammonsters:mastery_unlocked` wurde vom Collection-Service mit `{userId,templateId,unlock,mastery}` emittiert; `mastery` enthält aus SQLite `user_id`, `template_id`, `points` und die volle `unlocks`-Liste. Der originale Overlay-Consumer zeigt ausschließlich `unlock`. Der Identitätsprojektor berechnet stabile `eventId`/`correlationId` zuvor aus User/Template/Unlock; Sequenz und Replay bleiben storeseitig und verwenden keine der entfernten Fachfelder.
- **Umsetzung:** typisierter Projektor lässt nur bekannte Producerunlocknamen `title`, `attack_trail` und `mastery_frame` durch. Unbekannte Unlockwerte werden zu leerem Fachpayload, behalten aber ihre bereits berechneten Event-/Korrelations-IDs; keine Änderung am Producer, Event-/Outbox-/Replaymechanismus oder renderer.
- **Regression und Prüfung:** bestehende Dedupe-/Recent-Event-Fixture erweitert um exakte Publicpayload-Whitelist und Persistenzgleichheit. Zusätzlicher unbekannter-Eventfall prüft fail-closed Fachpayload bei stabilen opaque Identitäten. Unter Node `v22.14.0`, `--runInBand --no-cache --detectOpenHandles`, 5 gezielte Stream-Monsters-Suites / 78 Tests bestanden: `test/streammonsters-public-events-v15.test.js`, `test/streammonsters-overlay.test.js`, `test/streammonsters-egg-overlay-state-reliability.test.js`, `test/streammonsters-collection-layer.test.js`, `test/streammonsters-lifecycle-atomicity.test.js`. Frühere 11-Suite/254-Tests-Prüfung deckt den Egg- und Game-Engine-Fall ab; Game-Engine-Dateien wurden für die neue Masteryänderung nicht erneut ausgeführt.
- **Befund `stream_mission_completed`:** Collection-Service sendet `{streamKey,mission}` aus der SQLite-Zeile mit `mission_key`, `target`, `progress`, `completed_at_ms`, `population_band`, `population_peak`. Der Originalcard-Consumer liest nur `mission.mission_key`. Der stabile Projektor verwendet mission key + stream key zur Event-/Korrelationsidentität; Snapshot-Replay unterstützt `stream_mission_completed` und wurde nicht verändert.
- **Befund `achievement_unlocked`:** Progression-Service sendet `{userId,achievement,messageKey}` mit SQLite-Achievementzeile (`user_id`, `achievement_key`, `unlocked_at_ms`, `titleKey`). Originaloverlay liest `achievement.achievement_key` für seinen lokalen Titel-Key und `displayName(data)` für die Card. Projektion behält genau diese Felder.
- **Umsetzung beider Rewardtypen:** bekannte Missionskeys (`six_hatches`, `four_elements`, `three_battles`, `heart_chain_five`) und Achievementkeys (`first_hatch`, `charged_hatch`, `six_elements`, `10_battles`, `50_battles`, `100_battles`, `five_win_streak`) typisiert erlauben; unbekannte Schlüssel ergeben leeren Fachpayload, stabile opake IDs werden nicht entfernt. Outbox-/Recent-Eventpayload ist identisch mit der live gesendeten Projektion.
- **Regression und Prüfung Mission/Achievement:** bestehende `test/streammonsters-public-events-v15.test.js` ergänzt um originalen Overlay-Sourcecontract, synthetische producernahe Payloads, Live-/Recent-Persistenzgleichheit, unbekannte Missionsschlüssel, unveränderte opake IDs und Entfernung von Stream-/DB-Metadaten. Unter Node `v22.14.0`, `--runInBand --no-cache --detectOpenHandles`, 7 gezielte Stream-Monsters-Suites / 137 Tests PASS: `test/streammonsters-public-events-v15.test.js`, `test/streammonsters-overlay.test.js`, `test/streammonsters-egg-overlay-state-reliability.test.js`, `test/streammonsters-collection-layer.test.js`, `test/streammonsters-lifecycle-atomicity.test.js`, `test/streammonsters-overlay-critical-queue-v15.test.js`, `test/streammonsters-creator-retention-v6.test.js`. Keine Game-Engine-Suite wiederholt, keine Fullsuite.

## Geänderte Dateien

- `app/plugins/gcce/index.js`
- `app/plugins/gcce/permissionChecker.js`
- `app/plugins/gcce/utils/PermissionMemoizer.js`
- `app/plugins/music-bot/lib/command-parser.js`
- `app/plugins/toptier/backend/score-engine.js`
- `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js`
- `app/plugins/coinbattle/engine/friend-challenges.js`
- `app/test/permissions-events-regression.test.js`
- `docs/coordination/permissions-events.md`

## Tests und Verifikation

- **Bestanden und geprüft:** gebündelter Node `v22.14.0`, Jest `--runInBand`, 3 Suites / 24 Tests: `test/permissions-events-regression.test.js`, `test/viewer-xp-gcce-integration.test.js`, `plugins/coinbattle/test/regressions.test.js`.
- Die neuen isolierten Fixtures decken GCCE-Rolle und Cache-Downgrade, Music-Bot-Moderator-/Subscriberrechte, Top-Tier-Serienwert plus Raw-Fallback, Viewer-XP-Likebündel und Gifter-Gesamtwerte sowie CoinBattle-Erstattung und Retry ab. Sie verwenden keine realen Konten, Datenbanken, Rollen oder Liveaktionen.
- `git diff --check` lief ohne Whitespacefehler.
- Ein ergänzender Lauf mit globalem Node `v24` war wegen `better-sqlite3`-ABI (Modul 127 statt 137) nicht nutzbar. Die bestehende Music-Bot-Parser-Suite meldete beim Subprozessstart `spawnSync ... EPERM`; eine zunächst falsch adressierte Testdatei wurde nicht gefunden. Maßgeblich sind die erneut mit gebündeltem Node bestandenen gezielten Suites.
- Es wurden keine Änderungen an `app/modules/tiktok.js` oder `app/modules/adapters/` vorgenommen. `Bugstofix.md` blieb unverändert.

## Verbleibende Risiken und offene Entscheidungen

- **Teilweise geprüft:** Fixture- und Methodenebene bestanden; keine echte TikTok-Rollenänderung, reale Giftserie/Likebündel, Live-Chatantwort, Musik-Playback, öffentliche Rangliste, persisted CoinBattle-Runde oder Profilpersistenz abgenommen.
- Ergänzende Review-Fixtures geprüft: GCCE `handleChatMessage` mit gewöhnlichem Teammitglied, tatsächlichem Subscriber und Moderator ergibt `all/false`, `subscriber/false`, `moderator/true` für Moderatorrechte. Music-Bot-Parser verweigert Teammitgliedern den Skip und erzeugt für einen Moderator `{ type: 'skip', force: true }`.
- CoinBattle verwendet für die neuen Annahmefälle echte Engine-, FriendChallenge- und SQLite-Methoden über isoliertes `:memory:`. Zwei gleichzeitige Annahmen liefern genau ein Match und einmalige Stakes. Ein injizierter Fehler bei der Aufnahme des zweiten Spielers erstattet beide Einsätze, beendet die partielle Runde und lässt einen erfolgreichen Retry mit genau einem endgültigen Einsatz je Spieler zu. Das ist keine reale Profilpersistenz.
- **Parallelannahmen:** geprüft mit `Promise.all` über dieselbe echte `acceptChallenge`-Methode und synchronen SQLite-Methoden. Die erste Annahme entfernt die pending Challenge vor Rückgabe; der zweite Aufruf erhält `Challenge not found or expired`, ohne zweite Abbuchung. Der aktuell synchrone DB-/Enginevertrag lässt zwischen Abbuchung, Matchstart und Challengeentfernung keinen asynchronen Yield zu.
- **Erfolgreicher Start:** in derselben SQLite-Fixture verifiziert; zwei Teilnehmer im Enginezustand, beide Guthaben danach 90 ausgehend von 100 bei Einsatz 10.
- **Nicht geprüft:** vollständige App-/Plugin-Lifecycle-Integration und vollständige Jest-Suite. Die oben genannten Umgebungsprobleme verhindern, diese ergänzenden Läufe als grün zu bewerten.
- **Offen:** Ob GCCE-Rechtecache-TTL/Größe angepasst werden soll, ist nicht erforderlich: Rollenwechsel erzeugen jetzt getrennte Cacheeinträge, und niedrigere Rollen können keine höhere Berechtigung wiederverwenden. Einträge bleiben bis TTL/Limit oder expliziter Invalidierung vorhanden.
- Keine Veröffentlichung, kein Push und keine Änderung realer Zuschauer-, Guthaben- oder Rollendaten; keine öffentlichen Nachrichten oder Liveaktionen.

## Runde 2: Weather-Rechte und Quiz-Antwortpräfixe

Stand: 2026-10-05. Die exakten `main.js`-Hunks wurden dem Overlaychat gemeldet; nach Bestätigung durch den Orchestrierungschat, dass diese Methoden exklusiv in diesem Fachbereich liegen und der Overlayworker sie nicht bearbeitet, wurden nur die beschriebenen Methoden geändert.

- **LTTH-LIVE-022 behoben:** `weather-control/main.js`, `checkUserPermission` gewährt Superfanzugang nur mit explizitem `isSuperFan`/`superFan`-Flag oder entsprechendem explizitem DBfeld; Subscriberzugang erfordert `isSubscriber` bzw. ein explizites Subscriber-DBfeld. `gifts_sent` und `team_member_level` allein gewähren diese Gruppenrechte nicht.
- **Offene Vertragsgrenze für LIVE-022:** Der untersuchte aktuelle `EulerstreamAdapter.extractUserData` liefert `isSubscriber` und `teamMemberLevel`, aber kein `isSuperFan`; die Chatnormalisierung reicht diese beiden Felder weiter. Der Superfan-Positivfall ist daher nur auf Pluginmethodenebene mit künstlich gesetztem Flag geprüft. Reale Superfan-Erkennung bleibt ungeprüft und erfordert später eine gesonderte Adapter-/API-Abstimmung; kein zentraler Adapter wurde geändert.
- **LTTH-LIVE-045 behoben:** `quiz-show/main.js::isAnswerCorrect` erkennt konfigurierte `!`- und `/`-Buchstabenpräfixe und wertet sie wie die akzeptierten nackten Buchstaben. Dieselbe Methode dient der Classic-Auswertung, Fastest-Finger- und Marathonentscheidung. Volltext bleibt unverändert; nicht aktivierte Präfixe und malformed Eingaben bleiben ungültig.
- **Geänderte Dateien Runde 2:** `app/plugins/weather-control/main.js`, `app/plugins/quiz-show/main.js`, neue `app/test/weather-quiz-permission-regression.test.js` sowie dieser Statusbericht.
- **Geprüft:** gebündelter Node `v22.14.0`; 5 Suites / 36 Tests bestanden: neue Weather-/Quiz-Regressionen, Weather GCCE Integration, Weather Control Integration, Quiz Robustness und Quiz LMS. Syntaxchecks beider Plugindateien und `git diff --check` bestanden. Jest meldete nach den fünf Suites eine offene asynchrone Ressource und beendete den Lauf nicht innerhalb seiner üblichen Einsekundenfrist; Exitcode 0 und alle Assertions bestanden, vollständiger Ressourcenabschluss nicht bestätigt.
- **Koordination:** Orchestrierungschat bestätigte nach Diffprüfung, dass Overlayworker Registry/Assets bearbeitet und die benannten Methoden exklusiv diesem Fachbereich gehören. Keine anderen Weather-/Quiz-Publicsurface-Methoden oder Adapter/Common APIs geändert.
- **Damals außerhalb des Auftrags gemeldet:** Der damalige Befund zur Jokerfreigabe wurde anschließend als separater Folgeauftrag priorisiert und unter „Folgeauftrag: Quiz-Joker-SuperFan-Prüfung“ behoben. Die alte Formulierung „nicht geändert/Freigabe ausstehend“ ist damit überholt.

## Folgeauftrag: Quiz-Joker-SuperFan-Prüfung

Stand: 2026-10-05. Der Orchestrierungschat priorisierte die Korrektur ausdrücklich; die Änderung betrifft nur den Quiz-Chatpfad.

- **Neuer Befund ohne Bugstofix-ID:** `quiz-show/main.js::registerTikTokEvents` setzte SuperFan fälschlich aus `teamMemberLevel >= 1 || isSubscriber` zusammen. Fanclub-Mitgliedschaft und Subscriberstatus sind keine bestätigte SuperFan-Rolle; ein fehlender Status darf die Sperre nicht öffnen.
- **Behoben:** Jokerzugriff verlangt jetzt `data.isSuperFan === true` oder `data.superFan === true`. Fehlende/false Flags, Fanclub-Mitgliedschaft und Subscriberstatus bleiben gesperrt. Die separate, ausdrücklich konfigurierte Geschenk-Jokerroute wurde nicht geändert.
- **Vorläufige Normalisierungssemantik:** `WebcastChatMessage_UserIdentity` in installiertem Euler-SDK v1 und v2 enthält Subscriber-/Moderator-/Follower-/Giftgiver-/Anchorflags, aber keinen expliziten SuperFan-Boolean. Das widerlegt keinen dynamischen Badge-/Raweventbeleg. Die v1/v2 `User`-Schemas enthalten zudem `badges`: v1 Attribute mit Szenen-/Bild-/Namensbadges; v2 `BadgeStruct` mit `badgeScene`, `logExtra`, Darstellungsvarianten; v2 `UserBadgesAttributes` zusätzlich `badgeSceneType`, `badges[{type,name}]` und `privilegeLogExtra`. Die v2 Szenen-Enum benennt `FANS` (Fans Club), aber keinen SuperFanwert. Freie Badge-Strings/Icons bleiben schema-seitig möglich, ihre SuperFan-Semantik ist nicht belegt.
- **Adapterbefund:** `extractUserData` sieht `user.badges`, extrahiert daraus derzeit nur die Fanclub-Szene 10/`FANS` als `teamMemberLevel`, Subscriber und Moderator aus `userIdentity` und verwirft die Badges im normalisierten Chatobjekt. Somit könnte ein Provider-Rawbadge verloren gehen; ohne minimierten realen oder dokumentierten Badgebeleg darf er nicht als SuperFan interpretiert werden.
- **Raweventbefund:** Der Adapter kennt Mapping `superFan` → internes `superfan`, aber kein `superFanJoin`. Das Mapping emittiert nur am privaten `eventEmitter`; `_registerEulerstreamEvents` registriert keinen `superfan`-Listener, und `TikTokConnector._bindAdapterEvents` leitet `superfan` nicht weiter. Die EulerSDK-Typen beschreiben Webcast-Nachrichten, aber keine garantierte Euler-Normalisierung dieser beiden benannten Events. Der Vergleichsconnector 2.4.2 klassifiziert `WebcastBarrageMessage` über `content.key`/`commonBarrageContent.key` Marker `ttlive_superfan...` als Werden bzw. Join; die Identität kann in verschachtelten `userValue.user` Feldern liegen. Das belegt mögliche Rohsignalform im Webcast-Ökosystem, nicht dass EulerStream diesen Payload im aktuellen LTTH-Verbindungspfad sendet.
- **Status vs. Event:** Ein Become-/Join-Barrage ist ein punktuelles Ereignis, kein belegter vollständiger aktueller Rollenstatus und enthält keinen dokumentierten Entzug-/TTL-Vertrag. Es ist daher keine Grundlage für dauerhafte Rechte oder einen persistenten Statuscache.
- **Aktueller Stand:** Das negative SDK-`.d.ts`-Ergebnis allein reicht nicht für „nicht unterstützt“. Ein belastbarer Rawbadge-/Eulerpayload-Vertrag ist mit den bisher vorliegenden Schemas, Tests und offiziellen Euler-Dokumenten weiterhin **nicht belegt**. Der vorhandene Adaptertest prüft nur Routing mit `{uniqueId,nickname}`, nicht Euler-Chatbadges oder rollenbehaftete SuperFan-Rawevents.
- **Nächster Belegbedarf:** Minimierter Euler-Chatdatensatz mit `user.badges` oder Euler-`superFan`/Join-Nachricht, ausschließlich SuperFan-relevante Badgefelder, strukturierte User-ID/Unique-ID und Eventart; alternativ eine konkrete Provider-Schema-/API-Dokumentstelle. Vor einem solchen Beleg keine Badgeheuristik, keinen Rollenstatuscache und keine UI-Änderung. Ein passiver Verbindungstest ist nur mit eindeutigem Teststream, im Testprofil und ohne Eingriffe in eine bestehende Appverbindung vertretbar; ein eindeutiges Streamziel wurde in dieser Auftragsnachricht nicht genannt.
- **Live-Prüfung vorbereitet, wartet auf Credential-Bestätigung:** Orchestrierung/Nutzerkontext hat `die_maetzchen` als autorisierten aktiven Teststream benannt. Read-only geprüft: aktives Profil ist `test`, Profil-DB lesbar ohne Schreibzugriff; `tiktok_euler_api_key`, `EULER_API_KEY` und `SIGN_API_KEY` sind nicht gesetzt. Ohne eigenen Key wählt der Adapter nur seinen gebündelten Euler-Fallback und `connect(username, { fallbackKeyConfirmed: true })` ist erforderlich; andernfalls gibt `connect()` den Status `fallback_confirmation_required` zurück. Dieser Fallback wurde noch nicht verwendet. Die Nutzerfrage „Darf ich diesen Key einmalig nur im isolierten passiven Prozess für `die_maetzchen` verwenden, ohne App- oder Profiländerungen?“ ist im Popup offen; Antwort nicht unterstellt. Keine Verbindung gestartet.
- **Geplanter isolierter Ablauf nach Antwort:** eigener Node-Prozess mit Adapter/SDK, keine App-/Profilverbindung, keine DB-Schreibmethoden; begrenztes Fenster mit Timeout und sauberem Disconnect. Nur reduzierte Feldnamen/Typen, anonymisierte IDs und Rollenindikatoren erfassen, niemals Kommentartext/Namen/Keys/volle Payloads. Raw- und normalisierte Chat-/Barragefelder sowie `superFan`/`superFanJoin`-Dispatch vergleichen. Kein beobachtetes Ereignis wird als Beleg seiner Abwesenheit gewertet.

## Folgeauftrag: LIVE-032 Goals-Flags und LIVE-018 Wheel-POST

Stand: 2026-10-05. Vor Änderungen aktuelle parallele Diffs/Status geprüft; Goals-API und Game-Engine-Wheel-Handler waren nicht von anderen Diffs betroffen. Keine Änderung an zentralem TikTok-Adapter oder Shared API.

- **LIVE-032 behoben:** Goals-POST und PUT normalisieren bekannte SQLite-Booleanflags `enabled`, `reset_on_stream_end`, `firework_enabled`, `firework_progress_enabled` als JSON-Boolean oder numerisches `0/1` auf SQLite-kompatible Integer. Andere Werte (z. B. String `"false"`) erhalten HTTP 400 statt eines SQLite-Bindefehlers. Unbekannte Felder bleiben dem bestehenden DB-Whitelistverhalten überlassen.
- **LIVE-018 behoben:** manueller Wheel-Spin-Handler wartet jetzt `await triggerSpin()` ab und serialisiert dessen Ergebnis; Promise-Rejections liefern HTTP 500 mit Fehlertext und Serverlog statt HTTP 200 `{}`.
- **Regressionen:** `app/test/goals-boolean-flags-route.test.js` ruft registrierte POST-/PUT-Handler mit echter `GoalsDatabase` auf isoliertem SQLite `:memory:` auf; erstellt/aktualisiert boolesche Flags, prüft persistierte Integerwerte und HTTP-400 bei ungültigem Flag ohne DB-Mutation. `app/plugins/game-engine/test/wheel-spin-route-promise.test.js` ruft den registrierten Wheel-POST-Handler mit Promise-Erfolg und Promise-Rejection auf.
- **Geänderte Dateien:** `app/plugins/goals/backend/api.js`, `app/test/goals-boolean-flags-route.test.js`, `app/plugins/game-engine/main.js`, `app/plugins/game-engine/test/wheel-spin-route-promise.test.js` und dieser Statusbericht.
- **Geprüft:** gebündelter Node `v22.14.0`; neue Route-Regressionen: 2 Suites / 4 Tests bestanden. Einmaliger Kompatibilitätslauf relevanter bestehender Goals-/Wheel-Suites: 15 Suites / 139 Tests bestanden. `git diff --check` bestanden (nur bestehende Zeilenendenhinweise).
- **Nicht geprüft:** echte lokale HTTP-Serverintegration, tatsächliche Overlay-Animation oder reale Event-/Profilzustände; keine echten Wheel-Spins oder Zuschaueraktionen ausgeführt.
- **Regressionen:** neue `app/test/quiz-show-joker-superfan.test.js` ruft den registrierten Chatcallback auf und prüft die echte Jokerverarbeitung: Teammitglied, Subscriber, fehlender/false Status werden abgewiesen; explizites `isSuperFan: true` aktiviert genau einen Joker und emittiert das Aktivierungsereignis.
- **Jest-Ressource:** ein einmaliger `--detectOpenHandles`-Lauf hatte den einzigen offenen Timeout auf den vorhandenen LMS-Winnersieger-Test lokalisiert. Der Test räumt jetzt seinen Fixturetimer mittels fake timers ab. Gezielt erneut geprüft: `quiz-show-joker-superfan.test.js` und `quiz_show_lms.test.js`, 2 Suites / 9 Tests bestanden, normaler Jest-Abschluss ohne `--forceExit`.
- **Geänderte Dateien:** `app/plugins/quiz-show/main.js`, `app/test/quiz-show-joker-superfan.test.js`, `app/test/quiz_show_lms.test.js` und dieser Bericht.
- **Verbleibend:** keine echte SDK-/Live-Rollenerkennung geprüft; es liegt kein abgestimmter Adaptervertrag für SuperFan-Chatidentität vor. Keine realen Liveaktionen oder Änderungen an Zuschauerdaten.

## Folgeauftrag: LIVE-003, LIVE-016/017 und LIVE-038/039

Stand: 2026-10-06. Neben bestehender paralleler Arbeit geprüft; `Bugstofix.md` blieb unverändert. Keine Liveaktionen oder Schreibzugriffe auf reale Zuschauerdaten.

- **LIVE-003 behoben:** `CoinBattleEngine.getMatchState()` berücksichtigte nur abgeschlossene Pausen (`totalPausedTime`); während der laufenden Pause sank `remaining` bei jedem State-Read. Der aktuelle Pausenabschnitt wird jetzt ebenfalls abgezogen. Eine Verlängerung während Pause erhöht `remaining` sofort, und nach Resume läuft die Anzeige ab demselben eingefrorenen `elapsed` weiter.
- **LIVE-017 behoben:** Das dynamisch aktualisierte Plinko-Feld `#test-total-bet` trug einen statischen `data-i18n`-Key für „0 XP“. Übersetzungsrefresh konnte daher die API-Anzeige überschreiben. Der Key wurde vom Wert entfernt; dessen initialer Text und API-Refresh bleiben erhalten.
- **Regressionen/Prüfung:** isolierte Fake-Timer-Regression deckt Pause, wiederholtes State-Read, Verlängerung während Pause und Resume ab. Plinko-Regression prüft, dass dynamischer Einsatzwert nicht mehr statisch übersetzt wird und `loadTestStats()` weiter den API-Wert einsetzt. Gebündelter Jest-Lauf: 4 Suites / 63 Tests bestanden; Jest entdeckte dieselben zwei Testdateien zusätzlich unter dem vorhandenen `naked/`-Snapshot und meldete Haste-Namenskollisionen. Keine Laufzeitfehler.
- **Geänderte Dateien:** `app/plugins/coinbattle/engine/game-engine.js`, `app/plugins/coinbattle/test/match-state-emission.test.js`, `app/plugins/game-engine/ui.html`, `app/plugins/game-engine/test/plinko-test-mode.test.js` und dieser Bericht.
- **LIVE-016 behoben:** `game-engine:request-state` erkennt vor dem normalen Interactive-/Metadatenpfad eine echte aktive manuelle Connect4-Session anhand der Game-Instanz, DB-Spieltyp und `manual`-Trigger. Nur der anfragende berechtigte Socket erhält `game-engine:game-started` samt aktuellem Board, Spieler-/Turnzustand und explizit begrenzter Connect4-Renderconfig. Sound-/sonstige Config wird nicht mitgesendet. Abgeschlossene Spiele und andere Spieltypen nehmen den unveränderten normalen Pfad; kein globaler Broadcast.
- **LIVE-038/039 behoben:** `advanceQuestProgress` gibt für bereits abgeschlossene Questdefinitionen früh zurück, bevor Fortschritt, Abschlusszählung, Persistenz, Broadcast oder Reward wiederholt werden. Der erste Abschluss emittiert genau einen `weather:trigger` über den bestehenden `createWeatherEvent`-Vertrag, mit Quest-ID/-Titel-Metadaten. Das bestehende Gamification-Rewards-Flag unterdrückt den Trigger bei `false`; Questdefinitionen werden bei Anlage normalisiert, einschließlich unbekannter Action → `rain`-Fallback. Rotationstimer prüft die weiter aktive abgeschlossene Quest-ID, bevor er rotiert.
- **Regressionen/Prüfung:** GameEngine-Integrationstests belegen verspätete private State-Antwort, Renderconfig-Whitelist, erhaltenen Interactivepfad, kein falsches Startsignal für abgeschlossene/fremde Sessions und keinen Broadcast. Weather-Fixtures decken Rotation an/aus, wiederholte Completion, Rewardpayload, deaktivierte Rewards und unbekannte Action mit Fallback ab. Gezielt: 2 Suites / 80 Tests bestanden. Zusammen mit CoinBattle/Plinko-Zielläufen: 4 Suites / 113 Tests bestanden. `git diff --check` geprüft.
- **Zusätzliche geänderte Dateien:** `app/plugins/game-engine/main.js`, `app/plugins/game-engine/test/interactive-plugin-integration.test.js`, `app/plugins/weather-control/main.js` und `app/test/weather-gamification.test.js`.
- **Nicht geprüft / Risiken:** kein echter Browser-/OBS-Overlay-Lauf; Ergebnis stammt aus isolierten Jest-Integrationsfixtures. Questabschluss und Reward werden wie vorhandene Gamification-State-Änderungen verzögert persistiert; crash-resistente Exactly-once-Garantien über Prozessabbruch hinweg sind damit nicht belegt. Keine echten Liveaktionen oder Zuschauerdaten geändert.

## Folgeauftrag: LIVE-010/011, LIVE-044 und LIVE-047/048

Stand: 2026-10-06. Aktuelle Arbeitsdeltas geprüft; Music-Bot-Änderung an `command-parser.js` blieb unberührt. Keine User-Credentials oder gespeicherten Einstellungen geändert, kein echter Prozessscan und keine Live-/Overlayaktion ausgelöst.

- **LIVE-010 behoben:** Offizielle Ollama-Dokumentation nennt für direkten Cloudzugriff `https://ollama.com/api` und für OpenAI-Kompatibilität `https://ollama.com/v1`; direkter Cloudzugriff braucht Bearer-Key. Der Interactive-Story-Default zeigt jetzt auf `https://ollama.com/v1`. Der alte Alias `api.ollama.com` wird zur Laufzeit normalisiert, ohne gespeicherte Userkonfiguration zu überschreiben.
- **LIVE-011 behoben:** `llmTimeout` wird nun als SDK-Requesttimeout gesetzt; OpenAI-SDK-internes Retry ist deaktiviert, damit die konfigurierte Service-Retryzahl/-verzögerung maßgeblich bleibt. Lokaler asynchroner HTTP-Fake erhielt den Chatrequest, gab erst nach 300 ms Antwort, und der Service brach beim gesetzten 60-ms-Limit ab; Socket wurde serverseitig als geschlossen beobachtet. Kein echter Provider oder Schlüssel benutzt.
- **LIVE-044 behoben:** Der gemeinsame `_settleWithin` begrenzte auch normale Prozessscans auf das 2-s-Cleanup-Limit. Scanauflösung nutzt jetzt das explizite bis zu 5-s-Budget; Termination/Cleanup bleibt separat bei max. 2 s. Fake-Timer-Tests belegen Erfolg bei 2,5 s innerhalb von 5 s sowie Timeout jenseits des Budgets; keine Prozesse wurden aufgelistet oder beendet.
- **LIVE-047 behoben:** Deckkraft und Geschwindigkeit verlangen jetzt endliche numerische JSON-Werte; Geschwindigkeit respektiert die dokumentierte Untergrenze 0,1. Ungültige Eingaben liefern HTTP 400 ohne Zustandsänderung oder Socketevent.
- **LIVE-048 umgesetzt, Codevertrag geprüft:** Klassischer Renderer lädt beim Start den aktuellen Overlaystatus und wendet `opacity` auf den vollständigen Partikelcontainer an; Socketupdates setzen ihn ebenfalls. Tests sichern Route-Emission, initialen Statuspfad, Update-Handler und Zielcontainer ab.
- **Prüfung:** gebündelter Node `v22.14.0`; alle Tests in `interactive-story/test`, `emoji-rain/test` und `music-bot/test`: 27 Suites / 216 Tests bestanden. `git diff --check` bestanden.
- **Geänderte Dateien:** `app/plugins/interactive-story/main.js`, `app/plugins/interactive-story/engines/openai-llm-service.js`, `app/plugins/interactive-story/test/provider-config.test.js`, `app/plugins/interactive-story/test/openai-llm-timeout.integration.test.js`, `app/plugins/music-bot/lib/soundbot-process-registry.js`, `app/plugins/music-bot/test/soundbot-process-scan-budget.test.js`, `app/plugins/emoji-rain/main.js`, `app/plugins/emoji-rain/test/overlay-controls.test.js`, `app/public/js/emoji-rain-engine.js` und dieser Bericht.
- **Nicht geprüft / Risiken:** kein echter Ollama Cloudaufruf, kein appweiter Story-Ende-Abbruchtest, kein OS-Prozessscan und kein gerenderter Browser-/OBS-Pixeltest. LIVE-048 hat einen Renderer-/Socket-Quellvertrag, aber keine visuelle Runtimeabnahme. Keine Credentials, Profileinstellungen, Prozesse, Zuschauerdaten oder Livezustände geändert.

## Folgeauftrag: LIVE-005, LIVE-030 und EmojiRain-LIVE-048 Runtimeprobe

Stand: 2026-10-06. Getrennte Arbeitsdeltas vor Änderungen geprüft. Registry-Änderungen bleiben beim Overlayfachagenten; kein eigener Edit an Registry/Shared ViewerXP-Backend.

- **LIVE-048 Runtimeprobe bestanden (isolierte lokale Renderprüfung):** Codex IAB zeigte die echte `plugins/emoji-rain/overlay.html` mit dem tatsächlichen `public/js/emoji-rain-engine.js` und Matter.js. Fixture-API lieferte ausschließlich `config.enabled=true`, leere synthetische Mappings und Overlaystatus `opacity: 0.42`; Fixture-Socket sandte `emoji-rain:opacity { opacity: 0.18 }`. Der echte Container meldete berechnet initial `0.42`, danach `0.18`. Rendererlog bestätigte Config, Mapping, Physics-Initialisierung und Socketverbindung. `enabled` kommt aus dem bestehenden `/api/emoji-rain/config`-Leseweg, nicht aus dem Overlaystate. Fixturetab und Server wurden beendet. Keine echte App, Profile, Live- oder OBS-Daten verwendet.
- **Registryabhängigkeit durch Overlayfachagenten bearbeitet:** Öffentlicher Allowlistvertrag ergänzt für exaktes `GET/HEAD /api/emoji-rain/overlay/state` und ausgehendes `emoji-rain:opacity`; kein POST/Incoming-Event. Der Endpoint liefert `paused/theme/opacity/speed` und numerische Queuegröße, keine Userdaten, Secrets oder vollständige Pluginconfig. Fachagent besitzt die Registryhunks; eigene Browserprobe lief bewusst gegen isolierte API-Fixtures und ersetzt die Registry-/Security-Matrixtests nicht.
- **LIVE-005 behoben:** Theme-CSS für `cid` und `vision-impaired` lag nach `</html>` und wurde vom Browser als sichtbarer Bodytext statt CSS-Regeln behandelt. Die Regeln liegen jetzt innerhalb des vorhandenen `<style>`-Blocks. JSDOM-Regressionscheck bestätigt beide Selector-Regelsätze in den CSSOM-Regeln und keinen CSS-Text im Body.
- **LIVE-030 behoben:** TopTier `board=combined&variant=animated-race` forderte Likes und Gifts an, aber `getActiveBoards()` ließ den Boardwert `combined` beim Rendering aus. `combined` ist jetzt für beide Listen ein aktiver Boardtyp. Isolierter JSDOM-Test lädt den echten Overlayrenderer mit diesen URL-Parametern, sendet synthetische Like-/Giftboards und prüft beide sichtbaren Titel und Einträge.
- **Prüfung:** zusammen mit aktueller Public-Overlay-Registry-/Security-/Socket-/Dependency-Änderung gezielt geprüft: 6 Suites / 314 Tests bestanden. Darin die beiden LIVE-005/030 Regressionen und Contract-/HTTP-Matrix für LIVE-048. Die echte IAB-Probe bestätigte initiale und Socket-aktualisierte berechnete Deckkraft.
- **Geänderte eigene Dateien:** `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/overlays/user-profile.html`, `app/test/viewer-xp-profile-theme-css.test.js`, `app/plugins/toptier/assets/overlay.js`, `app/plugins/toptier/test/combined-board-variant.test.js` und dieser Bericht.
- **Nicht geprüft / Risiken:** kein OBS-Browser und kein echter öffentlicher Tunnel; Locale-Varianten und dynamische TopTier-Daten aus der laufenden App waren nicht Teil der isolierten Tests. Die HTML-/JS-Fixture bestätigt Rendererzustand, aber erlaubt noch keine echte öffentliche Zustellungsaussage.

## Fachauftrag: LIVE-029/031/033/034/035/041/042/043 – Verifikationsstand

Stand: 2026-10-06. `Bugstofix.md` wurde nicht bearbeitet.

- **Befund im aktuellen Code bestätigt:** Der EulerstreamAdapter berechnet Gift-`coins` als `diamondCount * repeatCount`, emittiert serienfähige Gifts erst mit `isStreakEnd` und dedupliziert Liveereignisse; `likeCount` ist die Anzahl einzelner Likes im gebündelten Ereignis. GCCE/Music-Bot, Top Tier, Viewer-XP und CoinBattle hatten die in den LIVE-029/031/033/034/035/041/042/043 beschriebenen Abweichungen.
- **Umsetzung im Arbeitsbaum:** GCCE trennt Moderatorstatus von Fanclublevel/Subscriber und bezieht die aktuelle Rolle in Cachekeys ein; Music Bot vergibt `mod`-/`subscriber`-Berechtigungen nur über die jeweiligen expliziten Flags. Top Tier nutzt normalisierte Gesamtcoins direkt. Viewer-XP übernimmt `likeCount` und Giftgesamtcoins jeweils einmal. CoinBattle erstattet beide Stakes bei fehlgeschlagenem Matchstart und liest die GCCE-Benutzeridentität aus Top-Level-Kontextfeldern. Keine Änderungen am zentralen Adapter oder an gemeinsamen APIs.
- **Gezielt geprüft:** gebündelter Node 22.14.0, 3 Jest-Suites / 24 Tests bestanden (`permissions-events-regression`, `viewer-xp-gcce-integration`, CoinBattle `regressions`); scoped ESLint und `git diff --check` ohne Fehler.
- **Geänderte Dateien im relevanten Arbeitsstand:** `app/plugins/gcce/index.js`, `app/plugins/gcce/permissionChecker.js`, `app/plugins/gcce/utils/PermissionMemoizer.js`, `app/plugins/music-bot/lib/command-parser.js`, `app/plugins/toptier/backend/score-engine.js`, `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js`, `app/plugins/coinbattle/engine/friend-challenges.js`, `app/test/permissions-events-regression.test.js` sowie dieser Bericht. Diese Dateien waren im bereits umfangreich geänderten Arbeitsbaum vorhanden; bestehende Fremdänderungen wurden nicht zurückgesetzt.
- **Behoben und geprüft:** LIVE-029/031/033/034/035/041/042/043 auf isolierter Methoden-/Fixtureebene.
- **Teilweise geprüft:** Keine echte Rollenänderung, reale Giftserie/Likebündel, Chataktion, Wiedergabe, veröffentlichte Rangliste oder persistierte CoinBattle-Runde getestet; keine vollständige App-/Liveintegration ausgeführt.
- **Blockiert / nicht geprüft:** keine Blockade für die lokalen Korrekturen. Reale TikTok- und Browser-/Playback-Abnahme bleibt ausstehend. Keine realen Zuschauer-, Guthaben- oder Rollendaten, öffentlichen Nachrichten, Gifts oder Liveaktionen verwendet.

## Nachtrag: Stream Monsters Creator-State Saisonvertrag

Stand: 2026-10-06. Ergänzende Abstimmung zur Docs-Capture-Overlayanzeige; keine Capture-Ausführung und keine Änderung an `Bugstofix.md`.

- **Befund:** `GET /api/streammonsters/creator-state` liefert `season: this.progression?.getCurrentSeason?.() || null`. `initDocsCaptureRuntime()` konstruiert keine `StreamMonstersProgressionService`-Instanz und übergibt auch keine `progression` an `StreamMonstersRoutes` (dessen Konstruktor setzt den Default auf `null`); daher ist `season: null` im Docs-Capture-Pfad beabsichtigt. Im normalen Runtimepfad konstruiert der Plugin-Initializer den Progression-Service. Dessen `getCurrentSeason()` ruft `store.ensureSeason()` auf und kann eine Saisonzeile anlegen.
- **Umsetzung:** kein Codepfad zur Saisoninitialisierung ergänzt. Regression in `streammonsters-docs-capture-safety.test.js` sichert fehlende Route-Progression, `season: null`, keinen `ensureSeason()`-Aufruf und unveränderte leere Saisontabelle nach erfolgreichem synthetischem Creator-State-GET.
- **Geänderte Dateien:** `app/test/streammonsters-docs-capture-safety.test.js` und dieser Statusbericht. Die umfangreichen übrigen Arbeitsbaumänderungen stammen aus parallelen Aufgaben und blieben unangetastet.
- **Tests:** gebündelter Node `v22.14.0`: `test/streammonsters-docs-capture-safety.test.js` bestanden (1 Suite / 4 Tests); zusätzlich `git diff --check` für die beiden Statusdateien bestanden. Global Node 24 konnte wegen better-sqlite3 ABI 127/137 nicht laufen; mit dem Repo-Bundle lief die Suite.
- **Teilweise geprüft:** Nur isolierte In-Memory-DB und registrierter GET-Handler; UI-Endzustand wurde anhand des aktuellen Source-Branches mit `seasonUnavailable`/`seasonLoadFailed` geprüft, ohne App-, Browser- oder Capture-Start.
- **Verbleibende Risiken / offene Entscheidungen:** Falls eine Docs-Capture-Seed später eine Saisonzeile enthält, bleibt der aktuelle Creator-State-Vertrag weiterhin `null`, da die Route absichtlich keinen Saisonreader besitzt. Für die aktuelle seedlose Fixture ist das konsistent; ein künftiger UI-Bedarf für vorhandene Saisonzeilen müsste einen expliziten read-only API-Vertrag erhalten und mit Overlay-Eigentümer abgestimmt werden. Keine realen DBs oder Livezustände verwendet.

## Nachtrag: Stream Monsters Integrationstestpfad

Stand: 2026-10-06.

- **Befund:** `streammonsters-plugin-integration.test.js` bezog `pluginDir` in drei Stellen aus `process.cwd()`. Bei Root-Aufruf wurde dadurch `root/plugins/...` statt `app/plugins/...` verwendet und ein irreführender Asset-Befund ausgelöst.
- **Umsetzung:** Test definiert `APP_DIR` relativ zu `__dirname` und verwendet den absoluten App-Pfad für Stream Monsters sowie GCCE-Testfixtures. Produktcode unberührt.
- **Geänderte Dateien:** `app/test/streammonsters-plugin-integration.test.js` und dieser Bericht.
- **Tests:** gebündelter Node v22.14.0, `streammonsters-plugin-integration.test.js` aus `app/`: 1 Suite / 28 Tests bestanden; separater Root-Aufruf mit `--config app/jest.config.js`: 1 Suite / 28 Tests bestanden. Ein initialer Versuch mit dem falschen relativen Node-Pfad startete keinen Test; der anschließende korrekte Root-Aufruf bestand.
- **Verbleibende Risiken:** Keine App-, Capture-, MPV- oder Releaseartefaktprüfung im Umfang dieses Auftrags.

## Folgeauftrag: Historische 52-Fail Backendtriage

Stand: 2026-10-06. Abgleich mit `docs/coordination/CEO_HANDOFF.md`, `regression-resolution-map.md` und `full-regression.md`; keine künstliche Mutation mangels unabhängig bestätigtem Backendproduktfehler.

- **Befund:** In der Map sind die konkret benannten Backendverhaltensfälle nachgeprüft: Viewer-XP-Bündelung, Music-Bot-Parser, Chess-Autoplay/WASM, Plugin-Lifecycle-Routes, Dependency-Integrity, Plugin-Security mit gültigem Manifest und Sidekick-vnyan mit `io.to(room)`-Double. Die erste vorliegende Story-Rollen/Gift-/CoinBattle Runde ist separat dokumentiert und fokussiert getestet. Kein offener backendseitiger Produktfehler ließ sich aus dem aktuellen Handoff-/52-Fail-Belegbestand unabhängig bestätigen.
- **Konkrete Restlücken:** Music-Bot-MPV-Integration blieb wegen `spawn EPERM` ungeprüft (Playback/Heartbeat/Seek/Cleanup). `plugin-store-registry` sowie Stream-Monsters Asset-/Releaseprüfungen sind Git-/Paket-/Child-Process-Verträge und teils durch `spawnSync git EPERM` blockiert. `streammonsters-product-contract` hatte einen Jest-Subprozess mit `status: null`; direkte `--check` Projektionen waren laut Bericht synchronisiert, Suite insgesamt nicht bestätigt. Diese offenen Punkte belegen keine Laufzeit-Backendstörung. Weitere historische Fehler betreffen Dokumentationsinventar, Übersetzungen, Versionsprojektionen und Galerie-Human/OBS-Gates.
- **Umsetzung:** Keine Produkt- oder Testdateien geändert; kein Fehlertest künstlich erzeugt. Vorhandene Fixes und spätere fokussierte Abnahmen nicht erneut behauptet oder überschrieben. Talking Heads und TTS unangetastet.
- **Prüfungen:** Nur lesender Abgleich der genannten Handoff-, Mapping- und Baselineberichte sowie Quellcheck der aktuellen Integrations-Testpfadänderung. Keine Fullsuite, App, Capture, MPV, Releaseartefakte, produktiven Profile/Prozesse, Netzwerk oder Schlüssel verwendet.
- **Status:** Keine neuen Änderungen; konkrete Restlücken sind externe MPV-Prozessintegration und Git-/Release-Prüfungen, keine aktuell reproduzierte Backend-Produktregression.

## Folgeauftrag: `streammonsters-product-contract` `status: null`-Ursache

Stand: 2026-10-06. Read-only-Quellanalyse plus genau ein autorisierter fokussierter Testlauf; keine Fullsuite.

- **Konkreter Aufruf:** `app/test/streammonsters-product-contract.test.js:14-20` ruft `childProcess.spawnSync(process.execPath, [<repo>/scripts/sync-streammonsters-product.js, '--root', root, ...args], { cwd: repoRoot, encoding: 'utf8' })` auf. Im aktuellen Test ist `repoRoot = path.resolve(__dirname, '..', '..')`; `syncScript` zeigt auf Root-`scripts/sync-streammonsters-product.js`. Das ist kein Package-/Asset-Build und ändert bei `--check` nichts.
- **Optionen und Diagnose:** Es werden weder `timeout` noch `maxBuffer`, `signal` oder `windowsHide` explizit gesetzt. Node `spawnSync`-Defaults gelten; die synchronisierte Erfolgs-/Driftmeldung ist klein, daher ist ein Bufferlimit anhand der aktuellen Quellen kein naheliegender Beleg. Test prüft nur `result.status`, `stderr` und `stdout`; bei `status: null` gehen `result.error` (z.B. `EPERM`), `result.signal` und ein möglicher Teiloutput in der Fehlermeldung verloren. `status: null` allein beweist nicht, ob Spawn blockiert/fehlgeschlagen ist oder das Child durch ein Signal beendet wurde.
- **Exakter historischer Beleg:** Im externen Baseline-Log `%TEMP%\\ltth-full-jest-baseline-20261006.log` stehen sechs Fehlassertionen für diese Suite: `keeps every checked product projection synchronized` erwartete Status 0, bekam null; fünf `reports ... drift in --check mode`-Varianten erwarteten Status 1, bekamen null. Die beiden direkten In-Memory/Plugin-Assertions lösten dort keinen berichteten Fehler aus. Log nennt für diese Kinder weder `error.code` noch `signal`; kein expliziter historischer EPERM-Beleg für genau diese Suite.
- **Spätere Evidenz getrennt:** `release-contract-triage.md` dokumentiert einen direkten schreibgeschützten `node scripts/sync-streammonsters-product.js --check`-Erfolg und späteren genehmigten Jestlauf der ersten drei Tests (1 Suite / 3 bestanden, 6 übersprungen), sowie eine Orchestratorauswahl mit 6 Suites / 18 bestanden / 36 übersprungen. Das bestätigt ausgewählte Verträge, aber nicht die fünf Drift-Fixture-Subprozessfälle. Historisches `spawnSync git EPERM` betrifft andere Registry-/Releaseprüfungen; es darf nicht als Ursache dieses `node.exe`-Kindes behauptet werden.
- **Gezielter Diagnoselauf (genau einmal):** gebündelter Node `v22.14.0`, `--runTestsByPath test/streammonsters-product-contract.test.js --runInBand --no-cache`, CWD `app/`. Ergebnis **1 Suite: 2 bestanden, 7 fehlgeschlagen von 9 Tests**. Alle sieben erreichten Kindstarts zeigten nun explizit `error.code: EPERM`, `error.message: spawnSync <repo>\\runtime\\node\\node.exe EPERM`, `signal: null`, `status: null`, leere stdout/stderr. Die übrigen zwei Tests bestanden. Kein Retry gemäß Auftrag.
- **Fixture-Isolation/Cleanup:** alle fünf Driftfälle lesen zunächst Quellprojektionen und schreiben Mutationen ausschließlich in `fs.mkdtempSync(os.tmpdir())`-Fixtures; der deterministische Write-Mode-Test repariert ebenfalls nur sein eigenes Tempfixture. `finally` löscht diese Fixtures. Produktprojektionen werden für den Read-only-Check nur gelesen und nicht mutiert.
- **Umsetzung:** ausschließlich `expectSyncStatus()` im Testhelper ergänzt. Bei unerwartetem Status bewahrt es die unveränderte Statusassertion und ergänzt begrenzte `error.code/message`, `signal`, `status`, stdout/stderr (je 1000 Zeichen). Erfolgreiche Assertions bleiben unverändert.
- **Geänderte Dateien:** `app/test/streammonsters-product-contract.test.js` und dieser Bericht.
- **Status / nächster Schritt:** Der historische `status: null` ist nun für die aktuelle Sandboxausführung auf Spawn-`EPERM` eingegrenzt, kein Checker-/Projektionsfehler. Der Childprozess wurde nicht gestartet, also sind die fünf Driftchecks und Write-Mode-Assertions in diesem Run nicht validiert. CEO kann den exakt gleichen fokussierten Lauf unabhängig in einer genehmigten isolierten Spawnumgebung wiederholen; keine lokale Eskalation oder Wiederholung durchgeführt.

## Folgeauftrag: Spotlight-Overlay-Projektion und Session-Synchronisierung

Stand: 2026-10-07. Spotlight-Tokenvertrag nach CEO-Freigabe implementiert; kein OBS-/VM- oder Livebetrieb.

- **Befund:** Persistierte interne `sessionId` wurde in Spotlight-GETs, direkten Updateevents, Multi-HUD-Updates und Resetpayloads veröffentlicht und von beiden Rendererclients als Generationserkennung verwendet. `projectPublicOverlayUser()` begrenzt nun sämtliche Nutzerpayloads auf die Rendererfelder; dabei bleiben sichtbare Coins/Giftserienwerte `giftCount` erhalten, während interne IDs, Rohchat, Gift-ID und `streakLength` ausgeschlossen werden. Letzteres bleibt intern verfügbar für die Wiederherstellung der Giftserie.
- **Umsetzung:** Plugininitialisierung und `resetSession()` erzeugen je einen unabhängigen zufälligen `overlaySessionToken` (crypto `randomBytes(32)`, nicht persistiert und nicht aus `sessionId` abgeleitet). Interne `sessionId` bleibt für Persistenz und interne Session-/Streaklogik bestehen. GET `/last` und `/all`, direkte Events, Multi-HUD-Events sowie Resetevent liefern den Token; beide tatsächlichen Rendererclients prüfen damit veraltete Socket-/GET-Antworten. Reset-POST enthält keine interne Session-ID. Token dient nur der Synchronisierung und ändert keine Zugriffskontrolle.
- **Geänderte Dateien:** `app/plugins/spotlight/main.js`, `app/plugins/spotlight/overlays/single-overlay.js`, `app/plugins/spotlight/overlays/multihud.js`, `app/test/lastevent-single-overlay-client.test.js`, `app/test/lastevent-multihud-overlay.test.js`, `app/test/lastevent-spotlight-plugin.test.js`.
- **Tests:** Gebündelter Node/Jest, fokussiert `lastevent-single-overlay-client`, `lastevent-multihud-overlay`, `lastevent-spotlight-plugin`: 3 Suites / 22 Tests bestanden, Exit 0. `git diff --check` für die sechs geänderten Dateien ohne Befund. Tests decken stale GET nach Reset für beide Renderer, öffentliche Projektion, Nicht-Leak von IDs/Rohchat/privaten Metadaten sowie getrennte interne Sessionpersistenz/Resetrotation ab.
- **Behoben und geprüft:** öffentliche Felder-Allowlist und Token-Synchronisierung auf Jest-/JSDOM-Fixtureebene; Giftserien-Recovery nutzt weiter interne `streakLength`-Metadaten.
- **Teilweise geprüft:** Quell-/Clientvertrag einschließlich Multi-HUD. Keine Appintegration, echter Browser oder OBS-Rendererabnahme.
- **Blockiert:** nichts im lokalen, fokussierten Auftrag.
- **Nicht geprüft / Risiken / offene Entscheidung:** Keine produktive oder echte Liveausführung. Token ist bewusst kein Authentisierungsmittel. Ein bestehender Renderer, der noch mit einer älteren Backendversion verbunden ist, kann keine Updates mit dem neuen Feldvertrag synchronisieren; gemeinsam ausgerollte Plugin-/Overlaydateien bleiben erforderlich. CEO-Abnahme steht aus.

## Folgeauftrag: Spotlight-Reviewstatus und STT-Ticker-Rendererprüfung

Stand: 2026-10-07. Keine weiteren Spotlight-Mutationen und kein Commit.

- **Spotlight-Commit-/Reviewgrenze:** Die exakte dritte Testdatei ist `app/test/lastevent-spotlight-plugin.test.js`; zusammen mit `app/test/lastevent-single-overlay-client.test.js` und `app/test/lastevent-multihud-overlay.test.js` waren dies die drei fokussierten Testdateien (22/22 Tests im vorigen Lauf). Der dazugehörige Produktumfang umfasst `app/plugins/spotlight/main.js`, `app/plugins/spotlight/overlays/single-overlay.js` und `app/plugins/spotlight/overlays/multihud.js`. Kein Commit erstellt. Der Arbeitsbaum enthält weiterhin umfangreiche parallele Änderungen; nur diese sechs Spotlight-Dateien gehören zum oben genannten scoped Delta, bestehende Fremdhunks wurden nicht gestaged oder verändert. CEO-Nachprüfung abwarten.
- **Rendererauswahl anhand aktuellem Inventar:** STT Ticker ist klar unterscheidbar von den abgeschlossenen Timer/Goals-, EmojiRain-, TopTier- und Viewer-XP-Fixtures. Stream Monsters bleibt beim Overlay-Owner. `docs/coordination/obs-pruefplan.md` beschreibt STT Ticker als DOM/CSS ohne GPU-/Audioausgabe und synthetische Socketdaten; `docs/coordination/obs-104-source-inventory.json` weist praktische OBS-Abdeckung weiterhin als 0/104 aus.
- **Originalrendererbefund:** `app/plugins/stt-ticker/overlay/ticker.html` enthält den Originalrenderer, bindet nur `stt-ticker:transcript`, `stt-ticker:interim` und `stt-ticker:clear`, lädt dieselbe lokale `i18n-client.js` und Socket.IO-Scriptressource und ruft selbst keinen Daten-GET-Endpunkt ab. Initiale Leere, synthetische Transcript-/Interim-/Clear-Verarbeitung, fehlerhafte Payloads, locale-i18n-Fehler, späte Socketevents sowie idempotentes `pagehide`-Cleanup (Handler, MutationObserver, Socket) sind bereits in `app/test/obs-stt-renderer-fixtures.test.js` gegen das echte HTML belegt. Dessen untracked Fixturehelper `app/test/helpers/obs-stt-renderer-fixture.js` simuliert ausschließlich Loopback-Ressourcen und synthetische I18n-GETs.
- **GET-Fehler / Reproplan:** Ein Overlay-GET-Fehler oder GET-Recovery ist für den STT-Ticker-Originalrenderer nicht anwendbar: der Originalrenderer hat keinen Daten-GET. Der vorhandene Repro erfasst stattdessen einen isolierten I18n-Übersetzungs-GET mit synthetischem 503, Fallback auf Deutsch, keine Provideranfrage und keine Socketemission. Einen Daten-GET nur zum Erzwingen einer Fehlerprobe hinzuzufügen wäre unbegründete Produktänderung und unterbleibt. Geplante Offline-Erweiterung des vorhandenen Fixtures: instrumentierte fake Socket mit einmalig auslösbarem `error`/disconnect und explizitem final pagehide; GET 503 für jede vom Originalrenderer tatsächlich verwendete GET-Ressource; prüfen sichere leere/zuletzt gerenderte Ausgabe, erneutes Laden per dokumentiertem reconnect nur falls der Originalcode das anbietet, listener-/observer-/socket cleanup und inert späte Events. Aktuell bietet der Renderer keinen Fehlerhandler für `stt-ticker:error` und keine explizite Disconnect-Recovery außer Socket.IO-eigener Transportbehandlung.
- **Status:** Bisheriges Fixture bereits source-/JSDOM-validiert; dieser Folgeauftrag führte keine weitere Änderung und keinen neuen Testlauf aus. Konkrete Lücke ist ein gezielter GET-/Transportfehlerfall im vorhandenen Originalrendererfixture, jedoch ohne anwendbaren Renderer-Daten-GET. Keine App, OBS, STT backend, Mikrofon, Provider oder Livezustand gestartet.

## Folgeauftrag: Sidekick-Guesttransfervertrag

Stand: 2026-10-07. Spotlight-Delta ist durch CEO-Commit `932ca6512` (sechs exakt begrenzte Produkt-/Testdateien) abgeschlossen und eingefroren; CEO meldete unabhängige 22/22-Tests PASS. Kein weiterer Spotlight-Eingriff.

- **Befund:** Das Sidekick-Quellmanifest führte gehashte Host-/Testdateien unter `files`, ohne eine deterministische effektive Gästeteilmenge. Die Rolle allein reichte dem nachgelagerten ISO-Helper nicht als Filtervertrag. `socket.io-client`-Paketprovenienz war nicht explizit, und der Runner fragte `?lang=en` an, obwohl das HUD diese Query ignoriert.
- **Umsetzung:** `files` bleibt vollständige gehashte Quellprovenienz. Neu ist `effectiveTransfer` mit exakter Helper-kompatibler `{schemaVersion,files:[{path,bytes,sha256}]}`-Dateiliste (544 Records) und explizitem Allowlist-Rollenvertrag; unbekannte Rollen kommen nicht hinein. `excludedFromGuest` führt die vier Host-/Testdateien jeweils mit Quellrolle und Grund auf. `stage-contract.js` ist als benötigter Guest-Runnerhelper deklariert. `socket.io-client@4.8.3` ist als standalone browser bundle mit 155.836 Bytes und SHA-256 dokumentiert; Paketmodule des Clients werden nicht zusätzlich transferiert. Runnerergebnis enthält `localeQuery: {requested:'en', applied:false, reason:...}`; das Runbook erklärt, dass dies eine semantikfreie Query ist und keine englische HUD-Ausgabe behauptet.
- **Profilkoordination:** Vor der Schemaänderung ging ein Hinweis an den Profile-Runtimeaudit-Owner: Quell-`files` bleibt erhalten, additive `effectiveTransfer`-/`excludedFromGuest`-Sektionen, keine Änderung an Profil-/Dry-run-Dateien. Bis zum Berichtsschluss kam keine Rückmeldung. Keine Profiledatei geändert.
- **Geänderte Dateien:** `docs/coordination/obs-sidekick-pilot-transfer-manifest.json`, `scripts/obs-pilot/run-pilot.js`, `scripts/obs-pilot/test/contract.test.js`, `docs/coordination/obs-guest-bootstrap.md`, dieser Bericht.
- **Tests und Integrität:** Gebündelter Node 22.14.0, `--test --experimental-test-isolation=none scripts/obs-pilot/test/contract.test.js scripts/obs-pilot/test/stage-contract.test.js`: 2 Suites / 22 Tests bestanden, Exit 0. Nach Anpassung waren alle 548 Sourcefiles byte-/SHA-konsistent; alle 544 effektiven Transferrecords stimmten byte-/SHA-genau mit der Quelle überein; genau 4 Einträge ausgeschlossen. `git diff --check` für die fünf Bericht-/Code-/Manifestdateien bestand.
- **Behoben und geprüft:** Effektive Transferliste und Hostprovenienz sind getrennt; Contracttest vergleicht die komplette Liste mit einer expliziten Rollenallowlist und schlägt bei unbekannter oder falsch transferierter Rolle fehl. No-op Localeausgabe wird maschinenlesbar und im Runbook erklärt.
- **Teilweise geprüft / Risiken:** Sourceclosure/Hashkonsistenz ist lokal geprüft. Das additive Quellmanifest ist keine ISO-Eingabe; daraus wurde weder normalisiert noch eine Payload kopiert. Gastlauf, portable OBS-Closure, ISO, OBS oder VM sind ungeprüft und bleiben separat freigabepflichtig.
- **Nicht geprüft:** Kein Start, Netz, Profilzugriff, Transfer, ISO oder Produktionsdaten. Kein Commit oder Push durch diesen Agenten.

## Vorschlag für den nächsten Rendererauftrag

`openshock` aus `docs/coordination/obs-pruefplan.md` ist in der aktuellen Matrix noch `blocked-before-practical-capture`, während die abgeschlossenen Renderer-Fixtures (Timer/Goals, EmojiRain, TopTier, Viewer-XP und STT Ticker) nicht wiederholt werden sollen. Enger nächster Schritt: nur `app/plugins/openshock/overlay/openshock_overlay.html`, `openshock_overlay.js`, den exakten Producer `normalizeCommandPayload` und zugehörige vorhandene Fixturetests quellenprüfen; den dort dokumentierten exakten Payload-/Socketvertrag in einem fake-only Harness verifizieren. Kein Runner-/App-/OBS-/Hardwarestart und kein echtes Gerätekommando. Erst nach bestandenem synthetischem Harness kann eine spätere statische/renderer fixture geplant werden. Falls die noch fehlende Payloadsemantik nicht aus lokalem Producer/Tests bestimmbar ist, als konkreten Blocker statt guessed fixture melden.

## Folgeauftrag: OpenShock Renderer-/Fixture-Audit

Stand: 2026-10-07. Nur originaler Renderer, lokaler Event-Producer und isolierte Fixtures; kein App-, OBS-, Server-, Netzwerk- oder Hardwarestart.

- **Befund:** Das aktuelle HTML verwendet `event-type`, `event-device`, `event-source` und `event-user`; der Renderer schrieb stattdessen in nicht vorhandene IDs, sodass diese Eventwerte im Original-HTML nicht ankamen. Die Normalisierung kopierte zuvor den vollständigen Socketpayload samt Geräte-/Benutzer-/Sessionkennungen und Metadaten in das Rendererobjekt; bei fehlendem Anzeigenamen fiel sie auf die rohe Geräte-ID zurück. HTML-Escaping vor `textContent` zeigte Entities wörtlich an. Socket-Logs gaben rohe Eventobjekte aus. Cleanup hörte auf `beforeunload`, war nicht idempotent und entfernte Socketlistener/alle Renderer-Timer nicht zuverlässig; ein gespeicherter Callback konnte nach Zerstörung noch wirken.
- **Semantikgrenze:** Der Produkt-Producer `main.js::_buildCommandSentPayload()` erzeugt den kanonischen Socketvertrag inklusive IDs; die Rendereränderung projiziert diesen auf Displayfelder und ändert weder Producer, API noch Geräte-/Intensitätsverhalten. `type` ist nur `shock|vibrate|sound`, `intensity` bleibt im zulässigen Anzeigebereich 0–100 und `duration` muss endlich und nicht negativ sein. Fehlende menschenlesbare Gerätenamen werden als `Unknown Device` ausgegeben, rohe IDs nicht angezeigt. Patternvorschau behält nur endliche, nichtnegative Schrittwerte und entfernt Zusatzmetadaten.
- **Umsetzung:** Renderer bindet die echten HTML-IDs, schreibt untrusted Anzeigezeichenketten als Text und verwendet statische Typ-/Quellenlabels. Normalisierung ist eine Allowlistprojektion; ungültige Typ-/Zahlenpayloads werden verworfen. Rohe Socketpayloads werden nicht protokolliert. `pagehide` und `beforeunload` rufen idempotentes Cleanup auf; verwaltete Timer und Socket-/DOM-Listener werden entfernt, und verspätete Callbacks/Configantworten werden ignoriert. Timeout-Handle `0` wird korrekt gelöscht.
- **Geänderte Dateien:** `app/plugins/openshock/overlay/openshock_overlay.js`, `app/plugins/openshock/test/event-contracts.test.js` und dieser Bericht.
- **Tests:** Gebündelter Node/Jest, gezielt `event-contracts.test.js`, `test/openshock-overlay-dom.test.js` und `test/openshock-overlay-theme-sync.test.js`: 3 Suites / 12 Tests bestanden (Exit 0). `git diff --check` für die drei geänderten Dateien bestanden. Fixtures laden das Original-HTML/den Originalrenderer in JSDOM und verwenden Fake-Socket sowie isolierte Timer.
- **Behoben und geprüft:** DOM-Bindung, Textinjektion, Geheimnis-/ID-Projektion, ID-only-Fallback, Typ-/Wertevalidierung sowie wiederholtes pagehide/beforeunload mit Timer-/Listenerbereinigung und inertem Late-Event sind regressionsgesichert.
- **Teilweise geprüft:** Nur deterministische Renderer- und Methodenfixtures; weder Backend-End-to-End noch Capture/OBS-Layout oder Paketlaufzeit geprüft. Jest wurde mit `--forceExit` beendet, nachdem die fokussierten Suiten bestanden hatten; keine Aussage über nicht fokussierte Handles im Vollprozess.
- **Blockiert / nicht geprüft:** Praktische OBS-/Capture-Abnahme bleibt separat offen. Kein echtes Gerät, echtes Kommando, Produktionsprofil, Netzwerk/API, Server, Overlayrunner oder OBS verwendet. Kein Commit/Push. `Bugstofix.md`, Talking Heads, TTS, Profilemigration und öffentliche Overlayregistrierung unverändert.

## Folgeauftrag: OpenShock BFCache-Lifecycle und Public-Surface-Abgrenzung

Stand: 2026-10-07. Repro und Fix ausschließlich mit Originalrenderer, fake Socket/JSDOM und synthetischen PageTransition-Events. Kein Hardware-, Netzwerk-, Pluginserver- oder OBS-Start.

- **Repro vor Fix:** Ein neuer Regressionstest dispatchte zuerst `beforeunload`, danach `pagehide` mit `persisted=true`. Der alte Listener rief sofort `cleanup()` auf; der Test scheiterte mit `socket.disconnect()` statt 0 Aufrufen. Das bestätigt, dass Cacheeintritt die Rendererinstanz irreversibel entsorgte.
- **Umsetzung:** Cleanup ist nicht mehr an `beforeunload` gebunden. `pagehide.persisted=true` erhält Socket, Listener und Timer; `pageshow.persisted=true` verbindet den existierenden Socket erneut, falls er während des Cacheaufenthalts getrennt wurde. Ein finales `pagehide` ohne Persistenz ruft weiterhin idempotentes Cleanup auf. Die Regression belegt erhaltene Timer-/Listener-Handles und Queuezustand, Reconnect nur am Fake-Socket, einmalige finale Trennung und ignorierte gespeicherte Late-Callbacks.
- **Producer-/Projectionstrennung:** `main.js::_buildCommandSentPayload()` enthält weiterhin `deviceId` und `userId` im kanonischen `openshock:command-sent`-Event. Der Renderer entfernt diese Werte vor der Anzeige/Queueprojektion; das ist kein Producer- oder Public-Payload-Datenschutzfix. Producer/API/Device-Vertrag blieb unverändert.
- **Public-Surface-Lesebefund:** `server.js` hängt Quick-Tunnel-HTTP-Middleware und Socket-Policy ein. Der reine Registrycheck liefert für GET `/openshock/overlay`, `/openshock/openshock_overlay.js` und `/openshock/openshock_overlay.css` jeweils `false`; `/openshock/zappiehell/overlay` ergibt `true`. `openshock:command-sent` ist kein erlaubtes ausgehendes Quick-Tunnel-Socketevent, während das separate `zappiehell:overlay:animate` freigegeben ist. Damit ist die aktuelle Hybridshock-Rendererseite in dieser Public-Allowlist nicht zugänglich; daraus folgt keine allgemeine Aussage für andere lokale Zugriffswege.
- **Geänderte Dateien:** `app/plugins/openshock/overlay/openshock_overlay.js`, `app/plugins/openshock/test/event-contracts.test.js` und dieser Bericht.
- **Regression und Testbeleg:** Der neue Persistenztest schlug vor Fix mit Exit 1 fehl und bestand nach Fix. Finaler Befehl (Arbeitsverzeichnis `app/`): `..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --detectOpenHandles --runTestsByPath plugins/openshock/test/event-contracts.test.js test/openshock-overlay-dom.test.js test/openshock-overlay-theme-sync.test.js`; Exit 0, 3 Suites / 13 Tests bestanden. Kein `--forceExit`; Jest endete natürlich, `detectOpenHandles` meldete keine offenen Handles. Public-Registryabfrage lief nur als lokaler reiner Modulaufruf und benötigte keinen Server/Netzwerkzugriff. `git diff --check` für die eigenen Änderungen bestanden.
- **Risiken / nicht geprüft:** Kein echter Browser-BFCache, OBS-Capture oder Produktivsocket validiert; der Fixturevertrag simuliert die PageTransition-Ereignisse. Keine Änderung an Public-Allowlist, Producer, Gerät oder Intensität. Keine realen Geräte/Profile, API oder Liveaktionen; kein Commit/Push.

## Folgeauftrag: ZappieHell Public-Overlay-/Animation-Audit

Stand: 2026-10-07. Originales öffentlich erlaubtes HTML plus synthetischer Socket-/Timer-Fixture; keine Server-, Netzwerk-, OBS-, Audio-, Geräte- oder Liveaktion.

- **Producer → Public Socket:** `ZappieHellManager._executeOverlayStep()` emittiert `{animationType, duration, data: step.data}` ohne Projektion. `main.js` reicht den Wert im `overlay:animate`-Listener unverändert an `io.emit('zappiehell:overlay:animate', data)` weiter. Public-Registry erlaubt genau den Rendererpfad `/openshock/zappiehell/overlay` und das ausgehende Animationsevent; `PublicOverlayAdapter` filtert bei erlaubten Eventnamen nur Eventrouting/Roomausschluss, keine Socket-Payloadfelder. Die HTTP-JSON-Redaktion gilt nicht für dieses Socketevent. Folglich können beliebige in `step.data` enthaltene IDs, Settings oder Rohdaten mit dem öffentlichen Socketpayload ausgeliefert werden.
- **Originaler Consumer:** `zappiehell-overlay.html` benutzt vom Animationsobjekt nur `duration`; `animationType` und `data` werden nicht gerendert. Zuvor wurde das komplette Objekt in `console.log` ausgegeben. Die Rendereränderung protokolliert nur ein konstantes Ereignislabel, ignoriert Typ-/Datenstrings und akzeptiert für sichtbaren Flash nur eine endliche numerische Dauer von 100 bis 10.000 ms (UI-Eingabebereich); fehlende Dauer behält 500-ms-Default. Nichtnumerische, negative, zu kleine, riesige oder nicht endliche Werte werden verworfen.
- **Zeichenketten/Markup:** Goal-Namen laufen durch `escapeHtml()` vor der `innerHTML`-Karte; synthetisches `<img>` bleibt Text statt DOM-Element. Goal- und Animationspayloads werden nicht mehr roh protokolliert. Das entfernt keine Werte aus dem Socket-Transport und verhindert nicht, dass sie einem öffentlichen Socketclient zugänglich sind.
- **Lifecycle:** `beforeunload` entsorgt den Socket nicht mehr. Persistiertes `pagehide` bewahrt Socket, Listener und verwaltete Renderer-Timer; persistiertes `pageshow` verbindet den vorhandenen Socket bei Bedarf wieder. Finales nichtpersistiertes `pagehide` entfernt Listener, Timer und Socket genau einmal; gespeicherte Callbackreferenzen wirken danach nicht mehr. Auch Card-/Particle-/Flash-Timer sind im finalen Cleanup erfasst.
- **Konkrete Produceroption / offene Entscheidung:** Weil der originale Renderer nur `duration` benötigt und die Quellrecherche keinen zweiten Consumer von `zappiehell:overlay:animate` fand, könnte `main.js` am Public-Relay auf `{duration: <validierte Dauer>}` projizieren. Damit blieben Manager-/Chainwerte intern, aber externe Socketconsumer, die `animationType` oder `data` erwarten, würden einen bisher ausgelieferten Wert verlieren. Bis zur CEO-Entscheidung wurde der Producer/Public-Vertrag nicht geändert; dies ist die verbleibende Datenschutzlücke.
- **Geänderte Dateien:** `app/plugins/openshock/overlay/zappiehell-overlay.html`, `app/plugins/openshock/test/zappiehell-overlay.test.js`, `app/plugins/openshock/test/zappiehell-manager.test.js` und dieser Bericht. `public-overlay-registry.js` blieb unverändert; der bestehende Public-Contract wird nur in den Fixturetests abgefragt.
- **Tests:** Gebündelter Node/Jest mit `--runInBand --no-cache --detectOpenHandles`, ohne `--forceExit`: `zappiehell-overlay.test.js`, `zappiehell-manager.test.js`, `public-overlay-security-matrix.test.js` bestanden (3 Suites / 172 Tests, Exit 0). Zusätzlich gezielter server-to-overlay-Quellscan bestanden (1 Test, Exit 0). Der komplette `public-overlay-socket-events.test.js`-Lauf hatte 1 Fehler / 193 Pass: fremde parallele Änderung `app/plugins/goals/overlay/overlay.js` emittiert `goals:unsubscribe`, die ebenfalls fremd geänderte Registry führt das Event nicht; die gezielte ZappieHell-Consumerseite bestand. Diese Goals-/Registryänderungen wurden nicht bearbeitet.
- **Behoben und geprüft:** sichere Flashdauer, keine Rohpayload-Logs oder Markupinjektion, BFCache-Wiederaufnahme und finales idempotentes Cleanup sind gegen Original-HTML plus Fake-Socket/isolierte Timer regressionsgesichert. Die managerseitige Fixture beweist synthetisch, dass `data` aktuell unverändert weitergegeben wird und keine Queue-/Device-/Patternmethode aufgerufen wird.
- **Teilweise geprüft / Risiken:** Renderer ist gehärtet; Payloadprivatsphäre am öffentlichen Producer bleibt ungelöst und wartet auf Entscheidung zur engen Relayprojektion. Kein echter Browser-BFCache, Netzwerk, Socketserver, OBS, Audio oder Hardware geprüft.
- **Nicht geprüft:** externe, nicht im Repository sichtbare Clients des bisher erlaubten Animationevents. Kein Public-Allowlist-Ausbau, Produceränderung, Geräte-/Intensitätsänderung, Commit oder Push.

## Folgeauftrag: ZappieHell Public-Relay-Payload begrenzen

Stand: 2026-10-07. Die zuvor vorgeschlagene enge Projektion wurde vom CEO freigegeben; nur der öffentliche Socketrelay ändert seinen Payload.

- **Umsetzung:** `main.js` leitet das Managerereignis nun über `_broadcastZappieHellOverlayAnimation()` weiter. Das Relay akzeptiert nur Objektpayloads und eine endliche numerische Dauer im bestehenden UI-Bereich 100–10.000 ms; fehlende/null Dauer behält das bisherige Renderer-Default 500 ms. Ungültige Dauern verwerfen das Event. Das öffentliche Event enthält ausschließlich `{duration}`; `animationType` und `step.data` (IDs, Settings, sonstige Rohdaten) bleiben am Public-Relay zurück. Der Manager-/Chain-/Gerätevertrag ist unverändert. Public-Allowlist ebenfalls unverändert.
- **E2E-Fixture:** Ein echter `ZappieHellManager` emittiert nur synthetische Stepdaten an eine Fake-relay-Verbindung eines Pluginobjekts; der Socketadapter ist ein Mock. Es wird geprüft, dass nur die erlaubte Eventform mit `{duration}` ausgegeben und diese Form vom Originalrenderer als Flashtimer verarbeitet wird. Zusätzlich beweisen invalide Werte keine Relayemission. Keine Plugininitialisierung, kein Queue-/Pattern-/Gerätepfad und kein Server.
- **Änderungen:** `app/plugins/openshock/main.js`, `app/plugins/openshock/test/zappiehell-overlay.test.js` und dieser Bericht. ZappieHell-HTML/Manager sowie Public-Registry werden nicht weiter geändert.
- **Prüfung:** Gebündelter Node/Jest, `--runInBand --no-cache --detectOpenHandles`, ohne `--forceExit`: `plugins/openshock/test/zappiehell-overlay.test.js`, `plugins/openshock/test/zappiehell-manager.test.js`, `plugins/openshock/test/event-contracts.test.js`, `test/public-overlay-security-matrix.test.js`: 4 Suites / 184 Tests bestanden, Exit 0, natürliche Beendigung. Der in der vorherigen Runde bestätigte Quellscan testet `zappiehell:overlay:animate` weiterhin gegen dieselbe unveränderte Allowlist. `git diff --check` für die eigenen Änderungen bestanden.
- **CEO-Nachprüfpfad für vorherige 172/172-Stufe:** aus `app/`: `..\runtime\node\node.exe ..\app\node_modules\jest\bin\jest.js --runInBand --no-cache --detectOpenHandles --runTestsByPath plugins/openshock/test/zappiehell-overlay.test.js plugins/openshock/test/zappiehell-manager.test.js test/public-overlay-security-matrix.test.js` (Exit 0; 3 Suites / 172 Tests zu diesem damaligen Stand).
- **Socket-Scan-Fehler, separat:** Der parallele `public-overlay-socket-events.test.js`-Gesamtscan meldete `goals:unsubscribe` als nicht öffentlich registriertes Overlay→Serverevent. Die aktuelle Goals-Overlayänderung emittiert das Event beim Cleanup. Der serverseitige `server.js`-Handler macht ausschließlich `socket.leave('goals')`; der separate Goals-Pluginhandler macht ausschließlich `socket.leave('goal:${goalId}')`. Das ist ein Room-Leave-/Cleanupvertrag, keine Rollen-/Geräte-/Datenmutation. `INCOMING_SOCKET_EVENTS` führt `goals:subscribe`, aber absichtlich/aktuell nicht `goals:unsubscribe`; weder Registryerweiterung noch Testausnahme vorgenommen. Der gezielte server→overlay-Scan bestand; der Gesamtscan bleibt wegen dieser fremden parallelen Änderungen rot.
- **Status/Risiken:** Der öffentliche Animationpayload im Repositoryvertrag ist jetzt minimiert. Das Event bleibt auf derselben bereits allowlisteten Route/Eventregistrierung. Kein echter Publicsocket, externer Client, Browser, Audio, OBS, Netzwerk oder Gerät geprüft; keine Commits/Pushes.

## Folgeauftrag: übrige OpenShock-Public-Eventverträge inventarisiert

Stand: 2026-10-07. Read-only-Quellinventar nach dem Relayfix; keine weiteren Event- oder Registryänderungen.

- **Public incoming:** In der Registry ist nur `zappiehell:request:state` aus dem OpenShock/ZappieHell-Namensraum eingetragen. Der Pluginhandler liest `getActiveGoals()` und antwortet mit `zappiehell:goals:state`; keine Gerät-/Queue-/OpenShock-Action.
- **Public outgoing:** `zappiehell:goals:state`, `zappiehell:goals:update`, `zappiehell:goals:completed`, `zappiehell:audio:play` und `zappiehell:overlay:animate` sind eingetragen. `audio:play` sendet managerseitig `{audioId,text,voice}`; Renderer spricht `text` mit optionaler `voice`, `audioId` wird nicht genutzt. State/update enthalten Goal-Objekte mit `{id,name,targetCoins,currentCoins,type,active,chainId}` (Update zusätzlich `coinsAdded`); Completion enthält das volle Goal. Renderer benötigt Goal-id als Kartenidentität, Name, Coins und Typ; `chainId` wird nicht angezeigt. Diese Socketpayloads haben keine JSON-Redaktionsschicht. Sie sind für die freigegebene ZappieHell-Overlayoberfläche erreichbar; Goalfelder/Audioinhalte bleiben öffentlich sichtbar bzw. lesbar.
- **Nicht öffentlich freigegeben:** Kein `openshock:*`-Event ist im Registry-Namensfilter enthalten. Dazu gehören Status inkl. `hasApiKey`/Provider, Geräteupdate mit IDs, Command-Payloads mit User-/Device-IDs, Queue-Snapshots, Emergency Stop und Stats. `zappiehell:chains:update` ist ebenfalls nicht allowlisted. Diese Quellereignisse werden daher nicht für den Quick-Tunnel-Raum freigegeben. Keine Registry erweitert.
- **Contractwechsel:** Nur `zappiehell:overlay:animate` wurde beim Relay auf `{duration}` projiziert. Goal- und Audioevents wurden in dieser read-only Runde nicht verändert; weitere feldarme Projektionen wären ein separater API-Vertragsauftrag.
- **`goals:unsubscribe` Scannerdiagnose:** Vom parallel geänderten `app/plugins/goals/overlay/overlay.js` ausgelöst. Der aktuelle Handler in `server.js` verlässt nur den `goals`-Room; der Goals-Pluginhandler verlässt nur `goal:${goalId}`. Die Registry hat `goals:subscribe`, aber kein `goals:unsubscribe`. Keine Freigabe und kein Testausschluss vorgenommen.
- **Nachprüfung:** CEO kann die vorherige 172-Test-Stufe aus `app/` mit genau diesen drei Pfaden nachstellen: `plugins/openshock/test/zappiehell-overlay.test.js`, `plugins/openshock/test/zappiehell-manager.test.js`, `test/public-overlay-security-matrix.test.js`. Aktuelle Erweiterung inklusive `event-contracts.test.js`: 4 Suites / 184 Tests, Exit 0, `--detectOpenHandles`, natürliches Ende. `public-overlay-socket-events.test.js` server-to-overlay-Scan gezielt bestanden; der gesamte Socket-Quellscan bleibt wegen des getrennten `goals:unsubscribe`-Falles rot.

## Folgeauftrag: ZappieHell Public-Goal-/Audio-Projektion

Stand: 2026-10-07. Public-Vertrag eng auf Felder begrenzt, die der vorhandene ZappieHell-Overlayrenderer tatsächlich liest. Manager-/PluginAPI-Vertrag für lokale Clients bleibt vollständig.

- **Verifiziert:** Lokale Openshock-UI nutzt bei `zappiehell:goals:update` zusätzlich `chainId` zur Chainanzeige und interne Goal-ID für Adminaktionen. Originaler öffentlicher Renderer nutzt Goal `id` nur als DOM-Kartenidentität sowie `name`, `targetCoins`, `currentCoins`, `type` und `active`; Completion nutzt nur dieselbe Karten-ID. Audio-Renderer nutzt nur `text` und optional `voice`; `audioId` wird ignoriert. Daher dürfen `chainId`, `coinsAdded`, unbekannte Metadaten und `audioId` am öffentlichen Relay entfallen, während lokale Events unverändert bleiben.
- **Umsetzung:** Neue reine Projektionsfunktion für Goals state/update/completed und Audio. Öffentlicher Quick-Tunnelraum erhält eine feldarme Projektion; normale lokale Broadcasts erhalten das volle Originalpaket. Der direkte public `socket.emit`-Pfad für State wird ebenfalls projiziert. Bekannte Events mit fehlerhaftem Schema werden dem öffentlichen Raum vorenthalten. Ack-Broadcasts dieser Events werden derzeit fail-closed an lokale Sockets begrenzt, da im Repository kein Ack-Consumer für diese Events gefunden wurde und keine getrennte Ack-Semantik existiert. Keine Änderung an Manager, Registry, öffentlicher Route oder Rollen-/Auth-System.
- **Offene Datenschutzentscheidung:** Die öffentliche Projektion enthält weiterhin `goal.id`, weil Renderer-Updates und Completion damit dieselbe Karte finden. Dies ist die aktuelle interne Goal-ID und nicht als endgültige öffentliche Lösung freigegeben. Konkrete Option: pro Lauf zufällige, opaque Displaytokens aus UUIDs in einer In-Memory-Zuordnung erzeugen und in state/update/completed gleich verwenden; Token beim Löschen des Ziels verwerfen, nach Prozessneustart rotieren lassen. Das Token dient ausschließlich der DOM-Korrelation, nicht als Authentisierung. Dafür müssten Projektion und Renderer gemeinsam auf ein `displayToken`-Feld umgestellt werden. Bis zur CEO-Entscheidung bleibt der Goal-ID-Schutz teilweise offen.
- **Tests:** Bundled Node 22.14.0/Jest, `--runInBand --no-cache --detectOpenHandles`, 4 Suites / 54 Tests PASS, natürlicher Exit 0: ZappieHell Originalrendererfixture, Projektionseinheit, Public Socketadapter und Public Socketzugriff. Synthetische Fixtures; kein Audio wurde abgespielt. Erster Fehlaufruf ohne App-Jestkonfiguration scheiterte am jsdom-ESM-Import; der korrekte Konfigurationslauf bestand vollständig.
- **Dateien:** `app/modules/public-overlay-payload-projection.js`, `app/modules/public-overlay-socket-adapter.js`, `app/modules/public-overlay-access.js`, `app/test/public-overlay-payload-projection.test.js`, `app/test/public-overlay-socket-adapter.test.js`, `app/test/public-overlay-access.test.js`, `app/plugins/openshock/test/zappiehell-overlay.test.js`, dieser Bericht. Keine Änderung an `main.js`, `Bugstofix.md`, Public-Registry oder Goals-Renderer.
- **Nicht geprüft / Risiken:** Kein Socketserver, Quick Tunnel, Browser-Capture, OBS, Audioausgabe, OpenShock-Gerät oder Livebetrieb. Unbekannte externe Ack-Consumer existieren außerhalb des Repositorys möglicherweise; sie bekommen diese Public Events jetzt nicht über Ack-Broadcast. Token-Umstellung und CEO-Abnahme offen. Kein Commit/Push.
- **Getrennte Scanner-/Minecraft-Hinweise für CEO:** `goals:unsubscribe` bleibt ausschließlich Server-Leave-Room-Vertrag; keine Registryfreigabe oder Testausnahme ergänzt. Die parallele Minecraft-Matrixnotiz bleibt beim CEO: tatsächliches Payload `{action,params,username,timestamp}`, username aus `uniqueId` statt öffentlichem Anzeigenamen, Route/Event im Quick Tunnel abgewiesen, nur lokale synthetische Fixture; kein Matrixnenner-/OBS-Update.

## Folgeauftrag: Public-ZappieHell-Goal-Displaytoken

Stand: 2026-10-07. Umsetzung nach CEO-Freigabe; keine Prozessstarts, Audioausgabe, Geräteaktion oder Änderung am Manager-/Adminvertrag.

- **Tokenvertrag:** Gemeinsame Public-Projektion erzeugt pro Goal eine zufällige UUID im Arbeitsspeicher. Die UUID ist nur eine DOM-Korrelationskennung, wird nicht aus der internen Goal-ID abgeleitet oder persistiert und nach Prozessneustart neu erzeugt. State, Update, Completion, direkte initiale Socketantwort und Adapterbroadcast verwenden dieselbe Projektionsinstanz und damit dasselbe Token. Public-Felder heißen `displayToken`; interne `id` wird vollständig ausgelassen.
- **Lebenszyklus:** Es gibt genau einen nachgewiesenen Manager-Löschpfad: `DELETE /api/openshock/zappiehell/goals/:id` in `main.js`. Erst nach erfolgreichem `deleteGoal()` vergisst die Projektion den Token, bevor die UI-Aktualisierung emittiert wird. Eine leere/unvollständige Active-State-Aufnahme löscht keine Zuordnung. Completion darf nur einen existierenden Token nachschlagen und legt nach Delete keinen neuen Eintrag an; so kann ein verspätetes Completion-Event den gelöschten Cache nicht wiederbeleben. Explizite Löschung gibt den Token frei, sodass Neu-Erstellung mit wiederverwendeter interner ID einen neuen Token erhält.
- **Renderer und lokaler Vertrag:** Öffentliche HTML-Kartenanlage, Reconciliation und Completion-Matching verwenden nun `displayToken`. Lokale UI-Adminaktionen behalten unverändert interne `goal.id`, `chainId` und vollständige Managerpayloads. Keine Authfunktion, Registryänderung oder Manageränderung.
- **Tests:** Gebündelter Node 22.14.0/Jest, `--runInBand --no-cache --detectOpenHandles`, ohne `--forceExit`: `plugins/openshock/test/zappiehell-overlay.test.js`, `plugins/openshock/test/plugin-route-safety.test.js`, `test/public-overlay-payload-projection.test.js`, `test/public-overlay-socket-adapter.test.js`, `test/public-overlay-access.test.js` — 5 Suites / 60 Tests PASS, Exit 0, natürliche Beendigung. Fixtures prüfen state/update/completed, gleiche Tokens über direkte Socketverbindungen/Adapterinstanzen, reconnect, leere Snapshots ohne Cleanup, Delete und ID-Wiederverwendung, simulierten Modulneustart, interne ID-Abwesenheit im Publicpaket, unveränderten lokalen Payload, fehlgeschlagene Löschung und verspätete Completion ohne Token-Neuanlage sowie Original-HTML-DOM-Matching.
- **Verbleibende Grenzen:** Keine realen Browser-/Socketserver-/Quick-Tunnel-/OBS-/Audio-/Hardware-/Liveprüfungen. Die Token-Map ist pro laufender Node-Instanz geteilt und explizite Goal-Deletes entfernen Einträge; unvollständige Snapshots verändern sie nicht. Unbekannte externe Consumers der früheren Publicgoal-`id`-Felder außerhalb des Repositories sind nicht erfasst; freigegebener Renderer ist gemeinsam angepasst.
- **Dateien:** `app/modules/public-overlay-payload-projection.js`, `app/plugins/openshock/main.js` (Import und alleiniger Goal-Delete-Hook; bestehender separater Animation-Relay-Hunk bleibt unverändert), `app/plugins/openshock/overlay/zappiehell-overlay.html`, Public-Access/Adapter, die drei Public-Projektionstests, `app/plugins/openshock/test/zappiehell-overlay.test.js`, `app/plugins/openshock/test/plugin-route-safety.test.js` sowie dieser Bericht. Andere breite parallele Änderungen unberührt.
- **Scannerstatus:** Der ältere Eintrag weiter oben beschreibt den damaligen roten `goals:unsubscribe`-Scan. Er ist historisch überholt: CEO bestätigte inzwischen 43/43 PASS nach Entfernung des redundanten Overlay-Unsubscribe-Emits; keine Registryfreigabe/Testausnahme. Minecraft bleibt separater CEO-Matrixhinweis, nicht Teil dieses Deltas.

## Folgeprüfung: ZappieHell-Token-Race bei Delete/Recreate

Stand: 2026-10-07. Die vorherige ID-keyed Tokenmap zeigte einen reproduzierbaren Completion-Race; die zuvor bestandenen Projektionstests deckten ihn noch nicht ab.

- **Repro und Producerbeleg:** Echter `ZappieHellManager.addCoins()` hält bei Chain-Completion die alte Goalobjektreferenz in `completedGoals` und `await`et `executeEventChain()` vor seinen Events. Während des echten Delaysteps können DELETE- und Create-Routen synchron dasselbe interne ID-Feld wiederverwenden. Nach dem await baut `goals:update` seine Goal-Liste aus dem aktuellen Manager-Map neu auf (neues Objekt), anschließend sendet `goals:completed` die vorher gespeicherte alte Objektinstanz. `getAllGoals()`/`getActiveGoals()` geben live Managerobjekte zurück; `addGoal()` speichert und returned dieselbe `fullGoal`-Instanz. PluginAPI `emit` reicht die Referenz im selben Prozess an Pluginevent bus und Socket.IO weiter.
- **Vorfix-Repro:** Reiner Modultest: altes Goal projizieren → Delete/forget → alte stale Updateinstanz projizieren → neues Objekt mit gleicher ID projizieren → späte alte Completion projizieren. Ergebnis vor Fix: `deleteRotated=true`, aber `staleRecreatesForNewGoal=true` und `lateCompletionMatchesNewGoal=true`.
- **Fix:** Projection bindet Token zusätzlich an konkrete Goalobjektidentität: `WeakMap` für Object→UUID und `WeakSet` für explizit retired Goalobjekte; aktive strong map hält nur die aktuell zugeordneten live Goals und wird auf dem bestätigten Create-/Deletepfad gepflegt. Create registriert die tatsächliche `addGoal()` Rückgabe. Delete erfasst die tatsächliche aktuelle Managerinstanz vor dem Löschen und retired sie erst nach erfolgreichem `deleteGoal()`. Projektion fail-closed für retired oder same-ID-but-not-current stale Instanzen; Completion braucht aktive identische Objektinstanz und fällt nie auf ID-only lookup zurück. Weak structures halten keine Strong references zu gelöschten Objekten; kein Tombstone-ID-Set/TTL/Pruning.
- **Regressionen:** Ein synthetischer Test lädt echten Manager und echte `addCoins()`/`executeEventChain()`-Delaysequenz mit Fake-DB und null Queue/Device-Services, ruft echte OpenShock Create/Delete-Routehooks, löscht/erstellt dieselbe ID vor Auflösen des Timers und leitet Events durch den echten Public Socket Adapter. Er belegt Update der neuen Goalinstanz und alte Completioninstanz, keine Public-Completion fürs neue Token, lokale Completion mit originaler interner ID, delete fail/recreate guards, stale same-ID updates fail-closed, sowie neuen Token für legitime neue Instanz. Kein Audio, API-Netzwerk, Server, Hardware oder Livebetrieb.
- **Prüfung:** Bundled Node 22.14.0/Jest `--runInBand --no-cache --detectOpenHandles`, ohne `--forceExit`: 6 Suites / 61 Tests PASS, natürlicher Exit 0; Pfade: `plugins/openshock/test/zappiehell-public-token-lifecycle.test.js`, `plugins/openshock/test/zappiehell-overlay.test.js`, `plugins/openshock/test/plugin-route-safety.test.js`, `test/public-overlay-payload-projection.test.js`, `test/public-overlay-socket-adapter.test.js`, `test/public-overlay-access.test.js`. Das Adapterset belegt zusätzlich unverändertes anderes registriertes Event und fail-closed Ack-Broadcast mit local ack plumbing.
- **Eigentum:** Shared projector object-lifecycle hunks, OpenShock main.js create/delete hook hunks (Animation relay bleibt separater eigener älterer Hunk), fünf vorhandene fokussierte Tests angepasst/erweitert, neue echte Manager race fixture. Keine Änderung an Weather-, Overlay-Worker-, Registry- oder fremden Goalrenderer-Hunks. Kein Commit.
## Weather HTTP-Request-Kontextgrenze

Stand: 2026-10-07. Ausschließlich synthetischer Originalmiddleware-Aufruf und read-only Pfad-/Tunnelquellprüfung; keine Änderungen an Auth, Registry oder Middleware-Verhalten.

- **Befund:** `createPublicOverlayMiddleware` klassifiziert Public ausschließlich über `req.headers.host` via `normalizeHostname()` und `*.trycloudflare.com`; forwarded-host wird ignoriert. Server installiert diese Middleware global vor übrigen JSON-/Pluginrouten. Nicht-Quick-Tunnel Host einschließlich fehlendem oder unbekanntem Host erhält `next()` und behält lokale JSON-Antwort unverändert. Public host mit nicht registriertem Pfad/Methode erhält neutrales 404 vor `res.json`-Wrapper; registered Public Weather-Host bekommt pfadgebundene Projektion vor generischem Key-Redactor. Auth-/Tunnelproducer belegt die Hostbindung: `NetworkManager.getActiveQuickTunnelHosts()` liefert seine aktuellen Quick-Tunnelhostnames; der HTTP-Middlewarekontext verwendet absichtlich den tatsächlichen Host der Anfrage und keine vom Client gelieferten Forwarded-Header.
- **Pfadvertrag:** Registry `normalizePublicPath()` entfernt Query vor Autorisierung; Query-Parameter ändern die allowlist-Entscheidung nicht. Finaler Slash bleibt ein anderer nicht registrierter Pfad. Doppelte Slash, Traversal-Segmente und kodierte NUL/Punkt/Slash/Backslash werden abgelehnt. Andere Prozentescapes wie `%77` werden normalisiert zu `w`, daher gilt `/api/%77eather/config` als derselbe kanonische Weatherpfad. Methode muss GET/HEAD sein.
- **Fixture/Prüfung:** Neue isolierte Datei `app/test/weather-public-http-context-boundary.test.js` ruft das Originalmiddleware direkt mit Fake-Req/Res ohne Listener auf. 4/4 Tests PASS mit gebündeltem Node 22.14.0/Jest `--runInBand --no-cache --detectOpenHandles`, natürlicher Exit; `node --check` beider Module und `git diff --check` der Fixture PASS. Deckt Missing/local/Quick-Tunnel/unknown Host, beide Richtungen misleading `X-Forwarded-Host`, malformed successful producer body fail-closed, Query, Slash/Alias/Traversal/encoded separator, falsche Methode und wiederholtes `res.json` im selben Requestkontext ab. Keine Server-/Tunnel-/Socket-/Audio-/OBSstarts.
- **Socketgrenze:** Direkte `socket.emit`-Projektion ist nur am public Quick-Tunnel Socket aktiviert; lokale Socketinstanz bleibt unverändert. Public projected-ack events werden weiterhin vom public Room ausgeschlossen, sodass lokaler Ackpfad erhalten bleibt. Dafür keine Verhaltensänderung und keine erneute breite 54-Testwiederholung im Grenzaudit.
- **Offene Risiken:** Beliebige ungültige Prozentescapes wie `%zz` werden durch die Registry-Pathnormalisierung decodierfehlerbedingt abgelehnt. Prozentkodierte nicht reservierte Zeichen können kanonische Aliase bilden; dies ist aktueller Vertrag und kein eigenständiger Auth-Bypass, da gleiche exakte Route/Readmethod gilt. Kein echter HTTP-Server oder Quick-Tunnel gestartet; Proxy-/Cloudflare-End-to-End-Headerbehandlung bleibt außerhalb dieser Fixture ungeprüft.
- **Stable-Checkpoint:** Geändert für diesen Folgeschritt wurde ausschließlich die neue HTTP-Context-Fixture; die Weather-Projektor- und vorherigen ZappieHell-Hunks wurden nicht verändert. Shared-module vollständige Hunk-Ownership wird vor einem möglichen scoped Zwischencommit noch mit Orchestrator/anderen Ownern abgeglichen; dieser Auftrag autorisiert keinen Commit.
## Read-only Hunk-Ownership- und Public-Profile-Checkpoint

Stand: 2026-10-07. Nur Quellen-/Diffinventar, keine Produktänderung oder Commit.

### Relevante Dirty-Dateien und Herkunft

- `app/modules/public-overlay-payload-projection.js` — neue gemeinsame Datei; ZappieHell-Block (Goal-Tokenobjectidentität, completion/update/state, Audio) stammt aus dem abgeschlossenen Race-/Public-Payload-Auftrag dieses Agents. Weather-Aktions-/Optionkonstanten und Config/Gamification/Socket-Projektoren stammen aus dem anschließend zugewiesenen Weather-Public-Privacy-Auftrag dieses Agents. Shared Datei ist funktional gemischt, aber die zwei belegten Aufträge haben denselben aktuellen Owner. Beide Consumer (OpenShock routes, Public-HTTP-/Socketadapter) müssen bei einem Zwischencommit mit aufgenommen werden.
- `app/modules/public-overlay-access.js` — gemischte Hunkownership. Vorbestehender direkter Public-`socket.emit`-Projektor und dessen `projectPublicOverlayPayload`-Import waren bereits dirty, bevor der Weather-HTTP-Auftrag begann; ursprünglichen Zappie/Public-Access-Hunkowner aus aktuellem Diff allein nicht sicher belegbar. Weather-Erweiterung von diesem Agent: Imports `projectWeatherConfigResponse`/`projectWeatherGamificationResponse`, exakter Requestpath und Quick-Tunnel-`res.json`-HTTP-Projektion. Keinen ganzen Dateihunk dem Weather-Commit zuschreiben.
- `app/modules/public-overlay-socket-adapter.js` — shared/mixed checkpoint. Diff enthält Room-Split für projizierte Events, private Payload an lokale Clients, Public-Room-Projektion und projected ack fail-closed. Das wurde im vorherigen ZappieHell-Public-Relay-Auftrag bearbeitet; ein älterer Dirty-Baseline-/Fremdowneranteil war in vorheriger CEO-Anweisung ausdrücklich als Hunk-Abgleich vorbehalten. Herkunft dieses älteren Anteils aus HEAD-Diff nicht entscheidbar; gesamtes File nicht pauschal stagebar, bis CEO/Owner den Hunkbestand bestätigt.
- `app/plugins/openshock/main.js` — gemischt. ZappieHell Create-/Delete-Goal-Token-Lifecycle-Hooks/Imports dieses Agents; separater `_broadcastZappieHellOverlayAnimation`-Producerhunk sowie Ersetzung des direkten `overlay:animate` Emits stammen aus dem vorherigen OverlayWorker-Auftrag. Ein scoped Commit, der OpenShock-Token-Producer einschließt, braucht entweder vollständigen Dateihunkcheckpoint/Ownerfreigabe für Animation oder die beiden Änderungen getrennt in Hunk-bewusstem Stage.
- `app/plugins/openshock/overlay/zappiehell-overlay.html` — komplette aktuelle BFCache-/Dispose-/displayToken-Diff ist dem OverlayWorker-Auftrag zugeordnet, nicht diesem Agent; nicht in unseren Scoped-Commit aufnehmen.
- `app/plugins/openshock/test/plugin-route-safety.test.js` — neue Token-Create/Delete/Falldeletionstests dieses Agents; vollständiger aktueller Diff ist auf den Token-Lifecycle-Auftrag bezogen.
- `app/plugins/openshock/test/zappiehell-public-token-lifecycle.test.js` — neue echte isolierte Manager-delay/delete/recreate Race-Fixture dieses Agents.
- `app/plugins/openshock/test/zappiehell-overlay.test.js` — neue Originalrenderer-/Lifecycle-Fixture dem OverlayWorker-Auftrag zugeordnet; nicht diesem Agent zuordnen.
- `app/test/public-overlay-payload-projection.test.js` — neue ZappieHell- und Weather-Projektionstestdatei aus den zwei aufeinanderfolgenden Aufträgen dieses Agents.
- `app/test/public-overlay-access.test.js` — gemischt. ZappieHell direct-socket projection test war bereits im früheren Zappie/Public-Access-Checkpoint vorhanden, sein ursprünglicher Hunkowner ist aus Dateidiff nicht belastbar; Weather änderte danach den alten generischen `/api/weather/config`-Beispielfall auf das echte Configschema, ergänzte HTTP-/lokal-Hostfälle und die Weather-Socketfixture. Diese Weather-HTTP-Tests und das neue Beispielresponse-Shape sind diesem Agent zuordenbar. Nicht gesamtes File pauschal stagen.
- `app/test/public-overlay-socket-adapter.test.js` — gemischt. Die Zappie public-room/local/Ack-Projektionsregressionen stammen aus dem vorherigen Zappie-Public-Relay-Auftrag dieses Agents; Weather-spezifische Anpassung ist nur, den generischen „unverändert“-Fixtureevent auf `webgpu-weather:trigger` zu verschieben, plus sämtliche projizierten Weathercases bleiben in der neuen projector-Testdatei. Frühere shared-adapter Eigentumsfreigabe noch CEO-seitig zu bestätigen.
- `app/test/weather-public-http-context-boundary.test.js` — neue 4-Test Fake-Req/Res-Originalmiddlewarefixture dieses Agents, einzige Produktnahe Dateiergänzung im letzten Read-only-Grenzauftrag.
- `app/modules/public-overlay-registry.js` — fremd/mixed und von diesem Agent nie geändert. Der aktuelle Diff fügt zahlreiche Entrypoints, HTTP-Pfade und Socketevents verschiedener Overlay-/Locale-/Sidekick-/ViewerXP-/Weather-Profile hinzu; keine dieser Registryhunks in unseren Stage-Scope aufnehmen.
- `docs/coordination/permissions-events.md` und `docs/coordination/CEO_HANDOFF.md` sind selbst breit untracked/ownerübergreifend. Die Weather-/Boundary-Absätze dieses Agents sind eigene additive Textabsätze; das vollständige Dokument ist kein sauberer scoped Datei-Commit.

### Minimaler Abhängigkeitsvertrag für einen späteren Commit

Zappie Tokenprojektion benötigt `public-overlay-payload-projection.js`, die Create-/Delete-Hooks in OpenShock und die passende Race-/Routefixture. Die Public-Room-Trennung benötigt `public-overlay-socket-adapter.js` sowie Adaptertests und Accesspfad; diese shared Adapter hunks bleiben bis Ownerfreigabe offen. Weather-HTTP benötigt Access-Middleware + Weatherblöcke im Projektor + passende HTTP-/Projektortests. Weather-Socket nutzt dieselbe Projektor-/Adapteroberfläche und verlangt Adaptervertrag, ohne Registryänderung. Boundaryfixture ist unabhängig nur dann stagebar, wenn sein Referenzmodul im Stagezustand enthalten ist; sie ist reine Testsuite und wird nicht isoliert committed.

### Präzisierung zum fehlenden Host

Der Fixture-Testtitel „denies missing Host“ meint den malformed Producerfall, nicht eine Denialantwort für Hostmangel: direkt aufgerufen erhält Request ohne `headers.host`, literal `Host: undefined` und unbekannter Host jeweils `next()`, Status 200 und unveränderte Testantwort inklusive künstlichem Rohfeld. Nur Quick-Tunnel-Host gelangt in den Publicprojektor. Das ist kein bestätigter öffentlicher Bypass, denn Testfake beweist nicht, dass ein realer Quick-Tunnel-Request mit verändertem Upstream-Host die Tunnel-/Proxykante erreicht; echte HTTP-/Tunnelend-to-end-Prüfung war ausdrücklich ausgeschlossen. Damit ist die Grenze genauer als „fehlender Host wird verweigert“ formuliert.

### Neuer unbehandelter Public-Payloadverdacht (nur Quellenbefund)

`app/modules/public-overlay-registry.js` erlaubt `toptier:update` für öffentliche Socketclients. `TopTier SessionManager.startNewSession()` erzeugt/persistiert ein zufälliges UUID `sessionId`; `_emitEmptyBoards()` und `ScoreEngine._emitUpdate()` senden es im registrierten `toptier:update`-Payload mit. Der Originalrenderer `app/plugins/toptier/assets/overlay.js` prüft `board/entries` und rendert; keine Stelle dieses Renderers liest `data.sessionId` (Source-Suche ohne Treffer). Die bisherige OBS-TopTier-Fixture und `docs/coordination/obs-toptier-fixtures.md` bestätigen das Payloadfeld, aber kein Privacy-Redacting. Kandidat für den nächsten Auftrag: öffentlich unnötige interne Sitzungs-UUID auf `toptier:update`-Wire-Payload – wahrscheinlich kann Publicprojektion nur `{board,entries,active?}` führen, lokale UI/Adminpayloads unverändert. Nicht umgesetzt und keine Behauptung über Geheimnis/Auth-Token; zuerst Orchestratorentscheidung und Renderer-/Producer-Abgleich. Andere TopTier Eventfelder `username/nickname/score` sind sichtbare Leaderboardanzeige.

## TopTier Public-Session-UUID-Abgrenzung und Schnorrbecher-Payload-Inventar

Stand: 2026-10-07. CEO-Auftrag: die nicht gerenderte TopTier-Sitzungskennung öffentlich entfernen, Producer-/Local-Vertrag mit Fixtures prüfen, danach coinJar-Payloads und Overlay-Lifecycle read-only inventarisieren. Keine Registry-, TopTier-Producer-, Schnorrbecher-Main-, ScoreEngine-, Physics- oder Adapteränderung.

### TopTier: Befund und Umsetzung

- `app/plugins/toptier/backend/session-manager.js` erzeugt `sessionId` als UUID und persistiert sie lokal; `app/plugins/toptier/main.js` sendet sie bei `toptier:get-board` als `toptier:update`; `app/plugins/toptier/backend/score-engine.js` sendet sie bei `_emitUpdate()` und leeren Boards ebenfalls mit.
- Der Renderer validiert/rendered nur `board`, `entries` sowie darin `username`, `nickname`, `profile_picture_url`, `score` und `rank`. `sessionId` und `active` werden nicht gelesen. Vorher wurde das Event auf dem öffentlichen Socketpfad unverändert durchgelassen.
- Die bereits vorhandene Public-Projektionsgrenze in `public-overlay-payload-projection.js` projiziert `toptier:update` jetzt auf `{board, entries}` mit genau den validierten Rendererfeldern. Ungültige Payloads werden öffentlich zurückgehalten. Der Adapter erhält weiter die Originalpayload für lokale Clients. Direkte öffentliche Socketantworten verwenden dieselbe Projektion. TopTier-Producer und Registry wurden nicht geändert.
- Regression `app/test/toptier-public-session-boundary.test.js` ruft den tatsächlichen `toptier:get-board`-Socketproducer auf, vergleicht lokalen Socket mit Quick-Tunnel-Host und belegt: lokale Antwort behält Session-ID und Rohzeileninhalt; öffentliche Antwort enthält nur Rendererfelder. Adapterfixture prüft denselben Split für Outgoing Updates. Projektortest deckt Likes/Gifts, leere Boards, ungültige Boards/Einträge und Session-Metadaten ab.

### Schnorrbecher: Read-only-Feldfluss und Grenzen

- Registry erlaubt eingehend nur `coinJar.sync.request` für diesen Pluginbereich; ausgehend erlaubt sie `coinJar.add`, `coinJar.config`, `coinJar.reset`, `coinJar.sync`. Keine öffentliche HTTP-Freigabe für `/api/coin-jar/*` gefunden. `coinJar.add`/`reset` sind nicht als eingehende öffentliche Events gelistet.
- `CoinJarEngine.normalizeGiftEvent()` kopiert nicht beliebige Originaleventfelder: es formt eine normalisierte Liste aus `eventId`, `comboId`, `senderId`, `senderName`, `senderAvatar`, `giftId`, `giftName`, `giftImage`, Wert, Serienzahl/-ende und `timestamp`. `_complete()` spreadet diese normalisierte Liste in `coinJar.add`; damit gehen insbesondere TikTok-Nutzerkennung (`senderId`), Event-/Combo-IDs, Avatar-URL und Zeitstempel dennoch bis zum öffentlichen Relay, obwohl diese IDs im CoinCup-Renderer nicht als sichtbare Darstellung verbraucht werden. `senderName`, Geschenkname/-bild, Summe und Spawnzahl werden hingegen für Popup/Visualisierung gebraucht.
- `coinJar.sync` enthält den gespeicherten `sessionId` (bei Streamreset aus `streamIdentity`/Room-ID), Summen, Visualanzahl, `recentGifts` (Geschenk-ID/-Name/-Bild), `updatedAt` und `generation`; `_syncPayload()` hängt die gesamte Config und `livestreamStatus` an. Renderer liest Sync-Konfig, Werte, Generation und Geschenkmetadaten. Ein bekanntes Standardconfig enthält keine Credentials, aber `normalizeConfig()` spreadet `input` und bewahrt unbekannte Settingskeys; daher kann Configweitergabe zusätzliche gespeicherte Schlüssel enthalten. `coinJar.config` sendet ebenfalls das ganze Configobjekt.
- `coinJar.reset` sendet `reason` und `generation`; Renderer nutzt Generation, nicht den Grund. Plugin sendet Sync beim Verbindungsaufbau und auf `coinJar.sync.request`; Adapter/PublicSocket-Projektion behandelt coinJar-Events derzeit nicht speziell, also gehen erlaubte Outgoing-Payloads im öffentlichen Pfad unverändert durch.
- Overlay-Consumer: `coincup.js` fordert Sync bei Connect an, bindet add/reset/config an `applySync`/`enqueueSpawn`/`clear`/`applyConfig`. Das Arbeitsbaumdiff in `overlay/coincup.js` implementiert bereits idempotentes `destroy()`, räumt Resize-/Pagehide-, Socket- und Matter-Handler ab, trennt nur selbst erzeugte Sockets, stoppt Runner/Engine und verhindert späte Counter-/Telemetryarbeit. Attribution dieses parallelen Lifecycle-Hunks wird nicht beansprucht und nichts daran geändert.
- Kein Schnorrbecher-Publicprojector oder Producer-/Registryfix im Rahmen dieses Inventars, da CEO den konkreten Projektionsentscheid für coinJar explizit ausstehen ließ. Entscheidung benötigt: welche Felder für Public-Overlaygerenderung erhalten bleiben (mindestens sichtbarer Name/Giftbild, Summen/Counter und Generation; optional Geschenkmetadaten im Reconnectsnapshot) und ob `senderName` öffentlich bewusst freigegeben werden soll.

### Dateien, Prüfungen, Risiken

- Produktnahe Änderung: `app/modules/public-overlay-payload-projection.js` TopTierprojektion. Tests: `app/test/public-overlay-payload-projection.test.js`, `app/test/public-overlay-socket-adapter.test.js` (nur angefügter TopTierfall), neue `app/test/toptier-public-session-boundary.test.js`; Wetterfixturetitel in `app/test/weather-public-http-context-boundary.test.js` präzisiert von „denies“ auf „keeps … outside public context“.
- Gezielt geprüft mit Node v24.16.0/Jest: 6 Suites / 52 Tests PASS (`public-overlay-payload-projection`, `public-overlay-socket-adapter`, `toptier-public-session-boundary`, `weather-public-http-context-boundary`, Schnorrbecher `plugin-integration`, `coin-jar-engine`). Exit 0. Jest druckt drei Haste-Name-Kollisionswarnungen aus `naked/` und `docs_archive/`, trotz erfolgreicher Suites.
- `plugins/schnorrbecher/test/obs-renderer-offline.test.js` nicht geprüft: Jest/Node 24 scheitert beim Laden installierten `jsdom`-Transitivmoduls `@exodus/bytes/encoding-lite.js` (`export` unter CommonJS-Jest). Kein CoinJar-Testassertionslauf für Offline-Lifecycle, und kein UI-/OBS-/Browser-/Quick-Tunnel-/Server-/Livebetrieb.
- `git diff --check` für die eigenen geänderten Pfade war sauber. Keine echten Events, Zuschauer, Guthaben, Rollen, Hardware oder Liveaktionen. Kein Commit, Push oder Veröffentlichung.
- Verbleibendes Risiko: coinJar-IDs und unbekannte persistierte Configkeys können über erlaubte Public-Outgoing Events sichtbar sein. Nicht quantifiziert, ob `streamIdentity` tatsächlich eine TikTok room-ID statt einer pseudonymen Kennung ist; Sourcepfad akzeptiert beide Formen.
- Offen: CEO-Entscheidung zum coinJar Publicprojektionsvertrag; falls Umsetzung beauftragt wird, nur im vorhandenen Publicprojektor + isolierten Direct-Socket-/Adapter-/Rendererfixtures, keine Producer-/Registry-/Giftphysikänderungen ohne separaten Optionsentscheid.

## Aktueller checkpoint: TopTier-/CoinJar-Publicprojektor und nächste Quelleninventur

Stand: 2026-10-07. Dieser Abschnitt ist maßgeblich für den TopTier-/CoinJar-Projektionsstand; ältere Einträge im selben Dokument beschreiben frühere Zwischenstände.

### Endstand TopTier und Schnorrbecher

- TopTier: `toptier:update` wird nur für den Publicpfad auf `{board,entries}` plus Rendererfelder projiziert. Der echte `toptier:get-board`-Handler behält lokal die vollständige Antwort samt `sessionId`; die öffentliche Socketantwort lässt Session-ID und nicht gerenderte Entryfelder weg. Kein TopTier Producer-/Registry-/ScoreEngine-Hunk.
- CoinJar: Public `add` enthält nur `generation,totalValue,visualCoins,totalCoinValue,giftName,giftImage,senderName`; mangels erhaltener Nickname-vs-Username-Provenienz wird `senderName` zu neutralem `Viewer`. `sync` enthält `generation,totalCoinValue,visualCoinCount,recentGifts[{giftName,giftImage}],config`; `reset` nur `generation`; `config` nur die streng begrenzten Einstellungen des CoinCup-Renderers. Session-/Room-ID, Event-/Combo-/User-/Gift-IDs, Zeitstempel, Status/Reason, Debug, Persistenz- und unbekannte Settingskeys bleiben privat. `generation` ist ein validierter flüchtiger Sequenzzähler; ein separater Epochtoken ist ohne Replay-Repro unnötig.
- Original-Producer, CoinCup-Renderer, Plugin-Main, Engine, Physics und Registry blieben unverändert. Lokale Handler/Antworten behalten den Originalvertrag.

### Exakte Node-22-Prüfung

Runtime: `app/../runtime/node/node.exe` v22.14.0, Jest aus `app/`, Exitcode 0.

Fokussierter Owner-Scope-Lauf: **3 Suites / 28 Tests PASS**.

```powershell
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath plugins/schnorrbecher/test/public-projection-renderer-contract.test.js test/public-overlay-payload-projection.test.js test/public-overlay-socket-adapter.test.js
```

Gezielter Abschlusslauf: **10 Suites / 88 Tests PASS**.

```powershell
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --no-cache --runTestsByPath test/public-overlay-payload-projection.test.js test/public-overlay-socket-adapter.test.js test/toptier-public-session-boundary.test.js test/weather-public-http-context-boundary.test.js plugins/toptier/test/obs-toptier-fixtures.test.js plugins/schnorrbecher/test/plugin-integration.test.js plugins/schnorrbecher/test/coin-jar-engine.test.js plugins/schnorrbecher/test/overlay-controller.test.js plugins/schnorrbecher/test/obs-renderer-offline.test.js plugins/schnorrbecher/test/public-projection-renderer-contract.test.js
```

Ergänzend bestätigte der Orchestrator 3 fokussierte Suites / 28 Tests PASS unter Node 22. Frühere Node-24-/Zwischenlaufdiagnosen sind überholt; sie sind kein aktueller Dependency- oder Produktblocker.

### Own-/Mixed-Dateizuordnung

- Eigene neue/eng bearbeitete Fixturepfade: `app/test/toptier-public-session-boundary.test.js`, `app/test/weather-public-http-context-boundary.test.js`, `app/plugins/schnorrbecher/test/public-projection-renderer-contract.test.js`; die neuen Projektorblöcke in `app/test/public-overlay-payload-projection.test.js`.
- `app/test/public-overlay-socket-adapter.test.js` ist Mixed: die neuen TopTier-/CoinJar-Adapterfälle sind diesem Auftrag zugeordnet, die übrigen bestehenden Zappie-/Weather-Fälle haben ihre frühere Attribution und werden nicht pauschal als neuer Hunk beansprucht.
- `app/modules/public-overlay-payload-projection.js` ist von diesem Agent gepflegter gemeinsamer Projektor mit früheren Zappie-/Weather-Blöcken plus TopTier-/CoinJar-Erweiterungen; vollständige Datei nicht als einzelner isolierter Featurehunk behandeln.
- `docs/coordination/permissions-events.md` ist breit, untracked und enthält mehrere Profil-/Koordinationsabschnitte; unsere Berichte sind additive Absätze. `app/plugins/schnorrbecher/overlay/coincup.js` samt Offline-Lifecyclefixture ist parallele Overlayarbeit und kein eigener Produkt-/Testhunk dieses Agents. `app/modules/public-overlay-registry.js` ist parallel/mixed und von diesem Agent nicht editiert.
- `app/plugins/schnorrbecher/main.js` hat parallele Profile-/Migrationshunks; hier keine eigene Änderung. `app/test/obs-renderer-offline.test.js`-Änderungen während des Node-22-Laufs stammen vom Overlayowner; der abschließende 10-Suite-Lauf ist nach deren Stabilisierung grün.
- Keine Datei wurde pauschal gestaged; es gab keinen Commit oder Push.

## Nächste read-only Public-Quelle: Visual FX Frame WebGPU-Konfiguration

Eine einzige neue Oberfläche außerhalb der ausgeschlossenen Profile wurde gewählt: die öffentliche Visual-FX-Frame-WebGPU-Konfiguration, bestehend aus ihrem freigegebenen GET und dem freigegebenen Config-Update-Event. Es wurden keine Änderungen vorgenommen.

- **Registry:** `app/modules/public-overlay-registry.js` gibt GET/HEAD `/api/visual-fx-frame-webgpu/config` sowie den ausgehenden Event `visual-fx-frame-webgpu:config-update` frei. Es gibt für diese beiden Payloads keinen projektspezifischen Zweig in `projectPublicOverlayPayload`. Die generische HTTP-Key-Redaktion entfernt bekannte Credential-Schlüsselnamen, aber keine Felder wie `triggerRules`, `triggerCooldown`, `triggerMaxStack`, `chatColorCommands` oder `triggerPreset`; beim Socket-Event läuft der vorhandene Projektor auf `undefined` und der Adapter behält die Originalpayload.
- **HTTP-Producer:** `app/plugins/visual-fx-frame-webgpu/main.js` GET `/api/visual-fx-frame-webgpu/config` antwortet mit `{success:true, config:this.getRuntimeConfig()}`. `getRuntimeConfig()` liefert das gesamte aktive Configobjekt. Beim Laden werden neben Visualparametern auch Backend-Triggerfelder ergänzt; gespeicherte Custom-Regeln bleiben nach `normalizeTriggerRules()` mit Regel-ID, Event, Bedingungstext, Aktion, Dauer und enabled in der Runtime-Konfiguration. Bedingungstexte sind bis 200 Zeichen; Trigger-IDs bis 64 Zeichen normalisiert.
- **Socket-Producer:** derselbe Main emittiert bei Configsave/-updates `visual-fx-frame-webgpu:config-update` mit `{config:this.config}`; die Registry erlaubt es als Outgoing. Auch hier wird die vollständige Konfiguration übertragen.
- **Originalrenderer:** `renderer/overlay-controller.js` lädt genau diesen GET und gibt `payload.config` an `WebGPUVisualFxEngine`; anschließend ruft er `updateConfig(data.config)` für das Config-Update-Event auf. Die Engine verwendet visuelle Parameter (u. a. Effekt-/Style-/Quality, Größe/Frameposition, Farben, Intensität/Speed, Bloom/Pulse, DesignControls), aber liest keine Backend-`triggerRules`, `triggerCooldown`, `triggerMaxStack`, `chatColorCommands` oder `triggerPreset`. Die Regeln werden serverseitig von `evaluateTriggerRules()` konsumiert.
- **Befundgrenze:** bestätigt ist unnötige Veröffentlichung von Backend-Regel-/Automationssettings gegenüber dem öffentlichen Overlay. Im aktuellen bekannten Schema wurde kein Credentialfeld in der WebGPU-Defaultkonfiguration gefunden; dies ist keine Behauptung, dass konkrete Custom-Regeltexte Geheimnisse enthalten. Es gibt bisher keine abgeschlossene, originalrendererbasierte Privacy-Fixture für diese GET-/Socketpayloads; vorhandene Visual-FX-Notiz in `public-overlays.md` betrifft Registry-/Asset-/Eventfreigaben.
- **Option vor Änderungen:** den vorhandenen Public HTTP- und Socketprojektor auf die Renderer-Config-Allowlist begrenzen; HTTP behält `{success:true, config:<visuelle Allowlist>}`, Socket behält `{config:<visuelle Allowlist>}`. Die lokale Admin-API, gespeicherte Runtimeconfig, Producer und Renderer bleiben vollständig. Allowlist vor Umsetzung vollständig gegen tatsächliche Engine-Reads abgleichen; keine Registry-, Producer- oder Rendereränderung erforderlich.
- **Status:** Sourcebefund bestätigt; keine Änderung und kein Testlauf für diese Visual-FX-Quelle. Keine anderen neuen Publicoberflächen wurden für diese Folgeprüfung ausgewählt.

## Visual FX Frame WebGPU: Public-Configprojektion

Stand: 2026-10-07. Enger CEO-Auftrag: nur öffentliche GET-Antwort und freigegebenes Outgoing-Configevent projizieren; lokale Producer-/Admin-Config und Triggerlogik vollständig erhalten.

### Befund und Semantikabgleich

- Bestätigter vorheriger Befund: der Original-GET in `app/plugins/visual-fx-frame-webgpu/main.js` liefert `getRuntimeConfig()` vollständig; derselbe Producer emittiert `{config:this.config}`. Runtimeconfig enthält neben Visualwerten Backendfelder wie `triggersEnabled`, `triggerRules`, `chatColorCommands`, `triggerCooldown`, `triggerMaxStack` und `triggerPreset`. Die lokale GET-/Emit-Semantik bleibt unverändert.
- Rendererabgleich: `renderer/overlay-controller.js` reicht das GET-Configobjekt an `WebGPUVisualFxEngine` und das Event an `updateConfig()` weiter. Engine liest Enumfelder `effectType`, `visualStyle`, `qualityMode`, `resolutionPreset`, `frameMode`, `frameStyle`, `pulsePattern`; numerische Felder `customWidth`, `customHeight`, `frameThickness`, `frameGap`, `segmentCount`, `flameSpeed`, `flameIntensity`, `flameBrightness`, `coreWhiteness`, `pulseAmount`, `pulseSpeed`, `edgeFeather`, `frameCurve`, `frameNoiseAmount`, `bloomIntensity`, `bloomThreshold`; `pulseEnabled`; Farben `flameColor`, `secondaryColor`, `backgroundTint`; `framePositions` und `designControls`. Keine Backend-Triggerregel oder -steuerung wird im Renderer gelesen.
- `lib/config-schema.js` normalisiert einige Werte auf Default bzw. Clamp; `framePositions` wird aus bis zu acht Positionen in Zahlen überführt, leere Listen werden auf Default gesetzt, und Designcontrols werden aus den fünf bekannten Stylegruppen auf Werte 0..1 gebracht. Der Publicprojektor führt keine stillschweigende Reparatur durch: fehlendes/wrong-typed/out-of-bounds Rendererfeld, ungültige Position oder ungültige Controls führen zu `null` und damit beim HTTP-Endpunkt zum bestehenden neutralen 500 `{error:'Response unavailable'}` bzw. beim Socket zum Zurückhalten. Unbekannte und Backendfelder werden ignoriert.

### Umsetzung und Attribution

- `app/modules/public-overlay-payload-projection.js`: eigener Visual-FX-Allowlistblock und Projektionsfall für `visual-fx-frame-webgpu:config-update`; HTTP-Projektorfunktion liefert nur `{success:true,config:<Allowlist>}`. Es werden keine IDs, Bedingungen, Presets, Regeln oder sonstige Backend-/unbekannte Felder weitergegeben.
- `app/modules/public-overlay-access.js`: eigener enger Branch ausschließlich für `/api/visual-fx-frame-webgpu/config`; alle übrigen Hosts/Routes bleiben von diesem Hunk unberührt. Shared Datei enthält vorherige Public-Overlayänderungen anderer Scopes; nur dieser Visual-FX-Branch wird beansprucht.
- `app/test/visual-fx-frame-webgpu-public-config-projection.test.js`: neue isolierte Fixtures rufen den echten Producer-GET- und Config-Update-Handler mit in-memory API-Fakes auf; vergleichen lokale Vollantwort/-emission mit öffentlicher Projektion; prüfen malformed fail-closed; erzeugen `WebGPUVisualFxEngine` mit `canvas=null` und projizierter Config, ohne `init()`/GPU-Aufruf.
- Producer/Main, Renderer/Engine, Registry, Write-API, TikTokadapter, öffentliche Overlayregistrierung und bestehende lokale Persistenz wurden nicht geändert. Kein Socket-/HTTP-Request zu einem echten Server, keine GPU-/Canvas-/Audio-/Geräteinitialisierung, keine Zuschauer-, Guthaben-, Rollen- oder Liveaktion.

### Geprüft

Node v22.14.0, Jest lokal aus `app/`, Exitcode **0**: 5 Suites / 70 Tests PASS. Enthalten: neue Visual-FX-Projektion, originale Visual-FX-Backendtests, Public-Overlay-Access, gemeinsamer Payloadprojektor und Socketadapter.

```powershell
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand --runTestsByPath test/visual-fx-frame-webgpu-public-config-projection.test.js test/visual-fx-frame-webgpu-backend.test.js test/public-overlay-access.test.js test/public-overlay-payload-projection.test.js test/public-overlay-socket-adapter.test.js
```

`git diff --check` für `app/modules/public-overlay-access.js`, `app/modules/public-overlay-payload-projection.js` und `app/test/visual-fx-frame-webgpu-public-config-projection.test.js`: Exitcode **0**. Geänderte Dateien dieses Auftrags: die drei genannten App-Dateien und dieser additive Berichtabschnitt. Andere Hunks/Änderungen der gemischten Access-/Projektordateien bleiben anderen bestehenden Scopes zugeordnet.

### Verbleibende Risiken und offene Entscheidungen

- Der HTTP-Pfad testet Originalroute plus echte Public-Middleware im Supertest-Fake; kein echter Tunnel-/Browser-End-to-Endlauf. Die Socketprüfung übt die direkte Public-Socketpolicy aus; das neue Visual-FX-Event wurde nicht zusätzlich über einen realen Socket.IO-Serverprozess/GPU-Overlay gerendert.
- Die Allowlist verlangt die vom aktuellen Runtime-Default gelieferten Rendererfelder und fail-closed; zukünftige Renderer-/Schemaänderungen müssen den Projektor gleichzeitig erweitern. `renderer` und `visualProfileVersion` sind bewusst ausgeschlossen, da die Engine `renderer` selbst auf `webgpu` festsetzt und die Profilversion nicht liest.
- Geprüft und behoben: öffentliche Runtime-Config gibt nur Rendererfelder aus; lokale Antworten und Events behalten vollständige Triggerconfig; Fehlformate werden öffentlich verweigert. Teilweise geprüft: keine produktionsnahe Tunnel-/Socket.IO-/GPU-Ausführung. Blockiert: nichts. Nicht geprüft: vollständige App-Suite, reale Browser-/Quick-Tunnel-/GPU-Ausgabe.
- Offene Entscheidungen: keine für diesen engen Auftrag. Kein Commit, Push oder Veröffentlichung.

## Visual FX Frame WebGPU: Public-Triggerprojektion und Fireworks-Allowlist-Prüfung

Stand: 2026-10-07. Folgeauftrag: nach der Configprojektion den nächsten belegten Visual-FX-Pass-through prüfen und WebGPU Fireworks anhand der aktuellen Public-Allowlist einordnen.

### Befund und Umsetzung

- `VisualFxFrameWebGPUPlugin.dispatchTrigger()` normalisiert den Producertrigger und emittiert `visual-fx-frame-webgpu:trigger`. Der Originalrenderer konsumiert `type` als Triggeraktion, `effect` zum visuellen Effektwechsel, `color` zur Flammenfarbe, `duration` für Ablauf und `amount`/`intensity`/`intensityBoost` für Pulsintensität. Er übernimmt zusätzlich jedes übrige Producerfeld per Spread in `activeTriggers`; `source`, Trigger-ID, `cooldownKey`, User-/Adminfelder sind im Renderer nicht nötig. Serverseitig bleiben `source` und `cooldownKey` für Cooldown-/Triggerlogik relevant, werden aber erst nach Serververarbeitung an den Renderer-Event emittiert. Bypassflags werden vom Producer vor dem Emit gelöscht.
- `projectVisualFxFrameWebGPUTrigger()` gibt Public genau Typ, optional bekannte Effektaktion, hexvalidierte Farbe, begrenzte Dauer und numerisch gebundene Intensitätswerte. Unbekannte Felder/Producer-IDs/Quellen werden entfernt; fehlerhafte Typen, Aktionen, Farben oder Bounds schließen Public fail-closed. Der lokale Socket erhält weiterhin die vollständige Originalpayload. Producer, Engine, Registry und Overlay wurden nicht verändert.
- Die alte Matrixzeile zu WebGPU Fireworks war unzutreffend. Aktuell registriert die Public Registry dessen Overlayentrypoint sowie GPU-/Lib-/Audioassets, aber weder `/api/webgpu-fireworks/config` noch `/api/webgpu-fireworks/status`; auch kein Eventname mit Präfix `webgpu-fireworks:` ist im Outgoing-Set. `protectPublicSocket()` verwirft nicht gelistete Ausgänge vor der Payloadprojektion. Die direkten Configantworten/-emissionen des Plugins können deshalb nicht als öffentliche Pass-throughs gezählt werden. Kein WebGPU Fireworks-Feature wurde neu freigegeben.
- Die klassische `fireworks:trigger`-Familie ist kein Public-Outgoing-Event (Runtimeabfrage `isOutgoingSocketEventAllowed()` ergibt `false`); sie bleibt lokal und ist kein Public-Pass-through-Kandidat.

### Geprüft

- Neue Regressionen in `app/test/visual-fx-frame-webgpu-public-config-projection.test.js`: typgeprüfte Trigger-Allowlist, Entfernen von source/ID/Cooldown-/Canaryfeldern, Public-vs-Local-Emit und Originalengine-Verarbeitung ohne GPU-Init; ungültige Aktion, Effekt, Dauer und Intensitätsbound werden abgewiesen.
- Node v22.14.0, fokussierter finaler Lauf: **4 Suites / 61 Tests bestanden** (`visual-fx-frame-webgpu-public-config-projection`, Visual-FX-Backend, Public-Access und gemeinsamer Payloadprojektor).
- Zusätzlich ausgeführte breite Security-Matrix: **1 Suite fehlgeschlagen**, sechs bestehende GET-Fixtures erhielten 500 statt 200 (`/api/emoji-rain/user-mappings`, `/api/gcce/hud/rotator`, vier `/api/quiz-show/*`-Routen). Die Visual-FX-spezifische Suite blieb bestanden; diese unabhängigen Matrix-Fixtureabweichungen wurden nicht geändert und verhindern eine grüne Vollmatrixaussage.
- Separater Versuch der generischen Socketadapter-Suite scheiterte an ihrem bestehenden Test `leaves a registered outgoing broadcast unchanged`: Public-Room-Policy ergänzt `__ltth_public_quick_tunnel__` im Optionsobjekt, während der Test Identität mit dem unveränderten Ursprungsobjekt erwartet. Der Visual-FX-spezifische Direct-Emit/Public-vs-Local-Test und der finale fokussierte 4-Suite-Lauf bestanden.
- Fireworks wurde ausschließlich quellenbasiert gegen Public-Registry und `protectPublicSocket()` geprüft; keine Audio-/GPU-/OBS-/Browserausführung. `git diff --check` und Abschluss-Suite wurden für diesen Nachtrag noch nicht ausgeführt.

### Status

- **Behoben und geprüft:** Visual-FX-Frame-WebGPU-Triggerpayloads werden zentral auf tatsächliche Rendererfelder beschränkt; lokale Events bleiben original. Fireworks-Matrixzeile korrigiert und aktuelle Blockierung der WebGPU-Fireworks-Config-/Socketpfade quellenbestätigt.
- **Teilweise geprüft:** fokussierte Public-/Local-Fixtures sind grün; breite Matrix enthält sechs unabhängige 500-Fixturefälle und die separate generische Socketadapter-Suite hat den oben genannten Optionsobjekt-Fixturekonflikt. Fireworks-Sperrverhalten ist statisch belegt, nicht über einen echten Tunnelserver.
- **Blockiert:** nichts in der Public-Triggerprojektion.
- **Nicht geprüft:** vollständige App-Suite, klassischer Fireworks-Triggervertrag, echter Quick-Tunnel oder GPU-/Audio-/OBS-Renderer.
- Keine Änderung an Producer, Renderer, Registry, Talking Heads, TTS, echten Konten, Daten, Guthaben, Rollen oder Liveaktionen; kein Commit/Push/Release.

## Public-Overlay HTTP-Matrix und Socketadapter: Fixture-/Room-Isolation-Nachtrag

Stand: 2026-10-07. CEO-Folgeauftrag: sechs zuvor rote Security-Matrixfälle und die Adapter-Suite auflösen, ohne Producer-/Renderer-/Registryänderungen.

- Die Matrix hatte alle Routeantworten auf einen generischen `rendererPayload()` gelegt. Tatsächliche Shapeabweichungen erzeugten 500 beim strikten Projektor: EmojiRain-Mappings erwartet `{success,mappings,stats}`; GCCE-Rotator erwartet `{success,rotator:{enabled,intervalSeconds,entries}}`; Quiz-Show Brand-Kit/HUD/State besitzen getrennte Responsecontainer und validierte Quellfelder. `createMatrixApp()` verwendet nun pro Route entsprechende Producercontract-Fixtures mit Canary-/internen Feldern; Publicantworten werden gegen ihre konkrete Allowlist geprüft und lokale Antworten behalten den vollen Producerinhalt.
- Für `/api/quiz-show/leaderboard` wurde kein passender GET-Producer gefunden. Der aktive Pluginpfad ist `/api/quiz-show/seasons/:id/leaderboard`, während die Registry-/Matrixroute `/api/quiz-show/leaderboard` allein listet. Die Matrix bildet den nicht registrierten Routeproducer als 404 ohne JSON-Payload ab; es wurde weder ein Producer erfunden noch die Registry verändert.
- Socketadapter-Verifikation: kein Produktfehler. Der bestehende Adapter klont und splittet bei projizierten Broadcasts in `restrictedOptions()` (Originalpayload nur an Local, Public-Room ausgenommen) und `publicOnlyOptions()` (projektiertes Event nur an Quick-Tunnel-Room); `rooms`/`except` werden kopiert, Fremd-Excludes bleiben erhalten. Der rote alte Test nutzte inzwischen `webgpu-weather:trigger`, ein projiziertes Event, erwartete aber noch das alte Verhalten eines einzigen unveränderten Broadcasts. Er prüft jetzt beide Calls, unveränderte lokale Payload, Public-Room-Ziel, Fremd-Excludes und Unverändertheit der Eingabeoptionen. Keine Adapterproduktdatei geändert.
- Finale Node-22.14.0-Prüfung mit `--runInBand --no-cache --detectOpenHandles`: **3 Suites / 183 Tests PASS** (`public-overlay-security-matrix`, `public-overlay-socket-adapter`, `visual-fx-frame-webgpu-public-config-projection`), Exit 0. Damit sind Matrix, Adapter und vorheriger Visual-FX-Triggerauftrag gemeinsam grün. Jest gab Haste-name-collision-Warnungen für vorhandene `naked/`-Duplikate aus; die Tests liefen erfolgreich durch.
- Geänderte Dateien dieses Nachtrags: `app/test/public-overlay-security-matrix.test.js`, `app/test/public-overlay-socket-adapter.test.js` und diese Koordinationsnotiz. Keine Registryfreigabe, kein Producer-/Renderer-/Socketadapter-Produktfix, kein GPU-/Audio-/Browser-/OBS-/VM-/Live-Start. `git diff --check` und Syntaxcheck werden abschließend zusammen mit den bisherigen Visual-FX-Dateien ausgeführt.
- **Behoben und geprüft:** die fünf existierenden Response-Fixtures entsprechen ihrer Routeform; Visual-FX-Projektion, vollständige Security-Matrix und Adaptertest sind im gemeinsamen 3-Suite-Lauf grün. Der Quiz-Leaderboardpfad wird als nicht existente Route 404 getestet.
- **Teilweise geprüft:** keine echte Express-/Socket.IO-Produktserverinstanz; Fixture-Matrix und BaseAdapter-Test double prüfen Quellverträge und Room-Zielmengen.
- **Blockiert:** nichts.
- **Nicht geprüft:** echte Tunnelclients/Quick-Tunnel oder produktive UI-/OBS-/GPU-Ausgabe.

## Public-GET-Quellinventur und Interactive-Story-Config-Allowlist

Stand: 2026-10-07. Folgeauftrag: Public-Registry-GETs mit Pluginroute und Originalconsumer vergleichen; danach die höchste konkret belegte HTTP-Payloadlücke ohne Producer-/Rendereränderung projizieren.

### Inventur: Routevertrag und verwaister Quiz-Show-Leaderboardpfad

- Statischer Quellabgleich aller **33 exakten `/api/...`-GET-Regeln** in `public-overlay-registry.js` fand mindestens eine Nichttest-Quellreferenz des jeweiligen Pfades; das ersetzt keine Prüfung jedes dynamischen Patternwertes. Zusätzlich bleiben die konkreten Matrixpfade der dynamischen CoinBattle-, GameEngine-, Quiz-Layout-, LastEvent-, Stream-Monsters- und Locale-/Assetpattern in der Public-Security-Matrix überprüft.
- Ein konkreter Handler-Mismatch: die Registry enthält exact GET `/api/quiz-show/leaderboard`; `quiz_show_overlay.js::showCurrentGameLeaderboard()` ruft diesen Pfad mit `?type=round` wirklich auf. `QuizShowPlugin.main.js` registriert **keinen** GET-Handler auf `/api/quiz-show/leaderboard`, sondern `/api/quiz-show/seasons/:id/leaderboard` (sowie getrennte Seasons-/Export-/Configpfade). Der alte Public-Pfad erreicht keinen Routeproducer und liefert in der API-Fixture 404. Daher ist die vorhandene `projectQuizShowLeaderboardResponse()` für diese exakte Registry-URL derzeit nicht mit dem realen Handler verbunden. Keine Registry- oder Consumeränderung vorgenommen.
- Minimaloption für spätere Wartungsentscheidung: die tote exakte Public-GET-Regel entfernen und das Verhalten im Registry-/Matrixtest als nicht erlaubt festhalten. Folge für den vorhandenen Consumer: der Overlaybutton für das laufende Round-Leaderboard funktioniert bereits heute nicht, weil der Backendhandler fehlt; ein Registry-Entzug behebt das nicht, sondern lässt den Quick-Tunnel zusätzlich den Request an der Boundary neutral ablehnen. Vor einer möglichen Entfernung muss der Overlayowner entscheiden, ob die Funktion auf einen belegten Backendvertrag umgestellt, entfernt oder die Route in einem getrennten, genehmigten Auftrag implementiert wird. In diesem Auftrag bleibt der Pfad unverändert und als offen markiert.

### Höchste konkrete Payloadlücke: Interactive-Story-Config

- `InteractiveStoryPlugin._registerRoutes()` GET `/api/interactive-story/config` liefert `_loadConfig()` vollständig. Producer maskiert OpenRouter/SiliconFlow/Ollama-Keywerte zu `***configured***`, aber die Antwort enthält weiterhin Providerwahl, Modelle/Basis-URLs, TTS-Engine/Modell, Voting-/Sprach-/Diagnose-/Retry-/Timingwerte und Custom-Animation-URL.
- Der originale `plugins/interactive-story/overlay.html`-Consumer liest aus dieser GET-Antwort nur `overlayOrientation`, `overlayResolution`, `overlayDisplayMode`, `overlayFontFamily`, Text-/Titelgrößen und -farben, `overlayBackgroundGradient` sowie `generatingAnimationMode`/`generatingAnimationUrl`. Custom-URL wird als `img.src` oder `video.src` gesetzt und damit ein vom Configautor bestimmter externer Fetch/Playback beim Overlayclient ausgelöst.
- Zentrale `projectInteractiveStoryConfigResponse()` plus exakter HTTP-Branch geben nur die sichtbaren Overlaystilfelder mit erlaubten Enumerationen/Bounds/Farben aus. `generatingAnimationMode` wird für Public auf `default` gesetzt und die Custom-URL entfällt; dadurch greift der bereits vorhandene Spinnerfallback. Storybilder benutzen ihren getrennten Public-Imagepfad. Runtime-Config und Local-Adminantwort bleiben unverändert.
- `app/test/interactive-story-public-config-projection.test.js` ruft den echten registrierten Plugin-GET-Handler mit synthetischer In-Memory-Konfiguration auf, vergleicht Public-Middleware- und Localantwort, prüft den Originaloverlayfeldvertrag aus der ausgelieferten HTML-Quelle und verwirft malformed Visualwerte. Die vollständige Matrix enthält jetzt denselben Responsevertrag samt Provider-/Canary-/Tracking-URL-Feldern.
- Finaler Node v22.14.0 Abschlusslauf mit `--runInBand --no-cache --detectOpenHandles`: `public-overlay-security-matrix`, `public-overlay-socket-adapter`, `visual-fx-frame-webgpu-public-config-projection`, `interactive-story-public-config-projection`, `public-overlay-access` und `public-overlay-payload-projection`: **6 Suites / 234 Tests PASS**, Exit 0. Vorhandene Jest-Haste-Kollisionen stammen aus `naked/`-Duplikaten; keine Suite scheiterte. Keine echte Browser-/Tunnel-/Video-/GPU-/Audioausführung.
- **Behoben und geprüft:** Interactive-Story-Public-Config gibt nur konsumierte Stilwerte aus; lokale Config bleibt vollständig. Public HTTP-Matrix ist grün. Fireworks-/WebGPU-Fireworks-GETs und -Events bleiben, wie in der vorherigen Runtime-Allowlistprüfung dokumentiert, nicht freigegeben.
- **Teilweise geprüft:** 33 exakte API-Regeln wurden gegen Nichttest-Quellreferenzen durchsucht; der konkrete Quiz-Handler-/Consumer-Mismatch ist bestätigt. Dynamische Pattern wurden über repräsentative Registry-/Matrixwerte statisch geprüft, nicht jede mögliche ID. Kein echter Server/Tunnel.
- **Blockiert/offene Entscheidung:** Quiz-Show-Leaderboardcontract: alter Consumer ruft die fehlende allgemeine Route; CEO/Overlayowner-Entscheidung über Entfernen des Registryeintrags versus separaten Consumer-/Producerauftrag erforderlich. Hier nicht verändert.
- **Nicht geprüft:** vollständige App-Suite, vollständige dynamische ID-Raumroute, echte Public-Overlayclients und externe Media-/Tunnelabnahme. Keine Producer-, Renderer-, Registry-, Talking-Heads- oder TTS-Produktänderung.

## ClarityHUD: Read-only-Inventar der Public-Flächen

Stand: 2026-10-07. Folgeauftrag des CEO: tatsächliche Public-Registry, Producer und Renderer-Reads inventarisieren; bestehende ClarityHUD-Produkt-/Schema-/Rendereränderungen bleiben fremd und wurden nicht editiert.

### Tatsächlich öffentlich erlaubte Flächen

- Entrypoints: `/overlay/clarity/chat`, `/overlay/clarity/full`, `/overlay/clarity/multi`, `/overlay/clarity/stream` (`app/modules/public-overlay-registry.js:13-18`). Freigegebene statische JS-Flächen sind zehn Dateien unter `plugins/clarityhud/lib/` sowie die vier `overlays/{chat,full,multi,stream}.js`-Skripte (`:108-109`); das allgemeine `/plugins/clarityhud/*`-Producerwildcard ist nicht öffentlich freigegeben.
- Read-only GETs: `/api/clarityhud/settings/{chat,full,multi,stream}`, `/api/clarityhud/state/{chat,full}` und `/api/clarityhud/multi/status` (`:110-112`). Die Producer registrieren weitere lokale API-Routen wie gesamtes Settingsobjekt, state/multi|stream, Presets/Profile, Reset, Fallbackbestätigung und Testevents; diese sind nicht in der Public-Registry. Öffentliche POSTs für ClarityHUD sind damit nicht erlaubt.
- Outgoing Socket-Events: `clarityhud.settings.{chat,full,multi,stream}`, `clarityhud.update.{chat,follow,gift,join,like,share,subscribe,treasure}` und `clarityhud:multi:{chat,gift}` (`app/modules/public-overlay-registry.js:319-332`). `clarityhud.multi.status` ist im UI-Consumer registriert, aber nicht als public outgoing Event freigegeben. Für die erlaubten ClarityHUD-Ereignisse gibt es keinen ClarityHUD-spezifischen Payloadprojektor; Public-Outgoing bleibt dadurch im bestehenden Adapterpfad Originalpayload.

### Bestätigte Restbefunde und schmale Optionen

1. **Nicht vom Overlay benötigter öffentlicher Multi-Status-GET:** Registry erlaubt `GET /api/clarityhud/multi/status` (`public-overlay-registry.js:112`); Producer gibt pro Stream `index, enabled, username, displayName, status, attempts, lastError, confirmationRequired, nextRetryAt, connectedAt` aus (`app/plugins/clarityhud/backend/api.js:1286-1298`). Das Multi-Overlay lädt Settings über `/api/clarityhud/settings/multi` (`overlays/multi.js:194-197`) und empfängt Live-Chat-/Giftupdates; es ruft den Status-GET nicht auf. Der Dashboard-UI-Consumer lädt den Endpoint dagegen explizit (`ui/main.js:1466`). Bestätigt ist daher unnötige Veröffentlichung von Streamnamen plus Verbindungs-/Retrydiagnostik an öffentlichen Overlay-Clients; kein Schluss über Geheimnisse in `lastError`. Minimaloption: nur `GET /api/clarityhud/multi/status` aus der Public-HTTP-Registry nehmen. Lokaler Dashboard-GET bleibt verfügbar, da Public-Registry/Middleware nur Quick-Tunnel-Hosts beschränkt.
2. **Ungefiltertes `raw` samt numerischer TikTok-User-ID in Overlay-Event und History-State:** ClarityHUD-Producer kopiert das vollständige normalisierte Producerargument als `raw:data` in Chat/Follow/Share/Like/Gift/Subscribe/Join Updates und Queueeinträge (`backend/api.js:668-679, 711-719, 751-759, 792-806, 931-950, 986-995, 1027-1035`). Initialzustand `GET /api/clarityhud/state/chat|full` liefert diese Queues (`:214-257`), dieselben `clarityhud.update.*`-Events sind öffentlich registriert. Der aktuelle EulerStreamadapter baut z. B. Chat- und Gift-Normalformen mit `userId:userData.userId` (`app/modules/adapters/EulerstreamAdapter.js:1398-1410, 1576-1595`); ClarityHUD trägt sie unverändert in `raw` weiter. Chat-/Full-Renderer verwenden `raw` für MessageParser/Badges (`overlays/chat.js:459-520`, `overlays/full.js:786-789`); Parser liest `userId` für Cache-Key, parseUser-Fallback und generierte Element-ID (`lib/message-parser.js:181-186, 213-225, 276-280`). Sichtbarer Anzeigename und `user.uniqueId` werden im äußeren ClarityHUD-Payload separat aus `username`/`nickname` erzeugt (`backend/api.js:668-679`). Exakte Befundgrenze: ein zusätzlicher stabiler numerischer Account-Identifier wird im raw payload weitergereicht; der aktuelle Renderer liest ihn für interne Parser-/DOM-Schlüssel. Kein Claim, dass alle Chat-/Badge-Rohdaten geheim oder unangemessen sind. Minimaloption zur Abwägung: nur im öffentlichen Projektor `raw.userId` durch den bereits außen verfügbaren sichtbaren Handle ersetzen bzw. entfernen und die benötigten Text-/Badgefelder erhalten; denselben Projektor für State-Arrays und Live-Events anwenden, lokale Producer-/Adminantworten vollständig beibehalten. Vor einer Umsetzung Originalrenderer-Contractfixture ergänzen und Cache-/Message-ID-Verhalten ohne die numerische ID prüfen.
- Public Settings-GET und Settings-Events geben die jeweilige Dock-Config aus; das bekannte `settings-schema.js` besitzt nur Darstellung, Accessibility, Filter-/Layoutoptionen und bei `multi.streams` explizite Stream-Handles/Farben (keine API-Key-/Passwortfelder). Die Einstellungsupdates validieren eingehende Schlüssel gegen Defaults. `initialize()` merged gespeicherte Settings aber via Spread und validiert sie nicht erneut; ein unbekannter gespeicherter Schlüssel könnte deshalb theoretisch in erlaubten Settingspayloads auftauchen. Es wurde kein solcher konkreter Runtimewert untersucht oder behauptet; reale gespeicherte Daten wurden nicht gelesen.

### Grenzen, Änderungen und Prüfstatus

- Source-only Review, keine Dateien geändert; keine Tests gestartet, kein Server, Socket, Provider, TikTok, Mic, Renderer, GPU oder OBS gestartet. Zentraler TikTokadapter wurde ausschließlich read-only zur Herkunft der normalisierten Felder inspiziert. Keine echte Zuschauer-/Profil-/Accountdaten gelesen.
- Die vorherige eigene Visual-FX-Backendprüfung war 5 Suites / 70 Tests PASS, einschließlich `test/visual-fx-frame-webgpu-backend.test.js`; exakter Befehl und Scope stehen im unmittelbar vorherigen Abschnitt. Der CEO bestätigte zusätzlich 4 gezielte Visual-FX-Public-Suites / 65 Tests PASS unter Node 22; diese bekannten Backendtests wurden hier nicht erneut ausgeführt.
- Ergebnis: zwei konkrete, unbehandelte Public-Befunde mit Quellenpfaden und minimalen Optionen identifiziert; Status, Output-Felder und Renderer-Verbrauch sind sourcebestätigt. Teilweise geprüft: kein tunnel-/socket/browser-E2E und keine gespeicherten ClarityHUD-Runtimewerte. Blockiert: nichts. Nicht geprüft: dynamische Connectorfehlerwerte und reale Konfigurationen. Keine Änderung, kein Commit/Push/Release.

## ClarityHUD: Status-GET-Entzug und Raw-Consumer-Fixture

Stand: 2026-10-07. CEO-Folgeauftrag: nur `/api/clarityhud/multi/status` öffentlich entziehen; für den Raw-User-ID-Befund vor jeder Projektion Originalproducer, Chat-/Full-/History-Renderer und Settingsverbrauch isoliert prüfen. Fremde ClarityHUD Backend-/Schema-/Overlayhunks blieben unangetastet.

### Umsetzung und Diff-Attribution

- `app/modules/public-overlay-registry.js`: genau den HTTP-Ruleeintrag `GET/HEAD /api/clarityhud/multi/status` entfernt. Alle anderen Registry-/Entrypoint-/Event-Hunks sind fremd und wurden nicht geändert.
- `app/test/public-overlay-registry.test.js`: eigene Assertion, dass GET und HEAD für genau diesen Pfad nicht mehr public erlaubt sind.
- `app/test/public-overlay-security-matrix.test.js`: den Statuspfad aus der Liste erwarteter öffentlicher Read-APIs entfernt, in die denied-path cases aufgenommen und lokales Middleware-Pass-through gegen Public-404 geprüft. Die Datei enthält weitere fremde Änderungen; nur diese ClarityHUD-Hunks gehören zu diesem Auftrag.
- Die Originalroute in `app/plugins/clarityhud/backend/api.js:443-451` und der Dashboard-UI-Aufruf `app/plugins/clarityhud/ui/main.js:1466` wurden nicht geändert. Bestehende `plugins/clarityhud/test/backend-behavior.test.js` verifiziert den originalen Statusresponse weiterhin.

### JSDOM-Consumerbefund vor Projektion

- Neue isolierte Fixture `app/plugins/clarityhud/test/public-raw-display-contract.test.js` ruft den echten ClarityHUD-Backendproducer mit synthetisch normalisiertem Ereignis auf und lädt Original-`MessageParser`, `BadgeRenderer`, Chat-Overlay, Full-Overlay sowie Multi-Overlay in JSDOM. API-Fetch/Socket sind stumpfe in-memory Fakes; keine Verbindung wird gestartet.
- Chat-Liveevent und `/state/chat|full`-History behalten `raw`. Der Full-HUD-Parser nutzt `raw.userId` für Cache-Key, `parseUser`-Fallback und generierte DOM-ID (`lib/message-parser.js:181-186,213-225,276-280`). Original-Chat/Full-DOM zeigt aber mit `raw.userId` durch `raw.uniqueId=username` ersetzt identischen Namen, Text und Moderator-/Subscriberbadges. Parser-`uniqueId` wechselt von numerischer Fixture-ID zum bereits vorhandenen Handle; die gerenderte Ausgabe bleibt gleich. Das belegt eine minimale Public-only Ersatzoption, aber keine Projektorimplementation.
- Gift-Live-/History-Payload enthält `raw.userId`, `raw.giftId`, `totalCoins`, `createTime` und weitere normalisierte Felder. Die echte Full-History-Consumerfixture rendert denselben Namen/Giftnamen/Münzwert mit vollständig ausgelassenem Gift-`raw`; `giftId` wird serverseitig vor Emit nur für Catalog-Fallback benötigt (`backend/api.js:904-912`) und vom Overlay nicht gelesen. Public-only `raw`-Entfernung für Gift-/Treasure-Event und History ist damit eine belegte Minimaloption; lokales Producerobjekt bleibt unangetastet.
- Settingsbefund: `/api/clarityhud/settings/multi` und `clarityhud.settings.multi` sind public. `overlays/multi.js:252` liest aus `streams[]` nur `enabled && username` zur Zählung, rendert Username/DisplayName aus der Konfig nicht. JSDOM bestätigt gleichen sichtbaren Multi-Overlayzustand, wenn konfigurierte Namen durch einen nichtleeren neutralen Platzhalter ersetzt und `displayName` entfernt werden. Schmale Projektion könnte genau diese Values öffentlich neutralisieren und Farben/Layout behalten. Die andere Dock-Defaults enthalten keine User-/Gift-IDs oder Credentialfelder; ein unbekannter persistierter Settingsschlüssel bleibt eine theoretische Spread-Frage, kein beobachteter Livewert.
- Option für späteren Raw-Chatvertrag: nur Public-Payloads transformieren; `raw.userId` ersetzen oder entfernen und `uniqueId` aus dem sichtbaren Handle setzen. Falls stabile same-viewer Korrelation über mehrere Events erforderlich wird, eine ephemere zufällige Opaque-ID pro Public-Session im Serverprojektor zuordnen und bei Stream/session boundary verwerfen; keine Hashbildung der Plattform-ID. Vor Umsetzung Viewer-/Overlay-Owner über diesen Contract informieren. Lokale Queue-/Admin-/Producerpayloads bleiben original.

### Prüfung und Grenzen

- `public-overlay-registry.test.js` + `public-overlay-access.test.js`: 2 Suites / 159 Tests PASS, Exit 0.
- `plugins/clarityhud/test/backend-behavior.test.js`: 1 Suite / 12 Tests PASS, Exit 0; darunter der lokale Multi-Status-GET-/Retrystatusproducer.
- `plugins/clarityhud/test/public-raw-display-contract.test.js`: 1 Suite / 3 Tests PASS, Exit 0; Original Chat-/Full-Live-/History-/Multi-Renderer mit synthetischen Fixtures.
- `public-overlay-security-matrix.test.js` mit TestNamePattern `ClarityHUD multi status`: die neue Public-404/Local-pass-through-Fixture PASS (1 relevanter Test; Exit 0; andere Fälle absichtlich übersprungen).
- Vollständiger breiter Matrixlauf war nicht grün: der bereits vorhandene `/api/visual-fx-frame-webgpu/config`-Canarytest sendet das generische `rendererPayload()` an den strikten Visual-FX-Projektor und erhält 500 statt 200 (`public-overlay-security-matrix.test.js:387-390`). Das ist ein unabhängiger Fixture-/Visual-FX-Projektor-Vertragskonflikt, nicht der ClarityHUD-Pfad; er wurde in diesem ClarityHUD-Auftrag nicht geändert.
- Source/isolated-fixture geprüft, kein realer Server, Socket, Provider, TikTok, Mic, Rendererlauf außerhalb JSDOM, GPU, OBS oder echte Profil-/Zuschauerdaten. Geprüft und behoben: der Status-GET ist lokal weiterhin registriert und im Publicpfad verweigert. Teilweise geprüft: Raw-Projektion noch nicht umgesetzt; nur Rendererkompatibilität einer minimalen Option geprüft. Blockiert: nichts. Nicht geprüft: tunnel-/Browser-E2E, echte gespeicherte unbekannte Settingswerte. Kein Commit/Push/Release.

## ClarityHUD: bevorzugte Raw-Korrelation präzisiert

Der Original-`MessageParser` trennt zwei Verträge: `eventData.userId || eventData.uniqueId` wird in Cache-Key und generierter DOM-Nachrichten-ID verwendet (`lib/message-parser.js:181-186,276-280`), während `parseUser()` `uniqueId` zuerst für den sichtbaren Parser-Nutzernamen nimmt (`:223-225`). Die JSDOM-Fixture wurde aktualisiert: Public-Live-/History-Chat mit `raw.userId = public-session-token-…` und `raw.uniqueId = sichtbarer Handle` rendert denselben Text und Moderator-/Subscriberbadges; Parser-Korrelation bleibt stabil und die numerische Plattform-ID erscheint nicht mehr in generierter ID/Cache-Key. Ein Handle-Alias allein wäre deshalb eine falsche Identitätssemantik.

**Empfohlene spätere Umsetzung:** nur im Public-Projektor eine zufällige opaque ID je normalisierter Streamsession und Plattform-User-ID zuordnen und in `raw.userId` einsetzen; `raw.uniqueId` auf den bereits separat veröffentlichten sichtbaren Handle setzen. Gleiche User-ID erhält innerhalb der Session dasselbe Token, die Zuordnung wird an Stream-/Sessiongrenze geleert und niemals gehasht. Der vorhandene Parser kann den Korrelationsslot unverändert weiterverwenden; die äußere UI-Identität bleibt Handle/Nickname. Das ist bislang durch Fixture belegt und noch kein Produktprojektor. History- und Liveprojektion müssen dieselbe Zuordnung verwenden. Gift-/Treasure-`raw` kann laut Full-History-Fixture vollständig wegfallen. Keine Raw-/Producer-/Adapteränderung vorgenommen.

## FlameOverlay: Public-Config-Projektion

Stand: 2026-10-07. Enger Folgeauftrag des CEO: nur GET `/api/flame-overlay/config` und Outgoing `flame-overlay:config-update` projizieren; Producer, lokale Adminantwort, Triggerregeln, Triggerlogik, Registry, Renderer und Lebenszyklus nicht ändern.

### Befund und Projektionsvertrag

- `app/plugins/flame-overlay/main.js:790-798` liefert `{success:true, config:getRuntimeConfig()}`; Config-save und Preset-load emittieren `{config:this.config}` (`:814`, `:903`). Die Runtime enthält neben sichtbaren Rendererwerten `triggerRules`, `triggersEnabled`, `triggerCooldown`, `triggerMaxStack`, `triggerPreset` und `chatColorCommands`; Configsave kann zusätzlich unbekannte gespeicherte Schlüssel mitschleppen.
- Original-`renderer/effects-engine.js` lädt denselben GET, merged `data.config` in Rendererdefaults und nimmt Config-Update-Event entgegen (`:150-159,186-189`). Die Allowlist ist gegen sämtliche `VISUAL_FX_DEFAULT_CONFIG`-Felder abgeglichen: Enum-/Zahlen-/Boolean-/Hexfarbvalidierung entspricht dem `main.js`-Schema; Framepositionen werden validiert und auf `[0]` reduziert, weil `EffectsEngine.getActiveFrameRectPixels()` nur den ersten Eintrag liest (`:2000-2031`). Trigger-/Chatregel- und unbekannte Felder werden ignoriert; fehlende/ungültige Rendererwerte schließen öffentlich fail-closed.
- Read-only Eventvertrag am Configcheckpoint: Server-`dispatchTrigger()` emittiert `{...trigger,id,duration}` als `flame-overlay:trigger` (`main.js:1389-1390`); Renderer konsumiert diesen Effektinput. `clearActiveTriggers()` emittiert exakt `{}` für `flame-overlay:clear-triggers` (`:1435`); Renderer nutzt nur das Ereignis, nicht den Payload. Zu diesem Zeitpunkt hatte die Configprojektion noch keinen Triggerprojektor; der nachfolgende CEO-Folgeauftrag und die Umsetzung stehen in „Flame-Triggerprojektion und ClarityHUD-Allowlist zur Freigabe“.

### Umsetzung und Prüfung

- `app/modules/public-overlay-payload-projection.js`: Flame-spezifische visuelle Allowlist und Bounds sowie nur der Projektionsfall für `flame-overlay:config-update`; Public-Event wird `{config:<visuelle Allowlist>}`. Keine Trigger- oder Clear-Eventprojektion.
- `app/modules/public-overlay-access.js`: Public-HTTP-Branch genau für `/api/flame-overlay/config`; Rückgabe `{success:true,config:<Allowlist>}`. Nichtöffentliche Requests/Hosts behalten originale Antwort.
- `app/test/flame-overlay-public-config-projection.test.js`: isolierte Fixtures vergleichen vollständige Renderer-Defaults und lokale Admin-/Socketpayloads, prüfen Ausschluss von Regel-/Privatfeldern sowie malformed fail-closed; liest den tatsächlichen Trigger-/Clear-Producervertrag read-only.
- `app/test/public-overlay-security-matrix.test.js`: VisualFX-Matrixroute nutzt jetzt eine echte Schemafixture statt generischem `rendererPayload()`, wodurch die Security-Matrix nicht am strikten Projektor fälschlich 500 meldet. Flame-Matrixroute nutzt ebenfalls den echten Default plus private Trigger-/Canaryfelder; Publicresponse bleibt Rendererdefaults-only, lokale Antwort erhält die Enginefelder. Die Datei enthält parallele Entrypoint-/Security-Hunks, die anderen Scopes zugeordnet sind.
- Node v22.14.0, Jest fokussiert: **5 Suites / 222 Tests PASS**, einschließlich voller Public-Security-Matrix, HTTP-/Socketaccess, gemeinsamer Projektor, neuer Flamefixture und aktualisierter ClarityHUD-Originalrenderer-Fixture. Ein erster Lauf hatte Fixturefehler: VisualFX erwartete sämtliche Defaultfelder trotz seiner bereits bestehenden Teil-Allowlist, die Socketspy wurde nach Policy-Wrapping abgefragt und der neue opaque-token-Fixturebuilder wählte den Handle aus dem falschen Ort. Fixtureerwartungen und Spy-/Token-Attribution wurden korrigiert; der erneute Gesamtbündellauf war grün.
- `git diff --check`: Exit 0; Git meldete mögliche LF→CRLF-Umwandlung in anderen bereits dirty Dateien. Kein Server, Tunnel, GPU, OBS, TikTok, Audio oder echte Daten genutzt; kein Commit, Push oder Release.

### Grenzen

- **Geprüft:** Public GET-/Socketprojektion, lokale Payload-Erhaltung, malformed rejection, Renderer-Defaultfelder, Eventproducer-Vertrag und vollständige Security-Matrix.
- **Teilweise geprüft:** Schema-Bounds/Enums/Typen source-abgeglichen; keine echte HTTP-Server-/Socket.IO-/Renderer-/GPU-Ausführung.
- **Blockiert:** nichts. **Nicht geprüft:** Browser-/Quick-Tunnel-/OBS-Liveausgabe. **Offene Entscheidung:** ob Flame-Trigger-`source` regelinterne IDs bzw. Kommando/Wert weiter offen überträgt und eine eigene Projektion braucht.

## Folgeauftrag: Flame-Triggerprojektion und ClarityHUD-Allowlist zur Freigabe

Stand: 2026-10-07. Scope nach erfolgreicher Configprojektion: Flame-Trigger nur am Public-Projektor einschränken; anschließend ClarityHUD Token-/Feldvertrag für separate Freigabe konkretisieren. Keine Registry-, Backend-, Adapter-, Producer-, Renderer- oder Lifecycleänderung.

### Flame-Trigger: Producer-/Consumerbefund und Umsetzung

- `main.js::dispatchTrigger()` normalisiert einen Trigger, vergibt `triggerId`, und emittiert `{...trigger,id:triggerId,duration}`. `source` stammt je nach Pfad aus Regel-ID (`rule:<id>`), Giftwert (`gift:<value>`), Chatfarbkommando (`chat:<command>`), manuellem Request oder `flow`; wegen des Spreads können manuelle Inputs zudem nicht gerenderte unbekannte Felder im Originalpayload erhalten. Backendlogik und lokale Admin-/Producerantwort bleiben vollständig.
- Original-`renderer/effects-engine.js::handleTrigger()` liest `type`, `duration`, optional `revert`/`permanent`, `effect`, `amount`, `intensity`, `intensityBoost`, `color`, `bloom`, `bloomOverride`; es legt `id` im `activeTriggers[]`-Eintrag ab und verwendet ihn als `triggerTimers`-Map-Schlüssel. Timeout sucht den aktiven Eintrag mit derselben ID. Es gibt kein späteres gezieltes Server-Remove-Event; `clearTriggers()` löscht alle Timer/Einträge. `clearActiveTriggers()` sendet weiterhin genau `{}`.
- Neuer Publicprojektor lässt nur die vom Renderer verarbeiteten bekannten Aktions-/Effekt-/Farb-/Numerikfelder zu, validiert deren Formen/Grenzen, entfernt `source`, backendseitige Original-ID und sonstige Extras und setzt `id` auf eine neue UUID pro öffentlicher Emission. Das ist zustandslos: keine interne Rule-ID-Ausgabe, kein Map-Wachstum und keine Korrelation zu backendseitigen IDs. `flame-overlay:clear-triggers` bleibt ohne Projektion und mit `{}`.
- `app/test/flame-overlay-public-trigger-projection.test.js` prüft alle sieben Aktionen, malformierte Grenzen, Entfernen von `source`/unbekannten Feldern, lokal unverändertes Broadcast plus projizierte Public-Room-Kopie und den originalen VM-geladenen `EffectsEngine` mit Stubtimer. Opaque ID ist dessen aktiver Timer-Key; Full-Clear arbeitet ohne ID. Kein Canvas/WebGL/GPU oder Serverprozess.

### ClarityHUD: bounded Token-Lebensdauer und finale Feldoption

- MessageParser-Cache ist ein Map mit Größenlimit **100**; bei voller Map entfernt `addToCache()` den ältesten Eintrag. Cache-Key und Element-ID benutzen `userId || uniqueId`; Userdarstellung nimmt `uniqueId` separat (`message-parser.js:11-14,181-186,223-225,276-280`). Full-HUD hält maximal `maxLines` je Eventqueue (Schema `1..500`); Multi-HUD hält `multiStreamQueue` bis `maxMessages` (`50..1000`). `clearAllQueues()` leert alle Queues bei Plugin-Cleanup; `reconnectMultiStreams()` trennt Connectoren, leert aber die historische Multi-Queue nicht. Das muss bei einer Projektoroption bedacht werden.
- **Konkrete Empfehlung für Chat/History:** pro ursprünglichem `raw`-Objekt eine Modul-`WeakMap<raw, opaqueToken>` verwenden. Public-Livepayload und Historywrapper teilen laut Producer exakt dieselbe `raw`-Referenz; daher erhalten sie dasselbe Token. `raw.userId` wird durch das zufällige Token ersetzt, `raw.uniqueId` bleibt der bereits separat sichtbare Handle. Keine per-Viewer Map, kein Hash, keine Profil-/Session-ID. WeakMap hält die Rohobjekte selbst nicht stark fest; sobald Livepayload/Queue sie nicht mehr referenzieren (Clear/Eviction/Cleanup), kann Token-Eintrag verschwinden. Da der Token ereignisbezogen und nicht nutzerbezogen ist, wird nach unterschiedlichen Messages keine viewerweite Korrelation angeboten.
- **Chat-Raw-Allowlist (vor Umsetzung):** sichtbare Identität `uniqueId`/`nickname`/`username`/`profilePictureUrl`; Parsertext `message`/`comment`/`text`, bounded `textArray` und Emote-Objekte; Cachezeit `timestamp`/`createTime`; der opake `userId`-Slot; Badgeverbrauch `teamMemberLevel`, `isModerator`, `isSubscriber`, `userIdentity.{isModeratorOfAnchor,isSubscriberOfAnchor}`, nötige Teilwerte von `user.{uniqueId,nickname,profilePictureUrl,teamMemberLevel,gifterLevel,fansClub.{level,clubName}}` sowie gebundene `badges[]`-Displayfelder `{type,imageUrl|url,name|displayType}`. Andere normalisierte Rohfelder/IDs nicht weiterreichen. Live-Event und Chat-/Full-History müssen dieselbe Projektion benutzen.
- **Gift/History-Allowlist:** Full-Renderer zeigt `user.nickname`, Giftname, Coins und optional Bild (`showGiftImages`); Full-History-Fixture bleibt damit identisch, wenn `raw` vollständig fehlt. Beibehalten: Eventtyp/-zeit, sichtbarer User (`nickname`, erforderliche Queue-Dedupe-Handlefelder), Gift `{name,count,coins,image,isTreasureChest}` und nur tatsächlich konsumierte Legacy-Fallbackfelder. `raw.userId`, `giftId`, `totalCoins`, interne Catalog-/Adapterextras entfallen. Treasure erhält dieselbe Giftform mit Treasure-Typ.
- **Multi-Chat/-Gift-Allowlist:** Renderer braucht `sourceId`/`streamIndex` zur Primärstreamklasse, geprüfte `colors.{text,bg,accent}`, Useranzeige/Avatar, Chattext oder Giftname/Count/Coins/Bild, Zeit und fürs Chat-Badge/Text notwendiges allowlisted Raw. `sourceLabel` erscheint in Multi-Badge und Debugzeile, daher als neutrales `Stream 1..N` projizieren statt konfigurierte Handles/Namen. Multi-Gift-Renderer liest `raw` nicht; dort ganz weglassen.
- **Multi-Settings-Allowlist:** `settings-schema.js::validateSettings()` kennt die Renderer-Settings und validiert Enums, Nummern, boolesche Werte, CSS-Farben/-Längen und `streams[]` auf höchstens 6 Einträge. `initialize()` merged gespeicherte Daten jedoch per Spread und validiert unbekannte alte Schlüssel nicht erneut; Public-Projektor muss deshalb strikt die bekannten `DEFAULT_SETTINGS[dock]`-Schlüssel wählen und Werte revalidieren. Für `multi.streams[]` genügt `{enabled,username?,displayName?,textColor,bgColor,accentColor}` semantisch nicht: Renderer liest `username` nur als Presence-Flag für Streamcount, `displayName` aus Settings gar nicht. Publicwert daher neutralisieren zu `{enabled, username: enabled&&configured ? 'configured' : '', textColor,bgColor,accentColor}`; `displayName` weglassen. Multi-Eventlabels zusätzlich neutralisieren wie oben.
- Die aktuelle Settings-Schema-Allowlist lautet in Kurzform: **chat** enthält Typo/Farbe/Position/Accessibility/Badge-/Scrollfelder aus `DEFAULT_CHAT_SETTINGS`; **full** zusätzlich Eventtoggles, Layout-/Animations-, Giftbild-/Streak- und Likeaggregation-Felder; **stream** Eventtoggles, Slot-/TTL-/Highlight-, Motion-/Ticker-Felder; **multi** Layout/Columns/Styles/Dichte/Avatar-/Zeit-/Highlight-/Capacity-/Contrast-/Pulse-/Reconnectfelder plus Streams. Für die konkrete Feldliste sind die jeweils vier `DEFAULT_*_SETTINGS`-Objekte in `app/plugins/clarityhud/lib/settings-schema.js` maßgeblich. Vor Umsetzung ist noch die Abweichung zu dokumentieren: Chat-Renderer liest zusätzlich ältere Schlüssel wie `textAlign`, `userNameColor`, `textOutline`, `padding`, `messageSpacing`, `animationType`, die nicht in den aktuellen zentralen Defaults vorkommen; Public-Allowlist darf diese Altwerte nur nach expliziter bounded compatibility-Prüfung aufnehmen.

### Neue Triggerprüfungen

- Node v22.14.0, Jest mit `--no-cache`: **7 Suites / 233 Tests PASS** (Trigger- und Configprojektion, komplette Public-Security-Matrix, Public Socketadapter, gemeinsamer Projektor, Flame Backendtests und ClarityHUD Originalconsumer-JSDOM-Fixture). Darin enthalten ist der VM-geladene Original-Flame-Renderer mit Stubtimer; kein Test startet GPU, Server, TikTok, Mic, Audio oder OBS.
- `git diff --check` für die eigenen Trigger- und Configpfade bleibt abschließend auszuführen; frühere Flame-Configprüfung bestand mit 5 Suites / 222 Tests vor dem Trigger-Folgeauftrag.
- **Blockiert:** nichts. **Teilweise geprüft:** Originalrenderer mit VM/Stubtimer und Public-Adapterin-process. **Nicht geprüft:** echter Socket.IO-Prozess, Browser, Tunnel, OBS/GPU/Live.
- **ClarityHUD-Entscheidung angefragt:** Empfehlung ist dokumentiert, noch kein Projekorhunk und keine Producer-/Rendereränderung. Offene Freigabe betrifft insbesondere Alt-Settings-Kompatibilität und Avatar-/Emote-URLs als absichtlich öffentliche Assets.

### Exakte ClarityHUD-Settings-Default-Allowlists

Die Kandidaten werden für jeden GET/Socket-Settings-Contract aus dem jeweiligen Defaultsobjekt selektiert und über `validateSettings(dock, candidate)` begrenzt; andere/unbekannte gespeicherte Schlüssel gehen nie public. Die Multi-Streams-Sonderbehandlung oben ersetzt `streams`-Namen und lässt ausschließlich die validierten Farb-/Enabledfelder passieren.

- **chat:** `fontSize`, `fontFamily`, `fontColor`, `backgroundColor`, `lineHeight`, `letterSpacing`, `align`, `showTimestamps`, `maxLines`, `outlineThickness`, `outlineColor`, `wrapLongWords`, `mode`, `highContrastMode`, `colorblindSafeMode`, `reduceMotion`, `dyslexiaFont`, `accessibilityPreset`, `opacity`, `keepOnTop`, `transparency`, `emojiRenderMode`, `badgeSize`, `teamLevelStyle`, `showTeamLevel`, `showModerator`, `showSubscriber`, `showGifter`, `showFanClub`, `useVirtualScrolling`, `usernameColorByTeamLevel`.
- **full:** alle chat-Schlüssel plus `showChat`, `showFollows`, `showShares`, `showLikes`, `showGifts`, `showSubs`, `showTreasureChests`, `showJoins`, `layoutMode`, `feedDirection`, `animationIn`, `animationOut`, `animationSpeed`, `showGiftImages`, `giftImageSize`, `giftStreakMode`, `likeAggregationWindowMs`, `likeAggregationMinCount`.
- **stream:** `orientation`, `showChat`, `showFollows`, `showShares`, `showLikes`, `showGifts`, `showSubs`, `showTreasureChests`, `showJoins`, `slotChat`, `slotFollow`, `slotShare`, `slotLike`, `slotGift`, `slotSub`, `slotTreasure`, `slotJoin`, `highlightGiftThreshold`, `highlightAlwaysSub`, `highlightAlwaysTreasure`, `ttlChat`, `ttlFollow`, `ttlShare`, `ttlLike`, `ttlGift`, `ttlSub`, `ttlTreasure`, `ttlJoin`, `animIn`, `animOut`, `reduceMotion`, `opacity`, `dyslexiaFont`, `tickerEnabled`, `tickerSpeed`, `tickerLabel`.
- **multi:** `enabled`, sanitized `streams`, `layout`, `columns`, `primarySpan2`, `messageStyle`, `density`, `showAvatars`, `showTimestamps`, `highlightPrimary`, `primaryOpacity`, `maxMessages`, `autoContrast`, `pulseOnNew`, `reconnectMaxAttempts`, `reconnectBaseDelayMs`.
- **Alt-Rendererfelder außerhalb dieser zentralen Defaultlisten:** Chat-Renderer-Quellen lesen zusätzlich `textAlign`, `userNameColor`, `textOutline`, `padding`, `messageSpacing`, `animationType` und `visionImpairedMode`. Der Public-Projektor sollte sie erst aufnehmen, wenn Owner bestätigt, dass sie gespeicherte unterstützte Einstellungen sind und feste Typ-/Bounds-Validatoren benannt sind; ansonsten greift der Overlay-Default. Dies ist ein konkreter offener Freigabepunkt, kein bestätigter Geheimniswert.

## ClarityHUD: Public-Projektion umgesetzt

Stand: 2026-10-07. CEO-Freigabe: nur Public-HTTP-/Socket-Projektor; Originalproducer, Renderer, Parser, Badgerenderer, zentraler TikTok-Adapter und Registry unverändert.

### Befund und Umsetzung

- Producerprüfung bestätigt: `handleChatEvent()` legt das normalisierte Eingabeobjekt als `raw` sowohl in das Liveevent als auch in die Chatqueue; beide enthalten dieselbe Objekt-Referenz. Daher mappt der Public-Projektor jedes Chat-`raw`-Objekt über eine modulweite `WeakMap` auf eine zufällige opake UUID. Live und History mit derselben Referenz bekommen dasselbe ereignisbezogene Token; geklonte Objekte erhalten ein anderes. Es gibt keine starke Map und keine viewerweite Identitätszuordnung. `raw.userId` wird nie weitergegeben; `raw.uniqueId` wird auf den bereits sichtbaren Handle projiziert.
- Chat-Raw ist eine explizite, typgeprüfte Allowlist für Parsertext, begrenzte `textArray`-/Emote-/Badgefelder und die vom Original-Badge-/Parserconsumer belegten Moderator-, Subscriber-, Team-, Gifter- und Fanclubfelder. Unbekannte Adapterfelder und Plattform-IDs werden weggelassen. Gift-/Treasure-Raw wird entfernt; die Full-History-Consumerfixture bestätigt gleiche Anzeige von Nutzername, Giftname und Münzwert.
- ClarityHUD-Settings werden aus den zentralen Defaultschlüsseln pro Dock gewählt und durch `settings-schema.js::validateSettings()` geprüft; zusätzliche unbekannte gespeicherte Schlüssel werden gestrichen. `lineHeight` ist zusätzlich auf endliche numerische Werte von 0.5 bis 5 beschränkt. Die vom Chat-Renderer konsumierten Legacyfelder sind mit eigenen Typen/Bounds zugelassen: `textAlign` links/zentriert/rechts; `userNameColor` Hex/RGB(A)/transparent; `textOutline` maximal 8px/rem/em, `padding` und `messageSpacing` maximal 48px/rem/em; `animationType` fade/slide/pop; `visionImpairedMode` boolean. Unbekannte oder außerhalb der Bounds liegende Werte führen zu einer neutralen nichtverfügbaren Publicantwort.
- Multi-Konfiguration ersetzt jeden konfigurierten Streamnamen durch `configured`, entfernt `displayName` und behält die validierten Farben/Layoutwerte. Multi-Eventlabels sind immer `Stream 1..6`, `sourceId`/Index und Farben sind begrenzt; Chat behält die projizierte Raw-Allowlist, Gift enthält kein `raw`.
- Public-GETs für `/api/clarityhud/settings/{chat,full,multi,stream}` und `/api/clarityhud/state/{chat,full}` erhalten typisierte Wrapper. Public-Settings- und Event-Sockets laufen über denselben Payloadprojektor. Die lokalen Socket-/HTTP-Payloads werden nicht verändert. Die bestehende Credentialredaction bleibt zusätzliche Schutzschicht.

### Geänderte Dateien und Prüfung

- `app/modules/public-overlay-payload-projection.js`: ClarityHUD-Settings-, Event-, Multi-, History- und Raw-Projektionen; WeakMap-Token.
- `app/modules/public-overlay-access.js`: Public-HTTP-Branches für erlaubte ClarityHUD-Settings-/State-GETs.
- `app/test/clarityhud-public-projection.test.js`: Producer-zu-Projektor-Tokenidentität, Clone-Abgrenzung, lokale Unverändertheit, Multi-Labelneutralisierung, HTTP- und Socket-Schutz.
- `app/test/public-overlay-security-matrix.test.js`: echte ClarityHUD-Wrapperfixtures für Settings-/State-Routen und lokale Pass-through-Erwartungen.
- `app/plugins/clarityhud/test/public-raw-display-contract.test.js`: Original Chat-/Full-/Multi-DOM vergleicht projizierte Live-/History-/Multi-Events; Parsercache-Bound bleibt 100.
- Node v22.14.0, gezielter Jest-Lauf `--runInBand --no-cache --runTestsByPath test\clarityhud-public-projection.test.js plugins\clarityhud\test\public-raw-display-contract.test.js test\public-overlay-access.test.js test\public-overlay-security-matrix.test.js test\public-overlay-payload-projection.test.js test\public-overlay-socket-adapter.test.js plugins\flame-overlay\test\flame-overlay.test.js test\flame-overlay-public-config-projection.test.js test\flame-overlay-public-trigger-projection.test.js`: **9 Suites / 275 Tests PASS**.
- `git diff --check` auf den oben genannten Dateien: PASS.

### Status und Grenzen

- **Behoben und geprüft:** Public-Clarity-Settings/Events sind allowlisted und typgeprüft; Roh-User-IDs werden durch eventbezogene UUID ersetzt; Live-/History-Referenzgleichheit ist geprüft; Multi-Streamquelle wird neutralisiert; unbekannte Settings-/Payloadfelder und Gift-Raw werden gestrichen; originale lokale Producer-/Renderercontracts bleiben bestehen.
- **Teilweise geprüft:** Originalconsumer-Verhalten läuft in JSDOM; Public-HTTP- und Socketpolicy laufen in-process gegen Fixture-Hosts; WeakMap-Semantik ist durch gleiche/geklohnte Objekt-Referenzen geprüft, nicht durch nichtdeterministische GC-Messung.
- **Blockiert:** nichts.
- **Nicht geprüft:** echter Tunnel-/Browser-/OBS-Lauf, echter Socket.IO-Prozess, Live-TikTokdaten oder reale gespeicherte Legacy-Settings. Die Legacy-CSS-Bounds sind bewusst konservativ; mögliche sehr alte gespeicherte Werte außerhalb davon werden öffentlich fail-closed und müssen anhand konkreter Konfigurationen beurteilt werden.
- Keine Änderung an `Bugstofix.md`, zentralem TikTokadapter, ClarityHUD-Producer/Renderer/Parser/Badgerenderer oder öffentlicher Registry; keine realen Zuschauer-/Profil-/Rollen-/Guthabendaten, echte Chatnachrichten/Gifts/Liveaktionen; kein Commit, Push oder Release.

## Public-Overlay-Vertragsmatrix und nächste Lücke

Stand: 2026-10-07. Read-only Abgleich von `public-overlay-registry.js`, `public-overlay-access.js`, `public-overlay-socket-adapter.js`, öffentlichen Producer-Routen und ausgelieferten Overlay-Consumern. Es wurden keine zusätzlichen OBS-/Live-/Teststarts durchgeführt.

### Vertragsklassen

- **Explizite Projektion:** schema-/feldbasierte zentrale Public-Projektion. Für HTTP-JSON greift darüber weiterhin die allgemeine Credential-Key-Redaction; für Socket-Payloads gilt nur die Projektion.
- **Producer-Allowlist:** der Producer erzeugt selbst ein Publicschema; der zentrale Socketadapter prüft dieses Event nicht erneut.
- **Credential-Redaction:** öffentliche HTTP-JSON-Antworten werden rekursiv nach bekannten Credential-Schlüsseln gefiltert; Nutzers-/Datenbank-IDs, Zeitstempel, interne Zähler und unbekannte Felder bleiben dabei grundsätzlich erhalten.
- **Socket-Pass-through:** das Event ist registriert, hat aber keinen Fall in `projectPublicOverlayPayload`; Adapter und direkte Public-Socket-Emission senden das Producerobjekt unverändert. Die Credentialredaction wird dort nicht aufgerufen.
- **Asset-Pass-through:** ausdrücklich registrierte statische Dateien/Medien werden direkt ausgeliefert. Die nachfolgende JSON-/Eventklassifizierung betrifft Datenoberflächen.
- **Keine Public-Fläche:** Pfad-/Methoden-/Eventoperation ist nicht registriert und wird vor dem Handler mit neutralem 404/Socket-Fehler abgewiesen. Downstream-Plugin-Rollenprüfungen bleiben eigenständige Schranken.

Aktueller Registry-Umfang: **48 OBS-Entrypoints, 35 erlaubte Incoming-Socket-Events und 315 erlaubte Outgoing-Socket-Events**. Der zentrale Payloadprojektor hat exakte Fälle für **31 Outgoing-Events**; die übrigen **284** fallen ohne zentrales Eventschema auf Pass-through zurück. Diese Zählung ist eine Quellinventur, keine Aussage darüber, dass jede aufgelistete Route im gestarteten Server erfolgreich auflösbar ist.

### OBS-Familienmatrix

| OBS-Familie | Registrierte HTTP-/Datenfläche | Outgoing-Socket-Vertrag | Producer-/Consumerbeleg und Einordnung |
|---|---|---|---|
| Advanced Timer | Timer, Rotator und Threshold-Effects GETs; statische Overlaydateien | Timer-/Threshold-Events pass-through | HTTP credential-redaction; Socket ohne Feldprojektion. |
| AnimazingPal Stream Assistant | Status-GET und Locale-Dateien | Event/Reset pass-through | HTTP credential-redaction; keine zentrale Socket-Allowlist für Felder. |
| ClarityHUD | vier Settings-GETs und Chat-/Full-State GETs | alle Clarity-Settings, Liveevents und Multi-Events explizit projiziert | In vorigem Abschnitt durch Originalproducer, Originalconsumer und HTTP-/Socket-Fixtures belegt. |
| CoinBattle | Lifetime/Weekly/Season Leaderboard GETs öffentlich; übrige Admin-/Player-/Config-/History-Routen nicht registriert | Alle 11 erlaubten CoinBattle-Outgoing-Events explizit projiziert | Leaderboard-GETs und alle aktuell registrierten CoinBattle-Events besitzen zentrale typisierte Projektionen; keine Registryerweiterung. Nicht erlaubte Engine-/Adminevents bleiben lokal blockiert. Registry führt zusätzlich ein `overlay-layouts` Muster, während `main.js` aktuell `/overlay/layouts` registriert; dieser genaue Registrypfad ist im aktuellen Route-Producer nicht belegt. |
| Emoji Rain / WebGPU Emoji Rain | Config-, User-Mapping- und Overlay-State-GETs; Rendererdateien | Spawn/Config/User-Mapping-Events pass-through | HTTP nur credential-redaction; Socket nur allowlist/room split, kein zentrales Feldschema. |
| Fireworks / WebGPU Fireworks | Overlay-/GPU-/Audioassets; keine WebGPU-Fireworks Config-/Status-GETs | Classic-Fireworks-Ereignisse sind separat erlaubt; WebGPU-Fireworks-Ereignisse nicht in der Outgoing-Allowlist | WebGPU-Fireworks Config-/Status-GETs sind nicht registriert; `webgpu-fireworks:*` wird am Public-Socket verworfen. Renderertrigger von Visual FX Frame WebGPU ist hingegen erlaubt und separat projiziert. |
| Flame Overlay | Config-GET und Rendererassets | Config/Trigger explizit projiziert; Clear-Signal ohne Nutzdaten | Konfigurations- und Triggercontract durch gezielte Originalrenderer-/Adaptertests geprüft. |
| Game Engine (Chess/Connect4/Plinko/Slot/Wheel/Arena) | Chess-/Connect4-Config-GETs und Arena-State-GET zentral projiziert; übrige registrierte GETs behalten Credential-Redaction | `current-state`, Timer-/Audio-/Mediaupdates, Arena-State und Arena/Chess/Connect4-Configupdates zentral projiziert; weitere Spielereignisse müssen producer-/consumerbezogen inventarisiert werden | Die öffentliche Konfigurations-Allowlist ist eng auf Chess-/Connect4-Rendererwerte begrenzt; andere Spieltypen auf `game-engine:config-updated` werden Public unterdrückt. Andere GET-/Eventfamilien sind nicht mit diesem Configauftrag abgedeckt. Zusätzliche Plinko-/Slot-Callbackrollenprüfungen sind unabhängig von der Public-Eventallowlist. |
| GCCE | HUD-Rotator GET und Stil-/Overlayassets | Show/Remove/Rotator-Update pass-through | Datenfelder werden nicht zentral typgeprüft oder bereinigt. |
| Goals / Multigoals | Overlaydateien | Config-/Reset-/Value-/Reach-Events pass-through | Socket-Payloads ohne zentrales Feldschema; keine weitere Public-JSON-Route in der Registry. |
| Interactive Story | Config-, Overlay-Positions- und Bild-GETs | Story-/Vote-/Generation-Events pass-through | HTTP credential-redaction; Ereignisse nicht zentral feldprojiziert. |
| Music Bot / Soundboard | Overlayassets und Audiodateien | Now-playing/Queue/Vote/Playback/Soundboard pass-through | Öffentliche Events werden unverändert übertragen; Producerpayloads in diesem Matrixauftrag nicht einzeln visualisiert. |
| ZappieHell | registrierter Overlayentrypoint | Goals-State/Update/Completed und Audio-Play explizit projiziert; Animate pass-through | Zentrale Projektion existiert; residuale Animate-Payload ist untypisiert. |
| Quiz Show | Brand-Kit, HUD-Config, State, Leaderboard, Layout-GETs | Quiz-/Vote-/Leaderboard-/Config-Events pass-through | HTTP credential-redaction; Socket ohne zentralen Feldvertrag. |
| CoinCup | Overlay-CSS/JS/Sound | Kein CoinCup-spezifisches Event im Public-Socketset festgestellt | Statische Assets pass-through; der im Overlay verwendete Datenweg ist in dieser Runde nicht weiter bis zum Producer verfolgt. |
| Sidekick | Public-Status und Public-Events GETs | Public-Status-Event pass-through | HTTP credential-redaction, keine zentrale Feldprojektion. Backend-/Overlay-Familie ist teilweise durch andere Arbeiten verändert; hier keine neue Feldbehauptung. |
| Spotlight / LastEvent | LastEvent Settings-/Last-/All-GETs und Spotlightassets | LastEvent Settings/Updates/Session-Reset pass-through | HTTP credential-redaction; Socketfelder ohne zentrale Projektion. |
| Stream Monsters / StreamAlchemy | State, Battle-State, Replay, Avatar/Art, Heartbeat-POST, Rendererassets | Battle-/Egg-/Gift-/Quest-/Season-/Stream-Events pass-through | HTTP credential-redaction am JSON-Ausgang; umfangreicher Socket-Familienraum ohne zentrale Payload-Allowlist. |
| STT Ticker | Overlayasset | Clear/Interim/Transcript pass-through | Transkripttext wird als Eventinhalt unverändert an Public-Overlay-Clients gegeben; keine zentrale Inhaltsprojektion. |
| Talking Heads | Overlay-/Sprite-/Übersetzungs-GETs und Assets | Avatar-/Animation-/Config-Events pass-through | HTTP credential-redaction; Socketdaten nicht zentral projiziert. Entsprechend Scope bleibt dies reine Inventur. |
| TopTier | Overlayassets | `toptier:update` explizit projiziert; Decay/Rank-Change/New-Leader pass-through | Feldprojektion schützt Board-Einträge; die drei Nebenereignisse sind im zentralen Projektor unklassifiziert. |
| Viewer-XP | Overlay-HTML/Locales | Public Profile/Leaderboard/Level-Up/Update pass-through im Socketadapter | Producer enthält `projectPublicProfile`, `projectPublicLeaderboard` und Level-Up-Projektion; der Socketadapter vertraut hier ausschließlich dem Producercontract. |
| Visual FX Frame WebGPU | Config-GET und Rendererassets | Config explizit; Trigger/Clear pass-through | Configschema wurde zuletzt durch Public-Configtests geprüft; Triggerpayload besitzt hier keinen zentralen Fall. |
| Weather Control (klassisch) | Config-/Gamification-GET und Rendererassets | Trigger/Stop/Config/Gamification explizit projiziert | Zentrale Feldprojektion für registrierte Weather-Events und GETs. |
| WebGPU Weather Control | Overlay-Config-GET und Rendererassets | Trigger/Stop/Config/Gamification zentral typisiert | Overlay-Config-GET nutzt vorhandene Responseprojektion. Die zuvor generischen Events werden anhand des realen Plugin-Producers und ausgelieferten HUD-/Canvas-Consumers projiziert; lokale Socketpayloads bleiben original. |

### Verifizierte Restlücke und fokussierte Schließung

- Aktuelle Datenbankproducer: `CoinBattleDatabase.getLifetimeLeaderboard()` führt `SELECT * FROM coinbattle_players` aus; Weekly-/Season-Abfragen liefern ebenfalls `id`, `user_id`, `unique_id`, `nickname`, `profile_picture_url`, `badges`, Zeit-/Zählfelder und Score (`app/plugins/coinbattle/backend/database.js:630,924-972`). `CoinBattlePlugin` sendet diese Zeilen direkt als `{success:true,data}` über die drei in der Public Registry erlaubten GET-Routen (`app/plugins/coinbattle/main.js:709-742`). Die Public-Middleware entfernte vorher nur credential-benannte Schlüssel.
- Der tatsächliche Post-Match-Consumer in `app/plugins/coinbattle/overlay/overlay.js:1881-1893,1930-1941` verwendet nur `profile_picture_url`, `nickname || unique_id` und `coins || total_coins`. `id`, `user_id`, Badges, Gift-/Matchzähler, `current_title`, `first_seen`/`last_seen` und Season-Metadaten sind für diese Liste unnötig. Damit bestand eine konkrete Datenschutzlücke bei persistenten Viewer-IDs und Profil-/Aktivitätsmetadaten.
- **Umsetzung:** `projectCoinBattleLeaderboardResponse()` projiziert die drei erlaubten Leaderboardantworten auf `{success,data:[{nickname,unique_id,profile_picture_url,total_coins}]}` und validiert Arraylänge, Typen, URL und ganzzahligen nichtnegativen Score. Die Hostgebundene Public-HTTP-Middleware ruft die Projektion nur für diese drei exakten Routepfade auf; lokale HTTPantworten bleiben original. Keine DB-/Pluginroute-/Overlay-Änderung.
- Neue Regression `app/test/coinbattle-public-leaderboard-projection.test.js` verwendet die echte SQLite-Datenbankklasse und den echten `getLifetimeLeaderboard()`-Query, sendet dessen Ergebnis durch Middleware für Public- und Local-Hosts und lädt die echte `showSingleLeaderboard()`-Funktion aus dem ausgelieferten Overlay in JSDOM. Das Public-DOM bleibt gleich, während Datenbank-ID, `user_id`, Badge-/Zähler-/Titel-/Zeitfelder entfernt werden; lokales Ergebnis enthält sie weiterhin. Die Security-Matrix enthält ergänzende negative Canaryfixtures.
- **Prüfung:** gezielter Lauf `test\coinbattle-public-leaderboard-projection.test.js test\public-overlay-access.test.js test\public-overlay-security-matrix.test.js`: **3 Suites / 201 Tests PASS**. Kein vollständiger Repositorylauf.
- **Vor Socket-Folgeauftrag bestätigtes Risiko:** `coinbattle:match-state` enthielt DBzeilen mit IDs und Config (`engine/game-engine.js::getMatchState`; `backend/database.js:577-591`), und `coinbattle:gift-received` Spieler-/Giftobjekt und `eventId` (`engine/game-engine.js:606+`), obwohl der Renderer das Giftobjekt nicht nutzt (`overlay/overlay.js:843-862`). Diese beiden Events sind inzwischen mit zentraler Public-Projektion und Originalconsumerfixture abgedeckt; Details stehen im nachfolgenden Socket-Auftragsergebnis.
- Weitere breite Socket-Pass-through-Kandidaten bestehen bei Stream Monsters, Game Engine, GCCE, STT, Talking Heads und WebGPU Weather. Die Matrix priorisiert sie für eine spätere Feldprüfung; sie sind nicht als bestätigte konkrete ID-Lecks behauptet, sofern kein entsprechender Producer-/Consumerbeleg oben genannt ist.

**Status:** CoinBattle-Leaderboard-HTTP-Lücke sowie alle 11 derzeit in der Public Registry erlaubten CoinBattle-Outgoing-Socketevents sind zentral projiziert und mit Producer-/Overlay-Consumer-Fixtures geprüft. Vertragsmatrix source-geprüft; statische Asset-/Public-API-Inventur kein Live-Verfügbarkeitsnachweis. Keine Auth-/Registry-/Backend-/Renderer-/OBS-/Liveänderung, kein Commit/Push/Release.

## CoinBattle-Socketprojektion: Match-State und Gift-Received

Stand: 2026-10-07. Nur zentraler Public-Projektor und Regressionfixture ergänzt; der Producer, Originalrenderer, Registry und lokale Socket-Nutzlast bleiben unverändert.

### Befund und Umsetzung

- Der echte Producer `CoinBattleEngine.getMatchState()` liefert aktive Matchdaten einschließlich Match-ID/UUID, Leaderboardzeilen aus `CoinBattleDatabase.getMatchLeaderboard()` (`mp.*`, also u. a. Datenbank-, Match-, Player- und Plattform-IDs), Team-Scores, Multiplikator und komplettes Engine-Configobjekt. Der Inaktiv-State enthält ebenfalls die Engine-Config. `CoinBattlePlugin.registerSocketEvents()` sendet denselben State auf `coinbattle:get-state` direkt an den anfragenden Socket; der Public-Socket-Guard muss deshalb denselben Projektor wie der Broadcastadapter anwenden.
- Der Originalrenderer liest aus `coinbattle:match-state` nur `active`, `match.mode/duration/elapsed/remaining/isPaused`, Leaderboardanzeige (`nickname || unique_id`, `coins`, optionale Avatar-/Badge-/Teamfelder), Team-Scores/-Namen und Multiplikatorwerte. Die internen IDs des Leaderboardrows nutzt er nur als vorherigen Positionsschlüssel. Der Public-Projektor setzt diesen Schlüssel auf den bereits sichtbaren `unique_id`; er gibt keinen zusätzlichen Plattform- oder Datenbankschlüssel frei. Das Configobjekt wird im Match-State-Renderer nicht benutzt; Overlayoptionen kommen aus URL-Parametern und dem separaten Config-Event.
- `CoinBattleEngine.processGift()` emittiert `coinbattle:gift-received` mit Spielerobjekt, vollständigem Giftobjekt, internem `eventId`, Münzen, Multiplikator und Team. `showGiftAnimation(data)` verwendet den Inhalt des Events nicht; sie zeigt nur ein statisches 🎁 und respektiert das lokal geladene `toasterMode`. Die Public-Form ist daher `{}`. Die vollständige Originalnutzlast bleibt für lokale/Admin-Clients erhalten.
- `projectCoinBattleMatchState()` lässt ausschließlich typisierte Anzeige-/Layoutfelder durch und entfernt Match-/DB-/Plattform-IDs sowie `config`. `projectCoinBattleGiftReceived()` akzeptiert nur ein Objekt und projiziert die leere Payload. Broadcastadapter und direkte Public-Socket-Emission teilen den zentralen Projektor; ungültige Projektionen werden öffentlich zurückgehalten.

### Dateien und Prüfungen

- `app/modules/public-overlay-payload-projection.js`: typisierte CoinBattle-Match-State- und Gift-Received-Allowlist.
- `app/test/coinbattle-public-socket-projection.test.js`: echte Engine-Erzeugung von Match-State und Geschenkereignis mit isolierten DB-Fixtures; Adapteraufteilung für Local/Public; Originaloverlay-JSDOM-Verbrauch; direkter `coinbattle:get-state`-Reconnect durch den echten Pluginhandler und Public-Socket-Guard.
- Fokussierter Jest-Lauf mit Node v22.14.0: `test\coinbattle-public-socket-projection.test.js test\public-overlay-socket-adapter.test.js test\public-overlay-access.test.js`: **3 Suites / 49 Tests PASS**.
- `git diff --check` für Projektion, Regressionfixture und diesen Bericht: PASS.

### Status und Grenzen

- **Behoben und geprüft:** Broadcast und Reconnect projizieren Match-State gleich; Originaloverlay zeigt Name, Münzen, Teamnamen und Teamführung; Geschenkereignis erzeugt die gleiche statische Giftanimation aus leerer Public-Payload; lokale Admin-Payloads bleiben vollständig.
- **Teilweise geprüft:** Engine und Pluginhandler sind originaler Produktcode, Socketadapter/Guard und Originalrenderer laufen in-process/JSDOM gegen isolierte Fixtures. Es wurde kein echter Socket.IO-Prozess, Browser, Quick Tunnel, OBS oder TikTok-Live gestartet.
- **Blockiert:** nichts.
- **Nicht geprüft:** Integration in realer Public-Tunnelverbindung, real gespeicherte Teamnamen-/Avatarwerte. Es gibt keinen Producer-/Renderer-/Registry- oder Datenbankschemaeingriff.
- Der CoinBattle-Match-State/Gift-Received-Pass-through ist damit geschlossen; die übrigen erlaubten CoinBattle-Events folgen in den weiteren Ergebnissen unten. Andere Pluginfamilien bleiben eigenständige Prüfungen; keine Schlussfolgerung über ihre Datenfelder ohne Producer-/Consumerabgleich.

## CoinBattle-Eventfolge: Leaderboard, Multiplikator, Matchende und Badge

Stand: 2026-10-07. Folgeauftrag beschränkt auf zentrale Public-Projektionen und isolierte Originalconsumer-Fixtures; Producer, Renderer, Registry, DB-Schema und lokale/admin Ausgabe unverändert.

### Bestätigte Verträge und Umsetzung

- `CoinBattleEngine.emitLeaderboard()` sendet `matchId`, Modus, Team-Scores und die DB-Ergebniszeilen von `getMatchLeaderboard()`. Originaloverlay `updateLeaderboard()` liest Modus sowie Spielername, Münzen, optional Avatar/Badges/Team und verwendet `user_id` nur für Positionsanimationen zwischen Snapshots. Zentrale Projektion gibt `{mode,leaderboard:[...]}` mit typisierten Rendererfeldern weiter; `user_id` ist ausschließlich Alias des bereits dargestellten `unique_id`; IDs, Matchbezug und nicht konsumierte Scores entfallen. Die `coinbattle:get-leaderboard`-Anfrage stößt diesen Producerbroadcast aus und erhält identische Projektion.
- `activateMultiplier()` sendet `matchId`, `activatedBy`, Multiplikator, Dauer und Endzeit; Renderer `showMultiplier()` liest nur Multiplikator, Dauer oder Endzeit. Public payload enthält nur die validierten Anzeigefelder. `multiplier-ended` entfernt interne Matchfelder und sendet `{}`, da der Consumer das Ereignis ohne Payload verarbeitet.
- `endMatch()` emittiert `match-ended` mit Match-ID, Gewinnerdetails, Teilnehmerzeilen und `winnersWithXP` samt Spieler-IDs. Originaloverlay benötigt für Teammodus nur Draw-/Teamgewinner und rote/blaue Scores; im Solomodus nur die Anzeige des ersten Gewinners (Name und Coins). Die Projektion lässt diese Felder selektiv durch und streicht XP, Plattform-/DB-IDs sowie nicht verbrauchte Teilnehmer.
- Beim Matchende emittiertes `badges-awarded` trägt `userId` und vollständige DB-Badgezeilen. Originalrenderer zeigt nur Icon und Name des ersten Badges; Public payload enthält nur diese zwei typisierten Felder. Lokale/admin Empfänger sehen weiterhin vollständige Producerobjekte.
- Public-Leaderboard-HTTP-Endpunkte und `match-state`/`gift-received` bleiben wie im vorstehenden Abschnitt beschrieben.

### Dateien und Prüfung

- `app/modules/public-overlay-payload-projection.js`: wiederverwendete typisierte CoinBattle-Leaderboardzeile; Projektionen für `leaderboard-update`, `multiplier-activated`/`multiplier-ended`, `match-ended` und `badges-awarded`.
- `app/test/coinbattle-public-socket-projection.test.js`: echte Engine-Emitter und Pluginhandler mit DB-Fixtures, lokaler/PublicAdapter-Split, Originalrenderer in JSDOM, Team-/Solo-Leaderboard und Winner-Reveal, Badge-/Multiplikatoranzeige, direkte Public-Reconnect-Antwort sowie malformed-Leaderboard-Fail-Closed.
- Node v22.14.0 mit `--runInBand --no-cache --detectOpenHandles`: `test\coinbattle-public-socket-projection.test.js test\public-overlay-socket-adapter.test.js test\public-overlay-access.test.js`: **3 Suites / 54 Tests PASS**, kein offener Handle gemeldet.
- `git diff --check` für die geänderten Projektionen, Fixture und diesen Bericht: PASS.

### Status und nächste belegte Lücke

- **Behoben und geprüft:** Leaderboard-Broadcast plus `get-leaderboard`-Anfrage, Multiplikatoranzeige/-ende, Team-/Solo-Matchende, Badgeanzeige; Public-Payloads enthalten keine Match-/Plattform-/DB-IDs oder XP-Empfänger, lokale Payloads bleiben original.
- **Teilweise geprüft:** echter Engine-/Pluginproducer, Adapter, Public-Guard und Originalrenderer laufen innerhalb isolierter Fixtures/In-Process; kein echter Socket.IO-Server/Tunnel/Browser/OBS/Live.
- **Blockiert:** nichts. **Nicht geprüft:** reale Teamname-/Avatar-Konfiguration und externe Public-Tunnelrunde.
- `coinbattle:post-match`, `team-names-updated`, `config-updated` und `timer-update` wurden anschließend mit typisierten Rendererfeldern projiziert; Producer-/Originalconsumerdetails und neue Checks stehen im Folgeabschnitt.

## CoinBattle-Abschluss: Post-Match, Teamnamen, Config und Timer

Stand: 2026-10-07. Die CEO-Folgepriorität ist mit zentralen Public-Projektionen geschlossen; alle 11 im `OUTGOING_SOCKET_EVENTS`-Set registrierten CoinBattle-Events werden explizit projektiert.

### Producer-/Consumerbefund

- `CoinBattleEngine.endMatch()` emittiert `coinbattle:post-match` mit Match-ID, Leaderboardzeilen, vollständigen `winnersWithXP` (einschließlich `userId` und Profilbildfeld) sowie der gesamten `config.postMatch`. Der Originalrenderer verwendet `showWinnerCredits`, `showXPAwards`, `winnerCreditsDuration`, `showLeaderboard`, `leaderboardTypes`, `leaderboardDuration` und für Credits Platzierung, Anzeigename, Coins, Team und XP. Public-Projektion validiert diese Felder samt Limits/Enums, entfernt IDs/Profilbild und unbekannte Configfelder; die optionale Match-Leaderboard-Fallbackliste wird auf Anzeige-Namen/Coins/Avatar projiziert.
- `CoinBattlePlugin` sendet `team-names-updated` aus der Teamnamenroute mit `team`, `name`, `imageUrl`, `matchId`; Renderer liest nur die ersten drei. Projektion verlangt Team `red|blue`, begrenzten nichtleeren Namen und HTTP(S)-Bild-URL gemäß bestehender `projectClarityUrl`-Policy. Null/leer bleibt als nuller Bildwert darstellbar; Match-ID wird gestrichen.
- `config-updated` wird von Save/Reset-Routen mit der ganzen Konfiguration emittiert. Originaloverlay liest ausschließlich `theme`, `skin`, `layout`, `showAvatars`, `showBadges`, `showXPAwards`, `toasterMode`, `overlayWidth` und `overlayHeight`. Public-Projektion validiert die in der UI angebotenen Theme-/Skin-/Layoutoptionen, Booleanwerte und dieselben Größenbounds wie der Renderer; Spiel-, User- und sonstige Configschlüssel werden gestrichen.
- `CoinBattleEngine.startTimer()` emittiert nur `elapsed`, `remaining`, `total`; Overlay und Dashboard lesen die Timerwerte. Die Projektion validiert nichtnegative sichere Ganzzahlen, `remaining <= total` und den oberen Zeitbound.
- Inventur der restlichen Outgoing-Registryevents ergab genau diese 11 CoinBattle-Namen: `badges-awarded`, `config-updated`, `gift-received`, `leaderboard-update`, `match-ended`, `match-state`, `multiplier-activated`, `multiplier-ended`, `post-match`, `team-names-updated`, `timer-update`. Die ergänzende Regression fixiert diese Menge und scheitert bei einem neuen CoinBattle-Publicevent ohne Projektion. Andere Engine-/Adminevents wie `match-started`, pause/resume/extend, Likes-/Share-/Follow-Punkte und Friend-Challenges sind nicht in der Public Outgoing-Allowlist und bleiben durch den Public-Adapter für den Tunnel ausgeschlossen; keine Registryerweiterung.

### Dateien und Prüfung

- `app/modules/public-overlay-payload-projection.js`: Post-Match-Credits-/Leaderboard-Projection, Teamnamenbild-URL, Displayconfig und Timerupdate; damit vollständige Projektion der 11 registrierten CoinBattle-Outgoing-Events.
- `app/test/coinbattle-public-socket-projection.test.js`: tatsächliche Plugin-Konfig-/Teamnamenroute, Engine-Timer-/Match-Ende-/Post-Match-/Badge-/Multiplikator-/Leaderboard-/Gift-/State-Producer, Local-vs-Public-Adapter, direkter Reconnect, originale JSDOM-Rendererfälle und malformed fail-closed. Team- und Solo-Contracts sowie erlaubte Eventmenge werden explizit geprüft.
- Node v22.14.0 mit `--runInBand --no-cache --detectOpenHandles`: `test\coinbattle-public-socket-projection.test.js test\coinbattle-public-leaderboard-projection.test.js test\public-overlay-socket-adapter.test.js test\public-overlay-access.test.js`: **4 Suites / 62 Tests PASS**, kein offener Handle gemeldet.
- `git diff --check` und Fixture-Datei auf Whitespace geprüft; keine Whitespacefehler. Git meldet für neue Dateien nur die bestehende LF/CRLF-Umwandlung.

### Abschlussstatus und nächster Fall

- **Behoben und geprüft:** CoinBattle-HTTP-Leaderboards plus alle 11 aktuell öffentlichen CoinBattle-Outgoing-Events. Publicdisplay behält nur validierte Anzeige-/Layoutfelder; lokale/admin-Socketpayloads bleiben vollständig.
- **Teilweise geprüft:** Produktproducer, Pluginrouten, zentraler Adapter/Guard und Originaloverlay laufen in isolierten Fixtures/In-Process/JSDOM. Kein echter Socket.IO-Server, Browser, Public Tunnel, OBS, VM oder Live.
- **Blockiert:** nichts. **Nicht geprüft:** reale Team-/Profilbild-URL-Nutzung und echte Tunnelverbindung.
- **Keine weitere belegte Lücke innerhalb der derzeitigen CoinBattle-Public-Outgoing-Allowlist:** neue Public-Events erfordern separate Registryentscheidung, die außerhalb dieses Auftrags lag. Nicht erlaubte Producerfamilien wurden anhand Registry und Emitstellen geprüft und sind nicht öffentlich zugänglich.
- CEO hat als nächste priorisierte Familie Quiz Show genannt: read-only Producer-/Originalconsumerprüfung für Reconnect-State und vorhandene sichere Public-GET-/Socketwege. Er verlangt keinen Rohstate und keine unreviewte Registry-/Backendfreigabe. Das ist der nächste eng begrenzte Prüfauftrag.

## Quiz-Show Public-State-Projektionen

Stand: 2026-10-07. Quiz-Show-Producer, Registry und Renderer bleiben unangetastet; ergänzt wurden ausschließlich zentrale Projektionen, Public-HTTP-Middleware-Zweige und isolierte Regression-Fixtures.

### Befund und Umsetzung

- `QuizShowPlugin.broadcastGameState()` sendet das bereits registrierte `quiz-show:state-update` über den normalen Socketadapter. Das Originaloverlay rendert daraus die laufende Frage/Antworten, Runde/Zeit, ausgeblendete Antworten, sichtbare Votericons, Jokeranzeige, Duellanzeige und Expansionsthemen. Die Rohpayload enthält zusätzlich `userId`-Werte in `votersPerAnswer`/Duel-Seiten, Jokerbenutzer-/Zeit-/Datenfelder, nicht verwendete `cacheEnabled`/`giftJokerMappings` sowie interne Zähler-/Statefelder. Der neue zentrale Projektor prüft Anzeigefelder typisiert; IDs und nicht konsumierte Felder entfallen. Local-Adapter behält unveränderte Producerpayloads.
- `GET /api/quiz-show/state` antwortet tatsächlich mit vollständiger Quiz-Konfiguration, sämtlichen Fragen samt korrektem Index, Paketen, Saisontabelle, OpenAI-Key-Status, Antwort-Map/eliminierten Nutzern und Statistiken. Die aktuelle Originaloverlayseite liest aus diesem Endpoint nur `customLayoutEnabled`/`activeLayoutId`, um anschließend eine Layout-GET zu laden; diese Antwort ist kein Game-State-Reconnect. Die Public-Middleware projiziert nur die zwei Layout-Navigationsfelder. Aktive Layout-GETs sind bereits registriert und werden auf `id`, Name, Auflösung, Ausrichtung und erlaubte CSS-Positionierungswerte begrenzt.
- `GET /api/quiz-show/hud-config`, `/brand-kit` und der vorhandene öffentliche Leaderboard-Pfad erhalten spezifische Feldprojektionen. Die HUD-Projektion begrenzt Themen, Farben, Schrift-/Layoutwerte und Animationen; URL-/Import-verwendende Custom-CSS wird ausgelassen. Brand-Kit-DB-IDs und lokale Pfade entfallen. Ranglistenzeilen werden auf Anzeigename/Punkte projiziert; Quiz-Show-Socketevents für Leaderboard, Duell, Joker, Runde, Kategorieabstimmung, Layout, HUD, Brand-Kit, MVP und Slot-Display besitzen ebenfalls begrenzte Schemata. `quiz-show:play-sound` wird öffentlich mit leerer Payload zugestellt, damit lokale Sounddateipfade nicht offengelegt werden; lokale Audioempfänger erhalten unveränderte Payloads.
- Der Registry-Pfad `/api/quiz-show/leaderboard` hat im aktuellen Pluginquelltext keinen passenden Route-Producer. Die Projektion ist defensiv vorhanden, kann die fehlende tatsächliche Route aber nicht belegen.

### Wiederverbindung und Grenzen

- Der originale Overlay-Connecthandler protokolliert derzeit nur die Socketverbindung; er fordert danach weder State per Socket an noch startet er einen Fetch für Game-State. Der umfangreiche State-GET ist daher kein vorhandener Reconnect-Vertrag. Es wurde bewusst keine neue eingehende Socketfreigabe, Route oder Producerlogik ergänzt.
- **Konkreter Minimalvorschlag für einen Folgeentscheid:** `quiz-show:get-public-state` als ausschließlich lesender Socketrequest mit Antwort nur an den anfragenden Overlayclient und exakt derselben Schema-Allowlist wie `quiz-show:state-update`. Kein Adminconfig, kein Fragenkatalog, kein Korrektindex vor Round-Ende, keine Voter-/Plattform-IDs, Maps, Set- oder Statistikdaten. Dieser Request benötigt eine reviewed Registry-Erweiterung und Plugin-Handlerfreigabe; nicht umgesetzt.
- Zusätzlicher Producer-Risikohinweis: der gegenwärtige `/api/quiz-show/state`-Handler ruft vor seinen SELECTs `checkSeasonAutomation()` auf. Das ist ein potenzieller GET-Nebeneffekt und wird durch zentrale Response-Projektion nicht behoben. Änderung am gemeinsamen Quiz-Show-Producer ist außerhalb dieser Projektion; öffentliches Reconnect darf diesen Endpoint nicht als neue Hydration missbrauchen.

### Dateien und Prüfung

- `app/modules/public-overlay-payload-projection.js`: typisierte Quiz-Show-Event-, State-, HUD-, Layout-, Brand- und Leaderboard-Projektionen.
- `app/modules/public-overlay-access.js`: Public-HTTP-Projektionen ausschließlich auf vorhandene Quiz-Show-Pfade.
- `app/test/quiz-show-public-projection.test.js`: tatsächlicher `broadcastGameState()`-Producer, Originalrenderer via JSDOM, public/local Adapteraufteilung, alle registrierten Quiz-Show-Outgoing-Events, vorhandene HTTP-Pfade, malformed fail-closed und fehlender Connect-State-Request.
- Node v22.14.0, `--runInBand --no-cache --detectOpenHandles`: fünf fokussierte Suites (`quiz-show-public-projection`, Quiz-Show Renderer-Lifecycle, public socket adapter, public access, payload projection), **69 Tests PASS**, kein offener Handle gemeldet.
- **Behoben und geprüft:** registrierter `quiz-show:state-update` und geprüfte vorhandene GET-/Eventantworten leiten nur begrenzte, originalconsumerrelevante Daten öffentlich weiter. Unsafe HTTP-/Eventformen werden abgewiesen; lokale Adapterdaten bleiben original.
- **Teilweise geprüft:** Originalproducer-/Consumer, Middleware und Socketadapter laufen in isolierten Jest-/JSDOM-Fixtures. `/api/quiz-show/leaderboard` besitzt keinen belegten Producer; der State-GET-Nebeneffekt ist nur quellengeprüft.
- **Blockiert:** tatsächliche Reconnect-Hydration ohne freigegebenen read-only Socketvertrag; der minimal notwendige Vertrag ist oben formuliert. **Nicht geprüft:** realer Tunnel, Socket.IO-Prozess, OBS, echte gespeicherte HUD-/Layout-/Brandwerte oder reale Zuschaueraktivität.

## Folgeauftrag: Game-Engine-Reconnect-Projektion und Quiz-Show-Reader-Audit

Stand: 2026-10-07. Ausgewählter konkreter Fall: bereits registriertes `game-engine:current-state`; keine neue Registryfreigabe und keine Änderung an Game-Engine-Producer oder Overlay.

### Game-Engine-Befund und Umsetzung

- `GameEnginePlugin.registerSocketEvents()` behandelt `game-engine:request-state` nur für autorisierte Admin-/Overlayrollen. Für eine aktive nichtinteraktive Session antwortet der Producer direkt dem anfragenden Socket mit `{hasActiveGame, gameType, sessionId, useUnified}`; bei leerer Session `{hasActiveGame:false}`. Der Incoming-Request und `game-engine:current-state` sind bereits registriert/öffentlich erlaubt.
- Der originale `overlay/unified.html`-Consumer liest im `current-state`-Handler ausschließlich `hasActiveGame`, `useUnified` und `gameType`; `sessionId` wird nicht verarbeitet. Der zentrale Projektor entfernt daher `sessionId` und unbekannte Felder, validiert erforderliche Zustandswerte und gibt für Idle nur `{hasActiveGame:false}` aus. Malformed aktive Zustände werden öffentlich zurückgehalten. Lokaler Socketadapter erhält weiterhin die komplette Producerpayload.
- GCCE HUD `show` wird in `HUDManager.broadcastElement()` mit dem vollständigen aktiven Element gesendet; der Originalconsumer `overlay-hud.html::showElement` rendert Element-ID, Inhalt, Stil und Zeitfelder. `remove` benötigt `id`, `rotator:update` übergibt die Rotator-Konfiguration an `startRotator`. In dieser Runde wurde dort kein nicht benötigtes konkretes Payloadfeld belegt; GCCE-Payload bleibt unverändert.

### Quiz-Show-Reconnect-Audit

- `broadcastGameState()` in `quiz-show/main.js` ist der einzige aktuelle In-Memory-Renderer-Statebuilder, den die Quellinventur gefunden hat. Er liest `gameState`/`config` und emittiert danach über `this.api.emit('quiz-show:state-update', state)`; als Funktion ist er nicht nebenwirkungsfrei, aber sein Payloadaufbau ist von DB-/Providerzugriffen trennbar.
- Der breite `GET /api/quiz-show/state` ruft explizit `checkSeasonAutomation()` auf und selektiert Katalogfragen samt korrektem Index, Leaderboards, Pakete, OpenAI-Konfigurationsstatus und Spielzustand. Er ist kein sicherer Hydrationspfad. `checkSeasonAutomation()` kann bei Saisonwechsel schreiben/emittieren.
- Minimalvorschlag (nicht umgesetzt): vorhandenen Stateaufbau aus `broadcastGameState()` in einen reinen `buildGameStatePayload()` auslagern; ausschließlich eingehend `quiz-show:get-public-state` in der Registry ergänzen; Handler autorisiert das anfragende Overlay und antwortet nur diesem Socket per `socket.emit('quiz-show:state-update', payload)`; Renderer fordert den Zustand auf Connect/Reconnect/pageshow an. Durch Wiederverwendung des vorhandenen Ausgangsevents bleiben Public-Projektion und Event-Allowlist unverändert. Negative CPU-Fixtures: nicht autorisierte Rolle, keine Broadcast-/API-Emit-/DB-/Provideraufrufe, keine Mutation von GameState/Config, safe idle payload, sowie Leckversuche für Antwortschlüssel, Fragekatalog, IDs, Map/Set und Adminfelder. Registry-Erweiterung bleibt eine CEO-Entscheidung.

### Dateien und Prüfung

- `app/modules/public-overlay-payload-projection.js`: zentrale Projection für `game-engine:current-state`.
- `app/test/game-engine-public-current-state-projection.test.js`: Producer-/Consumer-Quellvertrag, Payloadprojection, lokaler-vs.-Public-Adapter, Idle- und malformed-Fälle.
- Node v22.14.0, `--runInBand --no-cache`: 4 Suites / 152 Tests PASS (`game-engine-public-current-state-projection`, `public-overlay-payload-projection`, `public-overlay-socket-adapter`, `public-overlay-registry`). Beim ersten Lauf scheiterte nur ein zu einrückungssensitiver Textassert; auf whitespace-tolerante Prüfung umgestellt, Wiederholung vollständig PASS.
- `git diff --check` ist im Folgeschritt über die konkreten Dateien zu dokumentieren; der Gesamtcheckout enthält zahlreiche parallele Änderungen und zuvor protokollierte, sachfremde Whitespacewarnung.

### Status und Grenzen

- **Behoben und geprüft:** überflüssige interne Session-ID im öffentlichen Reconnect-Zustand entfernt; benötigte Felder des Originalconsumers bleiben, lokale Payload bleibt unverändert.
- **Teilweise geprüft:** Fixture prüft Producer-/Consumer-Quellvertrag und den echten zentralen Socket-Adapter, aber keinen laufenden GameEngine-Plugininstanz-/Socket.IO-Server-/Browser-/Tunnel-/OBS-Pfad.
- **Blockiert:** nichts für den ausgewählten Eventfall. Quiz-Show-Reconnect bleibt bis zur Entscheidung über den zusätzlichen eingehenden Request offen.
- **Nicht geprüft:** externe Tunnelverbindung, Live-Session, OBS, GCCE-HUD-Realrenderer und echter Quiz-Show-Reconnect.
- Keine Producer-/Renderer-/Registryänderungen, keine echten Zuschauer-/Rollen-/Guthabendaten, keine Liveaktionen, keine Veröffentlichung oder Push.

## Quiz-Show-Reconnect: Umsetzung nach CEO-Freigabe

Stand: 2026-10-07. Umsetzung gemäß expliziter CEO-Freigabe; Renderer bleibt im Overlaychat, meine Änderungen sind auf Quiz-Show-Pluginhandler, reinen Payloadbuilder, einzelne eingehende Registryzeile und CPU-Fixtures beschränkt.

- `buildGameStatePayload()` enthält unverändert den bisherigen von `broadcastGameState()` gesendeten Payloadaufbau. `broadcastGameState()` delegiert an den Builder und sendet weiterhin dasselbe Ereignis und denselben Shape lokal.
- `quiz-show:get-public-state` akzeptiert keinen Payload; ein Aufruf mit Argumenten wird ohne Antwort verworfen. Bei gültiger Anfrage berechnet der Handler nur den In-Memory-Payload und ruft `socket.emit('quiz-show:state-update', payload)` ausschließlich auf dem anfragenden Socket auf. Kein pluginweiter Broadcast, keine DB-/Season-/Provideraktion. Der bestehende `protectPublicSocket`-Wrapper führt für Public Quick-Tunnel-Sockets die bestehende zentrale Safe-Projection aus; lokale Sockets erhalten den Originalpayload.
- Die Registry erlaubt genau `quiz-show:get-public-state` zusätzlich als eingehendes Socketevent. Es wurden keine Quiz-GETs, Schreibpfade oder ausgehenden Events freigegeben. Die breite State-GET-Route blieb unverändert.
- Der Overlayowner hat `quiz_show_overlay.js` für connect/reconnect, BFCache-pageshow und bereits verbundene Sockets vor DOMContentLoaded angepasst. Finaler Renderer-/Lifecycle-Fixture prüft diese Requests sowie finalen pagehide-Cleanup; Rendererhunks stammen vom Overlayowner, nicht aus meinem Backendpatch.
- Regressionen prüfen: neue/nur eingehende Freigabe; requester-only Antwort; Public Safe-Projection ohne User-ID, Antwortschlüssel oder Mapping; vollständiger lokaler Payload; ungültiger Anfragepayload ohne Antwort; keine DB-Reads, Seasonautomation, API-Broadcasts oder Mutation an Spiel-/Configzustand.

### Dateien und Prüfung

- `app/plugins/quiz-show/main.js`
- `app/modules/public-overlay-registry.js`
- `app/test/quiz-show-public-reconnect.test.js`
- `app/test/quiz-show-public-projection.test.js` (bestehende Builder-Fixtures an extrahierten Methodenaufruf angepasst)
- Node v22.14.0, `--runInBand --no-cache`: 6 Suites / 188 Tests bestanden (`quiz-show-public-reconnect`, public projection, overlay lifecycle, Registry, public access und zentraler payload projector). JSDOM-Renderer-Lifecycle ist grün; neue Renderer-Requestintegration folgt dem Overlayworker.
- Kein Produktadapter, gemeinsamer Plugin-API-Vertrag, DB-Schema oder broad HTTP-Handler verändert. Keine echten Nutzer-/Rollen-/Guthabensdaten und keine Liveaktion.

### Status

- **Behoben und geprüft:** requester-only Backend-Reconnect über sicheres bestehendes Antwortevent; lokale Payloadsemantik unverändert; neue Berechtigung gilt nur für den read-only Request.
- **Teilweise geprüft:** Plugin-Handler plus Public-Socket-Projektor und Original-Eventprojektion sind CPU-fixturegeprüft. Keine echte Browser-/Socket.IO-/Public-Tunnel-/OBS-Runde.
- **Blockiert:** nichts auf Backend-/Registryseite.
- **Nicht geprüft:** reale Browser-/Socket.IO-/Public-Tunnel-/OBS-Reconnects und externe Netzwerkoberfläche. Der connect/reconnect/pageshow-Request ist durch den Overlay-Lifecycle-Fixture CPU-only geprüft.

## Read-only Inventur: Legacy EmojiRain-Zuordnungen

Stand: 2026-10-07. Quell-/Policyprüfung ohne Änderung an Registry, Pluginproducer, Overlayrenderer oder gespeicherten Mappingdateien.

### Befund und tatsächliche Semantik

- Pluginroute `GET /api/emoji-rain/user-mappings` liest `this.userMappingsPath` (plugin data `users.json`) und gibt `{success:true,mappings,stats:{totalMappings,uniqueEmojis}}` zurück. Die API-Dokumentation bezeichnet Schlüssel ausdrücklich als `user1`/`user2`; die lokale Konfigurationsoberfläche lässt manuell Benutzernamen eintragen, darstellen, filtern und löschen. Tatsächliche gespeicherte Nutzerdaten wurden nicht gelesen.
- Legacy `emoji-rain-engine.js` und OBS-Renderer `emoji-rain-obs-hud.js` laden diese Route beim Overlaystart. Bei Spawn-/Like-/Gift-/sonstigen Events verwenden sie den `username` für exakte oder case-insensitive Zuordnung und ersetzen damit das Emoji; `{{profilePicture}}` steuert Profilbilddarstellung. Die `stats`-Felder werden von beiden Renderern nicht gelesen. Die Namen sind daher echte personenbezogene Zuordnungsschlüssel, nicht bloße technische IDs.
- Dieselbe vollständige Map wird bei POST/import/delete durch `emoji-rain:user-mappings-update` ausgesendet. Dieses Ereignis ist in der öffentlichen Outgoing-Allowlist. Für die HTTP-Route gibt es keinen Pfadprojektor; die generische Credential-Redaktion bewahrt das synthetische `{mappings:{'synthetic-viewer':'🌟'},stats:{...}}` vollständig. Für das Socketevent liefert `projectPublicOverlayPayload()` derzeit `undefined`, wodurch `protectPublicSocket` es unverändert durchreicht. Die Route-GET ist erlaubt; der POST-Schreibpfad bleibt für den Public-Tunnel gesperrt.
- CPU-only Policyprobe mit ausschließlich synthetischen Daten ergab: `GET allowed=true`, `POST allowed=false`, `emoji-rain:user-mappings-update outgoing=true`, Eventprojektion `undefined`, Mapping und Stats bleiben nach generischer Redaction unverändert.

### Minimalverträge und Funktionsfolge (keine Änderung ausgeführt)

1. **Kleinste sofortige Privatsphärengrenze:** Public-GET projiziert `{success:true,mappings:{}}` ohne Stats; Public-`user-mappings-update` projiziert `{mappings:{}}`. Der bestehende Renderer akzeptiert eine leere Map und behält Standard-/Event-Emojis, aber personalisierte Emoji-/Profilbildzuordnung fällt auf öffentlichen Quick-Tunnel-Overlays weg. Lokale Admin-UI und lokale OBS-Overlays behalten vollständige Daten, weil nur die Public-Middleware/Socketprojektion betroffen wäre.
2. **Personalisierung öffentlich erhalten:** Mapping serverseitig beim Producer pro Spawn-/Eventnutzer auflösen und nur das effektive Renderfeld im jeweiligen Public-Event transportieren; niemals die gesamte Username-Map an anonyme Overlays senden. Das benötigt Producer-/Projektion-/Renderer-Vertragsänderungen und einen explizit geprüften Cache-/Aktualisierungsvertrag, ist also keine Minimaländerung.
3. Das nur aus `stats` bestehende Entfernen löst das Problem nicht: die Namen→Emoji-Tabelle bleibt die tatsächlich benötigte Consumerfunktion und wäre weiterhin offen. Ein öffentliches Abfrage-API pro Name wäre aufgelistet ebenfalls enumerierbar und wird nicht empfohlen.

### Status und offene Entscheidung

- **Behoben und geprüft:** keine Produktkorrektur (diese Runde bewusst read-only); der Leak wurde in Quell-/Policyvertrag und mit synthetischer CPU-Probe bestätigt.
- **Teilweise geprüft:** aktuelle Pluginroute, Admin-UI, beide Legacyrenderer, Event-Producer, zentrale Public-Policy/Projektor und Registry wurden quellenbasiert verglichen. Synthetic Policyprobe deckt nur den zentralen Middleware-/Redactionvertrag ab, keine laufende App.
- **Blockiert:** sichere Änderung hängt an CEO-Entscheidung: öffentliche Mapping-Personalisierung abschalten (Option 1) oder separaten serverseitig aufgelösten Spawn-Contract (Option 2) priorisieren. Keine Änderung an realen Mappingdaten.
- **Nicht geprüft:** tatsächlicher gespeicherter Mappinginhalt, echter Browser/OBS, Tunnel-/Socket-Livepfad.
- **Geänderte Produktdateien:** keine. Nur dieser Koordinationsbericht wurde ergänzt.

## EmojiRain-Mapping-Schutz: CEO-Option A umgesetzt

Stand: 2026-10-07. Nach der vorherigen Read-only-Inventur hat der CEO die engste Public-Privatsphärengrenze freigegeben. Es wurden keine Renderer- oder EmojiRain-Producerdateien geändert.

- Public `GET /api/emoji-rain/user-mappings` projiziert eine gültige Producerantwort auf `{success:true,mappings:{}}`; Statistiken und alle Namen/Zuordnungswerte entfallen. Lokale GET-Antworten bleiben beim existierenden Pluginhandler vollständig.
- Public `emoji-rain:user-mappings-update` projiziert auf `{mappings:{}}`; Local Socket erhält die unveränderte Producerpayload. Die bestehende Outgoing-Allowlist und das POST-Deny-by-default wurden nicht geändert.
- Synthetische In-Process-Fixture ruft die echte Plugin-GET- und POST-Update-Routen mit ausschließlich temporären Fake-Mappingdaten auf. Beide originalen JavaScriptrenderer laden jeweils sowohl die Public-Leermap als auch die Local-Map: im Publicfall bleiben Spawn-Emojis beim Standardemoji und ein Profilbildmapping wird nicht angewendet; im Localfall werden benutzerdefiniertes Emoji und Profilbildmapping weiter angewendet. Es wurde keine gespeicherte Benutzer-`users.json` gelesen oder geändert.
- Malformed GET-Mappingantworten werden mit neutralem Fehlerstatus geschlossen; malformed Updatepayloads werden durch den Socket-Guard zurückgehalten. Queryparameter ändern die leere Public-Map nicht und bieten keinen Lookup-/Enumerationpfad.

### Dateien und Prüfung

- `app/modules/public-overlay-access.js`
- `app/modules/public-overlay-payload-projection.js`
- `app/test/emoji-rain-public-user-mappings.test.js`
- `docs/coordination/permissions-events.md`
- Node v22.14.0 mit `--runInBand --no-cache`: 7 Suites / 224 Tests bestanden (`emoji-rain-public-user-mappings`, Public Access/Registry/Projection, EmojiRain public-state, Engine Coordinate und OBS HUD Opacity).
- `git diff --check` für die geänderten zentralen Module und Statusdatei; Fixture-Datei separat auf Whitespace prüfen.

### Funktionsfolge und Status

- **Behoben und geprüft:** Username→Emoji-/Profilbildmap und Stats werden nicht mehr an anonyme Public-Tunnel-Clients weitergegeben, weder beim initialen GET noch bei Adminänderungen. Lokale Admin-/Overlayfunktionen bleiben unverändert.
- **Bewusste Einschränkung:** öffentliche Legacy Overlays verlieren die personalisierten Emojis/Profile; Standard-/Eventemoji bleibt funktional. Es wird keine gleichwertige serverseitige Personalisierung behauptet; Option B wurde nicht begonnen.
- **Teilweise geprüft:** echte Producer-Routen, Middleware, Socket-Guard und beide Originalrenderer laufen in synthetischen CPU-Fixtures. Kein Serverprozess, Browser, OBS oder öffentlicher Tunnel.
- **Blockiert:** nichts zum freigegebenen Minimalfix. Öffentliche Personalisierung kann nur mit separat reviewed serverseitigem Spawnvertrag zurückkehren.
- **Nicht geprüft:** externe Tunnel-/Liveanzeige und tatsächlicher Mappingbestand.

## Public-Matrix-Lücke als nächster Kandidat: TopTier-Benachrichtigungen (read-only)

Stand: 2026-10-07. Nach dem EmojiRain-Fix wurden die noch nicht zentral projizierten TopTier-Outgoing-Events quellenbasiert geprüft; keine TopTier-Änderung in dieser Runde.

- `ScoreEngine._detectAndEmitChanges()` emittiert `toptier:rank-change` mit `board`, `username`, `nickname`, `oldRank`, `newRank`, `score`; der öffentliche `assets/overlay.js`-Consumer verwendet nur `username`, `oldRank`, `newRank` für die Rangpfeilanimation. `board`, Nickname und Score werden nicht gelesen.
- Derselbe Producer emittiert `toptier:new-leader` mit `board`, `username`, `nickname`, `score`; der Originaloverlay-Handler verwendet nur `username` für den Leader-Puls. Die übrigen Felder werden nicht gelesen.
- `DecayScheduler` emittiert `toptier:decay` mit `board` und allen `affectedUsers`; Consumer iteriert alle Nutzernamen, um vorhandene TopTier-DOM-Zeilen zu animieren. Der Array kann aus der gesamten durch Decay veränderten Rangliste stammen, während die Projektion für den Boardstand nur die Top 10 ausgibt. Die Projektion leitet das Event derzeit nicht ab; ohne Case kommt es auf erlaubten Public-Outgoing-Sockets unverändert an.
- Alle drei Events sind in `OUTGOING_SOCKET_EVENTS` erlaubt und haben im zentralen Projektor derzeit keinen spezifischen Case; im vorherigen statischen Check der 315 registrierten Eventnamen erscheinen sie als unprojiziert. `toptier:update` hat bereits einen separaten sicheren Projektor für Boardeinträge/sessionId.
- **Konkrete Projektionsoptionen:** `rank-change` auf Username + alte/neue Rangzahl; `new-leader` auf Username; `decay` begrenzte, eindeutige Username-Liste mit validierten Zeichen-/Längenbounds und ohne Boardfeld. Der Decay-Consumer animiert nur Namen, die ohnehin gerade im Overlay-DOM vorhanden sind; die Inputliste aus dem vollen Board kann derzeit darüber hinausreichen.
- **Status:** Quellbefund bestätigt, nichts verändert oder als implementiert getestet. Nächste Freigabe/Umsetzung sollte den CEO priorisieren; keine Registryerweiterung erforderlich, da die drei Events bereits erlaubt sind.

## TopTier-Benachrichtigungen: zentrale Projektionen nach CEO-Auftrag

Stand: 2026-10-07. Die drei vorhandenen Outgoing-Events wurden nach explizitem CEO-Auftrag anhand der tatsächlichen Produzenten und des Originalpublicrenderers projiziert. Die vorherigen TopTier-Board-/Session-ID-Fixes wurden nicht geändert; fremde Rendererhunks blieben unangetastet.

### Producer-/Consumersemantik

- `ScoreEngine._detectAndEmitChanges()` erzeugt Rangwechsel mit `board`, `username`, `nickname`, `oldRank`, `newRank`, `score`. `assets/overlay.js` ruft für `toptier:rank-change` nur `markRankChange(username, oldRank, newRank)` auf. Public erhält daher exakt diese drei Felder.
- Derselbe Producer erzeugt Leaderwechsel mit `board`, `username`, `nickname`, `score`; der Originaloverlay-Consumer ruft ausschließlich `markNewLeader(username)` auf. Public erhält nur `username`.
- `DecayScheduler._tick()` erzeugt `toptier:decay` nach tatsächlicher Scoreänderung und sendet `board` plus alle betroffenen Nutzernamen. Der Originaloverlay-Consumer iteriert `affectedUsers` und nutzt Namen ausschließlich zur Animation bereits gerenderter Scorezeilen; das Event ist kein Refreshsignal. Der unmittelbar folgende `toptier:update` übernimmt den Boardrefresh. Public erhält keine Board-/Session-/Producerdaten und höchstens zehn eindeutige Namen, passend zu den zehn Zeilen des Decay-Refreshs. Der Originalrenderer hat standardmäßig fünf Zeilen, kann bis zehn anzeigen; Tests belegen sichtbare Animation an den gezeigten Zeilen.
- Keine Änderung der Producer oder Renderer: lokale Eventpayloads bleiben vollständig und semantisch unverändert. Alle drei Events waren bereits in der Outgoing-Allowlist; es gab keine Registryerweiterung.

### Umsetzung und Prüfung

- `app/modules/public-overlay-payload-projection.js`: neue typisierte, fail-closed Projektoren für Rangwechsel, Leaderwechsel und Decay; Whitelist-Ausgabe ohne interne Zusatzfelder. Decay-Eingaben werden validiert, dedupliziert und auf zehn Namen begrenzt.
- `app/test/toptier-public-notification-projection.test.js`: reale `ScoreEngine`- und `DecayScheduler`-Produzenten mit synthetischen In-Memory-Daten; lokaler Originalpayload gegenüber Public-Socketprojektion; echter Offline-Originaloverlay-Consumer prüft Rang-/Leader-/Decayanimationen; fehlerhafte Payloads werden Public-seitig zurückgehalten.
- Gezielte Prüfung mit Node/Jest `--runInBand --no-cache`: 4 Suites / 29 Tests bestanden (`toptier-public-notification-projection`, `public-overlay-payload-projection`, `toptier-public-session-boundary`, `plugins/toptier/test/obs-toptier-fixtures`).
- Die Regression deckt Producersemantik und den originalen Offline-Renderer ab, nicht einen laufenden Server, Browser, Tunnel oder OBS.

### Status, Risiken und offene Entscheidungen

- **Behoben und geprüft:** unbekannte Producerfelder und unnötige Board-/Score-/Nicknamefelder der beiden Benachrichtigungen werden Public nicht mehr weitergereicht; Local bleibt unverändert. Decay gibt nur das vom Originalconsumer verwendete Animationssignal weiter, mit harter Obergrenze von zehn eindeutigen Namen.
- **Teilweise geprüft:** isolierte Producer-, Public-Guard- und echte Originalrenderer-Fixtures sind grün; keine Live-/Serverintegration.
- **Blockiert:** nichts im freigegebenen Scope.
- **Nicht geprüft:** Browser/Tunnel/OBS oder tatsächliches Verhalten in einer aktiven Live-Session.
- **Verbleibendes Risiko:** Wenn ein Public-Overlay mit einer benutzerdefinierten `count`-Einstellung mehr als zehn Zeilen vor dem Decay-Refresh rendert, animieren darüber hinausliegende geänderte Zeilen nicht. Der Decay-Refresh selbst enthält höchstens zehn Einträge; die Beschränkung verhindert die bisherige Ausleitung der gesamten eventuell deutlich größeren Betroffenenliste.
- Keine Registry-/Adapter-/Shared-API-Änderung, keine realen Zuschauer-/Rollen-/Guthabendaten, keine Liveaktion, keine Veröffentlichung oder Push.

## GCCE-Public-HUD: Read-only Befund vor Umsetzung

Stand: 2026-10-07. Nach TopTier wurde GCCE anhand der aktuellen Registry, der echten Producer und des ausgelieferten `overlay-hud.html` inventarisiert. Es wurden keine GCCE-Produktdateien geändert.

- Die bereits registrierten Outgoing-Events `gcce:hud:show`, `gcce:hud:remove`, `gcce:hud:clear` und `gcce:hud:rotator:update` haben keinen zentralen Payloadprojektor. Es ist keine neue Registryfreigabe erforderlich.
- `HUDManager.createTextElement()`, `createImageElement()` und `createMediaElement()` senden `gcce:hud:show` mit einer Elementpayload. Originalrenderer liest `id`, `type`, `content`, `duration`, `style` und bei Media `mediaType`. Er liest nicht `username`, `userId`, `timestamp`, `expiresAt` oder `label`. Minimalprojektion könnte diese Kontext-/Lifecyclefelder entfernen; `style` und Elementtypen brauchen Bounds/Allowlist.
- `gcce:hud:remove` braucht im Renderer nur `id`. `gcce:hud:clear` ist ein leeres Signal und der Renderer ignoriert Nutzdaten. Beide Verträge sind einfache Kandidaten für typisierte Minimalprojektionen.
- `gcce:hud:rotator:update` konsumiert `enabled`, `intervalSeconds` und je Entry Anzeige-/Layoutfelder. Rotator-Entries können `mediaUrl` oder `giftImage` als HTTP(S)-URL aus Nutzerkonfiguration enthalten. Die gleiche bestehende Read-Only-Registryfläche `/api/gcce/hud/rotator` gibt den Rotator initial per GET aus und benutzt derzeit nur allgemeine Credentialredaktion. Ein ausschließliches Socketevent-Schema ließe daher den initialen GET-Bypass offen.
- **Offene Policyentscheidung vor Umsetzung:** sollen Public Quick-Tunnel-Overlays die konfigurierten externen Medien-URLs weiter laden dürfen, oder sollen nur lokale App-Medien/HTTPS-Quellen zugelassen beziehungsweise Medienfelder neutralisiert werden? Ein zentraler GET-/Socket-Fix muss denselben URL- und Entryvertrag verwenden, während lokale Admin-/Overlaypayloads unverändert bleiben.
- **Status:** Der damals read-only festgehaltene Befund wurde anschließend nach der CEO-Policyentscheidung umgesetzt; Details und Regressionsevidenz folgen im nächsten Abschnitt.

## GCCE-Public-HUD: zentrale Projektionen umgesetzt

Stand: 2026-10-07. Umsetzung gemäß explizitem CEO-Auftrag. Es wurden keine GCCE-Producer-, Renderer- oder Registrydateien verändert.

### Public-Vertrag und Mediengrenze

- `gcce:hud:show` gibt nur `id`, `type`, `content`, `duration`, die typgeprüften Renderer-Stylefelder und bei `media` das `mediaType` aus. Nicht vom Originalconsumer verwendete `username`, `userId`, `timestamp`, `expiresAt` und `label` entfallen. Ungültige Typen, IDs, Bounds oder Stylepayloads werden Public fail-closed zurückgehalten.
- `HUDManager` erzeugt `text-N`/`image-N`/`media-N` aus einem Prozess-internen Zähler und hält Elemente in einer in-memory `Map`; für diese IDs gibt es keinen persistierten DB-Pfad. Die Show-ID bleibt deshalb als ephemeres Renderer-/Remove-Korrelationsmerkmal erhalten. Es wurde keine Viewer-Tracking-Map eingeführt.
- `gcce:hud:remove` projiziert nur dieselbe ID. `gcce:hud:clear` trägt bei der direkten Producerform keine Payload; diese payloadlose Form bleibt payloadlos. Wenn ein Objektpayload vorliegt, wird es auf `{}` normalisiert, passend zum Originalconsumer, der Nutzdaten ignoriert.
- Rotator-GET `/api/gcce/hud/rotator` und Socket-`gcce:hud:rotator:update` verwenden dieselbe typisierte Projektion. Die initiale GET-Antwort umgeht die Socketprojektion daher nicht. Es werden nur vom Renderer konsumierte Anzeige-/Layoutfelder ausgegeben; Entry-IDs, Gift-IDs, MIME-/Poster-/Konfigurationsdaten entfallen.
- Medienfelder werden nur als root-relative Pfade behalten, die die bestehende HTTP-GET-Registry bereits erlaubt und deren Pfad im registrierten `/uploads/animations/...`-Assetmuster liegt. Externe HTTP(S)-URLs, Credentials, protocol-relative, `data:`, `file:`, Query-/Fragmentpfade, Traversal und der lokale GCCE-Uploadpfad `/api/gcce/hud/media/:filename` werden neutralisiert. Der GCCE-Uploadpfad ist nicht in der Public-Registry. Bei Rotator-Entries bleibt der Originalrenderer mit Icon-Fallback und Text nutzbar; direkte HUD-Bild-/Mediaevents mit nicht freigegebenem Pfad werden Public verworfen. Local bleibt die vollständige Originalpayload einschließlich Medien-URLs erhalten.

### Geänderte Dateien und Regressionen

- `app/modules/public-overlay-payload-projection.js`: typed Show/Remove/Clear/Rotator-Projektionen plus registrierte Assetpfadprüfung und GET-Response-Projektion.
- `app/modules/public-overlay-access.js`: path-specific Projektion für den bereits registrierten Rotator-GET.
- `app/test/gcce-public-hud-projection.test.js`: echte `HUDManager`-Show-/Remove-/Clear-Produzenten und GCCE-Rotatorroute mit synthetischem Speicher; Public/Local-Payloadvergleich; Public-GET-Bypass, POST-Deny und nichtregistrierter Medienpfad; echte `overlay-hud.html`-Consumer für Show/Cleanup und Rotator-Iconfallback; unsichere URLformen und malformed payloads.
- Gezielt mit Node/Jest `--runInBand --no-cache`: 8 Suites / 217 Tests bestanden (`gcce-public-hud-projection`, Public Access/Projection/Registry/Adapter/Event-contract, TopTier notification projection und TopTier session boundary). `node --check` für geänderte JS-Dateien sowie Whitespaceprüfung bestanden.

### Status, Funktionseinschränkung und Grenzen

- **Behoben und geprüft:** GCCE-Public-HUD enthält keine ungenutzten Benutzer-/Lifecyclefelder; Rotator-GET und Socketevents folgen demselben sicheren Projektionvertrag; private Plugin-Medienpfade und alle externen/unsafe URLs gelangen nicht in Public-Payloads; Local-Verhalten bleibt original.
- **Bewusste Public-Einschränkung:** Direkte Bild-/Media-HUD-Elemente mit nicht bereits registrierten lokalen Assetpfaden werden Public nicht angezeigt. Rotator-Medien ohne erlaubten lokalen Pfad zeigen den Original-Fallback (Ordner-/Geschenkicon) samt Titel/Info. Es wird keine externe Mediafunktionalität für Public behauptet.
- **Teilweise geprüft:** echte Producer-/GET-Routen, Public-HTTP-/Socket-Middleware und Originalrenderer laufen in isolierten CPU-Fixtures; kein gestarteter Server.
- **Blockiert:** nichts im freigegebenen Umfang.
- **Nicht geprüft:** echter Browser, Serverprozess, Quick-Tunnel, OBS oder Live-Session.
- Keine Registry-/Adapter-/GCCE-Producer-/Renderer-/DB-Änderung, keine realen Zuschauerdaten oder Liveaktionen, kein Push/Release.

## Stream-Monsters-Coverageabschluss nach CEO-Auftrag

Stand: 2026-10-07. Quellinventur der gesamten `CRITICAL_EVENT_TYPES`-Liste (21 Typen) plus Service-/Consumer-Fixtures. Der vorher generisch behandelte Season-Rangwechsel ist jetzt als belegte Minimalprojektion typisiert. Es wurden keine Producer, Renderer, Registry-, Adapter-, Outbox-, Sequenz- oder Deduplogik verändert.

### Inventur der kritischen Ereignisse

| Ereignistyp(en) | Projektion | Producer und originaler Consumer | Identität / Outbox / Replay | Verbleibender Befund |
|---|---|---|---|---|
| `egg_spawned` | dediziert: Displayname, Egg-Allowlist, Hint | `GameEngine.spawnEgg`; Arcade-Toast nutzt Eggelement/Bild/Variante und Hint | stabile opaque IDs aus Egg-ID; kritisch persistiert; Snapshot-Replay filtert dieses Event aus | rohe Gift-/Provider-/DB-Felder entfernt; kein zusätzlicher Fix offen |
| `egg_ready` | dediziert: Displayname, Egg-Allowlist, Stage-Allowlist, Hint | `GameEngine.markReadyEggs`; Toast nutzt Element/Viewer/Hint, Stage-View nutzt `eggStage` | IDs aus ursprünglichem Egg; kritisch persistiert; Eventfluss unverändert | rohe Eggzeile/User-ID entfernt; neu fixturegeprüft |
| `egg_landed`, `egg_stage_updated`, `free_egg_reserved`, `free_egg_public`, `owned_ready_egg_public`, `unhatched_egg_steal_public`, `unhatched_egg_steal_claimed`, `egg_stage_removed` | generisch `deepProject` auf bereits vom `EggStageProjector` erzeugtem Stageobjekt | GameEngine/Free-Egg-/Rescue-/Steal-Service; Original-Stage-View benötigt Stage-ID, Status, Element/Bild/Variante; Rescue benötigt `rescueId` zur Rescue-Erkennung, Steal nutzt `offerType`/Quellname/Countdown | vom Stage-Producer gelieferte event-/correlation IDs; kritisch persistiert und über bestehende Snapshot-/Outboxpfade behandelt; keine Semantik geändert | Producer liefert hier bereits strukturierte Projektorstages, keine rohe DB-Ei-Zeile. `rescueId`, `remainingMs` und Steal-Quellname sind teils tatsächlicher Consumervertrag; nicht entfernen. Keine belegte ungenutzte Geheimnis-/Providerpayload in den geprüften Emittern |
| `free_egg_claimed` | dediziert: `eggStage` plus `removedEggStage` | Free-Egg-Service; Stage-View braucht neue claimed Stage und `removedEggStage.visualId` zum Entfernen des Angebots | vorhandene stabile Stage-Identitäten; kritischer Store-/Recent-Payload; keine ID-/Replayänderung | private Claimant-Ei-/User-/Offerfelder entfallen; beide Consumerstages bleiben |
| `owned_ready_egg_claimed` | dediziert: nur `eggStage` | Rescue-Service emittiert zusätzlich `rescueId`; Claim-Consumer benötigt Stage zum Entfernen/Anzeigen | bestehende Stage-Identität und kritischer Persistenzpfad unverändert | interne Rescue-Zeilen-ID entfernt; Stage erhalten; fixturegeprüft |
| `hatch_started` | dediziert: Displayname, Egg-Allowlist, optional `autoHatch` | GameEngine; Original-Toast und Arena nutzen Viewer/Ei-Element; Stage-View nutzt Lifecycle | stabile Egg-Identität; kritisch persistiert; keine Replayänderung | rohes DB-Ei/Slot/User und externe Bild-URL entfernt |
| `egg_hatched`, `monster_discovered`, `monster_evolved` | dediziert: bestehende Egg-/Monster-/Evolution-Whitelists | GameEngine/CollectionService; Originalcards verwenden die projizierten Monster-/Evolutionfelder | bestehende opaque lifecycle/fusion IDs und kritische Persistenz unverändert | keine Änderung in diesem Abschluss |
| `mastery_unlocked`, `stream_mission_completed`, `achievement_unlocked` | dediziert: bekannte Bonus-/Mission-/Achievement-Keys und jeweils nötiger Anzeigename | CollectionService/ProgressionService; Originalconsumer liest Unlock, `mission_key` bzw. Achievement-Key plus sicheren Displaynamen | Mastery/Mission/Achievement-Identitäten werden vor Projektion errechnet; kritisch gespeichert wo als kritisch klassifiziert; Quest-Replay nicht berührt | echte SQLite-Service-Fixtures, Unbekannt-Key-Fallback und Live-/Persistenzgleichheit geprüft |
| `battle_completed` | dediziert: Matchabschluss-/Monster-/Ratings-/Combatreport-Vertrag | Battle-Producer; Original-Arena konsumiert Abschluss, Gewinner, Ratings und geprüfte Kampfdetails | bestehende Matchsequenz, Outbox, Dedup und Replay unverändert | außerhalb der Änderungen; keine Änderung an Battle-Delivery |
| `season_rank_changed` | dediziert: sicherer Displayname, bekannter `after`-Rang, `score.points` | `ProgressionService.addSeasonPoints()` liefert `before`, `after`, und SQLite-Scorezeile. Originaloverlay zeigt Rang aus `after` und Punktzahl aus `score.points`; Arena-Director behandelt diesen Eventtyp ausdrücklich als Rangaufstieg | `identifiers()` rechnet vor Projektion stabile IDs aus Season-ID, User-ID und resultierendem Rang; kritischer Persistenz-/Recent-/Outboxpfad unverändert | Saison-/User-/Updatezeit und Cosmetic-DB-Felder (`title`, `badge`, `frame`) werden nicht vom Consumer benötigt und entfallen. Negative unbekannte-Rang-Canary schließt Fachpayload fail-closed |

### Zusätzliche typisierte Nicht-Outbox-Contracts

- `quest_completed` ist dediziert auf bekannte `quest_key`-Werte projiziert, nachdem der echte `ProgressionService.incrementQuest()` auf SQLite `:memory:` ausgeführt wurde. Toast liest den Quest-Key zur lokalen Übersetzung. Producerinterne User-/Period-/Target-/Progress-/Completed-/Rewarddaten entfallen. Dieses Ereignis ist nicht in `CRITICAL_EVENT_TYPES`; sein vorhandener Replay-/Deliveryvertrag wurde nicht verändert und es wird keine Persistenzgarantie behauptet.
- Weitere bereits dedizierte Nicht-Outbox-Projektoren wie Battle-Prompt-/Choiceevents und `chat_result` blieben unverändert. Ihre bestehenden Consumerfelder, Grenzen und Deliverypfade wurden nicht erweitert.

### Fixtures und Abschlussprüfung

- Mission: tatsächlicher `CollectionService.getStreamMission()`-Schlüssel wird nach `completeMission()` aus dem vom Service ausgelösten Plugin-Event geprüft; keine fest verdrahtete zufällige Missionserwartung. Event enthält den bekannten `mission_key`, und derselbe projizierte Inhalt steht im Live-Emit und im gespeicherten Recent-Event. Unbekannte Missionskeys ergeben leeren Fachpayload, die vorab berechneten opaken IDs bleiben.
- Achievement: tatsächlicher `ProgressionService.unlock()` in SQLite `:memory:`; Originalcard-Quellvertrag geprüft; sicherer Anzeigename plus bekannter Achievement-Key; User-/DB-/Providerfelder fehlen. Live-Emit und gespeicherter Recent-Payload sind identisch.
- Quest: tatsächlicher `ProgressionService.incrementQuest()` in SQLite `:memory:`; nur der bekannte Quest-Key wird öffentlich. Da es kein kritisches Outboxereignis ist, wird keine Persistenzgleichheit behauptet.
- Neue `egg_ready`-/`owned_ready_egg_claimed`-Fixture prüft den Stage- und Toastconsumervertrag, entfernte private Ei-/Rescue-Zeilenwerte, Live-Emit sowie den gespeicherten kritischen Recent-Payload.
- Season Rank: tatsächlicher `ProgressionService.addSeasonPoints()` auf SQLite `:memory:` erzeugt Rangwechsel Bronze→Silver→Gold. Source-Fixture belegt `after` und `score.points` als Overlayfelder; rohe `user_id`, `season_id`, `updated_at_ms` sowie Cosmetic-DB-Felder fehlen. Livepayload == persistierter Recent-Payload, identische Wiederholung wird vom vorhandenen kritischen Append unterdrückt, nächste Rangstufe hat neue Event-ID bei derselben Korrelations-ID. Unbekannter Rang liefert keine Fachfelder.
- Coverage-Guard: die 21 kritischen Typen müssen exakt in die 13 explizit dedizierten Fälle oder die 8 explizit reviewten Stagefälle fallen. Für jeden dedizierten Typ wird die Projektorbranch geprüft; für jeden generischen Stagetyp prüft der Test den tatsächlichen Producerpfad mit `eggStage` und den originalen Stage-Consumer. Der Guard akzeptiert keine neu hinzukommenden unklassifizierten kritischen Typen.
- Finaler begrenzter Lauf mit kanonischem Node `22.14.0`: `cd app; ..\runtime\node\node.exe node_modules\jest\bin\jest.js --runInBand --no-cache --detectOpenHandles --runTestsByPath test\streammonsters-public-events-v15.test.js test\streammonsters-overlay.test.js test\streammonsters-egg-overlay-state-reliability.test.js test\streammonsters-collection-layer.test.js test\streammonsters-lifecycle-atomicity.test.js test\streammonsters-overlay-critical-queue-v15.test.js test\streammonsters-creator-retention-v6.test.js` — 7 Suites / 143 Tests bestanden. Keine Vollsuite, kein Browser-/Server-/OBS-/Tunnel-/Liveclaim.
- Geänderte Produktdatei: `app/plugins/stream-monsters/backend/streammonsters/public-event-projector.js`. Geänderte Regression: `app/test/streammonsters-public-events-v15.test.js`. Bericht: `docs/coordination/permissions-events.md`. `node --check` für beide JS-Dateien und `git diff --check` bestanden.
- Finaler gemeinsamer Node-22.14.0-Lauf für beide Aufträge: die oben genannten sieben Stream-Monsters-Suites plus WebGPU-Weather/Public-Overlay (sechs Suites), zusammen **13 Suites / 234 Tests bestanden**, ohne Snapshotfehler. Exakter Jest-Befehl und alle Testpfade stehen im CEO-Rapport. Keine Fullsuite.
- SHA-256 nach beiden Folgeaufträgen: `public-overlay-payload-projection.js` `2728DE3E4DD7276492DEF6A49C9208D0D90028F9EC8402EFDA3739E46752A583`; `public-event-projector.js` `EA3FCE18AF1721A1738E8B2D7F830A330D2BA3655431C3032CBB52245C431531`; `streammonsters-public-events-v15.test.js` `0683C55020BC41BCD91A90DEB56458EB1B90A207D71FA65C742C0A76CDDB73C4`; `webgpu-weather-public-projection.test.js` `73E96FD299AE04F081D95CC35F8E1861F9A91186EDC63E0BB9784BD1D39C0273`; dieser Bericht `C5A5EC5FB3C67508B229A02FED59052930F88DBE658134C72D299C4B2A70DF6C`.

### Status

- **Behoben und geprüft:** `egg_spawned`, `hatch_started`, `egg_ready`, `free_egg_claimed`, `owned_ready_egg_claimed`, `mastery_unlocked`, `stream_mission_completed`, `achievement_unlocked`, `quest_completed` und `season_rank_changed` folgen den belegten Minimalverträgen. Der vorhandene Plugin-Emitter projiziert vor Socketemit und kritischer Persistenz, sodass beide denselben Payload nutzen; deren Delivery-/Replaysemantik blieb unverändert.
- **Teilweise geprüft:** 21 kritische Typen quellenbasiert inventarisiert; 7 gezielte Suites/143 Tests decken Projektionen, den Coverage-Guard, Servicefixtures und Originaloverlay-Verträge ab. Kein laufender Server und keine echte Socket-/OBS-/Tunnelintegration.
- **Blockiert:** nichts im freigegebenen Auftrag.
- **Nicht geprüft:** vollständige Jest-Suite, echte Live-Session, Browser-/OBS-/Tunnelverhalten und tatsächliche Zuschauer-/Guthabensituation.
- Keine Änderung an `Bugstofix.md`, echten Daten, Guthaben, Rollen, TikTok-Adapter, Registry, Producer/Renderer, Veröffentlichung oder Push.

## QuizShow-Orphanroute und Round-Leaderboard-Plan; nächste Matrixprojektion

Stand: 2026-10-07. CEO-Folgeauftrag: nur die exakt verwaiste HTTP-Regel für `/api/quiz-show/leaderboard` entfernen, den weiterhin defekten Overlaybutton nicht als repariert darstellen und vor jeder neuen Producer-/Registry-API einen read-only Funktionsplan liefern. Anschließend den nächsten belegten Public-Matrix-Payloadfehler ohne neue Registryfreigabe schließen.

### QuizShow-Orphanroute

- `quiz_show_overlay.js::showCurrentGameLeaderboard()` ruft `GET /api/quiz-show/leaderboard?type=round` auf und erwartet `data.leaderboard`, `username` und `points`. In `quiz-show/main.js` existiert keine Route mit diesem Pfad. Vorhanden sind Season-IDspezifische GETs sowie getrennte Reset-/Import-/Export-Routen. Die Public-Registryregel war daher verwaist.
- Die genehmigte exakte GET/HEAD-Regel wurde entfernt. Die künstliche Routefixture samt Projektionstest für diese nie produzierte Antwort wurde entfernt; die ausschließlich dafür verwendete zentrale HTTP-Projektion wurde entfernt. Die QuizShow Socket-Events und ihre vorhandenen Payloadprojektionen blieben unberührt.
- Regression: Registry verweigert GET und HEAD, QuickTunnel antwortet auf die Button-URL mit neutralem 404; QuizShow-Test deckt weiterhin die tatsächlich registrierten HTTP-Verträge ab.
- Der Overlaybutton ist **weiterhin kaputt** und wird hier nicht als behoben behauptet. Seine Consumerfunktion bleibt unangetastet.

### Read-only Round-Leaderboard-Funktionsplan (keine Umsetzung)

| Producer-/Consumerfunktion | verlangtes Ergebnis | In-memory / read-only Quelle | Mutationsgrenze |
|---|---|---|---|
| Overlay-Consumer `handleShowLeaderboard(data)` | `leaderboard: [{username, points}]`, `displayType: 'round'`, `animationStyle: 'fade'`; Rang wird aus Arrayposition erzeugt | Consumer benötigt keine DB-IDs, `rank`, Saisonmetadaten oder Profilfelder | Bestehendes `quiz-show:show-leaderboard` Event ist bereits registriert und projiziert; eine Umsetzung könnte vorhandene Eventoberfläche weiterverwenden, benötigt aber separate Freigabe/Review für den Aufrufpfad |
| Derzeitiger Klickpfad `showCurrentGameLeaderboard()` | round rows | aktuelle `gameState.currentQuestion` und `gameState.answers` liegen in-memory; für jede Antwort ist gegen die aktuelle richtige Antwort zu prüfen, anschließend chronologisch ordnen und die bestehende Punkteverteilung (`pointsFirstCorrect`, `pointsOtherCorrect`) abbilden | `calculateResults()` **nicht** als Leser nutzen: die Funktion vergibt beim ersten Aufruf Punkte, ruft `addPoints`/`applyAnswerProgress` auf und setzt `pointsAwardedForRound`. `hasLeaderboardData('round')` ruft ebenfalls diese mutierende Funktion. Eine reine Ableitung muss die Validierung/Antwortvergleichssemantik einzeln prüfen oder aus einer bereits gespeicherten, abgeschlossenen Rundenresultatstruktur lesen. |
| Season-Leaderboard | nicht Teil des aktuellen Buttons (`type=round`) | bestehender `GET /api/quiz-show/seasons/:id/leaderboard` fragt SQLite; weitere bestehende Flows lesen aktive Season und sortieren deren Rangliste | Season-Automation und Season-GET weder als Ersatz missbrauchen noch für Public freigeben |

**Entscheidung vor Implementierung:** Den aktuellen Klickpfad als in-memory Round-Snapshot neu ableiten oder aus bereits gespeicherten Round-Ergebnissen speisen. Erst danach kann entschieden werden, ob der vorhandene Socketevent bereits genügt. Bis dahin keine neue Route, Registryregel oder `calculateResults()`-Wiederverwendung.

### AnimazingPal-Stream-Assistant-Status: nächste belegte Matrixlücke

- Bereits registrierter GET `/api/animazingpal/live-host/stream-assistant/status` liefert Pluginstatus samt Runtime-Diagnostics, Evententscheidungen, Zeitstempeln und Analyticsmetadaten. Der originale HUD-Consumer liest ausschließlich `config.enabled/muted`, `analytics.processedEvents/respondedEvents/dedupedEvents`, deren Diagnostics-Zählerfallback sowie `events[0]` oder `diagnostics.lastEventResult` mit je `eventType/reason`.
- Der existierende GET wurde weder neu registriert noch am Pluginproducer oder HUD geändert. Die zentrale Public-HTTP-Antwort wird nun auf diese HUD-Felder begrenzt; malformed Zähler/Anzeigezeilen werden fail-closed verworfen. Localhost erhält die unveränderte Pluginantwort.
- Die Security-Matrix enthält Canaries für interne Runtime-, Session-, Evententscheidungs- und Konfigurationsfelder. Ein fokussierter Producer-Fixture-Aufruf nutzt die echte `getStreamAssistantStatus()`-Methode mit ersetzten Runtimereadern und vergleicht Public- und Localantworten.

### Änderung und Verifikation

- Betroffene Dateien: `app/modules/public-overlay-registry.js`, `app/modules/public-overlay-access.js`, `app/modules/public-overlay-payload-projection.js`, `app/test/public-overlay-registry.test.js`, `app/test/public-overlay-security-matrix.test.js`, `app/test/quiz-show-public-projection.test.js`, neue `app/test/animazingpal-public-status-projection.test.js`, dieser Bericht.
- Gezielt mit Node 22.14 aus `app/`: `jest --runInBand --no-cache --detectOpenHandles --runTestsByPath test/animazingpal-public-status-projection.test.js test/public-overlay-security-matrix.test.js test/public-overlay-registry.test.js test/public-overlay-access.test.js test/public-overlay-payload-projection.test.js test/quiz-show-public-projection.test.js` — **6 Suites / 349 Tests bestanden**. Keine Fullsuite.
- `node --check` für Public Access/Projektion und neue AnimazingPal-Fixture bestanden. Zielbezogenes `git diff --check` der geänderten getrackten Projekt-/Testdateien ohne Befund. Der repo-weite Aufruf findet ein bereits außerhalb des Scopes liegendes trailing whitespace in `docs/plugin-docs-qa/index.html:29`; diese Datei wurde nicht verändert.
- Keine Producer-, Renderer-, TTS-, Season-Automation-, DB-, Socket-Registry- oder neue HTTP-Registryfreigabe; keine Live-/OBS-/Tunnelaktion.

## Public-Matrix-Folgeauftrag: WebGPU-Weather-Events

Stand: 2026-10-07. Nach dem Stream-Monsters-Abschluss wurde anhand der aktuellen Registry, des realen WebGPU-Weather-Producers und des ausgelieferten Overlays die nächste konkrete Pass-through-Familie geschlossen.

### Befund und Vertrag

- `WebgpuWeatherControlPlugin.broadcastGamificationState()` sendet `{reason,timestamp,gamification,...extra}`. `getGamificationSnapshot()` enthielt die vollständige aktive Questdefinition (interne Quest-ID, Typ, Fortschritt, Ziel, Eventtypen und Rewardkonfiguration), Gamificationzähler/-zeiten sowie Reward-History-/Thresholdzeilen. Der originale `overlay.html`-Consumer liest nur `overlay`-Flags, Meterwert, Questtitel, Streakzähler und optional den neuesten Reward-`label`.
- Der WebGPU-Canvas-Consumer für `webgpu-weather:trigger` nutzt `action`, `intensity`, `duration`, `permanent` und die vom existierenden Triggerprojektor validierten Effect-Optionen. `username`, `meta` und `timestamp` sind dort ungenutzt. Stop liest nur das optionale `action`; Config-Changed wird nur als Signal zum erneuten Laden des separat projizierten `/api/webgpu-weather/overlay-config` verwendet.
- `webgpu-weather:*`-Events waren bereits in der Public-Outgoing-Allowlist; weder Registry noch Plugin-Producer mussten geändert werden. Public-Sockets wenden die zentrale Projektion an, lokale Sockets erhalten den Originalemit.

### Umsetzung und Verifikation

- `webgpu-weather:gamification-state` akzeptiert sowohl den realen Broadcastwrapper als auch den direkt anfragbaren Gamification-Snapshot und gibt ein auf Original-HUD-Felder begrenztes Format aus. Quest-ID/Eventtypen/Rewardkonfiguration/History-IDs/Zeitstempel/Fired-Thresholds werden entfernt.
- `webgpu-weather:trigger` nutzt den bestehenden Bounds-/Actionprojektor. `stop` und `config-changed` werden zu `{}`; `stop-effect` behält nur eine bekannte Effect-Aktion. Malformed/unknown Actions werden Public verworfen.
- `app/test/webgpu-weather-public-projection.test.js` ruft den echten `broadcastGamificationState()`-Producer mit synthetischem In-Memory-Zustand auf, vergleicht Public- und Local-Socketpfad, ruft den Handler aus dem ausgelieferten `overlay.html` auf und prüft Meter/Quest/Streak im DOM. Der Triggerfall ruft den echten `createWeatherEvent()`-Producer und den originalen `CinematicWeatherEngine.trigger()` auf. Private Canaryfelder werden nicht Public ausgegeben.
- Gezielter Node `22.14.0`-Lauf über WebGPU-Weather Public-Projection, Public-Payloadprojektor/-Access, Weather-Control-Producer und Renderer: **6 Suites / 91 Tests bestanden** (`test/webgpu-weather-public-projection.test.js`, `test/public-overlay-payload-projection.test.js`, `test/public-overlay-access.test.js`, `test/webgpu-weather-control-plugin.test.js`, `test/webgpu-weather-renderer.test.js`, `test/weather-public-payload-renderer-fixture.test.js`). Keine Vollsuite, keine echte Browser-/Server-/OBS-/Tunnelrunde.
- Keine Änderung an Plugin-Producer, Overlay, Registry, Outgoing-Allowlist oder HTTP-Route. Kein GPU-/Audio-Start und keine realen Wettertrigger.

### Status

- **Behoben und geprüft:** WebGPU-Weather-Public-Events verlieren nicht konsumierte Quest-/Reward-/Producer-Metadaten; der originale Overlay-Consumer zeigt Meter, Quest und Streak aus dem reduzierten Payload. Lokale Events bleiben unverändert.
- **Teilweise geprüft:** realer Producer, zentrale Public-Projektion, `protectPublicSocket`-Direct-emit-Pfad und ausgelieferter Originaloverlay-DOM laufen in CPU-Fixtures. Kein echter Server/Socket oder OBS.
- **Blockiert:** nichts im freigegebenen Projektionsumfang.
- **Nicht geprüft:** Public Quick-Tunnel und laufender Browser/OBS-/GPU-Renderer im echten Desktopprozess.

## QuizShow: reine Round-Leaderboard-Ableitung und exakte Route

Stand: 2026-10-07. CEO-Folgeaufträge: aktuelle Rundenliste ohne `calculateResults()`/`hasLeaderboardData()` ableiten; danach wurde genau `GET /api/quiz-show/leaderboard?type=round` plus automatisch entsprechendes HEAD freigegeben. Keine Seasonroute oder breite Leaderboardfreigabe.

### Quellbefund und Semantik

- `calculateResults()` sortiert `gameState.answers` nach Antwortzeit, vergleicht über `isAnswerCorrect()` mit der aktuellen Frage und bildet `correctUsers`. Der erste richtige Antwortende erhält `pointsFirstCorrect`, weitere `pointsOtherCorrect` in den bestehenden Round-Anzeige-Flows.
- `calculateResults()` ist kein Read: wenn `pointsAwardedForRound` noch false ist, ruft es für richtige/falsche Nutzer `addPoints()` und `applyAnswerProgress()` auf und setzt das Flag. `hasLeaderboardData('round')` ruft dieselbe Funktion auf. Diese beiden Methoden sind für eine Anzeigeabfrage daher ungeeignet.
- `isAnswerCorrect()` enthält die bestehende A/B/C/D-, Volltext- und konfigurierbare `!`-/`/`-Präfixsemantik. Der neue Builder nutzt diese Vergleichsfunktion, ohne Award-/Progressionscode aufzurufen.
- Der bestehende Overlayconsumer `handleShowLeaderboard()` liest nur `username`/`points`; den Rang stellt er aus Arrayposition dar. `showCurrentGameLeaderboard()` fordert genau `type=round` an und konsumiert `{success, leaderboard}`. Die vorhandene Consumerdatei blieb unverändert.

### Implementierung

- `QuizShowPlugin.buildCurrentRoundLeaderboard()` liest nur die In-Memory-Frage, Antwortmap und Punktekonfiguration. Antworten werden wie im bestehenden Rechenpfad nach endlichen Zeitstempeln geordnet; gleiche Zeitstempel behalten die Map-Einfügereihenfolge. Erste weitere Treffer erhalten die vorhandenen First-/Other-Punktwerte. Ergebniszeilen enthalten nur `username` und `points`.
- `pointsAwardedForRound` bleibt unabhängig davon unverändert, ob es false oder true ist. Leere Runde ergibt `[]`; fehlerhafter Map-/Frage-/Nutzer-/Punktvertrag sowie mehr als 100 Treffer ergeben fail-closed `[]`. Es gibt keine DB-/Season-/Provider-/Socket-/Broadcastabfrage.
- Neue Regression `app/plugins/quiz-show/test/round-leaderboard-readonly.test.js`: echte Plugininstanz mit CPU-fixture und DB-/Provider-/Emit-/Punkte-/Progressionsspies; tiefe Vorher/Nachher-Snapshots von `gameState` und `config`; wiederholter identischer Read für beide Award-Flagwerte; leere Runde, ungültiger Index/Antwortspeicher, kaputter Antworttext, überlange Zeile, ungültige Punkte und 101 Treffer; A/B/C/D-Präfixe, Fulltext, stabile Zeitstempel-Ties und first-/other-Punkte.
- `app/plugins/quiz-show/main.js` enthält weitere bereits bestehende fremde QuizShow-Hunks. Für dieses Delta wurden nur der reine Round-Builder und der ausdrücklich freigegebene GET-Handler ergänzt; alle anderen vorhandenen QuizShow-Hunks blieben erhalten. Verifizierter Dateihash nach finalen Tests: `C8AA91BA8334C3F04150335B3774E627FC10C31BA5B955228EE6883861D97857`.

### Exakter GET/HEAD-Contract und Umsetzung

- CEO-Bestätigung: genau ein roher Querystring `type=round`; fehlende, duplicate, zusätzliche, kodierte oder andere Querywerte Public neutral 404 und lokal 400. Leere Runde ist 200 `{success:true,leaderboard:[]}`. Erfolgsantwort maximal 100 Rows nur mit `username`/`points`. Express-HEAD folgt derselben Route, Registry-Queryregel und Responsebody-Projektion; HTTP-HEAD sendet keinen Body.
- `public-overlay-registry.js` bietet nun `exactQuery` nur auf der exakten QuizShow-Route für GET/HEAD. Die Boundary prüft den rohen Requesttarget vor `normalizePublicPath()`-Querystrip; der Handler prüft denselben rohen Querystring erneut. POST und alle nicht-exakten Querystrings sind abgelehnt.
- Der echte Pluginhandler ruft ausschließlich `buildCurrentRoundLeaderboard()` auf und gibt `{success:true,leaderboard}` zurück. Er fragt weder DB noch Season-Automation ab. Lokal bleibt die Antwort, wie vom Producer erstellt; der zentrale Public-HTTP-Projektor validiert und whitelisted maximal 100 Zeilen. Malformed/oversized Projektorantworten werden neutral `Response unavailable`.
- Der originale `showCurrentGameLeaderboard()`-Reader wurde ohne Overlayproduktänderung im CPU-Fixture instrumentiert und gegen die echte Routeantwort ausgeführt; vorhandene DOM-Rendererfelder und Round-Anzeige wurden bestätigt.
- Keine Season-Fallbackroute, Season-Automation, neue Socketfreigabe oder Änderungen an `quiz_show_overlay.js`. Geteilte Registry-/Middleware-/Testdateien behalten alle vorherigen Fremdhunks.

### Verifikation und Grenzen

- Node 22.14 aus `app/`, `--runInBand --no-cache --detectOpenHandles`, drei Suites: `plugins/quiz-show/test/round-leaderboard-readonly.test.js`, `test/quiz_show_lms.test.js`, `test/quiz-show-public-projection.test.js` — **3 Suites / 16 Tests bestanden**.
- Finaler Node-22.14-Lauf aus `app/`, `--runInBand --no-cache --detectOpenHandles`: sechs Suites (`public-overlay-registry`, `public-overlay-security-matrix`, `public-overlay-access`, `public-overlay-payload-projection`, `quiz-show-public-projection`, `round-leaderboard-readonly`) — **6 Suites / 366 Tests bestanden**. Umfasst echten Plugin-Routehandler, Public-/Local-GET, Public-HEAD, invalid query matrix, empty round und die unveränderte Original-Consumerfunktion.
- `node --check` für QuizShow-Produkt-/Test- und zentrale Registry-/Access-/Projektiondateien; zielbezogenes `git diff --check` bestanden. Kein Fulltest, kein Server/OBS/Tunnel/Livebetrieb.
- **Behoben und geprüft:** reiner Read plus freigegebene exakte GET/HEAD-Route und Public-Projektion. Keine Punkte-/Progressionsmutation beim Lesen.
- **Teilweise geprüft:** echte Pluginroute, CPU-DB-/Provider-Spies, Middleware und instrumentierter Originalconsumer; kein Live-DB, Server, Tunnel oder Browserbetrieb.
- **Offen:** keine funktionale Implementierungslücke im freigegebenen Vertrag. Unabhängige Zweitprüfung von QuizShow `main.js` wurde angefragt/bleibt vom CEO-Review abhängig; Route ist nicht veröffentlicht und keine Livefreigabe erfolgt.

## Public Coverage Matrix: Music Bot/Soundboard und nächster Residualfall

Stand: 2026-10-07. Matrix-/Residualkonsolidierung anhand des aktuellen Public-Registry-, Projektor-, Producer- und Originalconsumerquellstands. Keine Registryfreigabe oder Producer-/Rendereränderung.

### Befund und Umsetzung

- Der Music-Bot-Overlayconsumer liest Now-playing-Titel/Künstler/Requester-/Artwork-/Fortschrittsfelder, die ersten drei Queue-Titel, Next-song-Vote-Kandidaten/-Zähler und die Vote-skip-Zähler. Der echte `musicbot:request-status`-Handler sendet zusätzlich Runtime-, Resolver- und Healthdiagnostik direkt an den anfragenden Socket. Diese drei Diagnostik-Events sind nicht in der Public-Outgoing-Allowlist; der bestehende Public-Socketguard blockiert sie. Die übrigen erlaubten Statusantworten liefen bisher ohne zentrales Feldschema.
- `projectPublicOverlayPayload()` typisiert jetzt die bestehenden Music-Bot-Events: Now-playing, Playback-Sync, Queue, Next-song-Vote, Vote-skip sowie Pause/Resume/Stop/Volume. Unbenutzte Track-/Queue-/Vote-IDs, Medienstream-URLs, Provider-/Kanalmetadaten und Diagnostikfelder entfallen. Queue-Preview ist auf die tatsächlich sichtbaren ersten drei Titel begrenzt. Lokale Sockets behalten Originalpayloads.
- `soundboard:play` wird vom echten `SoundboardManager.emitSound()` erzeugt und im ausgelieferten `animation-overlay.html` direkt für Audioelemente verwendet. Die Public-Projektion lässt nur URL, Volume, Label, Eventtyp, Audioziel und die nötige Gift-Wiederholungszahl durch. Lokale `/sounds/`-Pfade müssen auf einen bekannten Audiotyp passen; externe Quellen müssen HTTP(S) ohne URL-Credentials sein. Volume/Label/Eventtyp/Ziel und Gift-Wiederholungen sind begrenzt/typisiert; übrige Producerfelder entfallen.
- Quellzählung mit gebündeltem Node 22.14: 48 Public-Entrypoints, 36 erlaubte eingehende Socket-Events, 315 erlaubte ausgehende Socket-Events. 97 registrierte Outgoing-Namen haben einen zentralen Projektorfall; 218 Namen bleiben ohne zentralen Fall. Der Pass-through-Rest ist kein pauschaler Leckbefund.
- Der vorherige Arena-Residualbefund ist mit dem folgenden Eintrag geschlossen. Die übrigen 218 registrierten Outgoing-Namen ohne Projektorfall bleiben eine Coverage-Zahl, kein pauschaler Leckbefund.

### Verifikation und Dateien

- Gebündelter Node 22.14, aus `app/`, `--runInBand --no-cache --detectOpenHandles`: `music-bot-public-projection`, `public-overlay-payload-projection`, `public-overlay-access`, `public-overlay-socket-adapter`, `public-overlay-security-matrix` — **5 Suites / 253 Tests bestanden**.
- `node --check` für zentralen Projektioncode und neue Regression bestanden. Registryzählung gegen aktuelles Modul berechnet. Zielbezogene Diffprüfung im Abschluss durchgeführt.
- Geändert: `app/modules/public-overlay-payload-projection.js`, neue `app/test/music-bot-public-projection.test.js`, `app/docs/coordination/public-overlays.md`, neue `docs/coordination/HighestResidual.md` und dieser Bericht.

### Status und Grenzen

- **Behoben und geprüft:** Music-Bot-Status-/Queue-/Vote- und Playback-Events sowie Soundboard-Audioevent sind zentral feldbegrenzt. Tests koppeln echten Music-Bot-Statushandler und Soundboard-Manager mit dem Public-Guard/Adapter und den ausgelieferten Overlay-/Audio-DOM-Consumern.
- **Teilweise geprüft:** CPU-/DOM- und Socketadapter-Fixtures; keine Vollsuite und keine echte App-/Socket.IO-/Browserverteilung.
- **Blockiert:** nichts im aktuellen zentralen Projektorauftrag.
- **Nicht geprüft:** echte Audioausgabe, MPV, Browser/Tunnel, OBS/TikTok Studio, Live-TikTokevents, reale Soundboard-Settings oder Nutzerdaten. Workspace OBS-Capturestatus bleibt 0/104 praktische Captures.
- Keine Änderung an Registry, zentralem TikTokadapter, Music-Bot-/Soundboard-Producer, Renderer, Talking Heads oder TTS; keine echten Audio-/Liveaktionen, Veröffentlichung oder Push.

## Arena: Public State und Config-Update Projektion

- Befund am aktuellen Code: `ArenaGame.getState()` speist `arena:state` und den öffentlichen State-GET. Beide Wege waren allowlisted und liefen ohne Projektion. `game-engine:config-updated` ist ebenfalls allowlisted und der Arena-Overlay merged die Konfiguration. Die originale Local/Admin-GET-Antwort und lokale Socketpakete müssen vollständig erhalten bleiben.
- Umsetzung: gemeinsame reine `projectArenaPublicState()`-DTO-Allowlist für `arena:state`, Arena-Configupdates und den vorhandenen Public-GET-Zweig. Die Middleware wendet den GET-Projektor ausschließlich auf Quick-Tunnel-Anfragen an. Die vorhandene Registry und Route bleiben unverändert; lokale Antworten und Producerpayloads bleiben unangetastet.
- DTO behält die von `arena.html` gerenderten Spieler-/Entity-/HUD-/Layoutfelder. `username` bleibt als sichtbarer Anzeigename und Korrelationsschlüssel; `targetUsername` wird auf dessen vom Renderer tatsächlich verwendete boolesche Semantik reduziert. AI bleibt auf `state` beschränkt. Interne Personality-/Ablauf-/Owner-/Ziel-/Wert-/Mechanik-/Adminfelder entfallen. Gift-Mappings werden für öffentliche Info-Rotator-Fallbacks als leere Map ausgegeben; beide Avatar-URLs entfallen, wodurch der vorhandene Orb-Fallback greift.
- Geänderte Dateien: `app/modules/public-overlay-payload-projection.js`, `app/modules/public-overlay-access.js`, `app/test/public-overlay-payload-projection.test.js`, `app/test/public-overlay-access.test.js`, `app/test/public-overlay-socket-adapter.test.js`, `app/test/public-overlay-security-matrix.test.js`, `docs/coordination/public-overlays.md`, `docs/coordination/HighestResidual.md` und dieser Bericht. Keine Arena-Producer-, Renderer-, Registry-, TikTok- oder Live-Datei geändert.
- Hint-Korrektur nach CEO-Review: DTO bewahrt `likeLifeValue`, `likeGrowthMaxMass` und `giftLifePerCoin` mit denselben Zahlenbegrenzungen wie die originale `localizedInfoDefinitions()`-Anzeige. Eine Regression führt die echten Rendererfunktionen `clampNumber()` und `localizedInfoDefinitions()` mit projizierter Config aus und prüft die deutschen Like-/Gift-Hinweise; zusätzlich werden Extremwerte und Arena-Defaults geprüft.
- Prüfung: gebündeltes Node 22.14, aus `app/`, `--runInBand --no-cache --detectOpenHandles`; acht Suites (`public-overlay-payload-projection`, `public-overlay-access`, `public-overlay-socket-adapter`, `public-overlay-security-matrix`, `webgpu-weather-public-projection`, `weather-public-http-context-boundary`, `music-bot-public-projection`, `game-engine-public-current-state-projection`) — **274/274 bestanden**. Inklusive echtem `ArenaGame.getState()`/`emitState()` CPU-Fixture, Public-GET vs. Local-GET, Arena Config-Update Form, Socketadapter-Local/Public Split, Original-Overlay-Helfern/CPU-Canvas-Fallback und ausgeführtem Original-Hinweis-Consumer. `node --check` und `git diff --check` bestanden.
- Weather-Projektionslogik nicht geändert; die zwei gezielten Weather-Projektions-/HTTP-Kontext-Suites liefen im selben Abschlusslauf erfolgreich.
- **Teilweise geprüft:** In-Process Middleware/Socketadapter, Source-Consumer und CPU/Canvas-Doubles. Kein Server, Tunnel, Browser, OBS, WebGPU, Tick, Audio, TikTok-Live oder echte Nutzerdaten.
- **Offen:** keine Lücke im abgeschlossenen Arena- und Chess-/Connect4-Config-Vertrag. Die bewusste leere Arena-Gift-Map reduziert angezeigte Geschenkhinweise; Avatarbilder zeigen den Orb-Fallback. Andere Game-Engine-Event-/GET-Familien bleiben separat zu prüfen. Keine neue Proxy-Route oder Freigabe.

## Chess-/Connect4-Config: Public-Minimalprojektion

Stand: 2026-10-07. CEO-Folgeauftrag nach Arena-Abschluss: konkrete Pass-throughs der vorhandenen Chess-/Connect4-Konfiguration auf den Bedarf der Originalrenderer beschränken. Keine Registry-, Producer-, Renderer- oder TikTokadapteränderung.

### Befund und Vertrag

- Die Registry erlaubt bereits GET/HEAD `/api/game-engine/config/chess` und `/api/game-engine/config/connect4`. Der echte Routeproducer liefert `_getConfigWithDefaults(gameType, db.getGameConfig(gameType))` als vollständiges Configobjekt; unbekannte persistierte Felder bleiben dabei erhalten. Der POST-Save-Producer emittiert dasselbe normalisierte Gesamtobjekt als `{gameType, config}` auf dem bereits registrierten `game-engine:config-updated`.
- Die tatsächlichen ausgelieferten Listener sind `overlay/chess.html` und `overlay/connect4.html`. Chess benötigt Farb-/Theme-/Font-/Koordinaten-/Highlight-/Captured-/Celebration-/Timer-/Animations- und Displaytextwerte. Connect4 benötigt Farb-/Font-/Koordinaten-/Displaytextfelder sowie Sound-, Celebration-, Win-Streak-, Elo- und Leaderboard-Anzeigeeinstellungen. CSS-Farben, Enumwerte, Zahlenbereiche, boolesche Felder und Displaytexte werden im zentralen Projektor typisiert und begrenzt.
- Konkrete nicht gerenderte Backendwerte aus den aktuellen Defaults/normalisierten Konfigurationen sind Chess `streamerRole`, `autoplay`, `timeControls` und `defaultTimeControl`; Connect4 `streamerRole`, `chatCommand`, `timeoutLockoutMinutes` und `roundTimerEnabled`. Unbekannte Zusatzfelder werden ebenfalls nicht Public ausgegeben. Für andere `gameType`-Werte hat der gemeinsame Event keine dieser beiden Overlayconsumer; Public erhält dafür kein Event. Lokale Antworten/Emits bleiben im Originalformat.

### Umsetzung, Regression und Grenzen

- `projectGameEngineConfigResponse()` projiziert die vorhandenen zwei GET-Pfade. Der Eventfall `game-engine:config-updated` verwendet dieselbe per-gameType-Allowlist wie die Arena-Projektion; nicht unterstützte Typen und malformed Werte werden Public fail-closed zurückgehalten. Registry, lokale Producer, HTTProute und Originalrenderer bleiben unverändert.
- Fixtures rufen die echten GameEngine GET-/POST-Routehandler auf, prüfen Local-versus-Public-Socketadaptertrennung und projizieren die Original-Chess-/Connect4-Renderer durch Initial-GET und Config-Update. Security-Matrix und HTTP-Middleware prüfen beide bestehenden GET-Verträge.
- Node 22.14, `--runInBand --no-cache --detectOpenHandles`: **6 Suites / 332 Tests PASS** (`public-overlay-payload-projection`, `public-overlay-access`, `public-overlay-socket-adapter`, `public-overlay-security-matrix`, `game-engine/test/public-config-projection`, `game-engine/test/interactive-overlay-dom`). Separater Weather-Kompatibilitäts-/Producerlauf plus Game Engine Routeintegration: **7 Suites / 167 Tests PASS** (`webgpu-weather-public-projection`, `weather-public-http-context-boundary`, `public-overlay-payload-projection`, `public-overlay-access`, `public-overlay-socket-adapter`, `game-engine/test/public-config-projection`, `game-engine/test/interactive-plugin-integration`). Weather-Projektionslogik und Weather-Plugindateien wurden in diesem Auftrag nicht geändert.
- Hash des gemeinsamen `app/modules/public-overlay-payload-projection.js` nach beiden Aufträgen: `BF61475A476AB106CE4F8D18A94595E3CB27B34A5545875EF28279C7B3B5F446`.
- **Behoben und geprüft:** Chess/Connect4 Public-GET und Configupdate verwenden dieselbe typisierte Minimalprojektion; der originale UI-Vertrag bleibt im CPU-/JSDOM-Fixture erhalten; lokale Producerpayloads bleiben vollständig.
- **Teilweise geprüft:** In-process HTTP-/Socketadapter und ausgelieferte Renderer unter synthetischen Daten. Kein echter Server, Tunnel, Browser, OBS oder Livebetrieb; keine Vollsuite.
- **Blockiert:** nichts im freigegebenen Umfang.
- **Nicht geprüft:** öffentliche Verteilung im laufenden Desktopprozess und weitere Game-Engine-Events außerhalb dieser konkreten Configflächen. Keine Daten, Rollen, Guthaben oder Liveaktionen geändert; kein Push/Release.

## QuizShow-Overlay: Live-Labels nach Localewechsel

Stand: 2026-10-07. CEO-Folgeauftrag zur Verifikation dynamischer QuizShow-Texte beim initialen und späteren Sprachwechsel.

- **Befund:** `setRuntimeText()` entfernt `data-i18n`, damit statischer Locale-Refresh Laufzeitdaten wie Frage, Kategorie oder Bestenlisteneintrag nicht überschreibt. Der bisherige `refreshLocalizedRuntimeLabels()` erneuerte aber nur die Runde. Deshalb blieben die Fehleranweisung, ein bereits sichtbarer Bestenlistentyp und Joker-Titel/-Nutzerzeile nach `changeLanguage()` in der vorherigen Sprache. Frage, Kategorie und Nutzername sind Laufzeit-/Nutzerdaten und dürfen inhaltlich nicht übersetzt oder ersetzt werden.
- **Umsetzung:** Locale-Refresh rendert die Fehleranweisung erneut, merkt den sichtbaren Bestenlistentyp und aktualisiert ihn aus dem Eventtyp sowie hält nur Typ/Nutzername einer aktiven Jokerbenachrichtigung für deren erneute Übersetzung. Kurze Joker-Titel liegen jetzt in den vier QuizShow-Locales. Die synthetische aktuelle Frage enthält eine Kategorie, damit deren Unverändertheit durch den echten State-Consumer geprüft wird.
- **Geänderte bzw. in diesem Abschluss geprüfte Dateien:** `app/plugins/quiz-show/quiz_show_overlay.js`, `app/plugins/quiz-show/locales/{de,en,es,fr}.json`, `scripts/obs-pilot/host-quiz-fixture.js`, `scripts/obs-pilot/test/host-quiz-fixture.test.js`. Overlay/Fixture-Dateien enthielten bereits vorher parallele Änderungen; diese wurden erhalten. Keine Backend-, Registry-, DB-, Audio- oder Live-Datei geändert.
- **Prüfung:** Loopback/JSDOM-Originalrenderer-Fixture **6/6 bestanden** (verzögertes EN/FR-Initialisieren, anschließender Sprachwechsel, echte Fehler-/Bestenlisten-/Joker-Consumer, Frage/Antworten/Kategorie/Userdaten bewahrt, Cleanup). QuizShow-Lifecycle-/Reconnect-/Locale-Jest **3 Suites, 10/10 bestanden**. `node --check`, Locale-JSON-Parse und zielbezogenes `git diff --check` bestanden. Ein repo-weites `git diff --check` meldet bestehende fremde Leerzeichen in `docs/plugin-docs-qa/index.html:29`; die QuizShow-/Fixture-Dateien selbst sind sauber.
- **Behoben und geprüft:** im Renderer verwaltete Labels aktualisieren sich auf die aktive Sprache, ohne Frage, Kategorie, Antworten oder Zuschauernamen zu ändern.
- **Teilweise geprüft:** Originalrenderer und i18n-Client liefen in JSDOM mit loopback-synthetischem Socket/HTTP. Keine reale App, OBS, Tunnel oder Liveverteilung gestartet.
- **Blockiert:** nichts.
- **Nicht geprüft / offene Entscheidung:** keine menschliche Fachkorrektur der kurzen Joker-Titel in Spanisch/Französisch. Kein Volltestlauf. Keine echte Liveaktion, Datenänderung, Veröffentlichung oder Push.

### Folgekorrektur: Bestenlisten-Punkte nach Sprachwechsel

- **Befund:** Die sichtbaren `.leaderboard-points` wurden beim Anzeigen mit `t(points, {points})` gesetzt, aber der Locale-Refresh aktualisierte nur den Bestenlistentyp. Die Zeilen blieben daher bei einem Sprachwechsel in der alten Sprache.
- **Umsetzung:** Jede gerenderte Punktezeile hält den ursprünglichen Anzeigewert in `data-points`. Der Refresh übersetzt vorhandene Zeilen nur bei tatsächlich sichtbarem Leaderboard; Namen und Punktwerte werden nicht aus übersetztem Text rekonstruiert oder geändert. Kein Overlay-/Klassen-Show-Pfad wird beim Refresh aufgerufen.
- **Regression:** Originalrenderer-Fixture prüft aktives FR→DE auf Typ, beide übersetzten Punktezeilen, unveränderte Namen und numerische Datasetwerte. Anschließend blendet der synthetische Originalevent das Leaderboard aus; ein weiterer Localewechsel prüft, dass es ausgeblendet bleibt.
- **Prüfung:** Loopback/JSDOM **6/6 PASS**; QuizShow-Lifecycle, Reconnect und Runtime-i18n **3 Suites / 10 Tests PASS**. Kein Backendstart, keine echten Daten oder Liveaktion.

## Advanced Timer: Pause/Resume nach synthetischem Reconnect

Stand: 2026-10-07. CEO-Folgeauftrag: Host-Pausevertrag gegen Originaloverlay und sichtbare DOM-Statusklasse prüfen; Fixturekorrektur nur auf Host/Test beschränken.

- **Sourcebefund:** Echter `Timer.pause()` emittiert `timer:paused` mit `{id, currentValue}`; `Timer.resume()` ruft `start()` auf und emittiert daher `timer:started` mit demselben Feldvertrag. `TimerWebSocket` leitet beide als `advanced-timer:paused` und `advanced-timer:started` weiter. Der ausgelieferte Originalrenderer setzt `timer.state='paused'` bzw. `running` und aktualisiert CSS-Klassen an `.timer-display`. Eindeutiges sichtbares Merkmal: `state-paused` (CSS gelb `#f59e0b`) bzw. `state-running` (CSS grün `#10b981`).
- **Fixturebefund und Korrektur:** Host-Pause emittierte zuvor `{id,state}` statt des Enginevertrags und hatte kein Resume. Host emittiert nun `{id,currentValue}`; neues begrenztes Resume akzeptiert nur pausierte `fixture-timer-{de|en|es|fr}` und emittiert `advanced-timer:started`. `fault {kind:"disconnect"}` simuliert Transportabbruch über ausschließlich synthetische Clients. Regression korrigiert außerdem den nach Tick erwarteten Pausewert von 90 auf 89.
- **Originalconsumer-Regression:** Tatsächliches `overlay.html`/`overlay.js` laufen in JSDOM gegen den lokalen synthetischen Socket/HTTP-Host. Test prüft laufend→Pause, Disconnect/Reconnect, anschließend Resume nach dem Reconnect; der Timerstand bleibt 01:30, die Klasse wechselt `state-running`→`state-paused`→`state-running`. Events/Promises treiben die Assertions; keine Sleep-/Tickzeit wird abgewartet.
- **Dateien:** `scripts/obs-pilot/host-timer-fixture.js`, `scripts/obs-pilot/test/host-timer-fixture.test.js` und dieser Statusbericht. Keine Änderung am Advanced-Timer-Produktcode, Backend, DB, Rollen, Profil oder Livebetrieb.
- **Prüfung:** gebündeltes Node 22.14 Host-Fixture **4/4 bestanden**; Jest `obs-timer-goals-renderer-fixtures.test.js` **26/26 bestanden**; `node --check` und zielbezogenes `git diff --check` bestanden.
- **Teilweise geprüft:** Verbindungsabbruch ohne State-Snapshot und neue Pause-/Resume-Events nach Wiederverbindung. Der Originalrenderer fordert beim `connect` keinen aktuellen Timerzustand an. Daher ist das Nachholen eines Events, das während der Verbindungslücke gesendet wurde, nicht geprüft und bleibt offen; keine Änderung daran ohne gesonderten Auftrag.
- **Blockiert:** nichts. **Nicht geprüft:** echte App/OBS, Backendverteilung und ein vollständiger Reconnect-Snapshotvertrag. Keine Veröffentlichung oder Push.

### Folgekorrektur: aktuellen Timerzustand nach Reconnect nachladen

- **Befund:** Bestätigt. `setupSocketListeners()` behandelte zwar nach Wiederverbindung neue Events, forderte aber keinen aktuellen Timer-Snapshot an. Ein während der Trennung gesendetes `paused`/`reset` konnte deshalb bis zum nächsten Tick oder Zustandsereignis im Overlay veraltet bleiben. Außerdem konnte ein beim Reconnect gestarteter älterer GET nach einem neueren Socket-Event denselben Timerstand überschreiben.
- **Umsetzung:** Originaloverlay nutzt ausschließlich den bestehenden read-only GET `/api/advanced-timer/timers/:id` über den gemeinsamen `loadTimerState()`-Pfad, wenn ein tatsächlich getrennter Socket reconnectet oder die Seite aus BFCache zurückkehrt. `timerLoadGeneration` verwirft überholte GETs und wird bei endgültigem pagehide invalidiert. `timerStateRevision` macht einen GET ebenfalls stale, wenn inzwischen ein passendes laufendes Timer-Socketevent den UI-State aktualisiert hat. Listener werden nur einmal eingerichtet; Initial-Connect wird nicht mit Reconnect verwechselt.
- **Regression:** echter Originalconsumer in JSDOM: Start 90, Socketdisconnect, Fixturezustand 75/paused ohne Socketevent oder Tick, Reconnect ohne Folgeevent → vorhandener GET lädt 75 und rendert 01:15/`state-paused`. Anschließender BFCache-pageshow lädt 40/running. Verzögerter alter GET 60/paused wird nach neuerem GET 40/running und in separater Sequenz nach Socket-Tick 89 verworfen; DOM bleibt auf dem neuesten Zustand. Fixtures verwenden Socket-/Promise-/MutationObserver-Signale und keinen Sleep.
- **Geänderte Dateien:** `app/plugins/advanced-timer/overlay/overlay.js`, `scripts/obs-pilot/host-timer-fixture.js`, `scripts/obs-pilot/test/host-timer-fixture.test.js` und dieser Bericht. Keine neue Route/API, Backend-/DB-/Registry- oder Nutzeränderung.
- **Prüfung:** Node-Loopback-Host-Fixture **5/5 PASS**. Frischer no-cache Jest-Lauf nach dem Manifest-/i18n-Pin: **1 Suite / 26/26 PASS** (13 Timerfälle, 12 Goals-Fälle und ein gemeinsamer Sourcecheck). Syntaxchecks bestanden.
- **Praktischer synthetischer Browserlauf mit PNGs:** Chromium lud den kanonischen Root-Overlaypfad vom eigenen Loopback-Host. Persistierte Vorher-/Nachherbilder und strukturierter Receipt liegen unter `docs/coordination/evidence/advanced-timer-reconnect-20261007-final/`. Vorher: `01:30`, `.timer-display.state-running`, grün `rgb(16, 185, 129)`. Während Disconnect setzte nur der synthetische Host paused/75 ohne Socketevent oder Tick. Nach Reconnect: `01:15`, `.timer-display.state-paused`, orange `rgb(245, 158, 11)`. Statistik: Verbindungen 2, Timer-State-GETs 3, `tickCount` 0. Der Browser wurde geschlossen; Host meldete `closed:true`, Clients 0.
- **Quellbindung des Browserreceipts:** 12 Root-/CPU-/Host-/Test-/Manifest-/Capturedateien vor und nach dem Lauf mit unveränderten Hashes erfasst. Darunter `overlay.html` `13704E56…`, JSDOM-Entry `BACD9C0C…`, `overlay.js` `B82DB833…`, i18n-Client `058AB13E…`; kompletter Satz in `browser-receipt.json`. PNGs: `before-disconnect.png` 11.061 Bytes / SHA `7C5BFBF0…`; `after-reconnect-paused.png` 9.235 Bytes / SHA `CE254EF2…`.
- **Timer-Closure/CPU-Sourcewitness:** `obs-104-advanced-timer-fixture.json` pinnt jetzt 8 Dateien / 291.020 Bytes; SHA `8FBDE5B4…`. Die spezifische Timer-Manifestvalidierung besteht. Der aktualisierte Gesamtvertragstest hat 5/7 Tests bestanden; zwei unabhängige Familienprüfungen scheitern an veralteten `app/public/js/i18n-client.js`-Bytepins. Andere Familienmanifestdateien und der eingefrorene Validator `renderer-fixture-contract.js` SHA `4CA5B27C…` blieben unberührt. Die Timergrößenassertion im Contracttest wurde auf die nachgewiesene Closuregröße aktualisiert.
- **Ältere Aufnahmegrenze:** Der erste Browserlauf unter `advanced-timer-reconnect-20261007/` hat nur den Timer-Renderer-SHA vor/nach festgehalten. Er wird nicht rückwirkend dem i18n-/Root-HTML-Hash des späteren vollständigen Receipts zugeordnet.
- **Behoben und geprüft:** verpasste Statusänderung wird beim reconnect ohne nachfolgenden Tick vom bestehenden GET synchronisiert; stale GET-vs-GET, stale GET-vs-Socketevent, endgültiges pagehide und BFCache-Refresh sind abgesichert.
- **Teilweise geprüft:** Originalrenderer im JSDOM sowie Chromium gegen synthetische Loopback-HTTP-/Socket.IO-Produzenten. Keine Desktop-App, OBS, Tunnel, echte Produktroute oder Datenbank gestartet.
- **Blockiert:** vollständige Neupinnung der übrigen Rendererfamilien bleibt wegen ihrer stale i18n-Hashes bei den jeweiligen Ownern offen. **Nicht geprüft / offen:** OBS-/Backenddistribution. Keine Veröffentlichung oder Push.
# Renderer-Lokalisierung: Timer und Quiz Show

Stand: 2026-10-07. Abgeschlossener CEO-Folgeauftrag: bestätigte Socket-Bindung und Sprachwechsel in Advanced Timer und Quiz Show, inklusive aktueller Quellzeugen und isoliertem Browserbeleg.

## Befund

- Der gemeinsame `i18n-client.js` bindet seine Locale-Ereignisse ausschließlich über `window.socket`. Timer und Quiz Show erzeugten jeweils einen Socket in einer lokalen Konstante, veröffentlichten dieselbe Referenz aber nicht global. Der JSDOM-Standardhelper setzte `window.socket` vorab und verdeckte den Fehler bei eigenständigem Originalrenderer-Start.
- Der Timer-Fehlercontainer bekam seinen Text nur beim ersten Rendern. Er besaß kein `data-i18n`-Attribut und wurde bei einem Locale-Wechsel nicht aktualisiert.
- Der Quizrenderer rendert Frage/Runde über `quiz-show:state-update`; der Countdown wird dagegen durch den separaten Consumer `quiz-show:time-update` gesetzt. Die frühere synthetische Manifestprobe legte `timeRemaining` in `state-update`, was den sichtbaren Countdown nicht aktualisierte.

## Umsetzung

- Beide Renderer veröffentlichen ihren vorhandenen Socket nur, wenn `window.socket` noch frei ist. Bei endgültigem `pagehide` wird die globale Referenz nur entfernt, wenn sie weiterhin auf genau diesen Socket zeigt. Bei BFCache-`pagehide` bleibt sie erhalten. Es wird kein zweiter Socket erzeugt.
- Der Timer-Fehlertext trägt jetzt den passenden `data-i18n`-Schlüssel. Regressionen prüfen DE→FR für den sichtbaren 404-Text und den Overlay-Titel sowie gleichbleibenden Timer-Namen, Wert 01:30 und Running-Klasse.
- Quiz-Regressionen prüfen DE→FR mit unveränderter URL, Rundentext, Frage, Antworten und Countdown; BFCache-State-Update auf 17 Sekunden; späte State-/Locale-Events nach endgültigem Cleanup ändern das DOM nicht. Fremde vorhandene `window.socket`-Referenzen bleiben unangetastet.
- Der Quiz-Manifestvertrag trennt die zwei echten Rendererereignisse. Der finale Contract-Hash ist `47738B20CF04F8D543EAEA43B270FCC44542ADCB8CDAB8B49D7A40CFEBEDBEBA` und bleibt für diesen Auftrag eingefroren.
- Der Quiz-Browserhost erlaubt jetzt zusätzlich das bereits vom Overlay-Stylesheet importierte `/css/themes.css`; ein Test vergleicht die lokal ausgelieferten Bytes mit der Quelldatei.

## Geänderte Dateien

- Produkt: `app/plugins/advanced-timer/overlay/overlay.js`, `app/plugins/quiz-show/quiz_show_overlay.js`.
- Renderer-Fixtures: `app/test/helpers/obs-overlay-jsdom-fixture.js`, `app/test/helpers/obs-quiz-show-jsdom-fixture.js`, `app/test/obs-timer-goals-renderer-fixtures.test.js`, `app/test/obs-quiz-show-renderer-fixtures.test.js`.
- Contract/Quellenzeugen: `scripts/obs-pilot/renderer-fixture-contract.js`, `scripts/obs-pilot/test/renderer-fixture-contract.test.js`, `docs/coordination/obs-104-advanced-timer-fixture.json`, `docs/coordination/obs-104-renderer-fixture-evidence.json`, `docs/coordination/obs-104-quiz-show-fixture.json`, `docs/coordination/obs-104-quiz-show-fixture-evidence.json`.
- Synthetischer Quizhost und Route-Test: `scripts/obs-pilot/host-quiz-fixture.js`, `scripts/obs-pilot/test/host-quiz-fixture.test.js`.
- Browserbeleg: `docs/coordination/evidence/locale-live-synthetic-20261007/capture-quiz-locale.cjs`, `quiz-browser-receipt.json`, `quiz-before-fr.png`, `quiz-after-fr.png`.

## Prüfungen

- Jest Timer/Goals Renderer: **1 Suite, 29/29 PASS**.
- Jest Quiz Show Renderer: **1 Suite, 6/6 PASS**.
- Quizhost: `node --test scripts/obs-pilot/test/host-quiz-fixture.test.js`, **6/6 PASS**.
- Aktuelle Closurevalidierung gegen den finalen Contract: Timer **8 Dateien / 291.243 Bytes**, Quiz **11 Dateien / 618.518 Bytes**, beide `listenerStarted:false`.
- `node --check` für beide Produkt-Renderer und Contract sowie zielbezogenes `git diff --check`: PASS.
- Playwright Chromium 145 synthetischer Quizbrowser: Originalrenderer und echter Socket.IO-Client auf unveränderter `/quiz-show/overlay?lang=de`-URL. DE `Runde 1 / 3` → FR `Manche 1 / 3`; Titel wird FR. Frage, vier Antworten und Countdown 20 bleiben gleich. 17 tatsächliche Loopbackantworten inkl. lokaler Themes-Datei sind im Receipt mit Status, Bytezahl und SHA gebunden. Vorher-/Nachher-Dateien und vollständige Vorher-/Nachher-Quellenzeugen stimmen; Browser geschlossen, Host `closed:true`, Clients 0.
- Separater CEO-/Owner-Nachweis: Advanced-Timer-Originalrenderer gegen den tatsächlichen isolierten Timer-Backendpfad mit Start/Tick/Pause/FR/Reset; der Browser- und Backendprozess wurde beendet. Dieser Beleg ist kein OBS-Pass und wurde nicht in meinem Quizreceipt zusammengeführt.

## Status und Grenzen

- **Behoben und geprüft:** fehlende globale Socket-Bindung, Identitäts-Cleanup, Timer-404-Übersetzung, laufender Timerzustand beim Locale-Wechsel, Quiz-Lokalisierung ohne Änderung der Laufzeitdaten, Quiz-Countdown-Ereignissemantik.
- **Teilweise geprüft:** Quizbrowser verwendet echte Originaldateien, echten lokalen Socket.IO-Client und Loopbackhost, aber das `locale-changed`-Paket wird im Browserharness über den Socket.IO-Client-`onevent`-Eingang injiziert; es ist kein Produktionsbackend-Event. Quiz-Backend/Datenbank wurden nicht gestartet. Der Timer-Backend-/Browsernachweis stammt aus dem parallelen CEO/Owner-Lauf.
- **Blockiert:** nichts.
- **Nicht geprüft:** OBS Browser Source, öffentliche Liveverteilung und echte TikTok-/Zuschauerdaten.
- **Offene Entscheidungen:** keine für diesen begrenzten Auftrag; die Quiz-Eventsemantik und der finale Contract-Hash wurden an den CEO und den Overlay-Owner gemeldet.

Keine Veröffentlichung, kein Push, keine echten Zuschauer-, Guthaben- oder Rollenänderungen und keine echten Liveaktionen.

# Quiz Show: echter Backend- und Browserlauf im docs-capture-Profil

Stand: 2026-10-07. CEO-Folgeauftrag zur Verifikation des Quizrenderer-Sprachwechsels über den tatsächlichen lokalen LTTH-Server.

## Befund und Umsetzung

- Safe-init bestätigt: `app/database.db` war nicht vorhanden; der Quiz-Quelldatenordner enthielt nur `allgemeinwissen-40.json`. Der Child-Prozess erhielt ausschließlich das docs-capture-Plugin `quiz-show`, Loopback-Bindung, temporäres Profil und keine Provider-Konfiguration. TTS, LLM, TikTok-Reconnect, OBS und Browserzugriffe außerhalb Loopback blieben deaktiviert.
- Der normale Quiz-Init seedet das gebündelte Allgemeinwissenpaket in die temporäre Plugin-DB. Das Testscript entfernte es über die bestehende Quiz-Delete-Route und legte anschließend genau eine Frage mit vier synthetischen Antworten über die bestehende API an.
- Der originale Quizrenderer startete über die unveränderte `/quiz-show/overlay?lang=de`-Route und erhielt `quiz-show:start` über den echten Socket.IO-Server. Der Sprachwechsel auf FR lief über `POST /api/i18n/current`; das originale Renderer-Socket beobachtete den echten Server-Broadcast `locale-changed`.
- FR-Label und -Titel aktualisierten sich. URL, Frage, Antworten und laufende Runde blieben gleich; Backendzustand blieb aktiv und der Countdown lief von 30 auf 28 Sekunden. Sichtbare Vorher-/Nachher-Screenshots zeigen die fertig eingeblendeten DE-/FR-Zustände.
- Geordneter `POST /api/shutdown`: Prozesscode 0, Browser geschlossen, Loopbackport geschlossen, temporäres Profil entfernt. Quellenzeugen vor und nach dem Lauf identisch.

## Geänderte Dateien

- `docs/coordination/evidence/quiz-backend-live-synthetic-20261007/capture-quiz-backend.cjs` – reproduzierbarer docs-capture-/Playwright-Lauf.
- `docs/coordination/evidence/quiz-backend-live-synthetic-20261007/quiz-backend-browser-receipt.json` – API-, Event-, Quellhash- und Cleanupbeleg.
- `docs/coordination/evidence/quiz-backend-live-synthetic-20261007/quiz-backend-before-fr.png` und `quiz-backend-after-fr.png` – sichtbare Browserzustände.
- `scripts/obs-pilot/test/renderer-fixture-contract.test.js` – ausschließlich die vom CEO freigegebene Viewer-XP-Assertion von 16 auf 22 aktualisiert.

## Prüfungen und Status

- Isolierter echter LTTH-Backend-/Originalrenderer-Lauf: **PASS**; tatsächlicher Serverbroadcast, laufendes Quiz, unveränderte synthetische Inhalte, sauberes Ende und Profilcleanup sind im Receipt belegt. Kein OBS Browser Source Pass.
- `node --check` für den Capturetreiber: **PASS**. Die Appkern-Dateien `app/server.js` und `app/modules/database.js` hatten während des erfolgreichen Laufs dieselben Vorher-/Nachher-SHAs; lokaler Quellstand blieb stabil.
- Zentraler Contracttest nach der freigegebenen Viewer-XP-Zahl: **7/8 PASS**. Der verbleibende Test stoppt bei der unabhängigen Interactive-Story-Byteerwartung: tatsächliche Closure 344.265 statt Assertion 344.041 Bytes. Diese fremde Assertion wurde nicht angepasst; laut CEO läuft dazu eine Ownerkorrektur. Vollständiger Contracttest daher **teilweise geprüft**, nicht grün.
- **Behoben und geprüft:** echter Server-zu-Renderer-Locale-Broadcast aktualisiert Quiztexte; Spielzustand und Inhalte bleiben erhalten.
- **Teilweise geprüft:** lokale Browser-/Backendintegration im isolierten docs-capture-Profil; externe OBS-/Desktop-Laufzeit nicht mitgeprüft.
- **Blockiert:** nichts im Quizlauf. Contract-Suite bleibt bis zur finalen Interactive-Story-Closurekorrektur teilweise rot.
- **Nicht geprüft:** OBS-Auslieferung, öffentliche Liveverteilung und echte TikTok-/Zuschauerdaten.
- **Offene Entscheidung:** nach Ownerfreigabe Interactive-Story-Bytepin mit tatsächlicher Closure abgleichen und Gesamt-Contracttest erneut ausführen.

Keine Veröffentlichung, kein Push, keine realen Zuschauer-, Guthaben- oder Rollenänderungen und keine echten Liveaktionen.

# Quiz Show: vier Sprachen, kompakte Landschaftsansicht und Reconnect

Stand: 2026-10-07. Separater CEO-Folgeauftrag; der frühere Receipt `quiz-backend-browser-receipt.json` blieb unverändert. Der neue, vollständige Lauf ist ausschließlich in `quiz-backend-reconnect-receipt.json` dokumentiert.

## Befund und Umsetzung

- **Countdownlabel war nicht vollständig lokalisiert:** aktiver Circular- und Ring-Timer hatten hartcodiertes „Sekunden“, obwohl die vorhandene Locale-Schlüsselübersetzung `plugins.quiz-show.labels.sekunden_verbleibend` bereits vier Sprachen bereitstellt. Beide Labels nutzen nun diesen Schlüssel; die sichtbaren `timer-label`- und Neon-Labels haben JSDOM-Assertions für DE/EN/ES/FR.
- **Antwort-/Timerüberlappung:** der erste DOM-Messlauf zeigte bei 1920×1080 eine 4px-Überlappung des 200px-Timers mit der unteren Antwortreihe. Der Landschafts-Timer sitzt nun bei `bottom: 32px` statt 50px. Für kurze Landschaftsflächen (bis 1365×800) komprimiert eine gezielte CSS-Regel Fragen-/Antwortabstände und Kartengröße und setzt den Timer auf 112px unten zentriert. Bei 1280×720 liegt die Antwortunterkante bei 572.4px; der Timer beginnt bei 600px. Bei 1920×1080 endet die untere Antwortreihe bei 835.4px; der Timer beginnt bei 848px. Gemessene Überschneidung: **keine** in beiden Viewports.
- **Reconnect:** im selben Browser-Tab werden die tatsächlichen Server-Localevents DE→EN→ES→FR verarbeitet. Während `context.setOffline(true)` wartete der Browser auf Socket-Disconnect; die bestehende `POST /api/quiz-show/config` änderte serverseitig `totalRounds` auf 7, während die Rendereransicht offline noch 1/10 zeigte. Nach Wiederverbindung forderte der originale Connect-Handler den öffentlichen Zustand genau einmal neu an. Das Overlay zeigte 1/7 mit derselben Frage und denselben vier Antworten.

## Geänderte Dateien

- `app/plugins/quiz-show/quiz_show_overlay.html` – Timerlabels auf vorhandene Localeübersetzung umgestellt.
- `app/plugins/quiz-show/quiz_show_overlay.css` – gemessene Landschaftsüberlappung an 1920×1080 und 1280×720 behoben.
- `app/test/obs-quiz-show-renderer-fixtures.test.js` – vier Localeassertions für Circular-, Ring- und Neonlabel.
- `docs/coordination/obs-104-quiz-show-fixture.json` und `obs-104-quiz-show-fixture-evidence.json` – Closurepins für HTML/CSS und aktuellen Regressionquellzeugen erneuert; 11 Dateien / 619.570 Bytes, Manifest-SHA `923299D456F46701F0A0FCACBCF39BB21FCC911E6BA1E093C41B7E821F934FB6`.
- `scripts/obs-pilot/test/renderer-fixture-contract.test.js` – Quizclosuregröße auf 619.570 Bytes und nach CEO-Freigabe Interactive-Story-Closuregröße auf 344.265 Bytes gesetzt. Viewer-XP-Erwartung bleibt 22.
- `docs/coordination/evidence/quiz-backend-live-synthetic-20261007/capture-quiz-backend-reconnect.cjs` und zugehörige neue Locale-/Layout-/Reconnect-PNGs plus `quiz-backend-reconnect-receipt.json`.

## Prüfungen und Status

- Originalrenderer + Public-Reconnect Jesttests: **2 Suites / 10 Tests PASS**.
- Echter isolierter docs-capture-Backend-/Playwright-Lauf: **PASS** für vier Serverbroadcast-Localevents, laufende Quizfrage, übersetzte Countdownlabels, zwei maßstabsgebundene Layoutmessungen, Socket-Disconnect, API-Zustandsänderung und Reconnect-Synchronisierung. 1920×1080 und 1280×720 haben null Antwortkartenüberschneidungen.
- Appkern-Hashpins während des finalen Laufs: Timer `EE6C1E0BEF09B3D89CF66D90AEC88D663FDC752B9E771D54E4D57E4C79878024`, `database.js` `483F24D4F0066A2FDDCFE68ECA517B98C57AAF8D490EFC31806317970D76982C`, `server.js` `447DA4E10D9D38337169FB61F640D8A1A62A0B5246C81909A70860D28DA35AAC`; der Receipt bestätigt unveränderte Vorher-/Nachherquellen.
- Zentraler Contracttest: **7/8 PASS**, der aggregierte Closuretest stoppt jetzt am unabhängig driftenden TopTier-Overlay-Bytepin. TopTier-Manifest/evidence wurde nicht ohne dessen Owner verändert.
- **Behoben und geprüft:** Countdownlabel-Lokalisierung, 1920-/1280-Landschaftsüberlappungen, vier echte Localewechsel, vollständiger aktueller Spielzustand nach Disconnect und API-Änderung.
- **Teilweise geprüft:** lokal isolierter Appserver und Chromium, kein OBS Browser Source.
- **Blockiert:** nichts am Quizlauf; zentrale Contract-Suite wartet auf TopTier-Pinpflege.
- **Nicht geprüft:** OBS-/Desktoplaufzeit, Liveverteilung und echte Zuschauerdaten.

Keine Veröffentlichung, kein Push, keine realen Zuschauer-, Guthaben- oder Rollenänderungen und keine echten Liveaktionen.

# Interactive Story: Init-, Route- und Socket-Audit (read-only)

Stand: 2026-10-07. Angeforderte Quellprüfung und sicherer Probeplan; kein Pluginstart und keine Produktänderung.

## Befund

- `init()` in `app/plugins/interactive-story/main.js` ist nicht read-only: legt Plugin-Daten-, Bild-, Audio- und Exportverzeichnisse an, initialisiert Tabellen samt möglichen `ALTER TABLE`-Migrationen über `StoryDatabase.initialize()`, lädt Konfiguration, registriert HTTP-/Socket-/TikTok-Handler und stellt eine aktive Sitzung aus der Datenbank wieder her. `destroy()` kann bei aktiver Sitzung Story-Memory speichern.
- LLM-/Image-Service-Konstruktoren richten Clientobjekte ein; im untersuchten Init-Pfad wurde kein Providerrequest gefunden. Der standardmäßige Ollama-URL ist Cloud, aber Generierung bzw. der explizite Validate-API-Key-Endpunkt sind Netzwerkpfade. Bildcachebereinigung läuft nur, wenn ein Bildservice tatsächlich mit Schlüssel initialisiert wurde.
- `GET /api/interactive-story/status` ist kein reiner Snapshot: `_loadConfig()` kann eine Legacy-TTS-Konfiguration persistieren; `_prepareChapterForEmit()` mutiert das Kapitelobjekt durch Narrationsaufbereitung. Bei wiederhergestellter aktiver Sitzung hängt die Antwort von Profilzustand ab.
- `GET /api/interactive-story/config` maskiert Schlüssel, kann aber dieselbe Legacy-Konfigmigration auslösen. `GET /api/interactive-story/overlay-positions` schreibt eine einmalige Legacy-Pixel-zu-v2-Migration. Diese GET-Routen eignen sich daher nicht als unverändernde Probe.
- `GET /api/interactive-story/participants` und `/sessions` lesen Profil-/DB-Zustand; `/session/:id` liest Sitzung, Kapitel und Top-Voter. `GET /themes` gibt StoryEngine-Themen aus. `GET /random-themes` zieht zufällige Themen und schreibt einen Debuglog. Keine dieser Routen ist als initialer Minimalprobe nötig.
- Socket-Handler registrieren `tts:playback:ended` (Resolverzustand), `story:force-vote-end` (beendet aktive Abstimmung und kann Kapitel generieren) sowie `story:regenerate-image` (Bildservice und Emit). Sie sind keine passiven Probeevents. TikTok-Chat verarbeitet Join-/Vote-Nachrichten und schreibt Teilnehmer-/Viewerstatistiken; kein TikTok-Adapter oder Livepfad wurde gestartet.
- Admin-Schutz ist nur bei den explizit über `_registerAdminRoute()` registrierten Schreibpfaden belegt, etwa Participants-Reset; die aufgeführten GET-Routen sind direkt registriert. Keine Auth- oder Routenprobe wurde ausgeführt.

## Sicherer Probeplan für eine spätere Freigabe

- Prozess ausschließlich mit docs-capture-Isolation, Loopbackbindung und neuem temporärem Profil starten; Plugin explizit auf `interactive-story` begrenzen. Vorher bestätigen, dass keine Zugangsdaten im Capture-Environment liegen und ausgehender Netzwerkzugriff gesperrt ist.
- Sicherstellen, dass das Profil keine Storytabellen mit Sitzungen und keine alte `story-config`/`overlay_positions` enthält. Init darf sein Schema und ausschließlich seine temporären Pluginverzeichnisse anlegen. Nachher Prozess geordnet schließen und das temporäre Profil entfernen.
- Für reine Init-/Route-Erreichbarkeit zunächst keine aktive Sitzung erzeugen und keine GET-Route mit bekannter Migration oder zustandsabhängiger Aufbereitung aufrufen. Eine Probe für `GET /api/interactive-story/themes` wäre nur auf dem frischen isolierten Profil vertretbar; vor tatsächlicher Ausführung Endpunktantwort, ausgehende Verbindungen, DB-Zeilen und Verzeichnisänderungen protokollieren.
- Keine `/start`-, Validate-Key-, Config-/Layout-Schreibroute, kein Force-Vote-/Image-Socket, keine TTS-Aufrufe, keine TikTok-Ereignisse. Soll später tatsächliche Sitzungssynchronisierung geprüft werden, braucht es separate Freigabe und isolierte synthetische Fixture samt Provider-/TTS-Sperren.

## Geänderte Dateien

- `docs/coordination/permissions-events.md` – dieser read-only Befund, Prüfstatus und Probeplan.
- `docs/coordination/obs-104-quiz-show-fixture-evidence.json`, `obs-104-viewerxp-fixture-evidence.json`, `obs-104-webgpu-weather-control-fixture-evidence.json` – nur finale Shared-Registry-/Projektorquellenzeugen aktualisiert; vorherige Zeugen in `history` aufbewahrt. Keine historischen Browserreceipts geändert.

## Prüfungen und Status

- Zentrales Renderer-Fixture-Contracttestfile direkt ausgeführt: **8/8 PASS**. Es validiert neun vierlocale Manifeste, Byte-/Dateizahlen, Quellenzeugen und fail-closed Fälle. `node --test`-Wrapper selbst scheiterte beim Workerstart mit `spawn EPERM`; der direkte Lauf derselben Testdatei umging die Testworker-Erstellung.
- Betroffene aktuelle Regressionen: **4 Suites / 33 Tests PASS** (Quizrenderer, Viewer-XP-Renderer, Viewer-XP-Public-Contract, WebGPU-Weather-Renderer) auf final gepinnten Quellen.
- Story-Auftrag: **teilweise geprüft** als Quellcodeaudit; keine Runtime-/Backendprobe durchgeführt.
- **Behoben und geprüft:** finale Registry-/Projektor-Witnesspins und zentraler Contract sind konsistent; keine Interactive-Story-Produktänderung vorgenommen.
- **Teilweise geprüft:** Story Init-/Route-/Socketsemantik anhand des aktuellen Quellcodes; keine Prozess-, DB- oder HTTP-Probe.
- **Blockiert:** nichts im angeforderten read-only Audit.
- **Nicht geprüft:** tatsächliche docs-capture-Init-/Route-Laufzeit, Netzwerkegress zur Laufzeit, OBS oder öffentliche Liveumgebung.
- **Offene Entscheidung:** ob der isolierte Init-/`/themes`-Probeplan separat freigegeben werden soll.

Keine Veröffentlichung, kein Push und keine Änderungen an realen Profilen, Guthaben, Rollen oder Liveaktionen.

# Interactive Story: isolierter Init-/Themes-/Originaloverlay-Lauf

Nachtrag zum vorherigen read-only Audit; CEO-Folgeauftrag am 2026-10-07 ausgeführt.

## Ergebnis

- Der reale `app/server.js` lief mit frischem docs-capture Profil und exakt einem Plugin (`interactive-story`) auf Loopback. Das Child-Environment wurde ausschließlich über `createDocsCaptureChildEnvironment()` erstellt; keine Credentials wurden vererbt, TikTok-Autoreconnect und Swagger waren deaktiviert. Die vorhandene `app/database.db`-Legacydatei fehlte; der Runner verweigert den Lauf, wenn sie existiert.
- Plugin-Init und Datenbank waren bereit. Der erste `GET /api/init-state` zeigte `socketReady:false`; das entspricht dem aktuellen Code, weil der Server `socketReady` erst in seinem ersten Socket.IO-Connection-Handler setzt. Nach Laden des Originaloverlays wurde `ready:true` und `socketReady:true` beobachtet.
- `GET /api/interactive-story/themes` lieferte HTTP 200 und eine Objektmap mit 12 Themes. Der Endpoint ist kein Array, sondern gibt `StoryEngine.getThemes()` direkt zurück.
- Das Originaloverlay `/interactive-story/overlay` lieferte HTTP 200; Antwortbytefolge entsprach exakt `app/plugins/interactive-story/overlay.html` (65.722 Bytes, SHA-256 `739E58ADB3436FE64DD4E9F39C730CB93F0DF325F832D6E116999C2D17B19C5B`). Overlay-/Voting-DOM war vorhanden und Socket verbunden. Die beiden tatsächlichen Initialisierungs-GETs `/api/interactive-story/config` und `/api/interactive-story/overlay-positions` antworteten mit 200.
- Der Classic-Default ruft die Teilnehmerroute nicht auf; `loadParticipantRoster()` tut dies nur für `storyMode === 'dnd'`. Es gab keine Schreib-API-Aufrufe und keine externen Browserrequests. Die protokollierten POSTs beschränkten sich auf den lokalen Socket.IO-Polling-Handshake.
- Temporäre SQLite-Datenbank: `PRAGMA quick_check` = `ok`; Storytabellen vorhanden, aber 0 Sessions und 0 Kapitel. Vorher-/Nachher-Quellzeugen blieben identisch. `/api/shutdown` wurde angenommen, Child-PID 26344 endete mit Exit 0, Browser und Port 61235 waren geschlossen, das Temp-Profil wurde entfernt.

## Belege und geänderte Dateien

- `docs/coordination/evidence/interactive-story-init-synthetic-20261007/capture-interactive-story-init.cjs` – reproduzierbarer Runner.
- `.../interactive-story-init-receipt.json` – erfolgreicher Lauf mit Initstatus, Requests/Responses, Themes, DB-Check, Prozess/Port und Quellenzeugen.
- `.../attempt-01-diagnostic.json` bis `attempt-06-diagnostic.json` sowie zugehörige fehlgeschlagene Receipts – aufbewahrte Diagnose der Runnerkorrekturen. Ursachen waren Spawn-EPERM vor Appstart, falsche `/themes`-Arrayannahme, `socketReady`-Reihenfolge/Assertion, falsche Participants-GET-Erwartung im Classic-Modus und eine englische statt lokalisierte Titelannahme. App-Starts in den fehlgeschlagenen Versuchen wurden geordnet beendet (Exit 0); jeweilige Tempdatenbanken bestanden `quick_check`, Sessions/Kapitel blieben leer und Temp-Profile wurden nach Sicherung der Diagnose entfernt.
- `docs/coordination/permissions-events.md` – dieser Ergebnisnachtrag. Keine Produktdatei geändert.

## Prüfstatus und Grenzen

- `runtime/node/node.exe --check` für den Capture-Runner: **PASS**.
- Tatsächlicher isolierter Init-/Themes-/Originaloverlay-Lauf: **PASS**.
- **Behoben und geprüft:** keine Produktkorrektur erforderlich; tatsächlicher lokaler Start, Init, Themes-Antwort, Originaloverlay-Byteidentität, Socket-Ready, saubere Datenbank und Shutdown bestätigt.
- **Teilweise geprüft:** nur Init, ein passiver Themes-GET und Originaloverlay-Initialisierung im leeren Profil.
- **Blockiert:** nichts.
- **Nicht geprüft:** Storygenerierung, Abstimmung, Provider-/TTS-/Bildpfade, Sprachabnahme, OBS Browser Source oder öffentliche Liveumgebung.
- **Offene Entscheidung:** separater Auftrag erforderlich, falls Storygenerierung oder Abstimmungsablauf mit synthetischer Session geprüft werden soll.

Keine Veröffentlichung, kein Push, keine produktiven Daten und keine realen Liveaktionen.

# TTS-Playback-ID für Interactive Story

CEO-Folgeauftrag am 2026-10-07 umgesetzt.

## Befund und Umsetzung

- `QueueManager.enqueue()` erzeugte `item.id`, gab sie im Erfolgsergebnis aber nicht zurück. Dadurch war `enqueuePreparedAudio()`s bestehendes `id`-Feld im echten Lauf `undefined`.
- Der normale `speak()`-Pfad gibt die Queue-ID jetzt nur über `_speakForPlugin()` an geladene Plugins zurück. HTTP- und Socket-Aufrufer verwenden weiter `speak()` und erhalten keine ID; `tts:queued` bleibt unverändert.
- Interactive Story ruft den geladenen TTS-Plugin-Instanzpfad mit den bisherigen Erzählerdaten sowie `teamLevel: 999` und `priority: 50` auf. Die stabile `userId: 'interactive-story'` bleibt erhalten. Der Playback-Ende-Waiter ist nach exakter `playbackId` indiziert und konsumiert das serverseitige Plugin-Eventbus-Ereignis; der clientseitige Socket-Relay wurde entfernt.
- Ein begrenzter Early-End-Puffer fängt Endereignisse ab, die vor Rückgabe der internen Queue-ID eintreffen. Fremde IDs, abweichende Quelle/Benutzerkennung und Nichtterminalereignisse werden verworfen. Timeout, Pluginfehler und Destroy räumen Waiter und Puffer auf; verspätete Endereignisse können keinen anderen Waiter abschließen.
- Falls Renderer-Playback fehlschlägt, bleibt der TTS-Auftrag als erfolgreich eingereiht erkennbar, Story protokolliert `rendererOutcome: failed` und läuft weiter. Das belegt keine hörbare Audioausgabe.
- Unload während der internen Speak-Anfrage setzt einen Lifecycle-Guard; eine später zurückkehrende Queue-ID legt keinen Waiter mehr an.

## Geänderte Dateien und Prüfungen

- `app/plugins/tts/utils/queue-manager.js`, `app/plugins/tts/main.js`, `app/plugins/interactive-story/main.js`.
- Neue Fixtures: `app/test/tts-private-playback-id.test.js`, `app/plugins/interactive-story/test/tts-playback-correlation.test.js`.
- Fokussierte Jest-Prüfung: **6 Suites, 19 Tests PASS** (echter TTS-Speak-Methodenkörper mit Fake-Engine/DB/Permission/Queue, Queue-ID des Prepared-Audio-Pfads, Global Disable sowie Story Playback Correlation/Narration Persistence/Provider Config).
- ESLint auf den drei geänderten Produktdateien: **PASS**. `git diff --check` für die Task-Dateien: **PASS**.

## Status und Grenzen

- **Behoben und geprüft:** erzeugte Queue-ID entspricht der im QueueManager gespeicherten ID; privater Speak-Pfad und Story-Waiter korrelieren per exakter ID; öffentliches `speak()` und `tts:queued` bleiben ID-frei; Prepared Audio, frühes/fehlgeschlagenes Ende, fremde/verspätete IDs, Timeout, Unload-Race und Destroy-Cleanup sind mit isolierten Fixtures abgedeckt.
- **Teilweise geprüft:** `speak()`-Kontrollfluss mit Fake-Engine/DB/Permission/Queue und echtes Queue-ID-Verhalten. Keine echten TTS-, Provider- oder Rendereraktionen gestartet.
- **Blockiert:** nichts.
- **Nicht geprüft:** gesamter Jest-Lauf, reales Audio/Renderer-Timing und veröffentlichte Overlay-Sichtbarkeit bestehender `tts:playback:ended`-Payloads.
- **Offene Entscheidung:** eine Änderung am zentralen Public-Overlay-Registry-/Projektionsvertrag wurde nicht vorgenommen; falls die bestehende Playback-Ende-ID für öffentliche Tunnel redigiert werden soll, braucht das einen abgestimmten separaten Registry-Auftrag.

Keine Veröffentlichung, kein Push und keine Änderungen an realen Zuschauer-, Guthaben- oder Rollendaten; keine Liveaktionen.

# TTS-Originalterminalpfad: Metadaten und Fehlergrenzen

Read-only CEO-Folgeprüfung am 2026-10-07; Produktquellen eingefroren.

## Bestätigte Pfade

- Nicht-Streaming: `_playAudio()` erstellt `playbackMeta` aus dem Queue-Eintrag. `_dispatchRendererAudio()` legt damit einen Serverrecord vor dem Dashboard-Emit an. Ein `tts:renderer:ended` oder `tts:renderer:failed` wird über `_handleRendererLifecycle()` anhand der `playbackId` dem Serverrecord zugeordnet.
- Streaming: derselbe Record wird vor den ersten `tts:stream:chunk` angelegt. `stream:end` aktiviert den Renderer-Watchdog und emittiert ausschließlich `tts:stream:end`; Audioende wird erst durch Renderer-`ended`/`failed` oder den Watchdog terminal. Streamfehler nach Record-Anlage settle’n mit `stream-error`.
- `_settleRendererPlayback()` baut das Terminalpayload aus Server-Metadaten (`playbackId`, `userId`, `username`, `source`), emittiert `tts:renderer:ended|failed` und danach `tts:playback:ended` mit `rendererOutcome: ended|failed`. `PluginAPI.emit()` liefert synchron auf den Plugin-Eventbus und separat an Socket.IO.
- Interactive Story hört auf dem lokalen Eventbus, prüft Playback-ID, Erzählername, stabile Benutzer-ID, Quelle und Terminalstatus und löst nur den zugehörigen Waiter. Rendererfehler nach Record-Anlage kommen mit der gespeicherten Identität beim Story-Handler an.
- Dashboard-Rendererfehler (Audio-`error`, `play()`-Ablehnung, Streampufferfehler) senden `tts:renderer:failed` mit Playback-ID. Der TTS-Server ergänzt die Identität aus dem Record. Im Dashboard-Code wurde kein unload/dispose-Handler für den Renderer gefunden. Bei Page-/Socketverlust settle’t ein vorhandener Nicht-Streaming-Record über den gestarteten Watchdog; bei Streaming wird der Watchdog erst nach `stream:end` aktiviert.
- TTS-Plugin-Destroy settle’t aktive Rendererrecords als fehlgeschlagen (`plugin-destroyed`).

## Befund außerhalb der vollständigen Terminalkette

- Wenn `_playAudio()` vor `_beginRendererPlayback()` scheitert (z. B. Streamsetup wirft oder liefert keinen lesbaren Stream; ebenso Synthese-/Avatarfehler vor Dispatch), ruft der Catch `_settleRendererPlayback()` auf, aber es existiert kein Record. Diese Funktion kehrt dann ohne Terminalemission zurück. Es folgt nur `tts:playback:error`; dessen Payload enthält Playback-ID und Quelle, aber keine `userId`, `username` oder standardisierte `rendererOutcome`, und Interactive Story abonniert es nicht. Der Story-Waiter bleibt bis zum 60-Sekunden-Timeout offen.
- Beim TTS-Plugin-Destroy werden nur aktive Rendererrecords abgeschlossen. `QueueManager.stopProcessing()` stoppt die Verarbeitung und leert seinen `currentItem`-Zeiger, settle’t aber noch nicht gestartete Queue-Einträge nicht. Eine bereits von Story angenommene Queue-ID für solch einen Eintrag kann daher ebenfalls bis zum Story-Timeout offen bleiben.
- Für einen Streamingauftrag, dessen Transport weder `end` noch `error` auslöst, ist in `_playStreamingWithRenderer()` vor EOF kein Renderer-Watchdog aktiviert. Das Dashboard kann dann ebenfalls keinen Playbackterminalstatus erzeugen, weil es erst nach EOF die gepufferten Chunks abspielt.
- Das sind bestätigte Verzögerungs-/Aufräumlücken für bereits angenommene TTS-Aufträge, keine Verwechslung von Stream-EOF mit Audioende. Keine Produktkorrektur im Read-only-Auftrag vorgenommen. Der nächste Fix sollte einen internen, korrelierbaren Terminalfehler für Vor-Record-Fehler und beim Verwerfen ausstehender Queue-IDs liefern; nicht aus `tts:stream:end` ein Audioende ableiten.
- Zugriffskontrolle für die private ID: Die HTTP-Route `/api/tts/speak` und der Socket-Handler `tts:speak` rufen nur `speak()` auf. Diese Methode setzt das interne Include-Flag immer auf `false`; eingehende Felder können es nicht setzen. Nur der direkte Plugin-Instanzzugriff über `api.getPlugin('tts')._speakForPlugin()` setzt es auf `true`. Somit gelangt die ID nicht über diese normalen Speak-Antwortpfade.

## Prüfung und Grenzen

- `app/test/tts-private-playback-id.test.js`, `app/test/tts-renderer-lifecycle.test.js`, `app/test/dashboard-tts-renderer.test.js`, `app/plugins/interactive-story/test/tts-playback-correlation.test.js`: **4 Suites, 27 Tests PASS**.
- Prüfung war code- und fixturebasiert. Kein TTS-Prozess, keine Engine, kein echtes Audio und kein Provider gestartet.
- **Behoben und geprüft:** korrekte Identitätsübernahme auf allen aktiven Rendererterminalpfaden; Stream-EOF bleibt Transportende.
- **Zum damaligen Read-only-Prüfzeitpunkt offen:** Fix der Vor-Record-/ausstehenden Queue Terminal-Lücke; nachfolgender CEO-Auftrag und Umsetzung sind im nachfolgenden Nachtrag dokumentiert.
- **Nicht geprüft:** tatsächliche Wiedergabe in Dashboard/OBS oder Verhalten eines realen Browser-Audioelements bei Tab-/Socketverlust.

Keine Veröffentlichung, kein Push und keine Liveaktion.

# TTS-Terminalfallback bei Vor-Record-Fehler und Unload

CEO-Folgeauftrag am 2026-10-07 umgesetzt; keine Veröffentlichung oder Liveaktion.

## Umsetzung

- Bei einem `_playAudio()`-Fehler vor Rendererrecord-Anlage liefert `_settleRendererPlayback()` jetzt aus dem serverseitigen Queue-Metadatum genau ein Standard-Failed-Terminal mit derselben `playbackId`, `userId`, `username` und `source`. Es erzeugt keinen Rendererrecord und startet weder Engine noch Audio.
- Eine begrenzte Menge bereits settled Playback-IDs verhindert doppelte Terminalemissionen, wenn ein Streamfehler erst selbst settled und danach zusätzlich `_playAudio()` in den Fehlercatch läuft.
- `destroy()` erfasst vor `stopProcessing()` das aktuelle und die noch wartenden Queue-Items. Aktive Records werden zuerst regulär fehlgeschlagen; noch nicht gestartete Queue-IDs erhalten denselben korrelierbaren Failed-Terminal. Bereits abgeschlossene IDs werden nicht doppelt emittiert.
- HTTP-/Socket-`speak()`-Antworten, `tts:queued`, Queue-Ablehnung, Disabled-before-enqueue und `tts:stream:end`-Transportsemantik wurden nicht verändert. Die bestehende Interactive-Story-Änderung bleibt unberührt.

## Geänderte Dateien und Verifikation

- Produkt: `app/plugins/tts/main.js`.
- Neue Regression-Fixtures: `app/test/tts-playback-terminal-fallback.test.js`.
- Die neuen Fixtures wurden zuerst gegen den vorherigen Code ausgeführt: **3/3 erwartungsgemäß rot**, weil Vor-Record-Fehler keine Terminalemission hatten und Destroy nur aktive Records settle’t.
- Nach Fix: **9 Suites, 42 Tests PASS** (TTS-ID, Prepared Queue, Global Disable, Terminalfallback, Renderer-Lifecycle, Dashboard-Renderer sowie Interactive-Story-Korrelation/Narration/Provider-Konfiguration). ESLint auf den drei betroffenen Produktquellen PASS.
- Fixtures belegen: Queue-/Body-Fehler vor Record, Streamsetupfehler vor EOF, Streambodyfehler nach Record mit einmaligem Terminal, Unload von aktivem/current/queued ID und sofortiges Wecken der Story-Waiter.

## Grenzen und Status

- **Behoben und geprüft:** Story-Waiter erhält bei Vor-Record-Fehlern und TTS-Unload zeitnah genau ein passendes `failed`-Terminal; aktiver Streamfehler wird nicht doppelt settled.
- **Teilweise geprüft:** ausschließlich isolierte Fake-Queue/Stream/Plugin-Eventbus-Pfade; kein echter Stream, Browser, TTS-Provider oder Audio gestartet.
- **Blockiert:** nichts.
- **Nicht geprüft:** kompletter Jest-Lauf und reales Dashboard-/OBS-Lifecycle-Verhalten.
- **Verbleibender Read-only-Befund:** der Stream-Renderer-Watchdog startet erst bei `stream:end`; Verhalten bei einem endlos offenen Transport wurde nicht durch eine Fixture geprüft und vom Terminalfallback-Auftrag nicht geändert.

Produktquellen bleiben für CEO-Review/Commit uncommitted; keine fremden Story-Hunks wurden verändert.

# TTS-Transport wartet unbegrenzt auf Stream-EOF

CEO-Folgeauftrag am 2026-10-07: isoliert reproduzieren und begrenzten Fix vorschlagen; keine Produktänderung.

## Reproduktion und Befund

- Der echte `_playAudio()` → `_playStreamingWithRenderer()`-Pfad wurde mit einer Fake-Engine und offenem `PassThrough` ausgeführt. Bei `rendererPlaybackWatchdogMs: 5` und `rendererPlaybackMaxMs: 10` blieb nach 40 ms der Rendererrecord aktiv, `watchdogTimer` und `maxTimer` waren beide `null`, und weder `tts:stream:end` noch ein Playbackterminal war emittiert. Der Harness settled anschließend mit `fixture-cleanup` und zerstörte den Fake-Stream, damit der Prozess endet.
- Ursache im App-Code: `_beginRendererPlayback(..., { deferWatchdogs: true })` startet absichtlich keine Renderer-Timer. `_activateRendererPlayback()` wird erst im Stream-`end`-Handler gerufen. Die Race wartet auf `streamResultPromise` oder Renderercompletion; solange der Transport offen ist, kann beides ausbleiben und der Queue-Worker bleibt belegt.
- Der FishSpeech-Engine-Pfad übergibt `this.timeout` an Axios und gibt danach `response.data` als Stream weiter. Axios setzt beim Streamresponse `isDone = true`, sobald der HTTP-Response mit Stream aufgelöst wurde; sein Request-Timeout-Handler beendet sich dann sofort. Der Timeout deckt damit Verbindungs-/Response-Aufbau ab, aber begrenzt den später offenen Body in diesem Pfad nicht.
- Der Browser-Dashboard-Pfad puffert Chunks bis `tts:stream:end`; ohne dieses Ereignis bleibt `streamingBuffers` für die Playback-ID bestehen. Ein bloßes Server-Failed-Terminal würde Story wecken, aber diesen Browserbuffer nicht freigeben. TTS-`destroy()` settled Rendererrecords, hält jedoch keine Streamreferenz für `destroy()` oder Listenerentfernung.

## Minimaler Fixvorschlag

- Einen eigenen absoluten Transport-EOF-Watchdog starten, sobald der Stream und der Rendererrecord angelegt sind; bestehende `rendererPlaybackWatchdogMs`/`rendererPlaybackMaxMs` unverändert für Audio-Renderercompletion lassen. Vorschlag: konfigurierbares `streamEofWatchdogMs` mit begrenztem Default (z. B. 120 s), das auch bei fortlaufenden Bytes spätestens abläuft.
- Bei Ablauf genau ein serverkorreliertes `rendererOutcome: failed` mit Grund `stream-eof-timeout` emittieren, den Providerstream abbrechen und Timer/Listener/Chunkreferenzen entfernen. **Kein** `tts:stream:end` ausgeben, da das Dashboard dieses Event als Anweisung zur Wiedergabe des vollständigen Puffers behandelt und EOF nicht mit Audioende verwechselt werden darf.
- Für die Dashboard-Bufferfreigabe braucht es ein separates `tts:stream:abort`-Transportereignis oder einen gleichwertigen expliziten Cancel-Vertrag, der nur Puffer und blocked-ID bereinigt und keine Wiedergabe startet. Das ist ein neuer Socket-Eventvertrag und sollte mit dem zentralen Public-Event-Registry-Owner abgestimmt werden.
- TTS-Plugin-Unload sollte denselben gespeicherten Transportcleanup aufrufen, nachdem aktive Playback-IDs fehlgeschlagen gesetzt wurden. Normales Stream-EOF bleibt unverändert: dann endet nur der Transport, Dashboard startet gepufferte Wiedergabe und erst Renderer-`ended`/`failed` settled Audio.

## Prüfstatus und Grenzen

- **Reproduziert:** Fake-Stream hängt trotz 5 ms Rendererwatchdog und 10 ms Playbackmax; Record/Queue bleiben bis expliziter Testcleanup offen.
- **Vorschlag:** dokumentiert, noch nicht implementiert oder testvalidiert.
- **Nicht geprüft:** echter Fish-Transport, echte Netzwerkunterbrechung, Dashboard-Bufferbereinigung bei neuem Abortvertrag oder OBS.
- **Produktdateien TTS/Interactive Story blieben für CEO-Commitreview unverändert.** Es wurde nur diese Statusdokumentation ergänzt.

## Umsetzung: EOF-Watchdog und Dashboard-Transportabort

CEO-Folgeauftrag am 2026-10-07 umgesetzt; Story- und QuizShow-Scope unverändert.

- `streamEofWatchdogMs` startet mit den Streamlistenern und läuft absolut weiter, auch wenn fortlaufend Chunks eintreffen. Der Default ist 120000 ms; finite Werte werden auf mindestens 1 ms und den Node-Timer-Maximalwert begrenzt. Bestehende Rendererwatchdog-Semantik bleibt unverändert.
- Aktive Streamtransporte werden nach Playback-ID gespeichert. Ein gemeinsamer Cleanup löscht EOF-Timer, entfernt Producerlistener und gibt Chunkreferenzen frei. Bei `destroy()` bleibt ein temporärer Error-Sink bis `close` installiert, damit ein asynchroner Destroy-Callback-Fehler nicht unhandled bleibt; bei `close` werden auch diese temporären Listener entfernt. EOF räumt den Transport sofort auf und emittiert weiterhin nur `tts:stream:end`; Audio bleibt bis Renderer-`ended`/`failed` offen.
- EOF-Timeout, vorzeitiger Stream-Close und Plugin-Unload zerstören den offenen Stream, emittieren genau ein korreliertes failed-Playbackterminal sowie das lokale `tts:stream:abort {playbackId, reason}`. Sie emittieren kein `tts:stream:end`.
- Das Dashboard entfernt beim Abort seinen Chunkpuffer und die blockierte Playback-ID. Eine begrenzte ID-Tombstone-Menge verwirft verspätete Chunks/EOF, ohne Playback zu starten oder ein Terminal zurückzusenden. `tts:stream:abort` wurde nicht in die Public-Event-Registry aufgenommen und bleibt dort öffentlich gesperrt.

### Geänderte Dateien und Verifikation

- Produkt: `app/plugins/tts/main.js`, `app/public/js/dashboard.js`.
- Regressionen: `app/test/tts-stream-eof-watchdog.test.js`, `app/test/tts-playback-terminal-fallback.test.js`, `app/test/dashboard-tts-initialization.test.js`.
- **PASS:** `npx jest --runInBand --runTestsByPath test/tts-stream-eof-watchdog.test.js test/tts-playback-terminal-fallback.test.js test/tts-renderer-lifecycle.test.js test/dashboard-tts-initialization.test.js` — 4 Suites, 25 Tests.
- **PASS:** ESLint für die beiden Produktdateien und die drei Regressiondateien; `git diff --check` für die geänderten Quellen.
- Fixtures belegen: EOF-Timeout trotz kontinuierlicher Bytes, genau ein failed-Terminal, kein EOF-Fälschereignis, normale EOF getrennt von Audioende, vorzeitiger `close`, Stream-`error`, verzögerter asynchroner Destroyfehler bis `close`, Unload-Cleanup und Ignorieren später Callbacks. Dashboardabort entfernt Buffer/blocked-ID; nach Abort starten verspätete Chunks/EOF keine Wiedergabe. Eine negative Registryfixture belegt, dass `tts:stream:abort` öffentlich nicht erlaubt ist.

### Grenzen

- **Behoben und geprüft:** unbegrenzt wartender Fake-Stream, Timer-/Listener-/Chunkcleanup, lokaler Dashboardabort, Trennung von Transport-EOF und Audioende.
- **Teilweise geprüft:** isolierte PassThrough-/Dashboard-VM-Fixtures; kein realer Provider, Netzwerkstream, Browser-Audio oder OBS.
- **Blockiert:** nichts. **Nicht geprüft:** Live-Tunnel-Egress für den unregistrierten Abort-Event.
- Keine Public-Registry-Änderung, keine Veröffentlichung und kein Push.

## Read-only: Provider-Response-Setup vor Streamrecord

CEO-Folgeprüfung am 2026-10-07; keine Produktänderungen.

- `rg` findet im Runtimebaum nur eine Implementierung von `synthesizeStream()`: `app/plugins/tts/engines/fishspeech-engine.js`. `_playStreamingWithRenderer()` erwartet dieses Promise vor Rendererrecord/Streamlistener/EOF-Timer.
- FishSpeech ruft `axios.post(..., { responseType: 'stream', timeout: this.timeout })` auf. Das Setup-Timeout hängt vom Performance Mode ab: fast 8000 ms, balanced 15000 ms, quality 30000 ms. `synthesizeStream()` selbst verwendet `maxRetries` nicht.
- Im gebündelten Axios-Node-Adapter bleibt der Request-Timeout aktiv, solange die Adapter-Promise nicht aufgelöst ist. Für den verwendeten Follow-Redirects-Transport startet `req.setTimeout()` seinen Wall-Clock-Timer beim Transport-`socket`-Event; die Timeoutfunktion ruft `abort()` nur auf, wenn `isDone` false ist. `wrapAsync` setzt `isDone` beim Resolve, und der Streamresponse wird aufgelöst sobald die HTTP-Response samt Readable-Stream bereitsteht. Damit ist die Netzwerkphase von Socketzuweisung bis Response timeoutgebunden, aber es gibt keinen selbst gesetzten absoluten Deadline-Timer ab Eintritt in `synthesizeStream()`.
- Nach Auflösung des Axios-Promises schützt `req.setTimeout` den offenen Responsebody nicht mehr: `handleTimeout()` kehrt wegen `isDone` zurück. Für diesen späteren Body-/EOF-Abschnitt greift der neue TTS-`streamEofWatchdogMs` erst nach der nachfolgenden Avatar-Gate-Wartezeit und beim Installieren der Streamlistener.
- Separater Pre-Record-Wartepunkt: `_playAudio()` startet `avatarGatePromise` parallel; `_playStreamingWithRenderer()` wartet nach der Providerantwort mit `await avatarGatePromise`, bevor es den Streamrecord anlegt. Talking Heads begrenzt `_waitForAvatarSpin()` nach erfolgreicher Vorbereitung auf Animationsdauer plus 500 ms. `_emitAvatarSpin()` wartet davor jedoch auf Sprite-Asset-Promises ohne eigenen Gesamttimeout. Das ist keine fehlende Axios-Responsebegrenzung, aber eine separate potenziell unbounded Avatar-Preparation vor Streamrecord; in dieser Read-only-Prüfung nicht geändert.

**Status:** Provider Request-/Response-Setup ist durch FishSpeechs Axios-Timeout begrenzt; Streambody/EOF separat durch den EOF-Watchdog. Avatar-Assetvorbereitung vor Streamrecord hat keine belegte Gesamttimeoutgrenze. Nur Quellcode und die gebündelte Axios-Adapterimplementierung geprüft; kein Provider/Netzwerk gestartet, keine Liveaktion und keine Tests in diesem Read-only-Folgeschritt ausgeführt.

## Read-only-Reproduktion: Avatar-Gate hält den Stream vor dem Record offen

CEO-Folgeprüfung am 2026-10-07; keine Produktänderungen.

- Originalpfad _playAudio() → _playStreamingWithRenderer() mit tatsächlichem QueueManager, Fake-Engine, offenem PassThrough und Fake-Talking-Heads-prepareAvatarForPlayback-Promise, das nie aufgelöst wurde. Kein Provider/Netzwerk und keine Talking-Heads-Produktänderung.
- Nach 35 ms: streamCreated:true, responseStreamNotDestroyed:true, data/end/error-Listener jeweils 0; currentItem:avatar-gate-fixture bleibt gesetzt, next-fixture bleibt in der Queue; Rendererrecord und Transportrecord fehlen; promiseStillPending:true.
- Damit wird zwar die Axios-Response als Stream erzeugt, aber TTS wartet auf avatarGatePromise bevor es den Streamrecord, den EOF-Timer oder Listener installiert. Der EOF-Watchdog aus dem vorigen Fix kann diesen Vorlauf nicht begrenzen.

### Designvorschlag, noch nicht umgesetzt

- TTS-seitige begrenzte Setupphase vor Streamrecord: nachdem der Provider den Stream geliefert hat, gegen ein eigenes Avatar-Gate-Deadline warten; bei Deadline den noch nicht registrierten Response-Stream zerstören, lokale tts:stream:abort-Bereinigung auslösen und genau ein avatar-gate-timeout-Failed-Terminal aus Playbackmetadaten liefern. Dies muss vom späteren absoluten EOF-Watchdog getrennt bleiben.
- Wesentliche Koordinationsgrenze: Promise.race() beendet nur TTS’ Warten; es bricht die Talking-Heads-Arbeit nicht ab. Der aktuelle Talking-Heads-Pfad kann vor seinem Spin-Warte-Timeout noch auf Sprite-Asset-Promises warten und danach weiterhin Assignment-/Overlayeffekte ausführen. Ein TTS-only Timeout könnte daher nach bereits gemeldetem Fehler eine verspätete Avataraktion zulassen.
- Für eine sichere Umsetzung braucht es entweder eine von TTS nutzbare Cancellation/Abort-Garantie von Talking Heads (separat mit dessen Owner abzustimmen) oder einen engeren Ownerentscheid, dass die bestehende Avatarvorbereitung nach TTS-Timeout weiterlaufen darf. Ich habe weder TTS noch Talking Heads hierfür geändert.

Status: Befund reproduziert und statisch bestätigt; Design gemeldet. Kein Testlauf in diesem Read-only-Auftrag, keine Provider-/Liveaktion. Produktfreeze blieb bestehen.

## Read-only-Cancellation-Vertrag: TTS und Talking Heads

CEO-Folgeprüfung am 2026-10-07; keine Produktänderungen, besonders kein Eingriff in die fremd modifizierte Talking-Heads-main.js.

### Befund und verspätete Resolve-Reproduktion

- TalkingHeads `prepareAvatarForPlayback()` ruft `prepareAvatarAssignment()` synchron vor dem ersten Asset-Await auf. Bei Erstzuweisung persistiert `avatarLotteryManager.assign()` damit schon vor dem lang laufenden Sprite-Asset-Schritt. Danach wird `initialAvatarPlaybackReservations[userId] = playbackId` gesetzt.
- `_emitAvatarSpin()` startet einen Winner- und drei Kandidaten-`getSpriteSet()`-Promises via `Promise.all`. Erst nach deren Resolve emittiert die Methode ohne Cancellation-/Reservationsprüfung `talkingheads:avatar:spin:start`; anschließend ruft `prepareAvatarForPlayback()` `_waitForAvatarSpin()` auf und legt den pending-spin-Timer an.
- Isolierter CPU-Harness rief diese Originalmethoden mit In-Memory-Fakes für Assignment, AssetSpriteLibrary, CacheManager und PluginLoader auf. Alle vier Assetpromises blieben zunächst pending. Danach wurde das TTS-Timeout/Renderer-Failed simuliert: die Initialreservation wurde entfernt und ein Playback-Owner-Release geplant/ausgeführt. Nach spätem Resolve aller Assets emittierte Original-`_emitAvatarSpin()` trotzdem `talkingheads:avatar:spin:start` und legte einen neuen pending-spin an. Das Playback-Assetowner wurde durch spätere Assetmaterialisierung wieder registriert; das Initial-Assignment bleibt wie vorab committed bestehen.
- Quellpfad erklärt das Lease-Rennen: `AssetSpriteLibrary.getSpriteSet()` wartet zunächst auf `_getFrameLayers()` vor `materializeGeneratedAssets()` und dessen Owner-Registration-Lock. Ein Terminal-Release kann daher abschließen, während ein Asset-Aufruf noch vor der Registrierung wartet; wenn das Asset später materialisiert, kommt derselbe Owner erneut hinzu. Beim Initial-Assignment plant `_emitAvatarSpin()` keinen zweiten Winner-Owner-Release (der ist dem Playbackterminal zugeordnet).
- Die normale Spin-Grenze bleibt getrennt: `_waitForAvatarSpin()` akzeptiert `complete` nur mit passender Playback-/User-/Spin-ID und erst ab `revealAt`; der vorhandene Timeout löst nach Animationsdauer plus 500 ms. Overlaycode hat Start/Complete, aber keinen Spin-Cancel-Event. `_cancelPendingAvatarSpins()` deckt aktuell nur bereits angelegte pending spins ab, nicht die vorherige Asset-Preparation.

### Designvorschlag und negative Regressionfixture

- TTS erzeugt pro Stream-Playback einen AbortController und gibt dessen Signal explizit an `prepareAvatarForPlayback(meta, { signal, onPhase })`. Eine separate Setupdeadline überwacht nur Asset-Preparation bis zum ersten Spin-Start. Beim Ablauf: zuerst Signal aborten, den noch nicht konsumierten Response-Stream mit vorhandener Error-Sink-bis-Close-Regel zerstören, lokalen Dashboardabort senden und genau ein Failed-Terminal mit Setup-Timeoutgrund liefern. Der EOF-Watchdog bleibt für den Abschnitt nach Streamrecord zuständig.
- TalkingHeads führt ein aktives Initial-Preparation-Record pro Playback, checkt das Signal vor synchronem Assignmentcommit, nach jedem Asset-Await und unmittelbar vor `io.emit`. Ein nach dem Assignmentcommit abgebrochener Vorgang lässt die persistierte Auswahl bestehen (Commit bleibt atomar); er darf aber keinen späten Spin starten. Reservationen werden nur bei passender Playback-ID gelöscht. Pending-spin-Abort, normaler Completioncallback und Duration-Timeout teilen einen idempotenten `finish`-Pfad.
- Nach Abort dürfen Ownerleases nicht vor dem Abschluss der asynchronen Materialisierung freigegeben werden. Der Vorgang muss nach dem Ende aller in-flight `getSpriteSet()`-Arbeiten Winner- und Candidate-Owner bereinigen. Dazu sind Abort-/Post-await-Checks im Assetpfad oder ein von der Assetbibliothek bestätigter Cancellation-/Cleanup-Hook nötig; ein früher `releaseGeneratedAssetOwner()` reicht nicht gegen spätere Registration.
- Die Setupdeadline wird beim ersten erfolgreichen Spin-Start beendet. So läuft die normale Spincompletion weiterhin bis zur bisherigen Reveal-/Ack-Grenze und wird nicht von einer allgemeinen TTS-Setupuhr abgeschnitten. Timeout vor erstem Spinstart unterdrückt Emit; falls Abbruch nach Spinstart separat möglich sein soll, braucht es einen koordinierten Overlay-Cancel-Vertrag, den die aktuelle Overlaydatei nicht anbietet.
- Negative Fixture: deferred Winner-/Candidate-Assetpromises; abort vor Resolve; danach alle Assets auflösen. Erwartung: keine Spin-Startemission, keine verspätete `pendingAvatarSpins`-Map/Timer, Reservation nur für passende Playback-ID entfernt, alle Assetowner erst nach Materialisierungsabschluss bereinigt, kein Owner nach Cleanup erneut registriert. Separate Normalfixture: ohne Abort genau ein Spinstart, vor Reveal kein Complete, korrekte ID-Ack nach Reveal, regulärer Duration-Timeout bleibt einmalig und Owner bleibt bis zur vorhandenen Delivery-Grace erhalten. Parallelfixture: alter abgebrochener Playback darf neue Reservation desselben Users nicht entfernen.
- Noch offen für Ownerentscheid: Assignment bleibt bei Abbruch nach synchronem Persistcommit erhalten; Setupdeadline stoppt bei erstem Spinstart; kein nachträglicher Overlay-Cancel im Setupfix. Diese Semantik minimiert Änderungen am normalen Spin-Lifecycle.

**Status:** verspätete Emit-/Reservation-/Ownerfolge im isolierten In-Memory-Harness reproduziert und an Originalmethoden/-kontrollfluss geprüft; Design und Negativfixture vorgeschlagen. Keine Tests ausgeführt, keine DB-/Datei-/Provider-/Liveaktion. Keine TTS- oder Talking-Heads-Produktänderung.
# Public-Distribution-Sperre für Closed-Beta-Plugins — 2026-10-07

## Befund und Umsetzung

- Die neue `app/config/plugin-release-policy.json` enthält elf Closed-Beta-IDs sowie `streamalchemy -> stream-monsters`. Ein `distribution-mode.json` liegt in diesem Entwicklungscheckout nicht vor; fehlender Marker bedeutet weiterhin lokale Entwicklung.
- Neuer gemeinsamer Prüfer `app/modules/plugin-release-policy.js`: Public-Marker filtert die IDs/Policy-Aliase. Ein beschädigter vorhandener Marker oder eine ungültige Policy sperrt fail-closed; fehlender Marker und andere gültige Channels bleiben lokal.
- PluginLoader filtert Beta-Manifeste nach dem Lesen/Validieren, blockiert direkte Loads/Enable-Aufrufe vor State-Schreibvorgängen und verbirgt Installations-/Enabled-Abfragen. Bereits gespeicherte User-States werden nicht verändert.
- PluginStore filtert Bundled-/Remote-/Community-Registries vor Cache und Listing, filtert installierte Statusdaten und blockiert `findPlugin`, direkte `installPlugin({ plugin })`-Aufrufe sowie extrahierte Pakete anhand der validierten Manifest-ID. Alternative Store-URLs und Dateinamen ändern die Manifestprüfung nicht.
- Manueller ZIP-Upload prüft den Policystatus nach Pflichtfeld-/ID-Validierung und vor Ersetzen oder Verschieben des Pluginverzeichnisses.
- Ein früher Express-Guard in `app/server.js` prüft `/plugins/:id/...` und `/api/plugins/:id/...` vor öffentlichem Static, Core-/Pluginrouten und Alias-Static. Er antwortet für Public-Beta-IDs und Aliase mit 404; lokale Channels werden durchgelassen.
- Distribution-Marker ist strikt: Abwesenheit erlaubt lokalen Dev-Modus, explizites `channel: "local"` ebenfalls. Ein vorhandener ungültiger/unbekannter Marker, eine ungültige Policy, doppelte IDs oder fehlerhafte Aliasliste sperren fail-closed. Aliasziele müssen zur Closed-Beta-Liste gehören.

## Geänderte Dateien

- `app/modules/plugin-release-policy.js` (neu)
- `app/modules/plugin-loader.js`
- `app/modules/plugin-store.js`
- `app/routes/plugin-routes.js`
- `app/server.js`
- `app/test/plugin-release-policy.test.js` (neu)

## Tests und Checks

- PASS: gezielte Jest-Suites `plugin-release-policy`, `plugin-store`, `plugin-store-routes`, `plugin-loader-id-alias-migration`: 4 Suites / 47 Tests.
- Public-vs-Local Fixtures decken elf IDs in Loader/Store, offizielle und Community-Remote-Registries plus Bundled-Fallback, Remote-Cache, direkte Enable-/Installaufrufe, ZIP-Upload mit beliebigem Dateinamen und geschlossene Alias-Manifest-ID ab. HTTP-Matrix prüft Public 404 für statische Plugin-Assets und kanonische `/api/plugins/:id`-Route, lokale Durchleitung sowie die Server-Middleware-Reihenfolge vor Static-/Pluginrouten.
- PASS: ESLint für die fünf geänderten Runtime-/Testdateien, ohne Ausgabe.
- PASS: auftragsbezogener `git diff --check` ohne Ausgabe.
- Frontend-Konsistenz geprüft: Plugin-Manager zeigt Storeaktionen ausschließlich für vom Backend gelieferte Einträge; die Filterung verhindert Beta-Katalogkarten. Keine Frontendänderung erforderlich.
- Teilweise geprüft: Ein früherer `plugin-store-registry.test.js`-Lauf hatte drei source-tree-Verifikationen wegen `spawnSync git EPERM`; die neue Fixture prüft stattdessen Remote-/Community- und Bundled-Registry-Filter direkt.
- Kein Serverstart, keine echten Liveaktionen und keine Userdaten-/Rollenänderung.

## Risiken und offene Entscheidungen

- Der Public-Marker wurde absichtlich nicht in diesen Entwicklungscheckout geschrieben. Root-Packaging/Installer muss `app/config/distribution-mode.json` mit `{ "channel": "public" }` in echte Public-Auslieferungen aufnehmen; bis dahin lässt sich die Public-Auslieferung hier nicht end-to-end prüfen.
- Public-Modus wurde mit isolierten temporären Marker-/Policy-Fixtures getestet, nicht mit gebautem Installer oder installiertem Produkt.
- Offen: Packaging-Owner bestätigt Marker-Provenienz und Aufnahme in alle offiziellen Installations-/Updatepfade. Der Backend-Schutz ist implementiert, aber Public-Auslieferungsabnahme bleibt davon abhängig.

## Follow-up: statische und Express-Routenisolation

- CEO wies auf einen möglichen Restpfad hin: ein Public-Build mit Quellen könnte Closed-Beta-Assets weiter über `/plugins/...` bedienen; Beta-API-Routen könnten ebenfalls registriert sein.
- Befund bestätigt: `server.js` registriert Core- und Pluginrouten vor dem statischen `/plugins`-Mount. Der Loaderfilter allein deckt direkte Assetrequests oder bereits registrierte Handler nicht als allgemeine Sicherheitsgrenze ab.
- Guard vor statischen und dynamischen Pluginrouten ergänzt. Isolierte echte Express-Fixtures bestätigen Public-404 für Music-Bot-/Stream-Monsters-Alias-Assets und Music-Bot-API, offene TTS-API und lokale Beta-Assets/API. Der echte Uploadhandler lehnt ein ZIP mit geschlossener Manifest-ID vor Installation ab; ZIP heißt absichtlich `arbitrary-name.zip`.
- Follow-up-Verifikation: 4 Suites / 47 Tests PASS; ESLint und bezogener Diff-Check PASS. Kein Server gestartet, kein Hostprofil und keine persistenten Daten verwendet.

## Read-only-Audit: offizieller Update- und Downloadpfad — 2026-10-07

### Provenienz und Unveränderlichkeit

- `version.json`, Root-/App-Paketmetadaten zeigen weiter 1.4.4; die Pages-Workflowdefinition lädt exakt `v${downloadVersion}` als unveränderliches GitHub-Releaseasset, prüft Manifestversion/Tag/Bytezahl/SHA-256 und übergibt das Archiv dem Pages-Builder.
- `release.yml` akzeptiert nur einen numerischen `vX.Y.Z`-Tag, dessen Commit exakt `origin/main` ist. Der App-ZIP wird aus diesem Tag-Checkout gebaut. Das Workflowskript lädt den vorhandenen Root-`launcher.exe` mit Signaturprüfung hoch, statt die geänderte Go-Quelldatei zu kompilieren. Quelländerungen an `build-src/launcher-gui.go` gelangen daher nicht allein durch den App-Releaseworkflow in ausgelieferte Launcher-Binaries.
- Das lokal vorhandene `app/ltth_latest.zip` ist ein 88,380,491-Byte-Archiv vom 2026-07-22 ohne Policy und ohne Public-Marker. Der Pages-Builder verwirft es erwartungsgemäß. Das unveröffentlichte 65.66-MiB-Previewartefakt aus dem Packaging-Owner-Bericht ist eine getrennte Provenienz; ich habe es in diesem Checkout nicht gefunden und beanspruche dafür keine eigene Prüfung.
- `app/modules/update-manager.js` führt Git-Updates nur bei sauberem Arbeitsbaum aus und `git reset --hard` auf upstream aus; die pfadgenaue Ignore-Regel hält den installer-generierten Marker lokal und dieser Reset entfernt keine ignorierte untracked Datei. Windows-Launcherupdates laden den GitHub-Release-Zipball; die geänderte Go-Quelle filtert dort nach Verzeichnisnamen und schreibt danach den Public-Marker.

### Bestätigte Rollout-Gates

- Pages-Builder filtert geschlossene ZIP-Pakete und lässt das alte App-ZIP ohne Public-Marker aus. Er kopiert aber `plugin-store.json` und `plugins.html` unverändert. Ein isolierter lokaler Pages-Build bestätigte alle elf Beta-IDs weiterhin sowohl im JSON-Katalog als auch in den statischen HTML-Karten; die aktuelle Pages-Oberfläche würde sie also weiterhin anbieten/anzeigen.
- `install/install.sh` und `install/install.js` klonen bei der offiziellen Branch-Installation den Quellbranch; sie schreiben keinen Public-Marker. Ohne Marker behandelt der Backendloader diese Quelle absichtlich als lokalen Dev-Modus. Der offizielle Windows-Latest-Pfad lädt dagegen Launcher-Release und versioniertes `ltth_latest.zip`; Releasebuilder erzeugt im neuen ZIP den Public-Marker und schließt bekannte Beta-Verzeichnisse aus.
- Release- und Go-Archivefilter vergleichen `app/plugins`-Verzeichnisnamen mit der Policy, nicht die `plugin.json`-IDs. Der Backend-Static-Guard prüft jetzt bei `/plugins/<dir>/...` zusätzlich Manifest-ID, Alias und `replaces`, daher bleiben umbenannte Beta-Assets im Public-Backend nicht erreichbar. Das verhindert aber nicht, dass ein umbenanntes Pluginverzeichnis als Quelltext in einem Release-ZIP landet.
- Minimaler sicherer öffentlicher Rollout: unverändertes 1.4.4 beibehalten; vor einer neuen Pages-Auslieferung muss der Websitebuilder `plugin-store.json` und `plugins.html` nach der Policy filtern oder die Quellkataloge müssen Beta-Einträge ausschließen. Vor neuen Linux/macOS-Installationen müssen offizielle Wrapper den Public-Marker erstellen (oder versionierte öffentliche Bundles verwenden). Der nächste numerische App-Tag muss die Release-Policy samt Manifest-ID-basiertem Archivfilter enthalten; ein passendes Launcherbinary mit geprüftem Extractor muss separat ausgeliefert werden. Danach Pages-Ausgabe und beide Installerpfade erneut prüfen. Keine breit angelegte Release-/Signingänderung wurde vorgenommen.

### Geprüfte Checks / Grenzen

- PASS: Backend-Regressionen nach Manifestpfadguard: 4 Jest-Suites / 47 Tests und gezieltes ESLint.
- PASS: Pages-Builder direkt mit gebündeltem Python auf temporärem Output ausgeführt; altes lokales 1.4.4-Archiv korrekt ausgelassen, alle elf Katalogeinträge/Karten im Output nachgewiesen; temporäre Ausgabe entfernt.
- Nicht ausgeführt: Jest-Wrapper `pages-release-bundle.test.js` konnte Python-Subprozesse in diesem Sandboxlauf nicht starten. Go-Extractor-Unit-Test ließ sich nicht kompilieren, da `launcher_test.go` im aktuellen Checkout mehrere Symbole (u. a. `writeLocalCommitSHA`, `GitHubTreeItem`, `detectUpdateMode`) nicht findet. Kein Installer, Launcher, Server, Release, Signing oder Deployment gestartet.
- Keine Dateien der offiziellen Installer, Pagesbuilder, Releasebuilder oder Go-Quelle in diesem Audit verändert; Backend-Manifestpfadguard und bereits vorherige punktgenaue Marker-Ignore-Regel bleiben die einzigen Implementierungsänderungen dieses Arbeitsstrangs.

## Read-only-Folgeauftrag: Clean-Snapshot-/Minimalabhängigkeitsplan

### Quellen- und Kandidatenprovenienz

- Repository-HEAD ist `285415787c5ea38433d5b6ae7e6a53cdc8410a38`; aktueller Arbeitsbaum hat 668 Statuszeilen, der Index ist leer. Keine der neuen Closed-Beta-Policy-Dateien/Gates ist als eigener Commit im HEAD enthalten. Bestehende Packaging-Baselines `2b2d8fb9b` (Secrets/Runtime-Daten) und `2b3b5b4af` (Profilverzeichnis) sind bereits im HEAD und sollten erhalten bleiben.
- Kandidat `output/closed-beta-candidate/closed-beta-source-preview.zip`: 68,852,762 Bytes (65.66 MiB), SHA-256 `e57a07624419201a6c52ffdf621f93a083833d43f455f4360602404d5a1d5d82`; Manifest nennt HEAD-SHA, `v1.4.4`, `candidateOnly:true`, `sourceDirty:true`. ZIP enthält genau einen Public-Marker, eine Policy und null `app/plugins/<closedBetaId>`-Treffer.
- Der Kandidat ist trotzdem kein freigabefähiger Snapshot: Er enthält 14 Dateien aus `app/.codex-isolated/quiz-reveal/` und `app/test_user_configs/testprofile_plugins_state.json`, die der Python-Releasebuilder derzeit nicht ausschließt. `APP_EXCLUDED_PREFIXES` braucht mindestens `.codex-isolated/` und `test_user_configs/`.
- Der Kandidat enthält `app/plugins/tts/main.js` bytegleich zum aktuellen Dirty-Arbeitsbaum, aber ungleich `HEAD` (Kandidat/Worktree SHA-256 `1adbd48d…586b661`, HEAD `c60a65df…8e9e6c`). Damit übernimmt er fremde uncommittete TTS-Arbeit. Kein Pfad unter `app/plugins/talking-heads/` ist im Kandidaten enthalten. TTS-/Talking-Heads-Arbeitsbaumänderungen dürfen nicht aus diesem Preview übernommen werden.
- Preview-Commit-SHA bindet wegen `sourceDirty:true` nicht den tatsächlichen Inhalt. ZIP bleibt intern und darf nicht als Releaseasset, Pages-ZIP oder Nachweis eines sauberen `v1.4.4`-Builds verwendet werden.

### Minimale Hunk-/Dateigruppen

**Release-/Runtime-Paket:**

- Policy und Runtime: `.gitignore`-Einzelregel, `app/config/plugin-release-policy.json`, `app/modules/plugin-release-policy.js`; Closed-Beta-Hunks aus `app/modules/plugin-loader.js`, `app/modules/plugin-store.js`, `app/routes/plugin-routes.js` und der frühe Request-Guard-Hunk in `app/server.js`; Regressionen in `app/test/plugin-release-policy.test.js`.
- Hunk-Isolation ist erforderlich: `plugin-loader.js` enthält zusätzlich Chatango-State-Tombstone und Enable-Disk-Preflight; `plugin-store.js` enthält Chatango-Entfernung; `server.js` enthält fremde Chatango-CSP-Änderungen. Diese Deltas dürfen nicht pauschal zusammen mit Closed Beta aufgenommen werden.
- Installer-Marker-Hunks liegen inzwischen in `install/install.sh`, `install/install.js` und `install/install.ps1`; nur diese gezielten `distribution-mode.json`-Schreibungen gehören zum Public-Installpfad. Keine vollständigen Installerdateien aus dem gemischten Arbeitsbaum übernehmen.
- `scripts/build_release_bundle.py` muss Policy/Marker und Beta-Ausschlüsse enthalten. Der aktuelle Filter schaut noch nach Verzeichnisnamen; im nächsten Release-Hunk auch Manifest-IDs plus `aliases`/`replaces` prüfen und `.codex-isolated/`, `test_user_configs/` ausschließen. Das Preview hat zwar keine bekannten Beta-Pluginverzeichnisse, beweist diese Renamed-Manifest-Grenze aber nicht.
- `build-src/launcher-gui.go` und `build-src/public_distribution_test.go` sind ein separater Launcher-Updatepfad. Extractor validiert Policy/Archive und blockiert inzwischen auch umbenannte Beta-Manifeste. Der gezielte Testbefehl `go test launcher-gui.go sysproc_windows.go public_distribution_test.go -count=1` PASS; kein vollständiger Go-Test und keine Launcher-Kompilierung/Signierung. Die Sourceänderung kommt erst über ein separat gebautes und signiertes Launcherrelease zu Nutzern.

**Nur Homepage/Pages:**

- `scripts/build_pages_bundle.py` filtert Plugin-ZIPs und lehnt altes App-ZIP ohne Marker ab; es kopiert derzeit aber `plugin-store.json` und `plugins.html` unverändert. Diese bleiben mit elf Beta-Einträgen/Karten offen. Minimal benötigt der Pages-Ausgabe eine policybasierte JSON-Filterung plus Entfernen der elf statischen Fallbackkarten und Regression im `app/test/pages-release-bundle.test.js`.
- `scripts/lib/published-plugin-catalog.js` enthält einen Policykataloghelper, ist im Pagesworkflow aber nicht verdrahtet. `scripts/build-features-hub.js` kennzeichnet Beta-Features, blendet sie nicht aus und wird vom gezeigten Pagesworkflow nicht aufgerufen; nur übernehmen, falls der konkrete Homepage-Workflow diesen Inhalt erzeugt.
- Root-`plugin-store.json` und `plugins.html` sind aktuell nur um Chatango bereinigt. Das ist kein abgeschlossener Closed-Beta-Katalogfilter. Website-Arbeit kann separat von Runtime/Release-ZIP ausgeliefert werden, braucht aber dieselbe Policyquelle.

### Snapshotplan und Prüfgrenze

- Keine Reset-, Clean-, Stage-, Commit- oder Push-Aktion aus dem 668-Zeilen-Mischbaum. Nach Freigabe der Hunkgruppen erst einen sauberen Snapshot aus einem explizit festgelegten Commit bauen; das Releaseworkflow verlangt später einen neuen numerischen Tag exakt auf `origin/main`. `v1.4.4` und bestehende Assets unverändert lassen.
- Für den sauberen App-Kandidaten nur Release-/Runtime-Hunks sowie freigegebene Installer-Marker aufnehmen; keine dirty TTS-Hunks und keine Talking-Heads-Dateien. Erst Kandidat neu bauen und prüfen: Manifest-SHA, Public-Marker, null Beta-Manifest-IDs/-Aliase in beliebig benannten Pluginverzeichnissen, keine `.codex-isolated`-/Testprofil-Dateien, konkrete Arbeitsbaum-/Commitprovenienz.
- Homepage danach als separaten Pages-Artefaktlauf prüfen: null Beta-IDs im deployten `plugin-store.json`, null Beta-Karten/Installlinks im `plugins.html`, null Beta-Paket-ZIPs und nur ein markervalidiertes App-ZIP. Die Owner-Helperarbeit allein ist kein Deploynachweis.
- Keine Veröffentlichung, kein Signing, keine Nutzerprofile/Runtimeversion verändert. Der gezielte Go-Policytest bestand; der zuvor geprüfte Backendlauf blieb 4 Suites / 47 Tests PASS. Der Jest-Pages-Wrapper hat weiterhin keinen Python-Spawn in dieser Sandbox; direkter Builderlauf war im vorigen Audit möglich.

## Follow-up: Distribution-Marker aus Git-Update-Status ausnehmen

- Der Packaging-Owner bestätigt, dass `app/config/distribution-mode.json` install-lokal generiert werden soll. Da der Update-Manager einen sauberen Git-Status verlangt, würde ein untracked Marker den automatischen Updatepfad blockieren.
- `.gitignore` enthält nun die root-relative Einzelpfadregel `/app/config/distribution-mode.json`; kein Marker wurde in diesem Checkout angelegt oder verändert.
- Verifikation: `git check-ignore -v --no-index app/config/distribution-mode.json` trifft exakt die neue Regel. `app/config/plugin-release-policy.json` und `elsewhere/distribution-mode.json` werden nicht ignoriert.
- Status: Änderung und Ignore-Scope geprüft. Keine Installer-/Packagingdatei, Updateausführung, Nutzerdaten oder Hostprofile verändert.

## Closed-Beta Rollout Acceptance Report (read-only, 2026-10-07)

### Geprüfte Gates

- **Originalquellen:** Alle 11 IDs aus `app/config/plugin-release-policy.json` haben weiterhin ein Quellverzeichnis und `plugin.json` unter `app/plugins/`. Die geprüften Manifest-SHA-256 sind: `animazingpal` `cf8f44a442cf29591c9ff23dc7c472cbd86671e2892a7eaae3b67d369f5a9278`; `interactive-story` `c2fbcc407844afcda0a9ecb06b8f02b0d69087191289fe1b4ee30351d0e107f1`; `music-bot` `c15ba91d9891e5a3a77763b1e477d990fd5b16997d161550afe282a057ccf510`; `osc-bridge` `434d3eda13894fdb8c7305b746fe6a5f1bdad996e6233ca6ffec5fd5c3fee244`; `schnorrbecher` `68197e8caef4b7b0b4b0bb81a6454e429eea7e724000108a1fbc0c49fd2b5585`; `sidekick` `70b0e60ad3d7fe62c82eccc136418b16e1cc94a0108320e2c240f2293c195db0`; `stream-monsters` `22c6c69851c8a2d992d6b1b67a8bd96c8d89d2781331386fa7f698d03e580a3c`; `talking-heads` `23ea6c777b03b4365b030c230ea192156cbefb758f3e34c07c6825669224dd5e`; `visual-fx-frame-webgpu` `0a891844a25ea846c2e4849997922de39b699ae8f2f31925c3b6b9773429c6bf`; `webgpu-emoji-rain` `ae738f329f2ea95370d07293c7692dc11887ad9d5c39a33fb5ffcc4c178c4ede`; `webgpu-weather-control` `235e811de10c2425c56c35c81e3cc32256cf770d5dcaba5b1048ffb2c061cfa0`.
- **Raw public catalog:** PASS: current root `plugin-store.json` has zero IDs matching the 11 closed-beta policy IDs (the `streamalchemy` alias is handled by release policy).
- **Website cards:** FAIL: `plugins.html` still contains all 11 closed-beta IDs as static `data-plugin-id` fallback cards. The page says these are deliberate fallback/crawler content; the client replaces them only after the catalog loads. `scripts/build_pages_bundle.py` copies root HTML and `plugin-store.json` directly, so the current source builder does not remove those static cards. A Pages output built from this source is not accepted as hiding the 11 IDs.
- **Installer markers:** Source hunks exist in all three wrappers: `install/install.js:605`, `install/install.ps1:1816`, and `install/install.sh:358` write `app/config/distribution-mode.json` with public channel metadata. Source presence only; no installer was executed and no installed app was checked.
- **App ZIP exclusions:** The current Python release builder excludes `.codex-isolated/`, `archive/`, `coverage/`, `logs/`, `node_modules/`, `output/`, `test/`, `test_user_configs/`, `user_configs/`, and `user_data/`. It also checks nested plugin manifests for closed IDs, aliases, and `replaces`, in addition to directory names. The current top-level app inventory has no other obvious test, profile, cache, log, or build-output directory outside these exclusions. Expected runtime/content directories (`config`, `docs`, `locales`, `modules`, `plugins`, `public`, `routes`, `scripts`, `tts`, `wiki`) remain included.
- **Artifact inventory:** Names, file counts, byte totals, and path-plus-size inventory hashes were computed only for candidate artifact directories; file contents and profile values were not printed or inspected. `.codex-isolated`: 14 files / 628,971 bytes / `26bded18e2c16fd435ae37699b7d849ff76dbcf5bba17cb0c202a1fcf40f0456`; `archive`: 5 / 326,505,042 / `2c899af042605db526b834e18d5a869bf729fa4bba11f429af8aab0b502969ae`; `coverage`: 21 / 1,398,543 / `602c444108eca400a8862d3af618c633a0604dac61e4219f9cf99b4c9e92a6a9`; `logs`: 0 / 0 / `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`; `node_modules`: 34,881 / 580,284,056 / `1833e62577f38cc1c8f266fded16a24d97fd407e2a3c5587769952f3a325a3ae`; `output`: 52 / 51,137,017 / `fa48eb13f50d700fd638317d7a370ea4ecaeed60bc61ecf5ac953c151bb35a6b`; `test`: 845 / 8,395,598 / `83f8fbae2f9130e5967e90ba9e8703351f02e74748288f799661999e80dabb8b`; `test_user_configs`: 1 / 278 / `e7e7cd5bb57514556c596297d47a6aff3583f03256dd09520cfbeffa3c556440`; `user_configs`: 2 / 205 / `490d6b358d92a0f20f028e8ef32733ce7cddee378fbf8a8275f4af6350ff1542`. Hashes cover sorted recursive relative paths and byte lengths, not file contents.

### Status and offene Gates

- **Behoben/geprüft:** Public `plugin-store.json`-Quelle enthält keine geschlossenen IDs; Installer-Quellmarker sind vorhanden; aktuelle Release-Bundle-Ausschlüsse umfassen die vorhandenen Test-, Profil-, Cache-, Log- und Output-Verzeichnisse sowie umbenannte Beta-Manifest-IDs/Aliase.
- **Fehlgeschlagen:** Statische Website-Fallbackkarten zeigen weiterhin alle 11 geschlossenen IDs; Pages-Builder kopiert diese HTML-Datei unverändert. Die Website-Akzeptanz ist damit offen.
- **Nicht geprüft:** Frisch gebautes finales App-ZIP, finales Pages-Bundle/Deployment, Installerlauf, installierte Marker, End-to-End-Updateverhalten und tatsächliche Auslieferung. Der frühere interne Preview-ZIP wurde nicht wiederverwendet; nach Freeze muss der Owner einen frischen Kandidaten erzeugen.
- **Änderungen in diesem Audit:** Nur dieser Bericht. Keine Produktdateien, Installer, Profile oder Live-/Release-Artefakte geändert. Keine Tests, Builds, Stage-, Commit- oder Push-Aktionen ausgeführt. `git diff --cached` war leer; der Arbeitsbaum enthält weiterhin zahlreiche parallele Änderungen.

## CEO-Folgeauftrag: GIPHY-Handler und getrennte Source-/Guide-/Store-ZIP-Kandidaten — 2026-10-07

### Befund

- Aktueller HEAD: `126ec4900c4285051e7f0bf39bd8587624e6714a`.
- `app/plugins/soundboard/main.js` registriert `/api/soundboard/gif-search` während `SoundboardPlugin.init()` über `registerRoutes()`. Der Handler verwendet `process.env.GIPHY_API_KEY || DEFAULT_GIPHY_API_KEY`; ohne ENV fällt er auf den eingebetteten Default zurück und ruft `axios.get` auf. Der direkte Originalhandler-Repro mit sämtlichen externen Abhängigkeiten und Axios gemockt bestätigte genau einen Provider-Stub-Aufruf bei nicht gesetztem ENV.
- Ein Test mit derselben exakten Route im Kandidaten blockiert bei nicht gesetztem ENV mit der vorhandenen `400 / needsApiKey`-Antwort. Ein synthetischer ENV-Wert bleibt als konfigurierte Quelle erhalten; Antwortform und Suchparameter bleiben bestehen.

### Umsetzung und Kandidaten-Freeze

- Ausschließlich interne Kandidaten unter `docs/coordination/output/giphy-source-guide-freeze-20261007/` angelegt. Keine Änderung an `app/plugins/soundboard/main.js`, `app/docs/EULERSTREAM_AUTHENTICATION_GUIDE.md`, `plugin-store.json` oder Produktdaten.
- Source-/Guide-Kandidat basiert exakt auf HEAD; nur der GIPHY-Default wird auf `null` gesetzt und nur das EulerStream-Beispiel auf `YOUR_EULERSTREAM_API_KEY` geändert.
- Separater Store-ZIP-Kandidat: 15 Einträge, nur `main.js`-Inhalt verändert; Entry-Reihenfolge/-namen, Zeitstempel, Kompression, Attribute und alle anderen entpackten Eintragsbytes stimmen überein.
- Freeze: Kandidaten-Manifest `freeze.json`, Hashliste `SHA256SUMS.txt`, isolierte Regressionen und Basisprovenienz liegen im genannten Ordner. Source-SHA-256 `588fc4156523f58ff3b6b0f62bdf92f61507c59ed0d9588f7a3f40fdca1585a6`; Guide-SHA-256 `197b8446bfe02896a69237679ebdf31a61a1d2d7f0faf0091596d3cb7c5bfe81`; Store-ZIP Original `dec4d9ecb032896b4cd1d355689ad5c1bfe5826ba957f00ed64fb201f4cc35ae`; Kandidat `435ae2de603d5abdc0ca8697074f3c00a2dee07bde543621f9b8fc9e38c2b4ac`.

### Prüfungen

- **PASS:** Node 22.14: echter Plugin-Init-/Route-Registrierungspfad gegen aktuellen HEAD mit vollständig gemocktem `axios`, Datenbank, Socket, Config, Cache, Rate-Limiter und Helpermodulen; ENV-unset-Fehler reproduziert ohne Netzaufruf.
- **PASS:** Derselbe registrierte Handler gegen Source-Kandidat: ENV unset blockiert; synthetischer ENV-Key wird durch die vollständig gemockte Providergrenze gereicht; Antwortvertrag bleibt erhalten.
- **PASS:** Source-/Guide-Kandidat ist jeweils eine einzige exakte Ersetzung gegenüber `git show HEAD`; Store-ZIP-Original ist bytegleich mit HEAD. Die 15 ZIP-Entries haben Parität bis auf die gezielte `main.js`-Änderung.
- **PASS:** Freeze-Hashliste vollständig geprüft.
- **Teilweise geprüft:** Jest konnte wegen Sandbox-`EPERM` bei `realpath` des Windows-Temp-Pfads nicht bis zur Testkollektion starten. Dieselben relevanten Regressionen liefen stattdessen mit direktem Node-/Python-Harness. Keine Jest-Suite oder Vollsuite als bestanden ausgegeben.

### Offene Entscheidung / Risiken

- `plugin-store.json` wurde nicht aktualisiert. Die Kandidaten-ZIP-Summe unterscheidet sich von der derzeitigen Katalogsumme; vor Katalogintegration ist CEO-Entscheidung erforderlich.
- Kein frisches vollständiges Source-ZIP oder Pages-Bundle gebaut. Bitte festlegen, ob die frische Basis von HEAD `126ec4900` mit beiden Source-/Guide-Patches und zusätzlicher Store-ZIP samt Katalogsumme gebaut werden soll, oder ob der Store-ZIP-Kandidat außen vor bleibt. Das frühere Release-/Pages-Build-Gate bleibt bis zu dieser Abstimmung offen.
- Nicht geprüft: echte GIPHY-Verbindung/Account, Pages-Ausgabe, Veröffentlichung oder Deployment. Kein Netzwerkzugriff, keine Provideranfrage, keine Veröffentlichung.

## 2026-10-07 — GIPHY Source-, Store- und Pages-Kandidat

Dieser Nachtrag löst die zuvor offenen CEO-Entscheidungen zu öffentlichem Soundboard, Store-ZIP und Katalogsumme ab.

### Befund

- Der Soundboard-Handler hatte einen eingebetteten GIPHY-Default-Fallback. Ohne `GIPHY_API_KEY` konnte der registrierte Suchhandler deshalb den Provider erreichen.
- Die EulerStream-Anleitung enthielt vier lange key-artige Beispielwerte.
- Der von CEO freigegebene Katalogumfang lässt Soundboard öffentlich. Das bereinigte Store-ZIP benötigt deshalb ausschließlich eine gezielte Aktualisierung von `plugins[id=soundboard].sha256`.
- Der Pages-Builder aus Basis `126ec4900` filterte öffentliche Store-Pakete und App-Ressourcen, aber keine geschlossenen Beta-Guides, zugehörigen Screenshots oder Chatango-Reste.

### Umsetzung

- Nur im isolierten Kandidaten den GIPHY-Default auf `null` gesetzt, vier Euler-Beispiele durch Platzhalter ersetzt, bereinigtes Soundboard-Store-ZIP aufgenommen und genau dessen Katalogsumme aktualisiert.
- Separater Pages-Filter im Kandidaten: 11 Closed-Beta-IDs plus `streamalchemy`-Alias, zugehörige Guide-Slugs und Screenshots sowie Chatango-Pfade entfallen. Öffentliche Marketingseiten mit Closed-Beta-Status und öffentliche Anwendungen bleiben erhalten.
- Die Root-Arbeitskopie-Produktdateien wurden für diesen Auftrag nicht verändert. Keine Live-Anfrage, Signierung, Veröffentlichung oder Deploy.

### Geänderte Dateien und Artefakte

- Review-Paket: `docs/coordination/output/giphy-pages-integrated-candidate-20261007/`.
- Minimaler Kernpatch: `SCOPED_CORE.patch` (4 Dateien: Soundboard-Handler, EulerStream-Guide, Soundboard-ZIP, `plugin-store.json`), SHA-256 `3a3748471a0d04885316150028a7cfcca74742ba03f913888d927308cb41d539`.
- Separater Pages-Filterpatch: `PAGES_FILTER.patch` (nur `scripts/build_pages_bundle.py`), SHA-256 `c7f67c0f1bed61121a3f714e2d24461665b846fb66e8ff63a459f535ef4592f6`.
- Source-ZIP-Kandidat: 68.135.218 Bytes, SHA-256 `bc654de03d4fe18d10f55c928e61a1fee1b0a436107403d7533dd161eea88fea`.
- Pages-Verzeichnis: 2.255 Dateien / 477.239.124 Bytes; Dateihashliste `PAGES_SHA256SUMS.txt`, deren SHA-256 `511ba6be00218f127656ba2fd8fb0896ccd0283a414c0db67f4c4dde79227ab7` ist.
- Prüfsummen, Basisprovenienz und Feldvergleich: `candidate-receipt.json`, `SHA256SUMS.txt`, `bundle-audit.json`, `TEST_RESULTS.md`.

### Tests

- **PASS:** isolierter Release-Asset-Builder auf Basis `126ec4900`, Version 1.4.4; nur Kandidatenartefakt erzeugt.
- **PASS:** isolierter Pages-Builder; Ausgabe enthält 31 öffentliche Store-Pakete, öffentlichen App-Marker, Soundboard und öffentliche Hauptseiten.
- **PASS:** registrierter Soundboard-Handler mit gemocktem Provider: ENV fehlt → Anfrage abgewiesen; synthetisches ENV → erwartete Providergrenze/Antwort; kein Netzwerk.
- **PASS:** Store-ZIP-Parität: 15 Einträge, ausschließlich `main.js`-Bytes geändert, alle anderen Bytes und Eintragsmetadaten gleich.
- **PASS:** Bundle-Audit: 11 Beta-IDs plus Alias, vier policy-owned App-Assets, zugehörige Beta-Guides/-Screenshots und Chatango-Runtime/-Guide/-Paket/-Screenshots fehlen; GIPHY-Default und key-artige Euler-Beispiele fehlen; öffentliche Apps bleiben.
- **PASS:** Katalogschema/-Version/-Paketpfad und alle anderen Einträge unverändert; genau das Soundboard-`sha256`-Feld entspricht dem Kandidaten-ZIP.
- **PASS:** beide Patches wurden gegen isolierte Basisdateien angewendet und rekonstruierten die Kandidatenbytes exakt.
- **Teilweise geprüft:** Jest wurde in diesem Kandidatenlauf nicht ausgeführt. Der frühere Versuch endete mit Windows-Sandbox-`EPERM` vor der Sammlung und zählt nicht als PASS.

### Verbleibende Risiken und offene Entscheidungen

- Die Source- und Pages-Bundles sind interne Prüfartefakte, keine freigegebene oder veröffentlichte Version. Keine reale GIPHY-Konto-/Providerprüfung, Signierung, Deployment- oder Live-App-Abnahme.
- Der zusätzliche Pages-Filterpatch ist separat vom vierteiligen Kernpatch gehalten und wartet auf CEO-Review, bevor er in irgendeinen Produktstand integriert wird.
- Nächster möglicher Schwerpunkt gemäß CEO-Rückmeldung: SuperFan-Ereignishistorie; vor Umsetzung isolierten Adapter-/Connector-Diff und Datenmodell abgrenzen. Keine Rollenableitung und keine ungeprüfte Änderung am zentralen TikTok-Adapter.

## CEO-Folgeauftrag: GIPHY-Pages Coming-Soon-Link-Audit — 2026-10-07

### Befund und Umsetzung

- Aktueller committed HEAD während des Laufs war `afcf36a44010b8c452dbc60c9831a7faa33d3f43`, mit `7ba4aedac` als Vorfahren. Der Pages-Kandidatenpatch `PAGES_FILTER.patch` (`c7f67c0f1bed61121a3f714e2d24461665b846fb66e8ff63a459f535ef4592f6`) ließ sich auf den exakten committed Builder anwenden.
- Der isolierte Test extrahiert den Builder, die Richtlinie, die vier kanonischen Locale-Seiten und deren lokale Referenzen ausschließlich aus `git show HEAD`, wendet den Kandidatenpatch nur im Prüfbaum an und führt den echten `build_pages_bundle.py` aus. Parallele uncommitted Änderungen an lokalem Pages-Builder und Locale-HTML wurden nicht als Input genutzt oder geändert.
- Deutscher Einstieg ist `features/index.html`; `features.html` ist nur ein Redirect. Jede der vier Zielseiten enthält 7 Coming-Soon-Karten. Alle 23 lokalen Links/Bildreferenzen pro Seite sind in HEAD vorhanden und im erzeugten Kandidaten erreichbar: 92/92. Die vier Seiten bleiben bytegleich zum committed Input. Ergebnis `PASS`, keine minimale Filterkorrektur erforderlich.

### Geänderte Dateien / Prüfungen

- Nur Berichts-/Fixtureartefakte unter `docs/coordination/output/giphy-pages-link-audit-7ba4aedac-20261007/` und dieser Koordinationsnachtrag. Keine Änderung an Produktcode, Pages-Registry oder Plugin-Store.
- `test-coming-soon-pages-links.py` baut eine isolierte 252-Datei-Link-Closure (19,83 MB) mit dem tatsächlichen Pages-Builder. Ergebnis: `final-head-run/RESULT.json`.
- Der erste Erkundungslauf verwendete versehentlich das deutsche Redirect-HTML `features.html` und meldete 0 Karten; die endgültige Regression testet den tatsächlichen deutschen Pfad `features/index.html` und besteht.

### Verbleibende Risiken / offene Gates

- Kein vollständiger Pages-Bundlelauf, kein Browserrendering, Deployment oder Publishing. Kein Netzwerk-, GIPHY-Account- oder Providerzugriff.
- `PAGES_FILTER.patch` bleibt ein isolierter Kandidat bis CEO-Review/Integrationsauftrag. Praktische OBS-Abnahme bleibt auf Nutzerwunsch ausgesetzt (0/104); dieser statische Audit nimmt keine der Prioritäten 2–6 ab.
## CEO-Folgeauftrag: Vollständiger Pages-Bundle-Audit — 2026-10-07

### Befund

- Auf committed Input `afcf36a44010b8c452dbc60c9831a7faa33d3f43` plus eingefrorenem Pages-Filter (`c7f67c0f1bed61121a3f714e2d24461665b846fb66e8ff63a459f535ef4592f6`) bestand der Policy-Kern: 24 Store-Einträge, 27 Docs-Index-Einträge, 31 ZIPs, keine der elf Closed-Beta-IDs/Alias in Catalog, Fallback oder Paketinhalt; App-Runtime-ZIP und vier policy-eigene Runtime-Assets fehlten im Build.
- Vollbundle zeigte interne QA-/Capture-Manifeste, Chatango-Daten in diesen Manifesten und Beta-Guide-Verweise in öffentlichen Docs/Sitemap. Außerdem waren 15 Store-Image-Pfade auf nicht publizierte App-Laufzeitdateien gerichtet. Die gelieferten 92 Karten-Links allein deckten diese Flächen nicht ab.

### Umsetzung

- Einen rein isolierten Pages-Fixkandidaten erstellt. Er entfernt interne QA-/Capture-Manifeste und Beta-Mockups, Beta-/Alias-/Chatango-Guide-Schlüssel aus allen vier Guide-Locale-JSONs, defekte Beta-Guide-Links und Sitemap-Einträge. Der Stream-Monsters-CTA und Sitemap-Pfad zeigen auf die tatsächlich gebaute Marketingseite.
- 15 Store-Bildwerte zeigen im Kandidaten auf vorhandene öffentliche Markenbilder. Das explizit referenzierte OG-Logo wurde aus demselben committed Basisstand übernommen. `streamalchemy-theme-test.html` entfällt wegen seines direkten Alias-Runtime-URLs.
- Keine Produktdatei im Root, kein `Bugstofix.md`, keine Daten, Version, Live-Instanz oder öffentliche Website geändert. Keine Veröffentlichung/Push.

### Geänderte Dateien und Artefakte

- Vollständiger Build und Scanner: `docs/coordination/output/giphy-full-pages-audit-afcf36a44-20261007/`.
- Finaler isolierter Kandidat, Patch, Belege und ZIP-Hashinventar: `docs/coordination/output/giphy-full-pages-fixcandidate-afcf36a44-20261007/`.
- Additiver Patch `PAGES_FULL_AUDIT_FIX.patch`, SHA-256 `ee5f4be7f9e249aee08740c061479262a2a59431da59e8b0d31cea739a34d142`; nur im Kandidaten vorbereitet, nicht auf Root angewandt.
- Root `scripts/build_pages_bundle.py` war bereits dirty und blieb durch diesen Auftrag unverändert. `Bugstofix.md` blieb unberührt.

### Tests

- **PASS:** echter Pages-Builder auf vollständigem isoliertem Input; finaler Kandidat 2.246 Dateien / 392.649.921 Bytes.
- **PASS:** HTML/CSS 5.034 Referenzen ohne Parserfehler; JSON 833 statische Dateireferenzen ohne fehlende Ziele.
- **PASS:** wiederholbarer `validate_full_pages.py` legt Referenzen, Sitemap, Locale-Filter, Policyflächen und 92 Marketingreferenzen in `validation.json` ab.
- **PASS:** Sitemap 80 URL- und 186 hreflang-Einträge; alle 266 lokalen Ziele vorhanden.
- **PASS:** 92/92 Coming-Soon-Referenzen (7 Karten × 23 Verweise × 4 Lokalisierungen).
- **PASS:** kein aktiver Chatango-Pfad, Beta-Guide-Link oder direkte Beta-Runtime-URL in geprüften HTML/CSS/JSON/JS/Sitemap-Flächen; alle vier Guide-Locale-Dateien ohne geschlossene IDs/Alias/Chatango-Schlüssel.
- **PASS:** Store-Katalog, Docs-Index, statischer Fallback und 31 Plugin-ZIPs gegen alle elf Closed-Beta-IDs und Alias geprüft.
- **TEILWEISE:** vier nicht durch diesen Filter verursachte Basislücken verbleiben: `/assets/mascot-sprite.png`, FAQ-Fragmente `features/#obs-integration` und `docs.html#troubleshooting`, sowie `docs.html#config-import` vom Config-Import-Feature.
- **NICHT GEPRÜFT:** Browserrendering, Deployment/Publishing, Installerstart und reales App-/Live-Verhalten.
- **BLOCKIERT:** keiner im isolierten statischen Kandidatenlauf.

### Verbleibende Risiken / offene Entscheidungen

- Der allgemeine `downloads/launcher.exe` bleibt als generischer Produktinstaller im Website-Bundle; er ist kein Closed-Beta-Pluginpaket. Entscheidung offen, falls „Downloadartefakte ausschließen“ auch den allgemeinen Installer umfasst.
- CEO-Review des isolierten Kandidatenpatches und separate Korrektur der vier bestehenden Basisreferenzen offen.
- Getrennte Sourcekonflikte: Auditbasis `afcf36a44`; beim Abschluss stand `origin/main` auf `82683a5bd` (Merge-Base `c646ec48`). Die Remote-Commits `0bb220f8f`/`82683a5bd` ändern Homepage/Header/CSS und vier Locale-Seiten; nicht gemerged oder in den Candidate kopiert. Websiteworker-Ergebnis bleibt separater Reviewpfad. CORE `3f6...` ist committed.
- Der alte Source-Payload `app/ltth_latest.zip` wurde nicht verändert; SHA-256 `9dc11717acde5fe3f880a7fcbc86931cd8650e35a543ff6496af3db7d236e3f4`; vom Website-Build ausgeschlossen. Kein separater Runtime-Release-Kandidat wurde in diesem Auftrag gebaut.

## CEO-Folgeauftrag: Runtime-Kandidat — Routen- und Startprüfung — 2026-10-07

### Befund

- Separater Kandidat aus committed Base `fde29a99d95222e8f441ffedc78df43e15ba0f06`: `docs/coordination/output/runtime-release-candidate-fde29a99-20261007/release-assets/ltth_latest.zip`, 68.148.574 Bytes, SHA-256 `dd82423c72aacae271194b5738e5554f6e94e577ffe0d1993772255b77d08404`; Sidecar SHA/Bytes/Commit stimmen.
- CRC, eindeutige ZIP-Einträge, öffentlicher Marker, Launcher-Parität sowie Ausschluss der 11 Beta-Pluginverzeichnisse, Alias-Verzeichnisse und Policy-Assets bestehen.
- Korrektur nach Provenienzvergleich: Der Kandidat enthält nicht die uncommittete `../../plugins/schnorrbecher/lib/config`-Abhängigkeit aus dem dirty Worktree. Der ZIP-Importer entspricht nach CRLF/LF-Normalisierung dem committed `fde29a99` (SHA-256 `0420a35d29b447a2738b8e2a12ecb04458ef0502bd593f9d63b958476b8e9b8d`) und verlangt `./schnorrbecher-state-schema`, das im Paket enthalten ist. Ein Beta-bedingter Startfehler wurde damit nicht bestätigt; Runtime-Start bleibt ungeprüft.
- Aktive Verweise auf entfernte Beta-Routen verbleiben unter anderem in `public-overlay-registry.js`, `public-overlay-access.js`, `dashboard.html` und `tiktok-studio-url.js`. Der bisherige Validator prüfte nur `/plugins/<id>`-Muster und übersah direkt geroutete Pfade.

### Umsetzung / geänderte Dateien

- Keine Produktdateien geändert. Kandidat, Inventar und `REPORT.md` liegen ausschließlich unter `docs/coordination/output/runtime-release-candidate-fde29a99-20261007/`.
- `Bugstofix.md`, Produktversion, Plugins, Profile, Rollen, Guthaben und reale Live-Daten blieben unverändert.

### Tests und Prüfergebnisse

- **Bestanden:** vorhandener Runtimebuilder auf committed Input; ZIP CRC/Inventar, Schema-1-Sidecar/Hash/Bytes, `{"channel":"public"}`-Marker und Launcher-Parität.
- **Teilweise:** erweiterte Prüfung der tatsächlichen Routen und statischer Importvergleich mit committed Source. Der Kandidat wurde nicht gestartet.
- **Nicht ausgeführt:** neue Regressionstests oder App-/Installerstart, weil der kleinste Quellfix in verbotene Bereiche fallen würde.

### Risiken und offene Entscheidung

- Vollständige Routenbereinigung erfordert eine Änderung der öffentlichen Overlay-Registry oder eine paketierte Registryfilterung. Das ursprüngliche Nutzerbriefing schließt öffentliche Overlay-Registrierung ausdrücklich aus; daher wurde die Änderung angehalten. Es wurde kein Profil-/Importerfix vorgenommen.
- **Behoben und geprüft:** Paket-/Manifestprüfungen wie oben.
- **Teilweise geprüft:** Routeninventar sowie Importer-Abgleich mit dem committed Source.
- **Blockiert:** Runtimekandidat mit vollständig bereinigten Beta-Routen; die verbleibende Änderung betrifft die explizit ausgeschlossene öffentliche Overlay-Registry.
- **Nicht geprüft:** Runtimestart, Installer, Veröffentlichung, produktive/live Nutzung.
- Detaillierter Bericht: `docs/coordination/output/runtime-release-candidate-fde29a99-20261007/REPORT.md`.

## CEO-Folgeauftrag: Read-only Reachability-Prüfung des Runtimekandidaten — 2026-10-07

### Befund und Scopequelle

- Exakter direkter Nutzerauftrag steht in Thread-Turn `01a10da8-ccec-7d53-ab17-d043483685cd`: „Keine Änderungen an Talking Heads, TTS, Profilmigrationen oder öffentlicher Overlay-Registrierung.“ Die allgemeine Autorisierung für direkte Folgeaufträge hebt diese ausdrücklich genannte Bereichsgrenze nicht auf.
- Der Public-Kandidat enthält weiterhin Beta-Pfade im `public-overlay-registry.js`; diese Einträge allein stellen jedoch keinen Routehandler oder lieferbaren Inhalt dar.

### Read-only Public/Local-Prüfung

- Aus dem exakten ZIP wurden nur Routing-/Policy-Module und deren benötigte Konfiguration in `runtime-route-fixture/` extrahiert.
- 10 direkte Middleware-Fixtures geprüft: registrierte direkte Overlay-Pfade passieren Public-/Release-Guards, enden mangels Beta-Pluginverzeichnis/Handler aber im erwarteten 404-Fallback. Plugin-Pfade wie `/plugins/stream-monsters/...` und `/plugins/music-bot/overlay.html` werden im Public-Modus vom Release-Request-Guard mit 404 gesperrt.
- Local-Modus: Guards lassen die Anfrage passieren; dieselben Pluginverzeichnisse/Assets fehlen in diesem Kandidaten und führen daher ebenfalls zum 404-Fallback. Das ist keine Aussage zum normalen Local-Source-Build, in dem lokale Plugins vorhanden sein können.
- Der exakte ZIP-PluginLoader enthält Beta-ID-Filter für Inventory/Enablement. Ein Scan der Nicht-Plugin-JS-Dateien fand keine entsprechenden direkten Handler-Registrierungen außerhalb der ausgeschlossenen Pluginverzeichnisse.
- **Ergebnis:** kein öffentlich erreichbarer Beta-Handler oder Beta-Asset in der begrenzten Fixture bestätigt; die Einträge sind in diesem ZIP derzeit ruhende Allowlist-Metadaten. Sie bleiben unnötige Routenreferenzen und zukünftiges Wartungsrisiko.

### Geänderte Prüfartefakte und Tests

- Keine Produkt- oder ZIP-Änderung. Prüfartefakte: `build-route-fixture.py`, `route-guard-fixture.js`, `route-guard-fixture-result.json`, aktualisierter `validate_runtime_candidate.py` und `REPORT.md` unter `docs/coordination/output/runtime-release-candidate-fde29a99-20261007/`.
- **Bestanden:** 10 direkte Middleware-Fixtures gegen die Routing-/Policy-Module aus genauem ZIP; Beta-Plugin-Verzeichnisse fehlen; Public-Pluginasset-Guard antwortet 404; Prüferstatus `PARTIAL_DORMANT_ROUTE_REFERENCES`; ZIP-CRC, SHA, Sidecar, Marker und Launcher-Parität bleiben gültig.
- **Nicht geprüft:** vollständiger HTTP-Dispatch/Serverstart. Express/Supertest Loopbackversuch scheiterte beim Connect zu `127.0.0.1` mit `EACCES`; direkter Middleware-Aufruf ist kein App-/Browsernachweis.

## CEO-Folgeauftrag: Runtime-/Website-Artefaktvertrag — 2026-10-07

### Befund und Provenienz

- Root `HEAD` ist weiterhin exakt `fde29a99d95222e8f441ffedc78df43e15ba0f06`, passend zu Sidecar und `source-receipt.json` des Runtimekandidaten. Der 797,685,760-Byte-Quellarchivhash stimmt mit Receipt überein (`004866f36975c51b980301f790468a47e7a33cb5f1cd13e80fd3aed59bb58871`). Builder und Plugin-Release-Policy stimmen ebenfalls mit den Receipt-Hashes überein; ihre ausgepackten CRLF-Dateien sind nach Zeilenendennormalisierung inhaltsgleich mit den committed Git-Blobs.
- Runtime ZIP `dd82423c72aacae271194b5738e5554f6e94e577ffe0d1993772255b77d08404` und Schema-1-Sidecar sind unverändert. Es gab keinen Neubau, Produktedit, Versionswechsel oder Release-Overwrite.

### Geprüfte Verträge

- `validate_runtime_candidate.py` lief erfolgreich. ZIP-CRC und eindeutige Pfade, Sidecar-Hash/Bytes/Commit/Version/Tag, `{"channel":"public"}`-Marker, Policy-Ausschluss der 11 Closed-Beta-IDs plus `streamalchemy`-Alias, Chatango-Abwesenheit und Launcher-Hash-Parität bestehen. Das Skript meldet absichtlich `PARTIAL_DORMANT_ROUTE_REFERENCES`, nicht Gesamt-PASS.
- Website-Worker prüfte dieselben ZIP-/Sidecarbytes im isolierten Website-Bundle: Store-Guard PASS (24 katalogisierte Pakete), Runtime-ZIP-Audit PASS (1,234 Einträge, keine Beta-/Chatango-Dateien), Release-Contract PASS und Marker-/Policy-Parität PASS. Sein begrenzter Website-Gate-Bericht meldet `fullPublicationPass=true`; das ist ausschließlich das Ergebnis dieses Artefakt-Gates und keine Veröffentlichungsfreigabe.
- Der Website-Nachweis stammt aus einem isolierten Kandidaten, Commit `8d3052e09208d57f83a096472169c8c16bda0ba5`, Bericht `docs/coordination/website-runtime-artifact-contract-review.md`. Am Root-Website-/Produktstand wurde nichts geändert.

### Offene Gates und Grenzen

- Runtime-ZIP enthält weiterhin direkte Routen-/UI-Verweise. Zehn vorherige Middleware-Fixtures bestätigten für den geprüften Kandidaten keinen erreichbaren Beta-Handler oder Beta-Asset; direkte Verweise sind hier ruhende Metadaten. Ein vollständiger HTTP-/Express-Dispatch scheiterte beim Loopback-Connect mit `EACCES`; Full-App-Start bleibt ungeprüft. Die ausdrückliche Nutzergrenze gegen Änderungen an öffentlicher Overlay-Registrierung bleibt bestehen.
- `version.json` enthält Verweise auf die separat gehosteten `install/install.*`-Skripte. Diese Installerdateien liegen nicht im Runtime-Quellarchiv/ZIP-Pathspec; Installerdownload, Installationslauf, Start, Update und Rollback wurden nicht geprüft.
- Nächster sinnvoller Gate-Schritt ist ein separat beauftragter, isolierter HTTP-/Startup-Vertragstest mit temporärem Zustand und ohne Produktprofile, oder eine CEO-Entscheidung, ob der begrenzte Fixture-PASS für die Website-Artefaktseite ausreicht. Keine Registryänderung oder Veröffentlichung ist Bestandteil dieses Nachweises.
- OBS bleibt laut aktueller CEO-Weisung zurückgestellt; keine Start-, Freigabe- oder VM-Aktion wurde durchgeführt. Dieser Zwischenauftrag nimmt keine der sechs praktischen Prioritäten ab.

### Geänderte Dateien / Tests / Status

- Nur diese Koordinationsdatei wurde aktualisiert. Runtime-ZIP, Sidecar, Quellstand und Website-Kandidat blieben unverändert.
- **Behoben und geprüft:** nichts am Produkt; erfolgreich geprüfter Runtime- und Website-Artefaktvertrag gemäß den oben abgegrenzten Checks.
- **Teilweise geprüft:** Website-/Runtime-Artefaktkette vollständig für die benannten Prüfpunkte; Routen bleiben `PARTIAL_DORMANT_ROUTE_REFERENCES`.
- **Blockiert / nicht geprüft:** vollständiger HTTP-/Express-Lauf wegen `EACCES`; Runtimestart und separater Installerlauf nicht geprüft. Keine Veröffentlichung.

### Status

- **Behoben und geprüft:** Kandidatenpaketfilter, Public-Asset-Guard sowie fehlende Beta-Handler/Assets im begrenzten Guard-Fixture.
- **Teilweise geprüft:** direkte Overlay-Einträge bleiben gelistet und passieren beide Gates, aber es wurde kein Handler/Asset gefunden; vollständiger Dispatch bleibt offen.
- **Blockiert:** Public-/Local-HTTP-Integrationstest durch Loopback-`EACCES`; keine Änderung der explizit ausgeschlossenen öffentlichen Overlay-Registrierung.
- **Nicht geprüft:** Full-App-Start, Installer, Veröffentlichung und reale Live-Nutzung.

### Nachtrag: isolierter Runtime-Start und HTTP-Versuch — 2026-10-07

- Der unveränderte Kandidat `dd82423c72aacae271194b5738e5554f6e94e577ffe0d1993772255b77d08404` wurde unter dem fixierten Node.js 22.14.0 und den gegen byte-identisches `package-lock.json` geprüften Workspace-Abhängigkeiten in einem frischen Dokumentations-Capture-Profil gestartet. Nur synthetische Plugin-/Profildaten lagen im Temp-Verzeichnis; externe Connectoren/Plugins waren deaktiviert.
- **Teilweise geprüft:** Der Prozess protokollierte `läuft`, Dashboard-/Overlay-URLs, lokales Bind-Setup und null geladene Plugins. Damit ist der App-Initialisierungspfad bis zur Ready-Meldung im isolierten Prozess belegt.
- **Blockiert:** HTTP-Healthcheck an `127.0.0.1:53095` schlug 40 Sekunden lang mit `Der Zugriff auf einen Socket war aufgrund der Zugriffsrechte des Sockets unzulässig` (`EACCES`) fehl. Die Listenerabfrage lieferte keine Adresse; der isolierte Prozess wurde danach beendet. Das trennt den Socket-/HTTP-Nachweis vom erfolgreichen Initialisierungspfad und erlaubt keine Aussage über erfolgreiche HTTP-Routen.
- **Aufräumen geprüft:** kein Node-Prozess blieb zurück; temporäres Profil wurde entfernt (`tempRootCleaned=true`), und es wurden keine Paketdateien verändert (`packageSideEffects=[]`). Keine Netzwerkfreigabe, kein Escalation-/Bypassversuch.
- Reproduzierbare Artefakte und Logs liegen unter `docs/coordination/output/runtime-startup-contract-dd824-20261007/`, insbesondere `run-isolated-startup.ps1`, `result.json` und `winston-app-2026-10-07.log`.
- Installer-Download, Installationslauf, Update/Rollback und HTTP-Dispatch bleiben **nicht geprüft**. Der Website-Artefaktbericht bleibt auf seine begrenzten Gates beschränkt; keine Veröffentlichung.

### EACCES-Ursachencheck des isolierten Starts — 2026-10-07

- Read-only-Quellabgleich ordnet den Fehler dem Client-Connect zu, nicht einem fehlgeschlagenen Server-Bind: `app/server.js:4555` registriert `onServerListening` als `server.listen`-Callback; `app/server.js:4082-4085` setzt darin den Serverstatus und schreibt die CORS-Ready-Logzeile. Der Run enthält diese Ready-/Dashboardmeldungen. Bind/Listen hat damit zumindest den `listening`-Callback erreicht.
- Der Server-`error`-Handler unter `app/server.js:4534-4552` beendet den Prozess bei sonstigen Listenerfehlern sofort; nur `EADDRINUSE` startet einen Fallbackportversuch. Der Prozess blieb bis zum Harness-Timeout am Leben. Das stützt ebenfalls, dass der beobachtete `EACCES` nicht der Server-Listenfehler war.
- `result.json` enthält den konkret abgefangenen Fehler aus `HttpClient.GetAsync("http://127.0.0.1:53095/api/health")`: `Der Zugriff auf einen Socket war aufgrund der Zugriffsrechte des Sockets unzulässig.` Damit scheitert die ausgehende lokale Client-Verbindung im eingeschränkten Hostkontext.
- Die `Get-NetTCPConnection`-Adresse bleibt **unbestimmt**, nicht „keine Listeneradresse“ als gesicherter Befund: Das Harness schluckt Fehler der Abfrage mit `catch { }`, und es wurden keine Adressen erfasst. Keine Firewall-, ACL-, Sandbox- oder Safety-Einstellung wurde verändert. Der frühere Prozess wurde kontrolliert vom Harness beendet und das Temp-Profil bereinigt.
- Keine Wiederholung erforderlich: vorhandene Quell- und Logbelege beantworten die konkrete Bind-vs-Connect-Frage. HTTP-/Routendispatch bleibt **blockiert / ungeprüft**. Nur ein separat genehmigter, unverändert sicher isolierter Lauf oder eine geeignete Testumgebung kann diesen Gatepunkt schließen; dieser Befund rechtfertigt keinen Netzwerk- oder Rechte-Bypass.

### Isoliertes Runtime-Harness: getrennte Zustandsbelege — 2026-10-07

- Der CEO beauftragte eine kleine Korrektur des Startup-Diagnose-Harnesses; es wurde kein weiterer Paket-/Serverstart ausgeführt.
- `run-isolated-startup.ps1` unterscheidet jetzt den Ready-Marker aus dem Serverlog, eine erfolgreiche/fehlgeschlagene Listenerabfrage, Client-Connect-Fehler, echte HTTP-Antwort und Shutdown-/Prozessende. Listenerabfragefehler liefern `status=error` und `localAddresses=null`, erfolgreiche Abfrage ohne owned listener `no-owned-listener`; diese Fälle sind nicht mehr als leeres Listenerarray zusammengefasst. Windows Socketcode 10013 wird auf Clientseite als `EACCES` klassifiziert. EACCES stoppt die Clientwiederholung ohne Rechteänderung.
- Die vorherige `result.json` sowie Logs/Startversuche wurden nicht überschrieben. Wiederholungsharness verweigert weiterhin die Überschreibung des vorhandenen Ergebnisbelegs. Korrekturzusammenfassung: `docs/coordination/output/runtime-startup-contract-dd824-20261007/HARNESS_CORRECTION.md`.
- **Tests:** synthetischer Harness-Test für Ready-Marker, Listenerquery-Exception, separaten Client-EACCES, kein HTTP-PASS und nicht versuchten Shutdown bestanden. PowerShell-Parserchecks für Script, Modul und Fixture bestanden. `git diff --check` für Statusdokumentation bestanden.
- **Grenzen:** kein neuer Runtime-/HTTP-Lauf; Health/Routes/Shutdown bleiben ungeprüft, Installer/Update/Rollback weiterhin NOT_CHECKED. Keine Produkt-, Profil-, Registry-, OBS-, Netzwerk- oder Systemrechteänderung.

### P1 Music Bot: Search-/Request-Rechte und Missbrauchsgrenzen (read-only) — 2026-10-07

- **Bestätigter Pfad:** Dashboard-Vorschau in `app/plugins/music-bot/assets/ui.js:763-792` ruft GET `/resolve` auf; der Anfrageknopf sendet separat POST `/request` mit `{query}` (`ui.js:799-813`). Die GET-Route in `app/plugins/music-bot/main.js:2519` löst direkt über `musicResolver.resolve()` auf. POST (`main.js:2559`) ruft `_handleDashboardRequest()` auf (`main.js:3417`), das nochmals auflöst und erst danach `queueManager.addSong()` ausführt (`main.js:3423-3447`). Ein Vorschau→Anfrage-Ablauf ruft den Resolver daher zweimal auf Route-Ebene; Resolvercache kann Providerarbeit vermeiden, aber die Tests beweisen keine Einsparung für den zeitlich getrennten Ablauf.
- **Rollen/Identität:** Chat-Requests laufen über `CommandParser`-Prüfungen (`main.js:3270`, `lib/command-parser.js:27-35`); Standardrecht ist `permissions.request='viewer'` (`main.js:150`), die optionale Superfan-Schranke wird dort berücksichtigt. Das Dashboard-POST ruft den Parser nicht auf und erhält aus dem Request-Body `username`/`requesterAvatar` mit Defaults `dashboard`/`null` (`main.js:2559-2571`). Die UI sendet keinen Namen; Requests daraus zählen somit unter `dashboard`. Andere Aufrufer können den Namen im Body frei setzen, wodurch die Queue-Limits pro normalisiertem Namen (`lib/queue-manager.js:367-384,832`) keine verifizierte TikTok-Identität abbilden. Erreichbarkeit des POST ist durch die API-Middleware eingeschränkt (siehe Auth unten).
- **Schutzgrenzen:** `app/server.js:429-436` lässt GET/HEAD/OPTIONS an der Admin-Auth vorbei und fordert Auth für Mutationen. `app/modules/admin-auth.js:54-91` erlaubt direkte Loopback-Aufrufe ohne Forwarding-Header; andere Mutationen benötigen Admin-Token. Damit ist `/resolve` für erreichbare Clients ohne diese Token-Schranke aufrufbar, während `/request` sie für nicht-loopback Aufrufer passieren muss. Eine plugin-spezifische Rate-Limit-Middleware ist bei den `PluginAPI.registerRoute`-Routen (`app/modules/plugin-loader.js:175-213`) nicht belegt; die allgemeine `apiLimiter`/`pluginLimiter`-Einbindung für andere Routen gilt hier nicht automatisch. Der Resolver begrenzt parallele yt-dlp-Prozesse standardmäßig auf 2 und die Warteschlange auf 100 (`lib/music-resolver.js:54-55`, `lib/yt-dlp-runner.js:25-42`), begrenzt aber nicht die Zahl der eingehenden HTTP-Aufrufe.
- **Queue-Verhalten:** Standardwerte sind max. 50 Queue-Einträge, 3 je Requester, 30 Sekunden Cooldown und keine Duplikate (`main.js:120-127`). Diese Grenzen greifen beim `addSong`; caller-gesteuerte Namen schwächen speziell Per-Requester-Limits. Der Chatpfad behandelt zusätzlich `_pendingRequests`, Bans und konfigurierte Like-/Pay-to-play-/Superfan-Gates (`main.js:3455+`); das Dashboard nutzt diese Chat-/Viewer-Gates nicht. Kein Zahlungspfad im Dashboard-Request festgestellt.
- **Vorhandene Regressionen, nicht erneut ausgeführt:** `app/test/music-bot-route-resolve-queue-null-mpv-optin.test.js:163-174` bestätigt zwei Resolver-Aufrufe für Vorschau plus Request; `app/test/music-bot-resolver-concurrency.test.js` prüft gleichzeitige Single-flight-Auflösung; `app/test/music-bot-queue-manager.test.js` und `app/test/music-bot-core-features.test.js:241-280` decken Queue-Limits/Cooldown ab; `app/test/music-bot-command-parser.test.js` deckt Chat-Commandberechtigungen ab. Keine gefundene Route-Regression für unauthentifizierten GET-Resolver-Spam, Route-Limiter, Dashboard-Identity-Spoofing oder Dashboard-Bypass der Chat-Gates.
- **Engste Regressionsempfehlung:** Isolierte Route-Fixtures mit gemocktem Resolver/Queue ergänzen: (1) konkrete Auth-/Rate-Limit-Policy für GET `/resolve` und POST `/request` festlegen und verifizieren; (2) Dashboard-Identität serverseitig binden oder Route ausdrücklich als Admin-only behandeln, dann gefälschte `username`/Avatar-Eingaben ablehnen/ignorieren; (3) den beabsichtigten Dashboard-Gate-Vertrag gegen Chat-Superfan-/Like-/Pay-to-play-Einstellungen festhalten. Optional Cacheassertion für Vorschau→Request ergänzen. Dafür wären Änderungen an gemeinsamem API-/Middleware-Verhalten zunächst mit dem Orchestrierungschat abzustimmen.
- **Status:** Befund **bestätigt durch Quellpfade**; keine Produktänderung und keine Tests/Provideraufrufe/Appstarts in diesem Audit. Live-Erreichbarkeit, reale Token-/Proxy-Konfiguration und Providerverhalten **nicht geprüft**. Keine realen Zuschauer- oder Queue-Daten berührt.

### P1 Music Bot: Fix-/Testvertrag und Route-Integration — 2026-10-07

- **Freigabe/Umfang:** CEO bestätigte die Limits und gab anschließend die Integration ausschließlich in die beiden Music-Bot-Routen frei. Keine globale Auth-/Middleware oder Server-/NetworkManager-Konfiguration wurde geändert. Fremde Installationsroute-Hunks in `main.js` blieben erhalten.
- **Request-Identität:** Dashboard-POST `/request` verwendet serverseitig immer `username: 'dashboard'` und `requesterAvatar: null`. Body-Werte `username` und `requesterAvatar` werden ignoriert (nicht validiert und weitergereicht). Queue pro Requester/Cooldown bleiben bestehen, zählen Dashboard-Requests aber unter einem gemeinsamen Dashboard-Schlüssel. Chat-Requests behalten unverändert TikTok-Username/Avatar und ihren eigenen Rollen-/Superfan-/Like-/Pay-to-play-Vertrag. Dashboard gilt als Adminfunktion; Chat-Viewer-Policy wird nicht auf den Dashboard-Pfad übertragen.
- **Getrennte Ratenlimits:** eigenständige IP-basierte Limits auf GET `/resolve`: 30 Requests pro IP und 60 Sekunden; POST `/request`: 10 Requests pro IP und 60 Sekunden. Beide Limits laufen vor Query-Prüfung und Resolver/Queue-Aufrufen und gelten für Loopback genauso wie andere Adressen. Nach CEO-Review wird als Zählidentität die direkte Socket-Peer-IP `req.socket.remoteAddress` genutzt; weder `req.ip` noch `X-Forwarded-For` werden vertraut. Damit teilen sich legitime Besucher hinter demselben Proxy dessen Zähler. Ein 429 muss ohne Resolver- oder Queue-Aufruf zurückkommen. Das begrenzt Requests pro Peer und Prozess; es ist keine globale Auth-Änderung oder verteilte Rate-Limit-Garantie.
- **Route-Integration:** GET `/api/plugins/music-bot/resolve` und POST `/api/plugins/music-bot/request` registrieren ihren Limiter jeweils als ersten `PluginAPI.registerRoute`-Handler. `registerRoute` unterstützt mehrere Handler (`app/modules/plugin-loader.js:175-213`); GET bleibt von der bestehenden `/api`-Admin-Auth-Ausnahme betroffen, POST bleibt unter vorhandener Mutation-Auth (`app/server.js:429-436`, `app/modules/admin-auth.js:54-91`). Keine globale API/Authänderung.
- **Stub-Route-Regressionen:** `app/test/music-bot-dashboard-request-routes.test.js` führt die registrierten Handlerlisten mit Stub-Resolver und Stub-Queue aus. (1) 31. GET und (2) 11. POST liefern 429 vor Resolver/Queue; (3) Budgets bleiben getrennt; (4) gleicher Socket-Peer bleibt trotz variierendem `req.ip`/XFF derselbe Client; (5) unterschiedliche direkte Peer-IPs erhalten separate Budgets; (6) gefälschte Body-Felder werden nicht übernommen und Queue-Einträge erhalten `requestedBy='dashboard'`, `requesterAvatar=null`; (7) `Retry-After` und `MUSIC_BOT_RATE_LIMITED` sind für den UI-Client vorhanden.
- **Null-AO-End-to-End-Fixture:** Auf CEO-Auftrag wurde `app/test/music-bot-route-resolve-queue-null-mpv-optin.test.js` korrigiert: der Teststub speichert jetzt alle registrierten Handler und führt die Middlewarekette samt `next()` aus, mit Loopback-Socketpeer. Die synthetische lokale WAV läuft durch Resolve-Route, Request-Route, Queue, Controller und eigenen MPV-Prozess mit `--ao=null`. Spoofed username/avatar bleiben wirkungslos; Now Playing trägt `requestedBy='dashboard'` und `requesterAvatar=null`. **1 Suite / 1 Test PASS**; PID-Ownership, Exitcode 0, leere Ownership-Menge, geschlossene DB und Temp-Cleanup bestätigt. Kein hörbarer Ton, Provider, App oder Liveaktion.
- **Gesamtlauf:** Node-22/Jest: Opt-in-Integration plus Route-Limiter, Rate-Limit-Fixture, Core-Features, Commandparser und Resolver-Concurrency: **6 Suites / 107 Tests PASS**. Die Core-Suite enthält CEO-autorisierte Korrekturen zweier Fake-Child-Fixtures; keine Produktverhaltensänderung.
- **UI-Kompatibilität/Abnahme:** bestehende UI sendet bereits nur `{ query }` (`app/plugins/music-bot/assets/ui.js:799-813`); der Replay-Endpoint verwendet fest `'dashboard'` (`main.js:2843`). Queue-Limits/Cooldown gruppieren alle Dashboard-Requests unter demselben Namen. Die UI-429-Übersetzung liegt beim parallelen Overlay-Worker und ist hier nicht geändert/geprüft.
- **Proxy-Tradeoff:** CEO akzeptierte die direkte Socket-Peer-IP als Sicherheitsvorgabe. Sie verhindert XFF-Rotation auch bei `trust proxy=1`; mehrere Nutzer hinter demselben Proxy teilen dessen Budget. Lokale Tunnelclients, deren Peer `127.0.0.1` ist, teilen ebenfalls einen Bucket. Das ist fail-closed; kein expliziter Proxy-Allowlistpfad und keine globale Proxyänderung.

### Umsetzung und integrierte Tests des Rate-Limit-Moduls — 2026-10-07

- CEO bestätigte die route-lokalen Grenzwerte 30/min für Resolver-Vorschau und 10/min für Dashboard-Submission. Neu hinzugefügt wurden `app/plugins/music-bot/lib/dashboard-request-rate-limit.js`, `app/test/music-bot-dashboard-request-rate-limit.test.js` und `app/test/music-bot-dashboard-request-routes.test.js`; Integration erfolgte ausschließlich in den beiden freigegebenen Routen von `main.js`.
- Beide Middleware-Instanzen verwenden ausschließlich `req.socket.remoteAddress`; IPv6 wird über `express-rate-limit` `ipKeyGenerator` auf /56 gruppiert. `127.0.0.0/8`, `::1` und IPv4-mapped Loopback-Adressen werden auf einen gemeinsamen Schlüssel normalisiert, damit Familienwechsel keinen zweiten Pool öffnet. Pro Route sind höchstens 10.000 Schlüssel gespeichert; abgelaufene Buckets werden zeitgeordnet beim nächsten Request aus dem Map-Präfix entfernt. Bei voller Kapazität wird geschlossen mit 429 abgewiesen, aktive Einträge werden nicht verdrängt. Zähler sind pro Prozess und werden beim Prozessende verworfen; keine globale API-/Auth-Middleware wurde verändert.
- **Tests:** Limiter-Suite **1 Suite / 10 Tests PASS**; Route-Suite **1 Suite / 3 Tests PASS**; zusammen mit Core-Features, Chatparser, Resolver-Concurrency und Null-AO-Opt-in **6 Suites / 107 Tests PASS**. Abgedeckt sind exakte 30-/10-Grenzen, Abbruch vor Handler, getrennte Budgets, Loopbackfamilien, direkte Peer-IP statt `req.ip`/XFF, IPv6, 60-s-Ablauf, Store-Cap, fail-closed und feste Dashboard-Identität.
- **Proxy-Tradeoff:** mit direkter Socket-Peer-IP kann ein Client bei `trust proxy=1` sein Zählbucket nicht per XFF rotieren. Mehrere Benutzer hinter demselben Reverse-/Tunnel-Proxy teilen aber dessen IP-Budget; bei Proxy-Peer `127.0.0.1` teilen außerdem alle dort weitergeleiteten Nutzer ein Bucket. Die Route-Limits schützen damit gegen Caller-Rotation, können hinter Proxy/Tunnel für legitime Nutzer früher drosseln. Das ist bewusst fail-closed; keine Proxy-Allowlist oder globale Trust-Proxy-Änderung vorgenommen.
- **Verbleibende Grenze:** Der Null-AO-End-to-End-Weg verwendet einen lokalen synthetischen Treffer; Provider-Playback, hörbarer Queue-Handler, reale Proxyverteilung und UI-429-i18n bleiben ungeprüft. Die UI-429-i18n liegt beim Overlay-Worker. Keine Provider-/App-/Liveaktionen.

## Public-Overlay-Folgeprüfung Viewer-XP / Sidekick — 2026-10-08

### Befund
- Viewer-XP-Profile und Leaderboards projizieren bereits begrenzte Darstellungsfelder; IDs, Rohprofilwerte und Coins gehen nicht in diese DTOs. Der Level-up-Projektor enthielt zusätzlich frei konfigurierbare `announcement_message` und `special_effects.animation`; diese Felder sind nicht Teil der genehmigten öffentlichen Viewer-XP-Feldliste.
- Sidekick-Chat-/Gift-Feed begrenzt Anzeigenamen, Nachrichtentext und Giftname und entfernt Rohpayloads/IDs. Der separate `sidekick:public-status` DTO sendet zusätzlich `muted`, `chatsPerMinute`, `totalGifts`, `totalFollows` und `activeViewers`. Das ist ein eigener Statusvertrag und muss gegenüber der Freigabe „Name, gekürzter Chattext, Giftname“ ausdrücklich abgegrenzt werden.
- Die parallele Entfernung von `createPublicReleaseEventGuard` lässt sich nicht durch statische Allowlist/Projektion ersetzen: Der Baseline-Ownerkatalog enthält 119 ausgehende und 9 eingehende Ereignisse; die aktuelle Registry lässt alle 128 zu. Von den ausgehenden Ereignissen haben nur 23 einen zentralen Projektor, 96 fallen ohne Projektor durch. Die HTTP-Plugin-Release-Policy bleibt bestehen, schützt aber nicht denselben Socket-Pfad. Hunk-Eigentümer nicht festgestellt; keine Änderung an diesen Dateien.
- Der bestehende Dirty-Diff in `scripts/lib/published-plugin-catalog.js` weist `publicAssetPathOwners` zurück, obwohl `app/config/plugin-release-policy.json` das Feld weiter enthält und `app/modules/plugin-release-policy.js` es im Public-Modus benötigt. CEO-Lauf: 7 Chatango-/Closed-Beta-/Release-Suiten, 5 PASS und 2 FAIL (6 Tests) wegen dieses Schema-Mismatches. Ownership ungeklärt; nicht geändert.

### Umsetzung
- `projectPublicLevelUp` sendet nur noch Benutzername, alte/neue Stufe sowie begrenzten Titel und Farbwert. `announcement_message` und `special_effects` werden entfernt. Der Vertragsfixture prüft diese Felder mit Canaries.

### Geänderte Dateien
- `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-xp-impl.js`
- `app/test/public-overlay-viewer-xp-contract.test.js` (untracked, erhalten)
- Diese Koordinationsdatei.

### Tests
- Frühere fokussierte Jest-Matrix nach Änderung: 6/7 Suiten, 369/370 Tests PASS; die eine verbleibende Source-Contract-Suite scheitert an drei nicht registrierten Ereignissen (`wheel:spin-complete`, `goals:animation-end`, `tts:playback:ended`), nicht an Viewer-XP-/Sidekick-Assertions. Separater Socket-Adapterlauf: 1 Suite / 13 Tests PASS.
- In diesem Abschlussversuch: `node --check` und scoped `git diff --check` PASS. Jest startete nicht, weil die Sandbox `realpath` auf System-Temp mit `EPERM` verweigerte. Es wurde kein Freigabebypass versucht.

### Verbleibende Risiken / offene Entscheidungen
- Owner-Guard-Diff nicht ohne geklärte Zuständigkeit zurückändern oder akzeptieren; Public-Mode Socket-Freigabe bleibt offen und sicherheitsrelevant.
- CEO soll klären, ob separate anonyme Sidekick-Statuszähler und `muted` überhaupt öffentlich freigegeben sind oder ob dieser Socket-/HTTP-Statusvertrag ebenfalls auf die engere Feldliste reduziert werden soll.
- `publicAssetPathOwners` Parser-/Policy-Schema benötigt gemeinsame Owner-Entscheidung und kompatible Regressionen. Keine Veröffentlichung, kein Push, keine Liveaktion.

### Status getrennt
- **Behoben und geprüft:** Viewer-XP-Level-up-Projektion auf genehmigte Darstellungsfelder begrenzt; Testassertionen vorhanden und im vorherigen fokussierten Lauf grün.
- **Teilweise geprüft:** Viewer-XP/Sidekick sowie Access-/Registry-Fixtures; gesamte Matrix hat einen unabhängigen Source-Contract-Fehler.
- **Blockiert:** Public-Mode Socket-Owner-Guard und Sidekick-Statusfeld-Freigabe benötigen Entscheidung/Ownership.
- **Nicht geprüft:** Provider, Produktprofile, OBS, reale Zuschauer-/Guthaben-/Rollenaktionen oder Veröffentlichung.

## SuperFan displayType-Heuristik — Nutzerentscheidung und Charakterisierung — 2026-10-08

- Nutzerentscheidung über CEO: die aktuelle `displayType`-Substring-Heuristik bleibt vorläufig bestehen. Das ist eine bewusste zeitlich begrenzte Produktentscheidung trotz fehlender EulerStream-/TikTok-Semantikbestätigung; Restrisiko bleibt, dass neue/zusammengesetzte Texte falsch als SuperFan eingeordnet werden. Keine Erweiterung der Freigabefelder und kein Beleg providerseitiger Laufzeit.
- Produktive Klassifikation unverändert. Reine Charakterisierung in `app/test/eulerstream-superfan-display.test.js` dokumentiert: unbekannter Marker wird verworfen; `ttlive_superfanbox` wird ausgeschlossen; umhüllter generischer Marker, `ttlive_superfanish` und unvollständiger `ttlive_superfan_joined`-Near-Match werden aktuell als generisches `superfan` akzeptiert; Join-Marker priorisiert generischen Marker; fehlender/mehrfacher Actor sowie derselbe Actor doppelt über beide Textfelder werden verworfen.
- Geprüft: `app/test/eulerstream-superfan-display.test.js` **1 Suite / 18 Tests PASS**; ausschließlich synthetic SDK-v2 Decoder-Fixtures. Jest nutzte temporären Preload für bekannten Sandbox-`realpath`-EPERM, danach Preload/Cache entfernt. `node --check` und scoped `git diff --check` PASS.
- Nächste sichere Verifikation: beim nächsten isolierten Contract-Test unverändert auf Providerbestätigung warten; ohne Live-/API-Verkehr kann nur Codecharakterisierung geprüft werden. Keine API-/Schlüssel-/Live-/OBS-/Profilaktion.

## Passiver EulerStream-SuperFan-Live-Probeplan — vorbereitet, nicht ausgeführt — 2026-10-08

### Harte Vorbedingungen

1. **Keine Verbindung in diesem Auftrag.** Ausführung erst nach einer direkten Nutzerbestätigung, die ausdrücklich die Verwendung des benötigten EulerStream-Fallback-Schlüssels für genau diese passive Probe deckt. Das bestehende Fallback-Bestätigungspopup/der Consent-Gate wird nicht durch ein vorab gesetztes `fallbackKeyConfirmed` oder einen Umweg ersetzt. Ohne eindeutiges „Ja“: **BLOCKIERT / NOT_TESTED**, keine Keyauflösung und kein Netzwerk.
2. Direkt vor dem freigegebenen Versuch muss `die_maetzchen` manuell über eine öffentliche, nicht angemeldete Oberfläche als aktuell live bestätigt werden. Keine Verfügbarkeit: abbrechen; Zustand und beide Ereignistypen bleiben **NOT_TESTED**. Keine automatische Room-/Gift-REST-Abfrage zur Verfügbarkeitsprüfung.
3. Einmaliger, eng begrenzter Child-Prozess; maximal 10 Minuten nach bestätigtem Live-Zustand. Genau eine Verbindung und höchstens ein bestätigter Fallback-Keyversuch. Kein automatischer Reconnect und keine Key-Rotation. Schlüsselquelle muss intern als Fallback bestätigt sein; wenn Resolver stattdessen einen normalen Nutzer-Key auswählt oder mehr als ein Versuch nötig wäre, sofort abbrechen. Keymaterial bleibt ausschließlich im Prozessspeicher.

### Isolierte Ausführung

- `TikTokConnector`/EulerStreamAdapter ausschließlich mit `context: { mode: 'secondary', sourceId: 'superfan-probe' }`. Der Secondary-Modus unterdrückt globale Socket-Emits und DB-Persistenz. Injizierte DB-Sentinel-Methoden brechen bei jedem Aufruf ab; `_getDatabaseSetting` liefert im Harness `null`, sodass keine DB-Leseaktion für Keyauflösung stattfindet. Akzeptiert wird nur ein als Fallback markierter Resolver-Status; Secret, Maskierung, Quelle im Detail oder Kandidatenwerte werden nicht ausgegeben.
- Stiller Logger als Abnehmer aller Adapter-Logs: der aktuelle Adapter protokolliert sonst einen Key-Präfix/-Suffix sowie bei Parsefehlern einen Datenpreview (`EulerstreamAdapter.js:544`, `774`, `805`, `815`). Child-stdout/stderr werden verworfen; Parent erhält nur sanitisierten Abschlussstatus/Zählwerte. Falls der Harness diese Logunterdrückung/DB-Sperre nicht vor dem Connect sicherstellen kann: nicht verbinden.
- Nur lokaler Listener auf `superfan-display`; keine Plugin-/ClarityHUD-Initialisierung, kein Subscribe-/Gift-/Chat-/Like-/Join-Listener und kein öffentlicher Socket. Adapter-`_registerEulerstreamEvents` bleibt im Probeprozess ohne Handler, damit generische Ereignisse nicht intern als normale Aktivität weiterverarbeitet werden. `_schedulePostConnectTasks`, `_startLiveTracking` und `_startStreamWatchdog` werden im isolierten Harness vor Connect zu No-ops, um Room-/Gift-REST-Aufgaben und Hintergrundarbeit auszuschließen. Die rohe Barrage wird ausschließlich im Speicher durch den bereits vorhandenen DTO-Projektor verarbeitet und danach verworfen.
- Jede empfangene Anzeige wird vor Auswertung nochmals auf exakt `eventType`, `displayName`, optional `level`, optional `profilePictureUrl` begrenzt. Zulässig sind nur `superfan`/`superfan-join`, nichtleerer Name bis 80 Zeichen ohne Kontrollzeichen, optional Level 0–999 und optional HTTPS-Avatar über `projectViewerXpAvatarUrl`. Bericht enthält nur Typzähler und boolesche Feldvalidierungen, niemals Namen, URLs, Levelwerte, IDs, Room-/Sessiondaten, Rohpayload oder Schlüssel.

### Erfolg, Teilbeleg und Abbruch

- **Positiver Live-Beleg nach aktueller Heuristik:** Stream wurde als aktuell live bestätigt und die isolierte Verbindung ist tatsächlich im Zustand `live`; der Adapter emittiert mindestens einmal `eventType='superfan'` und mindestens einmal `eventType='superfan-join'`; beide Events bestehen die DTO-Validierung; die Counts und Feldvalidierungs-Bools sind im Child-Prozess entstanden und nur nach Projektion an den Parent gegeben. Keine weiteren Eventtypen werden als Erfolg angerechnet.
- Da EulerStream die Markersemantik nicht offiziell dokumentiert und der Nutzer die Heuristik nur vorläufig beibehalten hat, lautet die Aussage ausschließlich **„live beobachtet und von aktueller displayType-Heuristik klassifiziert“**. Das ist kein unabhängiger Nachweis kanonischer Provider-Semantik.
- Wenn nur einer der beiden Typen erscheint, ist nur dieser Typ live beobachtet; der jeweils andere bleibt **NOT_TESTED**. Wenn bei bestätigtem Livezustand 10 Minuten lang kein passendes Event auftritt, bleiben SuperFan und/oder Join **NOT_TESTED** (kein Negativbeweis und kein Fehlerbefund). Nichtverfügbarkeit, Auth-Fehler, unerwarteter Nicht-Fallback-Key oder nicht abschaltbare Nebenaufgabe beendet die Probe sofort und wird getrennt als Abbruchursache notiert.
- Sofort nach beiden Typen, bei 10-Minuten-Limit oder bei jedem Abbruch: in `finally` Listener entfernen, `disconnect()` aufrufen, Socket-Zustand `null`/inaktiv bestätigen, Heartbeat/Timer abstellen, Child-Prozess regulär beenden. Elternprozess erzwingt nach kurzer Cleanup-Frist Prozessende und inventarisiert, dass kein Probe-Child/Socket übrig ist. Keine aus der Probe abgeleiteten dauerhaften Queue-/Rollen-/DB-Einträge.

### Gelesene Umsetzungsstellen

- Consent-/Key-Gate und Keyauflösung: `app/modules/adapters/EulerstreamAdapter.js:396-445,505-570,3476-3557`.
- Riskante Standardlogs und Raw-Preview-Pfade, die im isolierten Probeprozess still verworfen werden müssen: `app/modules/adapters/EulerstreamAdapter.js:544,738-817`.
- Streambestätigung, Start von Tracking/Post-Connect-Aufgaben und Abschaltpfade: `app/modules/adapters/EulerstreamAdapter.js:960-1023,1079,1240-1296,2940-2974`.
- Secondary-Modus-/Eventforwardingverhalten: `app/modules/tiktok.js:17-39,77-109`.
- Begrenzte Anzeigeprojektion: `app/plugins/clarityhud/lib/superfan-classifier.js:13-97` und `app/modules/public-overlay-payload-projection.js` (`projectViewerXpAvatarUrl`).

### Status

Plan erstellt und Codepfade gelesen; **kein Probeprozess, keine Keyauflösung, kein Verfügbarkeitscheck und keine Verbindung ausgeführt**. Keine Sourceänderung. Erforderlich vor Umsetzung: ausdrückliche Schlüssel-/Probe-Bestätigung und ein einmaliger Review, dass der Probe-Harness alle Guards vor `connect()` installiert.

### Ergänzung zur Einmalverbindung

`_handleWebSocketClose` kann `_scheduleReconnectTimer('_autoReconnectTimer', ...)` anfordern (`EulerstreamAdapter.js:2568,2743-2757`). Der künftige Harness muss nur Reconnect-Timer (`_autoReconnectTimer`) fail-closed verwerfen und den Fehlerstatus intern setzen; Validierungs-/Connect-Timeouts bleiben aktiv. Ein Close, Auth-/Protokollfehler oder Retrybedarf beendet sofort den Probeversuch; keine Wiederverbindung. Der temporäre Harness muss diesen Hook vor `connect()` installieren und im Test nachweisen, dass der Zweitversuchszähler null bleibt.

## EulerStream-Fallback-Consent-Lifecycle und Einmalprobe – 2026-10-08

- **Befund:** `disconnect()` ließ zuvor `_fallbackKeySessionConfirmed` und `_resumeConfirmedSession` bestehen. Ein späterer interner Resume derselben Instanz konnte so die Zustimmung nach manuellem Trennen wiederverwenden; die Bestätigung war außerdem nicht an den ursprünglich bestätigten Nutzernamen gebunden.
- **Umsetzung:** Die Zustimmung ist jetzt an den normalisierten Nutzernamen gebunden. Manuelles `disconnect()` löscht Bestätigungsflag, Username, Resume-Flag, Fallback-Key-Reihenfolge/Index, Schlüsselwahl und Live-Session-Kennzeichen. Der frische Consent wird beim Ersetzen einer bestehenden Verbindung erst nach deren internem Disconnect angelegt, damit Cleanup ihn nicht löscht.
- **Regressionstests:** Zwei synthetische Tests decken ab, dass nach manuellem Disconnect sowohl normales Connect als auch `resumeConfirmedSession:true` vor dem Socket-Aufruf erneut Zustimmung verlangen, und dass eine Bestätigung nicht für einen anderen Nutzernamen gilt.
- **Prüfung:** `app/test/euler-backup-key-warning.test.js` PASS, 13/13 Tests. Der erste Jest-Lauf traf den Sandbox-EPERM beim Realpath des Temp-Verzeichnisses; ein temporärer Preload-Shim erlaubte den Lauf. Shim und Jest-Cache wurden entfernt. `git diff --check` für Adapter und Regressionstest PASS.
- **Einmalprobe:** Der kurzlebige Child-Harness wurde vor dem Netzwerk-Gate auf Syntax geprüft. Er verlangte genau einen Fallback-Kandidaten und hätte DB-Aufrufe, Socket-Emits, Reconnect, Rotation und nicht freigegebene Events im Prozess blockiert; Log/stdio waren still und die Summary whitelistete nur Zähler/Status. Das isolierte Shell-Environment lieferte nicht genau einen `EULER_FALLBACK_API_KEY`-Kandidaten. Der Harness meldete `not_started / expected_one_fallback_candidate`; `connectAttempted=false`, `connectCalls=0`. Kein Key wurde ausgegeben, kein EulerStream-Connect und kein Live-Event-Test ausgeführt. Temporäre Harness-Datei entfernt.
- **Status:** Consent-Cleanup und Username-Bindung **behoben und synthetisch geprüft**. Probe-Liveverfügbarkeit wurde vom CEO als LIVE gemeldet; die Einmalprobe ist **BLOCKIERT / NOT TESTED**, weil der isolierte Prozess den erforderlichen einzelnen Fallback-Key nicht sicher auswählte.
- **Verbleibende Risiken/Entscheidungen:** Der reguläre Adapter lässt automatische Reconnects innerhalb einer bestätigten Live-Session desselben Nutzernamens weiterhin zu. Der Probe-Harness hätte diese Pfade unterbunden, aber kam nicht bis zum Connect. Ein erneuter Versuch braucht eine freigegebene, isolierte Bereitstellung genau eines Fallback-Kandidaten; keine Keys über Chat/Log/Datei übermitteln. Der normale Adapter-Logger enthält weiterhin einen gekürzten Key-Präfix/Suffix; der Probe-Harness hätte ausschließlich einen No-op-Logger verwendet. Parallele Raw-Payload-Redaction-Hunks im Adapter blieben unberührt.
- **Geänderte Dateien dieses Teilauftrags:** `app/modules/adapters/EulerstreamAdapter.js`, `app/test/euler-backup-key-warning.test.js`, `docs/coordination/permissions-events.md`, `docs/coordination/CEO_HANDOFF.md`. Keine Änderung an Bugstofix, realen Zuschauerdaten, Guthaben oder Rollen; kein Push/Release/Live-Connect.

### CEO-Klarstellung: Key-Zugriff bleibt gesperrt – 2026-10-08

Auf CEO-Weisung wird kein Key aus Config/SQLite gelesen und kein Connect gestartet. Das Testergebnis bleibt **BLOCKED / NOT TESTED** nach bestandenem Lifecycle-Test (13/13): Der isolierte Harness hatte keinen einzelnen erlaubten `EULER_FALLBACK_API_KEY`-Kandidaten und stoppte vor `connect()`. Der CEO klärt separat mit dem Nutzer, ob ein enger einmaliger read-only Zugriff auf eine bestehende lokale Einstellung freigegeben wird. Bis zu einer ausdrücklichen Antwort bleiben Config-/SQLite-Keyzugriff, Keyauflösung dafür und jeder EulerStream-Connect gesperrt. Offline-Tests und dieser Bericht sind hiervon unabhängig.

## EulerStream-Keydiagnose-Redaction und lokales Zugriffsgate – 2026-10-08

- **Umsetzung:** Die normale Adapter-Logzeile mit Key-Präfix/Suffix und die Key-Format-Typ-Logs wurden entfernt. Fallback-Logausgabe ist auf ein boolesches `true` begrenzt. `getEulerApiKeyInfo()` liefert für Legacy-Kompatibilität `activeKey: null` sowie Quelle/Konfigurations-/Fallback-Status; Dashboard-Diagnosen zeigen keinen Keyteil. WebSocket- und generische Fehler, geworfene Connect-Fehler, `runDiagnostics()` und Connection-Historie speichern/liefern nur feste sichere Meldungen oder Fehlerklassen; Close-Reason wird nicht mehr ausgegeben. REST-Fallback-Erkennung verwendet intern nur ein boolesches Merkmal statt roher Close-Reason-Ausgabe.
- **Regression:** Synthetischer Canary-Key wurde in WebSocket-Fehler, 401-Keyfehler, axios-Diagnosefehler, Connection-Historie und manuelle Error-Analysis eingespeist. Tests suchen vollständigen Key, Präfix und Suffix in Logs, geworfenen Fehlern, Health- und Diagnoseobjekten. Der Fallback-Canary wird zusätzlich in erfolgreicher synthetischer Verbindung, Fallback-Logs, Health und `runDiagnostics()` geprüft.
- **Tests:** `euler-backup-key-warning.test.js`, `eulerstream-hotpath-logging.test.js`, `eulerstream-connection-state.test.js` PASS, 3 Suites / 37 Tests. Der Jest-Lauf nutzte synthetische Env-Werte und gemockte Axios-/WebSocket-Transporte. Temporärer Realpath-Shim und Testcache wurden entfernt. `git diff --check` PASS.
- **Key-Zugriffsentscheidung:** Die neu erteilte eng begrenzte Freigabe hebt die ältere generelle Lesesperre für genau einen lokalen Fallback-Key prinzipiell auf. Quellcodeprüfung findet aber keinen lokalen Fallback-Key-Accessor: der Adapter liest lokal nur `tiktok_euler_api_key` (als normalen konfigurierten Nutzer-Key); Fallback-Kandidaten stammen ausschließlich aus `EULER_FALLBACK_API_KEY`. Zusätzlich kann `_getDatabaseSetting()` nach fehlendem Einzeltreffer `getAllSettings()` aufrufen und damit alle Settings laden. Daher wurde auch unter der neuen Freigabe kein Setting ausgelesen; die konkrete lokale Fallbackquelle ist unklar und die Lesemethode nicht fail-closed genug.
- **Live-Status:** Keine DB-/Config-Werte, realen Environment-Keywerte oder Netzwerkverbindungen in diesem Teilauftrag gelesen/gestartet. Passive Probe bleibt **BLOCKED / NOT TESTED**; der CEO-Verfügbarkeitsbericht ist kein eigener Live-Ereignisnachweis. Erforderlich wäre eine genaue, einzelne Fallback-Quelle/ein Getter, der garantiert nur das eine Feld lädt, oder eine andere vom Nutzer/CEO freigegebene sichere Bereitstellung; bis dahin kein Zugriff und kein Connect.
- **Dateien dieses Teilauftrags:** `app/modules/adapters/EulerstreamAdapter.js`, `app/public/js/dashboard.js`, `app/test/euler-backup-key-warning.test.js`, `app/test/diagnostics-euler-key.manual.js`, `docs/coordination/permissions-events.md`, `docs/coordination/CEO_HANDOFF.md`. Die parallelen Raw-Frame-/Room-ID-Redactions und Consent-Lifecycle-Hunks blieben erhalten.

### Ergänzung: Fehler im Key-Setting-Accessor

Canary-Regression wurde erweitert: synthetische `getSetting()`-/`getAllSettings()`-Fehler enthalten den Canary. Adapter-Logs behalten daraus nur einen festen Fehlerhinweis und den Setting-Namen, nie den Fehlertext. Erneute fokussierte Prüfung: 3 Suites / 37 Tests PASS; `git diff --check` PASS. Keine echte DB-Accessor-Ausführung.

### Probe-Gate nach Freigabe der einzelnen Env-Variable – 2026-10-08

Die ausdrückliche Freigabe erlaubt nun `process.env.EULER_FALLBACK_API_KEY` einmalig im isolierten Probeprozess; sie hebt die frühere DB-/Config-Sperre nicht auf. Vor diesem Zugriff war eine frische öffentliche LIVE-Bestätigung gefordert. Der direkte TikTok-LIVE-Seitenabruf war über das Webtool nicht zugänglich; die Browserautomation ließ sich in dieser Umgebung nicht initialisieren. Die frühere CEO-Browsermeldung wurde deshalb nicht als unmittelbare Bestätigung wiederverwendet. Ergebnis: Env-Variable **nicht gelesen**, kein Key-Candidate-Check, **kein Connect**. Passive Probe bleibt **BLOCKED / NOT TESTED** bis zu einer frischen öffentlichen LIVE-Bestätigung. Keine Wiederholung oder sonstige Liveaktion.

## Offline-Audit Public-Mode Socket-Owner-Guard — 2026-10-08

### Befund
- `createPublicReleaseEventGuard()` arbeitet mit einer byte-gepinnten Owner-Map, akzeptiert nur exakt gemappte Eventnamen und verlangt einen gültigen `getPublicSurfaceSnapshot()` mit `publicSurface === true`; Beta-Owner, fehlerhafte Policy, fehlender Snapshot und unbekannte Events schlagen geschlossen fehl. Die aktuelle Owner-Map stimmt bytegenau mit dem SHA-256-Pin im Policy-Modul überein.
- `PublicOverlayAdapter.broadcast()` lässt Protokoll-/unregistrierte Events nicht in den Quick-Tunnel-Room, prüft den dynamischen Owner-Guard, verlangt einen nichtleeren Projektor und genau zwei Eventargumente und sendet dann lokale Originaldaten getrennt von der Public-Projektion. Ack-Broadcasts schließen den öffentlichen Room immer aus. Bei fehlerhafter Freigabe/Projektion wird der Public-Room ausgeschlossen.
- Ownership des gesamten Dirty-Diffs im Adapter/Guard bleibt ungeklärt: die frühere Handoff-Notiz (`permissions-events.md`, Abschnitt „Relevante Dirty-Dateien und Herkunft“) markiert den Adapter ausdrücklich als shared/mixed; die älteren Guard-Hunks sind laut damaliger CEO-Anweisung nicht dem letzten Overlay-Auftrag zuordenbar. Deshalb keine Produktänderung.
- Sidekick-Statuszähler kreuzen nach aktuellem Code nicht die bestätigte Quick-Tunnel-Grenze: `/api/sidekick/public-status` ist zwar in der allgemeinen HTTP-Registry, fehlt aber sowohl in `APPROVED_QUICK_TUNNEL_PATHS` als auch in der aktuellen öffentlichen Surface-Allowlist; Quick-Tunnel-GET wird daher 404. Eingehende öffentliche Socket-Pakete müssen exakt `viewer-xp:public-profile:request` mit einem einzelnen begrenzten String sein. Der Sidekick-Status-Request wird verworfen. Zusätzlich liefert `projectAnonymousOverlayStatus()` `{}` für Route und Socket-Producer. `_emitStatus()` emittiert ebenfalls nur dieses leere DTO in den Public-Room; das lokale `sidekick:status` und `sidekick:metrics` bleiben separate lokale Sends.

### Relevante Regressionen
- `app/test/public-overlay-release-owner-contract.test.js`: unbekannte Richtung/Eventnamen, ungültige/fehlende Owner-Map, fehlerhafte Policy und dynamische Public-Surface-Ownerentscheidung fail-closed.
- `app/test/public-overlay-approved-surface.test.js`: Status-HTTP-Route für den Quick-Tunnel 404; unerlaubte Sidekick-Status- und Beta-/Roh-Socket-Events werden abgelehnt; Adapter schickt ausschließlich freigegebene Projektion in den öffentlichen Room.
- `app/test/public-overlay-socket-adapter.test.js`: explizite Projektion-/Room-Split-Mechanik, ungültige Payloads und Ack-Broadcasts fail-closed. Diese Suite mockt den Owner-Guard absichtlich und belegt deshalb nicht allein die Produktions-Ownerentscheidung.
- `app/plugins/sidekick/test/public-status-projection.test.js`: Status-DTO bleibt bei sensitiven Countern und Verbindungsdaten leer; Route-Response wird synthetisch geprüft. Allgemeine Registry-Zulassung allein belegt keine öffentliche Erreichbarkeit.

### Geänderte Dateien und Tests
- Nur dieser Koordinationsbericht; keine Produktdatei editiert, keine Tests ausgeführt. Befund aus Quellcode, vorhandenem Dirty-Diff und bestehenden Regressionen.
- Keine Netzwerk-, Schlüssel-, Datenbank-, Profil- oder Liveaktion.

### Offene Entscheidung / nächster Schritt
- CEO/Overlay-Owner soll die konkreten shared/mixed Guard- und Adapterhunks zuordnen, bevor eine Änderung oder ein Commit erwogen wird. Die beschriebenen Regressionen sind der passende Beleg; für eine spätere Guard-Änderung soll `approved-surface` zusammen mit `release-owner-contract` und `socket-adapter` laufen.

### Status
- **Behoben und geprüft:** Aktueller Guard-Code verweigert unknown/unmapped/Beta-/Policyfehler-Fälle fail-closed; synthetische vorhandene Regressionen belegen Owner-Guard und Public-Room-Trennung.
- **Teilweise geprüft:** Sidekick-Statusgrenze aus Middleware-Allowlist, Registry, Plugin-Route, Socket-Filter und leerem Projektor nachvollzogen; kein HTTP-Server/Tunnel gestartet.
- **Blockiert:** Änderung am gemischten Guard-/Adapter-Diff bis Owner/Hunk-Zuordnung vorliegt.
- **Nicht geprüft:** Reale Quick-Tunnel-/Proxy-E2E, produktive OBS-/Browserclients oder Public-LIVE-Verkehr.

## Passiver EulerStream-SuperFan-Versuch für marry_backup — Abbruch vor Connect — 2026-10-08

- Der Nutzer bestätigte `marry_backup` als live und autorisierte genau eine Übermittlung des vorhandenen Fallback-Keys an EulerStream für maximal zehn Minuten passiven Empfang. Die Browser-Computer-Use-Sitzung war nicht verfügbar; die direkte Nutzer-/CEO-Bestätigung war die verfügbare Statusquelle.
- DTO-Quellprüfung vor Ausführung: `projectSuperFanDisplayMessage()` liefert nur `eventType`, `displayName`, optional `level` und optional `profilePictureUrl`. Der Profilbildprojektor begrenzt URLs auf HTTPS und genehmigte TikTok/CDN-Hosts. Harte Laufzeitgrenze im isolierten Harness: 600000 ms; bei erfolgreichem Doppelbeleg wäre früher getrennt worden.
- Nach direkter Freigabe startete ein isolierter Node-Prozess, initialisierte den Adapter ausschließlich im Secondary-Modus, sperrte DB-Einstellungen mit `null`/DB-Sentinel und prüfte nur die booleschen Key-Metadaten. Ergebnis: `keyAvailable=false`, `fallbackOnly=false`, `singleFallback=false`; deshalb `connectStarted=false`. Keine Verbindung, kein Schlüsselwert ausgegeben oder übertragen, keine DB-/REST-/Chat-/Gift-/Rollenaktion. Der Prozess meldete `cleanedUp=true`.
- **Ergebnis:** SuperFan und SuperFan-Join **NOT_TESTED**; null beobachtete Events sind hier kein Negativbeleg. Das Live-Ziel wurde nicht verbunden.
- **Status getrennt:** **Teilweise geprüft:** aktuelle DTO-/HTTPS-Projektion und 10-Minuten-Abbruchgrenze per Quellcode geprüft; isolierter Key-Preflight lief. **Blockiert:** Fallback-Key war im isolierten Prozess nicht vorhanden, daher kein Connect. **Nicht geprüft:** live empfangene Events, tatsächliche Providerklassifikation und Laufzeit des DTO-Projektors auf echten Providerereignissen.

## EulerStream-Fallback-Key: lokaler Bezugsweg und isolierte Harness-Grenze — 2026-10-08

### Quellcodebefund (read-only, keine Secret-Reads)
- **Fallbackquelle:** `app/modules/adapters/EulerstreamAdapter.js:9-14` liest `process.env.EULER_FALLBACK_API_KEY` einmal bei Modulinitialisierung, zerlegt den String an Kommas/Whitespace und hält die Liste als `FALLBACK_API_KEYS`. Es gibt keinen Fallback-DB-Accessor und keine Fallback-Einstellung im Dashboard.
- **Auflösungsreihenfolge:** `EulerstreamAdapter.js:3486-3535`: `db.getSetting('tiktok_euler_api_key')`/`getAllSettings()` → `process.env.EULER_API_KEY` → `process.env.SIGN_API_KEY` → `EULER_FALLBACK_API_KEY`. `_getDatabaseSetting()` steht in `:3458-3482`. Die Dashboard-Eingabe speichert den persönlichen Key als `tiktok_euler_api_key` (`app/public/js/dashboard.js:4531`, POST `/api/settings` in `app/server.js:1967`); das ist kein Fallback.
- **App-Bootstrap:** `app/server.js:51` lädt bei normalem Start `dotenv` vor dem späteren `new TikTokConnector(io, db, logger)` (`:648`), wodurch ein dort geladenes Environment vor dem Adapter-Import verfügbar sein kann. Root `npm start` wechselt vorher nach `app`; `app/.env.example:63-66` dokumentiert `EULER_FALLBACK_API_KEY` nur als optionales Env-Feld. Kein echtes `.env`, Prozess-Environment, DB-Inhalt oder Dashboardwert wurde geöffnet oder gelesen.
- **Bedeutung des vorigen Preflights:** Der isolierte `node -e`-Child lud `EulerstreamAdapter` direkt und rief nicht den Server-Bootstrap/`dotenv` auf. Sein `keyAvailable=false` belegt nur, dass in genau diesem Child kein Fallback ankam. Es beweist nicht, dass das vom Server geladene Environment oder eine lokale `.env` keinen Wert enthält. Keine Erklärung durch DB ist für den Fallback vorgesehen.
- **Testgrenze:** `app/test/euler-backup-key-warning.test.js:231` setzt einen synthetischen Env-Fallback vor `jest.resetModules()`/Adapter-Import; `:349` belegt, dass die Produktionslogik bei mehreren Fallback-Kandidaten sonst Key-Rotation versucht. Die Tests verwenden ausschließlich Fixturewerte und mocken WebSocket-Verkehr. `app/test/tiktok-secondary-context.test.js` prüft Secondary-Modus ohne globale Emits/Persistenz; der Modus allein schützt nicht vor `_getDatabaseSetting()`-Reads, daher braucht ein Live-Harness zusätzlich einen expliziten DB-Null/Sentinel.

### Eng begrenzte Wiederholung — Vorschlag, nicht ausgeführt
1. Einmalige explizite Freigabe, den einzelnen Wert aus der tatsächlichen lokalen Quelle zu lesen. Für den aktuellen Child muss der Wert bereits als Prozess-Environment verfügbar sein; nicht `server.js` starten, nicht Dashboard-/Settings-API aufrufen und nicht die DB abfragen.
2. Parent liest `process.env.EULER_FALLBACK_API_KEY` höchstens einmal im Speicher und startet exakt einen Child mit einem minimalen Environment, das nur diesen Fallback-Wert zusätzlich zu nötigen Laufzeitvariablen enthält. Keine CLI-Argumente, Datei oder Logs mit Secret. Wenn die Variable nur in `.env` statt im Host-Environment vorliegt, ist dafür eine gesonderte Zustimmung nötig, denn auch das würde eine Secret-Datei lesen.
3. Child setzt `EULER_API_KEY`/`SIGN_API_KEY` leer, instanziiert Secondary-Adapter mit DB-Sentinel und `_getDatabaseSetting=()=>null`, bestätigt in-memory nur `usingFallback`, Quelle `Fallback Key` und exakt einen Kandidaten, löscht danach seine `process.env.EULER_FALLBACK_API_KEY`-Referenz und lässt die beim Import gebundene einzelne Kandidatenliste im RAM. Keine Rotation; REST-Fallback, Identity-/Gift-/Room-Abfragen, Auto-Reconnect, generische Events, Plugin-Initialisierung und globale Socket-Emits bleiben deaktiviert. Nur das genehmigte DTO wird geprüft; Parent empfängt Counts/Bools.
4. Vor Connect abbrechen, wenn die einzelne Quelle/Anzahl nicht bestätigt werden kann. Nach höchstens 600000 ms oder beidem Eventtypen sofort trennen und Child beenden; prüfen, dass kein Socket/Timer/Child übrig bleibt. Ein späterer Versuch benötigt erneute Bestätigung der Ziel-LIVE-Situation und die angegebene Secret-Übermittlungserlaubnis.

### Ergebnis dieses Audits
- Keine Schlüsselwerte, tatsächliche Prozessvariablen, `.env`-Dateien oder DB-Werte gelesen; keine Produktdatei geändert und keine Netzwerk-/Liveaktion.
- Keine Tests ausgeführt; ausschließlich Quellcode-/Harness-Inspektion. `git diff --check` nach dieser Dokumentergänzung.
- **Nächster Freigabeschritt:** CEO/Nutzer müssen den Fallback-Wert im Environment des exakt einen isolierten Child-Prozesses verfügbar machen oder ausdrücklich einen einmaligen In-Memory-Read aus der konkreten lokalen `.env`-Quelle freigeben. Ohne diese Vorbedingung bleibt jeder Connect gesperrt.

## EulerStream-Fallback-Quelle: gezielte app/.env-Prüfung — 2026-10-08

### Pfadnachweis und Resultat
- `app/modules/launcher.js:67` setzt `projectRoot` auf `app`; `startServer()` startet `app/server.js` mit `cwd: this.projectRoot` (`:639-654`). Root-Start wechselt in `app`; `app/server.js:51` ruft `dotenv.config()` ohne `path`-Option auf. Die installierte Dotenv-Implementierung löst das auf `path.resolve(process.cwd(), '.env')` auf. Der unterstützte lokale Pfad lautet daher exakt `app/.env`.
- Es lief kein Server-Bootstrap. Ein einmaliger streamender Zeilen-Scan prüfte ausschließlich aktive `EULER_FALLBACK_API_KEY`-Zuweisungen in genau dieser regulären Datei, ohne andere Variablen in `process.env` zu laden. Der Prozess-Environment-Override war nicht vorhanden; Docs-Capture-Modus war aus. Ergebnis: kein aktiver Eintrag (`targetEntryFound=false`). Keine Fallback-Kandidaten wurden erstellt und kein Wert extrahiert.
- Vor dem Dateizugriff bestand der synthetische DTO-Guard-Preflight: exakt `eventType`, `displayName`, `level`, `profilePictureUrl`; beide erlaubten Typen und der HTTPS-/Host-Projektor wurden mit isolierten Fixture-Daten bestätigt. Dennoch `connectStarted=false`; null Eventcounts. Keine Netzwerk-/Liveaktion, keine DB-/REST-/Chat-/Gift-/Rollenaktion.

### Mechanismusgrenze
- Produktionsadapter bindet ausschließlich `EULER_FALLBACK_API_KEY` aus dem Prozess-Environment beim Modulimport (`app/modules/adapters/EulerstreamAdapter.js:9-14`); `app/server.js` lädt Dotenv davor. Das Dashboard-/DB-Feld `tiktok_euler_api_key` ist ein persönlicher Key mit höherer Auflösungspriorität, kein Fallback.
- `EULER_BACKUP_API_KEY` erscheint im Beispiel-/Manual-Testpfad, wird aber von keinem produktiven Modul/Route/UI des Adapterpfads gelesen. `app/.env.example` enthält zu diesem anderen Namen einen fest eingetragenen Beispiel-/Backupwert; der Wert wurde weder verwendet noch in diesen Bericht übernommen. Das Manual-Testskript `app/test/euler-backup-key-warning.manual.js` gibt für diesen Namen zudem Präfix/Suffix aus; es wurde nicht ausgeführt. Diese Namensabweichung sollte separat vom Live-Probeauftrag bereinigt/geprüft werden.
- Das frühere bare `node -e` ohne Server-Bootstrap sah kein geerbtes Fallback-Environment. Die gezielte Prüfung belegt jetzt zusätzlich: in der exakt von normalem Serverstart verwendeten `app/.env` liegt keine aktive Zuweisung unter dem produktiven Namen. Ein separates, bereits laufendes Prozess-Environment wurde nicht inspiziert.

### Status und nächste Freigabe
- **Teilweise geprüft:** Exakter Dotenv-Pfad/CWD und DTO-Projektion source-/fixture-basiert verifiziert; gezielter `.env`-Scan beendet.
- **Blockiert:** Kein unterstützter Fallback-Eintrag unter `EULER_FALLBACK_API_KEY`; Abbruch vor Connect.
- **Nicht geprüft:** Der Nutzer-DB-Key, `EULER_API_KEY`/`SIGN_API_KEY`, bestehende Serverprozess-Umgebung und echte Providerereignisse wurden weder gelesen noch genutzt.
- **Nächster Freigabeschritt:** Wert über den unterstützten Namen `EULER_FALLBACK_API_KEY` bereits im isolierten Child-Environment verfügbar machen oder ein neues, konkretes einmaliges Read-Autorisierungsziel festlegen. `EULER_BACKUP_API_KEY` darf nicht als Ersatz angenommen werden, solange die Produktionsverwendung nicht ausdrücklich geklärt ist.
- Keine Tests ausgeführt; keine Produktdatei geändert. `git diff --check` nach dieser Dokumentergänzung.

## Manuelle Euler-Key-Diagnose: Redaktionshärtung — 2026-10-08

### Umsetzung
- `app/test/euler-backup-key-warning.manual.js`: Präfix-/Suffix-Logging der Backup-Umgebungsvariable entfernt. Ausgabe meldet ausschließlich `configured: true/false`; Vergleichsassertionen der Namen `EULER_BACKUP_API_KEY` und `EULER_FALLBACK_API_KEY` bleiben unverändert.
- `app/test/euler-backup-key-warning.test.js`: statischer Regressionstest ergänzt. Er verbietet Key-Variablen in Logzeilen und `substring`/`slice`-Ausgabe, verlangt die Statusmeldung und stellt sicher, dass der Produktadapter nur `EULER_FALLBACK_API_KEY` referenziert. Frühere Dirty-Hunks der Testdatei erhalten.
- Keine `.env`-/Secret-Dateien gelesen; keine Produktverbindung, kein Provider-/Netzwerk-/Liveaufruf. Das manuelle Skript wurde nicht ausgeführt.

### Verifikation
- `node --check test/euler-backup-key-warning.manual.js` und `node --check test/euler-backup-key-warning.test.js`: PASS.
- Plain-Node-Ausführung derselben statischen Assertions mit Key-Env-Variablen vorher leer gesetzt: PASS.
- Fokussierter Jest-Start des Regressionstests: BLOCKIERT, `realpath`-`EPERM` auf System-TEMP; erneuter Start mit Workspace-TMP scheiterte ebenfalls an `realpath`-`EPERM` für den App-Pfad. Kein Produktfehler belegt.
- `git diff --check` scoped für beide Dateien: PASS.

### Verbleibendes Risiko / Entscheidung
- `EULER_BACKUP_API_KEY` und `EULER_FALLBACK_API_KEY` bleiben verschiedene Namen und Funktionen; der Adapter akzeptiert den Backup-Namen nicht. Die Dummy-/Rotationsfrage des Beispielwerts bleibt beim Nutzer. Keine externe Rotation oder Wertverwendung.

### Status getrennt
- **Behoben und geprüft:** manuelle Diagnose gibt keine Keyfragmente mehr aus; statischer Redaktions-/Namensvertrag PASS.
- **Teilweise geprüft:** gezielte Assertions und Syntaxprüfung PASS; Jest-Runner durch Sandbox-`realpath` blockiert.
- **Blockiert:** volle Jest-Ausführung in dieser Sandbox.
- **Nicht geprüft:** manuelle Ausführung mit realen Environments, Provider, Netzwerk, Live, Schlüsselwert oder Rotation.
## 2026-10-08 – Isolierter Metadaten-Audit verdächtiger `.env.example`-Eintrag

### Befund und Methode
- Nur lokale Git-Ref-/Commit-Metadaten (`git log --format`, Pfadverlauf, Variablenname mit `-G`, `git tag/branch --contains`) und die Dateiausschlussregel im Runtime-Bundle-Builder geprüft. Keine Datei mit Secretwert, kein ZIP und kein Release-Archiv geöffnet; keine Netzwerkanfrage oder Fetch.
- `app/.env.example` hat fünf Commits in der lokal erreichbaren Branch/Remote/Tag-Sicht. `EULER_BACKUP_API_KEY` ist bereits im Initial-Commit `0b9d9a3519158b68dd1349cbacdcc812624f38e3` historisch vorhanden. Lokal vorhandene Nachfahr-Tags: `v1.3.24`, `v1.3.26`, `v1.3.28`, `v1.3.31`, `v1.3.32`, `v1.3.33`, `v1.4.0`, `v1.4.1`, `v1.4.3`, `v1.4.4`.
- Diese Metadaten belegen, dass der Variablenname in erreichbarer Historie auftaucht, nicht dass ein bestimmter Literalwert in diesen Commits bytegleich vorhanden ist. Die Reachability sagt auch nichts über tatsächlich publizierte Inhalte der zugehörigen Release-ZIPs.
- `scripts/build_release_bundle.py` scannt `app/` rekursiv. `should_exclude_app_path()` lässt `.env.example` durch, während `.env` und andere `.env.*` ausgeschlossen werden. Der Builder kann die Datei daher in ein Runtime-Bundle aufnehmen. Archive selbst wurden nicht geprüft.
- Der vollständige `--all`-Pfad war wegen eines defekten `refs/codex/turn-diffs/checkpoints/...`-Refs nicht verlässlich; untersucht wurden Branches, Remotes und Tags. Keine externe Rotation, Veröffentlichung, Push oder History-Rewrite.

### Empfehlung an den Kontoinhaber nach Rotation
- Falls der Credential echt oder nicht sicher als Dummy auszuschließen ist: bei EulerStream widerrufen/rotieren. Die Produktionskonfiguration unter `EULER_FALLBACK_API_KEY` separat prüfen; `EULER_BACKUP_API_KEY` ist kein bestätigter Produktionsadapter-Alias.
- Sample-Dateien auf Platzhalter halten und mit freigegebenem Folge-Release ersetzen. Erreichbare Tags/alte Releases vorsorglich als möglicherweise betroffen behandeln, bestehende Pakete/Caches im eigenen Releaseprozess neu bauen/ersetzen und weitere Kopien sowie CI-Secrets/Logs kontrollieren.

### Status
- **Teilweise geprüft:** lokale Commit-/Tag-Metadaten und Builder-Ausschlussregel.
- **Nicht geprüft:** exakter Wertvergleich über historische Blobs; Inhalte veröffentlichter Archive; nicht lokal erreichbare Remote-Refs.
- **Nicht ausgeführt:** Rotation, Bereinigung veröffentlichter Pakete, Push oder Rewrite.
## 2026-10-08 – Runtime-Bundle-Denylist für `.env.example`

- `scripts/build_release_bundle.py`: Dateiname `.env.example` wird jetzt in beliebiger App-Unterstruktur und case-insensitiv ausgeschlossen. Bereits vorhandene `.env`/`.env.*`-Regel bleibt wirksam.
- `app/test/release-bundle-script.test.js`: synthetische Root- und nested-Fixtures ergänzen/aktualisieren den ZIP-Vertrag. ZIP-Manifest schließt `.env.example` aus und erhält sichere `README.md`-/`package.json`-Kontrollinhalte.
- Fremde Änderungen in beiden Dateien waren schon vor diesem Auftrag umfangreich; diese wurden erhalten und nicht umgeschrieben. Keine Secret-Beispieldatei-Inhalte gelesen/ausgegeben.
- **PASS:** Node Syntaxcheck, Python `py_compile`, isolierter synthetischer ZIP-Smoke (Root/nested/case-variant ausgeschlossen, unbeteiligte Dateien erhalten), `git diff --check` scoped.
- **BLOCKIERT:** fokussierter Jest-Start scheitert vor Ausführung mit `realpath EPERM`, zuerst System-TEMP, danach Workspace-TEMP.
- **Nicht geprüft:** vollständiger Runtime-Release-Build/echte Pakete. Keine Build-/Download-/Push-/Release-Aktion.
## 2026-10-08 – Getrackte `.env.example`-Credentialfelder auf Platzhalter prüfen

- Nach gezielter Statusprüfung waren `naked/app/.env.example` und `new_patch/ltth_1.2.1/app/.env.example` sauber. Je ein Nicht-Platzhalterwert für `EULER_BACKUP_API_KEY` wurde per streaming/line-preserving Edit ersetzt. Keine Secretwerte ausgegeben oder automatisch rotiert.
- Metadaten-/Inhaltsprüfung aller lokal getrackten `**/.env.example`-Credentialfelder gibt ausschließlich Status aus: alle sind Platzhalter. Keine weiteren Kandidaten.
- Neue Regression `app/test/env-example-credential-placeholders.test.js`: synthetische Euler API key plus generische `_API_KEY`, `_TOKEN`, `_SECRET`, `_PASSWORD` Felder; sichere Nicht-Secret-Einstellungen bleiben unverändert; konkreter synthetischer Wert wird nicht als Platzhalter klassifiziert. Repository-Scan-Fehlerdiagnostik beschränkt sich auf Pfad und Variablenname.
- **PASS:** Node-Syntax, direkte synthetische Assertions, vollständiger credential-name-only Scan, `git diff --check`.
- **BLOCKIERT:** Jest vor Teststart mit Sandbox `realpath EPERM`.
- Runtime-Paketdenylist für `.env.example` aus dem vorherigen Auftrag bleibt aktiv. Kein Build, Download, Release, Push, Rewrite oder externe Rotation.

## 2026-10-08 – MusicResolver-Retry, Fehlerredaktion und Einzelprobe

### Befund
- Die genehmigte öffentliche Einzelprobe wird als verbraucht behandelt. Ein erster lokaler Harness brach vor dem Resolver ab. Der korrigierte Lauf erreichte `/resolve` und rief den echten `YtDlpRunner` einmal auf; ein weiterer interner Retry wurde vom Einmal-Gate vor `runner.run()` blockiert. Die Zahl tatsächlich gestarteter yt-dlp-Kinder wurde nicht separat erfasst, deshalb ist ein öffentlicher Provider-Request aus diesem Lauf nicht sicher belegbar. Es gab kein nutzbares Resolver-Ergebnis; Queue und MPV wurden nicht erreicht.
- Die temporäre Harness-Datei und das eigene Verzeichnis wurden gelöscht. SQLite lief ausschließlich als `:memory:` und wurde geschlossen. Nachkontrolle fand keine yt-dlp- oder MPV-Prozesse.
- `MusicResolver._runYtDlp()` wiederholt höchstens einmal, wenn der Fehler als transient klassifiziert ist (Timeout-/Netzwerkcodes oder passende Fehlermeldungen). `AbortError` und `yt-dlp-not-found` werden nicht wiederholt. Textsuche fällt nach leerem/fehlgeschlagenem YouTube auf SoundCloud zurück; über beide Provider zusammen sind maximal vier Runner-Aufrufe innerhalb derselben Deadline möglich.
- `YtDlpRunner` leitet Signalabbruch/Deadline an Prozessbaum-Beendigung weiter; `destroy()` beendet wartende Jobs und wartet auf die Terminierungsroutine. Windows nutzt `taskkill /T /F` und nach 1 Sekunde den direkten Child-Kill, POSIX signalisiert die Prozessgruppe. Der Abbruchpfad wartet nicht ausdrücklich auf das Child-`close`-Ereignis, wenn der Fallback greift; der Mock belegt den Beendigungsaufruf, nicht den realen Prozess-Exit.
- Dashboard-Resolve und Dashboard-Request protokollierten Provider-`error.message` und gaben es an API/UI weiter. Das konnte rohe yt-dlp-Details offenlegen. Die beiden Catch-Pfade liefern nun feste Texte und Codes und loggen keine Provider-Fehlermeldung. HTTP-Status- und Abortverhalten blieben bestehen.

### Umsetzung und geänderte Dateien
- `app/plugins/music-bot/main.js`: Dashboard-Resolve und Dashboard-Request geben stabile generische Fehlermeldungen mit Codes aus; rohe Fehlerdetails werden an diesen Stellen nicht mehr geloggt.
- `app/test/music-bot-resolver-retry-contract.test.js`: zwei isolierte Mock-Regressionen für transienten Einzelretry/Providerfallback und keinen Retry bei permanentem Fehler.
- `app/test/music-bot-dashboard-error-sanitization.test.js`: synthetische Fehlerfixture stellt sicher, dass API-Antworten und Logs keine Providerdetails enthalten und ein Fehler nicht in die Queue gelangt.
- Vorhandene parallele Rate-Limit-/Abort-Hunks in `main.js` wurden erhalten. Keine Änderung an Resolver- oder Runner-Produktcode.

### Prüfungen
- **PASS:** fokussierter projektgebundener Jest-Lauf: Resolver-Redaktion, Retry-Vertrag, Resolver-Concurrency und Dashboard-Routen; 4 Suites / 53 Tests.
- Der normale Sandbox-Lauf stoppte vor Teststart mit `EPERM` bei `fs.realpath` für System- und Workspace-TEMP. Der Offline-Lauf wurde danach außerhalb dieser Windows-Einschränkung ausgeführt; alle Tests verwenden synthetische Fehler und Mock-Runner, ohne Netzwerk, Provider oder MPV.
- Keine Profile, Schlüssel, Cookies oder Loginhalte gelesen; keine reale Queue, kein Chat, Gift oder Liveaktion.

### Verbleibende Risiken und Entscheidungen
- Child-`close` nach realem Windows-Taskkill-Fallback ist nicht durch Mock-Tests nachgewiesen.
- Der korrigierte öffentliche Harness-Lauf erbrachte keinen Resolver-Erfolg und wurde wegen fehlender Spawn-Instrumentierung konservativ als verbrauchte Einzelprobe behandelt. Keine Wiederholung ohne neue unabhängige Freigabe.
- Generische Dashboard-Fehlerabbildung deckt die beiden Dashboard-Pfade ab; andere Music-Bot-Einstiegspunkte wurden nicht auf identische Fehlerredaktion auditiert.

### Status getrennt
- **Behoben und geprüft:** Dashboard-Resolve-/Request-Fehlerredaktion; 4 fokussierte Offline-Suites bestanden.
- **Teilweise geprüft:** Retry-Budget und Mock-Abbruch/Shutdown geprüft; tatsächliches Prozessende beim Taskkill-Fallback bleibt unbelegt.
- **Blockiert:** öffentliche Einzelprobe ist verbraucht und wird nicht wiederholt.
- **Nicht geprüft:** erfolgreicher Provider-Resolve, Queue-Eintrag, MPV-/Null-AO-Wiedergabe sowie reale Windows-Child-Beendigung.

## 2026-10-08 – YtDlpRunner: begrenzte Child-Close-Bestätigung

### Umsetzung
- `YtDlpRunner` wartet nach Prozessbaum-Beendigung auf das `close`-Ereignis des eigenen Childs (Standard: 2 Sekunden). Nach Timeout folgt ein weiterer SIGKILL-Versuch am eigenen Child und ein zweites begrenztes Close-Wartefenster.
- Wenn `close` weiter ausbleibt, bleibt das Child in `active` und wird als unbestätigt nachverfolgt. Der Runner startet keine wartenden Jobs, bis dieses Child tatsächlich `close` meldet. `destroy()` lehnt dann mit `YTDLP_CLOSE_TIMEOUT` ab; späteres `close` räumt den Eintrag auf. Doppelte Abort-/Destroy-Aufrufe teilen dieselbe Terminierungsroutine.
- Vorhandene Environment-Allowlist-Änderungen in `yt-dlp-runner.js` blieben erhalten. Dummy-Fixtures in den betroffenen Tests emulieren explizit Child-Exit/Close; kein echter Prozess wird gestartet.

### Prüfungen
- **PASS:** `music-bot-resolver-concurrency.test.js` und `music-bot-child-env.test.js`: 2 Suites / 39 Tests. Fälle decken verzögertes Close, dauerhaft ausbleibendes Close, blockierte Folgejobs, doppeltes Abort/Shutdown sowie Windows-/POSIX-Kill-Stubs ab.
- **PASS:** Node-Syntaxprüfung für Runner und geänderte Regressionen; `git diff --check` für getrackte Runner-/Teständerungen.
- Keine yt-dlp-/Provider-/Netzwerk-/MPV- oder sonstigen realen Child-Prozesse gestartet.

### Status getrennt
- **Behoben und geprüft:** bounded wait, SIGKILL-Fallback, idempotente Terminierung, Drain-Sperre und expliziter Cleanupfehler bei nicht bestätigtem Exit.
- **Teilweise geprüft:** Prozessende ist ausschließlich mit Dummy-Children belegt; Windows-Taskkill-Verhalten ist nicht live geprüft.
- **Blockiert:** keine.
- **Nicht geprüft:** reale yt-dlp-Ausführung oder tatsächlicher Windows-Prozessbaum.

## 2026-10-08 – Music-Bot MediaCache: Child-Close-Vertrag

### Befund und Umsetzung
- `MediaCache.destroy()` propagiert den Fehler des eigenen Runners; die vorherige Abort-Fixture emulierte aber keinen Child-`close` und passte dadurch nicht zum Shutdown-Vertrag.
- Die Never-close-Fixture erwartete fälschlich erfolgreichen Cleanup. Sie erwartet jetzt den bounded Fehler `YTDLP_CLOSE_TIMEOUT`, prüft die fortbestehende aktive PID/Ownership und emuliert danach das verspätete `close`.
- Der Music-Bot-Plugin-Shutdown fing Cache-/Resolver-Fehler ab und meldete anschließend trotzdem `Plugin destroyed`. Er sammelt diese Fehler jetzt, beendet die übrigen Cleanup-Schritte und wirft den ersten Fehler vor der Erfolgsmeldung weiter.

### Geänderte Dateien
- `app/plugins/music-bot/main.js`
- `app/test/music-bot-media-cache.test.js`
- `app/test/music-bot-safety-runtime.test.js`

### Prüfungen
- **PASS:** `music-bot-media-cache.test.js`, `music-bot-resolver-concurrency.test.js` und `music-bot-safety-runtime.test.js`: 3 Suites / 89 Tests, regulärer Jest-Abschluss ohne `forceExit`.
- **PASS:** Syntaxprüfung der geänderten JavaScript-Dateien und `git diff --check` für die eigenen Änderungen.
- Ausschließlich Fake-Children und Prozess-Kill-Stubs; keine yt-dlp-, Provider-, Netzwerk- oder MPV-Prozesse.

### Verbleibende Risiken und Status getrennt
- **Behoben und geprüft:** Cache-Abbruch mit simuliert bestätigtem `close`; fehlendes `close` bleibt begrenzt fehlerhaft und die Ownership wird bis zu verspätetem `close` behalten; Plugin-Shutdown behauptet bei Cache-/Resolver-Fehlern keinen Erfolg.
- **Teilweise geprüft:** Tests verwenden isolierte POSIX-artige Kill-Stubs. Echtes Windows-`taskkill`/Child-Exit-Verhalten ist nicht belegt.
- **Blockiert:** keine.
- **Nicht geprüft:** reale yt-dlp-Ausführung oder externer Prozessbaum.
- Keine offenen semantischen Entscheidungen im getesteten Shutdown-Vertrag.

## 2026-10-08 – Publisher workflow bootstrap contract

### Umsetzung
- `verify_dispatch_ref` checks out the publisher workflow repository at `github.sha` in the default workspace before invoking its repository-local source-run validator. The job now grants read-only `contents` permission for this checkout; credentials are not persisted.
- Both release actions consume `source_commit_sha` from their direct dependency, `validate-and-stage`, instead of referencing the transitive `verify_dispatch_ref` job.
- No publisher action was run; no signing, upload or release occurred.

### Geänderte Dateien und Prüfung
- `.github/workflows/publish-launcher-handoff.yml`
- `scripts/test_publisher_bootstrap_contract.py` was inspected and left unchanged.
- **PASS:** `python scripts/test_publisher_bootstrap_contract.py` (1 test); `git diff --check`.

### Status getrennt
- **Behoben und geprüft:** both static wiring failures covered by the existing contract test.
- **Teilweise geprüft:** source-text contract only; hosted GitHub Actions execution is not established.
- **Blockiert:** none.
- **Nicht geprüft:** Action run, signing, upload, release, GitHub permission behavior in hosted execution.

## 2026-10-08 – Launcher source receipt und pre-sign gate

### Befund
- Der lokale Sign-Helper prüfte Candidate-Hash, NotSigned-Status und Manifest, rief SignTool aber auf, bevor er einen verifizierten Actions-Run, einen sauberen Quellcheckout oder einen passenden gepinnten Rebuild verlangte. Run/Tag/Commit und Source-Rebuild wurden erst im nachgelagerten Publisher-Validierer geprüft.
- Der Sign-Helper prüfte nach `sign` den erwarteten Signer, aber keinen Zeitstempel. Der Publisher prüfte nur das Vorhandensein eines Zeitstempelzertifikats; ein expliziter SignTool-`/tw`-Nachtest fehlte im lokalen Helper.

### Umsetzung
- Der Source-Run-Validator kann einen neuen Receipt mit exakt `schema`, kanonischem `repository`, `runId`, `workflow`, `event`, `ref` und `commitSha` schreiben. Der Sign-Helper verlangt den Receipt, validiert ihn und fragt den Actions-Run vor SignTool erneut über den Validator ab. Beide Receipts müssen dieselbe Candidate-Identität belegen.
- Candidate-Manifest Schema 2 bindet Workflow, Event und Ref mit Run-ID, Tag und Commit. `build-launcher.yml` und `release.yml` liefern diese Werte explizit.
- Vor SignTool muss der gesamte Quellcheckout sauber sein, HEAD und Tag auf dem erwarteten Commit liegen, Go exakt `1.24.10 windows/amd64` melden und der pinned Build dieselben Candidate-Bytes/Größe erzeugen.
- Nach SignTool verlangt der Helper Authenticode `Valid`, den konfigurierten Signer-Thumbprint, ein Zeitstempelzertifikat und erfolgreichen `signtool verify /pa /all /tw`. Provenienz- und Handoff-Receipt führen Workflow/Event/Ref, beide Signer-Thumbprints und Candidate-/Signed-Hashes.
- Die Handoff-Validierung verlangt den Source-Run-Receipt und vergleicht ihn erneut mit Candidate, Manifest und Signaturdaten. Ungültige oder fehlende Belege werden vor akzeptierter Ausgabe zurückgewiesen.

### Geänderte Dateien
- `.github/workflows/build-launcher.yml`, `.github/workflows/release.yml`
- `app/test/release-workflow-syntax.test.js`
- `scripts/sign-launcher-candidate.ps1`, `scripts/lib/launcher-release-handoff.psm1`, `scripts/write-launcher-candidate-manifest.ps1`
- `scripts/verify_launcher_source_run.py`, `scripts/test_verify_launcher_source_run.py`
- `scripts/test_launcher_release_handoff.ps1`, `scripts/test_launcher_handoff_stale_source.ps1`

### Prüfungen
- **PASS:** synthetische PowerShell-Handoff-Regression mit Fake-Verifier, Fake-Go, Fake-SignTool und synthetischen Signaturdaten. Missing/wrong receipt, falscher frisch verifizierter Run, Rebuild-Mismatch, falscher Signer, fehlendes Zeitstempelzertifikat und fehlgeschlagenes `/tw` blockieren akzeptierte Ausgabe; positive Kontrollstrecke besteht.
- **PASS:** stale-source/receipt PowerShell-Regression: positiver Kontrollfall und vier fail-closed Fälle; verworfene Fälle erreichen weder Build noch Publisher.
- **PASS:** Source-run-Validator inkl. CLI-Receipt-Ausgabe: 9 Python-Tests.
- **PASS:** `release-workflow-syntax.test.js`: 1 Suite / 8 Tests.
- Keine echten GitHub-API-/Netzwerkaufrufe, Go-Builds, SignTool-/SimplySign-/OTP-Aktionen oder Releases.

### Verbleibende Risiken und Entscheidungen
- **Behoben und geprüft:** Der Helper blockiert SignTool bei fehlendem/abweichendem Receipt, unsauberem Quellbaum, falschem Tag/Commit oder abweichendem pinned Rebuild. Er prüft nach SignTool Thumbprint und erforderlichen RFC3161-Zeitstempel mit `/tw`.
- **Teilweise geprüft:** Nur Fake-Programme und synthetische Signaturobjekte; echte GitHub-API-, Go-, Windows-SDK-, Zertifikatsketten- und SimplySign-Ausführung blieb aus.
- **Blockiert:** keine.
- **Nicht geprüft:** echte PE-Signaturparität bzw. normalisierte Gleichheit des signierten PE mit dem ungetaggten CI-Candidate; echte Zeitstempel-/Revocation-Akzeptanz.
- **Offene Entscheidung:** PE-Parität bleibt ein separater Distribution-Gate, bis eine sichere normalisierte PE-Prüfung und unabhängige Regression dafür vorliegt.

## 2026-10-08 – MusicResolver: Live-Streams und unbegrenzte Dauer fail-closed

### Befund
- `_selectCandidate()` übersprang bereits Kandidaten ohne endliche positive Dauer, prüfte aber `is_live`, `was_live` und `live_status` nicht explizit.
- `_resolveDirect()` übernahm `_createSongResponse()` ohne Dauer-Gate. Direkte Live-/Radio-Metadaten mit unbekannter oder fehlender Dauer konnten daher als Song mit `duration: null` erfolgreich werden.

### Umsetzung
- MusicResolver prüft Rohmetadaten vor der Normalisierung. Positive Live-Flags oder jeder gesetzte `live_status` außer `not_live` werden als `live_stream_unsupported` abgelehnt.
- Sowohl Such- als auch Direct-/Playlist-Pfade verlangen zusätzlich eine positive endliche Dauer; sonst folgt `unknown_duration`.
- Normale finite Tracks, einschließlich explizitem `not_live`, bleiben auswählbar.

### Geänderte Dateien
- `app/plugins/music-bot/lib/music-resolver.js`
- `app/test/music-bot-resolver-concurrency.test.js`

### Prüfungen
- **PASS:** `music-bot-resolver-concurrency.test.js` und `music-bot-resolver-retry-contract.test.js`: 2 Suites / 43 Tests; ausschließlich synthetische yt-dlp-Metadaten.
- Keine Suche, Provider-, Netzwerk-, Queue-, MPV- oder Liveaktion.

### Status getrennt
- **Behoben und geprüft:** Live-Flags/Status und unbekannte/unbegrenzte Dauer werden in Candidate- und Direct-Pfaden explizit verworfen.
- **Teilweise geprüft:** synthetische Resolver-Metadaten; keine Providerantwort oder Playback-Laufzeit.
- **Blockiert:** keine.
- **Nicht geprüft:** externe Provider- und MPV-Akzeptanz; ausdrücklich nicht Teil dieses Offline-Auftrags.

## 2026-10-08 – SuperFan DTO-Kette und Heuristikgrenze

### Befund
- Lokale EulerStream-SDK-v2-Typen stellen `WebcastBarrageMessage`-Textfelder sowie Actor-Namen, Fanclub-Level und Profilbildfelder bereit. Typdefinitionen belegen Feldform, aber weder die Semantik der `displayType`-Marker noch einen verlässlichen Rollen-/Mitgliedschaftsvertrag.
- `EulerstreamAdapter._dispatchEulerstreamMessage()` projiziert `WebcastBarrageMessage` mit `projectSuperFanDisplayMessage()` auf ein neues `superfan-display` DTO. Die Projektion nimmt genau `displayName`, heuristisches `eventType` und optional `level`/allowlisted HTTPS-`profilePictureUrl` auf. Actor-ID, Rawpayload, Chattext, Settings und Schlüssel werden nicht weitergereicht.
- TikTokConnector leitet nur dieses DTO an Eventlistener weiter. Der einzige registrierte Pluginverbraucher ist ClarityHUD. Der ClarityHUD-Handler prüft lokale Anzeigeeinstellung und DTO-Felder, schreibt eine begrenzte flüchtige Queue und emittiert nur die Anzeigeprojektion; kein persistenter Rollen-/Zugriffspfad ist an `superfan-display` gebunden.
- Public-Socket- und State-Projektionen allowlisten die vier Nutzerfelder. Queue-Typ/Zeitstempel sind intern und werden im öffentlichen History-DTO verworfen. Profilbilder passieren den HTTPS-TikTok-CDN-Projector. Renderer verwendet `textContent`.
- Zwei Darstellungen behaupteten bislang mehr als die Quelle belegt: der Connector-Kommentar bezeichnete die weitergereichten Werte fälschlich als raw, und das Overlay sagte, der Nutzer sei tatsächlich Super Fan geworden oder dem Club beigetreten.

### Umsetzung
- Connector- und Classifier-Kommentare kennzeichnen die Markererkennung ausdrücklich als provisorische Anzeigeheuristik, nicht als verifizierten Rollenvertrag oder Zugriffsnachweis.
- Overlaytexte sprechen jetzt von einem möglichen SuperFan-Signal bzw. möglichen Beitrittssignal. Die heuristischen DTO-Feldnamen und deren allowlist bleiben unverändert.
- Die synthetische Renderer-Regression erwartet die vorsichtige Formulierung; Klassifikationstests sind explizit als Charakterisierung der provisorischen Heuristik benannt.

### Geänderte Dateien
- `app/modules/tiktok.js` (Kommentar zur bestehenden Weiterleitung)
- `app/plugins/clarityhud/lib/superfan-classifier.js` (Kommentare zur Heuristikgrenze)
- `app/plugins/clarityhud/overlays/full.js` (neutrale Overlaytexte)
- `app/test/eulerstream-superfan-display.test.js`
- `app/plugins/clarityhud/test/superfan-display-renderer.test.js`
- `docs/coordination/permissions-events.md`

### Prüfungen und Grenzen
- **PASS:** fokussierte Jest-Matrix `eulerstream-superfan-display`, ClarityHUD `superfan-display-renderer`, `superfan-classifier`, `superfan-retention`, `superfan-settings-contract` sowie `clarityhud-public-projection`: **6 Suites / 44 Tests**.
- **PASS:** `node --check` für alle fünf geänderten JS-Dateien und `git diff --check` für die betroffenen Pfade.
- Jest benötigte einen direkten Node-Aufruf mit lokalem TEMP und erhöhte Sandboxrechte, weil `fs.realpathSync.native` im Sandbox-Temp EPERM lieferte. Der eigens angelegte Temp-/Compile-Cache-Ordner wurde danach sicher entfernt.
- Keine EulerStream-/TikTok-Aufrufe, Schlüsselzugriffe, echten Payloadwerte, Konten oder Liveaktionen.
- Keine EulerStream-/TikTok-Aufrufe, Schlüsselzugriffe, echten Payloadwerte, Konten oder Liveaktionen.

### Status getrennt
- **Behoben und geprüft:** Anzeigedatenprojektion, zugelassene DTO-Felder und overlayseitige neutrale Heuristikformulierung sind im aktuellen Quellpfad nachvollzogen; die beiden vorliegenden Jest-Suites liefen bis zu PASS-Ausgaben.
- **Teilweise geprüft:** lokale Fixture-/Source-Verträge vollständig; keine externe Provider-Semantik verifiziert.
- **Blockiert:** unabhängiger Providervertrag zur Bedeutung und Aktualität der Marker bleibt unbelegt; keine Live-/Providerverifikation erlaubt oder versucht.
- **Nicht geprüft:** Tatsächliche TikTok/EulerStream-Semantik oder Empfang/Aktualität der Feldwerte.
- **Offene Entscheidung:** Die Heuristik bleibt ausschließlich ein mögliches Anzeige-Signal. Sie darf nicht für Zugriff, dauerhafte Rollen oder Mitgliedschaftsgarantien verwendet werden.

## 2026-10-08 – NSIS Launcher-Provenienz auf Schema 2

### Befund
- Der Signing-Handoff schreibt 
  `launcher-build-provenance.json` mit `schema: 2` und 22 Feldern. Der NSIS-Consumer verlangte zuvor `schema: 1` und exakt 18 Felder; damit war der Consumer gegenüber dem aktuellen Producer veraltet.
- Schema 2 ergänzt `sourceWorkflow`, `sourceEvent`, `sourceRef` und `timestampSignerThumbprint`.

### Umsetzung
- Der Consumer akzeptiert ausschließlich numerisches Schema 2 und die vollständige Feld-Allowlist; Schema 1 und fehlende/neue Zusatzfelder werden fail-closed verworfen.
- Quelle-Workflow/Event/Ref müssen zu den vom Handoff erlaubten Kombinationen und dem Tag passen. Der Timestamp-Signer-Thumbprint wird auf 40 Hexzeichen geprüft.
- Zwei synthetische Fixtures verwenden jetzt das aktuelle Schema-2-Provenienzobjekt samt Publisher-Payloadmanifest. Regressionen decken jedes neue Feld, Schema 1, fehlende Schema-2-Felder sowie nach Manifest-Erstellung veränderte Provenienz ab.

### Geänderte Dateien
- `scripts/nsis_launcher_input_contract.py`
- `scripts/test_nsis_launcher_input_contract.py`
- `scripts/test_verify_nsis_launcher_payload.py`
- `docs/coordination/permissions-events.md`

### Prüfungen
- **PASS:** `python -B scripts/test_nsis_launcher_input_contract.py -v`: 13 Tests.
- **PASS:** `python -B scripts/test_verify_nsis_launcher_payload.py -v`: 12 Tests.
- Beide Fixtures verwendeten nur synthetische Payloadbytes, Publisher-Manifeste und injizierte Signaturergebnisse. Kein Build, SignTool, Installer, API oder Netzwerk.
- Python meldete `Failed to find real location of C:\Python314\python.exe`, setzte beide Testprozesse aber fort; beide Exits waren 0 und beide Unittest-Summaries `OK`.

### Status getrennt
- **Behoben und geprüft:** Der aktuelle Schema-2-Producer passt zum Consumer und beiden synthetischen Testpfaden; Schema-1-Fallback ist ausgeschlossen.
- **Teilweise geprüft:** lokale Konsistenz-/Fixtureverträge; keine echte Publisher-Artefaktherkunft oder NSIS-Integration.
- **Blockiert:** kein lokaler Blocker für den Consumer-Patch.
- **Nicht geprüft:** echte Windows-Authenticode-/Zeitstempelverifikation oder Installerbuild.
- **Offene Risiken:** `timestampSignerThumbprint` wird syntaktisch validiert, aber die bestehende Signatur-Callback-API liefert keinen tatsächlichen Timestamp-Zertifikat-Thumbprint zum Vergleich. Die Provenienzfelder bleiben daher Claims im geprüften Publisher-Payload, kein selbständiger Actions-Ursprungsnachweis.
- **SHA-256 Freeze nach Änderungen:**
  - `scripts/nsis_launcher_input_contract.py`: `3D519711DCFD8BB04DFC746C39E6E514DCCC8045AAC1335AFBAA2976408A9E01`
  - `scripts/test_nsis_launcher_input_contract.py`: `5CF155973765B482BD4BF3C9F63FE473D58832EAA82C1FFA0CD18B0DEF8FBE55`
  - `scripts/test_verify_nsis_launcher_payload.py`: `9A38A7889F1550CF4F50B226F4410D26A604EF849208E672CD8580039A0031B0`

## 2026-10-08 – Launcher Handoff fixture coverage follow-up

### Befund und Umsetzung
- The Jest wrapper still asserted the retired stdout marker `PASS: ordinal candidate/signed filename sets`, although the PowerShell fixture now reports the receipt-bound pre-sign contract. The fixture output preserves the old marker and adds explicit receipt/source rejection markers; the wrapper asserts both contracts.
- Added synthetic fail-closed cases for a dirty source tree, a source-run receipt bound to the wrong run, and a retargeted tag. Each rejection asserts Fake-SignTool was never invoked and no signed output was accepted; fixture mutations are restored.

### Geänderte Dateien
- `scripts/test_launcher_release_handoff.ps1`
- `app/test/launcher-release-handoff.test.js`

### Prüfungen
- **PASS:** `pwsh -NoProfile -File scripts/test_launcher_release_handoff.ps1`; isolated synthetic repository and fake tools only.
- **PASS:** `launcher-release-handoff.test.js`: 1 Suite / 1 Test, standard Jest completion.
- **PASS:** `git diff --check` for the wrapper changes.
- No real SignTool, signing credentials, Go build, GitHub API, upload, or release action.

### Status getrennt
- **Behoben und geprüft:** obsolete marker contract and all three requested Fake-SignTool=0 regression cases.
- **Teilweise geprüft:** synthetic PowerShell/fake-tool contract only; hosted workflow and actual signing environment are not exercised.
- **Blockiert:** none.
- **Nicht geprüft:** distribution-side independent execution; no Distribution chat was identified in the accessible active threads or first archived page.
- **Offene Entscheidung:** route the frozen source hashes to Distribution once the correct conversation is identified.

## 2026-10-08 – TopTier Public-Projektions-Handoff

### Befund und Umsetzung
- Der aktuelle Public-Projektor `projectTopTierUpdate()` gibt ausschließlich `board` und validierte Rendererfelder aus `entries` weiter. `sessionId`, `active` und zusätzliche Producer-/DB-Felder fallen weg. `toptier:update` wird lokal weiterhin mit dem Originalpayload übertragen; auch der direkte `toptier:get-board`-Antwortvertrag im Plugin bleibt unverändert.
- Der Originalrenderer liest `board` und `entries`; `sessionId` wird nicht verwendet. Die Regression ruft den echten `toptier:get-board`-Handler mit synthetischen Daten für lokalen und Public-Socket auf und rendert beide Antworten über den vorhandenen Originalrenderer-Fixture-Harness. Beide DOM-Ranglisten stimmen überein. Das Public-Paket enthält weder Session-ID noch Canary-DB-Feld; das lokale Paket behält beide. Ungültiger Board/Score sowie ein unbekanntes Event werden im Public-Socket-Fixture abgewiesen.
- Projektor- und Adapterimplementierung lagen bereits im gemeinsamen Dirty Tree. Diese Fortsetzung änderte nur `app/test/toptier-public-session-boundary.test.js` (synthetische Testzulassung zur isolierten Projektionserprobung und Renderer-Gleichheitsassertion); keine Produktquelle, Registry, Producer oder Overlaydatei wurde geändert.

### Geänderte Dateien und Prüfungen
- In dieser Fortsetzung geändert: `app/test/toptier-public-session-boundary.test.js`.
- Vorbestehender, gemeinsamer Dirty-Tree-Implementierungsstand: `app/modules/public-overlay-payload-projection.js` und `app/modules/public-overlay-socket-adapter.js`; diese Dateien enthalten weitere parallele TopTier-/Weather-/SuperFan-Hunks und werden nicht als nur von diesem Handoff geändert beansprucht.
- **PASS:** Node v22.14 fokussiert `public-overlay-payload-projection`, `public-overlay-socket-adapter`, `toptier-public-session-boundary`, `plugins/toptier/test/obs-toptier-fixtures`: **4 Suites / 55 Tests**.
- Der erste Jest-Start scheiterte vor Tests wegen Windows-Sandbox-`EPERM` beim `realpath` des Temp-Pfads. Der autorisierte Wiederholungslauf außerhalb der Sandbox war grün. `git diff --check` war für die gezielten Pfade sauber; Git meldet lediglich die bekannte LF/CRLF-Konvertierungswarnung des gemischt bearbeiteten Projektors.
- Keine Profile/DBs, echten Nutzerwerte, OBS-Instanz, Server, Tunnel, Netzwerk- oder Liveaktionen; kein Commit, Push oder Release.

### Status getrennt
- **Behoben und geprüft:** Public TopTier `toptier:update` enthält keine Session-ID und keine unbekannten Entryfelder; lokale Rangliste/Session-ID bleiben intakt; Originalrenderer zeigt in der Fixture dieselbe Rangliste; malformed/unknown fail-closed.
- **Teilweise geprüft:** isolierte Socket-/Originalrenderer-Fixtures und Jest; reale Socket.IO-Runtime/OBS und dynamische Produktionsfreigabe wurden nicht ausgeführt. Die Testdatei verwendet eine synthetische Zulassung, während reale Public-Admission unverändert deny-by-default bleibt.
- **Blockiert:** nichts für den engen Projektionsauftrag.
- **Nicht geprüft:** öffentliche Tunnel-/OBS-Abnahme und Deploy-Verhalten.
- **Offene Entscheidungen:** keine für diesen DTO-Schnitt; andere parallele Public-Overlay-Freigaben bleiben separat CEO-/Owner-gesteuert.
- **SHA-256 aktueller Checkout-Inhalt (kein Commit-/Freeze-Nachweis):**
  - `app/modules/public-overlay-payload-projection.js`: `E30F1FCF940BB21AB6059DE85B00E550A92D22BC926D35E18A9A701AF4DBD57F`
  - `app/modules/public-overlay-socket-adapter.js`: `FD5E540010E65BCEB29FE62A09490B20AFFC841BD055D9E3C133939BD3B515C6`
  - `app/test/toptier-public-session-boundary.test.js`: `EC48DFA327284204D826513F4159DA33815D91AE644F792E66ED6598818ED3E1`
  - `app/plugins/toptier/assets/overlay.js` (unveränderter Rendererreferenzstand): `1FD08125A8C4A8048B6055F42513F74795E2891DABD39B2AA30924B30CAC14E1`

## 2026-10-08 – Music-Bot Queue-Shutdown-Fixture

### Befund und Umsetzung
- `MusicBotPlugin._finalizeDestroy()` verlangt für einen erfolgreichen Queue-Persistvorgang `persistResult.success === true`. Der echte `QueueManager.persistQueue()` liefert `{ success: true, blocked: false, count }` bei Erfolg; die alte Shutdown-Fixture gab mit `jest.fn()` implizit `undefined` zurück und modellierte damit keinen erfolgreichen Persistfall.
- Ausschließlich die vorhandene Fixture in `app/test/music-bot-runtime-ui-regression.test.js` wurde angepasst: der Fake liefert jetzt `{ success: true, blocked: false, count: 0 }` für die leere synthetische Queue. Kein Queue-/Plugin-Produktcode wurde geändert.

### Prüfungen und Grenzen
- **PASS:** Node v22.14 `music-bot-runtime-ui-regression.test.js`: **1 Suite / 157 Tests**.
- **PASS:** `git diff --check` für Test und diesen Statusnachtrag.
- Der Sandbox-Start von Jest scheiterte vor der Testausführung beim Windows-`realpath`-Temp-Pfad; der gezielte Lauf außerhalb der Sandbox war grün.
- Keine Liveaktionen, echten Queue-/Zuschauerdaten, MPV-Prozesse, Änderungen an Produktcode, Commit, Push oder Release.
- **SHA-256 aktueller kompletter Testdatei (enthält weitere bereits vorhandene Dirty-Tree-Hunks; kein isolierter Patch-/Commit-Freeze):** `D4FEDF7DA8D6E14F230BA168DCB95128DCFC75B8497E39CB787DF6D894D7FF79`.

### Status getrennt
- **Behoben und geprüft:** die erfolgreiche Shutdown-Fixture entspricht wieder dem realen persistResult-Vertrag.
- **Teilweise geprüft:** vollständige Runtime-UI-Regression im lokalen Jest-Testlauf; kein Plugin-Lifecycle mit echter Datenbank/MPV gestartet.
- **Blockiert:** nichts im engen Fixture-Fix.
- **Nicht geprüft:** reale Queue-Persistenz oder Anwendungsshutdown.
- **Offene Entscheidung:** keine für diesen Fixture-Vertrag.

## 2026-10-08 – Restart-Integrationstest-Review und deny-by-default Rollenfixture

### Read-only Review
- `app/test/music-bot-profile-restart-sqlite-integration.test.js` wurde gegen aktuellen `PluginLoader`, `QueueManager` und `ServerRestartCoordinator` gelesen. Keine belegte Assertion-Lücke gefunden: SQLite-`BEGIN EXCLUSIVE` blockiert den ersten Queue-Restore; Restart bricht vor HTTP-/DB-Schließung ab und ruft Exit 75 nicht auf. Nach Rollback und explizitem Retry werden Plugin-Unload, DB-Flush/Close, HTTP-Close und Exit 75 in Reihenfolge geprüft. Eine neu geöffnete `DatabaseManager`-Instanz enthält die exakten Queue-Zeilen/-Reihenfolge und lädt sie erneut in `QueueManager`.
- Der Test nutzt echte SQLite-/Manager-/Plugin-/Coordinator-Klassen, aber synthetische Timer, HTTP-Server-, Socket.IO- und Prozess-Exit-Adapter. Er belegt daher keinen echten HTTP-Listener oder OS-Prozess-Exit. CEO meldete unabhängig 2 Suites / 2 Tests PASS; in diesem read-only Review wurde nichts gestartet oder geändert.

### Kleiner Rollen-Testblock
- Ergänzt wurde in `app/test/permissions-events-regression.test.js` ein Fail-closed-Fall: `CommandParser._hasPermission()` lehnt eine unbekannte Berechtigungsstufe selbst dann ab, wenn Moderator-, Subscriber-, Follower- und Team-Felder positiv gesetzt sind. Keine Änderung an `music-bot/main.js`, Public-Overlay oder Produktcode.
- **PASS:** Node v22.14 `permissions-events-regression.test.js`: **1 Suite / 8 Tests**. `git diff --check` für Test und Statusdatei PASS.
- **Status:** behoben und geprüft (Regression); teilweise geprüft (Methodenfixture, keine Live-/Chataktion); blockiert: nichts; nicht geprüft: keine Plugin-/TikTok-Laufzeit.
- SHA-256 der aktuellen Fixturedatei: `1505EE7CEFB2B3C23CDD70AC3692BB35DB861C738C30DEC7D15FA8361B395DB0`.

## 2026-10-08 – Music-Bot Resolver-HTTP-Fehlerklassen

### Befund und Umsetzung
- Ein synthetischer direkter YouTube-URL-Aufruf mit Resolverresultat `reason: 'resolver_unavailable'` wird an beiden Dashboardrouten als HTTP 503 abgebildet. Unbekannte Providerfehler liefern ebenfalls 503; `ETIMEDOUT` bleibt 504.
- `_resolveUncached()` versieht unsupported direkte URLs mit dem stabilen Code `UNSUPPORTED_SOURCE_URL`. GET `/resolve` und POST `/request` antworten dafür konsistent mit 400, bevor Provider-/Runnerarbeit startet. Sonstige fehlgeschlagene Resultate wie `not_found` bleiben 400.
- Änderungen lagen auf den bereits dirty Music-Bot-Routen-/Resolverpfaden; keine übrigen Hunkbereiche wurden ersetzt. Neue Regressionen sind im bestehenden isolierten Dashboard-Routefixture; der direkte URL-Fall verwendet einen Fake-Runner und belegt zero provider calls.

### Geänderte Dateien und Prüfungen
- `app/plugins/music-bot/lib/music-resolver.js` — stabiler Code für unsupported source URL.
- `app/plugins/music-bot/main.js` — gemeinsame HTTP-Klassifikation an GET preview und POST request, samt Result-/Exceptionpfaden.
- `app/test/music-bot-dashboard-request-routes.test.js` — setup failure 503, provider error 503, timeout 504, beide Methoden mit unsupported direkter URL 400.
- **PASS:** Node v22.14: `music-bot-dashboard-request-routes.test.js` + `music-bot-resolver-retry-contract.test.js`: **2 Suites / 25 Tests**.
- **PASS:** `git diff --check` für betroffene Quellen und Routefixture. Git meldet die bereits bekannte LF/CRLF-Warnung beim gemischt geänderten `music-resolver.js`.
- Ausschließlich synthetische Resolverantworten/Fake-Runner; kein Provider, Netz, Profil, DB, Queue, Prozess, Commit, Push oder Release.

### Status getrennt
- **Behoben und geprüft:** setup/provider outage 503, unsupported direct URL 400, timeout 504 für beide Dashboardrouten; Fehlerdetails bleiben in den generischen Exceptionantworten verborgen.
- **Teilweise geprüft:** isolierte Route-/Resolver-Fixtures; keine echte HTTP-Serverintegration.
- **Blockiert:** nichts für diesen engen Vertrag.
- **Nicht geprüft:** Verhalten externer Provider oder Browserintegration.
- **Folgefix History replay:** POST `/api/plugins/music-bot/history/:eventId/replay` übernimmt jetzt nur die freigegebenen Statuswerte 503/504; andere Fehler gehen als 400 zurück. Die Antwort enthält einen festen, sicheren Fehlersatz und serialisiert weder `httpStatus` noch interne Codes/Providerdetails. Synthetische Regressionen decken 400/503/504 ab und prüfen Canary- und Token-Redaktion.
- **Weitere Folgefehler:** Nach Prüfung der `_handleDashboardRequest()`-Aufrufstellen in den Dashboardrouten wurde kein weiterer klarer HTTP-/JSON-Mapperfehler in diesem Request-/Replay-Pfad gefunden. Nächster Auftrag wird vom CEO bestimmt.
- **SHA-256 aktueller kompletter Checkout-Inhalt (Dateien enthalten parallele/vorbestehende Dirty hunks; kein commit freeze):**
  - `app/plugins/music-bot/main.js`: `81497749B9B6324DC0513789CAD317E6C656C675639A839EA8D66C7FE24D838A`
  - `app/plugins/music-bot/lib/music-resolver.js`: `2313AD810F7DB31BADA0AA0CB124FC857C51C2D18749A8929F4C41B56014A7A0`
  - `app/test/music-bot-dashboard-request-routes.test.js`: `6A74577EFCBEC75469E32D8F96095D51A845D9EDA8871FB6E22F3EAE11E59C25`
  - `app/test/music-bot-resolver-retry-contract.test.js`: `52CC1DDCA43E22E4327F34475CBB23BEC9F3CB139FE9339B002C56E2C03BF320`

## 2026-10-08 – Music-Bot-Konfigurations-GET mit zentraler AdminAuth

### Befund und Umsetzung
- GET `/api/plugins/music-bot/config` liefert die vollständige Plugin-Konfiguration einschließlich lokaler Player-/yt-dlp-Pfade, Playlist-URLs, Moderationslisten und Gift-/Coin-Konfiguration. Die Dashboard-UI braucht diese Werte für ihre vorhandenen Kontrollen. Ein Redaktions-DTO hätte die lokale UI beschädigt.
- Die Route nutzt jetzt `createAdminAuth()` aus `app/modules/admin-auth.js`: direkter Loopback bleibt ohne Token möglich; remote Requests brauchen den zentralen Admin-Token. Forwarded-Loopback gilt nach dem bestehenden Vertrag nicht als direkter lokaler Zugriff.
- Die Music-Bot-UI sendet beim GET derzeit keinen Auth-Header. Remote Dashboard-Konfiguration mit Token ist daher erst nach einer separaten, abgestimmten Auth-Transportentscheidung benutzbar; lokale Dashboard-Nutzung bleibt erhalten.
- Die Quick-Tunnel-Regression stellt im bestehenden HTTP-Fixture sicher, dass die Config-Route und Music-Bot-UI einen neutralen 404 liefern, während das lokale Config-Fixture die sensiblen Canary-Werte enthält. Bestehende Public-Overlay-/Music-Bot-Projektionsregeln wurden nicht erweitert.
- Queue-Aktionsentwurf (ohne Implementierung): lokale Aktionen sollten eine Queue-Revision und stabile interne Eintragsidentität als If-Match-Bedingung verwenden, öffentliche Projektionen dürfen diese Identität/Revision nicht weitergeben; mutationsführende Queue-Aktionen werden serialisiert und konkurrierende Requests während einer laufenden Aktion abgewiesen. Revision bei jeder Membership-/Reihenfolgeänderung erhöhen; stale Aktionen ohne Mutation zurückweisen; bei Fehlern Reihenfolge/Membership unverändert lassen und nur die eigene Aktionssperre freigeben. Vor Umsetzung CEO-Entscheidung zur API-/UI-Kopplung einholen.

### Geänderte Dateien und Prüfstatus
- `app/plugins/music-bot/main.js` — AdminAuth am vollständigen Config-GET, zusätzlich zu bereits vorhandenen unabhängigen Dirty-Hunks.
- `app/test/music-bot-config-route.test.js` — Roundtrip-Fixtures setzen direkte Loopback-Adresse.
- `app/test/music-bot-config-get-admin-auth.test.js` — vier synthetische Rollen-/Canaryfälle für Loopback, Remote ohne Token, Remote mit zentralem Token und Forwarded-Loopback.
- `app/test/public-overlay-access.test.js` — Quick-Tunnel deny-by-default und lokale Config-Fixture ergänzt; Datei enthält weitere bestehende Änderungen.
- **PASS:** `node --check` auf Music-Bot-Hauptdatei und neue AdminAuth-Testdatei; `git diff --check` auf die zwei modifizierten vorhandenen Testdateien und Hauptdatei.
- **BLOCKIERT:** Jest-Suiten `admin-auth-security`, `music-bot-config-route`, `music-bot-config-get-admin-auth`, `public-overlay-access`, `music-bot-public-projection` und `music-bot-public-admission`. Jest bricht vor Testausführung ab: `EPERM: operation not permitted, realpath` auf E:-Temp, lokale Workspace-Temp-Pfade und danach AppData-Sandbox-Temp. Die aktuelle Shell meldet Node v24.16.0; Node 22.14-Validierung ist in dieser Sitzung nicht verfügbar.
- Keine Listener, Netzwerkzugriffe, Profile, echte Queue-/Guthaben-/Rollenaktionen, Staging, Commit, Push oder Veröffentlichung.

### Status getrennt
- **Behoben:** ungeschützter Remote Config-GET; synthetische Regressionen hinzugefügt.
- **Teilweise geprüft:** Codepfad und Fixtures statisch geprüft, `node --check` und `git diff --check` bestanden; die Jest-Assertions konnten wegen Temp-`realpath`-EPERM nicht ausgeführt werden.
- **Blockiert:** zielgerichtete Jest-Verifikation in dieser Sandbox.
- **Nicht geprüft:** Browser-/Remote-UI-Tokenfluss; Queue-Stale-Schutz wurde nur als Entwurf festgehalten; keine reale Server-/Tunnel-/Live-Integration.
- SHA-256 der aktuellen vollständigen Dateiinhalte (Dateien enthalten bereits parallele/vorbestehende Änderungen):
  - `app/plugins/music-bot/main.js`: `34628B23D0F52F5F77B2B2A9AF60558A3B6330A8A2D9C854CD5D27C648A2BF92`
  - `app/test/music-bot-config-route.test.js`: `3ED7DF810DCCFA16C03BE7C079578752A2134CEE75087AA3BF589471FF17ACC4`
  - `app/test/public-overlay-access.test.js`: `554295700E9917E338F0F8717F2A1EFA39393F0ED27CE52E96E1482D203D97D5`
  - `app/test/music-bot-config-get-admin-auth.test.js`: `EF52A1579285946D5B73FD6D58F7BD9DEAA098D2297F32B7FDDCB14E52B4AE91`
### Verifikationsnachtrag – Node 22 Shared-Tree-Lauf
- CEO meldete nach Integration des Shared Trees einen aktuellen Node 22 Lauf: `music-bot-config-get-admin-auth.test.js`, `public-overlay-access.test.js`, `admin-socket-authorization.test.js` — **3 Suites / 80 Tests PASS**; gezieltes `git diff --check` für die drei Testpfade PASS. Es wurden auf diese Meldung hin keine weiteren Jest-Retries gestartet.
- Der aktuelle vollständige SHA-256 von `app/plugins/music-bot/main.js` ist `34628B23D0F52F5F77B2B2A9AF60558A3B6330A8A2D9C854CD5D27C648A2BF92`, identisch mit dem zuvor notierten Hash der geprüften Änderung; damit deckt die gemeldete aktuelle Source-Fassung den Integrationsstand ab.
- Pfadprüfung bestätigt: `createPublicOverlayMiddleware` wird bei `app/server.js:270` vor der Registrierung von Plugin-Routen eingehängt. `app/modules/public-overlay-access.js` liefert für Quick Tunnel Hosts sofort neutral 404, wenn der Pfad nicht in der Freigabeliste ist; `/api/plugins/music-bot/config` ist dort nicht freigegeben. Der spätere `/api`-Middleware-Auth-Bypass für GET betrifft nur den globalen AdminAuth-Wrapper und wird durch den davor ausgeführten Plugin-Config-Handler mit eigenem `createAdminAuth()` abgesichert. Kein GET-Auth-Bypass in der Music-Bot-Route.
- Restgrenze bleibt: Remote UI GET sendet den zentralen Token nicht; generische Reverse-Proxies außerhalb des spezifischen Quick-Tunnel-Hosts hängen an der route-level AdminAuth und benötigen Token. Keine Browser-, echter Server- oder Tunnel-Integration geprüft.
- **Status aktualisiert:** behoben und geprüft (80 synthetische Tests, Codepfad); teilweise geprüft (keine echte Laufzeit); blockiert: nichts für diesen Scope; nicht geprüft: remote UI Token-Transport und Queue-Stale-Implementierung.
## 2026-10-08 – GET-Auth-Fallback-Regressionen

### Befund und Umsetzung
- Die Music-Bot-Config-GET-Regression ergänzt gezielte Fälle für `ADMIN_TOKEN` wenn `LTTH_ADMIN_TOKEN` fehlt, `Bearer`, falsches Token, IPv6-Loopback, explizite Nichtausgabe der Pfad-/URL-/Moderations-/Monetarisierungs-/Unknown-Canaries sowie `LTTH_ADMIN_TOKEN=''`.
- Der synthetische API-Harness bindet die registrierten GET-Handler an eine echte Express-Test-App und der Supertest-Roundtrip prüft den lokalen Config-GET ohne echten Listener. Das bildet die Handler-zu-Express-HTTP-Ausführung ab; PluginLoader-Router/Wrapping selbst wird dabei nicht instanziiert.
- Separater kompatibler Befund, kein Verhaltensfix: `createAdminAuth()` und `verifyAdminCredential()` verwenden Nullish-Coalescing für `LTTH_ADMIN_TOKEN ?? ADMIN_TOKEN`. Ist `LTTH_ADMIN_TOKEN` explizit leer, gilt es als ausgewählt und der `ADMIN_TOKEN`-Fallback greift nicht. Wenn LTTH_ADMIN_TOKEN fehlt, funktioniert der Fallback. Auth-Code blieb unverändert.

### Änderungen und Verifikation
- `app/test/music-bot-config-get-admin-auth.test.js` — synthetische Regressionen/Harness.
- **PASS:** projektgebundenes Node v22.14.0 `--runTestsByPath` für `music-bot-config-get-admin-auth.test.js`, `music-bot-config-route.test.js`, `admin-auth-security.test.js`: **3 Suites / 46 Tests**.
- **PASS:** `node --check` für neue Testdatei; scoped `git diff --check` für vorhandene geänderte Quelldatei und Statusnotiz. Neue untracked Testdatei zusätzlich auf Zeilenend-Leerraum geprüft.
- Music-Bot-Produktcode und bestehende fremde Dirty-Hunks unverändert.

### Status getrennt
- **Behoben und geprüft:** die angeforderten Auth-Fallback-, Header-, Fehlertoken-, IPv6-, Canary- und Express-Handlerfälle.
- **Teilweise geprüft:** Express HTTP-Roundtrip mit synthetischem `registerRoute`-API; kein echter PluginLoader-Instanz-/Routerlauf.
- **Blockiert:** nichts für diesen Folgeauftrag.
- **Nicht geprüft:** Serverstart, Netz/Profil/DB und reale Remote-UI.
- SHA-256 Testfixture: `35221CE7B4B08B5B81E8D4C25B23C693906574E2928F66A07838BCF39A87BE83`.
## 2026-10-08 – Music-Bot-Mutationspfade Auth-Audit

### Befund
- Read-only Inventur in `app/plugins/music-bot/main.js`: alle schreibenden HTTP-Routen registrieren `POST`, `PUT`, `PATCH` oder `DELETE` unter `/api/plugins/music-bot/...` (Queue, Playback/Volume, Config, Playlist, Radio/Auto-DJ, Safety/Player, Requests, Bans, Feedback/History). PluginLoader-`registerRoute` fügt für Music Bot keinen Route-Alias hinzu; Legacy-Aliasregeln gelten dort nur für Stream Monsters.
- `app/server.js` registriert den globalen `/api`-AdminAuth-Guard vor der PluginLoader-Instanz und dem dynamischen Plugin-Router. Er ruft für `POST`/`PUT`/`PATCH`/`DELETE` zentral `createAdminAuth()` auf: direkter Loopback bleibt lokal; Remote benötigt den zentralen Token. Ich fand keine Music-Bot-Schreibroute außerhalb dieses Präfixes und keinen method-override Pfad.
- Die vier expliziten Playback-Events sind `musicbot:dashboard-skip`, `musicbot:dashboard-volume`, `musicbot:dashboard-pause`, `musicbot:dashboard-resume`. Jeder Handler ruft zuerst `_requireDashboardSocketAdmin()` auf und führt bei Ablehnung die Aktion nicht aus. Ohne serverseitige Freigabemarkierung verlangt der Plugin-Guard `handshake.auth.role === 'admin'`; bei Remote zusätzlich gültigen zentralen Token. Direkter Loopback-Admin bleibt tokenfrei.
- Die reale zentrale Socket.IO-Middleware klassifiziert nach gültigem Remote-Token serverseitig `socket.data.ltthSocketAccess = 'admin'`; Loopback wird `loopback-admin`. Der Plugin-Guard vertraut dieser serverseitigen Markierung. Damit ist der zentrale Token die maßgebliche Admin-Berechtigung; ein clientseitiger Rollenstring `guest`/`moderator` kann eine bereits serverseitig freigegebene Admin-Verbindung weder herabstufen noch selbst hochstufen. Ohne zentrale Markierung/token scheitert der Plugin-Guard für nicht-admin Rollen.
- Quick Tunnel: frühe HTTP-Middleware blockiert nicht freigegebene Routen/Methoden mit neutralem 404. Der öffentliche Socket-Paketguard gestattet nur Registry-/Release-freigegebene Incoming-Events; die vier `musicbot:dashboard-*` Mutationsevents stehen nicht in der öffentlichen Incoming-Allowlist. Public read-only Music-Bot-Daten laufen separat über öffentliche Projektion/Adapter-Verträge.

### Testbelege
- `app/test/music-bot-socket-authorization.test.js`: alle vier Dashboard-Events für unbefugte Socket-Rollen verweigert (keine Aktion); Loopback-Admin und Remote-Admin mit Token erlaubt; fehlendes/falsches Token und forwarded Loopback abgewiesen.
- `app/test/admin-socket-authorization.test.js`: zentraler Socket-Guard verweigert Remote ohne/mit falschem Token und lässt Remote mit zentralem Token sowie Loopback durch; Music-Bot-Guard vertraut zentralem `ltthSocketAccess`.
- `app/test/music-bot-plugin-loader-socket-integration.test.js`: tatsächliche PluginLoader-Eventbindung erhält Socket-Handshake/Identität; genau eine Mutation wird ausgeführt; Unregister/Reload/Destroy entfernen alte Handler.
- `app/test/admin-auth-security.test.js`: HTTP zentraler AdminAuth-Vertrag, Remote Credentials und Loopback.
- **PASS:** Node v22.14.0, gezieltes `--runTestsByPath` über die vier genannten Suiten: **4 Suites / 97 Tests**. Synthetische/in-memory Fixtures; kein Server, Listener, Netzwerk oder DB.

### Status und Grenzen
- **Behoben / bestätigt:** In den geprüften HTTP- und Socket-Schreibpfaden wurde kein Auth-Bypass gefunden; keine Produktänderung vorgenommen.
- **Teilweise geprüft:** guest/moderator Rollen werden nicht in jeder Suite als eigene Labelvarianten auf dem voll zentral authentisierten Socket durchgespielt. Der zentrale Token setzt absichtlich die serverseitige Admin-Markierung; deshalb ist der Client-Rollenstring in diesem Fall nicht die Berechtigungsquelle.
- **Offene Entscheidung:** Falls die Produktanforderung auch bei gültigem zentralem Admin-Token zusätzlich `handshake.auth.role === 'admin'` verlangen soll, ist das ein geändertes Rollenmodell; die derzeitige serverseitige Token-zu-Admin-Klassifizierung spricht dagegen. Vor einer Implementierung müsste der CEO diese Semantik bestätigen.
- **Nicht geprüft:** echte Socket.IO-/HTTP-Laufzeit, Browserclient, Quick-Tunnel-Produktivverhalten oder externe Reverse-Proxies. Kein Code geändert; keine echte Aktion oder Datenberührung.
## 2026-10-08 – Engine.IO `bind=select` und Konfigurations-Lokalvertrag

### Engine.IO/Socket.IO Audit (read-only)
- `NetworkManager._resolveBindAddress()` setzt `select` auf `0.0.0.0`. `getIPRestrictionMiddleware()` prüft ausgewählte Interfaces nur als Express-`app.use`-Middleware; Loopback bleibt erlaubt.
- `socket.io` wird direkt am HTTP-Server mit Polling, WebSocket und Upgrades angehängt. Die installierte Engine.IO-Implementierung fängt `/socket.io` in einem eigenen `server.on('request')`-Handler ab und verarbeitet Upgrades in `server.on('upgrade')`, bevor der bisherige Express-Request-Handler aufgerufen würde. Engine.IO bietet `allowRequest` und `engine.use`, aber `app/server.js` registriert dort keine NetworkManager-IP-Prüfung.
- Reihenfolge: Engine.IO-Transport-Handshake/Upgrade, danach Socket.IO Namespace-CONNECT. Erst bei CONNECT laufen `attachPublicSocketPolicy` und danach `createAdminSocketAuthorization`; tokenfreie Remote-Clients werden vor Namespace-`connection` und Plugin-Eventbindung abgewiesen.
- **Befund:** Ein nicht ausgewählter LAN-Client kann im `select`-Modus dennoch den Engine.IO Polling-/WebSocket-Handshake erreichen und Transport-Sessions/Ressourcen belegen. Der vorherige Befund bestätigt keinen Zugriff auf Namespace-Events, Musik-Bot-Daten oder andere Application-Payloads vor dem Admin-Guard. Das ist ein `bind=select`-Netzwerkgrenzen-Bypass mit Ressourcen-/DoS-Risiko, kein nachgewiesener Event-/Datenleckpfad.
- Loopback wird von der bestehenden Auswahlprüfung ausdrücklich zugelassen. `local` bindet auf `127.0.0.1`; `all` bindet auf `0.0.0.0` und ist absichtlich offen innerhalb des Admin-Authentifizierungsvertrags.
- Ein isolierter E:-Kandidat mit kopierter `network-manager.js` wurde durch Auto-Review abgelehnt (Begründung: nicht autorisierter Export dieser anderen internen Quelldatei). Keine Umgehung versucht; Shared Code blieb unverändert. Gemäß Folgeauftrag wurde der Audit read-only geschlossen.

### Konfigurations-GET: aktualisierte Entscheidung und E-only Contract-Check
- Nutzerentscheidung: Music-Bot-Konfiguration bleibt ausschließlich lokal lesbar; keine Token-Eingabe oder Remote-Token-UX.
- E-only Prüfung in `E:\ltth_status_http_privacy_candidate\config-local-only-contract\config-local-only-contract.test.js` importiert den Plugin-Handler direkt aus dem Shared Tree, kopiert keine Source-Dateien und startet keinen Server.
- **PASS als Beobachtungsprüfung:** Loopback erhält die volle Konfiguration; Remote ohne Token wird abgewiesen; Remote mit gültigem zentralem Token erhält derzeit jedoch ebenfalls die volle Konfiguration (HTTP 200). Der aktuelle `createAdminAuth()`-Vertrag ist token-geschützter Remotezugriff, nicht strikt lokal-only.
- **PASS als UI-Beobachtung:** Der Music-Bot-GET-Helper sendet keinen Token und es wurde kein lokaler-only Hinweis gefunden. Die 401-Antwort `Missing admin authentication token` wird beim Laden nicht als sichtbarer local-only Zustand gerendert; der generische Fehler-/Config-Pfad ist damit für Remote nicht eindeutig.
- E-only Node-22 Lauf: **4 Tests PASS**; sie dokumentieren Ist-Verhalten und schließen den Lokalvertrag gerade nicht als erfüllt ab. SHA-256: `87BE73D26205224DE88029D007AB17EBF2A560331D56160618C5C83045854737`.
- Keine Source-/UI-/Netzwerk-/Profil-/DB-Änderung im Shared Tree.

### Status getrennt
- **Geprüft:** Namespace-Middleware verhindert tokenfreie Remote Socket.IO-Application-Verbindungen; Auth-Tests aus vorherigem Auftrag: 4 Suites / 97 Tests PASS.
- **Teilweise geprüft:** Engine.IO-Handshake vor Namespace-Auth ist anhand installierter Engine.IO/Socket.IO-Quellen nachverfolgt; kein echter Server-/Transportlauf nach Nutzerverbot.
- **Offen:** Schutz der Engine.IO-Transportebene für `bind=select`; kein integrierter Fix oder E-only Transportpatch erstellt.
- **Nicht erfüllt nach neuer Nutzerentscheidung:** strikt local-only Config-GET und Remote-UI-Hinweis. E-only Contract testet den Ist-Zustand und zeigt beide Lücken; gemeinsame Produktänderung steht aus.
- **Nicht geprüft:** reale Netzwerkerreichbarkeit, remote browser rendering, echte Socket.IO client; keine Daten-/Eventaktion.
## 2026-10-08 – Music-Bot-Konfiguration strikt lokal

### Umsetzung
- GET `/api/plugins/music-bot/config` gibt nur noch dann den vollen Configbody zurück, wenn die rohe Socket-Adresse IPv4-/IPv6-Loopback ist und keine `Forwarded`-/`X-Forwarded-*`-Header vorliegen. Remote-Adressen werden unabhängig von `LTTH_ADMIN_TOKEN`, `ADMIN_TOKEN`, Bearer oder Custom Token mit HTTP 403 und festem Code `MUSIC_BOT_CONFIG_LOCAL_ONLY` abgewiesen. Fehlende/ungültige Adressen fail-closed; die Fehlerantwort enthält keinen Konfigurations-Canary.
- POST `/api/plugins/music-bot/config` und der zentrale AdminAuth-Vertrag blieben unangetastet.
- Das Dashboard erkennt den Local-only-Code sowie generische 401/403 beim Konfigurations-GET und zeigt über den bestehenden Toast-/Runtime-i18n-Mechanismus „Konfiguration nur lokal verfügbar“. Die Meldung liegt in DE/EN/ES/FR. Kein Tokenfeld und kein Tokenversand.

### Geänderte Pfade
- `app/plugins/music-bot/main.js` — nur Config-GET-Prüfung und die dafür benötigten AdminAuth-Address/Header-Helfer.
- `app/plugins/music-bot/assets/ui.js` — Error-Erkennung und lokalisierter Hinweis.
- `app/plugins/music-bot/locales/{de,en,es,fr}.json` — zwei Runtime-UI-Schlüssel pro Sprache.
- `app/test/music-bot-config-get-admin-auth.test.js` — IPv4/IPv6, LAN ohne/mit Token, Bearer/Fallback-Token, forwarded Loopback, fehlende/ungültige Adressen, Canary-Nichtausgabe und RegisterRoute-HTTP-Roundtrip.
- `app/test/music-bot-config-local-only-ui.contract.cjs` — Node-native JSDOM-Kette vom tatsächlich registrierten Handler bis zum Toast in allen vier Locales und kein Tokentransport.

### Tests
- **PASS:** Node v22.14.0 Jest `--runTestsByPath` für `music-bot-config-get-admin-auth.test.js`, `music-bot-config-route.test.js`, `admin-auth-security.test.js`: **3 Suites / 48 Tests**; POST-Config-Vertrag bleibt grün.
- **PASS:** Node v22.14.0 `node --test app/test/music-bot-config-local-only-ui.contract.cjs`: **8 Tests** (4 Locale-Subtests), einschließlich Loopback-Daten, Remote-Deny, sichtbarer Meldung und keinem Tokenheader.
- **PASS:** `node --check` für geänderten Plugin-Code, UI, Jest-Test und Node-Test; alle vier Locale-JSON-Dateien parsebar; scoped `git diff --check` ohne Whitespacefehler.
- **Umgebungsgrenze:** Der vorhandene Jest-Test `music-bot-runtime-ui-regression.test.js` ließ sich nicht laden, weil Jest 29 die transitive ESM-Datei `@exodus/bytes/encoding-lite.js` als CommonJS behandelt (`Must use import to load ES Module`). Die neue, native Node-Test-Fixture umgeht den Jest/jsdom-Loaderpfad und verifiziert die reale UI-JS-Datei in JSDOM.

### Status getrennt
- **Behoben und geprüft:** Route ist strikt direkt-loopback-only; UI zeigt den lokalen Hinweis ohne Token-UX; POST unverändert.
- **Teilweise geprüft:** synthetischer Handler/Express-RegisterRoute- und JSDOM-Kontrollfluss; kein echter Server/Browser.
- **Blockiert:** die breite Jest UI-Regression ist aufgrund des ESM/jsdom-Loaderfehlers nicht ausführbar; die neue native JSDOM-Contract-Fixture deckt den relevanten Fehlerpfad separat ab.
- **Nicht geprüft:** echte Browser-/Netz-/Tunnel-/Profil-/DB-Laufzeit.
- Keine Änderung an Shared APIs, Netzwerkeinstellungen, Rollen, Profilen, Daten, Liveaktionen, Commit, Push oder Release.
## 2026-10-08 – Zentrale Socket.IO-Namespace-Autorisierung

### Befund und Umsetzung
- Der aktuelle Shared Tree enthält bereits `createAdminSocketAuthorization()` in `app/modules/admin-socket-authorization.js`; der aktuelle uncommitted Hunk in `app/server.js` hängt sie nach `attachPublicSocketPolicy()` an `io.use()` und vor den globalen `io.on('connection')`-Handler. Damit scheitern direkte Remote-Handshakes ohne oder mit ungültigem zentralem Token vor `init:state`, TikTok-Status/Stats und Plugin-Connection-Handlern. Ein gültiger zentraler Token wird für Remotezugriff akzeptiert, Loopback bleibt tokenfrei.
- Produktionssuche fand keine `io.of()`-Namespaces. Die Plugin- und Core-Connection-Handler registrieren sich auf der Default-`io`-Instanz; der genannte `io.use()`-Guard steht vor diesem Connection-Dispatch.
- QuickTunnel-Host-Erkennung/Projektion wird vorher installiert. Der Auth-Guard reicht `publicQuickTunnel` an die Projektion weiter; nicht projektierte Events werden verworfen. Ein bereits vorhandener Socket-Policy-Hunk in `public-overlay-access.js` ist umfangreich und parallel geändert; er wurde nicht verändert.
- `bind=select` wird weiterhin über die Listeneradresse plus Express-IP-Middleware geregelt. Die Socket.IO-Auth greift auf Namespace-CONNECT, nachdem der Engine.IO HTTP-Polling-/WebSocket-Handshake angenommen wurde. Es wurde kein `allowRequest`/Engine.IO-Guard ergänzt. Deshalb blockiert diese Arbeit keine nicht ausgewählten LAN-Clients bereits am Engine.IO-Handshake und schützt dort nicht vor Ressourcenverbrauch.

### Eigene Änderung und parallele Hunks
- Eigene Änderung: `app/test/admin-socket-authorization-order.contract.cjs` – Node-native Fixture prüft die reale Registrierung in `server.js`, tokenfreies und ungültiges Remote-Token, gültigen Remote-Admin, Loopback sowie projizierte QuickTunnel-Ausgabe und Verwerfen von `init:state`.
- Bestehende Shared/Parallel-Hunks in `app/server.js`, `app/modules/public-overlay-access.js`, `app/modules/admin-socket-authorization.js` und `app/test/admin-socket-authorization.test.js` wurden nicht editiert oder zurückgesetzt. Die Änderung in `server.js` und die neu vorhandenen Auth-Modul-/Jest-Dateien stammen aus den schon vorhandenen Dirty-Hunks und werden hier nicht als eigene Implementierung beansprucht.

### Prüfungen
- **PASS:** `runtime/node/node.exe --test app/test/admin-socket-authorization-order.contract.cjs` – 6 Tests.
- **PASS:** `node --check` für `server.js`, `admin-socket-authorization.js`, `public-overlay-access.js` und die neue Fixture; scoped `git diff --check` für relevante Source-/Testpfade.
- **BLOCKIERT:** Jest 29 `--runTestsByPath` für `admin-socket-authorization.test.js`, `public-overlay-socket-events.test.js`, `public-overlay-approved-surface.test.js` konnte nicht starten. Node/Jest meldet `EPERM: operation not permitted, realpath` für den sandboxierten Windows-Temp-Pfad, auch bei Ausführung aus `app/` und `--watchman=false`. Der vorhandene Jest-Test deckt zusätzliche Token-/Eventfälle ab, wurde in diesem Lauf nicht erneut bestätigt.
- SHA-256 (gesamte aktuelle Dateien; bei Server/Policy handelt es sich um Shared Tree einschließlich fremder Dirty-Hunks):
  - `app/server.js`: `CDE809257CD43E505306C427CC4A231E4C1E5D32F0976F9A95E8AAC5732C13F3`
  - `app/modules/admin-socket-authorization.js`: `B6997EE87A75C2D2A45A1719025592E713E0B66B3F5A2CE4C4D25D83EE4099AB`
  - `app/modules/public-overlay-access.js`: `690609C8B24B9ACCA0EE8B44A77813132671C0D9377A4D7A462D1B5139D83BCD`
  - `app/test/admin-socket-authorization.test.js`: `C6FB302A899FF2898AED3FA65B23B8B5108CCE63ED0044D5FBDF149CCB4D8DCE`
  - `app/test/admin-socket-authorization-order.contract.cjs`: `A7FCD2A64D7DBF2CC694F5EF26D0BA3404EBBB558B151B1F6C7BDBDD5CBE252A`

### Status getrennt
- **Behoben und geprüft:** synthetischer Default-Namespace-Guard vor dem Connection-Dispatch; gültiger Remote-Admin, Loopback und der projizierte QuickTunnel-Pfad bleiben verfügbar.
- **Teilweise geprüft:** Quellordnungs-Vertrag plus Node-native Mock-Sockets. Die bestehenden Jest-Suiten konnten im aktuellen Windows-Sandboxlauf nicht ausgeführt werden.
- **Offene Grenze:** Engine.IO Polling-/WebSocket-Handshake wird hiervon nicht abgefangen; `bind=select` bleibt separat und unverändert.
- **Nicht geprüft:** reale Netzwerk-/Socket-Verbindungen, Listener, Browser, QuickTunnel-Liveausführung und Ressourcenverhalten am Engine.IO-Handshake. Kein Server/Listener gestartet, kein Netzwerk oder Liveaktion.

## 2026-10-08 – EulerStream SuperFan source-first Prüfung

### Befund
- `EulerstreamAdapter._dispatchEulerstreamMessage()` behandelt ausschließlich das als `WebcastBarrageMessage` benannte Envelope separat. `projectSuperFanDisplayMessage()` liest `content.displayType` und `commonBarrageContent.displayType`, sucht dort aber mit `String.includes()` nach festen Teilstrings. Bei Treffer wird der Actor aus genau einem `piecesList[].userValue.user` projiziert. Adapter und Connector geben `superfan-display` weiter; `WebcastBarrageMessage` wird nicht als gewöhnliches TikTok-Event oder rohe `superfan`-Rolle nach außen geleitet.
- Die Heuristik ist zu breit: synthetisch `prefix_ttlive_superfan_suffix`, `ttlive_superfanish` und `ttlive_superfan_joined` klassifizieren als `superfan`; nur unbekannte Marker ohne den Teilstring bleiben null. Das belegt Fehlklassifikation nach aktuellem Code, aber keine Providersemantik. Die lokalen SDK-Decoder belegen lediglich die serialisierbaren Schemafelder; alle Fixturewerte sind synthetisch. Kein realer EulerStream-/TikTok-Providervertrag wurde geprüft.
- Public Egress läuft über ClarityHUDs `handleSuperFanDisplayEvent`, die Event-Allowlist, `projectClaritySuperFanDisplay()` und den QuickTunnel-Socket-Projektor. Der Live-DTO ist exakt `eventType`, `displayName`, optional `level`, optional `profilePictureUrl`; Avatar-URL muss HTTPS sein und zu den freigegebenen TikTok-CDN-Hosts gehören. Queue-State-Projektion gibt ebenfalls nur diese DTO-Felder aus. Zusätzliche IDs/raw/settings/apiKey-Felder werden vom Projektor abgewiesen. Die QuickTunnel-Regel gestattet nur das explizite SuperFan-Display-Ereignis.
- Der Eventtyp und der Level kommen dennoch aus heuristischen/optionalem User-Feldern. Sie sind nur Darstellungsdaten; es wird keine Rolle, Berechtigung oder persistent gespeicherter SuperFan-Status daraus abgeleitet.

### Empfehlung
- Vor einer Produktkorrektur eine bestätigte Marker-Allowlist oder ein strukturelles Typfeld aus einer autoritativen Providerquelle festlegen. Bis dahin bekannte near-match-Werte fail-closed behandeln; rohe oder heuristisch erkannte Werte niemals zu Rollen-/Zugriffsentscheidungen hochstufen. Providerbestätigung ist eine offene Entscheidung.

### Eigene Änderung und Tests
- Nur `app/test/eulerstream-superfan-source-contract.cjs` ergänzt. Node-native Test prüft die Teilstring-Near-Matches und den synthetischen Pfad bis zur Public-QuickTunnel-Ausgabe einschließlich DTO-Feld-Allowlist.
- **PASS:** `runtime/node/node.exe --test app/test/eulerstream-superfan-source-contract.cjs` – 2 Tests; `node --check` und scoped `git diff --check` bestanden.
- **Nicht erneut bestätigt:** vorhandene Jest-Suiten `eulerstream-superfan-display.test.js`, `clarityhud-superfan-public-renderer-chain.test.js`, `superfan-role-negative.test.js`; Jest 29 scheitert derzeit vor Teststart an `EPERM realpath` des sandboxierten Windows-Temp-Pfads. Die neuen/parallel vorhandenen Fixtures sind synthetisch und kein Providerbeleg.
- Keine Produktdatei verändert. Adapter, Connector, ClarityHUD, Public-Overlay-Projektion/Registry/Event-Policy und ihre Tests enthalten umfangreiche bereits vorhandene parallele Dirty-Hunks; sie blieben unberührt.

### SHA-256
- `app/modules/adapters/EulerstreamAdapter.js`: `4252537C1481BFC3AA4A481CE79682E427A47D4664C5F541C7BC7E68D0023347`
- `app/modules/tiktok.js`: `ED4DD32C534B58DECD3B16126AABE407CDA6356D9A565C6DAC24247E7741C5EC`
- `app/plugins/clarityhud/lib/superfan-classifier.js`: `0256D16F21E4BA1933C620B8E5B6A391A7D0971208B6D5486E0162B73CBC1190`
- `app/plugins/clarityhud/backend/api.js`: `5E0D81183729625665CDCCD7A45BFEC761866FA5F77236A001DC2263D77D87C5`
- `app/modules/public-overlay-payload-projection.js`: `992F9380C817B55D8309CD0A273C7A7DB004F17F34631271B66214105A458B1C`
- `app/modules/public-overlay-event-policy.js`: `F93EC332CDB42D1D054F2F3DE1ACCBF359259B9436A392FE6309B5184707FD68`
- `app/modules/public-overlay-registry.js`: `ADD9AA527A93A43D7178F3E0433F06B5AFD87EE91E3E67FB21C43C96E26072C4`
- `app/modules/public-overlay-release-event-owners.json`: `9E46013B934E6D5301D80FB45BCCD650F5B7227F6A5F15F6E250A26773BE5A65`
- New source-contract fixture: `FBBF89822E04FC659383D67637B495F1280E5552684AFBDAEC672707E6F9E983`

### Status getrennt
- **Geprüft:** aktuelle lokale Felder, Weitergabe und Projektion per Quellverfolgung; synthetisch zwei Testfälle bestanden.
- **Teilweise geprüft:** Public-Egress DTO und QuickTunnel-Projektor mit lokalen synthetischen Fixtures; kein Lauf gegen echte Providerdaten.
- **Offen:** exakte Providerdefinition der SuperFan-/Join-Marker; Empfehlung ist daher Korrekturvorschlag, noch keine Produktänderung.
- **Nicht geprüft:** echte EulerStream-Nachricht, Netzwerk, Key, Livestream, DB/Profile oder reales Overlay.

## 2026-10-08 – Offizielle Primärquellen: EulerStream SuperFan-Felder

### Öffentlich dokumentiert
- EulerStream [WebSocket Event Types](https://www.eulerstream.com/docs/api/client-sdks/websocket-sdk/events) sagt, dass Nachrichten binär/protobuf-kodiert sind und nennt allgemeine Eventgruppen (Chat, Gift, Like, Member, Share, Follow, Subscribe, RoomUpdate, StreamEnd). Dort ist keine SuperFan-/Barrage-Markersemantik und kein `WebcastBarrageMessage` Feldpfad beschrieben.
- EulerStream [WebSocket API](https://www.eulerstream.com/docs/api/tiktok-web-socket-api) dokumentiert WSS-Verbindung, Query-Parameter und Schema-Version `v1`; der Endpunktvertrag beschreibt keine Eventpayload-Felder.
- EulerStream [WebSocket SDK](https://www.eulerstream.com/docs/api/client-sdks/websocket-sdk) bewirbt typisierte Eventschemas. Das offizielle [Schema-Einstiegsmodul](https://github.com/EulerStream/Euler-WebSocket-SDK/blob/master/src/webcast/schemas/v2.ts) re-exportiert `tiktok-live-proto-full-types/v2`; es liefert in dieser Datei selbst keine Feld- oder Semantikbeschreibung. Die Dokumentation verweist auf Types/Decoder als Integrationshilfe, erklärt aber keine SuperFan-Markerwerte.
- TikToks [offizielle Webhooks-Events-Dokumentation](https://developers.tiktok.com/docs/en/webhooks-events) beschreibt Webhooks mit `event`, `create_time`, `user_openid` und serialisiertem `content` (beispielhaft Autorisierungs- und Videoereignisse). Das ist ein anderes Produkt-/Transportformat und dokumentiert keine LIVE-Webcast-Protobuf-Felder.
- EulerStreams WebSocket-Doku nennt Creator-Profilbild/Anzeigename in der initialen Room-Info. Daraus folgt nicht, dass ein Viewer-Actor in `WebcastBarrageMessage` dieselben Profilfelder besitzt oder dass `nickname`/`profilePicture` darin normativ garantiert sind.

### Nicht belegt / indirekt
- Öffentlich nicht durch gefundene offizielle Primärquellen bestätigt: `content.displayType`, `commonBarrageContent.displayType`, `piecesList[].userValue.user`, `fansClubInfo.fansLevel`, `fansClub.data.level`, Viewer-`nickname`/`profilePicture`, exakte SuperFan-/Join-Marker und deren Rolle/Semantik.
- Vorherige lokale Decoder-, SDK-Schema- und synthetische Testbefunde bleiben Struktur-/Fixtureevidenz, kein Providervertrag. Die im Code verwendeten Teilstrings (`ttlive_superfan...`) bleiben provisorische Heuristik. Keine Schlussfolgerung über echte Feldlieferung oder Bedeutung.

### Enge nächste Validierung
- Für belastbare Klassifikation zuerst eine öffentliche offizielle Schema-/Eventreferenz oder schriftliche EulerStream-Maintainerbestätigung anfordern, die (a) exakte Nachrichten-/Textfelder, (b) Markerwerte für Eintritt/Join/Box, (c) Actor-Identität und Profilfelder und (d) Fanclub-Level-Semantik getrennt bestätigt. Erst danach eine versionierte redigierte synthetische Fixture mit den bestätigten Feldern anlegen und Marker-Allowlist samt unbekannten Near-Matches testen.
- Bis zu dieser Bestätigung keine Produktänderung und keine Rollen-/Berechtigungsableitung.
- Keine Keys, Providerverbindungen, Liveaktionen, Profile/DB, Source- oder Teständerungen in dieser Primärquellenprüfung.

## 2026-10-08 – Adversarial Review: Music-Bot lokale Daten-GETs

### Befund
- Die aktuelle Policy in `app/modules/music-bot-local-read-policy.js` fängt `GET` und `HEAD` ab. Sie prüft `req.socket.remoteAddress` (Fallback `req.connection.remoteAddress`), akzeptiert nur IPv4 `127/8`, IPv6 `::1` und IPv4-mapped IPv6 aus `127/8`, und verweigert jede `Forwarded`- oder `X-Forwarded-*`-Angabe. Ein mitgesendeter Admin-Token ändert diese Entscheidung nicht.
- Quellabgleich der aktuellen `app/plugins/music-bot/main.js`-Registrierungen ergibt genau 17 API-GETs unter `/api/plugins/music-bot/...`, darunter Status, Diagnostik, Queue/Playlist-/Radio-/History-/Ban-/Setup-/Resolverdaten. Der `/api/plugins/music-bot`-Mount in `app/server.js` liegt vor der globalen `/api`-AdminAuth-Ausnahme für GET/HEAD/OPTIONS. Plugin-Router werden erst später bei der `PluginLoader`-Konstruktion gemountet; Plugins registrieren in diese Router. Daher laufen diese GETs durch den Local-Read-Guard.
- Der Config-GET ist die einzige Prefix-Ausnahme. Der Handler in `main.js` prüft selbst direkte Loopback-Adresse plus Forwarding-Header und antwortet andernfalls mit `403 MUSIC_BOT_CONFIG_LOCAL_ONLY`; der POST bleibt außerhalb der GET-Ausnahme und passiert die zentrale AdminAuth. Der Prefix-Guard lässt sonstige Methoden unverändert durch, was für POST/PUT/PATCH/DELETE zur folgenden AdminAuth führt.
- Express 4.18.2 ist die deklarierte Version. Die Guard-Middleware verwendet den Express-Mount-Prefix, bevor Router-/Pfadparameterdekodierung greift. Die Config-Ausnahme vergleicht den unveränderten `originalUrl`-Pfad mit exakt `/api/plugins/music-bot/config` (optional Slash, ohne Query/Fragment); kodierte Pfadsegmente treffen diese Ausnahme nicht. Express’ `HEAD`-Fallback auf GET wird durch den expliziten HEAD-Guard mit abgedeckt.
- Public Overlay bleibt getrennt: `public-overlay-access.js` enthält keinen Music-Bot-HTTP-GET-Prefix. Die vorhandene Socket-Projektion `musicbot:now-playing` via `projectMusicBotTrack()` liefert weiter den freigegebenen Track-DTO einschließlich `requestedBy` und validierter HTTPS-Requester-Avatar-URL. Dies ist die bestätigte Public-Overlay-Freigabe und wurde nicht geändert.
- Kein Quellcode-Ausweichpfad oder Proxy-Header-Bypass aus dem geprüften aktuellen Code ersichtlich. IPv6-Zonen-IDs werden abgelehnt; kaputte/mehrfach komprimierte IPv6-Adressen bestehen `net.isIP()` nicht.

### Prüfung und Grenzen
- Read-only Quellverfolgung für Guard, AdminAuth, Plugin-Route-Mount/Registrierung, alle 17 GET-Routen, Config-Handler und getrennten Public-Overlay-Projektor. Kein Server, Browser, Tunnel, Netzwerk, Profil oder DB gestartet.
- Die vorhandene Contract-Fixture `app/test/music-bot-local-read-policy.test.js` enthält fünf Prüfgruppen (remote GET/HEAD inkl. Token, Loopbackvarianten, Forwarding-Header, Config-/Write-Ausnahmen, Mount/17-GET-/Overlay-Vertrag). In diesem Review wurde sie nicht erneut ausgeführt; der zuvor vom CEO gemeldete 5/5-Lauf ist nicht unabhängige aktuelle Laufzeitevidenz.
- **Status:** Quellenreview ohne gefundenen Bypass; synthetischer Testlauf in diesem Teilauftrag nicht erneut bestätigt; echte HTTP-/Proxy-/Browser-/Tunnel-Laufzeit nicht geprüft.
- Keine Shared-Produktdatei und keine Testdatei geändert. Der Koordinationsbericht wurde nur append-only ergänzt. Bestehende parallele Änderungen blieben unberührt.

### SHA-256 der geprüften aktuellen Dateien
- `app/server.js`: `F56BFB615E00D175E81373C2A9908A2B9333EDCCF3AD8809891749DBF81E2ADB`
- `app/modules/music-bot-local-read-policy.js`: `BC7BB55FE65C622CF004FEECB49A9FC34E60DBCED469FB75CA5D2BF189FF9C4F`
- `app/modules/admin-auth.js`: `D22BB8E5BCA97562EFC914E26587435B0ED59104738FCE7B4539F5CF4377DB9D`
- `app/plugins/music-bot/main.js`: `BE3DB85D1D7EB0E1E912FBCB1BDCCE1BB2671A63A6CF583D04E46BE122A0CB10`
- `app/modules/public-overlay-access.js`: `690609C8B24B9ACCA0EE8B44A77813132671C0D9377A4D7A462D1B5139D83BCD`
- `app/modules/public-overlay-payload-projection.js`: `992F9380C817B55D8309CD0A273C7A7DB004F17F34631271B66214105A458B1C`
- `app/test/music-bot-local-read-policy.test.js`: `86C4DD3BD1AC1BE4B5DF2476EA7ACD27827F88DE50C6362C8236AC32D0D9CE9C`

## 2026-10-08 – Statische Socket-Mutationspolicy im isolierten Kandidaten

### Befund und Quellumfang
- `app/server.js` installiert `attachPublicSocketPolicy()` und danach `io.use(createAdminSocketAuthorization())`, bevor der globale `io.on('connection')`-Dispatch für Core- und Plugin-Handler registriert wird. Quelltextsuche fand keine Socket.IO-Namespaces (`io.of`). Der PluginLoader bindet registrierte Events an bereits verbundene Sockets; neue Plugin-Events umgehen daher die Namespace-Middleware nicht.
- Der zentrale Guard akzeptiert direkte Loopback-Sockets ohne Token als `loopback-admin`, Remote-Sockets nur mit gültigem Admin-Token als `admin`; fehlender/ungültiger Token wird vor Namespace-Connection mit `SOCKET_ADMIN_AUTH_REQUIRED` abgewiesen. Tokenquellen sind Handshake-Auth und explizite Auth-Header/Bearer; Query-Token zählt nicht. Forwarding-Header machen Loopback nicht vertrauenswürdig. Damit werden tokenfreie Remote-Sockets insgesamt verworfen (auch Read-Events), nicht nur einzelne Mutationen.
- Plugininventar umfasst registrierte Schreib-/Kontrollereignisse in u. a. CoinBattle, Music Bot, Game Engine, Quiz Show, Goals, Schnorrbecher, VDO.Ninja, STT-Ticker, TTS, AnimazingPal, API Bridge, WebGPU-Effekten, Top Tier und Viewer-XP. Diese hängen hinter derselben zentralen Auth. Music Bot erzwingt für Dashboard-Mutationen zusätzlich explizit `loopback-admin` oder `admin`; Game Engine prüft je Aktion die Admin-/Overlay-Rolle. Public QuickTunnel wird separat vor der Admin-Middleware markiert und durch Packet-Allowlist, Event-Policy und Projektionsregeln eingeschränkt; dies ist keine tokenfreie LAN-Admin-Verbindung.
- Engine.IO benutzt Polling/WebSocket-Transporte ohne `allowRequest`-Vorfilter. Der Namespace-Guard greift somit erst nach Engine.IO-Handshake/Transportaufbau. Das ist eine Ressourcen-/Handshakegrenze, belegt in diesem Review aber keinen Zugriff auf Core-/Plugin-Events oder deren Daten vor erfolgreicher Namespace-Autorisierung. `bind=select` bleibt die vorhandene Netzwerkregel.

### Prüfung und Änderungen
- **PASS:** In-memory Harness gegen das aktuelle Auth-Modul prüfte sechs synthetische Fälle: Remote ohne Token, ungültiger Token, gültiger Remote-Token, Loopback ohne Token, Query-only-Token und Remote mit gefälschtem Forwarding-Loopback. Zusätzlich bestanden Quellordnungs- und Namespace-Suche. Verwendet wurde ausschließlich der gebündelte Node-Runtime-Prozess; kein Socket-/HTTP-Server, Listener oder Netzwerkstart.
- Keine Produkt- oder Testdatei in E-Kandidat/Shared Tree geändert. Der optionale dauerhafte E-only Test wurde in diesem Lauf nicht angelegt; die bestehende Kandidatenkopie wurde nur als Kontext inventarisiert. Shared Quelldateien waren bereits parallel dirty und blieben unverändert.
- **Nicht geprüft:** echte Engine.IO-Handshake-/Ressourcenlast, Netzwerk, Remote-Client, Tokenkonfiguration, Profile/DB, QuickTunnel-Liveausführung und reale Pluginaktionen. Der Quellinventar ist kein vollständiger Handler-by-handler Autorisierungsreview aller Plugins.

### Status getrennt
- **Geprüft:** zentraler Auth-Pfad, Reihenfolge vor Connection-Dispatch, sechs synthetische Middlewarefälle und vorhandene Eventregistrierungen.
- **Teilweise geprüft:** Plugin-Mutationsinventar anhand direkter `registerSocket()`-Registrierungen und ausgewählter Event-spezifischer Guards.
- **Blockiert:** kein dauerhaftes source-pinned Regressionstest-Artefakt im E-Kandidaten angelegt.
- **Nicht geprüft:** Engine.IO-Vorfilter/DoS-Grenze und alle plugininternen Connection-Listener im vollständigen Handlerdetail.
