'use strict';

const fs = require('fs');
const path = require('path');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'game-engine');
const source = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');

describe('Game Engine visible-control localization', () => {
  test('binds leaderboard types and icon-only close actions to shipped locale keys', () => {
    for (const key of ['leaderboard_season', 'leaderboard_lifetime', 'leaderboard_elo']) {
      expect(source).toContain(`data-i18n="plugins.game-engine.game_engine.connect4.${key}"`);
    }
    for (const selector of ['closeGiftCatalogBtn', 'slot-emoji-picker-close', 'slot-gift-picker-close']) {
      const control = source.match(new RegExp(`<button[^>]*id="${selector}"[^>]*>`))?.[0] || '';
      expect(control).toContain('data-i18n-aria-label="plugins.game-engine.game_engine.common.close"');
      expect(control).toContain('data-i18n-title="plugins.game-engine.game_engine.common.close"');
    }
  });

  test('keeps the remaining inventoried labels bound through their correct visible attribute', () => {
    for (const key of [
      'plugins.game-engine.labels.einsatz_xp',
      'plugins.game-engine.form_controls.placeholders.slot_background_color',
      'plugins.game-engine.form_controls.placeholders.emoji_search',
      'plugins.game-engine.form_controls.placeholders.gift_search',
      'plugins.game-engine.ui.common.preview',
      'plugins.game-engine.ui.common.reset'
    ]) expect(source).toContain(key);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides the added close label in %s', (locale) => {
    const messages = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
    const values = flattenTranslations(messages);
    expect(values['plugins.game-engine.game_engine.common.close']).toEqual(expect.any(String));
  });
});
