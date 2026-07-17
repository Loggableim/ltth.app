'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { LOCALES, buildDocsSpec } = require('./docs-screenshot-spec');
const { isAllowedCaptureNetworkUrl } = require('./lib/capture-receipt');
const { validateDocsCaptureReceipts } = require('./verify-docs-capture-receipts');

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
validateDocsCaptureReceipts({ manifest, assets: spec.assets, locales: LOCALES });

const expected = new Map();
for (const locale of LOCALES) {
  for (const asset of spec.assets) expected.set(`${locale}:${asset.id}`, { locale, asset });
}
assert.strictEqual((manifest.outputs || []).length, expected.size, `Expected ${expected.size} current tutorial captures`);

const seen = new Set();
  const hashesByLocale = new Map();
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
  assert.deepStrictEqual(output.workflow, asset.workflow, `${key} workflow contract drifted`);
  assert.ok(output.receipt, `${key} is missing its CaptureReceipt`);
  assert.deepStrictEqual(output.receipt?.operations, asset.workflow.operations, `${key} receipt operations drifted`);
  assert.ok(output.receipt?.postconditions?.every((condition) => condition.passed === true), `${key} has an unfulfilled receipt postcondition`);
  assert.strictEqual(output.receipt?.schemaVersion, 2, `${key} must use CaptureReceipt schema 2`);
  assert.ok(Array.isArray(output.receipt?.network), `${key} is missing network evidence`);
  assert.ok(output.receipt.network.every((entry) => isAllowedCaptureNetworkUrl(entry.url)), `${key} contacted a non-local origin`);
  assert.deepStrictEqual(output.receipt?.console, [], `${key} has browser console errors`);
  assert.ok(Array.isArray(output.receipt?.interactions), `${key} is missing executed interaction evidence`);
  if (asset.workflow.captureRule?.stateChange) {
    const interactionConditions = asset.workflow.postconditions.filter((condition) => condition.type === 'interaction');
    assert.ok(interactionConditions.length, `${key} declares a state change without an interaction postcondition`);
    for (const condition of interactionConditions) {
      const expected = condition.expected || {};
      assert.ok(output.receipt.interactions.some((interaction) => (
        interaction.status === 'performed'
        && interaction.selector === condition.selector
        && interaction.type === expected.type
        && (expected.changed === undefined || interaction.changed === expected.changed)
      )), `${key} is missing the declared executed interaction`);
    }
  }
  assert.strictEqual(output.state?.lang, locale, `${key} document language is not localized`);
  assert.strictEqual(output.state?.i18n, locale, `${key} plugin i18n language is not localized`);
  assert.strictEqual(output.state?.theme, 'cid', `${key} was not captured in the Cid theme`);
  assert.strictEqual(output.focus?.selector, asset.selector, `${key} did not focus its declared UI anchor`);
  assert.ok(Array.isArray(output.preparation), `${key} did not record its capture preparation list`);
  for (const preparation of output.preparation) {
    const isTabActivation = preparation?.type === 'activate-tab';
    const isTimerCreation = asset.guideId === 'advanced-timer'
      && asset.stepId === 'timer-overlay'
      && preparation?.type === 'create-demo-timer'
      && preparation.selector === '#timer-form button[type="submit"]';
    const isTimerOverlayUrl = asset.guideId === 'advanced-timer'
      && asset.stepId === 'timer-overlay'
      && preparation?.type === 'use-created-overlay-url'
      && preparation.selector === '#timer-container'
      && typeof preparation.timerId === 'string'
      && preparation.timerId.length > 0;
    const isGoalCreation = asset.guideId === 'goals'
      && asset.stepId === 'goal-overlay'
      && preparation?.type === 'create-demo-goal'
      && preparation.selector === '#goal-form button[type="submit"]';
    const isGoalOverlayUrl = asset.guideId === 'goals'
      && asset.stepId === 'goal-overlay'
      && preparation?.type === 'use-created-overlay-url'
      && preparation.selector === '#goal-container'
      && typeof preparation.goalId === 'string'
      && preparation.goalId.length > 0;
    assert.ok(isTabActivation || isTimerCreation || isTimerOverlayUrl || isGoalCreation || isGoalOverlayUrl,
      `${key} recorded an unrecognized capture preparation`);
  }
  assert.strictEqual(output.focus?.selector, asset.selector, `${key} did not focus its declared product anchor`);
  const relative = asset.canonical.replace(/^\/screenshots\//, '');
  const file = path.join(ROOT, 'screenshots', locale === 'en' ? relative : path.join(locale, relative));
  assert.strictEqual(output.path, path.relative(ROOT, file).replace(/\\/g, '/'), `${key} wrote to an unexpected image path`);
  assert.ok(fs.existsSync(file), `${key} screenshot file is missing`);
  const png = pngDetails(file);
  // Product captures are direct, anchor-centred crops. Verify both the
  // recorded crop bounds and the PNG dimensions instead of requiring a full
  // viewport screenshot with unreadably small controls.
  assert.ok(output.screenshotClip, `${key} did not record its product crop`);
  const imageCrop = asset.workflow.captureRule.imageCrop || {};
  assert.strictEqual(output.screenshotClip.width, Math.min(output.state?.viewport?.clientWidth || 0, imageCrop.width || 640), `${key} crop width is wrong`);
  assert.strictEqual(output.screenshotClip.height, Math.min(output.state?.viewport?.height || 0, imageCrop.height || 560), `${key} crop height is wrong`);
  assert.strictEqual(png.width, output.screenshotClip.width, `${key} screenshot width is wrong`);
  assert.strictEqual(png.height, output.screenshotClip.height, `${key} screenshot height is wrong`);
  // Documentation screenshots must show a real product surface. A transparent
  // or uniform overlay is not a usable workflow image, even when an event would
  // make it render later. The sampled output can be deliberately dark, so only
  // reject genuinely uniform or implausibly small images here.
  assert.ok(png.bytes > 2048, `${key} screenshot is blank or implausibly small`);
  assert.ok(png.colors > 1 && png.contrast > 0, `${key} screenshot is visually blank or lacks meaningful contrast`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  assert.strictEqual(output.sha256, hash, `${key} manifest hash does not match screenshot`);
  const localeHashes = hashesByLocale.get(locale) || new Set();
  assert.ok(!localeHashes.has(hash), `${key} duplicates a different tutorial screenshot in the same locale`);
  localeHashes.add(hash);
  hashesByLocale.set(locale, localeHashes);
}

assert.strictEqual(seen.size, expected.size, 'Not every guide step and locale was captured');
console.log(`OK: ${spec.assets.length} tutorial actions × ${LOCALES.length} locales = ${expected.size} verified, distinct product captures.`);
