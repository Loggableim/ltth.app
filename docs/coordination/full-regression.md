# Vollständige Jest-Baseline

Stand: 2026-10-06. Genau ein vollständiger Lauf mit App-Konfiguration und gebündeltem Node 22.14.0:

    cd app
    ..\runtime\node\node.exe node_modules\jest\bin\jest.js --config jest.config.js --runInBand --silent

Vollständiges stdout/stderr liegt außerhalb des Repositories unter %TEMP%\ltth-full-jest-baseline-20261006.log.

## Ergebnis

- 807 Suites gesammelt: 754 bestanden, 52 fehlgeschlagen, 1 übersprungen.
- 9.050 Tests: 8.870 bestanden, 179 fehlgeschlagen, 1 übersprungen.
- Jest-Laufzeit 1125,475 Sekunden. Drei Stream-Monsters-Balance-/Simulatorsuites dauerten 121–158 Sekunden.
- Alle Suites liefen. Danach meldete Jest offene asynchrone Ressourcen und blieb ohne forceExit offen. Nach der Suite-Zusammenfassung wurde ausschließlich der hier gestartete gebündelte Jest-Prozess beendet. Kein anderer Node-/App-Prozess wurde beendet.

## Fehlergruppen und Einordnung

Exakte fehlgeschlagene Suites aus dem Log (52): plugin-store-registry; viewer-xp-event-processing; music-bot-command-parser; animazingpal-live-host-integration; release-bundle-script; docs-capture-real-workflows; guide-definition-validation; plugin-guide-definition; stream-session-isolation; scoped-user-profiles; docs-capture-viewport; gcce-plugin-cooldown-contract; tiktok-studio-overlay-inventory; game-engine/chess-autoplay-service; webgpu-fireworks-3d-release; plugin-lifecycle-routes; plugin-workflow-contract; webgpu-fireworks-release-alignment; dependency-integrity; profile-switching-integration; profile-switch-socket-event; plugin-security; music-bot-playback-mpv-integration; pages-release-bundle; translation-contract; config-import-translation-contract; plugin-docs-live-verifier; plugin-guide-definition-rendering; plugin-guide-ownership; plugin-docs-gallery; obs-docs-capture-batch; advanced-timer-ui-i18n; obs-docs-capture-contract; plugin-guide-capture-contract; published-plugin-catalog; plugin-guide-locale-bundles; plugin-static-form-controls-i18n; plugin-guide-modules; plugin-i18n-small-plugin-regression; emoji-rain-guide-url; chatango-capture-workflow; plugin-docs-e2e; plugin-tutorial-source-workflow; streammonsters-assets-v15; streammonsters-release-v18; interaction-capture-guide-evidence; streammonsters-release-v19; streammonsters-release-v110; streammonsters-release-v111; streammonsters-product-contract; streammonsters-release-v112; sidekick/vnyan-integration.

### Backend-Fachbereich

- test/viewer-xp-event-processing.test.js erwartete bei likeCount 5 weiterhin total_likes === 1. Das widerspricht dem bestätigten LIVE-033-Vertrag für gebündelte Likes. Die Assertion wurde gezielt auf 5 aktualisiert; der gezielte Lauf bestand danach.
- test/gcce-plugin-cooldown-contract.test.js erwartet Plugin-ID streamalchemy, die Registry projiziert den Alias kanonisch als stream-monsters. Bekannter Alias-/Testbestandkonflikt, kein neuer Durchsetzungsfehler.
- plugins/game-engine/test/chess-autoplay-service.test.js: lokales Stockfish-WASM-Warmup gibt false statt true. Getrennter Autoplay-/WASM-Pfad, nicht LIVE-040; im Volltest nicht geändert.

### Subprozess- und Laufzeitumgebung

- EPERM bei spawnSync/spawn in music-bot-command-parser, plugin-lifecycle-routes, music-bot-playback-mpv-integration und Stream-Monsters-Git-/Releasepakettests sowie Assetinspektion. Das sind in dieser Umgebung gesperrte Kindprozesse; die betroffenen externen Integrationen wurden dadurch nicht verifiziert.
- Release-Bundle- und Pages-Bundle-Tests melden fehlendes Python 3.
- stream-session-isolation, scoped-user-profiles, profile-switching-integration und profile-switch-socket-event scheitern bei SQLite-/Verzeichnis-Cleanup unter C:\tmp mit EPERM. Die Testpfade liegen außerhalb des beschreibbaren Workspace.
- dependency-integrity.test.js erwartet Kindprozess-Exitcode 1, erhält aber null; passt zur eingeschränkten Subprozessausführung.

