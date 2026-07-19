# WebGPU Fireworks Release and Runtime Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task by task. Every production behavior change must first be observed failing for the expected reason.

**Goal:** Prove the hardened plugin through the real LTTH plugin loader, a real local network boundary, installed Chrome WebGPU, and the exact non-live OBS WebGPU source; then align all local plugin release surfaces to stable opt-in version 3.1.1 without publishing or changing the LTTH application release.

**Architecture:** Keep acceptance logic outside the runtime plugin. Reuse the real PluginLoader, Express, Socket.IO, Puppeteer, OBS WebSocket, and the plugin's existing telemetry. Acceptance commands operate only on loopback URLs, snapshot every mutable setting, restore in `finally` while outputs remain inactive, persist a fail-closed recovery snapshot if an output starts mid-run, write ignored evidence under `artifacts/webgpu-fireworks-acceptance/`, and refuse OBS mutation while streaming or recording. The plugin remains disabled by default and no script pushes, packages, merges, or publishes.

**Tech Stack:** CommonJS JavaScript, Jest, Express, Socket.IO/Socket.IO Client, Supertest, Puppeteer with installed Chrome/D3D WebGPU, OBS WebSocket 5, WGSL runtime telemetry, PNG/zlib analysis, PowerShell verification.

**Design:** [`../specs/2026-07-19-webgpu-fireworks-release-hardening-design.md`](../specs/2026-07-19-webgpu-fireworks-release-hardening-design.md)

**Companion plans:**

- [`2026-07-19-webgpu-fireworks-backend-hardening.md`](2026-07-19-webgpu-fireworks-backend-hardening.md)
- [`2026-07-19-webgpu-fireworks-gpu-hardening.md`](2026-07-19-webgpu-fireworks-gpu-hardening.md)
- [`2026-07-19-webgpu-fireworks-choreography-ui.md`](2026-07-19-webgpu-fireworks-choreography-ui.md)

## Global execution constraints

- Execute Tasks 1 through 4 only after the focused backend, GPU, choreography, and UI regressions are green.
- Bind temporary HTTP and Socket.IO servers to `127.0.0.1` on an operating-system-assigned port.
- Accept only `http://127.0.0.1`, `http://localhost`, `ws://127.0.0.1`, or `ws://localhost` runtime endpoints.
- Never run the OBS command unless both `GetStreamStatus.outputActive` and `GetRecordStatus.outputActive` are false.
- Snapshot plugin-loader enabled preference, plugin config, source settings, scene-item enabled states, render dimensions, and adaptive-performance settings before live acceptance. Restore all of them in `finally` after ordinary success/failure while OBS outputs remain inactive. If an output becomes active mid-run, the stricter no-live-mutation rule wins: stop all further OBS mutation, restore HTTP-only plugin config and plugin enablement, persist the exact OBS recovery snapshot with `stateRestored: false`, and require the explicit non-live recovery mode described in Task 4 before any report can pass.
- Write reports and captures only below ignored `artifacts/webgpu-fireworks-acceptance/`; do not add generated evidence to Git.
- Preserve the existing LTTH app version `1.3.35` and its historical WebGPU Fireworks 3.1.0 release notes. This plan changes only the plugin's local version/status/cache surfaces to 3.1.1.
- Do not regenerate or stage the already-dirty generated plugin docs, root locales, guide locales, or sitemap.

---

### Task 1: Add a real PluginLoader and network integration gate

**Depends on:** Backend plan B1-B13 and choreography settings contracts.

**Files:**

- Create: `app/test/helpers/webgpu-fireworks-network-harness.js`
- Create: `app/test/webgpu-fireworks-network-e2e.test.js`
- Verify: `app/modules/plugin-loader.js`
- Verify: `app/plugins/webgpu-fireworks/main.js`

**Step 1: Write the failing integration test before the helper exists**

Create `app/test/webgpu-fireworks-network-e2e.test.js` with the real public entry point:

```js
'use strict';

const {
  createWebgpuFireworksNetworkHarness
} = require('./helpers/webgpu-fireworks-network-harness');

describe('WebGPU Fireworks real loader and network contract', () => {
  let harness;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  test('loads, registers, serves, dispatches, and tears down through real boundaries', async () => {
    harness = await createWebgpuFireworksNetworkHarness();
    expect(harness.loader.plugins.get('webgpu-fireworks')?.instance).toBeTruthy();
  });
});
```

