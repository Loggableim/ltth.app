#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PLUGIN_ID = 'webgpu-fireworks';
const languages = ['en', 'de', 'es', 'fr'];

const translations = {
  en: {
    shows: {
      'classic-crescendo': ['Classic Crescendo', 'Warm classic bursts rising into a gold crown.'],
      'symmetric-salute': ['Symmetric Salute', 'Mirrored calls and responses closing as a salute wall.'],
      'sky-ballet': ['Sky Ballet', 'Crossing pastel flights with spiral and floral accents.'],
      'thunder-finale': ['Thunder Finale', 'Heavy gold volleys culminating in three thunder waves.'],
      'nishiki-kamuro': ['Nishiki Kamuro', 'Blue peonies, gold chrysanthemums, long willows, and a Nishiki brocade crown.'],
      'aurora-cathedral': ['Aurora Cathedral', 'Cool comet arches, crossette vaults, silver strobes, palms, and willows.'],
      'royal-brocade': ['Royal Brocade', 'Ruby and emerald pistils, palms, rings, and a baroque brocade wall.'],
      'phoenix-ascension': ['Phoenix Ascension', 'Mines, rising wing fans, ember crossettes, and three final waves.'],
      'furry-celebration': ['Furry Celebration', 'Paws, hearts, fox, wolf, dragon wings, dragon, tail, and a rainbow crown.']
    },
    selector: ['Auto (rotating)', 'Use global default', 'Built-in shows', 'Custom shows', 'Unavailable', 'Short (10 s)', 'Medium (18 s)', 'Long (28 s)'],
    superfan: ['Show style', 'Show length', 'Enable Superfan finales', 'Finale intensity', 'Test Superfan finale', 'Superfan finale triggered!', 'Failed to trigger Superfan finale', 'Use global default'],
    designer: ['Show Designer', 'Open Show Designer', 'Create show', 'Save draft', 'Validate', 'Publish', 'Duplicate', 'Derive lengths', 'Archive', 'Restore', 'Import show', 'Export show', 'Unsaved changes', 'Draft', 'Validated', 'Published', 'Archived'],
    preview: ['Starting preview', 'Preview queued', 'Preview running', 'Preview complete', 'Preview stopped', 'Preview failed', 'Renderer is offline', 'Renderer is busy', 'Preview status is stale'],
    api: ['Show validation failed', 'Show validation succeeded', 'The show changed. Reload the latest revision and try again.', 'Show service is offline', 'Show service is busy', 'Invalid show definition', 'Show not found', 'Show is archived', 'Preview renderer is not ready', 'Validate the show before publishing'],
    status: ['Idle', 'Active show: {show}', '{count} queued', ['Idle', 'Opening', 'Build', 'Highlight', 'Calm', 'Bridge', 'Breath', 'Finale']],
    runtime: ['Fireworks diagnostics: {message}', '{username} sent {giftName}', 'Thanks for following, {username}!', 'Renderer: {state} · {mode}'],
    editorial: ['Save settings', 'Click shapes to activate/deactivate for random selection. Selected shapes have a gold border.', ['Quality', 'Balanced', 'Performance', 'Minimal']],
    ui: ['L{launch} / B{bang} / C{crackle} ({total} {totalLabel})', 'Remove {color}', 'Ready', 'Initializing', 'Offline', 'Unavailable', 'Not connected', 'Audio ready', 'Audio locked', 'Unknown', 'Web Audio', 'HTML Audio', 'None', 'Loaded', 'Failed', 'Idle', 'Playing', 'Disabled', 'Total', 'Missed', 'Evicted', 'No events', 'Active', 'Dropped']
  },
  de: {
    shows: {
      'classic-crescendo': ['Klassisches Crescendo', 'Warme klassische Buketts steigern sich zu einer goldenen Krone.'],
      'symmetric-salute': ['Symmetrischer Salut', 'Gespiegelte Rufe und Antworten enden in einer Salutwand.'],
      'sky-ballet': ['Himmelsballett', 'Kreuzende Pastellflüge mit Spiral- und Blütenakzenten.'],
      'thunder-finale': ['Donnerfinale', 'Schwere Goldsalven gipfeln in drei Donnerwellen.'],
      'nishiki-kamuro': ['Nishiki Kamuro', 'Blaue Päonien, goldene Chrysanthemen, lange Weiden und eine Nishiki-Brokatkrone.'],
      'aurora-cathedral': ['Aurora-Kathedrale', 'Kühle Kometenbögen, Crossette-Gewölbe, Silberstroboskope, Palmen und Weiden.'],
      'royal-brocade': ['Königlicher Brokat', 'Rubin- und Smaragdstempel, Palmen, Ringe und eine barocke Brokatwand.'],
      'phoenix-ascension': ['Aufstieg des Phönix', 'Minen, aufsteigende Flügelfächer, Glut-Crossettes und drei Schlusswellen.'],
      'furry-celebration': ['Flauschige Feier', 'Pfoten, Herzen, Fuchs, Wolf, Drachenflügel, Drache, Schweif und eine Regenbogenkrone.']
    },
    selector: ['Auto (abwechselnd)', 'Globale Standardeinstellung verwenden', 'Integrierte Shows', 'Eigene Shows', 'Nicht verfügbar', 'Kurz (10 s)', 'Mittel (18 s)', 'Lang (28 s)'],
    superfan: ['Show-Stil', 'Show-Länge', 'Superfan-Finales aktivieren', 'Finale-Intensität', 'Superfan-Finale testen', 'Superfan-Finale ausgelöst!', 'Superfan-Finale konnte nicht ausgelöst werden', 'Globale Standardeinstellung verwenden'],
    designer: ['Show-Designer', 'Show-Designer öffnen', 'Show erstellen', 'Entwurf speichern', 'Validieren', 'Veröffentlichen', 'Duplizieren', 'Längen ableiten', 'Archivieren', 'Wiederherstellen', 'Show importieren', 'Show exportieren', 'Ungespeicherte Änderungen', 'Entwurf', 'Validiert', 'Veröffentlicht', 'Archiviert'],
    preview: ['Vorschau wird gestartet', 'Vorschau eingereiht', 'Vorschau läuft', 'Vorschau abgeschlossen', 'Vorschau gestoppt', 'Vorschau fehlgeschlagen', 'Renderer ist offline', 'Renderer ist beschäftigt', 'Vorschaustatus ist veraltet'],
    api: ['Show-Validierung fehlgeschlagen', 'Show erfolgreich validiert', 'Die Show wurde geändert. Lade die neueste Revision und versuche es erneut.', 'Show-Dienst ist offline', 'Show-Dienst ist beschäftigt', 'Ungültige Show-Definition', 'Show nicht gefunden', 'Show ist archiviert', 'Vorschau-Renderer ist nicht bereit', 'Validiere die Show vor der Veröffentlichung'],
    status: ['Inaktiv', 'Aktive Show: {show}', '{count} in Warteschlange', ['Inaktiv', 'Eröffnung', 'Aufbau', 'Höhepunkt', 'Ruhe', 'Übergang', 'Atempause', 'Finale']],
    runtime: ['Feuerwerk-Diagnose: {message}', '{username} hat {giftName} gesendet', 'Danke fürs Folgen, {username}!', 'Renderer: {state} · {mode}'],
    editorial: ['Einstellungen speichern', 'Klicke auf Formen, um sie für die Zufallsauswahl zu aktivieren oder zu deaktivieren. Ausgewählte Formen haben einen goldenen Rand.', ['Qualität', 'Ausgewogen', 'Leistung', 'Minimal']],
    ui: ['S{launch} / K{bang} / C{crackle} ({total} {totalLabel})', '{color} entfernen', 'Bereit', 'Wird initialisiert', 'Offline', 'Nicht verfügbar', 'Nicht verbunden', 'Audio bereit', 'Audio gesperrt', 'Unbekannt', 'Web Audio', 'HTML Audio', 'Keines', 'Geladen', 'Fehlgeschlagen', 'Inaktiv', 'Wiedergabe', 'Deaktiviert', 'Gesamt', 'Verpasst', 'Verworfen', 'Keine Ereignisse', 'Aktiv', 'Verworfen']
  },
  es: {
    shows: {
      'classic-crescendo': ['Crescendo clásico', 'Explosiones clásicas y cálidas que ascienden hasta una corona dorada.'],
      'symmetric-salute': ['Saludo simétrico', 'Llamadas y respuestas reflejadas que terminan en un muro de salvas.'],
      'sky-ballet': ['Ballet celeste', 'Vuelos pastel cruzados con detalles en espiral y florales.'],
      'thunder-finale': ['Final de trueno', 'Pesadas salvas doradas que culminan en tres ondas de trueno.'],
      'nishiki-kamuro': ['Nishiki Kamuro', 'Peonías azules, crisantemos dorados, sauces largos y una corona de brocado Nishiki.'],
      'aurora-cathedral': ['Catedral de auroras', 'Arcos de cometas fríos, bóvedas crossette, destellos plateados, palmeras y sauces.'],
      'royal-brocade': ['Brocado real', 'Pistilos rubí y esmeralda, palmeras, anillos y un muro de brocado barroco.'],
      'phoenix-ascension': ['Ascenso del fénix', 'Minas, abanicos de alas ascendentes, crossettes de brasas y tres ondas finales.'],
      'furry-celebration': ['Celebración peluda', 'Huellas, corazones, zorro, lobo, alas de dragón, dragón, cola y una corona arcoíris.']
    },
    selector: ['Automático (rotativo)', 'Usar el valor global', 'Shows integrados', 'Shows personalizados', 'No disponible', 'Corta (10 s)', 'Media (18 s)', 'Larga (28 s)'],
    superfan: ['Estilo del show', 'Duración del show', 'Activar finales de Superfan', 'Intensidad del final', 'Probar final de Superfan', '¡Final de Superfan activado!', 'No se pudo activar el final de Superfan', 'Usar el valor global'],
    designer: ['Diseñador de shows', 'Abrir el diseñador de shows', 'Crear show', 'Guardar borrador', 'Validar', 'Publicar', 'Duplicar', 'Derivar duraciones', 'Archivar', 'Restaurar', 'Importar show', 'Exportar show', 'Cambios sin guardar', 'Borrador', 'Validado', 'Publicado', 'Archivado'],
    preview: ['Iniciando vista previa', 'Vista previa en cola', 'Vista previa en curso', 'Vista previa completada', 'Vista previa detenida', 'Error en la vista previa', 'El renderizador está desconectado', 'El renderizador está ocupado', 'El estado de la vista previa está desactualizado'],
    api: ['Error al validar el show', 'Show validado correctamente', 'El show ha cambiado. Carga la última revisión e inténtalo de nuevo.', 'El servicio de shows está desconectado', 'El servicio de shows está ocupado', 'Definición de show no válida', 'Show no encontrado', 'El show está archivado', 'El renderizador de vista previa no está listo', 'Valida el show antes de publicarlo'],
    status: ['Inactivo', 'Show activo: {show}', '{count} en cola', ['Inactivo', 'Apertura', 'Desarrollo', 'Momento destacado', 'Calma', 'Transición', 'Pausa', 'Final']],
    runtime: ['Diagnóstico de fuegos artificiales: {message}', '{username} envió {giftName}', '¡Gracias por seguirnos, {username}!', 'Renderizador: {state} · {mode}'],
    editorial: ['Guardar ajustes', 'Haz clic en las formas para activarlas o desactivarlas para la selección aleatoria. Las formas seleccionadas tienen un borde dorado.', ['Calidad', 'Equilibrado', 'Rendimiento', 'Mínimo']],
    ui: ['L{launch} / E{bang} / C{crackle} ({total} {totalLabel})', 'Eliminar {color}', 'Listo', 'Inicializando', 'Desconectado', 'No disponible', 'Sin conexión', 'Audio listo', 'Audio bloqueado', 'Desconocido', 'Web Audio', 'Audio HTML', 'Ninguno', 'Cargado', 'Fallido', 'Inactivo', 'Reproduciendo', 'Desactivado', 'Total', 'Perdido', 'Expulsado', 'Sin eventos', 'Activo', 'Descartado']
  },
  fr: {
    shows: {
      'classic-crescendo': ['Crescendo classique', 'Des bouquets classiques et chaleureux montant vers une couronne dorée.'],
      'symmetric-salute': ['Salut symétrique', 'Des appels et réponses en miroir se terminant par un mur de salves.'],
      'sky-ballet': ['Ballet céleste', 'Des vols pastel croisés avec des accents spiralés et floraux.'],
      'thunder-finale': ['Final tonnerre', 'De lourdes salves dorées culminant en trois vagues de tonnerre.'],
      'nishiki-kamuro': ['Nishiki Kamuro', 'Pivoines bleues, chrysanthèmes dorés, longs saules et couronne de brocart Nishiki.'],
      'aurora-cathedral': ['Cathédrale boréale', 'Arches de comètes froides, voûtes crossette, scintillements argentés, palmes et saules.'],
      'royal-brocade': ['Brocart royal', 'Pistils rubis et émeraude, palmes, anneaux et mur de brocart baroque.'],
      'phoenix-ascension': ['Ascension du phénix', 'Mines, éventails d’ailes ascendantes, crossettes de braises et trois vagues finales.'],
      'furry-celebration': ['Célébration furry', 'Pattes, cœurs, renard, loup, ailes de dragon, dragon, queue et couronne arc-en-ciel.']
    },
    selector: ['Automatique (rotation)', 'Utiliser le réglage global', 'Shows intégrés', 'Shows personnalisés', 'Indisponible', 'Courte (10 s)', 'Moyenne (18 s)', 'Longue (28 s)'],
    superfan: ['Style du show', 'Durée du show', 'Activer les finales Superfan', 'Intensité de la finale', 'Tester la finale Superfan', 'Finale Superfan déclenchée !', 'Échec du déclenchement de la finale Superfan', 'Utiliser le réglage global'],
    designer: ['Concepteur de shows', 'Ouvrir le concepteur de shows', 'Créer un show', 'Enregistrer le brouillon', 'Valider', 'Publier', 'Dupliquer', 'Décliner les durées', 'Archiver', 'Restaurer', 'Importer un show', 'Exporter le show', 'Modifications non enregistrées', 'Brouillon', 'Validé', 'Publié', 'Archivé'],
    preview: ['Démarrage de l’aperçu', 'Aperçu en file', 'Aperçu en cours', 'Aperçu terminé', 'Aperçu arrêté', 'Échec de l’aperçu', 'Le moteur de rendu est hors ligne', 'Le moteur de rendu est occupé', 'L’état de l’aperçu est obsolète'],
    api: ['Échec de la validation du show', 'Show validé avec succès', 'Le show a changé. Rechargez la dernière révision et réessayez.', 'Le service de shows est hors ligne', 'Le service de shows est occupé', 'Définition de show invalide', 'Show introuvable', 'Le show est archivé', 'Le moteur d’aperçu n’est pas prêt', 'Validez le show avant de le publier'],
    status: ['Inactif', 'Show actif : {show}', '{count} en file', ['Inactif', 'Ouverture', 'Montée', 'Temps fort', 'Calme', 'Transition', 'Respiration', 'Final']],
    runtime: ['Diagnostic des feux d’artifice : {message}', '{username} a envoyé {giftName}', 'Merci pour votre abonnement, {username} !', 'Moteur de rendu : {state} · {mode}'],
    editorial: ['Enregistrer les paramètres', 'Cliquez sur les formes pour les activer ou les désactiver pour la sélection aléatoire. Les formes sélectionnées ont une bordure dorée.', ['Qualité', 'Équilibré', 'Performance', 'Minimal']],
    ui: ['L{launch} / E{bang} / C{crackle} ({total} {totalLabel})', 'Supprimer {color}', 'Prêt', 'Initialisation', 'Hors ligne', 'Indisponible', 'Non connecté', 'Audio prêt', 'Audio verrouillé', 'Inconnu', 'Web Audio', 'Audio HTML', 'Aucun', 'Chargé', 'Échec', 'Inactif', 'Lecture', 'Désactivé', 'Total', 'Manqué', 'Évincé', 'Aucun événement', 'Actif', 'Ignoré']
  }
};

