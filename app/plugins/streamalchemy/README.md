# Stream Monsters 1.8 – Retention Competitive Arcade

Stream Monsters keeps the stable `streamalchemy` plugin ID so existing installations, routes, player data, and legacy battle replays remain compatible. The public product name is exclusively **Stream Monsters**.

Version 1.8 is a bundled-only Open Beta. Creator-selected TikTok gifts and the optional recurring free-egg loop create eggs. The release ships 72 verified Furry forms, sealed A/B/C PvP, permanent monster progression, separate Collector Score and Arena Rating leaderboards, and a portrait-first arcade OBS arena. It does not ship Art Lab, ComfyUI, model installation, provider routing, generation pools, or any live image-generation path.

## Creator flow

1. Open `/streammonsters/ui`.
2. In **Gifts & Chat**, let normalized Team Heart or Heart Me title discovery find the default spawn gift without pinning a TikTok gift ID, or deliberately map another catalog gift. Only enabled mappings affect the game.
3. Configure hatch time, recurring free eggs (60–31,536,000 seconds; default 86,400), overlay-only tutorial hints (60–300 seconds; default 90), editable GCCE aliases, season length, overlay layout and scale, renderer quality, notification duration, and the five persisted audio channels.
4. In **Monster & Asset Library**, verify all 72 bundled Furry forms. Kenney Monster Builder is shown only as an emergency fallback for a missing verified asset.
5. Add `/streammonsters/overlay` as an OBS browser source. Use the 1080×1920 portrait preview first, then tune the optional 1920×1080 landscape layout.
6. Run deterministic creator demos for egg, hatch, collection, evolution, battle, XP, rank, audio, and renderer fallback before going live.

The Creator Live Center contains exactly six areas: Live Center, Gameplay, Gifts & Chat, Overlay Studio, Monster & Asset Library, and Community & Seasons.

## Gift eggs and recurring free-egg adoption

- Recurring free eggs are optional and do not depend on gifts. The default cooldown is 86,400 seconds (24 hours); creators can choose any whole-second value from 60 through 31,536,000.
- A viewer's first chat contact creates one reserved offer when eligible. The viewer has 60 seconds to claim it with the active `adopt` alias (`!adopt` or `!adoptieren` by default).
- After 60 seconds an unclaimed offer becomes public. Adoption takes the viewer's own reservation first, then the oldest public offer in FIFO order. Claims, events, cooldowns, and reload recovery are transactional.
- Free eggs use the normal incubation, queue, expiry, shuffle-bag, and hatch paths, but add no Hype and never improve combat odds.
- Spawn mappings create element eggs; a `Random` mapping uses a persistent six-element shuffle bag.
- Exactly three eggs can incubate at once. Overflow waits in FIFO order, and ready eggs immediately free incubator slots.
- New setups default to two minutes. Available presets are 30 seconds, 1, 2, 5, 10, or 30 minutes. Existing eggs keep their stored readiness time.
- Ready eggs expire 24 hours after `ready_at`.
- Charged eggs hatch 25 percent faster. Matching Elemental Hour subtracts 30 seconds and adds 10 Hype. Boost tiers subtract 15, 30, 60, or 120 seconds.
- Paid gifts never improve combat stats, XP multipliers, rarity, or win probability.
- Hype emits the 25/50/75/100 milestones with overflow. Heart Chains, one stream mission, quests, achievements, and collection cards use the same durable event flow.

## Collection, evolution, and progression

- The six elements are Ember, Tide, Grove, Gale, Volt, and Lunar.
- The bundled Monsterdex contains 24 templates, four per element.
- Every template includes three verified 1024×1024 transparent forms: Evolution I, Evolution II, and Evolution III.
- Evolution II requires mastery 25 and 3 total spent element essence. Evolution III requires mastery 50 and 8 total spent essence.
- Evolution is cosmetic. It never changes combat stats, XP, level, owner, or paid odds.
- Every legitimate completed battle gives both monsters 10 XP and the winner 5 additional XP.
- Levels 2–20 grant one stat point for vitality, might, guard, or agility. Authorized viewers answer the post-battle prompt with `1`, `2`, `3`, or `4`.
- Collector Score and Arena Rating are separate. Seasons can last 7, 14, 28, 60, or 90 days; collection, evolution, level, and allocated stats remain permanent.
- Daily and weekly quests do not require gifts or wins. Streak, rivalry, upset, rank, and season events are idempotent presentation/reward records.
- Only the first 10 legitimate battles per viewer and day alter Arena Rating and season rewards. Every legitimate completion still grants monster XP.

## Sealed Rules-v6 A/B/C Arena

`!battle` joins the public queue. Matchmaking starts within ±2 levels, prefers the nearest Arena Rating, widens after 30 seconds, and avoids a recent opponent when another valid viewer is waiting.

