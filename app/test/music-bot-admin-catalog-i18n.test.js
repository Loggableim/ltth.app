const fs = require('fs');
const path = require('path');

const locales = ['de', 'en', 'es', 'fr'];
const runtimeKeys = ['seekUnavailable', 'seekFailed', 'historyLoadFailed', 'playlistSaveFailed', 'playlistConflict', 'importRunning'];

describe('Music Bot catalog admin i18n contract', () => {
  const root = path.join(__dirname, '..', 'plugins', 'music-bot');

  test('uses the production plugin namespace and localizes all dynamic catalog-admin messages', () => {
    const source = fs.readFileSync(path.join(root, 'assets', 'ui.js'), 'utf8');
    expect(source).toContain("const I18N_PREFIX = 'plugins.music-bot.music_bot.ui.controls.runtime'");
    runtimeKeys.forEach((key) => expect(source).toContain(`tr('${key}'`));
  });

  test.each(locales)('provides nonempty catalog and runtime messages in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    expect(translations.music_bot.ui.catalog).toEqual(expect.objectContaining({
      seek: expect.any(String), historyMore: expect.any(String), historyBanned: expect.any(String),
      catalogSearch: expect.any(String), playlistConflict: expect.any(String), viewerRadio: expect.any(String),
      radioSources: expect.any(String), importRunning: expect.any(String)
    }));
    runtimeKeys.forEach((key) => expect(translations.music_bot.ui.controls.runtime[key].trim()).not.toBe(''));
  });
});
