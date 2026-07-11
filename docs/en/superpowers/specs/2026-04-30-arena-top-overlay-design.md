# Arena Top Overlay Design

## Goal

Upgrade the Live Arena top overlay so streamers can choose clear OBS-friendly HUD designs and control which language the rotating info messages use.

## Design

The existing Arena overlay route remains unchanged at `/overlay/game-engine/arena`. The backend config gains two display settings:

- `topOverlayDesign`: `widescreen`, `classic`, `landscape`, `slim`, or `high-contrast`
- `infoRotatorLanguageMode`: `de-en`, `en-de`, `de`, or `en`

`widescreen` is the default because it fits the 1920x1080 OBS use case and keeps the playfield readable. The overlay applies the selected design through a body dataset attribute, and CSS variants adjust width, density, contrast, and leaderboard visibility without moving game rendering logic out of canvas.

## Rotator

The current rotator stays in the top HUD. It always includes a beta warning, exactly shown as `Beta test - expect bugs`, and then cycles through localized feature messages. In bilingual modes, German and English messages alternate. Custom admin messages and gift weapon messages remain supported.

## Backend UI

The Arena settings tab gets two selects under `Overlay-Texte`: one for top overlay design and one for info rotator language. Loading and saving use the existing `/api/game-engine/config/arena` flow.

## Testing

Focused Jest tests cover:

- Arena config defaults and state exposure for the two new settings.
- Static overlay contract for design variants, beta warning, and localized rotator logic.
- Static admin UI contract for the new controls and save/load wiring.
