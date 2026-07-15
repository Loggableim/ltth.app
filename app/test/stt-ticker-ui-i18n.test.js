'use strict';

const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'stt-ticker');
const locales = ['de', 'en', 'es', 'fr'];

function read(relativePath) {
  return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function getLeaf(object, key) {
  return key.split('.').reduce((value, part) => value && value[part], object);
}

describe('STT Ticker static UI localization', () => {
  const requiredKeys = {
    'capture.html': [
      'actions.copy', 'actions.stop', 'labels.source_microphone', 'labels.stt_model',
      'options.no_selection', 'options.no_models', 'options.no_api_key'
    ],
    'master.html': ['navigation.status', 'navigation.admin', 'navigation.capture'],
    'ui.html': [
      'actions.save_vrchat_output', 'labels.caption_style', 'labels.position',
      'labels.asr_provider', 'labels.stt_model', 'labels.model', 'labels.translation_color',
      'navigation.multi_language', 'options.center', 'options.no_selection', 'options.no_models',
      'help.multilang_rows', 'help.vrchat_final_captions'
    ]
  };

  test.each(Object.entries(requiredKeys))('%s uses stable STT Ticker keys', (file, keys) => {
    const source = read(file);
    keys.forEach((key) => {
      expect(source).toContain(`plugins.stt-ticker.stt_ticker.ui.${key}`);
    });
  });

  test('provides every audited UI key in DE, EN, ES, and FR', () => {
    const keys = [...new Set(Object.values(requiredKeys).flat())];
    locales.forEach((locale) => {
      const translation = JSON.parse(read(`locales/${locale}.json`));
      keys.forEach((key) => {
        expect(getLeaf(translation, `plugins.stt-ticker.stt_ticker.ui.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('loads the shared i18n client on each audited surface', () => {
    Object.keys(requiredKeys).forEach((file) => {
      expect(read(file)).toContain('/js/i18n-client.js');
    });
  });

  test('waits for i18n before it generates model-selection fallbacks', () => {
    ['capture.html', 'ui.html'].forEach((file) => {
      const source = read(file);
      expect(source).toContain('if (window.i18n?.ready) await window.i18n.ready;');
      expect(source).toContain('setSelectFallback(');
    });
  });
});
