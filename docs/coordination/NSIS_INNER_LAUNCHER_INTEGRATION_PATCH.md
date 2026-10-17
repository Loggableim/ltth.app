# NSIS Inner Launcher Gate: nicht angewendeter Integrationspatch

Stand: 2026-10-08. Dieser Vorschlag setzt auf dem aktuellen dirty Arbeitsstand auf. Er ist hier nur abgelegt und wurde nicht auf Build-, NSIS- oder Stage-Dateien angewendet.

## Aufrufvertrag

`build-installer.bat` erhält den Payload-Pfad zusätzlich zu Modus und neuem Stage-Pfad. Erwartete Identitäten werden als verpflichtende, unabhängige Prozessumgebung vor dem Start bereitgestellt:

```text
build-installer.bat <release|developer> <new-stage> <publisher-payload>
```

Vor dem Aufruf müssen `LTTH_EXPECTED_VERSION`, `LTTH_EXPECTED_COMMIT_SHA`, `LTTH_EXPECTED_TAG`, `LTTH_EXPECTED_SOURCE_RUN_ID`, `LTTH_EXPECTED_PUBLISHER_RUN_ID`, `LTTH_EXPECTED_HANDOFF_COMMIT_SHA` und `LAUNCHER_SIGNER_THUMBPRINT` gesetzt sein. Die Werte stammen aus dem unabhängig überprüften Handoff; kein Sollwert kommt aus Payload-JSON. Setup-Signer bleibt separat über den vorhandenen Setup-Signing-Vertrag. `<publisher-payload>` enthält exakt `launcher.exe`, `launcher-release.json`, `launcher-build-provenance.json` und `publish-payload.manifest`.

## Patch-Hunks

### `build-src/installer/build-installer.bat`

Erweitert den bereits vorhandenen Bootstrap-Hunk nach `set "PUBLIC_REPO=..."`. Alle Umgebungswerte sind verpflichtend und werden vor dem Build aus dem unabhängig geprüften Handoff gesetzt:

```diff
 set "LTTH_INSTALLER_MODE=%~1"
 set "PUBLIC_STAGE=%~2"
 set "PUBLIC_REPO=%~dp0..\.."
+set "LAUNCHER_PAYLOAD=%~3"
+set "EXPECTED_VERSION=%LTTH_EXPECTED_VERSION%"
+set "EXPECTED_COMMIT_SHA=%LTTH_EXPECTED_COMMIT_SHA%"
+set "EXPECTED_TAG=%LTTH_EXPECTED_TAG%"
+set "EXPECTED_SOURCE_RUN_ID=%LTTH_EXPECTED_SOURCE_RUN_ID%"
+set "EXPECTED_PUBLISHER_RUN_ID=%LTTH_EXPECTED_PUBLISHER_RUN_ID%"
+set "EXPECTED_HANDOFF_COMMIT_SHA=%LTTH_EXPECTED_HANDOFF_COMMIT_SHA%"
+set "EXPECTED_LAUNCHER_SIGNER=%LAUNCHER_SIGNER_THUMBPRINT%"
 if "%PUBLIC_STAGE%"=="" exit /b 1
+if "%LAUNCHER_PAYLOAD%"=="" exit /b 1
+if "%EXPECTED_VERSION%"=="" exit /b 1
+if "%EXPECTED_COMMIT_SHA%"=="" exit /b 1
+if "%EXPECTED_TAG%"=="" exit /b 1
+if "%EXPECTED_SOURCE_RUN_ID%"=="" exit /b 1
+if "%EXPECTED_PUBLISHER_RUN_ID%"=="" exit /b 1
+if "%EXPECTED_HANDOFF_COMMIT_SHA%"=="" exit /b 1
+if "%EXPECTED_LAUNCHER_SIGNER%"=="" exit /b 1
```

