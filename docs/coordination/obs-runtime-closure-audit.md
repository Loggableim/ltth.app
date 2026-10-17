# OBS-Pilot Runtime-Closure-Audit

Stand: 2026-10-07. Read-only Abgleich von Quellimports, Pilotlayout und vorhandenen Manifesten. Keine Payloadkopie, kein Staging, kein ISO-Bau, keine Downloads und keine Starts. Das Sidekick-Transfermanifest gehört einem anderen Owner und wurde nicht geändert.

## Geprüfte Konsistenz

- `docs/coordination/obs-sidekick-pilot-transfer-manifest.json`: SHA-256 `879975b60fbca0af1755c4af6c1a2aa3af62398ae5d12a123cd12ff50dc7a569`; 548 Einträge / 87.786.368 Bytes / 24 Paketversionen. Alle 548 aktuellen Quellpfade existieren und stimmen bei Bytezahl und SHA-256 überein. Alle 24 `packageClosure`-Versionen stimmen mit den lokalen `package.json`-Werten überein. `app/package-lock.json` ist separat unter `sourceProvenance` gepinnt und stimmt mit 534.051 Bytes und SHA-256 `eff811ac8e412af80cb71927575ee080df84d0073a5106f67057b31ab314698d`; die Lockdatei steht nicht in `files`.
- `docs/coordination/obs-portable-transfer-manifest.json`: SHA-256 `41e4bed8eb2fe413dfaafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa`; 2.107 Hostdateien / 402.653.499 Bytes. Die bestehende PE-Analyse ist direkte Importinventur des Hostbaums, keine abgeschlossene portable OBS-Laufzeitclosure.
- Pilot-Node ist als `runtime/node/node.exe` enthalten, Version 22.14.0 / ABI 127, mit passendem SHA-256 `33b1bc1a8aca11fd5a4f2699e51019c63c0af30cf437701d07af69be7706771b`.
- Rekursive statische `require()`-Auflösung über 77 JavaScript-Dateien der Runnerkette fand keine fehlende verpflichtende Runtime-Datei im Sidekick-Manifest. Die erkannte Auslassung von `supports-color`/`has-flag` ist optional (`debug/src/node.js:29-116` fängt sie ab); `bufferutil` und `utf-8-validate` sind optionale `ws`-Peers und werden mit JS-Fallback behandelt (`ws/lib/buffer-util.js:115-123`, `ws/lib/validation.js:142-150`).

## Pfad- und Asset-Abgleich

| Zweck | Quellbeleg | Manifestbeleg | Ergebnis |
|---|---|---|---|
| HUD-Datei | `app/plugins/sidekick/overlay/sidekick-hud.html:234` lädt `/socket.io/socket.io.js` | Sidekick-Manifest `files`-Eintrag bei Zeile 3479 | SHA/Bytes stimmen |
| Socket.IO-Browserbundle | `scripts/obs-pilot/fixture-host.js:11,94-96` liest und bedient `app/node_modules/socket.io-client/dist/socket.io.js` same-origin | Sidekick-Manifest Zeile 3005; 155.836 Bytes, SHA-256 `bc425714aa8f2547d6939e3721ebafd3830a7562a1f6cb08acc1e794bd707954` | Datei ist vorhanden und gehasht; alleinstehendes Bundle genügt zur HUD-Ausführung |
| Fixture-Server | `fixture-host.js:6-11`; Socket.IO-Server, HUD und Browserbundle werden relativ zu `ROOT` gesucht | Sidekick-Manifest Zeile 3521 und Paketclosure `socket.io@4.8.3` bei Zeile 225 | Pfad passt bei Zielabbildung `scripts/...` → `pilot/scripts/...`, `app/...` → `pilot/app/...` |
| Runner-Supportmodule | `run-pilot.js:8-10` importiert `../lib/obs-docs-capture`, `../capture-obs-docs-screenshot.js` und `./stage-contract`; `scripts/lib/obs-docs-capture.js` re-exportiert die Session | Manifestpfade bei Zeilen 3497, 3503, 3509, 3539 | Dateien vorhanden; ursprüngliche Layoutskizze nannte `pilot/scripts/lib` und `pilot/scripts/capture-obs-docs-screenshot.js` nicht. Das Bootstrap-Runbook wurde um diese Ziele ergänzt. |
| OBS-Steuerclient | `run-pilot.js:116` lädt `ROOT/app/node_modules/obs-websocket-js`; Bundle-Root aus `safety-contract.js:9` wird im Pilotbaum `pilot/` | Paketclosure `obs-websocket-js@5.0.7` bei Zeile 201 | Paket und Version stimmen |
| Node-Bootstrap | Runner wird aus der überführten Pilotstruktur mit dem separaten portable Node gestartet | Manifest `runtime.path` und Datei `runtime/node/node.exe` | Version/ABI/Hash stimmen; tatsächlicher Gaststart nicht geprüft |

## Diskrepanzen und spätere Mindestkorrekturen

