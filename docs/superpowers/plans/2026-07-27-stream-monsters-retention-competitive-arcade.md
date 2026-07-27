# Stream Monsters Retention & Competitive Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Every production change follows test-driven development.

**Goal:** Deliver the approved Stream Monsters retention, GCCE, competitive-battle, arcade-overlay, creator-UI, and release roadmap as three independently releasable plugin versions.

**Architecture:** Keep GCCE as the single command/raw-response transport and move domain behavior into focused Stream Monsters services. Persist every claim, choice, deadline, replay, and emitted domain event in SQLite so reloads and reconnects are deterministic. The OBS overlay consumes sanitized public events through one critical event queue and shares a deterministic timeline across WebGPU and Canvas2D/CSS.

**Tech Stack:** CommonJS Node.js 22, SQLite/better-sqlite3 ABI 127, Jest/jsdom, Socket.IO, static HTML/CSS/JavaScript, WebGPU with Canvas2D/CSS fallback.

## Global Constraints

- Stable plugin ID remains `streamalchemy`; all existing collections, eggs, monsters, XP, stats, mastery, evolution, seasons, and Rules-v5 replays remain readable.
- Use LTTH bundled Node 22 from `runtime/node/node.exe` for tests.
- GCCE is the only command and raw-response ingress while available; the direct TikTok listener is fallback only.
- Free eggs, gifts, quests, mastery, and evolution never buy or grant better combat odds outside normal level/stat progression.
- No automatic chat messages, spectator voting, crowd meter, Art Lab, local/provider image generation, or new monster art.
- Existing Furry assets remain canonical; Kenney remains emergency fallback only.
- Portrait primary layout reserves the lower 26 percent for TikTok chat and uses the upper 74 percent for gameplay.
- Existing plugin packages remain byte-identical; each release creates a new versioned ZIP and verified store checksum.
- Backend code uses `this.api.log()` or the existing logger, prepared SQL statements, opaque viewer references in logs, and plugin data paths for runtime data.
- Every task starts with a failing focused test, records the expected failure, implements the minimum behavior, and reruns focused regressions before commit.

---

### Task 1: Recurring Free-Egg Offers and Atomic Adoption

**Files:**
- Create: `app/plugins/streamalchemy/backend/streammonsters/free-egg-drop-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/database.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/chat-commands.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Test: `app/test/streammonsters-free-egg-drops-v6.test.js`

**Interfaces:**
- Produce `FreeEggDropService.onFirstChat({ userId, streamKey, eventId, displayName, nowMs })`.
- Produce `FreeEggDropService.adopt({ userId, streamKey, eventId, nowMs })`.
- Add command aliases `adopt` and `adoptieren`.
- Emit `streammonsters:free_egg_offered`, `streammonsters:free_egg_released`, and `streammonsters:free_egg_claimed`.

- [ ] Write focused failing tests for config defaults, first-chat offers, 60-second reservation, public FIFO adoption, cooldown, duplicate-event handling, stream cleanup, reload recovery, and 20 concurrent claims.
- [ ] Run the new suite with bundled Node 22 and record the expected missing-service/schema failures.
- [ ] Add recurring offer/claim tables without changing `streammonsters_starter_claims`.
- [ ] Implement the service transactionally: own reserved offer first, then oldest public offer; one source offer per viewer per stream; one successful claim per cooldown.
- [ ] Insert adopted eggs through the normal engine path with a stream-scoped six-element shuffle bag, standard variant, normal incubation/queue/expiry, and no Hype.
- [ ] Wire first-chat observation without consuming non-command chat and register the two aliases through GCCE.
- [ ] Run free-egg, command-ingress, egg-loop, migration, and lifecycle suites.
- [ ] Commit as `feat(streammonsters): add recurring free egg adoption`.

### Task 2: Sealed GCCE Battle Choices, Faster Windows, and Tutorial Hints

**Files:**
- Create: `app/plugins/streamalchemy/backend/streammonsters/tutorial-hint-director.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/public-event-projector.js`
- Modify: `app/plugins/streamalchemy/index.js`
- Test: `app/test/streammonsters-sealed-battle-hints-v6.test.js`

**Interfaces:**
- Rules-v6 lock event exposes only participant slot, lock state, source, round, and deadline.
- New `streammonsters:battle_choices_revealed` exposes both choices only after both decisions exist or timeout resolution runs.
- `TutorialHintDirector.nextHint(state, nowMs)` returns a sanitized overlay card or `null`.

- [ ] Write failing tests proving no choice leaks through public events/DOM before reveal, simultaneous reveal ordering, 10-second roster, 6-second action, 15-second stat windows, immediate resolution, and GCCE one-ingress semantics.
- [ ] Add failing tests for dynamic-prefix hints, active alias selection, 90-second default interval, 60–300-second validation, critical-sequence suppression, and burst coalescing.
- [ ] Run the new suite and confirm failures are caused by current public choice payloads and old timers.
- [ ] Implement Rules-v6 decision projection and reveal event while preserving Rules-v5 replay normalization.
- [ ] Implement the shorter persisted deadlines and deterministic timeout behavior.
- [ ] Implement overlay-only contextual hints for adopt, hatch, egg inventory, collection, monster card, battle, roster choice, skills, and stat allocation.
- [ ] Ensure plugin reload reconstructs deadlines and does not duplicate reveals, hints, XP, or queue effects.
- [ ] Run GCCE, battle-match, structured-logging, public-event, reconnect, and critical-queue suites.
- [ ] Commit as `feat(streammonsters): seal battle choices and add contextual hints`.

### Task 3: Six-Element Matchups, Template Roles, and Balance Gates

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/catalog.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-rules-v5.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-simulator.js`
- Test: `app/test/streammonsters-battle-rules-v6.test.js`

