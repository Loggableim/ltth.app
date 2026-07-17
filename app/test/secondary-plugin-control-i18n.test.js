'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');
const LOCALES = ['de', 'en', 'es', 'fr'];

const surfaces = {
  openshock: {
    html: 'app/plugins/openshock/ui.html',
    localeDir: 'app/plugins/openshock/locales',
    bindings: [
      { selector: '#patternName', attribute: 'data-i18n', key: 'plugins.openshock.labels.pattern_name' }
    ]
  },
  'quiz-show': {
    html: 'app/plugins/quiz-show/quiz_show.html',
    localeDir: 'app/plugins/quiz-show/locales',
    bindings: [
      { selector: '#customCSS', attribute: 'data-i18n-placeholder', key: 'plugins.quiz-show.form_controls.placeholders.custom_css' },
      { selector: '#giftJokerEnabled', attribute: 'data-i18n', key: 'plugins.quiz-show.gift_jokers.enabled' },
      { selector: '#jsonUpload', attribute: 'data-i18n-placeholder', key: 'plugins.quiz-show.form_controls.placeholders.question_import_example' },
      { selector: '#importLeaderboardJson', attribute: 'data-i18n-placeholder', key: 'plugins.quiz-show.form_controls.placeholders.leaderboard_import_example' },
      { selector: '#duelLeftLabel', attribute: 'data-i18n-aria-label', key: 'plugins.quiz-show.form_controls.aria.duel_left_label' },
      { selector: '#duelRightLabel', attribute: 'data-i18n-aria-label', key: 'plugins.quiz-show.form_controls.aria.duel_right_label' },
      { selector: '#showRoundCount', attribute: 'data-i18n-aria-label', key: 'plugins.quiz-show.form_controls.aria.show_round_count' },
      { selector: '#soundFileInput', attribute: 'data-i18n-aria-label', key: 'plugins.quiz-show.form_controls.aria.sound_file' },
      { selector: '#soundVolume', attribute: 'data-i18n-aria-label', key: 'plugins.quiz-show.form_controls.aria.sound_volume' }
    ]
  },
  'flame-overlay': {
    html: 'app/plugins/flame-overlay/ui/settings.html',
    localeDir: 'app/plugins/flame-overlay/locales',
    bindings: [
      { selector: '#previewIframe', attribute: 'data-i18n-title', key: 'plugins.flame-overlay.form_controls.visual_fx_preview_title' },
      { selector: '#flameBrightness', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.flame_brightness' },
      { selector: '#edgeFeather', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.edge_feather' },
      { selector: '#frameNoiseAmount', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.frame_noise_amount' },
      { selector: '#pulseSpeed', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.pulse_speed' },
      { selector: '#bloomThreshold', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.bloom_threshold' },
      { selector: '#bloomRadius', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.bloom_radius' },
      { selector: '#layerParallax', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.layer_parallax' },
      { selector: '#smokeSpeed', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.smoke_speed' },
      { selector: '#triggerCooldown', attribute: 'data-i18n', key: 'plugins.flame-overlay.form_controls.labels.trigger_cooldown' }
    ]
  },
  'stt-ticker': {
    html: 'app/plugins/stt-ticker/ui.html',
    localeDir: 'app/plugins/stt-ticker/locales',
    bindings: [
      { selector: '#btn-add-lang', attribute: 'data-i18n-aria-label', key: 'plugins.stt-ticker.form_controls.aria.add_language' },
      { selector: '#language-mode-auto', attribute: 'data-i18n', key: 'plugins.stt-ticker.form_controls.labels.auto_detect_language' },
      { selector: '#vad-rmsThreshold', attribute: 'data-i18n', key: 'plugins.stt-ticker.form_controls.labels.rms_threshold' },
      { selector: '#vrchat-chatbox-enabled', attribute: 'data-i18n', key: 'plugins.stt-ticker.form_controls.labels.send_to_vrchat_chatbox' }
    ]
  },
  'milestone-leaderboard': {
    html: 'app/plugins/milestone-leaderboard/vendor/gift-milestone/ui.html',
    localeDir: 'app/plugins/milestone-leaderboard/locales',
    bindings: [
      { selector: '#enableToggle', attribute: 'data-i18n-aria-label', key: 'plugins.milestone-leaderboard.form_controls.aria.enable_plugin' }
    ]
  }
};

function flattened(value, prefix = '') {
  const entries = {};
  for (const [key, nested] of Object.entries(value)) {
    const pathKey = `${prefix}${key}`;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(entries, flattened(nested, `${pathKey}.`));
      continue;
    }
    entries[pathKey] = nested;
  }
  return entries;
}

function sourceWindow(source, selector) {
  const id = selector.slice(1);
  const index = source.indexOf(`id="${id}"`);
  expect(index).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, index - 700), index + 700);
}

describe('secondary published-plugin control translations', () => {
  for (const [pluginId, surface] of Object.entries(surfaces)) {
    test(`${pluginId} keeps every repaired control bound to a namespaced locale leaf`, () => {
      const source = fs.readFileSync(path.join(repoRoot, surface.html), 'utf8');
      for (const binding of surface.bindings) {
        expect(sourceWindow(source, binding.selector)).toContain(`${binding.attribute}="${binding.key}"`);
        for (const locale of LOCALES) {
          const translations = flattened(JSON.parse(fs.readFileSync(path.join(repoRoot, surface.localeDir, `${locale}.json`), 'utf8')));
          expect(translations[binding.key]).toEqual(expect.any(String));
          expect(translations[binding.key].trim()).not.toBe('');
        }
      }
    });
  }
});
