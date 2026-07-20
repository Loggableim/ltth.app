# Boykisser Particle Rocket Finale Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static Boykisser billboard with recognizable particle formations, launch the hero through a real rocket, add Trans/Rainbow special trails, and keep every correlated rocket/burst envelope visibly below the top edge.

**Architecture:** Keep ShowPlanV2 as the single finale contract. Extend its shell metadata with a validated `rocketTrail`, materialize all colored trail voices into the same immutable cue correlation manifest as the rocket and burst, and make the WebGPU particle engine emit one colored flame/exhaust voice per trail color. Boykisser remains glyph 25, but its deterministic JS/WGSL sampler adds silhouette fill while preserving guaranteed face and cheek landmarks; the former vector-hero path is no longer emitted.

**Tech Stack:** CommonJS JavaScript, Jest, WebGPU/WGSL, Playwright Chromium hardware harness.

---

### Task 1: Make Boykisser readable at particle LODs

**Files:**
- Modify: `app/test/webgpu-fireworks-boykisser-geometry.test.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/boykisser-geometry.js`

- [ ] Add failing tests that require deterministic 220-, 320-, and 880-particle sets, one anchor for every named landmark, white silhouette-fill samples inside the traced body, and stable black/red role floors.
- [ ] Run `npm test -- --runInBand test/webgpu-fireworks-boykisser-geometry.test.js`; confirm the fill/LOD assertions fail because the current sampler only follows feature contours.
- [ ] Add exported frozen LOD constants for cameo, standard, and hero densities.
- [ ] Add deterministic silhouette-fill sampling to both JavaScript and generated WGSL while keeping black eyes/nose/mouth and red cheek features role-aware and anchor-first.
- [ ] Re-run the geometry suite and confirm it passes, including JS/WGSL signature and deterministic-seed coverage.
- [ ] Commit the focused geometry change.

### Task 2: Replace the billboard hero with a particle rocket finale

**Files:**
- Modify: `app/test/webgpu-fireworks-built-in-shows.test.js`
- Modify: `app/test/webgpu-fireworks-finale-show-planner.test.js`
- Modify: `app/test/webgpu-fireworks-show-plan-v2-runtime.test.js`
- Modify: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`
- Modify: `app/plugins/webgpu-fireworks/lib/built-in-shows.js`
- Modify: `app/plugins/webgpu-fireworks/lib/finale-show-planner.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`

- [ ] Add failing tests requiring every furry Boykisser layer to use at least 220 particles, the hero to use 640-960 particles, the hero shell to use `launchMode: 'rocket'`, and runtime/GPU commands to keep the authored particle count without `VECTOR_HERO`.
- [ ] Run the four focused suites; confirm current assertions fail on the one-particle vector billboard, low densities, and airburst hero.
- [ ] Raise built-in cameo/standard/hero densities and keep the approved traced role palette.
- [ ] Change the final hero shell to a centered real rocket with a target that leaves the complete particle sculpture visible.
- [ ] Stop classifying Boykisser layers as vector heroes in runtime manifest materialization and GPU spawning; retain parser compatibility for the old flag without emitting it.
- [ ] Re-run the four focused suites and confirm the hero is a particle burst after a finite target-locked rocket flight.
- [ ] Commit the focused particle-hero change.

### Task 3: Add correlated Trans and Rainbow special rocket trails

**Files:**
- Modify: `app/test/webgpu-fireworks-built-in-shows.test.js`
- Modify: `app/test/webgpu-fireworks-show-plan-v2-runtime.test.js`
- Modify: `app/test/webgpu-fireworks-finale-v2-runtime.test.js`
- Modify: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`
- Modify: `app/plugins/webgpu-fireworks/lib/built-in-shows.js`
- Modify: `app/plugins/webgpu-fireworks/lib/finale-show-planner.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`

- [ ] Add failing contract tests for validated `rocketTrail` metadata (`comet`, `spiral`, or `braided`, one-to-four hexadecimal colors), planner preservation, runtime dispatch, and one immutable manifest member per colored trail voice.
- [ ] Add failing built-in-show tests requiring multiple finale rockets with Trans and Rainbow trail palettes and a braided multicolor hero trail.
- [ ] Run the focused suites and confirm the metadata/colored command assertions fail.
- [ ] Preserve `rocketTrail` from built-in shell variants through the planner and runtime event.
- [ ] Generate correlated colored flame/exhaust commands with deterministic curve offsets in the runtime manifest and particle engine, then pass the metadata through `processV2Rocket`.
- [ ] Keep default rockets backward-compatible with one warm flame voice and keep peak command demand inside the existing admission limit.
- [ ] Re-run the focused suites and confirm every trail voice shares the cue correlation manifest and flight target.
- [ ] Commit the focused special-trail change.

### Task 4: Guarantee top headroom and verify the live renderer

**Files:**
- Modify: `app/test/webgpu-fireworks-visible-envelope.test.js`
- Modify: `app/test/webgpu-fireworks-resolution-bounds.test.js`
- Modify: `app/test/fixtures/webgpu-fireworks-chrome-harness.html`
- Modify: `app/test/webgpu-fireworks-chrome-stress.manual.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`

- [ ] Add failing semantic tests that fit a full correlated rocket/body/flame/trail/star-or-ring burst manifest at landscape and portrait resolutions and require at least 8% vertical top headroom, not merely non-negative alpha bounds.
- [ ] Run the envelope suites and confirm the old 12-48 px padding fails the headroom assertion.
- [ ] Increase the tip-guard policy to an 8%-class vertical margin while bounding side pressure on narrow canvases, and ensure the same cached fit applies to every manifest member.
- [ ] Extend the hardware harness with full-flight standard/star/ring and Boykisser hero cases that record visible bounds, command counts, vector-hero flags, and guard violations.
- [ ] Run all focused WebGPU Fireworks suites.
- [ ] Run the manual Chromium WebGPU harness for the complete special-rocket matrix and inspect captured frames for recognizable Boykisser face features, live rocket ascent, Trans/Rainbow trails, and uncropped tips.
- [ ] Run `npm test -- --runInBand`, `npm run build:css`, and `npm run lint` from `app/`.
- [ ] Commit the verification/headroom change, integrate the branch into `main`, push `origin/main`, restart the maintained LTTH runtime, and confirm the served overlay uses the new asset version.