1. **Quellmanifeste sind keine Helper-Eingaben (Transferblocker).** Der ISO-Helper erlaubt nur exakt `schemaVersion` und `files`; jeder Datei-Eintrag darf nur `path`, `bytes` und `sha256` enthalten (`build-transfer-iso.ps1:27,80-104`). Die OBS-Quellliste hat zusätzliche Rootfelder und Checkout-relative Pfade `bin/`, `data/`, `obs-plugins/`; das Sidekick-Manifest hat zahlreiche Rootfelder, `role` je Datei und Quellwurzeln `app/`, `runtime/`, `scripts/`. Keines kann unverändert als Helper-`transfer-manifest.json` dienen. Vor einem späteren Produktransfer braucht es eine freigegebene Teilmenge und eine deterministische Normalisierung: OBS-Pfade nach `obs/<relativ>`; freigegebene App-/Runnerpfade nach `pilot/<repo-relativ>`; Node nach `runtime/node/node.exe`; nur CEO-geprüfte Receiptdatei nach `host-receipt/`. Ausgabeformat exakt `{schemaVersion:1,files:[{path,bytes,sha256}]}`. Keine Manifeständerung durch diesen Audit.
2. **Vier host-/testbezogene Dateien stehen trotzdem im Sidekick-Manifest-`files`.** `app/plugins/sidekick/test/pilot-public-overlay-harness.test.js` (Zeile 3485), `scripts/obs-pilot/create-isolation-receipt.js` (3515), `scripts/obs-pilot/test/contract.test.js` (3545) und `scripts/obs-pilot/test/stage-contract.test.js` (3551) sind jeweils als hostseitig/nicht Runtime markiert. Wenn `files` die exakte Transferliste ist, würden diese Einträge dennoch in die Normalisierung geraten, sofern kein Filter gilt. Der Manifestowner muss vor Produkstaging entscheiden, ob diese Einträge aus dem effektiven Transferbestand herausgefiltert oder in getrennte Quellprovenienz verschoben werden. Die Datei wurde nicht geändert.
3. **Socket.IO-Clientversion ist nicht ausdrücklich in `packageClosure` erfasst.** Das Browserbundle ist selbst als einzelne Datei samt aktuellem Hash gelistet. Die lokale Paketquelle ist `socket.io-client@4.8.3`, aber die Paketclosure führt nur `socket.io@4.8.3` (Server) auf. Der gebundene Lockfile-Hash erlaubt Provenienzprüfung; für klarere Nachvollziehbarkeit kann der Owner `socket.io-client@4.8.3` als Bundle-Build-Provenienz notieren, ohne das vollständige Clientpaket in die Gastclosure aufzunehmen.
4. **`lang=en` wird vom HUD nicht verarbeitet.** `run-pilot.js:162` öffnet `?lang=en`; das HUD deklariert `lang="de"` (`sidekick-hud.html:2`) und liest nur `position`, `minimal`, `events` und `maxEvents` (`sidekick-hud.html:237-241`). Es gibt keinen `i18n-client`-Import, Locale-Fetch oder weiteren CSS-/Bild-/Scriptbezug; das HUD ist selbstenthalten außer dem Socket.IO-Bundle. Das ist kein fehlendes Runtimeasset, aber die Englischangabe ist wirkungslos. Falls englische UI-Semantik gefordert wird, muss der Pluginowner Sprachumschaltung und die daraus entstehenden Locale-Dateien erst als Quelländerung definieren; andernfalls `lang=en` aus der Runner-URL entfernen oder als nicht semantische Fixture-Query dokumentieren.
5. **OBS-Hostinventar beweist keine Gastclosure.** Die 2.107-Datei-Liste und direkte PE-Imports pinseln den installierten OBS-Baum; dynamische Loads, GPU/Treiberverhalten und installierte Gast-Windows-Komponenten bleiben offen. Die fünf im Runbook aufgeführten MSVC-Laufzeitdateien liegen im Host-System32, nicht im OBS-Baum. Keine Guest-Import-/Runtimeannahme wird aus dieser Manifestprüfung abgeleitet.

## Geänderte Dateien und Status

- `docs/coordination/obs-guest-bootstrap.md`: Layoutskizze ergänzt um die erforderlichen relativen Runner-Supportpfade und Hinweis zur Normalisierung freigegebener Source-Manifeste.
- Neu: `docs/coordination/obs-runtime-closure-audit.md` (dieser Bericht).
- Keine Änderung an `obs-sidekick-pilot-transfer-manifest.json`, OBS-Quellmanifest, Runtime-Dateien oder Sidekick-HUD.
- Ergebnis: Sidekick-HUD-/Socket.IO-Asset und notwendige JavaScript-Imports sind statisch vorhanden und hash-/versionskonsistent; die spätere Produkterzeugung bleibt durch fehlende Normalisierung/Owner-Entscheidung über hostseitige Einträge sowie ungeprüfte OBS-Gastclosure blockiert. Kein Gaststart oder Runtime-Test.
## Dry-Run-Normalisierung – 2026-10-07

Der Transfernormalizer wurde ergänzt: `scripts/obs-pilot/normalize-transfer-manifests.js`. Er liest beide Source-Manifeste und Quelldateien nur lesend, akzeptiert exakt bekannte Root-/Dateifelder, Rollen und Quellwurzeln, prüft Pfadsicherheit, Reparse-Ketten, Bytezahl und SHA-256, verhindert case-insensitive Zielkollisionen und vergleicht die Sidekick-Auswahl gegen `effectiveTransfer` sowie `excludedFromGuest`. Ausgabe bleibt im Speicher; es wird weder ein Hilfsmanifest noch Payload geschrieben.

Aktueller read-only Lauf mit gebündeltem Node 22.14.0:

- Ergebnis `dry-run-only-normalization-verified`
- 2.651 effektive Einträge / 490.389.602 Bytes
- Normalisiertes Manifest (kanonisches JSON) SHA-256 `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b`
- Vier Host-/Testdateien explizit ausgeschlossen: Sidekick-In-Process-Referenztest, Host-Receipt-Produzent, Host-Contract-Test und Host-Stage-Test.
- Normalisierung OBS `bin/`, `data/`, `obs-plugins/` → `obs/`; Sidekick `app/`, `scripts/` → `pilot/`; portable Node bleibt `runtime/node/node.exe`.

Synthetische Regressionen: `runtime/node/node.exe scripts/obs-pilot/test/normalize-transfer-manifests.test.js` — **5/5 bestanden** (gültige deterministische Abbildung, unbekannte Wurzel/Properties/Rollen, Traversal, case-insensitive Kollision, Hashdrift, Symlink/Reparse, exakte `effectiveTransfer`-Allowlist und Ausschlüsse). Node-Test-Runner wurde nicht verwendet, weil dessen Kindprozessstart im Workspace mit `spawn EPERM` scheiterte; die Tests liefen direkt und synchron.

Diese Prüfung erzeugt keine Transferdateien. OBS-Laufzeitclosure im Gast, Redist/Lizenzfreigabe, unabhängige Receiptfreigabe, ISO-Erstellung und Gast-/OBS-Abnahme sind weiterhin nicht geprüft bzw. separat gesperrt. Keine Änderung an den Source-Manifesten durch den Normalizer-Auftrag.
## ISO-Helper-Interop-Nachprüfung — 2026-10-07

Die Normalizer-Ausgabe wurde gegen die im ISO-Helper implementierten strikten Manifestregeln gegengeprüft (`Assert-ExactJsonProperties`, `Assert-SafeRelativePath`, Dateizahl-/Größen-/Hashchecks). Die Syntax- und Pfadregeln wurden als reine Funktion `validateHelperManifest()` isoliert und gegen synthetische JSON-Objekte geprüft. Kein Helper-Skript wurde ausgeführt; insbesondere kein IMAPI/COM, Payloadverzeichnis, 7-Zip oder ISO.

### Exakter Normalizer-Output

