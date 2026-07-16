'use strict';

const fs = require('fs');
const path = require('path');
const { auditPluginLocales, flattenTranslations } = require('../../../../scripts/lib/plugin-i18n-audit');
const { auditPluginUi } = require('../../../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const pluginId = 'game-engine';

describe('Game Engine UI i18n', () => {
  test('keeps every visible Game Engine surface on namespaced translation keys', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const plugin = catalog.plugins.find((entry) => entry.id === pluginId);
    const result = auditPluginUi({ repoRoot, catalog: { plugins: [plugin] } });

    expect(result.errors).toEqual([]);
  });

  test('keeps every Game Engine locale leaf independently translated', () => {
    const errors = auditPluginLocales(path.join(repoRoot, 'app', 'plugins')).errors
      .filter((error) => error.startsWith(`${pluginId}/`));

    expect(errors).toEqual([]);
  });

  test('routes dynamic dashboard and overlay copy through independently translated runtime keys', () => {
    const pluginRoot = path.join(repoRoot, 'app', 'plugins', pluginId);
    const sources = [
      'ui.html',
      'overlay/arena.html',
      'overlay/chess.html',
      'overlay/connect4.html',
      'overlay/game-hud.html',
      'overlay/plinko.html',
      'overlay/unified.html',
      'overlay/wheel.html'
    ].map((relativePath) => fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8'));
    const runtimeKeys = new Set(
      sources.flatMap((source) => [...source.matchAll(/runtimeText\('([^']+)'/g)].map((match) => match[1]))
    );

    expect(sources[0]).toContain('function setLocalizedHtml(element, markup)');
    expect(sources.every((source) => source.includes('function runtimeText(key, params = {})'))).toBe(true);
    expect(runtimeKeys).toContain('plugins.game-engine.ui.runtime.dashboard.current_turn');
    expect(runtimeKeys).toContain('plugins.game-engine.runtime.connect4.current_turn');

    for (const locale of ['de', 'en', 'es', 'fr']) {
      const values = flattenTranslations(JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')));
      for (const runtimeKey of runtimeKeys) {
        const localeKey = runtimeKey.replace(/^plugins\.game-engine\.runtime\./, 'plugins.game-engine.ui.runtime.');
        expect(values[localeKey]).toEqual(expect.any(String));
        expect(values[localeKey]).not.toBe('');
      }
    }
  });
});
