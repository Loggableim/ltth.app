# Boykisser Vector Finale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic cat-like Furry Celebration hero with an exact, resolution-independent WebGPU vector reconstruction of the supplied Boykisser portrait.

**Architecture:** `boykisser-geometry.js` becomes the immutable source for traced silhouette, facial, and accent primitives and generates matching CPU samples plus WGSL coverage helpers. `webgpu-particle-engine.js` renders core Boykisser layers as one centered vector billboard while non-core layers continue to use corrected particle landmarks. Existing finale planning, depth projection, and visible-envelope fitting stay in control of timing and placement.

**Tech Stack:** CommonJS JavaScript, Jest 29, generated WGSL, WebGPU compute/render pipelines, existing fake-GPU and Intel Arc browser harnesses.

## Global Constraints

- Reconstruct the supplied portrait without shipping a raster copy, SVG DOM overlay, external URL, or new dependency.
- Canonical colors are white, near-black, and reference red; the core hero is not show-palette tinted.
- Remove crescent eyes, pink inner ears, and tongue from the semantic landmark contract.
- Keep other finales, Superfan routing, gifts, and unrelated firework shapes behaviorally unchanged.
- Preserve the complete ears and upper torso inside landscape and portrait safe envelopes.
- Use 2-space indentation and existing CommonJS style.

---

## File Structure

- Modify `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`: canonical normalized vector primitives, deterministic particle landmark sampling, generated WGSL vector coverage/color functions.
- Modify `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`: core-vector command flag, single-billboard spawn behavior, centered compute path, vector fragment output, glow suppression.
- Modify `app/test/webgpu-fireworks-boykisser-geometry.test.js`: supplied-reference semantic and CPU/WGSL parity contract.
- Modify `app/test/webgpu-fireworks-gpu-v2-contract.test.js`: core versus non-core command behavior and shader integration.
- Modify `app/test/webgpu-fireworks-resolution-bounds.test.js`: landscape/portrait vector-hero envelope coverage.

### Task 1: Canonical supplied-reference vector geometry

**Files:**
- Modify: `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`
- Test: `app/test/webgpu-fireworks-boykisser-geometry.test.js`

**Interfaces:**
- Produces: `BOYKISSER_FEATURES`, `BOYKISSER_VECTOR`, `BOYKISSER_COLORS`, `sampleBoykisserSet(count, seed)`, `buildBoykisserWgsl()`, and `geometrySignature`.
- `BOYKISSER_VECTOR` is a frozen object with `aspectRatio`, `silhouette`, `blackFills`, `blackStrokes`, and `redStrokes`; polygon entries contain normalized `[x, y]` points and stroke entries contain `width` plus normalized points.

- [ ] **Step 1: Replace the old semantic expectations with a failing supplied-reference contract**

```js
const REQUIRED_FEATURES = [
  'outer-silhouette',
  'forehead-tuft',
  'left-long-eye',
  'right-long-eye',
  'centered-nose',
  'omega-mouth',
  'left-zigzag-cheek',
  'right-zigzag-cheek',
];

expect(Object.keys(BOYKISSER_FEATURES)).toEqual(REQUIRED_FEATURES);
expect(BOYKISSER_COLORS).toEqual({
  HEAD: [1, 1, 1],
  FACE: [0.015, 0.015, 0.02],
  ACCENT: [1, 0.02, 0.02],
});
expect(BOYKISSER_FEATURES).not.toHaveProperty('tongue');
expect(BOYKISSER_FEATURES).not.toHaveProperty('left-inner-ear');
expect(BOYKISSER_FEATURES).not.toHaveProperty('left-crescent-eye');
expect(BOYKISSER_VECTOR.aspectRatio).toBeCloseTo(1365 / 2048, 6);
expect(buildBoykisserWgsl()).toContain('fn boykisserVectorColor(uv: vec2f) -> vec4f');
```

- [ ] **Step 2: Run the geometry test and verify the correct RED failure**

Run: `cd app && npx jest test/webgpu-fireworks-boykisser-geometry.test.js --runInBand`

Expected: FAIL because the old crescent-eye/tongue contract exists and `BOYKISSER_VECTOR` plus `boykisserVectorColor` do not exist.

- [ ] **Step 3: Trace the supplied image into normalized immutable primitives**

Use the 1365 by 2048 reference coordinate system and normalize every traced point with:

```js
const normalizeReferencePoint = ([x, y]) => [
  x / 1365 * 2 - 1,
  y / 2048 * 2 - 1,
];
```

