const path = require('path');

const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

describe('published plugin catalog', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('requires one guide per published plugin plus Store Admin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);

    expect(catalog.guideIds).toHaveLength(39);
    expect(catalog.guideIds).toContain('store-admin');
    expect(new Set(catalog.guideIds).size).toBe(39);
    expect(catalog.guideIds).toEqual([...catalog.guideIds].sort());
    expect(catalog.manifestIds).toHaveLength(38);
    expect(catalog.storeIds).toContain('visual-fx-frame-webgpu');
    expect(catalog.storeAdmin.manifestPath).toMatch(/plugin-store[\\/]sources[\\/]store-admin[\\/]plugin\.json$/);
  });

  test('uses the runtime manifest once when a store source mirrors the same plugin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const visualFxManifests = catalog.plugins.filter((plugin) => plugin.id === 'visual-fx-frame-webgpu');

    expect(visualFxManifests).toHaveLength(1);
    expect(visualFxManifests[0].manifestPath).toMatch(/app[\\/]plugins[\\/]visual-fx-frame-webgpu[\\/]plugin\.json$/);
  });
});
