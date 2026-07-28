# Stable overlay routing operations runbook

This is a staged operator runbook for the stable TikTok Studio routing feature.
It does **not** record a Cloudflare deployment, D1 migration, DNS migration,
registrar change, Clerk change, or live tunnel test as completed.

Keep the architecture narrow:

```text
TikTok Studio -> https://overlay.ltth.app/<username>/<path>
                  307 -> https://r-<32-lowercase-hex>.ltth.app/<path>
                         -> current one-label https://*.trycloudflare.com hop
                         -> LTTH public-overlay allowlist
```

`overlay.ltth.app` is the exact public entry host. `r-<route-key>.ltth.app` is
an opaque internal routing host and must not be presented as the primary copy
result. The Worker owns public recovery/offline probes and proxying. The
desktop continues to expose only the exact one-label `*.trycloudflare.com`
Quick Tunnel hop; stable hosts, generic public hosts, nested tunnel labels, and
forwarded-host headers do not widen the desktop public surface.

Staging is deliberately not a `workers.dev` preview. Its exact entry authority
is `overlay-staging.ltth.app`, and its opaque authorities have the form
`r-<32-lowercase-hex>.overlay-staging.ltth.app`. Root, staging, and production
Wrangler configuration disable `workers.dev`, preview URLs, invocation logs,
logpush, tail consumers, streaming tails, and traces. Unknown environment
labels, runtime authority overrides, and `workers.dev` hosts fail closed.

## Safety and ownership boundaries

- Keep the registrar at Porkbun. Moving authoritative DNS to Cloudflare does
  not transfer registration.
- Never commit Cloudflare account, zone, or D1 database IDs; API tokens;
  Porkbun credentials; Clerk credentials; real Clerk user IDs; device IDs or
  bearer credentials; tunnel URLs; or a raw-path guard token.
- The checked-in `wrangler.jsonc` intentionally names the `OVERLAY_ROUTING_DB`
  binding and its local/staging/production database names, but contains no
  production identifier. Supply a real D1 binding only through an approved
  private deployment configuration or secret-managed CI environment.
- `.dev.vars` must remain private and untracked. Start from
  [`cloudflare/overlay-router/.dev.vars.example`](../cloudflare/overlay-router/.dev.vars.example),
  whose values are deliberately fake. Do not copy a production `.dev.vars`
  file between machines or into a support ticket.
- Never paste Clerk JWTs, device credentials, raw Worker responses, or tunnel
  origins into logs, incident tickets, shell history, or this repository.
- Never reuse a raw-path guard token between staging and production. Each
  environment has its own ordered marker-removal/marker-restore rule pair and
  its own 64-character token.

## Local Worker and D1 gate

