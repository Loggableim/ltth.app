# Arena Left Info Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the portrait Arena stream a left information panel with visible direct-ability instructions and a German `!schild` alias.

**Architecture:** The Game Engine plugin maps accepted chat words to the existing canonical ability names.  Arena configuration admits one additional rotator placement, while the self-contained overlay maps that placement to the streamer-selected portrait panel and builds ability cards first.  The dashboard persists the placement through the existing Arena config payload.

**Tech Stack:** Node.js CommonJS, embedded browser JavaScript and CSS, Jest, ESLint, bundled Windows Node runtime.

## Global Constraints

- Work only in the isolated `codex/arena-left-info-field` worktree; preserve the dirty `main` checkout.
- Preserve `!boost`, `!shield`, and `!bomb`; add `!schild` as an alias for the canonical `shield` ability.
- The German shield card must visibly contain both `!schild` and `!shield`, the actual shield duration, and the configured recharge time.
- Add `stream-left-panel` without changing the default of existing saved Arena layouts.
- The left panel is intended for the portrait `stream-bottom` layout; non-portrait layouts must remain usable.
- Do not restart the app, reset a match, or modify food/growth balance.  After integration, reload only `game-engine`.

---

### Task 1: Add and verify the left panel and German shield alias

**Files:**
- Modify: `app/plugins/game-engine/main.js`
- Modify: `app/plugins/game-engine/games/arena.js`
- Modify: `app/plugins/game-engine/overlay/arena.html`
- Modify: `app/plugins/game-engine/ui.html`
- Modify: `app/plugins/game-engine/test/arena-engine.test.js`
- Create: `docs/superpowers/specs/2026-08-01-arena-left-info-commands-design.md`

**Interfaces:**
- Consumes: `infoRotatorPlacement`, `directAbilitiesEnabled`, `shieldDurationMs`, `abilityChargeMs`, and the existing `handleArenaAbilityCommand(ability, context)` path.
- Produces: a persisted `stream-left-panel` placement; `!schild` mapped to canonical `shield`; and first-cycle German ability cards in the rotator.

- [x] **Step 1: Write failing regression tests**

Add tests that use `ArenaGame#updateConfig()` and `getState()` to prove `stream-left-panel` round-trips, plus plugin/overlay contracts that prove the raw chat and registered command paths map `schild` to `shield`, the panel CSS/data placement exists, and German card copy contains `!schild`, `!shield`, duration, and cooldown.

- [x] **Step 2: Run the focused tests to verify they fail**

Run:

```powershell
& '..\\..\\runtime\\node\\node.exe' 'node_modules\\jest\\bin\\jest.js' --runInBand 'plugins/game-engine/test/arena-engine.test.js' -t 'stream-left-panel|schild'
```

Expected: failures identify the missing placement and alias rather than test setup errors.

- [x] **Step 3: Implement the minimum configuration, command, dashboard, and overlay changes**

Accept `stream-left-panel` in both Arena config normalizers and expose it in the dashboard select.  Map `schild` to `shield` in both GCCE registration and raw message recognition before calling the existing ability handler.  Add responsive `stream-left-panel` CSS and placement geometry for the portrait stream-bottom viewport, with a safe existing-layout fallback for landscape.  Build ability cards before normal information and render their German shield text as `!schild (auch !shield)`, deriving duration and cooldown from config.

- [x] **Step 4: Run focused tests and lint**

Run:

```powershell
& '..\\..\\runtime\\node\\node.exe' 'node_modules\\jest\\bin\\jest.js' --runInBand 'plugins/game-engine/test/arena-engine.test.js'
& '..\\..\\runtime\\node\\node.exe' 'node_modules\\eslint\\bin\\eslint.js' 'plugins/game-engine/main.js' 'plugins/game-engine/games/arena.js' 'plugins/game-engine/test/arena-engine.test.js'
```

Expected: the complete Arena suite and ESLint pass.

- [x] **Step 5: Commit the scoped change**

```powershell
git add 'app/plugins/game-engine/main.js' 'app/plugins/game-engine/games/arena.js' 'app/plugins/game-engine/overlay/arena.html' 'app/plugins/game-engine/ui.html' 'app/plugins/game-engine/test/arena-engine.test.js' 'docs/superpowers/specs/2026-08-01-arena-left-info-commands-design.md' 'docs/superpowers/plans/2026-08-01-arena-left-info-commands.md'
git commit -m "feat(arena): move command rotator to stream panel"
```
