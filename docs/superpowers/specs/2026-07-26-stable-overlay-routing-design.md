# Stable TikTok Studio Overlay Routing Design

**Status:** Approved design

**Date:** 2026-07-26

**Repository:** `Loggableim/ltth.app`

**Primary public hostname:** `overlay.ltth.app`

## Summary

LTTH currently exposes registered local overlays through an accountless
Cloudflare Quick Tunnel. This makes the overlays usable in TikTok Studio, but
the random `*.trycloudflare.com` hostname changes whenever the tunnel process
is restarted.

This design adds a stable routing layer:

```text
https://overlay.ltth.app/<tiktok-username>/<original-overlay-path>
```

For example:

```text
https://overlay.ltth.app/examplecreator/goals/overlay?id=goal-7
```

The stable URL resolves a Clerk-owned TikTok username claim, then transparently
routes the request through a stable internal hostname to the creator's current
Quick Tunnel. The existing LTTH public-surface registry remains the final
deny-by-default security boundary at the desktop server.

The implementation uses:

- the existing LTTH Quick Tunnel lifecycle;
- the existing Clerk account system;
- a Cloudflare Worker for routing and management APIs;
- Cloudflare D1 for durable claims, devices, active leases, and audit records;
- `overlay.ltth.app` for user-facing stable entry URLs;
- opaque first-level `r-*.ltth.app` hostnames for routing assets, APIs,
  Socket.IO, and WebSockets without rewriting every overlay.

## Goals

1. Keep a TikTok Studio overlay URL stable across LTTH and Quick Tunnel
   restarts.
2. Preserve every currently registered overlay path and its query parameters.
3. Allow one Clerk account to claim multiple TikTok usernames.
4. Ensure each normalized TikTok username belongs to at most one Clerk account.
5. Start the Quick Tunnel and publish the current route automatically after an
   enrolled LTTH installation starts.
6. Recover a stored TikTok Studio source automatically after LTTH comes back
   online.
7. Preserve the existing public-overlay HTTP and Socket.IO allowlists.
8. Keep the existing random Quick Tunnel URL available as an explicit temporary
   alternative.
9. Migrate authoritative DNS to Cloudflare without changing the `ltth.app`
   registrar or disrupting the GitHub Pages website.
10. Provide focused automated and real end-to-end evidence before the stable URL
    becomes the default copy action.

## Non-goals

1. This version does not prove TikTok account ownership through TikTok OAuth.
2. This version does not make Cloudflare Quick Tunnels production-grade or give
   them an uptime guarantee.
3. This version does not expose dashboard, configuration, administrative, or
   general LTTH routes publicly.
4. This version does not replace the existing Public Surface Register.
5. This version does not silently fall back from a stable URL to a random URL.
6. This version does not create a named Cloudflare Tunnel for every creator.
7. This version does not move `ltth.app` away from GitHub Pages.
8. This version does not add billing or paid URL tiers.

## User-facing URL contract

### Canonical entry URL

The canonical stable entry form is:

```text
https://overlay.ltth.app/<username>/<overlay-path-and-query>
```

Examples:

```text
https://overlay.ltth.app/examplecreator/animation-overlay.html
https://overlay.ltth.app/examplecreator/goals/overlay?id=goal-7
https://overlay.ltth.app/examplecreator/quiz-show/overlay/splitscreen?layout=portrait
```

The URL copied by LTTH always uses `overlay.ltth.app`. The internal routing
hostname is an implementation detail and is never displayed as the primary
copy result.

### Username normalization

LTTH and the Worker use one shared normalization contract:

1. trim surrounding whitespace;
2. remove one leading `@`;
3. normalize Unicode with NFKC;
4. convert ASCII letters to lowercase;
5. require 2 through 24 characters;
6. allow only ASCII letters, digits, underscore, and period;
7. reject slashes, encoded slashes, backslashes, control characters, whitespace,
   empty segments, `.` and `..`;
8. store and compare only the canonical lowercase form.

The initial implementation deliberately uses a conservative username grammar.
If TikTok changes its username rules, the shared validator and its contract
tests must be updated together.

### Overlay path preservation

The original registered overlay pathname and query semantics are preserved and
serialized with safe URL encoding. URL fragments are not sent to servers, but
the browser helper preserves a fragment in the copied stable URL when the local
overlay URL contains one.

