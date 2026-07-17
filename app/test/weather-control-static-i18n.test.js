'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');
const { JSDOM } = require('jsdom');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'weather-control';

describe('Weather Control static UI i18n', () => {
  test('marks every statically visible control with a complete namespaced translation', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides Weather Control controls in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.weather-control.ui.commands.weather',
      'plugins.weather-control.ui.overlay.quest',
      'plugins.weather-control.ui.effects.direction',
      'plugins.weather-control.ui.active.noEffects',
      'plugins.weather-control.labels.glitch_displacement',
      'plugins.weather-control.labels.glitch_scanlines'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client on settings and overlay surfaces', () => {
    for (const relativePath of ['ui.html', 'overlay.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });

  test('localizes every named Glitch Clouds sub-effect', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    expect(source).toContain('data-i18n-key="plugins.weather-control.labels.glitch_displacement"');
    expect(source).toContain('data-i18n-key="plugins.weather-control.labels.glitch_scanlines"');
  });

  test('derives each effect enable switch from its localized effect title', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    const document = new JSDOM(source).window.document;
    const toggleIds = [
      'effect-rain-enabled', 'effect-snow-enabled', 'effect-storm-enabled',
      'effect-fog-enabled', 'effect-thunder-enabled', 'effect-sunbeam-enabled',
      'effect-glitchclouds-enabled', 'effect-aurora-enabled', 'effect-fireflies-enabled',
      'effect-meteors-enabled', 'effect-sakura-enabled', 'effect-embers-enabled'
    ];
    const keys = toggleIds.map((id) => {
      const toggle = document.getElementById(id);
      expect(toggle).not.toBeNull();
      const key = toggle.closest('.effect-card')?.querySelector('.effect-title [data-i18n-key]')?.getAttribute('data-i18n-key');
      expect(key).toMatch(/^plugins\.weather-control\.effects\.names\./);
      return key;
    });
    expect(source).toContain('id="effect-heatwave-enabled"');
    expect(source).toContain('data-i18n-key="plugins.weather-control.effects.names.heatwave"');
    keys.push('plugins.weather-control.effects.names.heatwave');

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
      const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));
      for (const key of keys) expect(values[key]).toEqual(expect.any(String));
    }
  });
});
