'use strict';

const path = require('path');
const { runPluginDocsLiveVerification } = require('./lib/plugin-docs-live-verifier');

const ROOT = path.resolve(__dirname, '..');
const baseUrl = process.env.LIVE_DOCS_BASE_URL || 'https://ltth.app';
const outputDir = process.env.LIVE_DOCS_OUTPUT_DIR || path.join(ROOT, 'artifacts', 'plugin-docs-live', new Date().toISOString().replace(/[:.]/g, '-'));
const puppeteer = require(path.join(ROOT, 'app', 'node_modules', 'puppeteer'));

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const report = await runPluginDocsLiveVerification({ repoRoot: ROOT, baseUrl, outputDir, browser });
    console.log(`${report.success ? 'OK' : 'FAILED'}: ${report.completedCount}/${report.targetCount} deployed plugin documentation variants verified.`);
    console.log(`Report: ${path.join(outputDir, 'report.json')}`);
    if (!report.success) process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(`Live plugin documentation verification failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
