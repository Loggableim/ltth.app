# Music Bot Chat Request Priority Design

## Goal

Make `!play <title>` a valid song request and ensure viewer requests are played before Auto-DJ without interrupting an already playing track.

## Command parsing

The command parser removes the configured prefix before it resolves a command. Command names and aliases must therefore be normalized by removing one leading configured prefix and lowercasing them before comparison. This preserves existing aliases such as `play` and makes saved UI aliases such as `!play` work as well.

`!play I Need a Hero` must emit the same request command payload as `!sr I Need a Hero`.

## Playback priority

Requests remain appended to the normal viewer queue. When no track is playing and autoplay is enabled, the existing queue-first playback path starts the requested title immediately. It must not call the skip path and it must not replace the active Auto-DJ track.

When a track reaches its normal end, `_playNextFromQueue()` consumes viewer requests before it falls back to Auto-DJ. Therefore a request received while Auto-DJ is playing becomes the next track, while the current track completes normally.

## Queue play race handling

Autoplay removes an idle viewer request from the queue as soon as it starts playback. A dashboard that still renders the former queue row can send one final Play request for that same song. The queue Play route must recognize the selected `songId` as the current track and return a successful `alreadyPlaying` response instead of passing an invalid index to the queue manager.

If the selected ID is neither in the queue nor the current track, the route returns a stable, user-facing stale-queue response and the UI refreshes the queue. It must not fall back to a stale numeric index, because that could start a different song.

## Error handling

Empty aliases are ignored after normalization. Command matching stays case-insensitive. Existing permission, cooldown, moderation, and duplicate-request checks remain unchanged.

## Acceptance criteria

1. With request aliases saved as `!play`, `!play I Need a Hero` resolves to `{ type: 'request', query: 'I Need a Hero' }`.
2. The same alias without `!` continues to work.
3. A viewer request while the player is idle starts through the queue playback path before Auto-DJ is considered.
4. A viewer request while Auto-DJ is already playing does not call the skip path; it remains queued for the next track.
5. Clicking Play on the still-rendered row of an autoplayed request returns the current track with `alreadyPlaying: true` and never exposes `Invalid source position`.
6. Focused Music Bot tests pass.
