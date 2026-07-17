const fs = require('fs');
const path = require('path');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

describe('TTS admin panel i18n', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'tts');

  test('uses stable plugin keys for manual speech, log filters, and modal selectors', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui', 'admin-panel.html'), 'utf8');
    for (const key of [
      'plugins.tts.ui.manual.engine',
      'plugins.tts.ui.filters.all',
      'plugins.tts.ui.logs.autoScroll',
      'plugins.tts.ui.modal.emotion.angry'
    ]) {
      expect(html).toContain(`data-i18n="${key}"`);
    }
  });

  test.each(['de', 'en', 'es', 'fr'])('provides each stable TTS key in %s', (locale) => {
    const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')));
    for (const key of [
      'plugins.tts.ui.manual.engine',
      'plugins.tts.ui.filters.all',
      'plugins.tts.ui.logs.autoScroll',
      'plugins.tts.ui.modal.emotion.angry'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });
});