Run from `app/`:

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-network-e2e.test.js
```

Expected RED: Jest fails with `Cannot find module './helpers/webgpu-fireworks-network-harness'`.

**Step 2: Implement the isolated real-loader harness**

Implement `createWebgpuFireworksNetworkHarness()` with these exact responsibilities:

```js
async function createWebgpuFireworksNetworkHarness() {
  // fs.mkdtempSync() root
  // fs.cpSync() the real plugin into path.join(tempRoot, 'plugins', 'webgpu-fireworks')
  // set enabled:true only in the copied manifest
  // express.json(), http.createServer(), new Server(httpServer)
  // configPaths.getPluginDataDir()/getUserConfigsDir() both resolve below tempRoot
  // new PluginLoader(tempPluginsDir, app, io, db, logger, configPaths, 'test')
  // loader.loadPlugin(copiedPluginDir)
  // io.on('connection', socket => loader.registerPluginSocketEvents(socket))
  // server.listen(0, '127.0.0.1')
  // socket.io-client connection over websocket
  return {
    baseUrl,
    loader,
    pluginInfo,
    liveRenderer,
    request,
    settings,
    close
  };
}
```

Use a deterministic settings database adapter with `prepare().get()`, `prepare().run()`, `getSetting()`, `getGiftCatalog()`, and `getGift()`. The temporary `configPaths` adapter must implement both `getPluginDataDir()` and `getUserConfigsDir()` beneath `tempRoot`, so neither the loader nor plugin can read or write live user data. Register `io.on('connection', socket => loader.registerPluginSocketEvents(socket))` before connecting the renderer. Construct `request` with `supertest(baseUrl)` or `fetch(baseUrl)` only after the operating-system-assigned port is listening; `supertest(app)` is forbidden because it bypasses the claimed TCP boundary. `close()` must disconnect every client, unload the plugin, close Socket.IO and HTTP, remove the temporary directory, and be idempotent.

Register the live renderer through the public socket contract before marking it ready:

```js
liveRenderer.emit('webgpu-fireworks:register-overlay', {
  rendererProtocol: 3,
  capabilities: ['depth3d-v1', 'boykisser-v1'],
  benchmark: false
});
liveRenderer.emit('webgpu-fireworks:renderer-status', {
  state: 'ready',
  visible: true,
  rendererProtocol: 3,
  capabilities: ['depth3d-v1', 'boykisser-v1'],
  loadedSounds: 20,
  failedSounds: 0
});
```

Install renderer handlers that acknowledge `webgpu-fireworks:trigger`, `webgpu-fireworks:finale`, and `webgpu-fireworks:preview` with their request/effect IDs.

**Step 3: Exercise every required route family and both Flow actions**

Extend the test to assert real status/body/socket behavior for:

- `GET` and `POST /api/webgpu-fireworks/config`;
- `GET /api/webgpu-fireworks/status`;
- `POST /api/webgpu-fireworks/trigger`;
- `POST /api/webgpu-fireworks/finale`;
- `POST /api/webgpu-fireworks/test-follower` with an absent body and with a rejected handler;
- `POST /api/webgpu-fireworks/test-superfan`;
- `GET /api/webgpu-fireworks/shows` and one built-in show preview;
- benchmark start, benchmark renderer registration, preset, trigger acknowledgement, FPS, and restore;
- valid PNG upload plus disguised upload rejection;
- `POST /api/webgpu-fireworks/config/reset`;
- `webgpu_fireworks_trigger.handler()` and `webgpu_fireworks_finale.handler()` from `pluginInfo.api.registeredFlowActions` (the wrapped real PluginAPI execution surface).

The Flow assertions must use the real PluginAPI descriptor:

```js
const flow = id => harness.pluginInfo.api.registeredFlowActions
  .find(action => action.actionName === id);

await expect(flow('webgpu_fireworks_trigger').handler({
  shape: 'star',
  visualStyle: 'premium-hybrid',
  intensity: 1,
  colors: '#ffffff'
})).resolves.toMatchObject({ accepted: true });

await expect(flow('webgpu_fireworks_finale').handler({
  intensity: 1,
  duration: 1000
})).resolves.toMatchObject({ accepted: true });
```

Keep real timers, but synchronize on creation rather than racing the TCP response. Wrap the loaded instance's real `scheduleFollowerTimer()` with a test spy that delegates unchanged and resolves a promise when the first positive-delay timer is registered. Configure two follower rockets and a 300 ms animation delay, start the real HTTP request without awaiting its response, await that registration promise, then unload immediately. After unload, await the already-started HTTP response, snapshot renderer/socket emission counts, assert `followerTimers.size === 0`, wait one bounded 400 ms interval, and require the counts to remain unchanged plus HTTP 404 from the real TCP route. The zero-delay rocket may have fired before unload and is therefore part of the snapshot, never a false failure. Do not install Jest fake timers in this real-network suite; the backend unit regression owns deterministic timer advancement. Close the harness and assert Jest exits naturally under `--detectOpenHandles`.

**Step 4: Run the green gate**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-network-e2e.test.js test/plugin-flow-action-descriptor.test.js
```

Expected GREEN: the copied real plugin loads, all named route/Flow/socket families pass, unload makes routes unreachable, and no HTTP/socket/timer handle remains.

**Step 5: Commit**

```powershell
git add app/test/helpers/webgpu-fireworks-network-harness.js app/test/webgpu-fireworks-network-e2e.test.js
git commit -m "test(webgpu-fireworks): cover real loader network contracts"
```

---

### Task 2: Build pure acceptance contracts and safety parsers

**Depends on:** Task 1.

**Files:**

- Create: `scripts/lib/webgpu-fireworks-acceptance.js`
- Create: `app/test/webgpu-fireworks-acceptance-scripts.test.js`
- Modify: `package.json`

**Step 1: Write the failing pure-contract tests**

Create `app/test/webgpu-fireworks-acceptance-scripts.test.js`:

```js
'use strict';

const {
  buildShowAcceptanceMatrix,
  parseChromeArgs,
  parseObsArgs,
  validateAcceptanceReport
} = require('../../scripts/lib/webgpu-fireworks-acceptance');

test('builds the exact 54-case real show matrix', () => {
  const matrix = buildShowAcceptanceMatrix();
  expect(matrix).toHaveLength(54);
  expect(new Set(matrix.map(item => item.id)).size).toBe(54);
});

test('requires loopback endpoints and explicit OBS non-live consent', () => {
  expect(() => parseChromeArgs(['--base-url', 'https://example.com'])).toThrow(/loopback/i);
  expect(() => parseObsArgs(['--base-url', 'http://127.0.0.1:3000'])).toThrow(/confirm-non-live/i);
});

test('rejects incomplete or unrestored reports', () => {
  expect(validateAcceptanceReport({ schemaVersion: 1 }).valid).toBe(false);
  expect(validateAcceptanceReport({
    schemaVersion: 1,
    stateRestored: false,
    cases: []
  }).errors).toContain('runtime-state-not-restored');
});
```

