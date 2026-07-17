const fs = require('fs');
const path = require('path');

const plugins = [
  ['api-bridge', 'api_bridge'],
  ['data-source', 'data_source'],
  ['gift-catalog', 'gift_catalog', 'no_gifts_available'],
  ['music-bot', 'music_bot'],
  ['sidekick', 'sidekick'],
  ['stt-ticker', 'stt_ticker'],
  ['toptier', 'toptier'],
  ['flame-overlay', 'flame_overlay']
];

describe('generated plugin locale quality', () => {
  test.each(plugins)('%s has localized common UI copy', (plugin, rootKey, messageKey = 'saved') => {
    const read = locale => {
      const values = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', plugin, 'locales', `${locale}.json`), 'utf8'));
      return values.plugins?.[plugin]?.[rootKey];
    };
    const en = read('en');
    ['de', 'es', 'fr'].forEach(locale => {
      const translated = read(locale);
      expect(translated.plugin.description).not.toBe(en.plugin.description);
      expect(translated.ui.actions.save).not.toBe(en.ui.actions.save);
      expect(translated.ui.status.ready).not.toBe(en.ui.status.ready);
      expect(translated.ui.messages[messageKey]).not.toBe(en.ui.messages[messageKey]);
    });
  });
});
