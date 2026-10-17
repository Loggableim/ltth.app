# OBS Pilot-Normalisierungsauftrag — Status 2026-10-07

## Befund

Beide ausführlichen Source-Manifeste sind keine direkten Eingaben des ISO-Helpers. OBS-Dateien verwenden `bin/`, `data/`, `obs-plugins/`; Sidekick-Dateien verwenden `app/`, `runtime/`, `scripts/` und Rollen. Die Sidekick-Provenienzliste enthält 548 Quellen, während ihre Owner-Erweiterung `effectiveTransfer` 544 normalisierte Ziele und `excludedFromGuest` vier Host-/Testdateien definiert. Der Helper akzeptiert als spätere Eingabe nur `{schemaVersion:1,files:[{path,bytes,sha256}]}`.

## Umsetzung

`scripts/obs-pilot/normalize-transfer-manifests.js` implementiert die deterministische, reine In-Memory-Normalisierung. Es werden nur exakt bekannte Roots, Rollen und Felder akzeptiert. Unbekannte Pfade/Rollen/Properties, Traversal, Reparse-Pfade, Hashdrift, case-insensitive Zielkollisionen, Inkonsistenz zwischen Source und `effectiveTransfer` oder ein abweichender Vier-Dateien-Ausschluss brechen den Lauf ab. Das Reportobjekt enthält den Helper-Manifesthash, Zahlen und Ausschlüsse; es speichert selbst keine Datei.

## Geänderte Dateien

- `scripts/obs-pilot/normalize-transfer-manifests.js` — neuer Normalizer und Read-only CLI.
- `scripts/obs-pilot/test/normalize-transfer-manifests.test.js` — neue synthetische Regressionen ohne Produktpayload.
- `docs/coordination/obs-runtime-closure-audit.md` — Dry-Run-Ergebnis und Verifikationsgrenzen ergänzt.
- Diese Datei — Statusübergabe.

Unverändert: `Bugstofix.md`, beide Source-Manifeste, OBS-Payload, Sidekick-Payload, Talking Heads und TTS. Keine Profile gewechselt, keine Nutzerprozesse angefasst, keine Liveaktionen, Kopien, Staging-Vorgänge oder ISO-Dateien erzeugt.

## Tests und Befund

- **Behoben und geprüft:** deterministische Pfadnormalisierung für die bestehenden Manifeste; 2.651 Einträge / 490.389.602 Bytes; SHA-256 des kanonischen In-Memory-Manifests `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b`.
- **Behoben und geprüft:** vier explizite Host-/Test-Ausschlüsse; genaue Übereinstimmung von `effectiveTransfer` gegen Sourcepfade, Bytezahlen und SHA-256.
- **Geprüft:** `runtime/node/node.exe scripts/obs-pilot/test/normalize-transfer-manifests.test.js` → 5/5 bestanden. Szenarien: deterministischer Erfolg, unbekannte Roots/Properties/Rollen, Traversal, case-insensitive Kollision, Hashdrift, Symlink/Reparse und Allowlist-Abweichung. Die Tests sind synchron im selben Prozess; Node 22.14.0 `--test` war wegen `spawn EPERM` im Workspace nicht verwendbar.
- **Teilweise geprüft:** Source-Manifeste und Dateien stimmen für diesen read-only Lauf. Keine längerfristige Stabilität oder Laufzeit im Gast belegt.

## Verbleibende Risiken und offene Entscheidungen

- OBS-Importinventar beweist keine vollständige Windows-Gastclosure (dynamische Module, Treiber/GPU und Windows-Features bleiben offen).
- VC++ Redistributable Download/Version/Signatur/Hash/Lizenz und Einbindung nicht geprüft.
- Kein ISO geschrieben/validiert, kein Mount, kein Gaststart, kein OBS-/HUD-Runtime-Test und keine CEO-Abnahme des normalisierten Inhalts.
- `socket.io-client` ist jetzt als standalone Bundle-Provenienz ausgewiesen; dieses Paket wird nicht als vollständiger Runtime-Paketbaum übertragen.
- HUD-`lang=en` bleibt laut separater Owner-Änderung ein dokumentierter No-op (`localeQuery.applied=false`); keine Sprachfunktion erfunden.
- Manifestowner/CEO müssen die 544 Transferziele und deren Umfang vor einem späteren Staging separat freigeben.

