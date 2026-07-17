'use strict';

const fs = require('fs');
const path = require('path');
const {
  migratePluginLocales,
  rewritePluginTranslationReferences
} = require('./lib/plugin-i18n-namespace-migration');
const { flattenTranslations } = require('./lib/plugin-i18n-audit');

const root = path.resolve(__dirname, '..');
const pluginId = process.argv[2];
const locales = ['de', 'en', 'es', 'fr'];
const emitBase64 = process.argv.includes('--base64');
const requestedLocale = process.argv.find((argument) => argument.startsWith('--locale='))?.slice('--locale='.length);
const replaceFiles = process.argv.includes('--replace-files');

if (!pluginId) throw new Error('Usage: node scripts/print-plugin-i18n-namespace-patch.js <plugin-id>');
if (requestedLocale && !locales.includes(requestedLocale)) throw new Error(`Unsupported locale: ${requestedLocale}`);

const pluginDir = path.join(root, 'app', 'plugins', pluginId);
const localesDir = path.join(pluginDir, 'locales');
if (!fs.existsSync(localesDir)) throw new Error(`Plugin locales do not exist: ${pluginId}`);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function payload(locale) {
  return locale.plugins && locale.plugins[pluginId] ? locale.plugins[pluginId] : locale;
}

function patchReplacement(before, after) {
  const removed = before.replace(/\n/g, '\n-');
  const added = after.replace(/\n/g, '\n+');
  return `@@\n-${removed}\n+${added}\n`;
}

const originalLocales = Object.fromEntries(locales.map((locale) => [
  locale,
  readJson(path.join(localesDir, `${locale}.json`))
]));
const legacyKeys = Object.keys(flattenTranslations(payload(originalLocales.en))).reduce((map, key) => {
  map[key] = key;
  return map;
}, {});
const migration = migratePluginLocales(pluginId, originalLocales);
const keyMap = { ...legacyKeys, ...migration.keyMap };
const chunks = ['*** Begin Patch'];

for (const locale of locales) {
  if (requestedLocale && locale !== requestedLocale) continue;
  const file = path.join(localesDir, `${locale}.json`);
  const before = readText(file).replace(/\n$/, '');
  const after = `${JSON.stringify(migration.locales[locale], null, 2)}\n`.replace(/\n$/, '');
  if (before === after) continue;
  if (replaceFiles) {
    chunks.push(`*** Delete File: ${file}`);
    chunks.push(`*** Add File: ${file}`);
    chunks.push(...after.split('\n').map((line) => `+${line}`));
  } else {
    chunks.push(`*** Update File: ${file}`);
    chunks.push(patchReplacement(before, after));
  }
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'locales') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file, files);
    else if (/\.(?:html|js)$/i.test(entry.name)) files.push(file);
  }
  return files;
}

for (const file of requestedLocale ? [] : walk(pluginDir)) {
  const before = readText(file);
  const after = rewritePluginTranslationReferences(before, pluginId, keyMap);
  if (before === after) continue;
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  chunks.push(`*** Update File: ${file}`);
  for (let index = 0; index < beforeLines.length; index++) {
    if (beforeLines[index] !== afterLines[index]) {
      chunks.push(patchReplacement(beforeLines[index], afterLines[index]));
    }
  }
}

chunks.push('*** End Patch');
const patch = chunks.join('\n');
process.stdout.write(emitBase64 ? Buffer.from(patch, 'utf8').toString('base64') : patch);
