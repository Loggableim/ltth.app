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
    const docsPage = fs.readFileSync(
      path.join(repoRoot, 'docs/plugins/stream-monsters.html'),
      'utf8'
    );
    const docsIndex = readJson('docs/plugins/index.json')
      .find(plugin => plugin.id === 'stream-monsters');

    expect(pluginReadme).toMatch(/Version 1\.12\.0 is a bundled-only stable release/i);
    expect(pluginReadme).not.toMatch(/Open Beta/i);
    expect(rootReadme).toMatch(
      /current published Stream Monsters release is \*\*1\.12\.0\*\* \(Stable/i
    );
    expect(docsIndex).toEqual(expect.objectContaining({
      access: 'stable',
      devStatus: 'stable'
    }));
    expect(docsPage).toContain('>Stabil<');
    expect(docsPage).toContain('<dt>Version</dt><dd>1.12.0</dd>');
  });

  test.each([
    ['de', 'Stabil'],
    ['en', 'Stable'],
    ['es', 'Estable'],
    ['fr', 'Stable']
  ])('publishes the stable guide status in %s', (locale, expectedStatus) => {
    const guide = readJson(`locales/guides/${locale}.json`);
    expect(guide['docs.plugin.stream-monsters.status']).toBe(expectedStatus);
  });
});
