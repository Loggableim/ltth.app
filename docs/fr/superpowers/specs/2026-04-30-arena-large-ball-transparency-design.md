# Arena Large Ball Transparency Design

## Goal

Large Arena balls should optionally become more transparent as they grow so they do not dominate the stream image.

## Config

The Arena config adds:

- `largeBallTransparencyEnabled`: enables the behavior.
- `largeBallTransparencyStartMass`: mass where fading begins.
- `largeBallMinOpacity`: lowest opacity at `maxMass`.

Defaults keep the feature active but conservative:

- enabled: `true`
- start mass: `55`
- min opacity: `0.42`

## Rendering

The overlay computes opacity with a single `playerVisualAlpha(player)` helper. Mass below the start threshold stays fully opaque. Mass between the threshold and `maxMass` fades smoothly toward the minimum opacity.

Canvas uses this alpha around the ball body/avatar/chrome/weapon visuals. Text labels stay readable. Pixi uses the same helper on the player container so accelerated rendering follows the same rule.

## Verification

Focused tests cover:

- Engine defaults and state exposure.
- Admin UI controls and save/load wiring.
- Overlay helper and usage in Canvas and Pixi render paths.
