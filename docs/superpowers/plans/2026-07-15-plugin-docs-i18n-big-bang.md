# LTTH Plugin Manuals and i18n Big-Bang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a single verified PR containing complete DE/EN/ES/FR plugin manuals, complete plugin-surface localization, isolated workflow evidence, and real OBS previews for 37 published plugins plus Store Admin.

**Architecture:** A canonical published-plugin catalog drives guide, UI, locale, screenshot, receipt, and OBS coverage. Per-plugin guide modules own editorial content and operational workflows. Isolated browser profiles provide reproducible local-only evidence; one scoped OBS session owns the temporary `LTTH Docs Capture` source and restores scene `tutorial` exactly.

**Tech Stack:** Node.js CommonJS, Jest, Express/Socket.IO, Puppeteer, OBS WebSocket/Computer Use, static HTML and JSON locale bundles, GitHub Actions.

## Global Constraints

- The catalog is 37 published plugin manifests plus virtual `store-admin`, yielding exactly 38 guide ids.
- Supported languages are exactly `de`, `en`, `es`, and `fr`; German is only the static documentation fallback.
- Do not alter public routes, DOM ids, config keys, or plugin behavior.
- Every plugin UI key is `plugins.<plugin-id>.*`; shared user-facing labels are `common.*`; `generated.*` is forbidden on plugin and guide surfaces.
- Capture profiles use only localhost and never trigger hardware, accounts, external services, streaming, recording, or productive outputs.
- Browser captures start from fresh 1440x900 profiles. OBS captures use declared overlay dimensions, one temporary source named `LTTH Docs Capture`, and only scene `tutorial`.
- Do not merge, deploy, or publish any partial catalog. A critical post-merge error requires reverting the single merge, not individual guides.

## Task 1: Canonical published catalog

**Files:**
- Create: `scripts/lib/published-plugin-catalog.js`
- Modify: `scripts/plugin-tutorial-source.js`, `scripts/verify-plugin-tutorial-source.js`, `scripts/verify-plugin-docs.js`
- Create: `app/test/published-plugin-catalog.test.js`

**Interfaces:** `loadPublishedPluginCatalog(repoRoot)` returns `{ plugins, manifestIds, storeIds, guideIds }`, with `guideIds` equal to all manifest ids plus `store-admin`.

- [ ] Write the failing test.

```js
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
test('requires one guide per published plugin plus Store Admin', () => {
  const catalog = loadPublishedPluginCatalog(repoRoot);
  expect(catalog.guideIds).toHaveLength(38);
  expect(catalog.guideIds).toContain('store-admin');
  expect(new Set(catalog.guideIds).size).toBe(38);
});
```

- [ ] Run `cd app && npm test -- --runInBand test/published-plugin-catalog.test.js`; expect a missing-module failure.
- [ ] Implement catalog loading from `app/plugins/*/plugin.json`, `plugin-store/sources/*/plugin.json`, and `plugin-store.json`; reject duplicate ids, removed manifest/registry pairs, and stale source-only exceptions.

```js
return {
  plugins: manifests.sort(compareById),
  manifestIds: manifests.map(({ id }) => id),
  storeIds: [...storeIds].sort(),
  guideIds: [...manifests.map(({ id }) => id).sort(), 'store-admin']
};
```

- [ ] Replace length-based guide checks with exact sorted equality to `catalog.guideIds`.
- [ ] Run `cd app && npm test -- --runInBand test/published-plugin-catalog.test.js test/plugin-guide-ownership.test.js` and `npm run docs:plugins:source:check`; expect exact catalog equality.
- [ ] Commit: `git commit -m "test: lock published plugin guide catalog"`.

## Task 2: Complete visible UI localization audit

**Files:**
- Create: `scripts/lib/plugin-ui-i18n-audit.js`, `app/test/plugin-ui-i18n-audit.test.js`
- Modify: `scripts/lib/plugin-i18n-audit.js`, `scripts/verify-plugin-i18n.js`, `app/modules/i18n.js`, `app/test/plugin-i18n-runtime-namespace.test.js`

