# Task 1 Report: Multi-vendor GPU detection and managed ComfyUI runtime

## Status

`DONE_WITH_CONCERNS`

Commit: `b08e4ef4c636bcf2eb93086cf23a0eef1ee887c4`

The requested backend/runtime scope is implemented and committed. The task-focused verification is green. The only broader StreamAlchemy failure is an existing UI-i18n audit failure in files explicitly outside this task's boundary.

## Changed files

- `app/plugins/streamalchemy/backend/system-analyzer.js`
  - Replaced the Windows `Format-List` command with structured CIM plus registry JSON discovery.
  - Returns all physical adapters with stable hashed IDs, filters virtual/basic/remote adapters, restores 64-bit registry VRAM, classifies vendors and architectures, and retains the legacy `gpu` field.
- `app/plugins/streamalchemy/backend/streammonsters/managed-runtime-installer.js`
  - Added the server-pinned official ComfyUI v0.28.0 four-profile catalog and exact asset sizes/digests.
  - Added AMD Windows 11/RDNA support policy and NVIDIA/Intel profile selection.
  - Added asynchronous jobs, cancellation, resumable `.part` downloads, SHA-256/size verification, disk preflight, atomic artifact and install completion, safe staging cleanup, persistent active-install records, previous-runtime retention, `.7z` inspection/extraction through `tar.exe`, direct embedded-Python lifecycle, loopback port selection, health/device/backend verification, 256x256 generation smoke test, idle stop, and destroy cleanup.
- `app/plugins/streamalchemy/backend/streammonsters/routes.js`
  - Changed install to the narrow HTTP 202 job contract.
  - Extended compatible status fields and added job GET/DELETE plus admin start/stop/verify routes.
  - Added managed-runtime startup and runtime/art-pool events to pool preparation.
- `app/plugins/streamalchemy/backend/constants.js`
  - Changed the default generation mode to `local_preferred`; existing `local_strict` behavior remains.
- `app/plugins/streamalchemy/backend/model-catalog.js`
  - Pinned SDXL Lightning filename, exact size, SHA-256, and `OpenRAIL++` license metadata.
- `app/plugins/streamalchemy/index.js`
  - Wired job/runtime events and successful managed install config, and destroys the owned runtime on plugin shutdown.
- `app/test/streamalchemy-relaunch-system-analysis.test.js`
  - Added structured multi-adapter, filtering, stable-ID, classification, and 64-bit VRAM coverage.
- `app/test/streamalchemy-model-catalog.test.js`
  - Added exact model artifact/license assertions.
- `app/test/streammonsters-managed-runtime.test.js`
  - Added official catalog/hash/size/URL and hardware-profile fixtures.
- `app/test/streammonsters-runtime-jobs-lifecycle.test.js`
  - Added job, cancellation, resume, atomic completion, archive-security, persistence, process, smoke-test, retry, and idle/failure cleanup coverage.
- `app/test/streammonsters-routes-security.test.js`
  - Added narrow request, HTTP 202, status compatibility, job/admin route, and pool-event coverage.
- `app/test/streammonsters-plugin-integration.test.js`
  - Added default mode, route registration, and destroy-hook coverage.

No UI, gameplay, GCCE, release ZIP, locale, or unrelated plugin file was changed.

## TDD RED/GREEN ledger

All Jest commands below used bundled Node `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe` v22.14.0 / ABI 127 from `app/`.

1. Windows structured adapter discovery
   - Harness correction: the initial Windows-style pattern `.\test\...` produced Jest `No tests found`; rerun used `test/...`.
   - RED: `node.exe node_modules/jest/bin/jest.js test/streamalchemy-relaunch-system-analysis.test.js --runInBand`
   - Result: 1 failed / 4 passed; expected PowerShell JSON command but received `nvidia-smi`.
   - GREEN: same command.
   - Result: 5/5 passed.

2. Multi-vendor ComfyUI/model catalog
   - RED: `... test/streammonsters-managed-runtime.test.js --runInBand`
   - Result: 1 failed / 12 passed; `getCatalog` did not exist.
   - GREEN: same command.
   - Result: 13/13 passed.

