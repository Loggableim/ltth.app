# Arena ability rotator design

## Goal

Make Arena's direct abilities readable in the existing lower information rotator instead of relying on the small, permanent upper-left legend.

## Behaviour

- The lower Arena information rotator adds three independent ability cards when direct abilities are enabled:
  - `!boost – Tempo`
  - `!shield – Schutz`
  - `!bomb – Wurf`
- The cards use the same queue, rotation interval, placement, and language-mode behaviour as the existing strategy, custom, and gift cards.
- The existing upper-left ability legend remains available, but is disabled by default through a new Arena configuration flag.
- The upper legend is rendered only when that flag is explicitly enabled.
- The per-player boost and shield charge or active rings remain unchanged. They are gameplay state indicators, not instruction text.

## Configuration and data flow

- Add `topOverlayShowAbilityLegend` to Arena defaults with the value `false`.
- Expose it as an Arena dashboard checkbox labelled for showing the direct abilities at the top of the overlay.
- Persist it through the existing Arena configuration endpoint. Its state snapshot is already delivered to both Canvas and Pixi overlay renderers through `arena:state` and runtime config updates.
- A legacy saved configuration without the property behaves as `false`.

## Rendering

- Canvas and Pixi keep their shared ability legend implementation but do not draw it unless `topOverlayShowAbilityLegend` is true.
- The lower rotator owns all default ability instruction text. It must omit the ability cards when direct abilities are disabled.

## Verification

- Add focused regression coverage that verifies the three independent lower rotator messages, their conditional inclusion, and the default-off upper legend configuration.
- Verify both renderers gate the upper legend behind the new configuration property.
- Run the focused Arena suite using the bundled Node runtime, then inspect the running Arena overlay to confirm the lower cards rotate and the upper legend is absent by default.

## Scope

This change only moves instructional text and adds its display toggle. It does not alter ability cooldowns, combat behaviour, command handling, the information-rotator cadence, or player ability rings.
