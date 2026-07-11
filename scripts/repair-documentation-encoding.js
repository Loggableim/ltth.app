#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const roots = [path.join(__dirname, '..', 'app', 'wiki'), path.join(__dirname, '..', 'docs'), path.join(__dirname, '..', 'infos')];
const marker = new RegExp('(?:\\u00c3.|\\u00c2.|\\u00e2.|\\u00f0.|\\u00ef\\u00bf|\\ufffd)', 'g');

function repair(value) {
  let result = value;
  for (let pass = 0; pass < 2; pass += 1) {
    const candidate = Buffer.from(result, 'latin1').toString('utf8');
    if ((candidate.match(marker) || []).length < (result.match(marker) || []).length) result = candidate;
    else break;
  }
  return result;
}

function walk(directory) {
  let count = 0;
  if (!fs.existsSync(directory)) return count;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) count += walk(full);
    else if (/\.md$/i.test(entry.name)) {
      const source = fs.readFileSync(full, 'utf8');
      const updated = repair(source);
      if (updated !== source) fs.writeFileSync(full, updated, 'utf8');
      count += 1;
    }
  }
  return count;
}

console.log(`Checked ${roots.reduce((sum, root) => sum + walk(root), 0)} documentation files.`);