The stable router does not invent alternate plugin paths. A URL is public only
when the existing local Public Surface Register accepts the routed request.

## Architecture

### Components

#### 1. LTTH desktop routing client

A focused LTTH module owns:

- device enrollment;
- claim listing, creation, restoration, and release;
- automatic Quick Tunnel startup;
- active lease publication;
- heartbeat scheduling and retry;
- stable URL construction;
- status data exposed to Network Settings;
- secure local persistence of the device credential.

This module composes the existing `NetworkManager` Quick Tunnel API. It does not
create a second overlay Quick Tunnel.

#### 2. Stable Overlay Worker

The Worker has two public traffic modes and one authenticated management API:

- `overlay.ltth.app/<username>/<path>` resolves the human-readable claim and
  redirects to an opaque routing hostname;
- `r-<route-key>.ltth.app/<path>` proxies HTTP and WebSocket traffic to the
  active Quick Tunnel;
- `overlay.ltth.app/_ltth/v1/*` manages devices, claims, leases, and account
  status.

The Worker is the only central internet-facing application added by this
design.

#### 3. Cloudflare D1

D1 stores:

- permanent username ownership claims;
- enrolled device credential hashes;
- one active account lease;
- release cooldown state;
- sanitized administrative audit records.

The Worker uses prepared statements for every query and mutation.

#### 4. Existing Quick Tunnel and LTTH Public Surface Register

The Worker fetches only strict HTTPS `*.trycloudflare.com` origins. The
subrequest therefore reaches LTTH through the same Quick Tunnel hostname that
the current public access middleware recognizes.

LTTH still makes the final authorization decision for:

- overlay entry pages;
- overlay assets;
- read-only data routes;
- Socket.IO transport;
- registered incoming and outgoing Socket.IO events.

The stable Worker is an additional outer filter, not a bypass.

### Routing hostnames

Each claim receives a random 128-bit route key encoded as a lowercase DNS-safe
string. The corresponding internal hostname is:

```text
r-<route-key>.ltth.app
```

It is a first-level subdomain so Cloudflare Universal SSL covers it after the
zone uses a full Cloudflare DNS setup.

The public username is not encoded into this hostname. Renaming, case handling,
and potentially sensitive account relationships therefore do not affect DNS
labels.

### Why the internal hostname is required

Many existing overlays use root-relative resources and default-origin
connections:

- `/css/...`;
- `/js/...`;
- `/api/...`;
- `/socket.io/`;
- `io()` without a custom Socket.IO path.

A pure `overlay.ltth.app/<username>/...` reverse proxy would lose the username
when those root-relative requests are made. Rewriting all HTML, JavaScript,
fetch calls, and Socket.IO clients would be fragile and would require every new
overlay to understand the central router.

Redirecting the stable entry URL to an opaque per-claim hostname gives every
request an unambiguous routing key while leaving existing overlays unchanged.
TikTok Studio stores the stable entry URL; the redirect remains transparent to
the user.

## Data model

### `claims`

| Column | Purpose |
| --- | --- |
| `username_key` | Canonical normalized TikTok username, primary key |
| `display_username` | Last user-facing spelling without `@` |
| `clerk_user_id` | Exclusive owner |
| `route_key` | Random unique internal routing identifier |
| `state` | `active` or `cooldown` |
| `claimed_at` | Initial claim timestamp |
| `release_requested_at` | Nullable release timestamp |
| `reusable_after` | Nullable end of the seven-day cooldown |
| `updated_at` | Last ownership-state change |

`clerk_user_id` is never returned by a public routing endpoint.

### `devices`

| Column | Purpose |
| --- | --- |
| `device_id` | Random public device identifier |
| `clerk_user_id` | Device owner |
| `token_hash` | SHA-256 hash of a random 256-bit bearer credential |
| `label` | User-visible installation label |
| `created_at` | Enrollment timestamp |
| `last_seen_at` | Last valid device request |
| `revoked_at` | Nullable revocation timestamp |

The plaintext bearer credential is returned exactly once during enrollment and
is never logged or stored in D1.

### `account_leases`

| Column | Purpose |
| --- | --- |
| `clerk_user_id` | Primary key and claim-owner join key |
| `device_id` | Device that currently owns the active lease |
| `instance_id` | Random identifier for the current LTTH process |
| `tunnel_origin` | Validated Quick Tunnel HTTPS origin |
| `revision` | Monotonic lease revision |
| `updated_at` | Last accepted heartbeat |
| `expires_at` | Hard lease expiry |

