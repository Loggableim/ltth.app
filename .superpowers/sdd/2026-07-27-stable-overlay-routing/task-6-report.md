# Task 6 Report: Stable Entry and Strict Public Proxy

## Status

Task 6 is implemented on `codex/stable-overlay-routing-design`.

Commits:

- `d1e95264` - `feat(overlay-router): route stable public overlays`
- `504f1a81` - `fix(overlay-router): enforce exact public authorities`
- `2ce5adf8` - `fix(overlay-router): reject ported dispatcher hosts`

The second commit closes the two Important findings from the read-only
security review and narrows CORS methods per path. The third also enforces the
same alternate-port rejection before injected public/proxy factories are
selected. No desktop/runtime file, deployment, DNS record, or live process was
changed.

## Worker fetch interface and dispatch order

`src/index.js` now exports:

```js
createOverlayRouterWorker(options = {}) -> {
  fetch(request, env, context) -> Promise<Response>
}
```

and its default export is the production Worker instance.

For every request the production `fetch` path:

1. creates the Task 2 D1 repository;
2. creates and invokes the Task 5 management handler with the original
   `request` and `ExecutionContext`;
3. returns every non-null management response directly;
4. only then considers entry or proxy routing.

The public host decision is exact:

- `https://overlay.ltth.app` reaches stable entry resolution after management;
- `https://r-<32 lowercase hex>.ltth.app` reaches proxying;
- every other authority receives a neutral no-store `404`.

Non-default ports are rejected in entry and opaque routing. The Task 5 handler
received the same narrow exact-authority correction so an alternate-port
management request cannot mutate state before the public dispatcher sees it.

The optional factories are dependency seams for Worker-pool contract tests.
Production still uses `createOverlayRepository`,
`createManagementHandlerFromEnvironment`, `createPublicRouter`, and
`createProxyHandler`.

## Stable entry resolution and offline recovery

`createPublicRouter({ repository, now })` accepts only HTTPS GET/HEAD requests
on the exact entry authority. It:

- decodes and normalizes only the first path segment with the Task 3 username
  normalizer;
- rejects the reserved `_ltth` segment;
- resolves the current active claim;
- validates the stored route key against the exact opaque-host grammar;
- resolves an unexpired, non-revoked-device account lease at the injected
  current timestamp;
- preserves the remaining encoded path and complete query string;
- returns an empty `307` with `Cache-Control: no-store` and `Pragma: no-cache`.

The reserved `_ltth_probe` query parameter returns an empty no-store `204`
only with a current claim and lease. A stale/missing lease returns an empty
`503` with `Retry-After: 5`.

Offline browser navigation returns the Task 3 transparent recovery page.
Explicit Fetch Metadata is authoritative: only `navigate`, `document`, or
`iframe` qualifies. `Accept: text/html` is a compatibility fallback only when
Fetch Metadata is absent, so CORS/API/fragment requests remain neutral `503`
responses.

Missing claims and invalid/reserved entry paths remain neutral `404` responses.
No offline or error body includes username, route key, tunnel origin, or query
details.

## Proxy target, methods, headers, and redirects

`createProxyHandler({ repository, fetch, now })` validates the exact opaque
authority and rejects method overrides before any repository lookup.

The outer method policy is:

- `GET`;
- `HEAD`;
- `OPTIONS`;
- `POST` only when the exact pathname is `/socket.io/`;
- WebSocket upgrade semantics only on `GET`.

Each accepted request independently resolves the current active claim and
unexpired route lease. The stored target is revalidated with
`parseQuickTunnelOrigin` for every request. The upstream URL is constructed by
assigning the original pathname and query to that validated origin, so even a
double-slash path cannot replace the target authority.

The upstream `Request` uses `redirect: "manual"`. Any 3xx response becomes a
fixed neutral `502`; its body and `Location` are not exposed. Invalid stored
origins and fetch failures also become neutral `502` responses. Missing or
stale leases are not fetched and return neutral `503`.

Task 3 header filtering removes `Authorization`, cookies, Host, forwarded
identity/certificate metadata, Clerk/device credentials, and hop-by-hop
headers from upstream requests. Response filtering removes cookies, server
identity, diagnostics, tunnel/internal metadata, credentials, and hop-by-hop
headers. The proxy additionally removes upstream CORS authority and navigation
headers (`Location`, `Content-Location`, and `Refresh`) before returning a
successful response.

