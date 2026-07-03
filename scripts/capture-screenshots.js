/**
 * capture-screenshots.js
 * ========================
 * Puppeteer-based screenshot capture for ltth.app feature pages.
 *
 * SETUP:
 *   npm install puppeteer
 *
 * RUN:
 *   node scripts/capture-screenshots.js
 *
 * OUTPUT:
 *   Screenshots are saved to screenshots/features/<name>.png
 *   Each screenshot is taken at 1280×800 viewport.
 *
 * REPLACING MOCKS WITH REAL SCREENSHOTS:
 *   After capturing, replace the files in screenshots/features/ with
 *   real screenshots from a running ltth.app instance. The HTML pages
 *   in features/ reference these paths via the <img src="..."> attributes.
 */

'use strict';

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const MOCKS_DIR = path.resolve(__dirname, '../screenshots/mocks');
const OUTPUT_DIR = path.resolve(__dirname, '../screenshots/features');
const VIEWPORT = { width: 1280, height: 800 };

// Map from mock filename → output filename
const pages = [
  { mock: 'tts.html',           output: 'tts.png' },
  { mock: 'soundboard.html',    output: 'soundboard.png' },
  { mock: 'alerts.html',        output: 'alerts.png' },
  { mock: 'goals.html',         output: 'goals.png' },
  { mock: 'flow-engine.html',   output: 'flow-engine.png' },
  { mock: 'dashboard.html',     output: 'dashboard.png' },
  { mock: 'overlays.html',      output: 'overlays.png' },
  { mock: 'multicam.html',      output: 'multicam.png' },
  { mock: 'osc-bridge.html',    output: 'osc-bridge.png' },
  { mock: 'animazingpal.html',  output: 'animazingpal.png' },
  { mock: 'vdoninja.html',      output: 'vdoninja.png' },
  { mock: 'viewer-xp.html',     output: 'viewer-xp.png' },
  { mock: 'security.html',      output: 'security.png' },
  { mock: 'plugin-system.html', output: 'plugin-system.png' },
  { mock: 'slot-machine.html',  output: 'slot-machine.png' },
  { mock: 'game-engine.html',   output: 'game-engine.png' },
  { mock: 'emoji-rain.html',    output: 'emoji-rain.png' },
  { mock: 'auto-updater.html',  output: 'auto-updater.png' },
  { mock: 'chat-commands.html', output: 'chat-commands.png' },
  { mock: 'tikfinity-api.html', output: 'tikfinity-api.png' },
];

async function main() {
  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  let passed = 0;
  let failed = 0;

  for (const entry of pages) {
    const inputPath = path.join(MOCKS_DIR, entry.mock);
    const outputPath = path.join(OUTPUT_DIR, entry.output);

    if (!fs.existsSync(inputPath)) {
      console.warn(`  SKIP  ${entry.mock} (file not found)`);
      failed++;
      continue;
    }

    try {
      const fileUrl = `file://${inputPath}`;
      await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 15000 });

      // Small pause to allow any CSS animations to settle
      await new Promise(r => setTimeout(r, 300));

      await page.screenshot({ path: outputPath, type: 'png' });
      console.log(`  OK    ${entry.output}`);
      passed++;
    } catch (err) {
      console.error(`  FAIL  ${entry.output}: ${err.message}`);
      failed++;
    }
  }

  await browser.close();

  console.log(`\nDone: ${passed} captured, ${failed} failed`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
