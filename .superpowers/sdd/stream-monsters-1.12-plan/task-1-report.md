# Task 1 report: canonical Stream Monsters identity and release core

## Status

Complete on `codex/stream-monsters-1.12-release`.

Commits:

- `faaedebb7e87cd47d303245d452b7a01149d5be4` - canonical identity, loader, migration, lifecycle, storage, Store, backup, routes, static compatibility, dashboard, IFTTT/GCCE, and tests.
- `f0a37891f` - LTTH 1.4.2 and Stream Monsters 1.12 release metadata, deterministic package, canonical docs/product projections, and release-contract tests.

## Implemented contract

- Added the immutable core registry in `app/modules/plugin-identities.js`: canonical `stream-monsters`, alias `streamalchemy`, persistent ID `streamalchemy`, canonical and legacy config keys, candidate resolution, historical package reservations, and IFTTT canonicalization.
- Loader inventories and canonicalizes every manifest before construction. New-only, old-only, and dual-directory installs expose one canonical runtime; actual directory/path/manifest identity remain available for operations.
- Lifecycle APIs, runtime lookup, TikTok/action registration, events, logs, reload/delete/status, and public overlay discovery accept aliases while emitting/exposing one canonical identity.
- State and config migrations use atomic dual writes, sync markers, stable fail-closed conflict codes, one-time legacy sourcing, revision checks, service/config rollback, and post-success events.
- Both IDs share legacy persistent data. Canonical-directory data contributes missing files only; byte conflicts are preserved and reported.
- Backup export/import is canonical and rejects conflicting dual-ID payloads.
- Source lives at `app/plugins/stream-monsters`; canonical UI/API/static routes are active, compatibility aliases remain, and retired `/api/streamalchemy/*` Art Lab routes remain 410.
- Store presents one canonical tile, reserves the alias against community uploads, recognizes 1.11.1 as predecessor, and transactionally upgrades/rolls back source, state, config, data, and runtime through the authenticated rollback endpoint.
- GCCE/IFTTT, dashboard navigation/deep links, locales, docs, screenshots, and product-guide sources project canonically with runtime compatibility fallback where required.
- Active host metadata is LTTH 1.4.2; plugin/product metadata is Stream Monsters 1.12.0 with minimum LTTH 1.4.2.

## Release evidence

- Package: `plugin-store/packages/stream-monsters-1.12.0.zip`
- SHA-256: `742db0b70694042b7e5cfcb7d4ab3ad0ef442ce0ab2466226086c0ccc0733716`
- Recorded source commit: `faaedebb7e87cd47d303245d452b7a01149d5be4`
- Recorded source tree: `1fae7b3c275a1060a575c9317277724f62051996`
- Release map schema: 2, with per-release manifest identity, source path, package, and hashes.
- Rollback is pinned to the unchanged 1.11.1 alias archive and SHA-256 `46918c6c52bd0bcae123950e038e4db3feadd30fa1bc514758e8e411d00c3b60`.
- Focused release test independently checks package hash, ZIP manifest identity/version/minimum host, exact source-tree member list, single Store tile, and historical 1.8.0-1.11.1 archive hashes.

## Verification

Green before the implementation commit:

- 11 focused Jest suites, 141/141 tests: identity/loader alias inventory, state/config/data migration, config transaction rollback, GCCE/IFTTT canonicalization, backup aliases, Store rename migration, public path/API compatibility, overlay registry, runtime i18n, and release-map schema 2.
- Backup baseline: 46/46 tests.
- Focused plugin Store route/migration tests passed.

Final release checkpoint:

```text
PASS test/streammonsters-product-contract.test.js
PASS test/streammonsters-release-v112.test.js
PASS test/streammonsters-release-map-v2.test.js
Test Suites: 3 passed, 3 total
Tests: 19 passed, 19 total
```

`git diff --check` passed before the release commit.

## Known constraints and integration note

- `plugin-lifecycle-routes` cannot spawn bundled Node inside the managed sandbox (`EPERM`); the underlying focused lifecycle/alias coverage passed elsewhere in the Task 1 suites.
- The pre-existing `streammonsters-routes-security` baseline expects no `portraitArenaVariant` but the current baseline supplies `classic`; this was not caused or modified by Task 1.
- Python is unavailable in this worktree environment, so the Python release-bundle validator is dynamically skipped; package structure/hash/source membership are covered by Jest.
- A separate review agent was requested as prescribed, but the collaboration pool was full. No review findings were available before handoff.
- Important: after merging other Task 2-5 plugin-source commits, rebuild the 1.12 archive and update its release-map/Store hash plus `sourceCommit`/`sourceTree`. The package in this branch is intentionally bound to the Task 1-only canonical source commit and will otherwise omit later slices.
