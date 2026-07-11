# Security Guide

This guide applies to the current LTTH snapshot.

## Priorities

- Protect API keys and credentials.
- Validate all external input.
- Keep plugin storage update-safe and path-safe.
- Avoid XSS in dashboard, plugin UIs, and overlays.
- Avoid command/path injection in file, upload, and launcher-related code.
- Keep rate limits on public or high-impact endpoints.

## Secrets

Do not commit real credentials.

Use:

- `app/.env`
- dashboard settings backed by SQLite
- plugin config stored through `api.setConfig()`

Sensitive examples:

- `EULER_API_KEY`
- OpenAI keys
- Speech/TTS provider keys
- OpenShock/PiShock credentials
- OBS passwords
- webhook secrets

## Input Validation

Validate:

- request bodies
- query parameters
- usernames
- TikTok event payloads
- uploaded filenames
- plugin IDs
- filesystem paths
- URLs
- webhook payloads

Use existing `modules/validators.js` where possible.

## Database Safety

- Prefer existing database helper methods.
- Use prepared statements for direct SQL.
- Store JSON as strings only after safe serialization.
- Parse JSON defensively.
- Keep profile scoping in mind for user stats and settings.

## Plugin Safety

Plugins run inside the same Node process, so a plugin bug can affect the whole app.

Require plugins to:

- clean up timers, intervals, sockets, and listeners in `destroy()`
- use `api.getPluginDataDir()` for persistent files
- validate route input
- avoid global mutable state unless intentional
- avoid logging secrets

## File And Upload Safety

- Normalize and validate paths before read/write/delete operations.
- Do not trust uploaded ZIP structure.
- Prevent directory traversal.
- Keep file size limits.
- Keep plugin upload extraction isolated in a temp directory before moving files.

## Frontend Safety

- Escape user-generated content before inserting into HTML.
- Prefer `textContent` over `innerHTML` for untrusted values.
- Keep CSP changes narrow and route-specific.
- Watch plugin UIs and overlays for inline script requirements before loosening CSP globally.

## Network Safety

- Keep rate limiters on API, auth, upload, plugin, and IFTTT routes.
- Be conservative with CORS and bind mode settings.
- Treat externally exposed tunnel/network modes as high risk.

## Before Release Or Upload

Before publishing to GitHub later:

```bash
cd app
npm audit
npm test
npm run build:css
npm run lint
```

Also scan for accidental secrets in `.env`, docs, plugin examples, logs, and archived notes.
