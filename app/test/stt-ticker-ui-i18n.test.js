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
      'options.no_selection', 'options.no_models', 'options.no_api_key',
      'messages.translation_pending', 'messages.line_count', 'messages.choose_language',
      'messages.already_added', 'messages.no_target_language', 'messages.error',
      'messages.saved', 'messages.system_microphone', 'messages.no_input_devices',
      'messages.microphone_name'
    ],
    'master.html': [
      'navigation.status', 'navigation.admin', 'navigation.capture',
      'messages.status_unavailable', 'messages.status_summary', 'messages.status_error',
      'messages.active_view_reloaded'
    ],
    'ui.html': [
      'actions.save_vrchat_output', 'labels.caption_style', 'labels.position',
      'labels.asr_provider', 'labels.stt_model', 'labels.model', 'labels.translation_color',
      'navigation.multi_language', 'options.center', 'options.no_selection', 'options.no_models',
      'help.multilang_rows', 'help.vrchat_final_captions', 'messages.enabled',
      'messages.disabled', 'messages.deepgram_active', 'messages.elevenlabs_active',
      'messages.fish_audio_active', 'messages.unknown', 'messages.key_configured',
      'messages.key_not_configured', 'messages.translation_on', 'messages.translation_off',
      'messages.osc_bridge_ready', 'messages.osc_bridge_unavailable',
      'messages.saved_key_masked', 'messages.no_target_language', 'messages.config_saved',
      'messages.saving', 'messages.asr_settings_saved', 'messages.buffer_cleared',
      'messages.no_key_to_test', 'messages.testing', 'messages.already_added',
      'messages.vrchat_enable_pending', 'messages.vrchat_disabled', 'messages.cache_cleared',
      'messages.key_valid', 'messages.key_invalid', 'messages.provider_deepgram'
      , 'messages.key_source_config', 'messages.key_source_file',
      'messages.key_source_environment', 'messages.key_source_plugin',
      'messages.deepgram_multilingual_hint', 'messages.deepgram_fixed_language_hint'
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

  test('waits for i18n before it renders dynamic admin status values', () => {
    expect(read('ui.html')).toContain('async function refreshStatus() {\n      if (window.i18n?.ready) await window.i18n.ready;');
  });

  test('uses stable message keys for every audited runtime status', () => {
    expect(read('capture.html')).toContain('plugins.stt-ticker.stt_ticker.ui.messages.translation_pending');
    expect(read('master.html')).toContain('plugins.stt-ticker.stt_ticker.ui.messages.status_summary');
    expect(read('ui.html')).toContain('plugins.stt-ticker.stt_ticker.ui.messages.deepgram_active');
  });
});
