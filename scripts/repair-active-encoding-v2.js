#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const iconv = require('../app/node_modules/iconv-lite');

const root = path.join(__dirname, '..');
const skip = new Set(['.git', 'node_modules', 'docs_archive', 'build-src', 'runtime', 'screenshots', 'assets', 'scripts', '.superpowers', 'new_patch', 'naked']);
const extensions = /\.(html|js|json|md)$/i;
const cp1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x2c6, 0x88], [0x2030, 0x89], [0x160, 0x8a],
  [0x2039, 0x8b], [0x152, 0x8c], [0x17d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x2dc, 0x98], [0x2122, 0x99], [0x161, 0x9a], [0x203a, 0x9b], [0x153, 0x9c],
  [0x17e, 0x9e], [0x178, 0x9f]
]);
const marker = /[\u00c2\u00c3\u00e2\u00f0\u00ef\ufffd]/g;
const run = /(?:[\u00c2\u00c3\u00e2\u00f0\u00ef][\u0080-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u2013-\u203a\u20ac\u2122]*)+/g;
const replacementWords = [
  ['f?r', 'f' + String.fromCodePoint(0xfc) + 'r'],
  ['verf?gbar', 'verf' + String.fromCodePoint(0xfc) + 'gbar'],
  ['l?uft', 'l' + String.fromCodePoint(0xe4) + 'uft'],
  ['?ber', String.fromCodePoint(0xfc) + 'ber'],
  ['H?ufig', 'H' + String.fromCodePoint(0xe4) + 'ufig'],
  ['M?glichkeiten', 'M' + String.fromCodePoint(0xf6) + 'glichkeiten'],
  ['L?sungen', 'L' + String.fromCodePoint(0xf6) + 'sungen'],
  ['pr?ft', 'pr' + String.fromCodePoint(0xfc) + 'ft'],
  ['f?hrt', 'f' + String.fromCodePoint(0xfc) + 'hrt'],
  ['k?nnen', 'k' + String.fromCodePoint(0xf6) + 'nnen'],
  ['vollst?ndig', 'vollst' + String.fromCodePoint(0xe4) + 'ndig'],
  ['unterst?tzt', 'unterst' + String.fromCodePoint(0xfc) + 'tzt'],
  ['zuverl?ssig', 'zuverl' + String.fromCodePoint(0xe4) + 'ssig'],
  ['Einf?hrung', 'Einf' + String.fromCodePoint(0xfc) + 'hrung'],
  ['g?nstigeren', 'g' + String.fromCodePoint(0xfc) + 'nstigeren'],
  ['beh?lt', 'beh' + String.fromCodePoint(0xe4) + 'lt'],
  ['sesi?n', 'sesi' + String.fromCodePoint(0xf3) + 'n'],
  ['informaci?n', 'informaci' + String.fromCodePoint(0xf3) + 'n'],
  ['conexi?n', 'conexi' + String.fromCodePoint(0xf3) + 'n'],
  ['actualizaci?n', 'actualizaci' + String.fromCodePoint(0xf3) + 'n'],
  ['integraci?n', 'integraci' + String.fromCodePoint(0xf3) + 'n'],
  ['P?gina', 'P' + String.fromCodePoint(0xe1) + 'gina'],
  ['pr?c?dentes', 'pr' + String.fromCodePoint(0xe9) + 'c' + String.fromCodePoint(0xe9) + 'dentes'],
  ['int?gr?e', 'int' + String.fromCodePoint(0xe9) + 'gr' + String.fromCodePoint(0xe9) + 'e'],
  ['d?taill?es', 'd' + String.fromCodePoint(0xe9) + 'taill' + String.fromCodePoint(0xe9) + 'es'],
  ['T?l?charger', 'T' + String.fromCodePoint(0xe9) + 'l' + String.fromCodePoint(0xe9) + 'charger'],
  ['syst?mes', 'syst' + String.fromCodePoint(0xe8) + 'mes']
];

function repairText(source) {
  let value = source;
  // A few active files were encoded more than once (ÃƒÂ¼). Decode
  // conservatively in several passes so the repair is idempotent while
  // retaining any sequence that would introduce a replacement character.
  for (let pass = 0; pass < 3; pass += 1) {
    const repaired = value.replace(run, part => {
      const bytes = Buffer.from([...part].map(character => cp1252.get(character.codePointAt(0)) ?? character.codePointAt(0)));
      const decoded = iconv.decode(bytes, 'utf8');
      return decoded.includes('\ufffd') ? part : decoded;
    });
    if (repaired === value) break;
    value = repaired;
  }
  for (const [from, to] of replacementWords) value = value.split(from).join(to);
  return value;
}

function walk(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skip.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, output);
    else if (extensions.test(entry.name)) output.push(full);
  }
  return output;
}

let changed = 0;
for (const file of walk(root)) {
  const source = fs.readFileSync(file, 'utf8');
  const repaired = repairText(source);
  const before = (source.match(marker) || []).length;
  const after = (repaired.match(marker) || []).length;
  if (after < before && !repaired.includes('\ufffd')) {
    fs.writeFileSync(file, repaired, 'utf8');
    changed += 1;
  }
}
console.log(`Repaired ${changed} active files.`);
