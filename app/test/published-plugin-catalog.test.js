const path = require('path');
const fs = require('fs');
const os = require('os');

const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

describe('published plugin catalog', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('requires one guide per published plugin plus Store Admin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);

    expect(catalog.guideIds).toHaveLength(27);
    expect(catalog.guideIds).toContain('store-admin');
    expect(new Set(catalog.guideIds).size).toBe(27);
    expect(catalog.guideIds).toEqual([...catalog.guideIds].sort());
    expect(catalog.manifestIds).toHaveLength(26);
    expect(catalog.storeIds).not.toContain('visual-fx-frame-webgpu');
    expect(catalog.storeIds).toContain('clarityhud');
    expect(catalog.storeAdmin.manifestPath).toMatch(/plugin-store[\\/]sources[\\/]store-admin[\\/]plugin\.json$/);
  });

  test('uses the runtime manifest once when a store source mirrors the same plugin', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const visualFxManifests = catalog.plugins.filter((plugin) => plugin.id === 'visual-fx-frame-webgpu');

    expect(visualFxManifests).toHaveLength(0);
  });

  test('filters closed-beta plugins from the public catalog but retains all local manifests', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const localIds = fs.readdirSync(path.join(repoRoot, 'app', 'plugins'))
      .filter((name) => fs.existsSync(path.join(repoRoot, 'app', 'plugins', name, 'plugin.json')))
      .map((name) => JSON.parse(fs.readFileSync(path.join(repoRoot, 'app', 'plugins', name, 'plugin.json'), 'utf8')).id);

    expect(catalog.closedBetaIds).toHaveLength(11);
    expect(catalog.manifestIds).toEqual(expect.not.arrayContaining(catalog.closedBetaIds));
    expect(localIds).toEqual(expect.arrayContaining(catalog.closedBetaIds));
    expect(catalog.aliases).toEqual({ streamalchemy: 'stream-monsters' });
  });

  test('allows closed-beta app and source manifests to stay out of plugin-store.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-release-policy-'));
    const write = (relative, value) => {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(value, null, 2));
    };
    try {
      write('app/config/plugin-release-policy.json', { schemaVersion: 1, closedBeta: ['private-local'], aliases: {} });
      const policyPath = path.join(root, 'app/config/plugin-release-policy.json');
      fs.writeFileSync(policyPath, `\uFEFF${fs.readFileSync(policyPath, 'utf8')}`);
      write('app/plugins/private-local/plugin.json', { id: 'private-local' });
      write('app/plugins/public-local/plugin.json', { id: 'public-local' });
      write('plugin-store/sources/private-local/plugin.json', { id: 'private-local' });
      write('plugin-store/sources/store-admin/plugin.json', { id: 'store-admin' });
      write('plugin-store.json', { plugins: [{ id: 'store-admin' }] });

      const catalog = loadPublishedPluginCatalog(root);
      expect(catalog.manifestIds).toEqual(['public-local']);
      expect(() => {
        write('app/config/plugin-release-policy.json', { schemaVersion: 1, closedBeta: [], aliases: {} });
        write('plugin-store/sources/public-local/plugin.json', { id: 'public-local' });
        const store = JSON.parse(fs.readFileSync(path.join(root, 'plugin-store.json'), 'utf8'));
        store.plugins.push({ id: 'private-local' });
        fs.writeFileSync(path.join(root, 'plugin-store.json'), JSON.stringify(store));
        loadPublishedPluginCatalog(root);
      }).toThrow('Store source manifest public-local is missing from plugin-store.json');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('never publishes a reintroduced Chatango app, source manifest, or Store entry', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-retired-catalog-'));
    const write = (relative, value) => {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(value));
    };
    try {
      write('app/config/plugin-release-policy.json', { schemaVersion: 1, closedBeta: [], aliases: {} });
      write('app/plugins/chatango/plugin.json', { id: 'chatango', name: 'Chatango' });
      write('plugin-store/sources/chatango/plugin.json', { id: 'chatango', name: 'Chatango' });
      write('plugin-store/sources/store-admin/plugin.json', { id: 'store-admin' });
      write('plugin-store.json', { plugins: [{ id: 'CHATANGO' }, { id: 'Ｃｈａｔａｎｇｏ' }, { id: '%2563hatango' }, { id: 'store-admin' }] });

      const catalog = loadPublishedPluginCatalog(root);
      expect(catalog.plugins.map((plugin) => plugin.id)).not.toContain('chatango');
      expect(catalog.manifestIds).not.toContain('chatango');
      expect(catalog.storeIds).not.toContain('CHATANGO');
      expect(catalog.storeIds).not.toContain('Ｃｈａｔａｎｇｏ');
      expect(catalog.storeIds).not.toContain('%2563hatango');
      expect(catalog.guideIds).not.toContain('chatango');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test.each([
    ['missing release policy', null],
    ['malformed release policy', '{not-json'],
    ['wrong schema version', { schemaVersion: 2, closedBeta: [], aliases: {} }],
    ['missing closed-beta list', { schemaVersion: 1, aliases: {} }],
    ['duplicate closed-beta ids', { schemaVersion: 1, closedBeta: ['private', 'private'], aliases: {} }],
    ['invalid closed-beta id', { schemaVersion: 1, closedBeta: ['../public'], aliases: {} }],
    ['invalid aliases type', { schemaVersion: 1, closedBeta: [], aliases: [] }],
    ['invalid alias syntax', { schemaVersion: 1, closedBeta: ['private'], aliases: { '../old': 'private' } }],
    ['unknown policy key', { schemaVersion: 1, closedBeta: [], aliases: {}, public: true }],
    ['invalid alias target', { schemaVersion: 1, closedBeta: ['private'], aliases: { old: 'public' } }]
  ])('fails closed for %s', (_label, policy) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-invalid-release-policy-'));
    try {
      const policyPath = path.join(root, 'app', 'config', 'plugin-release-policy.json');
      fs.mkdirSync(path.dirname(policyPath), { recursive: true });
      if (policy !== null) {
        fs.writeFileSync(policyPath, typeof policy === 'string' ? policy : JSON.stringify(policy));
      }
      expect(() => loadPublishedPluginCatalog(root)).toThrow();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
