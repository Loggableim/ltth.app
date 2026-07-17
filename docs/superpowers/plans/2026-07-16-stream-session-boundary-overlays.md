# Stream Session Boundary Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every audited stream-bound OBS overlay distinguish a real later LIVE session from a reconnect, clear stale state at a terminal stream end, and preserve configured goal bases across sessions.

**Architecture:** Eulerstream emits a local `streamSessionId` for every confirmed new LIVE. Goals, EmojiRain, Spotlight, and TopTier consume that generation token rather than treating `username:roomId` as globally unique. Goals and Spotlight also consume terminal, non-transient disconnects to clear offline OBS state immediately. A secondary TikTok live-page watchdog only ends a silent connection after two explicit offline probes.

**Tech Stack:** Node.js CommonJS, Jest, better-sqlite3-backed plugin state, Socket.IO, OBS browser overlays.

## Global Constraints

- Use confirmed Eulerstream lifecycle events; never clear session state on transient transport reconnects.
- Preserve `streamIdentity` fallback compatibility for non-Eulerstream event sources.
- Keep user settings and profile databases intact; only reset the explicitly reported stale Likes goal after rollout.
- Publish directly to `origin/main` and restart the local server only after fresh verification.

---

### Task 1: Make a new LIVE session uniquely identifiable

**Files:**
- Modify: `app/modules/adapters/EulerstreamAdapter.js`
- Test: `app/test/eulerstream-connection-state.test.js`

- [ ] **Step 1: Write the failing regression test**

Assert that two confirmed sessions with the same `streamIdentity`, separated by a terminal close, emit different `streamSessionId` values while a reconnect keeps the same value.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node node_modules/jest/bin/jest.js test/eulerstream-connection-state.test.js --runInBand`

Expected: the next same-room session has no new generation token.

- [ ] **Step 3: Add a monotonic adapter session generation**

Increment the generation only for `isNewStream`; include the resulting `streamSessionId` in lifecycle and connected payloads.

- [ ] **Step 4: Re-run the focused test**

Expected: the session-generation regression passes and reconnect behavior remains unchanged.

### Task 2: Reset Goals on terminal ends and deduplicate per generation

**Files:**
- Modify: `app/plugins/goals/backend/event-handlers.js`
- Test: `app/test/goals-new-stream-reset.test.js`

- [ ] **Step 1: Write failing terminal-end and same-room-generation tests**

Assert that `4005` with `wasLive: true` resets goals, `1006` with `isTransient: true` does not, and a later session using the same room but a new `streamSessionId` resets once.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `node node_modules/jest/bin/jest.js test/goals-new-stream-reset.test.js --runInBand`

Expected: terminal disconnect is unhandled and repeated room identities suppress the later session reset.

- [ ] **Step 3: Register terminal disconnect handling and generation dedupe**

Accept only terminal, confirmed-LIVE disconnects; use `streamSessionId` first and `streamIdentity` only as a compatibility fallback. Continue using the existing stored initial target when resetting incremental goals.

- [ ] **Step 4: Re-run the focused test**

Expected: terminal reset and same-room later-session tests pass without clearing transient reconnects.

### Task 3: Apply the corrected boundary to audited overlays

**Files:**
- Modify: `app/plugins/emoji-rain/main.js`
- Modify: `app/plugins/webgpu-emoji-rain/main.js`
- Modify: `app/plugins/spotlight/main.js`
- Modify: `app/plugins/toptier/main.js`
- Test: `app/plugins/emoji-rain/test/heart-balloons.test.js`
- Test: `app/plugins/webgpu-emoji-rain/test/heart-balloons.test.js`
- Test: `app/plugins/spotlight/test/*` or a focused new test if no matching suite exists
- Test: `app/plugins/toptier/test/*` or a focused new test if no matching suite exists

- [ ] **Step 1: Write failing same-room generation tests for each audited consumer**

Use two payloads with the same room identity and different `streamSessionId` values. Verify each consumer clears or starts a fresh session once per generation.

- [ ] **Step 2: Run the focused tests and verify they fail**

Expected: identity-only dedupe treats the second session as a duplicate, and Spotlight leaves offline state visible.

- [ ] **Step 3: Implement generation-aware reset behavior**

Use `streamSessionId` as the primary session token. Spotlight clears only for a terminal live disconnect; TopTier uses the token as its session key.

- [ ] **Step 4: Re-run the focused tests**

Expected: each audited consumer recognizes a later session in the same room and ignores transient disconnects.

### Task 4: Release and live verification

### Task 4: Add a conservative TikTok LIVE watchdog and per-goal session policy

**Files:**
- Modify: `app/modules/adapters/EulerstreamAdapter.js`
- Modify: `app/plugins/goals/backend/database.js`
- Modify: `app/plugins/goals/backend/event-handlers.js`
- Modify: `app/plugins/goals/ui.html`
- Modify: `app/plugins/goals/ui.js`
- Test: `app/test/eulerstream-connection-state.test.js`
- Test: `app/test/goals-new-stream-reset.test.js`

- [ ] **Step 1: Write the failing watchdog and stream-spanning-goal tests**

Assert that a stale connection needs two explicit TikTok offline results, and that an unknown/challenge response cannot reset. Assert that a goal with session reset disabled is preserved.

- [ ] **Step 2: Implement the guarded watchdog**

Record raw Eulerstream frames. After 15 minutes without one, poll the canonical TikTok LIVE route at most once a minute. Treat only a clear live room as live and only explicit offline evidence as offline; errors and challenges are unknown. Feed a confirmed result through the existing terminal `disconnected` lifecycle with code `4005`.

- [ ] **Step 3: Add the per-goal reset setting**

Add a migration-backed `reset_on_stream_end` column with default `1`, persist it from the Goal editor, and skip only goals explicitly marked stream-spanning.

- [ ] **Step 4: Re-run focused lifecycle tests**

Expected: no reset from a challenge or transient close; two confirmed offline probes clear session-bound state while marathon goals remain unchanged.

### Task 5: Release and live verification

**Files:**
- Modify: `version.json`
- Modify: `package.json`
- Modify: `app/package.json`
- Modify: `app/plugins/goals/plugin.json`
- Modify: `app/plugins/emoji-rain/plugin.json`
- Modify: `app/plugins/webgpu-emoji-rain/plugin.json`
- Modify: `app/plugins/spotlight/plugin.json`
- Modify: `app/plugins/toptier/plugin.json`

- [ ] **Step 1: Bump versions and changelog**

Publish the corrected session-boundary behavior as the next patch release and bump every touched plugin manifest.

- [ ] **Step 2: Run fresh verification**

Run focused Jest suites, ESLint, JSON parsing, `node --check`, and `git diff --check`.

- [ ] **Step 3: Commit and push directly to main**

Stage only the audited lifecycle, tests, version, specification, and plan files. Push `HEAD:main` without force.

- [ ] **Step 4: Restart local runtime and repair the reported stale goal**

Start the verified `main` code on port 3000, call `POST /api/goals/goal_1c2772a7-1727-45e6-b847-0d72fff6a4b6/reset`, and verify the overlay route returns `0 / 10000`.
