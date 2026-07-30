const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const AssetRegistry = require(
  '../plugins/streamalchemy/backend/streammonsters/asset-registry'
);
const {
  TEMPLATE_CATALOG,
  FURRY_ASSET_VERSION,
  getEvolutionAssetPath
} = require('../plugins/streamalchemy/backend/streammonsters/catalog');

describe('Stream Monsters furry template assets', () => {
  test('ships one canonical schema-3 WebP for every template and evolution stage', () => {
    const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
    const manifestPath = path.join(
      pluginDir,
      'assets',
      'streammonsters',
      'furry',
      'manifest.json'
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const assetsByKey = new Map(
      manifest.assets.map(asset => [`${asset.templateId}:${asset.stage}`, asset])
    );
    const hashes = new Set();

    expect(manifest).toEqual(expect.objectContaining({
      schemaVersion: 3,
      assetVersion: FURRY_ASSET_VERSION,
      pack: 'furry',
      productionMode: 'bundled-only'
    }));
    expect(manifest.assets).toHaveLength(72);
    expect(assetsByKey.size).toBe(72);

    TEMPLATE_CATALOG.forEach(template => {
      expect(template.assetPath).toBe(
        `/plugins/streamalchemy/assets/streammonsters/furry/${template.templateId}.webp`
      );
      [1, 2, 3].forEach(stage => {
        const asset = assetsByKey.get(`${template.templateId}:${stage}`);
        const publicUrl = getEvolutionAssetPath(template, stage);
        expect(asset).toEqual(expect.objectContaining({
          templateId: template.templateId,
          element: template.element,
          species: template.species,
          stage,
          assetPath: publicUrl.replace('/plugins/streamalchemy/', ''),
          mediaType: 'image/webp',
          dimensions: [1024, 1024],
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
        }));
        expect(publicUrl).toMatch(/\.webp$/);

        const absolutePath = path.join(pluginDir, asset.assetPath);
        const bytes = fs.readFileSync(absolutePath);
        expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
        expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
        const hash = crypto.createHash('sha256').update(bytes).digest('hex');
        hashes.add(hash);
        expect(hash).toBe(asset.sha256);
      });
    });

    expect(hashes.size).toBe(72);
    const registry = new AssetRegistry({ pluginDir });
    expect(registry.getIntegrity()).toEqual({
      assetVersion: FURRY_ASSET_VERSION,
      expected: 72,
      available: 72,
      healthy: true
    });
  });

  test('keeps every canonical product preview on WebP', () => {
    const pluginDir = path.join(process.cwd(), 'plugins', 'streamalchemy');
    const creatorUi = fs.readFileSync(
      path.join(pluginDir, 'streammonsters-ui.html'),
      'utf8'
    );
    expect(creatorUi).toContain(
      '/plugins/streamalchemy/assets/streammonsters/furry/ashfang.webp'
    );
    expect(creatorUi).toContain(
      '/plugins/streamalchemy/assets/streammonsters/furry/ripple.webp'
    );
    expect(creatorUi).not.toMatch(
      /\/plugins\/streamalchemy\/assets\/streammonsters\/furry\/[^"' ]+\.png/
    );
  });
});
