# Music Bot History Playback Recovery Implementation Plan

> **For Codex:** Use the executing-plans workflow and follow test-driven development for every production change.

**Goal:** Stop AutoDJ history tracks from being sent to MPV as unplayable YouTube page URLs, prevent rapid replacement loops, and remove duplicate UI errors without restarting the application.

**Architecture:** Keep AutoDJ selection separate from media resolution. `MusicBotPlugin` prepares a selected AutoDJ track immediately before playback: direct `localPath`/`streamUrl` tracks pass through, while page-only tracks are refreshed through `MusicResolver`. The existing bounded five-attempt AutoDJ loop handles bad candidates. A rolling failure window limits asynchronous MPV replacement attempts.

**Tech Stack:** CommonJS Node.js, Jest, SQLite-backed AutoDJ, existing MusicResolver and PlaybackEngine.

---

## Task 1: Add regression coverage

**Files:**
- Modify: `app/test/music-bot-runtime-ui-regression.test.js`
- Modify: `app/test/music-bot-core-features.test.js`

1. Add a failing test proving a page-only AutoDJ history result is resolved before `playbackEngine.play()`, with AutoDJ metadata preserved.
2. Add a failing test proving a track with an existing `streamUrl` bypasses resolution.
3. Add a failing test proving a resolver failure records/excludes that candidate and the bounded loop can play the next candidate.
4. Add a failing test proving the third distinct asynchronous AutoDJ failure inside 60 seconds deactivates AutoDJ and does not select another immediate replacement.
5. Add a failing test proving `_emitError()` emits only `musicbot:error`.
6. Add a failing test proving the history-candidate SQL filters `COALESCE(skipped, 0) = 0`.
7. Run the two focused Jest files and confirm the new assertions fail for the expected missing behavior.

## Task 2: Implement playback preparation and loop protection

**Files:**
- Modify: `app/plugins/music-bot/main.js`
- Modify: `app/plugins/music-bot/lib/auto-dj.js`

1. Add constants for three asynchronous failures in a 60-second rolling window and initialize the timestamp list in the plugin constructor.
2. Add a helper that returns direct AutoDJ tracks unchanged and resolves page-only tracks through `musicResolver.resolve(track.url)`.
3. Merge the resolver song with selection metadata, force `requestedBy: 'AutoDJ'`, and re-decorate canonical identity.
4. Move preparation into the existing five-attempt `_maybePlayAutoDJ()` loop. On preparation failure, persist a `resolve-failed` exclusion, log it, and continue without sending the page URL to MPV.
5. On the third rapid asynchronous playback failure, deactivate AutoDJ, emit one explicit pause toast, and skip `_maybePlayAutoDJ(true)`; earlier failures retain controlled replacement behavior.
6. Remove the redundant status-toast call from `_emitError()` while preserving the compatibility error event.
7. Add the skipped-row predicate to the grouped history query.
8. Run the focused tests until green.

## Task 3: Verify and roll out safely

**Files:**
- Verify only: `app/plugins/music-bot/**`, `app/test/music-bot-*.test.js`
- Deploy only: `app/plugins/music-bot/**` in the live checkout

1. Run all Soundbot Jest suites in band.
2. Run ESLint for the changed production and test files, then the repository lint command.
3. Review the scoped diff and commit only the Soundbot fix, tests, and this plan.
4. Confirm the live server PID, command, working directory, current Soundbot status, and marked MPV processes before deployment.
5. Copy only the committed `app/plugins/music-bot/**` tree to the live checkout, preserving unrelated dirty changes.
6. Call only `POST /api/plugins/music-bot/reload`; do not restart the application.
7. Confirm the app PID is unchanged, the old marked MPV is gone, no more than one replacement MPV is active outside a crossfade, health is coherent, and no fresh `unrecognized file format` errors appear.
