# Music Bot Radio-Mix Auto-DJ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a persistent 80/20 history-and-radio Auto-DJ mix with a 12-hour title/artist repeat block, and prevent failed Auto-DJ streams from restarting at position zero.

**Architecture:** AutoDJ gains the mix mode, deterministic candidate filters, seed rotation, and persistent failed-stream exclusions. QueueManager owns the exclusion-table schema, while MusicBotPlugin confirms an Auto-DJ IPC failure before advancing exactly once to another Auto-DJ track. The existing history, playlist, random, and viewer-request flows remain compatible.

**Tech Stack:** Node.js CommonJS, better-sqlite3 through the existing plugin database helper, Jest, jsdom, MPV JSON IPC.

## Global Constraints

- Keep the maintained runtime under app/; use existing CommonJS style and 2-space JavaScript indentation.
- Do not remove user data, queue state, history, logs, or runtime databases.
- Default mixHistoryPercent is 80 and is clamped to an integer from 0 through 100.
- Default repeatCooldownHours is 12 and is clamped to an integer from 1 through 168.
- mix alone changes selection behavior; history, playlist, and random retain their current semantics.
- The cooldown filters completed viewer and Auto-DJ history plus persistent failed Auto-DJ exclusions.
- A failed Auto-DJ stream must never call play(currentTrack) or restart that track at position zero.
- Watchdog, crash, and end-file paths may replace the same Auto-DJ track at most once.

---

## File Structure

| File | Responsibility |
| --- | --- |
| app/plugins/music-bot/lib/queue-manager.js | Create the persistent failed-stream exclusion table without altering queue/history records. |
| app/plugins/music-bot/lib/auto-dj.js | Normalize tracks, query blocks, record exclusions, select the mix, rotate seeds, and publish selection status. |
| app/plugins/music-bot/lib/playback-engine.js | Allow a longer confirmation timeout for a position query while retaining the current default. |
| app/plugins/music-bot/main.js | Confirm Auto-DJ watchdog failures and coordinate exactly-once replacement. |
| app/plugins/music-bot/ui.html | Render Radio-Mix and its two numeric settings. |
| app/plugins/music-bot/assets/ui.js | Send and restore the Radio-Mix settings. |
| app/test/music-bot-core-features.test.js | Test filters, persistence-facing behavior, and deterministic mix selection. |
| app/test/music-bot-runtime-ui-regression.test.js | Test recovery races and the browser settings round trip. |

## Task 1: Persist failed Auto-DJ stream exclusions

**Files:**

- Modify: app/plugins/music-bot/lib/queue-manager.js:482-520
- Modify: app/plugins/music-bot/lib/auto-dj.js:1-139
- Test: app/test/music-bot-core-features.test.js

**Interfaces:**

- Produces AutoDJ.recordFailedTrack(track, reason, now), AutoDJ.getSelectionBlocks(now), and AutoDJ.isTrackBlocked(track, blocks).
- Creates plugin_music_bot_autodj_exclusions(id, youtubeId, titleKey, artistKey, expiresAt, reason, createdAt), indexed by expiresAt.
- Consumes the existing db.prepare(...).run()/all() API and plugin_music_bot_history rows.

- [ ] **Step 1: Write the failing persistence tests**

Add a createAutoDjDb fixture which returns supplied rows for SQL containing plugin_music_bot_history or plugin_music_bot_autodj_exclusions and appends each run parameter object to runCalls. Add these assertions:

    test('blocks matching video IDs, titles, and artists for the configured cooldown', () => {
      const now = Date.UTC(2026, 6, 14, 12, 0, 0);
      const db = createAutoDjDb({
        recentHistory: [{ youtubeId: 'seen-id', title: 'Same Song!', artist: 'Artist One' }],
        exclusions: [{ youtubeId: 'bad-id', titleKey: 'broken stream', artistKey: 'artist two' }]
      });
      const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', repeatCooldownHours: 12 }, {}, db, { log: jest.fn() });
      const blocks = autoDJ.getSelectionBlocks(now);

      expect(autoDJ.isTrackBlocked({ youtubeId: 'seen-id', title: 'Other', artist: 'Other' }, blocks)).toBe(true);
      expect(autoDJ.isTrackBlocked({ youtubeId: 'new-id', title: 'same song', artist: 'Artist One' }, blocks)).toBe(true);
      expect(autoDJ.isTrackBlocked({ youtubeId: 'bad-id', title: 'Fresh', artist: 'Fresh' }, blocks)).toBe(true);
      expect(autoDJ.isTrackBlocked({ youtubeId: 'new-id', title: 'Fresh', artist: 'Fresh' }, blocks)).toBe(false);
    });

    test('persists a failed Auto-DJ track until the cooldown expires', () => {
      const now = Date.UTC(2026, 6, 14, 12, 0, 0);
      const db = createAutoDjDb();
      const autoDJ = new AutoDJ({ enabled: true, mode: 'mix', repeatCooldownHours: 12 }, {}, db, { log: jest.fn() });

      autoDJ.recordFailedTrack({ youtubeId: 'stream-failure', title: 'Broken Stream', artist: 'DJ Test' }, 'end-file', now);

      expect(db.runCalls[0]).toEqual(expect.objectContaining({
        youtubeId: 'stream-failure', titleKey: 'broken stream', artistKey: 'dj test',
        expiresAt: now + (12 * 60 * 60 * 1000), reason: 'end-file'
      }));
    });

