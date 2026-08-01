# Stream Monsters 1.12.0 – Season 1 Portrait Arcade

Stream Monsters uses the canonical `stream-monsters` plugin ID. The historical
`streamalchemy` ID remains an invisible compatibility alias for lifecycle,
configuration, data, routes and backups, so existing collections, eggs,
monsters, ratings and replays continue to work.

Version 1.12.0 is a bundled-only stable release. It ships no Art Lab, ComfyUI,
provider, model installer, generation pool or live image-generation path.
Canonical Furry assets are packaged locally; Kenney is used only if a bundled
asset is missing or damaged.

## Quick creator setup

1. Open `/stream-monsters/ui` (`/streammonsters/ui` remains an alias).
2. Choose spawn and boost gifts from the complete TikTok catalog. Spawn gifts
   may use one element or `Random`; only enabled mappings affect the game.
3. Select incubation, egg expiry, season, commands, overlay languages,
   portrait layout, renderer quality and audio.
4. Verify all 24 Season-1 Stream Monsters and 72 bundled evolution forms.
5. Add `/stream-monsters/overlay` to OBS, choose a portrait or landscape profile, and preview before going live.
6. Run the deterministic egg, hatch, battle, K.O. and renderer-fallback demos.

New configurations use a 90-second incubation default. Available presets are
30, 60, 90, 120, 300, 600 and 1,800 seconds. Every stored creator duration and
every existing egg `ready_at` remain unchanged.

## Eggs, adoption and retention

- Gift eggs belong to the gift sender immediately and are never adoptable.
- Optional free eggs are reserved for one viewer for 60 seconds, then become
  publicly adoptable through the active `adopt` alias.
- Three eggs incubate at once; overflow waits in FIFO order. Ready eggs release
  their incubator slot and expire 24 hours after `ready_at`.
- The portrait shelf shows up to eight eggs plus rotating overflow with
  countdown, ready, queued, rotten and adoption state.
- Auto-Hatch is optional. It only hatches a ready owned egg when that owner was
  active in the current stream within the configured activity window.
- Charged eggs incubate 25 percent faster. Elemental Hour subtracts 30 seconds
  from matching new eggs and adds 10 Hype. Boost gifts subtract 15, 30, 60 or
  120 seconds.
- Gifts, free eggs, Hype, quests and events never improve combat values,
  rarity, XP multipliers or win probability.

Overlay hints explain the current lifecycle step rather than flooding chat:
gift ownership, private reservation, public adoption, incubation, queue,
readiness, manual `hatch`, Auto-Hatch and expiry each have distinct copy.

## Collection, evolution and progression

- Ember, Tide, Grove, Gale, Volt and Lunar each contain four Stream Monsters.
- Every Stream Monster has Evolution I, II and III, for 72 verified bundled forms.
- Evolution II requires mastery 25 and 3 spent essence; Evolution III requires
  mastery 50 and 8 spent essence in total.
- Evolution stages add fixed, simulator-checked stats and role-specific skill
  upgrades. A gift can never buy an evolution or stat advantage.
- Every legitimate completed battle grants both used monsters 10 XP and the
  winner 5 additional XP.
- Levels 2–20 grant one stat point. The authorized viewer answers `1`, `2`,
  `3` or `4` for vitality, might, guard or agility; the prompt names both the
  sanitized player and the affected monster.
- Collector Score and Arena Rating are separate. Collection, evolution, levels
  and allocated stats remain permanent across seasons.

## K.O. Arena

`!battle` joins the fair queue. Matchmaking starts near the viewer's Arena
Rating and within ±2 monster levels, expands after 30 seconds and avoids recent
rematches when an alternative exists.

- Monster selection lasts 8 seconds.
- The default Arcade pace gives A/B/C selection 6 seconds with one active
  overlay language and 8 seconds with the default German/English pair; stat
  selection lasts 10 or 12 seconds.
- Choices stay sealed until both fighters lock or a deterministic timeout
  resolves the missing answer. The action begins immediately when both are in.
- `A` attacks, `B` defends and both build Special charge. `C` requires 100
  percent and consumes the charge.
