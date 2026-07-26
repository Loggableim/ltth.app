# Stream Monsters 1.5 – League World Hybrid

## Global constraints

- Work only in `codex/stream-monsters-1.5-release`, based on current `origin/main`.
- Preserve plugin ID `streamalchemy`, all existing player data, and the 1.2.0, 1.3.0, and 1.4.0 archives byte-for-byte.
- Use bundled Node 22 / ABI 127 for tests and TDD: every behavior change starts with a focused failing test.
- Never run image generation during a stream or inside the plugin. Stream Monsters 1.5 ships only bundled Furry art plus Kenney as a missing-asset fallback.
- Gifts may buy access, incubation speed, and show effects, never combat stats, XP multipliers, rarity, or win probability.
- Portrait 1080×1920 is primary. Keep the bottom 26% clear for TikTok chat; important content stays in the upper 74%.
- Keep German, English, Spanish, and French behavior and UI in sync.
- Preserve the dirty main checkout. Audit local work semantically; do not mass-cherry-pick snapshots.

## Task 1: Establish Rules v5 and remove all Art Lab runtime paths

- Add focused failing tests for Rules-v5 additive migration, `visualPack: "furry"` canonicalization, preserved legacy rows, admin-only creator state, public-state redaction, and HTTP 410 `{ error: "art_lab_removed" }` compatibility responses.
- Remove ComfyUI, managed runtime, model installer, provider routing, generation jobs, Art Pool UI/runtime wiring, and all live/provider generation paths from the shipped plugin.
- Do not delete historical runtime/model/pool data from the plugin data directory or database.
- Extend configuration with incubation/expiry presets, season duration, command aliases, portrait/landscape layout, renderer quality, notification duration, and five server-persisted audio channels.
- Add structured correlation logging without secrets or direct personal data.

## Task 2: Complete the gift, egg, collection, evolution, and GCCE loop

- Add failing tests for untouched Team Heart name discovery without a hardcoded ID; deliberate mapping override; `Random`; event deduplication; six-element shuffle bags; four-template viewer bags; three active incubators; FIFO overflow; ready-slot promotion; 24-hour expiry; charged/event/boost timing; and exact early-hatch wait data.
- New setups default to 2 minutes and allow 30 seconds, 1, 2, 5, 10, or 30 minutes. Existing eggs keep `ready_at`.
- Charged is 25% faster. Matching Elemental Hour subtracts 30 seconds and adds 10 hype. Boost tiers subtract 15/30/60/120 seconds.
- Remove free starter/adopt behavior. Gifts are the only egg source.
- Default egg aliases are `eier`, `eierliste`, and `meineeier`; `eggs` is available but disabled by default. All action aliases are editable and conflict-checked.
- GCCE is the sole ingress when available; fallback TikTok parsing is mutually exclusive. Register/unregister commands and raw response handlers idempotently.
- Implement Hype 25/50/75/100 with overflow, Heart Chains 3/5/10, one stream mission, quests, achievements, paginated collections, six-card rotation payloads, and large single-monster cards.
- Mastery awards: hatch +5, battle +2, win +1, stream mission +3. Duplicates award cosmetic essence. Evolution II requires mastery 25 plus 3 total spent essence; Evolution III requires mastery 50 plus 8 total spent essence. Evolution never changes combat stats.

## Task 3: Implement persistent interactive PvP, progression, ratings, and replay

- Add failing tests for durable match reservation, ±2 level and nearest-rating matching, 30-second widening, 10-minute rematch avoidance, 15-second roster choice, 8-second A/B/C locks, deterministic timeout, special gating, agility order, shield-before-HP, sequential multi-hit data, early knockout, reload recovery, and cleanup.
- GCCE raw `A|B|C|1|2|3|4` is consumed only for the authorized viewer in the matching window.
- Special charge: attack +25%, defense +50%, each HP hit +25%; C consumes 100%.
- Keep 24 declarative three-skill catalogs and validate all six element families with deterministic cross-template simulation at levels 1/5/10/15/20.
- Every legitimate completed battle gives both monsters 10 XP and the winner +5 XP. Threshold is `100 + 25 × (level − 1)`. Levels 2–20 grant one unspent point for vitality, might, guard, or agility; timeout assignment is deterministic.
- Only the first ten daily battles affect seasonal Arena Rating/rewards. Arena Elo starts at 900 with K=32; tiers are Bronze <1000, Silver 1000, Gold 1150, Crystal 1300, Monster Master 1500.
- Collector points: hatch +2, first seasonal template +8, Evolution II +25, Evolution III +50, mastery milestone +10, stream mission +20, daily +5, weekly +20. Collector tiers remain 0/100/250/500/900.
- Season presets are 7/14/28/60/90 days, default 28. Collection, evolution, level, and stats persist.
- Store Rules-v5 action/replay data while normalizing older replays.

