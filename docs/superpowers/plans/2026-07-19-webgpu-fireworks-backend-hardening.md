# WebGPU Fireworks Backend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Use superpowers:test-driven-development for every task and superpowers:verification-before-completion before claiming success.

**Goal:** Close backend defects B1-B13 without changing the approved WebGPU Fireworks 3.1.1 behavior outside the affected trust, lifecycle, configuration, Flow, benchmark, and upload contracts.

**Architecture:** Keep `main.js` as the orchestration boundary, move reusable deterministic logic into small CommonJS helpers, and make state changes transactional: validate/admit first, stage candidate state, publish only after success, and own every delayed callback. Renderer eligibility is derived from registered sockets plus purpose-specific freshness clocks. The real `PluginAPI` remains backward compatible with function actions while normalizing descriptor actions into the same executable contract.

**Tech Stack:** Node.js 18-24, CommonJS, Jest 29, Express 4, Multer 2, Socket.IO-compatible socket doubles, `better-sqlite3` for existing Goals integration tests.

**Design:** [WebGPU Fireworks 3.1.1 Release Hardening and Choreography Design](../specs/2026-07-19-webgpu-fireworks-release-hardening-design.md)

## Global implementation constraints

- Work only in `.worktrees/webgpu-fireworks-3d-furry`.
- Preserve the approved `3.1.1`, `devStatus: "stable"`, `enabled: false`, opt-in WebGPU release contract; release metadata, C1-C7, G1-G7, and visual implementation belong to the companion plans.
- Do not make an unregistered, disconnected, hidden, stale, or benchmark-bound socket eligible for live delivery.
- Do not mutate planner state, timer sets, cooldowns, or session configuration after a rejected operation.
- Keep CommonJS and 2-space indentation in plugin files. Use `this.api.log()` in the plugin and the existing `PluginAPI.log()` wrapper in the loader.
- Run each RED command before its production edit and confirm the named failure. Run the GREEN command after the smallest implementation. Commit only the files listed for that task.
- Task 4 must consume the exported FPS bounds introduced by the companion C1 plan if C1 lands first; if Task 4 lands first, it exports those bounds for C1. There must be one source of numeric truth in `config-schema.js`.
- Before Task 1 changes production code, run `npm test -- --runInBand` once from `app/` and record the exact failing suite names, failure counts, exit code, and final Jest shutdown behavior. The approved starting baseline contains unrelated guide/workflow and AnimazingPal failures; it is a comparator, not a requirement to repair those areas in this plan.

## Task 1: Authenticate renderer telemetry and aggregate eligible renderers (B1, B2, B4)

**Dependencies:** None.

**Files:**

- Modify: `app/plugins/webgpu-fireworks/main.js`
- Modify: `app/test/webgpu-fireworks-capability-routing.test.js`
- Modify: `app/test/webgpu-fireworks-preview-ack.test.js`
- Modify: `app/test/webgpu-fireworks-superfan-finale.test.js`
- Modify: `app/test/webgpu-fireworks-benchmark-isolation.test.js`

### 1.1 RED: registration is required before telemetry or delivery

Change the capability-routing harness `connect()` options to include `registered = true`. Only send `webgpu-fireworks:register-overlay` when `registered` is true; still send the requested status so the test exercises the hostile ordering. Add:

```js
test('ignores ready telemetry from an unregistered connected socket and never delivers to it', () => {
  const { api, connect, plugin } = createHarness();
  const socket = connect({
    id: 'unregistered',
    current: true,
    registered: false,
    state: 'ready'
  });

  const result = plugin.triggerFinale({
    style: 'classic-crescendo',
    length: 'short',
    seed: 712,
    eventId: 'unregistered-live'
  });

  expect(result).toMatchObject({
    accepted: false,
    reason: 'renderer-not-ready',
    code: 'RENDERER_NOT_READY'
  });
  expect(plugin.overlayTelemetry.has(socket.id)).toBe(false);
  expect(socket.finalePayloads()).toHaveLength(0);
  expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
});
```

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-capability-routing.test.js
```

Expected RED: `plugin.overlayTelemetry.has(socket.id)` is `true`, or the finale is accepted/delivered because the status handler creates trusted telemetry before registration.

### 1.2 RED: FPS and status have independent clocks

Add these tests in the same file. The helper must return the raw socket so each message can be sent explicitly.

```js
test('FPS updates cannot keep renderer readiness fresh', () => {
  const now = 50_000;
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const { connect, plugin } = createHarness();
  const socket = connect({ id: 'status-stale', current: true, updatedAt: now - 5001 });
  const telemetry = plugin.overlayTelemetry.get(socket.id);
  telemetry.statusUpdatedAt = now - 5001;

  socket.receive('webgpu-fireworks:fps-update', { fps: 60, visible: true });

  expect(plugin.getOverlayFps(false)).toEqual({ fps: 60, sampleCount: 1 });
  expect(plugin.getFinaleRendererTargets()).toHaveLength(0);
  expect(plugin.getRendererStatus()).toMatchObject({ state: 'offline' });
  jest.restoreAllMocks();
});

test('renderer status updates cannot keep an FPS sample fresh', () => {
  const now = 60_000;
  jest.spyOn(Date, 'now').mockReturnValue(now);
  const { connect, plugin } = createHarness();
  const socket = connect({ id: 'fps-stale', current: true, updatedAt: now - 5001 });
  const telemetry = plugin.overlayTelemetry.get(socket.id);
  telemetry.fps = 48;
  telemetry.fpsUpdatedAt = now - 5001;

  socket.receive('webgpu-fireworks:renderer-status', { state: 'ready', visible: true });

  expect(plugin.getRendererStatus()).toMatchObject({ state: 'ready' });
  expect(plugin.getOverlayFps(false)).toEqual({ fps: 0, sampleCount: 0 });
  jest.restoreAllMocks();
});
```

Expected RED: both readers use `updatedAt`; the FPS update keeps status ready and the status update keeps FPS at `48`.

### 1.3 RED: Superfan readiness uses the eligible set

In the Superfan socket harness, make registration precede status. Add:

```js
test('accepts a Superfan when an older eligible renderer remains ready', () => {
  const { api, plugin } = createPlugin({ enabled: true, superfanFinaleEnabled: true });
  const ready = connectSocket(plugin, api, 'ready-renderer');
  plugin.overlayTelemetry.get(ready.id).statusUpdatedAt = Date.now() - 100;

  const failed = connectSocket(plugin, api, 'newer-failed-renderer');
  failed.handlers.get('webgpu-fireworks:renderer-status')({ state: 'error', visible: true });
  plugin.overlayTelemetry.get(failed.id).statusUpdatedAt = Date.now();

  plugin.triggerFinale = jest.fn(() => ({ accepted: true, eventId: 'superfan:eligible' }));
  plugin.scheduleFollowerAnimation = jest.fn(() => true);
  const result = plugin.handleSuperfanEntry({
    userId: 'eligible-user',
    uniqueId: 'eligible_user',
    teamMemberLevel: 1
  }, { authoritative: true, bypassCooldown: true });

  expect(result).toMatchObject({ accepted: true });
  expect(plugin.triggerFinale).toHaveBeenCalledTimes(1);
});
```

Change the existing `connectSocket(plugin, api, id, options)` helper itself so lines that currently publish status first become:

```js
handlers.get('webgpu-fireworks:register-overlay')({ benchmark: false, visible: options.visible !== false });
handlers.get('webgpu-fireworks:renderer-status')({ state: 'ready', visible: options.visible !== false });
```

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-capability-routing.test.js test/webgpu-fireworks-preview-ack.test.js test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-benchmark-isolation.test.js
```

