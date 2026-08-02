# Music Bot Auto-DJ Curation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Auto-DJ consistently repetition-safe, preference-aware, curator-driven, and controllable through an integrated player experience.

**Architecture:** `AutoDJ` owns one eligibility contract and the transient radio state (recent plays, request profile, and Artist Radio seed). `MusicCatalog` provides durable, decaying preference and metadata inputs. `PlaylistStore` owns the protected Streamer Playlist. `main.js` exposes narrowly scoped routes and `ui.html`/`ui.js` render the player controls plus a five-track DJ dashboard.

**Tech Stack:** CommonJS, SQLite via existing database helpers, Express plugin routes, vanilla browser JavaScript, Jest.

## Global Constraints

- Do not alter unrelated dirty Docs/Locales files.
- Preserve viewer-request priority, safety locks, stale-MPV-event guards, and plugin-local persistence rules.
- Bans, time-based track cooldowns, and session-repeat rules apply uniformly to history, playlist, related, Artist Radio, and catalog selection.
- Streamer ratings are local to this Music Bot profile; they are not viewer votes and are reversible.
- A pool with no eligible candidate must report no track rather than replay a session duplicate.

---

### Task 1: Unified eligibility and bounded repeat memory

**Files:**
- Modify: `app/plugins/music-bot/lib/auto-dj.js`
- Test: `app/test/music-bot-core-features.test.js`

**Interfaces:**
- Produces `getTrackEligibility(track, { blocks, now })` with `{ eligible, reason }`.
- Replaces permanent catalog `playedSongIds` exclusion with timestamped session play records that expire with `repeatCooldownHours`.

- [ ] Add failing tests covering playlist/related cooldown blocking, session blocking without a repeat fallback, artist spacing independent of the song cooldown, and expiry of a catalog session record.
- [ ] Verify the tests fail against the current selection behavior.
- [ ] Route every selector through the common eligibility contract and retain only the configured artist-spacing rule for artists.
- [ ] Run the focused core feature tests.

### Task 2: Preference-aware Smart Radio scoring

**Files:**
- Modify: `app/plugins/music-bot/lib/auto-dj.js`
- Modify: `app/plugins/music-bot/lib/music-catalog.js`
- Modify: `app/plugins/music-bot/main.js`
- Test: `app/test/music-bot-smart-radio.test.js`
- Test: `app/test/music-bot-catalog.test.js`

**Interfaces:**
- `getRadioCandidates(..., { now })` returns affinity timestamps and optional release year.
- `AutoDJ` reports score reasons for decayed feedback, completion strength, long-tail, diversity, BPM relation, and request-profile matches.

- [ ] Add failing tests for the configurable familiar/discovery split, decayed feedback, stronger completed-play factor, long-tail preference, genre/artist/decade/playlist diversity, and half/double-time BPM matching.
- [ ] Verify the tests fail before production changes.
- [ ] Make `mixHistoryPercent` the displayed familiar/discovery share in Smart Radio while preserving legacy History-versus-related behavior.
- [ ] Add bounded feedback half-life handling and a bounded, weighted multi-request seed profile.
- [ ] Run Smart Radio and catalog tests.

### Task 3: Streamer Playlist and player ratings

**Files:**
- Modify: `app/plugins/music-bot/lib/playlist-store.js`
- Modify: `app/plugins/music-bot/lib/music-catalog.js`
- Modify: `app/plugins/music-bot/main.js`
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/music-bot/locales/de.json`
- Modify: `app/plugins/music-bot/locales/en.json`
- Modify: `app/plugins/music-bot/locales/es.json`
- Modify: `app/plugins/music-bot/locales/fr.json`
- Test: `app/test/music-bot-playlist-store.test.js`
- Test: `app/test/music-bot-radio-routes.test.js`
- Test: `app/test/music-bot-runtime-ui-regression.test.js`

**Interfaces:**
- `PlaylistStore.getStreamerPlaylist()` exposes a protected `streamer-playlist`.
- `MusicCatalog.recordStreamerRating(songId, direction)` persists local positive/negative preference.
- `POST /api/plugins/music-bot/radio/streamer-rating` rates the currently playing catalog song.

- [ ] Add failing tests that a thumbs-up adds a catalog song to the protected Streamer Playlist, a thumbs-down removes it and persists a negative preference, and the route rejects a non-catalog current song.
- [ ] Verify red tests.
- [ ] Add player-integrated accessible thumbs up/down controls and status feedback.
- [ ] Render a five-candidate DJ dashboard using the existing preview endpoint with score explanations.
- [ ] Run route, store, runtime-UI, and i18n tests.

### Task 4: Artist Radio from a song seed

**Files:**
- Modify: `app/plugins/music-bot/lib/auto-dj.js`
- Modify: `app/plugins/music-bot/main.js`
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/music-bot/locales/de.json`
- Modify: `app/plugins/music-bot/locales/en.json`
- Modify: `app/plugins/music-bot/locales/es.json`
- Modify: `app/plugins/music-bot/locales/fr.json`
- Test: `app/test/music-bot-core-features.test.js`
- Test: `app/test/music-bot-radio-routes.test.js`
- Test: `app/test/music-bot-runtime-ui-regression.test.js`

**Interfaces:**
- `AutoDJ.startArtistRadio(track)` starts a bounded Artist Radio session from a track artist and optional YouTube seed.
- `POST /api/plugins/music-bot/artist-radio/start` and `/stop` control it.

- [ ] Add failing tests that Artist Radio derives its seed from the selected/current song, remains eligibility-safe, and ends cleanly after its bounded session.
- [ ] Verify red tests.
- [ ] Prefer eligible catalog tracks by the seeded artist, then use a seed-derived related radio only when needed.
- [ ] Add start/stop player controls with clear active-state text.
- [ ] Run focused route, core, and UI tests.

### Task 5: Regression and handoff review

**Files:**
- Test: `app/test/music-bot*.test.js`

- [ ] Run focused affected suites, then all Music Bot Jest suites, CSS build, lint, and `git diff --check`.
- [ ] Inspect the final diff to confirm only the planned Music Bot files and this plan file changed.
- [ ] Record the unrelated baseline i18n failure separately if it persists.
