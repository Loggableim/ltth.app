const fs = require('fs');
const path = require('path');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

describe('TTS admin runtime i18n', () => {
  const pluginRoot = path.join(__dirname, '..', 'plugins', 'tts');
  const html = fs.readFileSync(path.join(pluginRoot, 'ui', 'admin-panel.html'), 'utf8');
  const script = fs.readFileSync(path.join(pluginRoot, 'ui', 'tts-admin-production.js'), 'utf8');
  const runtimeKeys = [
    'plugins.tts.runtime.status.loading_config',
    'plugins.tts.runtime.save.success',
    'plugins.tts.runtime.save.failed',
    'plugins.tts.runtime.validation.voice_name_required',
    'plugins.tts.runtime.event_test.gift_queued',
    'plugins.tts.runtime.event_test.failed',
    'plugins.tts.runtime.voice_clone.consent_required',
    'plugins.tts.runtime.voice_clone.created',
    'plugins.tts.runtime.voice_clone.test_queued',
    'plugins.tts.runtime.navigation.label',
    'plugins.tts.runtime.search.users_placeholder',
    'plugins.tts.runtime.search.voices_placeholder',
    'plugins.tts.runtime.search.manual_username_placeholder',
    'plugins.tts.runtime.input.message_prefix_placeholder',
    'plugins.tts.runtime.input.fish_voice_name_placeholder',
    'plugins.tts.runtime.input.reference_id_placeholder',
    'plugins.tts.runtime.input.session_id_placeholder',
    'plugins.tts.runtime.input.test_text_placeholder',
    'plugins.tts.runtime.voice_clone.test_tooltip',
    'plugins.tts.runtime.voice_clone.delete_tooltip'
  ];

  test('uses the active client for dynamic runtime messages without translating data payloads', () => {
    expect(html).toContain('<script src="/js/i18n-client.js"></script>');
    expect(html).toContain('/plugins/tts/ui/tts-admin-production.js');
    expect(script).toContain('window.i18n.t(key, params)');
    expect(script).toContain("translateRuntime('plugins.tts.runtime.save.success', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.validation.voice_name_required', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.event_test.gift_queued', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.voice_clone.consent_required', {}");
    expect(script).toContain('escapeHtml(voiceName)');
    expect(script).toContain('escapeHtml(error.message)');
  });

  test('marks navigation, search, placeholders, tooltips and ARIA for active-client translation', () => {
    expect(html).toContain('data-i18n-aria-label="plugins.tts.runtime.navigation.label"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.search.users_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.search.voices_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.search.manual_username_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.input.message_prefix_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.input.fish_voice_name_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.input.reference_id_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.input.session_id_placeholder"');
    expect(html).toContain('data-i18n-placeholder="plugins.tts.runtime.input.test_text_placeholder"');
    expect(script).toContain('data-i18n-title="plugins.tts.runtime.voice_clone.test_tooltip"');
    expect(script).toContain('data-i18n-title="plugins.tts.runtime.voice_clone.delete_tooltip"');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides the runtime keys in %s', (locale) => {
    const translations = flattenTranslations(JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')));
    for (const key of runtimeKeys) {
      expect(translations[key]).toEqual(expect.any(String));
      expect(translations[key]).not.toBe('');
    }
  });
});
