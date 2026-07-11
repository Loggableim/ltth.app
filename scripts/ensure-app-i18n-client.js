#!/usr/bin/env node

/* Ensure every app/plugin HTML surface that carries locale markers actually
 * boots the shared client. Static OBS overlays and legacy admin pages are
 * served directly, so they cannot rely on the dashboard shell to do this. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appRoot = path.join(root, 'app');
const ignored = new Set(['node_modules', '.git', 'docs_archive', '.superpowers', 'naked', 'new_patch', 'released_patches']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.name.startsWith('.tmp')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.html$/i.test(entry.name)) files.push(full);
  }
  return files;
}

let changed = 0;
for (const file of walk(appRoot)) {
  let html = fs.readFileSync(file, 'utf8');
  if (!/data-i18n(?:[\s-]|=)/i.test(html) || /\/js\/i18n-client\.js/i.test(html)) continue;
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, '    <script src="/js/i18n-client.js"></script>\n</head>');
  } else {
    // A few standalone overlay fragments intentionally omit a document head.
    // Boot the same client before their first style/body node.
    html = '<script src="/js/i18n-client.js"></script>\n' + html;
  }
  fs.writeFileSync(file, html, 'utf8');
  changed += 1;
}
console.log(`Added shared i18n client to ${changed} app/plugin HTML surfaces.`);