One Clerk account has one active public LTTH target. If two enrolled
installations start, the most recently activated valid device becomes active.
The Network Settings UI shows which local installation is active.

### `audit_events`

Audit events contain:

- event ID;
- timestamp;
- authenticated actor Clerk ID for administrative inspection;
- action type;
- affected canonical username when applicable;
- device ID when applicable;
- sanitized result code;
- Cloudflare request identifier.

Audit events never contain:

- Clerk JWTs;
- device bearer credentials or hashes;
- Quick Tunnel origins;
- request cookies;
- overlay query values.

The default audit retention is 90 days.

## Authentication and authorization

### Clerk-authenticated operations

The following operations require a fresh Clerk session JWT:

- enroll a device;
- list account claims and devices;
- create a claim;
- restore a claim during cooldown;
- release a claim;
- revoke a device.

The Worker validates:

- the JWT signature against the configured Clerk JWKS;
- supported signing algorithms;
- issuer;
- expiry and not-before time;
- authorized party or audience;
- subject presence.

The Worker's Clerk configuration must match LTTH's existing Clerk application.

### Device-authenticated operations

The following operations use the random device bearer credential:

- activate or replace the current account lease;
- send a heartbeat;
- close the current lease on graceful shutdown;
- read the device's own routing status.

A device credential cannot:

- create a new username claim;
- release or restore a claim;
- enroll another device;
- revoke another device;
- change the owning Clerk account.

### Local credential storage

LTTH stores the device ID and plaintext device bearer credential in the
OS-level LTTH application data directory managed by the existing configuration
path infrastructure. The file is outside plugin and source directories.

LTTH applies restrictive file permissions where the platform supports them.
The credential is never included in backups, diagnostics exports, logs, public
JSON, or plugin settings.

No long-lived Clerk JWT is stored for automatic startup. The scoped device
credential exists specifically to make startup heartbeats possible without
opening the dashboard.

## Claim lifecycle

### Initial claim

1. The user signs in through the existing LTTH Clerk experience.
2. LTTH has a confirmed current TikTok connection username.
3. Network Settings offers that canonical username.
4. The user explicitly selects **Claim TikTok username**.
5. LTTH displays the First-Claim limitation and requires confirmation.
6. If this installation is not enrolled yet, the browser sends the fresh Clerk
   JWT to the enrollment endpoint and LTTH stores the returned one-time device
   credential.
7. The browser sends the fresh Clerk JWT and canonical username directly to the
   claim endpoint.
8. D1 creates the claim only when the username is not active or reserved.
9. The Worker assigns a random route key.
10. LTTH starts or reuses its Quick Tunnel and activates the account lease with
    the enrolled device credential.

The initial claim is never triggered solely by connecting to a public TikTok
LIVE stream.

### First-Claim limitation

Without a TikTok Developer account and TikTok OAuth, Clerk proves the LTTH
account identity but not ownership of the TikTok username.

Version 1 therefore uses this accepted policy:

- the first authenticated Clerk account to claim an available canonical
  username owns it;
- the UI only offers the locally confirmed connected username;
- the user must explicitly acknowledge the limitation;
- claim creation is rate-limited and audited;
- conflicts do not reveal the owner's Clerk identity;
- an administrator can resolve disputes;
- TikTok OAuth ownership verification is a future migration, not a hidden
  promise of this version.

### Multiple usernames

One Clerk account may own multiple active claims. Every active claim resolves to
the account's single active lease and therefore to the same running LTTH
instance.

### Release and cooldown

1. The owner enters the canonical username again to confirm release.
2. The claim immediately enters `cooldown`.
3. Public routing for the claim stops immediately.
4. The same Clerk account may restore the claim during the next seven days.
5. Other Clerk accounts receive a neutral unavailable response during cooldown.
6. After seven complete days, the next authenticated claimant may take
   ownership.
7. A successful takeover receives a new random route key. Old internal routing
   hostnames never route to the new owner.

### Administrative dispute handling

Administrative claim actions require both:

- a valid Clerk session;
- the Clerk user ID to appear in the Worker's secret
  `OVERLAY_ADMIN_CLERK_USER_IDS` allowlist.

The initial administrative surface is an authenticated management API and
documented CLI procedure. A separate admin dashboard is outside this version.
Every override is audited.

## Device enrollment and automatic startup

