# WebGPU Emoji Collision Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WebGPU Emoji Rain contacts repel cleanly without visual overlap or impact flashes.

**Architecture:** Split the current in-place `simulate` compute pass into integration, spatial-index construction, two read-from-source/write-to-target collision passes, and final active-particle compaction. The primary particle buffer remains the rendering source; a fixed-size scratch buffer receives the first solver iteration. The sprite shader no longer consumes the transient impact component.

**Tech Stack:** CommonJS JavaScript, inline WGSL compute/sprite shaders, WebGPU, Jest.

## Global Constraints

- Keep the active renderer in `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js` and preserve its fixed `GPU_CAPACITY` allocation model.
- Do not change chat commands, Superfan gating, the server process, or general renderer-profile behavior.
- Keep `gpu_collisions_enabled: false` as a no-collision copy path.
- Remove impact rays and geometry pulses for every particle, including floor contact.
- Verify with focused Jest tests and reload only `webgpu-emoji-rain` after local verification.

---

### Task 1: Add collision-pipeline regression coverage

**Files:**
- Create: `app/test/webgpu-emoji-rain-collision-solver.test.js`
- Read: `app/test/webgpu-emoji-rain-renderer-parity.test.js`
- Read: `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js`

**Interfaces:**
- Consumes: the inline `COMPUTE_WGSL` and `SPRITE_WGSL` strings in the renderer source.
- Produces: source-level regression coverage for the ordered `integrate -> build -> solveToScratch -> buildScratch -> solveToPrimary -> compact -> finalize` pipeline and the no-impact rendering contract.

- [ ] **Step 1: Write the failing test**

```js
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'plugins', 'webgpu-emoji-rain', 'gpu', 'webgpu-emoji-engine.js');
const source = fs.readFileSync(SOURCE_PATH, 'utf8');

test('uses two buffered collision solves and never renders an impact pulse', () => {
  const dispatch = source.slice(source.indexOf('const computeDispatches = ['), source.indexOf('compute.end()'));
  expect(source).toContain('fn collisionRadius');
  expect(source).toContain('fn integrateParticles');
  expect(source).toContain('fn resolveCollisions');
  expect(source).toContain('fn compactActiveParticles');
  expect(dispatch).toContain("['integrate', particleDispatch]");
  expect(dispatch).toContain("['solveToScratch', particleDispatch]");
  expect(dispatch).toContain("['buildScratch', particleDispatch]");
  expect(dispatch).toContain("['solveToPrimary', particleDispatch]");
  expect(dispatch).toContain("['compact', particleDispatch]");
  expect(source).toContain('this.collisionBuffer');
  expect(source).not.toContain('impactSpeed =');
  expect(source).not.toContain('input.impact > 0.001');
  expect(source).not.toContain('particle.params0.w * 0.14');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand test/webgpu-emoji-rain-collision-solver.test.js`

Expected: FAIL because the existing renderer has only `simulate`, no collision scratch buffer, and still contains impact code.

- [ ] **Step 3: Commit the test-only change**

```powershell
git add app/test/webgpu-emoji-rain-collision-solver.test.js
git commit -m "test: cover stable webgpu emoji collisions"
```

### Task 2: Implement deterministic buffered collision resolution

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js:60-486`
- Modify: `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js:773-970`
- Modify: `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js:1323-1447`
- Modify: `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js:1653-1680`
- Test: `app/test/webgpu-emoji-rain-collision-solver.test.js`
- Test: `app/test/webgpu-emoji-rain-renderer-parity.test.js`

**Interfaces:**
- Consumes: `particleBuffer` as the live/rendered particle state and `collisionBuffer` as one fixed-capacity scratch state.
- Produces: `integrateParticles`, `buildGrid`, `resolveCollisions`, and `compactActiveParticles` compute entry points; named primary/scratch bind groups; a final `particleBuffer` state suitable for the existing sprite bind group.

- [ ] **Step 1: Keep the test failing before implementation**

Run: `npm test -- --runInBand test/webgpu-emoji-rain-collision-solver.test.js`

Expected: FAIL with the missing pipeline and no-impact assertions from Task 1.

- [ ] **Step 2: Split the WGSL pass and define symmetric contact math**

Replace `simulate` with these named responsibilities:

```wgsl
fn collisionRadius(particle: Particle) -> f32 {
  return max(3.0, particle.size * 0.46);
}

fn isCollidable(particle: Particle) -> bool {
  return particle.kind != 3u && particle.kind != 5u;
}

