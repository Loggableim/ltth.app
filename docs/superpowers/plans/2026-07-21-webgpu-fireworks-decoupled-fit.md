# WebGPU Fireworks Decoupled Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep rocket tips aligned with their bursts without allowing the rocket travel envelope to shrink or reposition burst geometry.

**Architecture:** Add a mixed rocket/burst fitter beside the existing homogeneous visible-envelope fitter. It fits burst commands first, reuses only their positional transform for rocket commands, and independently reduces rocket visual geometry when necessary; the renderer selects this fitter for manifests containing both command categories.

**Tech Stack:** CommonJS JavaScript, Jest, existing WebGPU Fireworks visible-envelope and correlation-manifest APIs.

## Global Constraints

- The rocket tip must arrive at the explosion center.
- The explosion must retain the scale and geometry selected for the burst itself.
- Rocket travel fitting must not change explosion intensity, particle size, gravity, wind, curve, or other burst geometry.
- The combined result must remain inside the existing visible-canvas contract.
- OBS configuration, color handling, unrelated plugins, and persistent settings remain unchanged.
- Preserve immutable correlation manifests and cache identity.

---

### Task 1: Add a decoupled rocket/burst visible-envelope fit

**Files:**
- Modify: `app/plugins/webgpu-fireworks/gpu/visible-envelope.js:395-557`
- Test: `app/test/webgpu-fireworks-visible-envelope.test.js`

**Interfaces:**
- Consumes: `fitCorrelatedCommands(commands, viewport, options)` and `getEnvelopeProfile(command)`.
- Produces: `fitRocketBurstCommands(commands, viewport, options)`, returning the existing fit fields plus `rocketScale`; `scale` remains the burst scale.

- [ ] **Step 1: Write the failing visible-envelope regression test**

Import `fitRocketBurstCommands` and add:

```javascript
test('fits rocket geometry independently without shrinking its correlated star burst', () => {
  const viewport = { width: 1080, height: 1920 };
  const target = { x: 540, y: 864 };
  const rocket = rocketCommand('standard', {
    origin: { x: 540, y: 1920 },
    target,
    particleDuration: 1.2375,
    duration: 1.2375,
    size: 8,
    curve: -63,
  });
  const burst = shapeCommand(3, viewport, 0, 0.5);
  Object.assign(burst, {
    origin: target,
    target,
    size: 39.69,
    intensity: 1.5,
    particleDuration: 0.65,
  });
  const paddingPx = 108;
  const burstOnly = fitCorrelatedCommands([burst], viewport, { paddingPx });
  const mixed = fitRocketBurstCommands([rocket, burst], viewport, { paddingPx });
  const [fittedRocket, fittedBurst] = mixed.commands;

  expect(fittedBurst.admissionScale).toBeCloseTo(burstOnly.commands[0].admissionScale, 7);
  expect(fittedBurst.intensity).toBeCloseTo(burstOnly.commands[0].intensity, 7);
  expect(fittedBurst.size).toBeCloseTo(burstOnly.commands[0].size, 7);
  expect(fittedRocket.target.x).toBeCloseTo(fittedBurst.origin.x, 7);
  expect(fittedRocket.target.y).toBeCloseTo(fittedBurst.origin.y, 7);
  mixed.commands.forEach(command => {
    const bounds = projectVisualEnvelope(command, viewport);
    expect(bounds.left).toBeGreaterThanOrEqual(paddingPx - 1e-5);
    expect(bounds.top).toBeGreaterThanOrEqual(paddingPx - 1e-5);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width - paddingPx + 1e-5);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height - paddingPx + 1e-5);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `cd app; npx jest test/webgpu-fireworks-visible-envelope.test.js --runInBand`

Expected: FAIL because `fitRocketBurstCommands` is not defined/exported.

- [ ] **Step 3: Implement the minimal decoupled fitter**

Add a fixed-position solver:

```javascript
function solveAtFixedPosition(commands, viewport, padding, translation, positionTransform, scale) {
  const transformed = transformCommands(commands, translation, scale, positionTransform);
  const bounds = unionBounds(transformed, viewport);
  return within(bounds, viewport, padding) ? { commands: transformed, bounds } : null;
}
```

Add the mixed fitter:

```javascript
function fitRocketBurstCommands(commands, viewport, options = {}) {
  if (!Array.isArray(commands) || commands.length === 0) {
    throw envelopeError('A visible-envelope fit requires at least one command.', 'ENVELOPE_CANNOT_FIT');
  }
  const indexed = commands.map((command, index) => ({
    command,
    index,
    category: getEnvelopeProfile(command).category,
  }));
  const rockets = indexed.filter(item => item.category === 'rocket');
  const bursts = indexed.filter(item => item.category !== 'rocket');
  if (rockets.length === 0 || bursts.length === 0) {
    return fitCorrelatedCommands(commands, viewport, options);
  }
  const normalizedViewport = {
    ...viewport,
    width: Math.max(1, finite(viewport?.width, 1)),
    height: Math.max(1, finite(viewport?.height, 1)),
  };
  const padding = Math.max(0, finite(options.paddingPx, 2));
  const burstFit = fitCorrelatedCommands(
    bursts.map(item => item.command),
    normalizedViewport,
    options
  );
  const rocketCommands = rockets.map(item => item.command);
  let rocketSolved = solveAtFixedPosition(
    rocketCommands,
    normalizedViewport,
    padding,
    burstFit.translation,
    burstFit.positionTransform,
    1
  );
  let rocketScale = 1;
  if (!rocketSolved) {
    let low = 0;
    let high = 1;
    for (let iteration = 0; iteration < 36; iteration++) {
      const candidate = (low + high) * 0.5;
      const candidateFit = solveAtFixedPosition(
        rocketCommands,
        normalizedViewport,
        padding,
        burstFit.translation,
        burstFit.positionTransform,
        candidate
      );
      if (candidateFit) {
        low = candidate;
        rocketSolved = candidateFit;
      } else {
        high = candidate;
      }
    }
    rocketScale = low;
  }
  if (!rocketSolved || rocketScale <= 0) {
    throw envelopeError(
      'The rocket visible envelope cannot fit the burst transform.',
      'ENVELOPE_CANNOT_FIT'
    );
  }
  const fittedByIndex = new Map();
  bursts.forEach((item, index) => fittedByIndex.set(item.index, burstFit.commands[index]));
  rockets.forEach((item, index) => fittedByIndex.set(item.index, rocketSolved.commands[index]));
  const fittedCommands = indexed.map(item => fittedByIndex.get(item.index));
  const bounds = unionBounds(fittedCommands, normalizedViewport);
  return {
    commands: fittedCommands,
    strategy: 'decoupled',
    translation: burstFit.translation,
    scale: burstFit.scale,
    rocketScale,
    bounds: Object.freeze({ ...bounds }),
    positionTransform: burstFit.positionTransform,
    vertexClampApplied: false,
  };
}
```

Export `fitRocketBurstCommands` beside `fitCorrelatedCommands`. Do not change `fitCorrelatedCommands` or `applyCorrelationTransform`.

- [ ] **Step 4: Run the visible-envelope suite and verify GREEN**

Run: `cd app; npx jest test/webgpu-fireworks-visible-envelope.test.js --runInBand`

Expected: PASS, including the new portrait regression and all 540 registry cases.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- app/plugins/webgpu-fireworks/gpu/visible-envelope.js app/test/webgpu-fireworks-visible-envelope.test.js
git commit -m "fix(webgpu-fireworks): decouple rocket and burst fits"
```