- [ ] **Step 2: Verify the tests fail**

Run from app/:

    npm test -- --runInBand test/music-bot-core-features.test.js

Expected: FAIL because the fixture and the three AutoDJ methods do not exist.

- [ ] **Step 3: Implement the table and block primitives**

In QueueManager._ensureTables(), add this independent, non-destructive schema after the history table:

    this.db.prepare(
      'CREATE TABLE IF NOT EXISTS plugin_music_bot_autodj_exclusions (' +
      'id TEXT PRIMARY KEY, youtubeId TEXT, titleKey TEXT, artistKey TEXT, ' +
      'expiresAt INTEGER NOT NULL, reason TEXT NOT NULL, createdAt INTEGER NOT NULL)'
    ).run();
    this.db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_music_bot_autodj_exclusions_expiry ' +
      'ON plugin_music_bot_autodj_exclusions(expiresAt)'
    ).run();

In AutoDJ, normalize text by lowercasing, trimming, collapsing whitespace, and replacing punctuation with a space using /[^\p{L}\p{N}]+/gu. getSelectionBlocks(now) must query non-skipped history after the cooldown cutoff and active exclusions after now. It returns Sets named youtubeIds, titleKeys, and artistKeys. isTrackBlocked rejects a match on any non-empty key. recordFailedTrack inserts a random UUID, normalized keys, the current cooldown expiry, the reason, and createdAt; it must never write a history row.

- [ ] **Step 4: Verify the focused suite passes**

Run:

    npm test -- --runInBand test/music-bot-core-features.test.js

Expected: PASS, including both new block/exclusion tests.

- [ ] **Step 5: Commit the persistence primitive**

    git add app/plugins/music-bot/lib/queue-manager.js app/plugins/music-bot/lib/auto-dj.js app/test/music-bot-core-features.test.js
    git commit -m "feat(music-bot): persist Auto-DJ stream exclusions"

## Task 2: Implement weighted Radio-Mix selection

**Files:**

- Modify: app/plugins/music-bot/lib/auto-dj.js:17-294
- Test: app/test/music-bot-core-features.test.js

**Interfaces:**

- Consumes getSelectionBlocks(now), isTrackBlocked(track, blocks), and musicResolver.resolvePlaylistEntry(url, index).
- Produces AutoDJ._pickFromMix(), AutoDJ._pickRelatedToSeed(seed, blocks), and status fields selectionSource, blockedCount, mixHistoryPercent, repeatCooldownHours.
- Preserves current playlist and random paths.

- [ ] **Step 1: Write failing deterministic mix tests**

Mock Math.random and restore it in finally. Add a test where a 0.2 roll with mixHistoryPercent: 80 returns the only eligible history candidate and sets selectionSource to history. Add a second test where a 0 roll with mixHistoryPercent: 0 calls resolvePlaylistEntry with https://www.youtube.com/watch?v=seed-1&list=RDseed-1 at entry 2; have it return no result and assert fallback returns the history seed with selectionSource history-fallback. Add a third test where entry 2 repeats a blocked artist and entry 3 is fresh; assert only entry 3 is accepted.

- [ ] **Step 2: Verify the new tests fail**

Run:

    npm test -- --runInBand test/music-bot-core-features.test.js

Expected: FAIL because mode mix, selectionSource, and the filtered seed route do not exist.

- [ ] **Step 3: Implement mix mode and fallbacks**

Add these defaults to AutoDJ.updateConfig and clamp them there:

    mixHistoryPercent: 80,
    repeatCooldownHours: 12,

Add case 'mix': return this._pickFromMix(); in _selectTrack. _pickFromMix must load candidates and blocks once, use history when Math.random() * 100 is less than mixHistoryPercent, and try the other source if its preferred source has no eligible result. Reuse a _pickFromHistoryCandidates(candidates, blocks) helper so historyMinPlays remains enforced.

Implement _pickRelatedToSeed(seed, blocks) from the existing RD URL logic. Maintain mixSeedIndex over eligible history candidates so a new radio lookup is not permanently seeded from the prior playing title. Reject every returned radio item through isTrackBlocked; update relatedTrackIndices only after a result is accepted. Set selectionSource to radio, history, or history-fallback exactly when the result is chosen, and expose it with the two new config values and blockedCount in getStatus().