Run:

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-acceptance-scripts.test.js
```

Expected RED: missing `scripts/lib/webgpu-fireworks-acceptance.js`.

**Step 2: Implement immutable matrices and safe argument parsing**

Export:

```js
const SHOW_STYLES = Object.freeze([
  'classic-crescendo',
  'symmetric-salute',
  'sky-ballet',
  'thunder-finale',
  'nishiki-kamuro',
  'aurora-cathedral',
  'royal-brocade',
  'phoenix-ascension',
  'furry-celebration',
]);
const SHOW_LENGTHS = Object.freeze(['short', 'medium', 'long']);
const ORIENTATIONS = Object.freeze(['landscape', 'portrait']);

function buildShowAcceptanceMatrix() {}
function parseChromeArgs(argv) {}
function parseObsArgs(argv) {}
function validateAcceptanceReport(report, options = {}) {}
function percentile(values, fraction) {}
function createArtifactDirectory(root, runId) {}
function decodePngRgba(buffer) {}
function inspectTransparentGuardBand(image, paddingPx) {}
function inspectSemanticColors(image, palette) {}
```

`buildShowAcceptanceMatrix()` must produce one stable ID per style/length/orientation. `parseObsArgs()` has four mutually exclusive modes:

- capture mode (no report-mode flag) requires loopback `--base-url`, loopback `--obs-url`, and `--confirm-non-live`, and defaults `--source-name` to `fireworks`;
- approval mode requires `--approve-report`, a non-empty `--reviewer`, and `--boykisser-approved`, rejects capture/recovery/preflight arguments, and never constructs an OBS client;
- recovery mode requires `--restore-report`, loopback `--obs-url`, and `--confirm-non-live`, rejects approval/capture/preflight/base-URL arguments, requires the failed report to prove `httpStateRestored: true`, and may only restore the immutable OBS source/scene snapshot recorded there;
- read-only preflight mode requires `--check-non-live` plus loopback `--obs-url`, rejects every capture/approval/recovery argument, calls only stream/record status methods, and exits nonzero if either output is active.

`parseChromeArgs()` always requires an explicit loopback `--base-url`. The default output root is `artifacts/webgpu-fireworks-acceptance`.

`decodePngRgba()` must support 8-bit PNG color types 2 and 6, reverse filters 0-4 with zlib, and return `{ width, height, data }` in RGBA order. `inspectTransparentGuardBand()` checks top/left/right and the non-exempt bottom region for nonzero alpha. `inspectSemanticColors()` consumes the canonical HEAD/FACE/PINK palette, reports white-fur, dark-ink, and pink-accent pixel counts using explicit RGB tolerances, and can require pink hits in the geometry-derived inner-ear, tongue, and bilateral-blush windows without inventing a second pink role.

`validateAcceptanceReport()` requires:

- `schemaVersion: 1`;
- exact expected case IDs for the selected gate;
- zero console, page, renderer, device, WGSL, socket, and unexpected audio errors;
- `stateRestored === true`;
- no missing captures;
- no shape-envelope or guard-band failures;
- no dropped required commands;
- manual Boykisser review `approved` when `options.requireManualVisualReview === true`.

**Step 3: Add stable package entry points**

Add to root `package.json`:

```json
"test:webgpu-fireworks:chrome": "node scripts/webgpu-fireworks-chrome-acceptance.js",
"test:webgpu-fireworks:obs": "node scripts/webgpu-fireworks-obs-acceptance.js"
```

**Step 4: Run green and syntax checks**

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-acceptance-scripts.test.js
cd ..
node --check scripts/lib/webgpu-fireworks-acceptance.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package json ok')"
```

Expected GREEN: 54 unique cases, unsafe URLs/OBS invocations reject, PNG guard/color fixtures pass, and malformed reports return exact reason codes.

**Step 5: Commit**

```powershell
git add scripts/lib/webgpu-fireworks-acceptance.js app/test/webgpu-fireworks-acceptance-scripts.test.js package.json
git commit -m "test(webgpu-fireworks): define guarded acceptance contracts"
```

---

### Task 3: Implement installed-Chrome WebGPU acceptance

**Depends on:** Task 2 and all GPU/choreography tasks.

**Files:**

- Create: `scripts/webgpu-fireworks-chrome-acceptance.js`
- Modify: `app/test/webgpu-fireworks-acceptance-scripts.test.js`

**Step 1: Add a failing CLI contract**

Extend the test:

```js
const chromeAcceptance = require('../../scripts/webgpu-fireworks-chrome-acceptance');

test('Chrome acceptance exports an injectable runner and never autoruns on require', () => {
  expect(chromeAcceptance).toEqual(expect.objectContaining({
    runGpuHardwarePrerequisite: expect.any(Function),
    runChromeAcceptance: expect.any(Function),
    main: expect.any(Function)
  }));
});
```

Add injected child-process tests for `runGpuHardwarePrerequisite()` that require exactly one terminal `PASS all <JSON>` line and require its parsed top level to be exactly `{ hardware, cases }`. Require the six exact case keys `atlas`, `capacity`, `recovery`, `admission-envelope`, `telemetry-adaptive`, and `boykisser`; require `hardware` to contain the resolved installed-Chrome path, normalized `GPUAdapter.info`, selected CDP GPU device/feature status, `backend: 'd3d11' | 'd3d12'`, `fallback: false`, and `verdict: 'hardware-d3d'`. Reject a nonzero exit, malformed/missing terminal payload, extra/missing case, any skipped case, missing hardware evidence, non-D3D backend, fallback flag, verdict mismatch, or software-token evidence. Earlier adapter diagnostic lines do not satisfy the gate. The passing `{ hardware, cases }` object must be embedded unchanged under `chrome-report.json.gpuPrerequisite`.

