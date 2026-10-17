AKTUELLER AUFTRAG: OBS public-key internal-test exception implementation

# OBS public key: implementierte Ausnahme für interne Tests — 2026-10-07

## Ergebnis

Die CEO-freigegebene, separate interne Testausnahme ist implementiert und aktiv. Sie gilt ausschließlich für `obs/data/obs-studio/OBSPublicRSAKey.pem` mit exakt 814 Bytes und SHA-256 `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2`. Sie gestattet keine Veröffentlichung, Produktverteilung oder externe Redistribution.

Die Policy liegt in `scripts/obs-pilot/transfer-public-key-exception.obs32.1.0.json`, hat SHA-256 `104189d06ecc8246bb774626181ba5eb7f9e9c2bbbcec6ac34c44273274fecb2` und ist mit diesem Pin in JavaScript und PowerShell hart gebunden. Beide Prüfer binden sie außerdem an den OBS-32.1.0-Quellmanifest-SHA `41e4bed8eb2fe413dfafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa`, die OBS-Version und den gepinnten OBS-Executable-Hash. Es gibt genau einen Policy-Eintrag. Der Normalizer akzeptiert den Schlüssel nur nach Prüfung der tatsächlichen Quelldatei und Parserklassifikation. Die öffentliche Helper-Manifest-API bietet keinen allgemeinen PEM-Bypass.

## Quelle und Lizenzgrenze

| Merkmal | Verifizierter Befund |
|---|---|
| Installationsquelle | `C:\Program Files\obs-studio\data\obs-studio\OBSPublicRSAKey.pem` |
| Einziges Ziel | `obs/data/obs-studio/OBSPublicRSAKey.pem` |
| Länge und SHA-256 | 814 Bytes; `8cb9323b3e07c62c5298842aac70bfba50613f0319faa47369c99f176efd6ab2` |
| PEM | Genau ein vollständiger `PUBLIC KEY`-Block; kein Private-Key-Marker |
| Parser | Node `crypto.createPublicKey` und PowerShell/.NET `RSA.ImportFromPem`: public RSA, 4096 Bit |
| Policy-Pin | `104189d06ecc8246bb774626181ba5eb7f9e9c2bbbcec6ac34c44273274fecb2` |
| Quellmanifest-Pin | `41e4bed8eb2fe413dfafd032a2708c51c1a0a7488741bd4716511ccd2728f8fa` |

Die PEM-Bytes, Base64-Zeilen und DER-Ausgabe wurden nicht protokolliert. Der OBS-Manifest-Eintrag `data/obs-studio/license/gplv2.txt` bleibt erhalten und wird nicht von der neuen Ausnahme berührt. Sein gepinnter Inhalt entspricht weiterhin dem lokalen Inventar. Daraus folgt keine externe Lizenz- oder Weitergabefreigabe.

## Durchsetzung

Der PowerShell-Helper prüft für den Ausnahmefall weiterhin Root/Containment, Reparse-Punkte, Hidden/System-Attribute, tatsächliche Bytes und SHA-256, vollständige PEM-Struktur, öffentlichen RSA-4096-Key sowie Credential-Regeln 2–7. Die Policyprüfung wird vor dem engen Extension-Entscheid abgeschlossen. Andere PEM-Pfade, Case-Varianten, Lookalikes und Caller-supplied Manifestobjekte ohne verifizierte Quelldatei bleiben fail-closed.

Der JavaScript-Normalizer verwendet denselben Policy- und Quellmanifest-Pin und denselben exakten Zielpfad. Der öffentliche Helper-Manifest-Validator lehnt PEM ohne das interne, nur nach Quellprüfung aufgebaute Verifikationsmerkmal ab. Die vorhandenen Cookie- und Locale-Policies wurden nicht verändert.

## Verifikation