## Request bodies, response bodies, and WebSockets

The proxy does not call `text()`, `json()`, `arrayBuffer()`, or another
buffering reader on public payloads:

- allowed POST requests reuse the incoming `ReadableStream` as the upstream
  request body;
- successful upstream responses reuse the upstream response body stream;
- Socket.IO polling payloads remain opaque;
- WebSocket event payloads are never inspected.

For WebSockets, the caller-supplied hop headers first pass through the Task 3
filter. After exact upgrade classification, the proxy regenerates the literal
`Upgrade: websocket` intent needed by Workers fetch rather than forwarding an
arbitrary caller value. A successful upstream `101` carries its Worker
`webSocket` handle and safe `Sec-WebSocket-Protocol` response header to the
caller. The local LTTH public Socket.IO adapter remains responsible for event
allowlisting.

## CORS

All upstream `Access-Control-*` headers are discarded.

The Worker emits CORS response headers only when the request `Origin` is:

- exactly `https://overlay.ltth.app`; or
- the exact current opaque route origin.

It never enables credentials. Allowed headers are limited to `Accept` and
`Content-Type`. Allowed methods are path-specific:

- ordinary paths: `GET, HEAD, OPTIONS`;
- exact `/socket.io/`: `GET, HEAD, OPTIONS, POST`.

Origin-varying responses include `Vary: Origin`. Unrelated origins receive no
CORS grant even when the upstream attempted to return wildcard CORS.

## Test-first evidence

Initial RED before either production module existed:

```text
npm test -- test/public-router.test.js
Test Files  1 failed (1)
Cannot find module './src/public-router.js'

npm test -- test/proxy.test.js
Test Files  1 failed (1)
Cannot find module './src/proxy.js'
```

Additional pre-fix RED evidence:

```text
# malformed stored route key plus non-GET WebSocket upgrade
Test Files  2 failed (2)
Tests       2 failed | 22 passed

# security-review regressions before authority/navigation/CORS fixes
Test Files  3 failed (3)
Tests       5 failed | 55 passed
```

The latter failures showed:

- alternate-port management returned `200`, expected neutral `404`;
- alternate-port entry returned `307`, expected neutral `404`;
- alternate-port opaque routing proxied and returned `200`, expected `404`;
- explicit `cors`/`empty` fetch metadata returned recovery `200`, expected
  neutral `503`;
- ordinary paths advertised CORS `POST`, expected read-only methods.

Final focused verification:

```text
npm test -- test/management.test.js test/public-router.test.js test/proxy.test.js
Test Files  3 passed (3)
Tests       60 passed (60)
```

Final full Worker package verification:

```text
npm test
Test Files  8 passed (8)
Tests       162 passed (162)
```

Additional verification:

```text
node --check src/index.js
node --check src/management.js
node --check src/public-router.js
node --check src/proxy.js

npx wrangler deploy --dry-run --env=
Total Upload: 92.24 KiB / gzip: 18.40 KiB
env.OVERLAY_ROUTING_DB (ltth-overlay-routing-local)
--dry-run: exiting now.
```

`git diff --cached --check` completed without findings before each code commit.

Coverage includes management-first dispatch order, exact hosts and authorities,
307 path/query preservation, no permanent caching, reserved names, online and
offline probes, stale leases, transparent navigation recovery, neutral
non-navigation responses, route-key corruption, method filters and overrides,
exact Socket.IO POST, streaming bodies, repeated claim/lease lookup, SSRF
rejection, manual redirect failure, request/response credential stripping,
cookie stripping, narrow CORS, and a real Workers-pool `WebSocketPair` 101
handoff.

## Concerns and downstream boundaries

- The Worker-pool suite proves the WebSocket API shape and stream handoff, but
  Task 6 did not deploy a Worker or exercise a real Quick Tunnel network hop.
  The planned staging/three-tunnel evidence remains a later release gate.
