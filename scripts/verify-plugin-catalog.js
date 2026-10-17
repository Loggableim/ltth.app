'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'plugins.html'), 'utf8');
const store = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
const allowlist = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'public-plugin-allowlist.json'), 'utf8'));
const releasePolicy = JSON.parse(fs.readFileSync(path.join(root, 'app', 'config', 'plugin-release-policy.json'), 'utf8'));
const pagesBuilder = fs.readFileSync(path.join(root, 'scripts', 'build_pages_bundle.py'), 'utf8');
const errors = [];
const catalog = page.match(/<div id="plugin-store-grid" class="plugin-catalog-list"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/section>/);
const publicIds = Array.isArray(allowlist.publicPluginIds) ? allowlist.publicPluginIds : [];
const storeIds = Array.isArray(store.plugins) ? store.plugins.map((plugin) => plugin.id) : [];
const excludedIds = new Set([
  ...(Array.isArray(releasePolicy.closedBeta) ? releasePolicy.closedBeta : []),
  ...Object.keys(releasePolicy.aliases || {}),
  'chatango'
]);

if (allowlist.schemaVersion !== 1 || new Set(publicIds).size !== publicIds.length || !publicIds.length) {
  errors.push('The public plugin allowlist must use schema version 1 and contain unique plugin IDs');
}
if (storeIds.length !== publicIds.length || publicIds.some((id) => !storeIds.includes(id))) {
  errors.push('plugin-store.json must contain exactly the canonical public plugin allowlist');
}
for (const plugin of store.plugins || []) {
  if (excludedIds.has(plugin.id)) {
    errors.push(`plugin-store.json must not expose closed-beta or retired plugin ${plugin.id}`);
  }
  try {
    const packageUrl = new URL(plugin.packageUrl);
    const expectedPath = `/plugin-store/packages/${plugin.id}-${plugin.version}.zip`;
    if (packageUrl.origin !== 'https://ltth.app' || packageUrl.pathname !== expectedPath || packageUrl.search || packageUrl.hash) {
      errors.push(`Public package URL for ${plugin.id} must match its own ID and version`);
    }
  } catch (error) {
    errors.push(`Public package URL for ${plugin.id} is invalid`);
  }
}

if (!catalog) {
  errors.push('plugins.html must contain a static plugin-store-grid fallback');
} else {
  const markup = catalog[1];
  if (!/<div class="plugin-catalog-grid" data-static-plugin-catalog>/.test(markup)) {
    errors.push('Static cards must be grouped in a compact grid, separate from dynamic categories');
  }
  const fallbackCards = (markup.match(/data-plugin-id="/g) || []).length;
  if (fallbackCards !== publicIds.length) {
    errors.push(`Expected ${publicIds.length} static plugin cards, found ${fallbackCards}`);
  }
  for (const id of publicIds) {
    if (!markup.includes(`data-plugin-id="${id}"`)) {
      errors.push(`Missing static card for ${id}`);
    }
  }
  for (const id of excludedIds) {
    if (markup.includes(`data-plugin-id="${id}"`)) {
      errors.push(`The public fallback must not show a store card for ${id}`);
    }
  }
}

const betaSection = page.match(/<section[^>]+id="plugin-store-closed-beta"[^>]*>([\s\S]*?)<\/section>/);
if (!betaSection) {
  errors.push('plugins.html must show a separate closed-beta notice');
} else {
  const betaMarkup = betaSection[1];
  const betaIds = [...betaMarkup.matchAll(/data-closed-beta-id="([^"]+)"/g)].map((match) => match[1]);
  if (betaIds.length !== releasePolicy.closedBeta.length || releasePolicy.closedBeta.some((id) => !betaIds.includes(id))) {
    errors.push('The closed-beta notice must list every policy ID exactly once');
  }
  for (const key of ['homeV2.closedBeta.eyebrow', 'homeV2.closedBeta.title', 'homeV2.closedBeta.description', 'homeV2.closedBeta.listLabel']) {
    if (!betaMarkup.includes(`data-i18n="${key}"`)) errors.push(`Closed-beta notice is missing locale key ${key}`);
  }
  if (!/Coming Soon/i.test(betaMarkup) || /<a\b|\.zip|packageUrl/i.test(betaMarkup)) {
    errors.push('Closed-beta apps must be marked Coming Soon without any package links');
  }
}

if (!/function renderPluginStore\(/.test(page)) {
  errors.push('plugins.html must retain client-side catalog localization');
}
if (!page.includes("const PUBLIC_PLUGIN_ALLOWLIST_URL = '/scripts/public-plugin-allowlist.json'")) {
  errors.push('The browser catalog must load the same public plugin allowlist as the Pages verifier');
}
if (!pagesBuilder.includes('"scripts/public-plugin-allowlist.json"')) {
  errors.push('The Pages bundle must publish the allowlist used by the browser catalog');
}
if (!page.includes('publicPluginIds.has(plugin.id)') || !page.includes('publicPluginIds.has(tutorial.id)')) {
  errors.push('Both plugin and guide cards must be filtered by the canonical public plugin allowlist');
}
if (!page.includes('function normalizePublicPackageUrl(') || !page.includes('pluginId}-${version}.zip')) {
  errors.push('Dynamic package links must match the ID and version of their public card');
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
