const fs = require('fs');
const path = require('path');

const { buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('plugin guide modules', () => {
  test('keeps every published guide in its own source module', () => {
    const repoRoot = path.join(__dirname, '..', '..');
    const modulesRoot = path.join(repoRoot, 'scripts', 'plugin-guides');
    const expectedIds = buildGuides(repoRoot).map((guide) => guide.id).sort();

    expect(fs.existsSync(modulesRoot)).toBe(true);
    const moduleIds = fs.readdirSync(modulesRoot)
      .filter((entry) => entry.endsWith('.js') && !['index.js', 'definition.js'].includes(entry))
      .filter((entry) => typeof require(path.join(modulesRoot, entry)).id === 'string')
      .map((entry) => path.basename(entry, '.js'))
      .sort();

    expect(moduleIds).toEqual(expectedIds);
    expectedIds.forEach((id) => {
      expect(require(path.join(modulesRoot, `${id}.js`)).id).toBe(id);
    });
  });
});
