const fs = require('fs');
const path = require('path');

const plugins = [
  ['api-bridge', 'api_bridge'],
  ['data-source', 'data_source'],
  ['gift-catalog', 'gift_catalog'],
  ['music-bot', 'music_bot'],
  ['sidekick', 'sidekick'],
  ['stt-ticker', 'stt_ticker'],
  ['toptier', 'toptier'],
  ['flame-overlay', 'flame_overlay']
];

describe('generated plugin locale quality', () => {
  test.each(plugins)('%s has localized common UI copy', (plugin, rootKey) => {
    const read = locale => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugins', plugin, 'locales', `${locale}.json`), 'utf8'))[rootKey];
    const en = read('en');
    ['de', 'es', 'fr'].forEach(locale => {
      const translated = read(locale);
      expect(translated.plugin.description).not.toBe(en.plugin.description);
      expect(translated.ui.actions.save).not.toBe(en.ui.actions.save);
      expect(translated.ui.status.ready).not.toBe(en.ui.status.ready);
      expect(translated.ui.messages.saved).not.toBe(en.ui.messages.saved);
    });
  });
});
