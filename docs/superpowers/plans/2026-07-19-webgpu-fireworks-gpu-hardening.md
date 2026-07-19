# WebGPU Fireworks GPU Hardening Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan one task at a time. Preserve unrelated worktree changes, run every RED command before its production edit, and do not combine commits.

**Goal:** Make the WebGPU Fireworks renderer safe under long-running image use, live capacity changes, repeated device loss, asynchronous readback, deferred admission, resize, and adaptive load while preserving a recognizable semantic Boykisser and keeping every rendered envelope visible.

**Architecture:** Keep the existing renderer and protocol. Add two small deterministic CommonJS/browser modules: one owns semantic Boykisser geometry and WGSL generation, and one owns conservative visible-envelope profiles plus correlated admission fitting. Resource replacement is atomic and generation-scoped; deferred commands retain normalized intent and are materialized only against the current generation, owner, time, and viewport. Browser-only validation uses an isolated local Chrome harness and never touches the live LTTH/OBS surface.

**Tech Stack:** CommonJS JavaScript, browser globals, WGSL, WebGPU, Jest 29, Socket.IO test doubles, and installed Chrome/D3D WebGPU.

**Approved design:** [WebGPU Fireworks release-hardening design](../specs/2026-07-19-webgpu-fireworks-release-hardening-design.md), especially defect rows G1-G7 and amendments C6-C7.

## Scope, invariants, and dependency order

- This plan owns G1-G7 and the GPU-side foundations of C6-C7 only. The choreography planner, built-in-show authoring, settings UI, designer UI, accessibility work, and the 54-combination live OBS acceptance remain in their own plan.
- Do not introduce a second renderer, a vertex/particle clamp, per-shape emergency clipping, or a production dependency.
- Slot `0` remains the non-image fallback. External atlas slots are reusable and bounded.
- An acknowledged particle capacity must be the capacity of the buffers and bind groups used by the next accepted frame.
- Every asynchronous readback, queued command, and recovery action is tied to a renderer resource generation.
- A command may render only if its generation and owner are current, its visible life remains positive, and its complete visible envelope has been fitted to the current viewport.
- Fit all commands in one correlated effect together: translate the complete group first, then apply one uniform intensity/size scale only if translation cannot fit it. Never clamp individual vertices or particles.
- The Boykisser CPU sampler and WGSL function are generated from one semantic landmark definition. Low-density sampling must retain every required landmark before weighted fill samples are added.
- Tasks 1 and 2 can be implemented independently after Task 0. Task 3 depends on Task 2's atomic resource replacement. Task 4 depends on Task 3's generation/owner contract. Task 5 depends on Tasks 2 and 3's buffer-generation model. Task 6 is independent of Tasks 1-5 after Task 0, but should land last so its browser case runs in the completed harness.

## Defect-to-task coverage

| Contract | Implemented and proved in |
| --- | --- |
| G1 bounded atlas, retryable loads, no neighbor bleed | Task 1 |
| G2 live GPU capacity matches acknowledged config | Task 2 |
| G3 stale readback cannot touch replacement resources | Task 3 |
| G4 two sequential device losses recover | Task 3 |
| G5 pre-loss queued commands never render after recovery | Task 3 |
| G6 full-frame GPU time and truthful allocation/drop pressure | Task 5 |
| G7 deferred batches are re-aged or expired | Task 4 |
| C6 shared semantic Boykisser geometry | Task 6 |
| C7 complete current-viewport visual-envelope admission | Task 4 |

---

### Task 0: Add the reusable fake-GPU and isolated Chrome test harnesses

**Dependencies:** None.

**Files:**

- Create: `app/test/helpers/webgpu-fireworks-gpu-harness.js`
- Create: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`
- Create: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Create: `app/test/webgpu-fireworks-gpu-harness-contract.test.js`
- Reference: `app/test/README.md`
- Reference: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`

**Step 1: Add the harness contract test first**

Create `app/test/webgpu-fireworks-gpu-harness-contract.test.js` with the exact public surface that all later tests use:

```js
const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks GPU harness', () => {
  test('records resources, submissions, destruction, and deferred maps', async () => {
    const deferred = createDeferred();
    const gpu = createFakeGpu({ mapAsync: () => deferred.promise });
    const renderer = makeRenderer(gpu, { maxParticles: 512 });

    await renderer.init();
    gpu.submissions.length = 0;
    const probeSubmission = { kind: 'probe' };
    gpu.devices[0].queue.submit([probeSubmission]);
    const buffer = gpu.buffers[0];
    const mapPromise = buffer.mapAsync(GPUMapMode.READ);
    deferred.resolve();
    await mapPromise;

    expect(renderer.maxParticles).toBe(512);
    expect(gpu.devices).toHaveLength(1);
    expect(gpu.submissions).toEqual([[probeSubmission]]);
    expect(buffer.mapCalls).toBe(1);
    buffer.destroy();
    expect(buffer.destroyed).toBe(true);
  });

  test('restores the exact navigator.gpu property installed by makeRenderer', () => {
    const previousNavigator = globalThis.navigator;
    const hadGpu = Boolean(previousNavigator) && Object.prototype.hasOwnProperty.call(previousNavigator, 'gpu');
    const previousGpu = previousNavigator?.gpu;
    const gpu = createFakeGpu();
    makeRenderer(gpu);

    expect(globalThis.navigator.gpu).toBe(gpu);
    restoreGpuGlobals();

    expect(globalThis.navigator).toBe(previousNavigator);
    if (previousNavigator) {
      expect(Object.prototype.hasOwnProperty.call(previousNavigator, 'gpu')).toBe(hadGpu);
      expect(previousNavigator.gpu).toBe(previousGpu);
    }
  });
});
```

The helper must snapshot, install, and restore only the globals it owns: `GPUBufferUsage`, `GPUTextureUsage`, `GPUShaderStage`, `GPUMapMode`, `OffscreenCanvas`, and the exact prior `navigator.gpu` property (creating/removing a temporary `navigator` object only when one did not exist). The fake `OffscreenCanvas` supplies the minimal 2D atlas context used by `_initializeAtlas`/`_writeAtlasImage` (`clearRect`, writable `fillStyle`, `beginPath`, `ellipse`, `arc`, `fill`, `drawImage`, `save`, `rect`, `clip`, and `restore`), so Node/Jest initialization never depends on a hidden `document` shim. Restore each prior value/property exactly, deleting only values that were originally absent, and make repeated `restoreGpuGlobals()` calls idempotent. Expose deterministic fake adapter/device/queue/buffer/texture/query/encoder objects and do not monkey-patch timers globally.

**Step 2: Run RED**

From `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-gpu-harness-contract.test.js
```

Expected failure: Jest cannot resolve `./helpers/webgpu-fireworks-gpu-harness`.

**Step 3: Implement the minimal reusable helper**

Export exactly:

```js
module.exports = {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
  waitForRecovery,
};
```

`createFakeGpu(options)` returns the following stable inspection surface:

```js
{
  adapter,
  devices,
  buffers,
  textures,
  bindGroups,
  commandEncoders,
  submissions,
  queueWrites,
  shaderModules,
  pipelines,
  requestAdapter(),
  getPreferredCanvasFormat(),
  loseDevice(deviceIndex, info),
  failNextBufferCreation(message),
  bindGroupBuffers(bindGroup),
  latestQueueWriteFor(label),
  framePassNames(),
  firstTimestamp(),
  lastTimestamp(),
  resolveQueryCalls(),
  texturesNamed(fragment),
  textureDescriptor(label),
  shaderCode(label),
  pipelineLabels(),
}
```

`makeRenderer(gpu, options)` constructs `WebGPUParticleEngine` with a fake canvas/context, injects `navigator.gpu`, and leaves initialization explicit. It wraps the instance's real `render()` method only to bracket recorder state before/after that call; production behavior, arguments, and return value are unchanged. Fake bind groups retain their creation descriptors, and `bindGroupBuffers(bindGroup)` returns the exact buffer objects referenced by their entries. Fake command encoders record compute/render pass descriptors, selected pipelines, and timestamp writes. A recorded frame window contains only submissions made inside one bracketed `render()` call; atlas initialization, probe submissions, and earlier frames are outside the window. `framePassNames()`, `firstTimestamp()`, `lastTimestamp()`, and `resolveQueryCalls()` inspect only the most recently closed frame window. `framePassNames()` derives its semantic compute/scene/bloom-down/bloom-up/composite sequence from that window; `pipelineLabels()` returns each explicit descriptor label and, when no label exists, its compute/vertex/fragment entry-point names, so an unlabeled real descriptor cannot disappear from inspection. Fake buffers expose `mapCalls`, `unmapCalls`, `destroyed`, `mapAsync`, `getMappedRange`, `setMappedUint32(values)`, `unmap`, and `destroy`. Fake devices expose a controllable `lost` promise per device. `waitForRecovery(renderer)` yields one microtask, requires `renderer.recoveryPromise` to exist, and awaits that exact promise; it is a test helper, not a production renderer API.

`createFakeGpu(options)` accepts only these deterministic controls: `timestampQuery: true|false` exposes or omits the adapter/device timestamp-query feature; `mapAsync(buffer, ...args)` supplies every fake-buffer map result; or `mapAsyncSequence: Promise[]` supplies FIFO results across all fake buffers. Supplying both map controls throws. A sequence call returns the next promise unchanged and rejects with `fake mapAsync sequence exhausted` after the final configured item, so an unexpected readback cannot pass silently. With neither map control, `mapAsync()` resolves immediately.

Build `webgpu-fireworks-chrome-stress.manual.js` as a standalone Node script, not a Jest test. It must:

- accept exactly one case name from `atlas`, `capacity`, `recovery`, `admission-envelope`, `telemetry-adaptive`, `boykisser`, or `all`;
- serve `webgpu-fireworks-chrome-harness.html` and the plugin files from an ephemeral loopback-only HTTP server;
- require `LTTH_CHROME_PATH`, resolve it to an existing file, and fail before server/browser startup if it is absent or invalid;
- launch exactly that executable with `--enable-unsafe-webgpu`, `--disable-software-rasterizer`, a fresh temporary profile, and WebGPU enabled; never fall back to Puppeteer's bundled Chromium or another discovered browser;
- read the current `GPUAdapter.info` `GPUAdapterInfo` object in the page and query Chrome's CDP `SystemInfo.getInfo` from a browser-target session. Require a non-null WebGPU adapter plus CDP feature/backend evidence for hardware D3D11 or D3D12; reject disabled/software WebGPU feature status and any device/renderer/backend text containing SwiftShader, llvmpipe, software, or fallback. Do not treat potentially empty privacy-filtered `GPUAdapterInfo` strings alone as hardware proof. Print the exact executable, adapter info, primary CDP GPU device, feature status, and D3D backend evidence;
- close the page, browser, server, and temporary profile in `finally`;
- exit non-zero on any page assertion or console error;
- print exactly one terminal line with ``console.log(`PASS ${caseName} ${JSON.stringify(payload)}`)``. Every terminal payload contains a JSON-safe `hardware` object with exactly the resolved installed-Chrome path, normalized `GPUAdapter.info`, selected CDP GPU device, selected CDP WebGPU feature status, `backend: 'd3d11' | 'd3d12'`, `fallback: false`, and `verdict: 'hardware-d3d'`. A named case emits exactly `{ hardware, result }`; `all` emits exactly `{ hardware, cases }`, where `cases` has exactly the six keys `atlas`, `capacity`, `recovery`, `admission-envelope`, `telemetry-adaptive`, and `boykisser`. Earlier diagnostic lines are never acceptance evidence. For example, the completed atlas result lives under `PASS atlas {"hardware":{...},"result":{"uniqueUrls":1000,"maxLiveSlots":63,"neighborBleedPixels":0}}`.

