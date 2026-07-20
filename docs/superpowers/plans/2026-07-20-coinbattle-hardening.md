# CoinBattle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair CoinBattle gameplay, persistence, UI, and overlay behavior while making Pyramid an exclusive alternative to normal CoinBattle.

**Architecture:** The normal engine owns solo/team/1v1 matches. PyramidMode owns standalone rounds and is mutually exclusive with the normal engine. KOTH is a normal-match extension only. Event routing, idempotency, and database writes are made single-owner and transactional.

**Tech Stack:** CommonJS JavaScript, Jest, better-sqlite3, Socket.IO, browser DOM APIs, existing CoinBattle i18n.

## Global Constraints

- Keep changes scoped to `app/plugins/coinbattle` and its focused tests.
- Preserve unrelated Schnorrbecher work in the main checkout.
- Use existing CommonJS style and two-space indentation.
- Use `this.api.log()` in plugin backend code and existing logger patterns in engines.
- Write regression tests before production changes and verify every red/green cycle.

---

### Task 1: Add regression coverage for exclusive mode routing

**Files:**
- Modify: `app/plugins/coinbattle/test/integration.test.js`
- Modify: `app/plugins/coinbattle/test/match-start-event.test.js`
- Test: existing focused CoinBattle Jest suites

**Interfaces:**
- `CoinBattlePlugin` route handlers must reject starting Pyramid during a normal match and reject normal matches during an active Pyramid round.
- Gift/like handlers must dispatch to exactly one active owner.

- [ ] Add failing tests for the two conflict cases and for a Pyramid gift with no normal engine match.
- [ ] Run the focused suites and confirm the new assertions fail because current routing returns early or permits both owners.
- [ ] Implement the smallest route/event ownership changes in Task 4.
- [ ] Re-run the focused suites and confirm the new assertions pass.

### Task 2: Add regression coverage for scoring and match lifecycle

**Files:**
- Create: `app/plugins/coinbattle/test/game-engine-regressions.test.js`
- Modify: `app/plugins/coinbattle/test/regressions.test.js`
- Modify: `app/plugins/coinbattle/test/pyramid-mode.test.js`

**Interfaces:**
- `CoinBattleEngine.endMatch()` must expose draw metadata and preserve ended mode/duration for auto-reset.
- `LikesPointsSystem` must return whole awarded points while retaining fractional remainder.
- `PyramidMode` must cap extensions against the actual round duration and record per-round counters.

- [ ] Add failing tests for a team tie, auto-reset mode preservation, failed gift retryability, 100 single likes producing one coin, below-minimum Pyramid gifts not extending, and per-round extension history.
- [ ] Run only the new test file(s) and confirm each fails for the currently observed reason.
- [ ] Implement the smallest engine, likes, database, and Pyramid changes in Tasks 4 and 5.
- [ ] Re-run the tests after each subsystem change.

### Task 3: Add regression coverage for UI/overlay state helpers

**Files:**
- Create: `app/plugins/coinbattle/test/ui-regressions.test.js`
- Modify: `app/plugins/coinbattle/overlay/overlay.html`
- Modify: `app/plugins/coinbattle/overlay/overlay.js`

**Interfaces:**
- UI reset must call the backend defaults path rather than only loading the current config.
- Overlay lifecycle cleanup must cancel old winner/post-match timers and hide expired multipliers.

- [ ] Add static/runtime tests that assert timer labels have i18n markers and that overlay timer cleanup has a cancellable owner.
- [ ] Run the tests and confirm they fail against the current markup/controller.
- [ ] Implement the UI/overlay fixes in Task 6.
- [ ] Re-run the focused UI tests.

### Task 4: Repair normal engine lifecycle and event integrity

**Files:**
- Modify: `app/plugins/coinbattle/engine/game-engine.js`
- Modify: `app/plugins/coinbattle/main.js`
- Modify: `app/plugins/coinbattle/engine/koth-mode.js`
- Modify: `app/plugins/coinbattle/engine/friend-challenges.js`

- [ ] Move event-cache marking until after a successful transactional gift write.
- [ ] Add deterministic team/solo tie handling and emit draw-aware winner data.
- [ ] Preserve the ended mode/duration in auto-reset and prevent simulation from attaching to live matches.
- [ ] Freeze and resume multiplier remaining time across pause/resume.
- [ ] Validate and synchronize manual team assignments.
- [ ] Make KOTH active-state, first-crown, match-score bonus, and shutdown behavior consistent.
- [ ] Refund and terminate partially-created challenge matches when challenge setup fails.
- [ ] Run engine and integration regressions after each coherent change.

### Task 5: Repair Pyramid ownership, scoring, and persistence

**Files:**
- Modify: `app/plugins/coinbattle/main.js`
- Modify: `app/plugins/coinbattle/engine/pyramid-mode.js`
- Modify: `app/plugins/coinbattle/backend/likes-points.js`
- Modify: `app/plugins/coinbattle/backend/database.js`

- [ ] Make all Pyramid entry points call one standalone round lifecycle and enforce mutual exclusion.
- [ ] Route gifts/likes to Pyramid before normal engine processing when Pyramid owns the session.
- [ ] Add remainder accumulation for likes/shares/follows/comments keyed by match, user, and event type.
- [ ] Make gift insertion and participant updates transactional.
- [ ] Make Pyramid extension and round statistics per-round and reject extensions for failed joins.
- [ ] Filter history leaderboards to completed matches and add deterministic tie-breakers.
- [ ] Run the Pyramid, likes, and database regression suites.

### Task 6: Repair dashboard and overlay behavior

**Files:**
- Modify: `app/plugins/coinbattle/ui.js`
- Modify: `app/plugins/coinbattle/ui.html`
- Modify: `app/plugins/coinbattle/overlay/overlay.js`
- Modify: `app/plugins/coinbattle/overlay/overlay.html`

- [ ] Implement a real reset-to-defaults flow using the backend configuration defaults.
- [ ] Make dashboard multiplier countdown single-owner and cancellable.
- [ ] Preserve legitimate zero-valued Pyramid settings.
- [ ] Add missing overlay i18n markers and draw/winner rendering.
- [ ] Cancel stale Pyramid/post-match timers and hide expired multiplier state.
- [ ] Run static UI/overlay regressions and the i18n suites.

### Task 7: Full verification and handoff

**Files:**
- Modify only if verification finds a covered regression.

- [ ] Run all focused CoinBattle Jest suites.
- [ ] Run `node --check` over every CoinBattle JavaScript file.
- [ ] Run `npm run build:css` and `npm run lint` from `app`.
- [ ] Inspect `git diff --check` and confirm no unrelated files changed in the worktree.
- [ ] Report any pre-existing dependency ABI blocker separately from plugin results.