- The proxy is deliberately an outer filter. It does not inspect Socket.IO
  events or duplicate LTTH's public registry. Task 11 must re-prove the routed
  Quick-Tunnel public surface end to end.
- The stream tests prove direct stream reuse and successful opaque payload
  transfer. They do not simulate a long-lived slow consumer to measure
  backpressure.
- No open Critical or Important issue remains from the Task 6 read-only review.
  The exact-authority and navigation-classification findings were reproduced
  before their fixes. Its final minor dispatcher-consistency observation was
  also reproduced and fixed in `2ce5adf8`.

## Fix round 1/5: raw-path canonicalization

Commit `ef96b549` (`fix(overlay-router): fail closed on ambiguous raw paths`)
closes the Important canonicalization finding. The deferred `Vary` minor was
not changed.

### Reproduced root cause

WHATWG `Request`/`URL` parsing can irreversibly canonicalize the request target
before application routing. Local characterization demonstrated, among other
cases:

```text
new Request("https://overlay.ltth.app/a/%2e%2e/socket.io/").url
  -> https://overlay.ltth.app/socket.io/

new Request("https://r-<key>.ltth.app/socket.io/%2e").url
  -> https://r-<key>.ltth.app/socket.io/

new Request("https://r-<key>.ltth.app/foo\\socket.io/").url
  -> https://r-<key>.ltth.app/foo/socket.io/
```

Consequently, `Request.url` alone cannot prove that a visible
`/socket.io/` POST was originally that exact safe path, nor can it preserve an
entry path that has already lost encoded dot segments. Checking only the
WHATWG-derived pathname would authorize a normalized request under the wrong
method/path policy.

The regression suite constructs encoded-dot requests and first asserts their
lossy `Request.url` values. The production dispatcher then rejects them with a
neutral `503` before repository construction, management dispatch, entry
routing, or proxy routing.

### Worker defenses

`src/public-path.js` defines two independent defenses:

- an ingress attestation requiring a configured
  `OVERLAY_RAW_PATH_GUARD_TOKEN` and an exact matching
  `X-LTTH-Raw-Path-Guard` request header;
- a visible-path validator rejecting raw backslashes, repeated slashes,
  literal dot segments, invalid percent escapes, and the case-insensitive
  encodings `%25`, `%2e`, `%2f`, and `%5c`.

The production dispatcher runs the attestation before creating the D1
repository or selecting any management/public handler. Missing, malformed, or
mismatched configuration therefore fails closed with a neutral no-store
`503`. Tests retain an explicit dependency seam for unit-level dispatcher
contracts; the default production/Workers-pool path cannot bypass the guard.

The entry redirect and proxy target builders also require the accepted
pathname and query to round-trip exactly after assignment to a new `URL`.
Accepted safe encoded paths and queries remain byte-for-byte identical in the
redirect `Location` and upstream request. The guard request header has the
existing `x-ltth-*` prefix, so Task 3 filtering removes it before a proxy
request reaches the Quick Tunnel.

### Required Cloudflare ingress configuration

Cloudflare's Worker `Request` API does not expose the immutable Ruleset Engine
raw URI fields. The production Worker must therefore remain failed closed
until all of the following zone configuration exists and is verified:

1. Set **Normalize incoming URLs** to **Off** for the zone. Cloudflare states
   that enabled URL normalization occurs before Workers; disabling it is
   required to preserve accepted encoded paths.
2. Generate one random 64-character URL-safe token. Store it with
   `wrangler secret put OVERLAY_RAW_PATH_GUARD_TOKEN`; never put its value in
   `wrangler.jsonc`, source control, a response, or client code.
3. Create these two ordered Request Header Transform Rules in the
   `http_request_late_transform` phase:

   - first, for the routing-host scope, remove every incoming
     `X-LTTH-Raw-Path-Guard` header;
   - second, for the same scope plus a safe immutable raw path, set
     `X-LTTH-Raw-Path-Guard` to the static token.

The host-scope expression avoids regular-expression plan dependencies:

```text
(http.host eq "overlay.ltth.app" or
 (starts_with(http.host, "r-") and
  ends_with(http.host, ".ltth.app") and
  len(http.host) eq 43))
```

The second rule adds these raw-path predicates to that scope:

