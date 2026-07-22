const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const locales = ['de', 'en', 'es', 'fr'];
const adminSections = new Set([
  'shell', 'tabs', 'player', 'queue', 'settings', 'autoDj', 'aliases',
  'moderation', 'overlay', 'history', 'catalog', 'playlists', 'safety', 'health'
]);
const runtimePaths = {
  seekUnavailable: 'player.seekUnavailable',
  seekFailed: 'player.seekFailed',
  historyLoadFailed: 'history.historyLoadFailed',
  playlistSaveFailed: 'playlists.playlistSaveFailed',
  playlistConflict: 'playlists.playlistConflict',
  importRunning: 'playlists.importRunning'
};
const staticAdminPaths = [
  'tabs.history', 'tabs.catalog', 'tabs.playlists', 'catalog.description',
  'playlists.description', 'playlists.newPlaylist', 'playlists.playbackMode',
  'playlists.ordered', 'playlists.shuffle', 'playlists.create',
  'playlists.radioDescription', 'playlists.saveRadioSources',
  'playlists.playlistName', 'playlists.save', 'playlists.delete',
  'playlists.importUrl', 'playlists.import', 'history.historyEmpty',
  'history.banTrack', 'history.voteUp', 'history.voteDown',
  'history.voteNeutral', 'catalog.addToPlaylist', 'catalog.catalogEmpty',
  'playlists.protected', 'playlists.playlistEmpty', 'playlists.playlistItemsEmpty',
  'playlists.remove', 'playlists.radioWeight', 'player.seekAria',
  'playlists.importCompleted', 'playlists.importFailed', 'playlists.importAborted',
  'playlists.importError', 'catalog.networkTitle', 'catalog.postFailed',
  'catalog.getFailed', 'catalog.deleteFailed', 'catalog.requestFailed'
];