### Enrollment

The first stable-routing activation enrolls the current LTTH installation:

1. the Worker verifies the Clerk JWT;
2. the Worker creates `device_id`;
3. the Worker generates a cryptographically secure 256-bit bearer credential;
4. D1 stores its SHA-256 hash;
5. the plaintext credential is returned once;
6. LTTH persists it in the OS application data directory.

Re-enrollment creates a distinct device. It does not silently revoke existing
devices.

### Startup sequence

When LTTH starts:

1. load the local device credential;
2. query the local Clerk profile state only for UI status;
3. start or reuse the overlay Quick Tunnel;
4. send an authenticated lease activation containing:
   - the strict tunnel origin;
   - the device ID;
   - a new process instance ID;
5. start the heartbeat loop;
6. expose stable-routing state in Network Settings.

The route becomes public only after the Worker accepts the lease.

### Heartbeat

- Normal interval: 30 seconds.
- Lease duration: 120 seconds.
- A heartbeat includes device ID, instance ID, expected revision, and current
  tunnel origin.
- A stale instance cannot overwrite a newer lease revision.
- A changed Quick Tunnel origin increments the revision.
- Graceful shutdown attempts to close the lease but correctness does not depend
  on that request succeeding.

### Retry behavior

Transient enrollment, activation, and heartbeat failures use exponential
backoff with jitter:

```text
2s, 4s, 8s, 16s, 30s maximum
```

A successful request resets the backoff. Authentication failures stop automatic
retries and require account or device action. LTTH never deletes a claim because
of a network failure.

## Worker request routing

### Stable entry request

For:

```text
GET https://overlay.ltth.app/<username>/<path>?<query>
```

the Worker:

1. parses and normalizes the username;
2. rejects reserved prefixes such as `_ltth`;
3. loads the active claim;
4. checks that an unexpired account lease exists;
5. emits a temporary `307` redirect to:

   ```text
   https://r-<route-key>.ltth.app/<path>?<query>
   ```

6. sets `Cache-Control: no-store`.

The redirect is intentionally not permanent, preventing TikTok Studio or an
intermediary from replacing the human-readable entry URL with an internal
implementation hostname.

### Internal routing request

For:

```text
https://r-<route-key>.ltth.app/<path>?<query>
```

the Worker:

1. validates the exact internal-hostname grammar;
2. resolves route key to an active claim;
3. joins the claim owner to an unexpired account lease;
4. builds a target URL from the validated tunnel origin plus original path and
   query;
5. applies the outer method filter;
6. strips sensitive and hop-by-hop headers;
7. proxies the request without buffering streaming WebSocket traffic.

### Outer method filter

The Worker accepts:

- `GET`;
- `HEAD`;
- `OPTIONS` required by public read-only browser requests;
- `POST` only for `/socket.io/` transport.

All other methods receive a neutral not-found response. The local Public Surface
Register remains authoritative for the exact path and event allowlists.

### Quick Tunnel target validation

An accepted target must satisfy all of these conditions:

- scheme is exactly `https:`;
- hostname is exactly one non-empty label followed by
  `.trycloudflare.com`;
- no username or password;
- no explicit port;
- pathname is exactly `/`;
- no query string;
- no fragment;
- serialized origin round-trips to the same value.

The Worker uses manual redirect handling. An upstream redirect is not followed.
The first version converts upstream redirects to a neutral gateway failure
rather than risking a redirect outside the registered surface.

### Header policy

The Worker removes from upstream requests:

- `Authorization`;
- `Cookie`;
- Clerk headers;
- device credential headers;
- Cloudflare management API headers;
- forwarded client certificate headers;
- hop-by-hop headers.

The Worker sets the target URL and lets the runtime derive the correct target
Host header.

The Worker removes from upstream responses:

- `Set-Cookie`;
- origin server identity and diagnostic headers;
- internal tunnel metadata;
- management or credential-shaped headers;
- hop-by-hop headers.

Public CORS headers are limited to the stable routing origins and the methods
allowed above.

### WebSocket and Socket.IO

WebSocket upgrade requests are proxied as streaming upgrade requests. The Worker
does not inspect Socket.IO event payloads; LTTH's existing public Socket.IO
adapter performs the event allowlist enforcement.

When a Quick Tunnel changes:

1. the old WebSocket disconnects;
2. the Socket.IO client retries the same stable internal routing hostname;
3. the Worker resolves the current lease again;
4. the new handshake reaches the new Quick Tunnel.

