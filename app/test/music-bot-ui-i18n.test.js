const fs = require('fs');
const path = require('path');

const pluginRoot = path.join(__dirname, '../plugins/music-bot');
const locales = ['en', 'de', 'es', 'fr'];

function getPath(object, keyPath) {
  return keyPath.split('.').reduce((value, key) => value?.[key], object);
}

function readPluginLocale(locale) {
  const data = JSON.parse(fs.readFileSync(path.join(pluginRoot, `locales/${locale}.json`), 'utf8'));
  return data.plugins?.['music-bot'] || data;
}

function readSectionMap(source, constantName) {
  const block = source.match(new RegExp(`const ${constantName} = Object\\.fromEntries\\(Object\\.entries\\(\\{([\\s\\S]*?)\\}\\)\\.flatMap`));
  expect(block).not.toBeNull();
  const mapping = {};
  for (const match of block[1].matchAll(/(\w+):\s*'([^']*)'/g)) {
    match[2].split(' ').forEach((key) => { mapping[key] = match[1]; });
  }
  return mapping;
}

function placeholders(value) {
  return [...new Set(Array.from(String(value).matchAll(/\{(\w+)\}/g), (match) => match[1]))].sort();
}

function literalTranslationCalls(source, callee) {
  const prefix = callee === 'tr' ? '(?<![A-Za-z])tr' : 'catalogTr';
  const pattern = new RegExp(`${prefix}\\(\\s*'([^']+)'\\s*,\\s*'((?:\\\\.|[^'])*)'(?:\\s*,\\s*\\{([^{}]*)\\})?\\s*\\)`, 'g');
  return Array.from(source.matchAll(pattern), (match) => ({
    key: match[1],
    fallback: match[2],
    params: (match[3] || '').split(',').map((part) => part.trim()).filter(Boolean).map((part) => part.split(':')[0].trim())
  }));
}

