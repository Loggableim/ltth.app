# Stream Monsters 1.11 – Portrait Arcade Rally

## Context

Implement Stream Monsters 1.11 from local `main` commit
`3d3563022c724c90b507a6e45fc0466869735b2f`. Preserve the stable plugin ID
`streamalchemy`, existing collections, eggs, battles, ratings, and replay
compatibility. Never mutate the dirty primary checkout or reload/restart the
running LTTH instance during implementation.

## Global Constraints

- Portrait gameplay owns only the upper 74% during battles; the lower 26% is a
  TikTok chat safe zone.
- Outside battles, notifications must not cover the music strip, avatar panel,
  Likes bar, egg shelf, or XP card from the supplied 477×829 reference layout.
- GCCE is the sole command ingress when active; the TikTok listener is fallback
  only. The first sealed `A/B/C` choice is never revealed before both choices
  or timeout.
- All public payloads use sanitized display names and opaque identifiers.
- German and English are the default overlay languages. Creators may choose one
  or two of `de|en|es|fr`; each critical language page lasts 4–6 seconds,
  default 5. Language presentation never changes combat charge or balance.
- Existing eggs retain `ready_at`; existing saved creator hatch durations are
  not overwritten. New configurations default to 90 seconds.
- Existing packaged versions remain byte-identical. Release only a new
  `streamalchemy-1.11.0.zip`.
- Use the bundled Node 22 runtime and TDD for every behavior change.

### Task 1: Establish the tested integration baseline

- Inventory source commits and diffs from
  `codex/streammonsters-ko-clarity`,
  `codex/egg-shelf-autohatch`, and
  `codex/streammonsters-public-dex`.
- Identify the focused Stream Monsters, GCCE, overlay, locale, store, and site
  suites on the current baseline.
- Run the focused baseline with Node 22/ABI 127 and record genuine baseline
  failures separately.
- Do not modify production code in this task.

### Task 2: Implement Rules-v8 K.-o. combat and public results

- Semantically port the valid K.-o.-clarity behavior; do not blindly cherry-pick.
- New battles use `rulesVersion:8` and end only through K.-o. or explicit
  forfeit. Remove the live three-round HP tie-break while preserving old replay
  normalization.
- Roster choice defaults to 8 seconds and stat choice to 10 seconds.
- Skill choice is 6 seconds with one locale and
  `max(6000, localeCount × secondsPerLocale × 1000)` with two locales.
  If both valid choices lock early, resolve immediately.
- Time charge is 5 percentage points per combat second, capped at 30 points per
  round. Locale presentation beyond six seconds cannot add charge. Existing
  action/defence/hit charge remains.
- From round 5, Arena Collapse halves newly gained shield and applies
  `2 * (round - 4)` (2 damage in round 5) neutral, shield-ignoring damage after the round. Collapse never
  reduces either monster below 1 HP and therefore never creates the K.-o.
- Persist collapse, charge ticks, actions, K.-o., XP, level-up, and rating
  results deterministically.
- Every `1–4` stat-choice prompt and result must identify the sanitized player
  display name, monster name, current level, and remaining unspent points.
  Exactly one monster is active in a choice window; numeric platform IDs must
  never be rendered as its owner.
- Extend `battle_completed` compatibly with knockout round, terminal reason,
  sanitized winner player/monster, remaining HP, and complete before/after/delta
  rating changes. Daily rating limits report unchanged rating explicitly.
- Preserve GCCE raw-response authorization, deduplication, cooldowns, sealed
  choices, cleanup, and fallback behavior.

### Task 3: Implement the living egg shelf and contextual control loop

- Semantically port the valid egg-shelf/auto-hatch behavior.
- Gift eggs are owned immediately, animate into the shelf exactly once, and
  never enter adoption states.
- Show up to eight eggs plus `+N`, with exact countdown, ready, queue, and
  rotten status. Snapshot/timer refreshes must not replay landing animation.
- The egg shelf and generic gift/event notification rail are mutually
  exclusive layout lanes. A notification must render above the shelf or wait
  in the noncritical queue; it may never run behind, through, or underneath
  egg icons.
- Free eggs are private for 60 seconds, then public. Show compact upper-third
  cards for reservation/public availability. Claim removes the public stage
  entry immediately and moves the egg into inventory.
- Add optional auto-hatch, default enabled when unset. A ready egg auto-hatches
  only when its owner has been active in chat/gifts within the last 300 seconds.
- Keep FIFO incubation, three active slots, boost fairness, 24-hour rot, and
  existing `ready_at`.
