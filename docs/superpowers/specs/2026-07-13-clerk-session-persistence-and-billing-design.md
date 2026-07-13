# Clerk Session Persistence and Billing Design

## Goal

Keep a user signed in to the LTTH desktop app across app restarts without
persisting a long-lived Clerk bearer token locally, and derive subscriber
access from Clerk Billing rather than manually maintained LTTH license
metadata.

## Current Failure Modes

- The local callback stores the Clerk token in `sessionStorage`. That storage
  is cleared when the app/browser tab closes.
- The local cookie is configured for fourteen days but contains a short-lived
  Clerk session token. Once that token expires, the backend correctly rejects
  it and the client displays the sign-in screen.
- Store entitlements currently read only `ltthLicense` and `ltthAccess`
  metadata. Clerk Billing's signed session claims (`pla` and `fea`) are ignored,
  so paid users are treated as free users.

## Design

### Session restoration

When the store starts and no valid local session can be restored, the client
begins the existing Clerk bridge sign-in flow automatically once. The account
portal already owns the durable Clerk browser session. If that session remains
valid, the bridge obtains a fresh Clerk token and returns immediately to the
local callback without asking for credentials.

The automatic attempt is guarded per page load. If Clerk has no active session
or the bridge fails, the app stops retrying and shows the existing explicit
sign-in UI. Sign-out continues to clear the local session and disables automatic
restoration for that page load.

The desktop app therefore never writes a durable Clerk bearer token to
`localStorage`, the database, or a plugin directory. The existing HttpOnly
cookie remains a short-term optimization only.

### Billing entitlement derivation

The backend will normalize Clerk's verified token claims before consulting any
legacy LTTH metadata:

- `pla` is parsed as Clerk's scoped plan value, such as `u:free` or
  `u:premium`.
- `fea` is normalized as the set of Clerk Billing feature slugs.
- `u:free` and `o:free` represent the free account. Any other valid plan is an
  active paid subscription and receives `subscriber` access.
- The account response includes the normalized active plan and Billing source
  for a truthful client display.
- Existing explicit `admin` and `closed-beta` grants are retained and merged;
  they are not replaced by billing checks.
- Legacy `ltthLicense` metadata remains a compatibility fallback for the
  beta-license path, but it must not downgrade a signed paid Billing claim.

The server keeps enforcing subscriber-only plugin access. The frontend uses the
same returned `subscriber` group only to render the appropriate action; it is
not the authorization boundary.

## Error Handling

- A missing or expired token triggers at most one automatic bridge restoration.
- An unsuccessful restoration leaves the user signed out and shows the manual
  sign-in option; it does not create a redirect loop.
- Missing `pla` or malformed Billing claims fall back to the free-beta behavior
  and are logged as non-sensitive diagnostics.
- A paid plan in a verified token always wins over stale or missing metadata.

## Tests

Add focused regressions that prove:

1. a missing local session starts exactly one automatic bridge restoration;
2. a failed automatic restoration exposes manual sign-in without looping;
3. `u:free` maps to a free entitlement;
4. a paid Clerk `pla` claim maps to `subscriber` access;
5. subscriber-only store installation accepts the paid claim and rejects the
   free claim; and
6. legacy admin and closed-beta access remains intact alongside Billing access.

Run the targeted Clerk/store suites, lint, and JavaScript syntax checks after
the implementation.
