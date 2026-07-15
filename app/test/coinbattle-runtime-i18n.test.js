const fs = require('fs');
const path = require('path');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

describe('CoinBattle runtime i18n', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'coinbattle');
  const script = fs.readFileSync(path.join(pluginRoot, 'ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
  const runtimeKeys = [
    'plugins.coinbattle.runtime.dialog.end_match_confirm',
    'plugins.coinbattle.runtime.dialog.reset_settings_confirm',
    'plugins.coinbattle.runtime.toast.match_started',
    'plugins.coinbattle.runtime.toast.settings_saved',
    'plugins.coinbattle.runtime.load.loading',
    'plugins.coinbattle.runtime.load.no_data',
    'plugins.coinbattle.runtime.load.history_empty',
    'plugins.coinbattle.runtime.load.users_empty',
    'plugins.coinbattle.runtime.load.leaderboard_failed',
    'plugins.coinbattle.runtime.dialog.end_pyramid_confirm',
    'plugins.coinbattle.runtime.dialog.delete_user_confirm',
    'plugins.coinbattle.runtime.toast.simulation_started',
    'plugins.coinbattle.runtime.toast.pyramid_settings_saved',
    'plugins.coinbattle.runtime.toast.season_saved',
    'plugins.coinbattle.runtime.table.rank',
    'plugins.coinbattle.runtime.table.actions',
    'plugins.coinbattle.runtime.history.match_number',
    'plugins.coinbattle.runtime.season.summary',
    'plugins.coinbattle.runtime.aria.overlay_width',
    'plugins.coinbattle.runtime.aria.overlay_height',
    'plugins.coinbattle.runtime.placeholder.season_name'
  ];

  test('routes visible runtime feedback through stable CoinBattle translation keys', () => {
    expect(script).toContain('function translateCoinBattle(key, params = {}, fallback = key)');
    expect(script).toContain("translateCoinBattle('runtime.dialog.end_match_confirm'");
    expect(script).toContain("translateCoinBattle('runtime.toast.match_started'");
    expect(script).toContain("loadingMarkup('runtime.load.no_data'");
    expect(script).toContain("loadingMarkup('runtime.load.history_empty'");
    expect(script).toContain("loadingMarkup('runtime.load.users_empty'");
    expect(script).toContain("translateCoinBattle('runtime.dialog.end_pyramid_confirm'");
    expect(script).toContain("'runtime.dialog.delete_user_confirm'");
    expect(script).toContain("translateCoinBattle('runtime.toast.simulation_started'");
    expect(script).toContain("translateCoinBattle('runtime.table.rank'");
    expect(script).toContain("translateCoinBattle('runtime.history.match_number'");
    expect(script).toContain("translateCoinBattle('runtime.season.summary'");
    expect(script).toContain('escapeHtml(player.nickname || player.unique_id)');
    expect(script).toContain('escapeHtml(season.season_name)');
  });

  test('updates ARIA labels and placeholders with the local i18n runtime', () => {
    expect(script).toContain("document.querySelectorAll('[data-i18n-aria-label]')");
    expect(script).toContain("document.querySelectorAll('[data-i18n-placeholder]')");
    expect(html).toContain('data-i18n-aria-label="plugins.coinbattle.runtime.aria.overlay_width"');
    expect(html).toContain('data-i18n-aria-label="plugins.coinbattle.runtime.aria.overlay_height"');
    expect(html).toContain('data-i18n-placeholder="plugins.coinbattle.runtime.placeholder.season_name"');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides stable runtime keys in %s', (locale) => {
    const translations = flattenTranslations(JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')));
    for (const key of runtimeKeys) {
      expect(translations[key]).toEqual(expect.any(String));
      expect(translations[key]).not.toBe('');
    }
  });
});