Der neue Helper `scripts/verify_nsis_launcher_payload.py` hat Aktionen `verify` (nur Payload/Authenticode prüfen, ohne Writes) und `stage` (gleich prüfen, EXE nach Stage kopieren und Receipt exklusiv erstellen). `verify` läuft vor jeder Stage-Erstellung. Nach erfolgreichem App-Stage-Aufbau läuft `stage`, danach Stage-`verify`:

```bat
python -B "%PUBLIC_REPO%\scripts\verify_nsis_launcher_payload.py" --action verify ^
  --payload "%LAUNCHER_PAYLOAD%" ^
  --version "%EXPECTED_VERSION%" --commit-sha "%EXPECTED_COMMIT_SHA%" ^
  --tag "%EXPECTED_TAG%" --source-run-id "%EXPECTED_SOURCE_RUN_ID%" ^
  --publisher-run-id "%EXPECTED_PUBLISHER_RUN_ID%" ^
  --handoff-commit-sha "%EXPECTED_HANDOFF_COMMIT_SHA%" ^
  --launcher-signer-thumbprint "%EXPECTED_LAUNCHER_SIGNER%"
if errorlevel 1 exit /b 1
python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%"
if errorlevel 1 exit /b 1
python -B "%PUBLIC_REPO%\scripts\verify_nsis_launcher_payload.py" --action stage ^
  --payload "%LAUNCHER_PAYLOAD%" --stage "%PUBLIC_STAGE%" ^
  --version "%EXPECTED_VERSION%" --commit-sha "%EXPECTED_COMMIT_SHA%" ^
  --tag "%EXPECTED_TAG%" --source-run-id "%EXPECTED_SOURCE_RUN_ID%" ^
  --publisher-run-id "%EXPECTED_PUBLISHER_RUN_ID%" ^
  --handoff-commit-sha "%EXPECTED_HANDOFF_COMMIT_SHA%" ^
  --launcher-signer-thumbprint "%EXPECTED_LAUNCHER_SIGNER%"
if errorlevel 1 exit /b 1
python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%" --verify ^
  --launcher-payload "%LAUNCHER_PAYLOAD%" --expected-version "%EXPECTED_VERSION%" ^
  --expected-commit-sha "%EXPECTED_COMMIT_SHA%" --expected-tag "%EXPECTED_TAG%" ^
  --expected-source-run-id "%EXPECTED_SOURCE_RUN_ID%" --expected-publisher-run-id "%EXPECTED_PUBLISHER_RUN_ID%" ^
  --expected-handoff-commit-sha "%EXPECTED_HANDOFF_COMMIT_SHA%" --expected-launcher-signer "%EXPECTED_LAUNCHER_SIGNER%"
if errorlevel 1 exit /b 1
```

Der bestehende Compile-Aufruf wird um dieselben Pflichtidentitäten erweitert. Der Compiler wird nur aufgerufen, nachdem `compile_stage()` Payload, Stage-Receipt und Stage-EXE erneut verglichen und Launcher-EXE plus Receipt gesperrt hat:

```bat
python -B "%PUBLIC_REPO%\scripts\prepare_nsis_public_stage.py" ^
  --repo "%PUBLIC_REPO%" --stage "%PUBLIC_STAGE%" --verify ^
  --launcher-payload "%LAUNCHER_PAYLOAD%" ^
  --expected-version "%EXPECTED_VERSION%" --expected-commit-sha "%EXPECTED_COMMIT_SHA%" ^
  --expected-tag "%EXPECTED_TAG%" --expected-source-run-id "%EXPECTED_SOURCE_RUN_ID%" ^
  --expected-publisher-run-id "%EXPECTED_PUBLISHER_RUN_ID%" ^
  --expected-handoff-commit-sha "%EXPECTED_HANDOFF_COMMIT_SHA%" ^
  --expected-launcher-signer "%EXPECTED_LAUNCHER_SIGNER%" ^
  --compiler "%NSIS_PATH%" --script "%~dp0ltth-installer.nsi"
```

