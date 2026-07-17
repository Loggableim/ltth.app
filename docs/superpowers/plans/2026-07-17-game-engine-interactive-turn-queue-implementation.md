# Game Engine Interactive Turn Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run concurrent host-versus-viewer Connect 4 and chess matches while a persistent FIFO host-turn queue drives one authoritative admin and OBS board.

**Architecture:** Keep the existing Connect4Game and ChessGame rule engines and the transient UnifiedQueueManager for Plinko, Wheel, and Slot. Add a dedicated persistent interactive controller composed of a registry, host-turn queue, timer service, display router, and game adapters; GameEnginePlugin delegates interactive starts and moves to it while continuing to own legacy events, XP, ELO, and result accounting.

**Tech Stack:** CommonJS JavaScript, better-sqlite3, Socket.IO, Jest, browser HTML/CSS/JavaScript.

## Global Constraints

- Connect 4 and chess share one FIFO host-turn queue containing only sessions where the host must move.
- One viewer has at most one active interactive match; default concurrency limit 20, accepted range 1 through 50.
- Connect 4 viewer response default is 30 seconds and chess viewer response default is 60 seconds; accepted range 5 through 300 seconds.
- Viewer timeout is an automatic viewer loss; Connect 4 has no host timeout.
- A chess host clock runs only while its host-turn board is the visible interactive board.
- Result display defaults to 3 seconds and accepts 1 through 10 seconds.
- The server is authoritative for revisions, display selection, deadlines, timeout results, and restart recovery.
- Legacy individual overlays and generic events remain available; Plinko, Wheel, Slot, and Arena logic is not rewritten.
- Backend uses CommonJS, 2-space indentation, prepared database statements, and plugin logging.

---

### Task 1: Persistent interactive state

**Files:**
- Modify: `app/plugins/game-engine/backend/database.js`
- Create: `app/plugins/game-engine/test/interactive-database.test.js`

**Interfaces:**
- Produces: `createInteractiveState(data)`, `updateInteractiveState(sessionId, updates)`, `getInteractiveState(sessionId)`, `getActiveInteractiveStates()`, `enqueueInteractiveTurn(entry)`, `removeInteractiveTurn(sessionId)`, `getInteractiveQueue()`, `completeInteractiveState(sessionId, reason)`, `transaction(callback)`.

- [ ] Write a failing database test using in-memory better-sqlite3 which asserts table creation, a unique queue row per session, monotonic FIFO sequence, active-state reads, and atomic state/queue updates.
- [ ] Run `runtime Node + Jest plugins/game-engine/test/interactive-database.test.js --runInBand`; expect failures because the methods and tables do not exist.
- [ ] Add `game_interactive_sessions`, `game_interactive_queue`, and `game_interactive_meta` tables with JSON state, revisions, identities, role, deadlines, host time, terminal reason, timestamps, and a unique queue `session_id`.
- [ ] Add prepared CRUD and transaction methods. `enqueueInteractiveTurn()` uses an `INSERT ... ON CONFLICT(session_id) DO NOTHING` and a persisted next-sequence counter.
- [ ] Re-run the focused test and commit `feat(game-engine): persist interactive sessions and turns`.

### Task 2: Registry, adapters, and FIFO queue

**Files:**
- Create: `app/plugins/game-engine/backend/interactive-session-registry.js`
- Create: `app/plugins/game-engine/backend/interactive-turn-queue.js`
- Create: `app/plugins/game-engine/backend/interactive-game-adapters.js`
- Create: `app/plugins/game-engine/test/interactive-core.test.js`

**Interfaces:**
- Registry: `add(session)`, `restore(session)`, `get(sessionId)`, `getByViewer(viewerId)`, `remove(sessionId)`, `list()`, `summaries(now)`.
- Queue: `enqueue(session)`, `remove(sessionId)`, `head()`, `list()`, `restore(rows)`, `has(sessionId)`.
- Adapter factory: `createInteractiveAdapter(gameType, game)` with `getState()`, `restoreState(state)`, `getCurrentTurnRole()`, `applyViewerMove(move, viewerId)`, `applyHostMove(move)`, `getResult()`, `isComplete()`.

