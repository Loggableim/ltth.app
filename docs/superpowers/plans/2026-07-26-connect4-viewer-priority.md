# Connect4 Viewer-Priority Matchmaking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow every eligible `connect4` chat entrant to create a durable 30-second search or atomically pair with the oldest eligible viewer, so viewer-vs-viewer matches always take precedence over streamer fallbacks.

**Architecture:** Replace the singleton open-challenge constraint with persisted FIFO challenge rows. The interactive controller owns atomic matching and exposes a compatibility matchmaking snapshot whose primary entry is the oldest active search; the plugin owns one timeout per challenge and turns an unmatched expired search into a streamer game. The direct Connect4 overlay and Unified OBS consume the same snapshot, show the primary search countdown plus the number of other searches, and retain the existing same-origin avatar-disc rendering.

**Tech Stack:** Node.js CommonJS, better-sqlite3 transactions, Socket.IO interactive state, Jest/jsdom, static HTML/CSS/JavaScript overlays, plugin JSON locales.

## Global Constraints

- Work only in the isolated `codex/connect4-viewer-priority` worktree; do not edit or stage unrelated root-worktree changes.
- Do not reload the Game Engine or restart the app during implementation or verification; a later live action needs a new explicit user approval.
- Every valid viewer start-command creates its own persistent 30-second search if no eligible earlier viewer search exists.
- A new viewer must atomically claim the oldest open Connect4 search whose opener is a different eligible viewer; opener is player 1/red and claimant is player 2/yellow.
- A viewer may not pair with themself, join while in an active interactive session, bypass a Connect4 lockout, or use an unsafe/missing avatar proxy source; ineligible attempts must not consume another viewer's search.
- At the 30-second deadline, an unmatched search starts exactly one normal viewer-vs-streamer Connect4 match. If no interactive slot is available, preserve the fallback work durably and retry when capacity is freed; do not silently discard it or convert another open search.
- Open searches do not reserve interactive session capacity. Active interactive sessions alone count against `maxConcurrentInteractiveSessions`.
- Keep `connect4Matchmaking` backward-compatible as the oldest open challenge and add `pendingCount` plus `pendingChallenges`; all timestamps remain server timestamps in milliseconds.
- Direct and Unified OBS must show the same primary viewer search, server-time countdown, and pending-search count. Existing red/yellow discs and avatar fallback behavior must remain unchanged: an avatar image failure removes only the image, never the colored disc.
- Preserve existing persistent sessions/history, fixed aliases, configured command alias, chat event deduplication, i18n initialization behavior, and no-store overlay responses.

---

## File Structure

- `app/plugins/game-engine/backend/database.js` owns Connect4 search persistence, ordered open/recovery queries, atomic claim/update operations, and the schema migration that removes the singleton partial index.
- `app/plugins/game-engine/backend/interactive-controller.js` validates participants, selects the oldest eligible search inside the database transaction, starts viewer-vs-viewer sessions, produces the backward-compatible state snapshot, and preserves a saturated streamer fallback for retry.
- `app/plugins/game-engine/main.js` routes chat starts through the controller, schedules every persisted search with a timeout map, restores all searches after plugin initialization, retries pending streamer fallbacks, and clears all handles only on plugin destruction.
- `app/plugins/game-engine/overlay/connect4.html` renders the primary search countdown and `pendingCount`; `app/plugins/game-engine/overlay/unified.html` continues forwarding the complete matchmaking object to the Connect4 frame.
- `app/plugins/game-engine/locales/{de,en,es,fr}.json` provides the pending-search copy under the existing Connect4 runtime locale namespace.
- `app/plugins/game-engine/test/{interactive-controller,interactive-plugin-integration,interactive-overlay-dom}.test.js` provide controller, plugin lifecycle/chat, direct overlay, Unified overlay, avatar-disc, and localized-copy regression coverage.

### Task 1: Persisted FIFO Matchmaker and Controller Contract