Keep every case function present from the start. Until its owning task is implemented, return `{ skipped: true, owner: 'Task N' }`; this is explicit harness routing, not a passing acceptance result. The `all` case must reject if any child case is still marked `skipped`.

The HTML fixture loads scripts passed by the Node runner, creates a transparent WebGPU canvas, exposes `window.runWebGpuFireworksCase(name)`, and returns JSON-safe evidence. It must not load the LTTH server, connect a socket, or mutate an OBS source.

**Step 4: Run GREEN**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-gpu-harness-contract.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js atlas
```

Expected result: the Jest contract passes naturally; the manual command prints hardware diagnostics followed by one terminal `PASS atlas {"hardware":{...},"result":{"skipped":true,"owner":"Task 1"}}` payload and exits zero only because an individual pre-implementation case is allowed to report `skipped`.

**Step 5: Commit**

```powershell
git add app/test/helpers/webgpu-fireworks-gpu-harness.js app/test/fixtures/webgpu-fireworks-chrome-harness.html app/test/webgpu-fireworks-chrome-stress.manual.js app/test/webgpu-fireworks-gpu-harness-contract.test.js
git commit -m "test(webgpu-fireworks): add isolated GPU harnesses"
```

---

### Task 1: Recycle image resources safely and remove atlas bleed (G1)

**Dependencies:** Task 0.

**Files:**

- Create: `app/test/webgpu-fireworks-image-resources.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`

**Step 1: Write RED resource-lifecycle tests**

Use fake images with `{ key, close: jest.fn() }`, a fake clock passed through renderer options, and the Task 0 helper. The focused file must contain these tests:

```js
const {
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');
const { WebGPUFireworksEngine } = require('../plugins/webgpu-fireworks/gpu/engine');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks image resource lifecycle', () => {
  test('reuses an expired least-recently-used external slot after 63 live keys', async () => {
    let nowMs = 1_000;
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { now: () => nowMs });
    await renderer.init();

    const first = await renderer.uploadImage('image-0', { key: 'image-0' });
    for (let index = 1; index < 63; index += 1) {
      await renderer.uploadImage(`image-${index}`, { key: `image-${index}` });
    }
    renderer._markAtlasTextureUsed(first, { nowMs, visibleUntilMs: nowMs + 10 });
    nowMs += 11;

    const reused = await renderer.uploadImage('image-63', { key: 'image-63' });

    expect(first).toBeGreaterThan(1);
    expect(reused).toBe(first);
    expect(renderer.atlasEntries.size).toBe(63);
    expect(renderer.atlasEntries.has('image-0')).toBe(false);
    expect(renderer.atlasEntries.has('image-63')).toBe(true);
  });

  test('does not evict a slot while its last submitted effect can still sample it', async () => {
    let nowMs = 5_000;
    const renderer = makeRenderer(createFakeGpu(), { now: () => nowMs });
    await renderer.init();
    const pinned = await renderer.uploadImage('pinned', { key: 'pinned' });
    renderer._markAtlasTextureUsed(pinned, { nowMs, visibleUntilMs: 9_000 });
    for (let index = 0; index < 62; index += 1) {
      const textureIndex = await renderer.uploadImage(`other-${index}`, { key: `other-${index}` });
      renderer._markAtlasTextureUsed(textureIndex, { nowMs, visibleUntilMs: 9_000 });
    }

    const fallback = await renderer.uploadImage('overflow', { key: 'overflow' });

    expect(fallback).toBe(0);
    expect(renderer.atlasEntries.get('pinned').textureIndex).toBe(pinned);
  });

  test('removes a rejected image promise so the same URL can retry', async () => {
    const attempts = [];
    const engine = Object.create(WebGPUFireworksEngine.prototype);
    engine.imageCache = new Map();
    engine.imageCacheLimit = 64;
    engine.imageLoadTimeoutMs = 20;
    engine._fetchImageSource = (url) => {
      attempts.push(url);
      return attempts.length === 1
        ? Promise.reject(new Error('decode failed'))
        : Promise.resolve({ url });
    };
    engine._decodeImageSource = async (source) => ({ source, close: jest.fn() });

    await expect(engine.loadImage('/same.png')).rejects.toThrow('decode failed');
    await expect(engine.loadImage('/same.png')).resolves.toBeDefined();

    expect(attempts).toEqual(['/same.png', '/same.png']);
    expect(engine.imageCache.size).toBe(1);
  });

  test('removes a timed-out source promise so the same URL can retry', async () => {
    jest.useFakeTimers();
    try {
      let attempts = 0;
      const engine = Object.create(WebGPUFireworksEngine.prototype);
      engine.imageCache = new Map();
      engine.imageCacheLimit = 64;
      engine.imageLoadTimeoutMs = 20;
      engine._fetchImageSource = (url) => {
        attempts += 1;
        return attempts === 1 ? new Promise(() => {}) : Promise.resolve({ url });
      };

      const first = engine.loadImage('/slow.png');
      const timedOut = expect(first).rejects.toThrow(/timed out/i);
      await jest.advanceTimersByTimeAsync(21);
      await timedOut;
      await expect(engine.loadImage('/slow.png')).resolves.toEqual({ url: '/slow.png' });

      expect(attempts).toBe(2);
      expect(engine.imageCache.size).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('bounds successful image promises and closes decoded images after upload', async () => {
    const renderer = { uploadImage: jest.fn().mockResolvedValue(2) };
    const engine = Object.create(WebGPUFireworksEngine.prototype);
    engine.renderer = renderer;
    engine.config = {};
    engine.imageCache = new Map();
    engine.imageCacheLimit = 64;
    engine.imageLoadTimeoutMs = 100;
    engine._fetchImageSource = async (url) => ({ url });
    engine._decodeImageSource = async (source) => ({ source, close: jest.fn() });

    for (let index = 0; index < 100; index += 1) {
      await engine.prepareImages({ giftImage: `/asset-${index}.png` });
    }

    expect(engine.imageCache.size).toBeLessThanOrEqual(64);
    for (const [, image] of renderer.uploadImage.mock.calls) {
      expect(image.close).toHaveBeenCalledTimes(1);
    }
  });

  test('keeps the cache bounded when all 64 existing source requests are pending', async () => {
    jest.useFakeTimers();
    try {
      const engine = Object.create(WebGPUFireworksEngine.prototype);
      engine.imageCache = new Map();
      engine.imageCacheLimit = 64;
      engine.imageLoadTimeoutMs = 100_000;
      engine._fetchImageSource = jest.fn((url) => (
        url === '/overflow.png' ? Promise.resolve({ url }) : new Promise(() => {})
      ));

      for (let index = 0; index < 64; index += 1) {
        void engine.loadImage(`/pending-${index}.png`);
      }
      await expect(engine.loadImage('/overflow.png')).resolves.toEqual({ url: '/overflow.png' });

      expect(engine.imageCache.size).toBe(64);
      expect(engine.imageCache.has('/overflow.png')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('uses a single atlas mip and explicit level-zero sampling', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu);
    await renderer.init();

    expect(gpu.textureDescriptor('fireworks-atlas').mipLevelCount).toBe(1);
    const particleShader = gpu.shaderCode('fireworks-particle-wgsl');
    expect(particleShader).toContain('textureSampleLevel(atlasTexture, atlasSampler, atlasUv, 0.0)');
    expect(particleShader).not.toContain('textureSampleGrad(atlasTexture');
  });
});
```

Also update the manual `atlas` case so it uploads at least 1,000 unique 8x8 solid-color images, renders long enough to release every pin, verifies that the maximum live external mapping count is 63, samples the center and edge of each reused tile, and fails on neighbor-color contamination.

**Step 2: Run RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-image-resources.test.js
```

Expected failures: `atlasEntries`, `_markAtlasTextureUsed`, `imageCacheLimit`, `imageLoadTimeoutMs`, `_fetchImageSource`, and `_decodeImageSource` do not exist; the 64th unique atlas key falls back instead of reusing a safe slot; the shader still uses gradient mip sampling.

**Step 3: Implement bounded atlas ownership**

In `webgpu-particle-engine.js`:

- replace `atlasSlots`, `atlasSources`, and monotonic `nextAtlasSlot` ownership with `atlasEntries: Map<string, AtlasEntry>` and `atlasSlotOwners: Array<string|null>`;
- define `ATLAS_SLOT_COUNT = 64`, `EXTERNAL_ATLAS_SLOT_COUNT = 63`, and use slot `0` only for the built-in paw fallback;
- keep `atlasEntries` limited to external keys, so the reserved slot-0 fallback does not consume or inflate the 63-entry external mapping budget;
- keep `uploadImage(key, image)` idempotent by key and return `slot + 1`, preserving the existing call signature and `textureIndex` convention;
- add `_acquireAtlasSlot(key, { nowMs, inUseUntilMs })` and `_markAtlasTextureUsed(textureIndex, { nowMs, visibleUntilMs })`;
- select only entries with `inUseUntilMs <= nowMs` for eviction, then choose the smallest `lastUsedAtMs`, breaking ties by slot number;
- return fallback index `0` when all external slots are pinned; do not overwrite a visible texture;
- define `ATLAS_RELEASE_GRACE_MS = 1_000`; when `_queueSpawn` receives a nonzero image `textureIndex`, update that atlas entry's `inUseUntilMs` to at least `queuedAtMs + 1_000 * (max(0, emissionDelay) + max(0, particleDuration) + max(0, emissionSpread)) + ATLAS_RELEASE_GRACE_MS`;
- stop retaining decoded images after `queue.copyExternalImageToTexture` completes;
- create the atlas with `mipLevelCount: 1`, remove atlas mip generation resources, and replace the current gradient sample with `textureSampleLevel(atlasTexture, atlasSampler, atlasUv, 0.0)`.

Use this entry shape:

```js
{
  key,
  slot,
  textureIndex: slot + 1,
  lastUsedAtMs,
  inUseUntilMs,
}
```

**Step 4: Implement bounded, retryable browser image loads**

In `engine.js`:

- initialize `imageCacheLimit = 64` and `imageLoadTimeoutMs = 5_000`;
- make `loadImage(url, { timeoutMs = this.imageLoadTimeoutMs } = {})` cache a promise for immutable fetched image source data by URL, but delete that exact promise on rejection or timeout;
- add `_fetchImageSource(url)` and `_decodeImageSource(source)` so the bounded cache retains source data rather than a decoded drawable and Jest can replace only those external boundaries;
- evict the least-recently-used settled promise before adding entry 65; never evict an in-flight promise;
- if all 64 entries are still pending, execute request 65 through the same fetch/timeout validation without inserting it into `imageCache`; this preserves service without exceeding the hard bound, and a later call may cache normally after a settled slot becomes evictable;
- in `prepareImages`, decode a fresh drawable from the cached source and close each `ImageBitmap`/closeable image in `finally` after `renderer.uploadImage(key, image)` has copied it;
- log one actionable warning per failed URL and keep the fallback index rather than poisoning the cache.

The cache record is explicit:

```js
{
  sourcePromise,
  state: 'pending' | 'fulfilled',
  lastUsedAtMs,
}
```

**Step 5: Run GREEN and real-GPU atlas stress**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-image-resources.test.js test/webgpu-fireworks-gpu-v2-contract.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js atlas
```

Expected result: both Jest files pass naturally; Chrome prints `PASS atlas` with `uniqueUrls:1000`, `maxLiveSlots:63`, `fallbackWhilePinned` greater than zero, `reusedSlots` greater than zero, and `neighborBleedPixels:0`.

**Step 6: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/plugins/webgpu-fireworks/gpu/engine.js app/test/webgpu-fireworks-image-resources.test.js app/test/webgpu-fireworks-chrome-stress.manual.js app/test/fixtures/webgpu-fireworks-chrome-harness.html
git commit -m "fix(webgpu-fireworks): recycle image atlas resources"
```

---

### Task 2: Resize the live GPU particle pool atomically (G2)

**Dependencies:** Task 0. Coordinate ownership of `engine.js` if another plan is changing global configuration validation.

**Files:**

- Create: `app/test/webgpu-fireworks-gpu-capacity.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Modify: `app/test/webgpu-fireworks-benchmark-client.test.js`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`

**Step 1: Write RED renderer-capacity tests**

```js
const {
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks live particle capacity', () => {
  test.each([512, 16_384])('atomically swaps all capacity-bound resources to %i', async (capacity) => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const oldResources = renderer._captureCapacityResources();

    const result = await renderer.reconfigureCapacity(capacity);

    expect(result).toEqual({
      changed: capacity !== 2_048,
      generation: 2,
      maxParticles: capacity,
    });
    expect(renderer.maxParticles).toBe(capacity);
    expect(renderer.capacityResources.particleBuffer.size).toBe(capacity * renderer.particleStride);
    expect(gpu.bindGroupBuffers(renderer.computeBindGroup)).toContain(
      renderer.capacityResources.particleBuffer
    );
    expect(renderer.renderBindGroups).toHaveLength(3);
    for (const bindGroup of renderer.renderBindGroups) {
      expect(gpu.bindGroupBuffers(bindGroup)).toContain(renderer.capacityResources.particleBuffer);
    }
    for (const resource of Object.values(oldResources)) {
      if (resource && typeof resource.destroy === 'function') {
        expect(resource.destroyed).toBe(true);
      }
    }
  });

  test('leaves the active pool untouched when replacement creation fails', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const oldResources = renderer._captureCapacityResources();
    gpu.failNextBufferCreation('fake buffer creation failure');

    await expect(renderer.reconfigureCapacity(8_192)).rejects.toThrow('fake buffer creation failure');

    expect(renderer.maxParticles).toBe(2_048);
    expect(renderer.resourceGeneration).toBe(1);
    expect(renderer._captureCapacityResources()).toEqual(oldResources);
    expect(oldResources.particleBuffer.destroyed).toBe(false);
  });

  test('rejects capacity outside the renderer schema without allocating', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { maxParticles: 2_048 });
    await renderer.init();
    const before = gpu.buffers.length;

    await expect(renderer.reconfigureCapacity(511)).rejects.toMatchObject({ code: 'INVALID_PARTICLE_CAPACITY' });
    await expect(renderer.reconfigureCapacity(16_385)).rejects.toMatchObject({ code: 'INVALID_PARTICLE_CAPACITY' });
    expect(gpu.buffers).toHaveLength(before);
  });
});
```

The buffer-size assertion uses an exported/instance `particleStride` value, not a duplicated magic number in tests.

**Step 2: Write RED configuration acknowledgement test**

Add `const { createDeferred } = require('./helpers/webgpu-fireworks-gpu-harness');` to `webgpu-fireworks-benchmark-client.test.js`, then use its real `createClient(search)`, `client.receive(event, payload, acknowledge)`, and `client.restore()` helpers:

```js
test('acknowledges maxTotalParticles only after the renderer uses that capacity', async () => {
  const pending = createDeferred();
  const renderer = {
    maxParticles: 2_048,
    reconfigureCapacity: jest.fn(() => pending.promise),
  };
  const client = createClient('');
  try {
    client.engine.renderer = renderer;
    client.engine.config.maxTotalParticles = 2_048;
    const acknowledge = jest.fn();

    const invocation = client.receive('webgpu-fireworks:config-update', {
      config: { maxTotalParticles: 8_192 },
    }, acknowledge);
    expect(acknowledge).not.toHaveBeenCalled();
    expect(client.engine.config.maxTotalParticles).toBe(2_048);

    renderer.maxParticles = 8_192;
    pending.resolve({ changed: true, generation: 2, maxParticles: 8_192 });
    await invocation;

    expect(client.engine.config.maxTotalParticles).toBe(8_192);
    expect(acknowledge).toHaveBeenCalledWith({
      accepted: true,
      benchmarkSessionId: null,
      applied: true,
    });
  } finally {
    client.restore();
  }
});

test('returns a stable error and preserves config when capacity replacement fails', async () => {
  const renderer = {
    maxParticles: 2_048,
    reconfigureCapacity: jest.fn().mockRejectedValue(Object.assign(new Error('allocation failed'), {
      code: 'GPU_CAPACITY_REALLOCATION_FAILED',
    })),
  };
  const client = createClient('');
  try {
    client.engine.renderer = renderer;
    client.engine.config.maxTotalParticles = 2_048;
    const acknowledge = jest.fn();

    await client.receive('webgpu-fireworks:config-update', {
      config: { maxTotalParticles: 8_192 },
    }, acknowledge);

    expect(client.engine.config.maxTotalParticles).toBe(2_048);
    expect(acknowledge).toHaveBeenCalledWith({
      accepted: false,
      benchmarkSessionId: null,
      reason: 'gpu-capacity-reallocation-failed',
    });
  } finally {
    client.restore();
  }
});
```

**Step 3: Run RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-gpu-capacity.test.js test/webgpu-fireworks-benchmark-client.test.js
```

Expected failures: `reconfigureCapacity`, `_captureCapacityResources`, `resourceGeneration`, and the asynchronous apply-before-ack contract do not exist; current config handling acknowledges a number without replacing GPU buffers.

**Step 4: Implement an atomic capacity resource bundle**

In `webgpu-particle-engine.js`:

- introduce `resourceGeneration`, initialized to `0` and incremented only after a complete resource bundle becomes active;
- split device-wide resources from particle-capacity resources;
- store compute/render bind-group layouts on the renderer instance rather than only in `_createPipelines` locals;
- add `_createCapacityResources(maxParticles)`, `_createCapacityBindGroups(resources)`, `_captureCapacityResources()`, `_destroyCapacityResources(resources)`, and `async reconfigureCapacity(value)`;
- validate an integer range of 512 through 16,384 before allocating;
- build and initialize the replacement buffers and bind groups off to the side;
- after all creation succeeds, swap `capacityResources`, bind groups, and `maxParticles` synchronously, increment `resourceGeneration`, reset generation-scoped counters, then retire the old bundle. Destroy it immediately when it has no readback lease; otherwise defer destruction until its final captured readback releases in `finally`;
- on failure, destroy only partially created replacements, attach code `GPU_CAPACITY_REALLOCATION_FAILED`, and keep every active reference and the generation unchanged;
- serialize concurrent calls through one capacity-change promise so later calls observe the result of the earlier swap rather than destroying its resources.

The public contract is:

```js
async reconfigureCapacity(value) {
  return {
    changed,
    generation: this.resourceGeneration,
    maxParticles: this.maxParticles,
  };
}
```

In `engine.js`, add `async applyRuntimeConfig(nextConfig)` and route the existing Socket.IO config handler through it. Validate first, await `renderer.reconfigureCapacity` when `maxTotalParticles` differs, then assign the normalized config, quality, and dimensions. Keep the existing acknowledgement protocol: success is `{ accepted: true, benchmarkSessionId, applied: true }`; a replacement failure preserves the old config and returns `{ accepted: false, benchmarkSessionId, reason: 'gpu-capacity-reallocation-failed' }`. Log the underlying error once, but do not expose a new incompatible `{ ok, code, message }` acknowledgement shape.

**Step 5: Implement real-GPU capacity evidence**

Replace the `capacity` case's skipped result. On one renderer/device, configure 512, render and read counters, then configure 16,384 and render again. Report both buffer byte sizes, resource generations, active capacity, and validation-error behavior. The case fails if an ACK-like result differs from the renderer's active `maxParticles`.

**Step 6: Run GREEN**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-gpu-capacity.test.js test/webgpu-fireworks-benchmark-client.test.js test/webgpu-fireworks-gpu-v2-contract.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js capacity
```

Expected result: all Jest tests pass; Chrome prints `PASS capacity` with capacities `[512,16384]`, two distinct generations, matching active capacities/buffer sizes, and no validation mismatch.

**Step 7: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/plugins/webgpu-fireworks/gpu/engine.js app/test/webgpu-fireworks-gpu-capacity.test.js app/test/webgpu-fireworks-benchmark-client.test.js app/test/webgpu-fireworks-chrome-stress.manual.js app/test/fixtures/webgpu-fireworks-chrome-harness.html
git commit -m "fix(webgpu-fireworks): resize GPU particle capacity"
```

---

### Task 3: Scope readbacks and queued work to recoverable resource generations (G3, G4, G5)

**Dependencies:** Tasks 0 and 2.

**Files:**

- Create: `app/test/webgpu-fireworks-gpu-lifecycle.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Modify: `app/test/webgpu-fireworks-native.test.js`
- Modify: `app/test/webgpu-fireworks-command-admission.test.js`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`

**Step 1: Write RED stale-readback and repeat-recovery tests**

```js
const {
  createDeferred,
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
  waitForRecovery,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks generation lifecycle', () => {
  test('ignores completion from exact readback buffers of an obsolete generation', async () => {
    const oldMap = createDeferred();
    const gpu = createFakeGpu({ mapAsyncSequence: [oldMap.promise, Promise.resolve()] });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    renderer.metrics.activeParticles = 7;
    const oldCounterReadback = renderer.capacityResources.counterReadbackBuffer;

    const consumeOld = renderer._consumeReadback();
    await renderer.reconfigureCapacity(4_096);
    renderer.metrics.activeParticles = 11;
    oldCounterReadback.setMappedUint32([99, 88, 77]);
    oldMap.resolve();
    await consumeOld;

    expect(renderer.metrics.activeParticles).toBe(11);
    expect(renderer.capacityResources.counterReadbackBuffer).not.toBe(oldCounterReadback);
    expect(oldCounterReadback.unmapCalls).toBe(1);
    expect(oldCounterReadback.destroyed).toBe(true);
  });

  test('recovers two sequential current-device losses to fresh ready devices', async () => {
    const gpu = createFakeGpu();
    const states = [];
    const renderer = makeRenderer(gpu, {
      recoveryDelayMs: 0,
      onStatus: (status) => states.push(status.state),
    });
    await renderer.init();

    gpu.loseDevice(0, { reason: 'destroyed', message: 'first' });
    await waitForRecovery(renderer);
    gpu.loseDevice(1, { reason: 'unknown', message: 'second' });
    await waitForRecovery(renderer);

    expect(gpu.devices).toHaveLength(3);
    expect(renderer.device).toBe(gpu.devices[2]);
    expect(renderer.resourceGeneration).toBe(3);
    expect(states.filter((state) => state === 'ready')).toHaveLength(3);
  });

  test('serializes duplicate loss notifications for one device', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { recoveryDelayMs: 0 });
    await renderer.init();
    const firstDevice = renderer.device;
    const firstGeneration = renderer.resourceGeneration;

    const first = renderer._handleDeviceLost({ reason: 'unknown' }, firstDevice, firstGeneration);
    const duplicate = renderer._handleDeviceLost({ reason: 'unknown' }, firstDevice, firstGeneration);
    await Promise.all([first, duplicate]);

    expect(gpu.devices).toHaveLength(2);
  });
});
```

**Step 2: Write RED ghost-queue tests**

Add to the same file:

```js
test('purges lost-generation queue entries before the first recovered upload', async () => {
  const gpu = createFakeGpu();
  const renderer = makeRenderer(gpu, { recoveryDelayMs: 0 });
  await renderer.init();
  renderer._queueSpawn({
    shape: 2,
    count: 8,
    ownerToken: 'finale:42',
    expiresAtMs: 10_000,
  });
  expect(renderer.spawnQueue).toHaveLength(1);

  gpu.loseDevice(0, { reason: 'unknown', message: 'lost' });
  await waitForRecovery(renderer);
  renderer._uploadSpawnCommands(2_000);

  expect(renderer.spawnQueue).toEqual([]);
  expect(renderer.spawnTelemetry.droppedByReason.staleGeneration).toBe(1);
  expect(gpu.latestQueueWriteFor('spawn')).toBeNull();
});

