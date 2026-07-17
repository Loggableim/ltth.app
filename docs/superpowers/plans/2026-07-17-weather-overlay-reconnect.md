# Weather Control Overlay Reconnect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Restore the Weather Control OBS overlay automatically after an LTTH restart or a Weather Control plugin reload.

**Architecture:** The overlay keeps Socket.IO's existing retry policy for normal transport failures. It adds one guarded \`socket.connect()\` recovery branch only for the server-initiated \`io server disconnect\` reason, then uses one ready-sync function for initial connections, reconnects, and the \`plugins:changed\` reload notification.

**Tech Stack:** Browser JavaScript, Socket.IO client 4.x, Jest.

## Global Constraints

- Change only the Weather Control overlay recovery path and its focused regression test.
- Do not reload the OBS source, restart the LTTH app, or persist any new data.
- Preserve Socket.IO's existing infinite delayed reconnect policy for normal transport failures.
- Use the existing Weather Control client-ready event to request permanent-effect synchronization.

---

### Task 1: Specify the recovery contract with a focused regression test

**Files:**

- Create: \`app/test/weather-overlay-reconnect.test.js\`
- Read: \`app/plugins/weather-control/overlay.html\`

**Interfaces:**

- Consumes: the inline \`initSocket()\` lifecycle in \`overlay.html\`.
- Produces: assertions for a single server-disconnect recovery timer and the reissued Weather Control ready handshake after plugin reload.

- [x] **Step 1: Write the failing test**

~~~js
const fs = require('fs');
const path = require('path');

describe('Weather Control overlay reconnect recovery', () => {
  let overlay;

  beforeAll(() => {
    overlay = fs.readFileSync(
      path.join(__dirname, '../plugins/weather-control/overlay.html'),
      'utf8'
    );
  });

  test('restarts the Socket.IO client after a server-initiated disconnect', () => {
    expect(overlay).toContain("reason === 'io server disconnect'");
    expect(overlay).toMatch(/reconnectTimer\s*=\s*setTimeout/);
    expect(overlay).toMatch(/socket\.connect\(\)/);
    expect(overlay).toMatch(/clearTimeout\(reconnectTimer\)/);
  });

  test('replays the ready handshake when Weather Control is reloaded', () => {
    expect(overlay).toContain("socket.on('plugins:changed'");
    expect(overlay).toContain("payload.pluginId === 'weather-control'");
    expect(overlay).toContain("payload.action === 'reloaded_all'");
    expect(overlay).toMatch(/socket\.emit\('weather:client-ready'\)/);
  });
});
~~~

- [x] **Step 2: Run the test to verify it fails**

Run: \`cd app && npm test -- --runInBand test/weather-overlay-reconnect.test.js\`

Expected: FAIL because \`overlay.html\` has no \`io server disconnect\` branch or \`plugins:changed\` handler.

### Task 2: Add guarded reconnection and ready-sync behavior

**Files:**

- Modify: \`app/plugins/weather-control/overlay.html:229-239\`
- Modify: \`app/plugins/weather-control/overlay.html:532-577\`
- Modify: \`app/plugins/weather-control/overlay.html:597-605\`

**Interfaces:**

- Consumes: Socket.IO client \`connect\`, \`disconnect\`, and \`plugins:changed\` events.
- Produces: \`syncOverlayConnection()\`, \`scheduleServerDisconnectRecovery()\`, and \`handlePluginChange(payload)\` in the overlay scope.

- [x] **Step 1: Add lifecycle state and the ready-sync helpers**

~~~js
let reconnectTimer = null;
let hasConnectedOnce = false;

function syncOverlayConnection() {
  if (!socket?.connected) return;
  socket.emit('weather:client-ready');
  socket.emit('weather:request-gamification-state');
  broadcastState();
}

function scheduleServerDisconnectRecovery() {
  if (reconnectTimer || !socket || socket.connected) return;
  updateConnectionStatus('reconnecting', 'Reconnecting after app restart');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (socket && !socket.connected) socket.connect();
  }, 1000);
}

function handlePluginChange(payload) {
  const weatherWasReloaded =
    (payload?.action === 'reloaded' && payload.pluginId === 'weather-control') ||
    payload?.action === 'reloaded_all';
  if (weatherWasReloaded) syncOverlayConnection();
}
~~~

- [x] **Step 2: Replace duplicated connect/reconnect handlers with one \`connect\` handler**

~~~js
socket.on('connect', () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  updateConnectionStatus('connected', hasConnectedOnce ? 'Reconnected' : 'Connected');
  hasConnectedOnce = true;
  syncOverlayConnection();
});

socket.on('disconnect', (reason) => {
  updateConnectionStatus('disconnected', 'Disconnected');
  if (reason === 'io server disconnect') scheduleServerDisconnectRecovery();
});
socket.on('plugins:changed', handlePluginChange);
~~~

Remove the old \`socket.on('reconnect', ...)\` handler so every successful connection emits exactly one ready handshake.

- [x] **Step 3: Clear pending recovery during overlay cleanup**

~~~js
if (reconnectTimer) {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}
if (socket) socket.disconnect();
~~~

- [x] **Step 4: Run the focused test to verify it passes**

Run: \`cd app && npm test -- --runInBand test/weather-overlay-reconnect.test.js\`

Expected: PASS with 2 tests and 0 failures.

### Task 3: Verify Weather Control integration remains intact

**Files:**

- Test: \`app/test/weather-overlay-reconnect.test.js\`
- Test: \`app/test/weather-control-integration.test.js\`

**Interfaces:**

- Consumes: the overlay source contract and existing server-side socket lifecycle test harness.
- Produces: verification evidence for restart recovery source coverage and listener cleanup.

- [x] **Step 1: Run the focused Weather Control tests**

Run: \`cd app && npm test -- --runInBand test/weather-overlay-reconnect.test.js test/weather-control-integration.test.js\`

Expected: PASS with 0 failures.

- [x] **Step 2: Check the staged patch for whitespace errors**

Run: \`git diff --check && git diff -- app/plugins/weather-control/overlay.html app/test/weather-overlay-reconnect.test.js\`

Expected: no whitespace errors; diff contains only the guarded recovery, ready-sync, reload handling, and focused test.

- [x] **Step 3: Commit the implementation and plan**

~~~bash
git add app/plugins/weather-control/overlay.html app/test/weather-overlay-reconnect.test.js docs/superpowers/plans/2026-07-17-weather-overlay-reconnect.md
git commit -m "fix(weather-control): reconnect overlay after app restart"
~~~