Run:

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-acceptance-scripts.test.js
```

Expected RED: missing `scripts/webgpu-fireworks-chrome-acceptance.js`.

**Step 2: Implement guarded browser startup and state restoration**

The script must:

- load Puppeteer from `app/node_modules`;
- require an explicit installed-Chrome path through `--chrome-path` or `LTTH_CHROME_PATH`, verify that it exists, and fail closed when neither is supplied;
- never fall back to Puppeteer's bundled Chromium, SwiftShader, llvmpipe, a software adapter, or any adapter reported as fallback;
- launch headless Chrome with WebGPU enabled and collect `console`, `pageerror`, request failure, and crash events;
- navigate to `/webgpu-fireworks/overlay?acceptance=1&debug=1`;
- wait until `/api/webgpu-fireworks/status` reports one fresh registered ready renderer with protocol 3 and both required capabilities;
- record adapter information and require a hardware D3D WebGPU device before accepting any scenario;
- spawn `process.execPath app/test/webgpu-fireworks-chrome-stress.manual.js all` with the same explicit Chrome path, stream its output, parse the terminal `PASS all <JSON>` payload, and preserve that payload in the final report before starting served-overlay scenarios;
- GET and deep-clone the plugin config before mutation;
- restore the exact config with `POST /api/webgpu-fireworks/config` in `finally`;
- close every page/browser even when a scenario fails;
- write `chrome-report.json` plus screenshots to the selected artifact directory.

Keep all private runtime operations inside `page.evaluate()` through the existing top-level `engine` binding; do not add a production debug endpoint or global mutation API.

**Step 3: Compose the GPU hardware gate with served-overlay scenarios**

Treat `app/test/webgpu-fireworks-chrome-stress.manual.js all` from the GPU plan as the authoritative installed-Chrome gate for G1-G7 plus C6/C7. The release runner itself must spawn it, parse its terminal JSON, and preserve the result under `gpuPrerequisite`; it must not reimplement its deterministic atlas, stale-readback, exhaustive lifetime-envelope, telemetry/adaptive, or semantic-glyph cases.

Then run only these served-overlay integration scenarios in order and record before/after telemetry:

1. Assert `navigator.gpu`, initialized renderer, all WGSL pipelines, non-null adapter/device, protocol 3, `depth3d-v1`, and `boykisser-v1`.
2. Save `maxTotalParticles: 512` through the real HTTP config route, wait for the renderer/status handshake to expose 512, render, then repeat at 16,384 and require matching capacity telemetry plus zero device errors.
3. Start one deterministic V2 finale through the real API, resize landscape to portrait before a future cue, and assert the cue uses the new viewport while socket telemetry completes without a missing required command.
4. Exercise settings extreme-value round trips, keyboard activation, and designer keyboard movement through the served settings/designer pages with zero console warnings/errors.
5. Import the GPU-owned `ROCKET_VARIANTS`, assert it equals exactly `['standard', 'avatar-head', 'decal']`, and capture representative star, ring, all three rocket variants, Furry hero, and Boykisser frames through the served overlay in both orientations. Use their alpha guard bands as an integration smoke check; the GPU runner remains authoritative for every ID, rocket variant, depth, resolution, and full visible lifetime.

Use deterministic seeds and wait on renderer/finale telemetry, never fixed unbounded sleeps.

**Step 4: Run unit and real Chrome gates**

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-acceptance-scripts.test.js
$env:LTTH_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
cd ..
node --check scripts/webgpu-fireworks-chrome-acceptance.js
npm run test:webgpu-fireworks:chrome -- --chrome-path "$env:LTTH_CHROME_PATH" --base-url http://127.0.0.1:3000 --output-dir artifacts/webgpu-fireworks-acceptance/chrome
```

Expected GREEN: the GPU runner reports all six cases (`atlas`, `capacity`, `recovery`, `admission-envelope`, `telemetry-adaptive`, and `boykisser`) passed with no skip on a hardware adapter; then `chrome-report.json` validates the served protocol/config/socket/UI/resize integration with no browser, WGSL, or device error.

**Step 5: Commit the reusable runner, not its artifacts**

```powershell
git add scripts/webgpu-fireworks-chrome-acceptance.js app/test/webgpu-fireworks-acceptance-scripts.test.js
git commit -m "test(webgpu-fireworks): add chrome webgpu acceptance"
```

---

### Task 4: Implement exact-source non-live OBS acceptance

**Depends on:** Tasks 2-3 and all implementation plans.

**Files:**

- Create: `scripts/webgpu-fireworks-obs-acceptance.js`
- Modify: `app/test/webgpu-fireworks-acceptance-scripts.test.js`
- Reuse: `scripts/lib/obs-docs-capture-session.js`
- Reuse: `scripts/capture-obs-docs-screenshot.js`

**Step 1: Add failing safety and restoration tests**

Add injected fake-OBS tests:

```js
const {
  approveVisualReport,
  requireInactiveObsOutputs,
  runObsAcceptance
} = require('../../scripts/webgpu-fireworks-obs-acceptance');

await expect(requireInactiveObsOutputs({
  call: jest.fn(async type => ({ outputActive: type === 'GetStreamStatus' }))
})).rejects.toThrow(/stream.*active/i);

expect(runObsAcceptance).toEqual(expect.any(Function));
expect(approveVisualReport).toEqual(expect.any(Function));
```

Add a failure-injection test whose mocked matrix throws after changing input dimensions; assert `SetInputSettings` restores the exact original settings and the report records `stateRestored: true`.

Add parser/approval-mode tests that prove approval is mutually exclusive with capture/recovery, works without base/OBS URL or non-live consent, and rejects a missing screenshot, hash mismatch, empty reviewer, absent `--boykisser-approved`, or any report whose automated checks are not green. A passing fixture must prove `approveVisualReport()` reads and hashes all six referenced PNGs, records reviewer/timestamp/the exact approval statement, invokes final validation, and never constructs or calls the injected OBS client.

