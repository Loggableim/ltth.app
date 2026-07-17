# Stream-session boundary overlays

## Problem

Eulerstream can reuse a confirmed room ID for a later LIVE session. LTTH previously used `streamIdentity` (`username:roomId`) as the sole lifecycle key, so a genuine later stream could be mistaken for a reconnect. Goals also did not react to a terminal `disconnected` event, leaving stale progress visible in OBS while offline.

## Decision

The Eulerstream adapter will create a local, monotonically increasing `streamSessionId` whenever it confirms a new stream. The ID is not an Eulerstream API field; it is LTTH's session-generation token and is included in `streamSessionStarted` and confirmed `connected` payloads.

Session-bound consumers deduplicate with `streamSessionId`, retaining `streamIdentity` only as a fallback for non-Eulerstream payloads. Goals reset immediately after a terminal, non-transient disconnect, and reset again idempotently at the next confirmed session. Spotlight (the LastEvent overlay) clears at the same terminal boundary. TopTier receives the session-generation token as its stream key so repeated room IDs open a fresh board.

Eulerstream remains the primary end signal. A secondary watchdog records raw Eulerstream frames; after 15 minutes without one, it probes the canonical `https://www.tiktok.com/@username/live` route no more than once per minute. Two consecutive, explicit offline responses end the current session through the normal terminal-disconnect path. A CAPTCHA, rate limit, changed page shape, request failure, or an otherwise ambiguous result is `unknown` and cannot clear state. Each goal has `reset_on_stream_end` (default enabled), allowing marathon goals to span streams deliberately.

## Required behavior

- `4005`, `4404`, and normal `1000` closes after a confirmed LIVE clear stream-bound Goals and LastEvent state; transient reconnect closes do not.
- A new confirmed LIVE in the same room produces a different `streamSessionId` and triggers exactly one reset in each consumer.
- A likes goal configured as `10,000` may advance to `20,000`, `30,000`, and so on during a single LIVE, but returns to its stored `10,000` basis on the next session.
- Existing OBS routes keep working; state changes are broadcast so browser sources update without manual URL replacement.
- A TikTok page probe is only a secondary safety net: it needs two explicit offline results after 15 minutes of Eulerstream silence; `unknown` never resets any goal or overlay.
- Goals with **Bei Streamende zurücksetzen** disabled retain their values and target basis across terminal session boundaries.

## Verification

Regression tests cover adapter session generations, Goals terminal and same-room resets, both EmojiRain variants, Spotlight reset behavior, and TopTier session-key handling. Focused Jest, lint, syntax/JSON validation, and a real browser route against the restarted local server are required before publishing.