describe('Music Bot catalog admin i18n contract', () => {
  const root = path.join(__dirname, '..', 'plugins', 'music-bot');

  function lookup(translations, key) {
    return key.split('.').reduce((value, part) => value?.[part], translations);
  }

  function pluginMessages(translations) {
    return translations.plugins?.['music-bot'] || translations;
  }

  function adminKeysFromHtml(html) {
    const dom = new JSDOM(html);
    return [...new Set(
      ['data-i18n', 'data-i18n-placeholder', 'data-i18n-aria-label', 'data-i18n-title']
        .flatMap((attribute) => Array.from(dom.window.document.querySelectorAll(`[${attribute}]`), (element) => element.getAttribute(attribute)))
        .filter((key) => key.startsWith('plugins.music-bot.music_bot.ui.'))
    )];
  }

  test('uses the production plugin namespace and localizes all dynamic catalog-admin messages', () => {
    const source = fs.readFileSync(path.join(root, 'assets', 'ui.js'), 'utf8');
    expect(source).toContain("const I18N_PREFIX = 'plugins.music-bot.music_bot.ui'");
    expect(source).not.toContain('music_bot.ui.controls.runtime');
    Object.keys(runtimePaths).forEach((key) => expect(source).toContain(`tr('${key}'`));
  });

  test.each(locales)('provides nonempty catalog and runtime messages in %s', (locale) => {
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    const messages = pluginMessages(translations).music_bot.ui;
    Object.values(runtimePaths).forEach((keyPath) => expect(lookup(messages, keyPath).trim()).not.toBe(''));
    staticAdminPaths.forEach((keyPath) => expect(lookup(messages, keyPath).trim()).not.toBe(''));
  });

  test.each(['en', 'es', 'fr'])('renders new catalog controls through the i18n DOM pipeline in %s', (locale) => {
    const html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    const dom = new JSDOM(html);
    const lookup = (key) => key.split('.').reduce((value, part) => value?.[part], translations);
    dom.window.document.querySelectorAll('[data-i18n]').forEach((element) => {
      const value = lookup(element.dataset.i18n);
      if (typeof value === 'string') element.textContent = value;
    });
    dom.window.document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const value = lookup(element.dataset.i18nPlaceholder);
      if (typeof value === 'string') element.placeholder = value;
    });

    const messages = pluginMessages(translations).music_bot.ui;
    expect(dom.window.document.querySelector('[data-tab="catalog"]').textContent).toBe(messages.tabs.catalog);
    expect(dom.window.document.getElementById('catalog-search-input').placeholder).toBe(messages.catalog.search);
    expect(dom.window.document.getElementById('playlist-create-btn').textContent).toBe(messages.playlists.create);
    expect(dom.window.document.getElementById('playlist-radio-save').textContent).toBe(messages.playlists.saveRadioSources);
  });

  test('uses named, complete UI keys for every static admin label', () => {
    const html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    const dom = new JSDOM(html);

    expect(html).not.toMatch(/data-i18n(?:-placeholder|-aria-label|-title)?="(?:generated\.|music_bot\.ui\.[^"]*\.label_[a-f0-9]{8,})/i);

    adminKeysFromHtml(html).forEach((key) => {
      const [, , , , section, ...semanticPath] = key.split('.');
      expect(adminSections.has(section)).toBe(true);
      expect(semanticPath.length).toBeGreaterThan(0);
      semanticPath.forEach((part) => {
        expect(part).toMatch(/^[a-z][A-Za-z0-9]*$/);
        expect(part).not.toMatch(/^(?:generated|label_[a-f0-9]{8,}|[a-f0-9]{12,})$/i);
      });
    });

    for (const locale of locales) {
      const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));

      const assertNoPseudoKeys = (value, keyPath = 'music_bot.ui') => {
        if (!value || typeof value !== 'object') return;
        Object.entries(value).forEach(([key, child]) => {
          expect(`${keyPath}.${key}`).not.toMatch(/(?:^|\.)(?:generated|label_[a-f0-9]{8,}|[a-f0-9]{12,})(?:\.|$)/i);
          assertNoPseudoKeys(child, `${keyPath}.${key}`);
        });
      };
      assertNoPseudoKeys(translations, locale);

      for (const attribute of ['data-i18n', 'data-i18n-placeholder', 'data-i18n-aria-label', 'data-i18n-title']) {
        dom.window.document.querySelectorAll(`[${attribute}]`).forEach((element) => {
          const key = element.getAttribute(attribute);
          const value = lookup(translations, key);
          expect(value).toEqual(expect.any(String));
          expect(value.trim()).not.toBe('');
        });
      }
    }
  });

  test('provides language-native translations in every requested admin section', () => {
    const expected = {
      shell: {
        key: 'title',
        de: 'Musik-Bot', en: 'Music Bot', es: 'Bot de música', fr: 'Bot musical'
      },
      tabs: {
        key: 'settings',
        de: 'Einstellungen', en: 'Settings', es: 'Ajustes', fr: 'Paramètres'
      },
      player: {
        key: 'requestSong',
        de: 'Song anfordern', en: 'Request song', es: 'Solicitar canción', fr: 'Demander un morceau'
      },
      queue: {
        key: 'clear',
        de: 'Warteschlange leeren', en: 'Clear queue', es: 'Vaciar cola', fr: 'Vider la file'
      },
      settings: {
        key: 'systemTitle',
        de: 'System und Wiedergabe', en: 'System and playback', es: 'Sistema y reproducción', fr: 'Système et lecture'
      },
      autoDj: {
        key: 'enable',
        de: 'Auto-DJ aktivieren', en: 'Enable Auto-DJ', es: 'Activar Auto-DJ', fr: 'Activer Auto-DJ'
      },
      aliases: {
        key: 'title',
        de: 'Befehlsaliase', en: 'Command aliases', es: 'Alias de comandos', fr: 'Alias de commandes'
      },
      moderation: {
        key: 'rejectAgeRestricted',
        de: 'Nicht jugendfreie Videos ablehnen', en: 'Reject age-restricted videos', es: 'Rechazar vídeos con restricción de edad', fr: 'Refuser les vidéos soumises à une limite d’âge'
      },
      overlay: {
        key: 'description',
        de: 'Browserquellen-URL für OBS oder Streamlabs', en: 'Browser source URL for OBS or Streamlabs', es: 'URL de fuente de navegador para OBS o Streamlabs', fr: 'URL de source navigateur pour OBS ou Streamlabs'
      },
      history: {
        key: 'empty',
        de: 'Noch kein Verlauf.', en: 'No history yet.', es: 'Todavía no hay historial.', fr: 'Aucun historique pour le moment.'
      },
      catalog: {
        key: 'description',
        de: 'Frühere Songs suchen, bewerten und zu Playlists hinzufügen.', en: 'Search and rate previous songs or add them to playlists.', es: 'Busca y valora canciones anteriores o añádelas a listas.', fr: 'Recherchez et évaluez les anciens morceaux ou ajoutez-les à des playlists.'
      },
      playlists: {
        key: 'newPlaylist',
        de: 'Neue Playlist', en: 'New playlist', es: 'Nueva lista', fr: 'Nouvelle playlist'
      },
      safety: {
        key: 'emergencyStop',
        de: 'Not-Aus', en: 'Emergency stop', es: 'Parada de emergencia', fr: 'Arrêt d’urgence'
      },
      health: {
        key: 'refresh',
        de: 'Status aktualisieren', en: 'Refresh health', es: 'Actualizar estado', fr: 'Actualiser l’état'
      }
    };

    for (const locale of locales) {
      const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
      Object.entries(expected).forEach(([section, values]) => {
        const messages = pluginMessages(translations).music_bot.ui;
        expect(messages[section]).toEqual(expect.any(Object));
        expect(messages[section][values.key]).toBe(values[locale]);
      });
    }
  });

  test('uses natural seek-unavailable wording in every locale', () => {
    const expected = {
      de: 'Diese Wiedergabe kann derzeit nicht gespult werden.',
      en: 'Seeking is currently unavailable.',
      es: 'No se puede cambiar la posición en este momento.',
      fr: 'Le déplacement dans le morceau est actuellement indisponible.'
    };

    for (const locale of locales) {
      const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
      expect(pluginMessages(translations).music_bot.ui.player.seekUnavailable).toBe(expected[locale]);
    }
  });

  test.each(['en', 'es', 'fr'])('does not copy German admin fallback strings into %s', (locale) => {
    const html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    const keys = adminKeysFromHtml(html);
    const german = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'de.json'), 'utf8'));
    const translated = JSON.parse(fs.readFileSync(path.join(root, 'locales', `${locale}.json`), 'utf8'));
    const languageNeutralKeys = new Set([
      'plugins.music-bot.music_bot.ui.tabs.autoDj',
      'plugins.music-bot.music_bot.ui.tabs.playlists',
      'plugins.music-bot.music_bot.ui.tabs.overlay',
      'plugins.music-bot.music_bot.ui.shell.autoDjMetric',
      'plugins.music-bot.music_bot.ui.autoDj.title',
      'plugins.music-bot.music_bot.ui.autoDj.smartRadioTitle',
      'plugins.music-bot.music_bot.ui.autoDj.genreAlternative',
      'plugins.music-bot.music_bot.ui.autoDj.genreChill',
      'plugins.music-bot.music_bot.ui.autoDj.genreClassical',
      'plugins.music-bot.music_bot.ui.autoDj.genreCountry',
      'plugins.music-bot.music_bot.ui.autoDj.genreDance',
      'plugins.music-bot.music_bot.ui.autoDj.genreElectronic',
      'plugins.music-bot.music_bot.ui.autoDj.genreHipHop',
      'plugins.music-bot.music_bot.ui.autoDj.genreIndie',
      'plugins.music-bot.music_bot.ui.autoDj.genreJazz',
      'plugins.music-bot.music_bot.ui.autoDj.genreMetal',
      'plugins.music-bot.music_bot.ui.autoDj.genrePop',
      'plugins.music-bot.music_bot.ui.autoDj.genreRock',
      'plugins.music-bot.music_bot.ui.autoDj.playlistMode',
      'plugins.music-bot.music_bot.ui.autoDj.playlistPlaceholder',
      'plugins.music-bot.music_bot.ui.queue.title',
      'plugins.music-bot.music_bot.ui.settings.filter',
      'plugins.music-bot.music_bot.ui.settings.payToPlayPlaceholder',
      'plugins.music-bot.music_bot.ui.settings.payToSkipPlaceholder',
      'plugins.music-bot.music_bot.ui.moderation.url',
      'plugins.music-bot.music_bot.ui.overlay.design',
      'plugins.music-bot.music_bot.ui.overlay.cyberpunk',
      'plugins.music-bot.music_bot.ui.overlay.minimal',
      'plugins.music-bot.music_bot.ui.overlay.neon',
      'plugins.music-bot.music_bot.ui.overlay.position',
      'plugins.music-bot.music_bot.ui.playlists.title',
      'plugins.music-bot.music_bot.ui.health.players',
      'plugins.music-bot.music_bot.ui.health.mpv',
      'plugins.music-bot.music_bot.ui.health.resolver',
      'plugins.music-bot.music_bot.ui.health.cache'
    ]);

    keys.filter((key) => !languageNeutralKeys.has(key)).forEach((key) => {
      expect(lookup(translated, key)).not.toBe(lookup(german, key));
    });
  });

  test('does not keep audited German labels when English is applied', () => {
    const html = fs.readFileSync(path.join(root, 'ui.html'), 'utf8');
    const translations = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8'));
    const dom = new JSDOM(html);

    for (const attribute of ['data-i18n', 'data-i18n-placeholder', 'data-i18n-aria-label', 'data-i18n-title']) {
      dom.window.document.querySelectorAll(`[${attribute}]`).forEach((element) => {
        const value = lookup(translations, element.getAttribute(attribute));
      if (attribute === 'data-i18n') element.textContent = value;
      if (attribute === 'data-i18n-placeholder') element.placeholder = value;
      if (attribute === 'data-i18n-aria-label') element.setAttribute('aria-label', value);
      if (attribute === 'data-i18n-title') element.setAttribute('title', value);
      });
    }

    const output = dom.window.document.body.textContent;
    ['Musik Bot', 'Song anfordern', 'Queue leeren', 'Einstellungen'].forEach((label) => {
      expect(output).not.toContain(label);
    });
  });
});
