# Task 7 — Elemental WebGPU Battle VFX report

Status: **DONE_WITH_CONCERNS**

Starting point: `527220c131f6ac6f586202fbf7b1becdbb3984a0`

## Outcome

- Added one authoritative 18-recipe table for Ember, Tide, Grove, Gale, Volt,
  and Lunar across attack, defense, and Special. The published three-color
  palettes and recipe descriptions match the Task 7 brief.
- Kept `vfxKey` as a deterministic accent seed. Element/action selects the
  recipe, so accent hash collisions cannot select another semantic recipe.
- Replaced the fullscreen WebGPU triangle with procedural instanced particles:
  six vertices per quad, no vertex buffer, and actual quality-budget instance
  counts (`high=112`, `auto=72`, `medium=56`, `low=24`).
- Added shared source-to-target attack basis resolution for WebGPU and
  Canvas2D. Slot 1→2 and slot 2→1 now use mirrored longitudinal/lateral axes;
  defense stays actor-centered and equal/invalid anchors have a deterministic
  right-facing fallback.
- GPU uniforms and shader behavior now consume motif identity, phase, accent
  seed, actor/target, hit cadence, shield, heal/lifesteal, evade, one bounded
  primary status, damage, and absorbed shield.
- Added synchronous frame-error containment around buffer write, texture
  acquisition, encoding, and submit. The active scene changes to Canvas2D/CSS
  without rejecting its completion.
- Capped the backing store at 2,073,600 pixels. `destroy()` cancels work,
  clears/resolves the active scene, releases owned references, and calls
  `GPUDevice.destroy()` when available. Page lifecycle shutdown now destroys
  both effects renderers.
- Canvas2D uses the resolved canonical recipe and basis. CSS-only fallback uses
  the same element palette and distinct attack/defense/Special silhouettes.
- Director and view preserve one semantic renderer scene per action together
  with element, `vfxKey`, role, skill effects, slots, and bounded duration.
- Added a short portrait breakpoint for 477×829-class layouts, and hides the
  redundant battle feed during portrait choice at both compact and production
  portrait sizes. Skill text remains wrapping rather than ellipsized.

## Strict TDD evidence

### Initial RED

Command:

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  'node_modules\jest\bin\jest.js' --runTestsByPath `
  'test/streammonsters-effects-signatures-v111.test.js' `
  'test/streammonsters-effects-renderer.test.js' `
  'test/streammonsters-arena-director-v15.test.js' `
  'test/streammonsters-arena-view-v15.test.js' `
  'test/streammonsters-arcade-overlay-v6.test.js' `
  --runInBand --silent