| Prüfung | Ergebnis |
|---|---|
| `runtime/node/node.exe --check scripts/obs-pilot/normalize-transfer-manifests.js` | PASS, Exit 0 |
| `runtime/node/node.exe scripts/obs-pilot/test/normalize-transfer-manifests.test.js` | 14/14 PASS, Exit 0 |
| `runtime/node/node.exe scripts/obs-pilot/normalize-transfer-manifests.js` | Read-only; 2,651 Dateien, 490,389,602 Bytes; kanonischer SHA-256 `f9750454f55466d648197ea74c536d716cebde8491b3a1d35e5109993413ed5b`; enthält das exakte PEM-Ziel; Exit 0 |
| `pwsh -NoProfile -File scripts/obs-pilot/test/validate-public-key-exception.test.ps1` | 11/11 PASS, Exit 0; echter PowerShell-Validator, isolierte Ein-Datei-Fixtures und Tempcleanup |
| `pwsh -NoProfile -File scripts/obs-pilot/test/validate-manifest-only.test.ps1` | 6/6 PASS, Exit 0; same-line credential-shaped text remains blocked, cross-line `ws` authorization code is accepted |
| `pwsh -NoProfile -File scripts/obs-pilot/test/validate-full-normalized-manifest-only.ps1` | Exit 0; full 2,651-file/490,389,602-byte temp copy; helper `manifest-validation-only-passed`, `isoCreated=false`; empty output; verified cleanup |
| `pwsh -NoProfile -File scripts/obs-pilot/test/validate-locale-rule1-policy.test.ps1` | 12/12 PASS, Exit 0 |
| `pwsh -NoProfile -File scripts/obs-pilot/test/build-transfer-iso-ownership.test.ps1` | 3/3 PASS, Exit 0 |

Die elf PowerShell-Fälle umfassen den gültigen öffentlichen Schlüssel sowie Hash-/Byteänderung, Lookalike, Pfad-Casing, Hidden/System, den als `reparse-target-placeholder` benannten Fall, synthetischen Private Key, zusätzlichen PEM-Block, schwachen RSA-Schlüssel und Nicht-RSA. Der benannte Reparse-Fall wird nicht als tatsächlicher Reparse-Rejection-Beleg gezählt. Der vollständige Testlauf prüfte die realen Quell- und Kopierpfadketten auf Reparse-Punkte und fand keine; das belegt nur diese konkreten Pfade. Die JS-Regression enthält einen Symlink-Rejection-Zweig, der bei nicht möglicher Link-Erstellung überspringen kann. Es wird daher kein plattformunabhängiger Symlink-Rejection-PASS behauptet. Synthetische Schlüssel wurden nur für isolierte Tests erzeugt und nicht ausgegeben.

Der erste Vollhelperlauf fand einen Credential-Regel-1-False-Positive in `pilot/app/node_modules/ws/lib/websocket.js`: `\s*` überbrückte einen Zeilenumbruch zwischen dem Feld `authorization` und einem sechs Zeichen langen `'Basic '`-Codefragment. Die Regel nutzt jetzt `[ \t]*`, damit nur gleichzeilige Zuweisungen erkannt werden. Die 6/6-Regression belegt, dass derselbe harmlose Cross-line-Code passiert und ein gleichzeiliger credential-artiger Wert weiter abgelehnt wird. Danach bestand der vollständige Helperlauf.

Der vollständige 2.651-Dateien-Payload wurde nur als einmalige isolierte GUID-Temp-Kopie für `-ValidateManifestOnly` erstellt und nach verifizierter Temp-Root-Zugehörigkeit entfernt. Es wurde nichts ins Repository kopiert oder für ISO/Gasttransfer gestaged. Es gab keinen ISO-/COM-/7-Zip-Lauf, Download, VM-Zugriff oder VM-Start. Ein tatsächlicher Volume-Disk-full-Fall wurde nicht erzeugt; die gemeinsame `finally`-Cleanup-Route lief nach dem ersten Validatorfehler und nach dem erfolgreichen Lauf. Diese source-only Prüfung ist keine OBS-Laufzeitabnahme; die praktische Matrix bleibt 0/104.

## Verbleibende Grenzen

- Externe Redistribution und Release bleiben gesperrt und sind durch diese interne Testausnahme nicht abgedeckt.
- Vollständiger Payload, ISO/COM/7-Zip-Readback, VM-Gast-Portabilität/VC++-Runtime und 104 praktische OBS-Fälle wurden nicht geprüft.
- VM-Start bleibt separat nutzergesteuert.

## Evidenz

- Policy: `scripts/obs-pilot/transfer-public-key-exception.obs32.1.0.json`
- Implementierung: `scripts/obs-pilot/normalize-transfer-manifests.js`, `scripts/obs-pilot/build-transfer-iso.ps1`
- Regressionen: `scripts/obs-pilot/test/normalize-transfer-manifests.test.js`, `scripts/obs-pilot/test/validate-public-key-exception.test.ps1`
- Gates: `docs/coordination/obs-transfer-remaining-gates.json`, `docs/coordination/obs-transfer-remaining-gates.md`
