'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'plugins.html'), 'utf8');
const store = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
const errors = [];
const catalog = page.match(/<div id="plugin-store-grid" class="plugin-catalog-list"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/);

if (!catalog) {
  errors.push('plugins.html must contain a static plugin-store-grid fallback');
} else {
  const markup = catalog[1];
  if (!/<div class="plugin-catalog-grid" data-static-plugin-catalog>/.test(markup)) {
    errors.push('Static cards must be grouped in a compact grid, separate from dynamic categories');
  }
  const fallbackCards = (markup.match(/data-plugin-id="/g) || []).length;
  if (fallbackCards !== store.plugins.length) {
    errors.push(`Expected ${store.plugins.length} static plugin cards, found ${fallbackCards}`);
  }
  for (const plugin of store.plugins) {
    if (!markup.includes(`data-plugin-id="${plugin.id}"`)) {
      errors.push(`Missing static card for ${plugin.id}`);
    }
  }
}

if (!/function renderPluginStore\(/.test(page)) {
  errors.push('plugins.html must retain client-side catalog localization');
}
if (/<p[^>]+id="plugin-store-status"[^>]+data-i18n=/.test(page)) {
  errors.push('The dynamic plugin-store status must not be overwritten by the generic page translator');
}
if (/\$\{core\.length\}\s*\$\{getText\(locale, 'sourceCore'\)/.test(page)) {
  errors.push('Catalog category counts must use localized plural copy');
}
if (/screenshotList\[0\]/.test(page)) {
  errors.push('catalog cards must not load full tutorial screenshots');
}
const renderedPage = page.replace(/<template\s+data-legacy-plugin-showcase>[\s\S]*?<\/template>/, '');
if (/\/screenshots\/features\//.test(renderedPage)) {
  errors.push('plugins.html must not repeat feature screenshots outside the individual tutorials');
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: the plugin catalog has a complete static fallback and lightweight interactive cards.');
}
