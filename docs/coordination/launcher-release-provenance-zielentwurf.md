# Zielentwurf: nachweisbare Launcher-Releasekette

Status: Dokumentarischer Vorschlag, keine Implementierung/Freigabe. Basis aktueller Releaseworkflow und Go-Launcher; keine Builds, Netzwerk-, Signier- oder GitHub-Aktion ausgeführt.

## Ziel und unveränderlicher Vertrag

Ein Release darf ausschließlich den Launcher veröffentlichen, der aus dem exakt freigegebenen Source-SHA gebaut, anschließend signiert und danach per Hash eingefroren wurde. Eine vorhandene tracked launcher.exe ist kein Buildinput und keine Provenienz. GitHub und Website erhalten dieselben signierten Bytes. Hash/HTTPS sind keine kryptografisch signierte Publisher-Attestation.

## Phase 1: Quell- und Buildfreeze

1. Exakten 40-hex Git-Commit und Version festlegen; numerischer vX.Y.Z-Tag muss auf diesen Commit zeigen. main kann nach dem Freeze weiterziehen; Entscheidung nötig, ob die derzeitige tag==current-main-Regel bleibt.
2. Sauberes, isoliertes Checkout dieses Commits: keine Dirty-Hunks, keine zusätzlichen Go-Dateien, kein vorhandener Launcher als Quelle. Submodule-/LFS-Inputs, falls vorhanden, ebenfalls pinnen.
3. Buildinputs protokollieren: Git-Tree, app/root versions, build-src/go.mod/go.sum, vollständige aktive .GoFiles, eingebettete assets/**, GOOS/GOARCH/GOAMD64, CGO_ENABLED, Go-Toolchain, C-Compiler/SDK, Umgebungsallowlist und Buildflags. Modulechecksums prüfen; Dependencycache vorab pinnen, kein impliziter Toolchain-/Dependencyupgrade im Build.
4. Der gepflegte Build ist package-build aus build-src (`go build ... .`), kein lose benannter launcher-gui.go-only Build. CLI-/dev-/bootstrapper-Artefakte separat benennen und nicht als launcher.exe veröffentlichen.
5. Kandidatenflags: -trimpath, -buildvcs=true und bestehende GUI-Linkerflags -H windowsgui -s -w. CGO und Compiler nicht blind deaktivieren: systray/Windows-Abhängigkeiten sind gesondert zu prüfen. Ausgabe außerhalb des Sourcecheckouts, damit vcs.modified=false bleibt.
6. Zwei unabhängige unsigned Builds mit derselben gepinnten Umgebung erstellen. Byteidentischen SHA-256 verlangen oder Buildreproduzierbarkeit ausdrücklich als offene Freigabesperre dokumentieren. -trimpath allein garantiert wegen CGO/PE-Zeitfeldern keine Reproduzierbarkeit. Source-Dateizeiten, C-Compiler/SDK und Build-ID-Verhalten müssen geprüft werden, bevor spezielle Normalisierungsflags eingeführt werden.
7. `go version -m` muss erwarteten Modulpfad, Go-/Plattform-/Flagwerte sowie vcs.revision==Source-SHA und vcs.modified=false belegen. Fehlende VCS-Provenienz stoppt die Freigabe. VCS-Angaben sind Plausibilitätsbeleg, keine Signatur über Source und kein Ersatz für Buildprotokoll.
8. Gezielte Launcher-/Updater-/Public-Distribution-/Marker-Tests vor Freeze. Vorhandene historisch defekte Tests separat benennen; kein Greenclaim aus selektiven Tests. Unsigned Binärdatei, Bytes und SHA-256 immutable speichern.

## Phase 2: SimplySign — menschliches Gate

**Menschliches SimplySign-Login/OTP zwingend, wenn noch keine gültige autorisierte Sitzung besteht.** Der Nutzer meldet sich im SimplySign-Desktopfenster an und gibt den Code dort ein. Agent/CI darf weder OTP erfassen noch aus Logs lesen noch einen Login umgehen. Ein bereits autorisiertes gültiges Login braucht keine künstliche erneute OTP-Anforderung.

Vor Signierung zeigt der Agent Version, Source-SHA, unsigned Hash und Testgrenzen. Die Freigabe gilt für exakt diesen Kandidaten. Nicht auf fremdem Checkout rebuilden oder unsigned Bytes nach Freigabe austauschen.

Signierplatz mit SimplySign-KSP/SignTool und gepinntem Publisher-Zertifikat festlegen. Unsigned Original behalten, eine bytegleiche Arbeitskopie signieren. SHA-256 Authenticode-Digest und RFC3161-Zeitstempel mit SHA-256 verlangen; erlaubten Timestampdienst vorab festlegen. Kein Retry, der unbemerkt einen anderen Build signiert.

Nach Signierung: Authenticode-Status gültig, exakte erwartete Signeridentität/Thumbprint (mit kontrolliertem Zertifikatsrollover), Trustchain und nachgewiesener RFC3161-Zeitstempel prüfen. Zeitstempelzertifikat allein reicht nicht; SignTool-Verification muss die zeitgestützte Signaturvalidierung bestätigen. Aktuelles Zertifikat und Rollovers sind Nutzerentscheidungen. Signaturen/Zeitstempel verändern PE-Bytes; signed Hash muss deshalb vom unsigned Hash unterschieden werden.

Signierter SHA-256/Bytecount wird eingefroren. Keine Rebuilds/Versionpatches nach Signierung. Erneutes Signieren erzeugt möglicherweise andere Bytes und damit einen neuen Freeze.

## Phase 3: Nachweise und Veröffentlichung

Separater Provenienzbericht (neues Artefakt, nicht ungeprüfte Erweiterung bestehender Sidecars) enthält: Source-SHA/Tree, Version/Tag, Go-/C-Toolchain/SDK, GOOS/GOARCH/CGO/Flags, dependency/input hashes, Testbefehle/Ergebnisgrenzen, unsigned/signed SHA-256 und Bytes, Signer-/Timestampnachweis und Build-/Signierphase. Keine Secrets/OTP im Bericht. Metadaten allein sind nicht kryptografisch vertrauenswürdig; eine signierte Attestation wäre ein gesonderter Vertrag.

Das bestehende launcher-release.json behält zunächst seinen exakt validierten Siebenfeldervertrag. version/tag/commitSha stammen aus dem Sourcefreeze; bytes/sha256 ausschließlich aus der eingefrorenen SIGNIERTEN Datei. Runtime-ZIP/Sidecar separat mit derselben Sourcebasis prüfen; keine Vermischung unsigned und signed Assets.

CI-Option: Windowsbuilder liefert unsigned Kandidat+Nachweise; menschliche SimplySignphase liefert signierten Kandidat zurück; Publishjob nimmt nur diese freigegebenen Bytes. Alternative: autorisierter lokaler Builder/Signer liefert beide immutable Nachweise an CI. Keiner der Wege darf einfach die tracked launcher.exe als automatisch frisch behandeln.

Vor Upload und vor GitHub Release signed Hash/Bytes, Signatur/Signer/Timestamp und Manifestwerte erneut prüfen. Upload-Artifact-ID/Digest und Run-ID protokollieren; spätere Jobs aus demselben freigegebenen Run verwenden, nicht latest. GitHub Release exakt launcher.exe+launcher-release.json aus diesem Freeze; Website/downloads identische signed Bytes, kein zweites Build/Sign. Nach Veröffentlichung unauthentifizierten Readbackhash separat erst nach expliziter Publikationsfreigabe prüfen.

## Entscheidungen und Implementierungsrisiken

- Gepinnte Go-/CGO-/Compiler-/SDK-Version und reproduzierbare Builderumgebung fehlen noch.
- Signierplatz: menschlicher lokaler SimplySign-Schritt oder kontrollierter Runner; keine unattended OTP-Integration voraussetzen.
- Erwarteter Publisher/Thumbprint, Timestampdienst und Zertifikatsrollover müssen verbindlich festgelegt werden.
- Source/Versionreleasefreeze und Tag/main-Regel entscheiden; parallele Arbeit nach Freeze darf den Signierinput nicht ändern.
- CI-Artefaktübergabe/Provenienzformat als eigenen Schema-/Workflow-Scope designen. Strenge Installer akzeptieren keine zusätzlichen Sidecarfelder ohne abgestimmte Migration.
- Lokales bestehendes launcher.exe hat keinen eingebetteten vcs.revision-Nachweis; dessen Signatur/Hash allein schließt die zuvor erkannte Source-Abweichung nicht.
- Consumerseitige Publisherbindung/Manifestsignatur fehlt weiterhin; Producerprovenienz beseitigt nicht automatisch diese separate Transport-Vertrauensgrenze.

Nächster sicherer Implementierungsauftrag: isoliertes Build-Provenienzvalidator- und Fixturekonzept (kein Signieren/Publizieren), das stale tracked EXE, falschen Source-SHA, falschen Signer, fehlenden Timestamp, unsigned/signed Hashverwechslung und falschen Workflow-Run fail-closed ablehnt. Erst danach den Workflow konkret ändern.