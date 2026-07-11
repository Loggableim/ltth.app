#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const locales = ['en', 'de', 'es', 'fr'];

function flatten(value, prefix = '', output = {}) {
  for (const [key, child] of Object.entries(value || {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, output);
    else output[full] = child;
  }
  return output;
}

function setDotted(target, dotted, value) {
  const parts = dotted.split('.');
  let cursor = target;
  parts.forEach((part, index) => {
    if (index === parts.length - 1) cursor[part] = value;
    else cursor = cursor[part] && typeof cursor[part] === 'object' ? cursor[part] : (cursor[part] = {});
  });
}

function humanize(key) {
  return key.split('.').pop().replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, char => char.toUpperCase());
}

function collectText(file, key, source) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`data-i18n(?:-key)?=["']${escaped}["'][^>]*>([^<]*)<`, 'i'),
    new RegExp(`data-i18n(?:-key)?=["']${escaped}["']`, 'i')
  ];
  const match = patterns[0].exec(source);
  return match && match[1].trim() ? match[1].trim() : humanize(key);
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(html|js)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

const central = Object.fromEntries(locales.map(locale => [locale, flatten(JSON.parse(fs.readFileSync(path.join(root, 'app', 'locales', `${locale}.json`), 'utf8')))]));
let changed = 0;
for (const entry of fs.readdirSync(path.join(root, 'app', 'plugins'), { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === '_uploads') continue;
  const pluginRoot = path.join(root, 'app', 'plugins', entry.name);
  const sources = walk(pluginRoot).map(file => fs.readFileSync(file, 'utf8'));
  const source = sources.join('\n');
  const keys = [...new Set([...source.matchAll(/data-i18n(?:-key)?=["']([^"']+)["']/g)].map(match => match[1]))];
  if (!keys.length) continue;
  const localeDir = path.join(pluginRoot, 'locales');
  fs.mkdirSync(localeDir, { recursive: true });
  const parsed = Object.fromEntries(locales.map(locale => {
    const file = path.join(localeDir, `${locale}.json`);
    return [locale, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) : {}];
  }));
  const existing = Object.fromEntries(locales.map(locale => [locale, flatten(parsed[locale])]));
  for (const key of keys) {
    const defaultText = collectText('', key, source);
    locales.forEach(locale => {
      if (existing[locale][key] !== undefined) return;
      const value = central[locale][key] || (locale === 'en' ? defaultText : humanize(key));
      setDotted(parsed[locale], key, value);
    });
  }
  locales.forEach(locale => fs.writeFileSync(path.join(localeDir, `${locale}.json`), `${JSON.stringify(parsed[locale], null, 2)}\n`, 'utf8'));
  changed += keys.length;
}

console.log(`Augmented plugin locale contracts with ${changed} UI keys.`);