test('a device loss fails the active owner and cannot later complete it', async () => {
  const gpu = createFakeGpu();
  const onOwnerInvalidated = jest.fn();
  const renderer = makeRenderer(gpu, { recoveryDelayMs: 0, onOwnerInvalidated });
  await renderer.init();
  renderer._queueSpawn({
    shape: 0,
    count: 12,
    ownerToken: 'preview:7',
    expiresAtMs: 20_000,
  });

  gpu.loseDevice(0, { reason: 'unknown', message: 'lost' });
  await waitForRecovery(renderer);

  expect(onOwnerInvalidated).toHaveBeenCalledWith('preview:7', 'device-lost');
  expect(renderer.spawnQueue).toEqual([]);
});
```

In `webgpu-fireworks-native.test.js`, extend the current one-loss assertion to verify that the recovery latch is reset and a second loss changes state through `device-lost` to `ready` again. In `webgpu-fireworks-command-admission.test.js`, add a stale-generation entry beside an otherwise admissible current entry and assert only the current entry uploads.

**Step 3: Run RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-gpu-lifecycle.test.js test/webgpu-fireworks-native.test.js test/webgpu-fireworks-command-admission.test.js
```

Expected failures: `_consumeReadback` reads through current `this.buffers`, `deviceRecoveryAttempted` prevents a second recovery, no waitable recovery promise exists, and queued commands have no generation or owner invalidation metadata.

