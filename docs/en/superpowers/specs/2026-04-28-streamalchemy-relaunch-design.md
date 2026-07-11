# StreamAlchemy Relaunch Design

Date: 2026-04-28
Status: Approved design direction, pending implementation plan

## Goal

Rebuild StreamAlchemy into a functional, cost-controlled crafting plugin. TikTok gifts create RPG-style base items. Two compatible base items can be crafted into one persistent crafted item. Crafting consumes the two input items. A crafted recipe is generated once, cached permanently, and reused without further image-generation cost.

## Current Problems

- The existing plugin has useful parts, but the runtime behavior is inconsistent.
- Crafting does not cleanly consume both base items.
- The current JSON persistence writes under `app/plugins/streamalchemy/data`, which is not appropriate for runtime plugin data.
- Image generation, fusion, tiers, routes, commands, and UI logic are mixed in one large entry file.
- LightX appears in the UI but is not fully wired into the backend provider routing.
- Existing tests cover isolated generation services, but not the real Gift -> Inventory -> Crafting -> Overlay flow.

## Architecture

The relaunch keeps the plugin identity `streamalchemy`, but replaces the internal structure with focused modules.

Core modules:

- `eventProcessor`: receives TikTok gift events, normalizes gift/user/repeat data, and starts item handling.
- `inventoryService`: owns all user inventory changes, including add, consume, restore, and query operations.
- `recipeService`: builds deterministic recipe keys, checks cached results, and persists new recipe mappings.
- `generationService`: routes image-generation jobs through local, SiliconFlow, OpenAI, LightX, or placeholder providers.
- `streamalchemyRoutes`: registers REST endpoints for UI, overlay, items, recipes, jobs, and settings.
- `overlayPublisher`: emits clean Socket.IO events for OBS overlays.
- `legacyImporter`: optionally imports old JSON data without deleting or rewriting the legacy files.

The backend stays in CommonJS style and uses existing plugin APIs: `api.registerRoute()`, `api.registerSocket()`, `api.registerTikTokEvent()`, `api.getConfig()`, `api.setConfig()`, `api.getDatabase()`, and `api.getPluginDataDir()`.

## Persistence

Use SQLite through the existing database helper where possible. Runtime data should not be written into the plugin source directory.

Tables:

### `streamalchemy_items`

Stores every item once.

Fields:

- `item_id`
- `source_type`: `gift`, `crafted`, `manual`, `upgraded`, `placeholder`
- `gift_id`
- `name`
- `rarity`
- `coin_value`
- `image_url`
- `style`
- `prompt_version`
- `generator`
- `created_at`
- `updated_at`

### `streamalchemy_user_inventory`

Stores item ownership per user.

Fields:

- `user_id`
- `item_id`
- `quantity`
- `first_obtained_at`
- `last_obtained_at`

Unique key: `(user_id, item_id)`.

### `streamalchemy_recipes`

Stores deterministic crafting results.

Fields:

- `recipe_key`
- `input_item_a_id`
- `input_item_b_id`
- `style`
- `prompt_version`
- `result_item_id`
- `created_at`

Unique key: `recipe_key`.

### `streamalchemy_generation_jobs`

Tracks image generation.

Fields:

- `job_id`
- `recipe_key`
- `item_id`
- `status`: `queued`, `running`, `succeeded`, `failed`, `skipped`
- `provider`
- `model`
- `prompt`
- `negative_prompt`
- `error`
- `created_at`
- `started_at`
- `finished_at`

### `streamalchemy_events`

Optional audit log for debugging stream behavior.

Fields:

- `event_id`
- `event_type`
- `user_id`
- `item_id`
- `recipe_key`
- `payload_json`
- `created_at`

## Crafting Rules