3. Jobs, downloads, `.7z`, process lifecycle
   - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand`
   - Result: 5/5 failed for missing job/download/tar/lifecycle APIs.
   - GREEN: same command.
   - Result: 5/5 passed.

4. Runtime HTTP routes and pool events
   - RED: `... test/streammonsters-routes-security.test.js --runInBand`
   - Result: 3 failed / 5 passed; old synchronous 200 install, missing extended status, and missing pool runtime events.
   - GREEN: same command.
   - Result: 8/8 passed.

5. Default mode and destroy hook
   - RED: `... test/streammonsters-plugin-integration.test.js --runInBand`
   - Result: 2 failed / 3 passed; default remained `remote` and runtime destroy was not called.
   - GREEN: same command.
   - Result: 5/5 passed.

6. Exact SDXL Lightning metadata
   - RED: `... test/streamalchemy-model-catalog.test.js --runInBand`
   - Result: 1 failed / 1 passed; size/hash/license were missing.
   - GREEN: same command.
   - Result: 2/2 passed.

7. Persistent verified install and health startup retry
   - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand`
   - Result: 5 failed / 6 passed; active record was not loaded, unsafe archive path errors were not normalized, and health startup did not retry.
   - GREEN: same command.
   - Result: 11/11 passed.

8. Official ComfyUI v0.28.0 URLs and asset sizes
   - RED: `... test/streammonsters-managed-runtime.test.js --runInBand`
   - Result: 1 failed / 12 passed; placeholder LTTH URLs and missing package sizes differed from official release assets.
   - GREEN: same command.
   - Result: 13/13 passed with official `Comfy-Org/ComfyUI` URLs, names, sizes, and prescribed digests.

9. Failed managed startup cleanup
   - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand`
   - Result: 1 failed / 11 passed; the owned child was not killed after device mismatch.
   - GREEN: same command.
   - Result: 12/12 passed; only the stored managed child is stopped.

10. Already-complete resumed artifact
    - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand`
    - Result: 1 failed / 12 passed; a complete verified `.part` still attempted network access.
    - GREEN: same command.
    - Result: 13/13 passed; the verified part is atomically completed without another request.

11. Installed-model status
    - RED: `... test/streammonsters-routes-security.test.js --runInBand`
    - Result: 1 failed / 7 passed; status did not include the model verification state.
    - GREEN: same command.
    - Result: 8/8 passed.

## Final verification

- Fresh task-focused Jest:
  - Command: bundled `node.exe node_modules/jest/bin/jest.js` with the seven analyzer/catalog/managed-runtime/jobs/routes/plugin/gift-pool suites, `--runInBand`.
  - Result: 7/7 suites, 49/49 tests passed.
- Focused ESLint:
  - Command: `npm run lint -- --quiet`
  - Result: exit 0, no lint errors.
- CSS build:
  - Command: `npm run build:css`
  - Result: exit 0; only the existing stale `caniuse-lite` warning. No CSS diff was produced.
- Syntax:
  - Bundled Node `--check` passed for analyzer, managed installer, routes, and plugin entry.
- Diff:
  - `git diff --check` and staged `git diff --cached --check` passed.
  - Commit contains exactly the 12 source/test files listed above.
- Real Windows read-only adapter probe:
  - Structured CIM/registry path returned the machine's `Intel(R) Arc(TM) A770 Graphics`, stable `gpu-...` ID, `arc_a770`, known 16258 MB registry VRAM.
- Official artifact metadata:
  - GitHub release API for `Comfy-Org/ComfyUI` tag `v0.28.0` returned the four exact names, sizes, and prescribed SHA-256 digests.
  - HEAD checks returned 302 for each official GitHub asset.
  - Hugging Face HEAD returned linked size `6938040682` and linked ETag equal to the prescribed model SHA-256.
- Wider StreamAlchemy/Stream Monsters run:
  - Result: 31/32 suites, 225/226 tests passed.
  - The isolated failure is `streamalchemy-ui-i18n.test.js`, reporting 95 pre-existing untranslated/raw strings in `streammonsters-ui.html` and `streammonsters-overlay.html`.
  - This task changed no UI/locale file, and the task brief explicitly forbids UI work.

## Self-review