describe('Music Bot runtime i18n', () => {
  const uiRuntimePaths = {
    seekUnavailable: 'player.seekUnavailable',
    seekFailed: 'player.seekFailed',
    historyLoadFailed: 'history.historyLoadFailed',
    playlistSaveFailed: 'playlists.playlistSaveFailed',
    playlistConflict: 'playlists.playlistConflict',
    importRunning: 'playlists.importRunning'
  };
  const overlayKeys = [
    'songSkipping', 'voteSkip', 'requestedBy', 'unknownTitle', 'queueCount', 'waitingForMusic'
  ];

  test('keeps every dynamic UI message in the Music Bot locale namespace', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');

    Object.keys(uiRuntimePaths).forEach((key) => {
      expect(source).toContain(`tr('${key}'`);
    });
  });

  test('uses localized runtime messages in the overlay', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'overlay.html'), 'utf8');

    overlayKeys.forEach((key) => {
      expect(source).toContain(`tr('${key}'`);
    });
  });

  test('exposes Crossfade persistence and the Auto-DJ cap as accessible, user-visible controls', () => {
    const html = fs.readFileSync(path.join(pluginRoot, 'ui.html'), 'utf8');
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');

    expect(html).toMatch(/id="crossfade-input"[^>]*max="15"[^>]*aria-describedby="crossfade-help"/);
    expect(html).toContain('id="crossfade-save-status"');
    expect(html).toMatch(/id="auto-dj-max-consecutive"[^>]*max="100"[^>]*aria-describedby="auto-dj-limit-hint"/);
    expect(source).toContain("tr('consecutiveProgress'");
    expect(source).toContain("tr('autoDjLimitReached'");
    expect(source).toContain('document.activeElement !== autoDjMaxConsecutive');
  });

  test.each(locales)('provides complete non-empty UI and overlay runtime translations for %s', (locale) => {
    const base = readPluginLocale(locale).music_bot.ui;

    Object.values(uiRuntimePaths).forEach((keyPath) => {
      expect(getPath(base, keyPath)).toEqual(expect.any(String));
      expect(getPath(base, keyPath).trim()).not.toBe('');
    });
    overlayKeys.forEach((key) => {
      expect(getPath(base, `controls.overlay.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `controls.overlay.${key}`).trim()).not.toBe('');
    });
  });

  test.each([
    ['de', 'Die Queue hat sich ge\u00e4ndert. Ansicht wurde aktualisiert.', 'Die Queue konnte nicht aktualisiert werden. Bitte lade die Ansicht neu.'],
    ['en', 'The queue changed. The view was refreshed.', 'Could not refresh the queue. Please reload the view.'],
    ['es', 'La cola ha cambiado. La vista se ha actualizado.', 'No se pudo actualizar la cola. Vuelve a cargar la vista.'],
    ['fr', 'La file a chang\u00e9. La vue a \u00e9t\u00e9 actualis\u00e9e.', 'Impossible d\u2019actualiser la file. Rechargez la vue.']
  ])('uses accurate stale-queue feedback in %s', (locale, queueChanged, queueRefreshFailed) => {
    const queue = readPluginLocale(locale).music_bot.ui.queue;

    expect(queue.queueChanged).toBe(queueChanged);
    expect(queue.queueRefreshFailed).toBe(queueRefreshFailed);
  });

  test.each([
    ['de', 'Track wurde entfernt, aber die Queue konnte nicht aktualisiert werden. Bitte lade die Ansicht neu.'],
    ['en', 'Track was removed, but the queue could not be refreshed. Please reload the view.'],
    ['es', 'La pista se elimin\u00f3, pero no se pudo actualizar la cola. Vuelve a cargar la vista.'],
    ['fr', 'Le titre a \u00e9t\u00e9 supprim\u00e9, mais la file n\u2019a pas pu \u00eatre actualis\u00e9e. Rechargez la vue.']
  ])('uses factual completed-delete refresh feedback in %s', (locale, trackRemovedRefreshFailed) => {
    const queue = readPluginLocale(locale).music_bot.ui.queue;

    expect(queue.trackRemovedRefreshFailed).toBe(trackRemovedRefreshFailed);
  });

  test.each(locales)('preserves the shared generated-plugin locale contract for %s', (locale) => {
    const base = readPluginLocale(locale).music_bot;
    expect(base.plugin.description).toEqual(expect.any(String));
    expect(base.ui.actions.save).toEqual(expect.any(String));
    expect(base.ui.status.ready).toEqual(expect.any(String));
    expect(base.ui.messages.saved).toEqual(expect.any(String));
    expect(base.plugin.description.trim()).not.toBe('');
    expect(base.ui.actions.save.trim()).not.toBe('');
    expect(base.ui.status.ready.trim()).not.toBe('');
    expect(base.ui.messages.saved.trim()).not.toBe('');
  });

  test.each(locales)('resolves every literal dynamic admin key from a meaningful section in %s', (locale) => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
    const base = readPluginLocale(locale).music_bot.ui;
    const runtimeSections = readSectionMap(source, 'RUNTIME_I18N_SECTIONS');
    const catalogSections = readSectionMap(source, 'CATALOG_I18N_SECTIONS');
    const runtimeKeys = [...new Set(Array.from(source.matchAll(/(?<![A-Za-z])tr\('([^']+)'/g), (match) => match[1]))];
    const catalogKeys = [...new Set(Array.from(source.matchAll(/catalogTr\('([^']+)'/g), (match) => match[1]))];

    runtimeKeys.forEach((key) => {
      expect(runtimeSections[key]).toEqual(expect.any(String));
      expect(getPath(base, `${runtimeSections[key]}.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `${runtimeSections[key]}.${key}`).trim()).not.toBe('');
    });
    catalogKeys.forEach((key) => {
      expect(catalogSections[key]).toEqual(expect.any(String));
      expect(getPath(base, `${catalogSections[key]}.${key}`)).toEqual(expect.any(String));
      expect(getPath(base, `${catalogSections[key]}.${key}`).trim()).not.toBe('');
    });
  });

  test.each(locales)('keeps every literal dynamic callsite placeholder-compatible with %s', (locale) => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
    const base = readPluginLocale(locale).music_bot.ui;
    const maps = {
      tr: readSectionMap(source, 'RUNTIME_I18N_SECTIONS'),
      catalogTr: readSectionMap(source, 'CATALOG_I18N_SECTIONS')
    };

    for (const callee of ['tr', 'catalogTr']) {
      for (const call of literalTranslationCalls(source, callee)) {
        const section = maps[callee][call.key];
        const catalogValue = getPath(base, `${section}.${call.key}`);
        expect(placeholders(catalogValue)).toEqual(placeholders(call.fallback));
        placeholders(call.fallback).forEach((placeholder) => {
          expect(call.params).toContain(placeholder);
        });
      }
    }
  });

  test('constrains payload message keys to the declared runtime map and localized catalogs', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
    const backend = fs.readFileSync(path.join(pluginRoot, 'main.js'), 'utf8');
    const runtimeSections = readSectionMap(source, 'RUNTIME_I18N_SECTIONS');
    const emittedKeys = [...new Set(Array.from(backend.matchAll(/messageKey:\s*'([^']+)'/g), (match) => match[1]))];

    expect(emittedKeys.length).toBeGreaterThan(0);
    expect(source).not.toContain('tr(payload.messageKey');
    expect(source).toContain('translateRuntimeMessageKey(payload?.messageKey');
    expect(source).toMatch(/function translateRuntimeMessageKey[\s\S]*Object\.prototype\.hasOwnProperty\.call\(RUNTIME_I18N_SECTIONS, key\)/);

    emittedKeys.forEach((key) => {
      expect(runtimeSections[key]).toEqual(expect.any(String));
      locales.forEach((locale) => {
        const base = readPluginLocale(locale).music_bot.ui;
        expect(getPath(base, `${runtimeSections[key]}.${key}`)).toEqual(expect.any(String));
      });
    });
  });

  test('routes visible dynamic fallbacks and titles through semantic translations', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
    const forbidden = [
      /labels\[resolver\.progress\.state\]\s*\|\|\s*resolver\.progress\.state/,
      /return state;\s*\n\s*}/,
      /requestedBy\s*\|\|\s*'Viewer'/,
      /showToast\('warn',\s*'History'/,
      /showToast\('warn',\s*'Player'/,
      /showToast\('(?:success|warn)',\s*'Auto-DJ'/,
      /showToast\('error',\s*'Crossfade'/,
      /title\s*=\s*'Music Bot'/,
      /\?\s*'Testton abgeschlossen\.'/,
      /\|\|\s*'Testton fehlgeschlagen\.'/,
      /`Locales:/,
      /'Locales: default'/,
      /`Region:/,
      /source:\s*status\.selectionSource/,
      /previewSource\.textContent\s*=\s*song\.source\s*\|\|\s*'YouTube'/,
      /catalogTr\(playlist\.mode/,
      /escapeHtml\(ban\.type\)/
    ];

    forbidden.forEach((pattern) => expect(source).not.toMatch(pattern));
  });

  test('allows only the map-validated runtime expression for nonliteral translation keys', () => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8')
      .replace(/function (?:tr|catalogTr)\([^)]*\)/g, '');
    const runtimeExpressions = Array.from(source.matchAll(/(?<![A-Za-z])tr\(\s*(?!')([^,\n)]+)/g), (match) => match[1].trim());
    const catalogExpressions = Array.from(source.matchAll(/catalogTr\(\s*(?!')([^,\n)]+)/g), (match) => match[1].trim());
    const safeRuntimeReasons = {
      key: 'translateRuntimeMessageKey checks the key against RUNTIME_I18N_SECTIONS before calling tr.'
    };

    expect(catalogExpressions).toEqual([]);
    expect([...new Set(runtimeExpressions)]).toEqual(Object.keys(safeRuntimeReasons));
    Object.values(safeRuntimeReasons).forEach((reason) => expect(reason.length).toBeGreaterThan(40));
  });

  test.each(['en', 'es', 'fr'])('does not copy German dynamic translations into %s without a documented neutral reason', (locale) => {
    const source = fs.readFileSync(path.join(pluginRoot, 'assets/ui.js'), 'utf8');
    const runtimeSections = readSectionMap(source, 'RUNTIME_I18N_SECTIONS');
    const catalogSections = readSectionMap(source, 'CATALOG_I18N_SECTIONS');
    const german = readPluginLocale('de').music_bot.ui;
    const translated = readPluginLocale(locale).music_bot.ui;
    const dynamicPaths = new Set([
      ...Array.from(source.matchAll(/(?<![A-Za-z])tr\('([^']+)'/g), (match) => `${runtimeSections[match[1]]}.${match[1]}`),
      ...Array.from(source.matchAll(/catalogTr\('([^']+)'/g), (match) => `${catalogSections[match[1]]}.${match[1]}`)
    ]);
    const neutralReasons = {
      'player.pauseTitle': 'Pause is the same word in these languages.',
      'moderation.moderationTitle': 'Moderation is the same word in these languages.',
      'moderation.url': 'URL is a language-neutral technical abbreviation.',
      'queue.queueTitle': 'Queue is established product terminology.',
      'history.voteNeutral': 'Neutral is the same word in these languages.',
      'settings.crossfadeTitle': 'Crossfade is an established technical term.',
      'settings.giftRegion': 'Region is the same metadata label in German and English.',
      'autoDj.autoDjToastTitle': 'Auto-DJ is the product feature name.',
      'autoDj.radioScore': 'Score is established product terminology for the radio ranking.',
      'autoDj.sourceRadio': 'Radio is the same source name in these languages.',
      'player.sourceYoutube': 'YouTube is a proper product name.',
      'player.sourceSoundCloud': 'SoundCloud is a proper product name.'
    };

    Object.values(neutralReasons).forEach((reason) => expect(reason.length).toBeGreaterThan(20));
    dynamicPaths.forEach((keyPath) => {
      if (getPath(translated, keyPath) === getPath(german, keyPath)) {
        expect(neutralReasons[keyPath]).toEqual(expect.any(String));
      }
    });
  });

  test.each([
    ['de', {
      'shell.viewerFallback': 'Zuschauer', 'player.playerToastTitle': 'Wiedergabe',
      'history.historyToastTitle': 'Verlauf', 'settings.giftsCount': '{count} Geschenke',
      'settings.giftLocalesDefault': 'Katalogsprache: automatisch',
      'health.resolverUnknownState': 'Unbekannter Resolver-Status',
      'safety.testToneCompleted': 'Testton abgeschlossen.'
    }],
    ['en', {
      'shell.viewerFallback': 'Viewer', 'player.playerToastTitle': 'Player',
      'history.historyToastTitle': 'History', 'settings.giftsCount': '{count} gifts',
      'settings.giftLocalesDefault': 'Catalog language: automatic',
      'health.resolverUnknownState': 'Unknown resolver status',
      'safety.testToneCompleted': 'Test tone completed.'
    }],
    ['es', {
      'shell.viewerFallback': 'Espectador', 'player.playerToastTitle': 'Reproductor',
      'history.historyToastTitle': 'Historial', 'settings.giftsCount': '{count} regalos',
      'settings.giftLocalesDefault': 'Idioma del catálogo: automático',
      'health.resolverUnknownState': 'Estado desconocido del resolutor',
      'safety.testToneCompleted': 'Tono de prueba completado.'
    }],
    ['fr', {
      'shell.viewerFallback': 'Spectateur', 'player.playerToastTitle': 'Lecteur',
      'history.historyToastTitle': 'Historique', 'settings.giftsCount': '{count} cadeaux',
      'settings.giftLocalesDefault': 'Langue du catalogue : automatique',
      'health.resolverUnknownState': 'État inconnu du résolveur',
      'safety.testToneCompleted': 'Test sonore terminé.'
    }]
  ])('uses reviewed language-native dynamic copy in %s', (locale, expected) => {
    const base = readPluginLocale(locale).music_bot.ui;
    Object.entries(expected).forEach(([keyPath, value]) => expect(getPath(base, keyPath)).toBe(value));
  });
});