Add an output-activation failure test: after one source mutation, emit an active stream/record state, assert no further OBS method that mutates source/scene state is called, and assert no further HTTP config/finale/trigger mutation occurs except the one explicitly allowed plugin-config restore. Require that restore to finish while the plugin route is still loaded, then write `httpStateRestored: true`, `obsStateRestored: false`, aggregate `stateRestored: false`, code `OBS_OUTPUT_BECAME_ACTIVE`, and the original immutable OBS snapshot. Add a recovery-mode test which rejects any report lacking `httpStateRestored: true`, then first rejects while either output is active, and with both inactive applies only the stored OBS snapshot, verifies source settings and scene-item states by re-reading them, marks both OBS and aggregate restoration true, and performs no HTTP call, capture, finale trigger, or visual approval. Add a preflight-mode test proving it calls only `GetStreamStatus` and `GetRecordStatus` and never constructs an HTTP client.

Run:

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-acceptance-scripts.test.js
```

Expected RED: missing `scripts/webgpu-fireworks-obs-acceptance.js`.

**Step 2: Implement OBS safety, exact source validation, and snapshot/restore**

The runner must:

- connect through `app/node_modules/obs-websocket-js`;
- subscribe to stream/record state changes and check both outputs before reading the target source, before each source mutation, before captures, and before ordinary restore;
- load input settings for the exact source name `fireworks` by default;
- require the source URL origin to equal `--base-url` and path to equal `/webgpu-fireworks/overlay` or `/plugins/webgpu-fireworks/overlay.html`;
- snapshot complete input settings and every scene-item enabled state referencing the source;
- snapshot the plugin config through HTTP;
- refresh the browser source only after the snapshot;
- restore source settings, scene-item states, and plugin config in `finally` while outputs remain inactive;
- verify restored values by re-reading OBS and HTTP state;
- never change the current program/preview scene or start an output.

If an output becomes active after the matrix starts, atomically set an abort flag and make every subsequent OBS mutation/capture and HTTP config/finale/trigger request reject; the sole exception is one idempotent HTTP plugin-config restore from the immutable snapshot while the route is still loaded. Do not restore OBS source or scene state into a live output. Require that HTTP restore to verify successfully, write the immutable OBS recovery snapshot with `httpStateRestored: true`, `obsStateRestored: false`, and `OBS_OUTPUT_BECAME_ACTIVE`, exit nonzero, and block report approval. After the operator stops all outputs, the only permitted repair path is `--restore-report <failed-report> --obs-url <loopback> --confirm-non-live`; it restores and verifies only the recorded OBS source/scene snapshot without needing the now-possibly-disabled plugin route, running acceptance, or changing scenes.

Use OBS `GetSourceScreenshot` for the named source. Persist PNGs and `obs-report.json` only inside the selected artifact directory.

**Step 3: Run the 54-case show matrix and audio checks**

For every matrix entry:

- set source dimensions to 1920x1080 or 1080x1920 and matching normalized plugin orientation;
- trigger the finale through `POST /api/webgpu-fireworks/finale` with deterministic seed, intensity 5, `testRequest: true`, and audio enabled;
- wait for telemetry `finaleId`, phase transitions, and final idle state;
- capture opening, highlight, and finale frames from actual planned cue times;
- inspect transparent guard bands, alpha bounds, collapsed-target evidence, renderer errors, active/dropped particles, command-admission counters, and FPS samples;
- verify all played launch/bang timeline events have absolute `driftMs <= 50`, zero unexpected missed events, and zero audio evictions;
- sample each declared rest window after all preceding activity tails and require zero particle/audio activity.

Before the matrix, require `loadedSounds === 20` and `failedSounds === 0`. Separately run 20 deterministic single rockets with audio enabled and 20 with audio disabled; enabled events need matching visual/audio records, disabled events must produce no audio records.

**Step 4: Run explicit visual and 4K stress gates**

- Import the GPU-owned `ROCKET_VARIANTS`, assert it equals exactly `['standard', 'avatar-head', 'decal']`, and capture every listed rocket variant plus star, ring, and all other registered shapes at the upper envelope bound in both orientations. Decal remains a `kind: 1` rocket variant, never a shape-registry surrogate.
- For deterministic `burst`, `star`, and `ring` single-trigger requests at the upper bound and maximum supported intensity, begin source screenshots before admission and sample at no more than 50 ms intervals until renderer telemetry returns to idle after the complete trail/glow/bloom tail. Analyze every sampled frame, retain first/peak/last plus every failing PNG, record maximum sampling gap, and require the applicable top/side guard bands throughout the visible ascent and all four guard bands after the rocket enters the viewport. This is the exact-source lifecycle gate for the reported standard rocket, star, and ring clipping.
- Run Furry short/medium/long in both orientations and capture the hero plus the 600/1,000/1,500 ms quiet windows.
- Require Boykisser semantic colors and complete alpha bounds automatically.
- Write `manualReview.boykisser.status = "pending"`, the six Furry hero image paths, and their SHA-256 hashes into the report.
- Run a long 3840x2160 stress show with adaptive performance enabled; after warm-up require p95 FPS at or above normalized `minFps`, render scale within config bounds, zero required-command drops, and no renderer/device error.
- Repeat with adaptive performance disabled; require render scale remains 1 and pressure is reported without quality mutation.

After automated completion, inspect all six hero images. If they pass, run the explicit approval mode shown below. It must not connect to or mutate OBS; it re-reads every PNG, verifies its stored hash, records `manualReview.boykisser.status = "approved"`, reviewer, timestamp, and the statement `unmistakably Boykisser/Silly Cat, not wolf`, then calls `validateAcceptanceReport(report, { requireManualVisualReview: true })`. Validation must fail while review is pending.

**Step 5: Run unit and guarded real OBS gates**

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-acceptance-scripts.test.js
cd ..
node --check scripts/webgpu-fireworks-obs-acceptance.js
npm run test:webgpu-fireworks:obs -- --base-url http://127.0.0.1:3000 --obs-url ws://127.0.0.1:4455 --source-name fireworks --confirm-non-live --output-dir artifacts/webgpu-fireworks-acceptance/obs
node scripts/webgpu-fireworks-obs-acceptance.js --approve-report artifacts/webgpu-fireworks-acceptance/obs/obs-report.json --reviewer "Codex visual review" --boykisser-approved
```

