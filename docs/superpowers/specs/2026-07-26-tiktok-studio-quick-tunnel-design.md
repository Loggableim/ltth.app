# TikTok Studio Quick Tunnel Design

## Goal

Add a second, app-wide `Copy TikTok Studio URL` action for every maintained
OBS/browser-source URL. For local LTTH overlays, the action starts or reuses a
Cloudflare Quick Tunnel automatically and copies the equivalent public
`https://<random>.trycloudflare.com/...` URL. Existing OBS copy actions and
local URLs remain unchanged.

The feature must work without a Cloudflare account, API token, DNS record, or
manual `cloudflared` installation. Public tunnel traffic must be denied by
default and limited to the overlay surfaces required for rendering.

## Confirmed Product Decisions

- A random `trycloudflare.com` hostname is sufficient. Stable hostnames under
  `ltth.app` are not required.
- The tunnel starts on the first TikTok Studio copy action, not at application
  startup.
- LTTH downloads `cloudflared` automatically when the pinned binary is absent.
- One Quick Tunnel is shared by all TikTok Studio copy actions for the lifetime
  of the LTTH process.
- The tunnel exposes only registered overlay surfaces. It does not expose the
  dashboard or general administration APIs.
- A tunnel or application restart produces a new public hostname. The user
  must copy the affected TikTok Studio source URLs again.
- A failed download or tunnel start is reported. LTTH does not silently copy a
  local fallback URL.

Cloudflare documents Quick Tunnels as a testing and development facility with
no uptime guarantee, a 200 in-flight request limit, and no Server-Sent Events.
LTTH accepts those constraints for this opt-in stream-session feature. LTTH
overlays use HTTP and Socket.IO/WebSocket or polling transport; the public
surface inventory must reject any future overlay that requires unsupported
SSE until that dependency is changed.

References:

- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- https://github.com/cloudflare/cloudflared/releases/tag/2026.7.2

## Existing Integration Boundary

`app/modules/network-manager.js` already starts a Quick Tunnel by spawning:

```text
cloudflared tunnel --url http://localhost:<port>
```

It currently expects `cloudflared` in `PATH` or at a manually configured
binary path, holds one generic tunnel process, and exposes the full LTTH port.
The server has no deny-by-default route boundary for tunnel traffic. Many core
and plugin administration endpoints are rate-limited but not authenticated, so
publishing the current port without an overlay policy is not acceptable.

The new feature extends the existing NetworkManager rather than replacing the
manual Cloudflare, ngrok, localtunnel, and custom-provider controls. Overlay
Quick Tunnel state is separate from the manually configured tunnel state so a
user's selected provider and persisted settings are not changed by a TikTok
Studio copy action. An already-running manual Cloudflare Quick Tunnel may be
reused. Every active `trycloudflare.com` host, regardless of which LTTH control
started it, receives the same overlay-only route policy.

## Components

### Cloudflared binary manager

A focused core module owns platform selection, download, checksum validation,
installation, and executable lookup.

- Pin version `2026.7.2`; never resolve or execute an unreviewed `latest`
  release at runtime.
- Store the installed tool under
  `<ConfigPathManager.getDefaultConfigDir()>/runtime-tools/cloudflared/2026.7.2/`.
  A custom, potentially cloud-synchronized configuration path does not relocate
  executable runtime tools.
- Download only from the matching official GitHub release URL.
- Stream into a uniquely named temporary file in the destination directory,
  cap download size, require an HTTP success status, compute SHA-256 while
  streaming, and atomically rename only after validation.
- Never pass downloaded content through a shell.
- Extract macOS archives into an isolated temporary directory, accept only the
  expected `cloudflared` executable, and reject links, traversal, additional
  files, or an unexpected archive layout.
- Apply executable permissions on macOS and Linux.
- Spawn the pinned binary with `--no-autoupdate`; LTTH application releases own
  binary upgrades.