---

### Task 2: Use the decoupled fit for runtime manifests

**Files:**
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js:8-38,2071-2112`
- Test: `app/test/webgpu-fireworks-gift-command-lanes.test.js`

**Interfaces:**
- Consumes: `fitRocketBurstCommands(commands, viewport, options)`.
- Produces: cached manifest fits with burst-only explosion scale and the existing shared target/manifest identity.

- [ ] **Step 1: Write the failing runtime regression test**

Import `fitCorrelatedCommands` and `projectVisualEnvelope`, then add the complete runtime test:

```javascript
test('does not let a portrait rocket path shrink the correlated explosion', async () => {
  const runtime = makeRuntime();
  const renderer = new WebGPUParticleEngine({ width: 1080, height: 1920 }, {});
  renderer.initialized = true;
  runtime.renderer = renderer;
  runtime.baseWidth = 1080;
  runtime.baseHeight = 1920;
  runtime.prepareImages = jest.fn().mockResolvedValue({
    giftTexture: 0,
    avatarTexture: 0,
    avatarChance: 0.3,
  });
  const plan = await runtime.handleTrigger({
    id: 'portrait-decoupled-fit',
    shape: 'star',
    colors: ['#ffffff'],
    positionMode: 'exact',
    position: { x: 0.5, y: 0.45 },
    origin: { x: 0.5, y: 1 },
    intensity: 1.5,
    particleCount: 50,
    playSound: false,
    forceRocket: true,
    seed: 777,
  });
  runtime.processLaunch(plan, plan.launchAt, plan.launchAt);
  runtime.processExplosion(plan.explosion, plan, plan.explodeAt, plan.explodeAt);
  const rocket = renderer.spawnQueue.find(command => command.kind === 1);
  const explosions = renderer.spawnQueue.filter(command => command.kind === 2);
const fit = renderer._getOrCreateCorrelationFit(rocket, plan.launchAt);
const paddingPx = renderer._visibleEnvelopePaddingPx(rocket.correlationManifest.commands);
const explosionOnly = fitCorrelatedCommands(
  rocket.correlationManifest.commands.filter(command => command.kind === 2),
  { width: 1080, height: 1920, renderMinimum: 1080, renderMaximum: 1920 },
  { paddingPx }
);
const fittedRocket = fit.commands.find(command =>
  command.envelopeCommandId === rocket.envelopeCommandId
);
const fittedExplosion = fit.commands.find(command =>
  command.envelopeCommandId === explosions[0].envelopeCommandId
);

expect(fit.strategy).toBe('decoupled');
expect(fittedExplosion.admissionScale).toBeCloseTo(
  explosionOnly.commands[0].admissionScale,
  7
);
expect(fittedRocket.target.x).toBeCloseTo(fittedExplosion.origin.x, 7);
expect(fittedRocket.target.y).toBeCloseTo(fittedExplosion.origin.y, 7);
fit.commands.forEach(command => {
  const bounds = projectVisualEnvelope(command, { width: 1080, height: 1920 });
  expect(bounds.left).toBeGreaterThanOrEqual(paddingPx - 1e-5);
  expect(bounds.top).toBeGreaterThanOrEqual(paddingPx - 1e-5);
  expect(bounds.right).toBeLessThanOrEqual(1080 - paddingPx + 1e-5);
  expect(bounds.bottom).toBeLessThanOrEqual(1920 - paddingPx + 1e-5);
});
});
```

- [ ] **Step 2: Run the runtime test and verify RED**

Run: `cd app; npx jest test/webgpu-fireworks-gift-command-lanes.test.js --runInBand`

Expected: FAIL because the renderer still returns `uniform-scale` and applies the rocket-derived scale to explosion commands.

- [ ] **Step 3: Route manifest fitting through the new function**

Add `fitRocketBurstCommands` to the visible-envelope destructuring and fallback in `webgpu-particle-engine.js`. Replace only the call at `_getOrCreateCorrelationFit()`:

```javascript
const fit = fitRocketBurstCommands(commands, {
    width: this.logicalWidth,
    height: this.logicalHeight,
    renderMinimum: Math.min(this.canvas.width || this.logicalWidth, this.canvas.height || this.logicalHeight),
    renderMaximum: Math.max(this.canvas.width || this.logicalWidth, this.canvas.height || this.logicalHeight)
}, { paddingPx: this._visibleEnvelopePaddingPx(commands) });
```

Do not alter manifest creation, queue membership, cache keys, command IDs, or scheduling.

- [ ] **Step 4: Run focused suites**

Run: `cd app; npx jest test/webgpu-fireworks-gift-command-lanes.test.js test/webgpu-fireworks-visible-envelope.test.js --runInBand`

Expected: PASS with shared-target, immutable-manifest, registry matrix, and burst-scale assertions.

- [ ] **Step 5: Run adjacent WebGPU suites**

Run: `cd app; npx jest test/webgpu-fireworks-native.test.js test/webgpu-fireworks-finale-runtime.test.js test/webgpu-fireworks-engine-optimizations.test.js --runInBand`

Expected: PASS without changed snapshots or warnings.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/test/webgpu-fireworks-gift-command-lanes.test.js
git commit -m "fix(webgpu-fireworks): preserve burst geometry after launch"
```