const phaseIds = ['idle', 'opening', 'build', 'highlight', 'calm', 'bridge', 'breath', 'finale'];
const goalSelectorLabels = {
  en: ['Finale Show Style', 'Finale Length', 'Use global default', 'Auto', 'Short (10 s)', 'Medium (18 s)', 'Long (28 s)'],
  de: ['Finale-Showstil', 'Finale-Länge', 'Globalen Standard verwenden', 'Auto', 'Kurz (10 s)', 'Mittel (18 s)', 'Lang (28 s)'],
  es: ['Estilo del espectáculo final', 'Duración de la final', 'Usar valor global', 'Automático', 'Corta (10 s)', 'Media (18 s)', 'Larga (28 s)'],
  fr: ['Style du spectacle final', 'Durée de la finale', 'Utiliser le réglage global', 'Auto', 'Courte (10 s)', 'Moyenne (18 s)', 'Longue (28 s)']
};

const markerReplacements = [
  ['<title>WebGPU Fireworks - Settings</title>', '<title data-i18n="webgpu_fireworks.page_title">WebGPU Fireworks - Settings</title>'],
  ['<h2 class="text-lg font-bold text-cyan-200">WebGPU OBS required</h2>', '<h2 class="text-lg font-bold text-cyan-200" data-i18n="webgpu_fireworks.webgpu_obs_required">WebGPU OBS required</h2>'],
  ['<p class="text-sm text-cyan-50 mt-2">This plugin edition is intended exclusively for the Loggableim OBS WebGPU build. It is not supported in standard OBS.</p>', '<p class="text-sm text-cyan-50 mt-2" data-i18n="webgpu_fireworks.webgpu_obs_notice">This plugin edition is intended exclusively for the Loggableim OBS WebGPU build. It is not supported in standard OBS.</p>'],
  ['>Get the required OBS WebGPU build</a>', ' data-i18n="webgpu_fireworks.get_webgpu_build">Get the required OBS WebGPU build</a>'],
  ['>Copy origin</button>', ' data-i18n="webgpu_fireworks.copy_origin">Copy origin</button>'],
  ['>Test launch + explosion audio</button>', ' data-i18n="webgpu_fireworks.test_audio">Test launch + explosion audio</button>']
];

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  const output = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(source || {})) {
    output[key] = isObject(value) ? deepMerge(output[key], value) : value;
  }
  return output;
}