- Public compatibility: legacy `gpu`, `runtime`, `recommendation`, `manifestAvailable`, and `installDetails` remain; new status fields are additive.
- Request trust: the install route passes only adapter/profile/license input to server-owned catalog selection. Job/status payloads omit catalog URLs and hashes.
- Filesystem safety: install state is under plugin data; archive paths are validated before extraction; cleanup is limited to a canonical child of the dedicated staging root; previous verified installs are not deleted.
- Process safety: `shell:false` is used for both `tar.exe` and embedded Python; only `managedChild` can be killed; external ComfyUI is never stopped.
- Runtime safety: download size/hash, disk capacity, child liveness, loopback URL, selected device, backend, and a real submitted 256x256 workflow are checked before the install is marked verified.
- Live behavior: gift handling remains generation-free; pool preparation is the path that can start the managed runtime and produce art.

## Concerns

1. Multi-gigabyte artifacts were intentionally not downloaded in tests. URLs, server metadata, exact sizes, and digests were verified read-only; download/extract/smoke behavior is covered with injected small fixtures.
2. AMD support remains explicitly experimental and is not marked verified until that machine completes the real smoke test, as required.
3. The pre-existing UI-i18n audit failure remains out of scope because Task 1 explicitly forbids UI changes.

## Review fix pass: 2026-07-23

Status: `DONE_WITH_CONCERNS`

Reviewed range: `8e53137f..b08e4ef4`

Separate review-fix commit: this report is part of that commit; the exact commit hash is returned in the task handoff.

### Findings fixed

1. Candidate runtimes now remain in validated staging through archive extraction, model placement, child startup, exact device/backend verification, and the 256x256 smoke test. The child is stopped and awaited before the verified candidate directory is atomically renamed into the deterministic install slot. Failed candidates never occupy that slot, and staging is cleaned on failure.
2. Runtime and model downloads now use plugin-data `managed-runtimes-v2/artifacts/<sha256>/...` cache paths. Verified files and partial downloads survive random staging cleanup; disk preflight counts only remaining artifact bytes on retry.
3. `LocalComfyProvider` resolves the currently running managed base URL for every status/generation operation. Pool preparation and manual/restarted runtime launches can therefore use their current dynamic loopback port without relying on stale persisted config.
4. Install jobs retain their execution promise. Cancellation and destroy abort and await the real job, suppress post-disposal events, propagate abort through download/hash, official 7z inspection/extraction, health retries, and smoke requests, and await managed-child exit.
5. Idle shutdown now uses activity leases. Local provider requests clear the idle timer, and an idle stop waits for all active leases to release.
6. Windows adapter records now include per-vendor backend indexes. Managed launches pass official ComfyUI v0.28.0 selectors: `--cuda-device` for CUDA/ROCm and `--oneapi-device-selector level_zero:<index>` for Intel. Verification requires exactly one device record matching the selected adapter and backend; ROCm is recognized through the pinned package's PyTorch version even though PyTorch exposes its device type as `cuda`.
7. Concurrent installs are rejected with `STREAM_MONSTERS_RUNTIME_INSTALL_IN_PROGRESS`; new installs are rejected after disposal.
8. The active installation pointer is replaced by direct same-directory rename without an unlink gap.
9. Runtime status reports the selected catalog profile's actual download size instead of zero.
10. Small real `performCatalogInstall` integration coverage now proves smoke failure cleanup, persistent-cache retry under reduced free disk, successful promotion, active-record persistence, cancellation with retained partial bytes, managed restart, and dynamic ports.

### Review-pass changed files

