# WebGPU Fireworks 3.1.1 Release Hardening and Choreography Design

## Status and decision

The original design was approved on 2026-07-19. The C6/C7 visual amendment for Boykisser fidelity and complete rendered bounds was added from subsequent user feedback and awaits renewed approval before implementation planning resumes. The selected approach is contract-first hardening of the existing plugin. The renderer will not be rewritten, and the work will not stop at production-only hotfixes.

The completed plugin will be released as `3.1.1` with `devStatus: "stable"` and `enabled: false`. It remains opt-in because it requires the Loggableim OBS WebGPU build. Standard OBS remains unsupported.

## Goal

Deliver a production-ready WebGPU Fireworks plugin whose backend, Socket.IO contracts, configuration, benchmark, GPU lifecycle, image resources, UI, designer, audio scheduling, and all nine built-in choreographies behave truthfully and safely in the supported OBS WebGPU runtime.

Completion means all confirmed defects below are fixed with test-first regressions, all known runtime risks are either disproved or hardened, every supported show combination is validated, and the real OBS surface is proven rather than inferred from mocks alone.

## Current evidence

The authoritative implementation worktree is `.worktrees/webgpu-fireworks-3d-furry` on branch `codex/webgpu-fireworks-3d-furry`, starting this hardening phase at commit `1184b36965040a4182eab988da7fbdb8d7613558`.

The existing baseline proves:

- 38 focused WebGPU Fireworks Jest suites pass with 938 tests.
- 10,368 generated plans covering nine styles, three lengths, two orientations, three intensities, and 64 seeds satisfy current planner/runtime invariants.
- All 30 plugin JavaScript files pass `node --check`; all five JSON files parse.
- Production dependency audit reports zero vulnerabilities.
- Isolated Chrome/D3D WebGPU compiles the current WGSL and renders basic particles.
- The real OBS WebGPU source previously reported renderer protocol 3, `depth3d-v1`, `boykisser-v1`, 20 loaded sounds, zero failed sounds, and a successful Furry finale in portrait and landscape.
- The broad application Jest suite already has unrelated baseline failures in guide/workflow and AnimazingPal areas. Those failures must not be attributed to this plugin, and this work must not add new broad-suite failures.

These passes do not prove completion because the audit reproduced 27 uncovered defects and several runtime gaps.

## Approaches considered

### Selected: contract-first incremental hardening

Keep the existing public routes, socket event names, show DSL, WebGPU renderer, and FIFO finale queue. Repair each ownership and lifecycle boundary behind those interfaces, add one failing regression per defect, and validate each subsystem before moving to the next. This minimizes compatibility risk while addressing root causes.

### Rejected: renderer/backend rewrite

A rewrite could produce cleaner modules but would invalidate the large existing behavior surface, make visual parity hard to prove, and raise regression risk across gifts, goals, Superfans, flows, previews, audio, and OBS-specific behavior.

### Rejected: production-critical patch set only

Fixing only renderer crashes and trigger routing would leave configuration lies, inaccessible controls, malformed uploads, incorrect formations, false telemetry, and declared rest windows visibly occupied. That does not satisfy the requested complete plugin.

## Global constraints

- Preserve CommonJS style and 2-space JavaScript indentation.
- Preserve all existing public route paths, Socket.IO event names, Flow action IDs, persisted configuration keys, show IDs, and accepted legacy payload shapes unless this document explicitly tightens invalid input.
- Use backend logging through the existing logger and plugin logging through `this.api.log()`.
- Do not write persistent data into the plugin directory.
- Do not modify or discard unrelated generated docs, locale files, sitemap changes, user data, runtime databases, logs, or OBS configuration.
- Add no new production dependency unless the same behavior cannot be implemented safely with existing platform APIs.
- Every behavior change starts with a regression test that is observed failing for the expected reason.
- The supported browser runtime is the Loggableim OBS WebGPU build. Standard OBS is not a fallback target.
- Publishing, pushing, plugin-store packaging, and merging to `main` are outside this implementation unless separately requested.

## Architecture

