# Task 4 report — Stream Monsters 1.10 Jackpot overlay

## Scope implemented

- Added `streammonsters-egg-stage-view.js`, a dedicated public egg-stage shelf model and DOM controller.
- Mounted the shelf at the 74% gameplay boundary without changing the lower 26% chat-safe zone.
- Added stable public-free, ready, then incubating ordering; eight full-size slots; and a rotating `+N` preview.
- Added deterministic per-slot fly, bounce, collision-lane and settle values, including zero-duration reduced-motion state.
- Public free offers receive a gold ring, jump/shake choreography and an eight-second `!adopt` callout. Claimed free eggs remain on the shelf as owned eggs without an adoption affordance. Gift eggs can never receive it.
- Routed `egg_landed`, `free_egg_public`, `free_egg_claimed` and `egg_stage_removed` through the critical overlay queue and reconnect snapshot.
- Extended the already-wired Rules-v7 Jackpot timeline with renderer effects for projectile and shield beats.
- Added element lighting, shield feedback and hit-combo presentation while retaining the existing full-monster, skill-card, HP/shield/Special HUD and camera impulse surfaces.
- Added creator shelf preview, shelf counts, and an Elemental Hour explanation alongside existing renderer, match, GCCE and alias diagnostics.
- No server was started and live port 3000 was not touched.

## TDD evidence

### RED 1

Command:

```text
runtime\node\node.exe node_modules/jest/bin/jest.js test/streammonsters-jackpot-overlay-v110.test.js --runInBand
```

Result before production code: 1 failed suite, 6 failed tests. The failures named the missing shelf module, 74% shelf mount, Jackpot combo/element surfaces and creator preview/diagnostics.

### GREEN 1 and stability correction

The first implementation run passed five tests and failed the deterministic-motion assertion. The motion seed still used incoming array position. The implementation was changed to seed from the stable sorted shelf position, then the focused contract passed.

### RED 2

A claim-transition regression was added after self-review. It failed because `free_egg_claimed` removed the visual instead of replacing the public offer with its owned/incubating projection. The controller now upserts the claimed `eggStage`, removes the ring/callout, and reserves deletion for `egg_stage_removed` or terminal stage states.

## Verification

Focused and adjacent final gate:

```text
runtime\node\node.exe node_modules/jest/bin/jest.js \
  test/streammonsters-jackpot-overlay-v110.test.js \
  test/streammonsters-arena-view-v15.test.js \
  test/streammonsters-effects-renderer.test.js \
  test/streammonsters-overlay-layout-queue.test.js \
  test/streammonsters-creator-runtime.test.js \
  test/streammonsters-creator-ui-v15.test.js \
  test/streammonsters-egg-stage-v110.test.js \
  test/streammonsters-jackpot-battle-v110.test.js \
  test/streammonsters-arcade-overlay-v6.test.js \
  test/streammonsters-overlay.test.js \
  test/streammonsters-public-events-v15.test.js \
  test/streamalchemy-ui-i18n.test.js --runInBand
```

Final run: 12 suites passed, 153 tests passed, 0 failed.

Additional gates:

- Node syntax checks passed for all changed JavaScript runtime files.
- Focused ESLint with `--quiet` passed for all changed JavaScript and the new test.
- `git diff --check` passed.
- A deliberately broader `streammonsters-free-egg-drops-v6.test.js` probe still has one pre-existing display-name mismatch (`Viewer A` expected, `viewer-a` received). It is outside this overlay task and no code in that path was changed.

## Self-review

- Public input is limited to the existing projected `eggStage`; DOM text is assigned through `textContent`, image URLs remain restricted to the plugin asset prefix, and opaque projector visual IDs are used as keys.
- Gift/owned provenance is checked independently of stage text, so a gift cannot acquire `!adopt` through a malformed public-looking state alone.
- Snapshot reconnect and live events converge through the same controller model.
- WebGPU and Canvas2D/CSS receive the same director beats; device loss, low-quality fallback and reduced-motion behavior remain owned by the existing effects renderer.
- Existing 16:9 and portrait HUD DOM was preserved. The shelf uses responsive clamps and the common 74/26 boundary.
- The unrelated untracked implementation-plan document in the worktree was preserved and is not part of this task commit.

## Known concern

This task used DOM/controller, contract and existing real-overlay harness tests. It did not start a live LTTH server or perform an OBS/browser-source screenshot because the brief explicitly prohibited using live port 3000.

## Fix round 1

Review findings addressed:

- `GET /api/streammonsters/creator-state` now includes the same sanitized `EggStageProjector.snapshot()` used by the public reconnect route. The creator shelf diagnostic therefore receives real projected eggs without database IDs, viewer IDs, gift IDs, or raw rows.
- `!adopt` expiry now searches all shelf items with the matching opaque visual ID, including the rotating overflow preview. The ninth public egg loses its callout after eight seconds while retaining its gold ring.

RED command:

```text
runtime\node\node.exe node_modules/jest/bin/jest.js \
  test/streammonsters-jackpot-overlay-v110.test.js \
  test/streammonsters-routes-security.test.js --runInBand
```

Result: 2 suites failed with exactly 2 failing tests. `creatorState.payload.eggStage` was `undefined`; one overflow `data-adopt-callout` remained after the timer.

GREEN command:

```text
runtime\node\node.exe node_modules/jest/bin/jest.js \
  test/streammonsters-jackpot-overlay-v110.test.js \
  test/streammonsters-routes-security.test.js \
  test/streammonsters-egg-stage-v110.test.js \
  test/streammonsters-creator-runtime.test.js \
  test/streammonsters-creator-ui-v15.test.js --runInBand
```

Result: 5 suites passed, 61 tests passed, 0 failed.
