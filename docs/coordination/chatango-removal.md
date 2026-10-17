# Chatango removal status

Date: 2026-10-07

## Findings and implementation

- Confirmed the live plugin directory contained only an obsolete plugin surface that was being removed by the parallel owner. The old public catalog, static website card/feature page, tutorial, store archive, locale keys, screenshot assets, root helper command, and tutorial/OBS capture inventories still referred to Chatango.
- Removed Chatango from the active store registry, website catalog/routes/locales/sitemap, plugin guide and localized wiki lists, product screenshot inventory, docs capture inventory, active OBS route/source generators, and active snapshot counts. Regenerated the feature hub, 38 tutorial pages, and the QA gallery.
- Removed the dedicated runtime code, locale files, test-only plugin assets, archive and screenshots while keeping `app/modules/plugin-loader.js`'s preserved stale-state policy and `app/test_user_configs/testprofile_plugins_state.json` unchanged. No runtime process, profile or live service was touched.
- Current generated documentation evidence is 38 guides, 840/840 current localized screenshots and 100 planned OBS cases across 25 profiles. OBS records remain 0, visual review remains pending and `coverageComplete` here covers only the guide screenshot set. Historical release, audit and OBS evidence were not treated as current acceptance.

## Changed areas

- Catalog and product inputs: `plugin-store.json`, root `package.json`, `features/`, `plugins.html`, root locales, `sitemap.xml`, `features/catalog-data.js`, screenshot specs/manifests.
- Guides and current docs: `scripts/plugin-guides/`, tutorial/catalog generators, app wiki and translation docs, `docs/SNAPSHOT_STATUS.md` (four locale copies), `infos/llm_start_here.md`, generated guide/gallery outputs.
- Active OBS source generators/tests: `scripts/lib/obs-docs-capture-inventory.js`, selected `scripts/obs-pilot/` generators and their current test. Generated current matrix now reports 100 cases / 25 profiles; archived audit receipts remain untouched.
- Runtime plugin implementation, package archive, focused tests and screenshots removed by the coordinated Chatango owner. Existing user/test preference data was retained.

## Checks

- Passed: 6 focused Jest suites, 67/67 tests, including gallery, published catalog, tutorial workflow, guide capture evidence, docs E2E, Chatango-removal regression and current OBS matrix contracts.
- Passed: feature-hub / tutorial / QA gallery generators; OBS current matrix (100/25) and renderer inventory; JSON parsing for edited registry, locales and root package; `git diff --check`.
- Generated gallery reports 840 expected, 840 receipts, 840 raw outputs, 840 current-valid, 0 stale/missing/invalid/incomplete, 100 OBS expected and 0 OBS records, with review pending.

## Remaining risks / open coordination

- A direct public screenshot verifier still fails on pre-existing WebGPU Weather Control locale images: de/es/fr are absent and the English image is 1920×1080 instead of the declared 1280×800. Those unrelated images were not regenerated. The store manifest declares 292 outputs after Chatango removal, while this verifier's fixed count was reduced accordingly; the per-asset verifier reaches and reports the above existing gaps.
- The app's public plugin manager and server are owned by a parallel rights owner and retain separate Chatango-related code references there. The profile-preservation hook and saved test profile deliberately retain stale Chatango data to avoid deleting user preferences. These do not cause Chatango to appear in the current published catalog.
- Active OBS plans are source inventories only; no OBS, browser-based product capture, user-visible live flow or human image review was run. Do not interpret the 100-case plan as completed OBS acceptance.
- The separate profile/data bug assignment (LIVE-002/006/012/027/028) remains parked pending CEO prioritization.