- [ ] Write failing unit tests for mixed Connect4/chess FIFO order, duplicate enqueue prevention, stable restore order, one viewer session, summaries, role resolution, Connect 4 columns, and chess SAN/UCI moves.
- [ ] Run the focused suite and verify missing-module failures.
- [ ] Implement the three focused modules; normalize session IDs to numbers and stable viewer IDs to non-empty strings, without exposing mutation of internal maps/arrays.
- [ ] Re-run the focused suite and commit `feat(game-engine): add interactive registry and turn queue`.

### Task 3: Server-authoritative timers and display router

**Files:**
- Create: `app/plugins/game-engine/backend/interactive-turn-timers.js`
- Create: `app/plugins/game-engine/backend/interactive-display-router.js`
- Create: `app/plugins/game-engine/test/interactive-timers-router.test.js`

**Interfaces:**
- Timers: `startViewer(session, seconds)`, `clearViewer(sessionId)`, `resumeHostChess(session)`, `pauseHostChess(session)`, `clear(sessionId)`, `restore(session)`, `destroy()`.
- Router: `sync()`, `beginAnimation(sessionId, durationMs)`, `showResult(result, durationMs)`, `suspend(reason)`, `resume()`, `snapshot()`, `destroy()`.

- [ ] Write fake-timer tests proving stale viewer callbacks are ignored, viewer timeout fires once, queued chess host time is unchanged, visible chess host time decreases, old animation/result callbacks cannot advance a newer display revision, and global display revisions are monotonic.
- [ ] Run the focused suite and observe the expected missing-module failures.
- [ ] Implement absolute-deadline timers with injected `now`, `setTimeout`, and `clearTimeout`; every callback validates the session revision, role, and persisted deadline.
- [ ] Implement the router so queue head selection, phase changes, idle state, suspension, and result presentation emit full authoritative snapshots.
- [ ] Re-run the focused suite and commit `feat(game-engine): add authoritative interactive timers and display routing`.

### Task 4: Interactive controller and restart recovery

**Files:**
- Create: `app/plugins/game-engine/backend/interactive-controller.js`
- Create: `app/plugins/game-engine/test/interactive-controller.test.js`

**Interfaces:**
- Controller: `init()`, `startMatch(input)`, `applyViewerMove(input)`, `applyHostMove(envelope)`, `cancel(sessionId)`, `end(sessionId, result)`, `getState()`, `emitState(targetSocket)`, `destroy()`.
- Callbacks: `createGame`, `finishGame`, `resolveHostName`, and `emitLegacyEvent` are injected by `GameEnginePlugin`.

- [ ] Write failing integration-style tests for three simultaneous viewers, Connect4/chess/Connect4 host FIFO, out-of-order and stale host rejection, separate viewer limits, automatic loss once, concurrent limit, background result suspension, and restart restoration.
- [ ] Run the suite and verify behavior failures.
- [ ] Implement atomic state transitions: accepted viewer move persists revision/state and enqueues once; accepted host move removes first, persists, starts viewer time, and advances after animation; terminal sessions clear timers/queue before the callback updates statistics.
- [ ] Recover active rows through adapter factories, close only corrupt rows with `recovery_error`, restore deadlines and queue sequence, then emit one snapshot.
- [ ] Re-run the suite and commit `feat(game-engine): orchestrate concurrent interactive matches`.

### Task 5: Plugin, API, socket, and chat integration

**Files:**
- Modify: `app/plugins/game-engine/main.js`
- Modify: `app/plugins/game-engine/backend/unified-queue.js`
- Modify: `app/plugins/game-engine/test/connect4-unified-queue.test.js`
- Modify: `app/plugins/game-engine/test/chess-lifecycle.test.js`
- Modify: `app/plugins/game-engine/test/socket-authorization.test.js`
- Create: `app/plugins/game-engine/test/interactive-plugin-integration.test.js`

**Interfaces:**
- `GET /api/game-engine/interactive/state` returns controller state plus `serverTimestamp`.
- `game-engine:interactive-host-move` accepts `{sessionId, gameType, sessionRevision, displayRevision, move}`.
- `game-engine:interactive-state` is emitted after every accepted state/display transition.

