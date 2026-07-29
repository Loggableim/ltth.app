# Stream Monsters 1.11 – Portrait Arcade Rally

Stream Monsters keeps the stable `streamalchemy` plugin ID so installations,
routes, collections, eggs, monsters, ratings, configuration and legacy battle
replays remain compatible. The visible product name is exclusively
**Stream Monsters**.

Version 1.11 is a bundled-only Open Beta. It ships no Art Lab, ComfyUI,
provider, model installer, generation pool or live image-generation path.
Canonical Furry assets are packaged locally; Kenney is used only if a bundled
asset is missing or damaged.

## Quick creator setup

1. Open `/streammonsters/ui`.
2. Choose spawn and boost gifts from the complete TikTok catalog. Spawn gifts
   may use one element or `Random`; only enabled mappings affect the game.
3. Select incubation, egg expiry, season, commands, overlay languages,
   portrait layout, renderer quality and audio.
4. Verify all 24 templates and 72 bundled evolution forms.
5. Add `/streammonsters/overlay` to OBS and preview 1080×1920 before going live.
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

- Ember, Tide, Grove, Gale, Volt and Lunar each contain four templates.
- Every template has Evolution I, II and III, for 72 verified bundled forms.
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

## Rules v8 K.O. Arena

`!battle` joins the fair queue. Matchmaking starts near the viewer's Arena
Rating and within ±2 monster levels, expands after 30 seconds and avoids recent
rematches when an alternative exists.

- Monster selection lasts 8 seconds.
- A/B/C selection lasts 6 seconds with one active overlay language and 10
  seconds with the default German/English pair.
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
- Arena Collapse starts at round 5: new shields are halved and neutral arena
  damage after each round increases by `round - 4`. It cannot reduce a monster
  below 1 HP, so the K.O. remains a monster action.
- Replays persist sealed choices, effects, rolls, HP, shield, charge, collapse,
  K.O., XP and rating. Rules-v5, Rules-v6, Rules-v7 and old three-round
  fixtures remain readable as compatibility history.

Only the first ten legitimate daily battles per viewer affect rating and
season rewards. Every legitimate completion still grants monster XP.

## Languages and commands

German and English are active by default. Creators may choose one or two
overlay languages from German, English, Spanish and French and set 4–6 seconds
per language. Critical cards show both languages in sequence; noncritical
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
- The shared director renders telegraph, movement, projectile or shield,
  sequential impacts, numbers, HUD update, recoil and recovery in about
  2–3 seconds.
- K.O. and winner boards use backend result data and stay visible for at least
  8 seconds.
- Element-specific WebGPU effects use distinct Ember flame, Tide flow, Grove
  growth, Gale wind, Volt electricity and Lunar eclipse signatures.
- Canvas2D/CSS follows the same timing for OBS without WebGPU, device loss,
  reduced motion and low-quality mode.
- Reconnect restores the current egg shelf or battle phase without replaying
  actions, animations or rewards.

## API surfaces

Public, sanitized routes:

- `GET /api/streammonsters/state`
- `GET /api/streammonsters/battle-state`
- `GET /api/streammonsters/battles/:battleId/replay?cursor=&limit=`
- `GET /api/streammonsters/monster-catalog?offset=&limit=`
- `GET /api/streammonsters/gift-catalog?q=&locale=&offset=&limit=`
- `GET /api/streammonsters/gift-mappings`
- `GET /api/streammonsters/season`
- `GET /api/streammonsters/leaderboard?type=collector|arena&limit=`

Creator-protected routes:

- `GET /api/streammonsters/creator-state`
- `GET /api/streammonsters/creator-catalog?userId=`
- `POST /api/streammonsters/config`
- `POST /api/streammonsters/demo`
- `PUT /api/streammonsters/gift-mappings/:giftId`
- `DELETE /api/streammonsters/gift-mappings/:giftId`

Retired Art Lab endpoints return HTTP 410 with
`{ "error": "art_lab_removed" }` and never start preserved runtimes or models.

## Bundled assets and licenses

The 72 canonical Furry forms include dimensions, alpha bounds, pivots,
identity, hit/effect anchors and SHA-256 values in
`assets/streammonsters/furry/manifest.json`. Curated deterministic 48 kHz mono
PCM cues and their CC0 source, license and hash metadata live under
`assets/audio/`.