**Step 4: Capture exact readback ownership**

In `webgpu-particle-engine.js`:

- give each capacity bundle an `inFlightReadbacks` lease count plus `retired`/`destroyed` state, and make `_destroyCapacityResources` idempotent;
- make each readback request a record containing `generation`, its leased capacity bundle, exact counter/timestamp source buffers, exact counter/timestamp readback buffers, and its promise;
- in `_consumeReadback`, use only captured references for copy/map/read/unmap and never dereference replacement buffers from `this` inside asynchronous callbacks;
- after mapping, compare the captured generation with `this.resourceGeneration`; if stale, unmap the captured buffers and return without changing metrics, adaptive state, or scheduling another copy;
- release the captured bundle lease in `finally`; if the bundle was retired by a capacity swap, that final release destroys it only after successful stale unmap or stale map rejection cleanup;
- treat stale map rejection (including physical device-loss destruction) as obsolete cleanup, not a current device error;
- permit at most one counter readback and one timestamp readback per generation.

Use this explicit capture shape:

```js
{
  generation: this.resourceGeneration,
  capacityBundle,
  counterSource,
  counterReadback,
  timestampSource,
  timestampReadback,
  release,
}
```

**Step 5: Make device recovery repeatable and queue ownership explicit**

Replace the lifetime boolean `deviceRecoveryAttempted` with:

```js
this.recoveryPromise = null;
this.recoveringDevice = null;
this.recoveryDelayMs = Number.isFinite(Number(options.recoveryDelayMs))
  ? Math.max(0, Number(options.recoveryDelayMs))
  : 1_000;
this.onOwnerInvalidated = typeof options.onOwnerInvalidated === 'function'
  ? options.onOwnerInvalidated
  : () => {};
this.spawnTelemetry = {
  droppedByReason: {
    staleGeneration: 0,
    expired: 0,
    inactiveOwner: 0,
    lifeExhausted: 0,
    unregisteredEnvelope: 0,
    envelopeCannotFit: 0,
  },
};
```

Preserve the existing `onStatus(metrics)` callback; do not introduce a competing `onStateChange` API. `_watchDevice(device, generation)` must pass both captured values into `_handleDeviceLost(info, device, generation)`. `_handleDeviceLost` returns the existing recovery promise for duplicate notifications from the same device, ignores notifications for a non-current device/generation, waits `recoveryDelayMs`, and clears `recoveryPromise` plus `recoveringDevice` in `finally`. A successful `init` creates a fresh generation and watches the fresh device, so a later loss starts another recovery.

Before destroying lost resources:

- collect the distinct `ownerToken` values queued in the lost generation;
- drop and count every queued entry from that generation;
- invoke `onOwnerInvalidated(ownerToken, 'device-lost')` once per owner;
- let `engine.js` route invalidation through its existing device-lost status plus finale and preview failure path;
- ensure completion/end-card callbacks already invalidated by that path cannot later report success.

Stamp each `_queueSpawn` entry with `resourceGeneration`, `ownerToken`, `queuedAtMs`, and `expiresAtMs`. Add `cancelQueuedOwner(ownerToken, reason)` for normal completion/failure cancellation. In `_uploadSpawnCommands`, discard a generation mismatch before policy admission or any queue write.

**Step 6: Implement real-GPU recovery evidence**

Replace the `recovery` case's skipped result. On the real hardware renderer, queue an owned command, start the normal readback path, call `GPUDevice.destroy()` on device 1, verify device 2 is ready with a new generation and no lost-generation command upload, then repeat for device 2 and verify device 3. Do not claim deterministic control over native `mapAsync()` completion and do not replace the real device with the fake GPU in this case; the exact delayed stale-readback completion is proved by the Jest test above. Report device identities, generations, stale commands dropped, owner invalidations, and whether an actual pending readback was observed at each loss.

**Step 7: Run GREEN**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-gpu-lifecycle.test.js test/webgpu-fireworks-native.test.js test/webgpu-fireworks-command-admission.test.js test/webgpu-fireworks-gpu-capacity.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js recovery
```

Expected result: Jest exits naturally; Chrome prints `PASS recovery` with `deviceCount:3`, `recoveries:2`, `staleReadbacksApplied:0`, `staleCommandsUploaded:0`, and two increasing recovered generations.

**Step 8: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/plugins/webgpu-fireworks/gpu/engine.js app/test/webgpu-fireworks-gpu-lifecycle.test.js app/test/webgpu-fireworks-native.test.js app/test/webgpu-fireworks-command-admission.test.js app/test/webgpu-fireworks-chrome-stress.manual.js app/test/fixtures/webgpu-fireworks-chrome-harness.html
git commit -m "fix(webgpu-fireworks): recover generation-scoped GPU resources"
```

---

### Task 4: Re-age deferred work and fit complete envelopes at current admission time (G7, C7)

**Dependencies:** Tasks 0 and 3.

**Files:**

- Create: `app/plugins/webgpu-fireworks/gpu/visible-envelope.js`
- Create: `app/test/webgpu-fireworks-visible-envelope.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Modify: `app/plugins/webgpu-fireworks/overlay.html`
- Modify: `app/test/webgpu-fireworks-command-admission.test.js`
- Modify: `app/test/webgpu-fireworks-finale-v2-runtime.test.js`
- Modify: `app/test/webgpu-fireworks-resolution-bounds.test.js`
- Modify: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`

**Root cause to preserve in the regression:** `SpawnPlanner.getBounds()` constrains centers, while WGSL `projectToPixels` applies depth perspective and `coreVertex` expands and rotates the final quad afterward. In a 1080x1920 portrait viewport at normalized `y=0.12`, depth `+1` projects the center to about `-12.8 px`; a near-22 px standard rocket with a 1.42 rotated-axis factor reaches about `-54.5 px`. Center-only bounds therefore cannot prove a visible top edge.

**Step 1: Write RED registry and matrix tests**

Create `visible-envelope.js` as the future CommonJS/browser module path, then write the test against its intended exports:

```js
const {
  SHAPE_IDS,
  V2_PRIMITIVE_IDS,
  V2_GLYPH_IDS,
  ROCKET_VARIANTS,
  ENVELOPE_FLAG_BITS,
  classifyEnvelopeCommand,
  getEnvelopeProfile,
  projectVisualEnvelope,
  fitCorrelatedCommands,
} = require('../plugins/webgpu-fireworks/gpu/visible-envelope');

const RESOLUTIONS = [
  { width: 960, height: 540 },
  { width: 1_920, height: 1_080 },
  { width: 3_840, height: 2_160 },
  { width: 540, height: 960 },
  { width: 1_080, height: 1_920 },
  { width: 2_160, height: 3_840 },
];

describe('WebGPU Fireworks visible-envelope contract', () => {
  test('registers one conservative profile for every shape and rocket variant', () => {
    expect(SHAPE_IDS).toEqual(Array.from({ length: 27 }, (_, index) => index));
    expect(Object.values(V2_PRIMITIVE_IDS)).toEqual([10, 11, 12, 13, 14, 15, 16]);
    expect(Object.values(V2_GLYPH_IDS)).toEqual([17, 18, 19, 20, 21, 22, 23, 24, 25, 26]);
    expect(ROCKET_VARIANTS).toEqual(['standard', 'avatar-head', 'decal']);
    expect(ENVELOPE_FLAG_BITS).toMatchObject({
      TRAIL: 1 << 0,
      SPLIT_REQUESTED: 1 << 1,
      STROBE: 1 << 3,
      ROCKET_AVATAR_HEAD: 1 << 14,
      V2_MARKER: 1 << 15,
    });
    for (const shapeId of SHAPE_IDS) {
      const command = { kind: 2, shape: shapeId, flags: 0, textureIndex: 0 };
      expect(classifyEnvelopeCommand(command)).toEqual({ category: 'shape', shapeId });
      expect(getEnvelopeProfile(command)).toMatchObject({ shapeId });
    }
    for (const variant of ROCKET_VARIANTS) {
      const command = makeRocketVariantCommand(variant);
      expect(classifyEnvelopeCommand(command)).toEqual({ category: 'rocket', variant });
      expect(getEnvelopeProfile(command)).toMatchObject({ variant });
    }
  });

  test.each(RESOLUTIONS)('fits complete envelopes at $width x $height for depth -1, 0, and +1', (viewport) => {
    for (const depth of [-1, 0, 1]) {
      for (const shapeId of SHAPE_IDS) {
        const command = {
          kind: 2,
          shape: shapeId,
          origin: { x: viewport.width * 0.5, y: viewport.height * 0.02 },
          target: { x: viewport.width * 0.5, y: viewport.height * 0.02 },
          burstDepth: depth,
          size: 48,
          intensity: 1,
          particleDuration: 2.5,
          emissionDelay: 0,
          velocity: [0, -180],
          gravity: 90,
          drag: 0.985,
          turbulence: 24,
          trailLength: 0.5,
          glowRadius: 14,
          bloomRadius: 22,
        };
        const fitted = fitCorrelatedCommands([command], viewport, { paddingPx: 2 });
        const bounds = projectVisualEnvelope(fitted.commands[0], viewport);

        expect(fitted.strategy).toMatch(/^(none|translate|uniform-scale)$/);
        expect(bounds.left).toBeGreaterThanOrEqual(2);
        expect(bounds.top).toBeGreaterThanOrEqual(2);
        expect(bounds.right).toBeLessThanOrEqual(viewport.width - 2);
        expect(bounds.bottom).toBeLessThanOrEqual(viewport.height - 2);
      }
    }
  });

  test.each(['star', 'ring'])('%s retains one correlated transform without vertex deformation', (name) => {
    const commands = makeNamedCorrelatedEffect(name, { x: 540, y: 24, z: 1 });
    const fitted = fitCorrelatedCommands(commands, { width: 1_080, height: 1_920 }, { paddingPx: 2 });
    const translations = fitted.commands.map((command, index) => ({
      dx: command.origin.x - commands[index].origin.x,
      dy: command.origin.y - commands[index].origin.y,
      scale: command.admissionScale,
    }));

    expect(new Set(translations.map(({ dx }) => dx))).toHaveSize(1);
    expect(new Set(translations.map(({ dy }) => dy))).toHaveSize(1);
    expect(new Set(translations.map(({ scale }) => scale))).toHaveSize(1);
    expect(fitted.vertexClampApplied).toBe(false);
  });

  test('includes the complete standard rocket body, flame, trail, glow, and bloom at the upper bound', () => {
    const viewport = { width: 1_080, height: 1_920 };
    const fitted = fitCorrelatedCommands([makeStandardRocket({ x: 540, y: 18, z: 1 })], viewport, {
      paddingPx: 2,
    });
    const bounds = projectVisualEnvelope(fitted.commands[0], viewport);

    expect(bounds.components).toEqual(expect.arrayContaining([
      'body',
      'flame',
      'trail',
      'glow',
      'bloom',
    ]));
    expect(bounds.top).toBeGreaterThanOrEqual(2);
  });
});
```

