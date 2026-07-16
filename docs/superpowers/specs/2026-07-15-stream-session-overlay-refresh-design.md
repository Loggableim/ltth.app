# Stream session refresh design

## Goal

After a confirmed TikTok LIVE end, the next LIVE session must reset goals and
refresh EmojiRain overlays even when Eulerstream reports the same room ID.

## Decision

The Eulerstream adapter keeps a `forceNewStreamOnNextConfirmation` flag. It is
set only after a terminal close that occurred while LIVE was confirmed
(`4005`, `4404`, or normal `1000`). The next confirmed room identity is then a
new session regardless of an equal prior identity. Manual disconnects and
transient transport failures retain their existing reconnect semantics.

EmojiRain and WebGPU EmojiRain consume `streamSessionStarted` as the session
boundary. They clear queued particles and per-user heart-colour assignments,
then emit the existing overlay-clear event. The WebGPU browser renderer also
rehydrates its configuration, mappings, and overlay state whenever Socket.IO
connects, so an OBS Browser Source recovers after a socket reconnect.

## Verification

Regression tests prove a same-room LIVE after a terminal end emits a new
session, that both EmojiRain variants clear their state once per new session,
and that transient reconnects remain resets-free. A real local WebGPU OBS HUD
browser check confirms renderer telemetry reaches the running server.