**Interfaces:**
- Export the approved 12 directed advantage pairs and one neutral opponent per element.
- Export one role for each template: `striker`, `guardian`, `trickster`, or `sustain`.
- Rules-v6 replay actions retain skill IDs, effects, rolls, hit order, shields, healing, statuses, charge, and knockout.

- [ ] Write failing catalog tests for all 24 templates, 72 unique presentation records, exact role distribution, effect budgets, and the approved matchup matrix.
- [ ] Write failing resolver tests for deterministic replay, charge gating, statuses, multi-hit ordering, and permanent-stat immutability.
- [ ] Extend the simulator tests across all templates, levels 1/5/10/15/20, representative stat profiles, legal skill sequences, and deterministic seeds.
- [ ] Implement the matrix and role modifiers: striker trades defense for offense; guardian trades offense for shields; trickster shifts budget into element reactions; sustain trades immediate damage for healing.
- [ ] Tune only declared effect values until neutral matchups stay within 47–53 percent, advantages within 55–60 percent, and no template exceeds 56 percent across neutral equal-level pairings.
- [ ] Persist Rules-v6 actions without rewriting old battle rows.
- [ ] Run battle rules, simulator, replay, progression, and match-service suites.
- [ ] Commit as `feat(streammonsters): add balanced template battle roles`.

### Task 4: Portrait Arcade Arena, Animation Timeline, and Audio

**Files:**
- Modify: `app/plugins/streamalchemy/streammonsters-arena-director.js`
- Modify: `app/plugins/streamalchemy/streammonsters-arena-view.js`
- Modify: `app/plugins/streamalchemy/streammonsters-overlay.html`
- Test: `app/test/streammonsters-arcade-overlay-v6.test.js`

**Interfaces:**
- One deterministic timeline renders spawn, hatch, reveal, action, multi-hit, special, knockout, winner, XP, and rank events.
- WebGPU and Canvas2D/CSS consume the same timeline and event IDs.
- Critical groups cannot be split, dropped, or replayed twice.

- [ ] Write failing jsdom/timeline tests for element roulette, egg impact, hatch cracks/reveal, sealed cards, simultaneous reveal, multi-hit sequencing, HUD-after-impact ordering, special, knockout, XP, and rank beats.
- [ ] Add failing portrait/landscape tests for the 74/26 safe zone, full-monster framing, large text, anchors, Reduced Motion, Device-Loss fallback, and reconnect dedupe.
- [ ] Implement arcade timing with restrained idle states and strong peaks for hatch, NEW discovery, evolution, special, knockout, win streak, and rank up.
- [ ] Add deterministic element-specific particles, trails, hit-stop, camera impulse, damage/heal/shield numbers, and winner framing without money or gambling claims.
- [ ] Integrate existing curated CC0 audio through UI, Egg, Battle, and Reward buses with mute, volume, ducking, limiter, and deterministic variants.
- [ ] Preserve readable information and timing when WebGPU/audio are unavailable.
- [ ] Run arena director/view, overlay queue, reconnect, audio, layout, and demo suites.
- [ ] Commit as `feat(streammonsters): deliver portrait arcade battle presentation`.

### Task 5: Creator Configuration, Diagnostics, Demo, and Localization

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Modify: `app/plugins/streamalchemy/streammonsters-ui.html`
- Modify: `app/plugins/streamalchemy/streammonsters-creator-runtime.js`
- Test: `app/test/streammonsters-creator-retention-v6.test.js`