`makeNamedCorrelatedEffect`, `makeRocketVariantCommand`, and `makeStandardRocket` are local complete fixture builders in this test file. `makeRocketVariantCommand()` must use the production queue encoding: standard is `kind: 1, shape: 8`; avatar-head adds nonzero `textureIndex` and the existing rocket-avatar flag; decal is `kind: 1, shape: 6` with nonzero `textureIndex`. The builders populate every field consumed by `projectVisualEnvelope`; do not mock the envelope calculation.

**Step 2: Write RED admission-time, owner, resize, and expiry tests**

First extend the test-local `makeEngine` signature to `makeEngine({ width = 1_920, height = 1_080, nowMs = 1_000, isOwnerActive = () => true } = {})`, pass `width`/`height` to the renderer, and set its injected clock and owner predicate. Extend `queueCommand` to forward `emissionDelay`, `particleDuration`, `ownerToken`, `expiresAtMs`, `normalizedOrigin`, `normalizedTarget`, and optional `origin`/`target`. Then add these tests to `webgpu-fireworks-command-admission.test.js`; inspect the existing packed 28-word command rather than adding a production-only test hook:

```js
const cueEnvelopeCommand = (envelopeCommandId, normalizedX) => Object.freeze({
  envelopeCommandId,
  kind: 2,
  shape: 3,
  flags: 0,
  textureIndex: 0,
  normalizedOrigin: Object.freeze({ x: normalizedX, y: 0.1 }),
  normalizedTarget: Object.freeze({ x: normalizedX, y: 0.1 }),
  origin: Object.freeze({ x: normalizedX * 1_080, y: 192 }),
  target: Object.freeze({ x: normalizedX * 1_080, y: 192 }),
  size: 28,
  intensity: 1,
  particleDuration: 1.2,
  emissionDelay: 0,
  gravity: 90,
  drag: 0.985,
  burstDepth: 1,
});

test('re-ages deferred delay and visible life from queuedAtMs at each admission attempt', () => {
  const { engine, uploads } = makeEngine({ nowMs: 1_000 });
  queueCommand(engine, {
    seed: 700,
    admissionBatchId: 700,
    emissionDelay: 0,
    particleDuration: 1,
  });
  queueCommand(engine, {
    seed: 701,
    admissionBatchId: 701,
    emissionDelay: 0.5,
    particleDuration: 2,
    ownerToken: 'finale:1',
    expiresAtMs: 4_000,
  });

  engine._uploadSpawnCommands(1_300);
  expect(engine.spawnQueue[0].emissionDelay).toBe(0.5);

  engine._uploadSpawnCommands(1_700);
  const uploaded = new Float32Array(uploads[1]);
  expect(uploaded[22]).toBe(0);
  expect(uploaded[13]).toBeCloseTo(1.8, 5);
});

test.each([
  { nowMs: 1_600, expiresAtMs: 1_500, isOwnerActive: () => true, reason: 'expired' },
  { nowMs: 1_200, expiresAtMs: 1_500, isOwnerActive: () => false, reason: 'inactiveOwner' },
])('drops a deferred command when $reason', ({ nowMs, expiresAtMs, isOwnerActive, reason }) => {
  const { engine, uploads } = makeEngine({ nowMs: 1_000, isOwnerActive });
  queueCommand(engine, {
    seed: 1,
    ownerToken: 'preview:gone',
    expiresAtMs,
  });

  engine._uploadSpawnCommands(nowMs);

  expect(uploads).toEqual([]);
  expect(engine.spawnTelemetry.droppedByReason[reason]).toBe(1);
});

test('resolves normalized V2 points against the viewport active at admission', () => {
  const { engine, uploads } = makeEngine({ width: 1_080, height: 1_920 });
  queueCommand(engine, {
    seed: 1,
    normalizedOrigin: { x: 0.5, y: 0.12 },
    normalizedTarget: { x: 0.75, y: 0.25 },
    origin: { x: 540, y: 230.4 },
    target: { x: 810, y: 480 },
  });
  engine.setLogicalSize(1_920, 1_080);

  engine._uploadSpawnCommands(1_000);

  const uploaded = new Float32Array(uploads[0]);
  expect(uploaded[0]).toBeCloseTo(960, 5);
  expect(uploaded[1]).toBeCloseTo(129.6, 5);
  expect(uploaded[2]).toBeCloseTo(1_440, 5);
  expect(uploaded[3]).toBeCloseTo(270, 5);
});

test('caches one cue transform by generation, owner, correlation, and viewport revision', () => {
  const { engine } = makeEngine({ width: 1_080, height: 1_920 });
  engine.resourceGeneration = 4;
  const correlationManifest = Object.freeze({
    correlationId: 'cue:1',
    commands: Object.freeze([
      cueEnvelopeCommand('shell:left', 0.08),
      cueEnvelopeCommand('shell:right', 0.92),
    ]),
  });
  const entry = {
    resourceGeneration: 4,
    ownerToken: 'finale:11',
    correlationId: 'cue:1',
    envelopeCommandId: 'shell:left',
    correlationManifest,
  };

  const first = engine._getOrCreateCorrelationFit(entry, 1_000);
  const laterBatch = engine._getOrCreateCorrelationFit({ ...entry }, 1_200);
  expect(laterBatch).toBe(first);

  let manifestMismatch;
  try {
    engine._getOrCreateCorrelationFit({
      ...entry,
      envelopeCommandId: 'shell:not-in-manifest',
    }, 1_200);
  } catch (error) {
    manifestMismatch = error;
  }
  expect(manifestMismatch).toMatchObject({ code: 'CORRELATION_MANIFEST_MISMATCH' });

  engine.setLogicalSize(1_920, 1_080);
  const resized = engine._getOrCreateCorrelationFit({ ...entry }, 1_300);
  expect(resized).not.toBe(first);

  const otherOwner = engine._getOrCreateCorrelationFit({
    ...entry,
    ownerToken: 'preview:11',
  }, 1_300);
  expect(otherOwner).not.toBe(resized);

  engine.resourceGeneration = 5;
  const nextGeneration = engine._getOrCreateCorrelationFit({
    ...entry,
    resourceGeneration: 5,
  }, 1_400);
  expect(nextGeneration).not.toBe(resized);
});

test('creates a frozen singleton manifest for a direct non-V2 queue command', () => {
  const { engine } = makeEngine();
  queueCommand(engine, { seed: 900, effectId: 'standalone:900' });
  const [entry] = engine.spawnQueue;

  expect(Object.isFrozen(entry.correlationManifest)).toBe(true);
  expect(Object.isFrozen(entry.correlationManifest.commands)).toBe(true);
  expect(entry.correlationManifest.commands.every(command => Object.isFrozen(command))).toBe(true);
  expect(entry.correlationManifest.correlationId).toBe(entry.correlationId);
  expect(entry.correlationManifest.commands.map(command => command.envelopeCommandId)).toContain(
    entry.envelopeCommandId
  );
});
```

Add to `webgpu-fireworks-finale-v2-runtime.test.js`:

```js
test('retains normalized origin and target intent on every scheduled GPU event', () => {
  const engine = makeRuntime();
  engine.baseWidth = 1_080;
  engine.baseHeight = 1_920;
  const plan = v2Plan('normalized-events');
  plan.cues[0].shells = [v2Shell('normalized-shell', 'rocket', {
    origin: { x: 0.25, y: 0.8 },
    target: { x: 0.75, y: 0.2 },
  })];
  engine.handleFinale({ id: 'normalized-events', showPlan: plan, playSound: false });
  const rocket = engine.timelineQueue.find(event => event.type === 'finale-v2-rocket');
  const layer = engine.timelineQueue.find(event => event.type === 'finale-v2-layer');

  expect(rocket.normalizedOrigin).toEqual({ x: 0.25, y: 0.8 });
  expect(rocket.normalizedTarget).toEqual({ x: 0.75, y: 0.2 });
  expect(layer.context.normalizedOrigin).toEqual({ x: 0.75, y: 0.2 });
  expect(layer.context.normalizedTarget).toEqual({ x: 0.75, y: 0.2 });
});

test('keeps every shell and layer in one cue-level formation correlation group', () => {
  const engine = makeRuntime();
  const plan = v2Plan('correlated-cue');
  plan.cues[0].shells = [
    v2Shell('left-shell', 'rocket', { target: { x: 0.15, y: 0.2 } }),
    v2Shell('right-shell', 'rocket', { target: { x: 0.85, y: 0.2 } }),
  ];
  engine.handleFinale({ id: 'correlated-cue', showPlan: plan, playSound: false });
  const commands = engine.timelineQueue.filter(event => (
    event.type === 'finale-v2-rocket' || event.type === 'finale-v2-layer'
  ));
  const cueId = plan.cues[0].id;
  const correlationIds = commands.map(event => (
    event.type === 'finale-v2-layer'
      ? event.context.correlationId
      : event.correlationId
  ));
  const manifests = commands.map(event => (
    event.type === 'finale-v2-layer'
      ? event.context.correlationManifest
      : event.correlationManifest
  ));

  expect(new Set(correlationIds)).toHaveSize(1);
  expect(correlationIds[0]).toContain(cueId);
  expect(manifests[0].correlationId).toBe(correlationIds[0]);
  expect(new Set(commands.map(event => event.shellId))).toHaveSize(2);
  expect(manifests.every(manifest => manifest === manifests[0])).toBe(true);
  expect(manifests[0].commands.map(command => command.shellId)).toEqual(
    expect.arrayContaining(['left-shell', 'right-shell'])
  );
});

test('does not share a fit when authored cue ids repeat inside one finale owner', () => {
  const engine = makeRuntime();
  const plan = v2Plan('duplicate-cues');
  const template = plan.cues[0];
  plan.cues = [
    { ...template, id: 'duplicate', beatAtMs: 800, shells: [v2Shell('first-shell')] },
    { ...template, id: 'duplicate', beatAtMs: 1_600, phase: 'build', shells: [v2Shell('second-shell')] },
  ];
  engine.handleFinale({ id: 'duplicate-cues', showPlan: plan, playSound: false });
  const layers = engine.timelineQueue.filter(event => event.type === 'finale-v2-layer');

  expect(new Set(layers.map(event => event.context.correlationId))).toHaveSize(2);
  expect(layers[0].context.correlationManifest).not.toBe(layers[1].context.correlationManifest);
});
```

