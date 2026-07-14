const fs = require('fs');
const os = require('os');
const path = require('path');

const { migratePluginLocaleDirectory } = require('../../scripts/lib/plugin-i18n-bulk-migration');

describe('plugin locale bulk migration', () => {
  test('namespaces locale files and replaces generated references in the plugin surface', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-i18n-'));
    const pluginDir = path.join(root, 'sample-plugin');
    const localesDir = path.join(pluginDir, 'locales');
    fs.mkdirSync(localesDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'ui.html'), '<h1 data-i18n="generated.a1">Sample title</h1>');
    for (const locale of ['de', 'en', 'es', 'fr']) {
      fs.writeFileSync(path.join(localesDir, `${locale}.json`), JSON.stringify({ generated: { a1: locale === 'en' ? 'Sample title' : `Title ${locale}` }, ui: { save: `Save ${locale}` } }));
    }

    const result = migratePluginLocaleDirectory(pluginDir, 'sample-plugin');
    const migrated = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));

    expect(result.changedFiles).toHaveLength(5);
    expect(migrated.plugins['sample-plugin'].generated).toBeUndefined();
    expect(migrated.plugins['sample-plugin'].labels.sample_title).toBe('Sample title');
    expect(migrated.plugins['sample-plugin'].ui.save).toBe('Save en');
    expect(fs.readFileSync(path.join(pluginDir, 'ui.html'), 'utf8')).toContain('plugins.sample-plugin.labels.sample_title');
  });
});