## Offline behavior

### Navigation requests

When a stable entry request has no valid lease, the Worker returns a minimal
transparent HTML page with status `200`. This avoids rendering a browser error
inside TikTok Studio.

The page:

- has a transparent background and no visible text;
- contains no account, claim, route-key, or tunnel details;
- preserves the originally requested URL;
- probes the same stable entry route with an internal probe parameter every
  four to seven seconds;
- reloads the original URL when the probe reports online;
- uses a restrictive CSP and no external assets;
- sets `Cache-Control: no-store`.

The internal probe returns `204` when online and `503` with `Retry-After` when
offline.

### Non-navigation requests

When offline:

- asset and API requests receive a neutral `404` or `503` without origin
  details;
- WebSocket upgrades receive `503`;
- no stale tunnel target is attempted after lease expiry.

## Public management API

All paths are versioned under:

```text
https://overlay.ltth.app/_ltth/v1/
```

The initial contract contains:

| Method and path | Authentication | Purpose |
| --- | --- | --- |
| `POST /devices/enroll` | Clerk JWT | Enroll current LTTH installation |
| `GET /account` | Clerk JWT | List own claims, devices, and active lease metadata |
| `POST /claims` | Clerk JWT | Claim available username |
| `POST /claims/:username/restore` | Clerk JWT | Restore own cooldown claim |
| `DELETE /claims/:username` | Clerk JWT | Start seven-day release cooldown |
| `DELETE /devices/:deviceId` | Clerk JWT | Revoke own device |
| `PUT /lease` | Device bearer | Activate or heartbeat current account lease |
| `DELETE /lease` | Device bearer | Best-effort graceful lease close |
| `GET /device/status` | Device bearer | Read own device and lease state |
| `POST /admin/claims/:username/release` | Clerk admin | Resolve a dispute |

Bodies have explicit size limits and strict schemas. Unknown fields are rejected
for authenticated mutation endpoints.

Public routing requests never share handlers with management endpoints.

## Abuse controls

The Worker enforces at least these limits:

- five claim attempts per Clerk account per hour;
- twenty claim attempts per source IP per hour;
- ten device enrollments per Clerk account per day;
- one accepted heartbeat per device per ten seconds;
- bounded request body sizes;
- bounded username and device-label lengths;
- bounded active device count per account.

Cloudflare edge protections handle volumetric traffic. Application limits protect
claim and device state from authenticated abuse.

Conflict responses use stable machine-readable codes but never return:

- owner Clerk ID;
- owner email;
- active device details;
- tunnel origin;
- audit history.

## LTTH user interface

### Network Settings section

Network Settings adds **Stable TikTok Studio URLs** with:

- Clerk sign-in status;
- local device enrollment status;
- current active-device status;
- active/offline/error route state;
- all owned TikTok username claims;
- selected default username;
- current connected TikTok username;
- last successful heartbeat;
- actionable authentication or conflict errors.

### Actions

The section provides:

- **Claim TikTok username**;
- **Restore username** during cooldown;
- **Release username**;
- **Set as default**;
- **Copy stable URL**;
- **Re-enroll this installation**;
- **Revoke device**;
- **Copy temporary Quick Tunnel URL**.

Release requires retyping the canonical username.

### Username selection for app-wide copy buttons

Existing **Copy TikTok Studio URL** buttons choose the stable username in this
order:

1. currently connected TikTok username when that name is actively claimed by
   the Clerk account;
2. the explicitly selected default claimed username;
3. otherwise open Network Settings and explain that a claim is required.

The helper never silently claims a username.

### Stable and temporary copy behavior

The current button becomes the stable default:

```text
Copy TikTok Studio URL
```

The random alternative remains explicit:

```text
Copy temporary Quick Tunnel URL
```

If the central service is unavailable, stable copy reports the failure. It does
not place a random URL on the clipboard without the user choosing the temporary
action.

## DNS and Cloudflare deployment

### Current state

At design time:

- `ltth.app` is registered and authoritatively hosted through Porkbun
  nameservers;
- the website resolves to GitHub Pages;
- `www.ltth.app` aliases the apex;
- `overlay.ltth.app` does not exist;
- no Cloudflare Worker deployment configuration is present in the repository.

### Full DNS migration

The domain remains registered at Porkbun. Only authoritative DNS moves to
Cloudflare.