**Interfaces:** `auditPluginUi({ repoRoot, catalog })` returns `{ errors, controlsByPlugin, keysByPlugin }`. Every real label, button, option, placeholder, dialog, toast, error, tooltip, title, and ARIA value is classified as `translated`, `common`, `decorative`, or `internal`.

- [ ] Write fixture tests for an unkeyed `<button>`, missing locale leaf, invalid interpolation, malformed UTF-8, permitted protocol label, and translation collision.

```js
expect(auditPluginUi({ repoRoot: fixtureRoot, catalog }).errors).toEqual(expect.arrayContaining([
  expect.stringContaining('missing data-i18n key'),
  expect.stringContaining('parameter mismatch'),
  expect.stringContaining('malformed UTF-8')
]));
```

- [ ] Run `cd app && npm test -- --runInBand test/plugin-ui-i18n-audit.test.js`; expect a missing-module failure.
- [ ] Parse real HTML plus local JS bindings. Accept invariant commands, URLs, paths, units, brands, and protocols only through a finite `INVARIANT_VALUES` list.

```js
function assertPluginKey(pluginId, key) {
  if (key.startsWith('common.')) return;
  if (key.startsWith('generated.') || !key.startsWith(`plugins.${pluginId}.`)) {
    throw new Error(`${pluginId}: invalid UI key ${key}`);
  }
}
```

- [ ] Compare all four flattened locale maps; reject missing leaves, equal non-invariant copy, `${...}` artifacts, `\uFFFD`, malformed UTF-8 byte patterns, and differing interpolation tokens.
- [ ] Keep `I18n.mergeTranslationSource()` fail-fast and test that its error includes both source filenames.
- [ ] Wire the audit into `npm run plugins:i18n:check`; run its Jest suite plus `test/plugin-i18n-audit.test.js` and `test/plugin-i18n-runtime-namespace.test.js`.
- [ ] Commit: `git commit -m "test: enforce complete plugin UI localization"`.

## Task 3: Migrate the 37 plugin surfaces

**Files:**
- Modify: affected `app/plugins/**/{*.html,*.js,locales/{de,en,es,fr}.json}` and `plugin-store/sources/visual-fx-frame-webgpu/**`
- Modify: `app/locales/literal-inventory.json`, `app/test/soundboard-export-import.test.js`, `app/test/lastevent-text-encoding.test.js`
- Create: `app/test/plugin-ui-i18n-contract.test.js`

- [ ] Add failing tests for the observed namespace and encoding regressions.

```js
expect(readPluginLocale('soundboard', locale).plugins.soundboard.animations.export).toBeTruthy();
expect(read('plugins/stt-ticker/ui.html')).not.toMatch(/[ÃÂ][\u0080-\u00BF]|â[\u0080-\u00BF]/);
```

- [ ] Run `cd app && npm test -- --runInBand test/soundboard-export-import.test.js test/lastevent-text-encoding.test.js`; expect the current Soundboard CI failure before changing it.
- [ ] For each catalog plugin, use the Task 2 report to replace raw/generated UI bindings with semantic `plugins.<id>.<area>.<name>` keys and write independent DE/EN/ES/FR values. Consolidate genuine common controls below `common.*` only.
- [ ] Correct every malformed static string, including STT Ticker text, and regenerate the literal inventory using the repository inventory command.
- [ ] Update tests to assert `localeData.plugins.soundboard.animations`, never restore `localeData.soundboard`.
- [ ] Run `npm run plugins:i18n:check` and `cd app && npm test -- --runInBand --silent test/plugin-ui-i18n-contract.test.js test/soundboard-export-import.test.js test/lastevent-text-encoding.test.js test/i18n-consistency.test.js`; expect all pass.
- [ ] Commit: `git commit -m "feat: complete plugin surface localization"`.

## Task 4: Complete non-generic guide definitions