```

Observed against the starting implementation:

- 5 suites total: 4 failed, 1 passed.
- 92 tests total: 16 failed, 76 passed.
- Expected failures named the missing recipe/palette/uniform/basis exports,
  fullscreen rather than instanced particle drawing, equal GPU work for all
  qualities, uncaught frame errors, absent backing cap/device cleanup, lost
  role/effects/duration, and the missing short portrait contract.

The first invocation used backslash test patterns without
`--runTestsByPath`; Jest found no tests. It was a command-shape error and is
not counted as RED. The corrected command above produced behavior failures.

### Follow-up geometry RED

After the first browser evidence pass exposed the production-portrait choice
feed collision, a CSSOM behavior assertion was added before production was
changed:

- `streammonsters-arena-view-v15.test.js`: 1 expected failure, 29 passes.
- Failure: portrait choice feed `display:none` contract was absent.

The subsequent portrait rule made that test green.

### GREEN

The corrected focused command above was rerun after implementation:

- 5/5 suites passed.
- 92/92 tests passed.
- 0 snapshots.

Nearest overlay/config regressions:

```text
5/5 suites passed
87/87 tests passed
```

Suites: config v1.11, overlay reconnect, overlay layout queue, demo API VFX,
and overlay language v1.11.

The final combined bounded run of all ten focused and adjacent suites passed:

```text
10/10 suites passed
179/179 tests passed
```

The broader `streammonsters-overlay.test.js` remains independently stale:
the combined six-suite run produced 97 passes and one failure because the test
expects source text `const eventQueue`, while both the starting commit and
current source use `let eventQueue = null`. No runtime behavior in Task 7
caused that baseline source-grep failure.

## Mutation protected by each changed test group

- `streammonsters-effects-signatures-v111.test.js`
  - catches a wrong palette, missing/duplicated recipe, wrong motif identity,
    `vfxKey` selecting semantic behavior, or shield/heal/hit/evade/status
    becoming dead GPU inputs.
- `streammonsters-effects-renderer.test.js`
  - catches a reversed attack axis, nondeterministic equal-anchor fallback,
    regression to `draw(3)`, a vertex-buffer dependency, quality modes that do
    not change instance work, uncaught synchronous frame errors, an unbounded
    high-DPI backing store, or missing device/frame cleanup.
- `streammonsters-arena-director-v15.test.js`
  - catches a missing or duplicate semantic renderer scene and loss of exact
    element, accent key, role, skill effects, actor/target slots, or duration.
- `streammonsters-arena-view-v15.test.js`
  - catches multiple `effects.play()` calls, semantic payload loss, CSSOM
    helpers that discard style rules with an empty `cssRules` collection, and
    missing compact/production portrait separation rules.
- `streammonsters-arcade-overlay-v6.test.js`
  - catches reintroduction of a second `element_trail` scene for a Special.

## Visual/browser evidence

The final browser/capture acceptance gate was waived by the task owner and was
not completed. No screenshot path is claimed as accepted Task 7 evidence, and
no real-browser WebGPU frame is claimed.

WebGPU remains covered at the resource/draw boundary by focused tests that
create the production pipeline, inspect the procedural `instance_index` shader
contract, and observe `draw(6, effectiveParticleCount)` for high/medium/low.
Canvas direction, target reach, CSS fallback state, 74% clipping, compact
portrait bands, and protected stacking are covered by the focused renderer and
CSSOM behavior suites. A WebGPU-capable OBS/browser visual pass remains a
handoff item.

## Other verification

- Plugin-scoped ESLint for three production JS files and five focused test
  files: exit 0, no findings.
- CSS build: exit 0 (`Done in 4460ms`); only the pre-existing outdated
  `caniuse-lite` warning was printed.
- `git diff --check`: exit 0.
- Focused renderer/director/view syntax is covered by Jest and ESLint.

## Concerns

1. Real-browser WebGPU and Canvas/CSS pixel acceptance was waived and remains
   unavailable; the WebGPU resource/draw contract and DOM/CSS behavior were
   proven, but visual sign-off still needs a WebGPU-capable OBS/browser pass.
2. `streammonsters-overlay.test.js` has the unrelated stale
   `const eventQueue` source-text expectation described above.

## Independent review fix round 1

The evidence below supersedes the earlier browser-gate waiver for Canvas2D
and CSS. Chromium WebGPU availability remains called out separately and is
not represented as a rendered WebGPU frame.

### Review RED

The two focused Jest suites were run before the renderer changes:

```text
2 suites failed
9 tests failed, 30 passed
```

The failures proved these production mutations:

- all 18 active particle profiles were missing from the exact uniform payload;
- Canvas attacks still applied a `vfxKey` twist instead of keeping the
  canonical source-to-target basis;
- an acquired device could resurrect WebGPU after `destroy()`;
- frame fallback discarded device ownership, so later cleanup did not call
  `GPUDevice.destroy()`.

The isolated Chromium acceptance then exposed two additional visual failures
before their production fixes:

- CSS effect coverage was exactly `0`: the ID-level
  `#battle-effects-canvas { background:transparent }` declaration overrode
  the lower-specificity fallback recipe declarations. The old capture had
  measured the animated Arena backdrop rather than the CSS effect.
- the first valid 477x829 Ember Canvas mask covered only `1.4952%`, below the
  new non-thin-path acceptance floor of `2%`.

### Active 18-recipe behavior

The active particle uniform block now contains two additional vectors:

- action motion family plus element shape family, curvature, and turbulence;
- taper, stretch, lobe count, and phase offset.

The active WGSL vertex and fragment stages consume those values. Six
element-specific procedural forms (flame, droplet, leaf/crystal, feather,
bolt, crescent/star) combine with three action-specific motion systems
(directed attack, actor-centered defense, radial Special). A literal
mutation test compares the actual 48-float uniform payload for all 18
recipes and requires 18 distinct motion/shape profiles; a live mocked WebGPU
frame additionally observes the Lunar Special profile at `queue.writeBuffer`.