- Direct executable assets are rechecked against the pinned artifact checksum
  before reuse. For macOS archives, installation records the verified archive
  checksum and the derived executable checksum; later reuse must match that
  recorded executable checksum. A mismatch quarantines the installed file and
  triggers one clean redownload. A second mismatch is a hard error.
- Concurrent download requests share one in-flight promise.

Pinned assets:

| Platform | Architecture | Asset | SHA-256 |
|---|---|---|---|
| Windows | x64 | `cloudflared-windows-amd64.exe` | `cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9` |
| macOS | x64 | `cloudflared-darwin-amd64.tgz` | `4ee0d3b48a990a2f9b5faec5838f73ec1f400aa8e0a4864be576adfafec406cb` |
| macOS | arm64 | `cloudflared-darwin-arm64.tgz` | `2086e51c61d6565781d84117a5007d0c826d03ffdc74acb91c08c167f9f8cd7c` |
| Linux | x64 | `cloudflared-linux-amd64` | `ec905ea7b7e327ff8abdde8cb64697a2152de74dbcdbf6aec9db8364eb3886cd` |
| Linux | arm64 | `cloudflared-linux-arm64` | `405df476437e027fc6d18729a5a77155c0a33a6082aeee60a799a688f3052e66` |

Other platform/architecture combinations fail with an actionable unsupported
platform error. The first-download UI identifies Cloudflare as the third-party
provider and links to its terms.

### Overlay Quick Tunnel lifecycle

NetworkManager gains independent overlay-tunnel state:

```text
overlayTunnelProcess
overlayTunnelURL
overlayTunnelStarting
overlayTunnelStartPromise
overlayTunnelLastError
```

`ensureOverlayQuickTunnel(port)` behaves as follows:

1. Reuse a live, manually started Cloudflare Quick Tunnel when one exists;
   otherwise return the current overlay-managed URL when its process is alive.
2. Return the shared start promise when a download or start is already in
   progress.
3. Resolve the pinned binary through the binary manager.
4. Ensure a dedicated `quick-tunnel-no-config.yml` path in the tool directory
   does not exist, then pass that path through `--config`. This prevents
   cloudflared from reading a user's existing `~/.cloudflared/config.yml`
   without renaming or modifying the user's file.
5. Spawn it directly against `http://127.0.0.1:<actual-port>` with
   `--no-autoupdate` and capture bounded stdout/stderr.
6. Accept only an exact
   `https://[a-z0-9-]+\.trycloudflare\.com` URL from process output.
7. Store the normalized origin, refresh CORS, and resolve the shared promise.
8. On timeout, spawn error, premature exit, or malformed output, terminate the
   child, clear all public state, refresh CORS, and reject with a typed error.

Tunnel discovery has a 60-second timeout after spawn. Download uses a separate
120-second timeout. The process stays active until the user stops it or LTTH
shuts down. Process `exit`, `error`, server shutdown, and manual stop clear the
host before returning control.

The local API is:

```text
POST /api/network/overlay-tunnel/ensure
  200 { success: true, tunnelURL, reused }
  4xx/5xx { success: false, code, error }

POST /api/network/overlay-tunnel/stop
  200 { success: true }
```

Both endpoints are reachable from normal local LTTH pages. The public-surface
middleware denies them for every `trycloudflare.com` host.

### Public surface registry

A new central module is the only source of truth for public overlay traffic. A
surface definition contains:

```text
id
entrypoints[]        exact paths or bounded path patterns
assets[]             exact static prefixes required by the renderer
readRoutes[]         HTTP path patterns with explicit allowed methods
socketInboundEvents[] exact event names, empty by default
```

The initial inventory covers the maintained local overlay families surfaced by
the app-wide copy buttons: core Soundboard, Advanced Timer, AnimazingPal Stream
Assistant, ClarityHUD, CoinBattle, Emoji Rain, Fireworks, Flame Overlay, Game
Engine, GCCE, Goals, Interactive Story, Music Bot, OpenShock, Quiz Show,
Schnorrbecher, Spotlight, StreamAlchemy/StreamMonsters, STT Ticker, TopTier,
Visual FX Frame WebGPU, Weather Control, WebGPU Emoji Rain, WebGPU Fireworks,
and WebGPU Weather Control.