- `app/plugins/streamalchemy/backend/streammonsters/managed-runtime-installer.js`
- `app/plugins/streamalchemy/backend/providers/local-comfy-provider.js`
- `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- `app/plugins/streamalchemy/backend/system-analyzer.js`
- `app/plugins/streamalchemy/index.js`
- `app/test/streammonsters-runtime-jobs-lifecycle.test.js`
- `app/test/streamalchemy-relaunch-generation.test.js`
- `app/test/streamalchemy-relaunch-system-analysis.test.js`
- `app/test/streammonsters-plugin-integration.test.js`
- `app/test/streammonsters-routes-security.test.js`
- `.superpowers/sdd/task-1-report.md`

No UI, gameplay, GCCE, release ZIP, locale, or unrelated plugin file was changed.

### Review-pass TDD ledger

All Jest commands used bundled Node `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe` v22.14.0 / ABI 127 from `app/`.

1. Combined review regression RED
   - Command: bundled `node.exe node_modules/jest/bin/jest.js test/streammonsters-runtime-jobs-lifecycle.test.js test/streamalchemy-relaunch-system-analysis.test.js test/streamalchemy-relaunch-generation.test.js test/streammonsters-plugin-integration.test.js test/streammonsters-routes-security.test.js --runInBand`
   - Result: 5/5 suites failed; 11 failed / 39 passed tests.
   - Expected failures proved missing async cancellation, install serialization, selectors, exact device verification, staging-only verification, persistent artifacts, managed provider URL wiring, adapter backend indexes, and catalog size reporting.
2. Core review regression GREEN
   - Same five-suite command.
   - Result: 5/5 suites passed; 50/50 tests passed.
3. Resumable retry disk-preflight RED/GREEN
   - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand -t "verifies in staging before promotion"`
   - Result: failed with `STREAM_MONSTERS_RUNTIME_DISK_SPACE_INSUFFICIENT` after the first failed smoke left verified cached artifacts.
   - GREEN: same command passed after preflight began counting only missing artifact bytes plus extraction reserve.
4. ROCm device-record RED/GREEN
   - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand -t "recognizes the ROCm package backend"`
   - Result: failed with `STREAM_MONSTERS_RUNTIME_BACKEND_MISMATCH`.
   - GREEN: same command passed after pairing the selected `cuda`-typed device record with the `+rocm` PyTorch backend marker.
5. Hash-cancellation RED/GREEN
   - RED: `... test/streammonsters-runtime-jobs-lifecycle.test.js --runInBand -t "propagates cancellation through artifact hashing"`
   - Result: resolved instead of rejecting because hashing ignored the abort signal.
   - GREEN: same command passed after hash pipelines received and normalized the abort signal.

### Fresh final verification

- Covering Jest:
  - Command: bundled `node.exe node_modules/jest/bin/jest.js test/streamalchemy-relaunch-system-analysis.test.js test/streamalchemy-model-catalog.test.js test/streamalchemy-relaunch-generation.test.js test/streammonsters-managed-runtime.test.js test/streammonsters-runtime-jobs-lifecycle.test.js test/streammonsters-routes-security.test.js test/streammonsters-plugin-integration.test.js test/streammonsters-art-pool-kenney.test.js --runInBand`
  - Result: 8/8 suites passed; 75/75 tests passed.
- Syntax:
  - Bundled Node `--check` passed for managed installer, local provider, Stream Monsters routes, system analyzer, and plugin entry.
- ESLint:
  - Command: `npm run lint -- --quiet`
  - Result: exit 0 with no lint errors.
- CSS:
  - Command: `npm run build:css`
  - Result: exit 0; only the existing stale `caniuse-lite` warning, and no CSS file remained changed.

### Review-pass self-review

- The deterministic install directory is created only by a final rename after the child, selected device/backend, and generated output have all passed.
- Persistent cache keys are trusted SHA-256 values and safe basenames under plugin data; failed random staging can be deleted without losing resumable work.
- Only the owned child is stopped. External ComfyUI is never leased or killed.
- Idle shutdown is request-aware, while explicit admin stop and plugin destroy remain forceful lifecycle actions.
- Public route compatibility fields remain additive, and catalog URLs/hashes remain server-only.
- The 1,000-plus-line installer was not split during this safety pass because doing so would add a broad speculative rewrite after behavior was stabilized.

### Remaining concerns after review fixes

1. The multi-gigabyte official packages and model were not downloaded in tests; the integration tests use small real ZIP/file fixtures through the production install path.
2. NVIDIA, Intel, and AMD selectors were verified against the official ComfyUI v0.28.0 argument handling and deterministic fixtures, but only the local Intel Arc discovery probe from the original task used real hardware.
3. The pre-existing UI-i18n audit failure remains outside Task 1 boundaries.
