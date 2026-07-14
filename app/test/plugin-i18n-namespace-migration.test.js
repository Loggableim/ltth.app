const {
  migratePluginLocales,
  rewritePluginTranslationReferences
} = require('../../scripts/lib/plugin-i18n-namespace-migration');

describe('plugin i18n namespace migration', () => {
  test('moves generated labels into stable, readable plugin keys in every locale', () => {
    const result = migratePluginLocales('emoji-rain', {
      en: { generated: { a1: 'Save configuration' }, settings: { title: 'Settings' } },
      de: { generated: { a1: 'Konfiguration speichern' }, settings: { title: 'Einstellungen' } },
      es: { generated: { a1: 'Guardar configuración' }, settings: { title: 'Configuración' } },
      fr: { generated: { a1: 'Enregistrer la configuration' }, settings: { title: 'Paramètres' } }
    });

    expect(result.keyMap).toEqual({ 'generated.a1': 'labels.save_configuration' });
    expect(result.locales.en).toEqual({
      plugins: {
        'emoji-rain': {
          settings: { title: 'Settings' },
          labels: { save_configuration: 'Save configuration' }
        }
      }
    });
    expect(result.locales.fr.plugins['emoji-rain'].labels.save_configuration)
      .toBe('Enregistrer la configuration');
  });

  test('rewrites only actual plugin translation references, including generated keys', () => {
    const source = '<button data-i18n="generated.a1">Save</button><span data-i18n="settings.title">Settings</span>';
    const result = rewritePluginTranslationReferences(source, 'emoji-rain', {
      'generated.a1': 'labels.save_configuration',
      'settings.title': 'settings.title'
    });

    expect(result).toBe('<button data-i18n="plugins.emoji-rain.labels.save_configuration">Save</button><span data-i18n="plugins.emoji-rain.settings.title">Settings</span>');
  });
});
