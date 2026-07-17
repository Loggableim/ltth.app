'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { LOCALES, buildGuides } = require('./plugin-tutorial-source');
const { loadPublishedPluginCatalog } = require('./lib/published-plugin-catalog');

const ROOT = path.resolve(__dirname, '..');
const guides = buildGuides(ROOT);
const catalog = loadPublishedPluginCatalog(ROOT);
const indexPath = path.join(ROOT, 'docs', 'plugins', 'index.json');
assert.ok(fs.existsSync(indexPath), 'Missing docs/plugins/index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const readLocale = (locale) => ({
  ...JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${locale}.json`), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', 'guides', `${locale}.json`), 'utf8'))
});

for (const locale of LOCALES) {
  const values = readLocale(locale);
  assert.ok(!Object.values(values).some((value) => typeof value === 'string' && value.includes('${')),
    `${locale} guide locale payload contains an unresolved source template expression`);
  for (const field of ['metaDescription', 'safeTitle', 'installTitle', 'installBody', 'profileTitle', 'profileBody', 'obsTitle', 'obsBody']) {
    assert.ok(values[`docs.hub.${field}`], `Missing ${locale} docs hub ${field}`);
  }
}

for (const guide of guides) {
  const pagePath = path.join(ROOT, 'docs', 'plugins', `${guide.id}.html`);
  assert.ok(fs.existsSync(pagePath), `Missing tutorial page: ${guide.id}`);
  const page = fs.readFileSync(pagePath, 'utf8');
  assert.ok(!page.includes('${'), `${guide.id} rendered an unresolved source template expression`);
  assert.ok(page.includes('plugin-doc-toc'), `${guide.id} needs a tutorial table of contents`);
  assert.ok(page.includes('plugin-doc-first-result'), `${guide.id} needs a concrete first-result block`);
  assert.ok(page.includes('plugin-doc-safety'), `${guide.id} needs a safety block`);
  assert.ok(page.includes(`<link rel="canonical" href="https://ltth.app/docs/plugins/${guide.id}.html">`), `${guide.id} needs its canonical URL`);
  assert.ok(page.includes('meta property="og:title"') && page.includes('meta property="og:description"'), `${guide.id} needs Open Graph metadata`);
  for (const locale of LOCALES) assert.ok(page.includes(`hreflang="${locale}"`), `${guide.id} needs ${locale} hreflang metadata`);
  assert.ok(!page.includes('docsPlugin='), `${guide.id} must not retain ignored docsPlugin capture URLs`);
  assert.ok(index.some((item) => item.id === guide.id), `Missing index entry: ${guide.id}`);
  for (const step of guide.steps) {
    assert.ok(page.includes(`data-step-id="${step.id}"`), `${guide.id}/${step.id} needs a rendered step`);
  }
  if (guide.overlay) assert.ok(page.includes('plugin-doc-obs'), `${guide.id} needs an OBS/overlay section`);
  for (const locale of LOCALES) {
    const values = readLocale(locale);
    for (const field of ['title', 'summary', 'firstResult', 'requirements', 'safety', 'troubleshooting']) {
      assert.ok(values[`docs.plugin.${guide.id}.${field}`], `Missing ${locale} ${guide.id} ${field}`);
    }
    for (const step of guide.steps) {
      for (const field of ['title', 'body', 'expected', 'alt', 'src', 'caption']) {
        assert.ok(values[`docs.plugin.${guide.id}.steps.${step.id}.${field}`], `Missing ${locale} ${guide.id}/${step.id} ${field}`);
      }
      const stepIndex = guide.steps.findIndex((candidate) => candidate.id === step.id) + 1;
      assert.ok(values[`docs.plugin.${guide.id}.steps.${step.id}.caption`].startsWith(`${stepIndex}. `), `${locale} ${guide.id}/${step.id} caption must use its guide step number`);
    }
    const status = values[`docs.plugin.${guide.id}.status`];
    assert.notStrictEqual(status, guide.devStatus, `${locale} ${guide.id} status must be localized instead of exposing the raw manifest status`);
  }
}

assert.deepStrictEqual(index.map((item) => item.id).sort(), catalog.guideIds, 'Search index must contain exactly the current guide inventory');
console.log(`OK: ${guides.length} detailed plugin guides, four locales, generated pages, and search index coverage.`);
