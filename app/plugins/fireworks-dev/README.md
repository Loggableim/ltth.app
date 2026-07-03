# Fireworks Dev Bossfight

Experimental dev-edition overlay for LTTH. This plugin keeps the original `fireworks` plugin untouched and ships a separate bossfight-style scene system under the `fireworks-dev` namespace.

## What It Is

- Separate plugin ID: `fireworks-dev`
- Separate UI route: `/fireworks-dev/ui`
- Separate overlay route: `/fireworks-dev/overlay`
- Separate REST namespace: `/api/fireworks-dev/*`
- Separate Socket.IO namespace: `fireworks-dev:*`
- Disabled by default and marked experimental

The dev edition is designed to look and feel like a game encounter instead of a soft decorative overlay. It adds a scene director, theme system, encounter escalation, boss-energy HUD, quality scaling, and heavier screen FX.

## Stable And Dev Coexistence

The original `fireworks` plugin remains intact.

Operational rule:

- Install both if you want.
- Enable only one of them at a time.
- `fireworks-dev` refuses to start if stable `fireworks` is already active.

This prevents route, overlay, and event collisions.

## WebGL2 Requirement

`fireworks-dev` requires WebGL2 support in the browser source. If WebGL2 is unavailable, the overlay shows an explicit unsupported-state message instead of silently degrading.

Recommended OBS Browser Source:

- URL: `http://localhost:3000/fireworks-dev/overlay`
- Width: `1920`
- Height: `1080`
- FPS: `60`
- CSS: empty

## Scene Model

The dev overlay replaces the older monolithic effect path with scene-oriented modules:

- `SceneDirector`
- `ThemeManager`
- `FxGraph`
- `HudController`
- `EncounterController`
- `PerformanceScaler`
- `AudioDirector`

These modules coordinate bossfight pacing, combo escalation, ultimates, screen FX, and adaptive quality changes.

## Themes

V1 ships with three selectable themes:

- `inferno-siege`
- `neon-reactor`
- `celestial-titan`

Each theme changes:

- arena background and ambient tone
- particle palette
- impact style
- banner and HUD skinning
- audio bank selection

## UI Model

The settings UI uses two layers:

- Streamer mode: curated theme, encounter, and quality choices
- Pro mode: deeper tuning for bloom, backdrop, shockwave, heat haze, and related scene controls

This lets normal users get strong results quickly while still exposing deeper controls for tuning.

## Core Bossfight Features

- Theme-driven arena presentation
- Encounter modes: `skirmish`, `raid`, `finale`
- Combo-based escalation
- Boss-energy meter
- Ultimate charge tracking
- Milestone banners
- Follower celebration scenes
- Adaptive FPS-aware quality scaling
- Benchmark namespace isolated to `fireworks-dev`

## API Endpoints

### Configuration

- `GET /api/fireworks-dev/config`
- `POST /api/fireworks-dev/config`
- `POST /api/fireworks-dev/config/reset`

### Runtime Status

- `GET /api/fireworks-dev/status`
- `POST /api/fireworks-dev/toggle`
- `GET /api/fireworks-dev/benchmark/fps`
- `POST /api/fireworks-dev/benchmark/set-preset`
- `POST /api/fireworks-dev/benchmark/restore`

### Triggers

- `POST /api/fireworks-dev/trigger`
- `POST /api/fireworks-dev/finale`
- `POST /api/fireworks-dev/random`
- `POST /api/fireworks-dev/test-follower`

### Gift Mapping

- `GET /api/fireworks-dev/gift-mappings`
- `POST /api/fireworks-dev/gift-mappings`

### Uploads

- `POST /api/fireworks-dev/upload`
- `GET /api/fireworks-dev/uploads`
- `DELETE /api/fireworks-dev/uploads/:filename`

## Trigger Payload

The dev plugin accepts the legacy-style trigger fields and additional bossfight metadata.

```json
{
  "shape": "star",
  "intensity": 1.8,
  "position": { "x": 0.5, "y": 0.55 },
  "giftId": "5655",
  "userAvatar": "https://example.com/avatar.png",
  "duration": 2200,
  "theme": "neon-reactor",
  "encounterMode": "raid",
  "qualityProfile": "high",
  "impactLevel": "heavy",
  "ultimateTier": "alpha",
  "hudLabel": "Core Break",
  "cameraImpulse": 0.35,
  "screenFxPreset": "shockwave"
}
```

Additional field notes:

- `theme`: force a specific scene theme for the trigger
- `encounterMode`: scene pacing preset
- `qualityProfile`: `ultra`, `high`, `medium`, or `low`
- `impactLevel`: semantic impact tier used by scene FX
- `ultimateTier`: optional tag for larger attack classes
- `hudLabel`: short HUD callout
- `cameraImpulse`: shake/impact amount
- `screenFxPreset`: named screen-treatment hint

## Manual Testing

Useful checks after enabling the plugin:

1. Open `/fireworks-dev/ui`.
2. Confirm the theme selector and Pro mode controls render.
3. Load `/fireworks-dev/overlay` in a WebGL2-capable browser source.
4. Trigger a test firework and verify HUD updates.
5. Trigger a finale and verify banners, impact FX, and encounter behavior.
6. Toggle themes and confirm palette and background changes.
7. Run the benchmark and inspect the saved `fireworks-dev` results.

## Troubleshooting

### Overlay shows unsupported state

- The browser source does not expose WebGL2.
- Update OBS/browser runtime or move to a browser source with WebGL2 support.

### Dev plugin refuses startup

- Stable `fireworks` is still enabled.
- Disable stable `fireworks`, then enable `fireworks-dev`.

### Performance drops during heavy spam

- Lower `qualityProfile`
- Reduce max particles and effect-heavy options in Pro mode
- Use the benchmark tools to pick a lower preset

## Notes

- This plugin uses `api.getPluginDataDir()` for persistent files and uploads.
- The original `fireworks` plugin behavior should remain unchanged.
- The dev edition is intentionally experimental and tuned for visual impact first.

## License

CC BY-NC 4.0 License - Part of PupCid's Little TikTool Helper