**Files:**
- Create: `scripts/lib/guide-definition.js`, `app/test/guide-definition-contract.test.js`
- Modify: `scripts/plugin-tutorial-source.js`, `scripts/lib/plugin-guide-ui-inventory.js`, `scripts/build-plugin-docs.js`, every `scripts/plugin-guides/*.js`, every `locales/guides/*.json`, `app/test/plugin-guide-definition-rendering.test.js`

**Interfaces:** A `GuideDefinition` has `purpose`, `audience`, `version`, `requirements`, `safety`, `goldenPath`, `settings`, `integrations`, and `troubleshooting`. Each setting is `{ selector, section, purpose, defaultValue, values, dependencies, classification }`.

- [ ] Write failing tests that reject a missing control mapping and generic prose.

```js
expect(() => validateGuideDefinition(genericGuide, catalogEntry, inventory))
  .toThrow('generic setting prose is forbidden');
```

- [ ] Run `cd app && npm test -- --runInBand test/guide-definition-contract.test.js`; expect failure.
- [ ] Implement `validateGuideDefinition()` with `classification` limited to `documented`, `decorative`, or `internal`; every visible control must have exactly one classification.
- [ ] Reject `Das sichtbare Feld oder die Aktion`, `text or value shown in the control`, and `not declared` in guide locale payloads.
- [ ] Author true purpose/default/range/dependency values and complete REST, socket, command, flow-action, overlay, storage, import/export, LIVE, hardware, account, and troubleshooting content in all four languages for each guide.
- [ ] Run `npm run docs:plugins:build`, `npm run docs:plugins:source:check`, `npm run docs:plugins:check`, and focused guide tests; expect 38 pages with no generic control prose.
- [ ] Commit: `git commit -m "docs: complete plugin guide definitions"`.

## Task 5: Isolated workflow and CaptureReceipt evidence

**Files:**
- Modify: `scripts/docs-screenshot-spec.js`, `scripts/capture-product-screenshots.js`, `scripts/lib/capture-receipt.js`, `scripts/lib/docs-capture-plugin-fixture.js`, `scripts/verify-docs-screenshot-coverage.js`
- Create: `scripts/verify-docs-capture-receipts.js`, `app/test/docs-capture-network-policy.test.js`
- Modify: `app/test/capture-receipt-workflow.test.js`, `app/test/docs-capture-real-workflows.test.js`

**Interfaces:** A `CaptureReceipt` includes `plugin`, `language`, `route`, `operations`, `postconditions`, `screenshotPath`, `sha256`, `appVersion`, `network`, `console`, and optional `overlay` evidence.

- [ ] Add failing tests for external network evidence and console errors.

```js
expect(() => verifyReceipt({ network: ['https://example.com'] })).toThrow('external network request');
expect(() => verifyReceipt({ console: ['ReferenceError'] })).toThrow('browser console error');
```

- [ ] Run the test; expect it to fail because current receipts omit mandatory network/console data.
- [ ] Record requests and console/page errors per capture. Reject every origin except `http://127.0.0.1:*` and `http://localhost:*`.
- [ ] Expand each guide to real `goto`, `click`, `fill`, `select`, `check`, `submit`, local API, and local socket operations where applicable; take an image after each state-changing operation, per setting group, and after the verified result.
- [ ] Remove stale screenshot files and orphan manifest entries before writing the new manifest.
- [ ] Run `npm run docs:screenshots`, `npm run docs:screenshots:check`, `node scripts/verify-docs-capture-receipts.js`, and focused capture tests; expect all receipts to pass with localhost-only traffic.
- [ ] Commit: `git commit -m "test: verify isolated plugin documentation workflows"`.

## Task 6: Real OBS capture lifecycle

**Files:**
- Create: `scripts/lib/obs-docs-capture.js`, `scripts/verify-obs-docs-capture.js`, `app/test/obs-docs-capture-contract.test.js`, `screenshots/docs-obs-capture-report.json`
- Modify: `scripts/capture-product-screenshots.js`, `scripts/docs-screenshot-spec.js`, `scripts/verify-docs-screenshot-coverage.js`

