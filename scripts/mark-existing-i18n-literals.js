#!/usr/bin/env node

/*
 * Reuse translations that already exist in a locale file. A number of older
 * views had the right copy in JSON but omitted the data-i18n marker in HTML;
 * this pass adds the marker without inventing a second translation key.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const languages = ['en', 'de', 'es', 'fr'];
const ignoredDirs = new Set(['node_modules', '.git', 'docs_archive', '.superpowers', 'naked', 'new_patch', 'released_patches']);
const translatableTags = new Set(['a', 'button', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'label', 'li', 'option', 'p', 'small', 'span', 'strong', 'td', 'th', 'title']);

function walk(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name) || entry.name.startsWith('.tmp')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (/\.html$/i.test(entry.name)) result.push(full);
  }
  return result;
}

function flatten(value, prefix = '', result = []) {
  for (const [key, child] of Object.entries(value || {})) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, full, result);
    else if (typeof child === 'string') result.push([full, child]);
  }
  return result;
}

function htmlDecode(value) {
  return String(value || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function normalize(value) {
  return htmlDecode(value).replace(/\s+/g, ' ').trim();
}

function localeDirectory(file) {
  const relative = path.relative(root, file).replace(/\\/g, '/');
  const pluginMatch = relative.match(/^app\/plugins\/([^/]+)\//);
  if (pluginMatch) return path.join(root, 'app', 'plugins', pluginMatch[1], 'locales');
  if (relative.startsWith('app/public/')) return path.join(root, 'app', 'locales');
  return path.join(root, 'locales');
}

function createLocaleMap(directory) {
  const map = new Map();
  const localeFiles = [];
  for (const language of languages) {
    localeFiles.push(path.join(directory, language + '.json'));
    // The home redesign keeps a separate locale namespace. Include it when
    // scanning public website pages so existing homepage copy can be reused.
    if (directory === path.join(root, 'locales')) {
      localeFiles.push(path.join(directory, 'home-' + language + '.json'));
    }
  }
  for (const file of localeFiles) {
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of flatten(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')))) {
      const normalized = normalize(value);
      if (!normalized || map.has(normalized)) continue;
      map.set(normalized, key);
    }
  }
  return map;
}

function inIgnoredBlock(source, offset) {
  const before = source.slice(0, offset);
  const scriptStart = Math.max(before.lastIndexOf('<script'), before.lastIndexOf('<style'), before.lastIndexOf('<template'), before.lastIndexOf('<svg'));
  const scriptEnd = Math.max(before.lastIndexOf('</script>'), before.lastIndexOf('</style>'), before.lastIndexOf('</template>'), before.lastIndexOf('</svg>'));
  return scriptStart > scriptEnd;
}

let changedFiles = 0;
let marked = 0;
for (const file of walk(root)) {
  const map = createLocaleMap(localeDirectory(file));
  if (!map.size) continue;
  let source = fs.readFileSync(file, 'utf8');
  const tagPattern = /<(a|button|div|em|h1|h2|h3|h4|label|li|option|p|small|span|strong|td|th|title)(\s[^>]*)?>([^<>]+)<\/\1>/gi;
  const next = source.replace(tagPattern, (match, tag, attrs = '', text, offset) => {
    if (inIgnoredBlock(source, offset) || /\bdata-i18n(?:-[\w-]+)?\s*=/.test(attrs)) return match;
    const normalized = normalize(text);
    const key = map.get(normalized);
    if (!key || !/[\p{L}]/u.test(normalized)) return match;
    marked += 1;
    return `<${tag}${attrs} data-i18n="${key}">${text}</${tag}>`;
  });
  if (next !== source) {
    fs.writeFileSync(file, next, 'utf8');
    changedFiles += 1;
  }
}

console.log(`Added ${marked} existing translation markers across ${changedFiles} HTML files.`);