### Configuration is the source of runtime truth

`lib/config-schema.js` remains the canonical normalization boundary. Backend behavior reads normalized configuration directly or through one `applyRuntimeConfig()` path; it must not retain shadow values that drift after a settings save.

The browser UI cannot import the CommonJS schema directly, so a contract test will compare every range input and enum option against the exported schema constants. The UI may render friendly controls, but values sent to the backend must cover and round-trip the full supported range.

FPS thresholds will be normalized relationally: `minFps` and `minTargetFps` cannot exceed `targetFps`. Empty or whitespace-only chat keywords are removed. Accepted colors must render equivalently in the GPU parser, including `#RGB` and `hsla(...)`.

### Renderer sessions are authenticated by registration state

A live renderer becomes eligible only after `webgpu-fireworks:register-overlay` creates telemetry with `registered === true`. Non-benchmark status or FPS messages from an unregistered socket are ignored and never create eligibility.

Telemetry uses distinct clocks:

- `statusUpdatedAt` controls renderer readiness and finale targeting.
- `fpsUpdatedAt` controls FPS health.
- Neither message type refreshes the other clock.

Target selection aggregates all connected, registered, non-benchmark renderers with fresh ready status. One newer failed renderer cannot mask another eligible ready renderer. Capability-specific delivery remains direct and exactly once per eligible target.

### Trigger APIs return execution truth

Every public entry point returns the structured result from the operation it performs. HTTP, Flow, Goals, follower-test, preview, benchmark, and Superfan paths must distinguish accepted, rejected, renderer-not-ready, disabled, busy, and validation failures.

Goal-triggered finales respect both `config.enabled` and `config.goalFinaleEnabled`. The Goals integration passes an explicit `source: "goal"` in the existing object-form request so `triggerFinale()` can enforce the goal switch without changing the public method signature. Manual test routes retain their documented explicit bypass only. The finale Flow action returns the same `{ accepted, reason, code }` result as `triggerFinale()`.

Follower delay uses nullish semantics so `0` remains immediate. Every delayed follower rocket and notification timer is registered in a lifecycle-owned set and cleared during plugin destruction or reload.

### Benchmark state is isolated

Concurrency admission occurs before payload planning. Every benchmark session owns a deterministic spawn planner; successful and rejected benchmark requests cannot mutate the live planner. A benchmark renderer must be registered, bound to the same session, fresh, visible, and ready before work is accepted.

Benchmark session timers, socket bindings, pending acknowledgements, and planner state are released on completion, expiry, disconnect, and plugin destruction.

### GPU resources are generation-scoped

The renderer has a monotonically increasing resource generation. GPU devices, buffers, readbacks, submitted batches, and queued commands carry or capture that generation.

Configuration changes that alter `maxTotalParticles` atomically recreate capacity-dependent resources. Once a config update is acknowledged, `renderer.maxParticles` and the allocated buffers match the normalized value for the complete supported range of 512 through 16,384 particles.

Readback callbacks capture the exact buffer they mapped plus the generation. Results or errors from obsolete generations are discarded without changing current renderer status. Device-loss recovery is serialized by an in-progress promise, not a lifetime latch. A successful recovery clears the recovery state so a later independent loss can recover again.

Device loss fails the owning active finale, purges commands and readbacks from the lost generation, rebuilds resources, and resumes in a ready state. No pre-loss command may appear in the first recovered frame.

Managed batches are re-aged at actual GPU admission. Commands past their finale deadline or owner completion are dropped and counted; remaining life is reduced by real defer time. Resolution/orientation is resolved from normalized coordinates at admission so a mid-show resize cannot send future layers offscreen.

### Image resources are bounded and visually stable

The 8 by 8 atlas retains slot 0 as the non-image fallback and exposes 63 image slots. Atlas entries track last use and a conservative `inUseUntil` derived from scheduled delay and particle lifetime. Only entries no longer referenced by potentially visible particles can be evicted. If every slot is pinned, the new particle uses the non-image fallback rather than corrupting an active image.

