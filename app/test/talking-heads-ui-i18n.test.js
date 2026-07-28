'use strict';

const fs = require('fs');
const path = require('path');

describe('Talking Heads runtime UI localization', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'talking-heads');
  const uiSource = fs.readFileSync(path.join(pluginRoot, 'assets', 'ui.js'), 'utf8');
  const messageKeys = [
    'configSaved',
    'framesPrepared',
    'previewStarted',
    'animationStarted',
    'testSpinStarted',
    'statusUnavailable',
    'enabled',
    'disabled',
    'healthUpdated',
    'directorReady',
    'requestFailed',
    'framePreviewUnavailable',
    'chooseManualZip',
    'manualSetUploaded',
    'manualSetDeleted',
    'manualSetAssigned',
    'cacheCleared',
    'viewerBarSaved',
    'copyUnavailable'
  ];

  test('uses a stable plugin-namespaced key prefix for dynamic dashboard text', () => {
    expect(uiSource).toContain('plugins.talking-heads.talking_heads_ui.stream_director.messages.');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides every local asset message in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8'));
    const get = (key) => key.split('.').reduce((value, part) => value && value[part], translations);

    for (const messageKey of messageKeys) {
      const key = `plugins.talking-heads.talking_heads_ui.stream_director.messages.${messageKey}`;
      expect(get(key)).toEqual(expect.any(String));
      expect(get(key)).not.toBe('');
    }
  });
});