- Add one contextual `NEXT` hint at a time with no more than two currently
  valid commands. Elemental Hour must state timing/hype effects and explicitly
  say combat values are unchanged.
- Use safe avatar delivery or initials; never show an empty “Unknown” badge or
  a numeric platform ID as a viewer name.

### Task 4: Implement overlay-local languages and command usability

- Add `overlayLanguage` configuration with `primaryLocale`, one or two unique
  locales from `de|en|es|fr`, and `secondsPerLocale` from 4–6, defaulting to
  German + English and 5 seconds.
- Do not call the global i18n language switcher. Add a cached overlay-local
  resolver with primary-locale fallback and no raw-key/raw-English fallback.
- Critical prompts show each active language sequentially. If both fighters
  lock early, action begins immediately and any unshown translation appears in
  the action result card. Noncritical hints/rewards alternate deterministically
  by stable event ID.
- Remove hardcoded English from the Stream Monsters overlay and complete all
  affected keys in German, English, Spanish, and French.
- Group command management into Eggs, Collection, Arena, and Progress. Show the
  effective prefix, primary command, aliases, GCCE conflict, TikTok filter
  status, personal/global cooldown, and plain-language outcome.
- Keep overlay hints overlay-only; do not emit automatic help chat messages.

### Task 5: Implement the portrait takeover arena and creator experience

- During battle, render an opaque/semi-opaque arena in the upper 74% and keep
  the lower 26% empty. Pause and queue noncritical shelf, XP, Likes, music, and
  notification cards; restore current state after battle.
- Outside battle, reserve separate collision-tested regions for the egg shelf,
  gift/event cards, Likes bar, and XP card at both 477×829 and 1080×1920.
- Render both full monsters, large sanitized player names, HP, shield, element
  advantage, special charge, and a nonpredictive visible lead from HP+shield.
- Render large `A/B/C` cards with localized skill name, exact short effect,
  availability, and result numbers. Portrait breakpoints may not hide or
  truncate skill copy.
- Render level-up/stat allocation as a large upper-gameplay card containing the
  player, monster, level, remaining points, and all four `1–4` choices with
  their exact stat gain. The confirmation repeats player and monster.
- Use a 2–3 second action timeline: telegraph, movement, projectile/shield,
  sequential hit numbers, HUD update, knockback, recovery. Add readable
  specials, K.-o., winner, combo, trail, hit-stop, and camera effects.
- The result board remains visible for at least eight seconds and trusts the
  backend result rather than recomputing a winner from DOM HP.
- WebGPU handles particles/light/trails when available. Canvas2D/CSS follows
  the same state/timeline for OBS, device loss, low quality, and reduced motion.
- Reconnect resumes the director snapshot without duplicate events/rewards.
- Expand Creator UI into Live Center, Gameplay, Gifts & Commands, Languages,
  Overlay Studio, Monster/Skills, and Community/Diagnostics with a deterministic
  1080×1920 preview matching the supplied overlay zones.

### Task 6: Integrate the public Monsterdex and release 1.11.0

- Semantically port the public Dex work and expose all 24 templates,
  development stages, localized skills, and effect explanations on
  `/streammonsters/`.
- Add additive config/state/API validation for overlay languages, pacing,
  portrait battle mode, auto-hatch, egg stage, and public battle snapshot.
- Keep public state sanitized and admin diagnostics private.
- Add additive Rules-v8 migration while preserving old configs, eggs, monsters,
  battles, replays, ratings, images, and collections.
- Set Stream Monsters manifest/store/docs to 1.11.0/Open Beta and build
  `streamalchemy-1.11.0.zip`; do not alter prior archives.
- Verify ZIP contents and SHA-256 against `plugin-store.json`.

### Task 7: Verification and handoff

- Run focused Node 22 suites for Stream Monsters, GCCE, eggs, battle, overlay,
  locales, website, migration, API security, and plugin packaging.
- Run deterministic balance simulations across all templates/elements at
  levels 1/5/10/15/20 and representative skill sequences/seeds.
- Run browser/OBS-like checks at 477×829, 1080×1920, and 1920×1080 for WebGPU,
  fallback, reduced motion, language sequencing, long collections, reconnect,
  and critical event ordering.
- Run lint, CSS build, i18n check, `git diff --check`, package/hash validation,
  and a time-bounded full Jest collection. Report unrelated baseline failures
  separately.
- Perform a task review after every implementation task and a whole-branch
  review before handoff.
- Do not reload, restart, merge, or push during this task unless the user later
  explicitly authorizes that action after reviewing the verified result.
