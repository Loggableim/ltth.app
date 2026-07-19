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

  test.each([
    [
      { plugins: { 'sample-plugin': 'First value' } },
      { plugins: { 'sample-plugin': { labels: { title: 'Second value' } } } },
      'plugins.sample-plugin'
    ],
    [
      { plugins: { 'sample-plugin': { labels: { title: 'First value' } } } },
      { plugins: { 'sample-plugin': 'Second value' } },
      'plugins.sample-plugin'
    ]
  ])('rejects a scalar-object translation collision at the shared path', (target, source, key) => {
    jest.resetModules();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const i18n = require('../modules/i18n');
    log.mockRestore();

    expect(() => i18n.mergeTranslationSource(
      'en',
      source,
      'sample-plugin/locales/en.json',
      target,
      'base/locales/en.json'
    )).toThrow(`Translation collision at ${key} between base/locales/en.json and sample-plugin/locales/en.json`);
  });

  test('keeps the runtime plugin source when a store mirror uses the same plugin id', () => {
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

      const i18n = new I18n('de', { localesDir, pluginRoots: [firstRoot, secondRoot] });

      expect(i18n.t('plugins.shared-plugin.title')).toBe('First');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('keeps a complete legacy catalog when it also exposes namespaced compatibility metadata', () => {
    jest.resetModules();
    const { I18n } = require('../modules/i18n');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-hybrid-catalog-'));
    const localesDir = path.join(root, 'locales');
    const pluginRoot = path.join(root, 'plugins');
    const pluginDir = path.join(pluginRoot, 'hybrid');
    const locales = ['de', 'en', 'es', 'fr'];

    try {
      fs.mkdirSync(localesDir, { recursive: true });
      fs.mkdirSync(path.join(pluginDir, 'locales'), { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id: 'hybrid-plugin' }), 'utf8');
      locales.forEach((locale) => {
        fs.writeFileSync(path.join(localesDir, `${locale}.json`), '{}', 'utf8');
        fs.writeFileSync(path.join(pluginDir, 'locales', `${locale}.json`), JSON.stringify({
          legacy: { labels: { complete: 'Complete catalog label' } },
          plugins: { 'hybrid-plugin': { contract: { ready: 'Compatibility metadata' } } }
        }), 'utf8');
      });

      const i18n = new I18n('en', { localesDir, pluginRoots: [pluginRoot] });

      expect(i18n.t('plugins.hybrid-plugin.legacy.labels.complete', {}, 'en'))
        .toBe('Complete catalog label');
      expect(i18n.t('plugins.hybrid-plugin.contract.ready', {}, 'en'))
        .toBe('Compatibility metadata');
      expect(i18n.t('plugins.hybrid-plugin.plugins.hybrid-plugin.contract.ready', {}, 'en'))
        .toBe('plugins.hybrid-plugin.plugins.hybrid-plugin.contract.ready');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('uses direct compatibility metadata deterministically when it overlaps a legacy catalog', () => {
    jest.resetModules();
    const { I18n } = require('../modules/i18n');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-hybrid-collision-'));
    const localesDir = path.join(root, 'locales');
    const pluginRoot = path.join(root, 'plugins');
    const pluginDir = path.join(pluginRoot, 'hybrid');

    try {
      fs.mkdirSync(localesDir, { recursive: true });
      fs.mkdirSync(path.join(pluginDir, 'locales'), { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id: 'hybrid-plugin' }), 'utf8');
      ['de', 'en', 'es', 'fr'].forEach((locale) => {
        fs.writeFileSync(path.join(localesDir, `${locale}.json`), '{}', 'utf8');
        fs.writeFileSync(path.join(pluginDir, 'locales', `${locale}.json`), JSON.stringify({
          contract: { ready: 'Legacy value' },
          plugins: { 'hybrid-plugin': { contract: { ready: 'Compatibility value' } } }
        }), 'utf8');
      });

      const i18n = new I18n('en', { localesDir, pluginRoots: [pluginRoot] });
      expect(i18n.t('plugins.hybrid-plugin.contract.ready', {}, 'en')).toBe('Compatibility value');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('drops nested prototype keys from pure and hybrid catalogs and ignores unsafe plugin ids', () => {
    jest.resetModules();
    const { I18n } = require('../modules/i18n');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-i18n-safe-catalog-'));
    const localesDir = path.join(root, 'locales');
    const pluginRoot = path.join(root, 'plugins');
    const writePlugin = (directory, id, json) => {
      const pluginDir = path.join(pluginRoot, directory);
      fs.mkdirSync(path.join(pluginDir, 'locales'), { recursive: true });
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id }), 'utf8');
      ['de', 'en', 'es', 'fr'].forEach((locale) => {
        fs.writeFileSync(path.join(pluginDir, 'locales', `${locale}.json`), json, 'utf8');
      });
    };

    try {
      fs.mkdirSync(localesDir, { recursive: true });
      ['de', 'en', 'es', 'fr'].forEach((locale) => fs.writeFileSync(path.join(localesDir, `${locale}.json`), '{}', 'utf8'));
      writePlugin('pure', 'pure-plugin', '{"safe":{"label":"Pure"},"nested":{"__proto__":{"polluted":"yes"}}}');
      writePlugin('hybrid', 'hybrid-plugin', '{"legacy":{"label":"Legacy"},"plugins":{"hybrid-plugin":{"contract":{"ready":"Ready"},"nested":{"constructor":{"polluted":"yes"}}}},"__proto__":{"polluted":"yes"}}');
      writePlugin('unsafe', '__proto__', '{"safe":{"label":"Unsafe"}}');
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      const i18n = new I18n('en', { localesDir, pluginRoots: [pluginRoot] });
      error.mockRestore();

      expect(i18n.t('plugins.pure-plugin.safe.label', {}, 'en')).toBe('Pure');
      expect(i18n.t('plugins.hybrid-plugin.legacy.label', {}, 'en')).toBe('Legacy');
      expect(i18n.t('plugins.hybrid-plugin.contract.ready', {}, 'en')).toBe('Ready');
      expect(i18n.t('plugins.__proto__.safe.label', {}, 'en')).toBe('plugins.__proto__.safe.label');
      expect({}.polluted).toBeUndefined();
      Object.setPrototypeOf(i18n.translations.en.plugins['pure-plugin'], { inherited: 'nope' });
      expect(i18n.t('plugins.pure-plugin.inherited', {}, 'en')).toBe('plugins.pure-plugin.inherited');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
