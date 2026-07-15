const fs = require('fs');
const os = require('os');
const path = require('path');

describe('plugin i18n runtime namespaces', () => {
  test('loads a plugin locale only below its plugin id namespace', () => {
    jest.resetModules();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const i18n = require('../modules/i18n');
    log.mockRestore();

    expect(i18n.t('plugins.emoji-rain.emoji_rain.hero.page_title', {}, 'en'))
      .toBe('Emoji Rain Settings - TikTok Stream Tool');
    expect(i18n.t('emoji_rain.hero.page_title', {}, 'en'))
      .toBe('emoji_rain.hero.page_title');
  });

  test('uses German as the static fallback locale', () => {
    jest.resetModules();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const i18n = require('../modules/i18n');
    log.mockRestore();

    expect(i18n.getLocale()).toBe('de');
    expect(i18n.normalizeLocale('unsupported-locale')).toBe('de');
  });

  test('loads locale namespaces from published store-source plugins', () => {
    jest.resetModules();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const i18n = require('../modules/i18n');
    log.mockRestore();

    expect(i18n.t('plugins.visual-fx-frame-webgpu.visual_fx_frame_webgpu.plugin.name', {}, 'en'))
      .toBe('Visual FX Frame WEBGPU');
    expect(i18n.t('plugins.store-admin.ui.title', {}, 'de'))
      .toBe('LTTH App-Store-Verwaltung');
  });

  test('rejects conflicting translation values and identifies both sources', () => {
    jest.resetModules();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const i18n = require('../modules/i18n');
    log.mockRestore();

    expect(() => i18n.mergeTranslationSource(
      'en',
      { plugins: { 'sample-plugin': { labels: { title: 'Second value' } } } },
      'sample-plugin/locales/en.json',
      { plugins: { 'sample-plugin': { labels: { title: 'First value' } } } },
      'base/locales/en.json'
    )).toThrow('Translation collision at plugins.sample-plugin.labels.title between base/locales/en.json and sample-plugin/locales/en.json');
  });

  test('fails startup when separate plugin sources claim a conflicting locale leaf', () => {
    jest.resetModules();
    const { I18n } = require('../modules/i18n');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-collision-'));
    const localesDir = path.join(root, 'locales');
    const firstRoot = path.join(root, 'first');
    const secondRoot = path.join(root, 'second');
    const locales = ['de', 'en', 'es', 'fr'];

    try {
      fs.mkdirSync(localesDir, { recursive: true });
      locales.forEach((locale) => fs.writeFileSync(path.join(localesDir, `${locale}.json`), '{}', 'utf8'));
      for (const [pluginRoot, title] of [[firstRoot, 'First'], [secondRoot, 'Second']]) {
        const pluginDir = path.join(pluginRoot, 'sample');
        const pluginLocales = path.join(pluginDir, 'locales');
        fs.mkdirSync(pluginLocales, { recursive: true });
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id: 'shared-plugin' }), 'utf8');
        locales.forEach((locale) => fs.writeFileSync(
          path.join(pluginLocales, `${locale}.json`),
          JSON.stringify({ plugins: { 'shared-plugin': { title } } }),
          'utf8'
        ));
      }

      expect(() => new I18n('de', { localesDir, pluginRoots: [firstRoot, secondRoot] }))
        .toThrow(/Translation collision at plugins\.shared-plugin\.title between .*first.* and .*second.*/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
