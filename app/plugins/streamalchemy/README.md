# Stream Monsters 1.2 – Collector Arena

Stream Monsters keeps the stable `streamalchemy` plugin ID so existing installations, routes and data remain compatible. The public product name is exclusively **Stream Monsters**. Existing crafting data stays untouched; Collector Arena uses additive `streammonsters_*` tables.

## Creator flow

1. Open `/streammonsters/ui`.
2. In **Geschenke-Mapping**, search the complete shared TikTok catalog and explicitly enable each spawn or boost gift.
3. In **Art Lab**, prepare one to eight AI skins per active element/variant before going live. Three is the default. Generation is serial and a live gift never starts an image job.
4. Add `/streammonsters/overlay` as an OBS browser source and run the full safe demo.

Only enabled mappings affect the game. A spawn gift creates an element egg. A boost gift shortens the oldest active egg by 15, 30, 60 or 120 seconds according to the catalog diamond band. Gift value never changes combat strength or random odds.

## Eggs, monsters and progression

- The six elements are Ember, Tide, Grove, Gale, Volt and Lunar.
- Standard incubation takes five minutes. Charged eggs are cosmetic and hatch faster, but never receive better stats.
- Finished eggs become `ready`, free their incubator slot and hatch only through `!hatch [slot]`.
- Hype gains 10 per spawn and a 20-point bonus for two different selected gifts within six seconds. At 100, the next egg becomes deterministically charged and hype returns to zero.
- Every monster gets a deterministic name, personality and exactly 28 base stat points.
- AI art is consumed from the pre-stream pool by `element:variant`. With no prepared skin, the bundled CC0 Kenney Monster Builder renders a deterministic local SVG immediately.
- A later preparation may cosmetically evolve one Kenney monster to AI art without changing its owner, identity or stats.
- Collections and levels are permanent. A 28-day league resets only season points and rank.
- XP and season points come from hatches, the first ten daily battles, wins and quests. Cosmetic ranks, titles, badges and frames never add combat power.

## Viewer commands

- `!eggs`
- `!hatch [slot]`
- `!monsters`
- `!monster [slot]`
- `!choose <slot>`
- `!battle`
- `!leavebattle`
- `!rank`
- `!quests`
- `!monstershelp`

`!battle` joins a public queue. Matchmaking starts within ±2 levels and widens after 30 seconds. Two viewers resolve a reproducible three-round duel with a stored seed, stored round results and visible element advantage. There are no stakes, cash prizes, transferable rewards, paid random outcomes, teams, battle passes or world bosses.

## Public API

- `GET /api/streammonsters/state?userId=`
- `GET /api/streammonsters/gift-catalog?q=&locale=&offset=&limit=`
- `GET /api/streammonsters/gift-mappings`
- `PUT /api/streammonsters/gift-mappings/:giftId`
- `DELETE /api/streammonsters/gift-mappings/:giftId`
- `POST /api/streammonsters/config`
- `GET /api/streammonsters/pool`
- `POST /api/streammonsters/pool/prepare`
- `GET /api/streammonsters/season`
- `GET /api/streammonsters/leaderboard?limit=`
- `POST /api/streammonsters/demo`
- `GET /api/streammonsters/local-runtime/status`
- `POST /api/streammonsters/local-runtime/install`

The responsive overlay serializes its animation queue and consumes the compatible legacy events plus `egg_ready`, `hatch_started`, `monster_visual_evolved`, `hype_changed`, `battle_round`, `achievement_unlocked` and `season_rank_changed` events in the `streammonsters:` namespace.

## Bundled assets and license

The plugin bundles twelve transparent 1024×1024 element eggs, the Stream Monsters icon and wide logo, and Kenney Monster Builder Pack 1.0. Kenney assets are CC0; the upstream license is included at `assets/kenney-monster-builder/License.txt`.
