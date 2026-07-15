const path = require('path');

const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

describe('published plugin catalog', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('requires one guide per published plugin plus Store Admin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);

    expect(catalog.guideIds).toHaveLength(38);
    expect(catalog.guideIds).toContain('store-admin');
    expect(new Set(catalog.guideIds).size).toBe(38);
    expect(catalog.guideIds).toEqual([...catalog.guideIds].sort());
    expect(catalog.manifestIds).toHaveLength(37);
    expect(catalog.storeIds).toContain('visual-fx-frame-webgpu');
    expect(catalog.storeAdmin.manifestPath).toMatch(/plugin-store[\\/]sources[\\/]store-admin[\\/]plugin\.json$/);
  });
});
