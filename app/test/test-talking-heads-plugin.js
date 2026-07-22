/**
 * Lightweight structure check for the local-only Talking Heads plugin.
 */

const fs = require('fs');
const path = require('path');

const pluginDir = path.join(__dirname, '../plugins/talking-heads');
const requiredFiles = [
  'main.js',
  'plugin.json',
  'engines/asset-sprite-library.js',
  'engines/animation-controller.js',
  'utils/cache-manager.js',
  'utils/role-manager.js',
  'utils/avatar-lottery-manager.js',
  'ui.html',
  'overlay.html',
  'assets/ui.js',
  'assets/overlay.js',
  'assets/overlay.css',
  'README.md'
];

for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(pluginDir, relativePath))) {
    throw new Error(`Missing Talking Heads plugin file: ${relativePath}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'plugin.json'), 'utf8'));
if (manifest.config.assetPack !== 'boba' || manifest.config.avatarLotteryEnabled !== true) {
  throw new Error('Talking Heads defaults must enable the local Boba asset pack and avatar lottery');
}

const AssetSpriteLibrary = require(path.join(pluginDir, 'engines/asset-sprite-library.js'));
const catalog = new AssetSpriteLibrary().getCatalog();
const packIds = catalog.packs.map((pack) => pack.id);
if (!['boba', 'kenney', 'rgs'].every((packId) => packIds.includes(packId))) {
  throw new Error('Talking Heads must expose Boba, Kenney, and vector character libraries');
}

console.log('Talking Heads local-only structure check passed.');
