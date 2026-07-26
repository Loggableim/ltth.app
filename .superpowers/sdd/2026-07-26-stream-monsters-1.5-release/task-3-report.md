# Task 3 Report: Persistent Interactive PvP

## Result

Task 3 is implemented on `codex/stream-monsters-1.5-release`.

- Implementation commit: `d55ee18a` (`feat(streammonsters): persist interactive arena battles`)
- Starting point: `c8a857e6e557cf3dfc8fe7df643c415e342be087`
- Runtime used for every Jest and ESLint invocation:
  `C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe`
- Test working directory: `app`
- No snapshot cherry-pick, push, live reload, deployment, or application restart was performed.

## Implemented Contract

### Persistent owner and schema

`BattleMatchService` is the single durable owner of interactive PvP. It uses
immediate SQLite transactions, phase-version compare-and-swap updates,
provider-event idempotency, append-only ordered events/actions, and
after-commit socket emission.

The additive schema introduces:

- `streammonsters_matches`
- `streammonsters_match_participants`
- `streammonsters_match_decisions`
- `streammonsters_match_actions`
- `streammonsters_match_events`
- `streammonsters_match_rewards`
- `streammonsters_stat_prompts`
- `streammonsters_arena_seasons`
- `streammonsters_arena_ratings`
- `streammonsters_arena_daily_ledger`

Partial unique indexes prevent more than one active match per viewer and more
than one active lock per monster. Existing `streammonsters_battles` records
remain readable; nullable `match_id` and `replay_version` columns link new v5
records without replacing v3 history. Monsters gain the additive
`unspent_stat_points` column.

### Match lifecycle

- Queue matching prioritizes nearest Arena rating.
- The initial level window is +/-2 and widens once per 30 seconds waited.
- A recent opponent is avoided for ten minutes whenever another valid
  opponent exists.
- The roster window lasts 15 seconds.
- Each action window lasts 8 seconds.
- Matches resolve in at most three rounds.
- Expired roster, action, and stat windows are recovered deterministically
  from persisted deadlines.
- Reload recovery resumes from database state; `destroy()` clears the sweep
  timer.
- Leaving is refused while a monster is locked in an active match.

### Interactive rules v5

- Raw `A`, `B`, and `C` are accepted only for the authorized participant in
  an active action window.
- The first valid decision for a participant and round wins; duplicate,
  foreign, and late inputs fall through unhandled.
- `A` grants 25 special charge, `B` grants 50, and every HP hit grants 25.
- `C` requires 100 charge and consumes it when used.
- Agility determines order, with deterministic seed tie-breaking.
- Shield is consumed before HP.
- Multi-hit attacks resolve sequentially and stop immediately on KO.
- Missing choices use deterministic seeded timeout choices.
- The catalog provides three distinct A/B/C skills for each of 24 templates
  across all six element families.

### Progression, Arena, and Collector

- Both legitimate fighters always receive 10 permanent monster XP; the winner
  receives 5 additional XP.
- Levels 2 through 20 each grant one unspent stat point; level 20 is the cap.
- Stat prompts last 30 seconds and bind match, viewer, and monster.
- Raw `1` through `4` spends one authorized stat point exactly once.
- Only the first ten battles per viewer/day affect Arena Elo and Arena battle
  rewards. Permanent XP is not daily-capped.
- Arena rating is independent of Collector score, starts at 900, and uses
  K=32 with exact Bronze/Silver/Gold/Crystal/Monster Master tiers.
- Arena seasons support 7/14/28/60/90-day presets while old season data stays
  readable.
- Collector additions are exactly-once: hatch +2, first seasonal template +8,
  evolution II +25, evolution III +50, mastery milestone +10, stream mission
  participant +20, daily +5, and weekly +20. Existing Collector tiers are
  unchanged.

### Ingress, replay, and privacy

- Stream Monsters registers one Raw GCCE handler and routes only
  `A/B/C/1/2/3/4` into the durable service.
- Canonical viewer identity and provider event IDs are used; a deterministic
  hash is used when a provider ID is absent.
- `GET /api/streammonsters/battle-state` returns a redacted public snapshot.
- `GET /api/streammonsters/battles/:battleId/replay?cursor=N` returns normalized
  v3 or ordered cursor-based v5 replay data.
