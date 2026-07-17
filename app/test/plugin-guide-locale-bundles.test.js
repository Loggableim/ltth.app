const fs = require('fs');
const path = require('path');

const { LOCALES, buildGuides } = require('../../scripts/plugin-tutorial-source');

describe('plugin guide locale bundles', () => {
  const repoRoot = path.join(__dirname, '..', '..');

  test('loads guide-specific bundles and keeps guide prose out of the root locale payload', () => {
    const client = fs.readFileSync(path.join(repoRoot, 'js', 'i18n.js'), 'utf8');
    expect(client).toContain('/locales/guides/');

    for (const locale of LOCALES) {
      const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'locales', `${locale}.json`), 'utf8'));
      const bundle = JSON.parse(fs.readFileSync(path.join(repoRoot, 'locales', 'guides', `${locale}.json`), 'utf8'));
      for (const guide of buildGuides(repoRoot)) {
        const prefix = `docs.plugin.${guide.id}.`;
        const keys = Object.keys(bundle).filter((key) => key.startsWith(prefix));
        expect(keys.length).toBeGreaterThan(0);
        const proseKeys = keys.filter((key) => key !== `${prefix}title`);
        expect(proseKeys.some((key) => Object.hasOwn(root, key))).toBe(false);
        expect(root[`${prefix}title`]).toBe(guide.copy[locale].title);
      }
    }
  });
});