```text
not (raw.http.request.uri.path contains "\\") and
not (raw.http.request.uri.path contains "//") and
not (raw.http.request.uri.path eq "/.") and
not (raw.http.request.uri.path eq "/..") and
not (raw.http.request.uri.path contains "/./") and
not (raw.http.request.uri.path contains "/../") and
not ends_with(raw.http.request.uri.path, "/.") and
not ends_with(raw.http.request.uri.path, "/..") and
not (lower(raw.http.request.uri.path) contains "%25") and
not (lower(raw.http.request.uri.path) contains "%2e") and
not (lower(raw.http.request.uri.path) contains "%2f") and
not (lower(raw.http.request.uri.path) contains "%5c")
```

Rule ordering is a security requirement: the unconditional scoped removal
prevents a caller from supplying the token, while the later safe-path rule is
the only component allowed to restore it. Cloudflare documents that Request
Header Transform Rules run in order, later rules may overwrite earlier
changes, and raw fields remain immutable across rule evaluation.

Authoritative references:

- https://developers.cloudflare.com/rules/normalization/
- https://developers.cloudflare.com/ruleset-engine/rules-language/fields/reference/raw.http.request.uri.path/
- https://developers.cloudflare.com/rules/transform/request-header-modification/
- https://developers.cloudflare.com/ruleset-engine/rules-language/functions/

Cloudflare also cautions that its raw field may contain basic HTTP-server
normalization. Therefore the secret must not be enabled until Cloudflare Trace
and staging requests prove that `raw.http.request.uri.path` distinguishes and
rejects raw backslash, repeated slash, literal/encoded dot, encoded slash,
encoded backslash, and double-encoded percent cases, while allowing the safe
encoded-path/query fixture. If that live characterization cannot distinguish
every dangerous case, this marker design must not be enabled: the Worker
stays at `503` and production needs an ingress that exposes a sufficiently raw
request target.

No live Transform Rule, secret, DNS setting, or Worker deployment was changed
in Task 6. Task 12 must codify and exercise this deployment gate.

### Test-first and final evidence

Before the production fix, the new regressions were RED:

```text
npm test -- test/public-router.test.js test/proxy.test.js test/worker-smoke.test.js
Test Files  3 failed (3)
Tests       10 failed | 28 passed
```

The failures showed four ambiguous entry paths redirecting, four ambiguous
proxy paths reaching the upstream, a normalized encoded-dot POST reaching the
proxy, and the unconfigured production Worker returning `404` instead of
failing closed.

After the fix:

```text
npm test -- test/public-router.test.js test/proxy.test.js test/worker-smoke.test.js
Test Files  3 passed (3)
Tests       38 passed (38)

npm test
Test Files  8 passed (8)
Tests       172 passed (172)

node --check src/public-path.js
node --check src/index.js
node --check src/public-router.js
node --check src/proxy.js

npx wrangler deploy --dry-run --env=
Total Upload: 94.31 KiB / gzip: 18.98 KiB
env.OVERLAY_ROUTING_DB (ltth-overlay-routing-local)
--dry-run: exiting now.
```

`git diff --cached --check` completed without findings before commit
`ef96b549`.

## Fix round 2/5: authority-first guard and structural path decoding

Commit `e7e6e20f` (`fix(overlay-router): narrow raw path guard`) closes both
Important round-2 findings. The deferred `Vary` minor remains unchanged.

### Authority classification now precedes ingress attestation

The round-1 dispatcher verified the raw-path marker before parsing and
classifying the request authority. As a result, an unrelated authority such
as `www.ltth.app` received `503` without a marker, and management was offered
requests that were outside the routing authorities.

The dispatcher now parses and classifies the exact authority first:

- only HTTPS `overlay.ltth.app` on the default port is an entry/management
  candidate;
- only HTTPS `r-<32 lowercase hex>.ltth.app` on the default port is a proxy
  candidate;
- every malformed, insecure, ported, or unrelated authority returns the
  neutral no-store `404` immediately.

Only after a request is an exact routing candidate does the Worker verify the
raw-path marker. For both candidate kinds, a missing/malformed/mismatched
marker returns `503` before D1 repository construction, management handler
construction, management execution, or public/proxy handler construction.
This includes management paths on `overlay.ltth.app`.