- Kanonische Bytes sind `UTF-8(JSON.stringify({schemaVersion:1,files:[{path,bytes,sha256}]}))`, ohne BOM, Whitespace oder Zeilenumbruch.
- Für den zuletzt geprüften Ownerstand `effectiveTransfer.files`: 91.416 Bytes, SHA-256 `2c5e0fab9c531780e2f06bbb7ddafa8914e79c0ce6aebf798e40632c4cf26e88`.
- Das ist der Hash des Helper-kompatibel serialisierten normalisierten Objekts; er weicht vom früheren Dry-run-Digest über die komplette OBS+Sidekick-Menge ab.
- Metadatenumfang 544 Sidekick-Dateien, Größen-/Hashfelder syntaktisch gültig; die tatsächliche Helperpfadprüfung schlägt fehl (siehe unten).

### Tatsächliche Interop-Blocker

- OBS-Inventar nach Präfixabbildung `obs/`: 2.107 Dateien. Exakt eine Helper-Pfadverletzung: `obs/data/obs-studio/OBSPublicRSAKey.pem` — `.pem` ist laut Helper generell verboten. Ein synthetisch serialisiertes OBS-Manifest hätte 312.728 Bytes und Digest `f28a3a839dc96aea637847532e8b271ea01e45753119d5f5de157a05819bea86`; Validierung **fail**.
- Sidekick-`effectiveTransfer`: exakt sieben Helper-Pfadverletzungen durch `cookie`-Segment: fünf Dateien unter `pilot/app/node_modules/cookie/` und `pilot/app/node_modules/engine.io/build/contrib/types.cookie.{d.ts,js}`. Das synthetisch serialisierte Objekt hat 91.416 Bytes und Digest `2c5e0fab9c531780e2f06bbb7ddafa8914e79c0ce6aebf798e40632c4cf26e88`; Validierung **fail**.
- Diese Ablehnungen kommen aus dem bereits bestehenden Helper-Regex für sensible Segmente/Endungen. Der Normalizer darf sie nicht still übergehen. Die Manifestowner müssen entscheiden, ob die inhaltlich legitimen Runtime-Dateien durch eine engere, nachvollziehbare Sonderregel im Helper erlaubt werden, anders ersetzt werden können, oder den geplanten Transferumfang blockieren. Keine dieser Änderungen wurde vorgenommen.

### Regressionen und Grenzen

`runtime/node/node.exe scripts/obs-pilot/test/normalize-transfer-manifests.test.js`: **8/8 PASS**, einschließlich exaktem Root-/Property-Schema, erlaubten Top-Level-Wurzeln, NFC/Traversal/Windows-reservierten und sensiblen Segmenten, Dateitypen, Byte-/Hashtypen, case-insensitiven Duplikaten, 2-GiB+Manifest-Grenze und SHA-256 über das exakt serialisierte Helperformat.

Reparse-Punktfall erzeugte auf dem aktuellen Windows-System einen echten synthetischen Symlink und wurde vom Normalizer abgelehnt (**PASS**, nicht übersprungen). Die Tests führen nur direkte synchrone Assertions aus, da `node --test` im Workspace beim Workerstart mit `spawn EPERM` scheiterte.

Die pure JS-Prüfung entspricht dem aus dem PowerShell-Helper gelesenen Validatorcode; sie ist kein Lauf des ganzen PowerShell-Skripts und belegt keine Ausgabe-/Temp-Pfad- oder COM-Validierung. Ein späterer Helperaufruf braucht freigegebene Payloaddateien, exakte Dateien/Hashes, neue leere Outputpfade, verfügbares 7-Zip und muss weiterhin an allen Pfadblockern scheitern, bis diese entschieden sind. Keine Freigabe für Staging wird daraus abgeleitet.
## Quellverifikation der acht Helper-Blocker — 2026-10-07

Alle Prüfungen waren read-only. Sourcebytes und SHA-256 wurden gegen die beiden Source-Manifeste geprüft. Es wurde kein PEM-Inhalt außer der ersten ASCII-Zeile gelesen/ausgegeben; keine Schlüsselbytes oder vollständige Datei wurden geloggt.

### OBS Public-Key-Datei

- Source relativer Pfad: `data/obs-studio/OBSPublicRSAKey.pem`; normalisiertes Ziel `obs/data/obs-studio/OBSPublicRSAKey.pem`.
- Größe 814 Bytes; SHA-256 `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2` (passt zum OBS-Inventar).
- Headerklassifikation: `-----BEGIN PUBLIC KEY-----`; der begrenzte Header enthält keinen `PRIVATE KEY`-Marker. Datei heißt `OBSPublicRSAKey.pem`, liegt unter `data/obs-studio` und ist in der Hostdateiliste enthalten.
- Consumer/Verwendung: aktuelle Quelltextsuche in `scripts/`, `app/` und `docs/` fand keine explizite Referenz; damit ist aus dem Repository nicht belegt, welcher OBS-Laufzeitpfad sie konsumiert. Sie kann zur OBS-Installation gehören, aber das konkrete Laden wurde nicht dynamisch untersucht.
- Policyblocker: ausschließlich die generelle Helper-Endungssperre `.pem`; keine inhaltliche Erkenntnis weist auf einen privaten Schlüssel hin. Das ist keine Sicherheitsfreigabe oder Transferentscheidung.

### Sidekick Cookie-/Typquellen

| Source → Ziel | Bytes | SHA-256 | Provenienz/Verwendung |
|---|---:|---|---|
| `app/node_modules/cookie/index.js` → `pilot/app/node_modules/cookie/index.js` | 8.166 | `a88f6d7257e3403b727b90a2f3f5c03591e14eaa0b217c501b7071074f080e42` | `cookie@0.7.2`, MIT; verteilte Library parse/serialize Funktionen. `engine.io/build/server.js` importiert `cookie`. |
| `app/node_modules/cookie/LICENSE` → gleiches Zielpräfix | 1.175 | `c02110eedc16c7114f1a9bdc026c65626ce1d9c7e27fd51a8e0feee8a48a6858` | Paketlizenzdatei. |
| `app/node_modules/cookie/package.json` → gleiches Zielpräfix | 1.092 | `7fa781bd142e7f38b66bff64b4e3a8be9e53e340e7ddaf27caebd00322602208` | Paketmetadaten: Name `cookie`, Version `0.7.2`, Main `index.js`. |
| `app/node_modules/cookie/README.md` → gleiches Zielpräfix | 11.769 | `ba8b36c7d860d6ef37887b6ef496a486e91aefe5229f65157cc8b44725b9bec5` | Paketdokumentation. |
| `app/node_modules/cookie/SECURITY.md` → gleiches Zielpräfix | 1.180 | `299f5e632ccb1ae2d74f95dac09db13d7ff46c482663b67032e3e72cbe376276` | Paket-Sicherheitskontaktdatei. |
| `app/node_modules/engine.io/build/contrib/types.cookie.d.ts` → `pilot/app/node_modules/engine.io/build/contrib/types.cookie.d.ts` | 6.041 | `08c2bb524b8ed271f194e1c7cc6ad0bcc773f596c41f68a207d0ec02c9727060` | Engine.IO `6.6.9`; generierte TypeScript-Definition für Cookie-Serialisierungsoptionen; von `server.d.ts` typseitig referenziert. Kein Cookiewert oder Sessiondatensatz. |
| `app/node_modules/engine.io/build/contrib/types.cookie.js` → gleiches Zielpräfix | 298 | `a374c183df3da0115753ea5423b0fe66feece4f6d7feef4ee6591c8f7c092483` | erzeugte JS-Exporthülle der Paketbeilage; kein persistenter Cookie-/Sessionzustand. |

