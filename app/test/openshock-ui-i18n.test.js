'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'openshock');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('OpenShock static UI localization', () => {
  const requiredMarkers = {
    'openshock.html': [
      'navigation.dashboard', 'navigation.safety', 'navigation.patterns', 'navigation.advanced',
      'sections.devices', 'sections.statistics', 'labels.device', 'labels.enabled',
      'labels.description', 'labels.steps', 'labels.intensity', 'events.all', 'events.info',
      'events.warning', 'events.error', 'events.gift', 'events.follow', 'events.share',
      'events.like', 'events.subscribe', 'actions.shock', 'actions.vibrate', 'actions.sound',
      'actions.pause', 'tooltips.create_pattern', 'tooltips.edit_pattern', 'table.actions',
      'table.metric', 'table.value'
    ],
    'ui.html': [
      'sections.devices', 'sections.statistics', 'labels.device', 'labels.enabled',
      'labels.description', 'labels.action', 'labels.code', 'labels.method', 'labels.pattern',
      'labels.preview', 'labels.intensity', 'status.active', 'events.all', 'events.info',
      'events.warning', 'events.error', 'events.gift', 'events.follow', 'events.share',
      'events.like', 'events.subscribe', 'actions.shock', 'actions.vibrate', 'actions.sound',
      'table.actions', 'table.metric', 'table.value'
    ],
    'overlay/openshock_overlay.html': ['overlay.queue', 'overlay.active', 'overlay.today', 'labels.duration', 'labels.intensity'],
    'overlay/openshock-rotating-gifts.html': ['overlay.pattern', 'overlay.duration', 'overlay.intensity'],
    'src/features/pattern-editor/index.html': ['empty_state.no_devices'],
    'src/features/pattern-editor/pattern-editor-test.html': ['empty_state.no_devices', 'actions.select']
  };

  test.each(Object.entries(requiredMarkers))('%s uses stable OpenShock keys', (file, keys) => {
    const source = read(file);
    keys.forEach((key) => {
      expect(source).toContain(`plugins.openshock.ui.${key}`);
    });
  });

  test('provides every static UI key in DE, EN, ES, and FR', () => {
    const keys = [...new Set(Object.values(requiredMarkers).flat())];
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      keys.forEach((key) => {
        expect(getLeaf(translation, `plugins.openshock.ui.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('resolves every queue label through the runtime queue-page namespace', () => {
    const queueKeys = [
      'processing', 'source', 'type', 'intensity', 'duration', 'device', 'unknown',
      'not_available', 'empty', 'clear_confirm', 'cleared', 'status_pending',
      'status_processing', 'status_completed', 'status_failed'
    ];
    const source = read('queue.html');

    expect(source).toContain('plugins.openshock.runtime.queue_page.${key}');
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      queueKeys.forEach((key) => {
        expect(getLeaf(translation, `plugins.openshock.runtime.queue_page.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('loads the shared i18n client on every audited UI surface', () => {
    Object.keys(requiredMarkers).forEach((file) => {
      expect(read(file)).toContain('/js/i18n-client.js');
    });
  });

  test('waits for i18n before rendering translated Pattern Editor controls', () => {
    const source = read('src/features/pattern-editor/pattern-editor-test.html');
    expect(source).toContain('window.i18n.ready.then(() => renderPatternLibrary())');
    expect(source).toContain('window.i18n?.onLanguageChange(() => renderPatternLibrary())');
  });
});