From `cloudflare/overlay-router`:

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run d1:migrate:local
npm test
npm run test:raw-path-ruleset
npm run validate:raw-path-ruleset
npm run test:configuration
npm run dev
```

`d1:migrate:local` is the package's exact local command and applies migrations
to the `OVERLAY_ROUTING_DB` binding. The single checked-in migration creates
claims, devices, account leases, sanitized audit events, and rate-limit
buckets. It does not create a remote database.

The example Clerk endpoints are intentionally unusable; local authenticated
work requires a private test configuration for the existing LTTH Clerk
application. The example raw-path token is also deliberately fake. A local
request would need a matching `x-ltth-raw-path-guard` header only to exercise
the Worker guard; it does not replace Cloudflare's ordered Transform Rules.

Do not run `wrangler d1 migrations apply ... --remote`, `wrangler deploy`,
`wrangler secret put`, or any Cloudflare API command as part of this local
gate.

## Staging deployment gate (required before production)

These are commands to run only after an authorized operator has created the
staging D1 database and privately configured the `OVERLAY_ROUTING_DB` binding.
They are not evidence that any migration or deployment has occurred.

Before running them, Cloudflare must already be authoritative for the staging
host, `overlay-staging.ltth.app` must be configured as the Worker Custom
Domain, `*.overlay-staging.ltth.app/*` must be the proxied opaque Worker route,
and the staging-specific raw-path Transform Rules/token must be installed.
There is no `workers.dev` fallback.

```powershell
Set-Location cloudflare/overlay-router
npm ci
npm test
npm run test:raw-path-ruleset
npm run validate:raw-path-ruleset
npm run test:configuration
npx wrangler d1 migrations apply OVERLAY_ROUTING_DB --env staging --remote
npm run deploy:staging
```

Before the migration, inspect the target account/environment and confirm the
binding name is exactly `OVERLAY_ROUTING_DB`; do not infer a database from a
similar name. Capture the migration name, Worker version, operator, time, and
sanitized result in the release record, but never record IDs or secret values.

After the full staging end-to-end gate has passed, deploy and migrate the
production Worker while `LTTH_STABLE_OVERLAY_ROUTING_ENABLED` remains disabled:

```powershell
npx wrangler d1 migrations apply OVERLAY_ROUTING_DB --env production --remote
npm run deploy:production
```

This production deployment precedes DNS cutover and the production canary; it
does not itself enable the desktop feature or route user traffic.

### Worker configuration names

Store the following in Cloudflare's secret/configuration facility per
environment, never in Git or a committed Wrangler file:

| Name | Required behavior |
| --- | --- |
| `CLERK_ISSUER` | Exact issuer of the existing LTTH Clerk application. |
| `CLERK_AUTHORIZED_PARTIES` | Fixed comma-separated Clerk trust parties. A present JWT `azp` must match exactly; only when `azp` is absent may `aud` match. Never populate this from CORS or a request `Origin`. |
| `CLERK_JWKS_URL` | Optional HTTPS JWKS override; otherwise it is derived from the issuer. |
| `OVERLAY_ADMIN_CLERK_USER_IDS` | Comma-separated admin allowlist; use least privilege. |
| `OVERLAY_DEVICE_TOKEN_PEPPER` | Private server-side pepper for device-credential hashing. |
| `OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT` | Optional integer from 1 through 20; absent/invalid uses the code default of 5. |
| `OVERLAY_RAW_PATH_GUARD_TOKEN` | A unique per-environment 64-character URL-safe token shared only with that environment's ordered Cloudflare Transform Rules. Staging and production values must differ. |

The raw-path token must be installed only after the Ruleset API accepts the
four-rule transform: production remove/restore and staging remove/restore,
with a distinct replacement token for each restoration rule. Follow the
guarded API/Trace procedure in
[`rulesets/README.md`](../cloudflare/overlay-router/rulesets/README.md): it
removes caller-supplied markers first, restores a marker only for a safe raw
path, and requires real Trace plus staging evidence. If Trace cannot
distinguish a structural path case because of edge normalization, leave the
token unset: the Worker fails closed rather than weakening validation.

## DNS migration from Porkbun to Cloudflare

Plan this as a change window with a rollback owner. Before changing Porkbun
nameservers, export the complete Porkbun zone and make a record-by-record
comparison sheet containing every A, AAAA, CNAME, MX, TXT, CAA, SRV, and
third-party/domain-verification record. Include genuine child-zone delegation
NS records only when they exist. Do **not** recreate the old Porkbun
authoritative nameserver delegation as NS records inside the Cloudflare zone:
that delegation belongs at the registrar and will be replaced by Cloudflare's
nameservers. Record TTL, target/value, priority, and whether Cloudflare must
proxy each recreated record.

Inspect the registrar's DNSSEC DS state separately before delegation. Identify
whether a DS for the currently Porkbun-hosted zone exists and whether it points
to the old zone's signer; a stale DS can make an otherwise correct migration
fail validation.

1. Create the Cloudflare zone without changing the registrar.
2. Recreate and compare every exported record, including mail and verification
   records. Resolve every discrepancy before proceeding.
3. Keep the GitHub Pages apex and `www` records DNS-only for the initial move;
   verify `ltth.app`, `www.ltth.app`, HTTPS, MX/TXT, CAA, and verification
   records from independent resolvers.
4. Complete the Worker staging end-to-end gate on the exact
   `overlay-staging.ltth.app` Custom Domain and
   `*.overlay-staging.ltth.app/*` opaque route, including staging-token
   raw-path Trace acceptance evidence. Do not treat successful local tests as
   edge acceptance, and do not enable `workers.dev`.
5. After staging is accepted, migrate/deploy the production Worker and D1
   binding while the LTTH feature flag remains disabled. Prepare the Custom
   Domain, raw-path transform, and routing configuration, but do not treat
   their edge status as accepted until Cloudflare is authoritative.
6. Before changing delegation, disable/remove any old Porkbun-zone DS that
   does not belong to Cloudflare and verify at the registrar that the stale DS
   is absent. Do not publish a Cloudflare DS while Porkbun remains authoritative.
7. Change Porkbun nameservers to the Cloudflare-assigned nameservers. The
   domain remains registered at Porkbun throughout. Wait until Cloudflare is
   authoritative and the non-DNSSEC DNS/edge checks below pass.
8. Only then publish the DS supplied by Cloudflare at Porkbun, and validate the
   DS-to-DNSKEY chain with independent validating resolvers. If Cloudflare does
   not supply a DS or DNSSEC is intentionally disabled, verify that no stale DS
   remains instead.
9. Re-run the DNS and edge checks after propagation. Invite a production canary
   account only after those checks pass.

### Production Worker routing scope

Configure `overlay.ltth.app` as the Worker Custom Domain. Provision the
proxied first-level wildcard DNS needed for opaque route labels and attach the
actual Cloudflare first-level Worker wildcard route
`*.ltth.app/*` (not the apex). `r-*.ltth.app/*` is a conceptual hostname shape,
not the Worker-route literal to enter in Cloudflare. Cloudflare DNS/route
wildcards are not a substitute for application validation: `src/validation.js`
accepts only exactly `r-` plus 32 lowercase hexadecimal characters followed by
`.ltth.app`; all other hosts receive the Worker's neutral rejection.

Before activating `*.ltth.app/*`, create and test a reviewed list of literal,
more-specific exclusions for every existing non-routing first-level hostname.
The list must include `www.ltth.app/*` for the GitHub Pages website and every
additional first-level A/AAAA/CNAME service hostname found in the pre-cutover
inventory; the apex remains outside this wildcard route. Add a literal
exclusion before adding any future non-routing first-level hostname. A neutral
Worker response for a nonconforming host is not a safe substitute for an
exclusion that preserves another service's route.

The equivalent staging scope is intentionally narrower:
`overlay-staging.ltth.app` is the exact Custom Domain and
`*.overlay-staging.ltth.app/*` is the opaque wildcard route. Code accepts only
`r-<32-lowercase-hex>.overlay-staging.ltth.app` on that wildcard. A staging
opaque host, production opaque host, or entry host is never valid in the other
environment.

Post-change DNS/edge acceptance requires all of the following:

- `overlay.ltth.app` has a valid certificate and reaches the Worker;
- a syntactically valid opaque `r-<route-key>.ltth.app` host has a valid
  certificate and reaches the Worker;
- apex and `www` GitHub Pages remain reachable and DNS-only;
- mail, CAA, verification records, and DNSSEC validate as expected; and
- unrelated first-level hosts bypass the routing Worker.

## Canary, recovery, and three-tunnel evidence

The desktop feature is disabled unless
`LTTH_STABLE_OVERLAY_ROUTING_ENABLED` is exactly `true`; its API origin is
server-owned through `LTTH_STABLE_OVERLAY_ROUTING_API_ORIGIN`. Keep it disabled
through staging, production Worker deployment, and DNS/edge acceptance. Only
then enable it for one test Clerk account, with an explicit rollback owner and
observation window.

For that canary, retain a sanitized evidence record showing that one unchanged
stable entry URL:

1. enrolls a test device and explicitly claims a test username;
2. serves a registered overlay, required static assets, a read-only API, and
   permitted Socket.IO/WebSocket traffic; the only public POST exceptions are
   exact `/socket.io/` transport and exact
   `/api/streammonsters/overlay/heartbeat`;
3. blocks dashboard/Network Settings, unregistered paths, non-Socket.IO
   writes, disallowed methods, and unregistered Socket.IO events;
4. becomes the transparent offline page after stopping the Quick Tunnel, while
   non-navigation requests remain neutral and no stale target is used;
5. works again after a second distinct Quick Tunnel origin is published; and
6. works again after a third distinct Quick Tunnel origin is published.

For every rotation, record only a rotation ordinal, lease revision, timestamp,
test URL class, and pass/fail outcome. The test harness must compare each
current origin to every earlier origin in memory using a run-scoped HMAC-SHA256
fingerprint with a randomly generated key. It must record only
`distinct_from_all_previous: true` and the distinct-count result; it must not
persist the origin, fingerprint, or HMAC key, and must discard the in-memory
set/key when the evidence run ends. This provides proof of three distinct Quick
Tunnel origins without retaining URLs or creating a long-lived correlation
identifier. Do not retain the device credential, Clerk ID, route key, or query
values. The human-facing `overlay.ltth.app/<username>/...` entry URL remains
unchanged. Then verify device revocation, lease expiry (at most 120 seconds),
claim release/restore, and that public responses do not reveal owner or tunnel
details.

## Clerk, admin disputes, audit, and device incidents

### Clerk alignment

Use the existing LTTH Clerk application; do not create an unrelated issuer or
accept arbitrary audiences. The Worker verifies RS256 signatures against JWKS,
issuer, expiry/not-before, and a non-empty subject. If `azp` is present it must
exactly match the fixed authorized-party list; `aud` is considered only when
`azp` is absent. The desktop verifier uses fixed Clerk/account origins and
fixed local-development origins, never a CORS allowlist or the current request
`Origin`. Test sign-in, account management, claim creation, and revocation
with fresh tokens in staging. Do not store a long-lived Clerk JWT: desktop
startup uses only the scoped device credential.

### Enrollment retry and reconciliation

LTTH generates a `d-` plus 32-lowercase-hex device ID and a 256-bit credential,
then atomically stages both in the active profile before dispatch. The Worker
stores only the credential hash and returns device metadata. An exact
same-owner, same-ID, same-hash, same-label replay is an atomic no-op that does
not consume the enrollment rate or active-device limit; any conflicting replay
fails closed.

If a timeout or transport failure occurs after dispatch, do not generate a new
credential and do not continue account mutations. LTTH fences mutations and
uses `GET /account` to reconcile: a matching active device promotes the
pending credential, while a confirmed absence permits an exact retry with the
same pending material.

### Admin claim dispute

First-claim ownership does not prove TikTok ownership. An operator handling a
dispute must collect and review evidence outside the public Worker API, confirm
the target's canonical username, and use a fresh Clerk session belonging to a
least-privileged ID in `OVERLAY_ADMIN_CLERK_USER_IDS`. The only override is the
authenticated `POST /_ltth/v1/admin/claims/:username/release` request with the
strict empty JSON body. It immediately removes the disputed claim; it is not a
normal owner release/cooldown operation.

Record the case reference, canonical username, authorized operator, time,
HTTP outcome, and `CF-Ray` identifier if available. Never record the JWT,
email, owner ID, route key, tunnel origin, or device credential. Confirm that
the Worker audit action is `admin_claim_release`, then inform affected users
through the approved support channel. Do not infer an owner from conflict
responses.

### Audit retention

Audit rows are intentionally limited to event ID, timestamp, actor Clerk ID,
fixed action/result, optional canonical username/device ID, and `CF-Ray`. They
must never contain JWTs, credentials or hashes, cookies, tunnel origins, full
URLs, or query values. State mutations and their sanitized audit inserts are
atomic; the Worker opportunistically prunes rows older than 90 days through
`waitUntil`. Review retention with a private, access-controlled query/process,
and export only sanitized aggregates. A failed or delayed prune is an
operational alert, not permission to disable auditing or dump raw data.

Worker invocation logs, logpush, tails, and traces are disabled in every
checked-in environment. Use only sanitized aggregate counters and the bounded
audit rows above. Never enable raw request logging to diagnose an overlay
because requests can contain origins, route keys, cookies, or sensitive query
values.

### Proxy Origin and cache behavior

Polling, preflight, ordinary HTTP POST, and WebSocket upgrades share one Origin
contract. An absent `Origin` is accepted and remains absent on the desktop
subrequest. A present Origin is accepted only when it exactly equals the active
entry or opaque authority for that environment; the Worker rewrites that
accepted value to the validated Quick Tunnel origin only for the desktop hop.
Every other Origin is rejected before D1 target lookup or upstream fetch.
Responses preserve the original accepted Origin for CORS and include
`Vary: Origin` on success and neutral error paths so caches cannot mix variants.

### Suspected device-credential compromise

1. Treat the credential as exposed; do not test it, log it, or send it to
   support.
2. Authenticate the device owner with a fresh Clerk session and revoke the
   affected device through the owner-scoped management operation. Revocation
   removes that device's active lease immediately.
3. Stop the affected LTTH instance, remove only its local credential through
   the confirmed-revocation workflow, and re-enroll a replacement device if
   service should continue. A plaintext credential cannot be recovered because
   D1 stores only its hash.
4. Check sanitized audit records for enroll, lease, and revoke outcomes; rotate
   `OVERLAY_DEVICE_TOKEN_PEPPER` only under a separately reviewed plan because
   it invalidates existing credential-hash verification.
5. If the Clerk identity is also suspected, handle that identity incident in
   Clerk first; never use a device credential to change account ownership.

## Rollback

Prefer the narrowest rollback. For a Worker, D1, or route defect, disable
stable-routing activation in LTTH, retain the explicit temporary Quick Tunnel
copy action, and disable/remove only the Worker Custom Domain and opaque
routing route when needed. Keep claims and D1 data intact for recovery; do not
delete claims to make an incident appear resolved.

Keep apex and `www` GitHub Pages records untouched. Reverting authoritative
nameservers to Porkbun is a last-resort disaster recovery operation because
propagation is slow; use it only with the exported zone, reviewed DS/DNSSEC
state, and a record-by-record restoration plan. Any D1 restore/export must be
authorized, access-controlled, and sanitized in the incident record.

Before re-enabling the feature, repeat the staging/raw-path gate, one-account
canary, offline recovery, and three-distinct-tunnel rotation evidence. A
rollback is not a completed verification and must not be represented as one.

## Cloudflare references

- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/)
- [`workers.dev`](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
