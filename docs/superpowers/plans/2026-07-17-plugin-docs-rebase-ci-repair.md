# Plugin Documentation Rebase CI Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the rebased localized-plugin-documentation PR pass its catalog and i18n regression checks without discarding current LTTH runtime behavior.

**Architecture:** The guide catalog treats `app/plugins/<id>/plugin.json` as the canonical runtime manifest when a matching store-source copy exists, while Store Admin remains source-only. The i18n checks then validate current runtime helper names and real localized text rather than an obsolete pre-rebase implementation detail.

**Tech Stack:** Node.js CommonJS, Jest, JSON locale files.

## Global Constraints

- Preserve all `origin/main` runtime behavior introduced after the PR base.
- Keep exactly 38 plugin manifests and 39 guide IDs including Store Admin.
- Do not remove the `plugin-store/sources/visual-fx-frame-webgpu` source; it is still covered by its own plugin tests.
- Preserve OSC placeholders `{name}`, `{diamonds}`, and `{id}` in every translation.

---

### Task 1: Deduplicate mirrored runtime and store-source manifests

**Files:**

- Modify: `app/test/published-plugin-catalog.test.js`
- Modify: `scripts/lib/published-plugin-catalog.js`

**Interfaces:**

- Consumes: `readManifestDirectory()` results from `app/plugins/` and `plugin-store/sources/`.
- Produces: a `catalog.plugins` list with one canonical manifest per plugin ID and a source-only `storeAdmin` entry.

- [ ] **Step 1: Add the failing catalog-selection regression test**

```js
test('uses the runtime manifest once when a store source mirrors the same plugin', () => {
  const catalog = loadPublishedPluginCatalog(repoRoot);
  const visualFxManifests = catalog.plugins.filter((plugin) => plugin.id === 'visual-fx-frame-webgpu');

  expect(visualFxManifests).toHaveLength(1);
  expect(visualFxManifests[0].manifestPath)
    .toMatch(/app[\\/]plugins[\\/]visual-fx-frame-webgpu[\\/]plugin\.json$/);
});
```

- [ ] **Step 2: Run the test and verify the existing duplicate-manifest failure**

Run: `cd app && npm test -- --runInBand --silent test/published-plugin-catalog.test.js`

Expected: FAIL with `Duplicate published plugin manifest id: visual-fx-frame-webgpu`.

- [ ] **Step 3: Keep app manifests canonical and omit their mirrored store-source copies from `plugins`**

```js
for (const [id, manifest] of sourceById) {
  if (!storeIds.includes(id)) {
    throw new Error(`Store source manifest ${id} is missing from plugin-store.json`);
  }
}

const plugins = [
  ...appManifests,
  ...storeSourceManifests.filter((manifest) => (
    manifest.id !== 'store-admin' && !appById.has(manifest.id)
  ))
].sort(compareById);
```

- [ ] **Step 4: Re-run the catalog test**

Run: `cd app && npm test -- --runInBand --silent test/published-plugin-catalog.test.js`

Expected: PASS with two tests and 39 unique guide IDs.

### Task 2: Align localized UI contracts with current runtime behavior

**Files:**

- Modify: `app/test/clarityhud-ui-i18n.test.js`
- Modify: `app/plugins/osc-bridge/locales/es.json`

**Interfaces:**

- Consumes: ClarityHUD's existing `runtimeText(key, fallback, params = {})` helper and OSC Bridge's namespaced locale tree.
- Produces: tests that assert the active helper and Spanish copy whose localized option text retains all runtime placeholders.

- [ ] **Step 1: Run the existing targeted contracts to capture the two failures**

Run: `cd app && npm test -- --runInBand --silent test/clarityhud-ui-i18n.test.js test/osc-bridge-plugin-i18n.test.js`

Expected: FAIL because the ClarityHUD test expects removed `translateRuntime` text and `gift_catalog.option` is copied from English in Spanish.

- [ ] **Step 2: Assert the active ClarityHUD helper and translate the OSC option**

```js
expect(source).toContain('function runtimeText(key, fallback, params = {})');
expect(source).toContain("runtimeText('status.settings_updated'");
expect(source).toContain("runtimeText('toast.url_copied'");
expect(source).toContain("runtimeText('toast.test_event_sent'");
expect(source).toContain("runtimeText('dialog.preset_name'");
expect(source).toContain("runtimeText('dialog.reset_confirm'");
expect(source).toContain("runtimeText('empty.no_additional_streams'");
expect(source).toContain("runtimeText('stream.fallback'");
```

```json
"option": "{name} (💎 {diamonds}) · identificador: {id}"
```

- [ ] **Step 3: Re-run the two i18n contracts**

Run: `cd app && npm test -- --runInBand --silent test/clarityhud-ui-i18n.test.js test/osc-bridge-plugin-i18n.test.js`

Expected: PASS with every required locale leaf present and no user-facing Spanish value copied from English.

### Task 3: Validate the rebased guide suite and publish the repaired PR

**Files:**

- Verify: `app/test/plugin-tutorial-source-workflow.test.js`
- Verify: `app/test/plugin-guide-capture-contract.test.js`
- Verify: `app/test/plugin-docs-e2e.test.js`

**Interfaces:**

- Consumes: the deduplicated catalog and generated localized guide definitions.
- Produces: a CI-ready PR branch rebased on `origin/main`.

- [ ] **Step 1: Run the affected documentation and i18n suites**

Run: `cd app && npm test -- --runInBand --silent test/published-plugin-catalog.test.js test/clarityhud-ui-i18n.test.js test/osc-bridge-plugin-i18n.test.js test/plugin-tutorial-source-workflow.test.js test/plugin-guide-capture-contract.test.js test/plugin-docs-e2e.test.js`

Expected: PASS with zero failed suites.

- [ ] **Step 2: Check the integration diff and commit the repair**

Run:

```bash
git diff --check origin/main...HEAD
git add scripts/lib/published-plugin-catalog.js app/test/published-plugin-catalog.test.js app/test/clarityhud-ui-i18n.test.js app/plugins/osc-bridge/locales/es.json docs/superpowers/plans/2026-07-17-plugin-docs-rebase-ci-repair.md
git commit -m "fix(docs): repair rebased plugin guide checks"
```

Expected: a focused repair commit with no whitespace errors.

- [ ] **Step 3: Force-with-lease push the rebased PR branch**

Run: `git push --force-with-lease origin codex/plugin-docs-i18n-overhaul`

Expected: PR #118 updates to the rebased head and triggers a new Backend CI matrix.

## Implementation Record

- [x] Deduplicated mirrored Store source manifests, keeping the runtime plugin
  manifest canonical and Store Admin source-only.
- [x] Added a source-precedence regression so duplicate app/store locale trees
  cannot make startup fail with a translation collision.
- [x] Registered the Schnorrbecher guide and its isolated local test workflow.
- [x] Repaired stale post-rebase UI, locale, and workflow expectations against
  the current shipped runtime.
- [x] Made StoreAuth preserve an explicit signed-out state, so a signed-out
  Store Admin view does not make an unnecessary account request or navigate
  into the account bridge.
- [x] Updated the Puppeteer capture bootstrap, the Interactive Story locale
  review step, and the Store Admin review-only contract.
- [x] Rebuilt all localized guide files and verified 218 tutorial actions in
  four locales (872 distinct product captures).
- [x] Verified with the focused 10-suite regression run (181 tests), ESLint,
  `git diff --check`, and the full screenshot-coverage verifier.
