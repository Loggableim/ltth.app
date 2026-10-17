# Dokumentations-Capture: isolierter Health-Startup

Stand: 2026-10-06

## Entscheidung

Der zuletzt genehmigte Auftrag erlaubte genau einen isolierten Health-Startupversuch, verlangte aber vorher einen fail-closed Nachweis gegen Profilmigration, Rootlogs und Connectorstarts. Die Quellprüfung hat diesen Nachweis nicht erbracht; daher wurde **kein Prozess gestartet**. Es gab in dieser Folgerunde keinen Health-Response und keinen neuen Exitcode.

## Quellprüfung

- `ConfigPathManager` ignoriert im Modus `LTTH_DOCS_CAPTURE=true` die Datei `.config_path` und `migrateFromAppDirectory()` kehrt vor Zugriff auf `app/user_configs`, `app/user_data` und `app/uploads` zurück.
- `log-paths` erfordert für Capture `LOCALAPPDATA` unter `os.tmpdir()` sowie `LTTH_LOG_DIR` innerhalb dieses Profils. Der Capturemodus überspringt das Archivieren der Root- und Legacy-Logs.
- Der Runner setzt `LTTH_DOCS_SAFE_MODE=true`; `app/server.js` deaktiviert Pluginladen jedoch ausschließlich bei `LTTH_SAFE_MODE=true` oder `DISABLE_PLUGINS=true`. Das aktuelle Docsfixture kopiert und aktiviert fast alle lokalen Pluginmanifeste. Damit ist ausgeschlossenes Plugin-/Connectorladen nicht belegt.
- Die App lädt früh `.env`; `app/.env` ist vorhanden. Der Runner übernimmt bislang die Umgebung des Aufrufers. Eine sichere Env-Allowlist und der Ausschluss echter Providerzugänge sind nicht quellseitig bewiesen.
- Die Ursache der früheren Kindprozess-Exitcodes `0` vor `/api/health` wurde nicht festgestellt. Dieser frühere Captureversuch benutzte globales Node; das nun vorgesehene `runtime/node/node.exe` wurde nicht für einen Serverstart verwendet.

## Metadaten-Fingerprints vor einem möglichen Start

Es wurden ausschließlich Datei-/Verzeichnismetadaten gelesen (relative Pfade, Größen, Änderungszeiten und Attribute); keine Inhalte, Konfigurationswerte oder Zugangsdaten. SHA-256 über die sortierten Metadatensätze:

| Pfad | Bestand | Metadaten-SHA-256 |
|---|---:|---|
| `logs` | 1.538 Dateien, 1.241.551.687 Bytes | `D9B5B8B8EDDD3DD7BDA5ECDBABA4CD928E231565C51DAE155A1D219EC69656C6` |
| `app/user_configs` | 2 Dateien, 205 Bytes | `B12C3C0918FBC4FA1813DCB6DEC213062F6153269EA58741DF8598E608FB28D3` |
| `app/.env` | 1 Datei, 3.556 Bytes | `3FC5242E78C387971994D41BD86ADD2011C7216B04B64B6B93766D6EC278F3EC` |

`app/.config_path`, `app/user_data` und `app/uploads` fehlten bei der Prüfung. Der gebündelte Runtimepfad `runtime/node/node.exe` ist vorhanden. Fingerprints sind Baseline-Metadaten, keine Aussage über Datei-Inhalte oder deren Vertrauenswürdigkeit.

## Frühere Startbelege (separater, fehlgeschlagener Capturelauf)

Der frühere Lauf startete acht Serverprozesse aus dem Screenshotrunner. Alle endeten mit beobachtetem Exitcode `0`, bevor `/api/health` bereit war; 32 angeforderte Assets ergaben null Screenshots. Die Startlogs belegten damals eine Migration von `app/user_configs` in ein temporäres Profil und Nutzung/Archivierung von Rootlogs. Das zuvor bestehende Capturemanifest wurde bytegleich zurückgesetzt und geprüft. Diese Runde hat keine Logs restauriert, verschoben oder gelöscht.

## Abnahmestatus

