# Weather Control Overlay Reconnect Design

Date: 2026-07-17

## Goal

Keep the Weather Control OBS browser overlay synchronized after either an LTTH
application restart or a Weather Control plugin reload, without reloading the
OBS source manually.

## Root Cause

During an LTTH restart, `app/server.js` calls `io.disconnectSockets(true)`.
Socket.IO reports this to the browser as `io server disconnect`; unlike a
transport failure, that reason does not start the built-in reconnect loop.

During a Weather Control plugin reload, the Socket.IO connection remains open,
but the replacement plugin instance only sees future `connection` events. The
already connected overlay therefore does not resend `weather:client-ready` and
is not synchronized by the replacement instance.

## Design

The overlay keeps Socket.IO's existing infinite, delayed reconnection policy
for ordinary network and transport failures.

For an `io server disconnect`, it schedules one explicit `socket.connect()`
attempt. The attempt is guarded so repeated disconnect notifications cannot
create concurrent reconnect loops. Once started, Socket.IO owns subsequent
retry timing and backoff.

The existing connect and reconnect handlers are consolidated into one overlay
ready-sync function. It reports readiness, requests gamification state, asks
for permanent effects, and publishes the current overlay state.

The overlay also listens for the global `plugins:changed` event. When it names
`weather-control` as reloaded, or reports a reload of all plugins, it runs the
same ready-sync function on its still-open socket. This occurs only after the
server has loaded the replacement plugin and emitted the event.

## Error Handling

- The manual reconnect branch applies only to `io server disconnect`, so normal
  Socket.IO backoff is not bypassed or duplicated.
- A disconnected or unavailable socket is never used for the ready sync.
- Repeated plugin-change events are harmless: each repeats only the idempotent
  state requests and current overlay-state publication.

## Tests

Add a focused regression test that proves the overlay source handles the
server-initiated disconnect path and replays the ready handshake for both a
socket reconnection and a Weather Control reload notification. Keep the
existing Weather Control integration suite green to protect server-side socket
listener cleanup and state sanitization.

## Non-Goals

- No change to Socket.IO server configuration or global reconnect policy.
- No OBS source reload, app restart, or user configuration change.
- No changes to weather-effect rendering or persisted Weather Control data.
