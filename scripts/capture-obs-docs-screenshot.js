'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { ObsDocsCaptureSession, TUTORIAL_SCENE_NAME } = require('./lib/obs-docs-capture');

const REPO_ROOT = path.resolve(__dirname, '..');
const LOCALES = new Set(['de', 'en', 'es', 'fr']);

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${name} must be a positive integer`);
  return number;
}

function localOverlayUrl(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('OBS documentation captures may use only a local LTTH overlay URL'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('OBS documentation captures may use only a local LTTH overlay URL');
  }
  return url.toString();
}

function localPreparationUrl(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('OBS documentation captures may use only a local LTTH preparation URL'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('OBS documentation captures may use only a local LTTH preparation URL');
  }
  return url.toString();
}

function localObsWebSocketUrl(value) {
  let url;
  try { url = new URL(value); } catch (_) { throw new Error('OBS documentation captures may use only a local OBS WebSocket URL'); }
  if (!['ws:', 'wss:'].includes(url.protocol) || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('OBS documentation captures may use only a local OBS WebSocket URL');
  }
  return url.toString();
}

function parseObsConnectionOptions(environment = process.env) {
  if (environment.OBS_DOCS_CAPTURE_ALLOW !== 'yes') {
    throw new Error('OBS_DOCS_CAPTURE_ALLOW=yes is required before changing the tutorial scene');
  }
  return {
    obsUrl: localObsWebSocketUrl(environment.OBS_WEBSOCKET_URL || 'ws://127.0.0.1:4455'),
    password: environment.OBS_WEBSOCKET_PASSWORD || '',
    settleMs: positiveInteger(environment.OBS_DOCS_SETTLE_MS || 1000, 'OBS_DOCS_SETTLE_MS')
  };
}

function parseCaptureOptions(environment = process.env) {
  const connection = parseObsConnectionOptions(environment);
  const plugin = String(environment.OBS_DOCS_PLUGIN || '').trim();
  const locale = String(environment.OBS_DOCS_LOCALE || '').trim();
  if (!/^[a-z0-9-]+$/.test(plugin)) throw new Error('OBS_DOCS_PLUGIN must be a published plugin id');
  if (!LOCALES.has(locale)) throw new Error('OBS_DOCS_LOCALE must be de, en, es, or fr');
  let preparationBody = null;
  if (environment.OBS_DOCS_PREPARE_JSON) {
    try { preparationBody = JSON.parse(environment.OBS_DOCS_PREPARE_JSON); } catch (_) { throw new Error('OBS_DOCS_PREPARE_JSON must be valid JSON'); }
  }
  return {
    sceneName: TUTORIAL_SCENE_NAME,
    plugin,
    locale,
    overlayUrl: localOverlayUrl(environment.OBS_DOCS_OVERLAY_URL),
    width: positiveInteger(environment.OBS_DOCS_WIDTH || 1280, 'OBS_DOCS_WIDTH'),
    height: positiveInteger(environment.OBS_DOCS_HEIGHT || 720, 'OBS_DOCS_HEIGHT'),
    ...connection,
    preparationUrl: environment.OBS_DOCS_PREPARE_URL ? localPreparationUrl(environment.OBS_DOCS_PREPARE_URL) : null,
    preparationBody
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runLocalPreparation(options) {
  if (!options.preparationUrl) return null;
  await wait(options.settleMs);
  const response = await fetch(options.preparationUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: options.preparationBody === null ? undefined : JSON.stringify(options.preparationBody),
    redirect: 'manual'
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('Local overlay preparation must not redirect');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) {
    throw new Error(`Local overlay preparation failed with HTTP ${response.status}`);
  }
  // Let the browser source consume the verified local event before OBS takes
  // the source screenshot. This never starts output and is skipped when no
  // local preparation was requested.
  await wait(options.settleMs);
  return { url: options.preparationUrl, status: response.status, body };
}

function decodePngData(imageData, { width, height }) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(imageData || '');
  if (!match) throw new Error('OBS screenshot is not a base64 PNG data URL');
  const image = Buffer.from(match[1], 'base64');
  if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('OBS screenshot is not a PNG');
  if (image.length < 2048) throw new Error('OBS screenshot is blank or implausibly small');
  if (image.readUInt32BE(16) !== width || image.readUInt32BE(20) !== height) {
    throw new Error('OBS screenshot dimensions do not match the configured browser source');
  }
  return image;
}

function assertPngIsVisible(image) {
  const colorType = image[25];
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error('OBS screenshot has an unsupported PNG color format');
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  const idat = [];
  for (let offset = 8; offset < image.length;) {
    const length = image.readUInt32BE(offset);
    const type = image.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(image.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const data = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const previous = Buffer.alloc(stride);
  const colors = new Set();
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
        colors.add(`${red}:${green}:${blue}`);
        minimum = Math.min(minimum, red, green, blue);
        maximum = Math.max(maximum, red, green, blue);
      }
    }
    row.copy(previous);
  }
  if (colors.size <= 1 || maximum === minimum) throw new Error('OBS screenshot is visually blank');
  return { colors: colors.size, contrast: maximum - minimum };
}

function updateReport(record) {
  const reportPath = path.join(REPO_ROOT, 'screenshots', 'docs-obs-capture-report.json');
  const existing = fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, 'utf8'))
    : { schemaVersion: 2, targetCount: null, records: [] };
  const records = Array.isArray(existing.records) ? existing.records.filter((entry) => !(entry.plugin === record.plugin && entry.locale === record.locale)) : [];
  records.push(record);
  records.sort((left, right) => `${left.plugin}:${left.locale}`.localeCompare(`${right.plugin}:${right.locale}`));
  const report = {
    schemaVersion: 2,
    targetCount: Number.isInteger(existing.targetCount) ? existing.targetCount : null,
    generatedAt: new Date().toISOString(),
    records
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

function resetObsCaptureReport({ targetCount }) {
  if (!Number.isInteger(targetCount) || targetCount <= 0) {
    throw new Error('OBS capture report target count must be a positive integer');
  }
  const reportPath = path.join(REPO_ROOT, 'screenshots', 'docs-obs-capture-report.json');
  const report = {
    schemaVersion: 2,
    targetCount,
    generatedAt: new Date().toISOString(),
    records: []
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return reportPath;
}

async function captureWithObs(options, { createObs } = {}) {
  options = {
    ...options,
    obsUrl: localObsWebSocketUrl(options.obsUrl),
    overlayUrl: localOverlayUrl(options.overlayUrl),
    preparationUrl: options.preparationUrl ? localPreparationUrl(options.preparationUrl) : null,
    width: positiveInteger(options.width, 'OBS capture width'),
    height: positiveInteger(options.height, 'OBS capture height')
  };
  const OBSWebSocket = createObs || require(path.join(REPO_ROOT, 'app', 'node_modules', 'obs-websocket-js')).default;
  const obs = new OBSWebSocket();
  let connected = false;
  try {
    await obs.connect(options.obsUrl, options.password);
    connected = true;
    let preparation = null;
    const receipt = await new ObsDocsCaptureSession(obs).capture({
      ...options,
      beforeScreenshot: async () => { preparation = await runLocalPreparation(options); }
    });
    if (!receipt.restored) throw new Error('OBS documentation capture did not restore the tutorial scene');
    const image = decodePngData(receipt.imageData, options);
    const visible = assertPngIsVisible(image);
    const sourceImage = decodePngData(receipt.sourceImageData, options);
    const sourceVisible = assertPngIsVisible(sourceImage);
    const outputPath = path.join(REPO_ROOT, 'screenshots', 'docs', 'obs', options.plugin, `${options.locale}.png`);
    const sourceOutputPath = path.join(REPO_ROOT, 'screenshots', 'docs', 'obs', options.plugin, `${options.locale}.source.png`);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, image);
    fs.writeFileSync(sourceOutputPath, sourceImage);
    const record = {
      plugin: options.plugin,
      locale: options.locale,
      sceneName: receipt.sceneName,
      sourceName: receipt.sourceName,
      overlayUrl: options.overlayUrl,
      screenshotPath: path.relative(REPO_ROOT, outputPath).replace(/\\/g, '/'),
      sha256: crypto.createHash('sha256').update(image).digest('hex'),
      sourceScreenshotPath: path.relative(REPO_ROOT, sourceOutputPath).replace(/\\/g, '/'),
      sourceSha256: crypto.createHash('sha256').update(sourceImage).digest('hex'),
      width: options.width,
      height: options.height,
      bytes: image.length,
      visible: receipt.visible,
      nonEmpty: true,
      colors: visible.colors,
      contrast: visible.contrast,
      sourceVisible: true,
      sourceNonEmpty: true,
      sourceColors: sourceVisible.colors,
      sourceContrast: sourceVisible.contrast,
      restored: receipt.restored,
      initialSourceNames: receipt.initialSourceNames,
      restoredSourceNames: receipt.restoredSourceNames,
      initialSceneItems: receipt.initialSceneItems,
      restoredSceneItems: receipt.restoredSceneItems,
      temporarySceneItemRemoved: receipt.temporarySceneItemRemoved,
      temporaryInputRemoved: receipt.temporaryInputRemoved,
      streamActive: receipt.streamActive,
      recordActive: receipt.recordActive,
      outputChecks: receipt.outputChecks
    };
    if (preparation) record.preparation = preparation;
    updateReport(record);
    return record;
  } finally {
    if (connected && typeof obs.disconnect === 'function') await obs.disconnect();
  }
}

async function main() {
  const options = parseCaptureOptions(process.env);
  const record = await captureWithObs(options);
  console.log(`Captured verified OBS preview: ${record.plugin}/${record.locale} (${record.screenshotPath})`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`OBS documentation capture failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertPngIsVisible,
  captureWithObs,
  decodePngData,
  parseCaptureOptions,
  parseObsConnectionOptions,
  resetObsCaptureReport,
  runLocalPreparation
};