Expected RED: Superfan returns `renderer-not-ready` because `getRendererStatus()` selects the newer error record; existing preview/benchmark helpers may also fail once unregistered telemetry is correctly ignored.

### 1.4 GREEN: use registered, purpose-fresh telemetry everywhere

Implement these exact contracts in `main.js`:

```js
const RENDERER_TELEMETRY_TTL_MS = 5000;

function isFreshTelemetry(telemetry, timestampKey, cutoff) {
  return Boolean(
    telemetry?.registered === true &&
    Number.isFinite(Number(telemetry[timestampKey])) &&
    Number(telemetry[timestampKey]) >= cutoff
  );
}
```

- A new socket has no telemetry entry. `register-overlay` is the only event that creates/replaces one and initializes `registered`, `statusUpdatedAt: 0`, and `fpsUpdatedAt: 0`.
- Both `fps-update` and `renderer-status` return immediately unless the prior entry has `registered === true`. Keep the existing benchmark session-ID checks after this gate.
- `getOverlayFps()` filters with `isFreshTelemetry(telemetry, 'fpsUpdatedAt', cutoff)`.
- `getRendererStatus()`, `isRendererDeliveryEligible()`, `getFinaleRendererTargets()`, preview selection, Finale test readiness, and benchmark readiness filter with `statusUpdatedAt`. Sort renderer candidates by `statusUpdatedAt`, then renderer ID.
- `isRendererDeliveryEligible()` also requires `telemetry.registered === true`.
- `handleSuperfanEntry()` checks `getFinaleRendererTargets().length > 0`; it must not use one newest aggregate status as a gate.
- `dispatchFinalePayload()` returns `RENDERER_NOT_READY` when connected sockets exist but none are eligible. Preserve the legacy global `api.emit()` fallback only when `connectedSockets.size === 0` and the request is not a test request. This prevents broadcasting to a connected unregistered socket while preserving the no-overlay legacy call contract.
- Update all touched test helpers to register before publishing status/FPS and replace fixture writes to `updatedAt` with `statusUpdatedAt` or `fpsUpdatedAt` according to the reader under test.

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-capability-routing.test.js test/webgpu-fireworks-preview-ack.test.js test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-benchmark-isolation.test.js
```

Expected GREEN: all four suites pass; the unregistered socket receives no payload, the two clocks expire independently, and the ready renderer admits the Superfan despite a newer error record.

### 1.5 Commit

```powershell
git add app/plugins/webgpu-fireworks/main.js app/test/webgpu-fireworks-capability-routing.test.js app/test/webgpu-fireworks-preview-ack.test.js app/test/webgpu-fireworks-superfan-finale.test.js app/test/webgpu-fireworks-benchmark-isolation.test.js
git commit -m "fix(webgpu-fireworks): authenticate renderer telemetry"
```

## Task 2: Return truthful Goal, follower, and Flow results and own follower timers (B3, B5, B10, B12)

**Dependencies:** Task 1, because Finale and follower route status mapping consume the eligible-renderer contract.

**Files:**

- Modify: `app/plugins/goals/main.js`
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Modify: `app/modules/plugin-loader.js`
- Modify: `app/test/goals-fireworks-finale.test.js`
- Modify: `app/test/webgpu-fireworks-trigger-truth.test.js`
- Modify: `app/test/webgpu-fireworks-superfan-finale.test.js`
- Create: `app/test/plugin-flow-action-descriptor.test.js`

### 2.1 RED: Goal source and the global Goal switch

Update the three exact WebGPU object expectations in `goals-fireworks-finale.test.js` to include `source: 'goal'`, including the strict `.toHaveBeenCalledWith()` assertions. Add to `webgpu-fireworks-trigger-truth.test.js`:

```js
test('rejects object-form Goal finales when goal finales are disabled', () => {
  const { api, plugin } = createPlugin({ enabled: true, goalFinaleEnabled: false });

  const result = plugin.triggerFinale({
    source: 'goal',
    intensity: 4,
    style: 'classic-crescendo',
    length: 'short',
    eventId: 'goal:disabled:100'
  });

  expect(result).toEqual({
    accepted: false,
    reason: 'goal-finale-disabled',
    code: 'GOAL_FINALE_DISABLED'
  });
  expect(api.emit).not.toHaveBeenCalledWith('webgpu-fireworks:finale', expect.anything());
});

