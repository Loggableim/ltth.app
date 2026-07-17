const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditPluginLocales, isInvariantUiText } = require('../../scripts/lib/plugin-i18n-audit');

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
      de: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)', rawResolution: '2560x1440 (2K)', downscale: '3840x2160 -> 960x540', protocol: 'HTTP', multiplier: '1000 XP x10', choice: '!a, !b, !c, !d', font: 'Times New Roman', provider: 'OpenAI (DALL-E 3)', webhook: '🌐 Webhook', apiKey: 'sk-...', payload: '[ {"action":"fog","duration":8000} ]' } } } },
      en: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)', rawResolution: '2560x1440 (2K)', downscale: '3840x2160 -> 960x540', protocol: 'HTTP', multiplier: '1000 XP x10', choice: '!a, !b, !c, !d', font: 'Times New Roman', provider: 'OpenAI (DALL-E 3)', webhook: '🌐 Webhook', apiKey: 'sk-...', payload: '[ {"action":"fog","duration":8000} ]' } } } },
      es: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)', rawResolution: '2560x1440 (2K)', downscale: '3840x2160 -> 960x540', protocol: 'HTTP', multiplier: '1000 XP x10', choice: '!a, !b, !c, !d', font: 'Times New Roman', provider: 'OpenAI (DALL-E 3)', webhook: '🌐 Webhook', apiKey: 'sk-...', payload: '[ {"action":"fog","duration":8000} ]' } } } },
      fr: { plugins: { 'emoji-rain': { labels: { product: 'Emoji Rain', hud: 'OBS HUD', resolution: '1080p (1920x1080)', rawResolution: '2560x1440 (2K)', downscale: '3840x2160 -> 960x540', protocol: 'HTTP', multiplier: '1000 XP x10', choice: '!a, !b, !c, !d', font: 'Times New Roman', provider: 'OpenAI (DALL-E 3)', webhook: '🌐 Webhook', apiKey: 'sk-...', payload: '[ {"action":"fog","duration":8000} ]' } } } }
    });

    expect(auditPluginLocales(pluginsRoot).errors).toEqual([]);
  });

  test('permits stable product, font, URL, and placeholder examples', () => {
    [
      'LTTH Music Bot',
      'ElevenLabs',
      'Inter',
      'fish.audio/discovery',
      'keyword1\nkeyword2',
      '0 / 6',
      '0.5',
      'v1.1.0',
      '1440p',
      '5/s',
      'Emojis',
      'FPS:',
      'SiliconFlow',
      'weatherstop',
      '&times;'
    ].forEach((value) => expect(isInvariantUiText(value)).toBe(true));
    expect(isInvariantUiText('Save changes')).toBe(false);
  });

  test('accepts legitimate French accented words while still rejecting mojibake', () => {
    writePluginFixture(pluginsRoot, 'emoji-rain', {
      de: { plugins: { 'emoji-rain': { labels: { minimumAge: 'Mindestalter' } } } },
      en: { plugins: { 'emoji-rain': { labels: { minimumAge: 'Minimum age' } } } },
      es: { plugins: { 'emoji-rain': { labels: { minimumAge: 'Edad mínima' } } } },
      fr: { plugins: { 'emoji-rain': { labels: { minimumAge: 'Âge minimum' } } } }
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

  test('reports a long English UI sentence copied into one target locale', () => {
    const copied = 'Configure your browser source before starting the overlay preview in OBS.';
    writePluginFixture(pluginsRoot, 'emoji-rain', {
      de: { plugins: { 'emoji-rain': { settings: { preview: copied } } } },
      en: { plugins: { 'emoji-rain': { settings: { preview: copied } } } },
      es: { plugins: { 'emoji-rain': { settings: { preview: 'Configura la fuente del navegador antes de iniciar la vista previa en OBS.' } } } },
      fr: { plugins: { 'emoji-rain': { settings: { preview: 'Configurez la source de navigateur avant de lancer l aperçu dans OBS.' } } } }
    });

    expect(auditPluginLocales(pluginsRoot).errors).toContain(
      'emoji-rain/de: English UI copy at plugins.emoji-rain.settings.preview'
    );
  });

  test('reports a short English control copied into one target locale', () => {
    writePluginFixture(pluginsRoot, 'emoji-rain', {
      de: { plugins: { 'emoji-rain': { controls: { remove: 'Löschen' } } } },
      en: { plugins: { 'emoji-rain': { controls: { remove: 'Delete' } } } },
      es: { plugins: { 'emoji-rain': { controls: { remove: 'Delete' } } } },
      fr: { plugins: { 'emoji-rain': { controls: { remove: 'Supprimer' } } } }
    });

    expect(auditPluginLocales(pluginsRoot).errors).toContain(
      'emoji-rain/es: English UI copy at plugins.emoji-rain.controls.remove'
    );
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