**Files:**
- Modify: `app/plugins/game-engine/backend/database.js`
- Modify: `app/plugins/game-engine/backend/interactive-controller.js`
- Test: `app/plugins/game-engine/test/interactive-controller.test.js`

**Interfaces:**
- Consumes: existing `startMatch({ gameType, viewerId, viewerDisplayName, participants, triggerType, triggerValue })`, `registry.getByParticipant(id)`, `_isValidAvatarSource(source)`, and `database.transaction(fn)`.
- Produces: `startOrJoinConnect4Matchmaking({ participantId, participantDisplayName, participantAvatarSource, triggerType, triggerValue })`, `listRecoverableConnect4Challenges()`, `getConnect4MatchmakingSnapshot()`, `beginExpiredConnect4Fallback(challengeId)`, and `startPendingConnect4Fallback(challengeId, hostDisplayName)`.

- [ ] **Step 1: Write failing FIFO and capacity tests**

  Add controller tests with a fixed `now` that create viewers A, B, C, and D in this order. Assert A opens challenge 1, B claims challenge 1 and starts a red-A/yellow-B session, C opens challenge 2 even while earlier matches exist, and D claims challenge 2. Add assertions that the snapshot selects the oldest currently open challenge and reports `pendingCount` and ordered `pendingChallenges`. Add negative cases for self-claim, already-active participant, unsafe avatar source, duplicate event caller, and one full-capacity fallback that remains durable rather than being lost.

  ```js
  expect(controller.startOrJoinConnect4Matchmaking({ participantId: 'a', participantDisplayName: 'A', participantAvatarSource: avatarA })).toMatchObject({ success: true, action: 'opened' });
  expect(controller.startOrJoinConnect4Matchmaking({ participantId: 'b', participantDisplayName: 'B', participantAvatarSource: avatarB })).toMatchObject({ success: true, action: 'matched' });
  expect(controller.getConnect4MatchmakingSnapshot()).toMatchObject({ pendingCount: 2, pendingChallenges: [expect.objectContaining({ openerId: 'c' })] });
  ```

- [ ] **Step 2: Run the focused controller test and confirm the singleton behavior fails**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-controller.test.js`

  Expected: the newly added multi-search test fails because the partial unique index and `challenge_already_open` guard permit only one open row.

- [ ] **Step 3: Replace the singleton schema and database API with ordered row operations**

  In the database initialization migration, explicitly execute `DROP INDEX IF EXISTS game_interactive_one_open_challenge` before creating a non-unique ordered lookup index:

  ```sql
  CREATE INDEX IF NOT EXISTS game_interactive_open_fifo
    ON game_interactive_challenges(game_type, status, expires_at_ms, challenge_id);
  ```

  Remove the `getOpenInteractiveChallenge()` rejection from `createInteractiveChallenge()`. Add `listOpenInteractiveChallenges(now)` and `listRecoverableInteractiveChallenges()` that return every row in `challenge_id ASC` order. Add an atomic `claimOldestEligibleInteractiveChallenge(participant, now)` that expires stale rows, selects the oldest `status = 'open' AND expires_at_ms > now AND opener_id <> participantId`, and updates that exact `challenge_id` with `WHERE status = 'open' AND expires_at_ms > now`. Return `null` if the conditional update loses the race. Extend the status CHECK without a destructive migration by permitting `fallback_pending`, and add atomic `markInteractiveChallengeFallbackPending(challengeId, now)` plus a query for pending fallback rows.

- [ ] **Step 4: Implement controller-level match-or-open and recovery methods**

  Make `startOrJoinConnect4Matchmaking()` validate identity, active participant state, and avatar source before entering a single database transaction. It must claim the oldest eligible row and call the existing two-viewer `startMatch()` participant shape when a row is claimed; otherwise insert a new `open` 30-second row. Return `{ success: true, action: 'matched', challenge, sessionId }` or `{ success: true, action: 'opened', challenge }`.

  Change `startMatch()` so its limit check is only `this.registry.list().length >= settings.maxConcurrentInteractiveSessions`; it must not count open searches. Replace the singleton recovery method with `listRecoverableConnect4Challenges()` and make `getConnect4MatchmakingSnapshot()` return `null` when empty, otherwise the oldest open challenge plus:

  ```js
  {
    ...oldestChallenge,
    pendingCount: openChallenges.length,
    pendingChallenges: openChallenges.map(({ challengeId, openerId, openerDisplayName, openerAvatarSource, expiresAtMs, createdAt }) => ({
      challengeId, openerId, openerDisplayName, openerAvatarSource, expiresAtMs, createdAt
    }))
  }
  ```

  On expiry, atomically move that exact row to `fallback_pending`. `startPendingConnect4Fallback()` must start its original opener against the host only when capacity exists, then mark the row terminal so it cannot be started twice; otherwise return `interactive_session_limit` and preserve the row for the plugin retry loop. Ensure state emission occurs after every successful open, match, expiry, fallback, invalidation, or recovery mutation.

- [ ] **Step 5: Run controller tests and commit the persistence/controller slice**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-controller.test.js`

  Expected: PASS, including FIFO pair selection, independent 30-second rows, participant rejection, state snapshot ordering, expiry/fallback persistence, and no slot reservation by open searches.

  ```bash
  git add app/plugins/game-engine/backend/database.js app/plugins/game-engine/backend/interactive-controller.js app/plugins/game-engine/test/interactive-controller.test.js
  git commit -m "feat(game-engine): queue Connect4 viewer matchmaking"
  ```

