# Task 1 report: Rules v5 and Art Lab retirement

## Status

Implemented and committed as `1967bf28` (`feat(streammonsters): establish rules v5 runtime boundary`).

## RED evidence

- Initial Rules v5 suite: 1/27 passed and 26 failed before production changes. Failures covered the v5 config contract, all 22 legacy Art Lab route tombstones, public/private state boundaries, Furry-only visuals, startup service removal, and structured logs.
- Creator UI behavior: the focused UI test failed before the v5 controls and creator-state request were added.
- Partial nested config update: failed because updating one alias/layout/audio entry reset unrelated persisted entries.

## GREEN evidence

- Bundled Node 22 / ABI 127 focused verification: 9 suites, 122 tests passed.
- Syntax checks passed for the changed backend and runtime JavaScript files.
- ESLint passed for all changed JavaScript and test files.
- `git diff --check` passed.
- Broader `streammonsters` run: 28/31 suites and 317/326 tests passed. The three remaining red suites are stale 1.4 assertions for the deliberately removed runtime wizard/Art Lab visual choices and the deliberately redacted public viewer state: `streammonsters-release-1.4.test.js`, `streammonsters-creator-ui.test.js`, and `streammonsters-collector-routes.test.js`.

## Changed files

- Runtime/config: `app/plugins/streamalchemy/index.js`
- HTTP/auth boundary: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Canonical visual selection: `collection-service.js`, `game-engine.js`
- Creator config/runtime: `streammonsters-creator-runtime.js`, `streammonsters-ui.html`
- Rules v5 regression suite: `app/test/streammonsters-rules-v5.test.js`
- Updated impacted contract tests: gameplay v2, core rules v3, route security, plugin integration, creator UI/runtime, collection and Art/Furry fallback coverage
- Tracked implementation plan: `docs/superpowers/plans/2026-07-26-stream-monsters-1.5-release.md`

## Data safety

- No database table, migration, runtime/model/pool file, plugin data directory, user row, battle replay, egg timing, or historical Art Pool/generation-pool row was deleted or rewritten.
- Rules v5 config migration is additive, preserves unknown historical settings, preserves custom incubation duration, and canonicalizes only active visual selection to `furry`.
- Historical provider/runtime modules and database tables remain on disk for data compatibility, but normal plugin startup and the creator UI no longer execute or call them.
- All 22 former Art Lab endpoints are non-mutating exact HTTP 410 tombstones returning `{ "error": "art_lab_removed" }`.

## Concerns

- Three broad legacy suites still encode the superseded 1.4 runtime wizard, Art Lab selection/pool preparation, and public viewer-inventory contracts. They were not broadened into Task 1; their exact failures are recorded above for coordinated test migration.
- Full repository Jest was not used as completion proof; the ABI-sensitive focused and impacted suites used the repository's bundled Node 22 runtime.

## Review round 1/5 closure

This section supersedes the earlier concern and on-disk compatibility notes above.

### Findings resolved

- Generated Kenney fallback URLs now resolve through a traversal-safe, symlink-rejecting route rooted only in the plugin data directory. Valid deterministic `kenney-<16 hex>.svg` files are served, missing Kenney files return 404, and every other former Art Lab filename returns the exact 410 `{ "error": "art_lab_removed" }` tombstone.
- Retired generator, provider, model-installer, managed-runtime, Art Pool executor, legacy backend, and legacy static UI files were removed from the shipped plugin. Legacy static UI and overlay URLs map to the current Stream Monsters creator and overlay pages.
- Historical plugin database tables/rows and data-directory bytes remain untouched. Replacement retirement tests initialize and destroy the current plugin against representative legacy StreamAlchemy tables and a historical model file, then compare schemas, rows, blobs, and file bytes exactly.
- All new Rules v5 controls and options are localized in German, English, Spanish, and French, with a 30-key cross-locale UI contract test.
- The obsolete 1.4 assertions in `streammonsters-release-1.4`, `streammonsters-creator-ui`, and `streammonsters-collector-routes` were migrated to equivalent Rules v5 coverage without weakening access-control, compatibility, or UI behavior checks.
- Viewer-specific ownership, mastery, essence, and cosmetics are loaded from the admin-protected creator catalog route. The public catalog remains aggregate-only.
- Obsolete StreamAlchemy executor suites were replaced by package-absence and historical-data-preservation coverage appropriate to the retired runtime boundary.

### TDD evidence

- RED, bundled Node 22 / ABI 127: `streammonsters-rules-v5.test.js` failed 8 and passed 26 before the review fixes. Failures covered Kenney serving, retired package/static files, all four locale contracts, the creator catalog route, and the UI's viewer lookup path.
- GREEN, focused review matrix: `streammonsters-rules-v5`, `streammonsters-art-pool-kenney`, `streammonsters-release-1.4`, `streammonsters-creator-ui`, and `streammonsters-collector-routes` passed 5/5 suites and 70/70 tests.
- GREEN, impacted Rules v5 matrix: 12/12 suites and 155/155 tests passed.
- GREEN, final complete Stream Monsters matrix: 31/31 suites and 278/278 tests passed with bundled Node 22.14.0, direct Jest binary invocation, `--runInBand --silent`.
- GREEN, retired StreamAlchemy package/data matrix: 1/1 suite and 2/2 tests passed with the same runtime and flags.
- GREEN, GCCE/integration matrix: 11/11 suites and 119/119 tests passed with the same runtime and flags.
- Changed JavaScript ESLint passed, all four locale JSON documents parsed, the retired-module import audit found no retained production import, and `git diff --check` passed.

### Final concern status

- No known Task 1 review finding remains open.
- The full repository-wide Jest suite was not used as proof; final verification covered every Stream Monsters suite, every StreamAlchemy-named suite after retirement migration, and every GCCE-named integration suite.
