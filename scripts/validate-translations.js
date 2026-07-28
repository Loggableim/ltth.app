#!/usr/bin/env node

/**
 * Translation contract check for the active product surface.
 *
 * It validates JSON, four-language parity, non-empty values and interpolation
 * placeholders for the central app and every manifest-backed plugin. A JSON
 * report is emitted so CI and release audits can consume the same evidence.
 */
const fs = require('fs');
const path = require('path');
const { walkSource } = require('./lib/translation-source-walker');

const repoRoot = path.join(__dirname, '..');
const appRoot = path.join(repoRoot, 'app');
const locales = ['en', 'de', 'es', 'fr'];
const reportPath = path.join(appRoot, 'locales', 'validation-report.json');

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function repoRelative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flatten(value, prefix = '', output = new Map()) {
  for (const [key, child] of Object.entries(value || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (isObject(child)) flatten(child, fullKey, output);
    else output.set(fullKey, child);
  }
  return output;
}

function placeholders(value) {
  return [...String(value || '').matchAll(/\{\{?([\w.-]+)\}?\}/g)].map(match => match[1]).sort();
}

function localeSet(directory) {
  return Object.fromEntries(locales.map(locale => {
    const file = path.join(directory, `${locale}.json`);
    return [locale, fs.existsSync(file) ? readJson(file) : null];
  }));
}

function checkSet(label, directory, findings) {
  const reportDirectory = repoRelative(directory);
  const values = localeSet(directory);
  const missingFiles = locales.filter(locale => !values[locale]);
  if (missingFiles.length) {
    findings.push({
      type: 'missing-locale-file',
      label,
      directory: reportDirectory,
      locales: missingFiles
    });
    return { label, directory: reportDirectory, keys: 0 };
  }

  const flattened = Object.fromEntries(locales.map(locale => [locale, flatten(values[locale])]));
  const reference = [...flattened.en.keys()].sort();
  const allKeys = [...new Set(
    locales.flatMap(locale => [...flattened[locale].keys()])
  )].sort(compareText);
  for (const locale of locales) {
    const keys = [...flattened[locale].keys()].sort();
    const missing = reference.filter(key => !flattened[locale].has(key));
    const extra = keys.filter(key => !flattened.en.has(key));
    if (missing.length || extra.length) findings.push({ type: 'key-parity', label, locale, missing, extra });
    for (const key of allKeys) {
      if (!flattened[locale].has(key)) continue;
      const value = flattened[locale].get(key);
      if (key.startsWith('generated.')) findings.push({ type: 'generated-key', label, locale, key });
      if (typeof value !== 'string' || !value.trim()) findings.push({ type: 'empty-value', label, locale, key });
      if (flattened.en.has(key) && JSON.stringify(placeholders(flattened.en.get(key))) !== JSON.stringify(placeholders(value))) {
        findings.push({ type: 'placeholder-mismatch', label, locale, key, expected: placeholders(flattened.en.get(key)), actual: placeholders(value) });
      }
    }
  }
  return { label, directory: reportDirectory, keys: reference.length };
}

function collectReferencedKeys(source) {
  const keys = new Set();
  const attrPattern = /(?:\s|<)data-i18n(?:-key|-title|-aria-label|-placeholder|-href|-alt)?\s*=\s*["']([A-Za-z0-9_.-]+)["']/gi;
  for (const match of source.matchAll(attrPattern)) keys.add(match[1]);
  const callPattern = /(?:window\.)?(?:i18n|I18n)\.t\(\s*["']([A-Za-z0-9_.-]+)["']/g;
  for (const match of source.matchAll(callPattern)) keys.add(match[1]);
  return [...keys].sort(compareText);
}

function referenceLocaleMap(sourceFile) {
  const relative = path.relative(repoRoot, sourceFile).replace(/\\/g, '/');
  if (!relative.startsWith('app/')) {
    if (relative.startsWith('plugin-store/sources/')) {
      const sourceId = relative.split('/')[2];
      const directories = [
        path.join(appRoot, 'locales'),
        path.join(repoRoot, 'plugin-store', 'sources', sourceId, 'locales')
      ];
      return Object.fromEntries(locales.map(locale => {
        const merged = new Map();
        directories.forEach(directory => {
          const values = localeSet(directory)[locale];
          if (values) flatten(values).forEach((value, key) => merged.set(key, value));
        });
        return [locale, merged];
      }));
    }
    if (relative.startsWith('plugins/')) {
      const pluginDirectory = path.join(repoRoot, 'plugins', relative.split('/')[1], 'locales');
      return Object.fromEntries(locales.map(locale => {
        const values = localeSet(pluginDirectory)[locale];
        return [locale, values ? flatten(values) : new Map()];
      }));
    }
    const values = localeSet(path.join(repoRoot, 'locales'));
    return Object.fromEntries(locales.map(locale => [locale, values[locale] ? flatten(values[locale]) : new Map()]));
  }

  const directories = [path.join(appRoot, 'locales')];
  if (relative.startsWith('app/plugins/')) directories.push(path.join(appRoot, 'plugins', relative.split('/')[2], 'locales'));
  if (relative.startsWith('app/public/')) {
    const entries = fs.readdirSync(
      path.join(appRoot, 'plugins'),
      { withFileTypes: true }
    ).sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      if (entry.isDirectory()) directories.push(path.join(appRoot, 'plugins', entry.name, 'locales'));
    }
  }
  return Object.fromEntries(locales.map(locale => {
    const merged = new Map();
    directories.forEach(directory => {
      const values = localeSet(directory)[locale];
      if (values) flatten(values).forEach((value, key) => merged.set(key, value));
    });
    return [locale, merged];
  }));
}

function checkReferencedKeys(findings) {
  const roots = [repoRoot, path.join(appRoot, 'public'), path.join(appRoot, 'plugins')];
  const files = [...new Set(roots.flatMap(root => walkSource(root)))].filter(file => {
    const relative = path.relative(repoRoot, file).replace(/\\/g, '/');
    if (/^(?:\.tmp|\.tmp_patch|\.tmp_patch2|new_patch|naked|released_patches|docs_archive)\//.test(relative)) return false;
    if (/^(?:docs|infos|build-src|scripts)\//.test(relative)) return false;
    if (relative.startsWith('app/') && !relative.startsWith('app/public/') && !relative.startsWith('app/plugins/')) return false;
    return true;
  });
  files.forEach(file => {
    const keys = collectReferencedKeys(fs.readFileSync(file, 'utf8'));
    if (!keys.length) return;
    const maps = referenceLocaleMap(file);
    keys.forEach(key => locales.forEach(locale => {
      if (key.startsWith('generated.')) findings.push({ type: 'generated-reference', file: path.relative(repoRoot, file).replace(/\\/g, '/'), locale, key });
      if (!maps[locale].has(key)) findings.push({ type: 'missing-reference-key', file: path.relative(repoRoot, file).replace(/\\/g, '/'), locale, key });
    }));
  });
}

const findings = [];
const sets = [];
sets.push(checkSet('app', path.join(appRoot, 'locales'), findings));
sets.push(checkSet('website', path.join(repoRoot, 'locales'), findings));

function listMarkdown(directory, baseDirectory = directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...listMarkdown(full, baseDirectory));
    else if (/\.md$/i.test(entry.name)) result.push(path.relative(baseDirectory, full).replace(/\\/g, '/'));
  }
  return result.sort(compareText);
}

for (const root of ['app/wiki', 'docs', 'infos']) {
  const source = listMarkdown(path.join(repoRoot, root)).filter(file => {
    if (/^(en|de|es|fr)\//.test(file)) return false;
    if (root === 'docs' && /^(?:plans|superpowers)\//.test(file)) return false;
    return true;
  });
  const docsSummary = { label: `docs:${root}`, files: source.length };
  for (const locale of locales) {
    const translated = listMarkdown(path.join(repoRoot, root, locale));
    const missing = source.filter(file => !translated.includes(file));
    if (missing.length) findings.push({ type: 'missing-documentation-variant', root, locale, missing });
    docsSummary[locale] = translated.length;
  }
  sets.push(docsSummary);
}

const pluginsRoot = path.join(appRoot, 'plugins');
const appPluginEntries = fs.readdirSync(
  pluginsRoot,
  { withFileTypes: true }
).sort((left, right) => compareText(left.name, right.name));
for (const entry of appPluginEntries) {
  if (!entry.isDirectory() || entry.name === '_uploads') continue;
  const manifest = path.join(pluginsRoot, entry.name, 'plugin.json');
  if (!fs.existsSync(manifest)) continue;
  sets.push(checkSet(`plugin:${entry.name}`, path.join(pluginsRoot, entry.name, 'locales'), findings));
}

const rootPlugins = path.join(repoRoot, 'plugins');
if (fs.existsSync(rootPlugins)) {
  const rootPluginEntries = fs.readdirSync(
    rootPlugins,
    { withFileTypes: true }
  ).sort((left, right) => compareText(left.name, right.name));
  for (const entry of rootPluginEntries) {
    if (!entry.isDirectory()) continue;
    const manifest = path.join(rootPlugins, entry.name, 'plugin.json');
    if (!fs.existsSync(manifest)) continue;
    sets.push(checkSet(`plugin:${entry.name}`, path.join(rootPlugins, entry.name, 'locales'), findings));
  }
}

checkReferencedKeys(findings);
findings.sort((left, right) =>
  compareText(JSON.stringify(left), JSON.stringify(right))
);

const report = {
  locales,
  sets,
  findings,
  ok: findings.length === 0
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
