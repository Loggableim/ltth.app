# EmojiRain Command Asset Lock Design

## Problem

Dynamic EmojiRain commands already emit their configured asset, for example `beans -> 🐾`, `rawr -> 🦖`, and `wuff -> 🐶`. When the global custom-image mode is enabled, the Classic, OBS-HUD, and WebGPU renderers replace that explicit command asset with an image from the global custom pool. With one configured custom image, every dynamic command therefore renders the same image.

## Confirmed Behavior

- Dynamic commands always render exactly their assigned emoji or image.
- Global custom images continue to replace assets for ordinary, non-command EmojiRain events.
- Command count, Teamlevel/SuperFan access, cooldowns, despawn duration, and collision behavior remain unchanged.
- Classic EmojiRain, Classic OBS-HUD, and WebGPU EmojiRain remain behaviorally equivalent.

## Design

Dynamic command handlers in both plugin backends attach an explicit boolean `assetLocked: true` to the spawn request. The centralized spawn payload preserves this field only when it is exactly `true`; built-in commands and normal events do not receive it.

The renderer adapters treat `assetLocked` as an exact-asset contract:

- Classic and OBS-HUD carry the flag through the immediate spawn path, spawn queue, and rate-limit queue into `spawnEmoji`. Their global custom-image branch runs only for unlocked spawns.
- WebGPU checks the flag before user mappings and the global custom-image pool. A locked emoji remains the configured glyph, a locked image remains its configured URL, and the existing profile-picture token continues to resolve to its supplied URL.
- No renderer mutates global configuration while a command is spawning.

This explicit contract is preferred over inferring behavior from `reason: "command"`, because it documents the asset guarantee at the component boundary and avoids coupling renderer policy to logging or analytics metadata.

## Error Handling

Invalid or empty command assets remain rejected by the existing configuration normalizer. If a locked image fails to load, the renderer's existing image fallback behavior applies; it must not fall back to an unrelated global custom image.

## Tests

- Both command-plugin contracts verify that successful dynamic command spawns emit `assetLocked: true` with the assigned asset.
- Classic standard and OBS-HUD renderer tests enable the global custom pool and verify that locked emoji commands still render their assigned glyph.
- WebGPU adapter tests enable the global custom pool and a conflicting user mapping, then verify that the locked command asset wins.
- A control test verifies that an unlocked ordinary spawn still uses the global custom image.
- Existing command, renderer-parity, lifetime, UI, and persistence regressions remain green.

## Rollout

The fix is committed on an isolated branch, verified, and merged locally into `main`. No server restart and no synthetic chat command are used. If the active runtime is updated in the same session, only the active EmojiRain plugin and its overlay are refreshed.