- Public state and replay output omit private viewer identifiers and hidden
  live monster state.

## TDD Evidence

Production slices were implemented only after focused failures established
the missing contract.

Representative RED states included:

- missing v5 catalog/effect exports and missing 24-template A/B/C skills;
- missing deterministic interactive resolver and charge/shield/KO semantics;
- missing v5 schema tables, columns, and one-active uniqueness constraints;
- missing durable queue reservation, worker-connection concurrency,
  recovery, event ordering, daily Arena, stat prompt, replay, and privacy
  behavior;
- Raw GCCE responses returning unhandled because no persistent battle owner
  existed;
- permanent XP being coupled to the ten-battle daily Arena gate;
- Collector hatch/template/evolution/mastery/mission awards being absent;
- finalization not notifying Collection and not incrementing the winner metric.

Each slice was brought to GREEN before the next slice. The finalization
regression was re-run independently after its production change:

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  '.\node_modules\jest\bin\jest.js' --runInBand `
  test/streammonsters-battle-match-v5.test.js `
  -t 'permanent XP exactly once'
```

Result: 1 selected test passed, 13 skipped, 0 failures.

The balance/determinism test covers all 24 templates at levels
1, 5, 10, 15, and 20. The reservation concurrency regression uses separate
SQLite connections in worker threads rather than simulating contention on a
single connection.

## Final Verification

### Focused regression

The final focused command explicitly passed these 16 suites:

```powershell
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  '.\node_modules\jest\bin\jest.js' --runInBand `
  test/streammonsters-battle-match-v5.test.js `
  test/streammonsters-battle-routes-v5.test.js `
  test/streammonsters-battle-v5.test.js `
  test/streammonsters-battle-v3.test.js `
  test/streammonsters-battle-simulator.test.js `
  test/streammonsters-chat-commands.test.js `
  test/streammonsters-collection-layer.test.js `
  test/streammonsters-collection-v15.test.js `
  test/streammonsters-collector-arena.test.js `
  test/streammonsters-collector-commands.test.js `
  test/streammonsters-collector-progression.test.js `
  test/streammonsters-collector-routes.test.js `
  test/streammonsters-core.test.js `
  test/streammonsters-gcce-v15.test.js `
  test/streammonsters-lifecycle-atomicity.test.js `
  test/streammonsters-plugin-integration.test.js
```

Result: 16/16 suites and 147/147 tests passed, 0 snapshots, 0 failures.

### Explicit Stream Monsters / StreamAlchemy / GCCE regression

```powershell
$suitePaths = @(
  Get-ChildItem -Path test -File |
    Where-Object { $_.Name -match '(streammonsters|streamalchemy|gcce).*\.test\.js$' } |
    Sort-Object FullName -Unique |
    ForEach-Object { 'test/' + $_.Name }
)
& 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe' `
  '.\node_modules\jest\bin\jest.js' --runInBand $suitePaths
