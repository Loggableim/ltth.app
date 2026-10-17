# NSIS: vorgeschlagener lokaler Launcher-Übergabevertrag

CTO-Vorschlag, 08.10.2026. Lokale synthetische Implementierung; keine echten Releasewerte, Signierung, Builds oder Veröffentlichung dadurch freigegeben. CEO bestätigt die Einbindung in den bestehenden Installerauftrag.

## Eingaben und Vertrauenswurzel

- Explizites absolutes `LauncherPayloadDirectory`, eigener nichtproduktiver Handoffpfad. Kein stiller Rückgriff auf `build-src/launcher.exe` im Release-Modus.
- Payload enthält `launcher.exe`, `launcher-release.json`, `launcher-build-provenance.json`. Zusätzlich wird das bestehende data-only `publish-payload.manifest` aus dem geprüften Publisher-Handoff mitgegeben; der heutige öffentliche Drei-Dateien-Assetumfang muss dafür nicht verändert werden.
- Erwartete Version, Commit-SHA, Tag und Source-Run-ID kommen als verpflichtende unabhängige Releaseeingaben aus dem zuvor geprüften Handoff, nicht aus Payload-JSON als Default. Transfer-/Reviewherkunft muss dokumentiert sein. Ohne diese Herkunft bleibt ein lokaler Konsistenztest ein synthetischer Teilnachweis.
- Erwarteter Launcher-Signer bleibt `LAUNCHER_SIGNER_THUMBPRINT`. Der Setup-Signer darf davon getrennt sein und muss ebenfalls unabhängig vorgegeben werden; keine Gleichheitsannahme und kein Ableiten aus eingebetteter Signatur. Eine Änderung des heutigen Setup-Signer-Vertrags ist separat abzustimmen.
- Kein Candidate-Manifest muss neu erfunden werden: Source-Rebuild-/Candidateprüfung bleibt beim bestehenden `Test-LauncherReleaseHandoff`. NSIS konsumiert dessen exakt benannten finalen Payload. Ein neuer NSIS-Test darf nicht behaupten, selbst den Source-Rebuild ausgeführt zu haben.

## Prüf- und Kopierfolge

1. Release-Modus weist fehlende Eingaben, zusätzliche/nichtreguläre Dateien, Reparse-/Symlinkpfade, falsche Identität und Manifest-/Hash-/Größenabweichungen ab. Bestehende Payloadprüfer wiederverwenden, keine JSON-/Shellauswertung.
2. Launcher-Authenticode muss gültig sein, exakt dem extern erwarteten Launcher-Signer entsprechen und den festgelegten Timestampvertrag erfüllen. Mocksignaturen zählen nur in Tests.
3. Genau die geprüften EXE-Bytes in den eigenen Stagepfad kopieren. Hash/Bytezahl unmittelbar nach Kopie und vor Compileraufruf erneut mit dem geprüften Payload vergleichen. Kein Austausch des Quell-EXE im gemeinsamen Checkout.
4. NSIS muss ausschließlich diesen Stage-Launcher einbetten. Bindung zwischen Stagepfad und tatsächlichem NSIS-Input explizit testen; eine validierte Nebendatei genügt nicht.
5. Äußerer Setup-Signaturgate bleibt nach Signierung verpflichtend. Innerer Launcherproof und äußerer Setup-Authenticode sind getrennte Nachweise.

## Abschluss und Tests

Rein synthetische Positiv-/Negativfälle: korrekter Payload; falscher Version/Commit/Tag/Run/Signer; fehlendes Sidecar; zusätzliche Datei; Reparse-/Symlink; Hash-/Größenfehler; nach Kopie manipulierte Bytes; NSIS-Input zeigt versehentlich auf alten Checkoutlauncher; ungültige/fehlende Signatur/Timestamp. Windows PowerShell 5.1 und PowerShell 7 berücksichtigen.

Abschluss verlangt stabilen Patch, echte Source-/Stage-Inputbindung und unabhängige fokussierte Prüfung. Reale CI-Artifactherkunft, echte Signatur und tatsächlich erzeugter Installer mit eingebettetem Launcher bleiben gesonderte Releaseabnahmen. Manifest plus Payloadhash ist keine unabhängige Authentizitätswurzel.