Expected GREEN before manual review: all automated checks pass, OBS and plugin state are verified restored, and report status is `manual-review-required`. Expected final GREEN: the reviewed report validates with all 54 case IDs and no unresolved visual/audio/performance failure.

**Step 6: Commit the runner, not evidence**

```powershell
git add scripts/webgpu-fireworks-obs-acceptance.js app/test/webgpu-fireworks-acceptance-scripts.test.js
git commit -m "test(webgpu-fireworks): add guarded obs acceptance"
```

---

### Task 5: Align stable opt-in plugin 3.1.1 release surfaces

**Depends on:** Tasks 1-4 and every implementation task from the companion plans.

**Files:**

- Modify: `app/plugins/webgpu-fireworks/plugin.json`
- Modify: `app/plugins/webgpu-fireworks/README.md`
- Modify: `app/plugins/webgpu-fireworks/overlay.html`
- Modify: `app/plugins/webgpu-fireworks/ui/settings.html`
- Modify: `app/plugins/webgpu-fireworks/ui/designer.html`
- Modify: `app/test/webgpu-fireworks-release-alignment.test.js`
- Modify: `app/test/webgpu-fireworks-3d-release.test.js`
- Modify: `app/test/webgpu-fireworks-native.test.js`

**Step 1: Change release assertions first and observe the exact RED**

Set the plugin expectations to:

```js
const APP_VERSION = '1.3.35';
const HISTORICAL_APP_PLUGIN_VERSION = '3.1.0';
const PLUGIN_VERSION = '3.1.1';

expect(manifest).toMatchObject({
  version: PLUGIN_VERSION,
  devStatus: 'stable',
  enabled: false
});
```

Keep application release metadata assertions tied to `HISTORICAL_APP_PLUGIN_VERSION`; do not rewrite `CURRENT_RELEASE.json`, `version.json`, app/root package versions, changelogs, downloads, website, or root locales for this plugin-only hardening branch.

Update expected overlay asset order to include the GPU plan's browser modules:

```js
[
  '/plugins/webgpu-fireworks/gpu/spawn-command-policy.js',
  '/plugins/webgpu-fireworks/gpu/boykisser-geometry.js',
  '/plugins/webgpu-fireworks/gpu/visible-envelope.js',
  '/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js',
  '/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js',
  '/plugins/webgpu-fireworks/gpu/engine.js'
]
```

Keep the choreography plan's settings modules in the exact active settings asset list as well:

```js
[
  '/plugins/webgpu-fireworks/ui/show-style-options.js',
  '/plugins/webgpu-fireworks/ui/settings-contract.js',
  '/plugins/webgpu-fireworks/ui/shape-controls.js',
  '/plugins/webgpu-fireworks/ui/settings.js'
]
```

Both new settings modules must load before `settings.js`; Task 5 changes their active cache keys to 3.1.1 together with every other plugin asset.