fn contactNormal(delta: vec2<f32>, distance: f32, index: u32, otherIndex: u32) -> vec2<f32> {
  if (distance > 0.001) { return delta / distance; }
  return select(vec2<f32>(-1.0, 0.0), vec2<f32>(1.0, 0.0), index < otherIndex);
}

@compute @workgroup_size(64)
fn resolveCollisions(@builtin(global_invocation_id) gid: vec3<u32>) {
  let index = gid.x;
  if (index >= frame.logicalLimit) { return; }
  var particle = particles[index];
  if ((particle.flags & 1u) == 0u || frame.collisionScale <= 0.0 || !isCollidable(particle)) {
    solvedParticles[index] = particle;
    return;
  }
  let home = cellFor(particle.position);
  let radius = collisionRadius(particle);
  let reach = vec2<i32>(
    max(1, i32(ceil((radius + frame.maxCollisionRadius) / frame.cellSize.x))),
    max(1, i32(ceil((radius + frame.maxCollisionRadius) / frame.cellSize.y)))
  );
  var positionCorrection = vec2<f32>(0.0);
  var velocityCorrection = vec2<f32>(0.0);
  for (var oy: i32 = max(-reach.y, -i32(home.y)); oy <= min(reach.y, i32(frame.gridSize.y) - 1 - i32(home.y)); oy++) {
    for (var ox: i32 = max(-reach.x, -i32(home.x)); ox <= min(reach.x, i32(frame.gridSize.x) - 1 - i32(home.x)); ox++) {
      var neighbour = atomicLoad(&gridHeads[cellIndex(vec2<u32>(u32(i32(home.x) + ox), u32(i32(home.y) + oy)))]);
      loop {
        if (neighbour < 0) { break; }
        let otherIndex = u32(neighbour);
        let other = particles[otherIndex];
        neighbour = nextIndices[otherIndex];
        if (otherIndex == index || (other.flags & 1u) == 0u || !isCollidable(other)) { continue; }
        let delta = particle.position - other.position;
        let distance = sqrt(max(dot(delta, delta), 0.0));
        let minDistance = radius + collisionRadius(other);
        if (distance >= minDistance) { continue; }
        let normal = contactNormal(delta, distance, index, otherIndex);
        let selfCanMove = canMoveAlongBounds(particle, radius, normal);
        let otherCanMove = canMoveAlongBounds(other, collisionRadius(other), -normal);
        var correctionShare = 0.5;
        if (!selfCanMove && otherCanMove) { correctionShare = 0.0; }
        if (selfCanMove && !otherCanMove) { correctionShare = 1.0; }
        if (!selfCanMove && !otherCanMove) { correctionShare = 0.0; }
        positionCorrection += normal * (minDistance - distance) * correctionShare;
        let closingSpeed = dot(particle.velocity - other.velocity, normal);
        if (closingSpeed < 0.0) {
          velocityCorrection -= normal * closingSpeed * (1.0 + min(particle.params0.x, other.params0.x)) * correctionShare;
        }
      }
    }
  }
  particle.position = constrainToBounds(particle, particle.position + positionCorrection);
  particle.velocity += velocityCorrection;
  solvedParticles[index] = particle;
}
```

`integrateParticles` owns gravity, wind, boundaries, floor bounce, lifetime expiry, and `particle.params0.w = 0.0`. `compactActiveParticles` is the only pass that increments `counters[0]` and fills `activeIndices`. Use a single `collisionRadius` function for both contact partners, skip out-of-range cells instead of clamping them, and choose an index-order normal when two positions coincide.

Keep the existing 64-by-36 grid, but derive reach from the active collision radius plus the shared conservative maximum collision radius. Visit every linked-list entry in the bounded grid range while accumulating corrections from immutable source state; the final review contract below supersedes the historical two-cell/eight-entry sketch in this task.

- [ ] **Step 3: Add the scratch buffer and explicit bind groups**

```js
this.collisionBuffer = this.device.createBuffer({
  label: 'emoji-particles-collision-scratch',
  size: GPU_CAPACITY * PARTICLE_STRIDE,
  usage: U.STORAGE | U.COPY_DST | U.COPY_SRC
});
```

Create bind groups so `solveToScratch` reads `particleBuffer` and writes `collisionBuffer`, while `solveToPrimary` reads `collisionBuffer` and writes `particleBuffer`. Create a `buildScratch` bind group that gives `buildGrid` the scratch buffer. Clear/release the scratch buffer alongside the primary buffer.

- [ ] **Step 4: Dispatch compute stages in stable order**

```js
const particleDispatch = Math.ceil(GPU_CAPACITY / 64);
const computeDispatches = [
  ['clear', Math.ceil(GRID_CELLS / 64)],
  ['spawn', Math.ceil(spawnCount / 64)],
  ['integrate', particleDispatch],
  ['build', particleDispatch],
  ['solveToScratch', particleDispatch],
  ['clearGridOnly', Math.ceil(GRID_CELLS / 64)],
  ['buildScratch', particleDispatch],
  ['solveToPrimary', particleDispatch],
  ['compact', particleDispatch],
  ['finalize', 1]
];
```

The beginning `clear` resets frame counters and the first grid. `clearGridOnly` resets only grid heads before rebuilding from the scratch state, preserving the active-particle counter until compaction completes.

- [ ] **Step 5: Remove all impact rendering**

Remove the `impact` varying from `VertexOutput`, remove the impact factor from the vertex geometry scale, and delete the fragment branch guarded by `input.impact > 0.001`. Keep `params0.w` encoded as zero to retain the particle ABI without allowing a transient visual pulse.

- [ ] **Step 6: Run focused tests and static checks**

Run:

```powershell
npm test -- --runInBand test/webgpu-emoji-rain-collision-solver.test.js test/webgpu-emoji-rain-renderer-parity.test.js
npx eslint plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js test/webgpu-emoji-rain-collision-solver.test.js
node --check plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js
```

Expected: all selected Jest tests pass, ESLint exits zero, and `node --check` exits zero.

- [ ] **Step 7: Commit the implementation**

```powershell
git add app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js app/test/webgpu-emoji-rain-collision-solver.test.js docs/superpowers/plans/2026-07-18-webgpu-emoji-collision-solver.md
git commit -m "fix: stabilize webgpu emoji collisions"
```

### Task 3: Reload and verify the live plugin safely

**Files:**
- Read: `app/plugins/webgpu-emoji-rain/gpu/webgpu-emoji-engine.js`

**Interfaces:**
- Consumes: plugin reload endpoint and `GET /api/webgpu-emoji-rain/status`.
- Produces: a renderer initialized from the modified shader without restarting the LTTH server.

- [ ] **Step 1: Confirm the running server serves this checkout**

Run: `Get-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess | Select-Object Id,Path`

Expected: the listener is the LTTH Node runtime under `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main`.

- [ ] **Step 2: Reload only Emoji Rain**

Run: `Invoke-RestMethod -Method Post http://localhost:3000/api/plugins/webgpu-emoji-rain/reload`

