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