The real Workers-pool default export, without dependency injection, now proves
that `www.ltth.app` returns `404` without guard configuration, while entry,
management, and exact opaque requests all remain failed closed at `503`.

### Narrow structural path predicate

The round-1 visible predicate rejected `%2e` and `%25` anywhere. That treated
safe filename data as path structure, so legitimate paths such as
`/plugins/overlay%2Ehtml` and `/plugins/100%25-ready.html` returned `404`.

The new predicate keeps the original pathname immutable and classifies a
separate scratch value. It:

1. rejects an initial raw backslash, repeated slash, literal `.`/`..` segment,
   or invalid percent escape;
2. decodes ASCII percent escapes into the scratch value for at most two
   layers;
3. after each layer, rejects a newly introduced slash, backslash, or exact
   `.`/`..` segment;
4. otherwise accepts the original pathname unchanged.

Two layers cover direct and double-encoded structural forms, including split
hex encodings:

```text
%2f              -> /
%252f            -> %2f -> /
%25%32%66        -> %2f -> /
%252e%252e       -> %2e%2e -> ..
%25%32%65        -> %2e -> .
%255c            -> %5c -> \
```

The same process deliberately accepts encoded filename data:

```text
overlay%2Ehtml       -> overlay.html
100%25-ready.html    -> 100%-ready.html
100%2525-ready.html  -> 100%25-ready.html -> 100%-ready.html
```

Only the scratch value is decoded. Redirect and proxy builders still receive
the original WHATWG-visible pathname and query and retain their exact
round-trip equality check, so accepted encoded path/query bytes are preserved.

### Exact raw-versus-visible responsibility

The ingress rule and Worker validator have different evidence:

- the Cloudflare Transform Rule uses immutable
  `raw.http.request.uri.path`, before the Worker API can lose a raw
  backslash, repeated slash, or literal/encoded dot segment;
- the Worker trusts that evidence only through the unforgeable ordered marker,
  then validates the still-visible pathname independently.

The Transform Rule predicate documented in round 1 is superseded by the
following structural predicate. For readability, define:

```text
P0 = raw.http.request.uri.path
P1 = url_decode(raw.http.request.uri.path)
P2 = url_decode(url_decode(raw.http.request.uri.path))
```

For each `P` used below, `NO_DOT_SEGMENT(P)` means:

```text
not (P eq "/.") and
not (P eq "/..") and
not (P contains "/./") and
not (P contains "/../") and
not ends_with(P, "/.") and
not ends_with(P, "/..")
```

The safe-marker rule must combine the unchanged exact host scope with this
expanded Rules-language expression:

```text
not (raw.http.request.uri.path contains "\\") and
not (raw.http.request.uri.path contains "//") and
not (raw.http.request.uri.path eq "/.") and
not (raw.http.request.uri.path eq "/..") and
not (raw.http.request.uri.path contains "/./") and
not (raw.http.request.uri.path contains "/../") and
not ends_with(raw.http.request.uri.path, "/.") and
not ends_with(raw.http.request.uri.path, "/..") and
not (lower(raw.http.request.uri.path) contains "%2f") and
not (lower(raw.http.request.uri.path) contains "%5c") and
not (lower(url_decode(raw.http.request.uri.path)) contains "%2f") and
not (lower(url_decode(raw.http.request.uri.path)) contains "%5c") and
not (url_decode(raw.http.request.uri.path) eq "/.") and
not (url_decode(raw.http.request.uri.path) eq "/..") and
not (url_decode(raw.http.request.uri.path) contains "/./") and
not (url_decode(raw.http.request.uri.path) contains "/../") and
not ends_with(url_decode(raw.http.request.uri.path), "/.") and
not ends_with(url_decode(raw.http.request.uri.path), "/..") and
not (url_decode(url_decode(raw.http.request.uri.path)) eq "/.") and
not (url_decode(url_decode(raw.http.request.uri.path)) eq "/..") and
not (url_decode(url_decode(raw.http.request.uri.path)) contains "/./") and
not (url_decode(url_decode(raw.http.request.uri.path)) contains "/../") and
not ends_with(url_decode(url_decode(raw.http.request.uri.path)), "/.") and
not ends_with(url_decode(url_decode(raw.http.request.uri.path)), "/..")
```