Diese sieben Dateien sind Runtime-/Paketprovenienz bzw. Type-/Dokumentationsdateien, keine Nutzer-Cookies oder Sessions. Die erste `cookie/index.js` ist direkter Runtime-Consumer: `engine.io/build/server.js` importiert `cookie`. Der ISO-Helper lehnt dennoch alle sieben ab, weil sein allgemeiner Segmentregex auch Bibliotheksverzeichnisse und `types.cookie.*` trifft.

### Engste Policyoption zur Entscheidung

Falls Owner/CEO die Dateien für einen späteren Transfer für erforderlich halten, könnte eine separate, versionsgebundene Ausnahme ausschließlich diese acht relativen normalisierten Pfade mit exakt gepinnten Bytes/SHA erlauben. Zusätzlich könnte die OBS-Ausnahme an den festgestellten Public-Key-PEM-Header und eine verlässliche OBS-Sourceprovenienz gebunden werden. Keine globale `.pem`-Erlaubnis und keine globale `cookie`-Segmentausnahme. Eine solche Ausnahme sollte nur die Pfadklassifizierung ändern; Hash-, Byte-, Reparse-, Inhaltsscan-, Zieldateisatz- und späteren Review-Gates bleiben bestehen. Vor allem für die OBS-Datei ist erst der konkrete OBS-Consumer/Redistributionstatus zu bestätigen. Es wurde keine Ausnahme implementiert.

**Tatsächlicher Validatorstatus:** keine Ausführung von `build-transfer-iso.ps1`; nur Ausführung der reinen JS-Nachbildung anhand des gelesenen PowerShell-Validatorcodes. Das vollständige Helper-/COM-/ISO-Verhalten ist ungetestet.
## Folgeauftrag: genau gepinnte Cookie-Ausnahmen + lokaler OBS-Consumerbeleg — 2026-10-07

### Cookie-Ausnahmepolicy

Die gemeinsame Policy liegt in `scripts/obs-pilot/transfer-path-exceptions.json`, Schema 1, exakt sieben Einträge (normalisierte Zielpfade, Bytes, SHA-256, Begründung). Die Policy erlaubt nur die zuvor verifizierten Dateien aus `cookie@0.7.2` und `engine.io@6.6.9`; keine `.pem`-Ausnahme. Keine Caller-Option kann zusätzliche Pfade/Hashes registrieren.

PowerShell-Helper und JS-Validator laden dieselbe Datei. Für einen exception-kandidaten muss erst der exakte ordinale Zielpfad + gepinnte Metadaten passen. Der Helper prüft anschließend weiterhin Pfadcontainment, Reparse-Chain, versteckt/system, echte Bytezahl, frisch berechneten SHA-256 und Credential-Textscan. Erst danach gilt die sensitive-segment-Ausnahme als erhalten. Daher kann weder ein manifestseitig gefälschter Hash/Bytewert noch eine geänderte Datei die Ausnahme erschleichen. `.pem` bleibt global gesperrt.

Der Helper besitzt nun `-ValidateManifestOnly`. Dieser führt den echten PowerShell-JSON-/Pfad-/Datei-/Hash-/Credentialvalidator aus und kehrt vor Payloadinventur, IMAPI/COM, 7-Zip und ISO-Erstellung zurück. Mit sieben exakt hashgeprüften Runtime-/Paketdateien als Fixture unter einem zufälligen Tempverzeichnis: `manifest-validation-only-passed`, 7 Dateien, 29.721 Bytes, `isoCreated=false`, Exit 0. Tempbaum anschließend entfernt. Drei negative echte PowerShell-Läufe (falscher gepinnter Hash, falsche Bytezahl, ähnlich benannter `my-cookie/session.json`-Pfad) schlugen alle vor ISO-Code fehl.

Synthetische JS-Tests: `runtime/node/node.exe scripts/obs-pilot/test/normalize-transfer-manifests.test.js` → 10 Fälle werden nach dem letzten Patch ausgeführt; Ergebnis im finalen Rapport wird nach erneuter Prüfung erfasst. Case-/Hash-/Byte-Angriff und lookalike secret path sind enthalten.

### OBS-Datei: lokaler Consumerbeleg

Lokale `obs64.exe`-Metadaten: 32.1.0, 5.404.944 Bytes, SHA-256 `dda672742960c9e036b06675854e36ebced0f86656a6cfa5a50eea0df5c9c2e0`; dies stimmt mit `source.mainExecutableSha256` des OBS-Inventars. Begrenzte ASCII-Stringsuche im Binary fand `OBSPublicRSAKey.pem`, `Could not find OBS public key file!`, `Could not read OBS public key file!` sowie öffentliche Key-Headertexte. Das belegt den Consumer in der Version, ohne PEM-Body oder Schlüsselwerte auszugeben. Die PEM-Datei selbst: 814 Bytes, SHA-256 `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2`, erste Zeile `-----BEGIN PUBLIC KEY-----`.

Kein lokales Vendor-Installationsmanifest oder README mit Redistributionbedingungen gefunden; gefundene Text-/JSON-/HTML-Dateien waren keine Installationsdokumentation. Das belegt Consumer, aber nicht Redistributionlizenz. `.pem`-Ausnahme nicht implementiert; OBS-Mapping bleibt bis Policyentscheidung durch den Helper geblockt.

### Grenzen

Der Helper wurde nur mit `-ValidateManifestOnly` auf synthetischem Temp-Payload ausgeführt. Kein COM/IMAPI, 7-Zip, Produktpayload, Staging, ISO, Netzwerk, Registry oder VM. Das ist ein echter PowerShell-Validatorlauf, jedoch keine ISO-Ausführung. Sourcemanifeste blieben unverändert.
## Umsetzung der Cookie-Ausnahmen und Helper-Validatorbeleg — 2026-10-07

