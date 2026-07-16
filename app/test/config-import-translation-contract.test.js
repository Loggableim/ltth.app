const fs = require('fs');
const path = require('path');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');

describe('config-import translation contract', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'config-import');
  const repoRoot = path.join(__dirname, '..', '..');
  const locales = ['en', 'de', 'es', 'fr'];
  const dynamicUiKeys = [
    'backupReady',
    'manualDownloadHelp',
    'exportFailed',
    'failedToPrepareBackup',
    'zipBackupOnly',
    'backupValidationFailed',
    'validationError',
    'manifestBackupFrom',
    'manifestAppVersion',
    'manifestProfile',
    'unknownValue',
    'noProfile',
    'plugins',
    'newSettings',
    'uploadFiles',
    'importCompletedRestart',
    'importCompletedWithErrors',
    'unknownError',
    'globalSettingsReport',
    'userConfigsReport',
    'pluginReport',
    'importFailed',
    'legacySource',
    'fileCount',
    'enterPath',
    'legacyUserConfigs',
    'legacyUserData',
    'legacyUploads',
    'legacyPlugins',
    'legacyDatabase',
    'legacyData',
    'noConfigurationFiles',
    'userConfigFiles',
    'userDataFiles',
    'uploadedFiles',
    'pluginDataFiles',
    'legacyDatabaseFiles',
    'legacyDataFiles',
    'legacyImportCompleted',
    'importedItems',
    'switchProfileRestart'
  ];

  test('ships the shared client and UI namespace in every locale', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    expect(html).toContain('/js/i18n-client.js');

    const localeData = locales.map(locale => JSON.parse(
      fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8').replace(/^\uFEFF/, '')
    ));
    const keys = localeData.map(locale => Object.keys(
      locale.plugins['config-import']['config-import'].ui || {}
    ).sort());
    expect(keys[1]).toEqual(keys[0]);
    expect(keys[2]).toEqual(keys[0]);
    expect(keys[3]).toEqual(keys[0]);
    expect(keys[0].length).toBeGreaterThan(40);
    localeData.forEach(locale => Object.values(
      locale.plugins['config-import']['config-import'].ui
    ).forEach(value => {
      expect(typeof value).toBe('string');
      expect(value.trim()).not.toBe('');
    }));
  });

  test('uses namespaced translations for dynamic UI framing after i18n is ready', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    expect(html).toContain('const i18nReady = window.i18n?.ready || Promise.resolve();');
    expect(html).toContain('await i18nReady;');

    dynamicUiKeys.forEach(key => {
      const namespacedKey = `plugins.config-import.config-import.ui.${key}`;
      expect(html).toContain(`t('${namespacedKey}'`);
      locales.forEach(locale => {
        const translation = JSON.parse(fs.readFileSync(
          path.join(pluginRoot, 'locales', `${locale}.json`),
          'utf8'
        ).replace(/^\uFEFF/, ''));
        const value = translation.plugins['config-import']['config-import'].ui[key];
        expect(typeof value).toBe('string');
        expect(value.trim()).not.toBe('');
      });
    });

    const errors = auditPluginUi({
      repoRoot,
      catalog: {
        plugins: [{
          id: 'config-import',
          manifestPath: path.join(pluginRoot, 'plugin.json')
        }]
      }
    }).errors.filter(error => error.startsWith('config-import/'));

    expect(errors).toEqual([]);
  });
});