The regressions use the existing `makeRuntime`, `v2Plan`, and `v2Shell` helpers. They prove correlation preserves the entire formation while `shellId`, `envelopeCommandId`, and layer `effectId` remain distinct for ownership and telemetry.

Extend `webgpu-fireworks-resolution-bounds.test.js` and `webgpu-fireworks-gpu-v2-contract.test.js` to enumerate IDs 0-26, all rocket variants, both orientations, and depth -1/0/+1. Assertions must call `projectVisualEnvelope` on the final materialized command, not inspect only its center or nominal `size`.

**Step 3: Run RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-visible-envelope.test.js test/webgpu-fireworks-command-admission.test.js test/webgpu-fireworks-finale-v2-runtime.test.js test/webgpu-fireworks-resolution-bounds.test.js test/webgpu-fireworks-gpu-v2-contract.test.js
```

Expected failures: the envelope module is missing, runtime events discard normalized intent and correlate multi-shell cues by shell instead of cue, deferred commands preserve stale `emissionDelay`/`particleDuration`, and existing bounds tests admit center points without accounting for perspective, rotated quads, trails, glow, or bloom.

**Step 4: Implement the deterministic envelope registry**

Create `visible-envelope.js` with a UMD wrapper that sets `module.exports` in Jest/Node and `window.WebGPUFireworksVisibleEnvelope` in the overlay. Export exactly:

```js
{
  SHAPE_IDS,
  V2_PRIMITIVE_IDS,
  V2_GLYPH_IDS,
  ROCKET_VARIANTS,
  ENVELOPE_FLAG_BITS,
  ENVELOPE_PROFILES,
  classifyEnvelopeCommand,
  getEnvelopeProfile,
  projectVisualEnvelope,
  fitCorrelatedCommands,
  applyCorrelationTransform,
}
```

Define one immutable conservative profile for shape IDs 0 through 26 and for the real rocket variants `standard`, `avatar-head`, and `decal`. `V2_PRIMITIVE_IDS` owns 10-16, `V2_GLYPH_IDS` owns 17-26, and neither map contributes values to `ROCKET_VARIANTS`. `ENVELOPE_FLAG_BITS` is the single numeric source for trail, split, strobe, rocket-avatar-head, and V2-marker classification; `webgpu-particle-engine.js` and `show-plan-v2-runtime.js` import/read these maps and bits instead of duplicating them. `classifyEnvelopeCommand(command)` consumes the real queue encoding: numeric `kind`, numeric `shape`, `flags`, and `textureIndex`. It returns `{ category: 'shape', shapeId }` for `kind: 2`, `{ category: 'rocket', variant: 'standard' | 'avatar-head' }` for shape 8, and `{ category: 'rocket', variant: 'decal' }` for the kind-1 image/decal command. `getEnvelopeProfile(command)` always routes through this classifier. Each profile explicitly accounts for:

- maximum displacement over remaining delayed/visible life after velocity, gravity, drag, and turbulence;
- depth perspective using the same focal/projection constants as WGSL;
- rotated quad or rocket body/flame half-extents;
- trail and split tails;
- texture/decal/avatar extent;
- glow and bloom radius.

Factor shared projection constants into exported values from this module and inject the same numeric values into WGSL generation in `webgpu-particle-engine.js`; tests compare the CPU and WGSL constants so they cannot drift silently.

`projectVisualEnvelope(command, viewport)` returns:

```js
{
  left,
  top,
  right,
  bottom,
  components,
}
```

`fitCorrelatedCommands(commands, viewport, { paddingPx })` must:

1. compute the union of every command envelope at original scale;
2. translate all commands by the same `dx` and `dy` to satisfy all four padded edges when possible;
3. if the translated union is still larger than the available viewport, compute one scale in `(0, 1]`, apply it to all visual intensity/size/velocity/trail/glow/bloom fields through `admissionScale`, and recompute once;
4. return `{ commands, strategy, translation, scale, bounds, vertexClampApplied: false }`;
5. reject an unknown shape/variant with code `UNREGISTERED_VISIBLE_ENVELOPE` instead of center-admitting it.

`applyCorrelationTransform(commands, fit)` applies only `fit.translation` and `fit.scale` to a later batch from the same manifest, preserving each command's topology/direction. Do not alter individual topology points, directions, or vertices.

**Step 5: Materialize commands only at current admission**

In `show-plan-v2-runtime.js`, preserve normalized intent in addition to initial pixel values. Rocket events receive `normalizedOrigin: shell.origin` and `normalizedTarget: shell.target`. Layer contexts mirror their pixel semantics: ground layers use the normalized shell origin and target; airburst/rocket layers use the normalized shell target for both. Retain authored `cueId`, but derive a runtime-unique `cueCorrelationId` from `cueId` plus the cue's original index/occurrence, and use that as `correlationId` on every rocket event and layer context. This prevents duplicate authored cue IDs inside one owner from sharing a fit. Retain distinct `shellId`, `envelopeCommandId`, and layer `effectId` values, and build one deeply frozen `correlationManifest` per cue containing the conservative normalized envelope command for every shell rocket/decal and layer. Manifest commands already use the numeric production queue encoding (`kind`, `shape`, `flags`, `textureIndex`) consumed by `classifyEnvelopeCommand`; semantic strings are never cached as fit inputs. Every event/context from the cue holds the same manifest reference, and `correlationManifest.correlationId` equals `cueCorrelationId`.

In `webgpu-particle-engine.js`:

- change `_uploadSpawnCommands()` to `_uploadSpawnCommands(nowMs = performance.now())`;
- extract the non-mutating part of today's `_queueSpawn()` into `_normalizeSpawnEntry(command)`, which resolves string shapes to numeric IDs, flags/defaults/colors, normalized coordinates, and immutable timing values without touching `spawnQueue`;
- add `_materializeCommandForAdmission(queueEntry, nowMs)`;
- make `_queueSpawn()` retain `normalizedOrigin`, `normalizedTarget`, `correlationManifest`, and `envelopeCommandId` together with the Task 3 generation/owner fields;
- add `_queueSpawnGroup(commands, metadata)` and route `spawnRocket`, `spawnExplosion`, `spawnLayer`, and `spawnCrackle` through it. Normalize the complete command array first, then build/freeze a manifest and enqueue those same numeric entries. When a V2 cue supplies a manifest, every normalized raw command produced for that semantic member reuses its `envelopeCommandId` and the cue's exact manifest object. Otherwise the group helper assigns a runtime-unique correlation ID and builds one deeply frozen complete manifest from all normalized entries in that logical effect before queueing any of them. A direct `_queueSpawn()` call with no manifest normalizes first and gets a runtime-unique frozen singleton manifest; no legacy, gift, benchmark, interactive, or standalone path may bypass envelope fitting;
- reject stale generation, inactive owner, expired deadline, or non-positive remaining visible life before policy admission;
- calculate `deferredMs = max(0, nowMs - queuedAtMs)` against immutable `originalEmissionDelaySeconds` and `originalParticleDurationSeconds` on the queue entry;
- if `deferredMs < originalEmissionDelaySeconds * 1_000`, upload the remaining `emissionDelay` and unchanged `particleDuration`;
- otherwise upload `emissionDelay = 0` and `particleDuration = originalParticleDurationSeconds - (deferredMs / 1_000 - originalEmissionDelaySeconds)`;
- resolve normalized origins/targets against current `logicalWidth` and `logicalHeight` after resize;
- increment `viewportRevision` whenever `setLogicalSize()` changes logical width or height; clear correlation-fit cache entries on owner cancellation, generation replacement, and destroy;
- before every cache lookup, require a deeply frozen manifest whose `correlationId` equals the queue entry's runtime correlation ID and whose commands contain that entry's `envelopeCommandId`. A cache hit must also carry the identical manifest object first registered for the tuple. Throw code `CORRELATION_MANIFEST_MISMATCH` and count `unregisteredEnvelope` for absent members, duplicate/colliding manifests, or mismatched IDs instead of applying an underfit transform;
- add `_getOrCreateCorrelationFit(queueEntry, nowMs)`, keyed by the exact tuple `(resourceGeneration, ownerToken, correlationId, viewportRevision)`; materialize the complete immutable `correlationManifest` against the current viewport and call `fitCorrelatedCommands` once when the key is first seen. Manifest fitting uses every command's original maximum visible envelope: it must not age, expire, owner-filter, or otherwise drop future cue members. Only the current queue entries pass through generation, owner, deadline, and remaining-life eligibility before upload;
- group currently ready entries by `(resourceGeneration, ownerToken, correlationId)`, then apply the cached cue fit with `applyCorrelationTransform`; later `admissionBatchId` values from the same cue reuse the same fit instead of translating edge shells independently;
- drop the entire correlated group if one required command is invalid or if fitting cannot produce a finite positive shared scale. There is no separate undocumented minimum-scale gate: every finite scale in `(0, 1]` is admissible, and zero/non-finite scale fails closed as `envelopeCannotFit`;
- count drop reasons separately: `staleGeneration`, `expired`, `inactiveOwner`, `lifeExhausted`, `unregisteredEnvelope`, and `envelopeCannotFit`.

In `engine.js`, pass stable `ownerToken` values for finale, preview, benchmark, and standalone effects. Wire renderer construction with `isOwnerActive: ownerToken => this.isOwnerActive(ownerToken)` and `onOwnerInvalidated: (ownerToken, reason) => this.handleRendererOwnerInvalidated(ownerToken, reason)`, then route that handler through the existing finale/preview failure paths. Call `renderer.cancelQueuedOwner` from `completeFinale`, `failFinale`, preview cancellation, benchmark teardown, and `destroy`. Cache/group keys include `ownerToken`; two runs with the same authored `cueId` must never share a fit.

Also make `processV2Rocket()` forward `event.correlationId`, `event.normalizedOrigin`, `event.normalizedTarget`, `event.correlationManifest`, and `event.envelopeCommandId` rather than replacing correlation with `event.shellId`; `processV2Layer()` forwards the enriched runtime context. This is required for the cached cue transform to translate/scale an authored multi-shell cue as one formation rather than independently collapsing edge shells.

In `overlay.html`, load `gpu/visible-envelope.js` after the spawn-policy module and before `gpu/webgpu-particle-engine.js`.

**Step 6: Implement the current-viewport real-GPU matrix**

Replace the `admission-envelope` skipped case. For 540p, 1080p, and 4K, use both orientations and depth -1/0/+1. Enumerate shape IDs 0-26 and all three real rocket variants; render each across its visible lifetime into a transparent target with a two-pixel transparent guard band. Resize portrait to landscape after queuing but before admission for a V2 origin/target case. Admit two different batches from one two-shell cue and prove the owner/generation/viewport-keyed transform is shared; then resize and prove the manifest is refitted. Explicitly capture star, ring, and standard rocket at the upper safe-bound target. Fail if any non-exempt edge guard pixel is nontransparent, if normalized targets use the old dimensions, if correlated offsets diverge, if fit caches cross owners/generations, or if a vertex clamp flag appears.

Because below-canvas launch origins are the only documented exception, sample the top and side guard bands for ascent and all four bands after the rocket enters the viewport. Report per-resolution/per-depth coverage counts, minimum alpha-free guard width, and maximum shared scale reduction.

**Step 7: Run GREEN**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-visible-envelope.test.js test/webgpu-fireworks-command-admission.test.js test/webgpu-fireworks-finale-v2-runtime.test.js test/webgpu-fireworks-resolution-bounds.test.js test/webgpu-fireworks-gpu-v2-contract.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js admission-envelope
```

