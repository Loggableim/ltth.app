'use strict';

const { captureWithObs, parseObsConnectionOptions, resetObsCaptureReport } = require('./capture-obs-docs-screenshot');
const { buildObsCaptureInventory } = require('./lib/obs-docs-capture-inventory');

const REPO_ROOT = require('path').resolve(__dirname, '..');

function localDocsBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_) {
    throw new Error('OBS documentation capture base URL must be a localhost HTTP URL');
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('OBS documentation capture base URL must be a localhost HTTP URL');
  }
  return url.toString();
}

function parseBatchOptions(environment = process.env) {
  const connection = parseObsConnectionOptions(environment);
  return {
    ...connection,
    baseUrl: localDocsBaseUrl(environment.OBS_DOCS_BASE_URL || 'http://127.0.0.1:3000')
  };
}

async function runBatchObsCapture({
  environment = process.env,
  capture = captureWithObs,
  resetReport = resetObsCaptureReport
} = {}) {
  const options = parseBatchOptions(environment);
  const inventory = buildObsCaptureInventory(REPO_ROOT, { baseUrl: options.baseUrl });
  resetReport({ targetCount: inventory.length });
  const records = [];

  for (const entry of inventory) {
    const record = await capture({
      ...options,
      ...entry,
      preparationUrl: null,
      preparationBody: null
    });
    if (!record || record.plugin !== entry.plugin || record.locale !== entry.locale || record.restored !== true) {
      throw new Error(`OBS capture did not return a restored receipt for ${entry.plugin}/${entry.locale}`);
    }
    records.push(record);
  }
  return records;
}

async function main() {
  const records = await runBatchObsCapture();
  console.log(`Captured ${records.length} verified OBS overlay previews.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`OBS documentation batch capture failed: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { localDocsBaseUrl, parseBatchOptions, runBatchObsCapture };