Before changing nameservers:

1. export the complete Porkbun zone;
2. inventory A, AAAA, CNAME, MX, TXT, CAA, SRV, NS, and verification records;
3. inventory DNSSEC DS state at the registrar;
4. create the Cloudflare zone;
5. recreate every existing record;
6. compare source and destination record-by-record;
7. keep GitHub Pages records DNS-only for the initial migration;
8. verify mail and third-party verification records;
9. deploy and test the Worker on its `workers.dev` staging hostname;
10. prepare the Worker Custom Domain and D1 migrations;
11. change Porkbun nameservers only after the comparison passes;
12. replace or disable stale DNSSEC DS data as required by the Cloudflare
    activation flow.

### Worker host configuration

The production configuration uses:

- `overlay.ltth.app` as a Worker Custom Domain;
- a proxied wildcard DNS record for first-level subdomains used by opaque
  `r-<route-key>.ltth.app` hosts;
- a Worker route covering first-level subdomains;
- more-specific exclusions for every existing non-routing subdomain;
- code-level rejection of every hostname that is not exactly
  `r-<valid-route-key>.ltth.app`.

Adding a new non-routing first-level subdomain later requires adding a
more-specific route exclusion before enabling that hostname.

The apex `ltth.app` is not part of the wildcard Worker route.

### Secrets

Production secrets are configured in Cloudflare, never committed:

- Clerk issuer and authorized parties;
- Clerk JWKS configuration where an override is required;
- administrative Clerk user allowlist;
- device-token hashing pepper if used in addition to SHA-256;
- environment-specific audit settings.

Cloudflare API tokens, account IDs, zone IDs, Clerk secrets, and Porkbun
credentials are not stored in the repository.

## Observability and privacy

The Worker records aggregate metrics for:

- entry resolution success;
- offline entry responses;
- proxy success and failure by status class;
- WebSocket upgrade success;
- heartbeat acceptance and rejection;
- claim conflicts;
- lease expiry;
- device revocation.

Routine public request logs use the opaque route key or a one-way identifier.
They do not record overlay query strings because those may contain plugin or
scene identifiers.

LTTH logs:

- state transitions;
- sanitized Worker error codes;
- retry schedules;
- last successful heartbeat time.

LTTH does not log:

- device bearer credentials;
- Clerk JWTs;
- full public URLs when their queries may be sensitive;
- raw Cloudflare responses containing internal diagnostics.

## Testing strategy

### Worker unit and integration tests

Tests cover:

- username normalization and rejection;
- route-key generation and exact hostname validation;
- Clerk claim isolation;
- first-claim conflict behavior;
- multiple claims per Clerk account;
- release, cooldown, restore, and takeover with a new route key;
- device enrollment, hashing, revocation, and account boundaries;
- lease revision ordering;
- heartbeat timing and expiry;
- strict Quick Tunnel origin validation;
- SSRF and redirect rejection;
- method filtering;
- request and response header stripping;
- neutral error responses;
- transparent offline page and online probe;
- HTTP proxy path/query preservation;
- WebSocket upgrade proxying;
- rate limits;
- sanitized audit records.

### LTTH focused Jest tests

Tests cover:

- enrollment persistence outside source and plugin directories;
- startup Quick Tunnel activation;
- heartbeat scheduling and backoff;
- authentication failures stopping retries;
- tunnel rotation updating the lease;
- shutdown lease close;
- claim list and default selection;
- app-wide stable URL conversion;
- exact path, query, and fragment preservation;
- no silent fallback;
- explicit temporary URL behavior;
- Network Settings state and actions;
- localization coverage;
- existing public-overlay inventory and security matrix.

### Staging end-to-end test

The staging test uses a real Cloudflare Worker staging deployment and a
disposable LTTH instance:

1. enroll a test device;
2. claim a test username;
3. start a real Quick Tunnel;
4. load a registered overlay through the stable entry URL;
5. verify required assets and a read-only API;
6. verify allowed Socket.IO traffic;
7. verify unregistered incoming and outgoing events remain blocked;
8. verify dashboard and Network Settings are blocked;
9. verify non-Socket.IO writes are blocked;
10. stop the Quick Tunnel and observe the transparent offline state;
11. start a second Quick Tunnel and update the same lease;
12. verify the same stable entry URL works;
13. repeat until three distinct Quick Tunnel origins have used the same stable
    URL;