function canonicalDocument(document) {
  const currentPlugins = isObject(document.plugins) ? document.plugins : {};
  const currentMessages = isObject(currentPlugins[PLUGIN_ID])
    ? currentPlugins[PLUGIN_ID]
    : Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'plugins'));
  return { plugins: { ...currentPlugins, [PLUGIN_ID]: currentMessages } };
}

function additionsFor(language) {
  const source = translations[language];
  const shows = Object.fromEntries(Object.entries(source.shows).map(([id, values]) => [id, {
    title: values[0],
    description: values[1]
  }]));
  const selector = {
    auto: source.selector[0],
    inherit: source.selector[1],
    built_in: source.selector[2],
    custom: source.selector[3],
    unavailable: source.selector[4],
    length_short: source.selector[5],
    length_medium: source.selector[6],
    length_long: source.selector[7]
  };
  const phases = Object.fromEntries(phaseIds.map((id, index) => [id, source.status[3][index]]));
  return {
    shows,
    selector,
    superfan: {
      style: source.superfan[0], length: source.superfan[1], enabled: source.superfan[2],
      intensity: source.superfan[3], test: source.superfan[4], test_success: source.superfan[5],
      test_failed: source.superfan[6], global_default: source.superfan[7]
    },
    designer: {
      title: source.designer[0], navigation: source.designer[1], create: source.designer[2],
      save_draft: source.designer[3], validate: source.designer[4], publish: source.designer[5],
      duplicate: source.designer[6], derive_lengths: source.designer[7], archive: source.designer[8],
      restore: source.designer[9], import: source.designer[10], export: source.designer[11],
      unsaved_changes: source.designer[12], status_draft: source.designer[13],
      status_validated: source.designer[14], status_published: source.designer[15],
      status_archived: source.designer[16]
    },
    preview: {
      starting: source.preview[0], queued: source.preview[1], running: source.preview[2],
      complete: source.preview[3], stopped: source.preview[4], failed: source.preview[5],
      offline: source.preview[6], busy: source.preview[7], stale: source.preview[8]
    },
    api: {
      validation_failed: source.api[0], validation_success: source.api[1],
      revision_conflict: source.api[2], offline: source.api[3], busy: source.api[4],
      invalid_show: source.api[5], not_found: source.api[6], archived: source.api[7],
      preview_not_ready: source.api[8], publish_requires_validation: source.api[9]
    },
    status: {
      idle: source.status[0], active_show: source.status[1], queue_count: source.status[2], phases
    },
    runtime: {
      diagnostic: source.runtime[0], gift_popup: source.runtime[1],
      follow_thanks: source.runtime[2], renderer_debug: source.runtime[3],
      renderer_state_ready: source.ui[2], renderer_state_initializing: source.ui[3],
      renderer_state_offline: source.ui[4], renderer_state_unavailable: source.ui[5],
      performance_mode_quality: source.editorial[2][0], performance_mode_balanced: source.editorial[2][1],
      performance_mode_performance: source.editorial[2][2], performance_mode_minimal: source.editorial[2][3]
    },
    ui: {
      audio_voices: source.ui[0], remove_palette_color: source.ui[1],
      renderer_state_ready: source.ui[2], renderer_state_initializing: source.ui[3],
      renderer_state_offline: source.ui[4], renderer_state_unavailable: source.ui[5],
      not_connected: source.ui[6], audio_status_ready: source.ui[7],
      audio_status_locked: source.ui[8], audio_status_unknown: source.ui[9],
      audio_backend_webaudio: source.ui[10], audio_backend_htmlaudio: source.ui[11],
      audio_backend_none: source.ui[12], audio_backend_unknown: source.ui[9],
      loaded: source.ui[13], failed: source.ui[14], crackle_state_idle: source.ui[15],
      crackle_state_playing: source.ui[16], crackle_state_disabled: source.ui[17],
      crackle_state_unknown: source.ui[9], total: source.ui[18], missed: source.ui[19],
      evicted: source.ui[20], no_events: source.ui[21], active: source.ui[22],
      dropped: source.ui[23], none: source.ui[12], audio_peak_unit: 'dBFS'
    }
  };
}

