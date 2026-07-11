'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'https://ltth.app';
const TARGET_LANGS = (process.env.SCREENSHOT_LANGS || 'en,de')
  .split(',')
  .map(value => value.trim().toLowerCase())
  .filter(Boolean);
const VIEWPORT = {
  width: Number(process.env.SCREENSHOT_VIEWPORT_WIDTH || 1280),
  height: Number(process.env.SCREENSHOT_VIEWPORT_HEIGHT || 800),
};
const WAIT_AFTER_LOAD_MS = Number(process.env.SCREENSHOT_WAIT_AFTER_LOAD_MS || 800);
const TIMEOUT_MS = Number(process.env.SCREENSHOT_TIMEOUT_MS || 60000);

const REPO_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const FEATURES_ROOT = path.join(SCREENSHOT_ROOT, 'features');
const DE_SCREENSHOT_ROOT = path.join(SCREENSHOT_ROOT, 'de');
const DE_FEATURES_ROOT = path.join(DE_SCREENSHOT_ROOT, 'features');
const CAPTURE_MANIFEST_PATH = path.join(SCREENSHOT_ROOT, 'capture-manifest.json');

const ROOT_PAGES = [
  { locale: 'en', file: '01_homepage_hero.png', page: '/index-en.html' },
  { locale: 'en', file: '02_features_page.png', page: '/features-en.html' },
  { locale: 'en', file: '03_plugins_page.png', page: '/plugins-en.html' },
  { locale: 'en', file: '04_download_page.png', page: '/download-en.html' },
  { locale: 'de', file: '01_homepage_hero_de.png', page: '/index.html?lang=de' },
  { locale: 'de', file: '02_features_page_de.png', page: '/features.html?lang=de' },
  { locale: 'de', file: '03_plugins_page_de.png', page: '/plugins.html?lang=de' },
  { locale: 'de', file: '04_download_page_de.png', page: '/download.html?lang=de' },
];

const FEATURE_PAGES = [
  'alerts',
  'soundboard',
  'flow-engine',
  'goals',
  'dashboard',
  'overlays',
  'multicam',
  'osc-bridge',
  'animazingpal',
  'vdoninja',
  'viewer-xp',
  'security',
  'plugin-system',
  'slot-machine',
  'game-engine',
  'emoji-rain',
  'auto-updater',
  'chat-commands',
  'tikfinity-api',
];

function normalizeUrl(pathPart) {
  if (pathPart.startsWith('http://') || pathPart.startsWith('https://')) {
    return pathPart;
  }

  const trimmed = BASE_URL.replace(/\/$/, '');
  return `${trimmed}${pathPart.startsWith('/') ? '' : '/'}${pathPart}`;
}

function buildTargets(languages) {
  const targets = [];

  for (const entry of ROOT_PAGES) {
    if (!languages.includes(entry.locale)) {
      continue;
    }

    const outputPath = path.join(
      entry.locale === 'en' ? SCREENSHOT_ROOT : DE_SCREENSHOT_ROOT,
      entry.file
    );

    targets.push({
      name: `${entry.file} (${entry.locale})`,
      url: normalizeUrl(entry.page),
      outputPath,
    });
  }

  for (const slug of FEATURE_PAGES) {
    if (languages.includes('en')) {
      targets.push({
        name: `${slug}.png (en)`,
        url: normalizeUrl(`/features/${slug}.html`),
        outputPath: path.join(FEATURES_ROOT, `${slug}.png`),
      });
    }

    if (languages.includes('de')) {
      targets.push({
        name: `${slug}.png (de)`,
        url: normalizeUrl(`/features/${slug}.html?lang=de`),
        outputPath: path.join(DE_FEATURES_ROOT, `${slug}.png`),
      });
    }
  }

  return targets;
}

async function main() {
  const locales = TARGET_LANGS.filter(locale => ['en', 'de'].includes(locale));
  const targets = buildTargets(locales);

  if (targets.length === 0) {
    console.log('No locales configured. Use SCREENSHOT_LANGS with en,de or en or de.');
    return;
  }

  const uniqueDirs = new Set(targets.map(target => path.dirname(target.outputPath)));
  for (const dir of uniqueDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const versionResponse = await fetch(normalizeUrl('/version.json'));
  if (!versionResponse.ok) {
    throw new Error(`Could not read release metadata: HTTP ${versionResponse.status}`);
  }
  const version = await versionResponse.json();
  if (!version.version) {
    throw new Error('Release metadata does not include a version.');
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  console.log(`Capturing ${targets.length} screenshots for locales: ${locales.join(', ')}`);

  let passed = 0;
  let failed = 0;

  for (const target of targets) {
    try {
      await page.goto(target.url, { waitUntil: 'networkidle2', timeout: TIMEOUT_MS });
      await page.waitForTimeout(WAIT_AFTER_LOAD_MS);
      await page.screenshot({
        path: target.outputPath,
        type: 'png',
      });
      console.log(`  OK    ${target.name}`);
      passed += 1;
    } catch (error) {
      console.error(`  FAIL  ${target.name}: ${error.message}`);
      failed += 1;
    }
  }

  await browser.close();

  fs.writeFileSync(CAPTURE_MANIFEST_PATH, JSON.stringify({
    version: version.version,
    source: BASE_URL,
    capturedAt: new Date().toISOString(),
    viewport: VIEWPORT,
    screenshots: targets.map(target => path.relative(REPO_ROOT, target.outputPath).replace(/\\/g, '/')),
  }, null, 2) + '\n');

  console.log(`\nDone: ${passed} captured, ${failed} failed`);
  console.log(`Output root: ${SCREENSHOT_ROOT}`);
  console.log(`Version manifest: ${CAPTURE_MANIFEST_PATH}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
