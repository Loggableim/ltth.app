# Startup Dependency Self-Healing Design

## Context

The `stt-ticker` plugin can fail before its `init()` method runs when the local
`@deepgram/sdk` installation is incomplete. The current launcher checks a fixed
list of package directories, but it does not include every production
dependency and does not verify that boot-critical packages can actually be
loaded. A package directory can therefore exist while an internal entry file
is missing.

## Goal

Make every LTTH installation self-healing at startup: detect missing direct
production dependencies and load failures in boot-critical dependencies,
reinstall from the lockfile when needed, verify the repaired tree, and only
then start the backend.

## Non-goals

- Do not load every optional or browser-only package with `require()`; ESM and
  client-side packages may not be valid CommonJS server dependencies.
- Do not change STT provider selection, API-key handling, plugin configuration,
  or transcription behavior.
- Do not reinstall dependencies when the installed tree passes verification.

## Approaches considered

1. Add only `@deepgram/sdk` to the existing fixed directory list. This is a
   small targeted change, but it misses future dependencies and still would
   not detect a missing internal SDK file.
2. Run `npm ci` on every startup. This catches corruption, but adds unnecessary
   network and startup cost and rewrites a healthy installation.
3. Verify all direct production dependency directories and explicitly load the
   boot-critical CommonJS packages, reinstall only on failure, then verify
   again. This catches the reported Deepgram failure while avoiding false
   positives for optional/browser-only packages. This is the selected approach.

## Design

### Dependency discovery

`verifyCriticalDependencies()` reads `app/package.json` and treats every key in
`dependencies` as a required installed package. It checks each package path
under `node_modules`, including scoped names such as `@deepgram/sdk`. The
existing server boot list remains the loadability list and is extended with
`@deepgram/sdk`.

### Loadability verification

For each boot-critical package, the launcher attempts a normal CommonJS load
from the app root. A thrown error, including a missing nested file such as
`@deepgram/sdk/dist/cjs/api/index.js`, marks that package as invalid and records
the package name and error for the launcher log. Optional and browser-only
packages are not loaded by this check.

### Repair flow

`checkDependencies()` performs verification on every launcher start. If the
node_modules directory is absent, a direct dependency is missing, or a
boot-critical package cannot load, it runs the existing lockfile-aware
installer. After installation it runs the same verification again. If the
second verification still fails, startup aborts with the concrete dependency
errors instead of launching a backend that will fail during plugin loading.

The existing dependency-state marker remains an optimization for package-file
changes, but it is never allowed to bypass the direct verification. A healthy
installation still avoids reinstalling.

### Tests

Focused Jest coverage will prove:

- all declared direct dependencies, including scoped packages, are checked;
- a boot-critical package with a missing nested module is reported invalid;
- a valid dependency tree does not trigger installation;
- `checkDependencies()` reinstalls after a verification failure and performs
  the post-install verification;
- an unresolved post-install failure is surfaced rather than silently accepted.

## Acceptance criteria

- A fresh or repaired install containing `@deepgram/sdk@5.5.0` loads
  successfully before the server starts.
- Removing `@deepgram/sdk/dist/cjs/api/index.js` causes the launcher to invoke
  the existing dependency installer automatically.
- A healthy installation does not run `npm ci` on every start.
- Existing launcher tests and the full applicable verification suite remain
  green.
- No unrelated files in the user's dirty main worktree are modified.