Decoded images are released after upload. The outer load-promise cache is bounded, removes failed requests, applies a finite timeout, and permits retry. A 64th and later unique image can reuse an expired slot without reloading the page. Atlas sampling must not bleed neighboring cells; mip generation is disabled or sampling is explicitly clamped to a safe level.

### GPU telemetry reports what its name claims

`gpuFrameMs` covers the complete compute plus scene/trail/glow/bloom/composite GPU submission. If full-frame timestamps are unsupported, the value is reported as unavailable rather than relabeling compute-only time as frame time.

Adaptive pressure includes allocated delayed particles and recent cumulative drops. Idle behavior and bloom-disabled allocation will be measured in Chrome and OBS; any measured violation of the configured minimum FPS or unbounded growth is treated as a defect before release.

### Visible bounds cover the rendered envelope, not only its center

Every submitted command is fitted at actual GPU admission against the current logical viewport after resolution, orientation, and depth are known. A single shape-envelope registry covers all current renderable IDs 0 through 26: every legacy shape, standard and avatar-headed rockets, every V2 primitive, and every V2 glyph. Adding a new renderable shape without an envelope profile fails a contract test.

The conservative envelope includes the shape's maximum particle displacement over its visible lifetime, gravity/drag/turbulence, perspective scale, rotated particle or rocket quad, trail width, split children, glow, and bloom radius. If an envelope would cross the viewport, the complete correlated effect group is translated into the safe region first and, only when translation cannot fit it, uniformly reduced with one shared intensity/size transform so its proportions, formation spacing, and rocket path remain intact. Individual vertices and particles are never clamped at the clip edge because that would deform stars, rings, glyphs, and rocket bodies.

The standard rocket body, flame, optional avatar head, and decal remain fully visible through the upper end of their swept path. A launch origin or exhaust trail may intentionally begin below the bottom edge, but no rocket nose, burst, particle sprite, glow, or bloom may be cut by the top edge. The same full-envelope rule applies to side and bottom edges once a burst is onscreen.

### Choreography uses visible and audible time, not only explosion beats

The show planner/runtime exposes or derives an activity interval for each rocket, layer, split child, bang, and crackle. A declared rest/breath window is valid only when none of those intervals overlaps it.

All built-in styles retain a recognizable opening, build, highlight, breath, and finale. Rest windows are made genuinely quiet by moving launches and preceding tails, not merely by moving explosion timestamps.

Multi-shell `chrysanthemum`, `willow`, and `cathedral` cues receive deterministic aspect-aware layouts:

- `chrysanthemum`: a symmetric crown arc with distinct targets and alternating depth.
- `willow`: a broad descending canopy with distinct columns and depth progression.
- `cathedral`: symmetric side towers plus a higher central arch/apex pattern.

For any multi-shell spatial formation, targets are distinct, remain inside full-envelope-safe render bounds, and keep a normalized minimum center separation of 0.06. Portrait layouts use the narrower safe width without clipping; landscape layouts use the available width while preserving symmetry.

Furry Celebration retains its centered readable Boykisser hero, controlled depth, Pride accents, and real 600/1,000/1,500 ms reveal gaps for short/medium/long shows.

### Boykisser is a semantic character contract

The hero is not accepted merely because a generic animal-head glyph is centered. One deterministic geometry source samples points and semantic roles for tests and generates the WGSL representation, so the verified landmark model cannot drift from the shader. Its procedural geometry uses explicit semantic feature bands for a rounded white cat head, a small forehead tuft, two prominent triangular cat ears, separately readable pink inner ears, two symmetric high-contrast closed/crescent eyes, a tiny centered nose, the characteristic curved W-shaped smile with a visible pink tongue, and bilateral pink blush. Cheek fluff stays short and symmetric. The lower face remains broad and rounded; an elongated muzzle, narrow wolf jaw, oversized side spikes, or wolf-like ear silhouette is a failure.

