'use strict';

const { LOCALES, buildCatalog } = require('./plugin-tutorial-catalog');

const SPEC_VERSION = '2026-07-11-plugin-docs-v1';

function buildDocsSpec(repoRoot) {
  const catalog = buildCatalog(repoRoot);
  return {
    version: SPEC_VERSION,
    collection: 'docs',
    source: 'current-workspace',
    theme: 'cid',
    locales: LOCALES,
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    assets: catalog.flatMap((tutorial) => Object.keys(tutorial.steps).map((step, index) => ({
      id: `${tutorial.id}__${step}`,
      canonical: `/screenshots/docs/plugins/${tutorial.id}/${step}.png`,
      // Capture every numbered action from the deterministic Plugin Manager
      // test surface. It is the only route available for disabled, hardware,
      // subscriber-only, and development plugins alike; no LIVE account or
      // external device is touched while recording the documentation set.
      route: `/dashboard.html?view=plugins&docsPlugin=${encodeURIComponent(tutorial.id)}`,
      state: 'isolated-demo-profile',
      viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }
    })))
  };
}

module.exports = { SPEC_VERSION, LOCALES, buildDocsSpec };
