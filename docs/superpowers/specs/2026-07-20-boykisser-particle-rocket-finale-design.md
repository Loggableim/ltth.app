# Boykisser Particle Rocket Finale Design

**Date:** 2026-07-20
**Status:** Approved
**Supersedes:** The stationary vector-billboard hero described in `2026-07-20-boykisser-vector-finale-design.md`

## Goal

Furry Celebration must remain visibly and mechanically a fireworks show. Every Boykisser appearance is formed by particles after a real rocket flight. The finale must also contain several special rockets with Trans Pride and rainbow trails, and no rocket, trail, burst, glow, or glyph may look cropped at the top of the viewport.

## Choreography

1. Small and medium Boykisser rockets launch normally and burst into readable particle formations.
2. Two Trans Pride comet rockets and two rainbow spiral rockets create distinct colored trails during the finale build.
3. A central hero rocket rises with a braided multicolor trail.
4. At the target, the hero rocket disappears exactly when the burst begins.
5. The burst forms a dense Boykisser particle sculpture with a white filled silhouette, black facial features, and red cheeks.
6. A rainbow halo and a Trans Pride ring expand around the sculpture before every layer fades and falls like fireworks.

No step displays a stationary raster image, texture card, or single vector billboard.

## Particle Formation

The supplied reference remains the canonical geometry. Its silhouette and feature polygons are sampled into role-aware particle positions:

- white particles fill the head and neck silhouette;
- black particles form both eyes, nose, mouth, and forehead detail over the white fill;
- red particles form both cheek marks;
- feature anchors receive guaranteed particles before optional fill samples.

Small formations use an adaptive 220-320 particle level of detail with enlarged feature sparks. The hero formation uses an adaptive 640-960 particle level of detail. Performance degradation may reduce optional white fill, but it must preserve the silhouette anchors and all facial-feature anchors.

## Rocket And Viewport Contract

Rocket body, flame, colored trail, and every resulting burst layer share one immutable correlation manifest and one viewport transform. The rocket follows a finite target-locked trajectory and is retired at the burst time, so it cannot overshoot the target.

The fitted formation reserves at least eight percent of viewport height above the complete visible envelope, including rocket nose, rotated quad, trail, glow, and bloom. The same rule applies to standard, star, ring, Boykisser, Trans Pride, rainbow, and other rocket variants. Below-canvas launch origins remain permitted.

## Color Trails

Special-rocket trail palettes are explicit choreography data:

- Trans Pride: `#5BCEFA`, `#F5A9B8`, `#FFFFFF`, `#F5A9B8`, `#5BCEFA`;
- rainbow: `#E40303`, `#FF8C00`, `#FFED00`, `#008026`, `#24408E`, `#732982`.

Trail particles keep their assigned stripe color throughout flight. The palettes must not collapse to the rocket body's first color.

## Compatibility

The existing `furry-celebration` style id, goal-finale routing, Superfan routing, settings UI, preview endpoint, and renderer capability handshake remain unchanged. The former vector-hero flag is no longer emitted for Furry Celebration and may remain only as backwards-compatible parsing code until safely removed.

## Verification

Automated tests must fail on the current implementation and prove:

- no Furry Celebration layer materializes as a one-particle vector billboard;
- small and hero Boykisser layers retain required role anchors and particle-count floors;
- the hero cue uses `launchMode: rocket`;
- special Trans Pride and rainbow rockets have distinct multicolor trail specifications;
- rocket and burst commands use one correlation manifest and target transform;
- the rocket is absent after its burst time;
- all relevant rocket variants keep the required top headroom.

Hardware Chrome/WebGPU verification must render landscape and portrait cases at multiple resolutions and inspect full-flight frames, burst frames, role colors, semantic Boykisser landmarks, and the alpha envelope. The live overlay is refreshed only after focused Jest, lint, syntax, and hardware checks pass.
