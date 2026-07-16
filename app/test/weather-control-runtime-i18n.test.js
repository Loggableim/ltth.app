'use strict';

const fs = require('fs');
const path = require('path');

const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const pluginDir = path.join(__dirname, '..', 'plugins', 'weather-control');
const runtimeKeys = [
  'plugins.weather-control.runtime.overlay.connected',
  'plugins.weather-control.runtime.overlay.disconnected',
  'plugins.weather-control.runtime.overlay.reconnected',
  'plugins.weather-control.runtime.overlay.connecting',
  'plugins.weather-control.runtime.overlay.reconnecting',
  'plugins.weather-control.runtime.overlay.init_failed',
  'plugins.weather-control.runtime.overlay.quest',
  'plugins.weather-control.runtime.overlay.reward',
  'plugins.weather-control.runtime.overlay.meter_disabled',
  'plugins.weather-control.runtime.overlay.streak_disabled',
  'plugins.weather-control.runtime.ui.preview_effect',
  'plugins.weather-control.runtime.ui.preview_stopped',
  'plugins.weather-control.runtime.ui.api_key_missing',
  'plugins.weather-control.runtime.ui.gift_cost',
  'plugins.weather-control.runtime.ui.invalid_sequence_json',
  'plugins.weather-control.runtime.ui.reset_failed',
  'plugins.weather-control.runtime.ui.overlay_url_unavailable',
  'plugins.weather-control.runtime.ui.presets.cozy_rain',
  'plugins.weather-control.runtime.ui.presets.boss_storm',
  'plugins.weather-control.runtime.ui.presets.winter_chill',
  'plugins.weather-control.runtime.ui.presets.cyber_glitch'
];

describe('Weather Control runtime localization', () => {
  test.each(['de', 'en', 'es', 'fr'])('defines namespaced runtime messages in %s', (locale) => {
    const file = path.join(pluginDir, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(file, 'utf8')));

    runtimeKeys.forEach((key) => expect(values[key]).toEqual(expect.any(String)));
  });

  test('uses namespaced runtime messages in the settings and overlay surfaces', () => {
    const ui = fs.readFileSync(path.join(pluginDir, 'ui.html'), 'utf8');
    const overlay = fs.readFileSync(path.join(pluginDir, 'overlay.html'), 'utf8');

    expect(ui).toContain("showStatus('plugins.weather-control.runtime.ui.preview_effect'");
    expect(ui).toContain("showStatus('plugins.weather-control.runtime.ui.preview_stopped'");
    expect(ui).toContain("weatherText('plugins.weather-control.runtime.ui.gift_cost'");
    expect(ui).toContain("weatherText('plugins.weather-control.runtime.ui.invalid_sequence_json'");
    expect(overlay).toContain("weatherText('plugins.weather-control.runtime.overlay.meter_disabled'");
    expect(overlay).toContain("weatherText('plugins.weather-control.runtime.overlay.streak_disabled'");
    expect(overlay).toContain("weatherText('plugins.weather-control.runtime.overlay.connected'");
  });
});
