'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginLocales, flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');
const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'thermal-printer';
const locales = ['de', 'en', 'es', 'fr'];
const runtimeKeys = [
  'labels.status',
  'labels.configuration',
  'labels.formatting',
  'thermal_printer.messages.config_saved',
  'thermal_printer.messages.config_error',
  'thermal_printer.messages.config_error_details',
  'thermal_printer.messages.test_queued',
  'thermal_printer.messages.test_error',
  'thermal_printer.messages.test_error_details',
  'thermal_printer.messages.printer_not_running'
];

function readPluginFile(file) {
  return fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, file), 'utf8');
}

describe('Thermal Printer UI i18n', () => {
  test('has no raw user-facing UI copy or locale copy-throughs', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const uiResult = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });
    const localeResult = auditPluginLocales(path.join(repoRoot, 'app', 'plugins'));
    const localeErrors = localeResult.errors.filter((error) => error.startsWith(`${pluginId}:`) || error.startsWith(`${pluginId}/`));

    expect(uiResult.errors).toEqual([]);
    expect(localeErrors).toEqual([]);
  });

  test.each(locales)('defines each runtime feedback key in %s', (locale) => {
    const translation = JSON.parse(readPluginFile(`locales/${locale}.json`));
    const values = flattenTranslations(translation);

    runtimeKeys.forEach((key) => {
      expect(values[`plugins.thermal-printer.${key}`]).toEqual(expect.any(String));
    });
  });

  test('renders feedback through stable localized messages', () => {
    const source = readPluginFile('ui.html');
    const mainSource = readPluginFile('main.js');

    expect(source).toContain('/js/i18n-client.js');
    expect(source).toContain('data-i18n="plugins.thermal-printer.labels.status"');
    expect(source).toContain('data-i18n="plugins.thermal-printer.labels.configuration"');
    expect(source).toContain('data-i18n="plugins.thermal-printer.labels.formatting"');
    expect(source).toContain("translateUi('plugins.thermal-printer.messages.config_saved'");
    expect(source).toContain('plugins.thermal-printer.messages.config_error_details');
    expect(source).toContain("translateUi('plugins.thermal-printer.messages.test_queued'");
    expect(source).toContain('plugins.thermal-printer.messages.test_error');
    expect(mainSource).toContain("errorCode: 'printer_not_running'");
  });
});