Define the complete outer white silhouette as a clockwise polygon passing through both ear tips, both cheek-tuft clusters, the lower jaw, both shoulder edges, and the tapered torso. Define each long eye as a filled polygon, the nose as a compact filled polygon, the upper-eye and omega-mouth marks as black strokes, and each cheek mark as a three-segment red zigzag stroke. Freeze every nested array through the existing `freezePoints` pattern.

Generate WGSL helpers from those exact arrays:

```js
function buildPolygonFunction(name, points) {
  return `fn ${name}(point: vec2f) -> bool {\n` +
    `  let vertices = array<vec2f, ${points.length}>(\n` +
    `    ${points.map(wgslPoint).join(',\n    ')}\n` +
    '  );\n' +
    '  var inside = false;\n' +
    `  var previous = ${points.length - 1}u;\n` +
    `  for (var current = 0u; current < ${points.length}u; current += 1u) {\n` +
    '    let a = vertices[current];\n' +
    '    let b = vertices[previous];\n' +
    '    let crosses = ((a.y > point.y) != (b.y > point.y)) &&\n' +
    '      (point.x < (b.x - a.x) * (point.y - a.y) / max(abs(b.y - a.y), 0.000001) * sign(b.y - a.y) + a.x);\n' +
    '    if (crosses) { inside = !inside; }\n' +
    '    previous = current;\n' +
    '  }\n' +
    '  return inside;\n' +
    '}';
}
```

Generate capsule-distance stroke coverage from each adjacent pair. `boykisserVectorColor(uv)` transforms square billboard UV into portrait coordinates, returns transparent outside the silhouette, then overlays black fills/strokes and finally red cheek strokes.

- [ ] **Step 4: Run the geometry test and verify GREEN**

Run: `cd app && npx jest test/webgpu-fireworks-boykisser-geometry.test.js --runInBand`

Expected: PASS with all corrected landmarks retained at low density and the updated geometry signature present in WGSL.

- [ ] **Step 5: Commit the geometry contract and implementation**

```powershell
git add -- app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js app/test/webgpu-fireworks-boykisser-geometry.test.js
git commit -m "feat(webgpu-fireworks): trace canonical Boykisser vector"
```

### Task 2: Native core-vector WebGPU hero

**Files:**
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Test: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`

**Interfaces:**
- Consumes: `buildBoykisserWgsl()` and `BOYKISSER_VECTOR.aspectRatio` from Task 1.
- Produces: a core-only command bit `V2_VECTOR_HERO`, a single centered shape-25 billboard command, and shader branches keyed by `shape == 25u && (flags & V2_VECTOR_HERO) != 0u`.

- [ ] **Step 1: Add failing core/non-core command assertions**

```js
const heroLayer = { ...boykisserLayer, core: true, density: 192 };
expect(engine.spawnLayer(heroLayer, heroContext)).toBe(true);
expect(engine.spawnQueue[0]).toMatchObject({ shape: 25, count: 1, globalCount: 1 });
expect(engine.spawnQueue[0].flags & (1 << 14)).not.toBe(0);

const buildLayer = { ...boykisserLayer, core: false, density: 96 };
expect(buildEngine.spawnLayer(buildLayer, buildContext)).toBe(true);
expect(buildEngine.spawnQueue[0]).toMatchObject({ shape: 25, count: 96, globalCount: 96 });
expect(buildEngine.spawnQueue[0].flags & (1 << 14)).toBe(0);
```

Assert shader source contains the vector fragment call, centered-vector compute branch, and transparent vector glow branch.

- [ ] **Step 2: Run the focused GPU contract and verify RED**

Run: `cd app && npx jest test/webgpu-fireworks-gpu-v2-contract.test.js --runInBand`

Expected: FAIL because core Boykisser still emits its authored particle density and no vector-hero flag exists.

- [ ] **Step 3: Implement the minimal vector-hero command path**

Add:

```js
const V2_VECTOR_HERO = 1 << 14;
```

In `spawnLayer`, derive:

```js
const vectorHero = shape === V2_GLYPH_IDS.boykisser && effectiveLayer.core === true;
const commandCount = vectorHero ? 1 : effectiveLayer.density;
const vectorSize = Math.min(this.logicalHeight * 0.72, this.logicalWidth * 0.72 / BOYKISSER_VECTOR.aspectRatio);
```

Set the vector flag, `count`, `globalCount`, zero gravity, zero intensity, and `size: vectorSize * 0.5` only for the vector hero. Preserve the existing command fields for every non-core layer.

In compute WGSL, return zero velocity for the flagged shape-25 vector hero before normal glyph sampling. In `particleFragment`, call `boykisserVectorColor(in.uv)`, multiply its premultiplied output by `in.fade`, and return it before normal distance-field materials. In `glowFragment`, return transparent for the vector hero so black features remain crisp.

- [ ] **Step 4: Run the GPU contract and verify GREEN**

Run: `cd app && npx jest test/webgpu-fireworks-gpu-v2-contract.test.js --runInBand`

Expected: PASS; core emits one flagged billboard and non-core density remains unchanged.

- [ ] **Step 5: Run geometry plus GPU lifecycle regressions**

Run: `cd app && npx jest test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-gpu-v2-contract.test.js test/webgpu-fireworks-gpu-lifecycle.test.js --runInBand`

Expected: PASS with no leaked GPU resources or shader-source mismatch.

- [ ] **Step 6: Commit the WebGPU hero path**

```powershell
git add -- app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/test/webgpu-fireworks-gpu-v2-contract.test.js
git commit -m "feat(webgpu-fireworks): render exact Boykisser hero"
```

### Task 3: Safe envelopes and live acceptance

**Files:**
- Modify: `app/test/webgpu-fireworks-resolution-bounds.test.js`
- Verify: `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`
- Verify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`

**Interfaces:**
- Consumes: vector hero command from Task 2 and existing `VisibleEnvelope` fitting.
- Produces: regression coverage proving the portrait billboard remains inside supported viewports.

- [ ] **Step 1: Add failing landscape and portrait bound assertions**

```js
test.each([
  [1920, 1080],
  [1080, 1920],
  [1280, 720],
  [720, 1280],
])('keeps the Boykisser vector hero inside %ix%i', (width, height) => {
  const command = spawnCoreBoykisser(width, height);
  const halfHeight = command.size;
  const halfWidth = halfHeight * BOYKISSER_VECTOR.aspectRatio;
  expect(command.origin.x - halfWidth).toBeGreaterThanOrEqual(0);
  expect(command.origin.x + halfWidth).toBeLessThanOrEqual(width);
  expect(command.origin.y - halfHeight).toBeGreaterThanOrEqual(0);
  expect(command.origin.y + halfHeight).toBeLessThanOrEqual(height);
});
```

- [ ] **Step 2: Run the bounds test and verify RED if fitting is incomplete**

Run: `cd app && npx jest test/webgpu-fireworks-resolution-bounds.test.js --runInBand`

Expected: the new assertions initially fail if the raw hero size or origin exceeds a supported viewport.

- [ ] **Step 3: Apply the existing visible-envelope fitter to the vector billboard**

Materialize the core command with the existing viewport-responsive metadata and clamp only the vector billboard half-height against both viewport height and `width / aspectRatio`. Do not change the shared standard/star/ring fitting profiles.

- [ ] **Step 4: Run the complete focused regression set**

Run:

```powershell
cd app
npx jest test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-gpu-v2-contract.test.js test/webgpu-fireworks-resolution-bounds.test.js test/webgpu-fireworks-finale-show-planner.test.js test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-gpu-harness-contract.test.js --runInBand
npx eslint plugins/webgpu-fireworks/gpu/boykisser-geometry.js plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js test/webgpu-fireworks-boykisser-geometry.test.js test/webgpu-fireworks-gpu-v2-contract.test.js test/webgpu-fireworks-resolution-bounds.test.js
```

Expected: all focused suites pass and ESLint reports no errors.

- [ ] **Step 5: Run the hardware/browser gate and inspect the rendered hero**

Run the existing WebGPU Chrome harness against the Intel Arc adapter at 1920 by 1080 and 1080 by 1920. Confirm shader compilation, zero guard violations, zero clipping violations, and a readable white/black/red portrait. Capture a screenshot for comparison with the supplied reference.

- [ ] **Step 6: Commit the bounds regression**

```powershell
git add -- app/test/webgpu-fireworks-resolution-bounds.test.js
git commit -m "test(webgpu-fireworks): bound Boykisser vector hero"
```

- [ ] **Step 7: Deploy to the active installation and restart**

Back up and copy only the modified runtime files to `C:\Users\logga\Downloads\app\plugins\webgpu-fireworks`, verify SHA-256 equality, restart `C:\Users\logga\Downloads\runtime\node\node.exe C:\Users\logga\Downloads\app\server.js`, and confirm:

- `GET /api/webgpu-fireworks/status` succeeds;
- `GET /plugins/webgpu-fireworks/gpu/boykisser-geometry.js` serves the new geometry signature;
- the live overlay reaches WebGPU `ready` once opened;
- Furry Celebration and the Superfan test action both dispatch to the updated hero.
