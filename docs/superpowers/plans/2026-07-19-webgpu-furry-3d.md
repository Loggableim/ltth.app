# WebGPU Furry 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add controlled real 3D depth to WebGPU Fireworks and use it only in a newly choreographed Boykisser-led Furry Celebration finale.

**Architecture:** Keep ShowDefinitionV1 and public finale APIs stable. Add optional render hints to compiled ShowPlanV2 shells, encode flat/far/mid/near launch and burst depth in unused bits of the existing 112-byte V2 command metadata, simulate particles in XYZ, and render transparent particles in far-to-near buckets without a depth buffer. The Furry built-in receives procedural compound glyphs and per-shell choreography; all other shows default to the pixel-identical flat path.

**Tech Stack:** CommonJS JavaScript, WGSL/WebGPU, Jest/jsdom, Socket.IO, HTML/JSON locales.

## Global Constraints

- Only `furry-celebration` opts into 3D; all other built-ins, custom shows, live gifts and legacy payloads remain flat by default.
- Preserve the 112-byte spawn command ABI and old byte goldens when render hints are absent.
- Preserve public `triggerFinale`, ShowDefinitionV1 and Show Designer depth behavior.
- Preserve the 8192-particle pool and 28 show + 4 gift command reserve.
- Furry rocket totals stay exactly short/medium/long `15 / 25 / 38`; finale waves become `2/2/2/1`, `3/3/4/1`, `5/5/5/1`.
- Hero beats are `8700 / 16300 / 26000` ms; the last cue is one centered Hero Boykisser shell.
- Rainbow and trans colors are supporting accents; Boykisser is the primary recurring motif.
- Release versions are app `1.3.35` and plugin `3.1.0`, with DE/EN/ES/FR parity and refreshed overlay cache keys.
- Tests must be written and observed failing before production changes.

---

### Task 1: Controlled 3D Renderer and Runtime Contract

**Files:**
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/engine.js`
- Test: `app/test/webgpu-fireworks-gpu-v2-contract.test.js`
- Test: `app/test/webgpu-fireworks-show-plan-v2-runtime.test.js`
- Test: `app/test/webgpu-fireworks-finale-v2-runtime.test.js`

**Interfaces:**
- Add optional shell `renderHints` with `launchDepth`, `burstDepth`, `depthEnabled`, and `glyphScale`.
- Missing hints must normalize to flat z=0 behavior.
- V2 command word 27 keeps color count in low bits and stores quantized launch/burst depth metadata only for depth-enabled commands.

- [ ] Write focused failing tests for hint validation/defaults, deterministic 3D flight timing, unchanged flat scheduling, ABI packing, projection constants, 3D particle/trail layouts and far-to-near render buckets.
- [ ] Run the three focused suites and verify failures are caused by missing 3D behavior.
- [ ] Implement XYZ particle physics, camera projection calibrated for z=0 parity, planar glyph/ring motion, volumetric supported primitives, depth buckets and guarded Near scaling.
- [ ] Re-run focused suites and refactor only while green.
- [ ] Commit as `feat(webgpu-fireworks): add controlled 3d depth renderer`.

### Task 2: Boykisser Glyphs and Furry Choreography

**Files:**
- Modify: `app/plugins/webgpu-fireworks/lib/built-in-shows.js`
- Modify: `app/plugins/webgpu-fireworks/lib/finale-show-planner.js`
- Modify: `app/plugins/webgpu-fireworks/lib/finale-formation-layout.js`
- Modify: `app/plugins/webgpu-fireworks/lib/pyrodsl/constants.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/show-plan-v2-runtime.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Test: `app/test/webgpu-fireworks-built-in-shows.test.js`
- Test: `app/test/webgpu-fireworks-finale-show-planner.test.js`
- Test: `app/test/webgpu-fireworks-pyrodsl.test.js`

**Interfaces:**
- Curated glyph IDs remain stable; append `boykisser` and `trans-flag` after existing IDs.
- Boykisser uses one compound layer with semantic color roles and depth-aware mini/hero path detail.
- Built-in descriptors may select per-shell variants so one featured cat does not force every support rocket to duplicate it.

- [ ] Write failing tests for glyph registration/IDs, finite bounded subpaths, semantic colors, all three exact counts, finale wave splits, hero beats, one-shell hero cue, safe-area geometry, depth progression and recurring cat cues.
- [ ] Run focused suites and verify expected failures.
- [ ] Implement procedural Boykisser and trans-ribbon glyphs without shipping source PNG/SVG assets.
- [ ] Reauthor all three Furry variants with humorous cameos, call-and-response, controlled close passes, false ending and centered Hero; keep Pride accents subtle and degradable.
- [ ] Re-run focused suites and refactor only while green.
- [ ] Commit as `feat(webgpu-fireworks): choreograph 3d furry celebration`.

### Task 3: Capability Fallback, Release Surfaces and End-to-End Verification

**Files:**
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Modify: `app/plugins/webgpu-fireworks/overlay.html`
- Modify: `app/plugins/webgpu-fireworks/plugin.json`
- Modify: `app/plugins/webgpu-fireworks/README.md`
- Modify: `app/plugins/webgpu-fireworks/locales/{de,en,es,fr}.json`
- Modify: `app/package.json`, `package.json`, `version.json`
- Test: relevant WebGPU backend, settings, i18n and runtime suites.

**Interfaces:**
- Overlay registration/status advertises protocol and capabilities `depth3d-v1` and `boykisser-v1`.
- Preview/test against an old renderer returns an actionable refresh error; normal Furry finales retain a playable legacy fallback.

- [ ] Write failing backend/status/i18n/version tests for capabilities, stale-renderer behavior and release values.
- [ ] Run focused suites and verify expected failures.
- [ ] Implement capability telemetry, clear refresh diagnostics, legacy fallback, cache busting, attribution and four-locale copy.
- [ ] Update app/plugin release versions to `1.3.35` / `3.1.0`.
- [ ] Run focused and full verification, browser/live WebGPU checks, diff checks and final review.
- [ ] Commit as `chore(release): ship WebGPU Furry 3D`.