## Task 4: Produce and validate the bundled visual and audio library

- Audit the 24 existing Furry base forms visually and technically; regenerate only forms that fail anatomy, identity, crop, silhouette, or style review.
- Generate Evolution II and III separately for every template through the chat image generator: 48 new 1024×1024 family-friendly full-body crystal-fantasy Furry illustrations, no text/logo/watermark.
- Use a flat removable chroma background, crisp cel-shaded outline, local despill/alpha conversion, and regenerate failed fur edges rather than switching to a local/API/CLI generator.
- Create an asset manifest with template, stage, element, species, path, prompt version, SHA-256, dimensions, alpha/trim bounds, pivot, facing, hit anchor, and effect anchor.
- Curate creator-provided Kenney Impact, Interface, RPG, and Basic Spell Impact packs from `C:\Users\logga\Downloads`; bundle only suitable files with source/license/hash metadata and no unverified third-party audio.
- Validate exactly 72 unique 1024×1024 canonical Furry assets with alpha, transparent corners, plausible coverage, unique hashes, correct identity, no chroma fringe, text, or watermark.

## Task 5: Build the portrait-first Arena Director, VFX, audio, and overlay queue

- Add failing overlay/runtime tests for fixed fighter identity, portrait/landscape vectors, trim metadata, 74/26 safe zone, countdowns and per-viewer locks, telegraph→motion→impact→HUD→recoil order, sequential multi-hit, shield/heal/KO/winner state, spawn/hatch/evolution, reconnect, and atomic critical groups.
- Render both complete monsters large. Portrait uses vertical depth; landscape uses an opposing arena. Never place critical text in the bottom 26%.
- Use one deterministic Arena Timeline for WebGPU and Canvas2D/CSS. WebGPU handles particles/light/trails/distortion; fallback keeps identical gameplay timing on missing adapter, device loss, reduced motion, or low quality.
- Support `auto|high|medium|low`, FPS/fallback diagnostics, and controlled device recovery.
- Add WebAudio with master, UI, egg, battle, and reward channels; server-persisted enable/volume, limiting, preload, deterministic variants, and impact-synchronized playback.
- Spawn: portal, particle spiral, egg flight, bounce. Hatch: pulse, cracks, charge, flash, full reveal. Evolution and all battle skill families receive distinct readable VFX.
- Critical spawn/hatch/battle/evolution groups are never split or evicted. Noncritical cards wait until the arena ends and display for at least 8 seconds, default 12.

## Task 6: Replace the Creator UI with the six-area Live Center

- Add failing UI/i18n/security tests for real TikTok/GCCE/OBS status, command prefix and conflicts, queue/hype/match phase/countdown, renderer/audio diagnostics, and actionable errors.
- Implement sections: Live Center; Gameplay; Gifts & Chat; Overlay Studio; Monster & Asset Library; Community & Seasons.
- Provide true 1080×1920 and 1920×1080 previews, draggable anchors, separate scales, safe-zone warnings, renderer/audio controls, and deterministic demos for spawn, ready, hatch, collection, evolution, match, attack, defense, multi-hit, special, KO, XP, and rank-up.
- Remove all Art Lab/GPU/provider controls. Show integrity and fallback status for the 72 bundled forms instead.
- Keep all visible copy synchronized in de/en/es/fr.

## Task 7: Package, verify, integrate, and release

- Set Stream Monsters to 1.5.0/Open Beta and LTTH app/root/version metadata to 1.4.1.
- Update active docs, changelog, store metadata, four locales, and new 1920×1080 Creator plus 1080×1920 Arena screenshots.
- Build deterministic `plugin-store/packages/streamalchemy-1.5.0.zip`, verify source parity and SHA-256 in `plugin-store.json`, and prove older archives are unchanged.
- Run all Stream Monsters/GCCE tests with Node 22, migration/security/asset/balance/overlay suites, lint, CSS build, `git diff --check`, and a time-bounded complete Jest run.
- Re-fetch and integrate only verified conflict-free local work. Obtain task-level and whole-branch code review.
- Recheck stream state. If disconnected, restart LTTH from the exact release worktree and smoke-test Team Heart/Random, queue, wait card, Furry hatch, collection carousel, interactive battle, XP/stat choice, evolution, rankings, both layouts, audio, and renderer fallback.
- Merge/push the reviewed branch to GitHub `main`, publish tag/release `v1.4.1`, and verify GitHub main, tag, store hash, and release artifacts reference the same tested commit.
