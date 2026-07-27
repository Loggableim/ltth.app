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