### Sidekick-/Clarity-/Dokumentations- und Store-Stand

- Rund zwei Dutzend Guide-/Capture-/Tutorial-Suites scheitern am Inventarfehler „Missing: sidekick“. Sidekick ist im aktuellen Pluginbestand, eine Tutorialdefinition fehlt. Betroffen sind unter anderem plugin-guide-definition, docs-capture-viewport, plugin-workflow-contract, plugin-docs-live-verifier, plugin-guide-modules, plugin-docs-e2e und interaction-capture-guide-evidence.
- animazingpal-live-host-integration erwartet, dass app/plugins/sidekick nicht existiert. Das Verzeichnis ist vorhanden und enthält aktives Sidekick; dieser Integrationsvertrag muss mit der Sidekick-Produktentscheidung abgeglichen werden.
- plugins/sidekick/test/vnyan-integration.test.js: Testdouble hat kein io.to(); die Route antwortet mit success false und „this.io.to is not a function“. Gezielter Lauf bestätigte das. Kein Sidekick-Produktcode von mir verändert.
- ClarityHUD gezielte Backend- und Renderer-Suites bestanden; Details unten. Kein neuer ClarityHUD-Produktfehler aus der Vollbaseline bestätigt.
- Store-/Releasefehler betreffen alte Stream-Monsters-Channel-/Katalog-/Paketannahmen, erwartete Appversion 1.4.1 gegenüber aktuellem 1.4.3, Releasequellen und generierte Inventare. Kein pauschales Snapshotupdate vorgenommen.
- tiktok-studio-overlay-inventory erwartet eine ältere streamalchemy/streammonsters-ui.html, die im aktuellen Layout fehlt.
- plugin-security.test.js meldet reloadPlugin false; berührt geänderte PluginLoader-/Profilpfade und sollte vom Profil-/Plugin-Lifecycle-Fachagenten separat bewertet werden.
- Einzelne Übersetzungsprüfungen melden fehlende UI-Schlüssel: translation-contract, config-import-translation-contract, advanced-timer-ui-i18n, plugin-static-form-controls-i18n und plugin-i18n-small-plugin-regression. Nicht als Baseline abgetan; zuständige Fachleute sollten die aktiven UI-Diffs zuordnen.

## Gezielte Wiederholungsprüfung

Einmaliger fokussierter Lauf nach der Baseline für Viewer-XP, ClarityHUD und aktive Sidekick-Suiten:

- Bestanden: test/viewer-xp-event-processing.test.js nach Korrektur der veralteten Einzellik-Erwartung.
- Bestanden: ClarityHUD backend-behavior und renderer-regressions.
- Bestanden: sidekick-ui-i18n und Sidekick public-status-projection.
- Fehlgeschlagen: Sidekick vnyan-integration, weil dem Testdouble io.to fehlt. Fremder Fachbereich; kein Produktcode verändert.
- Ergebnis: 5 Suites / 50 Tests bestanden, 1 Suite / 1 Test fehlgeschlagen.

## Folgeprüfung GCCE-Alias, Chess-WASM und offene Handles

