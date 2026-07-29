# Task 3 Implementer Report

## Scope

Implemented the additive per-viewer first-session journey:

`egg_received -> egg_hatched -> monster_selected -> battle_joined -> battle_completed`

The compound-key table stores each completed step once. The service resumes
persisted progress, preserves onboarding-only canonical identities, and
returns only `{completedSteps,nextStep,complete}`. No viewer identifier is
included in the journey state.

Progress is recorded only from the authoritative egg spawn/hatch events,
successful `choose`, accepted `battle` results, and persisted match or legacy
battle completion participants. Stat allocation remains contextual guidance
and is not part of completion.

Tutorial hints now use the private viewer ID only for an internal journey
lookup. The emitted hint stays sanitized, follows the next incomplete step,
re-evaluates delayed hints to prevent regression, and retains the existing
global cooldown and latest-hint coalescing behavior.

## TDD Evidence

- RED migration: the focused test received an empty
  `PRAGMA table_info(streammonsters_viewer_onboarding)` result.
- GREEN migration: the additive three-column compound-primary-key table was
  created and remained idempotent across repeated initialization.
- RED service/state/wiring: the service module, sanitized route projection,
  command wrapper, lifecycle persistence, and viewer-aware director fields
  were each absent before their minimal implementation.
- RED localization: all ten first-session title/body keys were absent before
  the four locale projections were added.

## Verification

Bundled Node `v22.14.0`, ABI `127`:

- `streammonsters-viewer-onboarding.test.js`
- `streammonsters-creator-retention-v6.test.js`
- `streammonsters-egg-overlay-state-reliability.test.js`
- `streammonsters-lifecycle-atomicity.test.js`
- Result: 4 suites, 66 tests passed.

Additional checks:

- Syntax checks passed for all five touched production JavaScript files.
- German, English, Spanish, and French locale JSON parsed successfully.
- `git diff --check` passed; only the checkout's existing LF-to-CRLF warnings
  were reported.

## Baseline Scope

No blocker occurred in the four focused Task 3 suites. The broader Jest
collection, live runtime, packaging, and the three unrelated replay
expectations already documented in the Task 2 report were intentionally not
run or changed for this task.