### Canvas basis and device lifecycle

- Canvas derives its local endpoint from `scene.basis.longitudinal *
  scene.basis.distance` and no longer rotates attacks with `vfxKey`.
- All six attack families are covered across slot 1->2 and slot 2->1 with an
  exact endpoint assertion.
- A permanent destroyed flag plus initialization generation prevents async
  initialization from changing renderer state after teardown.
- Device ownership is retained separately from the active WebGPU reference,
  so `destroy()` releases the acquired device both after frame fallback and
  after destroy-during-device-acquisition.

### Deterministic browser/pixel acceptance

Command:

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  'test\streammonsters-effects-visual-v111.browser.js'
```

The committed browser fixture opens a fresh page for every case, isolates
the real production effect surface from the Arena backdrop, decodes each PNG
in Chromium, and counts alpha pixels. Both 477x829 and 1080x1920 passed:

```text
Canvas Ember attack LTR: 2.9825% / 2.7385%
Canvas Ember attack RTL: 2.9702% / 2.7358%
Canvas Tide defense:     5.8410% / 5.3869%
Canvas Lunar Special:    9.8532% / 9.5182%
CSS Ember attack:        3.2763% / 3.3244%
CSS Tide defense:        3.7893% / 3.7570%
CSS Lunar Special:       7.8245% / 7.8911%
```

Every capture is nonblank, below the 35% maximum, clipped at the 74%
gameplay boundary, below the action card and fighter panels in the actual
stacking order, and has no action-card/fighter-panel geometry collision.
Evidence PNGs and `metrics.json` were generated under
`output/playwright/sm111-element-vfx-round1/`.

The browser exposed `navigator.gpu`, but `requestAdapter()` returned no
adapter. Therefore this run proves real Canvas/CSS rendering and WebGPU
fallback selection, but does not claim a hardware-rendered WebGPU screenshot.
The blank prior "WebGPU" image was a harness attribution problem: the browser
had no adapter and the capture included unrelated Arena pixels. Active
WebGPU recipe behavior remains protected at shader creation, uniform upload,
and instanced draw boundaries.

### Final fix-round verification

```text
10/10 focused and adjacent Jest suites passed
187/187 tests passed
Browser acceptance passed at both required portrait sizes
Plugin-scoped ESLint passed
CSS build passed (only the pre-existing caniuse-lite warning)
git diff --check passed
```

## Independent review fix round 2

A later isolated hardware-WebGPU capture reached Dawn's real WGSL compiler
and rejected the active particle shader because `target` is a reserved WGSL
identifier. The no-adapter test doubles used before this round accepted the
invalid shader module and therefore did not expose the production fallback.

### RED

The new regression validates the `Uniforms` fields and every `u.<field>`
reference in the exact shader string passed to `GPUDevice.createShaderModule`.
Its strict compiler double rejects the observed reserved identifier.

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  'node_modules\jest\bin\jest.js' --runTestsByPath `
  'test/streammonsters-effects-renderer.test.js' --runInBand `
  -t 'active particle shader compiles without reserved or dangling uniform identifiers'
```

Observed before the production rename:

```text
1 suite failed
1 test failed, 22 skipped
Expected renderer init "webgpu"; received "fallback"
```

### Fix and GREEN

Both WGSL `Uniforms` declarations now call the semantic slot `destination`,
and all shader member reads use `u.destination`. The uniform field order,
48-float JavaScript payload, 192-byte buffer layout, and draw path are
unchanged.

The exact RED command then passed:

```text
1 suite passed
1 test passed, 22 skipped
```

Focused Node 22 VFX verification:

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  'node_modules\jest\bin\jest.js' --runTestsByPath `
  'test/streammonsters-effects-renderer.test.js' `
  'test/streammonsters-effects-signatures-v111.test.js' `
  --runInBand --silent
```

```text
2/2 suites passed
40/40 tests passed
```

The shared worktree's new 1.11 hardware capture and capture script belong to
the parallel package-fix task and were intentionally neither run nor changed
in this scoped round. The capture agent must repeat its exact hardware smoke
against this commit; this report does not claim that retest prematurely.
