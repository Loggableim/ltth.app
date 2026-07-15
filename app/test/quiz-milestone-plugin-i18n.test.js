'use strict';

const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

describe('Quiz Show and Viewer XP plugin UI localization', () => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const catalog = loadPublishedPluginCatalog(repoRoot);
  const result = auditPluginUi({
    repoRoot,
    catalog: { ...catalog, plugins: [...catalog.plugins, catalog.storeAdmin] }
  });

  test.each(['quiz-show', 'milestone-leaderboard'])('%s has no unmarked visible UI copy', (pluginId) => {
    expect(result.controlsByPlugin[pluginId]).toEqual([]);
  });
});
