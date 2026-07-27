# Task 5 report: management routes and abuse controls

## Status

Implemented the complete authenticated Worker management surface requested by
Task 5 in commit `d27a0fdc` (`feat(overlay-router): add authenticated
management routes`).

The implementation is intentionally not wired into `src/index.js`; Task 6 owns
the final public/management dispatch composition. Task 5 exports a host-aware
handler that Task 6 can call for every incoming request. It returns `null` only
when the request path is outside the reserved management namespace, and it
returns a neutral `404` for that namespace on every host except the exact
management host.

## Files

- `cloudflare/overlay-router/src/rate-limit.js`
  - Defines the four approved fixed-window policies.
  - Hashes account, device, and source-IP bucket identities before persistence.
  - Uses the Task 2 atomic `consumeRateLimit` repository operation.
- `cloudflare/overlay-router/src/audit.js`
  - Records only the approved sanitized event fields.
  - Schedules opportunistic 90-day pruning through Worker `waitUntil` when
    available.
- `cloudflare/overlay-router/src/management.js`
  - Selects, authenticates, validates, authorizes, executes, sanitizes, and
    responds for every documented management route.
  - Uses only the explicit Task 4 authenticator for each endpoint family.
- `cloudflare/overlay-router/test/management.test.js`
  - Runs in `@cloudflare/vitest-pool-workers` against the real local D1 binding,
    Task 2 repository, Task 3 schemas, and real Task 4 device credential
    verification.

No Task 1-4 production file and no desktop/runtime file was changed.

## Exported handler interface for Task 6

Primary factory:

```js
createManagementHandler({
  repository,
  env,
  now,                  // optional () => epoch milliseconds
  authenticateClerk,    // optional test/composition injection
  authenticateDevice,   // optional test/composition injection
  authenticateAdmin,    // optional test/composition injection
  clerkAuthOptions,     // optional Task 4 verifier options
  adminAuthOptions      // optional Task 4 verifier options
}) -> async function handleManagementRequest(request, context = {})
```

The production defaults make the required explicit Task 4 choice:

| Endpoint family | Authentication entry point |
| --- | --- |
| enrollment, account, claims, device revocation | `authenticateClerkManagementRequest` |
| lease update/close and device status | `authenticateDeviceRequest` |
| administrative release | `authenticateOverlayAdminRequest` |

There is no generic authenticator and no Clerk/device fallback.

Handler return contract:

- path outside `/_ltth/v1` -> `null`;
- reserved management path on a non-HTTPS URL or host other than the exact
  `overlay.ltth.app` -> neutral `404`;
- exact management route -> a completed `Response`;
- unknown route or wrong method in the reserved namespace -> neutral `404`.

Task 6 should call the handler before public entry/proxy routing and return a
non-null result directly. In particular, it should call it for opaque-host
requests too, so `/_ltth/v1/*` is rejected before proxy selection.

Convenience/contract exports:

```js
createManagementHandlerFromEnvironment(env, repository, options)
isManagementPath(pathname)
MANAGEMENT_HOST === "overlay.ltth.app"
MANAGEMENT_PREFIX === "/_ltth/v1"
DEVICE_ID_HEADER === "x-ltth-device-id"
DEFAULT_MAX_ACTIVE_DEVICES === 5
```

`context.waitUntil(promise)` is optional. When Task 6 passes the Worker
execution context, pruning is scheduled without delaying the response.

## HTTP contract

Every JSON mutation requires `Content-Type: application/json`, uses the exact
Task 3 schema and schema-specific byte bound, and rejects unknown fields.
Successful and domain-error JSON responses have `Cache-Control: no-store`;
neutral errors use the complete Task 3 neutral response helper.