- `scripts/obs-pilot/transfer-path-exceptions.json` enthält genau sieben trusted Zielpfade, jeweils exakte Bytes, SHA-256 und Reason. Alle sieben stammen aus `cookie@0.7.2` bzw. `engine.io@6.6.9`. Keine `.pem`-Datei steht darin.
- `build-transfer-iso.ps1` lädt die versionierte Policy mit exakten JSON-Keys/Typen und case-sensitive Pfadschlüsseln. Die Pfadausnahme kann nur die sensitive-segment-Prüfung umgehen. Containment, Reparse, versteckt/system, Dateibytes, berechneter Datei-SHA und Credentialtextscan bleiben aktiv; ein zweiter Policyvergleich nach echter Hashprüfung bindet die Ausnahme an die tatsächlichen Bytes.
- `-ValidateManifestOnly` führt echten PowerShell-Parser, Helperpfadregeln und Payloaddatei-/Hash-/Credentialvalidierung aus, gibt danach vor Payloadtreeinventur/COM/ISO zurück. Es wurde im Temp-Verzeichnis mit genau sieben per Sourcehash geprüften Fixtures ausgeführt: Status `manifest-validation-only-passed`, 7 Dateien / 29.721 Bytes, `isoCreated=false`, Exit 0. Outputordner blieb leer und der Tempbaum wurde entfernt.
- Drei negative PowerShell-Repros: manifestseitig falscher Hash, falsche Bytes und `pilot/app/node_modules/my-cookie/session.json` ohne Policyeintrag. Alle schlugen fail-closed vor ISO-Code fehl.
- JS-Normalizer verwendet dieselbe versionierte Policy nur für exakte Zielpfade und gepinnte Bytes/Hashes. Synthetische Suite: **10/10 PASS**, darunter geänderte Allowlist-Metadaten, Sourcehashdrift und lookalike session path. Reparse-Test: echter Symlink und Ablehnung.
- OBS-`OBSPublicRSAKey.pem`-Consumer lokal bestätigt: `obs64.exe` Version/ProductVersion 32.1.0; 5.404.944 Bytes; SHA-256 `dda672742960c9e036b06675854e36ebced0f86656a6cfa5a50eea0df5c9c2e0`. Begrenzte Strings-only Suche fand `OBSPublicRSAKey.pem`, `Could not find OBS public key file!`, `Could not read OBS public key file!` und öffentliche Key-Headerlabels. Keymaterial nicht angezeigt. Datei ist 814 Bytes, SHA `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2`, Header `-----BEGIN PUBLIC KEY-----`.
- `.pem` bleibt im Helper gesperrt. Consumer ist bekannt, aber redistribution/licensing provenance wurde lokal nicht gefunden. Gesamt-OBS-/Sidekick-Interop bleibt deshalb bis gesonderter PEM-Entscheidung blockiert.

Keine Sourcemanifeste geändert, keine Policy zur PEM-Ausnahme, kein ISO, COM, 7-Zip, Produktstaging, Payloadkopie, Netzwerk, Registry oder VM. Kein Commit erstellt. Alle synthetischen Testdaten ausschließlich in eindeutigen Tempordnern und anschließend entfernt.
## Öffentliche-Key-Provenienz: offizielle OBS-Primärquellen — 2026-10-07

### Quellenbelege

1. Offizieller OBS-Quelltag `32.1.0`, `README.rst` Zeilen 14–21: https://raw.githubusercontent.com/obsproject/obs-studio/32.1.0/README.rst — OBS sagt, das Produkt werde unter GNU GPL Version 2 oder später verteilt und verweist auf das begleitende `COPYING`.
2. Offizieller OBS-Quelltag `32.1.0`, `COPYING` Zeilen 68–76 und 117–149: https://raw.githubusercontent.com/obsproject/obs-studio/32.1.0/COPYING — GPLv2 gestattet Kopien des Programms/Quellcodes bei erhaltener Lizenz-/Copyright-/Warranty-Notiz; für Object-/Executable-Weitergabe gelten die Sourcecode-/Written-Offer-Anforderungen in §3. GPL erlaubt damit OBS-Programmweitergabe grundsätzlich unter Bedingungen, belegt aber allein nicht die Lizenz/Provenienz jeder individuellen Keydatei.
3. Offizielle OBS-Windowsinstallationsseite https://obsproject.com/kb/windows-installation: Zeilen 33–41 führen die offiziellen Download-/GitHub-Releases und erwähnen direkt verteilte `.zip`-Installationsmethoden samt Hashprüfung; Zeilen 56–58 verweisen auf Quellbuild-Anweisungen.
4. Offizielle Tagbaumansicht https://github.com/obsproject/obs-studio/tree/32.1.0 zeigt in der Quellwurzel `additional_install_files/` und weitere Quellverzeichnisse; README-Eintrag weist auf `COPYING`.

### Keydatei und Consumer

- Der zuvor lokal geprüfte OBS32.1.0-Key bleibt unverändert: `data/obs-studio/OBSPublicRSAKey.pem`, 814 Bytes, SHA-256 `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2`; nur Headerklasse `-----BEGIN PUBLIC KEY-----` geprüft.
- Der lokale passende `obs64.exe` (32.1.0, SHA-256 `dda672742960c9e036b06675854e36ebced0f86656a6cfa5a50eea0df5c9c2e0`) enthält den exakten Dateinamen und die Such-/Lesefehlertexte. Das ist ein lokaler Consumerbeleg, kein vom offiziellen Quelltag angezeigter Codepfad.
- Die offizielle Repository-/Raw-Ansicht des konkreten `UI/data/OBSPublicRSAKey.pem` und passender `UI/CMakeLists.txt` ließ sich in dieser Websitzung nicht laden (GitHub cache miss/robots; GitHub API ebenfalls unerreichbar). Daher kann ich für 32.1.0 keinen verifizierten Quellzeilen- oder CMake-Installbeleg angeben. Installationsziel im OBS Windows-Baum ist durch das lokale Inventar belegt, Source-Origin/Installregel bleiben nicht vollständig verknüpft.
- Keine Vendor-Installationsdokumentation benennt die Datei oder ihren gesonderten Copyright-/Lizenzstatus. Allgemeine OBS-GPL-Aussage ist kein spezifischer Beleg, dass die Keydatei als einzelne Datei separat redistribuiert werden darf. Den Keyinhalt habe ich nicht ausgelesen/ausgegeben.

### Bewertung

Der lokale Consumer ist bestätigt. Die allgemeine offizielle OBS GPLv2-or-later Lizenz und Windows-Zip-Installationsform sind bestätigt. Die konkrete GPL-Deckung/Provenienz der individuellen Public-Key-Datei, ihre Einordnung als Programmbestandteil in dem zugehörigen offiziellen Windows-Paket und die exakte 32.1.0 Installregel sind mit verfügbaren Primärquellen nicht hinreichend verbunden. Die globale `.pem`-Sperre bleibt daher aktiv; keine Ausnahme oder Weitergabefreigabe abgeleitet.

