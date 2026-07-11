# Clerk Appstore Design

## Goal

Gate the LTTH plugin store behind Clerk authentication while keeping the rest of the local dashboard unchanged for this first account rollout.

## Scope

- Require Clerk login for plugin store listing, account state, installs, and updates.
- Keep the official LTTH plugin store as the only visible source.
- Remove community source controls from the dashboard UI and reject community source mutations in the store API.
- Add a Clerk account menu to the plugin store header.
- Show a Clerk sign-up/sign-in splash over the plugin store when no user is signed in.
- Prepare Clerk Billing authorization hooks without implementing per-plugin paid plans yet.

## Architecture

The backend uses Clerk Express middleware globally so route handlers can inspect Clerk auth state. Store routes receive a dedicated store-auth middleware and return JSON `401`/`503` responses instead of redirects. The frontend uses a small static `clerk-store-auth.js` helper that fetches public store auth config, loads Clerk's browser UI bundle from the Clerk frontend domain derived from the publishable key, mounts Clerk sign-in/sign-up UI into the splash, mounts Clerk's `UserButton` for account management, and provides token headers to `plugin-manager.js`.

## Data Flow

1. Dashboard loads `clerk-store-auth.js` before `plugin-manager.js`.
2. The helper fetches `/api/plugin-store/config`.
3. If Clerk is configured, the helper loads Clerk UI and initializes a Clerk client.
4. If signed out, the helper renders the store splash and prevents store API calls.
5. If signed in, `plugin-manager.js` calls store APIs with `Authorization: Bearer <session token>`.
6. Backend store routes verify the session with Clerk and then list/install official store plugins.

## Decisions

- Community source support remains in the internal `PluginStore` module for now, but the appstore routes and UI disable it. This avoids a large unrelated refactor.
- The local admin token and local profile modules remain unchanged.
- Secrets are read only from environment variables; only the Clerk publishable key is exposed to the browser.
- Billing is represented by backend auth context and Clerk `has()` compatibility, but paid plugin entitlements are not enforced until products/plans exist.
