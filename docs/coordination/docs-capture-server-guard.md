# Docs-Capture Server-Guard Status

Stand: 2026-10-06

## Befund

Die Capture-Runner bauen nun eine begrenzte Child-Umgebung und Fixture-Pluginliste. Vor der Ergänzung serverseitiger Guards hätte `app/server.js` dennoch dotenv und Clerk-Beispielwerte geladen, beim Health-Capture Plugins ohne strikte Allowlist starten können und nach dem Listener OBS-, TikTok-, Cloud-Sync-, IFTTT- oder Tunnelpfade sowie Root-Artefakte initialisiert. Die Fehlkonfiguration/Injection lässt sich mit isolierten Env- und Fixturetests reproduzieren; keine `.env`-Dateiinhalte wurden gelesen.

## Umsetzung

- Neue `docs-capture-policy` validiert noch vor dotenv die erlaubten Env-Schlüssel, Pflichtflags, Loopback-Bindung, temporäre Profil-/Log-/Temp-Pfade, Port und Plugin-Allowlist.
- Parser akzeptiert leere Liste als keine Plugins; IDs müssen kanonisch, eindeutig und dem restriktiven Format entsprechen.
- Fixture muss unter dem isolierten Profil liegen. Jedes manifeste Plugin wird gegen Allowlist und Verzeichnisname geprüft; Extra-/Alias-/Großschreibungs-IDs schlagen fehl.
- Docs-Capture überspringt dotenv und Clerk-Fallback. Leere Liste lädt keine Plugins; erlaubte IDs gelangen als Set an den PluginLoader.
- Connectorinitialisierungen und externe/Root-Seiteneffekte (IFTTT, OBS, TikTok-Reconnect/Katalog, Cloud Sync, Tunnel, stabile externe Overlay-Routen, Portdatei und OBS-Wrapper) sind im Capturemodus gesperrt.
- Gemeinsame Schnittstelle: `PluginLoader.loadAllPlugins({ allowedPluginIds: Set })`. Bestehende Aufrufer ohne Option behalten bisherigen Vertrag. Profiländerungen im selben PluginLoader-Diff stammen aus paralleler Arbeit und wurden nicht geändert.
- Capturefähigkeit wird serverseitig nur aus dem zuvor validierten `docsCaptureMode` als `PluginLoader`-Runtimeoption weitergegeben. `PluginAPI.isDocsCapture` ist ein unveränderliches boolesches Property; ohne Runtimeoption bleibt es `false`. Plugin-Code liest dafür keine unvalidierte Umgebungsvariable.
- Für den geplanten Sidekick-Guidecapture prüft Sidekick die Capability in-memory, zeigt nur lesende Statusendpunkte und sperrt Avatartransport zusätzlich an VNyan-/Animaze-Connect-, Reconnect- und Sendepfaden. Die injizierte Konfiguration wird dabei nicht persistiert. Die Implementierung liegt beim Overlay-Owner; Details und deren Regressionen sind separat abgestimmt.

## Geänderte Dateien in diesem Auftrag

- `app/modules/docs-capture-policy.js` (neu)
- `app/server.js`
- `app/modules/plugin-loader.js` (nur Allowlist-Option; Datei enthält parallele Profiländerungen)
- `app/test/docs-capture-policy.test.js` (neu)
- `app/test/docs-capture-plugin-api.test.js` (neu; immutable Capability + Normalmodus)
- `app/test/plugin-loader-id-alias-migration.test.js` (Allowlist-Regression; Datei enthält parallele Änderungen)

Runner-/Child-Env-/Fixturedateien wurden parallel vom Overlay-Capture-Owner geändert und sind in dessen `docs/coordination/capture-startup.md` dokumentiert.

## Tests

