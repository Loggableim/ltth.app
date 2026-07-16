'use strict';

const fs = require('fs');
const path = require('path');

const { auditPluginUi } = require('../../scripts/lib/plugin-ui-i18n-audit');
const { loadPublishedPluginCatalog } = require('../../scripts/lib/published-plugin-catalog');
const { flattenTranslations } = require('../../scripts/lib/plugin-i18n-audit');

const repoRoot = path.resolve(__dirname, '..', '..');
const pluginId = 'osc-bridge';
const uiKeys = [
  'plugins.osc-bridge.labels.live_log',
  'plugins.osc-bridge.labels.physbones_heading',
  'plugins.osc-bridge.labels.vrchat_chatbox',
  'plugins.osc-bridge.labels.chatbox_typing_indicator',
  'plugins.osc-bridge.labels.chatbox_notification_sound',
  'plugins.osc-bridge.labels.action_wave',
  'plugins.osc-bridge.labels.action_celebrate',
  'plugins.osc-bridge.labels.action_dance',
  'plugins.osc-bridge.labels.action_hearts',
  'plugins.osc-bridge.labels.action_confetti',
  'plugins.osc-bridge.labels.command_preview_example',
  'plugins.osc-bridge.osc_bridge.avatar_management.avatar_name'
];
const localeInvariantKeys = {
  de: new Set([
    'plugins.osc-bridge.labels.command_preview_example',
    'plugins.osc-bridge.osc_bridge.commands.wave.syntax',
    'plugins.osc-bridge.osc_bridge.commands.celebrate.syntax',
    'plugins.osc-bridge.osc_bridge.commands.dance.syntax',
    'plugins.osc-bridge.osc_bridge.commands.hearts.syntax',
    'plugins.osc-bridge.osc_bridge.commands.confetti.syntax'
  ]),
  es: new Set([
    'plugins.osc-bridge.labels.command_preview_example',
    'plugins.osc-bridge.osc_bridge.commands.wave.syntax',
    'plugins.osc-bridge.osc_bridge.commands.celebrate.syntax',
    'plugins.osc-bridge.osc_bridge.commands.dance.syntax',
    'plugins.osc-bridge.osc_bridge.commands.hearts.syntax',
    'plugins.osc-bridge.osc_bridge.commands.confetti.syntax'
  ]),
  fr: new Set([
    'plugins.osc-bridge.labels.command_preview_example',
    'plugins.osc-bridge.osc_bridge.commands.wave.syntax',
    'plugins.osc-bridge.osc_bridge.commands.celebrate.syntax',
    'plugins.osc-bridge.osc_bridge.commands.dance.syntax',
    'plugins.osc-bridge.osc_bridge.commands.hearts.syntax',
    'plugins.osc-bridge.osc_bridge.commands.confetti.syntax'
  ])
};

describe('OSC Bridge UI i18n', () => {
  test('marks every static OSC Bridge control and supplies every referenced locale leaf', () => {
    const catalog = loadPublishedPluginCatalog(repoRoot);
    const result = auditPluginUi({
      repoRoot,
      catalog: {
        ...catalog,
        plugins: catalog.plugins.filter((plugin) => plugin.id === pluginId)
      }
    });

    expect(result.errors).toEqual([]);
  });

  test.each(['de', 'en', 'es', 'fr'])('provides semantic VRChat and action labels in %s', (locale) => {
    const localePath = path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${locale}.json`);
    const values = flattenTranslations(JSON.parse(fs.readFileSync(localePath, 'utf8')));

    for (const key of uiKeys) {
      expect(values[key]).toEqual(expect.any(String));
    }
  });

  test.each(['de', 'es', 'fr'])('keeps user-facing OSC Bridge copy independent from English in %s', (locale) => {
    const loadLocale = (name) => flattenTranslations(JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${name}.json`),
      'utf8'
    )));
    const english = loadLocale('en');
    const translated = loadLocale(locale);
    const copiedEnglish = Object.entries(english)
      .filter(([key, value]) => (
        typeof value === 'string'
        && /[A-Za-z]{3}/.test(value)
        && translated[key] === value
        && !localeInvariantKeys[locale].has(key)
      ))
      .map(([key]) => key);

    expect(copiedEnglish).toEqual([]);
  });

  test.each(['de', 'es', 'fr'])('keeps OSC command routes stable in %s', (locale) => {
    const loadLocale = (name) => flattenTranslations(JSON.parse(fs.readFileSync(
      path.join(repoRoot, 'app', 'plugins', pluginId, 'locales', `${name}.json`),
      'utf8'
    )));
    const english = loadLocale('en');
    const translated = loadLocale(locale);
    const commandSyntaxKeys = [
      'plugins.osc-bridge.osc_bridge.commands.wave.syntax',
      'plugins.osc-bridge.osc_bridge.commands.celebrate.syntax',
      'plugins.osc-bridge.osc_bridge.commands.dance.syntax',
      'plugins.osc-bridge.osc_bridge.commands.hearts.syntax',
      'plugins.osc-bridge.osc_bridge.commands.confetti.syntax'
    ];

    for (const key of commandSyntaxKeys) {
      expect(translated[key]).toBe(english[key]);
    }

    expect(translated['plugins.osc-bridge.osc_bridge.commands.emote.syntax']).toContain('/emote');
    expect(translated['plugins.osc-bridge.osc_bridge.commands.emote.examples']).toContain('/emote 0');
    expect(translated['plugins.osc-bridge.osc_bridge.commands.emote.examples']).toContain('/emote 3');
  });

  test('loads the shared i18n client for the settings surface', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'app', 'plugins', pluginId, 'ui.html'), 'utf8');
    expect(source).toContain('/js/i18n-client.js');
  });
});
