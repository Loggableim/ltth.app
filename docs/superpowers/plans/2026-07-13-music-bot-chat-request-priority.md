# Music Bot Chat Request Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recognize `!play <title>`, play viewer requests before Auto-DJ without skipping the active track, and handle stale Queue Play clicks safely.

**Architecture:** Normalize aliases at comparison time because the parser already removes the chat prefix. Retain the existing queue-first playback path: an idle request starts immediately; a request received during playback waits for the normal track end. The Queue Play route recognizes an already-playing song ID instead of handing an invalid index to the queue manager.

**Tech Stack:** Node.js CommonJS, Jest, Music Bot plugin API, MPV.

## Global Constraints

- Do not restart LTTH, the TikTok LIVE session, `launch.js`, or `server.js`.
- Do not skip an active track because a viewer request arrives.
- Do not start an unrelated song by falling back to a stale numeric index.

---

### Task 1: Normalize request aliases

**Files:**
- Modify: `app/plugins/music-bot/lib/command-parser.js:13-60`
- Create: `app/test/music-bot-command-parser.test.js`

**Interfaces:**
- Consumes: `CommandParser.parse(chatData, onCommand)` and `config.commandPrefix`.
- Produces: `{ type: 'request', query: 'I Need a Hero' }` from `!play I Need a Hero` when `!play` is saved as an alias.

- [ ] Write a failing parser test using a saved request alias `['!play']` and chat data `{ message: '!play I Need a Hero', username: 'viewer' }`.
- [ ] Run `npm test -- --runInBand test/music-bot-command-parser.test.js` and confirm it fails because `play` is compared with `!play`.
- [ ] Add `_normalizeCommandKey(value)` to remove one configured prefix, trim, and lowercase values before `_resolveCommand()` compares command names and aliases.
- [ ] Re-run the parser suite and confirm it passes.
- [ ] Commit only the parser and its test with message `fix: normalize music bot chat aliases`.

### Task 2: Preserve the active track for viewer requests

**Files:**
- Modify: `app/test/music-bot-config-route.test.js`
- Verify: `app/plugins/music-bot/main.js:1658-1681,1800-1826`

**Interfaces:**
- Consumes: `_handleRequest(query, username, chatData)`.
- Produces: an idle request invokes `_playNextFromQueue()`; a request while `isPlaying()` is true does not invoke `_skipCurrent()`.

- [ ] Write a regression test with `playbackEngine.isPlaying()` returning `true`, then assert `_skipCurrent()` and `_playNextFromQueue()` are not called after `_handleRequest()` succeeds.
- [ ] Run `npm test -- --runInBand test/music-bot-config-route.test.js` and confirm the existing queue-first behavior is preserved or make only the minimal source correction required.
- [ ] Confirm `_handleRequest()` retains `if (!this.playbackEngine.isPlaying() && this.config.playback.autoPlay) await this._playNextFromQueue();` and never calls `_skipCurrent()`.
- [ ] Re-run the route suite and commit source/tests only if changed.

### Task 3: Resolve stale Queue Play clicks

**Files:**
- Modify: `app/plugins/music-bot/main.js:1234-1257`
- Modify: `app/plugins/music-bot/assets/ui.js:1270-1279`
- Modify: `app/test/music-bot-config-route.test.js`

**Interfaces:**
- Consumes: `POST /api/plugins/music-bot/queue/:index/play` with `body.songId`.
- Produces: `{ success: true, track, alreadyPlaying: true }` when the selected ID is the current track, or HTTP 409 `{ success: false, staleQueue: true, error: 'Der ausgewählte Titel ist nicht mehr in der Queue.' }` when absent.

- [ ] Write a failing route test where queue is empty, current track ID is `requested-song`, and Play is posted with that ID; expect `alreadyPlaying: true` and no `reorderSong()` call.
- [ ] Write a failing route test where the ID exists neither in queue nor current track; expect HTTP 409 and `staleQueue: true`.
- [ ] Run `npm test -- --runInBand test/music-bot-config-route.test.js` and confirm both tests fail on the current invalid-source-index behavior.
- [ ] Change the route to obtain the current track before reordering; when a supplied nonempty ID cannot be found, return `alreadyPlaying` for the current ID or the 409 stale-queue response. Do not use the rendered index in this branch.
- [ ] Update the UI to show an informational message for `alreadyPlaying`, a warning for `staleQueue`, and reload the queue in both cases.
- [ ] Re-run `npm test -- --runInBand test/music-bot-config-route.test.js test/music-bot-runtime-ui-regression.test.js` and commit only these Music Bot files.

### Task 4: Verify without restarting LTTH

**Files:**
- Verify: `app/plugins/music-bot/lib/command-parser.js`
- Verify: `app/plugins/music-bot/main.js`
- Verify: `app/plugins/music-bot/assets/ui.js`

- [ ] Run `node --check plugins/music-bot/lib/command-parser.js` and `node --check plugins/music-bot/main.js`.
- [ ] Run `npm test -- --runInBand test/music-bot-command-parser.test.js test/music-bot-config-route.test.js test/music-bot-runtime-ui-regression.test.js`.
- [ ] Inspect available plugin-loader APIs for a Music-Bot-only reload. Do not terminate LTTH or the live connection; if no safe reload exists, report that verification is code-level only until a maintenance window.
- [ ] Verify that `GET http://127.0.0.1:3000/api/plugins/music-bot/config` and `/status` still respond.
