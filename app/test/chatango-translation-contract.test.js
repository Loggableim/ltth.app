const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'chatango');
const locales = ['en', 'de', 'es', 'fr'];
const pluginNamespace = 'plugins.chatango.chatango.';
const runtimeKeys = [
  'config_saved',
  'copied',
  'notification_copy_failed',
  'notification_save_failed',
  'notification_save_failed_detail',
  'save_failure_detail',
  'status_active',
  'status_disabled',
  'preview_warning',
  'preview_instructions',
  'preview_room',
  'preview_theme',
  'notification_source'
];

function resolve(value, key) {
  return key.split('.').reduce((current, segment) => current && current[segment], value);
}

describe('Chatango UI translation contract', () => {
  test('every visible UI key exists in all four plugin locales', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:="([^"]+)"|-(?:title|alt|aria-label|placeholder)="([^"]+)")/g)]
      .map(match => match[1] || match[2]);
    expect(keys.length).toBeGreaterThan(20);

    locales.forEach(locale => {
      const translation = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')).plugins.chatango;
      keys.forEach(key => {
        const localKey = key.replace(/^plugins\.chatango\./, '');
        expect(resolve(translation, localKey)).toEqual(expect.any(String));
        expect(resolve(translation, localKey).trim()).not.toBe('');
      });
    });
  });

  test('uses stable namespaced keys for every dynamic UI message', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');

    runtimeKeys.forEach(key => {
      const fullKey = `${pluginNamespace}${key}`;
      expect(html).toContain(`t('${fullKey}'`);
      expect(html).not.toContain(`t('${key}'`);
    });

    locales.forEach(locale => {
      const translation = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
      runtimeKeys.forEach(key => {
        expect(resolve(translation, `${pluginNamespace}${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('makes generated embed titles language-aware', () => {
    const main = fs.readFileSync(path.join(pluginRoot, 'main.js'), 'utf8');

    expect(main).toContain("'plugins.chatango.chatango.embed_dashboard_title'");
    expect(main).toContain("'plugins.chatango.chatango.embed_widget_title'");
    expect(main).toContain('data-i18n="${titleKey}"');

    locales.forEach(locale => {
      const translation = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
      expect(resolve(translation, `${pluginNamespace}embed_dashboard_title`)).toEqual(expect.any(String));
      expect(resolve(translation, `${pluginNamespace}embed_widget_title`)).toEqual(expect.any(String));
    });
  });
});