- [ ] **Step 4: Verify focused core behavior**

Run:

    npm test -- --runInBand test/music-bot-core-features.test.js

Expected: PASS. Existing playlist and random-mode tests are still green.

- [ ] **Step 5: Commit mix selection**

    git add app/plugins/music-bot/lib/auto-dj.js app/test/music-bot-core-features.test.js
    git commit -m "feat(music-bot): add history radio mix Auto-DJ"

## Task 3: Replace Auto-DJ zero-position restart with confirmed one-time advancement

**Files:**

- Modify: app/plugins/music-bot/lib/playback-engine.js:296-325
- Modify: app/plugins/music-bot/main.js:875-955, 2350-2411
- Test: app/test/music-bot-runtime-ui-regression.test.js

**Interfaces:**

- Consumes AutoDJ.recordFailedTrack(track, reason), AutoDJ.markPlaybackFailed(error), PlaybackEngine.getPosition({ timeoutMs }), and _maybePlayAutoDJ(force).
- Produces MusicBotPlugin._handleAutoDJPlaybackFailure(track, reason, error) and _autoDjRecoveryTrackIds.
- Preserves _recoverStalledPlayback restart-and-resume behavior for non-AutoDJ tracks.

- [ ] **Step 1: Write failing recovery regressions**

Keep the existing requested-track recovery test. Add one Auto-DJ test whose playback engine resolves getPosition({ timeoutMs: 2000 }) to 42 and assert restart and play are never called. Add one test calling _handleAutoDJPlaybackFailure twice concurrently for the same track and assert recordFailedTrack and _maybePlayAutoDJ(true) each run exactly once, while restart and play(failedTrack) never run. Update the existing Auto-DJ track-end error test to expect one call to the new helper and no addToHistory call.

- [ ] **Step 2: Verify the runtime tests fail**

Run:

    npm test -- --runInBand test/music-bot-runtime-ui-regression.test.js

Expected: FAIL because getPosition accepts no options and _handleAutoDJPlaybackFailure does not exist.

- [ ] **Step 3: Implement confirmed recovery**

Change PlaybackEngine.getPosition to accept an optional argument without changing callers:

    async getPosition({ timeoutMs = 500 } = {}) {
      // use timeoutMs where the existing implementation uses 500
    }

Initialize this._autoDjRecoveryTrackIds = new Set() in MusicBotPlugin. In _recoverStalledPlayback, branch before the existing restart logic for track.requestedBy === 'AutoDJ'. Call getPosition({ timeoutMs: 2000 }). If it resolves, reset _playbackSyncFailures, log autodj-recovery-confirmed-playing, restart the sync timer, and do not load a file. If it rejects, call _handleAutoDJPlaybackFailure(track, 'ipc-confirmed', error).

Implement exactly-once advancement:

    async _handleAutoDJPlaybackFailure(track, reason, error) {
      const trackId = track && track.id;
      if (!trackId || this._autoDjRecoveryTrackIds.has(trackId)) return null;
      this._autoDjRecoveryTrackIds.add(trackId);
      try {
        this._stopPlaybackSync();
        this.autoDJ && this.autoDJ.recordFailedTrack && this.autoDJ.recordFailedTrack(track, reason);
        this.autoDJ && this.autoDJ.markPlaybackFailed && this.autoDJ.markPlaybackFailed(error);
        this.playbackEngine.clearNowPlaying && this.playbackEngine.clearNowPlaying();
        this.api.log('[music-bot] AutoDJ track failed (' + reason + '); selecting replacement for ' + trackId, 'warn');
        return await this._maybePlayAutoDJ(true);
      } finally {
        this._autoDjRecoveryTrackIds.delete(trackId);
      }
    }

Route Auto-DJ track-end errors and Auto-DJ crash handling through this helper. Do not call _playNextFromQueue for an Auto-DJ failure. Preserve the present restart-and-resume code for non-AutoDJ tracks.

- [ ] **Step 4: Verify runtime regressions**

Run:

    npm test -- --runInBand test/music-bot-runtime-ui-regression.test.js

Expected: PASS. New tests prove no zero-position replay and one replacement; the existing viewer-request test still proves restart-and-resume.

- [ ] **Step 5: Commit the playback fix**

    git add app/plugins/music-bot/lib/playback-engine.js app/plugins/music-bot/main.js app/test/music-bot-runtime-ui-regression.test.js
    git commit -m "fix(music-bot): advance failed Auto-DJ streams"

## Task 4: Expose Radio-Mix settings in the Music Bot UI

**Files:**

