# Interactive Round-Robin Turns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Rotate every active Chess and Connect 4 turn fairly, including host turns, while accepting input only from the displayed actor and showing that actor prominently in the unified overlay.

**Architecture:** Reuse game_interactive_queue as one persisted queue entry per active session, regardless of whether its current actor is host or viewer. InteractiveController rotates the queue head to the tail after every committed non-terminal move; InteractiveDisplayRouter displays only that head and runs only its timer. The unified overlay consumes explicit active-player metadata and renders a clear turn banner.

**Tech Stack:** CommonJS Node.js backend, SQLite through GameEngineDatabase, Socket.IO, static HTML/CSS/JavaScript overlays, Jest, ESLint, repository Node at runtime/node/node.exe.

## Global Constraints

- Work only in app/plugins/game-engine/ plus the two design/plan documents.
- Preserve CommonJS style and 2-space JavaScript indentation.
- A session appears at most once in the persisted interactive queue.
- The queue head is the only displayed and input-authorised session.
- Keep host and viewer checks server-authoritative; UI disabled state is only visual help.
- Use the repository Node runtime for every Jest command involving better-sqlite3.
- Preserve result, leaderboard, cancellation, timeout, revision, and replay semantics.

---

### Task 1: Make the persisted queue represent every active turn

**Files:**
- Modify: app/plugins/game-engine/backend/interactive-turn-queue.js
- Modify: app/plugins/game-engine/backend/interactive-controller.js
- Modify: app/plugins/game-engine/backend/interactive-display-router.js
- Test: app/plugins/game-engine/test/interactive-controller.test.js
- Test: app/plugins/game-engine/test/interactive-timers-router.test.js

**Interfaces:**
- Consumes: InteractiveTurnQueue.enqueue(session), remove(sessionId), rotateHeadToTail(sessionId), restore(rows), and the existing GameEngineDatabase queue methods.
- Produces: one queue entry for every active interactive session and an InteractiveDisplayRouter that selects only the queue head.

- [ ] **Step 1: Write failing controller tests for all-turn round robin**

Add a Jest scenario that starts two Chess and three Connect 4 matches, submits a legal move for each displayed actor, advances the animation, and proves that every one of the five session ids is displayed once before any second display. Assert the moved session is placed at the tail:

~~~js
expect(state.hostQueue.map(row => row.sessionId)).toEqual([
  second.sessionId,
  third.sessionId,
  fourth.sessionId,
  fifth.sessionId,
  first.sessionId
]);
expect(state.display.displaySessionId).toBe(second.sessionId);
~~~

Add a router test with two viewer-turn sessions already in the queue. It must show the queue head even when a different viewer session has an older lastActivityAt value.

- [ ] **Step 2: Run the tests to verify RED**

Run:

~~~powershell
& '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-controller.test.js plugins/game-engine/test/interactive-timers-router.test.js --runInBand --silent
~~~

Expected: the all-turn scenario fails because enqueue rejects viewer turns, startMatch queues only host starts, and InteractiveDisplayRouter.sync falls back to a least-recent viewer session.

- [ ] **Step 3: Generalise queue admission and recovery**

In interactive-turn-queue.js, permit both active role values while preserving duplicate protection:

~~~js
if (!session || session.status !== 'active' || !['host', 'viewer'].includes(session.turnRole)) {
  throw new Error('Only an active interactive turn can enter the interactive queue');
}
~~~

In InteractiveController.startMatch(), enqueue every newly persisted active session. In init(), retain restored rows for all active sessions, restore them, then append every active registry session absent from the queue in ascending sessionId order. In InteractiveDisplayRouter.sync(), use this.queue.head() as the sole playing candidate and remove the viewer fallback.

- [ ] **Step 4: Run the focused queue and router tests to verify GREEN**

Run the command from Step 2.

Expected: PASS; initial order is deterministic, every active session is queued once, and only the queue head becomes displayed.

- [ ] **Step 5: Commit the queue foundation**

~~~powershell
git add app/plugins/game-engine/backend/interactive-turn-queue.js app/plugins/game-engine/backend/interactive-controller.js app/plugins/game-engine/backend/interactive-display-router.js app/plugins/game-engine/test/interactive-controller.test.js app/plugins/game-engine/test/interactive-timers-router.test.js
git commit -m "feat(game-engine): queue every interactive turn fairly"
~~~

