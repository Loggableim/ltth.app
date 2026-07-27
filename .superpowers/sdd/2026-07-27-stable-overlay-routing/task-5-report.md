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

---

## Fix round 1/5: Important review findings

Fix commit:

- `1ed0d3c3` - `fix(overlay-router): close management route races`

This round addresses all four Important review findings. The two explicitly
deferred Minor observations were not changed.

### 1. Atomic active-device admission

Root cause:

```text
countActiveDevicesByOwner()
        |
        | another enrollment may observe the same count
        v
createDevice()
```

The former management flow used two D1 statements. Two controlled concurrent
requests both observed zero active devices and both returned `201`, exceeding a
limit of one.

Task 2's repository now exposes the narrowly scoped prepared D1 operation:

```js
repository.createDeviceWithActiveLimit({
  deviceId,
  clerkUserId,
  tokenHash,
  label,
  now,
  activeDeviceLimit
}) -> device | null
```

Its one statement is:

```sql
INSERT INTO devices (...)
SELECT ...
WHERE (
  SELECT COUNT(*)
  FROM devices
  WHERE clerk_user_id = ?
    AND revoked_at IS NULL
) < ?
RETURNING *
```

D1 evaluates the count predicate and insert as one write statement. There is
no management-layer count/read window. A null result maps to the existing
`409 active_device_limit_reached`; the generated unused credential is discarded
and never returned or persisted.

Two regressions cover this:

- the HTTP test uses a barrier around the old count boundary so the previous
  implementation deterministically produces the forbidden `201/201`, then
  verifies the new handler produces exactly `201/409`;
- the repository test launches two real
  `createDeviceWithActiveLimit(... activeDeviceLimit: 1)` D1 operations
  concurrently and verifies exactly one row/result is admitted.

Both tests use the Worker pool's real local D1 binding.

### 2. Authentication before dynamic-parameter validation

Root cause:

The route dispatcher previously decoded and normalized `:username` or
`:deviceId` before entering the endpoint handler. A malformed encoded value
therefore returned `400` without authentication, while the same endpoint shape
with a valid value returned `401`/`403`.

The dispatcher now only recognizes the route shape and passes the encoded
segment into its endpoint-specific handler. Each handler executes its explicit
Task 4 guard first:

| Dynamic endpoint | First operation |
| --- | --- |
| claim restore | Clerk management authentication |
| claim release | Clerk management authentication |
| device revocation | Clerk management authentication |
| administrative release | combined Clerk/admin authentication |

Only after successful authentication does that handler decode, enforce
canonical path encoding, and normalize the username/device ID. Authenticated
callers retain the same strict `400` validation semantics.

Worker HTTP regressions compare malformed `%` and valid dynamic values for all
four endpoint families. Every unauthenticated request now reaches the same
`401` boundary without parameter-detail disclosure.

### 3. State-authoritative, non-blocking audit semantics

Root cause:

Every mutation awaited `recordAuditEvent` after its D1 state change. If audit
persistence failed, the handler returned `503` even though the mutation was
already committed. For enrollment this stranded a valid device hash while
withholding its only plaintext credential.

The deliberate guarantee selected for this Worker is:

> A completed state mutation is authoritative. Audit is one bounded,
> best-effort asynchronous write/prune attempt and can never rewrite the
> mutation's HTTP result.

The shared management `record()` path now:

1. starts the sanitized `audit.record(...)` promise;
2. converts audit insert/prune rejection into a resolved background result;
3. passes that bounded promise to `context.waitUntil` when available;
4. never awaits it from the mutation response path;
5. ignores a synchronous `waitUntil` scheduling failure without changing the
   state result.

There is no retry loop and no unhandled rejection. The audit payload remains
the same bounded, sanitized Task 5 shape.

This semantics is applied centrally to enrollment, claim create/release/
restore, device revoke, lease update/close, and admin release, including
audited domain failures such as rate limits and conflicts.

The controlled regression makes `recordAuditEvent` fail for every attempt while
keeping every real state operation in D1. It proves:

- enrollment still returns `201` with the one-time credential;
- the stored hash matches that returned credential;
- claim success remains `201`;
- a first-claim conflict remains `409 claim_unavailable`, not `503`;
- lease activation remains `200`;
- claim release remains `200`;
- lease close, device revocation, and admin release remain `204`.

Task 6 must pass the actual Worker execution context to preserve the
`waitUntil` lifetime guarantee. If no execution context is supplied, the
promise remains rejection-safe but the runtime is not required to keep the
isolate alive for audit completion.

### 4. Controlled D1/repository interleavings

The management suite now includes four race families. The small proxy used by
the tests only inserts barriers or a real competing repository operation; all
state reads and writes still execute through the production Task 2 repository
against D1.

#### Enrollment admission

Two concurrent HTTP enrollment requests for one account and a limit of one.
Expected: one `201`, one `409`, one active D1 device.

#### Release/restore CAS

- Release: after the handler reads the active row, a real
  `repository.releaseClaim` commits first. The delayed handler carries the
  original `expectedUpdatedAt`; its update affects no row and returns
  `409 claim_conflict`.