- `runtime/node/node.exe --check` für `server.js`, `docs-capture-policy.js` und Policytest: bestanden.
- Windows-Env-Roundtrip: ein synthetischer Node-Child mit dem exakten Builder-Env zeigte acht zusätzliche Windows-Schlüsselnamen (`HOMEDRIVE`, `HOMEPATH`, `LOGONSERVER`, `PATH`, `SYSTEMDRIVE`, `USERDOMAIN`, `USERNAME`, `USERPROFILE`). Das ist am synthetischen Node-Child beobachtet; dasselbe Verhalten beim echten Server-Child ist eine Inferenz aus dem identischen direkten `spawn(..., { env })`-Muster der Runner, kein Server-Child-Beleg.
- Enger Umgang mit diesen OS-Schlüsseln: der Builder setzt sie im Windows-Child explizit leer; die Serverpolicy akzeptiert genau diese acht Namen nur mit leerem Wert. Der Roundtrip-Test prüft nur Namen bzw. Namen nichtleerer Werte, nie deren Inhalte, und lehnt case-insensitive Duplikate ab. `SystemRoot`/`WINDIR` bleiben die einzigen absichtlich übernommenen Windows-Systempfadwerte.
- Gebündelter Jest-Lauf nach Env-Roundtrip-Ergänzung: 7 Suites / 45 Tests bestanden (`docs-capture-policy`, PluginLoader-Allowlist, docs-capture-child-env, docs-capture-plugin-fixture, docs-capture-isolation, log-paths, capture-startup-diagnostics).
- PluginAPI-Capability- und SidekickCaptureGuard-Integration: 11 Suites / 66 Tests mit `--detectOpenHandles` bestanden. Enthalten sind Loader true/normal false, Env-/Fixture-/Seedtests, Guide-GET-ohne-Schreiben, injizierte Sidekick-Konfiguration und geblockte WS-Connect-/Reconnect-/Sendepfade.
- Isolierte Reproduktion: Credentials/injected env und doppelte/malformed IDs werden vor Startup abgelehnt; nur exakt passendes Fixture wird akzeptiert; PluginLoader konstruiert nur allowlistete Testplugins.
- Der Overlay-Owner führte nach separater Freigabe genau einen leeren-Allowlist-Healthstart aus: HTTP 200 auf Loopback; Kindprozess nach SIGTERM beendet, PID/Port/Profile bereinigt. Dieser Beleg umfasst weder Plugin-Lifecycle noch Sidekick-Guidecapture. Keine Screenshots, kein Profilwechsel oder Liveprozess.
- `git diff --check` ohne Whitespacefehler; Git meldet nur bestehende LF/CRLF-Hinweise.

## Verbleibende Risiken

- Numerischer Prozess-Exitcode des erfolgreichen Healthstarts wurde nicht beobachtet (Beendigung per SIGTERM). Der Healthlauf hatte eine leere Plugin-Allowlist; Sidekick-Plugin-Lifecycle, UI-Rendern und Guidecapture bleiben ungeprüft.
- Der frühere Server-Child hat die Policy vor dem Start mit einer generischen Fehlermeldung beendet; seine Variablennamen wurden dabei nicht geloggt. Die acht zusätzlichen Namen wurden daher nicht im App-Child beobachtet, sondern nur in einem synthetischen Node-Child mit identischem Builder-Env.
- Initiale Konstruktoren für lokale Adapter/Manager bleiben teilweise vorhanden; die geprüften externen Verbindungen und Auto-Starts sind gesperrt. Der leere-Allowlist-Healthstart beobachtet keine Sidekick-Initialisierung.
- Symlink-/TOCTOU-Angriffe im temporären Fixture werden nicht durch ein Dateisystem-Snapshot abgesichert; Captureprofile werden vom Runner neu erzeugt und Fixture-Builder kopiert lokale Plugins explizit.

## Abstimmung

- Overlay-Capture-Owner hat Env-/Fixturevertrag und Serverguards reviewt; Rohmanifest-ID gegen kanonischen Ordner/Allowlist wurde auf dessen Hinweis ergänzt.
- Orchestrierungschat über `PluginLoader.loadAllPlugins({ allowedPluginIds })` als gemeinsame API informiert; dessen Abnahme bleibt separat.
- `Bugstofix.md` wurde nicht bearbeitet.
