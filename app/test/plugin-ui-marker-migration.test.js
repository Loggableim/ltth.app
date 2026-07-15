const { addExistingPluginMarkers, buildUniqueTranslationMap, rewriteLegacyPluginKeys } = require('../../scripts/lib/plugin-ui-marker-migration');

describe('plugin UI marker migration', () => {
  test('adds a plugin-scoped key only for matching visible HTML text', () => {
    const result = addExistingPluginMarkers([
      '<button class="btn">Save settings</button>',
      '<script>const sample = "Save settings";</script>',
      '<p data-i18n="plugins.demo.labels.existing">Already marked</p>'
    ].join(''), new Map([
      ['Save settings', 'plugins.demo.actions.save_settings']
    ]));

    expect(result.source).toBe([
      '<button class="btn" data-i18n="plugins.demo.actions.save_settings">Save settings</button>',
      '<script>const sample = "Save settings";</script>',
      '<p data-i18n="plugins.demo.labels.existing">Already marked</p>'
    ].join(''));
    expect(result.marked).toBe(1);
  });

  test('does not guess a key for unmatched or interpolated text', () => {
    const result = addExistingPluginMarkers(
      '<button>Apply</button><span>${coins} Coins</span>',
      new Map([['Save settings', 'plugins.demo.actions.save_settings']])
    );

    expect(result.source).toBe('<button>Apply</button><span>${coins} Coins</span>');
    expect(result.marked).toBe(0);
  });

  test('rewrites only legacy keys with a complete plugin-scoped replacement', () => {
    const result = rewriteLegacyPluginKeys([
      '<title data-i18n="ui.title">Timer</title>',
      '<button data-i18n="plugin.name">Timer</button>',
      '<span data-i18n="common.save">Save</span>',
      '<span data-i18n="generated.old">Old</span>',
      '<script>api.t(\'ui.title\'); i18n.t("ui.missing");</script>'
    ].join(''), 'advanced-timer', new Set([
      'plugins.advanced-timer.ui.title',
      'plugins.advanced-timer.plugin.name'
    ]));

    expect(result.source).toBe([
      '<title data-i18n="plugins.advanced-timer.ui.title">Timer</title>',
      '<button data-i18n="plugins.advanced-timer.plugin.name">Timer</button>',
      '<span data-i18n="common.save">Save</span>',
      '<span data-i18n="generated.old">Old</span>',
      '<script>api.t(\'plugins.advanced-timer.ui.title\'); i18n.t("ui.missing");</script>'
    ].join(''));
    expect(result.rewritten).toBe(3);
  });

  test('does not infer a marker from a text value that maps to multiple keys', () => {
    const map = buildUniqueTranslationMap([
      ['plugins.demo.actions.save', 'Save'],
      ['plugins.demo.buttons.save', 'Save'],
      ['plugins.demo.actions.reset', 'Reset']
    ]);

    expect(map.has('Save')).toBe(false);
    expect(map.get('Reset')).toBe('plugins.demo.actions.reset');
  });
});
