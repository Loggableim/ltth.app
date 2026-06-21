# Contributing To This Snapshot

This project is currently a local snapshot. There is no Git history in the workspace, so contribution workflow means disciplined local changes, clear documentation, and focused verification.

## Core Rules

- Read `AGENTS.md` before work.
- Treat `app/` as the runtime source of truth.
- Keep changes scoped.
- Do not reintroduce stale Electron assumptions unless Electron is explicitly restored.
- Do not edit `docs_archive/` for active behavior.
- Do not delete user configs, runtime databases, logs, or uploaded assets unless explicitly requested.

## Code Style

- JavaScript uses CommonJS.
- Use 2 spaces.
- Use single quotes where the surrounding file does.
- Code and comments should be English.
- User-facing German UI/docs may stay German.
- Use existing module patterns and helpers.

## Logging

Use:

- `logger` in backend modules
- `this.api.log()` in plugins

Avoid `console.log` in production runtime paths. Console output is acceptable only in bootstrap code that runs before the logger exists, scripts, or tests.

## Error Handling

- Wrap async external calls in `try/catch`.
- Return useful HTTP status codes and JSON errors.
- Keep sensitive values out of logs.
- Preserve cleanup paths for sockets, timers, WebSocket clients, intervals, and plugin listeners.

## Database

- Use existing `DatabaseManager` helpers when available.
- Use prepared statements for direct SQL.
- Add migrations defensively with `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` guards, or existing migration patterns.
- Consider profile scoping. Many stats/settings are profile-specific.

## Plugins

Plugins should:

- define `plugin.json`
- export a class with `constructor(api)`, `init()`, and `destroy()`
- register backend routes through `api.registerRoute()`
- register sockets through `api.registerSocket()`
- register TikTok events through `api.registerTikTokEvent()`
- store persistent data through `api.getPluginDataDir()` or database settings

When changing plugin lifecycle, verify enable/disable/reload behavior.

## Documentation

Update active docs when behavior changes:

- `README.md` for setup/runtime commands
- `DOCUMENTATION_INDEX.md` for doc structure
- `docs/SNAPSHOT_STATUS.md` for workspace-level facts
- `infos/ARCHITECTURE.md` for system structure
- `infos/DEVELOPMENT.md` for commands/workflow
- `infos/PLUGIN_DEVELOPMENT.md` for plugin contracts
- `app/wiki/` for German user-facing behavior

## Verification

After dependencies are installed:

```bash
cd app
npm test
npm run build:css
npm run lint
```

For focused work, run the nearest tests first. Examples:

```bash
npx jest test/plugin-state-persistence.test.js
npx jest test/gift-deduplication.test.js
npx jest test/tts-api-key-validation.test.js
```

## Preparing For GitHub Later

When the owner creates a real Git repository later:

- Commit the cleaned snapshot first.
- Add dependencies through lockfiles generated from the cleaned package manifests.
- Re-enable only workflows that match existing paths.
- Add Electron workflows only after Electron source files exist again.
