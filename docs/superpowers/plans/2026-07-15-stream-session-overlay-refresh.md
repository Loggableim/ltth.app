# Stream Session Overlay Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset goals and refresh EmojiRain overlays after a terminal TikTok LIVE end, including a same-room restart.

**Architecture:** Eulerstream records only a confirmed terminal end as a reason to classify the next room confirmation as a new stream. Both EmojiRain backends clear session state from `streamSessionStarted`; the WebGPU client rehydrates runtime state on Socket.IO connect.

**Tech Stack:** Node.js CommonJS, Jest, Socket.IO, WebGPU browser renderer.

## Global Constraints

- Preserve manual-disconnect and transient reconnect behaviour.
- Keep classic and WebGPU EmojiRain lifecycle behaviour aligned.
- Use the existing overlay-clear events and no persistent plugin state.
- Bump the application and touched plugin patch versions.

---

### Task 1: Classify a same-room LIVE after a terminal end as a new session

**Files:**
- Modify: `app/modules/adapters/EulerstreamAdapter.js:916-978,2403-2496`
- Test: `app/test/eulerstream-connection-state.test.js`

**Interfaces:**
- Produces: `forceNewStreamOnNextConfirmation`, consumed by `_applyConfirmedStreamIdentity()`.
- Preserves: `{ isNewStream: false, isReconnect: true }` for an uninterrupted or transient same-room reconnect.

- [ ] **Step 1: Write the failing test**

```js
test('same room after a terminal LIVE end starts a new session', async () => {
  const { adapter, db } = createAdapter(savedStatsForRoom111);
  const sessionStarted = jest.fn();
  adapter.on('streamSessionStarted', sessionStarted);
  adapter._connectionHadLive = true;
  adapter._handleSocketClose(1, 4005, 'stream ended');
  adapter._connectedEventEmitted = false;

  const next = await adapter._confirmLive({ generation: 1, roomId: '111', source: 'roomInfo', payload: {} });
  expect(next).toMatchObject({ isNewStream: true, isReconnect: false });
  expect(db.resetStreamStats).toHaveBeenCalledTimes(1);
  expect(sessionStarted).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --runInBand test/eulerstream-connection-state.test.js`

Expected: the next same-room confirmation reports `isReconnect: true`.

- [ ] **Step 3: Write minimal implementation**

```js
// on a terminal close after confirmed LIVE
this.forceNewStreamOnNextConfirmation = true;

// in _applyConfirmedStreamIdentity
const isReconnect = !this.forceNewStreamOnNextConfirmation && previousIdentity === nextIdentity;
this.forceNewStreamOnNextConfirmation = false;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --runInBand test/eulerstream-connection-state.test.js`

Expected: PASS.

### Task 2: Reset both EmojiRain backends for each confirmed session

**Files:**
- Modify: `app/plugins/emoji-rain/main.js:92-107,708-719,2360-2388`
- Modify: `app/plugins/webgpu-emoji-rain/main.js:111-126,780-790,2440-2470`
- Test: `app/plugins/emoji-rain/test/heart-balloons.test.js`
- Test: `app/plugins/webgpu-emoji-rain/test/heart-balloons.test.js`

**Interfaces:**
- Consumes: `streamSessionStarted` payload with `streamIdentity`.
- Produces: a `handleHeartBalloonStreamSession(data)` method that returns `true` once for a new identity and emits the existing `*:clear` event.

- [ ] **Step 1: Write failing tests**

```js
expect(plugin.handleHeartBalloonStreamSession({ streamIdentity: 'streamer:room-2' })).toBe(true);
expect(plugin.heartBalloonUserColors.size).toBe(0);
expect(api.emissions.at(-1).event).toBe('webgpu-emoji-rain:clear');
expect(plugin.handleHeartBalloonStreamSession({ streamIdentity: 'streamer:room-2' })).toBe(false);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --runInBand plugins/emoji-rain/test/heart-balloons.test.js plugins/webgpu-emoji-rain/test/heart-balloons.test.js`