test('allows an explicit Goal test bypass without enabling the stored switch', () => {
  const { plugin } = createPlugin({ enabled: true, goalFinaleEnabled: false });
  plugin.dispatchFinalePayload = jest.fn(payload => payload);

  const result = plugin.triggerFinale({
    source: 'goal',
    bypassEnabled: true,
    style: 'classic-crescendo',
    length: 'short',
    eventId: 'goal:test-bypass'
  });

  expect(result).toMatchObject({ accepted: true, id: 'goal:test-bypass' });
});
```

Run from `app/`:

```powershell
npm test -- --runInBand test/goals-fireworks-finale.test.js test/webgpu-fireworks-trigger-truth.test.js
```

Expected RED: Goals calls omit `source`, and `triggerFinale()` accepts the disabled Goal request.

### 2.2 RED: follower delay, lifecycle, and route truth

Add these tests to `webgpu-fireworks-trigger-truth.test.js`:

```js
test('keeps follower delay zero and cancels every follower callback on destroy', async () => {
  const { api, plugin } = createPlugin({
    enabled: true,
    followerFireworksEnabled: true,
    followerShowAnimation: true,
    followerAnimationDelay: 0,
    followerRocketCount: 3
  });
  plugin.triggerFirework = jest.fn(() => ({ accepted: true, reason: 'submitted' }));

  const result = plugin.handleFollowerEvent({ uniqueId: 'zero_delay' });

  expect(result).toEqual({ accepted: true, reason: 'scheduled', rocketCount: 3 });
  expect(plugin.followerTimers.size).toBe(4);
  jest.advanceTimersByTime(0);
  expect(api.emit).toHaveBeenCalledWith(
    'webgpu-fireworks:follower-animation',
    expect.objectContaining({ username: 'zero_delay' })
  );
  expect(plugin.triggerFirework).toHaveBeenCalledTimes(1);
  await plugin.destroy();
  jest.runOnlyPendingTimers();
  expect(plugin.triggerFirework).toHaveBeenCalledTimes(1);
  expect(plugin.followerTimers.size).toBe(0);
});

test.each([
  [{}, { accepted: false, reason: 'disabled' }, 409],
  [undefined, { accepted: false, reason: 'renderer-not-ready' }, 503]
])('follower test route maps handler result for body %p', (body, result, status) => {
  const { api, plugin } = createPlugin();
  plugin.handleFollowerEvent = jest.fn(() => result);
  plugin.registerRoutes();
  const response = createResponse();

  api.routes.get('post:/api/webgpu-fireworks/test-follower')({ body }, response);

  expect(plugin.handleFollowerEvent).toHaveBeenCalledWith({
    uniqueId: 'TestFollower',
    username: 'TestFollower',
    profilePictureUrl: null
  }, { bypassEnabled: true });
  expect(response.statusCode).toBe(status);
  expect(response.body).toEqual({ success: false, accepted: false, reason: result.reason });
});
```

Expected RED: zero becomes 3000, rocket callbacks are absent from `notificationTimers`, `handleFollowerEvent()` returns `undefined`, and the route either throws on an absent body or reports unconditional success.

### 2.3 RED: real PluginAPI accepts functions and descriptors

Create `app/test/plugin-flow-action-descriptor.test.js`:

```js
'use strict';

const PluginLoader = require('../modules/plugin-loader');
const { PluginAPI } = PluginLoader;

function createApi() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  return new PluginAPI('flow-fixture', __dirname, null, null, null, logger, null, null);
}

describe('PluginAPI Flow action registration', () => {
  test('keeps function handlers executable and returns their structured result', async () => {
    const api = createApi();
    const handler = jest.fn(async params => ({ accepted: false, reason: params.reason }));

    expect(api.registerFlowAction('fixture.function', handler)).toBe(true);
    expect(api.registeredFlowActions[0]).toMatchObject({
      actionName: 'fixture.function',
      pluginId: 'flow-fixture'
    });
    await expect(api.registeredFlowActions[0].handler({ reason: 'disabled' }))
      .resolves.toEqual({ accepted: false, reason: 'disabled' });
  });

  test('preserves descriptor metadata and wraps descriptor execute', async () => {
    const api = createApi();
    const execute = jest.fn(async params => ({ accepted: true, payload: params }));
    const descriptor = {
      name: 'Descriptor action',
      description: 'Executable descriptor',
      icon: 'spark',
      category: 'effects',
      parameters: { intensity: { type: 'number', default: 1 } },
      execute
    };

    expect(api.registerFlowAction('fixture.descriptor', descriptor)).toBe(true);
    const registered = api.registeredFlowActions[0];
    expect(registered).toMatchObject({
      actionName: 'fixture.descriptor',
      pluginId: 'flow-fixture',
      name: 'Descriptor action',
      description: 'Executable descriptor',
      icon: 'spark',
      category: 'effects',
      parameters: descriptor.parameters
    });
    await expect(registered.handler({ intensity: 2 }))
      .resolves.toEqual({ accepted: true, payload: { intensity: 2 } });
    expect(execute).toHaveBeenCalledWith({ intensity: 2 });
  });

  test.each([null, {}, { execute: 'not-a-function' }])(
    'rejects invalid action descriptor %p without registration',
    invalid => {
      const api = createApi();
      expect(api.registerFlowAction('fixture.invalid', invalid)).toBe(false);
      expect(api.registeredFlowActions).toHaveLength(0);
    }
  );
});
```

Add to the existing Flow test in `webgpu-fireworks-trigger-truth.test.js`:

```js
const finaleResult = { accepted: false, reason: 'renderer-not-ready' };
plugin.triggerFinale = jest.fn(() => finaleResult);
const finaleAction = api.flowActions.get('webgpu_fireworks_finale');
await expect(finaleAction.execute({ intensity: 3, duration: 10_000 }))
  .resolves.toBe(finaleResult);
