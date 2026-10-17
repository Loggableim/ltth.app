'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const MATRIX_PATH = path.join(ROOT, 'docs/coordination/obs-104-acceptance-matrix.json');
const matrix = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
const expectedLocales = ['de', 'en', 'es', 'fr'];
const cases = matrix.items || matrix.cases;

assert.equal(matrix.status, 'source-reviewed-plan-only-no-obs-execution');
assert.equal(matrix.caseCount, 104);
assert.equal(matrix.profileCount, 26);
assert.ok(Array.isArray(cases), 'matrix cases/items array is required');
assert.equal(cases.length, 104);

const ids = new Set();
const resultPaths = new Set();
const localePaths = new Set();
const screenshotPaths = new Set();
const localeCounts = Object.fromEntries(expectedLocales.map((locale) => [locale, 0]));
const statusCounts = {};
const evidenceKinds = ['initial', 'trigger', 'updated', 'negative'];

for (const item of cases) {
  assert.equal(typeof item.plugin, 'string');
  assert.match(item.plugin, /^[a-z0-9][a-z0-9-]*$/);
  assert.ok(expectedLocales.includes(item.locale), `unsupported locale: ${item.locale}`);
  const id = `${item.plugin}:${item.locale}`;
  assert.ok(!ids.has(id), `duplicate case ${id}`);
  ids.add(id);
  localeCounts[item.locale] += 1;
  statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;

  const resultPath = `results/${item.plugin}/${item.locale}/result.json`;
  const localePath = `locale/${item.plugin}/${item.locale}.json`;
  assert.ok(!resultPaths.has(resultPath));
  assert.ok(!localePaths.has(localePath));
  resultPaths.add(resultPath);
  localePaths.add(localePath);

  const caseScreenshots = evidenceKinds.map((kind) => `screenshots/${item.plugin}/${item.locale}/${kind}.png`);
  for (const screenshotPath of caseScreenshots) {
    assert.ok(!screenshotPaths.has(screenshotPath), `duplicate evidence path ${screenshotPath}`);
    screenshotPaths.add(screenshotPath);
  }

  assert.ok(Array.isArray(item.evidenceSources) && item.evidenceSources.length > 0, `${id} has no evidenceSources`);
  for (const source of item.evidenceSources) {
    assert.ok(!path.isAbsolute(source) && !source.split(/[\\/]/).includes('..'), `${id} has unsafe source path`);
    assert.ok(fs.existsSync(path.join(ROOT, source)), `${id} source missing: ${source}`);
  }
}

assert.deepEqual(localeCounts, { de: 26, en: 26, es: 26, fr: 26 });
assert.equal(resultPaths.size, 104);
assert.equal(localePaths.size, 104);
assert.equal(screenshotPaths.size, 416);
assert.deepEqual(statusCounts, {
  'blocked-before-practical-capture': 64,
  'in-process-renderer-fixture-passed-not-obs': 28,
  'ready-for-isolated-fixture-review': 8,
  'retired-control-not-obs': 4
});

const sidekickManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/coordination/obs-sidekick-pilot-transfer-manifest.json'), 'utf8'));
const transferred = new Set(sidekickManifest.effectiveTransfer.files.map((entry) => entry.path));
assert.equal(transferred.size, 544);
assert.equal(transferred.has('pilot/docs/coordination/obs-104-acceptance-matrix.json'), false);
for (const item of cases) {
  for (const source of item.evidenceSources) {
    const guestPath = source.startsWith('app/') || source.startsWith('scripts/') ? `pilot/${source}` : source;
    assert.ok(!transferred.has(guestPath), `104-case source unexpectedly belongs to Sidekick guest transfer: ${guestPath}`);
  }
}

process.stdout.write('PASS 104 planned cases, 26 per locale, unique result/locale/screenshot paths, source references exist; no OBS evidence is asserted.\n');