### Nachprüfbefehl für den PS-Validator

Der positive `-ValidateManifestOnly`-Lauf wurde mit einem zufälligen Tempverzeichnis ausgeführt: Die sieben geprüften Dateien wurden aus den sieben Policyquellen temporär in ihre relativen `pilot/...` Payloadpfade kopiert, `transfer-manifest.json` aus genau `{schemaVersion:1,files:[{path,bytes,sha256}]}` geschrieben und danach mit PowerShell 7 wie folgt geprüft:

```powershell
pwsh -NoProfile -File scripts/obs-pilot/build-transfer-iso.ps1 `
  -PayloadRoot <TEMP>\payload `
  -ManifestPath <TEMP>\transfer-manifest.json `
  -OutputDirectory <TEMP>\out `
  -ValidateManifestOnly
```

Erwartung: `status=manifest-validation-only-passed`, `payloadFileCount=7`, `payloadBytes=29721`, `isoCreated=false`, Exit 0; `<TEMP>\out` bleibt leer. Das Skript soll aus einem bereits vorhandenen, zufälligen `%TEMP%\ltth-interop-final-<GUID>` aufgerufen werden; Tempdateien nach Prüfung entfernen. Keine Fixture-Payload im Repo. Negative `hash tamper`, `byte tamper` und `my-cookie/session.json`-Cases wurden ebenfalls mit demselben PS-Aufruf ausgeführt und müssen ungleich Exit 0 liefern.

Output-Ownership-Regressionslauf nach der PS-Helperänderung: `pwsh -NoProfile -File scripts/obs-pilot/test/build-transfer-iso-ownership.test.ps1` — PASS collision (bestehender Sentinel unverändert; unowned cleanup verweigert), PASS write failure (owned partial gelöscht), PASS temp cleanup (isolierter Test-Temp entfernt).

Diese Prüfungen erstellen keine ISO. Die Policy erlaubt nur die sieben Cookie-Zielpfade; OBS-PEM bleibt gesperrt. Source-Manifeste unverändert, kein Commit.
## Zweistufiger Folgeauftrag: OBS-Primärquellen und unabhängiges PowerShell-Harness — 2026-10-07

### (1) Offizielle Key-/Installregel-Quellen

Es wurden genau zwei begrenzte Sätze offizieller GitHub-Ansichten geprüft: Blob/Blame für `UI/data/OBSPublicRSAKey.pem` und `UI/CMakeLists.txt`, danach GitHub Contents API für dieselben Dateien/den UI-Baum. Blob/Blame endeten mit `Cache miss`; die Contents-API war durch das Recherchetool nicht zugänglich. Keine weiteren Wiederholungen oder nicht offiziellen Mirrors.

Damit bleibt für Keydatei und die exakte Source-Installregel kein upstream Zeilenbeleg verfügbar. Offizielle, erreichbare Primärbelege für die allgemeine Produktlizenz/-distribution:

- OBS 32.1.0 `README.rst`, Zeilen 14–21, https://raw.githubusercontent.com/obsproject/obs-studio/32.1.0/README.rst: GPLv2-or-later, verweist auf `COPYING`.
- OBS 32.1.0 `COPYING`, §§1/3, https://raw.githubusercontent.com/obsproject/obs-studio/32.1.0/COPYING: erlaubt Programmkopien unter Einhaltung von Copyright-/Lizenzhinweisen; Object-/Executableweitergabe hat Sourcecode-/Offerbedingungen.
- Offizielle Windows-Installationsseite https://obsproject.com/kb/windows-installation: offizielle Release- und `.zip`-Installwege.

Das sagt nicht automatisch aus, dass genau diese einzelne PEM-Datei separat redistribuierbar ist. Lokaler Binary-Consumerbeleg und lokale Dateiheader waren bereits zuvor dokumentiert. Keine Keybytes gelesen/ausgegeben. `.pem` bleibt gesperrt, keine Ausnahme.

### (2) Wiederholbares tatsächliches Helper-Validator-Harness

Neues Skript `scripts/obs-pilot/test/validate-manifest-only.test.ps1`; unabhängiger Einzelbefehl:

```powershell
pwsh -NoProfile -File scripts/obs-pilot/test/validate-manifest-only.test.ps1
```

Harness erzeugt nur eine zufällige `%TEMP%\ltth-manifest-validator-test-<GUID>` Wurzel. Positivfall kopiert dort genau die sieben sourcehash-geprüften Cookie-/Engine.IO-Bibliotheksdateien in das synthetische Payloadlayout. Es schreibt ein synthetisches Helpermanifest und startet den echten `build-transfer-iso.ps1 -ValidateManifestOnly`. Danach folgen drei echte negative Helperaufrufe (gepinnter SHA manipuliert, Bytewert manipuliert, `my-cookie/session.json` ohne Ausnahme). Jeder Fall prüft Exitcode und leeren Outputordner; positiver Fall prüft `manifest-validation-only-passed`, 7 Dateien, 29.721 Bytes und `isoCreated=false`. Ein `finally` räumt Temp auf und ein Abschlussassert prüft, dass die GUID-Wurzel nicht mehr existiert.

Aktueller Lauf: positiver Fall Exit 0; drei negative Fälle jeweils Exit 1 mit erwartetem Grund; `temp-cleanup` PASS; **4/4 validator cases passed**, kein ISO-/COM-Pfad betreten. Keine Fixtures im Repo.

Der separate Output-Ownership-Test nach Helperänderung besteht ebenfalls weiterhin: `pwsh -NoProfile -File scripts/obs-pilot/test/build-transfer-iso-ownership.test.ps1` — drei PASS (CreateNew collision/Sentinel, owned partial write cleanup, temp cleanup).

Keine Source-/Transfermanifeste, PEM-Policy, Quellpayload, Registry oder VM geändert. Kein Download, Install, ISO, COM, Staging, Produktcopy oder Commit.
## Source-Gate-Voraudit — read-only, 2026-10-07

### Methode und Grenze

Die aktuelle Manifestmenge (2.107 OBS + 544 effektive Sidekick-Einträge; 2.651 insgesamt) wurde direkt an Quellpfaden gelesen und gehasht. Die Kriterien aus `build-transfer-iso.ps1` wurden auf Source-Metadaten angewandt; Textdateien wurden streamweise gegen dieselben sieben Credential-Regexe geprüft. Es wurden nur relative Pfade, Regelklassen, Größen/Hashes und Gruppenzählungen protokolliert; kein erkannter Treffertext oder Secretwert wurde ausgegeben. Kein Payloadbaum wurde kopiert/gestaged.

