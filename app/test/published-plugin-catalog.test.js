const path = require('path');
const fs = require('fs');
const os = require('os');

const { loadPublishedPluginCatalog, readReleasePolicy } = require('../../scripts/lib/published-plugin-catalog');

describe('published plugin catalog', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('requires one guide per published plugin plus Store Admin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const expectedPublicManifestIds = [
      'advanced-timer', 'api-bridge', 'clarityhud', 'coinbattle', 'config-import', 'emoji-rain',
      'fireworks', 'flame-overlay', 'game-engine', 'gcce', 'gift-catalog', 'goals',
      'milestone-leaderboard', 'minecraft-connect', 'multicam', 'openshock', 'quiz-show',
      'soundboard', 'spotlight', 'stt-ticker', 'thermal-printer', 'toptier', 'tts', 'vdoninja',
      'weather-control', 'webgpu-fireworks'
    ];
    const expectedPublicStoreIds = [
      'advanced-timer', 'api-bridge', 'clarityhud', 'coinbattle', 'config-import', 'emoji-rain',
      'fireworks', 'flame-overlay', 'game-engine', 'gcce', 'goals', 'milestone-leaderboard',
      'multicam', 'openshock', 'quiz-show', 'soundboard', 'spotlight', 'store-admin',
      'stt-ticker', 'thermal-printer', 'toptier', 'tts', 'vdoninja', 'weather-control'
    ];

    expect(catalog.guideIds).toContain('store-admin');
    expect(catalog.guideIds).toEqual([...expectedPublicManifestIds, 'store-admin'].sort());
    expect(catalog.manifestIds).toEqual(expectedPublicManifestIds);
    expect(catalog.storeIds).toEqual(expectedPublicStoreIds);
    expect(catalog.storeAdmin.manifestPath).toMatch(/plugin-store[\\/]sources[\\/]store-admin[\\/]plugin\.json$/);
  });

  test('uses the runtime manifest once when a store source mirrors the same plugin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const visualFxManifests = catalog.plugins.filter((plugin) => plugin.id === 'visual-fx-frame-webgpu');

    expect(visualFxManifests).toHaveLength(0);
    expect(catalog.closedBetaIds).toContain('visual-fx-frame-webgpu');
    expect(catalog.manifestIds).toContain('webgpu-fireworks');
    expect(catalog.manifestIds).not.toContain('webgpu-emoji-rain');
    expect(catalog.manifestIds).toContain('weather-control');
    expect(catalog.manifestIds).not.toContain('webgpu-weather-control');
  });

  test('retains the complete local app manifest set, including closed beta plugins', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const localIds = fs.readdirSync(path.join(repoRoot, 'app', 'plugins'))
      .filter((name) => fs.existsSync(path.join(repoRoot, 'app', 'plugins', name, 'plugin.json')))
      .map((name) => JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', name, 'plugin.json'), 'utf8')).id);

    expect(localIds).toHaveLength(37);
    expect(new Set(localIds).size).toBe(localIds.length);
    expect(localIds).toEqual(expect.arrayContaining(catalog.closedBetaIds));
    expect(catalog.aliases).toEqual({ streamalchemy: 'stream-monsters' });
  });
  test('accepts the central public asset owner map and rejects unsafe path or owner values', () => {
    const policy = readReleasePolicy(repoRoot);
    expect([...policy.publicAssetPathOwners.keys()]).toEqual(
      Object.keys(require('../config/plugin-release-policy.json').publicAssetPathOwners)
    );

    for (const [assetPath, owner] of [
      ['/js/../private.js', 'osc-bridge'],
      ['/js/%2e%2e/private.js', 'osc-bridge'],
      ['/js/unsafe.js', 'public-plugin'],
      ['/JS/unsafe.js', 'osc-bridge']
    ]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-public-asset-policy-'));
      try {
        const policyPath = path.join(root, 'app', 'config', 'plugin-release-policy.json');
        fs.mkdirSync(path.dirname(policyPath), { recursive: true });
        fs.writeFileSync(policyPath, JSON.stringify({
          schemaVersion: 1,
          closedBeta: ['osc-bridge'],
          aliases: {},
          publicAssetPathOwners: { [assetPath]: owner }
        }));
        expect(() => readReleasePolicy(root)).toThrow();
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });
});