```

Run from `app/`:

```powershell
npm test -- --runInBand test/plugin-flow-action-descriptor.test.js test/webgpu-fireworks-trigger-truth.test.js
```

Expected RED: `PluginAPI` is not exposed for focused construction, descriptor registration reaches `handler(params)` and throws `handler is not a function`, invalid descriptors are registered, and Finale Flow resolves `undefined`.

### 2.4 GREEN: implement the minimal truth and lifecycle contracts

Apply these interfaces:

```js
// app/plugins/goals/main.js, WebGPU object request
{
  source: 'goal',
  intensity,
  style,
  length,
  eventId
}
```

In `triggerFinale()`, capture object provenance before normalization and gate it after the global plugin-enabled gate:

```js
const rawRequest = intensityOrOptions;
const isGoalRequest = rawRequest && typeof rawRequest === 'object' && rawRequest.source === 'goal';
const finale = normalizeFinaleRequest(rawRequest);
if (isGoalRequest && !config.goalFinaleEnabled && !finale.bypassEnabled) {
  return {
    accepted: false,
    reason: 'goal-finale-disabled',
    code: 'GOAL_FINALE_DISABLED'
  };
}
```

Replace `notificationTimers` with one `followerTimers` set and one scheduler for both notification and rocket work:

```js
scheduleFollowerTimer(callback, delayMs) {
  const timer = setTimeout(() => {
    this.followerTimers.delete(timer);
    callback();
  }, Math.max(0, Number(delayMs) || 0));
  this.followerTimers.add(timer);
  return timer;
}
```

- `scheduleFollowerAnimation()` delegates to `scheduleFollowerTimer()`.
- Every staggered rocket uses `scheduleFollowerTimer(callback, i * 300)`.
- `handleFollowerEvent(data = {}, { bypassEnabled = false } = {})` returns `{ accepted: false, reason: 'disabled' }` unless both global and follower switches are enabled or `bypassEnabled` is true. On admission it uses `followerAnimationDelay ?? 3000` and returns `{ accepted: true, reason: 'scheduled', rocketCount }`.
- `destroy()` clears and empties `followerTimers`; no delayed follower callback can execute afterward.
- The follower test route uses `const { username, profilePictureUrl } = req.body || {}`, passes `{ bypassEnabled: true }`, returns 200 for acceptance, 503 for `renderer-not-ready`, and 409 for other rejection reasons. Response truth is `{ success: result.accepted, accepted: result.accepted, reason: result.reason }`.
- The Finale Flow descriptor returns `this.triggerFinale(params.intensity, params.duration)`.

Normalize PluginAPI handlers without losing metadata:

```js
const descriptor = typeof action === 'function' ? null : action;
const execute = typeof action === 'function' ? action : action?.execute;
if (typeof execute !== 'function') {
  throw new TypeError('Flow action must be a function or a descriptor with execute(params)');
}
const wrappedHandler = async params => {
  try {
    return await execute(params);
  } catch (error) {
    this.log(`Flow action error in ${actionName}: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
};
this.registeredFlowActions.push({
  ...(descriptor || {}),
  actionName,
  handler: wrappedHandler,
  execute: wrappedHandler,
  pluginId: this.pluginId
});
```

Rename the method parameter from `handler` to `action`, update its JSDoc to `Function|Object`, and export the class for the focused test while preserving the default export:

```js
module.exports = PluginLoader;
module.exports.PluginAPI = PluginAPI;
```

Run from `app/`:

```powershell
npm test -- --runInBand test/goals-fireworks-finale.test.js test/webgpu-fireworks-trigger-truth.test.js test/webgpu-fireworks-superfan-finale.test.js test/plugin-flow-action-descriptor.test.js
```

Expected GREEN: all four suites pass; Goal disablement is enforceable, every follower delay is owned, route/Flow results are truthful, and both PluginAPI input forms execute through the same error wrapper.

### 2.5 Commit

```powershell
git add app/plugins/goals/main.js app/plugins/webgpu-fireworks/main.js app/modules/plugin-loader.js app/test/goals-fireworks-finale.test.js app/test/webgpu-fireworks-trigger-truth.test.js app/test/webgpu-fireworks-superfan-finale.test.js app/test/plugin-flow-action-descriptor.test.js
git commit -m "fix(webgpu-fireworks): report trigger and follower truth"
```

## Task 3: Make benchmark planning private and transactional (B6)

**Dependencies:** Task 1, because benchmark admission requires registered status telemetry with its own freshness clock.

**Files:**

- Modify: `app/plugins/webgpu-fireworks/lib/spawn-planner.js`
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Modify: `app/test/webgpu-fireworks-benchmark-isolation.test.js`

### 3.1 RED: clone semantics and no shared-planner mutation

Import `SpawnPlanner` in the benchmark suite and add:

```js
test('clones planner options and history without sharing mutable arrays', () => {
  const source = new SpawnPlanner({ historyLimit: 6, minimumTargetDistance: 0.2 });
  source.targets.push({ x: 0.2, y: 0.3 });
  source.origins.push({ x: 0.4, y: 1.02 });

  const clone = source.clone();
  clone.targets[0].x = 0.9;
  clone.origins.push({ x: 0.8, y: 1.02 });

  expect(clone).toBeInstanceOf(SpawnPlanner);
  expect(clone.historyLimit).toBe(6);
  expect(clone.minimumTargetDistance).toBe(0.2);
  expect(source.targets).toEqual([{ x: 0.2, y: 0.3 }]);
  expect(source.origins).toEqual([{ x: 0.4, y: 1.02 }]);
});

test('admits before planning and never calls the live planner for benchmark work', () => {
  jest.useFakeTimers();
  const harness = createHarness();
  const started = startSession(harness);
  const socket = harness.connect('benchmark-busy');
  registerBenchmarkRenderer(socket, started.sessionId);
  socket.ackDelayMs = 50;

  const first = harness.callRoute(
    'post',
    '/api/webgpu-fireworks/benchmark/trigger',
    harness.request({ body: { sessionId: started.sessionId, seed: 101 } })
  );
  const second = harness.callRoute(
    'post',
    '/api/webgpu-fireworks/benchmark/trigger',
    harness.request({ body: { sessionId: started.sessionId, seed: 102 } })
  );

  expect(second.statusCode).toBe(409);
  expect(second.body).toMatchObject({
    success: false,
    accepted: false,
    code: 'BENCHMARK_SESSION_BUSY'
  });
  expect(harness.plugin.spawnPlanner.plan).not.toHaveBeenCalled();
  jest.advanceTimersByTime(50);
  expect(first.statusCode).toBe(200);
});
```

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-benchmark-isolation.test.js
```

Expected RED: `clone` is missing, and the first or busy second benchmark request calls the shared `plugin.spawnPlanner.plan`.

### 3.2 RED: publish candidate history only after an accepted matching ACK

Add:

```js
test('publishes benchmark planner history only after an accepted matching ACK', () => {
  jest.useFakeTimers();
  const harness = createHarness();
  const started = startSession(harness);
  const socket = harness.connect('benchmark-transaction');
  registerBenchmarkRenderer(socket, started.sessionId);
  socket.ackDelayMs = 50;
  const session = harness.plugin.benchmarkSessions.get(started.sessionId);
  const initialPlanner = session.spawnPlanner;

  const response = harness.callRoute(
    'post',
    '/api/webgpu-fireworks/benchmark/trigger',
    harness.request({ body: { sessionId: started.sessionId, seed: 201 } })
  );

  expect(session.spawnPlanner).toBe(initialPlanner);
  expect(session.spawnPlanner.targets).toHaveLength(0);
  jest.advanceTimersByTime(50);
  expect(response.statusCode).toBe(200);
  expect(session.spawnPlanner).not.toBe(initialPlanner);
  expect(session.spawnPlanner.targets).toHaveLength(1);
});

test('keeps benchmark planner history unchanged after renderer rejection', () => {
  const harness = createHarness();
  const started = startSession(harness);
  const socket = harness.connect('benchmark-reject-transaction');
  registerBenchmarkRenderer(socket, started.sessionId);
  socket.ackResponse = {
    accepted: false,
    benchmarkSessionId: started.sessionId,
    reason: 'renderer-not-ready'
  };
  const session = harness.plugin.benchmarkSessions.get(started.sessionId);
  const initialPlanner = session.spawnPlanner;

  const response = harness.callRoute(
    'post',
    '/api/webgpu-fireworks/benchmark/trigger',
    harness.request({ body: { sessionId: started.sessionId, seed: 202 } })
  );

  expect(response.statusCode).toBe(503);
  expect(session.spawnPlanner).toBe(initialPlanner);
  expect(session.spawnPlanner.targets).toHaveLength(0);
  expect(harness.plugin.spawnPlanner.plan).not.toHaveBeenCalled();
});
```

Expected RED: the session has no planner, or planning mutates shared/session state before renderer acceptance.

### 3.3 GREEN: stage one session-local planner candidate per admitted operation

Add an exact deep-copy method:

```js
clone() {
  const clone = new SpawnPlanner({
    historyLimit: this.historyLimit,
    minimumTargetDistance: this.minimumTargetDistance
  });
  clone.targets = this.targets.map(target => ({ ...target }));
  clone.origins = this.origins.map(origin => ({ ...origin }));
  return clone;
}
```

Apply these state rules in `main.js`:

- `createBenchmarkSession()` creates `spawnPlanner: new SpawnPlanner()`.
- `beginBenchmarkSessionOperation(session, 'trigger')` runs before cloning or calling `plan()`. A busy result returns 409 without creating a candidate.
- The admitted trigger creates `const candidatePlanner = session.spawnPlanner.clone()` and passes it only through a private dispatch context. `triggerFirework(input, dispatchContext)` selects `dispatchContext.spawnPlanner || this.spawnPlanner`; public request data must never be able to supply this context.
- Targeted delivery includes the existing session ID and operation correlation. Assign `session.spawnPlanner = candidatePlanner` only after the same socket returns an accepted ACK with the matching benchmark session ID and the operation is still current.
- Timeout, negative ACK, emit failure, stale renderer, disconnect, and busy rejection discard the candidate.
- `unbindBenchmarkSocket()` and `removeBenchmarkSession()` finish/cancel the pending operation and reset or release only that session's planner; neither touches `this.spawnPlanner`.
- Keep benchmark triggers free of live counters, queue timestamps, active-firework timers, audio, avatars, and global emits.

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-benchmark-isolation.test.js
```

Expected GREEN: the suite passes; live planner calls remain zero, one accepted ACK advances exactly one session history, and every rejection preserves the previous planner object and history.

### 3.4 Commit

```powershell
git add app/plugins/webgpu-fireworks/lib/spawn-planner.js app/plugins/webgpu-fireworks/main.js app/test/webgpu-fireworks-benchmark-isolation.test.js
git commit -m "fix(webgpu-fireworks): isolate benchmark spawn planning"
```

## Task 4: Align accepted config with immediate runtime and renderer behavior (B7, B8, B9, B11)

**Dependencies:** None for backend work. Coordinate the exported FPS limits with companion Task C1 as described in Global implementation constraints.

**Files:**

- Modify: `app/plugins/webgpu-fireworks/lib/config-schema.js`
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Modify: `app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js`
- Modify: `app/test/webgpu-fireworks-trigger-truth.test.js`
- Modify: `app/test/webgpu-fireworks-native.test.js`

### 4.1 RED: relational FPS and normalized keywords

Add to `webgpu-fireworks-trigger-truth.test.js`:

```js
test('normalizes performance minimums against the normalized target FPS', () => {
  expect(normalizeConfig({ targetFps: 24, minFps: 60, minTargetFps: 50 })).toMatchObject({
    targetFps: 24,
    minFps: 24,
    minTargetFps: 24
  });
});

test('trims, removes, and deduplicates chat trigger keywords', () => {
  const config = normalizeConfig({
    chatTriggerEnabled: true,
    chatTriggerKeywords: ['', '   ', 'boom', ' boom ', 'BOOM']
  });

  expect(config.chatTriggerKeywords).toEqual(['boom']);
  const { plugin } = createPlugin(config);
  plugin.triggerFirework = jest.fn(() => ({ accepted: true, reason: 'submitted' }));
  expect(plugin.handleChatTrigger({ comment: 'ordinary chat message' })).toBe(false);
  expect(plugin.triggerFirework).not.toHaveBeenCalled();
});
```

Define keyword identity as trimmed, case-insensitive text while retaining the first spelling. Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-trigger-truth.test.js
```

Expected RED: minimums remain `60` and `50`; blank strings remain in the keyword array and match ordinary chat.

### 4.2 RED: saved combo timeout is the timeout used immediately

Add:

```js
test('uses a newly saved combo timeout without plugin restart', () => {
  jest.setSystemTime(new Date('2026-07-19T10:00:00.000Z'));
  const { api, plugin } = createPlugin({ comboEnabled: true, comboTimeout: 10_000 });
  plugin.registerRoutes();
  const response = createResponse();

  api.routes.get('post:/api/webgpu-fireworks/config')({
    body: { comboTimeout: 1000 }
  }, response);
  expect(response.statusCode).toBe(200);
  expect(response.body.config.comboTimeout).toBe(1000);

  expect(plugin.updateComboState('combo-user', 'Combo User')).toBe(1);
  jest.advanceTimersByTime(1001);
  expect(plugin.updateComboState('combo-user', 'Combo User')).toBe(1);
  expect(plugin.comboState.get('combo-user')).toBe(1);
});
```

Expected RED: the second call continues to use constructor-time `COMBO_TIMEOUT === 10000` and increments the combo.

### 4.3 RED: every schema-accepted color produces its intended RGBA

Expose a pure parser as a property of the existing class export and add to `webgpu-fireworks-native.test.js`:

```js
test.each([
  ['#abc', [170 / 255, 187 / 255, 204 / 255, 1]],
  ['#112233', [17 / 255, 34 / 255, 51 / 255, 1]],
  ['#11223380', [17 / 255, 34 / 255, 51 / 255, 128 / 255]],
  ['hsl(120, 100%, 25%)', [0, 0.5, 0, 1]],
  ['hsla(240, 100%, 50%, 0.25)', [0, 0, 1, 0.25]],
  [[1.4, -0.2, 0.5, 2], [1, 0, 0.5, 1]]
])('parses accepted color %p as RGBA', (input, expected) => {
  expect(WebGPUParticleEngine.parseColor(input)).toHaveLength(4);
  WebGPUParticleEngine.parseColor(input).forEach((component, index) => {
    expect(component).toBeCloseTo(expected[index], 6);
  });
});
```

Add the import near the existing test constants:

```js
const WebGPUParticleEngine = require('../plugins/webgpu-fireworks/gpu/webgpu-particle-engine');
```

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-native.test.js
```

Expected RED: `parseColor` is not exported; current `_parseColor()` maps `#abc` and `hsla(...)` to opaque white.

### 4.4 GREEN: one normalized config and one color parser

In `config-schema.js`, export the single bounds object consumed by backend and C1:

```js
const CONFIG_LIMITS = Object.freeze({
  targetFps: Object.freeze({ min: 24, max: 120 }),
  minFps: Object.freeze({ min: 15, max: 60 }),
  minTargetFps: Object.freeze({ min: 20, max: 50 })
});
```

Normalize in this exact order:

```js
const targetFps = clampInteger(
  source.targetFps,
  CONFIG_LIMITS.targetFps.min,
  CONFIG_LIMITS.targetFps.max,
  defaults.targetFps
);
const minFps = Math.min(targetFps, clampInteger(
  source.minFps,
  CONFIG_LIMITS.minFps.min,
  CONFIG_LIMITS.minFps.max,
  defaults.minFps
));
const minTargetFps = Math.min(targetFps, clampInteger(
  source.minTargetFps,
  CONFIG_LIMITS.minTargetFps.min,
  CONFIG_LIMITS.minTargetFps.max,
  defaults.minTargetFps
));
```

Build keywords through one helper:

```js
function normalizeChatKeywords(value, fallback = DEFAULT_FIREWORKS_CONFIG.chatTriggerKeywords) {
  const input = Array.isArray(value) ? value : fallback;
  const seen = new Set();
  const keywords = [];
  for (const item of input) {
    const keyword = typeof item === 'string' ? item.trim() : '';
    const identity = keyword.toLocaleLowerCase('en-US');
    if (!keyword || seen.has(identity)) continue;
    seen.add(identity);
    keywords.push(keyword);
    if (keywords.length === 20) break;
  }
  return keywords;
}
```

- Use the local `targetFps`, `minFps`, `minTargetFps`, and `normalizeChatKeywords()` in the returned config. Export `CONFIG_LIMITS` and `normalizeChatKeywords`.
- Add `applyRuntimeConfig(input) { this.config = normalizeConfig(input); return this.config; }` to the plugin and use it at all three current assignments: imported config, initial load/migration, and config POST.
- Remove `this.COMBO_TIMEOUT`. `updateComboState()` reads `this.config.comboTimeout` on every call, so the value acknowledged by config POST is the value used immediately.
- Keep `handleChatTrigger()` returning `false` when there are no normalized keywords or no match.

Add a module-level `parseColor(color)` in `webgpu-particle-engine.js`. It must clamp numeric arrays, expand `#RGB`, parse `#RRGGBB` and `#RRGGBBAA`, parse both `hsl()` and `hsla()` with hue wrapped modulo 360 and saturation/lightness/alpha clamped, and return `[1, 1, 1, 1]` only for unsupported input. Delegate `_parseColor(color)` to it and preserve the browser/default CommonJS export:

```js
if (typeof window !== 'undefined') window.WebGPUParticleEngine = WebGPUParticleEngine;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebGPUParticleEngine;
  module.exports.parseColor = parseColor;
}
```

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-trigger-truth.test.js test/webgpu-fireworks-native.test.js test/webgpu-fireworks-3d-release.test.js test/webgpu-fireworks-finale-settings.test.js
```

Expected GREEN: all four suites pass; relational values are coherent, config POST changes combo expiry immediately, blanks cannot trigger chat, and all accepted color forms match expected RGBA.

### 4.5 Commit

```powershell
git add app/plugins/webgpu-fireworks/lib/config-schema.js app/plugins/webgpu-fireworks/main.js app/plugins/webgpu-fireworks/gpu/webgpu-particle-engine.js app/test/webgpu-fireworks-trigger-truth.test.js app/test/webgpu-fireworks-native.test.js
git commit -m "fix(webgpu-fireworks): align config with renderer runtime"
```

## Task 5: Validate upload extension, MIME, and file signature before publishing (B13)

**Dependencies:** None.

**Files:**

- Create: `app/plugins/webgpu-fireworks/lib/upload-validation.js`
- Modify: `app/plugins/webgpu-fireworks/main.js`
- Create: `app/test/webgpu-fireworks-upload-validation.test.js`

### 5.1 RED: reject suffix tricks and mismatched MIME metadata

Create `app/test/webgpu-fireworks-upload-validation.test.js` with the metadata contract first:

```js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const FireworksPlugin = require('../plugins/webgpu-fireworks/main');
const { normalizeConfig } = require('../plugins/webgpu-fireworks/lib/config-schema');

const {
  UploadValidationError,
  validateUploadMetadata,
  validateUploadSignature,
  validateStoredUpload
} = require('../plugins/webgpu-fireworks/lib/upload-validation');

describe('WebGPU Fireworks upload validation', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webgpu-fireworks-upload-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test.each([
    [{ originalname: 'sound.mp3evil', mimetype: 'audio/mpeg' }, 'UNSUPPORTED_UPLOAD_EXTENSION'],
    [{ originalname: 'sound.mp3', mimetype: 'image/png' }, 'UPLOAD_MIME_MISMATCH'],
    [{ originalname: 'image.png', mimetype: 'application/octet-stream' }, 'UPLOAD_MIME_MISMATCH'],
    [{ originalname: 'movie.exe', mimetype: 'video/mp4' }, 'UNSUPPORTED_UPLOAD_EXTENSION']
  ])('rejects invalid metadata %#', (file, code) => {
    expect(() => validateUploadMetadata(file)).toThrow(UploadValidationError);
    try {
      validateUploadMetadata(file);
    } catch (error) {
      expect(error).toMatchObject({ code, status: 415 });
    }
  });

  test.each([
    [{ originalname: 'sound.mp3', mimetype: 'audio/mpeg' }, 'mp3'],
    [{ originalname: 'sound.wav', mimetype: 'audio/wav' }, 'wav'],
    [{ originalname: 'sound.ogg', mimetype: 'audio/ogg' }, 'ogg'],
    [{ originalname: 'clip.webm', mimetype: 'video/webm' }, 'webm'],
    [{ originalname: 'clip.mp4', mimetype: 'video/mp4' }, 'mp4'],
    [{ originalname: 'loop.gif', mimetype: 'image/gif' }, 'gif'],
    [{ originalname: 'image.png', mimetype: 'image/png' }, 'png'],
    [{ originalname: 'photo.jpg', mimetype: 'image/jpeg' }, 'jpg'],
    [{ originalname: 'photo.jpeg', mimetype: 'image/jpeg' }, 'jpeg']
  ])('accepts exact extension and MIME pair %#', (file, extension) => {
    expect(validateUploadMetadata(file)).toMatchObject({ extension });
  });
});
```

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-upload-validation.test.js
```

Expected RED: Jest cannot resolve `lib/upload-validation.js`; current Multer substring matching would accept `.mp3evil` and does not validate MIME correspondence.

### 5.2 RED: reject disguised bytes and remove them before a URL is returned

Append inside the same `describe`:

```js
test.each([
  ['mp3', Buffer.from('49443304000000000000', 'hex')],
  ['mp3', Buffer.from('fffb906400000000', 'hex')],
  ['wav', Buffer.from('524946462400000057415645', 'hex')],
  ['ogg', Buffer.from('4f676753000200000000', 'hex')],
  ['webm', Buffer.from('1a45dfa39f428681', 'hex')],
  ['mp4', Buffer.from('000000186674797069736f6d', 'hex')],
  ['gif', Buffer.from('474946383961', 'hex')],
  ['png', Buffer.from('89504e470d0a1a0a', 'hex')],
  ['jpg', Buffer.from('ffd8ffe000104a464946', 'hex')]
])('accepts a valid %s signature', (extension, header) => {
  expect(validateUploadSignature(extension, header)).toBe(true);
});

test.each(['mp3', 'wav', 'ogg', 'webm', 'mp4', 'gif', 'png', 'jpg', 'jpeg'])(
  'rejects disguised bytes for %s',
  extension => {
    expect(() => validateUploadSignature(extension, Buffer.from('not media')))
      .toThrow(UploadValidationError);
  }
);

test('validates the stored file and rejects a MIME-correct PNG containing text', async () => {
  const filePath = path.join(tempDir, 'firework-invalid.png');
  fs.writeFileSync(filePath, Buffer.from('plain text payload'));

  await expect(validateStoredUpload({
    path: filePath,
    originalname: 'avatar.png',
    mimetype: 'image/png'
  })).rejects.toMatchObject({ code: 'UPLOAD_SIGNATURE_MISMATCH', status: 415 });
});
```

Append the route-level tests inside the same `describe`, after the helper tests. Define `createRouteHarness()` and `createResponse()` at file scope. The API double must collect routes exactly as the other WebGPU route suites do; replace only the Multer executor so no multipart parser is required:

```js
test('upload route deletes a signature-invalid stored file and returns 415', async () => {
  const { api, plugin } = createRouteHarness(tempDir);
  const filePath = path.join(tempDir, 'firework-disguised.png');
  fs.writeFileSync(filePath, Buffer.from('not a png'));
  plugin.upload = {
    single: jest.fn(() => (req, _res, callback) => {
      req.file = {
        path: filePath,
        filename: 'firework-disguised.png',
        originalname: 'picture.png',
        mimetype: 'image/png',
        size: 9
      };
      callback(null);
    })
  };
  plugin.registerRoutes();
  const response = createResponse();

  await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);
  await new Promise(resolve => setImmediate(resolve));

  expect(response.statusCode).toBe(415);
  expect(response.body).toMatchObject({
    success: false,
    code: 'UPLOAD_SIGNATURE_MISMATCH'
  });
  expect(fs.existsSync(filePath)).toBe(false);
});

test.each([
  [{ code: 'LIMIT_FILE_SIZE', message: 'File too large' }, 413, 'UPLOAD_TOO_LARGE'],
  [new UploadValidationError('UPLOAD_MIME_MISMATCH', 'MIME mismatch'), 415, 'UPLOAD_MIME_MISMATCH'],
  [new Error('disk unavailable'), 500, 'UPLOAD_FAILED']
])('maps upload error %# to HTTP %i', async (error, status, code) => {
  const { api, plugin } = createRouteHarness(tempDir);
  plugin.upload = { single: jest.fn(() => (_req, _res, callback) => callback(error)) };
  plugin.registerRoutes();
  const response = createResponse();

  await api.routes.get('post:/api/webgpu-fireworks/upload')({ body: {} }, response);

  expect(response.statusCode).toBe(status);
  expect(response.body).toMatchObject({ success: false, code });
});
```

`createRouteHarness()` must instantiate `FireworksPlugin`, set `plugin.config = normalizeConfig({ enabled: true })`, set `plugin.uploadDir = tempDir`, and provide the same `routes`, `registerRoute`, `registerMiddleware`, `getPluginDataDir`, `getConfig`, `setConfig`, `getDatabase`, `emit`, and `log` mocks used by `webgpu-fireworks-trigger-truth.test.js`. `createResponse()` must be copied unchanged from that suite. These are complete test-fixture requirements; do not introduce Supertest or initialize the full plugin.

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-upload-validation.test.js
```

Expected RED: signature helpers are absent; the current route returns a URL for arbitrary bytes and maps every upload error to 500.

### 5.3 GREEN: exact allowlist, magic-byte validation, cleanup, and 4xx mapping

Implement `upload-validation.js` with no new dependency. Its public API is exactly these five exports:

```js
class UploadValidationError extends Error {
  constructor(code, message, status = 415) {
    super(message);
    this.name = 'UploadValidationError';
    this.code = code;
    this.status = status;
  }
}

module.exports = {
  UploadValidationError,
  validateUploadMetadata,
  validateUploadSignature,
  readUploadHeader,
  validateStoredUpload
};
```

Define `validateUploadMetadata(file)`, `validateUploadSignature(extension, header)`, `readUploadHeader(filePath, maxBytes = 64)`, and `validateStoredUpload(file)` before that export block, with these exhaustive rules:

| Extension | Accepted MIME values | Required signature |
| --- | --- | --- |
| `mp3` | `audio/mpeg`, `audio/mp3` | `ID3`, or MPEG sync where byte 0 is `0xff` and `(byte1 & 0xe0) === 0xe0` |
| `wav` | `audio/wav`, `audio/x-wav`, `audio/wave` | ASCII `RIFF` at 0 and `WAVE` at 8 |
| `ogg` | `audio/ogg`, `video/ogg`, `application/ogg` | ASCII `OggS` at 0 |
| `webm` | `audio/webm`, `video/webm` | bytes `1a 45 df a3` at 0 |
| `mp4` | `audio/mp4`, `video/mp4` | ASCII `ftyp` at 4 |
| `gif` | `image/gif` | ASCII `GIF87a` or `GIF89a` at 0 |
| `png` | `image/png` | bytes `89 50 4e 47 0d 0a 1a 0a` at 0 |
| `jpg`, `jpeg` | `image/jpeg` | bytes `ff d8 ff` at 0 |

- `validateUploadMetadata()` derives the lower-case extension only with `path.extname(originalname).slice(1).toLowerCase()`. It throws `UNSUPPORTED_UPLOAD_EXTENSION` or `UPLOAD_MIME_MISMATCH`, both status 415, and returns `{ extension, mimetype }` on success.
- `readUploadHeader()` opens the exact saved path, reads at most 64 bytes, and closes the handle in `finally`.
- `validateStoredUpload()` reuses metadata validation, reads the header, validates the matching signature, and returns the metadata result. An empty or truncated header fails `UPLOAD_SIGNATURE_MISMATCH` with status 415.
- Multer `fileFilter` calls `validateUploadMetadata(file)` and passes its typed error to the callback. Keep the 10 MiB limit and disk storage.
- The upload route awaits `validateStoredUpload(req.file)` before constructing or returning `fileUrl`.
- On any post-write validation failure, unlink only `req.file.path` with `fs.promises.unlink()`; ignore only `ENOENT` during cleanup and log other cleanup errors as warnings.
- Map Multer `LIMIT_FILE_SIZE` to 413/`UPLOAD_TOO_LARGE`, `UploadValidationError` to its 415/code, a missing file to 400/`UPLOAD_FILE_REQUIRED`, and unexpected errors to 500/`UPLOAD_FAILED`. Every failure body is `{ success: false, code, error }`.
- A file is visible through the response URL only after all three checks pass. Preserve the existing filename, size, and URL shape for accepted files.

Run from `app/`:

```powershell
npm test -- --runInBand test/webgpu-fireworks-upload-validation.test.js
```

Expected GREEN: exact extension/MIME pairs and all nine signature families pass; suffix tricks, mismatches, and disguised bytes return typed 4xx responses, and no rejected stored file remains.

### 5.4 Commit

```powershell
git add app/plugins/webgpu-fireworks/lib/upload-validation.js app/plugins/webgpu-fireworks/main.js app/test/webgpu-fireworks-upload-validation.test.js
git commit -m "fix(webgpu-fireworks): validate uploaded media"
```

## Integration verification after Tasks 1-5

**Dependencies:** Tasks 1-5 complete. Do not create a separate commit for verification-only work.

Run from `app/` in this order:

```powershell
npm test -- --runInBand test/plugin-flow-action-descriptor.test.js test/goals-fireworks-finale.test.js test/webgpu-fireworks-capability-routing.test.js test/webgpu-fireworks-preview-ack.test.js test/webgpu-fireworks-superfan-finale.test.js test/webgpu-fireworks-trigger-truth.test.js test/webgpu-fireworks-benchmark-isolation.test.js test/webgpu-fireworks-upload-validation.test.js test/webgpu-fireworks-native.test.js test/webgpu-fireworks-3d-release.test.js test/webgpu-fireworks-finale-backend.test.js test/webgpu-fireworks-finale-settings.test.js test/webgpu-fireworks-resolution-bounds.test.js
npm test -- --runInBand
npm run build:css
npm run lint
```

Expected result: every focused suite in the first command passes and Jest exits naturally without `--forceExit` or an open-handle warning. For the broad Jest command, compare exact failing suite names and failure counts with the pre-Task-1 baseline: only the already recorded unrelated guide/workflow and AnimazingPal failures may remain, no new suite/test may fail, and Jest must still terminate naturally without an open-handle warning. CSS must build successfully. For lint, compare any non-zero result with the pre-task repository state, record the exact command, file, line, and rule, and allow no new finding in a touched file; do not broaden a backend commit to repair unrelated baseline failures.

Then inspect scope from the repository root:

```powershell
git status --short
git diff --check
git log --oneline -5
```

Expected result: `git diff --check` exits zero; the five task commits have exactly the messages specified above; unrelated pre-existing worktree changes remain untouched.

## B1-B13 traceability self-check

| Defect | RED proof | Minimal GREEN contract | Owning task |
| --- | --- | --- | --- |
| B1 | Unregistered socket publishes ready and attempts Finale receipt | Registration is the sole telemetry creation boundary; delivery requires `registered === true` | Task 1 |
| B2 | FPS keeps status alive; status keeps FPS alive | `fpsUpdatedAt` and `statusUpdatedAt` independently gate their readers | Task 1 |
| B3 | Object-form Goal finale bypasses `goalFinaleEnabled` | Goals sends `source: 'goal'`; raw provenance is gated before dispatch | Task 2 |
| B4 | Newer failed renderer masks older ready renderer | Superfan gates on non-empty eligible target set | Task 1 |
| B5 | Zero follower delay becomes 3000; rockets survive destroy | `??` preserves zero; one owned timer set covers animation and rockets | Task 2 |
| B6 | Busy/rejected benchmark mutates the live/session planner | Admit first; clone session planner; commit candidate only after matching accepted ACK | Task 3 |
| B7 | `#RGB` and `hsla()` become white | One pure renderer parser covers every schema-accepted color form | Task 4 |
| B8 | Saved combo timeout differs from runtime timeout | Runtime reads normalized `this.config.comboTimeout` immediately | Task 4 |
| B9 | Blank keyword matches ordinary chat | Trim, remove blanks, and case-insensitively deduplicate before matching | Task 4 |
| B10 | Empty follower body throws; rejection reports success | Safe body/default handler inputs and result-to-HTTP mapping | Task 2 |
| B11 | Minimum FPS exceeds target FPS | Relational normalization uses one exported bounds source shared with C1 | Task 4 |
| B12 | Real loader calls descriptor as function; Finale result disappears | Function/descriptor normalization preserves metadata and wrapped execution results; Finale descriptor returns | Task 2 |
| B13 | `.mp3evil` and disguised bytes are published | Exact extension, MIME, and signature validation precedes URL publication; failures clean up and return 4xx | Task 5 |

All thirteen backend IDs have one named RED assertion, one deterministic GREEN contract, one focused command, and one owning commit. C6/C7 are approved by the linked design but remain in the companion choreography plan; this backend plan neither duplicates nor weakens those visual contracts.