Dies ist **kein tatsächlicher PowerShell-Helperlauf für die 2.651 Payloaddateien**: `-ValidateManifestOnly` verlangt bereits gemappte Payloaddateien; diese wurden hier absichtlich nicht erstellt. Der reale PS-Harnessnachweis gilt weiter nur für die sieben eng gepinnten Cookie-Bibliotheksdateien. Das Voraudit ist eine read-only Anwendung derselben aus dem Helper übernommenen Gate-Regeln und ein Planungsbefund.

### Summen

- 2.651 Dateien / 490.389.602 Bytes; unter Helpergrenze 10.000 Dateien, 2 GiB Gesamt inkl. Manifest und 2 GiB je Datei.
- Source-Hashdrift: 0; Hidden/Systemattribute: 0; Reparse-Ketten: 0; Textdateien über 32 MiB: 0.
- Unzulässige Pfadendung: 1 — `obs/data/obs-studio/OBSPublicRSAKey.pem` (814 Bytes, SHA `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2`), `.pem`; erwarteter, bereits separat behandelter Public-Key-Policyblocker.
- Sensible Pfadsegmente: 0 außerhalb der genau sieben gepinnten Cookie-/Engine.IO-Ausnahmen. Diese Ausnahme greift nicht für andere `cookie`-ähnliche Pfade.
- Credentialtextregex: 177 Datei-Treffer, alle Regel 1 (bezeichnerförmiges Wort aus `password/passwd/client-secret/api-key/access-token/refresh-token/stream-key/authorization/cookie/sessionid/msToken`, gefolgt von `:`/`=` und quoted Text >=7 Zeichen). 176 Trefferdateien liegen ausschließlich in OBS-Locale-Dateien unter `obs/data/**/locale/*.ini` (u.a. OBS Studio, Plugins und obs-websocket); 1 liegt in `pilot/app/node_modules/ws/lib/websocket.js`, gepinnte `ws@8.21.0` Runtimequelle für Engine.IO/Socket.IO (37.371 Bytes, SHA `48fdb0f54c1f8ce580d3cfa2908fe7d96fe18f06f9d82306950441cb09b5db26`). Keine Treffer aus `profiles/`, Userdaten, Logs oder Datenbanken; diese gehören nicht zur effektiven Sidekickliste.
- Regel 2 (Bearer-form), Regel 3 (Private-Key-Marker), Regel 4 (AWS), Regel 5 (Google API), Regel 6 (GitHub token shape), Regel 7 (JWT shape): 0 Datei-Treffer.
- Vier Host/Testquellen bleiben bereits explizit von Gasttransfer ausgeschlossen und wurden nicht als Payload-Content-Gate geprüft.

### Bewertung

Die 176 Locale-Dateien sind Übersetzungsressourcen, keine Nutzerprofile; Regel-1-Treffer sind deshalb sehr wahrscheinlich statische Übersetzungs-/Beispielstrings, aber der Quelltext wurde nicht ausgegeben oder manuell semantisch freigegeben. Die `ws`-Datei ist Distributioncode, kein persistenter Sessionstore; ihr Regex-Treffer bleibt trotzdem ungeklärt. Der tatsächliche Helper würde alle betroffenen Dateien bei Textscan ablehnen. Diese Treffer sind konkrete spätere Stageblocker und keine Erlaubnis, Credentialscanner breit zu deaktivieren. Die engste nächste Arbeit wäre eine begründete, testbare Scannerpolicyentscheidung (z.B. nur dokumentierte Locale-/Paketdatei-Provenienz oder spezifische statische Übersetzungseinträge), ohne Trefferinhalt zu loggen; sie bedarf Owner/CEO-Freigabe. Bis dahin keine Änderung/Exception.

Keine Quellen, Manifeste, Helperpolicy oder Tests geändert; kein Copy, Staging, ISO, Download, Start, VM oder Commit. `.pem` bleibt gesperrt. CEO-Nachprüfung des isolierten 4-Fälle-Harness läuft separat.

## Folgeauftrag: semantische Klassifikation der Regel-1-Treffer (2026-10-07)

