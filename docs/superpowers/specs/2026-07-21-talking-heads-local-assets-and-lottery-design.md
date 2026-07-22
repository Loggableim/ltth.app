# Talking Heads Local Assets and Gift Lottery Design

## Goal

Talking Heads uses only bundled modular character assets and lets a TikTok gift award a random character. The winner can keep the character with `!keep` or arm another draw for their next qualifying gift with `!reroll`.

## Local character model

`AssetSpriteLibrary` is the only avatar source. It exposes Boba Animals, Kenney Monster Builder, and the vector character builder, then materializes five local SVG frames: `idle_neutral`, `blink`, `speak_closed`, `speak_mid`, and `speak_open`.

Normal TTS uses the global selected character unless a user has a lottery selection. No image provider, API key, network image request, or profile analysis participates in the flow.

## Lottery trigger

Configuration contains these fields:

- `avatarLotteryEnabled`: `true` by default.
- `lotteryGiftId`: empty by default; when set, it is the authoritative exact gift identifier.
- `lotteryGiftNames`: `['Heart Me', 'Team Heart', 'Team Herz']` by default; used only when no ID is configured.
- `lotteryAnimationDuration`: `2200` milliseconds by default.

Gift matching normalizes whitespace and case. A configured ID wins over name matching. The gift handler accepts TikTok event variants for user ID (`userId`, `user_id`, `uniqueId`) and gift ID/name (`giftId`, `gift_id`, `giftName`).

## Persistent per-user state

One SQLite row per TikTok user stores a JSON-safe asset selection and one state:

| State | Gift behavior | Chat command behavior |
| --- | --- | --- |
| no row | qualifying gift draws a character and creates `pending` | commands have no effect |
| `pending` | next qualifying gift draws a new character and stays `pending` | `!keep` changes it to `kept`; `!reroll` keeps it eligible for the next draw |
| `kept` | selection stays unchanged | `!reroll` changes it to `reroll_armed` |
| `reroll_armed` | next qualifying gift draws a new character and returns to `pending` | `!keep` keeps the current selection until the next draw |

The default is a repeat draw: an avatar remains provisional until the viewer explicitly sends `!keep`. `!reroll` only re-enables drawing after an avatar has been kept.

## Overlay contract

On a draw, the backend emits `talkingheads:avatar:lottery:start` with three local candidate idle sprites, the final five-frame result, username, `!keep`, `!reroll`, and duration. The overlay cycles candidate sprites like a slot machine, resolves to the winner after the supplied duration, then presents an info box: “won character”, “`!keep` to keep”, and “`!reroll` to draw again on the next qualifying gift”.

The result remains a normal five-frame Talking Heads sprite set, so subsequent TTS animation works without a second asset decision.

## Failure behavior

Invalid or missing gift/user data is ignored and logged. A missing local asset prevents the draw but leaves the prior persistent selection untouched. Chat commands are exact, case-insensitive tokens after trimming; text such as `!keeper` is ignored.

## Verification

Unit tests cover state transitions, configuration-aware gift matching, exact command parsing, deterministic random selection, a lottery event with three candidates, and preference of the user’s lottery selection during TTS. Existing route, animation-flow, UI-i18n, and asset-library suites remain green.