- Restore: after the handler reads the cooldown row, real repository operations
  restore and release it again with newer timestamps. The delayed restore keeps
  the originally observed `expectedUpdatedAt`, affects no row, and returns
  `409 claim_conflict`.

These tests verify the final D1 state/version rather than inspecting method
arguments.

#### Revocation versus lease update

The device authenticates successfully, then a real
`repository.revokeDevice` wins before the delayed activation statement.
Task 2's device-active predicate rejects activation, Task 5 returns
`409 lease_conflict`, no lease exists, and the D1 device is revoked.

#### Competing device activations

Device A reaches activation first but is held at a barrier. Device B commits
revision 1, then A is released and commits revision 2. Both requests succeed,
and the final real D1 lease belongs to A with its exact instance ID and
revision 2. This confirms "newest accepted operation wins", independent of
request-start order.

### Fix-round TDD evidence

RED after adding the finding-specific tests and before production changes:

```text
npm test -- --run test/management.test.js
Test Files  1 failed (1)
Tests       6 failed | 24 passed (30)

Failures:
- concurrent admission returned [201, 201], expected [201, 409]
- audit outage returned 503 after device persistence, expected 201
- four malformed dynamic endpoint families returned 400, expected 401
```

Atomic-admission GREEN:

```text
npm test -- --run test/management.test.js -t "atomically admits"
Test Files  1 passed (1)
Tests       1 passed | 29 skipped (30)
```

Dynamic-auth GREEN:

```text
npm test -- --run test/management.test.js -t \
  "authentication boundary|authenticates malformed"
Test Files  1 passed (1)
Tests       8 passed | 22 skipped (30)
```

Audit-outage GREEN:

```text
npm test -- --run test/management.test.js -t "audit persistence fails"
Test Files  1 passed (1)
Tests       1 passed | 29 skipped (30)
```

Focused management plus repository verification:

```text
npm test -- --run test/management.test.js test/repository.test.js
Test Files  2 passed (2)
Tests       44 passed (44)
Duration    2.02s
```

Full Worker package verification before the fix commit:

```text
npm test
Test Files  6 passed (6)
Tests       132 passed (132)
Duration    4.32s
```

`git diff --check` completed with exit code 0 before commit.

### Fix-round residual concerns

- Audit availability is deliberately decoupled from mutation availability.
  During a D1 audit-specific outage, a state change can succeed without an
  audit row. This avoids false failure responses and the enrollment credential
  loss ambiguity. There is intentionally no retry queue in Task 5.
- The context-less handler form remains useful for tests/composition, but Task 6
  must pass `ExecutionContext` for background audit lifetime.
- No Task 6 wiring/deployment or Task 7 client behavior was added in this fix
  round.

---

## Fix round 2/5: user ruling for atomic mutation plus audit

The user selected Variant 1. This ruling supersedes Fix round 1's
state-authoritative/best-effort audit semantics for every successful state
mutation.

Fix commit:

- `61207314` - `fix(overlay-router): atomically audit state mutations`

### Governing acceptance guarantee

For every successful management state mutation:

```text
mutation accepted  <=>  state mutation AND sanitized audit insert commit
```

If the audit insert fails, D1 rolls back the mutation and the handler returns
the neutral retryable `503 Service Unavailable`. Enrollment therefore returns
no JSON and no plaintext credential, and D1 retains neither its device row nor
its credential hash.

Non-mutating results remain separate:

- schema and authentication failures remain neutral;
- rate limits and domain conflicts retain their documented JSON response;
- their optional result audit is bounded/best-effort and cannot convert a
  `409`/`429` into `503`;
- a conditional success-audit statement inserts no row when its preceding
  mutation changed no row.

This distinction prevents a failed ownership/revision comparison from creating
a misleading success audit while preserving stable conflict behavior.

### Sanitized event construction

`src/audit.js` now exports:

```js
createSanitizedAuditEvent(fields, {
  eventIdFactory // optional deterministic test seam
}) -> {
  eventId,
  occurredAt,
  actorClerkUserId,
  action,
  usernameKey,
  deviceId,
  resultCode,
  cfRayId
}
```

It validates canonical UTC and bounded safe identifiers before any mutation
statement is run. The production event ID remains 128 random bits with the
`a-` prefix. The event-ID factory exists only to induce a real D1 unique-key
failure deterministically in Worker tests.

The event shape has no field for route key, device credential/hash, Clerk JWT,
tunnel origin, URL/query, cookie, email, or request body.

`createAuditRecorder` exposes:

- `create(fields)` for an event that will be committed by the mutation batch;
- `record(fields)` for non-mutating domain-result audit;
- `prune(occurredAt)` for opportunistic post-commit 90-day pruning.

Pruning is not part of acceptance. It remains a bounded `waitUntil` cleanup and
cannot roll back a successfully accepted event/mutation.

### Task 2 repository transaction boundary

Successful management mutations pass `auditEvent` into the same production
Task 2 method that owns the state transition:

