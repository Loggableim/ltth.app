# Stream Monsters 1.10 final review fix report

Date: 2026-07-28
Starting HEAD: `18dbffd320771dc1ca68c64879b936a9222e8987`
Scope: the two Important blockers in `final-review.md` only

## Outcome

Both blockers were reproduced test-first and fixed without live reload, runtime
restart, `main` integration, GitHub push, or publication.

1. An expired Rules-v7 action window remains reconnect-paused when a normal
   `autoStart: true` `BattleMatchService` performs its constructor sweep. The
   sweep candidate query skips an open reconnect pause, and
   `recoverActionMatch()` repeats that guard inside the existing SQLite
   `IMMEDIATE` transaction. Reconnect restoration continues to extend the
   persisted deadline and clear the pause in one SQL update before the snapshot
   is returned.
2. Avatar responses are consumed through `response.body.getReader()` in bounded
   chunks. The proxy never calls `response.arrayBuffer()`. As soon as
   decompressed bytes exceed 2 MiB it aborts the fetch, cancels the reader, and
   rejects the response without reading another chunk.

## TDD evidence

### RED

Command, using the bundled Node 22.14.0 runtime:

```powershell
C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe `
  .\node_modules\jest\bin\jest.js --runTestsByPath `
  ./test/streammonsters-battle-match-v5.test.js `
  ./test/streammonsters-identity-avatar-v110.test.js `
  --runInBand --silent
```

Observed before production changes:

```text
FAIL test/streammonsters-battle-match-v5.test.js
  auto-start sweep waits for reconnect restoration before timing out an expired Rules-v7 window
  Expected actionDeadlineMs 38000 and chargePauseReason "reconnect";
  received actionDeadlineMs null and chargePauseReason "cinematic" after timeout resolution.

FAIL test/streammonsters-identity-avatar-v110.test.js
  stops reading a chunked avatar as soon as decompressed bytes exceed 2 MiB
  Expected reader.read to be called 2 times; received 0 calls.

Test Suites: 2 failed, 2 total
Tests:       2 failed, 49 passed, 51 total
Exit code:   1
```

These failures directly proved the two reviewed defects: the constructor sweep
wrote timeout decisions before restoration, and the proxy used the whole-body
buffer instead of the response stream.

### GREEN

The same command after the minimal fixes:

```text
PASS test/streammonsters-battle-match-v5.test.js
PASS test/streammonsters-identity-avatar-v110.test.js

Test Suites: 2 passed, 2 total
Tests:       51 passed, 51 total
Snapshots:   0 total
Time:        2.219 s
Exit code:   0
```

The battle regression additionally asserts:

- the expired persisted deadline remains unchanged and reconnect-paused after
  construction;
- a second explicit `safeSweep()` reports `actionsExpired: 0`;
- no `source = 'timeout'` decision exists before restoration; and
- the restored public snapshot clears the pause and extends the deadline from
  38,000 ms to 47,000 ms.

The avatar regression additionally asserts:

- there is no `Content-Length`;
- the stream yields 1 MiB and then 1 MiB + 1 byte;
- only those first two chunks are read;
- `arrayBuffer()` is never called; and
- the fetch `AbortSignal` is aborted at the limit.

## Focused verification

Bundled Node version:

```text
v22.14.0
```

Focused covering suites:

```powershell
C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe `
  .\node_modules\jest\bin\jest.js --runTestsByPath `
  ./test/streammonsters-battle-match-v5.test.js `
  ./test/streammonsters-identity-avatar-v110.test.js `
  ./test/streammonsters-routes-security.test.js `
  ./test/streammonsters-jackpot-battle-v110.test.js `
  --runInBand --silent
```

```text
PASS test/streammonsters-battle-match-v5.test.js
PASS test/streammonsters-routes-security.test.js
PASS test/streammonsters-identity-avatar-v110.test.js
PASS test/streammonsters-jackpot-battle-v110.test.js

Test Suites: 4 passed, 4 total
Tests:       71 passed, 71 total
Snapshots:   0 total
Time:        2.034 s
Exit code:   0
```

Lint and whitespace:

```powershell
C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\npm.cmd `
  run lint -- --quiet
git diff --check
```

```text
eslint . --quiet
LINT_EXIT=0
DIFF_CHECK_EXIT=0
```

## Files changed

- `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- `app/plugins/streamalchemy/backend/streammonsters/avatar-proxy.js`
- `app/test/streammonsters-battle-match-v5.test.js`
- `app/test/streammonsters-identity-avatar-v110.test.js`
- `.superpowers/sdd/2026-07-28-stream-monsters-1.10-jackpot-arena/final-fix-report.md`

## Publication boundary

This fix wave is local to `codex/stream-monsters-1.10-jackpot`. No live plugin
reload, app restart, runtime acceptance, `main` merge, GitHub push, PR, or
release publication was performed.