| Method/path | Auth | Request contract | Success |
| --- | --- | --- | --- |
| `POST /devices/enroll` | Clerk | `{ "label": string }` | `201 { device, credential }` |
| `GET /account` | Clerk | no body | `200 { claims, devices, lease }` |
| `POST /claims` | Clerk | `{ "username": string }` | `201 { claim }` |
| `POST /claims/:username/restore` | Clerk | `{}` | `200 { claim }` |
| `DELETE /claims/:username` | Clerk | `{ "username": string }` | `200 { claim }` |
| `DELETE /devices/:deviceId` | Clerk | `{}` | `204` |
| `PUT /lease` | device | Task 3 `leaseUpdate` body | `200 { lease }` |
| `DELETE /lease` | device | Task 3 `leaseClose` body | `204` |
| `GET /device/status` | device | `X-LTTH-Device-ID` header | `200 { device, lease }` |
| `POST /admin/claims/:username/release` | Clerk admin | `{}` | `204` |

The lease update body is:

```json
{
  "deviceId": "d-...",
  "instanceId": "process-instance-id",
  "tunnelOrigin": "https://one-label.trycloudflare.com",
  "expectedRevision": 1
}
```

`expectedRevision` is omitted only for activation/replacement. It is mandatory
and positive for a heartbeat/rotation close as defined by the Task 3 schemas.
The device ID in the body/header selects the record that Task 4 authenticates;
the account identity always comes from the authenticated device record.

The enrollment credential is 32 random bytes encoded as 64 lowercase hex
characters. The response returns it at top level exactly once. Only
`SHA-256(credential + OVERLAY_DEVICE_TOKEN_PEPPER)` is passed to
`repository.createDevice`.

Safe public/account shapes are:

```js
claim = {
  username,
  displayUsername,
  state,
  claimedAt,
  releaseRequestedAt,
  reusableAfter,
  updatedAt
}

device = {
  deviceId,
  label,
  createdAt,
  lastSeenAt,
  revokedAt
}

lease = {
  active: true,
  deviceId,
  instanceId,
  revision,
  updatedAt,
  expiresAt
}
// or { active: false }
```

These serializers deliberately exclude:

- `clerkUserId`;
- `routeKey`;
- `tokenHash`;
- plaintext credential;
- `tunnelOrigin`.

Domain failures are small machine-readable no-store JSON responses:

```json
{ "error": "claim_unavailable" }
{ "error": "claim_conflict" }
{ "error": "device_unavailable" }
{ "error": "active_device_limit_reached" }
{ "error": "lease_conflict" }
{ "error": "rate_limited" }
```

Authentication, schema/body, unknown-route, and internal availability failures
use Task 3 neutral fixed responses, so those boundaries never echo claims,
owners, credentials, tunnel origins, JWT details, path parameters, or parser
details.

## Claim lifecycle and `expectedUpdatedAt` propagation

Claim creation delegates the ownership decision to Task 2's single
`INSERT ... ON CONFLICT ... WHERE reusable_after <= now RETURNING` operation.
Every attempt receives a newly generated 128-bit route key. A current active or
cooldown claim therefore remains unavailable, while the first post-cooldown
winner atomically replaces ownership and persists the new key. The old opaque
host is no longer resolvable.

Owner release performs:

1. normalize the path username;
2. parse and normalize the confirmation username;
3. require exact equality of the two canonical values;
4. load the current claim and verify caller ownership plus `active` state;
5. copy `current.updatedAt` unchanged into
   `repository.releaseClaim({ expectedUpdatedAt })`;
6. choose an operation timestamp strictly later than that value, even when two
   HTTP operations arrive within the same clock millisecond;
7. set `reusableAfter` to exactly seven days after the accepted release
   timestamp.

Cooldown restore performs the same compare-and-swap discipline:

1. load the current claim and verify the same caller owns a `cooldown` row;
2. copy `current.updatedAt` unchanged into
   `repository.restoreClaim({ expectedUpdatedAt })`;
3. use a strictly later operation timestamp;
4. preserve the existing route key and display name.

If a concurrent transition changes `updated_at` between the read and write,
Task 2 returns `null`; Task 5 emits `claim_conflict` and does not retry using
new state. This is the required protection against delayed release/restore
retries.

Administrative release uses the separate allowlisted guard and Task 2
`forceReleaseClaim`. It removes the disputed row and route key immediately.

## Device, lease, and abuse-control behavior

The active-device bound defaults to five per account and may be configured with
`OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT` from 1 through 20. Invalid values fail
closed to the default. Enrollment checks the Task 2 active-device count before
creation; revocation is owner-scoped and Task 2 atomically removes a lease held
by the revoked device.

