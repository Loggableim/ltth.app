# Stable Overlay Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Give each claimed TikTok username a stable, Clerk-owned LTTH overlay URL at https://overlay.ltth.app/<username>/<registered-overlay-path>, while the current Quick Tunnel remains the only route to the desktop process.

**Architecture:** A Cloudflare Worker and D1 database own username claims, device credentials, and short account leases. The Worker redirects the human-readable entry host to an opaque r-<route-key>.ltth.app host, then proxies that request to the account's current strictly validated Quick Tunnel. LTTH automatically renews the lease with a locally stored device credential. The existing public-surface register remains the final HTTP and Socket.IO deny-by-default boundary.

**Tech Stack:** Cloudflare Workers ES modules, D1, Wrangler, Vitest with @cloudflare/vitest-pool-workers, Node/CommonJS, Express, Socket.IO, existing Clerk JWT verification, config-path-manager, Jest, jsdom, and Playwright staging smoke tests.

## Global Constraints

- Preserve app/modules/public-overlay-registry.js and app/modules/public-overlay-access.js as the final security boundary. Do not broaden their allowlists for the Worker.
- The Worker may only proxy an exact HTTPS one-label *.trycloudflare.com origin and must never follow upstream redirects.
- Never log Clerk JWTs, device credentials or hashes, Quick Tunnel origins, or public overlay URLs containing query values.
- Persist the device credential only under the active LTTH profile directory from config-path-manager; never in source, plugin data, browser storage, settings, backups, diagnostics, or logs.
- Keep stable routing disabled unless LTTH_STABLE_OVERLAY_ROUTING_ENABLED is exactly true. No production DNS, Worker, D1, Clerk, Porkbun, or Cloudflare secret change is part of the code implementation.
- Retain the existing temporary Quick Tunnel copier as an explicit alternate action. Stable-copy failure must never silently copy a random URL.
- Use the bundled LTTH Node runtime for native Jest when system Node has a mismatched better-sqlite3 ABI.

---

## Target layout and public contracts

