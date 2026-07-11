# LTTH Clerk Appstore Public-JWT Design

This document supersedes the earlier secret-gated Clerk appstore design and the central-backend draft. The implemented approach is local verification with public Clerk JWT material, so a fresh install does not need a per-install Clerk secret.

## Goal

Make the LTTH app store usable on fresh VM installs, GitHub-distributed builds, and the one-line installer path without requiring `LTTH_STORE_CLERK_SECRET_KEY` or `CLERK_SECRET_KEY` on each machine.

The installed app only needs public configuration:

- Clerk publishable key
- LTTH account portal URL
- Optional Clerk JWT public key or JWKS URL

All Clerk secret material remains optional and legacy-only. It is not required for normal store sign-in or installs.

## Architecture

- The local LTTH app renders the store UI and owns the store session cookie.
- The Clerk auth portal at `ltth.app/auth` returns a Clerk session token to the local app.
- The local server verifies that Clerk session token with `CLERK_JWT_KEY` or Clerk JWKS.
- Verified store sessions are persisted as raw JWTs in an HttpOnly cookie.
- Authenticated users receive the default beta-free store entitlement so the official app store is usable immediately after sign-in.

## Runtime Flow

1. The app loads public store config.
2. The client loads Clerk using the publishable key only.
3. The user signs in through the auth bridge or the embedded Clerk UI.
4. The client posts the Clerk session token to `/api/plugin-store/session`.
5. The local server verifies the JWT with public key material and stores the raw token cookie.
6. `plugin-manager.js` uses the token for `/api/plugin-store/account`, `/api/plugin-store`, install, and update requests.
7. If the token expires or the origin is invalid, the store returns `401` and clears the cookie.

## Configuration Contract

Public in the installed client:

- `LTTH_STORE_CLERK_PUBLISHABLE_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `LTTH_ACCOUNT_PORTAL_URL`
- `CLERK_AUTH_BRIDGE_URL`

Public verification material:

- `LTTH_STORE_CLERK_JWT_KEY`
- `CLERK_JWT_KEY`
- `LTTH_STORE_CLERK_JWKS_URL`
- `CLERK_JWKS_URL`

Legacy-only, not required for normal installs:

- `LTTH_STORE_CLERK_SECRET_KEY`
- `CLERK_SECRET_KEY`

## Failure Modes

The store should distinguish these states:

- Missing public config
- Invalid or expired Clerk session token
- Disallowed token origin
- JWKS fetch failure

The UI should not report a secret-related setup failure when only the secret is absent.

## Non-Goals

- No per-install Clerk secret handling.
- No central backend dependency for basic store access.
- No community source support for the closed store.
- No separate license claim gate for basic official store usage.

## Acceptance Criteria

- A fresh VM install can open the app store without a local Clerk secret.
- The install can sign in through the LTTH account portal and return to the local app.
- The local app can read account state and perform store actions after JWT verification.
- The old "Clerk is not configured yet" secret-gate no longer appears when only the secret is missing.

## Notes

The earlier central-backend concept is still a valid future extension if LTTH later wants a shared auth service, but it is not required for the current working app store.