Run:

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-release-alignment.test.js test/webgpu-fireworks-3d-release.test.js test/webgpu-fireworks-native.test.js
```

Expected RED: manifest is 3.1.0/`working-beta`, active asset URLs contain 3.1.0, and README lacks the final 3.1.1 stable opt-in contract.

**Step 2: Update only plugin release surfaces**

Set `plugin.json`:

```json
{
  "version": "3.1.1",
  "enabled": false,
  "devStatus": "stable"
}
```

Verify that the GPU tasks already load `boykisser-geometry.js` and `visible-envelope.js` before `webgpu-particle-engine.js`; do not add a second script tag or take ownership of those modules here. Change every active plugin CSS/JS cache key in overlay/settings/designer to `v=3.1.1` while retaining meaningful suffixes where present.

Update README with:

- explicit plugin version 3.1.1 and stable-but-disabled-by-default status;
- custom Loggableim OBS WebGPU requirement;
- all six legacy shapes including `paws`;
- all nine built-in show styles;
- configuration bounds and relational FPS behavior;
- config/status/trigger/follower/finale/random/gift/upload/benchmark/reset/show/preview route groups;
- renderer registration/status/FPS/finale/preview socket contracts;
- both Flow action IDs and structured return behavior;
- upload extension/MIME/signature rules;
- Furry Boykisser attribution and new semantic character contract;
- complete visible-envelope behavior and refresh guidance.

**Step 3: Run release and JSON gates**

```powershell
cd app
npm test -- --runInBand test/webgpu-fireworks-release-alignment.test.js test/webgpu-fireworks-3d-release.test.js test/webgpu-fireworks-native.test.js
node -e "JSON.parse(require('fs').readFileSync('plugins/webgpu-fireworks/plugin.json','utf8')); console.log('manifest ok')"
```

Expected GREEN: plugin version/status/default state and every active cache key agree on 3.1.1; app release remains 1.3.35 with historical 3.1.0 notes untouched.

**Step 4: Commit**

```powershell
git add app/plugins/webgpu-fireworks/plugin.json app/plugins/webgpu-fireworks/README.md app/plugins/webgpu-fireworks/overlay.html app/plugins/webgpu-fireworks/ui/settings.html app/plugins/webgpu-fireworks/ui/designer.html app/test/webgpu-fireworks-release-alignment.test.js app/test/webgpu-fireworks-3d-release.test.js app/test/webgpu-fireworks-native.test.js
git commit -m "chore(webgpu-fireworks): prepare stable opt-in 3.1.1"
```

---

### Task 6: Run the complete completion gate and branch audit

**Depends on:** Every prior task in all four plans.

**Files:** No production changes. Acceptance evidence remains ignored under `artifacts/`.

**Step 1: Run every focused WebGPU Fireworks and integration suite naturally**

From `app/`, enumerate the tracked focused suites so newly added files cannot be omitted:

```powershell
$webgpuSuites = Get-ChildItem -LiteralPath test -Filter 'webgpu-fireworks*.test.js' | Sort-Object Name | ForEach-Object { "test/$($_.Name)" }
npm test -- --runInBand --detectOpenHandles $webgpuSuites test/goals-fireworks-finale.test.js test/plugin-flow-action-descriptor.test.js
```

Expected: all focused tests pass, the process exits without `--forceExit`, and Jest reports no open-handle warning.

**Step 2: Run syntax, schema, CSS, lint, and dependency gates**

```powershell
$jsFiles = @(
  Get-ChildItem -LiteralPath plugins/webgpu-fireworks -Recurse -Filter '*.js' -File
  Get-Item -LiteralPath plugins/goals/main.js
  Get-Item -LiteralPath modules/plugin-loader.js
)
foreach ($file in $jsFiles) { node --check $file.FullName; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
node -e "const fs=require('fs'); for(const p of ['plugins/webgpu-fireworks/plugin.json',...fs.readdirSync('plugins/webgpu-fireworks/locales').filter(x=>x.endsWith('.json')).map(x=>'plugins/webgpu-fireworks/locales/'+x)]) JSON.parse(fs.readFileSync(p,'utf8')); console.log('plugin json ok')"
npm run build:css
npm run lint
npm audit --omit=dev
```

Expected: syntax, JSON, and CSS gates pass. Compare broad lint and production-audit output with the exact starting baseline recorded before implementation: no new finding is allowed, no touched WebGPU/Goals/PluginLoader file may fail lint, and any dependency vulnerability introduced or worsened by this work blocks completion.

**Step 3: Run the deterministic planner/runtime matrix**

```powershell
npm test -- --runInBand test/webgpu-fireworks-choreography-matrix.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-finale-v2-runtime.test.js test/webgpu-fireworks-visible-envelope.test.js
```

Expected: all 10,368 generated plan cases pass, every declared rest is free of visual/audio intervals, spatial separation is at least 0.06, and all full envelopes remain visible.

**Step 4: Run broad application Jest and compare the recorded baseline**

```powershell
npm test -- --runInBand
```

Expected: no failure beyond the previously recorded unrelated guide/workflow and AnimazingPal baseline. Any new failure, timeout, or open handle blocks completion.

**Step 5: Run real Chrome and OBS acceptance from the authoritative worktree server**

Perform a controlled runtime restart after all code/tests are complete; a same-path process started before the final changes is not acceptable evidence. First prove both OBS outputs inactive through the runner's read-only preflight. Resolve the exact worktree path, inspect every owner of port 3000, and stop an existing owner only if its command line resolves to this exact worktree's `app/server.js`; abort rather than touching any other process. Record `$runtimeStartFloor = Get-Date`, start `node server.js` from this worktree's `app/` in a hidden process with stdout/stderr captured under the ignored acceptance artifact directory, and poll `/api/plugins` for at most 30 seconds. Then require exactly one port owner, the same PID returned by `Start-Process`, a `CreationDate` at or after `$runtimeStartFloor`, and the exact worktree command line. Snapshot both mutually exclusive `webgpu-fireworks` and `fireworks` preferences before enabling WebGPU Fireworks, and restore/verify both in an outer `finally` even if enablement, status, Chrome, OBS, or approval fails. If no runtime existed initially, stop the acceptance server afterward; otherwise leave the freshly restarted authoritative runtime running. Only then require a live plugin status/details response identifying version 3.1.1 before Chrome or OBS acceptance:

```powershell
$worktree = (Resolve-Path '..').Path
$artifactDir = Join-Path $worktree 'artifacts\webgpu-fireworks-acceptance\runtime'
$serverEntry = Join-Path $worktree 'app\server.js'
node ..\scripts\webgpu-fireworks-obs-acceptance.js --check-non-live --obs-url ws://127.0.0.1:4455
if ($LASTEXITCODE -ne 0) { throw "OBS must be fully inactive before runtime restart" }
$existingOwners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique)
$hadRuntime = $existingOwners.Count -gt 0
foreach ($owner in $existingOwners) {
  $existing = Get-CimInstance Win32_Process -Filter "ProcessId = $owner"
  if ($existing.CommandLine -notmatch [regex]::Escape($serverEntry)) { throw "Refusing to stop unrelated port-3000 owner $owner" }
  Stop-Process -Id $owner
  Wait-Process -Id $owner -Timeout 15 -ErrorAction SilentlyContinue
  if (Get-Process -Id $owner -ErrorAction SilentlyContinue) { throw "Authoritative old runtime did not stop" }
}
$runtimeStartFloor = Get-Date
New-Item -ItemType Directory -Force -Path $artifactDir | Out-Null
$server = Start-Process -FilePath (Get-Command node).Source -ArgumentList $serverEntry `
  -WorkingDirectory (Join-Path $worktree 'app') -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $artifactDir 'server.stdout.log') `
  -RedirectStandardError (Join-Path $artifactDir 'server.stderr.log')
$preferenceSnapshot = @{}

function Get-PluginCatalogEntry([string]$id) {
  $catalog = Invoke-RestMethod http://127.0.0.1:3000/api/plugins
  $entry = @($catalog.plugins | Where-Object id -eq $id)
  if ($entry.Count -ne 1) { throw "Expected exactly one plugin catalog entry for $id" }
  return $entry[0]
}

