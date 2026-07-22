'use strict';

const fs = require('fs');
const path = require('path');
const { collectGuideUiInventory } = require('../../../../scripts/lib/plugin-guide-ui-inventory');

describe('AnimazingPal live-host localization contract', () => {
  const pluginRoot = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(pluginRoot, 'live-host-ui.js'), 'utf8');

  test('localizes generated live-host markup through stable plugin keys before it is rendered', () => {
    expect(source).toContain('function localizeLiveHostMarkup(markup)');
    expect(source).toContain("localizeLiveHostMarkup(markup)");
    expect(source).toContain("plugins.animazingpal.live_host.");
  });

  test.each(['de', 'en', 'es', 'fr'])('provides live-host UI translations in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(
      path.join(pluginRoot, 'locales', `${locale}.json`),
      'utf8'
    ));
    const liveHost = translations.plugins?.animazingpal?.live_host;

    expect(liveHost).toEqual(expect.any(Object));
    expect(Object.keys(liveHost).length).toBeGreaterThan(0);
    expect(liveHost.stream_assistant?.hud).toEqual(expect.objectContaining({
      title: expect.any(String),
      connecting: expect.any(String),
      events: expect.any(String),
      answers: expect.any(String)
    }));
    expect(liveHost.stream_assistant?.ui).toEqual(expect.objectContaining({
      description: expect.any(String),
      host_name: expect.any(String),
      join_greetings: expect.any(String),
      obs_hud: expect.any(String),
      migration_note: expect.any(String)
    }));
  });

  test('ships the Stream Assistant HUD with locale loading and stable i18n keys', () => {
    const hud = fs.readFileSync(path.join(pluginRoot, 'overlay', 'stream-assistant-hud.html'), 'utf8');

    expect(hud).toContain("/plugins/animazingpal/locales/${getLocale()}.json");
    expect(hud).toContain('plugins.animazingpal.live_host.stream_assistant.hud.title');
    expect(hud).toContain('data-i18n');
  });

  test('resolves the remaining bundle, warm-up, test, and memory-search fields in every locale', () => {
    const inventory = collectGuideUiInventory(path.join(__dirname, '..', '..', '..', '..'), {
      id: 'animazingpal',
      definition: { activation: { route: '/plugins/animazingpal/ui.html' } }
    });
    const expectedLabels = {
      '#bundleEmotion': { de: 'Stimmung', en: 'Emotion', es: 'Emoción', fr: 'Émotion' },
      '#bundleGiftNames': { de: 'Gift-Namen als Fallback, kommasepariert', en: 'Fallback gift names, comma-separated', es: 'Nombres de regalos alternativos, separados por comas', fr: 'Noms de cadeaux de secours, séparés par des virgules' },
      '#bundleId': { de: 'Bundle-ID', en: 'Bundle ID', es: 'ID de bundle', fr: 'ID du lot' },
      '#bundleName': { de: 'Anzeigename', en: 'Display name', es: 'Nombre visible', fr: "Nom d’affichage" },
      '#bundlePitch': { de: 'Tonhöhe', en: 'Pitch', es: 'Tono', fr: 'Hauteur' },
      '#bundlePriority': { de: 'Queue-Priorität', en: 'Queue priority', es: 'Prioridad de cola', fr: 'Priorité de file' },
      '#bundleSidekickName': { de: 'Assistenzname für diesen Avatar', en: 'Assistant name for this avatar', es: 'Nombre del asistente para este avatar', fr: "Nom de l'assistant pour cet avatar" },
      '#bundleSpeed': { de: 'Tempo', en: 'Speed', es: 'Velocidad', fr: 'Vitesse' },
      '#bundleVolume': { de: 'Lautstärke', en: 'Volume', es: 'Volumen', fr: 'Niveau sonore' },
      '#greetingWarmupLimit': { de: 'Top-User Limit', en: 'Top user limit', es: 'Límite de usuarios principales', fr: 'Limite des principaux utilisateurs' },
      '#greetingWarmupVariants': { de: 'Varianten/User', en: 'Variants per user', es: 'Variantes por usuario', fr: 'Variantes par utilisateur' },
      '#liveHostTestText': { de: 'Testtext', en: 'Test text', es: 'Texto de prueba', fr: 'Texte de test' },
      '#memorySearchInput': { de: 'Nach Benutzer oder Erinnerung suchen...', en: 'Search for a user or memory...', es: 'Buscar un usuario o recuerdo...', fr: 'Rechercher un utilisateur ou un souvenir...' }
    };

    for (const [selector, labels] of Object.entries(expectedLabels)) {
      expect(inventory.controls.find((control) => control.selector === selector)).toEqual(
        expect.objectContaining({ selector, labels })
      );
    }
  });
});
