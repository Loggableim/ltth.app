'use strict';

const fs = require('fs');
const path = require('path');
const { LOCALES, buildCatalog } = require('./plugin-tutorial-catalog');
const ROOT = path.resolve(__dirname, '..');
const catalog = buildCatalog(ROOT);
const errors = [];
if (catalog.length !== 37) errors.push(`Expected 37 tutorials, found ${catalog.length}`);
const indexPath = path.join(ROOT, 'docs', 'plugins', 'index.json');
if (!fs.existsSync(indexPath)) errors.push('Missing docs/plugins/index.json');
const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
for (const tutorial of catalog) {
  const page = path.join(ROOT, 'docs', 'plugins', `${tutorial.id}.html`);
  if (!fs.existsSync(page)) errors.push(`Missing tutorial page: ${tutorial.id}`);
  if (!index.some((item) => item.id === tutorial.id)) errors.push(`Missing index entry: ${tutorial.id}`);
  for (const locale of LOCALES) {
    const localeData = JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${locale}.json`), 'utf8'));
    for (const step of Object.keys(tutorial.steps)) {
      for (const suffix of ['title', 'body', 'expected', 'caption', 'alt', 'src']) {
        if (!localeData[`docs.plugin.${tutorial.id}.steps.${step}.${suffix}`]) errors.push(`Missing ${locale} step copy: ${tutorial.id}/${step}/${suffix}`);
      }
    }
  }
}
const pluginsPage = fs.readFileSync(path.join(ROOT, 'plugins.html'), 'utf8');
if (!pluginsPage.includes('/docs/plugins/')) errors.push('plugins.html does not link to the tutorial URL pattern');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
for (const tutorial of catalog) if (!sitemap.includes(`/docs/plugins/${tutorial.id}.html`)) errors.push(`Missing sitemap URL: ${tutorial.id}`);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; } else console.log(`OK: ${catalog.length} plugin tutorials, four locales, links, and sitemap coverage.`);
