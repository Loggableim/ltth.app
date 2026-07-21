# Wetterkontrolle WebGPU Implementation Plan

**Goal:** Ship an independent `webgpu-weather-control` open-beta plugin with a strict native WebGPU 1080p60 cinematic renderer for all thirteen Weather Control effects.

**Constraints:** Keep existing Weather Control independent; no 2D canvas fallback; default the WebGPU plugin and its community gamification off; retain a separately controllable Community HUD in both variants; publish a verified store ZIP and SHA-256.

### Task 1: Isolated state and backend contract

- Test first in `app/test/webgpu-weather-control-storage.test.js` that the database has independent WebGPU gift mappings and that a bootstrap import produces a safe independent config.
- Add `webgpu_gift_weather_mappings` and `get/set/getAll/delete/clearWebgpuGiftWeatherMapping(s)` methods in `app/modules/database.js`. The table uses `gift_id UNIQUE` and must not alter the legacy `gift_weather_mappings` contract.
- Add a pure `app/plugins/webgpu-weather-control/lib/bootstrap-config.js` export `createInitialWebgpuWeatherConfig(classicConfig, generateApiKey)` that deep-clones the classic persisted config while forcing `enabled: false`, `qualityPreset: 'auto'`, `adaptiveQuality: true`, a new API key, commands `wgweather`, `wgweatherlist`, `wgweatherstop`, and `gamification.enabled: false` / `gamification.overlay.enabled: false` / a fresh runtime state.
- The helper must tolerate missing or malformed old configs without throwing and return a fully usable config derived from Weather Control defaults. Do not create renderer code in this task.

### Task 2: Community HUD controls

- Test first that the Weather Control settings UI persists `gamification.overlay.enabled` independently from `gamification.enabled`, and that the overlay hides the full HUD and individual rows rather than replacing them with disabled text.
- Correct `app/plugins/weather-control/{main.js,ui.html,overlay.html}` without changing its default community setting.
- Ensure a disabled gamification configuration neither creates a quest nor processes events, rewards or timers. The equivalent behavior is required later in the WebGPU backend.

### Task 3: Independent plugin surface and transactional migration

- Create `app/plugins/webgpu-weather-control/` by mechanically copying the classic control surface and adapting every identifier, route, API-key header, Socket event, Flow action, GCCE command and locale key to `webgpu-weather-control` / `webgpu-weather:*` / `/api/webgpu-weather/*` / `X-WebGPU-Weather-Key`.
- Integrate Task 1's bootstrap helper and mapping storage. First startup reads `plugin:weather-control:weather_config` plus legacy mappings, performs the one-time import, and records completion only after the WebGPU config and mappings have been written. Existing WebGPU data is never overwritten.
- Give the plugin a disabled `1.0.0` working-beta manifest, four locales, independent UI/overlay routes and diagnostics state. Preserve all user control surfaces while keeping new community gamification/HUD disabled by default.
- Test API-key isolation, namespaced socket events, Flow/GCCE definitions and idempotent transactional first-run migration before adding renderer code.

### Task 4: Native WebGPU cinematic renderer

- Add `gpu/weather-framegraph.js` and `gpu/cinematic-weather-engine.js` with no `getContext('2d')`: storage-buffer compute simulation, GPU-written indirect-draw arguments, instanced geometry, RGBA16F HDR/intermediate targets, bloom, temporal accumulation, GPU timestamps where available and a queue-latency fallback.
- Put rain, snow, storm, fireflies, meteors, sakura and embers into the compute particle system. Include per-particle depth/velocity trails; snow accumulation; and rain splash/ripple/ground-mist state. Keep particle simulation and compaction on the GPU rather than a CPU particle loop.
- Put fog, sunbeam, storm darkness, thunder/lightning, glitchclouds, aurora and heatwave into native WGSL fullscreen/volumetric passes. The thunder pass must synthesize branched bolts and impact flash; the aurora, glitch and heatwave passes need distinct cinematic treatments. Apply active layers and all documented options before compositing.
- Use a fixed 1920x1080 composition ceiling. `auto` targets 60 FPS and increases particle capacity, volumetric samples, bloom passes and temporal history from measured headroom; it steps down these budgets before frame time exceeds the target.
- Add strict transparent unsupported/error/device-lost behavior that destroys GPU resources and reports diagnostics, FPS, GPU/frame time and active-particle metrics to the overlay/UI. No alternate renderer and no nontransparent fallback panel in the OBS composition.
- Test the renderer contract, all thirteen effects, option/layer propagation, adaptive quality and device loss with a mocked WebGPU device; assert that no plugin renderer source contains `getContext('2d')`.

### Task 5: Store-beta delivery and live acceptance

- Add manifest version `1.0.0`, `enabled: false`, `devStatus: 'working-beta'`, localized descriptions and README. Community gamification stays present but disabled by default.
- Add the official `open-beta` registry entry, source-matching ZIP and exact SHA-256. Capture and validate a 1080p overlay screenshot from a real WebGPU browser run before publishing.
- Run targeted and package verification, then validate five simultaneous effects plus FPS, GPU time and active-particle telemetry in the browser/OBS-compatible 1080p overlay.
