const fs = require('fs');
const path = require('path');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.join(__dirname, '..', '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

describe('Stream Monsters 1.12.0 stable source contract', () => {
  test('promotes the active plugin source without changing the stable plugin id', () => {
    const manifest = readJson('app/plugins/stream-monsters/plugin.json');

    expect(manifest).toEqual(expect.objectContaining({
      id: 'stream-monsters',
      name: 'Stream Monsters',
      version: '1.12.0',
      devStatus: 'stable'
    }));
  });

  test('documents the stable status in active user-facing surfaces', () => {
    const pluginReadme = fs.readFileSync(
      path.join(repoRoot, 'app/plugins/stream-monsters/README.md'),
      'utf8'
    );
    const rootReadme = fs.readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

    expect(pluginReadme).toMatch(/Version 1\.12\.0 is a bundled-only stable release/i);
    expect(pluginReadme).not.toMatch(/Open Beta/i);
    expect(rootReadme).toMatch(
      /current published Stream Monsters release is \*\*1\.12\.0\*\* \(Stable/i
    );
    // Closed-beta contract: the published catalog (source of truth for the docs generator)
    // excludes closed-beta plugins. Asserted through the catalog function, not through
    // generated files that other tests may rewrite or delete.
    const catalog = loadPublishedPluginCatalog(repoRoot);
    expect(catalog.closedBetaIds).toContain('stream-monsters');
    expect(catalog.guideIds).not.toContain('stream-monsters');
    expect(catalog.manifestIds).not.toContain('stream-monsters');
  });
});
