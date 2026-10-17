# Closed-Beta Runtime Acceptance

Stand: 2026-10-07. Source and fixture checks only; this is not acceptance of an installed or released build.

## Source and isolated-fixture checks

- `app/modules/plugin-release-policy.js` applies the closed-beta policy only when `app/config/distribution-mode.json` selects `public`; absent/local marker preserves local discovery. In public mode it filters store entries, blocks direct install paths, and fails closed on an invalid policy.
- `app/test/plugin-release-policy.test.js`: **PASS**, 1 suite / 8 tests, using the bundled Node runtime. Coverage includes public/local modes, alias handling, malformed policy, static/API request guard ordering, and ZIP-upload rejection. These are isolated tests, not observations of an installed app.
- `scripts/build_pages_bundle.py:is_public_app_archive`: In-memory ZIP fixtures with one `{"channel":"public"}` marker were checked directly. A renamed directory containing manifest ID `music-bot`, a renamed directory with alias `streamalchemy`, and one with `replaces: ["streamalchemy"]` were each rejected; a canonical `plugins/music-bot` control was rejected; an unrelated public manifest was accepted. **5/5 fixture expectations passed.** The current code scans manifests under plugin paths and checks `id`, `aliases`, and `replaces`, in addition to directory-name checks.
- `app/test/pages-release-bundle.test.js`: This checkout's initial Jest attempt could not start/discover a Python child and reported “Python 3 is required”; that is a sandbox/process-launch failure, not a product result. The CEO reports that the Pages Jest suite subsequently passed in an allowed escalated run. That owner-reported PASS is recorded separately; it was not independently rerun in this audit. The direct in-memory helper fixtures above passed in this checkout.
- **Owner-reported state-retention regression:** The CEO reports a pre-fix failure where `pruneStalePluginState()` deleted saved `music-bot` state after public filtering, then a fix exempting IDs classified closed-beta by the release policy. The same report states the post-fix check retains saved preferences for all 11 IDs plus the alias, with two policy/alias suites and 15 tests passing. The current source test invokes pruning and asserts the original saved state remains with no save call; this separate root result was not rerun as part of the installer task.

## Running user process

- A Node process using this repository's `runtime/node/node.exe` was present in the process inventory. It was not identified as the LTTH app server, queried for health, or interacted with. The installed instance's distribution marker, effective mode, plugin catalog, and runtime behavior are therefore **NOT CHECKED**.
- No user profile/config contents, real viewer data, balances, roles, or live service state were read or changed.

## Release artifact

- No final app ZIP or Pages bundle was built, inspected, or deployed for this check. No installer was run. No release or public-distribution acceptance is implied by the source checks or the temporary in-memory fixtures.

## Existing public acquisition paths (read-only, 2026-10-07)

- GitHub Release API metadata reports `v1.4.4` as the current latest stable release, published at `2026-10-07T08:18:05Z`, on commit `78330bdf396d40e646e6131826de6cac7455dc0a` (same commit as the local `v1.4.4` tag). No binary asset was downloaded.

| Public v1.4.4 asset | Size | GitHub SHA-256 |
| --- | ---: | --- |
| `launcher.exe` | 11,887,560 bytes | `4d1812ce00cbaede1f65cb94144a1223f9d301e265803507b2a7d87ba0ad7eb5` |
| `LTTH-Setup-1.4.4.exe` | 288,459,792 bytes | `bb1b316a8efae85a4fb4c14e9e1b43abf257fd113506d4327b969dd54daadc5b` |
| `ltth_latest.zip` | 156,196,577 bytes | `dd989cecc86c61c925bc3845a6baccf91b3706a56b7eae342c4fc8f9056a0919` |
| `launcher-release.json` | 259 bytes | `8328b1616ff386ca408abecedd8acfb9b03c9573ab4e3acd930245d33c16b041` |
| `ltth_latest.json` | 254 bytes | `097a746b5e4f0401c5dc62f45e7e13fc3df340c3efcfa66540dfcf5836c3c267` |
| `installer-release.json` | 647 bytes | `c67a97d877947a5b28819cd2badd23368a515afe495b3f684e05bbf41cc81b8c` |