`compile_stage()` ergänzt `/DLAUNCHER_EXE=<PUBLIC_STAGE>\launcher\launcher.exe` als NSIS-Define. Die bestehende Setup-Signierung nach erfolgreichem NSIS-Aufruf bleibt unverändert.

### `build-src/installer/ltth-installer.nsi`

Im vorhandenen `SEC_CORE`-Block nur den direkten Checkout-Pfad ändern und vor `Section`/Compile ein Pflichtdefine ergänzen:

```diff
 !ifndef NSIS_PUBLIC_STAGE_VERIFIED
   !error "Public staging preflight is required; use build-installer.bat"
 !endif
+!ifndef LAUNCHER_EXE
+  !error "Verified staged launcher input is required; use build-installer.bat"
+!endif
@@
   ; Install launcher executable
-  File "${BUILD_DIR}\launcher.exe"
+  File "${LAUNCHER_EXE}"
```

Icon und restliche Ressourcen bleiben auf ihren bisherigen Pfaden; nur `launcher.exe` wird an die Stage gebunden.

### `scripts/prepare_nsis_public_stage.py`

Die Änderung bleibt additiv. Exakte neue CLI-/Helper-Verträge für die Integration:

```python
def launcher_expected_args(parser):
    # All fields are required together for prepare, verify, and compile.
    parser.add_argument("--launcher-payload", type=Path, required=True)
    parser.add_argument("--expected-version", required=True)
    parser.add_argument("--expected-commit-sha", required=True)
    parser.add_argument("--expected-tag", required=True)
    parser.add_argument("--expected-source-run-id", required=True)
    parser.add_argument("--expected-publisher-run-id", required=True)
    parser.add_argument("--expected-handoff-commit-sha", required=True)
    parser.add_argument("--expected-launcher-signer", required=True)


def launcher_identity(args):
    return {
        "version": args.expected_version,
        "commitSha": args.expected_commit_sha,
        "tag": args.expected_tag,
        "sourceRunId": args.expected_source_run_id,
        "publisherRunId": args.expected_publisher_run_id,
        "handoffCommitSha": args.expected_handoff_commit_sha,
        "signerThumbprint": args.expected_launcher_signer.lower(),
    }


def launcher_authenticode(path: Path, expected_thumbprint: str) -> dict:
    # Fixed PowerShell program; path/thumbprint arrive only through environment.
    # Return nonzero unless status, signer and timestamp certificate all exist.
    # Parse a single JSON object with status/thumbprint/timestamp_valid.
    ...


def stage_launcher(payload_dir: Path, stage: Path, expected: dict) -> dict:
    proof = launcher_input.validate_payload(
        payload_dir,
        version=expected["version"], commit_sha=expected["commitSha"],
        tag=expected["tag"], source_run_id=expected["sourceRunId"],
        publisher_run_id=expected["publisherRunId"],
        handoff_commit_sha=expected["handoffCommitSha"],
        launcher_signer_thumbprint=expected["signerThumbprint"],
        signature_verifier=launcher_authenticode,
    )
    staged = launcher_input.copy_verified_launcher(
        payload_dir / "launcher.exe", stage, proof, "launcher/launcher.exe")
    receipt = {**expected, "bytes": proof["bytes"], "sha256": proof["sha256"],
               "path": "launcher/launcher.exe"}
    write_new_exact_json(stage / "nsis-launcher-stage.json", receipt)
    return receipt
```

Die neue `scripts/verify_nsis_launcher_payload.py` CLI benutzt denselben Contract und gibt bei `verify` nur Exitcode/kurzen Status zurück. `stage` darf erst nach erfolgreichem `validate_payload()` schreiben. Ihr `main()`-Ablauf:

```python
args = parse_required_action_and_identity()
expected = launcher_identity(args)
proof = validate_payload(args.payload, **expected_contract_args(expected),
                         signature_verifier=launcher_authenticode)
if args.action == "stage":
    assert_regular_stage_root_and_ancestors(args.stage)
    created_launcher = copy_verified_launcher(args.payload / "launcher.exe", args.stage, proof)
    try:
        write_new_exact_json(args.stage / "nsis-launcher-stage.json",
                             receipt_from(expected, proof, "launcher/launcher.exe"))
    except BaseException:
        remove_only_new_regular_file(created_launcher)
        raise
```