```js
claimUsername({ ..., auditEvent })
releaseClaim({ ..., expectedUpdatedAt, auditEvent })
restoreClaim({ ..., expectedUpdatedAt, auditEvent })
forceReleaseClaim(usernameKey, auditEvent)
createDeviceWithActiveLimit({ ..., auditEvent })
revokeDevice({ ..., auditEvent })
activateLease({ ..., auditEvent })
renewLease({ ..., expectedRevision, auditEvent })
closeLease({ ..., expectedRevision, auditEvent })
```

Prepared D1 batches use this order:

```text
1. prepared state mutation, normally with RETURNING
2. prepared sanitized audit insert:
   INSERT ... SELECT ... WHERE changes() = 1
3. tightly coupled trailing mutation when applicable
```

Cloudflare D1 `batch()` runs the statements as one transaction. A statement
failure rolls back every earlier statement in the batch. The conditional
second statement attempts the audit insert only when statement 1 changed
exactly one row.

Repository return handling reads the state row from the first batch result.
Zero-row ownership/CAS/revision/limit results return the same null/false
contract as before.

Special multi-write cases:

- Device revocation batches device update, conditional audit insert, and active
  lease deletion. Lease deletion is conditioned on the successful audit
  insert, so audit failure restores both device and lease.
- Audited lease activation/renewal batches lease mutation, conditional audit,
  and `last_seen_at` update. The device touch is conditioned on the audit
  insert. Audit failure therefore restores lease revision/origin/expiry and
  device metadata together.
- Lease close now uses `DELETE ... RETURNING` so it shares the exact generic
  mutation/audit transaction helper.

Task 2 methods still accept an omitted `auditEvent` for their existing
repository-level consumers/tests. Every Task 5 successful HTTP mutation
supplies one.

### Handler behavior

Task 5 builds the success event before calling the repository operation.

- A thrown batch/audit error reaches the existing neutral availability
  boundary and returns `503`.
- A zero-row mutation schedules only its sanitized non-mutating result audit
  and returns its original domain error.
- A successful batch schedules only retention pruning; it does not attempt a
  duplicate second audit write.

This is implemented for:

- enrollment;
- claim creation;
- claim release;
- cooldown restore;
- device revocation;
- lease activation;
- lease renewal/rotation;
- lease close;
- administrative release.

Release/restore continue to propagate the exact observed
`current.updatedAt` as `expectedUpdatedAt`. Moving their audit write into the
same batch does not add a read/retry or weaken compare-and-swap behavior.

### Controlled rollback tests

Each failure test first inserts one fixture audit event with ID
`a-controlled-duplicate`, then configures only the audit event-ID factory to
reuse that ID. The production repository and real local D1 binding remain
unchanged. The resulting unique-key violation occurs inside statement 2 of the
real mutation batch.

#### Enrollment

Expected and observed:

- neutral `503`;
- no credential JSON/text;
- no owner device row and therefore no stored hash;
- no `device_enroll` audit row.

#### Claim creation

Expected and observed:

- neutral `503`;
- no claim row;
- no `claim_create` audit row.

#### Lease activation

A normally enrolled/authenticated device attempts activation.

Expected and observed:

- neutral `503`;
- no account lease;
- no `lease_update` audit row.

#### Administrative release

A real claim exists before the allowlisted request.

Expected and observed:

- neutral `503`;
- original claim still exists with its route/ownership state intact;
- no `admin_claim_release` audit row.

All Fix round 1 race tests remain in the same focused suite and continue to
exercise atomic admission, release/restore CAS, revocation versus lease update,
and controlled competing device activations.

### Fix-round TDD and verification evidence

RED with the four user-ruling tests before production changes:

```text
npm test -- --run test/management.test.js -t \
  "atomic audit insert fails"
Test Files  1 failed (1)
Tests       4 failed | 29 skipped (33)

Observed old responses:
- enrollment: 201, expected 503
- claim creation: 201, expected 503
- lease activation: 200, expected 503
- admin release: 204, expected 503
```

Focused rollback GREEN:

```text
npm test -- --run test/management.test.js -t \
  "atomic audit insert fails"
Test Files  1 passed (1)
Tests       4 passed | 29 skipped (33)
```

Focused Task 5 plus Task 2 repository verification:

```text
npm test -- --run test/management.test.js test/repository.test.js
Test Files  2 passed (2)
Tests       47 passed (47)
Duration    3.68s
```

Full Worker package before commit:

```text
npm test
Test Files  6 passed (6)
Tests       135 passed (135)
Duration    7.23s
```

`git diff --check` and Node syntax checks for `audit.js`, `management.js`, and
`repository.js` completed with exit code 0 before commit.

### Fix-round residual concerns

- Application rate-limit bucket consumption happens before the state/audit
  batch and intentionally still counts the failed attempt. A retry is safe for
  claim/device/lease state, but the caller may need to respect the remaining
  fixed window (notably 10 seconds for a device lease update).
- Retention pruning is intentionally outside the acceptance transaction. Audit
  insertion itself is inside and mandatory; cleanup availability is not.
- The atomicity guarantee depends on Cloudflare D1 `batch()` transactional
  semantics and is exercised in the actual Worker pool with induced constraint
  failures.
- No Task 6 routing/deployment or Task 7 client change was added.
