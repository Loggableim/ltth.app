'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'osc-bridge';
const uiKeys = [
  'plugins.osc-bridge.labels.live_log',
  'plugins.osc-bridge.labels.physbones_heading',
  'plugins.osc-bridge.labels.vrchat_chatbox',
  'plugins.osc-bridge.labels.chatbox_typing_indicator',
  'plugins.osc-bridge.labels.chatbox_notification_sound',
  'plugins.osc-bridge.labels.action_wave',
  'plugins.osc-bridge.labels.action_celebrate',
  'plugins.osc-bridge.labels.action_dance',
  'plugins.osc-bridge.labels.action_hearts',
  'plugins.osc-bridge.labels.action_confetti',
  'plugins.osc-bridge.labels.command_preview_example',
  'plugins.osc-bridge.osc_bridge.avatar_management.avatar_name'
];

describe('OSC Bridge UI i18n', () => {
  test('marks every static OSC Bridge control and supplies every referenced locale leaf', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides semantic VRChat and action labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client for the settings surface', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    expect(source).toContain('/js/i18n-client.js');
  });
});