1. A TikTok gift event arrives.
2. The event is normalized into `userId`, `giftId`, `giftName`, `coinValue`, and `repeatCount`.
3. The base item for `giftId` is found or created.
4. The user receives the base item.
5. If a second craftable base item is present inside the configured time window, crafting starts.
6. Crafting consumes quantity `1` from each input item.
7. `recipeService` builds a deterministic recipe key from sorted input item IDs, style, and prompt version.
8. If the recipe already exists, the cached result item is granted immediately. No image job is created.
9. If the recipe does not exist, `generationService` creates the image and item, then `recipeService` stores the mapping.
10. If generation fails, both input items are restored to the user inventory and a `crafting_failed` overlay event is emitted.

Base item repeats are processed one unit at a time so repeat gifts behave like repeated item grants.

## Recipe Cache Key

Recipe keys are stable and intentionally compact:

```text
craft:v1:<sortedItemAId>:<sortedItemBId>:<style>:<promptVersion>
```

The full prompt text is not part of the key. Prompt changes only create new recipe outputs when `promptVersion` is explicitly increased.

## Image Generation

The relaunch uses provider routing instead of hardcoded service calls.

Provider order is configurable. Recommended default:

1. `localComfy`
2. `siliconflow`
3. `openai`
4. `lightx`
5. `placeholder`

### `localComfyProvider`

This provider talks to a local ComfyUI server when available. It should:

- Probe whether ComfyUI is reachable.
- Submit a workflow through the ComfyUI API.
- Poll for completion.
- Store resulting images under `api.getPluginDataDir()`.
- Return a stable local URL served by the plugin route.
- Fail fast if the local server, model, or output file is unavailable.

Local generation must be optional. StreamAlchemy should remain functional without ComfyUI.

### `systemAnalyzer`

The plugin should expose a system analysis endpoint:

```text
GET /api/streamalchemy/system-analysis
```

The analyzer should inspect:

- OS
- CPU model and core count
- system RAM
- GPU model
- GPU VRAM
- NVIDIA driver and CUDA availability where detectable
- whether ComfyUI is reachable
- configured local model paths or ComfyUI checkpoint list, if available

The analyzer must not install anything automatically. It only reports capability and recommendations.

Detected development machine at design time:

- CPU: AMD Ryzen 9 5950X, 16 cores / 32 threads
- RAM: 32 GB
- GPU: NVIDIA GeForce RTX 3060
- VRAM: 12 GB according to `nvidia-smi`
- Driver: 595.79

Recommendation for this machine:

- Primary local model: `black-forest-labs/FLUX.1-schnell`
- Local backend: ComfyUI
- Suggested output size for live use: 768x768 first, optionally 1024x1024 if latency is acceptable
- Suggested steps: 4 for FLUX.1-schnell
- Queue concurrency: 1
- Remote fallback remains enabled to avoid stream failures

Reasoning:

- FLUX.1-schnell is Apache-2.0, supports commercial use, is designed for high quality in 1 to 4 steps, and is available in ComfyUI.
- A 12 GB NVIDIA GPU is realistic for local single-image generation, especially with ComfyUI workflows and CPU/offload options.
- Stable Diffusion 3.5 Medium is a good alternative when prompt adherence is preferred, but its Stability Community License needs to be respected.
- Qwen-Image is interesting for text-heavy images and precise text rendering, but StreamAlchemy item icons should not contain text, so it is not the default recommendation.

### Provider Selection Rules

The router should select a provider by capability:

- If local generation is enabled, ComfyUI is reachable, and the selected local model is available, use `localComfy`.
- If local generation is unavailable, use the next configured remote provider with a valid API key.
- If all image providers fail, generate a deterministic placeholder and mark the generation job as failed-with-placeholder.

The UI should show provider state clearly:

- `ready`
- `missing_api_key`
- `unreachable`
- `model_missing`
- `disabled`
- `last_error`

## Prompt System

Prompt version: `streamalchemy-v2`.

Principles:

- Short prompts.
- Stable structure.
- Explicit item-icon framing.
- No text in generated images.
- No people, characters, logos, or background scenes.
- User/gift names are sanitized and truncated before prompt insertion.

