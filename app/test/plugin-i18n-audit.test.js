const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditPluginLocales } = require('../../scripts/lib/plugin-i18n-audit');

const locales = ['de', 'en', 'es', 'fr'];

function writePluginFixture(root, id, translations) {
  const localeDir = path.join(root, id, 'locales');
  fs.mkdirSync(localeDir, { recursive: true });
  locales.forEach((locale) => {
    fs.writeFileSync(
      path.join(localeDir, `${locale}.json`),
      JSON.stringify(translations[locale], null, 2),
      'utf8'
    );
  });
}

describe('plugin i18n audit', () => {
  let pluginsRoot;

  beforeEach(() => {
    pluginsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ltth-plugin-i18n-'));
  });

  afterEach(() => {
    fs.rmSync(pluginsRoot, { recursive: true, force: true });
  });

  test('accepts a complete namespaced, independently localized plugin', () => {
    writePluginFixture(pluginsRoot, 'emoji-rain', {
      de: { plugins: { 'emoji-rain': { settings: { title: 'Emoji-Regen' } } } },
      en: { plugins: { 'emoji-rain': { settings: { title: 'Emoji rain' } } } },
      es: { plugins: { 'emoji-rain': { settings: { title: 'Lluvia de emojis' } } } },
      fr: { plugins: { 'emoji-rain': { settings: { title: 'Pluie d emojis' } } } }
    });

    expect(auditPluginLocales(pluginsRoot).errors).toEqual([]);
  });

  test('permits invariant product names and resolution values without masking ordinary UI copy', () => {
    writePluginFixture(pluginsRoot, 'emoji-rain', {
      de: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)' } } } },
      en: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)' } } } },
      es: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)' } } } },
      fr: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)' } } } }
    });

    expect(auditPluginLocales(pluginsRoot).errors).toEqual([]);
  });

  test('reports generated keys, namespace leaks, missing keys, mojibake, and untranslated UI copy', () => {
    writePluginFixture(pluginsRoot, 'emoji-rain', {
      de: {
        generated: { save: 'Speichern' },
        plugins: { 'emoji-rain': { settings: { title: 'Settings', broken: 'GrÃ¶ÃŸe' } } }
      },
      en: { plugins: { 'emoji-rain': { settings: { title: 'Settings' } } } },
      es: { plugins: { 'emoji-rain': { settings: { title: 'Settings' } } } },
      fr: { plugins: { 'emoji-rain': { settings: { title: 'Settings' } } } }
    });

    const errors = auditPluginLocales(pluginsRoot).errors.join('\n');

    expect(errors).toContain('emoji-rain/de: forbidden generated key generated.save');
    expect(errors).toContain('emoji-rain/de: malformed UTF-8 text at plugins.emoji-rain.settings.broken');
    expect(errors).toContain('emoji-rain/en: missing key plugins.emoji-rain.settings.broken');
    expect(errors).toContain('emoji-rain: nonlocalized UI copy at plugins.emoji-rain.settings.title');
  });

  test('reports cross-plugin key collisions that would overwrite a translation at runtime', () => {
    writePluginFixture(pluginsRoot, 'first-plugin', {
      de: { shared: { title: 'Erstes' } },
      en: { shared: { title: 'First' } },
      es: { shared: { title: 'Primero' } },
      fr: { shared: { title: 'Premier' } }
    });
    writePluginFixture(pluginsRoot, 'second-plugin', {
      de: { shared: { title: 'Zweites' } },
      en: { shared: { title: 'Second' } },
      es: { shared: { title: 'Segundo' } },
      fr: { shared: { title: 'Deuxieme' } }
    });

    expect(auditPluginLocales(pluginsRoot).errors).toContain(
      'de: translation key collision shared.title between first-plugin and second-plugin'
    );
  });
});