### Task 2: Rotate committed turns and reject hidden-player input

**Files:**
- Modify: app/plugins/game-engine/backend/interactive-controller.js
- Test: app/plugins/game-engine/test/interactive-controller.test.js
- Test: app/plugins/game-engine/test/interactive-plugin-integration.test.js

**Interfaces:**
- Consumes: the all-turn queue from Task 1 and InteractiveDisplayRouter.beginAnimation(sessionId, durationMs).
- Produces: applyViewerMove() and applyHostMove() that mutate only the displayed queue head and rotate a non-terminal session after a valid move.

- [ ] **Step 1: Write failing input-authorisation and host-rotation tests**

Leave one viewer-turn session hidden behind another queue head, attempt its chat move, and prove nothing changes:

~~~js
expect(controller.applyViewerMove({
  viewerId: hidden.viewerId,
  gameType: hidden.gameType,
  move: { column: 'A' }
})).toEqual({ success: false, error: 'not_queue_head' });
expect(controller.getState().hostQueue.map(row => row.sessionId)).toEqual(beforeQueue);
~~~

Add a matching hidden or stale host-envelope assertion. Add a successful host move test with two queued sessions; after the animation it must show the other session and put the moved host session at the tail.

- [ ] **Step 2: Run the tests to verify RED**

Run:

~~~powershell
& '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-controller.test.js plugins/game-engine/test/interactive-plugin-integration.test.js --runInBand --silent
~~~

Expected: the hidden viewer input is accepted through getByViewer(), and a non-terminal host move removes rather than rotates its session.

- [ ] **Step 3: Commit atomic queue handoff on every legal move**

Add a controller helper that requires the current session to be the queue head and only rotates when another entry exists:

~~~js
_rotateAfterTurn(session) {
  const head = this.queue.head();
  if (!head || head.sessionId !== session.sessionId) {
    throw new Error('interactive_queue_head_changed');
  }
  if (this.queue.list().length < 2) return { moved: false, single: true };
  const rotated = this.queue.rotateHeadToTail(session.sessionId);
  if (!rotated?.moved) throw new Error(rotated?.error || 'queue_rotation_failed');
  return rotated;
}
~~~

In applyViewerMove(), require the current queue head and displayed session before adapter execution. For every non-terminal legal move, update state and call _rotateAfterTurn(session) inside the existing persistence transaction. Route the move through router.beginAnimation() using the existing bounded animation speed.

In applyHostMove(), retain the revision and host checks, replace queue.remove(session.sessionId) with _rotateAfterTurn(session), and retain the existing animation route. Do not rotate terminal sessions; completion continues through _persistSessionCompletion().

- [ ] **Step 4: Verify GREEN and timer isolation**

Run the command from Step 2, followed by:

~~~powershell
& '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-timers-router.test.js --runInBand --silent
~~~

Expected: PASS; hidden input is rejected, legal viewer and host moves rotate fairly, and only the displayed viewer or Chess-host timer runs.

- [ ] **Step 5: Commit the authoritative handoff**

~~~powershell
git add app/plugins/game-engine/backend/interactive-controller.js app/plugins/game-engine/test/interactive-controller.test.js app/plugins/game-engine/test/interactive-plugin-integration.test.js app/plugins/game-engine/test/interactive-timers-router.test.js
git commit -m "feat(game-engine): rotate active turns after each move"
~~~

### Task 3: Render the current player prominently in the unified overlay

**Files:**
- Modify: app/plugins/game-engine/backend/interactive-display-router.js
- Modify: app/plugins/game-engine/overlay/unified.html
- Modify: app/plugins/game-engine/locales/de.json
- Modify: app/plugins/game-engine/locales/en.json
- Modify: app/plugins/game-engine/locales/es.json
- Modify: app/plugins/game-engine/locales/fr.json
- Test: app/plugins/game-engine/test/interactive-overlay-dom.test.js
- Test: app/plugins/game-engine/test/interactive-overlay-contract.test.js
- Test: app/test/game-engine-visible-controls-i18n.test.js

**Interfaces:**
- Consumes: InteractiveDisplayRouter.snapshot() and the game-engine:interactive-state Socket.IO payload.
- Produces: activePlayerDisplayName, currentTurnRole, and activeSessionCount in the display snapshot plus an accessible active-player banner in unified.html.