## Reproduzierbarer Befehl

`runtime/node/node.exe scripts/obs-pilot/normalize-transfer-manifests.js`

Exitcode beim geprüften Lauf: **0**. Er liest das festgelegte Host-OBS-Root `C:\\Program Files\\obs-studio`; bei fehlendem oder geändertem Quellbaum fail-closed. Es schreibt keine normalisierte Datei.

## Folgeauftrag: ISO-Helper-Interop

- **Befund:** Die Normalizer-Pfade wurden gegen die in `build-transfer-iso.ps1` implementierten exakten Manifest- und Pfadregeln geprüft. Neue reine Funktion `validateHelperManifest()` verwendet die erlaubten Roots (`obs`, `runtime`, `pilot`, `host-receipt`, `redist`), Windows-Pfadregeln, sensible Segmente/Dateitypen, strikte Root-/Entry-Keys, case-insensitive Eindeutigkeit sowie Größen-/Hash-/Dateianzahlgrenzen.
- **Konkrete Interopblocker:** OBS-Map ergibt genau eine unzulässige Endung `obs/data/obs-studio/OBSPublicRSAKey.pem`. Sidekick-`effectiveTransfer` ergibt sieben unzulässige `cookie`-Segmente: fünf Einträge des `cookie`-Pakets und zwei `engine.io/.../types.cookie.*` Dateien. Beide Source-Manifeste bleiben unverändert. Keine Ausweichfreigabe angenommen.
- **Hashbeleg:** Exakte Helperserialisierung ist UTF-8 ohne BOM/Whitespace von `JSON.stringify({schemaVersion:1,files})`. Sidekick-Ownerliste: 91.416 Bytes, SHA-256 `2c5e0fab9c531780e2f06bbb7ddafa8914e79c0ce6aebf798e40632c4cf26e88`. OBS-Map: 312.728 Bytes, SHA-256 `f28a3a839dc96aea637847532e8b271ea01e45753119d5f5de157a05819bea86`.
- **Tests:** Normalizer-/Interop-Suite 8/8 PASS. Echter Symlink-Reparse wurde erstellt und fail-closed erkannt; keine Skipfälle in diesem Lauf. Vollständiger PowerShell-Helper, COM/ISO, 7-Zip, Ausgabe-/Temp-Pfadvalidierung bleiben bewusst nicht ausgeführt.
- **Geänderte Dateien:** `scripts/obs-pilot/normalize-transfer-manifests.js`, `scripts/obs-pilot/test/normalize-transfer-manifests.test.js`, `docs/coordination/obs-runtime-closure-audit.md`, dieses Statusdokument.
- **Spätere Inputs:** Owner-/CEO-Entscheidung zu den acht gesperrten Zielpfaden und gegebenenfalls eine gezielte gemeinsame Helper-Policyänderung; falls ein echter ISO-Helper-Aufruf später angefragt wird, braucht es separat ausdrücklich freigegebene Payload-/Outputpfade und Abschluss der übrigen OBS-Gastclosure-Prüfungen. Keine Stagingfreigabe aus diesem Auftrag ableiten.

## Folgeauftrag: Verifikation der acht geblockten Quellen