Expected result: Jest passes the complete registry and timing/resize contracts; Chrome prints `PASS admission-envelope` with `shapeIds:27`, `rocketVariants:3`, `resolutions:6`, `depths:3`, `guardViolations:0`, `staleViewportUses:0`, `crossOwnerFitUses:0`, and `vertexClampUses:0`.

**Step 8: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/visible-envelope.js app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/plugins/webgpu-fireworks/gpu/engine.js app/plugins/webgpu-fireworks/overlay.html app/test/webgpu-fireworks-visible-envelope.test.js app/test/webgpu-fireworks-command-admission.test.js app/test/webgpu-fireworks-finale-v2-runtime.test.js app/test/webgpu-fireworks-resolution-bounds.test.js app/test/webgpu-fireworks-gpu-v2-contract.test.js app/test/webgpu-fireworks-chrome-stress.manual.js app/test/fixtures/webgpu-fireworks-chrome-harness.html
git commit -m "fix(webgpu-fireworks): fit current show commands at admission"
```

---

### Task 5: Measure the full GPU frame and adapt from allocated/recent-drop pressure (G6)

**Dependencies:** Tasks 0, 2, and 3.

**Files:**

- Create: `app/test/webgpu-fireworks-gpu-telemetry.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/spawn-command-policy.js`
- Modify: `app/test/webgpu-fireworks-adaptive-degradation.test.js`
- Modify: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`

**Step 1: Write RED full-frame timestamp tests**

```js
const {
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');

afterEach(() => restoreGpuGlobals());

describe('WebGPU Fireworks GPU telemetry', () => {
  test.each([
    { bloom: true, expectedPasses: ['compute', 'scene', 'bloom-down', 'bloom-up', 'composite'] },
    { bloom: false, expectedPasses: ['compute', 'scene', 'composite'] },
  ])('timestamps the complete submitted frame when bloom=$bloom', async ({ bloom, expectedPasses }) => {
    const gpu = createFakeGpu({ timestampQuery: true });
    const renderer = makeRenderer(gpu, { bloomEnabled: bloom });
    await renderer.init();
    renderer.render(1 / 60);

    expect(gpu.framePassNames()).toEqual(expectedPasses);
    expect(gpu.firstTimestamp()).toMatchObject({ queryIndex: 0, position: 'before-first-compute' });
    expect(gpu.lastTimestamp()).toMatchObject({ queryIndex: 1, position: 'after-final-composite' });
    expect(gpu.resolveQueryCalls()).toEqual([{ firstQuery: 0, queryCount: 2 }]);
  });

  test('reports gpuFrameMs unavailable when a full-frame timestamp pair cannot be placed', async () => {
    const gpu = createFakeGpu({ timestampQuery: false });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    renderer.render(1 / 60);

    expect(renderer.getMetrics().gpuFrameMs).toBeNull();
    expect(renderer.getMetrics().gpuFrameTiming).toBe('unavailable');
  });

  test('does not timestamp or resolve a compute-only non-presented frame', async () => {
    const gpu = createFakeGpu({ timestampQuery: true });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    renderer.render(1 / 60, { present: false });

    expect(gpu.firstTimestamp()).toBeNull();
    expect(gpu.lastTimestamp()).toBeNull();
    expect(gpu.resolveQueryCalls()).toEqual([]);
  });

  test('starts a zero-simulation-step presented frame at the scene pass', async () => {
    const gpu = createFakeGpu({ timestampQuery: true });
    const renderer = makeRenderer(gpu);
    await renderer.init();
    renderer.render(1 / 60);
    renderer.render(0.001);

    expect(gpu.firstTimestamp()).toMatchObject({ queryIndex: 0, position: 'before-scene' });
    expect(gpu.lastTimestamp()).toMatchObject({ queryIndex: 1, position: 'after-final-composite' });
  });

  test('does not allocate the full bloom pyramid while bloom is disabled', async () => {
    const gpu = createFakeGpu();
    const renderer = makeRenderer(gpu, { bloomEnabled: false });
    await renderer.init();

    expect(gpu.texturesNamed('bloom')).toHaveLength(1);
    expect(gpu.textureDescriptor('fireworks-bloom-fallback').size).toEqual([1, 1, 1]);
    for (const entryPoint of ['brightExtract', 'kawaseBlur', 'bloomCopy', 'bloomUpsample']) {
      expect(gpu.pipelineLabels()).not.toContain(entryPoint);
    }

    renderer.setQuality({ bloomEnabled: true });
    expect(renderer.bloomEnabled).toBe(true);
    for (const entryPoint of ['brightExtract', 'kawaseBlur', 'bloomCopy', 'bloomUpsample']) {
      expect(gpu.pipelineLabels()).toContain(entryPoint);
    }
  });
});
```

**Step 2: Write RED allocation/drop-pressure tests**

Add to the same file:

```js
test('derives allocated particles from free count and recent drops from a delta', async () => {
  let nowMs = 1_000;
  const renderer = makeRenderer(createFakeGpu(), { maxParticles: 1_000, now: () => nowMs });
  await renderer.init();

  renderer._applyCounterReadback(new Uint32Array([250, 400, 12]), renderer.resourceGeneration, nowMs);
  expect(renderer.getMetrics()).toMatchObject({
    activeParticles: 400,
    allocatedParticles: 750,
    recentDroppedParticles: 12,
  });

  nowMs += 1_000;
  renderer._applyCounterReadback(new Uint32Array([300, 350, 15]), renderer.resourceGeneration, nowMs);
  expect(renderer.getMetrics()).toMatchObject({
    activeParticles: 350,
    allocatedParticles: 700,
    recentDroppedParticles: 3,
  });
});

test('resets cumulative-drop baselines after a resource generation change', async () => {
  const renderer = makeRenderer(createFakeGpu(), { maxParticles: 1_000 });
  await renderer.init();
  renderer._applyCounterReadback(new Uint32Array([900, 50, 100]), 1, 1_000);
  await renderer.reconfigureCapacity(2_000);
  renderer._applyCounterReadback(new Uint32Array([1_990, 5, 2]), 2, 2_000);

  expect(renderer.getMetrics().recentDroppedParticles).toBe(2);
});
```

Replace the old assertion in `webgpu-fireworks-adaptive-degradation.test.js` that deliberately ignores a large dropped count:

```js
test('degrades from allocated plus recent-drop pressure even when active count is low', () => {
  const result = deriveAdaptiveDegradationPolicy({
    adaptiveEnabled: true,
    performanceMode: 'normal',
    activeParticles: 100,
    allocatedParticles: 900,
    recentDroppedParticles: 200,
    capacity: 1_000,
    activeLayerLoad: 0.1,
  });

  expect(result.pressure).toBe(1);
  expect(result.tier).toBeGreaterThan(0);
  expect(result.reason).toBe('gpu-capacity-pressure');
});

test('adaptive opt-out reports pressure without changing quality', () => {
  const result = deriveAdaptiveDegradationPolicy({
    adaptiveEnabled: false,
    performanceMode: 'normal',
    activeParticles: 100,
    allocatedParticles: 900,
    recentDroppedParticles: 200,
    capacity: 1_000,
    activeLayerLoad: 0.1,
  });

  expect(result.pressure).toBe(1);
  expect(result.tier).toBe(0);
  expect(result.reason).toBe('adaptive-disabled');
});
```

**Step 3: Run RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-gpu-telemetry.test.js test/webgpu-fireworks-adaptive-degradation.test.js test/webgpu-fireworks-gpu-v2-contract.test.js
```

Expected failures: timestamps begin/end inside the final compute pass rather than around the entire frame; metrics omit `allocatedParticles`, `recentDroppedParticles`, and timing availability; adaptive pressure still uses active count/layer load only; bloom-off still allocates the full texture pyramid.

**Step 4: Encode and read full-frame telemetry**

In `webgpu-particle-engine.js`:

- use only current pass-descriptor `timestampWrites`: when `simulationSteps > 0`, put query 0 at `beginningOfPassWriteIndex` on the first compute pass; when `simulationSteps === 0`, put query 0 at `beginningOfPassWriteIndex` on the scene pass; put query 1 at `endOfPassWriteIndex` on the final composite pass;
- when `options.present === false`, emit neither endpoint and never resolve or pair a compute-only timestamp with a later frame. If timestamp queries are unavailable or a complete pair cannot surround the presented frame, publish no partial duration and use `gpuFrameMs: null`, `gpuFrameTiming: 'unavailable'`;
- after the composite pass, resolve exactly queries 0 and 1 in the render encoder, then read them with the Task 3 exact-buffer/generation guard;
- publish `gpuFrameTiming: 'full-frame'` only when the resolved duration spans compute, scene, optional bloom, and composite;
- read all counter values: `freeCount`, `activeCount`, and cumulative `droppedCount`;
- calculate `allocatedParticles = maxParticles - freeCount` so delayed allocated particles contribute pressure;
- calculate `recentDroppedParticles` from the non-negative cumulative delta for the current generation and decay it over a documented 2,000 ms window;
- reset cumulative baselines and recent-drop samples on generation change;
- expose `freeParticles`, `activeParticles`, `allocatedParticles`, `recentDroppedParticles`, `gpuFrameMs`, and `gpuFrameTiming` from `getMetrics()`.

When bloom is disabled, allocate a single 1x1 transparent texture labeled `fireworks-bloom-fallback` for the composite bind group and omit full-size bloom textures/passes/pipelines. Preserve the existing synchronous `setQuality(options)` API: factor bloom pipeline descriptors into `_createBloomResourcesSync()` and use `device.createRenderPipeline` (not the async pipeline factory) for a lazy off-to-on transition. Build the complete texture/pipeline/bind-group bundle off to the side, swap it atomically only after every synchronous creation succeeds, and destroy only the replaced bundle; on failure keep the old fallback/active bundle and prior `bloomEnabled` value. The on-to-off transition atomically swaps to the 1x1 fallback and destroys the full bloom bundle. No caller may observe `bloomEnabled: true` without usable bloom pipelines.

**Step 5: Drive adaptive policy from truthful pressure**

In `spawn-command-policy.js`, compute:

```js
const allocatedPressure = allocatedParticles / capacity;
const dropPressure = recentDroppedParticles / capacity;
const pressure = Math.min(1, Math.max(activeLayerLoad, allocatedPressure + dropPressure));
```

Extend the existing exported `deriveAdaptiveDegradationPolicy(input)`; do not introduce a `createPolicy().select()` wrapper. Return `pressure` and `reason` together with the existing tier policy. When `adaptiveEnabled === false`, report `reason: 'adaptive-disabled'` and the truthful pressure but derive the tier from explicit performance mode only, so pressure does not mutate quality. Otherwise pressure participates in tier selection and reports `reason: 'gpu-capacity-pressure'` when it raises the tier. Keep lane priority/required semantics unchanged. In `engine.js`, pass the new fields into both `getAdaptiveLayerPolicy` and frame-quality adaptation. Adaptive-disabled mode publishes the same pressure metrics but does not change render scale, bloom, layer admission, or particle counts.

**Step 6: Implement real-GPU telemetry/adaptive evidence**

Replace the `telemetry-adaptive` skipped case. Run idle, delayed-allocation, saturation/drop, bloom-on, and bloom-off frames. Assert a full timestamp interval or explicit unavailable state—never compute-only labeling. Verify allocation pressure rises while delayed particles are inactive, recent drops decay, bloom-off does not own full-size bloom textures, adaptive mode degrades under pressure, and off mode leaves quality unchanged.

**Step 7: Run GREEN**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-gpu-telemetry.test.js test/webgpu-fireworks-adaptive-degradation.test.js test/webgpu-fireworks-gpu-v2-contract.test.js test/webgpu-fireworks-gpu-capacity.test.js test/webgpu-fireworks-gpu-lifecycle.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js telemetry-adaptive
```