```

The enumerated input contained exactly 50 paths.

Result: 50/50 suites and 411/411 tests passed, 0 snapshots, 0 failures
in 60.804 seconds.

An earlier attempt using Windows backslashes inside Jest's generated path
pattern produced `No tests found`. Re-enumerating the same explicit files with
forward-slash paths resolved the invocation issue; it was not a product or
test failure.

### Static checks

ESLint was invoked directly with the bundled Node runtime over all 16 changed
or newly added JavaScript files.

Result: exit 0, no lint findings.

The active locale files were parsed with `JSON.parse`:

```text
de:ok
en:ok
es:ok
fr:ok
```

`git diff --check` returned exit 0. Git printed only line-ending conversion
notices (`LF will be replaced by CRLF`), with no whitespace errors.

## Compatibility and Remaining Boundaries

- v3 battles and their original resolver are not rewritten. The command
  service retains its old fallback only when no persistent match service is
  injected, which preserves isolated legacy composition tests.
- No visual/overlay work from later release tasks is included here.
- No live runtime proof was attempted because Task 3 explicitly forbids reload
  or deployment. Verification is limited to direct bundled-runtime tests and
  static checks in the isolated worktree.

## Review fix round 1

Implementation commit: `0f02e08e`
(`fix(streammonsters): harden public battle replay`)

All seven review findings were reproduced against `bc4d98de` before production
changes. The corrected RED baseline contained 3 failing suites, 11 failing
tests, 17 passing tests, and 0 snapshots.

### Public/private replay boundary

The unauthenticated replay route now calls only
`getPublicNormalizedReplay()`. It never calls the full replay reader.
Public v5 pages are built exclusively from `public_payload_json` and then pass
through a second event-type-specific allowlist projection.

Public action projections expose only:

- durable event/action sequence;
- round, actor slot, and target slot;
- requested/locked choice and safe fallback reason;
- safe skill presentation fields;
- reduced hit, outcome, retaliation, and status-effect results.

They omit viewer IDs, participant IDs, monster database IDs, provider event
IDs, persisted event IDs, and private before/after state internals. A real
SQLite + `BattleMatchService` + registered-route integration test proves the
boundary without mocking service forwarding.

Full v3/v5 replay remains available only through the separate
`getPrivateNormalizedReplay()` service method. No public route exposes it.

### One lossless cursor and decision provenance

`streammonsters_match_events.sequence` is now the single durable paging
domain. Additive nullable `event_sequence` columns attach both decision and
action rows to that global sequence. Public pages select one ordered event
range and derive their actions and decisions only from that range, preventing
cross-table cursor skips and duplicates.

Public decision provenance contains:

```text
sequence, round, window, slot, choice, source, timeout
```

Both viewer and deterministic-timeout decisions are persisted as ordered
events. Provider IDs and viewer/participant identifiers remain private.
Multi-page coverage starts with early non-action events and proves that later
actions are returned once, in order, without loss.

### Exclusive deadlines and recovery containment

Roster, action, and stat submissions now consistently reject at
`now >= deadline`; recovery consistently claims at `deadline <= now`.
A file-backed two-connection test covers all three exact boundaries.

Recovery now runs per roster match, action match, and stat prompt in isolated
immediate transactions. Missing selected monsters deterministically fall back
to the queued owned monster; if neither exists, the affected match is
cancelled and its participants are released without aborting unrelated
recovery.

The interval uses a guarded sweep entrypoint. Per-item and outer sweep errors
are logged and contained. After-commit callbacks are invoked independently;
one failing socket callback is logged and cannot prevent later callbacks or
escape as a process-fatal exception. Fake-timer and injected-error tests prove
continuation and timer cleanup.

### Runtime mechanics and coverage correction

The deterministic v5 resolver now applies every catalog-advertised mechanic:

- burn persists, ticks in sequence, and expires within a capped budget;
- evade uses a deterministic seeded roll and is consumed by the next incoming
  hit;
- thorns and reflect retaliate sequentially and honor shield/HP/KO rules;
- pierce bypasses the advertised amount instead of merely deleting extra
  shield;
- heal, lifesteal, shield, multihit, agility initiative, and weaken/debuff all
  produce persisted state plus replay evidence.

Burn, evade, thorns, reflect, and weaken stacks/chances are bounded. Charge,
shield-before-HP, sequential multi-hit, and early KO contracts remain intact.

Coverage now includes:

- a real worker-thread two-connection queue-to-reservation race;
- true level-gap 3 rejection before 30 seconds and widening at 30 seconds;
- a closer recent-rematch candidate avoided for a valid alternative;
- real multi-page v5 cursor behavior and decision provenance;
- service-backed route privacy;
- all 24 templates at levels 1/5/10/15/20 using A, B, and C against rotating
  opponents, with runtime evidence for every declared effect family.

### Review-fix verification

Targeted GREEN after implementation:

```text
3/3 suites passed
28/28 tests passed
0 snapshots
```

Focused compatibility GREEN:

```text
16/16 suites passed
154/154 tests passed
0 snapshots
```

Recursive explicit relevant-suite GREEN, including
`plugins/game-engine/test/gcce-integration.test.js`:

```text
51/51 suites passed
459/459 tests passed
0 snapshots
62.956 seconds
```

ESLint over all eight changed JavaScript production/test files returned exit
0. Locale JSON parsing returned `de:ok`, `en:ok`, `es:ok`, and `fr:ok`.
`git diff --check` returned exit 0 with only Git's line-ending conversion
notices.

No v3 rows were rewritten, no Collector tiers changed, no duplicate Raw GCCE
ingress was introduced, and no push, live reload, deployment, or application
restart was performed.
