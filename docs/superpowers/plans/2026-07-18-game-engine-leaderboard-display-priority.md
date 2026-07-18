# Game Engine Leaderboard Display Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show interactive post-game leaderboards only while no host board is waiting, and replace them immediately with newly playable Connect 4 or chess state.

**Architecture:** `InteractiveDisplayRouter` owns result-to-leaderboard transitions and emits revisioned `leaderboard` snapshots. `InteractiveController` supplies the completed session's normalized leaderboard settings. Unified and game-specific overlays render the snapshot and do not own an interactive post-game timeout.

**Tech Stack:** Node.js CommonJS, Jest, Socket.IO, static HTML/JavaScript OBS overlays.

## Global Constraints

- Preserve concurrent interactive sessions and FIFO host-turn behavior.
- A host-ready board preempts leaderboard rotation; retain the configured result duration.
- Reuse `leaderboardEnabled`, `leaderboardTypes`, and `leaderboardDisplayTime`.
- Do not stage `app/locales/validation-report.json` and do not restart the full app.

---

### Task 1: Server-authoritative leaderboard phase

**Files:**
- Modify: `app/plugins/game-engine/backend/interactive-display-router.js`
- Modify: `app/plugins/game-engine/backend/interactive-controller.js`
- Test: `app/plugins/game-engine/test/interactive-controller.test.js`

**Interfaces:**
- `display.phase` gains `leaderboard`.
- `display.leaderboard` is `{ type, index, total }` while that phase is active.
- `showResult(result, durationMs, leaderboard)` receives `{ enabled, types, displayTimeMs }` from the completed session.

- [ ] **Step 1: Write failing controller tests**

```js
test('rotates a completed game leaderboard only when no host board waits', () => {
  const match = harness.controller.startMatch({ gameType: 'connect4', viewerId: 'solo', viewerDisplayName: 'Solo' });
  harness.controller.end(match.sessionId, { winner: 1, winnerRole: 'host', reason: 'win', gameResult: { gameOver: true, winner: 1 } });
  jest.advanceTimersByTime(3000);
  expect(harness.controller.getState().display).toMatchObject({
    phase: 'leaderboard', gameType: 'connect4', leaderboard: { type: 'daily', index: 0 }
  });
});

test('shows the next host board instead of a leaderboard after a result', () => {
  // Start two host-first games, end the displayed head, then advance the result timer.
  expect(harness.controller.getState().display).toMatchObject({ phase: 'playing', displaySessionId: second.sessionId });
});
```

- [ ] **Step 2: Verify the tests are red**

Run:

```powershell
cd app
& '..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-controller.test.js --runInBand
```

Expected: FAIL because the router has no `leaderboard` phase.

- [ ] **Step 3: Implement the transition**

```js
// interactive-display-router.js
showResult(result, durationMs, leaderboard = null) {
  const entry = { result, durationMs, leaderboard };
  if (this.phase === 'result' || this.phase === 'leaderboard') {
    this.resultQueue.push(entry);
    return this.snapshot();
  }
  this._activateResult(entry);
  return this.snapshot();
}

_advanceAfterResult(entry) {
  if (this.queue.head()) return this.sync({ force: true });
  if (entry.leaderboard?.enabled && entry.leaderboard.types.length) {
    return this._activateLeaderboard(entry, 0);
  }
  return this._advanceToNextPresentation();
}
```

Add `_activateLeaderboard`, `dismissLeaderboard`, and snapshot serialization. `sync()` must cancel a visible leaderboard and select a host queue head. In `_completeSession`, pass an immutable normalized `{ enabled, types, displayTimeMs }` derived from `session.config`.

- [ ] **Step 4: Verify the tests are green**

Run the command from Step 2.

Expected: PASS, including result-to-leaderboard and result-to-host-board cases.

- [ ] **Step 5: Commit the focused server change**

```powershell
git add -- app/plugins/game-engine/backend/interactive-display-router.js app/plugins/game-engine/backend/interactive-controller.js app/plugins/game-engine/test/interactive-controller.test.js
git diff --cached --check
git commit -m "feat(game-engine): prioritize host boards over leaderboards"
```

### Task 2: Render the authoritative phase in OBS overlays