Feature roles own their colors independently of incidental particle-index cycling: white/silver for the head, a high-contrast facial-mark color for eyes/nose/mouth, and pink accents for inner ears, tongue, and blush. Low-density fallback geometry retains every identifying landmark instead of dropping facial features first. A deterministic landmark contract verifies feature allocation, symmetry, containment, and relative placement, while real Chrome and OBS captures at portrait and landscape stream sizes verify that the rendered result reads immediately as the Boykisser meme rather than a fox or wolf.

### Settings and designer are keyboard complete

Performance controls expose the same bounds as the schema and show the actual value the backend will save. Loading, editing, saving, and reloading 8,192/10,000 and the extreme supported particle values cannot clamp silently.

Active shape selectors are native buttons or equivalent controls with an accessible name, keyboard focus, and `aria-pressed`. Enter and Space toggle them exactly like pointer activation. At least one active shape is always preserved.

Designer SVG shell handles continue to expose button semantics and support Enter/Space selection without triggering page scroll. Pointer dragging, keyboard selection, undo/redo, preview, save, and reload preserve the same geometry.

### Uploads validate real file types

Extension checks use an anchored, case-insensitive allowlist based on `path.extname()`. MIME type and a bounded signature/header probe must agree with a supported audio or image family. Invalid files return a 4xx validation result and any just-created invalid temporary file is removed. Multer size/type failures are not reported as generic server faults.

### Documentation and release surfaces align

The plugin README documents every supported HTTP route group, Socket.IO contract, Flow action, all six shapes including `paws`, the nine show styles, configuration ranges, the custom OBS prerequisite, and the stable opt-in status.

Manifest version, README version text, overlay asset cache keys, settings/designer asset cache keys, and release-alignment tests move together to `3.1.1`. `plugin.json` ends with `devStatus: "stable"` and `enabled: false`.

## Confirmed defect inventory

| ID | Area | Reproduced defect | Required result |
| --- | --- | --- | --- |
| B1 | Socket trust | An unregistered socket can publish ready status and receive a finale. | Only registered fresh renderer sessions are eligible. |
| B2 | Telemetry | FPS and renderer status refresh one generic timestamp and keep stale data alive. | Separate freshness clocks govern their own readings. |
| B3 | Goals | `goalFinaleEnabled: false` does not stop Goals-plugin calls to `triggerFinale()`. | Every goal path respects the goal-finale switch. |
| B4 | Superfan | A newer failed renderer blocks a ready eligible renderer. | Readiness is based on the eligible target set. |
| B5 | Followers | Delay `0` becomes 3,000 ms and delayed rockets survive destroy. | Zero remains zero; all follower timers are lifecycle-owned and cleared. |
| B6 | Benchmark | Planning mutates the shared live planner, even for a rejected busy request. | Admission happens first and benchmark planners are session-local. |
| B7 | Colors | Schema-accepted `#RGB` and `hsla(...)` render as white. | Every accepted format produces the intended RGBA value. |
| B8 | Combo | Saved `comboTimeout` is acknowledged but the runtime keeps its initial value. | Saved normalized config immediately controls combo expiry. |
| B9 | Chat | An empty keyword matches every message. | Empty keywords are discarded and cannot trigger. |
| B10 | Follower API | Empty request bodies cause 500 and handler rejection is reported as success. | Defaults work; status/body reflect the handler result. |
| B11 | Performance config | Minimum FPS values can exceed target FPS. | Relational normalization produces a coherent configuration. |
| B12 | Flow | Finale Flow discards the `triggerFinale()` result. | Flow returns the structured execution result. |
| B13 | Upload | Substring filtering accepts extensions such as `.mp3evil`. | Extension, MIME, and signature validation reject disguised files with 4xx. |
| G1 | Image atlas | The atlas exhausts after 63 images and both image/promise caches grow without bound. | Safe eviction, bounded caches, timeout/retry, and post-63 reuse work. |
| G2 | GPU capacity | `maxTotalParticles` and benchmark presets do not resize the live pool. | Allocated GPU capacity always matches acknowledged config. |
| G3 | Readback | A stale async readback touches replacement resources after recovery. | Exact-buffer generation guards ignore obsolete completion. |
| G4 | Recovery | Only the first device loss can recover. | Two sequential losses both recover to fresh ready devices. |
| G5 | Spawn queue | Pre-loss commands render as ghost particles after recovery. | Lost-generation work is purged before the first recovered frame. |
| G6 | Telemetry | `gpuFrameMs` measures compute only. | It measures the full GPU frame or reports unavailable. |
| G7 | Admission | Deferred batches keep stale life/deadline values and can appear after completion. | Admission re-ages or expires every deferred command. |
| C1 | Settings | UI particle sliders support only a fraction of backend-valid values. | UI and schema bounds round-trip without clamping. |
| C2 | Formations | Nishiki/Aurora multi-shell cues collapse onto one target. | Every spatial multi-shell cue has distinct aspect-safe targets. |
| C3 | Timing | Declared rest windows contain rockets, tails, bangs, or crackle. | Rest windows are visibly and audibly empty. |
| C4 | Accessibility | Active-shape controls are pointer-only `<div>` elements. | Focus, role/name/state, Enter, and Space are supported. |
| C5 | Designer | SVG handles advertise button semantics but cannot activate by keyboard. | Enter/Space selects the focused handle identically to click. |
| C6 | Character fidelity | The procedural Boykisser reads as a generic wolf-like head and lacks sufficiently distinct semantic landmarks. | Rounded cat geometry, iconic face, inner ears, tongue, and blush remain immediately recognizable at stream size. |
| C7 | Visible bounds | Star, ring, standard rockets, and potentially other effects are admitted by center point while their rendered extent is cut at the top. | Every registered shape and rocket variant fits its complete particle/sprite/trail/glow/bloom envelope without deformation. |

