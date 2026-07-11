#!/usr/bin/env node

/** Create the mirrored active-documentation tree used by release checks. */
const fs = require('fs');
const path = require('path');

const languages = ['en', 'de', 'es', 'fr'];
const roots = ['app/wiki', 'docs', 'infos'];
const headings = {
  en: ['english'], de: ['deutsch'], es: ['español', 'espanol'], fr: ['français', 'francais']
};

function normalizeHeading(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function selectEmbeddedVariant(content, language) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  lines.forEach((line, index) => {
    const match = line.match(/^##\s+(.+?)$/);
    if (!match) return;
    const heading = normalizeHeading(match[1]);
    if (Object.values(headings).flat().some(candidate => heading === candidate || heading.startsWith(`${candidate} `))) {
      sections.push({ index, heading });
    }
  });
  if (!sections.length) return content;
  const selected = sections.find(section => headings[language].some(candidate => section.heading === candidate || section.heading.startsWith(`${candidate} `)));
  if (!selected) return `# ${path.basename('documentation', '.md')}\n\nTranslation for this page is not available yet.\n`;
  const position = sections.indexOf(selected);
  const end = sections[position + 1]?.index ?? lines.length;
  const result = lines.slice(selected.index, end);
  result[0] = result[0].replace(/^##\s+/, '# ');
  return result.join('\n').trim() + '\n';
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'docs_archive' || entry.name === 'locales' || languages.includes(entry.name)) continue;
      files.push(...walk(full));
    } else if (/\.md$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

let generated = 0;
for (const root of roots) {
  const sourceRoot = path.join(__dirname, '..', root);
  for (const source of walk(sourceRoot)) {
    const relative = path.relative(sourceRoot, source);
    const sourceContent = fs.readFileSync(source, 'utf8');
    for (const language of languages) {
      const targetRoot = path.join(sourceRoot, language);
      const target = path.join(targetRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, selectEmbeddedVariant(sourceContent, language), 'utf8');
      generated += 1;
    }
  }
}

console.log(`Generated ${generated} active documentation locale files.`);