Expected: FAIL because `handleHeartBalloonStreamSession` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
handleHeartBalloonStreamSession(data = {}) {
  const streamIdentity = data.streamIdentity || null;
  if (!streamIdentity || streamIdentity === this.lastHeartBalloonStreamIdentity) return false;
  this.heartBalloonUserColors.clear();
  this.heartBalloonColorIndex = 0;
  this.spawnQueue = [];
  this.lastHeartBalloonStreamIdentity = streamIdentity;
  this.api.emit('webgpu-emoji-rain:clear', {});
  return true;
}
```

Register the method for `streamSessionStarted` in both plugin event-handler registrations, using each plugin's existing clear-event namespace.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --runInBand plugins/emoji-rain/test/heart-balloons.test.js plugins/webgpu-emoji-rain/test/heart-balloons.test.js`

Expected: PASS.

### Task 3: Rehydrate the WebGPU Browser Source after Socket.IO reconnect

**Files:**
- Modify: `app/plugins/webgpu-emoji-rain/gpu/engine.js:626-712`
- Test: existing WebGPU renderer regression suite.

**Interfaces:**
- Consumes: existing `GET /api/webgpu-emoji-rain/config`, `/mappings`, and `/overlay/state` routes.
- Produces: `hydrateRuntimeState()` called by both initialisation and every Socket.IO `connect` event.

- [ ] **Step 1: Add a focused failing renderer assertion**

Assert that the browser runtime registers a Socket.IO `connect` callback which invokes runtime-state hydration.

- [ ] **Step 2: Run the focused renderer test to verify it fails**

Run: `npm test -- --runInBand test/webgpu-emoji-rain-renderer-parity.test.js`

Expected: FAIL because no reconnect hydration callback exists.

- [ ] **Step 3: Write minimal implementation**

```js
async function hydrateRuntimeState() {
  const [configPayload, mappingsPayload, overlayPayload] = await Promise.all([
    fetch('/api/webgpu-emoji-rain/config').then(response => response.json()),
    fetch('/api/webgpu-emoji-rain/mappings').then(response => response.json()),
    fetch('/api/webgpu-emoji-rain/overlay/state').then(response => response.json())
  ]);
  // Apply the same state assignments already used by init().
}

state.socket.on('connect', () => void hydrateRuntimeState());
```

- [ ] **Step 4: Run the focused renderer test to verify it passes**

Run: `npm test -- --runInBand test/webgpu-emoji-rain-renderer-parity.test.js`

Expected: PASS.

### Task 4: Version, validate, publish, and live-reload

**Files:**
- Modify: `version.json`, `package.json`, `app/package.json`
- Modify: `app/plugins/emoji-rain/plugin.json`
- Modify: `app/plugins/webgpu-emoji-rain/plugin.json`, `overlay.html`, `obs-hud.html`

- [ ] **Step 1: Bump versions**

Set application version fields to `1.3.29`, classic EmojiRain to `2.1.1`, and WebGPU EmojiRain plus its asset query strings to `3.0.3`.

- [ ] **Step 2: Run validation**

Run: `npm test -- --runInBand test/eulerstream-connection-state.test.js plugins/emoji-rain/test/heart-balloons.test.js plugins/webgpu-emoji-rain/test/heart-balloons.test.js test/webgpu-emoji-rain-renderer-parity.test.js && npm run lint -- --quiet && git diff --check`

Expected: exit code 0.

- [ ] **Step 3: Verify the OBS HUD in a real browser**

Open `/webgpu-emoji-rain/obs-hud/emojiregen`, then confirm `/api/webgpu-emoji-rain/status` reports a ready WebGPU renderer with positive FPS.

- [ ] **Step 4: Commit and publish only the scoped files**

```bash
git add app/modules/adapters/EulerstreamAdapter.js app/test/eulerstream-connection-state.test.js app/plugins/emoji-rain app/plugins/webgpu-emoji-rain version.json package.json app/package.json docs/superpowers/specs/2026-07-15-stream-session-overlay-refresh-design.md docs/superpowers/plans/2026-07-15-stream-session-overlay-refresh.md
git commit -m "fix: refresh stream overlays after live restart"
git push origin HEAD:main
```