Base item prompt:

```text
Single fantasy RPG item icon inspired by TikTok gift "{giftName}".
Centered isometric object, transparent background, readable silhouette, premium game asset, soft glow.
No text, no logo, no character, no background scene.
```

Crafted item prompt:

```text
Single fantasy RPG item icon combining "{itemA}" and "{itemB}" into one new object.
Centered isometric object, transparent background, readable silhouette, premium game asset, {rarity} glow, {style}.
No text, no logo, no character, no background scene.
```

Provider-specific negative prompt:

```text
text, watermark, logo, letters, numbers, person, face, hands, full scene, busy background, blurry, cropped, duplicate item
```

Style presets:

- `rpg`
- `fantasy`
- `pixel`
- `anime`
- `cyberpunk`
- `cartoon`

## UI

Replace the large all-in-one UI with a focused dashboard:

- `Overview`: plugin status, queue state, provider state, current stream crafting activity.
- `Items`: search, filter, edit item metadata, view gift mappings.
- `Recipes`: input A + input B -> result, cache status, style, prompt version, generator.
- `Generation Jobs`: queued/running/failed/succeeded jobs, retry failed job.
- `Settings`: crafting window, provider order, local generation settings, prompt version, style defaults, rate limits.
- `Migration`: import old JSON data and show import report.

API keys must never be returned to the UI. The UI receives only boolean and status fields.

## Overlay

The overlay should consume simple semantic events:

- `streamalchemy:base_item_obtained`
- `streamalchemy:crafting_started`
- `streamalchemy:crafting_completed`
- `streamalchemy:crafting_failed`
- `streamalchemy:recipe_cache_hit`
- `streamalchemy:generation_job_started`
- `streamalchemy:generation_job_failed`

The overlay owns animation queueing. Backend events should not depend on overlay animation timing.

Cached recipe hits should still animate as successful crafting, but skip generation-wait states.

## Migration

The first relaunch version should include a safe import path:

- Read old `inventory_global.json` and `user_inventory.json` if present.
- Import items by stable IDs where possible.
- Import user quantities.
- Infer recipes from crafted items with `parentItems`.
- Write an import report.
- Mark import completion in plugin settings.
- Never delete or overwrite legacy JSON files.
- Re-running import should be idempotent.

## Error Handling

- Invalid gift events are ignored with a warning log.
- Inventory updates are atomic at the service level.
- Crafting failure restores consumed inputs.
- Generation timeout marks the job failed and restores inputs.
- Cache lookup failure does not generate duplicates if a recipe exists.
- Provider failures are stored in `streamalchemy_generation_jobs`.

## Tests

Required tests:

- Gift creates or reuses a base item.
- Repeat gift creates the correct quantity.
- Two gifts consume both base items and grant one crafted item.
- Existing recipe skips image generation.
- Generation failure restores both inputs.
- Provider fallback order is respected.
- Local provider is skipped when ComfyUI is unreachable.
- System analysis returns a recommendation without exposing secrets.
- Settings responses do not expose API keys.
- Legacy JSON import is idempotent.
- Overlay events are emitted in the expected order.

## Implementation Notes

- Keep old files until the relaunch is proven, but route new runtime through the new modules.
- Avoid destructive migration.
- Use `this.api.log()` in plugin backend code.
- Keep concurrency at 1 for image generation.
- Prefer SQLite for item, inventory, recipe, job, and event state.
- Store generated local images in `api.getPluginDataDir()`.

## Sources Checked For Local Generation

- FLUX.1-schnell model card: https://huggingface.co/black-forest-labs/FLUX.1-schnell
- Stable Diffusion 3.5 Medium model card: https://huggingface.co/stabilityai/stable-diffusion-3.5-medium
- Qwen-Image model card: https://huggingface.co/Qwen/Qwen-Image
- ComfyUI repository: https://github.com/Comfy-Org/ComfyUI