function Set-PluginPreference([string]$id, [bool]$enabled) {
  $current = Get-PluginCatalogEntry $id
  if (($current.enabled -eq $true) -eq $enabled) { return }
  $action = if ($enabled) { 'enable' } else { 'disable' }
  Invoke-RestMethod -Method Post "http://127.0.0.1:3000/api/plugins/$id/$action" | Out-Null
}

try {
  $deadline = (Get-Date).AddSeconds(30)
  $pluginCatalog = $null
  do {
    if ($server.HasExited) { throw "Fresh runtime exited during startup" }
    try { $pluginCatalog = Invoke-RestMethod -TimeoutSec 2 http://127.0.0.1:3000/api/plugins } catch { Start-Sleep -Milliseconds 250 }
  } until ($pluginCatalog -or (Get-Date) -ge $deadline)
  if (-not $pluginCatalog) { throw "Fresh runtime did not become healthy within 30 seconds" }

  $owners = @(Get-NetTCPConnection -State Listen -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($owners.Count -ne 1 -or $owners[0] -ne $server.Id) { throw "Fresh authoritative runtime does not uniquely own port 3000" }
  $serverProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($server.Id)"
  if ($serverProcess.CreationDate -lt $runtimeStartFloor -or $serverProcess.CommandLine -notmatch [regex]::Escape($serverEntry)) { throw "Runtime freshness/path proof failed" }

  foreach ($id in @('webgpu-fireworks', 'fireworks')) {
    $entry = @($pluginCatalog.plugins | Where-Object id -eq $id)
    if ($entry.Count -eq 1) { $preferenceSnapshot[$id] = $entry[0].enabled -eq $true }
  }
  $fireworksEntry = Get-PluginCatalogEntry 'webgpu-fireworks'
  if ($fireworksEntry.version -ne '3.1.1') { throw "Plugin catalog is not serving WebGPU Fireworks 3.1.1" }
  Set-PluginPreference 'webgpu-fireworks' $true

  $pluginStatus = Invoke-RestMethod http://127.0.0.1:3000/api/webgpu-fireworks/status
  $pluginInfo = Invoke-RestMethod http://127.0.0.1:3000/api/plugins/webgpu-fireworks
  if ($pluginStatus.success -ne $true -or $pluginInfo.plugin.version -ne '3.1.1') { throw "Fresh runtime is not serving WebGPU Fireworks 3.1.1" }
  $serverProcess | Select-Object ProcessId,CreationDate,CommandLine

  $env:LTTH_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  Set-Location $worktree
  npm run test:webgpu-fireworks:chrome -- --chrome-path "$env:LTTH_CHROME_PATH" --base-url http://127.0.0.1:3000 --output-dir artifacts/webgpu-fireworks-acceptance/chrome
  if ($LASTEXITCODE -ne 0) { throw "Chrome acceptance failed" }
  npm run test:webgpu-fireworks:obs -- --base-url http://127.0.0.1:3000 --obs-url ws://127.0.0.1:4455 --source-name fireworks --confirm-non-live --output-dir artifacts/webgpu-fireworks-acceptance/obs
  if ($LASTEXITCODE -ne 0) { throw "OBS acceptance failed" }
  node scripts/webgpu-fireworks-obs-acceptance.js --approve-report artifacts/webgpu-fireworks-acceptance/obs/obs-report.json --reviewer "Codex visual review" --boykisser-approved
  if ($LASTEXITCODE -ne 0) { throw "Boykisser visual approval failed" }
} finally {
  try {
    foreach ($id in @('webgpu-fireworks', 'fireworks')) {
      if ($preferenceSnapshot.ContainsKey($id) -and -not $preferenceSnapshot[$id]) { Set-PluginPreference $id $false }
    }
    foreach ($id in @('fireworks', 'webgpu-fireworks')) {
      if ($preferenceSnapshot.ContainsKey($id) -and $preferenceSnapshot[$id]) { Set-PluginPreference $id $true }
    }
    foreach ($id in $preferenceSnapshot.Keys) {
      if (((Get-PluginCatalogEntry $id).enabled -eq $true) -ne $preferenceSnapshot[$id]) { throw "Plugin preference restore failed for $id" }
    }
  } finally {
    $server.Refresh()
    if (-not $hadRuntime -and -not $server.HasExited) {
      Stop-Process -InputObject $server
      if (-not $server.WaitForExit(15000)) { throw "Acceptance runtime did not stop" }
    }
  }
}
```

Inspect the six report-linked Boykisser hero images before running the approval command. Expected: the hardware-only GPU `all` report has all six cases green, the served Chrome report validates, the hash-bound OBS report is manually approved, all 54 show cases and p95/fidelity/audio/full-lifetime guard-band gates are green, and runtime/OBS state restoration is verified.

**Step 6: Audit the exact final diff and repository state**

```powershell
git diff --check HEAD
git status --short
git diff --name-only 1184b36965040a4182eab988da7fbdb8d7613558..HEAD
git log --oneline --decorate 1184b36965040a4182eab988da7fbdb8d7613558..HEAD
```

Confirm:

- every B1-B13, G1-G7, and C1-C7 row has a named red-to-green regression;
- no generated docs/root locale/sitemap file is staged or committed;
- no runtime database, OBS config, user data, log, or acceptance artifact is tracked;
- manifest/README/cache/test surfaces all say plugin 3.1.1 stable opt-in;
- no unresolved correctness, lifecycle, safety, accessibility, clipping, character-fidelity, performance, or review finding remains.

Do not create a completion commit for unchanged verification output. Do not push, merge, package, or publish unless the user separately requests it.
