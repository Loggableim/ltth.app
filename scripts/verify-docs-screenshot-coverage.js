'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { LOCALES, buildDocsSpec } = require('./docs-screenshot-spec');

const ROOT = path.resolve(__dirname, '..');
const manifestPath = path.join(ROOT, 'screenshots', 'docs-capture-manifest.json');
const spec = buildDocsSpec(ROOT);

function specHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify({ version: value.version, assets: value.assets })).digest('hex');
}

function pngDetails(file) {
  const bytes = fs.readFileSync(file);
  const signature = '89504e470d0a1a0a';
  assert.strictEqual(bytes.subarray(0, 8).toString('hex'), signature, `${file} is not a PNG`);
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  assert.strictEqual(bitDepth, 8, `${file} must use 8-bit PNG channels`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  assert.ok(channels, `${file} uses an unsupported PNG color type ${colorType}`);
  const idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const data = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const unique = new Set();
  let minimum = 255;
  let maximum = 0;
  let offset = 0;
  for (let y = 0; y < height; y++) {
    const filter = data[offset++];
    const row = data.subarray(offset, offset + stride);
    offset += stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      if (filter === 1) row[x] = (row[x] + left) & 255;
      if (filter === 2) row[x] = (row[x] + up) & 255;
      if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255;
      if (filter === 4) {
        const predictor = left + up - upLeft;
        const pa = Math.abs(predictor - left);
        const pb = Math.abs(predictor - up);
        const pc = Math.abs(predictor - upLeft);
        row[x] = (row[x] + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)) & 255;
      }
    }
    if (y % 16 === 0) {
      for (let x = 0; x < width; x += 16) {
        const pixel = x * channels;
        const red = row[pixel];
        const green = row[pixel + 1];
        const blue = row[pixel + 2];
        unique.add(`${red}:${green}:${blue}`);
        minimum = Math.min(minimum, red, green, blue);
        maximum = Math.max(maximum, red, green, blue);
      }
    }
    row.copy(previous);
  }
  return { bytes: bytes.length, width, height, colors: unique.size, contrast: maximum - minimum };
}

assert.ok(fs.existsSync(manifestPath), 'Missing screenshots/docs-capture-manifest.json. Run npm run docs:screenshots first.');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.strictEqual(manifest.version, spec.version, 'Capture manifest version is stale');
assert.strictEqual(manifest.specHash, specHash(spec), 'Capture manifest was not recorded from the current step specification');
assert.deepStrictEqual(manifest.failures || [], [], 'Capture failures must be resolved, not carried into the manifest');

const expected = new Map();
for (const locale of LOCALES) {
  for (const asset of spec.assets) expected.set(`${locale}:${asset.id}`, { locale, asset });
}
assert.strictEqual((manifest.outputs || []).length, expected.size, `Expected ${expected.size} current tutorial captures`);

const seen = new Set();
const hashesByGuideLocale = new Map();
for (const output of manifest.outputs || []) {
  const key = `${output.locale}:${output.id}`;
  const expectedEntry = expected.get(key);
  assert.ok(expectedEntry, `Unexpected or stale capture output: ${key}`);
  assert.ok(!seen.has(key), `Duplicate capture output: ${key}`);
  seen.add(key);
  const { locale, asset } = expectedEntry;
  assert.strictEqual(output.guideId, asset.guideId, `${key} guide identity drifted`);
  assert.strictEqual(output.stepId, asset.stepId, `${key} step identity drifted`);
  assert.strictEqual(output.route, asset.route, `${key} route drifted`);
  assert.strictEqual(output.selector, asset.selector, `${key} selector drifted`);
  assert.deepStrictEqual(output.action, asset.action, `${key} action drifted`);
  const expectedOperations = asset.operations || [];
  const expectedPostconditions = asset.postconditions || [];
  assert.strictEqual((output.operations || []).length, expectedOperations.length, `${key} did not execute every declared browser operation`);
  assert.strictEqual((output.postconditions || []).length, expectedPostconditions.length, `${key} did not verify every declared success signal`);
  for (const receipt of output.operations || []) assert.strictEqual(receipt.success, true, `${key} recorded an unsuccessful browser operation`);
  for (const receipt of output.postconditions || []) assert.strictEqual(receipt.success, true, `${key} recorded an unsuccessful success signal`);
  assert.strictEqual(output.state?.lang, locale, `${key} document language is not localized`);
  assert.strictEqual(output.state?.i18n, locale, `${key} plugin i18n language is not localized`);
  assert.strictEqual(output.state?.theme, 'cid', `${key} was not captured in the Cid theme`);
  assert.strictEqual(output.focus?.selector, asset.selector, `${key} did not focus its declared UI anchor`);
  assert.ok(Array.isArray(output.preparation), `${key} did not record its capture preparation list`);
  for (const preparation of output.preparation) {
    assert.ok(['activate-tab', 'capture-only-safe-demo-reveal'].includes(preparation?.type), `${key} used an undeclared capture-only preparation`);
  }
  assert.strictEqual(output.focus?.label, asset.focusText[locale], `${key} did not render its localized capture label`);
  const relative = asset.canonical.replace(/^\/screenshots\//, '');
  const file = path.join(ROOT, 'screenshots', locale === 'en' ? relative : path.join(locale, relative));
  assert.strictEqual(output.path, path.relative(ROOT, file).replace(/\\/g, '/'), `${key} wrote to an unexpected image path`);
  assert.ok(fs.existsSync(file), `${key} screenshot file is missing`);
  const png = pngDetails(file);
  assert.strictEqual(png.width, asset.viewport.width, `${key} screenshot width is wrong`);
  assert.strictEqual(png.height, asset.viewport.height, `${key} screenshot height is wrong`);
  assert.ok(png.bytes > 4096, `${key} screenshot is blank or implausibly small`);
  assert.ok(png.colors > 12 && png.contrast > 20, `${key} screenshot is visually blank or lacks meaningful contrast`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.strictEqual(output.sha256, hash, `${key} manifest hash does not match screenshot`);
  const guideLocale = `${locale}:${asset.guideId}`;
  const guideHashes = hashesByGuideLocale.get(guideLocale) || new Set();
  assert.ok(!guideHashes.has(hash), `${key} duplicates a different step image in the same guide and locale`);
  guideHashes.add(hash);
  hashesByGuideLocale.set(guideLocale, guideHashes);
}

assert.strictEqual(seen.size, expected.size, 'Not every guide step and locale was captured');
console.log(`OK: ${spec.assets.length} tutorial actions × ${LOCALES.length} locales = ${expected.size} verified, distinct product captures.`);
