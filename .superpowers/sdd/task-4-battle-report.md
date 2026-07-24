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
  - Uses mirrored opponent order, mirrored legal 28-point stats, levels,
    personalities, and deterministic seeds.
  - Reports wins, losses, draws, and normalized win rate for all six elements.

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

The complete default neutral matrix runs 32,256 mirrored battle resolutions:

| Element | Wins | Losses | Draws | Normalized win rate |
| --- | ---: | ---: | ---: | ---: |
| Ember | 449 | 90 | 4,837 | 53.339% |
| Tide | 642 | 292 | 4,442 | 53.255% |
| Grove | 394 | 242 | 4,740 | 51.414% |
| Gale | 243 | 530 | 4,603 | 47.331% |
| Volt | 141 | 676 | 4,559 | 45.024% |
| Lunar | 296 | 335 | 4,745 | 49.637% |

Every result is within the approved 45%..55% neutral band.

## Verification

Bundled runtime:

```text
Node v22.14.0
```

Final combined focused/regression run:

```text
Test Suites: 14 passed, 14 total
Tests:       164 passed, 164 total
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
