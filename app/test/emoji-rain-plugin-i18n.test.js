'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'emoji-rain';
const uiKeys = [
  'plugins.emoji-rain.emoji_rain.obs_hud.metrics.fps',
  'plugins.emoji-rain.emoji_rain.obs_hud.metrics.memory',
  'plugins.emoji-rain.emoji_rain.ui.preset',
  'plugins.emoji-rain.emoji_rain.ui.status',
  'plugins.emoji-rain.emoji_rain.physics.air_resistance',
  'plugins.emoji-rain.emoji_rain.heart_balloons.pop_height'
];

describe('Emoji Rain UI i18n', () => {
  test('marks every static Emoji Rain control and supplies every referenced locale leaf', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });

    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides semantic OBS HUD and configuration labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });
});