- **OBS:** `data/obs-studio/OBSPublicRSAKey.pem`, 814 Bytes, SHA-256 `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2`; Inventar passt. Ausschließlich erste ASCII-Zeile geprüft: `-----BEGIN PUBLIC KEY-----`; kein Private-Key-Marker im gelesenen Header. Kein dynamischer OBS-Consumer im Repo gefunden; konkreter Laufzeit-Consumer/Redistribution bleibt ungeklärt.
- **Sidekick:** fünf Dateien aus `cookie@0.7.2` (`index.js`, `LICENSE`, `package.json`, `README.md`, `SECURITY.md`) und zwei Engine.IO-`types.cookie` Dateien. Paketversionen sind cookie 0.7.2 / engine.io 6.6.9. `engine.io/build/server.js` lädt die Cookie-Library; Typdefinition beschreibt CookieSerializeOptions und `server.d.ts` referenziert sie. Keine dieser Dateien enthält persistente Usercookie-/Sessiondaten; Pfadregex blockiert alle sieben trotzdem.
- Tabelle mit allen exakten relativen Pfaden, Bytes, SHA und Provenienz/Consumer ist im Closure-Audit abgelegt.
- Engste denkbare Ausnahme: exakt diese Pfade, exakte Bytes/SHA, Public-Key-Header/verlässliche OBS-Provenienz; keine globale `.pem`-/`cookie`-Lockerung. Für OBS ist Consumerstatus weiter zu bestätigen. Keine Ausnahme umgesetzt.
- **Validatorstatus:** reale PowerShell-Datei wurde gelesen und ihre Regeln in einer reinen JS-Funktion nachgebildet; `build-transfer-iso.ps1` selbst wurde nicht ausgeführt. Die bisherigen 8 synthetischen Tests bestehen, einschließlich echtem Symlink-Reparse-Fall. Kein ISO, COM, 7-Zip, Payload oder Helper-Aufruf.
- **Offene Entscheidung:** CEO/Owner entscheidet, ob eine eng begrenzte Helperpolicy-Ausnahme fachlich verfolgt wird; bis dahin bleiben alle acht Zielpfade abgelehnt. Diese Prüfung ist keine Staging- oder Transferfreigabe.

## Folgeauftrag: gezielte Cookie-Policy-Ausnahmen und tatsächlicher PS-Validator

- **Änderungen:** Neue `scripts/obs-pilot/transfer-path-exceptions.json` mit genau sieben Zielpfaden und exakten Bytes/SHA. `build-transfer-iso.ps1` lädt sie strict/case-sensitive; nur die sensitive-segment-Regel wird für exakt passende Einträge übergangen, Hash-/Bytes-/Reparse-/Credentialchecks bleiben bestehen. Neuer `-ValidateManifestOnly` beendet nach echtem Helper-Validator und vor Tree-Inventur/IMAPI/COM/ISO. JS-Normalizer/Validator liest dieselbe Policy.
- **Teststatus:** `runtime/node/node.exe scripts/obs-pilot/test/normalize-transfer-manifests.test.js`: **10/10 PASS**. Reale PowerShell `-ValidateManifestOnly`-Prüfung mit sieben temporären Fixtures: `manifest-validation-only-passed`, 7 / 29.721 Bytes, `isoCreated=false`, Exit 0, Output leer. Falscher Hash, falsche Bytes und ähnlich benannter `my-cookie/session.json` wurden im echten PS-Helper alle abgewiesen. Temporäre Daten entfernt.
- **OBS-Key-Consumer:** lokal in OBS 32.1.0 `obs64.exe` anhand von begrenzten ASCII-Strings bestätigt (Filename + Not-found/Not-read Fehlertexte); Metadaten/Hash stimmen mit OBS-Inventar. Nur PEM-Headerklasse `PUBLIC KEY` betrachtet, kein Keybody. Redistribution-Provenienz nicht gefunden; `.pem` bleibt gesperrt.
- **Blockiert:** tatsächliche komplette Helper-/ISO-Interoperabilität bleibt blockiert, bis der CEO über die eine OBS-PEM-Datei nach lokalem Consumerbeleg und Lizenz-/Provenienzprüfung entscheidet. Keine Freigabe für Staging.
- **Dateien:** `scripts/obs-pilot/transfer-path-exceptions.json`, `scripts/obs-pilot/build-transfer-iso.ps1`, `scripts/obs-pilot/normalize-transfer-manifests.js`, `scripts/obs-pilot/test/normalize-transfer-manifests.test.js`, `docs/coordination/obs-runtime-closure-audit.md`, dieses Statusdokument.
- **Commit:** nicht erstellt, CEO verlangte keinen eigenen Commit.

## Folgeauftrag: offizielle OBS-PEM-Provenienz und Owner-Nachprüfung

