#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const languages = ['en', 'de', 'es', 'fr'];
const roots = ['app/wiki', 'docs', 'infos'];

function walk(directory) {
  const files = [];
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.md$/i.test(entry.name)) files.push(full);
  }
  return files;
}

let rewired = 0;
for (const root of roots) {
  const absoluteRoot = path.join(__dirname, '..', root);
  for (const language of languages) {
    const languageRoot = path.join(absoluteRoot, language);
    for (const file of walk(languageRoot)) {
      const original = fs.readFileSync(file, 'utf8');
      const updated = original.replace(/\]\((?!httpsí:|mailto:|#)([^)\s]+\.md(?:#[^)]+)?)\)/gi, (match, target) => {
        const [targetPath, anchor] = target.split('#');
        const absoluteTarget = path.resolve(path.dirname(file), targetPath);
        const relativeTarget = path.relative(languageRoot, absoluteTarget);
        const languageTarget = path.join(languageRoot, relativeTarget);
        if (!fs.existsSync(languageTarget)) return match;
        const fromDirectory = path.dirname(file);
        let rewritten = path.relative(fromDirectory, languageTarget).replace(/\\/g, '/');
        if (!rewritten.startsWith('.')) rewritten = `./${rewritten}`;
        return `](${rewritten}${anchor ? `#${anchor}` : ''})`;
      });
      if (updated !== original) {
        fs.writeFileSync(file, updated, 'utf8');
        rewired += 1;
      }
    }
  }
}

console.log(`Rewired language-local documentation links in ${rewired} files.`);
