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
