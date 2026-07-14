const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'emoji-rain');

describe('Emoji Rain runtime i18n', () => {
  test('uses namespaced translations for dynamic statuses and safe local notifications', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'emoji-rain-ui.js'), 'utf8');

    expect(source).toContain("pluginText('runtime.status.enabled'");
    expect(source).toContain("pluginText('runtime.notifications.enabled'");
    expect(source).toContain("pluginText('runtime.notifications.configuration_saved'");
  });

  test('provides the runtime copy in every supported language', () => {
    const values = Object.fromEntries(['de', 'en', 'es', 'fr'].map((locale) => {
      const file = path.join(pluginRoot, 'locales', `${locale}.json`);
      const translation = JSON.parse(fs.readFileSync(file, 'utf8'));
      return [locale, translation.plugins['emoji-rain'].runtime];
    }));

    for (const locale of ['de', 'en', 'es', 'fr']) {
      expect(values[locale].status.enabled).toBeTruthy();
      expect(values[locale].status.disabled).toBeTruthy();
      expect(values[locale].notifications.enabled).toBeTruthy();
      expect(values[locale].notifications.configuration_saved).toBeTruthy();
    }
    expect(values.en.status.enabled).toBe('Enabled');
    expect(values.es.status.enabled).toBe('Activado');
    expect(values.fr.status.enabled).toBe('Activé');
  });
});