- [ ] **Step 1: Write failing snapshot and DOM tests**

Add a snapshot contract assertion:

~~~js
expect(display).toMatchObject({
  currentTurnRole: 'viewer',
  activePlayerDisplayName: 'Anna',
  activeSessionCount: 5
});
~~~

Add a JSDOM test that sends host Streamer, viewer Anna, and currentTurnRole viewer. Assert both names render, the translated turn banner names Anna, and only the viewer element has the active CSS class. Repeat with currentTurnRole host.

- [ ] **Step 2: Run overlay tests to verify RED**

Run:

~~~powershell
& '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-overlay-dom.test.js plugins/game-engine/test/interactive-overlay-contract.test.js test/game-engine-visible-controls-i18n.test.js --runInBand --silent
~~~

Expected: the display payload lacks activePlayerDisplayName, and the unified overlay only renders a combined matchup string without an active-player banner or player-specific classes.

- [ ] **Step 3: Add display metadata, accessible markup, and translations**

In InteractiveDisplayRouter.snapshot(), derive the active player from the selected session:

~~~js
const activePlayerDisplayName = session?.turnRole === 'host'
  ? session.hostDisplayName
  : session?.viewerDisplayName;
const activeSessionCount = this.registry.list().filter(row => row.status === 'active').length;
~~~

Return those values in the snapshot. In unified.html, replace the single matchup span with separate host, viewer, and current-turn elements. showInteractiveMatchup() toggles an is-active-player class based on display.currentTurnRole and fills the banner through plugins.game-engine.runtime.unified.active_turn with the player parameter.

Add active_turn to each game-engine locale. German is exactly:

~~~json
"active_turn": "AM ZUG: {player}"
~~~

Use natural English, Spanish, and French equivalents. Keep the existing status, timer, and fallback text intact.

- [ ] **Step 4: Verify GREEN across DOM and locale contracts**

Run the command from Step 2.

Expected: PASS; both names remain visible, exactly one player is highlighted, the translated banner identifies the active actor, and all locale checks stay valid.

- [ ] **Step 5: Commit the overlay presentation**

~~~powershell
git add app/plugins/game-engine/backend/interactive-display-router.js app/plugins/game-engine/overlay/unified.html app/plugins/game-engine/locales/de.json app/plugins/game-engine/locales/en.json app/plugins/game-engine/locales/es.json app/plugins/game-engine/locales/fr.json app/plugins/game-engine/test/interactive-overlay-dom.test.js app/plugins/game-engine/test/interactive-overlay-contract.test.js app/test/game-engine-visible-controls-i18n.test.js
git commit -m "feat(game-engine): show the active round-robin player"
~~~

### Task 4: Run full regression verification and inspect the deliverable

**Files:**
- Verify: app/plugins/game-engine/
- Verify: app/test/game-engine-visible-controls-i18n.test.js
- Verify: app/test/scoped-locale-character-loss.test.js

**Interfaces:**
- Consumes: completed queue, controller, router, overlay, and locale changes.
- Produces: evidence that the Game Engine and its translated active-player UI are ready for review.

- [ ] **Step 1: Run the full Game Engine suite**

~~~powershell
& '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test --runInBand --silent
~~~

Expected: all suites pass.

- [ ] **Step 2: Run lint and localisation regression checks**

~~~powershell
& '..\..\..\runtime\node\node.exe' '.\node_modules\eslint\bin\eslint.js' plugins/game-engine
& '..\..\..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' test/game-engine-visible-controls-i18n.test.js test/scoped-locale-character-loss.test.js --runInBand --silent
@('plugins/game-engine/locales/de.json', 'plugins/game-engine/locales/en.json', 'plugins/game-engine/locales/es.json', 'plugins/game-engine/locales/fr.json') | ForEach-Object { Get-Content -Raw $_ | ConvertFrom-Json | Out-Null }
~~~

Expected: ESLint exit code 0, both i18n suites pass, and every locale parses as JSON.

- [ ] **Step 3: Inspect the final change set**

~~~powershell
git diff origin/main...HEAD --check
git status --short --branch
git log --oneline origin/main..HEAD
~~~

Expected: no whitespace errors, only the intended Game Engine files plus this plan/spec, and focused commits for queueing, handoff, and overlay presentation.
