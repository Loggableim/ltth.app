# Task 5 Report — Free-Egg Credit and Population Missions

## Outcome

- A successful free-egg adoption now records exactly one `daily:gift`
  ("Receive an egg") completion through `recordEggReceived(...)`.
- Free eggs do not increment `weekly:event`, paid-gift counts, Hype, or gift
  combo/effect paths. Duplicate command events and competing claims do not
  double-credit.
- Paid gifts reuse the same egg-received hook, while their weekly event credit
  remains gift-only and idempotent.
- Stream missions now use a fixed five-minute unique participant count:
  - solo (1–4): 2 hatches, 2 elements, 1 battle, no Heart Chain
  - party (5–14): 4 hatches, 3 elements, 2 battles, Heart Chain 3
  - rally (15+): 6 hatches, 4 elements, 3 battles, Heart Chain 5
- Mission choice remains stable. Its target may grow while progress is zero,
  never shrinks, and freezes after the first progress, including batched
  battle results.
- Heart Chain is unavailable to solo streams and otherwise requires an enabled
  Heart Me gift mapping.
- `population_band` and `population_peak` are additive columns. Existing
  mission rows retain their key, target, progress, completion, and null
  population metadata.
- Creator and public overlay state expose localized, effective targets and
  population explanations in German, English, Spanish, and French.

## TDD Evidence

RED:

- Free-egg/progression slice: 2 new failures with 22 existing passes, proving
  the missing `recordEggReceived` API and missing free-claim quest credit.
- Population slice: 4 new failures proving the missing five-minute count,
  exact band targets, Heart Chain eligibility, and persisted legacy behavior.
- A separate batched-battle failure proved that target scaling must happen
  before the first battle progress is recorded.
- Creator/overlay localization slice: 6 failures proved that fixed-number
  strings and the reduced public mission projection could not represent the
  effective target or population explanation.

GREEN:

- Free-egg and progression suites: 2 suites, 24 tests passed.
- Collection suite excluding one unrelated WebP expectation: 26 tests passed,
  including additive migration and legacy preservation.
- Creator and route projection localization contracts: 6 focused tests passed.

## Verification

Passed:

- `streammonsters-free-egg-drops-v6.test.js`
- `streammonsters-progression.test.js`
- `streammonsters-lifecycle-atomicity.test.js`
- `streammonsters-review-fix-round1.test.js`
- `streammonsters-creator-ui.test.js`
- `streammonsters-routes-security.test.js`
- `streammonsters-plugin-integration.test.js`
- `streammonsters-collector-arena.test.js`
- `streammonsters-egg-shelf-autohatch-v111.test.js`
- Focused ESLint for all changed JavaScript and test files
- Locale JSON parsing for `de`, `en`, `es`, and `fr`
- `git diff --check`

Two whole-suite assertions remain outside Task 5 after the concurrent runtime
asset conversion commit `a85f128d3`:

- The collection legacy-visual test still requires a `.png` URL, while the
  migrated runtime now returns `.webp`.
- The Rules v5 asset test still expects `furry-1.5.0`, while the runtime
  manifest now reports `furry-1.12.0`.

Task 5 did not modify those asset expectations.

## Runtime Safety

- No Ready Egg rescue adoption was added.
- No live runtime, plugin reload, main checkout, GitHub state, or deployment
  was touched.
- The free-egg checkpoint is commit `9b96c312a`.