## Error handling and lifecycle invariants

- No rejected request mutates a planner, queue, cooldown, timer set, or GPU resource.
- No destroyed plugin instance can emit a delayed rocket, notification, acknowledgement timeout, or benchmark expiry callback.
- No disconnected, stale, benchmark-bound, hidden, or unregistered socket can receive live finale work.
- No completed, failed, or lost-generation finale can submit later GPU work or show a Superfan end card.
- No invalid configuration can be acknowledged with a value different from the value the runtime actually uses.
- No failed image load remains permanently cached.
- No accepted upload can be served until extension, MIME, and signature validation all pass.
- No render command can bypass a current-generation, current-viewport envelope fit; every supported shape ID has one conservative profile.
- Renderer and route errors return stable machine-readable codes and log one actionable message without flooding per frame.

## Verification strategy

### Test-first regressions

Each defect ID receives at least one focused regression that is run red before production code changes and green afterward. Tests exercise real normalization/planning/resource code; mocks are limited to external browser/GPU/socket boundaries.

The focused WebGPU suite must finish naturally without `--forceExit`. `--detectOpenHandles` is used during hardening until no plugin-owned handle remains. All impacted Goals, Flow, plugin loader, route, and translation/release-alignment suites also pass.

### Deterministic planner matrix

For all nine styles, three lengths, two orientations, intensities 1/5/10, and 64 seeds:

- plan and runtime validation succeed;
- events stay within show bounds and canvas safe bounds;
- every command's complete visible envelope stays inside the viewport, with only documented below-canvas launch origins exempted;
- multi-shell spatial targets are distinct with at least 0.06 normalized spacing;
- declared rest intervals contain no visual or audio activity interval;
- every show has launch and explosion audio plus a deliberate opening/build/highlight/finale progression;
- completion occurs after the true final visual/audio tail and before the next queued show.

### Real loader and network contract

Initialize the plugin through the actual plugin loader against a temporary Express/Socket.IO listener. Verify configuration, status, trigger, follower, finale, show, preview, benchmark, Superfan, upload, and reset route families plus both Flow actions. Assert real HTTP status, response code, socket target, acknowledgement, and teardown behavior.

### Chrome WebGPU stress

Using installed Chrome/D3D WebGPU:

