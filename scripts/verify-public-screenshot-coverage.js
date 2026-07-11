'use strict';

const fs = require('fs');
const path = require('path');
const { buildSpec, LOCALES } = require('./product-screenshot-spec');

const REPO_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_ROOT = path.join(REPO_ROOT, 'screenshots');
const MANIFEST_PATH = path.join(SCREENSHOT_ROOT, 'product-capture-manifest.json');

function outputPath(asset, locale) {
  const relative = asset.replace(/^\/screenshots\/features\//, '');
  const root = locale === 'en' ? SCREENSHOT_ROOT : path.join(SCREENSHOT_ROOT, locale);
  return path.join(root, 'features', relative);
}

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not a PNG: ${filePath}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length };
}

function main() {
  const spec = buildSpec(REPO_ROOT);
  if (spec.assets.length < 1) throw new Error('No public screenshot assets are defined');
  if (JSON.stringify(spec.locales) !== JSON.stringify(LOCALES)) throw new Error('Locale order or set changed');
  if (!fs.existsSync(MANIFEST_PATH)) throw new Error('Missing product-capture-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== spec.version) throw new Error(`Manifest version ${manifest.version} does not match ${spec.version}`);
  if (manifest.failures?.length) throw new Error(`${manifest.failures.length} capture failures remain`);
  if (manifest.outputs?.length !== 304) throw new Error(`Expected 304 outputs, found ${manifest.outputs?.length || 0}`);

  const problems = [];
  for (const locale of LOCALES) {
    for (const asset of spec.assets) {
      const filePath = outputPath(asset.canonical, locale);
      if (!fs.existsSync(filePath)) {
        problems.push(`${locale}/${asset.id}: missing`);
        continue;
      }
      try {
        const size = readPngSize(filePath);
        if (size.width !== asset.viewport.width || size.height !== asset.viewport.height) {
          problems.push(`${locale}/${asset.id}: ${size.width}x${size.height}, expected ${asset.viewport.width}x${asset.viewport.height}`);
        }
        if (size.bytes < 1024) problems.push(`${locale}/${asset.id}: suspiciously small PNG`);
      } catch (error) {
        problems.push(`${locale}/${asset.id}: ${error.message}`);
      }
    }
  }
  if (problems.length) throw new Error(problems.join('\n'));
  console.log(`OK: ${spec.assets.length} public IDs × ${LOCALES.length} locales = ${manifest.outputs.length} valid Cid PNGs`);
}

main();
