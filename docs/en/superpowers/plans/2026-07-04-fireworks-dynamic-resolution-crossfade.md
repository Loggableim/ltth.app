# Fireworks Dynamic Resolution Crossfade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adaptive render-scale changes in the Fireworks overlay fade smoothly instead of flashing during internal resolution changes.

**Architecture:** Keep the OBS source size fixed and continue rendering the active frame at the current internal scale. When a scale change happens, capture the previous frame into a temporary snapshot canvas, resize the working buffers, and crossfade the snapshot out over a short duration while the new frame fades in. This avoids changing any firework behavior, physics, presets, or OBS source sizing.

**Tech Stack:** CommonJS JavaScript, HTML5 Canvas 2D, existing Fireworks plugin renderer.

---

### Task 1: Add transition state to the Fireworks engine

**Files:**
- Modify: `app/plugins/fireworks/gpu/engine.js`
- Test: `app/test/fireworks-performance.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('engine keeps a transition snapshot for adaptive render scale changes', () => {
  expect(engineCode).toContain('this.transitionCanvas = null');
  expect(engineCode).toContain('this.transitionFadeMs = 160');
  expect(engineCode).toContain('captureRenderTransitionSnapshot()');
  expect(engineCode).toContain('this.transitionStartTime = performance.now()');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand --silent test/fireworks-performance.test.js`
Expected: FAIL because the transition snapshot fields and helper do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```js
// in constructor
this.transitionCanvas = null;
this.transitionCtx = null;
this.transitionStartTime = 0;
this.transitionFadeMs = 160;

// new helper
captureRenderTransitionSnapshot() {
  if (typeof document === 'undefined') return;
  if (!this.canvas || !this.canvas.width || !this.canvas.height) return;
  this.transitionCanvas = document.createElement('canvas');
  this.transitionCanvas.width = this.canvas.width;
  this.transitionCanvas.height = this.canvas.height;
  this.transitionCtx = this.transitionCanvas.getContext('2d');
  if (!this.transitionCtx) return;
  this.transitionCtx.drawImage(this.canvas, 0, 0);
  this.transitionStartTime = performance.now();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand --silent test/fireworks-performance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/fireworks/gpu/engine.js app/test/fireworks-performance.test.js
git commit -m "fireworks: add render transition snapshot"
```

### Task 2: Crossfade the internal resolution change

**Files:**
- Modify: `app/plugins/fireworks/gpu/engine.js`
- Test: `app/test/fireworks-performance.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('adaptive render scale applies a short crossfade instead of a hard cut', () => {
  expect(engineCode).toContain('captureRenderTransitionSnapshot()');
  expect(engineCode).toContain('const transitionProgress =');
  expect(engineCode).toContain('ctx.globalAlpha = 1 - transitionProgress');
  expect(engineCode).toContain('ctx.drawImage(this.transitionCanvas, 0, 0)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand --silent test/fireworks-performance.test.js`
Expected: FAIL until the render path overlays the snapshot with a fade.

- [ ] **Step 3: Write minimal implementation**

```js
applyRenderScale() {
  const scale = this.config.adaptiveRenderScaleEnabled === false ? 1.0 : Math.min(maxScale, Math.max(minScale, this.renderScale));
  const previousCanvas = this.canvas.width && this.canvas.height ? this.canvas : null;

  if (previousCanvas) {
    this.captureRenderTransitionSnapshot();
  }

  this.renderWidth = Math.max(320, Math.round(this.baseWidth * scale));
  this.renderHeight = Math.max(180, Math.round(this.baseHeight * scale));
  this.canvas.width = this.renderWidth;
  this.canvas.height = this.renderHeight;
  ...
}

renderCanvas() {
  ...
  if (this.transitionCanvas && this.transitionCtx) {
    const transitionProgress = Math.min(1, (performance.now() - this.transitionStartTime) / this.transitionFadeMs);
    if (transitionProgress < 1) {
      this.ctx.save();
      this.ctx.globalAlpha = 1 - transitionProgress;
      this.ctx.drawImage(this.transitionCanvas, 0, 0, this.renderWidth, this.renderHeight);
      this.ctx.restore();
    } else {
      this.transitionCanvas = null;
      this.transitionCtx = null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand --silent test/fireworks-performance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/plugins/fireworks/gpu/engine.js app/test/fireworks-performance.test.js
git commit -m "fireworks: crossfade adaptive resize"
```

### Task 3: Verify the overlay still behaves normally

**Files:**
- Test: `app/test/fireworks-benchmark-ui.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('overlay remains OBS-safe after adaptive resize transition changes', () => {
  expect(settingsHtml).toContain('id="orientation-select"');
  expect(overlayHtml).toContain('body.portrait #fireworks-canvas');
  expect(overlayHtml).toContain('body.landscape #fireworks-canvas');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand --silent test/fireworks-benchmark-ui.test.js`
Expected: PASS or fail only if the UI/overlay contract regressed.

- [ ] **Step 3: Write minimal implementation**

No code change expected if the overlay contract still matches; update only if the earlier refactor touched it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand --silent test/fireworks-benchmark-ui.test.js test/fireworks-performance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/test/fireworks-benchmark-ui.test.js
git commit -m "fireworks: verify resize crossfade overlay contract"
```

### Task 4: Final validation

**Files:**
- No code changes expected

- [ ] **Step 1: Run the targeted test suite**

Run: `npm test -- --runInBand --silent test/fireworks-benchmark-ui.test.js test/fireworks-performance.test.js test/fireworks-engine-optimizations.test.js`

- [ ] **Step 2: Run lint**

Run: `npm run lint -- --quiet`

- [ ] **Step 3: Commit only if any follow-up fix was required**

```bash
git add <changed files>
git commit -m "fireworks: smooth adaptive resolution transition"
```

