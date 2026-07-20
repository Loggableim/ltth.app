# Viewer Profiles Dashboard Cleanup

## Goal

Remove the stale `Viewer Profiles` entry and embedded view from the main dashboard while preserving the consolidated Viewer Profiles implementation inside `milestone-leaderboard`.

## Current behavior and root cause

The standalone `viewer-profiles` plugin directory no longer exists. Its functionality is embedded in `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard`, where the analytics database, API routes, UI document, and `/viewer-profiles/ui` route are still initialized. The dashboard still contains the old sidebar item and an iframe view that points at that route, so the retired standalone concept remains visible in navigation.

## Design

- Remove the `data-view="viewer-profiles"` sidebar item from `app/public/dashboard.html`.
- Remove the matching `view-viewer-profiles` iframe container from `app/public/dashboard.html`.
- Remove the now-unused top-level `navigation.viewer_profiles` translations and related generated inventory entries if they are only referenced by the deleted dashboard markup.
- Keep `app/plugins/milestone-leaderboard/vendor/viewer-leaderboard/viewer-profiles-ui.html`, its asset route, the Viewer Profiles analytics API routes, and the legacy plugin-loader aliases/migration handling.
- Keep `/viewer-profiles/ui` available as a hidden direct URL for existing bookmarks and deliberate access. It must not be advertised in the dashboard sidebar.

## Data flow

The consolidated plugin continues to initialize Viewer Profiles analytics and register `/viewer-profiles/ui` plus `/api/viewer-profiles/*`. The dashboard no longer creates a navigation path or iframe for the UI. Direct requests to the route continue to receive the existing UI document.

## Error handling

No runtime error handling changes are needed. Removing the dashboard references avoids loading the hidden UI during normal navigation; the existing route and asset validation remain unchanged.

## Testing

- Replace the legacy sidebar test assertions with a regression test that confirms the dashboard contains neither the Viewer Profiles sidebar item nor the embedded view.
- Add or retain a focused analytics test proving the `/viewer-profiles/ui` route remains registered and serves the consolidated UI path.
- Run the focused Viewer Profiles tests, then the normal app lint/build checks as available.
- Verify the live route still responds successfully after the app is restarted or reloaded through the normal runtime path.

## Scope boundaries

Do not remove Viewer Profiles tables, event integration, analytics APIs, the consolidated UI, legacy state migration, or unrelated dirty-worktree changes.