- Offizielle OBS-32.1.0 README und COPYING sowie OBS Windows-Installationsseite geprüft. README deklariert GPLv2-or-later; COPYING §§1/3 regeln Programmkopien und Object-/Executableweitergabe. Windowsseite nennt Release/ZIP-Installationswege. Dies belegt OBS-Programmweitergabe grundsätzlich unter Lizenzbedingungen, aber nicht spezifisch den separaten Rechtsstatus/die Quellprovenienz der einen PEM-Datei.
- Lokaler Consumerbeleg ist bereits vorhanden. Die offizielle GitHub-Tag-/Raw-Ansicht von `UI/data/OBSPublicRSAKey.pem` und der zugehörigen Installregel war wegen Cache miss/Robots nicht zugänglich. Kein Zeilenbeleg wird behauptet; exakte Datei-/CMake-Einbindung und file-specific licensing bleiben offen.
- `.pem` bleibt strikt gesperrt; kein Ausnahmeeintrag oder Transferurteil.
- Reproduzierbarer PS-Validatoraufruf und Erwartung im Closure-Audit dokumentiert. `-ValidateManifestOnly` nutzt random Temp/Payload/Manifest/Output und erzeugt kein ISO; keine Testpayload liegt im Repo.
- Ownershipregression nach Helperänderung: `pwsh -NoProfile -File scripts/obs-pilot/test/build-transfer-iso-ownership.test.ps1` → drei PASS-Fälle: CreateNew collision/Sentinel-Ownership, write failure cleanup, Temp cleanup.
- Geänderte Datei: `docs/coordination/obs-runtime-closure-audit.md` plus dieses Statusdokument. Keine Code-/Policy-/Manifeständerung in diesem Folgeauftrag; kein Commit.

## Folgeauftrag: OBS-Upstreamzugriff und CEO-einzelner Validatorbefehl

- Offizielle GitHub Blob/Blame für `UI/data/OBSPublicRSAKey.pem` + `UI/CMakeLists.txt` und Contents API begrenzt versucht; Views wegen Cache miss/API access failure nicht abrufbar. Keine endlosen Wiederholungen, kein inoffizieller Mirror. Allgemeine OBS GPL-/Windows-Distribution belegt über offizielle Tag-README `32.1.0/README.rst` 14–21, `32.1.0/COPYING` §§1/3 und OBS Windows-Installationsseite; keine Schlussfolgerung zur separaten PEM-Rechteposition. `.pem` bleibt gesperrt.
- Dauerhaftes Harness neu: `scripts/obs-pilot/test/validate-manifest-only.test.ps1`.
- CEO-Befehl: `pwsh -NoProfile -File scripts/obs-pilot/test/validate-manifest-only.test.ps1`.
- Harnesslauf: 4/4 PASS (positiv Exit0, falscher Hash/Bytes/Lookalike jeweils Exit1; Helper-JSON-Erwartungen; Output leer; Temp cleanup). Sieben geprüfte Bibliotheksfixtures nur im zufälligen Temp. Kein ISO/COM, keine Repo-Fixtures.
- Ownership Regression erneut: `pwsh -NoProfile -File scripts/obs-pilot/test/build-transfer-iso-ownership.test.ps1`: 3 PASS.
- Dieses Ergebnis ist lokale Agentprüfung; **CEO-Nachprüfung/Abnahme noch ausstehend**, nicht als CEO-abgenommen markiert.
- Nur neue Datei `scripts/obs-pilot/test/validate-manifest-only.test.ps1` und diese zwei Statusberichte ergänzt. Kein Commit.

## Folgeauftrag: read-only Vorabprüfung weiterer Helper-Gates

