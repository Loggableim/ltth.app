'use strict';

// One-shot migration for the historic static-site marker generator. It keeps
// the exact four-language values, but replaces location hashes with stable
// page namespaces and emits a hash-only manifest for review.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LOCALES = ['de', 'en', 'es', 'fr'];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.worktrees',
  'app',
  'build-src',
  'docs_archive',
  'naked',
  'new_patch',
  'node_modules',
  'released_patches',
  'screenshots'
]);
const MARKER_PATTERN = /\b(data-i18n(?:-[a-z-]+)?)=(["'])(generated\.[A-Za-z0-9_-]+)\2/g;

function walkHtml(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkHtml(fullPath, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(fullPath);
  }
  return output;
}

function readLocaleSet(directory) {
  return Object.fromEntries(LOCALES.map((locale) => {
    const file = path.join(directory, `${locale}.json`);
    if (!fs.existsSync(file)) throw new Error(`Missing locale file: ${file}`);
    return [locale, JSON.parse(fs.readFileSync(file, 'utf8'))];
  }));
}

function localeDirectory(relativePath) {
  const parts = relativePath.split('/');
  if (parts[0] === 'plugins' && parts[1]) return path.join(ROOT, 'plugins', parts[1], 'locales');
  return path.join(ROOT, 'locales');
}

function getValue(values, key) {
  if (Object.hasOwn(values, key)) return values[key];
  return key.split('.').reduce((current, part) => current && current[part], values);
}

function setValue(values, key, value) {
  const parts = key.split('.');
  let target = values;
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== 'object' || Array.isArray(target[part])) target[part] = {};
    target = target[part];
  }
  const leaf = parts.at(-1);
  if (Object.hasOwn(target, leaf) && target[leaf] !== value) {
    throw new Error(`Stable root i18n key collision at ${key}`);
  }
  target[leaf] = value;
}

function removeGenerated(values) {
  for (const key of Object.keys(values)) {
    if (key === 'generated' || key.startsWith('generated.')) {
      delete values[key];
      continue;
    }
    const child = values[key];
    if (child && typeof child === 'object' && !Array.isArray(child)) removeGenerated(child);
  }
}

function keySegment(value) {
  const normalized = String(value)
    .replace(/\.html$/i, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return normalized || 'page';
}

function stableKey(relativePath, attribute, ordinal) {
  const parts = relativePath.split('/').map(keySegment);
  const isLegacyPlugin = parts[0] === 'plugins' && parts.length >= 2;
  const scope = isLegacyPlugin
    ? ['plugins', parts[1], 'legacy', ...parts.slice(2)]
    : ['website', ...parts];
  const field = attribute === 'data-i18n'
    ? 'text'
    : keySegment(attribute.slice('data-i18n-'.length));
  return [...scope, field, String(ordinal).padStart(3, '0')].join('.');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

const localeSets = new Map();
const migrations = [];
const fileUpdates = new Map();

for (const file of walkHtml(ROOT).sort()) {
  const relativePath = path.relative(ROOT, file).replace(/\\/g, '/');
  const directory = localeDirectory(relativePath);
  if (!localeSets.has(directory)) localeSets.set(directory, readLocaleSet(directory));
  const locales = localeSets.get(directory);
  const source = fs.readFileSync(file, 'utf8');
  let ordinal = 0;
  const updated = source.replace(MARKER_PATTERN, (match, attribute, quote, oldKey) => {
    ordinal += 1;
    const newKey = stableKey(relativePath, attribute, ordinal);
    const hashes = {};
    for (const locale of LOCALES) {
      const value = getValue(locales[locale], oldKey);
      if (typeof value !== 'string') {
        throw new Error(`Missing string translation for ${oldKey} in ${path.relative(ROOT, directory)}/${locale}.json`);
      }
      setValue(locales[locale], newKey, value);
      hashes[locale] = hash(value);
    }
    migrations.push({ source: relativePath, attribute, oldKey, newKey, values: hashes });
    return `${attribute}=${quote}${newKey}${quote}`;
  });
  if (updated !== source) fileUpdates.set(file, updated);
}

if (!migrations.length) {
  console.log('No root generated i18n markers found.');
  process.exit(0);
}

const newKeys = new Set();
for (const migration of migrations) {
  if (newKeys.has(migration.newKey)) throw new Error(`Duplicate stable root i18n key: ${migration.newKey}`);
  newKeys.add(migration.newKey);
}

for (const locales of localeSets.values()) {
  for (const locale of LOCALES) removeGenerated(locales[locale]);
}

for (const [file, source] of fileUpdates) fs.writeFileSync(file, source, 'utf8');
for (const [directory, locales] of localeSets) {
  for (const locale of LOCALES) {
    fs.writeFileSync(path.join(directory, `${locale}.json`), `${JSON.stringify(locales[locale], null, 2)}\n`, 'utf8');
  }
}

const manifest = {
  schemaVersion: 1,
  migration: 'root-generated-i18n',
  entries: migrations
};
fs.writeFileSync(
  path.join(ROOT, 'docs', 'root-i18n-migration-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
console.log(`Migrated ${migrations.length} root generated i18n markers to stable keys.`);
