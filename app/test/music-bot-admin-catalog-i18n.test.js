const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const locales = ['de', 'en', 'es', 'fr'];
const runtimeKeys = ['seekUnavailable', 'seekFailed', 'historyLoadFailed', 'playlistSaveFailed', 'playlistConflict', 'importRunning'];
const staticCatalogKeys = ['historyTab', 'catalogTab', 'playlistsTab', 'catalogDescription', 'playlistsDescription', 'newPlaylist', 'playbackMode', 'ordered', 'shuffle', 'create', 'radioDescription', 'saveRadioSources'];

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
    staticCatalogKeys.forEach((key) => expect(translations.music_bot.ui.catalog[key].trim()).not.toBe(''));
  });

  test.each(['en', 'es', 'fr'])('renders new catalog controls through the i18n DOM pipeline in %s', (locale) => {
    const html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    const dom = new JSDOM(html);
    const lookup = (key) => key.split('.').reduce((value, part) => value?.[part], translations);
    dom.window.document.querySelectorAll('[data-i18n]').forEach((element) => {
      const value = lookup(element.dataset.i18n);
      if (typeof value === 'string') element.textContent = value;
    });
    dom.window.document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const value = lookup(element.dataset.i18nPlaceholder);
      if (typeof value === 'string') element.placeholder = value;
    });

    expect(dom.window.document.querySelector('[data-tab="catalog"]').textContent).toBe(translations.music_bot.ui.catalog.catalogTab);
    expect(dom.window.document.getElementById('catalog-search-input').placeholder).toBe(translations.music_bot.ui.catalog.catalogSearch);
    expect(dom.window.document.getElementById('playlist-create-btn').textContent).toBe(translations.music_bot.ui.catalog.create);
    expect(dom.window.document.getElementById('playlist-radio-save').textContent).toBe(translations.music_bot.ui.catalog.saveRadioSources);
  });
});
