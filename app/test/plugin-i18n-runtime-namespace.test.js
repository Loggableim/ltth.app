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
});