- [ ] Write failing tests proving starts no longer enter UnifiedQueueManager, chat moves route by stable viewer identity, admin envelopes require authorization and current revisions, active-session delegates to display state, host name resolves TikTok username then active profile then `Streamer`, and destroy preserves persisted active rows.
- [ ] Run the focused suites and capture the old serial behavior failures.
- [ ] Construct/init/destroy the controller in plugin lifecycle; delegate Connect4/chess start, viewer moves, streamer moves, resign, cancellation, state requests, and active-session reads while keeping legacy generic events.
- [ ] Remove Connect4/chess lifetime processing from UnifiedQueueManager without changing transient-game behavior. Add config normalization and reuse the old Connect4 round limit only when the new value is absent.
- [ ] Re-run focused plugin suites and commit `feat(game-engine): integrate the interactive host turn controller`.

### Task 6: Canonical unified overlay

**Files:**
- Modify: `app/plugins/game-engine/overlay/unified.html`
- Modify: `app/plugins/game-engine/overlay/connect4.html`
- Modify: `app/plugins/game-engine/overlay/chess.html`
- Create: `app/plugins/game-engine/test/interactive-overlay-contract.test.js`

**Interfaces:**
- Parent relays each accepted authoritative snapshot to the active child with `postMessage({type: 'game-engine:interactive-state', snapshot}, location.origin)`.
- Children accept only matching game type/session and non-decreasing display/session revisions.

- [ ] Write a failing jsdom/static contract suite for heading, idle count, queue count, revision guards, game filtering, text-safe names, animation speed, and deferred leaderboard display.
- [ ] Run the focused suite and observe missing contract failures.
- [ ] Render persistent `Hostname vs. Playername`, status, clocks, and waiting count in the parent; replace old untracked end timeout with authoritative phases and revisions.
- [ ] Add child snapshot handlers, timer cancellation, game/session filters, and CSS animation duration from `config.animationSpeed`; prevent leaderboards while interactive queue length is non-zero.
- [ ] Re-run the overlay suite and commit `feat(game-engine): render authoritative rotating game boards`.

### Task 7: Admin queue controls and settings

**Files:**
- Modify: `app/plugins/game-engine/ui.html`
- Create: `app/plugins/game-engine/test/interactive-admin-contract.test.js`

**Interfaces:**
- Admin consumes only `GET /api/game-engine/interactive/state` and `game-engine:interactive-state` for the new surface.
- Admin emits the shared host-move envelope with the latest session/display revisions.

- [ ] Write a failing contract suite for `Interactive Games`, now-on-stream heading/board, read-only host queue, background matches, Connect4 A-G controls, chess square selection, cancel action, revision envelope, and four validated settings.
- [ ] Run the focused suite and confirm missing UI contracts.
- [ ] Add the three coordinated admin areas; render names via `textContent`; enable controls only for the current host queue head; implement Connect4 and chess move creation and cancellation.
- [ ] Add/save/load `connect4ViewerResponseSeconds`, `chessViewerResponseSeconds`, `maxConcurrentInteractiveSessions`, and `interactiveResultDisplaySeconds`, preserving the existing animation setting.
- [ ] Re-run the suite and commit `feat(game-engine): add interactive queue admin controls`.

### Task 8: Regression and browser verification

**Files:**
- Modify only files implicated by failing regressions.

- [ ] Run all focused interactive suites plus existing Connect4, chess, challenge, queue, and socket-authorization suites with the bundled runtime Node.
- [ ] Run the full `plugins/game-engine/test` Jest directory; fix each real regression with a failing test before production code.
- [ ] Run ESLint on touched JavaScript, `npm run build:css`, and `git diff --check`.
- [ ] Start an isolated server from this worktree on a non-live port and exercise three simulated viewers with a Connect4/chess/Connect4 queue in a real browser.
- [ ] Verify board rotation waits for the host, names render correctly, viewer timeout is an automatic loss, chess host time pauses in queue, reconnect restores state, old timers cannot hide a newer board, and idle state reports background matches.
- [ ] Review the complete diff against all 13 acceptance criteria, request code review, address Critical/Important findings, and commit `test(game-engine): verify interactive turn queue flows` if verification adjustments were required.