**Files:**
- Modify: `app/plugins/game-engine/overlay/unified.html`
- Modify: `app/plugins/game-engine/overlay/connect4.html`
- Modify: `app/plugins/game-engine/overlay/chess.html`
- Test: `app/plugins/game-engine/test/interactive-overlay-contract.test.js`

**Interfaces:**
- Consumes full `game-engine:interactive-state` snapshots with `display.phase === 'leaderboard'`.
- Produces an active matching iframe while its leaderboard is visible.

- [ ] **Step 1: Write failing overlay contract tests**

```js
test('keeps the matching renderer active for an authoritative leaderboard phase', () => {
  const unified = readOverlay('unified.html');
  expect(unified).toContain("'leaderboard'");
  expect(unified).toContain('switchToGame(presentationDisplay.gameType, interactiveState);');
});

test('does not schedule a legacy leaderboard after an interactive game-ended event', () => {
  const connect4 = readOverlay('connect4.html');
  expect(connect4).toContain('if (data.interactive) return;');
  expect(connect4).toContain("display.phase === 'leaderboard'");
});
```

- [ ] **Step 2: Verify the overlay contract is red**

Run:

```powershell
cd app
& '..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-overlay-contract.test.js --runInBand
```

Expected: FAIL because interactive leaderboard snapshots are not rendered.

- [ ] **Step 3: Implement phase-aware overlay rendering**

```js
const ownsDisplay = ['playing', 'animating', 'result', 'leaderboard'].includes(display.phase) &&
  ['connect4', 'chess'].includes(display.gameType);

if (presentationDisplay.phase === 'leaderboard') hideInteractiveMatchup();
else showInteractiveMatchup(presentationDisplay, state.hostQueue?.length || 0);
switchToGame(presentationDisplay.gameType, interactiveState);
```

In each child renderer, branch before board rendering when `display.phase === 'leaderboard'`: clear the old presentation, call its existing `showLeaderboard(display.gameType, display.leaderboard.type)`, and keep the screen visible. A newer display revision clears it before the next board is rendered. Retain legacy leaderboard rotation only for `data.interactive === false`.

- [ ] **Step 4: Verify the overlay contract is green**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit overlays and test**

```powershell
git add -- app/plugins/game-engine/overlay/unified.html app/plugins/game-engine/overlay/connect4.html app/plugins/game-engine/overlay/chess.html app/plugins/game-engine/test/interactive-overlay-contract.test.js
git diff --cached --check
git commit -m "feat(game-engine): render interactive leaderboard state"
```

### Task 3: Verify, publish to main, and perform the narrow reload

**Files:**
- Verify: `app/plugins/game-engine/test/interactive-controller.test.js`
- Verify: `app/plugins/game-engine/test/interactive-overlay-contract.test.js`
- Verify: `app/plugins/game-engine/test/interactive-plugin-integration.test.js`
- Verify: `app/plugins/game-engine/test/interactive-ui-contract.test.js`

- [ ] **Step 1: Run focused regressions**

```powershell
cd app
& '..\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' plugins/game-engine/test/interactive-controller.test.js plugins/game-engine/test/interactive-overlay-contract.test.js plugins/game-engine/test/interactive-plugin-integration.test.js plugins/game-engine/test/interactive-ui-contract.test.js --runInBand
```

Expected: zero failed suites.

- [ ] **Step 2: Run static checks**

```powershell
cd app
npm run lint -- --no-warn-ignored plugins/game-engine/backend/interactive-display-router.js plugins/game-engine/backend/interactive-controller.js plugins/game-engine/overlay/unified.html plugins/game-engine/overlay/connect4.html plugins/game-engine/overlay/chess.html
git diff --check
```

Expected: exit code 0.

- [ ] **Step 3: Publish focused commits directly to main**

```powershell
git fetch origin --prune
git log --oneline origin/main..HEAD
git push origin HEAD:main
git fetch origin --prune
git rev-parse HEAD
git rev-parse origin/main
```

Expected: the final two hashes match. Do not stage `app/locales/validation-report.json`.

- [ ] **Step 4: Reload only Game Engine and check its state endpoint**

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/plugins/game-engine/reload' -Method Post
Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/game-engine/interactive/state' -Method Get
```

Expected: `Plugin game-engine neu geladen` and no full app/server restart.
