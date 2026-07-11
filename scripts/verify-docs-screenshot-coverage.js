'use strict';

const fs = require('fs');
const path = require('path');
const { LOCALES, buildDocsSpec } = require('./docs-screenshot-spec');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(ROOT, 'screenshots', 'docs-capture-manifest.json');
const spec = buildDocsSpec(ROOT);
if (!fs.existsSync(manifestPath)) throw new Error('Missing screenshots/docs-capture-manifest.json. Run npm run docs:screenshots first.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const problems = [];
if (manifest.version !== spec.version) problems.push(`Manifest version ${manifest.version} does not match ${spec.version}`);
if (manifest.failures?.length) problems.push(`${manifest.failures.length} capture failures remain`);
const expected = spec.assets.length * LOCALES.length;
if (manifest.outputs?.length !== expected) problems.push(`Expected ${expected} outputs, found ${manifest.outputs?.length || 0}`);
for (const locale of LOCALES) {
  for (const asset of spec.assets) {
    const relative = asset.canonical.replace(/^\/screenshots\//, '');
    const file = path.join(ROOT, 'screenshots', locale === 'en' ? relative : path.join(locale, relative));
    if (!fs.existsSync(file) || fs.statSync(file).size === 0) problems.push(`Missing screenshot: ${path.relative(ROOT, file)}`);
  }
}
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; } else console.log(`OK: ${spec.assets.length} tutorial actions × ${LOCALES.length} locales = ${expected} real product screenshots.`);