`parse_required_action_and_identity()` erfordert alle acht CLI-Parameter (`--payload`, `--version`, `--commit-sha`, `--tag`, `--source-run-id`, `--publisher-run-id`, `--handoff-commit-sha`, `--launcher-signer-thumbprint`); `--stage` ist nur bei `stage` Pflicht. `expected_contract_args()` mappt auf die bereits getestete Signatur von `validate_payload()`.

`write_new_exact_json()` muss ausschließlich ein fehlendes reguläres Stage-Receipt mit `open("x")` schreiben. `verify()` liest es strikt (Feldmenge exakt), vergleicht es gegen `launcher_identity(args)`, ruft `validate_payload()` erneut auf, und verlangt Gleichheit von Payload-Proof, Receipt und `stage/launcher/launcher.exe`. Vor dem ersten Stage-Write müssen Payload und Authenticode erfolgreich sein. Beim Fehler darf nur der eigene partielle Stage-Copy beziehungsweise das eigene neu erzeugte Receipt entfernt werden.

Der folgende Stage-/Compiler-Contract ist Teil dieses Diffs:

1. CLI ergänzt die oben gezeigten Pflichtargumente für `verify` und Compile. `prepare()` behält App-Filterung und `nsis-public-stage.json` unverändert. Der neue `verify_nsis_launcher_payload.py` importiert den gehärteten Contract-Baustein und bietet `verify` ohne Writes sowie `stage` mit Stage-Kopie und separatem Receipt; Compiler wird nicht erreicht, wenn Launcher-Proof fehlschlägt.
2. Separates `nsis-launcher-stage.json` Receipt enthält exakt `version`, `commitSha`, `tag`, `sourceRunId`, `publisherRunId`, `handoffCommitSha`, `signerThumbprint`, `bytes`, `sha256` und `path="launcher/launcher.exe"`. Keine JSON-Werte werden als Sollwerte genutzt.
3. `verify()` liest Receipt mit strikter Feldmenge, vergleicht jedes Identitätsfeld gegen dieselben externen Argumente, prüft reguläre Stage-Pfade, Größe/SHA und verifiziert Publisher-Payload erneut. `nsis-public-stage.json`-Shape bleibt unverändert.
4. `compile_stage()` hält gleichzeitig read-only Locks auf `nsis-public-stage.json`, `nsis-launcher-stage.json`, der Stage-EXE, allen App-Dateien, NSIS-Skript und generierter Include-Datei. Nach den Locks wiederholt es `verify()` und prüft EXE-Bytes gegen den geprüften Payload-Digest, bevor es den Compiler mit `/DLAUNCHER_EXE=...` startet. NSIS liest unter dem Lock nur diesen Pfad.
5. Jede Launcher-Stage-Prüfung verwendet StageRoot-/Containment-/Ancestor-Reparse-Prüfung aus `nsis_launcher_input_contract.py`; kein Junction-/Symlink-Elternpfad ist zulässig. Fehler vor Copy ändern keine externen Pfade. Nach Copy-Fehler wird nur eine von diesem Aufruf neu erzeugte Stage-EXE entfernt.

Die CLI muss bei fehlenden erwarteten Identitäten, ungültigem Authenticode, ungültigem Zeitstempel, Stage-/Receipt-Drift oder Lockfehlern vor `subprocess.run(compiler)` fail-closed enden.

## Receipt- und Lockbindung

