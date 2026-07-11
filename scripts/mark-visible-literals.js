#!/usr/bin/env node

/**
 * Add stable i18n markers to visible HTML text that predates the shared
 * translation contract. Existing markers, code blocks and generated mockups
 * are left untouched. Locale values are sourced from matching existing
 * translations whenever possible and otherwise retain the source copy as an
 * explicit, reviewable fallback.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const parse5 = require(path.join(__dirname, '..', 'app', 'node_modules', 'parse5'));

const root = path.join(__dirname, '..');
const locales = ['en', 'de', 'es', 'fr'];
const ignoredTags = new Set(['script', 'style', 'template', 'svg', 'noscript', 'pre', 'code']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'docs_archive', '.superpowers', '.tmp_patch', '.tmp_patch2', 'naked', 'new_patch', 'released_patches', 'screenshots', 'build-src']);
const htmlExtensions = /\.html$/i;

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (htmlExtensions.test(entry.name)) output.push(full);
  }
  return output;
}

function flatten(value, prefix = '', result = new Map()) {
  for (const [key, child] of Object.entries(value || {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, result);
    else if (typeof child === 'string') result.set(full, child);
  }
  return result;
}

function readLocaleSet(directory) {
  return Object.fromEntries(locales.map(locale => {
    const file = path.join(directory, `${locale}.json`);
    if (!fs.existsSync(file)) return [locale, {}];
    return [locale, JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))];
  }));
}

function localeDirectory(file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  if (relative.startsWith('app/plugins/')) return path.join(root, 'app', 'plugins', relative.split('/')[2], 'locales');
  if (relative.startsWith('plugins/')) return path.join(root, 'plugins', relative.split('/')[1], 'locales');
  if (relative.startsWith('app/')) return path.join(root, 'app', 'locales');
  return path.join(root, 'locales');
}

function hasMarker(node) {
  return (node.attrs || []).some(attr => attr.name.toLowerCase() === 'data-i18n' || attr.name.toLowerCase().startsWith('data-i18n-'));
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function candidateText(text) {
  if (!text || text.length < 2 || !/[\p{L}]/u.test(text)) return false;
  if (/\$\{|\{\{|\}\}|^https?:\/\/|^www\.|^[\w./:#?=&+%${}()[\]\-]+$/i.test(text)) return false;
  if (/^(?:[a-z_$][\w$]*\s*=|return\b|const\b|let\b|var\b|function\b)/i.test(text)) return false;
  return true;
}

function startTagEnd(source, startOffset) {
  let quote = null;
  for (let index = startOffset; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

function insertAttribute(source, node, attribute) {
  const location = node.sourceCodeLocation && node.sourceCodeLocation.startTag;
  if (!location) return null;
  const end = startTagEnd(source, location.startOffset);
  if (end < 0) return null;
  const before = source.slice(location.startOffset, end);
  const closing = /\/\s*$/.test(before) ? before.lastIndexOf('/') : before.length;
  const insertion = ` ${attribute}`;
  return { offset: location.startOffset + closing, text: insertion };
}

function sourceLocale(file, document) {
  const lang = (document.childNodes || []).flatMap(node => node.childNodes || []).find(node => node.nodeName === 'html')?.attrs?.find(attr => attr.name === 'lang')?.value;
  if (locales.includes(lang)) return lang;
  const name = path.basename(file).toLowerCase();
  for (const locale of locales) if (name.includes(`-${locale}.`)) return locale;
  return 'en';
}

function buildReverseMaps(localeSet) {
  const maps = Object.fromEntries(locales.map(locale => [locale, new Map()]));
  for (const locale of locales) {
    for (const [key, value] of flatten(localeSet[locale])) {
      const normalized = normalizedText(value);
      if (normalized && !maps[locale].has(normalized)) maps[locale].set(normalized, key);
    }
  }
  return maps;
}

function nestedSet(object, dottedKey, value) {
  const parts = dottedKey.split('.');
  let target = object;
  parts.slice(0, -1).forEach(part => {
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {};
    target = target[part];
  });
  target[parts[parts.length - 1]] = value;
}

const localeCache = new Map();
const reverseCache = new Map();
const pending = new Map();
const files = walk(root);
let changedFiles = 0;
let markedCount = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const document = parse5.parse(source, { sourceCodeLocationInfo: true });
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const localeDirectoryPath = localeDirectory(file);
  if (!localeCache.has(localeDirectoryPath)) {
    const values = readLocaleSet(localeDirectoryPath);
    localeCache.set(localeDirectoryPath, values);
    reverseCache.set(localeDirectoryPath, buildReverseMaps(values));
    pending.set(localeDirectoryPath, new Map());
  }
  const values = localeCache.get(localeDirectoryPath);
  const reverse = reverseCache.get(localeDirectoryPath);
  const sourceLang = sourceLocale(file, document);
  const edits = [];
  let ordinal = 0;

  function visit(node, ancestors = [], marked = false) {
    if (!node) return;
    const nodeName = String(node.nodeName || '').toLowerCase();
    if (ignoredTags.has(nodeName)) return;
    const isMarked = marked || hasMarker(node) || (node.attrs || []).some(attr => attr.name === 'aria-hidden' && attr.value === 'true');
    if (nodeName === '#text') {
      const text = normalizedText(node.value);
      if (!isMarked && candidateText(text) && node.parentNode?.sourceCodeLocation) {
        const keyHash = crypto.createHash('sha1').update(`${relative}\n${ordinal}\n${text}`).digest('hex').slice(0, 12);
        const key = `generated.${keyHash}`;
        const rawStart = node.sourceCodeLocation.startOffset;
        const rawEnd = node.sourceCodeLocation.endOffset;
        const parent = node.parentNode;
        const elementChildren = (parent.childNodes || []).filter(child => child.nodeName && child.nodeName !== '#text');
        const textChildren = (parent.childNodes || []).filter(child => child.nodeName === '#text' && normalizedText(child.value));
        const parentMarked = hasMarker(parent);
        if (!parentMarked && elementChildren.length === 0 && textChildren.length === 1) {
          const edit = insertAttribute(source, parent, `data-i18n="${key}"`);
          if (edit) edits.push(edit);
        } else if (!parentMarked && rawEnd > rawStart) {
          edits.push({ offset: rawStart, text: `<span data-i18n="${key}">` });
          edits.push({ offset: rawEnd, text: '</span>' });
        }
        const sourceValue = text;
        const matchedKey = reverse[sourceLang].get(sourceValue) || reverse.en.get(sourceValue);
        const entry = pending.get(localeDirectoryPath).get(key) || {};
        for (const locale of locales) {
          if (matchedKey && flatten(values[locale]).has(matchedKey)) entry[locale] = flatten(values[locale]).get(matchedKey);
          else if (locale === sourceLang) entry[locale] = sourceValue;
          else entry[locale] = sourceValue;
        }
        pending.get(localeDirectoryPath).set(key, entry);
        markedCount += 1;
      }
      ordinal += 1;
      return;
    }
    (node.childNodes || []).forEach(child => visit(child, ancestors.concat(node), isMarked));
  }
  visit(document);
  if (edits.length) {
    let updated = source;
    for (const edit of edits.sort((a, b) => b.offset - a.offset)) updated = updated.slice(0, edit.offset) + edit.text + updated.slice(edit.offset);
    if (updated !== source) {
      fs.writeFileSync(file, updated, 'utf8');
      changedFiles += 1;
    }
  }
}

for (const [directory, entries] of pending) {
  if (!entries.size) continue;
  const values = localeCache.get(directory);
  for (const [key, translations] of entries) for (const locale of locales) nestedSet(values[locale], key, translations[locale]);
  for (const locale of locales) fs.writeFileSync(path.join(directory, `${locale}.json`), `${JSON.stringify(values[locale], null, 2)}\n`, 'utf8');
}

console.log(`Marked ${markedCount} visible literals in ${changedFiles} HTML files.`);
