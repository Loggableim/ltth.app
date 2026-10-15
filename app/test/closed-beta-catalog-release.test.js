'use strict';

const fs = require('fs');
const path = require('path');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { buildProjections } = require('../../scripts/sync-streammonsters-product');

const ROOT = path.resolve(__dirname, '../..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function publicIdsFor(catalog) {
  return new Set([...catalog.storeIds, ...catalog.plugins.map((plugin) => plugin.id)]);
}

describe('closed-beta public catalog release unit', () => {
  const policy = readJson('app/config/plugin-release-policy.json');

  test('excludes all policy IDs from public catalog while retaining local sources', () => {
    const catalog = loadPublishedPluginCatalog(ROOT);
    const publicIds = publicIdsFor(catalog);

    expect(catalog.closedBetaIds).toEqual([...policy.closedBeta].sort());
    for (const id of policy.closedBeta) {
      expect(publicIds.has(id)).toBe(false);
      const manifestPath = path.join(ROOT, 'app/plugins', id, 'plugin.json');
      expect(fs.existsSync(manifestPath)).toBe(true);
      expect(readJson(path.relative(ROOT, manifestPath)).id).toBe(id);
    }
  });

  test('excludes aliases and their canonical closed-beta IDs from public listings', () => {
    const publicIds = publicIdsFor(loadPublishedPluginCatalog(ROOT));
    for (const [alias, canonical] of Object.entries(policy.aliases)) {
      expect(publicIds.has(alias)).toBe(false);
      expect(publicIds.has(canonical)).toBe(false);
    }
  });

  test('excludes Chatango after the backend source prerequisite is present', () => {
    const catalog = loadPublishedPluginCatalog(ROOT);
    const publicIds = publicIdsFor(catalog);

    expect(fs.existsSync(path.join(ROOT, 'app/plugins/chatango/plugin.json'))).toBe(false);
    expect(publicIds.has('chatango')).toBe(false);
  });

  test('keeps the static fallback cards aligned with the public registry', () => {
    const store = readJson('plugin-store.json');
    const page = fs.readFileSync(path.join(ROOT, 'plugins.html'), 'utf8');
    const grid = page.match(/<div class="plugin-catalog-grid" data-static-plugin-catalog>([\s\S]*?)<\/div>/);
    expect(grid).not.toBeNull();

    const fallbackIds = [...grid[1].matchAll(/data-plugin-id="([^"]+)"/g)]
      .map((match) => match[1])
      .sort();
    const registryIds = store.plugins.map((plugin) => plugin.id).sort();
    expect(fallbackIds).toEqual(registryIds);
    expect(fallbackIds).toHaveLength(24);
  });

  test('does not project a closed-beta Stream Monsters listing back into the Store', () => {
    const contract = readJson('app/plugins/stream-monsters/product-contract.json');
    const storeSource = fs.readFileSync(path.join(ROOT, 'plugin-store.json'), 'utf8').replace(/\r\n?/g, '\n');
    const storeProjection = buildProjections(ROOT, contract)
      .find((projection) => projection.relativePath === 'plugin-store.json');

    expect(policy.closedBeta).toContain(contract.product.id);
    expect(storeProjection.content).toBe(storeSource);
  });
});