### Task 2: Chat Routing, Multi-Timer Lifecycle, Recovery, and Fallback Drain

**Files:**
- Modify: `app/plugins/game-engine/main.js`
- Test: `app/plugins/game-engine/test/interactive-plugin-integration.test.js`
- Test: `app/plugins/game-engine/test/gcce-integration.test.js`

**Interfaces:**
- Consumes: Task 1 `startOrJoinConnect4Matchmaking`, `listRecoverableConnect4Challenges`, `beginExpiredConnect4Fallback`, `startPendingConnect4Fallback`, and `getConnect4MatchmakingSnapshot`.
- Produces: per-challenge scheduler methods `_recoverConnect4MatchmakingChallenges()`, `_scheduleConnect4MatchmakingExpiry(challenge)`, `_clearConnect4MatchmakingExpiry(challengeId)`, `_drainPendingConnect4Fallbacks()`, and the unchanged public `handleConnect4StartCommand(args, context)` response contract.

- [ ] **Step 1: Write failing plugin lifecycle and chat tests**

  Replace the singleton-mock assumptions with two open search rows. Test that first and third distinct viewers receive `action: 'opened'`, second and fourth claim the oldest eligible rows, and clearing the timer for a claimed row does not clear another row's timer. Use fake timers to prove each challenge expiry independently starts only its own viewer-vs-streamer fallback. Add reload recovery that schedules all unexpired rows and processes expired rows. Add a saturated fallback test that retries after a session completes, without re-pairing an expired row with a later viewer. Keep GCCE and fallback alias tests asserting the six fixed aliases and configured alias reach the same handler and deduplicated events do not open or match twice.

  ```js
  expect(plugin.connect4MatchmakingTimeouts).toBeInstanceOf(Map);
  expect(plugin.connect4MatchmakingTimeouts.has(41)).toBe(true);
  expect(plugin.connect4MatchmakingTimeouts.has(42)).toBe(true);
  ```

