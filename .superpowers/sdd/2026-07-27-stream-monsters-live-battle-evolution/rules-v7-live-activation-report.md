# Rules v7 live activation report

## Scope

- Changed the StreamAlchemy runtime boundary to normalize current Stream
  Monsters configuration to Rules v7 and instantiate the real
  `StreamMonstersBattleMatchService` with Rules v7.
- Changed route configuration and no-service fallback snapshots to report
  Rules v7 on state, creator-state, and battle-state surfaces.
- Kept explicit Rules-v5 and Rules-v6 match/replay fixtures and resolver paths
  unchanged.
- Did not start, stop, restart, or reload the app or plugin.

## Test-first evidence

The focused activation contracts were written before production changes. The
first run failed with `Expected: 7, Received: 6` at the real plugin service and
route/config boundaries:

```text
Test Suites: 5 failed, 5 total
Tests:       10 failed, 96 skipped, 106 total
```

After the minimal version-boundary changes, the same command passed:

```text
Test Suites: 5 passed, 5 total
Tests:       10 passed, 96 skipped, 106 total
```

## Compatibility and static verification

Focused stored Rules-v5/Rules-v6 replay and resolver contracts passed:

```text
Test Suites: 2 passed, 2 total
Tests:       6 passed, 37 skipped, 43 total
```

Focused ESLint over the two production files and five changed test files
exited 0. `git diff --check` over the scoped changes also exited 0.

## Files

- `app/plugins/streamalchemy/index.js`
- `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- `app/test/streammonsters-plugin-integration.test.js`
- `app/test/streammonsters-creator-retention-v6.test.js`
- `app/test/streammonsters-gameplay-v2.test.js`
- `app/test/streammonsters-core-rules-v3.test.js`
- `app/test/streammonsters-routes-security.test.js`