Fixed-window limits:

| Operation | Scope | Limit/window |
| --- | --- | --- |
| claim attempt | Clerk account | 5/hour |
| claim attempt | source IP | 20/hour |
| enrollment attempt | Clerk account | 10/day |
| lease update attempt | device | 1/10 seconds |

Both account and source-IP claim buckets are consumed for each authenticated,
schema-valid attempt, including ownership conflicts. Identities are SHA-256
hashed before becoming D1 bucket keys.

Lease behavior:

- Task 3 accepts only a canonical HTTPS one-label `trycloudflare.com` origin.
- Task 4 proves that the bearer credential owns the supplied device ID.
- omitted `expectedRevision` calls Task 2 `activateLease`, allowing the newest
  accepted enrolled device to replace the account lease;
- supplied `expectedRevision` calls Task 2 `renewLease`, preserving revision
  for the same origin and incrementing it for a changed origin;
- every accepted update sets expiry to exactly 120 seconds after its operation
  timestamp;
- close requires exact account/device/instance/revision matching;
- device status reports a lease as active only when that authenticated device
  currently holds it;
- device revocation deletes that device's active account lease immediately.

## Audit and retention

Each accepted or domain-rejected state operation records:

- generated event/request ID;
- canonical UTC timestamp;
- authenticated actor Clerk ID;
- fixed action identifier;
- affected canonical username and/or device ID where applicable;
- fixed sanitized result code;
- a safe `CF-Ray` request ID when present.

The recorder accepts only bounded identifier characters and never accepts
arbitrary descriptions or serialized requests. It has no parameter for a JWT,
credential/hash, tunnel origin, cookies, URLs, query strings, email, or owner
metadata.

After each audit insert, rows strictly older than 90 days are pruned
opportunistically. Task 6 should pass Worker context so this cleanup uses
`waitUntil`.

## TDD and verification evidence

The Worker-pool HTTP tests were created before any Task 5 production module.

Initial RED:

```text
npm test -- --run test/management.test.js
Test Files  1 failed (1)
Tests       no tests
Cannot find module './src/management.js'
```

Focused GREEN:

```text
npm test -- --run test/management.test.js
Test Files  1 passed (1)
Tests       17 passed (17)
```

Fresh full Worker package run after implementation:

```text
npm test
Test Files  6 passed (6)
Tests       118 passed (118)
Duration    3.52s
```

`git diff --check` completed with exit code 0 before the implementation
commit.

The tests cover:

- exact host/path namespace selection and opaque-host rejection;
- every documented endpoint;
- strict unknown-field, origin, header, and body-size rejection;
- credential generation/hash-only persistence and response non-reappearance;
- account claim/device/lease isolation and serialization sanitization;
- active-device, enrollment, account-claim, IP-claim, and heartbeat limits;
- first claim, conflict, seven-day cooldown, owner-only restore, and takeover;
- old/new route-key separation;
- lease activation, tunnel rotation revision, stale revision, expiry, close,
  newest-device replacement, and revocation;
- explicit Clerk/device/admin authentication separation;
- sanitized administrative audit output.

## Commits

- `d27a0fdc` - `feat(overlay-router): add authenticated management routes`
- report commit follows this implementation commit

## Concerns and Task 6/7 handoff notes

- Task 6 must pass every request through the host-aware management handler
  before public routing and must not treat a `null` result as an error.
- Task 6 must not add a second implementation of management host/path matching.
- Task 7 must use `X-LTTH-Device-ID` for `GET /device/status`; PUT/DELETE lease
  continue to carry `deviceId` only in their strict JSON bodies.
- Task 7 should treat `409 lease_conflict` as a revision/instance conflict and
  should not silently retry it as an omitted-revision activation unless it is
  deliberately starting a new process activation.
- The Worker configuration must provide the Task 4 Clerk values and should
  provide `OVERLAY_DEVICE_TOKEN_PEPPER`; omitting the pepper remains supported
  by the inherited Task 4 interface but is not recommended for production.
- No live deployment, DNS route, index wiring, desktop client, or public proxy
  behavior is part of Task 5.
