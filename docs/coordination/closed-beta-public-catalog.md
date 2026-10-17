# Closed-beta public catalog status

Date: 2026-10-07

## Finding and implementation

- `plugin-store.json` and the `plugins.html` no-JavaScript fallback still offered all 11 IDs in `app/config/plugin-release-policy.json`, including public package URLs.
- Removed those 11 entries from the public registry and 11 static fallback cards in `plugins.html`. The 11 app manifests and local package archives remain present.
- The published-catalog helper now reads the release policy as a required, strict input. It filters closed-beta app manifests and aliases from public IDs; missing Store records are tolerated only for closed-beta source manifests. Public source manifests and public store entries still require matching records. BOM-prefixed policy JSON is supported; invalid schema, IDs, aliases, unknown keys, or JSON fail closed.
- Public tutorial sources/generators and OBS guide inventory derive from the filtered catalog. The active catalog has 26 public runtime manifests plus Store Admin (27 guides), 612 localized tutorial screenshots, and 17 public overlay guides (68 OBS targets).
- Stream Monsters synchronization does not project a missing closed-beta listing back into `plugin-store.json`.

## Checks

- Passed: `verify-plugin-catalog.js`, `verify-plugin-tutorial-source.js`, `verify-plugin-docs.js`, `sync-streammonsters-product.js --check`.
- Passed: final focused Jest batch, 7 suites / 61 tests passed, 17 skipped by the targeted test-name filter. Coverage included published catalog policy, docs gallery, tutorial workflows, OBS inventory/batch, Stream Monsters closed-beta sync predicate, and public store registry policy.
- Current gallery: 27 guides; 612 expected, received, and valid localized screenshots; 68 OBS targets and 0 OBS records; human review remains pending.
- Registry and fallback cards are aligned at 24 IDs. None of the 11 policy IDs are in either public list.

## Scope and remaining limits

- Local plugin code, 11 source manifests, and package ZIPs were preserved; this change removed public listing and URL fields only.
- Static closed-beta fallback cards were removed from `plugins.html`. Existing dynamic feature-page and logo lookup maps remain inert without a public catalog record; ownership of the broader website hub and marketing pages remains separate.
- OBS targets are inventory only; no OBS capture, product browser acceptance, or visual review was run.
- Test runs that spawn child Node processes can fail with the host's `spawnSync EPERM`; direct generator and sync CLI checks passed, and relevant pure-policy tests passed without subprocesses.
