# Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax (`- [ ]`) for tracking.

**Goal:** Add an app-wide “TikTok-Studio-URL kopieren” action that automatically provisions a random Cloudflare Quick Tunnel and exposes only centrally registered overlay surfaces through that public host.

**Architecture:** LTTH keeps its existing local OBS URLs and existing manually configured tunnels. A separate overlay-only Quick Tunnel lifecycle downloads and verifies a pinned `cloudflared` binary, starts it on the first TikTok copy action, and returns a server-validated public overlay URL. A central registry defines every permitted overlay entrypoint, asset/read route, required overlay write route, and incoming/outgoing Socket.IO event. Express and Socket.IO apply this registry to every valid `*.trycloudflare.com` request host; unmatched public requests receive a neutral denial.

**Tech Stack:** Node.js 18–24, CommonJS, Express, Socket.IO, Jest, built-in `https`, `crypto`, `fs`, `zlib`, `child_process`, plus direct dependency `tar-stream@3.1.7`.

## Global Constraints

- Preserve the existing local “OBS-URL kopieren” behavior. It must continue to copy the local URL without starting a tunnel.
- Do not expose the dashboard, settings, plugin UIs, broad `/api` trees, uploaded user data, logs, databases, or filesystem routes through a Quick Tunnel.
- Treat requests through any valid `*.trycloudflare.com` host as denied unless the central register explicitly allows the normalized method/path or Socket.IO event. This includes the automatic tunnel, manual Quick Tunnels, and forged Host headers.
- Keep non-Cloudflare manual tunnel providers on the current behavior and retain their existing security warning.
- Do not silently fall back to a local URL if download, verification, startup, registration, or clipboard copy fails.
- Do not use a shell to download, unpack, or start `cloudflared`.
- Do not read or modify `~/.cloudflared/config.yml`. Start the process with an explicitly absent config path under the versioned runtime-tools directory.
- Keep all runtime binaries below `ConfigPathManager.getDefaultConfigDir()/runtime-tools`; custom or cloud-synced LTTH config paths must not relocate executables.
- Use the exact pinned version and digests from the approved design:

| Platform | Release asset | SHA-256 |
|---|---|---|
| Windows x64 | `cloudflared-windows-amd64.exe` | `cdb5d4432f6ae1595654a692a51308b69d2bf7af961f5578d9391837cf072df9` |
| macOS x64 | `cloudflared-darwin-amd64.tgz` | `4ee0d3b48a990a2f9b5faec5838f73ec1f400aa8e0a4864be576adfafec406cb` |
| macOS arm64 | `cloudflared-darwin-arm64.tgz` | `2086e51c61d6565781d84117a5007d0c826d03ffdc74acb91c08c167f9f8cd7c` |
| Linux x64 | `cloudflared-linux-amd64` | `ec905ea7b7e327ff8abdde8cb64697a2152de74dbcdbf6aec9db8364eb3886cd` |
| Linux arm64 | `cloudflared-linux-arm64` | `405df476437e027fc6d18729a5a77155c0a33a6082aeee60a799a688f3052e66` |

- Use version `2026.7.2` and URLs rooted at `https://github.com/cloudflare/cloudflared/releases/download/2026.7.2/`.
- Cap a release download at 100 MiB, use a 120-second download timeout, and use a 60-second tunnel-discovery timeout.
- Match discovered tunnel output only with `https://[a-z0-9-]+\.trycloudflare\.com`.
- Keep unrelated dirty-worktree changes. Before every commit, stage only the task’s files or exact hunks and inspect `git diff --cached`.
- Run Jest with LTTH’s bundled Node on Windows:

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand <test-files>
```

## Planned Interfaces

### Backend

```text
POST /api/network/overlay-tunnel/ensure
Content-Type: application/json
Body: { "overlayURL": "http://127.0.0.1:3000/registered/overlay?query=kept" }
Success: { "success": true, "tunnelURL": "https://random.trycloudflare.com", "publicURL": "https://random.trycloudflare.com/registered/overlay?query=kept", "reused": false }

