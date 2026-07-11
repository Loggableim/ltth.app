#!/usr/bin/env node

// Repair common mojibake in the static website and locale files.
const fs = require("fs");
const path = require("path");
const iconv = require("../app/node_modules/iconv-lite");

const root = path.join(__dirname, "..");
const skip = new Set([".git", "node_modules", "app", "build-src", "docs", "wiki", "assets", "screenshots", "runtime", "scripts"]);
const cp1252 = {
  "\u20ac": 0x80, "\u201a": 0x82, "\u0192": 0x83, "\u201e": 0x84, "\u2026": 0x85,
  "\u2020": 0x86, "\u2021": 0x87, "\u02c6": 0x88, "\u2030": 0x89, "\u0160": 0x8a,
  "\u2039": 0x8b, "\u0152": 0x8c, "\u017d": 0x8e, "\u2018": 0x91, "\u2019": 0x92,
  "\u201c": 0x93, "\u201d": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "\u02dc": 0x98, "\u2122": 0x99, "\u0161": 0x9a, "\u203a": 0x9b, "\u0153": 0x9c,
  "\u017e": 0x9e, "\u0178": 0x9f
};
const mojibakeRun = /(?:[\u00c2\u00c3\u00e2\u00f0\u00ef][\u0080-\u00ff\u20ac\u201a-\u203a\u0152\u0153\u0160\u0161\u0178\u017d\u017e]*)+/g;
const brokenWords = [
  ["f?r", "f\u00fcr"], ["verf?gbar", "verf\u00fcgbar"], ["l?uft", "l\u00e4uft"], ["?ber", "\u00fcber"],
  ["H?ufig", "H\u00e4ufig"], ["M?glichkeiten", "M\u00f6glichkeiten"], ["L?sungen", "L\u00f6sungen"],
  ["pr?ft", "pr\u00fcft"], ["f?hrt", "f\u00fchrt"], ["k?nnen", "k\u00f6nnen"],
  ["vollst?ndig", "vollst\u00e4ndig"], ["unterst?tzt", "unterst\u00fctzt"], ["zuverl?ssig", "zuverl\u00e4ssig"],
  ["Einf?hrung", "Einf\u00fchrung"], ["g?nstigeren", "g\u00fcnstigeren"], ["beh?lt", "beh\u00e4lt"],
  ["gesti?n", "gesti\u00f3n"], ["informaci?n", "informaci\u00f3n"], ["conexi?n", "conexi\u00f3n"],
  ["actualizaci?n", "actualizaci\u00f3n"], ["integraci?n", "integraci\u00f3n"], ["P?gina", "P\u00e1gina"],
  ["pr?c?dentes", "pr\u00e9c\u00e9dentes"], ["int?gr?e", "int\u00e9gr\u00e9e"], ["stock?es", "stock\u00e9es"],
  ["d?taill?es", "d\u00e9taill\u00e9es"], ["T?l?charger", "T\u00e9l\u00e9charger"], ["l?installation", "l\u2019installation"],
  ["l?utilisation", "l\u2019utilisation"], ["l?outil", "l\u2019outil"], ["syst?mes", "syst\u00e8mes"],
  ["lui-m?me", "lui-m\u00eame"]
];

function repairMojibake(value) {
  return value.replace(mojibakeRun, run => {
    const bytes = Buffer.from([...run].map(char => cp1252[char] ?? char.charCodeAt(0)));
    try { return iconv.decode(bytes, "utf8"); } catch { return run; }
  });
}

function repairText(value) {
  let result = repairMojibake(value);
  for (const [from, to] of brokenWords) result = result.split(from).join(to);
  return result.replace(/More info" \? "Run anyway/g, "More info\" \u2192 \"Run anyway");
}

function repairFile(file) {
  const original = fs.readFileSync(file, "utf8");
  const repaired = repairText(original);
  if (repaired === original) return 0;
  fs.writeFileSync(file, repaired, "utf8");
  return 1;
}

function walk(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !skip.has(entry.name)) count += walk(path.join(dir, entry.name));
    if (entry.isFile() && /\.(html|js)$/i.test(entry.name)) count += repairFile(path.join(dir, entry.name));
  }
  return count;
}

const htmlAndJsCount = walk(root);
let localeCount = 0;
for (const lang of ["de", "en", "es", "fr"]) {
  const file = path.join(root, "locales", `${lang}.json`);
  if (fs.existsSync(file)) localeCount += repairFile(file);
}
console.log(`Repaired ${htmlAndJsCount} website HTML/JS files and ${localeCount} locale files.`);
