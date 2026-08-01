# Soundbot UX and diversity hardening implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove verified Soundbot interaction and state-communication failures while making catalog discovery and the history Auto-DJ path more predictable without changing viewer-request priority.

**Architecture:** The existing Music Bot remains server-authoritative: `QueueManager` owns queue durability, `MusicCatalog` owns local discovery, and `AutoDJ` owns candidate selection. The vanilla UI only presents server state and suppresses stale browser responses. No new external service, player, or persistent data model is introduced.

**Tech Stack:** CommonJS, SQLite via `better-sqlite3`, Express plugin routes, vanilla browser JavaScript, Jest, existing plugin locales.

## Global constraints

- Preserve manual queue priority over Auto-DJ and the Safety-Lock behavior.
- Preserve the existing Streamer Playlist, Smart Radio, MPV, and chat-command contracts.
- Do not touch unrelated dirty files in the primary worktree.
- Keep all user-visible copy localized in `plugins.music-bot.music_bot`.
- Use the bundled Node 22 runtime for LTTH tests.

---

### Task 1: Repair the runtime translation contract

**Files:**

- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/music-bot/locales/de.json`
- Modify: `app/plugins/music-bot/locales/en.json`
- Modify: `app/plugins/music-bot/locales/es.json`
- Modify: `app/plugins/music-bot/locales/fr.json`
- Test: `app/test/music-bot-ui-i18n.test.js`
- Test: `app/test/music-bot-admin-catalog-i18n.test.js`

**Interfaces:**

- `RUNTIME_I18N_SECTIONS` must declare every literal `tr('key', ...)` call in one parseable map.
- Every non-German locale must supply a language-native `autoDj.streamerPlaylistTitle`.

- [ ] Run the two i18n suites and verify the current 14 failures.
- [ ] Move the later Streamer Playlist/Song Radio key mappings into the primary runtime section declaration so static and runtime contracts use the same source of truth.
- [ ] Translate `streamerPlaylistTitle` in English, Spanish, and French without adding a false language-neutral exception.
- [ ] Re-run the two i18n suites and verify that all tests pass.

### Task 2: Make local catalog search useful and race-safe

**Files:**

- Modify: `app/plugins/music-bot/lib/music-catalog.js`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Test: `app/test/music-bot-catalog.test.js`
- Test: `app/test/music-bot-runtime-ui-regression.test.js`

**Interfaces:**

- `MusicCatalog.searchSongs(query, limit)` returns matching title, artist, and genre metadata without duplicate song rows.
- `searchCatalog(query)` ignores a response if a later catalog request superseded it.

- [ ] Add focused tests for artist and genre search and for an older catalog response arriving after a newer query.
- [ ] Run the new tests and verify they fail on the baseline.
- [ ] Use parameterized SQL with `EXISTS` subqueries for artist/genre matching, preserving the current `limit` clamp and result shape.
- [ ] Track a monotonically increasing catalog request generation in the UI and render results only for the current generation.
- [ ] Re-run catalog and UI regression suites.

### Task 3: Make queue durability state truthful and visible

**Files:**

- Modify: `app/plugins/music-bot/lib/queue-manager.js`
- Modify: `app/plugins/music-bot/main.js`
- Modify: `app/plugins/music-bot/ui.html`
- Modify: `app/plugins/music-bot/assets/ui.js`
- Modify: `app/plugins/music-bot/locales/de.json`
- Modify: `app/plugins/music-bot/locales/en.json`
- Modify: `app/plugins/music-bot/locales/es.json`
- Modify: `app/plugins/music-bot/locales/fr.json`
- Test: `app/test/music-bot-queue-manager.test.js`
- Test: `app/test/music-bot-runtime-ui-regression.test.js`

**Interfaces:**

- `QueueManager.getPersistenceStatus()` reports the latest write result, error, and pending item count.
- `/api/plugins/music-bot/status` and `/diagnostics` expose `queuePersistence`.
- The queue panel announces an unsaved-session warning and provides an explicit retry action; a failed write never claims durable persistence.

- [ ] Add tests that simulate a queue write failure, inspect the status object, and assert clearing it after a successful retry.
- [ ] Add a UI test for the localized warning and retry request.
- [ ] Record the most recent write result in `persistQueue()`; preserve the in-memory queue so active playback is not discarded.
- [ ] Add the sanitized status payload to status and diagnostics responses.
- [ ] Render a concise warning plus retry control in the queue panel; do not block queue controls.
- [ ] Re-run queue manager and runtime UI suites.

### Task 4: Make the history Auto-DJ pool deterministic and broader

**Files:**

- Modify: `app/plugins/music-bot/lib/auto-dj.js`
- Test: `app/test/music-bot-core-features.test.js`

**Interfaces:**

- `_loadHistoryCandidates()` returns a deterministic candidate pool ordered by last completed playback.
- `_pickFromHistoryCandidates(candidates, blocks)` uses the injected `random` dependency only when `historyShuffled` is enabled.

- [ ] Add tests that prove a fixed random sequence gives a reproducible history selection, a 21st eligible history item can be considered, and the non-shuffled path remains newest-first.
- [ ] Run the focused core feature suite and verify the new assertions fail.
- [ ] Replace SQL `ORDER BY RANDOM()` with `MAX(finishedAt) AS lastPlayedAt` ordering and increase the bounded candidate pool from 20 to 100.
- [ ] Select an eligible shuffled candidate through `_chooseWeighted()` with an equal weight, retaining existing cooldown, session, artist-spacing, and ban checks.
- [ ] Re-run the core feature and Smart Radio suites to verify regression safety.

### Task 5: Integrated verification and review

**Files:**

- Test: `app/test/music-bot-ui-i18n.test.js`
- Test: `app/test/music-bot-admin-catalog-i18n.test.js`
- Test: `app/test/music-bot-catalog.test.js`
- Test: `app/test/music-bot-queue-manager.test.js`
- Test: `app/test/music-bot-core-features.test.js`
- Test: `app/test/music-bot-smart-radio.test.js`
- Test: `app/test/music-bot-runtime-ui-regression.test.js`

- [ ] Run all affected suites with the bundled runtime in-band.
- [ ] Start the isolated app in a non-live configuration and inspect the Music Bot UI at desktop and mobile widths with browser automation.
- [ ] Run `npm run build:css`, `npm run lint`, and `git diff --check`.
- [ ] Review the final diff for Music-Bot-only scope and record unrelated baseline failures separately.