- [ ] **Step 2: Run plugin tests to verify the single-timeout implementation fails**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-plugin-integration.test.js plugins/game-engine/test/gcce-integration.test.js`

  Expected: the new tests fail because `connect4MatchmakingTimeout` holds only one timer and chat routing reads only one recovered challenge.

- [ ] **Step 3: Replace singleton timer ownership and route every chat event through match-or-open**

  Replace `this.connect4MatchmakingTimeout` with `this.connect4MatchmakingTimeouts = new Map()`. `_scheduleConnect4MatchmakingExpiry(challenge)` must clear only `challenge.challengeId`, schedule that same id, delete that id when firing, and `unref()` the handle. `_recoverConnect4MatchmakingChallenges()` must iterate every recovered open row; initialization must call it once after `interactiveController.init()`. `destroy()` must clear every map entry and then clear the map.

  In `handleConnect4StartCommand()`, retain host, duplicate-event, lockout, and avatar-proxy checks, then call exactly:

  ```js
  const result = controller.startOrJoinConnect4Matchmaking({
    participantId: userId,
    participantDisplayName: nickname,
    participantAvatarSource: avatarSource,
    triggerType: 'matchmaking_accept',
    triggerValue: 'connect4'
  });
  ```

  For `action: 'opened'`, schedule only `result.challenge`; for `action: 'matched'`, clear only the claimed challenge timer. Preserve the user-facing response shape, but say a viewer game started when matched and a 30-second viewer search opened when opened.

- [ ] **Step 4: Implement exact-expiry fallback and capacity drain**

  At a timer deadline, call `beginExpiredConnect4Fallback(challengeId)` and then `startPendingConnect4Fallback(challengeId, this._resolveHostDisplayName())`. If it returns `interactive_session_limit`, leave the durable `fallback_pending` row untouched and schedule one bounded retry handle. Invoke `_drainPendingConnect4Fallbacks()` after interactive state changes that can free capacity, including game finish/cancel paths and plugin recovery. Never start a streamer match for a challenge that was claimed, invalidated, or whose id does not match the timer callback.

- [ ] **Step 5: Run integration tests and commit the plugin lifecycle slice**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-plugin-integration.test.js plugins/game-engine/test/gcce-integration.test.js`

  Expected: PASS, including independently scheduled searches, FIFO chat pairing, reload recovery, one fallback per expiry, retry after capacity frees, fixed/configured aliases, and event deduplication.

  ```bash
  git add app/plugins/game-engine/main.js app/plugins/game-engine/test/interactive-plugin-integration.test.js app/plugins/game-engine/test/gcce-integration.test.js
  git commit -m "fix(game-engine): schedule every Connect4 viewer search"
  ```

### Task 3: OBS Search Presentation, Locales, and Avatar-Disc Regression

**Files:**
- Modify: `app/plugins/game-engine/overlay/connect4.html`
- Modify: `app/plugins/game-engine/overlay/unified.html`
- Modify: `app/plugins/game-engine/locales/de.json`
- Modify: `app/plugins/game-engine/locales/en.json`
- Modify: `app/plugins/game-engine/locales/es.json`
- Modify: `app/plugins/game-engine/locales/fr.json`
- Test: `app/plugins/game-engine/test/interactive-overlay-dom.test.js`

**Interfaces:**
- Consumes: Task 1 state shape `connect4Matchmaking = { challengeId, openerDisplayName, expiresAtMs, pendingCount, pendingChallenges, ... }` and existing `serverTimestamp` clock offset logic.
- Produces: a direct and Unified overlay presentation where the oldest pending viewer is displayed with an updating server-time countdown and the count of other viewer searches.

- [ ] **Step 1: Write failing DOM tests for presentation and avatar persistence**

  Extend the existing matchmaking fixture to include three pending rows and assert that the direct overlay displays the first viewer, a countdown based on `expiresAtMs - serverTimestamp`, and the localized count for the other two searches. Advance the fake timer and assert the countdown changes without a socket update. Replay a newer state whose board retains the same red/yellow owners and assert both valid proxy `<img class="piece-avatar">` elements remain. Trigger `error` on one image and assert only that image disappears while its colored `.piece` remains. Extend the Unified test to assert the full `pendingCount` and `pendingChallenges` fields are forwarded to the Connect4 iframe.

  ```js
  expect(document.getElementById('challenge-pending-count').textContent).toContain('2');
  expect(postMessage.mock.calls[0][0].payload.connect4Matchmaking.pendingCount).toBe(3);
  ```

