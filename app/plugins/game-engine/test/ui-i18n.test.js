'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { auditPluginLocales, flattenTranslations } = require('../../../../scripts/lib/plugin-i18n-audit');
const { auditPluginUi } = require('../../../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../../../scripts/lib/published-plugin-catalog');

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const pluginId = 'game-engine';

function runtimeI18nApi(source, i18n) {
  const match = source.match(/\/\/ Runtime i18n helpers: start([\s\S]*?)\/\/ Runtime i18n helpers: end/);
  if (!match) throw new Error('Runtime i18n helper block is missing');
  return new Function('window', `${match[1]}; return { runtimeText, bindRuntimeI18nRerender };`)({ i18n });
}

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
      sources.flatMap((source) => [...source.matchAll(/runtimeText\(\s*'([^']+)'/g)].map((match) => match[1]))
    );

    expect(sources[0]).toContain('function setLocalizedHtml(element, markup)');
    expect(sources.every((source) => source.includes('function runtimeText(key, params = {}, fallback ='))).toBe(true);
    expect(sources.every((source) => (source.match(/bindRuntimeI18nRerender\(/g) || []).length >= 2)).toBe(true);
    expect(sources.every((source) => !source.includes("if (!window.i18n?.initialized) return '';"))).toBe(true);
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

  test('dashboard runtime text stays readable before init and rerenders for ready and language changes', async () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    let resolveReady;
    let onChange;
    let onLanguageChange;
    const i18n = {
      initialized: false,
      ready: new Promise(resolve => { resolveReady = resolve; }),
      t: jest.fn(() => 'translated'),
      onChange: jest.fn(callback => { onChange = callback; }),
      onLanguageChange: jest.fn(callback => { onLanguageChange = callback; })
    };
    const { runtimeText, bindRuntimeI18nRerender } = runtimeI18nApi(source, i18n);

    expect(runtimeText('plugins.game-engine.ui.runtime.dashboard.current_turn', { player: 'A' }, 'Turn: {player}'))
      .toBe('Turn: A');
    expect(i18n.t).not.toHaveBeenCalled();

    const rerender = jest.fn();
    bindRuntimeI18nRerender(rerender);
    i18n.initialized = true;
    resolveReady();
    await Promise.resolve();
    expect(rerender).toHaveBeenCalledTimes(1);
    onChange();
    onLanguageChange();
    expect(rerender).toHaveBeenCalledTimes(3);
  });

  test('Plinko binds one lifecycle replay and rerenders configured DOM text without a ready loop', async () => {
    const source = fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', pluginId, 'overlay', 'plinko.html'),
      'utf8'
    );
    const helperMatch = source.match(/\/\/ Runtime i18n helpers: start([\s\S]*?)\/\/ Runtime i18n helpers: end/);
    const applyDisplayTextsMatch = source.match(/    function applyDisplayTexts\(dt\) \{[\s\S]*?\n    \}/);
    const lifecycleMatch = source.match(/\/\/ Plinko i18n lifecycle: start([\s\S]*?)\/\/ Plinko i18n lifecycle: end/);
    expect(helperMatch).not.toBeNull();
    expect(applyDisplayTextsMatch).not.toBeNull();
    expect(lifecycleMatch).not.toBeNull();

    let resolveReady;
    let onChange;
    let onLanguageChange;
    const i18n = {
      initialized: false,
      ready: new Promise(resolve => { resolveReady = resolve; }),
      t: jest.fn(),
      onChange: jest.fn(callback => { onChange = callback; }),
      onLanguageChange: jest.fn(callback => { onLanguageChange = callback; })
    };
    const dom = new JSDOM('<div class="slot-label" data-multiplier="2">2x</div>');
    const api = new Function(
      'window',
      'document',
      `${helperMatch[1]}
       let config = { displayTexts: {} };
       let latestLeaderboardData = null;
       const renderLeaderboard = () => {};
       ${applyDisplayTextsMatch[0]}
       ${lifecycleMatch[1]}
       return { applyDisplayTexts };`
    )({ i18n }, dom.window.document);
    const label = dom.window.document.querySelector('.slot-label');

    api.applyDisplayTexts({ labelMultiplierPrefix: '$' });
    expect(label.textContent).toBe('$2');
    expect(i18n.onChange).toHaveBeenCalledTimes(1);
    expect(i18n.onLanguageChange).toHaveBeenCalledTimes(1);

    label.textContent = 'stale';
    i18n.initialized = true;
    resolveReady();
    await Promise.resolve();
    await Promise.resolve();
    expect(label.textContent).toBe('$2');
    expect(i18n.onChange).toHaveBeenCalledTimes(1);

    label.textContent = 'stale';
    onChange();
    expect(label.textContent).toBe('$2');
    label.textContent = 'stale';
    onLanguageChange();
    expect(label.textContent).toBe('$2');
  });
});
