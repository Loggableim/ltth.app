# Music Bot Random Auto-DJ History Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Next Auto-DJ Track start a related radio title when random mode has no active seed but usable Music Bot history exists.

**Architecture:** `AutoDJ` obtains the newest history entry with a YouTube ID as an in-memory seed before invoking the existing YouTube Radio resolver. The existing Music Bot route continues to call `_maybePlayAutoDJ(true)` and therefore starts the resolved related title without replaying the seed.

**Tech Stack:** Node.js CommonJS, Jest.

## Global Constraints

- Keep the seed in memory only.
- Do not activate Auto-DJ or increment its consecutive-track counter while seeding.
- Preserve the existing no-context result when no valid history seed exists.

---

### Task 1: Seed random Auto-DJ from history

**Files:**
- Modify: `app/plugins/music-bot/lib/auto-dj.js`
- Test: `app/test/music-bot-core-features.test.js`

**Interfaces:**
- Produces: `AutoDJ._seedRandomModeFromHistory(): boolean`.
- Consumes: `plugin_music_bot_history` through the existing database helper.

- [ ] **Step 1: Write the failing test**

```js
const result = await autoDJ.getNextSong(true);
expect(result.song.title).toBe('Related title');
expect(resolver.resolvePlaylistEntry).toHaveBeenCalledWith(
  'https://www.youtube.com/watch?v=history-seed&list=RDhistory-seed',
  2
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm test -- --runInBand --silent test/music-bot-core-features.test.js`

Expected: FAIL because random mode has no seed and returns `no-playlist-context`.

- [ ] **Step 3: Add the minimal seed fallback**

```js
_seedRandomModeFromHistory() {
  const seed = this.db.prepare(
    `SELECT youtubeId, title, artist, url, duration, source, thumbnail
     FROM plugin_music_bot_history
     WHERE youtubeId IS NOT NULL AND TRIM(youtubeId) != ''
     ORDER BY finishedAt DESC LIMIT 1`
  ).get();
  return this.setPlaybackSeed(seed || null);
}
```

Call this helper from `_pickRelatedToLastPlaylistTrack()` before returning the no-context result.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `cd app && npm test -- --runInBand --silent test/music-bot-core-features.test.js test/music-bot-runtime-ui-regression.test.js`

Expected: PASS.

- [ ] **Step 5: Restart and verify the runtime**

Run the LTTH launcher, then call `GET /api/plugins/music-bot/status` and use Next Auto-DJ Track once. Expected: a related title starts and `lastPlaylistTrack` contains the selected history seed.
