# Stream Monsters 1.4 – Furry Skill Arena

Stream Monsters keeps the stable `streamalchemy` plugin ID so existing installations, routes and data remain compatible. The public product name is exclusively **Stream Monsters**. Existing crafting data stays untouched; Collector Arena uses additive `streammonsters_*` tables.

Version 1.4 makes **Heart Me** the normalized default discovery gift without pinning a TikTok gift ID. It ships a 24-template Furry Monsterdex, three active egg slots plus a FIFO queue, automatic skill battles, mastery, missions and animated creator/OBS overlays.

## Creator flow

1. Open `/streammonsters/ui`.
2. In **Geschenke-Mapping**, let the normalized title discover **Heart Me** as the default spawn gift, or search the complete shared TikTok catalog and explicitly enable other spawn or boost gifts.
3. In **Art Lab**, select a detected graphics adapter. The guided wizard shows the recommended pinned profile, official Beta or experimental status, disk and download sizes, the model license, and links to official NVIDIA, Intel and AMD driver downloads.
4. Install, cancel or resume the managed runtime. Then verify the backend with the 256×256 smoke test. The UI reports the actual profile, backend, device, driver, VRAM and whether that exact device passed—not a generic hardware claim.
5. Prepare one to eight AI skins per active element/variant before going live. Three is the default. Generation is serial and a live gift never starts an image job. Zero coverage remains visible, and every failure includes a concrete recovery action.
6. Add `/streammonsters/overlay` as an OBS browser source and run the full safe demo.

Only enabled mappings affect the game. A spawn gift creates an element egg. A boost gift shortens the oldest active egg by 15, 30, 60 or 120 seconds according to the catalog diamond band. Gift value never changes combat strength or random odds.

## Eggs, monsters and progression

- The six elements are Ember, Tide, Grove, Gale, Volt and Lunar.
- Spawn mappings without a fixed element use the deterministic random-element mapping; the six hatch presets remain independently configurable.
- Three incubator slots are active. Additional eggs wait in FIFO order, and boosts affect only the oldest active egg.
- Standard incubation defaults to two minutes. The creator can choose other configurable hatch presets. Charged eggs are cosmetic and hatch faster, but never receive better stats.
- Finished eggs become `ready`, free their incubator slot and hatch only through `!hatch [slot]`.
- Hype gains 10 per spawn and a 20-point bonus for two different selected gifts within six seconds. At 100, the next egg becomes deterministically charged and hype returns to zero.
- Every monster gets a deterministic name, personality and exactly 28 base stat points.
- The bundled Monsterdex contains exactly 24 Furry templates, four per element, with transparent PNG art and a hashed manifest.
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

`!battle` joins a public queue. Matchmaking starts within ±2 levels and widens after 30 seconds. Two viewers resolve a reproducible automatic skill battle with stored actions, rolls and results. Old three-round replays remain readable, while the simulator enforces its round and action limits. There are no stakes, cash prizes, transferable rewards, paid random outcomes, teams, battle passes or world bosses.

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

The responsive animated overlay supports 16:9 and 9:16. It restores `/api/streammonsters/state` before replaying socket activity after a reconnect. Battle and hatch events are critical, Hype/chat updates coalesce, stale noncritical events are discarded, and bounded overflow removes noncritical work first. Cards cover starter monsters, stance reveals, Hype milestones, Elemental Hour, streaks, upsets, rivalries and ranks as well as the existing egg and battle flow.

The creator page exposes mute and volume controls for five short local PCM WAV cues: spawn, ready, hatch, hit and win. They are original deterministic Stream Monsters cues, bundled for offline playback and dedicated to CC0 1.0 in `assets/audio/LICENSE-CC0-1.0.txt`. No third-party recording or sample is used; the existing Kenney Monster Builder license continues to cover graphics only.

## Bundled assets and license

The plugin bundles twelve transparent 1024×1024 element eggs, the Stream Monsters icon and wide logo, and Kenney Monster Builder Pack 1.0. Kenney graphics are CC0; the upstream license is included at `assets/kenney-monster-builder/License.txt`.
