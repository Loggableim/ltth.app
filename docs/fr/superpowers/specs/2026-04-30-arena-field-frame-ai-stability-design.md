# Arena Field Frame And AI Stability Design

## Goal

Add configurable Arena field sizes and field frame styles while removing the near-equal unarmed pressure loop that makes balls jitter, wall-stick, and lose intent.

## Arena Size

The backend Arena config exposes an `arenaSizePreset` plus explicit `arenaWidth` and `arenaHeight`.

- `standard`: 1920 x 1080
- `wide`: 2560 x 1080
- `compact`: 1280 x 720
- `vertical`: 1080 x 1920
- `custom`: preserves user-entered width and height

The admin UI updates width and height when a non-custom preset is selected. The engine continues to use `arenaWidth` and `arenaHeight` as the authoritative simulation bounds so existing spawning, spatial indexing, and boundary logic remain unchanged.

## Field Frame

The Arena config adds `fieldFrameEnabled`, `fieldFrameDesign`, `fieldFrameThickness`, and `fieldFrameGlow`. The overlay renders the frame as a DOM layer above the canvas renderer, so the same frame works with Canvas and Pixi/WebGPU rendering.

Available designs:

- `neon-grid`
- `hazard-zone`
- `glass-circuit`
- `retro-arcade`
- `high-contrast`
- `minimal`

## AI Stability

Unarmed pressure behavior now requires a meaningful mass advantage. Near-equal unarmed rivals no longer become pressure targets, even for aggressive personalities. This keeps aggressive personality flavor for clearly advantaged balls while preventing symmetric chase loops where both agents keep pushing into each other or into walls without a valid payoff.

Armed pressure remains looser because weapons are explicit combat tools. Unarmed pressure is limited to the strategic gap before direct absorption is possible: large enough to bully, not large enough to eat.

## Verification

Focused verification lives in `app/plugins/game-engine/test/arena-engine.test.js`:

- Config/state exposure for size and frame settings.
- Default standard 16:9 Arena with enabled neon frame.
- Overlay contract for DOM frame rendering and all frame designs.
- Admin UI contract for presets, custom dimensions, and frame controls.
- Regression tests for near-equal pressure suppression and meaningful-advantage pressure retention.
