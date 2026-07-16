'use strict';

const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginIds = new Set([
  'advanced-timer',
  'animazingpal',
  'coinbattle',
  'config-import',
  'emoji-rain',
  'fireworks',
  'flame-overlay',
  'gcce',
  'gift-catalog',
  'goals',
  'interactive-story',
  'music-bot',
  'osc-bridge',
  'sidekick',
  'streamalchemy',
  'stt-ticker',
  'talking-heads',
  'thermal-printer',
  'vdoninja',
  'weather-control',
  'webgpu-emoji-rain',
  'webgpu-fireworks'
]);

describe('published plugin static form-control i18n', () => {
  test('marks every placeholder, title, and aria-label in the remediated plugins with a namespaced translation', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => pluginIds.has(plugin.id))
      }
    });

    expect(result.errors).toEqual([]);
  });
});
