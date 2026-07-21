# Launcher Startup Hardening Design

## Goal

Make Windows first installation and restart behaviour predictable: the launcher must use portable Node 22 before installing production dependencies, avoid synchronous database integrity scans during ordinary starts, retain profile-switch restart supervision, fail fast for a foreign port owner, and remove stale launcher UI processes on the next launch.

## Scope

- Windows GUI launcher source in `build-src/launcher-gui.go` and its Go tests.
- Node launcher supervisor in `app/modules/launcher.js` and its Jest tests.
- Database startup validation in `app/modules/database.js` and targeted Jest coverage.
- No change to user profile data, SQLite schema, installer scripts, plugin behaviour, or release publishing.

## First-Install Pipeline

`downloadAndApplyUpdate()` only downloads and extracts the `app/` release. It must not invoke npm because `l.nodePath` is not initialized at that point. After `checkNodeJS()` selects or installs portable Node 22, Phase 3 installs dependencies exactly once with the selected runtime:

```
release download and extraction
  -> portable Node 22 selection
  -> npm ci --omit=dev
  -> native module verification
  -> backend startup
```

The GUI launcher uses `npm ci --omit=dev` whenever a valid lockfile is present. A failed install reports the command failure rather than silently performing a second `npm install` fallback. The Node-only launcher uses the same production dependency arguments when it must repair a dependency tree outside Go-launcher management.

## Backend Supervision

The Go launcher remains the authority for Node availability, dependency state, native-module verification, port cleanup, and health monitoring. It starts `app/launch.js` with `LTTH_GO_LAUNCHER_MANAGED=true`.

With this flag, the Node launcher skips its duplicate Node/npm/update/dependency/native checks and directly invokes its existing `startServer()` supervisor. `startServer()` continues to respawn `server.js` after exit code 75, so profile switching keeps its current 1.5-second graceful handoff and the Go launcher continues to own the outer process lifetime.

Without the flag, `app/launch.js` keeps its standalone preflight and repair behaviour for direct developer use.

## Database Integrity Policy

`DatabaseManager` no longer executes `PRAGMA integrity_check` during normal constructor startup. SQLite open errors and malformed/corrupt errors keep their existing recovery path. Manual launcher database repair remains the explicit diagnostic mechanism and already performs a dedicated quick check before maintenance work.

This removes the mandatory full scan of large profile databases from every launcher restart. It does not rewrite, vacuum, delete, or migrate user data as part of ordinary startup.

## Port and Launcher Lifecycle

The GUI launcher treats its configured preferred port as the only startup port because it passes that same value as both `LTTH_PORT` and `LTTH_MAX_PORT`.

1. It stops a detected healthy LTTH backend once.
2. It removes a stale managed LTTH owner on that selected port when necessary.
3. It checks the selected port one final time.
4. If a non-LTTH process still owns it, it reports the process owner and does not spawn Node.

The second redundant healthy-server sweep is removed. The current launcher stays open on a foreign-port conflict so the user can choose another port. At launcher startup, Windows-only cleanup closes older sibling `launcher.exe` processes from the same installation only when they have no managed LTTH Node descendant. A current launcher and any launcher actively supervising a backend remain untouched.

## Test Strategy

- Go unit tests cover: dependency installation is deferred until Node selection; npm uses `ci --omit=dev`; Go-managed Node launching sets the supervisor flag; the selected-port conflict prevents Node spawn; only orphaned sibling launchers are targeted; and the existing exit-code-75 supervisor contract remains unchanged.
- Jest tests cover: managed mode skips duplicate Node-launcher preflight; standalone mode retains it; and ordinary `DatabaseManager` construction does not execute `integrity_check`.
- Production Go build: `go build .` in `build-src/`.
- Focused Go test command: `go test launcher-gui.go sysproc_windows.go launcher_gui_test.go`. The repository-wide Go test is currently blocked by unrelated missing legacy Cloud Launcher symbols in `launcher_test.go`.
- Focused Node tests use the existing launcher and database test suites. The full Jest run is not a completion criterion because this snapshot has known broad-suite runtime limitations.

## Non-Goals

- Do not make the backend listen before plugin initialization; readiness still means the configured plugins are available.
- Do not automatically run `VACUUM`, truncate WAL files, or move profile databases.
- Do not automatically kill an arbitrary third-party owner of the selected port.
- Do not close the current launcher when the user must choose another port.
