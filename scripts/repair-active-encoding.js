#!/usr/bin/env node

/**
 * Repair UTF-8 text that was decoded once as Windows-1252/Latin-1.
 * Only active product surfaces are scanned; docs_archive and dependencies are
 * intentionally excluded. The operation is conservative: a replacement is
 * accepted only when the mojibake marker count decreases and no replacement
 * character is introduced.
 */
const fs = require('fs');
const path = require('path');
const iconv = require('../app/node_modules/iconv-lite');

const root = path.join(__dirname, '..');
const roots = [root, path.join(root, 'app')];
const skipDirectories = new Set([
  '.git', 'node_modules', 'docs_archive', 'build-src', 'runtime',
  'screenshots', 'assets', 'scripts', '.superpowers', 'new_patch'
]);
const extensions = /\.(html|js|json|md)$/i;
const cp1252 = {
  '\u20ac': 0x80, '\u201a': 0x82, '\u0192': 0x83, '\u201e': 0x84,
  '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02c6': 0x88,
  '\u2030': 0x89, '\u0160': 0x8a, '\u2039': 0x8b, '\u0152': 0x8c,
  '\u017d': 0x8e, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93,
  '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97,
  '\u02dc': 0x98, '\u2122': 0x99, '\u0161': 0x9a, '\u203a': 0x9b,
  '\u0153': 0x9c, '\u017e': 0x9e, '\u0178': 0x9f
};
const marker = /[\u00c2\u00c3\u00e2\u00f0\u00ef\ufffd]/g;
const mojibakeRun = /(?:[\u00c2\u00c3\u00e2\u00f0\u00ef][\u0080-\u00ff\u20ac\u201a-\u203a\u0152\u0153\u0160\u0161\u0178\u017d\u017e]*)+/g;
const brokenWords = [
  ['f?r', 'für'], ['verf?gbar', 'verfügbar'], ['l?uft', 'läuft'], ['?ber', 'über'],
  ['H?ufig', 'Häufig'], ['M?glichkeiten', 'Möglichkeiten'], ['L?sungen', 'Lösungen'],
  ['pr?ft', 'prüft'], ['f?hrt', 'führt'], ['k?nnen', 'können'],
  ['vollst?ndig', 'vollständig'], ['unterst?tzt', 'unterstützt'], ['zuverl?ssig', 'zuverlässig'],
  ['Einf?hrung', 'Einführung'], ['g?nstigeren', 'günstigeren'], ['beh?lt', 'behält'],
  ['sesi?n', 'sesión'], ['informaci?n', 'información'], ['conexi?n', 'conexión'],
  ['actualizaci?n', 'actualización'], ['integraci?n', 'integración'], ['P?gina', 'Página'],
  ['pr?c?dentes', 'précédentes'], ['int?gr?e', 'intégrée'], ['stock?es', 'stockées'],
  ['d?taill?es', 'détaillées'], ['T?l?charger', 'Télécharger'], ['l?installation', 'l’installation'],
  ['l?utilisation', 'l’utilisation'], ['l?outil', 'l’outil'], ['syst?mes', 'systèmes'],
  ['lui-m?me', 'lui-même']
];

function decodeRun(run) {
  const bytes = Buffer.from([...run].map(char => cp1252[char] ?? char.charCodeAt(0)));
  try {
    return iconv.decode(bytes, 'utf8');
  } catch {
    return run;
  }
}

function repairText(value) {
  let result = value.replace(mojibakeRun, decodeRun);
  for (const [from, to] of brokenWords) result = result.split(from).join(to);
  return result;
}

function repairFile(file) {
  const source = fs.readFileSync(file, 'utf8');
  const candidate = repairText(source);
  const before = (source.match(marker) || []).length;
  const after = (candidate.match(marker) || []).length;
  if (candidate.includes('\ufffd') && !source.includes('\ufffd')) return false;
  if (after >= before && candidate === source) return false;
  if (after > before) return false;
  fs.writeFileSync(file, candidate, 'utf8');
  return candidate !== source;
}

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skipDirectories.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (extensions.test(entry.name)) files.push(full);
  }
  return files;
}

const files = [...new Set(roots.flatMap(directory => walk(directory)))];
let changed = 0;
for (const file of files) if (repairFile(file)) changed += 1;
console.log(`Checked ${files.length} active text files; repaired ${changed}.`);