External OBS URLs such as VDO.Ninja are copied unchanged and do not enter the
tunnel registry.

For HTTP requests:

- Normalize the raw Host header, method, and URL pathname once.
- Any host ending in `.trycloudflare.com` is considered public tunnel traffic,
  even before the active hostname has been discovered.
- A Quick Tunnel request is allowed only when its Host exactly matches an
  active Quick Tunnel hostname tracked by NetworkManager and the registry
  permits the normalized route and method.
- `GET`, `HEAD`, and `OPTIONS` are the only implicit read methods. Any required
  other method must be declared for one exact route.
- Encoded separators, dot segments, malformed percent-encoding, duplicate
  slashes used to change route meaning, method overrides, and ambiguous paths
  are rejected before matching.
- Unknown hostnames, paths, and methods receive the same minimal `404`
  response. They do not reveal whether a dashboard or API exists.
- The policy runs before locale routes, static middleware, plugin routes,
  uploads, and core APIs.
- Localhost, loopback, and normal LAN access retain existing behavior.

Static prefixes are deliberately narrow. The registry does not expose an
entire plugin directory merely because one renderer needs one script.
User-uploaded media is registered only for overlays that actually render it;
directory listing and upload mutation remain unavailable.

For Socket.IO:

- The HTTP handshake uses the same active-host and public-surface decision.
- Polling `GET` and protocol-required `POST` requests are allowed only on the
  Socket.IO transport path for the active public host.
- A public-tunnel marker is stored in `socket.data`.
- Outbound server events may reach the renderer.
- Incoming events from a public-tunnel socket are denied by default through
  per-socket middleware. Only exact events declared by a registered surface
  are accepted.
- Rejected events do not invoke plugin handlers and are logged without payload
  contents.

Adding a new public overlay later requires adding its complete dependency set
to the central registry and passing the public-surface tests.

## TikTok Studio URL flow

The shared browser helper exposes:

```text
window.LTTHTikTokStudioUrl.copy(rawUrl): Promise<string>
```

The helper:

1. Resolves relative URLs against the current local origin.
2. Rejects empty, malformed, non-HTTP(S), credential-bearing, or unregistered
   local paths.
3. Returns and copies an already-public external HTTPS URL unchanged.
4. For a local registered overlay, calls the local `ensure` endpoint.
5. Replaces only the local origin with the returned Quick Tunnel origin.
6. Preserves path, query parameters, and fragment.
7. Copies with the Clipboard API and the existing safe text-selection fallback.
8. Resolves with the exact copied URL only after copying succeeds.

Each maintained OBS URL surface receives an explicit second button carrying
the stable `data-copy-tiktok-studio-url` hook. Dynamic cards read the current
URL at click time; they do not capture a stale URL during initial rendering.
Where one UI presents multiple overlay variants, each variant gets its own
TikTok Studio action.

Button states are:

- ready: localized `Copy TikTok Studio URL`;
- downloading/starting: localized progress label and disabled against repeat
  activation;
- success: existing toast/status channel announces that the public URL was
  copied;
- failure: localized actionable message and a retryable enabled button.

If a page has no status channel, it receives a nearby `aria-live="polite"`
status element. Buttons use `type="button"`, a localized title and accessible
name, and normal keyboard activation.

The Network settings page shows the separate overlay Quick Tunnel status,
current URL, last error, and Stop action. It also explains that the URL changes
after a tunnel or LTTH restart. Stopping the tunnel invalidates copied public
URLs immediately.

Shared translations are added in German, English, Spanish, and French. The
German action label is exactly `TikTok-Studio-URL kopieren`. Existing OBS copy
buttons, preview buttons, visible local URLs, and manual tunnel controls retain
their current behavior.

## Error Handling and Logging

