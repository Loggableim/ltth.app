#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const languages = ['en', 'de', 'es', 'fr'];
const exceptions = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-exceptions.json'), 'utf8'));

function walk(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === exceptions.archiveDirectory || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (/\.(html|js|md)$/i.test(entry.name)) output.push(full);
  }
  return output;
}

function collectKeys(source) {
  const matches = source.matchAll(/(?:\s|<)data-i18n(?:-key|-title|-aria-label|-placeholder|-href|-alt)?\s*=\s*["']([^"']+)["']/gi);
  return [...new Set([...matches].map(match => match[1]).filter(key => /^[A-Za-z0-9_.-]+$/.test(key)))];
}

const surfaces = [
  { name: 'website', directory: root },
  { name: 'app', directory: path.join(root, 'app', 'public') },
  { name: 'plugins', directory: path.join(root, 'app', 'plugins') },
  { name: 'wiki', directory: path.join(root, 'app', 'wiki') }
];
const report = {
  generatedAt: new Date().toISOString(),
  languages,
  exceptions,
  surfaces: surfaces.map(surface => {
    const files = walk(surface.directory);
    const keys = new Set();
    files.forEach(file => collectKeys(fs.readFileSync(file, 'utf8')).forEach(key => keys.add(key)));
    return { name: surface.name, files: files.length, referencedKeys: [...keys].sort() };
  })
};

const output = path.join(root, 'app', 'locales', 'translation-inventory.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
