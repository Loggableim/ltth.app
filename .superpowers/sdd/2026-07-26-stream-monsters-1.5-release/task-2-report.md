# Task 2 report: gift, egg, collection, evolution, and GCCE loop

Date: 2026-07-26

## Outcome

Task 2 is implemented on `codex/stream-monsters-1.5-release` without restoring
the retired Art Lab surface or changing Task 1 public/private route boundaries.
Gift processing is the sole egg ingress. GCCE owns the registered command
ingress while the local fallback remains mutually exclusive.

## TDD evidence

- Initial RED matrix: 3 new suites, 12 tests, all 12 failed against the Task 1
  baseline for the missing gift/egg, collection/evolution, and GCCE contracts.
- The Hype overflow regression failed with the remainder discarded at values
  above 100; GREEN preserves the remainder and awards one charged egg per full
  100 points.
- The final Team Heart discovery audit added an explicit RED case for untouched
  name-based discovery with an arbitrary gift ID. It failed with `null` before
  the classifier accepted normalized `teamheart`; the existing `heartme`
  spelling and deliberate manual-mapping override remain supported.
- Focused final discovery/collection check: 2 suites, 27 tests passed.
- Focused legacy migration/Random check: 2 suites, 41 tests passed.
- Final full matrix: 46 suites, 412 tests passed, 0 snapshots.

## Implemented contracts

- Durable transactional gift-event claims deduplicate retries without
  suppressing legitimate repeat-count increments.
- `Random` uses a persistent six-element shuffle bag per stream and gift. The
  existing per-viewer/per-element four-template bag is retained.
- Exactly three `incubating` eggs consume incubators; `ready` eggs do not.
  Overflow is FIFO, queue positions are returned, expiry runs before promotion,
  and ready eggs expire 24 hours after `ready_at_ms`.
- Existing eggs retain their stored readiness timestamps. Charged, Elemental
  Hour, and boost timing continue to update the same persisted clock.
- Early hatch attempts return exact slot, state, readiness timestamp, and
  remaining milliseconds in the upper large-card response.
- Starter/adopt ingress and command registration are removed while historical
  starter rows remain readable.
- Enabled aliases become real GCCE command registrations. Disabled aliases
  remain configurable, normalized cross-command conflicts fail before
  persistence, and command plus raw-handler lifecycle registration is
  idempotent.
- GCCE now exposes an owned raw-response handler lifecycle foundation. Task 3
  battle response semantics (`A/B/C`, `1-4`) are intentionally not implemented
  here.
- Collection pagination, six-card rotation, and large monster-card payloads are
  first-class service/chat contracts.
- Evolution II/III spends element essence at mastery thresholds, persists the
  cosmetic stage, and leaves combat stats, XP, and level unchanged.
- German, English, Spanish, and French result strings cover expiry/not-found
  and evolution outcomes.

## Persistence and compatibility

Schema changes are additive: egg expiry fields, monster evolution stage,
per-element spent essence, durable gift claims, and persistent element shuffle
bags. Initialization does not rewrite historical egg rows. Legacy expiry is
computed lazily from stored readiness when lifecycle processing first needs it.

Provider event deduplication uses explicit stable IDs (`eventId`, `event_id`,
`msgId`, `msg_id`, `logId`, or `log_id`) plus the repeat index. Events without
an explicit stable provider ID are processed without durable dedupe so separate
legitimate gifts are never swallowed.

## Verification

All commands used the bundled Node runtime:

```text
C:\Users\logga\Documents\ltth_codex\ltth_desktop2-main\runtime\node\node.exe
```

- Jest focused legacy/Random: 2/2 suites, 41/41 tests.
- Jest focused Team Heart/collection: 2/2 suites, 27/27 tests.
- Jest `(streammonsters|streamalchemy|gcce)`: 46/46 suites, 412/412 tests.
- ESLint on every changed JavaScript file: passed.
- Locale JSON parse for `de`, `en`, `es`, and `fr`: passed.
- `git diff --check`: passed; only Git's expected LF-to-CRLF notices were
  emitted.

## Commit

Implementation commit: `55ee67e6`