- [ ] **Step 2: Run the DOM test and confirm the pending-count assertion fails**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-overlay-dom.test.js`

  Expected: the new count assertion fails because the current markup renders only a singleton challenge prompt.

- [ ] **Step 3: Render the oldest search and additional-search count without changing disc fallback**

  Add a dedicated `#challenge-pending-count` element next to the existing challenge timer. When `connect4Matchmaking` is open, render the existing primary viewer name/prompt and update the count using `Math.max(0, Number(matchmaking.pendingCount || matchmaking.pendingChallenges?.length || 1) - 1)`. Hide the element when the result is zero or matchmaking clears. Keep `setInterval`/clock reset behavior tied to the primary challenge id and expiry so a newer state replaces stale countdown state. Do not replace `isSafeAvatarProxySource`, `.piece-avatar`, or the existing image `error` handler; preserve the outer red/yellow piece and remove only the failed image.

  Ensure Unified identifies Connect4 as active for any valid `connect4Matchmaking` object and forwards the object unchanged with `postMessage`.

- [ ] **Step 4: Add one locale key in all four locales and use it after i18n initialization**

  Under `plugins.game-engine.ui.runtime.connect4`, add `matchmaking_other_searches` with a `{count}` placeholder in `de.json`, `en.json`, `es.json`, and `fr.json`. Use the existing `t()` helper only after the overlay's i18n ready contract; before initialization, use a deterministic English fallback so the existing re-render-on-ready test remains valid.

- [ ] **Step 5: Run overlay tests and commit the presentation slice**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test/interactive-overlay-dom.test.js`

  Expected: PASS, including direct and Unified server-time countdown, pending count, state replacement, localized re-render, avatar proxy image persistence, image error fallback, and colored red/yellow discs.

  ```bash
  git add app/plugins/game-engine/overlay/connect4.html app/plugins/game-engine/overlay/unified.html app/plugins/game-engine/locales/de.json app/plugins/game-engine/locales/en.json app/plugins/game-engine/locales/es.json app/plugins/game-engine/locales/fr.json app/plugins/game-engine/test/interactive-overlay-dom.test.js
  git commit -m "feat(game-engine): show queued Connect4 viewer searches"
  ```

### Task 4: Focused End-to-End Verification and Handoff Evidence

**Files:**
- Modify only if required by a failing focused check: files already listed in Tasks 1-3.
- Verify: `app/plugins/game-engine/test/`

**Interfaces:**
- Consumes: all completed task interfaces and the real Game Engine test environment.
- Produces: a clean, committed branch and evidence suitable for a later explicit Game-Engine-only reload decision; it does not perform a reload, restart, merge to main, or push.

- [ ] **Step 1: Run all Game Engine tests**

  Run: `cd app && npm test -- --runInBand plugins/game-engine/test`

  Expected: PASS. If an unrelated baseline failure occurs, record its exact suite and error separately; do not weaken a matcher or skip a test to make the suite green.

- [ ] **Step 2: Run static quality checks**

  Run: `cd app && npm run lint && npm run build:css`

  Expected: lint exits 0 and the CSS build exits 0. Preserve any pre-existing non-failing Browserslist notice verbatim as a notice, not as a pass/fail substitute.

- [ ] **Step 3: Audit the isolated diff and commits**

  Run:

  ```bash
  git diff --check $(git merge-base main HEAD)..HEAD
  git status --short
  git log --oneline $(git merge-base main HEAD)..HEAD
  ```

  Expected: no whitespace errors; only planned Game Engine and plan/spec files are on the branch; each task commit is present.

- [ ] **Step 4: Record no-live-action handoff**

  Report the exact branch head, focused test totals, lint/CSS results, and the fact that no reload, app restart, merge, or push occurred. A future live rollout must re-check the actual runtime worktree before a Game-Engine-only reload.
