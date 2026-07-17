# Music Bot History Playback Recovery Design

## Problem

AutoDJ mix mode reads historical tracks as canonical YouTube page URLs and sends them directly to MPV. In the live Windows runtime, MPV does not turn those page URLs into playable audio and reports `unrecognized file format`. Resolver-produced radio tracks work because they already contain a direct `streamUrl`.

The history query also includes rows marked `skipped=1`, and `_emitError()` emits both `musicbot:error` and an identical `musicbot:status-toast`, so the admin UI shows each playback error twice.

## Chosen approach

Before AutoDJ playback, re-resolve only tracks that lack both `localPath` and `streamUrl`. Merge the refreshed resolver result with the AutoDJ requester metadata and canonical identity, then pass the direct locator to the existing playback controller. Already-resolved radio and playlist tracks remain unchanged.

Alternatives rejected:

- Configuring MPV's internal youtube-dl hook would keep playback dependent on MPV build and PATH behavior.
- Pre-downloading the complete history would add latency and disk churn unrelated to the immediate bug.

## Safety behavior

- History candidates must satisfy `COALESCE(skipped, 0) = 0`.
- Resolver failures exclude that candidate and allow AutoDJ to try another bounded candidate.
- Three asynchronous AutoDJ playback failures inside 60 seconds stop the immediate replacement chain and deactivate AutoDJ until a later normal queue-empty cycle reactivates it.
- The compatibility event `musicbot:error` remains. `_emitError()` no longer emits the same message a second time through `musicbot:status-toast`.
- No application restart is required. Live rollout uses only `POST /api/plugins/music-bot/reload` after tests pass.

## Verification

- Regression tests prove history candidates are re-resolved while existing direct streams are not.
- Regression tests prove skipped history rows are excluded.
- Regression tests prove the third rapid playback failure stops replacement selection.
- Regression tests prove one `_emitError()` call produces one UI error channel.
- Run the focused tests, all `music-bot` tests, lint, and live status/diagnostic checks.
