const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  prepareDocsPluginFixture,
  resolveDocsPluginSource
} = require('../../scripts/lib/docs-capture-plugin-fixture');

describe('documentation capture plugin fixtures', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('resolves shipped and store-only plugin sources', () => {
    expect(resolveDocsPluginSource(repoRoot, 'config-import')).toBe(path.join(repoRoot, 'app', 'plugins', 'config-import'));
    expect(resolveDocsPluginSource(repoRoot, 'visual-fx-frame-webgpu')).toBe(path.join(repoRoot, 'plugin-store', 'sources', 'visual-fx-frame-webgpu'));
  });

  test('enables only a copied target plugin in the temporary capture profile', () => {
    const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-docs-fixture-test-'));
    try {
      const fixtureRoot = prepareDocsPluginFixture(repoRoot, profileDir, 'config-import');
      const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'config-import', 'plugin.json'), 'utf8'));

      expect(manifest.id).toBe('config-import');
      expect(manifest.enabled).toBe(true);
      expect(fs.existsSync(path.join(fixtureRoot, 'config-import', 'main.js'))).toBe(true);
      expect(fs.realpathSync(path.join(fixtureRoot, '..', 'modules'))).toBe(fs.realpathSync(path.join(repoRoot, 'app', 'modules')));
      expect(fs.realpathSync(path.join(fixtureRoot, '..', 'node_modules'))).toBe(fs.realpathSync(path.join(repoRoot, 'app', 'node_modules')));
    } finally {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });
});