---

### Task 3: Verify the live OBS reproduction

**Files:**
- No source changes.

**Interfaces:**
- Consumes: active LTTH server, OBS WebGPU source, and manual trigger API.
- Produces: evidence that the white star is complete after a rocket flight and particle-drop metrics remain zero.

- [ ] **Step 1: Narrowly reload only the `fireworks` OBS browser source**

Do not restart unrelated stream tooling.

- [ ] **Step 2: Trigger the deterministic reproduction**

POST:

```json
{
  "shape": "star",
  "intensity": 1.5,
  "positionMode": "exact",
  "position": { "x": 0.5, "y": 0.45 },
  "origin": { "x": 0.5, "y": 1.0 },
  "visualStyle": "premium-hybrid",
  "colors": ["#FFFFFF"],
  "forceRocket": true,
  "combo": 1,
  "playSound": false,
  "seed": 777
}
```

- [ ] **Step 3: Compare against the instant control**

Trigger the same payload with `forceRocket: false` and `combo: 8`. Expected: equivalent burst geometry and scale, with the real rocket tip reaching the burst center.

- [ ] **Step 4: Check metrics and repository scope**

Run:

```powershell
Invoke-RestMethod 'http://127.0.0.1:3000/api/webgpu-fireworks/status' | ConvertTo-Json -Depth 8
git diff --check
git status --short
```

Expected: renderer `ready`, `droppedParticles: 0`, no whitespace errors, and only planned WebGPU Fireworks/test files plus pre-existing unrelated changes.

- [ ] **Step 5: Lint touched JavaScript**

Run: `cd app; npx eslint plugins/webgpu-fireworks/gpu/visible-envelope.js plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js test/webgpu-fireworks-visible-envelope.test.js test/webgpu-fireworks-gift-command-lanes.test.js`

Expected: exit code 0 with no errors.
