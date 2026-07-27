# Final Review Fix Report

Date: 2026-07-27
Branch: `codex/stream-monsters-retention-arcade`
Starting head: `2f315fbf62b0443acd20813282115b7e21d5e643`

## Delivered fixes

- Replaced the stable `timestamp: null` adoption fallback with one shared ingress-ID normalizer. It prefers provider event IDs, then raw timestamps, then `context.timestamp`, and finally a per-ingress time/nonce. A minimal-context `no_offer` receipt can no longer block a later valid `!adopt`.
- Added persisted free-egg release recovery: constructor/reload sweep, one rearmable timer for the earliest reserved offer, atomic `reserved` to `public` updates with `RETURNING`, one release event per transitioned offer, rearming after offers/claims/cleanup, and timer cleanup on service/plugin destroy.
- Hardened the 20-worker contention harness so worker errors or exits before `ready` reject immediately.
- Replaced the obsolete Gifts-only branding assertion with positive Gift-egg and optional recurring free-egg coverage plus negative Gifts-only language coverage.
- Corrected the 1.6 release README so it describes the then-shipped daily eligibility behavior without claiming the Creator toggle/cooldown controls introduced in 1.8. The 1.7 README remains limited to its retention, sealed-choice, role, and arcade stage.
- Rebuilt 1.6.0, 1.7.0, and 1.8.0 atomically and reproducibly. Versions 1.0.0 through 1.5.0 retain their exact published hashes.
- Removed the extra EOF blank line from the implementation plan.

## TDD evidence

- Initial focused baseline: 3 suites, 35 passed and 1 obsolete branding failure.
- New RED run: 5 expected failures covering the minimal adoption ingress, timer release, reload sweep, rearm/destroy, and the 1.6 README overclaim.
- Free-egg GREEN: 16 tests passed.
- Adjacent runtime regression gate: 6 suites, 71 tests passed.
- Focused final gate: 3 suites, 41 tests passed.
- Full requested gate: all 63 `streammonsters*.test.js` suites plus `gcce-core-runtime`, `gcce-plugin-cooldown-contract`, and `gcce-all-commands-display`: 66 suites, 666 tests passed.

## Non-Jest gates

- Targeted ESLint passed for every changed JavaScript source/test file.
- CSS build passed. It emitted only the existing outdated `caniuse-lite` data warning.
- Package source-tree, README, archive-entry, license, reproducibility, and SHA-256 checks passed through `streammonsters-release-v18.test.js`.
- Direct hash comparison passed for every Stream Monsters archive from 1.0.0 through 1.8.0 and for the 1.8 store entry.
- Working-tree diff check passed. The final whole-range `git diff --check b6e6e819..HEAD` is rerun after the containing release commit.

## Release hashes

- 1.6.0: `b2657b8111807efe7d085012a3b6f20eb8c67d3dbc4624bf05a5b250441f1087`
- 1.7.0: `03d3598ac50aac1553d24e234ceb9ec3a6c866d34dc89edb328309550cc9f283`
- 1.8.0: `c57903d9956a26ae36c404d967558178ee53ab766c78d723d95b013d6198e136`

## Commits and remaining concerns

- Runtime/test fix: `b2e267b205622287e9738c4cf9f629c9f5b0d391`.
- Release artifacts, documentation tests, plan cleanup, and this report are in the containing release commit.
- Browser/OBS smoke remains assigned to the root agent. No push, merge, plugin reload, or application restart was performed in this fix wave.
