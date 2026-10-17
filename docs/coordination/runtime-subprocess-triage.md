# Runtime Subprocess Triage

Stand: 2026-10-06. Aus dem einmaligen Vollbaseline-Log und fokussierten Läufen; keine Vollsuite wiederholt. Keine fremden Audio-/Nutzerprozesse gestartet oder beendet, keine Tools installiert.

## Befund und Einordnung

- `app/test/music-bot-command-parser.test.js`: Die drei Parser-Vertragsfälle (Alias mit Prefix und zwei Vote-Befehle) sowie der Cache-Reload-Fall sind gezielt grün. Der Reload startet `process.execPath` erneut, um den CommonJS-Cache nach erneutem Laden des Plugin-Entrypoints zu prüfen. Normale Sandboxausführung scheiterte mit `spawnSync ... node.exe EPERM`; fokussierte Wiederholung mit genehmigter Sandboxeskalation bestand (1 Test).
- `app/test/music-bot-playback-mpv-integration.test.js`: MPV liegt am im Test fest codierten Chocolatey-Pfad vor, daher wird der echte Integrationstest aktiviert. Er versucht ein lokales Stille-WAV über MPV mit Null-Audioausgabe abzuspielen und scheitert direkt beim `spawn` mit EPERM. MPV-Verhalten, Heartbeat, Seek und Cleanup bleiben ungeprüft. Kein Prozess wurde manuell gestartet oder beendet.
- `app/test/dependency-integrity.test.js`: Baseline-Fehler war die CLI-Ausgabe-Assertion nach fehlgeschlagenem `spawnSync`; `status` war `null`, nicht der erwartete Exitcode. Der Verifikator-/Diagnoseformat-Unit-Test ist separat. Laut Orchestrierungsabnahme wurde die gesamte Suite einschließlich ursprünglichem CLI-Subprocess-Test mit genehmigter Sandboxeskalation vollständig grün ausgeführt (8/8, Exit 0); hier nicht erneut ausgeführt.

## Umsetzung

- Der isolierte Verifikator-/Diagnoseformat-Unit-Test prüft den package-name-only Fehlertext anhand temporärer Fixturedateien, behauptet aber keinen CLI-Exitcode. Der ursprüngliche CLI-Integrationstest bleibt separat erhalten und prüft weiterhin Exitcode 1 sowie stderr; in dieser Sandbox ist dessen `spawnSync`-Start blockiert. Keine installierten Abhängigkeiten verändert.
- Keine Music-Bot-Produktdateien geändert. Keine Dependency-Integrity-Produktdatei geändert.

## Geänderte Dateien

- `app/test/dependency-integrity.test.js`
- `docs/coordination/runtime-subprocess-triage.md` (dieser Bericht)

## Tests

- Bestanden: Dependency-Verifikator-/Diagnoseformat-Unit-Test fokussiert, **1 Test**.
- Bestanden: die drei nicht-subprocessbasierten Music-Bot-Parserfälle, **3 Tests**.
- `git diff --check` für die betroffenen Testdateien ohne Fehler.
- Bestanden mit genehmigter Sandboxeskalation: Parser-Cache-Reload **1 Test** und ChessAutoplay Lite-Single-WASM-Worker-Smoke **1 Test**. Chess-Test bestätigte warmup, Worker-PID, legale UCI-Zugwahl und Workerzerstörung.
- Dependency-Integrity: laut Orchestrierungsabnahme **8/8, Exit 0** einschließlich des ursprünglichen CLI-Exit-/stderr-Integrationstests unter genehmigter Eskalation.
- Blockiert / nicht erneut geprüft: MPV-Integration mit `spawn EPERM` in Sandboxausführung. Sie wurde nicht eskaliert und kein Audio-/Nutzerprozess wurde gestartet.

## Verbleibende Risiken und offene Entscheidungen

- MPV-Laufzeitverhalten braucht eine genehmigte Umgebung mit erlaubten Child-Processstarts; diese Eskalation wurde hier nicht angefragt oder ausgeführt.
- Keine Aussage zur realen Audioausgabe, Prozessüberwachung oder MPV-Cleanup möglich.