- Passive Special charge gains 5 percentage points per active battle second,
  capped at 30 percentage points per round. Translation time never grants
  extra charge.
- Agility determines action order; shield absorbs before HP; multi-hits render
  and resolve sequentially.
- Battles continue until a monster causes K.O. or a player forfeits. There is
  no live three-round tie-break.
- Arena Collapse is announced in round 3 and starts in round 4: new shields
  are halved and neutral arena damage after each round increases by `round - 3`.
  It cannot reduce a monster
  below 1 HP, so the K.O. remains a monster action.
- Replays persist sealed choices, effects, rolls, HP, shield, charge, collapse,
  K.O., XP and rating. Rules-v5, Rules-v6, Rules-v7 and old three-round
  fixtures remain readable as compatibility history.

Only the first ten legitimate daily battles per viewer affect rating and
season rewards. Every legitimate completion still grants monster XP.

## Languages and commands

German and English are active by default. Creators may choose one or two
overlay languages from German, English, Spanish and French. The Arcade preset
uses 6 seconds in one language and 8 seconds bilingually; Standard and
accessible presets are slower. Critical cards show both languages in sequence; noncritical
cards choose one deterministically. The global LTTH language is not changed.

Aliases and the GCCE prefix are creator-configurable and conflict-checked.
Commands are grouped into eggs, collection, arena and progress. German-first
egg-list aliases are `eier`, `eierliste` and `meineeier`; `eggs` remains an
optional alias. When GCCE is active it is the only command ingress. Raw
`A|B|C|1|2|3|4` input is accepted only from the authorized viewer during the
matching decision window.

## Portrait overlay and effects

- Portrait 1080×1920 is primary. Gameplay occupies the upper 74 percent and
  the lower 26 percent remains clear for TikTok chat.
- Outside battles, egg and information lanes are collision-aware and never
  render behind the shelf.
- During battle, both full monsters, sanitized player names, HP, shield,
  Special, readable A/B/C effects and the current lead remain visible.
- Standard actions render in 1.6 seconds, Specials in 2.4 seconds and K.O./
  terminal reveals in 2.8 seconds. After the third identical standard skill,
  the presentation becomes compact.
- K.O. and winner boards use backend result data and stay visible for at least
  2.8 seconds.
- Element-specific WebGPU effects use distinct Ember flame, Tide flow, Grove
  growth, Gale wind, Volt electricity and Lunar eclipse signatures.
- Canvas2D/CSS follows the same timing for OBS without WebGPU, device loss,
  reduced motion and low-quality mode.
- Reconnect restores the current egg shelf or battle phase without replaying
  actions, animations or rewards.

## API surfaces

Public, sanitized routes:

- `GET /api/stream-monsters/state`
- `GET /api/stream-monsters/battle-state`
- `GET /api/stream-monsters/battles/:battleId/replay?cursor=&limit=`
- `GET /api/stream-monsters/monster-catalog?offset=&limit=`
- `GET /api/stream-monsters/gift-catalog?q=&locale=&offset=&limit=`
- `GET /api/stream-monsters/gift-mappings`
- `GET /api/stream-monsters/season`
- `GET /api/stream-monsters/leaderboard?type=collector|arena&limit=`

Creator-protected routes:

- `GET /api/stream-monsters/creator-state`
- `GET /api/stream-monsters/creator-catalog?userId=`
- `POST /api/stream-monsters/config`
- `POST /api/stream-monsters/demo`
- `PUT /api/stream-monsters/gift-mappings/:giftId`
- `DELETE /api/stream-monsters/gift-mappings/:giftId`

Retired Art Lab endpoints return HTTP 410 with
`{ "error": "art_lab_removed" }` and never start preserved runtimes or models.

## Bundled assets and licenses

The 72 canonical Furry forms include dimensions, alpha bounds, pivots,
identity, hit/effect anchors and SHA-256 values in
`assets/streammonsters/furry/manifest.json`. Curated deterministic 48 kHz mono
PCM cues and their CC0 source, license and hash metadata live under
`assets/audio/`.