- Der Aliasvertrag bestätigt `streamalchemy` als Alias von `stream-monsters` in `app/modules/plugin-identities.js`. GCCE kanonisiert bei Registrierung, Parserresultat und Deregistrierung. Die beiden veralteten Resultaterwartungen im gezielten Vertragstest wurden auf `pluginId: stream-monsters` gesetzt. `gcce-plugin-cooldown-contract.test.js` besteht danach.
- ChessAutoplay: `app/node_modules/stockfish/bin/stockfish-18-lite-single.js` ist vorhanden, doch ein kleiner direkter Node-22-Aufruf desselben Child-Process-Spawnpfads endet sofort mit `spawn EPERM`. Das erklärt, warum der Test, der wegen vorhandenem Paket den echten Worker-Smoke aktiviert, beim Warmup `false` erhält. Im gezielten Lauf bestanden die übrigen Autoplay-Service-Assertions; der lokale WASM-Subprozess kann in dieser Sandbox nicht validiert werden. Kein Autoplay-Produktcode geändert.
- `--detectOpenHandles`-Lauf gezielt auf GCCE Alias, Viewer-XP, Rechte-/Eventregression, CoinBattle und ChessGame/Autoplay: 6 Suites / 61 Tests bestanden, 1 Chess-WASM-Smoke fehlerhaft, 62 Tests insgesamt. Jest gab keine Open-Handle-Erkennung für diese ausgewählten Suites aus und beendete sich zügig nach dem erwarteten Testfehler. Damit sind die Handles des vollständigen 807-Suite-Laufs nicht lokalisiert; sie stammen nicht aus den hier ausgewählten Bereichen.
- Chess-Game LIVE-040-, GCCE-Rollen-/Ereignis-, CoinBattle-, Viewer-XP- und Aliasregressionen sind in diesem Lauf grün. Keine erneute Vollsuite.

## AnimazingPal Handle-Ursache und Fixture-Cleanup

- Wiederholt wurde nur `test/animazingpal-live-host-integration.test.js` (94 Tests) ausgeführt. Die ursprüngliche Suite bestand vollständig, meldete danach aber offene Ressourcen.
- `--detectOpenHandles` allein gab keine lesbaren Stacks aus. Ein temporärer, außerhalb des Repositories gespeicherter Timer-Stack-Observer ordnete nach `afterAll` 78 aktive Timer zu: 65 `EventDeduper`-Intervalle aus Pluginfixtures und 13 normale Speech-Playback-Timeouts aus synthetisch erfolgreichen TTS-Antworten. Die 65 Intervalle rufen `unref()` auf und halten den Prozess nicht offen. Die 13 `setTimeout`s aus `_scheduleLiveHostSpeechPlaybackTimeout` blieben dagegen referenziert, weil die Fixtures keine Wiedergabeende-Events senden.
- Die Testdatei trackt jetzt ihre `createPlugin()`-Instanzen und löscht im `afterEach` ausschließlich deren synthetische Playback-Timer und Fixture-Playbackeinträge. Keine Produktlogik und keine AnimazingPal-/Sidekick-Vertragsassertion wurde geändert. Der Overlayowner wurde vor der Änderung informiert und stimmte dem minimalen Fixture-Cleanup ausdrücklich zu.
- Verifikation: gebündelter Node 22.14.0, `--runInBand --detectOpenHandles`, AnimazingPal-Integration: **1 Suite / 94 Tests bestanden, Exit 0**. Der Jest-Prozess terminierte regulär ohne Open-Handle-Warnung.
- Temporärer Detailbericht: `%TEMP%\animazing-jest-timer-observer.json`; Hilfsskript `%TEMP%\animazing-jest-timer-observer.cjs`. Beide wurden nur für diese gezielte Diagnose erstellt, nicht eingecheckt.

## Nächste Triage

1. Sidekick-Fachverantwortlicher: GuideDefinition/Sidekick-Inventar, erwartete Entfernung aus AnimazingPal und io.to-Routefixture in einem konsistenten Vertrag klären.
2. Plugin-/Profil-Lifecycle-Fachverantwortlicher: plugin-security und die vier C:\tmp-Tests gegen beschreibbare Testpfade und den aktuellen Lifecycle-Vertrag prüfen.
3. Store-/Release-Fachverantwortlicher: Releaseversion 1.4.3, Stream-Monsters-Archive und Metadaten abgleichen; Subprozess-/Python-/Assettools in geeigneter Laufzeit separat bereitstellen.
4. UI-/Übersetzungsfachverantwortliche: genannte Übersetzungsfehler den bearbeiteten lokalen Änderungen zuordnen.

Keine zweite vollständige Jest-Suite ausgeführt. Keine Live-App, Credentials, Profileinstellungen, Zuschauerrollen, Guthaben, fremde Prozesse oder echte TikTok-Aktionen verändert.