**Interfaces:**
- Config accepts `freeEggDropsEnabled`, `freeEggCooldownSeconds`, `tutorialHintsEnabled`, and `tutorialHintIntervalSeconds`.
- Creator state exposes aggregate offer counts, next cleanup, GCCE ingress/alias diagnostics, hint state, match phase/deadline, renderer, FPS, audio, and fallback reason.
- Demo supports free offer/release/claim, sealed lock/reveal, each role, multi-hit, special, knockout, XP, and rank scenes.

- [ ] Write failing API validation/security tests for all new fields and creator-only diagnostics.
- [ ] Write failing UI tests for toggles, seconds input, alias help, hint controls, warnings, current timers, and portrait preview.
- [ ] Write failing localization contract tests for German, English, Spanish, and French strings.
- [ ] Implement safe config normalization: cooldown 60–31,536,000 seconds; hint interval 60–300 seconds; defaults 86,400 and 90.
- [ ] Implement aggregate diagnostics without exposing direct viewer IDs, disk/GPU/provider data, or private config through public state.
- [ ] Add deterministic demo scenes and contextual command copy using the active GCCE prefix.
- [ ] Run creator UI/runtime, routes-security, i18n, demo, and public-surface suites.
- [ ] Commit as `feat(streammonsters): add retention controls and live diagnostics`.

### Task 6: Competitive Depth, Progression, Replays, and Seasons

**Files:**
- Modify: `app/plugins/streamalchemy/backend/streammonsters/battle-match-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/progression-service.js`
- Modify: `app/plugins/streamalchemy/backend/streammonsters/routes.js`
- Test: `app/test/streammonsters-competitive-depth-v6.test.js`

**Interfaces:**
- Matchmaking uses arena rating and level gap ±2, widens every 30 seconds, and avoids recent opponents for 10 minutes when possible.
- Abort before roster lock has no reward; abort after lock records a loss; repeated queue dodges produce a short cooldown.
- Only the first 10 legitimate daily battles alter rating/rewards; every legitimate completion grants monster XP.

- [ ] Write failing tests for rating/level matching, widening, rematch avoidance, abort boundaries, dodge cooldown, daily rating cap, unlimited legitimate XP, and asynchronous stat prompts.
- [ ] Write failing tests for non-gift/non-win daily and weekly quests, streak/rivalry/upset/rank events, season rollover, and permanent collection/progression.
- [ ] Implement the approved boundaries without allowing self-matches, duplicate reward claims, or repeated-event farming.
- [ ] Extend Rules-v6 replay normalization with reveal, action, status, XP, rating, and season result data.
- [ ] Ensure stat prompts last 15 seconds and never block the overlay queue or another viewer's match.
- [ ] Run matchmaking, progression, quest, season, replay, lifecycle atomicity, and migration suites.
- [ ] Commit as `feat(streammonsters): deepen competitive seasons and progression`.

### Task 7: Versioned Releases, Documentation, and Whole-Branch Gates

**Files:**
- Modify: `app/plugins/streamalchemy/plugin.json`
- Modify: `plugin-store.json`
- Modify: active Stream Monsters user/developer documentation
- Create: `plugin-store/packages/streamalchemy-1.6.0.zip`
- Create: `plugin-store/packages/streamalchemy-1.7.0.zip`
- Create: `plugin-store/packages/streamalchemy-1.8.0.zip`

**Interfaces:**
- Each package is reproducible from its corresponding tagged plugin source state and has the checksum recorded in the store.
- The final source manifest/store entry points at 1.8.0 Open Beta.

- [ ] Add release-integrity tests that preserve old ZIP hashes and verify every new ZIP entry, version, required asset, license, and SHA-256.
- [ ] Build and verify 1.6.0 after retention/GCCE changes, 1.7.0 after battle/presentation changes, and 1.8.0 after competitive/diagnostic changes without rewriting earlier ZIPs.
- [ ] Update active German/English/Spanish/French documentation and changelog with commands, timers, fairness rules, free-egg lifecycle, skills, and creator controls.
- [ ] Run focused Stream Monsters/GCCE suites with Node 22, lint, CSS build, i18n check, `git diff --check`, package verification, and a time-bounded full Jest run.
- [ ] Run browser/OBS smoke checks at 1080×1920 and 1920×1080 from the exact release branch.
- [ ] Request final whole-branch review, fix all Critical/Important findings, and re-run affected gates.
- [ ] Commit as `release(streammonsters): publish retention competitive arcade`.