- Geprüft wurden die tatsächlichen 2.651 effektiven Sourcepfade ohne Payloadkopie: 490.389.602 Bytes, null Hashdrift, null Hidden/System, null Reparse, null Textdateien >32 MiB; Datei-, Count- und Aggregatgrößen innerhalb Helperlimits.
- Path gates: keine sensiblen Segmente außerhalb der sieben exakt gepinnten Ausnahmen; eine bereits bekannte `.pem`-Pfadverletzung `obs/data/obs-studio/OBSPublicRSAKey.pem`.
- Credentialscan: 177 Treffer, ausschließlich Regexregel 1; 176 OBS-Locale-INI-Dateien unter `obs/data/**/locale/`, ein `pilot/app/node_modules/ws/lib/websocket.js`. Das sind statische Locale-/Runtimequellen, keine Profiles/Userdaten. Treffertexte/Secretwerte wurden nicht ausgegeben. Helper würde diese Dateien trotzdem blocken; kein Scanner-Ausnahmepfad genehmigt. Regeln 2–7 ohne Treffer.
- Evidenzgrenze: Dies ist eine read-only Quellscan-Nachbildung aus den tatsächlichen Helper-Regeln, kein `build-transfer-iso.ps1 -ValidateManifestOnly` für die Vollmanifestmenge, da dafür eine Payloadabbildung/Kopie nötig wäre und der Auftrag das ausschließt. Der tatsächliche PowerShell-Harness bleibt auf den sieben gepinnten Cookie-Dateien beschränkt.
- Bericht in `docs/coordination/obs-runtime-closure-audit.md`. Keine Code-/Manifeständerung und keine Commit.
- Nächster Vorschlag: Owner/CEO entscheidet, ob es eine eng begrenzte, testbare Regel für nachweislich statische Übersetzungs-/Paketquellen geben soll oder ob der Volltransfer an diesen Scannerhits gesperrt bleibt. Trefferwerte bleiben verborgen. Keine Stagingfreigabe.

## Folgeauftrag: Regel-1-Quellklassifikation (2026-10-07)

- Korrigierte Root-Zuordnung: `obs/` und `pilot/` sind normalisierte Zielpfade. Originalquellen liegen unter `C:\Program Files\obs-studio` und dem Sidekick-Repository; keine Payloadkopie wurde angelegt.
- Exakte Helper-Regel 1 wurde auf manifestierte Originaldateien angewendet, nachdem Bytes/SHA und Reparse-Ketten geprüft wurden. 0 Drift, 0 Reparse, 0 Textlimitüberschreitungen. Aktueller Befund: 176 OBS-Locale-Dateien mit 258 Trefferzeilen; `app/node_modules/ws/lib/websocket.js` hat 0 Trefferzeilen. Die historische Zahl 177 betroffener Dateien ist damit nicht aktuell reproduzierbar; sie ist nicht als Zeilenanzahl zu verwenden.
- Alle OBS-Trefferzeilen sind INI-Zuweisungen mit identifierförmigem Schlüssel und quotiertem Ressourcentext; 164 UI-/Ressourcen-Namespace-Zeilen, 94 andere Identifier-Namensräume. Verteilung: Plugin-Locale 151 Zeilen in 25 Pluginfamilien; OBS-Core-Locale 107 Zeilen. Keine Trefferwerte ausgegeben. Die Ressourcenform belegt keinen Persistenz-/Nutzerdatenfund; die 94 anders benannten Schlüssel haben keine ausreichende Einzelprovenienz für eine Scannerfreigabe.
- Entscheidung: keine Regel-1-Ausnahme oder Policyänderung; aktuelle OBS-Treffer bleiben blockiert. Regeln 2–7 hatten in diesem Scan 0 Treffer. PEM bleibt gesperrt. Bestehender tatsächlicher PS-Harnessnachweis bleibt auf sieben Cookie-/Engine.IO-Fixtures beschränkt.
- Normalizer-CLI wurde read-only gestartet und fail-closed am bereits bekannten verbotenen `.pem`-Pfad beendet (`data/obs-studio/OBSPublicRSAKey.pem`); kein vollständiger Dry-Run-/Payloadclaim.
- Auditdokument und Statusdokument bestanden strikten UTF-8-Decode ohne Ersatz-, Steuer- oder NUL-Zeichen. Keine Produktdatei, Manifest oder Testdatei verändert; kein Staging, ISO, VM, Download, Start oder Commit.

## Folgeauftrag: offizielle Consumerklassifikation und inaktiver Rule-1-Kandidat (2026-10-07)

