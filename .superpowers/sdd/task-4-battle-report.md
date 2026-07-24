# Task 4 Report: Automatic Three-Round Skill Battles, Rules Version 3

## Outcome

Implemented Stream Monsters rules version 3 as an automatic, deterministic,
reproducible three-round battle system. Legacy `power`, `guard`, and `speed`
arguments remain accepted queue metadata, but no longer affect battle identity,
decisions, damage, actions, or winner selection.

The implementation starts from reviewed commit
`38bcf6cc20b7420e5c074ee48a7cdad4409cbbf8` and does not change binary assets,
creator UI, overlays, locales, package/store versions, AI runtime, incubation,
gift rules, or collection schema.

## Implementation

- Added `battle-rules-v3.js` as the shared deterministic rules engine.
  - Base damage is `max(1, 5 + might + elementBonus + variance - floor(guard / 2))`.
  - Variance is a deterministic integer from `-2..2`.
  - Temporary maximum HP is `22 + (vitality * 3) + (level * 2)` for every
    element.
  - Personality-based attack/defense choices and stable speed-order tie rolls
    are seed-driven.
  - Charge activates once at or below 40% HP, and the next own action consumes
    the one-time special.
  - All six element attack, defense, and special rule sets are represented in
    detailed action records.
- Updated `battle-service.js`.
  - Rules-v3 battle IDs exclude stance arguments.
  - Existing compatibility fields remain in the return shape.
  - Template-specific skill identity is read from the Task 3 catalog.
- Updated battle persistence.
  - Added nullable `rules_version` and `skills_json`.
  - New rows persist version 3, complete skills, detailed rounds, actions, and
    result data.
  - `getBattle()` safely exposes parsed `rounds`, `skills`, and `result` fields
    while retaining raw JSON columns.
  - Empty or malformed legacy JSON falls back safely without breaking listing.
- Updated command event emission.
  - Emits `streammonsters:battle_skill_used` for every resolved own action.
  - Emits `streammonsters:battle_special_charged` once when charge activates.
  - Existing round events retain prior fields and now carry detailed actions.
  - Progression and collection hooks remain once per fighter/outcome.
- Added `battle-simulator.js`.
  - Uses the same rules engine as live battles.
  - Explicitly disables element advantage.
  - Crosses independent attacker/defender legal 28-point allocations and
    personalities across levels and deterministic seeds.
  - Mirrors each participant configuration across both side/order positions.
  - Reports literal engine wins/losses/draws and win rate for all six elements.

## Action Record Contract

Each action records:

- round, actor and target IDs;
- skill ID, type, catalog name, and VFX key;
- before/after HP, maximum HP, shield, charge, special use, burn, thorns,
  reflect, outgoing reduction, and evasion state;
- individual pre-mitigation, shield, penetration, HP, thorns, and reflect
  damage;
- applied and consumed effects;
- deterministic decision/damage/evasion rolls;
- terminal and winner context.

Round-start burn consumption is recorded separately in `startEffects`, while
the originating action records the applied burn and due round.

## TDD Evidence

Initial RED run:

```text
Test Suites: 2 failed, 2 total
Tests:       15 failed, 15 total
```

Failures covered all six element mechanics, action logs, ignored legacy
stances, automatic choices, one-time charge/special, v3 persistence, legacy
JSON parsing, event emission, and the missing simulator.

Additional RED cycles found and fixed:

- the four-seed default simulator matrix placed Tide at
  `0.5539434523809523`, above the approved `0.55` ceiling;
- Volt shield removal was explicit at action level but initially reported `0`
  in individual hit data instead of `2`.

Both tests were observed failing before the corresponding production changes.

Final rules-v3 focused GREEN:

```text
PASS test/streammonsters-battle-v3.test.js
PASS test/streammonsters-battle-simulator.test.js
```

## Balance Result

