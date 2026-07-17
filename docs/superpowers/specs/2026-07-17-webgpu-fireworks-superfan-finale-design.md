# WebGPU Fireworks Superfan Finale

## Purpose

Celebrate a Superfan entering the LIVE with a personalized notification and a choreographed WebGPU Fireworks finale, without repeatedly celebrating the same person inside a user-selected cooldown.

## Event detection

The WebGPU Fireworks plugin will route both supported event shapes into one Superfan handler:

- A `join` event is eligible only when `teamMemberLevel > 0`.
- A dedicated `superfan` event is authoritative even when it does not carry a team-member level.

The handler identifies a person by stable TikTok `userId` first. If it is unavailable, it falls back to a normalized `uniqueId`, `username`, or nickname. Receiving both event shapes for the same person must still produce only one celebration.

## Configuration

Add a dedicated Superfan Finale card to the WebGPU Fireworks settings with:

- `superfanFinaleEnabled`, default `true`.
- `superfanFinaleCooldownHours`, selectable as 6, 12, 24, 72, or 168 hours and defaulting to 24 hours.
- `superfanFinaleIntensity`, clamped to 1 through 10 and defaulting to 3.
- A test button that uses the selected settings but neither reads nor updates a real Superfan cooldown.

The Superfan finale inherits the existing global finale style and length from `goalFinaleStyle` and `goalFinaleLength`. This avoids a second set of identical choreography controls while preserving the user's selected show. Configuration must be normalized by the existing config schema and round-trip through the settings API and UI.

## Cooldown and persistence

Cooldowns apply per Superfan. A celebration for one person never blocks another person.

The plugin stores the last successfully accepted finale timestamp per identity in its user-profile plugin data directory, not inside the plugin source directory. The state survives plugin reloads and application restarts. Writes use a replace-safe temporary file, and records older than the longest selectable cooldown may be pruned.

The in-memory timestamp is updated immediately after the existing finale queue accepts the request, then persisted. If persistence fails, the plugin logs a warning and retains the in-memory guard for the running process. Rejected or failed finale requests do not consume the cooldown.

Changing the configured interval applies to the stored timestamp immediately. For example, changing from 24 hours to 12 hours makes a Superfan eligible once 12 hours have elapsed since their last accepted finale.

## Notification and finale

For an eligible Superfan, the plugin reuses the established follower animation channel and visual treatment, including the person's display name and profile picture when available. Its fixed notification text is:

`Superfan joined, this firework is for you!`

The notification and finale are submitted together. The finale uses the existing FIFO show queue with the configured Superfan intensity and inherited style and length. A unique event ID is attached so the queue can also reject accidental duplicate submissions. Gift rockets remain independent and continue to play during the show under the existing queue policy.

## Error handling

- Invalid configuration values fall back to the documented defaults.
- Missing user identity prevents the celebration and produces a debug log instead of a global cooldown entry.
- Corrupt persisted history is ignored with a warning and replaced on the next successful write.
- Renderer or queue failures follow the existing finale error handling and do not consume the Superfan cooldown.
- Plugin destruction clears pending notification timers but does not delete persistent cooldown history.

## Verification

Focused automated coverage will prove:

- Configuration defaults, allowed cooldown choices, intensity clamping, and UI/API round-tripping.
- A regular viewer join does not trigger anything.
- An eligible Superfan triggers the exact notification payload and one finale with the configured intensity and inherited choreography.
- The same person is suppressed until their selected interval expires, while another Superfan remains eligible.
- Duplicate `join` and `superfan` events collapse to one celebration.
- Cooldown history survives a fresh plugin instance and a corrupt history file fails safely.
- The test endpoint bypasses cooldown history without modifying it.
- Existing follower fireworks and goal finales remain unchanged.

Live verification during an active stream will use a plugin-only reload and read-only status checks. It will not trigger a visible test finale without explicit approval.
