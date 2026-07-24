# Task 3 Collection Layer Report

## Delivered

- Added the immutable 24-template CommonJS catalog, with stable IDs, element/name/species records, bundled furry paths, and template-specific attack/defense/special names and VFX keys.
- Added additive SQLite schema and migration support for template IDs, viewer-element shuffle bags/reservations, mastery, essence, cosmetic markers, stream missions/participants/elements, and Heart Chain state.
- Legacy monsters receive a deterministic element-and-seed template ID while all prior monster fields remain untouched.
- Hatching reserves a template in a SQLite transaction before monster creation; reservations make repeated handling idempotent and bags cycle only after all four templates were used. The first cycle places unowned templates first.
- Added duplicate essence cosmetics (3/6/12), mastery (hatch/battle/win/mission) cosmetics (10/25/50), first-discovery and newly crossed-mastery events, and idempotency action keys.
- Added deterministic one-per-stream missions, participant/reward persistence, stream-wide distinct-element tracking, one-count-per-battle mission progress, and Heart Chain behavior/milestones.
- Wired collection behavior into hatches, battle command results, art-pool template generation/selection, state, catalog, and pool preparation APIs.
- Added tests for catalog, bags/reservations, migration, essence/mastery, missions, Heart Chain, visual fallback, and catalog/state/pool API contracts.

## Verification

Using `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe` (v22.14.0):

- Focused affected regression: 9 suites passed, 90 tests passed after the review follow-up.
- Focused ESLint for all changed production and test files: passed.
- Syntax checks for changed Stream Monsters modules: passed.
- `git diff --check`: passed.

The broad `--testPathPatterns=streammonsters` run did not finish before the 120-second command timeout; the explicitly affected suites above were rerun individually and passed.

## Review Follow-up Verification

Addressed the Heart Chain post-gap milestone reset, template-safe art-lab legacy fallback, mission rewards for late second battle participants, selected-monster mission mastery priority, and template-aware ownership/art lookup indexes. The shuffle-bag test now also proves twelve serial replays of one reservation leave the bag unchanged.

Exact rerun command (Node v22.14.0):

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' --runInBand --silent --runTestsByPath '.\test\streammonsters-collection-layer.test.js' '.\test\streammonsters-collector-arena.test.js' '.\test\streammonsters-collector-progression.test.js' '.\test\streammonsters-art-pool-kenney.test.js' '.\test\streammonsters-collector-routes.test.js' '.\test\streammonsters-core-rules-v3.test.js' '.\test\streammonsters-collector-commands.test.js' '.\test\streammonsters-chat-commands.test.js' '.\test\streammonsters-routes-security.test.js'
```

Result: 9 passed suites, 90 passed tests, 0 failures (2026-07-24).

## Atomic Battle Mission Follow-up

Added `recordBattleOutcome()` and its transactional database operation so both fighters are persisted before a completing battle-mission progress update. Chat battle resolution invokes this API once. Generic mission progress now exits before registering any participant once a mission is complete, preventing unrelated later events from receiving a mission badge or mission mastery.

Exact rerun command (Node v22.14.0):

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' --runInBand --silent --runTestsByPath '.\test\streammonsters-collection-layer.test.js' '.\test\streammonsters-collector-arena.test.js' '.\test\streammonsters-collector-progression.test.js' '.\test\streammonsters-art-pool-kenney.test.js' '.\test\streammonsters-collector-routes.test.js' '.\test\streammonsters-core-rules-v3.test.js' '.\test\streammonsters-collector-commands.test.js' '.\test\streammonsters-chat-commands.test.js' '.\test\streammonsters-routes-security.test.js'
```

Result: 9 passed suites, 92 passed tests, 0 failures (2026-07-24).

## Atomic Battle Batch Follow-up

Added a SQLite-transactional `recordBattleMission()` path and public `recordBattleOutcome()` service API. The battle command invokes it once with both fighters, so both participant rows exist before a third battle completes and rewards the mission. Generic mission progress now checks completion before registering a participant, so unrelated late events cannot obtain a participant row, badge, or mission mastery.

Exact rerun command (Node v22.14.0):

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' '.\node_modules\jest\bin\jest.js' --runInBand --silent --runTestsByPath '.\test\streammonsters-collection-layer.test.js' '.\test\streammonsters-collector-arena.test.js' '.\test\streammonsters-collector-progression.test.js' '.\test\streammonsters-art-pool-kenney.test.js' '.\test\streammonsters-collector-routes.test.js' '.\test\streammonsters-core-rules-v3.test.js' '.\test\streammonsters-collector-commands.test.js' '.\test\streammonsters-chat-commands.test.js' '.\test\streammonsters-routes-security.test.js'
```

Result: 9 passed suites, 92 passed tests, 0 failures (2026-07-24).