Create a standalone Worker package:

    cloudflare/overlay-router/
      package.json
      wrangler.jsonc
      migrations/0001_initial_schema.sql
      src/index.js
      src/{validation,headers,auth,repository,rate-limit,audit}.js
      src/{management,public-router,proxy,offline-page}.js
      test/*.test.js

Desktop additions:

    app/modules/stable-overlay-routing-credentials.js
    app/modules/stable-overlay-routing-client.js
    app/modules/stable-overlay-routing-routes.js
    app/modules/stable-overlay-url.js
    app/public/js/stable-overlay-routing.js
    app/test/stable-overlay-*.test.js

Worker bindings and production-only secrets:

    OVERLAY_ROUTING_DB
    CLERK_ISSUER
    CLERK_JWKS_URL
    CLERK_AUTHORIZED_PARTIES
    OVERLAY_ADMIN_CLERK_USER_IDS
    OVERLAY_DEVICE_TOKEN_PEPPER
    OVERLAY_AUDIT_RETENTION_DAYS

The only desktop configuration is LTTH_STABLE_OVERLAY_ROUTING_ENABLED and LTTH_STABLE_OVERLAY_ROUTING_API_ORIGIN. The latter must be HTTPS except for the dedicated local test origin.

## Task 1: Scaffold and test the Worker project

**Files:**
- Create: cloudflare/overlay-router/package.json
- Create: cloudflare/overlay-router/wrangler.jsonc
- Create: cloudflare/overlay-router/src/index.js
- Create: cloudflare/overlay-router/test/worker-smoke.test.js

- [ ] Add pinned development dependencies for Wrangler, Vitest, and @cloudflare/vitest-pool-workers. Define test, test:watch, dev, deploy:staging, deploy:production, and d1:migrate:local scripts.
- [ ] Configure an ES module Worker, D1 binding named OVERLAY_ROUTING_DB, migrations directory, compatibility date, and separate staging/production environments. Do not commit account IDs, database IDs, zone IDs, secrets, or tokens.
- [ ] Start with a neutral 404 fetch handler and a Worker-pool test which proves the package runs against the local D1 binding.
- [ ] Run npm install and npm test in cloudflare/overlay-router. Commit only its package lock and source, never Wrangler state.

## Task 2: Implement D1 schema and repository transaction boundary

**Files:**
- Create: cloudflare/overlay-router/migrations/0001_initial_schema.sql
- Create: cloudflare/overlay-router/src/repository.js
- Create: cloudflare/overlay-router/test/repository.test.js

- [ ] Create claims, devices, account_leases, audit_events, and rate_limit_buckets tables. Use claims.username_key, devices.device_id, and account_leases.clerk_user_id as primary keys; route_key is unique.
- [ ] Model every approved column: ownership, display name, route key, active/cooldown state, claim/release/reusable timestamps; device owner/hash/revocation fields; account lease device/instance/tunnel/revision/expiry; and sanitized audit fields.
- [ ] Add indexes for active claims, route-key lookup, devices by owner, unexpired lease lookup, rate-limit expiry, and audit pruning.
- [ ] Store timestamps as UTC ISO-8601. Store only a device-token hash, never plaintext. Use prepared statements for all D1 queries and atomic batch/compare-and-swap mutations for claim and lease transitions.
- [ ] Test unique ownership, active/cooldown lookup, claim conflict, cooldown restore, expired takeover with a new route key, active-device replacement, revision ordering, lease expiry, and audit retention cleanup.

## Task 3: Build shared validation, header, and offline primitives

**Files:**
- Create: cloudflare/overlay-router/src/validation.js
- Create: cloudflare/overlay-router/src/headers.js
- Create: cloudflare/overlay-router/src/offline-page.js
- Create: cloudflare/overlay-router/test/validation.test.js
- Create: cloudflare/overlay-router/test/headers.test.js

- [ ] Implement normalizeTikTokUsername with trim, one optional leading @, NFKC, ASCII lowercase, the 2–24 [a-z0-9_.] grammar, and rejection of separators, encoded separators, controls, whitespace, empty, . and ...
- [ ] Generate 128-bit lowercase DNS-safe route keys and accept an internal host only when it is exactly r-<route-key>.ltth.app.
- [ ] Implement parseQuickTunnelOrigin requiring HTTPS, one label plus .trycloudflare.com, no credentials/port/query/fragment, pathname /, and serialized-origin round trip.
- [ ] Parse authenticated JSON bodies with explicit small limits, JSON-object requirement, allowed-field schemas, and bounds for labels, usernames, and instance IDs.
- [ ] Provide neutral no-store errors that reveal neither owner, device, route key, target origin, nor query value.
- [ ] Strip authorization, cookies, Clerk/device headers, forwarded-client-certificate headers, hop-by-hop headers, Set-Cookie, origin diagnostics, internal metadata, and credential-shaped response headers.
- [ ] Create a transparent asset-free offline page with restrictive CSP. It probes the stable entry with a reserved probe parameter every randomized 4–7 seconds and reloads only after a 204.
- [ ] Test malicious Unicode, slashes, percent encodings, host lookalikes, credentials, ports, hostile headers, malformed JSON, and offline-page leakage.

## Task 4: Implement Worker Clerk and device authentication

**Files:**
- Create: cloudflare/overlay-router/src/auth.js
- Create: cloudflare/overlay-router/test/auth.test.js

- [ ] Match the security properties of app/modules/clerk-store-auth.js without depending on Express: supported asymmetric algorithms only, JWKS cache/refresh, signature, issuer, expiry/not-before, authorized party/audience, and non-empty subject validation.
- [ ] Parse Clerk bearer tokens only for management endpoints and device bearer tokens only for lease/device-status endpoints.
- [ ] Hash device credentials with SHA-256 plus optional pepper before comparison; use constant-time comparison where supported.
- [ ] Reject revoked devices and cross-account access with stable neutral codes. Administrative release requires a valid Clerk session and a subject listed in OVERLAY_ADMIN_CLERK_USER_IDS.
- [ ] Test invalid signature, issuer/azp mismatch, expiry, unsupported algorithms, missing subject, JWKS refresh, missing/revoked device, hash mismatch, and admin allowlist behavior.

## Task 5: Implement management routes and abuse controls

**Files:**
- Create: cloudflare/overlay-router/src/rate-limit.js
- Create: cloudflare/overlay-router/src/audit.js
- Create: cloudflare/overlay-router/src/management.js
- Create: cloudflare/overlay-router/test/management.test.js

- [ ] Route only overlay.ltth.app/_ltth/v1/* to management. Reject those paths on opaque hosts.
- [ ] Implement POST /devices/enroll, GET /account, POST /claims, POST /claims/:username/restore, DELETE /claims/:username, DELETE /devices/:deviceId, PUT /lease, DELETE /lease, GET /device/status, and POST /admin/claims/:username/release.
- [ ] Enrollment creates a random device ID and 256-bit credential, persists only its hash, returns plaintext once, and enforces a bounded per-account active-device count.
- [ ] Claim creation atomically enforces first claimant ownership, active/cooldown conflicts, five account attempts/hour, twenty source-IP attempts/hour, and a new random route key. One account may have many claims.
- [ ] Release requires exact normalized username confirmation, immediately stops routing, applies a seven-day cooldown, and permits restore only to the same owner during cooldown.
- [ ] Takeover after cooldown atomically replaces ownership and produces a new route key so old opaque hosts cannot route to the new owner.
- [ ] Lease activation/heartbeat validates the tunnel origin, proves device ownership, accepts at most one update/device/ten seconds, compares expected revision, makes newest accepted device active, and sets expiry to 120 seconds.
- [ ] GET /account exposes only caller-owned claims/devices plus sanitized active lease state. Revocation invalidates an active lease immediately.
- [ ] Audit only request ID, action, actor, affected username/device, result code, and timestamp; opportunistically prune records after 90 days.
- [ ] Test every endpoint for schema rejection, isolation, limits, conflicts, cooldown/restore/takeover, revocation, revision/race behavior, and sanitized output.

## Task 6: Implement entry resolution, offline recovery, and strict proxying

**Files:**
- Create: cloudflare/overlay-router/src/public-router.js
- Create: cloudflare/overlay-router/src/proxy.js
- Modify: cloudflare/overlay-router/src/index.js
- Create: cloudflare/overlay-router/test/public-router.test.js
- Create: cloudflare/overlay-router/test/proxy.test.js

- [ ] Dispatch exact hosts: overlay.ltth.app serves entry and management routes; only r-<route-key>.ltth.app reaches proxying; every other ltth.app subdomain gets neutral 404.
- [ ] For an entry URL, normalize the first segment, reserve _ltth, resolve active claim plus unexpired account lease, preserve remaining path/query, and issue 307 no-store to the opaque host.
- [ ] The reserved probe parameter returns 204 only online and 503 Retry-After offline. Browser navigations without a lease get the transparent recovery page; assets/API/WebSockets get neutral unavailable responses.
- [ ] On opaque hosts allow GET, HEAD, OPTIONS, and POST exactly at /socket.io/. Reject method overrides and every other method.
- [ ] Resolve a current claim and lease for every proxy request; build its target only from the validated stored origin plus original path/query.
- [ ] Fetch with redirect manual, stream request/response bodies, preserve only safe response headers, turn upstream redirects into neutral gateway failure, and pass WebSocket upgrades without inspecting Socket.IO events.
- [ ] Test 307 path/query preservation, no permanent caching, stale lease behavior, transparent offline navigation/probe, method filter, allowed Socket.IO POST, SSRF/redirect rejection, header stripping, cookie stripping, and WebSocket proxying.

## Task 7: Add desktop credential storage and stable-routing lifecycle client

**Files:**
- Create: app/modules/stable-overlay-routing-credentials.js
- Create: app/modules/stable-overlay-routing-client.js
- Create: app/test/stable-overlay-routing-credentials.test.js
- Create: app/test/stable-overlay-routing-client.test.js

- [ ] Resolve one credential file per LTTH profile through config-path-manager and verify the final resolved path is inside the profile application-data directory and outside source/plugin paths.
- [ ] Persist only deviceId, credential, enrollment time, non-sensitive label, and the local profile's selected default claimed username using atomic replacement and restrictive permissions where supported. Explicitly exclude it from backup/export/diagnostics collectors.
- [ ] Inject networkManager, fetch, clock/timers, credential store, config, logger, and port getter. Never use globals directly.
- [ ] Expose sanitized routing states disabled, needs_auth, unenrolled, starting_tunnel, activating, active, offline, auth_error, and error; include revision and last successful heartbeat only.
- [ ] At startup, reuse networkManager.ensureOverlayQuickTunnel(port), generate new process instance ID, PUT the lease with device credentials, then heartbeat every 30 seconds.
- [ ] Retry transient errors with jittered 2/4/8/16/30-second backoff; reset after success; stop retries for auth/credential errors; never delete a claim/credential after a network failure.
- [ ] Publish tunnel rotation with a revisioned lease update. At shutdown, best-effort DELETE the lease, clear timers, and retain credentials.
- [ ] Test credential safety/atomicity, disabled mode, startup single-flight, tunnel reuse, heartbeat cadence, rotation, backoff, auth stop, and shutdown ordering.

## Task 8: Add safe local desktop routes and lifecycle wiring

**Files:**
- Create: app/modules/stable-overlay-routing-routes.js
- Modify: app/server.js
- Create: app/test/stable-overlay-routing-routes.test.js

- [ ] Register local routes beneath /api/stable-overlay-routing/ with existing API limits and after body parsing.
- [ ] Verify the existing Clerk session locally, then forward browser-authorized account/enrollment/claim/restore/release/revoke operations to Worker management using only a fresh in-memory Clerk bearer token. Implement default-username selection as a local profile preference after confirming it is one of the account's active claims.
- [ ] Keep device lease activation, heartbeat, tunnel target, and credentials completely within the desktop client. Browser JavaScript must never receive a device credential or an arbitrary tunnel-origin endpoint.
- [ ] Validate locally before forwarding; map Worker errors to documented sanitized local errors; redact upstream headers and fields.
- [ ] Construct the client with server dependencies, start it after the server begins listening only if feature-enabled, and stop it before networkManager.shutdown().
- [ ] Test local authorization, schema rejection, worker forwarding, credential non-leakage, error mapping, and lifecycle sequencing.

## Task 9: Change stable and temporary URL copy behavior

**Files:**
- Create: app/modules/stable-overlay-url.js
- Modify: app/public/js/tiktok-studio-url.js
- Create: app/test/stable-overlay-url.test.js
- Modify: app/test/tiktok-studio-url.test.js
- Modify: app/test/tiktok-studio-overlay-inventory.test.js
- Modify: app/test/tiktok-studio-game-engine-url.test.js

- [ ] Build stable URLs only after existing public-overlay-registry validates the local entrypoint. Select username in order: currently connected claimed TikTok name, selected active default claim, otherwise no selection.
- [ ] Preserve exact registered path, query semantics, and fragment. Reject dashboards, configuration paths, unregistered overlays, and malformed user names.
- [ ] Make Copy TikTok Studio URL request/copy only a successful stable URL. If no selectable claim exists, open/focus Network Settings with a claim-required message.
- [ ] Add Copy temporary Quick Tunnel URL with the existing ensure-and-copy mechanics as a distinct UI action and code path. Never use it as stable-copy fallback.
- [ ] Retain intentional external HTTPS behavior only where existing buttons target an external overlay; do not stable-route arbitrary URLs.
- [ ] Test every registry entrypoint for stable conversion, unregistered rejection, claimed-name preference, query/fragment preservation, claim-required feedback, and no silent fallback.

## Task 10: Implement Network Settings management UI and Clerk handoff

**Files:**
- Create: app/public/js/stable-overlay-routing.js
- Modify: app/public/dashboard.html
- Modify: app/public/js/network-settings.js
- Modify: app/public/js/clerk-store-auth.js only if it needs an in-memory fresh-token accessor
- Modify: app/locales/de.json
- Modify: app/locales/en.json
- Modify: app/locales/es.json
- Modify: app/locales/fr.json
- Create: app/test/stable-overlay-routing-ui.test.js
- Modify: app/test/tiktok-studio-network-settings.test.js
- Modify: app/test/i18n-consistency.test.js

- [ ] Add a Stable TikTok Studio URLs card showing sign-in, feature, enrollment, active/offline/error, active device, connected name, claim list, default selection, and heartbeat state.
- [ ] Add sign-in, claim, restore, release, set default, re-enroll, revoke device, copy stable, and copy temporary actions.
- [ ] Before initial claim, require an explicit First-Claim limitation acknowledgement. Prefill only the current locally connected TikTok username; never claim automatically.
- [ ] Release requires retyping the canonical name. Display cooldown and owner-only restore availability without exposing another account’s identity.
- [ ] Keep the new JS module independently DOM-testable; network-settings.js only integrates load/refresh and events.
- [ ] Retrieve Clerk JWTs only per user action from existing Clerk browser state and never persist them in local storage, DOM attributes, or the credential file.
- [ ] Add complete de/en/es/fr strings, accessible labels, confirmation/error/offline states, and explicit no-silent-fallback copy text. Run translation validation.
- [ ] Test all DOM state transitions, confirmation/release gates, disabled actions, clipboard outcomes, temporary-action separation, and locale coverage.

## Task 11: Re-prove public-surface security under stable routing

**Files:**
- Modify: app/modules/public-overlay-access.js only if host classification needs a narrow abstraction
- Modify: app/modules/public-overlay-socket-adapter.js only when required by that abstraction
- Modify: app/test/public-overlay-access.test.js
- Modify: app/test/public-overlay-security-matrix.test.js
- Modify: app/test/public-overlay-socket-events.test.js
- Modify: app/test/public-overlay-dependency-crawl.test.js

- [ ] Do not add desktop public paths for routing/recovery: those stay in the Worker. LTTH should still receive only existing registered overlay paths/assets/read APIs and allowed Socket.IO events through an exact Quick Tunnel host.
- [ ] Add regression cases covering the routed Quick-Tunnel hop: dashboard, settings, plugin management, mutations, overrides, unknown assets/API paths, and forbidden socket events remain unavailable.
- [ ] Run dependency crawl. Update the registry only if an already registered overlay requires a missing verified read-only asset, and then add the narrow rule and a regression test.

## Task 12: Document deployment, DNS migration, operations, and rollback

**Files:**
- Create: docs/stable-overlay-routing-operations.md
- Create: cloudflare/overlay-router/.dev.vars.example
- Modify: README.md or DOCUMENTATION_INDEX.md

- [ ] Document local Worker/D1 setup, migrations, staging test/deploy commands, secret names, and the rule that identifiers/tokens are never committed.
- [ ] Document Porkbun-to-Cloudflare migration: export and compare every A/AAAA/CNAME/MX/TXT/CAA/SRV/verification record, check DNSSEC DS, preserve GitHub Pages DNS-only initially, stage Worker first, and keep registrar unchanged.
- [ ] Document Worker setup: overlay.ltth.app custom domain, proxied first-level routing record for r-*.ltth.app, wildcard route, exact code-side validation, and exclusions for unrelated first-level hosts before they are added.
- [ ] Document Clerk alignment, admin dispute procedure, audit retention, device-credential incident response, flag/canary/rollback process, and required three-tunnel rotation evidence.

## Task 13: Verification and release gates

**Files:**
- Modify only when verification discovers a real defect in this plan’s scope.

- [ ] Run Worker tests: cd cloudflare/overlay-router; npm test.
- [ ] Run focused desktop Jest with the bundled runtime against stable-overlay-routing credentials/client/routes/url/UI tests, TikTok Studio URL/settings/inventory tests, and the public-overlay security matrix/socket/dependency tests.
- [ ] Run npm run i18n:check, npm run lint, npm run build:css, and git diff --check in the relevant project directories.
- [ ] After local tests, use a configured staging Worker and disposable profile/test Clerk account to prove enrollment, claim, registered overlay, asset, read API, allowed Socket.IO, forbidden paths/events/writes, transparent offline recovery, three Quick-Tunnel rotations, device revoke, release/restore, and non-disclosure.
- [ ] Treat production Worker deployment, nameserver change, and production default-on flag as separate explicit approval gates. Report them as not performed until external evidence exists.

## Review and integration checklist

- [ ] Keep implementation isolated on codex/stable-overlay-routing-design until focused tests and review pass.
- [ ] Inspect git status, git diff --check, and final diff for secrets, generated Worker state, credentials, environment files, and unrelated edits.
- [ ] Request focused review of D1 races, Clerk verification, SSRF/proxy/header policy, credential persistence, and no-silent-fallback behavior.
- [ ] Before merging, re-run relevant checks, prove the branch is based on current origin/main, and integrate only through a clean integration worktree after user approval.