POST /api/network/overlay-tunnel/stop
Success: { "success": true }
```

The server, not the browser, validates the local URL against the public-surface register and constructs `publicURL`. The request must target the running LTTH origin, contain no credentials or fragment, and use a registered overlay entrypoint. Query parameters are retained but never used to widen the path allowlist.

### Browser

```js
window.LTTHTikTokStudioUrl.copy(rawUrl): Promise<string>
```

- Registered LTTH URLs call the ensure endpoint and copy the returned `publicURL`.
- External `https:` overlay URLs, such as VDO.Ninja director URLs, are copied unchanged.
- External `http:`, credential-bearing URLs, unregistered local URLs, and missing URLs reject with a typed error.
- The Promise resolves to the exact URL placed on the clipboard.

### Public registry

```js
normalizePublicPath(rawUrl): string
isRegisteredEntrypoint(pathname): boolean
isHttpAllowed({ method, pathname }): boolean
isIncomingSocketEventAllowed(eventName): boolean
isOutgoingSocketEventAllowed(eventName): boolean
listPublicEntrypoints(): string[]
```

Path matchers operate on decoded, normalized pathnames only. Reject malformed encodings, NUL bytes, backslashes, dot segments, duplicate-slash ambiguity, and method-override headers before route matching.

## Public Surface Matrix

The implementation must encode this matrix in `app/modules/public-overlay-registry.js`. Regex matchers must be anchored with `^` and `$`; asset wildcards are limited to the named directory and safe filename characters.

### Entrypoints

| Surface | Allowed GET/HEAD entrypoint |
|---|---|
| Core Soundboard | `/animation-overlay.html` |
| Advanced Timer | `/advanced-timer/overlay` |
| AnimazingPal | `/overlay/animazingpal/stream-assistant` |
| ClarityHUD | `/overlay/clarity/chat`, `/overlay/clarity/full`, `/overlay/clarity/multi`, `/overlay/clarity/stream` |
| CoinBattle | `/plugins/coinbattle/overlay` |
| Emoji Rain | `/emoji-rain/obs-hud` |
| Fireworks | `/fireworks/overlay` |
| Flame Overlay | `/flame-overlay/overlay` |
| Game Engine | `/overlay/game-engine/arena`, `/overlay/game-engine/chess`, `/overlay/game-engine/connect4`, `/overlay/game-engine/hud`, `/overlay/game-engine/plinko`, `/overlay/game-engine/slot`, `/overlay/game-engine/unified`, `/overlay/game-engine/wheel` |
| GCCE | `/plugins/gcce/overlay-hud` |
| Goals | `/goals/overlay`, `/goals/multigoal-overlay` |
| Interactive Story | `/interactive-story/overlay` |
| Music Bot | `/plugins/music-bot/overlay.html` |
| OpenShock | `/openshock/zappiehell/overlay` |
| Quiz Show | `/quiz-show/overlay`, `/quiz-show/overlay/splitscreen`, `/quiz-show/leaderboard-overlay` |
| Schnorrbecher | `/overlay/coincup` |
| Spotlight | `/overlay/spotlight/:type`, where `type` is one safe path segment |
| StreamAlchemy | `/streammonsters/overlay` |
| STT Ticker | `/overlay/stt-ticker` |
| TopTier | `/plugins/toptier/overlay.html` |
| Visual FX WebGPU | `/visual-fx-frame-webgpu/overlay` |
| Weather Control | `/weather-control/overlay` |
| WebGPU Emoji Rain | `/webgpu-emoji-rain/obs-hud` |
| WebGPU Fireworks | `/webgpu-fireworks/overlay` |
| WebGPU Weather | `/webgpu-weather-control/overlay` |

### Shared assets and transport

| Methods | Path |
|---|---|
| GET, HEAD | `/socket.io/socket.io.js` |
| GET, HEAD | `/js/i18n-client.js` |
| GET, HEAD | `/js/matter.min.js` |
| GET, HEAD | `/css/themes.css` |
| GET, HEAD | `/css/overlay-base.css` |
| GET, HEAD | `/fonts/exo-2.css` |
| GET, HEAD | `/fonts/open-sans.css` |
| GET, HEAD | `/fonts/opendyslexic.css` |
| GET, HEAD | `/vendor/pixi/pixi.min.mjs` |
| GET, HEAD | `/vendor/rapier2d/rapier.es.js` |
| GET, POST | `/socket.io/` and Engine.IO query variants at that exact pathname |

### Surface assets and HTTP data

| Surface | Methods | Anchored route family |
|---|---|---|
| Soundboard | GET, HEAD | `/uploads/animations/:safeMediaFilename` and `/sounds/:safeAudioFilename`; the entrypoint itself otherwise uses only shared assets |
| Advanced Timer | GET, HEAD | `/advanced-timer/overlay.js`, `/plugins/advanced-timer/overlay/overlay.js`, `/api/advanced-timer/timers/:id`, `/api/advanced-timer/timers/:id/rotator`, `/api/advanced-timer/timers/:id/threshold-effects` |
| AnimazingPal | GET, HEAD | `/api/animazingpal/live-host/stream-assistant/status`, `/plugins/animazingpal/locales/:locale` for `de`, `en`, `es`, `fr` |
| ClarityHUD | GET, HEAD | `/plugins/clarityhud/lib/{accessibility,animations,badge-renderer,emoji-parser,i18n-runtime,layout-engine,message-parser,settings-schema,stream-animations,virtual-scroller}.js`, `/plugins/clarityhud/overlays/{chat,full,multi,stream}.js`, `/api/clarityhud/settings/{chat,full,multi,stream}`, `/api/clarityhud/state/{chat,full}`, `/api/clarityhud/multi/status` |
| CoinBattle | GET, HEAD | `/plugins/coinbattle/overlay/{gpu-animations.css,overlay.js,styles.css,template-manager.js,victory-animations.css}`, `/api/plugins/coinbattle/leaderboard/{lifetime,season,weekly}`, overlay layout reads used by `overlay.js` |
| Emoji Rain | GET, HEAD | `/js/emoji-rain-engine.js`, `/js/emoji-rain-obs-hud.js` |
| Fireworks | GET, HEAD | `/plugins/fireworks/gpu/{engine,particle-system-soa,webgl-particle-engine}.js`, `/plugins/fireworks/audio/:safeAudioFilename` |
| Flame Overlay | GET, HEAD | `/api/flame-overlay/config`, `/plugins/flame-overlay/default-config.js`, `/plugins/flame-overlay/renderer/{effects-engine,post-processor}.js`, `/plugins/flame-overlay/textures/:safeImageFilename` |
| Game Engine | GET, HEAD | `/api/game-engine/config/chess`, `/api/game-engine/config/connect4`, `/api/game-engine/media/connect4`, `/api/game-engine/active-session`, `/api/game-engine/leaderboards/:safeSegment`, `/api/game-engine/arena/state`, `/api/game-engine/gift-catalog`, `/api/game-engine/slot/audio-settings`, `/api/game-engine/wheel/audio-settings`, `/game-engine/sounds/:safeRelativeAudioPath` |
| Game Engine | POST | `/api/game-engine/manual/start`, `/api/game-engine/manual/move`, `/api/game-engine/manual/end`, `/api/game-engine/wheel/spin` |
| GCCE | GET, HEAD | `/api/gcce/hud/rotator`, `/gcce/style.css` |
| Goals | GET, HEAD | Exact JS/CSS files referenced by `/goals/overlay` and `/goals/multigoal-overlay` below the Goals public mount |
| Interactive Story | GET, HEAD | `/api/interactive-story/config`, `/api/interactive-story/overlay-positions`, `/api/interactive-story/image/:safeImageFilename` |
| Music Bot | GET, HEAD | No surface-specific asset or HTTP read route; the shipped overlay is inline and uses shared i18n/Socket.IO assets |
| OpenShock | GET, HEAD | No surface-specific asset or HTTP read route for ZappieHell; the shipped overlay is inline and receives state through Socket.IO |
| Quiz Show | GET, HEAD | `/api/quiz-show/brand-kit`, `/api/quiz-show/hud-config`, `/api/quiz-show/state`, `/api/quiz-show/leaderboard`, `/api/quiz-show/layouts/:id`, exact overlay JS/CSS files |
| Schnorrbecher | GET, HEAD | `/plugins/schnorrbecher/overlay/coincup.css`, `/plugins/schnorrbecher/overlay/coincup.js`, `/plugins/schnorrbecher/assets/sounds/adriantnt_glass.mp3` |
| Spotlight | GET, HEAD | `/api/lastevent/settings/:type`, `/api/lastevent/last/:type`, `/api/lastevent/all`, exact overlay library/assets |
| StreamAlchemy | GET, HEAD | `/api/streammonsters/state`, `/plugins/streamalchemy/streammonsters-overlay-views.js`, `/plugins/streamalchemy/assets/branding/stream-monsters-logo.png`, `/plugins/streamalchemy/assets/streammonsters/audio/manifest.json`, safe filenames directly below `/plugins/streamalchemy/assets/streammonsters/audio/` |
| STT Ticker | GET, HEAD | No surface-specific asset or HTTP read route; the shipped overlay is inline and uses shared i18n/Socket.IO assets |
| TopTier | GET, HEAD | `/plugins/toptier/assets/animations.css`, `/plugins/toptier/assets/avatar-placeholder.svg`, `/plugins/toptier/assets/overlay.css`, `/plugins/toptier/assets/overlay.js` |
| Visual FX WebGPU | GET, HEAD | `/api/visual-fx-frame-webgpu/config`, `/plugins/visual-fx-frame-webgpu/default-config.js`, `/plugins/visual-fx-frame-webgpu/renderer/{adaptive-quality,effect-pipelines,gpu-resources,hdr-post-processor,overlay-controller,webgpu-effects-engine}.js`, safe texture files |
| Weather Control | GET, HEAD | `/api/weather/config`, `/api/weather/gamification`, `/plugins/weather-control/weather-engine.js` |
| WebGPU Emoji Rain | GET, HEAD | `/plugins/webgpu-emoji-rain/gpu/{engine,webgpu-emoji-engine}.js`, `/plugins/webgpu-emoji-rain/lib/webgpu-config.js`, plus the exact shared renderer files found by the dependency-crawl contract |
| WebGPU Fireworks | GET, HEAD | Exact renderer imports beneath `/plugins/webgpu-fireworks/gpu/` and `/plugins/webgpu-fireworks/lib/` discovered by the dependency-crawl test, plus safe audio files |
| WebGPU Weather | GET, HEAD | `/api/webgpu-weather/overlay-config`, `/plugins/webgpu-weather-control/gpu/{cinematic-weather-engine,weather-framegraph}.js`, `/plugins/webgpu-weather-control/lib/bootstrap-config.js` |

For renderer module graphs, the implementation step must first run the dependency-crawl test, record each discovered path in the registry as an exact string or tightly anchored safe-file matcher, and commit the expanded matrix in the test. It must not use a broad `/plugins/<id>/**` allow rule.

### Incoming Socket.IO events

Only these client-to-server event names are permitted on a public Quick Tunnel connection:

```text
coinbattle:get-state
pyramid:get-state
fireworks:renderer-fallback
fireworks:register-overlay
fireworks:active-count-response
fireworks:fps-update
game-engine:request-state
plinko:ball-landed
plinko:request-config
plinko:request-leaderboard
slot:spin-completed
unified-queue:request-status
wheel:request-config
wheel:spin-complete
goals:subscribe
goals:animation-end
multigoals:subscribe
tts:playback:ended
musicbot:request-status
zappiehell:request:state
coinJar.sync.request
visual-fx-frame-webgpu:renderer-status
weather:overlay-state
weather:client-ready
weather:request-gamification-state
weather:request-permanent-effects
webgpu-weather:client-ready
webgpu-weather:request-permanent-effects
webgpu-weather:overlay-state
```

The registry must also allow the Socket.IO protocol’s built-in acknowledgement and disconnect/error lifecycle without treating it as an application event. Any other incoming application event is ignored and logged at warning level without its payload.

### Outgoing Socket.IO events

Public sockets must not receive all of LTTH’s global `io.emit(...)` traffic. Build a second, explicit outgoing allowlist from the event names actually consumed by the registered overlay clients.

The implementation contract is:

1. `app/test/public-overlay-socket-events.test.js` scans the registered overlay HTML and static module graph for literal `socket.on(...)` and `socket.once(...)` subscriptions.
2. It excludes only Socket.IO lifecycle names: `connect`, `connect_error`, `disconnect`, `error`, `reconnect`, `reconnect_attempt`, and `reconnect_failed`.
3. It asserts exact set equality with `OUTGOING_SOCKET_EVENTS` from the registry. A newly added overlay listener therefore fails until its event is reviewed and registered.
4. Dynamic event names are forbidden unless represented by a narrowly anchored event-name matcher and a dedicated test.
5. The same test scans literal `socket.emit(...)` calls and asserts exact set equality with `INCOMING_SOCKET_EVENTS`.
6. Raw `new WebSocket(...)` use fails the contract until its path, message directions, and schema are explicitly registered. The initial surface set is expected to use Socket.IO only.

The Socket.IO adapter excludes public sockets from any broadcast whose event is not in `OUTGOING_SOCKET_EVENTS`. Direct `socket.emit(...)` calls to a public socket are filtered by the same registry. Server acknowledgements to allowed incoming events remain permitted.

## Task 1: Add the pinned, verified cloudflared binary manager

**Files:**

- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Create: `app/modules/cloudflared-binary-manager.js`
- Create: `app/test/cloudflared-binary-manager.test.js`

- [ ] **Step 1: Add `tar-stream` as a direct dependency**

Run:

```powershell
Set-Location app
..\runtime\node\npm.cmd install tar-stream@3.1.7 --save
```

Expected: `app/package.json` lists `tar-stream` under `dependencies`; the lockfile records version `3.1.7`.

- [ ] **Step 2: Write failing platform, integrity, and concurrency tests**

Cover all of these cases in `app/test/cloudflared-binary-manager.test.js` with injected `httpsGet`, filesystem root, platform, architecture, clock, and logger:

```js
describe('CloudflaredBinaryManager', () => {
  test.each([
    ['win32', 'x64', 'cloudflared-windows-amd64.exe'],
    ['darwin', 'x64', 'cloudflared-darwin-amd64.tgz'],
    ['darwin', 'arm64', 'cloudflared-darwin-arm64.tgz'],
    ['linux', 'x64', 'cloudflared-linux-amd64'],
    ['linux', 'arm64', 'cloudflared-linux-arm64']
  ])('selects the pinned asset for %s %s', async (platform, arch, asset) => {});

  test('rejects unsupported platform and architecture combinations', async () => {});
  test('uses an already verified executable without downloading', async () => {});
  test('redownloads a direct binary whose persisted digest no longer matches', async () => {});
  test('rejects an asset with a mismatched release SHA-256', async () => {});
  test('aborts a download larger than 100 MiB', async () => {});
  test('aborts a stalled download after 120 seconds', async () => {});
  test('follows only bounded HTTPS redirects to github.com or objects.githubusercontent.com', async () => {});
  test('rejects tar entries with absolute paths, dot segments, links, or extra executable files', async () => {});
  test('extracts the single macOS cloudflared file and persists its derived executable digest', async () => {});
  test('uses a temporary file and atomic rename, leaving no partial executable on failure', async () => {});
  test('coalesces concurrent ensureInstalled calls into one download', async () => {});
});
```

- [ ] **Step 3: Run the test and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\cloudflared-binary-manager.test.js
```

Expected: FAIL because `../modules/cloudflared-binary-manager` does not exist.

- [ ] **Step 4: Implement the manager**

Export these constants and class:

```js
const CLOUDFLARED_VERSION = '2026.7.2';
const DOWNLOAD_TIMEOUT_MS = 120_000;
const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;

class CloudflaredBinaryManager {
  constructor({
    toolsRoot,
    platform = process.platform,
    arch = process.arch,
    httpsGet = https.get,
    logger
  }) {}

  getInstallDir() {}
  getExecutablePath() {}
  getQuickTunnelConfigPath() {}
  async ensureInstalled() {}
}
```

Implementation rules:

1. Map only the five supported platform/architecture pairs to the exact manifest above.
2. Place the executable at:
   - Windows: `<toolsRoot>/cloudflared/2026.7.2/cloudflared.exe`
   - macOS/Linux: `<toolsRoot>/cloudflared/2026.7.2/cloudflared`
3. Store metadata at `<installDir>/install.json` with release asset, release digest, and installed executable digest.
4. On every reuse, hash the executable and compare it with `install.json`; for direct binaries this must also equal the release digest.
5. Stream the response into a sibling `*.partial` file while hashing and counting bytes.
6. Follow at most five HTTPS redirects and reject hosts outside `github.com`, `objects.githubusercontent.com`, and `release-assets.githubusercontent.com`.
7. For `.tgz`, pipe through `zlib.createGunzip()` and `tar-stream.extract()`. Accept exactly one regular file whose basename is `cloudflared`; reject directories other than harmless root entries, links, device nodes, absolute paths, backslashes, and `..`.
8. Apply mode `0o755` on macOS/Linux.
9. Write metadata to a temporary file, then atomically rename the executable and metadata.
10. Keep one in-flight Promise per manager instance and clear it in `finally`.
11. `getQuickTunnelConfigPath()` returns the operating-system null device (`NUL` on Windows, `/dev/null` on macOS/Linux). This supplies a readable empty config and prevents Cloudflared from discovering account credentials in a user-level default config.

- [ ] **Step 5: Run the test and confirm GREEN**

Run the Task 1 Jest command again.

Expected: PASS with no real network access.

- [ ] **Step 6: Commit Task 1**

```powershell
git add app/package.json app/package-lock.json app/modules/cloudflared-binary-manager.js app/test/cloudflared-binary-manager.test.js
git diff --cached --check
git diff --cached
git commit -m "feat: install verified cloudflared runtime"
```

## Task 2: Add a separate overlay Quick Tunnel lifecycle

**Files:**

- Modify: `app/modules/network-manager.js`
- Modify: `app/test/network-manager-security.test.js`
- Create: `app/test/network-manager-overlay-tunnel.test.js`

- [ ] **Step 1: Write failing lifecycle tests**

Construct `NetworkManager` with injected `spawnImpl`, `cloudflaredBinaryManager`, timers, and logger. Cover:

```js
describe('NetworkManager overlay Quick Tunnel', () => {
  test('installs and starts cloudflared on the first ensure call', async () => {});
  test('uses --no-autoupdate and the operating-system null config source', async () => {});
  test('targets 127.0.0.1 and the actual LTTH port', async () => {});
  test('extracts only a strict trycloudflare HTTPS URL from stdout or stderr', async () => {});
  test('coalesces concurrent ensure calls and marks later calls reused', async () => {});
  test('reuses a running healthy overlay tunnel', async () => {});
  test('kills the child and rejects when no URL appears within 60 seconds', async () => {});
  test('records a sanitized last error when the child exits before discovery', async () => {});
  test('clears state when the process exits after discovery', async () => {});
  test('stopOverlayQuickTunnel terminates only the overlay tunnel', async () => {});
  test('shutdown terminates both manual and overlay tunnel processes', async () => {});
  test('does not mutate the existing manual tunnel configuration', async () => {});
});
```

- [ ] **Step 2: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\network-manager-security.test.js test\network-manager-overlay-tunnel.test.js
```

Expected: FAIL because the overlay-tunnel methods and injectable dependencies are absent.

- [ ] **Step 3: Implement the lifecycle**

Keep existing manual fields intact and add separate fields:

```js
this.overlayTunnelProcess = null;
this.overlayTunnelURL = null;
this.overlayTunnelStarting = null;
this.overlayTunnelLastError = null;
```

Add:

```js
async ensureOverlayQuickTunnel(port) {
  // Return { tunnelURL, reused }.
}

async stopOverlayQuickTunnel() {}

getActiveQuickTunnelHosts() {
  // Return normalized lowercase hostnames without ports.
}
```

Spawn only this executable/argument vector:

```js
spawn(executablePath, [
  'tunnel',
  '--no-autoupdate',
  '--config',
  cloudflaredBinaryManager.getQuickTunnelConfigPath(),
  '--url',
  `http://127.0.0.1:${port}`
], {
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
});
```

`getActiveQuickTunnelHosts()` includes:

- The active overlay Quick Tunnel URL.
- The existing manual `tunnelURL` only when its parsed hostname ends in `.trycloudflare.com`.

It excludes arbitrary Host-header values and non-Cloudflare manual providers.

- [ ] **Step 4: Expose status without leaking process details**

Extend `getConfig()` with:

```js
overlayTunnel: {
  active: Boolean(this.overlayTunnelProcess && this.overlayTunnelURL),
  starting: Boolean(this.overlayTunnelStarting),
  url: this.overlayTunnelURL,
  lastError: this.overlayTunnelLastError
}
```

Ensure errors contain no command output beyond a short bounded line and no local filesystem paths.

- [ ] **Step 5: Run the focused tests and confirm GREEN**

Run the Task 2 Jest command again.

- [ ] **Step 6: Commit Task 2**

```powershell
git add app/modules/network-manager.js app/test/network-manager-security.test.js app/test/network-manager-overlay-tunnel.test.js
git diff --cached --check
git diff --cached
git commit -m "feat: manage overlay quick tunnel lifecycle"
```

## Task 3: Build the central public-overlay registry

**Files:**

- Create: `app/modules/public-overlay-registry.js`
- Create: `app/test/public-overlay-registry.test.js`
- Create: `app/test/public-overlay-dependency-crawl.test.js`
- Create: `app/test/public-overlay-socket-events.test.js`

- [ ] **Step 1: Write failing normalization and deny-by-default tests**

Cover:

```js
describe('public overlay registry', () => {
  test.each([
    ['GET', '/'],
    ['GET', '/dashboard.html'],
    ['GET', '/api/network/config'],
    ['POST', '/api/plugins/game-engine/reload'],
    ['GET', '/plugins/game-engine/ui.html'],
    ['GET', '/plugins/coinbattle/overlay/../ui.html'],
    ['GET', '/plugins//coinbattle/overlay'],
    ['TRACE', '/animation-overlay.html']
  ])('denies %s %s', (method, pathname) => {});

  test('allows every declared entrypoint with GET and HEAD', () => {});
  test('allows every declared asset and data-route method', () => {});
  test('does not let query parameters change route matching', () => {});
  test.each([
    '/%2e%2e/dashboard.html',
    '/plugins%5cgame-engine%5cui.html',
    '/plugins/game-engine/%00overlay',
    '/plugins/game-engine/%2e%2e/ui.html',
    '/plugins/game-engine/overlay%2f..%2fui.html'
  ])('rejects ambiguous or unsafe path %s', pathname => {});

  test('allows exactly the declared incoming Socket.IO events', () => {});
  test('denies unknown incoming Socket.IO events', () => {});
  test('allows exactly the declared outgoing Socket.IO events', () => {});
  test('denies unknown outgoing Socket.IO events', () => {});
});
```

- [ ] **Step 2: Add a dependency-crawl contract**

For each entrypoint, read its served HTML source or route target and recursively collect local `src`, `href`, static `import`, `fetch`, and Socket.IO client script references. Assert:

- Every collected local GET/HEAD dependency is allowed.
- No dependency resolves to an admin UI or broad API prefix.
- Each explicit exception is represented as a named fixture row, not a skip.
- The crawl depth is capped and tracks visited paths.

The test’s surface fixture table must list all entrypoints in the Public Surface Matrix. For dynamic URLs, use representative fixture values:

```js
{
  '/advanced-timer/overlay?timer=fixture-timer': '/plugins/advanced-timer/overlay/index.html',
  '/plugins/coinbattle/overlay?mode=classic': '/plugins/coinbattle/overlay/overlay.html',
  '/goals/overlay?id=fixture-goal': '/plugins/goals/overlay/index.html',
  '/overlay/spotlight/gift': '<route target resolved by plugin>',
  '/overlay/stt-ticker?mode=subtitle': '/plugins/stt-ticker/overlay/ticker.html'
}
```

Add `app/test/public-overlay-socket-events.test.js` alongside the HTTP crawl. Its source graph is the same registered overlay graph, but its assertions compare literal incoming/outgoing Socket.IO use with the two registry sets as specified under “Outgoing Socket.IO events.”

- [ ] **Step 3: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\public-overlay-registry.test.js test\public-overlay-dependency-crawl.test.js test\public-overlay-socket-events.test.js
```

Expected: FAIL because the registry is absent.

- [ ] **Step 4: Implement explicit route definitions**

Use immutable arrays grouped by surface:

```js
const ENTRYPOINTS = Object.freeze([
  exact('/animation-overlay.html'),
  exact('/advanced-timer/overlay'),
  exact('/overlay/animazingpal/stream-assistant'),
  pattern(/^\/overlay\/spotlight\/[A-Za-z0-9_-]+$/)
]);

const HTTP_RULES = Object.freeze([
  methods(['GET', 'HEAD'], exact('/socket.io/socket.io.js')),
  methods(['GET', 'POST'], exact('/socket.io/')),
  methods(['GET', 'HEAD'], exact('/js/i18n-client.js'))
]);
```

Complete these arrays with every row in the Public Surface Matrix. `HEAD` is permitted only wherever `GET` is permitted. Do not infer `OPTIONS`, mutations, or parent-directory access.

Use WHATWG `URL` only for parsing, then apply strict decoded-path validation. Return a canonical pathname or throw a typed `PublicPathError`.

- [ ] **Step 5: Implement response redaction primitives**

Export:

```js
const FORBIDDEN_PUBLIC_KEYS = /(?:api[_-]?key|(?:access|auth|refresh)?[_-]?token|secret|password|credential|cookie)/i;
function redactPublicPayload(value) {}
```

`redactPublicPayload` recursively copies arrays/plain objects, drops matching keys, preserves JSON scalar values, prevents cycles, and rejects non-JSON objects. It is defense-in-depth for public JSON responses, not a substitute for explicit route registration.

Add tests proving nested secrets are absent while renderer-required ordinary values, including non-authentication game/stream session identifiers needed by an overlay, remain.

- [ ] **Step 6: Run and confirm GREEN**

Run the Task 3 Jest command again. If the dependency crawl finds an unregistered file, add that exact path to both the registry and the fixture expectations; do not widen a whole plugin directory.

- [ ] **Step 7: Commit Task 3**

```powershell
git add app/modules/public-overlay-registry.js app/test/public-overlay-registry.test.js app/test/public-overlay-dependency-crawl.test.js app/test/public-overlay-socket-events.test.js
git diff --cached --check
git diff --cached
git commit -m "feat: register public overlay surfaces"
```

## Task 4: Enforce the registry in Express and Socket.IO

**Files:**

- Create: `app/modules/public-overlay-access.js`
- Create: `app/modules/public-overlay-socket-adapter.js`
- Create: `app/test/public-overlay-access.test.js`
- Create: `app/test/public-overlay-socket-adapter.test.js`
- Modify: `app/server.js`

- [ ] **Step 1: Write failing host and HTTP enforcement tests**

Use a small Express app with an injected `networkManager` and Supertest. Cover:

```js
describe('public overlay access middleware', () => {
  test('does not affect localhost requests', async () => {});
  test('does not affect a configured non-Cloudflare manual tunnel host', async () => {});
  test('allows a registered route on an active Quick Tunnel host', async () => {});
  test('returns neutral 404 for an unregistered path on that host', async () => {});
  test('does not reveal whether a denied API or file exists', async () => {});
  test('rejects method override headers on public hosts', async () => {});
  test('normalizes Host case and an optional port', async () => {});
  test('does not trust X-Forwarded-Host over Host', async () => {});
  test('classifies any valid subdomain of trycloudflare.com as public even if it is not the current tunnel URL', async () => {});
  test('does not classify trycloudflare.com apex or lookalike suffixes', async () => {});
  test('redacts forbidden keys from allowed JSON responses only on public hosts', async () => {});
});
```

The neutral response is exactly:

```json
{ "error": "Not found" }
```

with status 404 and no route, plugin, or policy details.

- [ ] **Step 2: Write failing Socket.IO policy tests**

Use an injectable fake socket or an isolated Socket.IO server/client pair:

```js
test('accepts Engine.IO handshake on an active Quick Tunnel host', async () => {});
test('leaves localhost sockets unrestricted', async () => {});
test('permits a registered public incoming event', async () => {});
test('drops and warns for an unregistered public incoming event without logging payload', async () => {});
test('delivers a registered broadcast to local and public sockets', async () => {});
test('delivers an unregistered broadcast to local sockets but excludes the public room', async () => {});
test('filters an unregistered direct socket.emit to a public socket', async () => {});
test('does not alter direct or broadcast output to localhost sockets', async () => {});
```

- [ ] **Step 3: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\public-overlay-access.test.js test\public-overlay-socket-adapter.test.js
```

- [ ] **Step 4: Implement Express middleware**

Export:

```js
function normalizeHostname(hostHeader) {}
function isQuickTunnelHost(hostname) {}
function isQuickTunnelRequest(req) {}
function createPublicOverlayMiddleware({ logger }) {}
function attachPublicSocketPolicy({ io, logger }) {}
```

Middleware order in `app/server.js`:

1. Express app and trust-proxy setup.
2. `createPublicOverlayMiddleware(...)`.
3. Clerk proxy/auth, cache controls, JSON bodies, static mounts, plugin routes, and APIs.

This order ensures denied paths never reach Clerk proxying, static files, or API handlers. Classification is based on the normalized raw `Host` suffix `.<trycloudflare.com>` and does not trust a client-controlled claim that the host is the currently active tunnel. For allowed public JSON routes, wrap `res.json` for the duration of the request and pass the payload through `redactPublicPayload`.

Reject these headers on public hosts when present:

```text
X-HTTP-Method-Override
X-Method-Override
X-Original-Method
```

- [ ] **Step 5: Implement Socket.IO middleware and outbound adapter**

During the Engine.IO request, derive public-tunnel status from `socket.handshake.headers.host` and store it in `socket.data.publicQuickTunnel`. In namespace middleware, join those sockets to the reserved room `__ltth_public_quick_tunnel__` before connection handlers run. Use `socket.use(([eventName], next) => ...)` to allow only registry events for public sockets. On denial, log hostname and event name only; do not log event arguments.

Implement `createPublicOverlayAdapter(BaseAdapter)` in `app/modules/public-overlay-socket-adapter.js`:

- For a registered outgoing event, delegate the broadcast unchanged.
- For an unregistered outgoing event, delegate with the reserved public room added to `opts.except`, so local sockets retain current behavior.
- Wrap direct `socket.emit` for public sockets and drop unregistered application events.
- Preserve Socket.IO protocol packets and acknowledgements.
- Do not modify payloads or event flow for non-public sockets.

Install the adapter before accepting connections.

- [ ] **Step 6: Wire managers in `app/server.js`**

Instantiate:

```js
const cloudflaredBinaryManager = new CloudflaredBinaryManager({
  toolsRoot: path.join(
    configPathManager.getDefaultConfigDir(),
    'runtime-tools'
  ),
  logger
});

networkManager = new NetworkManager(db, {
  cloudflaredBinaryManager
});
```

Declare `let networkManager` before Socket.IO setup so existing CORS callbacks and later initialization share one binding. Preserve existing NetworkManager initialization behavior. Add the active overlay tunnel origin to the existing CORS decision through NetworkManager rather than adding a second CORS implementation.

- [ ] **Step 7: Run and confirm GREEN**

Run:

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\public-overlay-registry.test.js test\public-overlay-socket-events.test.js test\public-overlay-access.test.js test\public-overlay-socket-adapter.test.js test\network-manager-overlay-tunnel.test.js
```

- [ ] **Step 8: Commit Task 4**

```powershell
git add app/modules/public-overlay-access.js app/modules/public-overlay-socket-adapter.js app/test/public-overlay-access.test.js app/test/public-overlay-socket-adapter.test.js app/server.js
git diff --cached --check
git diff --cached
git commit -m "feat: enforce overlay-only quick tunnel access"
```

## Task 5: Add server-validated ensure/stop APIs

**Files:**

- Create: `app/modules/public-overlay-url.js`
- Create: `app/test/public-overlay-url.test.js`
- Create: `app/test/network-overlay-tunnel-api.test.js`
- Modify: `app/server.js`

- [ ] **Step 1: Write failing URL validation tests**

Cover:

```js
describe('buildPublicOverlayURL', () => {
  test('accepts a registered URL on the current LTTH origin', () => {});
  test('preserves search parameters and strips no valid encoded values', () => {});
  test('rejects an unregistered local path', () => {});
  test('rejects a different origin, credentials, fragment, malformed encoding, and non-http protocol', () => {});
  test('constructs the result from the server-owned tunnel origin', () => {});
});
```

Function signature:

```js
function validateRequestedOverlayURL({ overlayURL, requestOrigin }) {}
function buildPublicOverlayURL({ tunnelURL, validatedOverlayURL }) {}
```

- [ ] **Step 2: Write failing API tests**

Cover:

```js
test('ensure rejects a missing overlayURL with 400', async () => {});
test('ensure rejects a local but unregistered URL before starting cloudflared', async () => {});
test('ensure starts the tunnel once and returns server-built publicURL', async () => {});
test('ensure reports reused true for the shared running tunnel', async () => {});
test('ensure returns 503 and a retryable public message when installation or startup fails', async () => {});
test('stop is idempotent', async () => {});
test('the Quick Tunnel middleware denies both management APIs publicly', async () => {});
```

- [ ] **Step 3: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\public-overlay-url.test.js test\network-overlay-tunnel-api.test.js
```

- [ ] **Step 4: Implement validation and routes**

Add, behind the existing API limiter:

```js
app.post('/api/network/overlay-tunnel/ensure', apiLimiter, async (req, res) => {
  // Validate req.body.overlayURL before ensureOverlayQuickTunnel(actualPort).
  // Return { success, tunnelURL, publicURL, reused }.
});

app.post('/api/network/overlay-tunnel/stop', apiLimiter, async (_req, res) => {
  // Stop only the overlay Quick Tunnel.
});
```

Use the bound server port, not an untrusted request port, for `cloudflared --url`. Derive the accepted local request origin from LTTH’s configured/bound origins and loopback aliases; do not trust `X-Forwarded-Host`.

Return bounded error codes:

```text
OVERLAY_URL_REQUIRED
OVERLAY_URL_NOT_REGISTERED
OVERLAY_TUNNEL_INSTALL_FAILED
OVERLAY_TUNNEL_START_FAILED
```

Do not return executable paths, raw cloudflared output, or stack traces.

- [ ] **Step 5: Run and confirm GREEN**

Run the Task 5 Jest command again.

- [ ] **Step 6: Commit Task 5**

```powershell
git add app/modules/public-overlay-url.js app/test/public-overlay-url.test.js app/test/network-overlay-tunnel-api.test.js app/server.js
git diff --cached --check
git diff --cached
git commit -m "feat: expose validated overlay tunnel API"
```

## Task 6: Add the shared browser copy helper

**Files:**

- Create: `app/public/js/tiktok-studio-url.js`
- Create: `app/test/tiktok-studio-url.test.js`

- [ ] **Step 1: Write failing browser-helper tests**

Load the CommonJS export under Jest and inject `fetch`, `navigator.clipboard`, document, and current location:

```js
describe('LTTHTikTokStudioUrl.copy', () => {
  test('posts the current registered local URL to ensure and copies publicURL', async () => {});
  test('resolves to the exact copied public URL', async () => {});
  test('copies an external HTTPS URL unchanged without calling ensure', async () => {});
  test('rejects external HTTP and credential-bearing URLs', async () => {});
  test('rejects a malformed or missing raw URL', async () => {});
  test('does not copy a local fallback when ensure fails', async () => {});
  test('uses a readonly textarea fallback when Clipboard API is unavailable', async () => {});
  test('removes the fallback textarea after success and failure', async () => {});
  test('coalesces concurrent ensure requests but performs each requested clipboard write', async () => {});
});
```

- [ ] **Step 2: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-url.test.js
```

- [ ] **Step 3: Implement the helper**

Use a UMD-style CommonJS/browser export:

```js
(function initTikTokStudioUrl(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.LTTHTikTokStudioUrl = api;
  }
})(typeof window !== 'undefined' ? window : null, function createApi() {
  async function copy(rawUrl, dependencies = {}) {}
  return { copy };
});
```

Behavior:

1. Resolve `rawUrl` against `window.location.href`.
2. If it is same-origin or a recognized loopback/LAN LTTH URL, POST its full URL to `/api/network/overlay-tunnel/ensure`.
3. Require JSON `{ success: true, publicURL }` and validate `publicURL` as HTTPS.
4. If it is cross-origin HTTPS, copy it unchanged.
5. Reject all other protocols and credentials.
6. Prefer `navigator.clipboard.writeText`; otherwise use a readonly off-screen textarea plus `document.execCommand('copy')`.
7. Throw `TikTokStudioUrlError` with stable `code` values so UIs can localize messages.

- [ ] **Step 4: Run and confirm GREEN**

Run the Task 6 Jest command again.

- [ ] **Step 5: Commit Task 6**

```powershell
git add app/public/js/tiktok-studio-url.js app/test/tiktok-studio-url.test.js
git diff --cached --check
git diff --cached
git commit -m "feat: add TikTok Studio URL copy helper"
```

## Task 7: Add shared localization and Network settings status

**Files:**

- Modify: `app/locales/de.json`
- Modify: `app/locales/en.json`
- Modify: `app/locales/es.json`
- Modify: `app/locales/fr.json`
- Modify: `app/locales/literal-inventory.json` only if the locale tooling requires the new literal
- Modify: `app/public/dashboard.html`
- Modify: `app/public/js/network-settings.js`
- Create: `app/test/tiktok-studio-network-settings.test.js`

These locale and dashboard files already have unrelated local changes. Use exact `apply_patch` hunks, inspect the working diff before staging, and stage only the new hunks with `git add -p`.

- [ ] **Step 1: Write failing localization and status tests**

Assert all four locale files contain equivalent keys:

```text
common.tiktok_studio.copy_url
common.tiktok_studio.starting
common.tiktok_studio.copied
common.tiktok_studio.copy_failed
common.tiktok_studio.tunnel_failed
common.tiktok_studio.url_unavailable
network.overlay_tunnel.title
network.overlay_tunnel.active
network.overlay_tunnel.inactive
network.overlay_tunnel.starting
network.overlay_tunnel.stop
network.overlay_tunnel.restart_notice
network.overlay_tunnel.test_service_notice
```

Required German strings:

```text
TikTok-Studio-URL kopieren
Die Quick-Tunnel-URL ändert sich nach einem Neustart von LTTH.
Cloudflare Quick Tunnel ist ein Testdienst ohne Verfügbarkeitsgarantie.
```

Test `network-settings.js` with a DOM fixture for inactive, starting, active, last-error, copy, and stop states.

- [ ] **Step 2: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-network-settings.test.js
```

- [ ] **Step 3: Add localized Network settings markup**

Add a distinct “Overlay Quick Tunnel” card under the existing tunnel settings with:

- Status badge.
- Readonly current URL.
- Copy-current-tunnel-URL action shown only while active.
- Stop action shown while active or starting.
- Last error region using `role="alert"`.
- Restart notice and test-service notice.

Do not rename or change the existing manual-tunnel controls.

- [ ] **Step 4: Implement status rendering and stop**

Update `network-settings.js` to consume `config.overlayTunnel`, render the states, copy the current URL, and POST `/api/network/overlay-tunnel/stop`. The settings page must not start a tunnel merely by loading.

- [ ] **Step 5: Run localization and focused tests**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-network-settings.test.js test\app-generated-i18n-migration.test.js
..\runtime\node\npm.cmd run i18n:check
```

- [ ] **Step 6: Commit only Task 7 hunks**

```powershell
git add -p app/locales/de.json app/locales/en.json app/locales/es.json app/locales/fr.json app/locales/literal-inventory.json app/public/dashboard.html
git add app/public/js/network-settings.js app/test/tiktok-studio-network-settings.test.js
git diff --cached --check
git diff --cached
git commit -m "feat: show overlay quick tunnel status"
```

## Task 8: Add the TikTok copy action to straightforward overlay UIs

**Files:**

- Create: `app/test/tiktok-studio-overlay-inventory.test.js`
- Modify: `app/public/dashboard.html`
- Modify: `app/public/js/dashboard-soundboard.js`
- Modify: `app/plugins/animazingpal/ui.html`
- Modify: `app/plugins/animazingpal/live-host-ui.js`
- Modify: `app/plugins/flame-overlay/ui/settings.html`
- Modify: `app/plugins/gcce/ui.html`
- Modify: `app/plugins/interactive-story/ui.html`
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/openshock/ui.html`
- Modify: `app/plugins/openshock/ui.js`
- Modify: `app/plugins/schnorrbecher/ui.html`
- Modify: `app/plugins/schnorrbecher/ui.js`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`
- Modify: `app/plugins/stt-ticker/ui.html`
- Modify: `app/plugins/stt-ticker/capture.html`
- Modify: `app/plugins/toptier/ui.html`
- Modify: `app/plugins/visual-fx-frame-webgpu/ui/settings.html`
- Modify: `app/plugins/weather-control/ui.html`
- Modify: `app/plugins/webgpu-weather-control/ui.html`

`dashboard.html` and StreamAlchemy have unrelated local changes; stage only exact feature hunks.

- [ ] **Step 1: Write a failing inventory test**

Create one fixture row per user-visible overlay URL:

```js
{
  html: 'plugins/music-bot/ui.html',
  expectedPath: '/plugins/music-bot/overlay.html',
  expectedButtons: 1
}
```

For every row assert:

- The page includes `/js/tiktok-studio-url.js`.
- Each overlay URL group has a button with `data-copy-tiktok-studio-url`.
- The handler reads the current URL field/value at click time.
- The button uses `common.tiktok_studio.copy_url` where i18n is available.
- Existing OBS copy controls remain present.

Include all files listed in this task and set `expectedButtons` to the actual number of distinct overlay URL groups.

- [ ] **Step 2: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-overlay-inventory.test.js
```

- [ ] **Step 3: Add the helper script and buttons**

Use this semantic structure, adapting only to each page’s existing CSS classes:

```html
<button type="button"
        data-copy-tiktok-studio-url
        data-i18n="common.tiktok_studio.copy_url">
  TikTok-Studio-URL kopieren
</button>
<script src="/js/tiktok-studio-url.js"></script>
```

At click time:

```js
button.addEventListener('click', async () => {
  const rawUrl = currentOverlayUrlElement.value || currentOverlayUrlElement.textContent;
  button.disabled = true;
  try {
    const copiedUrl = await window.LTTHTikTokStudioUrl.copy(rawUrl.trim());
    showExistingSuccessToast(copiedUrl);
  } catch (error) {
    showExistingErrorToast(localizeTikTokCopyError(error.code));
  } finally {
    button.disabled = false;
  }
});
```

Reuse each page’s existing toast/status mechanism. If a page has none, add an adjacent `role="status"` element; do not use `alert()`.

- [ ] **Step 4: Handle Interactive Story public safety**

The public overlay currently can write `/api/interactive-story/overlay-positions`. Remove or disable position-save controls when the page is being served through a public Quick Tunnel. Keep local editing behavior intact. Do not register the POST route. Add a regression assertion to `app/test/interactive-story-local-preview.test.js` proving:

- Local overlay mode can still save positions.
- Public-render mode does not issue the POST.

- [ ] **Step 5: Run the inventory and closest existing UI tests**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-overlay-inventory.test.js test\animazingpal-live-host-ui.test.js test\interactive-story-local-preview.test.js test\music-bot-ui-i18n.test.js test\openshock-ui-i18n.test.js test\stt-ticker-ui-i18n.test.js test\toptier-ui-i18n.test.js test\visual-fx-frame-webgpu-ui.test.js test\weather-control-ui-i18n.test.js test\webgpu-weather-control-plugin.test.js
```

- [ ] **Step 6: Commit only Task 8 hunks**

Stage new/otherwise clean files normally. Use `git add -p` for dirty files, then inspect the cached diff.

```powershell
git diff --cached --check
git diff --cached
git commit -m "feat: add TikTok copy to overlay controls"
```

## Task 9: Add the action to dynamic and multi-overlay UIs

**Files:**

- Modify: `app/plugins/advanced-timer/ui.html`
- Modify: `app/plugins/advanced-timer/ui/ui.js`
- Modify: `app/plugins/clarityhud/ui/main.html`
- Modify: `app/plugins/clarityhud/ui/main.js`
- Modify: `app/plugins/coinbattle/ui.html`
- Modify: `app/plugins/coinbattle/ui.js`
- Modify: `app/plugins/fireworks/ui/settings.html`
- Modify: `app/plugins/fireworks/ui/settings.js`
- Modify: `app/plugins/goals/ui.html`
- Modify: `app/plugins/goals/ui.js`
- Modify: `app/plugins/spotlight/ui/main.html`
- Modify: `app/plugins/spotlight/ui/main.js`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.html`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.js`
- Modify: `app/test/tiktok-studio-overlay-inventory.test.js`

- [ ] **Step 1: Extend the inventory test and confirm RED**

Add rows for every dynamic URL group:

| UI | Required current-click behavior |
|---|---|
| Advanced Timer | Copy the URL for the selected/current timer ID |
| ClarityHUD | Copy the currently displayed `chat`, `full`, `multi`, or `stream` overlay URL |
| CoinBattle | Preserve the currently selected mode/layout query |
| Fireworks | Read the current overlay URL from the settings view |
| Goals | Distinguish single-goal and multigoal URLs and preserve the selected ID |
| Spotlight | Read the selected event type at click time |
| WebGPU Fireworks | Read the current overlay URL from settings |

Run the Task 8 inventory command and confirm the new rows fail.

- [ ] **Step 2: Implement one button per dynamic URL group**

Do not cache a URL during page load. Each click must read the page’s current selection, selected ID, or current text field. Disable only the clicked button while awaiting the shared helper.

- [ ] **Step 3: Run dynamic UI tests**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-overlay-inventory.test.js test\advanced-timer-ui-i18n.test.js test\clarityhud-ui-i18n.test.js test\coinbattle-runtime-i18n.test.js test\fireworks-ui-i18n-runtime.test.js test\goals-ui-i18n.test.js test\lastevent-spotlight-ui.test.js test\webgpu-fireworks-settings-contract.test.js
```

- [ ] **Step 4: Commit Task 9**

```powershell
git add app/plugins/advanced-timer/ui.html app/plugins/advanced-timer/ui/ui.js app/plugins/clarityhud/ui/main.html app/plugins/clarityhud/ui/main.js app/plugins/coinbattle/ui.html app/plugins/coinbattle/ui.js app/plugins/fireworks/ui/settings.html app/plugins/fireworks/ui/settings.js app/plugins/goals/ui.html app/plugins/goals/ui.js app/plugins/spotlight/ui/main.html app/plugins/spotlight/ui/main.js app/plugins/webgpu-fireworks/ui/settings.html app/plugins/webgpu-fireworks/ui/settings.js app/test/tiktok-studio-overlay-inventory.test.js
git diff --cached --check
git diff --cached
git commit -m "feat: support dynamic TikTok overlay URLs"
```

## Task 10: Add the action to legacy multi-URL pages and Game Engine

**Files:**

- Modify: `app/plugins/emoji-rain/ui.html`
- Modify: `app/plugins/webgpu-emoji-rain/ui.html`
- Modify: `app/plugins/quiz-show/quiz_show.html`
- Modify: `app/plugins/quiz-show/quiz_show.js`
- Modify: `app/plugins/quiz-show/quiz_show_overlay.js`
- Modify: `app/plugins/game-engine/ui.html`
- Modify: `app/plugins/vdoninja/ui.html`
- Modify: `app/test/tiktok-studio-overlay-inventory.test.js`
- Create: `app/test/tiktok-studio-external-url.test.js`

`app/plugins/game-engine/ui.html` already has unrelated local changes. Use exact hunks and `git add -p`.

- [ ] **Step 1: Extend the inventory test**

Require:

- Five Emoji Rain buttons for the displayed variants: full, `emojiregen-geschenkeregen`, `emojiregen`, `herzballons`, `geschenkeregen`.
- Five WebGPU Emoji Rain buttons for the same variants.
- Three Quiz Show buttons: normal overlay, splitscreen, leaderboard.
- One TikTok button for every distinct displayed Game Engine overlay URL: arena, chess, connect4, HUD, plinko, slot, unified, wheel. If the UI displays the same route in more than one panel, attach a button to each visible URL group rather than deduplicating hidden panels.
- One VDO.Ninja Director button that sends the external HTTPS URL through the helper unchanged.

- [ ] **Step 2: Write the external URL regression test**

Prove the VDO.Ninja handler:

- Reads the current Director URL.
- Calls `LTTHTikTokStudioUrl.copy`.
- Does not pre-rewrite the host to `trycloudflare.com`.
- Preserves HTTPS URL query parameters.

- [ ] **Step 3: Run and confirm RED**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-overlay-inventory.test.js test\tiktok-studio-external-url.test.js
```

- [ ] **Step 4: Implement all multi-URL buttons**

For inline-script legacy pages, include `/js/tiktok-studio-url.js` before the inline handler block. Keep existing copy buttons and their IDs unchanged. Each new button gets its own `data-copy-tiktok-studio-url` marker and derives the current neighboring URL on click.

- [ ] **Step 5: Keep Quiz Show settings writes local-only**

`quiz_show_overlay.js` currently POSTs `/api/quiz-show/hud-config` from overlay controls. Do not register that public POST. When `window.location.hostname` is a valid `*.trycloudflare.com` hostname, keep the overlay in render-only mode and do not issue the settings write. Preserve the existing controls and POST behavior on localhost/LAN hosts. Add assertions to `app/test/quiz-show-runtime-i18n.test.js` or a new focused DOM test for both modes.

- [ ] **Step 6: Run the closest suites**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\tiktok-studio-overlay-inventory.test.js test\tiktok-studio-external-url.test.js test\emoji-rain-runtime-i18n.test.js test\webgpu-emoji-rain-ui-i18n.test.js test\quiz-show-runtime-i18n.test.js test\game-engine-visible-controls-i18n.test.js test\game-engine-manual-mode-ui.test.js
```

- [ ] **Step 7: Commit only Task 10 hunks**

```powershell
git add app/plugins/emoji-rain/ui.html app/plugins/webgpu-emoji-rain/ui.html app/plugins/quiz-show/quiz_show.html app/plugins/quiz-show/quiz_show.js app/plugins/quiz-show/quiz_show_overlay.js app/plugins/vdoninja/ui.html app/test/tiktok-studio-overlay-inventory.test.js app/test/tiktok-studio-external-url.test.js
git add -p app/plugins/game-engine/ui.html
git diff --cached --check
git diff --cached
git commit -m "feat: cover all TikTok overlay URL variants"
```

## Task 11: Prove allowed overlays work and denied surfaces stay private

**Files:**

- Create: `app/test/public-overlay-security-matrix.test.js`
- Modify: `app/modules/public-overlay-registry.js` only for exact dependencies proven missing
- Modify: renderer/backend files only if a registered read response must be narrowed or redacted
- Modify: `app/test/public-overlay-dependency-crawl.test.js`

- [ ] **Step 1: Build a full HTTP security matrix test**

For every registered entrypoint:

1. Request it with an active Quick Tunnel Host.
2. Assert 2xx/3xx as expected.
3. Parse local subresources and request each through the same host.
4. Mock or fixture dynamic IDs.
5. Assert no response body exposes forbidden public keys.

Also assert 404 for:

```text
/
/dashboard.html
/settings
/api/network/config
/api/plugins
/api/plugins/game-engine/reload
/plugins/game-engine/ui.html
/plugins/interactive-story/ui.html
/plugin-store.json
/logs
/config
/.git/config
/..%2f..%2f
```

Test GET, POST, PUT, PATCH, DELETE, OPTIONS, and TRACE against representative denied paths. Socket.IO’s registered exact transport path is the only public transport exception.

- [ ] **Step 2: Write public JSON privacy tests**

For every allowed `/api/...` read route:

- Feed a representative response containing its normal renderer fields.
- Add nested canary fields named `apiKey`, `api_key`, `token`, `accessToken`, `auth_token`, `refreshToken`, `secret`, `password`, `credential`, and `cookie`.
- Assert the public response removes every canary.
- Assert the localhost response remains unchanged.
- Assert the renderer-required fields remain present.

If a renderer depends on a forbidden-name field, create a dedicated public projection with a non-secret renderer field rather than weakening the forbidden-key policy.

Add equivalent representative-payload assertions for every registered outgoing Socket.IO event. These event-contract tests fail if an allowed public broadcast contains credential fields; Socket.IO payloads are not automatically redacted because the same original event may also be delivered to trusted local clients.

- [ ] **Step 3: Run and confirm RED, then close exact gaps**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\public-overlay-registry.test.js test\public-overlay-dependency-crawl.test.js test\public-overlay-socket-events.test.js test\public-overlay-access.test.js test\public-overlay-socket-adapter.test.js test\public-overlay-security-matrix.test.js
```

Add only exact dependencies or tight filename matchers demonstrated by the failure. Never solve a failure by permitting an entire plugin directory or `/api/<plugin>/**`.

- [ ] **Step 4: Run and confirm GREEN**

Repeat the Task 11 command until the complete matrix passes.

- [ ] **Step 5: Commit Task 11**

```powershell
git add app/test/public-overlay-security-matrix.test.js app/test/public-overlay-dependency-crawl.test.js app/modules/public-overlay-registry.js
git add -p app
git diff --cached --check
git diff --cached
git commit -m "test: prove public overlay isolation"
```

Before committing, unstage any unrelated hunk introduced by the broad interactive `git add -p app` pass.

## Task 12: Final verification and live smoke test

**Files:**

- Modify: `docs/superpowers/specs/2026-07-26-tiktok-studio-quick-tunnel-design.md` only if implementation evidence requires a factual correction
- Modify: `docs/SNAPSHOT_STATUS.md` with the completed feature and verification evidence

- [ ] **Step 1: Run the focused feature suite**

```powershell
Set-Location app
..\runtime\node\node.exe .\node_modules\jest\bin\jest.js --runInBand test\cloudflared-binary-manager.test.js test\network-manager-security.test.js test\network-manager-overlay-tunnel.test.js test\public-overlay-registry.test.js test\public-overlay-dependency-crawl.test.js test\public-overlay-socket-events.test.js test\public-overlay-access.test.js test\public-overlay-socket-adapter.test.js test\public-overlay-url.test.js test\network-overlay-tunnel-api.test.js test\tiktok-studio-url.test.js test\tiktok-studio-network-settings.test.js test\tiktok-studio-overlay-inventory.test.js test\tiktok-studio-external-url.test.js test\public-overlay-security-matrix.test.js
```

Expected: all feature tests PASS.

- [ ] **Step 2: Run project checks**

```powershell
Set-Location app
..\runtime\node\npm.cmd test -- --runInBand
..\runtime\node\npm.cmd run lint
..\runtime\node\npm.cmd run build:css
Set-Location ..
git diff --check
```

Record unrelated baseline failures separately. Do not call the feature complete if any focused feature test fails.

- [ ] **Step 3: Perform an isolated real Quick Tunnel smoke test**

Prerequisites:

- No production/live stream disruption.
- The test LTTH instance is bound to a known local port.
- No existing user tunnel process is stopped.

Steps:

1. Remove only a disposable test copy of the versioned runtime-tools directory, never the user’s main runtime directory.
2. Click “TikTok-Studio-URL kopieren” for one simple Socket.IO overlay and one API-reading overlay.
3. Verify one binary download occurs and its digest/metadata match the pinned asset.
4. Verify both copied URLs share one random `https://*.trycloudflare.com` origin.
5. Open both URLs and confirm rendering/data updates.
6. Request `<tunnel>/dashboard.html` and `<tunnel>/api/network/config`; confirm neutral 404.
7. Attempt one unregistered Socket.IO client event; confirm it is dropped and only event name/host are logged.
8. Click the existing OBS copy button; confirm it still copies the local URL.
9. Copy a VDO.Ninja Director URL; confirm it remains unchanged and no new tunnel is started if no local overlay was copied.
10. Stop the overlay tunnel in Network settings and confirm the manual tunnel state remains untouched.
11. Restart the disposable LTTH instance, copy again, and confirm a new Quick Tunnel URL is produced.

- [ ] **Step 4: Update active technical status**

Add a concise entry to `docs/SNAPSHOT_STATUS.md` stating:

- Automatic first-use Quick Tunnel behavior.
- Pinned cloudflared version and verified install location.
- Overlay-only central registry and neutral deny behavior.
- Shared session lifecycle and restart URL change.
- Focused test and smoke-test evidence.
- Any known Cloudflare Quick Tunnel constraints: test service, no SLA, 200 in-flight request cap, no SSE.

- [ ] **Step 5: Review working-tree scope**

```powershell
git status --short
git log --oneline --decorate -12
git diff --stat
git diff --check
```

Confirm unrelated pre-existing changes are still present and were not included in feature commits.

- [ ] **Step 6: Commit verification documentation**

```powershell
git add docs/SNAPSHOT_STATUS.md
git diff --cached --check
git diff --cached
git commit -m "docs: record TikTok quick tunnel verification"
```

## Completion Criteria

- Every displayed overlay URL has a neighboring TikTok Studio copy action.
- First local-overlay use downloads/verifies `cloudflared` when absent, starts one shared Quick Tunnel, and copies a valid public HTTPS URL.
- Subsequent local-overlay copies reuse the shared tunnel until stop or LTTH shutdown.
- External HTTPS overlay URLs are copied unchanged.
- Existing local OBS copy behavior is unchanged.
- The public Host can reach every registered overlay dependency needed for rendering.
- The public Host cannot reach dashboard/settings/plugin UIs, broad APIs, arbitrary static files, or unregistered Socket.IO events.
- Allowed public JSON responses do not expose secrets or credentials.
- Manual `*.trycloudflare.com` tunnels receive the same overlay-only policy.
- Non-Cloudflare manual tunnel providers retain existing behavior and warnings.
- Download/install/start failures are visible, localized, and retryable, with no local fallback copied.
- Focused tests pass under LTTH’s bundled Node; full-suite/lint/CSS results are recorded honestly.
- Commits contain only feature changes and preserve unrelated dirty-worktree work.
