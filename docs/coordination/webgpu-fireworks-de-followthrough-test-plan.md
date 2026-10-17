# Exactly one pending OBS renderer case: webgpu-fireworks:de

Status: TEST PLAN ONLY due ownership collision; no new regression applied. Public guide case remains without a trigger followthrough proof and OBS NOT_TESTED.

## Ownership and baseline

Renderer app/plugins/webgpu-fireworks/gpu/engine.js has foreign dirty93+/33- lifecycle/GPU hunks, SHA1aa93fafccfcd00ea983838cbaea2f335840e344b6faff0ea4fb91d80171fec7. Existing app/test/webgpu-fireworks-overlay-renderer-lifecycle.test.js is foreign untracked, SHA6ebb390b5116701b8e12a5daddafb0959aa13e2cd3a6871c40ac6818380dd31c. CoinBattle and Minecraft alternate candidates also collide, so no silent switch/broadening. Candidate owner is existing renderer/public-overlays worker; CEO should obtain sourcefreeze before delegating new testfile.

## Proposed independent synthetic regression

One case only, lang=de. New separately-owned app/test/webgpu-fireworks-de-trigger-followthrough.test.js; do not edit lifecycle suite or renderer. Use existing JSDOM HTML/script initialization pattern, local German locale bytes, in-memory socket/timers and zero outboundnetwork/provider/audio stubs. Original engine source must execute unmodified: do not stub handleIncomingTrigger, handleTrigger, enqueueEffectPlan or plan construction. A minimal fake initialized renderer may capture GPU submission/state boundaries; this is not WebGPU/pixel proof.

Drive a direct in-process handleIncomingTrigger with anonymous burst payload: shape burst,intensity1,combo1,tiermedium,position{x:.5,y:.5}; no gift/image/avatar/audio/credentials. Set deterministic fake-ready renderer and clock only at explicit external GPU boundary. Assert returned plan matches seeded payload, effectPlans/timelineQueue transitions from empty to planned, then original timeline processing reaches captured spawnRocket/spawnExplosion submission after advancing the fixtureclock. Assert plan bookkeeping/expiry cleanup and no fetch/Socket emit/audio start. Negative case unsupported renderer admits no plan/submission. German label/status assertions must resolve actualde locale, not English fallback.

Do NOT dispatch public webgpu-fireworks:trigger, alter registry, or claim transport admission: current public registry explicitly denies that outgoing trigger and register/status incoming events. Direct renderer method contract is synthetic CPU state only. Existing lifecycle test's unsupported state never demonstrates accepted firework event.

## Existing nearest verification

From app with bundledNode22: jest --runInBand test/webgpu-fireworks-overlay-renderer-lifecycle.test.js ->1Suite/1TestPASS. This run establishes existing BFCache/dispose/noGPU/noaudio contract only, not proposed triggerfollowthrough. No server/browser/OBS/VM started. Case remains one of17missingpublicsourcefollowthrough cases. Sourcefreeze/newtestowner needed before implementing proposal.