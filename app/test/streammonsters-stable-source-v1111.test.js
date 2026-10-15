const fs = require('fs');
const path = require('path');

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
    // Closed-beta contract (app/config/plugin-release-policy.json closedBeta):
    // the public docs generator excludes closed-beta plugins
    // (scripts/lib/published-plugin-catalog.js), so no public docs page or index entry exists.
    expect(fs.existsSync(path.join(repoRoot, 'docs/plugins/stream-monsters.html'))).toBe(false);
    expect(readJson('docs/plugins/index.json')
      .find(plugin => plugin.id === 'stream-monsters')).toBeUndefined();
  });

  test.each(['de', 'en', 'es', 'fr'])(
    'keeps the closed-beta guide status out of public locale guides in %s',
    (locale) => {
      const guide = readJson(`locales/guides/${locale}.json`);
      expect(guide['docs.plugin.stream-monsters.status']).toBeUndefined();
    }
  );
});