- The roster choice window lasts 10 seconds.
- Each action window lasts 6 seconds.
- The first valid A/B/C answer is locked privately. Neither the public event nor the DOM reveals it until both choices exist or deterministic timeout resolution has completed; both choices are then revealed together in stable slot order.
- `A` and `B` use the monster's regular skills and build special charge.
- `C` requires and consumes a full special charge.
- Agility determines order; shields resolve before HP; multi-hit attacks remain sequential and stop on knockout.
- Missing choices use deterministic timeout decisions.
- Battles finish in at most three rounds and persist ordered Rules-v6 replay data, including skills, effects, rolls, hit order, shields, healing, status, charge, knockouts, XP, rating, and season outcomes.
- Post-level-up stat prompts last 15 seconds and never block another viewer's match or the OBS queue.
- Reload recovery resumes durable matches without duplicating rewards.
- Public battle state and replay pages omit private viewer and provider identifiers.

Rules-v5 and old three-round v3 replays remain readable. They are compatibility history, not the current sealed Rules-v6 mode.

## Element matchups and template roles

Every template has one stable role: Striker, Guardian, Trickster, or Sustain. Roles redistribute a declared effect budget; they never alter stored permanent stats.

- Ember has an advantage over Grove and Gale.
- Tide has an advantage over Ember and Lunar.
- Grove has an advantage over Tide and Volt.
- Gale has an advantage over Grove and Lunar.
- Volt has an advantage over Gale and Tide.
- Lunar has an advantage over Volt and Ember.

The acceptance simulator covers all templates at levels 1, 5, 10, 15, and 20, representative stat profiles, legal skill sequences, deterministic seeds, and mirrored sides. Cross-neutral pairs stay within the declared 47–53 percent band, directed advantages within 55–60 percent, and no neutral template exceeds 56 percent.

## Viewer commands

Aliases and the GCCE prefix are creator-configurable and conflict-checked. New German-first defaults include `eier`, `eierliste`, and `meineeier`; the canonical `eggs` alias is available but disabled by default.

Core actions cover:

- egg list and hatch
- collection and single-monster cards
- monster selection
- battle queue entry and exit
- Collector/Arena rank views
- quests and help
- cosmetic evolution

When GCCE is available it is the sole command ingress. The fallback TikTok parser is mutually exclusive, and raw `A|B|C|1|2|3|4` responses are consumed only inside the authorized viewer's active decision window.

## OBS arena, effects, and audio

- Portrait 1080×1920 is primary and reserves the lower 26 percent for TikTok chat. Important content stays in the upper 74 percent.
- Landscape 1920×1080 uses the same durable fighters and gameplay timing.
- One deterministic Arena Timeline drives WebGPU and Canvas2D/CSS rendering.
- WebGPU adds particles, lighting, trails, and distortion. Missing adapters, device loss, reduced motion, and low quality switch to the fallback without stretching gameplay timing.
- Critical spawn, hatch, evolution, and battle groups are never partially rendered. Noncritical cards wait until the arena is free.
- Overlay-only hints use the active GCCE prefix and aliases. They coalesce during bursts and wait until critical hatch/battle groups finish.
- Server-persisted master, UI, egg, battle, and reward audio channels route curated deterministic CC0 cues through a limiter.

## Public API

- `GET /api/streammonsters/state`
- `GET /api/streammonsters/battle-state`
- `GET /api/streammonsters/battles/:battleId/replay?cursor=&limit=`
- `GET /api/streammonsters/monster-catalog?offset=&limit=`
- `GET /api/streammonsters/gift-catalog?q=&locale=&offset=&limit=`
- `GET /api/streammonsters/gift-mappings`
- `PUT /api/streammonsters/gift-mappings/:giftId`
- `DELETE /api/streammonsters/gift-mappings/:giftId`
- `GET /api/streammonsters/season`
- `GET /api/streammonsters/leaderboard?type=collector|arena&limit=`

Creator-protected routes:

- `GET /api/streammonsters/creator-state`
- `GET /api/streammonsters/creator-catalog?userId=`
- `POST /api/streammonsters/config`
- `POST /api/streammonsters/demo`

Legacy Art Lab endpoints return HTTP 410 with `{ "error": "art_lab_removed" }` and do not mutate preserved historical data.

## Bundled assets and licenses

The plugin ships 72 canonical Furry forms with dimensions, alpha bounds, pivots, anchors, identity metadata, and SHA-256 hashes in `assets/streammonsters/furry/manifest.json`. The Kenney Monster Builder fallback remains CC0.

Curated 48 kHz mono PCM cues and their source/license/hash metadata live under `assets/audio/`. Bundled audio is restricted to verified CC0 Kenney Interface Sounds, Impact Sounds, RPG Audio, and Basic Spell Impacts assets.