Expected result: Jest passes; Chrome prints `PASS telemetry-adaptive` with `gpuFrameTiming` equal to `full-frame` or `unavailable`, no `compute-only` result, delayed allocation pressure above active pressure, recent-drop decay to zero, and no quality change in opt-out mode.

**Step 8: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/plugins/webgpu-fireworks/gpu/engine.js app/plugins/webgpu-fireworks/gpu/spawn-command-policy.js app/test/webgpu-fireworks-gpu-telemetry.test.js app/test/webgpu-fireworks-adaptive-degradation.test.js app/test/webgpu-fireworks-gpu-v2-contract.test.js app/test/webgpu-fireworks-chrome-stress.manual.js app/test/fixtures/webgpu-fireworks-chrome-harness.html
git commit -m "fix(webgpu-fireworks): report full-frame GPU pressure"
```

---

### Task 6: Generate CPU and WGSL Boykisser geometry from one semantic source (C6)

**Dependencies:** Task 0; land after Tasks 1-5 so the final `all` Chrome case is meaningful. Choreography/planner/UI changes are explicitly out of scope.

**Files:**

- Create: `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`
- Create: `app/test/webgpu-fireworks-boykisser-geometry.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/overlay.html`
- Modify: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`

**Step 1: Write RED semantic geometry tests**

```js
const {
  BOYKISSER_FEATURES,
  BOYKISSER_ROLES,
  BOYKISSER_COLORS,
  sampleBoykisser,
  sampleBoykisserSet,
  buildBoykisserWgsl,
  geometrySignature,
} = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

const REQUIRED_FEATURES = [
  'head-outline',
  'forehead-tuft',
  'left-ear',
  'right-ear',
  'left-inner-ear',
  'right-inner-ear',
  'left-crescent-eye',
  'right-crescent-eye',
  'centered-nose',
  'w-smile',
  'tongue',
  'left-blush',
  'right-blush',
];

describe('WebGPU Fireworks semantic Boykisser geometry', () => {
  test('defines every approved landmark with an explicit semantic color role', () => {
    expect(Object.keys(BOYKISSER_FEATURES)).toEqual(REQUIRED_FEATURES);
    expect(BOYKISSER_ROLES).toEqual({ HEAD: 0, FACE: 1, PINK: 2 });
    for (const feature of Object.values(BOYKISSER_FEATURES)) {
      expect(feature).toMatchObject({ role: expect.any(Number), weight: expect.any(Number) });
      expect(Object.values(BOYKISSER_ROLES)).toContain(feature.role);
      expect(feature.points.length).toBeGreaterThan(0);
    }
    expect(BOYKISSER_COLORS).toEqual({
      HEAD: [1, 1, 1],
      FACE: [0.08, 0.08, 0.1],
      PINK: [1, 0.32, 0.58],
    });
  });

  test.each([13, 20, 32])('retains every landmark at low density %i', (count) => {
    const samples = sampleBoykisserSet(count, 12345);
    expect(samples).toHaveLength(count);
    expect(new Set(samples.map((sample) => sample.feature))).toEqual(new Set(REQUIRED_FEATURES));
  });

  test('keeps paired features mirrored and the face centered', () => {
    const features = BOYKISSER_FEATURES;
    expect(mirrorPoints(features['left-ear'].points)).toEqual(features['right-ear'].points);
    expect(mirrorPoints(features['left-inner-ear'].points)).toEqual(features['right-inner-ear'].points);
    expect(mirrorPoints(features['left-crescent-eye'].points)).toEqual(features['right-crescent-eye'].points);
    expect(mirrorPoints(features['left-blush'].points)).toEqual(features['right-blush'].points);
    expect(featureCenterX(features['centered-nose'])).toBeCloseTo(0, 6);
    expect(featureCenterX(features['w-smile'])).toBeCloseTo(0, 6);
    expect(featureCenterX(features.tongue)).toBeCloseTo(0, 6);
  });

  test('uses one deterministic source for CPU samples and generated WGSL', () => {
    const wgsl = buildBoykisserWgsl();
    expect(wgsl).toContain(`// geometry-signature:${geometrySignature}`);
    expect(wgsl).toContain('fn boykisserPoint(index: u32, count: u32, seed: u32) -> vec2f');
    expect(wgsl).toContain('fn boykisserRole(index: u32, count: u32, seed: u32) -> u32');
    for (const featureName of REQUIRED_FEATURES) {
      expect(wgsl).toContain(`// feature:${featureName}`);
    }
    expect(sampleBoykisser(5, 32, 12345)).toEqual(sampleBoykisserSet(32, 12345)[5]);
  });
});
```

Define `mirrorPoints` and `featureCenterX` as local numeric helpers in the test. Add a renderer assertion to `webgpu-fireworks-gpu-v2-contract.test.js`:

```js
const {
  createFakeGpu,
  makeRenderer,
  restoreGpuGlobals,
} = require('./helpers/webgpu-fireworks-gpu-harness');
const {
  geometrySignature,
} = require('../plugins/webgpu-fireworks/gpu/boykisser-geometry');

test('injects shared Boykisser WGSL and has no inline index-band color heuristic', async () => {
  const gpu = createFakeGpu();
  const renderer = makeRenderer(gpu);
  try {
    await renderer.init();
    const shader = gpu.shaderCode('fireworks-compute-wgsl');

    expect(shader).toContain(`// geometry-signature:${geometrySignature}`);
    expect(shader).toContain('boykisserRole(');
    expect(shader).not.toMatch(/command\.shape\s*==\s*25u[\s\S]{0,400}glyphT\s*</);
  } finally {
    renderer.destroy();
    restoreGpuGlobals();
  }
});
```

**Step 2: Run RED**

```powershell
npm test -- --runInBand test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-gpu-v2-contract.test.js
```

Expected failures: the shared geometry module is missing; the compute shader owns a hand-written `boykisserPoint` and index-band color selection with no semantic landmark contract or shared signature.

**Step 3: Implement one semantic geometry source**

Create `boykisser-geometry.js` with a UMD wrapper that sets `module.exports` in Jest/Node and `window.WebGPUFireworksBoykisserGeometry` in the overlay. Export exactly:

```js
{
  BOYKISSER_FEATURES,
  BOYKISSER_ROLES,
  BOYKISSER_COLORS,
  sampleBoykisser,
  sampleBoykisserSet,
  buildBoykisserWgsl,
  geometrySignature,
}
```

The ordered `BOYKISSER_FEATURES` object contains explicit points/polylines or curve control points for:

- a rounded white cat head outline;
- a forehead tuft;
- paired triangular outer ears;
- paired pink inner ears;
- paired dark crescent eyes;
- a centered dark nose;
- a dark W-shaped smile;
- a centered pink tongue;
- paired pink blush marks.

Assign roles by meaning, not index ranges: outer head/tuft/ears use `HEAD`, eyes/nose/smile use `FACE`, and inner ears/tongue/blush use `PINK`. Keep `BOYKISSER_COLORS` as the canonical role palette and let the renderer combine those roles with the show palette only through one documented tint rule.

Sampling is deterministic from `(index, count, seed)`. The first 13 indices select one anchor from each required feature in the declared order; remaining indices use deterministic weighted sampling within the same feature definitions. The WGSL generator serializes those same definitions and the same selection algorithm. Compute `geometrySignature` from canonical serialized geometry data so tests detect CPU/WGSL drift.

In `webgpu-particle-engine.js`:

- import/read `WebGPUFireworksBoykisserGeometry` in the existing CommonJS/browser pattern;
- inject `buildBoykisserWgsl()` into the compute shader string;
- remove the duplicated inline `boykisserPoint` implementation;
- use `boykisserRole` to select semantic color instead of particle-index bands;
- retain shape ID 25 and the existing protocol capability name `boykisser-v1`.

In `overlay.html`, load `gpu/boykisser-geometry.js` before `gpu/webgpu-particle-engine.js`.

**Step 4: Implement recognizable real-GPU evidence**

Replace the `boykisser` skipped case. Render deterministic counts 13, 20, 32, and the normal hero density at 540p, 1080p, and 4K in both orientations. Read back/capture the transparent canvas and use feature-specific sample windows derived from `BOYKISSER_FEATURES` to assert nontransparent pixels and expected dominant role colors for head, both inner ears, both eyes, nose, both W arcs, tongue, and both blush marks. Check left/right symmetry within one logical pixel after projection and ensure the C7 guard band remains clear.

This automated case proves semantic landmarks and shader/source parity; the separate choreography/UI plan still owns artistic composition and the real OBS human-readability gate. Do not modify show choreography, planner presets, settings UI, or designer UI in this task.

**Step 5: Run GREEN and the complete isolated Chrome suite**

```powershell
npm test -- --runInBand --detectOpenHandles test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-gpu-v2-contract.test.js test/webgpu-fireworks-visible-envelope.test.js
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js boykisser
node test/webgpu-fireworks-chrome-stress.manual.js all
```

Expected result: Jest passes; `PASS boykisser` reports every required landmark at all densities/resolutions/orientations with zero symmetry and guard violations; `PASS all` has the exact top-level shape `{ hardware, cases }`, its hardware verdict proves non-fallback D3D11/D3D12 on the resolved Chrome executable, and its six named cases contain no skipped result while covering atlas, capacity, recovery, admission-envelope, telemetry-adaptive, and Boykisser.

**Step 6: Commit**

```powershell
git add app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/plugins/webgpu-fireworks/overlay.html app/test/webgpu-fireworks-boykisser-geometry.test.js app/test/webgpu-fireworks-gpu-v2-contract.test.js app/test/webgpu-fireworks-chrome-stress.manual.js app/test/fixtures/webgpu-fireworks-chrome-harness.html
git commit -m "fix(webgpu-fireworks): share semantic Boykisser geometry"
```

---

## Final verification before handing GPU work to the broader release plan

Run from `app/`:

```powershell
npm test -- --runInBand --detectOpenHandles --testPathPattern=webgpu-fireworks
npm run build:css
npm run lint
$env:LTTH_CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node test/webgpu-fireworks-chrome-stress.manual.js all
```

Then run from the repository root:

```powershell
git diff --check
git status --short
git log -7 --oneline
```

Required evidence:

- the focused WebGPU suite exits naturally without `--forceExit` or open handles;
- every G1-G7 and C6-C7 regression is present and green;
- the terminal `PASS all` JSON has exact `{ hardware, cases }` shape, proves `hardware.verdict === 'hardware-d3d'`, `hardware.backend` is D3D11/D3D12, `hardware.fallback === false`, and all six cases pass without skips;
- no live LTTH process, live Socket.IO client, OBS source, runtime database, user configuration, upload directory, or log directory was touched;
- the six task commits plus the harness commit are narrow and appear in dependency order;
- pre-existing generated docs/locales/sitemap changes remain unstaged and unmodified by this work;
- the final diff contains only the GPU implementation, its overlay script loading, focused tests/harness, this plan/spec, and any separately authorized integration changes.

Do not declare the complete release done from this plan. Hand the green GPU evidence to the separate choreography/planner/UI/release plan for deterministic show matrices, browser settings/designer accessibility, real OBS 54-combination review, documentation/version alignment, and final release publication.