- `download.html` links directly to `/downloads/launcher.exe`; `launcher.html` links to `download.html`. The local `downloads/launcher.exe` and root `launcher.exe` both match the remote `v1.4.4` release asset by size and SHA-256. The local website copy has a **Valid** Authenticode signature (subject `CN="Open Source Developer, Dominik Rainer"`). That proves the downloaded local copy's signature and identity only; it does not prove that the old launcher implements the new source policy. GitHub latest release metadata currently resolves to `v1.4.4`.
- The `v1.4.4` source tag has no `app/config/plugin-release-policy.json`, no `app/modules/plugin-release-policy.js`, and no public distribution marker writes in the tagged installers. The tagged Go updater's `extractAppSubdirFromGitHubZip` copies the `app/` subtree without the current manifest ID/alias scan or public marker handling. The source still contains older closed-beta store-access entitlement checks; this finding is specifically that the newer blanket public-distribution policy is absent.
- **Bypass-capable legacy paths:** (1) The Windows `latest` bootstrap fetches `/releases/latest/download/ltth_latest.zip`. The current `install/install.ps1` validates a launcher sidecar and the launcher size/hash, but does not fetch/verify `ltth_latest.json` or validate the app ZIP's public marker or plugin manifests before extraction; it checks only that an app root and package/launch files exist. The v1.4.4 app ZIP is tied to a source tag without the new policy. Its exact member list was not independently checked because the binary was not downloaded. (2) The public direct `downloads/launcher.exe` and the GitHub v1.4.4 `launcher.exe` are the exact same signed pre-policy launcher. (3) The public GitHub release also exposes `LTTH-Setup-1.4.4.exe`; it is not linked by the current `download.html` and the current `.github/workflows/release.yml` does not build or upload a Setup asset. Its internal contents and Authenticode status were not inspected, so treat it as an unverified legacy acquisition path until owner disposition.
- `install/install.js` and `install/install.sh` install source by cloning the selected branch or tag rather than downloading a release binary; explicit pinning to `v1.4.4` resolves to the policy-less tag. `app/modules/update-manager.js` is Git-backed and requires a clean tree; it does not apply a release binary. The v1.4.4 Go launcher does apply GitHub release Zipballs using its unfiltered extractor, so an old launcher binary can restore the policy-less app source. The current Go source includes the newer manifest filter, but the remote v1.4.4 launcher asset predates it.
- The checkout's `app/ltth_latest.zip` is 88,380,491 bytes with SHA-256 `9dc11717acde5fe3f880a7fcbc86931cd8650e35a543ff6496af3db7d236e3f4`; it is **not** the 156,196,577-byte remote `v1.4.4` app ZIP. No content comparison was made.

### Next signed-release gates

1. Freeze the accepted policy/runtime and website-card fixes in a clean commit on the required release base, bump beyond `1.4.4`, and build only from that commit. Keep unrelated TTS and other dirty work out.
2. Build a fresh app ZIP and verify its commit/version sidecar, public marker, checksum, absence of all closed IDs/aliases/replacements under any plugin directory name, and absence of excluded profile/test/cache/output paths. Make the Windows installer verify the app ZIP sidecar before extraction.
3. Build the launcher from the policy-aware Go source instead of reusing the old root binary; require valid Authenticode signature and expected signer/timestamp, then bind `launcher-release.json` to the exact tag, commit, byte count, and hash. The current release workflow verifies an existing `launcher.exe` signature and computes a hash; it does not build/sign that binary.
4. Resolve the legacy Setup asset: either build a new Setup from the same accepted source and sign/verify it with matching provenance, or stop advertising/retire the old `LTTH-Setup-1.4.4.exe`. Current release workflow has no Setup build/upload step.
5. Publish a new versioned release only after those checks; rebuild Pages so `/downloads/launcher.exe` matches the new signed asset and ensure latest-release URLs resolve to the new verified assets. Decide separately how long direct pinned v1.4.4 URLs remain supported; they cannot be made policy-aware by changing current source alone.

## Windows ZIP-bootstrap compatibility boundary (documented before installer change)

- `Install-AppBundleFromZip` on the official Windows `latest` bootstrap will accept only a release with a valid `ltth_latest.json` schema-1 sidecar (`component: ltth_latest.zip`, semantic version and matching `v<version>` tag, 40-hex commit, positive byte count, 64-hex SHA-256), exact downloaded ZIP byte/hash match, and policy-compliant public App contents. The sidecar version must also match the expected installer/launcher version whenever that value is already resolved.
- Historical ZIPs without a sidecar, with a malformed/mismatched sidecar, without a public distribution marker/policy, or containing blocked plugin IDs/aliases/replacements are intentionally incompatible with this ZIP-bootstrap path. There is no silent legacy ZIP extraction mode.
- Existing branch/pinned Git-source behavior remains the compatibility path. If a ZIP validation or download fails, the existing caller may enter its Git-clone fallback; the ZIP itself must remain unextracted/uninstalled. This does not certify old pinned source tags as public-policy compliant.

## Changes and remaining gate

- `install/install.ps1` now requires the official Windows latest ZIP bootstrap to fetch and validate the schema-1 app sidecar before the ZIP, pins the ZIP URL to the manifest tag, checks exact bytes and SHA-256, then checks the public marker, release policy, app version, plugin directory names, IDs, aliases, and replacement identities before extraction. The launcher manifest/file checks reuse the shared strict validators.
- `app/test/windows-installer-release-bundle.test.js`: **PASS**, 1 suite / 22 tests using local ZIP fixtures and Windows PowerShell. Coverage includes launcher behavior, valid app ZIP bootstrap, absent sidecar, expected-version mismatch, byte/hash mismatch, and missing/invalid public marker/policy or blocked plugin identity. Rejected fixtures assert extraction and installation did not happen. `git diff --check` passed for the installer and test edits.
- The ZIP compatibility boundary above is implemented for the official Windows latest ZIP path. Historical ZIP assets without a valid sidecar/public policy intentionally fail closed; the existing caller may use its Git-source fallback, which does not extract the rejected ZIP. This does not validate old pinned source tags as public-policy compliant.
- No ZIP was downloaded, no installer/live app was run, and no asset was removed or published. The 22 tests use generated local fixtures. The focused installer and test changes remain unstaged and uncommitted; no push or release action occurred.
- Separate owner-reported runtime state-retention evidence is recorded above and was not rerun as part of this installer assignment.
- Remaining: run the Pages bundle regression suite in an environment where its Python subprocess can be launched, then verify the fresh frozen app ZIP and Pages bundle separately by provenance and contents. Runtime acceptance requires an explicitly identified installed app and separate evidence of its effective distribution mode.