14. revoke the device and verify routing expires;
15. release and restore the claim;
16. confirm no response exposes owner or tunnel details.

### DNS migration checks

Before and after nameserver change, verify:

- apex A and AAAA records;
- `www` resolution;
- GitHub Pages HTTPS;
- MX and mail-related TXT records;
- CAA;
- domain-verification TXT records;
- DNSSEC validation state;
- `overlay.ltth.app` certificate and Worker response;
- an internal `r-...ltth.app` certificate and Worker response;
- unrelated existing subdomains bypass the routing Worker correctly.

## Rollout

### Phase 1: code-complete behind a feature flag

The stable service remains disabled by default. Temporary Quick Tunnel copy
continues to work.

### Phase 2: Worker staging

Run the full Worker and LTTH staging tests through `workers.dev`. No DNS change
is required for this phase.

### Phase 3: DNS migration

Migrate authoritative DNS only after the record inventory and staging tests
pass. Verify the GitHub Pages website before proceeding.

### Phase 4: one-account canary

Enable stable routing for one test Clerk account. Complete the three-tunnel
rotation test, WebSocket test, offline recovery, claim lifecycle, and security
matrix.

### Phase 5: opt-in release

Expose the Network Settings section to all signed-in users, but retain explicit
activation.

### Phase 6: stable copy becomes default

After the opt-in period is healthy, existing **Copy TikTok Studio URL** actions
use the stable route when the account has a valid claim. The temporary action
remains available separately.

## Rollback

Worker or D1 problems affect only stable overlay routing:

- disable stable-routing activation in LTTH;
- retain the temporary Quick Tunnel copy action;
- remove or disable the Worker Custom Domain and wildcard route if necessary;
- keep apex and `www` GitHub Pages records unchanged;
- retain the exported Porkbun zone for DNS disaster recovery.

Returning authoritative nameservers to Porkbun is a last-resort DNS rollback
because propagation is slow. Application rollback should normally disable only
the overlay Worker routes.

Claims are not deleted during rollback. They can be exported from D1 and
restored after service recovery.

## Acceptance criteria

The feature is accepted only when all of the following are true:

1. The same copied `overlay.ltth.app` URL works through at least three distinct
   Quick Tunnel origins.
2. All registered overlay entry points and their dependency crawl pass through
   stable routing.
3. Required read-only HTTP and allowed Socket.IO/WebSocket traffic work.
4. Dashboard, configuration, unregistered routes, disallowed methods, and
   unregistered Socket.IO events remain blocked.
5. One Clerk account can own multiple usernames.
6. A username cannot be active for two Clerk accounts.
7. A first claim requires an explicit user action and warning.
8. Release immediately disables routing and reserves the name for the same
   account for seven days.
9. A post-cooldown takeover uses a new route key.
10. Device revocation and lease expiry stop routing within 120 seconds.
11. LTTH startup republishes the current tunnel without requiring the dashboard
    to remain open.
12. The offline page is transparent and reloads automatically after recovery.
13. Public responses and logs do not expose Clerk IDs, credentials, or Quick
    Tunnel origins.
14. Existing `ltth.app` and `www.ltth.app` GitHub Pages service remains
    reachable after DNS migration.
15. Stable URL failure never silently copies a temporary URL.

## Explicitly accepted trade-offs

1. First-Claim ownership can be abused without TikTok OAuth. This risk is
   accepted for version 1 and mitigated, not eliminated.
2. Availability still depends on an accountless Quick Tunnel and the creator's
   computer.
3. A central Worker and D1 database become required for stable routing.
4. Authoritative DNS must move from Porkbun nameservers to Cloudflare.
5. The browser follows a temporary redirect from the human-readable URL to an
   opaque routing hostname.
6. Only one LTTH installation per Clerk account is the active public target at a
   time.

## Documentation references

- Cloudflare Quick Tunnels:
  `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/`
- Cloudflare Worker Custom Domains:
  `https://developers.cloudflare.com/workers/configuration/routing/custom-domains/`
- Cloudflare Worker Routes:
  `https://developers.cloudflare.com/workers/configuration/routing/routes/`
- Cloudflare Universal SSL:
  `https://developers.cloudflare.com/ssl/edge-certificates/universal-ssl/`
- TikTok Login Kit, documented for a future ownership-verification version:
  `https://developers.tiktok.com/doc/login-kit-overview`
