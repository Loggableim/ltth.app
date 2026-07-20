# Game Engine Chess Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the analyzed chess gameplay, timer, interactive lifecycle, queue, overlay, and admin-promotion defects while preserving immediate starts and the shared Connect4/chess FIFO.

**Architecture:** Keep `InteractiveController` as the authority for interactive sessions and route every terminal result through `_completeSession()`. Strengthen `ChessGame` as the legal-move and legacy-clock safety boundary, then make the chess overlay consume the existing authoritative snapshot/config contract.

**Tech Stack:** CommonJS Node.js, Jest, chess.js, Socket.IO snapshots, static HTML/CSS/JavaScript.

## Global Constraints

- Preserve immediate match creation through `InteractiveController.startMatch()`.
- Preserve one FIFO queue for Connect4 and chess host turns.
- Do not restore the obsolete chess challenge workflow.
- Keep changes scoped to `app/plugins/game-engine` and its focused tests/docs.
- Use 2-space JavaScript indentation and existing logger/API patterns.
- Write each regression test before its production fix and run it red before implementation.

---

### Task 1: Chess terminal-state and time-control safety

**Files:**
- Modify: `app/plugins/game-engine/games/chess.js`
- Modify: `app/plugins/game-engine/main.js` time-control validation/config route
- Test: `app/plugins/game-engine/test/chess-lifecycle.test.js`
- Test: `app/plugins/game-engine/test/chess-game.test.js` if the focused class suite is the established location

**Interfaces:**
- `ChessGame` rejects invalid time-control strings before creating usable timers.
- `ChessGame.makeMove()` returns a stable failure for completed games and a terminal timeout result without mutating the board.
- API/command validation accepts positive finite minutes with a bounded increment and rejects zero, malformed, negative, infinite, or oversized values.

- [ ] Add failing tests for `bad`, `0+0`, post-resignation move, and an expired legacy clock move.
- [ ] Run the focused chess tests and confirm the new assertions fail against the current implementation.
- [ ] Add one shared validator/parser and guard `makeMove()` before chess.js mutation.
- [ ] Run the focused tests and confirm all pass.
- [ ] Run the existing chess lifecycle tests again to protect timeout accounting.

### Task 2: Interactive terminal lifecycle and shared queue safety

**Files:**
- Modify: `app/plugins/game-engine/backend/interactive-controller.js`
- Modify: `app/plugins/game-engine/main.js` resignation handling
- Test: `app/plugins/game-engine/test/interactive-controller.test.js`
- Test: `app/plugins/game-engine/test/chess-lifecycle.test.js`

**Interfaces:**
- Add an interactive resignation entry point that validates the session/game role and delegates to `_completeSession()`.
- Host resignation resolves the current interactive chess session without calling legacy `endGame()` directly.
- Queue membership, timers, registry state, persistent interactive state, result event, XP/ELO, and leaderboard behavior remain atomic from the caller perspective.

- [ ] Add failing controller tests for host resignation in a visible queue-head session and a background/session-revision rejection.
- [ ] Add a failing integration-level test proving a terminal session cannot accept another viewer/host move.
- [ ] Run only these tests and verify the expected failures.
- [ ] Implement the smallest controller/main routing change; do not add a second queue.
- [ ] Run controller, core, timer-router, and lifecycle tests.

### Task 3: Chess overlay configuration and viewer timing

**Files:**
- Modify: `app/plugins/game-engine/overlay/chess.html`
- Modify: `app/plugins/game-engine/overlay/unified.html` only if forwarding/status data is required
- Test: `app/plugins/game-engine/test/interactive-overlay-dom.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-contract.test.js`

**Interfaces:**
- `applyInteractiveSnapshot()` applies visual config and all conditional layers.
- Viewer response countdown uses `display.viewerDeadlineMs` and `display.serverTimestamp` without changing server authority.
- Result reasons map to configured display text/runtime translations.

- [ ] Add failing DOM tests for disabled last-move/check/captured/coordinates, configurable timer warning, viewer countdown, and `host_timeout` mapping.
- [ ] Run the DOM/contract tests and confirm the failures.
- [ ] Add CSS variables/config application, conditional rendering, coordinate nodes, countdown cleanup, and localized reason mapping.
- [ ] Run the overlay suites and verify no stale interval remains after state/result changes.

### Task 4: Host promotion controls and active chess settings

**Files:**
- Modify: `app/plugins/game-engine/ui.html`
- Modify: `app/plugins/game-engine/overlay/chess.html` for displayed labels/audio/celebration if needed
- Test: `app/plugins/game-engine/test/interactive-ui-contract.test.js`
- Test: `app/plugins/game-engine/test/interactive-overlay-dom.test.js`

**Interfaces:**
- A host promotion choice produces UCI suffix `q`, `r`, `b`, or `n`.
- Chess settings exposed in the active UI either affect the overlay or are removed when they are intentionally obsolete; challenge controls are removed from the chess settings panel.

- [ ] Add failing markup/contract tests for four promotion choices and absence of obsolete chess challenge controls.
- [ ] Run the UI/DOM tests and verify the expected failures.
- [ ] Implement a keyboard- and click-accessible promotion choice control with cancellation.
- [ ] Remove only the obsolete chess challenge controls and associated save/load fields.
- [ ] Run UI/DOM contract tests and a static JavaScript syntax check.

### Task 5: Full verification and handoff

**Files:**
- Modify: focused tests only if a discovered regression needs coverage

- [ ] Run all focused Game Engine suites with `npm test -- --runInBand --silent ...`.
- [ ] Run `npm test -- --runInBand --silent` from `app`.
- [ ] Run `npm run build:css` and `npm run lint -- --quiet`.
- [ ] Run `git diff --check`, inspect the final diff, and verify unrelated worktree changes were not touched.
- [ ] Report exact test results and the isolated branch/commit state.