- **Geprüft:** Quellpfade der Config-/Logguards; frühere Metadaten-Fingerprints; Child-Env-Builder und explizites Pluginfixture in beiden lokalen Capture-Runnern (`capture-product-screenshots.js`, `capture-streammonsters-v111.js`). Das Child-Env übernimmt keine beliebigen Caller-Variablen. Guide-Capture erlaubt aktuell nur die einzelne Guide-ID; leer/fehlend ergibt eine leere Pluginquelle. Fixtureverzeichnisse und aktivierte Manifeste werden vor dem Spawn exakt gegen die Allowlist validiert. Die Produkt-Screenshotcollection gibt derzeit ebenfalls eine leere Plugin-Allowlist weiter; für spätere Screenshots mit Plugin-Backendbedarf ist erst eine explizite assetbezogene Liste zu ergänzen. Der zweite Runner verlangt ein vorhandenes lokales `@playwright/cli`; es gibt keinen `npx`-/Installationsfallback und das Paket ist derzeit nicht vorhanden.
- **Serverguard unabhängig gemeldet und gegen Runnervertrag geprüft:** Profilowner meldet Policy-/PluginLoader-/Runner-/Fixture-/Loggingtests mit 7 Suites / 44 Tests bestanden. Mein lesendes Review bestätigt, dass der Child-Env-Builder die Server-Allowlist erfüllt, leere Pluginliste fail-closed bleibt, und die einzelne Guide-ID mit exakt passendem Fixture übereinstimmt. Keine Serverhunks von mir bearbeitet.
- **Nicht gestartet:** Trotz bestandenem Quell-/Unitvertrag erfolgte kein Health-Startup, da die nachfolgende Koordinationsanweisung weitere Appstarts ausdrücklich ausschließt. Es gibt deshalb keinen neuen Health-Response oder Runtime-Exitbeleg.
- **Geprüfte Tests ohne Serverstart:** 7 Suites / 108 Tests bestanden: `docs-capture-plugin-fixture.test.js`, `docs-capture-child-env.test.js`, `docs-capture-isolation.test.js`, `capture-startup-diagnostics.test.js`, `capture-streammonsters-v111-runner.test.js`, `streammonsters-brand-assets.test.js`, `docs-capture-real-workflows.test.js`. Zusätzlich `node --check` auf beiden Runnern und beiden neuen Hilfsmodulen bestanden. Verwendet wurde `runtime/node/node.exe` v22.14.0 / ABI 127.
- **Nicht ausgeführt:** Screenshotlauf, weitere Serverstarts, OBS, Live-/öffentliche Abnahme.

Der separate Playwright-CLI-Capture bleibt ohne lokal installiertes `@playwright/cli` preflight-blockiert. Für spätere Produktcaptures mit Backendbedarf müssen die IDs pro ausgewähltem Asset explizit allowlistet werden. Neue Starts oder Captureläufe sind nicht ausgeführt.

## Erneuter Health-Startversuch nach begrenzter Freigabe

Am 2026-10-06 wurde nach erneuter Koordinationsfreigabe genau ein isolierter Health-Start versucht; Screenshotlauf und Guideplugin blieben ausgeschlossen. Der Fail-closed-Preflight verwendete das gebündelte Node v22.14.0 / ABI 127, eine leere Plugin-Allowlist, ein neues temporäres Profil, ein nur auf `127.0.0.1` gebundenes Port und den minimierten Child-Env-Builder. Fixture-, Env- und Serverpolicy-Quellen wurden vorher erneut geprüft. Der Start des Node-Harness selbst scheiterte unmittelbar mit `spawn EPERM`, bevor ein App-Kindprozess entstand. Daher gab es keinen `/api/health`-Request, keine App-Diagnose und keinen App-Exitcode. Das nur für diesen Versuch angelegte temporäre Profil wurde entfernt. Es erfolgte kein Retry.

Unmittelbar nach dem fehlgeschlagenen Spawn wurden Dateimetadaten der Logs sowie relevanter Konfigurationspfade zweimal aufgenommen und verglichen. Es wurden nur relative Pfadmetadaten, Größen, Änderungszeiten und Attribute gehasht; keine Dateiinhalte oder Zugangsdaten gelesen. Alle Werte blieben zwischen den beiden Messungen gleich: `logs` 2.021 Einträge / 1.241.553.687 Bytes, SHA-256 `75A0DD7117235D6B45AF5DF269A1D764E07B05D9F672DDCDB6F81C8C2B08E037`; `app/user_configs` 3 Einträge / 205 Bytes, SHA-256 `B7F512FFA66F9CDC5B239A7577EC4D4F7D14D1981249A910A19C922F4301D747`; `app/.env` 2 Einträge / 7.112 Bytes, SHA-256 `2237AB7870841569EA5C1F979BD4AD95002FE8477D7E29A74945CB74ADC8E991`. `app/user_data`, `app/uploads` und `app/.config_path` fehlten bei beiden Messungen.

