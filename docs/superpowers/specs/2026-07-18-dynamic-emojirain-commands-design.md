# Dynamic EmojiRain commands

## Goal

Classic and WebGPU EmojiRain share one freely extensible command model. Streamers can enable, rename, add, remove, and assign an emoji or image to commands without changing GCCE itself.

## Configuration and migration

Both variants persist these fields:

```js
{
  animal_commands: [
    {
      command: 'beans',
      enabled: true,
      asset_type: 'emoji',
      asset_value: '🐾'
    }
  ],
  animal_commands_allow_team_members: true,
  animal_command_user_cooldown_ms: 60000,
  animal_command_superfan_cooldown_ms: 15000,
  animal_command_global_cooldown_ms: 15000
}
```

A missing `animal_commands` field migrates to five enabled rows: `beans` to `🐾`, `miau` to `🐱`, `rawr` to `🦖`, and both `woof` and `wuff` to `🐶`. An explicitly empty array remains empty and disables every dynamic command. Existing installations default to allowing Teamlevel members so previously entitled viewers are not locked out.

Command names are stored without `!`, normalized to lowercase, limited to 32 characters, and must match `[a-z0-9_-]{1,32}`. At most 50 rows are accepted. Duplicate names, reserved EmojiRain names (`rain`, `emoji`, `storm`, `herzballons`, `rainstop`), invalid targets, and empty targets reject the complete save. Image targets may be HTTPS URLs or safe paths returned by the variant's existing gallery/upload endpoints.

## Runtime contract

A shared CommonJS helper owns configuration normalization and validation, paid-subscriber detection, Teamlevel/count calculation, and dedicated per-command cooldown state. Both renderers consume the same helper and keep their renderer-specific config persistence and upload endpoints.

Paid subscription status is derived only from unmodified TikTok event fields, including nested raw user fields and `userIdentity.isSubscriberOfAnchor`. GCCE's enriched `context.userData.isSubscriber` is never used because GCCE also sets it for Teamlevel members. Paid subscribers are always allowed. Teamlevel members are allowed only while `animal_commands_allow_team_members` is true. Normal viewers remain excluded.

Spawn count is `max(1, floor(teamMemberLevel))`, with Teamlevel clamped to the supported 0-50 domain. Levels 1-50 therefore produce exactly 1-50 elements, and a paid subscriber at level 0 produces one.

Each command maintains independent user and global cooldown buckets. Paid subscribers use the configurable 15-second user cooldown. Teamlevel-only members use the configurable 60-second user cooldown. The configurable global cooldown is 15 seconds. The existing additional EmojiRain flood protection remains active, and dedicated cooldown state is recorded only after a successful spawn. Every dynamic command uses `burst: false` and intensity `1.5`.

## Atomic GCCE registration

GCCE remains unchanged. EmojiRain registers enabled dynamic commands with `permission: 'all'`; the handler applies the stricter paid-subscriber/Teamlevel policy itself.

Before saving, a plugin validates the full proposal and checks enabled names against GCCE commands owned by other plugins. It replaces its command set as one logical operation. If validation, conflict checking, registration, or persistence fails, the previous config and previous registrations remain active. Conflicts return HTTP 409 with all affected names.

If GCCE is unavailable, valid config is persisted with registration status `pending`. Plugin startup and subsequent GCCE integration attempt registration again. Successful config responses include status and currently registered dynamic names.

## User interface

Both plugin pages use one safe DOM component for the “Emoji commands” editor. Each row contains an enabled toggle, `!` command-name field, asset type, emoji or image selection with preview, and remove action. An add button creates one empty row. Image selection reuses the existing gallery, upload, and HTTPS URL facilities.

The editor also exposes the Teamlevel access toggle and cooldown inputs in seconds, defaulting to 60, 15, and 15. All static and dynamic copy is translated in German, English, Spanish, and French. User-controlled values are assigned through DOM properties such as `textContent`, `value`, and attributes; they are never interpolated into HTML.

## Verification and rollout

Tests cover migration, strict validation, the 50-row limit, access decisions, counts, controlled-clock cooldowns, Classic/WebGPU parity, atomic re-registration, GCCE conflicts and pending registration, UI add/remove/asset/config round-trips, safe rendering, and four-language translation contracts.

After focused tests, syntax checks, lint, CSS build, and `git diff --check`, the verified change is integrated into the active local branch. Live rollout uses only the reload endpoint for the actually active EmojiRain plugin or plugins. The LTTH server is not restarted and no synthetic chat spawn is emitted during the live stream.