Expected: `{ success: true }`; do not invoke a server restart or test-spawn endpoint.

- [ ] **Step 3: Query runtime health**

Run: `Invoke-RestMethod http://localhost:3000/api/webgpu-emoji-rain/status`

Expected: renderer `backend` is `webgpu`, `state` is `ready`, and `droppedParticles` does not increase while idle.

- [ ] **Step 4: Commit runtime verification evidence only if a code/doc change was needed**

No commit is required when reload/status verification changes no tracked files.

## Final review completion contract

The final solver replaces the earlier two-cell/eight-candidate optimization.
`FrameUniforms` uses the spare float at offset 30 for `maxCollisionRadius`,
which JavaScript derives conservatively from the configured maximum emoji size
after depth and intensity scaling (never below 128px). Every shader copy of
the 128-byte frame ABI declares the same field.

For each buffered solve, reach is derived from the active radius plus that
maximum radius and is only bounded by the grid edges. The solver walks every
linked-list candidate, accumulates corrections from immutable source state,
and projects the final destination state back inside wall/floor constraints.
If a boundary blocks one particle's correction direction, its movable partner
receives the full separation. Sticker kind 5 keeps its smaller boundary radius.

The focused regression covers three-cell 80px overlap reach, uncapped dense
candidate traversal, immutable accumulation, floor-blocked transfer, sticker
boundary radius, and the shared-uniform ABI in addition to the original
primary/scratch pipeline contracts.

## Plan Self-Review

- Spec coverage: Tasks 1-2 cover stable symmetric separation, bounded GPU work, no impact visuals, and unchanged command/Superfan scope. Task 3 covers the required live-safe reload.
- Placeholder scan: no unresolved tasks or generic testing instructions remain; every test command and pipeline order is explicit.
- Interface consistency: `collisionBuffer`, `integrateParticles`, `resolveCollisions`, `compactActiveParticles`, `solveToScratch`, `buildScratch`, and `solveToPrimary` use the same names throughout.