function legacySettingsFor(language, additions) {
  const source = translations[language];
  return {
    save_settings: source.editorial[0],
    click_shapes_to_activate_deactivate_for_random_selection_selected_shapes_have_gold_border: source.editorial[1],
    finale_style_auto: additions.selector.auto,
    finale_global_default: additions.selector.inherit,
    finale_built_in_shows: additions.selector.built_in,
    finale_custom_shows: additions.selector.custom,
    finale_unavailable: additions.selector.unavailable,
    finale_length_short: additions.selector.length_short,
    finale_length_medium: additions.selector.length_medium,
    finale_length_long: additions.selector.length_long,
    finale_style_classic_crescendo: source.shows['classic-crescendo'][0],
    finale_style_symmetric_salute: source.shows['symmetric-salute'][0],
    finale_style_sky_ballet: source.shows['sky-ballet'][0],
    finale_style_thunder_finale: source.shows['thunder-finale'][0],
    finale_style_nishiki_kamuro: source.shows['nishiki-kamuro'][0],
    finale_style_aurora_cathedral: source.shows['aurora-cathedral'][0],
    finale_style_royal_brocade: source.shows['royal-brocade'][0],
    finale_style_phoenix_ascension: source.shows['phoenix-ascension'][0],
    finale_style_furry_celebration: source.shows['furry-celebration'][0],
    superfan_finale_style: source.superfan[0],
    superfan_finale_length: source.superfan[1],
    superfan_finale_test_success: source.superfan[5],
    superfan_finale_test_failed: source.superfan[6],
    open_show_designer: source.designer[1]
  };
}