- compile all current WGSL pipelines;
- render particles at capacities 512 and 16,384 after live config changes;
- cycle at least 1,000 unique image URLs through the bounded atlas and prove reuse plus stable memory;
- force two sequential device losses and prove both recover with new devices;
- prove stale readback completion and queued commands cannot alter the recovered generation;
- stall admission past deadlines and prove overdue batches are dropped;
- resize portrait to landscape during an active V2 show and prove future targets remain visible;
- enumerate every legacy shape, rocket variant, V2 primitive, and V2 glyph at 540p, 1080p, and 4K in both orientations and at depth -1/0/+1; verify transparent guard pixels around the top and all non-exempt edges throughout each visible lifetime;
- explicitly exercise star, ring, and the standard rocket at upper safe-bound targets and prove their particle/sprite/trail/glow/bloom envelopes remain complete and undistorted;
- verify no atlas-neighbor bleed at the chosen sampling level.

### Real OBS WebGPU acceptance

Before live testing, snapshot plugin configuration, OBS source dimensions/orientation, and active source state. Refresh the exact `fireworks` browser source served by the authoritative worktree, then restore the snapshot after the matrix. Require fresh telemetry with:

- `state=ready`;
- `rendererProtocol=3`;
- capabilities containing `depth3d-v1` and `boykisser-v1`;
- 20 loaded sounds and zero failed sounds;
- no new renderer, WGSL, device, socket, or audio errors.

Run all 54 style/length/orientation combinations once. Capture telemetry and representative opening/highlight/finale frames. Require no clipping, collapsed targets, important action outside safe areas, unexplained dead holding time, or activity inside declared rest windows. Inspect the transparent top guard band throughout representative star, ring, standard-rocket, and high-intensity sequences rather than accepting center-point coordinates as proof.

For Furry Celebration, require a centered readable unclipped hero in both aspects, visible depth progression, Pride accents, and genuine 600/1,000/1,500 ms reveal gaps. Captures must clearly show the rounded cat silhouette, paired inner ears, eyes, nose, W-smile, tongue, and blush at actual OBS output size; a wolf/fox reading fails acceptance.

Run a long 4K stress show with adaptive performance enabled and disabled. With adaptive enabled, p95 overlay FPS must remain at or above the normalized minimum FPS after warm-up, render scale must stay inside configured bounds, and renderer/device errors and command drops must remain zero. With adaptive disabled, the renderer must honor the opt-out and report truthful pressure without silently changing quality.

Audio acceptance after preload requires launch/bang alignment within 50 ms of scheduled beats, no unexpected missed events, no unexplained eviction, no clipping, and no abrupt cutoff at completion or end-card transition.

### UI and designer acceptance

In a real browser:

- load, save, reload, and compare configuration including 8,192/10,000 and both capacity extremes;
- use Tab plus Enter/Space to toggle every shape and select designer shell handles;
- verify palette, gift overrides, preview scopes, undo/redo, save/reload, backend validation errors, and renderer status remain truthful;
- require zero console errors or warnings on settings, presets, benchmark, designer, and overlay pages.

### Repository and release checks

- All plugin JavaScript passes `node --check` and targeted ESLint.
- JSON parses, CSS builds, `git diff --check` passes, and production dependency audit remains clean.
- The 38-plugin-suite baseline grows only through intentional regressions and finishes without forced exit.
- A broad application test run is compared with the recorded unrelated baseline; no new failure is allowed.
- The final diff contains only WebGPU Fireworks, required Goals/Flow integration tests, active plugin documentation, the approved spec/plan, and release-alignment changes.
- `git status` is checked explicitly so pre-existing generated docs/locales are neither staged nor modified by this work.

## Completion gate

The plugin is complete only when all 27 B/G/C defect rows have a red-to-green regression, all deterministic and runtime gates pass, the real OBS 54-combination matrix and stress run pass, documentation/version/cache surfaces agree on 3.1.1 stable opt-in, and a final whole-branch review has no unresolved correctness, safety, lifecycle, accessibility, clipping, character-fidelity, or visual-quality finding.

Passing the pre-existing 938 tests alone, a single attractive screenshot, or one successful Furry finale is not sufficient evidence.
