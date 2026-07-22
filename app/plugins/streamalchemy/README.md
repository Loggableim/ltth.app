# Stream Monsters

Stream Monsters keeps the stable `streamalchemy` plugin ID so existing installations and store updates continue to work. The former crafting data remains untouched; the new game uses separate `streammonsters_*` tables.

## Creator flow

1. Open `/streammonsters/ui` (the legacy `/streamalchemy/ui` route serves the same setup).
2. Confirm or override the creator name, select TikTok gifts and mark optional booster gifts.
3. Prepare the image pool before the stream. Generation is serialized to one local job and never runs from a live gift event.
4. Add `/streammonsters/overlay` as an OBS browser source and run the safe demo.

Unknown gifts always show the deterministic element-egg fallback immediately. The viewer can use `!inventory` in the next stream; the gift is remembered for the next pre-stream preparation.

## Game rules

- Gift IDs deterministically map to Ember, Tide, Grove, Gale, Volt or Lunar and to an egg colour.
- Every gift spawns one egg. At three unhatched eggs, the oldest egg is accelerated instead.
- Eggs hatch after 30 minutes of real time, including while the creator is offline. Configured booster gifts and mixed-gift combos visibly shorten the timer.
- Hatched monsters persist with an element, rarity, four seed-derived battle stats, XP, level and selected status.
- Daily quests cover receiving an egg, hatching and using a command. Weekly quests cover collections, duels and event help.
- A TikTok session starts a transparent elemental hour. Matching element eggs receive its configured hatch bonus.
- Prestige is voluntary after collecting all six elements. It resets only progress counters, never monsters.

## Viewer commands

- `!inventory` or `!monsters`
- `!choose <slot>`
- `!battle` / `!leavebattle`
- `!monstershelp`

`!battle` joins a five-minute public queue. Two different viewers immediately resolve a reproducible three-round duel with stored rounds and element advantages. There are no stakes, cash prizes, transferable rewards, paid random outcomes, or third-party character assets.

## Local image generation

The managed path is intentionally Windows/NVIDIA-first. It recommends 512 px at 6–7 GB VRAM, 768 px from 8 GB and 1024 px from 12 GB, always at four steps and one job at a time. A managed install accepts only a pinned HTTPS runtime archive and a SHA-256-pinned model, extracts it safely, starts it and health-checks it. Unsupported GPUs, macOS and Linux are clearly routed to an existing ComfyUI or remote-provider setup.

A release must set the signed `streamMonsters.localRuntime.manifest` configuration before the managed download button is enabled. This avoids a false “installed” result for an unpinned runtime.

## HTTP and overlay events

- `GET /api/streammonsters/state`
- `GET /api/streammonsters/gift-catalog`
- `POST /api/streammonsters/config`
- `POST /api/streammonsters/pool`
- `POST /api/streammonsters/pool/prepare`
- `POST /api/streammonsters/demo`
- `GET /api/streammonsters/local-runtime/status`
- `POST /api/streammonsters/local-runtime/install`

The overlay consumes `streammonsters:egg_spawned`, `streammonsters:egg_boosted`, `streammonsters:gift_combo`, `streammonsters:egg_hatched`, `streammonsters:stream_started`, `streammonsters:battle_started`, and `streammonsters:battle_completed`.

## Explicit later work

Seasonal collections are a future release item. This version records compatible progress foundations but intentionally does not ship seasonal paid content or billing.
