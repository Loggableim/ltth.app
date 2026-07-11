#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const parse5 = require(path.join(__dirname, '..', 'app', 'node_modules', 'parse5'));

const root = path.join(__dirname, '..');
const locales = ['en', 'de', 'es', 'fr'];
const skip = new Set(['.git', 'node_modules', 'docs_archive', '.superpowers', '.tmp_patch', '.tmp_patch2', 'naked', 'new_patch', 'released_patches', 'screenshots', 'build-src', 'app', 'plugins']);

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skip.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (/\.html$/i.test(entry.name)) output.push(full);
  }
  return output;
}

function textContent(node) {
  if (!node) return '';
  if (node.nodeName === '#text') return node.value || '';
  return (node.childNodes || []).map(textContent).join('');
}

function attrs(node) {
  return Object.fromEntries((node?.attrs || []).map(attr => [attr.name, attr.value || '']));
}

function collectGenerated(document) {
  const result = [];
  function visit(node) {
    if (!node || ['script', 'style', 'template', 'svg'].includes(String(node.nodeName || '').toLowerCase())) return;
    const map = attrs(node);
    if (map['data-i18n'] && map['data-i18n'].startsWith('generated.')) {
      result.push({ key: map['data-i18n'], value: textContent(node).replace(/\s+/g, ' ').trim() });
      return;
    }
    (node.childNodes || []).forEach(visit);
  }
  visit(document);
  return result;
}

function variantInfo(file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const suffix = relative.match(/^(.*)-(en|de|es|fr)\.html$/i);
  const localeFromName = suffix && suffix[2].toLowerCase();
  const source = fs.readFileSync(file, 'utf8');
  const document = parse5.parse(source);
  const html = (document.childNodes || []).flatMap(node => node.childNodes || []).find(node => node.nodeName === 'html');
  const localeFromHtml = attrs(html).lang;
  const locale = locales.includes(localeFromName) ? localeFromName : (locales.includes(localeFromHtml) ? localeFromHtml : 'de');
  const group = suffix ? `${suffix[1]}.html` : relative;
  return { file, relative, group, locale, isNamed: Boolean(suffix), entries: collectGenerated(document) };
}

const groups = new Map();
for (const file of walk(root)) {
  const info = variantInfo(file);
  if (!info) continue;
  if (!groups.has(info.group)) groups.set(info.group, []);
  groups.get(info.group).push(info);
}

const localeValues = Object.fromEntries(locales.map(locale => {
  const file = path.join(root, 'locales', `${locale}.json`);
  return [locale, JSON.parse(fs.readFileSync(file, 'utf8'))];
}));
let groupsSynced = 0;
let keysSynced = 0;
for (const variants of groups.values()) {
  const namedVariants = variants.filter(variant => variant.isNamed);
  const candidates = namedVariants.length >= 2 ? namedVariants : variants;
  const byLocale = new Map(candidates.map(variant => [variant.locale, variant]));
  if (byLocale.size < 2) continue;
  const lengths = [...byLocale.values()].map(variant => variant.entries.length);
  if (!lengths.length || Math.min(...lengths) === 0) continue;
  const count = Math.min(...lengths);
  for (let index = 0; index < count; index += 1) {
    for (const sourceVariant of byLocale.values()) {
      const key = sourceVariant.entries[index].key;
      const generatedKey = key.replace(/^generated\./, '');
      localeValues[sourceVariant.locale].generated = localeValues[sourceVariant.locale].generated || {};
      for (const locale of locales) {
        const translatedVariant = byLocale.get(locale);
        if (translatedVariant && translatedVariant.entries[index]) {
          localeValues[locale].generated = localeValues[locale].generated || {};
          localeValues[locale].generated[generatedKey] = translatedVariant.entries[index].value;
        }
      }
      keysSynced += 1;
    }
  }
  groupsSynced += 1;
}

for (const locale of locales) fs.writeFileSync(path.join(root, 'locales', `${locale}.json`), `${JSON.stringify(localeValues[locale], null, 2)}\n`, 'utf8');
console.log(`Synchronized ${keysSynced} generated keys across ${groupsSynced} website language groups.`);