The complete default neutral matrix runs 12,096 literal mirrored battle
resolutions / 24,192 participant samples. It includes 6,048 battles with
different allocations and 8,064 battles with different personalities:

| Element | Wins | Losses | Draws | Win rate |
| --- | ---: | ---: | ---: | ---: |
| Ember | 2,038 | 1,994 | 0 | 50.546% |
| Tide | 2,029 | 2,003 | 0 | 50.322% |
| Grove | 2,114 | 1,918 | 0 | 52.431% |
| Gale | 2,001 | 2,031 | 0 | 49.628% |
| Volt | 1,949 | 2,083 | 0 | 48.338% |
| Lunar | 1,965 | 2,067 | 0 | 48.735% |

Every result is within the approved 45%..55% neutral band.

## Verification

Bundled runtime:

```text
Node v22.14.0
```

Final combined focused/regression run:

```text
Test Suites: 14 passed, 14 total
Tests:       169 passed, 169 total
Snapshots:   0 total
```

Covered:

- new battle and simulator suites;
- core battle and core rules-v3;
- gameplay-v2;
- chat commands and collector commands;
- progression;
- collection layer;
- collector arena and routes;
- release 1.3 compatibility;
- plugin integration and route security.

Repository lint:

```text
> eslint .
Exit code: 0
```

`git diff --check` also completed with exit code 0.

## Concerns

None.

## Review Follow-up Evidence

The review fixes were implemented in separate RED/GREEN cycles:

- Gale evasion now short-circuits the complete target side of the incoming
  action. Seeds `evade-ember-0`, `evade-tide-3`, and `evade-volt-6` prove no HP
  damage, shield absorption/removal/penetration, burn, or outgoing-damage
  reduction is applied.
- The simulator now runs the literal cross-product described above. It no
  longer converts split mirrored outcomes into synthetic draws.
- Terminal action and pre-final-round winner IDs remain `null`; only the final
  terminal round records the final tie-break winner. Seed `ko-0` covers the
  double-KO case.
- Every seeded automatic attack/defense choice is preserved as an
  `automaticDecision` entry in `action.seedRolls`.

Follow-up RED command:

```powershell
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
& $node node_modules/jest/bin/jest.js --runInBand `
  test/streammonsters-battle-v3.test.js `
  test/streammonsters-battle-simulator.test.js
```

Observed before production fixes:

```text
Test Suites: 2 failed, 2 total
Tests:       7 failed, 14 passed, 21 total
```

The failures reproduced all three evasion leaks, missing simulator cross-product
counts, missing participant counts, absent automatic decision rolls, and the
`ko-0` contradictory winner.

Final focused gate command:

```powershell
$node = 'C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe'
& $node node_modules/jest/bin/jest.js --runInBand `
  test/streammonsters-core.test.js `
  test/streammonsters-gameplay-v2.test.js `
  test/streammonsters-chat-commands.test.js `
  test/streammonsters-progression.test.js `
  test/streammonsters-collection-layer.test.js `
  test/streammonsters-collector-arena.test.js `
  test/streammonsters-collector-commands.test.js `
  test/streammonsters-battle-v3.test.js `
  test/streammonsters-battle-simulator.test.js `
  test/streammonsters-collector-routes.test.js `
  test/streammonsters-release-1.3.test.js `
  test/streammonsters-plugin-integration.test.js `
  test/streammonsters-routes-security.test.js `
  test/streammonsters-core-rules-v3.test.js
```

Observed:

```text
Test Suites: 14 passed, 14 total
Tests:       169 passed, 169 total
Snapshots:   0 total
Jest time:   11.244 s
Wall time:   12.244 s
```

Separate default simulator evidence:

```text
Battles:                     12,096
Participant samples:         24,192
Cross-allocation battles:     6,048
Cross-personality battles:    8,064
Wall time:                    0.506 s
```

Repository lint:

```text
> eslint .
Exit code: 0
Wall time: 14.011 s
```