- Korrektur des vorherigen Absatzes: `obs/` und `pilot/` sind absichtlich normalisierte Manifest-Ziele, keine Quellroots. Die ursprünglichen Dateien liegen im OBS-Installationsroot `C:\Program Files\obs-studio` beziehungsweise im Sidekick-Repository. Das Fehlen der Zielordner war kein Quellblocker.
- Regel 1 wurde read-only auf den manifestierten Originalquellen erneut angewendet. Für jeden OBS-Locale-Kandidaten wurden Reparse-Kette, Bytes und SHA-256 gegen `obs-portable-transfer-manifest.json` geprüft; für `app/node_modules/ws/lib/websocket.js` erfolgte derselbe Abgleich gegen das Sidekickmanifest. Ergebnis: 0 Hashdrift, 0 Reparse, 0 Überschreitungen des 32-MiB-Textlimits.
- Aktuelle Zählung: 176 OBS-Locale-Dateien mit mindestens einem Regel-1-Treffer, 258 Trefferzeilen; `ws/lib/websocket.js`: 0 Regel-1-Zeilen. Der Sidekickmanifestbeleg für `ws@8.21.0` (37.371 Bytes, SHA `48fdb0f54c1f8ce580d3cfa2908fe7d96fe18f06f9d82306950441cb09b5db26`) bleibt gültig. Die frühere Angabe 177 bezeichnete betroffene Dateien aus einem vorherigen Scan; sie ist kein aktueller Zeilenzähler und der einzelne `ws`-Treffer ließ sich nicht reproduzieren.
- Die 258 OBS-Zeilen sind sämtlich INI-Zuweisungen mit identifierförmigem Schlüssel und quotiertem Ressourcentext; 164 Schlüssel fallen syntaktisch in UI-/Ressourcen-Namensräume. Die übrigen 94 Zeilen verteilen sich auf exakt zwei Schlüsselgruppen: `OBSWebSocket.Settings.Password` in 50 obs-websocket Locale-Dateien (je eine Zeile; erste geprüfte Stelle `obs/data/obs-plugins/obs-websocket/locale/af-ZA.ini:6`) und `Password` in 44 rtmp-services Locale-Dateien (je eine Zeile; erste geprüfte Stelle `obs/data/obs-plugins/rtmp-services/locale/af-ZA.ini:8`). Alle Treffer liegen in `.ini`-Dateien unter 25 Plugin-Locale-Verzeichnissen (151 Zeilen) oder OBS-Core-Locale (107 Zeilen). Keine nichtstandardmäßigen Schlüssel-/Wertformen. Treffertexte und Werte wurden nicht ausgegeben.
- Upstream-Consumerbelege: OBS-Moduldokumentation erklärt die Standard-INI-Lokalisierung und `obs_module_text()` ([`plugins.rst`, Abschnitt „Localization“](https://github.com/obsproject/obs-studio/blob/master/docs/sphinx/plugins.rst#L538-L542)); Default-Loader und Lookup sind in [`obs-module.h`, Macro/Exports](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-module.h#L810-L861). obs-websocket aktiviert den Loader in [`src/obs-websocket.cpp:28-37`](https://github.com/obsproject/obs-websocket/blob/master/src/obs-websocket.cpp#L28-L37); das UI-Feld referenziert die passende Label-ID in [`SettingsDialog.ui:170-184`](https://github.com/obsproject/obs-websocket/blob/master/src/forms/SettingsDialog.ui#L170-L184), die Codebehind lädt/speichert den UI-Wert in [`SettingsDialog.cpp:114-131,145-191`](https://github.com/obsproject/obs-websocket/blob/master/src/forms/SettingsDialog.cpp#L114-L131). RTMP-Services führt das `Password`-Label in [`data/locale/en-US.ini:8-11`](https://github.com/obsproject/obs-studio/blob/master/plugins/rtmp-services/data/locale/en-US.ini#L8-L11); OBS-Frontend bindet die lokalisierte Beschriftung an das Auth-Passwortfeld in [`OBSBasicSettings_Stream.cpp:402-413`](https://github.com/obsproject/obs-studio/blob/master/frontend/settings/OBSBasicSettings_Stream.cpp#L402-L413). Beide Schlüsselgruppen sind statische UI-Labels in Locale-Katalogen; sie sind keine gespeicherten Passwortwerte.
- Enge Policyoption bereitgestellt, noch **inaktiv**: `scripts/obs-pilot/transfer-rule1-exception-candidate.json` pinnt exakt 176 betroffene OBS-Zielpfade mit Bytes, SHA-256, Quellversion, erkannter Schlüsselgruppe und den genauen Trefferzeilennummern (258 insgesamt). Vorschlag lässt ausschließlich Credential-Regel 1 für exakt passende, bereits nach Reparse/Bytes/SHA geprüfte Dateien aus; Regeln 2–7, alle Pfad-/Extension-/Hidden-/System-/Limits-/Manifestgates bleiben aktiv. Der Helper und Normalizer laden diese Kandidatendatei nicht; keine Ausnahme ist wirksam. `ws` ist explizit kein Kandidat.
- Klassifikationsentscheidung: alle 258 Zeilen sind als OBS-Übersetzungsressourcen/UI-Labels belegt. Regeln 2–7 hatten im gezielten Scan 0 Treffer. Keine Policyaktivierung oder Änderung an Helper, aktiver Manifestpolicy oder Tests vorgenommen; PEM-Sperre und alle übrigen Gates bleiben unverändert.
- UTF-8-Prüfung der Auditdateien: strict decode erfolgreich, 0 U+FFFD-Ersatzzeichen, 0 Steuerzeichen (außer Zeilenumbrüchen), 0 NUL-Bytes. Keine Encodingkorrektur.
- Kein Payloadcopy, Staging, ISO, Download, Start, VM oder Commit. Keine Trefferwerte/Secrets wurden ausgegeben.

## Folgeauftrag: freigegebene exakte Regel-1-Policy implementiert (2026-10-07)

- Die inaktive Option blieb als Reviewartefakt erhalten. Zusätzlich wurde aktive, separate Policyquelle `scripts/obs-pilot/transfer-rule1-exceptions.obs32.1.0.json` angelegt: genau 176 gepinnte OBS-Locale-Zielpfade samt Quellmanifest-SHA, OBS-Version, Klassifikation und Trefferzeilen.
- `build-transfer-iso.ps1` lädt ausschließlich diese fest benannte Policy mit hardcodiertem SHA-256-Pin. Loader prüft striktes UTF-8/JSON, exakte Properties, Version, Source-Manifest-Pin, exakt 176 Einträge, Pfadformat, Duplikate, Byte-/SHA-Form und Trefferzeilenschema. Keine Caller-Ausnahmen, Prefix-/Glob-Freigabe oder `ws`-Eintrag.
- Für ein passendes Localeziel erfolgt der Regel-1-Skip erst nach bestehender Pfadsicherheit, Reparse-Kettenprüfung, Hidden/Systemprüfung, tatsächlicher Bytezahl und tatsächlichem SHA. Nur Regexindex 0 wird übersprungen; Credentialregeln 2–7 laufen unverändert.
- PowerShell Harness `scripts/obs-pilot/test/validate-locale-rule1-policy.test.ps1`: **12/12 Validatorfälle PASS**, zusätzlich Vollständigkeitsabgleich aller 176 installierten Quellfiles (5.849.134 Bytes) gegen Quellmanifest/Policy mit Hash- und Reparseprüfung. Fälle: repräsentative obs-websocket-Locale positiv mit `isoCreated=false`; Inhaltsänderung trotz aktualisiertem Payloadmanifest; falscher Payload-SHA; falsche Bytezahl; untrusted Locale-Lookalike; Regeln 2–7 jeweils negativ; andere Credentialregel am exakt gepinnten Ziel mit re-gehashtem Payload weiterhin abgewiesen; Tempcleanup.
- Bestehender tatsächlicher PowerShell-Harness: `validate-manifest-only.test.ps1` **4/4 PASS**. Output-Ownership-Regression: `build-transfer-iso-ownership.test.ps1` **3 PASS**. Kein ISO-/COM-Pfad betreten.
- Scope bleibt Quelle/Validatorpolicy, keine Transferfreigabe: PEM-Extensionblocker bleibt, kein Vollpayload, Staging, ISO, VM, Download oder Start. Kein Commit.
- Quellen mit Zeilenbelegen: OBS-Lokalisierungsvertrag in `docs/sphinx/plugins.rst` und `libobs/obs-module.h`; obs-websocket Consumer in `src/obs-websocket.cpp` und `src/forms/SettingsDialog.cpp`; RTMP UI-Consumer in `frontend/settings/OBSBasicSettings_Stream.cpp`. Direkte URLs sind im vorherigen Abschnitt. Lokale Trefferzeilennummern je Datei stehen im aktiven Policymanifest `hitLines`; Trefferwerte bleiben ausgelassen.
