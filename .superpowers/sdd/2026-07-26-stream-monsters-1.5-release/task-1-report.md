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