`P0` separator checks reject direct encodings. The `P1` separator checks
reject double encodings and composed forms such as `%25%32%66`.
`NO_DOT_SEGMENT(P1/P2)` rejects direct and double-encoded dot segments without
rejecting a dot inside a filename. A bare `%25` is no longer forbidden.

Invalid percent syntax is rejected by the Worker visible validator. If
Cloudflare does not preserve that syntax to the Worker, the existing
Cloudflare Trace/staging characterization gate applies and the secret must
remain disabled. The same gate remains for Cloudflare HTTP-server baseline
normalization of repeated slashes or backslashes. No live rule, secret,
normalization setting, or Worker deployment was changed in this fix round.

### Round-2 test-first and final evidence

Before the production change:

```text
npm test -- test/public-router.test.js test/proxy.test.js test/worker-smoke.test.js
Test Files  3 failed (3)
Tests       9 failed | 56 passed
```

The failures showed both legitimate encoded filename fixtures rejected, the
unrelated production authority returning `503`, and unrelated management
reaching management before classification.

After the change:

```text
npm test -- test/public-router.test.js test/proxy.test.js test/worker-smoke.test.js
Test Files  3 passed (3)
Tests       65 passed (65)

npm test
Test Files  8 passed (8)
Tests       199 passed (199)

node --check src/index.js
node --check src/public-path.js

npx wrangler deploy --dry-run --env=
Total Upload: 95.49 KiB / gzip: 19.28 KiB
env.OVERLAY_ROUTING_DB (ltth-overlay-routing-local)
--dry-run: exiting now.
```

`git diff --cached --check` completed without findings before commit
`e7e6e20f`.

## Fix round 3/5: fixed-point decoding and checked-in Ruleset

Commit `6d1319f1` (`fix(overlay-router): validate recursively encoded paths`)
closes both Important round-3 findings. The deferred `Vary` minor remains
unchanged.

### Bounded fixed-point Worker validation

The round-2 Worker decoded exactly two layers. A third or deeper layer
therefore remained encoded when the function returned `true`:

```text
%25252f                 -> %252f -> %2f       (accepted)
%25252e%25252e          -> %252e%252e -> %2e%2e
%25252525255c           -> still encoded after two passes
```

The validator now decodes a scratch pathname until it reaches a fixed point,
with an explicit maximum of 16 stages. The original pathname is never
modified. Initial invalid percent syntax, raw backslash, repeated slash, and
literal dot segments are rejected. After every decoded stage, the validator
rejects:

- a newly introduced `/`;
- any `\`;
- an exact `.` or `..` segment.

Percent bytes are decoded only in the scratch copy. Filename dots and literal
percent data therefore remain allowed when they never become path structure.
Coverage includes safe deeply nested forms such as an encoded dot inside
`overlay...html` and an encoded percent inside `100...-ready.html`, including
a safe value that reaches its fixed point on stage 16.

After stage 16 the validator attempts one more layer. If that layer would
change the scratch pathname, it fails closed instead of accepting unresolved
nesting. This intentionally rejects even otherwise-safe stage-17 data because
its structural meaning has not been proven within the finite budget.

Entry redirects and proxy targets continue to use the untouched original
WHATWG-visible path/query, so accepted deep safe encodings remain exact in the
`Location` or upstream URL.

### Deployment-ready Cloudflare Ruleset artifact

The round-2 report used undocumented nested
`url_decode(url_decode(...))` notation. The checked-in replacement is:

- `cloudflare/overlay-router/rulesets/raw-path-guard.ruleset.template.json`;
- `cloudflare/overlay-router/rulesets/README.md`;
- `cloudflare/overlay-router/scripts/validate-raw-path-ruleset.mjs`;
- package command `npm run validate:raw-path-ruleset`.

The JSON is a zone-level `http_request_late_transform` entry-point template.
It defines exactly two enabled rules in security-significant order:

1. `ltth_raw_path_guard_remove_caller_marker` removes every incoming
   `x-ltth-raw-path-guard` header on the routing host scope;
2. `ltth_raw_path_guard_restore_safe_marker` restores it only under the
   structural raw-path expression.

The restoration expression uses Cloudflare's documented recursive syntax:

```text
url_decode(raw.http.request.uri.path, "r")
```

It rejects recursively decoded backslashes, repeated separators, and exact
dot segments. It also rejects ordinary arbitrarily nested percent-encoded
slashes with a lowercased raw-path pattern. Composed encodings that remain
visible are independently rejected by the Worker's fixed-point validator.
The raw-rule/visible-Worker split is therefore explicit: the Ruleset attests
structure that may be irreversibly lost before `Request.url`; the Worker
recursively validates all structural encodings still visible to it.

The static header value is the deliberately unusable
`<REPLACE_WITH_64_CHAR_URL_SAFE_TOKEN>` placeholder. It does not match the
Worker token grammar, so deploying the template without credentialed
substitution remains failed closed. No real marker secret is checked in.

The offline validator parses the JSON and verifies:

- `kind: zone` and phase `http_request_late_transform`;
- exactly two rules and their stable order/refs;
- removal followed by restoration of the same header;
- exact host-scope inheritance;
- the unusable placeholder rather than a token-shaped value;
- presence of `url_decode(raw.http.request.uri.path, "r")`;
- absence of nested `url_decode(url_decode(...))`.

Test-first artifact evidence:

```text
npm run validate:raw-path-ruleset
Ruleset template could not be parsed: ENOENT ... raw-path-guard.ruleset.template.json
```

After adding the template:

```text
npm run validate:raw-path-ruleset
Raw-path guard ruleset template is structurally valid and secret-free.
```

### External API and Trace gate

`rulesets/README.md` contains explicit PowerShell commands that require
external `CLOUDFLARE_API_TOKEN`, zone/account IDs, and a generated 64-character
marker token. The workflow:

1. runs the offline validator and validates token shape;
2. substitutes the token only into an untracked temporary payload;
3. inspects the current late-transform entry point to prevent overwriting
   unrelated rules;
4. creates or updates the zone Ruleset through the Rulesets API;
5. removes the temporary secret-bearing payload;
6. uses `POST /accounts/{account_id}/request-tracer/trace` with
   `skip_response` for safe, dangerous, and caller-spoof fixtures;
7. requires real staging requests before the Worker secret can be enabled in
   production.

The Cloudflare API, Trace, staging, secret, and deployment commands were not
run in this task because their credentials and external state are outside
Task 6. The existing deployment stop remains: if Cloudflare basic
normalization prevents Trace/staging from distinguishing raw repeated slash
or backslash, the Worker secret must stay disabled.

Authoritative syntax/API references are recorded next to the commands:

- https://developers.cloudflare.com/ruleset-engine/rules-language/functions/#url_decode
- https://developers.cloudflare.com/rules/transform/request-header-modification/
- https://developers.cloudflare.com/ruleset-engine/rulesets-api/update/
- https://developers.cloudflare.com/api/resources/request_tracers/subresources/traces/methods/create/

### Round-3 test-first and final evidence

Before the fixed-point production change:

```text
npm test -- test/public-router.test.js test/proxy.test.js test/worker-smoke.test.js
Test Files  2 failed | 1 passed
Tests       8 failed | 71 passed
```

The failures showed triple/deeper encoded slash, backslash, and dot segments
being proxied or classified safe, plus an over-budget safe filename being
accepted instead of failing closed.

After the change:

```text
npm test -- test/public-router.test.js test/proxy.test.js test/worker-smoke.test.js
Test Files  3 passed (3)
Tests       81 passed (81)

npm test
Test Files  8 passed (8)
Tests       215 passed (215)

npm run validate:raw-path-ruleset
Raw-path guard ruleset template is structurally valid and secret-free.

node --check src/public-path.js
node --check scripts/validate-raw-path-ruleset.mjs

npx wrangler deploy --dry-run --env=
Total Upload: 95.46 KiB / gzip: 19.26 KiB
env.OVERLAY_ROUTING_DB (ltth-overlay-routing-local)
--dry-run: exiting now.
```

`git diff --cached --check` completed without findings before commit
`6d1319f1`.