**Interfaces:** `ObsDocsCaptureSession.capture({ plugin, locale, overlayUrl, width, height })` returns `{ screenshotPath, sourceName: 'LTTH Docs Capture', visible, width, height, nonEmpty, restored }`; `close()` removes only that source and proves the original `tutorial` scene source list.

- [ ] Write a fake-OBS test which creates exactly one source then returns to an equal source list after `close()`.
- [ ] Run `cd app && npm test -- --runInBand test/obs-docs-capture-contract.test.js`; expect a missing-module failure.
- [ ] Implement baseline recording and a `CreateInput` browser source using the exact name `LTTH Docs Capture`; reject a pre-existing temp source, any non-`tutorial` scene, and all stream/record APIs.

```js
await obs.call('CreateInput', {
  sceneName: 'tutorial', inputName: 'LTTH Docs Capture', inputKind: 'browser_source',
  inputSettings: { url: overlayUrl, width, height }, sceneItemEnabled: true
});
```

- [ ] Assert source visibility, configured dimensions, non-empty output, and post-removal equality to the baseline. Add an OBS preview asset for every overlay guide and language.
- [ ] Run the non-streaming live session, generate `screenshots/docs-obs-capture-report.json`, and run `node scripts/verify-obs-docs-capture.js`; expect `restored: true` for all records.
- [ ] Commit: `git commit -m "docs: capture verified OBS overlay previews"`.

## Task 7: Gallery, full verification, PR, merge, and live check

**Files:**
- Create: `scripts/build-plugin-docs-gallery.js`, `scripts/verify-plugin-docs-gallery.js`, `scripts/verify-live-plugin-docs.js`, `docs/plugin-docs-qa/index.html`, `docs/plugin-docs-qa/report.json`, `docs/plugin-docs-qa/live-report.json`, `app/test/plugin-docs-gallery.test.js`, `app/test/live-plugin-docs.test.js`
- Modify: `package.json`, PR #118 title/body/checklist

- [ ] Write a gallery test that requires 38 guides, four languages, passing receipts, and an OBS record per overlay guide.
- [ ] Build a filterable local gallery with each language, image, route, receipt, hash, and OBS preview; its report must contain `reviewStatus: 'approved'` only after manual visual review.
- [ ] Run the required local gates in order:

```powershell
npm run plugins:i18n:check
npm run docs:plugins:source:check
npm run docs:plugins:build
npm run docs:plugins:check
npm run docs:screenshots
npm run docs:screenshots:check
npm run docs:e2e
npm run website:locales:check
npm run website:plugins:check
cd app; npm test -- --runInBand --silent; npm run build:css; npm run lint
cd ..; git diff --check
```

- [ ] Update PR #118 while remaining Draft with the catalog, gallery, OBS report, command results, and whole-PR rollback condition. Repair the Soundboard CI test before requesting new checks.
- [ ] Implement a clean-context live verifier that fetches and renders all 152 `https://ltth.app/docs/plugins/<id>.html?lang=<locale>` variants, checking status, localized rendered text, images, links, canonical, hreflang, and responsive layout.
- [ ] Merge only after every GitHub check is green. Run the live verifier after deployment, visually confirm key guides/screenshots/OBS previews in Browser, and revert the complete merge if a critical live assertion fails.
- [ ] Commit gallery/live-verifier source before merge: `git commit -m "test: verify localized plugin docs in production"`.

## Plan Self-Review

- Catalog drift is covered by Task 1; full visible plugin i18n, collisions, generated-key removal, mojibake, and interpolation by Tasks 2–3.
- Complete manuals and visible-control mapping are covered by Task 4; isolated real workflows and receipts by Task 5.
- The single temporary OBS source and exact restoration are covered by Task 6.
- All required commands, local visual gallery, one Draft PR, production checks of 152 variants, and full rollback are covered by Task 7.