- Korrektur zum vorherigen Teilstatus: die 94 Zeilen außerhalb des ersten UI-Namensraumfilters waren nicht unbekannte Konfigurationsdaten. Schlüsselprüfung ergab zwei eindeutige UI-Labelgruppen: `OBSWebSocket.Settings.Password` (50 Locale-Dateien, je eine Zeile) und `Password` (44 rtmp-services Locale-Dateien, je eine Zeile). Die übrigen 164 Zeilen sind UI-/Ressourcen-Namensraum. Alle 258 Zeilen sind statische INI-Übersetzungsressourcen; keine Trefferwerte ausgegeben.
- Offizielle Consumerbelege: OBS Standard-INI-Locale/`obs_module_text()` in `docs/sphinx/plugins.rst` und `libobs/obs-module.h`; obs-websocket lädt diesen Mechanismus in `src/obs-websocket.cpp` und bindet die SettingsDialog-Lokalisierung in `src/forms/SettingsDialog.cpp` ein. RTMP-Services `Password` ist Locale-UI-Ressource; OBS Stream-Settings-Consumer ist `frontend/settings/OBSBasicSettings_Stream.cpp`. URLs stehen im Closure-Audit.
- Kandidat zur Ownerprüfung erstellt: `scripts/obs-pilot/transfer-rule1-exception-candidate.json`. Status `proposed-inactive-review-only`; exakt 176 OBS-Locale-Zielpfade mit manifestierten Bytes/SHA, Version, Schlüsselgruppe und Zeilennummern für 258 Treffer. Einzige vorgesehene Ausnahme: Credentialregel 1 nach Reparse-/Bytes-/SHA-Prüfung. Regeln 2–7 und alle sonstigen Gates bleiben immer aktiv. Helper/Normalizer laden die Datei nicht; es ist keine aktive Freigabe. `ws` nicht aufgenommen (0 aktuelle Trefferzeilen).
- Neuester Scan: 176 betroffene Dateien/258 Zeilen; `ws` 0; Hashdrift 0, Reparse 0, Regeln 2–7 0. Die historische 177-Dateiangabe bleibt als früherer Scanstand dokumentiert und ist keine aktuelle Zeilenzahl.
- Kein Helper-/Normalizer-Code, aktives Manifest, Regressionstest, Payload oder Installationsbaum geändert. Kein Copy, Staging, ISO, Download, VM, Start oder Commit. Beide Statusdateien strict UTF-8 PASS.

## Umsetzung: freigegebene exakte Regel-1-Policy (2026-10-07)

- Neue aktive Quelle `scripts/obs-pilot/transfer-rule1-exceptions.obs32.1.0.json`, getrennt vom inaktiven Reviewkandidaten. 176 exakte OBS-Locale-Ziele mit Bytes/SHA, Version, Keys/Kategorie und hitLines; Source-Manifest-SHA ist mitgebunden.
- `scripts/obs-pilot/build-transfer-iso.ps1`: strikt validierter Policyloader mit hardcodiertem Policyhash, festem Versions-/Sourcehash-/Rule-Scope-Vertrag, exaktem 176-Pfadecount und ohne Caller-Eingabe. Regel 1 wird nur für exakte Ziel+Bytes+SHA nach Reparse/Payloadbytes-/SHA-Gates übersprungen; Regeln 2–7 bleiben aktiv.
- `scripts/obs-pilot/test/validate-locale-rule1-policy.test.ps1`: 12/12 PASS, 0 Exitcode bei repräsentativer OBS-Locale-Policyfixture, 1 Exitcode je Manipulations-/Lookalike-/Credentialnegativfall; 176/176 Quellbytes und Hashes/Reparseketten verifiziert; Tempcleanup PASS; kein ISO/COM.
- Bisheriges ValidateManifestOnly-Harness 4/4 PASS; Outputownership 3/3 PASS.
- Eingriff betrifft nur den OBS-Transfervalidator und OBS-Locale-Policy; keine Talking Heads/TTS oder andere Plugin-/Runtimeänderungen. PEM bleibt gesperrt. Keine Vollpayloadkopie, Staging, ISO, VM, Download, Start oder Commit.
- Die frühere Statuszeile „keine Policyaktivierung“ beschreibt den Zwischenstand vor dieser CEO-Freigabe; diese Sektion dokumentiert die danach abgeschlossene Aktivierung.
