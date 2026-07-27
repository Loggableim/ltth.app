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

## Local Worker and D1 gate

From `cloudflare/overlay-router`:

```powershell
npm ci
Copy-Item .dev.vars.example .dev.vars
npm run d1:migrate:local
npm test
npm run test:raw-path-ruleset
npm run validate:raw-path-ruleset
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

```powershell
Set-Location cloudflare/overlay-router
npm ci
npm test
npm run test:raw-path-ruleset
npm run validate:raw-path-ruleset
npx wrangler d1 migrations apply OVERLAY_ROUTING_DB --env staging --remote
npm run deploy:staging
```

Before the migration, inspect the target account/environment and confirm the
binding name is exactly `OVERLAY_ROUTING_DB`; do not infer a database from a
similar name. Capture the migration name, Worker version, operator, time, and
sanitized result in the release record, but never record IDs or secret values.
Use the same ordered sequence for production only after the canary gates below
are accepted, replacing `staging` with `production` and using
`npm run deploy:production`.

### Worker configuration names

Store the following in Cloudflare's secret/configuration facility per
environment, never in Git or a committed Wrangler file:

| Name | Required behavior |
| --- | --- |
| `CLERK_ISSUER` | Exact issuer of the existing LTTH Clerk application. |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated approved local origins/audiences. |
| `CLERK_JWKS_URL` | Optional HTTPS JWKS override; otherwise it is derived from the issuer. |
| `OVERLAY_ADMIN_CLERK_USER_IDS` | Comma-separated admin allowlist; use least privilege. |
| `OVERLAY_DEVICE_TOKEN_PEPPER` | Private server-side pepper for device-credential hashing. |
| `OVERLAY_MAX_ACTIVE_DEVICES_PER_ACCOUNT` | Optional integer from 1 through 20; absent/invalid uses the code default of 5. |
| `OVERLAY_RAW_PATH_GUARD_TOKEN` | A unique 64-character URL-safe token shared only with the ordered Cloudflare Transform Rules. |

The raw-path token must be installed only after the Ruleset API accepts the
two-rule transform. Follow the guarded API/Trace procedure in
[`rulesets/README.md`](../cloudflare/overlay-router/rulesets/README.md): it
removes caller-supplied markers first, restores a marker only for a safe raw
path, and requires real Trace plus staging evidence. If Trace cannot
distinguish a structural path case because of edge normalization, leave the
token unset: the Worker fails closed rather than weakening validation.

## DNS migration from Porkbun to Cloudflare

Plan this as a change window with a rollback owner. Before changing Porkbun
nameservers, export the complete Porkbun zone and make a record-by-record
comparison sheet containing every A, AAAA, CNAME, MX, TXT, CAA, SRV, NS, and
third-party/domain-verification record. Record TTL, target/value, priority,
and whether Cloudflare must proxy it. Inspect the registrar's DNSSEC DS state
as a separate item; stale DS data can make an otherwise correct migration fail
validation.

1. Create the Cloudflare zone without changing the registrar.
2. Recreate and compare every exported record, including mail and verification
   records. Resolve every discrepancy before proceeding.
3. Keep the GitHub Pages apex and `www` records DNS-only for the initial move;
   verify `ltth.app`, `www.ltth.app`, HTTPS, MX/TXT, CAA, and verification
   records from independent resolvers.
4. Complete the Worker staging gate on the `workers.dev` staging hostname. Do
   not treat successful local tests as edge acceptance.
5. Prepare, but do not yet broadly enable, the production Custom Domain,
   routing DNS record, Worker route, D1 migration, and raw-path transform.
6. Only after the comparison and staging evidence are reviewed, change the
   Porkbun nameservers to the Cloudflare-assigned nameservers and complete the
   DNSSEC action that Cloudflare's activation flow requires. The domain remains
   registered at Porkbun throughout.
7. Re-run the DNS checks after propagation before inviting any canary account.

### Production Worker routing scope

Configure `overlay.ltth.app` as the Worker Custom Domain. Provision the
proxied first-level wildcard DNS needed for opaque route labels and attach the
Worker wildcard route only to `r-*.ltth.app/*` (not the apex). Cloudflare DNS
wildcards are not a substitute for application validation: `src/validation.js`
accepts only exactly `r-` plus 32 lowercase hexadecimal characters followed by
`.ltth.app`.

Before adding any unrelated first-level hostname, add and verify a more
specific Worker-route exclusion for it. Existing non-routing hosts, `www`, and
the GitHub Pages apex must bypass the routing Worker. Never use a broad
`*.ltth.app/*` route without reviewed exclusions for every non-routing host;
the Worker returns a neutral response for nonconforming hosts, but that is not
a safe substitute for preserving another service's route.

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
until staging, DNS, and routing checks pass. Enable it for one test Clerk
account first, with an explicit rollback owner and observation window.

For that canary, retain a sanitized evidence record showing that one unchanged
stable entry URL:

1. enrolls a test device and explicitly claims a test username;
2. serves a registered overlay, required static assets, a read-only API, and
   permitted Socket.IO/WebSocket traffic;
3. blocks dashboard/Network Settings, unregistered paths, non-Socket.IO
   writes, disallowed methods, and unregistered Socket.IO events;
4. becomes the transparent offline page after stopping the Quick Tunnel, while
   non-navigation requests remain neutral and no stale target is used;
5. works again after a second distinct Quick Tunnel origin is published; and
6. works again after a third distinct Quick Tunnel origin is published.

For every rotation, record only a rotation ordinal, lease revision, timestamp,
test URL class, and pass/fail outcome. Do not retain the tunnel origin, device
credential, Clerk ID, route key, or query values. The three successful origins
must be distinct, while the human-facing `overlay.ltth.app/<username>/...`
entry URL remains unchanged. Then verify device revocation, lease expiry (at
most 120 seconds), claim release/restore, and that public responses do not
reveal owner or tunnel details.

## Clerk, admin disputes, audit, and device incidents

### Clerk alignment

Use the existing LTTH Clerk application; do not create an unrelated issuer or
accept arbitrary audiences. The Worker verifies RS256 signatures against JWKS,
issuer, expiry/not-before, a configured authorized party or audience, and a
non-empty subject. Test sign-in, account management, claim creation, and
revocation with fresh tokens in staging. Do not store a long-lived Clerk JWT:
desktop startup uses only the scoped device credential.

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
