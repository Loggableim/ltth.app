#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parse5 = require(path.join(__dirname, '..', 'app', 'node_modules', 'parse5'));

const root = path.join(__dirname, '..');
const locales = ['en', 'de', 'es', 'fr'];
const skip = new Set(['.git', 'node_modules', 'docs_archive', '.superpowers', '.tmp_patch', '.tmp_patch2', 'naked', 'new_patch', 'released_patches', 'screenshots', 'build-src']);
const cache = new Map();

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skip.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (/\.html$/i.test(entry.name)) output.push(full);
  }
  return output;
}

function localeDirectory(file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  if (relative.startsWith('app/plugins/')) return path.join(root, 'app', 'plugins', relative.split('/')[2], 'locales');
  if (relative.startsWith('plugins/')) return path.join(root, 'plugins', relative.split('/')[1], 'locales');
  if (relative.startsWith('app/')) return path.join(root, 'app', 'locales');
  return path.join(root, 'locales');
}

function flatten(value, prefix = '', output = new Map()) {
  for (const [key, child] of Object.entries(value || {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, output);
    else if (typeof child === 'string') output.set(full, child);
  }
  return output;
}

function nestedSet(object, key, value) {
  const parts = key.split('.');
  let target = object;
  parts.slice(0, -1).forEach(part => {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  });
  target[parts[parts.length - 1]] = value;
}

function textContent(node) {
  if (!node) return '';
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

function load(directory) {
  if (cache.has(directory)) return cache.get(directory);
  const values = Object.fromEntries(locales.map(locale => {
    const file = path.join(directory, `${locale}.json`);
    return [locale, JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))];
  }));
  const maps = Object.fromEntries(locales.map(locale => [locale, flatten(values[locale])]));
  const reverse = Object.fromEntries(locales.map(locale => [locale, new Map()]));
  for (const locale of locales) for (const [key, value] of maps[locale]) {
    if (key.startsWith('generated.')) continue;
    const text = String(value).replace(/\s+/g, ' ').trim();
    if (text && !reverse[locale].has(text)) reverse[locale].set(text, key);
  }
  const result = { values, maps, reverse };
  cache.set(directory, result);
  return result;
}

let updated = 0;
for (const file of walk(root)) {
  const directory = localeDirectory(file);
  const state = load(directory);
  const document = parse5.parse(fs.readFileSync(file, 'utf8'));
  function visit(node) {
    if (!node || ['script', 'style', 'template', 'svg'].includes(String(node.nodeName || '').toLowerCase())) return;
    const marker = (node.attrs || []).find(attr => attr.name === 'data-i18n' && attr.value.startsWith('generated.'));
    if (marker) {
      const source = textContent(node).replace(/\s+/g, ' ').trim();
      const matched = locales.map(locale => state.reverse[locale].get(source)).find(Boolean);
      for (const locale of locales) {
        let value = source;
        if (matched && state.maps[locale].has(matched)) value = state.maps[locale].get(matched);
        nestedSet(state.values[locale], marker.value, value);
      }
      updated += 1;
      return;
    }
    (node.childNodes || []).forEach(visit);
  }
  visit(document);
}

for (const [directory, state] of cache) for (const locale of locales) {
  fs.writeFileSync(path.join(directory, `${locale}.json`), `${JSON.stringify(state.values[locale], null, 2)}\n`, 'utf8');
}
console.log(`Refreshed ${updated} generated locale entries.`);
