'use strict';

const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { auditPluginLocales } = require('../../scripts/lib/plugin-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

describe('Quiz Show runtime localization', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const catalog = loadPublishedPluginCatalog(repoRoot);
  const auditOptions = {
    repoRoot,
    catalog: { ...catalog, plugins: [...catalog.plugins, catalog.storeAdmin] }
  };

  test('uses locale keys for every fixed runtime message', () => {
    const errors = auditPluginUi(auditOptions).errors
      .filter((error) => error.startsWith('quiz-show/'));

    expect(errors).toEqual([]);
  });

  test('translates every non-invariant locale leaf independently', () => {
    const errors = auditPluginLocales(path.join(repoRoot, 'app', 'plugins')).errors
      .filter((error) => error.startsWith('quiz-show'));

    expect(errors).toEqual([]);
  });
});
