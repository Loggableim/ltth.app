# Task 3 report: published-surface cleanup

## Scope completed

- Added the published-surface regression test and observed its expected RED failure on the still-published Data Source ZIP.
- Removed the Data Source package ZIP, feature screenshot, published feature/docs pages, mock, and tutorial guide source.
- Preserved the Task 2 removal of the `data-source` registry record; it was verified absent and was not re-added.
- Removed Data Source/TikFinity entries from documentation/tutorial/product capture inventories, generated feature pages, plugin catalog, sitemap, active localization inventories, and active docs.
- Rebuilt the feature hub and reconciled the documentation capture manifest from the surviving guide inventory (852 outputs for 213 actions).

## Validation

- RED: `npx jest --runInBand --silent test/eulerstream-only-live-data.test.js` failed as expected because `plugin-store/packages/data-source-1.0.0.zip` existed.
- GREEN: the same test passed: 1 suite, 4 tests.
- The remaining exact focused batch was invoked twice, but produced no Jest output and timed out after about 64 seconds in this environment. No passing claim is made for that batch.

## Preserved historical scope

`docs_archive/`, `new_patch/`, and `docs/superpowers/` were intentionally excluded.

## Review correction

- Restored the Task-2 capture-manifest baseline, then removed only Data Source/TikFinity capture entries.
- Restored the translation inventory baseline and removed only obsolete product names and referenced keys.
- Removed the review-identified stale capture declarations, Store Admin controls, obsolete screenshot asset, and adapter documentation remnants.
- Strengthened the published-surface regression to scan the active publication roots for the obsolete visible names and routes.
- `npx jest --runInBand --silent test/eulerstream-only-live-data.test.js` passed (1 suite, 4 tests).