The backend uses stable error codes for `unsupported_platform`,
`download_timeout`, `download_http_error`, `checksum_mismatch`,
`archive_invalid`, `spawn_failed`, `tunnel_timeout`, `tunnel_exited`, and
`tunnel_url_invalid`. User messages are localized; detailed diagnostics use
the existing logger.

Logs include tool version, selected asset, lifecycle transitions, exit code,
and bounded sanitized process output. They never include clipboard contents,
full query strings, user data, Socket.IO payloads, or downloaded binary bytes.

There is no automatic retry loop after a hard failure. A subsequent button
click initiates one new attempt. This prevents repeated downloads or process
storms during an outage.

## Compatibility and Non-goals

- No Cloudflare account, API token, named tunnel, DNS record, Worker, or
  `ltth.app` subdomain provisioning is introduced.
- No tunnel is started merely because LTTH launches.
- No public dashboard or remote administration is added.
- No overlay renderer is rewritten solely to support the tunnel.
- No persistent promise is made about the random Quick Tunnel hostname.
- Quick Tunnel service availability and limits remain controlled by
  Cloudflare.
- Existing manual Cloudflare Quick Tunnel controls still start and stop their
  process, but public traffic through that hostname becomes overlay-only.
  Non-Cloudflare manual providers retain their existing behavior and security
  warning.
- The earlier local `tiktok=ltth.app` validator workaround is not appended to
  Quick Tunnel URLs because the public domain is already accepted. It may
  remain an independently tested local compatibility utility, but it is not a
  fallback for this action.

## Verification

Focused automated coverage includes:

1. Binary manifest selection for every supported platform/architecture and a
   hard failure for unsupported combinations.
2. Successful streamed install, size cap, checksum mismatch, truncated
   download, timeout, hostile macOS archive, atomic rename, executable
   permissions, reuse, and concurrent download deduplication.
3. Concurrent `ensure` calls produce one process and one URL; an active process
   is reused; malformed output, timeout, spawn error, and exit clear all state.
4. URL conversion preserves path, query, and fragment, resolves relative
   routes, leaves external HTTPS URLs unchanged, and rejects dashboard,
   unregistered, credential-bearing, and non-HTTP(S) URLs.
5. Every maintained local OBS URL surface loads the shared helper and has one
   explicit TikTok Studio action per displayed overlay variant.
6. For every registry entry, the entrypoint and declared static/API
   dependencies succeed through an active test tunnel Host.
7. Dashboard, settings, auth, update, network, uploads, write APIs, unknown
   routes, wrong methods, path-encoding attacks, stale Quick Tunnel hosts, and
   method overrides return the neutral denial response.
8. Socket.IO handshake/polling succeeds for the active registered host;
   unregistered hosts and incoming events are rejected before plugin handlers.
9. Local localhost, loopback, LAN, existing OBS copy, manual tunnel controls,
   and plugin behavior remain unchanged; a manual Cloudflare Quick Tunnel is
   specifically verified as overlay-only.

The integration harness uses a fake `cloudflared` process and local fixture
downloads; normal tests do not depend on Cloudflare or the Internet.

Manual acceptance uses the pinned real binary:

1. Remove or isolate any prior managed binary and click a TikTok Studio action.
2. Observe one download, checksum validation, one Quick Tunnel process, and one
   copied `https://*.trycloudflare.com/<same-path>` URL.
3. Load one static overlay and one Socket.IO/WebSocket overlay through that URL.
4. Confirm a tunnel-host request to `/dashboard.html` and a write API returns
   the neutral denial response.
5. Paste the copied overlay URL into TikTok LIVE Studio and confirm it is
   accepted and renders.
6. Reuse the same hostname from a second overlay button.
7. Stop the tunnel, confirm the URL becomes unavailable, click again, and
   confirm a new hostname is copied.

Run focused tunnel, registry, URL-helper, UI-inventory, and affected plugin
tests, then the app test suite, lint, CSS build, and `git diff --check`.
Existing unrelated working-tree changes must be preserved and verification
results must distinguish feature failures from unrelated baseline changes.