| Eingabe | Externe Sollbindung | Stage-Bindung beim Compile |
|---|---|---|
| `launcher.exe` | release manifest SHA/Bytes; Provenance signed SHA/Bytes; `publish-payload.manifest` File-Zeile; Authenticode Signer/Timestamp | Receipt SHA/Bytes, gelockte Stage-Datei, `/DLAUNCHER_EXE` zeigt exakt auf diesen Pfad |
| Version/Tag/Commit/Source-Run | explizite CLI-/Build-Aufrufwerte | Receipt muss identisch sein; Release-/Provenance-/Publish-Manifest müssen ebenfalls matchen |
| Publisher-Run/Handoff-Commit | explizite CLI-/Build-Aufrufwerte | Publish-Manifest-Metadaten und Receipt müssen matchen |
| Stage-App | bestehender Public-Stage-Vertrag | bestehender `nsis-public-stage.json`, Datei-Locks und explizite NSIS-Dateiliste |

## Regressionen für die spätere Integration

- Matching synthetischer Publisher-Payload und Test-Signatur: Receipt entsteht, Include/Define zeigen auf `<stage>\launcher\launcher.exe`.
- Fehlende EXE/Sidecar, zusätzliche Datei, falsche Publisher-Run-ID oder Handoff-Commit, Version/Tag/Commit/Source-Run-Abweichung.
- EXE-Hash/Bytes mismatch in einem beliebigen der drei Manifeste; provenance signer mismatch; invalid/unsigned/timestamp-less Authenticode.
- Fehlende Stage-EXE, falscher Stage-Pfad, Receipt-Feld drift, veränderte Stage-Bytes nach Verify, Junction/Reparse auf Stage-Root und Zwischeneltern.
- Compiler-Spy bleibt bei allen Negativfällen unaufgerufen; Write-/Lockfehler lassen keinen partiellen Launcher zurück und ändern keine externen Payloaddateien.
- Positivfixture prüft die generierte NSIS-Define und `File`-Zeile auf identischen Stagepfad; kein NSIS-Prozess wird für synthetische Tests gestartet.

## Aktuelle dirty Hunks und Ownership

- `build-src/installer/build-installer.bat`: bestehender Dirty-Block ändert Kopf/Usage und fügt Bootstrap/Stage-Aufruf nach der Banner-Ausgabe ein (aktuell etwa Zeilen 6–36); weiterer Dirty-Block ersetzt den direkten Compileraufruf und fügt Setup-Signierung an (etwa Zeilen 137–146). Die Integration müsste Argument- und Verify-Aufrufe innerhalb dieser bereits bearbeiteten Release-Gates ändern.
- `build-src/installer/ltth-installer.nsi`: bestehende Dirty-Hunks setzen `APP_DIR`/`NSIS_PUBLIC_STAGE_VERIFIED` voraus (etwa Zeilen 45–53) und ersetzen die App-Wildcards durch Include der gelockten App-Dateiliste (etwa Zeilen 400–410). Der Launcher-`File`-Befehl liegt im selben Core-Installationsabschnitt; Änderung muss dessen Stage-Define und Kopierpfad mit den Stage-Locks abstimmen.
- `scripts/prepare_nsis_public_stage.py`: derzeit untracked im gemeinsamen Checkout. Seine App-Datei-Inventarisierung, Receipt-Verifikation, File-Locks und Compilerargumente sind Teil des Stage-Contracts; Launcher-Receipt und Lockänderungen dürfen nicht separat/parallel daran vorbeigehen.
- Der aktive Build-/Stage-Contract und die relevanten Stellen waren bereits dirty/untracked, bevor dieser Vorschlag beauftragt wurde. Daher enthält diese Datei nur einen Integrationsvorschlag; keine dieser Produktdateien wurde von diesem Auftrag geändert.

## Nicht durch diesen Patch bewiesen

Die bestehende data-only Publisher-Dateiliste beweist interne Hash-/Run-Konsistenz, nicht eigenständig CI-Herkunft. Erwartete Identitäten müssen aus dem bereits überprüften Publisher-Handoff außerhalb der Payload stammen. Synthetische Authenticode-Provider belegen nur Kontrollfluss. Echte Payloadherkunft, echte Signatur/Timestamp und Installer-Akzeptanz bleiben separate Abnahmen.