**Ergebnis:** Health-Startup bleibt **blockiert** durch Betriebssystemfehler `spawn EPERM`; kein Prozess lief lang genug, um App-seitige Nebeneffekte oder Laufzeitgesundheit zu prüfen. Der Metadatenvergleich belegt nur, dass die genannten Pfade während dieses kurzen Versuchs unverändert blieben. Keine weiteren Startversuche wurden ausgeführt.

## Einmaliger freigegebener Retry

Nach dem `spawn EPERM` wurde genau ein erneuter Versuch mit explizit escalierter Ausführung des kontrollierten Node-Harnesses genehmigt. Preflight und Metadatenvergleich wurden wiederholt; derselbe gebündelte Node v22.14.0 / ABI 127 und dieselbe leere Plugin-Allowlist wurden verwendet. Der eigene Harnessprozess startete und legte einen Server-Kindprozess mit PID `4064` an, Loopbackport `56535`. Die Serverpolicy beendete ihn vor Serverinitialisierung mit Exitcode `1`: `Documentation capture environment contains unapproved variables`. `/api/health` wurde nicht erfolgreich erreicht. Der eigene Kindprozess war danach beendet; das temporäre Profil wurde entfernt. Es gab keinen Timeout und keinen weiteren Versuch.

Der doppelte Vorher-/Nachher-Metadatenvergleich blieb für alle betrachteten Pfade unverändert: `logs` SHA-256 `75A0DD7117235D6B45AF5DF269A1D764E07B05D9F672DDCDB6F81C8C2B08E037`; `app/user_configs` `B7F512FFA66F9CDC5B239A7577EC4D4F7D14D1981249A910A19C922F4301D747`; `app/.env` `2237AB7870841569EA5C1F979BD4AD95002FE8477D7E29A74945CB74ADC8E991`; `app/user_data`, `app/uploads` und `app/.config_path` weiterhin nicht vorhanden. Es wurden keine Variablenwerte oder Datei-Inhalte ausgegeben bzw. gelesen.

**Ergebnis:** isolierter Health-Start bleibt **blockiert** durch den fail-closed Environment-Guard. Der Guard wurde nicht gelockert und es erfolgte kein weiterer Retry. App-Laufzeitgesundheit ist weiterhin nicht geprüft.

## Health-Startup nach Env-Roundtrip-Korrektur

Nach dem synthetischen Windows-Env-Roundtrip (7 Suites / 45 Tests, Profilowner) wurde genau ein Health-Startup erneut freigegeben. Der aktualisierte Builder übergab die acht beobachteten Windows-Prozessvariablennamen als leere Strings; die Policy akzeptierte sie nur leer. Vor dem Spawn validierte derselbe Harness die komplette Umgebung mit der Serverpolicy und bestätigte eine leere Plugin-Allowlist. Es wurden keine Credentials oder `.env`-Werte gelesen oder weitergereicht. Gebündeltes Node: v22.14.0 / ABI 127.

Der isolierte Server antwortete mit HTTP 200 auf `127.0.0.1:61063/api/health`. Eigener Server-Kindprozess: PID `32884`; Timeout: nein (60-Sekunden-Limit). Danach wurde genau dieser Prozess mit SIGTERM beendet; `Get-Process` bestätigte, dass PID `32884` nicht mehr lief. Der Port hatte keinen Listener mehr. Das temporäre Profil wurde entfernt. Exitstatus: beendet durch SIGTERM (kein numerischer Exitcode beobachtet). Keine Screenshots und kein Guideplugin wurden gestartet.

Metadaten wurden unmittelbar davor und danach verglichen. Alle Pfade blieben unverändert: `logs` SHA-256 `75A0DD7117235D6B45AF5DF269A1D764E07B05D9F672DDCDB6F81C8C2B08E037`; `app/user_configs` `B7F512FFA66F9CDC5B239A7577EC4D4F7D14D1981249A910A19C922F4301D747`; `app/.env` `2237AB7870841569EA5C1F979BD4AD95002FE8477D7E29A74945CB74ADC8E991`; `app/user_data`, `app/uploads` und `app/.config_path` fehlten weiterhin. Metadatenvergleich, nicht Inhaltsprüfung.

**Ergebnis:** isolierter lokaler Health-Startup **bestanden**. Dies belegt nur den minimalen App-/Healthpfad mit deaktivierten Plugins in diesem temporären Profil. Plugin-Lifecycle, Browserdarstellung, Screenshotcapture, OBS, externe Zustellung und Livebetrieb sind nicht geprüft.
