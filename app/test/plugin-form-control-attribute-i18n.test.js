'use strict';

const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');

const PLUGIN_IDS = new Set([
  'game-engine',
  'openshock',
  'quiz-show',
  'milestone-leaderboard'
]);

describe('form-control attribute translations', () => {
  test('localizes every static placeholder, title, and accessible label in the repaired plugin surfaces', () => {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({ repoRoot, catalog });
    const errors = [...PLUGIN_IDS]
      .flatMap((pluginId) => result.controlsByPlugin[pluginId] || [])
      .filter((control) => control.subject.startsWith('placeholder ') || control.subject.startsWith('title ') || control.subject.startsWith('aria-label '));

    expect(errors).toEqual([]);
  });
});
