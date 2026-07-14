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
});
