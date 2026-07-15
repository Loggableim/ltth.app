'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginIds = ['music-bot', 'visual-fx-frame-webgpu'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

describe('Music Bot and Visual FX Frame WebGPU UI i18n', () => {
  test('keeps every audited control namespaced and available in all four locales', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => pluginIds.includes(plugin.id))
      }
    });

    expect(result.errors).toEqual([]);
  });

  test.each([
    ['app/plugins/music-bot', 'music-bot'],
    ['plugin-store/sources/visual-fx-frame-webgpu', 'visual-fx-frame-webgpu']
  ])('%s supplies semantic controls in de/en/es/fr', (relativeRoot, pluginId) => {
    for (const locale of ['de', 'en', 'es', 'fr']) {
      const localePath = path.join(repoRoot, relativeRoot, 'locales', `${locale}.json`);
      const contents = readJson(localePath);
      expect(contents.plugins[pluginId]).toBeDefined();
      const source = fs.readFileSync(localePath, 'utf8');
      expect(source).not.toContain('generated.');
      expect(source).toContain('"controls"');
    }
  });

  test('loads the i18n client on Music Bot and Visual FX overlay surfaces', () => {
    const sources = [
      'app/plugins/music-bot/ui.html',
      'app/plugins/music-bot/overlay.html',
      'plugin-store/sources/visual-fx-frame-webgpu/ui/settings.html',
      'plugin-store/sources/visual-fx-frame-webgpu/renderer/index.html'
    ];

    for (const relativePath of sources) {
      const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
      expect(source).toContain('/js/i18n-client.js');
      expect(source).not.toContain('data-i18n="generated.');
    }
  });
});