function repairWebGpuFireworksI18n(options = {}) {
  const root = options.root || path.join(__dirname, '..');
  const page = path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'ui', 'settings.html');
  const localeDir = path.join(root, 'app', 'plugins', 'webgpu-fireworks', 'locales');
  const goalsLocaleDir = path.join(root, 'app', 'plugins', 'goals', 'locales');

  if (fs.existsSync(page)) {
    let html = fs.readFileSync(page, 'utf8');
    for (const [before, after] of markerReplacements) {
      if (!html.includes(after)) html = html.split(before).join(after);
    }
    fs.writeFileSync(page, html, 'utf8');
  }

  for (const language of languages) {
    const file = path.join(localeDir, `${language}.json`);
    const document = canonicalDocument(JSON.parse(fs.readFileSync(file, 'utf8')));
    const additions = additionsFor(language);
    let messages = deepMerge(document.plugins[PLUGIN_ID], additions);
    messages.webgpu_fireworks = deepMerge(messages.webgpu_fireworks, legacySettingsFor(language, additions));
    document.plugins[PLUGIN_ID] = messages;
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

    const goalsFile = path.join(goalsLocaleDir, `${language}.json`);
    if (fs.existsSync(goalsFile)) {
      const goals = JSON.parse(fs.readFileSync(goalsFile, 'utf8'));
      const modal = goals.goals?.modal || {};
      const source = translations[language];
      const goalLabels = goalSelectorLabels[language];
      Object.assign(modal, {
        firework_finale_style_label: goalLabels[0],
        firework_finale_length_label: goalLabels[1],
        firework_finale_global_default: goalLabels[2],
        firework_finale_style_auto: goalLabels[3],
        firework_finale_built_in_shows: additions.selector.built_in,
        firework_finale_custom_shows: additions.selector.custom,
        firework_finale_unavailable: additions.selector.unavailable,
        firework_finale_length_short: goalLabels[4],
        firework_finale_length_medium: goalLabels[5],
        firework_finale_length_long: goalLabels[6]
      });
      for (const [id, values] of Object.entries(source.shows)) {
        modal[`firework_finale_style_${id.replace(/-/g, '_')}`] = values[0];
      }
      fs.writeFileSync(goalsFile, `${JSON.stringify(goals, null, 2)}\n`, 'utf8');
    }
  }

  if (!options.silent) {
    console.log('WebGPU Fireworks locales normalized to plugins.webgpu-fireworks.');
  }
}

if (require.main === module) repairWebGpuFireworksI18n();

module.exports = {
  additionsFor,
  canonicalDocument,
  repairWebGpuFireworksI18n
};
