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
    'plugins.tts.runtime.controls.speed',
    'plugins.tts.runtime.controls.volume',
    'plugins.tts.runtime.controls.reveal_session_id',
    'plugins.tts.runtime.voice_clone.test_tooltip',
    'plugins.tts.runtime.voice_clone.delete_tooltip',
    'plugins.tts.runtime.voice.custom_empty',
    'plugins.tts.runtime.voice.remove_confirm',
    'plugins.tts.runtime.voice.none_available',
    'plugins.tts.runtime.voice.default',
    'plugins.tts.runtime.voice.none_for_engine',
    'plugins.tts.runtime.voice.none_matching',
    'plugins.tts.runtime.users.no_results',
    'plugins.tts.runtime.users.no_results_for',
    'plugins.tts.runtime.users.results_summary',
    'plugins.tts.runtime.users.empty',
    'plugins.tts.runtime.users.blacklist_confirm',
    'plugins.tts.runtime.queue.empty',
    'plugins.tts.runtime.queue.no_audio_playing',
    'plugins.tts.runtime.queue.clear_confirm',
    'plugins.tts.runtime.queue.stats.total_queued',
    'plugins.tts.runtime.queue.stats.total_played',
    'plugins.tts.runtime.queue.stats.total_dropped',
    'plugins.tts.runtime.queue.stats.rate_limited',
    'plugins.tts.runtime.queue.stats.current_queue',
    'plugins.tts.runtime.permissions.stats.total_users',
    'plugins.tts.runtime.permissions.stats.whitelisted',
    'plugins.tts.runtime.permissions.stats.blacklisted',
    'plugins.tts.runtime.permissions.stats.voice_assigned',
    'plugins.tts.runtime.gifters.load_failed',
    'plugins.tts.runtime.gifters.empty',
    'plugins.tts.runtime.gifters.error',
    'plugins.tts.runtime.logs.empty',
    'plugins.tts.runtime.logs.clear_confirm',
    'plugins.tts.runtime.debug.enable',
    'plugins.tts.runtime.debug.disable',
    'plugins.tts.runtime.debug.enabled',
    'plugins.tts.runtime.debug.disabled',
    'plugins.tts.runtime.debug.active',
    'plugins.tts.runtime.debug.inactive',
    'plugins.tts.runtime.status.statistics_load_failed',
    'plugins.tts.runtime.voice.custom_form_unavailable',
    'plugins.tts.runtime.voice.custom_exists',
    'plugins.tts.runtime.voice.custom_added',
    'plugins.tts.runtime.voice.custom_not_found',
    'plugins.tts.runtime.voice.custom_removed',
    'plugins.tts.runtime.voice.load_failed',
    'plugins.tts.runtime.manual.form_unavailable',
    'plugins.tts.runtime.manual.username_required',
    'plugins.tts.runtime.manual.voice_required',
    'plugins.tts.runtime.manual.assigned',
    'plugins.tts.runtime.manual.assign_failed',
    'plugins.tts.runtime.users.load_failed',
    'plugins.tts.runtime.users.allowed',
    'plugins.tts.runtime.users.allow_failed',
    'plugins.tts.runtime.users.revoked',
    'plugins.tts.runtime.users.revoke_failed',
    'plugins.tts.runtime.users.blacklisted',
    'plugins.tts.runtime.users.blacklist_failed',
    'plugins.tts.runtime.users.unblacklisted',
    'plugins.tts.runtime.users.unblacklist_failed',
    'plugins.tts.runtime.gain.update_failed',
    'plugins.tts.runtime.modal.unavailable',
    'plugins.tts.runtime.modal.voice_required',
    'plugins.tts.runtime.modal.assigned',
    'plugins.tts.runtime.modal.assign_failed',
    'plugins.tts.runtime.queue.cleared',
    'plugins.tts.runtime.queue.clear_failed',
    'plugins.tts.runtime.queue.skipped',
    'plugins.tts.runtime.queue.nothing_to_skip',
    'plugins.tts.runtime.queue.skip_failed',
    'plugins.tts.runtime.test.text_required',
    'plugins.tts.runtime.test.queued',
    'plugins.tts.runtime.test.failed',
    'plugins.tts.runtime.logs.cleared',
    'plugins.tts.runtime.logs.clear_failed',
    'plugins.tts.runtime.debug.mode_changed',
    'plugins.tts.runtime.debug.toggle_failed',
    'plugins.tts.runtime.gift_rules.name_placeholder',
    'plugins.tts.runtime.gift_rules.template_placeholder',
    'plugins.tts.runtime.gift_rules.reminder_placeholder',
    'plugins.tts.runtime.gift_rules.remove',
    'plugins.tts.runtime.gift_rules.default_voice'
  ];

  test('uses the active client for dynamic runtime messages without translating data payloads', () => {
    expect(html).toContain('<script src="/js/i18n-client.js"></script>');
    expect(html).toContain('/plugins/tts/ui/tts-admin-production.js');
    expect(script).toContain('window.i18n.t(key, params)');
    expect(script).toContain("translateRuntime('plugins.tts.runtime.save.success', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.validation.voice_name_required', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.event_test.gift_queued', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.voice_clone.consent_required', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.queue.empty', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.users.results_summary'");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.logs.clear_confirm', {}");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.users.allowed', { username }");
    expect(script).toContain("translateRuntime('plugins.tts.runtime.gift_rules.name_placeholder', {}");
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

  test('localizes the range labels and the SessionID visibility control', () => {
    expect(html).toContain('data-i18n="plugins.tts.runtime.controls.volume"');
    expect(html).toContain('data-i18n="plugins.tts.runtime.controls.speed"');
    expect(html).toContain('data-i18n-aria-label="plugins.tts.runtime.controls.reveal_session_id"');
    expect(html).toContain('data-i18n-title="plugins.tts.runtime.controls.reveal_session_id"');
  });

  test.each(['de', 'en', 'es', 'fr'])('provides the runtime keys in %s', (locale) => {
    const translations = flattenTranslations(JSON.parse(fs.readFileSync(path.join(pluginRoot, 'locales', `${locale}.json`), 'utf8')));
    for (const key of runtimeKeys) {
      expect(translations[key]).toEqual(expect.any(String));
      expect(translations[key]).not.toBe('');
    }
  });
});
