const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const LOCALES = ['de', 'en', 'es', 'fr'];
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.worktrees',
  'app',
  'build-src',
  'docs_archive',
  'naked',
  'new_patch',
  'node_modules',
  'released_patches',
  'screenshots'
]);

function walkHtml(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    // Ignore repository-local scratch directories (for example .tmp_patch*)
    // that are intentionally gitignored and may contain copied HTML fixtures.
    if (entry.isDirectory() && (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.tmp_'))) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walkHtml(fullPath, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(fullPath);
  }
  return output;
}

function flatten(value, prefix = '', output = []) {
  for (const [key, child] of Object.entries(value || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, output);
    else output.push(fullKey);
  }
  return output;
}

function generatedHtmlMarkers() {
  const markers = [];
  for (const file of walkHtml(ROOT)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bdata-i18n(?:-[a-z-]+)?=["'](generated\.[A-Za-z0-9_-]+)["']/g)) {
      markers.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${match[1]}`);
    }
  }
  return markers;
}

function generatedLocaleLeaves() {
  const localeDirectories = [
    path.join(ROOT, 'locales'),
    ...fs.readdirSync(path.join(ROOT, 'plugins'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'plugins', entry.name, 'locales')))
      .map((entry) => path.join(ROOT, 'plugins', entry.name, 'locales'))
  ];
  const leaves = [];
  for (const directory of localeDirectories) {
    for (const locale of LOCALES) {
      const file = path.join(directory, `${locale}.json`);
      if (!fs.existsSync(file)) continue;
      for (const key of flatten(JSON.parse(fs.readFileSync(file, 'utf8')))) {
        if (key.startsWith('generated.')) leaves.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${key}`);
      }
    }
  }
  return leaves;
}

describe('root website i18n migration', () => {
  test('does not leave generated keys on root website or legacy plugin HTML surfaces', () => {
    expect(generatedHtmlMarkers().length).toBe(0);
  });

  test('does not retain generated locale leaves in root website or legacy plugin locale sets', () => {
    expect(generatedLocaleLeaves().length).toBe(0);
  });
});
