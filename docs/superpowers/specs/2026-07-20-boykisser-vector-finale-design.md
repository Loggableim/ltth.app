# Boykisser Vector Finale Design

## Status

Approved in conversation on 2026-07-20. This document is the implementation contract for replacing the generic cat-like Furry Celebration hero with a vector reconstruction of the user-provided Boykisser reference.

## Problem

The current `boykisser-geometry.js` model encodes a generic cute-cat face: crescent eyes, pink inner ears, a pink tongue, and a rounded head outline. Its tests preserve those incorrect landmarks. The result reads as a wolf or generic furry character instead of the supplied Boykisser reference.

The existing particle-only rendering also cannot reproduce the reference faithfully. Dark particles are difficult to read on the transparent black OBS surface, and an outline-only particle cloud cannot provide the solid white field needed behind the black eyes and mouth.

## Goals

- Reconstruct the supplied portrait as resolution-independent vector geometry.
- Preserve the defining silhouette: tall triangular ears, central forehead tuft, broad cheek tufts, rounded lower face, and tapered upper torso.
- Reproduce the facial landmarks: long black eyes with upper strokes, tiny centered nose, black omega-shaped mouth, and red zigzag cheek marks.
- Remove the tongue and pink inner-ear treatment.
- Present the final hero as a large, readable centerpiece while retaining fireworks, depth, and surrounding particle choreography.
- Derive smaller build-phase Boykisser particle glyphs from the same canonical geometry.
- Keep the complete hero inside the safe viewport envelope in landscape and portrait layouts.

## Non-goals

- No rasterized copy of the supplied image will be stored or shipped.
- No external image URL, upload, SVG DOM overlay, or third-party rendering dependency will be introduced.
- The other Furry Celebration choreography, Superfan routing, gift behavior, and unrelated firework shapes will not be redesigned.

## Chosen Approach

Use one canonical JavaScript vector model that generates both CPU samples and WGSL helpers. The final core Boykisser layer becomes a single native WebGPU vector billboard. Non-core Boykisser layers continue to use particles, but their landmarks are sampled from the corrected canonical trace.

This approach is preferred over an SVG overlay because it remains in the WebGPU render and depth pipeline. It is preferred over an atlas texture because the existing 116-pixel usable atlas slot would visibly soften a large finale hero.

## Canonical Vector Model

`gpu/boykisser-geometry.js` remains the single source of truth and is expanded from stroke-only landmark sampling into explicit vector primitives:

- filled silhouette polygons for head, ears, cheek tufts, and upper torso;
- filled black eye shapes and nose;
- stroked black polylines for upper eye lines, forehead detail, and omega mouth;
- stroked red polylines for both zigzag cheek marks;
- normalized portrait coordinates derived from the supplied 2452 by 3259 source file.

The data model must be deterministic, immutable, and serializable so its geometry signature continues to prove CPU/WGSL parity. The shipped colors are canonical white, near-black, and reference red. Show palettes must not tint the core hero away from those colors.

The particle sampler will expose only recognizable reference landmarks. The old crescent-eye, inner-ear, and tongue features are removed. Low-density sampling must still reserve at least one sample for every required landmark.

## WebGPU Hero Rendering

`gpu/webgpu-particle-engine.js` will recognize a core Boykisser glyph as a vector-decal command:

- one stationary billboard particle rather than a cloud of repeated sprites;
- a dedicated command flag distinguishing the vector hero from build-phase particle glyphs;
- portrait aspect ratio preserved inside the square particle quad;
- fragment-shader coverage generated analytically from the canonical polygons and strokes;
- premultiplied output containing solid white silhouette pixels, black facial pixels, red cheek pixels, and transparent background;
- no additive glow pass over the interior facial details;
- a controlled fade/scale reveal while the surrounding existing fireworks supply the glow and motion.

The compute path must center the vector billboard instead of applying the normal glyph-point velocity. Existing depth projection and visible-envelope fitting remain authoritative for placement and scale.

## Choreography Integration

The existing `core: true` Boykisser layer in the final Furry Celebration cue selects the vector-decal path. Earlier Boykisser layers remain particle glyphs so the finale still builds toward the crisp final portrait.

The final vector hero must:

- remain fully visible at the planner's supported landscape and portrait resolutions;
- hold long enough for immediate visual recognition;
- preserve the existing finale duration and event ordering;
- coexist with, but not be obscured by, foreground fireworks.

## Failure Handling

The vector hero has no network or decoding dependency. Invalid vector data must fail focused tests and shader compilation before deployment. If the core marker is absent, the engine retains the corrected particle-glyph behavior instead of attempting a vector decal.

## Test-Driven Implementation

Implementation begins with failing tests that assert the supplied-reference contract:

1. geometry features include the correct silhouette, long eyes, nose, omega mouth, and red cheek marks;
2. forbidden generic-cat landmarks (crescent eyes, inner ears, tongue) are absent;
3. CPU sampling and generated WGSL share one updated geometry signature;
4. a core Boykisser layer produces one centered vector-decal command, while non-core layers retain particle density;
5. the fragment shader contains vector silhouette, facial-detail, and red-accent coverage and suppresses the hero's additive interior glow;
6. the hero envelope remains inside all supported viewport bounds;
7. the focused Jest suites and GPU harness compile and run without regressions.

After automated checks, the modified runtime files are copied into the active installation, the server is restarted to clear Node and shader caches, and the live overlay is inspected at the same surface used for user testing.

## Acceptance Criteria

- At first glance the final hero is identifiable as the supplied Boykisser reference, not a wolf or generic furry face.
- The white silhouette, black facial marks, and red zigzag cheeks remain crisp at large finale scale.
- The entire ears and upper torso stay on-screen without clipping.
- There is no visible tongue or pink inner-ear fill.
- The Superfan finale can select and run Furry Celebration without changing its routing or UI behavior.
- Existing standard, star, ring, and other firework types retain their current bounds behavior.
