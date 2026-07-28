'use strict';

const fs = require('fs');
const path = require('path');

const SKIPPED_SOURCE_DIRECTORIES = new Set([
  'node_modules', '.git', 'docs_archive', '.worktrees', '.superpowers'
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function walkSource(directory, output = []) {
  if (!fs.existsSync(directory)) return output;
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    if (entry.isDirectory() && SKIPPED_SOURCE_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walkSource(full, output);
    else if (/\.(html|js)$/i.test(entry.name)) output.push(full);
  }
  return output;
}

module.exports = { walkSource };
