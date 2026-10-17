# Documentation capture isolation status

## Befund

Der ursprüngliche Capture-Runner setzte `LOCALAPPDATA` auf ein temporäres Profil, aber kein `LTTH_LOG_DIR`. `ConfigPathManager` las `.config_path`, migrierte `app/user_configs`, `app/user_data` und `app/uploads`; auf Nicht-Windows-Systemen ignorierte der Standardpfad außerdem `LOCALAPPDATA`. Der Logger archivierte Root- und Legacy-Logs beim Laden.

Die erste Codeanalyse erklärte den historischen frühen Exit-Code 0 nicht. Im Servercode ist Exit 0 an graceful shutdown gebunden (`/api/shutdown`, SIGINT oder SIGTERM); Neustart endet mit Code 75, Listenerfehler mit Code 1. Eine geloggte Promise-Ablehnung während asynchroner Vorinitialisierung bleibt ein möglicher Kandidat, wurde aber nicht reproduziert.

## Umsetzung

- Der Runner setzt `LTTH_LOG_DIR` auf `<capture profile>/logs`.
- `ConfigPathManager` behandelt `LTTH_DOCS_CAPTURE=true` isoliert: `LOCALAPPDATA` muss innerhalb `os.tmpdir()` liegen, `.config_path` wird nicht gelesen, der Profilpfad gilt plattformübergreifend, und App-Verzeichnisse werden nicht migriert.
- `archiveStartupLogs` verlangt ein Logverzeichnis im Temp-Profil und archiviert im Capture-Modus weder Profil- noch Legacy-Logs.
- Vor Port- und Profilanlage validiert der Runner die gebündelte Runtime (`runtime/node/node.exe` auf Windows, `runtime/node/node` auf Unix) auf Node 22 und ABI 127. Es gibt keinen stillen globalen Node-Fallback.
- Frühe Prozessenden melden Exitcode, Signal sowie begrenzte stdout/stderr-Tails. Der Collector redigiert jede vollständige Zeile vor dem Puffern, behält nur vollständige Zeilen und ignoriert während des Laufs unvollständige Fragmente; Credential-Werte, persönliche Home-Pfadsegmente und Zeilen mit Userdatenpfaden werden redigiert.
- Der Overlay-Owner bestätigte den Env-/Fixture-Vertrag: fail closed, keine Custom-Pfade oder Legacy-Migration, Profil-Logs und isolierte Tests ohne Serverstart.

## Geänderte Dateien

- `app/modules/config-path-manager.js`
- `app/modules/log-paths.js`
- `scripts/capture-product-screenshots.js`
- `scripts/lib/capture-startup-diagnostics.js`
- `app/test/docs-capture-isolation.test.js`
- `app/test/capture-startup-diagnostics.test.js`
- `docs/coordination/capture-isolation.md`

`app/modules/config-path-manager.js` enthält zusätzlich parallele Änderungen zur Profil-Plugin-Datenablage. Diese wurden erhalten.

## Tests

- Gebündelte Workspace-Runtime direkt geprüft: Node v22.14.0, native ABI 127.
- Gezielte Jest-Regressionen mit gebündelter Node: 3 Suites, 16 Tests bestanden, einschließlich eines Secret-Werts, dessen Credential-Key und Wert über Chunkgrenze und Pufferbegrenzung verteilt eintreffen sowie eines Quellvertrags, der Runtime-Prüfung vor Portanlage und Spawn sichert.
- Die ChildProcess-Event-Fixtures decken Exit 0, unhandled-rejection-Ausgabe, Signal, Tail-Limit, Redaktion und Runtimewahl ohne LTTH-Server ab. Ein Versuch, echte Node-Unterprozesse aus Jest zu starten, wurde mit `spawn EPERM` blockiert.
- Ein separat erlaubter, eng begrenzter Temp-Probe mit echten synthetischen Node-Kindprozessen und dem Workspace-Bundle prüfte danach expliziten Exit 0, geloggte unhandled rejection mit Exit 0 und vom Elternprozess ausgelöstes SIGTERM. Alle drei Diagnosen enthielten den tatsächlichen Close-Code bzw. das Signal und den erwarteten Ausgabetail; kein LTTH-Server wurde gestartet.
- `node --check` mit gebündelter Node für ConfigPathManager, Logpfade, Screenshot-Runner, Diagnosemodul und Tests bestanden.
- Das Dokument ist gültiges UTF-8; striktes Dekodieren ergab keine Replacement-Zeichen. Das zuvor gemeldete Anzeigeproblem lag nicht im gespeicherten Inhalt.
- Temp-Fixture-`afterEach` überspringt Cleanup, wenn `beforeEach` kein Verzeichnis angelegt hat.

## Verbleibende Risiken und offene Entscheidungen

- Der Screenshot-Runner erkennt frühe Exits und liefert jetzt Diagnoseausgabe. Die konkrete Ursache des historischen Exit-Code-0 bleibt ungeklärt.
- Runtime-Auswahl, ABI-Prüfung, Exit-Details und Redaktionsregeln wurden durch isolierte Fixturetests geprüft. Der vollständige Runnerprozess und App-Start bleiben ungeprüft.
- Kein LTTH-Server und kein Screenshot-Capture wurde gestartet. Health-Endpoint, Screenshot-Erzeugung und Verhalten in realer Installationsumgebung sind nicht verifiziert.
- Andere manuelle Capture-Aufrufer mit `LTTH_DOCS_CAPTURE=true` müssen `LOCALAPPDATA` unter `os.tmpdir()` und `LTTH_LOG_DIR` innerhalb des Profils setzen.

## Status

- **Behoben und geprüft:** Config-Migration und Logarchivierung im Capture-Modus; plattformübergreifender Temp-Profilpfad; gebündelte Node-Auswahl und ABI-Prüfung; begrenzte, redigierte Startupdiagnose; isolierte Regressionen.
- **Teilweise geprüft:** Prozessbeendigung wurde mit ChildProcess-Event-Fixtures und echten synthetischen Prozessen geprüft; der LTTH-Serverstart bleibt ungeprüft.
- **Blockiert:** nichts an den lokalen Guards. End-to-end-Startup bleibt bis zu einer separaten Startup-Abnahme offen.
- **Nicht geprüft:** LTTH-Serverstart, Health-Endpoint, Screenshot-Erzeugung, historischer Exit-Code-0-Auslöser und reale Installationsumgebung.
