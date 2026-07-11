#!/usr/bin/env node

/*
 * Static contract for fixed HTML copy. It intentionally reports rather than
 * mutates source: dynamic data, code examples, and legacy/vendor pages stay in
 * the explicit exception list while newly added product copy is visible in CI.
 */
const fs = require('fs');
const path = require('path');
const parse5 = require(path.join(__dirname, '..', 'app', 'node_modules', 'parse5'));

const root = path.join(__dirname, '..');
const exceptions = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n-exceptions.json'), 'utf8'));
const languageCodes = new Set(['en', 'de', 'es', 'fr']);
const ignoredTags = new Set(['script', 'style', 'template', 'svg', 'noscript', 'pre', 'code']);
const requestedFiles = (() => {
  const index = process.argv.indexOf('--files');
  const value = index >= 0 ? process.argv[index + 1] : process.env.I18N_LITERAL_FILES;
  return value ? new Set(value.split(',').map(file => file.trim()).filter(Boolean)) : null;
})();

function walk(dir, result = []) {
  if (!fs.existsSync(dir)) return result;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'docs_archive') continue;
    const relativeEntry = path.relative(root, path.join(dir, entry.name)).replace(/\\/g, '/');
    if ((exceptions.ignoredPaths || []).some(prefix => relativeEntry.startsWith(prefix))) continue;
    // Keep generated scratch copies and patch staging trees out of the active
    // product inventory. They are useful forensic artifacts, but are not
    // shipped surfaces and would otherwise drown out the actionable report.
    if (/^(?:\.superpowers|\.tmp|naked|new_patch|released_patches)/.test(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (/\.html$/i.test(entry.name)) result.push(full);
  }
  return result;
}

function hasTranslationMarker(node) {
  const attrs = new Set((node.attrs || []).map(attr => attr.name.toLowerCase()));
  return [...attrs].some(name => name === 'data-i18n' || name.startsWith('data-i18n-'));
}

function normalizedText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isCandidate(text) {
  if (!text || text.length < 2 || !/[\p{L}]/u.test(text)) return false;
  if (/^(httpsí:\/\/|www\.|[\w.-]+@)/i.test(text)) return false;
  if (/^[\w./:#?=&+%${}()[\]-]+$/.test(text)) return false;
  return true;
}

function visit(node, state, findings, file) {
  if (!node) return;
  if (node.nodeName && ignoredTags.has(node.nodeName.toLowerCase())) return;
  const attrs = node.attrs || [];
  const attrMap = Object.fromEntries(attrs.map(attr => [attr.name.toLowerCase(), attr.value || '']));
  const marked = hasTranslationMarker(node) || Boolean(attrMap['aria-hidden'] === 'true');

  if (node.nodeName === '#text') {
    const text = normalizedText(node.value);
    if (isCandidate(text) && !state.marked && !(exceptions.literalPatterns || []).some(pattern => new RegExp(pattern, 'i').test(text))) {
      findings.push({ file: path.relative(root, file).replace(/\\/g, '/'), text });
    }
    return;
  }

  const nextState = { marked: state.marked || marked };
  (node.childNodes || []).forEach(child => visit(child, nextState, findings, file));
}

const findings = [];
const htmlFiles = walk(root).filter(file => {
  if (!requestedFiles) return true;
  const relative = path.relative(root, file).replace(/\\/g, '/');
  return requestedFiles.has(relative) || requestedFiles.has(path.basename(relative));
});
for (const file of htmlFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const document = parse5.parse(source);
  visit(document, { marked: false }, findings, file);
}

const unique = [...new Map(findings.map(item => [`${item.file}:${item.text}`, item])).values()];
const report = { generatedAt: new Date().toISOString(), files: htmlFiles.length, findings: unique };
const output = path.join(root, 'app', 'locales', 'literal-inventory.json');
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ files: report.files, findings: unique.length, report: path.relative(root, output) }, null, 2));
if (process.argv.includes('--strict') && unique.length > 0) process.exitCode = 1;
