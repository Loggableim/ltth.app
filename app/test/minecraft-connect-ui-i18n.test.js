'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'minecraft-connect';

describe('Minecraft Connect UI i18n', () => {
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

  test.each(['de', 'en', 'es', 'fr'])('provides semantic Minecraft Connect controls in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of [
      'plugins.minecraft-connect.minecraft_connect.ui.sections.commands',
      'plugins.minecraft-connect.minecraft_connect.ui.themes.day',
      'plugins.minecraft-connect.minecraft_connect.ui.metrics.queue',
      'plugins.minecraft-connect.minecraft_connect.ui.connection.title'
    ]) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test('loads the shared i18n client on the dashboard and overlay', () => {
    for (const relativePath of ['minecraft-connect.html', 'overlay/minecraft_overlay.html']) {
      const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
    }
  });

  test('uses stable locale keys for dashboard and overlay runtime copy', () => {
    const dashboardSource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'minecraft-connect.js'), 'utf8');
    const overlaySource = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'overlay', 'minecraft_overlay.js'), 'utf8');

    expect(dashboardSource).toContain("const RUNTIME_I18N_PREFIX = 'plugins.minecraft-connect.minecraft_connect.runtime.'");
    expect(dashboardSource).toContain("runtimeText('mappings.empty_title'");
    expect(dashboardSource).toContain("runtimeText('messages.save_failed_with_error'");
    expect(overlaySource).toContain("const OVERLAY_I18N_PREFIX = 'plugins.minecraft-connect.minecraft_connect.overlay.'");
    expect(overlaySource).toContain("overlayText('triggered_by'");
    expect(overlaySource).toContain("overlayText(`actions.${action}`");

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
      const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

      for (const key of [
        'plugins.minecraft-connect.minecraft_connect.runtime.status.queue_theme',
        'plugins.minecraft-connect.minecraft_connect.runtime.mappings.empty_title',
        'plugins.minecraft-connect.minecraft_connect.runtime.mappings.no_conditions',
        'plugins.minecraft-connect.minecraft_connect.runtime.goals.remove',
        'plugins.minecraft-connect.minecraft_connect.runtime.setup.websocket_bridge',
        'plugins.minecraft-connect.minecraft_connect.runtime.messages.save_failed_with_error',
        'plugins.minecraft-connect.minecraft_connect.runtime.messages.settings_saved',
        'plugins.minecraft-connect.minecraft_connect.overlay.triggered_by',
        'plugins.minecraft-connect.minecraft_connect.overlay.actions.spawn_entity',
        'plugins.minecraft-connect.minecraft_connect.overlay.parameters.spawn_entity'
      ]) {
        expect(values[key]).toEqual(expect.any(String));
        expect(values[key].trim()).not.toBe('');
      }
    }
  });
});