- Modify: app/plugins/music-bot/ui.html:451-474
- Modify: app/plugins/music-bot/assets/ui.js:100-109, 787-807, 1070-1079, 1474-1488
- Test: app/test/music-bot-runtime-ui-regression.test.js

**Interfaces:**

- Consumes config fields mode, mixHistoryPercent, and repeatCooldownHours from /config and /auto-dj/status.
- Produces POST /api/plugins/music-bot/auto-dj/toggle payloads containing both clamped fields.

- [ ] **Step 1: Write failing UI round-trip tests**

Set mode to mix, auto-dj-mix-history-percent to 80, and auto-dj-repeat-cooldown-hours to 12 in bootMusicBotUi. Click auto-dj-save and assert its toggle payload contains mode: 'mix', mixHistoryPercent: 80, repeatCooldownHours: 12. Add a restoration test that passes those fields in autoDjConfig and asserts the two inputs show 80 and 12.

- [ ] **Step 2: Verify the UI test fails**

Run:

    npm test -- --runInBand test/music-bot-runtime-ui-regression.test.js

Expected: FAIL because the two DOM IDs do not exist.

- [ ] **Step 3: Add controls and round-trip code**

Add the mix option and two fields after auto-dj-history-plays:

    <option value="mix">Radio-Mix</option>
    <input type="number" id="auto-dj-mix-history-percent" min="0" max="100" value="80">
    <input type="number" id="auto-dj-repeat-cooldown-hours" min="1" max="168" value="12">

In ui.js create the two DOM references. Include these values in the save payload and assign both values when configuration is loaded and when Auto-DJ status refreshes:

    mixHistoryPercent: Math.min(100, Math.max(0, Number(autoDjMixHistoryPercent.value) || 80)),
    repeatCooldownHours: Math.min(168, Math.max(1, Number(autoDjRepeatCooldownHours.value) || 12)),

- [ ] **Step 4: Verify UI regressions**

Run:

    npm test -- --runInBand test/music-bot-runtime-ui-regression.test.js

Expected: PASS, including the existing playlist URL and related-title mode tests.

- [ ] **Step 5: Commit UI settings**

    git add app/plugins/music-bot/ui.html app/plugins/music-bot/assets/ui.js app/test/music-bot-runtime-ui-regression.test.js
    git commit -m "feat(music-bot): configure Auto-DJ radio mix"

## Task 5: Verify the complete Music Bot change set

**Files:**

- Test: app/test/music-bot-core-features.test.js
- Test: app/test/music-bot-runtime-ui-regression.test.js

**Interfaces:**

- Consumes all completed tasks.
- Produces verified Radio-Mix behavior and a focused change set.

- [ ] **Step 1: Run both focused suites**

Run from app/:

    npm test -- --runInBand test/music-bot-core-features.test.js test/music-bot-runtime-ui-regression.test.js

Expected: PASS with selection, exclusion, recovery, and UI regressions green.

- [ ] **Step 2: Run project verification**

Run from app/:

    npm test
    npm run build:css
    npm run lint

Expected: each command exits with code 0. If one fails, preserve its output and return to the smallest task that owns the behavior; do not bundle unrelated cleanup.

- [ ] **Step 3: Perform a live Auto-DJ smoke test**

With MPV and the running LTTH app available, select Radio-Mix and let the queue empty. Verify GET /api/plugins/music-bot/auto-dj/status reports mode mix and selectionSource. Observe or trigger a failed Auto-DJ stream; logs must show one replacement action and no second loadfile for the failed track ID.

- [ ] **Step 4: Review the focused diff**

Run:

    git diff --check
    git diff -- app/plugins/music-bot/lib/auto-dj.js app/plugins/music-bot/lib/queue-manager.js app/plugins/music-bot/lib/playback-engine.js app/plugins/music-bot/main.js app/plugins/music-bot/ui.html app/plugins/music-bot/assets/ui.js app/test/music-bot-core-features.test.js app/test/music-bot-runtime-ui-regression.test.js

Expected: no whitespace errors and no unrelated files in the feature diff. Do not create an empty commit.

## Plan Self-Review

- Spec coverage: Tasks 1 and 2 deliver the persistent twelve-hour blocks, 80/20 selection, seed rotation, fallback, and status. Task 3 delivers confirmed Auto-DJ-only recovery and exactly-once replacement without changing viewer recovery. Task 4 delivers configuration persistence. Task 5 covers focused, full, and live verification.
- Completeness scan: Every code-changing task names the files, methods, test cases, and commands needed for implementation.
- Type consistency: recordFailedTrack(track, reason, now), getSelectionBlocks(now), isTrackBlocked(track, blocks), _pickFromMix(), _pickRelatedToSeed(seed, blocks), and _handleAutoDJPlaybackFailure(track, reason, error) have one consistent spelling throughout.
