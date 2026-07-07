# Plugin Migration Guide: Leaderboard & Viewer XP

## Summary
`viewer-leaderboard` is the single canonical plugin for the old `viewer-xp` and `leaderboard` feature set. There is no compatibility shim and no dual-run mode.

## Migration Steps
1. Remove any standalone `viewer-xp` or `leaderboard` plugin folder from `app/plugins/` if it still exists in an old checkout.
2. Keep `app/plugins/viewer-leaderboard/` as the only active plugin for this feature set.
3. Restart the server so the loader picks up the canonical entry point.
4. Update any external scripts, embeds, or plugin lookups to use `viewer-leaderboard` as the plugin id.
5. Leave the runtime routes alone if you already use them, because the plugin still exposes the existing `/viewer-xp/*`, `/api/viewer-xp/*`, and `/overlay/viewer-xp/*` endpoints.

## What Changes
- The standalone `viewer-xp` wrapper is removed.
- The standalone `leaderboard` plugin is replaced by `viewer-leaderboard`.
- There is no alias resolution, no supersede fallback, and no legacy plugin entry point to keep enabled.

## Validation
- `viewer-leaderboard` appears as the only active plugin for this feature set.
- `getPluginInstance('viewer-leaderboard')` resolves in integrations.
- No project file still requires `../plugins/viewer-xp/main.js`.
- Existing viewer data remains available through the shared application database.
